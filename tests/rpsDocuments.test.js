import assert from 'node:assert/strict';
import test from 'node:test';
import { documentContentType, resolveRpsDocumentPath } from '../src/rpsDocuments.js';

const linux = { shareUnc: '\\\\192.168.0.128\\RPS', shareRoot: '/mnt/rps', platform: 'linux' };
const windows = { shareUnc: '\\\\192.168.0.128\\RPS', shareRoot: '\\\\192.168.0.128\\RPS', platform: 'win32' };

test('traduce la ruta de RPS a la carpeta montada en Linux', () => {
  assert.equal(
    resolveRpsDocumentPath('file://\\\\192.168.0.128\\RPS\\COMPRAS\\CARACTERISTIAS\\MONZA.pdf', linux),
    '/mnt/rps/COMPRAS/CARACTERISTIAS/MONZA.pdf'
  );
  // Sin «file://» y con mayúsculas distintas también vale
  assert.equal(
    resolveRpsDocumentPath('\\\\192.168.0.128\\rps\\COMPRAS\\FOTOS\\a b.jpg', linux),
    '/mnt/rps/COMPRAS/FOTOS/a b.jpg'
  );
});

test('en Windows sirve la propia ruta de red', () => {
  assert.equal(
    resolveRpsDocumentPath('file://\\\\192.168.0.128\\RPS\\COMPRAS\\MONZA.pdf', windows),
    '\\\\192.168.0.128\\RPS\\COMPRAS\\MONZA.pdf'
  );
});

test('rechaza rutas fuera de la carpeta compartida o que intentan salirse', () => {
  assert.equal(resolveRpsDocumentPath('file://\\\\192.168.0.128\\Oftecnica\\x.pdf', linux), null);
  assert.equal(resolveRpsDocumentPath('file://\\\\192.168.0.128\\RPS\\..\\Oftecnica\\x.pdf', linux), null);
  assert.equal(resolveRpsDocumentPath('file://\\\\192.168.0.128\\RPS\\COMPRAS\\..\\..\\etc\\passwd', linux), null);
  assert.equal(resolveRpsDocumentPath('C:\\Windows\\win.ini', windows), null);
  assert.equal(resolveRpsDocumentPath('file://\\\\192.168.0.128\\RPS\\', linux), null);
  assert.equal(resolveRpsDocumentPath('', linux), null);
  assert.equal(resolveRpsDocumentPath('file://\\\\192.168.0.128\\RPS\\a.pdf', { ...linux, shareRoot: '' }), null);
});

test('los PDF e imágenes se abren en el navegador; el resto se descarga', () => {
  assert.deepEqual(documentContentType('MONZA.PDF'), { contentType: 'application/pdf', inline: true });
  assert.deepEqual(documentContentType('foto.jpg'), { contentType: 'image/jpeg', inline: true });
  assert.equal(documentContentType('plano.dwg').inline, false);
  assert.equal(documentContentType('raro.xyz').contentType, 'application/octet-stream');
});
