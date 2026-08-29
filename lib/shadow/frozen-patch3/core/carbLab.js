import { classifyTrainingInput, deepFreeze } from './inputScope.js';

const PLANNED = new Set(['PLANNED', 'PLANNED_FUTURE', 'FUTURE']);
const SPECIALIZED_PHASES = new Set(['COMPETITION', 'CARB_LOADING', 'TAPER', 'WEIGHT_CUT']);

export function buildCarbohydrateEvidence(profile, energyKcal, a7) {
  const workloadEvidence = buildWorkloadEvidence(profile);
  const modeDecision = decideMode(workloadEvidence, a7.diagnosticWorkloadMapping);
  const referenceAnchors = buildReferenceAnchors(profile.weightKg, energyKcal, a7);
  const denominator = buildDenominatorEvidence(profile, referenceAnchors);
  const lowCarbConflict = buildLowCarbConflict(profile, modeDecision.mode);
  const energyFeasibility = buildEnergyFeasibility(referenceAnchors, modeDecision.mode, profile.goal);
  const warnings = [
    'PAL_ACTIVITY_CLASS_NOT_USED_FOR_CARB_MODE',
    'STEPS_NOT_USED_FOR_CARB_MODE',
    'RDA_130_NOT_A_HARD_FLOOR',
    'NO_AUTOMATIC_G_PER_KG_DENOMINATOR',
    'NO_AUTOMATIC_ACTIVE_RANGE_OR_SELECTED_POINT',
    ...workloadEvidence.missingness,
    ...workloadEvidence.contradictions,
    ...modeDecision.warnings,
    ...lowCarbConflict.warnings,
    ...energyFeasibility.warnings
  ];

  return deepFreeze({
    architecture: 'FLEXIBLE_RESIDUAL_ORDINARILY_PLUS_ACTIVE_TRAINING_TARGET_FOR_MATERIAL_WORKLOAD',
    architectureStatus: 'SURVIVES',
    numericSurfaceStatus: 'OPEN',
    energyKcal,
    mode: modeDecision.mode,
    modeCandidates: modeDecision.modeCandidates,
    activationStatus: modeDecision.activationStatus,
    activationConfidenceStatus: modeDecision.activationConfidenceStatus,
    activationBasis: modeDecision.activationBasis,
    workloadEnvelope: modeDecision.workloadEnvelope,
    workloadEvidence,
    referenceAnchors,
    denominator,
    energyFeasibility,
    lowCarbConflict,
    qualityDelegation: {
      totalCarbohydrateGrams: 'A7_AMOUNT_LAYER',
      fiber: 'SEPARATE_DOWNSTREAM_CONSTRAINT',
      foodQuality: 'SEPARATE_MENU_ENGINE_LAYER',
      glycemicConsiderations: 'CONTEXTUAL_ADVANCED_OR_CLINICAL_LAYER',
      affectsAutomaticA7Target: false
    },
    ageMultiplier: null,
    gainMultiplier: null,
    activeRange: null,
    preferredRange: null,
    selectedCarb: null,
    selectionReason: selectionReason(modeDecision.mode),
    solverEligible: false,
    solverBlockReason: 'A7_ACTIVE_RANGE_DENOMINATOR_AND_POINT_OPEN;LAB_PROTEIN_E02_AND_LAB_FAT_E02_HAVE_NO_AUTOMATIC_POINTS',
    openParametersUsed: [
      'A7_AUTONOMOUS_MODE_ACTIVATION_THRESHOLD',
      'A7_WORKLOAD_TIER_DEFINITIONS',
      'A7_RESISTANCE_RANGE',
      'A7_ENDURANCE_RANGE',
      'A7_HYBRID_INTERMITTENT_RANGE',
      'A7_G_PER_KG_DENOMINATOR_DOMAIN',
      'A7_RANGE_POSITIONING',
      'A7_DAY_LEVEL_PERIODIZATION',
      'A7_CONFIDENCE_CALIBRATION',
      'A7_OOD_THRESHOLD'
    ],
    warnings
  });
}

