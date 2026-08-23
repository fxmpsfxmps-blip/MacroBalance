import { createHandler } from '../lib/server/handler.mjs';

const handler = createHandler('weekly', 'POST');

export function POST(request) {
  return handler(request);
}
