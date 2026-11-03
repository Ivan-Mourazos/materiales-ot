// Ancho de las telas (en cm), a partir de la unidad de ficha, el código y la descripción de RPS.
//
// Ojo con la descripción (Iván, 03/11/2026: «una tela ponía una medida en mm y otra en cm y cogía
// la de mm como si fueran cm»): «CINTA POLIESTER :VERDE :60 MM» salía con «Ancho 60 cm». Ahora:
// - una cifra con MM detrás se pasa a cm (60 MM = 6 cm, que ya no es un ancho de tela);
// - de la descripción solo cuentan cifras marcadas como ancho («:120 AN», «ANCHO 250»). Un «:300»
//   o un «:350CM» sueltos no se adivinan: pueden ser gramaje, color, el largo de un brazo, un diámetro…

const MIN_WIDTH_CM = 40;
const MAX_WIDTH_CM = 600;
const NUMBER = String.raw`(\d{2,4}(?:[,.]\d+)?)`;

const toNumber = (value) => Number(String(value).replace(',', '.'));

/** Pasa a cm según la unidad escrita detrás (MM, CM o nada = cm). */
function toCm(value, unit) {
  const number = toNumber(value);
  if (!Number.isFinite(number)) return null;
  return String(unit || '').toUpperCase() === 'MM' ? number / 10 : number;
}

const UNIT_PATTERN = new RegExp(String.raw`\b(?:ML|ANCHO(?:\s+DE\s+(?:LA\s+)?PIEZA)?)\s*[:=-]?\s*${NUMBER}\s*(MM|CM)?\b`, 'gi');
const CODE_PATTERN = /\bP\s*(\d{2,3}(?:[,.]\d+)?)\b/gi;
// «:120 AN», «200AN», «150 CM AN», «1500 MM DE ANCHO»
const DESCRIPTION_BEFORE_AN = new RegExp(String.raw`${NUMBER}\s*(MM|CM)?\s*(?:DE\s+)?AN(?:CHO)?\b`, 'gi');
// «ANCHO 250», «AN: 1500 MM»
const DESCRIPTION_AFTER_AN = new RegExp(String.raw`\bAN(?:CHO)?\s*[:=-]?\s*${NUMBER}\s*(MM|CM)?\b`, 'gi');

export function detectWidth(row) {
  const candidates = [];
  const pushWidth = (source, value, unit, text) => {
    const width = toCm(value, unit);
    if (width !== null && width >= MIN_WIDTH_CM && width <= MAX_WIDTH_CM) {
      candidates.push({ source, width: Math.round(width * 100) / 100, text: text.trim() });
    }
  };

  const unitText = `${row.unitCode || ''} ${row.unitDescription || ''}`;
  for (const match of unitText.matchAll(UNIT_PATTERN)) {
    pushWidth('unidad', match[1], match[2], match[0]);
  }

  const codeText = String(row.code || '');
  for (const match of codeText.matchAll(CODE_PATTERN)) {
    pushWidth('referencia', match[1], 'CM', match[0]);
  }

  const descriptionText = String(row.description || '');
  const seen = new Set();
  for (const pattern of [DESCRIPTION_BEFORE_AN, DESCRIPTION_AFTER_AN]) {
    for (const match of descriptionText.matchAll(pattern)) {
      // Un mismo trozo del nombre puede casar con dos reglas («:150 CM AN»): se cuenta una vez
      if (seen.has(match.index)) continue;
      seen.add(match.index);
      pushWidth('descripcion', match[1], match[2], match[0]);
    }
  }

  if (candidates.length === 0) {
    return { detectedWidth: null, widthWarning: null };
  }

  // La unidad de ficha es el valor operativo de referencia. La descripción y
  // el código se contrastan para avisar de posibles discrepancias.
  const orderedSources = ['unidad', 'referencia', 'descripcion'];
  const chosen = orderedSources
    .map((source) => candidates.find((item) => item.source === source))
    .find(Boolean) || candidates[0];
  const uniqueWidths = Array.from(new Set(candidates.map((item) => item.width)));
  const uniqueCandidates = Array.from(
    new Map(candidates.map((item) => [`${item.source}::${item.width}`, item])).values()
  );
  const sourceLabel = { unidad: 'unidad de ficha', referencia: 'código', descripcion: 'descripción' };
  const fromSource = { unidad: 'de la unidad de ficha', referencia: 'del código', descripcion: 'de la descripción' };

  return {
    detectedWidth: chosen.width,
    widthWarning: uniqueWidths.length > 1
      ? `Conflicto de ancho: ${uniqueCandidates
        .map((item) => `${sourceLabel[item.source]} «${item.text}» = ${String(item.width).replace('.', ',')} cm`)
        .join('; ')}. Se muestra el ${fromSource[chosen.source]}.`
      : null
  };
}
