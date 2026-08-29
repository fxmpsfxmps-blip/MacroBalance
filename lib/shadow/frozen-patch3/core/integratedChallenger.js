import { CHALLENGER_VERSION, challengerFreezeRegistry } from '../config/challengerFreezeRegistry.js';
import { getExperimentalParameterSet } from '../config/parameterRegistry.js';
import { normalizeAndValidateProfile, evaluateScope, assessInputQuality, deepFreeze } from './inputScope.js';
import { inferContextualActivity } from './activityClassifier.js';
import { activityDebug, energyPrior } from './energy.js';
import { runProteinEnvelopeLab } from '../models/proteinEnvelopeAdapter.js';
import { runFatEnvelopeLab } from '../models/fatEnvelopeAdapter.js';
import { runCarbohydrateEnvelopeLab } from '../models/carbEnvelopeAdapter.js';
import { runSolverEnvelopeLab } from '../models/solverEnvelopeAdapter.js';
import { evaluateEnergyGuardrail } from './energyGuardrailLab.js';
import { runRateEnergyEnvelopeLab } from './rateEnergyLab.js';
import { buildScientificTargetContract } from './targetContract.js';
import { ownerRunIntegrity } from '../benchmarks/profiles.js';

export const INTEGRATED_ORCHESTRATOR_VERSION = 'integrated-challenger-orchestrator-0.3.3';
export const INTEGRATED_RESULT_STATUSES = deepFreeze([
  'COMPLETE', 'COMPLETE_WITH_RELAXATION', 'PARTIAL', 'REQUEST_INFORMATION',
  'UPSTREAM_BACKTRACK', 'REVIEW_REQUIRED', 'SPECIALIST_ROUTE', 'MODULE_ABSTAIN',
  'FULL_ABSTAIN', 'TECHNICAL_INVALID'
]);

const a1Parameters = getExperimentalParameterSet('LAB_E01').values.A1;

