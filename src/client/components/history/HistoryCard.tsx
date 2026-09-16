import { useState } from 'react';
import { ChevronDown, Copy, FileSpreadsheet } from 'lucide-react';
import type { HistoryEntry } from '../../types';
import { formatDisplayText, formatNumber, historyDateFormat } from '../../utils';

export function HistoryCard({
  entry,
  onReuse
}: {
  entry: HistoryEntry;
  onReuse: (entry: HistoryEntry) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const overwrittenCount =
    entry.files.filter((file) => file.overwritten).length +
    (entry.orderArchive?.overwritten ? 1 : 0);

  const descriptions = Array.from(
    new Set(
      entry.ofs.flatMap((ofBlock) => {
        const description = (ofBlock.description || '').trim();
        return description ? [description] : [];
      })
    )
  ).join(' · ');

  return (
    <article className={`history-card ${isOpen ? 'open' : ''}`}>
      <div className="history-row">
        <button
          className="history-head"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
        >
          <ChevronDown className="history-chevron" aria-hidden="true" />
          <div className="history-title">
            <strong>
              {entry.orderCode
                ? `Pedido ${entry.orderCode}`
                : `OF ${entry.ofs.map((item) => item.of).join(', ')}`}
            </strong>
            {descriptions && <em>{descriptions}</em>}
            <span>{historyDateFormat.format(new Date(entry.createdAt))}</span>
          </div>
          <div className="history-meta">
            <span className="history-chip">
              {entry.totals.ofs} {entry.totals.ofs === 1 ? 'OF' : 'OFs'}
            </span>
            <span className="history-chip">
              {entry.totals.lines} {entry.totals.lines === 1 ? 'línea' : 'líneas'}
            </span>
            <span className="history-chip">{formatNumber(entry.totals.units)} uds.</span>
            {overwrittenCount > 0 && (
              <span className="history-chip warn">{overwrittenCount} sobrescritos</span>
            )}
          </div>
        </button>
        <button
          className="history-reuse"
          type="button"
          onClick={() => onReuse(entry)}
          title="Añadir estos materiales a una nueva asignación"
        >
          <Copy aria-hidden="true" />
          Reutilizar
        </button>
      </div>

      {isOpen && (
        <div className="history-detail">
          {entry.ofs.map((ofBlock) => (
            <div className="history-of" key={ofBlock.of}>
              <div className="history-of-head">
                <strong>OF {ofBlock.of}</strong>
                {ofBlock.description && <em>{ofBlock.description}</em>}
                <span>{fileLabelFor(entry, ofBlock.of)}</span>
              </div>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ofBlock.materials.map((line, index) => (
                    <tr key={`${line.code}-${index}`}>
                      <td>
                        <strong>{line.code}</strong>
                      </td>
                      <td>{formatDisplayText(line.description) || '-'}</td>
                      <td>{formatNumber(line.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {entry.orderArchive && (
            <div className="history-archive">
              <FileSpreadsheet aria-hidden="true" />
              Archivo de pedido: <strong>{entry.orderArchive.filename}</strong>
              {entry.orderArchive.overwritten && <span className="history-chip warn">sobrescrito</span>}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function fileLabelFor(entry: HistoryEntry, of: string) {
  const file = entry.files.find((item) => item.of === of);
  if (!file) return '';
  return file.overwritten ? `${file.filename} (sobrescrito)` : file.filename;
}
