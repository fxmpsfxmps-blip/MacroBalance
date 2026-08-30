/**
 * Versioned, policy-free longitudinal observation contract.
 *
 * This module deliberately models observations and reproducibility snapshots
 * only. It does not estimate energy, score adherence, or recommend a target.
 */

export const LONGITUDINAL_SCHEMA_VERSION = 'LONGITUDINAL_SCHEMA_V1';

export const OBSERVATION_TYPES = Object.freeze([
  'WEIGHT',
  'BODY_MEASUREMENT',
  'SUBJECTIVE',
  'ADHERENCE',
  'REALIZED_TRAINING',
  'NUTRITION_TARGET_SNAPSHOT',
  'PLAN_REFERENCE',
]);

export const OBSERVATION_SOURCES = Object.freeze([
  'USER_ENTERED',
  'STANDARD_CALCULATOR',
  'PLAN_GENERATION',
  'IMPORT',
  'CORRECTION',
]);

export const BODY_MEASUREMENT_KEYS = Object.freeze([
  'waist', 'neck', 'hip', 'chest', 'arm', 'thigh',
]);

export const SUBJECTIVE_DIMENSIONS = Object.freeze([
  'HUNGER', 'SATIETY', 'PERCEIVED_ENERGY', 'PERFORMANCE',
]);

export const LONGITUDINAL_QUALITY = Object.freeze([
  'KNOWN', 'ESTIMATED', 'CORRECTED',
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const OBSERVATION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
function fail(code, detail = '') {
  const error = new TypeError(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function finite(value, name) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) fail('LONGITUDINAL_NON_FINITE', name);
  return numeric;
}

function positive(value, name) {
  const numeric = finite(value, name);
  if (numeric <= 0) fail('LONGITUDINAL_NON_POSITIVE', name);
  return numeric;
}

function identifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail('LONGITUDINAL_INVALID_IDENTIFIER', name);
  }
  return value;
}

function observationId(value) {
  if (typeof value !== 'string' || !OBSERVATION_ID.test(value)) {
    fail('LONGITUDINAL_INVALID_OBSERVATION_ID');
  }
  return value;
}

