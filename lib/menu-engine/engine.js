// engine.js
// Motor de generación de menús V6 (optimización multivariable de platillos).
//
// Diferencia clave con V4: el algoritmo NUNCA ensambla alimentos sueltos.
// Todo lo que aparece en el menú viene de un platillo registrado en
// dishes.json. Si no hay ningún platillo viable para un slot (con el
// carrito y las exclusiones del usuario), ese slot FALLA de forma
// explícita — ya no existe el "modo libre" por grupo SMAE que producía
// combinaciones como "bolillo + manzana".
//
// El objetivo diario ya NO se traduce a porciones SMAE para elegir alimentos
// (Porciones.js queda como utilidad legado, no se usa aquí). En su lugar:
//   1. El objetivo diario se reparte en sub-objetivos (kcal/P/C/G) por comida,
//      usando el mismo peso que ya tenían las plantillas.
//   2. Se preseleccionan candidatos baratos por capacidad/rango y contexto.
//   3. Los mejores candidatos se optimizan de verdad contra kcal/P/C/G a la vez.
//   4. La identidad de la receta se vigila con portion_scale y structural_strain.
//   5. El día se corrige por coste nutricional global y la semana sigue siendo
//      la unidad principal de optimización.
//   6. El resultado siempre trae `factible: true|false`.

const fs = require('fs');
const path = require('path');

const MENU_ENGINE_SOURCE_DIR = __dirname;

const { adaptarPlatillo } = require(
  path.join(
    MENU_ENGINE_SOURCE_DIR,
    'sustitucion'
  )
);

const FOOD_DB_VERSION = 'foods-v0.4-smae-grupos';
const MENU_ENGINE_VERSION = 'engine-v6.2-production-p0-p1';

// Producción consolidada:
// - P0 reproducibilidad disponible mediante seed.
// - P1 multivariable Top-8 es el modo por defecto.
// - P2 permanece OFF por defecto.
// - scoreSemana/selector semanal conservan comportamiento legacy.
// - P3-A/P5-A quedan como instrumentación dormida y no alteran la generación normal.

// ---------------------------------------------------------------------------
// P0 — REPRODUCIBILIDAD Y MEDICIÓN
// ---------------------------------------------------------------------------

function hashSemilla(seed) {
  const texto = String(seed);
  let hash = 2166136261;

  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function crearGeneradorAleatorio(seed) {
  if (
    seed === undefined ||
    seed === null
  ) {
    return () => Math.random();
  }

  let estado = hashSemilla(seed);

  return () => {
    let t =
      estado += 0x6D2B79F5;

    t = Math.imul(
      t ^ (t >>> 15),
      t | 1
    );

    t ^=
      t +
      Math.imul(
        t ^ (t >>> 7),
        t | 61
      );

    return (
      (
        t ^
        (t >>> 14)
      ) >>> 0
    ) / 4294967296;
  };
}

function ahoraMs() {
  return Number(
    process.hrtime.bigint()
  ) / 1e6;
}

function crearAcumuladorTelemetria() {
  return {
    llamadas_preseleccion: 0,
    recetas_elegibles: 0,
    recetas_preseleccionadas: 0,
    recetas_optimizadas: 0,
    errores_optimizacion: 0,
    reoptimizaciones_correccion: 0,
    tiempo_preseleccion_ms: 0,
    tiempo_optimizacion_ms: 0,
    llamadas_reconciliacion: 0,
    reconciliaciones_limitadas: 0,
    objetivos_operativos_no_reconciliables: 0,
    tiempo_reconciliacion_ms: 0
  };
}

function snapshotTelemetria(acumulador) {
  if (!acumulador) {
    return null;
  }

  return {
    ...acumulador,

    tiempo_preseleccion_ms:
      redondear(
        acumulador.tiempo_preseleccion_ms,
        4
      ),

    tiempo_optimizacion_ms:
      redondear(
        acumulador.tiempo_optimizacion_ms,
        4
      ),

    tiempo_reconciliacion_ms:
      redondear(
        acumulador.tiempo_reconciliacion_ms,
        4
      )
  };
}

function prepararParametrosEjecucion(params) {
  return {
    ...params,

    __rng:
      crearGeneradorAleatorio(
        params.seed
      ),

    __telemetriaAcumulada:
      params.telemetria === true
        ? crearAcumuladorTelemetria()
        : null
  };
}

// ---------------------------------------------------------------------------
// ESTRUCTURA DEL DÍA
// ---------------------------------------------------------------------------

const PLANTILLAS_COMIDAS = {
  2: [
    {
      nombre: 'Desayuno fuerte',
      horario: '08:00 - 09:30',
      peso: 0.45,
      pesoProteina: 0.50,
      pesoCarbos: 0.42,
      pesoGrasa: 0.45,
      key: 'desayuno',
      fuerte: true
    },
    {
      nombre: 'Comida fuerte',
      horario: '14:00 - 15:30',
      peso: 0.55,
      pesoProteina: 0.50,
      pesoCarbos: 0.58,
      pesoGrasa: 0.55,
      key: 'comida',
      fuerte: true
    }
  ],

  3: [
    {
      nombre: 'Desayuno',
      horario: '07:30 - 09:00',
      peso: 0.30,
      pesoProteina: 0.33,
      pesoCarbos: 0.28,
      pesoGrasa: 0.32,
      key: 'desayuno',
      fuerte: false
    },
    {
      nombre: 'Comida',
      horario: '13:30 - 15:00',
      peso: 0.40,
      pesoProteina: 0.34,
      pesoCarbos: 0.44,
      pesoGrasa: 0.36,
      key: 'comida',
      fuerte: true
    },
    {
      nombre: 'Cena',
      horario: '19:30 - 21:00',
      peso: 0.30,
      pesoProteina: 0.33,
      pesoCarbos: 0.28,
      pesoGrasa: 0.32,
      key: 'cena',
      fuerte: false
    }
  ],

  4: [
    {
      nombre: 'Desayuno',
      horario: '07:30 - 09:00',
      peso: 0.25,
      pesoProteina: 0.27,
      pesoCarbos: 0.23,
      pesoGrasa: 0.25,
      key: 'desayuno',
      fuerte: false
    },
    {
      nombre: 'Comida',
      horario: '13:30 - 15:00',
      peso: 0.35,
      pesoProteina: 0.30,
      pesoCarbos: 0.40,
      pesoGrasa: 0.35,
      key: 'comida',
      fuerte: true
    },
    {
      nombre: 'Merienda',
      horario: '17:30 - 18:30',
      peso: 0.15,
      pesoProteina: 0.16,
      pesoCarbos: 0.14,
      pesoGrasa: 0.15,
      key: 'merienda',
      fuerte: false
    },
    {
      nombre: 'Cena',
      horario: '20:00 - 21:00',
      peso: 0.25,
      pesoProteina: 0.27,
      pesoCarbos: 0.23,
      pesoGrasa: 0.25,
      key: 'cena',
      fuerte: false
    }
  ],

  5: [
    {
      nombre: 'Desayuno',
      horario: '07:00 - 09:00',
      peso: 0.25,
      pesoProteina: 0.23,
      pesoCarbos: 0.23,
      pesoGrasa: 0.25,
      key: 'desayuno',
      fuerte: false
    },
    {
      nombre: 'Colación matutina',
      horario: '10:30 - 11:30',
      peso: 0.10,
      pesoProteina: 0.12,
      pesoCarbos: 0.10,
      pesoGrasa: 0.10,
      key: 'colacion',
      fuerte: false
    },
    {
      nombre: 'Comida',
      horario: '13:30 - 15:00',
      peso: 0.32,
      pesoProteina: 0.30,
      pesoCarbos: 0.37,
      pesoGrasa: 0.30,
      key: 'comida',
      fuerte: true
    },
    {
      nombre: 'Merienda',
      horario: '17:00 - 18:00',
      peso: 0.10,
      pesoProteina: 0.12,
      pesoCarbos: 0.10,
      pesoGrasa: 0.10,
      key: 'merienda',
      fuerte: false
    },
    {
      nombre: 'Cena',
      horario: '20:00 - 21:00',
      peso: 0.23,
      pesoProteina: 0.23,
      pesoCarbos: 0.20,
      pesoGrasa: 0.25,
      key: 'cena',
      fuerte: false
    }
  ]
};

const COMIDAS_FIJAS =
  PLANTILLAS_COMIDAS[5];

function obtenerPlantillaComidas(
  numeroComidas,
  comidasPersonalizadas
) {
  if (
    Array.isArray(comidasPersonalizadas) &&
    comidasPersonalizadas.length > 0
  ) {
    return comidasPersonalizadas;
  }

  return (
    PLANTILLAS_COMIDAS[numeroComidas] ||
    COMIDAS_FIJAS
  );
}

const DIAS_SEMANA = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];

// ---------------------------------------------------------------------------
// BASES DE DATOS
// ---------------------------------------------------------------------------

const TODOS_LOS_ALIMENTOS =
  JSON.parse(
    fs.readFileSync(
      path.join(
        MENU_ENGINE_SOURCE_DIR,
        'data',
        'foods.json'
      ),
      'utf8'
    )
  );

const CATEGORIA_POR_DEFECTO_SEGUN_TIPO = {
  desayuno: 'plato_fuerte',
  comida: 'plato_fuerte',
  cena: 'plato_fuerte',
  colacion: 'complemento',
  merienda: 'complemento'
};

const PLATILLOS_SUSPENDIDOS =
  new Set([
    'PLT_DES_005',
    'PLT_SNC_002'
  ]);

function migrarPlatillo(d) {
  const categoria =
    d.categoria ||
    CATEGORIA_POR_DEFECTO_SEGUN_TIPO[
      d.meal_type[0]
    ] ||
    'complemento';

  return {
    ...d,

    categoria,

    es_comida_fuerte:
      d.es_comida_fuerte !== undefined
        ? d.es_comida_fuerte
        : categoria === 'plato_fuerte',

    prioridad:
      d.prioridad !== undefined
        ? d.prioridad
        : 5,

    ingredients:
      d.ingredients.map(
        ing => ({
          ...ing,

          sustituible:
            ing.sustituible === true
        })
      )
  };
}

const TODOS_LOS_PLATILLOS =
  JSON.parse(
    fs.readFileSync(
      path.join(
        MENU_ENGINE_SOURCE_DIR,
        'data',
        'dishes.json'
      ),
      'utf8'
    )
  ).map(
    migrarPlatillo
  );

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------

function getFoodById(id) {
  return TODOS_LOS_ALIMENTOS.find(
    f =>
      f.id === id
  );
}

function cantidadEnGramos(
  food,
  ing,
  cantidadEnUnidad
) {
  if (
    ing.unit === 'g' ||
    ing.unit === 'ml'
  ) {
    return cantidadEnUnidad;
  }

  if (
    ing.unit === food.unit_type
  ) {
    return (
      cantidadEnUnidad *
      food.increment
    );
  }

  throw new Error(
    `Unidad ambigua/no resuelta: el alimento "${food.id}" tiene ` +
    `unit_type "${food.unit_type}", pero la receta declara unit ` +
    `"${ing.unit}". Revisa manualmente este ingrediente.`
  );
}

