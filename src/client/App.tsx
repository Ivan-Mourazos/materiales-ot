import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  FileSpreadsheet,
  Folder,
  History,
  Info,
  Loader2,
  Monitor,
  Moon,
  PackagePlus,
  Plus,
  Save,
  Search,
  Sun,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import '@fontsource-variable/inter';
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
  stockTotal?: number | null;
  stocks?: { warehouseCode: string; warehouse: string; quantity: number }[];
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
  description: string;
  materials: MaterialLine[];
};

type PersistedState = {
  orderCode: string;
  ofs: OfBlock[];
};

type ToastType = 'ok' | 'error' | 'warn' | 'info';

type ToastAction = {
  label: string;
  run: () => void;
};

type Toast = {
  id: string;
  text: string;
  type: ToastType;
  action?: ToastAction;
  leaving?: boolean;
};

type ThemeMode = 'light' | 'dark' | 'system';

type ConnectionState = 'checking' | 'ok' | 'error';

type HistoryEntry = {
  id: string;
  createdAt: string;
  orderCode: string;
  ofs: { of: string; description?: string; materials: { code: string; description: string; quantity: number }[] }[];
  files: { of: string; filename: string; overwritten: boolean }[];
  orderArchive: { filename: string; overwritten: boolean } | null;
  totals: { ofs: number; lines: number; units: number };
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

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback para contextos no seguros (HTTP sin localhost)
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const storageKey = 'materiales-ot-state-v3';
const themeStorageKey = 'materiales-ot-theme';
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

function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(themeStorageKey);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    };

    apply();

    if (mode === 'system') {
      localStorage.removeItem(themeStorageKey);
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }

    localStorage.setItem(themeStorageKey, mode);
  }, [mode]);

  return { mode, setMode };
}

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))
    );
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 260);
  }, []);

  const pushToast = useCallback((text: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = uid();
    setToasts((current) => [...current.slice(-3), { id, text, type, action }]);
    const ttl = action ? 7000 : type === 'error' ? 6500 : 4200;
    window.setTimeout(() => dismissToast(id), ttl);
  }, [dismissToast]);

  return { toasts, pushToast, dismissToast };
}

