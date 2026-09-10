const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const foods = read('lib/menu-engine/data/foods-v2.2-working.json');
const dishes = read('lib/menu-engine/data/dishes.json');
const archive = read('lib/menu-engine/data/dishes-v2.2-rotated-out.json');
const engine = require('../lib/menu-engine/engine.js');
const byFood = new Map(foods.map(food => [food.id, food]));
const validMeals = new Set(['desayuno', 'comida', 'cena', 'colacion', 'merienda']);

test('V2.2 dish catalog has 192 active dishes plus one traceable rotation', () => {
  assert.equal(dishes.length, 192);
  assert.equal(new Set(dishes.map(dish => dish.dish_id)).size, 192);
  assert.equal(archive.schema_version, 'V2.2');
  assert.equal(archive.rotated_out.length, 1);
  assert.equal(archive.rotated_out[0].dish_id, 'PLT_COM_036');
  assert.match(archive.rotated_out[0].rotation_reason, /cooked-yield/i);
});

test('active V2.2 dishes reference no missing or archived food', () => {
  for (const dish of dishes) {
    assert.ok(Array.isArray(dish.meal_type) && dish.meal_type.length > 0, dish.dish_id);
    assert.ok(dish.meal_type.every(value => validMeals.has(value)), dish.dish_id);
    assert.ok(Array.isArray(dish.ingredients) && dish.ingredients.length > 0, dish.dish_id);
    const seen = new Set();
    for (const ingredient of dish.ingredients) {
      const food = byFood.get(ingredient.food_id);
      assert.ok(food, `${dish.dish_id}:${ingredient.food_id}`);
      assert.notEqual(food.final_state, 'ARCHIVED', `${dish.dish_id}:${ingredient.food_id}`);
      assert.ok(!seen.has(ingredient.food_id), `${dish.dish_id}:duplicate:${ingredient.food_id}`);
      seen.add(ingredient.food_id);
      assert.ok(Number.isFinite(ingredient.base_amount) && ingredient.base_amount > 0, `${dish.dish_id}:${ingredient.food_id}:base`);
      assert.ok(Number.isFinite(ingredient.min_amount) && ingredient.min_amount >= 0, `${dish.dish_id}:${ingredient.food_id}:min`);
      assert.ok(Number.isFinite(ingredient.max_amount) && ingredient.max_amount > 0, `${dish.dish_id}:${ingredient.food_id}:max`);
      assert.ok(ingredient.min_amount <= ingredient.base_amount && ingredient.base_amount <= ingredient.max_amount, `${dish.dish_id}:${ingredient.food_id}:range`);
      assert.ok(['g', 'ml', food.unit_type].includes(ingredient.unit), `${dish.dish_id}:${ingredient.food_id}:${ingredient.unit}/${food.unit_type}`);
    }
  }
});

test('blocked foods never enter migrated dishes and chorizo is not active', () => {
  const refs = new Set(dishes.flatMap(dish => dish.ingredients.map(ingredient => ingredient.food_id)));
  for (const blocked of ['galletas_habaneras_integrales', 'salchicha_light', 'agua_jamaica_sin_azucar']) {
    assert.equal(refs.has(blocked), false, blocked);
  }
  assert.equal(refs.has('chorizo_cocido'), false);
  assert.equal(refs.has('proteina_polvo'), false);
  assert.equal(refs.has('proteina_whey_polvo'), true);
});

test('high-impact migrations retain explicit culinary identities', () => {
  const byDish = new Map(dishes.map(dish => [dish.dish_id, dish]));
  const ids = dishId => byDish.get(dishId).ingredients.map(ingredient => ingredient.food_id);
  assert.ok(ids('PLT_CEN_011').includes('tilapia_cocida'));
  assert.equal(byDish.get('PLT_CEN_011').name, 'Tostadas de tilapia a la vizcaína');
  assert.ok(ids('PLT_COL_028').includes('tostada_horneada'));
  assert.ok(ids('PLT_COM_021').includes('garbanzo_cocido'));
  assert.ok(ids('PLT_DES_043').includes('avena_cruda'));
  assert.equal(byDish.get('PLT_DES_043').ingredients.find(item => item.food_id === 'avena_cruda').base_amount, 40);
  assert.equal(byDish.get('PLT_DES_052').ingredients.find(item => item.food_id === 'avena_cruda').base_amount, 50);
});

test('preparation inputs stay explicit and tracked rather than becoming zero', () => {
  const prepRefs = dishes.flatMap(dish => dish.ingredients.map(ingredient => ({dish, ingredient})))
    .filter(({ingredient}) => byFood.get(ingredient.food_id).final_state === 'PREPARATION_INPUT');
  assert.ok(prepRefs.length > 18);
  for (const {ingredient} of prepRefs) {
    const food = byFood.get(ingredient.food_id);
    assert.ok(food.preparation_nutrition_semantics, ingredient.food_id);
    if (food.preparation_nutrition_semantics !== 'NONE') {
      assert.ok(food.kcal !== undefined, ingredient.food_id);
    }
  }
});

test('PROFECO 2025 ham supplies finite runtime protein to all three unchanged target dishes', () => {
  const ham = byFood.get('jamon_pavo_light');
  assert.equal(ham.protein, 11.5);
  const expected = new Map([
    ['PLT_COL_032', {kcal: 199.28, protein: 12.98, carbs: 20.3, fat: 7.14}],
    ['PLT_DES_003', {kcal: 307.42, protein: 24.75, carbs: 26.56, fat: 11.05}],
    ['PLT_DES_051', {kcal: 339.32, protein: 24.66, carbs: 27.66, fat: 13.94}]
  ]);

  for (const [dishId, expectedMacros] of expected) {
    const dish = dishes.find(candidate => candidate.dish_id === dishId);
    assert.ok(dish, dishId);
    const totals = {kcal: 0, protein: 0, carbs: 0, fat: 0};
    for (const ingredient of dish.ingredients) {
      const food = byFood.get(ingredient.food_id);
      const grams = engine.cantidadEnGramos(food, ingredient, ingredient.base_amount);
      const factor = grams / food.base_g;
      for (const nutrient of Object.keys(totals)) totals[nutrient] += food[nutrient] * factor;
    }
    const rounded = Object.fromEntries(
      Object.entries(totals).map(([nutrient, value]) => [nutrient, Math.round(value * 100) / 100])
    );
    assert.deepEqual(rounded, expectedMacros, dishId);
    assert.ok(Number.isFinite(rounded.protein) && rounded.protein > 0, `${dishId}:RUNTIME_NULL_PROTEIN`);
  }
});
