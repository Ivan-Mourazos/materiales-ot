import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

import type {
  ActiveDraft,
  ActiveModel,
  Article,
  AssignmentModel,
  ConnectionState,
  HistoryEntry,
  ModelPart,
  ModelSaveChange,
  OfBlock,
  OrderDraft,
  PersistedState
} from './types';
import { roundQuantity, uid } from './utils';
import { mergeOrderOfs, type RpsOrderOf } from './orderOfs';
import { iniciarPildoras } from './pildoraDeslizante';
import { moveLine, moveLineBy, moveOf, moveOfBy } from './reorder';
import { describeActiveModel } from './activeModel';
import {
  addQuantities,
  countMissingQuantities,
  findMissingQuantities,
  hasQuantity,
  scaleQuantity,
  sumQuantities,
  type MissingQuantity,
  type Quantity,
  type QuantityInput
} from './quantities';

import { Header } from './components/Header';
import { Navigation, type ActiveTab } from './components/Navigation';
import { AssignmentWorkspace } from './components/assignments/AssignmentWorkspace';
import { ArticleCatalog } from './components/catalog/ArticleCatalog';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { MissingQuantitiesDialog } from './components/common/MissingQuantitiesDialog';
import { ToastViewport } from './components/common/ToastViewport';
import { SaveCancelledError, useVersionedSave } from './components/common/useVersionedSave';
import { HistoryView } from './components/history/HistoryView';
import { ModelsView } from './components/models/ModelsView';
import { SaveAsModelModal } from './components/models/SaveAsModelModal';
import { DraftsView } from './components/drafts/DraftsView';
import { SaveDraftModal } from './components/drafts/SaveDraftModal';
import { CopyConsumptionModal } from './components/assignments/CopyConsumptionModal';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import { getUserName, instalarCabeceraUsuario, setUserName } from './currentUser';
import { WhoAreYouDialog } from './components/common/WhoAreYouDialog';
import { ReuseHistoryModal } from './components/history/ReuseHistoryModal';

const storageKey = 'materiales-ot-state-v3';

function createOf(description = ''): OfBlock {
  return {
    id: uid(),
    of: '',
    description,
    materials: []
  };
}

