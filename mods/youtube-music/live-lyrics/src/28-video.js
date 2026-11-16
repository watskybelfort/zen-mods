/* --- El videoclip, cuando la cancion lo tiene ---------------------- MEDIDO -
   YouTube Music sirve por defecto el ART TRACK: el audio del canal automatico
   "- Topic", con la caratula fija. Cuando el tema tiene ademas videoclip, la
   aplicacion no lo pone sola — ofrece un conmutador Song/Video y hay que
   pulsarlo cancion por cancion. Ese es justo el gesto que un mod puede quitar
   de en medio, porque es siempre el mismo y siempre en el mismo sitio.

   Medido en vivo el 2026-08-02 sobre music.youtube.com. El conmutador es
   `ytmusic-av-toggle`, vive dentro de `#av-id` en `#main-panel`, y lleva su
   estado entero en atributos, que es lo que lo hace legible sin tocar nada:

     playback-mode                    ATV_PREFERRED | OMV_PREFERRED | NONE
     toggle-disabled                  presente = no se puede conmutar
     audio-only-playback-available    presente = existe la version de solo audio
     is-video-playback-mode-selected  cual de los dos esta puesto ahora

   Dentro hay dos botones, `button.song-button` y `button.video-button`.
   Cambiar es pulsar el segundo: no hay API, y no hace falta que la pagina del
   reproductor este abierta — el elemento existe y responde con el reproductor
   minimizado, medido con su rectangulo a 0x0.

   SIN SESION ESTO NO FUNCIONA, Y NO ES UN FALLO NUESTRO ----------- MEDIDO -
   Sin cuenta iniciada, `toggle-disabled` sale puesto en las tres pistas
   probadas — incluida una con `audio-only-playback-available` presente, o sea
   que la contrapartida existia y aun asi estaba bloqueado. Lo decide YouTube
   Music. Por eso `estado()` distingue "esta cancion no tiene video" de "no se
   puede conmutar": son dos cosas distintas, y solo una de las dos tiene
   arreglo por parte de quien lo usa. */

const VIDEO_SONDEO_MS = 300;      // cada cuanto se mira mientras la pista se asienta
const VIDEO_VENTANA_MS = 12000;   // cuanto se insiste antes de dejarlo estar
const VIDEO_MEMORIA = 60;         // pistas recordadas para no forzar dos veces

