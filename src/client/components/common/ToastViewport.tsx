import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { Toast, ToastType } from '../../types';

const toastIcons: Record<ToastType, React.ReactNode> = {
  ok: <CheckCircle2 aria-hidden="true" />,
  error: <XCircle aria-hidden="true" />,
  warn: <AlertTriangle aria-hidden="true" />,
  info: <Info aria-hidden="true" />
};

export function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-label="Notificaciones">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast ${toast.type} ${toast.leaving ? 'leaving' : ''}`}
          role="status"
        >
          {toastIcons[toast.type]}
          <p>{toast.text}</p>
          {toast.action && (
            <button
              className="toast-action"
              type="button"
              onClick={() => {
                toast.action?.run();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Cerrar notificación">
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
