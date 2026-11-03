import assert from 'node:assert/strict';
import test from 'node:test';
import { findOfMismatches, orderKey, pieceFromOrderLine, toDottedOrderCode, toRpsOfCode } from '../src/orders.js';

test('orderKey acepta el pedido escrito de cualquier forma', () => {
  assert.equal(orderKey('AR2603201'), 'AR2603201');
  assert.equal(orderKey(' ar.26.03201 '), 'AR2603201');
  assert.equal(orderKey('AR.26.03201/1'), 'AR2603201');
  assert.equal(orderKey('ar.26.3201'), 'AR2603201');
  assert.equal(orderKey('BE.26000008'), 'BE26000008');
  assert.equal(orderKey(''), null);
  assert.equal(orderKey('hola'), null);
});

test('toDottedOrderCode da el formato de RPS solo para la serie habitual', () => {
  assert.equal(toDottedOrderCode('AR2603201'), 'AR.26.03201');
  assert.equal(toDottedOrderCode('sa.26.01124'), 'SA.26.01124');
  assert.equal(toDottedOrderCode('BE26000008'), null);
  assert.equal(toDottedOrderCode(''), null);
});

test('toRpsOfCode completa con ceros y rechaza lo que no es OF', () => {
  assert.equal(toRpsOfCode('229920'), '0229920');
  assert.equal(toRpsOfCode(' 0229920 '), '0229920');
  assert.equal(toRpsOfCode('OF-1'), null);
  assert.equal(toRpsOfCode('12345678'), null);
  assert.equal(toRpsOfCode(''), null);
});

test('pieceFromOrderLine se queda con la pieza tras los dos puntos', () => {
  assert.equal(pieceFromOrderLine('LONA ESCENARIO MOVIL :TELON DELANTERO'), 'TELON DELANTERO');
  assert.equal(pieceFromOrderLine('TOLDO  VERTICAL'), 'TOLDO VERTICAL');
  assert.equal(pieceFromOrderLine('LONA:'), 'LONA:');
  assert.equal(pieceFromOrderLine(null), '');
});

test('findOfMismatches avisa de OFs inexistentes, de otro pedido o mal escritas', () => {
  const owners = new Map([
    ['0229920', 'AR.26.03201'],
    ['0229921', 'AR.26.03111'],
    ['0229922', '']
  ]);
  const warnings = findOfMismatches({
    orderCode: 'AR2603201',
    ofs: ['229920', '0229921', '0229922', '0999999', 'abc'],
    owners
  });
  assert.deepEqual(warnings, [
    'OF 0229921: es del pedido AR.26.03111',
    'OF 0999999: no existe en RPS',
    'OF abc: no tiene formato de OF de RPS'
  ]);
});

test('findOfMismatches sin pedido solo comprueba que las OFs existan', () => {
  const owners = new Map([['0229921', 'AR.26.03111']]);
  assert.deepEqual(findOfMismatches({ orderCode: '', ofs: ['0229921'], owners }), []);
  assert.deepEqual(findOfMismatches({ orderCode: '', ofs: ['0229999'], owners }), ['OF 0229999: no existe en RPS']);
});