function aporte(
  food,
  cantidadGramos
) {
  const factor =
    cantidadGramos /
    food.base_g;

  return {
    kcal:
      food.kcal * factor,

    protein:
      food.protein * factor,

    carbs:
      food.carbs * factor,

    fat:
      food.fat * factor,

    fiber:
      (food.fiber || 0) *
      factor
  };
}

function totalesVacios() {
  return {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0
  };
}

function sumar(a, b) {
  return {
    kcal:
      a.kcal + b.kcal,

    protein:
      a.protein + b.protein,

    carbs:
      a.carbs + b.carbs,

    fat:
      a.fat + b.fat,

    fiber:
      a.fiber + b.fiber
  };
}

function restar(a, b) {
  return {
    kcal:
      a.kcal - b.kcal,

    protein:
      a.protein - b.protein,

    carbs:
      a.carbs - b.carbs,

    fat:
      a.fat - b.fat
  };
}

function clamp(
  v,
  min,
  max
) {
  return Math.min(
    Math.max(
      v,
      min
    ),
    max
  );
}

function redondear(
  v,
  decimales = 2
) {
  const f =
    10 ** decimales;

  return (
    Math.round(
      (
        v +
        Number.EPSILON
      ) *
      f
    ) /
    f
  );
}

function cuantizarCantidadDeclarada(
  ing,
  cantidad
) {
  let paso = 0.1;

  if (
    ing.unit === 'g' ||
    ing.unit === 'ml'
  ) {
    paso = 1;
  }
  else if (
    ing.unit === 'pieza'
  ) {
    paso = 0.25;
  }

  const cuantizada =
    Math.round(
      cantidad /
      paso
    ) *
    paso;

  return redondear(
    clamp(
      cuantizada,
      ing.min_amount,
      ing.max_amount
    ),

    (
      ing.unit === 'g' ||
      ing.unit === 'ml'
    )
      ? 0
      : 2
  );
}

function formatearItem(item) {
  return {
    cantidad:
      item.cantidad_declarada,

    unidad:
      item.unit
  };
}

function objetivoInterno(objetivo) {
  return {
    kcal:
      Number(
        objetivo.kcal
      ) || 0,

    protein:
      Number(
        objetivo.protein ??
        objetivo.proteina
      ) || 0,

    carbs:
      Number(
        objetivo.carbs ??
        objetivo.carbos
      ) || 0,

    fat:
      Number(
        objetivo.fat ??
        objetivo.grasa
      ) || 0
  };
}

// ---------------------------------------------------------------------------
// COSTO NUTRICIONAL
// ---------------------------------------------------------------------------

function costoNutricional(
  totales,
  objetivo
) {
  const obj =
    objetivoInterno(
      objetivo
    );

  const escalas = {
    kcal:
      Math.max(
        50,
        obj.kcal * 0.06
      ),

    protein:
      Math.max(
        8,
        obj.protein * 0.12
      ),

    carbs:
      Math.max(
        10,
        obj.carbs * 0.12
      ),

    fat:
      Math.max(
        4,
        obj.fat * 0.12
      )
  };

  const eK =
    (
      totales.kcal -
      obj.kcal
    ) /
    escalas.kcal;

  const eP =
    obj.protein > 0
      ? (
          totales.protein -
          obj.protein
        ) /
        escalas.protein
      : 0;

  const eC =
    obj.carbs > 0
      ? (
          totales.carbs -
          obj.carbs
        ) /
        escalas.carbs
      : 0;

  const eF =
    obj.fat > 0
      ? (
          totales.fat -
          obj.fat
        ) /
        escalas.fat
      : 0;

  return (
    eK * eK * 2 +
    eP * eP +
    eC * eC +
    eF * eF
  );
}

function pesosNormalizados(
  comidasDelDia,
  campo
) {
  const valores =
    comidasDelDia.map(
      comida =>
        Number(
          comida[campo] ??
          comida.peso
        ) || 0
    );

  const total =
    valores.reduce(
      (
        a,
        b
      ) =>
        a + b,
      0
    ) || 1;

  return valores.map(
    valor =>
      valor /
      total
  );
}

function repartirObjetivoPorComida(
  objetivo,
  comidasDelDia
) {
  const wk =
    pesosNormalizados(
      comidasDelDia,
      'peso'
    );

  const wp =
    pesosNormalizados(
      comidasDelDia,
      'pesoProteina'
    );

  const wc =
    pesosNormalizados(
      comidasDelDia,
      'pesoCarbos'
    );

  const wf =
    pesosNormalizados(
      comidasDelDia,
      'pesoGrasa'
    );

  return comidasDelDia.map(
    (
      comida,
      i
    ) => ({
      slot:
        comida,

      subObjetivo: {
        kcal:
          objetivo.kcal *
          wk[i],

        protein:
          objetivo.proteina *
          wp[i],

        carbs:
          objetivo.carbos *
          wc[i],

        fat:
          objetivo.grasa *
          wf[i]
      }
    })
  );
}

// ---------------------------------------------------------------------------
// RECETAS VIABLES
// ---------------------------------------------------------------------------

function platillosViables(
  pc,
  carritoIds,
  excluidos
) {
  return TODOS_LOS_PLATILLOS.filter(
    d => {
      if (
        PLATILLOS_SUSPENDIDOS.has(
          d.dish_id
        )
      ) {
        return false;
      }

      if (
        !d.meal_type.includes(
          pc.key
        )
      ) {
        return false;
      }

      return d.ingredients.every(
        ing => {
          if (
            !ing.sustituible
          ) {
            return (
              getFoodById(
                ing.food_id
              ) !== undefined
            );
          }

          return true;
        }
      );
    }
  );
}

function penalizacionPorExclusion(
  platillo,
  excluidos
) {
  if (
    !excluidos ||
    excluidos.length === 0
  ) {
    return 0;
  }

  return platillo.ingredients.reduce(
    (
      acc,
      ing
    ) => {
      if (
        !excluidos.includes(
          ing.food_id
        )
      ) {
        return acc;
      }

      return (
        acc +
        (
          ing.sustituible
            ? 1
            : 4
        )
      );
    },
    0
  );
}

// ---------------------------------------------------------------------------
// CAPACIDAD NUTRICIONAL
// ---------------------------------------------------------------------------

const CACHE_RANGOS_NUTRICIONALES =
  new Map();

function estimarRangoNutricionalPlatillo(
  platillo
) {
  const cacheKey =
    platillo.dish_id;

  if (
    cacheKey &&
    CACHE_RANGOS_NUTRICIONALES.has(
      cacheKey
    )
  ) {
    return (
      CACHE_RANGOS_NUTRICIONALES.get(
        cacheKey
      )
    );
  }

  const rango =
    platillo.ingredients.reduce(
      (
        acc,
        ing
      ) => {
        const food =
          getFoodById(
            ing.food_id
          );

        if (!food) {
          return acc;
        }

        const aporteBase =
          aporte(
            food,
            cantidadEnGramos(
              food,
              ing,
              ing.base_amount
            )
          );

        const aporteMin =
          aporte(
            food,
            cantidadEnGramos(
              food,
              ing,
              ing.min_amount
            )
          );

        const aporteMax =
          aporte(
            food,
            cantidadEnGramos(
              food,
              ing,
              ing.max_amount
            )
          );

        acc.base =
          sumar(
            acc.base,
            aporteBase
          );

        acc.min =
          sumar(
            acc.min,
            aporteMin
          );

        acc.max =
          sumar(
            acc.max,
            aporteMax
          );

        return acc;
      },
      {
        base:
          totalesVacios(),

        min:
          totalesVacios(),

        max:
          totalesVacios()
      }
    );

  if (cacheKey) {
    CACHE_RANGOS_NUTRICIONALES.set(
      cacheKey,
      rango
    );
  }

  return rango;
}

function estimarRangoKcalPlatillo(
  platillo
) {
  const rango =
    estimarRangoNutricionalPlatillo(
      platillo
    );

  return {
    base:
      rango.base.kcal,

    min:
      rango.min.kcal,

    max:
      rango.max.kcal
  };
}

function distanciaKcalConHeadroom(
  platillo,
  subObjetivo
) {
  const {
    base,
    min,
    max
  } =
    estimarRangoKcalPlatillo(
      platillo
    );

  if (
    subObjetivo.kcal >= min &&
    subObjetivo.kcal <= max
  ) {
    return (
      Math.abs(
        base -
        subObjetivo.kcal
      ) *
      0.15
    );
  }

  if (
    subObjetivo.kcal >
    max
  ) {
    return (
      subObjetivo.kcal -
      max
    ) *
    1.5;
  }

  return (
    min -
    subObjetivo.kcal
  );
}

const PESO_CENTRO_PROXY_MULTIVARIABLE =
  0.15;

function costoProxyMultivariable(
  platillo,
  subObjetivo
) {
  const rango =
    estimarRangoNutricionalPlatillo(
      platillo
    );

  const obj =
    objetivoInterno(
      subObjetivo
    );

  const puntoMasCercano = {
    kcal:
      clamp(
        obj.kcal,
        rango.min.kcal,
        rango.max.kcal
      ),

    protein:
      clamp(
        obj.protein,
        rango.min.protein,
        rango.max.protein
      ),

    carbs:
      clamp(
        obj.carbs,
        rango.min.carbs,
        rango.max.carbs
      ),

    fat:
      clamp(
        obj.fat,
        rango.min.fat,
        rango.max.fat
      )
  };

  const costoRango =
    costoNutricional(
      puntoMasCercano,
      obj
    );

  const costoCentro =
    costoNutricional(
      rango.base,
      obj
    );

  return {
    costo:
      costoRango +
      costoCentro *
      PESO_CENTRO_PROXY_MULTIVARIABLE,

    costoRango,
    costoCentro,
    rango
  };
}

// ---------------------------------------------------------------------------
// SELECCIÓN ALEATORIA PONDERADA
// ---------------------------------------------------------------------------

function seleccionAleatoriaPonderada(
  puntuados,
  topN,
  rng = Math.random
) {
  const top =
    puntuados.slice(
      0,
      Math.min(
        topN,
        puntuados.length
      )
    );

  if (
    top.length === 0
  ) {
    return null;
  }

  const pesos =
    top.map(
      (
        _,
        i
      ) =>
        1 /
        (i + 1)
    );

  const totalPeso =
    pesos.reduce(
      (
        a,
        b
      ) =>
        a + b,
      0
    );

  let r =
    rng() *
    totalPeso;

  for (
    let i = 0;
    i < top.length;
    i++
  ) {
    r -=
      pesos[i];

    if (
      r <= 0
    ) {
      return top[i];
    }
  }

  return (
    top[
      top.length - 1
    ]
  );
}

// ---------------------------------------------------------------------------
// P1 — PRESELECCIÓN MULTIVARIABLE
// ---------------------------------------------------------------------------

const TOP_N_PRESELECCION = 8;
const TOP_N_CANDIDATOS_POR_SLOT = 5;

const MODOS_PRESELECCION =
  new Set([
    'kcal',
    'multivariable',
    'union'
  ]);

/*
 * IMPORTANTE:
 *
 * Ésta es la diferencia de producción frente al engine
 * diagnóstico de Codex.
 *
 * El benchmark encontró que multivariable Top-8 era el
 * mejor brazo P1, así que ahora ES el default.
 */
const DEFAULT_PRESELECTION_MODE =
  'multivariable';

