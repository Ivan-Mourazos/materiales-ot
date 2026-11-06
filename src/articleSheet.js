// Transformaciones puras: las fechas de negocio de RPS conservan el día, sin cambio de huso.
export function rpsDate(value) {
  if (!value) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  return text.slice(0, 10) > '1901-01-01' ? text.slice(0, 10) : null;
}
const text = value => String(value ?? '').trim();
const number = value => Math.round((Number(value) || 0) * 1000000) / 1000000;
const nullableNumber = value => value == null ? null : number(value);
const sum = (rows, key) => number(rows.reduce((total, row) => total + number(row[key]), 0));
const flags = row => ({ blockedPurchase: Boolean(row.BlockedPurchase), blockedManufacturing: Boolean(row.BlockedManufacturing), blockedSales: Boolean(row.BlockedSales), blockedMaintenance: Boolean(row.BlockedMaintenance), inactiveDate: rpsDate(row.InactiveDate) });

export function mapArticleSheet(sets, queriedAt = new Date().toISOString()) {
  const [identity = [], attributes = [], stocks = [], masters = [], suppliers = [], delivery = [], pending = [], documents = [], images = [], reserves = [], receipts = [], tariffs = [], units = [], currencies = [], companies = []] = sets;
  const row = identity[0];
  if (!row) return null;
  const unit = id => text(units.find(u => u.IDMeasureUnit === id)?.CodMeasureUnit) || text(id) || 'Unidad no informada';
  const currency = id => {
    const c = currencies.find(c => c.IDCurrency === id);
    return text(c?.CodISO || c?.CodCurrency) || null;
  };
  const master = masters[0] || {};
  const receipt = receipts[0];
  const stockUnit = text(row.StockUnit) || unit(row.IDUnitQuantityWarehouse);
  const pendingByUnit = new Map();
  for (const line of pending) {
    // No se evalúan fórmulas de conversión ni se mezclan unidades distintas.
    const key = line.IDUnitQuantity;
    const group = pendingByUnit.get(key) || { unit: unit(key), quantity: 0, nextDate: null };
    group.quantity = number(group.quantity + number(line.PendingQuantity));
    const date = rpsDate(line.ExpectedDate);
    if (date && (!group.nextDate || date < group.nextDate)) group.nextDate = date;
    pendingByUnit.set(key, group);
  }
  const availableDefaults = suppliers.filter(s => s.Default && !s.Blocked);
  const usual = text(master.Supplier) || (availableDefaults.length === 1 ? text(availableDefaults[0].Supplier) : null);
  return {
    queriedAt,
    article: { idArticle: text(row.IDArticle), code: text(row.CodArticle), description: text(row.Description), family: text(row.Family), subfamily: text(row.Subfamily), genericCode: text(row.GenericCode), genericDescription: text(row.GenericDescription), unitCode: stockUnit, unitDescription: text(row.StockUnitDescription), purchaseUnit: text(row.PurchaseQuantityUnit), purchasePriceUnit: text(row.PurchasePriceUnit), normaUne: text(row.NormaUNE), technicalDescription: text(row.TechnicalDescription), netWeight: number(row.NetWeight) || null, grossWeight: number(row.GrossWeight) || null, hasImage: number(images[0]?.ImageBytes) > 0, ...flags(row), attributes: attributes.map(a => ({ slot: a.Slot, name: text(a.AttributeName || a.CodAttribute), code: text(a.CodAttribute), value: text(a.AttributeValue || a.CodAttributeValue), valueCode: text(a.CodAttributeValue) })) },
    stock: { total: sum(stocks, 'quantity'), reserved: sum(reserves, 'ReservedQuantity'), pending: [...pendingByUnit.values()], rows: stocks.map(s => ({ warehouseCode: text(s.warehouseCode), warehouse: text(s.warehouse), locationCode: text(s.locationCode), location: text(s.location), series: text(s.series), quantity: number(s.quantity), lastEntryDate: rpsDate(s.lastEntryDate), lastMovementDate: rpsDate(s.lastMovementDate) })), reserves: reserves.map(r => ({ order: text(r.CodManufacturingOrder), situation: text(r.Situation), quantity: number(r.ReservedQuantity), series: text(r.Series), warehouseCode: text(r.CodWarehouse) })) },
    purchases: {
      stockMin: nullableNumber(master.StockMin), pointOrder: nullableNumber(master.PointOrder), purchaseLot: nullableNumber(master.PurchaseLot), deliveryDays: number(master.DeliveryDays) || null, usualSupplier: usual,
      // Los importes valorados se expresan en la moneda base de la sociedad.
      valuation: { lastPrice: nullableNumber(master.PurchasePrice), date: rpsDate(master.PurchaseDate), averagePrice: nullableNumber(master.AveragePrice), unit: stockUnit, currency: currency(companies[0]?.IDCurrency) },
      suppliers: suppliers.map(s => ({ code: text(s.CodSupplier), name: text(s.Supplier), reference: text(s.ReferenceSupplier), blocked: Boolean(s.Blocked), isDefault: Boolean(s.Default), deliveryDays: number(s.SupplierDeliveryDays) || null })),
      delivery: delivery.map(d => ({ supplierId: text(d.IDSupplier), quantityFrom: number(d.QuantityFrom), unit: unit(d.IDUnitQuantity), days: number(d.DeliveryDays) || null })),
      lastReceipt: receipt ? { supplier: text(receipt.Supplier), code: text(receipt.CodDeliveryNote), date: rpsDate(receipt.DeliveryNoteDate), documentPrice: nullableNumber(receipt.DocumentPrice), documentUnit: unit(receipt.IDUnitPrice), documentUnitSource: 'Unidad de precio actual del maestro; el albarán no conserva la unidad histórica.', priceConversion: text(receipt.PriceConversion), movementPrice: nullableNumber(receipt.StockMovementPrice), stockUnit, currency: currency(receipt.IDCurrency), valuationCurrency: currency(companies[0]?.IDCurrency), reference: text(receipt.ReferenceSupplier), discounts: [receipt.Discount1, receipt.Discount2, receipt.Discount3, receipt.Discount4, receipt.Discount5].map(number) } : null,
      pending: pending.map(p => ({ code: text(p.CodOrder), supplier: text(p.Supplier), quantity: number(p.PendingQuantity), unit: unit(p.IDUnitQuantity), expectedDate: rpsDate(p.ExpectedDate), requestedDate: rpsDate(p.RequestedDate), reference: text(p.ReferenceSupplier) })),
      tariffs: tariffs.map(t => ({ supplier: text(t.Supplier), from: rpsDate(t.DateFrom), to: rpsDate(t.DateTo), quantityFrom: number(t.QuantityFrom), quantityUnit: unit(t.IDUnitQuantity), price: nullableNumber(t.Price), priceUnit: unit(t.IDUnitPrice), currency: currency(t.IDCurrency), discounts: [t.Discount1, t.Discount2, t.Discount3, t.Discount4, t.Discount5].map(number), purchaseLot: number(t.PurchaseLot), minimumLot: number(t.MinimumLot), reference: text(t.ReferenceSupplier) }))
    },
    documents: documents.filter(d => !d.Deleted).map(d => { const path = text(d.Path || d.DocumentPath); return { id: text(d.IDEntityDocument), name: text(d.Description || d.DocumentDescription || d.DocFileName) || 'Documento sin nombre', path, type: (path.match(/\.([a-z0-9]+)$/i)?.[1] || 'Ruta').toUpperCase(), origin: d.Origin === 'articulo' ? 'propio' : 'generico' }; })
  };
}

