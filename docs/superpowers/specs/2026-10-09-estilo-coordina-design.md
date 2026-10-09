# Materiales OT con el estilo de CoordinaOT

**Fecha:** 2026-10-09 · **Estado:** aprobado por Ivan, pendiente de plan

## Objetivo

Materiales OT se ve igual que CoordinaOT y que Planteamientos (toldos-testar), que ya se pasó a ese estilo el 29/09/2026. Mismos colores, letra, cabecera, pestañas, paneles, botones, campos, chips, avisos y diálogos, en claro y en oscuro.

Regla permanente de Ivan: «siempre que rediseñes cualquier zona de la web, mira en CoordinaOT cómo está y cópialo». No se inventan colores, radios, sombras ni medidas. Si algo no existe en CoordinaOT, se usa su pieza más parecida.

**No cambia:** lo que hace cada pantalla, los textos, los campos ni la lógica.

## Referencias

- **CoordinaOT:** `C:\Users\ivan.sanchez\Documents\Proyectos DEV\coordina-ot` (solo lectura); en producción, `http://192.168.0.90:4300`. Tema en `localStorage` `coordina-theme`.
- **Planteamientos:** `C:\Users\ivan.sanchez\Documents\Proyectos DEV\toldos-testar` (solo lectura); en producción, `http://192.168.0.90:4400`.
  - `src/client/coordina/tokens.css`: tokens de CoordinaOT ya traducidos a CSS, con el oscuro bajo `:root[data-theme="dark"]`.
  - `src/client/coordina/piezas.css`: piezas de CoordinaOT traducidas de Tailwind (cabecera, `pestana`, `pestana-activa`, `pestana-contador`, `glass-chip`, `glass-panel`, `boton-3d`, `chip-3d`, `bloque-3d`, `ventana-3d`, `confirmation-dialog`, `desplegable`, `scroll-thin`…). Cada bloque cita las líneas de CoordinaOT de donde sale.
  - `src/client/coordina/README.md`: equivalencias de Tailwind y decisiones.
  - Spec de referencia: `docs/superpowers/specs/2026-09-29-estilo-coordina-design.md`.

## Cómo se hace

Materiales OT ya define casi todo su color con variables en `src/client/styles/tokens.css` (`--bg`, `--surface*`, `--ink*`, `--accent*`, `--ok-*`, `--warn-*`, `--danger-*`, `--radius-*`, `--shadow-*`). Fuera de ahí hay unos 17 colores escritos a mano.

1. **Tokens:** `tokens.css` copia los tokens de CoordinaOT (desde el `tokens.css` de Planteamientos, citando el origen) y apunta a ellos las variables de Materiales OT. Así, todo lo que ya usa variables toma el estilo nuevo sin reescribirse. Los colores escritos a mano pasan a variables.
2. **Piezas:** un parcial nuevo `src/client/styles/coordina.css` con las piezas de CoordinaOT que se usen aquí, copiadas de `piezas.css` de Planteamientos con sus mismos nombres de clase y citando el origen. No hace falta la capa `legacy` de Planteamientos: aquí no hay estilos viejos con colores propios que aislar.
3. **Componentes:** cada zona cambia sus clases para usar esas piezas y deja de tener estilo propio donde CoordinaOT ya tiene uno.

## Qué cambia

**Cabecera y pestañas en una sola barra**, como la de CoordinaOT:
- Logo a la izquierda (el actual de Materiales OT).
- Pestañas como botones con borde, la activa en dorado (`pestana-activa`); el contador de Borradores como `pestana-contador`.
- A la derecha, los indicadores de BD y carpeta de red como chips de CoordinaOT, con su punto de estado.
- Botón de modo único sol/luna, como el de CoordinaOT. Sustituye al selector de tres opciones (claro / sistema / oscuro). Mientras no se pulse nunca, la app sigue al tema del sistema, como ahora; al pulsarlo se guarda la elección en `materiales-ot-theme`.

**Colores:**
- Claro: «plata» de CoordinaOT (fondo `#d6dbe2`, paneles blancos). Oscuro: «grafito» de CoordinaOT.
- El índigo desaparece. Lo activo, el foco y el botón principal («Generar asignación», «Añadir», «Usar modelo»…) van en el dorado de marca `--color-brand-*` con tinta oscura `#17181c`, como lo activo en CoordinaOT.
- Avisos: verde, ámbar y rojo de CoordinaOT.

**Letra:** Geist en lugar de Inter; Geist Mono para códigos de artículo, OF y pedido, como los códigos de pedido en CoordinaOT. Paquetes `@fontsource-variable/geist` y `@fontsource-variable/geist-mono` (los mismos que Planteamientos); se retira `@fontsource-variable/inter`.

**Formas:** radios de 0.75rem en paneles y 0.5rem en botones, campos y chips; sombras, bordes y relieve de CoordinaOT.

## Orden de zonas

1. Base y cabecera: tokens, letra, fondo, barra con pestañas, chips de estado, botón de modo.
2. Asignaciones: resumen lateral, tarjetas de OF, campos, tabla de materiales, celdas de cantidad, botones.
3. Borradores y Modelos: tarjetas, buscador, pastillas de categoría y grupos, editor de modelos, transferencia.
4. Artículos e Historial.
5. Diálogos (`ModelDialog`, `ConfirmDialog`, conflicto, cantidades que faltan), avisos emergentes y selector de artículos.
6. Limpieza: retirar reglas, variables y la dependencia de Inter que ya no use nadie.

## Cómo se da por buena cada zona

- Capturas lado a lado con CoordinaOT (y Planteamientos donde tenga la pieza), en claro y oscuro, a 1600×1000 y 1280×720, revisadas.
- Auditoría de contraste de textos e iconos en los dos modos: ninguno por debajo de WCAG AA (4,5:1 texto, 3:1 iconos y bordes de campos). Se reutiliza el método de Planteamientos (`tmp/ui-audit/contraste.mjs`).
- Pruebas unitarias, lint, tipos, build y la prueba E2E de la 0.3.0 pasan: los cambios son de estilo.

## Restricciones

- Solo escritorio (como el resto de la app); se comprueba 1280×720 como mínimo.
- `prefers-reduced-motion` se sigue respetando.
- Única dependencia nueva: las dos letras Geist.
- Versión **0.4.0** al terminar.

## Fuera de alcance

- Paquete de estilos compartido entre las tres apps.
- Cambios de comportamiento, textos o disposición de los campos dentro de cada pantalla.
