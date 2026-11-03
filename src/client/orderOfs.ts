import type { OfBlock } from './types';

/** Una OF del pedido tal como la devuelve /api/order-ofs. */
export type RpsOrderOf = {
  of: string;
  piece: string;
  units: number;
  article: string | null;
  comment: string | null;
};

/** OF con siete cifras para comparar (`229920` y `0229920` son la misma). */
export function ofCompareKey(value: string): string {
  const text = value.trim();
  return /^\d{1,7}$/.test(text) ? text.padStart(7, '0') : text.toUpperCase();
}

/**
 * Mete las OFs de RPS en la asignación sin pisar nada:
 * - las que ya están se dejan como están (solo se rellena la pieza si estaba vacía);
 * - las nuevas ocupan primero los bloques vacíos (sin OF ni materiales) y después se añaden al final.
 * `createBlock` crea un bloque nuevo (con su id) para no depender aquí de cómo se generan.
 */
export function mergeOrderOfs(
  current: OfBlock[],
  rpsOfs: RpsOrderOf[],
  createBlock: (of: string, description: string) => OfBlock
): { ofs: OfBlock[]; added: number; alreadyThere: number } {
  const present = new Set(current.map((block) => ofCompareKey(block.of)).filter(Boolean));
  const pending = rpsOfs.filter((rpsOf) => !present.has(ofCompareKey(rpsOf.of)));
  const pieceByOf = new Map(rpsOfs.map((rpsOf) => [ofCompareKey(rpsOf.of), rpsOf.piece]));

  let added = 0;
  const ofs = current.map((block) => {
    const key = ofCompareKey(block.of);
    if (key && pieceByOf.has(key) && !block.description.trim()) {
      return { ...block, description: pieceByOf.get(key) || '' };
    }
    const isEmpty = !block.of.trim() && block.materials.length === 0;
    if (isEmpty && added < pending.length) {
      const next = pending[added++];
      return { ...block, of: next.of, description: block.description.trim() || next.piece };
    }
    return block;
  });

  for (const next of pending.slice(added)) {
    ofs.push(createBlock(next.of, next.piece));
    added++;
  }

  return { ofs, added, alreadyThere: rpsOfs.length - pending.length };
}
