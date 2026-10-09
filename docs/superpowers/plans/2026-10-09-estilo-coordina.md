# Estilo CoordinaOT en Materiales OT — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que Materiales OT se vea como CoordinaOT y Planteamientos: plata y grafito, dorado de marca, Geist, cabecera y pestañas de CoordinaOT, y sus paneles, chips, botones, campos y diálogos.

**Arquitectura:** casi todo el color de Materiales OT ya sale de variables de `src/client/styles/tokens.css`. Ese fichero pasa a contener los tokens de CoordinaOT, unas «recetas» (fondos y sombras de sus piezas guardados como variables) y las variables de siempre apuntando a ellos, así que la mayoría de reglas cambian solas. Un parcial nuevo `src/client/styles/coordina.css` lleva las piezas con nombre de CoordinaOT (cabecera, pestañas, chips, paneles) y se carga después de las vistas. Cada tarea toca una capa: base, cabecera, controles, superficies flotantes.

**Stack:** React 19 + TypeScript + Vite 6, CSS en parciales (`src/client/styles/*.css`, importados desde `src/client/styles.css`), `node:test`.

**Spec:** [docs/superpowers/specs/2026-10-09-estilo-coordina-design.md](../specs/2026-10-09-estilo-coordina-design.md)

## Restricciones globales

- Regla de Ivan: «siempre que rediseñes cualquier zona de la web, mira en CoordinaOT cómo está y cópialo». No se inventan colores, radios, sombras ni medidas: salen de `C:/Users/ivan.sanchez/Documents/Proyectos DEV/toldos-testar/src/client/coordina/tokens.css` y `piezas.css` (traducción fiel de CoordinaOT; solo lectura). Cada bloque copiado cita su origen en un comentario.
- No cambia lo que hace cada pantalla, ni los textos, ni los campos, ni la lógica (salvo el botón de modo, que el spec cambia).
- Tema oscuro con `:root[data-theme='dark']` (lo pone `index.html` y `useTheme` en `App.tsx`; clave `localStorage` `materiales-ot-theme`).
- Radios: `0.75rem` paneles y tarjetas, `0.5rem` botones, campos y chips, `1rem` diálogos.
- Dorado de marca `--color-brand-*`; tinta sobre dorado `#231903` (`--on-accent`).
- Letras: `@fontsource-variable/geist` y `@fontsource-variable/geist-mono` versión `5.3.0` (las de Planteamientos). Se retira `@fontsource-variable/inter`. Son las únicas dependencias que cambian.
- `prefers-reduced-motion` se sigue respetando (ya lo hace `base.css`).
- Solo escritorio; comprobar 1280×720 como mínimo.
- Textos en español; en JSX comillas tipográficas, nunca `"`.
- Nunca generar una reserva contra la carpeta de red real. Verificación funcional: `NODE_ENV=production`, `PORT=3100`, `EXPORT_DIRECTORY` / `ORDER_ARCHIVE_ROOT` en carpetas temporales, comprobado en `/api/health` (`type: "local-or-mounted"`).
- Al terminar cada tarea: `npm run lint`, `npx tsc --noEmit`, `npm test` y `npm run build` sin errores ni avisos.
- Pie de cada commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json` | Letras Geist en vez de Inter; versión 0.4.0. |
| `src/client/App.tsx` | Importa las letras; `useTheme` con botón único; pinta la cabecera con las pestañas dentro. |
| `src/client/styles/tokens.css` | Tokens de CoordinaOT, recetas de sus piezas y variables de la web apuntando a ellos. |
| `src/client/styles/base.css` | Fondo, letra, selección, foco y barras de desplazamiento de CoordinaOT. |
| `src/client/styles/coordina.css` *(nuevo)* | Piezas con nombre de CoordinaOT: cabecera, pestañas, chips, paneles. |
| `src/client/styles.css` | Importa `coordina.css` tras las vistas. |
| `src/client/components/Header.tsx`, `Navigation.tsx` | Cabecera única con logo, pestañas, chips de estado y botón de modo. |
| `src/client/styles/layout.css`, `drafts.css`, `models.css`, `responsive.css` | Quitar la cabecera, pestañas y selector de tema antiguos. |
| `src/client/styles/buttons.css`, `assignments.css`, `catalog.css`, `drafts.css`, `history.css`, `models.css`, `dialogs.css`, `toasts.css` | Botones, campos, tarjetas y superficies flotantes con las recetas. |

---

### Tarea 1: Letra, tokens y base

**Archivos:**
- Modificar: `package.json`, `pnpm-lock.yaml` (lo regenera pnpm), `src/client/App.tsx` (import de la letra), `src/client/styles/tokens.css` (entero), `src/client/styles/base.css` (entero), `src/client/styles/buttons.css`, `catalog.css`, `drafts.css`, `models.css`, `assignments.css`, `quantities.css`, `dialogs.css`

**Interfaces:**
- Produce (variables CSS que usan las tareas siguientes): `--color-brand-50…900`, `--font-sans`, `--font-mono`, `--bg`, `--surface`, `--surface-2`, `--zone`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--control-border`, `--control-border-hover`, `--control-active-border`, `--focus-ring`, `--glass-*`, `--edge`, `--contact`, `--on-accent`, y las recetas `--panel-bg`, `--panel-shadow`, `--dialog-shadow`, `--chip-bg`, `--chip-shadow`, `--chip-shadow-hover`, `--key-shadow`, `--key-shadow-hover`, `--key-shadow-pressed`, `--active-bg`, `--active-shadow`, `--solid-shadow`, `--solid-shadow-hover`, `--solid-shadow-pressed`, `--pop-shadow`. Las variables de siempre (`--ink*`, `--accent*`, `--ok-*`, `--warn-*`, `--danger-*`, `--shadow-*`, `--radius-*`, `--ring`…) siguen existiendo.

- [ ] **Paso 1: Cambiar la letra**

```bash
pnpm remove @fontsource-variable/inter
pnpm add @fontsource-variable/geist@5.3.0 @fontsource-variable/geist-mono@5.3.0
```

En `src/client/App.tsx`, sustituir `import '@fontsource-variable/inter';` por:

```tsx
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
```

- [ ] **Paso 2: `tokens.css` entero**

Sustituir el contenido de `src/client/styles/tokens.css` por:

