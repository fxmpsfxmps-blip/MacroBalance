const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function modules() {
  const [preflight, adapter] = await Promise.all([
    import('../lib/standard/low-body-size-preflight-v1.mjs'),
    import('../lib/standard/patch3-standard-adapter.mjs')
  ]);
  return { preflight, adapter };
}

function profile(overrides = {}) {
  return {
    profileId: 'low-body-size-preflight-test', sex: 'FEMALE', age: 23, heightCm: 153, weightKg: 42.5,
    bodyFatPercent: 21, bodyFatSource: 'VISUAL', bodyFatQuality: 'UNKNOWN', bodyFatMethod: 'VISUAL',
    goal: 'MUSCLE_GAIN', occupation: 'STANDING_WALKING', steps: 2000, stepsCoverage: 0.7,
    stepsObservationDays: 4, trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE',
    sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [],
    sleepHours: null, stressLevel: null, requestedRatePerWeek: null, ...overrides
  };
}

function answers(q1, q2) {
  return { q1, q2 };
}

function macro(plan) {
  return { kcal: plan.kcal, proteina: plan.proteina, grasa: plan.grasa, carbos: plan.carbos };
}

test('BMI 18.5 is not applicable while any lower adult BMI enters shadow preflight', async () => {
  const { preflight } = await modules();
  const boundary = preflight.evaluateLowBodySizePreflightV1(profile({ heightCm: 150, weightKg: 41.625 }), answers('NO', 'NO'));
  const below = preflight.evaluateLowBodySizePreflightV1(profile({ heightCm: 150, weightKg: 41.4 }), answers('NO', 'NO'));
  assert.equal(boundary.bmi, 18.5);
  assert.equal(boundary.applicable, false);
  assert.equal(boundary.status, 'NOT_APPLICABLE');
  assert.equal(below.applicable, true);
  assert.equal(below.status, 'PREFLIGHT_CLEARED');
});

test('the two adjudicated answers determine shadow-only routing without treating unknown as NO', async () => {
  const { preflight } = await modules();
  const run = (q1, q2, options) => preflight.evaluateLowBodySizePreflightV1(profile(), answers(q1, q2), options);
  assert.equal(run('NO', 'NO').status, 'PREFLIGHT_CLEARED');
  assert.equal(run('YES', 'NO').status, 'PROFESSIONAL_HANDOFF');
  assert.equal(run('NO', 'YES').status, 'PROFESSIONAL_HANDOFF');
  assert.equal(run('NOT_SURE', 'NO').status, 'REQUEST_MORE_INFORMATION');
  assert.equal(run('NO', 'NOT_SURE').status, 'REQUEST_MORE_INFORMATION');
  assert.equal(run(null, null).status, 'UNRESOLVED');
  assert.equal(run(undefined, undefined).reasonCode, 'LOW_BODY_SIZE_PREFLIGHT_INFORMATION_MISSING');
});

