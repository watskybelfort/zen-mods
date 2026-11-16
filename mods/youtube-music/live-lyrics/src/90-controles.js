/* --- El boton de la barra ------------------------------------------- MEDIDO -
   Sin una forma de abrir la letra, todo lo anterior no existe. El boton va en
   #right-controls de ytmusic-player-bar, a la izquierda de #expanding-menu, que
   es donde YTM pone sus propios botones de la derecha (medido: ahi viven el
   deslizador de volumen, el menu expansible y dos yt-icon-button).

   Se pinta un <button> nuestro y no un yt-icon-button: sus elementos son de
   Polymer y crearlos a mano desde fuera obliga a que la clase este registrada y
   a rellenar propiedades internas. Un boton normal con el mismo tamano y la misma
   opacidad se ve identico y no depende de nada suyo. */

const CSS_CONTROLES_HOJA = `
.zen-letra-boton {
  display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; padding: 0; margin: 0 2px;
  background: none; border: 0; border-radius: 50%;
  color: inherit; cursor: pointer;
  opacity: 0.68; transition: opacity 0.15s, background-color 0.15s;
  flex: 0 0 auto;
}
.zen-letra-boton:hover { opacity: 1; background: rgb(255 255 255 / 0.1); }
.zen-letra-boton[data-on="1"] { opacity: 1; }
.zen-letra-boton[data-on="1"]::after {
  content: ''; position: absolute; bottom: 5px;
  width: 4px; height: 4px; border-radius: 50%; background: currentColor;
}
.zen-letra-boton { position: relative; }
.zen-letra-boton svg { width: 22px; height: 22px; fill: currentColor; }

/* --- El aviso ------------------------------------------------------------
   Un ajuste de desfase que no dice en cuanto se quedo es inservible: uno pulsa
   a ciegas hasta que cuadra y no puede volver atras. El aviso flota sobre la
   barra y se va solo. */
.zen-letra-aviso-flotante {
  position: fixed;
  left: 50%;
  transform: translateX(-50%) translateY(6px);
  z-index: 10000;
  padding: 9px 16px;
  border-radius: 10px;
  background: rgb(8 9 11 / 0.9);
  backdrop-filter: blur(20px);
  border: 1px solid rgb(255 255 255 / 0.1);
  font-family: Roboto, Arial, sans-serif;
  font-size: 13px; font-weight: 600;
  color: rgb(255 255 255 / 0.92);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.zen-letra-aviso-flotante[data-ver="1"] { opacity: 1; transform: translateX(-50%) translateY(0); }

/* --- El menu -------------------------------------------------------------
   Un userscript no sale en Ajustes > Zen Mods, asi que sus opciones tienen que
   vivir en algun sitio de la propia pagina o no existen. */
.zen-letra-menu {
  position: fixed;
  z-index: 10001;
  min-width: 272px;
  padding: 6px;
  border-radius: 12px;
  background: rgb(12 13 15 / 0.96);
  backdrop-filter: blur(24px);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
  font-family: Roboto, Arial, sans-serif;
  font-size: 13px;
  color: rgb(255 255 255 / 0.9);
  /* Con quince opciones el menu mide 573px, y hay ventanas donde eso no cabe ni
     encima ni debajo del boton. Cuando pasa, abrir() le pone un max-height y
     esto lo vuelve desplazable en lugar de dejarlo salirse de la pantalla.
     overscroll-behavior para que al llegar al final no empiece a moverse la
     pagina de detras, que es un menu abierto y una lista que se va sola. */
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Con el modelo de caja de contenido, el max-height que calcula abrir() se
     queda corto por el relleno y el borde: pide 566 y el menu mide 580. */
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: rgb(255 255 255 / 0.25) transparent;
}
.zen-letra-menu h4 {
  margin: 8px 10px 5px;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: rgb(255 255 255 / 0.4);
}
.zen-letra-menu button {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 8px 10px;
  background: none; border: 0; border-radius: 8px;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.zen-letra-menu button:hover { background: rgb(255 255 255 / 0.08); }
.zen-letra-menu button[data-on="1"] { color: #fff; }
.zen-letra-menu button[data-on="1"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.zen-letra-menu button:not([data-on])::before,
.zen-letra-menu button[data-on="0"]::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: rgb(255 255 255 / 0.2); }
.zen-letra-menu .zen-letra-tecla { margin-left: auto; font-size: 11px; color: rgb(255 255 255 / 0.35); font-variant-numeric: tabular-nums; }
.zen-letra-menu hr { margin: 6px 8px; border: 0; border-top: 1px solid rgb(255 255 255 / 0.08); }
`;

