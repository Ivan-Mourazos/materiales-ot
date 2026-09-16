import { Boxes, FileSpreadsheet, History, Layers } from 'lucide-react';

export type ActiveTab = 'assignments' | 'models' | 'articles' | 'history';

export function Navigation({
  activeTab,
  onChangeTab
}: {
  activeTab: ActiveTab;
  onChangeTab: (tab: ActiveTab) => void;
}) {
  return (
    <nav className="app-tabs" aria-label="Vistas principales">
      <button
        className={activeTab === 'assignments' ? 'active' : ''}
        aria-current={activeTab === 'assignments' ? 'page' : undefined}
        type="button"
        onClick={() => onChangeTab('assignments')}
      >
        <FileSpreadsheet aria-hidden="true" />
        Asignaciones
      </button>
      <button
        className={activeTab === 'models' ? 'active' : ''}
        aria-current={activeTab === 'models' ? 'page' : undefined}
        type="button"
        onClick={() => onChangeTab('models')}
      >
        <Layers aria-hidden="true" />
        Modelos
      </button>
      <button
        className={activeTab === 'articles' ? 'active' : ''}
        aria-current={activeTab === 'articles' ? 'page' : undefined}
        type="button"
        onClick={() => onChangeTab('articles')}
      >
        <Boxes aria-hidden="true" />
        Artículos
      </button>
      <button
        className={activeTab === 'history' ? 'active' : ''}
        aria-current={activeTab === 'history' ? 'page' : undefined}
        type="button"
        onClick={() => onChangeTab('history')}
      >
        <History aria-hidden="true" />
        Historial
      </button>
    </nav>
  );
}
