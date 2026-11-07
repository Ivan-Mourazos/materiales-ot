// Materiales habituales de un artículo fabricado. Solo cuentan consumos netos positivos.
export const SUGGESTION_OPTIONS = Object.freeze({ limit: 20, years: 2, threshold: 0.5, excludeRemainders: true });

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildSuggestions({ target, history, existingCodes = [], options = {} }) {
  const settings = { ...SUGGESTION_OPTIONS, ...options };
  const sample = history.filter((item) => item.of !== target.of && Number.isFinite(item.units) && item.units > 0).slice(0, settings.limit);
  const existing = new Set(existingCodes.map((code) => code.trim().toUpperCase()));
  const materials = new Map();
  for (const item of sample) {
    const grouped = new Map();
    for (const line of item.materials) {
      const code = String(line.code || '').trim().toUpperCase();
      if (!code || !Number.isFinite(line.quantity)) continue;
      const current = grouped.get(code) || { ...line, code, quantity: 0 };
      current.quantity += line.quantity;
      grouped.set(code, current);
    }
    for (const [code, line] of grouped) {
      if (line.quantity <= 0 || existing.has(code) || (settings.excludeRemainders && code.startsWith('RESTO'))) continue;
      const current = materials.get(code) || { code, description: line.description || '', values: [] };
      current.values.push(line.quantity / item.units);
      materials.set(code, current);
    }
  }
  const suggestions = target.units > 0 ? [...materials.values()]
    .filter((line) => line.values.length / sample.length >= settings.threshold)
    .map(({ values, ...line }) => ({ ...line, occurrences: values.length, sampleSize: sample.length,
      perUnit: median(values), quantity: Math.round(median(values) * target.units * 100) / 100 }))
    .filter((line) => line.quantity > 0)
    .sort((a, b) => b.occurrences - a.occurrences || a.code.localeCompare(b.code)) : [];
  return { ...target, sampleSize: sample.length, historyOfs: sample.map((item) => item.of), suggestions };
}
