import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { MaterialLine, OfBlock } from '../../types';
import { formatDisplayText } from '../../utils';

export function MaterialTable({
  ofBlock,
  onRemoveLine,
  onUpdateQuantity
}: {
  ofBlock: OfBlock;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateQuantity: (lineId: string, quantity: number) => void;
}) {
  return (
    <div className="materials-table-wrap">
      <table className="materials-table">
        <thead>
          <tr>
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
              <td className="empty-row" colSpan={5}>
                Sin materiales todavía en esta OF.
              </td>
            </tr>
          ) : (
            ofBlock.materials.map((line) => (
              <tr key={line.id}>
                <td>
                  <strong>{line.code}</strong>
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
    </div>
  );
}

export function QuantityCell({
  line,
  onCommit
}: {
  line: MaterialLine;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(null);
      return;
    }
    if (draft === null) return;
    const quantity = Number(draft.replace(',', '.'));
    if (Number.isFinite(quantity) && quantity > 0 && quantity !== line.quantity) {
      onCommit(quantity);
    }
    setDraft(null);
  }

  return (
    <input
      className="quantity-cell-input"
      value={draft ?? String(line.quantity)}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
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
      min="0.000001"
      step="0.01"
      aria-label={`Cantidad de ${line.code}`}
    />
  );
}
