let planes = [];
let activo = 1;
let objetivoPreferidoIdx = 1;
let vaAlGym = false;
let ultimoContexto = null;
let ultimoInputSnapshot = null;
const CALC_VERSION = 'v1-2026-08';

function setGym(valor){
  vaAlGym = valor;
  document.getElementById('gym-si').classList.toggle('selected', valor === true);
  document.getElementById('gym-no').classList.toggle('selected', valor === false);
  document.getElementById('dias-gym-wrap').style.display = valor ? 'block' : 'none';
  document.getElementById('gym-kcal-box').style.display = valor ? 'block' : 'none';
  if(valor) actualizarKcalGym();
}

function actualizarKcalGym(){
  const peso = parseFloat(document.getElementById('peso').value) || 70;
  const dias = parseInt(document.getElementById('dias-gym').value, 10);
  const FACTOR_DESCANSO_SERIES = 0.65;
  const kcalPorSesion = (6 * FACTOR_DESCANSO_SERIES * 3.5 * peso / 200) * 60;
  const promedioDiario = Math.round((kcalPorSesion * dias) / 7);
  document.getElementById('gym-kcal-valor').textContent = promedioDiario;
}

// Muestra el sufijo L o ml en vivo, según la misma regla que usa el cálculo real
function actualizarUnidadAgua(){
  const input = document.getElementById('agua');
  const span = document.getElementById('agua-unidad');
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
    if(campo.id === 'agua') actualizarUnidadAgua();
    if(campo.id === 'peso' && vaAlGym) actualizarKcalGym();
  });
});
document.querySelectorAll('.grid select').forEach(function(campo){
  marcarCampoLleno(campo);
  campo.addEventListener('change', function(){ marcarCampoLleno(campo); });
});
actualizarUnidadAgua();

function abrirModal(){
  document.getElementById('modal-overlay').classList.remove('hidden');
}

// Esta es la función que solo se activará SI Firebase confirma el inicio de sesión
window.avanzarApp = function(){
  document.getElementById('modal-overlay').classList.add('hidden');
  const landing = document.getElementById('landing');
  landing.classList.add('leaving');
  setTimeout(function(){
    landing.style.display = 'none';
    document.getElementById('gate').classList.remove('hidden');
  }, 500);
}

async function elegir(sexo){
  document.getElementById('sexo').value = sexo;
  if(window.guardarSexoFirestore) window.guardarSexoFirestore(sexo);
  const rutaFoto = rutaGate(sexo);
  const rutaAvatarRespaldo = sexo === 'M' ? 'media/mujer-v.jpg' : 'media/hombre-v.jpg';

  document.getElementById('foto-mujer').classList.toggle('active', sexo === 'M');
  document.getElementById('foto-hombre').classList.toggle('active', sexo === 'H');

  const avatarImg = document.getElementById('avatar-img');
  avatarImg.onerror = function(){ avatarImg.onerror = null; avatarImg.src = rutaAvatarRespaldo; };

  // Consulta si ya existe una foto personalizada guardada en Firestore; si no,
  // usa la de Google/Facebook, y si tampoco existe, el avatar por defecto.
  let datosUsuario = null;
  if(window.obtenerDatosUsuarioFirestore) datosUsuario = await window.obtenerDatosUsuarioFirestore();
  window.datosUsuarioActual = datosUsuario;
  avatarImg.src = resolverFotoPerfil(datosUsuario, rutaAvatarRespaldo);
  window.rutaAvatarRespaldoActual = rutaAvatarRespaldo;

  const gate = document.getElementById('gate');
  gate.classList.add('leaving');
  setTimeout(function(){
    gate.style.display = 'none';
    const loading = document.getElementById('loading');
    document.getElementById('loading-photo').src = rutaFoto;
    loading.classList.remove('hidden');
    setTimeout(async function(){
      loading.style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      if(window.precargarPerfilFirestore) await window.precargarPerfilFirestore();
      if(window.mostrarObjetivoActualFirestore) await window.mostrarObjetivoActualFirestore();
    }, 3500);
  }, 500);
}

// ===== Modal "Editar cuenta" =====

