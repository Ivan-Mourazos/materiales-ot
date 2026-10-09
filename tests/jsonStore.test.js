import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertExpectedVersion, nextVersion, readJsonArray, writeJsonArray } from '../src/jsonStore.js';

async function carpetaTemporal(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'materiales-store-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const instantaneas = async (directory, prefijo = 'models-') =>
  (await readdir(path.join(directory, 'backups'))).filter((name) => name.startsWith(prefijo)).sort();

test('si no existe, se crea con la semilla; si está corrupto, se lanza error sin tocarlo', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  assert.deepEqual(await readJsonArray(file, [{ id: 'a' }]), [{ id: 'a' }]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ id: 'a' }]);

  for (const roto of ['{incompleto', '{"no":"es una lista"}']) {
    await writeFile(file, roto);
    await assert.rejects(readJsonArray(file));
    assert.equal(await readFile(file, 'utf8'), roto);
  }
});

test('cada escritura guarda antes la versión anterior', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 1 }]);
  await assert.rejects(readdir(path.join(directory, 'backups')), { code: 'ENOENT' });

  await writeJsonArray(file, [{ v: 2 }]);
  const [unica] = await instantaneas(directory);
  assert.match(unica, /^models-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d{6}\.json$/);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'backups', unica), 'utf8')), [{ v: 1 }]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ v: 2 }]);
});

test('se conservan solo las más recientes, y solo se podan las de ese nombre', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 0 }]);
  await writeJsonArray(path.join(directory, 'drafts.json'), []);
  await writeJsonArray(path.join(directory, 'drafts.json'), [{ d: 1 }]);

  for (let v = 1; v <= 8; v += 1) await writeJsonArray(file, [{ v }], { keep: 3 });

  const quedan = await instantaneas(directory);
  assert.equal(quedan.length, 3);
  const contenidos = await Promise.all(quedan.map(async (name) =>
    JSON.parse(await readFile(path.join(directory, 'backups', name), 'utf8'))[0].v));
  assert.deepEqual(contenidos, [5, 6, 7]);
  assert.equal((await instantaneas(directory, 'drafts-')).length, 1);
});

test('si no se puede hacer la instantánea, el guardado se completa igual', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 1 }]);
  await writeFile(path.join(directory, 'backups'), 'esto es un archivo, no una carpeta');
  const aviso = t.mock.method(console, 'error', () => {});

  await writeJsonArray(file, [{ v: 2 }]);

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ v: 2 }]);
  assert.equal(aviso.mock.callCount(), 1);
});

test('nextVersion siempre avanza, aunque el reloj no lo haga', () => {
  const futuro = new Date(Date.now() + 60000).toISOString();
  const siguiente = nextVersion(futuro);
  assert.ok(siguiente > futuro);
  assert.equal(Date.parse(siguiente) - Date.parse(futuro), 1);
  assert.ok(Date.parse(nextVersion(null)) <= Date.now());
});

test('assertExpectedVersion: sin versión no comprueba; distinta da 409 con el registro actual', () => {
  const current = { id: 'm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
  assert.doesNotThrow(() => assertExpectedVersion(current, undefined, 'modelo'));
  assert.doesNotThrow(() => assertExpectedVersion(current, '', 'modelo'));
  assert.doesNotThrow(() => assertExpectedVersion(current, '2026-01-02T00:00:00.000Z', 'modelo'));
  assert.doesNotThrow(() => assertExpectedVersion({ createdAt: 'X' }, 'X', 'borrador'));
  assert.throws(
    () => assertExpectedVersion(current, '2026-01-01T00:00:00.000Z', 'modelo'),
    (error) => error.statusCode === 409
      && error.message === 'Este modelo lo ha modificado otra persona.'
      && error.payload.current === current
  );
});
