let alimentos = [];
let alimentosPorId = {};

let plan = null;
let objetivoActivo = null;
let usuarioActivoId = null;
let alimentosCargados = false;
let generationController = null;
const GENERATION_MOBILE_QUERY = '(max-width: 820px)';

let semanaActiva = 0;
let diaActivo = 0;
let comidaActivaIdx = 0;

let comprasTabActiva =
  'lista_compras_semana_1';

let categoriaCompraActiva =
  'todas';

let dashboardSubvista =
  'plan';

let seleccionActual =
  new Set();


const NOMBRES_CAT = {
  proteina:'Proteínas',
  lacteo:'Lácteos',
  grasa:'Grasas y aceites',
  carbohidrato:'Carbohidratos',
  leguminosa:'Leguminosas',
  condimento:'Condimentos',
  fruta:'Frutas',
  verdura:'Verduras',
  cereal:'Cereales',
  bebida:'Bebidas'
};


// ============================================================
// VELOCIDAD DEL CARRUSEL DE ALIMENTOS
// Mayor número = movimiento más lento.
// Este es el ÚNICO valor que necesitas tocar para ajustar
// la velocidad global de las tiras de alimentos.
// ============================================================
const FOOD_CAROUSEL_DURATION_SECONDS = 490;

// Cantidad de tarjetas "de referencia" usada para calcular la
// duración de cada categoría (se ignoran Cereales/Bebidas por
// tener muy pocos alimentos) y así mantener una velocidad
// visual consistente entre categorías grandes y chicas.
const FOOD_CAROUSEL_REFERENCE_ITEMS = 20;

// Mínimo de tarjetas por vuelta antes de duplicar visualmente
// el track para el loop infinito. Categorías chicas (Cereales,
// Bebidas) repiten su propia secuencia hasta llegar a este
// mínimo, sin inventar alimentos nuevos.
const FOOD_CAROUSEL_MIN_ITEMS = 10;


/* ---------------------------------------------------------
   CARGAR ALIMENTOS
--------------------------------------------------------- */

async function cargarAlimentos(){

  if(alimentosCargados){
    return;
  }

  const res =
    await fetch(
      '/api/foods'
    );

  if(!res.ok){
    throw new Error('No se pudo cargar el catálogo de alimentos.');
  }

  alimentos = await res.json();
  alimentosCargados = true;

  alimentos.forEach(
    a =>
      alimentosPorId[a.id] =
        a
  );

  renderFoodGallery(alimentos);

}


/* ---------------------------------------------------------
   GALERÍA DE ALIMENTOS · HELPERS
--------------------------------------------------------- */

// food.id -> archivo de imagen. NUNCA por posición/índice.
function foodImgSrc(food){

  return window.MacroBalanceAssets.food(food);

}


function categoriaLegible(cat){

  if(NOMBRES_CAT[cat]){
    return NOMBRES_CAT[cat];
  }

  // Fallback para categorías nuevas que aún no tengan
  // una etiqueta bonita definida en NOMBRES_CAT.
  return (cat || 'Otros')
    .toString()
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      l => l.toUpperCase()
    );

}


