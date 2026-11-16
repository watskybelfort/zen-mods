/* --- Proveedor: Musixmatch richsync ----------------------- COMPROBADO EN VIVO -
   La unica fuente con tiempos POR PALABRA de verdad. Es lo que usa Spotify para
   su karaoke, y frente a la interpolacion de 35-palabras.js la diferencia se nota
   en las palabras sostenidas y en los cambios de ritmo dentro de una linea, que
   es justo donde una interpolacion lineal se queda corta.

   VA APAGADO POR DEFECTO, y no por pereza:

   1. Necesita un usertoken que no es publico. Lo pone el usuario desde el menu.
   2. Es una API no oficial: esto se salta su autenticacion, o sea que va contra
      sus condiciones de uso. Con LRCLIB no hay esa duda — es abierta y esta hecha
      para esto. Aqui la decision es del usuario, informada, y por eso el
      interruptor esta a mano y en apagado.
   3. Se rompera. Cuando cambien el nombre de un campo, este proveedor devuelve
      null y LRCLIB sigue funcionando: la cadena de proveedores esta hecha para
      que la fuente fragil no arrastre a la solida.

   NECESITA GESTOR DE USERSCRIPTS O CARGADOR NATIVO. La peticion lleva una
   cabecera Cookie, y el navegador NO deja poner esa cabecera desde fetch — la
   gestiona el. Con GM_xmlhttpRequest si se puede, porque la hace el gestor desde
   fuera de la pagina. Asi que sin gestor este proveedor se declara no disponible
   en lugar de fallar en cada cancion.

   Formas comprobadas de la respuesta:
     macro.subtitles.get  -> message.body.macro_calls
                             ["matcher.track.get"].message.body.track
                                 .commontrack_id / .track_id
                             ["track.subtitles.get"].message.body
                                 .subtitle_list[0].subtitle.subtitle_body
     track.richsync.get   -> message.body.richsync.richsync_body, que es una CADENA
                             con JSON dentro: [ { ts, te, l:[ {c, o} ], x } ]
                             ts/te   inicio y fin de la linea, en segundos
                             l       las palabras
                             c       el texto de la palabra
                             o       su desplazamiento */

const MXM = 'https://apic-desktop.musixmatch.com/ws/1.1';
const MXM_APP = 'web-desktop-app-v1.0';

/* [mm:ss.xx], que es lo que espera nuestro parser de LRC. */
const marcaLrc = (t) => {
  const seg = Math.max(0, t);
  const m = Math.floor(seg / 60);
  const s = seg - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};

/* EL DESPLAZAMIENTO DE CADA PALABRA PUEDE VENIR DE DOS FORMAS -------- MEDIDO -
   En el formato de Musixmatch, `o` es el desplazamiento de la palabra dentro de
   su linea, o sea relativo a `ts`. Pero hay implementaciones por ahi que lo
   tratan como absoluto, y no seria la primera vez que una API no oficial devuelve
   una cosa u otra segun la pista. Equivocarse aqui no da error: da una letra
   cronometrada contra el minuto equivocado.

   Asi que en lugar de elegir de antemano, se prueban las dos y se queda la que
   deja las palabras DENTRO de su propia linea. Si ninguna encaja, se cae a
   relativo, que es lo documentado. */
const interpretarPalabras = (entrada) => {
  const ts = Number(entrada.ts) || 0;
  const te = Number(entrada.te) || ts;
  const palabras = Array.isArray(entrada.l) ? entrada.l : [];
  if (!palabras.length) return null;

  const cabe = (inicios) => inicios.every((v) => v >= ts - 0.05 && v <= te + 0.05) &&
                            inicios.every((v, i) => i === 0 || v >= inicios[i - 1] - 0.001);

  const relativos = palabras.map((p) => ts + (Number(p.o) || 0));
  const absolutos = palabras.map((p) => Number(p.o) || 0);

  const inicios = cabe(relativos) ? relativos : cabe(absolutos) ? absolutos : relativos;
  return palabras.map((p, i) => ({ texto: String(p.c || ''), inicio: inicios[i] }));
};

/* Richsync a LRC mejorado. Convertir a un formato que el motor ya sabe leer, en
   lugar de meter una segunda representacion por todo el codigo: la cache sigue
   guardando texto, el parser ya marca la linea de tiempo como porPalabra y no hay
   una ruta paralela que mantener. */
const richsyncALrc = (entradas) => {
  const lineas = [];
  for (const e of entradas) {
    const palabras = interpretarPalabras(e);
    if (!palabras) continue;
    let linea = `[${marcaLrc(Number(e.ts) || 0)}]`;
    for (const p of palabras) {
      /* Las palabras de Musixmatch ya traen su espacio delante o detras cuando
         toca, asi que se pegan tal cual y no se anade separador: anadirlo parte
         las contracciones y las palabras con apostrofo. */
      linea += `<${marcaLrc(p.inicio)}>${p.texto}`;
    }
    lineas.push(linea);
  }
  return lineas.length ? lineas.join('\n') : null;
};