test('full low-body-size shadow matrix covers the requested BMI, goal, answer, and MUSCLE_GAIN training states', async () => {
  const { preflight, adapter } = await modules();
  const bmis = [19, 18.5, 18.4, 18.2, 17.8, 17, 16];
  const goals = ['MAINTENANCE', 'LOSS', 'MUSCLE_GAIN'];
  const answerMatrix = [
    ['NO', 'NO', 'PREFLIGHT_CLEARED'],
    ['YES', 'NO', 'PROFESSIONAL_HANDOFF'],
    ['NO', 'YES', 'PROFESSIONAL_HANDOFF'],
    ['NOT_SURE', 'NO', 'REQUEST_MORE_INFORMATION'],
    ['NO', 'NOT_SURE', 'REQUEST_MORE_INFORMATION'],
    [null, null, 'UNRESOLVED']
  ];
  let cases = 0;
  for (const bmi of bmis) {
    for (const goal of goals) {
      for (const [q1, q2, expectedStatus] of answerMatrix) {
        const result = preflight.evaluateLowBodySizePreflightV1(profile({ heightCm: 150, weightKg: bmi * 2.25, goal }), answers(q1, q2));
        cases += 1;
        if (bmi >= 18.5) {
          assert.equal(result.status, 'NOT_APPLICABLE');
        } else {
          assert.equal(result.status, expectedStatus);
          if (expectedStatus === 'PREFLIGHT_CLEARED') {
            assert.equal(result.downstreamDisposition, goal === 'LOSS'
              ? 'BLOCK_STANDARD_DEFICIT_PROFESSIONAL_ROUTE'
              : 'LIMITED_STANDARD_CANDIDATE');
          }
        }
      }
    }
  }
  assert.equal(cases, 126);

  const trainingCases = [
    [{ trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW' }, 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED'],
    [{ trainingStatus: 'PLANNED_FUTURE', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }, 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED'],
    [{ trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }, 'MUSCLE_GAIN_MISSING_TRAINING_INFORMATION'],
    [{ trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE' }, 'UNRESOLVED_PHYSIOLOGY'],
    [{ trainingModality: 'RESISTANCE', sessionsPerWeek: 6, sessionDurationMin: 75, workload: 'HIGH' }, 'ROUTED_TARGET_NOT_IDENTIFIED']
  ];
  for (const [training, expectedAuthoritativeReason] of trainingCases) {
    const item = profile(training);
    const shadow = preflight.evaluateLowBodySizePreflightV1(item, answers('NO', 'NO'));
    const current = adapter.calculatePatch3Standard(item);
    assert.equal(shadow.status, 'PREFLIGHT_CLEARED');
    assert.equal(current.plans[0].unavailableReason, expectedAuthoritativeReason);
  }
});

test('not-sure follow-up is descriptive only and unresolved follow-up can route without a threshold', async () => {
  const { preflight } = await modules();
  const weightContext = preflight.evaluateLowBodySizePreflightV1(profile(), answers('NOT_SURE', 'NO'));
  const goalClarification = preflight.evaluateLowBodySizePreflightV1(profile(), answers('NO', 'NOT_SURE'));
  const exhausted = preflight.evaluateLowBodySizePreflightV1(profile(), answers('NOT_SURE', 'NO'), { followUpExhausted: true });
  assert.deepEqual(weightContext.followUp, {
    type: 'WEIGHT_CONTEXT_ONLY', fields: ['approximateWeightSixMonthsAgoKg', 'currentWeightKg'], thresholdApplied: false
  });
  assert.deepEqual(goalClarification.followUp, {
    type: 'GOAL_CLARIFICATION', prompt: '¿Tu objetivo actual incluye bajar de peso, aunque sea de forma informal?', thresholdApplied: false
  });
  assert.equal(exhausted.status, 'PROFESSIONAL_HANDOFF');
  assert.equal(exhausted.reasonCode, 'LOW_BODY_SIZE_PREFLIGHT_UNRESOLVED_AFTER_FOLLOW_UP');
});

test('goal routing blocks only a low-body Standard deficit and does not let maintenance or muscle bypass later gates', async () => {
  const { preflight } = await modules();
  const loss = preflight.evaluateLowBodySizePreflightV1(profile({ goal: 'LOSS' }), answers('NO', 'NO'));
  const maintenance = preflight.evaluateLowBodySizePreflightV1(profile({ goal: 'MAINTENANCE' }), answers('NO', 'NO'));
  const muscle = preflight.evaluateLowBodySizePreflightV1(profile({ goal: 'MUSCLE_GAIN' }), answers('NO', 'NO'));
  assert.equal(loss.downstreamDisposition, 'BLOCK_STANDARD_DEFICIT_PROFESSIONAL_ROUTE');
  assert.equal(maintenance.downstreamDisposition, 'LIMITED_STANDARD_CANDIDATE');
  assert.equal(muscle.downstreamDisposition, 'LIMITED_STANDARD_CANDIDATE');
  assert.equal(muscle.referenceAnchorCandidate.type, 'CURRENT_BODY_WEIGHT');
  assert.equal(muscle.referenceAnchorCandidate.valueKg, 42.5);
});

test('training state and body-fat variant do not act as a low-body-size safety bypass', async () => {
  const { preflight } = await modules();
  const none = preflight.evaluateLowBodySizePreflightV1(profile({ trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW' }), answers('NO', 'NO'));
  const planned = preflight.evaluateLowBodySizePreflightV1(profile({ trainingStatus: 'PLANNED_FUTURE', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }), answers('NO', 'NO'));
  const high = preflight.evaluateLowBodySizePreflightV1(profile({ trainingModality: 'RESISTANCE', sessionsPerWeek: 6, sessionDurationMin: 75, workload: 'HIGH' }), answers('NO', 'NO'));
  const visual = preflight.evaluateLowBodySizePreflightV1(profile({ bodyFatPercent: 16, bodyFatSource: 'VISUAL' }), answers('NO', 'NO'));
  const unknown = preflight.evaluateLowBodySizePreflightV1(profile({ bodyFatPercent: null, bodyFatSource: 'UNKNOWN' }), answers('NO', 'NO'));
  for (const value of [none, planned, high, visual, unknown]) {
    assert.equal(value.status, 'PREFLIGHT_CLEARED');
    assert.equal(value.downstreamDisposition, 'LIMITED_STANDARD_CANDIDATE');
  }
});

test('existing scope flags route through the current scope authority, while dormant explicit UNKNOWN remains unresolved', async () => {
  const { preflight } = await modules();
  const pregnancy = preflight.evaluateLowBodySizePreflightV1(profile({ scopeFlags: ['PREGNANCY'] }), answers('NO', 'NO'));
  const ckd = preflight.evaluateLowBodySizePreflightV1(profile({ scopeFlags: ['CKD'] }), answers('NO', 'NO'));
  const unknown = preflight.evaluateLowBodySizePreflightV1(profile(), answers('NO', 'NO'), {
    generalSafetyStatus: { status: 'UNKNOWN', reasonCodes: ['DORMANT_GENERAL_SAFETY_CONTRACT'] }
  });
  assert.equal(pregnancy.status, 'CLINICAL_HANDOFF');
  assert.equal(pregnancy.generalSafetyStatus.scopeState, 'OUT_OF_SCOPE');
  assert.equal(ckd.status, 'CLINICAL_HANDOFF');
  assert.equal(ckd.generalSafetyStatus.scopeState, 'MODULE_BLOCKED');
  assert.equal(unknown.status, 'UNRESOLVED');
  assert.equal(unknown.reasonCode, 'GENERAL_STANDARD_SAFETY_UNKNOWN');
});

test('real F23 case produces all six shadow records but frozen authoritative MUSCLE_GAIN remains unresolved', async () => {
  const { preflight, adapter } = await modules();
  const authoritativeBefore = adapter.calculatePatch3Standard(profile());
  const matrix = [
    ['NO', 'NO', 'PREFLIGHT_CLEARED', 'LIMITED_STANDARD_CANDIDATE'],
    ['YES', 'NO', 'PROFESSIONAL_HANDOFF', 'PROFESSIONAL_HANDOFF'],
    ['NO', 'YES', 'PROFESSIONAL_HANDOFF', 'PROFESSIONAL_HANDOFF'],
    ['NOT_SURE', 'NO', 'REQUEST_MORE_INFORMATION', 'REQUEST_MORE_INFORMATION'],
    ['NO', 'NOT_SURE', 'REQUEST_MORE_INFORMATION', 'REQUEST_MORE_INFORMATION'],
    [null, null, 'UNRESOLVED', 'UNRESOLVED']
  ];
  for (const [q1, q2, status, disposition] of matrix) {
    const shadow = preflight.evaluateLowBodySizePreflightV1(profile(), answers(q1, q2));
    assert.equal(shadow.status, status);
    assert.equal(shadow.downstreamDisposition, disposition);
    assert.equal(shadow.authoritative, false);
  }
  const authoritativeAfter = adapter.calculatePatch3Standard(profile());
  assert.equal(authoritativeBefore.plans[0].unavailableReason, 'UNRESOLVED_PHYSIOLOGY');
  assert.equal(authoritativeAfter.plans[0].unavailableReason, 'UNRESOLVED_PHYSIOLOGY');
  assert.equal(authoritativeAfter.plans[0].nutritionTarget, null);
  assert.deepEqual(authoritativeAfter, authoritativeBefore);
});

test('control profiles establish the shadow boundary without changing existing Standard output behavior', async () => {
  const { preflight, adapter } = await modules();
  const controls = [
    profile({ heightCm: 150, weightKg: 40 }),
    profile({ heightCm: 150, weightKg: 43 }),
    profile({ heightCm: 150, weightKg: 50 }),
    profile({ sex: 'MALE', heightCm: 170, weightKg: 50 }),
    profile({ sex: 'MALE', heightCm: 170, weightKg: 60 }),
    profile({ sex: 'MALE', heightCm: 175, weightKg: 75 })
  ];
  const expectedApplicability = [true, false, false, true, false, false];
  controls.forEach((item, index) => {
    const shadow = preflight.evaluateLowBodySizePreflightV1(item, answers('NO', 'NO'));
    assert.equal(shadow.applicable, expectedApplicability[index]);
  });
  const ordinary = profile({ heightCm: 150, weightKg: 43, goal: 'MAINTENANCE' });
  const before = adapter.calculatePatch3Standard(ordinary);
  preflight.evaluateLowBodySizePreflightV1(ordinary, answers('NO', 'NO'));
  const after = adapter.calculatePatch3Standard(ordinary);
  assert.deepEqual(macro(after.plans[0]), macro(before.plans[0]));
});

test('shadow module and browser bridge preserve frozen adapter authority, and UI remains feature-flagged off by default', async () => {
  const { preflight } = await modules();
  const config = preflight.lowBodySizePreflightUiConfig(undefined);
  const adapterSource = fs.readFileSync(path.join(root, 'lib', 'standard', 'patch3-standard-adapter.mjs'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'js', 'patch3-standard-adapter.js'), 'utf8');
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'js', 'low-body-size-preflight-runtime-config.js'), 'utf8');
  const shadowSource = fs.readFileSync(path.join(root, 'lib', 'standard', 'low-body-size-preflight-v1.mjs'), 'utf8');
  assert.equal(config.enabled, false);
  assert.equal(config.mode, 'SHADOW_SILENT');
  assert.doesNotMatch(adapterSource, /lowBodySize|evaluateLowBody/);
  assert.match(bridge, /evaluateLowBodySizePreflightShadow/);
  assert.match(calculator, /LOW_BODY_SIZE_PREFLIGHT_LAST_SHADOW/);
  assert.match(calculator, /does not enter `profile`/);
  assert.match(html, /id="low-body-size-preflight-v1"/);
  assert.match(html, /En los últimos 6 meses, ¿has perdido peso sin proponértelo o sin buscarlo activamente\?/);
  assert.match(html, /Ahora mismo, ¿estás tratando de bajar de peso\?/);
  assert.match(runtime, /enabled: false/);
  assert.doesNotMatch(shadowSource, /calculatePrecision|precision-calculator|runProteinPolicyR1IntegratedChallenger/);
});
