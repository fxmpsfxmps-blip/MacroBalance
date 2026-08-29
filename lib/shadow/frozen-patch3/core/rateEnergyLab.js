import {
  getRateEnergyParameterSet,
  RATE_ENERGY_PARAMETER_REGISTRY_VERSION
} from '../config/rateEnergyParameterRegistry.js';
import { deepFreeze } from './inputScope.js';

const SUPPORTED_GOALS = new Set(['MAINTENANCE', 'LOSS', 'GAIN']);

export function runRateEnergyEnvelopeLab(profile, options = {}, parameterSet = getRateEnergyParameterSet()) {
  const error = validate(profile, options, parameterSet);
  if (error) return technicalInvalid(profile, parameterSet, error);

  const teeRange = normalizeRange(options.teeRange ?? options.tee ?? null);
  const direction = String(profile.goal || '').toUpperCase();
  const a2 = buildRateEnvelope(profile, direction, parameterSet.values.A2);
  const a3 = buildInitialEnergyEnvelope({
    direction,
    weightKg: profile.weightKg,
    teeRange,
    rateRange: a2.rateMagnitudeRangePerWeek,
    rateState: a2.status,
    a3: parameterSet.values.A3,
    a2
  });
  const a9 = assessOrdinaryAggressiveness({ profile, direction, teeRange, a2, a3,
    a9: parameterSet.values.A9 });

  return deepFreeze({
    modelId: parameterSet.id,
    modelVersion: parameterSet.modelVersion,
    policyVersion: parameterSet.policyVersion,
    registryVersion: RATE_ENERGY_PARAMETER_REGISTRY_VERSION,
    scientificStatus: parameterSet.scientificStatus,
    shadowOnly: true,
    productionEligible: false,
    connectedToProduction: false,
    status: overallStatus(a2, a3, a9),
    direction,
    A2: a2,
    A3: a3,
    A9: a9,
    contract: {
      observedScaleWeightRateIsNotIntendedRate: true,
      intendedRateIsNotExpectedTissueRate: true,
      fourWeekProjectionIsIllustrativeNotGuaranteed: true,
      noMidpoint: true,
      noHiddenPoint: true,
      noClamp: true,
      futureA8BacktrackCompatible: true,
      postSolverA9RecheckRequired: true
    },
    provenance: {
      parameterSetId: parameterSet.id,
      openParameters: parameterSet.openParameters,
      evidenceOrigins: parameterSet.evidenceOriginLabels
    },
    reasonCodes: unique([...a2.reasonCodes, ...a3.reasonCodes, ...a9.reasonCodes])
  });
}

