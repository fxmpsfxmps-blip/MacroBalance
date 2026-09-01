import { runProteinPolicyR1IntegratedChallenger, PROTEIN_POLICY_R1_ID, PROTEIN_POLICY_R1_VERSION } from './protein-policy-r1.mjs';
import { MUSCLE_GAIN_INTENT, evaluateMuscleGainEligibility } from './muscle-gain-eligibility.mjs';
import {
  evaluateLowBodySizePolicyR1,
  lowBodySizePolicyCanPromoteProtein,
  LOW_BODY_SIZE_POLICY_R1_ID,
  LOW_BODY_SIZE_POLICY_R1_VERSION,
} from './low-body-size-policy-r1.mjs';

export const ACTIVE_STANDARD_ID = 'MACROBALANCE_STANDARD_PATCH3';
export const ACTIVE_STANDARD_VERSION = 'standard-patch3-protein-r1-low-body-size-r1-2026-08-31';
export const ACTIVE_STANDARD_FREEZE_ID = 'MB_CANDIDATE_V1_PATCH3_L005_INPUT_CONTRACT_STABILIZATION_2026-08-28';
export const ACTIVE_PROTEIN_POLICY_ID = PROTEIN_POLICY_R1_ID;
export const ACTIVE_PROTEIN_POLICY_VERSION = PROTEIN_POLICY_R1_VERSION;
export const TARGET_CONTRACT_VERSION = '2.1';
export const SELECTION_POLICY = 'DOWNSTREAM_COMPATIBILITY_LOWER_ENERGY_ENDPOINT_WITH_REVALIDATION';

// This remains an unnormalized downstream product policy. It is not a
// physiological optimizer and must not be used to alter scientific ranges.
const SCORE_EQUALITY_ULPS = 64;
const OPERATIVE_SCIENTIFIC_STATUSES = new Set([
  'SCIENTIFICALLY_RESOLVED_REGION',
  'RESOLVED_WITH_SOFT_COMPROMISE',
]);
const OPERATIVE_MENU_PERMISSIONS = new Set([
  'REGION_NATIVE_SELECTION_ALLOWED',
  'SELECTED_POINT_INPUT_ALLOWED',
]);

const GOALS = Object.freeze([
  { id: 'deficit', goal: 'LOSS', nombre: 'Déficit', icon: 'down' },
  { id: 'mantenimiento', goal: 'MAINTENANCE', nombre: 'Mantenimiento', icon: 'equal' },
  { id: 'volumen', goal: 'GAIN', nombre: 'Volumen', icon: 'up' },
]);

const MUSCLE_GAIN_DEFINITION = Object.freeze({
  id: 'muscle_gain',
  goal: 'GAIN',
  intent: MUSCLE_GAIN_INTENT,
  nombre: 'Ganancia muscular',
  icon: 'up'
});

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeGoal(value) {
  if (value === 'LOSS' || value === 'MAINTENANCE' || value === 'GAIN') return value;
  if (String(value) === '0') return 'LOSS';
  if (String(value) === '2') return 'GAIN';
  return 'MAINTENANCE';
}

function endpointForGoal(regions, goal) {
  if (!regions.length) return null;
  // Keep all three visible plan directions on the same declared energy
  // envelope endpoint. This preserves the candidate's range semantics while
  // avoiding cross-plan inversions caused by mixing independent endpoints.
  // It is an execution choice, never a new physiological target surface.
  return regions[0];
}

function intervalValues(interval) {
  if (!interval || !Number.isFinite(interval.lower)) return [];
  const upper = Number.isFinite(interval.upper) ? interval.upper : interval.lower;
  const midpoint = interval.lower + (upper - interval.lower) / 2;
  return [...new Set([interval.lower, midpoint, upper])];
}

function inside(value, interval) {
  if (!interval || !Number.isFinite(value)) return false;
  const lower = Number.isFinite(interval.lower) ? interval.lower : -Infinity;
  const upper = Number.isFinite(interval.upper) ? interval.upper : Infinity;
  return value >= lower - 1e-7 && value <= upper + 1e-7;
}

function numericallyEquivalentScore(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return left === right;
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * SCORE_EQUALITY_ULPS * scale;
}

function compareCandidates(a, b) {
  if (!numericallyEquivalentScore(a.distance, b.distance)) return a.distance - b.distance;
  // Existing compatibility tie-break retained. Its product policy remains
  // open; this patch only makes mathematically equivalent scores reach it.
  return a.protein - b.protein || a.fat - b.fat;
}

