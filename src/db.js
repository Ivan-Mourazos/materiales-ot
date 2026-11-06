import sql from 'mssql';
import { config } from './config.js';
import { orderKey, pieceFromOrderLine, toDottedOrderCode, toRpsOfCode } from './orders.js';
import { buildConsumption } from './consumption.js';
import { detectWidth } from './width.js';
import { mapArticleSheet, mapArticleVariants, mapArticleUsage } from './articleSheet.js';
import { openingSql, variantsSql, usageSql } from './articleSheetSql.js';

// Un viaje por sección; la necesidad de OF nunca forma parte de la apertura.
export async function getArticleSheet(idArticle, section = 'opening', options = {}) {
  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('idArticle', sql.VarChar(80), idArticle);
  const requestedOffset = Number(options.offset);
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
  const limit = Math.min(80, Math.max(1, Math.floor(Number(options.limit) || 40)));
  if (section === 'variants') {
    const filter = String(options.q || '').trim().slice(0, 120);
    request.input('filter', sql.NVarChar(120), filter);
    request.input('like', sql.NVarChar(260), `%${escapeLike(filter)}%`);
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
  }
  const started = performance.now();
  const result = await request.query(section === 'variants' ? variantsSql : section === 'usage' ? usageSql : openingSql);
  const data = section === 'variants' ? mapArticleVariants(result.recordsets, { offset, limit }) : section === 'usage' ? mapArticleUsage(result.recordsets) : mapArticleSheet(result.recordsets);
  if (data?.article) {
    const article = data.article;
    const width = detectWidth(article);
    const fromUnit = detectWidth({ unitCode: article.unitCode, unitDescription: article.unitDescription }).detectedWidth;
    const fromCode = detectWidth({ code: article.code }).detectedWidth;
    Object.assign(article, width, { widthSource: width.detectedWidth ? (fromUnit ? 'unidad de ficha' : fromCode ? 'código del artículo' : 'descripción del artículo') : null });
  }
  return data ? { ...data, elapsedMs: Math.round((performance.now() - started) * 10) / 10 } : null;
}

// Igualdad exacta, también para materiales antiguos o fuera del catálogo habitual.
export async function findArticleByCode(code) {
  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('code', sql.VarChar(120), code);
  const result = await request.query('SELECT TOP 1 IDArticle idArticle,CodArticle code,Description description FROM STKArticle WHERE CodCompany=@company AND CodArticle=@code');
  return result.recordset[0] || null;
}

let poolPromise;

// Caché en memoria con TTL: el maestro de artículos de RPS cambia poco, así que
// evitamos repetir los escaneos con LIKE en cada tecleo o cambio de filtro.
const queryCache = new Map();
const queryCacheMaxEntries = 200;
const listTtlMs = 3 * 60 * 1000;
const filtersTtlMs = 5 * 60 * 1000;

function cachedQuery(key, ttlMs, factory) {
  const hit = queryCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.promise;
  }

  const promise = factory();
  promise.catch(() => queryCache.delete(key));
  queryCache.set(key, { promise, expires: Date.now() + ttlMs });

  if (queryCache.size > queryCacheMaxEntries) {
    const oldestKey = queryCache.keys().next().value;
    queryCache.delete(oldestKey);
  }

  return promise;
}

const excludedCatalogFamilies = [
  'OFICINA',
  'PERSONAL',
  'SERVICIOS DIVERSOS. FACTURAS DIRECTAS',
  'HERRAMIENTAS',
  'INFORMATICA',
  'REPARACION Y MANTENIMIENTO (COMPRAS)',
  'MAQUINARIA',
  'VEHICULOS',
  'PROVISIONAL',
  'PORTES',
  'PUBLICIDAD  EN DIRECTORIOS, PRENSA, RADIO Y ESCRIT',
  'REGALOS',
  'SUSCRIPCION REVISTAS, WEBS, ETC.',
  'TRABAJOS CLIENTES',
  'GAS'
];

function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect({
      server: config.db.server,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      options: {
        encrypt: false,
        trustServerCertificate: true
      },
      pool: {
        max: 8,
        min: 0,
        idleTimeoutMillis: 30000
      },
      requestTimeout: 15000,
      connectionTimeout: 10000
    });
  }

  return poolPromise;
}

