// Comprobación de stock antes de reservar (Iván, 06/11/2026). Compara lo que pide la asignación
// con lo que hay libre en RPS y avisa de lo bloqueado para fabricación. Solo avisa: la reserva se
// puede generar igualmente (hay material que se pide justo ahora, o se fabrica sin stock).
//
// «Libre» = stock físico de almacenes vigentes − reserva física registrada contra OF abiertas
// (las mismas cifras que la ficha de artículo). No descuenta las necesidades de OF sin reservar.

const round = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

/** Suma por código lo que pide la asignación (un mismo artículo puede ir en varias OFs). */
export function requestedByCode(ofs) {
  const totals = new Map();
  for (const ofBlock of ofs || []) {
    for (const line of ofBlock.materials || []) {
      const code = String(line.code || '').trim().toUpperCase();
      const quantity = Number(line.quantity);
      if (!code || !Number.isFinite(quantity) || quantity <= 0) continue;
      totals.set(code, round((totals.get(code) || 0) + quantity));
    }
  }
  return totals;
}

/**
 * Avisos de la asignación.
 * - `requested`: Map código → cantidad pedida (de `requestedByCode`).
 * - `stock`: Map código → { description, unit, physical, reserved, blockedManufacturing, pendingPurchases, nextReceipt }.
 * Devuelve { shortages, blocked, unknown }: lo que falta, lo bloqueado para fabricación y los códigos
 * que RPS no conoce (de esos no se puede saber el stock).
 */
export function checkStock(requested, stock) {
  const shortages = [];
  const blocked = [];
  const unknown = [];

  for (const [code, quantity] of requested) {
    const info = stock.get(code);
    if (!info) {
      unknown.push(code);
      continue;
    }
    if (info.blockedManufacturing) {
      blocked.push({ code, description: info.description || '' });
    }
    const free = round(Math.max(0, (info.physical || 0) - (info.reserved || 0)));
    if (quantity > free + 0.0005) {
      shortages.push({
        code,
        description: info.description || '',
        unit: info.unit || '',
        requested: quantity,
        physical: round(info.physical),
        reserved: round(info.reserved),
        free,
        missing: round(quantity - free),
        pendingPurchases: info.pendingPurchases || 0,
        nextReceipt: info.nextReceipt || null
      });
    }
  }

  return { shortages, blocked, unknown };
}

/** Los avisos como texto, uno por artículo, para el diálogo de confirmación. */
export function describeStockWarnings({ shortages, blocked }) {
  const format = (value) => String(round(value)).replace('.', ',');
  const lines = shortages.map((item) => {
    const incoming = item.pendingPurchases
      ? ` Hay compra pendiente${item.nextReceipt ? ` (llega ${item.nextReceipt.split('-').reverse().join('/')})` : ''}.`
      : '';
    return `${item.code}: pides ${format(item.requested)} ${item.unit} y hay ${format(item.free)} libres (faltan ${format(item.missing)}).${incoming}`;
  });
  for (const item of blocked) {
    lines.push(`${item.code}: bloqueado para fabricación en RPS («No se fabrica»).`);
  }
  return lines;
}
