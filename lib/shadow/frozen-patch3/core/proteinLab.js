import { deepFreeze } from './inputScope.js';

export function validateFfmCandidate(candidateKg, weightKg) {
  const reason = !Number.isFinite(candidateKg)
    ? 'NON_FINITE'
    : candidateKg <= 0
      ? 'NON_POSITIVE'
      : candidateKg >= weightKg
        ? 'NOT_BELOW_TOTAL_BODY_MASS'
        : null;
  return deepFreeze({ valid: reason === null, reason, candidateKg });
}

export function predictJanmahasatianFfm(profile, parameters) {
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / heightM ** 2;
  const coefficients = profile.sex === 'MALE' ? parameters.male : parameters.female;
  const candidateKg = coefficients.numeratorWeight * profile.weightKg
    / (coefficients.denominatorConstant + coefficients.bmiCoefficient * bmi);
  const validity = validateFfmCandidate(candidateKg, profile.weightKg);
  return deepFreeze({
    method: parameters.method,
    role: parameters.role,
    candidateKg,
    bmi,
    inputs: { sex: profile.sex, heightCm: profile.heightCm, weightKg: profile.weightKg },
    validity,
    uncertainty: {
      indexRmseKg: parameters.publishedIndexRmseKg,
      externalRmseKg: parameters.publishedExternalRmseKg,
      individualInterval: null,
      status: parameters.intervalPolicy
    },
    selectedAsBasis: false,
    proteinDensityApplied: null
  });
}

export function buildReferenceSizeEvidence(profile, mode, a4) {
  const heightM = profile.heightCm / 100;
  const [bmiLower, bmiUpper] = a4.heightSquaredRobustnessBmiRange;
  const heightRangeKg = [bmiLower * heightM ** 2, bmiUpper * heightM ** 2];
  const predicted = predictJanmahasatianFfm(profile, a4.predictedFfm);
  const measured = measuredFfmEvidence(profile, mode, a4);
  const diagnosticFfmKg = measured.candidateKg;
  const flags = [];

  if (profile.weightKg < heightRangeKg[0] || profile.weightKg > heightRangeKg[1]) {
    flags.push('ACTUAL_BW_OUTSIDE_HEIGHT2_ROBUSTNESS_BAND');
  }
  if (!predicted.validity.valid) flags.push(`PREDICTED_FFM_INVALID:${predicted.validity.reason}`);
  if (predicted.validity.valid && (predicted.candidateKg < heightRangeKg[0] || predicted.candidateKg > heightRangeKg[1])) {
    flags.push('PREDICTED_FFM_OUTSIDE_HEIGHT2_ROBUSTNESS_BAND');
  }
  if (Number.isFinite(diagnosticFfmKg) && (diagnosticFfmKg < heightRangeKg[0] || diagnosticFfmKg > heightRangeKg[1])) {
    flags.push(measured.eligible
      ? 'ELIGIBLE_MEASURED_FFM_OUTSIDE_HEIGHT2_ROBUSTNESS_BAND'
      : 'INELIGIBLE_COMPOSITION_FFM_OUTSIDE_HEIGHT2_ROBUSTNESS_BAND');
  }
  if (profile.trainingModality === 'RESISTANCE' && profile.weightKg > heightRangeKg[1]) {
    flags.push('RESISTANCE_TRAINED_HIGH_BMI_PHENOTYPE_NOT_IDENTIFIED_BY_ANTHROPOMETRY');
  }

  const divergent = flags.length > 0;
  return deepFreeze({
    architecture: 'MULTI_ANCHOR_ENVELOPE_NO_UNIVERSAL_REFERENCE_WEIGHT',
    selectedReferenceWeightKg: null,
    aggregationMethod: 'NONE_NO_AUTOMATIC_AVERAGING',
    anchors: {
      actualBodyWeight: {
        valueKg: profile.weightKg,
        role: a4.actualBodyWeightRole,
        selectedAsBasis: false
      },
      heightSquaredRobustness: {
        valueRangeKg: heightRangeKg,
        bmiRange: a4.heightSquaredRobustnessBmiRange,
        status: a4.heightSquaredRangeStatus,
        selectedAsBasis: false
      },
      predictedFfm: predicted,
      measuredFfm: measured
    },
    divergence: {
      status: divergent ? 'REFERENCE_SIZE_DIVERGENCE_UNCALIBRATED' : 'NO_RULE_TRIGGERED_DIVERGENCE',
      flags,
      ratioThreshold: a4.divergence.ratioThreshold,
      actions: divergent
        ? ['LOWER_CONFIDENCE', 'REQUEST_BETTER_COMPOSITION_IF_DECISION_SENSITIVE', 'ABSTAIN_FROM_POINT_TARGET', 'PHENOTYPE_OR_OOD_REVIEW']
        : ['RETAIN_RANGE_SEMANTICS', 'ABSTAIN_FROM_POINT_TARGET_UNTIL_DENSITY_MAPPING_IS_IDENTIFIED']
    }
  });
}

