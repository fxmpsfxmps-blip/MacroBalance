export const SHADOW_RAW_SCHEMA_VERSION = 'shadow_raw_v1';
export const SHADOW_MAPPING_VERSION = 'production-raw-to-patch3-0.1.0';

const FIELD_ALLOWLIST = Object.freeze([
  'sex', 'age', 'heightCm', 'weightKg', 'bodyFatPercent', 'objectiveIndex',
  'activityFactor', 'sleepHours', 'stressLevel', 'gymYesPressed', 'gymNoPressed', 'gymUnknownPressed',
  'gymDays', 'precisionSteps', 'precisionTrainingType', 'precisionTrainingIntensity',
  'precisionTrainingMinutes', 'precisionCardioType', 'precisionCardioDays',
  'precisionCardioMinutes', 'precisionRate', 'standardSteps', 'standardStepsCoverage',
  'standardObservationDays', 'standardTrainingType', 'standardTrainingWorkload', 'standardTrainingMinutes',
]);
const FIELD_STATES = new Set(['PRESENT', 'EMPTY', 'MISSING_ELEMENT', 'NOT_APPLICABLE']);

function safeScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
}

function minimizeField(value) {
  if (!value || typeof value !== 'object' || !FIELD_STATES.has(value.state)) return { state: 'MISSING_ELEMENT', value: null };
  return { state: value.state, value: safeScalar(value.value) };
}

export function minimizeRawPayload(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fields = {};
  for (const key of FIELD_ALLOWLIST) fields[key] = minimizeField(source.fields?.[key]);
  return Object.freeze({
    schemaVersion: source.schemaVersion === SHADOW_RAW_SCHEMA_VERSION ? SHADOW_RAW_SCHEMA_VERSION : 'UNRECOGNIZED_SCHEMA',
    eventId: typeof source.eventId === 'string' ? source.eventId.slice(0, 128) : null,
    clientTimestamp: typeof source.clientTimestamp === 'string' ? source.clientTimestamp.slice(0, 64) : null,
    integrationVersion: typeof source.integrationVersion === 'string' ? source.integrationVersion.slice(0, 128) : null,
    calculatorMode: minimizeField(source.calculatorMode),
    fields: Object.freeze(fields),
    excludedByContract: Object.freeze([
      'name', 'email', 'photo', 'firebaseUid', 'authProvider', 'ip', 'userAgent', 'water',
      'foodExclusions', 'menuPreferences', 'menuSelections', 'firebaseHistory', 'savedGoals',
    ]),
  });
}
function present(field) { return field?.state === 'PRESENT'; }
function raw(field) { return present(field) ? field.value : null; }
function number(field) {
  if (!present(field) || field.value === '') return null;
  const parsed = Number(field.value);
  return Number.isFinite(parsed) ? parsed : null;
}
function boolean(field) {
  if (!present(field)) return null;
  if (field.value === true || field.value === 'true') return true;
  if (field.value === false || field.value === 'false') return false;
  return null;
}

function mappingRecord(sourceField, field, destination, rule, mappedValue) {
  return Object.freeze({
    sourceField,
    rawPresence: field?.state || 'MISSING_ELEMENT',
    rawValueState: field?.state === 'PRESENT' ? 'PRESENT_UNNORMALIZED' : field?.state || 'MISSING_ELEMENT',
    mappingRule: rule,
    candidateDestination: destination,
    mapped: mappedValue !== null && mappedValue !== undefined,
  });
}

function mapSex(value) { return value === 'H' ? 'MALE' : value === 'M' ? 'FEMALE' : null; }
function mapGoal(value) { return String(value) === '0' ? 'LOSS' : String(value) === '1' ? 'MAINTENANCE' : String(value) === '2' ? 'GAIN' : null; }
function mapTrainingType(value) {
  return ({ strength: 'RESISTANCE', hypertrophy: 'RESISTANCE', endurance: 'ENDURANCE', mixed: 'MIXED' })[value] || null;
}
function mapCardioType(value) {
  return ({ walking: 'WALKING', cycling: 'CYCLING', rowing: 'ROWING', running: 'RUNNING' })[value] || null;
}
function mapWorkload(value) { return ({ low: 'LOW', moderate: 'MODERATE', high: 'HIGH', LOW: 'LOW', MODERATE: 'MODERATE', HIGH: 'HIGH' })[value] || null; }