LV.hojas.push(CSS_CONTROLES_HOJA);

/* --- Avisos --------------------------------------------------------------- */

const Aviso = {
  nodo: null,
  reloj: 0,

  decir(texto) {
    if (!this.nodo) {
      this.nodo = crear('div', c('aviso-flotante'));
      document.body.appendChild(this.nodo);
    }
    const barra = punto('barra');
    this.nodo.style.bottom = `${(barra ? barra.offsetHeight : 72) + 66}px`;
    this.nodo.textContent = texto;
    this.nodo.dataset.ver = '1';
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => { if (this.nodo) this.nodo.dataset.ver = '0'; }, 1600);
  },
};

/* --- Teclado --------------------------------------------------------- MEDIDO -
   TODOS LOS ATAJOS LLEVAN ALT. YouTube Music ya usa las teclas sueltas: espacio
   para pausar, flechas para moverse por la cancion y el volumen, j/k/l para
   saltar, y las cifras para ir al porcentaje de la pista. Coger una tecla suelta
   es quitarle una funcion a la aplicacion, y encima una que el usuario ya tiene
   en los dedos. Con Alt no hay nada que pisar.

   Y no se hace nada si el foco esta escribiendo: con el buscador abierto, una
   letra no puede significar dos cosas. */

const escribiendo = () => {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || a.isContentEditable ||
         (a.getAttribute && a.getAttribute('role') === 'textbox');
};

const PASO_DESFASE = 0.1;

/* SE MIRA e.code Y NO e.key ----------------------------------------- MEDIDO -
   Con Alt pulsado, `key` no trae la letra: trae el caracter que produce esa
   combinacion en la distribucion del teclado, que en varias es un simbolo o una
   tecla muerta. Medido en la prueba automatica: Alt+M no disparaba nada porque
   `key` no valia 'm'. `code` es la posicion fisica de la tecla, no cambia con la
   distribucion ni con los modificadores, y es lo que hay que usar en un atajo. */
