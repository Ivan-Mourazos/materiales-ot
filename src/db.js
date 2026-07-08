import sql from 'mssql';
import { config } from './config.js';

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
    AND pf.Description NOT LIKE '%(VENTAS)%'
  `;
}

function buildTokenConditions(searchableText, tokens) {
  return tokens.length
    ? tokens
      .map((_, index) => `${searchableText} LIKE @token${index} ESCAPE '\\'`)
      .join('\n        AND ')
    : '1 = 0';
}

function detectWidth(row) {
  const candidates = [];
  const pushWidth = (source, value) => {
    const width = Number.parseInt(value, 10);
    if (Number.isFinite(width) && width >= 40 && width <= 600) {
      candidates.push({ source, width });
    }
  };

  const unitText = `${row.unitCode || ''} ${row.unitDescription || ''}`;
  for (const match of unitText.matchAll(/\b(?:ML|ANCHO(?:\s+DE\s+PIEZA)?)\s*[:=-]?\s*(\d{2,3})\b/gi)) {
    pushWidth('unidad', match[1]);
  }

  const codeText = String(row.code || '');
  for (const match of codeText.matchAll(/\bP\s*(\d{2,3})\b/gi)) {
    pushWidth('referencia', match[1]);
  }

  const descriptionText = String(row.description || '');
  for (const match of descriptionText.matchAll(/(?::|\bAN(?:CHO)?\b)\s*(\d{2,3})\b|\b(\d{2,3})\s*(?:CM)?\s*AN\b/gi)) {
    pushWidth('descripcion', match[1] || match[2]);
  }

  if (candidates.length === 0) {
    return { detectedWidth: null, widthWarning: null };
  }

  const orderedSources = ['unidad', 'referencia', 'descripcion'];
  const chosen = orderedSources
    .map((source) => candidates.find((item) => item.source === source))
    .find(Boolean) || candidates[0];
  const uniqueWidths = Array.from(new Set(candidates.map((item) => item.width)));

  return {
    detectedWidth: chosen.width,
    widthWarning: uniqueWidths.length > 1
      ? `Anchos detectados no coinciden: ${candidates.map((item) => `${item.source} ${item.width}`).join(', ')}`
      : null
  };
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
    widthWarning: width.widthWarning
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
    GROUP BY s.IDArticle, w.CodWarehouse, w.Description
    ORDER BY s.IDArticle, SUM(s.Stock) DESC
  `);

  const stocks = new Map();
  for (const row of result.recordset) {
    const quantity = Math.round(Number(row.quantity) * 1000000) / 1000000;
    if (!quantity) continue;
    const list = stocks.get(row.idArticle) || [];
    list.push({
      warehouseCode: row.warehouseCode,
      warehouse: row.warehouse,
      quantity
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
    return { ...article, stockTotal: list.length ? total : null, stocks: list };
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
      a.InactiveDate AS inactiveDate
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
      a.InactiveDate AS inactiveDate
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
