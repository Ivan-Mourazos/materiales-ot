import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const modelsFile = path.join(dataDir, 'models.json');

// Serializa las escrituras para evitar colisiones entre peticiones simultáneas
let writeQueue = Promise.resolve();

const initialSeedModels = [
  {
    id: 'seed-modelo-escenario-950e',
    name: 'Escenario ODL 950E',
    description: 'Configuración estándar para escenario de orquesta 950E (faldones, estructuras y taparanuras).',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parts: [
      {
        id: 'part-estr-01',
        name: 'Estructura 01',
        description: 'Estructura base delantera',
        materials: [
          {
            id: 'm1',
            code: 'NS86B1NEGRP250',
            description: 'Lona PVC negra ignífuga 250 cm',
            quantity: 26.4
          },
          {
            id: 'm2',
            code: 'OLLAOLPN14',
            description: 'Ollao latón niquelado 14 mm',
            quantity: 43
          },
          {
            id: 'm3',
            code: 'ARANCCLPN30',
            description: 'Arandela latón niquelado 30 mm',
            quantity: 43
          }
        ]
      },
      {
        id: 'part-estr-02',
        name: 'Estructura 02',
        description: 'Estructura trasera y fijación',
        materials: [
          {
            id: 'm4',
            code: 'RESTOPVC',
            description: 'Restos y refuerzos PVC',
            quantity: 25
          },
          {
            id: 'm5',
            code: 'PIQUETHC37MM6MM',
            description: 'Piquete tensor 37 mm x 6 mm',
            quantity: 38
          },
          {
            id: 'm6',
            code: 'CINPVCNEGR45MM',
            description: 'Cinta PVC negra 45 mm',
            quantity: 5.7
          }
        ]
      },
      {
        id: 'part-faldon',
        name: 'Faldón y Taparanuras',
        description: 'Protección perimetral inferior',
        materials: [
          {
            id: 'm7',
            code: 'RESTOPVC',
            description: 'Lona faldón PVC negro',
            quantity: 32
          },
          {
            id: 'm8',
            code: 'CINPVCNEGR45MM',
            description: 'Cinta refuerzo perimetral 45 mm',
            quantity: 18
          }
        ]
      },
      {
        id: 'part-visera',
        name: 'Visera Delantera',
        description: 'Visera delantera impermeable',
        materials: [
          {
            id: 'm9',
            code: 'NS86B1NEGRP250',
            description: 'Lona PVC visera 250 cm',
            quantity: 22.5
          },
          {
            id: 'm10',
            code: 'PIQUETHC37MM6MM',
            description: 'Tensores fijación visera',
            quantity: 16
          }
        ]
      }
    ]
  }
];

export async function listModels() {
  const models = await readModels();
  return models.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}

export async function getModelById(id) {
  const models = await readModels();
  return models.find((m) => m.id === id) || null;
}

export function saveModel(modelData) {
  let resultModel = null;

  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const models = await readModels();
      const now = new Date().toISOString();
      const existingIndex = models.findIndex((m) => m.id === modelData.id);

      if (existingIndex >= 0) {
        resultModel = {
          ...models[existingIndex],
          ...modelData,
          updatedAt: now,
          parts: sanitizeParts(modelData.parts)
        };
        models[existingIndex] = resultModel;
      } else {
        resultModel = {
          id: modelData.id || randomUUID(),
          name: String(modelData.name || '').trim() || 'Nuevo Modelo',
          description: String(modelData.description || '').trim(),
          createdAt: now,
          updatedAt: now,
          parts: sanitizeParts(modelData.parts)
        };
        models.unshift(resultModel);
      }

      await writeModels(models);
    })
    .catch((error) => {
      console.error('Error al guardar modelo:', error);
      throw error;
    });

  return writeQueue.then(() => resultModel);
}

export function deleteModel(id) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      const models = await readModels();
      const nextModels = models.filter((m) => m.id !== id);
      await writeModels(nextModels);
    })
    .catch((error) => {
      console.error('Error al eliminar modelo:', error);
      throw error;
    });

  return writeQueue;
}

function sanitizeParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map((part, index) => ({
    id: part.id || randomUUID(),
    name: String(part.name || `Parte ${index + 1}`).trim(),
    description: String(part.description || '').trim(),
    materials: Array.isArray(part.materials)
      ? part.materials.map((m) => ({
        id: m.id || randomUUID(),
        code: String(m.code || '').trim().toUpperCase(),
        description: String(m.description || '').trim(),
        quantity: Math.max(Number(m.quantity) || 1, 0.000001),
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
      : []
  }));
}

async function readModels() {
  try {
    const raw = await fs.readFile(modelsFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    throw new Error('El archivo de modelos no contiene una biblioteca válida.');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  // Si no existe, crear el archivo con los modelos iniciales
  await fs.mkdir(dataDir, { recursive: true });
  await writeModels(initialSeedModels);
  return structuredClone(initialSeedModels);
}

async function writeModels(models) {
  await fs.mkdir(dataDir, { recursive: true });
  const tmpPath = `${modelsFile}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(models, null, 2), 'utf8');
  await fs.rename(tmpPath, modelsFile);
}
