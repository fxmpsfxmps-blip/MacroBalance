const test = require('node:test');
const assert = require('node:assert/strict');

async function r1() { return import('../lib/standard/protein-policy-r1.mjs'); }
async function adapter() { return import('../lib/standard/patch3-standard-adapter.mjs'); }

function profile(overrides = {}) {
  return {
    profileId: 'protein-r1-test', sex: 'MALE', age: 35, heightCm: 180, weightKg: 80,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN',
    goal: 'MAINTENANCE', occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9,
    stepsObservationDays: 7, trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'NONE',
    sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW', scopeFlags: [],
    sleepHours: null, stressLevel: null, requestedRatePerWeek: null, ...overrides
  };
}
function runFor(p) { return import('../lib/standard/protein-policy-r1.mjs').then(({ runProteinPolicyR1IntegratedChallenger }) => runProteinPolicyR1IntegratedChallenger(p)); }
function proteinRun(result) { return result.trace.A4_A5.runs[0]; }

test('R1 is versioned and preserves ordinary protected semantics', async () => {
  const { PROTEIN_POLICY_R1_ID, PROTEIN_POLICY_R1_VERSION } = await r1();
  const run = proteinRun(await runFor(profile()));
  assert.equal(run.parameterSetId, PROTEIN_POLICY_R1_ID);
  assert.equal(run.proteinPolicyVersion, PROTEIN_POLICY_R1_VERSION);
  assert.deepEqual(run.target.preferredRange, [80, 104]);
  assert.ok(Math.abs(run.target.protectedLower - 66.4) < 1e-9);
});

test('ordinary resistance keeps 1.4-1.6 solver range and exposes practical metadata only', async () => {
  const run = proteinRun(await runFor(profile({ trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' })));
  assert.deepEqual(run.proteinEvidence.context.preferredDensityRange, [1.4, 1.6]);
  assert.deepEqual(run.proteinEvidence.context.practicalSupportedDensityRange, [1.6, 2.0]);
  assert.deepEqual(run.target.preferredRange, [112, 128]);
  assert.deepEqual(run.target.practicalSupportedRange, [128, 160]);
  assert.equal(run.proteinEvidence.densityMapping.practicalRangeIsSolverConstraint, false);
});

test('realized resistance plus loss uses explicit interaction preferred range', async () => {
  const run = proteinRun(await runFor(profile({ goal: 'LOSS', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' })));
  assert.equal(run.proteinEvidence.context.r1Interaction, true);
  assert.deepEqual(run.proteinEvidence.context.preferredDensityRange, [1.6, 2.0]);
  assert.deepEqual(run.target.preferredRange, [128, 160]);
  assert.deepEqual(run.target.practicalSupportedRange, [160, 176]);
  assert.equal(run.target.protectedLower, 80);
});

test('non-resistance, endurance, older and gain contexts remain on frozen policy', async () => {
  assert.deepEqual(proteinRun(await runFor(profile({ goal: 'LOSS' }))).target.preferredRange, [96, 128]);
  assert.deepEqual(proteinRun(await runFor(profile({ trainingModality: 'RUNNING', sessionsPerWeek: 3, sessionDurationMin: 30, workload: 'LOW' }))).target.preferredRange, [96, 128]);
  assert.deepEqual(proteinRun(await runFor(profile({ age: 65 }))).target.preferredRange, [80, 96]);
  assert.deepEqual(proteinRun(await runFor(profile({ goal: 'GAIN', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }))).target.preferredRange, [112, 128]);
});

test('BMI30 execution anchor remains unchanged for obesity', async () => {
  const run = proteinRun(await runFor(profile({ weightKg: 140, trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' })));
  assert.equal(run.target.referenceBasis, 'BMI30_CAPPED_BODY_SIZE_ROBUSTNESS_ANCHOR');
  assert.ok(Math.abs(run.target.preferredRange[0] - 136.08) < 1e-9);
  assert.ok(Math.abs(run.target.preferredRange[1] - 155.52) < 1e-9);
});

test('measured body fat remains diagnostic only', async () => {
  const unknown = proteinRun(await runFor(profile({ trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' })));
  const measured = proteinRun(await runFor(profile({ bodyFatPercent: 16, bodyFatSource: 'DXA', bodyFatQuality: 'HIGH', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' })));
  assert.deepEqual(measured.target.preferredRange, unknown.target.preferredRange);
  assert.equal(measured.referenceSizeEvidence.anchors.measuredFfm.selectedAsBasis, false);
  assert.equal(measured.referenceSizeEvidence.anchors.measuredFfm.affectsStandard, false);
});

test('unknown or partial training cannot activate R1 interaction', async () => {
  const unknown = await runFor(profile({ goal: 'LOSS', trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }));
  assert.notEqual(proteinRun(unknown).proteinEvidence.context.r1Interaction, true);
  assert.equal(unknown.trace.input.validation.profile.trainingInput.state, 'PARTIAL_OR_UNKNOWN_TRAINING');
  const partial = await runFor(profile({ goal: 'LOSS', trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: null, workload: null }));
  assert.notEqual(proteinRun(partial).proteinEvidence.context.r1Interaction, true);
});

test('practical range is never substituted into solver constraint', async () => {
  const result = await runFor(profile({ goal: 'LOSS', trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }));
  const endpoint = result.targetContract.solver.jointRegion.regionByEnergyEndpoint[0];
  const trace = endpoint.constraintTrace.find(item => item.constraintId === 'A4_A5_PROTEIN_PREFERRED_RANGE');
  assert.deepEqual(trace.originalRange, { lower: 128, upper: 160, upperUnbounded: false });
  assert.equal(result.proteinPolicy.practicalRangeSolverSelected, false);
});

test('active Standard carries R1 metadata and preserves energy closure', async () => {
  const { calculatePatch3Standard, ACTIVE_PROTEIN_POLICY_ID } = await adapter();
  const result = calculatePatch3Standard(profile({ trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }));
  const plan = result.plans[0];
  assert.equal(plan.nutritionTarget.proteinPolicyId, ACTIVE_PROTEIN_POLICY_ID);
  assert.ok(Math.abs(plan.nutritionTarget.energyCheck.differenceKcal) <= 10);
  assert.ok(plan.proteina >= 112 && plan.proteina <= 128);
});
