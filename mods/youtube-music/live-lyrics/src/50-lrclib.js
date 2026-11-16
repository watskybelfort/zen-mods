/* --- Proveedor: LRCLIB --------------------------------- COMPROBADO EN VIVO -
   API abierta, sin clave, mantenida por una persona. Comprobado contra el
   servicio: /api/search devuelve un ARRAY de objetos con estas claves —

     id, name, trackName, artistName, albumName, duration (segundos),
     instrumental (bool), plainLyrics, syncedLyrics

   y `syncedLyrics` es texto LRC con marcas [mm:ss.xx]. NO hay ninguna clave con
   tiempos por palabra: por eso la interpolacion de 35-palabras.js no es un
   adorno, es la unica via al efecto de Apple Music con esta fuente.

   LA BUSQUEDA VA EN CASCADA, y el orden no es capricho. /api/get exige
   coincidencia exacta de artista, titulo y duracion, y cuando acierta es la
   respuesta correcta sin discusion. Pero falla con cualquier diferencia de
   puntuacion o de edicion, y entonces hace falta /api/search, que devuelve
   candidatos entre los que hay que elegir. Ir directo a search seria peor: da
   varias versiones del mismo tema y elegir mal es como salen las letras que van
   desincronizadas de principio a fin.

   LA DURACION ES EL DESEMPATE BUENO. Titulo y artista se escriben de veinte
   maneras; la duracion es un numero. Dos versiones de la misma cancion que
   difieren en mas de dos o tres segundos tienen tiempos distintos, asi que
   elegir por cercania de duracion es lo que evita cronometrar una cancion
   contra el master equivocado. */

const LRCLIB = 'https://lrclib.net';

const parametros = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  return p.toString();
};

/* Parecido entre dos cadenas, 0 a 1, por trigramas. No hace falta nada mas
   fino: sirve para descartar que un "Remix" se cuele como si fuera el original,
   no para ordenar un catalogo. */
const parecido = (a, b) => {
  const norm = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const tri = (s) => { const t = new Set(); const p = `  ${s} `; for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3)); return t; };
  const tx = tri(x);
  const ty = tri(y);
  let comunes = 0;
  for (const t of tx) if (ty.has(t)) comunes++;
  return (2 * comunes) / (tx.size + ty.size);
};

/* Si dos nombres de artista comparten alguna palabra con peso. Las cortas se
   descartan porque "de", "la" y "los" los comparte media discografia. */
