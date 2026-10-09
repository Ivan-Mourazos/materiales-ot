import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isolatedServer } from './helpers/isolated-server.js';

async function isolatedDrafts(t) {
  const { importModule, dataFile } = await isolatedServer(t);
  return { api: await importModule('drafts.js'), file: dataFile('drafts.json') };
}

test('drafts CRUD operations and totals calculation', async (t) => {
  const { api } = await isolatedDrafts(t);

  const initialList = await api.listDrafts();
  assert.deepEqual(initialList, []);

  const saved = await api.saveDraft({
    name: 'Borrador Pedido AR260001',
    orderCode: 'AR260001',
    notes: 'Prueba de notas',
    ofs: [
      {
        of: '12345',
        description: 'Estructura toldo',
        materials: [
          { code: 'LONA01', description: 'Lona blanca', quantity: 15.5 },
          { code: 'PERFIL01', description: 'Perfil aluminio', quantity: 2 }
        ]
      }
    ]
  });

  assert.ok(saved.id);
  assert.equal(saved.orderCode, 'AR260001');
  assert.equal(saved.totals.ofs, 1);
  assert.equal(saved.totals.lines, 2);
  assert.equal(saved.totals.units, 17.5);

  const found = await api.getDraftById(saved.id);
  assert.equal(found.id, saved.id);
  assert.equal(found.name, 'Borrador Pedido AR260001');

  // Update draft
  const updated = await api.saveDraft({
    id: saved.id,
    name: 'Borrador Pedido AR260001 - Modificado',
    orderCode: 'AR260001',
    ofs: saved.ofs
  });
  assert.equal(updated.name, 'Borrador Pedido AR260001 - Modificado');

  // Delete draft
  await api.deleteDraft(saved.id);
  const afterDelete = await api.listDrafts();
  assert.equal(afterDelete.length, 0);
});

test('simultaneous draft saves preserve every draft', async (t) => {
  const { api } = await isolatedDrafts(t);
  const saved = await Promise.all(Array.from({ length: 6 }, (_, index) =>
    api.saveDraft({ name: `Borrador ${index}`, orderCode: `AR26000${index}`, ofs: [] })
  ));
  const ids = new Set((await api.listDrafts()).map((draft) => draft.id));
  assert.equal(new Set(saved.map((draft) => draft.id)).size, 6);
  assert.ok(saved.every((draft) => ids.has(draft.id)));
});

test('las líneas sin cantidad se guardan como null y no suman unidades', async (t) => {
  const { api } = await isolatedDrafts(t);
  const saved = await api.saveDraft({
    name: 'Con huecos',
    ofs: [{ of: '1', description: 'P', materials: [{ code: 'a', quantity: '' }, { code: 'b', quantity: 3 }] }]
  });
  assert.deepEqual(saved.ofs[0].materials.map((m) => m.quantity), [null, 3]);
  assert.equal(saved.totals.units, 3);
  assert.equal(saved.totals.lines, 2);
});

test('la descripción de la parte de origen se conserva', async (t) => {
  const { api } = await isolatedDrafts(t);
  const saved = await api.saveDraft({
    name: 'D',
    ofs: [
      { of: '', description: 'Faldón', partDescription: 'Rejilla y PVC', materials: [] },
      { of: '', description: 'Sin origen', materials: [] }
    ]
  });
  assert.equal(saved.ofs[0].partDescription, 'Rejilla y PVC');
  assert.equal('partDescription' in saved.ofs[1], false);
});

test('una cantidad no válida rechaza el borrador con 400', async (t) => {
  const { api } = await isolatedDrafts(t);
  await assert.rejects(
    api.saveDraft({ name: 'D', ofs: [{ of: '7', materials: [{ code: 'X', quantity: 'abc' }] }] }),
    (error) => error.statusCode === 400 && error.message.includes('X de la OF 7')
  );
});

test('conflictos en borradores: 409 con versión vieja, guarda sin versión', async (t) => {
  const { api, file } = await isolatedDrafts(t);
  const v0 = await api.saveDraft({ name: 'D', ofs: [] });
  const v1 = await api.saveDraft({ id: v0.id, name: 'D1', ofs: [], expectedUpdatedAt: v0.updatedAt });
  assert.ok(v1.updatedAt > v0.updatedAt);

  const antes = await readFile(file, 'utf8');
  await assert.rejects(
    api.saveDraft({ id: v0.id, name: 'D2', ofs: [], expectedUpdatedAt: v0.updatedAt }),
    (error) => error.statusCode === 409 && error.payload.current.name === 'D1'
  );
  assert.equal(await readFile(file, 'utf8'), antes);
  assert.equal((await api.saveDraft({ id: v0.id, name: 'D3', ofs: [] })).name, 'D3');
});
