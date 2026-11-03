import { useCallback, useState } from 'react';
import type { Toast, ToastAction, ToastType } from '../types';
import { uid } from '../utils';

/** Avisos emergentes: como mucho cuatro a la vez; con acción («Deshacer») duran más. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast))
    );
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 260);
  }, []);

  const pushToast = useCallback((text: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = uid();
    setToasts((current) => [...current.slice(-3), { id, text, type, action }]);
    const ttl = action ? 7000 : type === 'error' ? 6500 : 4200;
    window.setTimeout(() => dismissToast(id), ttl);
  }, [dismissToast]);

  return { toasts, pushToast, dismissToast };
}
