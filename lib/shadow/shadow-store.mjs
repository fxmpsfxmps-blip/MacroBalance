import crypto from 'node:crypto';
import { PRODUCTION_FIREBASE_PROJECT_ID } from './shadow-config.mjs';

export const SHADOW_COLLECTIONS = Object.freeze({
  raw: 'shadow_raw_v1',
  results: 'shadow_results_v1',
  alerts: 'shadow_alerts_v1',
  control: 'shadow_control_v1',
  aggregates: 'shadow_aggregates_v1',
});

export const RETENTION_POLICY = Object.freeze({
  status: 'PROPOSED_OPERATIONAL_POLICY',
  rawDays: 7,
  resultDays: 30,
  aggregateDays: 90,
  alertRetention: 'INCIDENT_CLOSURE_PLUS_APPROVED_AUDIT_WINDOW',
});

export class ShadowIsolationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ShadowIsolationError';
    this.code = code;
  }
}

export function assertIsolatedDatastore({ projectId, pathPrefix } = {}) {
  const project = String(projectId || '').trim().toLowerCase();
  const prefix = String(pathPrefix || '').trim().toLowerCase();
  if (!project || !prefix) throw new ShadowIsolationError('DATASTORE_NOT_CONFIGURED');
  if (project === PRODUCTION_FIREBASE_PROJECT_ID || project.includes(PRODUCTION_FIREBASE_PROJECT_ID)) {
    throw new ShadowIsolationError('PRODUCTION_DATASTORE_PROJECT_REFUSED');
  }
  if (/(^|\/)(users|goals_history)(\/|$)/.test(prefix)) {
    throw new ShadowIsolationError('PRODUCTION_DATA_PATH_REFUSED');
  }
  return true;
}

function expiresAt(days, now = Date.now()) {
  return new Date(now + days * 86400000).toISOString();
}

export function withRetention(record, recordType, now = Date.now()) {
  const days = recordType === 'raw' ? RETENTION_POLICY.rawDays
    : recordType === 'result' ? RETENTION_POLICY.resultDays
      : recordType === 'aggregate' ? RETENTION_POLICY.aggregateDays
        : null;
  return Object.freeze({
    ...structuredClone(record),
    retentionPolicy: RETENTION_POLICY.status,
    expiresAt: days === null ? null : expiresAt(days, now),
  });
}

export function createUnconfiguredDatastore() {
  return Object.freeze({
    status: 'DATASTORE_NOT_CONFIGURED',
    async write() { throw new ShadowIsolationError('DATASTORE_NOT_CONFIGURED'); },
    async disable() { throw new ShadowIsolationError('DATASTORE_NOT_CONFIGURED'); },
  });
}

export function createInjectedIsolatedDatastore({ projectId, pathPrefix = 'shadow', writer } = {}) {
  assertIsolatedDatastore({ projectId, pathPrefix });
  if (!writer || typeof writer.write !== 'function') throw new ShadowIsolationError('ISOLATED_DATASTORE_WRITER_REQUIRED');
  return Object.freeze({
    status: 'ISOLATED_DATASTORE_CONFIGURED',
    projectId,
    pathPrefix,
    async write(collection, record) {
      if (!Object.values(SHADOW_COLLECTIONS).includes(collection)) throw new ShadowIsolationError('UNKNOWN_SHADOW_COLLECTION');
      return writer.write(collection, structuredClone(record));
    },
    async disable(reason) {
      return writer.write(SHADOW_COLLECTIONS.control, {
        id: crypto.randomUUID(), enabled: false, reason, changedAt: new Date().toISOString(), source: 'SHADOW_CIRCUIT_BREAKER',
      });
    },
  });
}

export function createMemoryIsolatedDatastore({ projectId = 'macrobalance-shadow-test', pathPrefix = 'shadow-test' } = {}) {
  const records = [];
  const writer = { async write(collection, record) { records.push({ collection, record: structuredClone(record) }); } };
  const adapter = createInjectedIsolatedDatastore({ projectId, pathPrefix, writer });
  return Object.freeze({ ...adapter, readAll: () => structuredClone(records), clear: () => { records.length = 0; } });
}

export function createHttpIsolatedDatastore({ projectId, pathPrefix = 'shadow', url, token, fetchImpl = fetch } = {}) {
  assertIsolatedDatastore({ projectId, pathPrefix });
  if (!/^https:\/\//i.test(String(url || ''))) throw new ShadowIsolationError('ISOLATED_DATASTORE_HTTPS_URL_REQUIRED');
  if (typeof token !== 'string' || token.length < 20) throw new ShadowIsolationError('ISOLATED_DATASTORE_TOKEN_REQUIRED');
  const write = async (collection, record) => {
    if (!Object.values(SHADOW_COLLECTIONS).includes(collection)) throw new ShadowIsolationError('UNKNOWN_SHADOW_COLLECTION');
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ projectId, path: `${pathPrefix}/${collection}`, record }),
    });
    if (!response.ok) throw new ShadowIsolationError('ISOLATED_DATASTORE_WRITE_FAILED');
    return { status: 'WRITTEN' };
  };
  return Object.freeze({
    status: 'ISOLATED_DATASTORE_CONFIGURED', projectId, pathPrefix,
    write,
    async disable(reason) {
      return write(SHADOW_COLLECTIONS.control, { id: crypto.randomUUID(), enabled: false, reason, changedAt: new Date().toISOString(), source: 'SHADOW_CIRCUIT_BREAKER' });
    },
  });
}
