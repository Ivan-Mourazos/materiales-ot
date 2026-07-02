import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { checkDatabase, closeDatabase, listArticleFilters, listArticles, searchArticles } from './db.js';
import { buildOfWorkbook, buildOrderArchiveWorkbook, buildReservationWorkbook } from './excel.js';
import { normalizeReservation } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      database: await checkDatabase(),
      networkSave: Boolean(config.exportDirectory),
      orderArchive: Boolean(config.orderArchiveRoot)
    });
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

app.get('/api/article-filters', async (_req, res, next) => {
  try {
    res.json({ filters: await listArticleFilters() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/article-list', async (req, res, next) => {
  try {
    const articles = await listArticles({
      query: req.query.q || '',
      family: req.query.family || '',
      subfamily: req.query.subfamily || '',
      unit: req.query.unit || '',
      productionSection: req.query.productionSection || '',
      active: req.query.active || 'true',
      hideBlocked: req.query.hideBlocked || 'false',
      limit: req.query.limit || 120
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

app.post('/api/export/save', async (req, res, next) => {
  try {
    if (!config.exportDirectory) {
      res.status(400).json({
        error: 'No hay carpeta de guardado configurada. Define EXPORT_DIRECTORY en .env.'
      });
      return;
    }

    const reservation = normalizeReservation(req.body);
    await fs.mkdir(config.exportDirectory, { recursive: true });

    const targets = reservation.ofs.map((ofBlock) => {
      const filename = `${sanitizeOf(ofBlock.of)}.xlsx`;
      return {
        ofBlock,
        of: ofBlock.of,
        filename,
        savedPath: path.join(config.exportDirectory, filename)
      };
    });
    const duplicated = findDuplicatedFilenames(targets);

    if (duplicated.length > 0) {
      res.status(400).json({
        error: `Hay OFs duplicadas en la reserva: ${duplicated.join(', ')}.`
      });
      return;
    }

    const saved = [];
    for (const target of targets) {
      const workbook = await buildOfWorkbook(target.ofBlock);
      await fs.writeFile(target.savedPath, workbook);
      saved.push({
        of: target.of,
        filename: target.filename,
        savedPath: target.savedPath
      });
    }

    const orderArchive = await saveOrderArchiveIfNeeded(reservation);

    res.json({ ok: true, saved, orderArchive });
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

function sanitizeOf(value) {
  const clean = String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '');

  if (!clean) {
    throw new Error('Hay una OF sin numero valido.');
  }

  return clean.slice(0, 80);
}

function findDuplicatedFilenames(targets) {
  const seen = new Set();
  const duplicated = new Set();

  for (const target of targets) {
    const key = target.filename.toLowerCase();
    if (seen.has(key)) {
      duplicated.add(target.of);
    }
    seen.add(key);
  }

  return Array.from(duplicated);
}

async function saveOrderArchiveIfNeeded(reservation) {
  if (!config.orderArchiveRoot || !reservation.orderCode) {
    return null;
  }

  const archivePath = buildOrderArchivePath(reservation.orderCode);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });

  const workbook = await buildOrderArchiveWorkbook(reservation);
  await fs.writeFile(archivePath, workbook);

  return {
    filename: path.basename(archivePath),
    savedPath: archivePath
  };
}

function buildOrderArchivePath(orderCode) {
  const cleanOrder = sanitizeOrderCode(orderCode);
  const year = getOrderYear(cleanOrder);

  if (!year) {
    throw new Error('No pude determinar el año desde el numero de pedido.');
  }

  return path.join(config.orderArchiveRoot, String(year), `M.${cleanOrder}.xlsx`);
}

function sanitizeOrderCode(value) {
  const clean = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '');

  if (!clean) {
    throw new Error('El numero de pedido no es valido.');
  }

  return clean.slice(0, 80);
}

function getOrderYear(orderCode) {
  const match = /^[A-Z]+(\d{2})/.exec(orderCode);
  if (!match) return null;
  return 2000 + Number(match[1]);
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
