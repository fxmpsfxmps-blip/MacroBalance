const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engine = require('../lib/menu-engine/engine.js');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('los archivos estables del motor fueron migrados byte por byte', () => {
  const expected = {
    'engine.js': '7cf556ccf0cadec588734cd6f615e2077f90d08405a2a196be90da2a17913a6c',
    'sustitucion.js': 'adecd395e3c15ef8fb6c86d0ede89a806814226c212081408914ede50530deaa',
    'dashboard.js': 'bf37e8222839fdb213e1f2193b74cacd13a0ad70c3546a736fab92a5ed90a730',
    'data/foods.json': '551f8303447dd6295425dae234dff1577cd0381e39f6344730989a9ceac199fd',
    'data/dishes.json': '2d6301faf4f1b12f27eefdf8c09c0f5817cacbe684b9a80ef7245de937ecb273'
  };

  for (const [relativePath, expectedHash] of Object.entries(expected)) {
    const contents = fs.readFileSync(path.join(root, 'lib', 'menu-engine', relativePath));
    assert.equal(sha256(contents), expectedHash, relativePath);
  }
});

test('el baseline determinista semanal conserva exactamente su salida', () => {
  const result = engine.generarMenuSemanal({
    objetivo: { kcal: 1800, proteina: 125, carbos: 190, grasa: 60 },
    numeroComidas: 4,
    numDias: 7,
    numeroCandidatos: 8,
    usarSoloCarrito: false,
    alimentosSeleccionados: [],
    alimentosExcluidos: ['salmon_cocido'],
    diasSinRepetir: 2,
    seed: 'integration-baseline-v1'
  });

  assert.equal(
    sha256(JSON.stringify(result)),
    'c0d8190ddc0e0a30841089ea516aa918df4d7d8edb3e07cca6ff180fa67efd72'
  );
  assert.equal(result.dias.length, 7);
  assert.equal(result.dias_no_factibles, 0);
  assert.deepEqual(result.resultado_semanal, {
    kcal: 12592,
    proteina: 876,
    carbos: 1328,
    grasa: 422
  });
});
