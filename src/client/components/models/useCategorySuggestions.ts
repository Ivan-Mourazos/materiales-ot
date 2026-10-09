import { useEffect, useState } from 'react';
import { listCategoryLabels } from '../../modelCategories';
import type { AssignmentModel } from '../../types';

/**
 * Categorías existentes para el diálogo "Guardar como modelo", que se abre desde
 * Asignaciones sin la lista de modelos a mano. Si falla, simplemente no hay sugerencias.
 */
export function useCategorySuggestions(): string[] {
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/models')
      .then((response) => (response.ok ? response.json() : { models: [] }))
      .then((data: { models?: AssignmentModel[] }) => {
        if (!cancelled) setLabels(listCategoryLabels(data.models || []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return labels;
}