const ATAJOS = [
  { codigo: 'KeyL', tecla: 'Alt+L', nombre: 'Abrir o cerrar la letra', hacer: () => { Vistas.alternar(Ajustes.get('vistaPorDefecto') || 'escenario'); Controles.refrescar(); } },
  { codigo: 'KeyP', tecla: 'Alt+P', nombre: 'Panel al lado', hacer: () => { Vistas.alternar('panel'); Controles.refrescar(); } },
  { codigo: 'KeyE', tecla: 'Alt+E', nombre: 'Escenario', hacer: () => { Vistas.alternar('escenario'); Controles.refrescar(); } },
  { codigo: 'KeyF', tecla: 'Alt+F', nombre: 'Pantalla completa', hacer: () => { Vistas.alternar('completa'); Controles.refrescar(); } },
  { codigo: 'KeyM', tecla: 'Alt+M', nombre: 'Mini tira', hacer: () => { Vistas.alternar('tira'); Controles.refrescar(); } },
  { codigo: 'ArrowLeft', tecla: 'Alt+←', nombre: 'La letra, antes', hacer: () => Aviso.decir(explicarDesfase(Letra.ajustarDesfase(-PASO_DESFASE))) },
  { codigo: 'ArrowRight', tecla: 'Alt+→', nombre: 'La letra, despues', hacer: () => Aviso.decir(explicarDesfase(Letra.ajustarDesfase(PASO_DESFASE))) },
  { codigo: 'Digit0', tecla: 'Alt+0', nombre: 'Quitar el ajuste', hacer: () => { Letra.reiniciarDesfase(); Aviso.decir('Desfase a cero'); } },
  {
    codigo: 'KeyR',
    tecla: 'Alt+R',
    nombre: 'Esta no es: prueba otra version',
    hacer: () => {
      const r = Letra.otraVersion();
      Aviso.decir(r ? `Version ${r.actual} de ${r.total}` : 'Buscando otra letra desde cero');
    },
  },
  /* El tamano tambien por teclado: es lo que se toca mientras se escucha, y abrir
     un menu para cada paso rompe justo lo que se estaba haciendo. Se aceptan las
     dos teclas de cada signo, la de la fila de numeros y la del teclado numerico,
     porque en un teclado espanol el + de arriba lleva Shift y con Alt puesto la
     combinacion se vuelve incomoda. */
  { codigo: 'Equal', tecla: 'Alt++', nombre: 'Letra mas grande', hacer: () => subirTamano(4) },
  { codigo: 'NumpadAdd', tecla: 'Alt++', nombre: 'Letra mas grande', hacer: () => subirTamano(4) },
  { codigo: 'Minus', tecla: 'Alt+-', nombre: 'Letra mas pequena', hacer: () => subirTamano(-4) },
  { codigo: 'NumpadSubtract', tecla: 'Alt+-', nombre: 'Letra mas pequena', hacer: () => subirTamano(-4) },
];

const subirTamano = (paso) => {
  const nuevo = limitar((Ajustes.get('tamano') || 44) + paso, 18, 96);
  Ajustes.set('tamano', nuevo);
  aplicarTamano();
  Aviso.decir(`Letra a ${nuevo}px`);
};

/* El signo se explica con palabras y no con un numero pelado: "+0.3s" no dice si
   la letra va antes o despues, y es justo lo unico que uno necesita saber
   mientras lo esta ajustando. */
const explicarDesfase = (d) => {
  if (Math.abs(d) < 0.001) return 'Letra al mismo tiempo que el audio';
  const s = Math.abs(d).toFixed(1);
  return d > 0 ? `Letra ${s}s mas tarde` : `Letra ${s}s antes`;
};

/* El contador no es decoracion: si esto se instalara dos veces, cada pulsacion
   haria el trabajo dos veces — y con el ajuste de desfase eso significa que cada
   paso mueve 0.2s en lugar de 0.1s, que es exactamente lo que midio la prueba.
   Un atajo que hace el doble de lo que dice es un fallo dificil de ver a mano,
   porque el efecto es plausible. */
let vecesTeclado = 0;

const teclaDe = (codigo) => { const a = ATAJOS.find((x) => x.codigo === codigo); return a ? a.tecla : ''; };

const ponerTeclado = () => {
  if (vecesTeclado) { warn('el teclado ya estaba puesto; no se instala otra vez'); return; }
  vecesTeclado++;

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (escribiendo()) return;
    const atajo = ATAJOS.find((a) => a.codigo === e.code);
    if (!atajo) return;
    e.preventDefault();
    e.stopPropagation();
    try { atajo.hacer(); } catch (err) { warn('atajo', atajo.codigo, err); }
  }, true);
};

/* Un icono de letra: lineas de texto de largos distintos, que es como lo dibujan
   todos y se reconoce al instante. Va en SVG propio y no con la fuente de iconos
   de YouTube, que en Windows 10 no siempre esta.

   SE CONSTRUYE CON EL DOM Y NO CON innerHTML ---------------------- MEDIDO -
   YouTube Music sirve la pagina con Trusted Types exigido por CSP
   (require-trusted-types-for). Asignar una cadena a innerHTML ahi lanza
   "This document requires 'TrustedHTML' assignment", y como esto corre en el
   arranque, la excepcion se llevaba por delante el boton, el teclado y el menu de
   golpe. Lo canto el try/catch del arranque, que para esto estaba.

   createElementNS no pasa por el filtro porque no hay cadena que analizar: son
   nodos ya construidos. Y hay que usarlo con el espacio de nombres de SVG —
   createElement('svg') haria un elemento HTML desconocido que no pinta nada. */