export function mapArticleVariants(sets, { offset = 0, limit = 40 } = {}) {
  const rows = sets[0] || [];
  return { total: number(rows[0]?.Total), offset, limit, articles: rows.map(r => ({ idArticle: text(r.IDArticle), code: text(r.CodArticle), description: text(r.Description), unitCode: text(r.Unit), stockTotal: number(r.Stock), attributes: [r.Attribute1, r.Attribute2, r.Attribute3].map(text).filter(Boolean), ...flags(r) })) };
}

export function mapArticleUsage(sets, queriedAt = new Date().toISOString()) {
  const [consumption = [], orders = [], recent = [], needs = [], needLines = [], quality = [], units = []] = sets;
  const c = consumption[0] || {};
  return { queriedAt, unit: text(units[0]?.Unit), consumption: { net: number(c.NetQuantity), positive: number(c.PositiveQuantity), negative: number(c.NegativeQuantity), rejected: number(c.RejectedQuantity), imputations: number(c.Imputations), manufacturingOrders: number(c.ManufacturingOrders), salesOrders: number(orders[0]?.LinkedSalesOrders), lastDate: rpsDate(c.LastDate) }, recent: recent.map(r => ({ code: text(r.CodManufacturingOrder), situation: text(r.Situation), date: rpsDate(r.LastUse), quantity: number(r.NetQuantity), order: text(r.LinkedOrder) })), needs: { total: sum(needs, 'PendingQuantity'), groups: needs.map(n => ({ situation: text(n.Situation), type: number(n.SituationType), quantity: number(n.PendingQuantity), orders: number(n.ManufacturingOrders) })), lines: needLines.map(n => ({ code: text(n.CodManufacturingOrder), situation: text(n.Situation), quantity: number(n.PendingQuantity), plannedDate: rpsDate(n.PlannedStartDate) })) }, nonConformities: quality.map(n => ({ code: text(n.CodNonConformity), date: rpsDate(n.DoneDate), closedDate: rpsDate(n.ClosedDate), status: text(n.Status), supplier: text(n.Supplier), rejectedQuantity: number(n.RejectedQuantity), severity: number(n.Severity), repetitive: Boolean(n.Repetitive), order: text(n.CodOrder), manufacturingOrder: text(n.CodManufacturingOrder) })) };
}
