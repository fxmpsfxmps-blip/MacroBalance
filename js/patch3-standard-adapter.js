(function exposePatch3Standard(root) {
  'use strict';
  let modulePromise;
  function load() {
    modulePromise ||= import('/lib/standard/patch3-standard-adapter.mjs');
    return modulePromise;
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
  });
})(window);
