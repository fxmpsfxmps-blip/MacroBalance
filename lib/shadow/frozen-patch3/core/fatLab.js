import { deepFreeze } from './inputScope.js';

export function buildFatEvidence(profile, energyKcal, a6, options = {}) {
  const referenceFractions = a6.adultTotalFatReference.energyFraction;
  const totalFatReference = {
    classification: a6.adultTotalFatReference.classification,
    energyFraction: [...referenceFractions],
    percentEnergy: referenceFractions.map(value => value * 100),
    gramRangeAtEnergy: referenceFractions.map(value => energyKcal * value / 9),
    selectedPoint: null,
    activeAsHardConstraint: false,
    activeAsPreferredRange: false
  };

  const essentialFattyAcids = assessEssentialFattyAcids(profile, a6, options.efaData, options.efaSourceSignals);
  const context = buildContext(profile);
  const warnings = [
    'NO_AUTOMATIC_PREFERRED_TOTAL_FAT_RANGE',
    'NO_UNIVERSAL_30_PERCENT_POINT',
    'NO_UNIVERSAL_G_PER_KG_OR_ABSOLUTE_GRAM_FLOOR',
    ...(essentialFattyAcids.adequacyAssessability === 'NOT_ASSESSABLE' ? ['EFA_ADEQUACY_NOT_ASSESSABLE'] : []),
    ...(essentialFattyAcids.status === 'BELOW_AI_CANNOT_CLASSIFY_DEFICIENCY' ? ['EFA_BELOW_AI_REFERENCE_NOT_DEFICIENCY_DIAGNOSIS'] : []),
    ...context.warnings
  ];

  return deepFreeze({
    architecture: 'FAT_ADEQUACY_PLUS_CONTEXTUAL_TOTAL_FAT_SURFACE_PLUS_SOLVER_SELECTION',
    architectureStatus: 'SURVIVES_LAB_DIAGNOSTIC',
    numericSurfaceStatus: 'OPEN',
    energyKcal,
    totalFatReference,
    adequacyAssessability: essentialFattyAcids.adequacyAssessability,
    essentialFattyAcids,
    fatQuality: assessFatQuality(options.fatQualityData),
    context,
    bodySizeScaling: {
      actualBodyWeightGPerKg: null,
      referenceWeightGPerKg: null,
      absoluteGramFloor: null,
      weightKgObservedForDiagnostics: profile.weightKg,
      affectsAutomaticTarget: false
    },
    preferredRange: null,
    selectedFat: null,
    selectionReason: 'NUMERIC_CONTEXTUAL_TOTAL_FAT_SURFACE_AND_POINT_SELECTOR_NOT_IDENTIFIED',
    solverEligible: false,
    solverBlockReason: 'A6_PREFERRED_RANGE_AND_POINT_OPEN;LAB_PROTEIN_E02_ALSO_HAS_NO_AUTOMATIC_POINT',
    openParametersUsed: [
      'A6_CONTEXTUAL_PREFERRED_TOTAL_FAT_RANGE',
      'A6_POINT_SELECTION_POLICY',
      'A6_EFA_COVERAGE_THRESHOLD',
      'A6_SOURCE_PROXY_CALIBRATION',
      'A6_OUTSIDE_AMDR_HANDLING'
    ],
    warnings
  });
}

function assessEssentialFattyAcids(profile, a6, efaData, efaSourceSignals) {
  const references = efaReferences(profile, a6.essentialFattyAcidReferences);
  const proxy = Array.isArray(efaSourceSignals) && efaSourceSignals.length
    ? { status: 'SOURCE_PROXY_PRESENT_DIAGNOSTIC_ONLY', signals: [...efaSourceSignals], establishesAdequacy: false }
    : { status: 'SOURCE_PROXY_MISSING', signals: [], establishesAdequacy: false };
  const direct = directEfaDataStatus(efaData);

  if (!direct.complete) {
    return {
      adequacyAssessability: 'NOT_ASSESSABLE',
      status: direct.present ? 'DIRECT_DATA_INCOMPLETE_OR_COVERAGE_INSUFFICIENT' : 'NO_DIRECT_EFA_DATA',
      la: { observedGrams: direct.laGrams, aiReferenceGrams: references.laAiGrams, comparison: null },
      ala: { observedGrams: direct.alaGrams, aiReferenceGrams: references.alaAiGrams, comparison: null },
      references,
      coverage: direct.coverage,
      sourceProxy: proxy,
      deficiencyClassification: null,
      totalFatUsedAsProxy: false
    };
  }

  const laAtOrAbove = direct.laGrams >= references.laAiGrams;
  const alaAtOrAbove = direct.alaGrams >= references.alaAiGrams;
  const bothAtOrAbove = laAtOrAbove && alaAtOrAbove;
  return {
    adequacyAssessability: 'ASSESSABLE_FOR_AI_PLANNING_REFERENCE_COMPARISON',
    status: bothAtOrAbove ? 'AT_OR_ABOVE_AI_PLANNING_REFERENCES' : 'BELOW_AI_CANNOT_CLASSIFY_DEFICIENCY',
    la: { observedGrams: direct.laGrams, aiReferenceGrams: references.laAiGrams, comparison: laAtOrAbove ? 'AT_OR_ABOVE_AI_REFERENCE' : 'BELOW_AI_REFERENCE' },
    ala: { observedGrams: direct.alaGrams, aiReferenceGrams: references.alaAiGrams, comparison: alaAtOrAbove ? 'AT_OR_ABOVE_AI_REFERENCE' : 'BELOW_AI_REFERENCE' },
    references,
    coverage: direct.coverage,
    sourceProxy: proxy,
    deficiencyClassification: null,
    totalFatUsedAsProxy: false
  };
}

