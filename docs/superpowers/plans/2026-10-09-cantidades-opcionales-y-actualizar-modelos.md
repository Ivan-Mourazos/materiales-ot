# Cantidades opcionales y actualizar modelos — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que modelos y borradores guarden líneas sin cantidad (`null`), que la asignación solo se bloquee al generar, que "Guardar como modelo" pueda actualizar el modelo de origen con detección de conflictos, y que cada guardado deje una instantánea.

**Arquitectura:** en el servidor, tres módulos nuevos y pequeños (`httpError.js`, `quantity.js`, `jsonStore.js`) sustituyen la lógica hoy duplicada en `models.js` y `drafts.js`. En el cliente, la aritmética de cantidades vive en `quantities.ts` (puro, testeable con `node --test`), el estado del modelo cargado en `activeModel.ts`, y el flujo de conflictos en un hook `useVersionedSave` que comparten App, Modelos y Borradores.

**Stack:** Node 24 + Express 5 (servidor ESM), React 19 + TypeScript + Vite 6 (cliente), `node:test`.

**Spec:** [docs/superpowers/specs/2026-10-09-cantidades-opcionales-y-actualizar-modelos-design.md](../specs/2026-10-09-cantidades-opcionales-y-actualizar-modelos-design.md)

## Restricciones globales

- "Sin cantidad" se representa **solo** como `null`. Un `0` recibido se guarda como `null`. Al leer, cualquier valor no numérico o `<= 0` cuenta como "sin cantidad" (los borradores antiguos tienen `0`).
- Cantidades redondeadas a 6 decimales: `Math.round(x * 1000000) / 1000000`.
- Sin dependencias nuevas.
- Textos de la interfaz en español. En JSX, comillas tipográficas `“ ”`, nunca `"` (regla `react/no-unescaped-entities`).
- CSS solo en los parciales de `src/client/styles/`. Colores de aviso: tokens `--warn-ink`, `--warn-soft`, `--warn-border`.
- Los tests importan módulos `.ts` del cliente directamente (Node 24 quita los tipos). Esos módulos **no** pueden tener imports de ejecución, solo `import type`.
- Nunca generar una reserva contra la carpeta de red real. Toda verificación funcional: `NODE_ENV=production`, `PORT=3100` y `EXPORT_DIRECTORY` / `ORDER_ARCHIVE_ROOT` apuntando a carpetas temporales, comprobado antes en `/api/health` (`type: "local-or-mounted"`).
- Al terminar cada tarea: `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` sin errores ni avisos.
- Pie de cada commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/httpError.js` *(nuevo)* | Crear errores con `statusCode` y `payload` para el manejador de Express. |
| `src/quantity.js` *(nuevo)* | Normalizar la cantidad de una línea guardada: `null`, número o error 400. |
| `src/jsonStore.js` *(nuevo)* | Leer/escribir arrays JSON con instantáneas, versión creciente y comprobación de conflicto. |
| `src/validation.js` | La reserva rechaza líneas sin cantidad con un 400 claro. |
| `src/models.js`, `src/drafts.js` | Usan los tres módulos anteriores; campos de actualización en lista blanca. |
| `src/server.js` | Manejador de errores con `payload`; versión en `/api/health`. |
| `src/client/quantities.ts` *(nuevo)* | Aritmética y lectura de cantidades opcionales en el cliente. |
| `src/client/activeModel.ts` *(nuevo)* | Decidir si el modelo cargado se puede actualizar y por qué no. |
| `src/client/components/common/useVersionedSave.tsx` *(nuevo)* | `PUT` con versión, aviso de conflicto y las tres salidas. |
| `src/client/components/common/MissingQuantitiesDialog.tsx` *(nuevo)* | Aviso que bloquea la generación, con filas que llevan a cada línea. |
| `src/client/styles/quantities.css` *(nuevo)* | Distintivos de "sin cantidad" y el aviso de bloqueo. |
| `tests/helpers/isolated-server.js` *(nuevo)* | Copiar los módulos del servidor a una carpeta temporal para los tests. |

---

### Tarea 1: Errores HTTP con código, validación de la reserva y versión en `/api/health`

**Archivos:**
- Crear: `src/httpError.js`
- Modificar: `src/validation.js` (archivo completo)
- Modificar: `src/server.js` (`/api/health` en las líneas 24-45, manejador de errores en 366-379, función local `httpError` en 446-450)
- Test: `tests/validation.test.js`

**Interfaces:**
- Produce: `httpError(status: number, message: string, payload?: object): Error` — el error lleva `statusCode` y, si se da, `payload`, que el manejador de Express añade a la respuesta JSON.
- Produce: `GET /api/health` devuelve también `version` (la de `package.json`).

**Por qué:** el manejador de errores decide hoy si un error es de validación (400) mirando cómo empieza el mensaje (`'La '`, `'Anade'`, `'Hay '`). "Falta la cantidad…" empezaría por "Falta" y saldría como un 500 genérico; y `'Anade'` sin eñe nunca coincide con "Añade al menos una OF.", que ya hoy sale como 500.

- [ ] **Paso 1: Escribir el test que falla**

Crear `tests/validation.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReservation } from '../src/validation.js';

const reserva = (materials) => ({
  orderCode: 'AR2600001',
  ofs: [{ of: '221150', description: 'Telón', materials }]
});

test('una línea sin cantidad bloquea la reserva con un 400 que nombra artículo y OF', () => {
  for (const quantity of [null, undefined, '', '   ', 0, '0']) {
    assert.throws(
      () => normalizeReservation(reserva([{ code: 'ACRILI2170P120', description: 'Lona', quantity }])),
      (error) => error.statusCode === 400
        && error.message === 'Falta la cantidad de ACRILI2170P120 en la OF 221150.',
      `cantidad ${JSON.stringify(quantity)}`
    );
  }
});

test('una cantidad negativa o no numérica es un 400', () => {
  for (const quantity of [-1, 'abc']) {
    assert.throws(
      () => normalizeReservation(reserva([{ code: 'X1', description: 'x', quantity }])),
      (error) => error.statusCode === 400 && error.message === 'La cantidad de X1 en la OF 221150 no es válida.'
    );
  }
});

test('las cantidades válidas pasan redondeadas y con el código en mayúsculas', () => {
  const resultado = normalizeReservation(reserva([{ code: 'x1', description: 'x', quantity: '2.1234567' }]));
  assert.deepEqual(resultado.ofs[0].materials, [{ code: 'X1', description: 'x', quantity: 2.123457 }]);
});

test('las líneas completamente vacías se ignoran', () => {
  const resultado = normalizeReservation(reserva([
    { code: '', description: '', quantity: null },
    { code: 'X1', description: '', quantity: 1 }
  ]));
  assert.equal(resultado.ofs[0].materials.length, 1);
});

test('el resto de errores de validación también son 400', () => {
  assert.throws(
    () => normalizeReservation({ ofs: [] }),
    (error) => error.statusCode === 400 && error.message === 'Añade al menos una OF.'
  );
  assert.throws(
    () => normalizeReservation({ ofs: [{ of: '', materials: [] }] }),
    (error) => error.statusCode === 400 && error.message === 'La OF 1 no tiene número.'
  );
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

Ejecutar: `node --test tests/validation.test.js`
Esperado: FAIL — los errores no tienen `statusCode` y el mensaje de cantidad es el viejo.

- [ ] **Paso 3: Crear `src/httpError.js`**

```js
/**
 * Error con código HTTP para el manejador de Express.
 * `payload` se añade tal cual a la respuesta JSON (p. ej. el registro actual en un 409).
 */
export function httpError(status, message, payload) {
  const error = new Error(message);
  error.statusCode = status;
  if (payload) error.payload = payload;
  return error;
}
```

- [ ] **Paso 4: Reescribir `src/validation.js`**

```js
import { httpError } from './httpError.js';

export function normalizeReservation(payload) {
  if (!payload || typeof payload !== 'object') {
    throw validationError('La solicitud no tiene formato válido.');
  }

  const orderCode = cleanText(payload.orderCode || payload.pedido || '');
  const ofs = Array.isArray(payload.ofs) ? payload.ofs : [];

  if (ofs.length === 0) {
    throw validationError('Añade al menos una OF.');
  }

  const normalizedOfs = ofs.map((ofBlock, index) => {
    const of = cleanText(ofBlock?.of);
    if (!of) {
      throw validationError(`La OF ${index + 1} no tiene número.`);
    }

    const description = cleanText(ofBlock?.description).slice(0, 120);

    const materials = Array.isArray(ofBlock?.materials) ? ofBlock.materials : [];
    const normalizedMaterials = materials
      .flatMap((line) => {
        const code = cleanText(line?.code || line?.codArticle || line?.articleCode).toUpperCase();
        const description = cleanText(line?.description);
        const missing = isMissingQuantity(line?.quantity);

        if (!code && !description && missing) return [];
        if (!code) throw validationError(`Hay una línea sin artículo en la OF ${of}.`);
        if (missing) throw validationError(`Falta la cantidad de ${code} en la OF ${of}.`);

        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) {
          throw validationError(`La cantidad de ${code} en la OF ${of} no es válida.`);
        }

        return [{
          code,
          description,
          quantity: roundQuantity(quantity)
        }];
      });

    if (normalizedMaterials.length === 0) {
      throw validationError(`La OF ${of} no tiene materiales.`);
    }

    return { of, description, materials: normalizedMaterials };
  });

  return { orderCode, ofs: normalizedOfs };
}

// Vacío, null o 0 = la línea aún no tiene cantidad (los modelos y borradores lo permiten).
function isMissingQuantity(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return Number(value) === 0;
}

function validationError(message) {
  return httpError(400, message);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function roundQuantity(value) {
  return Math.round(value * 1000000) / 1000000;
}
```

- [ ] **Paso 5: Ejecutar el test y ver que pasa**

Ejecutar: `node --test tests/validation.test.js`
Esperado: PASS, 5 tests.

- [ ] **Paso 6: Usar `httpError` en `src/server.js`, añadir `payload` y versión**

1. Añadir a los imports de cabecera:

```js
import { readFileSync } from 'node:fs';
import { httpError } from './httpError.js';
```

2. Justo después de `const isProduction = process.env.NODE_ENV === 'production';`:

```js
// La versión sale en /api/health para saber qué hay desplegado sin entrar al servidor.
const packageInfo = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
```

3. En `/api/health`, cambiar `ok: true,` por:

```js
      ok: true,
      version: packageInfo.version,
```

4. Borrar la función local del final del archivo:

```js
function httpError(status, message) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}
```

5. Sustituir el manejador de errores por:

```js
app.use((error, _req, res, _next) => {
  const status = error.statusCode
    || (error.message?.startsWith('La ') || error.message?.startsWith('Añade') || error.message?.startsWith('Hay ')
      ? 400
      : 500);

  if (status === 500 && !error.statusCode) {
    console.error(error);
  }

  res.status(status).json({
    error: status === 500 && !error.statusCode ? 'No se pudo completar la operación.' : error.message,
    ...(error.payload || {})
  });
});
```

- [ ] **Paso 7: Verificar todo**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Esperado: sin errores; 9 tests en verde (4 de antes + 5 nuevos).

- [ ] **Paso 8: Commit**

```bash
git add src/httpError.js src/validation.js src/server.js tests/validation.test.js
git commit -F - <<'EOF'
feat: la reserva rechaza líneas sin cantidad con un 400 claro

Los errores de validación llevan statusCode explícito: antes el manejador los
reconocía por cómo empezaba el mensaje, y "Añade al menos una OF." salía como
500 porque buscaba "Anade" sin eñe. /api/health expone la versión.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 2: Normalizar la cantidad guardada (`src/quantity.js`)

**Archivos:**
- Crear: `src/quantity.js`
- Test: `tests/quantity.test.js`

**Interfaces:**
- Consume: `httpError` (Tarea 1).
- Produce: `normalizeStoredQuantity(value: unknown, context?: string): number | null` — `null` para vacío/`null`/`undefined`/`0`; número redondeado a 6 decimales si es válido (admite coma decimal en texto); lanza `httpError(400, 'Cantidad no válida en {context}: {valor}.')` si es negativo, no numérico, infinito o de otro tipo.

- [ ] **Paso 1: Escribir el test que falla**

Crear `tests/quantity.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStoredQuantity } from '../src/quantity.js';

test('vacío, null y cero se guardan como "sin cantidad"', () => {
  for (const value of [null, undefined, '', '   ', 0, '0', 0.0000001]) {
    assert.equal(normalizeStoredQuantity(value), null, JSON.stringify(value));
  }
});

test('los números válidos se redondean, también con coma decimal', () => {
  assert.equal(normalizeStoredQuantity(2.5), 2.5);
  assert.equal(normalizeStoredQuantity('2,5'), 2.5);
  assert.equal(normalizeStoredQuantity(' 3 '), 3);
  assert.equal(normalizeStoredQuantity(1.23456789), 1.234568);
});

test('lo que no es una cantidad es un 400 que dice dónde', () => {
  for (const value of [-1, 'abc', Number.NaN, Number.POSITIVE_INFINITY, true, {}]) {
    assert.throws(
      () => normalizeStoredQuantity(value, 'LONA01 de «Faldón»'),
      (error) => error.statusCode === 400 && error.message.startsWith('Cantidad no válida en LONA01 de «Faldón»:'),
      String(value)
    );
  }
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

Ejecutar: `node --test tests/quantity.test.js`
Esperado: FAIL — `Cannot find module '../src/quantity.js'`.

- [ ] **Paso 3: Crear `src/quantity.js`**

```js
import { httpError } from './httpError.js';

/**
 * Cantidad de una línea guardada en un modelo o un borrador.
 * `null` significa "sin cantidad todavía": se rellena al hacer la reserva.
 * Un 0 también se guarda como `null`, para que no haya dos formas de decir lo mismo.
 */
export function normalizeStoredQuantity(value, context = '') {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') throw invalidQuantity(value, context);

  const text = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  if (text === '') return null;

  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity < 0) throw invalidQuantity(value, context);

  const rounded = Math.round(quantity * 1000000) / 1000000;
  return rounded === 0 ? null : rounded;
}

function invalidQuantity(value, context) {
  const where = context ? ` en ${context}` : '';
  return httpError(400, `Cantidad no válida${where}: ${String(value)}.`);
}
```

- [ ] **Paso 4: Ejecutar el test y ver que pasa**

Ejecutar: `node --test tests/quantity.test.js`
Esperado: PASS, 3 tests.

- [ ] **Paso 5: Verificar y commit**

Ejecutar: `npm run lint && npm test`

```bash
git add src/quantity.js tests/quantity.test.js
git commit -F - <<'EOF'
feat: normalizar cantidades guardadas, con null para "sin cantidad"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 3: Almacén JSON con instantáneas, versión y conflictos (`src/jsonStore.js`)

**Archivos:**
- Crear: `src/jsonStore.js`
- Test: `tests/jsonStore.test.js`

**Interfaces:**
- Consume: `httpError` (Tarea 1).
- Produce:
  - `readJsonArray(file: string, seed?: any[]): Promise<any[]>` — si el archivo no existe lo crea con `seed`; si está corrupto o no es un array, lanza error **sin tocarlo**.
  - `writeJsonArray(file: string, data: any[], options?: { keep?: number }): Promise<void>` — copia la versión anterior a `<dir del archivo>/backups/<nombre>-<fecha>-<secuencia>.json`, escribe de forma atómica y deja solo las `keep` (30 por defecto) instantáneas más recientes de ese nombre. Si la copia o la poda fallan, `console.error` y el guardado sigue.
  - `nextVersion(previous?: string | null): string` — fecha ISO estrictamente posterior a `previous` (evita que dos guardados en el mismo milisegundo compartan versión).
  - `assertExpectedVersion(current: { updatedAt?: string; createdAt?: string }, expectedUpdatedAt: unknown, label: string): void` — si `expectedUpdatedAt` viene y no coincide con `current.updatedAt ?? current.createdAt`, lanza `httpError(409, 'Este {label} lo ha modificado otra persona.', { current })`.

- [ ] **Paso 1: Escribir el test que falla**

Crear `tests/jsonStore.test.js`:

```js
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertExpectedVersion, nextVersion, readJsonArray, writeJsonArray } from '../src/jsonStore.js';

async function carpetaTemporal(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'materiales-store-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const instantaneas = async (directory, prefijo = 'models-') =>
  (await readdir(path.join(directory, 'backups'))).filter((name) => name.startsWith(prefijo)).sort();

test('si no existe, se crea con la semilla; si está corrupto, se lanza error sin tocarlo', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  assert.deepEqual(await readJsonArray(file, [{ id: 'a' }]), [{ id: 'a' }]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ id: 'a' }]);

  for (const roto of ['{incompleto', '{"no":"es una lista"}']) {
    await writeFile(file, roto);
    await assert.rejects(readJsonArray(file));
    assert.equal(await readFile(file, 'utf8'), roto);
  }
});

