import { deepFreeze } from '../core/inputScope.js';

export const GUARDRAIL_PARAMETER_REGISTRY_VERSION = 'a9-lab-registry-0.2.0';

const LAB_GUARDRAIL_E02 = deepFreeze({
  id: 'LAB_GUARDRAIL_E02',
  modelVersion: 'a9-hybrid-routing-governor-0.2.0',
  policyVersion: 'a9-open-operational-policy-0.2.0',
  status: 'EXPERIMENTAL_DIAGNOSTIC_POLICY',
  source: 'MB-03/MB-11/MB-12/MB-13/MB-24/MB-25/MB-26/MB-27/MB-31-MB-36; Prompt 11 closure attack',
  productionEligible: false,
  connectedToScientificPipeline: false,
  connectedToProduction: false,
  values: {
    A9: {
      architecture: 'HYBRID_ROUTING_GOVERNOR',
      universalBiologicalFloorKcal: null,
      sexSpecificBiologicalFloorsKcal: null,
      rmrHardFloor: false,
      absoluteRouting: {
        veryLowEnergyUpperExclusiveKcal: 800,
        lowEnergyLowerInclusiveKcal: 800,
        lowEnergyUpperExclusiveKcal: 1200,
        semantics: 'PRODUCT_AND_SPECIALIST_SERVICE_ROUTING_NOT_BIOLOGICAL_CLIFF'
      },
      lowEnergyAutonomousAction: null,
      relativeAggressivenessThresholds: null,
      supportedRateThresholds: null,
      targetRmrWarningSeverity: null,
      athleteEnergyAvailabilityDiagnosticThreshold: null,
      olderAdultLowEnergyThreshold: null,
      glp1LowIntakeThreshold: null,
      micronutrientClearanceThreshold: null,
      longitudinalHysteresisBand: null,
      protectedFeasibilitySemantic: 'MATHEMATICAL_THRESHOLD_FOR_CURRENT_CONSTRAINT_SET_NOT_BIOLOGICAL_FLOOR',
      noSilentClamp: true,
      scopeFirst: true,
      postSolverRecheckRequired: true,
      standardMayExecuteSpecialistTarget: false
    }
  }
});

export const guardrailParameterSets = deepFreeze({ LAB_GUARDRAIL_E02 });

export function getGuardrailParameterSet(id = 'LAB_GUARDRAIL_E02') {
  const parameterSet = guardrailParameterSets[id];
  if (!parameterSet) throw new RangeError(`Unknown guardrail parameter set: ${id}`);
  return parameterSet;
}
