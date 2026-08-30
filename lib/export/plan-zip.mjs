import { exportFilename, planJsonText, shoppingListJsonText } from './plan-export-snapshot.mjs';

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('PLAN_EXPORT_PDF_BYTES_REQUIRED');
}

/**
 * The ZIP has exactly three portable, non-junk artifacts: the readable PDF,
 * the structured plan snapshot, and the shopping-list-only JSON.
 */
export function createPlanZip(snapshot, pdfBytes, fflate) {
  if (!fflate?.zipSync || !fflate?.strToU8) throw new TypeError('PLAN_EXPORT_FFLATE_REQUIRED');
  // ZIP/DOS timestamps cannot represent dates before 1980. This affects only
  // archive metadata; the exported snapshot retains its exact timestamp.
  const exportedAtMs = Number(snapshot?.exportedAtMs);
  // Use a local Date constructor here because the ZIP/DOS year is serialized
  // from local date components by fflate; a UTC midnight may still be 1979
  // for a negative-offset browser.
  const zipEpochMs = new Date(1980, 0, 1).getTime();
  const mtime = new Date(Number.isFinite(exportedAtMs) && exportedAtMs >= zipEpochMs ? exportedAtMs : zipEpochMs);
  const options = { level: 6, mtime };
  return fflate.zipSync({
    'report.pdf': [bytes(pdfBytes), options],
    'plan.json': [fflate.strToU8(planJsonText(snapshot)), options],
    'shopping-list.json': [fflate.strToU8(shoppingListJsonText(snapshot)), options],
  }, { level: 6 });
}

export function planZipFilename(snapshot) {
  return exportFilename(snapshot, 'zip');
}
