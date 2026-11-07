// Mismo criterio al copiar despieces y al comparar modelos: nombre completo sin tildes ni mayúsculas.
export const normalizePiece = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
