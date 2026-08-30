const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NUTRIENTS,
  aggregateIngredients,
  aggregateDish,
  aggregateMeal,
  aggregateDay,
  aggregatePlan
} = require('../lib/menu-engine/micronutrient-shadow.cjs');

const catalog = [
  {
    id: 'known', base_g: 100, increment: 10, unit_type: 'pieza',
    micronutrients: Object.fromEntries(NUTRIENTS.map((n, i) => [n, i + 1]))
  },
  {
    id: 'zero', base_g: 100, increment: 10, unit_type: 'g',
    micronutrients: Object.fromEntries(NUTRIENTS.map(n => [n, 0]))
  },
  {
    id: 'unknown', base_g: 100, increment: 10, unit_type: 'g',
    micronutrients: Object.fromEntries(NUTRIENTS.map(n => [n, null]))
  }
];

function dish(ingredients) {
  return { dish_id: 'TEST_1', ingredients };
}

test('known values scale using production quantity semantics', () => {
  const result = aggregateIngredients([
    { food_id: 'known', base_amount: 2, unit: 'pieza' }
  ], catalog);
  assert.equal(result.nutrients.sodium_mg.known_total, 0.2);
  assert.equal(result.nutrients.sodium_mg.measurement_status, 'COMPLETE');
  assert.equal(result.unknown_food_ids.length, 0);
});

test('explicit zero is known, not missing', () => {
  const result = aggregateDish(dish([{ food_id: 'zero', base_amount: 50, unit: 'g' }]), catalog);
  assert.equal(result.nutrients.potassium_mg.known_total, 0);
  assert.equal(result.nutrients.potassium_mg.known_contributor_count, 1);
  assert.equal(result.nutrients.potassium_mg.unknown_contributor_count, 0);
  assert.equal(result.nutrients.potassium_mg.measurement_status, 'COMPLETE');
});

test('null remains unknown and yields NOT_ASSESSABLE when alone', () => {
  const result = aggregateDish(dish([{ food_id: 'unknown', base_amount: 100, unit: 'g' }]), catalog);
  assert.equal(result.nutrients.iron_mg.known_total, 0);
  assert.equal(result.nutrients.iron_mg.measurement_status, 'NOT_ASSESSABLE');
  assert.equal(result.nutrients.iron_mg.known_contributor_count, 0);
  assert.equal(result.nutrients.iron_mg.unknown_contributor_count, 1);
});

test('known plus null is PARTIAL and known_total is a lower bound', () => {
  const result = aggregateDish(dish([
    { food_id: 'known', base_amount: 100, unit: 'g' },
    { food_id: 'unknown', base_amount: 100, unit: 'g' }
  ]), catalog);
  assert.equal(result.nutrients.zinc_mg.measurement_status, 'PARTIAL');
  assert.equal(result.nutrients.zinc_mg.known_total, 6);
  assert.equal(result.nutrients.zinc_mg.total_contributor_count, 2);
});

test('dish, meal, day, and multi-day aggregation are deterministic', () => {
  const d = dish([{ food_id: 'known', base_amount: 100, unit: 'g' }]);
  const meal = { items: [{ food_id: 'known', gramos_calculados: 100 }] };
  const day = { comidas: [meal] };
  const first = aggregatePlan([day, day], catalog);
  const second = aggregatePlan([day, day], catalog);
  assert.deepEqual(first, second);
  assert.equal(aggregateMeal(meal, catalog).nutrients.sodium_mg.known_total, 1);
  assert.equal(aggregateDay(day, catalog).nutrients.sodium_mg.known_total, 1);
  assert.equal(first.total.nutrients.sodium_mg.known_total, 2);
});

test('unknown food and ambiguous unit are observable, never coerced to zero', () => {
  const result = aggregateIngredients([
    { food_id: 'missing', base_amount: 1, unit: 'g' },
    { food_id: 'known', base_amount: 1, unit: 'taza' }
  ], catalog);
  assert.deepEqual(result.unknown_food_ids, ['missing']);
  assert.equal(result.unit_errors.length, 1);
  assert.equal(result.nutrients.calcium_mg.measurement_status, 'NOT_ASSESSABLE');
  assert.equal(result.nutrients.calcium_mg.known_total, 0);
});