const comparteNombre = (a, b) => {
  const trozos = (s) => new Set(
    String(s || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
  const x = trozos(a);
  for (const t of trozos(b)) if (x.has(t)) return true;
  return false;
};

const ProveedorLrclib = {
  nombre: 'lrclib',

  disponible() { return Ajustes.get('usarLrclib') !== false; },

  /* Devuelve { texto, fuente, instrumental } o null. El texto es LRC en crudo,
     que es lo que se guarda en cache. */
  async buscar(id) {
    const duracion = id.duracion > 1 ? Math.round(id.duracion) : null;

    // 1. Coincidencia exacta, con album si lo tenemos y con duracion.
    if (duracion) {
      const exacta = await this._get({
        artist_name: id.artista, track_name: id.titulo, album_name: id.album, duration: duracion,
      });
      if (exacta) return exacta;

      // 2. Sin album: el album de la barra viene mal escrito mas veces que bien.
      if (id.album) {
        const sinAlbum = await this._get({ artist_name: id.artista, track_name: id.titulo, duration: duracion });
        if (sinAlbum) return sinAlbum;
      }
    }

    // 3. Busqueda amplia y eleccion por duracion. Ultimo recurso.
    return this._buscarYElegir(id, duracion);
  },

  async _get(campos) {
    const r = await Red.json(`${LRCLIB}/api/get?${parametros(campos)}`);
    if (!r.ok) {
      if (r.estado !== 404) log('lrclib /get:', r.error);
      return null;
    }
    return this._interpretar(r.datos);
  },

  async _buscarYElegir(id, duracion) {
    /* Se pregunta por campos y no por `q` libre: con q= el servicio busca en
       todo y devuelve cosas de otros artistas con titulo parecido. */
    const r = await Red.json(`${LRCLIB}/api/search?${parametros({ track_name: id.titulo, artist_name: id.artista })}`);
    if (!r.ok || !Array.isArray(r.datos) || !r.datos.length) {
      /* Segundo intento solo por titulo: pasa cuando el artista de YTM lleva
         colaboraciones que la base indexa de otra forma. */
      const soloTitulo = await Red.json(`${LRCLIB}/api/search?${parametros({ track_name: id.titulo })}`);
      if (!soloTitulo.ok || !Array.isArray(soloTitulo.datos) || !soloTitulo.datos.length) return null;
      return this._elegir(soloTitulo.datos, id, duracion);
    }
    return this._elegir(r.datos, id, duracion);
  },

  /* --- EL FILTRO, QUE VA ANTES DE PUNTUAR --------------------- MEDIDO EN USO -
     Esto empezo siendo solo una puntuacion, y estaba mal de raiz: tener letra
     sincronizada sumaba 100 puntos y el umbral era 60, asi que CUALQUIER
     candidato con letra pasaba el corte por si solo. El parecido del titulo y del
     artista sumaba 25 y 15, o sea que solo reordenaba — no podia vetar a nadie.

     Sintoma real, con "Una Copa" de Homer El Mero Mero y Emanero: la busqueda por
     artista no encontro nada, la de solo titulo devolvio otra cancion que se
     llama parecido, y como traia letra sincronizada se acepto. Una letra que no
     tiene nada que ver, presentada con la misma confianza que una correcta.

     Ahora hay puertas que se cierran, y solo se puntua a quien las pasa. Y si no
     pasa nadie, se dice que no hay letra: es la respuesta correcta, y ademas es
     la unica que el usuario puede corregir a mano. Ensenar la letra equivocada no
     se corrige, se sufre. */
  _pasaElFiltro(c, id, duracion, pt, pa) {
    /* El titulo tiene que parecerse, sin excepcion. */
    if (pt < 0.5) return 'el titulo no se parece';

    /* Y el artista tambien, si sabemos cual es. La excepcion es para los temas
       con colaboraciones, donde una base lista "A" y YouTube Music "A, B y C": el
       parecido por trigramas baja mucho aunque sea el mismo tema.

       PERO LA EXCEPCION EXIGE QUE COMPARTAN ALGUN NOMBRE. Sin eso era una puerta
       abierta: con el titulo identico y la duracion clavada aceptaba a CUALQUIER
       artista, que es casi el mismo fallo que se venia a arreglar. Dos canciones
       distintas pueden llamarse igual y durar lo mismo; lo que no hacen es
       compartir el nombre del artista. */
    if (id.artista && pa < 0.34) {
      const duracionClava = duracion && Number.isFinite(c.duration) && Math.abs(c.duration - duracion) <= 3;
      if (!(pt > 0.85 && duracionClava && comparteNombre(c.artistName, id.artista))) return 'el artista no se parece';
    }

    /* Doce segundos de diferencia ya no son otra edicion del mismo tema: son otro
       tema. Y cronometrar contra la pista equivocada se ve como una letra que se
       desincroniza sola y no hay ajuste que la arregle. */
    if (duracion && Number.isFinite(c.duration) && Math.abs(c.duration - duracion) > 12) {
      return `la duracion se aparta ${Math.round(Math.abs(c.duration - duracion))}s`;
    }

    return null;
  },

  _elegir(candidatos, id, duracion) {
    const descartados = [];
    const aptos = candidatos.filter((c) => {
      const motivo = this._pasaElFiltro(c, id, duracion,
        parecido(c.trackName, id.titulo), parecido(c.artistName, id.artista));
      if (motivo) descartados.push({ dur: c.duration, motivo });
      return !motivo;
    });

    if (LV.debug && descartados.length) log(`lrclib: ${descartados.length} candidato(s) descartados`, descartados.slice(0, 5));
    if (!aptos.length) { log('lrclib: ningun candidato pasa el filtro; mejor sin letra que con la equivocada'); return null; }

    const puntuados = aptos.map((c) => {
      let punto = 0;

      /* Con letra sincronizada es lo unico que nos sirve de verdad. Una entrada
         con solo texto plano es el ultimo recurso: se muestra, pero sin correr. */
      if (c.syncedLyrics) punto += 100;
      else if (c.instrumental) punto += 40;
      else if (c.plainLyrics) punto += 10;

      /* La duracion pesa mas que el parecido del texto, por lo dicho arriba:
         es lo unico que distingue dos versiones del mismo tema. */
      if (duracion && Number.isFinite(c.duration)) {
        const dif = Math.abs(c.duration - duracion);
        if (dif <= 2) punto += 60;
        else if (dif <= 5) punto += 30;
        else if (dif <= 12) punto += 5;
        else punto -= Math.min(40, dif);
      }

      punto += 25 * parecido(c.trackName, id.titulo);
      punto += 15 * parecido(c.artistName, id.artista);
      if (id.album) punto += 10 * parecido(c.albumName, id.album);

      return { c, punto };
    }).sort((a, b) => b.punto - a.punto);

    if (LV.debug) {
      log('lrclib candidatos:', puntuados.slice(0, 5).map((p) => ({
        dur: p.c.duration, sinc: !!p.c.syncedLyrics, inst: !!p.c.instrumental, punto: Math.round(p.punto),
      })));
    }

    /* Ya no hace falta umbral: quien llega hasta aqui ha pasado las puertas, y la
       puntuacion solo decide cual de los validos es el mejor. El umbral de antes
       daba una falsa sensacion de control — 60 puntos los alcanzaba cualquiera
       solo por traer letra sincronizada. */

    /* La lista ordenada se guarda para poder ofrecer la SIGUIENTE. Aunque el
       filtro deje fuera lo que no tiene que ver, sigue habiendo temas con varias
       versiones legitimas — directo, remix, edicion de album — y desde fuera no
       hay forma de saber cual suena. Que el usuario pueda decir "esta no es" y
       pasar a la siguiente vale mas que cualquier heuristica nuestra. */
    this._candidatos = { id: id.id, lista: puntuados.map((p) => p.c), i: 0 };

    const mejor = puntuados[0];
    return mejor ? this._interpretar(mejor.c) : null;
  },

  /* La siguiente version de la lista, o null si se acabaron. */
  otra(id) {
    const g = this._candidatos;
    if (!g || g.id !== id.id || g.i + 1 >= g.lista.length) return null;
    g.i++;
    log(`lrclib: version ${g.i + 1} de ${g.lista.length}`);
    return this._interpretar(g.lista[g.i]);
  },

  cuantasVersiones(id) {
    const g = this._candidatos;
    return g && g.id === id.id ? { total: g.lista.length, actual: g.i + 1 } : null;
  },

  _interpretar(d) {
    if (!d) return null;
    if (d.instrumental) return { texto: '', fuente: 'lrclib', instrumental: true };
    if (d.syncedLyrics) return { texto: d.syncedLyrics, fuente: 'lrclib', instrumental: false };
    /* Texto plano: no se puede cronometrar, pero se puede mostrar. Se devuelve
       marcado para que el render lo pinte quieto y lo diga, en lugar de fingir
       una sincronizacion que no existe. */
    if (d.plainLyrics) return { texto: d.plainLyrics, fuente: 'lrclib-plano', plano: true, instrumental: false };
    return null;
  },
};
