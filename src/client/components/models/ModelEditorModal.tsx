import { QuantityCell } from '../assignments/MaterialTable';
import { ModelDialog } from '../common/ModelDialog';
import { useRef, useState } from 'react';
import { Layers, PackagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import type { Article, AssignmentModel, ModelPart } from '../../types';
import { formatDisplayText, roundQuantity, uid } from '../../utils';
import { ArticlePicker, type ArticlePickerHandle } from '../common/ArticlePicker';

export function ModelEditorModal({
  initialModel,
  onClose,
  onSave
}: {
  initialModel: AssignmentModel | null;
  onClose: () => void;
  onSave: (modelData: Partial<AssignmentModel>) => Promise<void>;
}) {
  const [name, setName] = useState(initialModel?.name || '');
  const [description, setDescription] = useState(initialModel?.description || '');
  const [parts, setParts] = useState<ModelPart[]>(() => {
    if (initialModel?.parts?.length) {
      return initialModel.parts.map((p) => ({
        ...p,
        materials: p.materials.map((m) => ({ ...m }))
      }));
    }
    return [
      {
        id: uid(),
        name: 'Parte 1',
        description: '',
        materials: []
      }
    ];
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');


  const [original] = useState(() => JSON.stringify({ name, description, parts }));
  const nameRef = useRef<HTMLInputElement>(null);

  function requestClose() {
    if (isSaving) return;
    if (JSON.stringify({ name, description, parts }) !== original && !window.confirm('Hay cambios sin guardar. ¿Quieres descartarlos?')) return;
    onClose();
  }

  function addPart() {
    setParts((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Parte ${prev.length + 1}`,
        description: '',
        materials: []
      }
    ]);
  }

  function removePart(partId: string) {
    setParts((prev) => {
      const next = prev.filter((p) => p.id !== partId);
      return next.length > 0
        ? next
        : [
            {
              id: uid(),
              name: 'Parte 1',
              description: '',
              materials: []
            }
          ];
    });
  }

  function updatePartName(partId: string, partName: string) {
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, name: partName } : p)));
  }

  function updatePartDescription(partId: string, partDesc: string) {
    setParts((prev) => prev.map((p) => (p.id === partId ? { ...p, description: partDesc } : p)));
  }

  function addMaterialToPart(partId: string, article: Article, quantity: number) {
    const code = article.code?.trim().toUpperCase();
    if (!code) return;
    if (!Number.isFinite(quantity) || roundQuantity(quantity) <= 0) return;

    setParts((prev) =>
      prev.map((part) => {
        if (part.id !== partId) return part;
        const existingIdx = part.materials.findIndex((m) => m.code === code);
        if (existingIdx >= 0) {
          const updated = [...part.materials];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: roundQuantity(updated[existingIdx].quantity + quantity)
          };
          return { ...part, materials: updated };
        }
        return {
          ...part,
          materials: [
            ...part.materials,
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
  }

  function removeMaterialFromPart(partId: string, materialId: string) {
    setParts((prev) =>
      prev.map((part) =>
        part.id === partId
          ? { ...part, materials: part.materials.filter((m) => m.id !== materialId) }
          : part
      )
    );
  }

  function updateMaterialQuantity(partId: string, materialId: string, quantity: number) {
    if (!Number.isFinite(quantity) || roundQuantity(quantity) <= 0) return;
    setParts((prev) =>
      prev.map((part) =>
        part.id === partId
          ? {
              ...part,
              materials: part.materials.map((m) =>
                m.id === materialId ? { ...m, quantity: roundQuantity(quantity) } : m
              )
            }
          : part
      )
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      setErrorMessage('Debes indicar un nombre para el modelo.');
      nameRef.current?.focus();
      return;
    }
    if (parts.some((part) => !part.name.trim())) {
      setErrorMessage('Escribe un nombre para cada parte antes de guardar.');
      return;
    }
    setErrorMessage('');
    setIsSaving(true);
    try {
      await onSave({
        id: initialModel?.id,
        name: name.trim(),
        description: description.trim(),
        parts
      });
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al guardar el modelo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModelDialog className="model-editor-modal" labelledBy="editor-modal-title" onClose={requestClose} busy={isSaving}>
        <div className="modal-header">
          <div className="modal-icon">
            <Layers aria-hidden="true" />
          </div>
          <div>
            <h2 id="editor-modal-title">
              {initialModel ? `Editar modelo: ${initialModel.name}` : 'Crear modelo'}
            </h2>
            <p className="modal-subtitle">
              Configura las partes y los materiales que se asignarán a cada OF de este modelo.
            </p>
          </div>
          <button className="icon-button" type="button" onClick={requestClose} disabled={isSaving} title="Cerrar" aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        {errorMessage && <div className="modal-error-banner" role="alert">{errorMessage}</div>}

        <div className="model-editor-fields">
          <label className="field">
            <span>Nombre del modelo *</span>
            <input
              ref={nameRef}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej.: Escenario ODL 950E, Toldo Porticado, etc."
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Descripción o notas</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej.: Configuración estándar con lonas ignífugas y faldón inferior"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="editor-parts-section">
          <div className="editor-parts-header">
            <h3>Partes · una OF por parte</h3>
            <button className="button button-secondary" type="button" onClick={addPart}>
              <Plus aria-hidden="true" /> Añadir parte
            </button>
          </div>

          <div className="editor-parts-scroll">
            {parts.map((part, pIdx) => (
              <PartEditorCard
                key={part.id}
                index={pIdx}
                part={part}
                onUpdateName={(val) => updatePartName(part.id, val)}
                onUpdateDescription={(val) => updatePartDescription(part.id, val)}
                onRemovePart={() => removePart(part.id)}
                onAddMaterial={(art, qty) => addMaterialToPart(part.id, art, qty)}
                onRemoveMaterial={(matId) => removeMaterialFromPart(part.id, matId)}
                onUpdateMaterialQty={(matId, qty) => updateMaterialQuantity(part.id, matId, qty)}
              />
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <div className="editor-summary-info">
            <strong>{parts.length}</strong> partes ·{' '}
            <strong>{parts.reduce((sum, p) => sum + p.materials.length, 0)}</strong> materiales en total
          </div>
          <div className="modal-actions">
            <button className="button button-muted" type="button" onClick={requestClose} disabled={isSaving}>
              Cancelar
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Save aria-hidden="true" />
              {isSaving ? 'Guardando…' : 'Guardar modelo'}
            </button>
          </div>
        </div>
    </ModelDialog>
  );
}

function PartEditorCard({
  index,
  part,
  onUpdateName,
  onUpdateDescription,
  onRemovePart,
  onAddMaterial,
  onRemoveMaterial,
  onUpdateMaterialQty
}: {
  index: number;
  part: ModelPart;
  onUpdateName: (val: string) => void;
  onUpdateDescription: (val: string) => void;
  onRemovePart: () => void;
  onAddMaterial: (article: Article, quantity: number) => void;
  onRemoveMaterial: (matId: string) => void;
  onUpdateMaterialQty: (matId: string, quantity: number) => void;
}) {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [quantity, setQuantity] = useState('');
  const pickerRef = useRef<ArticlePickerHandle>(null);
  const [lineError, setLineError] = useState('');

  function handleAddLine() {
    const article =
      selectedArticle ||
      pickerRef.current?.typedArticle() || {
        idArticle: '',
        code: '',
        description: ''
      };
    const qty = Number(quantity);
    if (!article.code || !Number.isFinite(qty) || roundQuantity(qty) <= 0) {
      setLineError(!article.code ? 'Selecciona un artículo o escribe su código.' : 'Introduce una cantidad mayor que cero.');
      return;
    }
    setLineError('');
    onAddMaterial(article, qty);
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
  }

  return (
    <div className="editor-part-card">
      <div className="editor-part-top">
        <div className="editor-part-of-badge">OF {index + 1}</div>
        <label className="field part-name-field">
          <span>Nombre de la parte *</span>
          <input
            value={part.name}
            onChange={(e) => onUpdateName(e.target.value)}
            placeholder="Ej.: Estructura base, Faldón, etc."
          />
        </label>
        <label className="field part-desc-field">
          <span>Descripción adicional</span>
          <input
            value={part.description || ''}
            onChange={(e) => onUpdateDescription(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <button
          className="icon-button danger"
          type="button"
          onClick={() => { if (part.materials.length === 0 || window.confirm('¿Eliminar esta parte y sus materiales?')) onRemovePart(); }}
          title="Eliminar parte"
          aria-label={`Eliminar ${part.name}`}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      <div className="editor-part-add-line">
        <ArticlePicker ref={pickerRef} onSelect={setSelectedArticle} placeholder="Buscar artículo RPS..." />
        <label className="field editor-part-qty">
          <span>Cant. base</span>
          <input
            type="number"
            min="0.000001"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddLine();
              }
            }}
            placeholder="0"
          />
        </label>
        <button className="button button-secondary" type="button" onClick={handleAddLine}>
          <PackagePlus aria-hidden="true" /> Añadir
        </button>
      </div>

      {lineError && <p className="field-error" role="alert">{lineError}</p>}
      <div className="model-table-scroll">
      <table className="editor-part-materials-table">
        <thead>
          <tr>
            <th>Artículo</th>
            <th>Descripción</th>
            <th>Cantidad base</th>
            <th aria-label="Acción" />
          </tr>
        </thead>
        <tbody>
          {part.materials.length === 0 ? (
            <tr>
              <td colSpan={4} className="empty-row">
                Añade artículos a esta parte con el buscador superior.
              </td>
            </tr>
          ) : (
            part.materials.map((m) => (
              <tr key={m.id || m.code}>
                <td>
                  <strong>{m.code}</strong>
                </td>
                <td>{formatDisplayText(m.description) || '-'}</td>
                <td>
                  <QuantityCell line={m} onCommit={(value) => onUpdateMaterialQty(m.id, value)} />
                </td>
                <td>
                  <button
                    className="remove-line"
                    type="button"
                    onClick={() => onRemoveMaterial(m.id)}
                    aria-label={`Quitar ${m.code}`}
                    title="Eliminar artículo"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
