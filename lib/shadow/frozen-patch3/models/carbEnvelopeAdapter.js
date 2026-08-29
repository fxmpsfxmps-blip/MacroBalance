import { getCarbParameterSet, CARB_PARAMETER_REGISTRY_VERSION } from '../config/carbParameterRegistry.js';
import { normalizeAndValidateProfile, evaluateScope, assessInputQuality, deepFreeze } from '../core/inputScope.js';
import { buildCarbohydrateEvidence } from '../core/carbLab.js';
import { buildExecutableCarbohydrateEnvelope } from '../core/carbExecutableLab.js';

export function runCarbohydrateEnvelopeLab(rawProfile, options = {}) {
  const parameterSet = getCarbParameterSet(options.parameterSetId || 'LAB_CARB_E02');
  const mode = options.mode === 'ADVANCED' ? 'ADVANCED' : 'STANDARD';
  const validation = normalizeAndValidateProfile(rawProfile);
  const energyKcal = options.energyKcal;
  if (validation.status !== 'VALID' || !Number.isFinite(energyKcal) || energyKcal <= 0) {
    return deepFreeze({
      modelId: 'CARBOHYDRATE_WORKLOAD_ENVELOPE_DIAGNOSTIC_LAB',
      modelVersion: parameterSet.modelVersion,
      parameterVersion: parameterSet.parameterVersion,
      parameterSetId: parameterSet.id,
      status: 'TECHNICAL_INVALID',
      mode: null,
      workloadEnvelope: null,
      referenceAnchors: null,
      activeRange: null,
      selectedCarb: null,
      selectionReason: 'VALID_PROFILE_AND_POSITIVE_EXPLICIT_ENERGY_REQUIRED',
      warnings: ['TECHNICAL_INPUT_INVALID'],
      productionEligible: false
    });
  }

  const profile = validation.profile;
  const scope = evaluateScope(profile);
  const inputQuality = assessInputQuality(profile);
  if (!scope.allowsComplete) {
    return deepFreeze({
      modelId: 'CARBOHYDRATE_WORKLOAD_ENVELOPE_DIAGNOSTIC_LAB',
      modelVersion: parameterSet.modelVersion,
      parameterVersion: parameterSet.parameterVersion,
      parameterSetId: parameterSet.id,
      status: scope.state === 'OUT_OF_SCOPE' ? 'ABSTAIN' : 'PARTIAL',
      mode: null,
      validation,
      scope,
      inputQuality,
      energyKcal,
      workloadEnvelope: null,
      referenceAnchors: null,
      activeRange: null,
      selectedCarb: null,
      selectionReason: 'SCOPE_OR_SAFETY_ROUTE_PRECEDES_A7',
      warnings: [...scope.reasons],
      productionEligible: false
    });
  }

  if (parameterSet.id === 'LAB_CARB_E03') {
    const carbohydrateEvidence = buildExecutableCarbohydrateEnvelope(profile, energyKcal, parameterSet.values.A7);
    return deepFreeze({
      modelId: 'CARBOHYDRATE_EXECUTABLE_WORKLOAD_ENVELOPE_LAB', modelVersion: parameterSet.modelVersion,
      parameterVersion: parameterSet.parameterVersion, registryVersion: CARB_PARAMETER_REGISTRY_VERSION,
      parameterSetId: parameterSet.id, parameterStatus: parameterSet.status, status: 'PARTIAL', labMode: mode,
      validation, scope, inputQuality, energyKcal, carbohydrateEvidence,
      mode: carbohydrateEvidence.mode, workloadEnvelope: carbohydrateEvidence.workloadEnvelope,
      activationConfidenceStatus: carbohydrateEvidence.activationConfidenceStatus,
      referenceAnchors: carbohydrateEvidence.referenceAnchors, activeRange: carbohydrateEvidence.activeRange,
      preferredRange: carbohydrateEvidence.preferredRange, selectedCarb: null,
      route: carbohydrateEvidence.route,
      contextualPreferenceActive: carbohydrateEvidence.contextualPreferenceActive,
      compatibleModes: carbohydrateEvidence.compatibleModes,
      selectionReason: carbohydrateEvidence.selectionReason, openParametersUsed: carbohydrateEvidence.openParametersUsed,
      warnings: carbohydrateEvidence.warnings, decision: 'A7_MINIMAL_STANDARD_RESIDUAL_CONTEXTUAL_AND_ADVANCED_ROUTE',
      solverEligible: carbohydrateEvidence.solverEligible, fourNumberProjectionEligible: false,
      provenance: { source: parameterSet.source, rationale: parameterSet.rationale,
        experimentalParametersUsed: ['A7'], oldComparatorRetained: 'LAB_CARB_E02', activityLabUntouched: true,
        proteinLabUntouched: 'LAB_PROTEIN_E03', fatLabUntouched: 'LAB_FAT_E03' }, productionEligible: false
    });
  }
  const carbohydrateEvidence = buildCarbohydrateEvidence(profile, energyKcal, parameterSet.values.A7);
  return deepFreeze({
    modelId: 'CARBOHYDRATE_WORKLOAD_ENVELOPE_DIAGNOSTIC_LAB',
    modelVersion: parameterSet.modelVersion,
    parameterVersion: parameterSet.parameterVersion,
    registryVersion: CARB_PARAMETER_REGISTRY_VERSION,
    parameterSetId: parameterSet.id,
    parameterStatus: parameterSet.status,
    status: 'PARTIAL',
    labMode: mode,
    validation,
    scope,
    inputQuality,
    energyKcal,
    carbohydrateEvidence,
    mode: carbohydrateEvidence.mode,
    workloadEnvelope: carbohydrateEvidence.workloadEnvelope,
    activationConfidenceStatus: carbohydrateEvidence.activationConfidenceStatus,
    referenceAnchors: carbohydrateEvidence.referenceAnchors,
    activeRange: carbohydrateEvidence.activeRange,
    selectedCarb: carbohydrateEvidence.selectedCarb,
    selectionReason: carbohydrateEvidence.selectionReason,
    openParametersUsed: carbohydrateEvidence.openParametersUsed,
    warnings: carbohydrateEvidence.warnings,
    decision: 'A7_DECISION_G_HYBRID_ARCHITECTURE_NUMERIC_SURFACE_OPEN',
    solverEligible: false,
    fourNumberProjectionEligible: false,
    provenance: {
      source: parameterSet.source,
      rationale: parameterSet.rationale,
      experimentalParametersUsed: ['A7'],
      oldComparatorRetained: 'LAB_E01',
      activityLabUntouched: true,
      proteinLabUntouched: 'LAB_PROTEIN_E02',
      fatLabUntouched: 'LAB_FAT_E02'
    },
    productionEligible: false
  });
}
