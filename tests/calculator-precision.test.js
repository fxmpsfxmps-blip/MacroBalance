const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const calculator = require('../js/calculator-core.js');
const engine = require('../lib/menu-engine/engine.js');

test('el bloque matemático de la Calculadora Estándar conserva el baseline P7', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'calculadora.js'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  // 1) BMR:');
  const end = source.indexOf('\n  planes.forEach', start);
  assert.ok(start >= 0 && end > start);
  const hash = crypto.createHash('sha256').update(source.slice(start, end)).digest('hex');
  assert.equal(hash, 'afed5aef1bc493035926b9bda0291df733d5018af25b25365766260e10ad6b74');
});

const cases = [
  { sex: 'M', age: 22, weightKg: 55, heightCm: 160, bodyFatPct: 24, activityFactor: 1.2, stepsPerDay: 3500 },
  { sex: 'H', age: 25, weightKg: 72, heightCm: 178, bodyFatPct: 15, activityFactor: 1.35, stepsPerDay: 8000 },
  { sex: 'M', age: 34, weightKg: 68, heightCm: 169, bodyFatPct: null, activityFactor: 1.35, stepsPerDay: null },
  { sex: 'H', age: 41, weightKg: 91, heightCm: 183, bodyFatPct: 22, activityFactor: 1.5, stepsPerDay: 12500 },
  { sex: 'M', age: 52, weightKg: 82, heightCm: 165, bodyFatPct: 35, activityFactor: 1.2, stepsPerDay: 6000 },
  { sex: 'H', age: 63, weightKg: 76, heightCm: 174, bodyFatPct: null, activityFactor: 1.35, stepsPerDay: 9000 }
];

function completeInput(input, index) {
  return {
    ...input,
    sleepHours: index % 2 ? 7.5 : 5.5,
    stressLevel: index % 3 ? 2 : 4,
    trainingType: index % 2 ? 'strength' : 'none',
    trainingIntensity: index % 3 === 0 ? 'high' : 'moderate',
    trainingDays: index % 2 ? 4 : 0,
    trainingMinutes: index % 2 ? 60 : 0,
    cardioType: index % 3 === 1 ? 'cycling' : 'walking',
    cardioDays: 2,
    cardioMinutes: 30,
    changeRate: index % 2 ? 'fast' : 'moderate'
  };
}

test('la matriz adulta produce objetivos deterministas y energéticamente coherentes', () => {
  cases.forEach((item, index) => {
    const input = completeInput(item, index);
    const first = calculator.calculatePrecisionTargets(input);
    const second = calculator.calculatePrecisionTargets(input);
    assert.deepEqual(first, second);
    assert.equal(first.plans.length, 3);
    assert.ok(first.tdeeKcal > first.bmr.kcal);

    for (const plan of first.plans) {
      assert.ok(plan.kcal > 0);
      assert.ok(plan.proteina > 0);
      assert.ok(plan.grasa > 0);
      assert.ok(plan.carbos >= 0);
      assert.equal(plan.nutritionTarget.schemaVersion, '2.1');
      assert.equal(plan.nutritionTarget.calculationMode, 'precision');
      assert.ok(Math.abs(plan.nutritionTarget.energyCheck.differenceKcal) <= 2);
      assert.deepEqual(plan.nutritionTarget.weeklyTarget.dailyTarget, {
        kcal: plan.kcal,
        proteina: plan.proteina,
        carbos: plan.carbos,
        grasa: plan.grasa
      });
    }
    assert.ok(first.plans[0].kcal < first.plans[1].kcal);
    assert.ok(first.plans[1].kcal < first.plans[2].kcal);
  });
});

test('más pasos o ejercicio elevan el TDEE sin doble conteo del MET de reposo', () => {
  const base = completeInput(cases[1], 1);
  const lowSteps = calculator.calculatePrecisionTargets({ ...base, stepsPerDay: 3000 });
  const highSteps = calculator.calculatePrecisionTargets({ ...base, stepsPerDay: 12000 });
  const noTraining = calculator.calculatePrecisionTargets({
    ...base, stepsPerDay: 3000,
    trainingType: 'none', trainingDays: 0, trainingMinutes: 0,
    cardioType: 'none', cardioDays: 0, cardioMinutes: 0
  });
  assert.ok(highSteps.tdeeKcal > lowSteps.tdeeKcal);
  assert.ok(lowSteps.tdeeKcal > noTraining.tdeeKcal);
  assert.ok(lowSteps.diagnostics.trainingKcal > 0);
});

test('recuperación limitada modera únicamente la velocidad solicitada', () => {
  const input = { ...completeInput(cases[3], 3), changeRate: 'fast', sleepHours: 5, stressLevel: 5 };
  const result = calculator.calculatePrecisionTargets(input);
  assert.equal(result.diagnostics.recovery.constrained, true);
  assert.equal(result.plans.find(plan => plan.id === 'deficit').method.goalRate, -0.15);
  assert.equal(result.plans.find(plan => plan.id === 'volumen').method.goalRate, 0.08);
});

test('el contrato estándar y el de precisión conservan las cuatro claves del engine', () => {
  const standard = calculator.createNutritionTarget({
    plan: { id: 'mantenimiento', kcal: 2100, proteina: 140, carbos: 245, grasa: 62 },
    calculationMode: 'standard',
    calculatorVersion: 'v1-2026-08',
    method: { bmrMethod: 'Mifflin-St Jeor' }
  });
  assert.deepEqual(
    { kcal: standard.kcal, proteina: standard.proteina, carbos: standard.carbos, grasa: standard.grasa },
    { kcal: 2100, proteina: 140, carbos: 245, grasa: 62 }
  );
  assert.equal(standard.calculationMode, 'standard');
  assert.equal(standard.weeklyTarget.strategy, 'uniform');
  assert.equal(standard.weeklyTarget.variableDays, null);
});

test('el engine P7 consume directamente un NutritionTarget de Precisión', () => {
  const precision = calculator.calculatePrecisionTargets(completeInput(cases[1], 1));
  const target = precision.plans.find(plan => plan.id === 'mantenimiento').nutritionTarget;
  const result = engine.generarMenuSemanal({
    objetivo: target,
    numeroComidas: 4,
    numDias: 1,
    numeroCandidatos: 2,
    usarSoloCarrito: false,
    alimentosSeleccionados: [],
    alimentosExcluidos: [],
    diasSinRepetir: 2,
    seed: 'v2-precision-engine-contract'
  });
  assert.equal(result.dias.length, 1);
  assert.ok(result.resultado_semanal.kcal > 0);
  assert.deepEqual(result.objetivo_diario_usuario, {
    kcal: target.kcal,
    proteina: target.proteina,
    carbos: target.carbos,
    grasa: target.grasa
  });
});
