// Product-presentation contract for an unavailable Standard plan.
// It deliberately consumes authority already emitted by PATCH3; it does not
// modify eligibility, scientific routing, or a NutritionTarget.

export const STANDARD_RESOLUTION_ACTIONS = Object.freeze([
  'COMPLETE_INFORMATION',
  'CHANGE_GOAL',
  'CHANGE_RATE',
  'USE_MAINTENANCE_TEMPORARILY',
  'DECLARE_PLANNED_TRAINING',
  'PROVIDE_REALIZED_TRAINING',
  'ADVANCED_HANDOFF',
  'NO_SAFE_AUTOMATIC_RECOVERY'
]);

const UNIQUE = values => [...new Set(values.filter(value => typeof value === 'string' && value))];

function selectedOutput(result, plan) {
  return result?.candidateOutputs?.find(item => item?.goal === result?.preferredGoal)?.output
    || plan?.patch3
    || null;
}

function detailsFor(output, reasonCode) {
  return UNIQUE([
    reasonCode,
    ...(output?.reasonCodes || []),
    ...(output?.trace?.input?.validation?.profile?.trainingInput?.reasonCodes || []),
    ...(output?.trace?.A4_A5?.reasonCodes || []),
    output?.targetContract?.carbohydrate?.targetState || null,
    output?.targetContract?.carbohydrate?.route || null
  ]);
}

function unresolvedInformation() {
  return Object.freeze({
    userMessage: 'Para resolver este objetivo necesitamos confirmar tu entrenamiento actual. Si entrenas actualmente, indica tipo, días, duración y carga; si no, selecciónalo. Los planes futuros no se usan como entrenamiento realizado.',
    allowedActions: Object.freeze(['COMPLETE_INFORMATION', 'PROVIDE_REALIZED_TRAINING'])
  });
}

function performanceRoute() {
  return Object.freeze({
    userMessage: 'Tu entrenamiento actual indica una demanda de rendimiento que Standard no puede convertir de forma fiable en un objetivo automático. No generamos un plan de macros para este caso; requiere una revisión de nutrición de rendimiento.',
    allowedActions: Object.freeze(['ADVANCED_HANDOFF', 'NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

function physiologyReview() {
  return Object.freeze({
    userMessage: 'Standard no puede establecer un objetivo automático con estos datos porque necesita revisar la referencia usada para proteína. No es un diagnóstico ni una indicación de cambiar tu actividad actual; no generamos un plan automáticamente.',
    allowedActions: Object.freeze(['NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

function unknownAuthority() {
  return Object.freeze({
    userMessage: 'No podemos generar un objetivo automático con la información disponible. No modificamos ni sustituimos los datos faltantes de forma automática.',
    allowedActions: Object.freeze(['NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

const RESOLUTION_BY_REASON = Object.freeze({
  UNRESOLVED_MISSING_INFORMATION: unresolvedInformation,
  ROUTED_TARGET_NOT_IDENTIFIED: performanceRoute,
  UNRESOLVED_PHYSIOLOGY: physiologyReview
});

/**
 * Converts an adapter result into product presentation only. `reasonCode`
 * remains the adapter's unavailable reason, while `detailReasonCodes` keeps
 * the supporting trace codes available for audits and future UI rendering.
 */
export function resolveStandardPlan(result) {
  const plan = result?.plans?.[0] || null;
  if (plan && !plan.unavailable && plan.nutritionTarget) {
    return Object.freeze({
      resolved: true,
      reasonCode: null,
      detailReasonCodes: Object.freeze([]),
      userMessage: null,
      allowedActions: Object.freeze([])
    });
  }

  const reasonCode = plan?.unavailableReason || 'PATCH3_OPERATIVE_AUTHORITY_NOT_GRANTED';
  const output = selectedOutput(result, plan);
  const policy = (RESOLUTION_BY_REASON[reasonCode] || unknownAuthority)();
  return Object.freeze({
    resolved: false,
    reasonCode,
    detailReasonCodes: Object.freeze(detailsFor(output, reasonCode)),
    userMessage: policy.userMessage,
    allowedActions: policy.allowedActions
  });
}
