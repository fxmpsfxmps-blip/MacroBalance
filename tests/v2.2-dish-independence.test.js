const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../lib/menu-engine/engine.js');
const { aggregateDish } = require('../lib/menu-engine/micronutrient-shadow.cjs');

const root = path.resolve(__dirname, '..');
const workingFoods = JSON.parse(fs.readFileSync(path.join(root, 'lib/menu-engine/data/foods-v2.2-working.json'), 'utf8'));
const workingDishes = JSON.parse(fs.readFileSync(path.join(root, 'lib/menu-engine/data/dishes.json'), 'utf8'));
const profile = {
  objetivo: { kcal: 1800, proteina: 125, carbos: 190, grasa: 60 },
  numeroComidas: 4, numDias: 1, numeroCandidatos: 8,
  usarSoloCarrito: false, alimentosSeleccionados: [], alimentosExcluidos: [],
  diasSinRepetir: 2, seed: 'v2.2-independence'
};

test('adding test-only dishes does not mutate Foods or existing dish results', () => {
  const foodsBefore = JSON.stringify(workingFoods);
  const idsBefore = workingDishes.map(d => d.dish_id);
  const baseline = JSON.stringify(aggregateDish(workingDishes[0], workingFoods));
  for (const count of [1, 10, 100, 300]) {
    const foodsCopy = JSON.parse(foodsBefore);
    const dishesCopy = JSON.parse(JSON.stringify(workingDishes));
    for (let i = 0; i < count; i += 1) {
      dishesCopy.push({
        dish_id: `SYN_${count}_${i}`,
        name: `Synthetic ${count}/${i}`,
        meal_type: ['desayuno'], flavor_profile: 'salado', preparation: 'test-only',
        ingredients: [{ food_id: 'pollo_pechuga_cocida', role: 'proteina_base', base_amount: 100, min_amount: 100, max_amount: 100, unit: 'g' }],
        image: `/SYN_${count}_${i}.jpg`
      });
    }
    assert.equal(JSON.stringify(foodsCopy), foodsBefore);
    assert.deepEqual(dishesCopy.slice(0, workingDishes.length).map(d => d.dish_id), idsBefore);
    assert.equal(JSON.stringify(aggregateDish(dishesCopy[0], foodsCopy)), baseline);
  }
  const resultA = engine.generarMenuSemanal(profile);
  const resultB = engine.generarMenuSemanal(profile);
  assert.deepEqual(resultA, resultB);
  assert.equal(JSON.stringify(workingFoods), foodsBefore);
});
