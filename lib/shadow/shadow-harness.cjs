'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SHADOW_HARNESS_VERSION = 'shadow-harness-0.1.2';
const DEFAULT_CANDIDATE_VERSION = 'SCIENTIFIC_CHALLENGER_V1_B4_SHADOW_PATCH3';
const DEFAULT_FREEZE_ID = 'MB_CANDIDATE_V1_PATCH3_L005_INPUT_CONTRACT_STABILIZATION_2026-08-28';
const COMPLETE_TRAINING_STATES = new Set([
  'CONFIRMED_NONE',
  'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING',
  'CONFIRMED_REALIZED_TRAINING',
  'COMPLETE',
]);
const UNRESOLVED_STATES = new Set([
  'UNKNOWN', 'PARTIAL', 'INCOMPLETE', 'CONTRADICTORY', 'REQUEST_INFORMATION',
  'PARTIAL_OR_UNKNOWN_TRAINING', 'MAPPING_ERROR', 'NOT_AVAILABLE',
]);

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function freeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((child) => freeze(child, seen));
  return Object.freeze(value);
}

function stable(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
}

function nowIso() { return new Date().toISOString(); }

function isShadowEnabled({ enabled, env = process.env } = {}) {
  if (typeof enabled === 'boolean') return enabled;
  return ['1', 'true', 'yes', 'on'].includes(String(env.MB_SHADOW_PATCH3_ENABLED || '').toLowerCase());
}

function first(...values) { return values.find((value) => value !== undefined && value !== null) ?? null; }

function extractTrainingTuple(input) {
  const source = input && typeof input === 'object' ? input : {};
  const t = source.trainingInput || source.training || {};
  return {
    trainingStatus: first(t.trainingStatus, source.trainingStatus),
    modality: first(t.trainingModality, t.modality, source.trainingModality, source.modality),
    sessionsPerWeek: first(t.sessionsPerWeek, t.frequency, source.sessionsPerWeek, source.frequency),
    durationMinutes: first(t.sessionDurationMin, t.durationMinutes, t.duration, source.sessionDurationMin, source.durationMinutes, source.duration),
    intensity: first(t.intensity, source.intensity),
    workload: first(t.workload, source.workload),
    twoADay: first(t.twoADay, t.two_a_day, source.twoADay, source.two_a_day),
    planned: clone(first(t.planned, source.planned)),
    realized: clone(first(t.realized, source.realized)),
    reportedTrainingInput: clone(first(source.trainingInput, source.training)),
  };
}

function captureRawInput(input, metadata = {}) {
  const rawInput = clone(input);
  const rawTrainingTuple = extractTrainingTuple(rawInput);
  const userId = first(metadata.userId, metadata.uid, metadata.sessionId);
  const salt = metadata.pseudonymSalt || 'macrobal-shadow-pseudonym-v1';
  return freeze({
    eventId: metadata.eventId || crypto.randomUUID(),
    timestamp: metadata.timestamp || nowIso(),
    collectorVersion: metadata.collectorVersion || SHADOW_HARNESS_VERSION,
    candidateVersion: metadata.candidateVersion || DEFAULT_CANDIDATE_VERSION,
    freezeId: metadata.freezeId || DEFAULT_FREEZE_ID,
    calculatorMode: metadata.calculatorMode || 'unknown',
    pseudonymousUserId: userId == null ? null : sha256(`${salt}:${userId}`).slice(0, 32),
    payloadHash: sha256(rawInput),
    rawTrainingTuple,
    rawInput,
    missingPreserved: true,
  });
}

function getPath(object, dotted) {
  return dotted.split('.').reduce((current, key) => current == null ? undefined : current[key], object);
}

