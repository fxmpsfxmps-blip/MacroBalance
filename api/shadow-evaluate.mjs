import { createShadowEvaluateHandler } from '../lib/shadow/shadow-http.mjs';

const handler = createShadowEvaluateHandler();
export function POST(request) { return handler(request); }
