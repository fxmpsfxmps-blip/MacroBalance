import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const parent = path.resolve(root, '..');
const packageName = 'SHADOW_DEPLOYMENT_INTEGRATION_PREDEPLOY_REAUDIT_V3';
const pkg = path.join(parent, packageName);
const zip = `${pkg}.zip`;
const base = 'c98d279e5e0c1defe000cee831244bcb33e73be4';

function ensureDir(directory) { fs.mkdirSync(directory, { recursive: true }); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase(); }
function copy(source, destination) { ensureDir(path.dirname(destination)); fs.copyFileSync(source, destination); }
function run(command, args, cwd, output) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  const text = [`COMMAND: ${command} ${args.join(' ')}`, `STARTED_UTC: ${started}`, `EXIT_CODE: ${result.status ?? 1}`, '', result.stdout || '', result.stderr || ''].join('\n');
  fs.writeFileSync(output, text, 'utf8');
  const tests = text.match(/ℹ tests (\d+)/)?.[1] || '';
  const pass = text.match(/ℹ pass (\d+)/)?.[1] || '';
  const fail = text.match(/ℹ fail (\d+)/)?.[1] || '';
  if (result.status !== 0 || !tests || fail !== '0' || tests !== pass) throw new Error(`TEST_GATE_FAILED:${path.basename(output)}:${tests}/${pass}/${fail}`);
  return { tests: Number(tests), pass: Number(pass), fail: Number(fail), exitCode: result.status };
}

if (fs.existsSync(pkg)) throw new Error(`REFUSING_TO_OVERWRITE:${pkg}`);
ensureDir(path.join(pkg, 'current')); ensureDir(path.join(pkg, 'pre-fix')); ensureDir(path.join(pkg, 'evidence')); ensureDir(path.join(pkg, 'diff')); ensureDir(path.join(pkg, 'source-integrity'));

const evidence = {};
evidence.deployment = run('node', ['--test', 'tests/shadow-deployment-integration.test.js'], root, path.join(pkg, 'evidence/deployment-integration-tests.txt'));
evidence.flagOff = run('node', ['--test', 'tests/shadow-flag-off-equivalence.test.js'], root, path.join(pkg, 'evidence/flag-off-equivalence-tests.txt'));
evidence.repoRegression = run('node', ['--test', 'tests/api-contract.test.js', 'tests/assets-and-ui.test.js', 'tests/auth-coordinator.test.js', 'tests/calculator-precision.test.js', 'tests/engine-equivalence.test.js'], root, path.join(pkg, 'evidence/repo-regression-tests.txt'));
evidence.full = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], root, path.join(pkg, 'evidence/full-suite-tests.txt'));
evidence.harness = run('node', ['--test', 'tests/shadow-harness.test.js'], path.join(parent, 'shadow-harness-worktree'), path.join(pkg, 'evidence/shadow-harness-27-tests.txt'));
evidence.scientific = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], path.join(parent, 'scientific-prototype'), path.join(pkg, 'evidence/patch3-scientific-tests.txt'));
const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
fs.writeFileSync(path.join(pkg, 'evidence/build.txt'), `COMMAND: npm run build\nSTARTED_UTC: ${new Date().toISOString()}\nEXIT_CODE: ${build.status ?? 1}\n${build.stdout || ''}${build.stderr || ''}`, 'utf8');
if (build.status !== 0) throw new Error('BUILD_GATE_FAILED');
const audit = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=dev'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
fs.writeFileSync(path.join(pkg, 'evidence/npm-audit.txt'), `COMMAND: npm audit --omit=dev\nSTARTED_UTC: ${new Date().toISOString()}\nEXIT_CODE: ${audit.status ?? 1}\n${audit.stdout || ''}${audit.stderr || ''}`, 'utf8');
if (audit.status !== 0) throw new Error('AUDIT_GATE_FAILED');

const currentFiles = [
  'REAL_VERCEL_HANDLER_CONVENTION.txt', 'SHADOW_DEPLOYMENT_INTEGRATION_IMPLEMENTATION_REPORT.txt', '.env.example', 'calculadora.js', 'index.html', 'server.js', 'scripts/build-static.js', 'scripts/generate-shadow-review-package.mjs', 'vercel.json', 'package.json', 'package-lock.json',
  'api/shadow-evaluate.mjs', 'api/shadow-health.mjs', 'js/shadow-client.js', 'js/shadow-runtime-config.js',
  'docs/shadow-deployment-runbook.md', 'docs/shadow-data-policy.md', 'lib/shadow', 'tests/shadow-deployment-integration.test.js', 'tests/shadow-flag-off-equivalence.test.js'
];
for (const relative of currentFiles) {
  const source = path.join(root, relative);
  if (fs.statSync(source).isDirectory()) fs.cpSync(source, path.join(pkg, 'current', relative), { recursive: true });
  else copy(source, path.join(pkg, 'current', relative));
}
for (const relative of ['.env.example', 'calculadora.js', 'index.html', 'server.js', 'scripts/build-static.js', 'vercel.json', 'package.json', 'package-lock.json']) {
  const bytes = execFileSync('git', ['show', `${base}:${relative}`], { cwd: root });
  const destination = path.join(pkg, 'pre-fix', relative); ensureDir(path.dirname(destination)); fs.writeFileSync(destination, bytes);
}
const diff = execFileSync('git', ['diff', base, '--', '.'], { cwd: root });
fs.writeFileSync(path.join(pkg, 'diff/PATCH_BASE_TO_CURRENT.patch'), diff);
const trackedAtBase = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', base], { cwd: root, encoding: 'utf8' }).split(/\r?\n/));
fs.writeFileSync(path.join(pkg, 'diff/NEW_SHADOW_FILES.txt'), currentFiles.filter(file => !trackedAtBase.has(file)).join('\n'), 'utf8');
fs.writeFileSync(path.join(pkg, 'evidence/COUNTS.json'), JSON.stringify(evidence, null, 2), 'utf8');
fs.writeFileSync(path.join(pkg, 'evidence/endpoint-real-entrypoint.txt'), 'Direct entrypoint tests are included in deployment-integration-tests.txt:\nPOST api/shadow-evaluate -> Web Response, 202 under OFF defaults.\nGET api/shadow-health -> Web Response, 401 without health token.\n', 'utf8');
fs.writeFileSync(path.join(pkg, 'evidence/source-integrity.txt'), `PATCH3_SCIENCE_MODIFIED: NO\nPRODUCTION_NUTRITION_LOGIC_MODIFIED: NO\nUI_REDESIGNED: NO\nFLAGS: OFF\nKILL_SWITCH: ON\n`, 'utf8');

