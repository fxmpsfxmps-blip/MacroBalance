/**
 * A1-A9 parameter-family registry.
 *
 * Values intentionally remain null. Owner approval permits later visible and
 * configurable experiments; it does not approve any scientific value.
 */

export const PARAMETER_STATUS = Object.freeze({
  EXPERIMENTAL_PARAMETER: 'EXPERIMENTAL_PARAMETER'
});

const defineFamily = entry => Object.freeze({ ...entry });

export const PARAMETER_REGISTRY_VERSION = 'prototype-governance-0.1.0';

export const parameterRegistry = Object.freeze([
  defineFamily({
    id: 'A1',
    module: 'MB-09/MB-10/MB-10A Activity Classifier',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A1; owner authorization Prompt 1A',
    rationale: 'Maps activity evidence to CHALLENGER_NASEM class/distribution, confidence and out-of-domain behavior. Scenarios may supply the class/distribution manually.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A2',
    module: 'MB-11/MB-12 Rate Target',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A2; owner authorization Prompt 1A',
    rationale: 'Defines direction-specific rate bands and any experimental central selection for loss, maintenance or gain.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A3',
    module: 'MB-13 Initial Energy Target',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A3; owner authorization Prompt 1A',
    rationale: 'Defines finite-horizon direction-specific rate-to-energy initialization, valid domain and uncertainty.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A4',
    module: 'MB-19 Protein Reference Size',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A4; owner authorization Prompt 1A',
    rationale: 'Defines predicted FFM/reference-size model, interval, anchors and divergence/out-of-domain gates.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A5',
    module: 'MB-14–MB-19 Protein Target',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A5; owner authorization Prompt 1A',
    rationale: 'Defines protein adequacy/contextual densities, modifiers, preferred range, upper range and planning-target selector.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A6',
    module: 'MB-20/MB-21 Fat Target',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A6; owner authorization Prompt 1A',
    rationale: 'Defines fat preferred range, EFA assessability fallback and handling outside population reference ranges.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A7',
    module: 'MB-22/MB-23 Carbohydrate Target',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A7; owner authorization Prompt 1A',
    rationale: 'Defines workload-mode activation, tiers/ranges, denominator, periodization and specialized out-of-domain behavior.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A8',
    module: 'MB-24/MB-25 Macro Solver',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A8; owner authorization Prompt 1A',
    rationale: 'Defines solver mechanics, tolerances, slack, tie-breaks, backtracking and action thresholds.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  }),
  defineFamily({
    id: 'A9',
    module: 'MB-34/MB-35 Energy Guardrails',
    status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    value: null,
    units: null,
    source: 'SCIENTIFIC_PROTOTYPE_IMPLEMENTATION_AUDIT.md §8 A9; owner authorization Prompt 1A',
    rationale: 'Defines unresolved low-energy action behavior and relative aggressiveness/RMR/TEE/rate/feasibility gates while preserving closed routing directions.',
    ownerApprovedForExperiment: true,
    approvedForScientificStandard: false,
    lastUpdated: '2026-08-26'
  })
]);

export function getParameterFamily(id) {
  return parameterRegistry.find(entry => entry.id === id) || null;
}

/**
 * Owner-authorized laboratory parameter sets. These are challengers, not
 * validated science. Every number is deliberately centralized here so the
 * engines cannot acquire hidden defaults.
 */
export const experimentalParameterSets = Object.freeze({
  LAB_E01: Object.freeze({
    id: 'LAB_E01', label: 'Experimental lab set E01', status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    source: 'Owner authorization Prompt 1A; engineering instantiation for adversarial P0 testing',
    rationale: 'Conservative deterministic surface used to exercise every pipeline branch; not scientifically approved.',
    values: Object.freeze({
      A1: Object.freeze({ confidenceManual: 0.9, confidenceExperimental: 0.45, coverageDegradationBelow: 0.7, heuristicTestStepBands: Object.freeze([4000,7000,10000,14000]), heuristicMinObservationDays: 7, highNonStepTrainingMinutesPerWeek: 600, palSemantics: Object.freeze({ INACTIVE: '<1.53', LOW_ACTIVE: '1.53–<1.68', ACTIVE: '1.68–<1.85', VERY_ACTIVE: '1.85–<2.50' }) }),
      A2: Object.freeze({ MAINTENANCE: Object.freeze([0, 0]), LOSS: Object.freeze([-0.0075, -0.0025]), GAIN: Object.freeze([0.001, 0.0035]), selected: Object.freeze({ MAINTENANCE: 0, LOSS: -0.005, GAIN: 0.002 }) }),
      A3: Object.freeze({ horizonDays: 28, lossKcalPerKg: 6800, gainKcalPerKg: 9200, methodLoss: 'FINITE_HORIZON_LOSS_E01', methodGain: 'FINITE_HORIZON_GAIN_E01' }),
      A4: Object.freeze({ bmiReferenceLower: 18.5, bmiReferenceUpper: 25, predictedFfmMale: Object.freeze([0.78, 0.24]), predictedFfmFemale: Object.freeze([0.65, 0.20]), divergenceRatio: 1.35 }),
      A5: Object.freeze({ adequacyGPerKg: 0.83, contextual: Object.freeze({ MAINTENANCE: Object.freeze([1.2, 1.6]), LOSS: Object.freeze([1.6, 2.0]), GAIN: Object.freeze([1.4, 1.8]) }), upperOptimizationGPerKg: 2.2 }),
      A6: Object.freeze({ preferredEnergyFraction: Object.freeze([0.25, 0.35]), selectedEnergyFraction: 0.30 }),
      A7: Object.freeze({ activeWorkloads: Object.freeze(['MODERATE', 'HIGH', 'EXTREME']), gPerKg: Object.freeze({ MODERATE: Object.freeze([3, 5]), HIGH: Object.freeze([5, 7]), EXTREME: Object.freeze([6, 10]) }), selectedPosition: 0.5 }),
      A8: Object.freeze({ energyToleranceKcal: 1e-7, candidateStepGrams: 1, tieBreak: 'MIDPOINT_THEN_CARB_RESIDUAL' }),
      A9: Object.freeze({ autonomousBlockBelowKcal: 800, lowEnergyUpperKcal: 1200, highActivityPalWarning: 2.5 })
    })
  }),
  LAB_E02: Object.freeze({
    id: 'LAB_E02', label: 'Experimental sensitivity set E02', status: PARAMETER_STATUS.EXPERIMENTAL_PARAMETER,
    source: 'Owner authorization Prompt 1A; alternate engineering sensitivity surface for P0',
    rationale: 'Perturbs open surfaces to expose parameter sensitivity; not a preferred or validated truth.',
    values: Object.freeze({
      A1: Object.freeze({ confidenceManual: 0.85, confidenceExperimental: 0.35, coverageDegradationBelow: 0.7, heuristicTestStepBands: Object.freeze([4000,7000,10000,14000]), heuristicMinObservationDays: 7, highNonStepTrainingMinutesPerWeek: 600, palSemantics: Object.freeze({ INACTIVE: '<1.53', LOW_ACTIVE: '1.53–<1.68', ACTIVE: '1.68–<1.85', VERY_ACTIVE: '1.85–<2.50' }) }),
      A2: Object.freeze({ MAINTENANCE: Object.freeze([0, 0]), LOSS: Object.freeze([-0.006, -0.002]), GAIN: Object.freeze([0.0005, 0.0025]), selected: Object.freeze({ MAINTENANCE: 0, LOSS: -0.004, GAIN: 0.0015 }) }),
      A3: Object.freeze({ horizonDays: 42, lossKcalPerKg: 6400, gainKcalPerKg: 9800, methodLoss: 'FINITE_HORIZON_LOSS_E02', methodGain: 'FINITE_HORIZON_GAIN_E02' }),
      A4: Object.freeze({ bmiReferenceLower: 18.5, bmiReferenceUpper: 27, predictedFfmMale: Object.freeze([0.76, 0.22]), predictedFfmFemale: Object.freeze([0.63, 0.18]), divergenceRatio: 1.25 }),
      A5: Object.freeze({ adequacyGPerKg: 0.8, contextual: Object.freeze({ MAINTENANCE: Object.freeze([1.1, 1.5]), LOSS: Object.freeze([1.5, 1.9]), GAIN: Object.freeze([1.3, 1.7]) }), upperOptimizationGPerKg: 2.0 }),
      A6: Object.freeze({ preferredEnergyFraction: Object.freeze([0.20, 0.35]), selectedEnergyFraction: 0.27 }),
      A7: Object.freeze({ activeWorkloads: Object.freeze(['HIGH', 'EXTREME']), gPerKg: Object.freeze({ HIGH: Object.freeze([4, 6]), EXTREME: Object.freeze([6, 9]) }), selectedPosition: 0.5 }),
      A8: Object.freeze({ energyToleranceKcal: 1e-6, candidateStepGrams: 0.5, tieBreak: 'LOWER_PROTECTED_SLACK_THEN_CARB_RESIDUAL' }),
      A9: Object.freeze({ autonomousBlockBelowKcal: 800, lowEnergyUpperKcal: 1200, highActivityPalWarning: 2.5 })
    })
  })
});

export function getExperimentalParameterSet(id = 'LAB_E01') {
  const set = experimentalParameterSets[id];
  if (!set) throw new RangeError(`Unknown experimental parameter set: ${id}`);
  return set;
}

export function describeParameterUse(parameterSet, ids) {
  return ids.map(id => {
    const family = getParameterFamily(id);
    if (!family || !(id in parameterSet.values)) throw new Error(`Undeclared experimental parameter: ${id}`);
    return Object.freeze({ id, status: family.status, value: parameterSet.values[id], source: `${family.source}; ${parameterSet.source}`, rationale: family.rationale, parameterSetId: parameterSet.id });
  });
}
