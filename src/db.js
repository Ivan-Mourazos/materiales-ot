import sql from 'mssql';
import { config } from './config.js';

let poolPromise;

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
  return value.replace(/[\\%_\[]/g, (char) => `\\${char}`);
}

export async function checkDatabase() {
  const pool = await getPool();
  const result = await pool.request().query('SELECT 1 AS ok');
  return result.recordset[0]?.ok === 1;
}

export async function searchArticles({ query = '', limit = 25 }) {
  const q = String(query).trim();
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

  const result = await request.query(`
    SELECT TOP (@limit)
      a.IDArticle AS idArticle,
      a.CodCompany AS company,
      a.CodArticle AS code,
      a.Description AS description,
      a.IDUnitQuantityWarehouse AS warehouseUnit,
      a.IDUnitQuantityPurchase AS purchaseUnit,
      c.SeccionDeProduccion AS productionSection,
      c.IDLineaNegocio AS businessLine
    FROM dbo.STKArticle a
    LEFT JOIN dbo._STKArticle_Custom c
      ON c.IDArticle = a.IDArticle
    WHERE a.CodCompany = @company
      AND (a.InactiveDate IS NULL OR a.InactiveDate > GETDATE())
      AND (
        LEN(@q) = 0
        OR a.CodArticle LIKE @like ESCAPE '\\'
        OR a.Description LIKE @like ESCAPE '\\'
        OR c.SeccionDeProduccion LIKE @like ESCAPE '\\'
      )
    ORDER BY
      CASE
        WHEN UPPER(a.CodArticle) = @qExact THEN 0
        WHEN a.CodArticle LIKE @prefix ESCAPE '\\' THEN 1
        WHEN a.Description LIKE @prefix ESCAPE '\\' THEN 2
        ELSE 3
      END,
      a.CodArticle;
  `);

  return result.recordset.map((row) => ({
    idArticle: row.idArticle,
    company: row.company,
    code: row.code,
    description: row.description,
    warehouseUnit: row.warehouseUnit,
    purchaseUnit: row.purchaseUnit,
    productionSection: row.productionSection,
    businessLine: row.businessLine
  }));
}

export async function closeDatabase() {
  if (poolPromise) {
    const pool = await poolPromise;
    await pool.close();
    poolPromise = undefined;
  }
}
