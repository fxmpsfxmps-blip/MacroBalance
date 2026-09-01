import { deepFreeze } from '../shadow/frozen-patch3/core/inputScope.js';
import {
  evaluateLowBodySizePreflightV1,
  LOW_BODY_SIZE_BMI_CUTOFF,
  LOW_BODY_SIZE_PREFLIGHT_QUESTIONS,
} from './low-body-size-preflight-v1.mjs';

// This is a successor policy layer.  The V1 preflight remains an immutable
// shadow artifact so its original audit evidence can still be reproduced.
export const LOW_BODY_SIZE_POLICY_R1_ID = 'LOW_BODY_SIZE_POLICY_R1_2026_08_31';
export const LOW_BODY_SIZE_POLICY_R1_VERSION = 'low-body-size-policy-r1-1.0.0';
export const LOW_BODY_SIZE_POLICY_R1_UI_FLAG = 'LOW_BODY_SIZE_POLICY_R1_ENABLED';

export const LOW_BODY_SIZE_POLICY_R1_QUESTIONS = LOW_BODY_SIZE_PREFLIGHT_QUESTIONS;

const LOW_BMI_REFERENCE_GUARD = 'LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN';
const CAUTION = 'LOW_BODY_SIZE_CAUTION';
const RECOMMENDATION = 'STRONG_PROFESSIONAL_RECOMMENDATION';

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function isCleared(policy) {
  return Boolean(policy?.applicable)
    && policy.status === 'PREFLIGHT_CLEARED'
    && policy.reasonCode === 'LOW_BODY_SIZE_PREFLIGHT_Q1_NO_Q2_NO';
}

function outputContext(policy) {
  if (!isCleared(policy)) return null;
  return deepFreeze({
    policyId: LOW_BODY_SIZE_POLICY_R1_ID,
    policyVersion: LOW_BODY_SIZE_POLICY_R1_VERSION,
    status: 'CLEARED_WITH_CONTEXT',
    caution: CAUTION,
    recommendation: RECOMMENDATION,
    message: 'El objetivo se calculó con una cautela por tamaño corporal bajo. Considera acompañamiento profesional para revisar el contexto individual.',
    medicalClearanceClaimed: false,
    automaticRestrictionApplied: false,
  });
}

/**
 * Authoritative R1 interpretation of the already-audited question contract.
 * It creates no numerical nutrition surface and never treats a cleared screen
 * as a clinical clearance. Existing Standard scope stays first through V1.
 */
export function evaluateLowBodySizePolicyR1(profile = {}, answers = {}, options = {}) {
  const shadow = evaluateLowBodySizePreflightV1(profile, answers, options);
  const policy = {
    ...shadow,
    id: LOW_BODY_SIZE_POLICY_R1_ID,
    version: LOW_BODY_SIZE_POLICY_R1_VERSION,
    authoritative: true,
    executionMode: 'AUTHORITATIVE_R1_OVERLAY',
    policyScope: 'ADULT_BMI_BELOW_18_5_ONLY',
    lowBodySizeBmiCutoff: LOW_BODY_SIZE_BMI_CUTOFF,
    outputContext: null,
    guarantees: [
      'CURRENT_STANDARD_GENERAL_SAFETY_PRECEDES_LOW_BODY_SIZE_POLICY',
      'CURRENT_BODY_WEIGHT_IS_A_REASONABLE_DEFAULT_ANCHOR_NOT_BIOLOGICAL_TRUTH',
      'NO_NEW_PROTEIN_DENSITY_OR_ENERGY_TARGET_CREATED',
      'A1_B1_A6_A7_A8_A9_REMAIN_AUTHORITATIVE',
      'CLEARANCE_IS_NOT_MEDICAL_CLEARANCE',
    ],
  };
  policy.outputContext = outputContext(policy);
  return deepFreeze(policy);
}

export function lowBodySizePolicyCanPromoteProtein(policy) {
  return isCleared(policy);
}

function cloneAnchor(anchor, selected) {
  return {
    ...anchor,
    method: 'CURRENT_BODY_WEIGHT_LOW_BODY_SIZE_R1_REASONABLE_DEFAULT',
    role: 'REASONABLE_DEFAULT_AFTER_LOW_BODY_SIZE_R1_Q1_NO_Q2_NO_NOT_BIOLOGICAL_TRUTH',
    isBiologicalTruth: false,
    isUniversalReferenceWeight: false,
    selectedForGramExecution: selected,
  };
}

/**
 * Converts only the frozen low-BMI reference-size review into the already
 * adjudicated Current-BW R1 execution basis. All grams come from the frozen
 * run's own candidate range/density mapping; no coefficient is introduced.
 */