function trainingMapping(minimized, provenance) {
  const fields = minimized.fields;
  const mode = raw(minimized.calculatorMode);
  if (mode !== 'precision') {
    const gymYes = boolean(fields.gymYesPressed);
    const gymUnknown = boolean(fields.gymUnknownPressed);
    const standardType = raw(fields.standardTrainingType);
    const standardWorkload = mapWorkload(raw(fields.standardTrainingWorkload));
    const standardDays = number(fields.gymDays);
    const standardMinutes = number(fields.standardTrainingMinutes);
    const standardComplete = gymYes === true && ['RESISTANCE', 'ENDURANCE', 'MIXED'].includes(standardType)
      && Number.isFinite(standardDays) && standardDays > 0 && Number.isFinite(standardMinutes) && standardMinutes > 0 && standardWorkload;
    provenance.push(mappingRecord('fields.gymYesPressed', fields.gymYesPressed, 'trainingModality', 'STANDARD_GYM_YES_ONLY_ESTABLISHES_RESISTANCE_MODALITY', gymYes === true ? 'RESISTANCE' : null));
    provenance.push(mappingRecord('fields.gymDays', fields.gymDays, 'sessionsPerWeek', 'DIRECT_NUMERIC_ONLY_WHEN_TRAINING_REPORTED', gymYes === true ? standardDays : gymYes === false && !gymUnknown ? 0 : null));
    provenance.push(mappingRecord('fields.standardTrainingMinutes', fields.standardTrainingMinutes, 'sessionDurationMin', 'DIRECT_NUMERIC_ONLY_WHEN_TRAINING_REPORTED', standardComplete ? standardMinutes : gymYes === false && !gymUnknown ? 0 : null));
    provenance.push(mappingRecord('fields.standardTrainingType', fields.standardTrainingType, 'trainingModality', 'EXPLICIT_STANDARD_MODALITY', standardComplete ? standardType : gymYes === false && !gymUnknown ? 'NONE' : null));
    provenance.push(mappingRecord('fields.standardTrainingWorkload', fields.standardTrainingWorkload, 'workload', 'EXPLICIT_STANDARD_WORKLOAD', standardComplete ? standardWorkload : gymYes === false && !gymUnknown ? 'LOW' : null));
    return {
      trainingModality: standardComplete ? standardType : gymYes === false && !gymUnknown ? 'NONE' : null,
      sessionsPerWeek: standardComplete ? standardDays : gymYes === false && !gymUnknown ? 0 : null,
      sessionDurationMin: standardComplete ? standardMinutes : gymYes === false && !gymUnknown ? 0 : null,
      workload: standardComplete ? standardWorkload : gymYes === false && !gymUnknown ? 'LOW' : null,
      trainingStatus: gymUnknown ? 'UNKNOWN' : 'REALIZED_HABITUAL',
    };
  }

  const trainingRaw = raw(fields.precisionTrainingType);
  const cardioRaw = raw(fields.precisionCardioType);
  const main = mapTrainingType(trainingRaw);
  const cardio = mapCardioType(cardioRaw);
  const explicitMainNone = trainingRaw === 'none';
  const explicitCardioNone = cardioRaw === 'none';
  let modality = null; let sessions = null; let duration = null; let workload = null;
  if (main && cardio) {
    modality = 'HYBRID';
    // Combined weekly frequency/duration is not identifiable without overlap data.
  } else if (main) {
    modality = main;
    sessions = number(fields.gymDays);
    duration = number(fields.precisionTrainingMinutes);
    workload = mapWorkload(raw(fields.precisionTrainingIntensity));
  } else if (cardio) {
    modality = cardio;
    sessions = number(fields.precisionCardioDays);
    duration = number(fields.precisionCardioMinutes);
  } else if (explicitMainNone && explicitCardioNone) {
    modality = 'NONE'; sessions = 0; duration = 0;
  }
  provenance.push(mappingRecord('fields.precisionTrainingType+fields.precisionCardioType', fields.precisionTrainingType, 'trainingModality', 'EXPLICIT_MODALITY_MAP_WITH_HYBRID_MISSING_VOLUME_PROTECTION', modality));
  provenance.push(mappingRecord(main ? 'fields.gymDays' : cardio ? 'fields.precisionCardioDays' : 'EXPLICIT_NONE_PAIR', main ? fields.gymDays : fields.precisionCardioDays, 'sessionsPerWeek', 'DIRECT_NUMERIC_OR_EXPLICIT_NONE_ONLY', sessions));
  provenance.push(mappingRecord(main ? 'fields.precisionTrainingMinutes' : cardio ? 'fields.precisionCardioMinutes' : 'EXPLICIT_NONE_PAIR', main ? fields.precisionTrainingMinutes : fields.precisionCardioMinutes, 'sessionDurationMin', 'DIRECT_NUMERIC_OR_EXPLICIT_NONE_ONLY', duration));
  provenance.push(mappingRecord('fields.precisionTrainingIntensity', fields.precisionTrainingIntensity, 'workload', 'BROAD_INTENSITY_MAP_ONLY_FOR_PRIMARY_STRUCTURED_TRAINING', workload));
  return { trainingModality: modality, sessionsPerWeek: sessions, sessionDurationMin: duration, workload, trainingStatus: modality === null ? null : 'REALIZED_HABITUAL' };
}

