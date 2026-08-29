const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('cada alimento y platillo tiene su recurso visual', () => {
  const foods = require('../lib/menu-engine/data/foods.json');
  const dishes = require('../lib/menu-engine/data/dishes.json');
  for (const food of foods) {
    const file = path.join(root, 'assets', 'foods', `${food.id}.jpe`);
    assert.ok(fs.existsSync(file), food.id);
    assert.ok(fs.statSync(file).size < 200 * 1024, `${food.id} excede 200 KB`);
  }
  for (const dish of dishes) {
    const file = path.join(root, `${dish.dish_id}.jpg`);
    assert.ok(fs.existsSync(file), dish.dish_id);
    assert.ok(fs.statSync(file).size < 200 * 1024, `${dish.dish_id} excede 200 KB`);
  }
});

test('la configuración consume un objetivo activo de sólo lectura', () => {
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  assert.match(html, /<output id="obj-kcal">/);
  assert.doesNotMatch(html, /<input[^>]+id="obj-kcal"/);
  assert.match(app, /objetivoActivo/);
  assert.doesNotMatch(app, /cost_tier/);
  assert.match(html, /id="custom-recipe-extension"/);
});

test('la configuración advierte que las selecciones excluyen alimentos del plan completo', () => {
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');

  assert.match(html, /id="exclusion-notice"/);
  assert.match(html, /se excluirá de todas las comidas de tu plan de 14 días/i);
  assert.match(app, /has-exclusions/);
});

