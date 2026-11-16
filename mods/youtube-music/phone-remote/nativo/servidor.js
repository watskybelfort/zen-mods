// Zen Remoto — el servidor. Vive en el proceso padre de Zen, una sola vez, y lo
// carga el cargador compartido (core/config.js, campo `padre`) despues de puro.js.
//
// Sirve la app del movil y su API por HTTP en la red de casa, y pasa las ordenes a
// la pestana de YouTube Music por el message manager (ver proceso.js).
//
// SIN PROCESOS APARTE ----------------------------------------------------------
// Un servidor en node seria mas corto de escribir, pero seria un proceso residente
// mas que arrancar, vigilar y cerrar. Gecko trae sockets de servidor
// (nsIServerSocket) y flujos asincronos: con eso basta para un HTTP/1.1 minimo, una
// peticion por conexion. Zen abierto = mando disponible; Zen cerrado = puerto
// cerrado.
//
// EL PISO DE SEGURIDAD --------------------------------------------------------
//   - Solo contesta a IPs de redes privadas (puro.esPrivada). Radmin VPN usa IPs
//     publicas (26.x): no entra.
//   - Host tiene que ser una IP literal con el puerto: corta el DNS rebinding.
//   - POST solo con Origin igual al Host y cuerpo JSON: corta el CSRF.
//   - Emparejar: codigo de 6 cifras que solo existe mientras el panel del PC esta
//     abierto, caduca a los 5 minutos y sirve una vez. 5 fallos por IP o 20 en
//     total en 10 minutos lo bloquean.
//   - Sesion: cookie HttpOnly SameSite=Strict con 32 bytes al azar. Se guarda solo
//     su SHA-256. "Olvidar moviles" y "Salir" la invalidan en el servidor.
//   - Limite de peticiones por IP, de conexiones, de cuerpo y de tiempo.
//   - Cabeceras: CSP estricta, nosniff, sin referrer, sin marcos.
//   - Cada orden pasa por puro.validar antes de llegar a la pagina.
// Sin TLS: es HTTP en la red local. Quien escuche la wifi podria ver la cookie;
// esta dicho en el readme.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;
  const { setTimeout, clearTimeout, setInterval } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const P = ZenRemotoPuro;

  const PREF_ENCENDIDO = 'zen.remoto.encendido';
  const PREF_PUERTO = 'zen.remoto.puerto';
  const PREF_DISPOSITIVOS = 'zen.remoto.dispositivos';
  const DIR = 'zen-remoto';
  const VERSION = '1.0.0';

  const LIM = {
    cabeceras: 16 * 1024,
    cuerpo: 16 * 1024,
    conexiones: 48,
    esperaLectura: 10000,
    esperaLarga: 25000,
    esperasPorIp: 4,
    ordenTimeout: 15000,
    cubeta: 40,          // peticiones de golpe por IP
    recarga: 8,          // y por segundo
    codigoVida: 5 * 60 * 1000,
    fallosIp: 5,
    fallosTotal: 20,
    ventanaFallos: 10 * 60 * 1000,
    dispositivos: 8,
    pestanaViva: 15000,
  };

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[remoto] ' + msg); } catch (e) { /* nada */ }
  };

  // --- Utilidades ----------------------------------------------------------------
  const aUtf8 = (s) => unescape(encodeURIComponent(String(s)));
  const deUtf8 = (b) => decodeURIComponent(escape(b));
  const hex = (bytes) => Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join('');
  const azar = (n) => Cc['@mozilla.org/security/random-generator;1'].getService(Ci.nsIRandomGenerator).generateRandomBytes(n);
  const sha256 = (s) => {
    const h = Cc['@mozilla.org/security/hash;1'].createInstance(Ci.nsICryptoHash);
    h.init(h.SHA256);
    const bin = aUtf8(s);
    const arr = new Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    h.update(arr, arr.length);
    const out = h.finish(false);
    let r = '';
    for (let i = 0; i < out.length; i++) r += out.charCodeAt(i).toString(16).padStart(2, '0');
    return r;
  };
  const iguales = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  };
  const codigoNuevo = () => {
    // Rechazo para que las seis cifras salgan uniformes.
    for (;;) {
      const b = azar(4);
      const n = ((b[0] << 24) >>> 0) + (b[1] << 16) + (b[2] << 8) + b[3];
      if (n < 4294000000) return String(n % 1000000).padStart(6, '0');
    }
  };

  const enElPerfil = (...partes) => {
    const f = SV.dirsvc.get('ProfD', Ci.nsIFile).clone();
    for (const p of partes) f.append(p);
    return f;
  };
  const leerBinario = (archivo) => {
    const flujo = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
    flujo.init(archivo, 0x01, 0o444, 0);
    const bin = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
    bin.setInputStream(flujo);
    let s = '';
    for (let n = bin.available(); n > 0; n = bin.available()) s += bin.readBytes(n);
    bin.close();
    return s;
  };

  // --- La app del movil ----------------------------------------------------------
  const TIPOS = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    svg: 'image/svg+xml',
    woff2: 'font/woff2',
    webmanifest: 'application/manifest+json',
    png: 'image/png',
    txt: 'text/plain; charset=utf-8',
  };
  // Lista cerrada: no se sirve nada que no este aqui, ni con ../ ni con nada.
  const ESTATICOS = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/app.js': 'app.js',
    '/estilo.css': 'estilo.css',
    '/geist.woff2': 'geist.woff2',
    '/iconos.svg': 'iconos.svg',
    '/icono.png': 'icono.png',
    '/icono-512.png': 'icono-512.png',
    '/manifest.webmanifest': 'manifest.webmanifest',
    '/LICENCIA-GEIST.txt': 'LICENCIA-GEIST.txt',
    '/LICENCIA-PHOSPHOR.txt': 'LICENCIA-PHOSPHOR.txt',
  };
  const cacheEstaticos = new Map();
  const estatico = (nombre) => {
    const f = enElPerfil('chrome', DIR, 'movil', nombre);
    if (!f.exists()) return null;
    const c = cacheEstaticos.get(nombre);
    if (c && c.t === f.lastModifiedTime) return c;
    const nuevo = { t: f.lastModifiedTime, cuerpo: leerBinario(f), tipo: TIPOS[nombre.split('.').pop()] || 'application/octet-stream' };
    cacheEstaticos.set(nombre, nuevo);
    return nuevo;
  };

  // --- Dispositivos ------------------------------------------------------------------
  const Dispositivos = {
    lista: [],
    cargar() {
      try {
        const v = JSON.parse(SV.prefs.getStringPref(PREF_DISPOSITIVOS, '[]'));
        this.lista = Array.isArray(v) ? v.filter((d) => d && typeof d.h === 'string' && /^[0-9a-f]{64}$/.test(d.h)) : [];
      } catch (e) { this.lista = []; }
    },
    guardar() {
      try { SV.prefs.setStringPref(PREF_DISPOSITIVOS, JSON.stringify(this.lista)); } catch (e) { registrar('no pude guardar los dispositivos: ' + e); }
    },
    nuevo(nombre) {
      const token = hex(azar(32));
      this.lista.push({ h: sha256(token), n: String(nombre || 'Móvil').slice(0, 60), c: Date.now(), v: Date.now() });
      while (this.lista.length > LIM.dispositivos) this.lista.shift();
      this.guardar();
      return token;
    },
    buscar(token) {
      if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
      const h = sha256(token);
      return this.lista.find((d) => iguales(d.h, h)) || null;
    },
    quitar(d) {
      this.lista = this.lista.filter((x) => x !== d);
      this.guardar();
    },
    olvidar() {
      this.lista = [];
      this.guardar();
    },
  };

  // --- Emparejar -------------------------------------------------------------------
  const Emparejar = {
    codigo: null,        // { valor, caduca }
    paneles: new Set(),  // pestanas con el panel abierto
    fallos: new Map(),   // ip -> [instantes]
    fallosTotal: [],
    bloqueadoHasta: 0,

    vivo() {
      if (this.codigo && this.codigo.caduca < Date.now()) this.codigo = null;
      if (!this.paneles.size || Date.now() < this.bloqueadoHasta) { this.codigo = null; return null; }
      if (!this.codigo) this.codigo = { valor: codigoNuevo(), caduca: Date.now() + LIM.codigoVida };
      return this.codigo;
    },
    limpiar(lista) {
      const corte = Date.now() - LIM.ventanaFallos;
      while (lista.length && lista[0] < corte) lista.shift();
      return lista;
    },
    bloqueada(ip) {
      return this.limpiar(this.fallos.get(ip) || []).length >= LIM.fallosIp;
    },
    fallo(ip) {
      const l = this.fallos.get(ip) || [];
      l.push(Date.now());
      this.fallos.set(ip, this.limpiar(l));
      this.limpiar(this.fallosTotal).push(Date.now());
      if (this.fallosTotal.length >= LIM.fallosTotal) {
        this.bloqueadoHasta = Date.now() + LIM.ventanaFallos;
        this.codigo = null;
        this.fallosTotal = [];
        registrar('demasiados intentos de emparejar: pausa de 10 minutos');
      }
    },
    probar(ip, valor) {
      const c = this.vivo();
      if (!c || typeof valor !== 'string' || !/^\d{6}$/.test(valor) || !iguales(valor, c.valor)) {
        this.fallo(ip);
        return false;
      }
      this.codigo = null;
      return true;
    },
  };

  // --- Pestanas de YouTube Music ------------------------------------------------------
  const Pestanas = {
    mapa: new Map(), // id -> { estado, t, recibido, sono }
    version: 1,
    elegida: null,

    elegir() {
      const ahora = Date.now();
      let mejor = null;
      for (const [id, p] of this.mapa) {
        if (ahora - p.recibido > LIM.pestanaViva) { this.mapa.delete(id); continue; }
        const puntos = (p.estado && p.estado.sonando ? 4e12 : 0) + (p.sono || 0) + p.recibido / 1000;
        if (!mejor || puntos > mejor.puntos) mejor = { id, p, puntos };
      }
      const id = mejor ? mejor.id : null;
      if (id !== this.elegida) { this.elegida = id; this.version++; }
      return mejor ? { id, ...mejor.p } : null;
    },
    estado(id, estado, t) {
      const ahora = Date.now();
      const p = this.mapa.get(id) || { sono: 0 };
      p.estado = estado;
      p.t = Number(t) || ahora;
      p.recibido = ahora;
      if (estado && estado.sonando) p.sono = ahora;
      this.mapa.set(id, p);
      const antes = this.elegida;
      const e = this.elegir();
      if ((e && e.id === id) || antes !== this.elegida) {
        this.version++;
        Esperas.despertar();
      }
    },
    adios(id) {
      this.mapa.delete(id);
      Emparejar.paneles.delete(id);
      this.elegir();
      this.version++;
      Esperas.despertar();
    },
  };

  const aPagina = (destino, msg) => {
    try { SV.ppmm.broadcastAsyncMessage('zen-remoto:a-pagina', { destino, msg }); } catch (e) { registrar('no pude hablar con las pestanas: ' + e); }
  };

  const Ordenes = {
    n: 0,
    pendientes: new Map(),
    enviar(orden, args) {
      const p = Pestanas.elegir();
      if (!p) return Promise.resolve({ ok: false, error: 'sin-pestana' });
      const id = 'o' + (++this.n);
      return new Promise((resolver) => {
        const timer = setTimeout(() => {
          this.pendientes.delete(id);
          resolver({ ok: false, error: 'la pestana no contesto' });
        }, LIM.ordenTimeout);
        this.pendientes.set(id, { resolver, timer });
        aPagina(p.id, { tipo: 'orden', id, orden, args });
      });
    },
    respuesta(msg) {
      const p = this.pendientes.get(msg.id);
      if (!p) return;
      this.pendientes.delete(msg.id);
      clearTimeout(p.timer);
      p.resolver(msg.ok ? { ok: true, datos: msg.datos || {} } : { ok: false, error: String(msg.error || 'error') });
    },
  };

  // --- Direccion de la red de casa -------------------------------------------------
  // La que va en el QR. La mejor pista es la IP a la que ya se conecto un movil;
  // si aun no hay, las del propio equipo, por orden: 192.168 (la wifi de casa),
  // 10 (puede ser ZeroTier), 172.16-31 (suelen ser Hyper-V o WSL).
  const Red = {
    ips: [],
    vista: null,
    puntos(ip) {
      if (/^192\.168\./.test(ip)) return 3;
      if (/^10\./.test(ip)) return 2;
      if (/^172\./.test(ip)) return 1;
      return 0;
    },
    buscar() {
      try {
        const dns = SV.dns;
        const banderas = (Ci.nsIDNSService.RESOLVE_DISABLE_IPV6 || 0) | (Ci.nsIDNSService.RESOLVE_BYPASS_CACHE || 0) | (Ci.nsIDNSService.RESOLVE_DISABLE_TRR || 0);
        const oyente = {
          onLookupComplete: (_req, registro, estado) => {
            if (!Components.isSuccessCode(estado)) return;
            const ips = [];
            try {
              const r = registro.QueryInterface(Ci.nsIDNSAddrRecord);
              while (r.hasMore()) ips.push(r.getNextAddrAsString());
            } catch (e) { /* sin direcciones */ }
            this.ips = ips.filter((ip) => P.esPrivada(ip) && !/^(127\.|169\.254\.)/.test(ip) && !ip.includes(':'))
              .sort((a, b) => this.puntos(b) - this.puntos(a));
          },
          QueryInterface: ChromeUtils.generateQI(['nsIDNSListener']),
        };
        dns.asyncResolve(dns.myHostName, Ci.nsIDNSService.RESOLVE_TYPE_DEFAULT, banderas, null, oyente, SV.tm.mainThread, {});
      } catch (e) {
        registrar('no pude averiguar la IP del equipo: ' + e);
      }
    },
    mejor() {
      return this.vista || this.ips[0] || null;
    },
  };

  // --- Esperas largas (estado) -------------------------------------------------------
  const Esperas = {
    lista: new Set(),
    despertar() {
      for (const e of [...this.lista]) {
        if (Pestanas.version > e.v) { this.lista.delete(e); clearTimeout(e.timer); e.responder(); }
      }
    },
    porIp(ip) {
      let n = 0;
      for (const e of this.lista) if (e.ip === ip) n++;
      return n;
    },
  };

  // --- HTTP ---------------------------------------------------------------------------
  const TEXTOS = { 200: 'OK', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 413: 'Payload Too Large', 415: 'Unsupported Media Type', 421: 'Misdirected Request', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large', 500: 'Internal Server Error', 503: 'Service Unavailable' };
  const CSP = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: https://*.ytimg.com https://*.googleusercontent.com https://*.ggpht.com",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  const CABECERAS = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };

  const Cubetas = new Map(); // ip -> { fichas, t }
  const gastar = (ip, coste = 1) => {
    const ahora = Date.now();
    const c = Cubetas.get(ip) || { fichas: LIM.cubeta, t: ahora };
    c.fichas = Math.min(LIM.cubeta, c.fichas + ((ahora - c.t) / 1000) * LIM.recarga);
    c.t = ahora;
    Cubetas.set(ip, c);
    if (c.fichas < coste) return false;
    c.fichas -= coste;
    return true;
  };

  let conexiones = 0;

  class Conexion {
    constructor(transporte) {
      this.tr = transporte;
      this.datos = '';
      this.cerrada = false;
      this.respondida = false;
      conexiones++;
      try { this.ip = transporte.getScriptablePeerAddr().address; } catch (e) { this.ip = ''; }
      try { this.ipPropia = transporte.getScriptableSelfAddr().address; } catch (e) { this.ipPropia = ''; }
      this.entrada = transporte.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream);
      this.bin = Cc['@mozilla.org/binaryinputstream;1'].createInstance(Ci.nsIBinaryInputStream);
      this.bin.setInputStream(this.entrada);
      this.salida = transporte.openOutputStream(0, 0, 0);
      this.timer = setTimeout(() => this.cerrar(), LIM.esperaLectura);
      this.esperar();
    }

    esperar() {
      try {
        this.entrada.asyncWait({ onInputStreamReady: () => this.leer() }, 0, 0, SV.tm.mainThread);
      } catch (e) { this.cerrar(); }
    }

    leer() {
      if (this.cerrada || this.respondida) return;
      let n;
      try { n = this.entrada.available(); } catch (e) { this.cerrar(); return; }
      if (n > 0) {
        try { this.datos += this.bin.readBytes(Math.min(n, LIM.cabeceras + LIM.cuerpo)); } catch (e) { this.cerrar(); return; }
      }
      const fin = this.datos.indexOf('\r\n\r\n');
      if (fin < 0) {
        if (this.datos.length > LIM.cabeceras) { this.responder(431, { error: 'cabeceras demasiado grandes' }); return; }
        this.esperar();
        return;
      }
      if (!this.peticion) {
        const lineas = this.datos.slice(0, fin).split('\r\n');
        const [metodo, objetivo, version] = (lineas.shift() || '').split(' ');
        if (!metodo || !objetivo || !/^HTTP\/1\.[01]$/.test(version || '')) { this.responder(400, { error: 'peticion rara' }); return; }
        const cab = {};
        for (const l of lineas) {
          const i = l.indexOf(':');
          if (i > 0) cab[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
        }
        const largo = Number(cab['content-length'] || 0);
        if (!Number.isInteger(largo) || largo < 0) { this.responder(400, { error: 'content-length raro' }); return; }
        if (largo > LIM.cuerpo) { this.responder(413, { error: 'cuerpo demasiado grande' }); return; }
        this.peticion = { metodo, objetivo, cab, largo, inicio: fin + 4 };
      }
      const p = this.peticion;
      if (this.datos.length - p.inicio < p.largo) { this.esperar(); return; }
      p.cuerpo = this.datos.slice(p.inicio, p.inicio + p.largo);
      clearTimeout(this.timer);
      try {
        Promise.resolve(atender(this, p)).catch((e) => {
          registrar('fallo atendiendo ' + p.objetivo.split('?')[0] + ': ' + e);
          this.responder(500, { error: 'fallo interno' });
        });
      } catch (e) {
        registrar('fallo atendiendo: ' + e);
        this.responder(500, { error: 'fallo interno' });
      }
    }

    responder(estado, cuerpo, extra = {}) {
      if (this.cerrada || this.respondida) return;
      this.respondida = true;
      clearTimeout(this.timer);
      let bin;
      let tipo;
      if (cuerpo && typeof cuerpo === 'object' && cuerpo.binario !== undefined) {
        bin = cuerpo.binario;
        tipo = cuerpo.tipo;
      } else {
        bin = aUtf8(JSON.stringify(cuerpo === undefined ? {} : cuerpo));
        tipo = 'application/json; charset=utf-8';
      }
      const cab = Object.assign({}, CABECERAS, { 'Content-Type': tipo, 'Cache-Control': 'no-store' }, extra);
      let texto = `HTTP/1.1 ${estado} ${TEXTOS[estado] || 'OK'}\r\n`;
      for (const [k, v] of Object.entries(cab)) {
        for (const x of [].concat(v)) texto += `${k}: ${String(x).replace(/[\r\n]/g, '')}\r\n`;
      }
      texto += `Content-Length: ${bin.length}\r\nConnection: close\r\n\r\n`;
      try {
        const fuente = Cc['@mozilla.org/io/string-input-stream;1'].createInstance(Ci.nsIStringInputStream);
        fuente.setByteStringData(texto + bin);
        const copia = Cc['@mozilla.org/network/async-stream-copier;1'].createInstance(Ci.nsIAsyncStreamCopier);
        // Fuente con buffer (la cadena), destino sin buffer (el socket); sin cerrar
        // el destino: el cierre lo lleva terminar().
        copia.init(fuente, this.salida, null, true, false, 0x8000, true, false);
        copia.asyncCopy({
          onStartRequest: () => {},
          onStopRequest: () => this.terminar(),
          QueryInterface: ChromeUtils.generateQI(['nsIRequestObserver']),
        }, null);
      } catch (e) {
        registrar('no pude responder: ' + e);
        this.cerrar();
      }
    }

    // CIERRE CON ESPERA ---------------------------------------------- MEDIDO -
    // Medido el 16-11-2026: cerrar el socket en cuanto se termina de escribir
    // hacia que 1 de cada 7 respuestas llegara cortada con un RST (ECONNRESET a
    // mitad del cuerpo), y con 7 peticiones a la vez, la mitad. Una carga de la
    // pagina son 7: si caia app.js, el movil se quedaba en negro. Es el cierre
    // de toda la vida de los servidores HTTP: se cierra la salida, se lee y se
    // tira lo que llegue hasta que el otro lado cierre, y solo entonces se suelta
    // el socket. Con tope de 3 s para que nadie lo retenga.
    terminar() {
      if (this.cerrada) return;
      try { this.salida.close(); } catch (e) { /* ya cerrada */ }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.cerrar(), 3000);
      const drenar = () => {
        if (this.cerrada) return;
        try {
          this.entrada.asyncWait({
            onInputStreamReady: () => {
              let n = 0;
              try { n = this.entrada.available(); } catch (e) { this.cerrar(); return; }
              if (n > 0) { try { this.bin.readBytes(n); } catch (e) { this.cerrar(); return; } }
              drenar();
            },
          }, 0, 0, SV.tm.mainThread);
        } catch (e) { this.cerrar(); }
      };
      drenar();
    }

    cerrar() {
      if (this.cerrada) return;
      this.cerrada = true;
      conexiones--;
      clearTimeout(this.timer);
      try { this.entrada.close(); } catch (e) { /* ya cerrada */ }
      try { this.salida.close(); } catch (e) { /* ya cerrada */ }
      try { this.tr.close(Cr.NS_OK); } catch (e) { /* ya cerrado */ }
    }
  }

  const leerCookie = (cab) => {
    const c = cab.cookie || '';
    for (const parte of c.split(';')) {
      const [k, ...v] = parte.trim().split('=');
      if (k === 'zr') return v.join('=');
    }
    return null;
  };
  const COOKIE_FUERA = 'zr=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';

  const nombreDe = (ua) => {
    const s = String(ua || '');
    if (/iPhone/.test(s)) return 'iPhone';
    if (/iPad/.test(s)) return 'iPad';
    const m = s.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/);
    if (m && m[1] && !/^(K|wv)$/.test(m[1].trim())) return m[1].trim().slice(0, 40);
    if (/Android/.test(s)) return 'Android';
    return 'Móvil';
  };

  const infoPara = (id) => {
    const c = Emparejar.vivo();
    const puerto = Servidor.puerto;
    const ip = Red.mejor();
    const ahora = Date.now();
    return {
      url: ip ? `http://${ip}:${puerto}` : null,
      codigo: c ? c.valor : null,
      bloqueado: ahora < Emparejar.bloqueadoHasta,
      dispositivos: Dispositivos.lista.length,
      conectados: Dispositivos.lista.filter((d) => ahora - (d.vivo || 0) < 30000).length,
      otras: Red.ips.filter((x) => x !== ip).map((x) => `http://${x}:${puerto}`),
      error: Servidor.error || (!ip ? 'No encuentro la IP del equipo en la red de casa.' : null),
      elegida: Pestanas.elegida === id,
    };
  };

  // Lo que va al movil en cada vuelta del estado.
  const estadoParaMovil = () => {
    const p = Pestanas.elegir();
    const ahora = Date.now();
    if (!p) return { v: Pestanas.version, sinPestana: true, version: VERSION };
    return { v: Pestanas.version, estado: p.estado, edad: Math.max(0, ahora - (p.t || ahora)), version: VERSION };
  };

  const abrirYouTubeMusic = () => {
    const win = SV.wm.getMostRecentWindow('navigator:browser');
    if (!win || !win.gBrowser) return false;
    const url = 'https://music.youtube.com/';
    const opciones = { inBackground: true, triggeringPrincipal: SV.scriptSecurityManager.getSystemPrincipal() };
    if (typeof win.gBrowser.addTrustedTab === 'function') win.gBrowser.addTrustedTab(url, opciones);
    else win.gBrowser.addTab(url, opciones);
    return true;
  };

  const atender = async (con, p) => {
    const ip = con.ip;
    if (!P.esPrivada(ip)) { con.cerrar(); return; }
    if (!P.hostValido(p.cab.host, Servidor.puerto)) { con.responder(421, { error: 'host' }); return; }
    const [ruta, consulta = ''] = p.objetivo.split('?');

    // Los archivos de la pagina cuestan un cuarto: son baratos de servir y un 429
    // en app.js deja el movil en negro. Las ordenes y la API pagan entero.
    if (!gastar(ip, ruta.startsWith('/api/') ? 1 : 0.25)) { con.responder(429, { error: 'despacio' }, { 'Retry-After': '2' }); return; }

    // Estaticos.
    if (!ruta.startsWith('/api/')) {
      if (p.metodo !== 'GET' && p.metodo !== 'HEAD') { con.responder(405, { error: 'metodo' }); return; }
      const nombre = ESTATICOS[ruta];
      const f = nombre && estatico(nombre);
      if (!f) { con.responder(404, { error: 'no existe' }); return; }
      const cache = nombre === 'index.html' ? 'no-store' : 'no-cache';
      con.responder(200, { binario: p.metodo === 'HEAD' ? '' : f.cuerpo, tipo: f.tipo }, { 'Cache-Control': cache });
      return;
    }

    // API: los POST, solo desde la propia app (Origin igual al Host) y con JSON.
    let cuerpo = {};
    if (p.metodo === 'POST') {
      if (p.cab.origin !== `http://${p.cab.host}`) { con.responder(403, { error: 'origen' }); return; }
      if (!/^application\/json\b/i.test(p.cab['content-type'] || '')) { con.responder(415, { error: 'tipo' }); return; }
      try { cuerpo = p.cuerpo ? JSON.parse(deUtf8(p.cuerpo)) : {}; } catch (e) { con.responder(400, { error: 'json' }); return; }
      if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) { con.responder(400, { error: 'json' }); return; }
    } else if (p.metodo !== 'GET') { con.responder(405, { error: 'metodo' }); return; }

    if (ruta === '/api/emparejar') {
      if (p.metodo !== 'POST') { con.responder(405, { error: 'metodo' }); return; }
      if (Emparejar.bloqueada(ip) || Date.now() < Emparejar.bloqueadoHasta) { con.responder(429, { error: 'demasiados-intentos' }); return; }
      if (!Emparejar.probar(ip, cuerpo.codigo)) {
        con.responder(401, { error: Emparejar.paneles.size ? 'codigo-malo' : 'abre-el-panel' });
        return;
      }
      const token = Dispositivos.nuevo(nombreDe(p.cab['user-agent']));
      if (P.esPrivada(con.ipPropia) && !/^127\./.test(con.ipPropia)) Red.vista = con.ipPropia.replace(/^::ffff:/, '');
      registrar('movil emparejado desde ' + ip);
      avisarPaneles();
      con.responder(200, { ok: true }, { 'Set-Cookie': `zr=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
      return;
    }

    const d = Dispositivos.buscar(leerCookie(p.cab));
    if (!d) { con.responder(401, { error: 'sin-emparejar' }, leerCookie(p.cab) ? { 'Set-Cookie': COOKIE_FUERA } : {}); return; }
    const antes = d.vivo || 0;
    d.vivo = Date.now();
    if (Date.now() - (d.v || 0) > 10 * 60 * 1000) { d.v = Date.now(); Dispositivos.guardar(); }
    if (Date.now() - antes > 30000) avisarPaneles();
    if (P.esPrivada(con.ipPropia) && !/^127\./.test(con.ipPropia)) Red.vista = con.ipPropia.replace(/^::ffff:/, '');

    if (ruta === '/api/yo') { con.responder(200, { ok: true, nombre: d.n, version: VERSION }); return; }

    if (ruta === '/api/estado') {
      const m = consulta.match(/(?:^|&)v=(\d{1,12})(?:&|$)/);
      const v = m ? Number(m[1]) : 0;
      if (!v || Pestanas.version > v || Pestanas.version < v - 1e6) { con.responder(200, estadoParaMovil()); return; }
      if (Esperas.porIp(ip) >= LIM.esperasPorIp) { con.responder(200, estadoParaMovil()); return; }
      const e = {
        ip,
        v,
        responder: () => con.responder(200, estadoParaMovil()),
        timer: null,
      };
      e.timer = setTimeout(() => { Esperas.lista.delete(e); e.responder(); }, LIM.esperaLarga);
      Esperas.lista.add(e);
      return;
    }

    if (ruta === '/api/orden') {
      if (p.metodo !== 'POST') { con.responder(405, { error: 'metodo' }); return; }
      if (cuerpo.orden === 'abrirYTM') {
        con.responder(200, { ok: abrirYouTubeMusic() });
        return;
      }
      const v = P.validar(cuerpo);
      if (v.error) { con.responder(400, { ok: false, error: v.error }); return; }
      const r = await Ordenes.enviar(v.orden, v.args);
      con.responder(r.ok ? 200 : (r.error === 'sin-pestana' ? 503 : 502), r);
      return;
    }

    if (ruta === '/api/salir') {
      if (p.metodo !== 'POST') { con.responder(405, { error: 'metodo' }); return; }
      Dispositivos.quitar(d);
      avisarPaneles();
      con.responder(200, { ok: true }, { 'Set-Cookie': COOKIE_FUERA });
      return;
    }

    con.responder(404, { error: 'no existe' });
  };

  // Lo que ven los paneles del PC (el codigo, el puntito verde) se manda a todas las
  // pestanas: cada una decide si lo pinta.
  const avisarPaneles = () => {
    for (const id of Pestanas.mapa.keys()) aPagina(id, { tipo: 'info', info: infoPara(id) });
  };

  // --- Mensajes de las pestanas ----------------------------------------------------
  SV.ppmm.addMessageListener('zen-remoto:desde-pagina', ({ data }) => {
    try {
      if (!data || typeof data.id !== 'string' || !data.msg) return;
      const { id, msg } = data;
      if (msg.tipo === 'estado') Pestanas.estado(id, msg.estado, msg.t);
      else if (msg.tipo === 'respuesta') Ordenes.respuesta(msg);
      else if (msg.tipo === 'info') {
        if (msg.abierto) Emparejar.paneles.add(id); else Emparejar.paneles.delete(id);
        if (!Pestanas.mapa.has(id)) Pestanas.mapa.set(id, { estado: null, t: Date.now(), recibido: Date.now(), sono: 0 });
        aPagina(id, { tipo: 'info', info: infoPara(id) });
      } else if (msg.tipo === 'olvidar') {
        Dispositivos.olvidar();
        registrar('moviles olvidados desde el panel');
        avisarPaneles();
      } else if (msg.tipo === 'adios') Pestanas.adios(id);
    } catch (e) {
      registrar('fallo con un mensaje de la pagina: ' + e);
    }
  });

  // --- El socket --------------------------------------------------------------------
  const Servidor = {
    socket: null,
    puerto: 8642,
    error: null,
    arrancar() {
      if (this.socket) return;
      this.puerto = SV.prefs.getIntPref(PREF_PUERTO, 8642);
      if (!(this.puerto >= 1024 && this.puerto <= 65535)) this.puerto = 8642;
      try {
        const s = Cc['@mozilla.org/network/server-socket;1'].createInstance(Ci.nsIServerSocket);
        s.init(this.puerto, false, 32);
        s.asyncListen({
          onSocketAccepted: (_s, transporte) => {
            if (conexiones >= LIM.conexiones) { try { transporte.close(Cr.NS_ERROR_ABORT); } catch (e) { /* nada */ } return; }
            let ip = '';
            try { ip = transporte.getScriptablePeerAddr().address; } catch (e) { /* sin ip */ }
            if (!P.esPrivada(ip)) { try { transporte.close(Cr.NS_ERROR_ABORT); } catch (e) { /* nada */ } return; }
            try { new Conexion(transporte); } catch (e) { registrar('conexion fallida: ' + e); }
          },
          onStopListening: () => { this.socket = null; },
        });
        this.socket = s;
        this.error = null;
        registrar(`servidor en pie en el puerto ${this.puerto}`);
      } catch (e) {
        this.error = `No pude abrir el puerto ${this.puerto}: ¿lo usa otra aplicación?`;
        registrar('no pude abrir el puerto ' + this.puerto + ': ' + e);
      }
      Red.buscar();
      aPagina('*', { tipo: 'hola' });
    },
    parar() {
      if (!this.socket) return;
      try { this.socket.close(); } catch (e) { /* ya cerrado */ }
      this.socket = null;
      for (const e of Esperas.lista) clearTimeout(e.timer);
      Esperas.lista.clear();
      registrar('servidor parado');
    },
  };

  Dispositivos.cargar();
  // La IP del equipo puede cambiar (otra wifi): se vuelve a mirar cada minuto.
  setInterval(() => Red.buscar(), 60000);
  // Limpieza de cubetas y de pestanas muertas.
  setInterval(() => {
    const corte = Date.now() - 60000;
    for (const [ip, c] of Cubetas) if (c.t < corte) Cubetas.delete(ip);
    for (const [ip, l] of Emparejar.fallos) if (!Emparejar.limpiar(l).length) Emparejar.fallos.delete(ip);
    const antes = Pestanas.elegida;
    Pestanas.elegir();
    if (antes !== Pestanas.elegida) Esperas.despertar();
  }, 15000);

  const segunPref = () => {
    if (SV.prefs.getBoolPref(PREF_ENCENDIDO, true)) Servidor.arrancar(); else Servidor.parar();
  };
  SV.prefs.addObserver(PREF_ENCENDIDO, { observe: segunPref });
  SV.prefs.addObserver(PREF_PUERTO, { observe: () => { Servidor.parar(); segunPref(); } });

  // El cargador corre en pleno arranque, antes de que haya interfaz: el puerto se
  // abre cuando Zen ya esta en pie. El temporizador cubre el caso de cargarlo a
  // mano con Zen ya abierto, en el que 'final-ui-startup' no vuelve a saltar.
  let arrancado = false;
  const arranque = () => { if (arrancado) return; arrancado = true; segunPref(); };
  SV.obs.addObserver({ observe: arranque }, 'final-ui-startup');
  setTimeout(arranque, 4000);
})();
