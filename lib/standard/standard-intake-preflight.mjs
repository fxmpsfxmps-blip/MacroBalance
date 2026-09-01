import { classifyTrainingInput } from '../shadow/frozen-patch3/core/inputScope.js';
import { normalizeStepRepresentativeness } from './activity-input-policy-r1.mjs';

const DIRECTIONAL_GOALS = new Set(['LOSS', 'GAIN', 'MUSCLE_GAIN']);

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function issue(code, message) {
  return Object.freeze({ code, message });
}

/**
 * Shared product-intake preflight. It is intentionally narrower than the
 * scientific evaluator: it protects the active form from incomplete evidence
 * but never changes the evaluator's permissive range/context behavior.
 */
export function validateStandardIntakePreflight({ goal, occupation, steps, stepsRepresentativeness, stepsCoverage, stepsObservationDays, training, trainingSelection } = {}) {
  const issues = [];
  if (!['LOSS', 'MAINTENANCE', 'GAIN', 'MUSCLE_GAIN'].includes(goal)) {
    issues.push(issue('GOAL_REQUIRED', 'Selecciona tu objetivo para continuar.'));
  }
  if (!['SEATED', 'STANDING_WALKING', 'PHYSICAL'].includes(occupation)) {
    issues.push(issue('MOVEMENT_REQUIRED', 'Selecciona tu movimiento diario para continuar.'));
  }

  const observedSteps = finiteOrNull(steps);
  const hasSteps = observedSteps !== null && observedSteps >= 0;
  const representativeness = normalizeStepRepresentativeness({ stepsRepresentativeness, stepsCoverage });
  if (hasSteps && (!representativeness.valid || finiteOrNull(stepsObservationDays) === null || stepsObservationDays < 1)) {
    issues.push(issue('STEP_OBSERVABILITY_REQUIRED', 'Indica qué tan representativos son esos pasos y cuántos días observaste.'));
  }
  if (!hasSteps && DIRECTIONAL_GOALS.has(goal)) {
    issues.push(issue('STEPS_REQUIRED_FOR_DIRECTIONAL_GOAL', 'Para pérdida o ganancia necesitamos pasos aproximados, o elige Mantenimiento.'));
  }

  const trainingInput = classifyTrainingInput(training || {});
  if (trainingSelection === 'YES' && trainingInput.state !== 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING') {
    issues.push(issue('REALIZED_TRAINING_DETAILS_REQUIRED', 'Necesitamos un poco más de información sobre tu entrenamiento.'));
  }

  return Object.freeze({
    valid: issues.length === 0,
    issues: Object.freeze(issues),
    trainingInput,
    stepsRepresentativeness: representativeness.state,
    activityInputPolicy: Object.freeze({ inputSource: representativeness.source })
  });
}