const DEFAULT_PRESELECTION_KCAL_TOP_N =
  4;

const PESO_REPETICION_SEMANA_ANTERIOR =
  2.5;

function penalizacionContextual(
  d,
  excluidos,
  usoRecientePlatillos,
  usoRecienteAncla,
  diaActual,
  diasSinRepetir,
  platillosSemanaAnterior
) {
  let penalRepeticion =
    0;

  if (
    usoRecientePlatillos[
      d.dish_id
    ] !== undefined
  ) {
    const transcurridos =
      diaActual -
      usoRecientePlatillos[
        d.dish_id
      ];

    if (
      transcurridos <
      diasSinRepetir
    ) {
      penalRepeticion +=
        (
          diasSinRepetir -
          transcurridos
        ) *
        0.8;
    }
  }

  const ancla =
    d.ingredients.find(
      i =>
        !i.sustituible
    );

  if (
    ancla &&
    usoRecienteAncla[
      ancla.food_id
    ] !== undefined
  ) {
    const transcurridos =
      diaActual -
      usoRecienteAncla[
        ancla.food_id
      ];

    if (
      transcurridos <
      diasSinRepetir
    ) {
      penalRepeticion +=
        (
          diasSinRepetir -
          transcurridos
        ) *
        0.4;
    }
  }

  if (
    platillosSemanaAnterior &&
    platillosSemanaAnterior[
      d.dish_id
    ]
  ) {
    penalRepeticion +=
      PESO_REPETICION_SEMANA_ANTERIOR;
  }

  return {
    repeticion:
      penalRepeticion,

    exclusion:
      penalizacionPorExclusion(
        d,
        excluidos
      ),

    prioridad:
      d.prioridad ||
      5
  };
}

function preseleccionarCandidatos(
  candidatos,
  subObjetivo,
  excluidos,
  usoRecientePlatillos,
  usoRecienteAncla,
  diaActual,
  diasSinRepetir,
  platillosSemanaAnterior,
  configuracion = {}
) {
  const modo =
    MODOS_PRESELECCION.has(
      configuracion.preselectionMode
    )
      ? configuracion.preselectionMode
      : DEFAULT_PRESELECTION_MODE;

  const topN =
    clamp(
      Math.round(
        Number(
          configuracion.preselectionTopN ??
          TOP_N_PRESELECCION
        )
      ),
      1,
      Math.max(
        1,
        candidatos.length
      )
    );

  const kcalTopN =
    clamp(
      Math.round(
        Number(
          configuracion.preselectionKcalTopN ??
          DEFAULT_PRESELECTION_KCAL_TOP_N
        )
      ),
      1,
      Math.max(
        1,
        candidatos.length
      )
    );

  const puntuados =
    candidatos.map(
      d => {
        const p =
          penalizacionContextual(
            d,
            excluidos,
            usoRecientePlatillos,
            usoRecienteAncla,
            diaActual,
            diasSinRepetir,
            platillosSemanaAnterior
          );

        const penalContexto =
          p.repeticion +
          p.exclusion * 6 +
          p.prioridad * 1.5;

        const scoreProxyKcalNutricional =
          distanciaKcalConHeadroom(
            d,
            subObjetivo
          ) *
          0.08;

        const proxyMultivariable =
          costoProxyMultivariable(
            d,
            subObjetivo
          );

        return {
          d,
          p,

          scoreProxyKcalNutricional,

          scoreProxyMultivariableNutricional:
            proxyMultivariable.costo,

          scoreProxyKcal:
            scoreProxyKcalNutricional +
            penalContexto,

          scoreProxyMultivariable:
            proxyMultivariable.costo +
            penalContexto,

          proxyMultivariable,
          penalContexto
        };
      }
    );

  const rankingKcal =
    puntuados
      .slice()
      .sort(
        (
          a,
          b
        ) =>
          a.scoreProxyKcal -
          b.scoreProxyKcal
      );

  const posicionKcal =
    new Map(
      rankingKcal.map(
        (
          entry,
          i
        ) => [
          entry.d.dish_id,
          i + 1
        ]
      )
    );

  puntuados.forEach(
    entry => {
      entry.posicionPreseleccionAntigua =
        posicionKcal.get(
          entry.d.dish_id
        );
    }
  );

  const rankingMultivariable =
    puntuados
      .slice()
      .sort(
        (
          a,
          b
        ) =>
          a.scoreProxyMultivariable -
          b.scoreProxyMultivariable
      );

  let seleccionados;

  if (
    modo ===
    'multivariable'
  ) {
    seleccionados =
      rankingMultivariable.slice(
        0,
        topN
      );
  }

  else if (
    modo ===
    'union'
  ) {
    const vistos =
      new Set();

    seleccionados =
      [];

    const agregarUnicos =
      entries => {
        entries.forEach(
          entry => {
            if (
              vistos.has(
                entry.d.dish_id
              )
            ) {
              return;
            }

            vistos.add(
              entry.d.dish_id
            );

            seleccionados.push(
              entry
            );
          }
        );
      };

    agregarUnicos(
      rankingMultivariable.slice(
        0,
        topN
      )
    );

    agregarUnicos(
      rankingKcal.slice(
        0,
        kcalTopN
      )
    );
  }

  else {
    seleccionados =
      rankingKcal.slice(
        0,
        topN
      );
  }

  const salida =
    seleccionados.map(
      entry => ({
        ...entry,

        scoreBarato:
          modo === 'kcal'
            ? entry.scoreProxyKcal
            : entry.scoreProxyMultivariable,

        scoreProxyNutricional:
          modo === 'kcal'
            ? entry.scoreProxyKcalNutricional
            : entry.scoreProxyMultivariableNutricional
      })
    );

  Object.defineProperty(
    salida,
    'meta',
    {
      enumerable:
        false,

      value: {
        modo,
        topN,
        kcalTopN,

        mejorProxyMultivariable:
          rankingMultivariable.length > 0
            ? {
                dish_id:
                  rankingMultivariable[0]
                    .d
                    .dish_id,

                score_proxy:
                  rankingMultivariable[0]
                    .scoreProxyMultivariable,

                posicion_preseleccion_antigua:
                  rankingMultivariable[0]
                    .posicionPreseleccionAntigua
              }
            : null
      }
    }
  );

  return salida;
}

// ---------------------------------------------------------------------------
// IDENTIDAD ESTRUCTURAL
// ---------------------------------------------------------------------------

const ROLES_ESTRUCTURALES =
  new Set([
    'proteina_base',
    'proteina_refuerzo',
    'proteina_secundaria',
    'carbohidrato',
    'fruta',
    'grasa'
  ]);

function prepararDatosEscalado(
  ingredients
) {
  return ingredients.map(
    ing => {
      const food =
        getFoodById(
          ing.food_id
        );

      if (!food) {
        throw new Error(
          `No existe food_id "${ing.food_id}" en foods.json.`
        );
      }

      const baseG =
        cantidadEnGramos(
          food,
          ing,
          ing.base_amount
        );

      const baseAporte =
        aporte(
          food,
          baseG
        );

      const factorMin =
        ing.base_amount > 0
          ? (
              ing.min_amount /
              ing.base_amount
            )
          : 1;

      const factorMax =
        ing.base_amount > 0
          ? (
              ing.max_amount /
              ing.base_amount
            )
          : 1;

      return {
        ing,
        food,
        baseAporte,
        factorMin,
        factorMax
      };
    }
  );
}

function calcularCentroEstructural(
  datos,
  factores
) {
  let sumaPesos = 0;
  let sumaLog = 0;

  datos.forEach(
    (
      d,
      i
    ) => {
      if (
        !ROLES_ESTRUCTURALES.has(
          d.ing.role
        )
      ) {
        return;
      }

      const peso =
        Math.max(
          1,
          d.baseAporte.kcal
        );

      const f =
        Math.max(
          0.01,
          factores[i]
        );

      sumaPesos +=
        peso;

      sumaLog +=
        peso *
        Math.log(f);
    }
  );

  if (
    sumaPesos <= 0
  ) {
    return 1;
  }

  return Math.exp(
    sumaLog /
    sumaPesos
  );
}

function calcularStructuralStrain(
  datos,
  factores,
  centro
) {
  let sumaPesos = 0;
  let suma = 0;

  datos.forEach(
    (
      d,
      i
    ) => {
      if (
        !ROLES_ESTRUCTURALES.has(
          d.ing.role
        )
      ) {
        return;
      }

      const peso =
        Math.max(
          1,
          d.baseAporte.kcal
        );

      const desviacion =
        Math.log2(
          Math.max(
            0.01,
            factores[i]
          ) /
          Math.max(
            0.01,
            centro
          )
        );

      sumaPesos +=
        peso;

      suma +=
        peso *
        desviacion *
        desviacion;
    }
  );

  return (
    sumaPesos > 0
      ? Math.sqrt(
          suma /
          sumaPesos
        )
      : 0
  );
}

// ---------------------------------------------------------------------------
// RESULTADO DESDE FACTORES
// ---------------------------------------------------------------------------

function construirResultadoDesdeFactores(
  datos,
  factores,
  subObjetivo
) {
  const centro =
    calcularCentroEstructural(
      datos,
      factores
    );

  const factoresFinales =
    factores.slice();

  datos.forEach(
    (
      d,
      i
    ) => {
      if (
        !ROLES_ESTRUCTURALES.has(
          d.ing.role
        )
      ) {
        factoresFinales[i] =
          clamp(
            centro,
            d.factorMin,
            d.factorMax
          );
      }
    }
  );

  const items =
    datos.map(
      (
        d,
        i
      ) => {
        const cantidadIdeal =
          d.ing.base_amount *
          factoresFinales[i];

        const cantidadDeclarada =
          cuantizarCantidadDeclarada(
            d.ing,
            cantidadIdeal
          );

        const cantidadG =
          cantidadEnGramos(
            d.food,
            d.ing,
            cantidadDeclarada
          );

        const factorReal =
          d.ing.base_amount > 0
            ? (
                cantidadDeclarada /
                d.ing.base_amount
              )
            : 1;

        return {
          food_id:
            d.ing.food_id,

          role:
            d.ing.role,

          cantidad:
            redondear(
              cantidadG,
              1
            ),

          cantidad_declarada:
            cantidadDeclarada,

          unit:
            d.ing.unit,

          factor:
            factorReal,

          grupo_smae:
            d.food.grupo_smae
        };
      }
    );

  const totales =
    items.reduce(
      (
        acc,
        it
      ) =>
        sumar(
          acc,
          aporte(
            getFoodById(
              it.food_id
            ),
            it.cantidad
          )
        ),

      totalesVacios()
    );

  const factoresReales =
    items.map(
      it =>
        it.factor
    );

  const portionScale =
    calcularCentroEstructural(
      datos,
      factoresReales
    );

  const structuralStrain =
    calcularStructuralStrain(
      datos,
      factoresReales,
      portionScale
    );

  const costoBase =
    costoNutricional(
      totales,
      subObjetivo
    );

  const penalStrain =
    structuralStrain *
    structuralStrain *
    0.35;

  const penalPorcion =
    Math.pow(
      Math.log2(
        Math.max(
          0.05,
          portionScale
        )
      ),
      2
    ) *
    0.05;

  const costoTotal =
    costoBase +
    penalStrain +
    penalPorcion;

  return {
    items,
    totales,

    ajuste: {
      portion_scale:
        redondear(
          portionScale,
          3
        ),

      kcal_scale:
        redondear(
          totales.kcal /
          Math.max(
            1,

            datos.reduce(
              (
                a,
                d
              ) =>
                a +
                d.baseAporte.kcal,
              0
            )
          ),
          3
        ),

      structural_strain:
        redondear(
          structuralStrain,
          3
        ),

      costo_nutricional:
        redondear(
          costoBase,
          4
        ),

      costo_total:
        redondear(
          costoTotal,
          4
        ),

      ingredientes_en_limite:
        items.filter(
          (
            it,
            i
          ) => {
            const d =
              datos[i];

            return (
              Math.abs(
                it.factor -
                d.factorMin
              ) <
              0.015 ||

              Math.abs(
                it.factor -
                d.factorMax
              ) <
              0.015
            );
          }
        ).length
    },

    costoTotal
  };
}

