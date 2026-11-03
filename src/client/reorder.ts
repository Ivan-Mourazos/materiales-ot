import type { OfBlock } from './types';

// Ordenar las OFs y sus materiales a mano (Iván, 03/11/2026: «poder ordenar las OFs y sus
// materiales como nos dé la gana, no solo añadir y borrar»). Funciones puras: devuelven una lista
// nueva y, si el movimiento no cambia nada, la misma lista (así React no repinta).

export type DropPosition = 'before' | 'after';

/** Mueve la OF `ofId` delante o detrás de `targetOfId`. */
export function moveOf(ofs: OfBlock[], ofId: string, targetOfId: string, position: DropPosition): OfBlock[] {
  if (ofId === targetOfId) return ofs;
  const moving = ofs.find((block) => block.id === ofId);
  if (!moving || !ofs.some((block) => block.id === targetOfId)) return ofs;
  const rest = ofs.filter((block) => block.id !== ofId);
  const targetIndex = rest.findIndex((block) => block.id === targetOfId);
  const insertAt = position === 'before' ? targetIndex : targetIndex + 1;
  const next = [...rest.slice(0, insertAt), moving, ...rest.slice(insertAt)];
  return next.every((block, index) => block === ofs[index]) ? ofs : next;
}

/** Sube (-1) o baja (+1) una OF un puesto. Para el teclado. */
export function moveOfBy(ofs: OfBlock[], ofId: string, delta: -1 | 1): OfBlock[] {
  const index = ofs.findIndex((block) => block.id === ofId);
  const target = ofs[index + delta];
  if (index < 0 || !target) return ofs;
  return moveOf(ofs, ofId, target.id, delta < 0 ? 'before' : 'after');
}

/**
 * Mueve un material a otra posición, en su OF o en otra. Con `targetLineId` va delante o detrás de
 * ese material; sin él, al final de la OF de destino (soltar sobre una OF vacía).
 */
export function moveLine(
  ofs: OfBlock[],
  lineId: string,
  targetOfId: string,
  targetLineId: string | null,
  position: DropPosition = 'after'
): OfBlock[] {
  if (lineId === targetLineId) return ofs;
  const source = ofs.find((block) => block.materials.some((line) => line.id === lineId));
  const target = ofs.find((block) => block.id === targetOfId);
  if (!source || !target) return ofs;
  const line = source.materials.find((item) => item.id === lineId)!;

  const next = ofs.map((block) => {
    const without = block.id === source.id ? block.materials.filter((item) => item.id !== lineId) : block.materials;
    if (block.id !== target.id) return without === block.materials ? block : { ...block, materials: without };
    let insertAt = without.length;
    if (targetLineId) {
      const targetIndex = without.findIndex((item) => item.id === targetLineId);
      if (targetIndex >= 0) insertAt = position === 'before' ? targetIndex : targetIndex + 1;
    }
    return { ...block, materials: [...without.slice(0, insertAt), line, ...without.slice(insertAt)] };
  });

  const unchanged = next.every(
    (block, index) =>
      block.materials.length === ofs[index].materials.length &&
      block.materials.every((item, itemIndex) => item === ofs[index].materials[itemIndex])
  );
  return unchanged ? ofs : next;
}

/** Sube (-1) o baja (+1) un material dentro de su OF. Para el teclado. */
export function moveLineBy(ofs: OfBlock[], lineId: string, delta: -1 | 1): OfBlock[] {
  const block = ofs.find((item) => item.materials.some((line) => line.id === lineId));
  if (!block) return ofs;
  const index = block.materials.findIndex((line) => line.id === lineId);
  const target = block.materials[index + delta];
  if (!target) return ofs;
  return moveLine(ofs, lineId, block.id, target.id, delta < 0 ? 'before' : 'after');
}
