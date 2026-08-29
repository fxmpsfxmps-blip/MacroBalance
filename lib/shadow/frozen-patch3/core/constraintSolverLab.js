import { deepFreeze } from './inputScope.js';

const VARIABLES = Object.freeze(['protein', 'carbs', 'fat']);
const ENERGY_PER_GRAM = Object.freeze({ protein: 4, carbs: 4, fat: 9 });
const LEVEL_ORDER = Object.freeze({ L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6 });
const CLASS_LEVEL = Object.freeze({
  HARD_DOMAIN: 'L0',
  HARD_ACCOUNTING: 'L1',
  PROTECTED: 'L2',
  HIGH_PRIORITY_SOFT: 'L3',
  OPTIMIZATION_SOFT: 'L4',
  REFERENCE_SOFT: 'L5',
  PREFERENCE: 'L6'
});

export function solveConstraintEnvelope(problem, policy) {
  const inputError = validateEnvelope(problem, policy);
  if (inputError) return terminalResult(problem, policy, 'TECHNICAL_INVALID', 'TECHNICAL_INVALID', inputError);

  const targetEnergy = problem.energyKcal;
  const epsilon = floatingPointEpsilon(targetEnergy);
  const scopeState = problem.scopeState || 'IN_SCOPE';
  const guardrailState = problem.guardrailState || 'PASS';

  if (scopeState === 'TECHNICAL_INVALID') {
    return terminalResult(problem, policy, 'TECHNICAL_INVALID', 'TECHNICAL_INVALID', 'UPSTREAM_SCOPE_TECHNICAL_INVALID');
  }
  if (!['IN_SCOPE', 'IN_SCOPE_WITH_WARNING'].includes(scopeState)) {
    return terminalResult(problem, policy, 'ABSTAIN', 'SCOPE_BLOCKED', 'L0_SCOPE_PRECEDES_MACRO_SOLVE');
  }
  if (guardrailState !== 'PASS') {
    return terminalResult(problem, policy, 'ABSTAIN', 'UPSTREAM_GUARDRAIL_BLOCKED', 'L0_ENERGY_GUARDRAIL_PRECEDES_MACRO_SOLVE');
  }

  const constraintError = validateConstraints(problem.constraints);
  if (constraintError) return terminalResult(problem, policy, 'TECHNICAL_INVALID', 'TECHNICAL_INVALID', constraintError);

  const prepared = prepareConstraints(problem.constraints || []);
  if (prepared.technicalConflict) {
    return terminalResult(problem, policy, 'TECHNICAL_INVALID', 'CONSTRAINT_VERSION_CONFLICT', prepared.technicalConflict, prepared);
  }

  const signature = stateSignature(problem, prepared.active);
  if ((problem.backtrackHistory || []).includes(signature)) {
    return deepFreeze({
      ...baseResult(problem, policy),
      status: 'ABSTAIN',
      solutionStatus: 'BACKTRACK_CYCLE_DETECTED',
      action: 'TERMINATE_REPEATED_STATE',
      feasible: false,
      hardFeasibility: 'NOT_REEVALUATED_REPEATED_STATE',
      preferredFeasibility: 'NOT_REEVALUATED_REPEATED_STATE',
      H: null,
      S: null,
      authorizedRegion: null,
      selected: null,
      constraintResults: prepared.superseded,
      conflicts: [conflict('BACKTRACK_CYCLE', [], 'IDENTICAL_SOLVER_STATE_ALREADY_VISITED', 'ABSTAIN')],
      relaxations: [],
      minimumEnergyForCurrentProtectedConstraintSet: null,
      minimumEnergySemantic: 'MATHEMATICAL_FEASIBILITY_THRESHOLD_NOT_BIOLOGICAL_FLOOR',
      backtrackRequired: false,
      backtrackSignature: signature,
      numericSemantics: numericSemantics(epsilon)
    });
  }

  const active = prepared.active;
  const protectedConstraints = active.filter(item => item.level === 'L2');
  const softConstraints = active.filter(item => LEVEL_ORDER[item.level] >= LEVEL_ORDER.L3);
  const resultMap = new Map(active.map(item => [constraintKey(item), constraintRecord(item, item.range === null ? 'NOT_EVALUABLE' : 'PENDING')]));
  const conflicts = [];
  const relaxations = [];

  const protectedSameLevel = findRangeContradiction(protectedConstraints, epsilon);
  if (protectedSameLevel) {
    for (const item of protectedSameLevel.constraints) {
      resultMap.set(constraintKey(item), constraintRecord(item, 'CONFLICTING_CONSTRAINTS', 'SAME_LEVEL_PROTECTED_RANGE_CONTRADICTION'));
    }
    return deepFreeze({
      ...baseResult(problem, policy),
      status: 'PARTIAL',
      solutionStatus: 'REQUIRES_POLICY',
      action: 'RESOLVE_SAME_LEVEL_PROTECTED_CONFLICT',
      feasible: null,
      hardFeasibility: 'UNKNOWN_POLICY_CONFLICT',
      preferredFeasibility: 'NOT_EVALUABLE',
      H: null,
      S: null,
      authorizedRegion: null,
      selected: null,
      constraintResults: sortResults([...prepared.superseded, ...resultMap.values()]),
      conflicts: [conflict('SAME_LEVEL_CONFLICT', protectedSameLevel.constraints, 'DISJOINT_L2_RANGES_HAVE_NO_AUTHORIZED_TIE_BREAK', 'REQUIRES_POLICY')],
      relaxations,
      minimumEnergyForCurrentProtectedConstraintSet: null,
      minimumEnergySemantic: 'MATHEMATICAL_FEASIBILITY_THRESHOLD_NOT_BIOLOGICAL_FLOOR',
      backtrackRequired: false,
      backtrackSignature: signature,
      numericSemantics: numericSemantics(epsilon)
    });
  }

  const unknownProtected = protectedConstraints.filter(item => item.range === null);
  if (unknownProtected.length) {
    for (const item of active.filter(candidate => candidate.range !== null && LEVEL_ORDER[candidate.level] >= LEVEL_ORDER.L3)) {
      resultMap.set(constraintKey(item), constraintRecord(item, 'NOT_EVALUABLE', 'HIGHER_PRIORITY_PROTECTED_RANGE_UNKNOWN'));
    }
    return deepFreeze({
      ...baseResult(problem, policy),
      status: 'PARTIAL',
      solutionStatus: 'FEASIBILITY_UNKNOWN',
      action: 'REQUEST_UPSTREAM_CONSTRAINT_RESOLUTION',
      feasible: null,
      hardFeasibility: 'UNKNOWN',
      preferredFeasibility: 'UNKNOWN',
      H: null,
      S: null,
      authorizedRegion: null,
      selected: null,
      constraintResults: sortResults([...prepared.superseded, ...resultMap.values()]),
      conflicts: [conflict('DATA_UNCERTAINTY_CONFLICT', unknownProtected, 'PROTECTED_RANGE_NULL', 'REQUEST_INFORMATION_OR_MODULE_RESOLUTION')],
      relaxations,
      minimumEnergyForCurrentProtectedConstraintSet: null,
      minimumEnergySemantic: 'MATHEMATICAL_FEASIBILITY_THRESHOLD_NOT_BIOLOGICAL_FLOOR',
      backtrackRequired: false,
      backtrackSignature: signature,
      numericSemantics: numericSemantics(epsilon)
    });
  }

  const hardRanges = applyConstraints(emptyRanges(), protectedConstraints, epsilon);
  const hardRegion = hardRanges.valid ? buildRegion(targetEnergy, hardRanges.ranges, epsilon) : infeasibleRegion(targetEnergy, hardRanges.ranges);
  const minProtectedEnergy = minimumEnergy(hardRanges.ranges);
  for (const item of protectedConstraints) {
    if (item.range !== null) resultMap.set(constraintKey(item), constraintRecord(item, hardRegion.feasible ? 'SATISFIED' : 'INFEASIBLE'));
  }

  if (!hardRanges.valid || !hardRegion.feasible) {
    const backtrackConflict = conflict(
      'PROTECTED_MACRO_CONFLICT',
      protectedConstraints,
      targetEnergy < minProtectedEnergy - epsilon ? 'ENERGY_BELOW_CURRENT_PROTECTED_SET_MINIMUM' : 'ENERGY_OUTSIDE_CURRENT_PROTECTED_SET',
      'UPSTREAM_BACKTRACK'
    );
    return deepFreeze({
      ...baseResult(problem, policy),
      status: 'UPSTREAM_BACKTRACK',
      solutionStatus: 'PROTECTED_INFEASIBLE',
      action: 'BACKTRACK_RATE_ENERGY_OR_STRATEGY',
      feasible: false,
      hardFeasibility: 'INFEASIBLE',
      preferredFeasibility: 'NOT_EVALUATED',
      H: regionOutput(hardRegion),
      S: null,
      authorizedRegion: null,
      selected: null,
      constraintResults: sortResults([...prepared.superseded, ...resultMap.values()]),
      conflicts: [backtrackConflict],
      relaxations,
      minimumEnergyForCurrentProtectedConstraintSet: minProtectedEnergy,
      minimumEnergySemantic: 'MATHEMATICAL_FEASIBILITY_THRESHOLD_NOT_BIOLOGICAL_FLOOR',
      energyGapToProtectedFeasibility: Math.max(0, minProtectedEnergy - targetEnergy),
      backtrackRequired: true,
      backtrackSignature: signature,
      numericSemantics: numericSemantics(epsilon)
    });
  }

  const preferred = buildPreferredSet(targetEnergy, hardRanges.ranges, softConstraints, epsilon);
  let effectiveRanges = cloneRanges(hardRanges.ranges);
  let effectiveRegion = hardRegion;
  let requiresPolicy = false;
  let uncertaintyBarrier = false;

  for (const level of ['L3', 'L4', 'L5', 'L6']) {
    const levelConstraints = softConstraints.filter(item => item.level === level);
    if (!levelConstraints.length) continue;
    if (uncertaintyBarrier || requiresPolicy) {
      for (const item of levelConstraints) {
        if (resultMap.get(constraintKey(item))?.state === 'PENDING') {
          resultMap.set(constraintKey(item), constraintRecord(item, 'NOT_EVALUABLE', 'HIGHER_PRIORITY_POLICY_OR_RANGE_UNRESOLVED'));
        }
      }
      continue;
    }
    const unknown = levelConstraints.filter(item => item.range === null);
    if (unknown.length) {
      uncertaintyBarrier = true;
      for (const item of unknown) resultMap.set(constraintKey(item), constraintRecord(item, 'NOT_EVALUABLE', 'NUMERIC_RANGE_NULL'));
      continue;
    }
    const sameLevelContradiction = findRangeContradiction(levelConstraints, epsilon);
    if (sameLevelContradiction) {
      requiresPolicy = true;
      for (const item of levelConstraints) resultMap.set(constraintKey(item), constraintRecord(item, 'CONFLICTING_CONSTRAINTS', 'DISJOINT_SAME_LEVEL_RANGES'));
      conflicts.push(conflict('SAME_LEVEL_CONFLICT', levelConstraints, 'NO_EVIDENCE_BASED_TIE_BREAK', 'REQUIRES_POLICY'));
      continue;
    }
    const candidate = applyConstraints(effectiveRanges, levelConstraints, epsilon);
    const candidateRegion = candidate.valid ? buildRegion(targetEnergy, candidate.ranges, epsilon) : infeasibleRegion(targetEnergy, candidate.ranges);
    if (candidate.valid && candidateRegion.feasible) {
      effectiveRanges = candidate.ranges;
      effectiveRegion = candidateRegion;
      for (const item of levelConstraints) resultMap.set(constraintKey(item), constraintRecord(item, 'SATISFIED'));
      continue;
    }
    if (levelConstraints.length > 1) {
      requiresPolicy = true;
      for (const item of levelConstraints) resultMap.set(constraintKey(item), constraintRecord(item, 'CONFLICTING_CONSTRAINTS', 'SAME_LEVEL_SET_NOT_JOINTLY_FEASIBLE'));
      conflicts.push(conflict('SAME_LEVEL_CONFLICT', levelConstraints, 'SAME_LEVEL_SET_NOT_JOINTLY_FEASIBLE_WITH_HIGHER_PRIORITIES', 'REQUIRES_POLICY'));
      continue;
    }
    const item = levelConstraints[0];
    const relaxation = describeRelaxation(item, effectiveRegion);
    resultMap.set(constraintKey(item), constraintRecord(item, relaxation.state, relaxation.reason));
    relaxations.push({
      constraintId: item.id,
      variable: item.variable,
      semanticClass: item.semanticClass,
      hierarchyLevel: item.level,
      originalRange: rangeOutput(item.range),
      selectedValue: null,
      selectedEnvelope: effectiveRegion.projections[item.variable],
      direction: relaxation.direction,
      magnitude: relaxation.magnitude,
      reason: relaxation.reason,
      alternativesAttempted: ['B0_FULL_RANGE_FLEXIBILITY', 'PRESERVE_ALL_HIGHER_PRIORITY_CONSTRAINTS'],
      upstreamConsequence: item.level === 'L3' ? 'REVIEW_THRESHOLD_OPEN_NOT_AUTOMATIC' : 'NONE_SOFT_CONFLICT'
    });
    conflicts.push(conflict('SOFT_TARGET_CONFLICT', [item], relaxation.reason, 'TRANSPARENT_RELAXATION'));
  }

  for (const [key, record] of resultMap) {
    if (record.state === 'PENDING') resultMap.set(key, { ...record, state: 'NOT_EVALUABLE', reason: 'SOLVER_STAGE_NOT_REACHED' });
  }

  let selected = null;
  let pointSource = null;
  const unique = regionIsUnique(effectiveRegion, epsilon);
  if (!requiresPolicy && !uncertaintyBarrier && unique) {
    selected = uniquePoint(effectiveRegion);
    pointSource = 'UNIQUE_FEASIBLE_REGION';
  } else if (!requiresPolicy && !uncertaintyBarrier && problem.explicitPoint) {
    const pointCheck = pointInRegion(problem.explicitPoint, effectiveRegion, targetEnergy, epsilon);
    if (pointCheck.valid) {
      selected = canonicalPoint(problem.explicitPoint);
      pointSource = problem.explicitPointSource || 'EXPLICIT_POINT';
    } else {
      conflicts.push(conflict('EXPLICIT_POINT_CONFLICT', [], pointCheck.reason, 'REJECT_POINT_KEEP_ENVELOPE'));
    }
  }

  const partialReasons = [];
  if (uncertaintyBarrier) partialReasons.push('UNKNOWN_NUMERIC_CONSTRAINT');
  if (requiresPolicy) partialReasons.push('SAME_LEVEL_POLICY_UNRESOLVED');
  if (!selected && !uncertaintyBarrier && !requiresPolicy) partialReasons.push('MULTIPLE_FEASIBLE_SOLUTIONS_NO_JUSTIFIED_POINT');
  if (problem.explicitPoint && !selected) partialReasons.push('EXPLICIT_POINT_REJECTED');
  const complete = selected !== null;
  const reportedRelaxations = relaxations.map(relaxation => {
    if (!selected) return relaxation;
    const selectedValue = selected[relaxation.variable];
    const magnitude = relaxation.direction === 'LOW'
      ? Math.max(0, relaxation.originalRange.lower - selectedValue)
      : relaxation.direction === 'HIGH'
        ? Math.max(0, selectedValue - relaxation.originalRange.upper)
        : relaxation.magnitude;
    return { ...relaxation, selectedValue, magnitude };
  });
  const status = complete ? (relaxations.length ? 'COMPLETE_WITH_RELAXATION' : 'COMPLETE') : 'PARTIAL';
  const solutionStatus = complete
    ? (relaxations.length ? 'SELECTED_POINT_WITH_TRANSPARENT_RELAXATION' : 'SELECTED_POINT_FEASIBLE')
    : requiresPolicy
      ? 'REQUIRES_POLICY'
      : uncertaintyBarrier
        ? 'FEASIBILITY_UNKNOWN'
        : relaxations.length
          ? 'FEASIBLE_ENVELOPE_WITH_RELAXATION'
          : 'MULTIPLE_FEASIBLE_SOLUTIONS';
  const action = complete
    ? 'NONE'
    : requiresPolicy
      ? 'RESOLVE_SAME_LEVEL_POLICY'
      : uncertaintyBarrier
        ? 'REQUEST_UPSTREAM_CONSTRAINT_RESOLUTION'
        : 'RETURN_FEASIBLE_ENVELOPE';

  return deepFreeze({
    ...baseResult(problem, policy),
    status,
    solutionStatus,
    action,
    feasible: true,
    hardFeasibility: 'FEASIBLE',
    preferredFeasibility: preferred.status,
    H: regionOutput(hardRegion),
    S: preferred.region,
    authorizedRegion: regionOutput(effectiveRegion),
    selected,
    selectedPointSource: pointSource,
    partialReasons,
    constraintResults: sortResults([...prepared.superseded, ...resultMap.values()]),
    conflicts,
    relaxations: reportedRelaxations,
    minimumEnergyForCurrentProtectedConstraintSet: minProtectedEnergy,
    minimumEnergySemantic: 'MATHEMATICAL_FEASIBILITY_THRESHOLD_NOT_BIOLOGICAL_FLOOR',
    energyGapToProtectedFeasibility: 0,
    backtrackRequired: false,
    backtrackSignature: signature,
    numericSemantics: numericSemantics(epsilon)
  });
}

