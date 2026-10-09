/** Cantidad de una línea de material. `null` = sin cantidad todavía (se rellena al reservar). */
export type Quantity = number | null;

/** Lo que sale de un campo de cantidad: una cantidad, vacío o algo que no se puede aceptar. */
export type QuantityInput = Quantity | 'invalid';

export type MissingQuantity = {
  ofId: string;
  lineId: string;
  ofLabel: string;
  code: string;
  description: string;
};

type LineLike = { id: string; code: string; description: string; quantity: Quantity | undefined };
type OfLike = { id: string; of: string; description: string; materials: LineLike[] };

export function roundQuantity(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

/**
 * ¿La línea tiene una cantidad utilizable? Los borradores guardados antes de
 * este cambio usaban 0 para "vacío", así que 0 cuenta como sin cantidad.
 */
export function hasQuantity(quantity: Quantity | undefined): quantity is number {
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
}

export function parseQuantityInput(raw: string): QuantityInput {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return 'invalid';
  const rounded = roundQuantity(value);
  return rounded === 0 ? null : rounded;
}

export function quantityInputValue(quantity: Quantity | undefined): string {
  return hasQuantity(quantity) ? String(quantity) : '';
}

export function sumQuantities(quantities: (Quantity | undefined)[]): number {
  return roundQuantity(quantities.reduce<number>((sum, q) => sum + (hasQuantity(q) ? q : 0), 0));
}

/** Vacío × N sigue vacío: nunca 0 ni NaN. */
export function scaleQuantity(quantity: Quantity | undefined, multiplier: number): Quantity {
  if (!hasQuantity(quantity)) return null;
  const scaled = roundQuantity(quantity * multiplier);
  return hasQuantity(scaled) ? scaled : null;
}

/** Al añadir dos veces el mismo artículo: vacío + 2 = 2, vacío + vacío = vacío. */
export function addQuantities(a: Quantity | undefined, b: Quantity | undefined): Quantity {
  if (!hasQuantity(a)) return hasQuantity(b) ? b : null;
  if (!hasQuantity(b)) return a;
  return roundQuantity(a + b);
}

export function findMissingQuantities(ofs: OfLike[]): MissingQuantity[] {
  return ofs.flatMap((ofBlock, index) => {
    const of = ofBlock.of.trim();
    const description = ofBlock.description.trim();
    const ofLabel = of ? `OF ${of}` : `OF ${index + 1}${description ? ` · ${description}` : ''}`;
    return ofBlock.materials
      .filter((line) => !hasQuantity(line.quantity))
      .map((line) => ({ ofId: ofBlock.id, lineId: line.id, ofLabel, code: line.code, description: line.description }));
  });
}

export function countMissingQuantities(groups: { materials: { quantity: Quantity | undefined }[] }[]): number {
  return groups.reduce((count, group) => count + group.materials.filter((m) => !hasQuantity(m.quantity)).length, 0);
}
