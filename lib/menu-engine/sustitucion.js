// sustitucion.js
// Sustitución inteligente de ingredientes cuando el usuario excluye un alimento.
//
// Reglas (sección F del rediseño), en orden de prioridad:
// 1. Si el ingrediente excluido NO es sustituible (es el ancla del platillo)
//    → el ingrediente se deja SIN TOCAR. La exclusión de un ancla ya no
//    descarta el platillo (eso convertía la exclusión en un filtro duro).
//    Ahora es solo una prioridad negativa: engine.js penaliza en el score
//    a los platillos cuyo ancla está excluida, pero si de todos modos se
//    elige ese platillo (porque ayuda a cerrar mejor el día/semana), se
//    sirve tal cual — no se modifica la receta. La sustitución real de
//    anclas queda para la fase futura de personalización.
// 2. Si es sustituible: buscar primero en `sustitutos_recomendados` del
//    ingrediente, EN EL ORDEN dado, filtrando por disponibilidad en el
//    carrito y que no esté excluido. El primero disponible gana.
// 3. Si ninguno de los recomendados está disponible: fallback al criterio
//    genérico anterior — mismo `grupo_smae`, mismo meal_tag, disponible en
//    carrito, no excluido, ordenado por `priority` del alimento (menor gana).
// 4. Si tampoco hay nada ahí: se elimina el ingrediente (no el platillo) y
//    escalarPlatilloPorRol() en engine.js reparte su aporte perdido entre
//    los ingredientes del mismo rol que aún tengan margen.

function buscarSustitutoRecomendado(ing, carrito, excluidos, getFoodById) {
  if (!ing.sustitutos_recomendados || ing.sustitutos_recomendados.length === 0) return null;
  const carritoIds = new Set(carrito.map(f => f.id));
  for (const idRecomendado of ing.sustitutos_recomendados) {
    if (excluidos.includes(idRecomendado)) continue;
    if (!carritoIds.has(idRecomendado)) continue;
    const food = getFoodById(idRecomendado);
    if (food) return food;
  }
  return null;
}

function buscarSustitutoPorGrupo(foodOriginal, carrito, mealKey, excluidos) {
  const candidatos = carrito.filter(f =>
    f.id !== foodOriginal.id &&
    f.grupo_smae === foodOriginal.grupo_smae &&
    f.meal_tags.includes(mealKey) &&
    !excluidos.includes(f.id)
  );
  if (candidatos.length === 0) return null;
  return candidatos.sort((a, b) => (a.priority || 5) - (b.priority || 5))[0];
}

// Mantiene el nombre anterior por compatibilidad — ahora es el fallback
// genérico (paso 3), ya no el único criterio.
function buscarSustituto(foodOriginal, carrito, mealKey, excluidos) {
  return buscarSustitutoPorGrupo(foodOriginal, carrito, mealKey, excluidos);
}

// Devuelve { ingredients: [...] } con la lista ya adaptada. Ya no devuelve
// null: el ancla excluida se conserva tal cual (ver nota arriba), así que
// el único modo en que la lista queda corta es si algún ingrediente
// sustituible se elimina sin sustituto — nunca por el ancla.
function adaptarPlatillo(platillo, excluidos, carrito, mealKey, getFoodById) {
  if (!excluidos || excluidos.length === 0) {
    return { ingredients: platillo.ingredients };
  }

  const ingredientesAdaptados = [];

  for (const ing of platillo.ingredients) {
    if (!excluidos.includes(ing.food_id)) {
      ingredientesAdaptados.push(ing);
      continue;
    }

    if (!ing.sustituible) {
      // Ancla excluida: se conserva sin cambios (prioridad, no descarte;
      // no se modifica la receta en esta fase).
      ingredientesAdaptados.push(ing);
      continue;
    }

    const foodOriginal = getFoodById(ing.food_id);

    // Paso 2: sustitutos_recomendados, en orden
    let sustituto = buscarSustitutoRecomendado(ing, carrito, excluidos, getFoodById);
    // Paso 3: fallback genérico por grupo_smae + meal_tag
    if (!sustituto) sustituto = buscarSustitutoPorGrupo(foodOriginal, carrito, mealKey, excluidos);
    // Paso 4: sin sustituto → se elimina, el rol se reescala solo en engine.js
    if (!sustituto) continue;

    const refOriginal = foodOriginal.porcion_kcal_referencia || foodOriginal.kcal;
    const refSustituto = sustituto.porcion_kcal_referencia || sustituto.kcal;
    const factorEquivalencia = refSustituto > 0 ? refOriginal / refSustituto : 1;

    ingredientesAdaptados.push({
      ...ing,
      food_id: sustituto.id,
      base_amount: Math.round(ing.base_amount * factorEquivalencia * 10) / 10,
      min_amount: Math.round(ing.min_amount * factorEquivalencia * 10) / 10,
      max_amount: Math.round(ing.max_amount * factorEquivalencia * 10) / 10
    });
  }

  return { ingredients: ingredientesAdaptados };
}

module.exports = { adaptarPlatillo, buscarSustituto };