# Categorías de modelos y pendientes de la 0.2.0 — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** agrupar la biblioteca de Modelos por categoría (texto libre con sugerencias, pastillas de filtro y grupos plegables) y cerrar tres pendientes de la 0.2.0: versión desfasada, borrador vinculado al cargar un modelo y texto a medias en cantidades.

**Arquitectura:** el servidor sanea un campo opcional `category` en `models.js`. En el cliente, la agrupación vive en un módulo puro `modelCategories.ts` (testeable con `node --test`); un componente `CategoryField` (input + datalist) se usa en los dos diálogos de modelo; `ModelsView` pinta pastillas y grupos y recuerda la vista en `localStorage`. Los pendientes se resuelven en `App.tsx` (callbacks `onRecordSaved`, desvincular el borrador) y leyendo `validity.badInput` del propio campo al confirmar.

**Stack:** Node 24 + Express 5 (servidor ESM), React 19 + TypeScript + Vite 6 (cliente), `node:test`.

**Spec:** [docs/superpowers/specs/2026-10-09-categorias-de-modelos-design.md](../specs/2026-10-09-categorias-de-modelos-design.md)

## Restricciones globales

- `category` es opcional y única por modelo. Saneado en el servidor: `null`, `undefined` o solo espacios → el campo se omite; texto → `trim`, espacios internos repetidos reducidos a uno, máximo **40** caracteres (se corta, no se rechaza); otro tipo → error 400 `Categoría no válida.`
- Al actualizar un modelo: sin el campo `category` en la petición se conserva el actual; con `''` o `null` se quita.
- Agrupación sin distinguir mayúsculas ni tildes. Etiqueta del grupo = grafía más repetida; en empate, la del modelo actualizado más recientemente. Orden alfabético (`localeCompare` en `'es'`), con `Sin categoría` siempre al final.
- Vista recordada en `localStorage`, clave `materiales-ot-modelos-vista`, siempre dentro de `try/catch`: si falla, todo abierto y *Todas*.
- Si ningún modelo tiene categoría, la pestaña Modelos se ve como hasta ahora (sin pastillas ni cabeceras).
- Aviso al desvincular: `Borrador «X» desvinculado: el formulario ahora contiene el modelo`.
- Sin dependencias nuevas. Los borradores no llevan categoría.
- Textos de la interfaz en español. En JSX, comillas tipográficas `“ ”` o `« »`, nunca `"` (regla `react/no-unescaped-entities`).
- CSS solo en los parciales de `src/client/styles/`, con los tokens existentes (`--accent-soft`, `--accent-border`, `--accent-ink`, `--border`, `--ink-2`, `--ring`…).
- Los tests importan módulos `.ts` del cliente directamente (Node 24 quita los tipos). Esos módulos **no** pueden tener imports de ejecución, solo `import type`.
- Nunca generar una reserva contra la carpeta de red real. Toda verificación funcional: `NODE_ENV=production`, `PORT=3100` y `EXPORT_DIRECTORY` / `ORDER_ARCHIVE_ROOT` apuntando a carpetas temporales, comprobado antes en `/api/health` (`type: "local-or-mounted"`).
- Al terminar cada tarea: `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` sin errores ni avisos.
- Pie de cada commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/models.js` | Sanear y guardar `category`. |
| `src/client/modelCategories.ts` *(nuevo)* | Clave de comparación, grupos y etiquetas de categoría. Puro. |
| `src/client/types.ts` | `AssignmentModel.category?`, `ActiveModel.category`. |
| `src/client/activeModel.ts` | Copiar la categoría al modelo activo. |
| `src/client/components/models/CategoryField.tsx` *(nuevo)* | Campo de categoría con sugerencias. |
| `src/client/components/models/useCategorySuggestions.ts` *(nuevo)* | Sugerencias para el diálogo "Guardar como modelo" (App no tiene la lista de modelos). |
| `src/client/components/models/ModelEditorModal.tsx` | Campo categoría; `badInput` leído por `ref`. |
| `src/client/components/models/SaveAsModelModal.tsx` | Campo categoría. |
| `src/client/components/models/ModelsView.tsx` | Pastillas, grupos plegables, vista recordada, `onRecordSaved`, duplicar con categoría. |
| `src/client/components/drafts/DraftsView.tsx` | `onRecordSaved`. |
| `src/client/App.tsx` | Refrescar registro activo, desvincular borrador al reemplazar, categoría al actualizar. |
| `src/client/components/assignments/MaterialTable.tsx`, `OfCard.tsx`, `src/client/components/catalog/ArticleCatalog.tsx` | `badInput` leído al confirmar. |
| `src/client/styles/models.css` | Pastillas, grupos, rejilla de tres campos. |
| `tests/models.test.js`, `tests/modelCategories.test.js` *(nuevo)*, `tests/activeModel.test.js` | Pruebas. |
| `package.json` | Versión 0.3.0. |

---

### Tarea 1: Categoría en el servidor

**Archivos:**
- Modificar: `src/models.js`
- Test: `tests/models.test.js`

**Interfaces:**
- Produce: los modelos que devuelve la API llevan `category: string` solo si tienen categoría (nunca `''` ni `null`). `saveModel` lanza un error con `statusCode: 400` y mensaje `Categoría no válida.` si `category` no es texto.

- [ ] **Paso 1: Escribir los tests que fallan**

Añadir al final de `tests/models.test.js`:

```js
test('la categoría se limpia, se recorta a 40 y se omite si está vacía', async (t) => {
  const { api } = await isolatedLibrary(t);
  const limpia = await api.saveModel({ name: 'A', category: '  Escenarios   móviles ', parts: [] });
  assert.equal(limpia.category, 'Escenarios móviles');

  const larga = await api.saveModel({ name: 'B', category: 'x'.repeat(60), parts: [] });
  assert.equal(larga.category, 'x'.repeat(40));

  for (const vacia of [undefined, null, '', '   ']) {
    const saved = await api.saveModel({ name: 'C', category: vacia, parts: [] });
    assert.ok(!('category' in saved));
    assert.ok(!('category' in (await api.getModelById(saved.id))));
  }
});

