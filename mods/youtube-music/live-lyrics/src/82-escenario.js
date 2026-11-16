/* --- Vista escenario ------------------------------------------------ MEDIDO -
   La que se pidio: ocupa el sitio donde sale la cancion y el video, con las
   lineas grandes y centradas, y deja la barra del reproductor y la navegacion
   donde estan.

   Va colgada de #main-panel (medido 781x1037 con la ventana a 1500), que es el
   contenedor de la caratula y el video dentro de la pagina del reproductor. Se
   superpone con inset 0: el elemento de video sigue debajo, reproduciendo. Eso
   no es pereza — ocultarlo es la via rapida a que YouTube Music deje de
   decodificar o pare, y encima el blur del velo, al muestrear lo que hay detras,
   convierte el propio video en el fondo difuminado de la letra. Sale gratis y es
   exactamente el fondo que usan Apple Music y Spotify. */

const CSS_ESCENARIO = `
.zen-letra-escenario {
  padding: 0 clamp(24px, 5%, 64px);
  border-radius: 10px;
}
/* El tamano que pide el usuario, con suelo y techo. El techo va en cqw — ancho
   del contenedor — para que en una ventana estrecha las lineas no se partan
   todas en dos.

   EL TOPE NO PUEDE MANDAR EN EL CASO NORMAL, que es el error que se cometio dos
   veces seguidas. Con 4.6cqw, un escenario de 679px recortaba a 26px una letra
   pedida de 44px; con 6cqw la recortaba a 36px. En los dos casos el tope decidia
   SIEMPRE, asi que el ajuste del usuario no movia nada en esta vista y el control
   parecia roto. Con 9cqw el tope solo entra por debajo de unos 490px de ancho, que
   es la ventana estrecha para la que estaba pensado; por encima manda lo que pide
   el usuario, que es lo que tiene que pasar. */
.zen-letra-escenario .zen-letra-l,
.zen-letra-completa .zen-letra-l {
  font-size: clamp(22px, 9cqw, var(--zl-tamano));
  text-wrap: balance;
}
.zen-letra-escenario, .zen-letra-completa { container-type: inline-size; }

.zen-letra-completa {
  padding: 0 clamp(32px, 12vw, 224px);
}
`;

LV.hojas.push(CSS_ESCENARIO);

Vistas.registrar('escenario', {
  anfitrion: () => punto('panelPrincipal'),
  /* La referencia: el tamano que elige el usuario es exactamente este. */
  escena: { factor: 1, velo: true, clase: c('escenario') },
  colocar: (raiz, anfitrion) => {
    Object.assign(raiz.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '4',
    });
    anfitrion.appendChild(raiz);
  },
});

/* --- Vista pantalla completa ----------------------------------------------
   Solo la letra, encima de todo. No usa la API de pantalla completa del
   navegador a proposito: en Zen eso pondria un fondo negro opaco del compositor
   y se perderia el acrilico de la ventana, que es justo lo que hace que esto se
   vea como se ve. Una superposicion fija sobre toda la ventana da lo mismo por
   fuera y conserva el cristal.

   Tapa tambien la barra del reproductor, asi que se sale con Escape — y lo dice,
   porque una pantalla de la que no se sabe salir es una trampa. */

const ESCAPE = {
  handler: null,
  poner(alSalir) {
    this.quitar();
    this.handler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); alSalir(); } };
    /* En captura: YouTube Music tiene sus propios oyentes de teclado y algunos
       paran la propagacion antes de que llegue al documento. */
    document.addEventListener('keydown', this.handler, true);
  },
  quitar() {
    if (this.handler) document.removeEventListener('keydown', this.handler, true);
    this.handler = null;
  },
};

Vistas.registrar('completa', {
  anfitrion: () => punto('app') || document.body,
  /* Un tercio mas grande que el escenario: hay toda la ventana para gastar. */
  escena: { factor: 1.35, velo: true, clase: c('completa'), mascara: true },
  colocar: (raiz, anfitrion) => {
    Object.assign(raiz.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
    });
    anfitrion.appendChild(raiz);
  },
  /* Fija respecto a la ventana: no hay que tocarle la posicion al anfitrion. */
  fijo: true,
  /* Y no se restaura al arrancar. El motivo, en Vistas.restaurar. */
  noRestaurar: true,
  alAbrir: (raiz) => {
    ESCAPE.poner(() => { Vistas.cerrar('completa'); Controles.refrescar(); });
    /* Se comprueba antes de anadirla: la raiz de la escena se reutiliza entre
       aperturas, asi que sin esto se iria acumulando una pista por cada vez que
       se abre la vista. */
    if (!raiz.querySelector(`.${c('salida')}`)) {
      raiz.appendChild(crear('div', c('salida'), { textContent: tr('Esc to exit', 'Esc para salir') }));
    }
  },
  alCerrar: () => ESCAPE.quitar(),
});
