import type { MaterialLine, OfBlock } from './types';
import type { RpsOrderOf } from './orderOfs';
import { normalizePiece } from '../pieceNames.js';

/** Lo que devuelve /api/order-consumption (ver src/consumption.js). */
export type ConsumptionLine = { code: string; description: string; quantity: number };
export type ConsumptionOf = {
  of: string;
  piece: string;
  units: number;
  materials: ConsumptionLine[];
  unplanned: ConsumptionLine[];
  unused: { code: string; description: string; reserved: number }[];
};
export type ConsumptionTransfer = { code: string; description: string; quantity: number; from: string; to: string };
export type ConsumptionReport = {
  order: string | null;
  ofs: ConsumptionOf[];
  transfers: ConsumptionTransfer[];
  totals: { ofs: number; ofsWithMaterial: number; lines: number; unplanned: number; unused: number };
};

/**
 * A qué OFs van las piezas copiadas:
 * - `target`: a las OFs del pedido de la asignación, emparejando por pieza (TELON DELANTERO con TELON DELANTERO).
 * - `blank`: sin número de OF, para rellenarlo después.
 * - `source`: con las OFs del pedido de origen (para revisar ese pedido tal cual).
 */
export type LoadMode = 'target' | 'blank' | 'source';

// Al escalar por unidades se redondea a 2 decimales: son metros o unidades de almacén.
const scale = (quantity: number, multiplier: number) => Math.round(quantity * multiplier * 100) / 100;

export function consumptionToOfBlocks({
  report,
  mode,
  targetOfs = [],
  scaleToUnits = false,
  newId
}: {
  report: ConsumptionReport;
  mode: LoadMode;
  targetOfs?: RpsOrderOf[];
  /** Solo con `target`: multiplica cada cantidad por unidades de la OF nueva / unidades de la de origen. */
  scaleToUnits?: boolean;
  newId: () => string;
}): { ofs: OfBlock[]; matched: number; unmatched: string[]; unusedTargets: RpsOrderOf[] } {
  const free = [...targetOfs];
  let matched = 0;
  const unmatched: string[] = [];

  const ofs = report.ofs
    .filter((source) => source.materials.length > 0)
    .map((source) => {
      let of = '';
      let multiplier = 1;
      if (mode === 'source') {
        of = source.of;
      } else if (mode === 'target') {
        const index = free.findIndex((target) => normalizePiece(target.piece) === normalizePiece(source.piece));
        if (index >= 0) {
          const [target] = free.splice(index, 1);
          of = target.of;
          matched++;
          if (scaleToUnits && source.units > 0 && target.units > 0) multiplier = target.units / source.units;
        } else {
          unmatched.push(source.piece || `OF ${source.of}`);
        }
      }

      const materials: MaterialLine[] = source.materials.map((line) => ({
        id: newId(),
        code: line.code,
        description: line.description,
        quantity: multiplier === 1 ? line.quantity : scale(line.quantity, multiplier)
      }));

      return { id: newId(), of, description: source.piece, materials };
    });

  return { ofs, matched, unmatched, unusedTargets: mode === 'target' ? free : [] };
}
