(function exposePatch3Standard(root) {
  'use strict';
  let modulePromise;
  function load() {
    modulePromise ||= import('/lib/standard/patch3-standard-adapter.mjs');
    return modulePromise;
  }
  async function resolutionModule() {
    return import('/lib/standard/standard-resolution-ux.mjs');
  }
  async function preflightModule() {
    return import('/lib/standard/standard-intake-preflight.mjs');
  }
  async function lowBodySizePreflightModule() {
    return import('/lib/standard/low-body-size-preflight-v1.mjs');
  }
  root.MacroBalancePatch3Standard = Object.freeze({
    load,
    async calculate(profile) {
      const module = await load();
      return module.calculatePatch3Standard(profile);
    },
    async assertFiniteNutritionTarget(target) {
      const module = await load();
      return module.assertFiniteNutritionTarget(target);
    },
    async resolveUnavailability(result) {
      const module = await resolutionModule();
      return module.resolveStandardPlan(result);
    },
    async validateIntake(input) {
      const module = await preflightModule();
      return module.validateStandardIntakePreflight(input);
    },
    async evaluateLowBodySizePreflightShadow(profile, answers, options) {
      const module = await lowBodySizePreflightModule();
      return module.evaluateLowBodySizePreflightV1(profile, answers, options);
    },
    async lowBodySizePreflightUiConfig() {
      const module = await lowBodySizePreflightModule();
      return module.lowBodySizePreflightUiConfig();
    },
  });
})(window);
