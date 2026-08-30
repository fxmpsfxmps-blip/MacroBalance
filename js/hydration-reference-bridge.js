(function installHydrationReferenceBridge() {
  const modulePromise = import('/lib/hydration/hydration-reference.mjs');
  window.MacroBalanceHydration = Object.freeze({
    schemaVersion: 'hydration-browser-bridge-v1',
    async buildReference(profile) {
      const hydration = await modulePromise;
      return hydration.assertHydrationReference(hydration.buildHydrationReference(profile));
    },
    async present(reference) {
      const hydration = await modulePromise;
      return hydration.hydrationPresentation(reference);
    },
  });
})();
