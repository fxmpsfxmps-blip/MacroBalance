import { getSolverParameterSet, SOLVER_PARAMETER_REGISTRY_VERSION } from '../config/solverParameterRegistry.js';
import { solveConstraintEnvelope } from '../core/constraintSolverLab.js';
import { deepFreeze } from '../core/inputScope.js';

export function runSolverEnvelopeLab(problem, options = {}) {
  const parameterSet = getSolverParameterSet(options.parameterSetId || 'LAB_SOLVER_E02');
  const result = solveConstraintEnvelope(problem, parameterSet);
  return deepFreeze({
    ...result,
    registryVersion: SOLVER_PARAMETER_REGISTRY_VERSION,
    comparatorPreserved: 'core/macros.js::solveMacros',
    connectedToScientificPipeline: false,
    connectedToProduction: false
  });
}
