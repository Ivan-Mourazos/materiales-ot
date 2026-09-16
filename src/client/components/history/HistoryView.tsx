import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import type { HistoryEntry } from '../../types';
import { HistoryCard } from './HistoryCard';

export function HistoryView({
  version,
  onReuse
}: {
  version: number;
  onReuse: (entry: HistoryEntry) => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    fetch('/api/history?limit=100')
      .then((response) => {
        if (!response.ok) throw new Error('history failed');
        return response.json();
      })
      .then((data) => {
        if (alive) setEntries(data.entries || []);
      })
      .catch(() => {
        if (alive) setEntries([]);
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <section className="history-view view">
      {isLoading ? (
        <div className="history-empty">
          <Loader2 className="spin" aria-hidden="true" />
          Cargando historial de asignaciones...
        </div>
      ) : entries.length === 0 ? (
        <div className="history-empty">
          <History aria-hidden="true" />
          <p>Aún no hay asignaciones generadas desde la web.</p>
          <span>Cuando generes una asignación aparecerá aquí, con sus OFs y materiales.</span>
        </div>
      ) : (
        entries.map((entry) => <HistoryCard key={entry.id} entry={entry} onReuse={onReuse} />)
      )}
    </section>
  );
}
