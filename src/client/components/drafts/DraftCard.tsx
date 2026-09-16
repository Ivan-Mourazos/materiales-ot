import { useId, useState } from 'react';
import {
  BookmarkPlus,
  ChevronDown,
  Copy,
  Edit2,
  FileClock,
  Layers,
  Play,
  Trash2
} from 'lucide-react';
import type { OrderDraft } from '../../types';
import { formatDisplayText, formatNumber, historyDateFormat } from '../../utils';

export function DraftCard({
  draft,
  isActiveDraft,
  onResumeDraft,
  onConvertToModel,
  onEditDraft,
  onDuplicateDraft,
  onDeleteDraft
}: {
  draft: OrderDraft;
  isActiveDraft: boolean;
  onResumeDraft: (draft: OrderDraft) => void;
  onConvertToModel: (draft: OrderDraft) => void;
  onEditDraft: (draft: OrderDraft) => void;
  onDuplicateDraft: (draft: OrderDraft) => void;
  onDeleteDraft: (id: string, name: string) => void;
}) {
  const detailId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const totalLines = draft.totals?.lines ?? draft.ofs.reduce((sum, of) => sum + of.materials.length, 0);
  const totalUnits =
    draft.totals?.units ??
    draft.ofs.reduce(
      (sum, of) => sum + of.materials.reduce((mSum, m) => mSum + m.quantity, 0),
      0
    );

  return (
    <article
      className={`draft-card ${isOpen ? 'open' : ''} ${isActiveDraft ? 'active-working' : ''}`}
    >
      <div className="draft-row">
        <button
          className="draft-head"
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-controls={detailId}
        >
          <ChevronDown className="draft-chevron" aria-hidden="true" />
          <div className="draft-title">
            <div className="draft-name-badge">
              <strong>{draft.name}</strong>
              {draft.orderCode && (
                <span className="draft-order-tag" title="Número de pedido asignado">
                  Pedido {draft.orderCode}
                </span>
              )}
              {isActiveDraft && (
                <span className="draft-active-tag" title="Este borrador está cargado actualmente en la pantalla principal">
                  ● Abierto en Asignaciones
                </span>
              )}
            </div>
            {draft.notes && <em>{draft.notes}</em>}
            <span>
              Actualizado el {historyDateFormat.format(new Date(draft.updatedAt || draft.createdAt))}
            </span>
          </div>

          <div className="draft-meta">
            <span className="history-chip">
              <Layers aria-hidden="true" /> {draft.ofs.length} {draft.ofs.length === 1 ? 'OF' : 'OFs'}
            </span>
            <span className="history-chip">
              {totalLines} {totalLines === 1 ? 'línea' : 'líneas'}
            </span>
            <span className="history-chip">{formatNumber(totalUnits)} uds.</span>
          </div>
        </button>

        <div className="draft-actions-bar">
          <button
            className="draft-resume-button"
            type="button"
            onClick={() => onResumeDraft(draft)}
            title="Abrir este borrador en la pestaña principal de Asignaciones para continuar trabajando"
          >
            <Play aria-hidden="true" />
            Continuar pedido
          </button>

          <button
            className="icon-button"
            type="button"
            onClick={() => onConvertToModel(draft)}
            title="Guardar este borrador como plantilla de Modelo en la biblioteca"
            aria-label={`Guardar ${draft.name} como modelo`}
          >
            <BookmarkPlus aria-hidden="true" />
          </button>

          <button
            className="icon-button"
            type="button"
            onClick={() => onEditDraft(draft)}
            title="Editar nombre y notas del borrador"
            aria-label={`Editar ${draft.name}`}
          >
            <Edit2 aria-hidden="true" />
          </button>

          <button
            className="icon-button"
            type="button"
            onClick={() => onDuplicateDraft(draft)}
            title="Duplicar como nuevo borrador"
            aria-label={`Duplicar ${draft.name}`}
          >
            <Copy aria-hidden="true" />
          </button>

          <button
            className="icon-button danger"
            type="button"
            onClick={() => onDeleteDraft(draft.id, draft.name)}
            title="Eliminar borrador"
            aria-label={`Eliminar ${draft.name}`}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="draft-detail" id={detailId}>
          {draft.ofs.length === 0 ? (
            <div style={{ padding: '16px', color: 'var(--ink-3)', fontSize: '13px' }}>
              Este borrador no tiene OFs ni materiales guardados.
            </div>
          ) : (
            draft.ofs.map((block, idx) => (
              <div key={block.id || idx} className="draft-of-block">
                <div className="draft-of-head">
                  <div>
                    <strong>{block.of ? `OF ${block.of}` : `OF #${idx + 1} (Sin número)`}</strong>
                    {block.description && <em> — {block.description}</em>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                    {block.materials.length} {block.materials.length === 1 ? 'artículo' : 'artículos'}
                  </span>
                </div>

                {block.materials.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                    Sin líneas de materiales en esta OF.
                  </p>
                ) : (
                  <table className="draft-table">
                    <thead>
                      <tr>
                        <th style={{ width: '22%' }}>Artículo</th>
                        <th>Descripción</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.materials.map((m, mIdx) => (
                        <tr key={m.id || `${m.code}-${mIdx}`}>
                          <td>
                            <strong>{m.code}</strong>
                          </td>
                          <td>{formatDisplayText(m.description) || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(m.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </article>
  );
}
