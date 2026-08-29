import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  FacebookAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  OAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  runTransaction,
  query,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// La configuración web de Firebase identifica el proyecto, pero no es una llave
// privada. Las reglas de Auth/Firestore siguen siendo la barrera de seguridad.
const firebaseConfig = {
  apiKey: 'AIzaSyASE9zpAiwwYuKeImEBgjaW-RC0CPaTx6I',
  authDomain: 'macrobalance-502bb.firebaseapp.com',
  projectId: 'macrobalance-502bb',
  storageBucket: 'macrobalance-502bb.firebasestorage.app',
  messagingSenderId: '618429309223',
  appId: '1:618429309223:web:2e40a76de8e315b8080902',
  measurementId: 'G-11DKCSLVXV'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
const microsoftProvider = new OAuthProvider('microsoft.com');
const appleProvider = new OAuthProvider('apple.com');
const githubProvider = new GithubAuthProvider();
const twitterProvider = new TwitterAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });
facebookProvider.addScope('email');
microsoftProvider.setCustomParameters({ prompt: 'select_account' });
githubProvider.addScope('user:email');

const authProviders = {
  Google: googleProvider,
  Facebook: facebookProvider,
  Microsoft: microsoftProvider,
  Apple: appleProvider,
  GitHub: githubProvider,
  X: twitterProvider
};

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(error => {
  console.error('No se pudo activar la persistencia local de Firebase Auth:', error);
  throw error;
});

const state = window.macroBalanceState || {
  user: null,
  userData: null,
  profile: null,
  currentGoal: null,
  authReady: false,
  error: null
};
window.macroBalanceState = state;

let resolveAuthReady;
let authReadyResolved = false;
let authRevision = 0;
window.macroBalanceAuthReady = new Promise(resolve => {
  resolveAuthReady = resolve;
});

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function asegurarUsuarioYPerfil(user) {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  await setDoc(userRef, {
    displayName: user.displayName || 'Usuario',
    email: user.email || null,
    photoURL: user.photoURL || null,
    ...(userSnap.exists() ? {} : {
      customPhotoURL: null,
      currentObjectiveId: null,
      createdAt: serverTimestamp()
    })
  }, { merge: true });

  const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    await setDoc(profileRef, {
      sexo: null,
      peso: null,
      altura: null,
      edad: null,
      grasaPct: null,
      actividadFactor: null,
      horasSueno: null,
      aguaTexto: null,
      nivelEstres: null,
      vaAlGym: false,
      diasGym: null,
      updatedAt: serverTimestamp()
    });
  }
}

async function readSession(user) {
  const userRef = doc(db, 'users', user.uid);
  const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
  const [userSnap, profileSnap] = await Promise.all([getDoc(userRef), getDoc(profileRef)]);
  const userData = userSnap.exists() ? userSnap.data() : null;
  const profile = profileSnap.exists() ? profileSnap.data() : null;
  let currentGoal = null;

  if (userData?.currentObjectiveId) {
    const goalSnap = await getDoc(
      doc(db, 'users', user.uid, 'goals_history', userData.currentObjectiveId)
    );
    if (goalSnap.exists()) currentGoal = { id: goalSnap.id, ...goalSnap.data() };
  }
  return { userData, profile, currentGoal };
}

async function refreshState(user = auth.currentUser) {
  if (!user) {
    Object.assign(state, {
      user: null,
      userData: null,
      profile: null,
      currentGoal: null,
      error: null
    });
    window.datosUsuarioActual = null;
    window.fotoPerfilUsuario = null;
    return state;
  }
  const session = await readSession(user);
  Object.assign(state, { user, ...session, error: null });
  window.datosUsuarioActual = session.userData;
  window.fotoPerfilUsuario = user.photoURL || null;
  return state;
}

window.obtenerEstadoMacroBalance = () => state;
window.refrescarEstadoMacroBalance = async () => {
  await refreshState();
  emit('macrobalance:auth-changed', state);
  return state;
};

window.obtenerObjetivoActualFirestore = async function obtenerObjetivoActualFirestore() {
  if (!auth.currentUser) return null;
  await refreshState(auth.currentUser);
  return state.currentGoal;
};

window.guardarSexoFirestore = async function guardarSexoFirestore(sexo) {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(
    doc(db, 'users', user.uid, 'profile', 'current'),
    { sexo, updatedAt: serverTimestamp() },
    { merge: true }
  );
  state.profile = { ...(state.profile || {}), sexo };
};

