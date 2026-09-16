import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

/** Diálogo de confirmación genérico: sustituye a window.confirm en toda la app. */
export function ConfirmDialog({
  title,
  description,
  items,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onCancel,
  onConfirm
}: {
  title: string;
  description: ReactNode;
  items?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    confirmRef.current?.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-overlay"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-icon">
          <AlertTriangle aria-hidden="true" />
        </div>
        <h2 id="confirm-title">{title}</h2>
        <p>{description}</p>
        {items && items.length > 0 && (
          <ul className="modal-files">
            {items.map((item) => (
              <li key={item}>
                <FileSpreadsheet aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        )}
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="button button-danger" type="button" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
