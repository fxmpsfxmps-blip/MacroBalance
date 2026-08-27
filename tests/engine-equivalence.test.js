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

function matchesStableHash(filePath, expectedHash) {
  const contents = fs.readFileSync(filePath);
  const rawHash = sha256(contents);
  const normalizedText = contents.toString('utf8').replace(/\r\n/g, '\n');
  const lfHash = sha256(normalizedText);
  const crlfHash = sha256(normalizedText.replace(/\n/g, '\r\n'));
  return rawHash === expectedHash || lfHash === expectedHash || crlfHash === expectedHash;
}

test('los archivos estables del motor fueron migrados byte por byte', () => {
  const expected = {
    'engine.js': '7cf556ccf0cadec588734cd6f615e2077f90d08405a2a196be90da2a17913a6c',
    'sustitucion.js': 'adecd395e3c15ef8fb6c86d0ede89a806814226c212081408914ede50530deaa',
    'dashboard.js': '5188e2ef90692ab997ee75893032b0920212223b82a7d3ba7c34a06e58f62ad0',
    'data/foods.json': '99b4e0a46777b60d0c8bff58c3480b888f29e69bb256a6a8f546dec0065dc74c',
    'data/dishes.json': '2d6301faf4f1b12f27eefdf8c09c0f5817cacbe684b9a80ef7245de937ecb273'
  };

  for (const [relativePath, expectedHash] of Object.entries(expected)) {
    assert.ok(
      matchesStableHash(path.join(root, 'lib', 'menu-engine', relativePath), expectedHash),
      relativePath
    );
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
