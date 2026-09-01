const test = require('node:test');
const assert = require('node:assert/strict');

async function adapter() {
  return import('../lib/standard/patch3-standard-adapter.mjs');
}

async function lowBodyPolicy() {
  return import('../lib/standard/low-body-size-policy-r1.mjs');
}

// This is the 8,000-step compatibility sentinel. It is intentionally not the
// production-equivalent 2,000-step case declared below.
function f23EightThousandSteps(overrides = {}) {
  return {
    profileId: 'F23-low-body-muscle-gain-r1',
    sex: 'FEMALE', age: 23, heightCm: 153, weightKg: 42.5,
    bodyFatPercent: 21, bodyFatSource: 'VISUAL', bodyFatQuality: 'UNKNOWN',
    goal: 'MUSCLE_GAIN', occupation: 'STANDING_WALKING',
    steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    stepsRepresentativeness: 'MOSTLY_CONSISTENT',
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE',
    sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE',
    scopeFlags: [], sleepHours: null, stressLevel: null, requestedRatePerWeek: null,
    ...overrides,
  };
}

function productionEquivalentLowStepFixture(overrides = {}) {
  return {
    profileId: 'production-equivalent-low-step-muscle-gain-sentinel',
    sex: 'FEMALE', age: 23, heightCm: 153, weightKg: 43,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN', bodyFatMethod: null,
    goal: 'MUSCLE_GAIN', occupation: 'STANDING_WALKING',
    steps: 2000, stepsCoverage: null, stepsObservationDays: 7,
    stepsRepresentativeness: 'MOSTLY_CONSISTENT',
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE',
    sessionsPerWeek: 4, sessionDurationMin: 66, workload: 'MODERATE',
    scopeFlags: [], sleepHours: null, stressLevel: null, requestedRatePerWeek: null,
    activityClass: null, activityClassSource: null, requestedRateLabel: null,
    dietPreference: null, lowCarbPreference: null, dietPattern: null,
    longestSessionMinutes: 66, twoADay: null,
    ...overrides,
  };
}

const NO_NO = Object.freeze({ lowBodySizeAnswers: { q1: 'NO', q2: 'NO' } });
const macro = plan => ({ kcal: plan.kcal, proteina: plan.proteina, grasa: plan.grasa, carbos: plan.carbos });

function output(result) { return result.candidateOutputs[0].output; }

test('F23 routing order preserves A1/B1 before the low-body R1 release', async () => {
  const { calculatePatch3Standard } = await adapter();

  const fourDay = calculatePatch3Standard(f23EightThousandSteps({ stepsObservationDays: 4 }), NO_NO);
  assert.equal(output(fourDay).trace.A2_A3.b1.status, 'REQUEST_INFORMATION');
  assert.equal(fourDay.plans[0].nutritionTarget, null);
  assert.equal(fourDay.status, 'PARTIAL_WITH_UNAVAILABLE_PLAN');

  const variable = calculatePatch3Standard(f23EightThousandSteps({ stepsRepresentativeness: 'VARIABLE' }), NO_NO);
  assert.equal(output(variable).trace.A2_A3.b1.status, 'REQUEST_INFORMATION');
  assert.equal(variable.plans[0].nutritionTarget, null);

  const missing = calculatePatch3Standard(f23EightThousandSteps());
  assert.equal(output(missing).lowBodySizePolicy.status, 'UNRESOLVED');
  assert.equal(missing.plans[0].unavailableReason, 'LOW_BODY_SIZE_PREFLIGHT_INFORMATION_MISSING');
  assert.equal(missing.plans[0].nutritionTarget, null);

  const reported = calculatePatch3Standard(f23EightThousandSteps(), { lowBodySizeAnswers: { q1: 'YES', q2: 'NO' } });
  assert.equal(output(reported).lowBodySizePolicy.status, 'PROFESSIONAL_HANDOFF');
  assert.equal(reported.plans[0].unavailableReason, 'LOW_BODY_SIZE_UNINTENTIONAL_WEIGHT_CHANGE_REPORTED');
  assert.equal(reported.plans[0].nutritionTarget, null);
});

test('F23 8,000-step / 7-day consistent Q1/Q2 NO/NO remains the 2037 compatibility sentinel', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(f23EightThousandSteps(), NO_NO);
  const plan = result.plans[0];
  const out = output(result);

  assert.equal(out.trace.A1.inference.status, 'ADJACENT_CLASS_ENVELOPE');
  assert.equal(out.trace.A2_A3.b1.status, 'PASS');
  assert.equal(result.muscleGain.status, 'MUSCLE_GAIN_ELIGIBLE');
  assert.equal(out.lowBodySizePolicy.status, 'PREFLIGHT_CLEARED');
  assert.equal(out.targetContract.protein.referenceAnchor.method, 'CURRENT_BODY_WEIGHT_LOW_BODY_SIZE_R1_REASONABLE_DEFAULT');
  assert.equal(out.targetContract.protein.referenceAnchor.valueKg, 42.5);
  assert.equal(out.targetContract.protein.referenceAnchor.isBiologicalTruth, false);
  assert.equal(out.targetContract.protein.contexts.preferredDensityRange[0], 1.4);
  assert.equal(out.targetContract.protein.contexts.preferredDensityRange[1], 1.6);
  assert.deepEqual(macro(plan), { kcal: 2037, proteina: 64, grasa: 62, carbos: 306 });
  assert.equal(plan.nutritionTarget.lowBodySizeContext.caution, 'LOW_BODY_SIZE_CAUTION');
  assert.equal(plan.nutritionTarget.lowBodySizeContext.recommendation, 'STRONG_PROFESSIONAL_RECOMMENDATION');
  assert.equal(plan.nutritionTarget.lowBodySizeContext.medicalClearanceClaimed, false);
});

