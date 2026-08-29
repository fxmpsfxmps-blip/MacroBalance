const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SECRET = 's'.repeat(32);

function config(overrides = {}) {
  return { integrationVersion: 'test', serverEnabled: true, killSwitch: false, sampleBps: 10000, executionEnabled: true,
    disabledReasons: [], allowedOrigin: 'https://example.test', maxBodyBytes: 32768, authProjectId: 'macrobalance-502bb',
    pseudonymSecret: SECRET, datastoreConfigured: true, healthToken: 'health-secret', ...overrides };
}
function raw(fields = {}) {
  const f = value => ({ state: value === '' ? 'EMPTY' : 'PRESENT', value });
  return { schemaVersion: 'shadow_raw_v1', calculatorMode: f('precision'), fields: {
    sex: f('H'), age: f('35'), heightCm: f('180'), weightKg: f('100'), objectiveIndex: f('1'),
    precisionTrainingType: f('none'), precisionCardioType: f('none'), ...fields,
  } };
}
function request(body = raw(), overrides = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { origin: 'https://example.test', 'content-type': 'application/json', authorization: 'Bearer test', 'content-length': String(Buffer.byteLength(text)), ...(overrides.headers || {}) };
  return new Request('https://example.test/api/shadow-evaluate', { method: 'POST', headers: { ...headers, ...(overrides.headers || {}) }, body: text });
}
async function invoke(handler, req) { const result = await handler(req); return { statusCode: result.status, body: await result.json() }; }
function goodDeps(overrides = {}) {
  const writes = [];
  return { config: config(), verifyAuth: async () => ({ uid: 'real-uid-never-persisted' }),
    verifyFrozen: async () => ({ status: 'VERIFIED', candidateFreezeId: 'PATCH3', manifestHash: 'abc' }),
    verifyIntegrity: async () => ({ status: 'PASS', failures: [] }),
    createRunner: async () => async () => ({ scientificStatus: 'PARTIAL', menuEligible: false }),
    runHarness: async () => ({ status: 'PROCESSED', stopRecommended: false, stopConditions: [] }),
    datastore: { status: 'ISOLATED_DATASTORE_CONFIGURED', async write(collection, record) { writes.push({ collection, record }); }, async disable() {} },
    alertAdapter: { status: 'INJECTED', async notify() {} }, writes, ...overrides };
}

test('strict configuration defaults all shadow execution OFF', async () => {
  const { readServerShadowConfig, readPublicShadowConfig } = await import('../lib/shadow/shadow-config.mjs');
  const server = readServerShadowConfig({ MB_SHADOW_SERVER_ENABLED: 'garbage', MB_SHADOW_KILL_SWITCH: 'garbage', MB_SHADOW_SAMPLE_BPS: 'NaN' });
  const client = readPublicShadowConfig({ MB_SHADOW_CLIENT_ENABLED: 'garbage', MB_SHADOW_KILL_SWITCH: 'garbage', MB_SHADOW_SAMPLE_BPS: 'NaN' });
  assert.equal(server.executionEnabled, false); assert.equal(server.killSwitch, true); assert.equal(server.sampleBps, 0);
  assert.equal(client.clientEnabled, false); assert.equal(client.killSwitch, true); assert.equal(client.sampleBps, 0);
});

test('mapper preserves unknown training and never creates NONE/0/0/LOW', async () => {
  const { minimizeRawPayload, mapProductionRawToPatch3 } = await import('../lib/shadow/shadow-mapper.mjs');
  const mapped = mapProductionRawToPatch3(minimizeRawPayload(raw({ precisionTrainingType: { state: 'EMPTY', value: '' }, precisionCardioType: { state: 'EMPTY', value: '' } })), { receiptId: 'x', pseudonymousParticipantId: 'p' });
  assert.equal(mapped.patch3Input.trainingModality, null);
  assert.equal(mapped.patch3Input.sessionsPerWeek, null);
  assert.equal(mapped.patch3Input.sessionDurationMin, null);
  assert.equal(mapped.patch3Input.workload, null);
  assert.equal(mapped.valuesImputed, false);
});

test('raw minimizer excludes identity, water, menus, history, and goals', async () => {
  const { minimizeRawPayload } = await import('../lib/shadow/shadow-mapper.mjs');
  const minimized = minimizeRawPayload({ ...raw(), name: 'Ada', email: 'a@b.c', firebaseUid: 'uid', water: '2L', menuSelections: ['x'], savedGoals: ['x'] });
  const text = JSON.stringify(minimized);
  for (const forbidden of ['Ada', 'a@b.c', 'uid', '2L']) assert.equal(text.includes(forbidden), false);
});

