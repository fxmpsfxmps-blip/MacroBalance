const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function fixturePlan() {
  return {
    menu_engine_version: 'menu-engine-fixture-v1',
    food_db_version: 'foods-fixture-v1',
    dashboard_dias_semana_1: [{
      dia_semana: 'Lunes',
      resumen_dia: { kcal: 2000, proteina: 120, carbos: 230, grasa: 65 },
      comidas: [{
        tiempo_comida: 'Desayuno',
        nombre: 'Avena con fruta',
        horario: '08:00',
        macros: { kcal: 500, p: 25, c: 70, g: 14 },
        ingredientes: [{ nombre: 'Avena', cantidad: 60, unidad: 'g' }],
        preparacion: ['Mezclar y servir.'],
      }],
    }],
    dashboard_dias_semana_2: [{
      dia_semana: 'Martes',
      resumen_dia: { kcal: 2000, proteina: 120, carbos: 230, grasa: 65 },
      comidas: [{
        tiempo_comida: 'Comida',
        nombre: 'Arroz con pollo',
        macros: { kcal: 650, p: 42, c: 75, g: 17 },
        ingredientes: [{ nombre: 'Arroz', cantidad: 80, unidad: 'g' }],
        preparacion: ['Cocinar hasta que esté listo.'],
      }],
    }],
    lista_compras_14_dias: {
      cereales: [{ nombre: 'Avena', cantidad: 420, unidad: 'g' }],
    },
  };
}

function fixtureGoal() {
  return {
    id: 'goal/export-safe-1',
    nutritionTarget: {
      kcal: 2000,
      proteina: 120,
      carbos: 230,
      grasa: 65,
      calculatorVersion: 'standard-v2',
      standardId: 'STANDARD',
      standardFreezeId: 'standard-freeze-v1',
    },
    inputSnapshot: { sex: 'male', age: 30, weightKg: 80, heightCm: 180, goal: 'MAINTENANCE' },
  };
}

function hydrationReference() {
  return {
    schemaVersion: 'hydration-reference-0.1',
    status: 'REFERENCE_ONLY',
    totalWaterReference: { valueLPerDay: 3.7, unit: 'L/day' },
    beverageWaterReference: null,
    plainWaterReference: null,
  };
}

async function modules() {
  const [snapshot, pdf, zip, pdfLib] = await Promise.all([
    import('../lib/export/plan-export-snapshot.mjs'),
    import('../lib/export/plan-pdf.mjs'),
    import('../lib/export/plan-zip.mjs'),
    import('pdf-lib'),
  ]);
  return { snapshot, pdf, zip, pdfLib, fflate: require('fflate') };
}

test('export snapshot is a read-only, serializable multi-day capture with optional hydration and partial micronutrients', async () => {
  const { snapshot } = await modules();
  const plan = fixturePlan();
  const goal = fixtureGoal();
  const before = JSON.stringify({ plan, goal });
  const output = snapshot.createPlanExportSnapshot({
    plan,
    currentGoal: goal,
    hydrationReference: hydrationReference(),
    micronutrientObservability: { status: 'PARTIAL', knownFields: ['fiber'], missingFields: ['calcium'] },
    exportedAt: '2026-08-30T12:00:00.000Z',
  });

  assert.equal(JSON.stringify({ plan, goal }), before);
  assert.equal(output.schemaVersion, 'dashboard-plan-export-v1');
  assert.equal(output.plan.dashboardDays.length, 2);
  assert.equal(output.hydrationReference.totalWaterReference.valueLPerDay, 3.7);
  assert.equal(output.micronutrientObservability.status, 'PARTIAL');
  assert.equal(snapshot.exportFilename(output, 'pdf'), 'macrobalance-plan-goal_export-safe-1.pdf');
  assert.equal(snapshot.exportFilename(output, 'zip'), 'macrobalance-plan-goal_export-safe-1.zip');
});

test('PDF export is parseable, carries a multi-day plan and does not require hydration or micronutrients', async () => {
  const { snapshot, pdf, pdfLib } = await modules();
  const output = snapshot.createPlanExportSnapshot({
    plan: fixturePlan(),
    currentGoal: fixtureGoal(),
    hydrationReference: null,
    micronutrientObservability: null,
    exportedAt: 0,
  });
  const bytes = await pdf.createPlanPdf(output, pdfLib);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString('ascii'), '%PDF');
  const parsed = await pdfLib.PDFDocument.load(bytes);
  assert.ok(parsed.getPageCount() >= 1);
  assert.equal(pdf.planPdfFilename(output), 'macrobalance-plan-goal_export-safe-1.pdf');
});

test('ZIP has the exact useful portable artifacts and preserves snapshot JSON', async () => {
  const { snapshot, pdf, zip, pdfLib, fflate } = await modules();
  const output = snapshot.createPlanExportSnapshot({
    plan: fixturePlan(), currentGoal: fixtureGoal(), hydrationReference: hydrationReference(), exportedAt: 0,
  });
  const pdfBytes = await pdf.createPlanPdf(output, pdfLib);
  const archive = zip.createPlanZip(output, pdfBytes, fflate);
  const files = fflate.unzipSync(archive);
  assert.deepEqual(Object.keys(files).sort(), ['plan.json', 'report.pdf', 'shopping-list.json']);
  assert.match(fflate.strFromU8(files['plan.json']), /dashboard-plan-export-v1/);
  assert.match(fflate.strFromU8(files['shopping-list.json']), /Avena/);
  assert.equal(Buffer.from(files['report.pdf'].slice(0, 4)).toString('ascii'), '%PDF');
  assert.equal(zip.planZipFilename(output), 'macrobalance-plan-goal_export-safe-1.zip');
});

test('export rejects non-finite source data rather than serializing a fabricated value', async () => {
  const { snapshot } = await modules();
  const plan = fixturePlan();
  plan.dashboard_dias_semana_1[0].resumen_dia.kcal = Infinity;
  assert.throws(() => snapshot.createPlanExportSnapshot({ plan, currentGoal: fixtureGoal() }), /PLAN_EXPORT_NON_FINITE/);
});

test('Dashboard export stays source-only: UI loads local renderers and never imports calculator or menu engine', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'plan-export.js'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-static.js'), 'utf8');
  assert.match(source, /lib\/export\/plan-export-snapshot\.mjs/);
  assert.match(source, /vendor\/pdf-lib\.esm\.min\.js/);
  assert.match(source, /vendor\/fflate\.esm\.js/);
  assert.doesNotMatch(source, /engine\.js|calculator-core|calculateStandard|generarMenu/);
  assert.match(menu, /MacroBalancePlanExportSource/);
  assert.match(html, /id="export-plan-pdf"/);
  assert.match(html, /id="export-plan-zip"/);
  assert.match(build, /pdf-lib\.esm\.min\.js/);
  assert.match(build, /fflate\.esm\.js/);
});