export function mapProductionRawToPatch3(minimized, { receiptId, pseudonymousParticipantId } = {}) {
  if (minimized?.schemaVersion !== SHADOW_RAW_SCHEMA_VERSION) throw new Error('SHADOW_RAW_SCHEMA_INVALID');
  const f = minimized.fields;
  const mode = raw(minimized.calculatorMode);
  const provenance = [];
  const assign = (source, destination, rule, value) => { provenance.push(mappingRecord(source, f[source], destination, rule, value)); return value; };
  const training = trainingMapping(minimized, provenance);
  const stepsField = mode === 'precision' ? f.precisionSteps : f.standardSteps;
  const coverageField = mode === 'precision' ? null : f.standardStepsCoverage;
  const observationField = mode === 'precision' ? null : f.standardObservationDays;
  const patch3Input = {
    profileId: `SHADOW_${receiptId}`,
    participantId: pseudonymousParticipantId,
    sex: assign('sex', 'sex', 'H_TO_MALE_M_TO_FEMALE', mapSex(raw(f.sex))),
    age: assign('age', 'age', 'DIRECT_FINITE_NUMBER', number(f.age)),
    heightCm: assign('heightCm', 'heightCm', 'DIRECT_FINITE_NUMBER', number(f.heightCm)),
    weightKg: assign('weightKg', 'weightKg', 'DIRECT_FINITE_NUMBER', number(f.weightKg)),
    goal: assign('objectiveIndex', 'goal', '0_LOSS_1_MAINTENANCE_2_GAIN', mapGoal(raw(f.objectiveIndex))),
    bodyFatPercent: assign('bodyFatPercent', 'bodyFatPercent', 'DIRECT_FINITE_NUMBER_OR_NULL', number(f.bodyFatPercent)),
    bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN',
    occupation: null,
    steps: assign(mode === 'precision' ? 'precisionSteps' : 'standardSteps', 'steps', mode === 'precision' ? 'PRECISION_STEPS_DIRECT_ONLY' : 'STANDARD_STEPS_DIRECT_ONLY', number(stepsField)),
    stepsCoverage: mode === 'precision' ? null : assign('standardStepsCoverage', 'stepsCoverage', 'STANDARD_STEP_COVERAGE_DIRECT', number(coverageField)),
    stepsObservationDays: mode === 'precision' ? null : assign('standardObservationDays', 'stepsObservationDays', 'STANDARD_STEP_OBSERVATION_DAYS_DIRECT', number(observationField)),
    activityClass: null,
    activityClassSource: 'SHADOW_RAW_MAPPING_NO_ACTIVITY_FACTOR_REUSE',
    requestedRatePerWeek: null,
    dietPreference: null, lowCarbPreference: null, dietPattern: null,
    scopeFlags: [],
    sleepHours: assign('sleepHours', 'sleepHours', 'DIRECT_FINITE_NUMBER_OR_NULL', number(f.sleepHours)),
    stressLevel: assign('stressLevel', 'stressLevel', 'DIRECT_FINITE_NUMBER_OR_NULL', number(f.stressLevel)),
    ...training,
  };
  provenance.push(mappingRecord('fields.activityFactor', f.activityFactor, 'activityClass', 'NOT_SEMANTICALLY_EQUIVALENT_NOT_MAPPED', null));
  provenance.push(mappingRecord('fields.precisionRate', f.precisionRate, 'requestedRatePerWeek', 'CATEGORY_NOT_NUMERICALLY_EQUIVALENT_NOT_MAPPED', null));
  const missingFields = Object.entries(patch3Input)
    .filter(([key, value]) => value === null && !['bodyFatPercent', 'steps', 'stepsCoverage', 'stepsObservationDays', 'activityClass', 'requestedRatePerWeek', 'sleepHours', 'stressLevel'].includes(key))
    .map(([key]) => key);
  return Object.freeze({
    mappingVersion: SHADOW_MAPPING_VERSION,
    status: missingFields.length ? 'PARTIAL_PRESERVED_MISSINGNESS' : 'MAPPED',
    patch3Input: Object.freeze(patch3Input),
    missingFields: Object.freeze(missingFields),
    valuesImputed: false,
    provenance: Object.freeze(provenance),
    unsupportedInputs: Object.freeze(['activityFactor', 'precisionRate', 'standardGymNoAsGlobalTrainingNone']),
  });
}
