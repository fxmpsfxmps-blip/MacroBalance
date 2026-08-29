import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPatch3Runner } = require('./shadow-harness.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
export const FROZEN_PATCH3_ROOT = path.join(here, 'frozen-patch3');
export const FROZEN_PATCH3_MANIFEST_PATH = path.join(here, 'frozen-patch3-manifest.json');

export class FrozenManifestError extends Error {
  constructor(code, detail = null) { super(code); this.name = 'FrozenManifestError'; this.code = code; this.detail = detail; }
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

export async function verifyFrozenPatch3({ manifestPath = FROZEN_PATCH3_MANIFEST_PATH, root = FROZEN_PATCH3_ROOT } = {}) {
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { throw new FrozenManifestError('FROZEN_MANIFEST_UNREADABLE'); }
  if (manifest.candidateFreezeId !== 'MB_CANDIDATE_V1_PATCH3_L005_INPUT_CONTRACT_STABILIZATION_2026-08-28') {
    throw new FrozenManifestError('FROZEN_MANIFEST_FREEZE_ID_MISMATCH');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== manifest.fileCount) {
    throw new FrozenManifestError('FROZEN_MANIFEST_FILE_LIST_INVALID');
  }
  for (const entry of manifest.files) {
    const absolute = path.resolve(root, entry.path);
    if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new FrozenManifestError('FROZEN_MANIFEST_PATH_ESCAPE', entry.path);
    let actual;
    try { actual = await sha256(absolute); } catch { throw new FrozenManifestError('FROZEN_MANIFEST_FILE_MISSING', entry.path); }
    if (actual !== entry.sha256) throw new FrozenManifestError('FROZEN_MANIFEST_MISMATCH', entry.path);
  }
  const manifestHash = await sha256(manifestPath);
  return Object.freeze({ status: 'VERIFIED', manifestHash, candidateFreezeId: manifest.candidateFreezeId, candidateVersion: manifest.candidateVersion, fileCount: manifest.fileCount, root });
}

export async function createVerifiedFrozenPatch3Runner(options = {}) {
  const verification = await verifyFrozenPatch3(options);
  const runner = createPatch3Runner({ patch3Root: options.root || FROZEN_PATCH3_ROOT });
  Object.defineProperty(runner, 'freezeVerification', { value: verification, enumerable: true });
  return runner;
}

export async function harnessIntegrity() {
  const harnessPath = path.join(here, 'shadow-harness.cjs');
  return Object.freeze({ path: harnessPath, sha256: await sha256(harnessPath), version: require('./shadow-harness.cjs').SHADOW_HARNESS_VERSION });
}
