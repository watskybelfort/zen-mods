/* --- Almacen: ajustes, cache y desfase ------------------------------------
   Dos implementaciones detras de la misma puerta, por lo mismo que la red:
   GM_setValue si hay gestor de userscripts, localStorage si no.

   QUE SE GUARDA EN CACHE Y QUE NO. Se guarda el TEXTO en crudo tal como lo dio
   el proveedor, no la linea de tiempo ya compuesta. Dos razones: ocupa una
   fraccion, y sobre todo que si manana se afina la interpolacion, la cache vieja
   se recompone con las reglas nuevas en lugar de servir para siempre el reparto
   de palabras de la version anterior — que es un fallo especialmente molesto,
   porque solo se nota en las canciones que ya habias escuchado.

   Y SE GUARDAN LOS FALLOS. Un "no tengo esa cancion" tambien va a cache, con
   caducidad mas corta. Sin eso, cada vuelta a un tema sin letra vuelve a
   preguntar por lo mismo, y son las canciones raras las que mas se repiten en
   las colas de uno. */

const VIDA_ACIERTO = 30 * 24 * 3600 * 1000;   // la letra de una cancion no cambia
const VIDA_FALLO = 3 * 24 * 3600 * 1000;      // pero la base de datos crece
const TOPE_CACHE = 300;                        // entradas antes de tirar las viejas

const hayGm = typeof GM_setValue === 'function' && typeof GM_getValue === 'function';

const Almacen = {
  via: hayGm ? 'gm' : 'localStorage',

  _clave(k) { return `${LV.marca}:${k}`; },

  leer(k, pordefecto = null) {
    try {
      if (hayGm) {
        const v = GM_getValue(this._clave(k), undefined);
        return v === undefined ? pordefecto : v;
      }
      const s = localStorage.getItem(this._clave(k));
      return s === null ? pordefecto : JSON.parse(s);
    } catch (e) {
      warn('no se pudo leer', k, e && e.message);
      return pordefecto;
    }
  },

  escribir(k, v) {
    try {
      if (hayGm) { GM_setValue(this._clave(k), v); return true; }
      localStorage.setItem(this._clave(k), JSON.stringify(v));
      return true;
    } catch (e) {
      /* localStorage lleno. Se vacia la cache y se reintenta una vez: perder
         cache es gratis, perder los ajustes del usuario no. */
      warn('no se pudo escribir', k, e && e.message);
      if (!hayGm) { Cache.vaciar(); try { localStorage.setItem(this._clave(k), JSON.stringify(v)); return true; } catch { /* nada mas que hacer */ } }
      return false;
    }
  },

  borrar(k) {
    try {
      if (hayGm) { GM_deleteValue(this._clave(k)); return; }
      localStorage.removeItem(this._clave(k));
    } catch { /* da igual */ }
  },
};

/* --- Ajustes -------------------------------------------------------------- */

const AJUSTES_POR_DEFECTO = {
  /* Cuanto se adelanta o atrasa la letra, en segundos. Global, se suma al
     desfase por cancion. */
  desfase: 0,
  /* Fuentes. Musixmatch va apagado: necesita un token que pone el usuario. Los
     subtitulos de YouTube van encendidos porque no necesitan nada — ni token, ni
     gestor, ni permiso — y solo entran cuando no hay letra de nadie mas. */
  usarLrclib: true,
  usarMusixmatch: false,
  tokenMusixmatch: '',
  usarSubtitulos: true,
  /* Poner el videoclip cuando la cancion lo tiene, en lugar de la caratula fija
     del art track. Encendido, porque es lo que se pidio y porque no puede
     estropear nada: cuando no hay video no pasa absolutamente nada. Lo que si
     hace es gastar mas datos, asi que el interruptor esta en el menu y lo dice. */
  preferirVideo: true,
  /* Vista con la que se abre la letra al pulsar el boton. */
  vistaPorDefecto: 'escenario',
  /* La mini tira sobre la barra, encendida aparte de la vista. */
  miniTira: false,
  /* El relleno palabra a palabra. Apagarlo deja el resaltado por linea, estilo
     Spotify basico, que es lo que algunos prefieren para leer. */
  porPalabra: true,
  /* Tamano de referencia de la letra, EN PIXELES. Es el del escenario; cada vista
     aplica su factor sobre este (el panel la mitad, la pantalla completa un
     tercio mas). En pixeles y no en rem porque YouTube Music pone la raiz del
     documento en 10px: cualquier rem nuestro saldria al 62.5% de lo pedido. */
  tamano: 44,
  debug: false,
};

const Ajustes = {
  _v: null,

  cargar() {
    const guardados = Almacen.leer('ajustes', {}) || {};
    this._v = { ...AJUSTES_POR_DEFECTO, ...guardados };
    LV.debug = !!this._v.debug;
    return this._v;
  },

  get(k) { if (!this._v) this.cargar(); return this._v[k]; },

  set(k, v) {
    if (!this._v) this.cargar();
    this._v[k] = v;
    Almacen.escribir('ajustes', this._v);
    if (k === 'debug') LV.debug = !!v;
    return v;
  },

  todos() { if (!this._v) this.cargar(); return { ...this._v }; },
};

/* --- Desfase por cancion --------------------------------------------------
   El desfase global no basta. La causa tipica de desincronizacion es que la
   pista de YouTube Music no es el mismo master que cronometro la base de datos:
   un video con intro habla, una version en directo, un remaster con medio
   segundo de silencio delante. Eso es por cancion, no por instalacion, asi que
   se guarda con el id del video y se recupera solo la proxima vez.

   Se guarda TODO junto en una entrada y no una por cancion: son unos pocos
   bytes por tema y asi se puede recortar cuando crezca sin recorrer el almacen. */

const Desfases = {
  _m: null,

  _cargar() { if (!this._m) this._m = Almacen.leer('desfases', {}) || {}; return this._m; },

  de(id) { return this._cargar()[id] || 0; },

  poner(id, segundos) {
    const m = this._cargar();
    if (Math.abs(segundos) < 0.001) delete m[id];
    else m[id] = Math.round(segundos * 1000) / 1000;

    const claves = Object.keys(m);
    if (claves.length > 500) for (const k of claves.slice(0, claves.length - 500)) delete m[k];

    Almacen.escribir('desfases', m);
    return segundos;
  },
};

/* --- Cache de letras ------------------------------------------------------ */

const Cache = {
  _indice() { return Almacen.leer('cache:indice', []) || []; },

  obtener(id) {
    const e = Almacen.leer(`cache:${id}`, null);
    if (!e) return null;
    const vida = e.vacio ? VIDA_FALLO : VIDA_ACIERTO;
    if (Date.now() - (e.at || 0) > vida) { Almacen.borrar(`cache:${id}`); return null; }
    return e;
  },

  guardar(id, entrada) {
    Almacen.escribir(`cache:${id}`, { ...entrada, at: Date.now() });

    const idx = this._indice().filter((k) => k !== id);
    idx.push(id);
    /* Se tiran las mas viejas por orden de entrada, no por ultimo uso: llevar
       cuenta del uso obligaria a escribir en el almacen en cada reproduccion,
       y eso es escritura en disco cada tres minutos para ahorrar unos kilobytes. */
    while (idx.length > TOPE_CACHE) Almacen.borrar(`cache:${idx.shift()}`);
    Almacen.escribir('cache:indice', idx);
  },

  vaciar() {
    for (const k of this._indice()) Almacen.borrar(`cache:${k}`);
    Almacen.escribir('cache:indice', []);
    log('cache vaciada');
  },

  cuantas() { return this._indice().length; },
};