// ---------------------------------------------------------------------------
// OPTIMIZADOR MULTIVARIABLE
// ---------------------------------------------------------------------------

function optimizarPlatilloMultivariable(
  ingredients,
  subObjetivo
) {
  const datos =
    prepararDatosEscalado(
      ingredients
    );

  const kcalBase =
    datos.reduce(
      (
        acc,
        d
      ) =>
        acc +
        d.baseAporte.kcal,
      0
    );

  const factorGlobal =
    kcalBase > 0
      ? (
          subObjetivo.kcal /
          kcalBase
        )
      : 1;

  const crearInicio =
    modo =>
      datos.map(
        d => {
          if (
            !ROLES_ESTRUCTURALES.has(
              d.ing.role
            )
          ) {
            return clamp(
              factorGlobal,
              d.factorMin,
              d.factorMax
            );
          }

          if (
            modo ===
            'base'
          ) {
            return clamp(
              1,
              d.factorMin,
              d.factorMax
            );
          }

          return clamp(
            factorGlobal,
            d.factorMin,
            d.factorMax
          );
        }
      );

  let mejor =
    null;

  for (
    const modo of [
      'global',
      'base'
    ]
  ) {
    const factores =
      crearInicio(
        modo
      );

    let actual =
      construirResultadoDesdeFactores(
        datos,
        factores,
        subObjetivo
      );

    for (
      const paso of [
        0.25,
        0.12,
        0.06,
        0.03
      ]
    ) {
      let huboMejora =
        true;

      let vueltas =
        0;

      while (
        huboMejora &&
        vueltas < 2
      ) {
        huboMejora =
          false;

        vueltas++;

        for (
          let i = 0;
          i < datos.length;
          i++
        ) {
          const d =
            datos[i];

          if (
            !ROLES_ESTRUCTURALES.has(
              d.ing.role
            ) ||
            d.factorMax -
            d.factorMin <
            1e-6
          ) {
            continue;
          }

          const original =
            factores[i];

          let mejorLocal =
            actual;

          let mejorFactor =
            original;

          const candidatosFactor = [
            clamp(
              original - paso,
              d.factorMin,
              d.factorMax
            ),

            clamp(
              original + paso,
              d.factorMin,
              d.factorMax
            ),

            d.factorMin,
            d.factorMax
          ];

          for (
            const f of
            candidatosFactor
          ) {
            if (
              Math.abs(
                f -
                original
              ) <
              1e-6
            ) {
              continue;
            }

            factores[i] =
              f;

            const prueba =
              construirResultadoDesdeFactores(
                datos,
                factores,
                subObjetivo
              );

            if (
              prueba.costoTotal +
              1e-8 <
              mejorLocal.costoTotal
            ) {
              mejorLocal =
                prueba;

              mejorFactor =
                f;
            }
          }

          factores[i] =
            mejorFactor;

          if (
            mejorLocal.costoTotal +
            1e-8 <
            actual.costoTotal
          ) {
            actual =
              mejorLocal;

            huboMejora =
              true;
          }
        }
      }
    }

    if (
      !mejor ||
      actual.costoTotal <
      mejor.costoTotal
    ) {
      mejor =
        actual;
    }
  }

  return mejor;
}

function escalarPlatilloPorRol(
  ingredients,
  subObjetivo
) {
  return optimizarPlatilloMultivariable(
    ingredients,
    subObjetivo
  );
}

function detectarIngredientesEnLimites(
  items,
  ingredients
) {
  const min = [];
  const max = [];

  items.forEach(
    (
      item,
      i
    ) => {
      const ing =
        ingredients[i];

      if (
        !ing ||
        !(
          ing.base_amount >
          0
        )
      ) {
        return;
      }

      const factorMin =
        ing.min_amount /
        ing.base_amount;

      const factorMax =
        ing.max_amount /
        ing.base_amount;

      const detalle = {
        food_id:
          item.food_id,

        role:
          ing.role
      };

      if (
        Math.abs(
          item.factor -
          factorMin
        ) <
        0.015
      ) {
        min.push(
          detalle
        );
      }

      if (
        Math.abs(
          item.factor -
          factorMax
        ) <
        0.015
      ) {
        max.push(
          detalle
        );
      }
    }
  );

  return {
    min,
    max
  };
}

// ---------------------------------------------------------------------------
// EVALUAR RECETAS
// ---------------------------------------------------------------------------

function evaluarCandidatosReales(
  candidatos,
  subObjetivo,
  carrito,
  excluidos,
  pc,
  contexto
) {
  const medirTiempos =
    contexto.telemetria === true;

  const inicioPreseleccion =
    medirTiempos
      ? ahoraMs()
      : 0;

  const pre =
    preseleccionarCandidatos(
      candidatos,
      subObjetivo,
      excluidos,
      contexto.usoRecientePlatillos,
      contexto.usoRecienteAncla,
      contexto.diaActual,
      contexto.diasSinRepetir,
      contexto.platillosSemanaAnterior,
      contexto.configuracionExperimental
    );

  const tiempoPreseleccionMs =
    medirTiempos
      ? ahoraMs() -
        inicioPreseleccion
      : null;

  const evaluados = [];

  let tiempoOptimizacionMs = 0;
  let erroresOptimizacion = 0;

  for (
    const entry of pre
  ) {
    try {
      const adaptado =
        adaptarPlatillo(
          entry.d,
          excluidos,
          carrito,
          pc.key,
          getFoodById
        );

      if (
        !adaptado ||
        adaptado.ingredients.length === 0
      ) {
        continue;
      }

      const inicioOptimizacion =
        medirTiempos
          ? ahoraMs()
          : 0;

      const optimizado =
        optimizarPlatilloMultivariable(
          adaptado.ingredients,
          subObjetivo
        );

      const tiempoCandidatoMs =
        medirTiempos
          ? ahoraMs() -
            inicioOptimizacion
          : null;

      if (
        medirTiempos
      ) {
        tiempoOptimizacionMs +=
          tiempoCandidatoMs;
      }

      const score =
        optimizado.costoTotal +
        entry.p.repeticion *
        0.15 +
        entry.p.exclusion *
        1.2 +
        entry.p.prioridad *
        0.03;

      evaluados.push({
        d:
          entry.d,

        optimizado,

        score,

        scoreProxy:
          entry.scoreBarato,

        scoreProxyNutricional:
          entry.scoreProxyNutricional,

        posicionPreseleccionAntigua:
          entry.posicionPreseleccionAntigua,

        tiempoOptimizacionMs:
          tiempoCandidatoMs,

        limites:
          detectarIngredientesEnLimites(
            optimizado.items,
            adaptado.ingredients
          )
      });
    }

    catch (_) {
      erroresOptimizacion++;
    }
  }

  evaluados.sort(
    (
      a,
      b
    ) =>
      a.score -
      b.score
  );

  const acumulador =
    contexto
      .configuracionExperimental
      ?.acumulador;

  if (
    acumulador
  ) {
    acumulador.llamadas_preseleccion++;

    acumulador.recetas_elegibles +=
      candidatos.length;

    acumulador.recetas_preseleccionadas +=
      pre.length;

    acumulador.recetas_optimizadas +=
      evaluados.length;

    acumulador.errores_optimizacion +=
      erroresOptimizacion;

    acumulador.tiempo_preseleccion_ms +=
      tiempoPreseleccionMs ||
      0;

    acumulador.tiempo_optimizacion_ms +=
      tiempoOptimizacionMs;
  }

  Object.defineProperty(
    evaluados,
    'meta',
    {
      enumerable:
        false,

      value: {
        recetasElegibles:
          candidatos.length,

        recetasPreseleccionadas:
          pre.length,

        recetasOptimizadas:
          evaluados.length,

        erroresOptimizacion,

        tiempoPreseleccionMs,

        tiempoOptimizacionMs,

        modo:
          pre.meta.modo,

        topN:
          pre.meta.topN,

        kcalTopN:
          pre.meta.kcalTopN,

        mejorProxyMultivariable:
          pre.meta
            .mejorProxyMultivariable
      }
    }
  );

  return evaluados;
}

// ---------------------------------------------------------------------------
// GENERAR UNA COMIDA
// ---------------------------------------------------------------------------

