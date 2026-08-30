/**
 * Export source contract. This module receives already-authoritative result
 * objects; it must never import the menu engine, food catalog, calculator, or
 * micronutrient aggregator to recompute anything.
 */

export const PLAN_EXPORT_SCHEMA_VERSION = 'dashboard-plan-export-v1';

function error(code) {
  const value = new TypeError(code);
  value.code = code;
  throw value;
}
function cloneJson(value, path = 'value') {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((item, index) => cloneJson(item, `${path}[${index}]`));
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) error(`PLAN_EXPORT_NON_FINITE:${path}`);
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (!value || typeof value !== 'object') error(`PLAN_EXPORT_NON_SERIALIZABLE:${path}`);
  const copy = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) error(`PLAN_EXPORT_UNDEFINED:${path}.${key}`);
    copy[key] = cloneJson(value[key], `${path}.${key}`);
  }
  return copy;
}

function finiteMacroTarget(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) error(`PLAN_EXPORT_INVALID_TARGET:${field}`);
  return number;
}

function goalTarget(goal, plan) {
  const target = goal?.nutritionTarget || goal?.result || plan?.objetivo_nutricional_usado;
  if (!target || typeof target !== 'object') error('PLAN_EXPORT_TARGET_REQUIRED');
  return Object.freeze({
    kcal: finiteMacroTarget(target.kcal, 'kcal'),
    proteina: finiteMacroTarget(target.proteina, 'proteina'),
    carbos: finiteMacroTarget(target.carbos, 'carbos'),
    grasa: finiteMacroTarget(target.grasa, 'grasa'),
    calculatorVersion: target.calculatorVersion || goal?.calculatorVersion || null,
    standardId: target.standardId || goal?.inputSnapshot?.standardId || null,
    standardFreezeId: target.standardFreezeId || goal?.inputSnapshot?.standardFreezeId || null,
  });
}

function profileSummary(inputSnapshot) {
  const input = inputSnapshot && typeof inputSnapshot === 'object' ? inputSnapshot : {};
  const source = input.patch3Input && typeof input.patch3Input === 'object' ? input.patch3Input : input;
  const fields = {
    sex: source.sex ?? input.sexo ?? null,
    age: source.age ?? input.edad ?? null,
    weightKg: source.weightKg ?? input.peso ?? null,
    heightCm: source.heightCm ?? input.altura ?? null,
    goal: source.goal ?? input.goalType ?? null,
  };
  return Object.freeze(cloneJson(fields));
}

function hydrationReference(value) {
  if (value == null) return null;
  const copy = cloneJson(value, 'hydrationReference');
  if (copy.status === 'REFERENCE_ONLY') {
    const liters = copy.totalWaterReference?.valueLPerDay;
    if (!Number.isFinite(liters) || liters <= 0) error('PLAN_EXPORT_INVALID_HYDRATION_REFERENCE');
  }
  return Object.freeze(copy);
}

function dateMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return 0;
}

function exportFileStem(goalId) {
  const clean = String(goalId || 'current').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || 'current';
  return `macrobalance-plan-${clean}`;
}

export function createPlanExportSnapshot({ plan, currentGoal, hydrationReference: hydration, micronutrientObservability = null, exportedAt = 0 } = {}) {
  if (!plan || typeof plan !== 'object') error('PLAN_EXPORT_PLAN_REQUIRED');
  const goalId = currentGoal?.id || null;
  if (!goalId) error('PLAN_EXPORT_GOAL_ID_REQUIRED');
  const dashboardDays = [
    ...(Array.isArray(plan.dashboard_dias_semana_1) ? plan.dashboard_dias_semana_1 : []),
    ...(Array.isArray(plan.dashboard_dias_semana_2) ? plan.dashboard_dias_semana_2 : []),
  ];
  if (!dashboardDays.length) error('PLAN_EXPORT_DASHBOARD_DAYS_REQUIRED');
  const stamp = dateMs(exportedAt);
  const snapshot = {
    schemaVersion: PLAN_EXPORT_SCHEMA_VERSION,
    goalId: String(goalId),
    exportedAtMs: stamp,
    exportedAtIso: new Date(stamp).toISOString(),
    filenameStem: exportFileStem(goalId),
    profile: profileSummary(currentGoal?.inputSnapshot),
    nutritionTarget: goalTarget(currentGoal, plan),
    hydrationReference: hydrationReference(hydration ?? currentGoal?.hydrationReference ?? null),
    micronutrientObservability: micronutrientObservability == null ? null : cloneJson(micronutrientObservability, 'micronutrientObservability'),
    plan: {
      menuEngineVersion: plan.menu_engine_version ?? null,
      foodDatabaseVersion: plan.food_db_version ?? null,
      integrationMeta: plan.integration_meta == null ? null : cloneJson(plan.integration_meta, 'plan.integration_meta'),
      dashboardDays: cloneJson(dashboardDays, 'plan.dashboardDays'),
      shoppingList: plan.lista_compras_14_dias == null ? null : cloneJson(plan.lista_compras_14_dias, 'plan.shoppingList'),
      summaries: {
        global: plan.resumen_global == null ? null : cloneJson(plan.resumen_global, 'plan.resumen_global'),
        variety: plan.variedad_entre_semanas == null ? null : cloneJson(plan.variedad_entre_semanas, 'plan.variedad_entre_semanas'),
      },
    },
  };
  return Object.freeze(cloneJson(snapshot));
}

export function exportFilename(snapshot, extension) {
  if (!snapshot || typeof snapshot.filenameStem !== 'string') error('PLAN_EXPORT_SNAPSHOT_REQUIRED');
  const safeExtension = String(extension || '').replace(/^\./, '');
  if (!/^[a-z0-9]+$/i.test(safeExtension)) error('PLAN_EXPORT_EXTENSION_INVALID');
  return `${snapshot.filenameStem}.${safeExtension}`;
}

export function planJsonText(snapshot) {
  return `${JSON.stringify(cloneJson(snapshot), null, 2)}\n`;
}

export function shoppingListJsonText(snapshot) {
  if (!snapshot || !snapshot.plan) error('PLAN_EXPORT_SNAPSHOT_REQUIRED');
  return `${JSON.stringify(cloneJson(snapshot.plan.shoppingList || {}), null, 2)}\n`;
}
