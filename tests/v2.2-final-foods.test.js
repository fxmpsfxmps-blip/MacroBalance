const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const foods = read('lib/menu-engine/data/foods-v2.2-working.json');
const productionFoods = read('lib/menu-engine/data/foods.json');
const preparation = read('lib/menu-engine/data/preparation-inputs-v2.2.json');
const status = read('lib/menu-engine/data/food-v2.2-status.json');
const provenance = read('lib/menu-engine/data/food-provenance.json');
const byId = new Map(foods.map(food => [food.id, food]));

const visibleCategories = new Set([
  'PROTEINAS', 'PESCADOS_Y_MARISCOS', 'EMBUTIDOS', 'LACTEOS',
  'CEREALES_PANES_TUBERCULOS', 'LEGUMINOSAS', 'FRUTAS',
  'VERDURAS_HORTALIZAS', 'GRASAS_NUECES_SEMILLAS', 'BEBIDAS',
  'SALSAS_COMPLEMENTOS'
]);
const nutritionKeys = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];

test('final V2.2 lifecycle projection is exact and non-overlapping', () => {
  assert.equal(foods.length, 237);
  assert.equal(new Set(foods.map(food => food.id)).size, 237);
  assert.equal(foods.filter(food => food.visible).length, 167);
  assert.equal(foods.filter(food => food.preparation_input).length, 26);
  assert.equal(foods.filter(food => food.final_state === 'ARCHIVED').length, 44);
  assert.equal(foods.filter(food => food.visible && food.preparation_input).length, 0);
  assert.equal(foods.filter(food => food.visible && !visibleCategories.has(food.category)).length, 0);
  assert.equal(foods.filter(food => food.visible && (!food.family || food.family === 'UNASSIGNED_FAMILY')).length, 0);
  for (const food of foods) assert.ok(status.overrides[food.id], food.id);
});

test('preparation inputs are a separate 26-record layer and hielo is NONE', () => {
  assert.equal(preparation.entries.length, 26);
  assert.equal(new Set(preparation.entries.map(entry => entry.food_id)).size, 26);
  assert.equal(preparation.entries.filter(entry => entry.visible).length, 0);
  assert.equal(preparation.entries.find(entry => entry.food_id === 'hielo').nutrition_semantics, 'NONE');
  for (const entry of preparation.entries) {
    assert.equal(byId.get(entry.food_id).final_state, 'PREPARATION_INPUT');
    assert.equal(status.overrides[entry.food_id].show_in_builder, false);
  }
});

test('only canonical whey remains active in complemento_proteico', () => {
  assert.deepEqual(
    foods.filter(food => food.visible && food.family === 'complemento_proteico').map(food => food.id),
    ['proteina_whey_polvo']
  );
  assert.equal(byId.get('proteina_polvo').final_state, 'ARCHIVED');
  assert.equal(byId.get('proteina_vegetal_polvo').final_state, 'ARCHIVED');
});

test('five red-team source profiles match their adjudicated authorities', () => {
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('pavo_molido')[key]),
    [213, 27.1, 0, 11.6]
  );
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('huevo_entero')[key]),
    [155, 12.6, 1.12, 10.6]
  );
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('carne_molida_res_magra')[key]),
    [164, 25.8, 0, 5.94]
  );
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('aceitunas_verdes')[key]),
    [145, 1.03, 3.84, 15.3]
  );
  assert.equal(byId.get('aceitunas_verdes').micronutrients.sodium_mg, 1560);
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat', 'fiber'].map(key => byId.get('salsa_soya_baja_sodio')[key]),
    [57, 9.05, 5.59, 0.3, 0.7]
  );
  assert.equal(byId.get('salsa_soya_baja_sodio').micronutrients.sodium_mg, 3600);
});

test('commercial partial panels preserve missingness and do not mix conflicts', () => {
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('leche_alta_proteina')[key]),
    [45, 5.4, 3.4, 1.2]
  );
  assert.ok(Object.values(byId.get('leche_alta_proteina').micronutrients).every(value => value === null));
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('leche_deslactosada')[key]),
    [48, 3.3, 4.5, 1.9]
  );
  assert.ok(Object.values(byId.get('leche_deslactosada').micronutrients).every(value => value === null));
  assert.equal(byId.get('queso_panela_light').micronutrients.sodium_mg, null);
  assert.deepEqual(
    ['kcal', 'protein', 'carbs', 'fat'].map(key => byId.get('jamon_pavo_light')[key]),
    [106, 11.5, 7, 3.5]
  );
  assert.equal(byId.get('jamon_pavo_light').micronutrients.sodium_mg, 883);
  assert.match(byId.get('jamon_pavo_light').product_identity, /400 g/);
  const hamAuthority = provenance.entries.find(entry => entry.food_id === 'jamon_pavo_light');
  assert.match(hamAuthority.source_name, /2025/);
  assert.equal(hamAuthority.match_quality, 'EXACT_SKU');
  assert.doesNotMatch(hamAuthority.notes, /BienEstar 250 g.*implemented/i);
  assert.equal(byId.get('proteina_whey_polvo').fiber, null);
});

test('tofu is a coherent FDC 172448 profile with explicit coagulant scope', () => {
  const tofu = byId.get('tofu_firme');
  assert.deepEqual(nutritionKeys.map(key => tofu[key]), [78, 9.04, 2.85, 4.17, 0.9]);
  assert.equal(tofu.micronutrients.calcium_mg, 201);
  assert.match(tofu.formulation_authority, /calcium sulfate \+ magnesium chloride/);
});

test('unsupported cooked chorizo nutrition is null rather than raw-label leakage', () => {
  const chorizo = byId.get('chorizo_cocido');
  assert.equal(chorizo.nutrition_status, 'PENDING_COOKED_YIELD');
  assert.ok(nutritionKeys.every(key => chorizo[key] === null));
  assert.ok(Object.values(chorizo.micronutrients).every(value => value === null));
});

test('only four implementation-ready additions are active', () => {
  const additions = foods.filter(food => food.master_decision === 'ADD_NOT_IN_233').map(food => food.id).sort();
  assert.deepEqual(additions, ['aceite_soya', 'chuleta_cerdo', 'pepperoni', 'te_preparado']);
  for (const blocked of ['salchicha_light', 'agua_jamaica_sin_azucar', 'galletas_habaneras_integrales']) {
    assert.equal(byId.has(blocked), false, blocked);
  }
});

test('all nutrition values are finite or null and implemented changes have provenance', () => {
  const provenanceIds = new Set(provenance.entries.map(entry => entry.food_id));
  for (const food of foods) {
    for (const key of nutritionKeys) assert.ok(food[key] === null || Number.isFinite(food[key]), `${food.id}:${key}`);
    for (const [key, value] of Object.entries(food.micronutrients)) assert.ok(value === null || Number.isFinite(value), `${food.id}:${key}`);
    if (food.source_changed) assert.ok(provenanceIds.has(food.id), food.id);
  }
});

test('runtime authority is the exact non-archived V2.2 projection', () => {
  assert.equal(productionFoods.length, 193);
  assert.equal(foods.length, 237);
  assert.deepEqual(
    productionFoods.map(food => food.id),
    foods.filter(food => food.final_state !== 'ARCHIVED').map(food => food.id)
  );
  assert.equal(productionFoods.filter(food => food.final_state === 'VISIBLE_ACTIVE').length, 167);
  assert.equal(productionFoods.filter(food => food.final_state === 'PREPARATION_INPUT').length, 26);
  assert.equal(productionFoods.filter(food => food.final_state === 'ARCHIVED').length, 0);
});
