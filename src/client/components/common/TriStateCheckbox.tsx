import { useEffect, useRef } from 'react';

/** Casilla con tres estados: todas marcadas, algunas (raya) o ninguna. */
export function TriStateCheckbox({
  state,
  label,
  onChange,
  className = 'reuse-of-check'
}: {
  state: 'all' | 'some' | 'none';
  label: string;
  onChange: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return <input ref={ref} type="checkbox" className={className} checked={state === 'all'} onChange={onChange} aria-label={label} />;
}
