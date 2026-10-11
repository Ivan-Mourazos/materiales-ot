import { httpError } from './httpError.js';

/**
 * Cantidad de una línea guardada en un modelo o un borrador.
 * `null` significa "sin cantidad todavía": se rellena al hacer la reserva.
 * Un 0 también se guarda como `null`, para que no haya dos formas de decir lo mismo.
 */
export function normalizeStoredQuantity(value, context = '') {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw invalidQuantity(value, context);

  const text = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  if (text === '') return null;
  if (typeof text === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    throw invalidQuantity(value, context);
  }

  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity < 0) throw invalidQuantity(value, context);

  const rounded = Math.round(quantity * 1000000) / 1000000;
  if (!Number.isFinite(rounded)) throw invalidQuantity(value, context);
  return rounded === 0 ? null : rounded;
}

function invalidQuantity(value, context) {
  const where = context ? ` en ${context}` : '';
  return httpError(400, `Cantidad no válida${where}: ${String(value)}.`);
}
