import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';

import type {
  Article,
  AssignmentModel,
  ConnectionState,
  HistoryEntry,
  ModelPart,
  OfBlock,
  OrderDraft,
  PersistedState,
  ThemeMode,
  Toast,
  ToastAction,
  ToastType
} from './types';
import { roundQuantity, uid } from './utils';

import { Header } from './components/Header';
import { Navigation, type ActiveTab } from './components/Navigation';
import { AssignmentWorkspace } from './components/assignments/AssignmentWorkspace';
import { ArticleCatalog } from './components/catalog/ArticleCatalog';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { ToastViewport } from './components/common/ToastViewport';
import { HistoryView } from './components/history/HistoryView';
import { ModelsView } from './components/models/ModelsView';
import { SaveAsModelModal } from './components/models/SaveAsModelModal';
import { DraftsView } from './components/drafts/DraftsView';
import { SaveDraftModal } from './components/drafts/SaveDraftModal';

const storageKey = 'materiales-ot-state-v3';
const themeStorageKey = 'materiales-ot-theme';

function createOf(description = ''): OfBlock {
  return {
    id: uid(),
    of: '',
    description,
    materials: []
  };
}

function getInitialReservationState(): PersistedState {
  if (typeof localStorage === 'undefined') {
    return { orderCode: '', ofs: [createOf()] };
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { orderCode: '', ofs: [createOf()] };

    const saved = JSON.parse(raw) as PersistedState;
    return {
      orderCode: saved.orderCode || '',
      ofs: saved.ofs?.length
        ? saved.ofs.map((ofBlock) => ({ ...ofBlock, description: ofBlock.description || '' }))
        : [createOf()]
    };
  } catch {
    return { orderCode: '', ofs: [createOf()] };
  }
}

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
  const initialReservationState = useMemo(getInitialReservationState, []);
  const [orderCode, setOrderCode] = useState(initialReservationState.orderCode);
  const [ofs, setOfs] = useState<OfBlock[]>(initialReservationState.ofs);
  const [databaseState, setDatabaseState] = useState<ConnectionState>('checking');
  const [networkState, setNetworkState] = useState<ConnectionState>('checking');
  const [isSavingToNetwork, setIsSavingToNetwork] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('assignments');
  const [overwritePrompt, setOverwritePrompt] = useState<string[] | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [isSaveAsModelOpen, setIsSaveAsModelOpen] = useState(false);
  const [modelModalOfs, setModelModalOfs] = useState<OfBlock[] | null>(null);

  // Borradores de pedidos
  const [activeDraft, setActiveDraft] = useState<{ id: string; name: string; notes?: string; orderCode?: string } | null>(null);
  const [isSaveDraftOpen, setIsSaveDraftOpen] = useState(false);
  const [draftsVersion, setDraftsVersion] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [pendingDraftToResume, setPendingDraftToResume] = useState<OrderDraft | null>(null);

  const [, startTransition] = useTransition();
  const { mode: themeMode, setMode: setThemeMode } = useTheme();
  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ orderCode, ofs }));
  }, [orderCode, ofs]);

  useEffect(() => {
    let alive = true;
    fetch('/api/drafts')
      .then((res) => res.json())
      .then((data) => {
        if (alive && Array.isArray(data.drafts)) {
          setDraftsCount(data.drafts.length);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [draftsVersion]);

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
    const duplicates = new Set<string>();
    for (const [key, count] of counts) {
      if (count > 1) duplicates.add(key);
    }
    return duplicates;
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
    setActiveTab('assignments');
    pushToast('Materiales cargados desde el historial. Escribe las nuevas OFs y el pedido.', 'info');
  }

  function handleTransferModelToAssignment(
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) {
    const previousOfs = ofs;
    const newOfBlocks: OfBlock[] = partsToTransfer.map(({ part, multiplier }) => ({
      id: uid(),
      of: '',
      description: part.name + (part.description ? ` (${part.description})` : ''),
      materials: part.materials.map((m) => ({
        id: uid(),
        code: m.code,
        description: m.description,
        quantity: roundQuantity(m.quantity * multiplier),
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    }));

    setOfs((current) => {
      if (replaceExisting) return newOfBlocks.length > 0 ? newOfBlocks : [createOf()];
      // Mantener las OFs con contenido o eliminar borrador vacío
      const rest = current.filter((b) => b.of.trim() || b.description.trim() || b.materials.length > 0);
      return [...rest, ...newOfBlocks];
    });

    setActiveTab('assignments');
    pushToast(
      `${partsToTransfer.length} ${partsToTransfer.length === 1 ? 'parte cargada' : 'partes cargadas'}. Completa los números de OF y el pedido.`,
      'ok',
      replaceExisting ? { label: 'Deshacer', run: () => setOfs(previousOfs) } : undefined
    );
  }

  async function handleSaveCurrentAsModel(modelData: Partial<AssignmentModel>) {
    const response = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData)
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'No se pudo guardar el modelo en el servidor.');
    }

    pushToast(`Modelo "${modelData.name}" guardado con éxito en la biblioteca.`, 'ok');
  }

  function resumeDraft(draft: OrderDraft, force = false) {
    const hasContent =
      Boolean(orderCode.trim()) ||
      ofs.some((b) => b.of.trim() || b.materials.length > 0);
    const isSameAsActive = activeDraft?.id === draft.id;

    if (hasContent && !isSameAsActive && !force) {
      setPendingDraftToResume(draft);
      return;
    }

    const previousSnapshot = { orderCode, ofs, activeDraft };
    const restoredOfs: OfBlock[] = draft.ofs.map((block) => ({
      id: block.id || uid(),
      of: block.of || '',
      description: block.description || '',
      materials: block.materials.map((m) => ({
        id: m.id || uid(),
        code: m.code,
        description: m.description || '',
        quantity: roundQuantity(m.quantity),
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    }));

    setOrderCode(draft.orderCode || '');
    setOfs(restoredOfs.length > 0 ? restoredOfs : [createOf()]);
    setActiveDraft({
      id: draft.id,
      name: draft.name,
      notes: draft.notes,
      orderCode: draft.orderCode
    });
    setActiveTab('assignments');
    pushToast(`Borrador "${draft.name}" cargado. Puedes continuar editando el pedido.`, 'ok', {
      label: 'Deshacer',
      run: () => {
        setOrderCode(previousSnapshot.orderCode);
        setOfs(previousSnapshot.ofs);
        setActiveDraft(previousSnapshot.activeDraft);
      }
    });
  }

  async function handleQuickSaveDraft() {
    if (!activeDraft?.id) {
      setIsSaveDraftOpen(true);
      return;
    }

    try {
      const response = await fetch(`/api/drafts/${activeDraft.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeDraft.id,
          name: activeDraft.name,
          orderCode,
          notes: activeDraft.notes,
          ofs
        })
      });

      if (!response.ok) throw new Error('No se pudo actualizar el borrador.');
      setDraftsVersion((v) => v + 1);
      pushToast(`Borrador "${activeDraft.name}" actualizado con éxito.`, 'ok');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error al guardar el borrador.', 'error');
    }
  }

  async function handleSaveDraftModal(data: {
    id?: string;
    name: string;
    orderCode: string;
    notes?: string;
    ofs: OfBlock[];
  }) {
    const isUpdating = Boolean(data.id);
    const url = isUpdating ? `/api/drafts/${data.id}` : '/api/drafts';
    const method = isUpdating ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'No se pudo guardar el borrador.');
    }

    const savedData = await response.json();
    const savedDraft = savedData.draft;

    setActiveDraft({
      id: savedDraft.id,
      name: savedDraft.name,
      notes: savedDraft.notes,
      orderCode: savedDraft.orderCode
    });
    setDraftsVersion((v) => v + 1);
    pushToast(
      isUpdating
        ? `Borrador "${savedDraft.name}" actualizado con éxito.`
        : `Borrador "${savedDraft.name}" guardado.`,
      'ok'
    );
  }

  function handleDraftToModel(draft: OrderDraft) {
    const draftOfs: OfBlock[] = draft.ofs.map((block) => ({
      id: block.id || uid(),
      of: block.of || '',
      description: block.description || '',
      materials: block.materials.map((m) => ({ ...m }))
    }));
    setModelModalOfs(draftOfs);
    setIsSaveAsModelOpen(true);
  }

  function clearActiveDraft() {
    setActiveDraft(null);
    pushToast('Borrador desvinculado. Los materiales se mantienen en la pantalla.', 'info');
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
      const material = {
        id: uid(),
        code,
        description: article.description || '',
        quantity: roundQuantity(quantity),
        width: article.detectedWidth ?? null,
        widthWarning: article.widthWarning ?? null
      };

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
    const snapshot = { orderCode, ofs, activeDraft };
    const hadContent =
      Boolean(orderCode.trim()) ||
      ofs.some((ofBlock) => ofBlock.of.trim() || ofBlock.materials.length > 0);

    setOrderCode('');
    setOfs([createOf()]);
    setActiveDraft(null);

    if (hadContent) {
      pushToast('Formulario limpio.', 'info', {
        label: 'Deshacer',
        run: () => {
          setOrderCode(snapshot.orderCode);
          setOfs(snapshot.ofs);
          setActiveDraft(snapshot.activeDraft);
        }
      });
    }
  }

  async function saveExcelToNetwork(confirmOverwrite = false) {
    if (duplicateOfs.size > 0) {
      pushToast(
        `Hay OFs repetidas: ${Array.from(duplicateOfs).join(', ')}. Corrige los números antes de generar.`,
        'error'
      );
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
        throw new Error(data.error || 'No se pudo guardar el archivo en la carpeta compartida.');
      }

      const saved: { filename: string; overwritten?: boolean }[] = Array.isArray(data.saved)
        ? data.saved
        : [];
      const overwrittenCount =
        saved.filter((item) => item.overwritten).length + (data.orderArchive?.overwritten ? 1 : 0);
      const overwriteText = overwrittenCount > 0 ? ` (${overwrittenCount} sobrescritos)` : '';
      const archiveText = data.orderArchive ? ` Pedido archivado: ${data.orderArchive.filename}.` : '';

      const snapshot = { orderCode, ofs, activeDraft };
      setOrderCode('');
      setOfs([createOf()]);
      setActiveDraft(null);
      setHistoryVersion((current) => current + 1);

      pushToast(
        saved.length === 1
          ? `Asignación generada: ${saved[0].filename}${overwriteText}.${archiveText}`
          : `Asignaciones generadas: ${saved.length}${overwriteText}.${archiveText}`,
        'ok',
        {
          label: 'Restaurar campos',
          run: () => {
            setOrderCode(snapshot.orderCode);
            setOfs(snapshot.ofs);
            setActiveDraft(snapshot.activeDraft);
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
      <Header
        databaseState={databaseState}
        networkState={networkState}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
      />

      <Navigation
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        draftsCount={draftsCount}
      />

      {activeTab === 'assignments' && (
        <AssignmentWorkspace
          orderCode={orderCode}
          setOrderCode={setOrderCode}
          ofs={ofs}
          totals={totals}
          duplicateOfs={duplicateOfs}
          isSavingToNetwork={isSavingToNetwork}
          activeDraft={activeDraft}
          onSave={() => saveExcelToNetwork()}
          onOpenSaveDraft={() => setIsSaveDraftOpen(true)}
          onQuickSaveDraft={handleQuickSaveDraft}
          onClearActiveDraft={clearActiveDraft}
          onAddOf={addOf}
          onOpenLoadModel={() => setActiveTab('models')}
          onOpenSaveAsModel={() => setIsSaveAsModelOpen(true)}
          onClearAll={clearAll}
          onUpdateOf={updateOf}
          onUpdateOfDescription={updateOfDescription}
          onRemoveOf={removeOf}
          onAddLine={addLine}
          onRemoveLine={removeLine}
          onUpdateLineQuantity={updateLineQuantity}
        />
      )}

      {activeTab === 'drafts' && (
        <DraftsView
          activeDraftId={activeDraft?.id || null}
          currentOrderCode={orderCode}
          hasActiveContent={Boolean(orderCode.trim()) || ofs.some((b) => b.of.trim() || b.materials.length > 0)}
          onResumeDraft={(draft) => resumeDraft(draft)}
          onSaveCurrentAsDraft={() => setIsSaveDraftOpen(true)}
          onConvertToModel={handleDraftToModel}
          pushToast={pushToast}
          refreshTrigger={draftsVersion}
        />
      )}

      {activeTab === 'models' && (
        <ModelsView
          onTransferModelToAssignment={handleTransferModelToAssignment}
          pushToast={pushToast}
        />
      )}

      {activeTab === 'articles' && (
        <div className="view" key="articles">
          <ArticleCatalog ofs={ofs} onAddLineToOf={addLineByOfValue} />
        </div>
      )}

      {activeTab === 'history' && (
        <div className="view" key="history">
          <HistoryView version={historyVersion} onReuse={reuseReservation} />
        </div>
      )}

      {isSaveDraftOpen && (
        <SaveDraftModal
          initialDraft={activeDraft}
          orderCode={orderCode}
          ofs={ofs}
          onClose={() => setIsSaveDraftOpen(false)}
          onSave={handleSaveDraftModal}
        />
      )}

      {isSaveAsModelOpen && (
        <SaveAsModelModal
          ofs={modelModalOfs || ofs}
          onClose={() => {
            setIsSaveAsModelOpen(false);
            setModelModalOfs(null);
          }}
          onSave={handleSaveCurrentAsModel}
        />
      )}

      {pendingDraftToResume && (
        <ConfirmDialog
          title="Reemplazar la asignación actual"
          description={
            <>
              Tienes materiales en la pantalla de <strong>Asignaciones</strong>.
              <br />
              ¿Quieres descartar el trabajo actual y abrir el borrador <strong>"{pendingDraftToResume.name}"</strong>?
            </>
          }
          items={[]}
          confirmLabel="Cargar borrador"
          onCancel={() => setPendingDraftToResume(null)}
          onConfirm={() => {
            const draft = pendingDraftToResume;
            setPendingDraftToResume(null);
            resumeDraft(draft, true);
          }}
        />
      )}

      {overwritePrompt && (
        <ConfirmDialog
          title="Ya existen archivos con ese nombre"
          description={
            <>
              Estos archivos ya están en la carpeta compartida y se van a <strong>sobrescribir</strong>.
              Si RPS aún no los procesó, se perderá la asignación anterior.
            </>
          }
          items={overwritePrompt}
          confirmLabel="Sobrescribir"
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

createRoot(document.getElementById('root')!).render(<App />);
