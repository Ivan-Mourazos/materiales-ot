import path from 'node:path';

// Documentos de RPS (fichas técnicas, certificados…): RPS guarda la ruta de red, p. ej.
// «file://\\192.168.0.128\RPS\COMPRAS\CARACTERISTIAS\MONZA.pdf». El servidor los sirve desde donde
// esté montada esa carpeta (RPS_SHARE_ROOT): en Windows, la propia ruta de red; en el servidor Linux
// de producción, donde IT la monte (p. ej. /mnt/rps). Nunca se sirve nada fuera de esa carpeta.

/** Tipos de archivo que se abren en el navegador; el resto se descarga. */
export const INLINE_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  txt: 'text/plain; charset=utf-8'
};

const DOWNLOAD_TYPES = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  dwg: 'application/acad',
  tif: 'image/tiff',
  zip: 'application/zip'
};

/** Normaliza una ruta de RPS: sin «file://», con barras invertidas y sin barras repetidas al final. */
function normalizeRpsPath(value) {
  return String(value || '')
    .trim()
    .replace(/^file:\/*/i, '')
    .replace(/\//g, '\\')
    .replace(/^\\*/, '\\\\');
}

/**
 * Traduce la ruta de RPS a la ruta local donde está montada la carpeta compartida.
 * - `shareUnc`: la carpeta de red tal como la escribe RPS (\\192.168.0.128\RPS).
 * - `shareRoot`: dónde se ve esa carpeta desde este servidor (en Windows puede ser la misma ruta).
 * Devuelve null si la ruta no está dentro de esa carpeta o intenta salirse de ella («..»).
 */
export function resolveRpsDocumentPath(rpsPath, { shareUnc, shareRoot, platform = process.platform }) {
  if (!rpsPath || !shareUnc || !shareRoot) return null;
  const source = normalizeRpsPath(rpsPath);
  const prefix = normalizeRpsPath(shareUnc).replace(/\\+$/, '') + '\\';
  if (!source.toLowerCase().startsWith(prefix.toLowerCase())) return null;

  const relativeParts = source.slice(prefix.length).split('\\').filter(Boolean);
  if (relativeParts.length === 0 || relativeParts.some((part) => part === '..' || part === '.')) return null;

  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const root = pathApi.resolve(shareRoot);
  const resolved = pathApi.resolve(root, ...relativeParts);
  const relative = pathApi.relative(root, resolved);
  if (!relative || relative.startsWith('..') || pathApi.isAbsolute(relative)) return null;
  return resolved;
}

/** Tipo de contenido y si se abre en el navegador o se descarga, según la extensión. */
export function documentContentType(filePath) {
  const extension = String(filePath).split('.').pop().toLowerCase();
  if (INLINE_TYPES[extension]) return { contentType: INLINE_TYPES[extension], inline: true };
  return { contentType: DOWNLOAD_TYPES[extension] || 'application/octet-stream', inline: false };
}
