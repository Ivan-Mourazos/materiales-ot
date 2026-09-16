import { useEffect, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import type { Article, StockDetailResponse, StockDetailRow } from '../../types';
import { formatDisplayText, formatNumber, formatStockDate, roundQuantity } from '../../utils';

export function StockDetailModal({
  article,
  onClose
}: {
  article: Article;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<StockDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedWarehouseKey, setSelectedWarehouseKey] = useState('');

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError('');
    setSelectedWarehouseKey('');

    const params = new URLSearchParams({ idArticle: article.idArticle });
    fetch(`/api/article-stock?${params.toString()}`, { signal: controller.signal })
      .then(readStockResponse)
      .then((data) => {
        setDetail(data);
        setSelectedWarehouseKey(defaultWarehouseKey(data.rows || []));
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setError(
            fetchError instanceof Error ? fetchError.message : 'No se pudo cargar el detalle de stock.'
          );
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [article.idArticle]);

  const rows = detail?.rows || [];
  const warehouses = getWarehouseStockSummary(rows);
  const selectedWarehouse =
    warehouses.find((warehouse) => warehouse.key === selectedWarehouseKey) || warehouses[0];
  const selectedRows = selectedWarehouse
    ? rows.filter((row) => warehouseKey(row) === selectedWarehouse.key)
    : [];
  const locationCount = distinctCount(
    selectedRows.map((row) => row.locationCode || row.location || 'Sin ubicación')
  );
  const seriesCount = distinctCount(selectedRows.map((row) => row.series).filter(Boolean));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal stock-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="stock-detail-head">
          <div className="modal-icon stock-detail-icon">
            <MapPin aria-hidden="true" />
          </div>
          <div>
            <h2 id="stock-detail-title">Stock de {article.code}</h2>
            <p>{formatDisplayText(article.description) || 'Artículo sin descripción'}</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <div className="stock-detail-state">
            <Loader2 className="spin" aria-hidden="true" />
            Cargando stock...
          </div>
        ) : error ? (
          <div className="stock-detail-state error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="stock-detail-state">No hay stock registrado para este artículo.</div>
        ) : (
          <>
            <div className="stock-detail-summary">
              <span>
                <strong>{formatNumber(detail?.total || 0)}</strong> total
              </span>
              <span>
                <strong>{warehouses.length}</strong> {warehouses.length === 1 ? 'sede' : 'sedes'}
              </span>
              <span>
                <strong>{formatNumber(selectedWarehouse?.quantity || 0)}</strong>{' '}
                {formatDisplayText(selectedWarehouse?.warehouse) || 'sede'}
              </span>
              <span>
                <strong>{seriesCount || '-'}</strong> {seriesCount === 1 ? 'paño' : 'paños'}
              </span>
            </div>

            <div className="stock-detail-grid">
              <div className="stock-detail-table-wrap warehouses">
                <table className="stock-detail-table warehouse-table">
                  <thead>
                    <tr>
                      <th>Almacén</th>
                      <th>Descripción</th>
                      <th>Stock</th>
                      <th>Disponible</th>
                      <th>Paños</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warehouses.map((warehouse) => (
                      <tr
                        className={warehouse.key === selectedWarehouse?.key ? 'selected' : ''}
                        key={warehouse.key}
                        onClick={() => setSelectedWarehouseKey(warehouse.key)}
                      >
                        <td>{warehouse.warehouseCode}</td>
                        <td>
                          <strong>{formatDisplayText(warehouse.warehouse)}</strong>
                        </td>
                        <td>{formatNumber(warehouse.quantity)}</td>
                        <td>{formatNumber(warehouse.quantity)}</td>
                        <td>{warehouse.seriesCount || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="stock-series-panel">
                <div className="stock-series-title">
                  <strong>{formatDisplayText(selectedWarehouse?.warehouse) || 'Sin sede'}</strong>
                  <span>
                    {formatNumber(selectedWarehouse?.quantity || 0)} disponibles ·{' '}
                    {locationCount || '-'} {locationCount === 1 ? 'ubicación' : 'ubicaciones'}
                  </span>
                </div>
                <div className="stock-detail-table-wrap series">
                  <table className="stock-detail-table series-table">
                    <thead>
                      <tr>
                        <th>Serie</th>
                        <th>Ubicación</th>
                        <th>Stock</th>
                        <th>Disponible</th>
                        <th>Última entrada</th>
                        <th>Último mov.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRows.map((row, index) => (
                        <tr
                          key={`${row.warehouseCode}-${row.locationCode || 'none'}-${row.series || 'none'}-${index}`}
                        >
                          <td>
                            <strong>{row.series || '-'}</strong>
                          </td>
                          <td>
                            <strong>
                              {formatDisplayText(row.location || row.locationCode) || 'Sin ubicación'}
                            </strong>
                            {row.locationCode && row.location && <span>{row.locationCode}</span>}
                          </td>
                          <td className={row.quantity < 0 ? 'stock-negative' : ''}>
                            {formatNumber(row.quantity)}
                          </td>
                          <td className={row.quantity < 0 ? 'stock-negative' : ''}>
                            {formatNumber(row.quantity)}
                          </td>
                          <td>{formatStockDate(row.lastEntryDate)}</td>
                          <td>{formatStockDate(row.lastMovementDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

async function readStockResponse(response: Response): Promise<StockDetailResponse> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'El detalle de stock no está activo en el servidor. Reinicia la web para cargar la API nueva.'
    );
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No se pudo cargar el detalle de stock.');
  }

  return data;
}

function getWarehouseStockSummary(rows: StockDetailRow[]) {
  const warehouses = new Map<
    string,
    {
      key: string;
      warehouseCode: string;
      warehouse: string;
      quantity: number;
      seriesCount: number;
    }
  >();
  const seriesByWarehouse = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = warehouseKey(row);
    const current = warehouses.get(key) || {
      key,
      warehouseCode: row.warehouseCode,
      warehouse: row.warehouse,
      quantity: 0,
      seriesCount: 0
    };

    current.quantity = roundQuantity(current.quantity + row.quantity);
    warehouses.set(key, current);

    if (row.series) {
      const series = seriesByWarehouse.get(key) || new Set<string>();
      series.add(row.series);
      seriesByWarehouse.set(key, series);
    }
  }

  return Array.from(warehouses.values())
    .map((warehouse) => ({
      ...warehouse,
      seriesCount: seriesByWarehouse.get(warehouse.key)?.size || 0
    }))
    .sort((a, b) => b.quantity - a.quantity || a.warehouse.localeCompare(b.warehouse, 'es'));
}

function defaultWarehouseKey(rows: StockDetailRow[]) {
  return getWarehouseStockSummary(rows)[0]?.key || '';
}

function warehouseKey(row: Pick<StockDetailRow, 'warehouseCode' | 'warehouse'>) {
  return `${row.warehouseCode}||${row.warehouse}`;
}

function distinctCount(values: Array<string | null | undefined>) {
  return new Set(values.map((value) => String(value || '').trim()).filter(Boolean)).size;
}
