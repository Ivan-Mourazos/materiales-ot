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
  onSave,
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
  onSave: () => void;
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
        onSave={onSave}
        onAddOf={onAddOf}
        onOpenLoadModel={onOpenLoadModel}
        onOpenSaveAsModel={onOpenSaveAsModel}
        onClearAll={onClearAll}
      />

      <section className="of-list">
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
