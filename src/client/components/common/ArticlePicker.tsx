import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { Article } from '../../types';
import { formatDisplayText } from '../../utils';

export type ArticlePickerHandle = { clear: () => void; typedArticle: () => Article | null };

export const ArticlePicker = forwardRef<ArticlePickerHandle, {
  onSelect: (article: Article | null) => void;
  placeholder?: string;
}>(function ArticlePicker({ onSelect, placeholder = 'Buscar artículo…' }, ref) {
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedCode = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useImperativeHandle(ref, () => ({
    clear() {
      selectedCode.current = '';
      setQuery('');
      setArticles([]);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    typedArticle() {
      const code = query.trim().toUpperCase();
      return code ? { idArticle: code, code, description: '' } : null;
    }
  }), [query]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery === selectedCode.current || trimmedQuery.length < 2) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/articles?q=' + encodeURIComponent(trimmedQuery) + '&limit=20', { signal: controller.signal });
        if (!response.ok) throw new Error('search failed');
        const data = await response.json();
        if (!controller.signal.aborted) setArticles(data.articles || []);
      } catch {
        if (!controller.signal.aborted) setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(id + '-option-' + activeIndex)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, id]);

  function selectArticle(article: Article) {
    selectedCode.current = article.code;
    onSelect(article);
    setQuery(article.code);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  return (
    <div className="field article-search" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
    }}>
      <label htmlFor={id}>Artículo</label>
      <div className="search-input">
        <Search aria-hidden="true" />
        <input id={id} ref={inputRef} value={query} placeholder={placeholder}
          role="combobox" aria-autocomplete="list" aria-expanded={isOpen}
          aria-controls={isOpen ? id + '-results' : undefined}
          aria-activedescendant={isOpen && activeIndex >= 0 ? id + '-option-' + activeIndex : undefined}
          onChange={(event) => {
            selectedCode.current = '';
            onSelect(null);
            setQuery(event.target.value);
            setArticles([]);
            setSearchError(false);
            setActiveIndex(-1);
            setIsOpen(event.target.value.trim().length >= 2);
          }}
          onFocus={() => { if (query.trim().length >= 2 && !selectedCode.current) setIsOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && isOpen) {
              event.preventDefault(); event.stopPropagation(); setIsOpen(false);
            } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && articles.length) {
              event.preventDefault();
              setIsOpen(true);
              setActiveIndex((current) => current < 0 ? (event.key === 'ArrowDown' ? 0 : articles.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + articles.length) % articles.length);
            } else if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
              event.preventDefault(); selectArticle(articles[activeIndex]);
            }
          }} autoComplete="off" spellCheck={false} />
        {isLoading && <Loader2 className="spin" aria-label="Buscando artículos" />}
      </div>
      {isOpen && (
        <div className="results" id={id + '-results'} role="listbox" aria-label="Artículos encontrados">
          {articles.length === 0 ? (
            <div className="empty-result" role="status">
              {isLoading ? 'Buscando artículos…' : searchError ? 'No se pudo consultar RPS. Reintenta la búsqueda o escribe un código exacto.' : 'Sin resultados en RPS. Puedes usar el código escrito.'}
            </div>
          ) : articles.map((article, index) => (
            <button className={'result-item' + (activeIndex === index ? ' active' : '')}
              id={id + '-option-' + index} type="button" role="option" aria-selected={activeIndex === index}
              tabIndex={-1} key={article.idArticle} onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectArticle(article)}>
              <strong>{article.code}</strong>
              <span>{formatDisplayText(article.description)}</span>
              <em>{[article.family, article.subfamily, article.productionSection].filter(Boolean).map((value) => formatDisplayText(value || '')).join(' · ')}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
