import assert from 'node:assert/strict';
import test from 'node:test';
import { moveLine, moveLineBy, moveOf, moveOfBy } from '../src/client/reorder.ts';

const line = (id) => ({ id, code: id.toUpperCase(), description: '', quantity: 1 });
const make = () => [
  { id: 'A', of: '1', description: '', materials: [line('a1'), line('a2'), line('a3')] },
  { id: 'B', of: '2', description: '', materials: [line('b1')] },
  { id: 'C', of: '3', description: '', materials: [] }
];
const ids = (ofs) => ofs.map((block) => block.id).join('');
const lines = (block) => block.materials.map((item) => item.id).join(',');

test('mueve una OF delante o detrás de otra', () => {
  assert.equal(ids(moveOf(make(), 'C', 'A', 'before')), 'CAB');
  assert.equal(ids(moveOf(make(), 'A', 'C', 'after')), 'BCA');
  assert.equal(ids(moveOf(make(), 'A', 'B', 'after')), 'BAC');
});

test('si el movimiento no cambia nada devuelve la misma lista', () => {
  const ofs = make();
  assert.equal(moveOf(ofs, 'A', 'B', 'before'), ofs);
  assert.equal(moveOf(ofs, 'A', 'A', 'after'), ofs);
  assert.equal(moveOfBy(ofs, 'A', -1), ofs);
  assert.equal(moveLine(ofs, 'a1', 'A', 'a2', 'before'), ofs);
});

test('sube y baja OFs un puesto', () => {
  assert.equal(ids(moveOfBy(make(), 'B', -1)), 'BAC');
  assert.equal(ids(moveOfBy(make(), 'B', 1)), 'ACB');
});

test('ordena materiales dentro de su OF', () => {
  assert.equal(lines(moveLine(make(), 'a3', 'A', 'a1', 'before')[0]), 'a3,a1,a2');
  assert.equal(lines(moveLine(make(), 'a1', 'A', 'a3', 'after')[0]), 'a2,a3,a1');
  assert.equal(lines(moveLineBy(make(), 'a2', -1)[0]), 'a2,a1,a3');
  assert.equal(lines(moveLineBy(make(), 'a2', 1)[0]), 'a1,a3,a2');
});

test('pasa un material a otra OF, delante de otro o al final de una OF vacía', () => {
  const toB = moveLine(make(), 'a2', 'B', 'b1', 'before');
  assert.equal(lines(toB[0]), 'a1,a3');
  assert.equal(lines(toB[1]), 'a2,b1');
  const original = make();
  const toEmpty = moveLine(original, 'b1', 'C', null);
  assert.equal(lines(toEmpty[1]), '');
  assert.equal(lines(toEmpty[2]), 'b1');
  // La OF que no interviene es el mismo objeto (React no la repinta)
  assert.equal(toEmpty[0], original[0]);
});

test('no hace nada con ids que no existen', () => {
  const ofs = make();
  assert.equal(moveOf(ofs, 'X', 'A', 'before'), ofs);
  assert.equal(moveLine(ofs, 'zz', 'A', null), ofs);
  assert.equal(moveLine(ofs, 'a1', 'ZZ', null), ofs);
});
