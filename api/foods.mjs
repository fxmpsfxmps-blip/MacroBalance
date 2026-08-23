import { createHandler } from '../lib/server/handler.mjs';

const handler = createHandler('foods', 'GET');

export function GET(request) {
  return handler(request);
}
