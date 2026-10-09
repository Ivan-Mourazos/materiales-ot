import { ModelDialog } from '../common/ModelDialog';
import { useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Save, X } from 'lucide-react';
import type { ActiveModel, AssignmentModel, OfBlock } from '../../types';
import { formatNumber } from '../../utils';
import { hasQuantity } from '../../quantities';
import { CategoryField } from './CategoryField';
import { useCategorySuggestions } from './useCategorySuggestions';

type SaveMode = 'update' | 'new';

export function SaveAsModelModal({
  ofs,
  sourceModel = null,
  onClose,
  onSave
}: {
  ofs: OfBlock[];
  sourceModel?: ActiveModel | null;
  onClose: () => void;
  onSave: (modelData: Partial<AssignmentModel>, mode: SaveMode) => Promise<void>;
}) {
  const canUpdate = Boolean(sourceModel?.updatable);
  const initialName = canUpdate ? sourceModel?.name ?? '' : '';
  const initialDescription = canUpdate ? sourceModel?.description ?? '' : '';
  const initialCategory = canUpdate ? sourceModel?.category ?? '' : '';
  const [mode, setMode] = useState<SaveMode>(canUpdate ? 'update' : 'new');
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(initialCategory);
  const categorySuggestions = useCategorySuggestions();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Convert current OF blocks to Model Parts
  const partsToSave = useMemo(() => ofs
    .filter((ofBlock) => ofBlock.materials.length > 0 || ofBlock.of.trim() || ofBlock.description.trim())
    .map((ofBlock, index) => ({
      id: ofBlock.id,
      name: ofBlock.description.trim() || (ofBlock.of.trim() ? `OF ${ofBlock.of.trim()}` : `Parte ${index + 1}`),
      // La descripción de la parte de origen manda: así el nombre no crece en cada ida y vuelta
      description: ofBlock.partDescription !== undefined
        ? ofBlock.partDescription
        : ofBlock.of.trim() ? `Originado de OF ${ofBlock.of.trim()}` : '',
      materials: ofBlock.materials.map((m) => ({
        id: m.id,
        code: m.code,
        description: m.description,
        quantity: m.quantity,
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    })), [ofs]);

  function chooseMode(next: SaveMode) {
    setMode(next);
    if (!sourceModel) return;
    const copyName = `${sourceModel.name} (copia)`;
    if (next === 'new' && name === sourceModel.name) setName(copyName);
    if (next === 'update' && name === copyName) setName(sourceModel.name);
  }

  function requestClose() {
    if (isSaving) return;
    const dirty = name !== initialName || description !== initialDescription || category !== initialCategory;
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    onClose();
  }

  async function handleConfirm() {
    if (!name.trim()) {
      setError('Debes especificar un nombre para el modelo.');
      nameRef.current?.focus();
      return;
    }
    setError('');
    setIsSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), category: category.trim(), parts: partsToSave }, mode);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el modelo.');
    } finally {
      setIsSaving(false);
    }
  }

  const isUpdate = mode === 'update';

  return (
    <ModelDialog className="save-as-model-modal" labelledBy="save-model-title" onClose={requestClose} busy={isSaving}>
        <div className="modal-header">
          <div className="modal-icon">
            <BookmarkPlus aria-hidden="true" />
          </div>
          <div>
            <h2 id="save-model-title">{isUpdate ? 'Actualizar modelo' : 'Guardar como modelo'}</h2>
            <p className="modal-subtitle">
              {isUpdate
                ? 'Guarda las partes y materiales actuales en el modelo que cargaste.'
                : 'Reutiliza estas partes y materiales en futuras asignaciones.'}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={requestClose} disabled={isSaving} title="Cerrar" aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        {error && <div className="modal-error-banner" role="alert">{error}</div>}

        {sourceModel && (
          <fieldset className="save-mode-options">
            <legend className="sr-only">Cómo guardar</legend>
            <label className={`save-mode-option${canUpdate ? '' : ' disabled'}`}>
              <input
                type="radio"
                name="modelSaveMode"
                checked={isUpdate}
                disabled={!canUpdate}
                onChange={() => chooseMode('update')}
              />
              <span>
                <strong>Actualizar “{sourceModel.name}”</strong>
                <em>{sourceModel.reason ?? 'Guarda los cambios en el modelo que cargaste.'}</em>
              </span>
            </label>
            <label className="save-mode-option">
              <input type="radio" name="modelSaveMode" checked={!isUpdate} onChange={() => chooseMode('new')} />
              <span>
                <strong>Guardar como modelo nuevo</strong>
                <em>El modelo original no cambia.</em>
              </span>
            </label>
          </fieldset>
        )}

        <div className="model-editor-fields with-category">
          <label className="field">
            <span>{isUpdate ? 'Nombre del modelo *' : 'Nombre del nuevo modelo *'}</span>
            <input
              ref={nameRef}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Escenario ODL 950E, Toldo Terraza 6x4, etc."
              autoComplete="off"
            />
          </label>
          <CategoryField value={category} onChange={setCategory} suggestions={categorySuggestions} />
          <label className="field">
            <span>Descripción o notas</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: Estructura completa con lonas perimetrales y fijaciones"
            />
          </label>
        </div>

        <div className="save-as-model-preview">
          <h4>Partes que se incluirán en el modelo ({partsToSave.length}):</h4>
          <div className="save-as-model-parts-list">
            {partsToSave.map((part, index) => (
              <div key={part.id} className="save-as-part-item">
                <div className="save-as-part-head">
                  <span className="of-tag">Parte {index + 1}</span>
                  <strong>{part.name}</strong>
                  <span>({part.materials.length} materiales)</span>
                </div>
                <div className="save-as-materials-tags">
                  {part.materials.map((m) => (
                    <span key={m.id} className={`material-pill${hasQuantity(m.quantity) ? '' : ' missing'}`}>
                      {m.code} ({hasQuantity(m.quantity) ? `x${formatNumber(m.quantity)}` : 'sin cantidad'})
                    </span>
                  ))}
                  {part.materials.length === 0 && <span className="empty-pill">Sin materiales</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-actions">
            <button className="button button-muted" type="button" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || partsToSave.length === 0}
            >
              <Save aria-hidden="true" />
              {isSaving ? 'Guardando…' : isUpdate ? 'Actualizar modelo' : 'Guardar modelo'}
            </button>
          </div>
        </div>
    </ModelDialog>
  );
}
