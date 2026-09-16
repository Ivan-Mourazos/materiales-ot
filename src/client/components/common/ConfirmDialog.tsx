import { useEffect, useRef } from 'react';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

export function ConfirmDialog({
  files,
  onCancel,
  onConfirm
}: {
  files: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal-overlay"
      aria-labelledby="overwrite-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-icon">
          <AlertTriangle aria-hidden="true" />
        </div>
        <h2 id="overwrite-title">Ya existen archivos con ese nombre</h2>
        <p>
          Estos archivos ya están en la carpeta compartida y se van a <strong>sobrescribir</strong>.
          Si RPS aún no los procesó, se perderá la asignación anterior.
        </p>
        <ul className="modal-files">
          {files.map((file) => (
            <li key={file}>
              <FileSpreadsheet aria-hidden="true" />
              {file}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="button button-danger" type="button" onClick={onConfirm}>
            Sobrescribir
          </button>
        </div>
      </div>
    </dialog>
  );
}
