import { createHandler } from '../lib/server/handler.mjs';

const handler = createHandler('fortnight', 'POST');

export function POST(request) {
  return handler(request);
}