function escapeLike(value) {
  return value.replace(/[\\%_[]/g, (char) => `\\${char}`);
}

function getSearchTokens(query) {
  return String(query)
    .trim()
    .split(/[\s,;:|/\\._-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);
}

function getSearchableText() {
  return `
    CONCAT(
      a.CodArticle,
      ' ',
      a.Description,
      ' ',
      ISNULL(c.SeccionDeProduccion, ''),
      ' ',
      ISNULL(c.NormaUNE, ''),
      ' ',
      ISNULL(pl.Description, ''),
      ' ',
      ISNULL(pf.Description, ''),
      ' ',
      ISNULL(psf.Description, '')
    ) COLLATE Latin1_General_CI_AI
  `;
}

function addTokenInputs(request, tokens) {
  tokens.forEach((token, index) => {
    request.input(`token${index}`, sql.VarChar(80), `%${escapeLike(token)}%`);
  });
}

function addCatalogExclusionInputs(request) {
  excludedCatalogFamilies.forEach((family, index) => {
    request.input(`excludedFamily${index}`, sql.NVarChar(255), family);
  });
}

function buildCatalogExclusionCondition() {
  const families = excludedCatalogFamilies
    .map((_, index) => `@excludedFamily${index}`)
    .join(', ');

  return `
    NULLIF(LTRIM(RTRIM(pf.Description)), '') IS NOT NULL
    AND pf.Description NOT IN (${families})
    AND (
      pf.Description NOT LIKE '%(VENTAS)%'
      OR a.Description COLLATE Latin1_General_CI_AI LIKE '%DURASKIN%'
    )
  `;
}

function buildTokenConditions(searchableText, tokens) {
  return tokens.length
    ? tokens
      .map((_, index) => `${searchableText} LIKE @token${index} ESCAPE '\\'`)
      .join('\n        AND ')
    : '1 = 0';
}

function mapArticle(row) {
  const width = detectWidth(row);

  return {
    idArticle: row.idArticle,
    company: row.company,
    code: row.code,
    description: row.description,
    warehouseUnit: row.warehouseUnit,
    purchaseUnit: row.purchaseUnit,
    unitCode: row.unitCode,
    unitDescription: row.unitDescription,
    productLine: row.productLine,
    family: row.family,
    subfamily: row.subfamily,
    productionSection: row.productionSection,
    businessLine: row.businessLine,
    normaUne: row.normaUne,
    blockedPurchase: Boolean(row.blockedPurchase),
    blockedManufacturing: Boolean(row.blockedManufacturing),
    inactiveDate: row.inactiveDate ? row.inactiveDate.toISOString() : null,
    isActive: !row.inactiveDate || row.inactiveDate > new Date(),
    detectedWidth: width.detectedWidth,
    widthWarning: width.widthWarning,
    hasImage: Boolean(row.hasImage)
  };
}

// Stock por artículo y almacén desde STKStock. Se consulta aparte (una sola
// query para todos los artículos de la página) para no engordar los joins de
// la consulta principal del catálogo.
async function getStocksForArticles(articleIds) {
  if (articleIds.length === 0) return new Map();

  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  articleIds.forEach((id, index) => {
    request.input(`article${index}`, sql.VarChar(80), id);
  });
  const idParams = articleIds.map((_, index) => `@article${index}`).join(', ');

  const result = await request.query(`
    SELECT
      s.IDArticle AS idArticle,
      w.CodWarehouse AS warehouseCode,
      w.Description AS warehouse,
      NULLIF(LTRIM(RTRIM(s.Series)), '') AS series,
      SUM(s.Stock) AS quantity
    FROM dbo.STKStock s
    JOIN dbo.GENWarehouse w
      ON w.IDWarehouse = s.IDWarehouse
      AND w.CodCompany = s.CodCompany
    WHERE s.CodCompany = @company
      AND s.IDArticle IN (${idParams})
      AND s.Stock <> 0
      AND w.ClosedDate IS NULL
      AND (w.InactiveDate IS NULL OR w.InactiveDate > GETDATE())
    GROUP BY s.IDArticle, w.CodWarehouse, w.Description, NULLIF(LTRIM(RTRIM(s.Series)), '')
    ORDER BY s.IDArticle, w.CodWarehouse, NULLIF(LTRIM(RTRIM(s.Series)), '')
  `);

  const stocks = new Map();
  for (const row of result.recordset) {
    const quantity = Math.round(Number(row.quantity) * 1000000) / 1000000;
    if (!quantity) continue;
    const list = stocks.get(row.idArticle) || [];
    list.push({
      warehouseCode: row.warehouseCode,
      warehouse: row.warehouse,
      quantity,
      series: row.series || null
    });
    stocks.set(row.idArticle, list);
  }

  return stocks;
}

export async function getArticleStockDetails(idArticle) {
  const cleanId = String(idArticle || '').trim();
  if (!cleanId) {
    throw new Error('Artículo no válido.');
  }

  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('idArticle', sql.VarChar(80), cleanId);

  const result = await request.query(`
    SELECT
      a.IDArticle AS idArticle,
      a.CodArticle AS code,
      a.Description AS description,
      w.CodWarehouse AS warehouseCode,
      w.Description AS warehouse,
      lw.CodLocationWarehouse AS locationCode,
      lw.Description AS location,
      s.Series AS series,
      s.Stock AS quantity,
      s.LastEntryDate AS lastEntryDate,
      s.LastMovementDate AS lastMovementDate
    FROM dbo.STKStock s
    JOIN dbo.STKArticle a
      ON a.IDArticle = s.IDArticle
      AND a.CodCompany = s.CodCompany
    JOIN dbo.GENWarehouse w
      ON w.IDWarehouse = s.IDWarehouse
      AND w.CodCompany = s.CodCompany
    LEFT JOIN dbo.STKLocationWarehouse lw
      ON lw.IDLocationWarehouse = s.IDLocationWarehouse
      AND lw.CodCompany = s.CodCompany
    WHERE s.CodCompany = @company
      AND s.IDArticle = @idArticle
      AND s.Stock <> 0
      AND w.ClosedDate IS NULL
      AND (w.InactiveDate IS NULL OR w.InactiveDate > GETDATE())
    ORDER BY
      w.Description,
      lw.CodLocationWarehouse,
      s.Series,
      s.LastMovementDate DESC;
  `);

  const rows = result.recordset.map((row) => ({
    idArticle: row.idArticle,
    code: row.code,
    description: row.description,
    warehouseCode: row.warehouseCode,
    warehouse: row.warehouse,
    locationCode: row.locationCode,
    location: row.location,
    series: row.series,
    quantity: Math.round(Number(row.quantity) * 1000000) / 1000000,
    lastEntryDate: row.lastEntryDate ? row.lastEntryDate.toISOString() : null,
    lastMovementDate: row.lastMovementDate ? row.lastMovementDate.toISOString() : null
  }));

  const article = rows[0]
    ? {
      idArticle: rows[0].idArticle,
      code: rows[0].code,
      description: rows[0].description
    }
    : await getArticleSummary(cleanId);
  const total = Math.round(rows.reduce((sum, row) => sum + row.quantity, 0) * 1000000) / 1000000;

  return {
    article,
    total,
    rows
  };
}

// OFs de un pedido, con la pieza de cada una (FACOrderLineSL.IDManufacturingOrder enlaza línea ↔ OF).
// Primero se busca por igualdad exacta (usa índice); si no hay nada, comparando sin puntos.
export async function getOrderOfs(orderCode) {
  const key = orderKey(orderCode);
  if (!key) return { order: null, ofs: [] };

  const pool = await getPool();
  const select = (where) => {
    const request = pool.request();
    request.input('company', sql.VarChar(10), config.db.company);
    request.input('dotted', sql.VarChar(40), toDottedOrderCode(key) || key);
    request.input('key', sql.VarChar(40), key);
    return request.query(`
      SELECT
        m.CodManufacturingOrder AS ofCode,
        m.InternalCode AS orderCode,
        m.Quantity AS units,
        a.CodArticle AS article,
        ol.Description AS lineDescription,
        ol.Comment AS lineComment
      FROM dbo.CPRManufacturingOrder m
      LEFT JOIN dbo.STKArticle a
        ON a.IDArticle = m.IDArticle
      OUTER APPLY (
        SELECT TOP 1 l.Description, l.Comment
        FROM dbo.FACOrderLineSL l
        WHERE l.IDManufacturingOrder = m.IDManufacturingOrder
      ) ol
      WHERE m.CodCompany = @company
        AND ${where}
      ORDER BY m.CodManufacturingOrder;
    `);
  };

  let result = await select('m.InternalCode = @dotted');
  if (result.recordset.length === 0) {
    result = await select(`REPLACE(m.InternalCode, '.', '') = @key`);
  }

  const rows = result.recordset;
  return {
    order: rows[0]?.orderCode?.trim() || null,
    ofs: rows.map((row) => ({
      of: String(row.ofCode).trim(),
      piece: pieceFromOrderLine(row.lineDescription) || String(row.article || '').trim(),
      units: Number(row.units) || 0,
      article: row.article ? String(row.article).trim() : null,
      comment: row.lineComment ? String(row.lineComment).replace(/\s+/g, ' ').trim().slice(0, 400) : null
    }))
  };
}

// Despiece real de un pedido: lo imputado a cada OF y lo que se reservó, para compararlo
// (ver src/consumption.js). Solo lectura.
export async function getOrderConsumption(orderCode, { fixTransfers = true } = {}) {
  const { order, ofs } = await getOrderOfs(orderCode);
  if (!order) return { order: null, ...buildConsumption({ ofs: [], imputed: [], reserved: [] }) };

  const pool = await getPool();
  const query = (sqlText) => {
    const request = pool.request();
    request.input('company', sql.VarChar(10), config.db.company);
    request.input('order', sql.VarChar(40), order);
    return request.query(sqlText);
  };

  const [imputed, reserved] = await Promise.all([
    query(`
      SELECT m.CodManufacturingOrder AS ofCode, a.CodArticle AS code, a.Description AS description,
        SUM(i.Quantity) AS quantity
      FROM dbo.CPRImputationMaterialMO i
      JOIN dbo.CPRManufacturingOrder m ON m.IDManufacturingOrder = i.IDManufacturingOrder
      JOIN dbo.STKArticle a ON a.IDArticle = i.IDArticle
      WHERE m.CodCompany = @company AND m.InternalCode = @order
      GROUP BY m.CodManufacturingOrder, a.CodArticle, a.Description;
    `),
    query(`
      SELECT m.CodManufacturingOrder AS ofCode, a.CodArticle AS code, a.Description AS description,
        SUM(mm.Quantity) AS quantity
      FROM dbo.CPRMOMaterial mm
      JOIN dbo.CPRMOTask t ON t.IDMOTask = mm.IDMOTask
      JOIN dbo.CPRManufacturingOrder m ON m.IDManufacturingOrder = t.IDManufacturingOrder
      JOIN dbo.STKArticle a ON a.IDArticle = mm.IDArticle
      WHERE m.CodCompany = @company AND m.InternalCode = @order
      GROUP BY m.CodManufacturingOrder, a.CodArticle, a.Description;
    `)
  ]);

  const toRows = (result) =>
    result.recordset.map((row) => ({
      of: String(row.ofCode).trim(),
      code: String(row.code).trim(),
      description: String(row.description || '').trim(),
      quantity: Number(row.quantity) || 0
    }));

  return {
    order,
    ...buildConsumption({ ofs, imputed: toRows(imputed), reserved: toRows(reserved), fixTransfers })
  };
}

// Pedido al que pertenece cada OF. Las que no existen en RPS no salen en el Map.
export async function getOfOwners(ofCodes) {
  const codes = [...new Set(ofCodes.map(toRpsOfCode).filter(Boolean))].slice(0, 200);
  const owners = new Map();
  if (codes.length === 0) return owners;

  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  codes.forEach((code, index) => request.input(`of${index}`, sql.VarChar(20), code));
  const result = await request.query(`
    SELECT CodManufacturingOrder AS ofCode, InternalCode AS orderCode
    FROM dbo.CPRManufacturingOrder
    WHERE CodCompany = @company
      AND CodManufacturingOrder IN (${codes.map((_, index) => `@of${index}`).join(', ')});
  `);

  for (const row of result.recordset) {
    owners.set(String(row.ofCode).trim(), row.orderCode ? String(row.orderCode).trim() : '');
  }
  return owners;
}

// Fotos de artículo: miniaturas JPEG guardadas en STKArticle.Image (de 5 a 30 KB).
// Se guardan en memoria (también los "no tiene foto") para no releer el blob en
// cada tabla; con 500 entradas son como mucho unos 15 MB.
const imageCache = new Map();
const imageCacheMaxEntries = 500;
const imageTtlMs = 60 * 60 * 1000;

export async function getArticleImage(code) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode || cleanCode.length > 80) return null;

  const hit = imageCache.get(cleanCode);
  if (hit && hit.expires > Date.now()) return hit.image;

  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('code', sql.VarChar(80), cleanCode);
  const result = await request.query(`
    SELECT TOP 1 Image AS image
    FROM dbo.STKArticle
    WHERE CodCompany = @company
      AND CodArticle = @code
      AND DATALENGTH(Image) > 0;
  `);

  const buffer = result.recordset[0]?.image || null;
  const image = buffer ? { buffer, contentType: detectImageType(buffer) } : null;

  imageCache.delete(cleanCode);
  imageCache.set(cleanCode, { image, expires: Date.now() + imageTtlMs });
  if (imageCache.size > imageCacheMaxEntries) {
    imageCache.delete(imageCache.keys().next().value);
  }

  return image;
}

