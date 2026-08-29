import { getGuardrailParameterSet, GUARDRAIL_PARAMETER_REGISTRY_VERSION } from '../config/guardrailParameterRegistry.js';
import { deepFreeze } from './inputScope.js';

const POLICY_SOURCE = Object.freeze({
  MB03: Object.freeze({ id: 'MB-03', semantics: 'SCOPE_AND_ACTION_TAXONOMY' }),
  MB34: Object.freeze({ id: 'MB-34', semantics: 'SCOPE_BEFORE_PHYSIOLOGY_AND_CONTEXT_ROUTING' }),
  MB35: Object.freeze({ id: 'MB-35', semantics: 'HYBRID_ENERGY_GUARDRAIL_ARCHITECTURE' }),
  A8: Object.freeze({ id: 'MB-24/MB-25', semantics: 'PROTECTED_SET_FEASIBILITY_AND_UPSTREAM_BACKTRACK' }),
  LONGITUDINAL: Object.freeze({ id: 'MB-31/MB-32/MB-33', semantics: 'STATEFUL_CONTROL_CANNOT_CROSS_GUARDRAILS' }),
  NICE: Object.freeze({ id: 'NICE-NG246-2025', semantics: 'LOW_ENERGY_800_TO_1200_AND_VERY_LOW_ENERGY_BELOW_800_SERVICE_ROUTING' }),
  IOC: Object.freeze({ id: 'IOC-REDS-CONSENSUS-2023', semantics: 'MULTI_INDICATOR_ATHLETE_RISK_CONTEXT_NOT_SINGLE_EA_DIAGNOSIS' }),
  FDA_SGLT2: Object.freeze({ id: 'FDA-JARDIANCE-LABEL-2025', semantics: 'KETOGENIC_DIET_AND_REDUCED_CALORIC_INTAKE_ARE_KETOACIDOSIS_PRECIPITATING_FACTORS' }),
  FDA_GLP1: Object.freeze({ id: 'FDA-WEGOVY-LABEL-2026', semantics: 'MEDICATION_AND_GASTROINTESTINAL_OR_VOLUME_DEPLETION_CONTEXT_REQUIRE_REVIEW' })
});

const PROCEED_STATUSES = new Set(['PASS', 'PASS_WITH_CONTEXT', 'WARNING']);
const HIGH_TRAINING = new Set(['HIGH', 'EXTREME']);

export const A9_PIPELINE_ORDER = deepFreeze([
  'TECHNICAL_INPUT_VALIDATION',
  'SCOPE_AND_CONTEXT_ROUTE',
  'ENERGY_PROPOSAL',
  'A9_PRE_SOLVER_ROUTE',
  'A8_PROTECTED_FEASIBILITY',
  'A9_POST_SOLVER_RECHECK',
  'NUTRITION_TARGET_CONTRACT'
]);

export const A9_ROUTING_STATE_CONTRACT = deepFreeze({
  PASS: { fullTargetAfterA8: true, menuAfterCompleteContract: true, longitudinalAdjustment: true,
    meaning: 'A9_HAS_NO_ACTIVE_ROUTING_OBJECTION' },
  PASS_WITH_CONTEXT: { fullTargetAfterA8: true, menuAfterCompleteContract: true, longitudinalAdjustment: true,
    meaning: 'MAY_PROCEED_BUT_NO_MEDICAL_OR_NUTRIENT_SAFETY_CLEARANCE_IS_EMITTED' },
  WARNING: { fullTargetAfterA8: true, menuAfterCompleteContract: true, longitudinalAdjustment: true,
    meaning: 'MAY_PROCEED_WITH_EXPLICIT_NONBLOCKING_CONTEXT' },
  REQUEST_INFORMATION: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'A_REQUIRED_ROUTING_INPUT_IS_MISSING' },
  REVIEW_REQUIRED: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'AUTONOMOUS_FULL_TARGET_IS_WITHHELD_PENDING_REVIEW_OR_POLICY' },
  BLOCKED_STRATEGY: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'USER_INTENT_MAY_REMAIN_BUT_THIS_STRATEGY_MUST_BACKTRACK_OR_ROUTE' },
  SPECIALIST_ROUTE: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'TARGET_BELONGS_TO_A_SEPARATE_VALIDATED_SERVICE_LAYER' },
  MODULE_ABSTAIN: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'A_REQUIRED_GENERAL_MODULE_IS_OUTSIDE_ITS_VALIDATED_DOMAIN' },
  FULL_ABSTAIN: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'NO_AUTOMATED_NUTRITION_TARGET_OUTPUT' },
  TECHNICAL_INVALID: { fullTargetAfterA8: false, menuAfterCompleteContract: false, longitudinalAdjustment: false,
    meaning: 'INPUT_OR_MODULE_CONTRACT_IS_INVALID' }
});

