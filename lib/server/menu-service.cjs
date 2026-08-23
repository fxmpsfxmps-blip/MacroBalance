const {
  generarMenu,
  generarMenuSemanal,
  generarPlanDosSemanas,
  TODOS_LOS_ALIMENTOS,
  TODOS_LOS_PLATILLOS,
  getFoodById
} = require('../menu-engine/engine.js');

const {
  construirDashboardDia,
  construirListasDePlanDosSemanas,
  construirListaCompras,
  construirWarningsExclusion
} = require('../menu-engine/dashboard.js');

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
  }
}

const foodIds = new Set(TODOS_LOS_ALIMENTOS.map(food => food.id));

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError(`${label} es obligatorio.`);
  }
  return value;
}

function positiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RequestError(`${label} debe ser un número mayor que cero.`);
  }
  return parsed;
}

function boundedInteger(value, label, min, max, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RequestError(`${label} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function normalizeObjective(body, legacy = false) {
  const source = requireObject(
    legacy ? body.objetivos : body.objetivo,
    legacy ? 'objetivos' : 'objetivo'
  );

  return {
    kcal: positiveNumber(source.kcal, 'objetivo.kcal'),
    proteina: positiveNumber(legacy ? source.p : source.proteina, 'objetivo.proteina'),
    carbos: positiveNumber(legacy ? source.c : source.carbos, 'objetivo.carbos'),
    grasa: positiveNumber(legacy ? source.f : source.grasa, 'objetivo.grasa')
  };
}

function normalizeExclusions(body) {
  const values = [
    ...(body.alimentosExcluidos || []),
    ...(body.excludedIngredients || []),
    ...(body.alimentosSeleccionados || [])
  ];

  if (!values.every(value => typeof value === 'string')) {
    throw new RequestError('Las exclusiones deben ser identificadores de alimentos.');
  }

  const unique = [...new Set(values.map(value => value.trim()).filter(Boolean))];
  const unknown = unique.filter(id => !foodIds.has(id));
  if (unknown.length) {
    throw new RequestError(`Exclusiones desconocidas: ${unknown.slice(0, 5).join(', ')}.`);
  }
  return unique;
}

function normalizeParams(body, legacy = false) {
  requireObject(body, 'El cuerpo JSON');
  const params = {
    objetivo: normalizeObjective(body, legacy),
    alimentosSeleccionados: [],
    usarSoloCarrito: false,
    alimentosExcluidos: normalizeExclusions(body),
    numeroComidas: boundedInteger(body.numeroComidas, 'numeroComidas', 2, 5, 5),
    diasSinRepetir: boundedInteger(body.diasSinRepetir, 'diasSinRepetir', 1, 3, 2)
  };

  if (body.seed !== undefined) {
    if (typeof body.seed !== 'string' || !body.seed.trim() || body.seed.length > 120) {
      throw new RequestError('seed debe ser texto no vacío de hasta 120 caracteres.');
    }
    params.seed = body.seed;
  }

  return params;
}

function objectiveWarnings(objetivo) {
  const warnings = [];
  const kcalFromMacros = objetivo.proteina * 4 + objetivo.carbos * 4 + objetivo.grasa * 9;
  const margin = Math.max(60, objetivo.kcal * 0.03);

  if (Math.abs(kcalFromMacros - objetivo.kcal) > margin) {
    warnings.push(
      `Los macros equivalen aproximadamente a ${Math.round(kcalFromMacros)} kcal, ` +
      `pero el objetivo pide ${Math.round(objetivo.kcal)} kcal. El motor optimizará ` +
      'ambos objetivos usando food.kcal como fuente operacional de energía.'
    );
  }
  if (objetivo.kcal >= 3300) {
    warnings.push(
      'Objetivo calórico alto para el recetario actual: algunas recetas pueden ' +
      'alcanzar su máximo antes de cerrar el día.'
    );
  }
  return warnings;
}

function toleranceWarnings(result) {
  const diff = result.diferencia_vs_objetivo;
  const objective = result.objetivo;
  if (!diff || !objective) return [];
  const kcalTolerance = Math.max(80, objective.kcal * 0.05);
  const outside =
    Math.abs(diff.kcal) > kcalTolerance ||
    Math.abs(diff.proteina) > 15 ||
    Math.abs(diff.carbos) > 15 ||
    Math.abs(diff.grasa) > 5;
  if (!outside) return [];
  return [
    `Día fuera de la tolerancia estricta (kcal ±${Math.round(kcalTolerance)}, ` +
    `P/C ±15g, G ±5g): kcal ${signed(diff.kcal)}, proteína ${signed(diff.proteina)}g, ` +
    `carbos ${signed(diff.carbos)}g, grasa ${signed(diff.grasa)}g.`
  ];
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function ensureEngineResult(result) {
  if (!result || result.error) {
    throw new RequestError(result?.error || 'El motor no pudo generar el plan.');
  }
  return result;
}

function addExclusionDiagnostics(result, exclusions) {
  const excluded = new Set(exclusions);
  const found = new Set();

  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (!Array.isArray(value) && typeof value.food_id === 'string' && excluded.has(value.food_id)) {
      found.add(value.food_id);
    }
    Object.values(value).forEach(visit);
  }

  if (excluded.size) visit(result);
  result.hard_exclusion_violation = found.size > 0;
  result.excluded_ingredients_found = [...found];

  if (found.size) {
    const warning = {
      severity: 'high',
      message: `El resultado contiene ${found.size} alimento(s) excluido(s): ${[...found].join(', ')}.`
    };
    result.warning_flag = true;
    result.exclusion_warnings = [...(result.exclusion_warnings || []), warning];
  }
  return result;
}

function addExclusionSummary(result, exclusions) {
  const summary = construirWarningsExclusion(exclusions, TODOS_LOS_PLATILLOS);
  result.warning_flag = summary.warning_flag;
  result.exclusion_warnings = summary.warnings;
  result.exclusion_impacto = summary.impacto;
  return addExclusionDiagnostics(result, exclusions);
}

function generateDaily(body) {
  const params = normalizeParams(body, true);
  const result = ensureEngineResult(generarMenu(params));
  const dashboard = construirDashboardDia(result, getFoodById, TODOS_LOS_PLATILLOS);
  const formattedMenu = {};
  result.comidas.forEach(meal => {
    formattedMenu[meal.key || meal.nombre] = {
      name: meal.nombre,
      horario: meal.horario,
      ingredients: meal.items.map(item => `${item.cantidad} ${item.unidad} de ${item.nombre}`)
    };
  });

  const payload = {
    success: true,
    warnings: [...objectiveWarnings(params.objetivo), ...toleranceWarnings(result)],
    menu: formattedMenu,
    totales: result.totales,
    diferencia_vs_objetivo: result.diferencia_vs_objetivo,
    dashboard
  };
  return addExclusionSummary(payload, params.alimentosExcluidos);
}

function generateWeekly(body) {
  const params = normalizeParams(body);
  const result = ensureEngineResult(generarMenuSemanal(params));
  result.warnings = objectiveWarnings(params.objetivo);
  result.dashboard_dias = (result.dias || []).map(day => ({
    dia_semana: day.dia_semana,
    ...construirDashboardDia(day, getFoodById, TODOS_LOS_PLATILLOS)
  }));
  result.lista_compras_semana = construirListaCompras(result.dias, getFoodById);
  return addExclusionSummary(result, params.alimentosExcluidos);
}

function generateFortnight(body) {
  const params = normalizeParams(body);
  const result = ensureEngineResult(generarPlanDosSemanas(params));
  result.warnings = objectiveWarnings(params.objetivo);
  result.dashboard_dias_semana_1 = (result.semana_1?.dias || []).map(day => ({
    dia_semana: day.dia_semana,
    ...construirDashboardDia(day, getFoodById, TODOS_LOS_PLATILLOS)
  }));
  result.dashboard_dias_semana_2 = (result.semana_2?.dias || []).map(day => ({
    dia_semana: day.dia_semana,
    ...construirDashboardDia(day, getFoodById, TODOS_LOS_PLATILLOS)
  }));
  Object.assign(result, construirListasDePlanDosSemanas(result, getFoodById));
  return addExclusionSummary(result, params.alimentosExcluidos);
}

function run(operation, body = {}) {
  const startedAt = Date.now();
  try {
    let payload;
    if (operation === 'foods') payload = TODOS_LOS_ALIMENTOS;
    else if (operation === 'daily') payload = generateDaily(body);
    else if (operation === 'weekly') payload = generateWeekly(body);
    else if (operation === 'fortnight') payload = generateFortnight(body);
    else throw new RequestError('Operación desconocida.', 404);

    const durationMs = Date.now() - startedAt;
    if (payload && !Array.isArray(payload)) {
      payload.integration_meta = { generation_ms: durationMs };
    }
    return { status: 200, payload, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return {
      status: error instanceof RequestError ? error.status : 500,
      payload: {
        success: false,
        error: error instanceof RequestError ? error.message : 'Error interno al generar el plan.'
      },
      durationMs
    };
  }
}

module.exports = { run, RequestError };
