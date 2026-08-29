import { deepFreeze } from '../core/inputScope.js';

export const RATE_ENERGY_PARAMETER_REGISTRY_VERSION = 'rate-energy-lab-registry-0.2.0';

const LAB_RATE_ENERGY_E02 = deepFreeze({
  id: 'LAB_RATE_ENERGY_E02',
  modelVersion: 'rate-energy-envelope-0.2.0',
  policyVersion: 'b1-ordinary-initialization-0.2.0',
  scientificStatus: 'FROZEN_FOR_CANDIDATE_V1_WITH_EXPLICIT_HEURISTICS',
  productionEligible: false,
  connectedToProduction: false,
  shadowOnly: true,
  evidenceOriginLabels: [
    'EVIDENCE_SUPPORTED', 'INFERENCE', 'HEURISTIC_BUT_EXECUTABLE',
    'PRODUCT_POLICY', 'OPEN_PARAMETER'
  ],
  values: {
    A2: {
      representation: 'SIGNED_FRACTION_OF_CURRENT_SCALE_BODY_WEIGHT_PER_7_DAYS',
      denominator: 'CURRENT_SCALE_BODY_WEIGHT_KG',
      temporalSemantics: 'INTENDED_STRATEGY_RATE_NOT_OBSERVED_RATE_OR_TISSUE_RATE',
      maintenance: { preferred: [0, 0], permissible: [0, 0], origin: 'EVIDENCE_SUPPORTED' },
      loss: {
        preferredMagnitudePerWeek: [0.0025, 0.005],
        broaderPermissibleMagnitudePerWeek: [0.0025, 0.01],
        contextBoundaryMagnitudePerWeek: 0.0075,
        origin: 'HEURISTIC_BUT_EXECUTABLE',
        evidenceComparatorMagnitudePerWeek: [0.005, 0.01]
      },
      gain: {
        preferredMagnitudePerWeek: [0.001, 0.0025],
        broaderPermissibleMagnitudePerWeek: [0.0005, 0.005],
        reviewBoundaryMagnitudePerWeek: 0.0025,
        origin: 'HEURISTIC_BUT_EXECUTABLE',
        trainedPopulationEvidenceComparatorMagnitudePerWeek: [0.0025, 0.005]
      },
      referenceWeightImported: false,
      bodyCompositionDenominatorUsed: false,
      hiddenPointSelection: false
    },
    A3: {
      initializationHorizonDays: 28,
      maintenanceModel: 'TEE_ENVELOPE_IDENTITY',
      lossModel: 'BOUNDED_LOCAL_ENERGY_DENSITY_INTERVAL_ARITHMETIC',
      lossEnergyDensityKcalPerKg: [4850, 7700],
      lossEnergyDensityOrigin: 'HEURISTIC_BUT_EXECUTABLE',
      gainModel: 'TEE_RELATIVE_CONSERVATIVE_SURPLUS_ENVELOPE',
      gainPreferredSurplusFractionOfTee: [0.05, 0.10],
      gainUpperRateSurplusFractionCeiling: 0.15,
      gainSurplusOrigin: 'HEURISTIC_BUT_EXECUTABLE',
      teePropagation: 'FULL_INTERVAL_ARITHMETIC_NO_MIDPOINT',
      static7700UniversalIdentity: false,
      dynamicLongitudinalPrediction: false,
      hiddenClamp: false,
      hiddenPointSelection: false
    },
    A9: {
      architecture: 'ORDINARY_MULTI_SIGNAL_RELATIVE_AGGRESSIVENESS_POLICY',
      teeWidthRequestThresholdFractionOfLowerEndpoint: 0.25,
      loss: {
        passRateUpperMagnitudePerWeek: 0.005,
        contextRateUpperMagnitudePerWeek: 0.0075,
        passMaximumDeficitKcal: 750,
        contextMaximumDeficitKcal: 1000,
        passMaximumDeficitFractionOfTee: 0.25,
        contextMaximumDeficitFractionOfTee: 0.30
      },
      gain: {
        passRateUpperMagnitudePerWeek: 0.0025,
        passMaximumSurplusFractionOfTee: 0.10,
        reviewMaximumSurplusFractionOfTee: 0.15
      },
      semantics: 'PRODUCT_ROUTING_THRESHOLDS_NOT_BIOLOGICAL_CLIFFS',
      noSafeLabel: true,
      noSilentClamp: true,
      postSolverRecheckRequired: true
    }
  },
  openParameters: [
    'population calibration of preferred loss rate',
    'gain-rate refinement by verified resistance-training experience',
    'individual early weight-change energy density',
    'gain tissue partition and adaptive expenditure',
    'prospective calibration of ordinary A9 thresholds',
    'longitudinal controller deadband and hysteresis'
  ]
});

export const rateEnergyParameterSets = deepFreeze({ LAB_RATE_ENERGY_E02 });

export function getRateEnergyParameterSet(id = 'LAB_RATE_ENERGY_E02') {
  const parameterSet = rateEnergyParameterSets[id];
  if (!parameterSet) throw new RangeError(`Unknown rate/energy parameter set: ${id}`);
  return parameterSet;
}