export function detectImageType(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  return 'application/octet-stream';
}

async function getArticleSummary(idArticle) {
  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('idArticle', sql.VarChar(80), idArticle);

  const result = await request.query(`
    SELECT TOP 1
      IDArticle AS idArticle,
      CodArticle AS code,
      Description AS description
    FROM dbo.STKArticle
    WHERE CodCompany = @company
      AND IDArticle = @idArticle;
  `);

  return result.recordset[0] || {
    idArticle,
    code: idArticle,
    description: ''
  };
}

function attachStocks(articles, stocks) {
  return articles.map((article) => {
    const list = stocks.get(article.idArticle) || [];
    const total = Math.round(list.reduce((sum, item) => sum + item.quantity, 0) * 1000000) / 1000000;
    const warehouseTotals = new Map();
    const series = Array.from(new Set(list.map((item) => item.series).filter(Boolean))).sort();

    for (const item of list) {
      const key = `${item.warehouseCode}||${item.warehouse}`;
      const current = warehouseTotals.get(key) || {
        warehouseCode: item.warehouseCode,
        warehouse: item.warehouse,
        quantity: 0
      };
      current.quantity += item.quantity;
      warehouseTotals.set(key, current);
    }

    const warehouseStocks = Array.from(warehouseTotals.values()).map((item) => ({
      ...item,
      quantity: Math.round(item.quantity * 1000000) / 1000000
    }));

    return {
      ...article,
      stockTotal: list.length ? total : null,
      stocks: warehouseStocks,
      stockSeries: series
    };
  });
}

