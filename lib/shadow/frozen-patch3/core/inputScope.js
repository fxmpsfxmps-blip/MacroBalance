const REQUIRED_NUMBERS = ['age', 'heightCm', 'weightKg'];
const PLANNED_TRAINING = new Set(['PLANNED', 'PLANNED_FUTURE', 'FUTURE']);

export const TRAINING_INPUT_CONTRACT_VERSION = 'training-input-contract-0.1.0';
export const TRAINING_INPUT_STATES = deepFreeze([
  'CONFIRMED_NONE',
  'PARTIAL_OR_UNKNOWN_TRAINING',
  'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING',
  'PLANNED_FUTURE_NOT_REALIZED'
]);

export function normalizeAndValidateProfile(raw) {
  const profile = structuredClone(raw);
  const errors = [];
  for (const key of REQUIRED_NUMBERS) {
    if (profile[key] === '' || profile[key] === null || profile[key] === undefined) errors.push(`${key}:MISSING`);
    else if (!Number.isFinite(profile[key]) || profile[key] <= 0) errors.push(`${key}:DOMAIN_INVALID`);
  }
  if (!['MALE', 'FEMALE'].includes(profile.sex)) errors.push('sex:DOMAIN_INVALID');
  if (Number.isFinite(profile.age) && profile.age < 19) errors.push('age:ADULT_MODEL_OUT_OF_DOMAIN');
  if (profile.bodyFatPercent !== null && profile.bodyFatPercent !== undefined && profile.bodyFatPercent !== '') {
    if (!Number.isFinite(profile.bodyFatPercent) || profile.bodyFatPercent <= 0 || profile.bodyFatPercent >= 75) errors.push('bodyFatPercent:DOMAIN_INVALID');
  } else profile.bodyFatPercent = null;
  for (const key of ['steps', 'sessionsPerWeek', 'sessionDurationMin']) {
    if (profile[key] === '' || profile[key] === undefined) profile[key] = null;
    if (profile[key] !== null && (!Number.isFinite(profile[key]) || profile[key] < 0)) errors.push(`${key}:DOMAIN_INVALID`);
  }
  for (const key of ['trainingModality', 'workload']) {
    if (profile[key] === '' || profile[key] === undefined) profile[key] = null;
  }
  profile.trainingInput = classifyTrainingInput(profile);
  return Object.freeze({ profile: deepFreeze(profile), status: errors.length ? 'TECHNICAL_INVALID' : 'VALID', errors: Object.freeze(errors) });
}

