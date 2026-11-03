import type { ReactNode } from 'react';
import { Database, Folder, Moon, Sun, UserRound } from 'lucide-react';
import { personaDe, tintaSobre } from '../personas';
import type { ConnectionState } from '../types';

const statusLabels: Record<'database' | 'network', Record<ConnectionState, string>> = {
  database: { checking: 'Comprobando BD', ok: 'BD conectada', error: 'BD sin conexión' },
  network: { checking: 'Comprobando red', ok: 'Carpeta de red OK', error: 'Red sin acceso' }
};

/** Cabecera de CoordinaOT: logo, pestañas, estado y modo en una sola barra. */
export function Header({
  databaseState,
  networkState,
  theme,
  onToggleTheme,
  userName,
  onChangeUser,
  navigation
}: {
  databaseState: ConnectionState;
  networkState: ConnectionState;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  userName: string;
  onChangeUser: () => void;
  navigation: ReactNode;
}) {
  return (
    <header className="cabecera glass-header">
      <div className="cabecera-logo">
        <h1 className="sr-only">Materiales OT - Asignaciones</h1>
        <img className="logo-claro" src="/logo-light.png" alt="Materiales OT" />
        <img className="logo-oscuro" src="/logo-dark.png" alt="Materiales OT" />
      </div>
      {navigation}
      <div className="cabecera-derecha">
        <button
          type="button"
          className="estado-chip glass-chip usuario-chip"
          onClick={onChangeUser}
          title="Tu nombre queda apuntado en lo que crees, cambies o borres. Pulsa para cambiarlo."
        >
          <UserAvatar name={userName} />
          {userName || 'Sin nombre'}
        </button>
        <StatusChip kind="database" state={databaseState} />
        <StatusChip kind="network" state={networkState} />
        {/* Como el ThemeToggle de CoordinaOT: en claro enseña la luna, en oscuro el sol */}
        <button
          type="button"
          className="cabecera-modo glass-chip"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

function StatusChip({ kind, state }: { kind: 'database' | 'network'; state: ConnectionState }) {
  return (
    <div className={`estado-chip glass-chip ${state}`} title={statusLabels[kind][state]}>
      <span className="estado-punto" aria-hidden="true" />
      {kind === 'database' ? <Database aria-hidden="true" /> : <Folder aria-hidden="true" />}
      {statusLabels[kind][state]}
    </div>
  );
}

/** Círculo de iniciales con el color de cada persona (el de CoordinaOT); sin nombre, un icono. */
function UserAvatar({ name }: { name: string }) {
  if (!name) return <UserRound aria-hidden="true" />;
  const { iniciales, color } = personaDe(name);
  return (
    <span className="usuario-avatar" aria-hidden="true" style={color ? { background: color, color: tintaSobre(color) } : undefined}>
      {iniciales}
    </span>
  );
}