export function runIntegratedChallenger(rawProfile, options = {}) {
  const immutableInput = structuredClone(rawProfile);
  const validation = normalizeAndValidateProfile(immutableInput);
  const profileId = rawProfile?.profileId || options.profileId || 'ANONYMOUS_PROFILE';
  const ownerIntegrity = ownerRunIntegrity(rawProfile);
  if (validation.status !== 'VALID') return technicalInvalid(profileId, rawProfile, validation, ownerIntegrity);

  const profile = validation.profile;
  const scope = evaluateScope(profile);
  const inputQuality = assessInputQuality(profile);
  const a1 = buildA1Trace(profile);
  const energy = buildEnergyState(profile, a1);
  const b1 = runRateEnergyEnvelopeLab(profile, { teeRange: energy.teeRange });
  const a2a3 = buildA2A3Trace(profile, energy, options, b1);
  const targetEnergies = numericEnergyCandidates(a2a3);
  const preA9 = buildGuardrailRuns(profile, scope, energy, a2a3, targetEnergies, 'PRE_SOLVER', 'UNKNOWN', [], b1.A9);

  const proteinParameterSetId = options.proteinParameterSetId || 'LAB_PROTEIN_E03';
  const proteinRuns = targetEnergies.map(energyKcal => runProteinEnvelopeLab(profile, { energyKcal, parameterSetId: proteinParameterSetId }));
  const fatParameterSetId = options.fatParameterSetId || 'LAB_FAT_E03';
  const carbParameterSetId = options.carbParameterSetId || 'LAB_CARB_E03';
  const fatRuns = targetEnergies.map(energyKcal => runFatEnvelopeLab(profile, { energyKcal, parameterSetId: fatParameterSetId }));
  const carbRuns = targetEnergies.map(energyKcal => runCarbohydrateEnvelopeLab(profile, { energyKcal, parameterSetId: carbParameterSetId }));
  const a4a5 = moduleTrace('A4/A5', proteinRuns, targetEnergies, nullModule('ENERGY_PROPOSAL_UNRESOLVED'));
  const a6 = moduleTrace('A6', fatRuns, targetEnergies, nullModule('ENERGY_PROPOSAL_UNRESOLVED'));
  const a7 = moduleTrace('A7', carbRuns, targetEnergies, nullModule('ENERGY_PROPOSAL_UNRESOLVED'));

  const solverRuns = targetEnergies.map((energyKcal, index) => {
    const guardrail = preA9.runs[index];
    if (!guardrail?.permissions?.energyProposalMayProceedToA8 || preA9.ordinaryPolicy?.mayProceedToA8 === false) {
      return blockedSolverResult(guardrail, preA9.ordinaryPolicy, energyKcal);
    }
    return runSolverEnvelopeLab({
      energyKcal,
      scopeState: 'IN_SCOPE',
      guardrailState: 'PASS',
      constraints: buildNullPreservingConstraints(proteinRuns[index], fatRuns[index], carbRuns[index], fatParameterSetId, carbParameterSetId),
      backtrackHistory: options.backtrackHistory || []
    });
  });
  const a8 = moduleTrace('A8', solverRuns, targetEnergies, nullModule('ENERGY_PROPOSAL_UNRESOLVED'));
  const macroState = solverRuns.some(run => run.solutionStatus === 'PROTECTED_INFEASIBLE') ? 'INFEASIBLE_PROTECTED'
    : solverRuns.length && solverRuns.every(run => run.hardFeasibility === 'FEASIBLE') ? 'FEASIBLE'
      : 'UNKNOWN';
  const postA9 = buildGuardrailRuns(profile, scope, energy, a2a3, targetEnergies, 'POST_SOLVER', macroState, solverRuns, b1.A9);

  const final = selectIntegratedStatus(scope, a2a3, preA9, a8, postA9);
  const warnings = unique([
    ...scope.reasons,
    ...(ownerIntegrity.stale ? ['STALE_OWNER_RUN'] : []),
    ...a1.reasonCodes,
    ...(preA9.ordinaryPolicy?.reasonCodes || []),
    ...preA9.runs.flatMap(run => run.reasonCodes || []),
    ...postA9.runs.flatMap(run => run.reasonCodes || []),
    'SHADOW_ONLY',
    'NO_E01_NUMERIC_FALLBACK'
  ]);
  const openParameters = unique([
    ...Object.values(challengerFreezeRegistry.modules).flatMap(module => module.knownOpenParameters.map(item => `${module.id}:${item}`)),
    ...preA9.runs.flatMap(run => run.openParametersUsed || []),
    ...postA9.runs.flatMap(run => run.openParametersUsed || [])
  ]);

  const proteinEnvelope = commonProteinEnvelope(proteinRuns);
  const fatEnvelope = commonMacroEnvelope(fatRuns, 'referenceSoftRange', 'selectedFat', 'referenceSoftRange');
  const carbEnvelope = commonMacroEnvelope(carbRuns, 'activeRange', 'selectedCarb');
  const energyContractInput = { teeRange: energy.teeRange, targetRange: a2a3.targetRange, selectedEnergy: a2a3.selectedEnergy };
  const targetContract = buildScientificTargetContract({
    profileId,
    profile,
    scope,
    inputQuality,
    a1,
    a2a3,
    energy: energyContractInput,
    strategyDirection: profile.goal,
    proteinRuns,
    fatRuns,
    carbRuns,
    solverRuns,
    preA9,
    postA9,
    legacyStatus: final.status,
    legacyDecision: final.decision,
    openParameters,
    challengerVersion: CHALLENGER_VERSION,
    orchestratorVersion: INTEGRATED_ORCHESTRATOR_VERSION,
    freezeRegistryVersion: challengerFreezeRegistry.registryVersion,
    parameterSetVersions: {
      activity: 'LAB_E01:A1',
      rateEnergy: b1.modelId,
      protein: proteinParameterSetId,
      fat: fatParameterSetId,
      carbohydrate: carbParameterSetId,
      solver: 'LAB_SOLVER_E02',
      guardrail: 'LAB_GUARDRAIL_E02'
    },
    moduleVersions: Object.fromEntries(Object.entries(challengerFreezeRegistry.modules).map(([id, module]) => [id, module.modelVersion])),
    contractTimestamp: options.contractTimestamp || null
  });
  return deepFreeze({
    profileId,
    participantId: profile.participantId || null,
    challengerVersion: CHALLENGER_VERSION,
    orchestratorVersion: INTEGRATED_ORCHESTRATOR_VERSION,
    status: final.status,
    decision: final.decision,
    legacyStatus: final.status,
    scientificStatus: targetContract.scientificStatus,
    targetContract,
    shadowMode: 'SHADOW_ONLY',
    productionEligible: false,
    menuEligible: false,
    inputProvenance: {
      suppliedProfileId: rawProfile?.profileId || null,
      participantDataVersion: profile.participantDataVersion || null,
      benchmarkSplit: profile.benchmarkSplit || null,
      immutableInputPreserved: JSON.stringify(rawProfile) === JSON.stringify(immutableInput),
      trainingInputState: profile.trainingInput.state,
      trainingInputContractVersion: profile.trainingInput.schemaVersion,
      ownerIntegrity
    },
    stageOrder: ['INPUT', 'SCOPE', 'A1', 'A2_A3', 'A9_PRE_SOLVER', 'A4_A5', 'A6', 'A7', 'A8', 'A9_POST_SOLVER', 'RESULT_CONTRACT'],
    trace: {
      input: { validation, inputQuality },
      scope: traceStage('SCOPE', scope.state, scope, scope.reasons, []),
      A1: a1,
      A2_A3: a2a3,
      A4_A5: a4a5,
      A6: a6,
      A7: a7,
      A8: a8,
      A9: { preSolver: preA9, postSolver: postA9 }
    },
    energy: energyContractInput,
    target: {
      selected: null,
      feasibleRegion: targetContract.solver.jointRegion,
      protein: proteinEnvelope,
      fat: fatEnvelope,
      carbs: carbEnvelope,
      fourNumberProjection: null,
      nullReason: proteinEnvelope && (fatEnvelope || carbEnvelope)
        ? 'SELECTED_POINTS_REMAIN_NULL_UNTIL_A8_UNIQUE_OR_EXPLICIT'
        : proteinEnvelope ? 'A6_A7_NUMERIC_SURFACES_OPEN_OR_RESIDUAL_MODE' : 'A4_A5_REFERENCE_SIZE_REVIEW_OR_MACRO_SURFACES_OPEN'
    },
    nullFields: ['target.selected', ...(proteinEnvelope ? [] : ['target.protein']), ...(fatEnvelope ? [] : ['target.fat']), ...(carbEnvelope ? [] : ['target.carbs']), 'target.fourNumberProjection'],
    warnings,
    reasonCodes: unique([final.decision, ...warnings]),
    openParametersEncountered: openParameters,
    presentationStatus: targetContract.presentation.status,
    menuPermission: targetContract.menu.permission,
    provenance: { freezeRegistry: challengerFreezeRegistry, rateEnergyB1: b1.provenance,
      proteinParameterSetId, fatParameterSetId, carbParameterSetId, oldComparatorFallbackUsed: false }
  });
}

