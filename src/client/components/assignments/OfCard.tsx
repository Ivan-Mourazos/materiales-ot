import { useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, GripVertical, PackagePlus, Trash2 } from 'lucide-react';
import { draggingItem, dropPositionFor, endDrag, startDrag } from '../../dragState';
import type { DropPosition } from '../../reorder';
import type { Article, OfBlock } from '../../types';
import { formatDisplayText } from '../../utils';
import { parseQuantityInput, type Quantity, type QuantityInput } from '../../quantities';
import { ArticlePicker, type ArticlePickerHandle } from '../common/ArticlePicker';
import { MaterialTable } from './MaterialTable';
import { OfSuggestions } from './OfSuggestions';

export function OfCard({
  index,
  ofBlock,
  isDuplicate,
  onChangeOf,
  onChangeDescription,
  onRemoveOf,
  onAddLine,
  onRemoveLine,
  onUpdateLineQuantity,
  onMoveOf,
  onMoveOfBy,
  onMoveLine,
  onMoveLineBy,
  isCollapsed = false,
  onToggleCollapsed
}: {
  index: number;
  ofBlock: OfBlock;
  isDuplicate: boolean;
  onChangeOf: (id: string, of: string) => void;
  onChangeDescription: (id: string, description: string) => void;
  onRemoveOf: (id: string) => void;
  onAddLine: (ofId: string, article: Article, quantity: QuantityInput) => boolean;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateLineQuantity: (ofId: string, lineId: string, quantity: Quantity) => void;
  onMoveOf: (ofId: string, targetOfId: string, position: DropPosition) => void;
  onMoveOfBy: (ofId: string, delta: -1 | 1) => void;
  onMoveLine: (lineId: string, targetOfId: string, targetLineId: string | null, position: DropPosition) => void;
  onMoveLineBy: (lineId: string, delta: -1 | 1) => void;
  /** Plegada: solo la cabecera (Iván, 03/11/2026: para ordenar sin tanto desplazamiento). */
  isCollapsed?: boolean;
  onToggleCollapsed: (ofId: string) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  // Marca de dónde caería lo que se arrastra: otra OF delante/detrás, o un material al final de esta
  const [dropMark, setDropMark] = useState<DropPosition | 'inside' | null>(null);
  const [quantity, setQuantity] = useState('');
  const quantityRef = useRef<HTMLInputElement>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const pickerRef = useRef<ArticlePickerHandle>(null);

  function commitLine() {
    const article =
      selectedArticle ||
      pickerRef.current?.typedArticle() || {
        idArticle: '',
        code: '',
        description: ''
      };
    // "-" o "1e" a medias: el campo dice "vacío" pero no es "sin cantidad"
    const qty = quantityRef.current?.validity.badInput ? 'invalid' : parseQuantityInput(quantity);
    const added = onAddLine(ofBlock.id, article, qty);
    if (!added) return;
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
  }

  return (
    <article
      ref={cardRef}
      className={`of-card ${isDuplicate ? 'duplicate' : ''}${isCollapsed ? ' collapsed' : ''}${dropMark ? ` drop-${dropMark}` : ''}`}
      onDragOver={(event) => {
        const item = draggingItem();
        if (!item) return;
        if (item.type === 'of' && item.ofId === ofBlock.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const mark = item.type === 'of' ? dropPositionFor(event, event.currentTarget) : 'inside';
        setDropMark((current) => (current === mark ? current : mark));
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropMark(null);
      }}
      onDrop={(event) => {
        const item = draggingItem();
        setDropMark(null);
        if (!item) return;
        event.preventDefault();
        if (item.type === 'of') onMoveOf(item.ofId, ofBlock.id, dropPositionFor(event, event.currentTarget));
        else onMoveLine(item.lineId, ofBlock.id, null, 'after');
        endDrag();
      }}
    >
      <div className="of-header">
        <button
          ref={handleRef}
          className="drag-handle of-drag-handle"
          type="button"
          draggable
          onDragStart={(event) => startDrag(event, { type: 'of', ofId: ofBlock.id }, cardRef.current)}
          onDragEnd={() => {
            endDrag();
            setDropMark(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            onMoveOfBy(ofBlock.id, event.key === 'ArrowUp' ? -1 : 1);
            requestAnimationFrame(() => handleRef.current?.focus());
          }}
          aria-label={`Mover la OF ${ofBlock.of || index + 1}. Arrastra o usa las flechas arriba y abajo`}
          title="Arrastra para cambiar el orden de las OFs. Con el teclado: flechas arriba y abajo"
        >
          <GripVertical aria-hidden="true" />
        </button>
        <label className="field of-number">
          <span>OF {index + 1}</span>
          <input
            value={ofBlock.of}
            onChange={(event) => onChangeOf(ofBlock.id, event.target.value.trim())}
            inputMode="numeric"
            placeholder="N.º de OF"
          />
        </label>
        <label className="field of-description">
          <span>Descripción / Parte</span>
          <input
            value={ofBlock.description}
            onChange={(event) => onChangeDescription(ofBlock.id, event.target.value)}
            placeholder="Ej.: Estructura 01, Faldón, etc."
            maxLength={120}
            autoComplete="off"
          />
        </label>
        <button
          className="of-collapse-toggle"
          type="button"
          onClick={() => onToggleCollapsed(ofBlock.id)}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Desplegar esta OF' : 'Plegar esta OF (para ordenar sin tanto desplazamiento)'}
        >
          <span>
            {ofBlock.materials.length} {ofBlock.materials.length === 1 ? 'material' : 'materiales'}
          </span>
          <ChevronDown aria-hidden="true" />
        </button>
        <button
          className="icon-button danger"
          type="button"
          onClick={() => onRemoveOf(ofBlock.id)}
          title="Eliminar esta OF"
          aria-label={`Eliminar OF ${ofBlock.of || index + 1}`}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      {isDuplicate && (
        <div className="duplicate-hint">
          <AlertTriangle aria-hidden="true" />
          Número de OF repetido en otra tarjeta de esta asignación
        </div>
      )}

      {!isCollapsed && (
      <>
      <div className="line-editor">
        <ArticlePicker ref={pickerRef} onSelect={setSelectedArticle} />
        <label className="field quantity-field">
          <span>Cantidad</span>
          <input
            ref={quantityRef}
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitLine();
              }
            }}
            placeholder="Opcional"
            type="number"
            min="0"
            step="0.01"
          />
        </label>
        <button className="button button-secondary" type="button" onClick={commitLine}>
          <PackagePlus aria-hidden="true" />
          Añadir
        </button>
      </div>

      <div className={`selected-article ${selectedArticle?.widthWarning ? 'warning' : ''}`}>
        {selectedArticle ? (
          <>
            <strong>{selectedArticle.code}</strong> · {formatDisplayText(selectedArticle.description) || ''}
            {selectedArticle.detectedWidth && ` · ancho ${selectedArticle.detectedWidth} cm`}
          </>
        ) : (
          'Busca un artículo en RPS o teclea un código exacto.'
        )}
        {selectedArticle?.widthWarning && (
          <span>
            <AlertTriangle aria-hidden="true" />
            {selectedArticle.widthWarning}
          </span>
        )}
      </div>

      <MaterialTable
        ofBlock={ofBlock}
        onRemoveLine={onRemoveLine}
        onUpdateQuantity={(lineId, value) => onUpdateLineQuantity(ofBlock.id, lineId, value)}
        onMoveLine={onMoveLine}
        onMoveLineBy={onMoveLineBy}
      />
      <OfSuggestions ofBlock={ofBlock} onAddLine={onAddLine} />
      </>
      )}
    </article>
  );
}
