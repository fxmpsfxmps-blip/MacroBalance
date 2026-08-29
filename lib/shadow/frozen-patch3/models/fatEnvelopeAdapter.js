import { getFatParameterSet, FAT_PARAMETER_REGISTRY_VERSION } from '../config/fatParameterRegistry.js';
import { normalizeAndValidateProfile, evaluateScope, assessInputQuality, deepFreeze } from '../core/inputScope.js';
import { buildFatEvidence } from '../core/fatLab.js';
import { buildExecutableFatEnvelope } from '../core/fatExecutableLab.js';

export function runFatEnvelopeLab(rawProfile, options = {}) {
  const parameterSet = getFatParameterSet(options.parameterSetId || 'LAB_FAT_E02');
  const mode = options.mode === 'ADVANCED' ? 'ADVANCED' : 'STANDARD';
  const validation = normalizeAndValidateProfile(rawProfile);
  const energyKcal = options.energyKcal;
  if (validation.status !== 'VALID' || !Number.isFinite(energyKcal) || energyKcal <= 0) {
    return deepFreeze({
      modelId: 'FAT_ADEQUACY_CONTEXTUAL_SURFACE_DIAGNOSTIC_LAB',
      modelVersion: parameterSet.modelVersion,
      parameterVersion: parameterSet.parameterVersion,
      parameterSetId: parameterSet.id,
      status: 'TECHNICAL_INVALID',
      mode,
      validation,
      energyKcal: Number.isFinite(energyKcal) ? energyKcal : null,
      adequacyAssessability: null,
      preferredRange: null,
      selectedFat: null,
      selectionReason: 'VALID_PROFILE_AND_POSITIVE_EXPLICIT_ENERGY_REQUIRED',
      openParametersUsed: [],
      warnings: ['TECHNICAL_INPUT_INVALID'],
      productionEligible: false
    });
  }

  const profile = validation.profile;
  const scope = evaluateScope(profile);
  const inputQuality = assessInputQuality(profile);
  if (!scope.allowsComplete) {
    return deepFreeze({
      modelId: 'FAT_ADEQUACY_CONTEXTUAL_SURFACE_DIAGNOSTIC_LAB',
      modelVersion: parameterSet.modelVersion,
      parameterVersion: parameterSet.parameterVersion,
      parameterSetId: parameterSet.id,
      status: scope.state === 'OUT_OF_SCOPE' ? 'ABSTAIN' : 'PARTIAL',
      mode,
      validation,
      scope,
      inputQuality,
      energyKcal,
      adequacyAssessability: null,
      preferredRange: null,
      selectedFat: null,
      selectionReason: 'SCOPE_OR_SAFETY_ROUTE_PRECEDES_A6',
      openParametersUsed: [],
      warnings: [...scope.reasons],
      productionEligible: false
    });
  }

  if (parameterSet.id === 'LAB_FAT_E03') {
    const fatEvidence = buildExecutableFatEnvelope(profile, energyKcal, parameterSet.values.A6, options);
    return deepFreeze({
      modelId: 'FAT_EXECUTABLE_PERMITTED_ENVELOPE_LAB', modelVersion: parameterSet.modelVersion,
      parameterVersion: parameterSet.parameterVersion, registryVersion: FAT_PARAMETER_REGISTRY_VERSION,
      parameterSetId: parameterSet.id, parameterStatus: parameterSet.status, status: 'PARTIAL', mode,
      validation, scope, inputQuality, energyKcal, fatEvidence,
      adequacyAssessability: fatEvidence.adequacyAssessability,
      populationReferenceRange: fatEvidence.populationReferenceRange,
      referenceSoftRange: fatEvidence.referenceSoftRange,
      permittedRange: null, preferredRange: null, selectedFat: null,
      selectionReason: fatEvidence.selectionReason, openParametersUsed: fatEvidence.openParametersUsed,
      warnings: fatEvidence.warnings, decision: 'A6_DECISION_G_REFERENCE_SOFT_NO_PROTECTED_LOWER_OR_INDIVIDUAL_RANGE',
      solverEligible: true, fourNumberProjectionEligible: false,
      provenance: { source: parameterSet.source, rationale: parameterSet.rationale,
        experimentalParametersUsed: ['A6'], oldComparatorRetained: 'LAB_FAT_E02', proteinLabUntouched: 'LAB_PROTEIN_E03' },
      productionEligible: false
    });
  }
  const fatEvidence = buildFatEvidence(profile, energyKcal, parameterSet.values.A6, options);
  return deepFreeze({
    modelId: 'FAT_ADEQUACY_CONTEXTUAL_SURFACE_DIAGNOSTIC_LAB',
    modelVersion: parameterSet.modelVersion,
    parameterVersion: parameterSet.parameterVersion,
    registryVersion: FAT_PARAMETER_REGISTRY_VERSION,
    parameterSetId: parameterSet.id,
    parameterStatus: parameterSet.status,
    status: 'PARTIAL',
    mode,
    validation,
    scope,
    inputQuality,
    energyKcal,
    fatEvidence,
    adequacyAssessability: fatEvidence.adequacyAssessability,
    preferredRange: fatEvidence.preferredRange,
    selectedFat: fatEvidence.selectedFat,
    selectionReason: fatEvidence.selectionReason,
    openParametersUsed: fatEvidence.openParametersUsed,
    warnings: fatEvidence.warnings,
    decision: 'A6_DECISION_F_ARCHITECTURE_SURVIVES_NUMERIC_SURFACE_OPEN',
    solverEligible: false,
    fourNumberProjectionEligible: false,
    provenance: {
      source: parameterSet.source,
      rationale: parameterSet.rationale,
      experimentalParametersUsed: ['A6'],
      oldComparatorRetained: 'LAB_E01',
      proteinLabUntouched: 'LAB_PROTEIN_E02'
    },
    productionEligible: false
  });
}
