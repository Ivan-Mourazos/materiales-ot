import { ModelDialog } from '../common/ModelDialog';
import { useMemo, useState } from 'react';
import { ArrowRight, CheckSquare, Layers, Square, X } from 'lucide-react';
import type { AssignmentModel, ModelPart } from '../../types';
import { formatNumber, roundQuantity } from '../../utils';

export function ModelTransferModal({
  model,
  onClose,
  onTransfer
}: {
  model: AssignmentModel;
  onClose: () => void;
  onTransfer: (
    partsToTransfer: { part: ModelPart; multiplier: number }[],
    replaceExisting: boolean
  ) => void;
}) {
  const [multiplierInput, setMultiplierInput] = useState('1');
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(
    () => new Set(model.parts.map((p) => p.id))
  );
  const [replaceExisting, setReplaceExisting] = useState(false);


  const multiplier = Number(multiplierInput.replace(',', '.'));
  const validMultiplier = Number.isFinite(multiplier) && multiplier > 0 && model.parts.every((p) => p.materials.every((m) => Number.isFinite(m.quantity * multiplier) && roundQuantity(m.quantity * multiplier) > 0));

  const togglePart = (id: string) => {
    setSelectedPartIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPartIds(new Set(model.parts.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedPartIds(new Set());
  };

  const selectedParts = useMemo(
    () => model.parts.filter((p) => selectedPartIds.has(p.id)),
    [model.parts, selectedPartIds]
  );

  const totalLinesSelected = selectedParts.reduce((sum, p) => sum + p.materials.length, 0);
  const totalUnitsSelected = selectedParts.reduce(
    (sum, p) => sum + p.materials.reduce((mSum, m) => mSum + roundQuantity(m.quantity * multiplier), 0),
    0
  );

  function handleConfirm() {
    if (selectedParts.length === 0 || !validMultiplier) return;
    const transferPayload = selectedParts.map((part) => ({
      part,
      multiplier
    }));
    onTransfer(transferPayload, replaceExisting);
  }

  return (
    <ModelDialog className="model-transfer-modal" labelledBy="transfer-modal-title" onClose={onClose}>
        <div className="modal-header">
          <div className="modal-icon">
            <Layers aria-hidden="true" />
          </div>
          <div>
            <h2 id="transfer-modal-title">Preparar asignación</h2>
            <p className="modal-subtitle">
              Modelo: <strong>{model.name}</strong>
              {model.description && ` · ${model.description}`}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="transfer-options-bar">
          <label className="field multiplier-field">
            <span>Unidades del modelo</span>
            <input
              type="number"
              min="0.000001"
              step="any"
              value={multiplierInput}
              aria-invalid={!validMultiplier}
              aria-describedby="multiplier-hint"
              onChange={(e) => setMultiplierInput(e.target.value)}
            />
            <span id="multiplier-hint" className={validMultiplier ? 'field-hint' : 'field-error'}>{validMultiplier ? 'Multiplica la cantidad base de cada material.' : 'Introduce una cantidad mayor que cero y válida para todos los materiales.'}</span>
          </label>

          <div className="transfer-mode-selector">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <span>Reemplazar las OFs existentes en el formulario</span>
            </label>
            <span className="field-hint">
              {replaceExisting
                ? 'Se sustituirán las OF actuales. Podrás deshacer el cambio.'
                : 'Se añadirán estas partes como nuevas tarjetas de OF a lo que ya tengas.'}
            </span>
          </div>
        </div>

        <div className="transfer-parts-toolbar">
          <span className="parts-count-label">
            Partes a generar como OFs ({selectedParts.length} de {model.parts.length}):
          </span>
          <div className="quick-selection-buttons">
            <button className="button button-ghost-sm" type="button" onClick={selectAll}>
              <CheckSquare aria-hidden="true" /> Marcar todas
            </button>
            <button className="button button-ghost-sm" type="button" onClick={deselectAll}>
              <Square aria-hidden="true" /> Desmarcar todas
            </button>
          </div>
        </div>

        <div className="transfer-parts-list">
          {model.parts.map((part, index) => {
            const isChecked = selectedPartIds.has(part.id);
            return (
              <label
                key={part.id}
                className={`transfer-part-item ${isChecked ? 'selected' : ''}`}
              >
                <div className="transfer-part-checkbox">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => togglePart(part.id)}
                    aria-label={`Seleccionar ${part.name}`}
                  />
                </div>
                <div className="transfer-part-info">
                  <div className="transfer-part-title">
                    <span className="of-tag">OF {index + 1}</span>
                    <strong>{part.name}</strong>
                    {part.description && <em>{part.description}</em>}
                  </div>
                  <div className="transfer-part-materials-preview">
                    {part.materials.map((m) => (
                      <span key={m.id || m.code} className="material-pill">
                        {m.code} (x{formatNumber(roundQuantity(m.quantity * multiplier))})
                      </span>
                    ))}
                    {part.materials.length === 0 && <span className="empty-pill">Sin materiales</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="modal-footer">
          <div className="transfer-summary-stats">
            <span>
              <strong>{selectedParts.length}</strong> OFs a crear
            </span>
            <span>·</span>
            <span>
              <strong>{totalLinesSelected}</strong> líneas de material
            </span>
            <span>·</span>
            <span>
              <strong>{formatNumber(totalUnitsSelected)}</strong> unidades totales
            </span>
          </div>

          <div className="modal-actions">
            <button className="button button-muted" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={handleConfirm}
              disabled={selectedParts.length === 0 || !validMultiplier}
            >
              <ArrowRight aria-hidden="true" />
              Añadir a asignación
            </button>
          </div>
        </div>
    </ModelDialog>
  );
}