export function validateDisplayAllocation(solverResult, allocation, options = {}) {
  if (!solverResult || !Number.isFinite(solverResult.targetEnergy) || !allocation) {
    return deepFreeze({ status: 'TECHNICAL_INVALID', reason: 'SOLVER_RESULT_AND_ALLOCATION_REQUIRED' });
  }
  const tolerance = options.accountingToleranceKcal;
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return deepFreeze({
      status: 'NOT_EVALUABLE',
      reason: 'DISPLAY_ACCOUNTING_TOLERANCE_MUST_BE_EXPLICIT',
      displayToleranceFrozen: false
    });
  }
  const point = canonicalPoint(allocation);
  if (!point || VARIABLES.some(variable => !Number.isFinite(point[variable]) || point[variable] < 0)) {
    return deepFreeze({ status: 'TECHNICAL_INVALID', reason: 'FINITE_NONNEGATIVE_DISPLAY_GRAMS_REQUIRED' });
  }
  const macroEnergy = pointEnergy(point);
  const mismatch = macroEnergy - solverResult.targetEnergy;
  const constraintChecks = (solverResult.constraintResults || [])
    .filter(record => record.state === 'SATISFIED' && record.variable && record.originalRange)
    .map(record => {
      const value = point[record.variable];
      const lowerPass = value >= record.originalRange.lower;
      const upperPass = record.originalRange.upperUnbounded || value <= record.originalRange.upper;
      return { constraintId: record.constraintId, variable: record.variable, value, pass: lowerPass && upperPass };
    });
  const accountingPass = Math.abs(mismatch) <= tolerance;
  const constraintsPass = constraintChecks.every(check => check.pass);
  return deepFreeze({
    status: accountingPass && constraintsPass ? 'VALID' : 'INVALID',
    allocation: point,
    macroEnergy,
    targetEnergy: solverResult.targetEnergy,
    mismatch,
    accountingToleranceKcal: tolerance,
    accountingPass,
    constraintChecks,
    constraintsPass,
    automaticReconciliationApplied: false,
    requiredOrdering: 'SOLVE_UNROUNDED_VALIDATE_THEN_FORMAT_AND_REVALIDATE'
  });
}