function extractNormalized(output, rawContract) {
  const realCandidate = getPath(output, 'trace.input.validation.profile.trainingInput');
  const testCandidate = output && output.normalized;
  const candidate = realCandidate || testCandidate;
  if (!candidate || typeof candidate !== 'object') {
    return {
      schema: 'NOT_AVAILABLE',
      state: 'MAPPING_ERROR',
      mappingStatus: 'MAPPING_ERROR',
      sourcePath: null,
      mappingErrors: ['PATCH3_TRAINING_INPUT_NOT_FOUND'],
      missingFields: null,
      contradictions: null,
      valuesImputed: 'NOT_AVAILABLE',
      reasonCodes: ['PATCH3_TRAINING_INPUT_MAPPING_ERROR'],
      reportedValues: 'NOT_AVAILABLE',
      trainingTuple: 'NOT_AVAILABLE',
    };
  }
  const sourcePath = realCandidate
    ? 'output.trace.input.validation.profile.trainingInput'
    : 'TEST_ONLY:normalized';
  const reported = candidate.reported || candidate.reportedValues || candidate.values;
  const mappingErrors = [];
  if (candidate.state == null) mappingErrors.push('TRAINING_INPUT_STATE_NOT_AVAILABLE');
  if (!reported || typeof reported !== 'object') mappingErrors.push('TRAINING_INPUT_REPORTED_VALUES_NOT_AVAILABLE');
  if (!Array.isArray(candidate.missingFields)) mappingErrors.push('TRAINING_INPUT_MISSING_FIELDS_NOT_AVAILABLE');
  if (!Array.isArray(candidate.contradictions)) mappingErrors.push('TRAINING_INPUT_CONTRADICTIONS_NOT_AVAILABLE');
  if (!Array.isArray(candidate.reasonCodes)) mappingErrors.push('TRAINING_INPUT_REASON_CODES_NOT_AVAILABLE');
  if (candidate.valuesImputed === undefined) mappingErrors.push('TRAINING_INPUT_VALUES_IMPUTED_NOT_AVAILABLE');
  const state = candidate.state == null ? 'MAPPING_ERROR' : String(candidate.state).toUpperCase();
  const trainingTuple = reported && typeof reported === 'object' ? {
    trainingStatus: first(reported.trainingStatus),
    modality: first(reported.trainingModality, reported.modality),
    sessionsPerWeek: first(reported.sessionsPerWeek, reported.frequency),
    durationMinutes: first(reported.sessionDurationMin, reported.durationMinutes, reported.duration),
    workload: first(reported.workload),
    twoADay: first(reported.twoADay),
  } : 'NOT_AVAILABLE';
  return {
    schema: first(candidate.schemaVersion, candidate.schema, 'NOT_AVAILABLE'),
    state,
    mappingStatus: mappingErrors.length ? 'MAPPING_ERROR' : 'OK',
    sourcePath,
    mappingErrors,
    missingFields: Array.isArray(candidate.missingFields) ? clone(candidate.missingFields) : null,
    contradictions: Array.isArray(candidate.contradictions) ? clone(candidate.contradictions) : null,
    valuesImputed: candidate.valuesImputed === undefined ? 'NOT_AVAILABLE' : clone(candidate.valuesImputed),
    reasonCodes: Array.isArray(candidate.reasonCodes) ? clone(candidate.reasonCodes) : null,
    reportedValues: reported && typeof reported === 'object' ? clone(reported) : 'NOT_AVAILABLE',
    trainingTuple: clone(trainingTuple),
    rawContractAvailable: Boolean(rawContract && rawContract.rawTrainingTuple),
  };
}

