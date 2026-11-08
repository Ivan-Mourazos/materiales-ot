import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Foto del artículo en grande (Iván, 08/11/2026: «poder abrir la foto en grande»). Diálogo nativo
 * por encima de la ficha: se cierra con Escape, con la X o pulsando fuera de la foto, y solo se
 * cierra él (no la ficha que tiene debajo).
 */
export function PhotoZoom({ code, description, onClose }: { code: string; description?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="photo-zoom"
      aria-label={`Foto de ${code}`}
      onCancel={(event) => {
        // Escape: cierra la foto y no deja que el evento llegue a la ficha
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <figure>
        <img src={`/api/article-image/${encodeURIComponent(code.trim())}`} alt={`Foto de ${code}`} />
        <figcaption>
          <strong>{code}</strong>
          {description && <span>{description}</span>}
        </figcaption>
      </figure>
      <button className="icon-button photo-zoom-close" type="button" onClick={onClose} aria-label="Cerrar la foto" title="Cerrar (Esc)">
        <X aria-hidden="true" />
      </button>
    </dialog>
  );
}
