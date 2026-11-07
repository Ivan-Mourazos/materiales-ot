import { detectWidth } from './width.js';

// Lista de artículos cuyo ancho no cuadra entre la unidad de ficha, el código y la descripción
// (Iván, 06/11/2026). Es para que quien lleva las fichas de RPS las corrija; la web ya avisa en
// cada artículo, pero así se ven todos de una vez. Se descarga en CSV para abrirlo con Excel.

/** Los artículos con conflicto de ancho, ordenados por familia y código. */
export function widthConflicts(rows) {
  return rows
    .map((row) => ({ row, width: detectWidth(row) }))
    .filter(({ width }) => width.widthWarning)
    .map(({ row, width }) => ({
      code: String(row.code || '').trim(),
      description: String(row.description || '').trim(),
      family: String(row.family || '').trim(),
      unit: [row.unitCode, row.unitDescription].filter(Boolean).map((part) => String(part).trim()).join(' · '),
      widthUsed: width.detectedWidth,
      warning: width.widthWarning
    }))
    .sort((a, b) => a.family.localeCompare(b.family, 'es') || a.code.localeCompare(b.code, 'es'));
}

/** CSV con punto y coma (Excel en castellano) y BOM para que respete las tildes. */
export function toCsv(conflicts) {
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['Código', 'Descripción', 'Familia', 'Unidad de ficha', 'Ancho que usa la web (cm)', 'Qué no cuadra'];
  const lines = conflicts.map((item) =>
    [item.code, item.description, item.family, item.unit, String(item.widthUsed ?? '').replace('.', ','), item.warning].map(cell).join(';')
  );
  return '\uFEFF' + [header.map(cell).join(';'), ...lines].join('\r\n') + '\r\n';
}
