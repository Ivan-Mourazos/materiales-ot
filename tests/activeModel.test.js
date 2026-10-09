import assert from 'node:assert/strict';
import test from 'node:test';
import { describeActiveModel } from '../src/client/activeModel.ts';

const modelo = {
  id: 'm1',
  name: 'Escenario Orquesta ODL 720 EE',
  description: 'Base',
  createdAt: '2026-09-16T08:44:04.000Z',
  updatedAt: '2026-10-09T08:58:44.000Z',
  parts: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
};

test('carga completa, ×1 y reemplazando: se puede actualizar', () => {
  const activo = describeActiveModel(modelo, { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: false });
  assert.deepEqual(activo, {
    id: 'm1',
    name: 'Escenario Orquesta ODL 720 EE',
    description: 'Base',
    category: '',
    updatedAt: '2026-10-09T08:58:44.000Z',
    updatable: true,
    reason: null
  });
});

test('cada trampa de la carga impide actualizar y lo explica', () => {
  assert.equal(
    describeActiveModel(modelo, { multiplier: 2.5, partsLoaded: 3, appendedToOtherOfs: false }).reason,
    'Lo cargaste ×2,5: se guardarían las cantidades multiplicadas como base.'
  );
  assert.equal(
    describeActiveModel(modelo, { multiplier: 1, partsLoaded: 2, appendedToOtherOfs: false }).reason,
    'Cargaste 2 de 3 partes: el modelo perdería las demás.'
  );
  assert.equal(
    describeActiveModel(modelo, { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: true }).reason,
    'Lo añadiste encima de otras OFs: el modelo se quedaría con OFs ajenas.'
  );
  assert.equal(describeActiveModel(modelo, { multiplier: 3, partsLoaded: 1, appendedToOtherOfs: true }).updatable, false);
});

test('sin updatedAt se usa createdAt como versión', () => {
  const { updatedAt } = describeActiveModel({ ...modelo, updatedAt: undefined }, { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: false });
  assert.equal(updatedAt, '2026-09-16T08:44:04.000Z');
});

test('el modelo activo recuerda la categoría', () => {
  const activo = describeActiveModel(
    { ...modelo, category: 'Escenarios' },
    { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: false }
  );
  assert.equal(activo.category, 'Escenarios');
});
