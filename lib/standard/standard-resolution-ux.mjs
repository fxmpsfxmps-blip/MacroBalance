// Product-presentation contract for an unavailable Standard plan.
// It deliberately consumes authority already emitted by PATCH3; it does not
// modify eligibility, scientific routing, or a NutritionTarget.

export const STANDARD_RESOLUTION_ACTIONS = Object.freeze([
  'COMPLETE_INFORMATION',
  'CHANGE_GOAL',
  'CHANGE_RATE',
  'CALCULATE_MAINTENANCE',
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

function lowBodySizeInformation() {
  return Object.freeze({
    title: 'Antes de calcular',
    userMessage: 'Para continuar necesitamos confirmar si has tenido pérdida de peso no buscada recientemente y si actualmente intentas bajar de peso. No sustituimos estas respuestas automáticamente.',
    allowedActions: Object.freeze(['COMPLETE_INFORMATION'])
  });
}

function lowBodySizeClarification() {
  return Object.freeze({
    title: 'Necesitamos una aclaración',
    userMessage: 'Antes de generar un objetivo automático necesitamos aclarar una de tus respuestas sobre cambios de peso recientes o sobre tu intención actual de bajar de peso.',
    allowedActions: Object.freeze(['COMPLETE_INFORMATION', 'NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

function lowBodySizeProfessionalRoute() {
  return Object.freeze({
    title: 'Revisión profesional recomendada',
    userMessage: 'Con la información indicada no generamos un objetivo automático. Te recomendamos revisar este contexto con un profesional antes de continuar.',
    allowedActions: Object.freeze(['ADVANCED_HANDOFF', 'NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

function lowBodySizeDeficitRoute() {
  return Object.freeze({
    title: 'Objetivo de déficit no automático',
    userMessage: 'Por el contexto de tamaño corporal bajo, Standard no genera un déficit automático. Puedes mantener el objetivo actual temporalmente o solicitar una revisión profesional.',
    allowedActions: Object.freeze(['CALCULATE_MAINTENANCE', 'ADVANCED_HANDOFF', 'NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

function unknownAuthority() {
  return Object.freeze({
    userMessage: 'No podemos generar un objetivo automático con la información disponible. No modificamos ni sustituimos los datos faltantes de forma automática.',
    allowedActions: Object.freeze(['NO_SAFE_AUTOMATIC_RECOVERY'])
  });
}

function muscleGainMissingInformation() {
  return Object.freeze({
    title: 'Necesitamos más información',
    userMessage: 'Para orientar el objetivo a ganancia muscular necesitamos saber si actualmente realizas entrenamiento de fuerza.',
    allowedActions: Object.freeze(['COMPLETE_INFORMATION'])
  });
}

function muscleGainNotConfirmed(muscleGain) {
  if (muscleGain?.trainingInputState === 'PLANNED_FUTURE_NOT_REALIZED') {
    return Object.freeze({
      title: 'Objetivo registrado',
      userMessage: 'Tu objetivo es ganar masa muscular. Como todavía no has comenzado el entrenamiento de fuerza, podemos calcular mantenimiento por ahora y actualizar el objetivo cuando empieces.',
      allowedActions: Object.freeze(['CALCULATE_MAINTENANCE', 'CHANGE_GOAL', 'PROVIDE_REALIZED_TRAINING'])
    });
  }
  return Object.freeze({
    title: 'Tu objetivo necesita entrenamiento de fuerza',
    userMessage: 'Podemos ayudarte a orientar tu alimentación hacia ganancia muscular cuando el entrenamiento de fuerza forme parte de tu rutina actual.',
    allowedActions: Object.freeze(['DECLARE_PLANNED_TRAINING', 'CALCULATE_MAINTENANCE', 'CHANGE_GOAL'])
  });
}

const RESOLUTION_BY_REASON = Object.freeze({
  UNRESOLVED_MISSING_INFORMATION: unresolvedInformation,
  ROUTED_TARGET_NOT_IDENTIFIED: performanceRoute,
  UNRESOLVED_PHYSIOLOGY: physiologyReview,
  LOW_BODY_SIZE_PREFLIGHT_INFORMATION_MISSING: lowBodySizeInformation,
  LOW_BODY_SIZE_UNINTENTIONAL_WEIGHT_CHANGE_NOT_SURE: lowBodySizeClarification,
  LOW_BODY_SIZE_CURRENT_WEIGHT_LOSS_INTENT_NOT_SURE: lowBodySizeClarification,
  LOW_BODY_SIZE_PREFLIGHT_UNRESOLVED_AFTER_FOLLOW_UP: lowBodySizeProfessionalRoute,
  LOW_BODY_SIZE_UNINTENTIONAL_WEIGHT_CHANGE_REPORTED: lowBodySizeProfessionalRoute,
  LOW_BODY_SIZE_CURRENT_WEIGHT_LOSS_INTENT_REPORTED: lowBodySizeProfessionalRoute,
  LOW_BODY_SIZE_STANDARD_DEFICIT_PROFESSIONAL_ROUTE: lowBodySizeDeficitRoute
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
  const muscleGain = result?.muscleGain || plan?.muscleGain || output?.targetContract?.muscleGain || null;
  const policy = reasonCode === 'MUSCLE_GAIN_MISSING_TRAINING_INFORMATION'
    ? muscleGainMissingInformation()
    : reasonCode === 'MUSCLE_GAIN_TARGET_NOT_CONFIRMED'
      ? muscleGainNotConfirmed(muscleGain)
      : (RESOLUTION_BY_REASON[reasonCode] || unknownAuthority)();
  return Object.freeze({
    resolved: false,
    reasonCode,
    detailReasonCodes: Object.freeze(detailsFor(output, reasonCode)),
    title: policy.title || null,
    userMessage: policy.userMessage,
    allowedActions: policy.allowedActions
  });
}
