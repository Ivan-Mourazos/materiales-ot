import assert from 'node:assert/strict';
import test from 'node:test';
import { consumptionToOfBlocks } from '../src/client/consumptionLoad.ts';

const line = (code, quantity) => ({ code, description: code, quantity });
const report = {
  order: 'AR.26.03201',
  transfers: [],
  totals: { ofs: 4, ofsWithMaterial: 3, lines: 4, unplanned: 0, unused: 0 },
  ofs: [
    { of: '0229920', piece: 'TELON DELANTERO', units: 2, materials: [line('ACRILI', 81.6), line('MOTOR', 1)], unplanned: [], unused: [] },
    { of: '0229921', piece: 'TELON DELANTERO', units: 1, materials: [line('ACRILI', 34.95)], unplanned: [], unused: [] },
    { of: '0229924', piece: 'FALDÓN', units: 1, materials: [line('OLLAO', 45)], unplanned: [], unused: [] },
    { of: '0229999', piece: 'SIN MATERIAL', units: 1, materials: [], unplanned: [], unused: [] }
  ]
};
let n = 0;
const newId = () => `id${++n}`;

test('source copia las OFs de origen y descarta las que no gastaron nada', () => {
  const result = consumptionToOfBlocks({ report, mode: 'source', newId });
  assert.deepEqual(result.ofs.map((block) => [block.of, block.description, block.materials.length]), [
    ['0229920', 'TELON DELANTERO', 2],
    ['0229921', 'TELON DELANTERO', 1],
    ['0229924', 'FALDÓN', 1]
  ]);
});

test('blank deja las OFs vacías con su pieza', () => {
  const result = consumptionToOfBlocks({ report, mode: 'blank', newId });
  assert.deepEqual(result.ofs.map((block) => block.of), ['', '', '']);
  assert.equal(result.ofs[2].description, 'FALDÓN');
});

test('target empareja por pieza (sin acentos ni mayúsculas) y cada OF nueva se usa una vez', () => {
  const targetOfs = [
    { of: '0240001', piece: 'faldon', units: 1, article: null, comment: null },
    { of: '0240002', piece: 'TELON DELANTERO', units: 4, article: null, comment: null },
    { of: '0240003', piece: 'TAPARANURAS', units: 2, article: null, comment: null }
  ];
  const result = consumptionToOfBlocks({ report, mode: 'target', targetOfs, newId });
  assert.deepEqual(result.ofs.map((block) => block.of), ['0240002', '', '0240001']);
  assert.equal(result.matched, 2);
  assert.deepEqual(result.unmatched, ['TELON DELANTERO']);
  assert.deepEqual(result.unusedTargets.map((target) => target.of), ['0240003']);
  // Sin escalar, las cantidades son las de origen
  assert.equal(result.ofs[0].materials[0].quantity, 81.6);
});

test('target con scaleToUnits ajusta por unidades de cada OF', () => {
  const targetOfs = [{ of: '0240002', piece: 'TELON DELANTERO', units: 4, article: null, comment: null }];
  const result = consumptionToOfBlocks({ report, mode: 'target', targetOfs, scaleToUnits: true, newId });
  // 81,6 m para 2 unidades → 163,2 m para 4
  assert.equal(result.ofs[0].materials[0].quantity, 163.2);
  assert.equal(result.ofs[0].materials[1].quantity, 2);
  // La OF sin pareja no se escala
  assert.equal(result.ofs[1].materials[0].quantity, 34.95);
});