function buildA1Trace(profile) {
  const inference = inferContextualActivity(profile, a1Parameters);
  const candidates = inference.classCandidates.map(activityClass => {
    const activity = activityDebug({ ...profile, activityClass, activityClassSource: 'A1_ENVELOPE_COUNTERFACTUAL' }, a1Parameters);
    const energy = energyPrior(profile, activity);
    return { activityClass, tee: energy.tee, rmr: energy.rmrSanity, method: energy.method };
  });
  const tees = candidates.map(item => item.tee).filter(Number.isFinite);
  return deepFreeze({
    module: 'A1', modelVersion: inference.modelVersion, parameterVersion: 'LAB_E01:A1',
    inputProvenance: { occupation: profile.occupation ?? null, steps: profile.steps ?? null,
      stepsCoverage: profile.stepsCoverage ?? null, realizedTrainingOnly: true, macroInputsReceived: false,
      trainingInputState: profile.trainingInput?.state ?? null,
      trainingInputContractVersion: profile.trainingInput?.schemaVersion ?? null },
    decision: inference.status, selectedValues: { activityClass: inference.selectedClass },
    ranges: { activityClass: inference.classEnvelope, teeKcal: tees.length ? [Math.min(...tees), Math.max(...tees)] : null },
    nullFields: inference.selectedClass === null ? ['selectedValues.activityClass'] : [],
    reasonCodes: inference.reasonCodes, warnings: [...inference.missingness, ...inference.contradictions],
    openParametersEncountered: challengerFreezeRegistry.modules.A1.knownOpenParameters,
    inference, candidates
  });
}

