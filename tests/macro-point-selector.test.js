const test = require('node:test');
const assert = require('node:assert/strict');

async function adapter() {
  return import('../lib/standard/patch3-standard-adapter.mjs');
}

function profile(overrides = {}) {
  return {
    profileId: 'selector-test', sex: 'MALE', age: 35, heightCm: 180, weightKg: 100,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN',
    goal: 'MAINTENANCE', occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9,
    stepsObservationDays: 7, trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE',
    sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [],
    sleepHours: null, stressLevel: null, requestedRatePerWeek: null, ...overrides
  };
}

function endpoint(energyKcal, protein, fat, carbs) {
  return {
    energyKcal,
    authorizedRegion: {
      projectionIntervals: {
        protein: { lower: protein[0], upper: protein[1] },
        fat: { lower: fat[0], upper: fat[1] },
        carbs: { lower: carbs[0], upper: carbs[1] },
      },
    },
  };
}

test('unresolved scientific authority cannot produce an operative NutritionTarget', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(profile({
    trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null,
    sessionDurationMin: null, workload: null,
  }));
  const output = result.candidateOutputs[0].output;
  assert.equal(output.scientificStatus, 'UNRESOLVED_MISSING_INFORMATION');
  assert.equal(output.menuPermission, 'BLOCKED_BY_UNRESOLVED_MISSING_INFORMATION');
  assert.equal(result.status, 'PARTIAL_WITH_UNAVAILABLE_PLAN');
  assert.equal(result.selectedPlanId, null);
  assert.equal(result.plans[0].unavailable, true);
  assert.equal(result.plans[0].unavailableReason, 'UNRESOLVED_MISSING_INFORMATION');
  assert.equal(result.plans[0].nutritionTarget, null);
});

test('UNKNOWN/PARTIAL training missingness remains explicit and is not coerced to NONE', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(profile({
    trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null,
    sessionDurationMin: null, workload: null,
  }));
  const training = result.candidateOutputs[0].output.trace.input.validation.profile.trainingInput;
  assert.equal(training.state, 'PARTIAL_OR_UNKNOWN_TRAINING');
  assert.deepEqual(training.missingFields, [
    'trainingModality', 'sessionsPerWeek', 'sessionDurationMin', 'workload'
  ]);
  assert.equal(training.valuesImputed, false);
  assert.equal(result.plans[0].nutritionTarget, null);
});

test('numerically equivalent floating scores use the stable existing lower-protein tie-break', async () => {
  const { choosePoint } = await adapter();
  const result = choosePoint(endpoint(1623.2, [80, 120], [50, 78.13333333333334], [150, 213.3]));
  assert.ok(result);
  assert.equal(result.unrounded.protein, 80);
  assert.equal(result.unrounded.fat, 64.06666666666666);
  assert.ok(Math.abs(result.unrounded.distance - 20) < 1e-9);
});

test('0.1 kcal floating-noise sweep no longer oscillates between equivalent protein candidates', async () => {
  const { choosePoint } = await adapter();
  const cases = [
    endpoint(1623.1, [80, 120], [50, 78.1222222222222], [150, 213.27499999999998]),
    endpoint(1623.2, [80, 120], [50, 78.13333333333334], [150, 213.3]),
    endpoint(1623.3, [80, 120], [50, 78.14444444444445], [150, 213.325]),
  ];
  assert.deepEqual(cases.map(item => choosePoint(item).unrounded.protein), [80, 80, 80]);
});

test('1591.5 to 1591.6 boundary is reproducible but not misclassified as floating equivalence', async () => {
  const { choosePoint } = await adapter();
  const low = choosePoint(endpoint(1591.5, [80, 120], [50, 74.61111111111111], [150, 205.375]));
  const high = choosePoint(endpoint(1591.6, [80, 120], [50, 74.6222222222222], [150, 205.39999999999998]));
  assert.equal(low.unrounded.protein, 100);
  assert.equal(high.unrounded.protein, 80);
  assert.ok(Math.abs(low.unrounded.distance - high.unrounded.distance) > 1e-6);
});

test('ordinary midpoint-compatible profile output remains unchanged', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(profile());
  assert.deepEqual(
    (({ kcal, proteina, grasa, carbos }) => ({ kcal, proteina, grasa, carbos }))(result.plans[0]),
    { kcal: 3190, proteina: 146, grasa: 97, carbos: 433 }
  );
});

test('Production sentinel remains a non-regression case, not a calibration target', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(profile({
    profileId: 'sentinel-non-regression', age: 23, heightCm: 173, weightKg: 78,
    bodyFatPercent: 17, bodyFatMethod: 'DEXA', goal: 'LOSS', occupation: 'STANDING_WALKING',
    steps: 7500, trainingModality: 'RESISTANCE', sessionsPerWeek: 4,
    sessionDurationMin: 60, workload: 'MODERATE',
  }));
  assert.deepEqual(
    (({ kcal, proteina, grasa, carbos }) => ({ kcal, proteina, grasa, carbos }))(result.plans[0]),
    { kcal: 2505, proteina: 117, grasa: 77, carbos: 336 }
  );
});