const NS_SVG = 'http://www.w3.org/2000/svg';

const icono = () => {
  const svg = document.createElementNS(NS_SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const trazo = document.createElementNS(NS_SVG, 'path');
  trazo.setAttribute('d', 'M4 6h16v2H4zm0 4h11v2H4zm0 4h16v2H4zm0 4h8v2H4z');
  svg.appendChild(trazo);
  return svg;
};

const Controles = {
  boton: null,

  poner() {
    const barra = punto('barraDerecha');
    if (!barra) { log('sin #right-controls: el boton se pondra cuando aparezca'); return false; }
    if (this.boton && this.boton.isConnected) return true;

    const b = crear('button', c('boton'));
    b.type = 'button';
    b.appendChild(icono());
    b.title = 'Letra sincronizada';
    b.setAttribute('aria-label', 'Letra sincronizada');
    b.addEventListener('click', (e) => {
      /* ytmusic-player-bar abre y cierra el reproductor grande con cualquier
         clic que le llegue en burbuja (medido el 16-11-2026 con un raton real
         por BiDi), igual que hacia con el clic derecho (ver abajo). */
      e.stopPropagation();
      /* Con Alt, el menu. Es el modificador de todos los atajos, asi que es el
         que la mano ya asocia con este mod. */
      if (e.altKey) { Menu.alternar(b); return; }
      Vistas.alternar(Ajustes.get('vistaPorDefecto') || 'escenario');
      this.refrescar();
    });
    /* Y con el boton derecho tambien, que es donde lo busca cualquiera.

       SE CORTA LA PROPAGACION, Y preventDefault NO BASTA ------------- MEDIDO -
       Medido en vivo el 2026-08-02, despues de una actualizacion de YouTube
       Music: ytmusic-player-bar escucha `contextmenu` en fase de BURBUJA y abre
       su propio menu de cancion — "Start mix", "Play next", "Add to queue" —,
       un tp-yt-iron-dropdown de 242x514 que ademas corta ahi la propagacion (el
       evento nunca llega a document).

       preventDefault solo cancela el menu del navegador. El de YouTube Music no
       es el del navegador: se abre por codigo y no mira defaultPrevented. Por
       eso salian los dos a la vez, encimados sobre el mismo trozo de pantalla, y
       pulsar una opcion era una loteria.

       Nuestro escuchador esta en el boton, que es descendiente de la barra: en
       burbuja va ANTES que el suyo. Con stopPropagation el de la barra no llega
       a enterarse, y medido asi el dropdown de YouTube ya no aparece. */
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      Menu.alternar(b);
    });

    const menu = punto('menuExpansible');
    if (menu && menu.parentElement === barra) barra.insertBefore(b, menu);
    else barra.insertBefore(b, barra.firstChild);

    this.boton = b;
    /* Si Polymer rehace la barra, el boton vuelve. */
    vigilarMontaje(barra, b, () => {
      const m = punto('menuExpansible');
      if (m && m.parentElement === barra) barra.insertBefore(b, m); else barra.appendChild(b);
    });

    this.refrescar();
    return true;
  },

  refrescar() {
    if (!this.boton) return;
    const abierta = Vistas.abiertas.size > 0;
    this.boton.dataset.on = abierta ? '1' : '0';
    this.boton.setAttribute('aria-pressed', abierta ? 'true' : 'false');
    Menu.refrescar();
  },
};

