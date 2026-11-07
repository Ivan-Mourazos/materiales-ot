import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Copy, X, ExternalLink } from 'lucide-react';
import type { Article } from '../../types';
import type { ArticleSheet, SheetArticle, Usage, Variants } from '../../articleSheetTypes';
import { ArticleThumb } from '../common/ArticleThumb';
import { ModelDialog } from '../common/ModelDialog';

/** Las líneas guardadas solo conservan el código; RPS resuelve el identificador real. */
export function ArticleSheetByCode({ code, onClose }: { code: string; onClose: () => void }) {
  const [article, setArticle] = useState<Article | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const title = useId();
  useEffect(() => {
    const c = new AbortController();
    setError('');
    read<{ article: Article }>(`/api/article-by-code?${new URLSearchParams({ code })}`, c.signal).then(d => { if (!c.signal.aborted) setArticle(d.article); }).catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [code, attempt]);
  if (article) return <ArticleSheetModal article={article} onClose={onClose} />;
  return <ModelDialog className="article-lookup-modal" labelledBy={title} onClose={onClose}><div className="modal-header"><h2 id={title}>{code}</h2><button className="icon-button" aria-label="Cerrar ficha" onClick={onClose}><X /></button></div>{error ? <ErrorState message={error} onRetry={() => setAttempt(x => x + 1)} /> : <p role="status">Buscando el artículo en RPS…</p>}</ModelDialog>;
}

const number = (n: number | null | undefined) => n == null ? 'No informado' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(n);
const date = (s: string | null | undefined) => s ? s.slice(0, 10).split('-').reverse().join('/') : 'Sin fecha informada';
const oldDate = (s: string | null) => Boolean(s && Date.now() - Date.parse(s) > 365 * 86400000);
const price = (n: number | null, currency: string | null, unit: string) => `${number(n)} ${currency || '(moneda no informada)'}/${unit || 'unidad no informada'}`;
const quantity = (n: number | null | undefined, unit: string | undefined) => `${number(n)} ${unit || ''}`;
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('No se pudo cargar la ficha. Comprueba que el servidor está actualizado.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo consultar RPS.');
  return data;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return <><button className="icon-button" type="button" aria-label={label} title={copied ? 'Copiado' : label} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); } catch { setError(true); }
  }}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button><span className="sheet-copy-status" role="status">{copied ? 'Copiado' : error ? 'No se pudo copiar. Selecciona el texto para copiarlo.' : ''}</span></>;
}