test('una categoría que no es texto da 400 y no guarda nada', async (t) => {
  const { api } = await isolatedLibrary(t);
  for (const mala of [42, ['Escenarios'], { nombre: 'Escenarios' }, true]) {
    await assert.rejects(
      api.saveModel({ name: 'D', category: mala, parts: [] }),
      (error) => error.statusCode === 400 && error.message === 'Categoría no válida.'
    );
  }
  assert.equal((await api.listModels()).length, 0);
});

test('al actualizar, sin el campo se conserva y con "" o null se quita', async (t) => {
  const { api } = await isolatedLibrary(t);
  let modelo = await api.saveModel({ name: 'E', category: 'Escenarios', parts: [] });

  modelo = await api.saveModel({ id: modelo.id, name: 'E', parts: [], expectedUpdatedAt: modelo.updatedAt });
  assert.equal(modelo.category, 'Escenarios');

  modelo = await api.saveModel({ id: modelo.id, name: 'E', category: 'Toldos', parts: [], expectedUpdatedAt: modelo.updatedAt });
  assert.equal(modelo.category, 'Toldos');

  for (const quitar of ['', null]) {
    modelo = await api.saveModel({ id: modelo.id, name: 'E', category: quitar, parts: [], expectedUpdatedAt: modelo.updatedAt });
    assert.ok(!('category' in modelo));
    assert.ok(!('category' in (await api.getModelById(modelo.id))));
    modelo = await api.saveModel({ id: modelo.id, name: 'E', category: 'Toldos', parts: [], expectedUpdatedAt: modelo.updatedAt });
  }
});
```

- [ ] **Paso 2: Ejecutar y ver que fallan**

Ejecutar: `node --test tests/models.test.js`
Esperado: FAIL en los tres tests nuevos (`category` es `undefined` en el primero; el segundo no rechaza).

- [ ] **Paso 3: Implementar**

En `src/models.js`, añadir el import junto a los demás:

```js
import { httpError } from './httpError.js';
```

Debajo de `const initialSeedModels = [];` añadir:

```js
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
```

En `saveModel`, sustituir la rama de actualización y la de creación (dentro del `.then(async () => { ... })`) por:

```js
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
```

Si ESLint marca `_previous` como variable sin usar, cambiar `withCategory` por:

```js
function withCategory(model, category) {
  const rest = { ...model };
  delete rest.category;
  return category ? { ...rest, category } : rest;
}
```

- [ ] **Paso 4: Ejecutar y ver que pasan**

Ejecutar: `node --test tests/models.test.js`
Esperado: PASS (todos, también los antiguos).

- [ ] **Paso 5: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/models.js tests/models.test.js
git commit -m "$(cat <<'EOF'
feat: los modelos guardan una categoría opcional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 2: Módulo puro de categorías

**Archivos:**
- Crear: `src/client/modelCategories.ts`
- Modificar: `src/client/types.ts` (solo `AssignmentModel`)
- Test: `tests/modelCategories.test.js`

**Interfaces:**
- Produce:
  - `NO_CATEGORY_LABEL = 'Sin categoría'`
  - `categoryKey(name: string | null | undefined): string` — `''` = sin categoría
  - `type CategoryGroup<T> = { key: string; label: string; models: T[] }`
  - `groupModelsByCategory<T extends Categorizable>(models: T[]): CategoryGroup<T>[]` — dentro de cada grupo se respeta el orden de entrada
  - `listCategoryLabels(models: Categorizable[]): string[]` — sin "Sin categoría"
  - `AssignmentModel.category?: string`

- [ ] **Paso 1: Escribir los tests que fallan**

Crear `tests/modelCategories.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryKey, groupModelsByCategory, listCategoryLabels } from '../src/client/modelCategories.ts';

const modelo = (id, category, updatedAt = '2026-10-01T00:00:00.000Z') => ({
  id,
  category,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt
});

const resumen = (grupos) => grupos.map((g) => [g.key, g.label, g.models.map((m) => m.id)]);

test('categoryKey ignora mayúsculas, tildes y espacios', () => {
  assert.equal(categoryKey('  Escenários   Móviles '), 'escenarios moviles');
  assert.equal(categoryKey(undefined), '');
  assert.equal(categoryKey(null), '');
  assert.equal(categoryKey('   '), '');
});

test('agrupa sin distinguir mayúsculas ni tildes y deja "Sin categoría" al final', () => {
  const grupos = groupModelsByCategory([
    modelo('1', 'Toldos'),
    modelo('2', undefined),
    modelo('3', 'escenarios'),
    modelo('4', 'Escenarios'),
    modelo('5', 'ESCENARIOS'),
    modelo('6', 'Escenarios'),
    modelo('7', '  ')
  ]);
  assert.deepEqual(resumen(grupos), [
    ['escenarios', 'Escenarios', ['3', '4', '5', '6']],
    ['toldos', 'Toldos', ['1']],
    ['', 'Sin categoría', ['2', '7']]
  ]);
});

test('en empate gana la grafía del modelo actualizado más recientemente', () => {
  const [a] = groupModelsByCategory([
    modelo('1', 'escenarios', '2026-10-01T00:00:00.000Z'),
    modelo('2', 'Escenarios', '2026-10-05T00:00:00.000Z')
  ]);
  assert.equal(a.label, 'Escenarios');

  const [b] = groupModelsByCategory([
    modelo('1', 'escenarios', '2026-10-09T00:00:00.000Z'),
    modelo('2', 'Escenarios', '2026-10-05T00:00:00.000Z')
  ]);
  assert.equal(b.label, 'escenarios');
});

test('etiquetas en orden alfabético español, sin "Sin categoría"', () => {
  const etiquetas = listCategoryLabels([
    modelo('1', 'Ventanas'),
    modelo('2', 'Árboles'),
    modelo('3', undefined),
    modelo('4', 'carpas'),
    modelo('5', 'Carpas'),
    modelo('6', 'Carpas')
  ]);
  assert.deepEqual(etiquetas, ['Árboles', 'Carpas', 'Ventanas']);
});

