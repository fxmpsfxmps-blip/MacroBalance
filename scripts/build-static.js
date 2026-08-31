const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const expectedOutput = path.resolve(root, 'dist');

if (path.resolve(output) !== expectedOutput || !output.startsWith(root + path.sep)) {
  throw new Error('La carpeta de salida no es segura.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of [
  'index.html',
  'plan.html',
  'multimedia.html',
  'calculadora.js',
  'firebase-init.js',
  'robots.txt',
  'sitemap.xml'
]) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

const localVideoSources = new Set([
  '13372516_1080_1920_30fps.mp4',
  '14597490_2160_3840_60fps.mp4',
  '16405602_2160_3840_59fps.mp4',
  '8431888-uhd_2160_4096_25fps.mp4'
]);

for (const directory of ['media', 'assets', 'styles', 'js']) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), {
    recursive: true,
    filter: source => {
      if (directory !== 'media' || fs.statSync(source).isDirectory()) return true;
      const name = path.basename(source);
      return !localVideoSources.has(name);
    }
  });
}

// The promoted Standard loads the byte-frozen PATCH3 candidate through an
// explicit browser adapter. Only the adapter and frozen scientific snapshot
// are public static assets; Shadow transport/telemetry remains server-side.
fs.cpSync(path.join(root, 'lib', 'standard'), path.join(output, 'lib', 'standard'), { recursive: true });
fs.cpSync(path.join(root, 'lib', 'shadow', 'frozen-patch3'), path.join(output, 'lib', 'shadow', 'frozen-patch3'), { recursive: true });
// V3 longitudinal modules are browser-side, feature-gated infrastructure. They
// do not modify the Standard calculator and remain dormant by default.
fs.cpSync(path.join(root, 'lib', 'longitudinal'), path.join(output, 'lib', 'longitudinal'), { recursive: true });
fs.cpSync(path.join(root, 'lib', 'hydration'), path.join(output, 'lib', 'hydration'), { recursive: true });
// Dashboard exports consume already-authoritative plan objects. The browser
// receives only their renderer/serializer plus pinned local vendor modules;
// the export path never imports a calculator or the menu engine.
fs.cpSync(path.join(root, 'lib', 'export'), path.join(output, 'lib', 'export'), { recursive: true });
fs.mkdirSync(path.join(output, 'vendor'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.esm.min.js'),
  path.join(output, 'vendor', 'pdf-lib.esm.min.js')
);
fs.copyFileSync(
  path.join(root, 'node_modules', 'fflate', 'esm', 'browser.js'),
  path.join(output, 'vendor', 'fflate.esm.js')
);

function strictBoolean(value, fallback) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}
function strictBps(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : 0;
}
const publicKillSwitch = strictBoolean(process.env.MB_SHADOW_KILL_SWITCH, true);
const publicSampleBps = strictBps(process.env.MB_SHADOW_SAMPLE_BPS);
const publicRequested = strictBoolean(process.env.MB_SHADOW_CLIENT_ENABLED, false);
const publicConfig = {
  schemaVersion: 'shadow-public-config-v1',
  clientEnabled: publicRequested && !publicKillSwitch && publicSampleBps > 0,
  killSwitch: publicKillSwitch,
  sampleBps: publicSampleBps,
  endpoint: '/api/shadow-evaluate',
  integrationVersion: 'shadow-deployment-integration-0.1.0',
};
fs.writeFileSync(path.join(output, 'js', 'shadow-runtime-config.js'),
  `window.__MB_SHADOW_CONFIG__ = Object.freeze(${JSON.stringify(publicConfig)});\n`);

const publicLongitudinalRequested = strictBoolean(process.env.V3_LONGITUDINAL_ENABLED, false);
const publicLongitudinalConfig = {
  schemaVersion: 'v3-longitudinal-public-config-v1',
  enabled: publicLongitudinalRequested,
  feature: 'V3_LONGITUDINAL_FOUNDATION',
  mode: publicLongitudinalRequested ? 'ENABLED' : 'DISABLED',
};
fs.writeFileSync(path.join(output, 'js', 'v3-longitudinal-runtime-config.js'),
  `window.__MB_V3_LONGITUDINAL_CONFIG__ = Object.freeze(${JSON.stringify(publicLongitudinalConfig)});\n`);

const publicLowBodySizePreflightRequested = strictBoolean(process.env.LOW_BODY_SIZE_PREFLIGHT_V1_ENABLED, false);
const publicLowBodySizePreflightConfig = {
  schemaVersion: 'low-body-size-preflight-public-config-v1',
  enabled: publicLowBodySizePreflightRequested,
  feature: 'LOW_BODY_SIZE_PREFLIGHT_V1_ENABLED',
  mode: publicLowBodySizePreflightRequested ? 'SHADOW_UI' : 'SHADOW_SILENT',
};
fs.writeFileSync(path.join(output, 'js', 'low-body-size-preflight-runtime-config.js'),
  `window.__MB_LOW_BODY_SIZE_PREFLIGHT_CONFIG__ = Object.freeze(${JSON.stringify(publicLowBodySizePreflightConfig)});\n`);

for (const file of fs.readdirSync(root).filter(name => /^PLT_[A-Z]+_\d+\.jpg$/i.test(name))) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log(`Sitio estático preparado en ${output}`);
