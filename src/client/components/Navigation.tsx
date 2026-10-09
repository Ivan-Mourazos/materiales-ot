import type { ReactNode } from 'react';
import { Boxes, FileClock, FileSpreadsheet, History, Layers } from 'lucide-react';

export type ActiveTab = 'assignments' | 'drafts' | 'models' | 'articles' | 'history';

const tabs: { id: ActiveTab; label: string; icon: ReactNode }[] = [
  { id: 'assignments', label: 'Asignaciones', icon: <FileSpreadsheet aria-hidden="true" /> },
  { id: 'drafts', label: 'Borradores', icon: <FileClock aria-hidden="true" /> },
  { id: 'models', label: 'Modelos', icon: <Layers aria-hidden="true" /> },
  { id: 'articles', label: 'Artículos', icon: <Boxes aria-hidden="true" /> },
  { id: 'history', label: 'Historial', icon: <History aria-hidden="true" /> }
];

/** Pestañas de CoordinaOT (ViewSwitcher.tsx): teclas sueltas, la activa hundida en dorado. */
export function Navigation({
  activeTab,
  onChangeTab,
  draftsCount
}: {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
  draftsCount?: number;
}) {
  return (
    <nav className="cabecera-pestanas tira-3d" aria-label="Vistas principales">
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className={`pestana${active ? ' pestana-activa' : ''}`}
            aria-current={active ? 'page' : undefined}
            type="button"
            onClick={() => onChangeTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'drafts' && typeof draftsCount === 'number' && draftsCount > 0 && (
              <span className="pestana-contador">{draftsCount}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
