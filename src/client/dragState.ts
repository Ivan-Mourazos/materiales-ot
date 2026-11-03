import type { DragEvent } from 'react';
import type { DropPosition } from './reorder';

// Qué se está arrastrando ahora mismo (una OF o un material). Durante el arrastre el navegador no
// deja leer los datos del dataTransfer (solo al soltar), así que se guarda aquí para poder decidir
// en cada `dragover` si se acepta y dónde pintar la marca.
export type DragItem = { type: 'of'; ofId: string } | { type: 'line'; ofId: string; lineId: string };

let current: DragItem | null = null;

export function startDrag(event: DragEvent, item: DragItem, preview?: HTMLElement | null) {
  current = item;
  event.dataTransfer.effectAllowed = 'move';
  // Firefox no empieza a arrastrar sin algún dato
  event.dataTransfer.setData('text/plain', item.type === 'of' ? item.ofId : item.lineId);
  if (preview) event.dataTransfer.setDragImage(preview, 24, 20);
}

export function endDrag() {
  current = null;
}

export function draggingItem(): DragItem | null {
  return current;
}

/** ¿Delante o detrás? Según el puntero esté en la mitad de arriba o de abajo del elemento. */
export function dropPositionFor(event: DragEvent, element: HTMLElement): DropPosition {
  const rect = element.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}