function buildEnergyState(profile, a1) {
  const tees = a1.candidates.map(item => item.tee).filter(Number.isFinite);
  return { teeRange: tees.length ? [Math.min(...tees), Math.max(...tees)] : null,
    rmr: a1.candidates.find(item => Number.isFinite(item.rmr))?.rmr ?? null };
}

function buildA2A3Trace(profile, energy, options, b1) {
  const diagnostic = Number.isFinite(options.diagnosticEnergyProposalKcal)
    ? options.diagnosticEnergyProposalKcal
    : Number.isFinite(profile.diagnosticEnergyProposalKcal) ? profile.diagnosticEnergyProposalKcal : null;
  const maintenance = profile.goal === 'MAINTENANCE';
  const targetRange = diagnostic !== null ? [diagnostic, diagnostic] : b1.A3?.targetEnergyKcal ?? null;
  const decision = diagnostic !== null ? 'EXPLICIT_DIAGNOSTIC_ENERGY_PROPOSAL_NOT_GLOBAL_POLICY'
    : maintenance ? 'MAINTENANCE_IDENTITY_OVER_TEE_ENVELOPE' : b1.A3?.status === 'ENERGY_EXECUTABLE'
      ? 'B1_RATE_AND_INITIAL_ENERGY_ENVELOPES_EXECUTABLE' : 'RATE_OR_TEE_REQUIRED';
  return traceStage('A2/A3', targetRange ? 'ENERGY_EXECUTABLE' : 'PARTIAL', {
    modelVersion: challengerFreezeRegistry.modules.A2_A3.modelVersion,
    parameterVersion: b1.modelId,
    inputProvenance: { goal: profile.goal, requestedRatePerWeek: profile.requestedRatePerWeek ?? null,
      diagnosticEnergyProposal: diagnostic !== null },
    decision,
    selectedValues: { rate: null, energy: null },
    ranges: { rate: b1.A2?.signedRateRangePerWeek ?? null, targetEnergyKcal: targetRange },
    nullFields: ['selectedValues.rate', 'selectedValues.energy'],
    openParametersEncountered: b1.provenance?.openParameters || challengerFreezeRegistry.modules.A2_A3.knownOpenParameters,
    targetRange,
    selectedEnergy: null,
    b1
  }, [decision, ...(b1.reasonCodes || [])], b1.provenance?.openParameters || challengerFreezeRegistry.modules.A2_A3.knownOpenParameters);
}