export function classifyTrainingInput(profile = {}) {
  const trainingStatus = profile.trainingStatus || (profile.trainingRealized === false ? 'PLANNED_FUTURE' : 'REALIZED_HABITUAL');
  const planned = PLANNED_TRAINING.has(trainingStatus);
  const trainingModality = profile.trainingModality === '' || profile.trainingModality === undefined ? null : profile.trainingModality;
  const sessionsPerWeek = Number.isFinite(profile.sessionsPerWeek) ? profile.sessionsPerWeek : null;
  const sessionDurationMin = Number.isFinite(profile.sessionDurationMin) ? profile.sessionDurationMin : null;
  const workload = profile.workload === '' || profile.workload === undefined ? null : profile.workload;
  const missingFields = [
    ...(trainingModality === null ? ['trainingModality'] : []),
    ...(sessionsPerWeek === null ? ['sessionsPerWeek'] : []),
    ...(sessionDurationMin === null ? ['sessionDurationMin'] : []),
    ...(workload === null ? ['workload'] : [])
  ];
  const contradictions = [];

  if (!planned && trainingModality === 'NONE' && ((sessionsPerWeek ?? 0) > 0 || (sessionDurationMin ?? 0) > 0)) {
    contradictions.push('NO_TRAINING_MODALITY_WITH_POSITIVE_TRAINING_VOLUME');
  }
  if (!planned && trainingModality !== null && trainingModality !== 'NONE' && sessionsPerWeek === 0) {
    contradictions.push('REALIZED_TRAINING_MODALITY_WITH_ZERO_SESSIONS');
  }
  if (!planned && sessionsPerWeek !== null && sessionsPerWeek > 0 && sessionDurationMin === 0) {
    contradictions.push('POSITIVE_SESSIONS_WITH_ZERO_DURATION');
  }
  if (!planned && trainingModality === null && ((sessionsPerWeek ?? 0) > 0 || (sessionDurationMin ?? 0) > 0)) {
    contradictions.push('TRAINING_VOLUME_WITH_MISSING_MODALITY');
  }
  const explicitNone = trainingModality === 'NONE' && sessionsPerWeek === 0 && sessionDurationMin === 0
    && contradictions.length === 0;
  const observedRealized = trainingModality !== null && trainingModality !== 'NONE'
    && Number.isFinite(sessionsPerWeek) && sessionsPerWeek > 0
    && Number.isFinite(sessionDurationMin) && sessionDurationMin > 0
    && contradictions.length === 0;
  const state = planned ? 'PLANNED_FUTURE_NOT_REALIZED'
    : explicitNone ? 'CONFIRMED_NONE'
      : observedRealized ? 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING'
        : 'PARTIAL_OR_UNKNOWN_TRAINING';
  const reasonCodes = state === 'PLANNED_FUTURE_NOT_REALIZED' ? ['PLANNED_TRAINING_EXCLUDED_FROM_CURRENT_STATE']
    : state === 'CONFIRMED_NONE' ? ['EXPLICIT_NONE_ZERO_ZERO_TUPLE_CONFIRMED']
      : state === 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING' ? ['REALIZED_TRAINING_CORE_TUPLE_OBSERVED']
        : ['PARTIAL_OR_UNKNOWN_TRAINING_REQUIRES_INFORMATION'];

  return deepFreeze({
    schemaVersion: TRAINING_INPUT_CONTRACT_VERSION,
    state,
    reported: { trainingStatus, trainingModality, sessionsPerWeek, sessionDurationMin, workload },
    missingFields,
    contradictions,
    reasonCodes,
    workloadCanResolveIncompleteCoreTuple: false,
    valuesImputed: false
  });
}

export function evaluateScope(profile) {
  const reasons = [];
  let state = profile.scopeState || 'IN_SCOPE';
  const specialized = ['PREGNANCY', 'RECENT_BARIATRIC', 'ACUTE_ILLNESS', 'COMPETITIVE_WEIGHT_CUT', 'MINOR'];
  if (specialized.some(flag => profile.scopeFlags?.includes(flag))) {
    state = 'OUT_OF_SCOPE'; reasons.push('SPECIALIZED_OR_PROFESSIONAL_ROUTE');
  }
  if (profile.scopeFlags?.includes('CKD')) { state = 'MODULE_BLOCKED'; reasons.push('GENERIC_PROTEIN_FLUID_ELECTROLYTE_BLOCKED'); }
  if (profile.scopeFlags?.includes('SGLT2') && profile.lowCarbPreference === 'KETOGENIC') { state = 'BLOCKED_STRATEGY'; reasons.push('SGLT2_KETOGENIC_CONFLICT'); }
  const allowsComplete = state === 'IN_SCOPE';
  return deepFreeze({ state, reasons, allowsComplete, downstreamMenuEligible: false, evaluatedBeforePhysiology: true });
}

export function assessInputQuality(profile) {
  const bfEligible = profile.bodyFatPercent !== null && profile.bodyFatQuality === 'HIGH' && ['DXA', 'BODPOD'].includes(profile.bodyFatSource);
  const coverage = profile.stepsCoverage === null || profile.stepsCoverage === undefined ? null : profile.stepsCoverage;
  return deepFreeze({
    bodyFat: { present: profile.bodyFatPercent !== null, source: profile.bodyFatSource || null, quality: profile.bodyFatQuality || 'UNKNOWN', advancedEligible: bfEligible },
    steps: { present: profile.steps !== null, coverage, confidenceEffect: coverage === null ? 'UNKNOWN' : coverage < 0.7 ? 'DEGRADED' : 'USABLE', mechanicallyScaled: false },
    status: 'QUALITATIVE_P0', parameterizedGate: true
  });
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
