export const FAT_PARAMETER_REGISTRY_VERSION = 'fat-parameter-registry-0.3.1';

const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};

export const fatParameterSets = freeze({
  LAB_FAT_E02: {
    id: 'LAB_FAT_E02',
    label: 'A6 fat-adequacy/contextual-surface diagnostic challenger',
    status: 'EXPERIMENTAL_PARAMETER',
    source: 'Owner authorization Prompt 8; MB-20, MB-21, MB-24–MB-26, explicit MB-29 content, MB-34–MB-36',
    rationale: 'Tests the surviving hybrid architecture without converting a population AMDR, body weight, or an EFA proxy into an automatic individual fat target.',
    modelVersion: 'fat-adequacy-contextual-hybrid-0.2.0',
    parameterVersion: 'fat-a6-open-surface-0.2.0',
    values: {
      A6: {
        adultTotalFatReference: {
          energyFraction: [0.20, 0.35],
          classification: 'ADULT_AMDR_REFERENCE_NOT_HARD_RANGE_OR_AUTOMATIC_PREFERRED_RANGE',
          selectedPoint: null,
          source: 'National Academies DRI total-fat AMDR for adults'
        },
        essentialFattyAcidReferences: {
          linoleicAcidAiGrams: {
            MALE_19_50: 17,
            MALE_51_PLUS: 14,
            FEMALE_19_50: 12,
            FEMALE_51_PLUS: 11
          },
          alphaLinolenicAcidAiGrams: {
            MALE_ADULT: 1.6,
            FEMALE_ADULT: 1.1
          },
          classification: 'AI_PLANNING_REFERENCE_NOT_INDIVIDUAL_REQUIREMENT_OR_DEFICIENCY_CUTOFF',
          source: 'National Academies DRI linoleic-acid and alpha-linolenic-acid AI tables'
        },
        coveragePolicy: {
          directQuantificationRequires: ['laGrams', 'alaGrams', 'coverageStatus:HIGH', 'majorSourcesCovered:true'],
          numericCoverageThreshold: null,
          sourceProxyMayEstablishAdequacy: false,
          missingMeans: 'NOT_ASSESSABLE'
        },
        totalFatSelection: {
          preferredRange: null,
          selectedFat: null,
          solverEligible: false,
          midpointSelector: 'REJECTED_UNSUPPORTED',
          actualBodyWeightGPerKgFloor: null,
          referenceWeightGPerKgFloor: null,
          absoluteGramFloor: null,
          status: 'OPEN_PARAMETER_CONTEXTUAL_SURFACE_AND_POINT_NOT_IDENTIFIED'
        }
      }
    }
  },
  LAB_FAT_E03: {
    id: 'LAB_FAT_E03',
    label: 'A6 reference-soft fat semantics candidate',
    status: 'EXPERIMENTAL_CANDIDATE_V1_SHADOW_ONLY',
    source: 'B3 Prompt 17; A6 frozen direction; National Academies adult AMDR; explicit EFA assessability policy',
    rationale: 'Uses the adult AMDR only as a population reference-soft comparator, never as a permitted physiological region, protected floor, selected midpoint, or safety maximum. EFA remains assessability metadata when intake coverage is absent.',
    modelVersion: 'fat-reference-soft-semantics-0.3.1',
    parameterVersion: 'fat-a6-reference-soft-0.3.1',
    values: {
      A6: {
        adultTotalFatReference: {
          energyFraction: [0.20, 0.35],
          classification: 'ADULT_AMDR_POPULATION_REFERENCE_SOFT_NOT_PERMITTED_OR_PREFERRED_RANGE',
          selectedPoint: null,
          source: 'National Academies DRI total-fat AMDR for adults'
        },
        essentialFattyAcidReferences: {
          linoleicAcidAiGrams: { MALE_19_50: 17, MALE_51_PLUS: 14, FEMALE_19_50: 12, FEMALE_51_PLUS: 11 },
          alphaLinolenicAcidAiGrams: { MALE_ADULT: 1.6, FEMALE_ADULT: 1.1 },
          classification: 'AI_PLANNING_REFERENCE_NOT_INDIVIDUAL_REQUIREMENT_OR_DEFICIENCY_CUTOFF',
          source: 'National Academies DRI linoleic-acid and alpha-linolenic-acid AI tables'
        },
        coveragePolicy: {
          directQuantificationRequires: ['laGrams', 'alaGrams', 'coverageStatus:HIGH', 'majorSourcesCovered:true'],
          numericCoverageThreshold: null,
          sourceProxyMayEstablishAdequacy: false,
          missingMeans: 'NOT_ASSESSABLE'
        },
        totalFatSelection: {
          referenceSoftRangeFraction: [0.20, 0.35],
          protectedLower: null,
          preferredRange: null,
          permittedRange: null,
          selectedFat: null,
          solverEligible: true,
          midpointSelector: 'REJECTED_UNSUPPORTED',
          actualBodyWeightGPerKgFloor: null,
          referenceWeightGPerKgFloor: null,
          absoluteGramFloor: null,
          status: 'EXECUTABLE_REFERENCE_SOFT_NO_PROTECTED_TOTAL_FAT_LOWER'
        }
      }
    }
  }
});

export function getFatParameterSet(id = 'LAB_FAT_E02') {
  const set = fatParameterSets[id];
  if (!set) throw new RangeError(`Unknown fat parameter set: ${id}`);
  return set;
}