function validateEnvelope(problem, policy) {
  if (!problem || typeof problem !== 'object') return 'PROBLEM_OBJECT_REQUIRED';
  if (!Number.isFinite(problem.energyKcal) || problem.energyKcal <= 0) return 'POSITIVE_FINITE_ENERGY_REQUIRED';
  if (!policy || policy.values?.A8?.pointSelectionPolicy !== 'NO_POINT_UNLESS_REGION_IS_UNIQUE_OR_POINT_IS_EXPLICIT') return 'LAB_SOLVER_E02_POLICY_REQUIRED';
  if (!Array.isArray(problem.constraints)) return 'CONSTRAINT_ARRAY_REQUIRED';
  return null;
}

function validateConstraints(constraints) {
  for (const constraint of constraints) {
    if (!constraint || typeof constraint !== 'object') return 'CONSTRAINT_OBJECT_REQUIRED';
    if (typeof constraint.id !== 'string' || !constraint.id.trim()) return 'STABLE_CONSTRAINT_ID_REQUIRED';
    if (constraint.enabled === false) continue;
    if (!VARIABLES.includes(constraint.variable)) return `INVALID_CONSTRAINT_VARIABLE:${constraint.id}`;
    if (!(constraint.semanticClass in CLASS_LEVEL)) return `INVALID_SEMANTIC_CLASS:${constraint.id}`;
    if (CLASS_LEVEL[constraint.semanticClass] !== constraint.level || !['L2', 'L3', 'L4', 'L5', 'L6'].includes(constraint.level)) return `CLASS_LEVEL_MISMATCH:${constraint.id}`;
    if (constraint.range !== null && !validRange(constraint.range)) return `INVALID_RANGE:${constraint.id}`;
    if (constraint.version !== undefined && (!Number.isInteger(constraint.version) || constraint.version < 1)) return `INVALID_VERSION:${constraint.id}`;
  }
  return null;
}

