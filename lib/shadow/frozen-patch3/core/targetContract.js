import { deepFreeze } from './inputScope.js';
import { resolverCapabilityRegistry } from '../config/resolverCapabilityRegistry.js';

export const TARGET_CONTRACT_VERSION = 'SCIENTIFIC_TARGET_CONTRACT_V1';
export const TARGET_CONTRACT_MODEL_VERSION = 'b4-target-contract-0.1.2';

const ROUTE_ORDER = Object.freeze({
  PASS: 0,
  PASS_WITH_CONTEXT: 1,
  WARNING: 2,
  REQUEST_INFORMATION: 3,
  REVIEW_REQUIRED: 4,
  BLOCKED_STRATEGY: 5,
  SPECIALIST_ROUTE: 6,
  MODULE_ABSTAIN: 7,
  FULL_ABSTAIN: 8,
  TECHNICAL_INVALID: 9
});

export const TARGET_ROUTING_PERMISSIONS = deepFreeze({
  PASS: permission(true, true, true, true, true, false),
  PASS_WITH_CONTEXT: permission(true, true, true, true, true, false),
  WARNING: permission(true, true, true, true, true, false),
  REQUEST_INFORMATION: permission(true, true, true, false, false, false),
  REVIEW_REQUIRED: permission(true, true, true, false, false, true),
  BLOCKED_STRATEGY: permission(true, true, false, false, false, true),
  SPECIALIST_ROUTE: permission(true, true, true, false, false, true),
  MODULE_ABSTAIN: permission(true, true, false, false, false, true),
  FULL_ABSTAIN: permission(false, false, false, false, false, true),
  TECHNICAL_INVALID: permission(false, false, false, false, false, true)
});

/**
 * Builds the B4 contract from already-computed B1-B3/A8/A9 outputs. It is a
 * semantic adapter only: it does not create physiological values or select a
 * macro point.
 */
export function buildScientificTargetContract(input) {
  const routing = buildRouting(input);
  const energy = buildEnergyContract(input, routing);
  const suppressTargetComponents = !routing.permissions.canReturnDiagnostics;
  const protein = suppressTargetComponents ? absentModuleContract('ABSTAINED', 'ROUTING_FORBIDS_TARGET_COMPONENT_OUTPUT')
    : buildProteinContract(input.proteinRuns || []);
  const fat = suppressTargetComponents ? absentModuleContract('ABSTAINED', 'ROUTING_FORBIDS_TARGET_COMPONENT_OUTPUT')
    : buildFatContract(input.fatRuns || []);
  const carbohydrate = suppressTargetComponents ? absentModuleContract('ABSTAINED', 'ROUTING_FORBIDS_TARGET_COMPONENT_OUTPUT')
    : buildCarbContract(input.carbRuns || []);
  const solver = buildSolverContract(input.solverRuns || [], energy);
  const physiology = buildPhysiologyResolution(energy, protein, fat, carbohydrate);
  const selection = buildSelectionContract(input.solverRuns || [], energy, solver);
  const uncertainty = buildUncertainty(input, energy, protein, fat, carbohydrate, solver, routing);
  const scientificStatus = classifyScientificStatus({ routing, physiology, solver });
  const presentation = buildPresentationContract(scientificStatus, routing, solver, selection, uncertainty);
  const menu = buildMenuContract(scientificStatus, routing, solver, selection);

  return deepFreeze({
    schema: TARGET_CONTRACT_VERSION,
    modelVersion: TARGET_CONTRACT_MODEL_VERSION,
    contractStatus: 'EXECUTABLE_SHADOW_CONTRACT',
    profileId: input.profileId || null,
    generatedAt: input.contractTimestamp || null,
    generatedAtState: input.contractTimestamp ? 'CALLER_SUPPLIED' : 'NOT_SUPPLIED_DETERMINISTIC_OUTPUT',
    scientificStatus,
    dimensions: {
      physiology: physiology.status,
      feasibility: solver.feasibilityStatus,
      routing: routing.state,
      region: solver.regionStatus,
      pointSelection: selection.status,
      ui: presentation.status,
      menu: menu.status
    },
    physiology,
    energy,
    protein,
    fat,
    carbohydrate,
    solver,
    routing,
    selection,
    presentation,
    menu,
    uncertainty,
    missingness: buildMissingness(input, energy, protein, fat, carbohydrate, selection),
    advancedHandoff: buildAdvancedHandoff(routing, carbohydrate, uncertainty),
    longitudinalHandoff: {
      allowed: routing.permissions.longitudinalMayConsumeContract,
      requiredInputs: ['TARGET_CONTRACT', 'OBSERVED_INTAKE', 'OBSERVED_WEIGHT_TREND', 'TIMING', 'ADHERENCE_CONTEXT'],
      preservesOriginalProvenance: true,
      observedSuccessRetroactivelyValidatesModel: false
    },
    roundingAndAccounting: {
      accountingEquation: '4P_PLUS_4C_PLUS_9F_EQUALS_E',
      solveRepresentation: 'UNROUNDED_BINARY64',
      requiredOrder: ['SOLVE_UNROUNDED', 'VALIDATE_REGION_OR_POINT', 'FORMAT_OR_MENU_ROUND', 'RECONCILE_INSIDE_AUTHORIZED_REGION', 'REVALIDATE'],
      internalFloatingPointEpsilonRole: 'ENGINEERING_COMPARISON_ONLY',
      productAccountingToleranceKcal: null,
      displayIncrementGrams: null,
      menuImplementationToleranceKcal: null,
      numericPoliciesState: 'OPEN_DOWNSTREAM_EXECUTION_POLICY_NOT_SCIENTIFIC_REGION_BLOCKER',
      automaticCarbLastAdjustmentAuthorized: false,
      independentlyRoundedMacrosAssumedToReconcile: false
    },
    provenance: {
      challengerVersion: input.challengerVersion || null,
      orchestratorVersion: input.orchestratorVersion || null,
      parameterSetVersions: sortedObject(input.parameterSetVersions || {}),
      moduleVersions: sortedObject(input.moduleVersions || {}),
      freezeRegistryVersion: input.freezeRegistryVersion || null,
      inputFingerprintPolicy: 'CALLER_INPUT_PLUS_EXPLICIT_VERSIONS_DETERMINE_OUTPUT',
      deterministic: true,
      constraintOrderInvariantRequired: true,
      oldE01FallbackUsed: false,
      productionEligible: false,
      shadowOnly: true
    }
  });
}