export function evaluateEnergyGuardrail(problem, parameterSet = getGuardrailParameterSet()) {
  const validationError = validateProblem(problem, parameterSet);
  if (validationError) return technicalInvalid(problem, parameterSet, validationError);

  const input = normalizeProblem(problem);
  const a9 = parameterSet.values.A9;
  const contextFlags = collectContextFlags(input.context);
  const base = baseResult(input, parameterSet, contextFlags);

  const upstreamScope = routeUpstreamScope(input);
  if (upstreamScope) {
    return finalizeEarly(base, upstreamScope, [reason('UPSTREAM_SCOPE_ROUTE', POLICY_SOURCE.MB03,
      'SCOPE_STATE_PREVENTS_ORDINARY_A9_EVALUATION')], [], 'NOT_EVALUATED_SCOPE_FIRST');
  }

  const contextScope = routeContextBeforeEnergy(input);
  if (contextScope) {
    return finalizeEarly(base, contextScope, [contextScope.reason], contextScope.openParameters || [],
      'NOT_EVALUATED_SCOPE_FIRST');
  }

  if (input.targetEnergy === null) {
    return finalizeEarly(base, decision(60, 'REQUEST_INFORMATION', 'REQUEST_INFORMATION',
      'RESOLVE_ENERGY_PROPOSAL_BEFORE_A9'), [reason('ENERGY_PROPOSAL_MISSING', POLICY_SOURCE.MB35,
      'GUARDRAIL_NOT_FULLY_ASSESSABLE')], [], 'NOT_EVALUATED_NO_ENERGY_PROPOSAL');
  }

  const energyClass = classifyEnergy(input.targetEnergy, a9);
  const rmrComparison = compareRmr(input.targetEnergy, input.rmr);
  const relativeAggressiveness = assessRelativeAggressiveness(input.targetEnergy, input.teeRange, a9);
  const macroFeasibilityState = assessMacroFeasibility(input, a9);
  const energyAvailabilityContext = assessEnergyAvailability(input.context);
  const reasons = [];
  const openParameters = new Set();
  let selectedDecision = decision(10, 'PASS', 'CONTINUE_TO_A8', 'RUN_A8_AND_RECHECK_A9_POST_SOLVER');

  const addReason = item => {
    if (!reasons.some(existing => existing.code === item.code)) reasons.push(item);
  };
  const promote = candidate => {
    if (candidate.priority > selectedDecision.priority) selectedDecision = candidate;
  };

  if (input.scopeState === 'IN_SCOPE_WITH_WARNING') {
    addReason(reason('UPSTREAM_SCOPE_WARNING', POLICY_SOURCE.MB34,
      'CONTEXT_WARNING_SURVIVES_A9_WITHOUT_BECOMING_A_DIAGNOSIS'));
    promote(decision(46, 'WARNING', 'CONTINUE_WITH_WARNING',
      'RETAIN_UPSTREAM_SCOPE_WARNING_IN_FINAL_CONTRACT'));
  }

  if (energyClass.state === 'VERY_LOW_ENERGY') {
    addReason(reason('VLCD_SPECIALIST_DOMAIN', POLICY_SOURCE.NICE,
      'PRODUCT_ROUTING_THRESHOLD_NOT_BIOLOGICAL_IMPOSSIBILITY'));
    if (input.context.specialistProgram || input.context.clinicianTargetProvenance) {
      addReason(reason('EXTERNAL_SPECIALIST_TARGET_NOT_EXECUTABLE_IN_STANDARD', POLICY_SOURCE.MB35,
        'SPECIALIST_PROVENANCE_REQUIRES_A_SEPARATE_VALIDATED_LAYER'));
      promote(decision(92, 'SPECIALIST_ROUTE', 'SPECIALIST_SERVICE',
        'PRESERVE_EXTERNAL_TARGET_AS_AUDIT_ONLY_AND_EXIT_STANDARD'));
    } else {
      promote(decision(90, 'BLOCKED_STRATEGY', 'SPECIALIST_ROUTE',
        'BACKTRACK_STRATEGY_OR_USE_VALIDATED_SPECIALIST_SERVICE'));
    }
  } else if (energyClass.state === 'LOW_ENERGY') {
    addReason(reason('LOW_ENERGY_SPECIALIST_CONTEXT', POLICY_SOURCE.NICE,
      'HEIGHTENED_SUPPORT_RANGE_WITHOUT_A_UNIVERSAL_BIOLOGICAL_CLIFF'));
    openParameters.add('A9_800_1200_AUTONOMOUS_ACTION_CLASS');
    if (input.context.specialistProgram || input.context.clinicianTargetProvenance) {
      promote(decision(82, 'SPECIALIST_ROUTE', 'SPECIALIST_SERVICE',
        'KEEP_TARGET_IN_SPECIALIST_LAYER_AND_DO_NOT_RECAST_AS_STANDARD'));
    } else {
      promote(decision(74, 'REVIEW_REQUIRED', 'OPEN_PRODUCT_POLICY_REVIEW',
        'DO_NOT_EMIT_AUTONOMOUS_TARGET_UNTIL_PRODUCT_POLICY_OR_SPECIALIST_REVIEW'));
    }
  }

  if ((input.context.specialistProgram || input.context.clinicianTargetProvenance) &&
      energyClass.state === 'ORDINARY_ABSOLUTE_CLASS') {
    addReason(reason('EXTERNAL_SPECIALIST_TARGET_NOT_EXECUTABLE_IN_STANDARD', POLICY_SOURCE.MB35,
      'PROVENANCE_CHANGES_ROUTING_EVEN_WHEN_THE_ABSOLUTE_ENERGY_CLASS_IS_ORDINARY'));
    promote(decision(82, 'SPECIALIST_ROUTE', 'SPECIALIST_SERVICE',
      'KEEP_THE_TARGET_IN_ITS_VALIDATED_SPECIALIST_LAYER'));
  }

  if (rmrComparison.state === 'BELOW_RMR_ESTIMATE') {
    addReason(reason('TARGET_BELOW_RMR_SIGNAL', POLICY_SOURCE.MB35,
      'WARNING_CONTEXT_NOT_INTAKE_FLOOR'));
    openParameters.add('A9_TARGET_RMR_WARNING_SEVERITY');
    promote(decision(45, 'WARNING', 'CONTINUE_WITH_WARNING',
      'REVIEW_RATE_ACTIVITY_AND_NUTRIENT_FEASIBILITY'));
  }

  if (relativeAggressiveness.directionalState === 'DEFICIT_ACROSS_TEE_RANGE') {
    addReason(reason('RELATIVE_AGGRESSIVENESS_NUMERIC_POLICY_OPEN', POLICY_SOURCE.MB35,
      'DEFICIT_IS_QUANTIFIED_BUT_NO_UNIVERSAL_ACTION_THRESHOLD_IS_FROZEN'));
    openParameters.add('A9_RELATIVE_AGGRESSIVENESS_THRESHOLDS');
    promote(decision(30, 'PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
      'CONSUME_SUPPORTED_RATE_OR_REVIEW_RELATIVE_DEFICIT_BEFORE_FINAL_CONTRACT'));
  }

  if (input.rateState === 'OUTSIDE_SUPPORTED_RANGE') {
    addReason(reason('RATE_OUTSIDE_SUPPORTED_RANGE', POLICY_SOURCE.MB35,
      'RATE_MODULE_NOT_A9_OWNS_THE_NUMERIC_BAND'));
    promote(decision(86, 'BLOCKED_STRATEGY', 'UPSTREAM_STRATEGY_BACKTRACK',
      'SELECT_A_SUPPORTED_RATE_OR_DIFFERENT_STRATEGY'));
  } else if (input.rateState === 'UNRESOLVED') {
    addReason(reason('RATE_TARGET_UNRESOLVED', POLICY_SOURCE.MB35,
      'GUARDRAIL_NOT_FULLY_ASSESSABLE_WITHOUT_AN_UPSTREAM_RATE_STATE'));
    openParameters.add('A2_A3_RATE_TO_ENERGY_NUMERIC_SURFACE');
    promote(decision(64, 'REQUEST_INFORMATION', 'GUARDRAIL_NOT_FULLY_ASSESSABLE',
      'RESOLVE_RATE_STATE_BEFORE_FINAL_AUTONOMOUS_TARGET'));
  }

  if (macroFeasibilityState.state === 'INFEASIBLE_PROTECTED') {
    addReason(reason('MACRO_PROTECTED_SET_INFEASIBLE', POLICY_SOURCE.A8,
      'MATHEMATICAL_CURRENT_CONSTRAINT_SET_FAILURE_NOT_BIOLOGICAL_FLOOR'));
    promote(decision(88, 'BLOCKED_STRATEGY', 'UPSTREAM_STRATEGY_BACKTRACK',
      'BACKTRACK_RATE_ENERGY_OR_STRATEGY_WITHOUT_RELAXING_PROTECTED_CONSTRAINTS'));
  } else if (macroFeasibilityState.state === 'INCONSISTENT_UPSTREAM_STATE') {
    addReason(reason('UPSTREAM_MACRO_FEASIBILITY_STATE_INCONSISTENT', POLICY_SOURCE.A8,
      'REPORTED_FEASIBILITY_CONTRADICTS_REPORTED_MINIMUM_ENERGY'));
    promote(decision(100, 'TECHNICAL_INVALID', 'TECHNICAL_INVALID',
      'FIX_A8_TO_A9_FEASIBILITY_CONTRACT'));
  } else if (['UNKNOWN', 'NOT_EVALUATED'].includes(macroFeasibilityState.state)) {
    addReason(reason('PROTECTED_MACRO_FEASIBILITY_NOT_ASSESSABLE', POLICY_SOURCE.A8,
      'A9_CANNOT_DECLARE_COMPLETE_CLEARANCE_BEFORE_A8_HAS_NUMERIC_CONSTRAINTS'));
    promote(decision(31, 'PASS_WITH_CONTEXT', 'CONTINUE_TO_A8',
      'RUN_A8_WHEN_UPSTREAM_NUMERIC_CONSTRAINTS_EXIST_THEN_RECHECK_A9'));
  }

  if (input.micronutrientCoverageState === 'INFEASIBLE_RELIABLY_OBSERVED') {
    addReason(reason('NUTRIENT_COVERAGE_INFEASIBLE', POLICY_SOURCE.MB35,
      'RELIABLE_FOOD_LEVEL_INFEASIBILITY_REQUIRES_STRATEGY_REVIEW'));
    promote(decision(76, 'REVIEW_REQUIRED', 'UPSTREAM_STRATEGY_REVIEW',
      'REVISE_STRATEGY_OR_USE_SPECIALIST_SUPPORT'));
  } else if (['UNKNOWN', 'NOT_EVALUATED'].includes(input.micronutrientCoverageState)) {
    addReason(reason('NUTRIENT_COVERAGE_NOT_ASSESSABLE', POLICY_SOURCE.MB35,
      'MACRO_FIT_DOES_NOT_ESTABLISH_MICRONUTRIENT_OR_FOOD_FEASIBILITY'));
    openParameters.add('A9_MICRONUTRIENT_FOOD_FEASIBILITY_GATE');
    promote(decision(29, 'PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
      'DO_NOT_LABEL_PLAN_NUTRITIONALLY_CLEARED'));
  }

  applyAthleteContext(input, relativeAggressiveness, addReason, openParameters, promote);
  applyGlp1Context(input, addReason, openParameters, promote);
  applyOlderAdultContext(input, energyClass, addReason, openParameters, promote);
  applyLongitudinalContext(input, addReason, openParameters, promote);

  const canProceed = PROCEED_STATUSES.has(selectedDecision.status);
  const result = {
    ...base,
    status: selectedDecision.status,
    energyClass,
    relativeAggressiveness,
    rmrComparison,
    macroFeasibilityState,
    energyAvailabilityContext,
    route: selectedDecision.route,
    reasonCodes: reasons.map(item => item.code),
    reasonDetails: reasons,
    policySource: uniqueSources(reasons),
    openParametersUsed: [...openParameters].sort(),
    nextAction: selectedDecision.nextAction,
    energyDisposition: {
      candidateEnergy: input.targetEnergy,
      authorizedEnergyForNextStage: canProceed ? input.targetEnergy : null,
      clamped: false,
      biologicalSafetyLabelEmitted: false
    },
    permissions: permissionsFor(selectedDecision.status),
    postSolverRecheckRequired: true,
    hysteresis: {
      architectureRequiredForRepeatedBoundaryAdjustments: true,
      numericBand: a9.longitudinalHysteresisBand,
      productBoundaryDiscontinuity: true,
      biologicalCliffClaim: false
    }
  };
  return deepFreeze(result);
}

