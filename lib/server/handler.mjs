import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { run } = require('./menu-service.cjs');

export function createHandler(operation, method) {
  return async function handler(request) {
    if (request.method !== method) {
      return Response.json(
        { success: false, error: `Método ${request.method} no permitido.` },
        { status: 405, headers: { Allow: method } }
      );
    }

    let body = {};
    if (method !== 'GET') {
      try {
        body = await request.json();
      } catch {
        return Response.json(
          { success: false, error: 'El cuerpo debe ser JSON válido.' },
          { status: 400 }
        );
      }
    }

    const result = run(operation, body);
    return Response.json(result.payload, {
      status: result.status,
      headers: {
        'Cache-Control': operation === 'foods' ? 'public, max-age=3600' : 'no-store',
        'Server-Timing': `menu-engine;dur=${result.durationMs}`
      }
    });
  };
}
