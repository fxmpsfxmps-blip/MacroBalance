import { getProteinParameterSet, PROTEIN_PARAMETER_REGISTRY_VERSION } from '../config/proteinParameterRegistry.js';
import { normalizeAndValidateProfile, evaluateScope, assessInputQuality, deepFreeze } from '../core/inputScope.js';
import { buildReferenceSizeEvidence, buildProteinEvidence, buildExecutableProteinEnvelope } from '../core/proteinLab.js';

export function runProteinEnvelopeLab(rawProfile, options = {}) {
  const parameterSet = getProteinParameterSet(options.parameterSetId || 'LAB_PROTEIN_E02');
  const mode = options.mode === 'ADVANCED' ? 'ADVANCED' : 'STANDARD';
  const validation = normalizeAndValidateProfile(rawProfile);
  if (validation.status !== 'VALID') {
    return deepFreeze({
      modelId: 'PROTEIN_MULTI_ANCHOR_DIAGNOSTIC_LAB',
      modelVersion: parameterSet.modelVersion,
      parameterSetId: parameterSet.id,
      status: 'TECHNICAL_INVALID',
      mode,
      validation,
      productionEligible: false
    });
  }

  const profile = validation.profile;
  const scope = evaluateScope(profile);
  const inputQuality = assessInputQuality(profile);
  if (!scope.allowsComplete) {
    return deepFreeze({
      modelId: 'PROTEIN_MULTI_ANCHOR_DIAGNOSTIC_LAB',
      modelVersion: parameterSet.modelVersion,
      parameterSetId: parameterSet.id,
      status: scope.state === 'OUT_OF_SCOPE' ? 'ABSTAIN' : 'PARTIAL',
      mode,
      validation,
      scope,
      inputQuality,
      referenceSizeEvidence: null,
      proteinEvidence: null,
      target: null,
      productionEligible: false
    });
  }

  if (parameterSet.id === 'LAB_PROTEIN_E03') {
    const executable = buildExecutableProteinEnvelope(profile, mode, parameterSet.values.A4,
      parameterSet.values.A5, options.energyKcal ?? null);
    const qualityWarning = executable.proteinEvidence.proteinQuality.status === 'QUALITY_REQUIRES_MENU_OR_ADVANCED_CHECK'
      ? ['PROTEIN_QUALITY_REQUIRES_DOWNSTREAM_CHECK'] : [];
    const warnings = [
      'NO_UNIVERSAL_REFERENCE_WEIGHT',
      'NO_SELECTED_PROTEIN_POINT',
      ...executable.referenceSizeEvidence.divergence.flags,
      ...qualityWarning,
      ...(executable.proteinEvidence.energyInteraction.status === 'PROTEIN_REQUIREMENT_CONFLICT_ROUTE_A8_UPSTREAM'
        ? ['PROTEIN_REQUIREMENT_CONFLICT'] : [])
    ];
    return deepFreeze({
      modelId: 'PROTEIN_EXECUTABLE_ENVELOPE_LAB',
      modelVersion: parameterSet.modelVersion,
      registryVersion: PROTEIN_PARAMETER_REGISTRY_VERSION,
      parameterSetId: parameterSet.id,
      parameterStatus: parameterSet.status,
      status: executable.target.solverEligible ? 'EXECUTABLE_RANGE' : 'PARTIAL',
      mode,
      validation,
      scope,
      inputQuality,
      referenceSizeEvidence: executable.referenceSizeEvidence,
      proteinEvidence: executable.proteinEvidence,
      target: executable.target,
      decisions: {
        A4: 'A4_DECISION_F_DOMAIN_SWITCHED_EXECUTION_ANCHOR_NO_UNIVERSAL_REFERENCE_WEIGHT',
        A5: 'A5_DECISION_F_EXECUTABLE_PROTECTED_LOWER_PLUS_PREFERRED_RANGE_NO_POINT'
      },
      warnings,
      reasonCodes: warnings,
      openParametersUsed: executable.target.solverEligible ? [] : ['A4_REFERENCE_SIZE_REVIEW'],
      provenance: {
        source: parameterSet.source,
        rationale: parameterSet.rationale,
        experimentalParametersUsed: ['A4', 'A5'],
        oldComparatorRetained: 'LAB_PROTEIN_E02',
        e01FallbackUsed: false
      },
      productionEligible: false
    });
  }

  const referenceSizeEvidence = buildReferenceSizeEvidence(profile, mode, parameterSet.values.A4);
  const proteinEvidence = buildProteinEvidence(profile, referenceSizeEvidence, parameterSet.values.A5);
  const warnings = [
    'NO_UNIVERSAL_REFERENCE_WEIGHT',
    'NO_AUTOMATIC_PREFERRED_RANGE_OR_POINT',
    proteinEvidence.solverBlockReason,
    ...referenceSizeEvidence.divergence.flags,
    ...(proteinEvidence.plantQuality.action.startsWith('FLAG_') ? ['PROTEIN_QUALITY_UNKNOWN'] : [])
  ];

  return deepFreeze({
    modelId: 'PROTEIN_MULTI_ANCHOR_DIAGNOSTIC_LAB',
    modelVersion: parameterSet.modelVersion,
    registryVersion: PROTEIN_PARAMETER_REGISTRY_VERSION,
    parameterSetId: parameterSet.id,
    parameterStatus: parameterSet.status,
    status: 'PARTIAL',
    mode,
    validation,
    scope,
    inputQuality,
    referenceSizeEvidence,
    proteinEvidence,
    target: {
      adequacyReference: proteinEvidence.adequacyReference,
      protectedPlanningLower: proteinEvidence.protectedPlanningLower,
      preferredRange: null,
      selectedPoint: null,
      upperOptimizationRange: null,
      solverEligible: false,
      fourNumberProjectionEligible: false
    },
    decisions: {
      A4: 'A4_DECISION_E_MULTI_ANCHOR_NO_UNIVERSAL_REFERENCE_WEIGHT',
      A5: 'A5_DECISION_E_INSUFFICIENT_NUMERIC_MAPPING_MANUAL_EXPERIMENT_ONLY'
    },
    warnings,
    provenance: {
      source: parameterSet.source,
      rationale: parameterSet.rationale,
      experimentalParametersUsed: ['A4', 'A5'],
      oldComparatorRetained: 'LAB_E01'
    },
    productionEligible: false
  });
}
