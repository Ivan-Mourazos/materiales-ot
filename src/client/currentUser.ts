// Quién usa la web en este navegador (opción b de Iván, 03/11/2026): se pide el nombre la
// primera vez, se guarda aquí y viaja en la cabecera `X-Usuario` de cada cambio. El servidor
// lo apunta (src/audit.js). No es una contraseña: sirve para saber quién hizo qué.

const userStorageKey = 'materiales-ot-usuario';
export const MAX_USER_LENGTH = 60;

/** Mismo criterio que el servidor (src/userName.js): espacios simples, sin control, 60 caracteres. */
export function cleanUserName(value: string): string {
  const clean = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, MAX_USER_LENGTH).join('').trim();
}

export function getUserName(): string {
  try {
    return cleanUserName(localStorage.getItem(userStorageKey) || '');
  } catch {
    return '';
  }
}

export function setUserName(name: string): string {
  const clean = cleanUserName(name);
  try {
    if (clean) localStorage.setItem(userStorageKey, clean);
    else localStorage.removeItem(userStorageKey);
  } catch {
    // Sin localStorage (modo privado estricto) el nombre vale solo para esta visita
  }
  memoryName = clean;
  return clean;
}

let memoryName = '';
const currentName = () => getUserName() || memoryName;

/** ¿Esta petición cambia algo en el servidor? Solo las de /api que no son lectura. */
export function isApiWrite(url: string, method: string | undefined): boolean {
  const verb = (method || 'GET').toUpperCase();
  if (verb === 'GET' || verb === 'HEAD') return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

/**
 * Añade `X-Usuario` a todas las escrituras de la web sin tocar cada `fetch`: así ninguna se
 * queda sin nombre, tampoco las que se añadan más adelante. Se llama una vez al arrancar.
 */
export function instalarCabeceraUsuario() {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const name = currentName();
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (!name || !isApiWrite(url, method)) return original(input, init);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('X-Usuario', encodeURIComponent(name));
    return original(input, { ...init, headers });
  };
}
