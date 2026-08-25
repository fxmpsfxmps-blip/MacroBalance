import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { run } = require('./menu-service.cjs');
const { reportEvent } = require('./monitoring/logger.cjs');
const { requestIdFrom, requestInfo } = require('./monitoring/request-info.cjs');
const { sanitizeError } = require('./monitoring/sanitize.cjs');

export function createHandler(operation, method, options = {}) {
  const runOperation = options.run || run;
  const emit = options.reportEvent || reportEvent;
  return async function handler(request) {
    const startedAt = Date.now();
    const requestId = requestIdFrom(request);
    const info = requestInfo(request, requestId);
    if (request.method !== method) {
      return Response.json(
        { success: false, error: `Método ${request.method} no permitido.` },
        { status: 405, headers: { Allow: method, 'X-Request-ID': requestId } }
      );
    }

    let body = {};
    if (method !== 'GET') {
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { success: false, error: 'El cuerpo debe ser JSON válido.' },
          { status: 400, headers: { 'X-Request-ID': requestId } }
        );
      }
    }

    try {
      const result = runOperation(operation, body);
      const durationMs = Date.now() - startedAt;
      await emit({ level: 'INFO', message: 'API request', ...info, durationMs, status: result.status });
      if (result.status >= 500) {
        await emit({ level: 'ERROR', message: result.payload?.error || 'Error interno de API', ...info, durationMs, status: result.status });
      } else if (result.payload?.hard_exclusion_violation) {
        await emit({ level: 'WARNING', message: 'hard_exclusion_violation detectada', ...info, durationMs, status: result.status });
      }
      return Response.json(result.payload, {
        status: result.status,
        headers: {
          'Cache-Control': operation === 'foods' ? 'public, max-age=3600' : 'no-store',
          'Server-Timing': `menu-engine;dur=${result.durationMs}`,
          'X-Request-ID': requestId
        }
      });
    } catch (error) {
      const clean = sanitizeError(error);
      await emit({ level: 'CRITICAL', message: clean.message, stack: clean.stack, ...info, durationMs: Date.now() - startedAt, status: 500 });
      return Response.json({ success: false, error: 'Error interno al generar el plan.' }, { status: 500, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId } });
    }
  };
}
