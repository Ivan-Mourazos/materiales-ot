import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

async function isolatedDrafts(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'materiales-drafts-test-'));
  await mkdir(path.join(directory, 'src'));
  const moduleFile = path.join(directory, 'src', 'drafts.mjs');
  await copyFile(new URL('../src/drafts.js', import.meta.url), moduleFile);
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    api: await import(pathToFileURL(moduleFile).href),
    file: path.join(directory, 'data', 'drafts.json')
  };
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