function projectPatch3(output, latencyMs, error = null) {
  const target = output && output.targetContract;
  const trace = output && output.trace;
  const scientificResolution = first(output && output.scientificStatus, target && target.scientificStatus);
  const menuPermission = first(output && output.menuPermission, target && target.menu && target.menu.permission);
  const menuEligible = first(output && output.menuEligible, target && target.menu && target.menu.status === 'ELIGIBLE_REGION_NATIVE');
  const teeRange = first(output && output.energy && output.energy.teeRange, target && target.energy && target.energy.teeRange);
  const routing = first(target && target.routing, getPath(trace, 'A9.postSolver.ordinaryPolicy'));
  const mapping = {
    scientificStatus: { status: scientificResolution == null ? 'NOT_AVAILABLE' : 'OK', sourcePath: output && output.scientificStatus != null ? 'output.scientificStatus' : target && target.scientificStatus != null ? 'output.targetContract.scientificStatus' : null },
    menuPermission: { status: menuPermission == null ? 'NOT_AVAILABLE' : 'OK', sourcePath: output && output.menuPermission != null ? 'output.menuPermission' : target && target.menu && target.menu.permission != null ? 'output.targetContract.menu.permission' : null },
    menuEligible: { status: menuEligible == null ? 'NOT_AVAILABLE' : 'OK', sourcePath: output && output.menuEligible != null ? 'output.menuEligible' : target && target.menu ? 'output.targetContract.menu.status' : null },
    teeRange: { status: Array.isArray(teeRange) ? 'OK' : 'NOT_AVAILABLE', sourcePath: output && output.energy && Array.isArray(output.energy.teeRange) ? 'output.energy.teeRange' : target && target.energy && Array.isArray(target.energy.teeRange) ? 'output.targetContract.energy.teeRange' : null },
    routing: { status: routing && typeof routing === 'object' ? 'OK' : 'NOT_AVAILABLE', sourcePath: target && target.routing ? 'output.targetContract.routing' : getPath(trace, 'A9.postSolver.ordinaryPolicy') ? 'output.trace.A9.postSolver.ordinaryPolicy' : null },
  };
  const mappingErrors = Object.entries(mapping).filter(([, value]) => value.status !== 'OK').map(([key]) => `PATCH3_${key.toUpperCase()}_MAPPING_ERROR`);
  const result = {
    candidateVersion: first(output && output.challengerVersion, output && output.candidateVersion, output && output.version, DEFAULT_CANDIDATE_VERSION),
    freezeId: first(output && output.freezeId, DEFAULT_FREEZE_ID),
    a1: clone(first(output && output.A1, trace && trace.A1)),
    teeRange: clone(teeRange),
    b1: clone(first(output && output.B1, trace && trace.A2_A3)),
    b2: clone(first(output && output.B2, trace && trace.A4_A5)),
    b3Fat: clone(first(output && output.B3Fat, trace && trace.A6)),
    b3Carb: clone(first(output && output.B3Carb, trace && trace.A7)),
    a8: clone(first(output && output.A8, trace && trace.A8)),
    a9Pre: clone(first(output && output.A9Pre, getPath(trace, 'A9.preSolver'), getPath(trace, 'A9.pre'))),
    a9Post: clone(first(output && output.A9Post, getPath(trace, 'A9.postSolver'), getPath(trace, 'A9.post'))),
    routing: clone(routing),
    scientificResolution: clone(scientificResolution),
    menuPermission: clone(menuPermission),
    menuEligible: clone(menuEligible),
    menuAuthorization: {
      semantics: 'DERIVED_COMBINED_VIEW_PRESERVING_PERMISSION_AND_ELIGIBILITY',
      derivedFrom: ['output.menuPermission', 'output.menuEligible', 'output.targetContract.menu', 'output.targetContract.routing.permissions'],
      permission: clone(menuPermission),
      eligible: clone(menuEligible),
      mayInvokeMenuEngine: clone(first(target && target.menu && target.menu.mayInvokeMenuEngine, false)),
      canGenerateMenu: clone(first(target && target.routing && target.routing.permissions && target.routing.permissions.canGenerateMenu, false)),
      currentMenuResultReady: clone(first(target && target.menu && target.menu.currentMenuResultReady, false)),
    },
    selectedPoint: clone(first(output && output.selectedPoint, target && target.selection && target.selection.selectedPoint)),
    warnings: clone(first(output && output.warnings, [])) || [],
    reviewStates: clone(first(output && output.reviewStates, output && output.requestInformation, target && target.routing && target.routing.state, [])) || [],
    mapping,
    mappingStatus: mappingErrors.length ? 'MAPPING_ERROR' : 'OK',
    mappingErrors,
    error: error ? { name: error.name, message: error.message } : null,
    latencyMs,
  };
  return result;
}

function normalizedState(normalized) { return String(normalized && normalized.state || 'UNKNOWN').toUpperCase(); }
function isCompleteTraining(normalized) { return COMPLETE_TRAINING_STATES.has(normalizedState(normalized)); }
function isUnresolvedTraining(normalized) { return UNRESOLVED_STATES.has(normalizedState(normalized)) || !isCompleteTraining(normalized); }

function menuIsAuthorized(menuAuthorization) {
  if (menuAuthorization == null) return false;
  if (typeof menuAuthorization === 'string') {
    const state = menuAuthorization.toUpperCase();
    return ['AUTHORIZED', 'ALLOWED', 'PASS', 'ELIGIBLE', 'REGION_NATIVE_SELECTION_ALLOWED'].includes(state);
  }
  return Boolean(
    menuAuthorization.authorized
    || menuAuthorization.allowed
    || menuAuthorization.mayInvokeMenuEngine
    || menuAuthorization.canGenerateMenu
    || menuAuthorization.canRun
    || (typeof menuAuthorization.permission === 'string' && menuIsAuthorized(menuAuthorization.permission)),
  );
}

