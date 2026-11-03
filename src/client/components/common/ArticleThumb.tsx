import { useState } from 'react';
import { Package } from 'lucide-react';

/**
 * Foto del artículo sacada de RPS (STKArticle.Image) o, si no tiene, un icono.
 * `hasImage` viene de las búsquedas de artículos; en las líneas de material no se sabe
 * y se intenta cargar igual: si el servidor responde 404, se queda el icono.
 */
export function ArticleThumb({
  code,
  hasImage,
  size = 'sm'
}: {
  code: string;
  hasImage?: boolean;
  size?: 'sm' | 'lg';
}) {
  // El padre monta el componente con `key={code}`, así que un código nuevo empieza sin error.
  const [failed, setFailed] = useState(false);
  const cleanCode = code.trim();
  const showImage = Boolean(cleanCode) && hasImage !== false && !failed;

  return (
    <span className={`article-thumb article-thumb-${size}${showImage ? '' : ' is-empty'}`} aria-hidden="true">
      {showImage ? (
        <img
          src={`/api/article-image/${encodeURIComponent(cleanCode)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package />
      )}
    </span>
  );
}
