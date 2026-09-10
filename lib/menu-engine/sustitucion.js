// sustitucion.js
//
// V2.2 desactiva temporalmente la sustitución automática. La implementación
// histórica permanece disponible debajo para una auditoría futura, pero la
// ruta runtime `adaptarPlatillo()` opera fail-closed: cualquier ingrediente
// excluido invalida el platillo completo. No retiene anclas, no elimina
// ingredientes y no inventa reemplazos.

const AUTOMATIC_SUBSTITUTION_ENABLED = false;

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

// Gate runtime V2.2. `null` significa "platillo no viable" y engine.js ya
// continúa evaluando los demás candidatos. Con cero exclusiones se conserva
// exactamente la receta registrada.
function adaptarPlatillo(platillo, excluidos, carrito, mealKey, getFoodById) {
  if (!excluidos || excluidos.length === 0) {
    return { ingredients: platillo.ingredients };
  }

  const excluidosSet = new Set(excluidos);
  if (platillo.ingredients.some(ing => excluidosSet.has(ing.food_id))) {
    return null;
  }

  return { ingredients: platillo.ingredients };
}

module.exports = {
  AUTOMATIC_SUBSTITUTION_ENABLED,
  adaptarPlatillo,
  buscarSustituto
};