function applyAthleteContext(input, relative, addReason, openParameters, promote) {
  const athlete = input.context.athlete === true || HIGH_TRAINING.has(input.context.trainingDemand);
  if (!athlete) return;
  openParameters.add('A9_ATHLETE_REDS_ROUTING_INSTRUMENT');
  const signals = input.context.redsWarningSignals;
  const deficitContext = relative.directionalState === 'DEFICIT_ACROSS_TEE_RANGE' || input.strategyDirection === 'LOSS';
  if (signals.length && deficitContext) {
    addReason(reason('REDS_WARNING_CONTEXT', POLICY_SOURCE.IOC,
      'MULTI_INDICATOR_CONTEXT_BLOCKS_AGGRESSIVE_AUTOMATION_WITHOUT_DIAGNOSING_REDS'));
    promote(decision(89, 'BLOCKED_STRATEGY', 'PROFESSIONAL_REVIEW',
      'STOP_AGGRESSIVE_DEFICIT_AUTOMATION_AND_ROUTE_ATHLETE_REVIEW'));
    return;
  }
  if (input.context.athleteLowEnergyConcern === true) {
    addReason(reason('ATHLETE_LOW_ENERGY_REVIEW', POLICY_SOURCE.IOC,
      'WORKLOAD_AND_CONTEXT_REQUIRE_REVIEW_WITHOUT_AN_EA_CLIFF'));
    promote(decision(78, 'REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW',
      'REVIEW_TRAINING_DEMAND_INTAKE_AND_SYMPTOMS'));
    return;
  }
  if (relative.directionalState === 'DEFICIT_ACROSS_TEE_RANGE') {
    addReason(reason('ATHLETE_RELATIVE_DEFICIT_CONTEXT', POLICY_SOURCE.IOC,
      'TRAINING_DEMAND_RAISES_CONTEXT_BUT_NO_SINGLE_EA_THRESHOLD_IS_USED'));
    promote(decision(36, 'PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
      'ASSESS_ATHLETE_WARNING_SIGNALS_BEFORE_FINAL_DEFICIT_AUTOMATION'));
  }
}

