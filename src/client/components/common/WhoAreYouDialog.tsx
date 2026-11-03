import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { cleanUserName, MAX_USER_LENGTH } from '../../currentUser';
import { mismaPersona, PERSONAS, personaDe, tintaSobre } from '../../personas';
import { ModelDialog } from './ModelDialog';

/**
 * «¿Quién eres?», como en Toldos Testar: cada técnico con su círculo de iniciales y su color.
 * La primera vez no se puede cerrar sin elegir; después se abre desde el nombre de la cabecera.
 * Lo elegido queda guardado en este navegador y se apunta en lo que se crea, cambia o borra.
 */
export function WhoAreYouDialog({
  current,
  required,
  onChoose,
  onClose
}: {
  current: string;
  required: boolean;
  onChoose: (name: string) => void;
  onClose: () => void;
}) {
  const isOther = Boolean(current) && !PERSONAS.some((persona) => mismaPersona(persona.nombre, current));
  const [showOther, setShowOther] = useState(isOther);
  const [otherName, setOtherName] = useState(isOther ? current : '');
  const cleanOther = cleanUserName(otherName);

  return (
    <ModelDialog
      className="who-are-you-modal"
      labelledBy="who-are-you-title"
      onClose={() => {
        if (!required) onClose();
      }}
    >
      {!required && (
        <button className="icon-button who-are-you-close" type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar">
          <X aria-hidden="true" />
        </button>
      )}
      <div className="who-are-you-heading">
        <span>Este navegador</span>
        <h2 id="who-are-you-title">¿Quién eres?</h2>
        <p>
          Tu nombre queda apuntado en los borradores, modelos y reservas que crees, cambies o borres. Se cambia desde
          tu nombre, arriba a la derecha.
        </p>
      </div>

      <div className="who-are-you-options">
        {PERSONAS.map(({ nombre }) => {
          const { iniciales, color } = personaDe(nombre);
          const isCurrent = mismaPersona(nombre, current);
          return (
            <button
              key={nombre}
              type="button"
              className={`who-are-you-option${isCurrent ? ' is-current' : ''}`}
              aria-pressed={isCurrent}
              onClick={() => onChoose(nombre)}
            >
              <span
                className="who-are-you-avatar"
                aria-hidden="true"
                style={color ? { background: color, color: tintaSobre(color) } : undefined}
              >
                {iniciales}
              </span>
              <span>{nombre}</span>
            </button>
          );
        })}
      </div>

      {showOther ? (
        <form
          className="who-are-you-other"
          onSubmit={(event) => {
            event.preventDefault();
            if (cleanOther) onChoose(cleanOther);
          }}
        >
          <label className="field">
            <span>Tu nombre</span>
            <input
              value={otherName}
              maxLength={MAX_USER_LENGTH}
              onChange={(event) => setOtherName(event.target.value)}
              placeholder="Nombre y apellido"
              autoComplete="name"
              autoFocus
            />
          </label>
          <button className="button button-primary" type="submit" disabled={!cleanOther}>
            <Check aria-hidden="true" />
            Guardar
          </button>
        </form>
      ) : (
        <button className="who-are-you-other-link" type="button" onClick={() => setShowOther(true)}>
          No estoy en la lista
        </button>
      )}
    </ModelDialog>
  );
}