export function ArticleSheetModal({ article, onClose }: { article: Article; onClose: () => void }) {
  const [history, setHistory] = useState<Article[]>([article]);
  const selected = history[history.length - 1];
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = dialog.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node?.showModal();
    return () => { node?.close(); document.body.style.overflow = overflow; if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="modal-overlay model-dialog article-sheet-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal article-sheet-modal">
      <SheetContent key={selected.idArticle} article={selected} titleId={titleId} onClose={onClose} onSelect={a => setHistory(h => [...h, a])} onBack={history.length > 1 ? () => setHistory(h => h.slice(0, -1)) : undefined} />
    </div>
  </dialog>;
}

function SheetContent({ article, titleId, onClose, onSelect, onBack }: { article: Article; titleId: string; onClose: () => void; onSelect: (a: Article) => void; onBack?: () => void }) {
  const [sheet, setSheet] = useState<ArticleSheet | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState('summary');
  const panelId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    read<ArticleSheet>(`/api/article-sheet?${new URLSearchParams({ idArticle: article.idArticle })}`, controller.signal).then(data => { if (!controller.signal.aborted) setSheet(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [article.idArticle, attempt]);
  const a = sheet?.article;
  const tabs = [['summary', 'Resumen y stock'], ['variants', 'Variantes'], ['purchases', 'Compras'], ['usage', 'Uso'], ['documents', `Documentos${sheet ? ` (${sheet.documents.length})` : ''}`]];
  return <>
    <header className="sheet-header">
      <ArticleThumb key={article.code} code={article.code} hasImage={a?.hasImage ?? article.hasImage} size="lg" />
      <div className="sheet-identity">
        <div className="sheet-code">{onBack && <button className="icon-button" aria-label="Volver al artículo anterior" onClick={onBack}><ArrowLeft /></button>}<h2 id={titleId}>{a?.code || article.code}</h2><CopyButton value={a?.code || article.code} label="Copiar código" /></div>
        <p className="sheet-description">{a?.description || article.description}</p>
        {a && <><p className="sheet-muted">{[a.family, a.subfamily].filter(Boolean).join(' / ')} · Unidad de stock: {a.unitCode}</p>{a.genericCode && <p className="sheet-muted">Genérico: <strong>{a.genericCode}</strong> · {a.genericDescription}</p>}<div className="sheet-chips">{a.attributes.map(x => <span key={x.slot}>{attributeLabel(a, x)}: <strong>{x.value}</strong></span>)}</div><BlockBadges article={a} /></>}
      </div>
      <button ref={closeButton} className="icon-button sheet-close" type="button" onClick={onClose} aria-label="Cerrar ficha"><X /></button>
    </header>
    <div className="sheet-tabs tira-3d" role="tablist" aria-label="Secciones de la ficha" onKeyDown={event => {
      const index = tabs.findIndex(t => t[0] === tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); setTab(tabs[next][0]); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next].focus(); }
    }}>{tabs.map(([key, label]) => <button key={key} id={`${panelId}-${key}`} className={`pestana${tab === key ? ' pestana-activa' : ''}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`${panelId}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)}>{label}</button>)}</div>
    <section className="sheet-body" id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${tab}`} tabIndex={0}>
      {error ? <ErrorState message={error} onRetry={() => setAttempt(x => x + 1)} /> : !sheet ? <p role="status">Consultando la ficha en RPS…</p> : <>
        {tab === 'summary' && <Summary sheet={sheet} />}
        <div hidden={tab !== 'variants'}><VariantPanel id={article.idArticle} active={tab === 'variants'} onSelect={onSelect} /></div>
        {tab === 'purchases' && <Purchases sheet={sheet} />}
        <div hidden={tab !== 'usage'}><UsagePanel id={article.idArticle} active={tab === 'usage'} /></div>
        {tab === 'documents' && <><h3>Documentos del artículo y del genérico</h3>{sheet.documentsCanOpen ? <p className="sheet-muted">Fichas y certificados enlazados en RPS. «Abrir» los muestra en una pestaña nueva.</p> : <p className="sheet-muted">Fichas y certificados enlazados en RPS. Abrirlos desde la web estará disponible cuando el servidor tenga acceso a la carpeta de RPS; mientras tanto, copia la ruta y ábrela desde un equipo de la oficina.</p>}{sheet.documents.length ? sheet.documents.map(d => <article className="sheet-card" key={d.id}><div className="sheet-doc-head"><strong>{d.name}</strong>{d.path && sheet.documentsCanOpen && <a className="button button-muted button-sm" href={`/api/article-document?idArticle=${encodeURIComponent(article.idArticle)}&id=${encodeURIComponent(d.id)}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Abrir</a>}</div><p>{d.type} · {d.origin === 'propio' ? 'Propio del artículo' : 'Del genérico'}</p><div className="sheet-path"><code>{d.path || 'Sin ruta informada'}</code>{d.path && <CopyButton value={d.path} label={`Copiar ruta de ${d.name}`} />}</div></article>) : <Empty>Sin documentos enlazados.</Empty>}</>}
      </>}
    </section>
    {/* Hora de la consulta en la hora local de quien mira (antes salía en UTC: una hora menos en invierno) */}
    {sheet && <footer className="sheet-footer">Consulta RPS: {new Date(sheet.queriedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })}</footer>}
  </>;
}

// COLOR también guarda materiales: la etiqueta se adapta a la familia, sin cambiar el dato de RPS.
function attributeLabel(article: SheetArticle, attribute: SheetArticle['attributes'][number]) {
  const context = `${article.family} ${article.subfamily}`;
  if (/TORNILL/i.test(context)) return ['Material', 'Métrica', 'Longitud'][attribute.slot - 1] || attribute.name;
  if (/LONA|TEJIDO|TELA/i.test(context)) return ['Color', 'Ancho (atributo)'][attribute.slot - 1] || attribute.name;
  return attribute.name;
}

