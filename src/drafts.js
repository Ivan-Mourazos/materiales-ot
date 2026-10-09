import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExpectedVersion, nextVersion, readJsonArray, writeJsonArray } from './jsonStore.js';
import { normalizeStoredQuantity } from './quantity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const draftsFile = path.join(__dirname, '..', 'data', 'drafts.json');

// Serializa las escrituras para evitar colisiones entre peticiones simultáneas
let writeQueue = Promise.resolve();

export async function listDrafts() {
  const drafts = await readJsonArray(draftsFile);
  return drafts.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

export async function getDraftById(id) {
  const drafts = await readJsonArray(draftsFile);
  return drafts.find((d) => d.id === id) || null;
}

export function saveDraft(draftData) {
  let resultDraft = null;

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const drafts = await readJsonArray(draftsFile);
      const existingIndex = draftData.id ? drafts.findIndex((d) => d.id === draftData.id) : -1;
      const sanitizedOfs = sanitizeOfs(draftData.ofs);
      const totals = calculateTotals(sanitizedOfs);

      const orderCode = String(draftData.orderCode || '').trim().toUpperCase();
      const name = String(draftData.name || '').trim() || (orderCode ? `Pedido ${orderCode}` : 'Borrador sin título');
      const notes = String(draftData.notes || draftData.description || '').trim();

      if (existingIndex >= 0) {
        const current = drafts[existingIndex];
        // Dentro de la cola: dos peticiones simultáneas no pueden pasar las dos la comprobación
        assertExpectedVersion(current, draftData.expectedUpdatedAt, 'borrador');
        resultDraft = {
          ...current,
          name,
          orderCode,
          notes,
          ofs: sanitizedOfs,
          totals,
          sourceModelName: draftData.sourceModelName || current.sourceModelName || undefined,
          updatedAt: nextVersion(current.updatedAt || current.createdAt)
        };
        drafts[existingIndex] = resultDraft;
      } else {
        const now = new Date().toISOString();
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

      await writeJsonArray(draftsFile, drafts);
    })
    .catch((error) => {
      if (!error.statusCode) console.error('Error al guardar borrador:', error);
      throw error;
    });

  return writeQueue.then(() => resultDraft);
}

export function deleteDraft(id) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const drafts = await readJsonArray(draftsFile);
      await writeJsonArray(draftsFile, drafts.filter((d) => d.id !== id));
    })
    .catch((error) => {
      console.error('Error al eliminar borrador:', error);
      throw error;
    });

  return writeQueue;
}

function calculateTotals(ofs) {
  const allMaterials = ofs.flatMap((b) => b.materials);
  const units = allMaterials.reduce((sum, m) => sum + (m.quantity ?? 0), 0);
  return {
    ofs: ofs.length,
    lines: allMaterials.length,
    units: Math.round(units * 100) / 100
  };
}

function sanitizeOfs(ofs) {
  if (!Array.isArray(ofs)) return [];
  return ofs.map((block, index) => {
    const of = String(block.of || '').trim();
    const partDescription = typeof block.partDescription === 'string' ? block.partDescription.trim() : undefined;
    return {
      id: block.id || randomUUID(),
      of,
      description: String(block.description || '').trim(),
      ...(partDescription !== undefined ? { partDescription } : {}),
      materials: Array.isArray(block.materials)
        ? block.materials.map((m) => {
          const code = String(m.code || '').trim().toUpperCase();
          return {
            id: m.id || randomUUID(),
            code,
            description: String(m.description || '').trim(),
            quantity: normalizeStoredQuantity(m.quantity, `${code || 'una línea'} de la OF ${of || index + 1}`),
            width: m.width ?? null,
            widthWarning: m.widthWarning ?? null
          };
        })
        : []
    };
  });
}