function evaluateL005Assertions({ raw, normalized, patch3 }) {
  const rawAvailable = Boolean(raw && raw.rawTrainingTuple && raw.rawInput);
  const tuple = rawAvailable ? raw.rawTrainingTuple : {};
  const modality = tuple.modality == null ? null : String(tuple.modality).toUpperCase();
  const explicitNone = modality === 'NONE' && Number(tuple.sessionsPerWeek) === 0 && Number(tuple.durationMinutes) === 0;
  const tuplePresent = tuple.modality != null && tuple.sessionsPerWeek != null && tuple.durationMinutes != null;
  const realized = String(tuple.trainingStatus || '').toUpperCase().startsWith('REALIZED')
    || tuple.realized === true
    || (tuple.realized && typeof tuple.realized === 'object');
  const trainingMapped = normalized && normalized.mappingStatus === 'OK' && normalized.state && normalized.state !== 'MAPPING_ERROR';
  const scientificMapped = patch3 && patch3.mapping && patch3.mapping.scientificStatus && patch3.mapping.scientificStatus.status === 'OK';
  const menuMapped = patch3 && patch3.mapping && patch3.mapping.menuPermission && patch3.mapping.menuPermission.status === 'OK'
    && patch3.mapping.menuEligible && patch3.mapping.menuEligible.status === 'OK';
  const teeMapped = patch3 && patch3.mapping && patch3.mapping.teeRange && patch3.mapping.teeRange.status === 'OK';
  const routingMapped = patch3 && patch3.mapping && patch3.mapping.routing && patch3.mapping.routing.status === 'OK';
  const incomplete = !tuplePresent || (Array.isArray(normalized && normalized.contradictions) && normalized.contradictions.length > 0);
  const unresolved = isUnresolvedTraining(normalized);
  const assertions = [];
  const add = (id, evaluable, passed, detail) => assertions.push({
    id,
    status: !evaluable ? 'NOT_EVALUABLE' : passed ? 'PASS' : 'FAIL',
    passed: Boolean(evaluable && passed),
    detail,
  });

  add('PATCH3_TRAINING_INPUT_MAPPED', true, trainingMapped, 'Real PATCH3 trainingInput must be mapped from the Candidate output.');
  add('PATCH3_SCIENTIFIC_STATUS_MAPPED', true, scientificMapped, 'scientificStatus is required for L005 resolution assertions.');
  add('PATCH3_MENU_CONTRACT_MAPPED', true, menuMapped, 'menuPermission and menuEligible are required for menu assertions.');
  add('PATCH3_TEE_RANGE_MAPPED', true, teeMapped, 'energy.teeRange must be available for the shadow projection.');
  add('PATCH3_ROUTING_MAPPED', true, routingMapped, 'Candidate routing must be available for comparison.');
  add('L005_EXPLICIT_NONE_CONFIRMED', rawAvailable && trainingMapped, !explicitNone || normalizedState(normalized) === 'CONFIRMED_NONE', 'NONE/0/0 must normalize to CONFIRMED_NONE.');
  add('L005_INCOMPLETE_NOT_CONFIRMED', rawAvailable && trainingMapped, !incomplete || !['CONFIRMED_NONE', 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING'].includes(normalizedState(normalized)), 'Incomplete tuple must remain unknown/partial.');
  add('L005_WORKLOAD_ALONE_NOT_RESOLVING', rawAvailable && trainingMapped, tuplePresent || !['CONFIRMED_NONE', 'SUFFICIENTLY_OBSERVED_REALIZED_TRAINING'].includes(normalizedState(normalized)), 'Workload alone cannot confirm training.');
  add('L005_COMPLETE_REALIZED_ALLOWED', rawAvailable && trainingMapped, !realized || !tuplePresent || isCompleteTraining(normalized), 'A complete realized tuple may be sufficiently observed.');
  add('L005_UNKNOWN_PARTIAL_NOT_RESOLVED', trainingMapped && scientificMapped, !unresolved || !['SCIENTIFICALLY_RESOLVED_REGION', 'COMPLETE'].includes(String(patch3.scientificResolution || '').toUpperCase()), 'Unknown/partial training cannot become resolved.');
  add('L005_UNRESOLVED_MENU_BLOCKED', trainingMapped && menuMapped, !unresolved || !menuIsAuthorized(patch3.menuAuthorization), 'Unresolved training cannot authorize menu.');
  const plannedOnly = tuple.planned != null && tuple.realized == null && !tuplePresent;
  add('L005_PLANNED_NOT_REALIZED', rawAvailable && trainingMapped, !plannedOnly || !['SUFFICIENTLY_OBSERVED_REALIZED_TRAINING', 'CONFIRMED_REALIZED_TRAINING'].includes(normalizedState(normalized)), 'Planned-only future work must not be treated as realized.');
  add('L005_NULLS_PRESERVED', rawAvailable, rawAvailable && raw.missingPreserved === true && raw.payloadHash === sha256(raw.rawInput), 'Raw payload hash and null/missing preservation must remain stable.');
  return assertions;
}

function isIntentionalProteinProtectedOpenUpper(root, pathName, value) {
  const match = /^\$\.trace\.A4_A5\.runs\.(\d+)\.target\.protectedConstraintRange\.1$/.exec(pathName);
  if (!match || value !== Number.POSITIVE_INFINITY) return false;
  const target = root?.trace?.A4_A5?.runs?.[Number(match[1])]?.target;
  const range = target?.protectedConstraintRange;
  const contractRange = root?.targetContract?.protein?.protectedRange;
  return Array.isArray(range)
    && range.length === 2
    && Number.isFinite(range[0])
    && range[0] >= 0
    && target.protectedLower === range[0]
    && contractRange?.lower === range[0]
    && contractRange?.upper === null
    && contractRange?.upperUnbounded === true;
}

function finiteAndRanges(root) {
  const scan = { problems: [], acceptedOpenBounds: [] };
  function visit(value, pathName) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      if (isIntentionalProteinProtectedOpenUpper(root, pathName, value)) {
        scan.acceptedOpenBounds.push({
          path: pathName,
          boundType: 'OPEN_UPPER',
          sourceValueType: 'POSITIVE_INFINITY',
          semantic: 'NO_FINITE_UPPER_PROTECTIVE_CEILING',
          contractPath: 'output.targetContract.protein.protectedRange',
          contractUpperUnbounded: true,
        });
      } else {
        scan.problems.push(`NON_FINITE:${pathName}`);
      }
    }
    if (value && typeof value === 'object') {
      if (typeof value.min === 'number' && typeof value.max === 'number' && value.min > value.max) scan.problems.push(`IMPOSSIBLE_RANGE:${pathName}`);
      Object.entries(value).forEach(([key, child]) => visit(child, `${pathName}.${key}`));
    }
  }
  visit(root, '$');
  return scan;
}