test('cada escritura guarda antes la versión anterior', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 1 }]);
  await assert.rejects(readdir(path.join(directory, 'backups')), { code: 'ENOENT' });

  await writeJsonArray(file, [{ v: 2 }]);
  const [unica] = await instantaneas(directory);
  assert.match(unica, /^models-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d{6}\.json$/);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'backups', unica), 'utf8')), [{ v: 1 }]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ v: 2 }]);
});

test('se conservan solo las más recientes, y solo se podan las de ese nombre', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 0 }]);
  await writeJsonArray(path.join(directory, 'drafts.json'), []);
  await writeJsonArray(path.join(directory, 'drafts.json'), [{ d: 1 }]);

  for (let v = 1; v <= 8; v += 1) await writeJsonArray(file, [{ v }], { keep: 3 });

  const quedan = await instantaneas(directory);
  assert.equal(quedan.length, 3);
  const contenidos = await Promise.all(quedan.map(async (name) =>
    JSON.parse(await readFile(path.join(directory, 'backups', name), 'utf8'))[0].v));
  assert.deepEqual(contenidos, [5, 6, 7]);
  assert.equal((await instantaneas(directory, 'drafts-')).length, 1);
});

test('si no se puede hacer la instantánea, el guardado se completa igual', async (t) => {
  const directory = await carpetaTemporal(t);
  const file = path.join(directory, 'models.json');
  await writeJsonArray(file, [{ v: 1 }]);
  await writeFile(path.join(directory, 'backups'), 'esto es un archivo, no una carpeta');
  const aviso = t.mock.method(console, 'error', () => {});

  await writeJsonArray(file, [{ v: 2 }]);

  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), [{ v: 2 }]);
  assert.equal(aviso.mock.callCount(), 1);
});

test('nextVersion siempre avanza, aunque el reloj no lo haga', () => {
  const futuro = new Date(Date.now() + 60000).toISOString();
  const siguiente = nextVersion(futuro);
  assert.ok(siguiente > futuro);
  assert.equal(Date.parse(siguiente) - Date.parse(futuro), 1);
  assert.ok(Date.parse(nextVersion(null)) <= Date.now());
});

test('assertExpectedVersion: sin versión no comprueba; distinta da 409 con el registro actual', () => {
  const current = { id: 'm1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
  assert.doesNotThrow(() => assertExpectedVersion(current, undefined, 'modelo'));
  assert.doesNotThrow(() => assertExpectedVersion(current, '', 'modelo'));
  assert.doesNotThrow(() => assertExpectedVersion(current, '2026-01-02T00:00:00.000Z', 'modelo'));
  assert.doesNotThrow(() => assertExpectedVersion({ createdAt: 'X' }, 'X', 'borrador'));
  assert.throws(
    () => assertExpectedVersion(current, '2026-01-01T00:00:00.000Z', 'modelo'),
    (error) => error.statusCode === 409
      && error.message === 'Este modelo lo ha modificado otra persona.'
      && error.payload.current === current
  );
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

Ejecutar: `node --test tests/jsonStore.test.js`
Esperado: FAIL — `Cannot find module '../src/jsonStore.js'`.

- [ ] **Paso 3: Crear `src/jsonStore.js`**

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { httpError } from './httpError.js';

// Desempata instantáneas creadas en el mismo milisegundo.
let snapshotSequence = 0;

/**
 * Lee un archivo JSON que contiene un array.
 * Si no existe lo crea con `seed`. Si está corrupto lanza error SIN tocarlo,
 * para que nadie sobrescriba por accidente una biblioteca dañada.
 */
export async function readJsonArray(file, seed = []) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    throw new Error(`${path.basename(file)} no contiene una lista válida.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  await writeJsonArray(file, seed);
  return structuredClone(seed);
}

/**
 * Escribe el array de forma atómica (.tmp + rename). Antes copia la versión
 * anterior a `backups/` y conserva solo las `keep` más recientes de ese archivo.
 * Si la copia o la poda fallan se registra y el guardado sigue: perder el
 * trabajo del usuario por no poder hacer una copia sería peor.
 */
export async function writeJsonArray(file, data, { keep = 30 } = {}) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await snapshot(file, keep);
  const tmpPath = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, file);
}

/** Fecha ISO estrictamente posterior a `previous`, aunque el reloj no haya avanzado. */
export function nextVersion(previous) {
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  const now = Date.now();
  return new Date(Number.isFinite(previousTime) ? Math.max(now, previousTime + 1) : now).toISOString();
}

/**
 * Rechaza con 409 si el registro cambió desde que el cliente lo cargó.
 * Sin `expectedUpdatedAt` no comprueba nada (llamadas a la API hechas a mano).
 */
export function assertExpectedVersion(current, expectedUpdatedAt, label) {
  if (!expectedUpdatedAt) return;
  const actual = current.updatedAt || current.createdAt;
  if (actual === expectedUpdatedAt) return;
  throw httpError(409, `Este ${label} lo ha modificado otra persona.`, { current });
}

async function snapshot(file, keep) {
  try {
    await fs.access(file);
  } catch {
    return; // primera escritura: no hay versión anterior que guardar
  }

  const backupDir = path.join(path.dirname(file), 'backups');
  const base = path.basename(file, '.json');

  try {
    await fs.mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sequence = String(snapshotSequence++).padStart(6, '0');
    await fs.copyFile(file, path.join(backupDir, `${base}-${stamp}-${sequence}.json`));
  } catch (error) {
    console.error(`No se pudo guardar la instantánea de ${base}:`, error.message);
    return;
  }

  try {
    const own = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}T.*\\.json$`);
    const snapshots = (await fs.readdir(backupDir)).filter((name) => own.test(name)).sort().reverse();
    await Promise.all(snapshots.slice(keep).map((name) => fs.rm(path.join(backupDir, name), { force: true })));
  } catch (error) {
    console.error(`No se pudieron podar las instantáneas de ${base}:`, error.message);
  }
}
```

- [ ] **Paso 4: Ejecutar el test y ver que pasa**

Ejecutar: `node --test tests/jsonStore.test.js`
Esperado: PASS, 6 tests.

- [ ] **Paso 5: Verificar y commit**

Ejecutar: `npm run lint && npm test`

```bash
git add src/jsonStore.js tests/jsonStore.test.js
git commit -F - <<'EOF'
feat: almacén JSON con instantáneas, versión creciente y conflictos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 4: Modelos sobre el almacén nuevo

**Archivos:**
- Crear: `tests/helpers/isolated-server.js`
- Modificar: `src/models.js` (archivo completo)
- Modificar: `tests/models.test.js` (arnés + tests nuevos)

**Interfaces:**
- Consume: `readJsonArray`, `writeJsonArray`, `nextVersion`, `assertExpectedVersion` (Tarea 3); `normalizeStoredQuantity` (Tarea 2).
- Produce: `saveModel(modelData)` acepta `modelData.expectedUpdatedAt`; al actualizar solo toca `name`, `description`, `parts` y `updatedAt` (nunca guarda `expectedUpdatedAt` ni campos extraños). Las cantidades de las líneas son `number | null`.
- Produce: `isolatedServer(t): Promise<{ importModule(name): Promise<module>, dataFile(name): string }>` para los tests.

**Por qué el arnés:** los tests copian `models.js` solo a una carpeta temporal para que su `data/` no toque la del proyecto. Al importar módulos hermanos, la copia no los encontraría; y como la carpeta temporal no tiene `package.json`, los `.js` se interpretarían como CommonJS (por eso hoy se renombran a `.mjs`).

- [ ] **Paso 1: Crear el arnés `tests/helpers/isolated-server.js`**

```js
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Módulos del servidor que leen y escriben en data/. Se importan entre sí, así que van juntos.
const serverModules = ['models.js', 'drafts.js', 'jsonStore.js', 'quantity.js', 'httpError.js'];

/** Copia los módulos a una carpeta temporal: su data/ queda aislada de la del proyecto. */
export async function isolatedServer(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'materiales-test-'));
  await mkdir(path.join(directory, 'src'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const name of serverModules) {
    await copyFile(new URL(`../../src/${name}`, import.meta.url), path.join(directory, 'src', name));
  }
  t.after(async () => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    importModule: (name) => import(pathToFileURL(path.join(directory, 'src', name)).href),
    dataFile: (name) => path.join(directory, 'data', name)
  };
}
```

- [ ] **Paso 2: Cambiar el arnés de `tests/models.test.js` y añadir los tests nuevos**

Sustituir la cabecera del archivo (imports y función `isolatedLibrary`) por:

```js
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { isolatedServer } from './helpers/isolated-server.js';

// Exercise the real persistence module against an isolated library.
async function isolatedLibrary(t) {
  const { importModule, dataFile } = await isolatedServer(t);
  return { api: await importModule('models.js'), file: dataFile('models.json') };
}
```

Mantener los dos tests existentes y añadir al final:

```js
const lineas = (...materials) => [{ name: 'Faldón', description: 'Rejilla y PVC', materials }];

test('las líneas sin cantidad se guardan como null y se leen igual', async (t) => {
  const { api } = await isolatedLibrary(t);
  const saved = await api.saveModel({
    name: 'Escenario',
    parts: lineas(
      { code: 'a', quantity: null },
      { code: 'b', quantity: '' },
      { code: 'c', quantity: 0 },
      { code: 'd', quantity: '2,5' }
    )
  });
  const leido = await api.getModelById(saved.id);
  assert.deepEqual(leido.parts[0].materials.map((m) => [m.code, m.quantity]), [
    ['A', null], ['B', null], ['C', null], ['D', 2.5]
  ]);
});

test('una cantidad no válida rechaza el guardado con 400 y no escribe', async (t) => {
  const { api, file } = await isolatedLibrary(t);
  await api.saveModel({ name: 'Bueno', parts: [] });
  const antes = await readFile(file, 'utf8');
  t.mock.method(console, 'error', () => {});

  await assert.rejects(
    api.saveModel({ name: 'Malo', parts: lineas({ code: 'LONA01', quantity: -2 }) }),
    (error) => error.statusCode === 400 && error.message.includes('LONA01 de «Faldón»')
  );
  assert.equal(await readFile(file, 'utf8'), antes);
});

test('actualizar solo toca nombre, descripción y partes', async (t) => {
  const { api } = await isolatedLibrary(t);
  const saved = await api.saveModel({ name: 'Original', description: 'd', parts: [] });
  const updated = await api.saveModel({
    id: saved.id,
    name: 'Renombrado',
    parts: lineas({ code: 'X', quantity: 1 }),
    expectedUpdatedAt: saved.updatedAt,
    createdAt: '1999-01-01T00:00:00.000Z',
    intruso: 'no debería guardarse'
  });
  assert.equal(updated.name, 'Renombrado');
  assert.equal(updated.description, 'd');
  assert.equal(updated.createdAt, saved.createdAt);
  assert.ok(updated.updatedAt > saved.updatedAt);
  assert.equal('expectedUpdatedAt' in updated, false);
  assert.equal('intruso' in updated, false);
});

test('conflictos: misma versión guarda, otra da 409 sin escribir, sin versión guarda', async (t) => {
  const { api, file } = await isolatedLibrary(t);
  t.mock.method(console, 'error', () => {});
  const v0 = await api.saveModel({ name: 'M', parts: [] });
  const v1 = await api.saveModel({ id: v0.id, name: 'M1', parts: [], expectedUpdatedAt: v0.updatedAt });
  assert.equal(v1.name, 'M1');

  const antes = await readFile(file, 'utf8');
  await assert.rejects(
    api.saveModel({ id: v0.id, name: 'M2', parts: [], expectedUpdatedAt: v0.updatedAt }),
    (error) => error.statusCode === 409 && error.payload.current.name === 'M1'
  );
  assert.equal(await readFile(file, 'utf8'), antes);

  const forzado = await api.saveModel({ id: v0.id, name: 'M3', parts: [] });
  assert.equal(forzado.name, 'M3');
});

test('dos actualizaciones simultáneas con la misma versión: una guarda y la otra da 409', async (t) => {
  const { api } = await isolatedLibrary(t);
  t.mock.method(console, 'error', () => {});
  const v0 = await api.saveModel({ name: 'M', parts: [] });
  const resultados = await Promise.allSettled([
    api.saveModel({ id: v0.id, name: 'A', parts: [], expectedUpdatedAt: v0.updatedAt }),
    api.saveModel({ id: v0.id, name: 'B', parts: [], expectedUpdatedAt: v0.updatedAt })
  ]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(resultados.find((r) => r.status === 'rejected').reason.statusCode, 409);
});

test('cada guardado deja una instantánea de la versión anterior', async (t) => {
  const { api, dataFile } = await isolatedLibrary(t);
  const saved = await api.saveModel({ name: 'M', parts: [] });
  await api.saveModel({ id: saved.id, name: 'M2', parts: [] });
  const backups = await readdir(dataFile('backups'));
  assert.ok(backups.some((name) => name.startsWith('models-')));
});
```

- [ ] **Paso 3: Ejecutar y ver que fallan los nuevos**

Ejecutar: `node --test tests/models.test.js`
Esperado: los dos tests antiguos pasan con el arnés nuevo; los nuevos fallan (cantidades a 1, `expectedUpdatedAt` guardado, sin 409, sin instantáneas).

- [ ] **Paso 4: Reescribir `src/models.js`**

```js
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExpectedVersion, nextVersion, readJsonArray, writeJsonArray } from './jsonStore.js';
import { normalizeStoredQuantity } from './quantity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsFile = path.join(__dirname, '..', 'data', 'models.json');

// Serializa las escrituras para evitar colisiones entre peticiones simultáneas
let writeQueue = Promise.resolve();

// La biblioteca arranca vacía. Los modelos reales se crean desde la interfaz
// o se cargan por la API (POST /api/models).
const initialSeedModels = [];

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
        resultModel = {
          ...current,
          name: String(modelData.name || '').trim() || current.name,
          description: String(modelData.description ?? current.description ?? '').trim(),
          parts,
          updatedAt: nextVersion(current.updatedAt || current.createdAt)
        };
        models[existingIndex] = resultModel;
      } else {
        const now = new Date().toISOString();
        resultModel = {
          id: modelData.id || randomUUID(),
          name: String(modelData.name || '').trim() || 'Nuevo Modelo',
          description: String(modelData.description || '').trim(),
          createdAt: now,
          updatedAt: now,
          parts
        };
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
```

- [ ] **Paso 5: Ejecutar los tests y ver que pasan**

Ejecutar: `node --test tests/models.test.js`
Esperado: PASS, 8 tests.

- [ ] **Paso 6: Adaptar el arnés de `tests/drafts.test.js`**

Sustituir su cabecera (imports y `isolatedDrafts`) por:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isolatedServer } from './helpers/isolated-server.js';

