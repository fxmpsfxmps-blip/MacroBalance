import { deepFreeze } from '../core/inputScope.js';

export const CHALLENGER_VERSION = 'SCIENTIFIC_CHALLENGER_V1_B4_SHADOW_PATCH3';
export const CHALLENGER_FREEZE_REGISTRY_VERSION = 'challenger-freeze-registry-0.5.3';
export const CANDIDATE_FREEZE_ID = 'MB_CANDIDATE_V1_PATCH3_L005_INPUT_CONTRACT_STABILIZATION_2026-08-28';
export const PARENT_CANDIDATE_FREEZE_ID = 'MB_CANDIDATE_V1_PATCH2_EXTERNAL_REVIEW_FREEZE_2026-08-28';

const moduleEntry = (id, modelVersion, parameterVersion, scientificStatus, openParameters, dependencies) => ({
  id,
  modelVersion,
  parameterVersion,
  scientificStatus,
  productionEligibility: 'SHADOW_ONLY_NOT_PRODUCTION_ELIGIBLE',
  knownOpenParameters: openParameters,
  dependencies
});

export const challengerFreezeRegistry = deepFreeze({
  id: CHALLENGER_VERSION,
  candidateFreezeId: CANDIDATE_FREEZE_ID,
  parentCandidateFreezeId: PARENT_CANDIDATE_FREEZE_ID,
  registryVersion: CHALLENGER_FREEZE_REGISTRY_VERSION,
  frozenAt: '2026-08-28',
  mutationPolicy: 'IMMUTABLE_PROVENANCE_REGISTRY',
  globalOpenParameterPolicy: 'NULL_REMAINS_NULL_UNKNOWN_REMAINS_UNKNOWN',
  productionEligibility: 'SHADOW_ONLY',
  patchScope: 'L005_INPUT_CONTRACT_TRAINING_TUPLE_COHERENCE_ONLY',
  targetContract: {
    id: 'SCIENTIFIC_TARGET_CONTRACT_V1',
    modelVersion: 'b4-target-contract-0.1.2',
    scientificStatus: 'B4_ORTHOGONAL_RESOLUTION_REGION_SELECTION_ROUTING_CONTRACT_CLOSED',
    selectionPolicy: 'NO_POINT_REQUIRED_REGION_NATIVE_DOWNSTREAM_SELECTION_EXPLICITLY_AUTHORIZED',
    productionEligibility: 'SHADOW_ONLY_NOT_PRODUCTION_ELIGIBLE'
  },
  modules: {
    A1: moduleEntry('A1', 'a1-evidence-envelope-lab-0.1.1', 'LAB_E01:A1',
      'FROZEN_DIRECTION_WITH_UNVALIDATED_HEURISTIC_CLASSIFIER',
      ['calibrated activity classifier', 'class probability calibration', 'OOD boundary calibration'],
      ['adult profile', 'occupation', 'observed steps and coverage', 'realized training']),
    A2_A3: moduleEntry('A2/A3', 'rate-energy-envelope-0.2.0', 'LAB_RATE_ENERGY_E02',
      'FROZEN_FOR_CANDIDATE_V1_WITH_EXPLICIT_HEURISTICS',
      ['population calibration of preferred loss rate', 'gain refinement by verified training experience', 'longitudinal recalibration'],
      ['A1 TEE envelope', 'goal', 'requested rate if supplied']),
    A4_A5: moduleEntry('A4/A5', 'protein-executable-envelope-0.3.0', 'LAB_PROTEIN_E03',
      'B2_FROZEN_FOR_CANDIDATE_V1_EXECUTABLE_RANGE_NO_POINT',
      ['BMI30 cap outcome validation', 'high-muscularity reference-size review refinement', 'specialized protein surfaces', 'selected point not required'],
      ['adult profile', 'scope', 'body-size evidence']),
    A6: moduleEntry('A6', 'fat-reference-soft-semantics-0.3.1', 'LAB_FAT_E03',
      'B3_FROZEN_FOR_CANDIDATE_V1_REFERENCE_SOFT_NO_TOTAL_FAT_PROTECTED_LOWER',
      ['EFA observation coverage calibration', 'individual fat preference belongs to downstream policy'],
      ['energy proposal', 'scope', 'EFA observation coverage']),
    A7: moduleEntry('A7', 'carbohydrate-minimal-standard-routing-0.3.3', 'LAB_CARB_E03',
      'B3_FROZEN_FOR_CANDIDATE_V1_RESIDUAL_CONTEXTUAL_STANDARD_HIGH_DEMAND_ROUTES',
      ['Advanced performance dose and denominator', 'day-level periodization'],
      ['energy proposal', 'scope', 'realized training workload']),
    A8: moduleEntry('A8', 'a8-hierarchical-feasibility-envelope-0.2.0', 'LAB_SOLVER_E02',
      'B4_HIERARCHICAL_REGION_CONTRACT_CLOSED_DOWNSTREAM_NUMERIC_PRESENTATION_POLICY_OPEN',
      ['product accounting tolerance', 'display tolerance', 'display/menu rounding increment'],
      ['energy proposal', 'A4/A5 constraint', 'A6 constraint', 'A7 constraint', 'A9 route']),
    A9: moduleEntry('A9', 'a9-hybrid-routing-governor-0.2.0+ordinary-b1-0.2.0', 'LAB_GUARDRAIL_E02+LAB_RATE_ENERGY_E02',
      'HYBRID_ROUTING_ARCHITECTURE_AND_ORDINARY_B1_POLICY_CLOSED_OTHER_OPERATIONAL_POLICY_OPEN',
      ['800–1200 autonomous action', 'RMR warning severity', 'athlete/clinical refinement', 'longitudinal hysteresis'],
      ['scope', 'energy proposal', 'TEE envelope', 'A8 protected feasibility', 'clinical and athlete context'])
  }
});

export function getFrozenModule(id) {
  return challengerFreezeRegistry.modules[id] || null;
}