test('pseudonym is stable keyed HMAC and raw UID is absent from persisted records', async () => {
  const { pseudonymizeUid } = await import('../lib/shadow/shadow-auth.mjs');
  assert.deepEqual(pseudonymizeUid('uid', SECRET), pseudonymizeUid('uid', SECRET));
  assert.notEqual(pseudonymizeUid('uid', SECRET).pseudonymousParticipantId, pseudonymizeUid('uid', 'x'.repeat(32)).pseudonymousParticipantId);
  const { createShadowEvaluateHandler } = await import('../lib/shadow/shadow-http.mjs');
  const deps = goodDeps(); const res = await invoke(createShadowEvaluateHandler(deps), request());
  assert.equal(res.statusCode, 202); assert.equal(res.body.accepted, true);
  assert.equal(JSON.stringify(deps.writes).includes('real-uid-never-persisted'), false);
  assert.equal(deps.writes.length, 2);
});

test('retention metadata is explicit and proposed', async () => {
  const { withRetention } = await import('../lib/shadow/shadow-store.mjs');
  const record = withRetention({ x: 1 }, 'raw', Date.UTC(2026, 0, 1));
  assert.equal(record.retentionPolicy, 'PROPOSED_OPERATIONAL_POLICY');
  assert.equal(record.expiresAt, '2026-01-08T00:00:00.000Z');
});

test('Production datastore project and paths are refused', async () => {
  const { assertIsolatedDatastore } = await import('../lib/shadow/shadow-store.mjs');
  assert.throws(() => assertIsolatedDatastore({ projectId: 'macrobalance-502bb', pathPrefix: 'shadow' }), /PRODUCTION_DATASTORE_PROJECT_REFUSED/);
  assert.throws(() => assertIsolatedDatastore({ projectId: 'isolated', pathPrefix: 'users/shadow' }), /PRODUCTION_DATA_PATH_REFUSED/);
});

test('frozen PATCH3 manifest and all 28 sources verify', async () => {
  const { verifyFrozenPatch3 } = await import('../lib/shadow/frozen-patch3-verifier.mjs');
  const result = await verifyFrozenPatch3(); assert.equal(result.status, 'VERIFIED'); assert.equal(result.fileCount, 28);
});

