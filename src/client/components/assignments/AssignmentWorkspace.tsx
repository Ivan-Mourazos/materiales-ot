import { FileClock, Save, X } from 'lucide-react';
import type { Article, OfBlock } from '../../types';
import { OfCard } from './OfCard';
import { SummaryPanel } from './SummaryPanel';

export function AssignmentWorkspace({
  orderCode,
  setOrderCode,
  ofs,
  totals,
  duplicateOfs,
  isSavingToNetwork,
  activeDraft,
  onSave,
  onOpenSaveDraft,
  onQuickSaveDraft,
  onClearActiveDraft,
  onAddOf,
  onOpenLoadModel,
  onOpenSaveAsModel,
  onClearAll,
  onUpdateOf,
  onUpdateOfDescription,
  onRemoveOf,
  onAddLine,
  onRemoveLine,
  onUpdateLineQuantity
}: {
  orderCode: string;
  setOrderCode: (value: string) => void;
  ofs: OfBlock[];
  totals: { ofs: number; lines: number; units: number };
  duplicateOfs: Set<string>;
  isSavingToNetwork: boolean;
  activeDraft?: { id: string; name: string } | null;
  onSave: () => void;
  onOpenSaveDraft: () => void;
  onQuickSaveDraft?: () => void;
  onClearActiveDraft?: () => void;
  onAddOf: () => void;
  onOpenLoadModel: () => void;
  onOpenSaveAsModel: () => void;
  onClearAll: () => void;
  onUpdateOf: (id: string, of: string) => void;
  onUpdateOfDescription: (id: string, description: string) => void;
  onRemoveOf: (id: string) => void;
  onAddLine: (ofId: string, article: Article, quantity: number) => boolean;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateLineQuantity: (ofId: string, lineId: string, quantity: number) => void;
}) {
  return (
    <section className="workspace view" key="assignments">
      <SummaryPanel
        orderCode={orderCode}
        setOrderCode={setOrderCode}
        totals={totals}
        isSavingToNetwork={isSavingToNetwork}
        activeDraft={activeDraft}
        onSave={onSave}
        onOpenSaveDraft={onOpenSaveDraft}
        onAddOf={onAddOf}
        onOpenLoadModel={onOpenLoadModel}
        onOpenSaveAsModel={onOpenSaveAsModel}
        onClearAll={onClearAll}
      />

      <section className="of-list">
        {activeDraft && (
          <div className="active-draft-banner">
            <div className="active-draft-info">
              <FileClock aria-hidden="true" />
              <span>
                Editando borrador: <strong>{activeDraft.name}</strong>
              </span>
            </div>
            <div className="active-draft-actions">
              {onQuickSaveDraft && (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={onQuickSaveDraft}
                  title="Guardar los cambios actuales en este borrador"
                >
                  <Save size={14} aria-hidden="true" />
                  Guardar cambios
                </button>
              )}
              <button
                className="button button-muted"
                type="button"
                onClick={onOpenSaveDraft}
                title="Opciones de guardado / Cambiar nombre"
              >
                Opciones
              </button>
              {onClearActiveDraft && (
                <button
                  className="icon-button"
                  type="button"
                  onClick={onClearActiveDraft}
                  title="Desvincular borrador (mantener materiales en asignación actual)"
                  aria-label="Desvincular borrador"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}
        {ofs.map((ofBlock, index) => (
          <OfCard
            key={ofBlock.id}
            index={index}
            ofBlock={ofBlock}
            isDuplicate={Boolean(ofBlock.of.trim()) && duplicateOfs.has(ofBlock.of.trim())}
            onChangeOf={onUpdateOf}
            onChangeDescription={onUpdateOfDescription}
            onRemoveOf={onRemoveOf}
            onAddLine={onAddLine}
            onRemoveLine={onRemoveLine}
            onUpdateLineQuantity={onUpdateLineQuantity}
          />
        ))}
      </section>
    </section>
  );
}
