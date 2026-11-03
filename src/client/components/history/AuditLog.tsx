import { useEffect, useState } from 'react';
import { ScrollText, Loader2 } from 'lucide-react';
import { historyDateFormat } from '../../utils';
import { personaDe, tintaSobre } from '../../personas';

type AuditEntry = { at: string; user: string; action: string; kind: string; id: string; name: string };

const actionText: Record<string, string> = { create: 'creó', update: 'cambió', delete: 'borró', generate: 'generó' };
const kindText: Record<string, string> = { draft: 'el borrador', model: 'el modelo', reservation: 'la reserva de' };

/**
 * Registro de cambios (src/audit.js): quién creó, cambió o borró cada borrador y modelo, y quién
 * generó cada reserva. Plegado por defecto; se carga al abrirlo.
 */
export function AuditLog({ version }: { version: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setError('');
    fetch('/api/audit?limit=300', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('audit failed');
        return response.json();
      })
      .then((data) => setEntries(Array.isArray(data.entries) ? data.entries : []))
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError('No se pudo cargar el registro de cambios.');
      });
    return () => controller.abort();
  }, [isOpen, version]);

  return (
    <details className="audit-log" onToggle={(event) => setIsOpen(event.currentTarget.open)}>
      <summary>
        <ScrollText aria-hidden="true" />
        Registro de cambios
        <span>quién crea, cambia o borra borradores y modelos, y quién genera cada reserva</span>
      </summary>
      {error ? (
        <p className="audit-log-empty">{error}</p>
      ) : entries === null ? (
        <p className="audit-log-empty">
          <Loader2 className="spin" aria-hidden="true" /> Cargando…
        </p>
      ) : entries.length === 0 ? (
        <p className="audit-log-empty">Todavía no hay cambios apuntados. Se apuntan desde la versión 0.5.0.</p>
      ) : (
        <ul>
          {entries.map((entry, index) => {
            const { iniciales, color } = personaDe(entry.user);
            return (
              <li key={`${entry.at}-${index}`} className={entry.action === 'delete' ? 'is-delete' : undefined}>
                <span
                  className="usuario-avatar"
                  aria-hidden="true"
                  style={color ? { background: color, color: tintaSobre(color) } : undefined}
                >
                  {iniciales}
                </span>
                <span className="audit-log-text">
                  <strong>{entry.user}</strong> {actionText[entry.action] || entry.action}{' '}
                  {kindText[entry.kind] || entry.kind} <em>{entry.name || '(sin nombre)'}</em>
                </span>
                <time dateTime={entry.at}>{historyDateFormat.format(new Date(entry.at))}</time>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
