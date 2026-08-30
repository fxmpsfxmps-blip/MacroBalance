const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function modules() {
  const [core, repository, trends, goals] = await Promise.all([
    import('../lib/longitudinal/longitudinal-core.mjs'),
    import('../lib/longitudinal/repository.mjs'),
    import('../lib/longitudinal/trend-utils.mjs'),
    import('../lib/longitudinal/goal-history-adapter.mjs'),
  ]);
  return { core, repository, trends, goals };
}

function weightInput(overrides = {}) {
  return {
    id: 'weight-1', ownerId: 'userA', type: 'WEIGHT', observedAt: '2026-08-01T12:00:00.000Z', kg: 80,
    ...overrides,
  };
}

function target() {
  return {
    schemaVersion: '2.1', calculationMode: 'standard', calculatorVersion: 'standard-patch3-protein-r1-2026-08-29',
    standardId: 'MACROBALANCE_STANDARD_PATCH3', standardFreezeId: 'MB_CANDIDATE_V1_PATCH3_L005_INPUT_CONTRACT_STABILIZATION_2026-08-28',
    kcal: 2400, proteina: 150, carbos: 250, grasa: 90,
  };
}

test('LONGITUDINAL_SCHEMA_V1 stores canonical kg/cm and rejects non-finite or negative measurements', async () => {
  const { core } = await modules();
  const weight = core.createWeightObservation(weightInput());
  assert.equal(weight.schemaVersion, core.LONGITUDINAL_SCHEMA_VERSION);
  assert.equal(weight.type, 'WEIGHT');
  assert.deepEqual(weight.payload, { kg: 80 });
  const waist = core.createBodyMeasurementObservation({ ...weightInput({ id: 'waist-1' }), measurementKey: 'waist', cm: 86 });
  assert.deepEqual(waist.payload, { measurementKey: 'waist', cm: 86 });
  assert.throws(() => core.createWeightObservation(weightInput({ kg: Infinity })), /LONGITUDINAL_NON_FINITE/);
  assert.throws(() => core.createWeightObservation(weightInput({ kg: -1 })), /LONGITUDINAL_NON_POSITIVE/);
  assert.throws(() => core.createBodyMeasurementObservation({ ...weightInput(), measurementKey: 'random_thing', cm: 20 }), /LONGITUDINAL_UNSUPPORTED_BODY_MEASUREMENT/);
});

test('subjective and adherence observations require an explicit versioned instrument; no 1–10 scale is assumed', async () => {
  const { core } = await modules();
  assert.throws(() => core.createSubjectiveObservation({ ...weightInput({ id: 'hunger-1' }), dimension: 'HUNGER', value: 4 }), /LONGITUDINAL_INSTRUMENT_REQUIRED/);
  const instrument = { id: 'owner-defined-hunger', version: '1', minimum: 0, maximum: 100, unit: 'PERCENT' };
  const hunger = core.createSubjectiveObservation({ ...weightInput({ id: 'hunger-2' }), dimension: 'HUNGER', value: 40, instrument });
  assert.equal(hunger.payload.instrument.maximum, 100);
  const adherence = core.createAdherenceObservation({ ...weightInput({ id: 'adh-1' }), metricId: 'self-report-completion', value: 1, instrument: { id: 'binary', version: '1', minimum: 0, maximum: 1 } });
  assert.equal(adherence.type, 'ADHERENCE');
});

test('service is append-only, idempotent per observation id, and rejects cross-user writes', async () => {
  const { repository } = await modules();
  const store = repository.createInMemoryLongitudinalStore();
  const userA = repository.createLongitudinalService({ ownerId: 'userA', store });
  const first = await userA.record(weightInput());
  const retry = await userA.record(weightInput());
  assert.equal(first.created, true);
  assert.equal(retry.idempotent, true);
  await assert.rejects(() => userA.record(weightInput({ ownerId: 'userB', id: 'forbidden' })), /LONGITUDINAL_OWNER_MISMATCH/);
  const userB = repository.createLongitudinalService({ ownerId: 'userB', store });
  assert.equal(await userB.get('weight-1'), null);
  await assert.rejects(() => userA.record(weightInput({ kg: 79 })), /LONGITUDINAL_IDEMPOTENCY_CONFLICT/);
});

test('correction creates a new revision and leaves the historical observation auditable', async () => {
  const { repository } = await modules();
  const store = repository.createInMemoryLongitudinalStore();
  const service = repository.createLongitudinalService({ ownerId: 'userA', store });
  await service.record(weightInput());
  const correction = await service.correct('weight-1', {
    id: 'weight-1-correction', kg: 79.6, observedAt: '2026-08-01T12:00:00.000Z',
  });
  assert.equal(correction.observation.supersedesId, 'weight-1');
  assert.equal(correction.observation.revision, 2);
  assert.equal((await service.get('weight-1')).payload.kg, 80);
  const active = await service.list({ type: 'WEIGHT' });
  const all = await service.list({ type: 'WEIGHT', includeSuperseded: true });
  assert.deepEqual(active.items.map(item => item.id), ['weight-1-correction']);
  assert.deepEqual(all.items.map(item => item.id), ['weight-1', 'weight-1-correction']);
});

