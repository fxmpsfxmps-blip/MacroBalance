let planes = [];
let activo = 1;
let objetivoPreferidoIdx = 1;
let vaAlGym = false;
let ultimoContexto = null;
let ultimoInputSnapshot = null;
let calculationMode = 'standard';
const STANDARD_CALC_VERSION = 'v1-2026-08';
const STANDARD_PROMOTION_ENABLED = true;

function setCalculationMode(mode){
  calculationMode = mode === 'precision' ? 'precision' : 'standard';
  const app = document.getElementById('app');
  if(app) app.dataset.calculationMode = calculationMode;
  document.getElementById('mode-standard')?.setAttribute('aria-pressed', String(calculationMode === 'standard'));
  document.getElementById('mode-precision')?.setAttribute('aria-pressed', String(calculationMode === 'precision'));
  const precisionFields = document.getElementById('precision-fields');
  if(precisionFields) precisionFields.setAttribute('aria-hidden', String(calculationMode !== 'precision'));
  const title = document.getElementById('calculator-title');
  if(title) title.textContent = calculationMode === 'precision' ? 'Calculadora de precisión' : 'Calculadora estándar';
  document.getElementById('resultado-section')?.style.setProperty('display', 'none');
  document.getElementById('error').style.display = 'none';
}

function setCalculationModeFromKeyboard(event, mode){
  if(event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  setCalculationMode(mode);
}

function setGym(valor){
  vaAlGym = valor;
  document.getElementById('gym-si').classList.toggle('selected', valor === true);
  document.getElementById('gym-no').classList.toggle('selected', valor === false);
  document.getElementById('gym-unknown')?.classList.toggle('selected', valor === null);
  document.getElementById('gym-si').setAttribute('aria-pressed', String(valor === true));
  document.getElementById('gym-no').setAttribute('aria-pressed', String(valor === false));
  document.getElementById('gym-unknown')?.setAttribute('aria-pressed', String(valor === null));
  document.getElementById('dias-gym-wrap').style.display = valor ? 'block' : 'none';
  ['standard-training-type-wrap', 'standard-training-duration-wrap', 'standard-training-workload-wrap']
    .forEach(function(id){ const element = document.getElementById(id); if(element) element.style.display = valor === true ? 'block' : 'none'; });
  const days = document.getElementById('dias-gym');
  const trainingType = document.getElementById('standard-training-type');
  const trainingMinutes = document.getElementById('standard-training-minutes');
  const trainingWorkload = document.getElementById('standard-training-workload');
  if(valor !== true){
    if(days) days.value = '';
    if(trainingType) trainingType.value = '';
    if(trainingMinutes) trainingMinutes.value = '';
    if(trainingWorkload) trainingWorkload.value = '';
  }
  const precisionType = document.getElementById('precision-training-type');
  if(precisionType && calculationMode === 'precision'){
    if(valor && precisionType.value === 'none') precisionType.value = 'strength';
    if(!valor) precisionType.value = 'none';
  }
}

// Muestra el sufijo L o ml en vivo, según la misma regla que usa el cálculo real
function actualizarUnidadAgua(){
  const input = document.getElementById('agua');
  const span = document.getElementById('agua-unidad');
  if(!input || !span) return;
  const texto = input.value.trim();
  if(texto === ''){ span.textContent = ''; return; }
  const limpio = texto.toLowerCase().replace(',', '.');
  const numero = parseFloat(limpio.replace(/[^0-9.]/g, ''));
  if(isNaN(numero)){ span.textContent = ''; return; }
  if(limpio.includes('ml')){ span.textContent = 'ml'; return; }
  if(limpio.includes('l')){ span.textContent = 'L'; return; }
  if(numero % 1 !== 0 || numero < 10){ span.textContent = 'L'; }
  else { span.textContent = 'ml'; }
}

function esMobile(){
  return window.innerWidth <= 760;
}

// ===== Foto de perfil: compresión a Base64 y resolución de prioridad =====

// Redimensiona y comprime una imagen en el navegador antes de guardarla en Firestore.
// Devuelve una promesa que resuelve con un string "data:image/jpeg;base64,..."
function comprimirImagenABase64(file, maxLado, calidad){
  maxLado = maxLado || 200;
  calidad = calidad || 0.6;
  return new Promise(function(resolve, reject){
    if(!file || !file.type.startsWith('image/')){
      reject(new Error('El archivo debe ser una imagen'));
      return;
    }
    const lector = new FileReader();
    lector.onerror = function(){ reject(new Error('No se pudo leer el archivo')); };
    lector.onload = function(e){
      const img = new Image();
      img.onerror = function(){ reject(new Error('No se pudo procesar la imagen')); };
      img.onload = function(){
        let ancho = img.width;
        let alto = img.height;
        if(ancho > alto){
          if(ancho > maxLado){ alto = Math.round(alto * (maxLado / ancho)); ancho = maxLado; }
        } else {
          if(alto > maxLado){ ancho = Math.round(ancho * (maxLado / alto)); alto = maxLado; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, ancho, alto);
        const base64 = canvas.toDataURL('image/jpeg', calidad);
        // Firestore soporta hasta 1MB por documento; una foto de perfil comprimida así
        // normalmente pesa 15-40KB, muy por debajo del límite.
        if(base64.length > 700000){
          reject(new Error('La imagen sigue siendo muy pesada, prueba con otra'));
          return;
        }
        resolve(base64);
      };
      img.src = e.target.result;
    };
    lector.readAsDataURL(file);
  });
}

// Prioridad: foto personalizada (subida por el usuario) > foto de Google/Facebook > avatar por defecto
function resolverFotoPerfil(datosUsuario, avatarPorDefecto){
  if(!datosUsuario) return avatarPorDefecto;
  return datosUsuario.customPhotoURL || datosUsuario.photoURL || avatarPorDefecto;
}

function rutaGate(sexo){
  if(sexo === 'M'){
    return esMobile() ? 'media/mujer-v.jpg' : 'media/mujer-h.jpg';
  }
  return esMobile() ? 'media/hombre-v.jpg' : 'media/hombre-h.jpg';
}

function cargarFotosGate(){
  document.getElementById('foto-mujer').src = rutaGate('M');
  document.getElementById('foto-hombre').src = rutaGate('H');
}
cargarFotosGate();
window.addEventListener('resize', cargarFotosGate);

function marcarCampoLleno(input){
  const tieneValor = input.value.toString().trim() !== '';
  input.classList.toggle('lleno', tieneValor);
}
document.querySelectorAll('.grid input').forEach(function(campo){
  marcarCampoLleno(campo);
  campo.addEventListener('input', function(){
    marcarCampoLleno(campo);
    if(campo.id === 'standard-steps') actualizarStepsFollowup();
  });
});
document.querySelectorAll('.grid select').forEach(function(campo){
  marcarCampoLleno(campo);
  campo.addEventListener('change', function(){ marcarCampoLleno(campo); });
});
document.getElementById('bodyfat-yes')?.addEventListener('click', function(){ setBodyFatKnown(true); });
document.getElementById('bodyfat-no')?.addEventListener('click', function(){ setBodyFatKnown(false); });
document.getElementById('standard-steps')?.addEventListener('input', actualizarStepsFollowup);
document.getElementById('objetivoPreferido')?.addEventListener('change', actualizarVisibilidadRitmo);
setBodyFatKnown(false);
actualizarStepsFollowup();
actualizarVisibilidadRitmo();
actualizarUnidadAgua();

function esRutaMacros(){
  return window.location.hash === '#macros' ||
    window.location.pathname.replace(/\/$/, '') === '/macros';
}

let authModalReturnFocus = null;

function mostrarModalAuth(){
  const modal = document.getElementById('modal-overlay');
  if(!modal) return;
  if(modal.classList.contains('hidden')){
    const activeElement = document.activeElement;
    authModalReturnFocus = activeElement instanceof HTMLElement ? activeElement : document.getElementById('hero-cta');
  }
  modal.classList.remove('hidden');
  window.requestAnimationFrame(function(){
    document.getElementById('auth-modal-close')?.focus();
  });
}

function cerrarModalAuth(restaurarFoco){
  const modal = document.getElementById('modal-overlay');
  if(modal) modal.classList.add('hidden');
  if(restaurarFoco && authModalReturnFocus && document.contains(authModalReturnFocus)){
    authModalReturnFocus.focus();
  }
  authModalReturnFocus = null;
}

async function abrirModal(){
  const cta = document.getElementById('hero-cta');
  if(cta) cta.disabled = true;
  try{
    if(window.macroBalanceAuthReady) await window.macroBalanceAuthReady;
  }finally{
    if(cta) cta.disabled = false;
  }

  if(window.macroBalanceState?.user){
    cerrarModalAuth();
    mostrarCalculadoraAutenticada();
    return;
  }
  mostrarModalAuth();
}

document.addEventListener('keydown', function(event){
  const modal = document.getElementById('modal-overlay');
  if(!modal || modal.classList.contains('hidden')) return;
  if(event.key === 'Escape'){
    event.preventDefault();
    cerrarModalAuth(true);
    return;
  }
  if(event.key !== 'Tab') return;
  const focusable = Array.from(modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(function(element){ return element.getClientRects().length > 0; });
  if(!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if(event.shiftKey && document.activeElement === first){
    event.preventDefault();
    last.focus();
  } else if(!event.shiftKey && document.activeElement === last){
    event.preventDefault();
    first.focus();
  }
});

document.getElementById('modal-overlay')?.addEventListener('click', function(event){
  if(event.target === event.currentTarget) cerrarModalAuth(true);
});

function mostrarEstadoAnonimo(){
  cerrarModalAuth();
  document.getElementById('app').style.display = 'none';
  document.getElementById('gate').style.display = 'none';
  document.getElementById('loading').style.display = 'none';
  const landing = document.getElementById('landing');
  landing.style.display = 'flex';
  landing.classList.remove('hidden', 'leaving');
  document.getElementById('modal-cuenta')?.classList.add('hidden');
  document.getElementById('modal-historial')?.classList.add('hidden');
}

function mostrarGate(){
  document.getElementById('modal-overlay').classList.add('hidden');
  const landing = document.getElementById('landing');
  landing.style.display = 'none';
  const gate = document.getElementById('gate');
  gate.style.display = '';
  gate.classList.remove('hidden', 'leaving');
}

async function prepararAvatar(sexo){
  const rutaAvatarRespaldo = sexo === 'M' ? 'media/mujer-v.jpg' : 'media/hombre-v.jpg';
  const avatarImg = document.getElementById('avatar-img');
  avatarImg.onerror = function(){ avatarImg.onerror = null; avatarImg.src = rutaAvatarRespaldo; };
  const datosUsuario = window.obtenerDatosUsuarioFirestore
    ? await window.obtenerDatosUsuarioFirestore()
    : null;
  window.datosUsuarioActual = datosUsuario;
  avatarImg.src = resolverFotoPerfil(datosUsuario, rutaAvatarRespaldo);
  const profileName = document.getElementById('calculator-user-name');
  if(profileName){
    profileName.textContent = datosUsuario?.displayName ||
      window.macroBalanceState?.user?.displayName ||
      'Tu perfil';
  }
  window.rutaAvatarRespaldoActual = rutaAvatarRespaldo;
}

async function mostrarAppCalculadora(sexo){
  document.getElementById('sexo').value = sexo;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('gate').style.display = 'none';
  const loading = document.getElementById('loading');
  document.getElementById('loading-photo').src = rutaGate(sexo);
  loading.style.display = 'flex';
  loading.classList.remove('hidden');

  try{
    await prepararAvatar(sexo);
    if(window.precargarPerfilFirestore) await window.precargarPerfilFirestore();
    if(window.mostrarObjetivoActualFirestore) await window.mostrarObjetivoActualFirestore();
  } catch(error) {
    console.error('No se pudieron restaurar todos los datos del perfil:', error);
  } finally {
    loading.style.display = 'none';
    document.getElementById('app').style.display = 'flex';
  }
}

async function mostrarCalculadoraAutenticada(){
  if(document.getElementById('app').style.display === 'flex' ||
     document.getElementById('loading').style.display === 'flex') return;
  const state = window.macroBalanceState;
  if(!state?.user){
    if(state?.authReady) mostrarModalAuth();
    return;
  }
  cerrarModalAuth();
  history.replaceState(null, '', '#macros');
  const sexo = state.profile?.sexo;
  if(sexo === 'M' || sexo === 'H') await mostrarAppCalculadora(sexo);
  else mostrarGate();
}

// Sólo se activa cuando Firebase confirma el inicio de sesión.
window.avanzarApp = function(){
  mostrarCalculadoraAutenticada();
};

async function elegir(sexo){
  document.getElementById('sexo').value = sexo;

  document.getElementById('foto-mujer').classList.toggle('active', sexo === 'M');
  document.getElementById('foto-hombre').classList.toggle('active', sexo === 'H');
  const gate = document.getElementById('gate');
  gate.style.display = 'none';
  if(window.guardarSexoFirestore) await window.guardarSexoFirestore(sexo);
  await mostrarAppCalculadora(sexo);
}

// ===== Modal "Editar cuenta" =====

async function abrirModalCuenta(){
  if(document.getElementById('app').style.display !== 'flex'){
    await mostrarCalculadoraAutenticada();
  }
  if(document.getElementById('app').style.display !== 'flex') return;
  const modal = document.getElementById('modal-cuenta');
  if(!modal) return;
  modal.classList.remove('hidden');
  const u = window.datosUsuarioActual || {};
  const nombreInput = document.getElementById('cuenta-nombre');
  const emailInput = document.getElementById('cuenta-email');
  const sexoInput = document.getElementById('cuenta-sexo');
  if(nombreInput) nombreInput.value = u.displayName || '';
  if(emailInput) emailInput.value = u.email || '';
  if(sexoInput) sexoInput.value = window.macroBalanceState?.profile?.sexo || document.getElementById('sexo').value || 'M';
  const avatarPreview = document.getElementById('cuenta-avatar-preview');
  if(avatarPreview) avatarPreview.src = document.getElementById('avatar-img').src;
  const btnEliminarFoto = document.getElementById('cuenta-eliminar-foto');
  if(btnEliminarFoto) btnEliminarFoto.style.display = u.customPhotoURL ? 'inline-block' : 'none';
}

function cerrarModalCuenta(){
  const modal = document.getElementById('modal-cuenta');
  if(modal) modal.classList.add('hidden');
}

async function seleccionarNuevaFoto(inputEl){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return;
  const estadoFoto = document.getElementById('cuenta-foto-estado');
  try{
    if(estadoFoto) estadoFoto.textContent = 'Procesando imagen...';
    const base64 = await comprimirImagenABase64(file, 200, 0.6);
    document.getElementById('cuenta-avatar-preview').src = base64;
    window.nuevaFotoBase64Pendiente = base64;
    if(estadoFoto) estadoFoto.textContent = 'Lista para guardar.';
    document.getElementById('cuenta-eliminar-foto').style.display = 'inline-block';
  } catch(err){
    console.error(err);
    if(estadoFoto) estadoFoto.textContent = 'No se pudo procesar esa imagen, prueba con otra.';
  }
}

function marcarEliminarFotoPendiente(){
  window.nuevaFotoBase64Pendiente = null;
  window.eliminarFotoPendiente = true;
  const rutaRespaldo = window.rutaAvatarRespaldoActual || 'media/mujer-v.jpg';
  document.getElementById('cuenta-avatar-preview').src = rutaRespaldo;
  document.getElementById('cuenta-eliminar-foto').style.display = 'none';
  const estadoFoto = document.getElementById('cuenta-foto-estado');
  if(estadoFoto) estadoFoto.textContent = 'Se eliminará tu foto personalizada al guardar.';
}

async function guardarCuenta(){
  const estadoGuardado = document.getElementById('cuenta-estado-guardado');
  if(estadoGuardado) estadoGuardado.textContent = 'Guardando...';
  try{
    const nombre = document.getElementById('cuenta-nombre').value.trim();
    const sexo = document.getElementById('cuenta-sexo').value;
    if(window.guardarCuentaFirestore) await window.guardarCuentaFirestore({ displayName: nombre }, { sexo: sexo });

    if(window.nuevaFotoBase64Pendiente){
      await window.guardarFotoPersonalizadaFirestore(window.nuevaFotoBase64Pendiente);
    } else if(window.eliminarFotoPendiente){
      await window.eliminarFotoPersonalizadaFirestore();
    }
    window.nuevaFotoBase64Pendiente = null;
    window.eliminarFotoPendiente = false;

    // Refresca el avatar y los datos en memoria
    if(window.obtenerDatosUsuarioFirestore) window.datosUsuarioActual = await window.obtenerDatosUsuarioFirestore();
    document.getElementById('sexo').value = sexo;
    await prepararAvatar(sexo);

    if(estadoGuardado) estadoGuardado.textContent = 'Guardado.';
    setTimeout(cerrarModalCuenta, 700);
  } catch(err){
    console.error(err);
    if(estadoGuardado) estadoGuardado.textContent = 'Ocurrió un error al guardar, intenta de nuevo.';
  }
}

// ===== Historial de objetivos =====

async function abrirModalHistorial(){
  const modal = document.getElementById('modal-historial');
  if(!modal || !window.obtenerHistorialObjetivosFirestore) return;
  modal.classList.remove('hidden');
  const lista = document.getElementById('historial-lista');
  const estadoHistorial = document.getElementById('historial-estado');
  if(estadoHistorial) estadoHistorial.textContent = '';
  lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';
  const historial = await window.obtenerHistorialObjetivosFirestore();
  if(!historial.length){
    lista.innerHTML = '<div class="historial-vacio">Todavía no tienes objetivos guardados.</div>';
    return;
  }
  lista.innerHTML = historial.map(function(item){
    const fecha = item.startDate && item.startDate.toDate ? item.startDate.toDate().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const kcal = item.result ? item.result.kcal : '';
    const currentId = window.macroBalanceState?.currentGoal?.id || window.macroBalanceState?.userData?.currentObjectiveId;
    const esActual = item.id === currentId;
    const modo = item.calculationMode === 'precision' || item.nutritionTarget?.calculationMode === 'precision'
      ? 'Precisión'
      : 'Estándar';
    const estado = esActual
      ? '<span class="historial-activo">Objetivo actual</span>'
      : '<button type="button" class="historial-eliminar" data-goal-id="' + encodeURIComponent(item.id) + '" onclick="eliminarObjetivoHistorial(this)" aria-label="Eliminar objetivo de ' + kcal + ' kilocalorías"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button>';
    return '<div class="historial-item">' +
      '<div class="historial-kcal">' + kcal + ' kcal</div>' +
      '<div class="historial-fecha">' + fecha + ' · ' + modo + '</div>' +
      estado +
    '</div>';
  }).join('');
}

async function eliminarObjetivoHistorial(button){
  const goalId = decodeURIComponent(button.dataset.goalId || '');
  if(!goalId || !window.eliminarObjetivoHistorialFirestore) return;
  if(!window.confirm('¿Eliminar este objetivo del historial? Esta acción no se puede deshacer.')) return;
  const estado = document.getElementById('historial-estado');
  button.disabled = true;
  if(estado) estado.textContent = 'Eliminando objetivo…';
  try{
    await window.eliminarObjetivoHistorialFirestore(goalId);
    await abrirModalHistorial();
    const estadoActualizado = document.getElementById('historial-estado');
    if(estadoActualizado) estadoActualizado.textContent = 'Objetivo eliminado.';
  }catch(error){
    console.error('No se pudo eliminar el objetivo:', error);
    button.disabled = false;
    if(estado) estado.textContent = error.message || 'No se pudo eliminar el objetivo.';
  }
}

function cerrarModalHistorial(){
  const modal = document.getElementById('modal-historial');
  if(modal) modal.classList.add('hidden');
}

function interpretarAgua(texto){
  if(!texto) return 0;
  texto = texto.toString().trim().toLowerCase().replace(',', '.');
  const esMl = texto.includes('ml');
  const esL = texto.includes('l') && !esMl;
  const numero = parseFloat(texto.replace(/[^0-9.]/g, ''));
  if(isNaN(numero)) return 0;

  if(esMl) return numero / 1000;
  if(esL) return numero;

  if(numero % 1 !== 0) return numero;
  if(numero >= 10) return numero / 1000;
  return numero;
}

function calcularPrecision(datos){
  const core = window.MacroBalanceCalculator;
  if(!core){
    datos.errorBox.textContent = 'No se pudo cargar la Calculadora de Precisión. Recarga la página e intenta de nuevo.';
    datos.errorBox.style.display = 'block';
    return;
  }
  if(datos.edad < 18 || datos.edad > 100){
    datos.errorBox.textContent = 'La Calculadora de Precisión admite personas adultas de 18 a 100 años.';
    datos.errorBox.style.display = 'block';
    return;
  }

  const nivelEstres = parseInt(document.getElementById('estres')?.value, 10) || null;
  const diasEntrenamiento = datos.vaAlGym ? parseInt(document.getElementById('dias-gym').value, 10) || 0 : 0;
  const trainingType = datos.vaAlGym ? document.getElementById('precision-training-type').value : 'none';
  const stepsValue = parseFloat(document.getElementById('precision-steps').value);
  const precisionInput = {
    weightKg: datos.peso,
    heightCm: datos.altura,
    age: datos.edad,
    sex: datos.sexo,
    bodyFatPct: Number.isFinite(datos.grasaPct) ? datos.grasaPct : null,
    activityFactor: datos.factorNeat,
    stepsPerDay: Number.isFinite(stepsValue) && stepsValue > 0 ? stepsValue : null,
    sleepHours: Number.isFinite(datos.horasSueno) ? datos.horasSueno : null,
    stressLevel: nivelEstres,
    trainingType: trainingType,
    trainingIntensity: document.getElementById('precision-training-intensity').value,
    trainingDays: diasEntrenamiento,
    trainingMinutes: parseFloat(document.getElementById('precision-training-minutes').value) || 0,
    cardioType: document.getElementById('precision-cardio-type').value,
    cardioDays: parseFloat(document.getElementById('precision-cardio-days').value) || 0,
    cardioMinutes: parseFloat(document.getElementById('precision-cardio-minutes').value) || 0,
    changeRate: document.getElementById('precision-rate').value
  };

  let resultado;
  try{
    resultado = core.calculatePrecisionTargets(precisionInput);
  }catch(error){
    datos.errorBox.textContent = error.message || 'No fue posible completar el cálculo de precisión.';
    datos.errorBox.style.display = 'block';
    return;
  }

  planes = resultado.plans;
  const metodo = resultado.bmr.method + ' + actividad y ejercicio neto por MET';
  const metaAgua = datos.peso * 0.035;
  const consumoActual = interpretarAgua(datos.aguaTexto);
  const faltanteAgua = metaAgua - consumoActual;
  ultimoInputSnapshot = {
    peso: datos.peso,
    altura: datos.altura,
    edad: datos.edad,
    sexo: datos.sexo,
    grasaPct: Number.isFinite(datos.grasaPct) ? datos.grasaPct : null,
    actividadFactor: datos.factorNeat,
    horasSueno: Number.isFinite(datos.horasSueno) ? datos.horasSueno : null,
    aguaTexto: datos.aguaTexto || null,
    nivelEstres: nivelEstres,
    vaAlGym: datos.vaAlGym,
    diasGym: datos.vaAlGym ? diasEntrenamiento : null,
    metodo: metodo,
    calculationMode: 'precision',
    calculatorVersion: resultado.calculatorVersion,
    precision: precisionInput
  };

  const recuperacion = resultado.diagnostics.recovery;
  const cardioActivo = precisionInput.cardioType !== 'none' && precisionInput.cardioDays > 0;
  activo = objetivoPreferidoIdx;
  document.getElementById('guardar-status').textContent = '';
  const resultSection = datos.resultadoSection || datos.carruselSection;
  if(resultSection) resultSection.style.display = 'block';
  renderResultado({
    metodo: metodo,
    tagSueno: recuperacion.constrained ? 'Revisar recuperación' : 'Sin restricción',
    tipSueno: recuperacion.reason ? '<b>Recuperación:</b> ' + recuperacion.reason : '',
    metaAgua: metaAgua.toFixed(1),
    consumoActual: consumoActual,
    faltanteAgua: faltanteAgua,
    horasSueno: datos.horasSueno,
    vaAlGym: datos.vaAlGym,
    diasGym: diasEntrenamiento,
    tipGym: datos.vaAlGym
      ? 'Entrenamiento: ' + trainingType + ', ' + diasEntrenamiento + ' día(s)/semana, ' + precisionInput.trainingMinutes + ' min por sesión. El cálculo usa gasto neto por MET para evitar contar dos veces el reposo.'
      : 'No se añadió entrenamiento estructurado.',
    nivelEstres: nivelEstres,
    tagEstres: nivelEstres ? nivelEstres + '/5' : 'Sin datos',
    tipEstres: cardioActivo
      ? 'Cardio adicional: ' + precisionInput.cardioType + ', ' + precisionInput.cardioDays + ' día(s)/semana, ' + precisionInput.cardioMinutes + ' min por sesión.'
      : 'No se añadió cardio adicional.',
    precisionDiagnostics: resultado.diagnostics
  });
  resultSection?.scrollIntoView({behavior:'smooth', block:'start'});
}

function mostrarErrorCalculadora(mensaje){
  const errorBox = document.getElementById('error');
  if(errorBox){ errorBox.textContent = mensaje; errorBox.style.display = 'block'; }
}

function standardOccupation(value){
  return ({
    '1.2': 'SEATED',
    '1.35': 'STANDING_WALKING',
    '1.5': 'PHYSICAL'
  })[String(value)] || null;
}

function standardGoal(value){
  return ({ '0': 'LOSS', '1': 'MAINTENANCE', '2': 'GAIN' })[String(value)] || null;
}

function actualizarVisibilidadRitmo(){
  const goal = standardGoal(document.getElementById('objetivoPreferido')?.value);
  const wrap = document.getElementById('standard-rate-wrap');
  const rate = document.getElementById('standard-rate');
  const visible = goal === 'LOSS' || goal === 'GAIN';
  if(wrap) wrap.style.display = visible ? 'block' : 'none';
  if(!visible && rate) rate.value = '';
}

function setBodyFatKnown(known){
  const yes = known === true;
  document.getElementById('bodyfat-yes')?.classList.toggle('selected', yes);
  document.getElementById('bodyfat-no')?.classList.toggle('selected', !yes);
  document.getElementById('bodyfat-yes')?.setAttribute('aria-pressed', String(yes));
  document.getElementById('bodyfat-no')?.setAttribute('aria-pressed', String(!yes));
  const details = document.getElementById('bodyfat-details');
  if(details) details.style.display = yes ? 'grid' : 'none';
  if(!yes){
    const value = document.getElementById('grasa');
    const method = document.getElementById('bodyfat-method');
    if(value) value.value = '';
    if(method) method.value = '';
  }
}

function actualizarStepsFollowup(){
  const input = document.getElementById('standard-steps');
  const hasSteps = input && input.value.trim() !== '';
  const followup = document.getElementById('standard-steps-followup');
  if(followup) followup.style.display = hasSteps ? 'grid' : 'none';
  if(!hasSteps){
    const coverage = document.getElementById('standard-steps-coverage');
    const days = document.getElementById('standard-observation-days');
    if(coverage) coverage.value = '';
    if(days) days.value = '';
  }
}

async function readPatch3StandardProfile(datos, adapter){
  const goal = standardGoal(document.getElementById('objetivoPreferido')?.value);
  const occupation = standardOccupation(document.getElementById('actividad')?.value);
  const steps = parseFloat(document.getElementById('standard-steps')?.value);
  const stepsCoverage = parseFloat(document.getElementById('standard-steps-coverage')?.value);
  const stepsObservationDays = parseInt(document.getElementById('standard-observation-days')?.value, 10);
  const trainingType = document.getElementById('standard-training-type')?.value || null;
  const trainingWorkload = document.getElementById('standard-training-workload')?.value || null;
  const trainingMinutes = parseFloat(document.getElementById('standard-training-minutes')?.value);
  const trainingDays = parseInt(document.getElementById('dias-gym')?.value, 10);
  const requestedRateLabel = document.getElementById('standard-rate')?.value || null;

  const hasSteps = Number.isFinite(steps) && steps >= 0;

  let training;
  if(vaAlGym === false){
    training = { trainingStatus: 'REALIZED_HABITUAL', trainingModality: 'NONE', sessionsPerWeek: 0, sessionDurationMin: 0, workload: 'LOW' };
  } else if(vaAlGym === null){
    training = { trainingStatus: 'UNKNOWN', trainingModality: null, sessionsPerWeek: null, sessionDurationMin: null, workload: null };
  } else {
    training = { trainingStatus: 'REALIZED_HABITUAL', trainingModality: trainingType,
      sessionsPerWeek: trainingDays, sessionDurationMin: trainingMinutes, workload: trainingWorkload };
  }

  if(!adapter?.validateIntake) throw new Error('No se pudo cargar la validación de la Calculadora estándar. Recarga la página e intenta de nuevo.');
  const preflight = await adapter.validateIntake({
    goal,
    occupation,
    steps: hasSteps ? steps : null,
    stepsCoverage: hasSteps ? stepsCoverage : null,
    stepsObservationDays: hasSteps ? stepsObservationDays : null,
    training,
    trainingSelection: vaAlGym === true ? 'YES' : vaAlGym === false ? 'NO' : 'UNKNOWN'
  });
  if(!preflight.valid) throw new Error(preflight.issues[0].message);

  return {
    profileId: 'ACTIVE_STANDARD_PROFILE',
    sex: datos.sexo === 'H' ? 'MALE' : datos.sexo === 'M' ? 'FEMALE' : null,
    age: datos.edad,
    heightCm: datos.altura,
    weightKg: datos.peso,
    bodyFatPercent: Number.isFinite(datos.grasaPct) ? datos.grasaPct : null,
    bodyFatSource: 'UNKNOWN',
    bodyFatQuality: 'UNKNOWN',
    bodyFatMethod: datos.bodyFatMethod || null,
    goal,
    occupation,
    steps: hasSteps ? steps : null,
    stepsCoverage: hasSteps ? stepsCoverage : null,
    stepsObservationDays: hasSteps ? stepsObservationDays : null,
    activityClass: null,
    activityClassSource: null,
    requestedRatePerWeek: null,
    requestedRateLabel,
    dietPreference: null,
    lowCarbPreference: null,
    dietPattern: null,
    scopeFlags: [],
    sleepHours: Number.isFinite(datos.horasSueno) ? datos.horasSueno : null,
    stressLevel: Number.isFinite(datos.nivelEstres) ? datos.nivelEstres : null,
    longestSessionMinutes: vaAlGym === true ? trainingMinutes : null,
    twoADay: null,
    ...training
  };
}

async function calcularStandardPatch3(datos){
  const adapter = window.MacroBalancePatch3Standard;
  if(!adapter) throw new Error('No se pudo cargar la Calculadora estándar. Recarga la página e intenta de nuevo.');
  const profile = await readPatch3StandardProfile(datos, adapter);
  const result = await adapter.calculate(profile);
  if(!result || !Array.isArray(result.plans) || result.plans.length !== 1 || result.plans[0].unavailable || !result.plans[0].nutritionTarget){
    const resolution = await adapter.resolveUnavailability?.(result);
    const error = new Error(resolution?.userMessage || 'No se pudo resolver el objetivo con la información disponible.');
    error.standardResolution = resolution || null;
    throw error;
  }
  await Promise.all(result.plans.map(plan => adapter.assertFiniteNutritionTarget(plan.nutritionTarget)));

  // Hydration is a separate, reference-only payload. If its browser bridge is
  // unavailable, Standard remains fully usable and no legacy water heuristic is
  // used as a fallback.
  let hydrationReference = null;
  try{
    hydrationReference = await window.MacroBalanceHydration?.buildReference?.(profile) || null;
  }catch(hydrationError){
    console.warn('No se pudo preparar la referencia de hidratación:', hydrationError);
  }

  planes = result.plans.map(plan => ({ ...plan, hydrationReference }));
  activo = 0;
  objetivoPreferidoIdx = activo;
  ultimoInputSnapshot = {
    peso: datos.peso, altura: datos.altura, edad: datos.edad, sexo: datos.sexo,
    grasaPct: Number.isFinite(datos.grasaPct) ? datos.grasaPct : null,
    bodyFatMethod: profile.bodyFatMethod || null,
    requestedRateLabel: profile.requestedRateLabel || null,
    actividadFactor: datos.factorNeat,
    vaAlGym: vaAlGym === true, diasGym: vaAlGym === true ? profile.sessionsPerWeek : null,
    metodo: 'PATCH3 Integrated Candidate + compatibility adapter', calculationMode: 'standard',
    calculatorVersion: result.activeStandardVersion, standardId: result.activeStandardId,
    standardFreezeId: result.activeStandardFreezeId, patch3Input: profile,
    trainingInputState: result.candidateOutputs?.find(item => item.goal === profile.goal)?.output?.inputProvenance?.trainingInputState || null,
    hydrationReference
  };

  document.getElementById('guardar-status').textContent = '';
  const trainingLabel = vaAlGym === true
    ? profile.trainingModality + ', ' + profile.sessionsPerWeek + ' día(s)/semana, ' + profile.sessionDurationMin + ' min por sesión, ' + profile.workload.toLowerCase()
    : vaAlGym === null ? 'No confirmado; faltan datos de entrenamiento.' : 'Ninguno confirmado.';
  const selectedOutput = result.candidateOutputs?.find(item => item.goal === profile.goal)?.output;
  const selectedTarget = result.plans[activo].nutritionTarget;
  datos.resultadoSection.style.display = 'block';
  renderResultado({
    objectiveLabel: ({ LOSS: 'Pérdida', MAINTENANCE: 'Mantenimiento', GAIN: 'Ganancia' })[profile.goal],
    rateLabel: profile.requestedRateLabel ? ({ CONSERVATIVE: 'ritmo conservador', MODERATE: 'ritmo moderado' })[profile.requestedRateLabel] : null,
    activityLabel: document.getElementById('actividad')?.selectedOptions?.[0]?.textContent || profile.occupation,
    steps: profile.steps,
    trainingLabel,
      bodyFatPercent: profile.bodyFatPercent,
      bodyFatMethod: profile.bodyFatMethod,
      hydrationReference,
    explanations: [
      'El punto mostrado es una selección operativa dentro de la región científica autorizada.',
      profile.steps == null ? 'Sin pasos: se conserva una estimación más amplia de actividad.' : 'Los pasos se usan como evidencia de movimiento cotidiano.'
    ],
    patch3: {
      scientificStatus: selectedOutput?.scientificStatus || null,
      presentationStatus: selectedOutput?.presentationStatus || null,
      teeRange: selectedOutput?.energy?.teeRange || null,
      targetRange: selectedOutput?.energy?.targetRange || null,
      trainingState: profile.trainingInput?.state || selectedOutput?.inputProvenance?.trainingInputState || null,
      selectionPolicy: selectedTarget.method.selectionPolicy
    }
  });
  datos.resultadoSection.scrollIntoView?.({behavior:'smooth', block:'start'});
}

async function calcular(){
  try { window.MacroBalanceShadow?.captureAndQueueCalculatorSubmission(); } catch (_shadowError) {}
  const peso = parseFloat(document.getElementById('peso').value);
  const altura = parseFloat(document.getElementById('altura').value);
  const edad = parseFloat(document.getElementById('edad').value);
  const sexo = document.getElementById('sexo').value;
  const factorNeat = parseFloat(document.getElementById('actividad').value) || 1.2;
  const grasaPct = parseFloat(document.getElementById('grasa')?.value);
  const bodyFatMethod = document.getElementById('bodyfat-method')?.value || null;
  // Legacy fallback is retained for rollback only; these contextual fields are
  // no longer part of the active Standard form.
  const horasSueno = null;
  const aguaTexto = '';
  const errorBox = document.getElementById('error');
  const resultadoSection = document.getElementById('resultado-section');

  errorBox.style.display = 'none';
  if(resultadoSection) resultadoSection.style.display = 'none';

  if(!peso || !altura || !edad || peso <= 0 || altura <= 0 || edad <= 0){
    errorBox.textContent = 'Completa peso, altura y edad con valores válidos.';
    errorBox.style.display = 'block';
    return;
  }
  const alturaM = altura / 100;
  if(alturaM > 1.99){
    errorBox.textContent = 'Error: la altura no puede ser mayor a 1.99 m.';
    errorBox.style.display = 'block';
    return;
  }
  if(alturaM < 1.45){
    errorBox.textContent = 'Error: con una altura menor a 1.45 m el cálculo no es confiable.';
    errorBox.style.display = 'block';
    return;
  }

  if(calculationMode === 'standard' && STANDARD_PROMOTION_ENABLED){
    try{
      await calcularStandardPatch3({
        peso: peso, altura: altura, edad: edad, sexo: sexo, factorNeat: factorNeat,
        grasaPct: grasaPct, bodyFatMethod, vaAlGym: vaAlGym, errorBox: errorBox, resultadoSection
      });
    }catch(error){
      console.error('Error al calcular Standard PATCH3:', error);
      mostrarErrorCalculadora(error.message || 'No fue posible completar el cálculo estándar.');
    }
    return;
  }

  objetivoPreferidoIdx = parseInt(document.getElementById('objetivoPreferido').value, 10);
  if(isNaN(objetivoPreferidoIdx)) objetivoPreferidoIdx = 1;

  if(calculationMode === 'precision'){
    calcularPrecision({
      peso: peso, altura: altura, edad: edad, sexo: sexo, factorNeat: factorNeat,
      grasaPct: grasaPct, horasSueno: null, aguaTexto: '',
      vaAlGym: vaAlGym, errorBox: errorBox, carruselSection: resultadoSection
    });
    return;
  }

  const carruselSection = resultadoSection;

  // 1) BMR: Katch-McArdle si hay % de grasa (usa masa magra, más preciso), si no Mifflin-St Jeor
  let bmr, metodo;
  if(grasaPct && grasaPct > 3 && grasaPct < 60){
    const masaMagra = peso * (1 - grasaPct/100);
    bmr = 370 + (21.6 * masaMagra);
    metodo = 'Katch-McArdle (usando tu % de grasa)';
  } else {
    bmr = sexo === 'H'
      ? (10*peso + 6.25*altura - 5*edad + 5)
      : (10*peso + 6.25*altura - 5*edad - 161);
    metodo = 'Mifflin-St Jeor (estimado sin % de grasa)';
  }

  // 2) NEAT: SOLO movimiento cotidiano, sin ejercicio incluido (evita doble conteo con gym/cardio)
  let metabolismoBase = bmr * factorNeat;

  // 3) Sueño: afecta cortisol/grelina y el gasto de fondo (NO el gasto mecánico del ejercicio)
  let factorSueno = 1, tagSueno = 'Sin datos', tipSueno = '';
  if(horasSueno){
    if(horasSueno < 6){
      factorSueno = 0.95;
      tagSueno = 'Impacto alto';
      tipSueno = '<b>Duermes poco (&lt;6h):</b> tu cortisol y grelina (hormona del hambre) tienden a subir, y tu gasto de fondo baja un poco porque te mueves menos sin notarlo (NEAT). Ajustamos tu metabolismo base -5% — y ojo, esto también suele aumentar el apetito por encima de lo calculado.';
    } else if(horasSueno < 7){
      factorSueno = 0.98;
      tagSueno = 'Impacto leve';
      tipSueno = '<b>Duermes un poco por debajo del rango ideal (6-7h):</b> ligero impacto en cortisol y gasto energético. Ajustamos -2%.';
    } else if(horasSueno <= 9){
      factorSueno = 1;
      tagSueno = 'Óptimo';
      tipSueno = '<b>Buen rango de sueño (7-9h):</b> sin penalización — tu cuerpo regula mejor el cortisol y el apetito.';
    } else {
      factorSueno = 1;
      tagSueno = 'Largo';
      tipSueno = 'Duermes más de 9h. No aplicamos penalización, pero si te sientes cansado igual, vale la pena revisar calidad de sueño, no solo cantidad.';
    }
  }
  metabolismoBase = metabolismoBase * factorSueno;

  // 4) Estrés: cortisol elevado sostenido = más antojos y tendencia a acumular grasa (mismo principio que sueño)
  const nivelEstres = parseInt(document.getElementById('estres').value, 10) || 0;
  let factorEstres = 1, tagEstres = 'Sin datos', tipEstres = '';
  if(nivelEstres === 1 || nivelEstres === 2){
    factorEstres = 1;
    tagEstres = 'Bajo';
    tipEstres = '<b>Estrés bajo:</b> tu cortisol se mantiene estable, sin impacto relevante en tu gasto ni en tu apetito.';
  } else if(nivelEstres === 3){
    factorEstres = 0.99;
    tagEstres = 'Medio';
    tipEstres = '<b>Estrés medio:</b> ligero repunte de cortisol. Ajustamos -1% y vale la pena vigilar antojos por ansiedad.';
  } else if(nivelEstres === 4){
    factorEstres = 0.96;
    tagEstres = 'Alto';
    tipEstres = '<b>Estrés alto:</b> el cortisol sostenido eleva el apetito (sobre todo por azúcar/grasa) y favorece que tu cuerpo retenga más grasa, en especial abdominal. Ajustamos -4%.';
  } else if(nivelEstres === 5){
    factorEstres = 0.93;
    tagEstres = 'Muy alto';
    tipEstres = '<b>Estrés muy alto:</b> cortisol crónicamente elevado — mayor apetito, peor calidad de sueño y más facilidad para acumular grasa visceral. Ajustamos -7%. Si esto es constante, vale más atender el estrés que solo ajustar la dieta.';
  }
  metabolismoBase = metabolismoBase * factorEstres;

  // 5) EAT: el ejercicio real, calculado aparte y NUNCA tocado por sueño/estrés (es gasto mecánico)
  //    Gym: MET 6.0 = entrenamiento de fuerza vigoroso (Compendium of Physical Activities, Ainsworth et al. 2011, código 02050)
  //    × 0.65 = factor de descanso entre series (una sesión real no es esfuerzo continuo como asume el MET de tabla)
  let diasGym = 0, gastoGymDiario = 0, tipGym = '';
  const FACTOR_DESCANSO_SERIES = 0.65;
  if(vaAlGym){
    diasGym = parseInt(document.getElementById('dias-gym').value, 10);
    const kcalPorSesion = (6 * FACTOR_DESCANSO_SERIES * 3.5 * peso / 200) * 60;
    gastoGymDiario = (kcalPorSesion * diasGym) / 7;
    tipGym = 'Entrenas ' + diasGym + ' día(s) por semana. Sumamos un promedio de ' + Math.round(gastoGymDiario) + ' kcal/día por tu entrenamiento de fuerza (60 min/sesión, MET 6.0 con descanso entre series incluido).';
  } else {
    tipGym = 'No marcaste entrenamiento de fuerza — si empiezas a ir al gym, tu gasto calórico real sube y podrías necesitar más calorías de las que ves aquí.';
  }

  const defs = [
    // Ajuste de objetivo PROPORCIONAL al gasto (no un número fijo), rango recomendado por
    // literatura de nutrición deportiva (Helms/Aragon/Schoenfeld): déficit 15-25%, superávit 5-15%
    {id:'deficit', nombre:'Déficit', factorObjetivo:0.80, icon:'down', minCardio:30},
    {id:'mantenimiento', nombre:'Mantenimiento', factorObjetivo:1.00, icon:'equal', minCardio:25},
    {id:'volumen', nombre:'Volumen', factorObjetivo:1.10, icon:'up', minCardio:15}
  ];

  const metaAgua = (peso * 0.035) + ((defs[0].minCardio) * 0.003);
  const consumoActual = interpretarAgua(aguaTexto);
  const faltanteAgua = metaAgua - consumoActual;

  planes = defs.map(function(d){
    // Cardio: MET 3.5 = caminata moderada 4.8-5.5km/h (mismo Compendium)
    const gastoCardio = (3.5 * 3.5 * peso / 200) * d.minCardio;
    const eat = gastoGymDiario + gastoCardio;
    const subtotal = metabolismoBase + eat;
    // 6) TEF: efecto térmico de los alimentos, ~10% de la energía manejada (Westerterp 2004; Jéquier 2002)
    const tef = subtotal * 0.10;
    const tdeeTotal = subtotal + tef;
    let kcal = Math.max(1500, tdeeTotal * d.factorObjetivo);

    const proteina = peso * 2;
    const grasaG = (kcal * 0.25) / 9;
    const kcalProt = proteina*4, kcalGrasaCal = grasaG*9;
    const carbos = (kcal - kcalProt - kcalGrasaCal) / 4;
    return {
      id: d.id, nombre: d.nombre, icon: d.icon, cardio: d.minCardio + ' min',
      kcal: Math.round(kcal),
      proteina: Math.round(proteina), grasa: Math.round(grasaG), carbos: Math.round(carbos)
    };
  });

  planes.forEach(function(plan){
    if(window.MacroBalanceCalculator){
      plan.nutritionTarget = window.MacroBalanceCalculator.createNutritionTarget({
        plan: plan,
        calculationMode: 'standard',
        calculatorVersion: STANDARD_CALC_VERSION,
        method: { bmrMethod: metodo }
      });
    }
  });

  ultimoInputSnapshot = {
    peso: peso, altura: altura, edad: edad, sexo: sexo, grasaPct: grasaPct || null,
    actividadFactor: factorNeat, horasSueno: horasSueno || null, aguaTexto: aguaTexto || null,
    nivelEstres: nivelEstres || null, vaAlGym: vaAlGym, diasGym: vaAlGym ? diasGym : null,
    metodo: metodo,
    calculationMode: 'standard',
    calculatorVersion: STANDARD_CALC_VERSION
  };

  document.getElementById('guardar-status').textContent = '';

  activo = objetivoPreferidoIdx;
  carruselSection.style.display = 'block';
  renderResultado({
    metodo: metodo, tagSueno: tagSueno, tipSueno: tipSueno,
    metaAgua: metaAgua.toFixed(1), consumoActual: consumoActual, faltanteAgua: faltanteAgua,
    horasSueno: horasSueno, vaAlGym: vaAlGym, diasGym: diasGym, tipGym: tipGym,
    nivelEstres: nivelEstres, tagEstres: tagEstres, tipEstres: tipEstres
  });
  carruselSection.scrollIntoView({behavior:'smooth', block:'start'});
}

function iconoSvg(tipo){
  if(tipo === 'down') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 4v14M6 12l6 6 6-6"/></svg>';
  if(tipo === 'up') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20V6M6 12l6-6 6 6"/></svg>';
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 9h14M5 15h14"/></svg>';
}

function renderResultado(contexto){
  if(contexto) ultimoContexto = contexto;
  renderDetalle();
}

function renderDetalle(){
  const p = planes[activo];
  const c = ultimoContexto || {};
  const detalle = document.getElementById('detalle');
  if(!detalle || !p) return;
  const objective = c.objectiveLabel || p.nombre || 'Objetivo';
  const activity = c.activityLabel || 'Sin especificar';
  const steps = Number.isFinite(c.steps) ? Math.round(c.steps).toLocaleString('es-MX') + ' pasos/día' : 'No proporcionados';
  const bodyFat = Number.isFinite(c.bodyFatPercent) ? c.bodyFatPercent + '%'+(c.bodyFatMethod ? ' · '+c.bodyFatMethod : '') : 'No proporcionado';
  const explanations = Array.isArray(c.explanations) ? c.explanations.slice(0, 4) : [];
  const explanationHtml = explanations.map(item => '<li>'+item+'</li>').join('');
  const hydration = c.hydrationReference?.status === 'REFERENCE_ONLY'
    && Number.isFinite(c.hydrationReference?.totalWaterReference?.valueLPerDay)
    ? c.hydrationReference.totalWaterReference.valueLPerDay.toFixed(1) + ' L/día · agua total (bebidas + alimentos)'
    : null;

  detalle.innerHTML =
    '<div class="label-top">Tu objetivo diario · ' + objective + '</div>' +
    '<div class="kcal-grande">' + p.kcal + ' kcal / día</div>' +
    '<div class="macros">' +
      '<div class="macro"><div class="g">' + p.proteina + 'g</div><div class="l">Proteína</div></div>' +
      '<div class="macro"><div class="g">' + p.grasa + 'g</div><div class="l">Grasa</div></div>' +
      '<div class="macro"><div class="g">' + p.carbos + 'g</div><div class="l">Carbohidratos</div></div>' +
    '</div>' +
    (hydration ? '<div class="sueno-tip"><b>Referencia de agua total:</b> '+hydration+'. No es una prescripción de agua simple.</div>' : '') +
    '<div class="result-context-grid">' +
      '<div class="box"><div class="l">Objetivo</div><div class="v">' + objective + (c.rateLabel ? ' · '+c.rateLabel : '') + '</div></div>' +
      '<div class="box"><div class="l">Actividad</div><div class="v">' + activity + '</div><div class="l">' + steps + '</div></div>' +
      '<div class="box"><div class="l">Entrenamiento</div><div class="v">' + (c.trainingLabel || 'No confirmado') + '</div></div>' +
      '<div class="box"><div class="l">Composición corporal</div><div class="v">' + bodyFat + '</div></div>' +
    '</div>' +
    (explanationHtml ? '<div class="result-explanations"><div class="l">Sobre tu cálculo</div><ul>'+explanationHtml+'</ul></div>' : '') +
    (c.patch3 ? '<div class="sueno-tip"><b>Base científica:</b> PATCH3 · '+(c.patch3.presentationStatus || 'REGION_READY')+
      (Array.isArray(c.patch3.targetRange) ? ' · energía '+Math.round(c.patch3.targetRange[0])+'–'+Math.round(c.patch3.targetRange[1])+' kcal' : '')+
      '. El punto mostrado es una selección operativa dentro de la región autorizada.</div>' : '') +
    (p.nutritionTarget ? '<div class="sueno-tip"><b>Coherencia energética:</b> macros = ' + p.nutritionTarget.energyCheck.macroKcal + ' kcal (' + (p.nutritionTarget.energyCheck.differenceKcal >= 0 ? '+' : '') + p.nutritionTarget.energyCheck.differenceKcal + ' kcal por redondeo).</div>' : '') +
    (c.metodo ? '<div class="sueno-tip" style="border-top:none;padding-top:0;">Cálculo base: '+c.metodo+'</div>' : '');
}

async function guardarObjetivoActual(){
  const statusBox = document.getElementById('guardar-status');
  const btn = document.getElementById('btn-guardar-objetivo');
  if(!ultimoInputSnapshot || !planes[activo]){
    statusBox.textContent = 'Primero calcula un plan.';
    return;
  }
  if(!window.guardarObjetivoFirestore){
    statusBox.textContent = 'No se pudo conectar con la base de datos. Intenta de nuevo.';
    return;
  }
  btn.disabled = true;
  statusBox.textContent = 'Guardando...';
  try{
    const calculatorVersion = ultimoInputSnapshot.calculatorVersion || STANDARD_CALC_VERSION;
    await window.guardarObjetivoFirestore(
      planes[activo],
      ultimoInputSnapshot,
      calculatorVersion,
      planes[activo].nutritionTarget || null,
      planes[activo].hydrationReference || null
    );
    statusBox.textContent = 'Objetivo guardado. Abriendo tus preferencias…';
    if(window.mostrarObjetivoActualFirestore) await window.mostrarObjetivoActualFirestore();
    window.location.assign('/plan.html#config');
  } catch(err){
    console.error('Error al guardar objetivo:', err);
    statusBox.textContent = 'No se pudo guardar. Intenta de nuevo.';
  } finally {
    btn.disabled = false;
  }
}

window.addEventListener('macrobalance:auth-changed', function(event){
  const state = event.detail;
  const cta = document.getElementById('hero-cta');
  if(cta){
    cta.innerHTML = state?.user ? 'CONTINUAR <span>&rarr;</span>' : 'EMPEZAR <span>&rarr;</span>';
  }
  if(state?.user){
    cerrarModalAuth();
    const url = new URL(window.location.href);
    if(url.searchParams.get('login') === '1'){
      url.searchParams.delete('login');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }
  if(esRutaMacros() && state?.authReady){
    mostrarCalculadoraAutenticada();
  }
  if(new URLSearchParams(window.location.search).get('login') === '1' && !state?.user){
    mostrarModalAuth();
  }
  if(state?.authReady && !state?.user && !new URLSearchParams(window.location.search).has('login')){
    mostrarEstadoAnonimo();
  }
});

window.addEventListener('hashchange', function(){
  if(esRutaMacros()) mostrarCalculadoraAutenticada();
});
