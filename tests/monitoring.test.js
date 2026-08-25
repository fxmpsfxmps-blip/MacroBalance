const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const { reportEvent } = require('../lib/server/monitoring/logger.cjs');
const { sanitizeValue } = require('../lib/server/monitoring/sanitize.cjs');
const { sendDiscord } = require('../lib/server/monitoring/notifiers/discord.cjs');
const { sendTelegram } = require('../lib/server/monitoring/notifiers/telegram.cjs');

const quietConsole = { log() {}, warn() {}, error() {} };

test('sanitización central redacta secretos y limita estructuras', () => {
  const clean = sanitizeValue({
    password: 'never',
    authorization: 'Bearer abc.def',
    nested: { message: 'Bearer abc.def' },
    browserMessage: 'password=visible-value token=another-value',
    webhookUrl: 'https://discord.com/api/webhooks/123/secret'
  });
  assert.equal(clean.password, '[redacted]');
  assert.equal(clean.authorization, '[redacted]');
  assert.equal(clean.webhookUrl, '[redacted]');
  assert.equal(clean.nested.message, 'Bearer [redacted]');
  assert.equal(clean.browserMessage, 'password=[redacted] token=[redacted]');
});

test('Discord ERROR y Telegram CRITICAL generan requests backend estructurados', async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 204 };
  };
  const event = { level: 'ERROR', message: 'fallo controlado', timestamp: new Date().toISOString(), endpoint: '/api/test', method: 'POST', requestId: 'req-test' };
  await sendDiscord(event, { webhook: 'https://example.test/discord', fetchFn });
  await sendTelegram({ ...event, level: 'CRITICAL' }, { token: 'fake-token', chatId: 'fake-chat', fetchFn });
  assert.equal(calls.length, 2);
  assert.match(calls[0].options.body, /MacroBalance · ERROR/);
  assert.match(calls[1].options.body, /MacroBalance · CRITICAL/);
  assert.ok(JSON.parse(calls[1].options.body).text.length <= 4096);
});

test('fallos de Discord y Telegram nunca se propagan', async () => {
  const fail = async () => { throw new Error('notifier down'); };
  const result = await reportEvent(
    { level: 'CRITICAL', message: 'fallo controlado' },
    { consoleRef: quietConsole, sendDiscord: fail, sendTelegram: fail }
  );
  assert.equal(result.failed, 2);
});

test('monitor frontend captura error y unhandledrejection sin llamar servicios externos', async () => {
  const listeners = {};
  const reports = [];
  const window = {
    location: { pathname: '/plan' },
    navigator: { userAgent: 'Test Browser' },
    addEventListener(type, callback) { listeners[type] = callback; },
    fetch(url, options) { reports.push({ url, payload: JSON.parse(options.body) }); return Promise.resolve({ ok: true }); }
  };
  const source = fs.readFileSync(path.join(root, 'js', 'error-monitor.js'), 'utf8');
  vm.runInNewContext(source, { window });
  listeners.error({ message: 'frontend controlled', filename: '/test.js', lineno: 3, colno: 4, error: new Error('frontend controlled') });
  listeners.unhandledrejection({ reason: new Error('promise controlled') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reports.length, 2);
  assert.ok(reports.every(report => report.url === '/api/report-error'));
  assert.deepEqual(reports.map(report => report.payload.eventType), ['window.error', 'unhandledrejection']);
});

test('handler observa status 500, hard exclusion y excepción crítica', async () => {
  const { createHandler } = await import('../lib/server/handler.mjs');
  const events = [];
  const request = () => new Request('https://example.test/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const emit = async event => { events.push(event); };

  let handler = createHandler('test', 'POST', { run: () => ({ status: 500, payload: { success: false, error: 'controlled 500' }, durationMs: 1 }), reportEvent: emit });
  assert.equal((await handler(request())).status, 500);
  assert.ok(events.some(event => event.level === 'ERROR'));

  events.length = 0;
  handler = createHandler('test', 'POST', { run: () => ({ status: 200, payload: { hard_exclusion_violation: true }, durationMs: 1 }), reportEvent: emit });
  assert.equal((await handler(request())).status, 200);
  assert.ok(events.some(event => event.level === 'WARNING'));

  events.length = 0;
  handler = createHandler('test', 'POST', { run: () => { throw new Error('controlled exception'); }, reportEvent: emit });
  assert.equal((await handler(request())).status, 500);
  assert.ok(events.some(event => event.level === 'CRITICAL'));
});

test('endpoint frontend valida contrato y origen', async () => {
  const { POST, validatePayload } = await import('../api/report-error.mjs');
  assert.equal(validatePayload({ eventType: 'window.error', message: 'ok' }), null);
  assert.match(validatePayload({ eventType: 'window.error', message: 'ok', destination: 'https://evil.test' }), /campos no permitidos/);
  const request = new Request('https://macro.test/api/report-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.test' },
    body: JSON.stringify({ eventType: 'window.error', message: 'x' })
  });
  assert.equal((await POST(request)).status, 403);
});

test('build productivo incluye monitoring y no conecta Precision', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const plan = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const media = fs.readFileSync(path.join(root, 'multimedia.html'), 'utf8');
  assert.match(index, /\/js\/error-monitor\.js/);
  assert.match(plan, /\/js\/error-monitor\.js/);
  assert.match(media, /\/js\/error-monitor\.js/);
  assert.doesNotMatch(index, /calculator-core\.js/);
  assert.doesNotMatch(index, /mode-precision|precision-fields/);
});
