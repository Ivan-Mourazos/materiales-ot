import React from 'react';
import { Database, Folder, Monitor, Moon, Sun } from 'lucide-react';
import type { ConnectionState, ThemeMode } from '../types';

const statusPillLabels: Record<'database' | 'network', Record<ConnectionState, string>> = {
  database: { checking: 'Comprobando BD', ok: 'BD conectada', error: 'BD sin conexión' },
  network: { checking: 'Comprobando red', ok: 'Carpeta de red OK', error: 'Red sin acceso' }
};

const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: 'light', label: 'Tema claro', icon: <Sun aria-hidden="true" /> },
  { value: 'system', label: 'Tema del sistema', icon: <Monitor aria-hidden="true" /> },
  { value: 'dark', label: 'Tema oscuro', icon: <Moon aria-hidden="true" /> }
];

export function Header({
  databaseState,
  networkState,
  themeMode,
  setThemeMode
}: {
  databaseState: ConnectionState;
  networkState: ConnectionState;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <h1 className="sr-only">Materiales OT - Asignaciones</h1>
        <img className="brand-logo brand-logo-light" src="/logo-light.png" alt="Materiales OT" />
        <img className="brand-logo brand-logo-dark" src="/logo-dark.png" alt="Materiales OT" />
      </div>
      <div className="topbar-actions">
        <StatusPill kind="database" state={databaseState} />
        <StatusPill kind="network" state={networkState} />
        <ThemeToggle mode={themeMode} onChange={setThemeMode} />
      </div>
    </header>
  );
}

function StatusPill({ kind, state }: { kind: 'database' | 'network'; state: ConnectionState }) {
  return (
    <div className={`status-pill ${state}`} title={statusPillLabels[kind][state]}>
      <span className="status-dot" aria-hidden="true" />
      {kind === 'database' ? <Database aria-hidden="true" /> : <Folder aria-hidden="true" />}
      {statusPillLabels[kind][state]}
    </div>
  );
}

function ThemeToggle({ mode, onChange }: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Tema de la interfaz">
      {themeOptions.map((option, index) => (
        <button
          key={option.value}
          className={mode === option.value ? 'active' : ''}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          tabIndex={mode === option.value ? 0 : -1}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? themeOptions.length - 1 : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + themeOptions.length) % themeOptions.length;
            onChange(themeOptions[next].value);
            event.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
          }}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}
