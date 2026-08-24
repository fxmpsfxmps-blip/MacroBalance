(function installLocalSessionFixture() {
  const state = {
    user: { uid: 'e2e-local-user', displayName: 'Prueba local', email: 'prueba@example.com' },
    userData: { displayName: 'Prueba local', email: 'prueba@example.com', currentObjectiveId: 'goal-e2e-v1' },
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
  const previousGoal = {
    id: 'goal-e2e-previous',
    status: 'completed',
    result: { kcal: 1750 },
    startDate: { toDate: () => new Date('2026-08-20T12:00:00Z') }
  };
  let history = [state.currentGoal, previousGoal];
  window.guardarSexoFirestore = async sexo => { state.profile.sexo = sexo; };
  window.guardarCuentaFirestore = async (account, profile) => {
    Object.assign(state.userData, account || {});
    Object.assign(state.profile, profile || {});
  };
  window.obtenerDatosUsuarioFirestore = async () => state.userData;
  window.precargarPerfilFirestore = async () => state.profile;
  window.mostrarObjetivoActualFirestore = async () => state.currentGoal;
  window.obtenerObjetivoActualFirestore = async () => state.currentGoal;
  window.obtenerHistorialObjetivosFirestore = async () => history.slice();
  window.eliminarObjetivoHistorialFirestore = async goalId => {
    if(goalId === state.currentGoal.id) throw new Error('El objetivo actual no se puede eliminar.');
    history = history.filter(goal => goal.id !== goalId);
  };
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