function buildWorkloadEvidence(profile) {
  const trainingInput = profile.trainingInput || classifyTrainingInput(profile);
  const unresolvedTraining = trainingInput.state === 'PARTIAL_OR_UNKNOWN_TRAINING';
  const trainingStatus = profile.trainingStatus || (profile.trainingRealized === false ? 'PLANNED_FUTURE' : 'REALIZED_HABITUAL');
  const realized = !PLANNED.has(trainingStatus);
  const modalityReported = unresolvedTraining ? trainingInput.reported.trainingModality : (profile.trainingModality || 'NONE');
  const modality = realized ? modalityReported : 'NONE';
  const sessions = realized && Number.isFinite(profile.sessionsPerWeek) ? profile.sessionsPerWeek : realized ? null : 0;
  const duration = realized && Number.isFinite(profile.sessionDurationMin) ? profile.sessionDurationMin : realized ? null : 0;
  const weeklyMinutes = Number.isFinite(sessions) && Number.isFinite(duration) ? sessions * duration : null;
  const longestSessionMinutes = Number.isFinite(profile.longestSessionMinutes) ? profile.longestSessionMinutes : null;
  const twoADay = typeof profile.twoADay === 'boolean' ? profile.twoADay : null;
  const broadWorkload = profile.workload || null;
  const broadIntensity = profile.trainingIntensity || broadWorkload;
  const trainingPhase = profile.trainingPhase || 'HABITUAL';
  const missingness = [];
  const contradictions = [];
  const reasonCodes = [];

  if (!realized) reasonCodes.push('PLANNED_TRAINING_EXCLUDED_FROM_CURRENT_DEMAND');
  if (unresolvedTraining) {
    missingness.push(...trainingInput.missingFields.map(field => `TRAINING_INPUT_MISSING:${field}`));
    contradictions.push(...trainingInput.contradictions);
    reasonCodes.push('PARTIAL_TRAINING_INPUT_REQUIRES_MODE_CLASSIFICATION_INFORMATION');
  }
  if (realized && modality !== 'NONE' && sessions === null) missingness.push('SESSIONS_PER_WEEK_MISSING');
  if (realized && modality !== 'NONE' && duration === null) missingness.push('TYPICAL_DURATION_MISSING');
  if (realized && modality !== 'NONE' && broadWorkload === null) missingness.push('BROAD_WORKLOAD_MISSING');
  if (realized && modality !== 'NONE' && longestSessionMinutes === null) missingness.push('LONGEST_SESSION_MISSING_OPTIONAL_STANDARD_REFINER');
  if (realized && modality !== 'NONE' && twoADay === null) missingness.push('TWO_A_DAY_MISSING_OPTIONAL_STANDARD_REFINER');
  if (realized && modality === 'NONE' && Number.isFinite(sessions) && sessions > 0) contradictions.push('SESSIONS_REPORTED_WITH_NO_MODALITY');
  if (realized && modality !== 'NONE' && sessions === 0) contradictions.push('REALIZED_MODALITY_WITH_ZERO_SESSIONS');
  if (realized && Number.isFinite(sessions) && sessions > 0 && duration === 0) contradictions.push('SESSIONS_REPORTED_WITH_ZERO_DURATION');
  if (twoADay === true) reasonCodes.push('MULTIPLE_SESSIONS_HIGH_VALUE_DEMAND_SIGNAL');
  if (SPECIALIZED_PHASES.has(trainingPhase)) reasonCodes.push('SPECIALIZED_TRAINING_PHASE_REVIEW');
  if (['RUNNING', 'CYCLING', 'SWIMMING', 'ROWING'].includes(modality)) reasonCodes.push('ENDURANCE_MODALITY_EVIDENCE');
  if (modality === 'RESISTANCE') reasonCodes.push('RESISTANCE_MODALITY_REQUIRES_VOLUME_CONTEXT');
  if (['HYBRID', 'MIXED', 'CROSSFIT', 'TEAM_SPORT', 'COMBAT'].includes(modality)) reasonCodes.push('MIXED_OR_INTERMITTENT_MODALITY_EVIDENCE');

  return {
    trainingInputState: trainingInput.state,
    trainingInputContractVersion: trainingInput.schemaVersion,
    trainingStatus,
    realized,
    modalityReported,
    modality,
    sessionsPerWeek: sessions,
    typicalDurationMinutes: duration,
    weeklyMinutes,
    broadWorkload,
    broadIntensity,
    longestSessionMinutes,
    twoADay,
    trainingPhase,
    performancePriority: profile.performancePriority || 'UNSPECIFIED',
    goal: profile.goal,
    lowCarbPreference: profile.lowCarbPreference || 'NONE',
    activityClassObservedButExcluded: profile.activityClass || null,
    stepsObservedButExcluded: Number.isFinite(profile.steps) ? profile.steps : null,
    excludedPrimaryInputs: ['PAL_ACTIVITY_CLASS', 'STEPS', 'WEARABLE_ACTIVE_KCAL', 'MACHINE_KCAL', 'RPE_ALONE', 'SETS_REPS_TONNAGE', 'SLEEP_OR_STRESS_SCALING', 'PLANNED_FUTURE_TRAINING'],
    missingness,
    contradictions,
    reasonCodes
  };
}

