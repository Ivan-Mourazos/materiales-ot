import { useId } from 'react';

/** Texto libre con las categorías existentes como sugerencias. */
export function CategoryField({
  value,
  onChange,
  suggestions
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const listId = useId();
  return (
    <label className="field category-field">
      <span>Categoría</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        maxLength={40}
        placeholder="Ej.: Escenarios, Toldos…"
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </label>
  );
}
