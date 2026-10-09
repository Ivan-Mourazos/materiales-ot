import { useCallback, useRef, useState, type ReactNode } from 'react';
import { historyDateFormat } from '../../utils';
import { ConfirmDialog } from './ConfirmDialog';

type Kind = 'modelo' | 'borrador';
type Resolution = 'overwrite' | 'new' | 'cancel';
type VersionedRecord = { id: string; name: string; updatedAt?: string; createdAt?: string };

/** El usuario prefirió no guardar al ver que otra persona había cambiado el registro. */
export class SaveCancelledError extends Error {}

export type VersionedSaveOptions = {
  kind: Kind;
  collectionUrl: '/api/models' | '/api/drafts';
  responseKey: 'model' | 'draft';
  id: string;
  name: string;
  body: Record<string, unknown>;
  /** Versión que se cargó. Sin ella se guarda sin comprobar. */
  expectedUpdatedAt?: string | null;
};

type PendingConflict = {
  kind: Kind;
  name: string;
  changedAt: string | null;
  resolve: (resolution: Resolution) => void;
};

async function send(url: string, method: 'PUT' | 'POST', body: Record<string, unknown>) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

/**
 * Guarda encima de un registro comprobando que nadie lo cambió desde que se cargó.
 * Si chocó, pregunta: sobrescribir, guardar como nuevo o cancelar.
 */
export function useVersionedSave(): {
  saveVersioned: <T extends VersionedRecord>(options: VersionedSaveOptions) => Promise<{ record: T; created: boolean }>;
  conflictDialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingConflict | null>(null);

  // Hay un guardado en curso (o un conflicto esperando respuesta): un segundo guardado
  // con la misma versión chocaría consigo mismo y mostraría un conflicto falso
  const busyRef = useRef(false);

  const execute = useCallback(async <T extends VersionedRecord>(
    options: VersionedSaveOptions
  ): Promise<{ record: T; created: boolean }> => {
    const { kind, collectionUrl, responseKey, id, name, body, expectedUpdatedAt } = options;
    const recordUrl = `${collectionUrl}/${encodeURIComponent(id)}`;
    const failure = (data: { error?: string }) => new Error(data.error || `No se pudo guardar el ${kind}.`);

    const first = await send(recordUrl, 'PUT', { ...body, expectedUpdatedAt: expectedUpdatedAt || undefined });
    if (first.response.ok) return { record: first.data[responseKey] as T, created: false };
    if (first.response.status !== 409) throw failure(first.data);

    const resolution = await new Promise<Resolution>((resolve) => {
      setPending({ kind, name, changedAt: first.data.current?.updatedAt ?? first.data.current?.createdAt ?? null, resolve });
    });
    setPending(null);

    if (resolution === 'cancel') {
      throw new SaveCancelledError(`No se ha guardado: este ${kind} lo ha modificado otra persona.`);
    }

    if (resolution === 'overwrite') {
      // Sin expectedUpdatedAt: el servidor guarda sin comprobar
      const retry = await send(recordUrl, 'PUT', body);
      if (!retry.response.ok) throw failure(retry.data);
      return { record: retry.data[responseKey] as T, created: false };
    }

    const copyBody: Record<string, unknown> = { ...body, name: `${name} (copia)` };
    delete copyBody.id;
    const copy = await send(collectionUrl, 'POST', copyBody);
    if (!copy.response.ok) throw failure(copy.data);
    return { record: copy.data[responseKey] as T, created: true };
  }, []);

  const saveVersioned = useCallback(async <T extends VersionedRecord>(
    options: VersionedSaveOptions
  ): Promise<{ record: T; created: boolean }> => {
    if (busyRef.current) throw new SaveCancelledError('Ya se está guardando; espera a que termine.');
    busyRef.current = true;
    try {
      return await execute<T>(options);
    } finally {
      busyRef.current = false;
    }
  }, [execute]);

  const conflictDialog = pending ? (
    <ConfirmDialog
      title={`Otra persona ha modificado este ${pending.kind}`}
      description={
        <>
          <strong>“{pending.name}”</strong> se guardó{' '}
          {pending.changedAt ? `el ${historyDateFormat.format(new Date(pending.changedAt))}` : 'de nuevo'},
          después de que lo abrieras. Si sobrescribes, se perderán esos cambios.
        </>
      }
      confirmLabel="Sobrescribir"
      secondaryLabel="Guardar como nuevo"
      initialFocus="cancel"
      onSecondary={() => pending.resolve('new')}
      onCancel={() => pending.resolve('cancel')}
      onConfirm={() => pending.resolve('overwrite')}
    />
  ) : null;

  return { saveVersioned, conflictDialog };
}