export function buildInitialEnergyEnvelope({ direction, weightKg, teeRange, rateRange, rateState, a3, a2 }) {
  if (!teeRange) return partialA3('TEE_REQUIRED', ['TEE_MISSING']);
  if (direction === 'MAINTENANCE') {
    return deepFreeze({
      status: 'ENERGY_EXECUTABLE', model: a3.maintenanceModel,
      initializationHorizonDays: null, rateMagnitudeRangePerWeek: [0, 0],
      strategyOffsetKcalPerDay: [0, 0], strategyOffsetFractionOfTee: [0, 0],
      targetEnergyKcal: [...teeRange], selectedEnergyKcal: null,
      uncertainty: teeUncertainty(teeRange),
      reasonCodes: ['MAINTENANCE_EQUALS_TEE_ENVELOPE', 'NO_LONGITUDINAL_DEADBAND_IN_DAY_1'],
      provenance: [{ parameter: 'maintenance initializer', value: 'TEE envelope identity', origin: 'EVIDENCE_SUPPORTED' }]
    });
  }
  if (!rateRange || rateState === 'OUTSIDE_PERMISSIBLE_RANGE') {
    return partialA3('RATE_REQUIRED_OR_UNSUPPORTED', ['RATE_RANGE_NOT_EXECUTABLE']);
  }

  const [teeLow, teeHigh] = teeRange;
  if (direction === 'LOSS') {
    const [rateLow, rateHigh] = rateRange;
    const [densityLow, densityHigh] = a3.lossEnergyDensityKcalPerKg;
    const offsetLow = weightKg * rateLow * densityLow / 7;
    const offsetHigh = weightKg * rateHigh * densityHigh / 7;
    return deepFreeze({
      status: 'ENERGY_EXECUTABLE', model: a3.lossModel,
      initializationHorizonDays: a3.initializationHorizonDays,
      rateMagnitudeRangePerWeek: [...rateRange],
      strategyOffsetKcalPerDay: [offsetLow, offsetHigh],
      strategyOffsetFractionOfTee: [offsetLow / teeHigh, offsetHigh / teeLow],
      targetEnergyKcal: [teeLow - offsetHigh, teeHigh - offsetLow],
      selectedEnergyKcal: null,
      illustrativeFourWeekScaleWeightChangeKg: [weightKg * rateLow * 4, weightKg * rateHigh * 4],
      uncertainty: teeUncertainty(teeRange),
      reasonCodes: [
        'LOSS_BOUNDED_LOCAL_STATIC_INITIALIZER',
        'FULL_TEE_INTERVAL_PROPAGATED',
        'LEGACY_FIXED_DENSITY_NOT_USED_AS_UNIVERSAL_IDENTITY',
        'FOUR_WEEK_SCALE_PROJECTION_NOT_GUARANTEED'
      ],
      provenance: [
        { parameter: 'loss energy-density envelope kcal/kg', value: [...a3.lossEnergyDensityKcalPerKg], origin: a3.lossEnergyDensityOrigin },
        { parameter: 'initialization horizon days', value: a3.initializationHorizonDays, origin: 'INFERENCE' }
      ]
    });
  }

  const surplusFractions = gainSurplusFractions(rateRange, a2, a3);
  return deepFreeze({
    status: 'ENERGY_EXECUTABLE', model: a3.gainModel,
    initializationHorizonDays: a3.initializationHorizonDays,
    rateMagnitudeRangePerWeek: [...rateRange],
    strategyOffsetKcalPerDay: [teeLow * surplusFractions[0], teeHigh * surplusFractions[1]],
    strategyOffsetFractionOfTee: surplusFractions,
    targetEnergyKcal: [teeLow * (1 + surplusFractions[0]), teeHigh * (1 + surplusFractions[1])],
    selectedEnergyKcal: null,
    illustrativeFourWeekScaleWeightChangeKg: [weightKg * rateRange[0] * 4, weightKg * rateRange[1] * 4],
    uncertainty: teeUncertainty(teeRange),
    reasonCodes: [
      'GAIN_TEE_RELATIVE_INITIALIZER_NOT_TISSUE_ENERGY_CONVERSION',
      'FULL_TEE_INTERVAL_PROPAGATED',
      'LOSS_GAIN_ASYMMETRY_PRESERVED',
      'FOUR_WEEK_SCALE_PROJECTION_NOT_MUSCLE_GAIN'
    ],
    provenance: [
      { parameter: 'gain surplus fraction of TEE', value: surplusFractions, origin: a3.gainSurplusOrigin },
      { parameter: 'initialization horizon days', value: a3.initializationHorizonDays, origin: 'INFERENCE' }
    ]
  });
}