export function validateSelectedPointContract(pointContract, solverEndpoint, options = {}) {
  if (!pointContract || !pointContract.value || !pointContract.selector?.identity || !pointContract.selector?.reason ||
      !pointContract.sourceRegionId || !Array.isArray(pointContract.constraintsSatisfied) ||
      !Array.isArray(pointContract.constraintsRelaxed) || !pointContract.roundingStatus) {
    return deepFreeze({ status: 'TECHNICAL_INVALID', reason: 'SELECTED_POINT_PROVENANCE_INCOMPLETE' });
  }
  if (!solverEndpoint?.authorizedRegion?.feasible) {
    return deepFreeze({ status: 'TECHNICAL_INVALID', reason: 'AUTHORIZED_SOURCE_REGION_REQUIRED' });
  }
  const tolerance = options.accountingToleranceKcal;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return deepFreeze({ status: 'NOT_EVALUABLE', reason: 'EXPLICIT_ACCOUNTING_TOLERANCE_REQUIRED' });
  }
  const point = pointContract.value;
  if (![point.protein, point.fat, point.carbs].every(value => Number.isFinite(value) && value >= 0)) {
    return deepFreeze({ status: 'TECHNICAL_INVALID', reason: 'FINITE_NONNEGATIVE_POINT_REQUIRED' });
  }
  const mismatchKcal = 4 * point.protein + 9 * point.fat + 4 * point.carbs - solverEndpoint.targetEnergy;
  const inside = Object.entries(solverEndpoint.authorizedRegion.projectionIntervals).every(([variable, range]) => {
    const value = point[variable];
    return value >= range.lower && (range.upperUnbounded || value <= range.upper);
  });
  return deepFreeze({
    status: inside && Math.abs(mismatchKcal) <= tolerance ? 'VALID' : 'INVALID',
    insideAuthorizedProjections: inside,
    accountingPass: Math.abs(mismatchKcal) <= tolerance,
    mismatchKcal,
    toleranceKcal: tolerance,
    physiologicalOptimalityClaimed: false
  });
}

function permission(diagnostics, energyRange, macroRegion, selectPoint, generateMenu, review) {
  return {
    canReturnDiagnostics: diagnostics,
    canReturnEnergyRange: energyRange,
    canReturnMacroRegion: macroRegion,
    canSelectPoint: selectPoint,
    canGenerateMenu: generateMenu,
    requiresProfessionalReview: review,
    longitudinalMayConsumeContract: diagnostics,
    upstreamBacktrackAllowed: true
  };
}

