// Zen Descargas — el descargador. Vive en el proceso padre de Zen, una sola vez, y
// lo carga el cargador compartido (core/config.js, campo `padre`) despues de puro.js.
//
// Recibe los pedidos de las pestanas de YouTube y YouTube Music (ver proceso.js),
// los pone en cola y los baja con yt-dlp, con ffmpeg para convertir y juntar.
//
// POR QUE yt-dlp Y NO BAJAR LOS FLUJOS DESDE LA PAGINA --------------------------
// Las direcciones de los flujos de YouTube vienen firmadas y estranguladas (el
// parametro `n`), y desde 2025 piden ademas un token de prueba de origen. Reproducir
// eso dentro del mod seria perseguir cada cambio de YouTube a mano. yt-dlp es el
// proyecto que lo persigue a diario: el mod se queda con la parte de interfaz y le
// deja a yt-dlp la parte que se rompe, y lo actualiza solo (una vez al dia).
//
// EL PISO DE SEGURIDAD ------------------------------------------------------------
//   - De la pagina solo llega el id de 11 caracteres; la URL la arma puro.argumentos.
//   - yt-dlp se lanza con una lista de argumentos, sin shell, y con --ignore-config
//     (un yt-dlp.conf con --exec no corre aqui).
//   - Los binarios salen de rutas fijas: las que apunto el instalador, la carpeta
//     del mod, o el PATH. Nunca de algo que diga la pagina.
//   - Cola limitada, dos a la vez, 30 pedidos por minuto y 45 minutos por descarga.
//   - "Mostrar en la carpeta" solo abre archivos que este proceso escribio, y dentro
//     de la carpeta de descargas.
//   - La sesion de YouTube (cookies) esta apagada de fabrica y solo se usa si el
//     usuario la enciende en el panel.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;
  const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
  const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
  const { setTimeout, clearTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const P = ZenDescargasPuro;
  const L = P.LIMITES;

  const DIR = 'zen-descargas';
  const PREF = {
    encendido: 'zen.descargas.encendido',
    calidad: 'zen.descargas.calidad',
    audio: 'zen.descargas.audio',
    cookies: 'zen.descargas.cookies',
    avisos: 'zen.descargas.avisos',
    actualizado: 'zen.descargas.actualizado',
  };
  const WIN = SV.appinfo.OS === 'WINNT';
  const EXE = WIN ? '.exe' : '';

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[descargas] ' + msg); } catch (e) { /* nada */ }
  };

  const idioma = () => {
    let f = 'auto';
    try { f = SV.prefs.getStringPref('zen.mods.idioma', 'auto'); } catch (e) { /* auto */ }
    if (f === 'es' || f === 'en') return f;
    try { return /^es\b/i.test(SV.locale.appLocaleAsBCP47) ? 'es' : 'en'; } catch (e) { return 'en'; }
  };
  const tr = (en, es) => (idioma() === 'es' ? es : en);

  // --- Archivos ----------------------------------------------------------------
  const archivo = (ruta) => {
    try {
      const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      f.initWithPath(ruta);
      return f;
    } catch (e) { return null; }
  };
  const existe = (ruta) => { const f = ruta && archivo(ruta); return !!(f && f.exists()); };
  const enElPerfil = (...partes) => {
    const f = SV.dirsvc.get('ProfD', Ci.nsIFile).clone();
    for (const p of partes) f.append(p);
    return f;
  };
  const leerJson = (f) => {
    try {
      if (!f.exists()) return null;
      const flujo = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
      flujo.init(f, 0x01, 0o444, 0);
      const conv = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
      conv.init(flujo, 'UTF-8', 0, 0xFFFD);
      let t = '';
      const trozo = {};
      while (conv.readString(4096, trozo) !== 0) t += trozo.value;
      conv.close();
      return JSON.parse(t);
    } catch (e) { return null; }
  };

  // --- Herramientas ------------------------------------------------------------
  // En orden: lo que apunto el instalador (herramientas.json), la carpeta bin del
  // mod y el PATH. Se busca una vez y se repite solo si algo desaparece.
  let herramientas = null;
  const buscarHerramientas = async () => {
    const h = { ytdlp: null, propio: false, ffmpeg: null, js: null };
    const bin = enElPerfil('chrome', DIR, 'bin');
    const apuntado = leerJson(enElPerfil('chrome', DIR, 'herramientas.json')) || {};
    const enBin = (n) => { const f = bin.clone(); f.append(n + EXE); return f.exists() ? f.path : null; };
    const enPath = async (n) => { try { return await Subprocess.pathSearch(n + EXE); } catch (e) { return null; } };

    h.ytdlp = enBin('yt-dlp') || (existe(apuntado.ytdlp) ? apuntado.ytdlp : null) || await enPath('yt-dlp');
    // Solo se actualiza la copia que es del mod: la de winget o brew la actualiza su gestor.
    h.propio = !!h.ytdlp && h.ytdlp.startsWith(bin.path);

    const ff = enBin('ffmpeg') || (existe(apuntado.ffmpeg) ? apuntado.ffmpeg : null) || await enPath('ffmpeg');
    if (ff) { const f = archivo(ff); h.ffmpeg = f && f.parent ? f.parent.path : null; }

    // yt-dlp necesita un motor de JavaScript para los retos de YouTube. Deno es el
    // que recomienda; Node vale igual y lo tiene cualquiera que haya usado el instalador.
    const deno = (existe(apuntado.deno) ? apuntado.deno : null) || await enPath('deno');
    const node = (existe(apuntado.node) ? apuntado.node : null) || await enPath('node');
    if (deno) h.js = { nombre: 'deno', ruta: deno };
    else if (node) h.js = { nombre: 'node', ruta: node };

    herramientas = h;
    registrar(`yt-dlp ${h.ytdlp || 'NO'} · ffmpeg ${h.ffmpeg || 'NO'} · js ${h.js ? h.js.nombre : 'NO'}`);
    return h;
  };
  const exigirHerramientas = async () => {
    if (!herramientas || !existe(herramientas.ytdlp)) await buscarHerramientas();
    return herramientas;
  };

  // --- Actualizar yt-dlp ---------------------------------------------------------
  // `yt-dlp -U` baja la ultima version de su pagina de GitHub y comprueba su SHA-256
  // antes de cambiarse. Una vez al dia como mucho, y antes de bajar, que es cuando
  // importa; si YouTube rompe algo a mitad del dia, el error fuerza otra vuelta.
  let actualizando = null;
  const actualizar = async (forzar) => {
    const h = await exigirHerramientas();
    if (!h.ytdlp || !h.propio) return;
    const ahora = Math.floor(Date.now() / 1000);
    let ultima = 0;
    try { ultima = SV.prefs.getIntPref(PREF.actualizado, 0); } catch (e) { /* 0 */ }
    if (!forzar && ahora - ultima < 24 * 3600) return;
    if (actualizando) return actualizando;
    actualizando = (async () => {
      try {
        const p = await Subprocess.call({ command: h.ytdlp, arguments: ['--ignore-config', '-U'], stderr: 'stdout' });
        let salida = '';
        for (let t = await p.stdout.readString(); t; t = await p.stdout.readString()) salida += t;
        const { exitCode } = await p.wait();
        SV.prefs.setIntPref(PREF.actualizado, ahora);
        registrar('actualizar yt-dlp: ' + (exitCode === 0 ? 'bien' : 'codigo ' + exitCode) + ' · ' + salida.trim().split('\n').pop());
      } catch (e) {
        registrar('no pude actualizar yt-dlp: ' + e);
      } finally {
        actualizando = null;
      }
    })();
    return actualizando;
  };

  // --- Ajustes -----------------------------------------------------------------
  const ajustes = () => {
    const leer = (fn, pref, defecto) => { try { return SV.prefs[fn](pref, defecto); } catch (e) { return defecto; } };
    const calidad = leer('getStringPref', PREF.calidad, '1080');
    const audio = leer('getStringPref', PREF.audio, 'mp3');
    return {
      calidad: P.CALIDADES.includes(calidad) ? calidad : '1080',
      audio: P.FORMATOS_AUDIO.includes(audio) ? audio : 'mp3',
      cookies: leer('getBoolPref', PREF.cookies, false),
    };
  };
  const ponerAjuste = (clave, valor) => {
    if (clave === 'cookies') SV.prefs.setBoolPref(PREF.cookies, valor);
    else SV.prefs.setStringPref(PREF[clave], valor);
  };

  let carpeta = null;
  const carpetaDescargas = async () => {
    try { carpeta = await Downloads.getPreferredDownloadsDirectory(); } catch (e) {
      carpeta = SV.dirsvc.get('DfltDwnld', Ci.nsIFile).path;
    }
    return carpeta;
  };
  // Una carpeta temporal por trabajo: los trozos a medio bajar (.part, la imagen y el
  // sonido antes de juntarlos, la portada) van ahi y no a Descargas. Al terminar,
  // cancelar o fallar se borra entera. MEDIDO: sin esto, cancelar dejaba un
  // `.f137.mp4.part` en la carpeta de descargas.
  const temporal = (t) => {
    try {
      const f = SV.dirsvc.get('TmpD', Ci.nsIFile);
      f.append(DIR);
      f.append(t.trabajo);
      return f.path;
    } catch (e) { return null; }
  };
  const borrarTemporal = (t) => {
    const f = t.temporal && archivo(t.temporal);
    try { if (f && f.exists()) f.remove(true); } catch (e) { registrar('no pude borrar ' + t.temporal + ': ' + e); }
  };

  // --- Trabajos ------------------------------------------------------------------
  const trabajos = new Map();   // id -> trabajo (por orden de llegada)
  const pedidos = [];           // instantes de los ultimos pedidos, para el limite
  let contador = 0;

  const publico = (t) => ({
    trabajo: t.trabajo,
    id: t.id,
    modo: t.modo,
    titulo: t.titulo,
    fase: t.fase,         // cola | bajando | procesando | hecha | error | cancelada
    pct: t.prog ? t.prog.pct || 0 : 0,
    velocidad: t.velocidad || 0,
    eta: t.eta,
    error: t.error || null,
    nombre: t.ruta ? t.ruta.split(/[\\/]/).pop() : null,
  });

  const estado = () => ({
    tipo: 'estado',
    listo: !!(herramientas && herramientas.ytdlp),
    ffmpeg: !!(herramientas && herramientas.ffmpeg),
    carpeta,
    ajustes: ajustes(),
    trabajos: [...trabajos.values()].map(publico).reverse(),
  });

  const enviar = (destino, msg) => {
    try { SV.ppmm.broadcastAsyncMessage('zen-descargas:a-pagina', { destino, msg }); } catch (e) { registrar('no pude avisar a las paginas: ' + e); }
  };

  // El progreso llega a decenas de lineas por segundo: a las pestanas, 4 por segundo.
  let pendiente = null;
  const difundir = (yaMismo) => {
    if (yaMismo) {
      if (pendiente) { clearTimeout(pendiente); pendiente = null; }
      enviar('*', estado());
      return;
    }
    if (pendiente) return;
    pendiente = setTimeout(() => { pendiente = null; enviar('*', estado()); }, 250);
  };

  const recortarHistorial = () => {
    const acabados = [...trabajos.values()].filter((t) => ['hecha', 'error', 'cancelada'].includes(t.fase));
    while (acabados.length > L.historial) trabajos.delete(acabados.shift().trabajo);
  };

  const avisar = (t) => {
    let si = true;
    try { si = SV.prefs.getBoolPref(PREF.avisos, true); } catch (e) { /* si */ }
    if (!si) return;
    try {
      const alertas = Cc['@mozilla.org/alerts-service;1'].getService(Ci.nsIAlertsService);
      const a = Cc['@mozilla.org/alert-notification;1'].createInstance(Ci.nsIAlertNotification);
      const titulo = t.fase === 'hecha' ? tr('Downloaded', 'Descargado') : tr('Download failed', 'No se pudo descargar');
      const cuerpo = t.fase === 'hecha' ? (t.ruta ? t.ruta.split(/[\\/]/).pop() : t.titulo) : (t.error ? t.error[idioma()] : t.titulo);
      a.init('zen-descargas-' + t.trabajo, '', titulo, cuerpo, t.fase === 'hecha', '', null, null, null, null, null, false);
      alertas.showAlert(a, t.fase === 'hecha' ? { observe(_, tema) { if (tema === 'alertclickcallback') mostrar(t.trabajo); } } : null);
    } catch (e) { /* sin avisos del sistema no pasa nada */ }
  };

  // Cuenta tambien los que ya arrancaron y aun esperan a la actualizacion de yt-dlp.
  const enMarcha = () => [...trabajos.values()].filter((t) => t.arrancando && ['cola', 'bajando', 'procesando'].includes(t.fase)).length;

  const siguiente = () => {
    for (const t of trabajos.values()) {
      if (enMarcha() >= L.simultaneas) return;
      if (t.fase === 'cola' && !t.arrancando) { t.arrancando = true; correr(t); }
    }
  };

  const terminar = (t, fase, error) => {
    t.fase = fase;
    if (error) t.error = error;
    t.proc = null;
    if (t.reloj) { clearTimeout(t.reloj); t.reloj = null; }
    borrarTemporal(t);
    recortarHistorial();
    difundir(true);
    if (fase === 'hecha' || fase === 'error') avisar(t);
    siguiente();
  };

  const correr = async (t) => {
    try {
      await actualizar(false);
      const h = await exigirHerramientas();
      if (!h.ytdlp) {
        terminar(t, 'error', { codigo: 'sin-ytdlp', en: 'yt-dlp is not installed. Run the installer for Downloader again.', es: 'Falta yt-dlp. Vuelve a ejecutar el instalador de Descargas.' });
        return;
      }
      if (t.fase === 'cancelada') return;
      const aj = ajustes();
      const args = P.argumentos(t, {
        calidad: aj.calidad,
        audio: aj.audio,
        carpeta: carpeta || await carpetaDescargas(),
        temporal: (t.temporal = temporal(t)),
        ffmpeg: h.ffmpeg,
        js: h.js,
        cookies: aj.cookies ? SV.dirsvc.get('ProfD', Ci.nsIFile).path : null,
      });
      t.fase = 'bajando';
      difundir(true);

      const proc = await Subprocess.call({
        command: h.ytdlp,
        arguments: args,
        stderr: 'stdout',
        environmentAppend: true,
        environment: { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      });
      t.proc = proc;
      if (t.fase === 'cancelada') { try { proc.kill(); } catch (e) { /* ya */ } }
      t.reloj = setTimeout(() => {
        if (!t.proc) return;
        t.motivo = 'tiempo';
        try { t.proc.kill(); } catch (e) { /* ya */ }
      }, L.duracionMax);

      let resto = '';
      let ultimoError = null;
      const linea = (l) => {
        const r = P.leerLinea(l);
        if (!r) return;
        if (r.tipo === 'titulo' && r.titulo) t.titulo = r.titulo.slice(0, 200);
        else if (r.tipo === 'archivo') { t.ruta = r.ruta; }
        else if (r.tipo === 'progreso') {
          t.prog = P.progreso(t.prog, r, t.modo, !!h.ffmpeg);
          t.velocidad = r.velocidad;
          t.eta = r.eta;
          // Las lineas de [ExtractAudio] o [Merger] no salen (los --print dejan a
          // yt-dlp en silencio): la ultima parte bajada entera es la senal de que
          // empieza la conversion, que en una cancion larga tarda unos segundos.
          const ultima = t.modo === 'audio' || !h.ffmpeg || t.prog.parte >= 1;
          const fase = ultima && r.total && r.bajado >= r.total ? 'procesando' : 'bajando';
          if (t.fase !== fase) { t.fase = fase; difundir(true); } else difundir(false);
        } else if (r.tipo === 'procesando') {
          if (t.fase !== 'procesando') { t.fase = 'procesando'; difundir(true); }
        } else if (r.tipo === 'error') ultimoError = r.texto;
      };
      for (let trozo = await proc.stdout.readString(); trozo; trozo = await proc.stdout.readString()) {
        const partes = (resto + trozo).split('\n');
        resto = partes.pop();
        for (const l of partes) linea(l);
      }
      if (resto) linea(resto);
      const { exitCode } = await proc.wait();

      if (t.fase === 'cancelada') { terminar(t, 'cancelada'); return; }
      if (t.motivo === 'tiempo') { terminar(t, 'error', { codigo: 'tiempo', en: 'It took too long and was stopped.', es: 'Tardaba demasiado y se paró.' }); return; }
      if (exitCode === 0 && t.ruta) {
        if (t.prog) t.prog.pct = 100;
        terminar(t, 'hecha');
        return;
      }
      registrar(`fallo ${t.id}: ${ultimoError || 'codigo ' + exitCode}`);
      // MEDIDO (19-11-2026): YouTube contesta 403 a una de cada tres descargas de
      // video, al azar, con el mismo yt-dlp y el mismo video. Las direcciones son de
      // un solo uso: volver a extraerlas lo arregla. Se reintenta solo, hasta dos veces.
      if (/HTTP Error 403|unable to download video data/i.test(ultimoError || '') && (t.reintentos || 0) < 2) {
        t.reintentos = (t.reintentos || 0) + 1;
        t.prog = null;
        t.proc = null;
        if (t.reloj) { clearTimeout(t.reloj); t.reloj = null; }
        correr(t);
        return;
      }
      const ex = P.explicarError(ultimoError || ('exit ' + exitCode));
      // Lo tipico cuando YouTube cambia algo: la proxima vez, yt-dlp nuevo.
      if (ex.codigo === 'ytdlp') actualizar(true);
      terminar(t, 'error', ex);
    } catch (e) {
      registrar('el trabajo ' + t.id + ' fallo: ' + e);
      terminar(t, 'error', P.explicarError(String(e)));
    }
  };

  const descargar = (m) => {
    const ahora = Date.now();
    while (pedidos.length && pedidos[0] < ahora - 60000) pedidos.shift();
    if (pedidos.length >= L.porMinuto) return { error: 'limite' };
    // El mismo video en el mismo modo, si ya esta en cola o bajando, no se repite.
    for (const t of trabajos.values()) {
      if (t.id === m.id && t.modo === m.modo && ['cola', 'bajando', 'procesando'].includes(t.fase)) return { error: 'repetido' };
    }
    if ([...trabajos.values()].filter((t) => t.fase === 'cola').length >= L.cola) return { error: 'cola' };
    pedidos.push(ahora);
    const t = { trabajo: (++contador).toString(36) + Math.floor(Math.random() * 1e6).toString(36), id: m.id, modo: m.modo, titulo: m.titulo || m.id, fase: 'cola' };
    trabajos.set(t.trabajo, t);
    difundir(true);
    siguiente();
    return { ok: t.trabajo };
  };

  const cancelar = (id) => {
    const t = trabajos.get(id);
    if (!t || !['cola', 'bajando', 'procesando'].includes(t.fase)) return;
    const habiaProceso = !!t.proc;
    t.fase = 'cancelada';
    if (habiaProceso) { try { t.proc.kill(); } catch (e) { /* ya */ } }
    else terminar(t, 'cancelada');
  };

  // nsIFile.contains compara rutas ya normalizadas (en Windows, tambien las cortas
  // tipo MXRNIN~1 contra las largas).
  const dentroDeDescargas = (ruta) => {
    if (!carpeta || !ruta || /(^|[\\/])\.\.([\\/]|$)/.test(ruta)) return false;
    const c = archivo(carpeta);
    const f = archivo(ruta);
    if (!c || !f) return false;
    try { c.normalize(); f.normalize(); return c.contains(f); } catch (e) { return false; }
  };

  const mostrar = (id) => {
    const t = trabajos.get(id);
    if (!t || t.fase !== 'hecha' || !dentroDeDescargas(t.ruta)) return;
    const f = archivo(t.ruta);
    try { if (f && f.exists()) f.reveal(); } catch (e) { registrar('no pude mostrar el archivo: ' + e); }
  };

  const abrirCarpeta = async () => {
    const f = archivo(carpeta || await carpetaDescargas());
    try { if (f && f.exists()) f.launch(); } catch (e) { registrar('no pude abrir la carpeta: ' + e); }
  };

  // --- Mensajes de las paginas ---------------------------------------------------
  SV.ppmm.addMessageListener('zen-descargas:desde-pagina', ({ data }) => {
    try {
      if (!data || typeof data.id !== 'string' || !/^[0-9a-f]{12}$/.test(data.id)) return;
      let encendido = true;
      try { encendido = SV.prefs.getBoolPref(PREF.encendido, true); } catch (e) { /* si */ }
      if (!encendido) return;
      const m = P.validar(data.msg);
      if (!m) return;
      switch (m.tipo) {
        case 'hola':
          enviar(data.id, estado());
          break;
        case 'descargar': {
          const r = descargar(m);
          if (r.error) enviar(data.id, { tipo: 'rechazo', motivo: r.error, id: m.id, modo: m.modo });
          break;
        }
        case 'cancelar': cancelar(m.trabajo); break;
        case 'mostrar': mostrar(m.trabajo); break;
        case 'quitar': {
          const t = trabajos.get(m.trabajo);
          if (t && ['hecha', 'error', 'cancelada'].includes(t.fase)) { trabajos.delete(m.trabajo); difundir(true); }
          break;
        }
        case 'carpeta': abrirCarpeta(); break;
        case 'ajuste': ponerAjuste(m.clave, m.valor); difundir(true); break;
        default:
      }
    } catch (e) {
      registrar('mensaje de una pagina: ' + e);
    }
  });

  // Al cerrar Zen no se quedan yt-dlp ni ffmpeg bajando por su cuenta.
  SV.obs.addObserver({
    observe() {
      for (const t of trabajos.values()) if (t.proc) { try { t.proc.kill(); } catch (e) { /* ya */ } }
    },
  }, 'quit-application-granted');

  // Arranque: la carpeta y las herramientas, sin bloquear nada.
  (async () => {
    await carpetaDescargas();
    await buscarHerramientas();
    difundir(true);
  })().catch((e) => registrar('arranque: ' + e));

  // Para inspeccionar desde la consola del navegador.
  globalThis.ZenDescargas = Object.freeze({
    estado: () => estado(),
    herramientas: () => herramientas,
    buscarHerramientas,
    actualizar,
  });
})();