window.precargarPerfilFirestore = async function precargarPerfilFirestore() {
  const user = auth.currentUser;
  if (!user) return null;
  const profileSnap = await getDoc(doc(db, 'users', user.uid, 'profile', 'current'));
  if (!profileSnap.exists()) return null;
  const profile = profileSnap.data();
  state.profile = profile;
  const setValue = (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== null && value !== undefined) element.value = value;
  };
  setValue('peso', profile.peso);
  setValue('altura', profile.altura);
  setValue('edad', profile.edad);
  setValue('grasa', profile.grasaPct);
  setValue('bodyfat-method', profile.bodyFatMethod);
  setValue('standard-steps', profile.standardSteps);
  setValue('standard-steps-coverage', profile.standardStepsCoverage);
  setValue('standard-observation-days', profile.standardObservationDays);
  setValue('sueno', profile.horasSueno);
  setValue('agua', profile.aguaTexto);
  setValue('actividad', profile.actividadFactor);
  setValue('estres', profile.nivelEstres);
  if (profile.sexo) setValue('sexo', profile.sexo);
  if (typeof window.setGym === 'function') {
    window.setGym(profile.vaAlGym === true ? true : profile.vaAlGym === null ? null : false);
  }
  if (Number.isFinite(profile.grasaPct) && typeof window.setBodyFatKnown === 'function') {
    window.setBodyFatKnown(true);
  }
  if (profile.vaAlGym === true) {
    if (profile.diasGym) setValue('dias-gym', profile.diasGym);
    setValue('standard-training-type', profile.trainingModality);
    setValue('standard-training-minutes', profile.sessionDurationMin);
    setValue('standard-training-workload', profile.workload);
  }
  if (typeof window.actualizarStepsFollowup === 'function') window.actualizarStepsFollowup();
  document.querySelectorAll('.grid input, .grid select').forEach(element => {
    if (typeof window.marcarCampoLleno === 'function') window.marcarCampoLleno(element);
  });
  if (typeof window.actualizarUnidadAgua === 'function') window.actualizarUnidadAgua();
  return profile;
};

window.mostrarObjetivoActualFirestore = async function mostrarObjetivoActualFirestore() {
  const badge = document.getElementById('objetivo-actual-badge');
  const goal = await window.obtenerObjetivoActualFirestore();
  if (badge) badge.textContent = goal?.result ? `Tu objetivo actual: ${goal.result.kcal} kcal/día` : '';
  return goal;
};

// Conserva exactamente la estructura histórica existente de Firestore.
window.guardarObjetivoFirestore = async function guardarObjetivoFirestore(plan, inputSnapshot, calcVersion, nutritionTarget) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado');
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const previousId = userSnap.exists() ? userSnap.data().currentObjectiveId : null;

  if (previousId) {
    await updateDoc(doc(db, 'users', user.uid, 'goals_history', previousId), {
      status: 'completed',
      endDate: serverTimestamp()
    });
  }

  const goalData = {
    status: 'active',
    goalType: plan.id,
    startDate: serverTimestamp(),
    endDate: null,
    inputSnapshot,
    result: {
      kcal: plan.kcal,
      proteina: plan.proteina,
      grasa: plan.grasa,
      carbos: plan.carbos,
      metodo: inputSnapshot.metodo
    },
    calcVersion,
    calculatorVersion: calcVersion,
    calculationMode: nutritionTarget?.calculationMode || inputSnapshot?.calculationMode || 'standard',
    nutritionTargetVersion: nutritionTarget?.schemaVersion || null,
    nutritionTarget: nutritionTarget || null,
    notes: '',
    createdAt: serverTimestamp()
  };
  const goalRef = await addDoc(collection(db, 'users', user.uid, 'goals_history'), goalData);
  await updateDoc(userRef, { currentObjectiveId: goalRef.id, updatedAt: serverTimestamp() });
  await setDoc(doc(db, 'users', user.uid, 'profile', 'current'), {
    peso: inputSnapshot.peso,
    altura: inputSnapshot.altura,
    edad: inputSnapshot.edad,
    sexo: inputSnapshot.sexo,
    grasaPct: inputSnapshot.grasaPct,
    actividadFactor: inputSnapshot.actividadFactor,
    // The promoted Standard flow intentionally omits legacy recovery fields.
    // Persist explicit nulls so Firestore never receives undefined values.
    horasSueno: inputSnapshot.horasSueno ?? null,
    aguaTexto: inputSnapshot.aguaTexto ?? null,
    nivelEstres: inputSnapshot.nivelEstres ?? null,
    vaAlGym: inputSnapshot.trainingInputState === 'PARTIAL_OR_UNKNOWN_TRAINING'
      ? null
      : inputSnapshot.vaAlGym,
    diasGym: inputSnapshot.diasGym,
    bodyFatMethod: inputSnapshot.bodyFatMethod || null,
    standardSteps: inputSnapshot.patch3Input?.steps ?? null,
    standardStepsCoverage: inputSnapshot.patch3Input?.stepsCoverage ?? null,
    standardObservationDays: inputSnapshot.patch3Input?.stepsObservationDays ?? null,
    trainingModality: inputSnapshot.patch3Input?.trainingModality ?? null,
    sessionDurationMin: inputSnapshot.patch3Input?.sessionDurationMin ?? null,
    workload: inputSnapshot.patch3Input?.workload ?? null,
    updatedAt: serverTimestamp()
  }, { merge: true });

  state.currentGoal = { id: goalRef.id, ...goalData };
  state.userData = { ...(state.userData || {}), currentObjectiveId: goalRef.id };
  emit('macrobalance:goal-changed', state.currentGoal);
  return state.currentGoal;
};

