const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function modules() {
  const [adapter, resolution, preflight] = await Promise.all([
    import('../lib/standard/patch3-standard-adapter.mjs'),
    import('../lib/standard/standard-resolution-ux.mjs'),
    import('../lib/standard/standard-intake-preflight.mjs')
  ]);
  return { adapter, resolution, preflight };
}

function profile(overrides = {}) {
  return {
    profileId: 'muscle-gain-intent-test', sex: 'FEMALE', age: 20, heightCm: 150, weightKg: 43,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN', goal: 'MUSCLE_GAIN',
    occupation: 'SEATED', steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'NONE', sessionsPerWeek: 0,
    sessionDurationMin: 0, workload: 'LOW', scopeFlags: [], sleepHours: null,
    stressLevel: null, requestedRatePerWeek: null, ...overrides
  };
}

function macro(plan) {
  return { kcal: plan.kcal, proteina: plan.proteina, grasa: plan.grasa, carbos: plan.carbos };
}

test('MUSCLE_GAIN is recognized before generic normalization and cannot fall back to maintenance or GAIN', async () => {
  const { adapter } = await modules();
  const result = adapter.calculatePatch3Standard(profile());
  assert.equal(result.preferredGoal, 'MUSCLE_GAIN');
  assert.equal(result.candidateOutputs[0].goal, 'MUSCLE_GAIN');
  assert.notEqual(result.preferredGoal, 'MAINTENANCE');
  assert.notEqual(result.preferredGoal, 'GAIN');
  assert.equal(result.plans[0].unavailableReason, 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED');
});

test('MUSCLE_GAIN unknown training remains unresolved with a specific message and no target', async () => {
  const { adapter, resolution } = await modules();
  const result = adapter.calculatePatch3Standard(profile({
    trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null
  }));
  const recovery = resolution.resolveStandardPlan(result);
  assert.equal(result.muscleGain.trainingInputState, 'PARTIAL_OR_UNKNOWN_TRAINING');
  assert.equal(result.plans[0].unavailableReason, 'MUSCLE_GAIN_MISSING_TRAINING_INFORMATION');
  assert.equal(result.plans[0].nutritionTarget, null);
  assert.equal(recovery.title, 'Necesitamos más información');
  assert.deepEqual(recovery.allowedActions, ['COMPLETE_INFORMATION']);
});

test('MUSCLE_GAIN confirmed NONE does not reuse generic GAIN and offers explicit, non-automatic alternatives', async () => {
  const { adapter, resolution } = await modules();
  const muscle = adapter.calculatePatch3Standard(profile());
  const generic = adapter.calculatePatch3Standard(profile({ goal: 'GAIN' }));
  const recovery = resolution.resolveStandardPlan(muscle);
  assert.equal(muscle.muscleGain.trainingInputState, 'CONFIRMED_NONE');
  assert.equal(muscle.plans[0].unavailableReason, 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED');
  assert.equal(muscle.plans[0].kcal, 0);
  assert.deepEqual(recovery.allowedActions, ['DECLARE_PLANNED_TRAINING', 'CALCULATE_MAINTENANCE', 'CHANGE_GOAL']);
  assert.deepEqual(macro(generic.plans[0]), { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 });
});

test('planned future training remains planned and never produces a MUSCLE_GAIN numerical preview', async () => {
  const { adapter, resolution, preflight } = await modules();
  const result = adapter.calculatePatch3Standard(profile({
    trainingStatus: 'PLANNED_FUTURE', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE'
  }));
  const recovery = resolution.resolveStandardPlan(result);
  assert.equal(result.muscleGain.trainingInputState, 'PLANNED_FUTURE_NOT_REALIZED');
  assert.equal(result.muscleGain.eligible, false);
  assert.equal(result.plans[0].unavailableReason, 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED');
  assert.equal(result.plans[0].nutritionTarget, null);
  assert.equal(recovery.title, 'Objetivo registrado');
  assert.deepEqual(recovery.allowedActions, ['CALCULATE_MAINTENANCE', 'CHANGE_GOAL', 'PROVIDE_REALIZED_TRAINING']);
  const intake = preflight.validateStandardIntakePreflight({
    goal: 'MUSCLE_GAIN', occupation: 'SEATED', steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    training: { trainingStatus: 'PLANNED_FUTURE', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null },
    trainingSelection: 'PLANNED'
  });
  assert.equal(intake.valid, true);
  assert.equal(intake.trainingInput.state, 'PLANNED_FUTURE_NOT_REALIZED');
});

test('ordinary realized resistance reuses frozen GAIN/R1 surfaces with MUSCLE_GAIN provenance only', async () => {
  const { adapter } = await modules();
  const result = adapter.calculatePatch3Standard(profile({
    trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE'
  }));
  const plan = result.plans[0];
  const output = result.candidateOutputs[0].output;
  assert.equal(result.muscleGain.status, 'MUSCLE_GAIN_ELIGIBLE');
  assert.equal(result.muscleGain.downstreamGoal, 'GAIN');
  assert.equal(result.status, 'COMPATIBILITY_TARGETS_READY');
  assert.deepEqual(macro(plan), { kcal: 2045, proteina: 65, grasa: 62, carbos: 307 });
  assert.equal(plan.nutritionTarget.goalIntent, 'MUSCLE_GAIN');
  assert.equal(plan.nutritionTarget.method.targetRole, 'MUSCLE_GAIN_INITIAL_TARGET');
  assert.deepEqual(plan.nutritionTarget.method.caveats, [
    'GAIN_TEE_RELATIVE_INITIALIZER_NOT_TISSUE_ENERGY_CONVERSION',
    'FOUR_WEEK_SCALE_PROJECTION_NOT_MUSCLE_GAIN'
  ]);
  assert.deepEqual(output.targetContract.protein.preferredRange, [60.19999999999999, 68.8]);
  assert.deepEqual(output.targetContract.protein.contexts.practicalSupportedDensityRange, [1.6, 2]);
  assert.equal(output.proteinPolicy.practicalRangeSolverSelected, false);
  assert.equal(output.targetContract.carbohydrate.mode, 'TRANSITION');
  assert.equal(output.targetContract.carbohydrate.targetState, 'NUMERIC_CONSTRAINT_NOT_REQUIRED_IN_STANDARD');
});

test('known not-planned protein context cannot make confirmed NONE eligible for MUSCLE_GAIN', async () => {
  const { adapter } = await modules();
  const genericNone = adapter.calculatePatch3Standard(profile({ goal: 'GAIN' }));
  const muscleNone = adapter.calculatePatch3Standard(profile());
  const proteinContext = genericNone.candidateOutputs[0].output.targetContract.protein.contexts;
  assert.equal(proteinContext.realizedTraining, true);
  assert.equal(muscleNone.muscleGain.trainingInputState, 'CONFIRMED_NONE');
  assert.equal(muscleNone.muscleGain.eligible, false);
});

test('high-demand realized training remains routed and does not receive a generic MUSCLE_GAIN plan', async () => {
  const { adapter, resolution } = await modules();
  const result = adapter.calculatePatch3Standard(profile({
    trainingModality: 'RESISTANCE', sessionsPerWeek: 6, sessionDurationMin: 75, workload: 'HIGH'
  }));
  const recovery = resolution.resolveStandardPlan(result);
  assert.equal(result.muscleGain.trainingInputState, 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING');
  assert.equal(result.plans[0].unavailableReason, 'ROUTED_TARGET_NOT_IDENTIFIED');
  assert.equal(result.plans[0].nutritionTarget, null);
  assert.deepEqual(recovery.allowedActions, ['ADVANCED_HANDOFF', 'NO_SAFE_AUTOMATIC_RECOVERY']);
});

test('frozen low-BMI reference-size guard remains authoritative after MUSCLE_GAIN eligibility', async () => {
  const { adapter, resolution } = await modules();
  const result = adapter.calculatePatch3Standard(profile({
    weightKg: 40, trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE'
  }));
  const output = result.candidateOutputs[0].output;
  const recovery = resolution.resolveStandardPlan(result);
  assert.equal(result.preferredGoal, 'MUSCLE_GAIN');
  assert.equal(result.muscleGain.status, 'MUSCLE_GAIN_ELIGIBLE');
  assert.equal(result.plans[0].unavailableReason, 'UNRESOLVED_PHYSIOLOGY');
  assert.ok(output.trace.A4_A5.reasonCodes.includes('LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN'));
  assert.equal(recovery.reasonCode, 'UNRESOLVED_PHYSIOLOGY');
  assert.doesNotMatch(recovery.userMessage, /entrenamiento/i);
});

test('real-case low-BMI fixture preserves MUSCLE_GAIN intent and reports reference-size review, not training failure', async () => {
  const { adapter, resolution } = await modules();
  const result = adapter.calculatePatch3Standard(profile({
    profileId: 'real-case-low-bmi-muscle', age: 23, weightKg: 42.5, heightCm: 153,
    bodyFatPercent: 21, bodyFatSource: 'VISUAL', bodyFatQuality: 'UNKNOWN', occupation: 'STANDING_WALKING',
    steps: 2000, stepsCoverage: 0.7, stepsObservationDays: 4,
    trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE'
  }));
  const recovery = resolution.resolveStandardPlan(result);
  assert.equal(result.preferredGoal, 'MUSCLE_GAIN');
  assert.equal(result.muscleGain.trainingInputState, 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING');
  assert.equal(result.plans[0].unavailableReason, 'UNRESOLVED_PHYSIOLOGY');
  assert.equal(recovery.reasonCode, 'UNRESOLVED_PHYSIOLOGY');
  assert.doesNotMatch(recovery.userMessage, /entrenamiento/i);
});

test('legacy Standard directions and generic GAIN fixtures remain unchanged', async () => {
  const { adapter } = await modules();
  const none = { trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW' };
  assert.deepEqual(macro(adapter.calculatePatch3Standard(profile({ ...none, goal: 'MAINTENANCE' })).plans[0]), { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 });
  assert.deepEqual(macro(adapter.calculatePatch3Standard(profile({ ...none, goal: 'LOSS' })).plans[0]), { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 });
  assert.deepEqual(macro(adapter.calculatePatch3Standard(profile({ ...none, goal: 'GAIN' })).plans[0]), { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 });
});

test('active UI emits MUSCLE_GAIN, supports an explicit planned state, and MUSCLE_GAIN has no Precision route', () => {
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'lib', 'standard', 'patch3-standard-adapter.mjs'), 'utf8');
  assert.match(calculator, /'2': 'MUSCLE_GAIN'/);
  assert.match(calculator, /trainingStatus: 'PLANNED_FUTURE'/);
  assert.match(html, /id="gym-planned"/);
  assert.match(adapter, /source\.goal === MUSCLE_GAIN_INTENT/);
  assert.doesNotMatch(adapter, /calculatePrecisionTargets|calculatePrecision|precision-calculator/i);
});
