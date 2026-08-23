// dashboard.js
// ---------------------------------------------------------------------------
// CAPA POSTERIOR PARA EL DASHBOARD
// ---------------------------------------------------------------------------
//
// Este archivo NO participa en la optimización nutricional. Solo LEE el
// resultado ya calculado por engine.js (kcal/macros ya derivados de
// cantidades reales de foods.json) y lo transforma en:
//
//   1. cost_tier por platillo (a partir de cost_tier por ingrediente).
//   2. Cards de dashboard con macros propios de cada comida.
//   3. Listas de compras consolidadas (semana 1 / semana 2 / 14 días).
//   4. Warnings de impacto cuando el usuario excluye alimentos.
//
// Nada aquí reescribe kcal/proteína/carbos/grasa: siempre se recalculan a
// partir de `item.gramos_calculados` (o `item.cantidad`) + foods.json.

const RANGO_COST_TIER = ['accesible', 'moderado', 'premium'];

function valorCostTier(tier) {
  const idx = RANGO_COST_TIER.indexOf(tier);
  return idx === -1 ? 2 : idx + 1;
}

function etiquetaCostTier(valor) {
  const idx = Math.min(
    RANGO_COST_TIER.length,
    Math.max(1, Math.round(valor))
  ) - 1;

  return RANGO_COST_TIER[idx];
}

function calcularCostTierPlatillo(items, getFoodById) {
  let sumaPonderada = 0;
  let pesoTotal = 0;

  items.forEach(it => {
    const food = getFoodById(it.food_id);

    if (!food) {
      return;
    }

    const gramos =
      it.gramos_calculados ??
      it.cantidad ??
      0;

    const factor =
      gramos /
      (food.base_g || 100);

    const kcalAporte =
      (food.kcal || 0) *
      factor;

    const peso =
      Math.max(
        kcalAporte,
        1
      );

    sumaPonderada +=
      valorCostTier(
        food.cost_tier
      ) * peso;

    pesoTotal += peso;
  });

  if (pesoTotal === 0) {
    return 'moderado';
  }

  return etiquetaCostTier(
    sumaPonderada /
    pesoTotal
  );
}

function calcularMacrosCard(
  items,
  getFoodById
) {
  let kcal = 0;
  let p = 0;
  let c = 0;
  let g = 0;

  items.forEach(it => {
    const food =
      getFoodById(
        it.food_id
      );

    if (!food) {
      return;
    }

    const gramos =
      it.gramos_calculados ??
      it.cantidad ??
      0;

    const factor =
      gramos /
      (food.base_g || 100);

    kcal +=
      (food.kcal || 0) *
      factor;

    p +=
      (food.protein || 0) *
      factor;

    c +=
      (food.carbs || 0) *
      factor;

    g +=
      (food.fat || 0) *
      factor;
  });

  return {
    kcal:
      Math.round(kcal),

    p:
      Math.round(p),

    c:
      Math.round(c),

    g:
      Math.round(g)
  };
}

function construirCardDashboard(
  comida,
  getFoodById
) {
  const macros =
    calcularMacrosCard(
      comida.items,
      getFoodById
    );

  const costTier =
    calcularCostTierPlatillo(
      comida.items,
      getFoodById
    );

  return {
    id:
      comida.dish_id,

    nombre:
      comida.platillo,

    tiempo_comida:
      comida.nombre,

    horario:
      comida.horario,

    // Usa la ruta guardada en dishes.json.
    // Si falta por cualquier motivo, intenta resolver por dish_id.
    imagen_url:
  comida.image ||
  `/${comida.dish_id}.jpg`,

    cost_tier:
      costTier,

    macros,

    ingredientes:
      comida.items.map(
        it => ({
          food_id:
            it.food_id,

          nombre:
            it.nombre,

          cantidad:
            it.cantidad,

          unidad:
            it.unidad,

          gramos_calculados:
            it.gramos_calculados,

          grupo:
            it.grupo_smae,

          cost_tier:
            (
              getFoodById(
                it.food_id
              ) || {}
            ).cost_tier ||
            'moderado'
        })
      ),

    preparacion:
      Array.isArray(
        comida.preparacion
      )
        ? comida.preparacion
        : (
            comida.preparacion
              ? [comida.preparacion]
              : []
          ),

    ajuste: {
      portion_scale:
        comida.ajuste
          ?.portion_scale ??
        null,

      structural_strain:
        comida.ajuste
          ?.structural_strain ??
        null,

      ingredientes_en_limite:
        comida.ajuste
          ?.ingredientes_en_limite ??
        null
    }
  };
}