async function isolatedDrafts(t) {
  const { importModule, dataFile } = await isolatedServer(t);
  return { api: await importModule('drafts.js'), file: dataFile('drafts.json') };
}
```

- [ ] **Paso 7: Verificar y commit**

Ejecutar: `npm run lint && npm test`
Esperado: todo en verde.

```bash
git add src/models.js tests/models.test.js tests/drafts.test.js tests/helpers/isolated-server.js
git commit -F - <<'EOF'
feat: los modelos guardan líneas sin cantidad y detectan conflictos

- Cantidad vacía o 0 se guarda como null; antes se convertía en 1 sin avisar.
- Al actualizar solo se tocan nombre, descripción y partes: antes se volcaba
  el cuerpo entero de la petición dentro del modelo.
- PUT con expectedUpdatedAt distinto da 409; cada guardado deja instantánea.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 5: Borradores sobre el almacén nuevo, y documentación de las instantáneas

**Archivos:**
- Modificar: `src/drafts.js` (archivo completo)
- Modificar: `tests/drafts.test.js` (tests nuevos)
- Modificar: `README.md` (sección nueva al final)

**Interfaces:**
- Consume: Tareas 2 y 3.
- Produce: `saveDraft(draftData)` acepta `expectedUpdatedAt`; las OFs conservan `partDescription` (texto) si llega; cantidades `number | null`; `totals.units` ignora las líneas sin cantidad.

- [ ] **Paso 1: Escribir los tests que fallan**

Añadir al final de `tests/drafts.test.js`:

```js
test('las líneas sin cantidad se guardan como null y no suman unidades', async (t) => {
  const { api } = await isolatedDrafts(t);
  const saved = await api.saveDraft({
    name: 'Con huecos',
    ofs: [{ of: '1', description: 'P', materials: [{ code: 'a', quantity: '' }, { code: 'b', quantity: 3 }] }]
  });
  assert.deepEqual(saved.ofs[0].materials.map((m) => m.quantity), [null, 3]);
  assert.equal(saved.totals.units, 3);
  assert.equal(saved.totals.lines, 2);
});

test('la descripción de la parte de origen se conserva', async (t) => {
  const { api } = await isolatedDrafts(t);
  const saved = await api.saveDraft({
    name: 'D',
    ofs: [
      { of: '', description: 'Faldón', partDescription: 'Rejilla y PVC', materials: [] },
      { of: '', description: 'Sin origen', materials: [] }
    ]
  });
  assert.equal(saved.ofs[0].partDescription, 'Rejilla y PVC');
  assert.equal('partDescription' in saved.ofs[1], false);
});

test('una cantidad no válida rechaza el borrador con 400', async (t) => {
  const { api } = await isolatedDrafts(t);
  await assert.rejects(
    api.saveDraft({ name: 'D', ofs: [{ of: '7', materials: [{ code: 'X', quantity: 'abc' }] }] }),
    (error) => error.statusCode === 400 && error.message.includes('X de la OF 7')
  );
});

test('conflictos en borradores: 409 con versión vieja, guarda sin versión', async (t) => {
  const { api, file } = await isolatedDrafts(t);
  const v0 = await api.saveDraft({ name: 'D', ofs: [] });
  const v1 = await api.saveDraft({ id: v0.id, name: 'D1', ofs: [], expectedUpdatedAt: v0.updatedAt });
  assert.ok(v1.updatedAt > v0.updatedAt);

  const antes = await readFile(file, 'utf8');
  await assert.rejects(
    api.saveDraft({ id: v0.id, name: 'D2', ofs: [], expectedUpdatedAt: v0.updatedAt }),
    (error) => error.statusCode === 409 && error.payload.current.name === 'D1'
  );
  assert.equal(await readFile(file, 'utf8'), antes);
  assert.equal((await api.saveDraft({ id: v0.id, name: 'D3', ofs: [] })).name, 'D3');
});
```

- [ ] **Paso 2: Ejecutar y ver que fallan**

Ejecutar: `node --test tests/drafts.test.js`
Esperado: los 2 antiguos pasan; los 4 nuevos fallan.

- [ ] **Paso 3: Reescribir `src/drafts.js`**

```js
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
```

- [ ] **Paso 4: Ejecutar los tests y ver que pasan**

Ejecutar: `node --test tests/drafts.test.js`
Esperado: PASS, 6 tests.

- [ ] **Paso 5: Documentar la restauración en `README.md`**

Añadir al final del archivo:

```markdown

---

## Copias de seguridad de modelos y borradores

Antes de cada guardado de `data/models.json` o `data/drafts.json`, la web copia la
versión anterior a `data/backups/`, con la fecha en el nombre
(`models-2026-10-09T08-53-12-123Z-000004.json`). Se conservan las 30 más recientes
de cada archivo. `data/` no está en git: estas copias solo existen en el servidor.

Para volver a una versión anterior:

```bash
pm2 stop materiales-ot
cp data/backups/models-<fecha>.json data/models.json   # o drafts-<fecha>.json → data/drafts.json
pm2 start materiales-ot
```
```

- [ ] **Paso 6: Verificar y commit**

Ejecutar: `npm run lint && npm test`

```bash
git add src/drafts.js tests/drafts.test.js README.md
git commit -F - <<'EOF'
feat: los borradores guardan líneas sin cantidad, con conflictos e instantáneas

Conservan además la descripción de la parte de origen (partDescription),
que el formulario necesitará para guardar como modelo sin degradar nombres.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 6: Aritmética de cantidades en el cliente (`src/client/quantities.ts`)

**Archivos:**
- Crear: `src/client/quantities.ts`
- Modificar: `src/client/utils.ts` (`roundQuantity` pasa a reexportarse)
- Test: `tests/quantities.test.js`

**Interfaces:**
- Produce (todo exportado desde `src/client/quantities.ts`):
  - `type Quantity = number | null`
  - `type QuantityInput = Quantity | 'invalid'`
  - `roundQuantity(value: number): number`
  - `hasQuantity(q: Quantity | undefined): q is number` — número finito y `> 0`
  - `parseQuantityInput(raw: string): QuantityInput`
  - `quantityInputValue(q: Quantity | undefined): string` — `''` si no hay cantidad
  - `sumQuantities(qs: (Quantity | undefined)[]): number`
  - `scaleQuantity(q: Quantity | undefined, multiplier: number): Quantity`
  - `addQuantities(a: Quantity | undefined, b: Quantity | undefined): Quantity`
  - `type MissingQuantity = { ofId: string; lineId: string; ofLabel: string; code: string; description: string }`
  - `findMissingQuantities(ofs): MissingQuantity[]`
  - `countMissingQuantities(groups: { materials: { quantity: Quantity | undefined }[] }[]): number`

- [ ] **Paso 1: Escribir el test que falla**

Crear `tests/quantities.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addQuantities,
  countMissingQuantities,
  findMissingQuantities,
  hasQuantity,
  parseQuantityInput,
  quantityInputValue,
  roundQuantity,
  scaleQuantity,
  sumQuantities
} from '../src/client/quantities.ts';

test('parseQuantityInput: vacío y cero son "sin cantidad"; negativo o texto, inválido', () => {
  assert.equal(parseQuantityInput(''), null);
  assert.equal(parseQuantityInput('   '), null);
  assert.equal(parseQuantityInput('0'), null);
  assert.equal(parseQuantityInput('2,5'), 2.5);
  assert.equal(parseQuantityInput('1.23456789'), 1.234568);
  assert.equal(parseQuantityInput('-1'), 'invalid');
  assert.equal(parseQuantityInput('abc'), 'invalid');
});

test('hasQuantity trata null, 0, negativos y NaN como "sin cantidad" (borradores antiguos tienen 0)', () => {
  assert.equal(hasQuantity(3), true);
  for (const q of [null, undefined, 0, -1, Number.NaN]) assert.equal(hasQuantity(q), false, String(q));
});

test('sumas, escalado y fusión respetan el vacío', () => {
  assert.equal(sumQuantities([1.5, null, 2, undefined, 0]), 3.5);
  assert.equal(scaleQuantity(null, 3), null);
  assert.equal(scaleQuantity(1.5, 3), 4.5);
  assert.equal(scaleQuantity(0.0000001, 1), null);
  assert.equal(addQuantities(null, null), null);
  assert.equal(addQuantities(null, 2), 2);
  assert.equal(addQuantities(2, null), 2);
  assert.equal(addQuantities(0.1, 0.2), 0.3);
  assert.equal(roundQuantity(0.1 + 0.2), 0.3);
});

test('quantityInputValue deja el campo vacío cuando no hay cantidad', () => {
  assert.equal(quantityInputValue(null), '');
  assert.equal(quantityInputValue(0), '');
  assert.equal(quantityInputValue(2.5), '2.5');
});