function generarComida(
  pc,
  subObjetivo,
  carrito,
  excluidos,
  usoRecientePlatillos,
  usoRecienteAncla,
  diaActual,
  diasSinRepetir,
  platillosExcluidosHoy,
  platillosSemanaAnterior,
  configuracionExperimental = {}
) {
  const carritoIds =
    new Set(
      carrito.map(
        f =>
          f.id
      )
    );

  let candidatos =
    platillosViables(
      pc,
      carritoIds,
      excluidos
    )
    .filter(
      d =>
        !platillosExcluidosHoy.has(
          d.dish_id
        )
    );

  if (
    pc.fuerte
  ) {
    const soloFuertes =
      candidatos.filter(
        d =>
          d.es_comida_fuerte
      );

    if (
      soloFuertes.length >
      0
    ) {
      candidatos =
        soloFuertes;
    }
  }

  else {
    const soloComplementos =
      candidatos.filter(
        d =>
          !d.es_comida_fuerte
      );

    if (
      soloComplementos.length >
      0
    ) {
      candidatos =
        soloComplementos;
    }
  }

  if (
    candidatos.length === 0
  ) {
    return {
      ok:
        false,

      motivo:
        `No hay ningún platillo disponible para "${pc.nombre}" ` +
        `(${pc.key}) con las restricciones actuales.`
    };
  }

  const evaluados =
    evaluarCandidatosReales(
      candidatos,
      subObjetivo,
      carrito,
      excluidos,
      pc,
      {
        usoRecientePlatillos,
        usoRecienteAncla,
        diaActual,
        diasSinRepetir,
        platillosSemanaAnterior,

        telemetria:
          configuracionExperimental.telemetria ===
          true,

        configuracionExperimental
      }
    );

  if (
    evaluados.length ===
    0
  ) {
    return {
      ok:
        false,

      motivo:
        `Los candidatos de "${pc.nombre}" no pudieron adaptarse ` +
        `de forma calculable con las unidades/rangos actuales.`
    };
  }

  const elegida =
    seleccionAleatoriaPonderada(
      evaluados,
      TOP_N_CANDIDATOS_POR_SLOT,
      configuracionExperimental.rng ||
      Math.random
    );

  const {
    d:
      platillo,

    optimizado
  } =
    elegida;

  return {
    ok:
      true,

    comida: {
      nombre:
        pc.nombre,

      horario:
        pc.horario,

      key:
        pc.key,

      dish_id:
        platillo.dish_id,

      platillo:
        platillo.name,

      items:
        optimizado.items,

      totales:
        optimizado.totales,

      ajuste:
        optimizado.ajuste,

      subObjetivo,

      ...(
        configuracionExperimental.telemetria ===
        true
          ? {
              telemetria_preseleccion: {
                modo:
                  evaluados.meta.modo,

                top_n:
                  evaluados.meta.topN,

                top_n_kcal_union:
                  evaluados.meta.kcalTopN,

                recetas_elegibles:
                  evaluados.meta
                    .recetasElegibles,

                recetas_preseleccionadas:
                  evaluados.meta
                    .recetasPreseleccionadas,

                recetas_optimizadas:
                  evaluados.meta
                    .recetasOptimizadas,

                errores_optimizacion:
                  evaluados.meta
                    .erroresOptimizacion,

                dish_id_seleccionada:
                  platillo.dish_id,

                score_proxy_seleccionado:
                  redondear(
                    elegida.scoreProxy,
                    6
                  ),

                score_proxy_nutricional_seleccionado:
                  redondear(
                    elegida
                      .scoreProxyNutricional,
                    6
                  ),

                score_real_optimizacion:
                  redondear(
                    optimizado.costoTotal,
                    6
                  ),

                score_real_contextual:
                  redondear(
                    elegida.score,
                    6
                  ),

                penalizacion_contextual_aplicada:
                  redondear(
                    elegida.score -
                    optimizado.costoTotal,
                    6
                  ),

                posicion_preseleccion_antigua:
                  elegida
                    .posicionPreseleccionAntigua,

                mejor_proxy_multivariable_disponible:
                  evaluados.meta
                    .mejorProxyMultivariable,

                mejor_candidato_real_entre_optimizados: {
                  dish_id:
                    evaluados[0]
                      .d
                      .dish_id,

                  score_real:
                    redondear(
                      evaluados[0]
                        .optimizado
                        .costoTotal,
                      6
                    )
                },

                ingredientes_en_min:
                  elegida.limites.min,

                ingredientes_en_max:
                  elegida.limites.max,

                tiempo_preseleccion_ms:
                  redondear(
                    evaluados.meta
                      .tiempoPreseleccionMs,
                    4
                  ),

                tiempo_optimizacion_ms:
                  redondear(
                    evaluados.meta
                      .tiempoOptimizacionMs,
                    4
                  ),

                tiempo_optimizacion_candidato_seleccionado_ms:
                  redondear(
                    elegida
                      .tiempoOptimizacionMs,
                    4
                  )
              }
            }
          : {}
      )
    }
  };
}

// ---------------------------------------------------------------------------
// TOTALES / TOLERANCIA DIARIA
// ---------------------------------------------------------------------------

function totalesDelDia(
  comidas
) {
  return comidas.reduce(
    (
      acc,
      c
    ) =>
      sumar(
        acc,
        c.totales
      ),

    totalesVacios()
  );
}

function dentroDeTolerancia(
  totales,
  objetivo
) {
  const diffKcal =
    Math.abs(
      totales.kcal -
      objetivo.kcal
    );

  const diffP =
    Math.abs(
      totales.protein -
      objetivo.proteina
    );

  const diffC =
    Math.abs(
      totales.carbs -
      objetivo.carbos
    );

  const diffG =
    Math.abs(
      totales.fat -
      objetivo.grasa
    );

  const toleranciaKcal =
    Math.max(
      80,
      objetivo.kcal *
      0.05
    );

  return (
    diffKcal <=
      toleranciaKcal &&

    diffP <= 15 &&

    diffC <= 15 &&

    diffG <= 5
  );
}

function reescalarComida(
  comidaOk,
  nuevoSubObjetivo,
  carrito,
  excluidos,
  pc,
  configuracionExperimental = {}
) {
  const platillo =
    TODOS_LOS_PLATILLOS.find(
      d =>
        d.dish_id ===
        comidaOk.dish_id
    );

  if (!platillo) {
    return comidaOk;
  }

  try {
    const adaptado =
      adaptarPlatillo(
        platillo,
        excluidos,
        carrito,
        pc.key,
        getFoodById
      );

    if (
      !adaptado ||
      adaptado.ingredients.length ===
      0
    ) {
      return comidaOk;
    }

    const medirTiempo =
      comidaOk.telemetria_preseleccion !==
      undefined;

    const inicioOptimizacion =
      medirTiempo
        ? ahoraMs()
        : 0;

    const optimizado =
      optimizarPlatilloMultivariable(
        adaptado.ingredients,
        nuevoSubObjetivo
      );

    const tiempoReoptimizacionMs =
      medirTiempo
        ? ahoraMs() -
          inicioOptimizacion
        : 0;

    if (
      configuracionExperimental.acumulador
    ) {
      configuracionExperimental
        .acumulador
        .reoptimizaciones_correccion++;

      configuracionExperimental
        .acumulador
        .tiempo_optimizacion_ms +=
        tiempoReoptimizacionMs;
    }

    return {
      ...comidaOk,

      items:
        optimizado.items,

      totales:
        optimizado.totales,

      ajuste:
        optimizado.ajuste,

      subObjetivo:
        nuevoSubObjetivo
    };
  }

  catch (_) {
    return comidaOk;
  }
}

function costoDelDia(
  comidas,
  objetivo
) {
  return costoNutricional(
    totalesDelDia(
      comidas
    ),
    objetivo
  );
}

// ---------------------------------------------------------------------------
// CORRECCIÓN DIARIA
// ---------------------------------------------------------------------------

function validarYCorregirDia(
  comidasIniciales,
  objetivo,
  carrito,
  excluidos,
  comidasDelDia,
  contexto
) {
  let comidas =
    comidasIniciales;

  let iteraciones =
    0;

  const MAX_ITER =
    9;

  while (
    iteraciones <
    MAX_ITER
  ) {
    const totales =
      totalesDelDia(
        comidas
      );

    if (
      dentroDeTolerancia(
        totales,
        objetivo
      )
    ) {
      return {
        comidas,
        totales,
        factible:
          true,
        iteraciones
      };
    }

    const diffTotal =
      restar(
        {
          kcal:
            objetivo.kcal,

          protein:
            objetivo.proteina,

          carbs:
            objetivo.carbos,

          fat:
            objetivo.grasa
        },

        totales
      );

    const wk =
      pesosNormalizados(
        comidasDelDia,
        'peso'
      );

    const wp =
      pesosNormalizados(
        comidasDelDia,
        'pesoProteina'
      );

    const wc =
      pesosNormalizados(
        comidasDelDia,
        'pesoCarbos'
      );

    const wf =
      pesosNormalizados(
        comidasDelDia,
        'pesoGrasa'
      );

    const comidasReescaladas =
      comidas.map(
        (
          c,
          i
        ) => {
          const pc =
            comidasDelDia[i];

          const nuevoSubObjetivo = {
            kcal:
              Math.max(
                0,
                c.subObjetivo.kcal +
                diffTotal.kcal *
                wk[i]
              ),

            protein:
              Math.max(
                0,
                c.subObjetivo.protein +
                diffTotal.protein *
                wp[i]
              ),

            carbs:
              Math.max(
                0,
                c.subObjetivo.carbs +
                diffTotal.carbs *
                wc[i]
              ),

            fat:
              Math.max(
                0,
                c.subObjetivo.fat +
                diffTotal.fat *
                wf[i]
              )
          };

          return reescalarComida(
            c,
            nuevoSubObjetivo,
            carrito,
            excluidos,
            pc,
            contexto
              .configuracionExperimental
          );
        }
      );

    const costoAntes =
      costoDelDia(
        comidas,
        objetivo
      );

    const costoReescalado =
      costoDelDia(
        comidasReescaladas,
        objetivo
      );

    if (
      costoReescalado +
      1e-6 <
      costoAntes
    ) {
      comidas =
        comidasReescaladas;

      iteraciones++;

      continue;
    }

    let peorIdx =
      -1;

    let peorCosto =
      -1;

    comidas.forEach(
      (
        c,
        i
      ) => {
        const costo =
          costoNutricional(
            c.totales,
            c.subObjetivo
          );

        if (
          costo >
          peorCosto
        ) {
          peorCosto =
            costo;

          peorIdx =
            i;
        }
      }
    );

    const pc =
      comidasDelDia[
        peorIdx
      ];

    const baseExcluidos =
      new Set(
        comidas.map(
          c =>
            c.dish_id
        )
      );

    let mejoraEncontrada =
      null;

    const probados =
      new Set();

    for (
      let intento = 0;
      intento < 3 &&
      !mejoraEncontrada;
      intento++
    ) {
      const excluir =
        new Set([
          ...baseExcluidos,
          ...probados
        ]);

      const resultado =
        generarComida(
          pc,

          comidas[
            peorIdx
          ].subObjetivo,

          carrito,
          excluidos,

          contexto
            .usoRecientePlatillos,

          contexto
            .usoRecienteAncla,

          contexto
            .diaActual,

          contexto
            .diasSinRepetir,

          excluir,

          contexto
            .platillosSemanaAnterior,

          contexto
            .configuracionExperimental
        );

      if (
        !resultado.ok
      ) {
        break;
      }

      probados.add(
        resultado
          .comida
          .dish_id
      );

      const propuesta =
        comidas.map(
          (
            c,
            i
          ) =>
            i === peorIdx
              ? resultado.comida
              : c
        );

      if (
        costoDelDia(
          propuesta,
          objetivo
        ) +
        1e-6 <
        costoAntes
      ) {
        mejoraEncontrada =
          propuesta;
      }
    }

    if (
      !mejoraEncontrada
    ) {
      return {
        comidas,

        totales:
          totalesDelDia(
            comidas
          ),

        factible:
          false,

        iteraciones,

        explicacion:
          explicarNoFactible(
            comidas,
            objetivo,

            `No se encontró otro platillo que mejorara el balance global de "${pc.nombre}".`
          )
      };
    }

    comidas =
      mejoraEncontrada;

    iteraciones++;
  }

  const totalesFinales =
    totalesDelDia(
      comidas
    );

  return {
    comidas,

    totales:
      totalesFinales,

    factible:
      dentroDeTolerancia(
        totalesFinales,
        objetivo
      ),

    iteraciones,

    explicacion:
      explicarNoFactible(
        comidas,
        objetivo,

        'Se alcanzó el límite de iteraciones de corrección.'
      )
  };
}

function explicarNoFactible(
  comidas,
  objetivo,
  causaInmediata
) {
  const totales =
    totalesDelDia(
      comidas
    );

  const diffKcal =
    Math.round(
      totales.kcal -
      objetivo.kcal
    );

  const kcalDerivadas =
    objetivo.proteina * 4 +
    objetivo.carbos * 4 +
    objetivo.grasa * 9;

  const partes = [
    causaInmediata
  ];

  if (
    Math.abs(
      kcalDerivadas -
      objetivo.kcal
    ) >
    50
  ) {
    partes.push(
      `Ojo: el objetivo tiene un desfase interno — ` +
      `P×4+C×4+G×9 = ${Math.round(kcalDerivadas)} kcal, ` +
      `pero el campo de kcal pide ${objetivo.kcal}. ` +
      `Revisa que los macros y las kcal del objetivo sean consistentes.`
    );
  }

  partes.push(
    `El mejor menú encontrado quedó a ` +
    `${diffKcal >= 0 ? '+' : ''}` +
    `${diffKcal} kcal del objetivo.`
  );

  return partes.join(
    ' '
  );
}

