import { runIntegratedChallenger } from '../shadow/frozen-patch3/core/integratedChallenger.js';

export const ACTIVE_STANDARD_ID = 'MACROBALANCE_STANDARD_PATCH3';
export const ACTIVE_STANDARD_VERSION = 'standard-patch3-2026-08-29';
export const ACTIVE_STANDARD_FREEZE_ID = 'MB_CANDIDATE_V1_PATCH3_L005_INPUT_CONTRACT_STABILIZATION_2026-08-28';
export const TARGET_CONTRACT_VERSION = '2.1';
export const SELECTION_POLICY = 'DOWNSTREAM_COMPATIBILITY_LOWER_ENERGY_ENDPOINT_WITH_REVALIDATION';

const GOALS = Object.freeze([
  { id: 'deficit', goal: 'LOSS', nombre: 'Déficit', icon: 'down' },
  { id: 'mantenimiento', goal: 'MAINTENANCE', nombre: 'Mantenimiento', icon: 'equal' },
  { id: 'volumen', goal: 'GAIN', nombre: 'Volumen', icon: 'up' },
]);

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

function choosePoint(endpoint) {
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
  candidates.sort((a, b) => a.distance - b.distance || a.protein - b.protein || a.fat - b.fat);
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

function makeNutritionTarget(plan, point, output, goal) {
  return {
    schemaVersion: TARGET_CONTRACT_VERSION,
    calculationMode: 'standard',
    calculatorVersion: ACTIVE_STANDARD_VERSION,
    standardId: ACTIVE_STANDARD_ID,
    standardFreezeId: ACTIVE_STANDARD_FREEZE_ID,
    goalType: plan.id,
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
      goal,
    },
    scientificResolution: output.scientificStatus || null,
    targetRegion: output.target?.feasibleRegion || null,
    weeklyTarget: {
      strategy: 'uniform',
      dailyTarget: { kcal: point.kcal, proteina: point.protein, carbos: point.carbs, grasa: point.fat },
      variableDays: null,
    },
  };
}

function makePlan(definition, output) {
  const endpoint = endpointForGoal(output.targetContract?.solver?.jointRegion?.regionByEnergyEndpoint || [], definition.goal);
  const point = choosePoint(endpoint);
  if (!point) {
    const reason = output.status === 'TECHNICAL_INVALID' ? 'PATCH3_TECHNICAL_INVALID' : 'PATCH3_REGION_NOT_EXECUTABLE';
    return { id: definition.id, nombre: definition.nombre, icon: definition.icon, unavailable: true, unavailableReason: reason,
      kcal: 0, proteina: 0, carbos: 0, grasa: 0, nutritionTarget: null, patch3: output };
  }
  const nutritionTarget = makeNutritionTarget({ id: definition.id }, point, output, definition.goal);
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
    },
  };
}

export function calculatePatch3Standard(profile) {
  const source = profile && typeof profile === 'object' ? { ...profile } : {};
  const preferredGoal = normalizeGoal(source.goal);
  const outputs = GOALS.map(definition => {
    const output = runIntegratedChallenger({ ...source, goal: definition.goal });
    return { definition, output };
  });
  const plans = outputs.map(({ definition, output }) => makePlan(definition, output));
  const selected = plans.find(plan => plan.id === (preferredGoal === 'LOSS' ? 'deficit' : preferredGoal === 'GAIN' ? 'volumen' : 'mantenimiento'));
  const unavailable = plans.filter(plan => plan.unavailable);
  return Object.freeze({
    activeStandardId: ACTIVE_STANDARD_ID,
    activeStandardVersion: ACTIVE_STANDARD_VERSION,
    activeStandardFreezeId: ACTIVE_STANDARD_FREEZE_ID,
    preferredGoal,
    plans,
    selectedPlanId: selected?.id || null,
    status: unavailable.length === plans.length ? 'PARTIAL' : unavailable.length ? 'PARTIAL_WITH_UNAVAILABLE_PLAN' : 'COMPATIBILITY_TARGETS_READY',
    candidateOutputs: Object.freeze(outputs.map(({ definition, output }) => ({ goal: definition.goal, output }))),
  });
}

export function assertFiniteNutritionTarget(target) {
  if (!target || !['kcal', 'proteina', 'carbos', 'grasa'].every(key => Number.isFinite(target[key]) && target[key] >= 0)) {
    throw new TypeError('PATCH3_STANDARD_TARGET_NOT_FINITE');
  }
  return target;
}
