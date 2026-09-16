import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Layers, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import type { AssignmentModel, ModelPart } from '../../types';
import { ModelCard } from './ModelCard';
import { ModelEditorModal } from './ModelEditorModal';
import { ModelTransferModal } from './ModelTransferModal';

export function ModelsView({
  onTransferModelToAssignment,
  pushToast
}: {
  onTransferModelToAssignment: (
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) => void;
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

  async function handleSaveModel(modelData: Partial<AssignmentModel>) {
    const isEditing = Boolean(modelData.id);
    const url = isEditing ? `/api/models/${modelData.id}` : '/api/models';
    const method = isEditing ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modelData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'No se pudo guardar el modelo.');
    }

    pushToast(isEditing ? 'Modelo actualizado correctamente.' : 'Nuevo modelo creado con éxito.', 'ok');
    fetchModels();
  }

  async function handleDeleteModel(id: string, name: string) {
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el modelo "${name}"?`)) return;

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

      <div className="models-results-label" role="status">{!isLoading && !loadError && `${filteredModels.length} ${filteredModels.length === 1 ? 'modelo disponible' : 'modelos disponibles'}${searchQuery ? ` para “${searchQuery}”` : ' · despliega un modelo para consultar sus materiales'}`}</div>

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
      ) : filteredModels.length === 0 ? (
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
      ) : (
        <div className="models-grid">
          {filteredModels.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              onUseModel={(m) => setModelToTransfer(m)}
              onEditModel={(m) => {
                setModelToEdit(m);
                setEditorOpen(true);
              }}
              onDuplicateModel={handleDuplicateModel}
              onDeleteModel={handleDeleteModel}
            />
          ))}
        </div>
      )}

      {editorOpen && (
        <ModelEditorModal
          initialModel={modelToEdit}
          onClose={() => {
            setEditorOpen(false);
            setModelToEdit(null);
          }}
          onSave={handleSaveModel}
        />
      )}

      {modelToTransfer && (
        <ModelTransferModal
          model={modelToTransfer}
          onClose={() => setModelToTransfer(null)}
          onTransfer={(parts, replaceExisting) => {
            setModelToTransfer(null);
            onTransferModelToAssignment(parts, replaceExisting);
          }}
        />
      )}
    </section>
  );
}
