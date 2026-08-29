(function shadowClientBootstrap(window, document) {
  'use strict';

  const config = window.__MB_SHADOW_CONFIG__;
  const enabled = config?.schemaVersion === 'shadow-public-config-v1'
    && config.clientEnabled === true
    && config.killSwitch === false
    && Number.isInteger(config.sampleBps)
    && config.sampleBps > 0;

  function field(id) {
    const element = document.getElementById(id);
    if (!element) return { state: 'MISSING_ELEMENT', value: null };
    return { state: element.value === '' ? 'EMPTY' : 'PRESENT', value: element.value };
  }

  function pressed(id) {
    const element = document.getElementById(id);
    if (!element) return { state: 'MISSING_ELEMENT', value: null };
    const value = element.getAttribute('aria-pressed');
    return value === 'true' || value === 'false' ? { state: 'PRESENT', value } : { state: 'EMPTY', value: '' };
  }

  function captureRaw() {
    const precisionPressed = pressed('mode-precision');
    const standardPressed = pressed('mode-standard');
    const mode = precisionPressed.value === 'true' ? 'precision' : standardPressed.value === 'true' ? 'standard' : '';
    return {
      schemaVersion: 'shadow_raw_v1',
      eventId: window.crypto?.randomUUID?.() || null,
      clientTimestamp: new Date().toISOString(),
      integrationVersion: config.integrationVersion,
      calculatorMode: { state: mode ? 'PRESENT' : 'EMPTY', value: mode },
      fields: {
        sex: field('sexo'), age: field('edad'), heightCm: field('altura'), weightKg: field('peso'),
        bodyFatPercent: field('grasa'), objectiveIndex: field('objetivoPreferido'), activityFactor: field('actividad'),
        sleepHours: field('sueno'), stressLevel: field('estres'),
        gymYesPressed: pressed('gym-si'), gymNoPressed: pressed('gym-no'), gymDays: field('dias-gym'),
        precisionSteps: field('precision-steps'), precisionTrainingType: field('precision-training-type'),
        precisionTrainingIntensity: field('precision-training-intensity'), precisionTrainingMinutes: field('precision-training-minutes'),
        precisionCardioType: field('precision-cardio-type'), precisionCardioDays: field('precision-cardio-days'),
        precisionCardioMinutes: field('precision-cardio-minutes'), precisionRate: field('precision-rate'),
      },
    };
  }

  function deferSend(snapshot) {
    const schedule = window.requestIdleCallback
      ? callback => window.requestIdleCallback(callback, { timeout: 1500 })
      : callback => window.setTimeout(callback, 0);
    schedule(async () => {
      try {
        const token = await window.macroBalanceState?.user?.getIdToken?.();
        if (!token) return;
        await window.fetch(config.endpoint || '/api/shadow-evaluate', {
          method: 'POST', keepalive: true, credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(snapshot),
        });
      } catch { /* Shadow has zero authority over the calculator. */ }
    });
  }

  window.MacroBalanceShadow = Object.freeze({
    enabled,
    captureAndQueueCalculatorSubmission() {
      if (!enabled) return false;
      try { deferSend(captureRaw()); } catch { /* isolated */ }
      return true;
    },
  });
})(window, document);
