import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Boxes,
  Database,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  Plus,
  Save,
  Search,
  Trash2,
  X
} from 'lucide-react';
import './styles.css';

type Article = {
  idArticle: string;
  code: string;
  description: string;
  warehouseUnit?: string;
  purchaseUnit?: string;
  unitCode?: string;
  unitDescription?: string;
  productLine?: string;
  family?: string;
  subfamily?: string;
  productionSection?: string;
  businessLine?: string;
  normaUne?: string;
  blockedPurchase?: boolean;
  blockedManufacturing?: boolean;
  inactiveDate?: string | null;
  isActive?: boolean;
  detectedWidth?: number | null;
  widthWarning?: string | null;
};

type MaterialLine = {
  id: string;
  code: string;
  description: string;
  quantity: number;
  width?: number | null;
  widthWarning?: string | null;
};

type OfBlock = {
  id: string;
  of: string;
  materials: MaterialLine[];
};

type PersistedState = {
  orderCode: string;
  ofs: OfBlock[];
};

type Message = {
  text: string;
  type: 'ok' | 'error' | 'idle';
};

type ArticleFilters = {
  family: string[];
  subfamily: string[];
  unit: string[];
  productionSection: string[];
};

type CatalogFilterState = {
  q: string;
  family: string;
  subfamily: string;
  unit: string;
  productionSection: string;
  active: boolean;
  hideBlocked: boolean;
};

const storageKey = 'materiales-ot-state-v2';
const defaultCatalogFilters: CatalogFilterState = {
  q: '',
  family: '',
  subfamily: '',
  unit: '',
  productionSection: '',
  active: true,
  hideBlocked: false
};

