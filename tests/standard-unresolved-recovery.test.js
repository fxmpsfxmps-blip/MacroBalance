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
    profileId: 'synthetic-female-recovery', sex: 'FEMALE', age: 20, heightCm: 150, weightKg: 43,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN', goal: 'MAINTENANCE',
    occupation: 'SEATED', steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'NONE', sessionsPerWeek: 0,
    sessionDurationMin: 0, workload: 'LOW', scopeFlags: [], sleepHours: null, stressLevel: null,
    requestedRatePerWeek: null, ...overrides
  };
}

function macros(plan) {
  return { kcal: plan.kcal, proteina: plan.proteina, grasa: plan.grasa, carbos: plan.carbos };
}

function caseRow(id, overrides, expected) {
  return { id, overrides, expected };
}

const RESOLVED_MATRIX = [
  caseRow('GOAL-MAINTENANCE-NO', { goal: 'MAINTENANCE' }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('GOAL-LOSS-NO', { goal: 'LOSS' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('GOAL-GAIN-NO', { goal: 'GAIN' }, { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 }),
  caseRow('GOAL-MAINTENANCE-RMOD', { goal: 'MAINTENANCE', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 1948, proteina: 65, grasa: 60, carbos: 287 }),
  caseRow('GOAL-LOSS-RMOD', { goal: 'LOSS', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 1711, proteina: 77, grasa: 52, carbos: 234 }),
  caseRow('GOAL-GAIN-RMOD', { goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 2045, proteina: 65, grasa: 62, carbos: 307 }),
  caseRow('GAIN-RLOW', { goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 2, sessionDurationMin: 45, workload: 'LOW' }, { kcal: 2045, proteina: 65, grasa: 62, carbos: 307 }),
  caseRow('GAIN-ENDURANCE', { goal: 'GAIN', trainingModality: 'ENDURANCE', sessionsPerWeek: 4, sessionDurationMin: 45, workload: 'MODERATE' }, { kcal: 1897, proteina: 60, grasa: 58, carbos: 284 }),
  caseRow('GAIN-MIXED', { goal: 'GAIN', trainingModality: 'MIXED', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 }),
  caseRow('MOVE-MNT-SEATED', { occupation: 'SEATED' }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('MOVE-MNT-STANDING', { occupation: 'STANDING_WALKING' }, { kcal: 1948, proteina: 49, grasa: 60, carbos: 303 }),
  caseRow('MOVE-MNT-PHYSICAL', { occupation: 'PHYSICAL' }, { kcal: 1948, proteina: 49, grasa: 60, carbos: 303 }),
  caseRow('STEPS-MNT-MISSING', { steps: null, stepsCoverage: null, stepsObservationDays: null }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('STEPS-MNT-2000', { steps: 2000 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('STEPS-MNT-5000', { steps: 5000 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('STEPS-MNT-8000', { steps: 8000 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('STEPS-MNT-12000', { steps: 12000 }, { kcal: 1948, proteina: 49, grasa: 60, carbos: 303 }),
  caseRow('STEPS-MNT-16000', { steps: 16000 }, { kcal: 2082, proteina: 49, grasa: 64, carbos: 328 }),
  caseRow('OBS-MNT-MISSING-METADATA', { stepsCoverage: null, stepsObservationDays: null }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('OBS-MNT-VARIABLE-1D', { stepsCoverage: 0.7, stepsObservationDays: 1 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('OBS-MNT-HABITUAL-3D', { stepsCoverage: 0.9, stepsObservationDays: 3 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('OBS-MNT-HABITUAL-7D', { stepsCoverage: 0.9, stepsObservationDays: 7 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('BF-LOSS-UNKNOWN', { goal: 'LOSS' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('BF-LOSS-16-VISUAL', { goal: 'LOSS', bodyFatPercent: 16, bodyFatSource: 'VISUAL' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('BF-LOSS-17-VISUAL', { goal: 'LOSS', bodyFatPercent: 17, bodyFatSource: 'VISUAL' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('BF-LOSS-20-VISUAL', { goal: 'LOSS', bodyFatPercent: 20, bodyFatSource: 'VISUAL' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('BF-LOSS-17-DXA', { goal: 'LOSS', bodyFatPercent: 17, bodyFatSource: 'DXA', bodyFatQuality: 'HIGH' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('RATE-LOSS-CONSERVATIVE', { goal: 'LOSS', requestedRateLabel: 'CONSERVATIVE' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('RATE-LOSS-MODERATE', { goal: 'LOSS', requestedRateLabel: 'MODERATE' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('RATE-GAIN-CONSERVATIVE', { goal: 'GAIN', requestedRateLabel: 'CONSERVATIVE' }, { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 }),
  caseRow('RATE-GAIN-MODERATE', { goal: 'GAIN', requestedRateLabel: 'MODERATE' }, { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 }),
  caseRow('WT43-MNT-NO', { weightKg: 43 }, { kcal: 1806, proteina: 49, grasa: 55, carbos: 279 }),
  caseRow('WT43-LOSS-NO', { weightKg: 43, goal: 'LOSS' }, { kcal: 1570, proteina: 60, grasa: 48, carbos: 225 }),
  caseRow('WT43-GAIN-NO', { weightKg: 43, goal: 'GAIN' }, { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 }),
  caseRow('WT43-GAIN-RMOD', { weightKg: 43, goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 2045, proteina: 65, grasa: 62, carbos: 307 }),
  caseRow('WT46-MNT-NO', { weightKg: 46 }, { kcal: 1841, proteina: 53, grasa: 56, carbos: 281 }),
  caseRow('WT46-LOSS-NO', { weightKg: 46, goal: 'LOSS' }, { kcal: 1588, proteina: 64, grasa: 49, carbos: 223 }),
  caseRow('WT46-GAIN-NO', { weightKg: 46, goal: 'GAIN' }, { kcal: 1933, proteina: 53, grasa: 59, carbos: 298 }),
  caseRow('WT46-GAIN-RMOD', { weightKg: 46, goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 2083, proteina: 69, grasa: 64, carbos: 308 }),
  caseRow('WT50-MNT-NO', { weightKg: 50 }, { kcal: 1888, proteina: 58, grasa: 58, carbos: 284 }),
  caseRow('WT50-LOSS-NO', { weightKg: 50, goal: 'LOSS' }, { kcal: 1613, proteina: 70, grasa: 49, carbos: 223 }),
  caseRow('WT50-GAIN-NO', { weightKg: 50, goal: 'GAIN' }, { kcal: 1983, proteina: 58, grasa: 61, carbos: 301 }),
  caseRow('WT50-GAIN-RMOD', { weightKg: 50, goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 2134, proteina: 75, grasa: 65, carbos: 312 }),
  caseRow('WT55-MNT-NO', { weightKg: 55 }, { kcal: 1947, proteina: 63, grasa: 59, carbos: 291 }),
  caseRow('WT55-LOSS-NO', { weightKg: 55, goal: 'LOSS' }, { kcal: 1644, proteina: 77, grasa: 50, carbos: 222 }),
  caseRow('WT55-GAIN-NO', { weightKg: 55, goal: 'GAIN' }, { kcal: 2044, proteina: 63, grasa: 62, carbos: 309 }),
  caseRow('WT55-GAIN-RMOD', { weightKg: 55, goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, { kcal: 2198, proteina: 83, grasa: 67, carbos: 316 })
];

const REJECTED_CASES = [
  caseRow('GOAL-MAINTENANCE-UNKNOWN', { trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }, 'UNRESOLVED_MISSING_INFORMATION'),
  caseRow('GOAL-LOSS-UNKNOWN', { goal: 'LOSS', trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }, 'UNRESOLVED_MISSING_INFORMATION'),
  caseRow('GOAL-GAIN-UNKNOWN', { goal: 'GAIN', trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }, 'UNRESOLVED_MISSING_INFORMATION'),
  caseRow('GAIN-RHIGH', { goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 6, sessionDurationMin: 75, workload: 'HIGH' }, 'ROUTED_TARGET_NOT_IDENTIFIED'),
  caseRow('WT40-MNT-NO', { weightKg: 40 }, 'UNRESOLVED_PHYSIOLOGY'),
  caseRow('WT40-LOSS-NO', { weightKg: 40, goal: 'LOSS' }, 'UNRESOLVED_PHYSIOLOGY'),
  caseRow('WT40-GAIN-NO', { weightKg: 40, goal: 'GAIN' }, 'UNRESOLVED_PHYSIOLOGY'),
  caseRow('WT40-GAIN-RMOD', { weightKg: 40, goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, 'UNRESOLVED_PHYSIOLOGY')
];

test('all 47 previously resolved synthetic-female cases preserve availability and output', async () => {
  const { adapter } = await modules();
  assert.equal(RESOLVED_MATRIX.length, 47);
  for (const row of RESOLVED_MATRIX) {
    const result = adapter.calculatePatch3Standard(profile(row.overrides));
    assert.equal(result.status, 'COMPATIBILITY_TARGETS_READY', row.id);
    assert.equal(result.plans[0].unavailable, undefined, row.id);
    assert.deepEqual(macros(result.plans[0]), row.expected, row.id);
  }
});

test('all eight unavailable synthetic-female cases preserve their adapter reason and receive a specific resolution result', async () => {
  const { adapter, resolution } = await modules();
  assert.equal(REJECTED_CASES.length, 8);
  for (const row of REJECTED_CASES) {
    const result = adapter.calculatePatch3Standard(profile(row.overrides));
    const plan = result.plans[0];
    const recovery = resolution.resolveStandardPlan(result);
    assert.equal(result.status, 'PARTIAL_WITH_UNAVAILABLE_PLAN', row.id);
    assert.equal(plan.unavailable, true, row.id);
    assert.equal(plan.unavailableReason, row.expected, row.id);
    assert.equal(recovery.resolved, false, row.id);
    assert.equal(recovery.reasonCode, row.expected, row.id);
    assert.ok(recovery.userMessage.length > 20, row.id);
    assert.ok(recovery.detailReasonCodes.includes(row.expected), row.id);
  }
});

test('reason-specific recovery never blames training when physics/reference review is the cause', async () => {
  const { adapter, resolution } = await modules();
  const unknown = resolution.resolveStandardPlan(adapter.calculatePatch3Standard(profile({
    goal: 'LOSS', trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null
  })));
  assert.deepEqual(unknown.allowedActions, ['COMPLETE_INFORMATION', 'PROVIDE_REALIZED_TRAINING']);
  assert.match(unknown.userMessage, /entrenamiento actual/i);

  const highDemand = resolution.resolveStandardPlan(adapter.calculatePatch3Standard(profile({
    goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 6, sessionDurationMin: 75, workload: 'HIGH'
  })));
  assert.deepEqual(highDemand.allowedActions, ['ADVANCED_HANDOFF', 'NO_SAFE_AUTOMATIC_RECOVERY']);
  assert.match(highDemand.userMessage, /rendimiento/i);
  assert.doesNotMatch(highDemand.userMessage, /indica tipo|completar información/i);

  const referenceReview = resolution.resolveStandardPlan(adapter.calculatePatch3Standard(profile({ weightKg: 40 })));
  assert.deepEqual(referenceReview.allowedActions, ['NO_SAFE_AUTOMATIC_RECOVERY']);
  assert.match(referenceReview.detailReasonCodes.join(' '), /LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN/);
  assert.doesNotMatch(referenceReview.userMessage, /entrenamiento/i);
});

test('43 kg gain with confirmed NONE is resolved, and planned future training never becomes realized training', async () => {
  const { adapter } = await modules();
  const none = adapter.calculatePatch3Standard(profile({ goal: 'GAIN' }));
  assert.equal(none.status, 'COMPATIBILITY_TARGETS_READY');
  assert.deepEqual(macros(none.plans[0]), { kcal: 1897, proteina: 49, grasa: 58, carbos: 295 });

  const planned = adapter.calculatePatch3Standard(profile({
    goal: 'GAIN', trainingStatus: 'PLANNED_FUTURE', trainingModality: 'RESISTANCE', sessionsPerWeek: 4,
    sessionDurationMin: 60, workload: 'MODERATE'
  }));
  const output = planned.candidateOutputs[0].output;
  assert.equal(planned.status, 'COMPATIBILITY_TARGETS_READY');
  assert.deepEqual(macros(planned.plans[0]), macros(none.plans[0]));
  assert.equal(output.trace.input.validation.profile.trainingInput.state, 'PLANNED_FUTURE_NOT_REALIZED');
  assert.equal(output.targetContract.protein.contexts.realizedTraining, false);
  assert.equal(output.targetContract.carbohydrate.mode, 'FLEXIBLE_RESIDUAL');
});

test('shared product preflight retains explicit training missingness and UI evidence requirements without altering the scientific runner', async () => {
  const { preflight } = await modules();
  const confirmedNone = {
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW'
  };
  const valid = preflight.validateStandardIntakePreflight({
    goal: 'LOSS', occupation: 'SEATED', steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    training: confirmedNone, trainingSelection: 'NO'
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.trainingInput.state, 'CONFIRMED_NONE');

  const noSteps = preflight.validateStandardIntakePreflight({
    goal: 'LOSS', occupation: 'SEATED', steps: null, stepsCoverage: null, stepsObservationDays: null,
    training: confirmedNone, trainingSelection: 'NO'
  });
  assert.equal(noSteps.issues[0].code, 'STEPS_REQUIRED_FOR_DIRECTIONAL_GOAL');

  const incompleteSteps = preflight.validateStandardIntakePreflight({
    goal: 'MAINTENANCE', occupation: 'SEATED', steps: 8000, stepsCoverage: null, stepsObservationDays: null,
    training: confirmedNone, trainingSelection: 'NO'
  });
  assert.equal(incompleteSteps.issues[0].code, 'STEP_OBSERVABILITY_REQUIRED');

  const incompleteYes = preflight.validateStandardIntakePreflight({
    goal: 'MAINTENANCE', occupation: 'SEATED', steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    training: { trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: null, workload: null },
    trainingSelection: 'YES'
  });
  assert.equal(incompleteYes.issues[0].code, 'REALIZED_TRAINING_DETAILS_REQUIRED');

  const unknown = preflight.validateStandardIntakePreflight({
    goal: 'MAINTENANCE', occupation: 'SEATED', steps: 8000, stepsCoverage: 0.9, stepsObservationDays: 7,
    training: { trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null },
    trainingSelection: 'UNKNOWN'
  });
  assert.equal(unknown.valid, true);
  assert.equal(unknown.trainingInput.state, 'PARTIAL_OR_UNKNOWN_TRAINING');
});

test('active UI uses the shared preflight and reason-specific resolver instead of the former generic training blame', () => {
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'js', 'patch3-standard-adapter.js'), 'utf8');
  assert.match(calculator, /await adapter\.validateIntake/);
  assert.match(calculator, /await adapter\.resolveUnavailability/);
  assert.doesNotMatch(calculator, /Revisa tu entrenamiento e inténtalo de nuevo/);
  assert.match(bridge, /standard-resolution-ux\.mjs/);
  assert.match(bridge, /standard-intake-preflight\.mjs/);
});
