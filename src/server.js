import compression from 'compression';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import {
  checkDatabase,
  closeDatabase,
  getArticleImage,
  getArticleStockDetails,
  getArticleSheet,
  findArticleByCode,
  getStockForCodes,
  getArticleDocumentPath,
  listWidthCandidates,
  getOfOwners,
  getOrderConsumption,
  getOrderOfs,
  listArticleFilters,
  listArticles,
  searchArticles
} from './db.js';
import { buildOfWorkbook, buildOrderArchiveWorkbook, buildReservationWorkbook } from './excel.js';
import { appendHistory, listHistory } from './history.js';
import { deleteModel, getModelById, listModels, saveModel } from './models.js';
import { deleteDraft, getDraftById, listDrafts, saveDraft } from './drafts.js';
import { appendAudit, listAudit, listKnownUsers, userFromRequest } from './audit.js';
import { httpError } from './httpError.js';
import { findOfMismatches, orderKey } from './orders.js';
import { checkStock, describeStockWarnings, requestedByCode } from './stockCheck.js';
import { documentContentType, resolveRpsDocumentPath } from './rpsDocuments.js';
import { toCsv, widthConflicts } from './widthReport.js';
import { normalizeReservation } from './validation.js';
import { getOfSuggestions } from './db.js';
import { registerSuggestionRoutes } from './suggestionsRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');
const isProduction = process.env.NODE_ENV === 'production';
// La versión sale en /api/health para saber qué hay desplegado sin entrar al servidor.
const packageInfo = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const app = express();