test('chronological queries are deterministic, paginated, and retain missingness rather than inventing observations', async () => {
  const { repository } = await modules();
  const store = repository.createInMemoryLongitudinalStore();
  const service = repository.createLongitudinalService({ ownerId: 'userA', store });
  for (const [id, date, kg] of [['w3', '2026-08-03', 78], ['w1', '2026-08-01', 80], ['w2', '2026-08-02', 79]]) {
    await service.record(weightInput({ id, observedAt: `${date}T00:00:00.000Z`, kg }));
  }
  const first = await service.list({ type: 'WEIGHT', limit: 2 });
  const second = await service.list({ type: 'WEIGHT', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(first.items.map(item => item.id), ['w1', 'w2']);
  assert.deepEqual(second.items.map(item => item.id), ['w3']);
  assert.equal((await service.list({ type: 'SUBJECTIVE' })).items.length, 0);
});

test('target and plan records preserve versioned authority without recalculating macro values', async () => {
  const { core } = await modules();
  const snapshot = core.createNutritionTargetSnapshot({
    id: 'target-1', ownerId: 'userA', observedAt: 0,
    standard: { id: 'MACROBALANCE_STANDARD_PATCH3', version: target().calculatorVersion, freezeId: target().standardFreezeId, policyVersion: 'protein-policy-r1-2026-08-29' },
    nutritionTarget: target(), inputSnapshot: { weightKg: 80, trainingStatus: 'REALIZED_HABITUAL' }, sourceGoalId: 'goal-1',
  });
  assert.equal(snapshot.payload.target.kcal, 2400);
  assert.equal(snapshot.payload.calculator.standardId, 'MACROBALANCE_STANDARD_PATCH3');
  const plan = core.createPlanReference({ id: 'plan-ref-1', ownerId: 'userA', observedAt: 1, planId: 'session-plan-1', targetSnapshotId: 'target-1', generatorVersion: 'menu-engine-1', sourceGoalId: 'goal-1', planDigest: 'sha256_placeholder' });
  assert.equal(plan.payload.targetSnapshotId, 'target-1');
});

test('existing goals_history adapts to V3 target history without a destructive backfill', async () => {
  const { goals } = await modules();
  const history = goals.adaptGoalHistoryToTargetSnapshots({
    ownerId: 'userA',
    goals: [{ id: 'goal-1', startDateMs: 10, inputSnapshot: { weightKg: 80 }, nutritionTarget: target() }],
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].payload.sourceGoalId, 'goal-1');
});

test('trend utilities are descriptive, configurable, and return INSUFFICIENT_HISTORY rather than a policy', async () => {
  const { core, trends } = await modules();
  const only = core.createWeightObservation(weightInput());
  assert.equal(trends.describeWeightTrend([only]).state, 'INSUFFICIENT_HISTORY');
  const second = core.createWeightObservation(weightInput({ id: 'weight-2', observedAt: '2026-08-11T12:00:00.000Z', kg: 79 }));
  const trend = trends.describeWeightTrend([only, second], { from: '2026-08-01', to: '2026-08-12' });
  assert.equal(trend.changeKg, -1);
  assert.equal(trend.elapsedDays, 10);
  assert.equal(Object.hasOwn(trend, 'recommendedKcal'), false);
});

test('100, 1,000, and 5,000 synthetic records retain linear data processing semantics', async () => {
  const { core, trends } = await modules();
  for (const count of [100, 1000, 5000]) {
    const records = Array.from({ length: count }, (_, index) => core.createWeightObservation({
      id: `scale_${count}_${index}`, ownerId: 'scaleUser', observedAt: index * 86400000, kg: 100 - index / 1000,
    }));
    const trend = trends.describeWeightTrend(records);
    assert.equal(trend.observationCount, count);
    assert.equal(trend.firstObservedAtMs, 0);
    assert.equal(trend.lastObservedAtMs, (count - 1) * 86400000);
  }
});

test('longitudinal history is inert: 1,000 observations cannot alter a Standard NutritionTarget', async () => {
  const { repository } = await modules();
  const { calculatePatch3Standard } = await import('../lib/standard/patch3-standard-adapter.mjs');
  const profile = {
    profileId: 'v3-invariance', sex: 'MALE', age: 35, heightCm: 180, weightKg: 100,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN', goal: 'MAINTENANCE',
    occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9, stepsObservationDays: 7,
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE', sessionsPerWeek: 4,
    sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [], sleepHours: null, stressLevel: null,
    requestedRatePerWeek: null,
  };
  const before = calculatePatch3Standard(profile);
  const store = repository.createInMemoryLongitudinalStore();
  const service = repository.createLongitudinalService({ ownerId: 'userA', store });
  for (let index = 0; index < 1000; index += 1) {
    await service.record(weightInput({ id: `inert_${index}`, observedAt: index * 86400000, kg: 80 + index / 1000 }));
  }
  const after = calculatePatch3Standard(profile);
  assert.deepEqual(after, before);
});

test('feature flag defaults V3 longitudinal infrastructure to OFF and Firestore rules enforce append-only owner path semantics', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-static.js'), 'utf8');
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');
  assert.match(build, /V3_LONGITUDINAL_ENABLED, false/);
  assert.match(build, /v3-longitudinal-runtime-config\.js/);
  assert.match(rules, /match \/longitudinal_observations\/\{observationId\}/);
  assert.match(rules, /request\.resource\.data\.ownerId == userId/);
  assert.match(rules, /allow update, delete: if false/);
  assert.match(firebase, /async correctObservation\(previousId, correction\)/);
  assert.match(firebase, /PARTIAL_PAGED_HISTORY/);
  assert.doesNotMatch(firebase, /service\.all\(\{ direction: 'asc' \}\)/);
});
