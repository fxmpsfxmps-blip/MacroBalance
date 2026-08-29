import { deepFreeze } from '../core/inputScope.js';

export const RESOLVER_CAPABILITY_REGISTRY_VERSION = 'candidate-v1-resolver-capabilities-0.1.0';

export const resolverCapabilityRegistry = deepFreeze({
  version: RESOLVER_CAPABILITY_REGISTRY_VERSION,
  domain: 'CARBOHYDRATE_PERFORMANCE_TARGET',
  standard: {
    status: 'INTERNAL_RESOLVER_NOT_AVAILABLE',
    module: 'A7_STANDARD',
    canResolveMode: true,
    canResolveTarget: false
  },
  advanced: {
    status: 'INTERNAL_RESOLVER_NOT_AVAILABLE',
    module: 'A7_ADVANCED_FUTURE_CAPABILITY',
    canResolveMode: false,
    canResolveTarget: false,
    implementedVersion: null
  },
  externalSpecialist: {
    status: 'EXTERNAL_SPECIALIST_ROUTE',
    module: null,
    externallyRouted: true,
    availabilityAssertedByMacroBalance: false,
    targetResolutionGuaranteed: false
  },
  modeClassificationQuestion: {
    status: 'INTERNAL_CLASSIFICATION_RESOLVER_AVAILABLE',
    module: 'A7_STANDARD',
    canResolveMode: true,
    canResolveTarget: false
  }
});
