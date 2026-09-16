import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileClock,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X
} from 'lucide-react';
import type { OrderDraft } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DraftCard } from './DraftCard';
import { SaveDraftModal } from './SaveDraftModal';

export function DraftsView({
  activeDraftId,
  currentOrderCode,
  hasActiveContent,
  onResumeDraft,
  onSaveCurrentAsDraft,
  onConvertToModel,
  pushToast,
  refreshTrigger
}: {
  activeDraftId: string | null;
  currentOrderCode: string;
  hasActiveContent: boolean;
  onResumeDraft: (draft: OrderDraft) => void;
  onSaveCurrentAsDraft: () => void;
  onConvertToModel: (draft: OrderDraft) => void;
  pushToast: (text: string, type?: 'ok' | 'error' | 'warn' | 'info') => void;
  refreshTrigger?: number;
}) {
  const [drafts, setDrafts] = useState<OrderDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [draftToDelete, setDraftToDelete] = useState<{ id: string; name: string } | null>(null);
  const [draftToEdit, setDraftToEdit] = useState<OrderDraft | null>(null);

  const fetchDrafts = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/drafts');
      if (!response.ok) throw new Error('Error al cargar la lista de borradores.');
      const data = await response.json();
      setDrafts(data.drafts || []);
    } catch (err) {
      console.error(err);
      pushToast('No se pudieron cargar los borradores.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts, refreshTrigger]);

  const filteredDrafts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return drafts;

    return drafts.filter((d) => {
      return (
        d.name.toLowerCase().includes(q) ||
        (d.orderCode && d.orderCode.toLowerCase().includes(q)) ||
        (d.notes && d.notes.toLowerCase().includes(q)) ||
        d.ofs.some(
          (of) =>
            of.of.toLowerCase().includes(q) ||
            of.description.toLowerCase().includes(q) ||
            of.materials.some(
              (m) =>
                m.code.toLowerCase().includes(q) ||
                m.description.toLowerCase().includes(q)
            )
        )
      );
    });
  }, [drafts, searchQuery]);

  async function confirmDeleteDraft({ id, name }: { id: string; name: string }) {
    setDraftToDelete(null);
    try {
      const response = await fetch(`/api/drafts/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar el borrador.');
      pushToast(`Borrador "${name}" eliminado.`, 'info');
      fetchDrafts();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error al eliminar.', 'error');
    }
  }

  async function handleDuplicateDraft(draft: OrderDraft) {
    try {
      const duplicateData = {
        name: `${draft.name} (Copia)`,
        orderCode: draft.orderCode,
        notes: draft.notes,
        ofs: draft.ofs.map((b) => ({
          ...b,
          id: undefined,
          materials: b.materials.map((m) => ({ ...m, id: undefined }))
        }))
      };

      const response = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateData)
      });

      if (!response.ok) throw new Error('No se pudo duplicar el borrador.');
      pushToast(`Borrador duplicado como "${duplicateData.name}".`, 'ok');
      fetchDrafts();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Error al duplicar.', 'error');
    }
  }

  async function handleSaveEditedDraft(updatedData: {
    id?: string;
    name: string;
    orderCode: string;
    notes?: string;
    ofs: any[];
  }) {
    if (!draftToEdit?.id) return;
    const response = await fetch(`/api/drafts/${draftToEdit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draftToEdit,
        name: updatedData.name,
        orderCode: updatedData.orderCode,
        notes: updatedData.notes
      })
    });

    if (!response.ok) throw new Error('No se pudo actualizar el borrador.');
    pushToast('Borrador actualizado.', 'ok');
    setDraftToEdit(null);
    fetchDrafts();
  }

  return (
    <section className="drafts-view view" key="drafts">
      <div className="drafts-header-bar">
        <div className="drafts-search-box">
          <Search size={18} color="var(--ink-3)" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por pedido, nombre, OF o artículo..."
            aria-label="Buscar borradores"
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setSearchQuery('')}
              title="Borrar búsqueda"
              aria-label="Borrar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="drafts-header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={fetchDrafts}
            title="Recargar lista"
            aria-label="Recargar lista"
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          </button>

          <button
            className="button button-primary"
            type="button"
            onClick={onSaveCurrentAsDraft}
            disabled={!hasActiveContent}
            title={
              hasActiveContent
                ? 'Guardar la asignación actual abierta como un nuevo borrador'
                : 'Añade materiales o un número de pedido en Asignaciones para guardar un borrador'
            }
          >
            <Plus size={16} aria-hidden="true" />
            Guardar asignación actual como borrador
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="drafts-empty">
          <Loader2 className="spin" aria-hidden="true" />
          <p>Cargando borradores...</p>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="drafts-empty">
          <FileClock aria-hidden="true" />
          {searchQuery ? (
            <>
              <h3>No hay resultados para "{searchQuery}"</h3>
              <p>Prueba con otros términos de búsqueda.</p>
              <button
                className="button button-muted"
                type="button"
                onClick={() => setSearchQuery('')}
              >
                Limpiar búsqueda
              </button>
            </>
          ) : (
            <>
              <h3>No hay borradores guardados</h3>
              <p>
                Puedes empezar a preparar cualquier pedido o modelo en la pestaña principal
                (<strong>Asignaciones</strong>) y guardarlo a medias con el botón{' '}
                <em>"Guardar borrador"</em> para continuar más tarde aquí.
              </p>
              {hasActiveContent && (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={onSaveCurrentAsDraft}
                  style={{ marginTop: '8px' }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Guardar lo que tienes abierto ahora
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="drafts-grid">
          {filteredDrafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              isActiveDraft={draft.id === activeDraftId}
              onResumeDraft={onResumeDraft}
              onConvertToModel={onConvertToModel}
              onEditDraft={(d) => setDraftToEdit(d)}
              onDuplicateDraft={handleDuplicateDraft}
              onDeleteDraft={(id, name) => setDraftToDelete({ id, name })}
            />
          ))}
        </div>
      )}

      {draftToDelete && (
        <ConfirmDialog
          title="¿Eliminar este borrador?"
          description={
            <>
              Se eliminará de forma definitiva el borrador <strong>"{draftToDelete.name}"</strong> y sus líneas asociadas.
            </>
          }
          items={[]}
          confirmLabel="Eliminar borrador"
          onCancel={() => setDraftToDelete(null)}
          onConfirm={() => confirmDeleteDraft(draftToDelete)}
        />
      )}

      {draftToEdit && (
        <SaveDraftModal
          initialDraft={draftToEdit}
          orderCode={draftToEdit.orderCode}
          ofs={draftToEdit.ofs}
          onClose={() => setDraftToEdit(null)}
          onSave={handleSaveEditedDraft}
        />
      )}
    </section>
  );
}