function decideMode(evidence, mapping) {
  if (!evidence.realized) {
    return modeContract('FLEXIBLE_RESIDUAL', ['FLEXIBLE_RESIDUAL'], 'PLANNED_NOT_CURRENT_FLEXIBLE', 'CURRENT_REALIZED_DEMAND_IDENTIFIED', ['T0'], 'PLANNED_TRAINING_EXCLUDED', []);
  }
  if (evidence.trainingInputState === 'PARTIAL_OR_UNKNOWN_TRAINING') {
    return modeContract('AMBIGUOUS', ['FLEXIBLE_RESIDUAL', 'ACTIVE_TRAINING_TARGET'], 'PARTIAL_TRAINING_INPUT', 'NOT_ASSESSABLE', ['T0', 'T1', 'T2', 'T3', 'T4'], 'HIGH_VALUE_TRAINING_INPUT_REQUIRED', ['CARB_MODE_PARTIAL_TRAINING_INPUT']);
  }
  if (evidence.contradictions.length) {
    return modeContract('AMBIGUOUS', ['FLEXIBLE_RESIDUAL', 'ACTIVE_TRAINING_TARGET'], 'CONTRADICTORY_TRAINING_EVIDENCE', 'NOT_ASSESSABLE', ['T0', 'T1', 'T2', 'T3', 'T4'], 'CONTRADICTIONS_REQUIRE_RESOLUTION', ['CARB_MODE_CONTRADICTORY_INPUT']);
  }
  if (evidence.modality === 'NONE' && (!Number.isFinite(evidence.sessionsPerWeek) || evidence.sessionsPerWeek === 0)) {
    return modeContract('FLEXIBLE_RESIDUAL', ['FLEXIBLE_RESIDUAL'], 'NO_REALIZED_STRUCTURED_TRAINING', 'HIGH_SEMANTIC_CONFIDENCE_NOT_STATISTICAL', ['T0'], 'NO_TRAINING_DEMAND_SIGNAL', []);
  }
  if (!mapping[evidence.broadWorkload]) {
    return modeContract('AMBIGUOUS', ['FLEXIBLE_RESIDUAL', 'ACTIVE_TRAINING_TARGET'], 'WORKLOAD_STATE_MISSING_OR_UNKNOWN', 'NOT_ASSESSABLE', ['T1', 'T2', 'T3', 'T4'], 'HIGH_VALUE_WORKLOAD_INPUT_REQUIRED', ['CARB_MODE_MISSING_WORKLOAD']);
  }
  if (evidence.twoADay === true) {
    return modeContract('ACTIVE_TRAINING_TARGET', ['ACTIVE_TRAINING_TARGET'], 'MULTIPLE_SESSIONS_ACTIVE_CONTEXT', 'MANUAL_CONTEXT_NOT_CALIBRATED', ['T3', 'T4'], 'TWO_A_DAY_RECOVERY_DEMAND', ['ACTIVE_MODE_RANGE_STILL_OPEN']);
  }
  const mapped = mapping[evidence.broadWorkload];
  if (mapped.mode === 'AMBIGUOUS_TRANSITION') {
    return modeContract('AMBIGUOUS_TRANSITION', ['FLEXIBLE_RESIDUAL', 'ACTIVE_TRAINING_TARGET'], 'MANUAL_MODERATE_WORKLOAD_TRANSITION', 'NOT_CALIBRATED', mapped.workloadEnvelope, mapping.classification, ['MODE_ACTIVATION_THRESHOLD_OPEN']);
  }
  const specialized = evidence.broadWorkload === 'EXTREME' || SPECIALIZED_PHASES.has(evidence.trainingPhase);
  return modeContract(mapped.mode, [mapped.mode], mapped.mode === 'ACTIVE_TRAINING_TARGET' ? 'MANUAL_HIGH_WORKLOAD_ACTIVE_CONTEXT' : 'MANUAL_LOW_WORKLOAD_FLEXIBLE_CONTEXT', 'MANUAL_CONTEXT_NOT_CALIBRATED', mapped.workloadEnvelope, mapping.classification, [
    ...(mapped.mode === 'ACTIVE_TRAINING_TARGET' ? ['ACTIVE_MODE_RANGE_STILL_OPEN'] : []),
    ...(specialized ? ['SPECIALIZED_OR_OOD_PERFORMANCE_REVIEW'] : [])
  ]);
}

function modeContract(mode, modeCandidates, activationStatus, activationConfidenceStatus, workloadEnvelope, activationBasis, warnings) {
  return { mode, modeCandidates, activationStatus, activationConfidenceStatus, workloadEnvelope, activationBasis, warnings };
}

