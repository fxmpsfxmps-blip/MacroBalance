const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

async function hydration() {
  return import('../lib/hydration/hydration-reference.mjs');
}

function profile(overrides = {}) {
  return {
    sex: 'MALE', age: 35, weightKg: 100, heightCm: 180, steps: 7000,
    trainingModality: 'RESISTANCE', sessionsPerWeek: 4, sessionDurationMin: 60, workload: 'MODERATE',
    ...overrides,
  };
}

test('NASEM adult total-water reference is versioned, finite, and explicitly not a plain-water target', async () => {
  const model = await hydration();
  const male = model.buildHydrationReference(profile());
  const female = model.buildHydrationReference(profile({ sex: 'FEMALE' }));
  assert.equal(male.schemaVersion, model.HYDRATION_REFERENCE_SCHEMA_VERSION);
  assert.equal(male.status, 'REFERENCE_ONLY');
  assert.equal(male.totalWaterReference.valueLPerDay, 3.7);
  assert.equal(female.totalWaterReference.valueLPerDay, 2.7);
  assert.equal(male.totalWaterReference.semantics, 'TOTAL_WATER_FROM_FOODS_AND_BEVERAGES');
  assert.equal(male.beverageWaterReference, null);
  assert.equal(male.plainWaterReference, null);
  assert.equal(male.currentIntake, null);
  assert.equal(male.intakeGap, null);
  assert.equal(male.exerciseAdjustment.state, 'NOT_ESTIMATED');
  assert.doesNotThrow(() => model.assertHydrationReference(male));
});

test('only adult sex selects the reference; body size, energy proxies, steps, and training never change its liters', async () => {
  const model = await hydration();
  const baseline = model.buildHydrationReference(profile());
  for (const override of [
    { weightKg: 45, heightCm: 150, steps: 0, sessionsPerWeek: 0, sessionDurationMin: 0, trainingModality: 'NONE' },
    { weightKg: 160, heightCm: 200, steps: 30000, sessionsPerWeek: 7, sessionDurationMin: 180, trainingModality: 'RUNNING', workload: 'HIGH' },
    { teeKcal: 4500, targetKcal: 1800, energyKcal: 3200 },
  ]) {
    const comparison = model.buildHydrationReference(profile(override));
    assert.equal(comparison.totalWaterReference.valueLPerDay, baseline.totalWaterReference.valueLPerDay);
  }
  assert.ok(baseline.contextFlags.includes('TRAINING_CONTEXT_PRESENT_NO_AUTOMATIC_FLUID_ADJUSTMENT'));
});

test('missing sex and non-adult age remain NOT_ASSESSABLE instead of fabricating a value', async () => {
  const model = await hydration();
  assert.equal(model.buildHydrationReference(profile({ sex: null })).status, 'NOT_ASSESSABLE');
  assert.equal(model.buildHydrationReference(profile({ age: 18 })).status, 'NOT_ASSESSABLE');
});

test('hydration bridge has no dependency on legacy 35 ml/kg, cardio, or malformed-intake-as-zero logic', () => {
  const source = fs.readFileSync(path.join(root, 'lib', 'hydration', 'hydration-reference.mjs'), 'utf8');
  const bridge = fs.readFileSync(path.join(root, 'js', 'hydration-reference-bridge.js'), 'utf8');
  assert.doesNotMatch(source, /0\.035|interpretarAgua|calculatePrecisionTargets|gastoCardio/i);
  assert.match(bridge, /buildHydrationReference/);
  assert.match(source, /TOTAL_WATER_FROM_FOODS_AND_BEVERAGES/);
});

test('Standard target is unchanged while the Calculator and Dashboard pass a separate hydration payload through', async () => {
  const adapter = await import('../lib/standard/patch3-standard-adapter.mjs');
  const before = adapter.calculatePatch3Standard({
    profileId: 'hydration-invariance', sex: 'MALE', age: 35, heightCm: 180, weightKg: 100,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN', goal: 'MAINTENANCE',
    occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9, stepsObservationDays: 7,
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE', sessionsPerWeek: 4,
    sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [], sleepHours: null, stressLevel: null, requestedRatePerWeek: null,
  });
  const after = adapter.calculatePatch3Standard({
    profileId: 'hydration-invariance', sex: 'MALE', age: 35, heightCm: 180, weightKg: 100,
    bodyFatPercent: null, bodyFatSource: 'UNKNOWN', bodyFatQuality: 'UNKNOWN', goal: 'MAINTENANCE',
    occupation: 'SEATED', steps: 7000, stepsCoverage: 0.9, stepsObservationDays: 7,
    trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'RESISTANCE', sessionsPerWeek: 4,
    sessionDurationMin: 60, workload: 'MODERATE', scopeFlags: [], sleepHours: null, stressLevel: null, requestedRatePerWeek: null,
  });
  assert.deepEqual(after.plans[0].nutritionTarget, before.plans[0].nutritionTarget);
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');
  assert.match(calculator, /MacroBalanceHydration/);
  assert.match(calculator, /hydrationReference/);
  assert.match(dashboard, /currentGoal\?\.hydrationReference/);
  assert.match(firebase, /hydrationReference: hydrationReference \|\| null/);
  assert.doesNotMatch(dashboard, /0\.035|interpretarAgua|ml\/kg/i);
});
