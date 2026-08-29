export const PROTEIN_PARAMETER_REGISTRY_VERSION = 'protein-parameter-registry-0.3.0';

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};

export const proteinParameterSets = freeze({
  LAB_PROTEIN_E02: {
    id: 'LAB_PROTEIN_E02',
    label: 'A4/A5 multi-anchor diagnostic challenger',
    status: 'EXPERIMENTAL_PARAMETER',
    source: 'Owner authorization Prompt 7; MB-05, MB-14–MB-19, MB-24, MB-25, MB-34 and MB-35',
    rationale: 'Replaces neither LAB_E01 nor production. It tests reference-size evidence without silently selecting a universal denominator or applying a body-weight density to FFM.',
    modelVersion: 'protein-reference-size-multi-anchor-0.2.0',
    values: {
      A4: {
        predictedFfm: {
          method: 'JANMAHASATIAN_2005_LBW_PRIOR',
          role: 'POPULATION_PRIOR_NOT_INDIVIDUAL_TRUTH',
          purposeInSource: 'LEAN_BODY_WEIGHT_ESTIMATION_FOR_PHARMACOKINETIC_SIZE_SCALING',
          inputs: ['sex', 'heightCm', 'weightKg'],
          male: { numeratorWeight: 9270, denominatorConstant: 6680, bmiCoefficient: 216 },
          female: { numeratorWeight: 9270, denominatorConstant: 8780, bmiCoefficient: 244 },
          publishedIndexRmseKg: 3.33,
          publishedExternalRmseKg: 4.39,
          intervalPolicy: 'OPEN_DO_NOT_TREAT_RMSE_AS_AN_INDIVIDUAL_CONFIDENCE_INTERVAL',
          source: 'Janmahasatian et al. 2005; equation and validation purpose rechecked for Prompt 7'
        },
        heightSquaredRobustnessBmiRange: [18.5, 25],
        heightSquaredRangeStatus: 'EXPERIMENTAL_ROBUSTNESS_BAND_NOT_PHYSIOLOGICAL_TRUTH',
        actualBodyWeightRole: 'SENSITIVITY_ANCHOR_NOT_DEFAULT_DENOMINATOR',
        advancedEligibleSources: ['DXA', 'BODPOD', 'MULTICOMPARTMENT', 'VALIDATED_BIA'],
        advancedEligibleQuality: ['HIGH'],
        divergence: {
          method: 'ANCHOR_POSITION_AND_SEMANTIC_COMPARISON',
          ratioThreshold: null,
          ratioThresholdStatus: 'REMOVED_NOT_FROZEN',
          automaticAveraging: false,
          automaticAlternateSelection: false
        }
      },
      A5: {
        adequacy: {
          densityGPerKgCurrentBw: 0.83,
          classification: 'POPULATION_REFERENCE_EFSA_PRI_NOT_OPTIMIZATION_TARGET',
          solverProtectionStatus: 'PLANNING_LOWER_NOT_DERIVED_AUTOMATICALLY'
        },
        resistance: {
          averageActualBwAnchorGPerKg: 1.62,
          confidenceIntervalActualBwGPerKg: [1.03, 2.20],
          upperPlanningReferenceActualBwGPerKg: 2.20,
          classification: 'OBSERVED_PLATEAU_ESTIMATE_AND_CONFIDENCE_INTERVAL_NOT_UNIVERSAL_TARGET_RANGE'
        },
        deficit: {
          historicalComparatorActualBwGPerKg: [1.6, 2.0],
          specializedLeanAthleteFfmGPerKg: [2.3, 3.1],
          status: 'INACTIVE_EVIDENCE_COMPARATORS_NUMERIC_SURFACE_OPEN'
        },
        gain: {
          automaticIncrement: null,
          status: 'NO_EVIDENCE_FOR_AUTOMATIC_SURPLUS_INCREMENT'
        },
        olderAdult: {
          healthyPlanningRegionGPerKg: [1.0, 1.2],
          higherDemandRegionGPerKg: [1.2, 1.6],
          status: 'EVIDENCE_REGIONS_NOT_AGE_CUTOFF_OR_ACTIVE_SURFACE'
        },
        plantQuality: {
          historicalMultiplierComparator: [1.10, 1.20],
          activeMultiplier: null,
          status: 'UNIVERSAL_MULTIPLIER_REJECTED_QUALITY_AND_MENU_CHECK_REQUIRED'
        },
        selection: {
          architecture: 'PROTECTED_LOWER_PLUS_PREFERRED_RANGE_PLUS_SOLVER_SELECTION',
          protectedPlanningLower: null,
          preferredRange: null,
          selectedPoint: null,
          upperOptimizationRange: null,
          numericStatus: 'OPEN_PARAMETER_BLOCKED_REFERENCE_SIZE_DENSITY_COUPLING',
          midpointSelector: 'REJECTED_UNSUPPORTED'
        }
      }
    }
  },
  LAB_PROTEIN_E03: {
    id: 'LAB_PROTEIN_E03',
    label: 'A4/A5 Candidate-v1 executable protein envelope',
    status: 'EXPERIMENTAL_CANDIDATE_V1_SHADOW_ONLY',
    source: 'Owner authorization Prompt 16; EFSA 2012; Morton et al. 2018; Tagawa et al. 2020/2022; ESPEN/PROT-AGE; Kokura et al. 2024; Weijs 2024; sports-nutrition consensus anchors',
    rationale: 'Closes the smallest executable adult Standard protein envelope without a universal referenceWeight, selected point, FFM-density transport, safety UL, or production connection.',
    modelVersion: 'protein-executable-envelope-0.3.0',
    values: {
      A4: {
        executionAnchor: {
          architecture: 'DOMAIN_SWITCHED_BODY_SIZE_EXECUTION_ANCHOR_NOT_REFERENCE_WEIGHT',
          currentBodyWeightDomain: { bmiUpperInclusive: 30 },
          obesityRobustnessCapBmi: 30,
          capRole: 'ROBUSTNESS_ANCHOR_NOT_BIOLOGICAL_IDEAL_OR_FFM',
          lowBmiReviewThreshold: 18.5,
          lowBmiThresholdRole: 'STANDARD_DOMAIN_REVIEW_BOUNDARY_NOT_PROTEIN_COEFFICIENT'
        },
        predictedFfm: {
          method: 'JANMAHASATIAN_2005_LBW_PRIOR',
          role: 'POPULATION_PRIOR_NOT_INDIVIDUAL_TRUTH',
          purposeInSource: 'LEAN_BODY_WEIGHT_ESTIMATION_FOR_PHARMACOKINETIC_SIZE_SCALING',
          inputs: ['sex', 'heightCm', 'weightKg'],
          male: { numeratorWeight: 9270, denominatorConstant: 6680, bmiCoefficient: 216 },
          female: { numeratorWeight: 9270, denominatorConstant: 8780, bmiCoefficient: 244 },
          publishedIndexRmseKg: 3.33,
          publishedExternalRmseKg: 4.39,
          intervalPolicy: 'OPEN_DO_NOT_TREAT_RMSE_AS_AN_INDIVIDUAL_CONFIDENCE_INTERVAL',
          source: 'Janmahasatian et al. 2005; retained only as diagnostic population prior'
        },
        actualBodyWeightRole: 'PRIMARY_ONLY_AT_OR_BELOW_BMI30_OTHERWISE_NATIVE_DENOMINATOR_SENSITIVITY',
        advancedEligibleSources: ['DXA', 'BODPOD', 'MULTICOMPARTMENT', 'VALIDATED_BIA'],
        advancedEligibleQuality: ['HIGH'],
        measuredFfmRole: 'INFORM_OR_INVALIDATE_CAP_NEVER_RECEIVE_WHOLE_BODY_WEIGHT_DENSITY',
        divergence: {
          ratioThreshold: null,
          automaticAveraging: false,
          automaticFfmReplacement: false,
          eligibleMeasuredFfmAboveAnchorAction: 'REFERENCE_SIZE_REVIEW_REQUIRED'
        }
      },
      A5: {
        adequacyReference: {
          densityGPerKgActualBw: 0.83,
          classification: 'EFSA_POPULATION_REFERENCE_NOT_OPTIMIZATION_OR_BIOLOGICAL_CLIFF',
          directSupportForIndividualProtectedLower: false
        },
        protectedLowerDensityByContext: {
          ordinaryAdult: 0.83,
          energyRestriction: 1.0,
          olderAdult: 1.0,
          combinationPolicy: 'MAX_CONTEXTUAL_DENSITY_NO_MULTIPLICATION',
          classification: 'HEURISTIC_BUT_EXECUTABLE_PRODUCT_POLICY_NOT_BIOLOGICAL_FLOOR',
          semantics: 'L2_SOLVER_GUARDRAIL_FOR_THIS_LAB_ONLY',
          directEvidenceForProtectedLower: false,
          promotionFromPopulationReference: 'EXPLICIT_PRODUCT_POLICY_REQUIRED'
        },
        preferredDensityRanges: {
          ordinaryNontraining: [1.0, 1.3],
          ordinaryResistance: [1.4, 1.6],
          ordinaryEndurance: [1.2, 1.6],
          energyRestriction: [1.2, 1.6],
          healthyOlderAdult: [1.0, 1.2],
          combinationPolicy: 'ELEMENTWISE_MAX_NO_MULTIPLIERS',
          classification: 'EVIDENCE_ANCHORED_EXECUTABLE_OPTIMIZATION_ENVELOPES'
        },
        ageBoundary: {
          years: 65,
          role: 'EVIDENCE_GROUP_AND_PRODUCT_SIMPLIFICATION_NOT_BIOLOGICAL_CLIFF'
        },
        gain: {
          automaticIncrement: null,
          status: 'NO_SURPLUS_MULTIPLIER_TRAINING_CONTEXT_ALREADY_OWNS_OPTIMIZATION_RANGE'
        },
        upper: {
          safetyUpperLimit: null,
          preferredHighRole: 'SOLVER_PREFERENCE_CEILING_NOT_MAX_SAFE'
        },
        plantQuality: {
          activeMultiplier: null,
          standardAssumption: 'ORDINARY_MIXED_DIET',
          specializedAction: 'DEFER_QUALITY_AND_AMINO_ACID_PATTERN_TO_MENU_OR_ADVANCED_REVIEW'
        },
        selection: {
          architecture: 'PROTECTED_LOWER_PLUS_PREFERRED_RANGE_PLUS_DOWNSTREAM_FEASIBLE_REGION',
          selectedPoint: null,
          midpointSelector: 'REJECTED_UNSUPPORTED',
          numericStatus: 'EXECUTABLE_FOR_ORDINARY_IN_SCOPE_ADULT_DOMAIN'
        }
      }
    }
  }
});

export function getProteinParameterSet(id = 'LAB_PROTEIN_E02') {
  const set = proteinParameterSets[id];
  if (!set) throw new RangeError(`Unknown protein parameter set: ${id}`);
  return set;
}