function generatedId() {
  if (globalThis.crypto?.randomUUID) return `obs_${globalThis.crypto.randomUUID().replaceAll('-', '')}`;
  return `obs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function timestampToMs(value, name = 'observedAt') {
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (!Number.isFinite(milliseconds)) fail('LONGITUDINAL_INVALID_TIMESTAMP', name);
    return milliseconds;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('LONGITUDINAL_INVALID_TIMESTAMP', name);
    return value;
  }
  if (typeof value === 'string') {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) fail('LONGITUDINAL_INVALID_TIMESTAMP', name);
    return milliseconds;
  }
  fail('LONGITUDINAL_INVALID_TIMESTAMP', name);
}

export function timestampToIso(value, name = 'observedAt') {
  return new Date(timestampToMs(value, name)).toISOString();
}

function jsonClone(value, path = 'payload') {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item, index) => jsonClone(item, `${path}[${index}]`));
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('LONGITUDINAL_NON_FINITE', path);
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') fail('LONGITUDINAL_NON_SERIALIZABLE', path);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) fail('LONGITUDINAL_UNDEFINED_VALUE', `${path}.${key}`);
    output[key] = jsonClone(value[key], `${path}.${key}`);
  }
  return output;
}

export function stableStringify(value) {
  return JSON.stringify(jsonClone(value));
}

function source(value) {
  if (!OBSERVATION_SOURCES.includes(value)) fail('LONGITUDINAL_INVALID_SOURCE');
  return value;
}

function quality(value) {
  if (!LONGITUDINAL_QUALITY.includes(value)) fail('LONGITUDINAL_INVALID_QUALITY');
  return value;
}

function type(value) {
  if (!OBSERVATION_TYPES.includes(value)) fail('LONGITUDINAL_INVALID_TYPE');
  return value;
}

function optionalIdentifier(value, name) {
  if (value === undefined || value === null) return null;
  return identifier(value, name);
}

function normalizeScaleInstrument(input) {
  const instrument = input?.instrument;
  if (!instrument || typeof instrument !== 'object') fail('LONGITUDINAL_INSTRUMENT_REQUIRED');
  const minimum = finite(instrument.minimum, 'instrument.minimum');
  const maximum = finite(instrument.maximum, 'instrument.maximum');
  if (maximum <= minimum) fail('LONGITUDINAL_INVALID_INSTRUMENT_RANGE');
  return Object.freeze({
    id: identifier(instrument.id, 'instrument.id'),
    version: identifier(instrument.version, 'instrument.version'),
    minimum,
    maximum,
    unit: identifier(instrument.unit || 'SCALE_SCORE', 'instrument.unit'),
  });
}

function normalizeWeight(input) {
  return Object.freeze({ kg: positive(input.kg, 'kg') });
}

function normalizeBodyMeasurement(input) {
  if (!BODY_MEASUREMENT_KEYS.includes(input.measurementKey)) {
    fail('LONGITUDINAL_UNSUPPORTED_BODY_MEASUREMENT');
  }
  return Object.freeze({
    measurementKey: input.measurementKey,
    cm: positive(input.cm, 'cm'),
  });
}

function normalizeSubjective(input) {
  if (!SUBJECTIVE_DIMENSIONS.includes(input.dimension)) fail('LONGITUDINAL_INVALID_SUBJECTIVE_DIMENSION');
  const instrument = normalizeScaleInstrument(input);
  const value = finite(input.value, 'value');
  if (value < instrument.minimum || value > instrument.maximum) {
    fail('LONGITUDINAL_SUBJECTIVE_OUTSIDE_INSTRUMENT');
  }
  return Object.freeze({ dimension: input.dimension, value, instrument });
}

function normalizeAdherence(input) {
  const instrument = normalizeScaleInstrument(input);
  const value = finite(input.value, 'value');
  if (value < instrument.minimum || value > instrument.maximum) {
    fail('LONGITUDINAL_ADHERENCE_OUTSIDE_INSTRUMENT');
  }
  return Object.freeze({
    metricId: identifier(input.metricId, 'metricId'),
    value,
    instrument,
  });
}

function normalizeTraining(input) {
  if (!input || typeof input !== 'object') fail('LONGITUDINAL_TRAINING_REQUIRED');
  const trainingInput = jsonClone(input.trainingInput ?? input);
  return Object.freeze({
    trainingInput,
    reportedWorkload: input.reportedWorkload == null ? null : identifier(input.reportedWorkload, 'reportedWorkload'),
    realizationState: input.realizationState == null ? 'REPORTED' : identifier(input.realizationState, 'realizationState'),
  });
}

function requireNutritionTarget(target) {
  if (!target || typeof target !== 'object') fail('LONGITUDINAL_NUTRITION_TARGET_REQUIRED');
  const numericKeys = ['kcal', 'proteina', 'carbos', 'grasa'];
  const normalized = {};
  for (const key of numericKeys) {
    const value = finite(target[key], `nutritionTarget.${key}`);
    if (value < 0) fail('LONGITUDINAL_NEGATIVE_NUTRITION_TARGET', key);
    normalized[key] = value;
  }
  for (const key of ['schemaVersion', 'calculationMode', 'calculatorVersion', 'standardId', 'standardFreezeId']) {
    normalized[key] = target[key] == null ? null : identifier(String(target[key]), `nutritionTarget.${key}`);
  }
  return Object.freeze(normalized);
}

function normalizeTargetSnapshot(input) {
  if (!input || typeof input !== 'object') fail('LONGITUDINAL_TARGET_SNAPSHOT_REQUIRED');
  const standard = input.standard || {};
  return Object.freeze({
    target: requireNutritionTarget(input.nutritionTarget),
    calculator: Object.freeze({
      standardId: identifier(standard.id || input.nutritionTarget?.standardId, 'standard.id'),
      calculatorVersion: identifier(standard.version || input.nutritionTarget?.calculatorVersion, 'standard.version'),
      policyVersion: optionalIdentifier(standard.policyVersion, 'standard.policyVersion'),
      freezeId: optionalIdentifier(standard.freezeId || input.nutritionTarget?.standardFreezeId, 'standard.freezeId'),
    }),
    inputSnapshot: jsonClone(input.inputSnapshot || {}),
    sourceGoalId: optionalIdentifier(input.sourceGoalId, 'sourceGoalId'),
  });
}

function normalizePlanReference(input) {
  if (!input || typeof input !== 'object') fail('LONGITUDINAL_PLAN_REFERENCE_REQUIRED');
  return Object.freeze({
    planId: identifier(input.planId, 'planId'),
    targetSnapshotId: optionalIdentifier(input.targetSnapshotId, 'targetSnapshotId'),
    generatorVersion: optionalIdentifier(input.generatorVersion, 'generatorVersion'),
    sourceGoalId: optionalIdentifier(input.sourceGoalId, 'sourceGoalId'),
    planDigest: optionalIdentifier(input.planDigest, 'planDigest'),
  });
}

function normalizePayload(observationType, input) {
  switch (observationType) {
    case 'WEIGHT': return normalizeWeight(input);
    case 'BODY_MEASUREMENT': return normalizeBodyMeasurement(input);
    case 'SUBJECTIVE': return normalizeSubjective(input);
    case 'ADHERENCE': return normalizeAdherence(input);
    case 'REALIZED_TRAINING': return normalizeTraining(input);
    case 'NUTRITION_TARGET_SNAPSHOT': return normalizeTargetSnapshot(input);
    case 'PLAN_REFERENCE': return normalizePlanReference(input);
    default: return fail('LONGITUDINAL_INVALID_TYPE');
  }
}

/**
 * Returns a serializable, immutable observation. `id` is caller-supplied when
 * retry/idempotency semantics matter; otherwise an opaque identifier is made.
 */
export function createObservation(input) {
  if (!input || typeof input !== 'object') fail('LONGITUDINAL_OBSERVATION_REQUIRED');
  const observationType = type(input.type);
  const ownerId = identifier(input.ownerId, 'ownerId');
  const observedAtMs = timestampToMs(input.observedAt ?? Date.now());
  const observation = {
    schemaVersion: LONGITUDINAL_SCHEMA_VERSION,
    id: observationId(input.id || generatedId()),
    ownerId,
    type: observationType,
    observedAtMs,
    observedAtIso: new Date(observedAtMs).toISOString(),
    source: source(input.source || 'USER_ENTERED'),
    quality: quality(input.quality || 'KNOWN'),
    revision: Number.isInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    supersedesId: input.supersedesId == null ? null : observationId(input.supersedesId),
    payload: normalizePayload(observationType, input.payload || input),
  };
  return Object.freeze(jsonClone(observation));
}

export function createWeightObservation(input) {
  return createObservation({ ...input, type: 'WEIGHT', payload: { kg: input.kg } });
}

export function createBodyMeasurementObservation(input) {
  return createObservation({ ...input, type: 'BODY_MEASUREMENT', payload: { measurementKey: input.measurementKey, cm: input.cm } });
}

export function createSubjectiveObservation(input) {
  return createObservation({ ...input, type: 'SUBJECTIVE', payload: input });
}

export function createAdherenceObservation(input) {
  return createObservation({ ...input, type: 'ADHERENCE', payload: input });
}

export function createRealizedTrainingObservation(input) {
  return createObservation({ ...input, type: 'REALIZED_TRAINING', payload: input });
}

export function createNutritionTargetSnapshot(input) {
  return createObservation({ ...input, type: 'NUTRITION_TARGET_SNAPSHOT', source: input.source || 'STANDARD_CALCULATOR', payload: input });
}

export function createPlanReference(input) {
  return createObservation({ ...input, type: 'PLAN_REFERENCE', source: input.source || 'PLAN_GENERATION', payload: input });
}

export function correctObservation(previous, correction) {
  if (!previous || typeof previous !== 'object') fail('LONGITUDINAL_PREVIOUS_OBSERVATION_REQUIRED');
  const nextRevision = Number.isInteger(previous.revision) ? previous.revision + 1 : 2;
  const payload = correction?.payload || correction || previous.payload;
  return createObservation({
    ...previous,
    ...correction,
    id: correction?.id,
    observedAt: correction?.observedAt ?? previous.observedAtMs,
    source: 'CORRECTION',
    quality: 'CORRECTED',
    revision: nextRevision,
    supersedesId: previous.id,
    payload,
  });
}

export function observationFingerprint(observation) {
  const clone = jsonClone(observation);
  delete clone.createdAt;
  delete clone.updatedAt;
  return stableStringify(clone);
}

export function compareObservationsAscending(left, right) {
  const byTime = Number(left.observedAtMs) - Number(right.observedAtMs);
  return byTime || String(left.id).localeCompare(String(right.id));
}

export function sortObservations(items, direction = 'asc') {
  const sorted = (Array.isArray(items) ? items : []).slice().sort(compareObservationsAscending);
  return direction === 'desc' ? sorted.reverse() : sorted;
}

export function withoutSuperseded(items) {
  const superseded = new Set((Array.isArray(items) ? items : []).map(item => item?.supersedesId).filter(Boolean));
  return (Array.isArray(items) ? items : []).filter(item => !superseded.has(item.id));
}

export function filterObservations(items, options = {}) {
  const fromMs = options.from == null ? null : timestampToMs(options.from, 'from');
  const toMs = options.to == null ? null : timestampToMs(options.to, 'to');
  if (fromMs != null && toMs != null && fromMs > toMs) fail('LONGITUDINAL_INVALID_DATE_RANGE');
  const types = options.type == null ? null : new Set(Array.isArray(options.type) ? options.type : [options.type]);
  if (types) for (const value of types) type(value);
  const base = options.includeSuperseded ? (Array.isArray(items) ? items : []) : withoutSuperseded(items);
  return sortObservations(base.filter(item => {
    if (types && !types.has(item.type)) return false;
    if (fromMs != null && item.observedAtMs < fromMs) return false;
    if (toMs != null && item.observedAtMs > toMs) return false;
    return true;
  }), options.direction || 'asc');
}

export function historyState(items, minimum = 1) {
  const count = Array.isArray(items) ? items.length : 0;
  return Object.freeze({
    state: count >= minimum ? 'KNOWN' : 'INSUFFICIENT_HISTORY',
    observationCount: count,
    minimumObservationCount: minimum,
  });
}

export function assertObservation(value) {
  const normalized = createObservation({
    ...value,
    observedAt: value?.observedAtMs ?? value?.observedAtIso,
    payload: value?.payload,
  });
  if (value?.id !== normalized.id || value?.ownerId !== normalized.ownerId) {
    fail('LONGITUDINAL_OBSERVATION_NOT_CANONICAL');
  }
  return normalized;
}