```css
/* ============================================================
   Tokens — estilo de CoordinaOT
   Copiados de toldos-testar/src/client/coordina/tokens.css, que los copió tal cual de
   coordina-ot/src/app/globals.css: `@theme` (dorado de marca, líneas 11-26), `:root`
   (claro «plata glass», 31-110) y `.dark` (oscuro «carbón», 112-154). Aquí el oscuro va en
   `:root[data-theme='dark']`. Regla de Ivan: «siempre que rediseñes cualquier zona de la
   web, mira en CoordinaOT cómo está y cópialo»: si CoordinaOT cambia, se vuelve a copiar.
   ============================================================ */

:root {
  /* ── @theme de CoordinaOT: dorado calibrado a su logo ── */
  --color-brand-50: #fdf8ec;
  --color-brand-100: #fbeecd;
  --color-brand-200: #f8df9d;
  --color-brand-300: #f5cd66;
  --color-brand-400: #f2b234;
  --color-brand-500: #e79f1a;
  --color-brand-600: #c78312;
  --color-brand-700: #9e6512;
  --color-brand-800: #764a12;
  --color-brand-900: #4e300e;

  --font-sans: 'Geist Variable', Arial, Helvetica, sans-serif;
  --font-mono: 'Geist Mono Variable', ui-monospace, Consolas, monospace;

  /* ── :root de CoordinaOT: claro «plata glass» ── */
  color-scheme: light;
  --bg: #d6dbe2;
  --bg-glow: #e2e6eb;
  --surface: #ffffff;
  --surface-2: #f4f5f7;
  --zone: #f7f8fa;
  --border: #e2e4e9;
  --border-strong: #c8ccd4;
  --text: #17181c;
  --text-muted: #565b65;
  /* El borde de un campo necesita más contraste que un separador decorativo (Planteamientos). */
  --control-border: color-mix(in srgb, var(--text-muted) 85%, var(--surface));
  --control-border-hover: var(--text-muted);
  --control-active-border: var(--color-brand-700);
  --focus-ring: var(--control-active-border);

  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-bg-strong: rgba(255, 255, 255, 0.82);
  --glass-bg-pop: rgba(255, 255, 255, 0.99);
  --glass-border: rgba(255, 255, 255, 0.72);
  --glass-highlight: rgba(255, 255, 255, 0.95);
  --glass-shadow: rgba(24, 32, 48, 0.24);
  --glass-chip: rgba(255, 255, 255, 0.85);

  --edge: rgba(15, 23, 42, 0.08);
  --contact: rgba(15, 23, 42, 0.12);

  /* Tinta oscura sobre dorado: la de `.primary-button` de Planteamientos (nuevo-pedido.css 33). */
  --on-accent: #231903;

  /* ── Recetas de las piezas de CoordinaOT (piezas.css de Planteamientos) ──
     Fondos y sombras guardados como variables para que cada regla de la web los use sin
     repetirlos. */
  /* .glass-panel (globals.css 248-272) */
  --panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--glass-highlight) 30%, transparent), transparent 30%),
    var(--glass-bg);
  --panel-shadow:
    0 0 0 1px var(--edge),
    0 1px 2px var(--contact),
    inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 90%, white 10%),
    0 1px 1px rgba(0, 0, 0, 0.03),
    0 2px 0 -1px color-mix(in srgb, var(--border-strong) 40%, transparent),
    0 14px 40px -18px var(--glass-shadow);
  /* .glass-panel-strong, el panel de ConfirmDialog.tsx 107-122 */
  --dialog-shadow:
    0 0 0 1px var(--edge),
    0 1px 2px var(--contact),
    inset 0 1px 0 0 var(--glass-highlight),
    0 10px 34px -16px var(--glass-shadow);
  /* .glass-chip (globals.css 339-392): campos, chips y pestañas */
  --chip-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--glass-highlight) 40%, transparent), transparent 45%),
    var(--glass-chip);
  --chip-shadow:
    0 0 0 1px var(--edge),
    0 1px 2px var(--contact),
    inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 80%, white 20%),
    0 1px 1px rgba(0, 0, 0, 0.03),
    0 2px 0 0 color-mix(in srgb, var(--border-strong) 80%, transparent),
    0 10px 20px -10px var(--glass-shadow);
  --chip-shadow-hover:
    0 0 0 1px var(--edge),
    0 2px 4px var(--contact),
    inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 90%, white 10%),
    0 1px 1px rgba(0, 0, 0, 0.04),
    0 3px 0 0 color-mix(in srgb, var(--border-strong) 90%, transparent),
    0 16px 28px -12px var(--glass-shadow);
  /* .chip-3d (globals.css 645-672): botones neutros con relieve de tecla */
  --key-shadow:
    0 0 0 1px var(--edge),
    0 1px 2px var(--contact),
    inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 90%, white 10%),
    0 2px 0 0 color-mix(in srgb, var(--border-strong) 80%, transparent),
    0 6px 12px -4px var(--glass-shadow);
  --key-shadow-hover:
    0 0 0 1px var(--edge),
    0 2px 4px var(--contact),
    inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 95%, white 5%),
    0 3px 0 0 color-mix(in srgb, var(--border-strong) 90%, transparent),
    0 10px 18px -4px var(--glass-shadow);
  --key-shadow-pressed:
    inset 0 1px 2px rgba(0, 0, 0, 0.12),
    0 1px 2px -1px var(--glass-shadow);
  /* .glass-chip-activo / .pestana-activa: lo elegido, hundido en dorado */
  --active-bg: color-mix(in srgb, var(--color-brand-500) 15%, var(--glass-chip));
  --active-shadow: inset 0 1px 3px rgba(90, 60, 0, 0.25);
  /* .boton-3d (globals.css 678-704): botón de color macizo */
  --solid-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 2px 0 rgba(0, 0, 0, 0.18),
    0 4px 8px -3px rgba(15, 23, 42, 0.35);
  --solid-shadow-hover:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 3px 0 rgba(0, 0, 0, 0.18),
    0 8px 14px -4px rgba(15, 23, 42, 0.4);
  --solid-shadow-pressed: inset 0 1px 3px rgba(0, 0, 0, 0.3);
  /* .ventana-3d (globals.css 840-860): menús, avisos y listas que flotan */
  --pop-shadow:
    0 0 0 1px var(--edge),
    0 1px 2px var(--contact),
    inset 0 1px 0 color-mix(in srgb, var(--glass-highlight) 90%, white 10%),
    0 1px 1px rgba(0, 0, 0, 0.04),
    0 3px 0 -1px color-mix(in srgb, var(--border-strong) 70%, transparent),
    0 18px 40px -14px var(--glass-shadow);

  /* ── Variables de la web → tokens de CoordinaOT ──
     Las reglas de siempre usan estos nombres: apuntan a CoordinaOT y cambian solas. */
  --glow: transparent;
  --surface-translucent: var(--glass-bg-strong);
  --surface-3: var(--border);
  --input-bg: var(--glass-chip);
  --stripe: var(--zone);
  --row-hover: var(--surface-2);
  --scrollbar: var(--border-strong);

  /* CoordinaOT tiene dos tintas (text y text-muted): --ink-3 usa la segunda */
  --ink: var(--text);
  --ink-2: var(--text-muted);
  --ink-3: var(--text-muted);

  --accent: var(--color-brand-400);
  --accent-strong: var(--color-brand-300);
  --accent-soft: var(--active-bg);
  --accent-border: var(--control-active-border);
  /* El texto dorado de CoordinaOT: text-brand-800 (oscuro: brand-300) */
  --accent-ink: var(--color-brand-800);
  --accent-glow: transparent;

  /* Verde, ámbar y rojo de CoordinaOT (--tramo-holgado, amber-700, red-700) */
  --ok-ink: #04785a;
  --ok-soft: color-mix(in srgb, var(--ok-ink) 10%, transparent);
  --ok-border: color-mix(in srgb, var(--ok-ink) 30%, transparent);

  --danger-ink: #b91c1c;
  --danger-soft: color-mix(in srgb, var(--danger-ink) 8%, transparent);
  --danger-border: color-mix(in srgb, var(--danger-ink) 30%, transparent);

  --warn-ink: #b45309;
  --warn-soft: color-mix(in srgb, var(--warn-ink) 10%, transparent);
  --warn-border: color-mix(in srgb, var(--warn-ink) 32%, transparent);

  --ring: 0 0 0 2px var(--focus-ring);
  --shadow-1: 0 0 0 1px var(--edge), 0 1px 2px var(--contact);
  --shadow-2: var(--panel-shadow);
  --shadow-3: var(--pop-shadow);

  /* rounded-lg / rounded-lg / rounded-xl */
  --radius-s: 0.5rem;
  --radius-m: 0.5rem;
  --radius-l: 0.75rem;

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);

  --select-chevron: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='16'%20height='16'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23565b65'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E");
}

/* ── .dark de CoordinaOT: oscuro «carbón» ── */
:root[data-theme='dark'] {
  color-scheme: dark;

  --bg: #1a1b1f;
  --bg-glow: #222428;
  --surface: #212225;
  --surface-2: #2a2c31;
  --zone: #1e1f23;
  --border: #35373d;
  --border-strong: #45484f;
  --text: #eef0f2;
  --text-muted: #b3b9c2;
  --control-border: color-mix(in srgb, var(--text-muted) 75%, var(--surface-2));
  --control-active-border: var(--color-brand-400);

  --glass-bg: rgba(36, 38, 44, 0.92);
  --glass-bg-strong: rgba(40, 42, 48, 0.95);
  --glass-bg-pop: rgba(32, 34, 40, 0.99);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-highlight: rgba(255, 255, 255, 0.12);
  --glass-shadow: rgba(0, 0, 0, 0.5);
  --glass-chip: rgba(44, 47, 54, 0.95);
  --edge: transparent;
  --contact: transparent;

  /* Sombras oscuras de las piezas (piezas.css: `:root[data-theme="dark"] .glass-chip`,
     `.chip-3d`, `.glass-chip-activo`, `.boton-3d`, `.ventana-3d`) */
  --chip-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 2px 0 -1px rgba(0, 0, 0, 0.5),
    0 10px 22px -12px rgba(0, 0, 0, 0.7);
  --chip-shadow-hover: var(--chip-shadow);
  --key-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 2px 0 -1px rgba(0, 0, 0, 0.5),
    0 6px 14px -8px rgba(0, 0, 0, 0.7);
  --key-shadow-hover: var(--key-shadow);
  --key-shadow-pressed:
    inset 0 1px 3px rgba(0, 0, 0, 0.5),
    0 1px 2px -1px rgba(0, 0, 0, 0.7);
  --active-bg: color-mix(in srgb, var(--color-brand-400) 18%, var(--glass-chip));
  --active-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.6);
  --solid-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 2px 0 rgba(0, 0, 0, 0.5),
    0 4px 10px -3px rgba(0, 0, 0, 0.7);
  --solid-shadow-hover: var(--solid-shadow);
  --pop-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 3px 0 -1px rgba(0, 0, 0, 0.55),
    0 20px 44px -14px rgba(0, 0, 0, 0.8);

  --accent-ink: var(--color-brand-300);

  --ok-ink: #34d399;
  --danger-ink: #f87171;
  --warn-ink: #fbbf24;

  --select-chevron: url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='16'%20height='16'%20viewBox='0%200%2024%2024'%20fill='none'%20stroke='%23b3b9c2'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='m6%209%206%206%206-6'/%3E%3C/svg%3E");
}
```

