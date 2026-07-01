import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { checkDatabase, closeDatabase, searchArticles } from './db.js';
import { buildReservationWorkbook } from './excel.js';
import { normalizeReservation } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({ ok: true, database: await checkDatabase() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/articles', async (req, res, next) => {
  try {
    const articles = await searchArticles({
      query: req.query.q || '',
      limit: req.query.limit || 25
    });
    res.json({ articles });
  } catch (error) {
    next(error);
  }
});

app.post('/api/export', async (req, res, next) => {
  try {
    const reservation = normalizeReservation(req.body);
    const workbook = await buildReservationWorkbook(reservation);
    const filename = buildFilename(reservation);

    res
      .status(200)
      .setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(workbook);
  } catch (error) {
    next(error);
  }
});

await configureFrontend();

app.use((error, _req, res, _next) => {
  const status = error.message?.startsWith('La ') || error.message?.startsWith('Anade') || error.message?.startsWith('Hay ')
    ? 400
    : 500;

  if (status === 500) {
    console.error(error);
  }

  res.status(status).json({
    error: status === 500 ? 'No se pudo completar la operacion.' : error.message
  });
});

const server = app.listen(config.port, () => {
  console.log(`Reserva de materiales disponible en http://localhost:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function buildFilename(reservation) {
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = reservation.orderCode || reservation.ofs.map((item) => item.of).join('-');
  return `reserva-materiales-${sanitize(suffix)}-${stamp}.xlsx`;
}

function sanitize(value) {
  return String(value || 'rps')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'rps';
}

async function configureFrontend() {
  if (isProduction) {
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(distDir, 'index.html'));
        return;
      }
      next();
    });
    return;
  }

  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.middlewares);
}