function toActiveDraft(draft: OrderDraft): ActiveDraft {
  return { id: draft.id, name: draft.name, notes: draft.notes, orderCode: draft.orderCode, updatedAt: draft.updatedAt };
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

function App() {
  const initialReservationState = useMemo(getInitialReservationState, []);
  const [orderCode, setOrderCode] = useState(initialReservationState.orderCode);
  const [ofs, setOfs] = useState<OfBlock[]>(initialReservationState.ofs);
  const [databaseState, setDatabaseState] = useState<ConnectionState>('checking');
  const [networkState, setNetworkState] = useState<ConnectionState>('checking');
  const [isSavingToNetwork, setIsSavingToNetwork] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('assignments');
  const [overwritePrompt, setOverwritePrompt] = useState<string[] | null>(null);
  const [ofWarningsPrompt, setOfWarningsPrompt] = useState<string[] | null>(null);
  const [isImportingOfs, setIsImportingOfs] = useState(false);
  const [isCopyConsumptionOpen, setIsCopyConsumptionOpen] = useState(false);
  const [reuseEntry, setReuseEntry] = useState<HistoryEntry | null>(null);
  // OFs plegadas en Asignaciones (solo la cabecera); no se guarda, es cómo se ve ahora
  const [collapsedOfs, setCollapsedOfs] = useState<Set<string>>(() => new Set());
  // Lo ya confirmado en este intento de generar: al aceptar el siguiente aviso no se vuelve a preguntar.
  const lastSaveConfirmations = useRef({ confirmOverwrite: false, confirmOfs: false });
  const [missingQuantities, setMissingQuantities] = useState<MissingQuantity[] | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [isSaveAsModelOpen, setIsSaveAsModelOpen] = useState(false);
  const [modelModalOfs, setModelModalOfs] = useState<OfBlock[] | null>(null);

  // Borradores de pedidos
  const [activeDraft, setActiveDraft] = useState<ActiveDraft | null>(null);
  const [activeModel, setActiveModel] = useState<ActiveModel | null>(null);
  const [isSaveDraftOpen, setIsSaveDraftOpen] = useState(false);
  const [isQuickSavingDraft, setIsQuickSavingDraft] = useState(false);
  const [draftsVersion, setDraftsVersion] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [pendingDraftToResume, setPendingDraftToResume] = useState<OrderDraft | null>(null);

  const [, startTransition] = useTransition();
  const { resolved: theme, toggle: toggleTheme } = useTheme();
  const { toasts, pushToast, dismissToast } = useToasts();
  // Quién usa la web: se pide la primera vez y viaja en cada cambio (currentUser.ts)
  const [userName, setUserNameState] = useState(getUserName);
  const [isWhoAreYouOpen, setIsWhoAreYouOpen] = useState(() => !getUserName());
  const { saveVersioned, conflictDialog } = useVersionedSave();

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
      units: sumQuantities(lines.map((line) => line.quantity)),
      missing: countMissingQuantities(ofs)
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

  async function importOrderOfs() {
    const code = orderCode.trim();
    if (!code || isImportingOfs) return;
    setIsImportingOfs(true);

    try {
      const response = await fetch(`/api/order-ofs?order=${encodeURIComponent(code)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las OFs en RPS.');

      const rpsOfs: RpsOrderOf[] = Array.isArray(data.ofs) ? data.ofs : [];
      if (rpsOfs.length === 0) {
        pushToast(`RPS no tiene OFs para el pedido ${code}. Revisa el número.`, 'error');
        return;
      }

      const previous = ofs;
      const result = mergeOrderOfs(previous, rpsOfs, (of, description) => ({ ...createOf(description), of }));
      if (result.added === 0) {
        pushToast(`Las ${rpsOfs.length} OFs del pedido ${data.order} ya estaban en la asignación.`, 'info');
        if (result.ofs.some((block, index) => block !== previous[index])) setOfs(result.ofs);
        return;
      }

      setOfs(result.ofs);
      const already = result.alreadyThere > 0 ? ` (${result.alreadyThere} ya estaban)` : '';
      pushToast(
        `${result.added === 1 ? 'Añadida 1 OF' : `Añadidas ${result.added} OFs`} del pedido ${data.order}${already}.`,
        'ok',
        { label: 'Deshacer', run: () => setOfs(previous) }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Error inesperado.', 'error');
    } finally {
      setIsImportingOfs(false);
    }
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

  // Reutilizar del historial: abre el diálogo para elegir OFs y materiales (ReuseHistoryModal)
  function reuseReservation(entry: HistoryEntry) {
    setReuseEntry(entry);
  }

  function applyReusedOfs(picked: OfBlock[], replaceExisting: boolean) {
    const previous = ofs;
    setOfs((current) => {
      if (replaceExisting) return picked;
      const rest = current.filter((ofBlock) => ofBlock.of.trim() || ofBlock.materials.length > 0);
      return [...rest, ...picked];
    });
    setReuseEntry(null);
    setActiveTab('assignments');
    const lines = picked.reduce((sum, block) => sum + block.materials.length, 0);
    pushToast(
      `${picked.length === 1 ? '1 OF' : `${picked.length} OFs`} y ${lines} líneas cargadas del historial. Escribe las nuevas OFs y el pedido.`,
      'info',
      { label: 'Deshacer', run: () => setOfs(previous) }
    );
  }

  // Un borrador o modelo abierto aquí se ha guardado desde su pestaña. Sin esto, el siguiente
  // "Guardar cambios" usaría la versión vieja y avisaría de un conflicto que no existe.
  // Solo cambian los datos visibles y la versión: las OFs del formulario no se tocan.
  function handleDraftSaved(draft: OrderDraft) {
    if (activeDraft?.id !== draft.id) return;
    // El n.º de pedido vive en el formulario: si no se había tocado aquí, se sigue el nuevo
    if (orderCode === (activeDraft.orderCode || '')) setOrderCode(draft.orderCode || '');
    setActiveDraft(toActiveDraft(draft));
  }

  function handleModelSaved(model: AssignmentModel, change: ModelSaveChange) {
    setActiveModel((current) => {
      if (current?.id !== model.id) return current;
      // Si cambiaron las partes, el formulario tiene las viejas: se conserva la versión
      // cargada para que guardar desde aquí avise del conflicto en vez de pisarlas
      const sameContent = !change.partsChanged && change.previousUpdatedAt === current.updatedAt;
      return {
        ...current,
        name: model.name,
        description: model.description || '',
        category: model.category || '',
        updatedAt: sameContent ? model.updatedAt || model.createdAt : current.updatedAt
      };
    });
  }

  function handleTransferModelToAssignment(
    model: AssignmentModel,
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) {
    const previousOfs = ofs;
    const previousActiveModel = activeModel;
    const previousActiveDraft = activeDraft;
    // Reemplazar deja el formulario con el modelo: "Guardar cambios" no debe pisar el borrador con él
    const unlinkedDraft = replaceExisting ? activeDraft : null;
    const hadOtherContent = ofs.some((b) => b.of.trim() || b.description.trim() || b.materials.length > 0);
    const newOfBlocks: OfBlock[] = partsToTransfer.map(({ part, multiplier }) => ({
      id: uid(),
      of: '',
      description: part.name,
      partDescription: part.description || '',
      materials: part.materials.map((m) => ({
        id: uid(),
        code: m.code,
        description: m.description,
        quantity: scaleQuantity(m.quantity, multiplier),
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
    setActiveModel(
      describeActiveModel(model, {
        multiplier: partsToTransfer[0]?.multiplier ?? 1,
        partsLoaded: partsToTransfer.length,
        appendedToOtherOfs: !replaceExisting && hadOtherContent
      })
    );
    if (unlinkedDraft) setActiveDraft(null);

    setActiveTab('assignments');
    const loaded = `${partsToTransfer.length} ${partsToTransfer.length === 1 ? 'parte cargada' : 'partes cargadas'}.`;
    pushToast(
      unlinkedDraft
        ? `${loaded} Borrador «${unlinkedDraft.name}» desvinculado: el formulario ahora contiene el modelo.`
        : `${loaded} Completa los números de OF y el pedido.`,
      'ok',
      replaceExisting
        ? {
            label: 'Deshacer',
            run: () => {
              setOfs(previousOfs);
              setActiveModel(previousActiveModel);
              setActiveDraft(previousActiveDraft);
            }
          }
        : undefined
    );
  }

  async function handleSaveCurrentAsModel(modelData: Partial<AssignmentModel>, mode: 'update' | 'new') {
    // Desde un borrador (botón de su tarjeta) no hay modelo de origen que actualizar
    const fromForm = modelModalOfs === null;

    if (mode === 'update' && fromForm && activeModel?.updatable) {
      const { record, created } = await saveVersioned<AssignmentModel>({
        kind: 'modelo',
        collectionUrl: '/api/models',
        responseKey: 'model',
        id: activeModel.id,
        name: modelData.name || activeModel.name,
        body: { ...modelData },
        expectedUpdatedAt: activeModel.updatedAt
      });
      setActiveModel(
        created
          ? describeActiveModel(record, { multiplier: 1, partsLoaded: record.parts.length, appendedToOtherOfs: false })
          : {
              ...activeModel,
              name: record.name,
              description: record.description || '',
              category: record.category || '',
              updatedAt: record.updatedAt || activeModel.updatedAt
            }
      );
      pushToast(created ? `Guardado como modelo nuevo: "${record.name}".` : `Modelo "${record.name}" actualizado.`, 'ok');
      return;
    }

    const response = await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo guardar el modelo en el servidor.');

    // A partir de ahora, guardar desde el formulario actualiza este modelo nuevo
    if (fromForm) {
      setActiveModel(describeActiveModel(data.model, { multiplier: 1, partsLoaded: data.model.parts.length, appendedToOtherOfs: false }));
    }
    pushToast(`Modelo "${data.model.name}" guardado en la biblioteca.`, 'ok');
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

    const previousSnapshot = { orderCode, ofs, activeDraft, activeModel };
    const restoredOfs: OfBlock[] = draft.ofs.map((block) => ({
      id: block.id || uid(),
      of: block.of || '',
      description: block.description || '',
      ...(block.partDescription !== undefined ? { partDescription: block.partDescription } : {}),
      materials: block.materials.map((m) => ({
        id: m.id || uid(),
        code: m.code,
        description: m.description || '',
        quantity: hasQuantity(m.quantity) ? roundQuantity(m.quantity) : null,
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    }));

    setOrderCode(draft.orderCode || '');
    setOfs(restoredOfs.length > 0 ? restoredOfs : [createOf()]);
    setActiveDraft(toActiveDraft(draft));
    setActiveModel(null);
    setActiveTab('assignments');
    pushToast(`Borrador "${draft.name}" cargado. Puedes continuar editando el pedido.`, 'ok', {
      label: 'Deshacer',
      run: () => {
        setOrderCode(previousSnapshot.orderCode);
        setOfs(previousSnapshot.ofs);
        setActiveDraft(previousSnapshot.activeDraft);
        setActiveModel(previousSnapshot.activeModel);
      }
    });
  }

  async function handleQuickSaveDraft() {
    if (!activeDraft?.id) {
      setIsSaveDraftOpen(true);
      return;
    }
    if (isQuickSavingDraft) return;

    setIsQuickSavingDraft(true);
    try {
      const { record, created } = await saveVersioned<OrderDraft>({
        kind: 'borrador',
        collectionUrl: '/api/drafts',
        responseKey: 'draft',
        id: activeDraft.id,
        name: activeDraft.name,
        body: { id: activeDraft.id, name: activeDraft.name, orderCode, notes: activeDraft.notes, ofs },
        expectedUpdatedAt: activeDraft.updatedAt
      });
      setActiveDraft(toActiveDraft(record));
      setDraftsVersion((v) => v + 1);
      pushToast(
        created ? `Guardado como borrador nuevo: "${record.name}".` : `Borrador "${record.name}" actualizado con éxito.`,
        'ok'
      );
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Error al guardar el borrador.',
        err instanceof SaveCancelledError ? 'warn' : 'error'
      );
    } finally {
      setIsQuickSavingDraft(false);
    }
  }

  async function handleSaveDraftModal(data: {
    id?: string;
    name: string;
    orderCode: string;
    notes?: string;
    ofs: OfBlock[];
  }) {
    let savedDraft: OrderDraft;
    let updated = false;

    if (data.id) {
      const { record, created } = await saveVersioned<OrderDraft>({
        kind: 'borrador',
        collectionUrl: '/api/drafts',
        responseKey: 'draft',
        id: data.id,
        name: data.name,
        body: { ...data },
        expectedUpdatedAt: activeDraft?.id === data.id ? activeDraft.updatedAt : undefined
      });
      savedDraft = record;
      updated = !created;
    } else {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.error || 'No se pudo guardar el borrador.');
      savedDraft = responseData.draft;
    }

    setActiveDraft(toActiveDraft(savedDraft));
    setDraftsVersion((v) => v + 1);
    pushToast(
      updated ? `Borrador "${savedDraft.name}" actualizado con éxito.` : `Borrador "${savedDraft.name}" guardado.`,
      'ok'
    );
  }

  function handleDraftToModel(draft: OrderDraft) {
    const draftOfs: OfBlock[] = draft.ofs.map((block) => ({
      id: block.id || uid(),
      of: block.of || '',
      description: block.description || '',
      ...(block.partDescription !== undefined ? { partDescription: block.partDescription } : {}),
      materials: block.materials.map((m) => ({ ...m }))
    }));
    setModelModalOfs(draftOfs);
    setIsSaveAsModelOpen(true);
  }

  function clearActiveDraft() {
    setActiveDraft(null);
    pushToast('Borrador desvinculado. Los materiales se mantienen en la pantalla.', 'info');
  }

  function addLine(ofId: string, article: Article, quantity: QuantityInput) {
    const code = String(article.code || '').trim().toUpperCase();
    if (!code) {
      pushToast('Selecciona o escribe un artículo.', 'error');
      return false;
    }

    if (quantity === 'invalid') {
      pushToast('La cantidad no es válida.', 'error');
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
                ? { ...line, quantity: addQuantities(line.quantity, quantity) }
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
              quantity,
              width: article.detectedWidth ?? null,
              widthWarning: article.widthWarning ?? null
            }
          ]
        };
      })
    );

    if (article.widthWarning) {
      pushToast(`Línea añadida. Aviso: ${article.widthWarning}`, 'warn');
    } else if (quantity === null) {
      pushToast('Línea añadida sin cantidad: complétala antes de generar.', 'info');
    } else {
      pushToast('Línea añadida.', 'ok');
    }
    return true;
  }

  function addLineByOfValue(ofValue: string, article: Article, quantity: QuantityInput) {
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

    if (quantity === 'invalid') {
      pushToast('La cantidad no es válida.', 'error');
      return false;
    }

    setOfs((current) => {
      const existing = current.find((ofBlock) => ofBlock.of.trim() === of);
      const emptyDraft = current.find((ofBlock) => !ofBlock.of.trim() && ofBlock.materials.length === 0);
      const material = {
        id: uid(),
        code,
        description: article.description || '',
        quantity,
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
                ? { ...line, quantity: addQuantities(line.quantity, quantity) }
                : line
            )
          };
        }

        return { ...ofBlock, materials: [...ofBlock.materials, material] };
      });
    });

    if (article.widthWarning) {
      pushToast(`Línea añadida a OF ${of}. Aviso: ${article.widthWarning}`, 'warn');
    } else if (quantity === null) {
      pushToast(`Línea añadida a OF ${of} sin cantidad.`, 'info');
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

  function updateLineQuantity(ofId: string, lineId: string, quantity: Quantity) {
    setOfs((current) =>
      current.map((ofBlock) =>
        ofBlock.id === ofId
          ? {
              ...ofBlock,
              materials: ofBlock.materials.map((line) => (line.id === lineId ? { ...line, quantity } : line))
            }
          : ofBlock
      )
    );
  }

  function clearAll() {
    const snapshot = { orderCode, ofs, activeDraft, activeModel };
    const hadContent =
      Boolean(orderCode.trim()) ||
      ofs.some((ofBlock) => ofBlock.of.trim() || ofBlock.materials.length > 0);

    setOrderCode('');
    setOfs([createOf()]);
    setActiveDraft(null);
    setActiveModel(null);

    if (hadContent) {
      pushToast('Formulario limpio.', 'info', {
        label: 'Deshacer',
        run: () => {
          setOrderCode(snapshot.orderCode);
          setOfs(snapshot.ofs);
          setActiveDraft(snapshot.activeDraft);
          setActiveModel(snapshot.activeModel);
        }
      });
    }
  }

  function goToMissingLine(item: MissingQuantity) {
    setMissingQuantities(null);
    // Tras cerrar el aviso: llevar la OF a la vista y dejar el cursor en el campo
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-line-id="${CSS.escape(item.lineId)}"]`);
      if (!input) return;
      input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      input.focus({ preventScroll: true });
    }, 0);
  }

  async function saveExcelToNetwork({
    confirmOverwrite = false,
    confirmOfs = false
  }: { confirmOverwrite?: boolean; confirmOfs?: boolean } = {}) {
    lastSaveConfirmations.current = { confirmOverwrite, confirmOfs };
    if (duplicateOfs.size > 0) {
      pushToast(
        `Hay OFs repetidas: ${Array.from(duplicateOfs).join(', ')}. Corrige los números antes de generar.`,
        'error'
      );
      return;
    }

    const missing = findMissingQuantities(ofs);
    if (missing.length > 0) {
      setMissingQuantities(missing);
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
          confirmOfs,
          ofs: ofs.map((ofBlock) => ({
            of: ofBlock.of,
            description: ofBlock.description,
            materials: ofBlock.materials
          }))
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.needsOfConfirmation) {
        setOfWarningsPrompt(Array.isArray(data.ofWarnings) ? data.ofWarnings : []);
        return;
      }

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

      const snapshot = { orderCode, ofs, activeDraft, activeModel };
      setOrderCode('');
      setOfs([createOf()]);
      setActiveDraft(null);
      setActiveModel(null);
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
            setActiveModel(snapshot.activeModel);
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
        theme={theme}
        onToggleTheme={toggleTheme}
        userName={userName}
        onChangeUser={() => setIsWhoAreYouOpen(true)}
        navigation={
          <Navigation activeTab={activeTab} onChangeTab={setActiveTab} draftsCount={draftsCount} />
        }
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
          onImportOrderOfs={importOrderOfs}
          onOpenCopyConsumption={() => setIsCopyConsumptionOpen(true)}
          isImportingOfs={isImportingOfs}
          onOpenSaveDraft={() => setIsSaveDraftOpen(true)}
          onQuickSaveDraft={handleQuickSaveDraft}
          isQuickSavingDraft={isQuickSavingDraft}
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
          onMoveOf={(ofId, targetOfId, position) => setOfs((current) => moveOf(current, ofId, targetOfId, position))}
          onMoveOfBy={(ofId, delta) => setOfs((current) => moveOfBy(current, ofId, delta))}
          onMoveLine={(lineId, targetOfId, targetLineId, position) =>
            setOfs((current) => moveLine(current, lineId, targetOfId, targetLineId, position))
          }
          onMoveLineBy={(lineId, delta) => setOfs((current) => moveLineBy(current, lineId, delta))}
          collapsedOfs={collapsedOfs}
          onToggleCollapsed={(ofId) =>
            setCollapsedOfs((current) => {
              const next = new Set(current);
              if (next.has(ofId)) next.delete(ofId);
              else next.add(ofId);
              return next;
            })
          }
          onSetAllCollapsed={(collapsed) => setCollapsedOfs(collapsed ? new Set(ofs.map((block) => block.id)) : new Set())}
        />
      )}

      {activeTab === 'drafts' && (
        <DraftsView
          activeDraftId={activeDraft?.id || null}
          hasActiveContent={Boolean(orderCode.trim()) || ofs.some((b) => b.of.trim() || b.materials.length > 0)}
          onResumeDraft={(draft) => resumeDraft(draft)}
          onSaveCurrentAsDraft={() => setIsSaveDraftOpen(true)}
          onConvertToModel={handleDraftToModel}
          onRecordSaved={handleDraftSaved}
          pushToast={pushToast}
          refreshTrigger={draftsVersion}
        />
      )}

      {activeTab === 'models' && (
        <ModelsView
          onTransferModelToAssignment={handleTransferModelToAssignment}
          onRecordSaved={handleModelSaved}
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

      {reuseEntry && (
        <ReuseHistoryModal entry={reuseEntry} onClose={() => setReuseEntry(null)} onReuse={applyReusedOfs} />
      )}

      {isCopyConsumptionOpen && (
        <CopyConsumptionModal
          currentOrderCode={orderCode}
          hasContent={ofs.some((block) => block.of.trim() || block.materials.length > 0)}
          onClose={() => setIsCopyConsumptionOpen(false)}
          onLoad={(loadedOfs, summary) => {
            const previous = { ofs, activeModel };
            setOfs(loadedOfs.length ? loadedOfs : [createOf()]);
            setActiveModel(null);
            setIsCopyConsumptionOpen(false);
            pushToast(summary, 'ok', {
              label: 'Deshacer',
              run: () => {
                setOfs(previous.ofs);
                setActiveModel(previous.activeModel);
              }
            });
          }}
        />
      )}

      {isSaveAsModelOpen && (
        <SaveAsModelModal
          ofs={modelModalOfs || ofs}
          sourceModel={modelModalOfs ? null : activeModel}
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
              ¿Quieres descartar el trabajo actual y abrir el borrador <strong>“{pendingDraftToResume.name}”</strong>?
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
            saveExcelToNetwork({ ...lastSaveConfirmations.current, confirmOverwrite: true });
          }}
        />
      )}

      {ofWarningsPrompt && (
        <ConfirmDialog
          title="Revisa las OFs antes de generar"
          description={
            <>
              Según RPS, estas OFs <strong>no cuadran con el pedido {orderCode.trim() || 'indicado'}</strong>. Si
              generas igualmente, la reserva irá a esas OFs tal cual.
            </>
          }
          items={ofWarningsPrompt}
          confirmLabel="Generar igualmente"
          initialFocus="cancel"
          onCancel={() => setOfWarningsPrompt(null)}
          onConfirm={() => {
            setOfWarningsPrompt(null);
            saveExcelToNetwork({ ...lastSaveConfirmations.current, confirmOfs: true });
          }}
        />
      )}

      {missingQuantities && (
        <MissingQuantitiesDialog
          items={missingQuantities}
          onClose={() => setMissingQuantities(null)}
          onGoTo={goToMissingLine}
        />
      )}

      {isWhoAreYouOpen && (
        <WhoAreYouDialog
          current={userName}
          required={!userName}
          onClose={() => setIsWhoAreYouOpen(false)}
          onChoose={(name) => {
            const saved = setUserName(name);
            setUserNameState(saved);
            setIsWhoAreYouOpen(false);
            if (userName && saved !== userName) pushToast(`Ahora los cambios se apuntan a nombre de ${saved}.`, 'info');
          }}
        />
      )}

      {conflictDialog}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

instalarCabeceraUsuario();
iniciarPildoras();
createRoot(document.getElementById('root')!).render(<App />);