function buildComparison(productionSnapshot, patch3, normalized) {
  const production = productionSnapshot && typeof productionSnapshot === 'object' ? productionSnapshot : null;
  const fields = {
    routingState: production && first(production.routingState, production.route),
    scientificResolution: production && production.scientificResolution,
    menuAuthorization: production && first(production.menuAuthorization, production.menuEligible),
    energy: production && first(production.energy, production.kcal),
    macros: production && production.macros,
    missingData: production && first(production.missingData, production.missingFields),
  };
  const patchFields = {
    routingState: first(patch3 && patch3.routing && patch3.routing.state, patch3 && patch3.a9Post && patch3.a9Post.ordinaryPolicy && patch3.a9Post.ordinaryPolicy.route, patch3 && patch3.a9Post && patch3.a9Post.route),
    scientificResolution: patch3 && patch3.scientificResolution,
    menuAuthorization: patch3 && patch3.menuAuthorization,
    energy: patch3 && patch3.teeRange,
    macros: patch3 && patch3.selectedPoint,
    missingData: normalized && normalized.missingFields,
  };
  const byField = {};
  const changedFields = [];
  Object.keys(fields).forEach((field) => {
    const comparable = fields[field] !== undefined && fields[field] !== null && patchFields[field] !== undefined && patchFields[field] !== null;
    const canonical = (value) => field === 'menuAuthorization' ? menuIsAuthorized(value) : value;
    const changed = comparable && stable(canonical(fields[field])) !== stable(canonical(patchFields[field]));
    byField[field] = { status: comparable ? (changed ? 'CHANGED' : 'UNCHANGED') : 'NOT_COMPARABLE', production: clone(fields[field]), patch3: clone(patchFields[field]) };
    if (changed) changedFields.push(field);
  });
  const trainingComplete = isCompleteTraining(normalized);
  const changeClass = changedFields.length === 0 ? 'NO_CHANGE' : (trainingComplete ? 'UNEXPECTED_SCIENTIFIC_OUTPUT_CHANGE' : 'AUTHORIZED_L005_INPUT_CONTRACT_CHANGE');
  return { changedFields, byField, changeClass, comparable: changedFields.length > 0 || Object.values(byField).some((item) => item.status !== 'NOT_COMPARABLE') };
}

