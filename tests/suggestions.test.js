import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuggestions, median } from '../src/suggestions.js';
import { suggestionsSql } from '../src/suggestionsSql.js';
import { registerSuggestionRoutes } from '../src/suggestionsRoutes.js';

const line = (code, quantity) => ({ code, description: code, quantity });
const history = [
  { of: '1', units: 2, materials: [line('MOTOR', 2), line('MOTOR', 2), line('RESTOPVC', 50)] },
  { of: '2', units: 1, materials: [line('MOTOR', 4), line('TUBO', 10), line('DEVUELTO', 1), line('DEVUELTO', -1)] },
  { of: '3', units: 1, materials: [line('TUBO', 20)] },
  { of: '4', units: 1, materials: [] }
];
test('sugerencias: frecuencia por OF, mediana por unidad y umbral inclusivo', () => {
  const result = buildSuggestions({ target: { of: '5', units: 3 }, history });
  assert.equal(result.sampleSize, 4);
  assert.deepEqual(result.suggestions.map((item) => [item.code, item.occurrences, item.perUnit, item.quantity]), [['MOTOR', 2, 3, 9], ['TUBO', 2, 15, 45]]);
});
test('sugerencias: excluye la propia OF, unidades inválidas, restos y códigos presentes', () => {
  const result = buildSuggestions({ target: { of: '1', units: 2 }, history: [...history, { of: '0', units: 0, materials: [line('ERROR', 99)] }], existingCodes: [' tubo '], options: { threshold: 0.3 } });
  assert.equal(result.sampleSize, 3);
  assert.deepEqual(result.suggestions.map((item) => item.code), ['MOTOR']);
  assert.deepEqual(buildSuggestions({ target: { of: '5', units: 0 }, history }).suggestions, []);
});
test('sugerencias: limita la muestra y permite ajustar umbral y restos', () => {
  const result = buildSuggestions({ target: { of: '5', units: 1 }, history, options: { limit: 1, excludeRemainders: false, threshold: 1 } });
  assert.equal(result.sampleSize, 1);
  assert.deepEqual(result.suggestions.map((item) => item.code), ['MOTOR', 'RESTOPVC']);
  assert.equal(median([]), 0);
  assert.equal(median([9, 1, 3]), 3);
});
test('SQL de sugerencias: solo consulta y usa parámetros para las OFs', () => {
  const sql = suggestionsSql(['@suggestOf0', '@suggestOf1']);
  assert.match(sql, /IN \(@suggestOf0,@suggestOf1\)/);
  assert.match(sql, /situation.SituationType = 4/);
  assert.doesNotMatch(sql, /RealEndDate/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|DROP|INTO|EXEC)\b/i);
});
test('API de sugerencias: rechaza lotes vacíos, excesivos o formatos inválidos', async () => {
  const routes = new Map();
  registerSuggestionRoutes({ get: (path, handler) => routes.set(`GET ${path}`, handler), post: (path, handler) => routes.set(`POST ${path}`, handler) }, async (ofs) => ({ ofs }));
  let status = 200, body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; } };
  for (const ofs of [[], ['abc'], Array(201).fill('1'), [null]]) {
    await routes.get('POST /api/of-suggestions')({ body: { ofs } }, res, (error) => { throw error; });
    assert.equal(status, 400);
  }
  await routes.get('GET /api/of-suggestions')({ query: { of: '0233578' } }, res, (error) => { throw error; });
  assert.deepEqual(body, { ofs: ['0233578'] });
});
