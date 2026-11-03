import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../types';

// La misma clave la lee el script de index.html para pintar el tema antes de cargar React.
const themeStorageKey = 'materiales-ot-theme';

/**
 * Tema claro u oscuro. Mientras no se elige, sigue al sistema (`system`); el botón de la
 * cabecera, como el de CoordinaOT, pasa al contrario del que se ve y lo recuerda.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(themeStorageKey);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    if (mode === 'system') localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, mode);
  }, [mode, resolved]);

  const toggle = useCallback(() => setMode(resolved === 'dark' ? 'light' : 'dark'), [resolved]);

  return { resolved, toggle };
}
