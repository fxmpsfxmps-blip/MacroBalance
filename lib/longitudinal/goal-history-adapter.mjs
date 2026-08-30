import { createNutritionTargetSnapshot, sortObservations } from './longitudinal-core.mjs';

/**
 * Existing goals_history is the current authoritative Standard target history.
 * This adapter reads it as V3-compatible snapshots instead of duplicating all
 * existing target data into a parallel collection.
 */
export function adaptGoalHistoryToTargetSnapshots({ ownerId, goals = [] }) {
  const observations = [];
  for (const goal of goals) {
    const target = goal?.nutritionTarget;
    if (!target) continue;
    const observedAt = goal.startDate?.toMillis ? goal.startDate.toMillis()
      : goal.createdAt?.toMillis ? goal.createdAt.toMillis()
        : goal.createdAtMs ?? goal.startDateMs;
    if (observedAt == null) continue;
    observations.push(createNutritionTargetSnapshot({
      id: `goal_${goal.id}`,
      ownerId,
      observedAt,
      sourceGoalId: goal.id,
      standard: {
        id: target.standardId,
        version: target.calculatorVersion,
        freezeId: target.standardFreezeId,
        policyVersion: target.proteinPolicyVersion || null,
      },
      nutritionTarget: target,
      inputSnapshot: goal.inputSnapshot || {},
    }));
  }
  return Object.freeze(sortObservations(observations, 'desc'));
}
