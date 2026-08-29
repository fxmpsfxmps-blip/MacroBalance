import crypto from 'node:crypto';
import { readServerShadowConfig } from './shadow-config.mjs';
import { createFirebaseTokenVerifier, deterministicSample, pseudonymizeUid, ShadowAuthError } from './shadow-auth.mjs';
import { minimizeRawPayload, mapProductionRawToPatch3 } from './shadow-mapper.mjs';
import { createHttpIsolatedDatastore, createUnconfiguredDatastore, SHADOW_COLLECTIONS, withRetention } from './shadow-store.mjs';
import { createUnconfiguredAlertAdapter, processShadowStop } from './shadow-alerts.mjs';
import { createVerifiedFrozenPatch3Runner, harnessIntegrity, verifyFrozenPatch3 } from './frozen-patch3-verifier.mjs';
import { verifyNoProductionAuthorityImports } from './shadow-integrity.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runShadowEvent, SHADOW_HARNESS_VERSION } = require('./shadow-harness.cjs');

function send(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' } });
}

function header(request, name) {
  if (typeof request.get === 'function') return request.get(name);
  if (request.headers && typeof request.headers.get === 'function') return request.headers.get(name);
  return request.headers?.[name.toLowerCase()];
}

async function readJsonBody(request, maxBytes) {
  const declared = Number(header(request, 'content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('SHADOW_BODY_TOO_LARGE'), { status: 413 });
  if (request.body !== undefined && request.body !== null && typeof request.body.getReader !== 'function') {
    const text = Buffer.isBuffer(request.body) ? request.body.toString('utf8')
      : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(text) > maxBytes) throw Object.assign(new Error('SHADOW_BODY_TOO_LARGE'), { status: 413 });
    try { return JSON.parse(text); } catch { throw Object.assign(new Error('SHADOW_JSON_INVALID'), { status: 400 }); }
  }
  const chunks = []; let size = 0;
  if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = Buffer.from(part.value);
      size += chunk.length;
      if (size > maxBytes) throw Object.assign(new Error('SHADOW_BODY_TOO_LARGE'), { status: 413 });
      chunks.push(chunk);
    }
  } else for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('SHADOW_BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('SHADOW_JSON_INVALID'), { status: 400 }); }
}

function disabledResponse(config) {
  return { accepted: false, shadowStatus: 'DISABLED', reasonCodes: config.disabledReasons, integrationVersion: config.integrationVersion };
}

function configuredDatastore(config) {
  if (!config.datastoreConfigured) return createUnconfiguredDatastore();
  return createHttpIsolatedDatastore({ projectId: config.datastoreProjectId, pathPrefix: config.datastorePathPrefix, url: config.datastoreUrl, token: config.datastoreToken });
}

function safeDatastore(config) {
  try { return configuredDatastore(config); } catch { return createUnconfiguredDatastore(); }
}

