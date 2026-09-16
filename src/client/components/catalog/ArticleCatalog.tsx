import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, PackagePlus, RotateCcw, Search } from 'lucide-react';
import type { Article, ArticleFilters, CatalogFilterState, OfBlock } from '../../types';
import { formatDisplayText, formatNumber, formatUnitLabel } from '../../utils';
import { FilterSelect } from '../common/FilterSelect';
import { StockDetailModal } from './StockDetailModal';

const defaultCatalogFilters: CatalogFilterState = {
  q: '',
  family: '',
  subfamily: '',
  unit: '',
  productionSection: '',
  active: true,
  hideBlocked: true,
  includeOmitted: false
};

const catalogLimit = 180;

export function ArticleCatalog({
  ofs,
  onAddLineToOf
}: {
  ofs: OfBlock[];
  onAddLineToOf: (of: string, article: Article, quantity: number) => boolean;
}) {
  const [filters, setFilters] = useState<CatalogFilterState>(defaultCatalogFilters);
  const [filterOptions, setFilterOptions] = useState<ArticleFilters>({
    family: [],
    subfamily: [],
    unit: [],
    productionSection: []
  });
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stockArticle, setStockArticle] = useState<Article | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      family: filters.family,
      subfamily: filters.subfamily,
      includeOmitted: String(filters.includeOmitted)
    });

    fetch(`/api/article-filters?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('filters failed'))))
      .then((data) => setFilterOptions(data.filters || { family: [], subfamily: [], unit: [], productionSection: [] }))
      .catch(() => {});
  }, [filters.family, filters.subfamily, filters.includeOmitted]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setIsLoading(true);

      const params = new URLSearchParams({
        q: filters.q,
        family: filters.family,
        subfamily: filters.subfamily,
        unit: filters.unit,
        productionSection: filters.productionSection,
        active: String(filters.active),
        hideBlocked: String(filters.hideBlocked),
        includeOmitted: String(filters.includeOmitted),
        limit: String(catalogLimit)
      });

      fetch(`/api/article-list?${params.toString()}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('catalog failed'))))
        .then((data) => setArticles(data.articles || []))
        .catch((error) => {
          if (error.name !== 'AbortError') setArticles([]);
        })
        .finally(() => setIsLoading(false));
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters]);

  const activeFilterCount =
    Number(Boolean(filters.q.trim())) +
    Number(Boolean(filters.family)) +
    Number(Boolean(filters.subfamily)) +
    Number(Boolean(filters.unit)) +
    Number(Boolean(filters.productionSection)) +
    Number(!filters.active) +
    Number(!filters.hideBlocked) +
    Number(filters.includeOmitted);

  return (
    <section className="catalog-shell">
      <div className="catalog-panel">
        <div className="catalog-search-row">
          <label className="field catalog-search">
            <span>Búsqueda</span>
            <div className="search-input">
              <Search aria-hidden="true" />
              <input
                value={filters.q}
                onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                placeholder="Código, descripción o norma UNE..."
                autoComplete="off"
              />
              {isLoading && <Loader2 className="spin" aria-hidden="true" />}
            </div>
          </label>

          <FilterSelect
            label="Familia"
            value={filters.family}
            options={filterOptions.family}
            onChange={(family) => setFilters((current) => ({ ...current, family, subfamily: '' }))}
          />
          <FilterSelect
            label="Subfamilia"
            value={filters.subfamily}
            options={filterOptions.subfamily}
            onChange={(subfamily) => setFilters((current) => ({ ...current, subfamily }))}
          />
          <FilterSelect
            label="Unidad"
            value={filters.unit}
            options={filterOptions.unit}
            onChange={(unit) => setFilters((current) => ({ ...current, unit }))}
          />
          <FilterSelect
            label="Sección"
            value={filters.productionSection}
            options={filterOptions.productionSection}
            onChange={(productionSection) => setFilters((current) => ({ ...current, productionSection }))}
          />
        </div>

        <div className="catalog-toggles-row">
          <div className="catalog-toggles">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={filters.active}
                onChange={(event) => setFilters((current) => ({ ...current, active: event.target.checked }))}
              />
              <span>Solo activos</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={filters.hideBlocked}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, hideBlocked: event.target.checked }))
                }
              />
              <span>Ocultar bloqueados</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={filters.includeOmitted}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, includeOmitted: event.target.checked }))
                }
              />
              <span>Mostrar familias omitidas</span>
            </label>
          </div>

          <div className="catalog-actions">
            <span className="catalog-count">
              {articles.length >= catalogLimit ? `Mostrando ${catalogLimit}+ artículos` : `${articles.length} artículos`}
            </span>
            {activeFilterCount > 0 && (
              <button
                className="button button-muted button-sm"
                type="button"
                onClick={() => setFilters(defaultCatalogFilters)}
              >
                <RotateCcw aria-hidden="true" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="catalog-table-wrap">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Artículo</th>
              <th>Familia</th>
              <th>Formato</th>
              <th>Stock total</th>
              <th>Series</th>
              <th>Sección</th>
              <th>Estado</th>
              <th>Añadir a OF</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && articles.length === 0 ? (
              <SkeletonRows />
            ) : articles.length === 0 ? (
              <tr>
                <td className="empty-row" colSpan={9}>
                  No se encontraron artículos con los filtros aplicados.
                </td>
              </tr>
            ) : (
              articles.map((article) => (
                <ArticleRow
                  key={article.idArticle}
                  article={article}
                  ofs={ofs}
                  onAddLineToOf={onAddLineToOf}
                  onOpenStock={setStockArticle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {stockArticle && <StockDetailModal article={stockArticle} onClose={() => setStockArticle(null)} />}
    </section>
  );
}

function ArticleRow({
  article,
  ofs,
  onAddLineToOf,
  onOpenStock
}: {
  article: Article;
  ofs: OfBlock[];
  onAddLineToOf: (of: string, article: Article, quantity: number) => boolean;
  onOpenStock: (article: Article) => void;
}) {
  const [quantity, setQuantity] = useState('');
  const writtenOfs = useMemo(
    () =>
      ofs.flatMap((ofBlock) => {
        const of = ofBlock.of.trim();
        return of ? [of] : [];
      }),
    [ofs]
  );
  const [selectedOf, setSelectedOf] = useState('');
  const [newOf, setNewOf] = useState('');
  const isNewOf = selectedOf === '__new__';
  const ofTarget = isNewOf ? newOf : selectedOf;

  function commitCatalogLine() {
    const added = onAddLineToOf(ofTarget, article, Number(quantity));
    if (added) {
      setQuantity('');
      if (isNewOf) {
        setSelectedOf('');
        setNewOf('');
      }
    }
  }

  const isBlocked = article.blockedPurchase || article.blockedManufacturing;
  const showProductLine =
    article.productLine && !article.productLine.toLowerCase().startsWith('creado en traspaso');

  return (
    <tr>
      <td className="catalog-reference">
        <strong>{article.code}</strong>
        {article.normaUne && <span>{formatDisplayText(article.normaUne)}</span>}
      </td>
      <td className="catalog-article">
        <span>{formatDisplayText(article.description) || '-'}</span>
        {showProductLine && <em>{formatDisplayText(article.productLine)}</em>}
      </td>
      <td className="catalog-classification">
        {article.family && <span className="catalog-chip strong">{formatDisplayText(article.family)}</span>}
        {article.subfamily && <span className="catalog-chip">{formatDisplayText(article.subfamily)}</span>}
        {!article.family && !article.subfamily && <span className="catalog-muted">-</span>}
      </td>
      <td className="catalog-format" title={formatDisplayText(article.unitDescription)}>
        <strong>{formatUnitLabel(article)}</strong>
        {article.detectedWidth && (
          <span
            className={article.widthWarning ? 'width-warning' : ''}
            title={article.widthWarning || undefined}
          >
            Ancho {formatNumber(article.detectedWidth)} cm
            {article.widthWarning && <AlertTriangle aria-label={article.widthWarning} />}
          </span>
        )}
      </td>
      <StockCell article={article} onOpenStock={onOpenStock} />
      <SeriesCell article={article} onOpenStock={onOpenStock} />
      <td className="catalog-section">{formatDisplayText(article.productionSection) || '-'}</td>
      <td>
        <span
          className={`status-chip ${!article.isActive ? 'inactive' : isBlocked ? 'blocked' : 'active'}`}
        >
          {!article.isActive ? 'Inactivo' : isBlocked ? 'Bloqueado' : 'Activo'}
        </span>
      </td>
      <td className="catalog-add-cell">
        <div className="row-add">
          <label className="row-add-field">
            <span>OF</span>
            <select
              value={selectedOf}
              onChange={(event) => {
                setSelectedOf(event.target.value);
                if (event.target.value !== '__new__') setNewOf('');
              }}
              aria-label="OF destino"
            >
              <option value="">Seleccionar OF</option>
              {writtenOfs.map((of) => (
                <option key={of} value={of}>
                  OF {of}
                </option>
              ))}
              <option value="__new__">Nueva OF...</option>
            </select>
          </label>
          {isNewOf && (
            <label className="row-add-field new-of">
              <span>Nueva OF</span>
              <input
                value={newOf}
                onChange={(event) => setNewOf(event.target.value.trim())}
                placeholder="Escribir OF"
                aria-label="Nueva OF"
              />
            </label>
          )}
          <label className="row-add-field quantity">
            <span>Cant.</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitCatalogLine();
                }
              }}
              type="number"
              min="0.000001"
              step="0.01"
              aria-label="Cantidad"
              placeholder="0"
            />
          </label>
          <button className="row-add-button" type="button" onClick={commitCatalogLine}>
            <PackagePlus aria-hidden="true" />
            Añadir
          </button>
        </div>
      </td>
    </tr>
  );
}

function StockCell({
  article,
  onOpenStock
}: {
  article: Article;
  onOpenStock: (article: Article) => void;
}) {
  const stock = article.stockTotal;
  const isZero = stock === 0;
  const isNegative = typeof stock === 'number' && stock < 0;

  return (
    <td className="catalog-stock-cell">
      <button
        className="stock-badge-button"
        type="button"
        onClick={() => onOpenStock(article)}
        title="Ver desglose de existencias por almacén"
      >
        <span className={`stock-badge ${isNegative ? 'negative' : isZero ? 'zero' : 'positive'}`}>
          <MapPin aria-hidden="true" />
          {typeof stock === 'number' ? formatNumber(stock) : '-'}
        </span>
      </button>
    </td>
  );
}

function SeriesCell({
  article,
  onOpenStock
}: {
  article: Article;
  onOpenStock: (article: Article) => void;
}) {
  const series = article.stockSeries || [];

  if (series.length === 0) {
    return <td className="catalog-series-cell muted">-</td>;
  }

  return (
    <td className="catalog-series-cell">
      <button
        className="series-badge-button"
        type="button"
        onClick={() => onOpenStock(article)}
        title="Ver paños y series disponibles"
      >
        <span className="series-badge">
          {series.length} {series.length === 1 ? 'paño' : 'paños'}
        </span>
      </button>
    </td>
  );
}

const skeletonWidths = [
  ['72%', '88%', '64%', '52%', '40%', '60%', '70%', '58%', '90%'],
  ['58%', '74%', '80%', '44%', '36%', '52%', '62%', '58%', '84%'],
  ['66%', '92%', '52%', '58%', '44%', '66%', '54%', '58%', '78%'],
  ['80%', '68%', '72%', '48%', '38%', '58%', '66%', '58%', '88%'],
  ['62%', '82%', '58%', '54%', '42%', '48%', '58%', '58%', '82%'],
  ['70%', '76%', '68%', '50%', '36%', '62%', '64%', '58%', '86%']
];

function SkeletonRows() {
  return (
    <>
      {skeletonWidths.map((row, rowIndex) => (
        <tr className="skeleton-row" key={rowIndex}>
          {row.map((width, cellIndex) => (
            <td key={cellIndex} aria-label="Cargando">
              <span className="skeleton-bar" style={{ width }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