test('production-equivalent 2,000-step / 4 x 66 min sentinel remains distinct from the 8,000-step sentinel', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(productionEquivalentLowStepFixture(), NO_NO);
  const plan = result.plans[0];
  const out = output(result);

  assert.equal(out.trace.A2_A3.b1.status, 'PASS');
  assert.equal(result.muscleGain.status, 'MUSCLE_GAIN_ELIGIBLE');
  assert.equal(out.lowBodySizePolicy.status, 'PREFLIGHT_CLEARED');
  assert.deepEqual(macro(plan), { kcal: 1892, proteina: 65, grasa: 58, carbos: 278 });
  assert.ok(Math.abs(plan.patch3.teeRange[0] - 1802.36) < 1e-9);
  assert.ok(Math.abs(plan.patch3.teeRange[1] - 2080.26) < 1e-9);
  assert.ok(Math.abs(plan.patch3.targetRange[0] - 1892.478) < 1e-9);
  assert.ok(Math.abs(plan.patch3.targetRange[1] - 2288.286) < 1e-9);
});

test('controlled 42.5 kg / 2,000-step / 4 x 60 min variant remains the 1886 contrast sentinel', async () => {
  const { calculatePatch3Standard } = await adapter();
  const result = calculatePatch3Standard(productionEquivalentLowStepFixture({
    profileId: 'controlled-42-5kg-low-step-muscle-gain-sentinel',
    weightKg: 42.5,
    bodyFatPercent: 21,
    bodyFatSource: 'VISUAL',
    bodyFatQuality: 'UNKNOWN',
    bodyFatMethod: 'VISUAL',
    sessionDurationMin: 60,
    longestSessionMinutes: 60,
  }), NO_NO);

  assert.deepEqual(macro(result.plans[0]), { kcal: 1886, proteina: 64, grasa: 58, carbos: 277 });
});

test('BMI boundary changes policy context only; it does not introduce a new dosage surface', async () => {
  const { calculatePatch3Standard } = await adapter();
  const { evaluateLowBodySizePolicyR1 } = await lowBodyPolicy();
  const atBoundary = calculatePatch3Standard(f23EightThousandSteps({ goal: 'GAIN', weightKg: 41.625, heightCm: 150 }), NO_NO);
  const justBelow = calculatePatch3Standard(f23EightThousandSteps({ goal: 'GAIN', weightKg: 41.624, heightCm: 150 }), NO_NO);
  const atOutput = output(atBoundary);
  const belowOutput = output(justBelow);

  assert.equal(evaluateLowBodySizePolicyR1(f23EightThousandSteps({ goal: 'GAIN', weightKg: 41.625, heightCm: 150 }), NO_NO.lowBodySizeAnswers).applicable, false);
  assert.equal(evaluateLowBodySizePolicyR1(f23EightThousandSteps({ goal: 'GAIN', weightKg: 41.624, heightCm: 150 }), NO_NO.lowBodySizeAnswers).status, 'PREFLIGHT_CLEARED');
  assert.equal(atOutput.targetContract.protein.referenceAnchor.valueKg, 41.625);
  assert.equal(belowOutput.targetContract.protein.referenceAnchor.valueKg, 41.624);
  assert.ok(Math.abs(atBoundary.plans[0].proteina - justBelow.plans[0].proteina) <= 1);
  assert.ok(Math.abs(atBoundary.plans[0].kcal - justBelow.plans[0].kcal) <= 1);
});

test('ordinary 43 kg / 150 cm generic gain stays identical because it is outside the R1 low-body domain', async () => {
  const { calculatePatch3Standard } = await adapter();
  const { evaluateLowBodySizePolicyR1 } = await lowBodyPolicy();
  const profile = f23EightThousandSteps({ goal: 'GAIN', weightKg: 43, heightCm: 150 });
  const base = calculatePatch3Standard(profile, { lowBodySizePolicyEnabled: false });
  const candidate = calculatePatch3Standard(profile, NO_NO);
  assert.equal(evaluateLowBodySizePolicyR1(profile, NO_NO.lowBodySizeAnswers).applicable, false);
  assert.deepEqual(macro(candidate.plans[0]), macro(base.plans[0]));
  assert.equal(candidate.plans[0].nutritionTarget.lowBodySizeContext, undefined);
});

test('R1 never revives Precision or changes a disabled-policy comparison path', async () => {
  const { calculatePatch3Standard } = await adapter();
  const input = f23EightThousandSteps({ weightKg: 40, heightCm: 150, goal: 'GAIN' });
  const disabled = calculatePatch3Standard(input, { lowBodySizePolicyEnabled: false });
  const cleared = calculatePatch3Standard(input, NO_NO);
  assert.equal(disabled.plans[0].unavailableReason, 'UNRESOLVED_PHYSIOLOGY');
  assert.ok(cleared.plans[0].nutritionTarget);
  assert.doesNotMatch(JSON.stringify(cleared), /precision-calculator|calculatePrecision/i);
});