function buildGuardrailRuns(profile, scope, energy, a2a3, energies, phase, macroState, solverRuns = [], ordinaryPolicy = null) {
  const context = contextFromProfile(profile);
  const runs = energies.map((targetEnergy, index) => evaluateEnergyGuardrail({
    targetEnergy,
    teeRange: energy.teeRange,
    rmr: energy.rmr,
    scopeState: scope.allowsComplete ? 'IN_SCOPE' : scope.state,
    scopeReasons: scope.reasons,
    strategyDirection: profile.goal,
    rateState: a2a3.b1?.A2?.status === 'RATE_EXECUTABLE' ? 'RESOLVED_IN_SUPPORTED_RANGE' : 'UNRESOLVED',
    macroFeasibilityState: macroState,
    minimumEnergyForCurrentProtectedConstraintSet: solverRuns[index]?.minimumEnergyForCurrentProtectedConstraintSet ?? null,
    micronutrientCoverageState: 'UNKNOWN', phase, context
  }));
  if (!runs.length) runs.push(evaluateEnergyGuardrail({
    targetEnergy: null, teeRange: energy.teeRange, rmr: energy.rmr,
    scopeState: scope.allowsComplete ? 'IN_SCOPE' : scope.state, scopeReasons: scope.reasons,
    strategyDirection: profile.goal, rateState: 'UNRESOLVED', macroFeasibilityState: macroState,
    micronutrientCoverageState: 'UNKNOWN', phase, context
  }));
  return deepFreeze({ phase, targetRange: a2a3.targetRange, ordinaryPolicy, runs });
}

function contextFromProfile(profile) {
  const flags = new Set(profile.scopeFlags || []);
  return {
    pregnancy: flags.has('PREGNANCY'), ckd: flags.has('CKD'), recentBariatric: flags.has('RECENT_BARIATRIC'),
    glp1LowSpontaneousIntake: flags.has('GLP1'), medications: flags.has('SGLT2') ? ['SGLT2'] : [],
    dietStrategy: profile.lowCarbPreference === 'KETOGENIC' ? 'KETOGENIC' : 'NONE',
    trainingDemand: ['HIGH', 'EXTREME'].includes(profile.workload) ? profile.workload : 'ORDINARY',
    athlete: ['HIGH', 'EXTREME'].includes(profile.workload), olderAdult: profile.age >= 65,
    clinicalFlags: flags.has('ACUTE_ILLNESS') ? ['ACUTE_ILLNESS'] : [], redsWarningSignals: []
  };
}

function buildNullPreservingConstraints(protein, fat, carb, fatParameterSetId = 'LAB_FAT_E02', carbParameterSetId = 'LAB_CARB_E02') {
  const constraints = [
    constraint('A4_A5_PROTEIN_PROTECTED_LOWER', 'protein', 'PROTECTED', 'L2', protein?.target?.protectedConstraintRange ?? null, protein?.parameterSetId || 'LAB_PROTEIN_E02'),
    constraint('A4_A5_PROTEIN_PREFERRED_RANGE', 'protein', 'OPTIMIZATION_SOFT', 'L4', protein?.target?.preferredRange ?? null, protein?.parameterSetId || 'LAB_PROTEIN_E02')
  ];
  if (carb?.activeRange || carb?.preferredRange || carbParameterSetId !== 'LAB_CARB_E03') {
    constraints.push(constraint('A7_ACTIVE_CARBOHYDRATE_SURFACE', 'carbs', carb?.activeRange ? 'HIGH_PRIORITY_SOFT' : 'OPTIMIZATION_SOFT', carb?.activeRange ? 'L3' : 'L4', carb?.preferredRange ?? null, carb?.parameterSetId || carbParameterSetId));
  }
  if (fat?.referenceSoftRange || fat?.preferredRange) {
    constraints.push(constraint('A6_FAT_SURFACE', 'fat', 'REFERENCE_SOFT', 'L5', fat.referenceSoftRange || fat.preferredRange, fat.parameterSetId || fatParameterSetId));
  }
  return constraints;
}

function commonProteinEnvelope(runs) {
  if (!runs.length || runs.some(run => !run.target?.solverEligible)) return null;
  const first = runs[0].target;
  const same = runs.every(run => run.target.protectedLower === first.protectedLower
    && JSON.stringify(run.target.preferredRange) === JSON.stringify(first.preferredRange)
    && run.target.referenceBasis === first.referenceBasis);
  if (!same) return null;
  return {
    protectedLower: first.protectedLower,
    preferredRange: first.preferredRange,
    upperContext: first.upperContext,
    selectedPoint: null,
    referenceBasis: first.referenceBasis,
    safetyUpperLimit: null
  };
}