function prepareConstraints(constraints) {
  const normalized = constraints.map(item => normalizeConstraint(item));
  const inactive = normalized.filter(item => !item.enabled).map(item => constraintRecord(item, 'NOT_APPLICABLE', 'CONSTRAINT_DISABLED_UPSTREAM'));
  const enabled = normalized.filter(item => item.enabled).sort(compareConstraints);
  const selectedById = [];
  const superseded = [...inactive];
  for (const id of [...new Set(enabled.map(item => item.id))].sort()) {
    const sameId = enabled.filter(item => item.id === id);
    const maxVersion = Math.max(...sameId.map(item => item.version));
    const current = sameId.filter(item => item.version === maxVersion);
    const payloads = [...new Set(current.map(canonicalConstraintPayload))];
    if (payloads.length > 1) return { active: [], superseded, technicalConflict: `CONFLICTING_PAYLOADS_FOR_${id}_VERSION_${maxVersion}` };
    selectedById.push(current[0]);
    for (const stale of sameId.filter(item => item.version < maxVersion)) {
      superseded.push({ ...constraintRecord(stale, 'SUPERSEDED', 'STALE_CONSTRAINT_VERSION'), supersededBy: `${id}@${maxVersion}` });
    }
    if (current.length > 1) {
      superseded.push({
        ...constraintRecord(current[0], 'SUPERSEDED', 'IDENTICAL_DUPLICATE'),
        supersededBy: `${id}@${maxVersion}`,
        supersededCount: current.length - 1
      });
    }
  }
  const active = [];
  for (const item of selectedById.sort(compareConstraints)) {
    const equivalent = active.find(candidate => candidate.semanticKey === item.semanticKey && canonicalConstraintSemantics(candidate) === canonicalConstraintSemantics(item));
    if (equivalent) {
      superseded.push({ ...constraintRecord(item, 'SUPERSEDED', 'EQUIVALENT_SEMANTIC_DUPLICATE'), supersededBy: equivalent.id });
    } else {
      active.push(item);
    }
  }
  return { active, superseded: sortResults(superseded), technicalConflict: null };
}

