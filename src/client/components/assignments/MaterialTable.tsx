import { useRef, useState } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { draggingItem, dropPositionFor, endDrag, startDrag } from '../../dragState';
import type { DropPosition } from '../../reorder';
import { ArticleThumb } from '../common/ArticleThumb';
import { ArticleSheetByCode } from '../catalog/ArticleSheetModal';
import type { OfBlock } from '../../types';
import { formatDisplayText } from '../../utils';
import { hasQuantity, parseQuantityInput, quantityInputValue, type Quantity } from '../../quantities';

export function MaterialTable({
  ofBlock,
  onRemoveLine,
  onUpdateQuantity,
  onMoveLine,
  onMoveLineBy
}: {
  ofBlock: OfBlock;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateQuantity: (lineId: string, quantity: Quantity) => void;
  /** Soltar un material delante o detrás de `targetLineId` (de esta OF o de otra). */
  onMoveLine: (lineId: string, targetOfId: string, targetLineId: string | null, position: DropPosition) => void;
  /** Subir o bajar un material con las flechas del teclado. */
  onMoveLineBy: (lineId: string, delta: -1 | 1) => void;
}) {
  // Dónde caería el material que se arrastra: fila y si va delante o detrás
  const [dropMark, setDropMark] = useState<{ lineId: string; position: DropPosition } | null>(null);
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const [sheetCode, setSheetCode] = useState<string | null>(null);

  return (
    <div className="materials-table-wrap">
      <table className="materials-table">
        <thead>
          <tr>
            <th aria-label="Ordenar" className="drag-col" />
            <th>Artículo</th>
            <th>Descripción</th>
            <th>Ancho</th>
            <th>Cantidad</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {ofBlock.materials.length === 0 ? (
            <tr>
              <td className="empty-row" colSpan={6}>
                Sin materiales todavía en esta OF.
              </td>
            </tr>
          ) : (
            ofBlock.materials.map((line) => (
              <tr
                key={line.id}
                className={dropMark?.lineId === line.id ? `drop-${dropMark.position}` : undefined}
                onDragOver={(event) => {
                  const item = draggingItem();
                  if (item?.type !== 'line' || item.lineId === line.id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                  const position = dropPositionFor(event, event.currentTarget);
                  setDropMark((mark) => (mark?.lineId === line.id && mark.position === position ? mark : { lineId: line.id, position }));
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropMark(null);
                }}
                onDrop={(event) => {
                  const item = draggingItem();
                  setDropMark(null);
                  if (item?.type !== 'line') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onMoveLine(item.lineId, ofBlock.id, line.id, dropPositionFor(event, event.currentTarget));
                  endDrag();
                }}
              >
                <td className="drag-col">
                  <button
                    ref={(element) => {
                      if (element) handleRefs.current.set(line.id, element);
                      else handleRefs.current.delete(line.id);
                    }}
                    className="drag-handle"
                    type="button"
                    draggable
                    onDragStart={(event) => startDrag(event, { type: 'line', ofId: ofBlock.id, lineId: line.id }, event.currentTarget.closest('tr'))}
                    onDragEnd={() => {
                      endDrag();
                      setDropMark(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                      event.preventDefault();
                      onMoveLineBy(line.id, event.key === 'ArrowUp' ? -1 : 1);
                      // Al mover la fila el navegador puede quitarle el foco: se le devuelve
                      requestAnimationFrame(() => handleRefs.current.get(line.id)?.focus());
                    }}
                    aria-label={`Mover ${line.code}. Arrastra o usa las flechas arriba y abajo`}
                    title="Arrastra para ordenar (o pasar a otra OF). Con el teclado: flechas arriba y abajo"
                  >
                    <GripVertical aria-hidden="true" />
                  </button>
                </td>
                <td>
                  <span className="material-code">
                    <button type="button" className="article-thumb-button" aria-label={`Abrir ficha de ${line.code}`} title="Abrir ficha del artículo" onClick={() => setSheetCode(line.code)}><ArticleThumb key={line.code} code={line.code} /></button>
                    <strong>{line.code}</strong>
                  </span>
                </td>
                <td>{formatDisplayText(line.description)}</td>
                <td>
                  <span className={line.widthWarning ? 'width-warning' : ''}>
                    {line.width ? `${line.width} cm` : '-'}
                  </span>
                </td>
                <td>
                  <QuantityCell line={line} onCommit={(value) => onUpdateQuantity(line.id, value)} />
                </td>
                <td>
                  <button
                    className="remove-line"
                    type="button"
                    onClick={() => onRemoveLine(ofBlock.id, line.id)}
                    aria-label={`Quitar ${line.code}`}
                    title="Eliminar artículo de la OF"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {sheetCode && <ArticleSheetByCode key={sheetCode} code={sheetCode} onClose={() => setSheetCode(null)} />}
    </div>
  );
}

export function QuantityCell({
  line,
  onCommit
}: {
  line: { id: string; code: string; quantity: Quantity };
  onCommit: (quantity: Quantity) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  function commit(input: HTMLInputElement) {
    // "-" o "1e" llegan como valor vacío pero con badInput: no son "sin cantidad", son
    // texto a medio teclear. Se lee al confirmar porque React no avisa si el valor sigue vacío.
    const halfTyped = input.validity.badInput;
    // Volver a pintar la cantidad: React cree que el campo ya muestra eso y no lo repintaría
    if (halfTyped) input.value = quantityInputValue(line.quantity);
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    if (halfTyped) {
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const quantity = parseQuantityInput(draft);
    // Vaciar el campo es válido: la línea queda sin cantidad
    if (quantity !== 'invalid' && quantity !== line.quantity) {
      onCommit(quantity);
    }
    setDraft(null);
  }

  return (
    <input
      className={`quantity-cell-input${hasQuantity(line.quantity) ? '' : ' quantity-missing'}`}
      data-line-id={line.id}
      value={draft ?? quantityInputValue(line.quantity)}
      placeholder="Sin cantidad"
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => commit(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelledRef.current = true;
          event.currentTarget.blur();
        }
      }}
      type="number"
      min="0"
      step="0.01"
      aria-label={`Cantidad de ${line.code}`}
    />
  );
}
