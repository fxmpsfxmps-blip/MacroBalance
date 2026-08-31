import { evaluateScope, deepFreeze } from '../shadow/frozen-patch3/core/inputScope.js';

export const LOW_BODY_SIZE_PREFLIGHT_V1_ID = 'LOW_BODY_SIZE_PREFLIGHT_V1';
export const LOW_BODY_SIZE_PREFLIGHT_V1_VERSION = 'low-body-size-preflight-shadow-0.1.0';
export const LOW_BODY_SIZE_BMI_CUTOFF = 18.5;
export const LOW_BODY_SIZE_PREFLIGHT_UI_FLAG = 'LOW_BODY_SIZE_PREFLIGHT_V1_ENABLED';

export const LOW_BODY_SIZE_PREFLIGHT_QUESTIONS = deepFreeze({
  q1: 'En los últimos 6 meses, ¿has perdido peso sin proponértelo o sin buscarlo activamente?',
  q2: 'Ahora mismo, ¿estás tratando de bajar de peso?',
  q2Clarification: '¿Tu objetivo actual incluye bajar de peso, aunque sea de forma informal?'
});

const ANSWERS = new Set(['YES', 'NO', 'NOT_SURE']);
const GENERAL_SAFETY_STATUSES = new Set(['CLEAR', 'UNKNOWN', 'CLINICAL_HANDOFF_REQUIRED']);

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function answer(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ANSWERS.has(normalized) ? normalized : null;
}

function bmiFor(profile) {
  const weightKg = finite(profile?.weightKg);
  const heightCm = finite(profile?.heightCm);
  if (weightKg === null || heightCm === null || weightKg <= 0 || heightCm <= 0) return null;
  return weightKg / ((heightCm / 100) ** 2);
}

function adult(profile) {
  const age = finite(profile?.age);
  return age !== null && age >= 19;
}

function normalizeGeneralSafety(rawProfile, supplied) {
  if (supplied && GENERAL_SAFETY_STATUSES.has(supplied.status)) {
    return deepFreeze({
      status: supplied.status,
      reasonCodes: [...new Set(supplied.reasonCodes || [])],
      source: supplied.source || 'EXPLICIT_SHADOW_INPUT',
      scopeState: supplied.scopeState || null,
      clinicalIntakeCaptured: Boolean(supplied.clinicalIntakeCaptured)
    });
  }

  // Reuse the current Standard scope gate without widening its authority. An
  // in-scope result means only that no existing scope flag objected; it is not
  // a medical clearance. Lactation and clinician-directed restrictions are
  // intentionally not inferred because the active intake has no such fields.
  const scope = evaluateScope(rawProfile || {});
  return deepFreeze({
    status: scope.allowsComplete ? 'CLEAR' : 'CLINICAL_HANDOFF_REQUIRED',
    reasonCodes: scope.allowsComplete
      ? ['CURRENT_SCOPE_NO_RESTRICTION_FLAG']
      : ['CURRENT_SCOPE_ROUTING_REQUIRED', ...scope.reasons],
    source: 'CURRENT_STANDARD_SCOPE_GATE',
    scopeState: scope.state,
    clinicalIntakeCaptured: false,
    semantics: 'NO_ACTIVE_OBJECTION_WITHIN_CURRENT_SCOPE_NOT_MEDICAL_CLEARANCE'
  });
}

function disposition(goal, status) {
  if (status === 'PROFESSIONAL_HANDOFF') return 'PROFESSIONAL_HANDOFF';
  if (status === 'CLINICAL_HANDOFF') return 'CLINICAL_HANDOFF';
  if (status === 'REQUEST_MORE_INFORMATION') return 'REQUEST_MORE_INFORMATION';
  if (status === 'UNRESOLVED') return 'UNRESOLVED';
  if (status === 'PREFLIGHT_CLEARED' && goal === 'LOSS') return 'BLOCK_STANDARD_DEFICIT_PROFESSIONAL_ROUTE';
  if (status === 'PREFLIGHT_CLEARED' && (goal === 'MAINTENANCE' || goal === 'MUSCLE_GAIN')) return 'LIMITED_STANDARD_CANDIDATE';
  if (status === 'PREFLIGHT_CLEARED') return 'LIMITED_STANDARD_CANDIDATE';
  return 'CONTINUE_CURRENT_AUTHORITATIVE_PATH';
}

function result({ profile, applicable, status, reasonCode, q1, q2, generalSafetyStatus, goal, followUp = null }) {
  const cleared = status === 'PREFLIGHT_CLEARED';
  const weightKg = finite(profile?.weightKg);
  return deepFreeze({
    id: LOW_BODY_SIZE_PREFLIGHT_V1_ID,
    version: LOW_BODY_SIZE_PREFLIGHT_V1_VERSION,
    authoritative: false,
    executionMode: 'SHADOW_NON_AUTHORITATIVE',
    applicable,
    bmi: bmiFor(profile),
    status,
    reasonCode,
    q1,
    q2,
    generalSafetyStatus,
    downstreamDisposition: disposition(goal, status),
    referenceAnchorCandidate: cleared && weightKg !== null
      ? deepFreeze({ type: 'CURRENT_BODY_WEIGHT', valueKg: weightKg, status: 'SHADOW_METADATA_ONLY' })
      : null,
    followUp,
    guarantees: deepFreeze([
      'DOES_NOT_MODIFY_CURRENT_STANDARD_NUTRITION_TARGET',
      'DOES_NOT_BYPASS_FROZEN_LOW_BMI_REFERENCE_SIZE_GUARD',
      'DOES_NOT_CREATE_A_LOW_BMI_REFERENCE_WEIGHT',
      'DOES_NOT_INTERPRET_BODY_FAT_OR_TRAINING_AS_SAFETY_CLEARANCE'
    ])
  });
}

