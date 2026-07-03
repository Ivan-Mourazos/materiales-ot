import compression from 'compression';
import express from 'express';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { checkDatabase, closeDatabase, listArticleFilters, listArticles, searchArticles } from './db.js';
import { buildOfWorkbook, buildOrderArchiveWorkbook, buildReservationWorkbook } from './excel.js';
import { appendHistory, listHistory } from './history.js';
import { normalizeReservation } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');
const isProduction = process.env.NODE_ENV === 'production';

const app = express();

app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    const [database, exportPath, orderArchivePath] = await Promise.all([
      checkDatabase().catch(() => false),
      getPathStatus(config.exportDirectory),
      getPathStatus(config.orderArchiveRoot)
    ]);

    res.json({
      ok: true,
      database,
      networkSave: exportPath.configured && exportPath.valid && exportPath.accessible !== false,
      orderArchive: orderArchivePath.configured && orderArchivePath.valid && orderArchivePath.accessible !== false,
      paths: {
        exportDirectory: exportPath,
        orderArchiveRoot: orderArchivePath
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/history', async (req, res, next) => {
  try {
    res.json({ entries: await listHistory(req.query.limit) });
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

app.get('/api/article-filters', async (req, res, next) => {
  try {
    res.json({
      filters: await listArticleFilters({
        family: req.query.family || '',
        subfamily: req.query.subfamily || '',
        includeOmitted: req.query.includeOmitted || 'false'
      })
    });
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
      includeOmitted: req.query.includeOmitted || 'false',
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

    const exportPath = await getPathStatus(config.exportDirectory);
    if (!exportPath.valid) {
      res.status(400).json({ error: exportPath.message });
      return;
    }

    const reservation = normalizeReservation(req.body);
    const confirmOverwrite = req.body?.confirmOverwrite === true;

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

    // Generar todos los libros antes de escribir nada: si algo falla
    // (p. ej. el año del pedido), no queda ningún archivo a medias en la red.
    for (const target of targets) {
      target.workbook = await buildOfWorkbook(target.ofBlock);
    }

    let archiveTarget = null;
    if (config.orderArchiveRoot && reservation.orderCode) {
      const orderArchivePath = await getPathStatus(config.orderArchiveRoot);
      if (!orderArchivePath.valid) {
        res.status(400).json({ error: orderArchivePath.message });
        return;
      }

      const savedPath = buildOrderArchivePath(reservation.orderCode);
      archiveTarget = {
        savedPath,
        filename: path.basename(savedPath),
        workbook: await buildOrderArchiveWorkbook(reservation)
      };
    }

    await fs.mkdir(config.exportDirectory, { recursive: true });

    const existing = [];
    for (const target of targets) {
      target.exists = await fileExists(target.savedPath);
      if (target.exists) existing.push(target.filename);
    }
    if (archiveTarget) {
      archiveTarget.exists = await fileExists(archiveTarget.savedPath);
      if (archiveTarget.exists) existing.push(`${archiveTarget.filename} (archivo de pedido)`);
    }

    if (existing.length > 0 && !confirmOverwrite) {
      res.status(409).json({ needsConfirmation: true, existing });
      return;
    }

    const saved = [];
    for (const target of targets) {
      try {
        await writeFileAtomic(target.savedPath, target.workbook);
      } catch (error) {
        console.error(error);
        throw httpError(500, buildPartialSaveMessage(target.filename, saved));
      }
      saved.push({
        of: target.of,
        filename: target.filename,
        savedPath: target.savedPath,
        overwritten: Boolean(target.exists)
      });
    }

    let orderArchive = null;
    if (archiveTarget) {
      try {
        await fs.mkdir(path.dirname(archiveTarget.savedPath), { recursive: true });
        await writeFileAtomic(archiveTarget.savedPath, archiveTarget.workbook);
      } catch (error) {
        console.error(error);
        throw httpError(
          500,
          `Las reservas de OF se guardaron, pero no se pudo escribir el archivo de pedido ${archiveTarget.filename}. Revisa la carpeta de archivo.`
        );
      }
      orderArchive = {
        filename: archiveTarget.filename,
        savedPath: archiveTarget.savedPath,
        overwritten: Boolean(archiveTarget.exists)
      };
    }

    await appendHistory(buildHistoryEntry(reservation, saved, orderArchive));

    res.json({ ok: true, saved, orderArchive });
  } catch (error) {
    next(error);
  }
});

await configureFrontend();

app.use((error, _req, res, _next) => {
  const status = error.statusCode
    || (error.message?.startsWith('La ') || error.message?.startsWith('Anade') || error.message?.startsWith('Hay ')
      ? 400
      : 500);

  if (status === 500 && !error.statusCode) {
    console.error(error);
  }

  res.status(status).json({
    error: status === 500 && !error.statusCode ? 'No se pudo completar la operación.' : error.message
  });
});

const server = app.listen(config.port, () => {
  console.log(`Reserva de materiales disponible en http://localhost:${config.port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n✗ El puerto ${config.port} ya está en uso.`);
    console.error(`  Cierra la instancia anterior o cambia PORT en .env\n`);
  } else {
    console.error('\n✗ Error al iniciar el servidor:', error.message, '\n');
  }
  process.exit(1);
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
    throw new Error('Hay una OF sin número válido.');
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

function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function buildPartialSaveMessage(failedFilename, saved) {
  const savedList = saved.map((item) => item.filename).join(', ');
  return saved.length > 0
    ? `No se pudo guardar ${failedFilename}. Sí se guardaron: ${savedList}. Revisa la carpeta compartida y vuelve a generar.`
    : `No se pudo guardar ${failedFilename}. Revisa el acceso a la carpeta compartida.`;
}

async function fileExists(target) {
  return fs.access(target).then(() => true, () => false);
}

async function writeFileAtomic(targetPath, buffer) {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;

  await fs.writeFile(tmpPath, buffer);
  try {
    await fs.rename(tmpPath, targetPath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function buildHistoryEntry(reservation, saved, orderArchive) {
  const lines = reservation.ofs.flatMap((ofBlock) => ofBlock.materials);

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    orderCode: reservation.orderCode || '',
    ofs: reservation.ofs,
    files: saved.map(({ of, filename, overwritten }) => ({ of, filename, overwritten })),
    orderArchive: orderArchive
      ? { filename: orderArchive.filename, overwritten: orderArchive.overwritten }
      : null,
    totals: {
      ofs: reservation.ofs.length,
      lines: lines.length,
      units: Math.round(lines.reduce((sum, line) => sum + line.quantity, 0) * 1000000) / 1000000
    }
  };
}

function buildOrderArchivePath(orderCode) {
  const cleanOrder = sanitizeOrderCode(orderCode);
  const year = getOrderYear(cleanOrder);

  if (!year) {
    throw new Error('No pude determinar el año desde el número de pedido.');
  }

  return path.join(config.orderArchiveRoot, String(year), 'Reserva Materiales', `M.${cleanOrder}.xlsx`);
}

function sanitizeOrderCode(value) {
  const clean = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '');

  if (!clean) {
    throw new Error('El número de pedido no es válido.');
  }

  return clean.slice(0, 80);
}

function getOrderYear(orderCode) {
  const match = /^[A-Z]+(\d{2})/.exec(orderCode);
  if (!match) return null;
  return 2000 + Number(match[1]);
}

async function getPathStatus(value) {
  const configured = Boolean(value);
  const isUnc = isWindowsUncPath(value);
  const valid = !configured || process.platform === 'win32' || !isUnc;

  let accessible = null;
  if (configured && valid) {
    accessible = await withTimeout(
      fs.stat(value).then((stats) => stats.isDirectory()),
      3000
    ).catch(() => false);
  }

  return {
    configured,
    valid,
    accessible,
    platform: process.platform,
    type: isUnc ? 'windows-unc' : configured ? 'local-or-mounted' : 'empty',
    message: !valid
      ? 'Ruta de red Windows configurada en Linux. Monta la carpeta SMB/CIFS en el servidor y usa esa ruta local en .env.'
      : configured && accessible === false
        ? 'No se puede acceder a la carpeta configurada. Comprueba la red o la ruta en .env.'
        : null
  };
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function isWindowsUncPath(value) {
  return typeof value === 'string' && /^\\\\[^\\]+\\[^\\]+/.test(value.trim());
}

function serveDistFolder() {
  // Los assets de Vite llevan hash en el nombre: caché larga e inmutable.
  app.use(express.static(distDir, { index: false, maxAge: '1y', immutable: true }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
      return;
    }
    next();
  });
}

async function configureFrontend() {
  if (isProduction) {
    serveDistFolder();
    return;
  }

  // Modo dev: intentar Vite en middleware mode. Si no está disponible
  // (p. ej. devDependencies no instaladas en el servidor) usamos dist/ como
  // fallback para que la web funcione igualmente.
  try {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log('  Modo: desarrollo (Vite HMR activo)');
  } catch (error) {
    console.warn(`  Motivo: ${error.message}`);
    const distIndex = path.join(distDir, 'index.html');
    const hasDist = await fs.access(distIndex).then(() => true, () => false);

    if (!hasDist) {
      console.error('\n✗ No se puede arrancar Vite y no hay carpeta dist/ compilada.');
      console.error('  Ejecuta primero: pnpm build');
      console.error('  O arranca con: NODE_ENV=production node src/server.js\n');
      process.exit(1);
    }

    console.warn('\n⚠ Vite no disponible — sirviendo dist/ compilado.');
    console.warn('  Para desarrollo con HMR instala las devDependencies: pnpm install');
    console.warn('  Para suprimir este aviso usa: NODE_ENV=production node src/server.js\n');
    serveDistFolder();
  }
}