function BlockBadges({ article: a }: { article: Pick<SheetArticle, 'blockedPurchase' | 'blockedManufacturing' | 'blockedSales' | 'blockedMaintenance' | 'inactiveDate'> }) {
  const inactive = a.inactiveDate && a.inactiveDate <= new Date().toISOString().slice(0, 10);
  const labels = [a.blockedPurchase && 'No se compra', a.blockedManufacturing && 'No se fabrica', a.blockedSales && 'No se vende', a.blockedMaintenance && 'Bloq. mantenimiento', inactive && 'Inactivo'].filter(Boolean);
  return labels.length ? <div className="sheet-badges">{labels.map(label => <span key={String(label)}>{label}</span>)}</div> : null;
}
function Empty({ children }: { children: ReactNode }) { return <p className="sheet-muted sheet-empty">{children}</p>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div role="alert" className="sheet-error"><p>{message}</p><button type="button" className="secondary-button" onClick={onRetry}>Reintentar</button></div>; }
function Metric({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }) { return <article className="sheet-metric"><span>{label}</span><strong>{value}</strong><small>{children}</small></article>; }
function Table({ headings, children }: { headings: string[]; children: ReactNode }) { return <div className="sheet-table-wrap"><table className="sheet-table"><thead><tr>{headings.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }

function Summary({ sheet }: { sheet: ArticleSheet }) {
  const [warehouse, setWarehouse] = useState('');
  const { article: a, stock, purchases: p } = sheet;
  const warehouses = [...new Set(stock.rows.map(r => r.warehouseCode))];
  const selected = warehouse || warehouses[0];
  const rows = stock.rows.filter(r => r.warehouseCode === selected);
  const isFabric = /LONA|TEJIDO|TELA/i.test(a.family || '');
  const isScrew = /TORNILL/i.test(`${a.family} ${a.subfamily} ${a.description}`);
  const isMotor = /MOTOR/i.test(`${a.family} ${a.description}`);
  const attr = (slot: number) => a.attributes.find(x => x.slot === slot)?.value;
  return <>
    <div className="sheet-metrics"><Metric label="Stock físico" value={quantity(stock.total, a.unitCode)}>Existencias de almacenes vigentes.</Metric><Metric label="Reservado en OF" value={quantity(stock.reserved, a.unitCode)}>Reserva física registrada contra OF abiertas.</Metric><Metric label="Pendiente de recibir" value={stock.pending.length ? stock.pending.map((p, i) => <span key={i}>{quantity(p.quantity, p.unit)}<small>Próxima prevista: {date(p.nextDate)}</small></span>) : quantity(0, a.unitCode)}>Pedidos abiertos de compra, agrupados por unidad.</Metric></div>
    <p className="sheet-muted">La reserva física cubre parte de la necesidad de fabricación. La necesidad pendiente se consulta en Uso; no se descuenta de nuevo del stock.</p>
    <div className="sheet-chips"><span>Mínimo general: <strong>{quantity(p.stockMin, a.unitCode)}</strong></span><span>Punto de pedido general: <strong>{quantity(p.pointOrder, a.unitCode)}</strong></span></div>
    <h3>Stock por almacén, ubicación y serie</h3>
    {stock.rows.length ? <><div className="sheet-warehouses">{warehouses.map(code => <button type="button" className={code === selected ? 'selected' : ''} aria-pressed={code === selected} key={code} onClick={() => setWarehouse(code)}><span>{code} · {stock.rows.find(r => r.warehouseCode === code)?.warehouse}</span><strong>{quantity(stock.rows.filter(r => r.warehouseCode === code).reduce((n, r) => n + r.quantity, 0), a.unitCode)}</strong></button>)}</div><Table headings={['Serie', 'Ubicación', 'Stock físico', 'Última entrada', 'Último movimiento']}>{rows.map((r, i) => <tr key={i}><td>{r.series || 'Sin serie'}</td><td>{[r.locationCode, r.location].filter(Boolean).join(' · ') || 'Sin ubicación'}</td><td>{quantity(r.quantity, a.unitCode)}</td><td>{date(r.lastEntryDate)}</td><td>{date(r.lastMovementDate)}</td></tr>)}</Table></> : <Empty>Sin stock físico registrado en almacenes vigentes.</Empty>}
    {stock.reserves.length > 0 && <details className="sheet-card"><summary>Reservas físicas registradas ({stock.reserves.length})</summary><Table headings={['OF', 'Estado', 'Serie', 'Almacén', 'Reserva']}>{stock.reserves.map((r, i) => <tr key={i}><td>{r.order}</td><td>{r.situation}</td><td>{r.series}</td><td>{r.warehouseCode}</td><td>{quantity(r.quantity, a.unitCode)}</td></tr>)}</Table></details>}
    <h3>Ficha técnica</h3><dl className="sheet-specs">
      {isFabric && attr(1) && <><dt>Color (atributo de RPS)</dt><dd>{attr(1)} · {a.attributes.find(x => x.slot === 1)?.valueCode}</dd></>}
      {isFabric && attr(2) && <><dt>Medida (atributo de RPS)</dt><dd>{attr(2)}</dd></>}
      {isFabric && !!a.detectedWidth && <><dt>Ancho detectado</dt><dd>{a.detectedWidth} cm · Procedencia: {a.widthSource || 'detección de RPS'}.</dd></>}
      {isScrew && [1, 2, 3].map((slot, i) => attr(slot) ? <div key={slot}><dt>{['Material', 'Métrica', 'Longitud'][i]} (atributo de RPS)</dt><dd>{attr(slot)}</dd></div> : null)}
      {isMotor && <><dt>Modelo (genérico de RPS)</dt><dd>{a.genericCode || 'No informado'}</dd>{p.suppliers.filter(s => s.reference).map(s => <div key={s.code}><dt>Referencia de {s.name}</dt><dd>{s.reference}</dd></div>)}</>}
      {a.normaUne && <><dt>Norma UNE informada</dt><dd>{a.normaUne}</dd></>}{a.technicalDescription && <><dt>Descripción técnica de RPS</dt><dd>{a.technicalDescription}</dd></>}{a.netWeight ? <><dt>Peso neto de RPS</dt><dd>{number(a.netWeight)}</dd></> : null}{a.grossWeight ? <><dt>Peso bruto de RPS</dt><dd>{number(a.grossWeight)}</dd></> : null}
      {!isFabric && !isScrew && !isMotor && !a.normaUne && !a.technicalDescription && <><dt>Atributos</dt><dd>{a.attributes.map(x => `${x.name}: ${x.value}`).join(' · ') || 'Sin especificaciones adicionales informadas.'}</dd></>}
    </dl>{a.widthWarning && <p className="sheet-warning">{a.widthWarning}</p>}
  </>;
}

function Purchases({ sheet }: { sheet: ArticleSheet }) {
  const p = sheet.purchases; const r = p.lastReceipt; const v = p.valuation;
  return <>
    <h3>Proveedores y referencias</h3><p>{p.usualSupplier ? `Proveedor habitual: ${p.usualSupplier}` : 'Sin proveedor habitual definido.'}</p>
    <div className="sheet-chips"><span>Mínimo general: <strong>{quantity(p.stockMin, sheet.article.unitCode)}</strong></span><span>Punto de pedido general: <strong>{quantity(p.pointOrder, sheet.article.unitCode)}</strong></span><span>Lote de compra general: <strong>{quantity(p.purchaseLot, sheet.article.purchaseUnit)}</strong></span><span>Plazo general: <strong>{p.deliveryDays ? `${p.deliveryDays} días` : 'No informado'}</strong></span></div>
    {p.suppliers.length ? <Table headings={['Proveedor', 'Referencia', 'Plazo del proveedor', 'Estado']}>{p.suppliers.map(s => <tr key={s.code}><td>{s.name}</td><td>{s.reference || 'No informada'}</td><td>{s.deliveryDays ? `${s.deliveryDays} días` : 'No informado'}</td><td>{s.blocked ? 'Bloqueado' : 'Sin bloqueo registrado'}</td></tr>)}</Table> : <Empty>Sin proveedores asociados.</Empty>}
    <h3>Última recepción de compra</h3>{r ? <div className="sheet-card"><strong>Último proveedor: {r.supplier}</strong><p>Albarán {r.code} · <span className={oldDate(r.date) ? 'sheet-warning' : ''}>{date(r.date)}{oldDate(r.date) ? ' · Fecha antigua' : ''}</span> · Ref. {r.reference || 'no informada'}</p><div className="sheet-metrics"><Metric label="Precio del documento" value={price(r.documentPrice, r.currency, r.documentUnit)}>Fecha: {date(r.date)} · {r.documentUnitSource}</Metric><Metric label="Precio del movimiento de stock" value={price(r.movementPrice, r.valuationCurrency, r.stockUnit)}>Fecha: {date(r.date)} · Tras valoración y descuentos.</Metric></div><details><summary>Descuentos de recepción</summary><p>{r.discounts.map(n => `${number(n)} %`).join(' / ')}</p><p>Factor de conversión de precio registrado: {r.priceConversion || 'No informado'}</p></details></div> : <Empty>Sin recepción de compra registrada.</Empty>}
    <h3>Valoración general del maestro</h3><div className="sheet-metrics"><Metric label="Último precio del maestro" value={price(v.lastPrice, v.currency, v.unit)}><span className={oldDate(v.date) ? 'sheet-warning' : ''}>{date(v.date)}{oldDate(v.date) ? ' · Fecha antigua' : ''}</span></Metric><Metric label="Precio medio del maestro" value={price(v.averagePrice, v.currency, v.unit)}>Fecha de cálculo no informada en RPS · Consultado el {date(sheet.queriedAt)}</Metric></div>
    <h3>Pedidos pendientes de recibir</h3>{p.pending.length ? <Table headings={['Pedido', 'Proveedor', 'Pendiente', 'Fecha prevista', 'Fecha solicitada']}>{p.pending.map((o, i) => <tr key={i}><td>{o.code}</td><td>{o.supplier}</td><td>{quantity(o.quantity, o.unit)}</td><td>{date(o.expectedDate)}</td><td>{date(o.requestedDate)}</td></tr>)}</Table> : <Empty>Sin líneas pendientes de recibir.</Empty>}
    <h3>Tarifas de proveedor ({p.tariffs.length})</h3><p className="sheet-muted">Histórico por fecha y tramo. Moneda según la asociación actual de proveedor y artículo. Las condiciones pueden solaparse; RPS determina el precio aplicable.</p>{p.tariffs.map((t, i) => <article className="sheet-card" key={i}><strong>{t.supplier}</strong><p className="sheet-price">{price(t.price, t.currency, t.priceUnit)}{t.price === 0 ? ' · Sin importe utilizable' : ''}</p><p className={oldDate(t.from) ? 'sheet-warning' : ''}>Desde {date(t.from)} hasta {date(t.to)}{oldDate(t.from) ? ' · Fecha antigua' : ''}</p><details><summary>Tramo, descuentos y lotes</summary><p>Desde {quantity(t.quantityFrom, t.quantityUnit)} · Descuentos: {t.discounts.map(n => `${number(n)} %`).join(' / ')}</p><p>Lote: {number(t.purchaseLot)} · Mínimo: {number(t.minimumLot)} · Referencia: {t.reference || 'No informada'}</p></details></article>)}{!p.tariffs.length && <Empty>Sin tarifas registradas.</Empty>}
  </>;
}

function VariantPanel({ id, active, onSelect }: { id: string; active: boolean; onSelect: (a: Article) => void }) {
  const [filter, setFilter] = useState(''); const [query, setQuery] = useState(''); const [offset, setOffset] = useState(0); const [data, setData] = useState<Variants | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (filter === query) return;
    const timer = setTimeout(() => { setQuery(filter); setOffset(0); }, 250);
    return () => clearTimeout(timer);
  }, [filter, query]);
  useEffect(() => {
    if (!active) return;
    const c = new AbortController(); setLoading(true); setError('');
    read<Variants>(`/api/article-sheet/variants?${new URLSearchParams({ idArticle: id, q: query, offset: String(offset), limit: '40' })}`, c.signal).then(d => { if (!c.signal.aborted) setData(d); }).catch(e => { if (!c.signal.aborted) setError(e.message); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [id, active, query, offset, attempt]);
  return <><h3>Otras medidas y colores</h3><p className="sheet-muted">Variantes comerciales del mismo genérico. Revisa sus medidas y bloqueos antes de elegir.</p><label className="sheet-filter">Filtrar por código, texto o atributo<input type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Ej.: M-8, 16MM, negro…" /></label>{loading ? <p role="status">Consultando variantes…</p> : error ? <ErrorState message={error} onRetry={() => setAttempt(x => x + 1)} /> : data && <><p className="sheet-muted">{data.total ? `${offset + 1}–${offset + data.articles.length} de ${data.total}` : 'Sin variantes para este filtro.'}</p><div className="sheet-variants">{data.articles.map(a => <button type="button" disabled={a.idArticle === id} className="sheet-variant" key={a.idArticle} onClick={() => onSelect(a)}><div><strong>{a.code}{a.idArticle === id ? ' · Actual' : ''}</strong><p>{a.description}</p><small>{a.attributes.join(' · ')}</small><BlockBadges article={a} /></div><strong>{quantity(a.stockTotal, a.unitCode)}</strong></button>)}</div><div className="sheet-pagination"><button type="button" disabled={!offset} onClick={() => setOffset(x => Math.max(0, x - 40))}>Anterior</button><button type="button" disabled={offset + data.articles.length >= data.total} onClick={() => setOffset(x => x + 40)}>Siguiente</button></div></>}</>;
}

function UsagePanel({ id, active }: { id: string; active: boolean }) {
  const [data, setData] = useState<Usage | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || data) return;
    const c = new AbortController(); setError('');
    read<Usage>(`/api/article-sheet/usage?${new URLSearchParams({ idArticle: id })}`, c.signal).then(d => { if (!c.signal.aborted) setData(d); }).catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [id, active, data, attempt]);
  if (error) return <ErrorState message={error} onRetry={() => setAttempt(x => x + 1)} />;
  if (!data) return <p role="status">Consultando consumo y necesidades de fabricación…</p>;
  const c = data.consumption;
  return <><h3>Consumo en los últimos 12 meses móviles</h3><div className="sheet-metrics"><Metric label="Consumo neto" value={quantity(c.net, data.unit)}>Positivo: {number(c.positive)} · Rectificaciones: {number(c.negative)} · Rechazado: {number(c.rejected)}</Metric><Metric label="OF distintas" value={number(c.manufacturingOrders)}>{number(c.imputations)} imputaciones</Metric><Metric label="Pedidos de venta vinculados" value={number(c.salesOrders)}>Cobertura parcial; puede haber OF internas.</Metric></div><p className="sheet-muted">Último uso del período: {date(c.lastDate)} · Consulta: {date(data.queriedAt)}</p>
    <h3>Últimas OF con consumo</h3><p className="sheet-muted">Cantidad histórica acumulada en cada OF.</p>{data.recent.length ? <Table headings={['OF', 'Pedido', 'Estado', 'Último uso', 'Consumo']}>{data.recent.map(r => <tr key={r.code}><td>{r.code}</td><td>{r.order || 'Sin pedido vinculado'}</td><td>{r.situation}</td><td>{date(r.date)}</td><td>{quantity(r.quantity, data.unit)}</td></tr>)}</Table> : <Empty>Sin OF con consumo registrado.</Empty>}
    <h3>Necesidad pendiente en OF abiertas: {quantity(data.needs.total, data.unit)}</h3><p className="sheet-muted">Material previsto menos imputado, por línea abierta. Incluye OF creadas y activas. Las reservas físicas del resumen pueden cubrir parte de esta necesidad.</p>{data.needs.groups.map(g => <p key={g.situation}>{g.situation} · {number(g.orders)} OF · {quantity(g.quantity, data.unit)}</p>)}{data.needs.lines.length > 0 && <Table headings={['OF (primeras 5)', 'Estado', 'Pendiente', 'Inicio planificado']}>{data.needs.lines.map((n, i) => <tr key={i}><td>{n.code}</td><td>{n.situation}</td><td>{quantity(n.quantity, data.unit)}</td><td>{n.plannedDate ? date(n.plannedDate) : 'Sin planificación'}</td></tr>)}</Table>}
    <details className="sheet-card"><summary>No conformidades históricas ({data.nonConformities.length})</summary><p className="sheet-muted">Datos estructurados de calidad. El relato libre se omite porque puede contener datos personales. El estado y la fecha de cierre se muestran por separado.</p>{data.nonConformities.map(n => <article className="sheet-card" key={n.code}><strong>{n.code} · {date(n.date)}</strong><p>{n.supplier} · {n.status} · {n.closedDate ? `Cierre: ${date(n.closedDate)}` : 'Sin cierre informado'}</p><p>OF: {n.manufacturingOrder || 'No informada'} · Pedido: {n.order || 'No informado'} · Rechazado: {number(n.rejectedQuantity)} · Severidad: {number(n.severity)}{n.repetitive ? ' · Repetitiva' : ''}</p></article>)}{!data.nonConformities.length && <Empty>Sin no conformidades enlazadas.</Empty>}</details>
  </>;
}