/* --- El menu --------------------------------------------------------------
   Un userscript no aparece en Ajustes > Zen Mods, que es donde viven las
   opciones de los otros cinco mods del repo. Asi que o sus ajustes estan en la
   propia pagina, o solo existen para quien abra la consola. */

const Menu = {
  nodo: null,

  alternar(ancla) {
    if (this.nodo) { this.cerrar(); return; }
    this.abrir(ancla);
  },

  abrir(ancla) {
    this.nodo = crear('div', c('menu'));

    const titulo = (t) => this.nodo.appendChild(crear('h4', null, { textContent: t }));
    const separador = () => this.nodo.appendChild(crear('hr'));

    const opcion = (texto, tecla, activo, alPulsar) => {
      const b = crear('button');
      b.type = 'button';
      b.appendChild(crear('span', null, { textContent: texto }));
      if (tecla) b.appendChild(crear('span', c('tecla'), { textContent: tecla }));
      if (activo !== null) b.dataset.on = activo ? '1' : '0';
      b.addEventListener('click', (e) => { e.stopPropagation(); alPulsar(); this.refrescar(); });
      this.nodo.appendChild(b);
      return b;
    };

    titulo('Donde sale la letra');
    /* Las teclas que muestra el menu salen de ATAJOS y no escritas otra vez aqui:
       si un dia se cambia un atajo, lo que pone el menu cambia con el. */
    for (const [nombre, etiqueta, codigo] of [
      ['escenario', 'En lugar del video', 'KeyE'],
      ['panel', 'En la columna de al lado', 'KeyP'],
      ['completa', 'Pantalla completa', 'KeyF'],
      ['tira', 'Mini tira sobre la barra', 'KeyM'],
    ]) {
      opcion(etiqueta, teclaDe(codigo), Vistas.estaAbierta(nombre), () => { Vistas.alternar(nombre); Controles.refrescar(); });
    }

    separador();
    titulo('Que suena');
    /* El unico ajuste del menu que no va sobre la letra sino sobre la
       reproduccion. Vive aqui porque un userscript no sale en Ajustes > Zen
       Mods y este es el unico sitio de la pagina donde el mod tiene voz.
       Al encenderlo se reconsidera la cancion que ya esta sonando: si esperara
       a la siguiente, parecería que el interruptor no hace nada. */
    opcion('Poner el video cuando la cancion lo tenga', null, Ajustes.get('preferirVideo') !== false, () => {
      const encendiendo = Ajustes.get('preferirVideo') === false;
      Ajustes.set('preferirVideo', encendiendo);
      if (!encendiendo) { Aviso.decir('Se quedara el audio con la caratula'); return; }
      Video.reconsiderar();
      /* Y si no se puede, se dice por que: sin sesion iniciada YouTube Music no
         deja conmutar, y callarse eso deja al usuario creyendo que es el mod. */
      const e = Video.estado();
      if (!/se puede poner|ya esta sonando/.test(e.dice)) Aviso.decir(e.dice);
    });

    separador();
    titulo('Como se ve');
    opcion('Relleno palabra a palabra', null, Ajustes.get('porPalabra') !== false, () => {
      Ajustes.set('porPalabra', Ajustes.get('porPalabra') === false);
      /* Esto si cambia la forma de las lineas, asi que aqui SI hay que rehacer. */
      for (const e of Motor.escenas) e.poner(Letra.estado());
    });
    /* En pixeles, en pasos de 4. El tope de arriba es alto a proposito: en una
       pantalla grande con la vista completa, 96px se lee desde el sofa. */
    opcion(`Letra mas grande (ahora ${Ajustes.get('tamano') || 44}px)`, teclaDe('Equal'), null, () => subirTamano(4));
    opcion('Letra mas pequena', teclaDe('Minus'), null, () => subirTamano(-4));

    separador();
    titulo('Sincronizacion');
    opcion(explicarDesfase(Letra.desfase()), `${teclaDe('ArrowLeft')} / ${teclaDe('ArrowRight')}`, null, () => {});
    opcion('Quitar el ajuste de esta cancion', teclaDe('Digit0'), null, () => { Letra.reiniciarDesfase(); Aviso.decir('Desfase a cero'); });
    opcion('Esta no es: prueba otra version', teclaDe('KeyR'), null, () => {
      const r = Letra.otraVersion();
      Aviso.decir(r ? `Version ${r.actual} de ${r.total}` : 'Buscando otra letra desde cero');
    });

    separador();
    titulo('Fuentes');
    opcion('LRCLIB — abierta, por lineas', null, Ajustes.get('usarLrclib') !== false, () => Ajustes.set('usarLrclib', Ajustes.get('usarLrclib') === false));
    opcion('Musixmatch — palabra a palabra', null, !!Ajustes.get('usarMusixmatch'), () => {
      const encendiendo = !Ajustes.get('usarMusixmatch');
      Ajustes.set('usarMusixmatch', encendiendo);
      if (!encendiendo) return;
      if (!Ajustes.get('tokenMusixmatch')) { pedirTokenMusixmatch(); return; }
      const via = Red.via();
      if (via !== 'gm' && via !== 'puente') Aviso.decir('Musixmatch necesita gestor de userscripts');
    });
    if (Ajustes.get('usarMusixmatch')) {
      opcion(Ajustes.get('tokenMusixmatch') ? 'Cambiar el token de Musixmatch' : 'Falta el token de Musixmatch', null, null, () => pedirTokenMusixmatch());
    }
    /* Encendida por defecto, al contrario que Musixmatch, porque no pide nada:
       ni token, ni gestor, ni permiso de nadie. Y solo entra cuando no hay letra
       de las otras dos, asi que encenderla no le quita sitio a ninguna. */
    opcion('Subtitulos de YouTube — cuando no la tiene nadie', null, Ajustes.get('usarSubtitulos') !== false, () => {
      const encendiendo = Ajustes.get('usarSubtitulos') === false;
      Ajustes.set('usarSubtitulos', encendiendo);
      Aviso.decir(encendiendo ? 'Se usaran en la proxima cancion sin letra' : 'Subtitulos de YouTube apagados');
    });
    opcion(`Olvidar lo guardado (${Cache.cuantas()})`, null, null, () => { Cache.vaciar(); Aviso.decir('Cache vaciada'); });

    document.body.appendChild(this.nodo);

    /* Colocado respecto al boton, y girado hacia dentro si no cabe: la barra del
       reproductor esta pegada al borde de abajo y a la derecha, asi que el menu
       casi siempre tiene que subir y desplazarse a la izquierda.

       Y SI NO CABE EN NINGUNO DE LOS DOS LADOS, NO SE VOLTEA ------- MEDIDO -
       El menu mide 573px de alto con las opciones por defecto, y una linea mas
       si Musixmatch esta encendido. Medido el 2026-08-02 con la ventana a 640 de
       alto: no cabia encima, asi que el volteo de antes lo mandaba debajo del
       boton, a y=634 sobre un viewport de 640 — 567 de sus 573 pixeles fuera de
       la pantalla. El menu estaba abierto y era invisible e impulsable, que es
       la peor de las formas de fallar porque no parece un fallo.

       Voltear solo vale cuando al otro lado SI cabe. Cuando no cabe en ninguno,
       lo que hay que hacer es quedarse en el lado con mas hueco y recortarse a
       ese hueco: la hoja ya deja el menu desplazable, asi que no se pierde
       ninguna opcion. */
    const MARGEN = 8;   // aire contra el borde de la ventana
    const HUECO = 10;   // separacion entre el boton y el menu

    const r = ancla.getBoundingClientRect();
    const m = this.nodo.getBoundingClientRect();

    const x = Math.min(Math.max(MARGEN, r.left + r.width / 2 - m.width / 2), window.innerWidth - m.width - MARGEN);

    const sitioEncima = r.top - HUECO - MARGEN;
    const sitioDebajo = window.innerHeight - r.bottom - HUECO - MARGEN;

    let y;
    if (m.height <= sitioEncima) y = r.top - m.height - HUECO;
    else if (m.height <= sitioDebajo) y = r.bottom + HUECO;
    else if (sitioEncima >= sitioDebajo) { this.nodo.style.maxHeight = `${Math.round(sitioEncima)}px`; y = MARGEN; }
    else { this.nodo.style.maxHeight = `${Math.round(sitioDebajo)}px`; y = r.bottom + HUECO; }

    this.nodo.style.left = `${Math.round(x)}px`;
    this.nodo.style.top = `${Math.round(y)}px`;

    /* Se cierra al pulsar fuera. En el frame siguiente, porque el clic que lo
       abrio todavia esta subiendo por el arbol y lo cerraria al instante. */
    setTimeout(() => {
      this._fuera = (ev) => { if (this.nodo && !this.nodo.contains(ev.target) && ev.target !== ancla) this.cerrar(); };
      document.addEventListener('pointerdown', this._fuera, true);
    }, 0);
  },

  cerrar() {
    if (this._fuera) document.removeEventListener('pointerdown', this._fuera, true);
    this._fuera = null;
    if (this.nodo) this.nodo.remove();
    this.nodo = null;
  },

  /* Pulsar una opcion rehace el menu entero, que es lo que hace que la opcion
     de al lado se entere del cambio. Pero si el menu venia recortado y
     desplazado, rehacerlo lo devolvia arriba del todo: uno pulsaba "Letra mas
     grande" y la opcion se le iba de debajo del raton. Por eso se guarda por
     donde iba y se vuelve a dejar ahi. */
  refrescar() {
    if (!this.nodo) return;
    const ancla = Controles.boton;
    const porDonde = this.nodo.scrollTop;
    this.cerrar();
    if (!ancla) return;
    this.abrir(ancla);
    this.nodo.scrollTop = porDonde;
  },
};