test('findMissingQuantities lista OF y línea de cada hueco', () => {
  const ofs = [
    { id: 'o1', of: '221150', description: 'Telón', materials: [
      { id: 'l1', code: 'A', description: 'Lona', quantity: 2 },
      { id: 'l2', code: 'B', description: 'Motor', quantity: null }
    ] },
    { id: 'o2', of: '', description: 'Faldón', materials: [{ id: 'l3', code: 'C', description: '', quantity: 0 }] }
  ];
  assert.deepEqual(findMissingQuantities(ofs), [
    { ofId: 'o1', lineId: 'l2', ofLabel: 'OF 221150', code: 'B', description: 'Motor' },
    { ofId: 'o2', lineId: 'l3', ofLabel: 'OF 2 · Faldón', code: 'C', description: '' }
  ]);
  assert.equal(countMissingQuantities(ofs), 2);
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

Ejecutar: `node --test tests/quantities.test.js`
Esperado: FAIL — no existe `src/client/quantities.ts`.

- [ ] **Paso 3: Crear `src/client/quantities.ts`**

Sin imports de ejecución: los tests lo importan directamente con Node.

```ts
/** Cantidad de una línea de material. `null` = sin cantidad todavía (se rellena al reservar). */
export type Quantity = number | null;

/** Lo que sale de un campo de cantidad: una cantidad, vacío o algo que no se puede aceptar. */
export type QuantityInput = Quantity | 'invalid';

export type MissingQuantity = {
  ofId: string;
  lineId: string;
  ofLabel: string;
  code: string;
  description: string;
};

type LineLike = { id: string; code: string; description: string; quantity: Quantity | undefined };
type OfLike = { id: string; of: string; description: string; materials: LineLike[] };

export function roundQuantity(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

/**
 * ¿La línea tiene una cantidad utilizable? Los borradores guardados antes de
 * este cambio usaban 0 para "vacío", así que 0 cuenta como sin cantidad.
 */
export function hasQuantity(quantity: Quantity | undefined): quantity is number {
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0;
}

export function parseQuantityInput(raw: string): QuantityInput {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return 'invalid';
  const rounded = roundQuantity(value);
  return rounded === 0 ? null : rounded;
}

export function quantityInputValue(quantity: Quantity | undefined): string {
  return hasQuantity(quantity) ? String(quantity) : '';
}

export function sumQuantities(quantities: (Quantity | undefined)[]): number {
  return roundQuantity(quantities.reduce<number>((sum, q) => sum + (hasQuantity(q) ? q : 0), 0));
}

/** Vacío × N sigue vacío: nunca 0 ni NaN. */
export function scaleQuantity(quantity: Quantity | undefined, multiplier: number): Quantity {
  if (!hasQuantity(quantity)) return null;
  const scaled = roundQuantity(quantity * multiplier);
  return hasQuantity(scaled) ? scaled : null;
}

/** Al añadir dos veces el mismo artículo: vacío + 2 = 2, vacío + vacío = vacío. */
export function addQuantities(a: Quantity | undefined, b: Quantity | undefined): Quantity {
  if (!hasQuantity(a)) return hasQuantity(b) ? b : null;
  if (!hasQuantity(b)) return a;
  return roundQuantity(a + b);
}

export function findMissingQuantities(ofs: OfLike[]): MissingQuantity[] {
  return ofs.flatMap((ofBlock, index) => {
    const of = ofBlock.of.trim();
    const description = ofBlock.description.trim();
    const ofLabel = of ? `OF ${of}` : `OF ${index + 1}${description ? ` · ${description}` : ''}`;
    return ofBlock.materials
      .filter((line) => !hasQuantity(line.quantity))
      .map((line) => ({ ofId: ofBlock.id, lineId: line.id, ofLabel, code: line.code, description: line.description }));
  });
}

export function countMissingQuantities(groups: { materials: { quantity: Quantity | undefined }[] }[]): number {
  return groups.reduce((count, group) => count + group.materials.filter((m) => !hasQuantity(m.quantity)).length, 0);
}
```

- [ ] **Paso 4: Reexportar `roundQuantity` desde `src/client/utils.ts`**

Borrar de `utils.ts`:

```ts
export function roundQuantity(value: number) {
  return Math.round(value * 1000000) / 1000000;
}
```

y añadir, debajo de `import type { Article } from './types';`:

```ts
export { roundQuantity } from './quantities';
```

- [ ] **Paso 5: Ejecutar el test y verificar todo**

Ejecutar: `node --test tests/quantities.test.js && npm run lint && npx tsc --noEmit && npm test && npm run build`
Esperado: todo en verde.

- [ ] **Paso 6: Commit**

```bash
git add src/client/quantities.ts src/client/utils.ts tests/quantities.test.js
git commit -F - <<'EOF'
feat: aritmética de cantidades opcionales en el cliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 7: El cliente lee y muestra líneas sin cantidad

**Archivos:**
- Crear: `src/client/styles/quantities.css`
- Modificar: `src/client/styles.css` (un `@import`)
- Modificar: `src/client/types.ts` (`MaterialLine`, `OfBlock`, `ModelMaterial`)
- Modificar: `src/client/App.tsx` (`totals`, `handleTransferModelToAssignment`, `resumeDraft`, fusiones en `addLine` y `addLineByOfValue`)
- Modificar: `src/client/components/assignments/{AssignmentWorkspace,SummaryPanel,MaterialTable}.tsx`
- Modificar: `src/client/components/models/{ModelTransferModal,ModelCard,SaveAsModelModal,ModelEditorModal}.tsx`
- Modificar: `src/client/components/drafts/{DraftCard,SaveDraftModal}.tsx`

**Interfaces:**
- Consume: Tarea 6.
- Produce: `MaterialLine.quantity: Quantity`, `ModelMaterial.quantity: Quantity`, `OfBlock.partDescription?: string`. Totales de la asignación: `{ ofs: number; lines: number; units: number; missing: number }`. Atributo `data-line-id` en el campo de cantidad de cada línea (lo usa la Tarea 9).

Esta tarea **no** cambia todavía los campos de alta: solo hace que todo lo que lee cantidades acepte `null` sin romperse ni pintar "null" o "0". `tsc` marca cada sitio que falte, porque `formatNumber` y las sumas exigen `number`.

- [ ] **Paso 1: Cambiar los tipos en `src/client/types.ts`**

Añadir arriba del todo:

```ts
import type { Quantity } from './quantities';
```

En `MaterialLine` y en `ModelMaterial`, cambiar `quantity: number;` por `quantity: Quantity;`. En `OfBlock`, añadir tras `description: string;`:

```ts
  /** Descripción de la parte del modelo de origen, para guardarla de vuelta sin tocar el nombre. */
  partDescription?: string;
```

- [ ] **Paso 2: Ver los errores que hay que resolver**

Ejecutar: `npx tsc --noEmit`
Esperado: errores en App.tsx, MaterialTable.tsx, ModelTransferModal.tsx, ModelCard.tsx, SaveAsModelModal.tsx, ModelEditorModal.tsx, DraftCard.tsx y SaveDraftModal.tsx. Los pasos 3 a 11 los resuelven todos.

- [ ] **Paso 3: `App.tsx`**

Cambiar el import de utilidades por:

```ts
import { roundQuantity, uid } from './utils';
import { addQuantities, countMissingQuantities, hasQuantity, scaleQuantity, sumQuantities } from './quantities';
```

`totals`:

```ts
  const totals = useMemo(() => {
    const lines = ofs.flatMap((ofBlock) => ofBlock.materials);
    return {
      ofs: ofs.length,
      lines: lines.length,
      units: sumQuantities(lines.map((line) => line.quantity)),
      missing: countMissingQuantities(ofs)
    };
  }, [ofs]);
```

En `handleTransferModelToAssignment`, la construcción de cada OF pasa a:

```ts
    const newOfBlocks: OfBlock[] = partsToTransfer.map(({ part, multiplier }) => ({
      id: uid(),
      of: '',
      description: part.name,
      partDescription: part.description || '',
      materials: part.materials.map((m) => ({
        id: uid(),
        code: m.code,
        description: m.description,
        quantity: scaleQuantity(m.quantity, multiplier),
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    }));
```

En `resumeDraft`, la línea de cantidad pasa a:

```ts
        quantity: hasQuantity(m.quantity) ? roundQuantity(m.quantity) : null,
```

En `addLine` y en `addLineByOfValue`, la fusión cuando el artículo ya está en la OF:

```ts
                ? { ...line, quantity: addQuantities(line.quantity, quantity) }
```

- [ ] **Paso 4: Totales con huecos en `AssignmentWorkspace.tsx` y `SummaryPanel.tsx`**

En los dos archivos, cambiar el tipo de la prop `totals` por:

```ts
  totals: { ofs: number; lines: number; units: number; missing: number };
```

En `SummaryPanel.tsx`, justo después del `<div className="metrics">…</div>`:

```tsx
      {totals.missing > 0 && (
        <p className="missing-hint" role="status">
          <AlertTriangle aria-hidden="true" />
          {totals.missing === 1 ? '1 línea sin cantidad' : `${totals.missing} líneas sin cantidad`}: complétalas antes de generar.
        </p>
      )}
```

- [ ] **Paso 5: `QuantityCell` en `MaterialTable.tsx` muestra el hueco**

Añadir el import:

```ts
import { hasQuantity, quantityInputValue } from '../../quantities';
```

Sustituir el `<input …/>` que devuelve `QuantityCell` por:

```tsx
    <input
      className={`quantity-cell-input${hasQuantity(line.quantity) ? '' : ' quantity-missing'}`}
      data-line-id={line.id}
      value={draft ?? quantityInputValue(line.quantity)}
      placeholder="Sin cantidad"
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelledRef.current = true;
          event.currentTarget.blur();
        }
      }}
      type="number"
      min="0.000001"
      step="0.01"
      aria-label={`Cantidad de ${line.code}`}
    />
```

(El `min` y la confirmación siguen igual en esta tarea; la Tarea 8 los cambia.)

- [ ] **Paso 6: `ModelTransferModal.tsx`**

Imports:

```ts
import { formatNumber } from '../../utils';
import { countMissingQuantities, hasQuantity, scaleQuantity, sumQuantities } from '../../quantities';
```

Sustituir las dos líneas `const multiplier = …` y `const validMultiplier = …` por:

```ts
  const multiplier = Number(multiplierInput.replace(',', '.'));
  // Las líneas sin cantidad siguen vacías al multiplicar: no deben impedir el volcado.
  const validMultiplier = Number.isFinite(multiplier) && multiplier > 0;
```

Y sustituir `totalLinesSelected` y `totalUnitsSelected` (tras `selectedParts`) por:

```ts
  const totalLinesSelected = selectedParts.reduce((sum, p) => sum + p.materials.length, 0);
  const totalUnitsSelected = sumQuantities(
    selectedParts.flatMap((p) => p.materials.map((m) => scaleQuantity(m.quantity, multiplier)))
  );
  const missingSelected = countMissingQuantities(selectedParts);
```

Texto de ayuda del multiplicador (válido):

```tsx
{validMultiplier ? 'Multiplica la cantidad base de cada material. Las líneas sin cantidad siguen vacías.' : 'Introduce una cantidad mayor que cero.'}
```

Píldoras de materiales:

```tsx
                    {part.materials.map((m) => {
                      const scaled = scaleQuantity(m.quantity, multiplier);
                      return (
                        <span key={m.id || m.code} className={`material-pill${hasQuantity(scaled) ? '' : ' missing'}`}>
                          {m.code} ({hasQuantity(scaled) ? `x${formatNumber(scaled)}` : 'sin cantidad'})
                        </span>
                      );
                    })}
```

En `transfer-summary-stats`, tras las unidades:

```tsx
            {missingSelected > 0 && (
              <>
                <span>·</span>
                <span className="quantity-missing-text">{missingSelected} sin cantidad</span>
              </>
            )}
```

Quitar `roundQuantity` del import de `../../utils` si queda sin uso.

- [ ] **Paso 7: `ModelCard.tsx`**

Import:

```ts
import { countMissingQuantities, hasQuantity } from '../../quantities';
```

Tras `const totalLines = …`:

```ts
  const missingLines = countMissingQuantities(model.parts);
```

En `model-meta`, tras el chip de artículos:

```tsx
            {missingLines > 0 && (
              <span className="history-chip missing-chip">{missingLines} sin cantidad</span>
            )}
```

Celda de cantidad de la tabla de partes:

```tsx
                          <td>
                            {hasQuantity(mat.quantity)
                              ? formatNumber(mat.quantity)
                              : <span className="quantity-missing-text">sin cantidad</span>}
                          </td>
```

- [ ] **Paso 8: `DraftCard.tsx`**

Import:

```ts
import { countMissingQuantities, hasQuantity, sumQuantities } from '../../quantities';
```

Sustituir `totalUnits` y añadir `missingLines`:

```ts
  const totalUnits =
    draft.totals?.units ?? sumQuantities(draft.ofs.flatMap((of) => of.materials.map((m) => m.quantity)));
  const missingLines = countMissingQuantities(draft.ofs);
```

En `draft-meta`, tras el chip de unidades:

```tsx
            {missingLines > 0 && (
              <span className="history-chip missing-chip">{missingLines} sin cantidad</span>
            )}
```

Celda de cantidad:

```tsx
                          <td style={{ textAlign: 'right' }}>
                            {hasQuantity(m.quantity)
                              ? formatNumber(m.quantity)
                              : <span className="quantity-missing-text">sin cantidad</span>}
                          </td>
```

- [ ] **Paso 9: `SaveDraftModal.tsx` y `SaveAsModelModal.tsx`**

`SaveDraftModal.tsx`: import `import { sumQuantities } from '../../quantities';` y

```ts
  const totalUnits = sumQuantities(ofs.flatMap((b) => b.materials.map((m) => m.quantity)));
```

`SaveAsModelModal.tsx`: import `import { hasQuantity } from '../../quantities';` y la píldora:

```tsx
                    <span key={m.id} className={`material-pill${hasQuantity(m.quantity) ? '' : ' missing'}`}>
                      {m.code} ({hasQuantity(m.quantity) ? `x${formatNumber(m.quantity)}` : 'sin cantidad'})
                    </span>
```

- [ ] **Paso 10: Fusión en `ModelEditorModal.tsx`**

Import: añadir `import { addQuantities } from '../../quantities';`. En `addMaterialToPart`, la rama de artículo existente:

```ts
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: addQuantities(updated[existingIdx].quantity, quantity)
          };
```

- [ ] **Paso 11: Estilos — crear `src/client/styles/quantities.css`**

```css
/* ============================================================
   Cantidades pendientes: líneas guardadas sin cantidad
   Selectores compuestos para no depender del orden de los @import.
   ============================================================ */

.quantity-cell-input.quantity-missing {
  border-color: var(--warn-border);
  background: var(--warn-soft);
}

.quantity-cell-input.quantity-missing::placeholder {
  color: var(--warn-ink);
  opacity: 0.85;
}

.quantity-missing-text {
  color: var(--warn-ink);
  font-size: 12px;
  font-style: italic;
  font-weight: 550;
}

.history-chip.missing-chip {
  border-color: var(--warn-border);
  background: var(--warn-soft);
  color: var(--warn-ink);
}

.material-pill.missing {
  border-style: dashed;
  border-color: var(--warn-border);
  color: var(--warn-ink);
}

.missing-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  border: 1px solid var(--warn-border);
  border-radius: var(--radius-s);
  padding: 8px 10px;
  background: var(--warn-soft);
  color: var(--warn-ink);
  font-size: 12.5px;
  font-weight: 600;
}

.missing-hint svg {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
}
```

En `src/client/styles.css`, añadir justo **antes** de `@import './styles/animations.css';`:

```css
@import './styles/quantities.css';
```

- [ ] **Paso 12: Verificar todo**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Esperado: todo en verde.

- [ ] **Paso 13: Commit**

```bash
git add src/client
git commit -F - <<'EOF'
feat: la interfaz muestra las líneas sin cantidad en vez de "0" o "null"

Hueco amarillo en la tabla de la OF, chapa "N sin cantidad" en tarjetas de
modelo y borrador, aviso en el resumen. Al volcar un modelo, vacío × N sigue
vacío, y la OF recibe solo el nombre de la parte: la descripción va aparte
(partDescription) para poder guardarla de vuelta sin alargar el nombre.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 8: Dar de alta artículos sin cantidad

**Archivos:**
- Modificar: `src/client/App.tsx` (`addLine`, `addLineByOfValue`, `updateLineQuantity`)
- Modificar: `src/client/components/assignments/{AssignmentWorkspace,OfCard,MaterialTable}.tsx`
- Modificar: `src/client/components/catalog/ArticleCatalog.tsx`
- Modificar: `src/client/components/models/ModelEditorModal.tsx`

**Interfaces:**
- Consume: `parseQuantityInput`, `QuantityInput`, `Quantity`, `addQuantities` (Tarea 6).
- Produce: `onAddLine(ofId, article, quantity: QuantityInput): boolean`, `onAddLineToOf(of, article, quantity: QuantityInput): boolean`, `onUpdateLineQuantity(ofId, lineId, quantity: Quantity): void`, `QuantityCell.onCommit(quantity: Quantity)`.

- [ ] **Paso 1: `App.tsx` acepta altas sin cantidad**

Añadir `type Quantity, type QuantityInput` al import existente de `./quantities`.

En `addLine(ofId: string, article: Article, quantity: QuantityInput)` y en `addLineByOfValue(ofValue: string, article: Article, quantity: QuantityInput)`, sustituir el bloque

```ts
    if (!Number.isFinite(quantity) || quantity <= 0) {
      pushToast('La cantidad debe ser mayor que cero.', 'error');
      return false;
    }
```

por

```ts
    if (quantity === 'invalid') {
      pushToast('La cantidad no es válida.', 'error');
      return false;
    }
```

Donde se crea la línea nueva, `quantity: roundQuantity(quantity),` pasa a `quantity,` (ya viene redondeada o `null`).

Mensajes al final de `addLine`:

