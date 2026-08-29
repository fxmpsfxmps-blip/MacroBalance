import { deepFreeze } from '../core/inputScope.js';

export const SOLVER_PARAMETER_REGISTRY_VERSION = 'a8-lab-registry-0.2.0';

const LAB_SOLVER_E02 = deepFreeze({
  id: 'LAB_SOLVER_E02',
  modelVersion: 'a8-hierarchical-feasibility-envelope-0.2.0',
  parameterVersion: 'a8-operational-policy-open-0.2.0',
  status: 'EXPERIMENTAL_PARAMETER',
  source: 'MB-24/MB-25/MB-26; Prompt 10 synthetic closure attack',
  productionEligible: false,
  values: {
    A8: {
      hierarchy: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'],
      solvingPolicy: 'DETERMINISTIC_HIERARCHICAL_FEASIBILITY_ENVELOPE',
      pointSelectionPolicy: 'NO_POINT_UNLESS_REGION_IS_UNIQUE_OR_POINT_IS_EXPLICIT',
      sameLevelConflictPolicy: 'REPORT_REQUIRES_POLICY_WITHOUT_HIDDEN_ORDERING',
      duplicatePolicy: 'LATEST_VERSION_WINS_ONLY_WITH_EXPLICIT_VERSION_AND_FULL_AUDIT',
      confidencePolicy: 'AUDIT_AND_UNCERTAINTY_ONLY_NOT_PRIORITY',
      backtrackTerminationPolicy: 'REPEATED_STATE_SIGNATURE_IS_TERMINAL',
      internalNumerics: 'SCALE_AWARE_FLOATING_POINT_COMPARISON',
      accountingToleranceKcal: null,
      physiologicalMatchTolerance: null,
      displayRoundingIncrementGrams: null,
      displayEnergyToleranceKcal: null,
      selectedPointTieBreak: null
    }
  }
});

export const solverParameterSets = deepFreeze({ LAB_SOLVER_E02 });

export function getSolverParameterSet(id = 'LAB_SOLVER_E02') {
  const parameterSet = solverParameterSets[id];
  if (!parameterSet) throw new RangeError(`Unknown solver parameter set: ${id}`);
  return parameterSet;
}