function abrirModalCuenta(){
  const modal = document.getElementById('modal-cuenta');
  if(!modal) return;
  modal.classList.remove('hidden');
  const u = window.datosUsuarioActual || {};
  const nombreInput = document.getElementById('cuenta-nombre');
  const emailInput = document.getElementById('cuenta-email');
  if(nombreInput) nombreInput.value = u.displayName || '';
  if(emailInput) emailInput.value = u.email || '';
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
    if(window.guardarCuentaFirestore) await window.guardarCuentaFirestore({ displayName: nombre }, {});

    if(window.nuevaFotoBase64Pendiente){
      await window.guardarFotoPersonalizadaFirestore(window.nuevaFotoBase64Pendiente);
    } else if(window.eliminarFotoPendiente){
      await window.eliminarFotoPersonalizadaFirestore();
    }
    window.nuevaFotoBase64Pendiente = null;
    window.eliminarFotoPendiente = false;

    // Refresca el avatar y los datos en memoria
    if(window.obtenerDatosUsuarioFirestore) window.datosUsuarioActual = await window.obtenerDatosUsuarioFirestore();
    const rutaRespaldo = window.rutaAvatarRespaldoActual || 'media/mujer-v.jpg';
    document.getElementById('avatar-img').src = resolverFotoPerfil(window.datosUsuarioActual, rutaRespaldo);

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
  lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';
  const historial = await window.obtenerHistorialObjetivosFirestore();
  if(!historial.length){
    lista.innerHTML = '<div class="historial-vacio">Todavía no tienes objetivos guardados.</div>';
    return;
  }
  lista.innerHTML = historial.map(function(item){
    const fecha = item.startDate && item.startDate.toDate ? item.startDate.toDate().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const estado = item.status === 'active' ? '<span class="historial-activo">Objetivo actual</span>' : '';
    const kcal = item.result ? item.result.kcal : '';
    return '<div class="historial-item">' +
      '<div class="historial-kcal">' + kcal + ' kcal</div>' +
      '<div class="historial-fecha">' + fecha + '</div>' +
      estado +
    '</div>';
  }).join('');
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

function calcular(){
  const peso = parseFloat(document.getElementById('peso').value);
  const altura = parseFloat(document.getElementById('altura').value);
  const edad = parseFloat(document.getElementById('edad').value);
  const sexo = document.getElementById('sexo').value;
  const factorNeat = parseFloat(document.getElementById('actividad').value) || 1.2;
  const grasaPct = parseFloat(document.getElementById('grasa').value);
  const horasSueno = parseFloat(document.getElementById('sueno').value);
  const aguaTexto = document.getElementById('agua').value;
  const errorBox = document.getElementById('error');
  const carruselSection = document.getElementById('carrusel-section');

  errorBox.style.display = 'none';
  carruselSection.style.display = 'none';

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

  objetivoPreferidoIdx = parseInt(document.getElementById('objetivoPreferido').value, 10);
  if(isNaN(objetivoPreferidoIdx)) objetivoPreferidoIdx = 1;

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

  ultimoInputSnapshot = {
    peso: peso, altura: altura, edad: edad, sexo: sexo, grasaPct: grasaPct || null,
    actividadFactor: factorNeat, horasSueno: horasSueno || null, aguaTexto: aguaTexto || null,
    nivelEstres: nivelEstres || null, vaAlGym: vaAlGym, diasGym: vaAlGym ? diasGym : null,
    metodo: metodo
  };

  document.getElementById('guardar-status').textContent = '';

  activo = objetivoPreferidoIdx;
  carruselSection.style.display = 'block';
  renderCarrusel({
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

function renderCarrusel(contexto){
  if(contexto) ultimoContexto = contexto;
  const track = document.getElementById('track');
  const dots = document.getElementById('dots');
  track.innerHTML = '';
  dots.innerHTML = '';

  planes.forEach(function(p, i){
    let posClass = 'pos-hidden-right';
    const diff = i - activo;
    if(diff === 0) posClass = 'pos-center';
    else if(diff === -1 || diff === planes.length-1) posClass = 'pos-left';
    else if(diff === 1 || diff === -(planes.length-1)) posClass = 'pos-right';
    else if(diff < 0) posClass = 'pos-hidden-left';

    const card = document.createElement('div');
    card.className = 'plan-card ' + posClass;
    card.onclick = function(){ activo = i; renderCarrusel(); };
    const badge = (i === objetivoPreferidoIdx)
      ? '<div class="marca-objetivo"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>Tu objetivo</div>'
      : '';
    card.innerHTML = badge +
      '<div class="tag">' + iconoSvg(p.icon) + p.nombre + '</div>' +
      '<h3>' + p.kcal + ' kcal</h3>' +
      '<div class="kcal">por día</div>' +
      '<div class="macros-mini">' + p.proteina + 'P · ' + p.grasa + 'G · ' + p.carbos + 'C</div>';
    track.appendChild(card);

    const dot = document.createElement('div');
    dot.className = 'dot' + (i === activo ? ' active' : '');
    dot.onclick = function(){ activo = i; renderCarrusel(); };
    dots.appendChild(dot);
  });

  renderDetalle();
}

function renderDetalle(){
  const p = planes[activo];
  const c = ultimoContexto || {};
  const detalle = document.getElementById('detalle');

  let aguaVal = c.metaAgua ? c.metaAgua + ' L' : '—';
  let aguaClase = '';
  let aguaSub = '';
  if(c.consumoActual){
    if(c.faltanteAgua > 0){ aguaSub = 'Te faltan ' + c.faltanteAgua.toFixed(1) + ' L hoy'; aguaClase='warn'; }
    else { aguaSub = 'Ya cumpliste tu meta de hoy'; }
  }

  detalle.innerHTML =
    '<div class="label-top">Plan seleccionado — ' + p.nombre + '</div>' +
    '<div class="kcal-grande">' + p.kcal + ' kcal / día</div>' +
    '<div class="macros">' +
      '<div class="macro"><div class="g">' + p.proteina + 'g</div><div class="l">Proteína</div></div>' +
      '<div class="macro"><div class="g">' + p.grasa + 'g</div><div class="l">Grasa</div></div>' +
      '<div class="macro"><div class="g">' + p.carbos + 'g</div><div class="l">Carbohidratos</div></div>' +
    '</div>' +
    '<div class="extra-row">' +
      '<div class="box"><div class="l">Agua meta</div><div class="v ' + aguaClase + '">' + aguaVal + '</div>' + (aguaSub ? '<div class="l" style="margin-top:4px;">'+aguaSub+'</div>' : '') + '</div>' +
      '<div class="box"><div class="l">Cardio</div><div class="v">' + p.cardio + '</div></div>' +
      '<div class="box"><div class="l">Sueño</div><div class="v">' + (c.horasSueno ? c.horasSueno+'h · '+c.tagSueno : '—') + '</div></div>' +
    '</div>' +
    '<div class="extra-row" style="margin-top:10px;">' +
      '<div class="box"><div class="l">Gym</div><div class="v">' + (c.vaAlGym ? c.diasGym + ' día(s)/sem' : 'No entrena') + '</div></div>' +
      '<div class="box"><div class="l">Estrés</div><div class="v">' + (c.nivelEstres ? c.nivelEstres+'/5 · '+c.tagEstres : '—') + '</div></div>' +
    '</div>' +
    (c.tipSueno ? '<div class="sueno-tip">'+c.tipSueno+'</div>' : '') +
    (c.tipGym ? '<div class="sueno-tip">'+c.tipGym+'</div>' : '') +
    (c.tipEstres ? '<div class="sueno-tip">'+c.tipEstres+'</div>' : '') +
    (c.metodo ? '<div class="sueno-tip" style="border-top:none;padding-top:0;">Cálculo base: '+c.metodo+'</div>' : '');
}

function mover(dir){
  activo = (activo + dir + planes.length) % planes.length;
  renderCarrusel();
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
    await window.guardarObjetivoFirestore(planes[activo], ultimoInputSnapshot, CALC_VERSION);
    statusBox.textContent = 'Objetivo guardado. Este es ahora tu objetivo activo.';
    if(window.mostrarObjetivoActualFirestore) await window.mostrarObjetivoActualFirestore();
  } catch(err){
    console.error('Error al guardar objetivo:', err);
    statusBox.textContent = 'No se pudo guardar. Intenta de nuevo.';
  } finally {
    btn.disabled = false;
  }
}