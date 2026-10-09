import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Módulos del servidor que leen y escriben en data/. Se importan entre sí, así que van juntos.
const serverModules = ['models.js', 'drafts.js', 'jsonStore.js', 'quantity.js', 'httpError.js'];

/** Copia los módulos a una carpeta temporal: su data/ queda aislada de la del proyecto. */
export async function isolatedServer(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'materiales-test-'));
  await mkdir(path.join(directory, 'src'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const name of serverModules) {
    await copyFile(new URL(`../../src/${name}`, import.meta.url), path.join(directory, 'src', name));
  }
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    importModule: (name) => import(pathToFileURL(path.join(directory, 'src', name)).href),
    dataFile: (name) => path.join(directory, 'data', name)
  };
}