function directEfaDataStatus(efaData) {
  const present = efaData !== null && efaData !== undefined;
  const laGrams = present && Number.isFinite(efaData.laGrams) && efaData.laGrams >= 0 ? efaData.laGrams : null;
  const alaGrams = present && Number.isFinite(efaData.alaGrams) && efaData.alaGrams >= 0 ? efaData.alaGrams : null;
  const coverageStatus = present ? efaData.coverageStatus || 'UNKNOWN' : 'MISSING';
  const majorSourcesCovered = present ? efaData.majorSourcesCovered === true : false;
  const complete = laGrams !== null && alaGrams !== null && coverageStatus === 'HIGH' && majorSourcesCovered;
  return {
    present,
    complete,
    laGrams,
    alaGrams,
    coverage: { status: coverageStatus, majorSourcesCovered, numericThreshold: null, classification: complete ? 'EXPLICIT_HIGH_COVERAGE_INPUT' : 'INSUFFICIENT_FOR_DIRECT_COMPARISON' }
  };
}

function efaReferences(profile, references) {
  const male = profile.sex === 'MALE';
  const older = profile.age >= 51;
  const laKey = `${male ? 'MALE' : 'FEMALE'}_${older ? '51_PLUS' : '19_50'}`;
  const alaKey = `${male ? 'MALE' : 'FEMALE'}_ADULT`;
  return {
    laAiGrams: references.linoleicAcidAiGrams[laKey],
    alaAiGrams: references.alphaLinolenicAcidAiGrams[alaKey],
    classification: references.classification,
    sex: profile.sex,
    ageBand: older ? '51_PLUS' : '19_50'
  };
}

function buildContext(profile) {
  const highWorkload = ['HIGH', 'EXTREME'].includes(profile.workload);
  const lowCarb = ['LOW_CARB', 'KETOGENIC'].includes(profile.lowCarbPreference);
  const warnings = [];
  if (highWorkload) warnings.push('TOTAL_FAT_PREFERENCE_MUST_YIELD_TO_ACTIVE_CARBOHYDRATE_WHEN_CONFLICTING');
  if (lowCarb) warnings.push('LOW_CARB_IS_PREFERENCE_NOT_PHYSIOLOGICAL_FAT_REQUIREMENT');
  if (highWorkload && lowCarb) warnings.push('LOW_CARB_HIGH_WORKLOAD_PERFORMANCE_TRADEOFF_REQUIRES_REVIEW');
  return {
    goal: profile.goal,
    energyBalanceRule: 'NO_AUTOMATIC_DIRECTION_SPECIFIC_FAT_MULTIPLIER',
    workload: profile.workload || 'LOW',
    trainingModality: profile.trainingModality || 'NONE',
    activeCarbohydrateCompetition: highWorkload ? 'FAT_PREFERENCE_YIELDS_TO_ACTIVE_CARBOHYDRATE' : 'NOT_ACTIVE',
    lowCarbPreference: profile.lowCarbPreference || 'NONE',
    lowCarbBranch: lowCarb ? 'PREFERENCE_BRANCH_AVAILABLE_NUMERIC_POSITION_OPEN' : 'NOT_REQUESTED',
    ageYears: profile.age,
    ageMultiplier: null,
    warnings
  };
}

function assessFatQuality(data) {
  if (!data) return { assessability: 'NOT_ASSESSABLE', status: 'NO_FATTY_ACID_QUALITY_DATA', affectsTotalFatAmountAutomatically: false };
  return {
    assessability: 'DATA_PRESENT_POLICY_NOT_IMPLEMENTED',
    status: 'SEPARATE_QUALITY_LAYER',
    saturatedFatGrams: Number.isFinite(data.saturatedFatGrams) ? data.saturatedFatGrams : null,
    transFatGrams: Number.isFinite(data.transFatGrams) ? data.transFatGrams : null,
    affectsTotalFatAmountAutomatically: false
  };
}
