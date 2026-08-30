import { exportFilename } from './plan-export-snapshot.mjs';

const PAGE = Object.freeze({ width: 612, height: 792, left: 48, right: 48, top: 744, bottom: 48 });

function text(value) {
  // Built-in PDF fonts support WinAnsi. Preserve common Spanish glyphs while
  // replacing unsupported control/emoji characters deterministically.
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\u0020-\u00FF]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}
function wrap(value, font, size, width) {
  const words = text(value).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formattedMacro(target) {
  return `${Math.round(target.kcal)} kcal · P ${Math.round(target.proteina)} g · C ${Math.round(target.carbos)} g · G ${Math.round(target.grasa)} g`;
}

function itemQuantity(item) {
  const amount = Number(item?.cantidad ?? item?.gramos_calculados);
  const display = Number.isFinite(amount) ? Math.round(amount * 100) / 100 : '—';
  return `${display} ${item?.unidad || 'g'}`;
}

function setupWriter(pdf, fonts) {
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.top;
  function newPage() {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.top;
  }
  function line(value, { size = 10, bold = false, gap = 3 } = {}) {
    const font = bold ? fonts.bold : fonts.regular;
    const lines = wrap(value, font, size, PAGE.width - PAGE.left - PAGE.right);
    for (const segment of lines) {
      if (y - size < PAGE.bottom) newPage();
      page.drawText(segment, { x: PAGE.left, y, size, font });
      y -= size + gap;
    }
  }
  function spacer(amount = 8) {
    if (y - amount < PAGE.bottom) newPage();
    else y -= amount;
  }
  return { line, spacer };
}

/**
 * Create a PDF solely from a prepared export snapshot. pdfLib is injected so
 * browser code can load a local bundled module and node tests can use npm.
 */
export async function createPlanPdf(snapshot, pdfLib) {
  if (!pdfLib?.PDFDocument || !pdfLib?.StandardFonts) throw new TypeError('PLAN_EXPORT_PDF_LIB_REQUIRED');
  if (!snapshot?.nutritionTarget || !Array.isArray(snapshot?.plan?.dashboardDays)) throw new TypeError('PLAN_EXPORT_SNAPSHOT_REQUIRED');
  const pdf = await pdfLib.PDFDocument.create();
  pdf.setTitle('MacroBalance · Plan');
  pdf.setAuthor('MacroBalance');
  pdf.setSubject('Exportación de plan generado');
  pdf.setCreator('MacroBalance dashboard export');
  const stamp = new Date(Number(snapshot.exportedAtMs) || 0);
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);
  const fonts = {
    regular: await pdf.embedFont(pdfLib.StandardFonts.Helvetica),
    bold: await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold),
  };
  const writer = setupWriter(pdf, fonts);
  writer.line('MacroBalance · Plan alimentario', { size: 18, bold: true, gap: 8 });
  writer.line(`Objetivo: ${formattedMacro(snapshot.nutritionTarget)}`, { size: 11, bold: true });
  const profile = snapshot.profile || {};
  const profileParts = [
    profile.sex ? `Sexo: ${profile.sex}` : null,
    Number.isFinite(profile.age) ? `Edad: ${profile.age}` : null,
    Number.isFinite(profile.weightKg) ? `Peso: ${profile.weightKg} kg` : null,
    Number.isFinite(profile.heightCm) ? `Altura: ${profile.heightCm} cm` : null,
  ].filter(Boolean);
  if (profileParts.length) writer.line(`Perfil usado: ${profileParts.join(' · ')}`);
  const hydration = snapshot.hydrationReference;
  if (hydration?.status === 'REFERENCE_ONLY') {
    writer.line(`Referencia de agua total: ${hydration.totalWaterReference.valueLPerDay.toFixed(1)} L/día. Incluye bebidas y agua de los alimentos.`);
    writer.line('No es una prescripción de agua simple ni un diagnóstico de hidratación.', { size: 9 });
  }
  if (snapshot.micronutrientObservability) {
    writer.line('Micronutrientes: observabilidad disponible en el plan; datos parciales no se interpretan como adecuación.', { size: 9 });
  }
  writer.spacer();
  writer.line('Plan', { size: 15, bold: true, gap: 7 });
  for (let dayIndex = 0; dayIndex < snapshot.plan.dashboardDays.length; dayIndex += 1) {
    const day = snapshot.plan.dashboardDays[dayIndex] || {};
    writer.line(`Día ${dayIndex + 1}${day.dia_semana ? ` · ${day.dia_semana}` : ''}`, { size: 12, bold: true });
    const summary = day.resumen_dia;
    if (summary && Number.isFinite(summary.kcal)) {
      writer.line(`Resumen: ${Math.round(summary.kcal)} kcal · P ${Math.round(summary.proteina)} g · C ${Math.round(summary.carbos)} g · G ${Math.round(summary.grasa)} g`, { size: 9 });
    }
    for (const meal of Array.isArray(day.comidas) ? day.comidas : []) {
      writer.line(`${meal.tiempo_comida || 'Comida'} · ${meal.nombre || 'Sin nombre'}`, { size: 10, bold: true });
      if (meal.horario) writer.line(`Horario: ${meal.horario}`, { size: 9 });
      if (meal.macros && Number.isFinite(meal.macros.kcal)) {
        writer.line(`Macros: ${Math.round(meal.macros.kcal)} kcal · P ${Math.round(meal.macros.p)} g · C ${Math.round(meal.macros.c)} g · G ${Math.round(meal.macros.g)} g`, { size: 9 });
      }
      for (const ingredient of Array.isArray(meal.ingredientes) ? meal.ingredientes : []) {
        writer.line(`• ${ingredient.nombre || ingredient.food_id || 'Ingrediente'} — ${itemQuantity(ingredient)}`, { size: 9, gap: 2 });
      }
      for (const instruction of Array.isArray(meal.preparacion) ? meal.preparacion : []) {
        writer.line(`Preparación: ${instruction}`, { size: 9 });
      }
      writer.spacer(4);
    }
    writer.spacer(6);
  }
  if (snapshot.plan.shoppingList) {
    writer.line('Lista de compras', { size: 15, bold: true, gap: 7 });
    for (const [category, items] of Object.entries(snapshot.plan.shoppingList)) {
      writer.line(category, { size: 11, bold: true });
      for (const item of Array.isArray(items) ? items : []) {
        const label = typeof item === 'string' ? item : `${item.nombre || item.food_id || 'Ingrediente'}${item.cantidad == null ? '' : ` — ${item.cantidad} ${item.unidad || ''}`}`;
        writer.line(`• ${label}`, { size: 9, gap: 2 });
      }
      writer.spacer(4);
    }
  }
  return pdf.save({ useObjectStreams: false });
}

export function planPdfFilename(snapshot) {
  return exportFilename(snapshot, 'pdf');
}
