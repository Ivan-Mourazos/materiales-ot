import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal: contains keyboard focus and restores it to the opener. */
export function ModelDialog({ children, className, labelledBy, onClose, busy = false }: {
  children: ReactNode;
  className: string;
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className="modal-overlay model-dialog" aria-labelledby={labelledBy}
      aria-busy={busy} onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}>
      <div className={`modal ${className}`}>
        {children}
      </div>
    </dialog>
  );
}
