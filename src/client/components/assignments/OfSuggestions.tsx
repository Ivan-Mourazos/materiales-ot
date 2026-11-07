import { useEffect, useState } from 'react';
import type { Article, OfBlock } from '../../types';
import type { QuantityInput } from '../../quantities';
import { loadOfSuggestions, type OfSuggestions as Suggestions } from '../../ofSuggestions';
import { formatDisplayText, formatNumber } from '../../utils';
import './ofSuggestions.css';

export function OfSuggestions({ ofBlock, onAddLine }: {
  ofBlock: OfBlock;
  onAddLine: (ofId: string, article: Article, quantity: QuantityInput) => boolean;
}) {
  const [loaded, setLoaded] = useState<{ of: string; data?: Suggestions | null; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const of = ofBlock.of;
  useEffect(() => {
    if (!/^\d{1,7}$/.test(of)) return;
    let active = true;
    const timer = setTimeout(() => {
      loadOfSuggestions(of).then((data) => { if (active) setLoaded({ of, data }); },
        (error: Error) => { if (active) setLoaded({ of, error: error.message }); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [of, retry]);
  if (loaded?.of !== of) return null;
  if (loaded.error) return <p className="field-hint">{loaded.error} <button type="button" className="button button-ghost-sm" onClick={() => setRetry((value) => value + 1)}>Reintentar</button></p>;
  const data = loaded.data;
  if (!data?.article) return null;
  const existing = new Set(ofBlock.materials.map((line) => line.code.trim().toUpperCase()));
  const suggestions = data.suggestions.filter((line) => !existing.has(line.code.toUpperCase()));
  if (!suggestions.length) return null;
  const add = (line: Suggestions['suggestions'][number]) => onAddLine(ofBlock.id, { idArticle: '', code: line.code, description: line.description }, line.quantity);
  return <details className="of-suggestions" key={of}>
    <summary>Suele llevar ({suggestions.length})</summary>
    <div className="suggestions-content">
      <p className="field-hint">Historial de {data.article}: {data.sampleSize} OFs de los últimos dos años. Materiales presentes en al menos la mitad. Cantidad: mediana por unidad de las OFs que lo gastaron × {formatNumber(data.units)} unidades de esta OF. Sin restos.</p>
      <button type="button" className="button button-secondary" onClick={() => suggestions.forEach(add)}>Añadir todos</button>
      <ul>{suggestions.map((line) => <li key={line.code}>
        <div><strong>{line.code}</strong> · {formatDisplayText(line.description)} <span className="field-hint">en {line.occurrences} de {line.sampleSize} OFs</span></div>
        <span>{formatNumber(line.quantity)}</span>
        <button type="button" className="button button-ghost-sm" onClick={() => add(line)} aria-label={`Añadir ${line.code}`}>Añadir</button>
      </li>)}</ul>
    </div>
  </details>;
}
