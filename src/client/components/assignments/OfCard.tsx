import { useRef, useState } from 'react';
import { AlertTriangle, PackagePlus, Trash2 } from 'lucide-react';
import type { Article, OfBlock } from '../../types';
import { formatDisplayText } from '../../utils';
import { ArticlePicker, type ArticlePickerHandle } from '../common/ArticlePicker';
import { MaterialTable } from './MaterialTable';

export function OfCard({
  index,
  ofBlock,
  isDuplicate,
  onChangeOf,
  onChangeDescription,
  onRemoveOf,
  onAddLine,
  onRemoveLine,
  onUpdateLineQuantity
}: {
  index: number;
  ofBlock: OfBlock;
  isDuplicate: boolean;
  onChangeOf: (id: string, of: string) => void;
  onChangeDescription: (id: string, description: string) => void;
  onRemoveOf: (id: string) => void;
  onAddLine: (ofId: string, article: Article, quantity: number) => boolean;
  onRemoveLine: (ofId: string, lineId: string) => void;
  onUpdateLineQuantity: (ofId: string, lineId: string, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState('');
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
    const added = onAddLine(ofBlock.id, article, Number(quantity));
    if (!added) return;
    setSelectedArticle(null);
    setQuantity('');
    pickerRef.current?.clear();
  }

  return (
    <article className={`of-card ${isDuplicate ? 'duplicate' : ''}`}>
      <div className="of-header">
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

      <div className="line-editor">
        <ArticlePicker ref={pickerRef} onSelect={setSelectedArticle} />
        <label className="field quantity-field">
          <span>Cantidad</span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitLine();
              }
            }}
            placeholder="0"
            type="number"
            min="0.000001"
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
      />
    </article>
  );
}