export function buildProteinEvidence(profile, referenceSizeEvidence, a5) {
  const direction = directionFromGoal(profile.goal);
  const resistance = profile.trainingModality === 'RESISTANCE' && Number(profile.sessionsPerWeek || 0) > 0;
  const adequacyGrams = a5.adequacy.densityGPerKgCurrentBw * profile.weightKg;
  const resistanceEvidence = resistance ? {
    denominator: 'ACTUAL_BODY_WEIGHT_AS_REPORTED_IN_META_ANALYTIC_ANCHOR',
    averageAnchor: {
      densityGPerKg: a5.resistance.averageActualBwAnchorGPerKg,
      grams: a5.resistance.averageActualBwAnchorGPerKg * profile.weightKg,
      classification: 'OBSERVED_PLATEAU_ESTIMATE_NOT_HARD_FLOOR_CAP_OR_SELECTED_POINT'
    },
    confidenceInterval: {
      densityGPerKg: a5.resistance.confidenceIntervalActualBwGPerKg,
      grams: a5.resistance.confidenceIntervalActualBwGPerKg.map(value => value * profile.weightKg),
      classification: 'CONFIDENCE_INTERVAL_NOT_PREFERRED_TARGET_RANGE'
    },
    upperPlanningReference: {
      densityGPerKg: a5.resistance.upperPlanningReferenceActualBwGPerKg,
      grams: a5.resistance.upperPlanningReferenceActualBwGPerKg * profile.weightKg,
      classification: 'SOFT_UPPER_PLANNING_REFERENCE_NOT_SAFETY_MAXIMUM'
    },
    activeAsAutomaticTarget: false
  } : null;

  const deficitEvidence = direction === 'LOSS' ? {
    actualBwComparator: {
      densityGPerKg: a5.deficit.historicalComparatorActualBwGPerKg,
      grams: a5.deficit.historicalComparatorActualBwGPerKg.map(value => value * profile.weightKg),
      classification: 'HEURISTIC_COMPARATOR_NOT_ACTIVE_STANDARD_RANGE'
    },
    specializedLeanAthleteFfmComparator: {
      densityGPerKgFfm: a5.deficit.specializedLeanAthleteFfmGPerKg,
      grams: null,
      classification: 'SPECIALIZED_LEAN_ATHLETE_DEFICIT_EVIDENCE_NOT_GENERAL_STANDARD',
      reasonNotCalculated: 'LEAN_ATHLETE_DOMAIN_AND_FFM_DENSITY_MAPPING_NOT_ESTABLISHED'
    },
    activeAsAutomaticTarget: false
  } : null;

  const plantPattern = ['VEGAN', 'VEGETARIAN', 'PLANT_BASED'].includes(profile.dietPattern);
  const plantQuality = {
    pattern: profile.dietPattern || 'UNKNOWN',
    qualityKnown: false,
    gramMultiplierApplied: null,
    historicalComparator: a5.plantQuality.historicalMultiplierComparator,
    action: plantPattern ? 'FLAG_QUALITY_AND_DEFER_SOURCE_COMPOSITION_TO_MENU_ENGINE' : 'NO_PATTERN_ADJUSTMENT',
    status: a5.plantQuality.status
  };

  return deepFreeze({
    direction,
    context: {
      resistanceTraining: resistance,
      sessionsPerWeek: profile.sessionsPerWeek ?? null,
      durationMin: profile.sessionDurationMin ?? null,
      age: profile.age,
      ageSurface: 'CONTINUOUS_CONTEXT_RETAINED_NUMERIC_MODIFIER_OPEN',
      gain: direction === 'GAIN' ? a5.gain : null
    },
    adequacyReference: {
      grams: adequacyGrams,
      densityGPerKg: a5.adequacy.densityGPerKgCurrentBw,
      basis: 'CURRENT_BW_POPULATION_REFERENCE',
      classification: a5.adequacy.classification,
      protectedPlanningLower: false
    },
    resistanceEvidence,
    deficitEvidence,
    olderAdultEvidence: {
      healthyPlanningRegionGPerKg: a5.olderAdult.healthyPlanningRegionGPerKg,
      higherDemandRegionGPerKg: a5.olderAdult.higherDemandRegionGPerKg,
      activeAsAgeCutoff: false,
      status: a5.olderAdult.status
    },
    plantQuality,
    referenceSizeDensityCoupling: {
      predictedFfmProteinDensityGPerKg: null,
      measuredFfmProteinDensityGPerKg: null,
      heightSquaredProteinDensityGPerKg: null,
      actualBwResistanceAnchorMayBeTransportedToOtherDenominators: false,
      status: 'OPEN_PARAMETER_BLOCKED'
    },
    protectedPlanningLower: { grams: null, status: 'OPEN_NOT_EQUATED_TO_POPULATION_ADEQUACY' },
    preferredRange: null,
    selectedPoint: null,
    upperOptimizationRange: null,
    selection: a5.selection,
    referenceSizeEvidence,
    solverEligible: false,
    solverBlockReason: 'REFERENCE_SIZE_DENSITY_COUPLING_AND_PLANNING_LOWER_ARE_NOT_IDENTIFIED'
  });
}

