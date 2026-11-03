import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConsumption } from '../src/consumption.js';

const ofs = [
  { of: '0229925', piece: 'LATERAL VISERA DELANTERA', units: 2 },
  { of: '0229926', piece: 'LATERAL VISERA TRASERA', units: 2 },
  { of: '0229934', piece: 'SOLAPA', units: 2 }
];

// El caso real del AR.26.03201: los piquetes de la 0229925 se apuntaron en la 0229926
const reserved = [
  { of: '0229925', code: 'PIQUETHC37MM6MM', description: 'PIQUETE', quantity: 220 },
  { of: '0229925', code: 'OLLAOLPN14', description: 'OLLAO', quantity: 72 },
  { of: '0229926', code: 'PIQUETHC37MM6MM', description: 'PIQUETE', quantity: 164 },
  { of: '0229934', code: 'NS86B1NEGRP250', description: 'LONA NS86', quantity: 1.2 }
];
const imputed = [
  { of: '0229925', code: 'OLLAOLPN14', description: 'OLLAO', quantity: 40 },
  { of: '0229925', code: 'OLLAOLPN14', description: 'OLLAO', quantity: 32 },
  { of: '0229925', code: 'VEBCOSNEGR100', description: 'VELCRO 100', quantity: 7.4 },
  { of: '0229926', code: 'piquethc37mm6mm', description: 'PIQUETE', quantity: 384 },
  { of: '0229934', code: 'RESTOPVC', description: 'RESTO LONA PVC', quantity: 1.2 }
];

test('suma los apuntes de un mismo artículo y devuelve lo gastado por OF', () => {
  const result = buildConsumption({ ofs, imputed, reserved, fixTransfers: false });
  const of25 = result.ofs.find((item) => item.of === '0229925');
  assert.deepEqual(of25.materials, [
    { code: 'OLLAOLPN14', description: 'OLLAO', quantity: 72 },
    { code: 'VEBCOSNEGR100', description: 'VELCRO 100', quantity: 7.4 }
  ]);
  assert.equal(result.ofs.find((item) => item.of === '0229926').materials[0].quantity, 384);
});

test('detecta el material apuntado en la OF de al lado cuando la cantidad cuadra', () => {
  const result = buildConsumption({ ofs, imputed, reserved, fixTransfers: false });
  assert.deepEqual(result.transfers, [
    { code: 'PIQUETHC37MM6MM', description: 'PIQUETE', quantity: 220, from: '0229926', to: '0229925' }
  ]);
});

test('con fixTransfers devuelve el material a su OF', () => {
  const result = buildConsumption({ ofs, imputed, reserved });
  const of25 = result.ofs.find((item) => item.of === '0229925');
  const of26 = result.ofs.find((item) => item.of === '0229926');
  assert.equal(of25.materials.find((line) => line.code === 'PIQUETHC37MM6MM').quantity, 220);
  assert.equal(of26.materials.find((line) => line.code === 'PIQUETHC37MM6MM').quantity, 164);
  // Ya no cuentan como sin gastar ni como no previstos
  assert.deepEqual(of25.unused, []);
  assert.equal(of25.unplanned.some((line) => line.code === 'PIQUETHC37MM6MM'), false);
});

test('marca lo gastado sin reservar y lo reservado sin gastar', () => {
  const result = buildConsumption({ ofs, imputed, reserved });
  const of25 = result.ofs.find((item) => item.of === '0229925');
  const of34 = result.ofs.find((item) => item.of === '0229934');
  assert.deepEqual(of25.unplanned, [{ code: 'VEBCOSNEGR100', description: 'VELCRO 100', quantity: 7.4 }]);
  assert.deepEqual(of34.unplanned, [{ code: 'RESTOPVC', description: 'RESTO LONA PVC', quantity: 1.2 }]);
  assert.deepEqual(of34.unused, [{ code: 'NS86B1NEGRP250', description: 'LONA NS86', reserved: 1.2 }]);
  assert.deepEqual(result.totals, { ofs: 3, ofsWithMaterial: 3, lines: 5, unplanned: 2, unused: 1 });
});

test('no empareja traspasos si la cantidad no cuadra', () => {
  const result = buildConsumption({
    ofs,
    reserved: [{ of: '0229925', code: 'X', description: 'X', quantity: 10 }],
    imputed: [{ of: '0229926', code: 'X', description: 'X', quantity: 9 }]
  });
  assert.deepEqual(result.transfers, []);
});

test('ignora los artículos que quedan a cero (devoluciones) y conserva OFs fuera de la lista', () => {
  const result = buildConsumption({
    ofs: ofs.slice(0, 1),
    reserved: [],
    imputed: [
      { of: '0229925', code: 'A', description: 'A', quantity: 5 },
      { of: '0229925', code: 'A', description: 'A', quantity: -5 },
      { of: '0999999', code: 'B', description: 'B', quantity: 1 }
    ]
  });
  assert.deepEqual(result.ofs.map((item) => [item.of, item.materials.length]), [['0229925', 0], ['0999999', 1]]);
});