export async function checkDatabase() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT 1 AS ok');
  return result.recordset[0]?.ok === 1;
}

export function searchArticles({ query = '', limit = 25 }) {
  const key = `search|${String(query).trim().toLowerCase()}|${limit}`;
  return cachedQuery(key, listTtlMs, () => searchArticlesUncached({ query, limit }));
}

async function searchArticlesUncached({ query = '', limit = 25 }) {
  const q = String(query).trim();
  const tokens = getSearchTokens(q);
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const pool = await getPool();

  const request = pool.request();
  request.input('limit', sql.Int, safeLimit);
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('q', sql.VarChar(120), q);
  request.input('qExact', sql.VarChar(120), q.toUpperCase());
  request.input('like', sql.VarChar(260), like);
  request.input('prefix', sql.VarChar(260), prefix);
  addTokenInputs(request, tokens);
  addCatalogExclusionInputs(request);

  const searchableText = getSearchableText();
  const tokenConditions = buildTokenConditions(searchableText, tokens);
  const catalogExclusionCondition = buildCatalogExclusionCondition();
  const tokenScore = tokens.length
    ? tokens
      .map((_, index) => `CASE WHEN a.CodArticle COLLATE Latin1_General_CI_AI LIKE @token${index} ESCAPE '\\' THEN 4 ELSE 0 END`)
      .join(' + ')
    : '0';

  const result = await request.query(`
    SELECT TOP (@limit)
      a.IDArticle AS idArticle,
      a.CodCompany AS company,
      a.CodArticle AS code,
      a.Description AS description,
      a.IDUnitQuantityWarehouse AS warehouseUnit,
      a.IDUnitQuantityPurchase AS purchaseUnit,
      mu.CodMeasureUnit AS unitCode,
      mu.Description AS unitDescription,
      pl.Description AS productLine,
      pf.Description AS family,
      psf.Description AS subfamily,
      c.SeccionDeProduccion AS productionSection,
      c.IDLineaNegocio AS businessLine,
      c.NormaUNE AS normaUne,
      detail.BlockedPurchase AS blockedPurchase,
      detail.BlockedManufacturing AS blockedManufacturing,
      a.InactiveDate AS inactiveDate,
      CASE WHEN DATALENGTH(a.Image) > 0 THEN 1 ELSE 0 END AS hasImage
    FROM dbo.STKArticle a
    LEFT JOIN dbo._STKArticle_Custom c
      ON c.IDArticle = a.IDArticle
    LEFT JOIN dbo.GENMeasureUnit mu
      ON mu.IDMeasureUnit = a.IDUnitQuantityWarehouse
      AND mu.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductLine pl
      ON pl.IDProductLine = a.IDProductLine
      AND pl.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductFamily pf
      ON pf.IDProductFamily = a.IDProductFamily
      AND pf.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductSubFamily psf
      ON psf.IDProductSubFamily = a.IDProductSubFamily
      AND psf.CodCompany = a.CodCompany
    OUTER APPLY (
      SELECT TOP 1 d.BlockedPurchase, d.BlockedManufacturing
      FROM dbo.STKArticleDetail d
      WHERE d.IDArticle = a.IDArticle
        AND d.CodCompany = a.CodCompany
      ORDER BY d.IDArticleDetail
    ) detail
    WHERE a.CodCompany = @company
      AND (a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND (${catalogExclusionCondition})
      AND (
        LEN(@q) = 0
        OR a.CodArticle COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\'
        OR a.Description COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\'
        OR c.SeccionDeProduccion COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\'
        OR (
          ${tokenConditions}
        )
      )
    ORDER BY
      CASE
        WHEN UPPER(a.CodArticle) = @qExact THEN 0
        WHEN a.CodArticle COLLATE Latin1_General_CI_AI LIKE @prefix ESCAPE '\\' THEN 1
        WHEN a.Description COLLATE Latin1_General_CI_AI LIKE @prefix ESCAPE '\\' THEN 2
        WHEN ${tokenConditions} THEN 3
        ELSE 3
      END,
      (${tokenScore}) DESC,
      a.CodArticle;
  `);

  return result.recordset.map(mapArticle);
}

