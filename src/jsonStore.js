import fs from 'node:fs/promises';
import path from 'node:path';
import { httpError } from './httpError.js';

// Desempata instantáneas creadas en el mismo milisegundo.
let snapshotSequence = 0;

/**
 * Lee un archivo JSON que contiene un array.
 * Si no existe lo crea con `seed`. Si está corrupto lanza error SIN tocarlo,
 * para que nadie sobrescriba por accidente una biblioteca dañada.
 */
export async function readJsonArray(file, seed = []) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    throw new Error(`${path.basename(file)} no contiene una lista válida.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await writeJsonArray(file, seed);
  return structuredClone(seed);
}

/**
 * Escribe el array de forma atómica (.tmp + rename). Antes copia la versión
 * anterior a `backups/` y conserva solo las `keep` más recientes de ese archivo.
 * Si la copia o la poda fallan se registra y el guardado sigue: perder el
 * trabajo del usuario por no poder hacer una copia sería peor.
 */
export async function writeJsonArray(file, data, { keep = 30 } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await snapshot(file, keep);
  const tmpPath = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, file);
}

/** Fecha ISO estrictamente posterior a `previous`, aunque el reloj no haya avanzado. */
export function nextVersion(previous) {
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  const now = Date.now();
  return new Date(Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now).toISOString();
}

/**
 * Rechaza con 409 si el registro cambió desde que el cliente lo cargó.
 * Sin `expectedUpdatedAt` no comprueba nada (llamadas a la API hechas a mano).
 */
export function assertExpectedVersion(current, expectedUpdatedAt, label) {
  if (!expectedUpdatedAt) return;
  const actual = current.updatedAt || current.createdAt;
  if (actual === expectedUpdatedAt) return;
  throw httpError(409, `Este ${label} lo ha modificado otra persona.`, { current });
}

async function snapshot(file, keep) {
  try {
    await fs.access(file);
  } catch {
    return; // primera escritura: no hay versión anterior que guardar
  }

  const backupDir = path.join(path.dirname(file), 'backups');
  const base = path.basename(file, '.json');

  try {
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sequence = String(snapshotSequence++).padStart(6, '0');
    await fs.copyFile(file, path.join(backupDir, `${base}-${stamp}-${sequence}.json`));
  } catch (error) {
    console.error(`No se pudo guardar la instantánea de ${base}:`, error.message);
    return;
  }

  try {
    const own = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}T.*\\.json$`);
    const snapshots = (await fs.readdir(backupDir)).filter((name) => own.test(name)).sort().reverse();
    await Promise.all(snapshots.slice(keep).map((name) => fs.rm(path.join(backupDir, name), { force: true })));
  } catch (error) {
    console.error(`No se pudieron podar las instantáneas de ${base}:`, error.message);
  }
}