function App() {
  const [orderCode, setOrderCode] = useState('');
  const [ofs, setOfs] = useState<OfBlock[]>(() => [createOf()]);
  const [databaseState, setDatabaseState] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState<Message>({ text: '', type: 'idle' });
  const [isSavingToNetwork, setIsSavingToNetwork] = useState(false);
  const [activeTab, setActiveTab] = useState<'reservations' | 'articles'>('reservations');
  const [, startTransition] = useTransition();

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as PersistedState;
      setOrderCode(saved.orderCode || '');
      setOfs(saved.ofs?.length ? saved.ofs : [createOf()]);
    } catch {
      setOfs([createOf()]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ orderCode, ofs }));
  }, [orderCode, ofs]);

  useEffect(() => {
    let alive = true;

    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('health failed');
        return response.json();
      })
      .then((data) => {
        if (alive) setDatabaseState(data.database ? 'ok' : 'error');
      })
      .catch(() => {
        if (alive) setDatabaseState('error');
      });

    return () => {
      alive = false;
    };
  }, []);

  const totals = useMemo(() => {
    const lines = ofs.flatMap((ofBlock) => ofBlock.materials);
    return {
      ofs: ofs.length,
      lines: lines.length,
      units: roundQuantity(lines.reduce((sum, line) => sum + line.quantity, 0))
    };
  }, [ofs]);

  function addOf() {
    startTransition(() => setOfs((current) => [...current, createOf()]));
  }

  function removeOf(id: string) {
    setOfs((current) => {
      const next = current.filter((ofBlock) => ofBlock.id !== id);
      return next.length ? next : [createOf()];
    });
  }

  function updateOf(id: string, of: string) {
    setOfs((current) => current.map((item) => (item.id === id ? { ...item, of } : item)));
  }

  function addLine(ofId: string, article: Article, quantity: number) {
    const code = String(article.code || '').trim().toUpperCase();
    if (!code) {
      setMessage({ text: 'Selecciona o escribe un articulo.', type: 'error' });
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage({ text: 'La cantidad debe ser mayor que cero.', type: 'error' });
      return;
    }

    setOfs((current) =>
      current.map((ofBlock) => {
        if (ofBlock.id !== ofId) return ofBlock;

        const existing = ofBlock.materials.find((line) => line.code === code);
        if (existing) {
          return {
            ...ofBlock,
            materials: ofBlock.materials.map((line) =>
              line.code === code
                ? { ...line, quantity: roundQuantity(line.quantity + quantity) }
                : line
            )
          };
        }

        return {
          ...ofBlock,
          materials: [
            ...ofBlock.materials,
            {
              id: crypto.randomUUID(),
              code,
              description: article.description || '',
              quantity: roundQuantity(quantity),
              width: article.detectedWidth ?? null,
              widthWarning: article.widthWarning ?? null
            }
          ]
        };
      })
    );
    setMessage({
      text: article.widthWarning ? `Linea anadida. Aviso: ${article.widthWarning}` : 'Linea anadida.',
      type: article.widthWarning ? 'error' : 'ok'
    });
  }

  function removeLine(ofId: string, lineId: string) {
    setOfs((current) =>
      current.map((ofBlock) =>
        ofBlock.id === ofId
          ? { ...ofBlock, materials: ofBlock.materials.filter((line) => line.id !== lineId) }
          : ofBlock
      )
    );
  }

  function clearAll() {
    setOrderCode('');
    setOfs([createOf()]);
    setMessage({ text: 'Formulario limpio.', type: 'ok' });
  }

  async function saveExcelToNetwork() {
    setIsSavingToNetwork(true);
    setMessage({ text: 'Generando reservas en carpeta compartida...', type: 'idle' });

    try {
      const response = await fetch('/api/export/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode,
          ofs: ofs.map((ofBlock) => ({
            of: ofBlock.of,
            materials: ofBlock.materials
          }))
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo guardar el Excel en la carpeta compartida.');
      }

      const savedCount = Array.isArray(data.saved) ? data.saved.length : 0;
      const archiveText = data.orderArchive ? ` Pedido archivado: ${data.orderArchive.filename}` : '';
      setMessage({
        text: savedCount === 1
          ? `Reserva generada: ${data.saved[0].filename}.${archiveText}`
          : `Reservas generadas: ${savedCount}.${archiveText}`,
        type: 'ok'
      });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Error inesperado.', type: 'error' });
    } finally {
      setIsSavingToNetwork(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <FileSpreadsheet aria-hidden="true" />
          <div>
            <h1>Reserva de materiales</h1>
            <p>Excel compatible con RPS, articulos desde la base de datos.</p>
          </div>
        </div>
        <DatabaseStatus state={databaseState} />
      </header>

      <nav className="app-tabs" aria-label="Vistas">
        <button
          className={activeTab === 'reservations' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('reservations')}
        >
          <FileSpreadsheet aria-hidden="true" />
          Reservas
        </button>
        <button
          className={activeTab === 'articles' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('articles')}
        >
          <Boxes aria-hidden="true" />
          Articulos
        </button>
      </nav>

      {activeTab === 'reservations' ? (
        <section className="workspace">
          <ReservationPanel
            orderCode={orderCode}
            setOrderCode={setOrderCode}
            totals={totals}
            message={message}
            isSavingToNetwork={isSavingToNetwork}
            onSave={saveExcelToNetwork}
            onAddOf={addOf}
            onClearAll={clearAll}
          />

          <section className="of-list">
            {ofs.map((ofBlock, index) => (
              <OfCard
                key={ofBlock.id}
                index={index}
                ofBlock={ofBlock}
                onChangeOf={updateOf}
                onRemoveOf={removeOf}
                onAddLine={addLine}
                onRemoveLine={removeLine}
              />
            ))}
          </section>
        </section>
      ) : (
        <ArticleCatalog ofs={ofs} onAddLine={addLine} />
      )}
    </main>
  );
}

function ReservationPanel({
  orderCode,
  setOrderCode,
  totals,
  message,
  isSavingToNetwork,
  onSave,
  onAddOf,
  onClearAll
}: {
  orderCode: string;
  setOrderCode: (value: string) => void;
  totals: { ofs: number; lines: number; units: number };
  message: Message;
  isSavingToNetwork: boolean;
  onSave: () => void;
  onAddOf: () => void;
  onClearAll: () => void;
}) {
  return (
    <aside className="summary-panel">
      <label className="field">
        <span>Nº pedido</span>
        <input
          value={orderCode}
          onChange={(event) => setOrderCode(event.target.value)}
          placeholder="AR2602587"
          autoComplete="off"
        />
      </label>

      <div className="metrics">
        <Metric label="OFs" value={totals.ofs} />
        <Metric label="lineas" value={totals.lines} />
        <Metric label="uds." value={formatNumber(totals.units)} />
      </div>

      <button className="button button-primary" type="button" onClick={onSave} disabled={isSavingToNetwork}>
        {isSavingToNetwork ? <Loader2 className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        Generar reserva
      </button>
      <button className="button button-ghost" type="button" onClick={onAddOf}>
        <Plus aria-hidden="true" />
        Anadir OF
      </button>
      <button className="button button-muted" type="button" onClick={onClearAll}>
        <X aria-hidden="true" />
        Limpiar
      </button>

      <div className={`notice ${message.type}`} aria-live="polite">
        {message.text}
      </div>
    </aside>
  );
}

function DatabaseStatus({ state }: { state: 'checking' | 'ok' | 'error' }) {
  const label = state === 'checking' ? 'BD: comprobando' : state === 'ok' ? 'BD: conectada' : 'BD: error';

  return (
    <div className={`status-pill ${state}`}>
      <Database aria-hidden="true" />
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function OfCard({
  index,
  ofBlock,
  onChangeOf,
  onRemoveOf,
  onAddLine,
  onRemoveLine
}: {
  index: number;
  ofBlock: OfBlock;
  onChangeOf: (id: string, of: string) => void;
  onRemoveOf: (id: string) => void;
  onAddLine: (ofId: string, article: Article, quantity: number) => void;
  onRemoveLine: (ofId: string, lineId: string) => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const pickerRef = useRef<ArticlePickerHandle>(null);

  function commitLine() {
    const article = selectedArticle || pickerRef.current?.typedArticle();
    if (!article) return;
    onAddLine(ofBlock.id, article, Number(quantity));
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
  }

  return (
    <article className="of-card">
      <div className="of-header">
        <label className="field of-number">
          <span>OF {index + 1}</span>
          <input
            value={ofBlock.of}
            onChange={(event) => onChangeOf(ofBlock.id, event.target.value.trim())}
            inputMode="numeric"
            placeholder="228890"
          />
        </label>
        <button className="icon-button danger" type="button" onClick={() => onRemoveOf(ofBlock.id)} title="Eliminar OF">
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      <div className="line-editor">
        <ArticlePicker ref={pickerRef} selected={selectedArticle} onSelect={setSelectedArticle} />
        <label className="field quantity-field">
          <span>Cantidad</span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitLine();
              }
            }}
            type="number"
            min="0.000001"
            step="0.01"
            placeholder="1"
          />
        </label>
        <button className="button button-secondary" type="button" onClick={commitLine}>
          <PackagePlus aria-hidden="true" />
          Anadir
        </button>
      </div>

      <div className={`selected-article ${selectedArticle?.widthWarning ? 'warning' : ''}`}>
        {selectedArticle
          ? `${selectedArticle.code} · ${selectedArticle.description || ''}${selectedArticle.detectedWidth ? ` · ancho ${selectedArticle.detectedWidth}` : ''}`
          : 'Busca en la base de datos o escribe un codigo exacto.'}
        {selectedArticle?.widthWarning && (
          <span>
            <AlertTriangle aria-hidden="true" />
            {selectedArticle.widthWarning}
          </span>
        )}
      </div>

      <MaterialTable ofBlock={ofBlock} onRemoveLine={onRemoveLine} />
    </article>
  );
}

type ArticlePickerHandle = {
  clear: () => void;
  typedArticle: () => Article | null;
};

const ArticlePicker = React.forwardRef<ArticlePickerHandle, {
  selected: Article | null;
  onSelect: (article: Article) => void;
}>(({ selected, onSelect }, ref) => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  React.useImperativeHandle(ref, () => ({
    clear() {
      setQuery('');
      setDebounced('');
      setArticles([]);
      setIsOpen(false);
    },
    typedArticle() {
      const code = query.trim().toUpperCase();
      return code ? { idArticle: code, code, description: '' } : null;
    }
  }), [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (selected && query !== selected.code) {
      setQuery(selected.code);
    }
  }, [selected]);

  useEffect(() => {
    if (debounced.length < 2) {
      setArticles([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    fetch(`/api/articles?q=${encodeURIComponent(debounced)}&limit=20`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('search failed');
        return response.json();
      })
      .then((data) => {
        setArticles(data.articles || []);
        setIsOpen(true);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setArticles([]);
          setIsOpen(false);
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [debounced]);

  return (
    <label className="field article-search">
      <span>Articulo</span>
      <div className="search-input">
        <Search aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(articles.length > 0)}
          placeholder="Codigo, material, color, medida..."
          autoComplete="off"
        />
        {isLoading && <Loader2 className="spin" aria-hidden="true" />}
      </div>

      {isOpen && (
        <div className="results">
          {articles.length === 0 ? (
            <div className="empty-result">Sin resultados. Puedes usar el codigo escrito.</div>
          ) : (
            articles.map((article) => (
              <button
                className="result-item"
                type="button"
                key={article.idArticle}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(article);
                  setQuery(article.code);
                  setIsOpen(false);
                }}
              >
                <strong>{article.code}</strong>
                <span>{article.description}</span>
                <em>{[article.family, article.subfamily, article.productionSection].filter(Boolean).join(' · ')}</em>
              </button>
            ))
          )}
        </div>
      )}
    </label>
  );
});

function ArticleCatalog({
  ofs,
  onAddLine
}: {
  ofs: OfBlock[];
  onAddLine: (ofId: string, article: Article, quantity: number) => void;
}) {
  const [filters, setFilters] = useState<CatalogFilterState>(defaultCatalogFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<CatalogFilterState>(defaultCatalogFilters);
  const [filterOptions, setFilterOptions] = useState<ArticleFilters>({
    family: [],
    subfamily: [],
    unit: [],
    productionSection: []
  });
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/article-filters')
      .then((response) => {
        if (!response.ok) throw new Error('filters failed');
        return response.json();
      })
      .then((data) => setFilterOptions(data.filters || filterOptions))
      .catch(() => setFilterOptions(filterOptions));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilters(filters), 220);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      q: debouncedFilters.q,
      family: debouncedFilters.family,
      subfamily: debouncedFilters.subfamily,
      unit: debouncedFilters.unit,
      productionSection: debouncedFilters.productionSection,
      active: String(debouncedFilters.active),
      hideBlocked: String(debouncedFilters.hideBlocked),
      limit: '180'
    });

    setIsLoading(true);
    fetch(`/api/article-list?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('article list failed');
        return response.json();
      })
      .then((data) => setArticles(data.articles || []))
      .catch((error) => {
        if (error.name !== 'AbortError') setArticles([]);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [debouncedFilters]);

  function updateFilter<K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="catalog-view">
      <div className="catalog-toolbar">
        <label className="field filter-search">
          <span>Buscar</span>
          <div className="search-input">
            <Search aria-hidden="true" />
            <input
              value={filters.q}
              onChange={(event) => updateFilter('q', event.target.value)}
              placeholder="Familia, referencia, color, seccion..."
              autoComplete="off"
            />
          </div>
        </label>
        <FilterSelect label="Familia" value={filters.family} options={filterOptions.family} onChange={(value) => updateFilter('family', value)} />
        <FilterSelect label="Subfamilia" value={filters.subfamily} options={filterOptions.subfamily} onChange={(value) => updateFilter('subfamily', value)} />
        <FilterSelect label="Unidad" value={filters.unit} options={filterOptions.unit} onChange={(value) => updateFilter('unit', value)} />
        <FilterSelect label="Seccion" value={filters.productionSection} options={filterOptions.productionSection} onChange={(value) => updateFilter('productionSection', value)} />
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={filters.active}
            onChange={(event) => updateFilter('active', event.target.checked)}
          />
          Activos
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={filters.hideBlocked}
            onChange={(event) => updateFilter('hideBlocked', event.target.checked)}
          />
          Sin bloqueos
        </label>
      </div>

      <div className="catalog-table-wrap">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Familia</th>
              <th>Subfamilia</th>
              <th>Referencia</th>
              <th>Articulo</th>
              <th>Unidad</th>
              <th>Ancho</th>
              <th>Seccion</th>
              <th>Estado</th>
              <th>Anadir</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="empty-row" colSpan={9}>
                  <Loader2 className="spin inline-loader" aria-hidden="true" />
                  Cargando articulos...
                </td>
              </tr>
            ) : articles.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={9}>Sin articulos con estos filtros.</td>
              </tr>
            ) : (
              articles.map((article) => (
                <ArticleRow
                  key={article.idArticle}
                  article={article}
                  ofs={ofs}
                  onAddLine={onAddLine}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ArticleRow({
  article,
  ofs,
  onAddLine
}: {
  article: Article;
  ofs: OfBlock[];
  onAddLine: (ofId: string, article: Article, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const [ofId, setOfId] = useState(ofs[0]?.id || '');

  useEffect(() => {
    if (!ofs.some((item) => item.id === ofId)) {
      setOfId(ofs[0]?.id || '');
    }
  }, [ofs, ofId]);

  const isBlocked = article.blockedPurchase || article.blockedManufacturing;

  return (
    <tr>
      <td>{article.family || '-'}</td>
      <td>{article.subfamily || '-'}</td>
      <td><strong>{article.code}</strong></td>
      <td>{article.description}</td>
      <td title={article.unitDescription || ''}>{article.unitCode || '-'}</td>
      <td>
        <span className={article.widthWarning ? 'width-warning' : ''}>
          {article.detectedWidth ? `${article.detectedWidth}` : '-'}
        </span>
        {article.widthWarning && <AlertTriangle aria-label={article.widthWarning} />}
      </td>
      <td>{article.productionSection || '-'}</td>
      <td>
        <span className={`status-chip ${!article.isActive ? 'inactive' : isBlocked ? 'blocked' : 'active'}`}>
          {!article.isActive ? 'Inactivo' : isBlocked ? 'Bloqueado' : 'Activo'}
        </span>
      </td>
      <td>
        <div className="row-add">
          <select value={ofId} onChange={(event) => setOfId(event.target.value)} aria-label="OF destino">
            {ofs.map((ofBlock, index) => (
              <option key={ofBlock.id} value={ofBlock.id}>
                {ofBlock.of || `OF ${index + 1}`}
              </option>
            ))}
          </select>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            type="number"
            min="0.000001"
            step="0.01"
            aria-label="Cantidad"
          />
          <button className="icon-button add" type="button" onClick={() => onAddLine(ofId, article, Number(quantity))} title="Anadir a reserva">
            <PackagePlus aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MaterialTable({
  ofBlock,
  onRemoveLine
}: {
  ofBlock: OfBlock;
  onRemoveLine: (ofId: string, lineId: string) => void;
}) {
  return (
    <div className="materials-table-wrap">
      <table className="materials-table">
        <thead>
          <tr>
            <th>Articulo</th>
            <th>Descripcion</th>
            <th>Ancho</th>
            <th>Cantidad</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {ofBlock.materials.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={5}>Sin materiales todavia.</td>
            </tr>
          ) : (
            ofBlock.materials.map((line) => (
              <tr key={line.id}>
                <td><strong>{line.code}</strong></td>
                <td>{line.description}</td>
                <td>
                  <span className={line.widthWarning ? 'width-warning' : ''}>{line.width || '-'}</span>
                </td>
                <td>{formatNumber(line.quantity)}</td>
                <td>
                  <button className="remove-line" type="button" onClick={() => onRemoveLine(ofBlock.id, line.id)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function createOf(): OfBlock {
  return {
    id: crypto.randomUUID(),
    of: '',
    materials: []
  };
}

function roundQuantity(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(value || 0);
}

createRoot(document.getElementById('root')!).render(<App />);
