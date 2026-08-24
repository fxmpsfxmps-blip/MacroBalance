(function exposeAuthCoordinator(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MacroBalanceAuthCoordinator = api;
})(typeof window !== 'undefined' ? window : globalThis, function createModule() {
  const CANCELLATION_CODES = new Set([
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
    'auth/user-cancelled'
  ]);

  function isOAuthCancellation(error) {
    return CANCELLATION_CODES.has(error?.code);
  }

  function createOAuthCoordinator(options) {
    let activeProvider = null;

    async function login(providerName) {
      const provider = options.providers[providerName];
      if (!provider) {
        const error = new Error(`Proveedor no disponible: ${providerName}`);
        error.code = 'auth/provider-not-configured';
        options.onError?.(error, providerName);
        return { status: 'error', error };
      }

      if (activeProvider) {
        options.onBusy?.(activeProvider, providerName);
        return { status: 'busy', provider: activeProvider };
      }

      activeProvider = providerName;
      options.onStatus?.({ status: 'working', provider: providerName });

      try {
        const result = await options.signIn(provider, providerName);
        await options.waitForAuth(result.user, providerName);
        options.onSuccess?.(result.user, providerName);
        return { status: 'success', user: result.user, provider: providerName };
      } catch (error) {
        if (isOAuthCancellation(error)) {
          options.onCancel?.(error, providerName);
          return { status: 'cancelled', error, provider: providerName };
        }
        options.onError?.(error, providerName);
        return { status: 'error', error, provider: providerName };
      } finally {
        activeProvider = null;
        options.onStatus?.({ status: 'idle', provider: null });
      }
    }

    return {
      login,
      getActiveProvider: () => activeProvider
    };
  }

  return { CANCELLATION_CODES, isOAuthCancellation, createOAuthCoordinator };
});
