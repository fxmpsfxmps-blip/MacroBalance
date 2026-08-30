(function installPlanExport() {
  function source() {
    return typeof window.MacroBalancePlanExportSource === 'function'
      ? window.MacroBalancePlanExportSource()
      : null;
  }

  function controls() {
    return {
      shell: document.getElementById('plan-export-actions'),
      pdf: document.getElementById('export-plan-pdf'),
      zip: document.getElementById('export-plan-zip'),
      status: document.getElementById('plan-export-status'),
    };
  }

  function refresh() {
    const { shell } = controls();
    if (shell) shell.hidden = !source()?.plan;
  }

  function setStatus(message) {
    const status = controls().status;
    if (status) status.textContent = message || '';
  }

  function download(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function prepare() {
    const current = source();
    if (!current?.plan || !current?.currentGoal) throw new Error('No hay un plan disponible para exportar.');
    const snapshotModule = await import('/lib/export/plan-export-snapshot.mjs');
    const goalTime = current.currentGoal.startDate?.toMillis?.()
      ?? current.currentGoal.createdAt?.toMillis?.()
      ?? Date.now();
    return {
      snapshot: snapshotModule.createPlanExportSnapshot({
        plan: current.plan,
        currentGoal: current.currentGoal,
        hydrationReference: current.currentGoal.hydrationReference ?? null,
        micronutrientObservability: current.micronutrientObservability ?? null,
        exportedAt: goalTime,
      }),
    };
  }

  async function createPdf() {
    const { snapshot } = await prepare();
    const [pdfModule, pdfLib] = await Promise.all([
      import('/lib/export/plan-pdf.mjs'),
      import('/vendor/pdf-lib.esm.min.js'),
    ]);
    return { bytes: await pdfModule.createPlanPdf(snapshot, pdfLib), filename: pdfModule.planPdfFilename(snapshot), snapshot };
  }

  async function onPdf() {
    try {
      setStatus('Preparando PDF…');
      const pdf = await createPdf();
      download(pdf.bytes, pdf.filename, 'application/pdf');
      setStatus('PDF listo.');
    } catch (error) {
      console.error('No se pudo exportar PDF:', error);
      setStatus(error.message || 'No se pudo exportar el PDF.');
    }
  }

  async function onZip() {
    try {
      setStatus('Preparando paquete ZIP…');
      const [pdf, zipModule, fflate] = await Promise.all([
        createPdf(),
        import('/lib/export/plan-zip.mjs'),
        import('/vendor/fflate.esm.js'),
      ]);
      const bytes = zipModule.createPlanZip(pdf.snapshot, pdf.bytes, fflate);
      download(bytes, zipModule.planZipFilename(pdf.snapshot), 'application/zip');
      setStatus('Paquete ZIP listo.');
    } catch (error) {
      console.error('No se pudo exportar el paquete:', error);
      setStatus(error.message || 'No se pudo exportar el paquete.');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const { pdf, zip } = controls();
    pdf?.addEventListener('click', onPdf);
    zip?.addEventListener('click', onZip);
    refresh();
  });
  window.addEventListener('macrobalance:plan-changed', refresh);
})();