export function promoteLowBodySizeProteinRunR1(run, policy) {
  if (!lowBodySizePolicyCanPromoteProtein(policy)) return run;
  if (!run?.target?.divergenceFlags?.includes(LOW_BMI_REFERENCE_GUARD)) return run;

  const anchorKg = finite(run.referenceSizeEvidence?.executionAnchor?.valueKg);
  const protectedLower = finite(run.proteinEvidence?.densityMapping?.actualBwSensitivity?.protectedGrams);
  const preferredRange = run.target?.candidatePreferredRange;
  if (anchorKg === null || protectedLower === null || !Array.isArray(preferredRange)
      || preferredRange.length !== 2 || !preferredRange.every(value => finite(value) !== null)) {
    // A policy clearance never manufactures a target if the frozen evidence
    // record cannot supply its own executable anchor and range.
    return run;
  }

  const retainedWarnings = (run.warnings || []).filter(code => code !== LOW_BMI_REFERENCE_GUARD);
  const retainedReasons = (run.reasonCodes || []).filter(code => code !== LOW_BMI_REFERENCE_GUARD);
  const retainedOpen = (run.openParametersUsed || []).filter(code => code !== 'A4_REFERENCE_SIZE_REVIEW');
  const actualAnchor = cloneAnchor(run.referenceSizeEvidence.executionAnchor, true);
  const actualBodyWeight = cloneAnchor(run.referenceSizeEvidence.anchors?.actualBodyWeight || { valueKg: anchorKg }, true);
  const referenceSizeEvidence = {
    ...run.referenceSizeEvidence,
    executionAnchor: actualAnchor,
    anchors: {
      ...run.referenceSizeEvidence.anchors,
      actualBodyWeight,
    },
    domain: {
      ...run.referenceSizeEvidence.domain,
      status: 'LOW_BODY_SIZE_R1_CLEARED_CURRENT_BODY_WEIGHT_ANCHOR',
      reason: 'LOW_BODY_SIZE_POLICY_R1_Q1_NO_Q2_NO',
    },
    divergence: {
      ...run.referenceSizeEvidence.divergence,
      status: 'LOW_BODY_SIZE_R1_CONTEXTUAL_CAUTION',
      flags: [],
      action: 'RUN_EXISTING_EXECUTABLE_RANGE_WITH_CONTEXTUAL_CAUTION',
    },
    uncertainty: 'NOT_CALIBRATED_WITH_LOW_BODY_SIZE_CONTEXT',
  };
  const proteinEvidence = {
    ...run.proteinEvidence,
    densityMapping: {
      ...run.proteinEvidence.densityMapping,
      executionAnchorKg: anchorKg,
      lowBodySizePolicy: {
        id: LOW_BODY_SIZE_POLICY_R1_ID,
        version: LOW_BODY_SIZE_POLICY_R1_VERSION,
        anchor: 'CURRENT_BODY_WEIGHT_REASONABLE_DEFAULT',
        coefficientsIntroduced: false,
      },
    },
  };

  return deepFreeze({
    ...run,
    modelVersion: LOW_BODY_SIZE_POLICY_R1_VERSION,
    parameterStatus: 'ACTIVE_STANDARD_LOW_BODY_SIZE_R1_OVERLAY',
    referenceSizeEvidence,
    proteinEvidence,
    target: {
      ...run.target,
      status: 'EXECUTABLE_RANGE_NO_POINT_LOW_BODY_SIZE_R1_CONTEXT',
      protectedLower,
      protectedConstraintRange: [protectedLower, Infinity],
      preferredRange: [...preferredRange],
      candidatePreferredRange: [...preferredRange],
      upperContext: preferredRange[1],
      solverEligible: true,
      fourNumberProjectionEligible: false,
      referenceBasis: 'CURRENT_BODY_WEIGHT_LOW_BODY_SIZE_R1_REASONABLE_DEFAULT',
      uncertainty: 'NOT_CALIBRATED_WITH_LOW_BODY_SIZE_CONTEXT',
      divergenceFlags: [],
      selectedPoint: null,
    },
    warnings: [...new Set([...retainedWarnings, CAUTION, RECOMMENDATION])],
    reasonCodes: [...new Set([...retainedReasons, CAUTION, RECOMMENDATION, 'LOW_BODY_SIZE_R1_CURRENT_BODY_WEIGHT_ANCHOR'])],
    openParametersUsed: retainedOpen,
    provenance: {
      ...run.provenance,
      lowBodySizePolicyId: LOW_BODY_SIZE_POLICY_R1_ID,
      lowBodySizePolicyVersion: LOW_BODY_SIZE_POLICY_R1_VERSION,
      lowBodySizePolicyReason: policy.reasonCode,
      existingCandidateRangeReused: true,
      newNumericCoefficientIntroduced: false,
    },
    productionEligible: run.productionEligible,
  });
}

export function lowBodySizePolicyUiConfig(rawConfig = globalThis?.__MB_LOW_BODY_SIZE_POLICY_R1_CONFIG__) {
  const enabled = rawConfig?.enabled !== false;
  return deepFreeze({
    flag: LOW_BODY_SIZE_POLICY_R1_UI_FLAG,
    enabled,
    mode: enabled ? 'AUTHORITATIVE_R1' : 'DISABLED',
    defaultOffInProduction: rawConfig?.enabled !== true,
  });
}
