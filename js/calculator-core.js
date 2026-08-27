(function exposeCalculatorCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MacroBalanceCalculator = api;
})(typeof window !== 'undefined' ? window : globalThis, function calculatorCoreFactory() {
  'use strict';

  const TARGET_SCHEMA_VERSION = '2.1';
  const PRECISION_VERSION = 'v2.1-precision-2026-08';

  const TRAINING_MET = Object.freeze({
    none: 1,
    strength: 5,
    hypertrophy: 6,
    mixed: 7,
    intervals: 8,
    endurance: 8
  });

  const CARDIO_MET = Object.freeze({
    none: 1,
    walking: 3.5,
    cycling: 6.8,
    elliptical: 5,
    rowing: 7,
    running: 8.3
  });

  const INTENSITY_FACTOR = Object.freeze({ low: 0.85, moderate: 1, high: 1.15 });

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function estimateBmr(input) {
    const weightKg = finiteNumber(input.weightKg, NaN);
    const heightCm = finiteNumber(input.heightCm, NaN);
    const age = finiteNumber(input.age, NaN);
    const bodyFatPct = finiteNumber(input.bodyFatPct, NaN);

    if (![weightKg, heightCm, age].every(Number.isFinite)) {
      throw new TypeError('Peso, altura y edad deben ser números finitos.');
    }
    if (weightKg <= 0 || heightCm <= 0 || age < 18 || age > 100) {
      throw new RangeError('Los datos antropométricos están fuera del rango adulto admitido.');
    }

    if (Number.isFinite(bodyFatPct) && bodyFatPct > 3 && bodyFatPct < 60) {
      const leanMassKg = weightKg * (1 - bodyFatPct / 100);
      return {
        kcal: 370 + 21.6 * leanMassKg,
        method: 'Katch-McArdle',
        leanMassKg
      };
    }

    const sexConstant = input.sex === 'H' ? 5 : -161;
    return {
      kcal: 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant,
      method: 'Mifflin-St Jeor',
      leanMassKg: null
    };
  }

  function movementFactor(input) {
    const steps = finiteNumber(input.stepsPerDay, NaN);
    if (!Number.isFinite(steps) || steps <= 0) {
      return clamp(finiteNumber(input.activityFactor, 1.2), 1.2, 1.6);
    }

    const normalizedSteps = clamp(steps, 0, 15000);
    if (normalizedSteps <= 3000) return 1.2;
    if (normalizedSteps <= 6000) return 1.2 + ((normalizedSteps - 3000) / 3000) * 0.1;
    if (normalizedSteps <= 9000) return 1.3 + ((normalizedSteps - 6000) / 3000) * 0.1;
    if (normalizedSteps <= 12000) return 1.4 + ((normalizedSteps - 9000) / 3000) * 0.1;
    return 1.5 + ((normalizedSteps - 12000) / 3000) * 0.1;
  }

  function netExerciseKcalPerDay(weightKg, met, minutes, daysPerWeek, intensityFactor) {
    const netMet = Math.max(0, met * intensityFactor - 1);
    const sessionKcal = netMet * 3.5 * weightKg / 200 * minutes;
    return sessionKcal * daysPerWeek / 7;
  }

  function recoveryConstraint(input) {
    const sleepHours = finiteNumber(input.sleepHours, NaN);
    const stressLevel = finiteNumber(input.stressLevel, NaN);
    const constrained = (Number.isFinite(sleepHours) && sleepHours < 6) ||
      (Number.isFinite(stressLevel) && stressLevel >= 4);
    return {
      constrained,
      reason: constrained ? 'Recuperación limitada: se moderó la velocidad del cambio.' : null
    };
  }

  function rateForGoal(goalId, requestedRate, recovery) {
    const rate = ['slow', 'moderate', 'fast'].includes(requestedRate) ? requestedRate : 'moderate';
    const rates = {
      deficit: { slow: -0.10, moderate: -0.15, fast: -0.20 },
      mantenimiento: { slow: 0, moderate: 0, fast: 0 },
      volumen: { slow: 0.05, moderate: 0.08, fast: 0.10 }
    };
    let selected = rates[goalId][rate];
    if (recovery.constrained && selected < -0.15) selected = -0.15;
    if (recovery.constrained && selected > 0.08) selected = 0.08;
    return selected;
  }

  function macroAllocation(input, goalId, targetKcal, leanMassKg) {
    const weightKg = finiteNumber(input.weightKg, NaN);
    const trains = input.trainingType && input.trainingType !== 'none' && finiteNumber(input.trainingDays, 0) > 0;
    const proteinFactor = leanMassKg
      ? ({ deficit: 2.4, mantenimiento: 2.0, volumen: 2.2 })[goalId]
      : (trains
        ? ({ deficit: 2.0, mantenimiento: 1.8, volumen: 1.8 })[goalId]
        : ({ deficit: 1.8, mantenimiento: 1.6, volumen: 1.8 })[goalId]);
    const proteinBasisKg = leanMassKg || weightKg;
    const rawProtein = proteinBasisKg * proteinFactor;
    const protein = Math.round(Math.min(rawProtein, targetKcal * 0.35 / 4));

    const rawFat = Math.max(weightKg * 0.7, targetKcal * 0.20 / 9);
    const fat = Math.round(Math.min(rawFat, targetKcal * 0.35 / 9));
    const carbohydrate = Math.max(0, Math.round((targetKcal - protein * 4 - fat * 9) / 4));
    const macroKcal = protein * 4 + carbohydrate * 4 + fat * 9;

    return {
      protein,
      carbohydrate,
      fat,
      macroKcal,
      differenceKcal: macroKcal - targetKcal,
      rules: {
        proteinFactor,
        proteinBasis: leanMassKg ? 'lean-mass' : 'body-weight',
        fatFloor: 'max(0.7 g/kg, 20% kcal)',
        carbohydrate: 'remaining-energy'
      }
    };
  }

  function createNutritionTarget(options) {
    const plan = options.plan;
    if (!plan || !['kcal', 'proteina', 'carbos', 'grasa'].every(key => Number.isFinite(Number(plan[key])))) {
      throw new TypeError('El plan no contiene un objetivo nutricional válido.');
    }
    const kcal = Math.round(Number(plan.kcal));
    const proteina = Math.round(Number(plan.proteina));
    const carbos = Math.round(Number(plan.carbos));
    const grasa = Math.round(Number(plan.grasa));
    const macroKcal = proteina * 4 + carbos * 4 + grasa * 9;
    const calculationMode = options.calculationMode === 'precision' ? 'precision' : 'standard';

    return {
      schemaVersion: TARGET_SCHEMA_VERSION,
      calculationMode,
      calculatorVersion: options.calculatorVersion || (calculationMode === 'precision' ? PRECISION_VERSION : 'v1-2026-08'),
      goalType: plan.id || options.goalType || 'mantenimiento',
      kcal,
      proteina,
      carbos,
      grasa,
      energyCheck: {
        macroKcal,
        differenceKcal: macroKcal - kcal
      },
      method: options.method || plan.method || null,
      weeklyTarget: {
        strategy: 'uniform',
        dailyTarget: { kcal, proteina, carbos, grasa },
        variableDays: null
      }
    };
  }

  function calculatePrecisionTargets(rawInput) {
    const input = { ...rawInput };
    const weightKg = finiteNumber(input.weightKg, NaN);
    const bmr = estimateBmr(input);
    const activityFactor = movementFactor(input);
    const trainingType = TRAINING_MET[input.trainingType] ? input.trainingType : 'none';
    const cardioType = CARDIO_MET[input.cardioType] ? input.cardioType : 'none';
    const intensity = INTENSITY_FACTOR[input.trainingIntensity] || 1;
    const trainingDays = clamp(finiteNumber(input.trainingDays, 0), 0, 7);
    const trainingMinutes = clamp(finiteNumber(input.trainingMinutes, 0), 0, 240);
    const cardioDays = clamp(finiteNumber(input.cardioDays, 0), 0, 7);
    const cardioMinutes = clamp(finiteNumber(input.cardioMinutes, 0), 0, 240);

    const trainingKcal = netExerciseKcalPerDay(
      weightKg,
      TRAINING_MET[trainingType],
      trainingMinutes,
      trainingDays,
      intensity
    );
    const cardioKcal = netExerciseKcalPerDay(
      weightKg,
      CARDIO_MET[cardioType],
      cardioMinutes,
      cardioDays,
      1
    );
    const nonExerciseKcal = bmr.kcal * activityFactor;
    const preTefKcal = nonExerciseKcal + trainingKcal + cardioKcal;
    const tefKcal = preTefKcal * 0.10;
    const tdeeKcal = preTefKcal + tefKcal;
    const recovery = recoveryConstraint(input);

    const definitions = [
      { id: 'deficit', nombre: 'Déficit', icon: 'down', cardio: 'Según configuración' },
      { id: 'mantenimiento', nombre: 'Mantenimiento', icon: 'equal', cardio: 'Según configuración' },
      { id: 'volumen', nombre: 'Volumen', icon: 'up', cardio: 'Según configuración' }
    ];

    const plans = definitions.map(definition => {
      const rate = rateForGoal(definition.id, input.changeRate, recovery);
      const minimumKcal = Math.round(bmr.kcal * 1.05);
      const targetKcal = Math.max(minimumKcal, Math.round(tdeeKcal * (1 + rate)));
      const macros = macroAllocation(input, definition.id, targetKcal, bmr.leanMassKg);
      const method = {
        bmrMethod: bmr.method,
        bmrKcal: Math.round(bmr.kcal),
        leanMassKg: bmr.leanMassKg === null ? null : Number(bmr.leanMassKg.toFixed(2)),
        movementFactor: Number(activityFactor.toFixed(3)),
        trainingKcalPerDay: Math.round(trainingKcal),
        cardioKcalPerDay: Math.round(cardioKcal),
        tefKcalPerDay: Math.round(tefKcal),
        estimatedTdeeKcal: Math.round(tdeeKcal),
        goalRate: rate,
        recoveryConstraint: recovery
      };
      const plan = {
        ...definition,
        kcal: targetKcal,
        proteina: macros.protein,
        carbos: macros.carbohydrate,
        grasa: macros.fat,
        method,
        macroRules: macros.rules
      };
      plan.nutritionTarget = createNutritionTarget({
        plan,
        calculationMode: 'precision',
        calculatorVersion: PRECISION_VERSION,
        method
      });
      return plan;
    });

    return {
      calculatorVersion: PRECISION_VERSION,
      bmr,
      tdeeKcal,
      plans,
      diagnostics: {
        activityFactor,
        nonExerciseKcal,
        trainingKcal,
        cardioKcal,
        tefKcal,
        recovery
      }
    };
  }

  return {
    TARGET_SCHEMA_VERSION,
    PRECISION_VERSION,
    TRAINING_MET,
    CARDIO_MET,
    estimateBmr,
    movementFactor,
    createNutritionTarget,
    calculatePrecisionTargets
  };
});
