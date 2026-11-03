// Pedidos y OFs tal como los guarda RPS.
// - El pedido va con puntos: `AR.26.03201` (CPRManufacturingOrder.InternalCode). Hay otras series con otro
//   formato (`BE.26000008`), así que para comparar se quitan los puntos: `AR2603201`.
//   En la web se escribe de cualquier forma: `AR2603201`, `ar.26.03201`, `AR.26.03201/1`…
// - La OF lleva siete cifras con ceros delante: `0229920`. Es única dentro de la empresa.

/** Clave para comparar pedidos: mayúsculas, sin puntos ni espacios y sin la línea (`/1`). Null si está vacío. */
export function orderKey(value) {
  const raw = String(value || '').toUpperCase().split('/')[0].trim();
  // Con puntos se sabe dónde empieza el número: `AR.26.3201` es el 03201.
  const dotted = /^([A-Z]{1,4})\s*\.\s*(\d{2})\s*\.\s*(\d{1,5})$/.exec(raw);
  if (dotted) return `${dotted[1]}${dotted[2]}${dotted[3].padStart(5, '0')}`;
  const text = raw.replace(/[^A-Z0-9]+/g, '');
  return /^[A-Z]{1,4}\d{4,}$/.test(text) ? text : null;
}

/** Cómo lo escribe RPS en la serie habitual (AR.26.03201); sirve para buscar por igualdad exacta. */
export function toDottedOrderCode(value) {
  const key = orderKey(value);
  const match = key && /^([A-Z]{1,4})(\d{2})(\d{5})$/.exec(key);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null;
}

/** Normaliza un nº de OF para compararlo con RPS: solo cifras, con ceros delante hasta siete. */
export function toRpsOfCode(value) {
  const text = String(value || '').trim();
  if (!/^\d{1,7}$/.test(text)) return null;
  return text.padStart(7, '0');
}

/** La pieza que fabrica una línea de pedido: lo que va tras los dos puntos de la descripción. */
export function pieceFromOrderLine(description) {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  const colon = text.indexOf(':');
  const piece = colon >= 0 ? text.slice(colon + 1).trim() : text;
  return piece || text;
}

/**
 * Compara las OFs de una reserva con lo que dice RPS.
 * `owners` es un Map de OF (siete cifras) → pedido de RPS (`AR.26.03201`, o '' si la OF no tiene pedido).
 * Devuelve los avisos en castellano, uno por OF con problema.
 */
export function findOfMismatches({ orderCode, ofs, owners }) {
  const wanted = orderKey(orderCode);
  const warnings = [];

  for (const rawOf of ofs) {
    const of = toRpsOfCode(rawOf);
    if (!of) {
      warnings.push(`OF ${String(rawOf).trim() || '(vacía)'}: no tiene formato de OF de RPS`);
      continue;
    }
    if (!owners.has(of)) {
      warnings.push(`OF ${of}: no existe en RPS`);
      continue;
    }
    const owner = owners.get(of) || '';
    if (wanted && owner && orderKey(owner) !== wanted) {
      warnings.push(`OF ${of}: es del pedido ${owner}`);
    }
  }

  return warnings;
}
