import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const historyFile = path.join(dataDir, 'history.json');
const maxEntries = 200;

// Serializa las escrituras para que dos reservas simultáneas no se pisen el archivo.
let writeQueue = Promise.resolve();

export async function listHistory(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), maxEntries);
  const entries = await readHistory();
  return entries.slice(0, safeLimit);
}

export function appendHistory(entry) {
  writeQueue = writeQueue
    .then(async () => {
      const entries = await readHistory();
      entries.unshift(entry);
      await fs.mkdir(dataDir, { recursive: true });
      const tmpPath = `${historyFile}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(entries.slice(0, maxEntries), null, 2));
      await fs.rename(tmpPath, historyFile);
    })
    .catch((error) => {
      console.error('No se pudo guardar el historial de reservas:', error);
    });

  return writeQueue;
}

async function readHistory() {
  try {
    const raw = await fs.readFile(historyFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
