# Categorías de modelos y pendientes de la 0.2.0

**Fecha:** 2026-10-09 · **Estado:** aprobado por Ivan, pendiente de plan

## Problema

La biblioteca de Modelos es una lista plana. Con tres modelos no molesta; con treinta no se encuentra nada. Ivan quiere agruparlos por familia de producto ("estos que hay son escenarios").

Además quedan tres pendientes de la 0.2.0, detectados en las revisiones:

1. Si se edita un borrador o un modelo desde su pestaña mientras está abierto en Asignaciones, el formulario conserva la versión vieja y el siguiente guardado muestra un falso "otra persona lo ha modificado".
2. Cargar un modelo reemplazando deja vinculado el borrador que hubiera abierto, y "Guardar cambios" lo sobrescribiría con el contenido del modelo.
3. El texto a medio teclear en un campo de cantidad ("-", "1e") se detecta en `onChange`, que React no dispara si el valor que informa el navegador no cambia: en un campo de alta vacío, "-" acaba añadiendo la línea sin cantidad en vez de dar error.

## Decisiones

| Tema | Decisión |
|---|---|
| Cómo se asigna la categoría | Texto libre, con sugerencias de las ya existentes. Sin pantalla de gestión. |
| Cómo se guarda | Un campo `category` opcional en cada modelo. Una sola categoría por modelo. |
| Cómo se ve | Pastillas de filtro arriba y grupos plegables por categoría; "Sin categoría" al final. |
| Agrupación | Sin distinguir mayúsculas ni tildes; se muestra la forma más repetida. |
| Borradores | Sin categoría (no se ha pedido). |

## 1. Datos

**Servidor** ([models.js](../../../src/models.js)): `saveModel` acepta `category`. Saneado:

- `null`, `undefined` o solo espacios → se omite el campo (modelo "Sin categoría")
- texto → `trim`, espacios internos repetidos reducidos a uno, máximo 40 caracteres (se corta, no se rechaza)
- cualquier otro tipo → error 400 `Categoría no válida.`

Al actualizar, `category` entra en la lista blanca junto a `name`, `description` y `parts` ([models.js:43-45](../../../src/models.js#L43-L45)). Si la petición no trae el campo, se conserva el actual; si trae `''` o `null`, se quita.

**Cliente:** `AssignmentModel.category?: string`. La categoría viaja en todos los caminos que crean o copian un modelo: editor, "Guardar como modelo" (nuevo y actualizar), duplicar y la copia por conflicto.

## 2. Pantallas

**Módulo puro** `src/client/modelCategories.ts` (sin imports de ejecución, testeable con Node):

- `categoryKey(name)` → clave de comparación: minúsculas, sin tildes, espacios normalizados; `''` para "Sin categoría"
- `groupModelsByCategory(models)` → grupos `{ key, label, models }` ordenados alfabéticamente por etiqueta, con "Sin categoría" al final; la etiqueta es la grafía más repetida del grupo (en empate, la del modelo actualizado más recientemente)
- `listCategoryLabels(models)` → etiquetas únicas para las sugerencias

**Campo Categoría** en `ModelEditorModal` y en `SaveAsModelModal`: un `<input>` con `<datalist>` de `listCategoryLabels`. Al actualizar el modelo de origen, se rellena con su categoría actual (`ActiveModel` gana `category`).

**Pestaña Modelos** (`ModelsView`):

- Fila de pastillas: *Todas* y una por grupo con su número de modelos. Una seleccionada a la vez; *Todas* por defecto.
- Debajo, un bloque por grupo con cabecera plegable (botón con `aria-expanded`, nombre y número). Con una pastilla seleccionada solo se ve ese grupo.
- El buscador filtra los modelos dentro de cada grupo y oculta los grupos que se quedan vacíos; los números de las pastillas reflejan el filtro de búsqueda.
- La pastilla seleccionada y los grupos plegados se recuerdan en `localStorage` (clave `materiales-ot-modelos-vista`), envuelto en `try/catch`: si falla, todo abierto y *Todas*.
- Si no hay ningún modelo con categoría, no se muestran pastillas ni cabeceras: la lista se ve como hasta ahora.

## 3. Pendientes

**3.1 Versión desfasada.** `DraftsView` y `ModelsView` reciben un callback `onRecordSaved(kind, record)` que llaman tras cualquier guardado correcto (actualizar, copia, duplicar). `App` comprueba si `record.id` coincide con `activeDraft` o `activeModel` y, si es así, refresca `updatedAt` y los campos visibles (`name`, `notes`, `orderCode` del borrador; `name`, `description`, `category` del modelo). No cambia `updatable` ni el contenido del formulario.

**3.2 Borrador vinculado al cargar un modelo.** En `handleTransferModelToAssignment`, si se reemplaza y había `activeDraft`, se desvincula (`setActiveDraft(null)`) y el aviso lo dice: "Borrador «X» desvinculado: el formulario ahora contiene el modelo". El "Deshacer" lo vuelve a vincular. Si se añade encima, el borrador sigue vinculado.

**3.3 Texto a medias en cantidades.** Se lee `validity.badInput` del propio campo en el momento de confirmar (blur en `QuantityCell`; botón o Enter en los tres campos de alta), mediante un `ref` al `<input>`, en lugar de guardarlo en `onChange`. Se eliminan los estados `quantityBadInput` y el `badInputRef` actuales.

## 4. Datos existentes

Tras desplegar, a los tres modelos actuales se les pone `category: "Escenarios"` por la API, con `expectedUpdatedAt`. Lo hace un script que, como el del velcro, se niega a correr si `/api/health` no devuelve la versión nueva (**0.3.0**).

## Pruebas

**Unitarias:**
- Servidor: categoría limpiada, recortada a 40, omitida si vacía, 400 si no es texto; conservada al actualizar sin el campo; quitada con `''`.
- `modelCategories.ts`: agrupación sin distinguir mayúsculas ni tildes, etiqueta más repetida, "Sin categoría" al final, orden alfabético.

**Funcionales** (Chrome headless contra carpetas temporales, tecleo real donde importe):
- Crear modelos con "Escenarios", "escenarios" y sin categoría → dos grupos más "Sin categoría"; pastillas con los números correctos.
- Plegar un grupo y recargar → sigue plegado.
- Buscar → grupos vacíos ocultos.
- Editar un borrador abierto desde su pestaña y luego "Guardar cambios" → sin aviso de conflicto.
- Cargar un modelo reemplazando con un borrador abierto → borrador desvinculado y aviso; "Deshacer" lo recupera.
- Teclear "-" en el campo de alta vacío y pulsar "Añadir" → error, no se añade nada.

## Fuera de alcance

- Unificación visual con coordina-ot y toldos-testar: spec propio, a continuación.
- Categorías en borradores; renombrar una categoría en bloque.