function normalizeConstraint(item) {
  return {
    id: item.id,
    semanticKey: item.semanticKey || item.id,
    variable: item.variable || null,
    semanticClass: item.semanticClass,
    level: item.level,
    range: item.range === null ? null : item.range ? [item.range[0], item.range[1]] : null,
    version: item.version || 1,
    sourceMethod: item.sourceMethod || 'UNSPECIFIED_LAB_SOURCE',
    confidenceStatus: item.confidenceStatus || 'NOT_CALIBRATED',
    enabled: item.enabled !== false
  };
}

function validRange(range) {
  return Array.isArray(range) && range.length === 2 && Number.isFinite(range[0]) && range[0] >= 0 && (Number.isFinite(range[1]) || range[1] === Number.POSITIVE_INFINITY) && range[1] >= range[0];
}

function emptyRanges() {
  return { protein: [0, Number.POSITIVE_INFINITY], carbs: [0, Number.POSITIVE_INFINITY], fat: [0, Number.POSITIVE_INFINITY] };
}

function cloneRanges(ranges) {
  return Object.fromEntries(VARIABLES.map(variable => [variable, [...ranges[variable]]]));
}

function applyConstraints(startRanges, constraints, epsilon) {
  const ranges = cloneRanges(startRanges);
  for (const item of constraints.filter(candidate => candidate.range !== null)) {
    ranges[item.variable][0] = Math.max(ranges[item.variable][0], item.range[0]);
    ranges[item.variable][1] = Math.min(ranges[item.variable][1], item.range[1]);
  }
  const valid = VARIABLES.every(variable => ranges[variable][0] <= ranges[variable][1] + epsilon);
  return { valid, ranges };
}