test('sin modelos no hay grupos', () => {
  assert.deepEqual(groupModelsByCategory([]), []);
  assert.deepEqual(listCategoryLabels([]), []);
});
```

- [ ] **Paso 2: Ejecutar y ver que fallan**

Ejecutar: `node --test tests/modelCategories.test.js`
Esperado: FAIL con `Cannot find module` (el módulo no existe).

- [ ] **Paso 3: Implementar**

En `src/client/types.ts`, en `AssignmentModel`, añadir `category` tras `description`:

```ts
export type AssignmentModel = {
  id: string;
  name: string;
  description?: string;
  /** Familia de producto (texto libre). Ausente = "Sin categoría". */
  category?: string;
  createdAt: string;
  updatedAt?: string;
  parts: ModelPart[];
};
```

Crear `src/client/modelCategories.ts`:

```ts
import type { AssignmentModel } from './types';

type Categorizable = Pick<AssignmentModel, 'category' | 'createdAt' | 'updatedAt'>;

export type CategoryGroup<T> = { key: string; label: string; models: T[] };

export const NO_CATEGORY_LABEL = 'Sin categoría';

/** Clave para comparar categorías: sin mayúsculas, tildes ni espacios de más. '' = sin categoría. */
export function categoryKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanLabel(name: string | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}

function timestamp(model: Categorizable): number {
  return new Date(model.updatedAt || model.createdAt || 0).getTime() || 0;
}

/** La grafía más repetida; en empate, la del modelo actualizado más recientemente. */
function pickLabel(models: Categorizable[]): string {
  const tally = new Map<string, { count: number; latest: number }>();
  for (const model of models) {
    const label = cleanLabel(model.category);
    const entry = tally.get(label) ?? { count: 0, latest: Number.NEGATIVE_INFINITY };
    entry.count += 1;
    entry.latest = Math.max(entry.latest, timestamp(model));
    tally.set(label, entry);
  }
  let best = '';
  let bestEntry: { count: number; latest: number } | null = null;
  for (const [label, entry] of tally) {
    if (
      !bestEntry ||
      entry.count > bestEntry.count ||
      (entry.count === bestEntry.count && entry.latest > bestEntry.latest)
    ) {
      best = label;
      bestEntry = entry;
    }
  }
  return best;
}

/** Grupos por categoría en orden alfabético, con "Sin categoría" al final. Conserva el orden de los modelos. */
export function groupModelsByCategory<T extends Categorizable>(models: T[]): CategoryGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const model of models) {
    const key = categoryKey(model.category);
    const group = byKey.get(key);
    if (group) group.push(model);
    else byKey.set(key, [model]);
  }
  return [...byKey]
    .map(([key, items]) => ({ key, label: key ? pickLabel(items) : NO_CATEGORY_LABEL, models: items }))
    .sort((a, b) => {
      if (!a.key) return 1;
      if (!b.key) return -1;
      return a.label.localeCompare(b.label, 'es', { sensitivity: 'base' });
    });
}

/** Categorías existentes, para sugerirlas al escribir. */
export function listCategoryLabels(models: Categorizable[]): string[] {
  return groupModelsByCategory(models)
    .filter((group) => group.key)
    .map((group) => group.label);
}
```

- [ ] **Paso 4: Ejecutar y ver que pasan**

Ejecutar: `node --test tests/modelCategories.test.js`
Esperado: PASS (5 tests).

- [ ] **Paso 5: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client/modelCategories.ts src/client/types.ts tests/modelCategories.test.js
git commit -m "$(cat <<'EOF'
feat: agrupación de modelos por categoría (módulo puro)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 3: Campo Categoría en los dos diálogos de modelo

**Archivos:**
- Modificar: `src/client/types.ts` (`ActiveModel`), `src/client/activeModel.ts`, `tests/activeModel.test.js`
- Crear: `src/client/components/models/CategoryField.tsx`, `src/client/components/models/useCategorySuggestions.ts`
- Modificar: `src/client/components/models/ModelEditorModal.tsx`, `src/client/components/models/SaveAsModelModal.tsx`, `src/client/components/models/ModelsView.tsx`, `src/client/App.tsx`, `src/client/styles/models.css`

**Interfaces:**
- Consume: `AssignmentModel.category?` y `listCategoryLabels` (Tarea 2). El servidor (Tarea 1) quita la categoría si recibe `''`.
- Produce:
  - `ActiveModel.category: string` (`''` = sin categoría)
  - `CategoryField({ value, onChange, suggestions })`
  - `useCategorySuggestions(): string[]`
  - `ModelEditorModal` recibe la prop nueva `categorySuggestions: string[]`
  - Los dos diálogos envían siempre `category: string` (recortada; `''` para quitarla)

- [ ] **Paso 1: Test que falla para el modelo activo**

En `tests/activeModel.test.js`, en el primer test, añadir `category: ''` al objeto esperado, tras `description: 'Base'`:

```js
  assert.deepEqual(activo, {
    id: 'm1',
    name: 'Escenario Orquesta ODL 720 EE',
    description: 'Base',
    category: '',
    updatedAt: '2026-10-09T08:58:44.000Z',
    updatable: true,
    reason: null
  });
```

Y añadir al final del archivo:

```js
test('el modelo activo recuerda la categoría', () => {
  const activo = describeActiveModel(
    { ...modelo, category: 'Escenarios' },
    { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: false }
  );
  assert.equal(activo.category, 'Escenarios');
});
```

Ejecutar: `node --test tests/activeModel.test.js`
Esperado: FAIL (falta `category`).

- [ ] **Paso 2: Modelo activo con categoría**

En `src/client/types.ts`, en `ActiveModel`, añadir tras `description: string;`:

```ts
  /** '' = sin categoría */
  category: string;
