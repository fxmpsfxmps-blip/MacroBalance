const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');

test('calculator bootstrap compiles and exposes the inline EMPEZAR handler', () => {
  assert.doesNotThrow(() => new vm.Script(calculator, { filename: 'calculadora.js' }));
  assert.match(calculator, /async function abrirModal\(\)/);
  assert.match(html, /onclick="abrirModal\(\)"/);
});

test('Standard is a single calculator with one final target', () => {
  assert.match(html, /id="mode-standard"/);
  assert.doesNotMatch(html, /id="mode-precision"/);
  assert.doesNotMatch(html, /carrusel/i);
  assert.match(html, /id="resultado-section"/);
  assert.match(html, /Usar este objetivo/);
  assert.match(calculator, /Tu objetivo diario/);
});

test('body-fat flow is progressive and method is metadata only', () => {
  assert.match(html, /¿Conoces aproximadamente tu porcentaje de grasa corporal\?/);
  assert.match(html, /id="bodyfat-yes"/);
  assert.match(html, /id="bodyfat-no"/);
  assert.match(html, /id="bodyfat-details"/);
  assert.match(html, /id="bodyfat-method"/);
  assert.match(calculator, /function setBodyFatKnown/);
  assert.match(calculator, /bodyFatMethod: datos\.bodyFatMethod/);
});

test('training and steps preserve explicit missingness without stale values', () => {
  assert.match(html, /¿Entrenas actualmente\?/);
  assert.doesNotMatch(html, /\+<b id="gym-kcal-valor"/);
  assert.match(html, /id="standard-training-type"/);
  assert.match(html, /id="standard-training-minutes"/);
  assert.match(html, /id="standard-training-workload"/);
  assert.match(calculator, /trainingModality: 'NONE'/);
  assert.match(calculator, /trainingStatus: 'UNKNOWN'/);
  assert.match(calculator, /function actualizarStepsFollowup/);
  assert.match(calculator, /steps: hasSteps \? steps : null/);
  assert.match(html, /<option value="" selected>Selecciona\.\.\.<\/option>/);
  assert.doesNotMatch(html, /<option value="3" selected>/);
});

test('unused stress, sleep, water and legacy cardio are absent from active form', () => {
  const activeForm = html.split('id="precision-fields"')[0];
  for (const id of ['estres', 'sueno', 'agua', 'precision-cardio-type', 'precision-cardio-days', 'precision-cardio-minutes']) {
    assert.doesNotMatch(activeForm, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(activeForm, /agua recomendada|guía de cardio/i);
});

test('profile sex is loaded once and account edits feed the next calculation', () => {
  assert.match(calculator, /const sexo = state\.profile\?\.sexo/);
  assert.match(calculator, /document\.getElementById\('sexo'\)\.value = sexo/);
  assert.match(calculator, /document\.getElementById\('sexo'\)\.value = sexo;/);
  assert.match(firebase, /setValue\('sexo', profile\.sexo\)/);
  assert.match(firebase, /guardarSexoFirestore/);
  assert.doesNotMatch(html.split('id="precision-fields"')[0], /<label[^>]*>\s*Sexo/i);
});

test('history delete is owner-protected, transactional and rerendered after success', () => {
  assert.match(calculator, /data-goal-id/);
  assert.match(calculator, /await window\.eliminarObjetivoHistorialFirestore\(goalId\)/);
  assert.match(calculator, /await abrirModalHistorial\(\)/);
  assert.match(firebase, /runTransaction\(db, async transaction/);
  assert.match(firebase, /transaction\.delete\(goalRef\)/);
  assert.match(firebase, /await transaction\.get\(userRef\);[\s\S]{0,160}await transaction\.get\(goalRef\)/);
  assert.match(firebase, /currentObjectiveId/);
  assert.match(calculator, /No se pudo eliminar el objetivo/);
});

test('active Standard persistence normalizes omitted legacy fields to null', () => {
  assert.match(firebase, /horasSueno: inputSnapshot\.horasSueno \?\? null/);
  assert.match(firebase, /aguaTexto: inputSnapshot\.aguaTexto \?\? null/);
  assert.match(firebase, /nivelEstres: inputSnapshot\.nivelEstres \?\? null/);
});

test('new Standard detail contains only user-facing context', () => {
  assert.match(calculator, /result-context-grid/);
  assert.match(calculator, /Sobre tu cálculo/);
  assert.doesNotMatch(calculator, /A1|B1|L005|referenceWeight/);
});
