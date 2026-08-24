(function installLocalSessionFixture() {
  const state = {
    user: { uid: 'e2e-local-user', displayName: 'Prueba local' },
    userData: { displayName: 'Prueba local', currentObjectiveId: 'goal-e2e-v1' },
    profile: { sexo: 'M' },
    currentGoal: {
      id: 'goal-e2e-v1',
      status: 'active',
      goalType: 'mantenimiento',
      result: { kcal: 1800, proteina: 125, carbos: 190, grasa: 60, metodo: 'fixture E2E' }
    },
    authReady: true,
    error: null
  };

  window.macroBalanceState = state;
  window.macroBalanceAuthReady = Promise.resolve(state);
  window.cerrarSesionFirebase = async () => {
    Object.assign(state, {
      user: null,
      userData: null,
      profile: null,
      currentGoal: null
    });
    window.dispatchEvent(new CustomEvent('macrobalance:auth-changed', { detail: state }));
  };
  window.guardarSexoFirestore = async sexo => { state.profile.sexo = sexo; };
  window.obtenerDatosUsuarioFirestore = async () => state.userData;
  window.precargarPerfilFirestore = async () => state.profile;
  window.mostrarObjetivoActualFirestore = async () => state.currentGoal;
  window.obtenerObjetivoActualFirestore = async () => state.currentGoal;
  window.obtenerHistorialObjetivosFirestore = async () => [state.currentGoal];
  window.guardarObjetivoFirestore = async (plan, inputSnapshot, calcVersion) => {
    state.currentGoal = {
      id: 'goal-saved-by-calculator',
      status: 'active',
      goalType: plan.id,
      inputSnapshot,
      calcVersion,
      result: {
        kcal: plan.kcal,
        proteina: plan.proteina,
        carbos: plan.carbos,
        grasa: plan.grasa,
        metodo: inputSnapshot.metodo
      }
    };
    window.__savedGoalFixture = state.currentGoal;
    return state.currentGoal;
  };
  window.addEventListener('DOMContentLoaded', () => {
    window.dispatchEvent(new CustomEvent('macrobalance:auth-changed', { detail: state }));
    window.dispatchEvent(new CustomEvent('macrobalance:firebase-ready', { detail: state }));
  }, { once: true });
})();