function createShadowMetrics() {
  const counters = {
    eventsReceived: 0, eventsProcessed: 0, eventsDropped: 0, timeouts: 0, errors: 0,
    l005AssertionFailures: 0, divergences: 0, completeTupleOutputChanges: 0,
    unresolvedMenuAuthorizations: 0, r2ExactNullLow: 0, r2Partial: 0,
    shadowWrites: 0, stopEvents: 0,
  };
  const latencies = [];
  const trainingStates = {};
  const candidateVersions = {};
  const freezeIds = {};
  return {
    counters,
    observe(result) {
      counters.eventsReceived += 1;
      if (result.status === 'PROCESSED') counters.eventsProcessed += 1;
      if (result.status === 'DROPPED' || result.status === 'DISABLED') counters.eventsDropped += 1;
      if (result.status === 'TIMEOUT') counters.timeouts += 1;
      if (result.status === 'ERROR') counters.errors += 1;
      if ((result.assertions || []).some((item) => !item.passed)) counters.l005AssertionFailures += 1;
      if ((result.comparison || {}).changedFields && result.comparison.changedFields.length) counters.divergences += 1;
      if ((result.comparison || {}).changeClass === 'UNEXPECTED_SCIENTIFIC_OUTPUT_CHANGE') counters.completeTupleOutputChanges += 1;
      if ((result.stopConditions || []).some((item) => item.code === 'UNRESOLVED_MENU_AUTHORIZED')) counters.unresolvedMenuAuthorizations += 1;
      const n = result.normalized || {};
      const state = String(n.state || 'UNKNOWN').toUpperCase();
      trainingStates[state] = (trainingStates[state] || 0) + 1;
      const candidate = String(result.versions && result.versions.candidate || 'UNKNOWN');
      const freezeId = String(result.versions && result.versions.freeze || 'UNKNOWN');
      candidateVersions[candidate] = (candidateVersions[candidate] || 0) + 1;
      freezeIds[freezeId] = (freezeIds[freezeId] || 0) + 1;
      const t = n.trainingTuple && typeof n.trainingTuple === 'object' ? n.trainingTuple : {};
      const reported = n.reportedValues && typeof n.reportedValues === 'object' ? n.reportedValues : {};
      const workload = first(reported.workload, t.workload);
      if (t.modality == null && t.sessionsPerWeek == null && t.durationMinutes == null && String(workload || '').toUpperCase() === 'LOW') counters.r2ExactNullLow += 1;
      if (['PARTIAL', 'UNKNOWN', 'INCOMPLETE', 'PARTIAL_OR_UNKNOWN_TRAINING', 'CONTRADICTORY'].includes(state)) counters.r2Partial += 1;
      if (result.persisted) counters.shadowWrites += 1;
      if (result.stopRecommended) counters.stopEvents += 1;
      if (Number.isFinite(result.latencyMs)) latencies.push(result.latencyMs);
    },
    snapshot() {
      const sorted = [...latencies].sort((a, b) => a - b);
      const percentile = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : null;
      return { counters: { ...counters }, trainingStates: { ...trainingStates }, candidateVersions: { ...candidateVersions }, freezeIds: { ...freezeIds }, latencyMs: { p50: percentile(0.5), p95: percentile(0.95) }, backlog: 0 };
    },
  };
}

function createShadowStore() {
  const events = [];
  return {
    async write(event) { events.push(clone(event)); return { ok: true, count: events.length }; },
    readAll() { return clone(events); },
    clear() { events.length = 0; },
  };
}

function sanitizeOperationalError(error) {
  const message = String(error && error.message || error || 'Unknown shadow error')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .slice(0, 500);
  return { name: String(error && error.name || 'Error'), message };
}

function createRawPersistenceSanitizer({ allowedFields = [] } = {}) {
  if (!Array.isArray(allowedFields)) throw new TypeError('allowedFields must be an array.');
  const allowed = new Set(allowedFields);
  return (result) => {
    const safe = clone(result);
    const source = safe && safe.raw && safe.raw.rawInput && typeof safe.raw.rawInput === 'object'
      ? safe.raw.rawInput
      : {};
    const minimized = {};
    for (const [key, value] of Object.entries(source)) {
      if (allowed.has(key)) minimized[key] = value;
    }
    if (safe && safe.raw) {
      safe.raw.rawInput = minimized;
      if (safe.raw.rawTrainingTuple && typeof safe.raw.rawTrainingTuple === 'object') {
        const { reportedTrainingInput, ...canonicalTrainingFields } = safe.raw.rawTrainingTuple;
        safe.raw.rawTrainingTuple = canonicalTrainingFields;
      }
    }
    safe.persistencePrivacy = {
      state: allowed.size ? 'EXPLICIT_ALLOWED_FIELDS_APPLIED' : 'RAW_INPUT_OMITTED_PENDING_DEPLOYMENT_CONFIGURATION',
      allowedFields: [...allowed],
      retention: 'DEPLOYMENT_CONFIGURATION_REQUIRED',
      accessControl: 'DEPLOYMENT_CONFIGURATION_REQUIRED',
    };
    return safe;
  };
}