function assertDeclaredBodySize(request, maxBytes) {
  const declared = Number(header(request, 'content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('SHADOW_BODY_TOO_LARGE'), { status: 413 });
}

export function createShadowEvaluateHandler(dependencies = {}) {
  return async function shadowEvaluate(request, response) {
    let config;
    try {
      config = dependencies.config || readServerShadowConfig(dependencies.env || process.env);
      if (request.method !== 'POST') return send(405, { accepted: false, shadowStatus: 'METHOD_NOT_ALLOWED' });
      // The flags are deliberately evaluated before touching request.body.
      if (!config.serverEnabled || config.killSwitch || config.sampleBps === 0 || !config.executionEnabled) {
        return send(202, disabledResponse(config));
      }
      if (header(request, 'origin') !== config.allowedOrigin) return send(403, { accepted: false, shadowStatus: 'ORIGIN_REJECTED' });
      if (!/^application\/json(?:\s*;|$)/i.test(String(header(request, 'content-type') || ''))) {
        return send(415, { accepted: false, shadowStatus: 'CONTENT_TYPE_REJECTED' });
      }
      assertDeclaredBodySize(request, config.maxBodyBytes);
      const verifyAuth = dependencies.verifyAuth || createFirebaseTokenVerifier({ projectId: config.authProjectId });
      const auth = await verifyAuth(header(request, 'authorization'));
      const receiptId = crypto.randomUUID();
      const pseudo = pseudonymizeUid(auth.uid, config.pseudonymSecret);
      // auth.uid and the bearer token have no persistence path after this line.
      if (!deterministicSample(pseudo.pseudonymousParticipantId, config.sampleBps)) {
        return send(202, { accepted: false, shadowStatus: 'NOT_SAMPLED', receiptId });
      }
      const body = await readJsonBody(request, config.maxBodyBytes);
      const minimized = (dependencies.minimize || minimizeRawPayload)(body);
      const mapped = (dependencies.map || mapProductionRawToPatch3)(minimized, { receiptId, ...pseudo });
      const verification = await (dependencies.verifyFrozen || verifyFrozenPatch3)();
      const integrity = await (dependencies.verifyIntegrity || verifyNoProductionAuthorityImports)();
      if (integrity.status !== 'PASS') throw Object.assign(new Error('PRODUCTION_MUTATION_ATTEMPTED'), { critical: true });
      const runner = dependencies.runner || await (dependencies.createRunner || createVerifiedFrozenPatch3Runner)();
      const patch3Output = await runner(mapped.patch3Input);
      const harness = dependencies.runHarness || runShadowEvent;
      const harnessResult = await harness(mapped.patch3Input, {
        enabled: true, serverEnabled: true, killSwitch: false, sampleBps: 10000,
        runner, metadata: { eventId: receiptId }, determinismCheck: false,
        timeoutMs: dependencies.timeoutMs || 1500,
      });
      const datastore = dependencies.datastore || configuredDatastore(config);
      const alertAdapter = dependencies.alertAdapter || createUnconfiguredAlertAdapter();
      if (datastore.status !== 'ISOLATED_DATASTORE_CONFIGURED') throw Object.assign(new Error('DATASTORE_ISOLATION_FAILURE'), { critical: true });
      const common = { receiptId, pseudonymousParticipantId: pseudo.pseudonymousParticipantId, pseudonymizationVersion: pseudo.pseudonymizationVersion, receivedAt: new Date().toISOString() };
      await datastore.write(SHADOW_COLLECTIONS.raw, withRetention({ ...common, raw: minimized, mapping: mapped }, 'raw'));
      await datastore.write(SHADOW_COLLECTIONS.results, withRetention({
        ...common, verification, patch3: patch3Output, harness: harnessResult,
        productionComparison: {
          status: 'NOT_AVAILABLE_AT_RAW_INPUT_HOOK',
          equivalentFields: null,
          reasonCode: 'PRODUCTION_CALCULATION_REMAINS_SYNCHRONOUS_AND_UNOBSERVED_BY_SHADOW',
        },
      }, 'result'));
      const stop = await processShadowStop({ result: harnessResult, receiptId, alertAdapter, datastore });
      return send(202, { accepted: true, shadowStatus: stop.stopped ? 'ACCEPTED_AND_STOPPED' : 'ACCEPTED', receiptId });
    } catch (error) {
      const status = error instanceof ShadowAuthError ? error.status : Number(error.status) || 202;
      const code = error.code || error.message || 'SHADOW_EXECUTION_ERROR';
      try {
        await processShadowStop({
          result: { status: 'ERROR', stopRecommended: true, stopConditions: [{ code, severity: 'CRITICAL' }] },
          receiptId: null,
          alertAdapter: dependencies.alertAdapter || createUnconfiguredAlertAdapter(),
          datastore: dependencies.datastore || (config ? safeDatastore(config) : createUnconfiguredDatastore()),
        });
      } catch { /* shadow isolation is absolute */ }
      return send(status, { accepted: false, shadowStatus: 'ISOLATED_ERROR', reasonCode: code });
    }
  };
}

export function createShadowHealthHandler(dependencies = {}) {
  return async function shadowHealth(request, response) {
    const config = dependencies.config || readServerShadowConfig(dependencies.env || process.env);
    if (request.method !== 'GET') return send(405, { status: 'METHOD_NOT_ALLOWED' });
    const token = String(header(request, 'authorization') || '').replace(/^Bearer\s+/i, '');
    const tokenMatches = Boolean(config.healthToken)
      && token.length === config.healthToken.length
      && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(config.healthToken));
    if (!tokenMatches) {
      return send(401, { status: 'HEALTH_AUTH_REQUIRED' });
    }
    try {
      const frozen = await (dependencies.verifyFrozen || verifyFrozenPatch3)();
      const harness = await (dependencies.harnessIntegrity || harnessIntegrity)();
      return send(200, {
        status: 'OK', enabled: config.executionEnabled, serverEnabled: config.serverEnabled,
        killSwitch: config.killSwitch, sampleBps: config.sampleBps,
        harness: { version: SHADOW_HARNESS_VERSION, sha256: harness.sha256 },
        patch3: { freezeId: frozen.candidateFreezeId, manifestHash: frozen.manifestHash },
        datastoreStatus: dependencies.datastore?.status || 'DATASTORE_NOT_CONFIGURED',
        alertAdapterStatus: dependencies.alertAdapter?.status || 'ALERTING_NOT_CONFIGURED',
        integrationVersion: config.integrationVersion,
      });
    } catch (error) { return send(503, { status: 'STOP', reasonCode: error.code || error.message }); }
  };
}
