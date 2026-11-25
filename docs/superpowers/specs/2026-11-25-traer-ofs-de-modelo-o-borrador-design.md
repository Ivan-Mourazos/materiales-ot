# Traer OFs de un modelo o de otro borrador desde Asignación

Fecha: 25/11/2026 · Pedido por Iván (un compañero buscaba, desde un borrador, cómo traer un modelo y no lo encontraba).

## Qué se quiere

Desde Asignación, sin cambiar de pestaña, poder añadir al formulario OFs con sus artículos sacadas de:

- **un modelo** (ya existía, pero el botón «Usar un modelo» mandaba a la pestaña Modelos);
- **otro borrador** (no existía: solo «Duplicar» el borrador entero).

## Decisiones

- Las OFs llegan **sin número de OF** (Iván: «el número de la OF no hace falta»), igual que desde el historial o un modelo.
- Por defecto se **añaden** a lo que hay; se puede marcar «Reemplazar». El aviso ofrece «Deshacer».
- El modelo o borrador de origen **nunca se modifica**.
- Traer de un borrador **no desvincula** el borrador abierto: luego «Actualizar borrador» guarda el resultado.
- En la lista de borradores **no aparece el que está abierto** (lo que hay en pantalla puede no estar guardado).
- Se conservan cantidades, descripción de la OF y ancho de cada artículo.

## Cómo

1. **«Usar un modelo»** abre `SourcePickerModal` con la lista de modelos (buscador por nombre/categoría). Al elegir uno se abre `ModelTransferModal` (la de siempre: partes, multiplicador, reemplazar) y aplica `handleTransferModelToAssignment`.
2. **«Traer de un borrador»** (botón nuevo) abre `SourcePickerModal` con los borradores (nombre, pedido, nº OFs, fecha). Al elegir uno se abre la ventana de selección de OFs y artículos que ya usa el historial (`ReuseHistoryModal`, generalizada para recibir título y OFs) y aplica lo mismo que «Reutilizar».
3. `reusePick.buildPickedOfs` conserva `width`/`widthWarning` si vienen (el historial no los trae: quedan `null` como hasta ahora).

## Errores

Si la lista no carga: mensaje en la ventana con «Reintentar». Lista vacía: texto explicativo.

## Pruebas

- `tests/reusePick.test.js`: conserva el ancho; OFs sin número (borradores) se llevan igual.
- `pnpm test`, `pnpm lint`, `pnpm build`; comprobación en local con datos de prueba (nunca contra producción).