export function choosePoint(endpoint) {
  const region = endpoint?.authorizedRegion || endpoint?.preferredRegion || endpoint?.hardRegion;
  const intervals = region?.projectionIntervals;
  if (!region || !intervals) return null;
  const energy = finite(endpoint.energyKcal);
  if (!Number.isFinite(energy)) return null;

  const proteinCandidates = intervalValues(intervals.protein);
  const fatCandidates = intervalValues(intervals.fat);
  const carbInterval = intervals.carbs;
  const candidates = [];
  for (const protein of proteinCandidates) {
    for (const fat of fatCandidates) {
      const carbs = (energy - 4 * protein - 9 * fat) / 4;
      if (!Number.isFinite(carbs) || !inside(carbs, carbInterval)) continue;
      const pMid = (intervals.protein.lower + (intervals.protein.upper ?? intervals.protein.lower)) / 2;
      const fMid = (intervals.fat.lower + (intervals.fat.upper ?? intervals.fat.lower)) / 2;
      const cMid = (carbInterval.lower + (carbInterval.upper ?? carbInterval.lower)) / 2;
      const distance = Math.abs(protein - pMid) + Math.abs(fat - fMid) + Math.abs(carbs - cMid);
      candidates.push({ protein, fat, carbs, distance });
    }
  }
  candidates.sort(compareCandidates);
  const selected = candidates[0];
  if (!selected) return null;
  const kcal = Math.round(energy);
  const protein = Math.max(0, Math.round(selected.protein));
  const fat = Math.max(0, Math.round(selected.fat));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const macroKcal = protein * 4 + carbs * 4 + fat * 9;
  return {
    kcal,
    protein,
    carbs,
    fat,
    macroKcal,
    differenceKcal: macroKcal - kcal,
    unrounded: selected,
    authorizedRegion: region,
  };
}

function operativeTargetAuthority(output) {
  const scientificStatus = output?.scientificStatus || null;
  const menuPermission = output?.menuPermission || null;
  return {
    allowed: OPERATIVE_SCIENTIFIC_STATUSES.has(scientificStatus)
      && OPERATIVE_MENU_PERMISSIONS.has(menuPermission),
    scientificStatus,
    menuPermission,
  };
}

function lowBodySizeAnswers(source, options) {
  const candidate = options?.lowBodySizeAnswers || source?.lowBodySizeAnswers || source?.lowBodySizePreflight || {};
  return { q1: candidate?.q1 ?? null, q2: candidate?.q2 ?? null };
}

function policyBlocksStandard(policy, goal) {
  if (!policy?.applicable || policy.status === 'NOT_APPLICABLE') return null;
  if (policy.status === 'PREFLIGHT_CLEARED' && goal === 'LOSS') return 'LOW_BODY_SIZE_STANDARD_DEFICIT_PROFESSIONAL_ROUTE';
  if (policy.status === 'PREFLIGHT_CLEARED') return null;
  return policy.reasonCode || 'LOW_BODY_SIZE_POLICY_UNRESOLVED';
}

function attachLowBodySizePolicy(output, policy, blockingReasonCode = null) {
  if (!policy?.applicable) return output;
  const context = policy.outputContext || null;
  return Object.freeze({
    ...output,
    lowBodySizePolicy: policy,
    blockingReasonCode,
    warnings: [...new Set([...(output?.warnings || []), ...(context ? [context.caution, context.recommendation] : [])])],
    reasonCodes: [...new Set([...(output?.reasonCodes || []), ...(blockingReasonCode ? [blockingReasonCode] : []), ...(context ? [context.caution, context.recommendation] : [])])],
    provenance: {
      ...output?.provenance,
      lowBodySizePolicyId: LOW_BODY_SIZE_POLICY_R1_ID,
      lowBodySizePolicyVersion: LOW_BODY_SIZE_POLICY_R1_VERSION,
    },
  });
}

function calculateWithLowBodySizePolicy(source, goal, options) {
  if (options?.lowBodySizePolicyEnabled === false) {
    return runProteinPolicyR1IntegratedChallenger({ ...source, goal });
  }
  const policy = evaluateLowBodySizePolicyR1({ ...source, goal }, lowBodySizeAnswers(source, options), {
    followUpExhausted: options?.lowBodySizeFollowUpExhausted === true,
  });
  const blockingReasonCode = policyBlocksStandard(policy, goal);
  const output = runProteinPolicyR1IntegratedChallenger(
    { ...source, goal },
    lowBodySizePolicyCanPromoteProtein(policy) && !blockingReasonCode
      ? { lowBodySizePolicy: policy }
      : {}
  );
  return attachLowBodySizePolicy(output, policy, blockingReasonCode);
}