```

En `src/client/activeModel.ts`, añadir `'category'` al `Pick` y el campo al objeto devuelto:

```ts
export function describeActiveModel(
  model: Pick<AssignmentModel, 'id' | 'name' | 'description' | 'category' | 'createdAt' | 'updatedAt' | 'parts'>,
  load: ModelLoad
): ActiveModel {
```

```ts
  return {
    id: model.id,
    name: model.name,
    description: model.description || '',
    category: model.category || '',
    updatedAt: model.updatedAt || model.createdAt,
    updatable: reason === null,
    reason
  };
```

Ejecutar: `node --test tests/activeModel.test.js`
Esperado: PASS.

- [ ] **Paso 3: Componente y sugerencias**

Crear `src/client/components/models/CategoryField.tsx`:

```tsx
import { useId } from 'react';

/** Texto libre con las categorías existentes como sugerencias. */
export function CategoryField({
  value,
  onChange,
  suggestions
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const listId = useId();
  return (
    <label className="field category-field">
      <span>Categoría</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        maxLength={40}
        placeholder="Ej.: Escenarios, Toldos…"
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </label>
  );
}
```

Crear `src/client/components/models/useCategorySuggestions.ts`:

```ts
import { useEffect, useState } from 'react';
import { listCategoryLabels } from '../../modelCategories';
import type { AssignmentModel } from '../../types';

/**
 * Categorías existentes para el diálogo "Guardar como modelo", que se abre desde
 * Asignaciones sin la lista de modelos a mano. Si falla, simplemente no hay sugerencias.
 */
export function useCategorySuggestions(): string[] {
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models')
      .then((response) => (response.ok ? response.json() : { models: [] }))
      .then((data: { models?: AssignmentModel[] }) => {
        if (!cancelled) setLabels(listCategoryLabels(data.models || []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return labels;
}
```

- [ ] **Paso 4: Editor de modelos**

En `src/client/components/models/ModelEditorModal.tsx`:

1. Import junto a los demás:

```tsx
import { CategoryField } from './CategoryField';
```

2. Props: añadir `categorySuggestions`:

```tsx
export function ModelEditorModal({
  initialModel,
  categorySuggestions,
  onClose,
  onSave
}: {
  initialModel: AssignmentModel | null;
  categorySuggestions: string[];
  onClose: () => void;
  onSave: (modelData: Partial<AssignmentModel>) => Promise<void>;
}) {
```

3. Estado, tras `const [description, setDescription] = ...`:

```tsx
  const [category, setCategory] = useState(initialModel?.category || '');
```

4. Comprobación de cambios (las dos líneas que usan `JSON.stringify({ name, description, parts })`):

```tsx
  const [original] = useState(() => JSON.stringify({ name, description, category, parts }));
```

```tsx
    if (JSON.stringify({ name, description, category, parts }) !== original && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
```

5. En `handleSave`, el objeto que se pasa a `onSave`:

```tsx
      await onSave({
        id: initialModel?.id,
        name: name.trim(),
        description: description.trim(),
        // '' quita la categoría en el servidor
        category: category.trim(),
        parts
      });
```

6. En el JSX, el bloque `<div className="model-editor-fields">` pasa a tener la clase `with-category` y el campo entre nombre y descripción:

```tsx
        <div className="model-editor-fields with-category">
          <label className="field">
            <span>Nombre del modelo *</span>
            <input
              ref={nameRef}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Escenario ODL 950E, Toldo Porticado, etc."
              autoComplete="off"
            />
          </label>
          <CategoryField value={category} onChange={setCategory} suggestions={categorySuggestions} />
          <label className="field">
            <span>Descripción o notas</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: Configuración estándar con lonas ignífugas y faldón inferior"
              autoComplete="off"
            />
          </label>
        </div>
```

- [ ] **Paso 5: "Guardar como modelo"**

En `src/client/components/models/SaveAsModelModal.tsx`:

1. Imports:

```tsx
import { CategoryField } from './CategoryField';
import { useCategorySuggestions } from './useCategorySuggestions';
```

2. Estado, tras `initialDescription` y `description`:

```tsx
  const initialCategory = canUpdate ? sourceModel?.category ?? '' : '';
```

```tsx
  const [category, setCategory] = useState(initialCategory);
  const categorySuggestions = useCategorySuggestions();
```

3. En `requestClose`:

```tsx
    const dirty = name !== initialName || description !== initialDescription || category !== initialCategory;
```

4. En `handleConfirm`:

```tsx
      await onSave({ name: name.trim(), description: description.trim(), category: category.trim(), parts: partsToSave }, mode);
```

5. En el JSX, `<div className="model-editor-fields with-category">` y el campo entre nombre y descripción:

```tsx
        <div className="model-editor-fields with-category">
          <label className="field">
            <span>{isUpdate ? 'Nombre del modelo *' : 'Nombre del nuevo modelo *'}</span>
            <input
              ref={nameRef}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Escenario ODL 950E, Toldo Terraza 6x4, etc."
              autoComplete="off"
            />
          </label>
          <CategoryField value={category} onChange={setCategory} suggestions={categorySuggestions} />
          <label className="field">
            <span>Descripción o notas</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: Estructura completa con lonas perimetrales y fijaciones"
            />
          </label>
        </div>
```

- [ ] **Paso 6: Quien llama a los diálogos**

En `src/client/components/models/ModelsView.tsx`:

1. Import:

```tsx
import { listCategoryLabels } from '../../modelCategories';
```

2. Tras `filteredModels`:

```tsx
  const categorySuggestions = useMemo(() => listCategoryLabels(models), [models]);
```

3. En `<ModelEditorModal ...>` añadir la prop:

```tsx
          categorySuggestions={categorySuggestions}
```

4. En `handleDuplicateModel`, el objeto `duplicateData` lleva la categoría:

```tsx
      const duplicateData: Partial<AssignmentModel> = {
        name: `${model.name} (Copia)`,
        description: model.description || '',
        category: model.category || '',
        parts: model.parts.map((p) => ({
          ...p,
          id: undefined as unknown as string,
          materials: p.materials.map((m) => ({ ...m, id: undefined as unknown as string }))
        }))
      };
```

En `src/client/App.tsx`, en `handleSaveCurrentAsModel`, la rama de actualización refresca también la categoría:

```tsx
      setActiveModel(
        created
          ? describeActiveModel(record, { multiplier: 1, partsLoaded: record.parts.length, appendedToOtherOfs: false })
          : {
              ...activeModel,
              name: record.name,
              description: record.description || '',
              category: record.category || '',
              updatedAt: record.updatedAt || activeModel.updatedAt
            }
      );
```

(La copia por conflicto de `useVersionedSave` reenvía el mismo `body`, así que ya lleva la categoría.)

- [ ] **Paso 7: Rejilla de tres campos**

Al final de `src/client/styles/models.css`:

```css
/* Diálogos de modelo: nombre · categoría · descripción */
.model-dialog .model-editor-fields.with-category {
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.7fr) minmax(0, 1.2fr);
}
@media (max-width: 760px) {
  .model-dialog .model-editor-fields.with-category { grid-template-columns: minmax(0, 1fr); }
}
```

- [ ] **Paso 8: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Esperado: sin errores. `tsc` señala cualquier sitio que construya un `ActiveModel` sin `category`: si aparece alguno además de los tocados aquí, añadir `category: <modelo>.category || ''`.

```bash
git add src/client tests/activeModel.test.js
git commit -m "$(cat <<'EOF'
feat: campo Categoría con sugerencias al crear, editar y guardar modelos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 4: Pastillas y grupos plegables en la pestaña Modelos

**Archivos:**
- Modificar: `src/client/components/models/ModelsView.tsx`, `src/client/styles/models.css`

**Interfaces:**
- Consume: `groupModelsByCategory`, `CategoryGroup` (Tarea 2), `categorySuggestions` (Tarea 3, ya en el componente).
- Produce: nada que usen otras tareas. Clave `localStorage` `materiales-ot-modelos-vista` con `{ category: string | null, collapsed: string[] }` (`category: null` = *Todas*; `''` = *Sin categoría*; los valores son claves de `categoryKey`).

- [ ] **Paso 1: Vista recordada**

En `src/client/components/models/ModelsView.tsx`:

1. Imports: añadir `ChevronDown` a lucide y `groupModelsByCategory` al import de `modelCategories`:

```tsx
import { AlertTriangle, ChevronDown, Layers, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
```

```tsx
import { groupModelsByCategory, listCategoryLabels } from '../../modelCategories';
```

2. Antes de `export function ModelsView`:

```tsx
const VIEW_STORAGE_KEY = 'materiales-ot-modelos-vista';

/** Pastilla elegida (null = Todas) y grupos plegados, por clave de categoría. */
type LibraryView = { category: string | null; collapsed: string[] };

function readLibraryView(): LibraryView {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || 'null');
    return {
      category: typeof saved?.category === 'string' ? saved.category : null,
      collapsed: Array.isArray(saved?.collapsed)
        ? saved.collapsed.filter((key: unknown): key is string => typeof key === 'string')
        : []
    };
  } catch {
    return { category: null, collapsed: [] };
  }
}
```

3. Dentro del componente, tras `const { saveVersioned, conflictDialog } = useVersionedSave();`:

```tsx
  const [view, setView] = useState<LibraryView>(readLibraryView);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): la vista no se recuerda
    }
  }, [view]);
```

- [ ] **Paso 2: Grupos derivados**

Tras `categorySuggestions`:

```tsx
  // Las etiquetas salen de todos los modelos: buscar no debe cambiar cómo se llama un grupo
  const allGroups = useMemo(() => groupModelsByCategory(models), [models]);
  const hasCategories = allGroups.some((group) => group.key);
  const searchedGroups = useMemo(() => {
    const visible = new Set(filteredModels.map((m) => m.id));
    return allGroups.map((group) => ({ ...group, models: group.models.filter((m) => visible.has(m.id)) }));
  }, [allGroups, filteredModels]);
  // Una pastilla guardada de una categoría que ya no existe vuelve a "Todas"
  const selectedKey =
    view.category !== null && allGroups.some((group) => group.key === view.category) ? view.category : null;
  const shownGroups = searchedGroups.filter(
    (group) => group.models.length > 0 && (selectedKey === null || group.key === selectedKey)
  );
  const shownCount = hasCategories
    ? shownGroups.reduce((total, group) => total + group.models.length, 0)
    : filteredModels.length;

  function selectCategory(key: string | null) {
    setView((current) => ({ ...current, category: key }));
  }

  function toggleGroup(key: string) {
    setView((current) => ({
      ...current,
      collapsed: current.collapsed.includes(key)
        ? current.collapsed.filter((k) => k !== key)
        : [...current.collapsed, key]
    }));
  }

  function renderModelCard(model: AssignmentModel) {
    return (
      <ModelCard
        key={model.id}
        model={model}
        onUseModel={(m) => setModelToTransfer(m)}
        onEditModel={(m) => {
          setModelToEdit(m);
          setEditorOpen(true);
        }}
        onDuplicateModel={handleDuplicateModel}
        onDeleteModel={(id, name) => setModelToDelete({ id, name })}
      />
    );
  }
```

`renderModelCard` usa `handleDuplicateModel`, declarada más abajo con `async function`: se eleva, no hay problema de orden.

- [ ] **Paso 3: Pastillas, etiqueta y grupos**

1. Entre el cierre de `models-header-bar` y `models-results-label`, las pastillas:

```tsx
      {!isLoading && !loadError && hasCategories && (
        <div className="category-pills" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`category-pill${selectedKey === null ? ' active' : ''}`}
            aria-pressed={selectedKey === null}
            onClick={() => selectCategory(null)}
          >
            Todas <span>{filteredModels.length}</span>
          </button>
          {searchedGroups.map((group) => (
            <button
              key={group.key || 'sin-categoria'}
              type="button"
              className={`category-pill${selectedKey === group.key ? ' active' : ''}`}
              aria-pressed={selectedKey === group.key}
              onClick={() => selectCategory(group.key)}
            >
              {group.label} <span>{group.models.length}</span>
            </button>
          ))}
        </div>
      )}
```

2. En la etiqueta de resultados, sustituir `filteredModels.length` por `shownCount` (las dos veces):

```tsx
      <div className="models-results-label" role="status">{!isLoading && !loadError && `${shownCount} ${shownCount === 1 ? 'modelo disponible' : 'modelos disponibles'}${searchQuery ? ` para “${searchQuery}”` : ' · despliega un modelo para consultar sus materiales'}`}</div>
```

3. En el ternario principal, la condición del estado vacío pasa de `filteredModels.length === 0` a `shownCount === 0`, y la rama final (`<div className="models-grid">…`) se sustituye por:

```tsx
      ) : hasCategories ? (
        <div className="model-groups">
          {shownGroups.map((group, index) => {
            const collapsed = view.collapsed.includes(group.key);
            const bodyId = `model-group-${index}`;
            return (
              <section key={group.key || 'sin-categoria'} className="model-group">
                <h3 className="model-group-title">
                  <button
                    type="button"
                    className="model-group-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <ChevronDown aria-hidden="true" />
                    <span>{group.label}</span>
                    <span className="model-group-count">{group.models.length}</span>
                  </button>
                </h3>
                <div className="models-grid" id={bodyId} hidden={collapsed}>
                  {group.models.map(renderModelCard)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="models-grid">{filteredModels.map(renderModelCard)}</div>
      )}
```

- [ ] **Paso 4: Estilos**

Al final de `src/client/styles/models.css`:

```css
/* Categorías: pastillas de filtro y grupos plegables */
.category-pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 0; }
.category-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink-2);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color .15s var(--ease-out), border-color .15s var(--ease-out), color .15s var(--ease-out);
}
.category-pill:hover { border-color: var(--border-strong); color: var(--ink); }
.category-pill:focus-visible { outline: none; box-shadow: var(--ring); }
.category-pill span { color: var(--ink-3); font-size: 12px; font-variant-numeric: tabular-nums; }
.category-pill.active { border-color: var(--accent-border); background: var(--accent-soft); color: var(--accent-ink); }
.category-pill.active span { color: inherit; }

.model-groups { display: flex; flex-direction: column; gap: 20px; }
.model-group-title { margin: 0 0 10px; font-size: inherit; font-weight: inherit; }
.model-group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: -6px;
  padding: 4px 6px;
  border: 0;
  border-radius: var(--radius-s);
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.model-group-toggle:hover { background: var(--row-hover); }
.model-group-toggle:focus-visible { outline: none; box-shadow: var(--ring); }
.model-group-toggle svg { width: 16px; height: 16px; color: var(--ink-3); transition: transform .15s var(--ease-out); }
.model-group-toggle[aria-expanded='false'] svg { transform: rotate(-90deg); }
.model-group-count {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.models-grid[hidden] { display: none; }
@media (prefers-reduced-motion: reduce) {
  .category-pill, .model-group-toggle svg { transition: none; }
}
```

(`.models-grid[hidden]` hace falta porque `.models-grid { display: flex }` pisaría el `hidden` del navegador.)

- [ ] **Paso 5: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client/components/models/ModelsView.tsx src/client/styles/models.css
git commit -m "$(cat <<'EOF'
feat: biblioteca de modelos agrupada por categoría con pastillas de filtro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 5: Registro activo al día y borrador desvinculado al reemplazar

**Archivos:**
- Modificar: `src/client/components/drafts/DraftsView.tsx`, `src/client/components/models/ModelsView.tsx`, `src/client/App.tsx`

**Interfaces:**
- Consume: `ActiveModel.category` (Tarea 3); `toActiveDraft(draft)` ya existe en `App.tsx`.
- Produce:
  - `DraftsView` prop `onRecordSaved: (draft: OrderDraft) => void`
  - `ModelsView` prop `onRecordSaved: (model: AssignmentModel) => void`

Solo se llama tras **actualizar** un registro (incluido "Sobrescribir" en un conflicto): las copias, los duplicados y "Guardar como nuevo" crean un id nuevo que nunca coincide con el abierto en Asignaciones, así que no necesitan avisar.

- [ ] **Paso 1: Borradores avisan al actualizar**

En `src/client/components/drafts/DraftsView.tsx`:

1. Props: añadir `onRecordSaved` a la desestructuración (tras `onConvertToModel`) y a su tipo:

```tsx
  onConvertToModel: (draft: OrderDraft) => void;
  /** Tras actualizar un borrador: si es el abierto en Asignaciones, App refresca su versión. */
  onRecordSaved: (draft: OrderDraft) => void;
```

2. En `handleSaveEditedDraft`, la rama `else`:

```tsx
    } else {
      const { record, created } = await saveVersioned<OrderDraft>({
        kind: 'borrador',
        collectionUrl: '/api/drafts',
        responseKey: 'draft',
        id: draftToEdit.id,
        name: updatedData.name,
        body,
        expectedUpdatedAt: draftToEdit.updatedAt
      });
      if (!created) onRecordSaved(record);
      pushToast(created ? `Guardado como borrador nuevo: "${updatedData.name} (copia)".` : 'Borrador actualizado.', 'ok');
    }
```

- [ ] **Paso 2: Modelos avisan al actualizar**

En `src/client/components/models/ModelsView.tsx`:

1. Props:

```tsx
export function ModelsView({
  onTransferModelToAssignment,
  onRecordSaved,
  pushToast
}: {
  onTransferModelToAssignment: (
    model: AssignmentModel,
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) => void;
  /** Tras actualizar un modelo: si es el cargado en Asignaciones, App refresca su versión. */
  onRecordSaved: (model: AssignmentModel) => void;
  pushToast: (text: string, type?: 'ok' | 'error' | 'warn' | 'info') => void;
}) {
```

2. En `handleSaveModel`, la rama con id:

```tsx
    if (modelData.id) {
      const { record, created } = await saveVersioned<AssignmentModel>({
        kind: 'modelo',
        collectionUrl: '/api/models',
        responseKey: 'model',
        id: modelData.id,
        name: modelData.name || '',
        body: { ...modelData },
        expectedUpdatedAt: modelToEdit?.updatedAt || modelToEdit?.createdAt
      });
      if (!created) onRecordSaved(record);
      pushToast(created ? `Guardado como modelo nuevo: "${modelData.name} (copia)".` : 'Modelo actualizado correctamente.', 'ok');
    } else {
```

- [ ] **Paso 3: App refresca el registro activo**

En `src/client/App.tsx`, justo antes de `function handleTransferModelToAssignment(`:

```tsx
  // Un borrador o modelo abierto aquí se ha guardado desde su pestaña. Sin esto, el siguiente
  // "Guardar cambios" usaría la versión vieja y avisaría de un conflicto que no existe.
  // Solo cambian nombre, notas y versión: el contenido del formulario no se toca.
  function handleDraftSaved(draft: OrderDraft) {
    setActiveDraft((current) => (current?.id === draft.id ? toActiveDraft(draft) : current));
  }

  function handleModelSaved(model: AssignmentModel) {
    setActiveModel((current) =>
      current?.id === model.id
        ? {
            ...current,
            name: model.name,
            description: model.description || '',
            category: model.category || '',
            updatedAt: model.updatedAt || model.createdAt
          }
        : current
    );
  }
```

Y en el JSX:

```tsx
        <DraftsView
          activeDraftId={activeDraft?.id || null}
          hasActiveContent={Boolean(orderCode.trim()) || ofs.some((b) => b.of.trim() || b.materials.length > 0)}
          onResumeDraft={(draft) => resumeDraft(draft)}
          onSaveCurrentAsDraft={() => setIsSaveDraftOpen(true)}
          onConvertToModel={handleDraftToModel}
          onRecordSaved={handleDraftSaved}
          pushToast={pushToast}
          refreshTrigger={draftsVersion}
        />
```

```tsx
        <ModelsView
          onTransferModelToAssignment={handleTransferModelToAssignment}
          onRecordSaved={handleModelSaved}
          pushToast={pushToast}
        />
```

- [ ] **Paso 4: Desvincular el borrador al reemplazar con un modelo**

En `handleTransferModelToAssignment`:

1. Tras `const previousActiveModel = activeModel;`:

```tsx
    const previousActiveDraft = activeDraft;
    // Reemplazar deja el formulario con el modelo: "Guardar cambios" no debe pisar el borrador con él
    const unlinkedDraft = replaceExisting ? activeDraft : null;
```

2. Tras el `setActiveModel(describeActiveModel(...))`:

```tsx
    if (unlinkedDraft) setActiveDraft(null);
```

3. El aviso final:

```tsx
    const loaded = `${partsToTransfer.length} ${partsToTransfer.length === 1 ? 'parte cargada' : 'partes cargadas'}.`;
    pushToast(
      unlinkedDraft
        ? `${loaded} Borrador «${unlinkedDraft.name}» desvinculado: el formulario ahora contiene el modelo.`
        : `${loaded} Completa los números de OF y el pedido.`,
      'ok',
      replaceExisting
        ? {
            label: 'Deshacer',
            run: () => {
              setOfs(previousOfs);
              setActiveModel(previousActiveModel);
              setActiveDraft(previousActiveDraft);
            }
          }
        : undefined
    );
```

Al añadir encima (`replaceExisting === false`) el borrador sigue vinculado y no hay "Deshacer", como hasta ahora.

- [ ] **Paso 5: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client/App.tsx src/client/components/drafts/DraftsView.tsx src/client/components/models/ModelsView.tsx
git commit -m "$(cat <<'EOF'
fix: sin conflicto falso tras editar desde su pestaña; reemplazar con un modelo desvincula el borrador

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 6: Texto a medias en los campos de cantidad

**Archivos:**
- Modificar: `src/client/components/assignments/MaterialTable.tsx` (`QuantityCell`), `src/client/components/assignments/OfCard.tsx`, `src/client/components/catalog/ArticleCatalog.tsx` (`ArticleRow`), `src/client/components/models/ModelEditorModal.tsx` (`PartEditorCard`)

**Interfaces:** ninguna nueva. Desaparecen los estados `quantityBadInput` y el `badInputRef`.

Por qué: en un `<input type="number">`, "-" o "1e" dejan el valor en `''` con `validity.badInput = true`. React solo dispara `onChange` si el valor cambia; en un campo vacío, teclear "-" no lo cambia, así que el estado guardado en `onChange` se queda en `false` y "Añadir" mete la línea sin cantidad. Leyendo `validity` del propio campo al confirmar, siempre es el dato real.

- [ ] **Paso 1: `QuantityCell`**

En `src/client/components/assignments/MaterialTable.tsx`, sustituir desde `const [draft, setDraft] = ...` hasta el final de `commit()` por:

```tsx
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  function commit(input: HTMLInputElement) {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    // "-" o "1e" llegan como valor vacío pero con badInput: no son "sin cantidad", son
    // texto a medio teclear. Se lee al confirmar porque React no avisa si el valor sigue vacío.
    if (input.validity.badInput) {
      // Volver a pintar la cantidad: React cree que el campo ya muestra eso y no lo repintaría
      input.value = quantityInputValue(line.quantity);
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const quantity = parseQuantityInput(draft);
    // Vaciar el campo es válido: la línea queda sin cantidad
    if (quantity !== 'invalid' && quantity !== line.quantity) {
      onCommit(quantity);
    }
    setDraft(null);
  }
```

Y en el `<input>`:

```tsx
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => commit(event.currentTarget)}
```

- [ ] **Paso 2: Alta en la tarjeta de OF**

En `src/client/components/assignments/OfCard.tsx`:

1. Sustituir `const [quantityBadInput, setQuantityBadInput] = useState(false);` por:

```tsx
  const quantityRef = useRef<HTMLInputElement>(null);
```

2. En `commitLine`:

```tsx
    // "-" o "1e" a medias: el campo dice "vacío" pero no es "sin cantidad"
    const qty = quantityRef.current?.validity.badInput ? 'invalid' : parseQuantityInput(quantity);
    const added = onAddLine(ofBlock.id, article, qty);
    if (!added) return;
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
```

3. En el `<input>` de cantidad:

```tsx
          <input
            ref={quantityRef}
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
```

- [ ] **Paso 3: Alta desde el catálogo**

En `src/client/components/catalog/ArticleCatalog.tsx`:

1. Import: `import { useEffect, useMemo, useRef, useState } from 'react';`
2. En `ArticleRow`, sustituir `const [quantityBadInput, setQuantityBadInput] = useState(false);` por:

```tsx
  const quantityRef = useRef<HTMLInputElement>(null);
```

3. En `commitCatalogLine`:

```tsx
  function commitCatalogLine() {
    // "-" o "1e" a medias: el campo dice "vacío" pero no es "sin cantidad"
    const qty = quantityRef.current?.validity.badInput ? 'invalid' : parseQuantityInput(quantity);
    const added = onAddLineToOf(ofTarget, article, qty);
    if (added) {
      setQuantity('');
      if (isNewOf) {
        setSelectedOf('');
        setNewOf('');
      }
    }
```

(El resto de la función no cambia.)

4. En el `<input>` de cantidad:

```tsx
            <input
              ref={quantityRef}
              value={quantity}
              onChange={(event) => setQuantity(event.currentTarget.value)}
```

- [ ] **Paso 4: Alta en el editor de modelos**

En `src/client/components/models/ModelEditorModal.tsx`, dentro de `PartEditorCard`:

1. Sustituir `const [quantityBadInput, setQuantityBadInput] = useState(false);` por:

```tsx
  const quantityRef = useRef<HTMLInputElement>(null);
```

2. En `handleAddLine`:

```tsx
    // "-" o "1e" a medias: el campo dice "vacío" pero no es "sin cantidad"
    const qty = quantityRef.current?.validity.badInput ? 'invalid' : parseQuantityInput(quantity);
```

y quitar la línea `setQuantityBadInput(false);` del final.

3. En el `<input>` de "Cant. base":

```tsx
          <input
            ref={quantityRef}
            type="number"
            min="0"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.currentTarget.value)}
```

- [ ] **Paso 5: Comprobar que no queda rastro**

Ejecutar: `git grep -n "quantityBadInput\|badInputRef" -- src`
Esperado: sin resultados.

- [ ] **Paso 6: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client/components
git commit -m "$(cat <<'EOF'
fix: un "-" en un campo de cantidad vacío da error en vez de añadir la línea sin cantidad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Tarea 7: Versión 0.3.0

**Archivos:**
- Modificar: `package.json`

- [ ] **Paso 1: Subir la versión**

En `package.json`: `"version": "0.3.0"`.

- [ ] **Paso 2: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore: versión 0.3.0 (categorías de modelos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Verificación funcional (la hace el controlador)

Chrome headless por CDP contra `NODE_ENV=production PORT=3100` con `EXPORT_DIRECTORY` y `ORDER_ARCHIVE_ROOT` en carpetas temporales; copia de `data/*.json` antes y restauración después (y borrar `data/backups` si no existía). `Emulation.setFocusEmulationEnabled({ enabled: true })`, `--lang=es-ES`, tecleo real con `Input.insertText` para "-".

1. Crear tres modelos con categoría "Escenarios", "escenarios" y sin categoría, más uno "Toldos" → grupos *Escenarios* (2), *Toldos* (1), *Sin categoría* (1); pastillas *Todas 4*, *Escenarios 2*, *Toldos 1*, *Sin categoría 1*.
2. Pulsar la pastilla *Toldos* → solo ese grupo; recargar → sigue elegida.
3. Plegar *Escenarios* y recargar → sigue plegado (`aria-expanded="false"`).
4. Buscar un texto que solo esté en un modelo → los demás grupos desaparecen y las pastillas muestran los números filtrados.
5. Guardar un borrador desde Asignaciones, editar su nombre desde la pestaña Borradores, volver y pulsar "Guardar cambios" → sin diálogo de conflicto.
6. Con ese borrador abierto, cargar un modelo reemplazando → aviso «…desvinculado…», sin borrador vinculado; "Deshacer" → vuelve a estar vinculado con sus OFs.
7. En el campo de cantidad vacío de una OF teclear "-" y pulsar "Añadir" → error "La cantidad no es válida.", no se añade la línea. Igual en el editor de modelos.
8. En una celda de cantidad con 5, teclear "-" y salir → sigue mostrando 5.
9. Al acabar: `localStorage` sin `materiales-ot-modelos-vista` no rompe nada (borrarla y recargar → todo abierto, *Todas*).

## Después del despliegue (lo hace el controlador, con permiso de Ivan)

Script en el scratchpad (no en el repo). Envía `parts` porque una actualización sin `parts` dejaría el modelo vacío:

```js
// Uso: node set-escenarios.mjs http://192.168.0.90:4200
const base = process.argv[2];
const health = await (await fetch(`${base}/api/health`)).json();
if (health.version !== '0.3.0') {
  console.error(`Producción está en ${health.version ?? 'versión desconocida'}, no en 0.3.0: no toco nada.`);
  process.exit(1);
}
const { models } = await (await fetch(`${base}/api/models`)).json();
for (const model of models) {
  if (model.category) {
    console.log(`= ${model.name}: ya tiene «${model.category}»`);
    continue;
  }
  const response = await fetch(`${base}/api/models/${encodeURIComponent(model.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: model.name,
      description: model.description,
      parts: model.parts,
      category: 'Escenarios',
      expectedUpdatedAt: model.updatedAt || model.createdAt
    })
  });
  const data = await response.json().catch(() => ({}));
  console.log(response.ok ? `✓ ${model.name} → Escenarios` : `✗ ${model.name}: ${response.status} ${data.error ?? ''}`);
}
```

Comprobar después que cada modelo conserva el mismo número de partes y líneas que antes.

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| `category` opcional, saneado, 40 caracteres, 400 si no es texto | 1 |
| Conservada al actualizar sin el campo; quitada con `''`/`null` | 1 |
| `AssignmentModel.category`, `ActiveModel.category` | 2, 3 |
| `categoryKey`, `groupModelsByCategory`, `listCategoryLabels` | 2 |
| Campo con datalist en editor y "Guardar como modelo"; relleno al actualizar el de origen | 3 |
| Categoría en editor, guardar como (nuevo/actualizar), duplicar, copia por conflicto | 3 |
| Pastillas *Todas* + grupos con número; una seleccionada | 4 |
| Grupos plegables con `aria-expanded`; *Sin categoría* al final | 2, 4 |
| Búsqueda dentro de los grupos; números filtrados | 4 |
| Vista en `localStorage` con `try/catch` | 4 |
| Sin categorías → vista de siempre | 4 |
| 3.1 `onRecordSaved` (solo actualizaciones: las copias tienen id nuevo) | 5 |
| 3.2 Desvincular borrador al reemplazar, "Deshacer" lo recupera | 5 |
| 3.3 `badInput` leído al confirmar; sin `quantityBadInput` ni `badInputRef` | 6 |
| Versión 0.3.0 y script "Escenarios" con comprobación de versión | 7, post-despliegue |
| Pruebas unitarias y funcionales | 1, 2, 3, verificación |
