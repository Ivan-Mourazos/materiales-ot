import assert from 'node:assert/strict';
import test from 'node:test';
import { allLineKeys, buildPickedOfs, lineKey, ofSelectionState, toggleOf } from '../src/client/reusePick.ts';

const ofs = [
  { of: '0229920', description: 'TELON DELANTERO', materials: [
    { code: 'ACRILI', description: 'LONA', quantity: 81.6 },
    { code: 'MOTOR', description: 'MOTOR', quantity: 1 },
    { code: 'TUBO', description: 'TUBO', quantity: 3 }
  ] },
  { of: '0229921', description: 'FALDON', materials: [{ code: 'OLLAO', description: 'OLLAO', quantity: 45 }] }
];
let n = 0;
const newId = () => `id${++n}`;

test('al abrir está todo marcado', () => {
  const selected = allLineKeys(ofs);
  assert.equal(selected.size, 4);
  assert.equal(ofSelectionState(ofs[0], 0, selected), 'all');
});

test('la casilla de la OF refleja si están todas, algunas o ninguna', () => {
  const selected = allLineKeys(ofs);
  selected.delete(lineKey(0, 1));
  assert.equal(ofSelectionState(ofs[0], 0, selected), 'some');
  // Con algunas, pulsar la OF marca todas; con todas, las desmarca
  const all = toggleOf(ofs[0], 0, selected);
  assert.equal(ofSelectionState(ofs[0], 0, all), 'all');
  const none = toggleOf(ofs[0], 0, all);
  assert.equal(ofSelectionState(ofs[0], 0, none), 'none');
  // No toca las otras OFs ni el conjunto de entrada
  assert.equal(ofSelectionState(ofs[1], 1, none), 'all');
  assert.equal(selected.has(lineKey(0, 1)), false);
});

test('solo se llevan las OFs con algo marcado y solo sus materiales marcados, sin número de OF', () => {
  const selected = new Set([lineKey(0, 0), lineKey(0, 2)]);
  const picked = buildPickedOfs(ofs, selected, newId);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].of, '');
  assert.equal(picked[0].description, 'TELON DELANTERO');
  assert.deepEqual(picked[0].materials.map((line) => [line.code, line.quantity]), [['ACRILI', 81.6], ['TUBO', 3]]);
});
