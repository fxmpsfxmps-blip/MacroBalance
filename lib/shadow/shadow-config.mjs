export const SHADOW_INTEGRATION_VERSION = 'shadow-deployment-integration-0.1.0';
export const PRODUCTION_FIREBASE_PROJECT_ID = 'macrobalance-502bb';
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024;

function strictBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function strictBps(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : 0;
}

function strictPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function readServerShadowConfig(env = process.env) {
  const serverEnabled = strictBoolean(env.MB_SHADOW_SERVER_ENABLED, false);
  const killSwitch = strictBoolean(env.MB_SHADOW_KILL_SWITCH, true);
  const sampleBps = strictBps(env.MB_SHADOW_SAMPLE_BPS);
  const datastoreProjectId = String(env.MB_SHADOW_DATASTORE_PROJECT_ID || '').trim() || null;
  const datastorePathPrefix = String(env.MB_SHADOW_DATASTORE_PATH_PREFIX || 'shadow').trim() || null;
  const datastoreUrl = String(env.MB_SHADOW_DATASTORE_URL || '').trim() || null;
  const datastoreToken = String(env.MB_SHADOW_DATASTORE_TOKEN || '') || null;
  const authProjectId = String(env.MB_SHADOW_AUTH_PROJECT_ID || PRODUCTION_FIREBASE_PROJECT_ID).trim() || null;
  const pseudonymSecret = String(env.MB_SHADOW_PSEUDONYM_SECRET || '') || null;
  const allowedOrigin = String(env.MB_SHADOW_ALLOWED_ORIGIN || '').trim() || null;
  const healthToken = String(env.MB_SHADOW_HEALTH_TOKEN || '') || null;
  const maxBodyBytes = strictPositiveInteger(env.MB_SHADOW_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES);
  const datastoreConfigured = Boolean(datastoreProjectId && datastorePathPrefix && datastoreUrl && datastoreToken);
  const authConfigured = Boolean(authProjectId);
  const pseudonymizationConfigured = Boolean(pseudonymSecret && pseudonymSecret.length >= 32);
  const requested = serverEnabled && !killSwitch && sampleBps > 0;
  const executionEnabled = requested && datastoreConfigured && authConfigured && pseudonymizationConfigured && Boolean(allowedOrigin);
  const disabledReasons = [
    !serverEnabled ? 'SERVER_FLAG_OFF' : null,
    killSwitch ? 'KILL_SWITCH_ON' : null,
    sampleBps === 0 ? 'SAMPLE_BPS_ZERO' : null,
    !datastoreConfigured ? 'DATASTORE_NOT_CONFIGURED' : null,
    !authConfigured ? 'AUTH_NOT_CONFIGURED' : null,
    !pseudonymizationConfigured ? 'PSEUDONYMIZATION_NOT_CONFIGURED' : null,
    !allowedOrigin ? 'ALLOWED_ORIGIN_NOT_CONFIGURED' : null,
  ].filter(Boolean);
  return Object.freeze({
    integrationVersion: SHADOW_INTEGRATION_VERSION,
    serverEnabled,
    killSwitch,
    sampleBps,
    executionEnabled,
    disabledReasons,
    datastoreProjectId,
    datastorePathPrefix,
    datastoreUrl,
    datastoreToken,
    datastoreConfigured,
    authProjectId,
    authConfigured,
    pseudonymSecret,
    pseudonymizationConfigured,
    allowedOrigin,
    healthToken,
    maxBodyBytes,
    alertingConfigured: Boolean(env.MB_SHADOW_ALERT_DESTINATION),
  });
}

export function readPublicShadowConfig(env = process.env) {
  const requested = strictBoolean(env.MB_SHADOW_CLIENT_ENABLED, false);
  const killSwitch = strictBoolean(env.MB_SHADOW_KILL_SWITCH, true);
  const sampleBps = strictBps(env.MB_SHADOW_SAMPLE_BPS);
  return Object.freeze({
    schemaVersion: 'shadow-public-config-v1',
    clientEnabled: requested && !killSwitch && sampleBps > 0,
    killSwitch,
    sampleBps,
    endpoint: '/api/shadow-evaluate',
    integrationVersion: SHADOW_INTEGRATION_VERSION,
  });
}
