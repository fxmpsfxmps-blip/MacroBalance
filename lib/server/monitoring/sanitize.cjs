'use strict';

const SENSITIVE_KEY = /password|passcode|cookie|authorization|token|secret|api[-_]?key|webhook|credential|firebase/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const DISCORD_WEBHOOK = /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[^\s"']+/gi;
const TELEGRAM_TOKEN = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const SECRET_ASSIGNMENT = /\b(password|passcode|token|secret|api[-_]?key|authorization|firebase[-_]?token)\s*[:=]\s*[^\s,;&]+/gi;
const JWT_VALUE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function truncate(value, maximum = 1000) {
  const text = String(value ?? '');
  return text.length <= maximum ? text : `${text.slice(0, Math.max(0, maximum - 14))}…[truncated]`;
}

function sanitizeText(value, maximum = 1000) {
  return truncate(value, maximum)
    .replace(BEARER_VALUE, 'Bearer [redacted]')
    .replace(DISCORD_WEBHOOK, '[redacted-webhook]')
    .replace(TELEGRAM_TOKEN, '[redacted-token]')
    .replace(SECRET_ASSIGNMENT, '$1=[redacted]')
    .replace(JWT_VALUE, '[redacted-jwt]');
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[truncated-depth]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitizeValue(item, depth + 1));
  if (typeof value !== 'object') return sanitizeText(value);

  const clean = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    clean[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : sanitizeValue(item, depth + 1);
  }
  return clean;
}

function sanitizeError(error) {
  return {
    name: sanitizeText(error?.name || 'Error', 80),
    message: sanitizeText(error?.message || String(error || 'Error desconocido'), 500),
    stack: sanitizeText(error?.stack || '', 3000)
  };
}

module.exports = { sanitizeError, sanitizeText, sanitizeValue, truncate };
