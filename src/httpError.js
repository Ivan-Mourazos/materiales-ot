/**
 * Error con código HTTP para el manejador de Express.
 * `payload` se añade tal cual a la respuesta JSON (p. ej. el registro actual en un 409).
 */
export function httpError(status, message, payload) {
  const error = new Error(message);
  error.statusCode = status;
  if (payload) error.payload = payload;
  return error;
}
