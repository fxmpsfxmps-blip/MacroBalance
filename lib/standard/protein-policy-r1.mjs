import { runIntegratedChallenger } from '../shadow/frozen-patch3/core/integratedChallenger.js';
import { runSolverEnvelopeLab } from '../shadow/frozen-patch3/models/solverEnvelopeAdapter.js';
import { buildScientificTargetContract } from '../shadow/frozen-patch3/core/targetContract.js';
import { deepFreeze } from '../shadow/frozen-patch3/core/inputScope.js';
import { applyActivityInputPolicyR1, ACTIVITY_INPUT_POLICY_R1_ID, ACTIVITY_INPUT_POLICY_R1_VERSION } from './activity-input-policy-r1.mjs';
import { promoteLowBodySizeProteinRunR1 } from './low-body-size-policy-r1.mjs';

export const PROTEIN_POLICY_R1_ID = 'PROTEIN_POLICY_R1_2026_08_29';
export const PROTEIN_POLICY_R1_VERSION = 'protein-policy-r1-0.1.0';
export const PROTEIN_POLICY_R1_ORCHESTRATOR_VERSION = 'standard-protein-policy-r1-orchestrator-0.1.0';

const RESISTANCE_PREFERENCE = Object.freeze([1.4, 1.6]);
const RESISTANCE_LOSS_PREFERENCE = Object.freeze([1.6, 2.0]);
const RESISTANCE_PRACTICAL = Object.freeze([1.6, 2.0]);
const RESISTANCE_LOSS_PRACTICAL = Object.freeze([2.0, 2.2]);

export const PROTEIN_POLICY_R1 = deepFreeze({
  id: PROTEIN_POLICY_R1_ID,
  version: PROTEIN_POLICY_R1_VERSION,
  protectedLowerDensityGPerKg: { ordinary: 0.83, loss: 1.0, older: 1.0 },
  preferredDensityGPerKg: {
    ordinaryResistance: [...RESISTANCE_PREFERENCE],
    resistanceLoss: [...RESISTANCE_LOSS_PREFERENCE]
  },
  practicalSupportedDensityGPerKg: {
    resistance: [...RESISTANCE_PRACTICAL],
    resistanceLoss: [...RESISTANCE_LOSS_PRACTICAL]
  },
  selection: 'PRACTICAL_SUPPORTED_RANGE_IS_METADATA_ONLY; SOLVER_USES_PREFERRED_RANGE',
  limitations: [
    'NO_DEFICIT_SEVERITY_MODIFIER',
    'NO_BODY_FAT_SEX_OR_SURPLUS_MODIFIER',
    'NO_FREQUENCY_DURATION_OR_LOAD_SCALING',
    'FFM_REMAINS_DIAGNOSTIC_ONLY',
    'BMI30_EXECUTION_ANCHOR_UNCHANGED'
  ]
});

const PLANNED = new Set(['PLANNED', 'PLANNED_FUTURE', 'FUTURE']);

function finite(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }

function constraint(id, variable, semanticClass, level, range, sourceMethod) {
  return { id, semanticKey: id, variable, semanticClass, level, range, version: 1,
    sourceMethod, confidenceStatus: 'NOT_CALIBRATED' };
}

function buildConstraints(protein, fat, carb, fatId = 'LAB_FAT_E03', carbId = 'LAB_CARB_E03') {
  const constraints = [
    constraint('A4_A5_PROTEIN_PROTECTED_LOWER', 'protein', 'PROTECTED', 'L2', protein?.target?.protectedConstraintRange ?? null, protein?.parameterSetId || PROTEIN_POLICY_R1_ID),
    constraint('A4_A5_PROTEIN_PREFERRED_RANGE', 'protein', 'OPTIMIZATION_SOFT', 'L4', protein?.target?.preferredRange ?? null, protein?.parameterSetId || PROTEIN_POLICY_R1_ID)
  ];
  if (carb?.activeRange || carb?.preferredRange || carbId !== 'LAB_CARB_E03') {
    constraints.push(constraint('A7_ACTIVE_CARBOHYDRATE_SURFACE', 'carbs', carb?.activeRange ? 'HIGH_PRIORITY_SOFT' : 'OPTIMIZATION_SOFT', carb?.activeRange ? 'L3' : 'L4', carb?.preferredRange ?? null, carb?.parameterSetId || carbId));
  }
  if (fat?.referenceSoftRange || fat?.preferredRange) {
    constraints.push(constraint('A6_FAT_SURFACE', 'fat', 'REFERENCE_SOFT', 'L5', fat.referenceSoftRange || fat.preferredRange, fat.parameterSetId || fatId));
  }
  return constraints;
}

