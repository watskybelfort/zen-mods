// Zen Inmersivo — el servicio. Vive en el proceso padre, una sola vez (campo
// `padre` del cargador compartido), despues de puro.js.
//
//   Catalogo   el styles.json de my-internet: el que trae el mod y, si hay, el
//              ultimo bajado. Se baja cada 2 horas, como la extension.
//   Ajustes    una pref de texto (zen.inmersivo.ajustes) con el JSON de puro.js.
//   Publicar   catalogo y ajustes van a sharedData; los procesos de contenido
//              escuchan el cambio y repintan solos.
//
// Si la extension Zen Internet sigue activa, el mod se queda quieto: los dos a la
// vez meterian la misma hoja dos veces y los atajos chocarian.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;
  const { setTimeout, setInterval } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const P = ZenInmersivoPuro;

  const DIR = 'zen-inmersivo';
  const PREF_AJUSTES = 'zen.inmersivo.ajustes';
  const PREF_ENCENDIDO = 'zen.inmersivo.encendido';
  const PREF_FECHA = 'zen.inmersivo.catalogo.fecha';
  const URL_CATALOGO = 'https://sameerasw.github.io/my-internet/styles.json';
  const ID_EXTENSION = '{91aa3897-2634-4a8a-9092-279db23a7689}';
  const CADA = 2 * 60 * 60 * 1000;
  const MAX_CATALOGO = 8 * 1024 * 1024;

  const registrar = (msg) => { try { SV.console.logStringMessage('[inmersivo] ' + msg); } catch (e) { /* nada */ } };

  const enElPerfil = (...partes) => {
    const f = SV.dirsvc.get('ProfD', Ci.nsIFile).clone();
    for (const p of partes) f.append(p);
    return f;
  };
  const leerTexto = (archivo) => {
    const flujo = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
    flujo.init(archivo, 0x01, 0o444, 0);
    const conv = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
    conv.init(flujo, 'UTF-8', 0, 0xFFFD);
    let t = '';
    const trozo = {};
    while (conv.readString(65536, trozo) !== 0) t += trozo.value;
    conv.close();
    flujo.close();
    return t;
  };

  // Escritura atomica: FileUtils escribe en un temporal y lo cambia por el bueno al
  // terminar. Un corte a medias deja el catalogo anterior, nunca uno roto.
  const escribirTexto = (archivo, texto) => {
    const { FileUtils } = ChromeUtils.importESModule('resource://gre/modules/FileUtils.sys.mjs');
    const salida = FileUtils.openSafeFileOutputStream(archivo);
    const conv = Cc['@mozilla.org/intl/converter-output-stream;1'].createInstance(Ci.nsIConverterOutputStream);
    conv.init(salida, 'UTF-8');
    conv.writeString(texto);
    conv.flush();
    FileUtils.closeSafeFileOutputStream(salida);
  };

  // --- Catalogo --------------------------------------------------------------------
  const Catalogo = {
    texto: null,
    origen: '',
    cargar() {
      for (const [nombre, origen] of [['catalogo-actual.json', 'bajado'], ['catalogo.json', 'incluido']]) {
        const f = enElPerfil('chrome', DIR, nombre);
        if (!f.exists()) continue;
        try {
          const t = leerTexto(f);
          if (P.catalogoValido(JSON.parse(t))) { this.texto = t; this.origen = origen; return true; }
          registrar(nombre + ' no tiene la forma de un catalogo; se ignora');
        } catch (e) {
          registrar('no pude leer ' + nombre + ': ' + e);
        }
      }
      return false;
    },
    async bajar(motivo) {
      try {
        const { NetUtil } = ChromeUtils.importESModule('resource://gre/modules/NetUtil.sys.mjs');
        const texto = await new Promise((resolver, rechazar) => {
          const canal = NetUtil.newChannel({ uri: URL_CATALOGO, loadUsingSystemPrincipal: true });
          canal.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS | Ci.nsIRequest.LOAD_BYPASS_CACHE;
          NetUtil.asyncFetch(canal, (flujo, resultado) => {
            try {
              if (!Components.isSuccessCode(resultado)) throw new Error('la peticion fallo');
              const estado = canal.QueryInterface(Ci.nsIHttpChannel).responseStatus;
              if (estado !== 200) throw new Error('respuesta ' + estado);
              const n = flujo.available();
              if (n > MAX_CATALOGO) throw new Error('demasiado grande: ' + n);
              resolver(NetUtil.readInputStreamToString(flujo, n, { charset: 'UTF-8' }));
            } catch (e) { rechazar(e); }
          });
        });
        if (!P.catalogoValido(JSON.parse(texto))) throw new Error('lo bajado no tiene la forma de un catalogo');
        const destino = enElPerfil('chrome', DIR, 'catalogo-actual.json');
        escribirTexto(destino, texto);
        SV.prefs.setStringPref(PREF_FECHA, String(Date.now()));
        const cambio = texto !== this.texto;
        this.texto = texto;
        this.origen = 'bajado';
        if (cambio) publicar();
        registrar(`catalogo bajado (${motivo}): ${Math.round(texto.length / 1024)} KB${cambio ? '' : ', sin cambios'}`);
        return { ok: true, cambio };
      } catch (e) {
        registrar('no pude bajar el catalogo: ' + e);
        return { ok: false, error: String(e) };
      }
    },
    ultima() {
      return Number(SV.prefs.getStringPref(PREF_FECHA, '0')) || 0;
    },
  };

  // --- Ajustes -------------------------------------------------------------------
  const leerAjustes = () => {
    try { return P.ajustesCompletos(JSON.parse(SV.prefs.getStringPref(PREF_AJUSTES, '{}'))); } catch (e) { return P.ajustesCompletos({}); }
  };
  const guardarAjustes = (a) => {
    const limpio = P.ajustesCompletos(a);
    // El chat movible guarda posicion y opacidad aparte, como la extension.
    if (a && a.chat && typeof a.chat === 'object') limpio.chat = a.chat;
    SV.prefs.setStringPref(PREF_AJUSTES, JSON.stringify(limpio));
  };

  // --- La extension ---------------------------------------------------------------
  // Mientras Zen Internet este activa, el mod no pinta nada.
  let extensionActiva = false;
  const mirarExtension = async () => {
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const a = await AddonManager.getAddonByID(ID_EXTENSION);
      const antes = extensionActiva;
      extensionActiva = !!(a && a.isActive);
      if (antes !== extensionActiva) {
        registrar(extensionActiva ? 'Zen Internet esta activa: el mod se queda quieto' : 'Zen Internet no esta activa: el mod pinta');
        publicar();
      }
    } catch (e) {
      registrar('no pude mirar si Zen Internet esta activa: ' + e);
    }
  };

  // --- Publicar ------------------------------------------------------------------
  let version = 0;
  const publicar = () => {
    try {
      const sd = SV.ppmm.sharedData;
      if (Catalogo.texto && sd.get('zen-inmersivo:catalogo') !== Catalogo.texto) sd.set('zen-inmersivo:catalogo', Catalogo.texto);
      sd.set('zen-inmersivo:ajustes', JSON.stringify(Object.assign(leerAjustes(), { chat: chatGuardado() })));
      sd.set('zen-inmersivo:activo', SV.prefs.getBoolPref(PREF_ENCENDIDO, true) && !extensionActiva);
      sd.set('zen-inmersivo:extension', extensionActiva);
      sd.set('zen-inmersivo:origen', Catalogo.origen);
      sd.set('zen-inmersivo:version', ++version);
      sd.flush();
    } catch (e) {
      registrar('no pude publicar: ' + e);
    }
  };
  const chatGuardado = () => {
    try { const a = JSON.parse(SV.prefs.getStringPref(PREF_AJUSTES, '{}')); return a.chat || null; } catch (e) { return null; }
  };

  // --- Lo que piden las ventanas y las pestanas --------------------------------------
  // Las ventanas (ventana.js) no ven este ambito: leen la pref y sharedData, y
  // para pedir el catalogo nuevo mandan este aviso.
  SV.obs.addObserver({ observe: () => { Catalogo.bajar('a mano'); } }, 'zen-inmersivo:bajar');

  SV.ppmm.addMessageListener('zen-inmersivo:chat', ({ data }) => {
    try {
      const pos = data && data.posicion;
      const ok = (v) => typeof v === 'string' && /^(auto|-?\d{1,5}(\.\d+)?px)$/.test(v);
      const limpia = pos && typeof pos === 'object'
        ? Object.fromEntries(['top', 'left', 'right', 'width', 'height'].filter((k) => ok(pos[k])).map((k) => [k, pos[k]]))
        : null;
      const op = Number(data && data.opacidad);
      const a = JSON.parse(SV.prefs.getStringPref(PREF_AJUSTES, '{}') || '{}');
      a.chat = { posicion: limpia, opacidad: Number.isFinite(op) ? Math.min(1, Math.max(0.1, op)) : 1 };
      SV.prefs.setStringPref(PREF_AJUSTES, JSON.stringify(a));
    } catch (e) {
      registrar('no pude guardar el chat: ' + e);
    }
  });

  // --- Arranque ------------------------------------------------------------------
  if (!Catalogo.cargar()) registrar('no hay catalogo en el perfil; reinstala con instalar-inmersivo.mjs');
  SV.prefs.addObserver(PREF_AJUSTES, { observe: () => publicar() });
  SV.prefs.addObserver(PREF_ENCENDIDO, { observe: () => publicar() });
  publicar();

  // UNA VEZ: al instalar el mod, la extension se DESACTIVA (no se desinstala: se
  // vuelve a encender en about:addons). La pref se apaga despues, asi que si el
  // usuario la reactiva a proposito, el mod no se la vuelve a quitar: se queda
  // quieto mientras ella este activa, como siempre.
  const retirarExtension = async () => {
    if (!SV.prefs.getBoolPref('zen.inmersivo.retirar-extension', false)) return;
    SV.prefs.setBoolPref('zen.inmersivo.retirar-extension', false);
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      const a = await AddonManager.getAddonByID(ID_EXTENSION);
      if (a && a.isActive) { await a.disable(); registrar('Zen Internet desactivada: la sustituye este mod'); }
    } catch (e) {
      registrar('no pude desactivar Zen Internet: ' + e);
    }
  };

  const arrancar = async () => {
    await retirarExtension();
    await mirarExtension();
    try {
      const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      AddonManager.addAddonListener({
        onEnabled: (a) => { if (a.id === ID_EXTENSION) mirarExtension(); },
        onDisabled: (a) => { if (a.id === ID_EXTENSION) mirarExtension(); },
        onUninstalled: (a) => { if (a.id === ID_EXTENSION) mirarExtension(); },
        onInstalled: (a) => { if (a.id === ID_EXTENSION) mirarExtension(); },
      });
    } catch (e) { /* sin oyente: se mira al arrancar */ }
    const tocaBajar = () => leerAjustes().global.autoUpdate && Date.now() - Catalogo.ultima() > CADA - 60000;
    if (tocaBajar()) Catalogo.bajar('al arrancar');
    setInterval(() => { if (tocaBajar()) Catalogo.bajar('cada 2 horas'); }, 10 * 60 * 1000);
  };
  let arrancado = false;
  const unaVez = () => { if (!arrancado) { arrancado = true; arrancar(); } };
  SV.obs.addObserver({ observe: unaVez }, 'final-ui-startup');
  setTimeout(unaVez, 5000);
  registrar('servicio en pie (catalogo ' + Catalogo.origen + ')');
})();