export function buildManualExperimentalProteinConstraint(proteinEvidence, preferredRange) {
  if (!Array.isArray(preferredRange) || preferredRange.length !== 2
    || !preferredRange.every(Number.isFinite) || preferredRange[0] <= 0
    || preferredRange[1] < preferredRange[0]) {
    throw new TypeError('Manual experimental preferredRange must be two finite positive ascending gram values.');
  }
  return deepFreeze({
    status: 'MANUAL_EXPERIMENTAL_TARGET_REQUIRED',
    adequacyReference: proteinEvidence.adequacyReference,
    contextualTargetRange: [...preferredRange],
    selected: preferredRange[0],
    upperOptimizationReference: null,
    bodySizeBasis: 'NO_UNIVERSAL_REFERENCE_WEIGHT_MANUAL_GRAMS',
    denominatorKg: null,
    provenance: 'EXPLICIT_MANUAL_EXPERIMENT_ONLY_NOT_AUTOMATIC_LAB_PROTEIN_E02'
  });
}

const PLANNED_TRAINING = new Set(['PLANNED', 'PLANNED_FUTURE', 'FUTURE']);
const ENDURANCE_MODALITIES = new Set(['RUNNING', 'CYCLING', 'SWIMMING', 'ENDURANCE']);

export function buildExecutableProteinEnvelope(profile, mode, a4, a5, energyKcal = null) {
  const referenceSizeEvidence = buildExecutableReferenceSizeEvidence(profile, mode, a4);
  const context = executableProteinContext(profile, a5);
  const anchorKg = referenceSizeEvidence.executionAnchor.valueKg;
  const adequacyGrams = a5.adequacyReference.densityGPerKgActualBw * profile.weightKg;
  const protectedGrams = context.protectedDensityGPerKg * anchorKg;
  const candidatePreferredRange = context.preferredDensityRange.map(value => value * anchorKg);
  const blocked = referenceSizeEvidence.domain.status === 'REFERENCE_SIZE_REVIEW_REQUIRED';
  const preferredRange = blocked ? null : candidatePreferredRange;
  const energyKnown = Number.isFinite(energyKcal) && energyKcal > 0;
  const minimumProteinEnergyKcal = 4 * protectedGrams;
  const energyInteraction = {
    energyKcal: energyKnown ? energyKcal : null,
    minimumProteinEnergyKcal,
    protectedLowerFitsEnergy: energyKnown ? minimumProteinEnergyKcal <= energyKcal : null,
    status: !energyKnown ? 'ENERGY_NOT_SUPPLIED'
      : minimumProteinEnergyKcal <= energyKcal ? 'PROTECTED_LOWER_FITS_ENERGY_ARITHMETIC'
        : 'PROTEIN_REQUIREMENT_CONFLICT_ROUTE_A8_UPSTREAM',
    protectedLowerReducedBecauseEnergyIsLow: false
  };

  return deepFreeze({
    referenceSizeEvidence,
    proteinEvidence: {
      adequacyReference: {
        grams: adequacyGrams,
        densityGPerKg: a5.adequacyReference.densityGPerKgActualBw,
        basis: 'ACTUAL_BODY_WEIGHT_NATIVE_POPULATION_REFERENCE',
        classification: a5.adequacyReference.classification,
        automaticallyEquivalentToProtectedLower: false,
        directSupportForIndividualProtectedLower: a5.adequacyReference.directSupportForIndividualProtectedLower
      },
      context,
      densityMapping: {
        executionAnchorKg: anchorKg,
        protectedDensityGPerKg: context.protectedDensityGPerKg,
        preferredDensityRange: context.preferredDensityRange,
        predictedFfmDensityGPerKg: null,
        measuredFfmDensityGPerKg: null,
        actualBwSensitivity: {
          protectedGrams: context.protectedDensityGPerKg * profile.weightKg,
          preferredRange: context.preferredDensityRange.map(value => value * profile.weightKg),
          selectedAsAutomaticBasisAboveBmi30: false
        },
        protectedLowerSemantics: {
          level: 'L2',
          classification: a5.protectedLowerDensityByContext.classification,
          semantics: a5.protectedLowerDensityByContext.semantics,
          directEvidenceForProtectedLower: a5.protectedLowerDensityByContext.directEvidenceForProtectedLower,
          promotionFromPopulationReference: a5.protectedLowerDensityByContext.promotionFromPopulationReference
        }
      },
      proteinQuality: proteinQualityContract(profile, a5),
      sexModifier: null,
      distributionLayer: 'MENU_OR_ADVANCED_NOT_DAILY_GRAM_TARGET',
      energyInteraction
    },
    target: {
      status: blocked ? 'PARTIAL_REFERENCE_SIZE_REVIEW_REQUIRED' : 'EXECUTABLE_RANGE_NO_POINT',
      protectedLower: blocked ? null : protectedGrams,
      protectedConstraintRange: blocked ? null : [protectedGrams, Number.POSITIVE_INFINITY],
      preferredRange,
      candidatePreferredRange,
      preferredHighRole: a5.upper.preferredHighRole,
      safetyUpperLimit: a5.upper.safetyUpperLimit,
      upperContext: blocked ? null : candidatePreferredRange[1],
      selectedPoint: null,
      midpointSelected: false,
      solverEligible: !blocked,
      fourNumberProjectionEligible: false,
      referenceBasis: referenceSizeEvidence.executionAnchor.method,
      uncertainty: referenceSizeEvidence.uncertainty,
      divergenceFlags: referenceSizeEvidence.divergence.flags
    }
  });
}

