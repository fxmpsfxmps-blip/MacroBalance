'use strict';

// V2.2 working/test-only micronutrient aggregation.  This module deliberately
// does not import the production engine or mutate its catalogs.

const NUTRIENTS = Object.freeze([
  'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg',
  'magnesium_mg', 'zinc_mg', 'phosphorus_mg', 'vitamin_a_mcg',
  'vitamin_c_mg', 'vitamin_d_mcg', 'vitamin_e_mg', 'vitamin_k_mcg',
  'b1_mg', 'b2_mg', 'b3_mg', 'b6_mg', 'b12_mcg', 'folate_mcg'
]);

function lookup(catalog) {
  if (catalog instanceof Map) return id => catalog.get(id);
  if (Array.isArray(catalog)) {
    const byId = new Map(catalog.map(food => [food.id, food]));
    return id => byId.get(id);
  }
  if (catalog && typeof catalog === 'object') return id => catalog[id];
  throw new TypeError('catalog must be an array, Map, or object');
}

// Matches engine.js cantidadEnGramos exactly.  ml is treated as the same
// numeric basis as grams because that is the current production contract.
function quantityToGrams(food, ingredient, amount) {
  const unit = ingredient.unit ?? ingredient.unidad;
  const value = amount ?? ingredient.base_amount ?? ingredient.cantidad_declarada;
  if (!Number.isFinite(Number(value))) {
    throw new Error(`Invalid quantity for ${ingredient.food_id}`);
  }
  const numeric = Number(value);
  if (unit === 'g' || unit === 'ml') return numeric;
  if (unit === food.unit_type) {
    if (!Number.isFinite(Number(food.increment)) || Number(food.increment) <= 0) {
      throw new Error(`Invalid increment for ${food.id}`);
    }
    return numeric * Number(food.increment);
  }
  throw new Error(`Ambiguous unit "${unit}" for ${food.id}`);
}

function emptyNutrients() {
  return Object.fromEntries(NUTRIENTS.map(nutrient => [nutrient, {
    known_total: 0,
    known_contributor_count: 0,
    unknown_contributor_count: 0,
    total_contributor_count: 0,
    measurement_status: 'NOT_ASSESSABLE'
  }]));
}

function addContribution(result, food, grams) {
  const micros = food?.micronutrients || {};
  for (const nutrient of NUTRIENTS) {
    const cell = result[nutrient];
    cell.total_contributor_count += 1;
    const perBase = micros[nutrient];
    if (typeof perBase === 'number' && Number.isFinite(perBase)) {
      cell.known_total += perBase * grams / Number(food.base_g);
      cell.known_contributor_count += 1;
    } else {
      cell.unknown_contributor_count += 1;
    }
  }
}

function finalize(result) {
  for (const nutrient of NUTRIENTS) {
    const cell = result[nutrient];
    if (cell.known_contributor_count === 0) {
      cell.measurement_status = 'NOT_ASSESSABLE';
    } else if (cell.unknown_contributor_count > 0) {
      cell.measurement_status = 'PARTIAL';
    } else {
      cell.measurement_status = 'COMPLETE';
    }
    cell.known_total = Number(cell.known_total.toFixed(12));
  }
  return result;
}

function aggregateIngredients(ingredients, catalog) {
  if (!Array.isArray(ingredients)) throw new TypeError('ingredients must be an array');
  const getFood = lookup(catalog);
  const result = emptyNutrients();
  const unknownFoodIds = [];
  const unitErrors = [];
  for (const ingredient of ingredients) {
    const food = getFood(ingredient.food_id);
    if (!food || !Number.isFinite(Number(food.base_g)) || Number(food.base_g) <= 0) {
      unknownFoodIds.push(ingredient.food_id);
      for (const nutrient of NUTRIENTS) result[nutrient].total_contributor_count += 1;
      for (const nutrient of NUTRIENTS) result[nutrient].unknown_contributor_count += 1;
      continue;
    }
    try {
      const grams = quantityToGrams(food, ingredient, ingredient.base_amount);
      if (!Number.isFinite(grams) || grams < 0) throw new Error('invalid resolved grams');
      addContribution(result, food, grams);
    } catch (error) {
      unitErrors.push({ food_id: ingredient.food_id, message: error.message });
      for (const nutrient of NUTRIENTS) {
        result[nutrient].total_contributor_count += 1;
        result[nutrient].unknown_contributor_count += 1;
      }
    }
  }
  return {
    nutrients: finalize(result),
    unknown_food_ids: [...new Set(unknownFoodIds)],
    unit_errors: unitErrors
  };
}

function aggregateDish(dish, catalog) {
  return aggregateIngredients(dish?.ingredients, catalog);
}

function aggregateItems(items, catalog) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  const ingredients = items.map(item => ({
    food_id: item.food_id,
    // Generated engine items expose `cantidad` as grams; preserve that
    // contract rather than reinterpreting display quantities.
    base_amount: item.gramos_calculados ?? item.cantidad,
    unit: 'g'
  }));
  return aggregateIngredients(ingredients, catalog);
}

function aggregateMeal(meal, catalog) {
  return aggregateItems(meal?.items, catalog);
}

function aggregateDay(day, catalog) {
  const meals = Array.isArray(day?.comidas) ? day.comidas : [];
  const parts = meals.map(meal => aggregateMeal(meal, catalog));
  return combine(parts);
}

function combine(parts) {
  const result = emptyNutrients();
  const unknownFoodIds = new Set();
  const unitErrors = [];
  for (const part of parts || []) {
    for (const nutrient of NUTRIENTS) {
      const target = result[nutrient];
      const source = part.nutrients[nutrient];
      target.known_total += source.known_total;
      target.known_contributor_count += source.known_contributor_count;
      target.unknown_contributor_count += source.unknown_contributor_count;
      target.total_contributor_count += source.total_contributor_count;
    }
    (part.unknown_food_ids || []).forEach(id => unknownFoodIds.add(id));
    unitErrors.push(...(part.unit_errors || []));
  }
  return { nutrients: finalize(result), unknown_food_ids: [...unknownFoodIds].sort(), unit_errors: unitErrors };
}

function aggregatePlan(days, catalog) {
  const dayResults = (Array.isArray(days) ? days : []).map(day => aggregateDay(day, catalog));
  return { days: dayResults, total: combine(dayResults) };
}

module.exports = {
  NUTRIENTS,
  quantityToGrams,
  aggregateIngredients,
  aggregateDish,
  aggregateMeal,
  aggregateDay,
  aggregatePlan
};