function applyGlp1Context(input, addReason, openParameters, promote) {
  if (!input.context.medications.includes('GLP1')) return;
  addReason(reason('GLP1_MEDICATION_CONTEXT', POLICY_SOURCE.FDA_GLP1,
    'MEDICATION_USE_ALONE_DOES_NOT_AUTOMATICALLY_EXCLUDE_GENERAL_SCOPE'));
  openParameters.add('A9_GLP1_LOW_INTAKE_ROUTE');
  if (input.context.glp1LowSpontaneousIntake && input.context.furtherDeficitRequested) {
    addReason(reason('GLP1_LOW_INTAKE_FURTHER_DEFICIT_CONFLICT', POLICY_SOURCE.MB35,
      'HIGH_PROTEIN_OR_SUPPLEMENTS_CANNOT_RESCUE_MECHANICAL_FURTHER_RESTRICTION'));
    promote(decision(87, 'BLOCKED_STRATEGY', 'PROFESSIONAL_REVIEW',
      'DO_NOT_ADD_FURTHER_DEFICIT_AND_REVIEW_ADEQUACY_MEDICATION_AND_SYMPTOMS'));
  } else if (input.context.glp1LowSpontaneousIntake) {
    addReason(reason('GLP1_LOW_SPONTANEOUS_INTAKE_REVIEW', POLICY_SOURCE.MB35,
      'LOW_INTAKE_REQUIRES_ADEQUACY_AND_MEDICATION_CONTEXT_REVIEW'));
    promote(decision(77, 'REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW',
      'REVIEW_INTAKE_TOLERANCE_HYDRATION_AND_NUTRIENT_ADEQUACY'));
  } else {
    promote(decision(28, 'PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
      'RETAIN_MEDICATION_CONTEXT_AND_REEVALUATE_IF_INTAKE_OR_SYMPTOMS_CHANGE'));
  }
}

function applyOlderAdultContext(input, energyClass, addReason, openParameters, promote) {
  if (!input.context.olderAdult) return;
  addReason(reason('OLDER_ADULT_CONTEXT_NO_FIXED_FLOOR', POLICY_SOURCE.MB35,
    'AGE_ALONE_DOES_NOT_CREATE_A_CALORIE_FLOOR'));
  openParameters.add('A9_OLDER_ADULT_LOW_ENERGY_REVIEW_POLICY');
  if (input.context.lowReserveSignals === true || energyClass.state === 'LOW_ENERGY') {
    promote(decision(75, 'REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW',
      'REVIEW_FUNCTION_BODY_MASS_NUTRIENT_DENSITY_AND_STRATEGY'));
  } else {
    promote(decision(27, 'PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
      'RETAIN_AGE_AND_RESERVE_CONTEXT_WITHOUT_A_NUMERIC_MULTIPLIER'));
  }
}