function buildRegion(energy, ranges, epsilon) {
  const min = minimumEnergy(ranges);
  const max = maximumEnergy(ranges);
  const feasible = energy >= min - epsilon && energy <= max + epsilon;
  if (!feasible) return infeasibleRegion(energy, ranges, min, max);
  const projections = {};
  for (const variable of VARIABLES) {
    const others = VARIABLES.filter(item => item !== variable);
    const otherMin = others.reduce((sum, item) => sum + ENERGY_PER_GRAM[item] * ranges[item][0], 0);
    const otherMax = others.some(item => !Number.isFinite(ranges[item][1]))
      ? Number.POSITIVE_INFINITY
      : others.reduce((sum, item) => sum + ENERGY_PER_GRAM[item] * ranges[item][1], 0);
    const lowerFromEnergy = Number.isFinite(otherMax) ? (energy - otherMax) / ENERGY_PER_GRAM[variable] : Number.NEGATIVE_INFINITY;
    const lower = cleanNumber(Math.max(ranges[variable][0], lowerFromEnergy), epsilon);
    const upper = cleanNumber(Math.min(ranges[variable][1], (energy - otherMin) / ENERGY_PER_GRAM[variable]), epsilon);
    projections[variable] = rangeOutput([lower, upper]);
  }
  return { feasible: true, targetEnergy: energy, minEnergy: min, maxEnergy: max, ranges: cloneRanges(ranges), projections };
}

function infeasibleRegion(energy, ranges, min = minimumEnergy(ranges), max = maximumEnergy(ranges)) {
  return { feasible: false, targetEnergy: energy, minEnergy: min, maxEnergy: max, ranges: cloneRanges(ranges), projections: null };
}

function minimumEnergy(ranges) {
  return VARIABLES.reduce((sum, variable) => sum + ENERGY_PER_GRAM[variable] * ranges[variable][0], 0);
}

function maximumEnergy(ranges) {
  if (VARIABLES.some(variable => !Number.isFinite(ranges[variable][1]))) return Number.POSITIVE_INFINITY;
  return VARIABLES.reduce((sum, variable) => sum + ENERGY_PER_GRAM[variable] * ranges[variable][1], 0);
}

function buildPreferredSet(energy, hardRanges, softConstraints, epsilon) {
  const known = softConstraints.filter(item => item.range !== null);
  if (softConstraints.some(item => item.range === null)) {
    const candidate = applyConstraints(hardRanges, known, epsilon);
    const region = candidate.valid ? buildRegion(energy, candidate.ranges, epsilon) : infeasibleRegion(energy, candidate.ranges);
    return { status: 'UNKNOWN', region: { ...regionOutput(region), completeness: 'PARTIAL_KNOWN_SOFT_CONSTRAINTS_ONLY' } };
  }
  if (!known.length) return { status: 'NOT_DEFINED', region: regionOutput(buildRegion(energy, hardRanges, epsilon)) };
  const candidate = applyConstraints(hardRanges, known, epsilon);
  const region = candidate.valid ? buildRegion(energy, candidate.ranges, epsilon) : infeasibleRegion(energy, candidate.ranges);
  return { status: region.feasible ? 'FEASIBLE' : 'INFEASIBLE', region: regionOutput(region) };
}

function findRangeContradiction(constraints, epsilon) {
  for (const variable of VARIABLES) {
    const group = constraints.filter(item => item.variable === variable && item.range !== null);
    if (group.length < 2) continue;
    const lower = Math.max(...group.map(item => item.range[0]));
    const upper = Math.min(...group.map(item => item.range[1]));
    if (lower > upper + epsilon) return { variable, constraints: group };
  }
  return null;
}

