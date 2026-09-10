const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const hook = "  try { window.MacroBalanceShadow?.captureAndQueueCalculatorSubmission(); } catch (_shadowError) {}\n";
const lf = value => value.replace(/\r\n/g, '\n');

test('flag OFF performs zero shadow DOM, network, timer, telemetry, and snapshot work', () => {
  const counters = { dom: 0, fetch: 0, timer: 0, idle: 0, token: 0 };
  const window = {
    __MB_SHADOW_CONFIG__: { schemaVersion: 'shadow-public-config-v1', clientEnabled: false, killSwitch: true, sampleBps: 0 },
    fetch() { counters.fetch++; }, setTimeout() { counters.timer++; }, requestIdleCallback() { counters.idle++; },
    macroBalanceState: { user: { getIdToken() { counters.token++; } } },
  };
  const document = { getElementById() { counters.dom++; throw new Error('must not read DOM'); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/shadow-client.js'), 'utf8'), { window, document, Date, Object, Number });
  assert.equal(window.MacroBalanceShadow.captureAndQueueCalculatorSubmission(), false);
  assert.deepEqual(counters, { dom: 0, fetch: 0, timer: 0, idle: 0, token: 0 });
});

test('calculator hook is first and exception guarded while promotion remains isolated from Shadow', () => {
  const current = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const start = current.indexOf('function calcular(){');
  assert.ok(current.indexOf('MacroBalanceShadow', start) < current.indexOf('parseFloat', start));
  assert.doesNotMatch(current.slice(start, start + 200), /await/);
  assert.match(current, /STANDARD_PROMOTION_ENABLED/);
  assert.match(current, /calcularStandardPatch3/);
  assert.match(current, /MacroBalanceShadow\?\.captureAndQueueCalculatorSubmission\(\)/);
});

test('Production calculator core and engine remain at pre-promotion main', () => {
  // origin/main already contained the approved V2.2 foods taxonomy before the
  // PATCH3 promotion merge. Keep this integrity baseline anchored to that
  // exact pre-merge main commit rather than the older Shadow branch base.
  const productionBaseline = '9c51dccc09fae2d5fd8c2cf2c9ec094f447789b6';
  for (const relative of ['js/calculator-core.js', 'lib/menu-engine/engine.js']) {
    const current = lf(fs.readFileSync(path.join(root, relative), 'utf8'));
    const baseline = lf(execFileSync('git', ['show', `${productionBaseline}:${relative}`], { cwd: root, encoding: 'utf8' }));
    assert.equal(crypto.createHash('sha256').update(current).digest('hex'), crypto.createHash('sha256').update(baseline).digest('hex'), relative);
  }
});

test('dishes matches the authorized V2.2 migration baseline', () => {
  const current = lf(fs.readFileSync(path.join(root, 'lib/menu-engine/data/dishes.json'), 'utf8'));
  assert.equal(
    crypto.createHash('sha256').update(current).digest('hex'),
    'c735d4e4dcb662333bef65be7e2adba15f768b7f6f006ca7507b168885cb0728'
  );
});

test('server flag OFF exits before body, auth, PATCH3, harness, store, or alert', async () => {
  const { createShadowEvaluateHandler } = await import('../lib/shadow/shadow-http.mjs');
  const touched = [];
  const request = new Request('https://example.test/api/shadow-evaluate', { method: 'POST', body: '{"mustNotBeParsed":true}', headers: { origin: 'https://example.test', 'content-type': 'application/json' } });
  const explode = name => () => { touched.push(name); throw new Error(name); };
  const response = await createShadowEvaluateHandler({
    config: config({ serverEnabled: false, executionEnabled: false, disabledReasons: ['SERVER_FLAG_OFF'] }),
    verifyAuth: explode('auth'), minimize: explode('minimize'), map: explode('map'), verifyFrozen: explode('patch3'),
    runHarness: explode('harness'), datastore: { status: 'ISOLATED_DATASTORE_CONFIGURED', write: explode('store') },
    alertAdapter: { status: 'CONFIGURED', notify: explode('alert') },
  })(request);
  assert.equal(response.status, 202);
  assert.deepEqual(touched, []);
});

function config(overrides = {}) {
  return { integrationVersion: 'test', serverEnabled: true, killSwitch: false, sampleBps: 10000, executionEnabled: true,
    disabledReasons: [], allowedOrigin: 'https://example.test', maxBodyBytes: 32768, authProjectId: 'macrobalance-502bb',
    pseudonymSecret: 'a'.repeat(32), datastoreConfigured: true, ...overrides };
}
