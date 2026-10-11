import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
    await assert.rejects(
      readJsonArray(file),
      (error) => roto === '{incompleto'
        ? error instanceof SyntaxError
        : error.message === 'models.json no contiene una lista válida.'
    );
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

test('escrituras simultáneas al mismo archivo no chocan', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await assert.doesNotReject(Promise.all(Array.from({ length: 20 }, (_, v) => writeJsonArray(file, [{ v }]))));

  const final = JSON.parse(await readFile(file, 'utf8'));
  assert.deepEqual(final, [{ v: 19 }]);
});

test('una escritura fallida no rompe la siguiente ya encolada al mismo archivo', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 0 }]);
  const circular = {};
  circular.self = circular;

  const fallida = writeJsonArray(file, [circular]);
  const siguiente = writeJsonArray(file, [{ v: 2 }]);
  await Promise.all([
    assert.rejects(fallida, (error) => error instanceof TypeError && /circular/i.test(error.message)),
    siguiente
  ]);

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ v: 2 }]);
  assert.equal((await readdir(directory)).some((name) => name.includes('.tmp-')), false);
});

test('keep elimina exactamente las instantáneas más antiguas por su fecha', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  const backups = path.join(directory, 'backups');
  await writeJsonArray(file, [{ v: 4 }]);
  await mkdir(backups);
  const nombres = [1, 2, 3, 4].map((dia) => `models-2020-01-0${dia}T00-00-00-000Z-000000.json`);
  // Orden de creación distinto del cronológico: la poda debe usar las fechas.
  for (const index of [3, 0, 2, 1]) {
    await writeFile(path.join(backups, nombres[index]), JSON.stringify([{ v: index }]));
  }
  const ajena = 'drafts-2020-01-01T00-00-00-000Z-000000.json';
  const manual = 'models-manual.json';
  for (const name of [ajena, manual]) await writeFile(path.join(backups, name), 'conservar');

  await writeJsonArray(file, [{ v: 5 }], { keep: 3 });

  const quedan = await instantaneas(directory);
  const nueva = quedan.filter((name) => name !== manual && !nombres.includes(name));
  assert.equal(nueva.length, 1);
  assert.deepEqual(quedan, [nombres[2], nombres[3], manual, nueva[0]].sort());
  for (const name of nombres.slice(0, 2)) {
    await assert.rejects(readFile(path.join(backups, name)), { code: 'ENOENT' });
  }
  const propias = quedan.filter((name) => name !== manual);
  assert.equal(propias.length, 3);
  const contenidos = await Promise.all(propias.map(async (name) =>
    JSON.parse(await readFile(path.join(backups, name), 'utf8'))));
  assert.deepEqual(contenidos, [[{ v: 2 }], [{ v: 3 }], [{ v: 4 }]]);
  for (const name of [ajena, manual]) assert.equal(await readFile(path.join(backups, name), 'utf8'), 'conservar');
});

test('si la escritura falla no queda ningún .tmp', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  // Una carpeta en la ruta de destino hace fallar el rename en Windows (y en POSIX).
  await mkdir(file);
  const aviso = t.mock.method(console, 'error', () => {});

  await assert.rejects(writeJsonArray(file, [{ v: 1 }]));
  assert.equal((await readdir(directory)).some((name) => name.includes('.tmp-')), false);
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