```ts
    if (article.widthWarning) {
      pushToast(`Línea añadida. Aviso: ${article.widthWarning}`, 'warn');
    } else if (quantity === null) {
      pushToast('Línea añadida sin cantidad: complétala antes de generar.', 'info');
    } else {
      pushToast('Línea añadida.', 'ok');
    }
```

y al final de `addLineByOfValue`:

```ts
    if (article.widthWarning) {
      pushToast(`Línea añadida a OF ${of}. Aviso: ${article.widthWarning}`, 'warn');
    } else if (quantity === null) {
      pushToast(`Línea añadida a OF ${of} sin cantidad.`, 'info');
    } else {
      pushToast(`Línea añadida a OF ${of}.`, 'ok');
    }
```

`updateLineQuantity`:

```ts
  function updateLineQuantity(ofId: string, lineId: string, quantity: Quantity) {
    setOfs((current) =>
      current.map((ofBlock) =>
        ofBlock.id === ofId
          ? {
              ...ofBlock,
              materials: ofBlock.materials.map((line) => (line.id === lineId ? { ...line, quantity } : line))
            }
          : ofBlock
      )
    );
  }
```

- [ ] **Paso 2: Tipos de las props**

`AssignmentWorkspace.tsx` y `OfCard.tsx`: import `import type { Quantity, QuantityInput } from '../../quantities';` y

```ts
  onAddLine: (ofId: string, article: Article, quantity: QuantityInput) => boolean;
  onUpdateLineQuantity: (ofId: string, lineId: string, quantity: Quantity) => void;
```

`MaterialTable.tsx`: `onUpdateQuantity: (lineId: string, quantity: Quantity) => void;`

- [ ] **Paso 3: `OfCard.tsx`**

Import de valor: `import { parseQuantityInput } from '../../quantities';`. En `commitLine`:

```ts
    const added = onAddLine(ofBlock.id, article, parseQuantityInput(quantity));
```

Campo de cantidad: `placeholder="Opcional"` y `min="0"` (en vez de `placeholder="0"` y `min="0.000001"`).

- [ ] **Paso 4: `QuantityCell` en `MaterialTable.tsx` permite borrar la cantidad**

Imports: `import { hasQuantity, parseQuantityInput, quantityInputValue, type Quantity } from '../../quantities';`

```tsx
export function QuantityCell({
  line,
  onCommit
}: {
  line: { id: string; code: string; quantity: Quantity };
  onCommit: (quantity: Quantity) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
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

y en el `<input>`, `min="0"`. Quitar `MaterialLine` del import de tipos si queda sin uso.

- [ ] **Paso 5: `ArticleCatalog.tsx`**

Import: `import { parseQuantityInput, type QuantityInput } from '../../quantities';`. En las props de `ArticleCatalog` y de `ArticleRow`:

```ts
  onAddLineToOf: (of: string, article: Article, quantity: QuantityInput) => boolean;
```

En `commitCatalogLine`:

```ts
    const added = onAddLineToOf(ofTarget, article, parseQuantityInput(quantity));
```

Campo `Cant.`: `min="0"` y `placeholder="Opc."`.

- [ ] **Paso 6: `ModelEditorModal.tsx`**

Imports:

```ts
import { formatDisplayText, uid } from '../../utils';
import { addQuantities, parseQuantityInput, type Quantity } from '../../quantities';
```

```ts
  function addMaterialToPart(partId: string, article: Article, quantity: Quantity) {
    const code = article.code?.trim().toUpperCase();
    if (!code) return;

    setParts((prev) =>
      prev.map((part) => {
        if (part.id !== partId) return part;
        const existingIdx = part.materials.findIndex((m) => m.code === code);
        if (existingIdx >= 0) {
          const updated = [...part.materials];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: addQuantities(updated[existingIdx].quantity, quantity)
          };
          return { ...part, materials: updated };
        }
        return {
          ...part,
          materials: [
            ...part.materials,
            {
              id: uid(),
              code,
              description: article.description || '',
              quantity,
              width: article.detectedWidth ?? null,
              widthWarning: article.widthWarning ?? null
            }
          ]
        };
      })
    );
  }
```

```ts
  function updateMaterialQuantity(partId: string, materialId: string, quantity: Quantity) {
    setParts((prev) =>
      prev.map((part) =>
        part.id === partId
          ? { ...part, materials: part.materials.map((m) => (m.id === materialId ? { ...m, quantity } : m)) }
          : part
      )
    );
  }
```

Props de `PartEditorCard`:

```ts
  onAddMaterial: (article: Article, quantity: Quantity) => void;
  onUpdateMaterialQty: (matId: string, quantity: Quantity) => void;
```

`handleAddLine` de `PartEditorCard`:

```ts
  function handleAddLine() {
    const article =
      selectedArticle ||
      pickerRef.current?.typedArticle() || {
        idArticle: '',
        code: '',
        description: ''
      };
    const qty = parseQuantityInput(quantity);
    if (!article.code) {
      setLineError('Selecciona un artículo o escribe su código.');
      return;
    }
    if (qty === 'invalid') {
      setLineError('La cantidad no es válida.');
      return;
    }
    setLineError('');
    onAddMaterial(article, qty);
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
  }
```

Campo `Cant. base`: `min="0"` y `placeholder="Opcional"`.

- [ ] **Paso 7: Comprobar que no queda ningún mínimo forzado en cantidades**

Ejecutar: `grep -rn 'min="0.000001"' src/client`
Esperado: una sola coincidencia, en `ModelTransferModal.tsx` (el multiplicador, que sí debe ser mayor que cero).

- [ ] **Paso 8: Verificar y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client
git commit -F - <<'EOF'
feat: añadir artículos sin cantidad desde la OF, Artículos y el editor de modelos

Vaciar el campo de cantidad deja la línea sin cantidad en vez de ignorarlo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 9: Bloquear la generación con un aviso que lleva a cada línea

**Archivos:**
- Crear: `src/client/components/common/MissingQuantitiesDialog.tsx`
- Modificar: `src/client/App.tsx` (estado, `saveExcelToNetwork`, `goToMissingLine`, render)
- Modificar: `src/client/styles/quantities.css` (estilos del aviso)

**Interfaces:**
- Consume: `findMissingQuantities`, `MissingQuantity` (Tarea 6); `data-line-id` en `QuantityCell` (Tarea 7).
- Produce: `<MissingQuantitiesDialog items onClose onGoTo />`.

- [ ] **Paso 1: Crear `MissingQuantitiesDialog.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { MissingQuantity } from '../../quantities';
import { formatDisplayText } from '../../utils';

