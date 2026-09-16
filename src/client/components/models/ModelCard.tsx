import { useId, useState } from 'react';
import { ChevronDown, Copy, Edit2, Layers, Play, Trash2 } from 'lucide-react';
import type { AssignmentModel } from '../../types';
import { formatDisplayText, formatNumber, historyDateFormat } from '../../utils';

export function ModelCard({
  model,
  onUseModel,
  onEditModel,
  onDuplicateModel,
  onDeleteModel
}: {
  model: AssignmentModel;
  onUseModel: (model: AssignmentModel) => void;
  onEditModel: (model: AssignmentModel) => void;
  onDuplicateModel: (model: AssignmentModel) => void;
  onDeleteModel: (id: string, name: string) => void;
}) {
  const detailId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const totalLines = model.parts.reduce((sum, part) => sum + part.materials.length, 0);

  return (
    <article className={`model-card ${isOpen ? 'open' : ''}`}>
      <div className="model-row">
        <button
          className="model-head"
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls={detailId}
        >
          <ChevronDown className="model-chevron" aria-hidden="true" />
          <div className="model-title">
            <div className="model-name-badge">
              <strong>{model.name}</strong>
            </div>
            {model.description && <em>{model.description}</em>}
            <span>
              Actualizado el {historyDateFormat.format(new Date(model.updatedAt || model.createdAt))}
            </span>
          </div>
          <div className="model-meta">
            <span className="history-chip">
              <Layers aria-hidden="true" /> {model.parts.length} {model.parts.length === 1 ? 'parte' : 'partes (OFs)'}
            </span>
            <span className="history-chip">
              {totalLines} {totalLines === 1 ? 'artículo' : 'artículos'}
            </span>

          </div>
        </button>

        <div className="model-actions-bar">
          <button
            className="button button-primary model-use-button"
            type="button"
            onClick={() => onUseModel(model)}
            title="Transferir partes de este modelo a la asignación activa"
          >
            <Play aria-hidden="true" />
            Usar modelo
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => onEditModel(model)}
            title="Editar modelo y partes"
            aria-label={`Editar ${model.name}`}
          >
            <Edit2 aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => onDuplicateModel(model)}
            title="Duplicar como nuevo modelo"
            aria-label={`Duplicar ${model.name}`}
          >
            <Copy aria-hidden="true" />
          </button>
          <button
            className="icon-button danger"
            type="button"
            onClick={() => onDeleteModel(model.id, model.name)}
            title="Eliminar modelo"
            aria-label={`Eliminar ${model.name}`}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="model-parts-detail" id={detailId}>
          {model.parts.length === 0 ? (
            <div className="empty-parts-message">Este modelo aún no tiene partes definidas.</div>
          ) : (
            model.parts.map((part, pIdx) => (
              <div className="model-part-block" key={part.id || pIdx}>
                <div className="model-part-head">
                  <div className="model-part-number">OF {pIdx + 1}</div>
                  <div>
                    <strong>{part.name}</strong>
                    {part.description && <span> · {part.description}</span>}
                  </div>
                  <span className="model-part-count">
                    {part.materials.length} {part.materials.length === 1 ? 'material' : 'materiales'}
                  </span>
                </div>

                <div className="model-table-scroll">
                <table className="model-part-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Descripción</th>
                      <th>Cantidad base</th>
                    </tr>
                  </thead>
                  <tbody>
                    {part.materials.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="empty-row">
                          Sin materiales en esta parte.
                        </td>
                      </tr>
                    ) : (
                      part.materials.map((mat) => (
                        <tr key={mat.id || mat.code}>
                          <td>
                            <strong>{mat.code}</strong>
                          </td>
                          <td>{formatDisplayText(mat.description) || '-'}</td>
                          <td>{formatNumber(mat.quantity)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}