function buildRouting(input) {
  const candidates = [];
  const add = (state, module, reason) => candidates.push({ state, module, reason });
  const scope = input.scope || {};
  if (input.legacyStatus === 'TECHNICAL_INVALID') add('TECHNICAL_INVALID', 'INPUT', 'INPUT_CONTRACT_INVALID');
  if (scope.state === 'OUT_OF_SCOPE' || input.legacyStatus === 'FULL_ABSTAIN') add('FULL_ABSTAIN', 'SCOPE', 'SCOPE_PRECEDENCE');
  if (scope.state === 'MODULE_BLOCKED' || input.legacyStatus === 'MODULE_ABSTAIN') add('MODULE_ABSTAIN', 'SCOPE', 'MODULE_DOMAIN_BLOCK');
  if (scope.state === 'BLOCKED_STRATEGY') add('BLOCKED_STRATEGY', 'SCOPE', 'STRATEGY_CONFLICT');
  if (scope.state === 'REVIEW') add('REVIEW_REQUIRED', 'SCOPE', 'UPSTREAM_REVIEW');

  for (const run of input.carbRuns || []) {
    if (run.route === 'PERFORMANCE_NUTRITION_SPECIALIST_ROUTE' || run.targetState === 'PERFORMANCE_TARGET_NOT_IDENTIFIED' ||
        run.carbEvidence?.targetState === 'PERFORMANCE_TARGET_NOT_IDENTIFIED') {
      add('SPECIALIST_ROUTE', 'A7', 'PERFORMANCE_TARGET_NOT_IDENTIFIED');
    } else if (run.route === 'REQUEST_INFORMATION_FOR_MODE_CLASSIFICATION' || (run.compatibleModes || []).length > 1) {
      add('REQUEST_INFORMATION', 'A7', 'CARBOHYDRATE_MODE_AMBIGUOUS');
    }
  }
  for (const run of [...(input.preA9?.runs || []), ...(input.postA9?.runs || [])]) {
    if (run.status in ROUTE_ORDER) add(run.status, 'A9', run.reasonCodes?.[0] || run.route || run.status);
  }
  const legacyMap = {
    REQUEST_INFORMATION: 'REQUEST_INFORMATION', REVIEW_REQUIRED: 'REVIEW_REQUIRED',
    SPECIALIST_ROUTE: 'SPECIALIST_ROUTE', MODULE_ABSTAIN: 'MODULE_ABSTAIN',
    FULL_ABSTAIN: 'FULL_ABSTAIN', TECHNICAL_INVALID: 'TECHNICAL_INVALID',
    UPSTREAM_BACKTRACK: 'BLOCKED_STRATEGY'
  };
  if (legacyMap[input.legacyStatus]) add(legacyMap[input.legacyStatus], 'INTEGRATED_ORCHESTRATOR', input.legacyDecision || input.legacyStatus);
  if (!candidates.length) add('PASS', 'A9', 'NO_ACTIVE_ROUTING_OBJECTION_WITHIN_EVALUATED_SCOPE');
  candidates.sort((a, b) => ROUTE_ORDER[b.state] - ROUTE_ORDER[a.state] || a.module.localeCompare(b.module) || a.reason.localeCompare(b.reason));
  const selected = candidates[0];
  return {
    state: selected.state,
    reasons: unique(candidates.map(item => item.reason)),
    modules: unique(candidates.map(item => item.module)),
    severity: selected.state,
    passSemantics: 'NO_ACTIVE_OBJECTION_WITHIN_EVALUATED_SCOPE_NOT_MEDICAL_SAFETY_CLEARANCE',
    permissions: TARGET_ROUTING_PERMISSIONS[selected.state],
    canContinueDiagnostics: TARGET_ROUTING_PERMISSIONS[selected.state].canReturnDiagnostics,
    requiresProfessionalReview: TARGET_ROUTING_PERMISSIONS[selected.state].requiresProfessionalReview,
    upstreamBacktrackAllowed: TARGET_ROUTING_PERMISSIONS[selected.state].upstreamBacktrackAllowed
  };
}

function buildEnergyContract(input, routing) {
  const teeRange = routing.permissions.canReturnEnergyRange ? normalizeRange(input.energy?.teeRange) : null;
  const targetRange = routing.permissions.canReturnEnergyRange ? normalizeRange(input.energy?.targetRange) : null;
  const width = targetRange ? targetRange[1] - targetRange[0] : null;
  return {
    teeRange,
    strategyDirection: input.strategyDirection || null,
    initialTargetRange: targetRange,
    selected: input.energy?.selectedEnergy ?? null,
    selectedState: input.energy?.selectedEnergy == null ? 'NOT_SELECTED' : 'EXPLICITLY_SELECTED',
    initializationModel: input.a2a3?.modelVersion || input.a2a3?.b1?.modelId || null,
    uncertainty: {
      level: 'NOT_CALIBRATED',
      envelopeWidthKcal: width,
      materiallyBroad: null,
      widthMaterialityState: width === null ? 'NOT_ASSESSABLE' : width === 0 ? 'SINGLETON_ENERGY' : 'NOT_CALIBRATED_NO_ARBITRARY_WIDTH_THRESHOLD',
      midpointUsed: false
    },
    provenance: input.a2a3?.b1?.provenance || null,
    routingState: routing.state
  };
}

function buildProteinContract(runs) {
  const usable = runs.filter(run => run?.target);
  if (!usable.length) return absentModuleContract('UNKNOWN', 'ENERGY_OR_PROTEIN_MODULE_NOT_EVALUATED');
  const first = usable[0];
  const target = first.target;
  return {
    state: target.solverEligible ? 'RESOLVED_ENVELOPE' : 'UNRESOLVED',
    protectedLower: target.protectedLower ?? null,
    protectedRange: serializableRange(target.protectedConstraintRange),
    preferredLow: target.preferredRange?.[0] ?? null,
    preferredHigh: target.preferredRange?.[1] ?? null,
    preferredRange: target.preferredRange ?? null,
    selected: target.selectedPoint ?? null,
    selectedState: target.selectedPoint == null ? 'NOT_SELECTED' : 'SELECTED',
    referenceAnchor: first.referenceSizeEvidence?.executionAnchor ?? null,
    referenceBasis: target.referenceBasis ?? null,
    anchorClassification: first.referenceSizeEvidence?.executionAnchor?.role ?? null,
    contexts: first.proteinEvidence?.context ?? null,
    provenance: first.provenance ?? null,
    uncertainty: target.uncertainty ?? 'NOT_CALIBRATED',
    divergenceFlags: target.divergenceFlags || [],
    endpointInvariant: usable.every(run => same(run.target.protectedLower, target.protectedLower) && same(run.target.preferredRange, target.preferredRange))
  };
}

