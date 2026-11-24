/* Zen Descargas — la parte pura. Sin DOM, sin procesos, sin red: se prueba en node
 * (dev/tools/probar-descargas.mjs) y la cargan igual la pagina y el proceso padre.
 *
 * Tres cosas:
 *
 *   Validar      cada mensaje que llega de la pagina. El padre no se fia de la
 *                pagina: YouTube corre ahi sus propios scripts, y aunque el puente
 *                vive en la caja y no en `window`, lo que entra se comprueba otra vez.
 *   Argumentos   la linea de yt-dlp, como LISTA y nunca como texto de shell. La URL
 *                la arma el padre a partir del id de 11 caracteres: la pagina no
 *                puede colar una URL, una opcion ni un `--exec`.
 *   Leer         las lineas que imprime yt-dlp (progreso, titulo, archivo final y
 *                errores), con las plantillas que pone `argumentos`.
 */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.ZenDescargasPuro = api;
})(this, () => {
  'use strict';

  const LIMITES = Object.freeze({
    simultaneas: 2,      // descargas a la vez
    cola: 25,            // pendientes como mucho
    historial: 30,       // terminadas que se recuerdan en el panel
    duracionMax: 45 * 60 * 1000, // una descarga que tarda mas se corta
    porMinuto: 30,       // peticiones de descarga por minuto, entre todas las pestanas
    mensaje: 4096,       // bytes de un mensaje de la pagina
  });

  const MODOS = ['audio', 'video'];
  const CALIDADES = ['max', '2160', '1440', '1080', '720', '480'];
  const FORMATOS_AUDIO = ['mp3', 'm4a'];
  const AJUSTES = {
    calidad: CALIDADES,
    audio: FORMATOS_AUDIO,
    cookies: [true, false],
  };

  // El id de un video de YouTube: 11 caracteres de base64 para URL. Es lo unico que
  // viaja de la pagina al padre para elegir que se baja.
  const esId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);
  const esIdTrabajo = (v) => typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v);

  // Saca el id de una direccion de YouTube o YouTube Music. Solo para la pagina
  // (la suya), y solo de las formas conocidas.
  const idDeUrl = (texto) => {
    let u;
    try { u = new URL(texto); } catch (e) { return null; }
    if (!/^(www\.|m\.|music\.)?youtube\.com$/.test(u.hostname) && u.hostname !== 'youtu.be') return null;
    if (u.hostname === 'youtu.be') return esId(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    const v = u.searchParams.get('v');
    if (esId(v)) return v;
    const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
    return m ? m[1] : null;
  };

  // Lo que la pagina puede pedir. Todo lo demas se descarta sin contestar.
  const validar = (m) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
    switch (m.tipo) {
      case 'hola':
      case 'adios':
      case 'carpeta':
        return { tipo: m.tipo };
      case 'descargar': {
        if (!esId(m.id) || !MODOS.includes(m.modo)) return null;
        const titulo = typeof m.titulo === 'string' ? m.titulo.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : '';
        return { tipo: 'descargar', id: m.id, modo: m.modo, titulo };
      }
      case 'cancelar':
      case 'mostrar':
      case 'quitar':
        return esIdTrabajo(m.trabajo) ? { tipo: m.tipo, trabajo: m.trabajo } : null;
      case 'ajuste': {
        // hasOwnProperty y no AJUSTES[m.clave] a secas: una clave como
        // 'constructor' o '__proto__' trae algo del prototipo, y validar tiene
        // que descartarla, no reventar al llamarle .includes.
        if (!Object.prototype.hasOwnProperty.call(AJUSTES, m.clave)) return null;
        const permitidos = AJUSTES[m.clave];
        if (!permitidos.includes(m.valor)) return null;
        return { tipo: 'ajuste', clave: m.clave, valor: m.valor };
      }
      default:
        return null;
    }
  };

  // --- Iconos -----------------------------------------------------------------
  // Cada pieza de los iconos del panel (motor.js) empieza por una letra que dice
  // la forma; detras van sus numeros separados por espacios:
  //   C cx cy r            circulo
  //   R x y ancho alto r   rectangulo
  //   F ...                trazado relleno
  //   ...                  trazado normal
  // Se quita UNA letra, no dos: con dos, la primera coordenada perdia su primer
  // digito y 'C6 18 3' salia con cx vacio (el circulo se iba al borde).
  const formaIcono = (d) => {
    if (d[0] === 'C') {
      const [cx, cy, r] = d.slice(1).split(' ');
      return { forma: 'circle', atributos: { cx, cy, r } };
    }
    if (d[0] === 'R') {
      const [x, y, ancho, alto, r] = d.slice(1).split(' ');
      return { forma: 'rect', atributos: { x, y, width: ancho, height: alto, rx: r } };
    }
    if (d[0] === 'F') return { forma: 'path', atributos: { d: d.slice(1) }, relleno: true };
    return { forma: 'path', atributos: { d } };
  };

  // --- yt-dlp ---------------------------------------------------------------
  // Marcas al principio de cada linea que nos interesa: el resto de la salida de
  // yt-dlp (avisos, [youtube] ...) se ignora salvo los ERROR:.
  const MARCA = '@@zd ';
  const PLANTILLA_PROGRESO = MARCA + 'P %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s';

  // Nombre del archivo. Para la musica, "Artista - Cancion" cuando YouTube Music
  // trae los metadatos de la pista, y el titulo a secas cuando no (un video normal
  // ya suele llevar el artista en el titulo). yt-dlp limpia lo que no vale en un
  // nombre de archivo de Windows.
  const PLANTILLA_AUDIO = '%(artist&{} - |)s%(track,title)s.%(ext)s';
  const PLANTILLA_VIDEO = '%(title)s.%(ext)s';

  // Recorta la portada a cuadrado (las miniaturas de YouTube son 16:9 con bandas)
  // y la pasa a JPEG, que es lo que entienden todas las etiquetas de MP3.
  const RECORTE_PORTADA = 'ThumbnailsConvertor+ffmpeg_o:-c:v mjpeg -qmin 1 -qscale:v 2 -vf crop="\'if(gt(ih,iw),iw,ih)\':\'if(gt(iw,ih),ih,iw)\'"';

  /**
   * La linea de yt-dlp para un trabajo.
   *   t.id        id de 11 caracteres (validado)
   *   t.modo      'audio' | 'video'
   *   o.calidad   'max' | '2160' | ... (video)
   *   o.audio     'mp3' | 'm4a'
   *   o.carpeta   donde va el archivo
   *   o.ffmpeg    carpeta de ffmpeg, o null si no hay
   *   o.js        { nombre: 'deno'|'node', ruta } para los retos de YouTube, o null
   *   o.cookies   ruta del perfil de Zen si se usa la sesion, o null
   *   o.temporal  carpeta para los trozos a medio bajar
   */
  const argumentos = (t, o) => {
    if (!esId(t.id) || !MODOS.includes(t.modo)) throw new Error('trabajo no valido');
    const a = [
      // Sin la configuracion del usuario: un yt-dlp.conf con --exec correria aqui.
      '--ignore-config',
      '--no-update',
      '--no-playlist',
      '--newline',
      '--no-colors',
      '--progress',
      '--no-mtime',
      '--windows-filenames',
      '--trim-filenames', '150',
      '--encoding', 'utf-8',
      '--concurrent-fragments', '4',
      '--retries', '5',
      '--fragment-retries', '5',
      '--progress-template', 'download:' + PLANTILLA_PROGRESO,
      '--print', 'before_dl:' + MARCA + 'T %(title)s',
      '--print', 'after_move:' + MARCA + 'F %(filepath)s',
      '-P', o.carpeta,
    ];
    if (o.temporal) a.push('-P', 'temp:' + o.temporal);
    if (o.ffmpeg) a.push('--ffmpeg-location', o.ffmpeg);
    if (o.js && o.js.ruta) a.push('--js-runtimes', o.js.nombre + ':' + o.js.ruta);
    if (o.cookies) a.push('--cookies-from-browser', 'firefox:' + o.cookies);

    if (t.modo === 'audio') {
      a.push('-o', PLANTILLA_AUDIO);
      if (o.ffmpeg) {
        if (o.audio === 'm4a') {
          a.push('-f', 'ba[ext=m4a]/ba', '-x', '--audio-format', 'm4a');
        } else {
          a.push('-f', 'ba', '-x', '--audio-format', 'mp3', '--audio-quality', '0');
        }
        a.push('--embed-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg', '--ppa', RECORTE_PORTADA);
      } else {
        // Sin ffmpeg no se convierte ni se etiqueta: el audio tal cual lo da YouTube.
        a.push('-f', 'ba[ext=m4a]/ba');
      }
    } else {
      a.push('-o', PLANTILLA_VIDEO);
      if (o.ffmpeg) {
        // Primero la resolucion, luego H.264 y AAC, que son los que abre cualquier
        // reproductor. Por encima de 1080p YouTube solo tiene VP9/AV1 y se usan esos.
        const res = o.calidad && o.calidad !== 'max' ? 'res:' + o.calidad : 'res';
        a.push('-S', res + ',vcodec:h264,acodec:m4a', '--merge-output-format', 'mp4', '--embed-metadata', '--embed-chapters');
      } else {
        // Sin ffmpeg no se puede juntar imagen y sonido: el mejor archivo que ya
        // venga con los dos.
        a.push('-f', 'b');
      }
    }
    a.push('--', 'https://www.youtube.com/watch?v=' + t.id);
    return a;
  };

  // Una linea de la salida. Devuelve { tipo, ... } o null si no interesa.
  const leerLinea = (linea) => {
    const l = String(linea).replace(/\r$/, '');
    if (l.startsWith(MARCA)) {
      const resto = l.slice(MARCA.length);
      const tipo = resto[0];
      const valor = resto.slice(2);
      if (tipo === 'T') return { tipo: 'titulo', titulo: valor.trim() };
      if (tipo === 'F') return { tipo: 'archivo', ruta: valor.trim() };
      if (tipo === 'P') {
        const [bajado, total, velocidad, eta] = valor.trim().split(' ').map(Number);
        return {
          tipo: 'progreso',
          bajado: Number.isFinite(bajado) ? bajado : 0,
          total: Number.isFinite(total) && total > 0 ? total : 0,
          velocidad: Number.isFinite(velocidad) ? velocidad : 0,
          eta: Number.isFinite(eta) ? eta : null,
        };
      }
      return null;
    }
    if (/^ERROR:/.test(l)) return { tipo: 'error', texto: l.replace(/^ERROR:\s*/, '').slice(0, 500) };
    if (/^\[(ExtractAudio|Merger|VideoConvertor|EmbedThumbnail|Metadata|ThumbnailsConvertor|FixupM4a|FixupM3u8)\]/.test(l)) return { tipo: 'procesando' };
    return null;
  };

  // Que se le dice al usuario por cada error conocido de yt-dlp. `codigo` lo usa
  // el panel para ofrecer la salida (encender la sesion, por ejemplo).
  const explicarError = (texto) => {
    const t = String(texto || '');
    if (/confirm you.?re not a bot|Sign in to confirm/i.test(t)) return { codigo: 'bot', en: 'YouTube asked to confirm you are not a bot. Turn on "Use my YouTube session" and try again.', es: 'YouTube pide confirmar que no eres un bot. Activa «Usar mi sesión de YouTube» y vuelve a intentarlo.' };
    if (/age|inappropriate for some users|confirm your age/i.test(t)) return { codigo: 'edad', en: 'This video is age-restricted. Turn on "Use my YouTube session" (signed in) and try again.', es: 'Este vídeo tiene restricción de edad. Activa «Usar mi sesión de YouTube» (con la cuenta iniciada) y vuelve a intentarlo.' };
    if (/members.only|Join this channel/i.test(t)) return { codigo: 'socios', en: 'Members-only video: it needs your session and a membership.', es: 'Vídeo solo para miembros: hace falta tu sesión y ser miembro.' };
    if (/Private video/i.test(t)) return { codigo: 'privado', en: 'This video is private.', es: 'Este vídeo es privado.' };
    if (/not available in your country|geo.?restrict/i.test(t)) return { codigo: 'pais', en: 'Not available in your country.', es: 'No está disponible en tu país.' };
    if (/live event will begin|is live|Premieres in/i.test(t)) return { codigo: 'directo', en: 'Live streams and premieres can be downloaded once they end.', es: 'Los directos y estrenos se pueden bajar cuando terminan.' };
    if (/ffmpeg|ffprobe/i.test(t)) return { codigo: 'ffmpeg', en: 'ffmpeg is missing or failed. Run the installer again.', es: 'Falta ffmpeg o falló. Vuelve a ejecutar el instalador.' };
    if (/HTTP Error 403|Requested format is not available|Unable to extract|nsig|signature/i.test(t)) return { codigo: 'ytdlp', en: 'YouTube changed something. Updating the downloader; try again in a minute.', es: 'YouTube cambió algo. Se está actualizando el descargador; inténtalo en un minuto.' };
    if (/Video unavailable|has been removed/i.test(t)) return { codigo: 'no-existe', en: 'This video is unavailable.', es: 'Este vídeo no está disponible.' };
    if (/timed out|getaddrinfo|Connection|Network/i.test(t)) return { codigo: 'red', en: 'Network problem. Check your connection and try again.', es: 'Problema de red. Revisa la conexión y vuelve a intentarlo.' };
    return { codigo: 'otro', en: 'The download failed: ' + t.slice(0, 160), es: 'La descarga falló: ' + t.slice(0, 160) };
  };

  // Lleva la cuenta del progreso de un trabajo con varias partes (en video, la
  // imagen y luego el sonido, cada una con su propio 0-100 %). La imagen pesa casi
  // todo: se le da el 90 % de la barra.
  const progreso = (estado, p, modo, conFfmpeg) => {
    const e = estado || { parte: 0, ultimo: 0, total: 0 };
    if (p.total && e.total && (p.total !== e.total) && p.bajado < e.ultimo) e.parte++;
    else if (p.bajado < e.ultimo * 0.5) e.parte++;
    e.ultimo = p.bajado;
    e.total = p.total;
    const frac = p.total ? Math.min(1, p.bajado / p.total) : 0;
    let pct;
    if (modo === 'video' && conFfmpeg) pct = e.parte === 0 ? frac * 90 : 90 + Math.min(1, frac) * 9;
    else pct = frac * 99;
    e.pct = Math.max(e.pct || 0, Math.round(pct * 10) / 10);
    return e;
  };

  return {
    LIMITES, MODOS, CALIDADES, FORMATOS_AUDIO, AJUSTES, MARCA,
    esId, esIdTrabajo, idDeUrl, validar, formaIcono, argumentos, leerLinea, explicarError, progreso,
  };
});
