import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  Plus,
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
  productionSection?: string;
};

type MaterialLine = {
  id: string;
  code: string;
  description: string;
  quantity: number;
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

const storageKey = 'materiales-ot-state-v2';

function App() {
  const [orderCode, setOrderCode] = useState('');
  const [ofs, setOfs] = useState<OfBlock[]>(() => [createOf()]);
  const [databaseState, setDatabaseState] = useState<'checking' | 'ok' | 'error'>('checking');
  const [message, setMessage] = useState<Message>({ text: '', type: 'idle' });
  const [isExporting, setIsExporting] = useState(false);
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
    if (!article.code) {
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

        const existing = ofBlock.materials.find((line) => line.code === article.code);
        if (existing) {
          return {
            ...ofBlock,
            materials: ofBlock.materials.map((line) =>
              line.code === article.code
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
              code: article.code.toUpperCase(),
              description: article.description || '',
              quantity: roundQuantity(quantity)
            }
          ]
        };
      })
    );
    setMessage({ text: 'Linea anadida.', type: 'ok' });
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

  async function exportExcel() {
    setIsExporting(true);
    setMessage({ text: 'Generando Excel...', type: 'idle' });

    try {
      const response = await fetch('/api/export', {
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

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo generar el Excel.');
      }

      const blob = await response.blob();
      downloadBlob(blob, getFilename(response.headers.get('Content-Disposition')));
      setMessage({ text: 'Excel generado.', type: 'ok' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Error inesperado.', type: 'error' });
    } finally {
      setIsExporting(false);
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

      <section className="workspace">
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

          <button className="button button-primary" type="button" onClick={exportExcel} disabled={isExporting}>
            {isExporting ? <Loader2 className="spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
            Descargar Excel
          </button>
          <button className="button button-ghost" type="button" onClick={addOf}>
            <Plus aria-hidden="true" />
            Anadir OF
          </button>
          <button className="button button-muted" type="button" onClick={clearAll}>
            <X aria-hidden="true" />
            Limpiar
          </button>

          <div className={`notice ${message.type}`} aria-live="polite">
            {message.text}
          </div>
        </aside>

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
    </main>
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

      <div className="selected-article">
        {selectedArticle
          ? `${selectedArticle.code} · ${selectedArticle.description || ''}`
          : 'Busca en la base de datos o escribe un codigo exacto.'}
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
          placeholder="Codigo o descripcion"
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
                {article.productionSection && <em>{article.productionSection}</em>}
              </button>
            ))
          )}
        </div>
      )}
    </label>
  );
});

function MaterialTable({
  ofBlock,
  onRemoveLine
}: {
  ofBlock: OfBlock;
  onRemoveLine: (ofId: string, lineId: string) => void;
}) {
  return (
    <table className="materials-table">
      <thead>
        <tr>
          <th>Articulo</th>
          <th>Descripcion</th>
          <th>Cantidad</th>
          <th aria-label="Acciones" />
        </tr>
      </thead>
      <tbody>
        {ofBlock.materials.length === 0 ? (
          <tr>
            <td className="empty-row" colSpan={4}>Sin materiales todavia.</td>
          </tr>
        ) : (
          ofBlock.materials.map((line) => (
            <tr key={line.id}>
              <td><strong>{line.code}</strong></td>
              <td>{line.description}</td>
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

function getFilename(disposition: string | null) {
  const match = /filename="([^"]+)"/.exec(disposition || '');
  return match?.[1] || 'reserva-materiales.xlsx';
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById('root')!).render(<App />);