function buildRateEnvelope(profile, direction, a2) {
  if (!SUPPORTED_GOALS.has(direction)) {
    return deepFreeze({ status: 'UNSUPPORTED_DIRECTION', direction, rateMagnitudeRangePerWeek: null,
      signedRateRangePerWeek: null, requestedRatePerWeek: profile.requestedRatePerWeek ?? null,
      selectedRatePerWeek: null, reasonCodes: ['GOAL_DIRECTION_NOT_SUPPORTED_BY_B1'] });
  }
  if (direction === 'MAINTENANCE') {
    return deepFreeze({
      status: 'RATE_EXECUTABLE', direction, representation: a2.representation,
      denominator: a2.denominator, rateMagnitudeRangePerWeek: [0, 0], signedRateRangePerWeek: [0, 0],
      requestedRatePerWeek: profile.requestedRatePerWeek ?? null, selectedRatePerWeek: null,
      preferredRangePerWeek: [0, 0], permissibleRangePerWeek: [0, 0],
      reasonCodes: ['MAINTENANCE_RATE_IS_ZERO_INTENT_NOT_ZERO_OBSERVED_FLUCTUATION']
    });
  }

  const policy = direction === 'LOSS' ? a2.loss : a2.gain;
  const requested = profile.requestedRatePerWeek;
  const requestedMagnitude = Number.isFinite(requested) ? Math.abs(requested) : null;
  const directionValid = requestedMagnitude === null ||
    (direction === 'LOSS' ? requested <= 0 : requested >= 0);
  if (!directionValid) {
    return deepFreeze({ status: 'OUTSIDE_PERMISSIBLE_RANGE', direction,
      rateMagnitudeRangePerWeek: null, signedRateRangePerWeek: null,
      requestedRatePerWeek: requested, selectedRatePerWeek: null,
      preferredRangePerWeek: preferred(policy), permissibleRangePerWeek: permissible(policy),
      reasonCodes: ['REQUESTED_RATE_SIGN_CONFLICTS_WITH_GOAL'] });
  }

  const preferredRange = preferred(policy);
  const permissibleRange = permissible(policy);
  const inPermissible = requestedMagnitude === null || inside(requestedMagnitude, permissibleRange);
  const magnitudeRange = requestedMagnitude === null ? preferredRange : inPermissible ? [requestedMagnitude, requestedMagnitude] : null;
  const signed = magnitudeRange ? (direction === 'LOSS'
    ? [-magnitudeRange[1], -magnitudeRange[0]] : [...magnitudeRange]) : null;
  const context = rateContext(profile);
  return deepFreeze({
    status: inPermissible ? 'RATE_EXECUTABLE' : 'OUTSIDE_PERMISSIBLE_RANGE',
    direction, representation: a2.representation, denominator: a2.denominator,
    temporalSemantics: a2.temporalSemantics,
    rateMagnitudeRangePerWeek: magnitudeRange,
    signedRateRangePerWeek: signed,
    requestedRatePerWeek: requested ?? null,
    selectedRatePerWeek: null,
    preferredRangePerWeek: preferredRange,
    permissibleRangePerWeek: permissibleRange,
    evidenceComparatorRangePerWeek: direction === 'LOSS'
      ? policy.evidenceComparatorMagnitudePerWeek : policy.trainedPopulationEvidenceComparatorMagnitudePerWeek,
    context,
    reasonCodes: unique([
      requestedMagnitude === null ? 'POLICY_RATE_ENVELOPE_USED_NO_POINT_SELECTED' : 'EXPLICIT_REQUESTED_RATE_PRESERVED',
      inPermissible ? 'RATE_INSIDE_B1_PERMISSIBLE_REGION' : 'RATE_OUTSIDE_B1_PERMISSIBLE_REGION',
      'CURRENT_SCALE_WEIGHT_DENOMINATOR_NOT_REFERENCE_WEIGHT',
      context.training === 'RESISTANCE' ? 'RESISTANCE_CONTEXT_RETAINED_FOR_A9' : null,
      context.olderAdult ? 'OLDER_ADULT_CONTEXT_RETAINED_FOR_A9' : null
    ])
  });
}

