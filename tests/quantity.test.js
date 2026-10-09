import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStoredQuantity } from '../src/quantity.js';

test('vacío, null y cero se guardan como "sin cantidad"', () => {
  for (const value of [null, undefined, '', '   ', 0, '0', 0.0000001]) {
    assert.equal(normalizeStoredQuantity(value), null, JSON.stringify(value));
  }
});

test('los números válidos se redondean, también con coma decimal', () => {
  assert.equal(normalizeStoredQuantity(2.5), 2.5);
  assert.equal(normalizeStoredQuantity('2,5'), 2.5);
  assert.equal(normalizeStoredQuantity(' 3 '), 3);
  assert.equal(normalizeStoredQuantity(1.23456789), 1.234568);
});

test('lo que no es una cantidad es un 400 que dice dónde', () => {
  for (const value of [-1, 'abc', Number.NaN, Number.POSITIVE_INFINITY, true, {}]) {
    assert.throws(
      () => normalizeStoredQuantity(value, 'LONA01 de «Faldón»'),
      (error) => error.statusCode === 400 && error.message.startsWith('Cantidad no válida en LONA01 de «Faldón»:'),
      String(value)
    );
  }
});