function createPatch3Runner({ patch3Root = process.env.MB_PATCH3_ROOT, runner } = {}) {
  if (runner) return runner;
  if (!patch3Root) throw new Error('MB_PATCH3_ROOT is required for the real PATCH3 runner.');
  let modulePromise;
  const execute = async (rawInput) => {
    modulePromise ||= import(pathToFileURL(path.resolve(patch3Root, 'core', 'integratedChallenger.js')).href);
    const module = await modulePromise;
    if (typeof module.runIntegratedChallenger !== 'function') throw new Error('PATCH3 runner export not found.');
    return module.runIntegratedChallenger(clone(rawInput), { source: 'shadow-harness' });
  };
  Object.defineProperties(execute, {
    realRunnerUsed: { value: true, enumerable: true },
    patch3Root: { value: path.resolve(patch3Root), enumerable: true },
    sourcePath: { value: path.resolve(patch3Root, 'core', 'integratedChallenger.js'), enumerable: true },
  });
  return execute;
}

function timeoutPromise(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`Shadow timeout after ${timeoutMs}ms`), { code: 'SHADOW_TIMEOUT' })), timeoutMs)),
  ]);
}

async function runShadowEvent(input, options = {}) {
  const enabled = isShadowEnabled(options);
  if (!enabled) return { eventId: null, status: 'DISABLED', raw: null, userFacingAuthority: false, productionMutationAttempted: false, persisted: false, stopRecommended: false };
  let raw;
  try {
    const capture = options.captureRawInput || captureRawInput;
    raw = capture(input, options.metadata || {});
  } catch (captureError) {
    const result = {
      eventId: options.metadata && options.metadata.eventId || null,
      status: 'ERROR',
      raw: null,
      userFacingAuthority: false,
      productionMutationAttempted: false,
      persisted: false,
      stopRecommended: true,
      stopConditions: [{ code: 'RAW_CAPTURE_ERROR', severity: 'CRITICAL' }],
      error: sanitizeOperationalError(captureError),
      operationalErrors: [{ hook: 'captureRawInput', ...sanitizeOperationalError(captureError) }],
    };
    if (options.metrics && typeof options.metrics.observe === 'function') {
      try { await Promise.resolve(options.metrics.observe(result)); } catch (metricsError) { result.operationalErrors.push({ hook: 'metrics.observe', ...sanitizeOperationalError(metricsError) }); }
    }
    return result;
  }
  const base = { eventId: raw.eventId, status: enabled ? 'QUEUED' : 'DISABLED', raw, userFacingAuthority: false, productionMutationAttempted: false, persisted: false, stopRecommended: false };
  const started = Date.now();
  let runner;
  let output; let error = null; let status = 'PROCESSED';
  let replayOutput = null;
  try {
    runner = options.runner || createPatch3Runner(options);
    output = await timeoutPromise(runner(clone(raw.rawInput)), options.timeoutMs || 500);
    if (options.determinismCheck) replayOutput = await timeoutPromise(runner(clone(raw.rawInput)), options.timeoutMs || 500);
  } catch (caught) {
    error = caught;
    status = caught && caught.code === 'SHADOW_TIMEOUT' ? 'TIMEOUT' : 'ERROR';
  }
  const latencyMs = Date.now() - started;
  const normalized = extractNormalized(output || {}, raw);
  const patch3 = projectPatch3(output || {}, latencyMs, error);
  const assertions = evaluateL005Assertions({ raw, normalized, patch3 });
  const comparison = buildComparison(options.productionSnapshot, patch3, normalized);
  const stopConditions = [];
  if (error) stopConditions.push({ code: status === 'TIMEOUT' ? 'TIMEOUT' : 'SHADOW_RUNNER_ERROR', severity: 'HIGH', detail: error.message });
  if (assertions.some((item) => !item.passed)) stopConditions.push({ code: 'L005_ASSERTION_FAILURE', severity: 'HIGH', detail: assertions.filter((item) => !item.passed).map((item) => item.id) });
  if (isUnresolvedTraining(normalized) && menuIsAuthorized(patch3.menuAuthorization)) stopConditions.push({ code: 'UNRESOLVED_MENU_AUTHORIZED', severity: 'CRITICAL' });
  const numericScan = finiteAndRanges(output || {});
  numericScan.problems.forEach((code) => stopConditions.push({ code, severity: 'CRITICAL' }));
  if (comparison.changeClass === 'UNEXPECTED_SCIENTIFIC_OUTPUT_CHANGE') stopConditions.push({ code: 'COMPLETE_TUPLE_OUTPUT_CHANGE', severity: 'CRITICAL' });
  if (options.determinismCheck) {
    const withoutTiming = (value) => { const { latencyMs, error: runError, ...semantic } = value || {}; return semantic; };
    if (stable(withoutTiming(projectPatch3(replayOutput || {}, 0))) !== stable(withoutTiming(patch3))) stopConditions.push({ code: 'NON_DETERMINISTIC_OUTPUT', severity: 'CRITICAL' });
  }
  if (options.routingAnomaly) stopConditions.push({ code: 'SYSTEMATIC_ROUTING_ANOMALY', severity: 'HIGH' });
  if (options.securityViolation) stopConditions.push({ code: 'SECURITY_VIOLATION', severity: 'CRITICAL' });
  if (options.productionMutationAttempted) stopConditions.push({ code: 'PRODUCTION_MUTATION_ATTEMPTED', severity: 'CRITICAL' });
  if (options.maxLatencyMs && latencyMs > options.maxLatencyMs) stopConditions.push({ code: 'MATERIAL_LATENCY_IMPACT', severity: 'HIGH', latencyMs });
  if (normalized.mappingStatus !== 'OK' || patch3.mappingStatus !== 'OK') stopConditions.push({ code: 'SHADOW_MAPPING_ERROR', severity: 'CRITICAL', detail: [...(normalized.mappingErrors || []), ...(patch3.mappingErrors || [])] });
  const result = { ...base, status, realRunnerUsed: Boolean(runner && runner.realRunnerUsed), runnerProvenance: runner && runner.realRunnerUsed ? { patch3Root: runner.patch3Root, sourcePath: runner.sourcePath } : { type: 'TEST_ONLY_OR_INJECTED_RUNNER' }, normalized, patch3, comparison, assertions, numericTelemetry: { status: numericScan.problems.length ? 'INVALID_NUMERIC_VALUE' : 'OK', acceptedOpenBounds: numericScan.acceptedOpenBounds }, stopConditions, stopRecommended: stopConditions.length > 0, latencyMs, error: error ? sanitizeOperationalError(error) : null, operationalErrors: [], versions: { harness: SHADOW_HARNESS_VERSION, candidate: patch3.candidateVersion || raw.candidateVersion, freeze: raw.freezeId } };
  if (result.stopRecommended && typeof options.disableFlag === 'function') {
    try { await Promise.resolve(options.disableFlag(result.stopConditions)); } catch (disableError) { result.operationalErrors.push({ hook: 'disableFlag', ...sanitizeOperationalError(disableError) }); }
  }
  if (options.shadowStore && typeof options.shadowStore.write === 'function') {
    try {
      const sanitizer = options.persistenceSanitizer || createRawPersistenceSanitizer({ allowedFields: options.allowedPersistenceFields || [] });
      const persistedResult = sanitizer(result);
      await options.shadowStore.write(persistedResult);
      result.persisted = true;
      result.persistencePrivacy = persistedResult.persistencePrivacy || { state: 'CUSTOM_SANITIZER_APPLIED' };
    } catch (persistError) { result.persistError = sanitizeOperationalError(persistError); }
  }
  if (options.metrics && typeof options.metrics.observe === 'function') {
    try { await Promise.resolve(options.metrics.observe(result)); } catch (metricsError) { result.operationalErrors.push({ hook: 'metrics.observe', ...sanitizeOperationalError(metricsError) }); }
  }
  return result;
}

module.exports = {
  SHADOW_HARNESS_VERSION,
  DEFAULT_CANDIDATE_VERSION,
  DEFAULT_FREEZE_ID,
  isShadowEnabled,
  captureRawInput,
  createPatch3Runner,
  createRawPersistenceSanitizer,
  createShadowMetrics,
  createShadowStore,
  buildComparison,
  evaluateL005Assertions,
  runShadowEvent,
  extractNormalized,
  projectPatch3,
};
