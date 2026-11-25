import { useMemo, useState } from 'react';
import { ArrowRight, CheckSquare, ChevronDown, Copy, Square, X } from 'lucide-react';
import type { OfBlock } from '../../types';
import { allLineKeys, buildPickedOfs, lineKey, ofSelectionState, toggleOf, type PickableOf } from '../../reusePick';
import { formatDisplayText, formatNumber, uid } from '../../utils';
import { ArticleThumb } from './ArticleThumb';
import { ModelDialog } from './ModelDialog';
import { TriStateCheckbox } from './TriStateCheckbox';

/**
 * Elegir qué OFs llevar a la asignación y qué materiales dentro de cada una. Se usa para
 * reutilizar una reserva del historial (Iván, 03/11/2026) y para traer OFs de otro borrador
 * (25/11/2026). Las OFs llegan sin número: Iván, «el número de la OF no hace falta».
 */
export function PickOfsModal({
  title,
  sourceOfs,
  onClose,
  onReuse
}: {
  /** Lo que sigue a «Reutilizar»: «Pedido AR…», «borrador «ODL 500EE»»… */
  title: string;
  sourceOfs: PickableOf[];
  onClose: () => void;
  onReuse: (ofs: OfBlock[], replaceExisting: boolean) => void;
}) {
  const [selected, setSelected] = useState(() => allLineKeys(sourceOfs));
  const [openOfs, setOpenOfs] = useState<Set<number>>(() => new Set(sourceOfs.length <= 3 ? sourceOfs.map((_, i) => i) : []));
  const [replaceExisting, setReplaceExisting] = useState(false);
  const picked = useMemo(() => buildPickedOfs(sourceOfs, selected, uid), [sourceOfs, selected]);
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
          {picked.length} de {sourceOfs.length} OFs · {pickedLines} líneas
        </span>
        <div className="quick-selection-buttons">
          <button className="button button-ghost-sm" type="button" onClick={() => setSelected(allLineKeys(sourceOfs))}>
            <CheckSquare aria-hidden="true" /> Marcar todo
          </button>
          <button className="button button-ghost-sm" type="button" onClick={() => setSelected(new Set())}>
            <Square aria-hidden="true" /> Desmarcar todo
          </button>
        </div>
      </div>

      <ul className="reuse-list">
        {sourceOfs.map((ofBlock, ofIndex) => {
          const state = ofSelectionState(ofBlock, ofIndex, selected);
          const isOpen = openOfs.has(ofIndex);
          const markedCount = ofBlock.materials.filter((_, lineIndex) => selected.has(lineKey(ofIndex, lineIndex))).length;
          return (
            <li key={`${ofBlock.of}-${ofIndex}`} className={`reuse-of${state === 'none' ? ' is-off' : ''}`}>
              <div className="reuse-of-head">
                <TriStateCheckbox
                  state={state}
                  label={`Llevar la OF ${ofBlock.of || formatDisplayText(ofBlock.description) || ofIndex + 1}`}
                  onChange={() => setSelected((current) => toggleOf(ofBlock, ofIndex, current))}
                />
                <button type="button" className="reuse-of-toggle" aria-expanded={isOpen} onClick={() => toggleOpen(ofIndex)}>
                  {ofBlock.of && <span className="of-tag">OF {ofBlock.of}</span>}
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