export function listArticles(params = {}) {
  const key = `list|${JSON.stringify(params)}`;
  return cachedQuery(key, listTtlMs, () => listArticlesUncached(params));
}

async function listArticlesUncached({
  query = '',
  family = '',
  subfamily = '',
  unit = '',
  productionSection = '',
  active = 'true',
  hideBlocked = 'false',
  includeOmitted = 'false',
  limit = 100
}) {
  const q = String(query).trim();
  const tokens = getSearchTokens(q);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const like = `%${escapeLike(q)}%`;
  const pool = await getPool();
  const request = pool.request();

  request.input('limit', sql.Int, safeLimit);
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('q', sql.VarChar(120), q);
  request.input('like', sql.VarChar(260), like);
  request.input('family', sql.NVarChar(255), String(family || '').trim());
  request.input('subfamily', sql.NVarChar(255), String(subfamily || '').trim());
  request.input('unit', sql.NVarChar(80), String(unit || '').trim());
  request.input('productionSection', sql.NVarChar(255), String(productionSection || '').trim());
  request.input('activeOnly', sql.Bit, String(active) !== 'false');
  request.input('hideBlocked', sql.Bit, String(hideBlocked) === 'true');
  request.input('includeOmitted', sql.Bit, String(includeOmitted) === 'true');
  addTokenInputs(request, tokens);
  addCatalogExclusionInputs(request);

  const searchableText = getSearchableText();
  const tokenConditions = buildTokenConditions(searchableText, tokens);
  const catalogExclusionCondition = buildCatalogExclusionCondition();

  const result = await request.query(`
    SELECT TOP (@limit)
      a.IDArticle AS idArticle,
      a.CodCompany AS company,
      a.CodArticle AS code,
      a.Description AS description,
      a.IDUnitQuantityWarehouse AS warehouseUnit,
      a.IDUnitQuantityPurchase AS purchaseUnit,
      mu.CodMeasureUnit AS unitCode,
      mu.Description AS unitDescription,
      pl.Description AS productLine,
      pf.Description AS family,
      psf.Description AS subfamily,
      c.SeccionDeProduccion AS productionSection,
      c.IDLineaNegocio AS businessLine,
      c.NormaUNE AS normaUne,
      detail.BlockedPurchase AS blockedPurchase,
      detail.BlockedManufacturing AS blockedManufacturing,
      a.InactiveDate AS inactiveDate,
      CASE WHEN DATALENGTH(a.Image) > 0 THEN 1 ELSE 0 END AS hasImage
    FROM dbo.STKArticle a
    LEFT JOIN dbo._STKArticle_Custom c
      ON c.IDArticle = a.IDArticle
    LEFT JOIN dbo.GENMeasureUnit mu
      ON mu.IDMeasureUnit = a.IDUnitQuantityWarehouse
      AND mu.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductLine pl
      ON pl.IDProductLine = a.IDProductLine
      AND pl.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductFamily pf
      ON pf.IDProductFamily = a.IDProductFamily
      AND pf.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductSubFamily psf
      ON psf.IDProductSubFamily = a.IDProductSubFamily
      AND psf.CodCompany = a.CodCompany
    OUTER APPLY (
      SELECT TOP 1 d.BlockedPurchase, d.BlockedManufacturing
      FROM dbo.STKArticleDetail d
      WHERE d.IDArticle = a.IDArticle
        AND d.CodCompany = a.CodCompany
      ORDER BY d.IDArticleDetail
    ) detail
    WHERE a.CodCompany = @company
      AND (@activeOnly = 0 OR a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND (@family = '' OR pf.Description = @family)
      AND (@subfamily = '' OR psf.Description = @subfamily)
      AND (@unit = '' OR mu.CodMeasureUnit = @unit)
      AND (@productionSection = '' OR c.SeccionDeProduccion = @productionSection)
      AND (@includeOmitted = 1 OR (${catalogExclusionCondition}))
      AND (
        @hideBlocked = 0
        OR (
          ISNULL(detail.BlockedPurchase, 0) = 0
          AND ISNULL(detail.BlockedManufacturing, 0) = 0
        )
      )
      AND (
        LEN(@q) = 0
        OR a.CodArticle COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\'
        OR a.Description COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\'
        OR c.SeccionDeProduccion COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\'
        OR ${tokenConditions}
      )
    ORDER BY
      CASE WHEN a.InactiveDate IS NULL OR a.InactiveDate > GETDATE() THEN 0 ELSE 1 END,
      CASE WHEN ISNULL(detail.BlockedPurchase, 0) = 1 OR ISNULL(detail.BlockedManufacturing, 0) = 1 THEN 1 ELSE 0 END,
      pf.Description,
      psf.Description,
      a.CodArticle;
  `);

  const articles = result.recordset.map(mapArticle);
  const stocks = await getStocksForArticles(articles.map((article) => article.idArticle));
  return attachStocks(articles, stocks);
}

