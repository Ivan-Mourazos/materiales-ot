import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv, widthConflicts } from '../src/widthReport.js';

const rows = [
  { code: 'ACRRES2013P120', description: 'LONA ACRILICA RESINADO 330 :AMARILLO :120 AN', unitCode: 'ML153', unitDescription: 'METRO LINEAL (ANCHO DE PIEZA 153)', family: 'LONAS' },
  { code: 'ACRILI2170P120', description: 'LONA ACRILICA :NEGRO 2170 :120 AN', unitCode: 'ML120', unitDescription: 'METRO LINEAL (ANCHO DE PIEZA120 CM)', family: 'LONAS' },
  { code: 'A1', description: 'OTRA :200 AN', unitCode: 'ML150', unitDescription: '', family: 'ACCESORIOS' }
];

test('solo salen los artículos con conflicto de ancho, ordenados por familia y código', () => {
  const conflicts = widthConflicts(rows);
  assert.deepEqual(conflicts.map((item) => item.code), ['A1', 'ACRRES2013P120']);
  assert.equal(conflicts[1].widthUsed, 153);
  assert.match(conflicts[1].warning, /Conflicto de ancho/);
});

test('el CSV lleva BOM, punto y coma, coma decimal y comillas cuando hacen falta', () => {
  const csv = toCsv([{ code: 'X', description: 'LONA "BUENA"; AZUL', family: 'F', unit: 'ML152', widthUsed: 152.4, warning: 'a' }]);
  assert.ok(csv.startsWith('\uFEFFCódigo;Descripción;'));
  assert.ok(csv.includes('X;"LONA ""BUENA""; AZUL";F;ML152;152,4;a\r\n'));
});
