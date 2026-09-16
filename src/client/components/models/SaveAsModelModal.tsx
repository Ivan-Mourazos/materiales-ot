import { ModelDialog } from '../common/ModelDialog';
import { useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Save, X } from 'lucide-react';
import type { AssignmentModel, OfBlock } from '../../types';
import { formatNumber } from '../../utils';

export function SaveAsModelModal({
  ofs,
  onClose,
  onSave
}: {
  ofs: OfBlock[];
  onClose: () => void;
  onSave: (modelData: Partial<AssignmentModel>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);


  // Convert current OF blocks to Model Parts
  const partsToSave = useMemo(() => ofs
    .filter((ofBlock) => ofBlock.materials.length > 0 || ofBlock.of.trim() || ofBlock.description.trim())
    .map((ofBlock, index) => ({
      id: ofBlock.id,
      name: ofBlock.description.trim() || (ofBlock.of.trim() ? `OF ${ofBlock.of.trim()}` : `Parte ${index + 1}`),
      description: ofBlock.of.trim() ? `Originado de OF ${ofBlock.of.trim()}` : '',
      materials: ofBlock.materials.map((m) => ({
        id: m.id,
        code: m.code,
        description: m.description,
        quantity: m.quantity,
        width: m.width ?? null,
        widthWarning: m.widthWarning ?? null
      }))
    })), [ofs]);

  function requestClose() {
    if (isSaving) return;
    if ((name.trim() || description.trim()) && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
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
      await onSave({
        name: name.trim(),
        description: description.trim(),
        parts: partsToSave
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el modelo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModelDialog className="save-as-model-modal" labelledBy="save-model-title" onClose={requestClose} busy={isSaving}>
        <div className="modal-header">
          <div className="modal-icon">
            <BookmarkPlus aria-hidden="true" />
          </div>
          <div>
            <h2 id="save-model-title">Guardar como modelo</h2>
            <p className="modal-subtitle">
              Reutiliza estas partes y materiales en futuras asignaciones.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={requestClose} disabled={isSaving} title="Cerrar" aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        {error && <div className="modal-error-banner" role="alert">{error}</div>}

        <div className="model-editor-fields">
          <label className="field">
            <span>Nombre del nuevo modelo *</span>
            <input
              ref={nameRef}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Escenario ODL 950E, Toldo Terraza 6x4, etc."
              autoComplete="off"
            />
          </label>
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
                    <span key={m.id} className="material-pill">
                      {m.code} (x{formatNumber(m.quantity)})
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
              {isSaving ? 'Guardando…' : 'Guardar modelo'}
            </button>
          </div>
        </div>
    </ModelDialog>
  );
}