function App() {
  const [orderCode, setOrderCode] = useState('');
  const [ofs, setOfs] = useState<OfBlock[]>(() => [createOf()]);
  const [databaseState, setDatabaseState] = useState<ConnectionState>('checking');
  const [networkState, setNetworkState] = useState<ConnectionState>('checking');
  const [isSavingToNetwork, setIsSavingToNetwork] = useState(false);
  const [activeTab, setActiveTab] = useState<'reservations' | 'articles' | 'history'>('reservations');
  const [overwritePrompt, setOverwritePrompt] = useState<string[] | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [, startTransition] = useTransition();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as PersistedState;
      setOrderCode(saved.orderCode || '');
      setOfs(
        saved.ofs?.length
          ? saved.ofs.map((ofBlock) => ({ ...ofBlock, description: ofBlock.description || '' }))
          : [createOf()]
      );
    } catch {
      setOfs([createOf()]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ orderCode, ofs }));
  }, [orderCode, ofs]);

  useEffect(() => {
    let alive = true;

    async function checkHealth() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('health failed');
        const data = await response.json();
        if (!alive) return;
        setDatabaseState(data.database ? 'ok' : 'error');
        setNetworkState(data.networkSave ? 'ok' : 'error');
      } catch {
        if (!alive) return;
        setDatabaseState('error');
        setNetworkState('error');
      }
    }

    checkHealth();
    const interval = window.setInterval(checkHealth, 60000);
    const handleFocus = () => checkHealth();
    window.addEventListener('focus', handleFocus);

    return () => {
      alive = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
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

  const duplicateOfs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ofBlock of ofs) {
      const key = ofBlock.of.trim();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return new Set(Array.from(counts).filter(([, count]) => count > 1).map(([key]) => key));
  }, [ofs]);

  function addOf() {
    startTransition(() => setOfs((current) => [...current, createOf()]));
  }

  function removeOf(id: string) {
    const index = ofs.findIndex((ofBlock) => ofBlock.id === id);
    if (index === -1) return;

    const removed = ofs[index];
    const next = ofs.filter((ofBlock) => ofBlock.id !== id);
    setOfs(next.length ? next : [createOf()]);

    if (removed.of.trim() || removed.materials.length > 0) {
      pushToast(`OF ${removed.of.trim() || index + 1} eliminada.`, 'info', {
        label: 'Deshacer',
        run: () =>
          setOfs((current) => {
            if (current.some((ofBlock) => ofBlock.id === removed.id)) return current;
            const rest = current.filter((ofBlock) => ofBlock.of.trim() || ofBlock.materials.length > 0);
            const at = Math.min(index, rest.length);
            return [...rest.slice(0, at), removed, ...rest.slice(at)];
          })
      });
    }
  }

  function updateOf(id: string, of: string) {
    setOfs((current) => current.map((item) => (item.id === id ? { ...item, of } : item)));
  }

  function updateOfDescription(id: string, description: string) {
    setOfs((current) => current.map((item) => (item.id === id ? { ...item, description } : item)));
  }

  function reuseReservation(entry: HistoryEntry) {
    const clones: OfBlock[] = entry.ofs.map((ofBlock) => ({
      id: uid(),
      of: '',
      description: ofBlock.description || '',
      materials: ofBlock.materials.map((line) => ({
        id: uid(),
        code: line.code,
        description: line.description || '',
        quantity: line.quantity,
        width: null,
        widthWarning: null
      }))
    }));

    setOfs((current) => {
      const rest = current.filter((ofBlock) => ofBlock.of.trim() || ofBlock.materials.length > 0);
      return [...rest, ...clones];
    });
    setActiveTab('reservations');
    pushToast('Materiales cargados desde el historial. Escribe las nuevas OF y el pedido.', 'info');
  }

  function addLine(ofId: string, article: Article, quantity: number) {
    const code = String(article.code || '').trim().toUpperCase();
    if (!code) {
      pushToast('Selecciona o escribe un artículo.', 'error');
      return false;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      pushToast('La cantidad debe ser mayor que cero.', 'error');
      return false;
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
              id: uid(),
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
    if (article.widthWarning) {
      pushToast(`Línea añadida. Aviso: ${article.widthWarning}`, 'warn');
    } else {
      pushToast('Línea añadida.', 'ok');
    }
    return true;
  }

  function addLineByOfValue(ofValue: string, article: Article, quantity: number) {
    const of = ofValue.trim();
    const code = String(article.code || '').trim().toUpperCase();

    if (!of) {
      pushToast('Escribe o selecciona una OF destino.', 'error');
      return false;
    }

    if (!code) {
      pushToast('Selecciona o escribe un artículo.', 'error');
      return false;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      pushToast('La cantidad debe ser mayor que cero.', 'error');
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

        return [...current, { id: uid(), of, description: '', materials: [material] }];
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

    if (article.widthWarning) {
      pushToast(`Línea añadida a OF ${of}. Aviso: ${article.widthWarning}`, 'warn');
    } else {
      pushToast(`Línea añadida a OF ${of}.`, 'ok');
    }
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

  function updateLineQuantity(ofId: string, lineId: string, quantity: number) {
    setOfs((current) =>
      current.map((ofBlock) =>
        ofBlock.id === ofId
          ? {
            ...ofBlock,
            materials: ofBlock.materials.map((line) =>
              line.id === lineId ? { ...line, quantity: roundQuantity(quantity) } : line
            )
          }
          : ofBlock
      )
    );
  }

  function clearAll() {
    const snapshot = { orderCode, ofs };
    const hadContent = Boolean(orderCode.trim()) || ofs.some((ofBlock) => ofBlock.of.trim() || ofBlock.materials.length > 0);

    setOrderCode('');
    setOfs([createOf()]);

    if (hadContent) {
      pushToast('Formulario limpio.', 'info', {
        label: 'Deshacer',
        run: () => {
          setOrderCode(snapshot.orderCode);
          setOfs(snapshot.ofs);
        }
      });
    }
  }

  async function saveExcelToNetwork(confirmOverwrite = false) {
    if (duplicateOfs.size > 0) {
      pushToast(`Hay OFs repetidas: ${Array.from(duplicateOfs).join(', ')}. Únelas antes de generar.`, 'error');
      return;
    }

    setIsSavingToNetwork(true);

    try {
      const response = await fetch('/api/export/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode,
          confirmOverwrite,
          ofs: ofs.map((ofBlock) => ({
            of: ofBlock.of,
            description: ofBlock.description,
            materials: ofBlock.materials
          }))
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.needsConfirmation) {
        setOverwritePrompt(data.existing || []);
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo guardar el Excel en la carpeta compartida.');
      }

      const saved: { filename: string; overwritten?: boolean }[] = Array.isArray(data.saved) ? data.saved : [];
      const overwrittenCount = saved.filter((item) => item.overwritten).length
        + (data.orderArchive?.overwritten ? 1 : 0);
      const overwriteText = overwrittenCount > 0 ? ` (${overwrittenCount} sobrescritos)` : '';
      const archiveText = data.orderArchive ? ` Pedido archivado: ${data.orderArchive.filename}.` : '';

      const snapshot = { orderCode, ofs };
      setOrderCode('');
      setOfs([createOf()]);
      setHistoryVersion((current) => current + 1);

      pushToast(
        saved.length === 1
          ? `Reserva generada: ${saved[0].filename}${overwriteText}.${archiveText}`
          : `Reservas generadas: ${saved.length}${overwriteText}.${archiveText}`,
        'ok',
        {
          label: 'Restaurar campos',
          run: () => {
            setOrderCode(snapshot.orderCode);
            setOfs(snapshot.ofs);
          }
        }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Error inesperado.', 'error');
    } finally {
      setIsSavingToNetwork(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1 className="sr-only">Materiales OT</h1>
          <img className="brand-logo brand-logo-light" src="/logo-light.png" alt="Materiales OT" />
          <img className="brand-logo brand-logo-dark" src="/logo-dark.png" alt="Materiales OT" />
        </div>
        <div className="topbar-actions">
          <StatusPill kind="database" state={databaseState} />
          <StatusPill kind="network" state={networkState} />
          <ThemeToggle mode={themeMode} onChange={setThemeMode} />
        </div>
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
        <button
          className={activeTab === 'history' ? 'active' : ''}
          type="button"
          onClick={() => setActiveTab('history')}
        >
          <History aria-hidden="true" />
          Historial
        </button>
      </nav>

      {activeTab === 'reservations' ? (
        <section className="workspace view" key="reservations">
          <ReservationPanel
            orderCode={orderCode}
            setOrderCode={setOrderCode}
            totals={totals}
            isSavingToNetwork={isSavingToNetwork}
            onSave={() => saveExcelToNetwork()}
            onAddOf={addOf}
            onClearAll={clearAll}
          />

          <section className="of-list">
            {ofs.map((ofBlock, index) => (
              <OfCard
                key={ofBlock.id}
                index={index}
                ofBlock={ofBlock}
                isDuplicate={Boolean(ofBlock.of.trim()) && duplicateOfs.has(ofBlock.of.trim())}
                onChangeOf={updateOf}
                onChangeDescription={updateOfDescription}
                onRemoveOf={removeOf}
                onAddLine={addLine}
                onRemoveLine={removeLine}
                onUpdateLineQuantity={updateLineQuantity}
              />
            ))}
          </section>
        </section>
      ) : activeTab === 'articles' ? (
        <div className="view" key="articles">
          <ArticleCatalog ofs={ofs} onAddLineToOf={addLineByOfValue} />
        </div>
      ) : (
        <div className="view" key="history">
          <HistoryView version={historyVersion} onReuse={reuseReservation} />
        </div>
      )}

      {overwritePrompt && (
        <ConfirmDialog
          files={overwritePrompt}
          onCancel={() => setOverwritePrompt(null)}
          onConfirm={() => {
            setOverwritePrompt(null);
            saveExcelToNetwork(true);
          }}
        />
      )}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function ConfirmDialog({
  files,
  onCancel,
  onConfirm
}: {
  files: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="overwrite-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-icon">
          <AlertTriangle aria-hidden="true" />
        </div>
        <h2 id="overwrite-title">Ya existen archivos con ese nombre</h2>
        <p>
          Estos archivos ya están en la carpeta compartida y se van a <strong>sobrescribir</strong>.
          Si RPS aún no los procesó, se perderá la reserva anterior.
        </p>
        <ul className="modal-files">
          {files.map((file) => (
            <li key={file}>
              <FileSpreadsheet aria-hidden="true" />
              {file}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onCancel} autoFocus>
            Cancelar
          </button>
          <button className="button button-danger" type="button" onClick={onConfirm}>
            Sobrescribir
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryView({ version, onReuse }: { version: number; onReuse: (entry: HistoryEntry) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);

    fetch('/api/history?limit=100')
      .then((response) => {
        if (!response.ok) throw new Error('history failed');
        return response.json();
      })
      .then((data) => {
        if (alive) setEntries(data.entries || []);
      })
      .catch(() => {
        if (alive) setEntries([]);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <section className="history-view">
      {isLoading ? (
        <div className="history-empty">
          <Loader2 className="spin" aria-hidden="true" />
          Cargando historial...
        </div>
      ) : entries.length === 0 ? (
        <div className="history-empty">
          <History aria-hidden="true" />
          <p>Aún no hay reservas generadas desde la web.</p>
          <span>Cuando generes una reserva aparecerá aquí, con sus OFs y materiales.</span>
        </div>
      ) : (
        entries.map((entry) => <HistoryCard key={entry.id} entry={entry} onReuse={onReuse} />)
      )}
    </section>
  );
}

const historyDateFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });

function HistoryCard({ entry, onReuse }: { entry: HistoryEntry; onReuse: (entry: HistoryEntry) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const overwrittenCount = entry.files.filter((file) => file.overwritten).length
    + (entry.orderArchive?.overwritten ? 1 : 0);
  const descriptions = Array.from(
    new Set(entry.ofs.map((ofBlock) => (ofBlock.description || '').trim()).filter(Boolean))
  ).join(' · ');

  return (
    <article className={`history-card ${isOpen ? 'open' : ''}`}>
      <div className="history-row">
        <button className="history-head" type="button" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen}>
          <ChevronDown className="history-chevron" aria-hidden="true" />
          <div className="history-title">
            <strong>{entry.orderCode ? `Pedido ${entry.orderCode}` : `OF ${entry.ofs.map((item) => item.of).join(', ')}`}</strong>
            {descriptions && <em>{descriptions}</em>}
            <span>{historyDateFormat.format(new Date(entry.createdAt))}</span>
          </div>
          <div className="history-meta">
            <span className="history-chip">{entry.totals.ofs} {entry.totals.ofs === 1 ? 'OF' : 'OFs'}</span>
            <span className="history-chip">{entry.totals.lines} {entry.totals.lines === 1 ? 'línea' : 'líneas'}</span>
            <span className="history-chip">{formatNumber(entry.totals.units)} uds.</span>
            {overwrittenCount > 0 && <span className="history-chip warn">{overwrittenCount} sobrescritos</span>}
          </div>
        </button>
        <button className="history-reuse" type="button" onClick={() => onReuse(entry)} title="Añadir estos materiales a una nueva reserva">
          <Copy aria-hidden="true" />
          Reutilizar
        </button>
      </div>

      {isOpen && (
        <div className="history-detail">
          {entry.ofs.map((ofBlock) => (
            <div className="history-of" key={ofBlock.of}>
              <div className="history-of-head">
                <strong>OF {ofBlock.of}</strong>
                {ofBlock.description && <em>{ofBlock.description}</em>}
                <span>{fileLabelFor(entry, ofBlock.of)}</span>
              </div>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ofBlock.materials.map((line, index) => (
                    <tr key={`${line.code}-${index}`}>
                      <td><strong>{line.code}</strong></td>
                      <td>{formatDisplayText(line.description) || '-'}</td>
                      <td>{formatNumber(line.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {entry.orderArchive && (
            <div className="history-archive">
              <FileSpreadsheet aria-hidden="true" />
              Archivo de pedido: <strong>{entry.orderArchive.filename}</strong>
              {entry.orderArchive.overwritten && <span className="history-chip warn">sobrescrito</span>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function fileLabelFor(entry: HistoryEntry, of: string) {
  const file = entry.files.find((item) => item.of === of);
  if (!file) return '';
  return file.overwritten ? `${file.filename} (sobrescrito)` : file.filename;
}

function ThemeToggle({ mode, onChange }: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Tema claro', icon: <Sun aria-hidden="true" /> },
    { value: 'system', label: 'Tema del sistema', icon: <Monitor aria-hidden="true" /> },
    { value: 'dark', label: 'Tema oscuro', icon: <Moon aria-hidden="true" /> }
  ];

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Tema de la interfaz">
      {options.map((option) => (
        <button
          key={option.value}
          className={mode === option.value ? 'active' : ''}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

const toastIcons: Record<ToastType, React.ReactNode> = {
  ok: <CheckCircle2 aria-hidden="true" />,
  error: <XCircle aria-hidden="true" />,
  warn: <AlertTriangle aria-hidden="true" />,
  info: <Info aria-hidden="true" />
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-label="Notificaciones">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type} ${toast.leaving ? 'leaving' : ''}`} role="status">
          {toastIcons[toast.type]}
          <p>{toast.text}</p>
          {toast.action && (
            <button
              className="toast-action"
              type="button"
              onClick={() => {
                toast.action?.run();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Cerrar notificación">
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ReservationPanel({
  orderCode,
  setOrderCode,
  totals,
  isSavingToNetwork,
  onSave,
  onAddOf,
  onClearAll
}: {
  orderCode: string;
  setOrderCode: (value: string) => void;
  totals: { ofs: number; lines: number; units: number };
  isSavingToNetwork: boolean;
  onSave: () => void;
  onAddOf: () => void;
  onClearAll: () => void;
}) {
  const orderYear = detectOrderYear(orderCode);
  const hasOrderCode = Boolean(orderCode.trim());

  return (
    <aside className="summary-panel">
      <h2 className="panel-title">Resumen</h2>

      <label className="field">
        <span>N.º pedido</span>
        <input
          value={orderCode}
          onChange={(event) => setOrderCode(event.target.value)}
          autoComplete="off"
          placeholder="Opcional"
        />
        {hasOrderCode && (
          <span className={`order-hint ${orderYear ? 'ok' : 'warn'}`}>
            {orderYear ? (
              <>
                <Check aria-hidden="true" />
                Se archivará en {orderYear}/Reserva Materiales
              </>
            ) : (
              <>
                <AlertTriangle aria-hidden="true" />
                No se detecta el año (formato esperado: AR26XXXX)
              </>
            )}
          </span>
        )}
      </label>

      <div className="metrics">
        <Metric label="OFs" value={totals.ofs} />
        <Metric label="líneas" value={totals.lines} />
        <Metric label="uds." value={formatNumber(totals.units)} />
      </div>

      <button className="button button-primary" type="button" onClick={onSave} disabled={isSavingToNetwork}>
        {isSavingToNetwork ? <Loader2 className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        {isSavingToNetwork ? 'Generando...' : 'Generar reserva'}
      </button>
      <button className="button button-ghost" type="button" onClick={onAddOf}>
        <Plus aria-hidden="true" />
        Añadir OF
      </button>
      <button className="button button-muted" type="button" onClick={onClearAll}>
        <X aria-hidden="true" />
        Limpiar
      </button>
    </aside>
  );
}

const statusPillLabels: Record<'database' | 'network', Record<ConnectionState, string>> = {
  database: { checking: 'Comprobando BD', ok: 'BD conectada', error: 'BD sin conexión' },
  network: { checking: 'Comprobando red', ok: 'Carpeta de red OK', error: 'Red sin acceso' }
};

function StatusPill({ kind, state }: { kind: 'database' | 'network'; state: ConnectionState }) {
  return (
    <div className={`status-pill ${state}`} title={statusPillLabels[kind][state]}>
      <span className="status-dot" aria-hidden="true" />
      {kind === 'database' ? <Database aria-hidden="true" /> : <Folder aria-hidden="true" />}
      {statusPillLabels[kind][state]}
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
  isDuplicate,
  onChangeOf,
  onChangeDescription,
  onRemoveOf,
  onAddLine,
  onRemoveLine,
  onUpdateLineQuantity
}: {
  index: number;
  ofBlock: OfBlock;
  isDuplicate: boolean;
  onChangeOf: (id: string, of: string) => void;
  onChangeDescription: (id: string, description: string) => void;
  onRemoveOf: (id: string) => void;
  onAddLine: (ofId: string, article: Article, quantity: number) => boolean;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateLineQuantity: (ofId: string, lineId: string, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const pickerRef = useRef<ArticlePickerHandle>(null);

  function commitLine() {
    const article = selectedArticle
      || pickerRef.current?.typedArticle()
      || { idArticle: '', code: '', description: '' };
    const added = onAddLine(ofBlock.id, article, Number(quantity));
    if (!added) return;
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
  }

  return (
    <article className={`of-card ${isDuplicate ? 'duplicate' : ''}`}>
      <div className="of-header">
        <label className="field of-number">
          <span>OF {index + 1}</span>
          <input
            value={ofBlock.of}
            onChange={(event) => onChangeOf(ofBlock.id, event.target.value.trim())}
            inputMode="numeric"
          />
        </label>
        <label className="field of-description">
          <span>Descripción</span>
          <input
            value={ofBlock.description}
            onChange={(event) => onChangeDescription(ofBlock.id, event.target.value)}
            placeholder="Ej.: lateral escenario"
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <button className="icon-button danger" type="button" onClick={() => onRemoveOf(ofBlock.id)} title="Eliminar OF">
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      {isDuplicate && (
        <div className="duplicate-hint">
          <AlertTriangle aria-hidden="true" />
          OF repetida en otra tarjeta
        </div>
      )}

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

      <MaterialTable
        ofBlock={ofBlock}
        onRemoveLine={onRemoveLine}
        onUpdateQuantity={(lineId, value) => onUpdateLineQuantity(ofBlock.id, lineId, value)}
      />
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
  // Al seleccionar un resultado, ponemos su código en `query`, lo que dispararía
  // otra vez la búsqueda con debounce y reabriría el desplegable. Esta bandera
  // hace que esa única búsqueda posterior a una selección se salte.
  const skipSearchRef = useRef(false);

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
  // Intencionado: solo sincronizamos `query` cuando cambia `selected`.
  // Incluir `query` en deps crearía un bucle de actualización mutua.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

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
            skipSearchRef.current = false;
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
                  skipSearchRef.current = true;
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
ArticlePicker.displayName = 'ArticlePicker';

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
  const catalogLimit = 180;

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
  // `filterOptions` se usa solo como valor de fallback si la petición falla;
  // incluirla en deps dispararía el fetch en cada actualización de opciones.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      limit: String(catalogLimit)
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

      <div className="catalog-meta" aria-live="polite">
        {isLoading
          ? 'Buscando artículos...'
          : articles.length === 0
            ? 'Sin resultados con estos filtros'
            : articles.length >= catalogLimit
              ? `Mostrando los primeros ${catalogLimit} artículos — afina la búsqueda o los filtros para ver el resto`
              : `${articles.length} ${articles.length === 1 ? 'artículo' : 'artículos'}`}
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
              <th>Stock</th>
              <th>Sección</th>
              <th>Estado</th>
              <th>Añadir a reserva</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows />
            ) : articles.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={9}>Sin artículos con estos filtros.</td>
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

const maxVisibleStocks = 3;

function StockCell({ article }: { article: Article }) {
  const stocks = article.stocks || [];

  if (article.stockTotal === null || article.stockTotal === undefined || stocks.length === 0) {
    return <td className="catalog-stock"><span className="catalog-muted">-</span></td>;
  }

  const visible = stocks.slice(0, maxVisibleStocks);
  const hidden = stocks.slice(maxVisibleStocks);
  const fullBreakdown = stocks
    .map((item) => `${formatDisplayText(item.warehouse)}: ${formatNumber(item.quantity)}`)
    .join('\n');

  return (
    <td className="catalog-stock" title={fullBreakdown}>
      <strong className={article.stockTotal < 0 ? 'stock-negative' : ''}>
        {formatNumber(article.stockTotal)}
      </strong>
      <span className="stock-places">
        {visible.map((item) => (
          <span className="stock-place" key={item.warehouseCode}>
            <em>{formatDisplayText(item.warehouse)}</em>
            {formatNumber(item.quantity)}
          </span>
        ))}
        {hidden.length > 0 && <span className="stock-more">+{hidden.length} más</span>}
      </span>
    </td>
  );
}

const skeletonWidths = [
  ['72%', '88%', '64%', '52%', '40%', '60%', '70%', '58%', '90%'],
  ['58%', '74%', '80%', '44%', '36%', '52%', '62%', '58%', '84%'],
  ['66%', '92%', '52%', '58%', '44%', '66%', '54%', '58%', '78%'],
  ['80%', '68%', '72%', '48%', '38%', '58%', '66%', '58%', '88%'],
  ['62%', '82%', '58%', '54%', '42%', '48%', '58%', '58%', '82%'],
  ['70%', '76%', '68%', '50%', '36%', '62%', '64%', '58%', '86%']
];

function SkeletonRows() {
  return (
    <>
      {skeletonWidths.map((row, rowIndex) => (
        <tr className="skeleton-row" key={rowIndex} aria-hidden="true">
          {row.map((width, cellIndex) => (
            <td key={cellIndex}>
              <span className="skeleton-bar" style={{ width }} />
            </td>
          ))}
        </tr>
      ))}
    </>
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
      <StockCell article={article} />
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
  onRemoveLine,
  onUpdateQuantity
}: {
  ofBlock: OfBlock;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
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
                <td>
                  <QuantityCell line={line} onCommit={(value) => onUpdateQuantity(line.id, value)} />
                </td>
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

function QuantityCell({ line, onCommit }: { line: MaterialLine; onCommit: (quantity: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const quantity = Number(draft.replace(',', '.'));
    if (Number.isFinite(quantity) && quantity > 0 && quantity !== line.quantity) {
      onCommit(quantity);
    }
    setDraft(null);
  }

  return (
    <input
      className="quantity-cell-input"
      value={draft ?? String(line.quantity)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          cancelledRef.current = true;
          event.currentTarget.blur();
        }
      }}
      type="number"
      min="0.000001"
      step="0.01"
      aria-label={`Cantidad de ${line.code}`}
    />
  );
}

function createOf(): OfBlock {
  return {
    id: uid(),
    of: '',
    description: '',
    materials: []
  };
}

function buildMaterialLine(article: Article, quantity: number): MaterialLine {
  return {
    id: uid(),
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

// Réplica de la detección de año del servidor (getOrderYear en server.js)
// para avisar antes de generar, no después.
function detectOrderYear(orderCode: string): number | null {
  const clean = orderCode.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '');
  const match = /^[A-Z]+(\d{2})/.exec(clean);
  return match ? 2000 + Number(match[1]) : null;
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