function makeNutritionTarget(plan, point, output, goal) {
  const muscleGain = plan.intent === MUSCLE_GAIN_INTENT;
  return {
    schemaVersion: TARGET_CONTRACT_VERSION,
    calculationMode: 'standard',
    calculatorVersion: ACTIVE_STANDARD_VERSION,
    standardId: ACTIVE_STANDARD_ID,
    standardFreezeId: ACTIVE_STANDARD_FREEZE_ID,
    proteinPolicyId: ACTIVE_PROTEIN_POLICY_ID,
    proteinPolicyVersion: ACTIVE_PROTEIN_POLICY_VERSION,
    goalType: plan.id,
    ...(muscleGain ? { goalIntent: MUSCLE_GAIN_INTENT } : {}),
    kcal: point.kcal,
    proteina: point.protein,
    carbos: point.carbs,
    grasa: point.fat,
    energyCheck: { macroKcal: point.macroKcal, differenceKcal: point.differenceKcal },
    method: {
      source: 'PATCH3_INTEGRATED_CANDIDATE',
      challengerVersion: output.challengerVersion,
      freezeId: ACTIVE_STANDARD_FREEZE_ID,
      selectionPolicy: SELECTION_POLICY,
      selectedEnergyEndpointKcal: point.kcal,
      selectedPointIsCompatibilityOnly: true,
      proteinPolicyId: ACTIVE_PROTEIN_POLICY_ID,
      proteinPolicyVersion: ACTIVE_PROTEIN_POLICY_VERSION,
      goal,
      ...(muscleGain ? {
        intent: MUSCLE_GAIN_INTENT,
        targetRole: 'MUSCLE_GAIN_INITIAL_TARGET',
        downstreamGoal: 'GAIN',
        caveats: [
          'GAIN_TEE_RELATIVE_INITIALIZER_NOT_TISSUE_ENERGY_CONVERSION',
          'FOUR_WEEK_SCALE_PROJECTION_NOT_MUSCLE_GAIN'
        ]
      } : {})
    },
    scientificResolution: output.scientificStatus || null,
    targetRegion: output.target?.feasibleRegion || null,
    weeklyTarget: {
      strategy: 'uniform',
      dailyTarget: { kcal: point.kcal, proteina: point.protein, carbos: point.carbs, grasa: point.fat },
      variableDays: null,
    },
    ...(output?.lowBodySizePolicy?.outputContext ? {
      lowBodySizeContext: output.lowBodySizePolicy.outputContext,
    } : {}),
  };
}

function makePlan(definition, output) {
  const authority = operativeTargetAuthority(output);
  if (!authority.allowed) {
    return {
      id: definition.id,
      nombre: definition.nombre,
      icon: definition.icon,
      unavailable: true,
      unavailableReason: output?.blockingReasonCode || authority.scientificStatus || authority.menuPermission || 'PATCH3_OPERATIVE_AUTHORITY_NOT_GRANTED',
      kcal: 0,
      proteina: 0,
      carbos: 0,
      grasa: 0,
      nutritionTarget: null,
      patch3: output,
    };
  }
  const endpoint = endpointForGoal(output.targetContract?.solver?.jointRegion?.regionByEnergyEndpoint || [], definition.goal);
  const point = choosePoint(endpoint);
  if (!point) {
    const reason = output.status === 'TECHNICAL_INVALID' ? 'PATCH3_TECHNICAL_INVALID' : 'PATCH3_REGION_NOT_EXECUTABLE';
    return { id: definition.id, nombre: definition.nombre, icon: definition.icon, unavailable: true, unavailableReason: reason,
      kcal: 0, proteina: 0, carbos: 0, grasa: 0, nutritionTarget: null, patch3: output };
  }
  const nutritionTarget = makeNutritionTarget(definition, point, output, definition.goal);
  return {
    id: definition.id,
    nombre: definition.nombre,
    icon: definition.icon,
    cardio: 'Según configuración',
    kcal: point.kcal,
    proteina: point.protein,
    carbos: point.carbs,
    grasa: point.fat,
    nutritionTarget,
    patch3: {
      status: output.status,
      scientificStatus: output.scientificStatus,
      presentationStatus: output.presentationStatus,
      menuPermission: output.menuPermission,
      targetRange: output.energy?.targetRange || null,
      teeRange: output.energy?.teeRange || null,
      trainingInput: output.trace?.input?.validation?.profile?.trainingInput || null,
      selectedEndpointKcal: point.kcal,
      selectionPolicy: SELECTION_POLICY,
      warnings: output.warnings || [],
      reasonCodes: output.reasonCodes || [],
      lowBodySizePolicy: output.lowBodySizePolicy || null,
    },
  };
}

function makeMuscleGainUnavailablePlan(eligibility) {
  return Object.freeze({
    id: MUSCLE_GAIN_DEFINITION.id,
    nombre: MUSCLE_GAIN_DEFINITION.nombre,
    icon: MUSCLE_GAIN_DEFINITION.icon,
    unavailable: true,
    unavailableReason: eligibility.reasonCode,
    kcal: 0,
    proteina: 0,
    carbos: 0,
    grasa: 0,
    nutritionTarget: null,
    muscleGain: eligibility
  });
}

