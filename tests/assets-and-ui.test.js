const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('cada alimento y platillo tiene su recurso visual', () => {
  const foods = require('../lib/menu-engine/data/foods.json');
  const dishes = require('../lib/menu-engine/data/dishes.json');
  for (const food of foods) {
    const file = path.join(root, 'assets', 'foods', `${food.id}.jpe`);
    assert.ok(fs.existsSync(file), food.id);
    assert.ok(fs.statSync(file).size < 200 * 1024, `${food.id} excede 200 KB`);
  }
  for (const dish of dishes) {
    const file = path.join(root, `${dish.dish_id}.jpg`);
    assert.ok(fs.existsSync(file), dish.dish_id);
    assert.ok(fs.statSync(file).size < 200 * 1024, `${dish.dish_id} excede 200 KB`);
  }
});

test('la configuración consume un objetivo activo de sólo lectura', () => {
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  assert.match(html, /<output id="obj-kcal">/);
  assert.doesNotMatch(html, /<input[^>]+id="obj-kcal"/);
  assert.match(app, /objetivoActivo/);
  assert.doesNotMatch(app, /cost_tier/);
  assert.match(html, /id="custom-recipe-extension"/);
});

test('el loading de generación es indeterminado y no muestra porcentajes', () => {
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  assert.match(html, /role="progressbar"/);
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.doesNotMatch(html, />\s*\d+%\s*</);
});
