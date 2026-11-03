// Despiece real de un pedido: lo que se gastó de verdad en cada OF (CPRImputationMaterialMO),
// comparado con lo que se reservó (CPRMOMaterial). Sirve para copiar el despiece de un pedido
// ya fabricado y para ver qué se gastó sin estar previsto.

const EPSILON = 0.005;

const round = (value) => Math.round(value * 100) / 100;

/**
 * Agrupa filas { of, code, description, quantity } en un Map de OF → Map de código → { description, quantity }.
 * Un mismo artículo puede tener varios apuntes en días distintos: se suman.
 */
function groupByOf(rows) {
  const byOf = new Map();
  for (const row of rows) {
    const of = String(row.of || '').trim();
    const code = String(row.code || '').trim().toUpperCase();
    if (!of || !code) continue;
    if (!byOf.has(of)) byOf.set(of, new Map());
    const lines = byOf.get(of);
    const current = lines.get(code) || { description: String(row.description || '').trim(), quantity: 0 };
    current.quantity += Number(row.quantity) || 0;
    lines.set(code, current);
  }
  return byOf;
}

/**
 * Busca material que se reservó en una OF y se apuntó en otra del mismo pedido: la falta de una
 * cuadra exactamente con el sobrante de la otra (en el AR.26.03201, 220 piquetes de la 0229925 se
 * imputaron a la 0229926). Solo se empareja cuando la cantidad coincide, para no adivinar.
 */
export function findTransfers(imputedByOf, reservedByOf) {
  const deficits = []; // reservado y no gastado en esa OF
  const surpluses = []; // gastado de más en esa OF
  const ofs = new Set([...imputedByOf.keys(), ...reservedByOf.keys()]);

  for (const of of ofs) {
    const imputed = imputedByOf.get(of) || new Map();
    const reserved = reservedByOf.get(of) || new Map();
    for (const code of new Set([...imputed.keys(), ...reserved.keys()])) {
      const diff = (imputed.get(code)?.quantity || 0) - (reserved.get(code)?.quantity || 0);
      if (diff > EPSILON) surpluses.push({ of, code, quantity: diff });
      if (diff < -EPSILON) deficits.push({ of, code, quantity: -diff });
    }
  }

  const transfers = [];
  const used = new Set();
  for (const deficit of deficits) {
    const match = surpluses.find(
      (surplus) =>
        !used.has(surplus) &&
        surplus.code === deficit.code &&
        surplus.of !== deficit.of &&
        Math.abs(surplus.quantity - deficit.quantity) < EPSILON
    );
    if (!match) continue;
    used.add(match);
    const description =
      imputedByOf.get(match.of)?.get(match.code)?.description ||
      reservedByOf.get(deficit.of)?.get(deficit.code)?.description ||
      '';
    transfers.push({ code: deficit.code, description, quantity: round(deficit.quantity), from: match.of, to: deficit.of });
  }
  return transfers;
}

/**
 * Arma el despiece real por OF.
 * - `ofs`: las OFs del pedido ({ of, piece, units }), en su orden.
 * - `imputed` / `reserved`: filas { of, code, description, quantity }.
 * - `fixTransfers`: si es true, el material apuntado en la OF de al lado vuelve a la suya.
 * Cada OF trae `materials` (lo gastado, que es lo que se copia), `unplanned` (gastado sin estar
 * reservado) y `unused` (reservado y sin gastar). `transfers` lista los cambios de OF detectados.
 */
export function buildConsumption({ ofs, imputed, reserved, fixTransfers = true }) {
  const imputedByOf = groupByOf(imputed);
  const reservedByOf = groupByOf(reserved);
  const transfers = findTransfers(imputedByOf, reservedByOf);

  // Copia de trabajo de lo gastado, para poder devolver los traspasos sin tocar lo original
  const realByOf = new Map();
  for (const [of, lines] of imputedByOf) {
    realByOf.set(of, new Map([...lines].map(([code, line]) => [code, { ...line }])));
  }

  if (fixTransfers) {
    for (const transfer of transfers) {
      const from = realByOf.get(transfer.from)?.get(transfer.code);
      if (from) from.quantity -= transfer.quantity;
      if (!realByOf.has(transfer.to)) realByOf.set(transfer.to, new Map());
      const target = realByOf.get(transfer.to);
      const current = target.get(transfer.code) || { description: transfer.description, quantity: 0 };
      current.quantity += transfer.quantity;
      target.set(transfer.code, current);
    }
  }

  const known = new Set(ofs.map((item) => String(item.of).trim()));
  const allOfs = [
    ...ofs.map((item) => ({ of: String(item.of).trim(), piece: item.piece || '', units: Number(item.units) || 0 })),
    // OFs con apuntes pero que no salieron en la lista del pedido (no debería pasar, pero no se pierden)
    ...[...realByOf.keys()].filter((of) => !known.has(of)).map((of) => ({ of, piece: '', units: 0 }))
  ];

  const result = allOfs.map(({ of, piece, units }) => {
    const real = realByOf.get(of) || new Map();
    const planned = reservedByOf.get(of) || new Map();
    const materials = [...real]
      .filter(([, line]) => line.quantity > EPSILON)
      .map(([code, line]) => ({ code, description: line.description, quantity: round(line.quantity) }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const unplanned = materials
      .filter((line) => !(planned.get(line.code)?.quantity > EPSILON))
      .map(({ code, description, quantity }) => ({ code, description, quantity }));
    const unused = [...planned]
      .filter(([code, line]) => line.quantity > EPSILON && !(real.get(code)?.quantity > EPSILON))
      .map(([code, line]) => ({ code, description: line.description, reserved: round(line.quantity) }))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { of, piece, units, materials, unplanned, unused };
  });

  return {
    ofs: result,
    transfers,
    totals: {
      ofs: result.length,
      ofsWithMaterial: result.filter((item) => item.materials.length > 0).length,
      lines: result.reduce((sum, item) => sum + item.materials.length, 0),
      unplanned: result.reduce((sum, item) => sum + item.unplanned.length, 0),
      unused: result.reduce((sum, item) => sum + item.unused.length, 0)
    }
  };
}
