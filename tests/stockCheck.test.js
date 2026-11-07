import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStock, describeStockWarnings, requestedByCode } from '../src/stockCheck.js';

const ofs = [
  { of: '1', materials: [{ code: 'acrili2170p120', quantity: 30 }, { code: 'OLLAOLPN14', quantity: 45 }] },
  { of: '2', materials: [{ code: 'ACRILI2170P120', quantity: 20 }, { code: 'SINCANT', quantity: null }] }
];

const stock = new Map([
  ['ACRILI2170P120', { description: 'LONA', unit: 'ML120', physical: 60, reserved: 23, pendingPurchases: 1, nextReceipt: '2026-11-20' }],
  ['OLLAOLPN14', { description: 'OLLAO', unit: 'UNI', physical: 9000, reserved: 0 }],
  ['SUPERT1001P250', { description: 'LONA BEIGE', unit: 'ML250', physical: 33.9, reserved: 0, blockedManufacturing: true }]
]);

test('suma por código lo que piden todas las OFs e ignora líneas sin cantidad', () => {
  assert.deepEqual([...requestedByCode(ofs)], [['ACRILI2170P120', 50], ['OLLAOLPN14', 45]]);
});

test('avisa cuando lo pedido supera lo libre (físico menos reservado)', () => {
  const { shortages, blocked, unknown } = checkStock(requestedByCode(ofs), stock);
  assert.equal(shortages.length, 1);
  assert.deepEqual(
    { code: shortages[0].code, free: shortages[0].free, missing: shortages[0].missing },
    { code: 'ACRILI2170P120', free: 37, missing: 13 }
  );
  assert.deepEqual(blocked, []);
  assert.deepEqual(unknown, []);
});

test('marca lo bloqueado para fabricación aunque haya stock, y los códigos que RPS no conoce', () => {
  const requested = new Map([['SUPERT1001P250', 10], ['NOEXISTE', 1]]);
  const result = checkStock(requested, stock);
  assert.deepEqual(result.shortages, []);
  assert.deepEqual(result.blocked, [{ code: 'SUPERT1001P250', description: 'LONA BEIGE' }]);
  assert.deepEqual(result.unknown, ['NOEXISTE']);
});

test('con la reserva por encima del stock, lo libre es cero, no negativo', () => {
  const result = checkStock(new Map([['X', 1]]), new Map([['X', { physical: 5, reserved: 8 }]]));
  assert.equal(result.shortages[0].free, 0);
});

test('el texto de los avisos dice cuánto falta y si llega una compra', () => {
  const lines = describeStockWarnings(checkStock(new Map([['ACRILI2170P120', 50], ['SUPERT1001P250', 1]]), stock));
  assert.equal(lines[0], 'ACRILI2170P120: pides 50 ML120 y hay 37 libres (faltan 13). Hay compra pendiente (llega 20/11/2026).');
  assert.equal(lines[1], 'SUPERT1001P250: bloqueado para fabricación en RPS («No se fabrica»).');
});
