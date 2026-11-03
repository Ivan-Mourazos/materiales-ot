import { useMemo, useState } from 'react';
import { ArrowRight, CheckSquare, ChevronDown, Copy, Square, X } from 'lucide-react';
import type { HistoryEntry, OfBlock } from '../../types';
import { allLineKeys, buildPickedOfs, lineKey, ofSelectionState, toggleOf } from '../../reusePick';
import { formatDisplayText, formatNumber, uid } from '../../utils';
import { ArticleThumb } from '../common/ArticleThumb';
import { ModelDialog } from '../common/ModelDialog';
import { TriStateCheckbox } from '../common/TriStateCheckbox';

/**
 * Reutilizar una reserva del historial eligiendo qué OFs llevar y qué materiales dentro de cada
 * una (Iván, 03/11/2026: antes se llevaba todo de golpe). Las OFs llegan sin número: son de otro
 * pedido.
 */
export function ReuseHistoryModal({
  entry,
  onClose,
  onReuse
}: {
  entry: HistoryEntry;
  onClose: () => void;
  onReuse: (ofs: OfBlock[], replaceExisting: boolean) => void;
}) {
  const [selected, setSelected] = useState(() => allLineKeys(entry.ofs));
  const [openOfs, setOpenOfs] = useState<Set<number>>(() => new Set(entry.ofs.length <= 3 ? entry.ofs.map((_, i) => i) : []));
  const [replaceExisting, setReplaceExisting] = useState(false);
  const picked = useMemo(() => buildPickedOfs(entry.ofs, selected, uid), [entry.ofs, selected]);
  const pickedLines = picked.reduce((sum, block) => sum + block.materials.length, 0);

  function toggleLine(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOpen(index: number) {
    setOpenOfs((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const title = entry.orderCode ? `Pedido ${entry.orderCode}` : `OF ${entry.ofs.map((item) => item.of).join(', ')}`;

  return (
    <ModelDialog className="reuse-history-modal" labelledBy="reuse-history-title" onClose={onClose}>
      <div className="modal-header">
        <div className="modal-icon">
          <Copy aria-hidden="true" />
        </div>
        <div>
          <h2 id="reuse-history-title">Reutilizar {title}</h2>
          <p className="modal-subtitle">
            Marca las OFs y los materiales que quieres llevar a la asignación. Llegan sin número de OF.
          </p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="transfer-parts-toolbar">
        <span className="parts-count-label">
          {picked.length} de {entry.ofs.length} OFs · {pickedLines} líneas
        </span>
        <div className="quick-selection-buttons">
          <button className="button button-ghost-sm" type="button" onClick={() => setSelected(allLineKeys(entry.ofs))}>
            <CheckSquare aria-hidden="true" /> Marcar todo
          </button>
          <button className="button button-ghost-sm" type="button" onClick={() => setSelected(new Set())}>
            <Square aria-hidden="true" /> Desmarcar todo
          </button>
        </div>
      </div>

      <ul className="reuse-list">
        {entry.ofs.map((ofBlock, ofIndex) => {
          const state = ofSelectionState(ofBlock, ofIndex, selected);
          const isOpen = openOfs.has(ofIndex);
          const markedCount = ofBlock.materials.filter((_, lineIndex) => selected.has(lineKey(ofIndex, lineIndex))).length;
          return (
            <li key={`${ofBlock.of}-${ofIndex}`} className={`reuse-of${state === 'none' ? ' is-off' : ''}`}>
              <div className="reuse-of-head">
                <TriStateCheckbox
                  state={state}
                  label={`Llevar la OF ${ofBlock.of}`}
                  onChange={() => setSelected((current) => toggleOf(ofBlock, ofIndex, current))}
                />
                <button type="button" className="reuse-of-toggle" aria-expanded={isOpen} onClick={() => toggleOpen(ofIndex)}>
                  <span className="of-tag">OF {ofBlock.of}</span>
                  <strong>{formatDisplayText(ofBlock.description) || 'Sin descripción'}</strong>
                  <span className="reuse-count">
                    {markedCount} de {ofBlock.materials.length} materiales
                  </span>
                  <ChevronDown aria-hidden="true" />
                </button>
              </div>
              {isOpen && (
                <ul className="reuse-lines">
                  {ofBlock.materials.map((line, lineIndex) => {
                    const key = lineKey(ofIndex, lineIndex);
                    return (
                      <li key={key}>
                        <label>
                          <input type="checkbox" checked={selected.has(key)} onChange={() => toggleLine(key)} />
                          <ArticleThumb key={line.code} code={line.code} />
                          <span className="reuse-code">{line.code}</span>
                          <span className="reuse-desc">{formatDisplayText(line.description)}</span>
                          <span className="reuse-qty">{line.quantity == null ? 'sin cantidad' : formatNumber(line.quantity)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="modal-footer">
        <label className="checkbox-line">
          <input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} />
          Reemplazar las OFs de la asignación (se puede deshacer)
        </label>
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button button-primary" type="button" disabled={picked.length === 0} onClick={() => onReuse(picked, replaceExisting)}>
            <ArrowRight aria-hidden="true" />
            Llevar a la asignación
          </button>
        </div>
      </div>
    </ModelDialog>
  );
}
