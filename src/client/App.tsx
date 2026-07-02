import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
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
  includeOmitted: boolean;
};

const storageKey = 'materiales-ot-state-v3';
const technicalTerms = new Set([
  'BD',
  'ID',
  'OF',
  'PVC',
  'RPS',
  'SAT',
  'TGM',
  'UNE',
  'UPN',
  'UV'
]);
const lowerCaseWords = new Set(['a', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'sin', 'u', 'y']);
const wordCorrections: Record<string, string> = {
  acidos: 'ácidos',
  acrilico: 'acrílico',
  acrilicos: 'acrílicos',
  agricola: 'agrícola',
  anodizado: 'anodizado',
  aplicacion: 'aplicación',
  automatizacion: 'automatización',
  caldereria: 'calderería',
  cerrajeria: 'cerrajería',
  clasificacion: 'clasificación',
  conexion: 'conexión',
  confeccion: 'confección',
  decoracion: 'decoración',
  descripcion: 'descripción',
  electrico: 'eléctrico',
  electricos: 'eléctricos',
  elevacion: 'elevación',
  fijacion: 'fijación',
  fotografico: 'fotográfico',
  impresion: 'impresión',
  informatica: 'informática',
  linea: 'línea',
  lineas: 'líneas',
  maquinas: 'máquinas',
  metalicos: 'metálicos',
  motorizacion: 'motorización',
  plasticos: 'plásticos',
  plastica: 'plástica',
  poliester: 'poliéster',
  proteccion: 'protección',
  quimicos: 'químicos',
  reparacion: 'reparación',
  rotulacion: 'rotulación',
  seccion: 'sección',
  sujecion: 'sujeción',
  tornilleria: 'tornillería',
  utiles: 'útiles',
  vehiculos: 'vehículos',
  vinilica: 'vinílica'
};
const defaultCatalogFilters: CatalogFilterState = {
  q: '',
  family: '',
  subfamily: '',
  unit: '',
  productionSection: '',
  active: true,
  hideBlocked: true,
  includeOmitted: false
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
      setMessage({ text: 'Selecciona o escribe un artículo.', type: 'error' });
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
      text: article.widthWarning ? `Línea añadida. Aviso: ${article.widthWarning}` : 'Línea añadida.',
      type: article.widthWarning ? 'error' : 'ok'
    });
  }

  function addLineByOfValue(ofValue: string, article: Article, quantity: number) {
    const of = ofValue.trim();
    const code = String(article.code || '').trim().toUpperCase();

    if (!of) {
      setMessage({ text: 'Escribe o selecciona una OF destino.', type: 'error' });
      return false;
    }

    if (!code) {
      setMessage({ text: 'Selecciona o escribe un artículo.', type: 'error' });
      return false;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessage({ text: 'La cantidad debe ser mayor que cero.', type: 'error' });
      return false;
    }

    setOfs((current) => {
      const existing = current.find((ofBlock) => ofBlock.of.trim() === of);
      const emptyDraft = current.find((ofBlock) => !ofBlock.of.trim() && ofBlock.materials.length === 0);
      const material = buildMaterialLine(article, quantity);

      if (!existing) {
        if (emptyDraft) {
          return current.map((ofBlock) =>
            ofBlock.id === emptyDraft.id ? { ...ofBlock, of, materials: [material] } : ofBlock
          );
        }

        return [...current, { id: crypto.randomUUID(), of, materials: [material] }];
      }

      return current.map((ofBlock) => {
        if (ofBlock.id !== existing.id) return ofBlock;

        const existingLine = ofBlock.materials.find((line) => line.code === code);
        if (existingLine) {
          return {
            ...ofBlock,
            materials: ofBlock.materials.map((line) =>
              line.code === code
                ? { ...line, quantity: roundQuantity(line.quantity + quantity) }
                : line
            )
          };
        }

        return { ...ofBlock, materials: [...ofBlock.materials, material] };
      });
    });

    setMessage({
      text: article.widthWarning ? `Línea añadida. Aviso: ${article.widthWarning}` : 'Línea añadida.',
      type: article.widthWarning ? 'error' : 'ok'
    });
    return true;
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
            <p>Excel compatible con RPS, artículos desde la base de datos.</p>
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
          Artículos
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
        <ArticleCatalog ofs={ofs} onAddLineToOf={addLineByOfValue} />
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
        <span>N.º pedido</span>
        <input
          value={orderCode}
          onChange={(event) => setOrderCode(event.target.value)}
          autoComplete="off"
        />
      </label>

      <div className="metrics">
        <Metric label="OFs" value={totals.ofs} />
        <Metric label="líneas" value={totals.lines} />
        <Metric label="uds." value={formatNumber(totals.units)} />
      </div>

      <button className="button button-primary" type="button" onClick={onSave} disabled={isSavingToNetwork}>
        {isSavingToNetwork ? <Loader2 className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        Generar reserva
      </button>
      <button className="button button-ghost" type="button" onClick={onAddOf}>
        <Plus aria-hidden="true" />
        Añadir OF
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
          />
        </label>
        <button className="button button-secondary" type="button" onClick={commitLine}>
          <PackagePlus aria-hidden="true" />
          Añadir
        </button>
      </div>

      <div className={`selected-article ${selectedArticle?.widthWarning ? 'warning' : ''}`}>
        {selectedArticle
          ? `${selectedArticle.code} · ${formatDisplayText(selectedArticle.description) || ''}${selectedArticle.detectedWidth ? ` · ancho ${selectedArticle.detectedWidth}` : ''}`
          : 'Busca en la base de datos o escribe un código exacto.'}
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
      <span>Artículo</span>
      <div className="search-input">
        <Search aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(articles.length > 0)}
          autoComplete="off"
        />
        {isLoading && <Loader2 className="spin" aria-hidden="true" />}
      </div>

      {isOpen && (
        <div className="results">
          {articles.length === 0 ? (
            <div className="empty-result">Sin resultados. Puedes usar el código escrito.</div>
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
                <span>{formatDisplayText(article.description)}</span>
                <em>{[article.family, article.subfamily, article.productionSection].filter(Boolean).map(formatDisplayText).join(' · ')}</em>
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
  onAddLineToOf
}: {
  ofs: OfBlock[];
  onAddLineToOf: (of: string, article: Article, quantity: number) => boolean;
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
    const params = new URLSearchParams({
      family: filters.family,
      subfamily: filters.subfamily,
      includeOmitted: String(filters.includeOmitted)
    });

    fetch(`/api/article-filters?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error('filters failed');
        return response.json();
      })
      .then((data) => setFilterOptions(data.filters || filterOptions))
      .catch(() => setFilterOptions(filterOptions));
  }, [filters.family, filters.subfamily, filters.includeOmitted]);

  useEffect(() => {
    setFilters((current) => {
      const next = { ...current };
      let changed = false;

      if (next.family && !filterOptions.family.includes(next.family)) {
        next.family = '';
        next.subfamily = '';
        changed = true;
      }

      if (next.subfamily && !filterOptions.subfamily.includes(next.subfamily)) {
        next.subfamily = '';
        changed = true;
      }

      if (next.unit && !filterOptions.unit.includes(next.unit)) {
        next.unit = '';
        changed = true;
      }

      if (next.productionSection && !filterOptions.productionSection.includes(next.productionSection)) {
        next.productionSection = '';
        changed = true;
      }

      return changed ? next : current;
    });
  }, [filterOptions]);

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
      includeOmitted: String(debouncedFilters.includeOmitted),
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
              autoComplete="off"
            />
          </div>
        </label>
        <FilterSelect
          label="Familia"
          value={filters.family}
          options={filterOptions.family}
          onChange={(value) => setFilters((current) => ({ ...current, family: value, subfamily: '' }))}
        />
        <FilterSelect label="Subfamilia" value={filters.subfamily} options={filterOptions.subfamily} onChange={(value) => updateFilter('subfamily', value)} />
        <FilterSelect label="Unidad" value={filters.unit} options={filterOptions.unit} onChange={(value) => updateFilter('unit', value)} />
        <FilterSelect label="Sección" value={filters.productionSection} options={filterOptions.productionSection} onChange={(value) => updateFilter('productionSection', value)} />
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
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={filters.includeOmitted}
            onChange={(event) => updateFilter('includeOmitted', event.target.checked)}
          />
          Mostrar omitidos
        </label>
      </div>

      <div className="catalog-table-wrap">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Artículo</th>
              <th>Clasificación</th>
              <th>Unidad</th>
              <th>Ancho</th>
              <th>Sección</th>
              <th>Estado</th>
              <th>Añadir a reserva</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="empty-row" colSpan={8}>
                  <Loader2 className="spin inline-loader" aria-hidden="true" />
                  Cargando artículos...
                </td>
              </tr>
            ) : articles.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={8}>Sin artículos con estos filtros.</td>
              </tr>
            ) : (
              articles.map((article) => (
                <ArticleRow
                  key={article.idArticle}
                  article={article}
                  ofs={ofs}
                  onAddLineToOf={onAddLineToOf}
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
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const visibleOptions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es-ES');
    return q
      ? options.filter((option) => option.toLocaleLowerCase('es-ES').includes(q)).slice(0, 80)
      : options.slice(0, 80);
  }, [options, query]);
  const isDisabled = options.length === 0 && value === '';

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return (
    <div className="field apple-select-field" ref={rootRef}>
      <span>{label}</span>
      <button
        className={`apple-select-trigger ${isOpen ? 'open' : ''}`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value ? formatDisplayText(value) : 'Todos'}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {isOpen && !isDisabled && (
        <div className="apple-select-menu">
          {options.length > 8 && (
            <div className="apple-select-search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoFocus
              />
            </div>
          )}
          <div className="apple-select-options" role="listbox">
            <button
              className={`apple-select-option ${value === '' ? 'selected' : ''}`}
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setQuery('');
              }}
              role="option"
              aria-selected={value === ''}
            >
              <span>Todos</span>
              {value === '' && <Check aria-hidden="true" />}
            </button>
            {visibleOptions.map((option) => (
              <button
                className={`apple-select-option ${value === option ? 'selected' : ''}`}
                type="button"
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                  setQuery('');
                }}
                role="option"
                aria-selected={value === option}
              >
                <span>{formatDisplayText(option)}</span>
                {value === option && <Check aria-hidden="true" />}
              </button>
            ))}
            {visibleOptions.length === 0 && (
              <div className="apple-select-empty">Sin opciones</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ArticleRow({
  article,
  ofs,
  onAddLineToOf
}: {
  article: Article;
  ofs: OfBlock[];
  onAddLineToOf: (of: string, article: Article, quantity: number) => boolean;
}) {
  const [quantity, setQuantity] = useState('');
  const writtenOfs = useMemo(() => ofs.map((ofBlock) => ofBlock.of.trim()).filter(Boolean), [ofs]);
  const [selectedOf, setSelectedOf] = useState('');
  const [newOf, setNewOf] = useState('');
  const isNewOf = selectedOf === '__new__';
  const ofTarget = isNewOf ? newOf : selectedOf;

  function commitCatalogLine() {
    const added = onAddLineToOf(ofTarget, article, Number(quantity));
    if (added) {
      setQuantity('');
      if (isNewOf) {
        setSelectedOf('');
        setNewOf('');
      }
    }
  }

  const isBlocked = article.blockedPurchase || article.blockedManufacturing;
  const showProductLine = article.productLine && !article.productLine.toLowerCase().startsWith('creado en traspaso');

  return (
    <tr>
      <td className="catalog-reference">
        <strong>{article.code}</strong>
        {article.normaUne && <span>{formatDisplayText(article.normaUne)}</span>}
      </td>
      <td className="catalog-article">
        <span>{formatDisplayText(article.description) || '-'}</span>
        {showProductLine && <em>{formatDisplayText(article.productLine)}</em>}
      </td>
      <td className="catalog-classification">
        {article.family && <span className="catalog-chip strong">{formatDisplayText(article.family)}</span>}
        {article.subfamily && <span className="catalog-chip">{formatDisplayText(article.subfamily)}</span>}
        {!article.family && !article.subfamily && <span className="catalog-muted">-</span>}
      </td>
      <td className="catalog-unit" title={formatDisplayText(article.unitDescription)}>{article.unitCode || '-'}</td>
      <td className="catalog-width">
        <span className={article.widthWarning ? 'width-warning' : ''}>
          {article.detectedWidth ? `${article.detectedWidth}` : '-'}
        </span>
        {article.widthWarning && <AlertTriangle aria-label={article.widthWarning} />}
      </td>
      <td className="catalog-section">{formatDisplayText(article.productionSection) || '-'}</td>
      <td>
        <span className={`status-chip ${!article.isActive ? 'inactive' : isBlocked ? 'blocked' : 'active'}`}>
          {!article.isActive ? 'Inactivo' : isBlocked ? 'Bloqueado' : 'Activo'}
        </span>
      </td>
      <td className="catalog-add-cell">
        <div className="row-add">
          <label className="row-add-field">
            <span>OF</span>
            <select
              value={selectedOf}
              onChange={(event) => {
                setSelectedOf(event.target.value);
                if (event.target.value !== '__new__') setNewOf('');
              }}
              aria-label="OF destino"
            >
              <option value="">Seleccionar OF</option>
              {writtenOfs.map((of) => (
                <option key={of} value={of}>{of}</option>
              ))}
              <option value="__new__">Nueva OF...</option>
            </select>
          </label>
          {isNewOf && (
            <label className="row-add-field new-of">
              <span>Nueva OF</span>
              <input
                value={newOf}
                onChange={(event) => setNewOf(event.target.value.trim())}
                placeholder="Escribir OF"
                aria-label="Nueva OF"
              />
            </label>
          )}
          <label className="row-add-field quantity">
            <span>Cant.</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitCatalogLine();
                }
              }}
              type="number"
              min="0.000001"
              step="0.01"
              aria-label="Cantidad"
            />
          </label>
          <button className="row-add-button" type="button" onClick={commitCatalogLine}>
            <PackagePlus aria-hidden="true" />
            Añadir
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
            <th>Artículo</th>
            <th>Descripción</th>
            <th>Ancho</th>
            <th>Cantidad</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {ofBlock.materials.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={5}>Sin materiales todavía.</td>
            </tr>
          ) : (
            ofBlock.materials.map((line) => (
              <tr key={line.id}>
                <td><strong>{line.code}</strong></td>
                <td>{formatDisplayText(line.description)}</td>
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

function buildMaterialLine(article: Article, quantity: number): MaterialLine {
  return {
    id: crypto.randomUUID(),
    code: String(article.code || '').trim().toUpperCase(),
    description: article.description || '',
    quantity: roundQuantity(quantity),
    width: article.detectedWidth ?? null,
    widthWarning: article.widthWarning ?? null
  };
}

function roundQuantity(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(value || 0);
}

function formatDisplayText(value?: string | null) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  let hasWrittenWord = false;

  return clean
    .split(/(\s+|[-/(),.])/)
    .map((part) => {
      if (!part.trim() || /^[-/(),.]$/.test(part)) return part;
      if (/^\d/.test(part)) return part;

      const upper = part.toLocaleUpperCase('es-ES');
      if (technicalTerms.has(upper) || /^ML\d*/i.test(part)) {
        hasWrittenWord = true;
        return upper;
      }

      const lower = applyWordCorrection(part.toLocaleLowerCase('es-ES'));
      const shouldCapitalize = !hasWrittenWord && !lowerCaseWords.has(lower);
      hasWrittenWord = true;

      return shouldCapitalize
        ? lower.charAt(0).toLocaleUpperCase('es-ES') + lower.slice(1)
        : lower;
    })
    .join('')
    .replace(/\s+([),.])/g, '$1')
    .replace(/([(])\s+/g, '$1');
}

function applyWordCorrection(word: string) {
  return wordCorrections[word] || word;
}

createRoot(document.getElementById('root')!).render(<App />);