function applyLongitudinalContext(input, addReason, openParameters, promote) {
  if (input.longitudinal.signal === 'TOO_FAST') {
    addReason(reason('LONGITUDINAL_TOO_FAST', POLICY_SOURCE.LONGITUDINAL,
      'OBSERVED_RESPONSE_OVERRIDES_A_DAY_ONE_NUMERIC_PASS'));
    promote(decision(87, 'BLOCKED_STRATEGY', 'UPSTREAM_STRATEGY_BACKTRACK',
      'STOP_FURTHER_REDUCTION_AND_REVIEW_THE_CURRENT_SEGMENT'));
  }
  if (input.longitudinal.signal === 'PLATEAU' && input.longitudinal.proposedAdjustment === 'DECREASE') {
    addReason(reason('PLATEAU_DOES_NOT_BYPASS_GUARDRAIL', POLICY_SOURCE.LONGITUDINAL,
      'NO_AUTOMATIC_FURTHER_CUT_NEAR_OR_INSIDE_LOW_ENERGY_ROUTING'));
    openParameters.add('A9_LONGITUDINAL_HYSTERESIS_BAND');
  }
}

function routeUpstreamScope(input) {
  const state = input.scopeState;
  if (['IN_SCOPE', 'IN_SCOPE_WITH_WARNING'].includes(state)) return null;
  if (state === 'TECHNICAL_INVALID') return decision(100, 'TECHNICAL_INVALID', 'TECHNICAL_INVALID', 'FIX_UPSTREAM_INPUT');
  if (state === 'FULL_ABSTAIN') return decision(98, 'FULL_ABSTAIN', 'FULL_ABSTAIN', 'NO_AUTOMATED_OUTPUT');
  if (['OUT_OF_SCOPE', 'MODULE_ABSTAIN', 'MODULE_BLOCKED'].includes(state)) {
    return decision(95, 'MODULE_ABSTAIN', 'SPECIALIST_ROUTE', 'USE_A_VALIDATED_SPECIALIZED_MODULE');
  }
  if (state === 'BLOCKED_STRATEGY') return decision(92, 'BLOCKED_STRATEGY', 'UPSTREAM_STRATEGY_BACKTRACK', 'CHANGE_STRATEGY');
  if (['PROFESSIONAL_REVIEW', 'REVIEW_REQUIRED'].includes(state)) {
    return decision(85, 'REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW', 'REVIEW_BEFORE_AUTOMATION');
  }
  return decision(65, 'REQUEST_INFORMATION', 'REQUEST_INFORMATION', 'RESOLVE_SCOPE_STATE');
}

function routeContextBeforeEnergy(input) {
  const context = input.context;
  const clinical = new Set(context.clinicalFlags);
  if (context.pregnancy || clinical.has('PREGNANCY')) {
    return {
      ...decision(96, 'MODULE_ABSTAIN', 'SPECIALIST_ROUTE', 'USE_PREGNANCY_SPECIFIC_CLINICAL_FRAMEWORK'),
      reason: reason('PREGNANCY_SPECIALIZED_DOMAIN', POLICY_SOURCE.MB34,
        'GENERAL_ADULT_ENERGY_GUARDRAILS_DO_NOT_AUTHORIZE_A_TARGET')
    };
  }
  if (context.ckd || clinical.has('CKD')) {
    return {
      ...decision(96, 'MODULE_ABSTAIN', 'SPECIALIST_ROUTE', 'USE_RENAL_SPECIFIC_VALIDATED_CONSTRAINTS'),
      reason: reason('CKD_GENERIC_TARGET_MODULE_ABSTAIN', POLICY_SOURCE.MB34,
        'A9_DOES_NOT_BECOME_RENAL_TREATMENT_LOGIC')
    };
  }
  if (context.recentBariatric || clinical.has('RECENT_BARIATRIC')) {
    return {
      ...decision(96, 'MODULE_ABSTAIN', 'SPECIALIST_ROUTE', 'USE_BARIATRIC_STAGE_SPECIFIC_PROTOCOL'),
      reason: reason('RECENT_BARIATRIC_SPECIALIZED_DOMAIN', POLICY_SOURCE.MB34,
        'LOW_ENERGY_AND_HIGH_PROTEIN_DO_NOT_CREATE_AN_ORDINARY_STANDARD_SUCCESS')
    };
  }
  if (context.medications.includes('SGLT2') && context.dietStrategy === 'KETOGENIC') {
    return {
      ...decision(94, 'BLOCKED_STRATEGY', 'PROFESSIONAL_REVIEW', 'DO_NOT_AUTOMATE_KETOGENIC_STRATEGY_WITH_SGLT2'),
      reason: reason('SGLT2_KETOGENIC_CONFLICT', POLICY_SOURCE.FDA_SGLT2,
        'EXPLICIT_MEDICATION_STRATEGY_CONFLICT_NOT_GENERIC_WARNING')
    };
  }
  if (context.lactation || context.recentPostpartum) {
    return {
      ...decision(84, 'REVIEW_REQUIRED', 'SPECIALIST_ROUTE', 'USE_LIFE_STAGE_SPECIFIC_REVIEW_BEFORE_TARGET'),
      reason: reason('LACTATION_POSTPARTUM_POLICY_OPEN', POLICY_SOURCE.MB34,
        'NO_ORDINARY_STANDARD_TARGET_WITHOUT_A_LIFE_STAGE_POLICY'),
      openParameters: ['A9_LACTATION_POSTPARTUM_ROUTE']
    };
  }
  if (clinical.has('ACTIVE_EATING_DISORDER') || clinical.has('ACUTE_ILLNESS') || clinical.has('UNINTENTIONAL_WEIGHT_LOSS')) {
    return {
      ...decision(93, 'REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW', 'PAUSE_ORDINARY_WEIGHT_MANAGEMENT_AUTOMATION'),
      reason: reason('CLINICAL_CONTEXT_OVERRIDES_NUMERIC_GUARDRAIL', POLICY_SOURCE.MB34,
        'CONTEXT_ROUTE_PRECEDES_ENERGY_ARITHMETIC')
    };
  }
  return null;
}