app.use(compression());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res, next) => {
  try {
    const [database, exportPath, orderArchivePath, rpsDocumentsPath] = await Promise.all([
      checkDatabase().catch(() => false),
      getPathStatus(config.exportDirectory),
      getPathStatus(config.orderArchiveRoot),
      getPathStatus(config.rpsShareRoot)
    ]);

    res.json({
      ok: true,
      version: packageInfo.version,
      database,
      networkSave: exportPath.configured && exportPath.valid && exportPath.accessible !== false,
      orderArchive: orderArchivePath.configured && orderArchivePath.valid && orderArchivePath.accessible !== false,
      // Documentos de RPS (fichas técnicas): ¿se pueden abrir desde la ficha de artículo?
      rpsDocuments: rpsDocumentsPath.configured && rpsDocumentsPath.valid && rpsDocumentsPath.accessible === true,
      paths: {
        exportDirectory: exportPath,
        orderArchiveRoot: orderArchivePath,
        rpsShareRoot: rpsDocumentsPath
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

// Quién hace cada cambio (ver audit.js): para saberlo, no para impedirlo.
app.get('/api/audit', async (req, res, next) => {
  try {
    res.json({ entries: await listAudit(req.query.limit), users: await listKnownUsers() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/models', async (_req, res, next) => {
  try {
    const models = await listModels();
    res.json({ models });
  } catch (error) {
    next(error);
  }
});

app.get('/api/models/:id', async (req, res, next) => {
  try {
    const model = await getModelById(req.params.id);
    if (!model) {
      res.status(404).json({ error: 'Modelo no encontrado.' });
      return;
    }
    res.json({ model });
  } catch (error) {
    next(error);
  }
});

app.post('/api/models', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'El nombre del modelo es obligatorio.' });
      return;
    }
    const user = userFromRequest(req);
    const saved = await saveModel(req.body, { user });
    auditSaved('model', saved, user);
    res.status(201).json({ ok: true, model: saved });
  } catch (error) {
    next(error);
  }
});

app.put('/api/models/:id', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      res.status(400).json({ error: 'El nombre del modelo es obligatorio.' });
      return;
    }
    const user = userFromRequest(req);
    const saved = await saveModel({ ...req.body, id: req.params.id }, { mustExist: true, user });
    auditSaved('model', saved, user);
    res.json({ ok: true, model: saved });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/models/:id', async (req, res, next) => {
  try {
    const existing = await getModelById(req.params.id);
    await deleteModel(req.params.id);
    if (existing) appendAudit({ action: 'delete', kind: 'model', id: existing.id, name: existing.name, user: userFromRequest(req) });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/drafts', async (_req, res, next) => {
  try {
    const drafts = await listDrafts();
    res.json({ drafts });
  } catch (error) {
    next(error);
  }
});

app.get('/api/drafts/:id', async (req, res, next) => {
  try {
    const draft = await getDraftById(req.params.id);
    if (!draft) {
      res.status(404).json({ error: 'Borrador no encontrado.' });
      return;
    }
    res.json({ draft });
  } catch (error) {
    next(error);
  }
});

app.post('/api/drafts', async (req, res, next) => {
  try {
    const user = userFromRequest(req);
    const saved = await saveDraft(req.body, { user });
    auditSaved('draft', saved, user);
    res.status(201).json({ ok: true, draft: saved });
  } catch (error) {
    next(error);
  }
});

app.put('/api/drafts/:id', async (req, res, next) => {
  try {
    const user = userFromRequest(req);
    const saved = await saveDraft({ ...req.body, id: req.params.id }, { mustExist: true, user });
    auditSaved('draft', saved, user);
    res.json({ ok: true, draft: saved });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/drafts/:id', async (req, res, next) => {
  try {
    const existing = await getDraftById(req.params.id);
    await deleteDraft(req.params.id);
    if (existing) appendAudit({ action: 'delete', kind: 'draft', id: existing.id, name: existing.name, user: userFromRequest(req) });
    res.json({ ok: true });
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

app.get('/api/order-ofs', async (req, res, next) => {
  try {
    const order = String(req.query.order || '').trim();
    if (!orderKey(order)) {
      res.status(400).json({ error: 'Escribe un número de pedido válido (por ejemplo, AR2603201).' });
      return;
    }

    res.json(await getOrderOfs(order));
  } catch (error) {
    next(error);
  }
});

app.get('/api/order-consumption', async (req, res, next) => {
  try {
    const order = String(req.query.order || '').trim();
    if (!orderKey(order)) {
      res.status(400).json({ error: 'Escribe un número de pedido válido (por ejemplo, AR2603201).' });
      return;
    }

    res.json(await getOrderConsumption(order, { fixTransfers: req.query.fixTransfers !== 'false' }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/article-image/:code', async (req, res, next) => {
  try {
    const image = await getArticleImage(req.params.code);
    if (!image || image.contentType === 'application/octet-stream') {
      // El "no tiene foto" también se cachea un rato en el navegador.
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.status(404).end();
      return;
    }

    res
      .setHeader('Content-Type', image.contentType)
      .setHeader('Cache-Control', 'public, max-age=86400')
      .send(image.buffer);
  } catch (error) {
    next(error);
  }
});

// Abrir un documento de la ficha de artículo (rpsDocuments.js). Respuesta en texto llano si falla,
// porque se abre en una pestaña nueva del navegador.
app.get('/api/article-document', async (req, res) => {
  const idArticle = String(req.query.idArticle || '').trim();
  const id = String(req.query.id || '').trim();
  const fail = (status, message) => res.status(status).type('text/plain; charset=utf-8').send(message);
  if (!idArticle || !id || idArticle.length > 80 || id.length > 80) return fail(400, 'Falta el documento.');
  if (!config.rpsShareRoot) {
    return fail(503, 'Este servidor todavía no tiene acceso a la carpeta de documentos de RPS. Pide a IT que la monte y configure RPS_SHARE_ROOT.');
  }

  try {
    const document = await getArticleDocumentPath(idArticle, id);
    if (!document) return fail(404, 'No se encontró ese documento en la ficha del artículo.');
    const filePath = resolveRpsDocumentPath(document.rpsPath, {
      shareUnc: config.rpsShareUnc,
      shareRoot: config.rpsShareRoot
    });
    if (!filePath) return fail(404, `El documento está fuera de la carpeta de RPS y no se puede abrir desde aquí: ${document.rpsPath}`);
    const stat = await withTimeout(fs.stat(filePath), 8000).catch(() => null);
    if (!stat?.isFile()) return fail(404, `No se encuentra el archivo en la carpeta de RPS: ${document.rpsPath}`);

    const { contentType, inline } = documentContentType(filePath);
    const fileName = path.basename(filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'private, max-age=600');
    createReadStream(filePath)
      .on('error', () => (res.headersSent ? res.destroy() : fail(500, 'No se pudo leer el documento.')))
      .pipe(res);
  } catch (error) {
    console.error('No se pudo abrir el documento de RPS:', error.message);
    fail(500, 'No se pudo abrir el documento de RPS.');
  }
});

// Lista de anchos que no cuadran en las fichas de RPS, para corregirlas allí (widthReport.js).
app.get('/api/reports/width-conflicts.csv', async (_req, res, next) => {
  try {
    const conflicts = widthConflicts(await listWidthCandidates());
    const today = new Date().toISOString().slice(0, 10);
    res
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="anchos-dudosos-${today}.csv"`)
      .send(toCsv(conflicts));
  } catch (error) {
    next(error);
  }
});

// Stock libre y bloqueos de lo que lleva la asignación (stockCheck.js). Solo lectura en RPS.
app.post('/api/stock-check', async (req, res, next) => {
  try {
    const ofs = Array.isArray(req.body?.ofs) ? req.body.ofs : [];
    const requested = requestedByCode(ofs);
    const codes = [
      ...new Set(
        ofs.flatMap((ofBlock) => (Array.isArray(ofBlock?.materials) ? ofBlock.materials : []).map((line) => String(line?.code || '').trim().toUpperCase()))
      )
    ].filter(Boolean);
    const stock = await getStockForCodes(codes);
    const result = checkStock(requested, stock);
    res.json({
      stock: Object.fromEntries(stock),
      ...result,
      messages: describeStockWarnings(result)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/article-by-code', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code || code.length > 120) return res.status(400).json({ error: 'Falta un código de artículo válido.' });
  try {
    const article = await findArticleByCode(code);
    res.status(article ? 200 : 404).json(article ? { article } : { error: 'No se encontró el artículo en RPS.' });
  } catch (error) {
    console.error('No se pudo buscar el artículo en RPS:', error.message);
    res.status(500).json({ error: 'No se pudo buscar el artículo en RPS.' });
  }
});

for (const section of ['opening', 'variants', 'usage']) {
  app.get(`/api/article-sheet${section === 'opening' ? '' : `/${section}`}`, async (req, res) => {
    const idArticle = String(req.query.idArticle || '').trim();
    if (!idArticle || idArticle.length > 80) return res.status(400).json({ error: 'Falta un artículo válido.' });
    try {
      const data = await getArticleSheet(idArticle, section, req.query);
      res.status(data ? 200 : 404).json(data || { error: 'No se encontró el artículo en RPS.' });
    } catch (error) {
      console.error('No se pudo cargar la ficha de RPS:', error.message);
      res.status(500).json({ error: 'No se pudo cargar esta sección de la ficha en RPS. Inténtalo de nuevo.' });
    }
  });
}

app.get('/api/article-stock', async (req, res, next) => {
  try {
    const idArticle = String(req.query.idArticle || '').trim();
    if (!idArticle) {
      res.status(400).json({ error: 'Falta el artículo.' });
      return;
    }

    res.json(await getArticleStockDetails(idArticle));
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
      const filename = `${sanitizeOf(ofBlock.of)}.xls`;
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

    // Que cada OF exista en RPS y sea de este pedido. Si RPS no responde no se bloquea:
    // la reserva se puede generar igual, como antes de existir esta comprobación.
    if (req.body?.confirmOfs !== true) {
      const ofWarnings = await checkOfsInRps(reservation);
      if (ofWarnings.length > 0) {
        res.status(409).json({ needsOfConfirmation: true, ofWarnings });
        return;
      }
    }

    // Generar todos los libros antes de escribir nada: si algo falla
    // (p. ej. el año del pedido), no queda ningún archivo a medias en la red.
    await Promise.all(targets.map(async (target) => {
      target.workbook = await buildOfWorkbook(target.ofBlock);
    }));

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

    const existing = await Promise.all(targets.map(async (target) => {
      target.exists = await fileExists(target.savedPath);
      return target.exists ? target.filename : null;
    })).then((filenames) => filenames.filter(Boolean));

    if (archiveTarget) {
      archiveTarget.exists = await fileExists(archiveTarget.savedPath);
      if (archiveTarget.exists) existing.push(`${archiveTarget.filename} (archivo de pedido)`);
    }

    if (existing.length > 0 && !confirmOverwrite) {
      res.status(409).json({ needsConfirmation: true, existing });
      return;
    }

    const saveResults = await Promise.allSettled(
      targets.map(async (target) => {
        await writeFileAtomic(target.savedPath, target.workbook);
        return {
          of: target.of,
          filename: target.filename,
          savedPath: target.savedPath,
          overwritten: Boolean(target.exists)
        };
      })
    );

    const saved = saveResults.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const failedIndex = saveResults.findIndex((result) => result.status === 'rejected');
    if (failedIndex !== -1) {
      console.error(saveResults[failedIndex].reason);
      throw httpError(500, buildPartialSaveMessage(targets[failedIndex].filename, saved));
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

    const user = userFromRequest(req);
    const historyEntry = buildHistoryEntry(reservation, saved, orderArchive, user);
    await appendHistory(historyEntry);
    appendAudit({ action: 'generate', kind: 'reservation', id: historyEntry.id, name: reservation.orderCode || saved.map((item) => item.of).join(', '), user });

    res.json({ ok: true, saved, orderArchive });
  } catch (error) {
    next(error);
  }
});

registerSuggestionRoutes(app, getOfSuggestions);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta de API no disponible. Reinicia el servidor de la web si acabas de actualizar la aplicación.' });
});

await configureFrontend();

app.use((error, _req, res, _next) => {
  const status = error.statusCode
    || (error.message?.startsWith('La ') || error.message?.startsWith('Añade') || error.message?.startsWith('Hay ')
      ? 400
      : 500);

  if (status === 500 && !error.statusCode) {
    console.error(error);
  }

  res.status(status).json({
    ...(error.payload || {}),
    error: status === 500 && !error.statusCode ? 'No se pudo completar la operación.' : error.message
  });
});

const server = app.listen(config.port, () => {
  console.log(`Reserva de materiales disponible en http://localhost:${config.port}`);
  // Se abre ya la conexión con RPS: si no, la primera consulta del día tarda ~2 s en abrirla.
  // Si RPS no responde, no pasa nada: el pool lo vuelve a intentar en la siguiente consulta.
  checkDatabase()
    .then(() => console.log('Conexión con RPS abierta.'))
    .catch((error) => console.warn('RPS no responde todavía:', error.message));
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

async function checkOfsInRps(reservation) {
  try {
    const ofs = reservation.ofs.map((ofBlock) => ofBlock.of);
    const owners = await withTimeout(getOfOwners(ofs), 8000);
    return findOfMismatches({ orderCode: reservation.orderCode, ofs, owners });
  } catch (error) {
    console.error('No se pudieron comprobar las OFs en RPS:', error);
    return [];
  }
}

/** Apunta en el registro un guardado: es nuevo si su fecha de creación y de cambio coinciden. */
function auditSaved(kind, saved, user) {
  if (!saved) return;
  appendAudit({
    action: saved.createdAt === saved.updatedAt ? 'create' : 'update',
    kind,
    id: saved.id,
    name: saved.name,
    user
  });
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

function buildHistoryEntry(reservation, saved, orderArchive, user = '') {
  const lines = reservation.ofs.flatMap((ofBlock) => ofBlock.materials);

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...(user ? { createdBy: user } : {}),
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
