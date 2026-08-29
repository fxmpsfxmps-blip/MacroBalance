import { deepFreeze } from './inputScope.js';

const NASEM = Object.freeze({
  MALE: Object.freeze({ INACTIVE: [753.07,-10.83,6.50,14.10], LOW_ACTIVE: [581.47,-10.83,8.30,14.94], ACTIVE: [1004.82,-10.83,6.52,15.91], VERY_ACTIVE: [-517.88,-10.83,15.61,19.11] }),
  FEMALE: Object.freeze({ INACTIVE: [584.90,-7.01,5.72,11.71], LOW_ACTIVE: [575.77,-7.01,6.60,12.14], ACTIVE: [710.25,-7.01,6.54,12.34], VERY_ACTIVE: [511.83,-7.01,9.07,12.56] })
});

export function mifflinRmr({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'MALE' ? 5 : -161);
}

export function activityDebug(profile, a1) {
  const selectedClass = profile.activityClass || null;
  const source = profile.activityClassSource || (selectedClass ? 'MANUAL_ACTIVITY_CLASS' : 'NONE');
  const coverage = profile.stepsCoverage ?? null;
  const runningOverlap = profile.trainingModality === 'RUNNING' && profile.steps !== null;
  const highActivityWarning = profile.workload === 'EXTREME' || profile.palEstimate >= 2.5;
  return deepFreeze({ selectedClass, source, palSemantics: selectedClass ? a1.palSemantics[selectedClass] : null,
    evidence: { occupation: profile.occupation || null, steps: profile.steps ?? null, stepsCoverage: coverage, training: { modality: profile.trainingModality || 'NONE', sessionsPerWeek: profile.sessionsPerWeek ?? null, durationMin: profile.sessionDurationMin ?? null, workload: profile.workload || 'LOW' } },
    overlaps: runningOverlap ? ['RUNNING_INCLUDED_IN_STEPS_SIGNAL'] : [], confidence: selectedClass ? (source === 'MANUAL_ACTIVITY_CLASS' ? a1.confidenceManual : a1.confidenceExperimental) * (coverage !== null && coverage < a1.coverageDegradationBelow ? coverage : 1) : 0,
    status: selectedClass ? 'CANDIDATE_CLASS_EXPLICIT' : 'ABSTAIN_NO_ACTIVITY_CLASS', oodHighActivityWarning: highActivityWarning, additiveKcalBlocks: false });
}

export function energyPrior(profile, activity) {
  const rmr = mifflinRmr(profile);
  if (!activity.selectedClass || !NASEM[profile.sex]?.[activity.selectedClass]) return deepFreeze({ status: 'ABSTAIN', method: 'CHALLENGER_NASEM', rmrSanity: rmr, tee: null, teeRange: null, reason: 'A1_ACTIVITY_CLASS_REQUIRED' });
  const [i,a,h,w] = NASEM[profile.sex][activity.selectedClass];
  const tee = i + a * profile.age + h * profile.heightCm + w * profile.weightKg;
  return deepFreeze({ status: 'CANDIDATE', method: 'CHALLENGER_NASEM', equationClass: activity.selectedClass, rmrSanity: rmr, rmrMethod: 'MIFFLIN_SANITY_ONLY', tee, teeRange: null, additiveStepsKcal: 0, additiveExerciseKcal: 0, additiveTefKcal: 0, additiveEpocKcal: 0 });
}

export function selectRate(profile, a2) {
  const direction = profile.goal || 'MAINTENANCE';
  const range = a2[direction];
  if (!range) return deepFreeze({ status: 'ABSTAIN', direction, reason: 'UNSUPPORTED_INTENT' });
  return deepFreeze({ status: 'EXPERIMENTAL_PARAMETER_USED', direction, rangePerWeek: range, selectedPerWeek: profile.requestedRatePerWeek ?? a2.selected[direction], bodyMassBasis: 'CURRENT_WEIGHT_SENSITIVITY_INPUT', source: 'A2' });
}

function lossOffset(weightKg, rate, a3) { return weightKg * rate * a3.lossKcalPerKg / 7; }
function gainOffset(weightKg, rate, a3) { return weightKg * rate * a3.gainKcalPerKg / 7; }

export function initialEnergyTarget(tee, profile, rate, a3) {
  if (!Number.isFinite(tee) || rate.status === 'ABSTAIN') return deepFreeze({ status: 'ABSTAIN', target: null, offset: null, reason: 'TEE_OR_RATE_UNAVAILABLE' });
  let offset = 0, initializerMethod = 'MAINTENANCE_IDENTITY';
  if (rate.direction === 'LOSS') { offset = lossOffset(profile.weightKg, rate.selectedPerWeek, a3); initializerMethod = a3.methodLoss; }
  if (rate.direction === 'GAIN') { offset = gainOffset(profile.weightKg, rate.selectedPerWeek, a3); initializerMethod = a3.methodGain; }
  return deepFreeze({ status: rate.direction === 'MAINTENANCE' ? 'FROZEN_DIRECTION' : 'EXPERIMENTAL_PARAMETER_USED', teePrior: tee, horizonDays: rate.direction === 'MAINTENANCE' ? null : a3.horizonDays, requestedRate: profile.requestedRatePerWeek ?? null, selectedRate: rate.selectedPerWeek, initializerMethod, offset, target: tee + offset, directionSpecificFunction: rate.direction === 'LOSS' ? 'lossOffset' : rate.direction === 'GAIN' ? 'gainOffset' : 'identity' });
}

export function applyEnergyGuardrails(initial, rmr, scope, a9) {
  if (initial.target === null) return deepFreeze({ status: 'ABSTAIN', action: 'NO_TARGET', target: null, warnings: [] });
  const warnings = [];
  if (initial.target < rmr) warnings.push('TARGET_BELOW_RMR_CONTEXT');
  if (initial.target < a9.autonomousBlockBelowKcal) return deepFreeze({ status: 'BLOCKED_STRATEGY', action: 'PROFESSIONAL_OR_SPECIALIZED_ROUTE', target: null, candidateTarget: initial.target, warnings: [...warnings, 'BELOW_800_AUTONOMOUS_BLOCK'], clamped: false });
  if (initial.target < a9.lowEnergyUpperKcal) warnings.push('LOW_ENERGY_EXPERIMENTAL_POLICY');
  if (!scope.allowsComplete) return deepFreeze({ status: scope.state, action: 'SCOPE_ROUTE', target: null, candidateTarget: initial.target, warnings, clamped: false });
  return deepFreeze({ status: 'PASS_WITH_CONTEXT', action: 'CONTINUE', target: initial.target, warnings, clamped: false });
}