test('la generación audiovisual conserva posters y limita la carga móvil a un video', () => {
  const html = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  const panels = html.match(/data-generation-panel/g) || [];

  assert.equal(panels.length, 4);
  assert.equal((html.match(/data-video-src="\/media\/transition-[^"]+\.mp4"/g) || []).length, 4);
  assert.equal((html.match(/data-poster-src="\/media\/transition-[^"]+\.webp"/g) || []).length, 4);
  assert.match(html, /<video autoplay muted loop playsinline preload="none"/);
  assert.doesNotMatch(html, /<video[^>]+\ssrc=/);
  assert.doesNotMatch(html, /role="progressbar"/);
  assert.doesNotMatch(html, /generation-elapsed/);
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.doesNotMatch(html, />\s*\d+%\s*</);
  assert.match(app, /window\.matchMedia\('\(pointer: coarse\)'\)\.matches/);
  assert.match(app, /activateMobilePanel\(selectedMobilePanel\)/);
  assert.match(app, /panels\.forEach\(loadPanel\)/);
  assert.match(app, /removeAttribute\('src'\)/);
  assert.match(html, /data-generation-prev/);
  assert.match(html, /data-generation-next/);
  assert.match(html, /data-generation-manual-play/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /needs-play/);
  assert.doesNotMatch(html, /generation-ready__arrow/);
  assert.doesNotMatch(html, /Desliza para descubrirlo/);
  assert.match(html, /generation-ready__action/);
  assert.match(html, /Ver mi plan[\s\S]*→/);

  for (const name of ['lifestyle', 'running', 'bodybuilding', 'fitness']) {
    const video = path.join(root, 'media', `transition-${name}.mp4`);
    const poster = path.join(root, 'media', `transition-${name}.webp`);
    assert.ok(fs.existsSync(video), name);
    assert.ok(fs.statSync(video).size < 8 * 1024 * 1024, `${name} excede 8 MB`);
    assert.ok(fs.existsSync(poster), `${name} no tiene poster`);
    assert.ok(fs.statSync(poster).size < 200 * 1024, `${name} poster excede 200 KB`);
  }
});

test('branding, perfil e historial reflejan el producto actual', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'styles', 'shared.css'), 'utf8');
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');

  assert.doesNotMatch(html, /Próximamente/i);
  assert.match(html, /Disponible ahora/);
  assert.match(shared, /\.site-brand b\s*\{\s*color:\s*inherit/);
  assert.match(html, /id="cuenta-sexo"/);
  assert.match(calculator, /\{ sexo: sexo \}/);
  assert.match(calculator, /eliminarObjetivoHistorial\(this\)/);
  assert.match(firebase, /eliminarObjetivoHistorialFirestore/);
  assert.match(firebase, /runTransaction/);
  assert.match(firebase, /goalId === currentId/);
  assert.match(firebase, /transaction\.delete\(goalRef\)/);
});

test('V2.1 expone el Standard promovido y retira Precision de la ruta visible', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const core = fs.readFileSync(path.join(root, 'js', 'calculator-core.js'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');

  assert.match(html, /id="mode-standard"/);
  assert.match(html, /id="precision-fields"/);
  assert.doesNotMatch(html, /id="mode-precision"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /\/js\/calculator-core\.js/);
  assert.match(calculator, /calculationMode === 'precision'/);
  assert.match(calculator, /STANDARD_CALC_VERSION/);
  assert.match(core, /TARGET_SCHEMA_VERSION = '2\.1'/);
  assert.match(core, /weeklyTarget:[\s\S]*strategy: 'uniform'/);
  assert.match(firebase, /nutritionTargetVersion/);
  assert.match(firebase, /calculationMode/);
});

test('las reglas V2 limitan datos por uid y protegen el objetivo activo', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /request\.auth\.uid == userId/);
  assert.match(rules, /match \/goals_history\/\{goalId\}/);
  assert.match(rules, /get\('currentObjectiveId', null\) != goalId/);
  assert.match(rules, /allow delete: if false/);
});

test('el sistema visual final reutiliza la Calculadora y conecta Mi Plan con compras', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const plan = fs.readFileSync(path.join(root, 'plan.html'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'styles', 'shared.css'), 'utf8');
  const menu = fs.readFileSync(path.join(root, 'styles', 'menu.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  const hero = fs.readFileSync(path.join(root, 'js', 'hero-video.js'), 'utf8');

  assert.match(shared, /--mb-bg:\s*#050505/);
  assert.match(shared, /--mb-panel:\s*#101010/);
  assert.match(shared, /--mb-border:\s*#1c1c1c/);
  assert.match(shared, /--mb-radius:\s*2px/);
  assert.match(menu, /#session-loading[\s\S]*background:transparent/);
  assert.match(plan, /session-loading__pulse/);
  assert.match(app, /function resumenCompras14Dias/);
  assert.match(app, /plan-shopping-entry/);
  assert.match(app, /lista_compras_14_dias/);
  assert.doesNotMatch(html, /hero-video-play/);
  assert.doesNotMatch(html, />\s*Reproducir video\s*</);
  assert.match(hero, /video\.addEventListener\('canplay', retryWhenReady\)/);
  assert.match(hero, /window\.addEventListener\('pageshow'/);
});

test('los avisos no factibles conservan información con jerarquía secundaria', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'menu-app.js'), 'utf8');
  assert.match(app, /<details class="ajuste-details">/);
  assert.match(app, /data\.explicacion_no_factible/);
  assert.doesNotMatch(app, /'🛑 '\s*\+\s*data\.explicacion_no_factible/);
});

test('Firebase centraliza sesión persistente y los seis proveedores', () => {
  const firebase = fs.readFileSync(path.join(root, 'firebase-init.js'), 'utf8');
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(firebase, /setPersistence\(auth, browserLocalPersistence\)/);
  assert.match(firebase, /onAuthStateChanged\(auth/);
  assert.match(firebase, /createOAuthCoordinator/);
  for (const provider of ['Google', 'Facebook', 'Microsoft', 'Apple', 'GitHub', 'X']) {
    assert.match(html, new RegExp(`data-auth-provider="${provider}"`));
  }
  assert.match(calculator, /cerrarModalAuth\(\)/);
  assert.match(calculator, /esRutaMacros\(\)/);
});

test('el aviso de autenticación V2.1 es cancelable sin alterar Firebase Auth', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const calculator = fs.readFileSync(path.join(root, 'calculadora.js'), 'utf8');

  assert.match(html, /id="auth-modal-close"/);
  assert.match(html, /Cerrar ventana de autenticación/);
  assert.match(html, /Crea tu cuenta/);
  assert.match(html, /Necesitas iniciar sesión para guardar tu progreso y continuar/);
  assert.match(html, /Inicia sesión para continuar con tu plan/);
  assert.match(calculator, /function mostrarModalAuth\(/);
  assert.match(calculator, /event\.key === 'Escape'/);
  assert.match(calculator, /authModalReturnFocus/);
  assert.match(calculator, /event\.target === event\.currentTarget/);
  assert.match(calculator, /if\(!state\?\.user\)/);
});

test('Media, SEO y rutas públicas forman parte del build', () => {
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const media = fs.readFileSync(path.join(root, 'multimedia.html'), 'utf8');
  const gallery = fs.readFileSync(path.join(root, 'js', 'media-gallery.js'), 'utf8');
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-static.js'), 'utf8');
  const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
  const socialPreview = path.join(root, 'media', 'social-preview.jpg');

  assert.equal((media.match(/data-media-src=/g) || []).length, 5);
  assert.doesNotMatch(media, /<video[^>]+\ssrc=/);
  assert.match(gallery, /video\.src = video\.dataset\.mediaSrc/);
  assert.match(build, /'multimedia\.html'/);
  assert.match(build, /'robots\.txt'/);
  assert.match(build, /'sitemap\.xml'/);
  assert.match(vercel, /"source": "\/macros"/);
  assert.match(home, /property="og:image" content="https:\/\/macro-balance-iota\.vercel\.app\/media\/social-preview\.jpg"/);
  assert.match(home, /property="og:image:width" content="1200"/);
  assert.match(home, /property="og:image:height" content="630"/);
  assert.ok(fs.existsSync(socialPreview));
  assert.ok(fs.statSync(socialPreview).size < 300 * 1024, 'La imagen social excede 300 KB');
  assert.match(vercel, /"source": "\/media\/social-preview\.jpg"/);
});