function buildExecutableReferenceSizeEvidence(profile, mode, a4) {
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / heightM ** 2;
  const capKg = a4.executionAnchor.obesityRobustnessCapBmi * heightM ** 2;
  const capActive = bmi > a4.executionAnchor.currentBodyWeightDomain.bmiUpperInclusive;
  const executionAnchorKg = capActive ? capKg : profile.weightKg;
  const predicted = predictJanmahasatianFfm(profile, a4.predictedFfm);
  const measured = measuredFfmEvidence(profile, mode, a4);
  const flags = [];
  if (capActive) flags.push('BMI30_ROBUSTNESS_CAP_ACTIVE');
  if (!predicted.validity.valid) flags.push(`PREDICTED_FFM_INVALID:${predicted.validity.reason}`);
  if (predicted.validity.valid && predicted.candidateKg > executionAnchorKg) {
    flags.push('PREDICTED_FFM_EXCEEDS_EXECUTION_ANCHOR_DIAGNOSTIC_ONLY');
  }
  if (measured.validity?.valid && measured.candidateKg > executionAnchorKg) {
    flags.push(measured.eligible
      ? 'ELIGIBLE_MEASURED_FFM_EXCEEDS_EXECUTION_ANCHOR'
      : 'INELIGIBLE_MEASURED_FFM_EXCEEDS_EXECUTION_ANCHOR_DIAGNOSTIC_ONLY');
  }
  const realizedResistance = trainingIsRealized(profile)
    && profile.trainingModality === 'RESISTANCE' && Number(profile.sessionsPerWeek || 0) > 0;
  if (capActive && realizedResistance && !measured.eligible) {
    flags.push('OBESITY_VS_HIGH_MUSCULARITY_NOT_RESOLVED_BY_ELIGIBLE_MEASUREMENT');
  }
  const lowBmiReview = bmi < a4.executionAnchor.lowBmiReviewThreshold;
  if (lowBmiReview) flags.push('LOW_BMI_OUTSIDE_ORDINARY_STANDARD_REFERENCE_SIZE_DOMAIN');
  const measuredInvalidatesCap = capActive && measured.eligible && measured.candidateKg > executionAnchorKg;
  const reviewRequired = lowBmiReview || measuredInvalidatesCap;

  return deepFreeze({
    architecture: a4.executionAnchor.architecture,
    selectedReferenceWeightKg: null,
    executionAnchor: {
      valueKg: executionAnchorKg,
      method: capActive ? 'BMI30_CAPPED_BODY_SIZE_ROBUSTNESS_ANCHOR' : 'CURRENT_BODY_WEIGHT_WITHIN_BMI30_DOMAIN',
      role: capActive ? a4.executionAnchor.capRole : a4.actualBodyWeightRole,
      capBmi: capActive ? a4.executionAnchor.obesityRobustnessCapBmi : null,
      isBiologicalTruth: false,
      isUniversalReferenceWeight: false,
      selectedForGramExecution: !reviewRequired
    },
    anchors: {
      actualBodyWeight: {
        valueKg: profile.weightKg,
        role: a4.actualBodyWeightRole,
        selectedForGramExecution: !capActive && !reviewRequired
      },
      obesityRobustnessCap: {
        valueKg: capKg,
        bmi: a4.executionAnchor.obesityRobustnessCapBmi,
        role: a4.executionAnchor.capRole,
        active: capActive,
        selectedForGramExecution: capActive && !reviewRequired
      },
      predictedFfm: predicted,
      measuredFfm: measured
    },
    domain: {
      bmi,
      status: reviewRequired ? 'REFERENCE_SIZE_REVIEW_REQUIRED' : 'ORDINARY_STANDARD_EXECUTABLE',
      lowBmiBoundary: a4.executionAnchor.lowBmiReviewThreshold,
      boundarySemantics: a4.executionAnchor.lowBmiThresholdRole,
      reason: lowBmiReview ? 'LOW_BMI_REQUIRES_ADJACENT_NUTRITION_REVIEW'
        : measuredInvalidatesCap ? a4.divergence.eligibleMeasuredFfmAboveAnchorAction : 'NONE'
    },
    divergence: {
      status: flags.length ? 'VISIBLE_DIVERGENCE_OR_ROBUSTNESS_ACTION' : 'NO_RULE_TRIGGERED_DIVERGENCE',
      flags,
      ratioThreshold: a4.divergence.ratioThreshold,
      automaticAveraging: a4.divergence.automaticAveraging,
      automaticFfmReplacement: a4.divergence.automaticFfmReplacement,
      action: reviewRequired ? 'REQUEST_INFORMATION_OR_ADVANCED_REFERENCE_SIZE_REVIEW'
        : flags.length ? 'RUN_EXECUTABLE_RANGE_WITH_VISIBLE_UNCERTAINTY' : 'RUN_EXECUTABLE_RANGE'
    },
    uncertainty: reviewRequired ? 'HIGH_REQUIRES_REVIEW' : flags.length ? 'MATERIAL_VISIBLE_NOT_CALIBRATED' : 'NOT_CALIBRATED'
  });
}

