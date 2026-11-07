import { createContext, useContext, useEffect, useState } from 'react';
import type { OfBlock } from './types';

// Stock libre y bloqueos de lo que lleva la asignación (POST /api/stock-check, src/stockCheck.js).
// Se pide al cambiar los códigos o las cantidades y llega a cada línea de material por contexto,
// sin pasar por la tarjeta de OF.

export type StockInfo = {
  description: string;
  unit: string;
  blockedManufacturing: boolean;
  physical: number;
  reserved: number;
  pendingPurchases: number;
  nextReceipt: string | null;
};

export type StockShortage = {
  code: string;
  unit: string;
  requested: number;
  free: number;
  missing: number;
  pendingPurchases: number;
  nextReceipt: string | null;
};

export type StockCheck = {
  stock: Record<string, StockInfo>;
  shortages: StockShortage[];
  blocked: { code: string; description: string }[];
  unknown: string[];
  messages: string[];
};

export const StockCheckContext = createContext<StockCheck | null>(null);

export function useStockCheckContext() {
  return useContext(StockCheckContext);
}

/** Lo mínimo que hay que mandar: código y cantidad de cada línea. */
function payloadOf(ofs: OfBlock[]) {
  return ofs.map((ofBlock) => ({
    of: ofBlock.of,
    materials: ofBlock.materials.map((line) => ({ code: line.code, quantity: line.quantity }))
  }));
}

export async function fetchStockCheck(ofs: OfBlock[], signal?: AbortSignal): Promise<StockCheck> {
  return postStockCheck(JSON.stringify({ ofs: payloadOf(ofs) }), signal);
}

async function postStockCheck(body: string, signal?: AbortSignal): Promise<StockCheck> {
  const response = await fetch('/api/stock-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal
  });
  if (!response.ok) throw new Error('No se pudo consultar el stock en RPS.');
  return response.json();
}

/**
 * Consulta el stock de la asignación cuando cambian los códigos o cantidades (con una pausa de
 * 700 ms para no preguntar a RPS en cada tecla). Si RPS no responde, devuelve null y no se avisa.
 */
export function useStockCheck(ofs: OfBlock[]): StockCheck | null {
  const [check, setCheck] = useState<StockCheck | null>(null);
  // El texto de lo que se manda: el efecto solo se repite si cambia algún código o cantidad
  const body = JSON.stringify({ ofs: payloadOf(ofs) });
  const hasMaterials = ofs.some((block) => block.materials.length > 0);

  useEffect(() => {
    if (!hasMaterials) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      postStockCheck(body, controller.signal)
        .then(setCheck)
        .catch(() => {
          if (!controller.signal.aborted) setCheck(null);
        });
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [body, hasMaterials]);

  return hasMaterials ? check : null;
}