function assessOrdinaryAggressiveness({ profile, direction, teeRange, a2, a3, a9 }) {
  if (!teeRange) return route('REQUEST_INFORMATION', 'REQUEST_INFORMATION',
    ['A9_TEE_REQUIRED'], 'PROVIDE_TEE_POINT_OR_ENVELOPE', null);
  if (!SUPPORTED_GOALS.has(direction)) return route('REQUEST_INFORMATION', 'REQUEST_INFORMATION',
    ['A9_SUPPORTED_GOAL_REQUIRED'], 'SELECT_MAINTENANCE_LOSS_OR_GAIN', null);
  if (a2.status === 'OUTSIDE_PERMISSIBLE_RANGE') return route('BLOCKED_STRATEGY', 'UPSTREAM_STRATEGY_BACKTRACK',
    ['A2_RATE_OUTSIDE_B1_PERMISSIBLE_REGION'], 'REVISE_INTENDED_RATE', diagnostics(teeRange, a3));
  if (a3.status !== 'ENERGY_EXECUTABLE') return route('REQUEST_INFORMATION', 'REQUEST_INFORMATION',
    ['A3_INITIAL_ENERGY_NOT_ASSESSABLE'], 'RESOLVE_RATE_AND_TEE', diagnostics(teeRange, a3));

  const d = diagnostics(teeRange, a3);
  if (direction !== 'MAINTENANCE' && d.teeWidthFractionOfLowerEndpoint > a9.teeWidthRequestThresholdFractionOfLowerEndpoint) {
    return route('REQUEST_INFORMATION', 'REQUEST_INFORMATION',
      ['TEE_ENVELOPE_TOO_WIDE_FOR_ORDINARY_DIRECTIONAL_INITIALIZATION'],
      'IMPROVE_ACTIVITY_OR_TEE_INFORMATION_OR_KEEP_BROADER_PARTIAL_ENVELOPE', d);
  }
  if (direction === 'MAINTENANCE') {
    return route(d.teeWidthFractionOfLowerEndpoint > a9.teeWidthRequestThresholdFractionOfLowerEndpoint
      ? 'PASS_WITH_CONTEXT' : 'PASS', 'CONTINUE_TO_A8',
    ['MAINTENANCE_TEE_ENVELOPE_PRESERVED', 'PASS_IS_NOT_A_SAFETY_LABEL'], 'CONTINUE_TO_A8', d);
  }

  const upperRate = a2.rateMagnitudeRangePerWeek[1];
  if (direction === 'LOSS') {
    const maxDeficit = a3.strategyOffsetKcalPerDay[1];
    const maxFraction = a3.strategyOffsetFractionOfTee[1];
    if (a3.targetEnergyKcal[0] < 800) return route('BLOCKED_STRATEGY', 'SPECIALIST_ROUTE',
      ['B1_TARGET_ENVELOPE_CROSSES_SUB_800_PRODUCT_ROUTE', 'NO_SILENT_CLAMP'],
      'REVISE_RATE_OR_USE_SPECIALIST_SERVICE', d);
    if (upperRate > a9.loss.contextRateUpperMagnitudePerWeek ||
        maxDeficit > a9.loss.contextMaximumDeficitKcal ||
        maxFraction > a9.loss.contextMaximumDeficitFractionOfTee) {
      return route('REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW',
        ['LOSS_RELATIVE_AGGRESSIVENESS_EXCEEDS_ORDINARY_AUTONOMOUS_REGION'],
        'REVIEW_RATE_TEE_AND_NUTRITIONAL_FEASIBILITY', d);
    }
    if (upperRate > a9.loss.passRateUpperMagnitudePerWeek ||
        maxDeficit > a9.loss.passMaximumDeficitKcal ||
        maxFraction > a9.loss.passMaximumDeficitFractionOfTee ||
        rateContext(profile).training === 'RESISTANCE' || rateContext(profile).olderAdult) {
      return route('PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
        ['LOSS_CONTEXT_REGION_REQUIRES_VISIBLE_MONITORING', 'PASS_IS_NOT_A_SAFETY_LABEL'],
        'CONTINUE_TO_A8_THEN_RECHECK_A9', d);
    }
    return route('PASS', 'CONTINUE_TO_A8',
      ['LOSS_INSIDE_B1_ORDINARY_AUTONOMOUS_REGION', 'PASS_IS_NOT_A_SAFETY_LABEL'],
      'CONTINUE_TO_A8_THEN_RECHECK_A9', d);
  }

  const maxSurplus = a3.strategyOffsetFractionOfTee[1];
  if (upperRate > a9.gain.passRateUpperMagnitudePerWeek || maxSurplus > a9.gain.passMaximumSurplusFractionOfTee) {
    return route('REVIEW_REQUIRED', 'PROFESSIONAL_REVIEW',
      ['GAIN_RATE_OR_SURPLUS_EXCEEDS_CONSERVATIVE_AUTONOMOUS_REGION'],
      'REVIEW_PURPOSE_TRAINING_STATUS_AND_SURPLUS', d);
  }
  if (rateContext(profile).training !== 'RESISTANCE') {
    return route('PASS_WITH_CONTEXT', 'CONTINUE_CONDITIONALLY',
      ['NONTRAINING_GAIN_HAS_WEAK_DIRECT_EVIDENCE', 'PASS_IS_NOT_A_SAFETY_LABEL'],
      'CONFIRM_GAIN_PURPOSE_AND_MONITOR_COMPOSITION_AND_RESPONSE', d);
  }
  return route('PASS', 'CONTINUE_TO_A8',
    ['CONSERVATIVE_RESISTANCE_GAIN_REGION', 'PASS_IS_NOT_A_SAFETY_LABEL'],
    'CONTINUE_TO_A8_THEN_RECHECK_A9', d);
}

function gainSurplusFractions(rateRange, a2, a3) {
  const upper = rateRange[1];
  const preferredUpper = a2.preferredRangePerWeek[1];
  const permissibleUpper = a2.permissibleRangePerWeek[1];
  if (upper <= preferredUpper) {
    return [...a3.gainPreferredSurplusFractionOfTee];
  }
  const progress = Math.min(1, Math.max(0,
    (upper - preferredUpper) / (permissibleUpper - preferredUpper)));
  return [
    a3.gainPreferredSurplusFractionOfTee[0] + 0.05 * progress,
    a3.gainPreferredSurplusFractionOfTee[1] +
      (a3.gainUpperRateSurplusFractionCeiling - a3.gainPreferredSurplusFractionOfTee[1]) * progress
  ];
}

function teeUncertainty([low, high]) {
  return { teeRangeKcal: [low, high], widthKcal: high - low,
    widthFractionOfLowerEndpoint: (high - low) / low, midpointUsed: false };
}