test('real frozen PATCH3 runner executes the validated ordinary resistance profile', async () => {
  const { createVerifiedFrozenPatch3Runner } = await import('../lib/shadow/frozen-patch3-verifier.mjs');
  const { correctedOwnerBenchmarkProfile } = await import('../lib/shadow/frozen-patch3/benchmarks/profiles.js');
  const runner = await createVerifiedFrozenPatch3Runner();
  const output = await runner(correctedOwnerBenchmarkProfile);
  assert.equal(runner.realRunnerUsed, true);
  assert.equal(output.challengerVersion, 'SCIENTIFIC_CHALLENGER_V1_B4_SHADOW_PATCH3');
  assert.equal(output.inputProvenance.trainingInputState, 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING');
  assert.equal(output.productionEligible, false);
});

test('static Production-authority import tripwire passes', async () => {
  const { verifyNoProductionAuthorityImports } = await import('../lib/shadow/shadow-integrity.mjs');
  assert.deepEqual((await verifyNoProductionAuthorityImports()).failures, []);
});

test('endpoint rejects origin, content type, missing auth, invalid auth, and oversized payload', async t => {
  const { createShadowEvaluateHandler } = await import('../lib/shadow/shadow-http.mjs');
  const cases = [
    ['origin', request(raw(), { headers: { origin: 'https://evil.test' } }), goodDeps(), 403],
    ['content', request(raw(), { headers: { 'content-type': 'text/plain' } }), goodDeps(), 415],
    ['missing auth', request(), goodDeps({ verifyAuth: async () => { const e = new Error('SHADOW_AUTH_TOKEN_REQUIRED'); e.status = 401; throw e; } }), 401],
    ['invalid auth', request(), goodDeps({ verifyAuth: async () => { const e = new Error('SHADOW_AUTH_TOKEN_INVALID'); e.status = 401; throw e; } }), 401],
    ['large', request(raw(), { headers: { 'content-length': '999999' } }), goodDeps(), 413],
  ];
  for (const [name, req, deps, status] of cases) await t.test(name, async () => { const res = await invoke(createShadowEvaluateHandler(deps), req); assert.equal(res.statusCode, status); assert.equal(res.body.accepted, false); });
});

test('endpoint isolates malformed JSON and all injected pipeline failures', async t => {
  const { createShadowEvaluateHandler } = await import('../lib/shadow/shadow-http.mjs');
  const failures = [
    ['mapper', goodDeps({ map() { throw new Error('SHADOW_MAPPING_ERROR'); } }), request()],
    ['manifest', goodDeps({ verifyFrozen: async () => { throw new Error('FROZEN_MANIFEST_MISMATCH'); } }), request()],
    ['patch3', goodDeps({ createRunner: async () => async () => { throw new Error('PATCH3_EXCEPTION'); } }), request()],
    ['harness', goodDeps({ runHarness: async () => { throw new Error('HARNESS_EXCEPTION'); } }), request()],
    ['store', goodDeps({ datastore: { status: 'ISOLATED_DATASTORE_CONFIGURED', async write() { throw new Error('STORE_EXCEPTION'); }, async disable() {} } }), request()],
    ['alert', goodDeps({ runHarness: async () => ({ status: 'ERROR', stopRecommended: true, stopConditions: [{ code: 'X', severity: 'CRITICAL' }] }), alertAdapter: { status: 'X', async notify() { throw new Error('ALERT_EXCEPTION'); } } }), request()],
  ];
  for (const [name, deps, req] of failures) await t.test(name, async () => { const res = await invoke(createShadowEvaluateHandler(deps), req); assert.equal(res.statusCode, 202); assert.equal(res.body.accepted === false || res.body.shadowStatus === 'ACCEPTED_AND_STOPPED', true); });
  const malformedResponse = await invoke(createShadowEvaluateHandler(goodDeps()), request('{oops'));
  assert.equal(malformedResponse.statusCode, 400); assert.equal(malformedResponse.body.accepted, false);
});

test('kill switch and sample zero win before any endpoint execution', async () => {
  const { createShadowEvaluateHandler } = await import('../lib/shadow/shadow-http.mjs');
  for (const cfg of [config({ killSwitch: true, executionEnabled: false, disabledReasons: ['KILL_SWITCH_ON'] }), config({ sampleBps: 0, executionEnabled: false, disabledReasons: ['SAMPLE_BPS_ZERO'] })]) {
    const res = await invoke(createShadowEvaluateHandler({ config: cfg, verifyAuth: () => { throw new Error('called'); } }), request());
    assert.equal(res.statusCode, 202); assert.equal(res.body.shadowStatus, 'DISABLED');
  }
});

test('health endpoint is protected and emits operational metadata only', async () => {
  const { createShadowHealthHandler } = await import('../lib/shadow/shadow-http.mjs');
  const handler = createShadowHealthHandler({ config: config(), verifyFrozen: async () => ({ candidateFreezeId: 'PATCH3', manifestHash: 'hash' }), harnessIntegrity: async () => ({ sha256: 'h' }) });
  let res = await invoke(handler, new Request('https://example.test/api/shadow-health', { headers: {} })); assert.equal(res.statusCode, 401);
  res = await invoke(handler, new Request('https://example.test/api/shadow-health', { headers: { authorization: 'Bearer health-secret' } })); assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body).includes('nutrition'), false); assert.equal(JSON.stringify(res.body).includes(SECRET), false);
});

test('Vercel-style Web Request endpoint preserves flag-off behavior', async () => {
  const { createShadowEvaluateHandler } = await import('../lib/shadow/shadow-http.mjs');
  const result = await createShadowEvaluateHandler({ config: config({ serverEnabled: false, executionEnabled: false, disabledReasons: ['SERVER_FLAG_OFF'] }) })(
    new Request('https://example.test/api/shadow-evaluate', { method: 'POST', body: '{"secret":"never-read"}', headers: { origin: 'https://example.test', 'content-type': 'application/json' } })
  );
  assert.equal(result.status, 202); assert.equal((await result.json()).shadowStatus, 'DISABLED');
});

test('real Vercel evaluate entrypoint returns a Web Response with flags OFF', async () => {
  const { POST } = await import('../api/shadow-evaluate.mjs');
  const result = await POST(new Request('https://example.test/api/shadow-evaluate', { method: 'POST', headers: { origin: 'https://example.test', 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(result instanceof Response, true); assert.equal(result.status, 202);
  assert.equal((await result.json()).shadowStatus, 'DISABLED');
});

test('real Vercel health entrypoint returns a protected Web Response', async () => {
  const { GET } = await import('../api/shadow-health.mjs');
  const result = await GET(new Request('https://example.test/api/shadow-health', { method: 'GET' }));
  assert.equal(result instanceof Response, true); assert.equal(result.status, 401);
});

test('dist public config is OFF and contains no server secret variable names', () => {
  const source = fs.readFileSync(path.join(root, 'dist/js/shadow-runtime-config.js'), 'utf8');
  assert.match(source, /"clientEnabled":false/); assert.match(source, /"killSwitch":true/); assert.match(source, /"sampleBps":0/);
  for (const name of ['PSEUDONYM_SECRET', 'DATASTORE_TOKEN', 'HEALTH_TOKEN', 'ALERT_DESTINATION']) assert.equal(source.includes(name), false);
});
