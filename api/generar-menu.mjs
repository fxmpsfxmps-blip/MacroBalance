import { createHandler } from '../lib/server/handler.mjs';

const handler = createHandler('daily', 'POST');

export function POST(request) {
  return handler(request);
}
