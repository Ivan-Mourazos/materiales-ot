import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { AssignmentModel, ModelPart } from '../../types';
import type { ConsumptionReport } from '../../consumptionLoad';
import { applyModelComparison, compareModel } from '../../modelComparison';
import { formatDisplayText, formatNumber, uid } from '../../utils';
import { ModelDialog } from '../common/ModelDialog';
import { SaveCancelledError } from '../common/useVersionedSave';
import './modelComparison.css';

export function ModelComparisonModal({ model, onClose, onApply }: {
  model: AssignmentModel;
  onClose: () => void;
  onApply: (parts: ModelPart[]) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [reports, setReports] = useState<ConsumptionReport[]>([]);
  const [queried, setQueried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pieceMatches, setPieceMatches] = useState<Record<string, string>>({});
  const comparison = useMemo(() => compareModel(model, reports, pieceMatches), [model, reports, pieceMatches]);
  const pieces = [...new Set(reports.flatMap((report) => report.ofs.map((item) => item.piece)))].filter(Boolean).sort();
  const changeable = comparison.parts.flatMap((part) => part.rows.filter((row) => row.status !== 'igual' && (row.status === 'sobra' || row.realQuantity > 0)));
  async function consult() {
    const orders = [...new Set(input.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))];
    if (!orders.length || orders.length > 10) { setError('Escribe entre 1 y 10 pedidos, separados por espacios o comas.'); return; }
    setBusy(true); setError(''); setQueried(false); setReports([]); setSelected(new Set()); setPieceMatches({});
    try {
      const loaded = await Promise.all(orders.map(async (order) => {
        const response = await fetch(`/api/order-consumption?order=${encodeURIComponent(order)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `No se pudo consultar ${order}.`);
        if (!data.order) throw new Error(`No se encontró el pedido ${order}.`);
        return data as ConsumptionReport;
      }));
      setReports(loaded); setQueried(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo consultar el consumo.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true); setError('');
    try { await onApply(applyModelComparison(model, comparison, selected, uid)); onClose(); }
    catch (err) { if (!(err instanceof SaveCancelledError)) setError(err instanceof Error ? err.message : 'No se pudo actualizar el modelo.'); }
    finally { setBusy(false); }
  }
  const labels = { falta: 'Falta en el modelo', sobra: 'Sobra en el modelo', cambia: 'Cantidad distinta', igual: 'Coincide' };
  return <ModelDialog className="model-comparison-modal" labelledBy="comparison-title" onClose={onClose} busy={busy}>
    <div className="modal-header">
      <div><h2 id="comparison-title">Comparar con pedidos reales</h2><p>{model.name}</p></div>
      <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Cerrar"><X aria-hidden="true" /></button>
    </div>
    <p>Comparamos la cantidad base del modelo (multiplicador 1) con el consumo por unidad fabricada de cada pieza. Si guardaste cantidades para varias unidades en el modelo, revisa su base antes de aplicar cambios.</p>
    <p className="field-hint">En cada pedido se suman consumos y unidades de las OFs con el mismo nombre de pieza. Entre pedidos se usa la mediana, contando como cero el material ausente en una pieza comparable. Los traspasos detectados se devuelven a su OF. Los restos se muestran para que puedas revisarlos.</p>
    <form className="comparison-search" onSubmit={(event) => { event.preventDefault(); void consult(); }}>
      <label className="field"><span>Pedidos ya fabricados (hasta 10)</span><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="AR2603201, AR2600001" disabled={busy} /></label>
      <button type="submit" className="button button-secondary" disabled={busy}>{busy ? 'Procesando…' : 'Consultar'}</button>
    </form>
    {error && <p role="alert" className="field-error">{error}</p>}
    {queried && <>
      <details className="comparison-matches">
        <summary>Revisar correspondencias de las partes</summary>
        <p className="field-hint">Se empareja por nombre completo, sin tildes ni mayúsculas. Si RPS usa otro nombre, elige la pieza equivalente. Cada pieza solo puede asignarse a una parte. No cambia los nombres del modelo.</p>
        {model.parts.map((part) => <label className="field" key={part.id}><span>{part.name}</span>
          <select disabled={busy} value={pieceMatches[part.id] ?? '__auto__'} onChange={(event) => { const value = event.target.value; setPieceMatches((previous) => { const next = { ...previous }; if (value === '__auto__') delete next[part.id]; else next[part.id] = value; return next; }); setSelected(new Set()); }}>
            <option value="__auto__">Por nombre: {part.name}</option><option value="">No comparar esta parte</option>
            {pieces.map((piece) => <option key={piece} value={piece}>{piece}</option>)}
          </select>
        </label>)}
      </details>
      <p>{reports.map((report) => report.order).join(', ')} · {comparison.parts.filter((part) => part.orders.length).length} partes comparables · {changeable.length} cambios posibles.</p>
      {comparison.warnings.length > 0 && <details className="comparison-warnings"><summary>Avisos ({comparison.warnings.length})</summary><ul>{comparison.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      <div className="quick-selection-buttons">
        <button type="button" className="button button-ghost-sm" disabled={busy} onClick={() => setSelected(new Set(changeable.map((row) => row.key)))}>Marcar todos los cambios</button>
        <button type="button" className="button button-ghost-sm" disabled={busy} onClick={() => setSelected(new Set())}>Desmarcar todos</button>
      </div>
      {comparison.parts.map((part) => <section key={part.partId} className="comparison-part">
        <h3>{part.name}</h3>
        {pieceMatches[part.partId] && <p className="field-hint">Pieza elegida: {pieceMatches[part.partId]}.</p>}
        {!part.orders.length ? <p className="field-hint">Sin historial comparable.</p> : <>
          <p className="field-hint">Pedidos comparados: {part.orders.join(', ')}.</p>
          <div className="model-table-scroll"><table className="model-part-table">
            <thead><tr><th>Aplicar</th><th>Artículo</th><th>Modelo</th><th>Real / unidad</th><th>Diferencia</th><th>Pedidos con material</th><th>Resultado</th></tr></thead>
            <tbody>{part.rows.map((row) => <tr key={row.key}>
              <td><input type="checkbox" aria-label={`Aplicar ${row.code} en ${part.name}`} disabled={busy || row.status === 'igual' || (row.status !== 'sobra' && row.realQuantity <= 0)} checked={selected.has(row.key)} onChange={(event) => { const checked = event.target.checked; setSelected((previous) => { const next = new Set(previous); if (checked) next.add(row.key); else next.delete(row.key); return next; }); }} /></td>
              <td><strong>{row.code}</strong><span className="comparison-description">{formatDisplayText(row.description)}</span></td>
              <td>{row.modelQuantity === null ? 'Sin cantidad' : formatNumber(row.modelQuantity)}</td>
              <td>{formatNumber(row.realQuantity)}</td><td>{row.difference === null ? '—' : `${row.difference > 0 ? '+' : ''}${formatNumber(row.difference)}`}</td>
              <td>{row.present} de {row.orders}</td><td>{labels[row.status]}</td>
            </tr>)}</tbody>
          </table></div>
        </>}
      </section>)}
    </>}
    <div className="modal-footer">
      <p className="field-hint">Se aplicarán {selected.size} cambios. «Sobra en el modelo» elimina la línea seleccionada.</p>
      <div className="modal-actions"><button type="button" className="button button-muted" onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className="button button-primary" onClick={() => void apply()} disabled={busy || !selected.size}>Aplicar al modelo</button></div>
    </div>
  </ModelDialog>;
}
