import { SHADOW_COLLECTIONS, withRetention } from './shadow-store.mjs';

export function createUnconfiguredAlertAdapter() {
  return Object.freeze({ status: 'ALERTING_NOT_CONFIGURED', async notify() { return { status: 'ALERTING_NOT_CONFIGURED' }; } });
}

export function createMemoryAlertAdapter() {
  const alerts = [];
  return Object.freeze({
    status: 'INJECTED_ALERTING_CONFIGURED',
    async notify(alert) { alerts.push(structuredClone(alert)); return { status: 'RECORDED' }; },
    readAll: () => structuredClone(alerts),
  });
}

export function isCriticalShadowFinding(result) {
  return Boolean(result?.stopRecommended
    || result?.status === 'ERROR'
    || result?.stopConditions?.some(item => item.severity === 'CRITICAL')
    || result?.stopConditions?.some(item => [
      'SHADOW_MAPPING_ERROR', 'UNRESOLVED_MENU_AUTHORIZED', 'COMPLETE_TUPLE_OUTPUT_CHANGE',
      'PRODUCTION_MUTATION_ATTEMPTED', 'IMPOSSIBLE_RANGE', 'SHADOW_RUNNER_ERROR',
      'FROZEN_MANIFEST_MISMATCH', 'DATASTORE_ISOLATION_FAILURE',
    ].some(code => String(item.code || '').startsWith(code))));
}

export async function processShadowStop({ result, receiptId, alertAdapter, datastore }) {
  if (!isCriticalShadowFinding(result)) return { stopped: false, alertStatus: 'NOT_REQUIRED' };
  const alert = withRetention({
    receiptId,
    createdAt: new Date().toISOString(),
    status: result.status,
    stopConditions: structuredClone(result.stopConditions || []),
    stopRecommended: true,
  }, 'alert');
  let alertStatus = alertAdapter?.status || 'ALERTING_NOT_CONFIGURED';
  try { alertStatus = (await alertAdapter?.notify?.(alert))?.status || alertStatus; } catch { alertStatus = 'ALERTING_FAILED_ISOLATED'; }
  try {
    if (datastore?.status === 'ISOLATED_DATASTORE_CONFIGURED') {
      await datastore.write(SHADOW_COLLECTIONS.alerts, alert);
      await datastore.disable('CRITICAL_SHADOW_STOP_CONDITION');
    }
  } catch {
    // Stop/alert failures remain shadow-only and never escape to Production.
  }
  return { stopped: true, alertStatus };
}
