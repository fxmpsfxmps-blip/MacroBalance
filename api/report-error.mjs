import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reportEvent } = require('../lib/server/monitoring/logger.cjs');
const { classifyUserAgent, requestIdFrom, requestInfo } = require('../lib/server/monitoring/request-info.cjs');
const { sanitizeText } = require('../lib/server/monitoring/sanitize.cjs');

const allowedFields = new Set(['eventType', 'message', 'path', 'source', 'line', 'column', 'stack', 'userAgent', 'timestamp']);
const limiter = new Map();
const limiterSalt = randomBytes(16).toString('hex');

function json(payload, status, requestId) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId } });
}

function rateKey(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  return createHash('sha256').update(`${limiterSalt}:${ip}`).digest('hex').slice(0, 16);
}

function rateLimited(request, now = Date.now()) {
  if (limiter.size > 1000) {
    for (const [storedKey, value] of limiter) {
      if (value.resetAt <= now) limiter.delete(storedKey);
    }
  }
  const key = rateKey(request);
  const current = limiter.get(key);
  if (!current || current.resetAt <= now) {
    limiter.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

function validNumber(value) {
  return value === null || value === undefined || (Number.isInteger(value) && value >= 0 && value <= 10_000_000);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Payload inválido.';
  if (Object.keys(payload).some(key => !allowedFields.has(key))) return 'El payload contiene campos no permitidos.';
  if (!['window.error', 'unhandledrejection'].includes(payload.eventType)) return 'eventType inválido.';
  if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 500) return 'message inválido.';
  const limits = { path: 200, source: 300, stack: 3000, userAgent: 300, timestamp: 50 };
  for (const [key, maximum] of Object.entries(limits)) {
    if (payload[key] !== undefined && typeof payload[key] !== 'string') return `${key} inválido.`;
    if (payload[key]?.length > maximum) return `${key} excede el tamaño permitido.`;
  }
  if (!validNumber(payload.line) || !validNumber(payload.column)) return 'Posición inválida.';
  return null;
}

export async function POST(request) {
  const requestId = requestIdFrom(request);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16_384) return json({ success: false, error: 'Payload demasiado grande.' }, 413, requestId);
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return json({ success: false, error: 'Origen no permitido.' }, 403, requestId);
    } catch {
      return json({ success: false, error: 'Origen inválido.' }, 403, requestId);
    }
  }
  if (rateLimited(request)) return json({ success: false, error: 'Demasiados reportes.' }, 429, requestId);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: 'El cuerpo debe ser JSON válido.' }, 400, requestId);
  }
  const validationError = validatePayload(payload);
  if (validationError) return json({ success: false, error: validationError }, 400, requestId);

  const info = requestInfo(request, requestId);
  await reportEvent({
    level: 'ERROR',
    message: sanitizeText(payload.message, 500),
    eventType: payload.eventType,
    endpoint: sanitizeText(payload.path || info.endpoint, 200),
    method: 'BROWSER',
    requestId,
    userAgent: sanitizeText(payload.userAgent || info.userAgent, 300),
    client: classifyUserAgent(payload.userAgent || info.userAgent),
    source: sanitizeText(payload.source || '', 300),
    line: payload.line ?? null,
    column: payload.column ?? null,
    stack: sanitizeText(payload.stack || '', 3000),
    reportedAt: sanitizeText(payload.timestamp || '', 50)
  });
  return json({ success: true, requestId }, 202, requestId);
}

export { rateLimited, validatePayload };