window.guardarFotoPersonalizadaFirestore = async function guardarFoto(base64) {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(doc(db, 'users', user.uid), {
    customPhotoURL: base64,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

window.eliminarFotoPersonalizadaFirestore = async function eliminarFoto() {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(doc(db, 'users', user.uid), {
    customPhotoURL: null,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

window.obtenerDatosUsuarioFirestore = async function obtenerDatosUsuario() {
  if (!auth.currentUser) return null;
  const snapshot = await getDoc(doc(db, 'users', auth.currentUser.uid));
  const data = snapshot.exists() ? snapshot.data() : null;
  state.userData = data;
  return data;
};

window.guardarCuentaFirestore = async function guardarCuenta(datosCuenta, datosPerfil) {
  const user = auth.currentUser;
  if (!user) return;
  if (datosCuenta && Object.keys(datosCuenta).length) {
    await setDoc(
      doc(db, 'users', user.uid),
      { ...datosCuenta, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  if (datosPerfil && Object.keys(datosPerfil).length) {
    await setDoc(
      doc(db, 'users', user.uid, 'profile', 'current'),
      { ...datosPerfil, updatedAt: serverTimestamp() },
      { merge: true }
    );
    state.profile = { ...(state.profile || {}), ...datosPerfil };
  }
};

window.eliminarObjetivoHistorialFirestore = async function eliminarObjetivoHistorial(goalId) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado.');
  if (!goalId) throw new Error('No se recibió un objetivo válido.');
  const userRef = doc(db, 'users', user.uid);
  const goalRef = doc(db, 'users', user.uid, 'goals_history', goalId);
  try {
    await runTransaction(db, async transaction => {
      // Firestore transactions require reads to be completed before writes;
      // keep them sequential so the delete is reliable across SDK/runtime
      // versions while retaining the current-objective guard atomically.
      const userSnapshot = await transaction.get(userRef);
      const goalSnapshot = await transaction.get(goalRef);
      if (!goalSnapshot.exists()) throw new Error('El objetivo ya no existe.');
      const currentId = userSnapshot.exists() ? userSnapshot.data().currentObjectiveId : null;
      if (goalId === currentId) throw new Error('El objetivo actual no se puede eliminar.');
      transaction.delete(goalRef);
    });
  } catch (error) {
    if (error?.code === 'permission-denied') {
      throw new Error('Firestore rechazó el borrado. Verifica que las reglas V2 estén publicadas para permitir al propietario borrar objetivos que no estén activos.');
    }
    throw error;
  }
  return true;
};

window.obtenerHistorialObjetivosFirestore = async function obtenerHistorial() {
  const user = auth.currentUser;
  if (!user) return [];
  const snapshot = await getDocs(query(collection(db, 'users', user.uid, 'goals_history')));
  const history = [];
  snapshot.forEach(item => history.push({ id: item.id, ...item.data() }));
  history.sort((a, b) => {
    const dateA = a.startDate?.toMillis ? a.startDate.toMillis() : 0;
    const dateB = b.startDate?.toMillis ? b.startDate.toMillis() : 0;
    return dateB - dateA;
  });
  return history;
};

function setOAuthUI(status, providerName = null, message = '') {
  document.querySelectorAll('[data-auth-provider]').forEach(button => {
    const isCurrent = button.dataset.authProvider === providerName;
    button.disabled = status === 'working';
    button.classList.toggle('is-loading', status === 'working' && isCurrent);
    button.setAttribute('aria-busy', String(status === 'working' && isCurrent));
  });

  const statusElement = document.getElementById('auth-provider-status');
  if (statusElement) {
    if (status === 'working') statusElement.textContent = `Conectando con ${providerName}…`;
    else if (message) statusElement.textContent = message;
  }

  emit('macrobalance:oauth-status', { status, provider: providerName, message });
}

function waitForAuthUser(user) {
  if (state.authReady && state.user?.uid === user.uid) return Promise.resolve(state);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('macrobalance:auth-changed', handleAuth);
      reject(Object.assign(new Error('Firebase tardó demasiado en confirmar la sesión.'), {
        code: 'auth/state-confirmation-timeout'
      }));
    }, 15000);
    function handleAuth(event) {
      if (event.detail?.user?.uid !== user.uid) return;
      window.clearTimeout(timeout);
      window.removeEventListener('macrobalance:auth-changed', handleAuth);
      resolve(event.detail);
    }
    window.addEventListener('macrobalance:auth-changed', handleAuth);
  });
}

function waitForSignedOut() {
  if (state.authReady && !state.user) return Promise.resolve(state);
  return new Promise(resolve => {
    function handleAuth(event) {
      if (event.detail?.user) return;
      window.removeEventListener('macrobalance:auth-changed', handleAuth);
      resolve(event.detail);
    }
    window.addEventListener('macrobalance:auth-changed', handleAuth);
  });
}

function authErrorMessage(error, providerName) {
  if (error.code === 'auth/operation-not-allowed') {
    return `${providerName} está preparado, pero falta activarlo en Firebase.`;
  }
  if (error.code === 'auth/account-exists-with-different-credential') {
    return 'Esta cuenta ya existe con otro proveedor. Entra primero con el método que utilizaste originalmente.';
  }
  if (error.code === 'auth/network-request-failed') {
    return 'No pudimos conectar con el proveedor. Revisa tu conexión e inténtalo nuevamente.';
  }
  if (error.code === 'auth/unauthorized-domain') {
    return 'Este dominio todavía no está autorizado en Firebase Authentication.';
  }
  return 'No pudimos completar el acceso. Inténtalo nuevamente.';
}

const oauthCoordinator = window.MacroBalanceAuthCoordinator.createOAuthCoordinator({
  providers: authProviders,
  signIn: async provider => {
    await persistenceReady;
    return signInWithPopup(auth, provider);
  },
  waitForAuth: waitForAuthUser,
  onStatus: ({ status, provider }) => setOAuthUI(status, provider),
  onBusy: activeProvider => {
    setOAuthUI('message', null, `Ya estamos conectando con ${activeProvider}.`);
  },
  onCancel: (_error, providerName) => {
    setOAuthUI('message', null, `Acceso con ${providerName} cancelado. Puedes elegir otro método.`);
  },
  onSuccess: () => {
    setOAuthUI('message', null, 'Sesión iniciada correctamente.');
    if (typeof window.avanzarApp === 'function') window.avanzarApp();
  },
  onError: (error, providerName) => {
    console.error(`No se pudo iniciar sesión con ${providerName}:`, error);
    setOAuthUI('message', null, authErrorMessage(error, providerName));
  }
});

window.macroBalanceAuthProviders = Object.freeze(Object.keys(authProviders));
window.loginConFirebase = providerName => oauthCoordinator.login(providerName);

window.cerrarSesionFirebase = async function cerrarSesionFirebase() {
  await persistenceReady;
  await signOut(auth);
  await waitForSignedOut();
};

onAuthStateChanged(auth, async user => {
  const revision = ++authRevision;
  try {
    await persistenceReady;
    if (user) {
      await asegurarUsuarioYPerfil(user);
      if (revision !== authRevision) return;
      await refreshState(user);
    } else {
      await refreshState(null);
    }
    if (revision !== authRevision) return;
  } catch (error) {
    console.error('No se pudo restaurar la sesión de MacroBalance:', error);
    state.error = error.message;
  } finally {
    if (revision !== authRevision) return;
    state.authReady = true;
    if (!authReadyResolved) {
      authReadyResolved = true;
      resolveAuthReady(state);
    }
    emit('macrobalance:auth-changed', state);
    emit('macrobalance:firebase-ready', state);
  }
});
