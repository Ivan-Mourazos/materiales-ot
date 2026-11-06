import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Article } from '../../types';
import { ArticlePicker, type ArticlePickerHandle } from '../common/ArticlePicker';
import { ModelDialog } from '../common/ModelDialog';
import { ArticleSheetModal } from './ArticleSheetModal';

/**
 * Consultar el stock de un artículo desde cualquier pestaña (Iván, 03/11/2026: «para consultar
 * stock primero tienes que cambiar de pestaña a Artículos»). Botón «Stock» de la cabecera o Ctrl+K:
 * se busca el artículo y se abre su ficha de stock, con foto, sin salir de donde se está.
 */
export function QuickStockButton() {
  const [isSearching, setIsSearching] = useState(false);
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setArticle(null);
        setIsSearching(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        className="estado-chip glass-chip usuario-chip quick-stock-button"
        onClick={() => setIsSearching(true)}
        title="Consultar el stock de un artículo sin cambiar de pestaña (Ctrl+K)"
      >
        <Search aria-hidden="true" />
        Stock
        <kbd>Ctrl K</kbd>
      </button>
      {isSearching && (
        <QuickStockSearch
          onClose={() => setIsSearching(false)}
          onPick={(picked) => {
            setIsSearching(false);
            setArticle(picked);
          }}
        />
      )}
      {article && <ArticleSheetModal article={article} onClose={() => setArticle(null)} />}
    </>
  );
}

function QuickStockSearch({ onClose, onPick }: { onClose: () => void; onPick: (article: Article) => void }) {
  const pickerRef = useRef<ArticlePickerHandle>(null);

  // El diálogo pone el foco en su primer botón (cerrar); aquí se quiere escribir directamente
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('.quick-stock-modal input')?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ModelDialog className="quick-stock-modal" labelledBy="quick-stock-title" onClose={onClose}>
      <div className="modal-header">
        <div className="modal-icon">
          <Search aria-hidden="true" />
        </div>
        <div>
          <h2 id="quick-stock-title">Consultar artículo</h2>
          <p className="modal-subtitle">Busca por código o descripción y elige el artículo para abrir su ficha.</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
          <X aria-hidden="true" />
        </button>
      </div>
      <ArticlePicker
        ref={pickerRef}
        placeholder="Código o descripción del artículo…"
        onSelect={(picked) => {
          // Solo los que vienen de RPS (con su id): un código tecleado a mano no tiene ficha de stock
          if (picked && picked.idArticle && picked.idArticle !== picked.code) onPick(picked);
        }}
      />
    </ModelDialog>
  );
}