/** Aviso que bloquea la generación mientras haya líneas sin cantidad. Cada fila lleva a su campo. */
export function MissingQuantitiesDialog({
  items,
  onClose,
  onGoTo
}: {
  items: MissingQuantity[];
  onClose: () => void;
  onGoTo: (item: MissingQuantity) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // Si se pulsa una fila, el foco va a esa línea y no debe volver al botón de generar
  const restoreFocusRef = useRef(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (restoreFocusRef.current && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-overlay"
      aria-labelledby="missing-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal">
        <div className="modal-icon">
          <AlertTriangle aria-hidden="true" />
        </div>
        <h2 id="missing-title">Faltan cantidades</h2>
        <p>
          No se ha generado nada.{' '}
          {items.length === 1 ? 'Esta línea no tiene cantidad' : `Estas ${items.length} líneas no tienen cantidad`}:
          pulsa una para ir a su campo.
        </p>
        <ul className="missing-list">
          {items.map((item) => (
            <li key={item.lineId}>
              <button
                className="missing-item"
                type="button"
                onClick={() => {
                  restoreFocusRef.current = false;
                  onGoTo(item);
                }}
              >
                <span className="missing-item-of">{item.ofLabel}</span>
                <span className="missing-item-code">
                  {item.code}
                  {item.description && <em>{formatDisplayText(item.description)}</em>}
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onClose}>
            Volver
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Paso 2: Conectarlo en `App.tsx`**

Imports:

```ts
import { MissingQuantitiesDialog } from './components/common/MissingQuantitiesDialog';
```

y añadir `findMissingQuantities` y `type MissingQuantity` al import de `./quantities`.

Estado, junto a `overwritePrompt`:

```ts
  const [missingQuantities, setMissingQuantities] = useState<MissingQuantity[] | null>(null);
```

En `saveExcelToNetwork`, justo después del bloque de OFs repetidas y antes de `setIsSavingToNetwork(true)`:

```ts
    const missing = findMissingQuantities(ofs);
    if (missing.length > 0) {
      setMissingQuantities(missing);
      return;
    }
```

Función nueva, antes de `saveExcelToNetwork`:

```ts
  function goToMissingLine(item: MissingQuantity) {
    setMissingQuantities(null);
    // Tras cerrar el aviso: llevar la OF a la vista y dejar el cursor en el campo
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-line-id="${CSS.escape(item.lineId)}"]`);
      if (!input) return;
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input.focus({ preventScroll: true });
    }, 0);
  }
```

Render, junto a `overwritePrompt`:

```tsx
      {missingQuantities && (
        <MissingQuantitiesDialog
          items={missingQuantities}
          onClose={() => setMissingQuantities(null)}
          onGoTo={goToMissingLine}
        />
      )}
```

- [ ] **Paso 3: Estilos, al final de `src/client/styles/quantities.css`**

```css
/* --- aviso de bloqueo al generar --- */

.missing-list {
  display: grid;
  gap: 6px;
  max-height: min(50vh, 360px);
  overflow-y: auto;
  margin: 14px 0 4px;
  padding: 0;
  list-style: none;
}

.missing-item {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  padding: 8px 10px;
  background: var(--surface-2);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
  transition: border-color 150ms ease, background 150ms ease;
}

.missing-item:hover,
.missing-item:focus-visible {
  border-color: var(--warn-border);
  background: var(--warn-soft);
  outline: 0;
}

.missing-item-of {
  color: var(--ink-3);
  font-size: 11.5px;
  font-weight: 650;
  white-space: nowrap;
}

.missing-item-code {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.missing-item-code em {
  margin-left: 6px;
  color: var(--ink-3);
  font-style: normal;
  font-weight: 500;
}

.missing-item svg {
  width: 15px;
  height: 15px;
  color: var(--ink-3);
}
```

- [ ] **Paso 4: Verificar y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client
git commit -F - <<'EOF'
feat: no generar la asignación si faltan cantidades, con aviso que lleva a cada línea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 10: Actualizar el modelo de origen

**Archivos:**
- Crear: `src/client/activeModel.ts`
- Test: `tests/activeModel.test.js`
- Modificar: `src/client/types.ts` (tipo `ActiveModel`)
- Modificar: `src/client/App.tsx` (estado `activeModel`, volcado, guardado, limpiezas)
- Modificar: `src/client/components/models/ModelsView.tsx` (firma del volcado)
- Modificar: `src/client/components/models/SaveAsModelModal.tsx`
- Modificar: `src/client/components/drafts/SaveDraftModal.tsx` (mismo selector de modo)
- Modificar: `src/client/styles/models.css`

**Interfaces:**
- Consume: `AssignmentModel`.
- Produce: `type ActiveModel = { id; name; description; updatedAt; updatable: boolean; reason: string | null }`; `describeActiveModel(model, load: { multiplier: number; partsLoaded: number; appendedToOtherOfs: boolean }): ActiveModel`; `ModelsView.onTransferModelToAssignment(model, parts, replaceExisting)`; `SaveAsModelModal.onSave(modelData, mode: 'update' | 'new')`.

- [ ] **Paso 1: Escribir el test que falla**

Crear `tests/activeModel.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { describeActiveModel } from '../src/client/activeModel.ts';

const modelo = {
  id: 'm1',
  name: 'Escenario Orquesta ODL 720 EE',
  description: 'Base',
  createdAt: '2026-09-16T08:44:04.000Z',
  updatedAt: '2026-10-09T08:58:44.000Z',
  parts: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]
};

test('carga completa, ×1 y reemplazando: se puede actualizar', () => {
  const activo = describeActiveModel(modelo, { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: false });
  assert.deepEqual(activo, {
    id: 'm1',
    name: 'Escenario Orquesta ODL 720 EE',
    description: 'Base',
    updatedAt: '2026-10-09T08:58:44.000Z',
    updatable: true,
    reason: null
  });
});

test('cada trampa de la carga impide actualizar y lo explica', () => {
  assert.equal(
    describeActiveModel(modelo, { multiplier: 2.5, partsLoaded: 3, appendedToOtherOfs: false }).reason,
    'Lo cargaste ×2,5: se guardarían las cantidades multiplicadas como base.'
  );
  assert.equal(
    describeActiveModel(modelo, { multiplier: 1, partsLoaded: 2, appendedToOtherOfs: false }).reason,
    'Cargaste 2 de 3 partes: el modelo perdería las demás.'
  );
  assert.equal(
    describeActiveModel(modelo, { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: true }).reason,
    'Lo añadiste encima de otras OFs: el modelo se quedaría con OFs ajenas.'
  );
  assert.equal(describeActiveModel(modelo, { multiplier: 3, partsLoaded: 1, appendedToOtherOfs: true }).updatable, false);
});

test('sin updatedAt se usa createdAt como versión', () => {
  const { updatedAt } = describeActiveModel({ ...modelo, updatedAt: undefined }, { multiplier: 1, partsLoaded: 3, appendedToOtherOfs: false });
  assert.equal(updatedAt, '2026-09-16T08:44:04.000Z');
});
```

- [ ] **Paso 2: Ejecutarlo y ver que falla**

Ejecutar: `node --test tests/activeModel.test.js`
Esperado: FAIL — no existe `src/client/activeModel.ts`.

- [ ] **Paso 3: Tipo en `types.ts` y módulo `activeModel.ts`**

En `src/client/types.ts`, al final:

```ts
/** Modelo del que vienen las OFs del formulario. `updatable` = se puede guardar encima sin destrozarlo. */
export type ActiveModel = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  updatable: boolean;
  reason: string | null;
};
```

Crear `src/client/activeModel.ts` (sin imports de ejecución):

```ts
import type { ActiveModel, AssignmentModel } from './types';

type ModelLoad = {
  multiplier: number;
  partsLoaded: number;
  appendedToOtherOfs: boolean;
};

/**
 * Recuerda de qué modelo viene el formulario y si se puede actualizar.
 * Las trampas son de la CARGA: lo que se edite después sí se quiere guardar.
 */
export function describeActiveModel(
  model: Pick<AssignmentModel, 'id' | 'name' | 'description' | 'createdAt' | 'updatedAt' | 'parts'>,
  load: ModelLoad
): ActiveModel {
  const reason =
    load.multiplier !== 1
      ? `Lo cargaste ×${String(load.multiplier).replace('.', ',')}: se guardarían las cantidades multiplicadas como base.`
      : load.partsLoaded < model.parts.length
        ? `Cargaste ${load.partsLoaded} de ${model.parts.length} partes: el modelo perdería las demás.`
        : load.appendedToOtherOfs
          ? 'Lo añadiste encima de otras OFs: el modelo se quedaría con OFs ajenas.'
          : null;

  return {
    id: model.id,
    name: model.name,
    description: model.description || '',
    updatedAt: model.updatedAt || model.createdAt,
    updatable: reason === null,
    reason
  };
}
```

- [ ] **Paso 4: Ejecutar el test y ver que pasa**

Ejecutar: `node --test tests/activeModel.test.js`
Esperado: PASS, 3 tests.

- [ ] **Paso 5: `ModelsView.tsx` pasa el modelo al volcar**

Tipo de la prop:

```ts
  onTransferModelToAssignment: (
    model: AssignmentModel,
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) => void;
```

Y en el render del `ModelTransferModal`:

```tsx
          onTransfer={(parts, replaceExisting) => {
            const model = modelToTransfer;
            setModelToTransfer(null);
            onTransferModelToAssignment(model, parts, replaceExisting);
          }}
```

- [ ] **Paso 6: `App.tsx` recuerda el modelo**

Imports: `ActiveModel` en el import de tipos y `import { describeActiveModel } from './activeModel';`.

Estado, junto a `activeDraft`:

```ts
  const [activeModel, setActiveModel] = useState<ActiveModel | null>(null);
```

`handleTransferModelToAssignment` completo:

```ts
  function handleTransferModelToAssignment(
    model: AssignmentModel,
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) {
    const previousOfs = ofs;
    const previousActiveModel = activeModel;
    const hadOtherContent = ofs.some((b) => b.of.trim() || b.description.trim() || b.materials.length > 0);
    const newOfBlocks: OfBlock[] = partsToTransfer.map(({ part, multiplier }) => ({
      id: uid(),
      of: '',
      description: part.name,
      partDescription: part.description || '',
      materials: part.materials.map((m) => ({
        id: uid(),
        code: m.code,
        description: m.description,
        quantity: scaleQuantity(m.quantity, multiplier),
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    }));

    setOfs((current) => {
      if (replaceExisting) return newOfBlocks.length > 0 ? newOfBlocks : [createOf()];
      // Mantener las OFs con contenido o eliminar borrador vacío
      const rest = current.filter((b) => b.of.trim() || b.description.trim() || b.materials.length > 0);
      return [...rest, ...newOfBlocks];
    });
    setActiveModel(
      describeActiveModel(model, {
        multiplier: partsToTransfer[0]?.multiplier ?? 1,
        partsLoaded: partsToTransfer.length,
        appendedToOtherOfs: !replaceExisting && hadOtherContent
      })
    );

    setActiveTab('assignments');
    pushToast(
      `${partsToTransfer.length} ${partsToTransfer.length === 1 ? 'parte cargada' : 'partes cargadas'}. Completa los números de OF y el pedido.`,
      'ok',
      replaceExisting
        ? {
            label: 'Deshacer',
            run: () => {
              setOfs(previousOfs);
              setActiveModel(previousActiveModel);
            }
          }
        : undefined
    );
  }
```

`handleSaveCurrentAsModel` completo:

```ts
  async function handleSaveCurrentAsModel(modelData: Partial<AssignmentModel>, mode: 'update' | 'new') {
    // Desde un borrador (botón de su tarjeta) no hay modelo de origen que actualizar
    const fromForm = modelModalOfs === null;

    if (mode === 'update' && fromForm && activeModel?.updatable) {
      const response = await fetch(`/api/models/${activeModel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelData)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el modelo.');
      setActiveModel({
        ...activeModel,
        name: data.model.name,
        description: data.model.description || '',
        updatedAt: data.model.updatedAt
      });
      pushToast(`Modelo "${data.model.name}" actualizado.`, 'ok');
      return;
    }

    const response = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el modelo en el servidor.');

    // A partir de ahora, guardar desde el formulario actualiza este modelo nuevo
    if (fromForm) {
      setActiveModel(describeActiveModel(data.model, { multiplier: 1, partsLoaded: data.model.parts.length, appendedToOtherOfs: false }));
    }
    pushToast(`Modelo "${data.model.name}" guardado en la biblioteca.`, 'ok');
  }
```

Limpiar `activeModel` donde se limpia o sustituye el formulario, guardándolo en el deshacer:

- `resumeDraft`: `const previousSnapshot = { orderCode, ofs, activeDraft, activeModel };`, añadir `setActiveModel(null);` junto a `setActiveDraft({...})`, y en el `run` del deshacer `setActiveModel(previousSnapshot.activeModel);`.
- `clearAll`: `const snapshot = { orderCode, ofs, activeDraft, activeModel };`, `setActiveModel(null);` tras `setActiveDraft(null);`, y en el deshacer `setActiveModel(snapshot.activeModel);`.
- `saveExcelToNetwork` (éxito): `const snapshot = { orderCode, ofs, activeDraft, activeModel };`, `setActiveModel(null);` tras `setActiveDraft(null);`, y en "Restaurar campos" `setActiveModel(snapshot.activeModel);`.

Render de `SaveAsModelModal`:

```tsx
        <SaveAsModelModal
          ofs={modelModalOfs || ofs}
          sourceModel={modelModalOfs ? null : activeModel}
          onClose={() => {
            setIsSaveAsModelOpen(false);
            setModelModalOfs(null);
          }}
          onSave={handleSaveCurrentAsModel}
        />
```

- [ ] **Paso 7: `SaveAsModelModal.tsx` ofrece actualizar o guardar como nuevo**

Archivo completo:

```tsx
import { ModelDialog } from '../common/ModelDialog';
import { useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Save, X } from 'lucide-react';
import type { ActiveModel, AssignmentModel, OfBlock } from '../../types';
import { formatNumber } from '../../utils';
import { hasQuantity } from '../../quantities';

type SaveMode = 'update' | 'new';

export function SaveAsModelModal({
  ofs,
  sourceModel = null,
  onClose,
  onSave
}: {
  ofs: OfBlock[];
  sourceModel?: ActiveModel | null;
  onClose: () => void;
  onSave: (modelData: Partial<AssignmentModel>, mode: SaveMode) => Promise<void>;
}) {
  const canUpdate = Boolean(sourceModel?.updatable);
  const initialName = canUpdate ? sourceModel?.name ?? '' : '';
  const initialDescription = canUpdate ? sourceModel?.description ?? '' : '';
  const [mode, setMode] = useState<SaveMode>(canUpdate ? 'update' : 'new');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Convert current OF blocks to Model Parts
  const partsToSave = useMemo(() => ofs
    .filter((ofBlock) => ofBlock.materials.length > 0 || ofBlock.of.trim() || ofBlock.description.trim())
    .map((ofBlock, index) => ({
      id: ofBlock.id,
      name: ofBlock.description.trim() || (ofBlock.of.trim() ? `OF ${ofBlock.of.trim()}` : `Parte ${index + 1}`),
      // La descripción de la parte de origen manda: así el nombre no crece en cada ida y vuelta
      description: ofBlock.partDescription !== undefined
        ? ofBlock.partDescription
        : ofBlock.of.trim() ? `Originado de OF ${ofBlock.of.trim()}` : '',
      materials: ofBlock.materials.map((m) => ({
        id: m.id,
        code: m.code,
        description: m.description,
        quantity: m.quantity,
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    })), [ofs]);

  function chooseMode(next: SaveMode) {
    setMode(next);
    if (!sourceModel) return;
    const copyName = `${sourceModel.name} (copia)`;
    if (next === 'new' && name === sourceModel.name) setName(copyName);
    if (next === 'update' && name === copyName) setName(sourceModel.name);
  }

  function requestClose() {
    if (isSaving) return;
    const dirty = name !== initialName || description !== initialDescription;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    onClose();
  }

  async function handleConfirm() {
    if (!name.trim()) {
      setError('Debes especificar un nombre para el modelo.');
      nameRef.current?.focus();
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), parts: partsToSave }, mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el modelo.');
    } finally {
      setIsSaving(false);
    }
  }

  const isUpdate = mode === 'update';

  return (
    <ModelDialog className="save-as-model-modal" labelledBy="save-model-title" onClose={requestClose} busy={isSaving}>
        <div className="modal-header">
          <div className="modal-icon">
            <BookmarkPlus aria-hidden="true" />
          </div>
          <div>
            <h2 id="save-model-title">{isUpdate ? 'Actualizar modelo' : 'Guardar como modelo'}</h2>
            <p className="modal-subtitle">
              {isUpdate
                ? 'Guarda las partes y materiales actuales en el modelo que cargaste.'
                : 'Reutiliza estas partes y materiales en futuras asignaciones.'}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={requestClose} disabled={isSaving} title="Cerrar" aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        {error && <div className="modal-error-banner" role="alert">{error}</div>}

        {sourceModel && (
          <fieldset className="save-mode-options">
            <legend className="sr-only">Cómo guardar</legend>
            <label className={`save-mode-option${canUpdate ? '' : ' disabled'}`}>
              <input
                type="radio"
                name="modelSaveMode"
                checked={isUpdate}
                disabled={!canUpdate}
                onChange={() => chooseMode('update')}
              />
              <span>
                <strong>Actualizar “{sourceModel.name}”</strong>
                <em>{sourceModel.reason ?? 'Guarda los cambios en el modelo que cargaste.'}</em>
              </span>
            </label>
            <label className="save-mode-option">
              <input type="radio" name="modelSaveMode" checked={!isUpdate} onChange={() => chooseMode('new')} />
              <span>
                <strong>Guardar como modelo nuevo</strong>
                <em>El modelo original no cambia.</em>
              </span>
            </label>
          </fieldset>
        )}

        <div className="model-editor-fields">
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
          <label className="field">
            <span>Descripción o notas</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: Estructura completa con lonas perimetrales y fijaciones"
            />
          </label>
        </div>

        <div className="save-as-model-preview">
          <h4>Partes que se incluirán en el modelo ({partsToSave.length}):</h4>
          <div className="save-as-model-parts-list">
            {partsToSave.map((part, index) => (
              <div key={part.id} className="save-as-part-item">
                <div className="save-as-part-head">
                  <span className="of-tag">Parte {index + 1}</span>
                  <strong>{part.name}</strong>
                  <span>({part.materials.length} materiales)</span>
                </div>
                <div className="save-as-materials-tags">
                  {part.materials.map((m) => (
                    <span key={m.id} className={`material-pill${hasQuantity(m.quantity) ? '' : ' missing'}`}>
                      {m.code} ({hasQuantity(m.quantity) ? `x${formatNumber(m.quantity)}` : 'sin cantidad'})
                    </span>
                  ))}
                  {part.materials.length === 0 && <span className="empty-pill">Sin materiales</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-actions">
            <button className="button button-muted" type="button" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || partsToSave.length === 0}
            >
              <Save aria-hidden="true" />
              {isSaving ? 'Guardando…' : isUpdate ? 'Actualizar modelo' : 'Guardar modelo'}
            </button>
          </div>
        </div>
    </ModelDialog>
  );
}
```

- [ ] **Paso 8: Mismo selector en `SaveDraftModal.tsx`**

Sustituir el bloque `{isEditingExisting && ( <div style={{ marginBottom: 6, … }}> … </div> )}` por:

```tsx
        {isEditingExisting && (
          <fieldset className="save-mode-options">
            <legend className="sr-only">Cómo guardar</legend>
            <label className="save-mode-option">
              <input type="radio" name="draftMode" checked={!saveAsNew} onChange={() => setSaveAsNew(false)} />
              <span>
                <strong>Actualizar este borrador</strong>
                <em>Guarda los cambios encima del borrador que abriste.</em>
              </span>
            </label>
            <label className="save-mode-option">
              <input type="radio" name="draftMode" checked={saveAsNew} onChange={() => setSaveAsNew(true)} />
              <span>
                <strong>Guardar como copia nueva</strong>
                <em>El borrador original no cambia.</em>
              </span>
            </label>
          </fieldset>
        )}
```

(Antes los radios iban con estilos en línea y heredaban `input { width: 100% }`.)

- [ ] **Paso 9: Estilos, al final de `src/client/styles/models.css`**

```css
/* Elegir entre actualizar el registro de origen o crear uno nuevo (modelos y borradores) */
.save-mode-options {
  display: grid;
  gap: 8px;
  margin: 0;
  border: 0;
  padding: 0;
}

.save-mode-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-m);
  padding: 10px 12px;
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}

.save-mode-option:has(input:checked) {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}

.save-mode-option.disabled {
  cursor: not-allowed;
  opacity: 0.8;
}

.save-mode-option input {
  width: 16px;
  height: 16px;
  min-height: 16px;
  flex: 0 0 16px;
  margin: 2px 0 0;
  padding: 0;
  accent-color: var(--accent);
}

.save-mode-option span {
  display: grid;
  gap: 2px;
}

.save-mode-option strong {
  font-size: 13.5px;
}

.save-mode-option em {
  color: var(--ink-3);
  font-size: 12px;
  font-style: normal;
}

.save-mode-option.disabled em {
  color: var(--warn-ink);
}
```

- [ ] **Paso 10: Verificar y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client tests/activeModel.test.js
git commit -F - <<'EOF'
feat: "Guardar como modelo" puede actualizar el modelo de origen

El formulario recuerda de qué modelo viene. Si se cargó completo, ×1 y
reemplazando, ofrece actualizarlo; si no, explica por qué no y solo deja
guardar como nuevo. El selector de modo de borradores pasa al mismo estilo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 11: Avisar si otra persona cambió el modelo o el borrador

**Archivos:**
- Crear: `src/client/components/common/useVersionedSave.tsx`
- Modificar: `src/client/components/common/ConfirmDialog.tsx` (acción secundaria)
- Modificar: `src/client/types.ts` (tipo `ActiveDraft`)
- Modificar: `src/client/App.tsx` (`activeDraft` con versión, tres guardados)
- Modificar: `src/client/components/drafts/DraftsView.tsx`
- Modificar: `src/client/components/models/ModelsView.tsx`

**Interfaces:**
- Consume: `PUT` con `expectedUpdatedAt` y respuesta 409 `{ error, current }` (Tareas 4 y 5).
- Produce: `useVersionedSave(): { saveVersioned<T>(options: VersionedSaveOptions): Promise<{ record: T; created: boolean }>, conflictDialog: ReactNode }`, `class SaveCancelledError extends Error`, `ConfirmDialog` con `secondaryLabel?`, `onSecondary?` e `initialFocus?: 'confirm' | 'cancel'`.

- [ ] **Paso 1: Acción secundaria y foco inicial en `ConfirmDialog.tsx`**

Añadir a las props (y desestructurarlas junto a las demás):

```ts
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Dónde cae el foco al abrir. En un conflicto, nunca en la acción que pisa trabajo ajeno. */
  initialFocus?: 'confirm' | 'cancel';
```

con `initialFocus = 'confirm'` como valor por defecto. Junto a `confirmRef`:

```ts
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Se lee una vez al montar; un ref evita reejecutar el efecto (y el aviso de dependencias)
  const initialFocusRef = useRef(initialFocus);
```

`ref={cancelRef}` en el botón de cancelar, y en el efecto sustituir `confirmRef.current?.focus();` por:

```ts
    (initialFocusRef.current === 'cancel' ? cancelRef : confirmRef).current?.focus();
```

En `modal-actions`, entre "Cancelar" y el botón de confirmar:

```tsx
          {secondaryLabel && onSecondary && (
            <button className="button button-muted" type="button" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
```
- [ ] **Paso 2: Crear `useVersionedSave.tsx`**

```tsx
import { useCallback, useState, type ReactNode } from 'react';
import { historyDateFormat } from '../../utils';
import { ConfirmDialog } from './ConfirmDialog';

type Kind = 'modelo' | 'borrador';
type Resolution = 'overwrite' | 'new' | 'cancel';
type VersionedRecord = { id: string; name: string; updatedAt?: string; createdAt?: string };

/** El usuario prefirió no guardar al ver que otra persona había cambiado el registro. */
export class SaveCancelledError extends Error {}

export type VersionedSaveOptions = {
  kind: Kind;
  collectionUrl: '/api/models' | '/api/drafts';
  responseKey: 'model' | 'draft';
  id: string;
  name: string;
  body: Record<string, unknown>;
  /** Versión que se cargó. Sin ella se guarda sin comprobar. */
  expectedUpdatedAt?: string | null;
};

type PendingConflict = {
  kind: Kind;
  name: string;
  changedAt: string | null;
  resolve: (resolution: Resolution) => void;
};

async function send(url: string, method: 'PUT' | 'POST', body: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/**
 * Guarda encima de un registro comprobando que nadie lo cambió desde que se cargó.
 * Si chocó, pregunta: sobrescribir, guardar como nuevo o cancelar.
 */
export function useVersionedSave(): {
  saveVersioned: <T extends VersionedRecord>(options: VersionedSaveOptions) => Promise<{ record: T; created: boolean }>;
  conflictDialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingConflict | null>(null);

  const saveVersioned = useCallback(async <T extends VersionedRecord>(
    options: VersionedSaveOptions
  ): Promise<{ record: T; created: boolean }> => {
    const { kind, collectionUrl, responseKey, id, name, body, expectedUpdatedAt } = options;
    const recordUrl = `${collectionUrl}/${encodeURIComponent(id)}`;
    const failure = (data: { error?: string }) => new Error(data.error || `No se pudo guardar el ${kind}.`);

    const first = await send(recordUrl, 'PUT', { ...body, expectedUpdatedAt: expectedUpdatedAt || undefined });
    if (first.response.ok) return { record: first.data[responseKey] as T, created: false };
    if (first.response.status !== 409) throw failure(first.data);

    const resolution = await new Promise<Resolution>((resolve) => {
      setPending({ kind, name, changedAt: first.data.current?.updatedAt ?? null, resolve });
    });
    setPending(null);

    if (resolution === 'cancel') {
      throw new SaveCancelledError(`No se ha guardado: este ${kind} lo ha modificado otra persona.`);
    }

    if (resolution === 'overwrite') {
      // Sin expectedUpdatedAt: el servidor guarda sin comprobar
      const retry = await send(recordUrl, 'PUT', body);
      if (!retry.response.ok) throw failure(retry.data);
      return { record: retry.data[responseKey] as T, created: false };
    }

    const copyBody: Record<string, unknown> = { ...body, name: `${name} (copia)` };
    delete copyBody.id;
    const copy = await send(collectionUrl, 'POST', copyBody);
    if (!copy.response.ok) throw failure(copy.data);
    return { record: copy.data[responseKey] as T, created: true };
  }, []);

  const conflictDialog = pending ? (
    <ConfirmDialog
      title={`Otra persona ha modificado este ${pending.kind}`}
      description={
        <>
          <strong>“{pending.name}”</strong> se guardó{' '}
          {pending.changedAt ? `el ${historyDateFormat.format(new Date(pending.changedAt))}` : 'de nuevo'},
          después de que lo abrieras. Si sobrescribes, se perderán esos cambios.
        </>
      }
      confirmLabel="Sobrescribir"
      secondaryLabel="Guardar como nuevo"
      initialFocus="cancel"
      onSecondary={() => pending.resolve('new')}
      onCancel={() => pending.resolve('cancel')}
      onConfirm={() => pending.resolve('overwrite')}
    />
  ) : null;

  return { saveVersioned, conflictDialog };
}
```

- [ ] **Paso 3: `activeDraft` lleva su versión**

En `src/client/types.ts`:

```ts
/** Borrador abierto en el formulario. `updatedAt` es la versión que se cargó. */
export type ActiveDraft = {
  id: string;
  name: string;
  notes?: string;
  orderCode?: string;
  updatedAt: string;
};
```

En `App.tsx`: importar `ActiveDraft`; `useState<ActiveDraft | null>(null)` para `activeDraft`; y, fuera del componente, junto a `createOf`:

```ts
function toActiveDraft(draft: OrderDraft): ActiveDraft {
  return { id: draft.id, name: draft.name, notes: draft.notes, orderCode: draft.orderCode, updatedAt: draft.updatedAt };
}
```

En `resumeDraft`, `setActiveDraft({ id: draft.id, … })` pasa a `setActiveDraft(toActiveDraft(draft));`.

- [ ] **Paso 4: Los tres guardados de `App.tsx`**

Imports: `import { SaveCancelledError, useVersionedSave } from './components/common/useVersionedSave';`. Dentro de `App`, junto a `useToasts`:

```ts
  const { saveVersioned, conflictDialog } = useVersionedSave();
```

`handleQuickSaveDraft`:

```ts
  async function handleQuickSaveDraft() {
    if (!activeDraft?.id) {
      setIsSaveDraftOpen(true);
      return;
    }

    try {
      const { record, created } = await saveVersioned<OrderDraft>({
        kind: 'borrador',
        collectionUrl: '/api/drafts',
        responseKey: 'draft',
        id: activeDraft.id,
        name: activeDraft.name,
        body: { id: activeDraft.id, name: activeDraft.name, orderCode, notes: activeDraft.notes, ofs },
        expectedUpdatedAt: activeDraft.updatedAt
      });
      setActiveDraft(toActiveDraft(record));
      setDraftsVersion((v) => v + 1);
      pushToast(
        created ? `Guardado como borrador nuevo: "${record.name}".` : `Borrador "${record.name}" actualizado con éxito.`,
        'ok'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Error al guardar el borrador.',
        err instanceof SaveCancelledError ? 'warn' : 'error'
      );
    }
  }
```

`handleSaveDraftModal`:

```ts
  async function handleSaveDraftModal(data: {
    id?: string;
    name: string;
    orderCode: string;
    notes?: string;
    ofs: OfBlock[];
  }) {
    let savedDraft: OrderDraft;
    let updated = false;

    if (data.id) {
      const { record, created } = await saveVersioned<OrderDraft>({
        kind: 'borrador',
        collectionUrl: '/api/drafts',
        responseKey: 'draft',
        id: data.id,
        name: data.name,
        body: { ...data },
        expectedUpdatedAt: activeDraft?.id === data.id ? activeDraft.updatedAt : undefined
      });
      savedDraft = record;
      updated = !created;
    } else {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.error || 'No se pudo guardar el borrador.');
      savedDraft = responseData.draft;
    }

    setActiveDraft(toActiveDraft(savedDraft));
    setDraftsVersion((v) => v + 1);
    pushToast(
      updated ? `Borrador "${savedDraft.name}" actualizado con éxito.` : `Borrador "${savedDraft.name}" guardado.`,
      'ok'
    );
  }
```

En `handleSaveCurrentAsModel`, sustituir la rama de actualización (el `fetch` con `PUT`) por:

```ts
    if (mode === 'update' && fromForm && activeModel?.updatable) {
      const { record, created } = await saveVersioned<AssignmentModel>({
        kind: 'modelo',
        collectionUrl: '/api/models',
        responseKey: 'model',
        id: activeModel.id,
        name: modelData.name || activeModel.name,
        body: { ...modelData },
        expectedUpdatedAt: activeModel.updatedAt
      });
      setActiveModel(
        created
          ? describeActiveModel(record, { multiplier: 1, partsLoaded: record.parts.length, appendedToOtherOfs: false })
          : { ...activeModel, name: record.name, description: record.description || '', updatedAt: record.updatedAt || activeModel.updatedAt }
      );
      pushToast(created ? `Guardado como modelo nuevo: "${record.name}".` : `Modelo "${record.name}" actualizado.`, 'ok');
      return;
    }
```

Y al final del JSX, antes de `<ToastViewport …/>`:

```tsx
      {conflictDialog}
```

- [ ] **Paso 5: `DraftsView.tsx`**

Imports: `import { useVersionedSave } from '../common/useVersionedSave';`. Dentro del componente:

```ts
  const { saveVersioned, conflictDialog } = useVersionedSave();
```

`handleSaveEditedDraft` (además corrige que "Guardar como copia nueva" actualizaba el original):

```ts
  async function handleSaveEditedDraft(updatedData: {
    id?: string;
    name: string;
    orderCode: string;
    notes?: string;
    ofs: OfBlock[];
  }) {
    if (!draftToEdit?.id) return;
    const body = { ...draftToEdit, name: updatedData.name, orderCode: updatedData.orderCode, notes: updatedData.notes };

    if (!updatedData.id) {
      // El usuario eligió "Guardar como copia nueva"
      const copy: Record<string, unknown> = { ...body };
      delete copy.id;
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copy)
      });
      if (!response.ok) throw new Error('No se pudo guardar la copia del borrador.');
      pushToast(`Copia guardada como "${updatedData.name}".`, 'ok');
    } else {
      const { created } = await saveVersioned<OrderDraft>({
        kind: 'borrador',
        collectionUrl: '/api/drafts',
        responseKey: 'draft',
        id: draftToEdit.id,
        name: updatedData.name,
        body,
        expectedUpdatedAt: draftToEdit.updatedAt
      });
      pushToast(created ? `Guardado como borrador nuevo: "${updatedData.name} (copia)".` : 'Borrador actualizado.', 'ok');
    }

    setDraftToEdit(null);
    fetchDrafts();
  }
```

Al final del JSX, antes del cierre de `</section>`: `{conflictDialog}`.

- [ ] **Paso 6: `ModelsView.tsx`**

Imports: `import { useVersionedSave } from '../common/useVersionedSave';`. Dentro del componente:

```ts
  const { saveVersioned, conflictDialog } = useVersionedSave();
```

`handleSaveModel`:

```ts
  async function handleSaveModel(modelData: Partial<AssignmentModel>) {
    if (modelData.id) {
      const { created } = await saveVersioned<AssignmentModel>({
        kind: 'modelo',
        collectionUrl: '/api/models',
        responseKey: 'model',
        id: modelData.id,
        name: modelData.name || '',
        body: { ...modelData },
        expectedUpdatedAt: modelToEdit?.updatedAt || modelToEdit?.createdAt
      });
      pushToast(created ? `Guardado como modelo nuevo: "${modelData.name} (copia)".` : 'Modelo actualizado correctamente.', 'ok');
    } else {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelData)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo guardar el modelo.');
      }
      pushToast('Nuevo modelo creado con éxito.', 'ok');
    }
    fetchModels();
  }
```

Al final del JSX, antes de `</section>`: `{conflictDialog}`.

- [ ] **Paso 7: Verificar y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client
git commit -F - <<'EOF'
feat: avisar si otra persona cambió el modelo o borrador antes de guardar encima

Cada actualización envía la versión que se cargó; si cambió, se ofrece
sobrescribir, guardar como nuevo o cancelar. Corrige además que en Borradores
"Guardar como copia nueva" actualizaba el original.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 12: Verificación de punta a punta en local

**Archivos:**
- Crear (temporal, se borra al terminar): `.tmp-rps/verificar-cantidades.mjs`

Nada de esta tarea se commitea. Usa la carpeta `.tmp-rps/`, que tiene permiso para ejecutar `node`.

- [ ] **Paso 1: Copiar los datos locales y arrancar el servidor contra carpetas temporales**

PowerShell:

```powershell
$proj = "C:\Users\ivan.sanchez\Documents\Proyectos DEV\materiales-ot"
$tmp = "$env:TEMP\mot-verify-cantidades"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$tmp\export","$tmp\archive","$tmp\data-backup" | Out-Null
Copy-Item "$proj\data\*.json" "$tmp\data-backup\" -Force
$hadBackups = Test-Path "$proj\data\backups"
Set-Content "$tmp\had-backups.txt" $hadBackups
$env:EXPORT_DIRECTORY = "$tmp\export"; $env:ORDER_ARCHIVE_ROOT = "$tmp\archive"; $env:PORT = "3100"; $env:NODE_ENV = "production"
Set-Location $proj
npm run build
node src/server.js
```

(en segundo plano). Comprobar antes de seguir:

```powershell
(Invoke-RestMethod http://127.0.0.1:3100/api/health).paths.exportDirectory.type   # → local-or-mounted
```

- [ ] **Paso 2: Crear `.tmp-rps/verificar-cantidades.mjs`**

```js
// Verificación de punta a punta: API + interfaz real por Chrome headless (CDP).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [base, exportDir, shotsDir] = process.argv.slice(2);
fs.mkdirSync(shotsDir, { recursive: true });
const paso = (texto) => console.log(`✔ ${texto}`);
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, url, body) {
  const response = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

// ---------- API ----------
const creado = await api('POST', '/api/models', {
  name: 'ZZ Prueba cantidades',
  parts: [{
    name: 'Faldón',
    description: 'Descripción original',
    materials: [
      { code: 'NS86B1NEGRP250', description: 'Lona', quantity: null },
      { code: 'OLLAOLPN14', description: 'Ollao', quantity: 4 }
    ]
  }]
});
assert.equal(creado.status, 201);
const modelo = creado.data.model;
assert.equal(modelo.parts[0].materials[0].quantity, null);
paso('un modelo se guarda con una línea sin cantidad');

assert.equal((await api('POST', '/api/models', { name: 'ZZ malo', parts: [{ name: 'P', materials: [{ code: 'X', quantity: -1 }] }] })).status, 400);
paso('una cantidad negativa da 400');

const borrador = await api('POST', '/api/drafts', { name: 'ZZ borrador', ofs: [{ of: '', description: 'P', materials: [{ code: 'X1', quantity: '' }] }] });
assert.equal(borrador.data.draft.ofs[0].materials[0].quantity, null);
paso('un borrador guarda la línea vacía como null');

const v1 = await api('PUT', `/api/models/${modelo.id}`, { ...modelo, expectedUpdatedAt: modelo.updatedAt });
assert.equal(v1.status, 200);
const choque = await api('PUT', `/api/models/${modelo.id}`, { ...modelo, expectedUpdatedAt: modelo.updatedAt });
assert.equal(choque.status, 409);
assert.ok(choque.data.current);
paso('una segunda escritura con la versión vieja da 409 con el registro actual');

const reserva = await api('POST', '/api/export/save', { orderCode: '', ofs: [{ of: '999001', description: 'P', materials: [{ code: 'X1', description: 'x', quantity: null }] }] });
assert.equal(reserva.status, 400);
assert.equal(reserva.data.error, 'Falta la cantidad de X1 en la OF 999001.');
assert.equal(fs.readdirSync(exportDir).length, 0);
paso('el servidor bloquea la reserva sin cantidad y no escribe nada');

// ---------- Interfaz (Chrome headless por CDP) ----------
const puerto = 9336;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${path.join(os.tmpdir(), `chrome-qty-${Date.now()}`)}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

let wsUrl;
for (let i = 0; i < 40 && !wsUrl; i += 1) {
  try {
    const paginas = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
    wsUrl = paginas.find((p) => p.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* Chrome aún arrancando */ }
  if (!wsUrl) await espera(300);
}
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let siguiente = 0;
const pendientes = new Map();
ws.addEventListener('message', (evento) => {
  const mensaje = JSON.parse(evento.data);
  const p = pendientes.get(mensaje.id);
  if (!p) return;
  pendientes.delete(mensaje.id);
  mensaje.error ? p.reject(new Error(JSON.stringify(mensaje.error))) : p.resolve(mensaje.result);
});
const cdp = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++siguiente;
  pendientes.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function enPagina(expresion) {
  const r = await cdp('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function foto(nombre) {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(shotsDir, `${nombre}.png`), Buffer.from(data, 'base64'));
}

// Utilidades que viven dentro de la página
const AYUDAS = `
  window.__clic = (selector, texto) => {
    const candidatos = [...document.querySelectorAll(selector)].filter((el) => !texto || el.textContent.includes(texto));
    const el = candidatos.at(-1);
    if (!el) throw new Error('No encuentro ' + selector + ' ' + (texto || ''));
    el.click();
  };
  window.__escribir = (el, valor) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  };
  window.__dialogoArriba = () => [...document.querySelectorAll('dialog[open]')].at(-1);
`;

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: base + '/' });
await espera(2500);
await enPagina('localStorage.clear(); location.reload();');
await espera(3000);
await enPagina(AYUDAS);
await enPagina(`document.documentElement.dataset.theme = 'dark'`);

// Usar el modelo ×1, completo y reemplazando
await enPagina(`__clic('.app-tabs button', 'Modelos')`);
await espera(1200);
await foto('01-modelos-chapa');
assert.ok(await enPagina(`[...document.querySelectorAll('.model-card')].some((c) => c.textContent.includes('ZZ Prueba cantidades') && c.querySelector('.missing-chip'))`));
paso('la tarjeta del modelo muestra la chapa "sin cantidad"');
await enPagina(`(() => { const card = [...document.querySelectorAll('.model-card')].find((c) => c.textContent.includes('ZZ Prueba cantidades')); card.querySelector('.model-use-button').click(); })()`);
await espera(600);
await enPagina(`(() => { const caja = [...__dialogoArriba().querySelectorAll('.transfer-mode-selector input[type=checkbox]')][0]; if (!caja.checked) caja.click(); })()`);
await enPagina(`__clic('dialog[open] .modal-actions .button-primary')`);
await espera(1200);
await foto('02-asignacion-sin-cantidad');
assert.equal(await enPagina(`document.querySelectorAll('.quantity-cell-input.quantity-missing').length`), 1);
assert.equal(await enPagina(`document.querySelector('.quantity-cell-input.quantity-missing').value`), '');
assert.match(await enPagina(`document.querySelector('.missing-hint').textContent`), /1 línea sin cantidad/);
paso('al volcar, la línea llega vacía, marcada y contada en el resumen');

// Alta sin cantidad desde el buscador de la OF
await enPagina(`(() => { const input = document.querySelector('.line-editor .article-search input'); __escribir(input, 'ARANCCLPN30'); })()`);
await espera(400);
await enPagina(`__clic('.line-editor .button-secondary')`);
await espera(600);
assert.equal(await enPagina(`document.querySelectorAll('.quantity-cell-input.quantity-missing').length`), 2);
paso('se añade un artículo sin cantidad desde el buscador de la OF');

// Generar: aviso, sin archivos, y la fila lleva a su campo
await enPagina(`__escribir(document.querySelector('.of-number input'), '999001')`);
await enPagina(`__clic('.summary-panel .button-primary', 'Generar')`);
await espera(700);
await foto('03-aviso-faltan-cantidades');
assert.equal(await enPagina(`Boolean(document.querySelector('#missing-title'))`), true);
assert.equal(fs.readdirSync(exportDir).length, 0);
paso('generar con huecos abre el aviso y no escribe nada');
await enPagina(`document.querySelector('.missing-item').click()`);
await espera(700);
assert.equal(await enPagina(`Boolean(document.querySelector('#missing-title'))`), false);
assert.ok(await enPagina(`Boolean(document.activeElement?.dataset?.lineId)`));
paso('pulsar una fila cierra el aviso y deja el foco en su campo');

// Guardar como modelo: "Actualizar" activo
await enPagina(`__clic('.summary-panel button', 'Guardar como modelo')`);
await espera(700);
await foto('04-actualizar-modelo');
assert.equal(await enPagina(`__dialogoArriba().querySelector('input[name=modelSaveMode]').checked`), true);
assert.equal(await enPagina(`__dialogoArriba().querySelector('input[name=modelSaveMode]').disabled`), false);
paso('"Actualizar" sale activo y marcado tras una carga completa ×1');

// Conflicto: otra "persona" cambia el modelo y luego guardamos encima
const actual = (await api('GET', `/api/models/${modelo.id}`)).data.model;
await api('PUT', `/api/models/${modelo.id}`, { ...actual, description: 'Cambio de otra persona' });
await enPagina(`__clic('dialog[open] .modal-actions .button-primary')`);
await espera(900);
await foto('05-conflicto');
assert.match(await enPagina(`__dialogoArriba().textContent`), /Otra persona ha modificado este modelo/);
await enPagina(`__clic('dialog[open] .modal-actions .button-muted', 'Cancelar')`);
await espera(700);
assert.match(await enPagina(`document.querySelector('.modal-error-banner')?.textContent || ''`), /No se ha guardado/);
paso('el conflicto avisa y "Cancelar" no guarda nada');
await enPagina(`__clic('dialog[open] .modal-actions .button-primary')`);
await espera(900);
await enPagina(`__clic('dialog[open] .modal-actions .button-danger', 'Sobrescribir')`);
await espera(1200);
const tras = (await api('GET', `/api/models/${modelo.id}`)).data.model;
assert.equal(tras.parts.length, 1);
assert.equal(tras.parts[0].name, 'Faldón');
assert.equal(tras.parts[0].description, 'Descripción original');
assert.equal(tras.parts[0].materials.length, 3);
paso('"Sobrescribir" guarda, sin alargar el nombre de la parte y con su descripción original');

// Rellenar las cantidades y generar de verdad (carpeta temporal)
await enPagina(`(() => { for (const input of document.querySelectorAll('.quantity-cell-input.quantity-missing')) { input.focus(); __escribir(input, '2'); input.blur(); } })()`);
await espera(600);
await enPagina(`__clic('.summary-panel .button-primary', 'Generar')`);
await espera(2500);
assert.ok(fs.readdirSync(exportDir).length > 0);
paso('con todas las cantidades, la asignación se genera en la carpeta temporal');

// Borradores: chapa y selector de modo con radios de tamaño normal
await enPagina(`__clic('.app-tabs button', 'Borradores')`);
await espera(1200);
await foto('06-borradores-chapa');
assert.ok(await enPagina(`[...document.querySelectorAll('.draft-card')].some((c) => c.textContent.includes('ZZ borrador') && c.querySelector('.missing-chip'))`));
paso('la tarjeta del borrador muestra la chapa "sin cantidad"');

ws.close();
chrome.kill();

// ---------- Limpieza de los datos de prueba ----------
for (const m of (await api('GET', '/api/models')).data.models.filter((x) => x.name.startsWith('ZZ'))) await api('DELETE', `/api/models/${m.id}`);
for (const d of (await api('GET', '/api/drafts')).data.drafts.filter((x) => x.name.startsWith('ZZ'))) await api('DELETE', `/api/drafts/${d.id}`);
console.log('\nTodo verificado. Capturas en', shotsDir);
```

- [ ] **Paso 3: Ejecutar la verificación**

```bash
node .tmp-rps/verificar-cantidades.mjs "http://127.0.0.1:3100" "$TEMP/mot-verify-cantidades/export" "$TEMP/mot-verify-cantidades/shots"
```

Esperado: 15 líneas `✔` y "Todo verificado". Revisar a ojo las 6 capturas: hueco amarillo, chapas, aviso, selector de modo con radios pequeños, diálogo de conflicto.

- [ ] **Paso 4: Dejar todo como estaba**

PowerShell:

```powershell
$tmp = "$env:TEMP\mot-verify-cantidades"
$proj = "C:\Users\ivan.sanchez\Documents\Proyectos DEV\materiales-ot"
$pid3100 = (Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
if ($pid3100) { Stop-Process -Id $pid3100 -Force }
Copy-Item "$tmp\data-backup\*.json" "$proj\data\" -Force
if ((Get-Content "$tmp\had-backups.txt") -eq 'False') { Remove-Item -Recurse -Force "$proj\data\backups" -ErrorAction SilentlyContinue }
Remove-Item -Recurse -Force "$tmp", "$proj\.tmp-rps" -ErrorAction SilentlyContinue
netstat -ano | Select-String ':3100.*LISTENING'   # → nada
git -C $proj status --short                         # → limpio
```

---

### Tarea 13: Publicar, desplegar y corregir el velcro en producción

**Archivos:**
- Modificar: `package.json` (`"version": "0.1.0"` → `"0.2.0"`)
- Crear (temporal): `.tmp-rps/arreglar-velcro.mjs`

- [ ] **Paso 1: Subir la versión y publicar**

```bash
npm pkg set version=0.2.0
npm run lint && npx tsc --noEmit && npm test && npm run build
git add package.json
git commit -F - <<'EOF'
chore: versión 0.2.0 (cantidades opcionales y actualizar modelos)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push origin main
```

- [ ] **Paso 2: Desplegar (lo hace Ivan en el servidor)**

```bash
cd /webs/materiales-ot
git pull
pnpm build
pm2 restart materiales-ot
curl -s http://localhost:4200/api/health
```

Esperado: `"version":"0.2.0"`, `"database":true` y rutas `"local-or-mounted"`. No hace falta `pnpm install`: no hay dependencias nuevas.

- [ ] **Paso 3: Crear `.tmp-rps/arreglar-velcro.mjs`**

```js
// Pasa a "sin cantidad" los 0,000001 que se teclearon cuando la web no admitía vacío.
// Se niega a correr contra un servidor anterior a 0.2.0: ese convertiría el null en 1.
const base = 'http://192.168.0.90:4200';

const health = await (await fetch(`${base}/api/health`)).json();
if (health.version !== '0.2.0') {
  console.log(`Producción está en ${health.version ?? 'una versión sin número'}; despliega 0.2.0 antes. No se toca nada.`);
  process.exit(1);
}

const { models } = await (await fetch(`${base}/api/models`)).json();
for (const model of models) {
  let cambios = 0;
  for (const part of model.parts) {
    for (const material of part.materials) {
      if (typeof material.quantity === 'number' && material.quantity > 0 && material.quantity < 0.00001) {
        console.log(`${model.name} → ${part.name} → ${material.code}: ${material.quantity} → sin cantidad`);
        material.quantity = null;
        cambios += 1;
      }
    }
  }
  if (!cambios) continue;
  const response = await fetch(`${base}/api/models/${model.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...model, expectedUpdatedAt: model.updatedAt })
  });
  const data = await response.json();
  if (!response.ok) {
    console.log(`No se guardó "${model.name}": ${data.error}`);
    process.exit(1);
  }
  const quedan = data.model.parts.flatMap((p) => p.materials).filter((m) => m.quantity !== null && m.quantity < 0.00001);
  console.log(`"${model.name}" actualizado; cantidades fantasma restantes: ${quedan.length}`);
}
```

- [ ] **Paso 4: Ejecutarlo, comprobar y limpiar**

```bash
node .tmp-rps/arreglar-velcro.mjs
```

Esperado: una línea `Escenario Orquesta ODL 720 EE → Viseras delantera → VESHFNEGR50MM: 0.000001 → sin cantidad` y `cantidades fantasma restantes: 0`. Después borrar `.tmp-rps/` y comprobar en la web que el modelo muestra la chapa "1 sin cantidad".

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| 1. Guardar sin cantidad (`null`, fuera el `|| 1` y el mínimo; 400 a lo inválido) | 2, 4, 5 |
| Tipos `number \| null`; sumas tratan `null` como 0 | 6, 7 |
| 2. Campos sin mínimo; alta sin cantidad por todas las vías; borrar la cantidad en la tabla | 8 |
| `null × multiplicador = null`; validador del multiplicador ignora vacíos | 6, 7 |
| 3. Distintivo y chapas; aviso de bloqueo; mensaje del servidor | 1, 7, 9 |
| Lista clicable que lleva al campo | 9 |
| 4. `activeModel`, actualizable o con motivo; selector de modo; ida y vuelta sin degradar nombres | 10 |
| 5. Conflictos: protocolo, comprobación dentro de la cola, aviso con tres salidas | 3, 4, 5, 11 |
| 6. Instantáneas con ayudante compartido, fallos no bloquean, restauración documentada | 3, 4, 5 |
| Datos existentes: velcro a `null` | 13 |
| Pruebas unitarias y funcionales | 1–6, 10, 12 |