function construirDashboardDia(
  resultadoDia,
  getFoodById,
  TODOS_LOS_PLATILLOS
) {
  const platillosPorId =
    new Map(
      TODOS_LOS_PLATILLOS.map(
        p => [
          p.dish_id,
          p
        ]
      )
    );

  const cards =
    resultadoDia.comidas.map(
      c => {
        const platilloOriginal =
          platillosPorId.get(
            c.dish_id
          );

        return construirCardDashboard(
          {
            ...c,

            // Recuperamos la preparación real desde dishes.json.
            preparacion:
              platilloOriginal
                ? platilloOriginal.preparation
                : null,

            // Recuperamos también la imagen real desde dishes.json.
            image:
              platilloOriginal
                ? platilloOriginal.image
                : null
          },

          getFoodById
        );
      }
    );

  return {
    comidas:
      cards,

    resumen_dia: {
      kcal:
        resultadoDia.totales.kcal,

      proteina:
        resultadoDia.totales.proteina,

      carbos:
        resultadoDia.totales.carbos,

      grasa:
        resultadoDia.totales.grasa,

      objetivo:
        resultadoDia.objetivo,

      diferencia_vs_objetivo:
        resultadoDia.diferencia_vs_objetivo,

      dentro_de_tolerancia:
        resultadoDia.factible
    }
  };
}

const GRUPO_A_CATEGORIA_UI = {
  proteina: 'proteinas',
  lacteo: 'lacteos',
  grasa: 'grasas',
  carbohidrato: 'cereales',
  cereal: 'cereales',
  leguminosa: 'leguminosas',
  fruta: 'frutas',
  verdura: 'verduras',
  condimento: 'otros',
  bebida: 'otros'
};

function displayMasa(gramos) {
  if (gramos >= 1000) {
    return `${(
      gramos /
      1000
    ).toFixed(2)} kg`;
  }

  return `${Math.round(
    gramos
  )} g`;
}

function displayVolumen(ml) {
  if (ml >= 1000) {
    return `${(
      ml /
      1000
    ).toFixed(2)} L`;
  }

  return `${Math.round(
    ml
  )} ml`;
}

function redondearUnidad(valor) {
  if (valor >= 10) {
    return Math.round(
      valor
    );
  }

  return (
    Math.round(
      valor * 4
    ) / 4
  );
}

function displayCompra(
  food,
  gramos
) {
  const tipo =
    food.unit_type ||
    'g';

  if (
    tipo === 'ml'
  ) {
    return {
      display:
        displayVolumen(
          gramos
        )
    };
  }

  if (
    tipo === 'g'
  ) {
    return {
      display:
        displayMasa(
          gramos
        )
    };
  }

  if (
    food.increment &&
    food.increment > 0
  ) {
    const unidades =
      redondearUnidad(
        gramos /
        food.increment
      );

    if (
      tipo === 'pieza'
    ) {
      const etiqueta =
        unidades === 1
          ? 'pieza'
          : 'piezas';

      return {
        display:
          displayMasa(
            gramos
          ),

        aprox_piezas:
          `aprox. ${unidades} ${etiqueta}`
      };
    }

    if (
      tipo === 'cdta' ||
      tipo === 'cda'
    ) {
      return {
        display:
          `${displayMasa(gramos)} · aprox. ${unidades} ${tipo}`,

        aprox_unidades:
          `aprox. ${unidades} ${tipo}`
      };
    }

    return {
      display:
        `${displayMasa(gramos)} · aprox. ${unidades} ${tipo}`,

      aprox_unidades:
        `aprox. ${unidades} ${tipo}`
    };
  }

  return {
    display:
      displayMasa(
        gramos
      )
  };
}

