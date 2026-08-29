export const CARB_PARAMETER_REGISTRY_VERSION = 'carb-parameter-registry-0.3.3';

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};

export const carbParameterSets = freeze({
  LAB_CARB_E02: {
    id: 'LAB_CARB_E02',
    label: 'A7 workload-mode and carbohydrate-reference diagnostic challenger',
    status: 'EXPERIMENTAL_PARAMETER',
    source: 'Owner authorization Prompt 9; MB-06, MB-07, MB-10/10A, MB-22–MB-28, MB-31 and MB-34–MB-36',
    rationale: 'Tests the surviving bimodal architecture without reusing PAL, inventing a workload cutoff, importing A4 reference weight, or turning sports ranges into automatic targets.',
    modelVersion: 'carbohydrate-workload-envelope-0.2.0',
    parameterVersion: 'carb-a7-open-surface-0.2.0',
    values: {
      A7: {
        architecture: {
          ordinaryMode: 'FLEXIBLE_RESIDUAL',
          performanceMode: 'ACTIVE_TRAINING_TARGET',
          decision: 'A7_DECISION_G_HYBRID_ARCHITECTURE_NUMERIC_SURFACE_OPEN'
        },
        generalReferences: {
          carbohydrateRdaGrams: 130,
          rdaClassification: 'POPULATION_REFERENCE_BASED_PRIMARILY_ON_BRAIN_GLUCOSE_USE_NOT_HARD_FLOOR',
          adultAmdrEnergyFraction: [0.45, 0.65],
          amdrClassification: 'SOFT_POPULATION_DISTRIBUTION_REFERENCE_NOT_PERFORMANCE_TARGET'
        },
        sportsGuidanceAnchors: [
          { id: 'LIGHT', gPerKg: [3, 5], context: 'LOW_INTENSITY_OR_SKILL_BASED_ACTIVITY' },
          { id: 'MODERATE', gPerKg: [5, 7], context: 'MODERATE_EXERCISE_PROGRAM_APPROXIMATELY_ONE_HOUR_PER_DAY' },
          { id: 'HIGH', gPerKg: [6, 10], context: 'ENDURANCE_PROGRAM_APPROXIMATELY_ONE_TO_THREE_HOURS_PER_DAY' },
          { id: 'VERY_HIGH', gPerKg: [8, 12], context: 'EXTREME_COMMITMENT_APPROXIMATELY_MORE_THAN_FOUR_TO_FIVE_HOURS_PER_DAY' }
        ],
        sportsAnchorClassification: 'WORKLOAD_MATCHED_PLANNING_GUIDANCE_NOT_EXACT_REQUIREMENT_OR_HARD_FLOOR',
        diagnosticWorkloadMapping: {
          LOW: { workloadEnvelope: ['T0', 'T1'], mode: 'FLEXIBLE_RESIDUAL' },
          MODERATE: { workloadEnvelope: ['T1', 'T2', 'T3'], mode: 'AMBIGUOUS_TRANSITION' },
          HIGH: { workloadEnvelope: ['T3'], mode: 'ACTIVE_TRAINING_TARGET' },
          EXTREME: { workloadEnvelope: ['T4'], mode: 'ACTIVE_TRAINING_TARGET' },
          classification: 'MANUAL_BROAD_WORKLOAD_INTERPRETATION_FOR_DIAGNOSTIC_LAB_NOT_AUTONOMOUS_THRESHOLD'
        },
        selection: {
          autonomousActivationThreshold: null,
          activeRange: null,
          denominatorKg: null,
          selectedCarb: null,
          selectedPosition: null,
          solverEligible: false,
          status: 'OPEN_ACTIVATION_RANGE_DENOMINATOR_AND_POINT'
        }
      }
    }
  },
  LAB_CARB_E03: {
    id: 'LAB_CARB_E03',
    label: 'A7 minimal Standard workload-routing candidate',
    status: 'EXPERIMENTAL_CANDIDATE_V1_SHADOW_ONLY',
    source: 'B3 Prompt 17; A7 frozen hybrid direction; sports-planning comparators retained as context only',
    rationale: 'Closes Standard around residual/contextual semantics and routes high performance demand when no defensible denominator or dose exists. It removes the weak energy-percentage bands and avoids PAL, steps, g/kg, the 130 g floor, and future-training contamination.',
    modelVersion: 'carbohydrate-minimal-standard-routing-0.3.3',
    parameterVersion: 'carb-a7-no-numeric-standard-surface-0.3.1',
    values: {
      A7: {
        architecture: { ordinaryMode: 'FLEXIBLE_RESIDUAL', transitionMode: 'TRANSITION_CONTEXTUAL_PREFERENCE', performanceMode: 'PERFORMANCE_TARGET_NOT_IDENTIFIED', decision: 'A7_MINIMAL_STANDARD_RESIDUAL_CONTEXTUAL_AND_PERFORMANCE_SPECIALIST_ROUTE' },
        generalReferences: {
          carbohydrateRdaGrams: 130,
          rdaClassification: 'POPULATION_REFERENCE_INFORMATIONAL_NOT_SOLVER_FLOOR',
          adultAmdrEnergyFraction: [0.45, 0.65],
          amdrClassification: 'SOFT_POPULATION_DISTRIBUTION_REFERENCE_NOT_PERFORMANCE_TARGET'
        },
        sportsGuidanceAnchors: [
          { id: 'LIGHT', gPerKg: [3, 5], context: 'LOW_INTENSITY_OR_SKILL_BASED_ACTIVITY' },
          { id: 'MODERATE', gPerKg: [5, 7], context: 'MODERATE_EXERCISE_PROGRAM_APPROXIMATELY_ONE_HOUR_PER_DAY' },
          { id: 'HIGH', gPerKg: [6, 10], context: 'ENDURANCE_PROGRAM_APPROXIMATELY_ONE_TO_THREE_HOURS_PER_DAY' },
          { id: 'VERY_HIGH', gPerKg: [8, 12], context: 'EXTREME_COMMITMENT_APPROXIMATELY_MORE_THAN_FOUR_TO_FIVE_HOURS_PER_DAY' }
        ],
        sportsAnchorClassification: 'WORKLOAD_MATCHED_PLANNING_GUIDANCE_NOT_EXACT_REQUIREMENT_OR_HARD_FLOOR',
        diagnosticWorkloadMapping: {
          LOW: { workloadEnvelope: ['T0'], mode: 'FLEXIBLE_RESIDUAL' },
          MODERATE: { workloadEnvelope: ['T1', 'T2'], mode: 'TRANSITION' },
          HIGH: { workloadEnvelope: ['T3'], mode: 'ACTIVE_TRAINING_TARGET' },
          EXTREME: { workloadEnvelope: ['T4'], mode: 'ACTIVE_TRAINING_TARGET' },
          classification: 'BROAD_EVIDENCE_STATE_POLICY_NOT_NUMERIC_OR_BIOLOGICAL_CLIFF'
        },
        rejectedDiagnosticComparators: {
          transitionEnergyFraction: [0.35, 0.55],
          activeEnergyFraction: [0.45, 0.65],
          classification: 'DO_NOT_FREEZE_FALSE_PRECISION',
          solverActive: false
        },
        standardSurface: {
          flexibleResidualRange: null,
          transitionNumericConstraint: null,
          transitionPriority: 'L4_CONTEXTUAL_PREFERENCE_METADATA',
          performanceNumericConstraint: null,
          performanceRoute: 'PERFORMANCE_NUTRITION_SPECIALIST_ROUTE',
          denominatorKg: null,
          selectedCarb: null,
          pointSelector: null
        },
        selection: { autonomousActivationThreshold: null, activeRange: null, denominatorKg: null, selectedCarb: null, selectedPosition: null, solverEligible: true, status: 'STANDARD_MODE_EXECUTABLE_NUMERIC_PERFORMANCE_DOSE_ABSTAINS' }
      }
    }
  }
});

export function getCarbParameterSet(id = 'LAB_CARB_E02') {
  const set = carbParameterSets[id];
  if (!set) throw new RangeError(`Unknown carbohydrate parameter set: ${id}`);
  return set;
}
