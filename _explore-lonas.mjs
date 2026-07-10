import { listArticles, closeDatabase } from './src/db.js';
import sql from 'mssql';
import { config } from './src/config.js';

// 1. La función real
const articles = await listArticles({ query: 'ACRILI2013P120', limit: 5 });
console.log('=== listArticles(ACRILI2013P120) ===');
for (const a of articles) {
  console.log(`${a.code} | idArticle=${JSON.stringify(a.idArticle)} | stockTotal=${a.stockTotal} | stocks=${JSON.stringify(a.stocks)}`);
}

// 2. La subconsulta de stock a mano con ese idArticle
if (articles.length > 0) {
  const id = articles[0].idArticle;
  const pool = await sql.connect({
    server: config.db.server,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    options: { encrypt: false, trustServerCertificate: true },
    requestTimeout: 30000
  });

  const req = pool.request();
  req.input('company', sql.VarChar(10), config.db.company);
  req.input('article0', sql.VarChar(80), id);
  const r = await req.query(`
    SELECT s.IDArticle, w.CodWarehouse, w.Description, SUM(s.Stock) AS qty
    FROM dbo.STKStock s
    JOIN dbo.GENWarehouse w ON w.IDWarehouse = s.IDWarehouse AND w.CodCompany = s.CodCompany
    WHERE s.CodCompany = @company AND s.IDArticle IN (@article0) AND s.Stock <> 0
      AND w.ClosedDate IS NULL AND (w.InactiveDate IS NULL OR w.InactiveDate > GETDATE())
    GROUP BY s.IDArticle, w.CodWarehouse, w.Description
  `);
  console.log('\n=== subconsulta directa con idArticle', JSON.stringify(id), '===');
  console.log(r.recordset);

  // 3. ¿Coincide el IDArticle de STKStock con el de STKArticle?
  const chk = await pool.request().query(`
    SELECT TOP 3 a.IDArticle AS deArticle, s.IDArticle AS deStock, LEN(a.IDArticle) AS lenA, LEN(s.IDArticle) AS lenS
    FROM dbo.STKArticle a
    JOIN dbo.STKStock s ON s.IDArticle = a.IDArticle AND s.CodCompany = a.CodCompany
    WHERE a.CodArticle = 'ACRILI2013P120' AND a.CodCompany = '001'
  `);
  console.log('\n=== join directo STKArticle->STKStock ===');
  console.log(chk.recordset);

  await pool.close();
}

await closeDatabase();
