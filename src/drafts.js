import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const draftsFile = path.join(dataDir, 'drafts.json');

// Serializa las escrituras para evitar colisiones entre peticiones simultáneas
let writeQueue = Promise.resolve();

export async function listDrafts() {
  const drafts = await readDrafts();
  return drafts.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

export async function getDraftById(id) {
  const drafts = await readDrafts();
  return drafts.find((d) => d.id === id) || null;
}

export function saveDraft(draftData) {
  let resultDraft = null;

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const drafts = await readDrafts();
      const now = new Date().toISOString();
      const existingIndex = drafts.findIndex((d) => d.id === draftData.id);
      const sanitizedOfs = sanitizeOfs(draftData.ofs);
      const totals = calculateTotals(sanitizedOfs);

      const orderCode = String(draftData.orderCode || '').trim().toUpperCase();
      const name = String(draftData.name || '').trim() || (orderCode ? `Pedido ${orderCode}` : 'Borrador sin título');
      const notes = String(draftData.notes || draftData.description || '').trim();

      if (existingIndex >= 0) {
        resultDraft = {
          ...drafts[existingIndex],
          name,
          orderCode,
          notes,
          ofs: sanitizedOfs,
          totals,
          sourceModelName: draftData.sourceModelName || drafts[existingIndex].sourceModelName || undefined,
          updatedAt: now
        };
        drafts[existingIndex] = resultDraft;
      } else {
        resultDraft = {
          id: draftData.id || randomUUID(),
          name,
          orderCode,
          notes,
          ofs: sanitizedOfs,
          totals,
          sourceModelName: draftData.sourceModelName || undefined,
          createdAt: now,
          updatedAt: now
        };
        drafts.unshift(resultDraft);
      }

      await writeDrafts(drafts);
    })
    .catch((error) => {
      console.error('Error al guardar borrador:', error);
      throw error;
    });

  return writeQueue.then(() => resultDraft);
}

export function deleteDraft(id) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const drafts = await readDrafts();
      const nextDrafts = drafts.filter((d) => d.id !== id);
      await writeDrafts(nextDrafts);
    })
    .catch((error) => {
      console.error('Error al eliminar borrador:', error);
      throw error;
    });

  return writeQueue;
}

function calculateTotals(ofs) {
  const allMaterials = ofs.flatMap((b) => b.materials);
  const units = allMaterials.reduce((sum, m) => sum + (Number(m.quantity) || 0), 0);
  return {
    ofs: ofs.length,
    lines: allMaterials.length,
    units: Math.round(units * 100) / 100
  };
}

function sanitizeOfs(ofs) {
  if (!Array.isArray(ofs)) return [];
  return ofs.map((block) => ({
    id: block.id || randomUUID(),
    of: String(block.of || '').trim(),
    description: String(block.description || '').trim(),
    materials: Array.isArray(block.materials)
      ? block.materials.map((m) => ({
        id: m.id || randomUUID(),
        code: String(m.code || '').trim().toUpperCase(),
        description: String(m.description || '').trim(),
        quantity: Math.max(Number(m.quantity) || 0, 0),
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
      : []
  }));
}

async function readDrafts() {
  try {
    const raw = await fs.readFile(draftsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    throw new Error('El archivo de borradores no contiene una lista válida.');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Si no existe, crear el archivo vacío
  await fs.mkdir(dataDir, { recursive: true });
  await writeDrafts([]);
  return [];
}

async function writeDrafts(drafts) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmpPath = `${draftsFile}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(drafts, null, 2), 'utf8');
  await fs.rename(tmpPath, draftsFile);
}