function construirListaCompras(
  dias,
  getFoodById
) {
  const acumuladoPorFood =
    new Map();

  (dias || []).forEach(
    dia => {
      (
        dia.comidas ||
        []
      ).forEach(
        comida => {
          (
            comida.items ||
            []
          ).forEach(
            item => {
              const gramos =
                item.gramos_calculados ??
                item.cantidad ??
                0;

              const prev =
                acumuladoPorFood.get(
                  item.food_id
                ) || 0;

              acumuladoPorFood.set(
                item.food_id,
                prev + gramos
              );
            }
          );
        }
      );
    }
  );

  const resultado = {
    proteinas: [],
    cereales: [],
    verduras: [],
    frutas: [],
    leguminosas: [],
    lacteos: [],
    grasas: [],
    otros: []
  };

  for (
    const [
      foodId,
      gramos
    ] of
    acumuladoPorFood.entries()
  ) {
    const food =
      getFoodById(
        foodId
      );

    if (!food) {
      continue;
    }

    const categoriaUI =
      GRUPO_A_CATEGORIA_UI[
        food.category
      ] ||
      'otros';

    const presentacion =
      displayCompra(
        food,
        gramos
      );

    const entrada = {
      food_id:
        foodId,

      nombre:
        food.name,

      gramos:
        Math.round(
          gramos * 10
        ) / 10,

      ...presentacion
    };

    resultado[
      categoriaUI
    ].push(
      entrada
    );
  }

  Object.values(
    resultado
  ).forEach(
    lista =>
      lista.sort(
        (
          a,
          b
        ) =>
          b.gramos -
          a.gramos
      )
  );

  return resultado;
}

function construirListasDePlanDosSemanas(
  planDosSemanas,
  getFoodById
) {
  return {
    lista_compras_semana_1:
      construirListaCompras(
        planDosSemanas
          .semana_1
          .dias,

        getFoodById
      ),

    lista_compras_semana_2:
      construirListaCompras(
        planDosSemanas
          .semana_2
          .dias,

        getFoodById
      ),

    lista_compras_14_dias:
      construirListaCompras(
        [
          ...planDosSemanas
            .semana_1
            .dias,

          ...planDosSemanas
            .semana_2
            .dias
        ],

        getFoodById
      )
  };
}

function construirWarningsExclusion(
  alimentosExcluidos,
  TODOS_LOS_PLATILLOS
) {
  if (
    !alimentosExcluidos ||
    alimentosExcluidos.length === 0
  ) {
    return {
      warning_flag:
        false,

      warnings:
        [],

      impacto: {
        platillos_afectados:
          0,

        platillos_disponibles:
          TODOS_LOS_PLATILLOS.length
      }
    };
  }

  const excluidosSet =
    new Set(
      alimentosExcluidos
    );

  let platillosConAnclaExcluida =
    0;

  let platillosSinIngredientesExcluidos =
    0;

  TODOS_LOS_PLATILLOS.forEach(
    p => {
      const anclaExcluida =
        p.ingredients.some(
          ing =>
            !ing.sustituible &&
            excluidosSet.has(
              ing.food_id
            )
        );

      const algunoExcluido =
        p.ingredients.some(
          ing =>
            excluidosSet.has(
              ing.food_id
            )
        );

      if (
        anclaExcluida
      ) {
        platillosConAnclaExcluida++;
      }

      if (
        !algunoExcluido
      ) {
        platillosSinIngredientesExcluidos++;
      }
    }
  );

  const warnings = [];

  if (
    platillosConAnclaExcluida >
    0
  ) {
    warnings.push({
      severity:
        platillosConAnclaExcluida >
        10
          ? 'high'
          : 'medium',

      message:
        `${platillosConAnclaExcluida} platillo(s) tienen como ingrediente ` +
        `principal algo que excluiste. El motor intentará mantener tus ` +
        `objetivos dentro de las tolerancias disponibles, priorizando ` +
        `otras recetas.`
    });
  }

  const platillosDisponibles =
    TODOS_LOS_PLATILLOS.length -
    platillosConAnclaExcluida;

  if (
    platillosDisponibles <
    TODOS_LOS_PLATILLOS.length *
    0.4
  ) {
    warnings.push({
      severity:
        'high',

      message:
        'Al excluir varios alimentos, la variedad disponible se reduce ' +
        'de forma importante. Esto puede dificultar cerrar el día o la ' +
        'semana dentro de la tolerancia estricta.'
    });
  }

  return {
    warning_flag:
      warnings.length >
      0,

    warnings,

    impacto: {
      platillos_afectados:
        platillosConAnclaExcluida,

      platillos_disponibles:
        platillosDisponibles
    }
  };
}

module.exports = {
  calcularCostTierPlatillo,
  calcularMacrosCard,
  construirCardDashboard,
  construirDashboardDia,
  construirListaCompras,
  construirListasDePlanDosSemanas,
  construirWarningsExclusion
};