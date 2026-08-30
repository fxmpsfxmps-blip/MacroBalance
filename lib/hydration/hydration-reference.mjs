/**
 * V2 hydration bridge: a population reference, deliberately not an
 * individualized hydration prescription. It has no dependency on the retired
 * Precision calculator, energy expenditure, body weight, or exercise calories.
 */

export const HYDRATION_REFERENCE_SCHEMA_VERSION = 'hydration-reference-0.1';
export const HYDRATION_REFERENCE_MODEL_ID = 'NASEM_TOTAL_WATER_AI_2005';

const ADULT_TOTAL_WATER_LITERS = Object.freeze({
  MALE: 3.7,
  FEMALE: 2.7,
});

const LIMITATIONS = Object.freeze([
  'AI_IS_POPULATION_REFERENCE_NOT_INDIVIDUAL_REQUIREMENT',
  'NOT_A_DEHYDRATION_DIAGNOSIS',
  'NOT_A_PLAIN_WATER_PRESCRIPTION',
  'BEVERAGE_SHARE_NOT_INDIVIDUALIZED',
]);

function adultAge(age) {
  return Number.isFinite(Number(age)) && Number(age) >= 19;
}
function trainingContext(profile) {
  const modality = profile?.trainingModality;
  const sessions = Number(profile?.sessionsPerWeek);
  const duration = Number(profile?.sessionDurationMin);
  return modality && modality !== 'NONE' && Number.isFinite(sessions) && sessions > 0 && Number.isFinite(duration) && duration > 0;
}

function base({ status, totalWaterReference, reasonCodes, contextFlags }) {
  return Object.freeze({
    schemaVersion: HYDRATION_REFERENCE_SCHEMA_VERSION,
    modelId: HYDRATION_REFERENCE_MODEL_ID,
    status,
    totalWaterReference,
    beverageWaterReference: null,
    plainWaterReference: null,
    currentIntake: null,
    intakeGap: null,
    exerciseAdjustment: Object.freeze({
      state: 'NOT_ESTIMATED',
      reasons: Object.freeze(['SWEAT_RATE_AND_ENVIRONMENT_NOT_OBSERVED']),
    }),
    clinicalRestrictionStatus: 'NOT_ASSESSED',
    contextFlags: Object.freeze(contextFlags),
    reasonCodes: Object.freeze(reasonCodes),
    limitations: LIMITATIONS,
  });
}

/**
 * NASEM adult total-water AI reference. The input retains all Standard fields
 * for provenance, but only adult sex selects the reference. Training is a
 * nonnumeric context flag; it must never become an implicit ml/kg or MET rule.
 */
export function buildHydrationReference(profile = {}) {
  const contextFlags = trainingContext(profile)
    ? ['TRAINING_CONTEXT_PRESENT_NO_AUTOMATIC_FLUID_ADJUSTMENT']
    : [];
  if (!adultAge(profile.age)) {
    return base({
      status: 'NOT_ASSESSABLE',
      totalWaterReference: null,
      reasonCodes: ['AGE_OUTSIDE_NASEM_ADULT_REFERENCE'],
      contextFlags,
    });
  }
  const valueLPerDay = ADULT_TOTAL_WATER_LITERS[profile.sex];
  if (!Number.isFinite(valueLPerDay)) {
    return base({
      status: 'NOT_ASSESSABLE',
      totalWaterReference: null,
      reasonCodes: ['SEX_REQUIRED_FOR_NASEM_ADULT_REFERENCE'],
      contextFlags,
    });
  }
  return base({
    status: 'REFERENCE_ONLY',
    totalWaterReference: Object.freeze({
      valueLPerDay,
      unit: 'L/day',
      semantics: 'TOTAL_WATER_FROM_FOODS_AND_BEVERAGES',
      authority: 'NASEM_DIETARY_REFERENCE_INTAKES_WATER_2005',
    }),
    reasonCodes: ['NASEM_ADULT_TOTAL_WATER_AI_REFERENCE'],
    contextFlags,
  });
}

export function assertHydrationReference(value) {
  if (!value || value.schemaVersion !== HYDRATION_REFERENCE_SCHEMA_VERSION) {
    throw new TypeError('HYDRATION_REFERENCE_SCHEMA_INVALID');
  }
  if (value.status === 'REFERENCE_ONLY') {
    const liters = value.totalWaterReference?.valueLPerDay;
    if (!Number.isFinite(liters) || liters <= 0) throw new TypeError('HYDRATION_REFERENCE_NON_FINITE');
  } else if (value.status !== 'NOT_ASSESSABLE') {
    throw new TypeError('HYDRATION_REFERENCE_STATUS_INVALID');
  }
  if (value.beverageWaterReference !== null || value.plainWaterReference !== null || value.currentIntake !== null || value.intakeGap !== null) {
    throw new TypeError('HYDRATION_REFERENCE_FORBIDDEN_INDIVIDUALIZED_VALUE');
  }
  return value;
}

export function hydrationPresentation(reference) {
  if (!reference || reference.status !== 'REFERENCE_ONLY') return null;
  const liters = reference.totalWaterReference.valueLPerDay.toFixed(1);
  return Object.freeze({
    liters,
    label: 'Referencia de agua total',
    detail: `${liters} L al día · incluye bebidas y agua de los alimentos.`,
    limitations: 'No es una prescripción de agua simple ni un diagnóstico de hidratación.',
  });
}
