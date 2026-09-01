/**
 * ACTIVITY_INPUT_POLICY_R1 is an input-contract repair.  It intentionally
 * carries no physiological coefficient, step band, duration threshold, or
 * energy modifier.  The private bridge exists only because the frozen A1
 * snapshot still accepts a numeric coverage field.
 */
export const ACTIVITY_INPUT_POLICY_R1_ID = 'ACTIVITY_INPUT_POLICY_R1';
export const ACTIVITY_INPUT_POLICY_R1_VERSION = 'activity-input-policy-r1-1.0.0';

export const STEP_REPRESENTATIVENESS = Object.freeze({
  VARIABLE: 'VARIABLE',
  MOSTLY_CONSISTENT: 'MOSTLY_CONSISTENT'
});

const SEMANTIC_STATES = new Set(Object.values(STEP_REPRESENTATIVENESS));

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

function legacyState(value) {
  if (isBlank(value)) return null;
  const numeric = Number(value);
  if (numeric === 0.7) return STEP_REPRESENTATIVENESS.VARIABLE;
  if (numeric === 0.9) return STEP_REPRESENTATIVENESS.MOSTLY_CONSISTENT;
  return null;
}

/**
 * Normalizes the public input state without interpreting it as a confidence
 * score.  Legacy 0.7 / 0.9 values are accepted only for historical reads and
 * compatibility fixtures; new public writes use the named states above.
 */
export function normalizeStepRepresentativeness({ stepsRepresentativeness, stepsCoverage } = {}) {
  if (SEMANTIC_STATES.has(stepsRepresentativeness)) {
    return Object.freeze({
      state: stepsRepresentativeness,
      source: 'SEMANTIC_CURRENT',
      valid: true
    });
  }

  const legacy = legacyState(stepsRepresentativeness);
  if (legacy) {
    return Object.freeze({ state: legacy, source: 'LEGACY_NUMERIC_SEMANTIC_FIELD', valid: true });
  }

  const fallback = legacyState(stepsCoverage);
  if (fallback) {
    return Object.freeze({ state: fallback, source: 'LEGACY_STEPS_COVERAGE', valid: true });
  }

  if (isBlank(stepsRepresentativeness) && isBlank(stepsCoverage)) {
    return Object.freeze({ state: null, source: 'MISSING', valid: false });
  }

  return Object.freeze({ state: null, source: 'INVALID', valid: false });
}

function frozenClassifierBridge(state) {
  // These sentinel values are deliberately private to the frozen A1 adapter.
  // They are not confidence percentages, persisted values, or energy factors.
  if (state === STEP_REPRESENTATIVENESS.VARIABLE) return 0;
  if (state === STEP_REPRESENTATIVENESS.MOSTLY_CONSISTENT) return 1;
  return null;
}

/**
 * Produces the compatibility input consumed by the byte-frozen A1 snapshot.
 * The original named state is retained alongside the bridge for auditability.
 */
export function applyActivityInputPolicyR1(rawProfile = {}) {
  const source = rawProfile && typeof rawProfile === 'object' ? { ...rawProfile } : {};
  const representativeness = normalizeStepRepresentativeness(source);
  const bridge = frozenClassifierBridge(representativeness.state);
  const policy = Object.freeze({
    id: ACTIVITY_INPUT_POLICY_R1_ID,
    version: ACTIVITY_INPUT_POLICY_R1_VERSION,
    stepsRepresentativeness: representativeness.state,
    inputSource: representativeness.source,
    stateMeaning: representativeness.state === STEP_REPRESENTATIVENESS.VARIABLE
      ? 'DEGRADED_REPRESENTATIVENESS_EVIDENCE'
      : representativeness.state === STEP_REPRESENTATIVENESS.MOSTLY_CONSISTENT
        ? 'USABLE_REPRESENTATIVENESS_EVIDENCE'
        : 'UNKNOWN_REPRESENTATIVENESS_EVIDENCE',
    numericSemantics: 'NONE_NOT_A_PROBABILITY_CONFIDENCE_OR_TEE_MULTIPLIER',
    frozenClassifierAdapter: 'PRIVATE_LEGACY_BRANCH_BRIDGE_ONLY'
  });

  return Object.freeze({
    profile: Object.freeze({
      ...source,
      stepsRepresentativeness: representativeness.state,
      // The frozen snapshot has the historical < 0.7 branch.  A stateful
      // adapter makes that old branch reachable without changing it.
      stepsCoverage: bridge,
      activityInputPolicy: policy
    }),
    policy
  });
}