// ---------------------------------------------------------------------------
// GENERAR UN DÍA
// ---------------------------------------------------------------------------

function generarMenu(params) {
  const {
    objetivo,
    alimentosSeleccionados,
    usarSoloCarrito = true,
    alimentosExcluidos = [],
    numeroComidas = 5,
    comidasPersonalizadas,
    usoRecientePlatillos = {},
    usoRecienteAncla = {},
    diaActual = 0,
    diasSinRepetir = 2,
    platillosSemanaAnterior = {},

    preselectionMode =
      DEFAULT_PRESELECTION_MODE,

    preselectionTopN =
      TOP_N_PRESELECCION,

    preselectionKcalTopN =
      DEFAULT_PRESELECTION_KCAL_TOP_N,

    telemetria = false,

    __rng,

    __telemetriaAcumulada
  } =
    params;

  const rng =
    typeof __rng ===
    'function'
      ? __rng
      : Math.random;

  const configuracionExperimental = {
    preselectionMode,
    preselectionTopN,
    preselectionKcalTopN,

    telemetria:
      telemetria === true,

    rng,

    acumulador:
      __telemetriaAcumulada
  };

  const carrito =
    (
      usarSoloCarrito &&
      alimentosSeleccionados
    )
      ? TODOS_LOS_ALIMENTOS.filter(
          f =>
            alimentosSeleccionados.includes(
              f.id
            ) &&
            !alimentosExcluidos.includes(
              f.id
            )
        )
      : TODOS_LOS_ALIMENTOS.filter(
          f =>
            !alimentosExcluidos.includes(
              f.id
            )
        );

  if (
    carrito.length ===
    0
  ) {
    return {
      error:
        'El carrito no tiene alimentos válidos.'
    };
  }

  const comidasDelDia =
    obtenerPlantillaComidas(
      numeroComidas,
      comidasPersonalizadas
    );

  const subObjetivosPorComida =
    repartirObjetivoPorComida(
      objetivo,
      comidasDelDia
    );

  const comidas = [];

  const dishIdsUsadosHoy =
    new Set();

  for (
    const {
      slot,
      subObjetivo
    } of
    subObjetivosPorComida
  ) {
    const resultado =
      generarComida(
        slot,
        subObjetivo,
        carrito,
        alimentosExcluidos,
        usoRecientePlatillos,
        usoRecienteAncla,
        diaActual,
        diasSinRepetir,
        dishIdsUsadosHoy,
        platillosSemanaAnterior,
        configuracionExperimental
      );

    if (
      !resultado.ok
    ) {
      return {
        error:
          resultado.motivo,

        food_db_version:
          FOOD_DB_VERSION,

        menu_engine_version:
          MENU_ENGINE_VERSION,

        factible:
          false,

        objetivo
      };
    }

    comidas.push(
      resultado.comida
    );

    dishIdsUsadosHoy.add(
      resultado
        .comida
        .dish_id
    );
  }

  const correccion =
    validarYCorregirDia(
      comidas,
      objetivo,
      carrito,
      alimentosExcluidos,
      comidasDelDia,
      {
        usoRecientePlatillos,
        usoRecienteAncla,
        diaActual,
        diasSinRepetir,
        platillosSemanaAnterior,
        configuracionExperimental
      }
    );

  const comidasFinales =
    correccion.comidas;

  const totales =
    correccion.totales;

  const factible =
    correccion.factible;

  comidasFinales.forEach(
    c => {
      usoRecientePlatillos[
        c.dish_id
      ] =
        diaActual;

      const platillo =
        TODOS_LOS_PLATILLOS.find(
          d =>
            d.dish_id ===
            c.dish_id
        );

      const ancla =
        platillo &&
        platillo.ingredients.find(
          i =>
            !i.sustituible
        );

      if (
        ancla
      ) {
        usoRecienteAncla[
          ancla.food_id
        ] =
          diaActual;
      }
    }
  );

  return {
    food_db_version:
      FOOD_DB_VERSION,

    menu_engine_version:
      MENU_ENGINE_VERSION,

    objetivo,

    factible,

    iteraciones_correccion:
      correccion.iteraciones,

    explicacion_no_factible:
      factible
        ? null
        : correccion.explicacion,

    comidas:
      comidasFinales.map(
        c => ({
          nombre:
            c.nombre,

          horario:
            c.horario,

          platillo:
            c.platillo,

          dish_id:
            c.dish_id,

          ajuste:
            c.ajuste,

          items:
            c.items.map(
              it => {
                const food =
                  getFoodById(
                    it.food_id
                  );

                const f =
                  formatearItem(
                    it
                  );

                return {
                  food_id:
                    it.food_id,

                  nombre:
                    food.name,

                  cantidad:
                    f.cantidad,

                  unidad:
                    f.unidad,

                  gramos_calculados:
                    it.cantidad,

                  grupo_smae:
                    it.grupo_smae,

                  rol:
                    it.role
                };
              }
            )
        })
      ),

    totales: {
      kcal:
        Math.round(
          totales.kcal
        ),

      proteina:
        Math.round(
          totales.protein
        ),

      carbos:
        Math.round(
          totales.carbs
        ),

      grasa:
        Math.round(
          totales.fat
        ),

      fibra:
        Math.round(
          (
            totales.fiber ||
            0
          ) *
          10
        ) /
        10
    },

    diferencia_vs_objetivo: {
      kcal:
        Math.round(
          totales.kcal -
          objetivo.kcal
        ),

      proteina:
        Math.round(
          totales.protein -
          objetivo.proteina
        ),

      carbos:
        Math.round(
          totales.carbs -
          objetivo.carbos
        ),

      grasa:
        Math.round(
          totales.fat -
          objetivo.grasa
        )
    }
  };
}

// ---------------------------------------------------------------------------
// SEMANA
// ---------------------------------------------------------------------------

const DEFAULT_NUM_CANDIDATOS_SEMANA =
  40;

const MAX_NUM_CANDIDATOS_SEMANA =
  120;

const TAMANIO_TOP_SEMANAS =
  6;

const LIMITE_DIARIO_SECUNDARIO_KCAL =
  200;

function totalesSemana(
  dias
) {
  return dias.reduce(
    (
      acc,
      d
    ) => ({
      kcal:
        acc.kcal +
        (
          d.totales
            ? d.totales.kcal
            : 0
        ),

      proteina:
        acc.proteina +
        (
          d.totales
            ? d.totales.proteina
            : 0
        ),

      carbos:
        acc.carbos +
        (
          d.totales
            ? d.totales.carbos
            : 0
        ),

      grasa:
        acc.grasa +
        (
          d.totales
            ? d.totales.grasa
            : 0
        )
    }),

    {
      kcal: 0,
      proteina: 0,
      carbos: 0,
      grasa: 0
    }
  );
}

function calcularDiferenciaContraObjetivo(
  totales,
  objetivo
) {
  return {
    kcal:
      Math.round(
        totales.kcal -
        objetivo.kcal
      ),

    proteina:
      Math.round(
        totales.proteina -
        objetivo.proteina
      ),

    carbos:
      Math.round(
        totales.carbos -
        objetivo.carbos
      ),

    grasa:
      Math.round(
        totales.grasa -
        objetivo.grasa
      )
  };
}

function generarSemanaCandidata(
  params,
  numDias
) {
  const {
    objetivo,
    alimentosSeleccionados,
    usarSoloCarrito = true,
    alimentosExcluidos = [],
    numeroComidas = 5,
    comidasPersonalizadas,
    diasSinRepetir = 2,
    platillosSemanaAnterior = {},

    preselectionMode =
      DEFAULT_PRESELECTION_MODE,

    preselectionTopN =
      TOP_N_PRESELECCION,

    preselectionKcalTopN =
      DEFAULT_PRESELECTION_KCAL_TOP_N,

    telemetria = false,

    __rng,

    __telemetriaAcumulada
  } =
    params;

  const objetivoUsuario = {
    kcal:
      objetivo.kcal,

    proteina:
      objetivo.proteina,

    carbos:
      objetivo.carbos,

    grasa:
      objetivo.grasa
  };

  const objetivoSemanal = {
    kcal:
      objetivoUsuario.kcal *
      numDias,

    proteina:
      objetivoUsuario.proteina *
      numDias,

    carbos:
      objetivoUsuario.carbos *
      numDias,

    grasa:
      objetivoUsuario.grasa *
      numDias
  };

  const acumulado = {
    kcal: 0,
    proteina: 0,
    carbos: 0,
    grasa: 0
  };

  const usoRecientePlatillos = {};
  const usoRecienteAncla = {};

  const dias = [];

  for (
    let d = 0;
    d < numDias;
    d++
  ) {
    const diasRestantes =
      numDias -
      d;

    const restanteAntesDelDia = {
      kcal:
        objetivoSemanal.kcal -
        acumulado.kcal,

      proteina:
        objetivoSemanal.proteina -
        acumulado.proteina,

      carbos:
        objetivoSemanal.carbos -
        acumulado.carbos,

      grasa:
        objetivoSemanal.grasa -
        acumulado.grasa
    };

    const objetivoOperativoDelDia = {
      kcal:
        Math.max(
          0,
          restanteAntesDelDia.kcal /
          diasRestantes
        ),

      proteina:
        Math.max(
          0,
          restanteAntesDelDia.proteina /
          diasRestantes
        ),

      carbos:
        Math.max(
          0,
          restanteAntesDelDia.carbos /
          diasRestantes
        ),

      grasa:
        Math.max(
          0,
          restanteAntesDelDia.grasa /
          diasRestantes
        )
    };

    const contadorNutricional = {
      objetivo_semanal: {
        ...objetivoSemanal
      },

      acumulado_antes_de_hoy: {
        ...acumulado
      },

      restante_antes_de_hoy: {
        ...restanteAntesDelDia
      },

      dias_restantes:
        diasRestantes,

      objetivo_del_dia:
        objetivoOperativoDelDia,

      objetivo_operativo_semanal:
        objetivoOperativoDelDia,

      objetivo_usuario:
        objetivoUsuario
    };

    const resultadoDia =
      generarMenu({
        objetivo:
          objetivoOperativoDelDia,

        alimentosSeleccionados,
        usarSoloCarrito,
        alimentosExcluidos,
        numeroComidas,
        comidasPersonalizadas,

        usoRecientePlatillos,
        usoRecienteAncla,

        diaActual:
          d,

        diasSinRepetir,

        platillosSemanaAnterior,

        preselectionMode,
        preselectionTopN,
        preselectionKcalTopN,

        telemetria,

        __rng,
        __telemetriaAcumulada
      });

    if (
      resultadoDia.error
    ) {
      dias.push({
        dia_semana:
          DIAS_SEMANA[d],

        objetivo:
          objetivoUsuario,

        objetivo_usuario:
          objetivoUsuario,

        objetivo_operativo_semanal:
          objetivoOperativoDelDia,

        objetivo_diario_ajustado:
          objetivoOperativoDelDia,

        contador_nutricional:
          contadorNutricional,

        ...resultadoDia
      });

      break;
    }

    const totalesDia = {
      kcal:
        resultadoDia.totales.kcal,

      proteina:
        resultadoDia.totales.proteina,

      carbos:
        resultadoDia.totales.carbos,

      grasa:
        resultadoDia.totales.grasa
    };

    const factibleOperativo =
      resultadoDia.factible;

    const diferenciaOperativa =
      resultadoDia
        .diferencia_vs_objetivo;

    const factibleUsuario =
      dentroDeTolerancia(
        {
          kcal:
            totalesDia.kcal,

          protein:
            totalesDia.proteina,

          carbs:
            totalesDia.carbos,

          fat:
            totalesDia.grasa
        },

        objetivoUsuario
      );

    const diferenciaUsuario =
      calcularDiferenciaContraObjetivo(
        totalesDia,
        objetivoUsuario
      );

    dias.push({
      dia_semana:
        DIAS_SEMANA[d],

      objetivo:
        objetivoUsuario,

      objetivo_usuario:
        objetivoUsuario,

      objetivo_operativo_semanal:
        objetivoOperativoDelDia,

      objetivo_diario_ajustado:
        objetivoOperativoDelDia,

      contador_nutricional:
        contadorNutricional,

      ...resultadoDia,

      objetivo:
        objetivoUsuario,

      factible:
        factibleUsuario,

      diferencia_vs_objetivo:
        diferenciaUsuario,

      factible_operativo:
        factibleOperativo,

      diferencia_vs_objetivo_operativo:
        diferenciaOperativa,

      explicacion_no_factible_operativa:
        resultadoDia
          .explicacion_no_factible
    });

    acumulado.kcal +=
      resultadoDia.totales.kcal;

    acumulado.proteina +=
      resultadoDia.totales.proteina;

    acumulado.carbos +=
      resultadoDia.totales.carbos;

    acumulado.grasa +=
      resultadoDia.totales.grasa;
  }

  return {
    dias,
    objetivoSemanal,
    objetivoUsuario,
    numDias
  };
}

