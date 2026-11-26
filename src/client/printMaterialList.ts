import type { Quantity } from './quantities';
import { hasQuantity } from './quantities';
import { formatDisplayText, formatNumber, historyDateFormat } from './utils';

export type PrintableGroup = {
  title: string;
  subtitle?: string;
  materials: { code: string; description: string; quantity: Quantity | undefined }[];
};

export type PrintableList = {
  /** Título del documento; también es el nombre por defecto del PDF. */
  title: string;
  kind: string;
  meta: string[];
  quantityLabel: string;
  groups: PrintableGroup[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderGroup(group: PrintableGroup, quantityLabel: string) {
  const rows = group.materials.length
    ? group.materials
        .map(
          (m) => `<tr>
  <td class="code">${escapeHtml(m.code)}</td>
  <td>${escapeHtml(formatDisplayText(m.description) || '-')}</td>
  <td class="qty">${hasQuantity(m.quantity) ? formatNumber(m.quantity) : '<span class="missing">sin cantidad</span>'}</td>
</tr>`
        )
        .join('')
    : '<tr><td colspan="3" class="empty">Sin materiales.</td></tr>';

  return `<section>
  <h2>${escapeHtml(group.title)}${group.subtitle ? ` <small>— ${escapeHtml(group.subtitle)}</small>` : ''}</h2>
  <table>
    <thead><tr><th class="code">Artículo</th><th>Descripción</th><th class="qty">${escapeHtml(quantityLabel)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

/** Abre el diálogo de impresión con el listado de artículos (desde ahí: "Guardar como PDF"). */
export function printMaterialList(list: PrintableList) {
  const totalLines = list.groups.reduce((sum, g) => sum + g.materials.length, 0);
  const meta = [...list.meta, `${totalLines} ${totalLines === 1 ? 'artículo' : 'artículos'}`, `Impreso el ${historyDateFormat.format(new Date())}`];

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(list.title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; font-size: 10.5pt; margin: 0; }
  header { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 12px; }
  header .kind { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #666; }
  h1 { font-size: 16pt; margin: 2px 0 4px; }
  header .meta { font-size: 9pt; color: #444; }
  section { margin-bottom: 14px; }
  h2 { font-size: 11.5pt; margin: 0 0 4px; break-after: avoid; }
  h2 small { font-weight: normal; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border-bottom: 1px solid #ccc; padding: 3px 6px; text-align: left; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; color: #555; border-bottom: 1px solid #111; }
  .code { width: 22%; font-weight: 600; white-space: nowrap; }
  th.code { font-weight: 600; }
  .qty { width: 14%; text-align: right; white-space: nowrap; }
  .missing, .empty { color: #888; font-style: italic; }
</style>
</head>
<body>
<header>
  <div class="kind">${escapeHtml(list.kind)}</div>
  <h1>${escapeHtml(list.title)}</h1>
  <div class="meta">${meta.map(escapeHtml).join(' · ')}</div>
</header>
${list.groups.length ? list.groups.map((g) => renderGroup(g, list.quantityLabel)).join('\n') : '<p class="empty">Sin OFs ni materiales.</p>'}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // El título de la página principal es el nombre por defecto del PDF en Chrome/Edge.
  const previousTitle = document.title;
  document.title = list.title;
  const cleanup = () => {
    document.title = previousTitle;
    iframe.remove();
  };
  win.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true });
  setTimeout(() => {
    win.focus();
    win.print();
    // Por si el navegador no dispara afterprint: print() bloquea hasta cerrar el diálogo.
    setTimeout(() => { if (iframe.isConnected) cleanup(); }, 1000);
  }, 50);
}