export function listArticleFilters(params = {}) {
  const key = `filters|${JSON.stringify(params)}`;
  return cachedQuery(key, filtersTtlMs, () => listArticleFiltersUncached(params));
}

async function listArticleFiltersUncached({ family = '', subfamily = '', includeOmitted = 'false' } = {}) {
  const pool = await getPool();
  const request = pool.request();
  request.input('company', sql.VarChar(10), config.db.company);
  request.input('family', sql.NVarChar(255), String(family || '').trim());
  request.input('subfamily', sql.NVarChar(255), String(subfamily || '').trim());
  request.input('includeOmitted', sql.Bit, String(includeOmitted) === 'true');
  addCatalogExclusionInputs(request);
  const catalogExclusionCondition = buildCatalogExclusionCondition();

  const result = await request.query(`
    SELECT 'family' AS type, pf.Description AS value
    FROM dbo.STKArticle a
    LEFT JOIN dbo.GENProductFamily pf
      ON pf.IDProductFamily = a.IDProductFamily
      AND pf.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductSubFamily psf
      ON psf.IDProductSubFamily = a.IDProductSubFamily
      AND psf.CodCompany = a.CodCompany
    WHERE a.CodCompany = @company
      AND (a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND NULLIF(LTRIM(RTRIM(pf.Description)), '') IS NOT NULL
      AND (@subfamily = '' OR psf.Description = @subfamily)
      AND (@includeOmitted = 1 OR (${catalogExclusionCondition}))
    GROUP BY pf.Description

    UNION ALL

    SELECT 'subfamily' AS type, psf.Description AS value
    FROM dbo.STKArticle a
    LEFT JOIN dbo.GENProductFamily pf
      ON pf.IDProductFamily = a.IDProductFamily
      AND pf.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductSubFamily psf
      ON psf.IDProductSubFamily = a.IDProductSubFamily
      AND psf.CodCompany = a.CodCompany
    WHERE a.CodCompany = @company
      AND (a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND NULLIF(LTRIM(RTRIM(psf.Description)), '') IS NOT NULL
      AND (@family = '' OR pf.Description = @family)
      AND (@includeOmitted = 1 OR (${catalogExclusionCondition}))
    GROUP BY psf.Description

    UNION ALL

    SELECT 'unit' AS type, mu.CodMeasureUnit AS value
    FROM dbo.STKArticle a
    LEFT JOIN dbo.GENProductFamily pf
      ON pf.IDProductFamily = a.IDProductFamily
      AND pf.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENMeasureUnit mu
      ON mu.IDMeasureUnit = a.IDUnitQuantityWarehouse
      AND mu.CodCompany = a.CodCompany
    LEFT JOIN dbo.GENProductSubFamily psf
      ON psf.IDProductSubFamily = a.IDProductSubFamily
      AND psf.CodCompany = a.CodCompany
    WHERE a.CodCompany = @company
      AND (a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND NULLIF(LTRIM(RTRIM(mu.CodMeasureUnit)), '') IS NOT NULL
      AND (@family = '' OR pf.Description = @family)
      AND (@subfamily = '' OR psf.Description = @subfamily)
      AND (@includeOmitted = 1 OR (${catalogExclusionCondition}))
    GROUP BY mu.CodMeasureUnit

    UNION ALL

    SELECT 'productionSection' AS type, c.SeccionDeProduccion AS value
    FROM dbo.STKArticle a
    LEFT JOIN dbo.GENProductFamily pf
      ON pf.IDProductFamily = a.IDProductFamily
      AND pf.CodCompany = a.CodCompany
    LEFT JOIN dbo._STKArticle_Custom c
      ON c.IDArticle = a.IDArticle
    LEFT JOIN dbo.GENProductSubFamily psf
      ON psf.IDProductSubFamily = a.IDProductSubFamily
      AND psf.CodCompany = a.CodCompany
    WHERE a.CodCompany = @company
      AND (a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND NULLIF(LTRIM(RTRIM(c.SeccionDeProduccion)), '') IS NOT NULL
      AND (@family = '' OR pf.Description = @family)
      AND (@subfamily = '' OR psf.Description = @subfamily)
      AND (@includeOmitted = 1 OR (${catalogExclusionCondition}))
    GROUP BY c.SeccionDeProduccion
    ORDER BY type, value;
  `);

  return result.recordset.reduce((filters, row) => {
    filters[row.type].push(row.value);
    return filters;
  }, {
    family: [],
    subfamily: [],
    unit: [],
    productionSection: []
  });
}

export async function closeDatabase() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = undefined;
  }
}
