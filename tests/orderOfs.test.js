import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeOrderOfs, ofCompareKey } from '../src/client/orderOfs.ts';

const rps = [
  { of: '0229920', piece: 'TELON DELANTERO', units: 2, article: 'LEMTEDE', comment: null },
  { of: '0229921', piece: 'TELON DELANTERO', units: 1, article: 'LEMTEDE', comment: null },
  { of: '0229922', piece: 'AMPLIACION TELON DELANTERO', units: 2, article: 'LEMAMTE', comment: null }
];

let counter = 0;
const createBlock = (of, description) => ({ id: `nuevo-${++counter}`, of, description, materials: [] });
const material = { id: 'm1', code: 'OLLAOLPN14', description: 'OLLAO', quantity: 4 };

test('ofCompareKey iguala OFs con y sin ceros delante', () => {
  assert.equal(ofCompareKey('229920'), '0229920');
  assert.equal(ofCompareKey(' 0229920 '), '0229920');
  assert.equal(ofCompareKey('abc'), 'ABC');
  assert.equal(ofCompareKey(''), '');
});

test('mergeOrderOfs ocupa el bloque vacío y añade el resto al final', () => {
  counter = 0;
  const result = mergeOrderOfs([{ id: 'a', of: '', description: '', materials: [] }], rps, createBlock);
  assert.equal(result.added, 3);
  assert.equal(result.alreadyThere, 0);
  assert.deepEqual(
    result.ofs.map((block) => [block.id, block.of, block.description]),
    [
      ['a', '0229920', 'TELON DELANTERO'],
      ['nuevo-1', '0229921', 'TELON DELANTERO'],
      ['nuevo-2', '0229922', 'AMPLIACION TELON DELANTERO']
    ]
  );
});

test('mergeOrderOfs no toca las OFs que ya están ni sus materiales', () => {
  counter = 0;
  const current = [
    { id: 'a', of: '229920', description: 'MI NOMBRE', materials: [material] },
    { id: 'b', of: '0229921', description: '', materials: [] }
  ];
  const result = mergeOrderOfs(current, rps, createBlock);
  assert.equal(result.added, 1);
  assert.equal(result.alreadyThere, 2);
  assert.equal(result.ofs[0], current[0]);
  assert.equal(result.ofs[1].description, 'TELON DELANTERO');
  assert.equal(result.ofs[2].of, '0229922');
});

test('mergeOrderOfs no reutiliza un bloque sin OF que ya tiene materiales', () => {
  counter = 0;
  const current = [{ id: 'a', of: '', description: '', materials: [material] }];
  const result = mergeOrderOfs(current, rps.slice(0, 1), createBlock);
  assert.equal(result.ofs.length, 2);
  assert.equal(result.ofs[0], current[0]);
  assert.equal(result.ofs[1].of, '0229920');
});