function describeRelaxation(item, region) {
  const projection = region.projections[item.variable];
  if (projection.upper < item.range[0]) {
    return { state: 'RELAXED_LOW', direction: 'LOW', magnitude: item.range[0] - projection.upper, reason: 'AUTHORIZED_HIGHER_PRIORITY_REGION_BELOW_REQUESTED_RANGE' };
  }
  if (!projection.upperUnbounded && projection.lower > item.range[1]) {
    return { state: 'RELAXED_HIGH', direction: 'HIGH', magnitude: projection.lower - item.range[1], reason: 'AUTHORIZED_HIGHER_PRIORITY_REGION_ABOVE_REQUESTED_RANGE' };
  }
  return { state: 'CONFLICTING_CONSTRAINTS', direction: 'COUPLED', magnitude: null, reason: 'ENERGY_COUPLING_PREVENTS_FULL_RANGE_SATISFACTION' };
}

function regionIsUnique(region, epsilon) {
  return region.feasible && VARIABLES.every(variable => {
    const projection = region.projections[variable];
    return !projection.upperUnbounded && Math.abs(projection.upper - projection.lower) <= epsilon / ENERGY_PER_GRAM[variable];
  });
}

function uniquePoint(region) {
  return canonicalPoint(Object.fromEntries(VARIABLES.map(variable => [variable, region.projections[variable].lower])));
}

function pointInRegion(point, region, energy, epsilon) {
  const canonical = canonicalPoint(point);
  if (!canonical || VARIABLES.some(variable => !Number.isFinite(canonical[variable]) || canonical[variable] < 0)) return { valid: false, reason: 'EXPLICIT_POINT_NONFINITE_OR_NEGATIVE' };
  if (Math.abs(pointEnergy(canonical) - energy) > epsilon) return { valid: false, reason: 'EXPLICIT_POINT_ACCOUNTING_MISMATCH' };
  for (const variable of VARIABLES) {
    const projection = region.projections[variable];
    if (canonical[variable] < projection.lower - epsilon || (!projection.upperUnbounded && canonical[variable] > projection.upper + epsilon)) return { valid: false, reason: `EXPLICIT_POINT_OUTSIDE_${variable.toUpperCase()}_ENVELOPE` };
  }
  return { valid: true };
}

function canonicalPoint(point) {
  if (!point || typeof point !== 'object') return null;
  return { protein: point.protein, carbs: point.carbs, fat: point.fat };
}

function pointEnergy(point) {
  return 4 * point.protein + 4 * point.carbs + 9 * point.fat;
}

function rangeOutput(range) {
  return {
    lower: range[0],
    upper: Number.isFinite(range[1]) ? range[1] : null,
    upperUnbounded: !Number.isFinite(range[1])
  };
}

function regionOutput(region) {
  if (!region) return null;
  return {
    feasible: region.feasible,
    targetEnergy: region.targetEnergy,
    minimumEnergy: region.minEnergy,
    maximumEnergy: Number.isFinite(region.maxEnergy) ? region.maxEnergy : null,
    maximumEnergyUnbounded: !Number.isFinite(region.maxEnergy),
    projectionIntervals: region.projections,
    geometry: 'BOX_CONSTRAINTS_INTERSECTED_WITH_4P_PLUS_4C_PLUS_9F_EQUALS_E',
    projectionWarning: 'PROJECTION_INTERVALS_ARE_COUPLED_NOT_AN_INDEPENDENT_RECTANGLE'
  };
}

function constraintRecord(item, state, reason = null) {
  return {
    constraintId: item.id,
    semanticKey: item.semanticKey,
    variable: item.variable,
    semanticClass: item.semanticClass,
    hierarchyLevel: item.level,
    originalRange: item.range === null ? null : rangeOutput(item.range),
    version: item.version,
    sourceMethod: item.sourceMethod,
    confidenceStatus: item.confidenceStatus,
    confidenceAffectsPriority: false,
    state,
    reason
  };
}

function conflict(type, constraints, reason, resolutionStatus) {
  return {
    type,
    affectedConstraints: constraints.map(item => item.id).sort(),
    reason,
    resolutionStatus,
    hiddenTieBreakApplied: false
  };
}

function baseResult(problem, policy) {
  return {
    modelId: 'A8_HIERARCHICAL_FEASIBILITY_ENVELOPE_LAB',
    modelVersion: policy.modelVersion,
    parameterVersion: policy.parameterVersion,
    parameterSetId: policy.id,
    parameterStatus: policy.status,
    productionEligible: false,
    targetEnergy: problem?.energyKcal ?? null,
    scopeState: problem?.scopeState || 'IN_SCOPE',
    guardrailState: problem?.guardrailState || 'PASS',
    hierarchy: [...policy.values.A8.hierarchy],
    search: policy.values.A8.solvingPolicy,
    pointSelectionPolicy: policy.values.A8.pointSelectionPolicy,
    sameLevelConflictPolicy: policy.values.A8.sameLevelConflictPolicy,
    confidencePolicy: policy.values.A8.confidencePolicy,
    hiddenWeights: false,
    energyChangedBySolver: false,
    automaticRoundingApplied: false
  };
}

