import { useEffect, useRef } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { MissingQuantity } from '../../quantities';
import { formatDisplayText } from '../../utils';

/** Aviso que bloquea la generación mientras haya líneas sin cantidad. Cada fila lleva a su campo. */
export function MissingQuantitiesDialog({
  items,
  onClose,
  onGoTo
}: {
  items: MissingQuantity[];
  onClose: () => void;
  onGoTo: (item: MissingQuantity) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  // Si se pulsa una fila, el foco va a esa línea y no debe volver al botón de generar
  const restoreFocusRef = useRef(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (restoreFocusRef.current && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-overlay"
      aria-labelledby="missing-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal">
        <div className="modal-icon">
          <AlertTriangle aria-hidden="true" />
        </div>
        <h2 id="missing-title">Faltan cantidades</h2>
        <p>
          No se ha generado nada.{' '}
          {items.length === 1 ? 'Esta línea no tiene cantidad' : `Estas ${items.length} líneas no tienen cantidad`}:
          pulsa una para ir a su campo.
        </p>
        <ul className="missing-list">
          {items.map((item) => (
            <li key={item.lineId}>
              <button
                className="missing-item"
                type="button"
                onClick={() => {
                  restoreFocusRef.current = false;
                  onGoTo(item);
                }}
              >
                <span className="missing-item-of">{item.ofLabel}</span>
                <span className="missing-item-code">
                  {item.code}
                  {item.description && <em>{formatDisplayText(item.description)}</em>}
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onClose}>
            Volver
          </button>
        </div>
      </div>
    </dialog>
  );
}
