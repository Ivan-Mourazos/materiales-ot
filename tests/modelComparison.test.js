import assert from 'node:assert/strict';
import test from 'node:test';
import { compareModel, applyModelComparison } from '../src/client/modelComparison.ts';

const material = (code, quantity) => ({ id: code, code, description: code, quantity });
const model = { id: 'modelo', name: 'Prueba', createdAt: '', parts: [{ id: 'parte', name: 'Telón delantero', materials: [material('MOTOR', 1), material('SOBRA', 2), material('VACIO', null)] }] };
const of = (units, materials, piece = ' TELON   DELANTERO ') => ({ of: '1', piece, units, materials, unplanned: [], unused: [] });
const report = (order, ofs) => ({ order, ofs, transfers: [], totals: {} });

test('comparación: agrupa OFs de una pieza y normaliza por sus unidades', () => {
  const result = compareModel(model, [report('AR.26.00001', [of(2, [material('MOTOR', 4), material('NUEVO', 8)]), of(1, [material('MOTOR', 2), material('NUEVO', 4)])])]);
  const rows = result.parts[0].rows;
  assert.equal(rows.find((row) => row.code === 'MOTOR').realQuantity, 2);
  assert.equal(rows.find((row) => row.code === 'NUEVO').realQuantity, 4);
  assert.equal(rows.find((row) => row.code === 'NUEVO').status, 'falta');
  assert.equal(rows.find((row) => row.code === 'SOBRA').status, 'sobra');
  assert.equal(rows.find((row) => row.code === 'VACIO').modelQuantity, null);
});
test('comparación: mediana entre pedidos, ceros por ausencia y pedidos únicos', () => {
  const first = report('AR.26.00001', [of(2, [material('MOTOR', 4), material('NUEVO', 8)])]);
  const result = compareModel(model, [first, { ...first, order: 'AR2600001' }, report('AR.26.00002', [of(1, [material('MOTOR', 4)])])]);
  const row = result.parts[0].rows.find((item) => item.code === 'NUEVO');
  assert.deepEqual([row.realQuantity, row.present, row.orders], [2, 1, 2]);
});
test('comparación: no propone borrar partes sin historial, sin unidades o sin imputaciones', () => {
  const result = compareModel(model, [report('AR.26.00001', [of(0, [material('MOTOR', 4)])]), report('AR.26.00002', [of(1, [])])]);
  assert.deepEqual(result.parts[0].rows, []);
  assert.equal(result.warnings.length, 3);
  assert.deepEqual(applyModelComparison(model, result, new Set(), () => 'nueva'), model.parts);
});
test('comparación: nombres de partes duplicados no reutilizan la misma pieza', () => {
  const duplicate = { ...model, parts: [...model.parts, { ...model.parts[0], id: 'otra' }] };
  assert.ok(compareModel(duplicate, [report('AR1', [of(1, [material('MOTOR', 2)])])]).parts.every((part) => !part.rows.length));
});
test('comparación: correspondencia manual explícita conserva el nombre del modelo', () => {
  const source = { ...model, parts: [{ ...model.parts[0], name: 'Nombre de oficina técnica' }] };
  const reports = [report('AR1', [of(1, [material('MOTOR', 2)])])];
  assert.equal(compareModel(source, reports).parts[0].rows.length, 0);
  const comparison = compareModel(source, reports, { parte: 'telón delantero' });
  assert.ok(comparison.parts[0].rows.length > 0);
  const selected = new Set(comparison.parts[0].rows.map((row) => row.key));
  assert.equal(applyModelComparison(source, comparison, selected, () => 'nueva')[0].name, 'Nombre de oficina técnica');
});
test('aplicar comparación: cambia solo lo marcado, añade, elimina y conserva metadatos', () => {
  const original = structuredClone(model);
  const result = compareModel(model, [report('AR1', [of(2, [material('MOTOR', 4), material('NUEVO', 8)])])]);
  const selected = new Set(result.parts[0].rows.filter((row) => row.code !== 'VACIO').map((row) => row.key));
  const parts = applyModelComparison(model, result, selected, () => 'nueva');
  assert.equal(parts[0].materials.find((line) => line.code === 'MOTOR').quantity, 2);
  assert.equal(parts[0].materials.find((line) => line.code === 'MOTOR').id, 'MOTOR');
  assert.equal(parts[0].materials.find((line) => line.code === 'NUEVO').id, 'nueva');
  assert.ok(!parts[0].materials.some((line) => line.code === 'SOBRA'));
  assert.equal(parts[0].materials.find((line) => line.code === 'VACIO').quantity, null);
  assert.deepEqual(model, original);
});