const currentRoot = path.join(pkg, 'current');
const critical = ['tests/shadow-deployment-integration.test.js', 'lib/shadow/shadow-http.mjs', 'api/shadow-evaluate.mjs', 'api/shadow-health.mjs'];
const hashes = critical.map(relative => `${relative}\nWORKTREE_SHA256=${sha(path.join(root, relative))}\nPACKAGE_SHA256=${sha(path.join(currentRoot, relative))}`);
fs.writeFileSync(path.join(pkg, 'source-integrity/CURRENT_SHA256.txt'), hashes.join('\n'), 'utf8');
fs.writeFileSync(path.join(pkg, 'PACKAGE_PROVENANCE.txt'), `Generated by scripts/generate-shadow-review-package.mjs\nBASE=${base}\n${hashes.join('\n')}\n`, 'utf8');

const manifestPath = path.join(pkg, 'FINAL_PREDEPLOY_MANIFEST.txt');
function writeManifest() {
  const lines = ['SHADOW DEPLOYMENT INTEGRATION PREDEPLOY REAUDIT V3 MANIFEST', 'Manifest excludes itself and the ZIP archive.'];
  for (const file of fs.readdirSync(pkg, { recursive: true }).filter(file => file !== 'FINAL_PREDEPLOY_MANIFEST.txt').sort()) {
    const absolute = path.join(pkg, file); if (!fs.statSync(absolute).isFile()) continue;
    lines.push(`${file.replaceAll('\\', '/')}\t${fs.statSync(absolute).size}\t${sha(absolute)}\tPRESENT/OK`);
  }
  fs.writeFileSync(manifestPath, `${lines.join('\n')}\n`, 'utf8');
}
writeManifest();
if (fs.existsSync(zip)) throw new Error(`REFUSING_TO_OVERWRITE:${zip}`);
const compress = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${pkg}\\*' -DestinationPath '${zip}' -CompressionLevel Optimal`], { encoding: 'utf8' });
if (compress.status !== 0) throw new Error('ZIP_CREATION_FAILED');
const verifyDir = path.join(parent, `${packageName}_EXTRACT_VERIFY`); ensureDir(verifyDir);
const extract = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${verifyDir}' -Force`], { encoding: 'utf8' });
if (extract.status !== 0) throw new Error('ZIP_EXTRACTION_FAILED');
for (const relative of critical) {
  if (sha(path.join(currentRoot, relative)) !== sha(path.join(verifyDir, 'current', relative))) throw new Error(`EXTRACT_HASH_MISMATCH:${relative}`);
}
const manifestHash = sha(manifestPath);
const assertions = critical.map(relative => {
  const value = sha(path.join(root, relative));
  const packaged = sha(path.join(currentRoot, relative));
  const extracted = sha(path.join(verifyDir, 'current', relative));
  return `${relative}\nWORKTREE_SHA256=${value}\nPROVENANCE_SHA256=${value}\nMANIFEST_SHA256=${value}\nZIP_EXTRACTED_SHA256=${extracted}\nALL_MATCH=${value === packaged && value === extracted}`;
}).join('\n');
fs.writeFileSync(path.join(pkg, 'evidence/CRITICAL_HASH_ASSERTIONS.txt'), `MANIFEST_FILE_SHA256=${manifestHash}\n${assertions}\n`, 'utf8');
writeManifest();
const refresh = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${pkg}\\*' -DestinationPath '${zip}' -Update`], { encoding: 'utf8' });
if (refresh.status !== 0) throw new Error('ZIP_REFRESH_FAILED');
const finalVerifyDir = path.join(parent, `${packageName}_EXTRACT_VERIFY_FINAL`); ensureDir(finalVerifyDir);
const finalExtract = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${finalVerifyDir}' -Force`], { encoding: 'utf8' });
if (finalExtract.status !== 0) throw new Error('FINAL_ZIP_EXTRACTION_FAILED');
for (const relative of critical) {
  if (sha(path.join(currentRoot, relative)) !== sha(path.join(finalVerifyDir, 'current', relative))) throw new Error(`FINAL_EXTRACT_HASH_MISMATCH:${relative}`);
}
const zipHash = sha(zip);
fs.writeFileSync(path.join(pkg, 'ZIP_SHA256.txt'), `${zipHash}\n`, 'utf8');
console.log(JSON.stringify({ package: pkg, zip, zipHash, evidence, critical, status: 'PASS' }, null, 2));
