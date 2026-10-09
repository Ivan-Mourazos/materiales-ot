import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReservation } from '../src/validation.js';

const reserva = (materials) => ({
  orderCode: 'AR2600001',
  ofs: [{ of: '221150', description: 'Telón', materials }]
});

test('una línea sin cantidad bloquea la reserva con un 400 que nombra artículo y OF', () => {
  for (const quantity of [null, undefined, '', '   ', 0, '0']) {
    assert.throws(
      () => normalizeReservation(reserva([{ code: 'ACRILI2170P120', description: 'Lona', quantity }])),
      (error) => error.statusCode === 400
        && error.message === 'Falta la cantidad de ACRILI2170P120 en la OF 221150.',
      `cantidad ${JSON.stringify(quantity)}`
    );
  }
});

test('una cantidad negativa o no numérica es un 400', () => {
  for (const quantity of [-1, 'abc']) {
    assert.throws(
      () => normalizeReservation(reserva([{ code: 'X1', description: 'x', quantity }])),
      (error) => error.statusCode === 400 && error.message === 'La cantidad de X1 en la OF 221150 no es válida.'
    );
  }
});

test('las cantidades válidas pasan redondeadas y con el código en mayúsculas', () => {
  const resultado = normalizeReservation(reserva([{ code: 'x1', description: 'x', quantity: '2.1234567' }]));
  assert.deepEqual(resultado.ofs[0].materials, [{ code: 'X1', description: 'x', quantity: 2.123457 }]);
});

test('las líneas completamente vacías se ignoran', () => {
  const resultado = normalizeReservation(reserva([
    { code: '', description: '', quantity: null },
    { code: 'X1', description: '', quantity: 1 }
  ]));
  assert.equal(resultado.ofs[0].materials.length, 1);
});

test('el resto de errores de validación también son 400', () => {
  assert.throws(
    () => normalizeReservation({ ofs: [] }),
    (error) => error.statusCode === 400 && error.message === 'Añade al menos una OF.'
  );
  assert.throws(
    () => normalizeReservation({ ofs: [{ of: '', materials: [] }] }),
    (error) => error.statusCode === 400 && error.message === 'La OF 1 no tiene número.'
  );
});