function diagnostics(teeRange, a3) {
  if (!teeRange) return null;
  return {
    teeRangeKcal: [...teeRange],
    teeWidthKcal: teeRange[1] - teeRange[0],
    teeWidthFractionOfLowerEndpoint: (teeRange[1] - teeRange[0]) / teeRange[0],
    targetEnergyKcal: a3?.targetEnergyKcal ?? null,
    strategyOffsetKcalPerDay: a3?.strategyOffsetKcalPerDay ?? null,
    strategyOffsetFractionOfTee: a3?.strategyOffsetFractionOfTee ?? null,
    selectedPointUsed: false,
    biologicalSafetyClaim: false
  };
}

function route(status, routeName, reasonCodes, nextAction, diagnostic) {
  return deepFreeze({ status, route: routeName, reasonCodes, nextAction,
    diagnostic, semantics: 'ORDINARY_PRODUCT_ROUTING_NOT_BIOLOGICAL_CLIFF',
    mayProceedToA8: ['PASS', 'PASS_WITH_CONTEXT'].includes(status),
    postSolverRecheckRequired: ['PASS', 'PASS_WITH_CONTEXT'].includes(status),
    safeLabelEmitted: false, clamped: false });
}

function partialA3(reason, reasonCodes) {
  return deepFreeze({ status: 'PARTIAL', model: null, initializationHorizonDays: null,
    rateMagnitudeRangePerWeek: null, strategyOffsetKcalPerDay: null,
    strategyOffsetFractionOfTee: null, targetEnergyKcal: null, selectedEnergyKcal: null,
    uncertainty: null, reason, reasonCodes, provenance: [] });
}

function preferred(policy) {
  return [...(policy.preferredMagnitudePerWeek || policy.preferred)];
}

function permissible(policy) {
  return [...(policy.broaderPermissibleMagnitudePerWeek || policy.permissible)];
}

function rateContext(profile) {
  return {
    training: String(profile.trainingModality || 'NONE').toUpperCase() === 'RESISTANCE' ? 'RESISTANCE' : 'OTHER_OR_NONE',
    workload: String(profile.workload || 'UNKNOWN').toUpperCase(),
    olderAdult: profile.age >= 65,
    bodyFatUsedForRate: false,
    severeObesityAutomaticallyRaisesRate: false,
    highMuscularityInferredFromBodySize: false
  };
}

function inside(value, [low, high]) { return value >= low && value <= high; }
function normalizeRange(value) {
  if (value === null || value === undefined) return null;
  if (Number.isFinite(value) && value > 0) return [value, value];
  if (Array.isArray(value) && value.length === 2 && value.every(item => Number.isFinite(item) && item > 0) && value[0] <= value[1]) return [value[0], value[1]];
  return null;
}

function validate(profile, options, parameterSet) {
  if (!profile || typeof profile !== 'object') return 'PROFILE_REQUIRED';
  if (!Number.isFinite(profile.weightKg) || profile.weightKg <= 0) return 'POSITIVE_WEIGHT_REQUIRED';
  if (!parameterSet || parameterSet.id !== 'LAB_RATE_ENERGY_E02') return 'LAB_RATE_ENERGY_E02_REQUIRED';
  const suppliedTee = options.teeRange ?? options.tee;
  if (suppliedTee !== null && suppliedTee !== undefined && !normalizeRange(suppliedTee)) return 'VALID_TEE_POINT_OR_RANGE_REQUIRED';
  if (profile.requestedRatePerWeek !== null && profile.requestedRatePerWeek !== undefined &&
      !Number.isFinite(profile.requestedRatePerWeek)) return 'FINITE_REQUESTED_RATE_OR_NULL_REQUIRED';
  return null;
}

function overallStatus(a2, a3, a9) {
  if (a2.status === 'OUTSIDE_PERMISSIBLE_RANGE') return 'BLOCKED_STRATEGY';
  if (a3.status !== 'ENERGY_EXECUTABLE') return 'PARTIAL';
  return a9.status;
}

function technicalInvalid(profile, parameterSet, error) {
  return deepFreeze({ modelId: parameterSet?.id || 'LAB_RATE_ENERGY_E02',
    modelVersion: parameterSet?.modelVersion || null, policyVersion: parameterSet?.policyVersion || null,
    registryVersion: RATE_ENERGY_PARAMETER_REGISTRY_VERSION, scientificStatus: null,
    shadowOnly: true, productionEligible: false, connectedToProduction: false,
    status: 'TECHNICAL_INVALID', direction: profile?.goal || null, A2: null, A3: null, A9: null,
    contract: { noMidpoint: true, noHiddenPoint: true, noClamp: true },
    provenance: { parameterSetId: parameterSet?.id || null, openParameters: [] },
    reasonCodes: [error] });
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }
