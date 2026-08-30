import {
  filterObservations,
  historyState,
  sortObservations,
} from './longitudinal-core.mjs';

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function regressionSlope(points) {
  if (points.length < 2) return null;
  const xMean = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const yMean = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    const dx = point.x - xMean;
    numerator += dx * (point.y - yMean);
    denominator += dx * dx;
  }
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Descriptive only: caller supplies a date range/window; no physiological
 * window is selected here and no recommendation is ever emitted.
 */
export function describeWeightTrend(observations, window = {}) {
  const selected = filterObservations(observations, { ...window, type: 'WEIGHT', direction: 'asc' });
  const validity = historyState(selected, 2);
  if (validity.state !== 'KNOWN') {
    return Object.freeze({
      schemaVersion: 'longitudinal-descriptive-trend-v1',
      metric: 'WEIGHT_KG',
      ...validity,
      changeKg: null,
      elapsedDays: null,
      rateKgPerDay: null,
      meanKg: null,
      medianKg: null,
      slopeKgPerDay: null,
      firstObservedAtMs: selected[0]?.observedAtMs ?? null,
      lastObservedAtMs: selected.at(-1)?.observedAtMs ?? null,
    });
  }
  const values = selected.map(item => item.payload.kg);
  const first = selected[0];
  const last = selected.at(-1);
  const elapsedDays = (last.observedAtMs - first.observedAtMs) / 86400000;
  const changeKg = last.payload.kg - first.payload.kg;
  const slopeKgPerDay = regressionSlope(selected.map(item => ({
    x: item.observedAtMs / 86400000,
    y: item.payload.kg,
  })));
  return Object.freeze({
    schemaVersion: 'longitudinal-descriptive-trend-v1',
    metric: 'WEIGHT_KG',
    ...validity,
    changeKg,
    elapsedDays,
    rateKgPerDay: elapsedDays === 0 ? null : changeKg / elapsedDays,
    meanKg: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianKg: median(values),
    slopeKgPerDay,
    firstObservedAtMs: first.observedAtMs,
    lastObservedAtMs: last.observedAtMs,
  });
}

export function describeMeasurementTrend(observations, measurementKey, window = {}) {
  const selected = filterObservations(observations, { ...window, type: 'BODY_MEASUREMENT', direction: 'asc' })
    .filter(item => item.payload.measurementKey === measurementKey);
  const validity = historyState(selected, 2);
  if (validity.state !== 'KNOWN') {
    return Object.freeze({
      schemaVersion: 'longitudinal-descriptive-trend-v1', metric: 'BODY_MEASUREMENT_CM', measurementKey,
      ...validity, changeCm: null, elapsedDays: null, rateCmPerDay: null,
    });
  }
  const first = selected[0];
  const last = selected.at(-1);
  const elapsedDays = (last.observedAtMs - first.observedAtMs) / 86400000;
  const changeCm = last.payload.cm - first.payload.cm;
  return Object.freeze({
    schemaVersion: 'longitudinal-descriptive-trend-v1',
    metric: 'BODY_MEASUREMENT_CM', measurementKey,
    ...validity,
    changeCm,
    elapsedDays,
    rateCmPerDay: elapsedDays === 0 ? null : changeCm / elapsedDays,
    firstObservedAtMs: first.observedAtMs,
    lastObservedAtMs: last.observedAtMs,
  });
}

export function latestObservation(observations, options = {}) {
  const selected = filterObservations(observations, { ...options, direction: 'desc' });
  return selected[0] || null;
}

export function buildLongitudinalDashboardData(observations) {
  const active = sortObservations(observations || []);
  const weights = filterObservations(active, { type: 'WEIGHT' });
  const measurements = filterObservations(active, { type: 'BODY_MEASUREMENT' });
  const targets = filterObservations(active, { type: 'NUTRITION_TARGET_SNAPSHOT', direction: 'desc' });
  const plans = filterObservations(active, { type: 'PLAN_REFERENCE', direction: 'desc' });
  return Object.freeze({
    schemaVersion: 'longitudinal-dashboard-data-v1',
    latestWeight: latestObservation(weights),
    weightPoints: weights.map(item => Object.freeze({ observedAtMs: item.observedAtMs, kg: item.payload.kg })),
    latestMeasurements: Object.freeze(Object.fromEntries(
      [...new Set(measurements.map(item => item.payload.measurementKey))]
        .sort()
        .map(key => [key, latestObservation(measurements.filter(item => item.payload.measurementKey === key))])
    )),
    targetHistory: targets,
    planHistory: plans,
    weightTrend: describeWeightTrend(weights),
  });
}
