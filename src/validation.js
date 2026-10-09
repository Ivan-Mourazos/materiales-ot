import { httpError } from './httpError.js';

export function normalizeReservation(payload) {
  if (!payload || typeof payload !== 'object') {
    throw validationError('La solicitud no tiene formato válido.');
  }

  const orderCode = cleanText(payload.orderCode || payload.pedido || '');
  const ofs = Array.isArray(payload.ofs) ? payload.ofs : [];

  if (ofs.length === 0) {
    throw validationError('Añade al menos una OF.');
  }

  const normalizedOfs = ofs.map((ofBlock, index) => {
    const of = cleanText(ofBlock?.of);
    if (!of) {
      throw validationError(`La OF ${index + 1} no tiene número.`);
    }

    const description = cleanText(ofBlock?.description).slice(0, 120);

    const materials = Array.isArray(ofBlock?.materials) ? ofBlock.materials : [];
    const normalizedMaterials = materials
      .flatMap((line) => {
        const code = cleanText(line?.code || line?.codArticle || line?.articleCode).toUpperCase();
        const description = cleanText(line?.description);
        const missing = isMissingQuantity(line?.quantity);

        if (!code && !description && missing) return [];
        if (!code) throw validationError(`Hay una línea sin artículo en la OF ${of}.`);
        if (missing) throw validationError(`Falta la cantidad de ${code} en la OF ${of}.`);

        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) {
          throw validationError(`La cantidad de ${code} en la OF ${of} no es válida.`);
        }

        // Una cantidad minúscula que al redondear queda en 0 equivale a no tener cantidad
        const rounded = roundQuantity(quantity);
        if (rounded <= 0) throw validationError(`Falta la cantidad de ${code} en la OF ${of}.`);

        return [{
          code,
          description,
          quantity: rounded
        }];
      });

    if (normalizedMaterials.length === 0) {
      throw validationError(`La OF ${of} no tiene materiales.`);
    }

    return { of, description, materials: normalizedMaterials };
  });

  return { orderCode, ofs: normalizedOfs };
}

// Vacío, null o 0 = la línea aún no tiene cantidad (los modelos y borradores lo permiten).
function isMissingQuantity(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return Number(value) === 0;
}

function validationError(message) {
  return httpError(400, message);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function roundQuantity(value) {
  return Math.round(value * 1000000) / 1000000;
}
