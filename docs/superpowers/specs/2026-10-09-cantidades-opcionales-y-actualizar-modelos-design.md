# Cantidades opcionales y actualizar modelos

**Fecha:** 2026-10-09 · **Estado:** aprobado por Ivan, pendiente de plan

## Problema

Un modelo o un borrador es, sobre todo, una **lista de artículos**. La cantidad se decide al reservar, para cada pedido. Hoy la web no lo permite:

- Los campos de cantidad exigen un mínimo de `0.000001` y el servidor de modelos lo fuerza al guardar ([models.js:94](../../../src/models.js#L94)).
- Peor: si la cantidad llega **vacía**, `models.js` guarda un **1** (`Number('') || 1`), sin avisar.
- Para que no se le borrara la línea, un compañero tecleó `0,000001` en un velcro del ODL 720 EE. Ese valor pasa la validación de la reserva (que solo rechaza `<= 0`) y acabaría en el `.xls` de RPS como si estuviera pedido.

Además, "Guardar como modelo" **siempre crea uno nuevo**: al usar un modelo, el formulario olvida de dónde venía. Así se acumularon cinco copias del ODL 720 en una tarde.

## Decisiones

| Tema | Decisión |
|---|---|
| Cómo se guarda "sin cantidad" | `null`. No `0`: el cero es ambiguo y se pinta como un dato. |
| Guardar modelos y borradores | Siempre permitido, con o sin cantidades. |
| Generar la asignación | **Bloqueado** si queda alguna línea sin cantidad. Aviso con la lista de artículos y OFs. |
| Distintivo visual | Sencillo: marca amarilla en la línea y chapa "N sin cantidad" en tarjetas. |
| Alta de artículos sin cantidad | Por todas las vías: modelo, borrador, pestaña Artículos y buscador de la OF. |
| Actualizar en vez de duplicar | Modelos igual que borradores: "Actualizar" por defecto, "Guardar como nuevo" opcional. |
| Dos personas actualizando lo mismo | Detección de conflictos: el segundo en guardar recibe aviso y elige sobrescribir o guardar como nuevo. |

## 1. Guardar sin cantidad

**Servidor.** Una función de saneado compartida para modelos y borradores:

- vacío, `null` o `undefined` → `null`
- número finito `>= 0` → ese número, redondeado como hoy
- `0` → `null` (un cero no es una cantidad útil y así no hay dos formas de decir "sin cantidad")
- negativo, `NaN`, texto o infinito → error 400 con el artículo y la parte

Se aplica en [models.js](../../../src/models.js) (hoy `Math.max(Number(q) || 1, 0.000001)`) y en [drafts.js:113](../../../src/drafts.js#L113) (hoy `Math.max(Number(q) || 0, 0)`). Las sumas de totales tratan `null` como 0 (`drafts.js:94` ya lo hace).

**Tipos.** `quantity: number | null` en `MaterialLine` y `ModelMaterial` ([types.ts](../../../src/client/types.ts)). El historial no cambia: solo guarda reservas ya validadas.

## 2. Montar la asignación sin cantidad

- **Campos de cantidad:** fuera el `min="0.000001"` de los cinco formularios. Un campo vacío es válido.
- **Alta a mano** (`addLine` y `addLineByOfValue` en [App.tsx](../../../src/client/App.tsx)): se acepta cantidad vacía; se sigue rechazando la negativa o no numérica.
- **Edición en la tabla de la OF** ([MaterialTable.tsx:87](../../../src/client/components/assignments/MaterialTable.tsx#L87)): hoy ignora cualquier valor que no sea `> 0`. Debe permitir **borrar** la cantidad (pasa a `null`).
- **Volcar un modelo** ([App.tsx:281](../../../src/client/App.tsx#L281)): `null × multiplicador = null`, nunca `0` ni `NaN`.
- **Validador del multiplicador** ([ModelTransferModal.tsx:27](../../../src/client/components/models/ModelTransferModal.tsx#L27)): hoy exige que **todas** las líneas den un positivo, así que un modelo con una línea vacía no se podría volcar. Debe ignorar las líneas `null`.
- **Sumas** (`App.tsx:194`, `DraftCard.tsx:38`, `SaveDraftModal.tsx:39`, `ModelTransferModal.tsx:56`): `null` cuenta como 0.

## 3. Aviso y bloqueo

**Distintivo.** Una línea sin cantidad se pinta con el hueco de cantidad vacío y borde amarillo (`--warn-*`, ya existe en tokens). Donde se lista una cantidad en solo lectura (`ModelCard`, `DraftCard`, `SaveAsModelModal`, `ModelTransferModal`) se muestra "sin cantidad" en gris, no "0".

**Chapas.** Las tarjetas de modelo y de borrador, y el panel de resumen de la asignación, muestran "N sin cantidad" cuando N > 0. Nada si N = 0.

**Bloqueo al generar.** Al pulsar "Generar asignación", si hay líneas sin cantidad, no se llama al servidor: se abre un aviso con la lista (OF, artículo) y un único botón para volver. El botón de generar no se desactiva antes —así el aviso dice qué falta en vez de un botón gris mudo.

**Defensa en el servidor.** [validation.js:30](../../../src/validation.js#L30) ya rechaza `<= 0`; se amplía a `null`/vacío con el mensaje "Falta la cantidad de {código} en la OF {of}." Cubre a cualquiera que llame a la API sin pasar por la pantalla.

## 4. Actualizar el modelo de origen

Hoy `handleTransferModelToAssignment` recibe partes y multiplicador, pero no el modelo. Se pasa también `{ id, name }` y el formulario guarda un `activeModel` junto al `activeDraft` existente.

`activeModel` se marca **actualizable** solo si la carga fue: todas las partes, multiplicador 1 y modo "reemplazar". Si no, se guarda igual pero no actualizable, con el motivo:

| Motivo | Por qué rompería el modelo |
|---|---|
| Multiplicador ≠ 1 | Guardaría las cantidades multiplicadas como base. |
| Solo algunas partes | El modelo perdería las partes no cargadas. |
| Añadido encima de otras OFs | El modelo ganaría OFs ajenas. |

`activeModel` se limpia al vaciar el formulario, al retomar un borrador o al usar otro modelo. Lo que se haga **después** de una carga válida —cambiar cantidades, añadir o quitar líneas, añadir o quitar partes— **no** lo invalida: es justo lo que se quiere guardar. Las tres trampas de arriba son de la **carga**, no de la edición.

**`SaveAsModelModal`** copia el patrón ya probado de `SaveDraftModal`: dos opciones, "Actualizar «{nombre}»" (marcada por defecto) y "Guardar como modelo nuevo". Si no es actualizable, la primera sale desactivada con su motivo en una línea. "Actualizar" hace `PUT /api/models/:id`, que ya existe.

**Borradores:** ya funcionan así (`activeDraft` + `saveAsNew` en `SaveDraftModal`). Solo se verifica.

## 5. Detección de conflictos

Al actualizar en el sitio aparece un riesgo que con las copias no existía: si dos personas tienen abierto el mismo modelo o borrador y guardan las dos, el segundo `PUT` borra sin aviso lo del primero.

**Protocolo.** Todo `PUT` de modelo o borrador envía `expectedUpdatedAt`: el `updatedAt` de la versión que se cargó. Dentro de la cola de escritura, `saveModel`/`saveDraft` lo comparan con el guardado:

- coinciden → se guarda como hoy y se devuelve el registro con su `updatedAt` nuevo
- no coinciden → error con `statusCode = 409` y mensaje "Lo ha modificado otra persona el {fecha}." El manejador de errores de [server.js:366](../../../src/server.js#L366) ya respeta `statusCode`; además devuelve el registro actual para que la web pueda mostrar la fecha
- no se envía → se guarda sin comprobar (compatibilidad con llamadas a la API hechas a mano)

La comparación va **dentro** de la cola de escritura, no antes: así dos peticiones simultáneas no pueden pasar las dos la comprobación.

**Cliente.** `activeModel` y `activeDraft` guardan también `updatedAt`, y lo renuevan con la respuesta de cada guardado correcto (si no, el segundo guardado de la misma persona chocaría consigo mismo). Las cinco llamadas que actualizan lo envían:

| Dónde | Qué actualiza |
|---|---|
| [App.tsx:370](../../../src/client/App.tsx#L370) | el borrador activo |
| [App.tsx:401](../../../src/client/App.tsx#L401) | borrador desde `SaveDraftModal` |
| [DraftsView.tsx:128](../../../src/client/components/drafts/DraftsView.tsx#L128) | borrador desde su editor |
| [ModelsView.tsx:72](../../../src/client/components/models/ModelsView.tsx#L72) | modelo desde su editor |
| `SaveAsModelModal` (nuevo) | el modelo de origen |

**Aviso.** Ante un 409, un diálogo: "Este modelo lo ha modificado otra persona el {fecha}, después de que lo abrieras." con tres salidas: **Sobrescribir** (repite el `PUT` sin `expectedUpdatedAt`), **Guardar como nuevo** (`POST` con el nombre + " (copia)") y **Cancelar** (no se guarda nada y lo editado sigue en pantalla). `ConfirmDialog` admite hoy dos botones; se le añade una acción secundaria opcional.

No hay usuarios en la app, así que el aviso dice **cuándo** cambió, no **quién**.

## Datos existentes

- La línea `VESHFNEGR50MM = 0.000001` del modelo "Escenario Orquesta ODL 720 EE" pasa a `null`. Es la única por debajo de 0,00001 entre modelos y borradores (comprobado en producción el 2026-10-09).
- Los `1` que `models.js` pudo inventar en el pasado no se distinguen de un 1 real. No se tocan.

## Pruebas

**Unitarias (`node --test`):**
- Saneado: vacío/`null`/`0` → `null`; `2.5` → `2.5`; negativo, `NaN` y texto → error.
- `models.js` y `drafts.js` guardan y devuelven `null` sin convertirlo.
- `validation.js` rechaza `null` y vacío con el mensaje nuevo; acepta cantidades válidas.
- Conflictos, en modelos y en borradores: `expectedUpdatedAt` igual → guarda; distinto → 409 y el archivo queda intacto; ausente → guarda. Dos `PUT` simultáneos con la misma fecha: uno guarda y el otro recibe 409.

**Funcionales (servidor local, carpetas temporales, capturas por CDP):**
- Guardar un modelo y un borrador con una línea vacía; recargar; la línea sigue ahí, vacía.
- Volcar ese modelo ×1 y ×3: la línea llega vacía en ambos.
- Añadir un artículo sin cantidad desde Artículos y desde el buscador de la OF.
- Generar con una línea vacía: aviso con la lista, **ningún archivo** en la carpeta temporal.
- Rellenar la cantidad y generar: sale el `.xls`.
- Usar modelo completo ×1 → "Actualizar" activo y el `PUT` no crea copia. Usar ×3 o parcial → desactivado con su motivo.
- Dos pestañas con el mismo modelo: guardar en una, luego en la otra → aparece el aviso; probar las tres salidas.
- Guardar dos veces seguidas desde la misma pestaña → no salta el aviso.

## Fuera de alcance

- **Categorías por familia de producto en Modelos** (p. ej. "Escenarios"): spec propio, a continuación.
- Avisar de cantidades sospechosamente bajas. Con `null` disponible, el `0,000001` deja de ser necesario.
- Instantáneas automáticas de `data/` y lista de faltantes clicable: propuestas en la auditoría, descartadas por ahora.
