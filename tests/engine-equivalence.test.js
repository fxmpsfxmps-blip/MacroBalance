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

test('el motor y los datos controlados conservan su baseline autorizado', () => {
  const expected = {
    'engine.js': '7cf556ccf0cadec588734cd6f615e2077f90d08405a2a196be90da2a17913a6c',
    'sustitucion.js': 'b65bde964c9e30172a5478772c7f7813b06e6fe3414670600bbc2924f144514a',
    'dashboard.js': '5188e2ef90692ab997ee75893032b0920212223b82a7d3ba7c34a06e58f62ad0',
    'data/foods.json': '6243bccd5b4780bf322b02aac246f6c17a446360abd561a4929eeb54ce2a7b8b',
    // Baseline autorizado por la migracion controlada de dishes V2.2.
    'data/dishes.json': 'c735d4e4dcb662333bef65be7e2adba15f768b7f6f006ca7507b168885cb0728'
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
    '1e0adb6e8f3012681c07324fa3aa39847846bb6f1ebdf8e73f5fe76fbbebe9f8'
  );
  assert.equal(result.dias.length, 7);
  assert.equal(result.dias_no_factibles, 0);
  assert.deepEqual(result.resultado_semanal, {
    kcal: 12585,
    proteina: 886,
    carbos: 1334,
    grasa: 419
  });
});