// Tocar la tarjeta = excluir/incluir food.id en seleccionActual.
// seleccionActual es la ÚNICA fuente de verdad (también usada por
// generar() para construir excludedIngredients). No crear estado
// paralelo.
function foodCardHTML(food){

  const id =
    food.id;

  const nombre =
    food.name ||
    '';

  const nombreBusqueda =
    nombre
      .toLowerCase()
      .replace(/"/g, '&quot;');

  const excluido =
    seleccionActual.has(id);

  return (

    '<div ' +
      'class="food-card' +
      (
        excluido
          ? ' excluded'
          : ''
      ) +
      '" ' +
      'data-food-id="' +
      id +
      '" ' +
      'data-food-name="' +
      nombreBusqueda +
      '" ' +
      'role="button" ' +
      'tabindex="0" ' +
      'aria-pressed="' +
      excluido +
      '" ' +
      'aria-label="' +
      'Excluir ' +
      nombre +
      '" ' +
      'onclick="toggleExclusion(\'' +
        id +
      '\')" ' +
      'onkeydown="' +
        'if(event.key===\'Enter\'||event.key===\' \'){' +
          'event.preventDefault();' +
          'toggleExclusion(\'' + id + '\');' +
        '}' +
      '"' +
    '>' +

      '<div class="fc-img">' +

        '<img ' +
          'src="' +
          foodImgSrc(food) +
          '" ' +

          'alt="' +
          nombre +
          '" ' +

          'loading="lazy" ' +
          'decoding="async" ' +

          'onerror="' +
            'this.style.display=\'none\';' +
            'this.nextElementSibling.style.display=\'flex\';' +
          '"' +

        '>' +

        '<span class="fc-fallback">🍽️</span>' +

        '<span class="fc-x-badge">✕</span>' +

        '<div class="fc-name">' +

          '<span class="fc-name-text">' +
            nombre +
          '</span>' +

          '<span class="fc-excluded-text">' +
            'Excluido' +
          '</span>' +

        '</div>' +

      '</div>' +

    '</div>'

  );

}


/* ---------------------------------------------------------
   GALERÍA DE ALIMENTOS · RENDER
--------------------------------------------------------- */

function renderFoodGallery(items){

  const cont =
    document.getElementById(
      'food-carousels'
    );

  if(!cont){
    return;
  }

  if(
    !items ||
    items.length === 0
  ){

    cont.innerHTML =
      '<div class="empty">' +
        'Sin alimentos disponibles' +
      '</div>';

    return;

  }


  const porCategoria = {};

  items.forEach(
    a => {

      const cat =
        a.category ||
        'otros';

      (
        porCategoria[cat] =
        porCategoria[cat] || []
      ).push(a);

    }
  );


  // Orden preferido: el mismo orden de NOMBRES_CAT.
  // Cualquier categoría futura que no esté ahí se agrega
  // automáticamente al final, sin romper el frontend.
  const ordenBase =
    Object.keys(NOMBRES_CAT);

  const categorias = [
    ...ordenBase.filter(
      c => porCategoria[c]
    ),
    ...Object.keys(porCategoria).filter(
      c => !ordenBase.includes(c)
    )
  ];


  const reduceMotion =
    window.matchMedia &&
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

  const staticCarousel =
    reduceMotion ||
    (
      window.matchMedia &&
      window.matchMedia('(hover: none), (pointer: coarse)').matches
    );


  cont.innerHTML =
    categorias.map(
      (cat, idx) => {

        const original =
          porCategoria[cat];

        // Categorías chicas (Bebidas, Cereales): repetimos
        // su propia secuencia (mismos IDs reales) hasta
        // llenar visualmente la tira.
        let secuencia =
          original;

        while(
          secuencia.length <
            FOOD_CAROUSEL_MIN_ITEMS &&
          original.length > 0
        ){
          secuencia =
            secuencia.concat(
              original
            );
        }

        // Duplicado VISUAL (no de datos) para loop infinito.
        const track =
          staticCarousel
            ? secuencia
            : secuencia.concat(
                secuencia
              );

        const direccion =
          idx % 2 === 0
            ? 'left'
            : 'right';

        // Duración ajustada para que la velocidad visual
        // (px/seg) sea consistente entre categorías.
        const duracion =
          Math.max(
            12,
            Math.round(
              FOOD_CAROUSEL_DURATION_SECONDS *
              (
                secuencia.length /
                FOOD_CAROUSEL_REFERENCE_ITEMS
              )
            )
          );

        const trackStyle =
          staticCarousel
            ? 'style="animation:none;overflow-x:auto;"'
            : (
                'style="animation-duration:' +
                duracion +
                's"'
              );

        return (

          '<div class="food-cat-row">' +

            '<h3>' +
              categoriaLegible(cat) +
            '</h3>' +

            '<div class="food-track-wrap">' +

              '<div class="food-track ' +
                (
                  direccion === 'right'
                    ? 'dir-right'
                    : ''
                ) +
                '" ' +
                trackStyle +
              '>' +

                track
                  .map(foodCardHTML)
                  .join('') +

              '</div>' +

            '</div>' +

          '</div>'

        );

      }
    ).join('');

}


/* ---------------------------------------------------------
   TOGGLE EXCLUSIÓN (selector negativo)
   Tocar la foto de un alimento = agregar/quitar su food.id de
   seleccionActual. Esta es la MISMA seleccionActual que usa
   generar() para construir excludedIngredients — no existe
   ningún estado paralelo (seleccionCarrusel, foodsSelected, etc).
--------------------------------------------------------- */

function toggleExclusion(id){

  if(
    seleccionActual.has(id)
  ){

    seleccionActual.delete(
      id
    );

  }else{

    seleccionActual.add(
      id
    );

  }

  aplicarEstadoExclusionEnGaleria();

  actualizarContador();

}


/* ---------------------------------------------------------
   APLICAR ESTADO DE EXCLUSIÓN EN LA GALERÍA
   Recorre TODAS las tarjetas (incluye las copias duplicadas
   del loop infinito) y sincroniza la clase "excluded" con
   seleccionActual.
--------------------------------------------------------- */

function aplicarEstadoExclusionEnGaleria(){

  document
    .querySelectorAll(
      '#food-carousels .food-card'
    )
    .forEach(
      card => {

        const excluido =
          seleccionActual.has(
            card.dataset.foodId
          );

        card.classList.toggle(
          'excluded',
          excluido
        );

        card.setAttribute(
          'aria-pressed',
          excluido
        );

      }
    );

}


/* ---------------------------------------------------------
   CONTADOR EXCLUSIONES
--------------------------------------------------------- */

function actualizarContador(){

  const el =
    document.getElementById(
      'sel-count'
    );

  if(!el){
    return;
  }

  el.textContent =
    '(' +
    seleccionActual.size +
    ' excluidos)';

}


/* ---------------------------------------------------------
   MARCAR TODOS / LIMPIAR EXCLUSIONES
--------------------------------------------------------- */

function marcarTodos(valor){

  if(valor){

    alimentos.forEach(
      a =>
        seleccionActual.add(
          a.id
        )
    );

  }else{

    seleccionActual.clear();

  }


  aplicarEstadoExclusionEnGaleria();

  actualizarContador();

}


/* ---------------------------------------------------------
   BUSCADOR — filtra visualmente el carrusel sin reconstruir
   su arquitectura (misma animación, mismas tarjetas). Al
   escribir se pausa el movimiento y se ocultan las tarjetas
   que no coinciden; al borrar la búsqueda todo regresa.
--------------------------------------------------------- */

function filtrarGaleria(filtro){

  const cont =
    document.getElementById(
      'food-carousels'
    );

  if(!cont){
    return;
  }

  const q =
    (filtro || '')
      .trim()
      .toLowerCase();

  const buscando =
    q.length > 0;

  cont.classList.toggle(
    'searching',
    buscando
  );


  cont
    .querySelectorAll(
      '.food-cat-row'
    )
    .forEach(
      fila => {

        let visibles =
          0;

        fila
          .querySelectorAll(
            '.food-card'
          )
          .forEach(
            card => {

              const coincide =
                !buscando ||
                (
                  card.dataset.foodName ||
                  ''
                ).includes(q);

              card.classList.toggle(
                'fc-hidden',
                !coincide
              );

              if(coincide){
                visibles++;
              }

            }
          );

        fila.style.display =
          visibles > 0
            ? ''
            : 'none';

      }
    );

}


document
  .getElementById(
    'buscador'
  )
  .addEventListener(
    'input',
    e =>
      filtrarGaleria(
        e.target.value
      )
  );


/* ---------------------------------------------------------
   CONSISTENCIA OBJETIVO
--------------------------------------------------------- */

function actualizarConsistenciaObjetivo(){

  const kcal = Number(objetivoActivo?.kcal) || 0;
  const p = Number(objetivoActivo?.proteina) || 0;
  const c = Number(objetivoActivo?.carbos) || 0;
  const g = Number(objetivoActivo?.grasa) || 0;


  const derivadas =
    p * 4 +
    c * 4 +
    g * 9;


  const dif =
    Math.round(
      derivadas -
      kcal
    );


  const el =
    document.getElementById(
      'consistencia-objetivo'
    );


  if(!el){
    return;
  }


  el.innerHTML =
    'Macros ≈ <b>' +
    Math.round(
      derivadas
    ) +
    ' kcal</b>' +

    ' · diferencia contra kcal objetivo: <b>' +

    fmt(
      dif
    ) +

    ' kcal</b>';


  el.style.color =
    Math.abs(
      dif
    ) >
    Math.max(
      60,
      kcal * .03
    )

      ? 'var(--moderado)'
      : 'var(--muted)';

}


/* ---------------------------------------------------------
   CAMBIO DE VISTA · CONFIGURACIÓN ↔ DASHBOARD
   Ambas viven en el mismo index.html (SPA de una sola página,
   sin recargar el navegador). Cambiar de vista solo oculta o
   muestra la sección correspondiente — nunca se destruye el
   estado (objetivos, exclusiones ni plan generado).
--------------------------------------------------------- */

// ============================================================
// NAVEGACIÓN PRINCIPAL: MACRO NUTRIENTES / MI PLAN / LISTA DE COMPRAS
// "Macro Nutrientes" apunta a la pantalla de configuración ya
// aprobada (calculadora). "Mi Plan" y "Lista de Compras" viven
// dentro de la misma vista-dashboard como subvistas, sin
// recargar ni perder el estado del plan generado.
// ============================================================

function irAVista(destino, actualizarUrl = true){

  if(!['config', 'plan', 'compras'].includes(destino)){
    destino = 'config';
  }

  document
    .querySelectorAll('[data-plan-nav]')
    .forEach(a =>
      a.toggleAttribute('aria-current', a.dataset.planNav === destino)
    );

  if(actualizarUrl && window.location.hash !== '#' + destino){
    history.replaceState(null, '', '#' + destino);
  }

  if(destino === 'config'){

    document.getElementById('vista-dashboard').style.display = 'none';
    document.getElementById('vista-config').style.display = '';

    window.scrollTo({ top:0, behavior:'smooth' });

    return;

  }

  // destino es 'plan' o 'compras'
  document.getElementById('vista-config').style.display = 'none';
  document.getElementById('vista-dashboard').style.display = '';

  dashboardSubvista = destino;

  const hayPlan =
    !!plan;

  document.getElementById('dashboard-empty').style.display =
    hayPlan ? 'none' : '';

  document.getElementById('subvista-plan').style.display =
    (hayPlan && destino === 'plan') ? '' : 'none';

  document.getElementById('subvista-compras').style.display =
    (hayPlan && destino === 'compras') ? '' : 'none';

  if(hayPlan && destino === 'compras'){
    renderListaCompras();
  }

  window.scrollTo({ top:0, behavior:'smooth' });

}


// Compatibilidad con el flujo existente de generar().
function mostrarDashboard(){
  irAVista('plan');
}

function volverAConfiguracion(){
  irAVista('config');
}


function mostrarLoadingGeneracion(){
  const overlay = document.getElementById('generation-overlay');
  const message = document.getElementById('generation-message');
  const working = document.getElementById('generation-working');
  const ready = document.getElementById('generation-ready');
  const viewPlanButton = document.getElementById('view-generated-plan');
  const panels = Array.from(overlay.querySelectorAll('[data-generation-panel]'));
  const isMobile =
    window.matchMedia(GENERATION_MOBILE_QUERY).matches ||
    window.matchMedia('(pointer: coarse)').matches;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const messages = [
    'Analizando tus preferencias…',
    'Seleccionando tus platillos…',
    'Equilibrando tus macros…',
    'Ajustando cantidades…',
    'Construyendo tu semana…',
    'Preparando tu lista de compras…',
    'Finalizando tu plan…'
  ];
  let messageIndex = 0;
  let messageSwapTimer = 0;
  let finished = false;
  const videoListeners = [];

  // El overlay puede haber quedado antes del dashboard tras una transición
  // móvil anterior. Como hijo directo de body nunca depende de una vista oculta.
  document.body.insertBefore(overlay, document.querySelector('.wa-float'));

  overlay.className = 'generation-overlay';
  overlay.setAttribute('aria-modal', 'true');
  overlay.hidden = false;
  document.body.classList.add('is-generating');
  working.hidden = false;
  ready.hidden = true;
  message.textContent = messages[0];

  const selectedMobilePanel = isMobile
    ? Math.floor(Math.random() * panels.length)
    : -1;

  panels.forEach((panel, index) => {
    const video = panel.querySelector('video');
    const poster = panel.querySelector('img');
    const shouldLoad = !isMobile || index === selectedMobilePanel;

    panel.classList.remove('is-active', 'is-playing', 'has-video-error');
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    poster.removeAttribute('src');
    video.load();

    if(!shouldLoad) return;

    panel.classList.add('is-active');
    poster.src = panel.dataset.posterSrc;
    video.poster = panel.dataset.posterSrc;

    if(reduceMotion) return;

    const handlePlaying = () => panel.classList.add('is-playing');
    const handleVideoError = () => {
      panel.classList.remove('is-playing');
      panel.classList.add('has-video-error');
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleVideoError);
    videoListeners.push([video, handlePlaying, handleVideoError]);

    // Las propiedades y los atributos se fijan ambos para Safari/iOS.
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');
    video.setAttribute('playsinline', '');
    video.src = panel.dataset.videoSrc;
    video.load();
    const playback = video.play();
    if(playback && typeof playback.catch === 'function'){
      playback.catch(handleVideoError);
    }
  });

  const messageTimer = window.setInterval(() => {
    messageIndex = Math.min(messageIndex + 1, messages.length - 1);
    message.classList.add('is-changing');
    messageSwapTimer = window.setTimeout(() => {
      message.textContent = messages[messageIndex];
      message.classList.remove('is-changing');
    }, 180);
  }, 4500);

  function stopMedia(){
    videoListeners.forEach(([video, handlePlaying, handleVideoError]) => {
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleVideoError);
    });
    panels.forEach(panel => {
      const video = panel.querySelector('video');
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
  }

  function hideExperience(scrollToPlan = false){
    if(finished) return;
    finished = true;
    overlay.classList.add('is-closing');
    document.body.classList.remove('is-generating');
    window.setTimeout(() => {
      overlay.hidden = true;
      overlay.className = 'generation-overlay';
      stopMedia();
      if(scrollToPlan){
        document.getElementById('subvista-plan').scrollIntoView({
          behavior:'smooth',
          block:'start'
        });
      }
    }, 180);
  }

  viewPlanButton.onclick = () => hideExperience(true);

  return function detenerLoading({ planReady = false } = {}){
    window.clearInterval(messageTimer);
    window.clearTimeout(messageSwapTimer);
    document.body.classList.remove('is-generating');

    if(planReady && isMobile){
      overlay.classList.add('is-ready');
      overlay.removeAttribute('aria-modal');
      working.hidden = true;
      ready.hidden = false;
      document.getElementById('vista-dashboard').prepend(overlay);
      overlay.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }

    if(planReady){
      hideExperience();
      return;
    }

    finished = true;
    overlay.hidden = true;
    stopMedia();
  };
}


function mostrarErrorGeneracion(message){
  const panel = document.getElementById('generation-error');
  document.getElementById('generation-error-message').textContent = message;
  panel.hidden = false;
  panel.scrollIntoView({ behavior:'smooth', block:'center' });
}


function ocultarErrorGeneracion(){
  document.getElementById('generation-error').hidden = true;
}


function clavePlanSesion(){
  return usuarioActivoId ? `macrobalance:plan:${usuarioActivoId}` : '';
}


function guardarPlanEnSesion(){
  const key = clavePlanSesion();
  if(!key || !plan) return;
  try{
    sessionStorage.setItem(key, JSON.stringify({
      goalId: window.macroBalanceState?.currentGoal?.id || null,
      plan,
      preferences: {
        numeroComidas: document.getElementById('num-comidas').value,
        diasSinRepetir: document.getElementById('dias-sin-repetir').value,
        exclusions: Array.from(seleccionActual)
      }
    }));
  }catch(error){
    console.warn('El plan no pudo guardarse temporalmente en esta pestaña:', error);
  }
}


function restaurarPlanDeSesion(goalId){
  const key = clavePlanSesion();
  if(!key) return;
  try{
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if(!saved || saved.goalId !== goalId || !saved.plan?.semana_1){
      sessionStorage.removeItem(key);
      return;
    }
    plan = saved.plan;
    if(saved.preferences){
      document.getElementById('num-comidas').value = saved.preferences.numeroComidas || '5';
      document.getElementById('dias-sin-repetir').value = saved.preferences.diasSinRepetir || '2';
      seleccionActual = new Set(saved.preferences.exclusions || []);
    }
    renderPlan();
  }catch(error){
    console.warn('El plan temporal no pudo restaurarse:', error);
    sessionStorage.removeItem(key);
  }
}


/* ---------------------------------------------------------
   GENERAR
--------------------------------------------------------- */

async function generar(){

  if(!objetivoActivo){
    mostrarErrorGeneracion('No hay un objetivo activo. Regresa a la calculadora y guarda uno.');
    return;
  }

  const excludedIngredients =
    Array.from(
      seleccionActual
    );


  const objetivo = { ...objetivoActivo };


  const numeroComidas =
    Number(
      document
        .getElementById(
          'num-comidas'
        )
        .value
    );


  const diasSinRepetir =
    Number(
      document
        .getElementById(
          'dias-sin-repetir'
        )
        .value
    );


  const btn =
    document.getElementById(
      'btn-generar'
    );


  btn.disabled =
    true;

  btn.textContent = 'Generando plan…';


  const el =
    document.getElementById(
      'resultado-plan'
    );


  ocultarErrorGeneracion();
  const detenerLoading = mostrarLoadingGeneracion();
  let generationSucceeded = false;
  generationController = new AbortController();
  const timeout = window.setTimeout(() => generationController.abort(), 70000);


  try{

    const res =
      await fetch(
        '/api/generar-plan-dos-semanas',
        {
          method:
            'POST',

          headers:{
            'Content-Type':
              'application/json'
          },

          signal: generationController.signal,

          body:
            JSON.stringify({
              objetivo,
              excludedIngredients,
              numeroComidas,
              diasSinRepetir
            })
        }
      );


    const payload = await res.json().catch(() => ({}));
    if(!res.ok || payload.error){
      throw new Error(payload.error || `El servidor respondió con estado ${res.status}.`);
    }

    plan = payload;


    semanaActiva =
      0;

    diaActivo =
      0;

    comidaActivaIdx =
      0;

    comprasTabActiva =
      'lista_compras_semana_1';

    categoriaCompraActiva =
      'todas';

    guardarPlanEnSesion();


    renderPlan();

    mostrarDashboard();
    generationSucceeded = true;

  }catch(error){

    console.error(
      error
    );


    plan = null;
    const mensaje = error.name === 'AbortError'
      ? 'La generación superó el tiempo de espera. Puedes reintentar sin perder tus preferencias.'
      : error.message || 'Ocurrió un error inesperado al generar el plan.';
    mostrarErrorGeneracion(mensaje);
    irAVista('config');

  }finally{

    window.clearTimeout(timeout);
    generationController = null;
    detenerLoading({ planReady:generationSucceeded });

    btn.disabled =
      false;

    btn.textContent =
      'Generar plan de 2 semanas';

  }

}


/* ---------------------------------------------------------
   RENDER PLAN
--------------------------------------------------------- */

function renderPlan(){

  const el =
    document.getElementById(
      'resultado-plan'
    );


  if(
    plan.error
  ){

    el.innerHTML =
      '<div class="card">' +

        '<p style="color:var(--danger)">' +

          '🛑 No se pudo generar la Semana ' +

          plan.semana +

          ': ' +

          plan.error +

        '</p>' +

      '</div>';

    return;

  }


  const semanas = [
    plan.semana_1,
    plan.semana_2
  ];


  const resumenes = [
    plan.resumen_global.semana_1,
    plan.resumen_global.semana_2
  ];


  const tabs =
    '<div class="semana-tabs">' +

    semanas.map(
      (s,i) =>

        '<div ' +
          'class="semana-tab' +
          (
            i === semanaActiva
              ? ' activo'
              : ''
          ) +
          '" ' +
          'onclick="cambiarSemana(' +
          i +
          ')' +
        '">' +

          'Semana ' +
          (i + 1) +

          '<span class="mini">' +

            resumenes[i].total_kcal +

            ' kcal totales' +

          '</span>' +

        '</div>'

    ).join('') +

    '</div>';


  const warningsHtml =
    renderExclusionWarnings();


  el.innerHTML =

    '<div class="plan-greeting">' +
      '<div>' +
        '<p class="hola">Buenos días</p>' +
        '<p class="sub">Este es tu plan de hoy.</p>' +
      '</div>' +
    '</div>' +

    warningsHtml +

    '<div class="card">' +

      tabs +

      '<div id="semana-contenido"></div>' +

    '</div>' +

    '<div class="resumenes-secundarios">' +
      '<div id="resumen-semana-contenido"></div>' +
      '<div id="resumen-global-contenido"></div>' +
    '</div>';


  renderSemanaActiva();

  renderResumenGlobal();

}


/* ---------------------------------------------------------
   WARNINGS EXCLUSIONES
--------------------------------------------------------- */

function renderExclusionWarnings(){

  if(
    !plan.warning_flag ||
    !Array.isArray(
      plan.exclusion_warnings
    ) ||
    !plan.exclusion_warnings.length
  ){

    return '';

  }


  return (
    '<div class="card">' +

      plan.exclusion_warnings.map(
        w =>

          '<div class="aviso ' +

          (
            w.severity ===
            'high'
              ? 'high'
              : ''
          ) +

          '">' +

            '⚠️ ' +
            w.message +

          '</div>'

      ).join('') +

      '<div class="diff">' +

        'Platillos afectados: <b>' +

        plan
          .exclusion_impacto
          .platillos_afectados +

        '</b> · Platillos disponibles: <b>' +

        plan
          .exclusion_impacto
          .platillos_disponibles +

        '</b>' +

      '</div>' +

    '</div>'
  );

}


/* ---------------------------------------------------------
   CAMBIAR SEMANA
--------------------------------------------------------- */

function cambiarSemana(i){

  semanaActiva =
    i;

  diaActivo =
    0;

  comidaActivaIdx =
    0;


  document
    .querySelectorAll(
      '.semana-tab'
    )
    .forEach(
      (t,idx) =>
        t.classList.toggle(
          'activo',
          idx === i
        )
    );


  renderSemanaActiva();

}


/* ---------------------------------------------------------
   DASHBOARD ACTIVO
--------------------------------------------------------- */

function dashboardDiasActivos(){

  return (
    semanaActiva === 0

      ? plan.dashboard_dias_semana_1

      : plan.dashboard_dias_semana_2
  );

}


/* ---------------------------------------------------------
   RENDER SEMANA
--------------------------------------------------------- */

function renderSemanaActiva(){

  const semana =
    plan[
      'semana_' +
      (
        semanaActiva +
        1
      )
    ];


  const cont =
    document.getElementById(
      'semana-contenido'
    );


  const tabsDias =
    '<div class="dias-tabs">' +

    semana.dias.map(
      (d,i) =>

        '<div ' +
          'class="dia-tab' +

          (
            i === diaActivo
              ? ' activo'
              : ''
          ) +

          '" ' +

          'onclick="cambiarDia(' +
          i +
          ')' +
        '">' +

          d.dia_semana +

          '<span class="mini">' +

            (
              d.error
                ? '⚠️'
                : d.totales.kcal +
                  ' kcal'
            ) +

          '</span>' +

        '</div>'

    ).join('') +

    '</div>';


  cont.innerHTML =

    tabsDias +

    '<div id="dia-contenido"></div>';


  renderDia();

  renderResumenSemana(
    semana
  );

}


/* ---------------------------------------------------------
   CAMBIAR DÍA
--------------------------------------------------------- */

function cambiarDia(i){

  diaActivo =
    i;

  comidaActivaIdx =
    0;


  document
    .querySelectorAll(
      '.dia-tab'
    )
    .forEach(
      (t,idx) =>
        t.classList.toggle(
          'activo',
          idx === i
        )
    );


  renderDia();

}


/* ---------------------------------------------------------
   RENDER DÍA
--------------------------------------------------------- */

function renderDia(){

  const semana =
    plan[
      'semana_' +
      (
        semanaActiva +
        1
      )
    ];


  const data =
    semana.dias[
      diaActivo
    ];


  const dashDias =
    dashboardDiasActivos();


  const dash =
    dashDias
      ? dashDias[
          diaActivo
        ]
      : null;


  const cont =
    document.getElementById(
      'dia-contenido'
    );


  if(
    data.error
  ){

    cont.innerHTML =
      '<div class="aviso danger">' +
        '🛑 ' +
        data.error +
      '</div>';

    return;

  }


  const comidas =
    dash
      ? dash.comidas
      : [];


  const d =
    data.diferencia_vs_objetivo;

  const obj =
    data.objetivo;

  const t =
    data.totales;


  // El día puede tener 3, 4 o 5 comidas: nunca asumimos 5.
  if(
    comidaActivaIdx >=
    comidas.length
  ){
    comidaActivaIdx = 0;
  }


  const resumenHtml =
    macroMiniGridHTML(t, obj) +

    '<div class="plan-status-row">' +

      '<span class="badge ' +
        (data.factible ? 'ok' : 'bad') +
      '">' +
        (
          data.factible
            ? '✅ Dentro de tolerancia'
            : '⚠️ Fuera de tolerancia'
        ) +
      '</span>' +

      '<span class="diff">' +
        'Diferencia: ' +
        '<b>' + fmt(d.kcal) + ' kcal</b>, ' +
        '<b>' + fmt(d.proteina) + 'g P</b>, ' +
        '<b>' + fmt(d.carbos) + 'g C</b>, ' +
        '<b>' + fmt(d.grasa) + 'g G</b>' +
      '</span>' +

    '</div>' +

    (
      !data.factible &&
      data.explicacion_no_factible

        ? '<div class="aviso danger">' +
            '🛑 ' +
            data.explicacion_no_factible +
          '</div>'

        : ''
    );


  cont.innerHTML =

    resumenHtml +

    '<div class="meal-strip" id="meal-strip">' +
      comidas.map(
        (c,i) =>
          mealChipHTML(c, i, i === comidaActivaIdx)
      ).join('') +
    '</div>' +

    '<div id="comida-activa-contenido"></div>';


  renderComidaActiva(comidas);

}


/* ---------------------------------------------------------
   RESUMEN DIARIO — MACRO MINI-CARDS
--------------------------------------------------------- */

function macroMiniGridHTML(t, obj){

  function mini(clase, label, real, objetivo, unidad){

    const pct =
      objetivo > 0
        ? Math.min(100, Math.round((real / objetivo) * 100))
        : 0;

    return (
      '<div class="macro-mini ' + clase + '">' +
        '<div class="top">' +
          '<span class="label">' + label + '</span>' +
        '</div>' +
        '<div class="value">' +
          '<b>' + real + unidad + '</b> / ' + objetivo + unidad +
        '</div>' +
        '<div class="bar-track" style="margin-top:8px">' +
          '<div class="bar-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
      '</div>'
    );

  }

  return (
    '<div class="macro-mini-grid">' +
      mini('kcal', 'Kcal', t.kcal, obj.kcal, '') +
      mini('p', 'Proteína', t.proteina, obj.proteina, 'g') +
      mini('c', 'Carbohidratos', t.carbos, obj.carbos, 'g') +
      mini('g', 'Grasa', t.grasa, obj.grasa, 'g') +
    '</div>'
  );

}


/* ---------------------------------------------------------
   TIRA DE COMIDAS DEL DÍA (dinámica: 3, 4 o 5 comidas)
--------------------------------------------------------- */

function mealThumbSrc(c){

  return window.MacroBalanceAssets.dish(c);

}


function mealChipHTML(c, idx, activo){

  const src =
    mealThumbSrc(c);

  return (
    '<button type="button" ' +
      'class="meal-chip' + (activo ? ' activo' : '') + '" ' +
      'onclick="seleccionarComida(' + idx + ')" ' +
      'aria-pressed="' + activo + '"' +
    '>' +

      '<div class="thumb">' +
        (
          src
            ? (
                '<img src="' + src + '" alt="' + (c.nombre || '') + '" ' +
                'loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
                '<span class="fallback">🍽️</span>'
              )
            : '<span class="fallback" style="display:flex">🍽️</span>'
        ) +
      '</div>' +

      '<div class="info">' +
        '<div class="tipo">' + (c.tiempo_comida || '') + '</div>' +
        '<div class="nombre">' + (c.nombre || '') + '</div>' +
        '<div class="kcal">' + (c.macros ? c.macros.kcal : 0) + ' kcal</div>' +
      '</div>' +

    '</button>'
  );

}


function seleccionarComida(idx){

  comidaActivaIdx =
    idx;

  document
    .querySelectorAll('#meal-strip .meal-chip')
    .forEach((el,i) => {
      el.classList.toggle('activo', i === idx);
      el.setAttribute('aria-pressed', String(i === idx));
    });

  renderComidaActiva(
    comidasDelDiaActivo()
  );

}


function comidasDelDiaActivo(){

  const dashDias =
    dashboardDiasActivos();

  const dash =
    dashDias
      ? dashDias[diaActivo]
      : null;

  return dash ? dash.comidas : [];

}


/* ---------------------------------------------------------
   COMIDA ACTIVA — HERO CON FOTO, FLECHAS Y DATOS
--------------------------------------------------------- */

function renderComidaActiva(comidas){

  const cont =
    document.getElementById(
      'comida-activa-contenido'
    );

  if(!cont){
    return;
  }

  if(
    !comidas ||
    comidas.length === 0
  ){
    cont.innerHTML =
      '<div class="empty">Sin comidas para este día.</div>';
    return;
  }

  const html =
    comidaActivaHTML(
      comidas[comidaActivaIdx],
      comidaActivaIdx,
      comidas.length
    );

  const reduceMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const existente =
    cont.querySelector('.comida-activa');

  if(!existente || reduceMotion){
    cont.innerHTML = html;
    return;
  }

  // Transición sutil (fade + slide, ~200ms), respeta prefers-reduced-motion.
  existente.classList.add('transicionando');

  setTimeout(() => {
    cont.innerHTML = html;
  }, 180);

}


function irComida(delta){

  const comidas =
    comidasDelDiaActivo();

  if(!comidas.length){
    return;
  }

  const nuevo =
    comidaActivaIdx + delta;

  if(
    nuevo < 0 ||
    nuevo >= comidas.length
  ){
    return;
  }

  seleccionarComida(nuevo);

}


function comidaActivaHTML(c, idx, total){

  const src =
    mealThumbSrc(c);

  const ingredientesHtml =
    (c.ingredientes || [])
      .map(i =>
        '<div class="ingr-fila">' +
          '<span class="nombre">' + i.nombre + '</span>' +
          '<span class="cantidad">' + i.cantidad + ' ' + i.unidad + '</span>' +
        '</div>'
      )
      .join('');

  return (

    '<div class="comida-activa">' +

      '<div class="hero-photo">' +

        (
          idx > 0
            ? '<button class="hero-nav-arrow left" onclick="irComida(-1)" aria-label="Comida anterior">‹</button>'
            : '<button class="hero-nav-arrow left" disabled aria-label="Comida anterior">‹</button>'
        ) +

        (
          idx < total - 1
            ? '<button class="hero-nav-arrow right" onclick="irComida(1)" aria-label="Comida siguiente">›</button>'
            : '<button class="hero-nav-arrow right" disabled aria-label="Comida siguiente">›</button>'
        ) +

        (
          src
            ? (
                '<img src="' + src + '" alt="' + (c.nombre || '') + '" ' +
                'onerror="console.error(\'Imagen no encontrada:\', this.src);this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
                '<span class="fallback">🍽️</span>'
              )
            : '<span class="fallback" style="display:flex">🍽️</span>'
        ) +

        '<div class="hero-overlay">' +
          '<div class="tipo">' + (c.tiempo_comida || '') + '</div>' +
          '<div class="nombre">' + (c.nombre || '') + '</div>' +
        '</div>' +

      '</div>' +

      '<div class="data-panel">' +

        '<div class="kcal-row">' +
          '<span class="kcal-num">' + c.macros.kcal + ' kcal</span>' +
        '</div>' +

        '<div class="macro-row-vivo">' +
          '<div class="macro-vivo-pill p"><div class="v">' + c.macros.p + 'g</div><div class="l">Proteína</div></div>' +
          '<div class="macro-vivo-pill c"><div class="v">' + c.macros.c + 'g</div><div class="l">Carbos</div></div>' +
          '<div class="macro-vivo-pill g"><div class="v">' + c.macros.g + 'g</div><div class="l">Grasa</div></div>' +
        '</div>' +

        '<div class="ingredientes-title">Ingredientes</div>' +

        ingredientesHtml +

      '</div>' +

    '</div>'

  );

}


/* ---------------------------------------------------------
   RESUMEN SEMANA
--------------------------------------------------------- */

function renderResumenSemana(
  semana
){

  const cont =
    document.getElementById(
      'resumen-semana-contenido'
    );


  const obj =
    semana.objetivo_semanal;

  const real =
    semana.resultado_semanal;

  const dif =
    semana.diferencia_semanal;


  const promedio =
    Math.round(
      (
        real.kcal /
        semana.dias.length
      ) *
      10
    ) /
    10;


  cont.innerHTML =

    '<div class="resumen-semana">' +

      '<h3>' +
        'Resumen de esta semana' +
      '</h3>' +

      '<div class="resumen-fila">' +
        '<span class="et">' +
          'Objetivo semanal' +
        '</span>' +
        '<span>' +
          obj.kcal +
          ' kcal' +
        '</span>' +
      '</div>' +

      '<div class="resumen-fila">' +
        '<span class="et">' +
          'Total real (7 días)' +
        '</span>' +
        '<span>' +
          real.kcal +
          ' kcal' +
        '</span>' +
      '</div>' +

      '<div class="resumen-fila">' +
        '<span class="et">' +
          'Diferencia' +
        '</span>' +
        '<span>' +
          fmt(
            dif.kcal
          ) +
          ' kcal' +
        '</span>' +
      '</div>' +

      '<div class="resumen-fila">' +
        '<span class="et">' +
          'Promedio diario' +
        '</span>' +
        '<span>' +
          promedio +
          ' kcal/día' +
        '</span>' +
      '</div>' +

      '<div class="resumen-fila">' +
        '<span class="et">' +
          'Días fuera de tolerancia' +
        '</span>' +
        '<span>' +
          semana.dias_no_factibles +
          ' de ' +
          semana.dias.length +
        '</span>' +
      '</div>' +

    '</div>';

}


/* ---------------------------------------------------------
   RESUMEN GLOBAL
--------------------------------------------------------- */

function renderResumenGlobal(){

  const cont =
    document.getElementById(
      'resumen-global-contenido'
    );


  const g =
    plan
      .resumen_global
      .total_14_dias;


  const v =
    plan
      .variedad_entre_semanas;


  cont.innerHTML =

    '<div class="card">' +

      '<h2>' +
        'Total 14 días (solo informativo)' +
      '</h2>' +

      '<div class="bars">' +

        '<div class="bar-block">' +
          '<div class="l">' +
            '<span>Kcal</span>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:800">' +
            g.kcal +
          '</div>' +
        '</div>' +

        '<div class="bar-block">' +
          '<div class="l">' +
            '<span>Proteína</span>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:800">' +
            g.proteina +
            'g' +
          '</div>' +
        '</div>' +

        '<div class="bar-block">' +
          '<div class="l">' +
            '<span>Carbos</span>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:800">' +
            g.carbos +
            'g' +
          '</div>' +
        '</div>' +

        '<div class="bar-block">' +
          '<div class="l">' +
            '<span>Grasa</span>' +
          '</div>' +
          '<div style="font-size:18px;font-weight:800">' +
            g.grasa +
            'g' +
          '</div>' +
        '</div>' +

      '</div>' +

      '<div class="diff" style="margin-top:12px">' +

        'Promedio diario (14 días): ' +

        '<b>' +
          g.promedio_kcal_dia +
          ' kcal/día' +
        '</b>' +

      '</div>' +

      (
        v

          ? (
              '<div class="diff">' +

                'Platillos distintos — Semana 1: ' +

                v.platillos_distintos_semana_1 +

                ' · Semana 2: ' +

                v.platillos_distintos_semana_2 +

                (
                  v.platillos_repetidos_en_ambas_semanas

                    ? (
                        ' · Repetidos en ambas semanas: ' +
                        v.platillos_repetidos_en_ambas_semanas
                      )

                    : ' · Sin repetidos entre semanas'
                ) +

              '</div>'
            )

          : ''
      ) +

      '<div class="diff">' +

        (
          plan.resumen_global.nota ||
          ''
        ) +

      '</div>' +

    '</div>';

}


/* ---------------------------------------------------------
   LISTA COMPRAS
--------------------------------------------------------- */

const COMPRAS_TABS = [

  {
    key:
      'lista_compras_semana_1',

    label:
      'Semana 1'
  },

  {
    key:
      'lista_compras_semana_2',

    label:
      'Semana 2'
  },

  {
    key:
      'lista_compras_14_dias',

    label:
      '14 días'
  }

];


const NOMBRES_CAT_COMPRAS = {

  proteinas:
    'Proteínas',

  cereales:
    'Cereales / carbohidratos',

  verduras:
    'Verduras',

  frutas:
    'Frutas',

  leguminosas:
    'Leguminosas',

  lacteos:
    'Lácteos',

  grasas:
    'Grasas',

  otros:
    'Otros'

};


/* ---------------------------------------------------------
   RENDER COMPRAS
--------------------------------------------------------- */

function renderListaCompras(){

  const cont =
    document.getElementById(
      'resultado-compras'
    );

  if(!cont){
    return;
  }


  if(
    !plan ||
    !plan.lista_compras_semana_1
  ){

    cont.innerHTML =
      '<div class="empty">Sin datos</div>';

    return;

  }


  // ============================================================
  // FUTURO:
  // La estructura Semana 1 / Semana 2 / 14 días puede cambiar
  // después de validar nuevos modos del motor con Codex.
  // Mantener esta navegación desacoplada de la lógica visual.
  // ============================================================

  const tabsHtml =

    '<div class="compras-tabs">' +

    COMPRAS_TABS.map(
      t =>

        '<div ' +

          'class="compras-tab' +

          (
            t.key ===
            comprasTabActiva_full()

              ? ' activo'
              : ''
          ) +

          '" ' +

          'onclick="cambiarComprasTab(\'' +

          t.key +

          '\')"' +

        '>' +

          t.label +

        '</div>'

    ).join('') +

    '</div>';


  cont.innerHTML =

    '<div class="card">' +

      tabsHtml +

      '<div id="compras-layout"></div>' +

    '</div>';


  pintarComprasGrid();

}


/* ---------------------------------------------------------
   TAB ACTIVA COMPRAS
--------------------------------------------------------- */

function comprasTabActiva_full(){

  return comprasTabActiva;

}


/* ---------------------------------------------------------
   CAMBIAR TAB COMPRAS
--------------------------------------------------------- */

function cambiarComprasTab(key){

  comprasTabActiva =
    key;

  categoriaCompraActiva =
    'todas';


  document
    .querySelectorAll(
      '.compras-tab'
    )
    .forEach(
      t => {

        const encontrada =
          COMPRAS_TABS.find(
            x =>
              x.key === key
          );

        t.classList.toggle(
          'activo',
          encontrada &&
          t.textContent ===
          encontrada.label
        );

      }
    );


  pintarComprasGrid();

}


/* ---------------------------------------------------------
   PINTAR LISTA COMPRAS
--------------------------------------------------------- */

// Imagen real del insumo. Regla fija: food.id -> /assets/foods/{food.id}.jpe
// NUNCA por índice o posición del array.
function compraImgSrc(foodId){

  return window.MacroBalanceAssets.food(foodId);

}


function compraRowHTML(it){

  const foodId =
    it.food_id ||
    it.id ||
    '';

  const src =
    foodId
      ? compraImgSrc(foodId)
      : '';

  return (

    '<div class="compras-row">' +

      '<div class="thumb">' +
        (
          src
            ? (
                '<img src="' + src + '" alt="' + (it.nombre || '') + '" ' +
                'loading="lazy" decoding="async" ' +
                'onerror="console.warn(\'Imagen de insumo no encontrada:\', this.src);' +
                'this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">' +
                '<span class="fallback">🥗</span>'
              )
            : '<span class="fallback" style="display:flex">🥗</span>'
        ) +
      '</div>' +

      '<span class="nombre">' +
        (it.nombre || it.food_id || 'Ingrediente') +
      '</span>' +

      '<span class="cant">' +

        (
          it.display ||
          (it.gramos !== undefined ? it.gramos + ' g' : '')
        ) +

        (
          it.aprox_piezas
            ? '<small>' + it.aprox_piezas + '</small>'
            : ''
        ) +

      '</span>' +

    '</div>'

  );

}


function pintarComprasGrid(){

  const layout =
    document.getElementById(
      'compras-layout'
    );

  if(!layout){
    return;
  }

  const lista =
    plan[
      comprasTabActiva
    ];

  if(
    !lista ||
    typeof lista !== 'object'
  ){

    layout.innerHTML =
      '<div class="empty">' +
        'Sin datos' +
      '</div>';

    return;
  }


  /*
   * IMPORTANTE:
   * La lista puede traer otros campos además de categorías.
   * Solo intentamos renderizar propiedades que realmente sean arrays.
   */

  const categorias =
    Object.keys(
      lista
    )
    .filter(
      k =>
        Array.isArray(
          lista[k]
        ) &&
        lista[k].length >
        0
    );


  if(
    categorias.length ===
    0
  ){

    layout.innerHTML =
      '<div class="empty">' +
        'Sin ingredientes' +
      '</div>';

    return;
  }


  if(
    categoriaCompraActiva !== 'todas' &&
    !categorias.includes(categoriaCompraActiva)
  ){
    categoriaCompraActiva = 'todas';
  }


  const sidebarHtml =

    '<div class="compras-cat-sidebar">' +

      catBotonHTML(
        'todas',
        'Todas',
        categorias.reduce(
          (acc, c) => acc + lista[c].length,
          0
        )
      ) +

      categorias.map(
        cat =>
          catBotonHTML(
            cat,
            NOMBRES_CAT_COMPRAS[cat] || cat,
            lista[cat].length
          )
      ).join('') +

    '</div>';


  const categoriasAMostrar =
    categoriaCompraActiva === 'todas'
      ? categorias
      : [categoriaCompraActiva];


  const mainHtml =

    '<div class="compras-main">' +

      categoriasAMostrar.map(
        cat =>

          '<div class="compras-cat-heading">' +
            (NOMBRES_CAT_COMPRAS[cat] || cat) +
          '</div>' +

          lista[cat]
            .map(compraRowHTML)
            .join('')

      ).join('') +

    '</div>';


  layout.innerHTML =

    '<div class="compras-layout">' +
      sidebarHtml +
      mainHtml +
    '</div>';

}


function catBotonHTML(key, label, count){

  return (
    '<button ' +
      'class="compras-cat-btn' +
      (key === categoriaCompraActiva ? ' activo' : '') +
      '" ' +
      'onclick="cambiarCategoriaCompra(\'' + key + '\')"' +
    '>' +
      label +
      '<span class="n">(' + count + ')</span>' +
    '</button>'
  );

}


function cambiarCategoriaCompra(key){

  categoriaCompraActiva =
    key;

  pintarComprasGrid();

}


/* ---------------------------------------------------------
   FORMAT
--------------------------------------------------------- */

function fmt(n){

  return (
    n > 0
      ? '+'
      : ''
  ) + n;

}


/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */

function objetivoDesdeGoal(goal){
  const result = goal?.result;
  if(!result) return null;
  const objective = {
    kcal: Number(result.kcal),
    proteina: Number(result.proteina),
    carbos: Number(result.carbos),
    grasa: Number(result.grasa)
  };
  return Object.values(objective).every(value => Number.isFinite(value) && value > 0)
    ? objective
    : null;
}


function pintarObjetivoActivo(){
  Object.entries(objetivoActivo).forEach(([key, value]) => {
    const id = key === 'proteina'
      ? 'obj-proteina'
      : key === 'carbos'
        ? 'obj-carbos'
        : key === 'grasa'
          ? 'obj-grasa'
          : 'obj-kcal';
    document.getElementById(id).textContent = Math.round(value);
  });
  actualizarConsistenciaObjetivo();
}


async function aplicarEstadoSesion(state){
  document.getElementById('session-loading').hidden = true;
  document.getElementById('auth-required').hidden = true;
  document.getElementById('goal-required').hidden = true;
  document.getElementById('plan-product').hidden = true;

  if(!state?.user){
    document.getElementById('auth-required').hidden = false;
    return;
  }

  objetivoActivo = objetivoDesdeGoal(state.currentGoal);
  if(!objetivoActivo){
    document.getElementById('goal-required').hidden = false;
    return;
  }

  usuarioActivoId = state.user.uid;
  pintarObjetivoActivo();
  document.getElementById('plan-product').hidden = false;
  restaurarPlanDeSesion(state.currentGoal.id);

  try{
    await cargarAlimentos();
    aplicarEstadoExclusionEnGaleria();
    actualizarContador();
  }catch(error){
    mostrarErrorGeneracion(error.message);
  }

  const route = window.location.hash.slice(1);
  irAVista(['config', 'plan', 'compras'].includes(route) ? route : 'config', false);
}


document.querySelectorAll('[data-plan-nav]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    irAVista(link.dataset.planNav);
  });
});

window.addEventListener('hashchange', () => {
  const route = window.location.hash.slice(1);
  if(['config', 'plan', 'compras'].includes(route)) irAVista(route, false);
});

window.addEventListener('macrobalance:auth-changed', event => {
  aplicarEstadoSesion(event.detail);
});

(async function iniciarProducto(){
  if(window.macroBalanceAuthReady){
    const state = await window.macroBalanceAuthReady;
    await aplicarEstadoSesion(state);
    return;
  }
  window.addEventListener('macrobalance:firebase-ready', event => {
    aplicarEstadoSesion(event.detail);
  }, { once:true });
})();