function buildFatContract(runs) {
  const usable = runs.filter(Boolean);
  if (!usable.length) return absentModuleContract('UNKNOWN', 'ENERGY_OR_FAT_MODULE_NOT_EVALUATED');
  const first = usable[0];
  return {
    state: first.solverEligible ? 'SEMANTICS_RESOLVED_REFERENCE_SOFT' : 'UNRESOLVED',
    protectedLower: null,
    populationReferenceRange: endpointRanges(usable, run => run.populationReferenceRange),
    populationReferenceClass: 'REFERENCE_SOFT',
    preferredRange: first.preferredRange ?? null,
    permittedRange: first.permittedRange ?? null,
    selected: first.selectedFat ?? null,
    selectedState: first.selectedFat == null ? 'NOT_SELECTED' : 'SELECTED',
    efaAssessability: first.adequacyAssessability || first.fatEvidence?.adequacyAssessability || 'NOT_ASSESSABLE',
    provenance: first.provenance ?? null,
    uncertainty: {
      level: 'NOT_CALIBRATED',
      efa: first.adequacyAssessability || 'NOT_ASSESSABLE',
      individualTotalFatTarget: 'NOT_IDENTIFIED_NOT_REQUIRED_FOR_B3_STANDARD'
    },
    referenceConstrainsHardRegion: false
  };
}

function buildCarbContract(runs) {
  const usable = runs.filter(Boolean);
  if (!usable.length) return absentModuleContract('UNKNOWN', 'ENERGY_OR_CARB_MODULE_NOT_EVALUATED');
  const modes = unique(usable.flatMap(run => run.compatibleModes || [run.mode].filter(Boolean))).sort();
  const routes = unique(usable.map(run => run.route).filter(Boolean)).sort();
  const highPerformance = routes.includes('PERFORMANCE_NUTRITION_SPECIALIST_ROUTE') || usable.some(run =>
    run.targetState === 'PERFORMANCE_TARGET_NOT_IDENTIFIED' || run.carbEvidence?.targetState === 'PERFORMANCE_TARGET_NOT_IDENTIFIED');
  const ambiguous = modes.length > 1 || routes.includes('REQUEST_INFORMATION_FOR_MODE_CLASSIFICATION');
  const mode = unique(usable.map(run => run.mode).filter(Boolean));
  return {
    state: highPerformance ? 'TARGET_NOT_IDENTIFIED' : ambiguous ? 'CLASSIFICATION_UNCERTAIN' : 'MODE_RESOLVED',
    mode: mode.length === 1 ? mode[0] : null,
    contextualPreference: usable.some(run => run.contextualPreferenceActive === true),
    numericConstraint: null,
    targetState: highPerformance ? 'PERFORMANCE_TARGET_NOT_IDENTIFIED'
      : ambiguous ? 'MODE_NOT_UNIQUELY_IDENTIFIED' : 'NUMERIC_CONSTRAINT_NOT_REQUIRED_IN_STANDARD',
    compatibleModes: modes,
    selected: usable.find(run => run.selectedCarb != null)?.selectedCarb ?? null,
    selectedState: usable.every(run => run.selectedCarb == null) ? 'NOT_SELECTED' : 'SELECTED',
    route: routes.length === 1 ? routes[0] : routes,
    populationReference: usable[0].referenceAnchors?.rda ?? null,
    provenance: usable[0].provenance ?? null,
    uncertainty: {
      level: 'NOT_CALIBRATED',
      classification: ambiguous ? 'MATERIAL' : 'PRESERVED',
      denominator: highPerformance ? 'NOT_IDENTIFIED' : 'NOT_APPLICABLE_TO_STANDARD_NUMERIC_CONSTRAINT'
    }
  };
}

