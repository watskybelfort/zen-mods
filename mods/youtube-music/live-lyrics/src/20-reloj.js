/* --- El reloj -------------------------------------------------------- MEDIDO -
   Contra esto se cronometra todo. Es el `currentTime` del elemento de video, y
   tiene tres trampas que hay que resolver aqui y no en el render.

   TRAMPA 1: LOS ANUNCIOS. Medido en vivo: mientras suena un anuncio,
   #movie_player lleva las clases `ad-showing` y `ad-interrupting`, y el
   currentTime del video es el DEL ANUNCIO, empezando por cero. Si el reloj no
   lo distingue, en cada corte publicitario la letra salta al principio y
   vuelve a correr sola. Y la duracion tambien es la del anuncio, que es lo que
   usamos para elegir la version correcta de la letra: con un anuncio de 15s
   delante, la busqueda pediria una cancion de 15 segundos.

   Mientras hay anuncio el reloj se congela en el ultimo tiempo bueno y avisa
   del estado. No se pone a cero: al volver del anuncio la cancion sigue donde
   estaba, asi que congelar es lo que hace que no se note el corte.

   TRAMPA 2: currentTime NO AVANZA A 60 FPS. Gecko lo actualiza cuando llega
   un frame de media, no cuando se pinta la pagina. Si el relleno de la palabra
   leyera el valor crudo, avanzaria a escalones y el efecto se ve como una
   cinta que tirita. Por eso el reloj extrapola: guarda el ultimo valor real
   con su marca de performance.now() y, entre lectura y lectura, suma el tiempo
   transcurrido por la velocidad de reproduccion. Cuando llega un valor real se
   resincroniza.

   TRAMPA 3: LOS SALTOS. Si el usuario arrastra la barra de progreso, la
   extrapolacion queda invalidada de golpe. Un salto se detecta porque el valor
   real se aparta del extrapolado mas de lo que cabe en un frame, y entonces el
   reloj lo anuncia para que el render deje de animar y se replante en la linea
   nueva en lugar de recorrer el camino con easing.

   TRAMPA 4: EL <video> NO SE REINICIA ENTRE PISTAS. En una cola de radio
   (`list=RDAMVM...`) YTM sirve varias canciones seguidas sobre el MISMO
   MediaSource: el elemento no se reconstruye al cambiar de tema y su
   currentTime no vuelve a cero, sigue contando. Medido en vivo el 2026-08-06
   sobre la radio de "Panamiur (Remix)": el <video> decia currentTime 612s y
   duration 665.9s mientras la barra de YTM ensenaba 2:56 de 3:50. El desfase es
   el mismo en los dos numeros —436s—, que es donde empieza la pista dentro del
   flujo cosido.

   Leer el <video> en crudo rompe DOS cosas a la vez, y la segunda no parece un
   fallo del reloj: la letra saldria 436 segundos adelantada, y la busqueda
   pediria una cancion de 11 minutos que no existe, asi que ninguna version pasa
   el filtro de duracion de 50-lrclib.js y el panel dice "nadie tiene la letra"
   teniendola LRCLIB con la duracion correcta.

   El reproductor si sabe el tiempo bueno: en ese mismo instante
   #movie_player.getCurrentTime() daba 215.5s y getDuration() 229.6s, que es lo
   que ensena la barra y lo que casa con LRCLIB (229-230s). Son metodos que
   cuelga el codigo de YouTube, no propiedades del DOM, asi que hay que
   atravesar los rayos X igual que en 57-subtitulos.js. El <video> se queda de
   respaldo entero: si un dia esos metodos no estan, el reloj vuelve a lo de
   antes, que en reproduccion normal —una cancion abierta suelta— era y sigue
   siendo correcto. */

/* Cuanto se le permite al reloj adelantarse al ultimo valor real del video.
   Milisegundos de sobra para tapar el hueco entre frames de media; cualquier cosa
   por encima ya no es suavizado, es invencion. */
const TOPE_ADELANTO = 1;

