import { useRef, useState } from 'react';
import { FileClock, Loader2, Save, X } from 'lucide-react';
import type { OfBlock } from '../../types';
import { formatNumber } from '../../utils';
import { ModelDialog } from '../common/ModelDialog';

export function SaveDraftModal({
  initialDraft,
  orderCode,
  ofs,
  onClose,
  onSave
}: {
  initialDraft?: { id?: string; name?: string; notes?: string; orderCode?: string } | null;
  orderCode: string;
  ofs: OfBlock[];
  onClose: () => void;
  onSave: (draftData: { id?: string; name: string; orderCode: string; notes?: string; ofs: OfBlock[] }) => Promise<void>;
}) {
  const isEditingExisting = Boolean(initialDraft?.id);

  const defaultName = initialDraft?.name
    ? initialDraft.name
    : orderCode.trim()
      ? `Pedido ${orderCode.trim()}`
      : `Borrador ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

  const [name, setName] = useState(defaultName);
  const [currentOrderCode, setCurrentOrderCode] = useState(initialDraft?.orderCode || orderCode || '');
  const [notes, setNotes] = useState(initialDraft?.notes || '');
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);

  const totalLines = ofs.reduce((sum, b) => sum + b.materials.length, 0);
  const totalUnits = ofs.reduce(
    (sum, b) => sum + b.materials.reduce((mSum, m) => mSum + m.quantity, 0),
    0
  );

  async function handleConfirm() {
    if (!name.trim()) {
      setError('Debes indicar un nombre para el borrador.');
      nameRef.current?.focus();
      return;
    }

    setError('');
    setIsSaving(true);

    try {
      await onSave({
        id: isEditingExisting && !saveAsNew ? initialDraft?.id : undefined,
        name: name.trim(),
        orderCode: currentOrderCode.trim().toUpperCase(),
        notes: notes.trim(),
        ofs
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el borrador.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModelDialog
      className="save-draft-modal"
      labelledBy="save-draft-title"
      onClose={onClose}
      busy={isSaving}
    >
      <div className="modal-header">
        <div className="modal-icon">
          <FileClock aria-hidden="true" />
        </div>
        <div>
          <h2 id="save-draft-title">
            {isEditingExisting && !saveAsNew ? 'Actualizar borrador' : 'Guardar como borrador'}
          </h2>
          <p className="modal-subtitle">
            Guarda el pedido a medias para continuarlo en cualquier momento desde la pestaña de Borradores.
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onClose}
          disabled={isSaving}
          title="Cerrar"
          aria-label="Cerrar"
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {error && (
        <div className="modal-error-banner" role="alert">
          {error}
        </div>
      )}

      <div className="model-editor-fields">
        {isEditingExisting && (
          <div style={{ marginBottom: 6, display: 'flex', gap: 14 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="draftMode"
                checked={!saveAsNew}
                onChange={() => setSaveAsNew(false)}
              />
              Sobrescribir borrador actual
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="draftMode"
                checked={saveAsNew}
                onChange={() => setSaveAsNew(true)}
              />
              Guardar como nueva copia
            </label>
          </div>
        )}

        <label className="field">
          <span>Nombre del borrador *</span>
          <input
            ref={nameRef}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej.: Pedido AR260123 - Escenario ODL"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>N.º de pedido</span>
          <input
            value={currentOrderCode}
            onChange={(e) => setCurrentOrderCode(e.target.value)}
            placeholder="Ej.: AR260123 (opcional)"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>Notas o comentarios</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ej.: Pendiente de confirmar lonas laterales con taller..."
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '8px 12px',
              borderRadius: 'var(--radius-s)',
              border: '1px solid var(--border)',
              background: 'var(--input-bg)',
              color: 'var(--ink)',
              font: 'inherit',
              fontSize: '13.5px'
            }}
          />
        </label>
      </div>

      <div className="save-draft-preview">
        <h4>Contenido que se guardará en el borrador:</h4>
        <div className="save-draft-stats">
          <div className="save-draft-stat">
            <strong>{ofs.length}</strong>
            <span>{ofs.length === 1 ? 'OF' : 'OFs'}</span>
          </div>
          <div className="save-draft-stat">
            <strong>{totalLines}</strong>
            <span>{totalLines === 1 ? 'línea' : 'líneas'}</span>
          </div>
          <div className="save-draft-stat">
            <strong>{formatNumber(totalUnits)}</strong>
            <span>uds. totales</span>
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <div className="modal-actions">
          <button
            className="button button-muted"
            type="button"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={handleConfirm}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="spin" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {isSaving ? 'Guardando…' : isEditingExisting && !saveAsNew ? 'Actualizar borrador' : 'Guardar borrador'}
          </button>
        </div>
      </div>
    </ModelDialog>
  );
}
