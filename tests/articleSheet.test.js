import test from 'node:test';
import assert from 'node:assert/strict';
import { mapArticleSheet, mapArticleVariants, mapArticleUsage, rpsDate } from '../src/articleSheet.js';

const example = () => [
  [{ IDArticle: 'guid-real', CodArticle: 'OLLAO', StockUnit: 'UNI', IDUnitQuantityWarehouse: 'u', BlockedSales: true }],
  [{ Slot: 1, CodAttribute: 'COLOR', AttributeName: '', AttributeValue: 'LATÓN', Enabled: false }],
  [{ quantity: 0.1, warehouseCode: '1' }, { quantity: 0.2, warehouseCode: '1' }],
  [{ StockMin: 8000, PurchasePrice: 0.086, AveragePrice: 0.088, DeliveryDays: 0 }],
  [{ Supplier: 'A', Default: false }, { Supplier: 'B', Default: false }], [],
  [{ PendingQuantity: 100, IDUnitQuantity: 'u', ExpectedDate: '2026-11-12' }, { PendingQuantity: 1, IDUnitQuantity: 'm', ExpectedDate: '1900-01-01' }, { PendingQuantity: 2, IDUnitQuantity: 'u', ExpectedDate: '2026-11-10' }],
  [{ IDEntityDocument: 'doc', Origin: 'generico', Description: 'Ficha', Path: 'file://carpeta/ficha.pdf' }, { Deleted: true }],
  [{ ImageBytes: 10 }], [{ ReservedQuantity: 52.5 }],
  [{ DocumentPrice: 101.6198, StockMovementPrice: 0.086377, IDUnitPrice: 'm', IDCurrency: 'eur', DeliveryNoteDate: '2026-10-23', Discount1: 15 }],
  [{ Price: 101.6198, IDUnitPrice: 'm', IDUnitQuantity: 'u', IDCurrency: 'eur' }],
  [{ IDMeasureUnit: 'u', CodMeasureUnit: 'UNI' }, { IDMeasureUnit: 'm', CodMeasureUnit: 'MILLAR' }],
  [{ IDCurrency: 'eur', CodISO: 'EUR' }]
];
test('stock físico, reservas y pendientes independientes; nunca mezcla unidades', () => {
  const data = mapArticleSheet(example());
  assert.equal(data.stock.total, 0.3);
  assert.equal(data.stock.reserved, 52.5);
  assert.deepEqual(data.stock.pending, [{ unit: 'UNI', quantity: 102, nextDate: '2026-11-10' }, { unit: 'MILLAR', quantity: 1, nextDate: null }]);
});
test('conserva precio documental por millar y movimiento por unidad', () => {
  const p = mapArticleSheet(example()).purchases;
  assert.equal(p.lastReceipt.documentPrice, 101.6198);
  assert.equal(p.lastReceipt.documentUnit, 'MILLAR');
  assert.equal(p.lastReceipt.movementPrice, 0.086377);
  assert.equal(p.lastReceipt.stockUnit, 'UNI');
  assert.equal(p.lastReceipt.currency, 'EUR');
  assert.equal(p.valuation.currency, null);
  assert.equal(p.tariffs[0].priceUnit, 'MILLAR');
  assert.equal(p.deliveryDays, null);
  assert.equal(p.usualSupplier, null);
});
test('resuelve moneda base por sociedad, separada de la moneda documental', () => {
  const sets = example();
  sets[14] = [{ IDCurrency: 'base' }];
  sets[13].push({ IDCurrency: 'base', CodISO: 'USD' });
  const p = mapArticleSheet(sets).purchases;
  assert.equal(p.valuation.currency, 'USD');
  assert.equal(p.lastReceipt.currency, 'EUR');
  assert.equal(p.lastReceipt.valuationCurrency, 'USD');
  assert.match(p.lastReceipt.documentUnitSource, /actual del maestro/);
});
test('atributos deshabilitados siguen legibles y documentos del genérico conservan origen', () => {
  const d = mapArticleSheet(example());
  assert.equal(d.article.attributes[0].name, 'COLOR');
  assert.equal(d.article.attributes[0].value, 'LATÓN');
  assert.equal(d.article.blockedSales, true);
  assert.equal(d.documents.length, 1);
  assert.equal(d.documents[0].origin, 'generico');
  assert.equal(d.documents[0].type, 'PDF');
});
test('no atribuye habitualidad salvo maestro o marca única no bloqueada', () => {
  const sets = example();
  sets[4][0].Default = true;
  assert.equal(mapArticleSheet(sets).purchases.usualSupplier, 'A');
  sets[4][1].Default = true;
  assert.equal(mapArticleSheet(sets).purchases.usualSupplier, null);
  sets[3][0].Supplier = 'Maestro';
  assert.equal(mapArticleSheet(sets).purchases.usualSupplier, 'Maestro');
});
test('sin maestro ni stock conserva identidad y valores ausentes', () => {
  const d = mapArticleSheet([[{ IDArticle: 'id', CodArticle: 'SIN-STOCK' }]]);
  assert.equal(d.stock.total, 0);
  assert.equal(d.purchases.stockMin, null);
  assert.equal(d.purchases.valuation.lastPrice, null);
  assert.equal(mapArticleSheet([]), null);
});
test('fechas RPS conservan el día y descartan fechas centinela', () => {
  assert.equal(rpsDate(new Date('2026-11-06T00:00:00Z')), '2026-11-06');
  assert.equal(rpsDate('1900-01-01'), null);
});
test('uso conserva rectificaciones, necesidad y cierre; no expone relato personal', () => {
  const d = mapArticleUsage([[{ NetQuantity: 8, PositiveQuantity: 10, NegativeQuantity: -2 }], [{ LinkedSalesOrders: 2 }], [], [{ PendingQuantity: 130.15 }], [{ PlannedStartDate: '1900-01-01' }], [{ Description: 'Persona y correo privados', Status: 'Inicial', ClosedDate: '2026-08-25' }]]);
  assert.equal(d.consumption.negative, -2);
  assert.equal(d.needs.total, 130.15);
  assert.equal(d.needs.lines[0].plannedDate, null);
  assert.equal(d.nonConformities[0].closedDate, '2026-08-25');
  assert.ok(!JSON.stringify(d).includes('privados'));
});
test('variantes conservan ID real, stock, unidad y bloqueos con paginación', () => {
  const d = mapArticleVariants([[{ IDArticle: 'guid', Total: 306, Stock: 12.3, Unit: 'ML120', Attribute1: 'NEGRO', BlockedSales: true }]], { offset: 40, limit: 40 });
  assert.equal(d.total, 306);
  assert.equal(d.offset, 40);
  assert.equal(d.articles[0].blockedSales, true);
  assert.equal(d.articles[0].unitCode, 'ML120');
});