function commonMacroEnvelope(runs, rangeField, selectedField, outputField = 'preferredRange') {
  if (!runs.length || runs.some(run => !run.solverEligible || !Array.isArray(run[rangeField]))) return null;
  const first = runs[0][rangeField];
  const same = runs.every(run => JSON.stringify(run[rangeField]) === JSON.stringify(first));
  if (same) return { [outputField]: first, selectedPoint: null, source: runs[0].parameterSetId, selectedField };
  return {
    [outputField]: null,
    selectedPoint: null,
    source: runs[0].parameterSetId,
    selectedField,
    energyConditioned: runs.map(run => ({ energyKcal: run.energyKcal, range: run[rangeField] }))
  };
}

function constraint(id, variable, semanticClass, level, range, sourceMethod) {
  return { id, semanticKey: id, variable, semanticClass, level, range, version: 1,
    sourceMethod, confidenceStatus: 'NOT_CALIBRATED' };
}

function moduleTrace(module, runs, energies, empty) {
  if (!runs.length) return deepFreeze({ module, ...empty });
  return deepFreeze({
    module,
    decision: unique(runs.map(run => run.decision || run.status)),
    selectedValues: runs.map((run, index) => ({ energyKcal: energies[index],
      selectedPoint: run.target?.selectedPoint ?? run.selectedFat ?? run.selectedCarb ?? run.selected ?? null })),
    ranges: runs.map((run, index) => ({ energyKcal: energies[index],
      preferredRange: run.target?.preferredRange ?? run.preferredRange ?? run.activeRange ?? run.authorizedRegion ?? null })),
    nullFields: ['selectedPoint'],
    reasonCodes: unique(runs.flatMap(run => run.reasonCodes || run.warnings || [])),
    warnings: unique(runs.flatMap(run => run.warnings || [])),
    openParametersEncountered: unique(runs.flatMap(run => run.openParametersUsed || [])),
    runs
  });
}

function nullModule(reason) {
  return { decision: reason, selectedValues: null, ranges: null, nullFields: ['selectedValues', 'ranges'],
    reasonCodes: [reason], warnings: [], openParametersEncountered: [] };
}

function blockedSolverResult(guardrail, ordinaryPolicy = null, targetEnergy = null) {
  return deepFreeze({ status: guardrail?.status === 'TECHNICAL_INVALID' ? 'TECHNICAL_INVALID' : 'ABSTAIN',
    solutionStatus: 'UPSTREAM_GUARDRAIL_BLOCKED', targetEnergy, selected: null, authorizedRegion: null,
    reasonCodes: unique([...(guardrail?.reasonCodes || []), ...(ordinaryPolicy?.reasonCodes || [])]),
    minimumEnergyForCurrentProtectedConstraintSet: null });
}