- [ ] **Paso 3: `base.css` entero**

Sustituir el contenido de `src/client/styles/base.css` por:

```css
/* ============================================================
   Base — la de CoordinaOT (piezas.css de Planteamientos, «Base», globals.css 167-232,
   y «Barras de desplazamiento», globals.css 1020-1058)
   ============================================================ */

* {
  box-sizing: border-box;
}

html {
  background: var(--bg);
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

html::-webkit-scrollbar { width: 12px; height: 12px; }
html::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border: 3px solid var(--bg);
  border-radius: 9999px;
}
html::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
html::-webkit-scrollbar-track { background: transparent; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

::selection {
  background: color-mix(in srgb, var(--color-brand-400) 30%, transparent);
}

/* Listas y tablas con scroll propio: la `scroll-thin` de CoordinaOT */
:not(html)::-webkit-scrollbar { width: 8px; height: 8px; }
:not(html)::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 9999px; }
:not(html)::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
:not(html)::-webkit-scrollbar-track,
:not(html)::-webkit-scrollbar-corner { background: transparent; }

input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}

input[type='number']::-webkit-inner-spin-button,
input[type='number']::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

button,
input,
select {
  font: inherit;
}

button {
  -webkit-tap-highlight-color: transparent;
}

:focus {
  outline: none;
}

/* El anillo de foco de teclado de CoordinaOT (globals.css 194): 2px de dorado a 1px del borde */
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

input:focus-visible,
select:focus-visible {
  border-color: var(--control-active-border);
}

/* Códigos de artículo, OF y pedido en Geist Mono, como los «AR.26…» de CoordinaOT */
.catalog-reference strong,
.materials-table td:first-child,
.material-pill,
.missing-item-code,
.draft-order-tag,
.model-part-table td:first-child,
.editor-part-materials-table td:first-child {
  font-family: var(--font-mono);
}

svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Paso 4: Quitar letras y colores escritos a mano que chocan con el dorado**

En `src/client/styles/models.css`:
- En `.material-pill`, borrar la línea `font-family: monospace;` (ya lo pone `base.css`).
- En `.model-part-table td:first-child, .editor-part-materials-table td:first-child { … }`, borrar `font-family: Consolas, 'SFMono-Regular', monospace;` dejando el resto de la regla.
- En `.model-card:hover`, sustituir `box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.05));` por `box-shadow: var(--shadow-2);` y `border-color: var(--border-strong, var(--accent-border));` por `border-color: var(--border-strong);`.
- En `.transfer-part-item:focus-within { … }`, sustituir `outline: 2px solid var(--accent);` por `outline: 2px solid var(--focus-ring);`.

Texto blanco sobre `var(--accent)` (ahora dorado claro): pasa a `var(--on-accent)`. Sustituir `color: #fff;` por `color: var(--on-accent);` **solo** en estas reglas:
- `src/client/styles/base.css`: ya no existe (el paso 3 quitó el `::selection` blanco).
- `src/client/styles/buttons.css`: `.button-primary` y `.button-secondary`.
- `src/client/styles/catalog.css`: `.stock-badge-button:hover .stock-badge, .series-badge-button:hover .series-badge` y `.row-add-button:hover`.
- `src/client/styles/drafts.css`: `.draft-resume-button` y `.nav-badge`.

