import type { AssignmentModel, ModelPart } from './types';
import type { ConsumptionReport } from './consumptionLoad';
import { normalizePiece } from '../pieceNames.js';

export type ComparisonRow = {
  key: string; code: string; description: string; modelQuantity: number | null; realQuantity: number;
  difference: number | null; present: number; orders: number; status: 'falta' | 'sobra' | 'cambia' | 'igual';
};
export type PartComparison = { partId: string; name: string; orders: string[]; rows: ComparisonRow[] };
export type ModelComparison = { parts: PartComparison[]; warnings: string[] };
const round = (value: number) => Math.round(value * 100) / 100;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const codeKey = (code: string) => code.trim().toUpperCase();

/** Cada pedido aporta una muestra por pieza: suma de consumos / suma de unidades de sus OFs. */
export function compareModel(model: AssignmentModel, reports: ConsumptionReport[], pieceMatches: Record<string, string> = {}): ModelComparison {
  const warnings: string[] = [];
  const names = model.parts.map((part) => normalizePiece(pieceMatches[part.id] ?? part.name));
  const uniqueReports = [...new Map(reports.filter((report) => report.order).map((report) => [report.order!.replace(/[^a-z0-9]/gi, '').toUpperCase(), report])).values()];
  const parts = model.parts.map((part, index) => {
    const name = names[index];
    const samples: { order: string; materials: Map<string, { description: string; quantity: number }> }[] = [];
    if (!name || names.filter((item) => item === name).length !== 1) {
      warnings.push(`${part.name}: pieza vacía o asignada a varias partes; no se puede emparejar sin ambigüedad.`);
      return { partId: part.id, name: part.name, orders: [], rows: [] };
    }
    for (const report of uniqueReports) {
      const ofs = report.ofs.filter((item) => normalizePiece(item.piece) === name);
      if (!ofs.length) continue;
      if (ofs.some((item) => !Number.isFinite(item.units) || item.units <= 0 || !item.materials.length)) {
        warnings.push(`${report.order} · ${part.name}: se omite esta pieza porque tiene OFs sin unidades válidas o sin imputaciones.`);
        continue;
      }
      const units = ofs.reduce((sum, item) => sum + item.units, 0);
      const materials = new Map<string, { description: string; quantity: number }>();
      for (const line of ofs.flatMap((item) => item.materials)) {
        const code = codeKey(line.code);
        if (!code || !Number.isFinite(line.quantity)) continue;
        const current = materials.get(code) || { description: line.description, quantity: 0 };
        current.quantity += line.quantity / units;
        materials.set(code, current);
      }
      samples.push({ order: report.order!, materials });
    }
    const planned = new Map<string, { description: string; quantity: number | null }>();
    for (const line of part.materials) {
      const code = codeKey(line.code);
      const previous = planned.get(code);
      planned.set(code, { description: line.description, quantity: line.quantity === null || previous?.quantity === null ? null : (previous?.quantity || 0) + line.quantity });
    }
    const codes = new Set([...planned.keys(), ...samples.flatMap((sample) => [...sample.materials.keys()])]);
    const rows: ComparisonRow[] = samples.length ? [...codes].sort().map((code) => {
      const base = planned.get(code);
      const realQuantity = round(median(samples.map((sample) => Math.max(0, sample.materials.get(code)?.quantity || 0))));
      const present = samples.filter((sample) => (sample.materials.get(code)?.quantity || 0) > 0).length;
      const modelQuantity = base ? base.quantity : 0;
      const difference = modelQuantity === null ? null : round(realQuantity - modelQuantity);
      return { key: JSON.stringify([part.id, code]), code, description: base?.description || samples.find((sample) => sample.materials.has(code))?.materials.get(code)?.description || '',
        modelQuantity, realQuantity, difference, present, orders: samples.length,
        status: !base ? 'falta' : present === 0 ? 'sobra' : difference === 0 ? 'igual' : 'cambia' };
    }) : [];
    if (!samples.length) warnings.push(`${part.name}: sin pedidos comparables; no se proponen cambios.`);
    return { partId: part.id, name: part.name, orders: samples.map((sample) => sample.order), rows };
  });
  for (const report of uniqueReports) {
    const unmatched = [...new Set(report.ofs.map((item) => item.piece).filter((piece) => !names.includes(normalizePiece(piece))))];
    if (unmatched.length) warnings.push(`${report.order}: piezas sin parte en el modelo: ${unmatched.join(', ')}.`);
  }
  return { parts, warnings };
}

/** Solo toca códigos seleccionados. Un sobrante se elimina; los demás conservan sus datos. */
export function applyModelComparison(model: AssignmentModel, comparison: ModelComparison, selected: Set<string>, newId: () => string): ModelPart[] {
  return model.parts.map((part) => {
    const changes = comparison.parts.find((item) => item.partId === part.id)?.rows.filter((row) => selected.has(row.key) && row.status !== 'igual' && (row.status === 'sobra' || row.realQuantity > 0)) || [];
    if (!changes.length) return part;
    const materials = part.materials.filter((line) => !changes.some((row) => row.code === codeKey(line.code)));
    for (const row of changes) {
      if (row.status === 'sobra') continue;
      const previous = part.materials.find((line) => codeKey(line.code) === row.code);
      materials.push({ ...(previous || { id: newId(), code: row.code, description: row.description }), quantity: row.realQuantity });
    }
    return { ...part, materials };
  });
}