function buildSolverContract(runs, energy) {
  const endpoints = runs.map(toEndpointRegion).sort((a, b) => numericSort(a.energyKcal, b.energyKcal));
  const feasible = endpoints.filter(item => item.authorizedRegion?.feasible);
  const protectedInfeasible = endpoints.filter(item => item.solutionStatus === 'PROTECTED_INFEASIBLE');
  const unknown = endpoints.filter(item => ['FEASIBILITY_UNKNOWN', 'REQUIRES_POLICY'].includes(item.solutionStatus));
  const routed = endpoints.filter(item => ['UPSTREAM_GUARDRAIL_BLOCKED', 'SCOPE_BLOCKED'].includes(item.solutionStatus));
  const expectedEnergies = energy.initialTargetRange
    ? unique(energy.initialTargetRange).sort((a, b) => a - b)
    : [];
  const actualEnergies = unique(endpoints.map(item => item.energyKcal)).sort((a, b) => a - b);
  const allExpectedEndpointsPresent = expectedEnergies.length > 0 && same(expectedEnergies, actualEnergies);
  const selectedEndpoints = endpoints.filter(item => item.selectedPoint != null);
  let regionStatus = 'NOT_EVALUATED';
  let feasibilityStatus = 'NOT_EVALUATED';
  if (endpoints.length && feasible.length === endpoints.length) {
    regionStatus = endpoints.some(item => item.relaxations.length) ? 'RESOLVED_WITH_SOFT_COMPROMISE' : 'RESOLVED_ALL_ENERGY_ENDPOINTS';
    feasibilityStatus = 'RESOLVED';
  } else if (feasible.length) {
    regionStatus = 'PARTIALLY_FEASIBLE_ACROSS_ENERGY_ENVELOPE';
    feasibilityStatus = 'PARTIALLY_RESOLVED';
  } else if (protectedInfeasible.length) {
    regionStatus = 'INFEASIBLE_PROTECTED';
    feasibilityStatus = 'INFEASIBLE';
  } else if (unknown.length) {
    regionStatus = unknown.some(item => item.solutionStatus === 'REQUIRES_POLICY') ? 'CONFLICTING_CONSTRAINTS' : 'FEASIBILITY_UNKNOWN';
    feasibilityStatus = 'UNRESOLVED';
  } else if (routed.length) {
    regionStatus = 'NOT_EVALUATED_ROUTING_BLOCK';
    feasibilityStatus = 'NOT_EVALUATED';
  }
  return {
    accountingStatus: endpoints.length ? 'ENCODED_IN_JOINT_REGION' : 'NOT_EVALUATED',
    protectedFeasibility: summarizeEndpointState(endpoints, 'hardFeasibility'),
    softFeasibility: summarizeEndpointState(endpoints, 'preferredFeasibility'),
    feasibilityStatus,
    regionStatus,
    jointRegion: {
      representation: 'ENERGY_CONDITIONED_LINEAR_CONSTRAINT_SET',
      equation: { proteinCoefficient: 4, carbohydrateCoefficient: 4, fatCoefficient: 9, relation: 'EQUALITY_TO_ENERGY_ENDPOINT_KCAL' },
      regionByEnergyEndpoint: endpoints,
      coversDeclaredEnergyEnvelopeEndpoints: allExpectedEndpointsPresent,
      interiorEnergyContinuumEnumerated: false,
      proteinRemainsJointVariable: true,
      marginalProjectionPairsIndependentlyCombinable: false,
      geometry: 'BOX_CONSTRAINTS_INTERSECTED_WITH_ENERGY_HYPERPLANE'
    },
    constraintTrace: endpoints.map(item => ({ energyKcal: item.energyKcal, constraints: item.constraintTrace })),
    relaxations: endpoints.flatMap(item => item.relaxations.map(relaxation => ({ energyKcal: item.energyKcal, ...relaxation }))),
    backtrackRequests: endpoints.filter(item => item.backtrackRequired).map(item => ({
      energyKcal: item.energyKcal,
      target: 'ENERGY_RATE_OR_STRATEGY',
      reason: item.solutionStatus,
      minimumEnergyForProtectedSet: item.minimumEnergyForProtectedSet,
      minimumEnergySemantic: 'MATHEMATICAL_DIAGNOSTIC_ONLY_NOT_SAFE_FLOOR'
    })),
    selectedPoint: endpoints.length === 1 && selectedEndpoints.length === 1 ? selectedEndpoints[0].selectedPoint : null,
    selectedPointByEnergyEndpoint: selectedEndpoints.map(item => ({ energyKcal: item.energyKcal, point: item.selectedPoint, source: item.selectedPointSource })),
    selectionAuthority: 'A8_UNIQUE_OR_EXPLICIT_AUTHORIZED_POINT_ONLY_OTHERWISE_DOWNSTREAM_EXPLICIT_SELECTOR',
    numericalIntegrity: {
      internalFloatingPointEpsilonByEndpoint: endpoints.map(item => ({ energyKcal: item.energyKcal, epsilonKcal: item.internalFloatingPointEpsilonKcal })),
      internalEpsilonIsNutritionTolerance: false,
      productToleranceFrozen: false,
      automaticRoundingApplied: false
    }
  };
}

function toEndpointRegion(run) {
  return {
    endpointId: Number.isFinite(run?.targetEnergy) ? `ENERGY_${run.targetEnergy}` : 'ENERGY_NOT_EVALUATED',
    energyKcal: run?.targetEnergy ?? null,
    solverStatus: run?.status ?? 'NOT_EVALUATED',
    solutionStatus: run?.solutionStatus ?? 'NOT_EVALUATED',
    hardRegion: run?.H ?? null,
    preferredRegion: run?.S ?? null,
    authorizedRegion: run?.authorizedRegion ?? null,
    hardFeasibility: run?.hardFeasibility ?? 'NOT_EVALUATED',
    preferredFeasibility: run?.preferredFeasibility ?? 'NOT_EVALUATED',
    selectedPoint: run?.selected ?? null,
    selectedPointSource: run?.selectedPointSource ?? null,
    constraintTrace: [...(run?.constraintResults || [])].sort((a, b) =>
      String(a.hierarchyLevel).localeCompare(String(b.hierarchyLevel)) || String(a.constraintId).localeCompare(String(b.constraintId))),
    relaxations: [...(run?.relaxations || [])].sort((a, b) => String(a.constraintId).localeCompare(String(b.constraintId))),
    conflicts: [...(run?.conflicts || [])].sort((a, b) => String(a.type).localeCompare(String(b.type))),
    backtrackRequired: run?.backtrackRequired === true,
    minimumEnergyForProtectedSet: run?.minimumEnergyForCurrentProtectedConstraintSet ?? null,
    internalFloatingPointEpsilonKcal: run?.numericSemantics?.internalFloatingPointEpsilonKcal ?? null,
    energyChangedBySolver: run?.energyChangedBySolver === true,
    automaticRoundingApplied: run?.automaticRoundingApplied === true
  };
}

