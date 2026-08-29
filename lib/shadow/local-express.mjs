import { createShadowEvaluateHandler, createShadowHealthHandler } from './shadow-http.mjs';

export function createLocalShadowHandlers(dependencies = {}) {
  return Object.freeze({
    evaluate: createShadowEvaluateHandler(dependencies),
    health: createShadowHealthHandler(dependencies),
  });
}

export async function invokeLocalWebHandler(handler, request, response) {
  const headers = new Headers(request.headers || {});
  const init = { method: request.method, headers };
  if (request.method !== 'GET' && request.method !== 'HEAD') { init.body = request.body; init.duplex = 'half'; }
  const webResponse = await handler(new Request(`http://${headers.get('host') || 'localhost'}${request.originalUrl || request.url || '/'}`, init));
  response.status(webResponse.status);
  webResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.send(await webResponse.text());
}
