import type { AssignmentModel } from './types';

type Categorizable = Pick<AssignmentModel, 'category' | 'createdAt' | 'updatedAt'>;

export type CategoryGroup<T> = { key: string; label: string; models: T[] };

export const NO_CATEGORY_LABEL = 'Sin categoría';

/** Clave para comparar categorías: sin mayúsculas, tildes ni espacios de más. '' = sin categoría. */
export function categoryKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanLabel(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

function timestamp(model: Categorizable): number {
  return new Date(model.updatedAt || model.createdAt || 0).getTime() || 0;
}

/** La grafía más repetida; en empate, la del modelo actualizado más recientemente. */
function pickLabel(models: Categorizable[]): string {
  const tally = new Map<string, { count: number; latest: number }>();
  for (const model of models) {
    const label = cleanLabel(model.category);
    const entry = tally.get(label) ?? { count: 0, latest: Number.NEGATIVE_INFINITY };
    entry.count += 1;
    entry.latest = Math.max(entry.latest, timestamp(model));
    tally.set(label, entry);
  }
  let best = '';
  let bestEntry: { count: number; latest: number } | null = null;
  for (const [label, entry] of tally) {
    if (
      !bestEntry ||
      entry.count > bestEntry.count ||
      (entry.count === bestEntry.count && entry.latest > bestEntry.latest)
    ) {
      best = label;
      bestEntry = entry;
    }
  }
  return best;
}

/** Grupos por categoría en orden alfabético, con "Sin categoría" al final. Conserva el orden de los modelos. */
export function groupModelsByCategory<T extends Categorizable>(models: T[]): CategoryGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const model of models) {
    const key = categoryKey(model.category);
    const group = byKey.get(key);
    if (group) group.push(model);
    else byKey.set(key, [model]);
  }
  return [...byKey]
    .map(([key, items]) => ({ key, label: key ? pickLabel(items) : NO_CATEGORY_LABEL, models: items }))
    .sort((a, b) => {
      if (!a.key) return 1;
      if (!b.key) return -1;
      return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
    });
}

/** Categorías existentes, para sugerirlas al escribir. */
export function listCategoryLabels(models: Categorizable[]): string[] {
  return groupModelsByCategory(models)
    .filter((group) => group.key)
    .map((group) => group.label);
}