function buildPhysiologyResolution(energy, protein, fat, carbohydrate) {
  const componentStates = {
    energy: energy.initialTargetRange ? 'RESOLVED_ENVELOPE' : 'UNRESOLVED',
    protein: protein.state,
    fat: fat.state,
    carbohydrate: carbohydrate.state
  };
  const unresolved = Object.entries(componentStates).filter(([, state]) =>
    ['UNKNOWN', 'UNRESOLVED', 'CLASSIFICATION_UNCERTAIN', 'TARGET_NOT_IDENTIFIED'].includes(state));
  return {
    status: unresolved.length ? carbohydrate.state === 'TARGET_NOT_IDENTIFIED' ? 'TARGET_NOT_IDENTIFIED' : 'UNRESOLVED' : 'RESOLVED',
    components: componentStates,
    unresolvedComponents: unresolved.map(([component]) => component)
  };
}

function buildSelectionContract(runs, energy, solver) {
  const selectedEndpoints = runs.filter(run => run?.selected != null);
  const energySelected = energy.selected != null;
  if (energySelected && selectedEndpoints.length === 1) {
    const run = selectedEndpoints[0];
    return {
      status: 'POINT_SELECTED',
      selectedPoint: run.selected,
      selector: { identity: run.selectedPointSource, reason: run.selectedPointSource },
      sourceRegionId: `ENERGY_${run.targetEnergy}`,
      constraintsSatisfied: (run.constraintResults || []).filter(item => item.state === 'SATISFIED').map(item => item.constraintId).sort(),
      constraintsRelaxed: (run.relaxations || []).map(item => item.constraintId).sort(),
      selectionConfidence: 'NOT_CALIBRATED',
      roundingStatus: run.automaticRoundingApplied ? 'ROUNDED_AND_REVALIDATION_REQUIRED' : 'UNROUNDED',
      physiologicalOptimumClaimed: false
    };
  }
  const validRegion = ['RESOLVED_ALL_ENERGY_ENDPOINTS', 'RESOLVED_WITH_SOFT_COMPROMISE'].includes(solver.regionStatus);
  return {
    status: validRegion ? 'POINT_NOT_SELECTED_VALID' : 'POINT_NOT_SELECTED',
    selectedPoint: null,
    selector: null,
    sourceRegionId: null,
    constraintsSatisfied: [],
    constraintsRelaxed: [],
    selectionConfidence: 'NOT_APPLICABLE',
    roundingStatus: 'NOT_APPLICABLE_NO_POINT',
    physiologicalOptimumClaimed: false,
    nullSemantics: validRegion ? 'MULTIPLE_EQUALLY_DEFENSIBLE_OR_DOWNSTREAM_SELECTOR_NOT_INVOKED' : 'NO_AUTHORIZED_POINT_AVAILABLE'
  };
}

function buildUncertainty(input, energy, protein, fat, carbohydrate, solver, routing) {
  const sources = [];
  if (input.inputQuality?.steps?.confidenceEffect !== 'USABLE') sources.push(source('MEASUREMENT', 'STEPS_COVERAGE_OR_AVAILABILITY'));
  if (input.inputQuality?.bodyFat?.quality && input.inputQuality.bodyFat.quality !== 'HIGH') sources.push(source('MEASUREMENT', 'BODY_COMPOSITION_NOT_HIGH_QUALITY'));
  sources.push(source('MODEL', 'MODEL_CONFIDENCE_NOT_CALIBRATED'));
  if (energy.initialTargetRange && energy.initialTargetRange[0] !== energy.initialTargetRange[1]) sources.push(source('MODEL', 'ENERGY_ENVELOPE_WIDTH'));
  if (protein.divergenceFlags?.length) sources.push(source('PARAMETER', 'PROTEIN_REFERENCE_SIZE_DIVERGENCE'));
  if (carbohydrate.state === 'CLASSIFICATION_UNCERTAIN') sources.push(source('CLASSIFICATION', 'CARBOHYDRATE_MODE_AMBIGUITY'));
  if (carbohydrate.state === 'TARGET_NOT_IDENTIFIED') sources.push(source('DOMAIN', 'HIGH_PERFORMANCE_CARBOHYDRATE_DOSE_NOT_IDENTIFIED'));
  if (fat.efaAssessability === 'NOT_ASSESSABLE') sources.push(source('MISSINGNESS', 'EFA_INTAKE_NOT_ASSESSABLE'));
  for (const parameter of input.openParameters || []) sources.push(source('PARAMETER', parameter));
  if (!['PASS', 'PASS_WITH_CONTEXT', 'WARNING'].includes(routing.state)) sources.push(source('DOMAIN', `ROUTING_${routing.state}`));
  return {
    level: 'NOT_CALIBRATED',
    sources: dedupeSources(sources),
    numericalProbabilitiesEmitted: false,
    confidenceChangesHierarchyPriority: false,
    materiality: {
      changesTarget: protein.divergenceFlags?.length > 0 || carbohydrate.state === 'TARGET_NOT_IDENTIFIED',
      changesRoute: !['PASS', 'PASS_WITH_CONTEXT', 'WARNING'].includes(routing.state),
      changesRegionWidth: Boolean(energy.initialTargetRange && energy.initialTargetRange[0] !== energy.initialTargetRange[1]),
      changesFeasibilityAcrossEndpoints: solver.regionStatus === 'PARTIALLY_FEASIBLE_ACROSS_ENERGY_ENVELOPE'
    }
  };
}

