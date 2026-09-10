const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../lib/server/menu-service.cjs');

test('foods publica el catálogo completo', () => {
  const result = run('foods');
  assert.equal(result.status, 200);
  assert.equal(result.payload.length, 193);
  assert.ok(result.payload.every(food => food.id && food.name));
});

test('el API no inventa objetivos cuando faltan macros', () => {
  const result = run('fortnight', {});
  assert.equal(result.status, 400);
  assert.match(result.payload.error, /objetivo es obligatorio/i);
});

test('el API rechaza exclusiones desconocidas', () => {
  const result = run('fortnight', {
    objetivo: { kcal: 1800, proteina: 125, carbos: 190, grasa: 60 },
    alimentosExcluidos: ['id_que_no_existe']
  });
  assert.equal(result.status, 400);
  assert.match(result.payload.error, /exclusiones desconocidas/i);
});

test('una generación diaria válida entrega dashboard y diagnóstico de exclusiones', () => {
  const result = run('daily', {
    objetivos: { kcal: 1800, p: 125, c: 190, f: 60 },
    numeroComidas: 4,
    alimentosExcluidos: ['salmon_cocido'],
    seed: 'api-contract-daily-v1'
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.success, true);
  assert.ok(Array.isArray(result.payload.dashboard.comidas));
  assert.equal(typeof result.payload.hard_exclusion_violation, 'boolean');
  assert.ok(result.payload.integration_meta.generation_ms >= 0);
});

test('el handler serverless usa Request/Response estándar', async () => {
  const { GET: foodsHandler } = await import('../api/foods.mjs');
  const response = await foodsHandler(new Request('http://localhost/api/foods'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).length, 193);
});
