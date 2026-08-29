import { buildCarbohydrateEvidence } from './carbLab.js';
import { deepFreeze } from './inputScope.js';

export function buildExecutableCarbohydrateEnvelope(profile, energyKcal, a7) {
  const base = buildCarbohydrateEvidence(profile, energyKcal, a7);
  const evidence = base.workloadEvidence;
  const mapping = a7.diagnosticWorkloadMapping;
  const configured = mapping[evidence.broadWorkload];
  const specialized = evidence.trainingPhase && ['COMPETITION', 'CARB_LOADING', 'TAPER', 'WEIGHT_CUT'].includes(evidence.trainingPhase);
  const endurance = ['RUNNING', 'CYCLING', 'SWIMMING', 'ROWING', 'ENDURANCE'].includes(evidence.modality);
  const resistance = evidence.modality === 'RESISTANCE';
  const repeatedLongEndurance = endurance && Number(evidence.sessionsPerWeek) >= 3
    && Number(evidence.typicalDurationMinutes) >= 90;
  const moderateHighResistance = resistance && Number(evidence.sessionsPerWeek) >= 5
    && Number(evidence.typicalDurationMinutes) >= 75 && evidence.broadWorkload === 'MODERATE';
  const boundaryAmbiguous = repeatedLongEndurance || moderateHighResistance;
  const unresolvedTrainingInput = evidence.trainingInputState === 'PARTIAL_OR_UNKNOWN_TRAINING';
  const mode = !evidence.realized ? 'FLEXIBLE_RESIDUAL'
    : unresolvedTrainingInput || evidence.contradictions.length ? 'AMBIGUOUS'
      : specialized || evidence.twoADay === true || ['HIGH', 'EXTREME'].includes(evidence.broadWorkload) ? 'ACTIVE_TRAINING_TARGET'
        : boundaryAmbiguous ? 'AMBIGUOUS'
        : configured?.mode || 'AMBIGUOUS';
  const active = mode === 'ACTIVE_TRAINING_TARGET';
  const unresolvedPerformanceBoundary = mode === 'AMBIGUOUS';
  const lowCarbRequested = ['LOW_CARB', 'KETOGENIC'].includes(profile.lowCarbPreference);
  const transition = mode === 'TRANSITION';
  const lowCarbConflict = lowCarbRequested && active
    ? { ...base.lowCarbConflict, state: 'PREFERENCE_PERFORMANCE_CONFLICT', hierarchy: 'L3_DEMAND_OUTRANKS_L6_PREFERENCE' }
    : lowCarbRequested && unresolvedPerformanceBoundary
      ? { ...base.lowCarbConflict, state: 'POSSIBLE_PERFORMANCE_CONFLICT_REQUIRES_REVIEW', hierarchy: 'UNRESOLVED_L3_VS_L6' }
      : lowCarbRequested && transition
        ? { ...base.lowCarbConflict, state: 'CONTEXTUAL_TRAINING_PREFERENCE_OUTRANKS_LOW_CARB', hierarchy: 'L4_CONTEXT_OUTRANKS_L6_PREFERENCE' }
        : base.lowCarbConflict;
  const route = active ? 'PERFORMANCE_NUTRITION_SPECIALIST_ROUTE'
    : unresolvedPerformanceBoundary ? 'REQUEST_INFORMATION_FOR_MODE_CLASSIFICATION' : 'STANDARD';
  const warnings = [...base.warnings,
    'NO_NUMERIC_STANDARD_CARB_SURFACE',
    ...evidence.reasonCodes,
    ...(boundaryAmbiguous ? ['TRANSITION_ACTIVE_BOUNDARY_REQUIRES_REVIEW'] : []),
    ...(unresolvedTrainingInput ? ['PARTIAL_TRAINING_INPUT_REQUIRES_INFORMATION'] : []),
    ...(lowCarbRequested && transition ? ['LOW_CARB_YIELDS_TO_CONTEXTUAL_TRAINING_PREFERENCE'] : []),
    ...(active ? ['PERFORMANCE_TARGET_NOT_IDENTIFIED_ROUTE_PERFORMANCE_NUTRITION_SPECIALIST'] : [])];
  return deepFreeze({
    ...base,
    architectureStatus: 'EXECUTABLE_MODE_AND_ROUTING_NO_NUMERIC_STANDARD_DOSE',
    numericSurfaceStatus: active ? 'PERFORMANCE_NUMERIC_TARGET_NOT_IDENTIFIED' : 'NO_NUMERIC_CONSTRAINT_REQUIRED_IN_STANDARD',
    mode,
    activationStatus: active ? 'HIGH_PERFORMANCE_DEMAND_IDENTIFIED_NUMERIC_TARGET_ABSTAINS' : base.activationStatus,
    activeRange: null,
    preferredRange: null,
    selectedCarb: null,
    selectionReason: active ? 'PERFORMANCE_DEMAND_REQUIRES_EXTERNAL_SPECIALIST_ASSESSMENT_NO_INTERNAL_RESOLVER'
      : mode === 'TRANSITION' ? 'CONTEXTUAL_CARB_PREFERENCE_ACTIVE_NO_NUMERIC_CONSTRAINT'
        : unresolvedPerformanceBoundary ? 'TRANSITION_ACTIVE_BOUNDARY_REQUIRES_INFORMATION_FOR_MODE_CLASSIFICATION'
          : 'FLEXIBLE_RESIDUAL_CARB_NO_NUMERIC_TARGET',
    solverEligible: !active && !unresolvedPerformanceBoundary,
    solverBlockReason: active ? 'STANDARD_CANNOT_IDENTIFY_PERFORMANCE_DOSE_OR_DENOMINATOR'
      : unresolvedPerformanceBoundary ? 'TRAINING_DEMAND_COULD_REQUIRE_UNIDENTIFIED_PERFORMANCE_TARGET' : null,
    route,
    compatibleModes: mode === 'AMBIGUOUS' ? ['TRANSITION', 'ACTIVE_TRAINING_TARGET'] : [mode],
    contextualPreferenceActive: mode === 'TRANSITION',
    lowCarbConflict,
    carbConstraintSemantics: active ? {
      level: 'L3', semanticClass: 'PERFORMANCE_DEMAND_SIGNAL', range: null,
      canYield: false, nextAction: 'PERFORMANCE_NUTRITION_SPECIALIST_ROUTE',
      denominator: null, classification: 'DEMAND_DIRECTION_SUPPORTED_DOSE_NOT_IDENTIFIED'
    } : mode === 'TRANSITION' ? {
      level: 'L4', semanticClass: 'CONTEXTUAL_PREFERENCE_METADATA', range: null,
      canYield: true, denominator: null, classification: 'NO_NUMERIC_CONSTRAINT_REQUIRED'
    } : {
      level: null, semanticClass: 'FLEXIBLE_RESIDUAL', range: null,
      canYield: true, denominator: null, classification: 'ARCHITECTURE_DIRECTION'
    },
    rejectedDiagnosticComparators: a7.rejectedDiagnosticComparators,
    openParametersUsed: active || unresolvedPerformanceBoundary ? ['A7_ADVANCED_PERFORMANCE_DOSE_AND_DENOMINATOR'] : [],
    warnings
  });
}