function classifyScientificStatus({ routing, physiology, solver }) {
  if (routing.state === 'TECHNICAL_INVALID') return 'TECHNICAL_INVALID';
  if (routing.state === 'FULL_ABSTAIN') return 'ABSTAINED';
  if (routing.state === 'MODULE_ABSTAIN') return 'MODULE_ABSTAINED';
  if (routing.state === 'SPECIALIST_ROUTE') return physiology.status === 'TARGET_NOT_IDENTIFIED' ? 'ROUTED_TARGET_NOT_IDENTIFIED' : 'ROUTED';
  if (routing.state === 'BLOCKED_STRATEGY') return solver.regionStatus === 'INFEASIBLE_PROTECTED' ? 'UPSTREAM_BACKTRACK_REQUIRED' : 'ROUTED_REVIEW_REQUIRED';
  if (routing.state === 'REVIEW_REQUIRED') return 'ROUTED_REVIEW_REQUIRED';
  if (routing.state === 'REQUEST_INFORMATION') return 'UNRESOLVED_MISSING_INFORMATION';
  if (solver.regionStatus === 'CONFLICTING_CONSTRAINTS') return 'UNRESOLVED_CONFLICTING_CONSTRAINTS';
  if (solver.regionStatus === 'INFEASIBLE_PROTECTED') return 'UPSTREAM_BACKTRACK_REQUIRED';
  if (solver.regionStatus === 'PARTIALLY_FEASIBLE_ACROSS_ENERGY_ENVELOPE') return 'PARTIALLY_RESOLVED_ACROSS_ENERGY_ENVELOPE';
  if (physiology.status !== 'RESOLVED') return physiology.status === 'TARGET_NOT_IDENTIFIED' ? 'TARGET_NOT_IDENTIFIED' : 'UNRESOLVED_PHYSIOLOGY';
  if (solver.regionStatus === 'RESOLVED_WITH_SOFT_COMPROMISE') return 'RESOLVED_WITH_SOFT_COMPROMISE';
  if (solver.regionStatus === 'RESOLVED_ALL_ENERGY_ENDPOINTS') return 'SCIENTIFICALLY_RESOLVED_REGION';
  return 'FEASIBILITY_UNKNOWN';
}

function buildPresentationContract(status, routing, solver, selection, uncertainty) {
  if (status === 'TECHNICAL_INVALID' || status === 'ABSTAINED') return { status: 'NOT_READY', mode: 'ROUTING_ONLY', pointRequired: false };
  if (selection.status === 'POINT_SELECTED') return { status: 'POINT_READY_PENDING_DISPLAY_REVALIDATION', mode: 'POINT', pointRequired: true };
  if (['SCIENTIFICALLY_RESOLVED_REGION', 'RESOLVED_WITH_SOFT_COMPROMISE'].includes(status)) {
    return {
      status: 'REGION_READY',
      mode: 'COUPLED_REGION',
      pointRequired: false,
      displayRequirements: ['ENERGY_ENVELOPE', 'CONDITIONAL_MACRO_RELATION', 'MULTIPLE_VALID_DISTRIBUTIONS_LABEL', 'UNCERTAINTY_DISCLOSURE'],
      wideRegionWarning: uncertainty.materiality.changesRegionWidth
    };
  }
  return { status: routing.permissions.canReturnDiagnostics ? 'DIAGNOSTIC_ONLY' : 'NOT_READY', mode: 'NO_AUTONOMOUS_TARGET', pointRequired: false, regionStatus: solver.regionStatus };
}

function buildMenuContract(status, routing, solver, selection) {
  const resolved = ['SCIENTIFICALLY_RESOLVED_REGION', 'RESOLVED_WITH_SOFT_COMPROMISE'].includes(status);
  const canUseRegion = resolved && routing.permissions.canGenerateMenu && ['RESOLVED_ALL_ENERGY_ENDPOINTS', 'RESOLVED_WITH_SOFT_COMPROMISE'].includes(solver.regionStatus);
  const compromise = status === 'RESOLVED_WITH_SOFT_COMPROMISE';
  if (selection.status === 'POINT_SELECTED' && routing.permissions.canGenerateMenu) {
    return menuResult('ELIGIBLE_SELECTED_POINT', 'SELECTED_POINT_INPUT_ALLOWED', true, compromise);
  }
  if (canUseRegion) return menuResult('ELIGIBLE_REGION_NATIVE', 'REGION_NATIVE_SELECTION_ALLOWED', true, compromise);
  return menuResult('INELIGIBLE', `BLOCKED_BY_${status}`, false, false);
}

function menuResult(status, permission, mayRun, compromiseDisclosure) {
  return {
    status,
    permission,
    mayInvokeMenuEngine: mayRun,
    currentMenuResultReady: false,
    menuEngineEvaluated: false,
    mustConsumeTargetContract: true,
    mayOptimizePracticalFoodVariables: mayRun,
    mayRewritePhysiology: false,
    mayRelaxProtectedConstraints: false,
    mayChangeEnergyStrategy: false,
    requiresSoftCompromiseDisclosure: compromiseDisclosure,
    everyChosenPointRequiresProvenanceAndRevalidation: true
  };
}

