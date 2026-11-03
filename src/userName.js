// Nombre de quien usa la web (ver audit.js). Aparte para que borradores y modelos lo usen sin
// arrastrar el registro de cambios.
export const MAX_USER_LENGTH = 60;

/** Limpia un nombre: sin caracteres de control, espacios simples y como mucho 60 caracteres. */
export function cleanUserName(value) {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(clean).slice(0, MAX_USER_LENGTH).join('').trim();
}