function canonicalTrainingIsRealized(profile) {
  return Boolean(profile?.trainingInput?.state === 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING')
    && !PLANNED.has(profile?.trainingStatus);
}

function resistanceAuthorized(profile, context) {
  return canonicalTrainingIsRealized(profile) && Boolean(context?.resistance);
}

function reviseProteinRun(run, profile) {
  if (!run?.target?.solverEligible || !run.target.preferredRange) return run;
  const context = run.proteinEvidence?.context || {};
  const authorized = resistanceAuthorized(profile, context);
  const loss = context.energyRestriction === true || profile.goal === 'LOSS';
  const interaction = authorized && loss;
  const preferredDensity = interaction ? RESISTANCE_LOSS_PREFERENCE
    : authorized ? RESISTANCE_PREFERENCE : context.preferredDensityRange;
  const practicalDensity = authorized ? (loss ? RESISTANCE_LOSS_PRACTICAL : RESISTANCE_PRACTICAL) : null;
  const anchorKg = run.target.preferredRange[1] / (context.preferredDensityRange?.[1] || 1);
  const preferredRange = preferredDensity.map(value => value * anchorKg);
  const practicalSupportedRange = practicalDensity ? practicalDensity.map(value => value * anchorKg) : null;
  const candidates = [...(context.preferredCandidates || [])];
  if (interaction) candidates.push({ id: 'RESISTANCE_PLUS_ENERGY_RESTRICTION', range: [...RESISTANCE_LOSS_PREFERENCE], precedence: 'EXPLICIT_INTERACTION_OVERRIDES_GENERIC_ELEMENTWISE_MAX' });
  const revisedContext = {
    ...context,
    preferredDensityRange: [...preferredDensity],
    preferredCandidates: candidates,
    r1Interaction: interaction,
    practicalSupportedDensityRange: practicalDensity ? [...practicalDensity] : null,
    practicalSupportedRange: practicalSupportedRange ? [...practicalSupportedRange] : null
  };
  return deepFreeze({
    ...run,
    parameterSetId: PROTEIN_POLICY_R1_ID,
    parameterStatus: 'ACTIVE_STANDARD_POLICY_REVISION',
    modelVersion: PROTEIN_POLICY_R1_VERSION,
    proteinPolicyVersion: PROTEIN_POLICY_R1_VERSION,
    decisions: { ...run.decisions, A5: interaction
      ? 'A5_DECISION_R1_RESISTANCE_PLUS_ENERGY_RESTRICTION_PREFERRED_RANGE'
      : 'A5_DECISION_R1_PRACTICAL_RESISTANCE_RANGE_METADATA_ONLY' },
    proteinEvidence: {
      ...run.proteinEvidence,
      context: revisedContext,
      densityMapping: {
        ...run.proteinEvidence.densityMapping,
        preferredDensityRange: [...preferredDensity],
        practicalSupportedDensityRange: practicalDensity ? [...practicalDensity] : null,
        practicalSupportedRange: practicalSupportedRange ? [...practicalSupportedRange] : null,
        practicalRangeIsSolverConstraint: false
      }
    },
    target: {
      ...run.target,
      preferredRange,
      candidatePreferredRange: preferredRange,
      practicalSupportedDensityRange: practicalDensity ? [...practicalDensity] : null,
      practicalSupportedRange: practicalSupportedRange ? [...practicalSupportedRange] : null,
      selectedPoint: null
    },
    provenance: {
      ...run.provenance,
      baseParameterSetId: 'LAB_PROTEIN_E03',
      policyRevision: PROTEIN_POLICY_R1_ID,
      practicalRangeExcludedFromSolver: true
    }
  });
}

function reviseTrace(trace, runs) {
  const energies = runs.map(run => run.energyKcal);
  return deepFreeze({
    module: 'A4/A5',
    decision: [...new Set(runs.map(run => run.decision || run.status))],
    selectedValues: runs.map((run, index) => ({ energyKcal: energies[index], selectedPoint: null })),
    ranges: runs.map((run, index) => ({ energyKcal: energies[index], preferredRange: run.target?.preferredRange ?? null })),
    nullFields: ['selectedPoint'],
    reasonCodes: [...new Set(runs.flatMap(run => run.reasonCodes || []))],
    warnings: [...new Set(runs.flatMap(run => run.warnings || []))],
    openParametersEncountered: [...new Set(runs.flatMap(run => run.openParametersUsed || []))],
    runs
  });
}

function commonProtein(runs) {
  if (!runs.length || runs.some(run => !run.target?.solverEligible)) return null;
  const first = runs[0].target;
  if (!runs.every(run => JSON.stringify(run.target?.preferredRange) === JSON.stringify(first.preferredRange)
    && run.target?.protectedLower === first.protectedLower)) return null;
  return {
    protectedLower: first.protectedLower,
    preferredRange: first.preferredRange,
    practicalSupportedRange: first.practicalSupportedRange || null,
    practicalSupportedDensityRange: first.practicalSupportedDensityRange || null,
    upperContext: first.upperContext,
    selectedPoint: null,
    referenceBasis: first.referenceBasis,
    safetyUpperLimit: null,
    policyId: PROTEIN_POLICY_R1_ID,
    policyVersion: PROTEIN_POLICY_R1_VERSION
  };
}

function moduleTrace(module, runs, energies) {
  return deepFreeze({
    module,
    decision: [...new Set(runs.map(run => run.status || run.solutionStatus))],
    selectedValues: runs.map((run, index) => ({ energyKcal: energies[index], selectedPoint: run.selected ?? null })),
    ranges: runs.map((run, index) => ({ energyKcal: energies[index], preferredRange: run.authorizedRegion || null })),
    nullFields: ['selectedPoint'],
    reasonCodes: [...new Set(runs.flatMap(run => run.reasonCodes || []))],
    warnings: [...new Set(runs.flatMap(run => run.warnings || []))],
    openParametersEncountered: [...new Set(runs.flatMap(run => run.openParametersUsed || []))],
    runs
  });
}

export function runProteinPolicyR1IntegratedChallenger(rawProfile, options = {}) {
  const activityInput = applyActivityInputPolicyR1(rawProfile);
  const base = runIntegratedChallenger(activityInput.profile, { ...options, proteinParameterSetId: 'LAB_PROTEIN_E03' });
  const canonical = base.trace?.input?.validation?.profile;
  const baseRuns = base.trace?.A4_A5?.runs || [];
  if (!canonical || !baseRuns.length) {
    return deepFreeze({ ...base, orchestratorVersion: PROTEIN_POLICY_R1_ORCHESTRATOR_VERSION,
      activityInputPolicy: activityInput.policy,
      trace: { ...base.trace, input: { ...(base.trace?.input || {}), activityInputPolicy: activityInput.policy } },
      proteinPolicy: { id: PROTEIN_POLICY_R1_ID, version: PROTEIN_POLICY_R1_VERSION, state: 'NOT_EVALUABLE' } });
  }
  // R1 may promote only the existing low-BMI reference-size review after the
  // separate authoritative Q1/Q2 policy has cleared it.  The frozen run still
  // supplies every numerical value; this composition creates none.
  const proteinRuns = baseRuns.map(run => reviseProteinRun(
    promoteLowBodySizeProteinRunR1(run, options.lowBodySizePolicy || null), canonical
  ));
  const fatRuns = base.trace.A6.runs;
  const carbRuns = base.trace.A7.runs;
  const baseSolverRuns = base.trace.A8.runs || [];
  const energies = baseSolverRuns.map(run => run.targetEnergy);
  const solverRuns = baseSolverRuns.map((oldRun, index) => {
    if (oldRun?.status === 'ABSTAIN' || oldRun?.status === 'TECHNICAL_INVALID') return oldRun;
    return runSolverEnvelopeLab({
      energyKcal: energies[index], scopeState: 'IN_SCOPE', guardrailState: 'PASS',
      constraints: buildConstraints(proteinRuns[index], fatRuns[index], carbRuns[index]),
      backtrackHistory: options.backtrackHistory || []
    });
  });
  const proteinEnvelope = commonProtein(proteinRuns);
  const a8 = moduleTrace('A8', solverRuns, energies);
  const targetContract = buildScientificTargetContract({
    profileId: base.profileId,
    profile: canonical,
    scope: base.trace.scope,
    inputQuality: base.trace.input.inputQuality,
    a1: base.trace.A1,
    a2a3: base.trace.A2_A3,
    energy: base.energy,
    strategyDirection: canonical.goal,
    proteinRuns, fatRuns, carbRuns, solverRuns,
    preA9: base.trace.A9.preSolver, postA9: base.trace.A9.postSolver,
    legacyStatus: base.status, legacyDecision: base.decision,
    openParameters: base.openParametersEncountered,
    challengerVersion: base.challengerVersion,
    orchestratorVersion: PROTEIN_POLICY_R1_ORCHESTRATOR_VERSION,
    freezeRegistryVersion: base.provenance.freezeRegistry.registryVersion,
    parameterSetVersions: { ...base.targetContract.provenance.parameterSetVersions, protein: PROTEIN_POLICY_R1_ID },
    moduleVersions: { ...base.targetContract.provenance.moduleVersions, 'A4/A5': PROTEIN_POLICY_R1_VERSION },
    contractTimestamp: options.contractTimestamp || null
  });
  const revisedTraining = canonical.trainingInput?.state || null;
  const interaction = proteinRuns.some(run => run.proteinEvidence?.context?.r1Interaction);
  return deepFreeze({
    ...base,
    orchestratorVersion: PROTEIN_POLICY_R1_ORCHESTRATOR_VERSION,
    scientificStatus: targetContract.scientificStatus,
    targetContract,
    menuEligible: false,
    trace: { ...base.trace, input: { ...base.trace.input, activityInputPolicy: activityInput.policy },
      A4_A5: reviseTrace(base.trace.A4_A5, proteinRuns), A8: a8 },
    target: { ...base.target, feasibleRegion: targetContract.solver.jointRegion, protein: proteinEnvelope,
      nullReason: proteinEnvelope ? base.target.nullReason : 'A4_A5_REFERENCE_SIZE_REVIEW_OR_POLICY_NOT_EVALUABLE' },
    presentationStatus: targetContract.presentation.status,
    menuPermission: targetContract.menu.permission,
    warnings: [...new Set([...(base.warnings || []), 'PROTEIN_POLICY_R1_ACTIVE'])],
    reasonCodes: [...new Set([...(base.reasonCodes || []), 'PROTEIN_POLICY_R1_ACTIVE'])],
    provenance: { ...base.provenance, proteinParameterSetId: PROTEIN_POLICY_R1_ID, proteinPolicyVersion: PROTEIN_POLICY_R1_VERSION,
      baseProteinParameterSetId: 'LAB_PROTEIN_E03', activityInputPolicyId: ACTIVITY_INPUT_POLICY_R1_ID,
      activityInputPolicyVersion: ACTIVITY_INPUT_POLICY_R1_VERSION },
    activityInputPolicy: activityInput.policy,
    proteinPolicy: { id: PROTEIN_POLICY_R1_ID, version: PROTEIN_POLICY_R1_VERSION, state: 'ACTIVE', interaction, trainingInputState: revisedTraining,
      practicalRangeSolverSelected: false }
  });
}
