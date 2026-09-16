import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

// Exercise the real persistence module against an isolated library.
async function isolatedLibrary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'materiales-models-test-'));
  await mkdir(path.join(directory, 'src'));
  const moduleFile = path.join(directory, 'src', 'models.mjs');
  await copyFile(new URL('../src/models.js', import.meta.url), moduleFile);
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    api: await import(pathToFileURL(moduleFile).href),
    file: path.join(directory, 'data', 'models.json')
  };
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
