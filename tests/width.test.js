import assert from 'node:assert/strict';
import test from 'node:test';
import { detectWidth } from '../src/width.js';

const width = (description, unitCode = 'UNI', unitDescription = 'UNI', code = 'X') =>
  detectWidth({ description, unitCode, unitDescription, code });

test('las medidas en mm no se toman como ancho en cm (caso de Iván: cinta :60 MM)', () => {
  assert.equal(width('CINTA POLIESTER :VERDE 9T 2R1C :60 MM', 'METROS').detectedWidth, null);
  assert.equal(width('AFILADO DISCO :ALUMINIO :350 MM :108 MM').detectedWidth, null);
  assert.equal(width('CHAPA IDENTIFICATIVA DE ALUMINIO :LASER :100 :30 MM').detectedWidth, null);
});

test('una cifra suelta con CM no es ancho: puede ser el largo de un brazo o de un perfil', () => {
  assert.equal(width('BRAZO ART 250 DERECHO :BRONCE 28 :250 CM').detectedWidth, null);
  assert.equal(width('GUIA PVC INTERIOR ZIP :GRIS 7016:600 CM', 'BARRA').detectedWidth, null);
});

test('el ancho marcado con AN o ANCHO se respeta, y en mm se pasa a cm', () => {
  assert.equal(width('LONA ACRILICA MASACRIL 300 :NEGRO 2170 :120 AN').detectedWidth, 120);
  assert.equal(width('TEFLON VIDRIO MARRON 12-13MM S/A :100AN (AR.03004)').detectedWidth, 100);
  assert.equal(width('LONA X :1500 MM AN').detectedWidth, 150);
  assert.equal(width('LONA X ANCHO 250').detectedWidth, 250);
  // El grosor en mm de una lona no estorba al ancho
  assert.equal(width('LONA ALUMINIO 190 MICRAS-0,19MM  UV  :180 AN').detectedWidth, 180);
});

test('la unidad de ficha manda y, si la descripción no cuadra, avisa con las dos medidas', () => {
  const result = width('LONA ACRILICA RESINADO 330 :AMARILLO :120 AN', 'ML153', 'METRO LINEAL (ANCHO DE PIEZA 153)', 'ACRRES2013P120');
  assert.equal(result.detectedWidth, 153);
  assert.match(result.widthWarning, /unidad de ficha «[^»]+» = 153 cm/);
  assert.match(result.widthWarning, /descripción «:?120 AN» = 120 cm/);
  assert.match(result.widthWarning, /Se muestra el de la unidad de ficha\./);
});

test('la unidad de ficha también entiende el ancho en mm', () => {
  assert.equal(width('LONA RECACRIL :BLANCO WHITE 099 :152 AN', 'ML1524', 'METRO LINEAL (ANCHO DE PIEZA 1524 MM)').detectedWidth, 152.4);
});

test('sin ninguna marca de ancho no hay ancho', () => {
  assert.deepEqual(width('MOTOR ALTUS RTS :70/ :17 (1163105)'), { detectedWidth: null, widthWarning: null });
});
