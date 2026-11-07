export type OfSuggestion = { code: string; description: string; occurrences: number; sampleSize: number; perUnit: number; quantity: number };
export type OfSuggestions = { of: string; article: string | null; units: number; sampleSize: number; suggestions: OfSuggestion[] };

type Pending = { resolve: (value: OfSuggestions | null) => void; reject: (error: Error) => void };
const cache = new Map<string, { expires: number; promise: Promise<OfSuggestions | null> }>();
const pending = new Map<string, Pending>();
let timer: ReturnType<typeof setTimeout> | undefined;

// Junta las tarjetas montadas en el mismo turno en una sola petición.
export function loadOfSuggestions(of: string): Promise<OfSuggestions | null> {
  const code = of.padStart(7, '0');
  const hit = cache.get(code);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = new Promise<OfSuggestions | null>((resolve, reject) => pending.set(code, { resolve, reject }));
  cache.set(code, { expires: Date.now() + 5 * 60 * 1000, promise });
  if (cache.size > 400) cache.delete(cache.keys().next().value!);
  if (!timer) timer = setTimeout(flush, 30);
  return promise;
}

async function flush() {
  timer = undefined;
  const entries = [...pending];
  pending.clear();
  for (let index = 0; index < entries.length; index += 200) {
    const batch = entries.slice(index, index + 200);
    try {
      const response = await fetch('/api/of-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ofs: batch.map(([of]) => of) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el historial de materiales.');
      const byOf = new Map<string, OfSuggestions>(data.ofs.map((item: OfSuggestions) => [item.of, item]));
      batch.forEach(([of, request]) => request.resolve(byOf.get(of) || null));
    } catch (error) {
      batch.forEach(([of, request]) => { cache.delete(of); request.reject(error instanceof Error ? error : new Error('No se pudo consultar el historial.')); });
    }
  }
}