/**
 * Shadow-only product safety preflight for adults below BMI 18.5. This module
 * classifies intake answers and routing only. It never calls or changes R1,
 * energy, fat, carbohydrate, or the authoritative Standard calculation.
 */
export function evaluateLowBodySizePreflightV1(rawProfile = {}, answers = {}, options = {}) {
  const profile = rawProfile && typeof rawProfile === 'object' ? rawProfile : {};
  const goal = String(profile.goal || '').toUpperCase();
  const bmi = bmiFor(profile);
  const q1 = answer(answers.q1);
  const q2 = answer(answers.q2);
  const generalSafetyStatus = normalizeGeneralSafety(profile, options.generalSafetyStatus);
  const applicable = adult(profile) && bmi !== null && bmi < LOW_BODY_SIZE_BMI_CUTOFF;

  if (!applicable) {
    return result({ profile, applicable: false, status: 'NOT_APPLICABLE', reasonCode: 'LOW_BODY_SIZE_PREFLIGHT_NOT_APPLICABLE', q1, q2, generalSafetyStatus, goal });
  }
  if (generalSafetyStatus.status === 'CLINICAL_HANDOFF_REQUIRED') {
    return result({ profile, applicable: true, status: 'CLINICAL_HANDOFF', reasonCode: 'GENERAL_STANDARD_SAFETY_CLINICAL_HANDOFF_REQUIRED', q1, q2, generalSafetyStatus, goal });
  }
  if (generalSafetyStatus.status !== 'CLEAR') {
    return result({ profile, applicable: true, status: 'UNRESOLVED', reasonCode: 'GENERAL_STANDARD_SAFETY_UNKNOWN', q1, q2, generalSafetyStatus, goal });
  }
  if (q1 === null || q2 === null) {
    return result({ profile, applicable: true, status: 'UNRESOLVED', reasonCode: 'LOW_BODY_SIZE_PREFLIGHT_INFORMATION_MISSING', q1, q2, generalSafetyStatus, goal });
  }
  if (q1 === 'YES' || q2 === 'YES') {
    return result({ profile, applicable: true, status: 'PROFESSIONAL_HANDOFF', reasonCode: q1 === 'YES'
      ? 'LOW_BODY_SIZE_UNINTENTIONAL_WEIGHT_CHANGE_REPORTED'
      : 'LOW_BODY_SIZE_CURRENT_WEIGHT_LOSS_INTENT_REPORTED', q1, q2, generalSafetyStatus, goal });
  }
  if (q1 === 'NOT_SURE' || q2 === 'NOT_SURE') {
    if (options.followUpExhausted === true) {
      return result({ profile, applicable: true, status: 'PROFESSIONAL_HANDOFF', reasonCode: 'LOW_BODY_SIZE_PREFLIGHT_UNRESOLVED_AFTER_FOLLOW_UP', q1, q2, generalSafetyStatus, goal });
    }
    const followUp = q1 === 'NOT_SURE'
      ? deepFreeze({ type: 'WEIGHT_CONTEXT_ONLY', fields: ['approximateWeightSixMonthsAgoKg', 'currentWeightKg'], thresholdApplied: false })
      : deepFreeze({ type: 'GOAL_CLARIFICATION', prompt: LOW_BODY_SIZE_PREFLIGHT_QUESTIONS.q2Clarification, thresholdApplied: false });
    return result({ profile, applicable: true, status: 'REQUEST_MORE_INFORMATION', reasonCode: q1 === 'NOT_SURE'
      ? 'LOW_BODY_SIZE_UNINTENTIONAL_WEIGHT_CHANGE_NOT_SURE'
      : 'LOW_BODY_SIZE_CURRENT_WEIGHT_LOSS_INTENT_NOT_SURE', q1, q2, generalSafetyStatus, goal, followUp });
  }
  return result({ profile, applicable: true, status: 'PREFLIGHT_CLEARED', reasonCode: 'LOW_BODY_SIZE_PREFLIGHT_Q1_NO_Q2_NO', q1, q2, generalSafetyStatus, goal });
}

export function lowBodySizePreflightUiConfig(rawConfig = globalThis?.__MB_LOW_BODY_SIZE_PREFLIGHT_CONFIG__) {
  const requested = rawConfig?.enabled === true;
  return deepFreeze({
    flag: LOW_BODY_SIZE_PREFLIGHT_UI_FLAG,
    enabled: requested,
    mode: requested ? 'SHADOW_UI' : 'SHADOW_SILENT',
    defaultOff: !requested
  });
}
