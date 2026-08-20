import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
  import { getAuth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
  import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, limit, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

  // Las credenciales que configuraste en Firebase Console
  const firebaseConfig = {
    apiKey: "AIzaSyASE9zpAiwwYuKeImEBgjaW-RC0CPaTx6I",
    authDomain: "macrobalance-502bb.firebaseapp.com",
    projectId: "macrobalance-502bb",
    storageBucket: "macrobalance-502bb.firebasestorage.app",
    messagingSenderId: "618429309223",
    appId: "1:618429309223:web:2e40a76de8e315b8080902",
    measurementId: "G-11DKCSLVXV"
  };

  // Inicializa la App y la Autenticación
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const googleProvider = new GoogleAuthProvider();
  const facebookProvider = new FacebookAuthProvider();

  // ===== Persistencia en Firestore =====
  // Estructura: users/{uid} (identidad) · users/{uid}/profile/current (valores por defecto,
  // mutables) · users/{uid}/goals_history/{id} (historial de objetivos, inmutable una vez creado)

  async function asegurarUsuarioYPerfil(user){
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    // merge:true -> nunca pisa customPhotoURL ni currentObjectiveId, solo sincroniza
    // los datos que vienen del proveedor (Google/Facebook)
    await setDoc(userRef, {
      displayName: user.displayName || 'Usuario',
      email: user.email || null,
      photoURL: user.photoURL || null,
      ...(userSnap.exists() ? {} : { customPhotoURL: null, currentObjectiveId: null, createdAt: serverTimestamp() })
    }, { merge: true });

    const profileRef = doc(db, 'users', user.uid, 'profile', 'current');
    const profileSnap = await getDoc(profileRef);
    if(!profileSnap.exists()){
      await setDoc(profileRef, {
        sexo: null, peso: null, altura: null, edad: null, grasaPct: null,
        actividadFactor: null, horasSueno: null, aguaTexto: null, nivelEstres: null,
        vaAlGym: false, diasGym: null, updatedAt: serverTimestamp()
      });
    }
  }

  window.guardarSexoFirestore = async function(sexo){
    const user = auth.currentUser;
    if(!user) return;
    try{
      await setDoc(doc(db, 'users', user.uid, 'profile', 'current'), { sexo: sexo, updatedAt: serverTimestamp() }, { merge: true });
    } catch(err){ console.error('Error guardando sexo:', err); }
  };

  window.precargarPerfilFirestore = async function(){
    const user = auth.currentUser;
    if(!user) return;
    try{
      const profileSnap = await getDoc(doc(db, 'users', user.uid, 'profile', 'current'));
      if(!profileSnap.exists()) return;
      const p = profileSnap.data();
      const setVal = (id, val) => { if(val !== null && val !== undefined && document.getElementById(id)) document.getElementById(id).value = val; };
      setVal('peso', p.peso);
      setVal('altura', p.altura);
      setVal('edad', p.edad);
      setVal('grasa', p.grasaPct);
      setVal('sueno', p.horasSueno);
      setVal('agua', p.aguaTexto);
      if(p.actividadFactor !== null && p.actividadFactor !== undefined) document.getElementById('actividad').value = p.actividadFactor;
      if(p.nivelEstres !== null && p.nivelEstres !== undefined) document.getElementById('estres').value = p.nivelEstres;
      if(p.vaAlGym){ setGym(true); if(p.diasGym) document.getElementById('dias-gym').value = p.diasGym; actualizarKcalGym(); }
      document.querySelectorAll('.grid input, .grid select').forEach(marcarCampoLleno);
      actualizarUnidadAgua();
    } catch(err){ console.error('Error precargando perfil:', err); }
  };

  window.mostrarObjetivoActualFirestore = async function(){
    const user = auth.currentUser;
    const badge = document.getElementById('objetivo-actual-badge');
    if(!user || !badge) return;
    try{
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const currentObjectiveId = userSnap.exists() ? userSnap.data().currentObjectiveId : null;
      if(!currentObjectiveId){ badge.textContent = ''; return; }
      const goalSnap = await getDoc(doc(db, 'users', user.uid, 'goals_history', currentObjectiveId));
      if(goalSnap.exists()){
        const g = goalSnap.data();
        badge.textContent = 'Tu objetivo actual: ' + g.result.kcal + ' kcal/día';
      }
    } catch(err){ console.error('Error leyendo objetivo actual:', err); }
  };

  // Guarda el plan elegido como el nuevo objetivo activo:
  // 1) cierra (no borra) el objetivo activo anterior, si existe
  // 2) crea un documento nuevo e inmutable en goals_history
  // 3) actualiza el puntero currentObjectiveId
  // 4) sincroniza el perfil (valores por defecto) con los últimos datos usados
  window.guardarObjetivoFirestore = async function(plan, inputSnapshot, calcVersion){
    const user = auth.currentUser;
    if(!user) throw new Error('No hay usuario autenticado');

    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const anteriorId = userSnap.exists() ? userSnap.data().currentObjectiveId : null;

    if(anteriorId){
      await updateDoc(doc(db, 'users', user.uid, 'goals_history', anteriorId), {
        status: 'completed',
        endDate: serverTimestamp()
      });
    }

    const nuevoRef = await addDoc(collection(db, 'users', user.uid, 'goals_history'), {
      status: 'active',
      goalType: plan.id,
      startDate: serverTimestamp(),
      endDate: null,
      inputSnapshot: inputSnapshot,
      result: {
        kcal: plan.kcal, proteina: plan.proteina, grasa: plan.grasa, carbos: plan.carbos,
        metodo: inputSnapshot.metodo
      },
      calcVersion: calcVersion,
      notes: '',
      createdAt: serverTimestamp()
    });

    await updateDoc(userRef, { currentObjectiveId: nuevoRef.id, updatedAt: serverTimestamp() });

    // Sincroniza el perfil con los últimos datos usados, para que la próxima vez
    // la calculadora arranque prellenada. Esto NO toca el documento recién creado.
    await setDoc(doc(db, 'users', user.uid, 'profile', 'current'), {
      peso: inputSnapshot.peso, altura: inputSnapshot.altura, edad: inputSnapshot.edad,
      sexo: inputSnapshot.sexo, grasaPct: inputSnapshot.grasaPct, actividadFactor: inputSnapshot.actividadFactor,
      horasSueno: inputSnapshot.horasSueno, aguaTexto: inputSnapshot.aguaTexto, nivelEstres: inputSnapshot.nivelEstres,
      vaAlGym: inputSnapshot.vaAlGym, diasGym: inputSnapshot.diasGym, updatedAt: serverTimestamp()
    }, { merge: true });
  };

  // ===== Foto de perfil personalizada (guardada como Base64 en Firestore) =====
  // Prioridad: customPhotoURL (subida por el usuario) > photoURL (de Google/Facebook) > avatar por defecto

  window.guardarFotoPersonalizadaFirestore = async function(base64){
    const user = auth.currentUser;
    if(!user) return;
    try{
      await setDoc(doc(db, 'users', user.uid), { customPhotoURL: base64, updatedAt: serverTimestamp() }, { merge: true });
    } catch(err){ console.error('Error guardando foto personalizada:', err); throw err; }
  };

  window.eliminarFotoPersonalizadaFirestore = async function(){
    const user = auth.currentUser;
    if(!user) return;
    try{
      await setDoc(doc(db, 'users', user.uid), { customPhotoURL: null, updatedAt: serverTimestamp() }, { merge: true });
    } catch(err){ console.error('Error eliminando foto personalizada:', err); throw err; }
  };

  // Devuelve { displayName, photoURL, customPhotoURL, email } del documento raíz del usuario
  window.obtenerDatosUsuarioFirestore = async function(){
    const user = auth.currentUser;
    if(!user) return null;
    try{
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if(!userSnap.exists()) return null;
      return userSnap.data();
    } catch(err){ console.error('Error leyendo datos de usuario:', err); return null; }
  };

  // ===== Editar cuenta =====
  // Guarda nombre (users/{uid}.displayName) y los datos de cálculo (profile/current) en una sola llamada
  window.guardarCuentaFirestore = async function(datosCuenta, datosPerfil){
    const user = auth.currentUser;
    if(!user) return;
    try{
      if(datosCuenta && Object.keys(datosCuenta).length){
        await setDoc(doc(db, 'users', user.uid), { ...datosCuenta, updatedAt: serverTimestamp() }, { merge: true });
      }
      if(datosPerfil && Object.keys(datosPerfil).length){
        await setDoc(doc(db, 'users', user.uid, 'profile', 'current'), { ...datosPerfil, updatedAt: serverTimestamp() }, { merge: true });
      }
    } catch(err){ console.error('Error guardando datos de cuenta:', err); throw err; }
  };

  // ===== Historial de objetivos =====
  // Devuelve un arreglo de objetivos pasados y activos, más reciente primero
  window.obtenerHistorialObjetivosFirestore = async function(){
    const user = auth.currentUser;
    if(!user) return [];
    try{
      const q = query(collection(db, 'users', user.uid, 'goals_history'));
      const snap = await getDocs(q);
      const historial = [];
      snap.forEach(function(d){ historial.push({ id: d.id, ...d.data() }); });
      historial.sort(function(a, b){
        const fa = a.startDate && a.startDate.toMillis ? a.startDate.toMillis() : 0;
        const fb = b.startDate && b.startDate.toMillis ? b.startDate.toMillis() : 0;
        return fb - fa;
      });
      return historial;
    } catch(err){ console.error('Error leyendo historial de objetivos:', err); return []; }
  };

  // Exponemos la función al HTML para que el botón la encuentre
  window.loginConFirebase = function(proveedor) {
    let providerParaUsar;

    if (proveedor === 'Google') {
      providerParaUsar = googleProvider;
    } else if (proveedor === 'Facebook') {
      providerParaUsar = facebookProvider;
    }

    // Se abre la ventana emergente para registrarse/iniciar sesión
    signInWithPopup(auth, providerParaUsar)
      .then(async (result) => {
        // SI ES EXITOSO, se crea/sincroniza el perfil en Firestore y luego se avanza la pantalla
        console.log("Éxito. Usuario ingresado:", result.user.email);
        window.fotoPerfilUsuario = result.user.photoURL || null;
        try{
          await asegurarUsuarioYPerfil(result.user);
        } catch(err){
          console.error('Error creando/sincronizando el usuario en Firestore:', err);
        }
        window.avanzarApp();
      }).catch((error) => {
        // SI CIERRAN LA VENTANA O HAY ERROR, no avanza. Se queda atorado en el modal.
        console.error("Error al iniciar sesión:", error.message);
        if(error.code !== 'auth/popup-closed-by-user'){
            alert("No se pudo iniciar sesión. Motivo: " + error.message);
        }
      });
  };