function executableProteinContext(profile, a5) {
  const realized = trainingIsRealized(profile);
  const sessions = Number(profile.sessionsPerWeek || 0);
  const modality = String(profile.trainingModality || 'NONE').toUpperCase();
  const resistance = realized && sessions > 0 && (modality === 'RESISTANCE' || modality === 'HYBRID');
  const endurance = realized && sessions > 0 && (ENDURANCE_MODALITIES.has(modality) || modality === 'HYBRID');
  const loss = directionFromGoal(profile.goal) === 'LOSS';
  const gain = directionFromGoal(profile.goal) === 'GAIN';
  const older = profile.age >= a5.ageBoundary.years;
  const preferredCandidates = [{ id: 'ORDINARY_NONTRAINING', range: a5.preferredDensityRanges.ordinaryNontraining }];
  if (resistance) preferredCandidates.push({ id: 'RESISTANCE', range: a5.preferredDensityRanges.ordinaryResistance });
  if (endurance) preferredCandidates.push({ id: 'ENDURANCE', range: a5.preferredDensityRanges.ordinaryEndurance });
  if (loss) preferredCandidates.push({ id: 'ENERGY_RESTRICTION', range: a5.preferredDensityRanges.energyRestriction });
  if (older) preferredCandidates.push({ id: 'OLDER_ADULT', range: a5.preferredDensityRanges.healthyOlderAdult });
  const preferredDensityRange = older && !resistance && !endurance && !loss
    ? [...a5.preferredDensityRanges.healthyOlderAdult]
    : [
      Math.max(...preferredCandidates.map(item => item.range[0])),
      Math.max(...preferredCandidates.map(item => item.range[1]))
    ];
  const protectedCandidates = [{ id: 'ORDINARY_ADULT', density: a5.protectedLowerDensityByContext.ordinaryAdult }];
  if (loss) protectedCandidates.push({ id: 'ENERGY_RESTRICTION', density: a5.protectedLowerDensityByContext.energyRestriction });
  if (older) protectedCandidates.push({ id: 'OLDER_ADULT', density: a5.protectedLowerDensityByContext.olderAdult });
  const protectedDensityGPerKg = Math.max(...protectedCandidates.map(item => item.density));
  return deepFreeze({
    direction: directionFromGoal(profile.goal),
    realizedTraining: realized,
    modality,
    resistance,
    endurance,
    olderAdult: older,
    ageBoundaryYears: a5.ageBoundary.years,
    ageBoundarySemantics: a5.ageBoundary.role,
    energyRestriction: loss,
    gain,
    gainIncrementApplied: false,
    gainPolicy: gain ? a5.gain.status : 'NOT_APPLICABLE',
    protectedDensityGPerKg,
    protectedCandidates,
    protectedCombinationPolicy: a5.protectedLowerDensityByContext.combinationPolicy,
    preferredDensityRange,
    preferredCandidates,
    preferredCombinationPolicy: a5.preferredDensityRanges.combinationPolicy,
    categoryCountMinimized: true
  });
}

