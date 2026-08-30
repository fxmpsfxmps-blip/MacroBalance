const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { NUTRIENTS } = require('../lib/menu-engine/micronutrient-shadow.cjs');

const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const foods = read('lib/menu-engine/data/foods-v2.2-working.json');
const productionFoods = read('lib/menu-engine/data/foods.json');
const dishes = read('lib/menu-engine/data/dishes.json');
const status = read('lib/menu-engine/data/food-v2.2-status.json');
const provenance = read('lib/menu-engine/data/food-provenance.json');

test('working Foods schema, IDs, missingness, and provenance are deterministic', () => {
  const ids = foods.map(food => food.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const food of foods) {
    for (const key of ['id', 'name', 'category', 'state', 'base_g', 'kcal', 'protein', 'carbs', 'fat', 'fiber', 'unit_type', 'increment', 'micronutrients']) {
      assert.ok(Object.prototype.hasOwnProperty.call(food, key), `${food.id}:${key}`);
    }
    assert.ok(Number.isFinite(food.base_g) && food.base_g > 0);
    for (const nutrient of NUTRIENTS) {
      const value = food.micronutrients[nutrient];
      assert.ok(value === null || (typeof value === 'number' && Number.isFinite(value)), `${food.id}:${nutrient}`);
    }
    const effective = { ...status.defaults, ...(status.overrides[food.id] || {}) };
    assert.equal(typeof effective.show_in_builder, 'boolean');
    assert.equal(typeof effective.show_in_dashboard, 'boolean');
  }
  const provenanceIds = new Set(provenance.entries.map(entry => entry.food_id));
  for (const entry of provenance.entries) assert.ok(foods.some(food => food.id === entry.food_id), entry.food_id);
  assert.equal(provenanceIds.size, provenance.entries.length);
});

test('production and working catalogs remain distinct', () => {
  assert.equal(productionFoods.length, 197);
  assert.equal(foods.length, 233);
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  assert.equal(hash('lib/menu-engine/data/foods.json'), '99b4e0a46777b60d0c8bff58c3480b888f29e69bb256a6a8f546dec0065dc74c');
});

test('current dishes have unique IDs and production-resolvable references', () => {
  const ids = dishes.map(dish => dish.dish_id);
  assert.equal(new Set(ids).size, ids.length);
  const foodIds = new Set(productionFoods.map(food => food.id));
  for (const dish of dishes) {
    assert.ok(Array.isArray(dish.ingredients) && dish.ingredients.length > 0, dish.dish_id);
    for (const ingredient of dish.ingredients) {
      assert.ok(foodIds.has(ingredient.food_id), `${dish.dish_id}:${ingredient.food_id}`);
      assert.ok(ingredient.min_amount <= ingredient.base_amount && ingredient.base_amount <= ingredient.max_amount);
    }
  }
});

test('synthetic 500+ dish catalog parses and resolves without a fixed count', () => {
  const synthetic = Array.from({ length: 1000 }, (_, index) => ({
    dish_id: `SYN_${index}`,
    ingredients: [{ food_id: 'pollo_pechuga_cocida', base_amount: 100, min_amount: 100, max_amount: 100, unit: 'g' }]
  }));
  const parsed = JSON.parse(JSON.stringify(synthetic));
  const byId = new Map(parsed.map(dish => [dish.dish_id, dish]));
  assert.equal(byId.size, 1000);
  assert.equal(byId.get('SYN_999').ingredients[0].food_id, 'pollo_pechuga_cocida');
});