const Reloj = {
  _video: null,
  _ultimoReal: 0,        // ultimo currentTime que dio el video
  _marcaReal: 0,         // performance.now() de ese momento
  _congelado: 0,         // tiempo bueno guardado mientras hay anuncio
  _anuncio: false,
  _duracion: 0,          // solo se escribe cuando NO hay anuncio
  _oyentesSalto: new Set(),
  _mpNodo: null,         // el #movie_player que ya inspeccionamos
  _mpApi: null,          // ese mismo, con los rayos X atravesados (TRAMPA 4)

  /* El reproductor con sus metodos a la vista, o null si esta build no los da.
     Se resuelve una vez por nodo y no en cada frame: atravesar los rayos X es
     barato pero no gratis, y el reloj pregunta sesenta veces por segundo.

     `wrappedJSObject` es la puerta al objeto real de la pagina. Con gestor de
     userscripts el codigo corre en un sandbox con vision de rayos X, que ensena
     el DOM pero esconde lo que el codigo de la pagina le colgo encima: sin
     atravesarlos, getCurrentTime no aparece. Con el cargador nativo no hay
     rayos X y el propio elemento ya sirve. De ahi el `|| mp`, que cubre los dos
     casos sin preguntar cual es. Mismo trato que en 57-subtitulos.js. */
  _api() {
    const mp = punto('moviePlayer');
    if (!mp) return null;
    if (mp !== this._mpNodo) {
      this._mpNodo = mp;
      let crudo = mp;
      try { if (mp.wrappedJSObject) crudo = mp.wrappedJSObject; } catch (e) { /* no hay rayos X */ }
      this._mpApi = typeof crudo.getCurrentTime === 'function' ? crudo : null;
      if (!this._mpApi) warn('el reproductor no da getCurrentTime: el reloj se cae al <video>');
    }
    return this._mpApi;
  },

  /* El tiempo REAL de la pista, sin extrapolar. Del reproductor si contesta, y
     del <video> si no. Es el unico sitio donde se decide de donde sale. */
  _leerTiempo() {
    const api = this._api();
    if (api) {
      try {
        const t = api.getCurrentTime();
        if (Number.isFinite(t)) return t;
      } catch (e) { /* se cae al <video> */ }
    }
    const v = this.video();
    return v ? v.currentTime : 0;
  },

  /* El elemento se vuelve a pedir si el que teniamos se desconecto. YTM
     reconstruye el reproductor al cambiar entre cancion y video, y un nodo
     desconectado sigue respondiendo currentTime: el ultimo que tuvo. O sea que
     el reloj se quedaria clavado sin dar ningun error. */
  video() {
    if (!this._video || !this._video.isConnected) {
      this._video = punto('video');
      if (this._video) this._enganchar(this._video);
    }
    return this._video;
  },

  _enganchar(v) {
    /* LA MARCA SE PONE AQUI, Y ESTO ARREGLA UN FALLO REPORTADO EN USO -- MEDIDO -
       Naciendo las dos en cero, habia un caso que rompia todo: en el instante de
       un cambio de pista, currentTime vale CERO EXACTO. Como el valor no ha
       cambiado respecto al inicial, la rama que actualiza la marca no entraba, y
       la extrapolacion se hacia desde el cero absoluto — o sea que devolvia
       performance.now() entero, que son los segundos que lleva abierta la
       pestana. Con la pestana abierta diez minutos, el reloj decia 600s y la letra
       aparecia directamente en la ultima linea.

       El sintoma reportado fue exactamente ese: "hay temas en los que la letra
       aparece directamente al final". Solo pasaba en las canciones donde la
       primera lectura caia justo en el cero, que es lo que lo hacia parecer
       aleatorio. Comprobado en dev/tools/probar-reloj.mjs. */
    this._ultimoReal = this._leerTiempo();
    this._marcaReal = performance.now();

    v.addEventListener('seeked', () => this._resincronizar(true));
    v.addEventListener('playing', () => this._resincronizar(false));
    v.addEventListener('ratechange', () => this._resincronizar(false));
    v.addEventListener('durationchange', () => this._leerDuracion());
    this._leerDuracion();
  },

  _leerDuracion() {
    if (this._anuncio) return;                       // TRAMPA 1
    const api = this._api();                         // TRAMPA 4
    if (api) {
      try {
        const d = api.getDuration();
        if (Number.isFinite(d) && d > 1) { this._duracion = d; return; }
      } catch (e) { /* se cae al <video> */ }
    }
    const v = this.video();
    if (v && Number.isFinite(v.duration) && v.duration > 1) this._duracion = v.duration;
  },

  _resincronizar(esSalto) {
    const v = this.video();
    if (!v) return;
    this._ultimoReal = this._leerTiempo();
    this._marcaReal = performance.now();
    if (esSalto) for (const f of this._oyentesSalto) { try { f(); } catch (e) { warn(e); } }
  },

  alSaltar(f) { this._oyentesSalto.add(f); return () => this._oyentesSalto.delete(f); },

  /* Se llama una vez al arrancar. Observa el atributo class de #movie_player
     en lugar de leerlo en cada frame: el estado de anuncio cambia dos veces por
     corte, no sesenta veces por segundo. */
  vigilarAnuncios() {
    const mp = punto('moviePlayer');
    if (!mp) { warn('sin #movie_player: no se pueden distinguir los anuncios'); return; }

    const leer = () => {
      const hay = mp.classList.contains('ad-showing') || mp.classList.contains('ad-interrupting');
      if (hay === this._anuncio) return;
      this._anuncio = hay;
      if (hay) {
        this._congelado = this._tiempoCrudo();
        log('anuncio: reloj congelado en', this._congelado.toFixed(2));
      } else {
        /* Al salir del anuncio el video vuelve a la cancion pero currentTime
           tarda un frame o dos en reflejarlo. Resincronizar aqui evita un
           parpadeo de la letra en el punto de vuelta. */
        this._resincronizar(true);
        this._leerDuracion();
        log('fin del anuncio: reloj suelto');
      }
    };

    new MutationObserver(leer).observe(mp, { attributes: true, attributeFilter: ['class'] });
    leer();
  },

  _tiempoCrudo() {
    const v = this.video();
    if (!v) return 0;

    const real = this._leerTiempo();
    const ahora = performance.now();

    /* TRAMPA 2: extrapolar entre lecturas reales. */
    if (real !== this._ultimoReal) {
      const previsto = this._ultimoReal + ((ahora - this._marcaReal) / 1000) * (v.playbackRate || 1);
      /* TRAMPA 3: un salto es apartarse mas de lo que cabe entre dos frames de
         media. 0.35s es holgado para 24 fps y estrecho para un arrastre de
         barra, que mueve segundos. */
      if (Math.abs(real - previsto) > 0.35) {
        for (const f of this._oyentesSalto) { try { f(); } catch (e) { warn(e); } }
      }
      this._ultimoReal = real;
      this._marcaReal = ahora;
      return real;
    }

    if (v.paused) return this._ultimoReal;

    /* DOS TOPES A LA EXTRAPOLACION. Adelantarse unas decimas es para lo que
       esta — tapa el escalon entre frame y frame de media. Adelantarse mas es
       siempre un error, porque significa que el video lleva un rato sin refrescar
       currentTime: pestana en segundo plano, decodificacion atascada o buffer
       vacio. Sin tope, el reloj se inventa un tiempo que no existe y la letra se
       va al final de la cancion. Y nunca por encima de la duracion, que es un
       limite que el propio medio no puede pasar. */
    const adelanto = Math.min(((ahora - this._marcaReal) / 1000) * (v.playbackRate || 1), TOPE_ADELANTO);
    const previsto = this._ultimoReal + adelanto;
    return this._duracion ? Math.min(previsto, this._duracion) : previsto;
  },

  /* El tiempo de la CANCION en segundos, que es lo unico que el render
     necesita saber. Con anuncio devuelve el congelado. */
  tiempo() { return this._anuncio ? this._congelado : this._tiempoCrudo(); },

  /* Se relee en cada consulta y no solo con `durationchange`. Con la cola
     cosida (TRAMPA 4) ese evento no vuelve a saltar al cambiar de pista —el
     medio es el mismo—, asi que la duracion guardada seria la de la cancion
     anterior justo cuando 50-lrclib.js la necesita para elegir version. */
  duracion() { this._leerDuracion(); return this._duracion; },

  estado() {
    const v = this.video();
    if (!v) return 'sin-video';
    if (this._anuncio) return 'anuncio';
    return v.paused ? 'pausa' : 'sonando';
  },

  /* Los segundos que entran son de la CANCION, no del flujo. Con la cola cosida
     (TRAMPA 4) escribirlos en v.currentTime mandaria el reproductor 436
     segundos atras, o sea a otra cancion: por eso el salto va por seekTo, que
     habla en el mismo tiempo que getCurrentTime. El <video> sigue de respaldo
     para el caso sin cosido, donde los dos tiempos coinciden. */
  buscar(segundos) {
    const v = this.video();
    if (!v || this._anuncio) return false;      // durante un anuncio, ni tocarlo
    const destino = Math.max(0, segundos);
    const api = this._api();
    let hecho = false;
    if (api && typeof api.seekTo === 'function') {
      try { api.seekTo(destino, true); hecho = true; } catch (e) { /* se cae al <video> */ }
    }
    if (!hecho) v.currentTime = destino;
    this._resincronizar(true);
    return true;
  },
};