const Video = {
  _reloj: 0,
  _hasta: 0,
  _pista: null,
  /* Las pistas ya atendidas. Existe por una razon concreta: si el usuario
     vuelve a "Song" a mano, la pista de audio vuelve a aparecer como cambio de
     tema, y sin memoria el mod la empujaria otra vez al video. Una pelea con el
     usuario es peor que no hacer nada. Se acota porque una cola larga no puede
     hacer crecer esto sin fin, y olvidar lo viejo es justo lo que se quiere:
     la misma cancion, mañana, vuelve a merecer su videoclip. */
  _atendidas: new Set(),
  _orden: [],

  conmutador() { return punto('conmutadorAV'); },

  /* Todo lo que se puede saber sin tocar nada. */
  lectura() {
    const t = this.conmutador();
    if (!t) return { conmutador: false };
    return {
      conmutador: true,
      modo: t.getAttribute('playback-mode') || '',
      enVideo: t.getAttribute('is-video-playback-mode-selected') === 'true',
      bloqueado: t.hasAttribute('toggle-disabled'),
      hayAudioDetras: t.hasAttribute('audio-only-playback-available'),
      hayBoton: !!t.querySelector('button.video-button'),
    };
  },

  /* Por que esta como esta, con palabras. Es lo que sale por
     window.__zenLetra.estado() y lo unico que permite distinguir desde fuera
     un tema sin videoclip de una sesion sin iniciar. */
  estado() {
    const l = this.lectura();
    if (!Ajustes.get('preferirVideo')) return { puesto: false, dice: 'apagado en el menu' };
    if (!l.conmutador) return { puesto: true, dice: 'no encuentro el conmutador de YouTube Music' };
    if (l.enVideo) return { puesto: true, dice: 'ya esta sonando el video', modo: l.modo };
    if (l.modo === 'NONE') return { puesto: true, dice: 'esta cancion no tiene video', modo: l.modo };
    if (l.bloqueado) {
      return {
        puesto: true,
        modo: l.modo,
        dice: l.hayAudioDetras
          ? 'YouTube Music no deja conmutar: lo tipico es no tener la sesion iniciada'
          : 'esta cancion no tiene video',
      };
    }
    return { puesto: true, dice: 'hay video y se puede poner', modo: l.modo };
  },

  /* --- Los anuncios ------------------------------------------------ MEDIDO -
     Durante un anuncio no se toca NADA: el conmutador es el de la cancion que
     viene, no el del anuncio, y pulsarlo ahi es pedirle a la aplicacion que
     recargue en mitad de un corte publicitario.

     Y NO BASTA CON PREGUNTARLE AL RELOJ. El reloj se entera de los anuncios por
     sondeo, asi que entre que empieza uno y el reloj lo sabe hay una ventana —
     y esa ventana es exactamente cuando esto se dispara, porque al empezar el
     anuncio la aplicacion cambia mediaSession al anuncio y eso llega aqui como
     cambio de tema. Medido: el titulo pasaba a "Con Bion3 fortalece las
     defensas naturales de tu organismo". La primera version preguntaba solo al
     reloj y pulsaba el videoclip con el anuncio en marcha; lo canto la prueba
     que ponia la clase y miraba el mismo tick. La clase se lee en vivo, que no
     tiene retardo y cuesta lo mismo. */
  hayAnuncio() {
    if (Reloj.estado() === 'anuncio') return true;
    const mp = punto('moviePlayer');
    return !!mp && (mp.classList.contains('ad-showing') || mp.classList.contains('ad-interrupting'));
  },

  /* Se pulsa el boton y ya esta. Devuelve si se llego a pulsar, que es lo que
     decide si hay que avisar al usuario: un salto de la reproduccion sin
     explicacion se lee como un fallo de YouTube Music. */
  poner() {
    const t = this.conmutador();
    if (!t) return false;
    const boton = t.querySelector('button.video-button');
    if (!boton) return false;
    try { boton.click(); } catch (e) { warn('no se pudo pulsar el video:', e && e.message); return false; }
    return true;
  },

  /* --- El intento, que es lo unico con algo de logica --------------------
     Tras un cambio de pista, YouTube Music tarda en dejar los atributos del
     conmutador en su sitio: al principio no hay elemento, luego lo hay con el
     modo vacio, y solo despues aparece si tiene contrapartida. Por eso esto no
     mira una vez, sino que sondea durante una ventana y se rinde. Sondeo y no
     MutationObserver por lo mismo que Tema.vigilar: Polymer rehace el bloque
     entero, y un observador sobre un nodo que van a reemplazar deja de servir
     sin avisar. */
  atender(id) {
    clearTimeout(this._reloj);
    this._reloj = 0;
    if (!id || !Ajustes.get('preferirVideo')) return;

    /* La clave es el id de video: es lo unico estable, y es ademas lo que
       cambia cuando la conmutacion funciona — o sea que el propio exito nos
       trae aqui otra vez con una pista distinta, ya en modo video, y el
       intento se acaba solo sin ningun contador de por medio. */
    const clave = id.id;
    if (!clave || this._atendidas.has(clave)) return;

    this._pista = clave;
    this._hasta = Date.now() + VIDEO_VENTANA_MS;
    this._mirar();
  },

  _mirar() {
    this._reloj = 0;
    const id = Tema.actual();
    if (!id || id.id !== this._pista) return;          // ya cambio la cancion

    if (this.hayAnuncio()) {
      /* EL TIEMPO DE ANUNCIO NO CUENTA. La ventana existe para no insistir
         eternamente sobre una pista que no va a conmutar; agotarla mientras
         suena publicidad seria darse por vencido antes de haber mirado una sola
         vez. Y peor: `_recordar` marcaria el id de la cancion como atendido —
         durante el anuncio la URL sigue siendo la suya — y al volver la cancion
         de verdad ya no se le pondria el video. */
      this._hasta = Date.now() + VIDEO_VENTANA_MS;
    } else {
      const l = this.lectura();
      if (l.conmutador && l.enVideo) { this._recordar(this._pista); return; }
      if (l.conmutador && l.modo && !l.bloqueado && l.hayBoton) {
        this._recordar(this._pista);
        if (this.poner()) {
          log('video: conmutado en', this._pista);
          Aviso.decir('Poniendo el video');
        }
        return;
      }
      /* Un NONE ya resuelto es una respuesta, no una espera: esta cancion no
         tiene video y no la va a tener dentro de tres segundos. */
      if (l.conmutador && l.modo === 'NONE') { this._recordar(this._pista); return; }
    }

    if (Date.now() > this._hasta) {
      log('video: sin conmutador utilizable para', this._pista, this.estado().dice);
      this._recordar(this._pista);
      return;
    }
    this._reloj = setTimeout(() => this._mirar(), VIDEO_SONDEO_MS);
  },

  _recordar(clave) {
    if (this._atendidas.has(clave)) return;
    this._atendidas.add(clave);
    this._orden.push(clave);
    while (this._orden.length > VIDEO_MEMORIA) this._atendidas.delete(this._orden.shift());
  },

  /* Encender el interruptor con una cancion ya sonando tiene que hacer algo
     ahora, no en la siguiente: si no, parece que no funciona. Y olvidar la
     pista actual es lo que permite que el intento se repita. */
  reconsiderar() {
    const id = Tema.actual();
    if (!id) return;
    this._atendidas.delete(id.id);
    this.atender(id);
  },
};
