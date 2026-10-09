import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

/** Diálogo de confirmación genérico: sustituye a window.confirm en toda la app. */
export function ConfirmDialog({
  title,
  description,
  items,
  confirmLabel,
  cancelLabel = 'Cancelar',
  secondaryLabel,
  initialFocus = 'confirm',
  onCancel,
  onSecondary,
  onConfirm
}: {
  title: string;
  description: ReactNode;
  items?: string[];
  confirmLabel: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  /** Dónde cae el foco al abrir. En un conflicto, nunca en la acción que pisa trabajo ajeno. */
  initialFocus?: 'confirm' | 'cancel';
  onCancel: () => void;
  onSecondary?: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Se lee una vez al montar; un ref evita reejecutar el efecto (y el aviso de dependencias)
  const initialFocusRef = useRef(initialFocus);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    (initialFocusRef.current === 'cancel' ? cancelRef : confirmRef).current?.focus();

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
          <button className="button button-muted" type="button" ref={cancelRef} onClick={onCancel}>
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary && (
            <button className="button button-muted" type="button" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          <button className="button button-danger" type="button" ref={confirmRef} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