function terminalResult(problem, policy, status, solutionStatus, reason, prepared = null) {
  const safePolicy = policy || {
    id: null,
    modelVersion: null,
    parameterVersion: null,
    status: 'EXPERIMENTAL_PARAMETER',
    values: { A8: { hierarchy: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'], solvingPolicy: null, pointSelectionPolicy: null, sameLevelConflictPolicy: null, confidencePolicy: null } }
  };
  return deepFreeze({
    ...baseResult(problem, safePolicy),
    status,
    solutionStatus,
    action: status === 'TECHNICAL_INVALID' ? 'FIX_TECHNICAL_INPUT' : 'ROUTE_UPSTREAM',
    feasible: false,
    hardFeasibility: 'NOT_EVALUATED',
    preferredFeasibility: 'NOT_EVALUATED',
    H: null,
    S: null,
    authorizedRegion: null,
    selected: null,
    constraintResults: prepared?.superseded || [],
    conflicts: [conflict(solutionStatus, [], reason, status)],
    relaxations: [],
    minimumEnergyForCurrentProtectedConstraintSet: null,
    minimumEnergySemantic: 'MATHEMATICAL_FEASIBILITY_THRESHOLD_NOT_BIOLOGICAL_FLOOR',
    backtrackRequired: false,
    backtrackSignature: null,
    numericSemantics: numericSemantics(problem && Number.isFinite(problem.energyKcal) ? floatingPointEpsilon(problem.energyKcal) : null)
  });
}

function numericSemantics(epsilon) {
  return {
    internalFloatingPointEpsilonKcal: epsilon,
    internalRole: 'ENGINEERING_COMPARISON_ONLY',
    productAccountingToleranceKcal: null,
    physiologicalTargetTolerance: null,
    displayMenuToleranceKcal: null,
    productToleranceFrozen: false
  };
}

function floatingPointEpsilon(energy) {
  return Number.EPSILON * Math.max(1, Math.abs(energy)) * 64;
}

function cleanNumber(value, epsilon) {
  return Math.abs(value) <= epsilon ? 0 : value;
}

function stateSignature(problem, constraints) {
  const payload = {
    energyKcal: problem.energyKcal,
    scopeState: problem.scopeState || 'IN_SCOPE',
    guardrailState: problem.guardrailState || 'PASS',
    strategyState: problem.strategyState || null,
    explicitPoint: problem.explicitPoint ? canonicalPoint(problem.explicitPoint) : null,
    explicitPointSource: problem.explicitPointSource || null,
    constraints: constraints.map(item => ({
      id: item.id,
      semanticKey: item.semanticKey,
      variable: item.variable,
      semanticClass: item.semanticClass,
      level: item.level,
      range: item.range === null ? null : item.range.map(value => Number.isFinite(value) ? value : 'INF'),
      version: item.version,
      sourceMethod: item.sourceMethod,
      confidenceStatus: item.confidenceStatus
    }))
  };
  return JSON.stringify(payload);
}

function canonicalConstraintPayload(item) {
  return JSON.stringify({
    semanticKey: item.semanticKey,
    variable: item.variable,
    semanticClass: item.semanticClass,
    level: item.level,
    range: item.range === null ? null : item.range.map(value => Number.isFinite(value) ? value : 'INF'),
    sourceMethod: item.sourceMethod,
    confidenceStatus: item.confidenceStatus,
    enabled: item.enabled
  });
}

function canonicalConstraintSemantics(item) {
  return JSON.stringify({
    semanticKey: item.semanticKey,
    variable: item.variable,
    semanticClass: item.semanticClass,
    level: item.level,
    range: item.range === null ? null : item.range.map(value => Number.isFinite(value) ? value : 'INF')
  });
}

function compareConstraints(a, b) {
  return LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
    || String(a.variable).localeCompare(String(b.variable))
    || a.semanticKey.localeCompare(b.semanticKey)
    || a.id.localeCompare(b.id)
    || b.version - a.version;
}

function constraintKey(item) {
  return `${item.id}@${item.version}`;
}

function sortResults(results) {
  return [...results].sort((a, b) => LEVEL_ORDER[a.hierarchyLevel] - LEVEL_ORDER[b.hierarchyLevel]
    || String(a.variable).localeCompare(String(b.variable))
    || a.constraintId.localeCompare(b.constraintId)
    || b.version - a.version
    || a.state.localeCompare(b.state));
}
