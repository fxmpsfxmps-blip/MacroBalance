import { classifyTrainingInput, deepFreeze } from '../shadow/frozen-patch3/core/inputScope.js';

export const MUSCLE_GAIN_INTENT = 'MUSCLE_GAIN';
export const MUSCLE_GAIN_ELIGIBILITY_VERSION = 'muscle-gain-eligibility-0.1.0';

const HIGH_DEMAND_WORKLOADS = new Set(['HIGH', 'EXTREME']);

function contract({ eligible, status, reasonCode, allowedActions, downstreamGoal, trainingInput, detailReasonCodes = [] }) {
  return deepFreeze({
    version: MUSCLE_GAIN_ELIGIBILITY_VERSION,
    intent: MUSCLE_GAIN_INTENT,
    eligible,
    status,
    reasonCode,
    allowedActions: [...allowedActions],
    downstreamGoal,
    trainingInputState: trainingInput.state,
    trainingInput,
    detailReasonCodes: [...new Set([reasonCode, ...detailReasonCodes, ...(trainingInput.reasonCodes || [])])]
  });
}

/**
 * Product-intent gate only. It establishes whether an explicit muscle-gain
 * intent may reuse the already frozen generic GAIN pipeline; it has no
 * nutritional coefficients and does not change any Standard surface.
 */
export function evaluateMuscleGainEligibility(rawProfile = {}) {
  const trainingInput = rawProfile.trainingInput || classifyTrainingInput(rawProfile);
  const reported = trainingInput.reported || {};
  const modality = String(reported.trainingModality || '').toUpperCase();
  const workload = String(reported.workload || '').toUpperCase();

  if (trainingInput.state === 'PARTIAL_OR_UNKNOWN_TRAINING') {
    return contract({
      eligible: false,
      status: 'UNRESOLVED_MISSING_INFORMATION',
      reasonCode: 'MUSCLE_GAIN_MISSING_TRAINING_INFORMATION',
      allowedActions: ['COMPLETE_INFORMATION'],
      downstreamGoal: null,
      trainingInput,
      detailReasonCodes: ['CURRENT_REALIZED_RESISTANCE_INFORMATION_REQUIRED']
    });
  }

  if (trainingInput.state === 'CONFIRMED_NONE') {
    return contract({
      eligible: false,
      status: 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED',
      reasonCode: 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED',
      allowedActions: ['DECLARE_PLANNED_TRAINING', 'CALCULATE_MAINTENANCE', 'CHANGE_GOAL'],
      downstreamGoal: null,
      trainingInput,
      detailReasonCodes: ['CURRENT_REALIZED_RESISTANCE_REQUIRED']
    });
  }

  if (trainingInput.state === 'PLANNED_FUTURE_NOT_REALIZED') {
    return contract({
      eligible: false,
      status: 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED',
      reasonCode: 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED',
      allowedActions: ['CALCULATE_MAINTENANCE', 'CHANGE_GOAL', 'PROVIDE_REALIZED_TRAINING'],
      downstreamGoal: null,
      trainingInput,
      detailReasonCodes: ['PLANNED_TRAINING_NOT_REALIZED_FOR_MUSCLE_GAIN']
    });
  }

  // This test deliberately uses the canonical state, not the older
  // protein-context `realizedTraining` field whose meaning is only
  // "not planned". A complete actual resistance tuple is required.
  if (trainingInput.state === 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING' && HIGH_DEMAND_WORKLOADS.has(workload)) {
    return contract({
      eligible: false,
      status: 'ROUTED_TARGET_NOT_IDENTIFIED',
      reasonCode: 'ROUTED_TARGET_NOT_IDENTIFIED',
      allowedActions: ['ADVANCED_HANDOFF', 'NO_SAFE_AUTOMATIC_RECOVERY'],
      downstreamGoal: null,
      trainingInput,
      detailReasonCodes: ['MUSCLE_GAIN_HIGH_DEMAND_PERFORMANCE_ROUTE']
    });
  }

  if (trainingInput.state === 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING' && modality === 'RESISTANCE') {
    return contract({
      eligible: true,
      status: 'MUSCLE_GAIN_ELIGIBLE',
      reasonCode: 'MUSCLE_GAIN_ELIGIBLE',
      allowedActions: [],
      downstreamGoal: 'GAIN',
      trainingInput,
      detailReasonCodes: ['REALIZED_ORDINARY_RESISTANCE_CONFIRMED', 'FROZEN_GAIN_INITIALIZER_REUSE_ONLY']
    });
  }

  return contract({
    eligible: false,
    status: 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED',
    reasonCode: 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED',
    allowedActions: ['COMPLETE_INFORMATION', 'CHANGE_GOAL'],
    downstreamGoal: null,
    trainingInput,
    detailReasonCodes: ['CURRENT_REALIZED_RESISTANCE_REQUIRED']
  });
}