function trainingIsRealized(profile) {
  const status = profile.trainingStatus || (profile.trainingRealized === false ? 'PLANNED_FUTURE' : 'REALIZED_HABITUAL');
  return !PLANNED_TRAINING.has(status);
}

function proteinQualityContract(profile, a5) {
  const pattern = String(profile.dietPattern || 'UNKNOWN').toUpperCase();
  const specialized = ['VEGAN', 'PLANT_BASED'].includes(pattern);
  return {
    pattern,
    standardAssumption: a5.plantQuality.standardAssumption,
    gramMultiplierApplied: a5.plantQuality.activeMultiplier,
    status: specialized ? 'QUALITY_REQUIRES_MENU_OR_ADVANCED_CHECK' : 'NO_DAILY_GRAM_ADJUSTMENT',
    action: specialized ? a5.plantQuality.specializedAction : 'DELEGATE_FOOD_REALIZATION_TO_MENU'
  };
}

function measuredFfmEvidence(profile, mode, a4) {
  if (!Number.isFinite(profile.bodyFatPercent)) {
    return deepFreeze({ status: 'MISSING', candidateKg: null, eligible: false, selectedAsBasis: false });
  }
  const candidateKg = profile.weightKg * (1 - profile.bodyFatPercent / 100);
  const validity = validateFfmCandidate(candidateKg, profile.weightKg);
  const source = profile.bodyFatSource || 'UNKNOWN';
  const quality = profile.bodyFatQuality || 'UNKNOWN';
  const sourceEligible = a4.advancedEligibleSources.includes(source);
  const qualityEligible = a4.advancedEligibleQuality.includes(quality);
  const eligible = mode === 'ADVANCED' && sourceEligible && qualityEligible && validity.valid;
  return deepFreeze({
    status: eligible ? 'ELIGIBLE_ADVANCED_ANCHOR' : 'DIAGNOSTIC_ONLY_INELIGIBLE_FOR_SELECTION',
    candidateKg,
    source,
    quality,
    validity,
    eligible,
    affectsStandard: false,
    affectsAdvancedAsAutomaticReplacement: false,
    mayFlagDisagreement: validity.valid,
    selectedAsBasis: false,
    proteinDensityApplied: null
  });
}

function directionFromGoal(goal) {
  if (goal === 'LOSS') return 'LOSS';
  if (goal === 'GAIN') return 'GAIN';
  if (goal === 'MAINTENANCE') return 'MAINTENANCE';
  return 'OTHER_OPEN';
}