// ---------------------------------------------------------------------------
// SCORE SEMANAL — LEGACY CONSERVADO
// ---------------------------------------------------------------------------

const TOLERANCIA_SEMANAL_PROTEINA_G =
  40;

const TOLERANCIA_SEMANAL_CARBOS_G =
  90;

const TOLERANCIA_SEMANAL_GRASA_G =
  25;

function excedente(
  diferencia,
  tolerancia
) {
  const abs =
    Math.abs(
      diferencia
    );

  return (
    abs >
    tolerancia
      ? abs -
        tolerancia
      : 0
  );
}

function scoreSemana(
  candidata,
  objetivoDiarioOriginal,
  alimentosExcluidos
) {
  if (
    candidata.dias.length <
    candidata.numDias
  ) {
    return Infinity;
  }

  if (
    candidata.dias.some(
      d =>
        d.error
    )
  ) {
    return Infinity;
  }

  const total =
    totalesSemana(
      candidata.dias
    );

  const obj =
    candidata.objetivoSemanal;

  const diffKcal =
    total.kcal -
    obj.kcal;

  let score =
    Math.abs(
      diffKcal
    ) *
    2 +
    (
      diffKcal *
      diffKcal
    ) /
    2500;

  candidata.dias.forEach(
    d => {
      const desviacion =
        Math.abs(
          d.totales.kcal -
          objetivoDiarioOriginal.kcal
        );

      if (
        desviacion >
        LIMITE_DIARIO_SECUNDARIO_KCAL
      ) {
        score +=
          (
            desviacion -
            LIMITE_DIARIO_SECUNDARIO_KCAL
          ) *
          0.6;
      }
    }
  );

  score +=
    excedente(
      total.proteina -
      obj.proteina,

      TOLERANCIA_SEMANAL_PROTEINA_G
    ) *
    0.8;

  score +=
    excedente(
      total.carbos -
      obj.carbos,

      TOLERANCIA_SEMANAL_CARBOS_G
    ) *
    0.6;

  score +=
    excedente(
      total.grasa -
      obj.grasa,

      TOLERANCIA_SEMANAL_GRASA_G
    ) *
    1.5;

  if (
    alimentosExcluidos &&
    alimentosExcluidos.length >
    0
  ) {
    candidata.dias.forEach(
      d => {
        d.comidas.forEach(
          c => {
            c.items.forEach(
              it => {
                if (
                  alimentosExcluidos.includes(
                    it.food_id
                  )
                ) {
                  score +=
                    25;
                }
              }
            );
          }
        );
      }
    );
  }

  const usosPorPlatillo = {};

  candidata.dias.forEach(
    d => {
      d.comidas.forEach(
        c => {
          usosPorPlatillo[
            c.dish_id
          ] =
            (
              usosPorPlatillo[
                c.dish_id
              ] ||
              0
            ) +
            1;
        }
      );
    }
  );

  Object.values(
    usosPorPlatillo
  ).forEach(
    n => {
      if (
        n >
        2
      ) {
        score +=
          (
            n -
            2
          ) *
          4;
      }
    }
  );

  return score;
}

// ---------------------------------------------------------------------------
// GENERAR SEMANA
// ---------------------------------------------------------------------------

function generarMenuSemanal(
  params
) {
  const {
    diasSinRepetir = 2,
    numDias = 7,

    numeroCandidatos =
      DEFAULT_NUM_CANDIDATOS_SEMANA,

    ...resto
  } =
    params;

  const intentos =
    Math.min(
      Math.max(
        1,
        numeroCandidatos
      ),

      MAX_NUM_CANDIDATOS_SEMANA
    );

  const candidatos = [];

  for (
    let i = 0;
    i < intentos;
    i++
  ) {
    const candidata =
      generarSemanaCandidata(
        {
          ...resto,
          diasSinRepetir
        },

        numDias
      );

    if (
      candidata.error
    ) {
      return candidata;
    }

    const score =
      scoreSemana(
        candidata,
        resto.objetivo,
        resto.alimentosExcluidos ||
        []
      );

    candidatos.push({
      candidata,
      score,

      indiceGeneracion:
        i
    });
  }

  candidatos.sort(
    (
      a,
      b
    ) =>
      a.score -
      b.score
  );

  const validos =
    candidatos.filter(
      c =>
        c.score <
        Infinity
    );

  const pool =
    (
      validos.length >
      0
        ? validos
        : candidatos
    ).slice(
      0,
      TAMANIO_TOP_SEMANAS
    );

  if (
    pool.length ===
    0
  ) {
    return {
      error:
        'No se generaron semanas candidatas válidas.'
    };
  }

  const pesos =
    pool.map(
      (
        _,
        i
      ) =>
        1 /
        (i + 1)
    );

  const pesoTotal =
    pesos.reduce(
      (
        a,
        b
      ) =>
        a + b,
      0
    );

  let r =
    (
      typeof resto.__rng ===
      'function'
        ? resto.__rng()
        : Math.random()
    ) *
    pesoTotal;

  let elegida =
    pool[
      pool.length - 1
    ].candidata;

  for (
    let i = 0;
    i < pool.length;
    i++
  ) {
    r -=
      pesos[i];

    if (
      r <=
      0
    ) {
      elegida =
        pool[i]
          .candidata;

      break;
    }
  }

  const dias =
    elegida.dias;

  const diasNoFactibles =
    dias.filter(
      d =>
        d.factible ===
        false
    ).length;

  const diasNoFactiblesOperativos =
    dias.filter(
      d =>
        d.factible_operativo ===
        false
    ).length;

  const total =
    totalesSemana(
      dias
    );

  return {
    food_db_version:
      FOOD_DB_VERSION,

    menu_engine_version:
      MENU_ENGINE_VERSION,

    diasSinRepetir,

    dias_no_factibles:
      diasNoFactibles,

    dias_no_factibles_operativos:
      diasNoFactiblesOperativos,

    dias,

    objetivo_diario_usuario: {
      kcal:
        Math.round(
          resto.objetivo.kcal
        ),

      proteina:
        Math.round(
          resto.objetivo.proteina
        ),

      carbos:
        Math.round(
          resto.objetivo.carbos
        ),

      grasa:
        Math.round(
          resto.objetivo.grasa
        )
    },

    objetivo_semanal: {
      kcal:
        Math.round(
          elegida
            .objetivoSemanal
            .kcal
        ),

      proteina:
        Math.round(
          elegida
            .objetivoSemanal
            .proteina
        ),

      carbos:
        Math.round(
          elegida
            .objetivoSemanal
            .carbos
        ),

      grasa:
        Math.round(
          elegida
            .objetivoSemanal
            .grasa
        )
    },

    resultado_semanal: {
      kcal:
        Math.round(
          total.kcal
        ),

      proteina:
        Math.round(
          total.proteina
        ),

      carbos:
        Math.round(
          total.carbos
        ),

      grasa:
        Math.round(
          total.grasa
        )
    },

    diferencia_semanal: {
      kcal:
        Math.round(
          total.kcal -
          elegida
            .objetivoSemanal
            .kcal
        ),

      proteina:
        Math.round(
          total.proteina -
          elegida
            .objetivoSemanal
            .proteina
        ),

      carbos:
        Math.round(
          total.carbos -
          elegida
            .objetivoSemanal
            .carbos
        ),

      grasa:
        Math.round(
          total.grasa -
          elegida
            .objetivoSemanal
            .grasa
        )
    },

    candidatos_evaluados:
      candidatos.length,

    candidatos_validos:
      validos.length
  };
}

// ---------------------------------------------------------------------------
// PLAN DE 2 SEMANAS
// ---------------------------------------------------------------------------

function contarPlatillosUsados(
  dias
) {
  const conteo = {};

  (
    dias ||
    []
  ).forEach(
    d => {
      (
        d.comidas ||
        []
      ).forEach(
        c => {
          conteo[
            c.dish_id
          ] =
            (
              conteo[
                c.dish_id
              ] ||
              0
            ) +
            1;
        }
      );
    }
  );

  return conteo;
}

function resumenSemana(
  semana,
  numeroSemana
) {
  const numDias =
    semana.dias.length ||
    1;

  return {
    semana:
      numeroSemana,

    total_kcal:
      semana
        .resultado_semanal
        .kcal,

    promedio_kcal_dia:
      Math.round(
        (
          semana
            .resultado_semanal
            .kcal /
          numDias
        ) *
        10
      ) /
      10,

    proteina_total:
      semana
        .resultado_semanal
        .proteina,

    carbos_total:
      semana
        .resultado_semanal
        .carbos,

    grasa_total:
      semana
        .resultado_semanal
        .grasa,

    diferencia_vs_objetivo_semanal:
      semana
        .diferencia_semanal,

    dias_no_factibles:
      semana
        .dias_no_factibles,

    dias_no_factibles_operativos:
      semana
        .dias_no_factibles_operativos
  };
}

