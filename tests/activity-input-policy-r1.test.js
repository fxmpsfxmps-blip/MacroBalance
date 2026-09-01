const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function modules() {
  const [policy, adapter, preflight, mapper] = await Promise.all([
    import('../lib/standard/activity-input-policy-r1.mjs'),
    import('../lib/standard/patch3-standard-adapter.mjs'),
    import('../lib/standard/standard-intake-preflight.mjs'),
    import('../lib/shadow/shadow-mapper.mjs')
  ]);
  return { policy, adapter, preflight, mapper };
}

function profile(overrides = {}) {
  return {
    profileId: 'activity-r1', sex: 'FEMALE', age: 23, heightCm: 153, weightKg: 42.5,
    bodyFatPercent: 21, bodyFatSource: 'VISUAL', bodyFatQuality: 'UNKNOWN',
    goal: 'MUSCLE_GAIN', occupation: 'STANDING_WALKING', steps: 2000,
    stepsObservationDays: 7, trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE',
    sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [],
    sleepHours: null, stressLevel: null, requestedRatePerWeek: null, ...overrides
  };
}

function output(result) {
  return result.candidateOutputs[0].output;
}

function a1(result) {
  return output(result).trace.A1;
}

test('ACTIVITY_INPUT_POLICY_R1 maps only the two frozen historical values and preserves missingness', async () => {
  const { policy } = await modules();
  assert.equal(policy.ACTIVITY_INPUT_POLICY_R1_ID, 'ACTIVITY_INPUT_POLICY_R1');
  assert.equal(policy.normalizeStepRepresentativeness({ stepsCoverage: 0.7 }).state, 'VARIABLE');
  assert.equal(policy.normalizeStepRepresentativeness({ stepsCoverage: 0.9 }).state, 'MOSTLY_CONSISTENT');
  assert.equal(policy.normalizeStepRepresentativeness({ stepsRepresentativeness: 'VARIABLE' }).source, 'SEMANTIC_CURRENT');
  assert.equal(policy.normalizeStepRepresentativeness({}).state, null);
  assert.equal(policy.normalizeStepRepresentativeness({ stepsCoverage: 0.8 }).source, 'INVALID');

  const variable = policy.applyActivityInputPolicyR1({ stepsCoverage: 0.7 });
  const consistent = policy.applyActivityInputPolicyR1({ stepsCoverage: 0.9 });
  assert.equal(variable.profile.stepsCoverage, 0);
  assert.equal(consistent.profile.stepsCoverage, 1);
  assert.equal(variable.policy.numericSemantics, 'NONE_NOT_A_PROBABILITY_CONFIDENCE_OR_TEE_MULTIPLIER');
});

