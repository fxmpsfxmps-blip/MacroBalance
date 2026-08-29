import { createShadowHealthHandler } from '../lib/shadow/shadow-http.mjs';

const handler = createShadowHealthHandler();
export function GET(request) { return handler(request); }
