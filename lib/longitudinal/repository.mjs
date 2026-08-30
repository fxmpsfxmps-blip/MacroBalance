import {
  assertObservation,
  correctObservation,
  createObservation,
  filterObservations,
  observationFingerprint,
  sortObservations,
} from './longitudinal-core.mjs';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function serviceError(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function pageSize(value) {
  if (value == null) return 50;
  if (!Number.isInteger(value) || value < 1 || value > 250) serviceError('LONGITUDINAL_INVALID_PAGE_SIZE');
  return value;
}

function cursorAfter(item, cursor, direction) {
  if (!cursor) return true;
  const time = Number(cursor.observedAtMs);
  const id = String(cursor.id || '');
  const comparison = Number(item.observedAtMs) - time || String(item.id).localeCompare(id);
  return direction === 'desc' ? comparison < 0 : comparison > 0;
}

/**
 * Minimal in-memory driver used by deterministic service tests. It deliberately
 * scopes every operation by owner, mirroring the Firestore path boundary.
 */
export function createInMemoryLongitudinalStore() {
  const byOwner = new Map();
  function records(ownerId) {
    if (!byOwner.has(ownerId)) byOwner.set(ownerId, new Map());
    return byOwner.get(ownerId);
  }
  return Object.freeze({
    async createIfAbsent(ownerId, record) {
      const ownerRecords = records(ownerId);
      const existing = ownerRecords.get(record.id);
      if (existing) return { created: false, record: clone(existing) };
      ownerRecords.set(record.id, clone(record));
      return { created: true, record: clone(record) };
    },
    async get(ownerId, id) {
      const value = records(ownerId).get(id);
      return value ? clone(value) : null;
    },
    async list(ownerId) {
      return [...records(ownerId).values()].map(clone);
    },
    async seed(ownerId, record) {
      records(ownerId).set(record.id, clone(record));
    },
  });
}

/**
 * Domain service. It has no database SDK dependency and never selects a
 * nutritional policy. The owner is fixed at construction so callers cannot
 * redirect a read or write to a different user's history.
 */
export function createLongitudinalService({ ownerId, store, enabled = true }) {
  if (!ownerId || typeof ownerId !== 'string') serviceError('LONGITUDINAL_OWNER_REQUIRED');
  if (!store || typeof store.createIfAbsent !== 'function' || typeof store.get !== 'function' || typeof store.list !== 'function') {
    serviceError('LONGITUDINAL_STORE_REQUIRED');
  }

  function assertEnabled() {
    if (!enabled) serviceError('V3_LONGITUDINAL_DISABLED');
  }

  function assertOwner(input) {
    if (input?.ownerId != null && input.ownerId !== ownerId) serviceError('LONGITUDINAL_OWNER_MISMATCH');
  }

  async function record(input) {
    assertEnabled();
    assertOwner(input);
    const observation = createObservation({ ...input, ownerId });
    const existing = await store.get(ownerId, observation.id);
    if (existing) {
      if (observationFingerprint(existing) !== observationFingerprint(observation)) {
        serviceError('LONGITUDINAL_IDEMPOTENCY_CONFLICT');
      }
      return Object.freeze({ created: false, idempotent: true, observation: Object.freeze(clone(existing)) });
    }
    const result = await store.createIfAbsent(ownerId, observation);
    if (!result.created && observationFingerprint(result.record) !== observationFingerprint(observation)) {
      serviceError('LONGITUDINAL_IDEMPOTENCY_CONFLICT');
    }
    return Object.freeze({
      created: Boolean(result.created),
      idempotent: !result.created,
      observation: Object.freeze(clone(result.record)),
    });
  }

  async function get(id) {
    assertEnabled();
    const result = await store.get(ownerId, id);
    return result ? Object.freeze(assertObservation(result)) : null;
  }

  async function list(options = {}) {
    assertEnabled();
    const direction = options.direction === 'desc' ? 'desc' : 'asc';
    const limit = pageSize(options.limit);
    // Fetch one additional item where the backing store supports it so callers
    // get a truthful nextCursor without materializing a lifetime history.
    const raw = await store.list(ownerId, { ...options, limit: Math.min(limit + 1, 251) });
    const matching = filterObservations(raw, { ...options, direction })
      .filter(item => cursorAfter(item, options.cursor, direction));
    const page = matching.slice(0, limit);
    const last = page.at(-1);
    return Object.freeze({
      items: Object.freeze(page.map(item => Object.freeze(item))),
      nextCursor: matching.length > page.length && last
        ? Object.freeze({ observedAtMs: last.observedAtMs, id: last.id })
        : null,
      direction,
    });
  }

  async function latest(options = {}) {
    const page = await list({ ...options, direction: 'desc', limit: 1 });
    return page.items[0] || null;
  }

  async function correct(previousId, correction) {
    assertEnabled();
    const previous = await get(previousId);
    if (!previous) serviceError('LONGITUDINAL_OBSERVATION_NOT_FOUND');
    assertOwner(correction);
    return record(correctObservation(previous, { ...correction, ownerId }));
  }

  async function all(options = {}) {
    const result = await list({ ...options, limit: 250 });
    return result.items;
  }

  return Object.freeze({
    ownerId,
    enabled: Boolean(enabled),
    record,
    get,
    list,
    latest,
    correct,
    all,
  });
}

export function createReadOnlyHistory({ observations = [] } = {}) {
  const normalized = sortObservations((Array.isArray(observations) ? observations : []).map(assertObservation));
  return Object.freeze({
    observations: Object.freeze(normalized),
    list(options = {}) {
      return Object.freeze(filterObservations(normalized, options));
    },
  });
}
