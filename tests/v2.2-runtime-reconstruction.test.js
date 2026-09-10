const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relative => JSON.parse(
  fs.readFileSync(path.join(root, relative), 'utf8')
);

const foods = read('lib/menu-engine/data/foods.json');
const workingFoods = read('lib/menu-engine/data/foods-v2.2-working.json');
const dishes = read('lib/menu-engine/data/dishes.json');
const rotated = read('lib/menu-engine/data/dishes-v2.2-rotated-out.json');
const byFood = new Map(foods.map(food => [food.id, food]));
const preparationIds = new Set(
  foods
    .filter(food => food.final_state === 'PREPARATION_INPUT')
    .map(food => food.id)
);

const {
  AUTOMATIC_SUBSTITUTION_ENABLED,
  adaptarPlatillo
} = require('../lib/menu-engine/sustitucion.js');
const engine = require('../lib/menu-engine/engine.js');

test('runtime foods are the exact 167 visible plus 26 preparation V2.2 projection', () => {
  assert.equal(workingFoods.length, 237);
  assert.equal(foods.length, 193);
  assert.equal(new Set(foods.map(food => food.id)).size, 193);
  assert.equal(foods.filter(food => food.final_state === 'VISIBLE_ACTIVE').length, 167);
  assert.equal(foods.filter(food => food.final_state === 'PREPARATION_INPUT').length, 26);
  assert.equal(foods.filter(food => food.final_state === 'ARCHIVED').length, 0);
  assert.deepEqual(
    foods,
    workingFoods.filter(food => food.final_state !== 'ARCHIVED')
  );
});

test('all 192 active dishes resolve against runtime foods with finite critical macros', () => {
  assert.equal(dishes.length, 192);
  assert.equal(rotated.rotated_out.length, 1);

  for (const dish of dishes) {
    for (const ingredient of dish.ingredients) {
      const food = byFood.get(ingredient.food_id);
      assert.ok(food, `${dish.dish_id}:${ingredient.food_id}:missing`);
      assert.notEqual(food.final_state, 'ARCHIVED', `${dish.dish_id}:${ingredient.food_id}:archived`);
      for (const nutrient of ['kcal', 'protein', 'carbs', 'fat']) {
        assert.ok(Number.isFinite(food[nutrient]), `${dish.dish_id}:${ingredient.food_id}:${nutrient}`);
      }
    }
  }
});

test('automatic substitution is OFF and exclusions invalidate the complete dish', () => {
  assert.equal(AUTOMATIC_SUBSTITUTION_ENABLED, false);

  const dish = {
    dish_id: 'TEST_FAIL_CLOSED',
    ingredients: [
      { food_id: 'atun_fresco_sellado', sustituible: false, base_amount: 100 },
      {
        food_id: 'mango',
        sustituible: true,
        sustitutos_recomendados: ['limon'],
        base_amount: 60
      }
    ]
  };
  const cart = [byFood.get('atun_fresco_sellado'), byFood.get('mango'), byFood.get('limon')];

  assert.strictEqual(adaptarPlatillo(dish, [], cart, 'comida', id => byFood.get(id)).ingredients, dish.ingredients);
  assert.equal(adaptarPlatillo(dish, ['mango'], cart, 'comida', id => byFood.get(id)), null);
  assert.equal(adaptarPlatillo(dish, ['atun_fresco_sellado'], cart, 'comida', id => byFood.get(id)), null);
  assert.equal(preparationIds.has('limon'), true);
});

test('0/1/3/5/10/wide exclusion runs never retain an excluded ingredient', () => {
  const cumulative = [
    'platano',
    'pollo_pechuga_cocida',
    'leche_entera',
    'arroz_blanco_cocido',
    'aguacate',
    'jitomate',
    'pan_integral',
    'huevo_entero',
    'salmon_cocido',
    'frijol_negro_cocido'
  ];
  const visibleIds = foods
    .filter(food => food.final_state === 'VISIBLE_ACTIVE')
    .map(food => food.id);
  const fixtures = [
    { name: '0', ids: [], kcal: 1800, meals: 4 },
    { name: '1', ids: cumulative.slice(0, 1), kcal: 1800, meals: 4 },
    { name: '3', ids: cumulative.slice(0, 3), kcal: 1800, meals: 4 },
    { name: '5', ids: cumulative.slice(0, 5), kcal: 1800, meals: 4 },
    { name: '10', ids: cumulative, kcal: 1800, meals: 4 },
    { name: 'wide-2600', ids: visibleIds, kcal: 2600, meals: 5 }
  ];

  for (const fixture of fixtures) {
    const excluded = new Set(fixture.ids);
    const result = engine.generarMenu({
      objetivo: {
        kcal: fixture.kcal,
        proteina: fixture.kcal === 2600 ? 170 : 125,
        carbos: fixture.kcal === 2600 ? 300 : 190,
        grasa: fixture.kcal === 2600 ? 80 : 60
      },
      numeroComidas: fixture.meals,
      alimentosSeleccionados: [],
      alimentosExcluidos: fixture.ids,
      usarSoloCarrito: false,
      seed: `v2.2-runtime-${fixture.name}`
    });

    if (result.error) {
      assert.equal(result.factible, false, fixture.name);
      assert.match(result.error, /restricciones actuales|no pudieron adaptarse/i, fixture.name);
      continue;
    }

    for (const meal of result.comidas) {
      for (const item of meal.items) {
        assert.equal(excluded.has(item.food_id), false, `${fixture.name}:${meal.dish_id}:${item.food_id}`);
      }
    }
  }
});

test('frontend selector derives 167 visible foods and excludes all preparation inputs', () => {
  const source = fs.readFileSync(path.join(root, 'js/menu-app.js'), 'utf8');
  const marker = source.indexOf('const FOOD_CAROUSEL_DURATION_SECONDS');
  assert.ok(marker > 0);
  const context = {};
  vm.runInNewContext(
    `${source.slice(0, marker)}\nglobalThis.__foodVisibleEnSelector = foodVisibleEnSelector;`,
    context
  );
  const selected = foods.filter(food => context.__foodVisibleEnSelector(food));
  assert.equal(selected.length, 167);
  assert.equal(selected.filter(food => food.final_state === 'PREPARATION_INPUT').length, 0);
  assert.equal(selected.some(food => preparationIds.has(food.id)), false);
  assert.match(
    source,
    /Array\.from\(seleccionActual\)\.filter\([\s\S]*?foodVisibleEnSelector\([\s\S]*?alimentosPorId\[id\]/
  );
});