function normalizeProblem(problem) {
  const context = problem.context || {};
  return {
    targetEnergy: problem.targetEnergy ?? null,
    teeRange: normalizeTeeRange(problem.teeRange ?? problem.tee ?? null),
    rmr: problem.rmr ?? null,
    scopeState: problem.scopeState || 'IN_SCOPE',
    scopeReasons: [...(problem.scopeReasons || [])],
    strategyDirection: String(problem.strategyDirection || 'UNKNOWN').toUpperCase(),
    rateState: String(problem.rateState || 'UNRESOLVED').toUpperCase(),
    macroFeasibilityState: String(problem.macroFeasibilityState || 'UNKNOWN').toUpperCase(),
    minimumEnergyForCurrentProtectedConstraintSet: problem.minimumEnergyForCurrentProtectedConstraintSet ?? null,
    micronutrientCoverageState: String(problem.micronutrientCoverageState || 'UNKNOWN').toUpperCase(),
    phase: String(problem.phase || 'PRE_SOLVER').toUpperCase(),
    context: {
      ...context,
      medications: [...(context.medications || [])].map(item => String(item).toUpperCase()).sort(),
      dietStrategy: String(context.dietStrategy || 'NONE').toUpperCase(),
      trainingDemand: String(context.trainingDemand || 'UNKNOWN').toUpperCase(),
      redsWarningSignals: [...(context.redsWarningSignals || [])].map(String).sort(),
      clinicalFlags: [...(context.clinicalFlags || [])].map(item => String(item).toUpperCase()).sort()
    },
    longitudinal: {
      signal: String(problem.longitudinal?.signal || 'NONE').toUpperCase(),
      proposedAdjustment: String(problem.longitudinal?.proposedAdjustment || 'NONE').toUpperCase()
    }
  };
}

function validateProblem(problem, parameterSet) {
  if (!problem || typeof problem !== 'object') return 'PROBLEM_OBJECT_REQUIRED';
  if (!parameterSet || parameterSet.id !== 'LAB_GUARDRAIL_E02') return 'LAB_GUARDRAIL_E02_PARAMETER_SET_REQUIRED';
  if (problem.targetEnergy !== null && problem.targetEnergy !== undefined &&
      (!Number.isFinite(problem.targetEnergy) || problem.targetEnergy <= 0)) return 'POSITIVE_FINITE_TARGET_ENERGY_REQUIRED';
  if (problem.rmr !== null && problem.rmr !== undefined && (!Number.isFinite(problem.rmr) || problem.rmr <= 0)) {
    return 'POSITIVE_FINITE_RMR_OR_NULL_REQUIRED';
  }
  if (problem.teeRange !== null && problem.teeRange !== undefined && problem.tee !== null && problem.tee !== undefined) {
    return 'USE_TEE_OR_TEE_RANGE_NOT_BOTH';
  }
  if (!validTee(problem.teeRange ?? problem.tee ?? null)) return 'VALID_POSITIVE_TEE_OR_ORDERED_TEE_RANGE_REQUIRED';
  if (problem.minimumEnergyForCurrentProtectedConstraintSet !== null &&
      problem.minimumEnergyForCurrentProtectedConstraintSet !== undefined &&
      (!Number.isFinite(problem.minimumEnergyForCurrentProtectedConstraintSet) ||
       problem.minimumEnergyForCurrentProtectedConstraintSet < 0)) return 'NONNEGATIVE_FINITE_PROTECTED_MINIMUM_OR_NULL_REQUIRED';
  if (problem.context?.medications !== undefined && !Array.isArray(problem.context.medications)) return 'MEDICATIONS_ARRAY_REQUIRED';
  if (problem.context?.redsWarningSignals !== undefined && !Array.isArray(problem.context.redsWarningSignals)) return 'REDS_WARNING_SIGNALS_ARRAY_REQUIRED';
  if (problem.context?.clinicalFlags !== undefined && !Array.isArray(problem.context.clinicalFlags)) return 'CLINICAL_FLAGS_ARRAY_REQUIRED';
  return null;
}

function validTee(value) {
  if (value === null || value === undefined) return true;
  if (Number.isFinite(value)) return value > 0;
  if (Array.isArray(value) && value.length === 2) {
    return value.every(item => Number.isFinite(item) && item > 0) && value[0] <= value[1];
  }
  if (typeof value === 'object') {
    return Number.isFinite(value.lower) && Number.isFinite(value.upper) && value.lower > 0 && value.lower <= value.upper;
  }
  return false;
}

function normalizeTeeRange(value) {
  if (value === null || value === undefined) return null;
  if (Number.isFinite(value)) return [value, value];
  if (Array.isArray(value)) return [value[0], value[1]];
  return [value.lower, value.upper];
}