/* El subtitulo normal, por linea, para cuando la cancion no tiene richsync. Viene
   en JSON con el tiempo desglosado en minutos, segundos y centesimas. */
const subtituloALrc = (cadena) => {
  let lista;
  try { lista = JSON.parse(cadena); } catch { return null; }
  if (!Array.isArray(lista) || !lista.length) return null;
  const lineas = [];
  for (const l of lista) {
    const t = l.time || {};
    const total = Number.isFinite(t.total) ? t.total
      : (Number(t.minutes) || 0) * 60 + (Number(t.seconds) || 0) + (Number(t.hundredths) || 0) / 100;
    lineas.push(`[${marcaLrc(total)}]${String(l.text || '')}`);
  }
  return lineas.join('\n');
};

const ProveedorMusixmatch = {
  nombre: 'musixmatch',

  disponible() {
    if (!Ajustes.get('usarMusixmatch')) return false;
    if (!Ajustes.get('tokenMusixmatch')) { log('musixmatch encendido pero sin token'); return false; }
    /* Sin gestor no se puede poner la cabecera Cookie, y sin ella la API
       responde 401 a todo. Mejor declararse no disponible que fallar 200 veces. */
    const via = Red.via();
    if (via !== 'gm' && via !== 'puente') {
      log('musixmatch necesita gestor de userscripts o cargador nativo: la cabecera Cookie no se puede poner desde fetch');
      return false;
    }
    return true;
  },

  async buscar(id) {
    const token = Ajustes.get('tokenMusixmatch');
    const comun = {
      format: 'json',
      namespace: 'lyrics_richsynched',
      subtitle_format: 'mxm',
      app_id: MXM_APP,
      usertoken: token,
    };

    const macro = await Red.json(`${MXM}/macro.subtitles.get?${parametros({
      ...comun,
      q_track: id.titulo,
      q_artist: id.artista,
      q_artists: id.artista,
      q_album: id.album,
      q_duration: id.duracion ? Math.round(id.duracion) : '',
      f_subtitle_length: id.duracion ? Math.round(id.duracion) : '',
    })}`, { cabeceras: { Cookie: 'x-mxm-token-guid=' } });

    if (!macro.ok) { log('musixmatch macro:', macro.error); return null; }

    const llamadas = this._ruta(macro.datos, ['message', 'body', 'macro_calls']);
    if (!llamadas) { log('musixmatch: la respuesta no trae macro_calls; cambio el formato'); return null; }

    const pista = this._ruta(llamadas, ['matcher.track.get', 'message', 'body', 'track']) || {};
    const idComun = pista.commontrack_id;

    // 1. Richsync, que es la razon de tener este proveedor.
    if (idComun) {
      const rico = await Red.json(`${MXM}/track.richsync.get?${parametros({
        ...comun,
        commontrack_id: idComun,
        q_duration: id.duracion ? Math.round(id.duracion) : '',
        f_subtitle_length: id.duracion ? Math.round(id.duracion) : '',
      })}`, { cabeceras: { Cookie: 'x-mxm-token-guid=' } });

      const cuerpo = rico.ok && this._ruta(rico.datos, ['message', 'body', 'richsync', 'richsync_body']);
      if (cuerpo) {
        let entradas = null;
        try { entradas = JSON.parse(cuerpo); } catch { warn('musixmatch: richsync_body no era JSON'); }
        if (Array.isArray(entradas) && entradas.length) {
          const lrc = richsyncALrc(entradas);
          if (lrc) {
            log(`musixmatch: richsync con ${entradas.length} lineas, tiempos por palabra REALES`);
            return { texto: lrc, fuente: 'musixmatch', porPalabra: true };
          }
        }
      }
    }

    // 2. Sin richsync, el subtitulo por linea. Sigue siendo util: sus tiempos son
    //    buenos y la interpolacion se encarga de las palabras.
    const sub = this._ruta(llamadas, ['track.subtitles.get', 'message', 'body', 'subtitle_list', 0, 'subtitle', 'subtitle_body']);
    if (sub) {
      const lrc = subtituloALrc(sub);
      if (lrc) { log('musixmatch: subtitulo por linea'); return { texto: lrc, fuente: 'musixmatch', porPalabra: false }; }
    }

    return null;
  },

  /* Camino a prueba de nulos. La respuesta viene anidada seis niveles y con
     claves que llevan puntos en el nombre, asi que un acceso directo es una
     excepcion esperando a que Musixmatch cambie una capa. */
  _ruta(obj, camino) {
    let n = obj;
    for (const k of camino) {
      if (n === null || n === undefined) return null;
      n = n[k];
    }
    return n === undefined ? null : n;
  },
};
