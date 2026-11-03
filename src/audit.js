// Quién hace cada cosa (opción b de Iván, 03/11/2026: «pedir el nombre la primera vez y guardar
// quién crea, cambia o borra»). No es un control de acceso: el nombre lo escribe cada uno en su
// navegador y llega en la cabecera `X-Usuario`. Sirve para saber quién hizo qué, no para impedirlo.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonArray, writeJsonArray } from './jsonStore.js';
import { cleanUserName } from './userName.js';

export { cleanUserName };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditFile = path.join(__dirname, '..', 'data', 'audit.json');
const maxEntries = 2000;
/** El nombre de quien hace la petición (cabecera `X-Usuario`, codificada con encodeURIComponent). */
export function userFromRequest(req) {
  const raw = req.get?.('x-usuario') ?? req.headers?.['x-usuario'];
  if (!raw) return '';
  try {
    return cleanUserName(decodeURIComponent(String(raw)));
  } catch {
    return cleanUserName(String(raw));
  }
}

// Serializa las escrituras: dos cambios a la vez no se pisan el registro.
let writeQueue = Promise.resolve();

/**
 * Apunta un cambio. `action`: create | update | delete | generate. `kind`: draft | model | reservation.
 * Si no se puede escribir se registra en consola y no falla: el guardado del usuario ya está hecho.
 */
export function appendAudit({ action, kind, id = '', name = '', user = '' }) {
  const entry = {
    at: new Date().toISOString(),
    user: cleanUserName(user) || 'Sin nombre',
    action,
    kind,
    id: String(id || ''),
    name: String(name || '').slice(0, 200)
  };
  writeQueue = writeQueue
    .then(async () => {
      const entries = await readJsonArray(auditFile);
      entries.unshift(entry);
      await writeJsonArray(auditFile, entries.slice(0, maxEntries), { keep: 3 });
    })
    .catch((error) => {
      console.error('No se pudo apuntar el cambio en el registro:', error);
    });
  return writeQueue;
}

export async function listAudit(limit = 200) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), maxEntries);
  const entries = await readJsonArray(auditFile);
  return entries.slice(0, safeLimit);
}

/** Nombres que ya han usado la web, del más reciente al más antiguo (para elegir rápido). */
export async function listKnownUsers(limit = 12) {
  const entries = await readJsonArray(auditFile);
  const seen = new Set();
  for (const entry of entries) {
    if (entry.user && entry.user !== 'Sin nombre') seen.add(entry.user);
    if (seen.size >= limit) break;
  }
  return [...seen];
}