function classifyEnergy(target, a9) {
  const routing = a9.absoluteRouting;
  if (target < routing.veryLowEnergyUpperExclusiveKcal) {
    return {
      state: 'VERY_LOW_ENERGY',
      interval: `[0,${routing.veryLowEnergyUpperExclusiveKcal})`,
      semantics: routing.semantics,
      biologicalCliff: false
    };
  }
  if (target >= routing.lowEnergyLowerInclusiveKcal && target < routing.lowEnergyUpperExclusiveKcal) {
    return {
      state: 'LOW_ENERGY',
      interval: `[${routing.lowEnergyLowerInclusiveKcal},${routing.lowEnergyUpperExclusiveKcal})`,
      semantics: routing.semantics,
      biologicalCliff: false
    };
  }
  return {
    state: 'ORDINARY_ABSOLUTE_CLASS',
    interval: `[${routing.lowEnergyUpperExclusiveKcal},+inf)`,
    semantics: 'ABSENCE_OF_LOW_ENERGY_CLASS_IS_NOT_SAFETY_CLEARANCE',
    biologicalCliff: false
  };
}

function compareRmr(target, rmr) {
  if (rmr === null) {
    return { state: 'UNKNOWN', targetToRmrRatio: null, hardStop: false,
      semantics: 'RMR_COMPARISON_NOT_ASSESSABLE' };
  }
  const state = target < rmr ? 'BELOW_RMR_ESTIMATE' : target === rmr ? 'AT_RMR_ESTIMATE' : 'ABOVE_RMR_ESTIMATE';
  return { state, rmr, differenceKcal: target - rmr, targetToRmrRatio: target / rmr,
    hardStop: false, semantics: 'CONTEXT_SIGNAL_NOT_BIOLOGICAL_INTAKE_FLOOR' };
}

function assessRelativeAggressiveness(target, teeRange, a9) {
  if (!teeRange) {
    return { state: 'NOT_ASSESSABLE', directionalState: 'UNKNOWN_TEE', teeRange: null,
      deficitKcalAgainstEndpoints: null, deficitFractionAgainstEndpoints: null,
      targetToTeeRatioAgainstEndpoints: null, classification: 'NOT_CALIBRATED',
      thresholdsUsed: a9.relativeAggressivenessThresholds };
  }
  const [lower, upper] = teeRange;
  const againstLower = lower - target;
  const againstUpper = upper - target;
  const directionalState = target < lower ? 'DEFICIT_ACROSS_TEE_RANGE'
    : target > upper ? 'SURPLUS_ACROSS_TEE_RANGE'
      : 'WITHIN_TEE_RANGE';
  return {
    state: 'QUANTIFIED_NOT_CLASSIFIED',
    directionalState,
    teeRange: { lower, upper },
    deficitKcalAgainstEndpoints: { lowerTeeEndpoint: againstLower, upperTeeEndpoint: againstUpper },
    deficitFractionAgainstEndpoints: { lowerTeeEndpoint: againstLower / lower, upperTeeEndpoint: againstUpper / upper },
    targetToTeeRatioAgainstEndpoints: { lowerTeeEndpoint: target / lower, upperTeeEndpoint: target / upper },
    classification: 'NOT_CALIBRATED',
    thresholdsUsed: a9.relativeAggressivenessThresholds,
    semantics: 'RELATIVE_SIGNAL_NOT_UNIVERSAL_MAX_PERCENT_DEFICIT'
  };
}

function assessMacroFeasibility(input, a9) {
  const minimum = input.minimumEnergyForCurrentProtectedConstraintSet;
  let state = input.macroFeasibilityState;
  let consistency = 'NOT_CHECKABLE';
  if (minimum !== null && input.targetEnergy !== null) {
    consistency = input.targetEnergy < minimum ? 'TARGET_BELOW_REPORTED_PROTECTED_MINIMUM' : 'TARGET_AT_OR_ABOVE_REPORTED_PROTECTED_MINIMUM';
    if (state === 'FEASIBLE' && input.targetEnergy < minimum) state = 'INCONSISTENT_UPSTREAM_STATE';
  }
  return {
    state,
    minimumEnergyForCurrentProtectedConstraintSet: minimum,
    minimumEnergySemantic: a9.protectedFeasibilitySemantic,
    consistency,
    establishesBiologicalSafety: false
  };
}

function assessEnergyAvailability(context) {
  const estimate = Number.isFinite(context.energyAvailabilityEstimate) ? context.energyAvailabilityEstimate : null;
  return {
    estimate,
    state: estimate === null ? 'NOT_ASSESSABLE' : 'REFERENCE_ONLY',
    diagnosticThreshold: null,
    diagnosticClaim: false,
    semantics: 'ATHLETE_CONTEXT_SIGNAL_NOT_SINGLE_NUMBER_REDS_DIAGNOSIS'
  };
}

function collectContextFlags(context) {
  const flags = [];
  for (const key of ['athlete', 'athleteLowEnergyConcern', 'pregnancy', 'lactation', 'recentPostpartum',
    'ckd', 'recentBariatric', 'specialistProgram', 'clinicianTargetProvenance',
    'glp1LowSpontaneousIntake', 'furtherDeficitRequested', 'olderAdult', 'lowReserveSignals']) {
    if (context[key] === true) flags.push(key.toUpperCase());
  }
  for (const medication of context.medications) flags.push(`MEDICATION_${medication}`);
  for (const clinical of context.clinicalFlags) flags.push(`CLINICAL_${clinical}`);
  if (context.trainingDemand !== 'UNKNOWN') flags.push(`TRAINING_DEMAND_${context.trainingDemand}`);
  if (context.dietStrategy !== 'NONE') flags.push(`DIET_STRATEGY_${context.dietStrategy}`);
  if (context.redsWarningSignals.length) flags.push('REDS_WARNING_SIGNALS_PRESENT');
  return [...new Set(flags)].sort();
}

