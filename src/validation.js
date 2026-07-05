export function normalizeReservation(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('La solicitud no tiene formato válido.');
  }

  const orderCode = cleanText(payload.orderCode || payload.pedido || '');
  const ofs = Array.isArray(payload.ofs) ? payload.ofs : [];

  if (ofs.length === 0) {
    throw new Error('Añade al menos una OF.');
  }

  const normalizedOfs = ofs.map((ofBlock, index) => {
    const of = cleanText(ofBlock?.of);
    if (!of) {
      throw new Error(`La OF ${index + 1} no tiene número.`);
    }

    const description = cleanText(ofBlock?.description).slice(0, 120);

    const materials = Array.isArray(ofBlock?.materials) ? ofBlock.materials : [];
    const normalizedMaterials = materials
      .flatMap((line) => {
        const code = cleanText(line?.code || line?.codArticle || line?.articleCode).toUpperCase();
        const description = cleanText(line?.description);
        const quantity = Number(line?.quantity);

        if (!code && !description && !quantity) return [];
        if (!code) throw new Error(`Hay una línea sin artículo en la OF ${of}.`);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`La cantidad de ${code} en la OF ${of} debe ser mayor que cero.`);
        }

        return [{
          code,
          description,
          quantity: roundQuantity(quantity)
        }];
      });

    if (normalizedMaterials.length === 0) {
      throw new Error(`La OF ${of} no tiene materiales.`);
    }

    return { of, description, materials: normalizedMaterials };
  });

  return { orderCode, ofs: normalizedOfs };
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function roundQuantity(value) {
  return Math.round(value * 1000000) / 1000000;
}
