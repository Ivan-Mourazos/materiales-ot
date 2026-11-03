import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckSquare, ChevronDown, ClipboardList, Download, Loader2, Search, Square, X } from 'lucide-react';
import type { OfBlock } from '../../types';
import type { RpsOrderOf } from '../../orderOfs';
import { consumptionToOfBlocks, type ConsumptionReport, type LoadMode } from '../../consumptionLoad';
import { formatDisplayText, formatNumber, uid } from '../../utils';
import { ModelDialog } from '../common/ModelDialog';
import { TriStateCheckbox } from '../common/TriStateCheckbox';
import { allLineKeys, lineKey, ofSelectionState, toggleOf } from '../../reusePick';

/**
 * Copia el despiece real (lo que se gastó de verdad en cada OF, según RPS) de un pedido ya
 * fabricado a la asignación actual. Avisa de lo gastado sin estar previsto, de lo reservado
 * que no se usó y del material que en taller se apuntó en la OF de al lado.
 */
export function CopyConsumptionModal({
  currentOrderCode,
  hasContent,
  onClose,
  onLoad
}: {
  currentOrderCode: string;
  hasContent: boolean;
  onClose: () => void;
  onLoad: (ofs: OfBlock[], summary: string) => void;
}) {
  const [sourceOrder, setSourceOrder] = useState('');
  const [report, setReport] = useState<ConsumptionReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [fixTransfers, setFixTransfers] = useState(true);
  const [targetOfs, setTargetOfs] = useState<RpsOrderOf[]>([]);
  const [targetOrder, setTargetOrder] = useState<string | null>(null);
  const [mode, setMode] = useState<LoadMode>('blank');
  const [scaleToUnits, setScaleToUnits] = useState(false);
  const [openOf, setOpenOf] = useState<string | null>(null);
  // Qué líneas se mandan al panel (Iván, 03/11/2026: «poder elegir lo que mandamos al panel o no»)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const lastQuery = useRef('');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // OFs del pedido de la asignación, para emparejar las piezas copiadas con ellas
  useEffect(() => {
    const code = currentOrderCode.trim();
    if (!code) return;
    const controller = new AbortController();
    fetch(`/api/order-ofs?order=${encodeURIComponent(code)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const ofs: RpsOrderOf[] = Array.isArray(data?.ofs) ? data.ofs : [];
        setTargetOfs(ofs);
        setTargetOrder(data?.order || null);
        if (ofs.length > 0) setMode('target');
      })
      .catch(() => {});
    return () => controller.abort();
  }, [currentOrderCode]);

  async function loadReport(order: string, fix: boolean) {
    const code = order.trim();
    if (!code) {
      setError('Escribe el número del pedido del que quieres copiar el despiece.');
      inputRef.current?.focus();
      return;
    }
    lastQuery.current = code;
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/order-consumption?order=${encodeURIComponent(code)}&fixTransfers=${fix ? 'true' : 'false'}`
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar el pedido en RPS.');
      if (!data.order) throw new Error(`RPS no tiene el pedido ${code}. Revisa el número.`);
      if (!data.totals?.lines) throw new Error(`El pedido ${data.order} no tiene material imputado en RPS todavía.`);
      setReport(data);
      setOpenOf(null);
      // Al consultar (o cambiar lo de la OF de al lado) se vuelve a marcar todo
      setSelected(allLineKeys((data as ConsumptionReport).ofs.filter((item) => item.materials.length > 0)));
    } catch (fetchError) {
      setReport(null);
      setError(fetchError instanceof Error ? fetchError.message : 'Error inesperado.');
    } finally {
      setIsLoading(false);
    }
  }

  const preview = useMemo(
    () =>
      report
        ? consumptionToOfBlocks({ report, mode, targetOfs, scaleToUnits: mode === 'target' && scaleToUnits, newId: uid })
        : null,
    [report, mode, targetOfs, scaleToUnits]
  );
  const sources = useMemo(() => (report ? report.ofs.filter((item) => item.materials.length > 0) : []), [report]);
  // Lo que se manda de verdad: solo las líneas marcadas; una OF sin ninguna no se manda
  const picked = useMemo(
    () =>
      (preview?.ofs || [])
        .map((block, ofIndex) => ({
          ...block,
          materials: block.materials.filter((_, lineIndex) => selected.has(lineKey(ofIndex, lineIndex)))
        }))
        .filter((block) => block.materials.length > 0),
    [preview, selected]
  );
  const pickedLines = picked.reduce((sum, block) => sum + block.materials.length, 0);
  // Restos de lona (RESTO…): se gastan pero no se reservan; con un botón se desmarcan todos
  const restKeys = useMemo(() => {
    const keys: string[] = [];
    sources.forEach((source, ofIndex) =>
      source.materials.forEach((line, lineIndex) => {
        if (line.code.toUpperCase().startsWith('RESTO')) keys.push(lineKey(ofIndex, lineIndex));
      })
    );
    return keys;
  }, [sources]);

  function toggleLine(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function confirm() {
    if (!report || picked.length === 0) return;
    const parts = [`${picked.length} OFs y ${pickedLines} líneas del pedido ${report.order}`];
    if (mode === 'target') parts.push(`${picked.filter((block) => block.of).length} con OF del ${targetOrder}`);
    onLoad(picked, `Despiece real cargado: ${parts.join(', ')}.`);
  }

  return (
    <ModelDialog className="copy-consumption-modal" labelledBy="copy-consumption-title" onClose={onClose} busy={isLoading}>
      <div className="modal-header">
        <div className="modal-icon">
          <ClipboardList aria-hidden="true" />
        </div>
        <div>
          <h2 id="copy-consumption-title">Copiar despiece real de otro pedido</h2>
          <p className="modal-subtitle">
            Trae de RPS lo que se gastó de verdad en cada OF de un pedido ya fabricado (lo apuntado en el avance de obra),
            no lo que se reservó.
          </p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} disabled={isLoading} title="Cerrar" aria-label="Cerrar">
          <X aria-hidden="true" />
        </button>
      </div>

      <form
        className="consumption-search"
        onSubmit={(event) => {
          event.preventDefault();
          loadReport(sourceOrder, fixTransfers);
        }}
      >
        <label className="field">
          <span>Pedido de origen</span>
          <input
            ref={inputRef}
            value={sourceOrder}
            onChange={(event) => setSourceOrder(event.target.value)}
            placeholder="Ej.: AR2603201"
            autoComplete="off"
          />
        </label>
        <button className="button button-primary" type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          {isLoading ? 'Consultando RPS…' : 'Consultar'}
        </button>
      </form>

      {error && (
        <div className="modal-error-banner" role="alert">
          {error}
        </div>
      )}

      {report && preview && (
        <>
          <div className="save-draft-stats consumption-stats">
            <div className="save-draft-stat">
              <strong>{sources.length}</strong>
              <span>{sources.length === 1 ? 'OF con material' : 'OFs con material'}</span>
            </div>
            <div className="save-draft-stat">
              <strong>{report.totals.lines}</strong>
              <span>líneas</span>
            </div>
            <div className="save-draft-stat" title="Gastado sin estar en la reserva">
              <strong>{report.totals.unplanned}</strong>
              <span>no previstas</span>
            </div>
            <div className="save-draft-stat" title="Reservado y sin gastar">
              <strong>{report.totals.unused}</strong>
              <span>sin gastar</span>
            </div>
          </div>

          {report.transfers.length > 0 && (
            <div className="consumption-transfers" role="status">
              <p>
                <AlertTriangle aria-hidden="true" />
                En taller apuntaron material en la OF de al lado: la cantidad que falta en una cuadra con la que sobra en la
                otra.
              </p>
              <ul>
                {report.transfers.map((transfer) => (
                  <li key={`${transfer.code}-${transfer.from}-${transfer.to}`}>
                    <strong>{formatNumber(transfer.quantity)}</strong> {formatDisplayText(transfer.description) || transfer.code}{' '}
                    <span className="consumption-ofs">
                      OF {transfer.from} <ArrowRight aria-hidden="true" /> OF {transfer.to}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={fixTransfers}
                  disabled={isLoading}
                  onChange={(event) => {
                    setFixTransfers(event.target.checked);
                    loadReport(lastQuery.current, event.target.checked);
                  }}
                />
                Devolver ese material a la OF donde estaba reservado (recomendado)
              </label>
            </div>
          )}

          <fieldset className="save-mode-options">
            <legend>Números de OF en la asignación</legend>
            {targetOfs.length > 0 && (
              <label className="save-mode-option">
                <input type="radio" name="consumptionMode" checked={mode === 'target'} onChange={() => setMode('target')} />
                <span>
                  <strong>Las OFs del pedido {targetOrder}</strong>
                  <em>
                    Empareja cada pieza con la OF del pedido actual que fabrica lo mismo ({preview.matched} de{' '}
                    {preview.ofs.length} emparejadas).
                  </em>
                </span>
              </label>
            )}
            <label className="save-mode-option">
              <input type="radio" name="consumptionMode" checked={mode === 'blank'} onChange={() => setMode('blank')} />
              <span>
                <strong>Sin número de OF</strong>
                <em>Las piezas quedan con su nombre; el número de OF lo pones tú.</em>
              </span>
            </label>
            <label className="save-mode-option">
              <input type="radio" name="consumptionMode" checked={mode === 'source'} onChange={() => setMode('source')} />
              <span>
                <strong>Las OFs del pedido {report.order}</strong>
                <em>Para revisar o guardar ese pedido tal cual. No generes la reserva con ellas.</em>
              </span>
            </label>
          </fieldset>

          {mode === 'target' && (
            <label className="checkbox-line">
              <input type="checkbox" checked={scaleToUnits} onChange={(event) => setScaleToUnits(event.target.checked)} />
              Ajustar las cantidades a las unidades de cada OF nueva
            </label>
          )}

          {mode === 'target' && preview.unmatched.length > 0 && (
            <p className="missing-hint" role="status">
              <AlertTriangle aria-hidden="true" />
              Sin OF en el {targetOrder}: {preview.unmatched.join(', ')}. Quedarán sin número.
            </p>
          )}

          <div className="transfer-parts-toolbar">
            <span className="parts-count-label">
              Al panel: {picked.length} de {sources.length} OFs · {pickedLines} de {report.totals.lines} líneas
            </span>
            <div className="quick-selection-buttons">
              <button className="button button-ghost-sm" type="button" onClick={() => setSelected(allLineKeys(sources))}>
                <CheckSquare aria-hidden="true" /> Marcar todo
              </button>
              <button className="button button-ghost-sm" type="button" onClick={() => setSelected(new Set())}>
                <Square aria-hidden="true" /> Desmarcar todo
              </button>
              {restKeys.some((key) => selected.has(key)) && (
                <button
                  className="button button-ghost-sm"
                  type="button"
                  title="Desmarca las líneas de restos de lona (RESTO…), que no se reservan"
                  onClick={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      restKeys.forEach((key) => next.delete(key));
                      return next;
                    })
                  }
                >
                  <Square aria-hidden="true" /> Quitar restos de lona
                </button>
              )}
            </div>
          </div>

          <ul className="consumption-list">
            {sources.map((source, index) => {
              const block = preview.ofs[index];
              const isOpen = openOf === source.of;
              const unplanned = new Set(source.unplanned.map((line) => line.code));
              const state = ofSelectionState(source, index, selected);
              return (
                <li key={source.of} className={`${isOpen ? 'open' : ''}${state === 'none' ? ' is-off' : ''}`}>
                  <div className="consumption-head">
                  <TriStateCheckbox
                    state={state}
                    label={`Mandar al panel la OF ${source.of}`}
                    onChange={() => setSelected((current) => toggleOf(source, index, current))}
                  />
                  <button
                    type="button"
                    className="consumption-row"
                    aria-expanded={isOpen}
                    onClick={() => setOpenOf(isOpen ? null : source.of)}
                  >
                    <ChevronDown aria-hidden="true" />
                    <span className="consumption-piece">{formatDisplayText(source.piece) || 'Sin pieza'}</span>
                    <span className="consumption-ofs">
                      OF {source.of}
                      {mode !== 'source' && (
                        <>
                          <ArrowRight aria-hidden="true" />
                          {block?.of ? `OF ${block.of}` : 'sin OF'}
                        </>
                      )}
                    </span>
                    <span className="consumption-count">{source.materials.length} líneas</span>
                    {source.unplanned.length > 0 && (
                      <span className="consumption-tag warn">{source.unplanned.length} no previstas</span>
                    )}
                  </button>
                  </div>
                  {isOpen && block && (
                    <div className="consumption-detail">
                      <table>
                        <tbody>
                          {block.materials.map((line, lineIndex) => (
                            <tr key={line.id} className={selected.has(lineKey(index, lineIndex)) ? undefined : 'is-off'}>
                              <td className="consumption-check">
                                <input
                                  type="checkbox"
                                  checked={selected.has(lineKey(index, lineIndex))}
                                  onChange={() => toggleLine(lineKey(index, lineIndex))}
                                  aria-label={`Mandar ${line.code} al panel`}
                                />
                              </td>
                              <td>{line.code}</td>
                              <td>
                                {formatDisplayText(line.description)}
                                {unplanned.has(line.code) && <span className="consumption-tag warn">no previsto</span>}
                              </td>
                              <td>{formatNumber(line.quantity ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {source.unused.length > 0 && (
                        <p className="consumption-unused">
                          Reservado y sin gastar:{' '}
                          {source.unused
                            .map((line) => `${formatDisplayText(line.description) || line.code} (${formatNumber(line.reserved)})`)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="modal-footer">
        {report && hasContent && <span className="consumption-note">Sustituye las OFs de la asignación actual (se puede deshacer).</span>}
        <div className="modal-actions">
          <button className="button button-muted" type="button" onClick={onClose} disabled={isLoading}>
            Cancelar
          </button>
          <button className="button button-primary" type="button" onClick={confirm} disabled={!report || isLoading || picked.length === 0}>
            <Download aria-hidden="true" />
            Cargar en la asignación
          </button>
        </div>
      </div>
    </ModelDialog>
  );
}