function buildReferenceAnchors(weightKg, energyKcal, a7) {
  const sports = a7.sportsGuidanceAnchors.map(anchor => {
    const grams = anchor.gPerKg.map(value => value * weightKg);
    return {
      ...anchor,
      denominatorCandidate: 'ACTUAL_BODY_WEIGHT_AS_PUBLISHED_SPORTS_GUIDANCE_SEMANTICS',
      denominatorKg: weightKg,
      gramsCandidate: grams,
      percentEnergyCandidate: grams.map(value => value * 4 / energyKcal * 100),
      selectedAsTarget: false
    };
  });
  const amdr = a7.generalReferences.adultAmdrEnergyFraction;
  return {
    rda: { grams: a7.generalReferences.carbohydrateRdaGrams, classification: a7.generalReferences.rdaClassification, hardFloor: false, solverActive: false },
    amdr: { energyFraction: [...amdr], gramRangeAtEnergy: amdr.map(value => energyKcal * value / 4), classification: a7.generalReferences.amdrClassification, solverActive: false },
    sports: { classification: a7.sportsAnchorClassification, ranges: sports, automaticTierSelected: null }
  };
}

function buildDenominatorEvidence(profile, referenceAnchors) {
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / heightM ** 2;
  const anchorsExceedEnergy = referenceAnchors.sports.ranges.filter(anchor => anchor.percentEnergyCandidate[1] > 100).map(anchor => anchor.id);
  return {
    selectedDenominatorKg: null,
    selectedBasis: null,
    actualBodyWeightCandidate: { kg: profile.weightKg, bmi, role: 'PUBLISHED_SPORTS_GUIDANCE_SENSITIVITY_ANCHOR', selected: false },
    referenceWeightCandidate: null,
    ffmCandidate: null,
    automaticActualBodyWeightDomain: null,
    status: 'UNRESOLVED_NO_UNIVERSAL_CARB_REFERENCE_SIZE',
    anchorsWhoseUpperCandidateExceedsTotalEnergy: anchorsExceedEnergy,
    A4ReferenceWeightImported: false
  };
}

function buildLowCarbConflict(profile, mode) {
  const lowCarb = ['LOW_CARB', 'KETOGENIC'].includes(profile.lowCarbPreference);
  const active = mode === 'ACTIVE_TRAINING_TARGET';
  return {
    preference: profile.lowCarbPreference || 'NONE',
    state: lowCarb && active ? 'PREFERENCE_PERFORMANCE_CONFLICT' : lowCarb ? 'FEASIBLE_PREFERENCE_REQUIRES_QUALITY_REVIEW' : 'NOT_ACTIVE',
    automaticInvalidation: false,
    warnings: lowCarb && active ? ['LOW_CARB_ACTIVE_TRAINING_TRADEOFF'] : []
  };
}

function buildEnergyFeasibility(referenceAnchors, mode, goal) {
  const lowerExceedsEnergy = referenceAnchors.sports.ranges.filter(anchor => anchor.percentEnergyCandidate[0] > 100).map(anchor => anchor.id);
  const upperExceedsEnergy = referenceAnchors.sports.ranges.filter(anchor => anchor.percentEnergyCandidate[1] > 100).map(anchor => anchor.id);
  const active = mode === 'ACTIVE_TRAINING_TARGET';
  const deficit = goal === 'LOSS';
  return {
    fullMacroFeasibility: 'NOT_ASSESSABLE_PROTEIN_AND_FAT_POINTS_OPEN',
    sportsAnchorsWithLowerCarbEnergyAboveTotalEnergy: lowerExceedsEnergy,
    sportsAnchorsWithUpperCarbEnergyAboveTotalEnergy: upperExceedsEnergy,
    percentEnergyUsedAsDiagnosticNotCap: true,
    automaticCarbReductionFromDeficit: false,
    strategyBacktrackCandidate: active && deficit ? 'REVIEW_RATE_IF_ROBUST_ACTIVE_RANGE_CANNOT_FIT' : 'NOT_CURRENTLY_TRIGGERED',
    warnings: [
      ...(active ? ['ACTIVE_RANGE_REQUIRES_ENERGY_AND_PROTECTED_SET_CROSSCHECK'] : []),
      ...(active && deficit ? ['HIGH_WORKLOAD_DEFICIT_STRATEGY_CONFLICT_POSSIBLE'] : []),
      ...(lowerExceedsEnergy.length ? ['SPORTS_REFERENCE_LOWER_ANCHOR_EXCEEDS_TOTAL_ENERGY_FOR_SOME_TIERS'] : [])
    ]
  };
}

function selectionReason(mode) {
  if (mode === 'FLEXIBLE_RESIDUAL') return 'RESIDUAL_CARB_REQUIRES_RESOLVED_PROTEIN_AND_FAT_POINTS';
  if (mode === 'ACTIVE_TRAINING_TARGET') return 'ACTIVE_ARCHITECTURE_IDENTIFIED_FROM_MANUAL_CONTEXT_BUT_RANGE_DENOMINATOR_AND_POINT_ARE_OPEN';
  return 'MODE_ACTIVATION_RANGE_DENOMINATOR_AND_POINT_ARE_OPEN';
}