test('preflight accepts the new semantic state, accepts historical values, and retains missing observability as incomplete', async () => {
  const { preflight } = await modules();
  const base = {
    goal: 'LOSS', occupation: 'SEATED', steps: 8000, stepsObservationDays: 7,
    training: { trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW' },
    trainingSelection: 'NO'
  };
  const semantic = preflight.validateStandardIntakePreflight({ ...base, stepsRepresentativeness: 'MOSTLY_CONSISTENT' });
  const legacy = preflight.validateStandardIntakePreflight({ ...base, stepsCoverage: 0.9 });
  const missing = preflight.validateStandardIntakePreflight(base);
  assert.equal(semantic.valid, true);
  assert.equal(semantic.stepsRepresentativeness, 'MOSTLY_CONSISTENT');
  assert.equal(legacy.valid, true);
  assert.equal(legacy.stepsRepresentativeness, 'MOSTLY_CONSISTENT');
  assert.equal(missing.valid, false);
  assert.equal(missing.issues[0].code, 'STEP_OBSERVABILITY_REQUIRED');
});

test('VARIABLE and MOSTLY_CONSISTENT are no longer aliases across the observation matrix and step bands', async () => {
  const { adapter } = await modules();
  const days = [4, 6, 7, 14];
  const stepBands = [2000, 5000, 8000, 12000, 16000];
  for (const observedDays of days) {
    for (const steps of stepBands) {
      const variable = a1(adapter.calculatePatch3Standard(profile({ steps, stepsObservationDays: observedDays, stepsRepresentativeness: 'VARIABLE' })));
      const consistent = a1(adapter.calculatePatch3Standard(profile({ steps, stepsObservationDays: observedDays, stepsRepresentativeness: 'MOSTLY_CONSISTENT' })));
      assert.equal(variable.inference.evidence.coverageState, 'DEGRADED');
      assert.equal(variable.decision, 'INSUFFICIENT_DATA');
      assert.ok(variable.reasonCodes.includes('INSUFFICIENT_STEP_EVIDENCE_FOR_CLASS_ENVELOPE'));
      assert.equal(consistent.inference.evidence.coverageState, 'USABLE_EXPERIMENTAL');
      if (observedDays < 7) {
        assert.equal(consistent.decision, 'INSUFFICIENT_DATA');
        assert.ok(consistent.inference.missingness.includes('STEP_WINDOW_SHORTER_THAN_HEURISTIC_7_DAY_MINIMUM'));
      } else {
        assert.equal(consistent.inference.missingness.includes('STEP_COVERAGE_DEGRADED'), false);
        assert.notDeepEqual(variable.inference.classCandidates, consistent.inference.classCandidates,
          `semantic coverage must affect the frozen A1 evidence branch at ${steps} steps / ${observedDays} days`);
      }
    }
  }
});

test('the semantic distinction changes only the existing A1 evidence branch, never a kcal modifier', async () => {
  const { adapter } = await modules();
  const variable = a1(adapter.calculatePatch3Standard(profile({ stepsRepresentativeness: 'VARIABLE', stepsObservationDays: 7 })));
  const consistent = a1(adapter.calculatePatch3Standard(profile({ stepsRepresentativeness: 'MOSTLY_CONSISTENT', stepsObservationDays: 7 })));
  assert.equal(variable.inference.additiveKcalBlocks, false);
  assert.equal(consistent.inference.additiveKcalBlocks, false);
  assert.ok(consistent.candidates.every(candidate => candidate.method === 'CHALLENGER_NASEM'));
  assert.ok(consistent.candidates.every(candidate => !Object.hasOwn(candidate, 'coverageMultiplier')));
  assert.equal(consistent.inputProvenance.stepsCoverage, 1);
});

test('F23 regression matrix exposes the expected routing state without forcing a target', async () => {
  const { adapter } = await modules();
  const cases = [
    ['4D_VARIABLE', 4, 'VARIABLE', ['INACTIVE', 'LOW_ACTIVE', 'ACTIVE', 'VERY_ACTIVE'], [1796.505, 2272.11], 'REQUEST_INFORMATION'],
    ['4D_CONSISTENT', 4, 'MOSTLY_CONSISTENT', ['INACTIVE', 'LOW_ACTIVE', 'ACTIVE', 'VERY_ACTIVE'], [1796.505, 2272.11], 'REQUEST_INFORMATION'],
    ['7D_VARIABLE', 7, 'VARIABLE', ['INACTIVE', 'LOW_ACTIVE', 'ACTIVE', 'VERY_ACTIVE'], [1796.505, 2272.11], 'REQUEST_INFORMATION'],
    ['7D_CONSISTENT', 7, 'MOSTLY_CONSISTENT', ['INACTIVE', 'LOW_ACTIVE', 'ACTIVE'], [1796.505, 2074.09], 'PASS']
  ];
  for (const [id, days, state, candidateClasses, teeRange, b1Status] of cases) {
    const result = adapter.calculatePatch3Standard(
      profile({ stepsObservationDays: days, stepsRepresentativeness: state }),
      { lowBodySizeAnswers: { q1: 'NO', q2: 'NO' } }
    );
    const candidate = output(result);
    if (b1Status === 'PASS') {
      assert.equal(result.status, 'COMPATIBILITY_TARGETS_READY', id);
      assert.ok(result.plans[0].nutritionTarget, id);
    } else {
      assert.equal(result.status, 'PARTIAL_WITH_UNAVAILABLE_PLAN', id);
      assert.equal(result.plans[0].nutritionTarget, null, id);
      assert.equal(result.plans[0].unavailableReason, 'FEASIBILITY_UNKNOWN', id);
    }
    assert.deepEqual(candidate.trace.A1.inference.classCandidates, candidateClasses, id);
    assert.deepEqual(candidate.energy.teeRange.map(value => Number(value.toFixed(3))), teeRange, id);
    assert.equal(candidate.trace.A2_A3.decision, 'B1_RATE_AND_INITIAL_ENERGY_ENVELOPES_EXECUTABLE', id);
    assert.equal(candidate.trace.A2_A3.b1.status, b1Status, id);
    if (state === 'VARIABLE') assert.ok(candidate.reasonCodes.includes('INSUFFICIENT_STEP_EVIDENCE_FOR_CLASS_ENVELOPE'), id);
  }
});

test('new raw shadow payload uses the semantic key while old shadow payload remains readable', async () => {
  const { mapper } = await modules();
  const rawPayload = (fields) => mapper.minimizeRawPayload({
    schemaVersion: mapper.SHADOW_RAW_SCHEMA_VERSION, eventId: 'activity-r1', calculatorMode: { state: 'PRESENT', value: 'standard' }, fields
  });
  const common = {
    sex: { state: 'PRESENT', value: 'M' }, age: { state: 'PRESENT', value: 23 },
    heightCm: { state: 'PRESENT', value: 153 }, weightKg: { state: 'PRESENT', value: 42.5 },
    objectiveIndex: { state: 'PRESENT', value: '2' }, standardSteps: { state: 'PRESENT', value: 2000 },
    standardObservationDays: { state: 'PRESENT', value: 7 }
  };
  const semantic = mapper.mapProductionRawToPatch3(rawPayload({ ...common, standardStepsRepresentativeness: { state: 'PRESENT', value: 'VARIABLE' } }), { receiptId: 'new' });
  const legacy = mapper.mapProductionRawToPatch3(rawPayload({ ...common, standardStepsCoverage: { state: 'PRESENT', value: 0.9 } }), { receiptId: 'old' });
  assert.equal(semantic.patch3Input.stepsRepresentativeness, 'VARIABLE');
  assert.equal(semantic.patch3Input.stepsCoverage, 0);
  assert.equal(legacy.patch3Input.stepsRepresentativeness, 'MOSTLY_CONSISTENT');
  assert.equal(legacy.patch3Input.stepsCoverage, 1);
});

test('browser form and persistence write the named state while retaining an explicit historical read adapter', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');
  assert.match(html, /value="MOSTLY_CONSISTENT"/);
  assert.match(html, /value="VARIABLE"/);
  assert.doesNotMatch(html, /value="0\.7"/);
  assert.doesNotMatch(html, /value="0\.9"/);
  assert.match(calculator, /stepsRepresentativeness/);
  assert.match(firebase, /standardStepsRepresentativeness/);
  assert.match(firebase, /standardStepsCoverage\) === 0\.7/);
});
