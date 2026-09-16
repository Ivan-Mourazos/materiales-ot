import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { formatDisplayText } from '../../utils';

export function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es-ES');
    return q
      ? options.filter((option) => option.toLocaleLowerCase('es-ES').includes(q)).slice(0, 80)
      : options.slice(0, 80);
  }, [options, query]);

  const isDisabled = options.length === 0 && value === '';

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  return (
    <div className="field apple-select-field" ref={rootRef}>
      <span>{label}</span>
      <button
        className={`apple-select-trigger ${isOpen ? 'open' : ''}`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value ? formatDisplayText(value) : 'Todos'}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {isOpen && !isDisabled && (
        <div className="apple-select-menu">
          {options.length > 8 && (
            <div className="apple-select-search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Buscar ${label.toLocaleLowerCase('es-ES')}...`}
                aria-label={`Buscar ${label.toLocaleLowerCase('es-ES')}`}
              />
            </div>
          )}
          <div className="apple-select-options" role="listbox">
            <button
              className={`apple-select-option ${value === '' ? 'selected' : ''}`}
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
                setQuery('');
              }}
              role="option"
              aria-selected={value === ''}
            >
              <span>Todos</span>
              {value === '' && <Check aria-hidden="true" />}
            </button>
            {visibleOptions.map((option) => (
              <button
                className={`apple-select-option ${value === option ? 'selected' : ''}`}
                type="button"
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                  setQuery('');
                }}
                role="option"
                aria-selected={value === option}
              >
                <span>{formatDisplayText(option)}</span>
                {value === option && <Check aria-hidden="true" />}
              </button>
            ))}
            {visibleOptions.length === 0 && (
              <div className="apple-select-empty">Sin opciones</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
