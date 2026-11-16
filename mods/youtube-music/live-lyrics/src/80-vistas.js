/* --- Las vistas -----------------------------------------------------------
   Cada vista es un sitio donde colgar una Escena. El registro existe para que
   anadir una vista sea escribir una definicion y nada mas: el motor, el estado y
   los controles no se enteran de cuantas hay.

   Una definicion tiene:
     anfitrion()  -> el elemento de YouTube Music donde va colgada
     colocar(raiz, anfitrion) -> deja la raiz donde tenga que estar
     escena       -> opciones de la Escena (tamano, velo, clase)
     exclusiva    -> si al abrirla se cierran las demas (todas menos la tira)

   POR QUE SE SUPERPONE Y NO SE SUSTITUYE. La vista escenario tapa la caratula y
   el video, que es lo que se pidio, pero el elemento de video NO se oculta: sigue
   ahi debajo, reproduciendo. Ocultarlo es la via rapida a que YouTube Music pare
   la reproduccion o deje de decodificar, y ademas es lo que hace que al cerrar la
   letra el video vuelva negro. Tapar con un velo opaco se ve igual y no toca
   nada de su maquinaria. */

const Vistas = {
  registro: new Map(),
  abiertas: new Set(),
  _observadores: new Map(),

  registrar(nombre, def) { this.registro.set(nombre, def); },

  _asegurarPosicionado(anfitrion) {
    /* Una superposicion absoluta necesita un ancestro posicionado. Si el
       anfitrion de YTM es `static`, la nuestra se colocaria respecto al primer
       ancestro que si lo este — normalmente el body — y aparece en cualquier
       sitio menos donde toca. Se comprueba y solo se toca si hace falta. */
    if (getComputedStyle(anfitrion).position === 'static') anfitrion.style.position = 'relative';
  },

  abrir(nombre) {
    const def = this.registro.get(nombre);
    if (!def) { warn('vista desconocida:', nombre); return false; }

    if (def.exclusiva !== false) for (const otra of [...this.abiertas]) {
      const d = this.registro.get(otra);
      if (d && d.exclusiva !== false) this.cerrar(otra);
    }

    const anfitrion = def.anfitrion();
    if (!anfitrion) { log('la vista', nombre, 'no tiene donde colgarse todavia'); return false; }

    if (!def._escena) {
      /* `crear` existe para las vistas que no son una lista con scroll. La mini
         tira trae el suyo; lo unico que se le exige es la misma interfaz que
         espera el Motor: construir, poner, pintar y mostrar. */
      def._escena = def.crear ? def.crear() : new Escena(nombre, def.escena || {});
      Motor.anadir(def._escena);
    }
    const raiz = def._escena.construir();

    /* Una vista fija no necesita ancestro posicionado, y tocarle la posicion al
       anfitrion cuando no hace falta es cambiar la maquetacion de YouTube Music
       para nada. */
    if (def.fijo !== true) this._asegurarPosicionado(anfitrion);
    const montar = () => def.colocar(raiz, anfitrion);
    montar();

    /* Polymer rehace sus contenedores al navegar y se lleva por delante lo que
       le hayamos metido. Sin esto, la letra desaparece sola al volver de una
       busqueda y parece que el mod se cayo. */
    if (!this._observadores.has(nombre)) this._observadores.set(nombre, vigilarMontaje(anfitrion, raiz, montar));

    if (def.alAbrir) def.alAbrir(raiz, anfitrion);
    def._escena.poner(Letra.estado());
    def._escena.mostrar(true);
    this.abiertas.add(nombre);
    Almacen.escribir('vistas-abiertas', [...this.abiertas]);
    log('vista abierta:', nombre);
    return true;
  },

  cerrar(nombre) {
    const def = this.registro.get(nombre);
    if (!def || !def._escena) return;
    def._escena.mostrar(false);
    if (def.alCerrar) def.alCerrar(def._escena.raiz);
    const obs = this._observadores.get(nombre);
    if (obs) { obs.disconnect(); this._observadores.delete(nombre); }
    if (def._escena.raiz && def._escena.raiz.isConnected) def._escena.raiz.remove();
    this.abiertas.delete(nombre);
    Almacen.escribir('vistas-abiertas', [...this.abiertas]);
  },

  alternar(nombre) {
    if (this.abiertas.has(nombre)) { this.cerrar(nombre); return false; }
    return this.abrir(nombre);
  },

  estaAbierta(nombre) { return this.abiertas.has(nombre); },

  /* Si habia una vista puesta la sesion anterior, se vuelve a poner. Que la
     letra siga donde la dejaste es la mitad de la sensacion de que esto es parte
     de la aplicacion y no un anadido.

     MENOS LA PANTALLA COMPLETA, Y ESTO SE APRENDIO A GOLPES. Restaurandola,
     abrir YouTube Music te planta una superposicion sobre TODA la ventana antes
     de haber puesto una cancion, con la barra del reproductor debajo y sin nada
     que sugiera como salir. La primera vez que paso fue en la prueba automatica,
     que no consiguio pulsar el boton porque la vista restaurada le interceptaba
     el raton — o sea que el sintoma es literalmente "la aplicacion no responde".
     Ninguna aplicacion restaura un modo inmersivo al arrancar, y por esto. */
  restaurar() {
    const guardadas = Almacen.leer('vistas-abiertas', []) || [];
    for (const n of guardadas) {
      const def = this.registro.get(n);
      if (def && def.noRestaurar) { log('no se restaura', n, 'a proposito'); continue; }
      this.abrir(n);
    }
  },
};

/* --- Vista panel ---------------------------------------------------- MEDIDO -
   En la columna de la derecha, encima del contenido de la pestana. Es la que
   menos molesta: deja la caratula o el video a la vista y la letra al lado.

   Va colgada de #side-panel y NO de la pestana de letra de YTM, por lo medido en
   10-puntos.js: esa pestana sale `disabled` cuando la app no tiene letra propia,
   o sea justo cuando este mod hace falta.

   El desplazamiento vertical sale del alto real de la fila de pestanas (48px
   medidos) en lugar de un numero escrito a mano: si un dia YTM cambia el alto de
   esa fila, esto se ajusta solo. */
Vistas.registrar('panel', {
  anfitrion: () => punto('panelLateral'),
  /* Media parte del tamano de referencia: la columna es estrecha y a tamano
     completo casi ninguna linea cabe sin partirse en dos. */
  escena: { factor: 0.5, velo: true, clase: c('panel') },
  colocar: (raiz, anfitrion) => {
    const pestanas = punto('pestanas');
    const arriba = pestanas ? pestanas.offsetHeight : 48;
    Object.assign(raiz.style, {
      position: 'absolute',
      left: '0', right: '0', bottom: '0',
      top: `${arriba}px`,
      zIndex: '3',
      borderRadius: '8px',
      padding: '0 1.2rem',
    });
    anfitrion.appendChild(raiz);
  },
  /* El atributo va en la pagina del reproductor y no en el panel lateral porque
     es donde puede engancharlo una regla de CSS que llegue a #tab-renderer sin
     depender de la jerarquia exacta de en medio. */
  alAbrir: () => { const pp = punto('paginaReproductor'); if (pp) pp.setAttribute('zen-letra-panel', ''); },
  alCerrar: () => { const pp = punto('paginaReproductor'); if (pp) pp.removeAttribute('zen-letra-panel'); },
});
