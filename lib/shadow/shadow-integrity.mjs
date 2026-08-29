import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shadowRoot = path.dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_IMPORTS = [
  /(?:from\s+|require\s*\()['"](?:\.\.\/)+menu-engine/i,
  /(?:from\s+|require\s*\()['"][^'"]*firebase-init/i,
  /(?:from\s+|require\s*\()['"][^'"]*calculadora\.js/i,
];
const FORBIDDEN_AUTHORITY_TOKENS = [
  /guardarObjetivoFirestore/i,
  /(?:write|setDoc|updateDoc)\s*\([^)]*(?:users|goals_history)/i,
];

export async function verifyNoProductionAuthorityImports(root = shadowRoot) {
  const failures = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'frozen-patch3') await visit(absolute); continue; }
      if (!/\.(?:cjs|mjs|js)$/.test(entry.name)) continue;
      if (entry.name === 'shadow-integrity.mjs') continue;
      const source = await fs.readFile(absolute, 'utf8');
      if (FORBIDDEN_IMPORTS.some(pattern => pattern.test(source)) || FORBIDDEN_AUTHORITY_TOKENS.some(pattern => pattern.test(source))) failures.push(path.relative(root, absolute).replaceAll('\\', '/'));
    }
  }
  await visit(root);
  return Object.freeze({ status: failures.length ? 'CRITICAL_PRODUCTION_AUTHORITY_IMPORT' : 'PASS', failures: Object.freeze(failures) });
}
