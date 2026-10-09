import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Layers, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import type { AssignmentModel, ModelPart } from '../../types';
import { groupModelsByCategory, listCategoryLabels } from '../../modelCategories';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { useVersionedSave } from '../common/useVersionedSave';
import { ModelCard } from './ModelCard';
import { ModelEditorModal } from './ModelEditorModal';
import { ModelTransferModal } from './ModelTransferModal';

const VIEW_STORAGE_KEY = 'materiales-ot-modelos-vista';

/** Pastilla elegida (null = Todas) y grupos plegados, por clave de categoría. */
type LibraryView = { category: string | null; collapsed: string[] };

function readLibraryView(): LibraryView {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || 'null');
    return {
      category: typeof saved?.category === 'string' ? saved.category : null,
      collapsed: Array.isArray(saved?.collapsed)
        ? saved.collapsed.filter((key: unknown): key is string => typeof key === 'string')
        : []
    };
  } catch {
    return { category: null, collapsed: [] };
  }
}

export function ModelsView({
  onTransferModelToAssignment,
  onRecordSaved,
  pushToast
}: {
  onTransferModelToAssignment: (
    model: AssignmentModel,
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) => void;
  /** Tras actualizar un modelo: si es el cargado en Asignaciones, App refresca su versión. */
  onRecordSaved: (model: AssignmentModel) => void;
  pushToast: (text: string, type?: 'ok' | 'error' | 'warn' | 'info') => void;
}) {
  const [models, setModels] = useState<AssignmentModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState(false);

  // Modales
  const [editorOpen, setEditorOpen] = useState(false);
  const [modelToEdit, setModelToEdit] = useState<AssignmentModel | null>(null);
  const [modelToTransfer, setModelToTransfer] = useState<AssignmentModel | null>(null);
  const [modelToDelete, setModelToDelete] = useState<{ id: string; name: string } | null>(null);
  const { saveVersioned, conflictDialog } = useVersionedSave();
  const [view, setView] = useState<LibraryView>(readLibraryView);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // Sin almacenamiento (modo privado, bloqueado): la vista no se recuerda
    }
  }, [view]);

  const fetchModels = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await fetch('/api/models');
      if (!response.ok) throw new Error('Error al cargar modelos');
      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
      pushToast('No se pudieron cargar los modelos desde el servidor.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const filteredModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        m.parts.some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.materials.some((mat) => mat.code.toLowerCase().includes(q))
        )
    );
  }, [models, searchQuery]);
  const categorySuggestions = useMemo(() => listCategoryLabels(models), [models]);

  // Las etiquetas salen de todos los modelos: buscar no debe cambiar cómo se llama un grupo
  const allGroups = useMemo(() => groupModelsByCategory(models), [models]);
  const hasCategories = allGroups.some((group) => group.key);
  const searchedGroups = useMemo(() => {
    const visible = new Set(filteredModels.map((m) => m.id));
    return allGroups.map((group) => ({ ...group, models: group.models.filter((m) => visible.has(m.id)) }));
  }, [allGroups, filteredModels]);
  // Una pastilla guardada de una categoría que ya no existe vuelve a "Todas"
  const selectedKey =
    view.category !== null && allGroups.some((group) => group.key === view.category) ? view.category : null;
  const shownGroups = searchedGroups.filter(
    (group) => group.models.length > 0 && (selectedKey === null || group.key === selectedKey)
  );
  const shownCount = hasCategories
    ? shownGroups.reduce((total, group) => total + group.models.length, 0)
    : filteredModels.length;

  function selectCategory(key: string | null) {
    setView((current) => ({ ...current, category: key }));
  }

  function toggleGroup(key: string) {
    setView((current) => ({
      ...current,
      collapsed: current.collapsed.includes(key)
        ? current.collapsed.filter((k) => k !== key)
        : [...current.collapsed, key]
    }));
  }

  function renderModelCard(model: AssignmentModel) {
    return (
      <ModelCard
        key={model.id}
        model={model}
        onUseModel={(m) => setModelToTransfer(m)}
        onEditModel={(m) => {
          setModelToEdit(m);
          setEditorOpen(true);
        }}
        onDuplicateModel={handleDuplicateModel}
        onDeleteModel={(id, name) => setModelToDelete({ id, name })}
      />
    );
  }

  async function handleSaveModel(modelData: Partial<AssignmentModel>) {
    if (modelData.id) {
      const { record, created } = await saveVersioned<AssignmentModel>({
        kind: 'modelo',
        collectionUrl: '/api/models',
        responseKey: 'model',
        id: modelData.id,
        name: modelData.name || '',
        body: { ...modelData },
        expectedUpdatedAt: modelToEdit?.updatedAt || modelToEdit?.createdAt
      });
      if (!created) onRecordSaved(record);
      pushToast(created ? `Guardado como modelo nuevo: "${modelData.name} (copia)".` : 'Modelo actualizado correctamente.', 'ok');
    } else {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modelData)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo guardar el modelo.');
      }
      pushToast('Nuevo modelo creado con éxito.', 'ok');
    }
    fetchModels();
  }

  async function confirmDeleteModel({ id, name }: { id: string; name: string }) {
    setModelToDelete(null);

    try {
      const response = await fetch(`/api/models/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar el modelo');
      pushToast(`Modelo "${name}" eliminado.`, 'info');
      fetchModels();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error al eliminar.', 'error');
    }
  }

  async function handleDuplicateModel(model: AssignmentModel) {
    try {
      const duplicateData: Partial<AssignmentModel> = {
        name: `${model.name} (Copia)`,
        description: model.description || '',
        category: model.category || '',
        parts: model.parts.map((p) => ({
          ...p,
          id: undefined as unknown as string,
          materials: p.materials.map((m) => ({ ...m, id: undefined as unknown as string }))
        }))
      };

      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateData)
      });

      if (!response.ok) throw new Error('No se pudo duplicar el modelo.');
      pushToast(`Modelo duplicado como "${duplicateData.name}".`, 'ok');
      fetchModels();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error al duplicar.', 'error');
    }
  }

  return (
    <section className="models-view view" aria-labelledby="models-title">
      <header className="models-intro">
        <div>
          <span className="section-eyebrow">Biblioteca de materiales</span>
          <h2 id="models-title">Modelos reutilizables</h2>
          <p>Prepara las partes una vez. Elige un modelo y convierte sus materiales en una nueva asignación.</p>
        </div>
        <span className="library-count" aria-live="polite">{models.length} {models.length === 1 ? 'modelo' : 'modelos'}</span>
      </header>
      <div className="models-header-bar">
        <div className="models-search-box">
          <Search aria-hidden="true" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar modelo, parte o artículo…"
            type="search"
            autoComplete="off"
            aria-label="Buscar modelos"
          />
          {searchQuery && <button type="button" className="icon-button" onClick={() => setSearchQuery('')} aria-label="Limpiar búsqueda"><X aria-hidden="true" /></button>}
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={() => {
            setModelToEdit(null);
            setEditorOpen(true);
          }}
        >
          <Plus aria-hidden="true" />
          Crear modelo
        </button>
      </div>

      {!isLoading && !loadError && hasCategories && (
        <div className="category-pills" role="group" aria-label="Filtrar por categoría">
          <button
            type="button"
            className={`category-pill${selectedKey === null ? ' active' : ''}`}
            aria-pressed={selectedKey === null}
            onClick={() => selectCategory(null)}
          >
            Todas <span>{filteredModels.length}</span>
          </button>
          {searchedGroups.map((group) => (
            <button
              key={group.key || 'sin-categoria'}
              type="button"
              className={`category-pill${selectedKey === group.key ? ' active' : ''}`}
              aria-pressed={selectedKey === group.key}
              onClick={() => selectCategory(group.key)}
            >
              {group.label} <span>{group.models.length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="models-results-label" role="status">{!isLoading && !loadError && `${shownCount} ${shownCount === 1 ? 'modelo disponible' : 'modelos disponibles'}${searchQuery ? ` para “${searchQuery}”` : ' · despliega un modelo para consultar sus materiales'}`}</div>

      {isLoading ? (
        <div className="history-empty">
          <Loader2 className="spin" aria-hidden="true" />
          Cargando modelos…
        </div>
      ) : loadError ? (
        <div className="history-empty" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>No se pudo cargar la biblioteca</p>
          <span>Comprueba la conexión y vuelve a intentarlo.</span>
          <button className="button button-muted" type="button" onClick={fetchModels}><RefreshCw aria-hidden="true" /> Reintentar</button>
        </div>
      ) : shownCount === 0 ? (
        <div className="history-empty">
          <Layers aria-hidden="true" />
          <p>{searchQuery ? 'No se encontraron modelos para esa búsqueda.' : 'Aún no hay modelos creados.'}</p>
          <span>
            {searchQuery
              ? 'Prueba con otro término o limpia el buscador.'
              : 'Pulsa en "Crear modelo" o guarda una asignación como modelo para comenzar tu biblioteca.'}
          </span>
          {searchQuery && <button className="button button-muted" type="button" onClick={() => setSearchQuery('')}>Limpiar búsqueda</button>}
        </div>
      ) : hasCategories ? (
        <div className="model-groups">
          {shownGroups.map((group, index) => {
            const collapsed = view.collapsed.includes(group.key);
            const bodyId = `model-group-${index}`;
            return (
              <section key={group.key || 'sin-categoria'} className="model-group">
                <h3 className="model-group-title">
                  <button
                    type="button"
                    className="model-group-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <ChevronDown aria-hidden="true" />
                    <span>{group.label}</span>
                    <span className="model-group-count">{group.models.length}</span>
                  </button>
                </h3>
                <div className="models-grid" id={bodyId} hidden={collapsed}>
                  {group.models.map(renderModelCard)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="models-grid">{filteredModels.map(renderModelCard)}</div>
      )}

      {editorOpen && (
        <ModelEditorModal
          initialModel={modelToEdit}
          categorySuggestions={categorySuggestions}
          onClose={() => {
            setEditorOpen(false);
            setModelToEdit(null);
          }}
          onSave={handleSaveModel}
        />
      )}

      {modelToDelete && (
        <ConfirmDialog
          title="Eliminar modelo"
          description={
            <>
              Se va a eliminar <strong>{modelToDelete.name}</strong> de la biblioteca, con todas sus
              partes y materiales. Las asignaciones ya generadas no se ven afectadas.
            </>
          }
          confirmLabel="Eliminar modelo"
          onCancel={() => setModelToDelete(null)}
          onConfirm={() => confirmDeleteModel(modelToDelete)}
        />
      )}

      {modelToTransfer && (
        <ModelTransferModal
          model={modelToTransfer}
          onClose={() => setModelToTransfer(null)}
          onTransfer={(parts, replaceExisting) => {
            const model = modelToTransfer;
            setModelToTransfer(null);
            onTransferModelToAssignment(model, parts, replaceExisting);
          }}
        />
      )}

      {conflictDialog}
    </section>
  );
}
