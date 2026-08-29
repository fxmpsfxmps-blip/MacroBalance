const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const engine = require('../lib/menu-engine/engine.js');

async function adapter() {
  return import('../lib/standard/patch3-standard-adapter.mjs');
}

function profile(overrides = {}) {
  return {
    profileId: 'promotion-test', sex: 'MALE', age: 35, heightCm: 180, weightKg: 100,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN',
    goal: 'MAINTENANCE', occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9,
    stepsObservationDays: 7, trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE',
    sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [],
    sleepHours: null, stressLevel: null, requestedRatePerWeek: null, ...overrides
  };
}

test('PATCH3 Standard produces one finite compatibility target for the selected goal', async () => {
  const { calculatePatch3Standard, ACTIVE_STANDARD_ID, ACTIVE_STANDARD_VERSION, ACTIVE_STANDARD_FREEZE_ID } = await adapter();
  const result = calculatePatch3Standard(profile());
  assert.equal(result.status, 'COMPATIBILITY_TARGETS_READY');
  assert.equal(result.activeStandardId, ACTIVE_STANDARD_ID);
  assert.equal(result.activeStandardVersion, ACTIVE_STANDARD_VERSION);
  assert.equal(result.activeStandardFreezeId, ACTIVE_STANDARD_FREEZE_ID);
  assert.deepEqual(result.plans.map(plan => plan.id), ['mantenimiento']);
  const plan = result.plans[0];
  for (const key of ['kcal', 'proteina', 'carbos', 'grasa']) assert.ok(Number.isFinite(plan[key]) && plan[key] >= 0);
  assert.equal(plan.nutritionTarget.standardId, ACTIVE_STANDARD_ID);
  assert.equal(plan.nutritionTarget.standardFreezeId, ACTIVE_STANDARD_FREEZE_ID);
  assert.equal(plan.nutritionTarget.method.selectedPointIsCompatibilityOnly, true);
  assert.ok(Math.abs(plan.nutritionTarget.energyCheck.differenceKcal) <= 10);
});

test('explicit NONE and unknown training remain distinct in the active input contract', async () => {
  const { calculatePatch3Standard } = await adapter();
  const none = calculatePatch3Standard(profile({ trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW' }));
  const unknown = calculatePatch3Standard(profile({ trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null }));
  const noneOutput = none.candidateOutputs.find(item => item.goal === 'MAINTENANCE').output;
  const unknownOutput = unknown.candidateOutputs.find(item => item.goal === 'MAINTENANCE').output;
  assert.equal(noneOutput.inputProvenance.trainingInputState, 'CONFIRMED_NONE');
  assert.equal(unknownOutput.inputProvenance.trainingInputState, 'PARTIAL_OR_UNKNOWN_TRAINING');
});

test('steps are conditional: maintenance can resolve without them, loss requests evidence', async () => {
  const { calculatePatch3Standard } = await adapter();
  const noSteps = profile({ steps: null, stepsCoverage: null, stepsObservationDays: null });
  const maintenance = calculatePatch3Standard(noSteps);
  assert.equal(maintenance.status, 'COMPATIBILITY_TARGETS_READY');
  assert.equal(maintenance.plans[0].id, 'mantenimiento');
  const loss = calculatePatch3Standard({ ...noSteps, goal: 'LOSS' });
  assert.equal(loss.status, 'PARTIAL_WITH_UNAVAILABLE_PLAN');
  assert.equal(loss.plans[0].unavailable, true);
});

test('compatibility target reaches the unchanged menu engine contract', async () => {
  const { calculatePatch3Standard } = await adapter();
  const target = calculatePatch3Standard(profile()).plans[0].nutritionTarget;
  const result = engine.generarMenuSemanal({
    objetivo: target, numeroComidas: 4, numDias: 1, numeroCandidatos: 2,
    usarSoloCarrito: false, alimentosSeleccionados: [], alimentosExcluidos: [],
    diasSinRepetir: 2, seed: 'patch3-standard-promotion'
  });
  assert.equal(result.dias.length, 1);
  assert.deepEqual(result.objetivo_diario_usuario, {
    kcal: target.kcal, proteina: target.proteina, carbos: target.carbos, grasa: target.grasa
  });
});

test('active calculator path calls PATCH3 and keeps legacy block only as rollback', () => {
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(calculator, /STANDARD_PROMOTION_ENABLED = true/);
  assert.match(calculator, /calcularStandardPatch3/);
  assert.match(calculator, /MacroBalancePatch3Standard/);
  assert.match(html, /id="standard-training-type"/);
  assert.match(html, /id="standard-steps"/);
  assert.match(html, /id="standard-steps-coverage"/);
  assert.match(html, /id="standard-observation-days"/);
  assert.match(html, /patch3-standard-adapter\.js/);
});

test('build configuration publishes only the adapter and frozen PATCH3 snapshot for browser execution', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-static.js'), 'utf8');
  assert.match(build, /lib', 'standard'/);
  assert.match(build, /lib', 'shadow', 'frozen-patch3'/);
});
