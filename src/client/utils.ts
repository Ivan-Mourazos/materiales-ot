import type { Article } from './types';

export function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const technicalTerms = new Set([
  'BD',
  'ID',
  'OF',
  'PVC',
  'RPS',
  'SAT',
  'TGM',
  'UNE',
  'UPN',
  'UV'
]);

const lowerCaseWords = new Set(['a', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'sin', 'u', 'y']);

const wordCorrections: Record<string, string> = {
  acidos: 'ácidos',
  acrilico: 'acrílico',
  acrilicos: 'acrílicos',
  agricola: 'agrícola',
  anodizado: 'anodizado',
  aplicacion: 'aplicación',
  automatizacion: 'automatización',
  caldereria: 'calderería',
  cerrajeria: 'cerrajería',
  clasificacion: 'clasificación',
  conexion: 'conexión',
  confeccion: 'confección',
  decoracion: 'decoración',
  descripcion: 'descripción',
  electrico: 'eléctrico',
  electricos: 'eléctricos',
  elevacion: 'elevación',
  fijacion: 'fijación',
  fotografico: 'fotográfico',
  impresion: 'impresión',
  informatica: 'informática',
  linea: 'línea',
  lineas: 'líneas',
  maquinas: 'máquinas',
  metalicos: 'metálicos',
  motorizacion: 'motorización',
  plasticos: 'plásticos',
  plastica: 'plástica',
  poliester: 'poliéster',
  proteccion: 'protección',
  quimicos: 'químicos',
  reparacion: 'reparación',
  rotulacion: 'rotulación',
  seccion: 'sección',
  sujecion: 'sujeción',
  tornilleria: 'tornillería',
  utiles: 'útiles',
  vehiculos: 'vehículos',
  vinilica: 'vinílica'
};

const numberFormatter = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 });
export const stockDateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short' });
export const historyDateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

export function formatNumber(value: number) {
  return numberFormatter.format(value || 0);
}

export function roundQuantity(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

export function detectOrderYear(orderCode: string): number | null {
  const clean = orderCode.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
  const match = /^[A-Z]+(\d{2})/.exec(clean);
  return match ? 2000 + Number(match[1]) : null;
}

export function formatStockDate(value?: string | null) {
  return value ? stockDateFormat.format(new Date(value)) : '-';
}

export function formatUnitLabel(article: Article) {
  const code = String(article.unitCode || '').trim();
  if (/^ML\s*\d+(?:[,.]\d+)?$/i.test(code)) return 'Metro lineal';
  return formatDisplayText(article.unitDescription) || code || '-';
}

export function formatDisplayText(value?: string | null) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  let hasWrittenWord = false;

  return clean
    .split(/(\s+|[-/(),.])/)
    .map((part) => {
      if (!part.trim() || /^[-/(),.]$/.test(part)) return part;
      if (/^\d/.test(part)) return part;

      const upper = part.toLocaleUpperCase('es-ES');
      if (technicalTerms.has(upper) || /^ML\d*/i.test(part)) {
        hasWrittenWord = true;
        return upper;
      }

      const lower = applyWordCorrection(part.toLocaleLowerCase('es-ES'));
      const shouldCapitalize = !hasWrittenWord && !lowerCaseWords.has(lower);
      hasWrittenWord = true;

      return shouldCapitalize
        ? lower.charAt(0).toLocaleUpperCase('es-ES') + lower.slice(1)
        : lower;
    })
    .join('')
    .replace(/\s+([),.])/g, '$1')
    .replace(/([(])\s+/g, '$1');
}

function applyWordCorrection(word: string) {
  return wordCorrections[word] || word;
}
