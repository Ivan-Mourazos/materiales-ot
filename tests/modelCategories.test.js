import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryKey, groupModelsByCategory, listCategoryLabels } from '../src/client/modelCategories.ts';

const modelo = (id, category, updatedAt = '2026-10-01T00:00:00.000Z') => ({
  id,
  category,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt
});

const resumen = (grupos) => grupos.map((g) => [g.key, g.label, g.models.map((m) => m.id)]);

test('categoryKey ignora mayúsculas, tildes y espacios', () => {
  assert.equal(categoryKey('  Escenários   Móviles '), 'escenarios moviles');
  assert.equal(categoryKey(undefined), '');
  assert.equal(categoryKey(null), '');
  assert.equal(categoryKey('   '), '');
});

test('agrupa sin distinguir mayúsculas ni tildes y deja "Sin categoría" al final', () => {
  const grupos = groupModelsByCategory([
    modelo('1', 'Toldos'),
    modelo('2', undefined),
    modelo('3', 'escenarios'),
    modelo('4', 'Escenarios'),
    modelo('5', 'ESCENARIOS'),
    modelo('6', 'Escenarios'),
    modelo('7', '  ')
  ]);
  assert.deepEqual(resumen(grupos), [
    ['escenarios', 'Escenarios', ['3', '4', '5', '6']],
    ['toldos', 'Toldos', ['1']],
    ['', 'Sin categoría', ['2', '7']]
  ]);
});

test('en empate gana la grafía del modelo actualizado más recientemente', () => {
  const [a] = groupModelsByCategory([
    modelo('1', 'escenarios', '2026-10-01T00:00:00.000Z'),
    modelo('2', 'Escenarios', '2026-10-05T00:00:00.000Z')
  ]);
  assert.equal(a.label, 'Escenarios');

  const [b] = groupModelsByCategory([
    modelo('1', 'escenarios', '2026-10-09T00:00:00.000Z'),
    modelo('2', 'Escenarios', '2026-10-05T00:00:00.000Z')
  ]);
  assert.equal(b.label, 'escenarios');
});

test('etiquetas en orden alfabético español, sin "Sin categoría"', () => {
  const etiquetas = listCategoryLabels([
    modelo('1', 'Ventanas'),
    modelo('2', 'Árboles'),
    modelo('3', undefined),
    modelo('4', 'carpas'),
    modelo('5', 'Carpas'),
    modelo('6', 'Carpas')
  ]);
  assert.deepEqual(etiquetas, ['Árboles', 'Carpas', 'Ventanas']);
});

test('sin modelos no hay grupos', () => {
  assert.deepEqual(groupModelsByCategory([]), []);
  assert.deepEqual(listCategoryLabels([]), []);
});
