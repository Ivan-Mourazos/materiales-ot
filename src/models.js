import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpError } from './httpError.js';
import { assertExpectedVersion, nextVersion, readJsonArray, writeJsonArray } from './jsonStore.js';
import { normalizeStoredQuantity } from './quantity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsFile = path.join(__dirname, '..', 'data', 'models.json');

// Serializa las escrituras para evitar colisiones entre peticiones simultáneas
let writeQueue = Promise.resolve();

// La biblioteca arranca vacía. Los modelos reales se crean desde la interfaz
// o se cargan por la API (POST /api/models).
const initialSeedModels = [];

const MAX_CATEGORY_LENGTH = 40;

/** '' = sin categoría. Limpia y recorta; solo rechaza lo que no es texto. */
function sanitizeCategory(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw httpError(400, 'Categoría no válida.');
  const clean = value.trim().replace(/\s+/g, ' ');
  // Por caracteres, no por unidades UTF-16: no partir un emoji por la mitad
  return Array.from(clean).slice(0, MAX_CATEGORY_LENGTH).join('').trim();
}

/** Pone o quita `category` sin dejar nunca '' en el JSON. */
function withCategory(model, category) {
  const { category: _previous, ...rest } = model;
  return category ? { ...rest, category } : rest;
}

export async function listModels() {
  const models = await readJsonArray(modelsFile, initialSeedModels);
  return models.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

export async function getModelById(id) {
  const models = await readJsonArray(modelsFile, initialSeedModels);
  return models.find((m) => m.id === id) || null;
}

export function saveModel(modelData) {
  let resultModel = null;

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const models = await readJsonArray(modelsFile, initialSeedModels);
      const existingIndex = modelData.id ? models.findIndex((m) => m.id === modelData.id) : -1;
      const parts = sanitizeParts(modelData.parts);

      if (existingIndex >= 0) {
        const current = models[existingIndex];
        // Dentro de la cola: dos peticiones simultáneas no pueden pasar las dos la comprobación
        assertExpectedVersion(current, modelData.expectedUpdatedAt, 'modelo');
        // Sin el campo en la petición se conserva; con '' o null se quita
        const category = 'category' in modelData ? sanitizeCategory(modelData.category) : current.category || '';
        resultModel = withCategory({
          ...current,
          name: String(modelData.name || '').trim() || current.name,
          description: String(modelData.description ?? current.description ?? '').trim(),
          parts,
          updatedAt: nextVersion(current.updatedAt || current.createdAt)
        }, category);
        models[existingIndex] = resultModel;
      } else {
        const now = new Date().toISOString();
        resultModel = withCategory({
          id: modelData.id || randomUUID(),
          name: String(modelData.name || '').trim() || 'Nuevo Modelo',
          description: String(modelData.description || '').trim(),
          createdAt: now,
          updatedAt: now,
          parts
        }, sanitizeCategory(modelData.category));
        models.unshift(resultModel);
      }

      await writeJsonArray(modelsFile, models);
    })
    .catch((error) => {
      if (!error.statusCode) console.error('Error al guardar modelo:', error);
      throw error;
    });

  return writeQueue.then(() => resultModel);
}

export function deleteModel(id) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const models = await readJsonArray(modelsFile, initialSeedModels);
      await writeJsonArray(modelsFile, models.filter((m) => m.id !== id));
    })
    .catch((error) => {
      console.error('Error al eliminar modelo:', error);
      throw error;
    });

  return writeQueue;
}

function sanitizeParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map((part, index) => {
    const name = String(part.name || `Parte ${index + 1}`).trim();
    return {
      id: part.id || randomUUID(),
      name,
      description: String(part.description || '').trim(),
      materials: Array.isArray(part.materials)
        ? part.materials.map((m) => {
          const code = String(m.code || '').trim().toUpperCase();
          return {
            id: m.id || randomUUID(),
            code,
            description: String(m.description || '').trim(),
            quantity: normalizeStoredQuantity(m.quantity, `${code || 'una línea'} de «${name}»`),
            width: m.width ?? null,
            widthWarning: m.widthWarning ?? null
          };
        })
        : []
    };
  });
}
