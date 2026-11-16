/* --- Identidad del tema ---------------------------------------------- MEDIDO -
   Para pedir la letra hay que saber QUE suena, y no hay una sola fuente fiable
   en YouTube Music. Se cruzan tres, en este orden:

   1. navigator.mediaSession.metadata. Es la mejor: la pone la propia app para
      los controles del sistema operativo, esta limpia de adornos y cambia en el
      momento exacto en que cambia la pista. Medido en vivo: trae `title` y
      `artist` siempre, `album` NO (venia vacio), y una entrada de `artwork`.
      Ojo con leerla: en un userscript con permisos, el objeto llega por Xray, y
      cualquier acceso puede fallar segun el gestor. De ahi el try/catch.

   2. La barra del reproductor. `.title` y `.byline` de ytmusic-player-bar.
      Es el respaldo cuando mediaSession no esta, y la unica via al album,
      porque el byline lo lleva. Medido: para canciones el byline es
      "Artista • Album • Ano" y para videos "Artista • N visualizaciones", asi
      que la segunda parte solo es album si no parece un contador.

   3. La URL. El parametro `v` de /watch es el identificador de video, que es la
      clave con la que se guarda todo en cache y el desfase. Es lo unico
      estable: titulo y artista cambian de idioma segun la cuenta.

   NORMALIZAR NO ES COSMETICA. Los titulos de YouTube Music llevan adornos que
   ninguna base de letras tiene indexados: "(Official Video)", "(Remastered
   2011)", "(Visualizer)". Buscar con el adorno puesto es la primera causa de
   "no hay letra para este tema" cuando si la hay. Y los canales automaticos de
   YouTube llevan " - Topic" pegado al nombre del artista. */

const RUIDO_TITULO = [
  /\((?:official\s+)?(?:music\s+)?video(?:\s+clip)?\)/gi,
  /\((?:official\s+)?(?:audio|lyrics?|lyric\s+video|visuali[sz]er|visual)\)/gi,
  /\[(?:official\s+)?(?:music\s+)?video\]/gi,
  /\[(?:official\s+)?(?:audio|lyrics?|visuali[sz]er)\]/gi,
  /\((?:re-?master(?:ed)?|remasterizado)(?:\s+\d{4})?\)/gi,
  /\((?:video\s+)?oficial\)/gi,
  /\((?:letra|letras)\)/gi,
  /\(HD\)|\(HQ\)|\(4K\)/gi,
];

const limpiarTitulo = (t) => {
  let s = t || '';
  for (const r of RUIDO_TITULO) s = s.replace(r, ' ');
  return s.replace(/\s{2,}/g, ' ').trim();
};

const limpiarArtista = (a) => (a || '')
  .replace(/\s+-\s+Topic$/i, '')
  .replace(/\s*VEVO$/i, '')
  .trim();

/* "Artista • Album • 2010" contra "Artista • 1.6M de visualizaciones".
   Un contador siempre empieza por digito, y un ano son cuatro digitos solos;
   lo que queda en medio y no es ninguna de las dos cosas, es el album. */
const parecePorContador = (s) => /^\d/.test(s.trim()) || /(views|visualizaciones|reproducciones|likes|me gusta)/i.test(s);

const desdeByline = (texto) => {
  const partes = (texto || '').split('•').map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return { artista: '', album: '' };
  const artista = limpiarArtista(partes[0]);
  let album = '';
  for (const p of partes.slice(1)) {
    if (parecePorContador(p)) continue;
    if (/^\d{4}$/.test(p)) continue;             // ano
    album = p;
    break;
  }
  return { artista, album };
};

const Tema = {
  _actual: null,
  _oyentes: new Set(),
  _vigilando: false,

  _deMediaSession() {
    try {
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      if (!m || !m.title) return null;
      return {
        titulo: String(m.title || ''),
        artista: String(m.artist || ''),
        album: String(m.album || ''),
        arte: (() => { try { const a = m.artwork; return a && a.length ? String(a[a.length - 1].src) : ''; } catch { return ''; } })(),
      };
    } catch (e) {
      log('mediaSession ilegible, se usa la barra:', e && e.message);
      return null;
    }
  },

  _deLaBarra() {
    const t = punto('barraTitulo');
    if (!t) return null;
    const titulo = (t.textContent || '').trim();
    if (!titulo) return null;
    const b = punto('barraByline');
    const { artista, album } = desdeByline(b && b.textContent);
    return { titulo, artista, album, arte: '' };
  },

  _idDeVideo() {
    const p = new URLSearchParams(location.search);
    const v = p.get('v');
    if (v) return v;
    /* Fuera de /watch (navegando por la app con algo sonando) la URL no lleva
       el id. Se cae a una firma de titulo+artista: no es un id de YouTube, pero
       sirve igual para lo unico que usamos el id — indexar cache y desfase. */
    return null;
  },

  /* Lo que se le pide a los proveedores. Ya normalizado, porque normalizar en
     el proveedor lo haria dos veces distinto en dos sitios. */
  identidad() {
    const base = this._deMediaSession() || this._deLaBarra();
    if (!base || !base.titulo) return null;

    const barra = base.album ? null : this._deLaBarra();   // solo por el album
    const titulo = limpiarTitulo(base.titulo);
    const artista = limpiarArtista(base.artista) || (barra ? barra.artista : '');
    const album = base.album || (barra ? barra.album : '');
    const id = this._idDeVideo() || `firma:${titulo}::${artista}`;

    return {
      id,
      titulo,
      tituloCrudo: base.titulo,
      artista,
      album,
      arte: base.arte,
      duracion: Reloj.duracion(),
      /* La firma decide si el tema CAMBIO. La duracion queda fuera a proposito:
         llega despues que el titulo y cambiaria la firma dos veces por tema,
         disparando dos busquedas de letra para la misma cancion. */
      firma: `${id}|${titulo}|${artista}`,
    };
  },

  alCambiar(f) { this._oyentes.add(f); return () => this._oyentes.delete(f); },

  _avisar(id) {
    this._actual = id;
    log('tema:', id ? `${id.artista} — ${id.titulo}` : '(nada)');
    for (const f of this._oyentes) { try { f(id); } catch (e) { warn(e); } }
  },

  /* Se comprueba por sondeo y no por eventos de la app. YTM emite
     `yt-navigate-finish`, pero no lo emite al pasar de una cancion a la
     siguiente dentro de la misma cola, que es justo el caso que mas importa.
     Dos veces por segundo comparar dos cadenas no se nota en ningun sitio, y a
     cambio funciona igual el dia que ellos renombren su evento. */
  vigilar() {
    if (this._vigilando) return;
    this._vigilando = true;

    const comprobar = () => {
      const id = this.identidad();
      const firmaVieja = this._actual ? this._actual.firma : null;
      const firmaNueva = id ? id.firma : null;
      if (firmaNueva !== firmaVieja) this._avisar(id);
      else if (id && this._actual && !this._actual.duracion && id.duracion) {
        /* Misma cancion, pero ya sabemos cuanto dura. No es un cambio de tema:
           se actualiza en silencio para que la busqueda por duracion la tenga. */
        this._actual.duracion = id.duracion;
      }
    };

    setInterval(comprobar, 400);
    const v = Reloj.video();
    if (v) for (const ev of ['loadedmetadata', 'emptied', 'durationchange']) v.addEventListener(ev, comprobar);
    comprobar();
  },

  actual() { return this._actual; },
};
