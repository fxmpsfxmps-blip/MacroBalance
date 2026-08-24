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

test('la generación audiovisual conserva posters y limita la carga móvil a un video', () => {
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  const panels = html.match(/data-generation-panel/g) || [];

  assert.equal(panels.length, 4);
  assert.equal((html.match(/data-video-src="\/media\/transition-[^"]+\.mp4"/g) || []).length, 4);
  assert.equal((html.match(/data-poster-src="\/media\/transition-[^"]+\.webp"/g) || []).length, 4);
  assert.match(html, /<video autoplay muted loop playsinline preload="none"/);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.doesNotMatch(html, /generation-elapsed/);
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.doesNotMatch(html, />\s*\d+%\s*</);
  assert.match(app, /window\.matchMedia\('\(pointer: coarse\)'\)\.matches/);
  assert.match(app, /const shouldLoad = !isMobile \|\| index === selectedMobilePanel/);

  for (const name of ['lifestyle', 'running', 'bodybuilding', 'fitness']) {
    const video = path.join(root, 'media', `transition-${name}.mp4`);
    const poster = path.join(root, 'media', `transition-${name}.webp`);
    assert.ok(fs.existsSync(video), name);
    assert.ok(fs.statSync(video).size < 8 * 1024 * 1024, `${name} excede 8 MB`);
    assert.ok(fs.existsSync(poster), `${name} no tiene poster`);
    assert.ok(fs.statSync(poster).size < 200 * 1024, `${name} poster excede 200 KB`);
  }
});
