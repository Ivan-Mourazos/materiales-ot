import { AlertTriangle, BookmarkPlus, Check, FileClock, Layers, Loader2, Plus, Save, X } from 'lucide-react';
import { detectOrderYear, formatNumber } from '../../utils';

export function SummaryPanel({
  orderCode,
  setOrderCode,
  totals,
  isSavingToNetwork,
  activeDraft,
  onSave,
  onOpenSaveDraft,
  onAddOf,
  onOpenLoadModel,
  onOpenSaveAsModel,
  onClearAll
}: {
  orderCode: string;
  setOrderCode: (value: string) => void;
  totals: { ofs: number; lines: number; units: number };
  isSavingToNetwork: boolean;
  activeDraft?: { id: string; name: string } | null;
  onSave: () => void;
  onOpenSaveDraft: () => void;
  onAddOf: () => void;
  onOpenLoadModel: () => void;
  onOpenSaveAsModel: () => void;
  onClearAll: () => void;
}) {
  const orderYear = detectOrderYear(orderCode);
  const hasOrderCode = Boolean(orderCode.trim());

  return (
    <aside className="summary-panel">
      <h2 className="panel-title">Resumen de asignación</h2>

      <label className="field">
        <span>N.º de pedido</span>
        <input
          value={orderCode}
          onChange={(event) => setOrderCode(event.target.value)}
          autoComplete="off"
          placeholder="Ej.: AR260123 (opcional)"
        />
        {hasOrderCode && (
          <span className={`order-hint ${orderYear ? 'ok' : 'warn'}`}>
            {orderYear ? (
              <>
                <Check aria-hidden="true" />
                Se archivará en {orderYear}/Reserva Materiales
              </>
            ) : (
              <>
                <AlertTriangle aria-hidden="true" />
                No se detecta el año (formato esperado: AR26XXXX)
              </>
            )}
          </span>
        )}
      </label>

      <div className="metrics">
        <Metric label="OFs" value={totals.ofs} />
        <Metric label="líneas" value={totals.lines} />
        <Metric label="uds." value={formatNumber(totals.units)} />
      </div>

      <div className="panel-buttons">
        <button
          className="button button-primary"
          type="button"
          onClick={onSave}
          disabled={isSavingToNetwork}
        >
          {isSavingToNetwork ? <Loader2 className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isSavingToNetwork ? 'Generando…' : 'Generar asignación'}
        </button>

        <button
          className="button button-muted"
          type="button"
          onClick={onOpenSaveDraft}
          disabled={totals.lines === 0 && !hasOrderCode}
          title={
            totals.lines === 0 && !hasOrderCode
              ? 'Introduce un pedido o añade materiales para guardar como borrador'
              : 'Guardar este pedido a medias para continuar más tarde'
          }
        >
          <FileClock aria-hidden="true" />
          {activeDraft ? 'Actualizar borrador' : 'Guardar borrador'}
        </button>

        <button className="button button-muted" type="button" onClick={onOpenLoadModel}>
          <Layers aria-hidden="true" />
          Usar un modelo
        </button>

        <button
          className="button button-muted"
          type="button"
          onClick={onOpenSaveAsModel}
          disabled={totals.lines === 0}
          title={totals.lines === 0 ? 'Añade materiales para guardar como modelo' : 'Guardar las OFs actuales como plantilla de modelo'}
        >
          <BookmarkPlus aria-hidden="true" />
          Guardar como modelo
        </button>

        <button className="button button-ghost" type="button" onClick={onAddOf}>
          <Plus aria-hidden="true" />
          Añadir OF vacía
        </button>

        <button className="button button-muted" type="button" onClick={onClearAll}>
          <X aria-hidden="true" />
          Limpiar formulario
        </button>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-box">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
