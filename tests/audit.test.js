import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanUserName } from '../src/userName.js';
import { isolatedServer } from './helpers/isolated-server.js';

test('cleanUserName limpia espacios y caracteres de control y recorta a 60', () => {
  assert.equal(cleanUserName('  Iván   Mourazos '), 'Iván Mourazos');
  assert.equal(cleanUserName('Ana\nLópez\t'), 'Ana López');
  assert.equal(cleanUserName('x'.repeat(80)).length, 60);
  assert.equal(cleanUserName(''), '');
  assert.equal(cleanUserName(null), '');
  assert.equal(cleanUserName(42), '');
});

test('userFromRequest lee la cabecera X-Usuario codificada y tolera basura', async (t) => {
  const { importModule } = await isolatedServer(t);
  const { userFromRequest } = await importModule('audit.js');
  const req = (value) => ({ get: (name) => (name === 'x-usuario' ? value : undefined) });
  assert.equal(userFromRequest(req(encodeURIComponent('Iván Mourazos'))), 'Iván Mourazos');
  assert.equal(userFromRequest(req('%E0%A4%A')), '%E0%A4%A');
  assert.equal(userFromRequest(req(undefined)), '');
  assert.equal(userFromRequest({ headers: { 'x-usuario': 'David' } }), 'David');
});

test('los borradores guardan quién los crea y quién los cambió por última vez', async (t) => {
  const { importModule } = await isolatedServer(t);
  const drafts = await importModule('drafts.js');
  const creado = await drafts.saveDraft({ name: 'D', ofs: [] }, { user: 'Iván' });
  assert.equal(creado.createdBy, 'Iván');
  assert.equal(creado.updatedBy, 'Iván');

  const cambiado = await drafts.saveDraft({ ...creado, name: 'D2', expectedUpdatedAt: creado.updatedAt }, { mustExist: true, user: 'David' });
  assert.equal(cambiado.createdBy, 'Iván');
  assert.equal(cambiado.updatedBy, 'David');

  // Sin nombre (navegador antiguo) no se borra lo que había
  const anonimo = await drafts.saveDraft({ ...cambiado, expectedUpdatedAt: cambiado.updatedAt }, { mustExist: true });
  assert.equal(anonimo.updatedBy, 'David');

  // Un cliente no puede colar el autor en el cuerpo de la petición
  const colado = await drafts.saveDraft({ name: 'X', ofs: [], createdBy: 'Otro' });
  assert.equal(colado.createdBy, undefined);
});

test('los modelos guardan quién los crea y quién los cambia', async (t) => {
  const { importModule } = await isolatedServer(t);
  const models = await importModule('models.js');
  const creado = await models.saveModel({ name: 'M', parts: [] }, { user: 'Iván' });
  assert.equal(creado.createdBy, 'Iván');
  const cambiado = await models.saveModel({ ...creado, expectedUpdatedAt: creado.updatedAt }, { mustExist: true, user: 'Ana' });
  assert.equal(cambiado.createdBy, 'Iván');
  assert.equal(cambiado.updatedBy, 'Ana');
});

test('el registro apunta los cambios, del más reciente al más antiguo, y lista los nombres usados', async (t) => {
  const { importModule } = await isolatedServer(t);
  const audit = await importModule('audit.js');
  await audit.appendAudit({ action: 'create', kind: 'draft', id: 'a', name: 'Borrador A', user: 'Iván' });
  await audit.appendAudit({ action: 'delete', kind: 'model', id: 'b', name: 'Modelo B', user: 'Ana' });
  await audit.appendAudit({ action: 'update', kind: 'draft', id: 'a', name: 'Borrador A', user: '' });
  await audit.appendAudit({ action: 'update', kind: 'draft', id: 'a', name: 'Borrador A', user: 'Iván' });

  const entries = await audit.listAudit();
  assert.deepEqual(entries.map((entry) => [entry.action, entry.user]), [
    ['update', 'Iván'],
    ['update', 'Sin nombre'],
    ['delete', 'Ana'],
    ['create', 'Iván']
  ]);
  assert.equal(entries[2].name, 'Modelo B');
  assert.deepEqual(await audit.listKnownUsers(), ['Iván', 'Ana']);
});
