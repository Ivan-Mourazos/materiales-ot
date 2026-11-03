import type { OfBlock } from './types';

/** Una OF tal como viene del historial (lo que se generó en su día). */
export type PickableOf = {
  of: string;
  description?: string;
  materials: { code: string; description: string; quantity: number | null }[];
};

/** Clave de una línea dentro de la lista: posición de la OF y del material. */
export const lineKey = (ofIndex: number, lineIndex: number) => `${ofIndex}:${lineIndex}`;

/** Todas las líneas marcadas (lo que se ve al abrir el diálogo). */
export function allLineKeys(ofs: PickableOf[]): Set<string> {
  const keys = new Set<string>();
  ofs.forEach((ofBlock, ofIndex) => ofBlock.materials.forEach((_, lineIndex) => keys.add(lineKey(ofIndex, lineIndex))));
  return keys;
}

/** Cuántas líneas de una OF están marcadas: para la casilla de la OF (todas, algunas, ninguna). */
export function ofSelectionState(ofBlock: PickableOf, ofIndex: number, selected: Set<string>): 'all' | 'some' | 'none' {
  const total = ofBlock.materials.length;
  const marked = ofBlock.materials.filter((_, lineIndex) => selected.has(lineKey(ofIndex, lineIndex))).length;
  if (total === 0 || marked === 0) return 'none';
  return marked === total ? 'all' : 'some';
}

/** Marca o desmarca todas las líneas de una OF. Devuelve un conjunto nuevo. */
export function toggleOf(ofBlock: PickableOf, ofIndex: number, selected: Set<string>): Set<string> {
  const next = new Set(selected);
  const select = ofSelectionState(ofBlock, ofIndex, selected) !== 'all';
  ofBlock.materials.forEach((_, lineIndex) => {
    const key = lineKey(ofIndex, lineIndex);
    if (select) next.add(key);
    else next.delete(key);
  });
  return next;
}

/**
 * Las OFs elegidas, listas para la asignación: sin número de OF (es otro pedido), con su pieza y
 * solo los materiales marcados. Una OF sin ningún material marcado no se lleva.
 */
export function buildPickedOfs(ofs: PickableOf[], selected: Set<string>, newId: () => string): OfBlock[] {
  return ofs.flatMap((ofBlock, ofIndex) => {
    const materials = ofBlock.materials
      .map((line, lineIndex) => ({ line, key: lineKey(ofIndex, lineIndex) }))
      .filter(({ key }) => selected.has(key))
      .map(({ line }) => ({
        id: newId(),
        code: line.code,
        description: line.description || '',
        quantity: line.quantity,
        width: null,
        widthWarning: null
      }));
    if (materials.length === 0) return [];
    return [{ id: newId(), of: '', description: ofBlock.description || '', materials }];
  });
}