Bordes en `var(--accent)` (estados de foco y selección): en todos los parciales, sustituir `border-color: var(--accent);` por `border-color: var(--control-active-border);`. Comprobar con:

```bash
git grep -n "border-color: var(--accent);" -- src/client/styles
```

Esperado: sin resultados.

En `src/client/styles/drafts.css`, en la regla que tiene `color: var(--accent);` (línea ~392), sustituirlo por `color: var(--accent-ink);` (texto dorado legible).

- [ ] **Paso 5: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Esperado: sin errores ni avisos.

```bash
git add package.json pnpm-lock.yaml src/client/App.tsx src/client/styles
git commit -F - <<'EOF'
feat: tokens, letra y base de CoordinaOT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 2: Cabecera y pestañas de CoordinaOT

**Archivos:**
- Crear: `src/client/styles/coordina.css`
- Modificar: `src/client/styles.css`, `src/client/components/Header.tsx` (entero), `src/client/components/Navigation.tsx` (entero), `src/client/App.tsx` (`useTheme` y el JSX de la cabecera), `src/client/styles/layout.css`, `src/client/styles/drafts.css` (quitar `.nav-badge`), `src/client/styles/models.css` (quitar reglas de cabecera en sus `@media`), `src/client/styles/responsive.css`

**Interfaces:**
- Consume: tokens y recetas de la Tarea 1.
- Produce:
  - `useTheme(): { resolved: 'light' | 'dark'; toggle: () => void }` (en `App.tsx`)
  - `Header({ databaseState, networkState, theme, onToggleTheme, navigation })` con `theme: 'light' | 'dark'` y `navigation: ReactNode`
  - `Navigation({ activeTab, onChangeTab, draftsCount })` (misma firma de siempre)
  - Clases en `coordina.css`: `.cabecera`, `.glass-header`, `.cabecera-logo`, `.cabecera-pestanas`, `.tira-3d`, `.pestana`, `.pestana-activa`, `.pestana-contador`, `.cabecera-derecha`, `.cabecera-modo`, `.glass-chip`, `.glass-chip-activo`, `.estado-chip`.

- [ ] **Paso 1: `coordina.css`**

Crear `src/client/styles/coordina.css`:

```css
/* ============================================================
   Piezas con nombre de CoordinaOT
   Copiadas de toldos-testar/src/client/coordina/piezas.css (traducción de
   coordina-ot/src/app/globals.css y del JSX de Board.tsx, ViewSwitcher.tsx y
   ThemeToggle.tsx). Se carga después de las vistas: a igual especificidad, gana.
   ============================================================ */

/* ── Chip de vidrio (globals.css 339-392) ── */
.glass-chip {
  background: var(--chip-bg);
  border: 1px solid var(--control-border);
  box-shadow: var(--chip-shadow);
  transition: transform 140ms ease, box-shadow 140ms ease;
}
.glass-chip:hover {
  transform: translateY(-1px);
  box-shadow: var(--chip-shadow-hover);
}
.glass-chip-activo,
.glass-chip-activo:hover {
  background: var(--active-bg);
  border-color: var(--control-active-border);
  box-shadow: var(--active-shadow);
  color: var(--accent-ink);
  transform: translateY(1px);
}

/* ── Cabecera: del mismo color que la página, sin raya (globals.css 807-810;
   Board.tsx 2178 `glass-header sticky top-0 z-30 … items-center gap-3 px-5 py-2.5`) ── */
.glass-header {
  background: var(--bg);
  backdrop-filter: blur(24px) saturate(1.8);
}

.cabecera {
  align-items: center;
  display: flex;
  gap: 0.75rem;
  padding: 0.625rem 1.25rem;
  position: sticky;
  top: 0;
  z-index: 30;
}

/* Logo: Board.tsx 2181 `-my-3 shrink-0` */
.cabecera-logo {
  align-items: center;
  display: inline-flex;
  flex-shrink: 0;
  margin-block: -0.75rem;
}
.cabecera-logo img { display: block; height: 1.75rem; width: auto; }
.cabecera-logo .logo-oscuro { display: none; }
:root[data-theme='dark'] .cabecera-logo .logo-claro { display: none; }
:root[data-theme='dark'] .cabecera-logo .logo-oscuro { display: block; }

/* ── Tira de pestañas: teclas sueltas, la activa hundida en dorado (globals.css 401-459;
   ViewSwitcher.tsx `tira-3d … rounded-lg`, cada una `flex h-9 items-center gap-1.5
   rounded-lg px-2.5 text-xs font-semibold xl:px-3.5`) ── */
