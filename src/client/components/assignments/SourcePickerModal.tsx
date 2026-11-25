import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileClock, Layers, Loader2, RotateCw, Search, X } from 'lucide-react';
import type { AssignmentModel, OrderDraft } from '../../types';
import { ModelDialog } from '../common/ModelDialog';

type Picked = { kind: 'model'; record: AssignmentModel } | { kind: 'draft'; record: OrderDraft };

type Item = { id: string; title: string; detail: string; meta: string; search: string; picked: Picked };

const dateFormat = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function formatWhen(value?: string) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? dateFormat.format(time) : '';
}

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function toItems(kind: 'model' | 'draft', data: { models?: AssignmentModel[]; drafts?: OrderDraft[] }, excludeId?: string | null): Item[] {
  if (kind === 'model') {
    return (data.models || []).map((model) => ({
      id: model.id,
      title: model.name,
      detail: [model.category || 'Sin categoría', model.description].filter(Boolean).join(' · '),
      meta: count(model.parts.length, 'parte', 'partes'),
      search: [model.name, model.category, model.description].join(' ').toLowerCase(),
      picked: { kind: 'model', record: model }
    }));
  }
  return (data.drafts || [])
    .filter((draft) => draft.id !== excludeId)
    .map((draft) => ({
      id: draft.id,
      title: draft.name,
      detail: [draft.orderCode && `Pedido ${draft.orderCode}`, formatWhen(draft.updatedAt), draft.updatedBy].filter(Boolean).join(' · '),
      meta: count(draft.ofs.length, 'OF', 'OFs'),
      search: [draft.name, draft.orderCode, ...draft.ofs.map((block) => block.description)].join(' ').toLowerCase(),
      picked: { kind: 'draft', record: draft }
    }));
}

/**
 * Elegir, sin salir de Asignación, el modelo o el borrador del que traer OFs (Iván, 25/11/2026:
 * un compañero buscaba desde el borrador cómo traer un modelo y el botón le mandaba a otra pestaña).
 * Solo lee: el modelo o borrador de origen no se toca.
 */
export function SourcePickerModal({
  kind,
  excludeId,
  onPick,
  onClose
}: {
  kind: 'model' | 'draft';
  /** El borrador abierto: lo que hay en pantalla puede no estar guardado y se mezclaría. */
  excludeId?: string | null;
  onPick: (picked: Picked) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const isModel = kind === 'model';
  const titleId = `source-picker-${kind}`;

  const load = useCallback(async () => {
    setItems(null);
    setLoadError(false);
    try {
      const response = await fetch(isModel ? '/api/models' : '/api/drafts');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setItems(toItems(kind, await response.json(), excludeId));
    } catch (error) {
      console.error(error);
      setLoadError(true);
    }
  }, [kind, isModel, excludeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (items || []).filter((item) => words.every((word) => item.search.includes(word)));
  }, [items, query]);

  const Icon = isModel ? Layers : FileClock;

  return (
    <ModelDialog className="source-picker-modal" labelledBy={titleId} onClose={onClose}>
      <div className="modal-header">
        <div className="modal-icon">
          <Icon aria-hidden="true" />
        </div>
        <div>
          <h2 id={titleId}>{isModel ? 'Usar un modelo' : 'Traer de un borrador'}</h2>
          <p className="modal-subtitle">
            {isModel
              ? 'Elige el modelo. Después marcas qué partes llevar a la asignación.'
              : 'Elige el borrador. Después marcas qué OFs y artículos llevar. Llegan sin número de OF y el borrador de origen no cambia.'}
          </p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="drafts-search-box source-picker-search">
        <Search size={18} color="var(--ink-3)" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={isModel ? 'Buscar por nombre o categoría...' : 'Buscar por nombre, pedido u OF...'}
          aria-label={isModel ? 'Buscar modelos' : 'Buscar borradores'}
          autoFocus
        />
      </div>

      {loadError ? (
        <div className="modal-error-banner source-picker-error" role="alert">
          <span>No se pudo cargar la lista de {isModel ? 'modelos' : 'borradores'}.</span>
          <button className="button button-ghost-sm" type="button" onClick={() => void load()}>
            <RotateCw aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : items === null ? (
        <p className="source-picker-empty" role="status">
          <Loader2 className="spin" aria-hidden="true" /> Cargando...
        </p>
      ) : visible.length === 0 ? (
        <p className="source-picker-empty" role="status">
          {query.trim()
            ? 'Nada coincide con la búsqueda.'
            : isModel
              ? 'Todavía no hay modelos guardados.'
              : 'No hay otros borradores guardados.'}
        </p>
      ) : (
        <ul className="source-picker-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" className="source-picker-row" onClick={() => onPick(item.picked)}>
                <span className="source-picker-text">
                  <strong>{item.title || 'Sin nombre'}</strong>
                  {item.detail && <span>{item.detail}</span>}
                </span>
                <span className="source-picker-meta">{item.meta}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModelDialog>
  );
}

export type { Picked as PickedSource };
