import { assertObservation, observationFingerprint, timestampToMs } from './longitudinal-core.mjs';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function positiveInt(value, fallback) {
  if (value == null) return fallback;
  // 251 is an internal over-fetch used only to determine whether a public
  // page of at most 250 observations has another page.
  if (!Number.isInteger(value) || value < 1 || value > 251) fail('LONGITUDINAL_INVALID_PAGE_SIZE');
  return value;
}

function dataToObservation(data) {
  if (!data) return null;
  const record = { ...data };
  delete record.createdAt;
  delete record.updatedAt;
  delete record.idempotencyFingerprint;
  return assertObservation(record);
}

/**
 * Firebase-web adapter. Firebase functions are injected from firebase-init.js
 * so this module neither creates a second app nor acquires auth independently.
 */
export function createFirestoreLongitudinalStore({ db, sdk }) {
  const required = ['doc', 'collection', 'getDoc', 'getDocs', 'query', 'where', 'orderBy', 'limit', 'startAfter', 'documentId', 'runTransaction', 'serverTimestamp'];
  if (!db || !sdk || required.some(name => typeof sdk[name] !== 'function')) {
    fail('LONGITUDINAL_FIRESTORE_SDK_REQUIRED');
  }

  const records = ownerId => sdk.collection(db, 'users', ownerId, 'longitudinal_observations');
  const record = (ownerId, id) => sdk.doc(db, 'users', ownerId, 'longitudinal_observations', id);

  return Object.freeze({
    async createIfAbsent(ownerId, observation) {
      const canonical = assertObservation(observation);
      const ref = record(ownerId, canonical.id);
      let created = false;
      let saved = null;
      await sdk.runTransaction(db, async transaction => {
        const existing = await transaction.get(ref);
        if (existing.exists()) {
          saved = dataToObservation(existing.data());
          return;
        }
        const payload = {
          ...canonical,
          idempotencyFingerprint: observationFingerprint(canonical),
          createdAt: sdk.serverTimestamp(),
          updatedAt: sdk.serverTimestamp(),
        };
        transaction.set(ref, payload);
        created = true;
        saved = canonical;
      });
      return { created, record: saved };
    },
    async get(ownerId, id) {
      const snapshot = await sdk.getDoc(record(ownerId, id));
      return snapshot.exists() ? dataToObservation(snapshot.data()) : null;
    },
    async list(ownerId, options = {}) {
      const direction = options.direction === 'desc' ? 'desc' : 'asc';
      const constraints = [];
      if (options.type != null) constraints.push(sdk.where('type', '==', options.type));
      if (options.from != null) constraints.push(sdk.where('observedAtMs', '>=', timestampToMs(options.from, 'from')));
      if (options.to != null) constraints.push(sdk.where('observedAtMs', '<=', timestampToMs(options.to, 'to')));
      constraints.push(sdk.orderBy('observedAtMs', direction), sdk.orderBy(sdk.documentId(), direction));
      if (options.cursor?.observedAtMs != null && options.cursor?.id) {
        constraints.push(sdk.startAfter(Number(options.cursor.observedAtMs), String(options.cursor.id)));
      }
      constraints.push(sdk.limit(positiveInt(options.limit, 250)));
      const snapshots = await sdk.getDocs(sdk.query(records(ownerId), ...constraints));
      return snapshots.docs.map(snapshot => dataToObservation(snapshot.data()));
    },
  });
}