.cabecera-pestanas {
  border-radius: 0.5rem;
  display: inline-flex;
  flex-shrink: 0;
  gap: 6px;
}

.tira-3d > :not(.pestana-activa) {
  background: var(--chip-bg);
  border: 1px solid var(--control-border);
  box-shadow: var(--key-shadow);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.tira-3d > :not(.pestana-activa):hover {
  transform: translateY(-1px);
  box-shadow: var(--key-shadow-hover);
}
.tira-3d > :not(.pestana-activa):active {
  transform: translateY(1px);
  box-shadow: var(--key-shadow-pressed);
}

.pestana {
  align-items: center;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.375rem;
  height: 2.25rem;
  line-height: 1rem;
  margin: 0;
  padding: 0 0.625rem;
  white-space: nowrap;
}
@media (min-width: 1280px) {
  .pestana { padding: 0 0.875rem; }
}
.pestana svg { height: 1rem; width: 1rem; }
.pestana:not(.pestana-activa) { color: var(--text-muted); }
.pestana:not(.pestana-activa):hover { color: var(--text); }

.pestana-activa {
  background: var(--active-bg);
  border: 1px solid var(--control-active-border);
  box-shadow: var(--active-shadow);
  color: var(--accent-ink);
  transform: translateY(1px);
}

/* Contador: `rounded-full px-1.5 text-[10px] font-bold`, `bg-amber-700 text-white`
   (o `bg-brand-400` con tinta oscura en la activa) */
.pestana-contador {
  background: #b45309;
  border-radius: 9999px;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 0 0.375rem;
}
.pestana-activa .pestana-contador {
  background: var(--color-brand-400);
  color: var(--on-accent);
}

/* ── Derecha: Board.tsx 2217 `ml-auto flex shrink-0 items-center justify-end gap-2 text-xs` ── */
.cabecera-derecha {
  align-items: center;
  display: flex;
  flex-shrink: 0;
  font-size: 0.75rem;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-left: auto;
}

/* Modo: ThemeToggle.tsx `glass-chip grid size-9 place-items-center rounded-lg
   text-text-muted hover:text-text`, icono `size-4` */
.cabecera-modo {
  border-radius: 0.5rem;
  color: var(--text-muted);
  cursor: pointer;
  display: grid;
  height: 2.25rem;
  margin: 0;
  padding: 0;
  place-items: center;
  width: 2.25rem;
}
.cabecera-modo:hover { color: var(--text); }
.cabecera-modo svg { height: 1rem; width: 1rem; }

/* Estado de la BD y de la carpeta de red: el chip de usuario de CoordinaOT (Herramientas.tsx
   94-102 `glass-chip flex h-9 items-center gap-1.5 rounded-lg … text-xs font-semibold`),
   con un punto de color en lugar del avatar. */
.estado-chip {
  align-items: center;
  border-radius: 0.5rem;
  color: var(--text-muted);
  display: inline-flex;
  font-weight: 600;
  gap: 0.375rem;
  height: 2.25rem;
  padding: 0 0.625rem;
  white-space: nowrap;
}
.estado-chip:hover { transform: none; box-shadow: var(--chip-shadow); }
.estado-chip svg { height: 0.875rem; width: 0.875rem; }
.estado-punto {
  background: var(--text-muted);
  border-radius: 9999px;
  height: 0.5rem;
  width: 0.5rem;
}
.estado-chip.checking .estado-punto { animation: pulse 1.2s ease-in-out infinite; }
.estado-chip.ok .estado-punto { background: var(--ok-ink); }
.estado-chip.error { color: var(--danger-ink); }
.estado-chip.error .estado-punto { background: var(--danger-ink); }

@media (prefers-reduced-motion: reduce) {
  .glass-chip, .tira-3d > *, .pestana-activa { transition: none; transform: none; }
}
```

(`pulse` ya existe en `animations.css`; comprobarlo con `git grep -n "@keyframes pulse" -- src/client/styles`.)

En `src/client/styles.css`, añadir `@import './styles/coordina.css';` justo después de `@import './styles/quantities.css';`.

- [ ] **Paso 2: Cabecera y pestañas**

Sustituir `src/client/components/Header.tsx` entero por:

```tsx
import type { ReactNode } from 'react';
import { Database, Folder, Moon, Sun } from 'lucide-react';
import type { ConnectionState } from '../types';

const statusLabels: Record<'database' | 'network', Record<ConnectionState, string>> = {
  database: { checking: 'Comprobando BD', ok: 'BD conectada', error: 'BD sin conexión' },
  network: { checking: 'Comprobando red', ok: 'Carpeta de red OK', error: 'Red sin acceso' }
};

/** Cabecera de CoordinaOT: logo, pestañas, estado y modo en una sola barra. */
export function Header({
  databaseState,
  networkState,
  theme,
  onToggleTheme,
  navigation
}: {
  databaseState: ConnectionState;
  networkState: ConnectionState;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  navigation: ReactNode;
}) {
  return (
    <header className="cabecera glass-header">
      <div className="cabecera-logo">
        <h1 className="sr-only">Materiales OT - Asignaciones</h1>
        <img className="logo-claro" src="/logo-light.png" alt="Materiales OT" />
        <img className="logo-oscuro" src="/logo-dark.png" alt="Materiales OT" />
      </div>
      {navigation}
      <div className="cabecera-derecha">
        <StatusChip kind="database" state={databaseState} />
        <StatusChip kind="network" state={networkState} />
        {/* Como el ThemeToggle de CoordinaOT: en claro enseña la luna, en oscuro el sol */}
        <button
          type="button"
          className="cabecera-modo glass-chip"
          onClick={onToggleTheme}
          aria-label="Cambiar tema"
          title="Cambiar tema"
        >
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

function StatusChip({ kind, state }: { kind: 'database' | 'network'; state: ConnectionState }) {
  return (
    <div className={`estado-chip glass-chip ${state}`} title={statusLabels[kind][state]}>
      <span className="estado-punto" aria-hidden="true" />
      {kind === 'database' ? <Database aria-hidden="true" /> : <Folder aria-hidden="true" />}
      {statusLabels[kind][state]}
    </div>
  );
}
```

Sustituir `src/client/components/Navigation.tsx` entero por:

```tsx
import type { ReactNode } from 'react';
import { Boxes, FileClock, FileSpreadsheet, History, Layers } from 'lucide-react';

export type ActiveTab = 'assignments' | 'drafts' | 'models' | 'articles' | 'history';

const tabs: { id: ActiveTab; label: string; icon: ReactNode }[] = [
  { id: 'assignments', label: 'Asignaciones', icon: <FileSpreadsheet aria-hidden="true" /> },
  { id: 'drafts', label: 'Borradores', icon: <FileClock aria-hidden="true" /> },
  { id: 'models', label: 'Modelos', icon: <Layers aria-hidden="true" /> },
  { id: 'articles', label: 'Artículos', icon: <Boxes aria-hidden="true" /> },
  { id: 'history', label: 'Historial', icon: <History aria-hidden="true" /> }
];

/** Pestañas de CoordinaOT (ViewSwitcher.tsx): teclas sueltas, la activa hundida en dorado. */
export function Navigation({
  activeTab,
  onChangeTab,
  draftsCount
}: {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  draftsCount?: number;
}) {
  return (
    <nav className="cabecera-pestanas tira-3d" aria-label="Vistas principales">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`pestana${active ? ' pestana-activa' : ''}`}
            aria-current={active ? 'page' : undefined}
            type="button"
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'drafts' && typeof draftsCount === 'number' && draftsCount > 0 && (
              <span className="pestana-contador">{draftsCount}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Paso 3: `useTheme` y la cabecera en `App.tsx`**

Sustituir la función `useTheme` entera por:

```tsx
/**
 * Tema claro u oscuro. Mientras no se elige, sigue al sistema (`system`); el botón de la
 * cabecera, como el de CoordinaOT, pasa al contrario del que se ve y lo recuerda.
 */
function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(themeStorageKey);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    if (mode === 'system') localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, mode);
  }, [mode, resolved]);

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved]);

  return { resolved, toggle };
}
```

(`useCallback` ya está importado en `App.tsx`; comprobarlo.)

Sustituir `const { mode: themeMode, setMode: setThemeMode } = useTheme();` por:

```tsx
  const { resolved: theme, toggle: toggleTheme } = useTheme();
```

Y en el JSX, sustituir `<Header … />` y `<Navigation … />` (los dos, seguidos al principio de `<main className="app-shell">`) por:

```tsx
      <Header
        databaseState={databaseState}
        networkState={networkState}
        theme={theme}
        onToggleTheme={toggleTheme}
        navigation={
          <Navigation activeTab={activeTab} onChangeTab={setActiveTab} draftsCount={draftsCount} />
        }
      />
```

`ThemeMode` en `types.ts` no cambia (`'light' | 'dark' | 'system'`).

- [ ] **Paso 4: Quitar la cabecera antigua del CSS**

`src/client/styles/layout.css`: borrar todo desde la línea `.topbar {` hasta justo antes de `/* --- transición entre vistas --- */`, **conservando** la regla `.sr-only { … }`, que se pega en su lugar sin cambios. Quedan `.app-shell`, `.sr-only` y lo que va desde «transición entre vistas».

`src/client/styles/drafts.css`: borrar el comentario `/* Botón de contador en la navegación */` y la regla `.nav-badge { … }` entera.

`src/client/styles/models.css`:
- En `@media (max-width: 760px)`, borrar las dos líneas `.app-tabs { … }` y `.app-tabs button { … }`.
- En `@media (max-width: 420px)`, borrar la línea `.app-tabs button { … }`.
- Borrar el bloque `@media (max-width: 560px) { … }` entero (solo tiene reglas de `.topbar`, `.topbar-actions`, `.brand`, `.theme-toggle` y `.status-pill`).

`src/client/styles/responsive.css`: en `@media (max-width: 960px)`, quitar `.topbar,` de la primera lista de selectores, y borrar las reglas `.topbar { … }`, `.topbar-actions { … }` y `.app-tabs { … }`.

Comprobar:

```bash
git grep -n "topbar\|app-tabs\|theme-toggle\|status-pill\|status-dot\|nav-badge\|brand-logo" -- src/client
```

Esperado: sin resultados.

- [ ] **Paso 5: Hueco bajo la cabecera**

Las vistas tenían su margen superior contando con la tira de pestañas antigua (`margin: 18px 28px 0`). Comprobar en `layout.css` / `assignments.css` qué padding superior tienen `.workspace`, `.models-view`, `.drafts-view`, `.catalog-shell` y la vista de historial, y si alguno empieza pegado a la cabecera, darle `padding-top: 18px` en su regla existente. Comprobarlo con `npm run build` y abriendo `dist` en el navegador del paso de verificación de la Tarea 5 (o con `npm run dev`, puerto del `.env`, solo para mirar: no pulsar «Generar»).

- [ ] **Paso 6: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client
git commit -F - <<'EOF'
feat: cabecera y pestañas de CoordinaOT con botón único de modo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 3: Botones, campos, paneles y tarjetas

**Archivos:**
- Modificar: `src/client/styles/buttons.css` (entero), `src/client/styles/assignments.css`, `src/client/styles/drafts.css`, `src/client/styles/dialogs.css`, `src/client/styles/coordina.css`

**Interfaces:**
- Consume: recetas de la Tarea 1 (`--chip-bg`, `--chip-shadow`, `--key-shadow*`, `--solid-shadow*`, `--panel-bg`, `--panel-shadow`, `--active-*`), `coordina.css` de la Tarea 2.
- Produce: nada nuevo para otras tareas.

- [ ] **Paso 1: `buttons.css` entero**

```css
/* --- botones ---
   Principal: `boton-3d` en el dorado de marca con tinta oscura (receta de `.primary-button`
   de Planteamientos, nuevo-pedido.css 297-340; hover `brand-300`). Neutros: `chip-3d`
   (globals.css 645-672). Peligro: `boton-3d` con `bg-red-600 text-white hover:bg-red-700`
   (ConfirmDialog.tsx 84). */

.button {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-s);
  padding: 9px 14px;
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 600;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease,
    box-shadow 120ms ease, transform 120ms ease;
}

.button svg {
  width: 16px;
  height: 16px;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
  transform: none;
  box-shadow: none;
}

.button-primary,
.button-secondary {
  background: var(--color-brand-400);
  border-color: var(--control-active-border);
  color: var(--on-accent);
  box-shadow: var(--solid-shadow);
}

.button-secondary {
  align-self: end;
}

.button-primary:hover:not(:disabled),
.button-secondary:hover:not(:disabled) {
  background: var(--color-brand-300);
  box-shadow: var(--solid-shadow-hover);
  transform: translateY(-1px);
}

.button-primary:active:not(:disabled),
.button-secondary:active:not(:disabled) {
  box-shadow: var(--solid-shadow-pressed);
  transform: translateY(1px);
}

.button-muted,
.button-ghost {
  background: var(--chip-bg);
  border-color: var(--control-border);
  box-shadow: var(--key-shadow);
  color: var(--text);
}

.button-ghost {
  color: var(--accent-ink);
}

.button-muted:hover:not(:disabled),
.button-ghost:hover:not(:disabled) {
  box-shadow: var(--key-shadow-hover);
  transform: translateY(-1px);
}

.button-muted:active:not(:disabled),
.button-ghost:active:not(:disabled) {
  box-shadow: var(--key-shadow-pressed);
  transform: translateY(1px);
}

/* Variante compacta, para barras de filtros y cabeceras densas */
.button-sm {
  min-height: 32px;
  padding: 6px 11px;
  font-size: 12.5px;
}

.button-sm svg {
  width: 14px;
  height: 14px;
}
```

En `src/client/styles/dialogs.css`, sustituir las cuatro reglas de `.button-danger` (la base, su `:hover` y las dos `:root[data-theme='dark']`) por:

```css
.button-danger {
  background: #dc2626;
  color: #fff;
  box-shadow: var(--solid-shadow);
}

.button-danger:hover:not(:disabled) {
  background: #b91c1c;
  box-shadow: var(--solid-shadow-hover);
  transform: translateY(-1px);
}

.button-danger:active:not(:disabled) {
  box-shadow: var(--solid-shadow-pressed);
  transform: translateY(1px);
}
```

En `src/client/styles/drafts.css`, sustituir las reglas `.draft-resume-button { … }` y `.draft-resume-button:hover { … }` por:

```css
.draft-resume-button {
  background: var(--color-brand-400);
  color: var(--on-accent);
  border: 1px solid var(--control-active-border);
  border-radius: var(--radius-s);
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  box-shadow: var(--solid-shadow);
  transition: background-color 140ms ease, box-shadow 120ms ease, transform 120ms ease;
  white-space: nowrap;
}

.draft-resume-button:hover {
  background: var(--color-brand-300);
  box-shadow: var(--solid-shadow-hover);
  transform: translateY(-1px);
}

.draft-resume-button:active {
  box-shadow: var(--solid-shadow-pressed);
  transform: translateY(1px);
}
```

- [ ] **Paso 2: Campos**

En `src/client/styles/assignments.css`, sustituir la regla `input, select { … }` por:

```css
/* Campos: la pieza `glass-chip` que CoordinaOT pone a su buscador (FilterBar.tsx 229) y a sus
   desplegables (Select.tsx 226), sin levantarse al pasar el ratón (como en Planteamientos,
   nuevo-pedido.css 80-106). */
input,
select {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--control-border);
  border-radius: var(--radius-s);
  padding: 8px 11px;
  background: var(--chip-bg);
  box-shadow: var(--chip-shadow);
  color: var(--text);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

input:hover:not(:disabled):not([readonly]),
select:hover:not(:disabled) {
  border-color: var(--control-border-hover);
}

input:focus,
select:focus {
  border-color: var(--control-active-border);
}
```

Las cajas de búsqueda que meten un `<input>` sin borde dentro de un contenedor (`.models-search-box`, `.drafts-search-box`, `.search-input` del catálogo y del selector de artículos) deben seguir viéndose como una sola pieza: en cada una, la regla del **contenedor** pasa a `background: var(--chip-bg); border: 1px solid var(--control-border); box-shadow: var(--chip-shadow); border-radius: var(--radius-s);` y la del `input` de dentro conserva (o recibe) `background: transparent; border: 0; box-shadow: none;`. Localizarlas con:

```bash
git grep -n "search-box\b\|search-box {\|search-box input\|\.search-input" -- src/client/styles
```

En `.quantity-cell-input` (assignments.css), si sus reglas `:hover` / `:focus` ponen `background: var(--input-bg)`, se dejan: `--input-bg` ya es `--glass-chip`.

- [ ] **Paso 3: Botones de icono**

En `src/client/styles/assignments.css`, tras la regla `.icon-button svg { … }`, añadir:

```css
/* Como los iconos de las tarjetas de CoordinaOT: sin fondo hasta pasar el ratón */
.icon-button:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}
```

- [ ] **Paso 4: Paneles y tarjetas**

Al final de `src/client/styles/coordina.css`:

```css
/* ── Paneles y tarjetas: `glass-panel rounded-xl` (globals.css 248-272; TecnicoCard.tsx 67),
   sin `backdrop-filter` (como `.panel-vidrio` de Planteamientos: sobre el fondo liso no hay
   nada que desenfocar, y un filtro haría de bloque contenedor de los desplegables fijos). ── */
.summary-panel,
.of-card,
.catalog-panel,
.catalog-table-wrap,
.model-card,
.draft-card,
.history-card {
  background: var(--panel-bg);
  border-color: var(--glass-border);
  border-radius: 0.75rem;
  box-shadow: var(--panel-shadow);
}

/* Al pasar el ratón o abrir, CoordinaOT no cambia la sombra: solo el borde */
.model-card:hover,
.draft-card:hover,
.history-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--panel-shadow);
}

.model-card.open,
.draft-card.open,
.history-card.open {
  box-shadow: var(--panel-shadow);
}
```

(`.draft-card.open { border-color: var(--accent-border); }` y `.draft-card.active-working` siguen dando el borde dorado: no se tocan.)

- [ ] **Paso 5: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client/styles
git commit -F - <<'EOF'
feat: botones, campos y paneles con las piezas de CoordinaOT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 4: Diálogos, avisos, desplegables y pastillas

**Archivos:**
- Modificar: `src/client/styles/dialogs.css`, `src/client/styles/coordina.css`

**Interfaces:**
- Consume: recetas de la Tarea 1; `.glass-chip`, `.glass-chip-activo` de la Tarea 2.

- [ ] **Paso 1: Telón y diálogo**

En `src/client/styles/dialogs.css`, en `.modal-overlay`, sustituir `background: rgba(9, 11, 16, 0.44);` por `background: rgb(0 0 0 / 0.5);` (ConfirmDialog.tsx 107: `bg-black/50 backdrop-blur-sm`; el `backdrop-filter: blur(4px)` ya está).

Al final de `src/client/styles/coordina.css`:

```css
/* ── Diálogo: `glass-panel-strong … rounded-2xl` (ConfirmDialog.tsx 107-122) ── */
.modal {
  background: var(--glass-bg-strong);
  backdrop-filter: blur(24px) saturate(1.8);
  border: 1px solid var(--glass-border);
  border-radius: 1rem;
  box-shadow: var(--dialog-shadow);
}

/* El pie fijo del editor de modelos tapa el contenido al desplazarse: opaco, del color del panel */
.model-dialog .modal-footer {
  background: var(--glass-bg-pop);
}

/* ── Lo que flota (listas de resultados, menús, avisos): `ventana-3d` (globals.css 840-860) ── */
.results,
.apple-select-menu,
.toast {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--glass-highlight) 60%, transparent), transparent 40%),
    var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--pop-shadow);
}

/* ── Pastillas y contadores: `glass-chip`, la elegida `glass-chip-activo` ── */
.category-pill,
.library-count {
  background: var(--chip-bg);
  border-color: var(--control-border);
  border-radius: var(--radius-s);
  box-shadow: var(--chip-shadow);
}

.category-pill:hover {
  box-shadow: var(--chip-shadow-hover);
  transform: translateY(-1px);
}

.category-pill.active,
.category-pill.active:hover {
  background: var(--active-bg);
  border-color: var(--control-active-border);
  box-shadow: var(--active-shadow);
  color: var(--accent-ink);
  transform: translateY(1px);
}
```

- [ ] **Paso 2: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add src/client/styles
git commit -F - <<'EOF'
feat: diálogos, avisos, menús y pastillas con las piezas de CoordinaOT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Tarea 5: Verificación visual y de contraste (la hace el controlador)

Servidor de prueba como en las restricciones globales, con una copia de `data/*.json` restaurada al acabar (y `data/backups` borrado si no existía). Chrome headless por CDP con `--lang=es-ES` y `Emulation.setFocusEmulationEnabled`.

- [ ] **Paso 1: Capturas**

Para cada pestaña (Asignaciones con una OF y líneas, Borradores con uno abierto, Modelos con grupos, Artículos con una búsqueda, Historial con una entrada abierta) y además el editor de modelos, «Guardar como modelo», un diálogo de confirmación y un aviso: capturar en claro y oscuro (`localStorage` `materiales-ot-theme`) a 1600×1000 y 1280×720. Capturar CoordinaOT (`http://192.168.0.90:4300`, `localStorage` `coordina-theme`, solo lectura) en claro y oscuro a 1600×1000 para comparar. Revisar lado a lado: cabecera, pestañas, chips, paneles, botones, campos, diálogos. Cada diferencia que no sea de contenido se corrige con el valor de CoordinaOT (fuentes: `toldos-testar/src/client/coordina/piezas.css`, `nuevo-pedido.css` y `coordina-ot/src/app/globals.css`), en el parcial correspondiente, con un commit `fix:` por zona.

- [ ] **Paso 2: Contraste**

Ejecutar en cada captura la función de `toldos-testar/tmp/ui-audit/contraste.mjs` (`auditContrast`: su cuerpo va dentro de `page.evaluate`; aquí se pasa como expresión a `Runtime.evaluate`). Objetivo: 0 textos por debajo de 4,5:1 (3:1 si son grandes) y 0 iconos por debajo de 3:1, en claro y en oscuro. Lo que falle se corrige con la tinta de CoordinaOT más cercana (`--text`, `--text-muted`, `--accent-ink`, `--ok-ink`, `--warn-ink`, `--danger-ink`), no con colores nuevos.

- [ ] **Paso 3: E2E de la 0.3.0**

Volver a pasar `e2e-categorias.mjs` (scratchpad de la sesión): 21/21. Si algún selector del arnés usaba `nav button` para las pestañas, sigue valiendo (las pestañas siguen siendo `<button>` dentro de `<nav>`).

---

### Tarea 6: Limpieza y versión 0.4.0

**Archivos:**
- Modificar: `src/client/styles/tokens.css`, parciales que aún usen variables retiradas, `package.json`

- [ ] **Paso 1: Variables sin uso**

```bash
for v in glow accent-glow surface-translucent; do echo "--$v:"; git grep -n "var(--$v)" -- src/client; done
```

Si alguna sale sin usos, borrar su línea de `tokens.css` (bloque «Variables de la web → tokens de CoordinaOT»). Si `--glow` solo lo usa ya nadie (el `body` de `base.css` dejó de usarlo en la Tarea 1), se borra.

- [ ] **Paso 2: Inter**

```bash
git grep -n "Inter" -- src index.html
```

Esperado: sin resultados.

- [ ] **Paso 3: Versión**

En `package.json`: `"version": "0.4.0"`.

- [ ] **Paso 4: Comprobaciones globales y commit**

Ejecutar: `npm run lint && npx tsc --noEmit && npm test && npm run build`

```bash
git add package.json src/client/styles
git commit -F - <<'EOF'
chore: versión 0.4.0 (estilo CoordinaOT)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Revisión del plan contra el spec

| Requisito del spec | Tarea |
|---|---|
| Tokens de CoordinaOT en claro y oscuro; variables de la web apuntando a ellos | 1 |
| Geist y Geist Mono (códigos); fuera Inter | 1, 6 |
| Radios 0.75 / 0.5 rem; sombras y relieve | 1, 3, 4 |
| Índigo fuera; principal en dorado con tinta oscura; avisos con los colores de CoordinaOT | 1, 3 |
| Cabecera única: logo, pestañas `pestana-activa`, contador, chips de BD y red | 2 |
| Botón único de modo; sin elegir, sigue al sistema | 2 |
| `coordina.css` con las piezas y su origen citado | 2, 3, 4 |
| Asignaciones, Borradores, Modelos, Artículos, Historial (paneles, campos, botones, tarjetas) | 3 |
| Diálogos, avisos, menús, selector de artículos | 4 |
| Capturas lado a lado en claro/oscuro, 1600×1000 y 1280×720 | 5 |
| Contraste AA en los dos modos | 5 |
| Pruebas, lint, tipos, build y E2E siguen pasando | todas, 5 |
| Limpieza de lo que quede sin uso; versión 0.4.0 | 6 |