function buildMissingness(input, energy, protein, fat, carbohydrate, selection) {
  return {
    training: input.profile?.sessionsPerWeek == null || input.profile?.trainingModality == null ? 'MISSING' : 'OBSERVED_OR_EXPLICIT_NONE',
    efaIntake: fat.efaAssessability === 'NOT_ASSESSABLE' ? 'NOT_ASSESSABLE' : 'ASSESSABLE',
    bodyComposition: input.profile?.bodyFatPercent == null ? 'MISSING' : 'OBSERVED',
    energySelection: energy.selected == null ? 'NOT_SELECTED' : 'SELECTED',
    proteinSelection: protein.selected == null ? 'NOT_SELECTED' : 'SELECTED',
    fatSelection: fat.selected == null ? 'NOT_SELECTED' : 'SELECTED',
    carbohydrateSelection: carbohydrate.selected == null ? 'NOT_SELECTED' : 'SELECTED',
    macroPointSelection: selection.selectedPoint == null ? 'NOT_SELECTED' : 'SELECTED',
    nullCoercionPolicy: 'NULL_NEVER_MEANS_ZERO',
    stateVocabulary: ['MISSING', 'UNKNOWN', 'NOT_ASSESSABLE', 'NOT_APPLICABLE', 'NOT_IDENTIFIED', 'ABSTAINED', 'NOT_SELECTED']
  };
}

function buildAdvancedHandoff(routing, carbohydrate, uncertainty) {
  const required = routing.state === 'SPECIALIST_ROUTE' || routing.state === 'REQUEST_INFORMATION';
  const performanceTargetMissing = carbohydrate.targetState === 'PERFORMANCE_TARGET_NOT_IDENTIFIED';
  const classificationQuestion = routing.state === 'REQUEST_INFORMATION' && !performanceTargetMissing;
  return {
    required,
    handoffType: performanceTargetMissing ? 'EXTERNAL_SPECIALIST_ROUTE'
      : classificationQuestion ? 'REQUEST_INFORMATION' : 'NOT_APPLICABLE',
    destination: performanceTargetMissing ? 'PERFORMANCE_NUTRITION_SPECIALIST_ROUTE'
      : classificationQuestion ? 'A7_STANDARD_MODE_CLASSIFICATION' : null,
    reason: performanceTargetMissing ? 'PERFORMANCE_CARBOHYDRATE_TARGET_NOT_IDENTIFIED'
      : routing.state === 'REQUEST_INFORMATION' ? 'HIGH_VALUE_INFORMATION_MAY_CHANGE_ROUTE_OR_MODE' : null,
    requestedEvidence: required ? ['REALIZED_WORKLOAD_DETAIL', 'LONGEST_SESSION', 'TWO_A_DAY', 'PERFORMANCE_CONTEXT'] : [],
    requestedEvidencePurpose: performanceTargetMissing
      ? 'SPECIALIST_CONTEXT_OR_FUTURE_MODEL_INPUT_NOT_CURRENT_INTERNAL_TARGET_RESOLUTION'
      : classificationQuestion ? 'MAY_RESOLVE_MODE_CLASSIFICATION_ONLY' : 'NOT_APPLICABLE',
    evidenceCanActivateUnavailableResolver: false,
    expectedIncrementalValue: performanceTargetMissing
      ? 'MAY_SUPPORT_EXTERNAL_SPECIALIST_ASSESSMENT_INTERNAL_RESOLUTION_NOT_AVAILABLE'
      : classificationQuestion ? 'MAY_RESOLVE_STANDARD_MODE_CLASSIFICATION_NOT_PERFORMANCE_DOSE' : 'NOT_APPLICABLE',
    internalAdvancedResolver: resolverCapabilityRegistry.advanced,
    standardResolver: resolverCapabilityRegistry.standard,
    classificationResolver: classificationQuestion ? resolverCapabilityRegistry.modeClassificationQuestion : null,
    externalSpecialistRoute: performanceTargetMissing ? resolverCapabilityRegistry.externalSpecialist : null,
    advancedEligibility: 'FUTURE_CAPABILITY_NOT_IMPLEMENTED',
    modules: required ? ['A7', 'A8', 'A9'] : [],
    capabilityRegistryVersion: resolverCapabilityRegistry.version
  };
}

function toEndpointValue(run, range) {
  return { energyKcal: run.energyKcal ?? run.targetEnergy ?? null, range: range ?? null };
}

function endpointRanges(runs, selector) {
  const values = runs.map(run => toEndpointValue(run, selector(run)));
  return values.length === 1 ? values[0].range : values;
}

function absentModuleContract(state, reason) {
  return { state, reason, selected: null, selectedState: 'NOT_APPLICABLE_OR_NOT_EVALUATED' };
}

function summarizeEndpointState(endpoints, key) {
  const states = unique(endpoints.map(item => item[key]));
  return states.length === 1 ? states[0] : states;
}

function source(type, code) {
  return { type, code };
}

function dedupeSources(sources) {
  return [...new Map(sources.map(item => [`${item.type}:${item.code}`, item])).values()]
    .sort((a, b) => a.type.localeCompare(b.type) || a.code.localeCompare(b.code));
}

function normalizeRange(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) ? [value[0], value[1]] : null;
}

function serializableRange(value) {
  if (!Array.isArray(value) || value.length !== 2 || !Number.isFinite(value[0])) return null;
  return {
    lower: value[0],
    upper: Number.isFinite(value[1]) ? value[1] : null,
    upperUnbounded: !Number.isFinite(value[1])
  };
}

function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined))];
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortedObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function numericSort(a, b) {
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