function permissionsFor(status) {
  const state = A9_ROUTING_STATE_CONTRACT[status] || A9_ROUTING_STATE_CONTRACT.TECHNICAL_INVALID;
  const proceed = PROCEED_STATUSES.has(status);
  return {
    energyProposalMayProceedToA8: proceed,
    fullTargetMayBeEmittedAfterCompleteA8: state.fullTargetAfterA8,
    menuMayRunNow: false,
    menuMayRunAfterCompleteTargetContract: state.menuAfterCompleteContract,
    longitudinalMayAdjust: state.longitudinalAdjustment,
    everyAdjustmentRequiresA9Recheck: true,
    stateMeaning: state.meaning
  };
}

function decision(priority, status, route, nextAction) {
  return { priority, status, route, nextAction };
}

function reason(code, source, semantics) {
  return { code, sourceId: source.id, sourceSemantics: source.semantics, semantics };
}

function uniqueSources(reasons) {
  const sourceIds = [...new Set(reasons.map(item => item.sourceId))];
  return sourceIds.map(sourceId => ({ sourceId,
    semantics: reasons.find(item => item.sourceId === sourceId).sourceSemantics }));
}

function baseResult(input, parameterSet, contextFlags) {
  return {
    modelId: parameterSet.id,
    modelVersion: parameterSet.modelVersion,
    policyVersion: parameterSet.policyVersion,
    registryVersion: GUARDRAIL_PARAMETER_REGISTRY_VERSION,
    architecture: parameterSet.values.A9.architecture,
    phase: input.phase,
    targetEnergy: input.targetEnergy,
    scopeState: input.scopeState,
    scopeReasons: input.scopeReasons,
    contextFlags,
    connectedToScientificPipeline: parameterSet.connectedToScientificPipeline,
    connectedToProduction: parameterSet.connectedToProduction,
    productionEligible: parameterSet.productionEligible
  };
}

function finalizeEarly(base, selectedDecision, reasons, openParameters, energyClassState) {
  return deepFreeze({
    ...base,
    status: selectedDecision.status,
    energyClass: { state: energyClassState, semantics: 'SCOPE_OR_REQUIRED_INPUT_PRECEDES_ENERGY_ROUTING' },
    relativeAggressiveness: { state: 'NOT_EVALUATED', classification: 'NOT_CALIBRATED' },
    rmrComparison: { state: 'NOT_EVALUATED', hardStop: false },
    macroFeasibilityState: { state: 'NOT_EVALUATED', minimumEnergyForCurrentProtectedConstraintSet: null,
      minimumEnergySemantic: 'MATHEMATICAL_THRESHOLD_NOT_BIOLOGICAL_FLOOR' },
    energyAvailabilityContext: { state: 'NOT_EVALUATED', diagnosticClaim: false },
    route: selectedDecision.route,
    reasonCodes: reasons.map(item => item.code),
    reasonDetails: reasons,
    policySource: uniqueSources(reasons),
    openParametersUsed: [...openParameters].sort(),
    nextAction: selectedDecision.nextAction,
    energyDisposition: { candidateEnergy: base.targetEnergy, authorizedEnergyForNextStage: null,
      clamped: false, biologicalSafetyLabelEmitted: false },
    permissions: permissionsFor(selectedDecision.status),
    postSolverRecheckRequired: false,
    hysteresis: { architectureRequiredForRepeatedBoundaryAdjustments: true, numericBand: null,
      productBoundaryDiscontinuity: true, biologicalCliffClaim: false }
  });
}

function technicalInvalid(problem, parameterSet, error) {
  const targetEnergy = problem && typeof problem === 'object' ? problem.targetEnergy ?? null : null;
  return deepFreeze({
    modelId: parameterSet?.id || 'LAB_GUARDRAIL_E02',
    modelVersion: parameterSet?.modelVersion || null,
    policyVersion: parameterSet?.policyVersion || null,
    registryVersion: GUARDRAIL_PARAMETER_REGISTRY_VERSION,
    architecture: parameterSet?.values?.A9?.architecture || null,
    phase: null,
    targetEnergy,
    scopeState: null,
    scopeReasons: [],
    contextFlags: [],
    status: 'TECHNICAL_INVALID',
    energyClass: { state: 'NOT_EVALUATED_TECHNICAL_INVALID' },
    relativeAggressiveness: { state: 'NOT_EVALUATED', classification: 'NOT_CALIBRATED' },
    rmrComparison: { state: 'NOT_EVALUATED', hardStop: false },
    macroFeasibilityState: { state: 'NOT_EVALUATED' },
    energyAvailabilityContext: { state: 'NOT_EVALUATED', diagnosticClaim: false },
    route: 'TECHNICAL_INVALID',
    reasonCodes: [error],
    reasonDetails: [{ code: error, sourceId: 'LAB_GUARDRAIL_E02_INPUT_CONTRACT',
      sourceSemantics: 'TECHNICAL_VALIDATION', semantics: 'FIX_INPUT_BEFORE_ROUTING' }],
    policySource: [{ sourceId: 'LAB_GUARDRAIL_E02_INPUT_CONTRACT', semantics: 'TECHNICAL_VALIDATION' }],
    openParametersUsed: [],
    nextAction: 'FIX_INPUT',
    energyDisposition: { candidateEnergy: targetEnergy, authorizedEnergyForNextStage: null,
      clamped: false, biologicalSafetyLabelEmitted: false },
    permissions: permissionsFor('TECHNICAL_INVALID'),
    postSolverRecheckRequired: false,
    hysteresis: { architectureRequiredForRepeatedBoundaryAdjustments: true, numericBand: null,
      productBoundaryDiscontinuity: true, biologicalCliffClaim: false },
    connectedToScientificPipeline: false,
    connectedToProduction: false,
    productionEligible: false
  });
}