function generarPlanDosSemanas(
  params
) {
  const numDias =
    params.numDias ||
    7;

  const semana1 =
    generarMenuSemanal({
      ...params,
      numDias
    });

  if (
    semana1.error
  ) {
    return {
      error:
        semana1.error,

      semana:
        1,

      detalle:
        semana1
    };
  }

  const platillosUsadosSemana1 =
    contarPlatillosUsados(
      semana1.dias
    );

  const semana2 =
    generarMenuSemanal({
      ...params,

      numDias,

      platillosSemanaAnterior:
        platillosUsadosSemana1
    });

  if (
    semana2.error
  ) {
    return {
      error:
        semana2.error,

      semana:
        2,

      detalle:
        semana2
    };
  }

  const platillosUsadosSemana2 =
    contarPlatillosUsados(
      semana2.dias
    );

  const idsSemana1 =
    new Set(
      Object.keys(
        platillosUsadosSemana1
      )
    );

  const idsSemana2 =
    new Set(
      Object.keys(
        platillosUsadosSemana2
      )
    );

  const platillosRepetidosEnAmbas =
    [
      ...idsSemana1
    ].filter(
      id =>
        idsSemana2.has(
          id
        )
    );

  const numDiasTotal =
    numDias *
    2;

  const total14 = {
    kcal:
      semana1
        .resultado_semanal
        .kcal +
      semana2
        .resultado_semanal
        .kcal,

    proteina:
      semana1
        .resultado_semanal
        .proteina +
      semana2
        .resultado_semanal
        .proteina,

    carbos:
      semana1
        .resultado_semanal
        .carbos +
      semana2
        .resultado_semanal
        .carbos,

    grasa:
      semana1
        .resultado_semanal
        .grasa +
      semana2
        .resultado_semanal
        .grasa
  };

  return {
    food_db_version:
      FOOD_DB_VERSION,

    menu_engine_version:
      MENU_ENGINE_VERSION,

    objetivo_nutricional_usado:
      params.objetivo,

    semana_1:
      semana1,

    semana_2:
      semana2,

    resumen_global: {
      semana_1:
        resumenSemana(
          semana1,
          1
        ),

      semana_2:
        resumenSemana(
          semana2,
          2
        ),

      total_14_dias: {
        kcal:
          Math.round(
            total14.kcal
          ),

        promedio_kcal_dia:
          Math.round(
            (
              total14.kcal /
              numDiasTotal
            ) *
            10
          ) /
          10,

        proteina:
          Math.round(
            total14.proteina
          ),

        carbos:
          Math.round(
            total14.carbos
          ),

        grasa:
          Math.round(
            total14.grasa
          )
      },

      nota:
        'El total de 14 días es solo informativo. ' +
        'Cada semana se generó y validó de forma independiente: ' +
        'una semana no compensa a la otra.'
    },

    variedad_entre_semanas: {
      platillos_distintos_semana_1:
        idsSemana1.size,

      platillos_distintos_semana_2:
        idsSemana2.size,

      platillos_repetidos_en_ambas_semanas:
        platillosRepetidosEnAmbas.length,

      detalle_repetidos:
        platillosRepetidosEnAmbas
    }
  };
}

// ---------------------------------------------------------------------------
// INFORMACIÓN DEL MOTOR
// ---------------------------------------------------------------------------

function obtenerResumenMotor() {
  return {
    food_db_version:
      FOOD_DB_VERSION,

    menu_engine_version:
      MENU_ENGINE_VERSION,

    alimentos:
      TODOS_LOS_ALIMENTOS.length,

    platillos:
      TODOS_LOS_PLATILLOS.length,

    roles_estructurales:
      Array.from(
        ROLES_ESTRUCTURALES
      ),

    configuracion: {
      preselection_mode_default:
        DEFAULT_PRESELECTION_MODE,

      preselection_top_n_default:
        TOP_N_PRESELECCION,

      preselection_kcal_top_n_default:
        DEFAULT_PRESELECTION_KCAL_TOP_N,

      preselection_modes:
        Array.from(
          MODOS_PRESELECCION
        ),

      top_n_candidatos_por_slot:
        TOP_N_CANDIDATOS_POR_SLOT,

      candidatos_semana_default:
        DEFAULT_NUM_CANDIDATOS_SEMANA,

      candidatos_semana_max:
        MAX_NUM_CANDIDATOS_SEMANA,

      top_semanas:
        TAMANIO_TOP_SEMANAS,

      tolerancia_semanal_proteina_g:
        TOLERANCIA_SEMANAL_PROTEINA_G,

      tolerancia_semanal_carbos_g:
        TOLERANCIA_SEMANAL_CARBOS_G,

      tolerancia_semanal_grasa_g:
        TOLERANCIA_SEMANAL_GRASA_G
    }
  };
}

// ---------------------------------------------------------------------------
// VALIDAR INPUT
// ---------------------------------------------------------------------------

function validarObjetivo(
  objetivo
) {
  if (
    !objetivo ||
    typeof objetivo !==
    'object'
  ) {
    return {
      ok:
        false,

      error:
        'Falta el objetivo nutricional.'
    };
  }

  const campos = [
    'kcal',
    'proteina',
    'carbos',
    'grasa'
  ];

  for (
    const campo of
    campos
  ) {
    const valor =
      Number(
        objetivo[campo]
      );

    if (
      !Number.isFinite(
        valor
      ) ||
      valor <=
      0
    ) {
      return {
        ok:
          false,

        error:
          `El objetivo "${campo}" debe ser un número mayor que 0.`
      };
    }
  }

  return {
    ok:
      true,

    objetivo: {
      kcal:
        Number(
          objetivo.kcal
        ),

      proteina:
        Number(
          objetivo.proteina
        ),

      carbos:
        Number(
          objetivo.carbos
        ),

      grasa:
        Number(
          objetivo.grasa
        )
    }
  };
}

function normalizarParametros(
  params = {}
) {
  const validacion =
    validarObjetivo(
      params.objetivo
    );

  if (
    !validacion.ok
  ) {
    return validacion;
  }

  const numeroComidas =
    clamp(
      Math.round(
        Number(
          params.numeroComidas ||
          5
        )
      ),
      2,
      5
    );

  const diasSinRepetir =
    clamp(
      Math.round(
        Number(
          params.diasSinRepetir ??
          2
        )
      ),
      0,
      7
    );

  const alimentosSeleccionados =
    Array.isArray(
      params.alimentosSeleccionados
    )
      ? [
          ...new Set(
            params.alimentosSeleccionados
          )
        ]
      : [];

  const alimentosExcluidos =
    Array.isArray(
      params.alimentosExcluidos
    )
      ? [
          ...new Set(
            params.alimentosExcluidos
          )
        ]
      : [];

  const excluidosSet =
    new Set(
      alimentosExcluidos
    );

  const seleccionadosLimpios =
    alimentosSeleccionados.filter(
      id =>
        !excluidosSet.has(
          id
        )
    );

  const modoSolicitado =
    String(
      params.preselectionMode ??
      DEFAULT_PRESELECTION_MODE
    ).toLowerCase();

  const preselectionMode =
    MODOS_PRESELECCION.has(
      modoSolicitado
    )
      ? modoSolicitado
      : DEFAULT_PRESELECTION_MODE;

  const preselectionTopN =
    clamp(
      Math.round(
        Number(
          params.preselectionTopN ??
          TOP_N_PRESELECCION
        )
      ) ||
      TOP_N_PRESELECCION,
      1,
      64
    );

  const preselectionKcalTopN =
    clamp(
      Math.round(
        Number(
          params.preselectionKcalTopN ??
          DEFAULT_PRESELECTION_KCAL_TOP_N
        )
      ) ||
      DEFAULT_PRESELECTION_KCAL_TOP_N,
      1,
      64
    );

  return {
    ok:
      true,

    params: {
      ...params,

      objetivo:
        validacion.objetivo,

      numeroComidas,

      diasSinRepetir,

      alimentosSeleccionados:
        seleccionadosLimpios,

      alimentosExcluidos,

      usarSoloCarrito:
        params.usarSoloCarrito !==
        false,

      preselectionMode,
      preselectionTopN,
      preselectionKcalTopN,

      telemetria:
        params.telemetria ===
        true
    }
  };
}

// ---------------------------------------------------------------------------
// API SEGURA
// ---------------------------------------------------------------------------

function generarMenuSeguro(
  params
) {
  const normalizado =
    normalizarParametros(
      params
    );

  if (
    !normalizado.ok
  ) {
    return {
      error:
        normalizado.error,

      factible:
        false,

      food_db_version:
        FOOD_DB_VERSION,

      menu_engine_version:
        MENU_ENGINE_VERSION
    };
  }

  try {
    return generarMenu(
      prepararParametrosEjecucion(
        normalizado.params
      )
    );
  }

  catch (error) {
    return {
      error:
        error?.message ||
        String(error),

      factible:
        false,

      food_db_version:
        FOOD_DB_VERSION,

      menu_engine_version:
        MENU_ENGINE_VERSION
    };
  }
}

function generarMenuSemanalSeguro(
  params
) {
  const normalizado =
    normalizarParametros(
      params
    );

  if (
    !normalizado.ok
  ) {
    return {
      error:
        normalizado.error,

      factible:
        false,

      food_db_version:
        FOOD_DB_VERSION,

      menu_engine_version:
        MENU_ENGINE_VERSION
    };
  }

  try {
    return generarMenuSemanal(
      prepararParametrosEjecucion(
        normalizado.params
      )
    );
  }

  catch (error) {
    return {
      error:
        error?.message ||
        String(error),

      factible:
        false,

      food_db_version:
        FOOD_DB_VERSION,

      menu_engine_version:
        MENU_ENGINE_VERSION
    };
  }
}

function generarPlanDosSemanasSeguro(
  params
) {
  const normalizado =
    normalizarParametros(
      params
    );

  if (
    !normalizado.ok
  ) {
    return {
      error:
        normalizado.error,

      factible:
        false,

      food_db_version:
        FOOD_DB_VERSION,

      menu_engine_version:
        MENU_ENGINE_VERSION
    };
  }

  try {
    return generarPlanDosSemanas(
      prepararParametrosEjecucion(
        normalizado.params
      )
    );
  }

  catch (error) {
    return {
      error:
        error?.message ||
        String(error),

      factible:
        false,

      food_db_version:
        FOOD_DB_VERSION,

      menu_engine_version:
        MENU_ENGINE_VERSION
    };
  }
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

module.exports = {
  generarMenu:
    generarMenuSeguro,

  generarMenuSemanal:
    generarMenuSemanalSeguro,

  generarPlanDosSemanas:
    generarPlanDosSemanasSeguro,

  TODOS_LOS_ALIMENTOS,
  TODOS_LOS_PLATILLOS,

  getFoodById,

  obtenerResumenMotor,

  cantidadEnGramos,
  totalesSemana,
  contarPlatillosUsados,
  dentroDeTolerancia,

  diagnosticoExperimental: {
    crearGeneradorAleatorio,
    estimarRangoNutricionalPlatillo,
    distanciaKcalConHeadroom,
    costoProxyMultivariable,
    preseleccionarCandidatos,
    optimizarPlatilloMultivariable,
    costoNutricional,
    repartirObjetivoPorComida,
    PLANTILLAS_COMIDAS,
    PLATILLOS_SUSPENDIDOS,
    TOP_N_PRESELECCION,
    DEFAULT_PRESELECTION_MODE,
    DEFAULT_PRESELECTION_KCAL_TOP_N
  },

  FOOD_DB_VERSION,
  MENU_ENGINE_VERSION
};