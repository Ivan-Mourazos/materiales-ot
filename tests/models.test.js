import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { isolatedServer } from './helpers/isolated-server.js';

// Exercise the real persistence module against an isolated library.
async function isolatedLibrary(t) {
  const { importModule, dataFile } = await isolatedServer(t);
  return { api: await importModule('models.js'), file: dataFile('models.json'), dataFile };
}

test('unreadable or malformed library is preserved and writes recover after repair', async (t) => {
  const { api, file } = await isolatedLibrary(t);
  await api.saveModel({ name: 'Modelo conservado', parts: [] });
  const original = await readFile(file, 'utf8');

  for (const damaged of ['{incomplete', '{"unexpected":"format"}']) {
    await writeFile(file, damaged);
    await assert.rejects(api.listModels());
    await assert.rejects(api.saveModel({ name: 'No debe guardarse', parts: [] }));
    await assert.rejects(api.deleteModel('unknown'));
    assert.equal(await readFile(file, 'utf8'), damaged);

    await writeFile(file, original);
    const saved = await api.saveModel({ name: 'Guardado tras reparar', parts: [] });
    assert.ok((await api.listModels()).some((model) => model.id === saved.id));
    await api.deleteModel(saved.id);
    assert.ok(!(await api.listModels()).some((model) => model.id === saved.id));
  }
});

test('simultaneous saves preserve every model', async (t) => {
  const { api } = await isolatedLibrary(t);
  const saved = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    api.saveModel({ name: `Modelo ${index}`, parts: [] })
  ));
  const ids = new Set((await api.listModels()).map((model) => model.id));
  assert.equal(new Set(saved.map((model) => model.id)).size, 8);
  assert.ok(saved.every((model) => ids.has(model.id)));
});

const lineas = (...materials) => [{ name: 'Faldón', description: 'Rejilla y PVC', materials }];

test('las líneas sin cantidad se guardan como null y se leen igual', async (t) => {
  const { api } = await isolatedLibrary(t);
  const saved = await api.saveModel({
    name: 'Escenario',
    parts: lineas(
      { code: 'a', quantity: null },
      { code: 'b', quantity: '' },
      { code: 'c', quantity: 0 },
      { code: 'd', quantity: '2,5' }
    )
  });
  const leido = await api.getModelById(saved.id);
  assert.deepEqual(leido.parts[0].materials.map((m) => [m.code, m.quantity]), [
    ['A', null], ['B', null], ['C', null], ['D', 2.5]
  ]);
});

test('una cantidad no válida rechaza el guardado con 400 y no escribe', async (t) => {
  const { api, file } = await isolatedLibrary(t);
  await api.saveModel({ name: 'Bueno', parts: [] });
  const antes = await readFile(file, 'utf8');
  t.mock.method(console, 'error', () => {});

  await assert.rejects(
    api.saveModel({ name: 'Malo', parts: lineas({ code: 'LONA01', quantity: -2 }) }),
    (error) => error.statusCode === 400 && error.message.includes('LONA01 de «Faldón»')
  );
  assert.equal(await readFile(file, 'utf8'), antes);
});

test('actualizar solo toca nombre, descripción y partes', async (t) => {
  const { api } = await isolatedLibrary(t);
  const saved = await api.saveModel({ name: 'Original', description: 'd', parts: [] });
  const updated = await api.saveModel({
    id: saved.id,
    name: 'Renombrado',
    parts: lineas({ code: 'X', quantity: 1 }),
    expectedUpdatedAt: saved.updatedAt,
    createdAt: '1999-01-01T00:00:00.000Z',
    intruso: 'no debería guardarse'
  });
  assert.equal(updated.name, 'Renombrado');
  assert.equal(updated.description, 'd');
  assert.equal(updated.createdAt, saved.createdAt);
  assert.ok(updated.updatedAt > saved.updatedAt);
  assert.equal('expectedUpdatedAt' in updated, false);
  assert.equal('intruso' in updated, false);
});

test('conflictos: misma versión guarda, otra da 409 sin escribir, sin versión guarda', async (t) => {
  const { api, file } = await isolatedLibrary(t);
  t.mock.method(console, 'error', () => {});
  const v0 = await api.saveModel({ name: 'M', parts: [] });
  const v1 = await api.saveModel({ id: v0.id, name: 'M1', parts: [], expectedUpdatedAt: v0.updatedAt });
  assert.equal(v1.name, 'M1');

  const antes = await readFile(file, 'utf8');
  await assert.rejects(
    api.saveModel({ id: v0.id, name: 'M2', parts: [], expectedUpdatedAt: v0.updatedAt }),
    (error) => error.statusCode === 409 && error.payload.current.name === 'M1'
  );
  assert.equal(await readFile(file, 'utf8'), antes);

  const forzado = await api.saveModel({ id: v0.id, name: 'M3', parts: [] });
  assert.equal(forzado.name, 'M3');
});

test('dos actualizaciones simultáneas con la misma versión: una guarda y la otra da 409', async (t) => {
  const { api } = await isolatedLibrary(t);
  t.mock.method(console, 'error', () => {});
  const v0 = await api.saveModel({ name: 'M', parts: [] });
  const resultados = await Promise.allSettled([
    api.saveModel({ id: v0.id, name: 'A', parts: [], expectedUpdatedAt: v0.updatedAt }),
    api.saveModel({ id: v0.id, name: 'B', parts: [], expectedUpdatedAt: v0.updatedAt })
  ]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(resultados.find((r) => r.status === 'rejected').reason.statusCode, 409);
});

test('cada guardado deja una instantánea de la versión anterior', async (t) => {
  const { api, dataFile } = await isolatedLibrary(t);
  const saved = await api.saveModel({ name: 'M', parts: [] });
  await api.saveModel({ id: saved.id, name: 'M2', parts: [] });
  const backups = await readdir(dataFile('backups'));
  assert.ok(backups.some((name) => name.startsWith('models-')));
});
