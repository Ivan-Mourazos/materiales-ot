// La píldora que se desliza (estilo HeroUI, Iván 26/10/2026: «que vaya así de fluido»). Copiada de
// toldos-testar/src/client/pildoraDeslizante.ts. En cada tira de pestañas, la píldora blanca de la
// elegida pasa de una a otra en vez de saltar. No añade nodos (React manda en los hijos): pone en el
// contenedor la posición y el tamaño de la elegida (--px, --py, --pw, --ph) y el CSS (styles/hero.css)
// dibuja la píldora con un ::before que se mueve con transición.

const CONTENEDORES = '.tira-3d';
const ELEGIDA = ':scope > .pestana-activa';

function colocar(contenedor: HTMLElement) {
  const elegida = contenedor.querySelector<HTMLElement>(ELEGIDA);
  if (!elegida || !elegida.offsetWidth) {
    delete contenedor.dataset.pildora;
    return;
  }
  const s = contenedor.style;
  // Si la tira aún no es el offsetParent de sus botones (la primera vez), se mide con los rectángulos.
  let x = elegida.offsetLeft;
  let y = elegida.offsetTop;
  if (elegida.offsetParent !== contenedor) {
    const a = elegida.getBoundingClientRect();
    const c = contenedor.getBoundingClientRect();
    x = a.left - c.left - contenedor.clientLeft;
    y = a.top - c.top - contenedor.clientTop;
  }
  s.setProperty('--px', `${x}px`);
  s.setProperty('--py', `${y}px`);
  s.setProperty('--pw', `${elegida.offsetWidth}px`);
  s.setProperty('--ph', `${elegida.offsetHeight}px`);
  // La primera vez se coloca sin animar; a partir de ahí, se desliza.
  if (contenedor.dataset.pildora !== 'lista') {
    contenedor.dataset.pildora = 'puesta';
    requestAnimationFrame(() => {
      if (contenedor.dataset.pildora === 'puesta') contenedor.dataset.pildora = 'lista';
    });
  }
}

/** Se llama una vez al arrancar; vigila los cambios de pestaña, de tamaño y la carga de las letras. */
export function iniciarPildoras(raiz: HTMLElement = document.body) {
  let pendiente = 0;
  const todas = () => {
    pendiente = 0;
    raiz.querySelectorAll<HTMLElement>(CONTENEDORES).forEach(colocar);
  };
  const pedir = () => {
    if (!pendiente) pendiente = requestAnimationFrame(todas);
  };
  new MutationObserver(pedir).observe(raiz, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class']
  });
  window.addEventListener('resize', pedir);
  document.fonts?.ready.then(pedir).catch(() => {});
  pedir();
}