/* El token se pide con un prompt del navegador y no con un campo dentro del menu.
   Un campo de texto propio obliga a manejar foco, pegado y validacion, y esto se
   hace una vez en la vida de la instalacion. Lo que si hace falta es DECIR de
   donde sale el token, porque nadie lo sabe de memoria. */
const pedirTokenMusixmatch = () => {
  const actual = Ajustes.get('tokenMusixmatch') || '';
  const puesto = window.prompt(
    'Token de usuario de Musixmatch.\n\n' +
    'Se saca de la aplicacion de escritorio de Musixmatch: Ctrl+Shift+I para abrir las\n' +
    'herramientas, pestana Red, Ctrl+R para recargar, se filtra por "apic" y el token\n' +
    'esta en los parametros de cualquiera de esas peticiones.\n\n' +
    'Ojo: la API no es oficial y usarla asi va contra sus condiciones de uso. Con el\n' +
    'token vacio, esta fuente se apaga y solo se usa LRCLIB.',
    actual,
  );
  if (puesto === null) return;                       // canceló
  const limpio = puesto.trim();
  Ajustes.set('tokenMusixmatch', limpio);
  if (!limpio) { Ajustes.set('usarMusixmatch', false); Aviso.decir('Musixmatch apagado'); return; }
  Aviso.decir('Token guardado. Se usara en la proxima cancion');
};

const aplicarTamano = () => {
  /* Cada escena aplica el suyo con su propio factor: el panel es la mitad que el
     escenario y la pantalla completa un tercio mas. Poner el mismo numero en las
     cuatro es lo que hacia antes, y dejaba la columna estrecha del panel con
     letra de vista completa. */
  for (const e of Motor.escenas) if (e.aplicarTamano) e.aplicarTamano();
  /* El tamano cambia el alto de las lineas, asi que el centrado calculado deja
     de valer y hay que recolocar. */
  for (const e of Motor.escenas) { if (e._ajustarAire) e._ajustarAire(); e.iActiva = -1; }
  Motor.despertar();
};
