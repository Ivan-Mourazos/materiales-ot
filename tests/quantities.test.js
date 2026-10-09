import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addQuantities,
  countMissingQuantities,
  findMissingQuantities,
  hasQuantity,
  parseQuantityInput,
  quantityInputValue,
  roundQuantity,
  scaleQuantity,
  sumQuantities
} from '../src/client/quantities.ts';

test('parseQuantityInput: vacío y cero son "sin cantidad"; negativo o texto, inválido', () => {
  assert.equal(parseQuantityInput(''), null);
  assert.equal(parseQuantityInput('   '), null);
  assert.equal(parseQuantityInput('0'), null);
  assert.equal(parseQuantityInput('2,5'), 2.5);
  assert.equal(parseQuantityInput('1.23456789'), 1.234568);
  assert.equal(parseQuantityInput('-1'), 'invalid');
  assert.equal(parseQuantityInput('abc'), 'invalid');
});

test('hasQuantity trata null, 0, negativos y NaN como "sin cantidad" (borradores antiguos tienen 0)', () => {
  assert.equal(hasQuantity(3), true);
  for (const q of [null, undefined, 0, -1, Number.NaN]) assert.equal(hasQuantity(q), false, String(q));
});

test('sumas, escalado y fusión respetan el vacío', () => {
  assert.equal(sumQuantities([1.5, null, 2, undefined, 0]), 3.5);
  assert.equal(scaleQuantity(null, 3), null);
  assert.equal(scaleQuantity(1.5, 3), 4.5);
  assert.equal(scaleQuantity(0.0000001, 1), null);
  assert.equal(addQuantities(null, null), null);
  assert.equal(addQuantities(null, 2), 2);
  assert.equal(addQuantities(2, null), 2);
  assert.equal(addQuantities(0.1, 0.2), 0.3);
  assert.equal(roundQuantity(0.1 + 0.2), 0.3);
});

test('quantityInputValue deja el campo vacío cuando no hay cantidad', () => {
  assert.equal(quantityInputValue(null), '');
  assert.equal(quantityInputValue(0), '');
  assert.equal(quantityInputValue(2.5), '2.5');
});

test('findMissingQuantities lista OF y línea de cada hueco', () => {
  const ofs = [
    { id: 'o1', of: '221150', description: 'Telón', materials: [
      { id: 'l1', code: 'A', description: 'Lona', quantity: 2 },
      { id: 'l2', code: 'B', description: 'Motor', quantity: null }
    ] },
    { id: 'o2', of: '', description: 'Faldón', materials: [{ id: 'l3', code: 'C', description: '', quantity: 0 }] }
  ];
  assert.deepEqual(findMissingQuantities(ofs), [
    { ofId: 'o1', lineId: 'l2', ofLabel: 'OF 221150', code: 'B', description: 'Motor' },
    { ofId: 'o2', lineId: 'l3', ofLabel: 'OF 2 · Faldón', code: 'C', description: '' }
  ]);
  assert.equal(countMissingQuantities(ofs), 2);
});
