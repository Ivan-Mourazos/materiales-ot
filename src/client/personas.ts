// Quién puede elegirse en «¿Quién eres?»: los técnicos de la oficina técnica, con las mismas
// iniciales y colores que CoordinaOT y Toldos Testar (toldos-testar/src/client/personas.ts),
// para que «Iván» sea el mismo círculo dorado en las tres webs.
export const PERSONAS: { nombre: string; iniciales: string; color: string }[] = [
  { nombre: 'Ángel', iniciales: 'AN', color: '#5a6472' },
  { nombre: 'Jaime', iniciales: 'JA', color: '#3d7de0' },
  { nombre: 'Alberto', iniciales: 'AL', color: '#e0533d' },
  { nombre: 'Adrián', iniciales: 'AD', color: '#1fa37a' },
  { nombre: 'Tamara', iniciales: 'TA', color: '#9b3de0' },
  { nombre: 'Iván', iniciales: 'IV', color: '#d39a1c' }
];

const TINTA_OSCURA = '#1a1206';
const TINTA_BLANCA = '#ffffff';

function canal(valor: number) {
  const s = valor / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function contraste(a: number, b: number) {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Tinta del texto sobre el color de cada persona: blanca u oscura, la que más contraste da. */
export function tintaSobre(fondo: string) {
  const l = luminancia(fondo);
  if (l === null) return TINTA_BLANCA;
  const oscura = luminancia(TINTA_OSCURA) as number;
  return contraste(l, 1) >= contraste(l, oscura) ? TINTA_BLANCA : TINTA_OSCURA;
}

const clave = (nombre: string) =>
  nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES').trim();

/** Iniciales y color de un nombre. Quien no está en la lista sale con sus dos primeras letras y el dorado. */
export function personaDe(nombre: string): { iniciales: string; color: string | null } {
  const conocida = PERSONAS.find((persona) => clave(persona.nombre) === clave(nombre));
  if (conocida) return conocida;
  return { iniciales: clave(nombre).slice(0, 2), color: null };
}

/** ¿Es la misma persona? Sin distinguir mayúsculas ni tildes («IVÁN» = «Iván»). */
export function mismaPersona(a: string, b: string) {
  return Boolean(a) && clave(a) === clave(b);
}