function selectIntegratedStatus(scope, a2a3, preA9, a8, postA9) {
  if (scope.state === 'OUT_OF_SCOPE') return { status: 'FULL_ABSTAIN', decision: 'SCOPE_PRECEDENCE' };
  if (scope.state === 'MODULE_BLOCKED') return { status: 'MODULE_ABSTAIN', decision: 'SCOPE_MODULE_BLOCK' };
  if (scope.state === 'BLOCKED_STRATEGY') return { status: 'REVIEW_REQUIRED', decision: 'BLOCKED_STRATEGY_REQUIRES_REVIEW' };
  if (scope.state === 'REVIEW') return { status: 'REVIEW_REQUIRED', decision: 'UPSTREAM_REVIEW_PRESERVED' };
  const guardrails = [...preA9.runs, ...postA9.runs];
  const ordinaryPolicies = [preA9.ordinaryPolicy, postA9.ordinaryPolicy].filter(Boolean);
  if (ordinaryPolicies.some(policy => policy.status === 'BLOCKED_STRATEGY')) return { status: 'REVIEW_REQUIRED', decision: 'B1_ORDINARY_STRATEGY_BLOCK' };
  if (ordinaryPolicies.some(policy => policy.status === 'REVIEW_REQUIRED')) return { status: 'REVIEW_REQUIRED', decision: 'B1_ORDINARY_REVIEW_REQUIRED' };
  if (ordinaryPolicies.some(policy => policy.status === 'REQUEST_INFORMATION') && !a2a3.targetRange) return { status: 'REQUEST_INFORMATION', decision: 'B1_TEE_OR_RATE_INFORMATION_REQUIRED' };
  if (guardrails.some(run => run.status === 'SPECIALIST_ROUTE' || run.route === 'SPECIALIST_ROUTE')) return { status: 'SPECIALIST_ROUTE', decision: 'A9_SPECIALIST_ROUTE' };
  if (guardrails.some(run => ['REVIEW_REQUIRED', 'BLOCKED_STRATEGY'].includes(run.status))) return { status: 'REVIEW_REQUIRED', decision: 'A9_REVIEW_OR_BLOCK' };
  if (guardrails.some(run => run.status === 'REQUEST_INFORMATION') && !a2a3.targetRange) return { status: 'REQUEST_INFORMATION', decision: 'ENERGY_PROPOSAL_REQUIRED' };
  if (a8.runs?.some(run => run.status === 'UPSTREAM_BACKTRACK')) return { status: 'UPSTREAM_BACKTRACK', decision: 'A8_PROTECTED_INFEASIBILITY' };
  return { status: 'PARTIAL', decision: 'FEASIBILITY_UNKNOWN_OPEN_NUMERIC_SURFACES' };
}

function numericEnergyCandidates(a2a3) {
  if (!a2a3.targetRange) return [];
  return unique(a2a3.targetRange.filter(Number.isFinite));
}

function traceStage(module, decision, data, reasonCodes = [], openParameters = []) {
  return deepFreeze({ module, decision, ...data, reasonCodes, warnings: data.warnings || [], openParametersEncountered: openParameters });
}

function technicalInvalid(profileId, rawProfile, validation, ownerIntegrity) {
  const targetContract = buildScientificTargetContract({
    profileId,
    profile: rawProfile || {},
    scope: { state: 'TECHNICAL_INVALID' },
    inputQuality: null,
    energy: { teeRange: null, targetRange: null, selectedEnergy: null },
    strategyDirection: rawProfile?.goal || null,
    proteinRuns: [], fatRuns: [], carbRuns: [], solverRuns: [],
    preA9: { runs: [] }, postA9: { runs: [] },
    legacyStatus: 'TECHNICAL_INVALID', legacyDecision: 'INPUT_CONTRACT_INVALID',
    challengerVersion: CHALLENGER_VERSION,
    orchestratorVersion: INTEGRATED_ORCHESTRATOR_VERSION,
    freezeRegistryVersion: challengerFreezeRegistry.registryVersion,
    parameterSetVersions: {}, moduleVersions: {}
  });
  return deepFreeze({ profileId, participantId: rawProfile?.participantId || null,
    challengerVersion: CHALLENGER_VERSION, orchestratorVersion: INTEGRATED_ORCHESTRATOR_VERSION,
    status: 'TECHNICAL_INVALID', decision: 'INPUT_CONTRACT_INVALID', shadowMode: 'SHADOW_ONLY',
    legacyStatus: 'TECHNICAL_INVALID', scientificStatus: targetContract.scientificStatus, targetContract,
    productionEligible: false, menuEligible: false, inputProvenance: { ownerIntegrity },
    trace: { input: { validation }, A1: null, A2_A3: null, A4_A5: null, A6: null, A7: null, A8: null, A9: null },
    target: { selected: null, fourNumberProjection: null }, nullFields: ['target.selected', 'target.fourNumberProjection'],
    warnings: validation.errors, reasonCodes: validation.errors, openParametersEncountered: [],
    presentationStatus: targetContract.presentation.status, menuPermission: targetContract.menu.permission,
    provenance: { freezeRegistry: challengerFreezeRegistry, oldComparatorFallbackUsed: false } });
}

function unique(values) { return [...new Set(values)]; }
