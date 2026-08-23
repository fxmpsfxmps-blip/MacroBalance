import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  FacebookAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
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
    Object.assign(state, { user: null, userData: null, profile: null, currentGoal: null });
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
  setValue('sueno', profile.horasSueno);
  setValue('agua', profile.aguaTexto);
  setValue('actividad', profile.actividadFactor);
  setValue('estres', profile.nivelEstres);
  if (profile.sexo) setValue('sexo', profile.sexo);
  if (profile.vaAlGym && typeof window.setGym === 'function') {
    window.setGym(true);
    if (profile.diasGym) setValue('dias-gym', profile.diasGym);
    if (typeof window.actualizarKcalGym === 'function') window.actualizarKcalGym();
  }
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
window.guardarObjetivoFirestore = async function guardarObjetivoFirestore(plan, inputSnapshot, calcVersion) {
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
    horasSueno: inputSnapshot.horasSueno,
    aguaTexto: inputSnapshot.aguaTexto,
    nivelEstres: inputSnapshot.nivelEstres,
    vaAlGym: inputSnapshot.vaAlGym,
    diasGym: inputSnapshot.diasGym,
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
  }
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

window.loginConFirebase = async function loginConFirebase(providerName) {
  const provider = providerName === 'Facebook' ? facebookProvider : googleProvider;
  try {
    const result = await signInWithPopup(auth, provider);
    await asegurarUsuarioYPerfil(result.user);
    await refreshState(result.user);
    emit('macrobalance:auth-changed', state);
    if (typeof window.avanzarApp === 'function') window.avanzarApp();
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    if (error.code !== 'auth/popup-closed-by-user') {
      window.alert(`No se pudo iniciar sesión. Motivo: ${error.message}`);
    }
  }
};

window.cerrarSesionFirebase = async function cerrarSesionFirebase() {
  await signOut(auth);
  window.location.assign('/');
};

onAuthStateChanged(auth, async user => {
  try {
    if (user) {
      await asegurarUsuarioYPerfil(user);
      await refreshState(user);
    } else {
      await refreshState(null);
    }
  } catch (error) {
    console.error('No se pudo restaurar la sesión de MacroBalance:', error);
    state.error = error.message;
  } finally {
    state.authReady = true;
    resolveAuthReady(state);
    emit('macrobalance:auth-changed', state);
    emit('macrobalance:firebase-ready', state);
  }
});
