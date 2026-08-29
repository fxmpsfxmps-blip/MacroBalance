import { buildFatEvidence } from './fatLab.js';
import { deepFreeze } from './inputScope.js';

export function buildExecutableFatEnvelope(profile, energyKcal, a6, options = {}) {
  const base = buildFatEvidence(profile, energyKcal, a6, options);
  const fraction = a6.adultTotalFatReference.energyFraction;
  const populationReferenceRange = fraction.map(value => energyKcal * value / 9);
  return deepFreeze({
    ...base,
    architectureStatus: 'EXECUTABLE_REFERENCE_SOFT_SEMANTICS',
    numericSurfaceStatus: 'POPULATION_REFERENCE_ONLY_NO_INDIVIDUAL_NUMERIC_TARGET',
    populationReferenceRange,
    referenceSoftRange: populationReferenceRange,
    permittedRange: null,
    preferredRange: null,
    selectedFat: null,
    selectionReason: 'AMDR_POPULATION_REFERENCE_ONLY_NO_SELECTED_POINT',
    solverEligible: true,
    solverBlockReason: null,
    fatConstraintSemantics: {
      protectedLower: null,
      populationReferenceRange,
      permittedRange: null,
      preferredRange: null,
      level: 'L5',
      semanticClass: 'REFERENCE_SOFT',
      canYield: true,
      directIndividualPhysiology: false,
      classification: a6.adultTotalFatReference.classification
    },
    openParametersUsed: ['A6_EFA_COVERAGE_THRESHOLD'],
    warnings: base.warnings.filter(item => item !== 'NO_AUTOMATIC_PREFERRED_TOTAL_FAT_RANGE')
  });
}