function makeMuscleGainUnavailableOutput(eligibility) {
  return Object.freeze({
    scientificStatus: eligibility.status,
    presentationStatus: 'UNAVAILABLE',
    menuPermission: 'NOT_GRANTED',
    reasonCodes: eligibility.detailReasonCodes,
    inputProvenance: { trainingInputState: eligibility.trainingInputState },
    trace: {
      input: {
        validation: {
          profile: { trainingInput: eligibility.trainingInput }
        }
      }
    },
    targetContract: {
      scientificStatus: eligibility.status,
      menu: { permission: 'NOT_GRANTED' },
      muscleGain: eligibility
    }
  });
}

function calculateMuscleGainIntent(source, options) {
  const eligibility = evaluateMuscleGainEligibility(source);
  if (!eligibility.eligible) {
    const plan = makeMuscleGainUnavailablePlan(eligibility);
    const output = makeMuscleGainUnavailableOutput(eligibility);
    return Object.freeze({
      activeStandardId: ACTIVE_STANDARD_ID,
      activeStandardVersion: ACTIVE_STANDARD_VERSION,
      activeStandardFreezeId: ACTIVE_STANDARD_FREEZE_ID,
      preferredGoal: MUSCLE_GAIN_INTENT,
      muscleGain: eligibility,
      plans: Object.freeze([plan]),
      selectedPlanId: null,
      status: 'PARTIAL_WITH_UNAVAILABLE_PLAN',
      candidateOutputs: Object.freeze([{ goal: MUSCLE_GAIN_INTENT, downstreamGoal: null, output }])
    });
  }

  // The frozen scientific pipeline continues to see generic GAIN only after
  // the distinct MUSCLE_GAIN intent has been accepted by this product gate.
  const output = calculateWithLowBodySizePolicy(source, eligibility.downstreamGoal, options);
  const plan = makePlan(MUSCLE_GAIN_DEFINITION, output);
  const planWithIntent = Object.freeze({ ...plan, muscleGain: eligibility });
  const unavailable = planWithIntent.unavailable ? [planWithIntent] : [];
  return Object.freeze({
    activeStandardId: ACTIVE_STANDARD_ID,
    activeStandardVersion: ACTIVE_STANDARD_VERSION,
    activeStandardFreezeId: ACTIVE_STANDARD_FREEZE_ID,
    preferredGoal: MUSCLE_GAIN_INTENT,
    muscleGain: eligibility,
    plans: Object.freeze([planWithIntent]),
    selectedPlanId: planWithIntent.unavailable ? null : planWithIntent.id,
    status: unavailable.length ? 'PARTIAL_WITH_UNAVAILABLE_PLAN' : 'COMPATIBILITY_TARGETS_READY',
    candidateOutputs: Object.freeze([{ goal: MUSCLE_GAIN_INTENT, downstreamGoal: eligibility.downstreamGoal, output }])
  });
}

export function calculatePatch3Standard(profile, options = {}) {
  const source = profile && typeof profile === 'object' ? { ...profile } : {};
  // This branch must remain before generic normalization. MUSCLE_GAIN is a
  // distinct product intent, never an alias that can silently fall through.
  if (source.goal === MUSCLE_GAIN_INTENT) return calculateMuscleGainIntent(source, options);
  const preferredGoal = normalizeGoal(source.goal);
  const definition = GOALS.find(item => item.goal === preferredGoal) || GOALS[1];
  const output = calculateWithLowBodySizePolicy(source, definition.goal, options);
  const plan = makePlan(definition, output);
  const plans = [plan];
  const unavailable = plan.unavailable ? [plan] : [];
  return Object.freeze({
    activeStandardId: ACTIVE_STANDARD_ID,
    activeStandardVersion: ACTIVE_STANDARD_VERSION,
    activeStandardFreezeId: ACTIVE_STANDARD_FREEZE_ID,
    preferredGoal,
    plans,
    selectedPlanId: plan.unavailable ? null : plan.id,
    status: unavailable.length ? 'PARTIAL_WITH_UNAVAILABLE_PLAN' : 'COMPATIBILITY_TARGETS_READY',
    candidateOutputs: Object.freeze([{ goal: definition.goal, output }]),
  });
}

export function assertFiniteNutritionTarget(target) {
  if (!target || !['kcal', 'proteina', 'carbos', 'grasa'].every(key => Number.isFinite(target[key]) && target[key] >= 0)) {
    throw new TypeError('PATCH3_STANDARD_TARGET_NOT_FINITE');
  }
  return target;
}
