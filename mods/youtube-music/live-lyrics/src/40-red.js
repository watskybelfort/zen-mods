/* --- La capa de red -------------------------------------------------------
   Una sola funcion para pedir JSON, con tres implementaciones detras, porque el
   motor tiene que correr en dos sitios distintos y en uno de ellos ni siquiera
   hay CORS de por medio:

   1. GM_xmlhttpRequest, cuando corre bajo un gestor de userscripts. Es la via
      buena: el gestor hace la peticion desde fuera de la pagina, asi que no hay
      CORS que negociar y los dominios permitidos se declaran en la cabecera con
      @connect. Preferida siempre que exista.
   2. fetch, cuando no hay gestor. Funciona solo si el servidor manda cabeceras
      CORS permisivas. Si no las manda, el navegador bloquea la respuesta y no
      hay nada que hacer desde dentro de la pagina — por eso el diagnostico lo
      dice con esas palabras, en lugar de dejar un "failed to fetch" pelado que
      parece que el sitio esta caido.
   3. El puente, que instala el cargador nativo. Cuando el motor corre inyectado
      desde el chrome de Zen, la peticion la hace el proceso padre, que es
      privilegiado: no tiene origen, asi que CORS no le aplica. El protocolo se
      define aqui para que el cargador nativo solo tenga que implementarlo.

   Y una cortesia que no es opcional: LRCLIB es un servicio gratuito mantenido
   por una persona. Hay un minimo entre peticiones y las peticiones identicas en
   vuelo se comparten, para no pedir tres veces lo mismo cuando el usuario pasa
   rapido de cancion. */

const ESPERA_MINIMA_MS = 350;
const CLIENTE = () => `zen-letra-viva ${LV.version} (https://github.com/watskybelfort/zen-mods)`;

/* LA CABECERA DE CORTESIA ES DE LRCLIB, Y SOLO DE LRCLIB ------------ MEDIDO -
   `Lrclib-Client` dice quien llama, y con LRCLIB eso es educacion: es un
   servicio gratuito mantenido por una persona. Mandarsela ademas a todos los
   demas parecia inofensivo y no lo era.

   Una cabecera que no esta en la lista segura de CORS convierte la peticion en
   "no simple", y entonces el navegador manda antes un OPTIONS de permiso.
   `api/timedtext` de YouTube no contesta a ese OPTIONS, asi que la peticion se
   muere sin llegar a salir. Medido contra el servicio, desde music.youtube.com
   y por fetch:

     sin cabeceras propias    200, 32623 bytes
     solo Accept              200, 32623 bytes    (Accept si esta en la lista)
     con Lrclib-Client        TypeError: Failed to fetch

   O sea que no era un descuido cosmetico: era el proveedor de subtitulos entero
   sin funcionar justo en la instalacion mas comun, la que no tiene gestor ni
   cargador nativo y va por fetch. Por GM y por el puente no se nota, porque esos
   no pasan por CORS — que es exactamente lo que hace que un fallo asi sobreviva
   a las pruebas de quien lo escribe. */
const ES_LRCLIB = /^https:\/\/([a-z0-9-]+\.)*lrclib\.net(\/|$)/i;

const Red = {
  _ultima: 0,
  _enVuelo: new Map(),
  /* Cuenta los fallos de TRANSPORTE — los que no llegaron a hablar con el
     servidor. Sirve para no confundir "esta cancion no tiene letra" con "no pude
     preguntar", que es una distincion que solo importa por la cache: guardar un
     vacio por un corte de red envenena la entrada durante dias. */
  fallosDeTransporte: 0,

  /* El puente se busca en dos sitios, y no es por indecision.

     El cargador nativo evalua el motor en un sandbox cuyo prototipo es el window
     de la pagina, asi que ahi `window` ES el window de YouTube Music. Si el puente
     se colgara de el, quedaria a la vista del propio codigo de YouTube — y un
     puente es, literalmente, una forma de hacer peticiones sin CORS. Asi que el
     cargador lo deja como global DEL SANDBOX, que solo ve nuestro codigo, y aqui
     se mira tambien ahi. `typeof` sobre un identificador que no existe es seguro
     incluso en modo estricto; leerlo directamente seria un ReferenceError. */
  puente() {
    if (window.__zenLetraPuente && typeof window.__zenLetraPuente.pedir === 'function') return window.__zenLetraPuente;
    if (typeof __zenLetraPuente !== 'undefined' && __zenLetraPuente && typeof __zenLetraPuente.pedir === 'function') return __zenLetraPuente;
    return null;
  },

  via() {
    if (typeof GM_xmlhttpRequest === 'function') return 'gm';
    if (this.puente()) return 'puente';
    if (typeof fetch === 'function') return 'fetch';
    return 'ninguna';
  },

  async _cortesia() {
    const desde = performance.now() - this._ultima;
    if (desde < ESPERA_MINIMA_MS) await dormir(ESPERA_MINIMA_MS - desde);
    this._ultima = performance.now();
  },

  /* Devuelve { ok, estado, datos, error }. No lanza: un proveedor que se cae no
     puede tumbar la cadena de proveedores, y envolver cada llamada en try/catch
     en cada sitio es como se olvida uno. */
  async json(url, opciones = {}) {
    const clave = `${url}`;
    if (this._enVuelo.has(clave)) return this._enVuelo.get(clave);

    const promesa = this._json(url, opciones).finally(() => this._enVuelo.delete(clave));
    this._enVuelo.set(clave, promesa);
    return promesa;
  },

  async _json(url, opciones) {
    await this._cortesia();
    const via = this.via();
    const cabeceras = {
      Accept: 'application/json',
      ...(ES_LRCLIB.test(url) ? { 'Lrclib-Client': CLIENTE() } : null),
      ...(opciones.cabeceras || {}),
    };
    const limite = opciones.limiteMs || 12000;

    try {
      if (via === 'gm') return this._contarSiEsTransporte(await this._porGm(url, cabeceras, limite));
      if (via === 'puente') return this._contarSiEsTransporte(await this.puente().pedir({ url, cabeceras, limiteMs: limite }));
      if (via === 'fetch') return this._contarSiEsTransporte(await this._porFetch(url, cabeceras, limite));
      this.fallosDeTransporte++;
      return { ok: false, estado: 0, error: 'sin ninguna via de red disponible' };
    } catch (e) {
      this.fallosDeTransporte++;
      return { ok: false, estado: 0, error: (e && e.message) || String(e) };
    }
  },

  _porGm(url, cabeceras, limiteMs) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: cabeceras,
        timeout: limiteMs,
        responseType: 'text',
        onload: (r) => resolve(this._interpretar(r.status, r.responseText, url)),
        onerror: () => resolve({ ok: false, estado: 0, error: `la peticion fallo (${url})` }),
        ontimeout: () => resolve({ ok: false, estado: 0, error: `se agoto el tiempo (${limiteMs}ms)` }),
      });
    });
  },

  async _porFetch(url, cabeceras, limiteMs) {
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), limiteMs);
    try {
      /* Sin credenciales a proposito: no queremos mandar cookies de terceros a
         un servicio de letras, y ademas con credentials la respuesta exigiria
         Allow-Origin explicito en lugar de comodin. */
      const r = await fetch(url, { headers: cabeceras, credentials: 'omit', signal: corte.signal, cache: 'no-store' });
      const texto = await r.text();
      return this._interpretar(r.status, texto, url);
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, estado: 0, error: `se agoto el tiempo (${limiteMs}ms)` };
      return {
        ok: false,
        estado: 0,
        error: `sin gestor de userscripts la peticion va por fetch y el servidor tiene que permitir CORS; este la rechazo (${(e && e.message) || e})`,
      };
    } finally {
      clearTimeout(reloj);
    }
  },

  _contarSiEsTransporte(r) {
    /* Estado 0 significa que no hubo respuesta HTTP: ni 404 ni 500, nada. O sea
       que del servidor no sabemos nada, y desde luego no que no tenga la letra. */
    if (r && !r.ok && r.estado === 0) this.fallosDeTransporte++;
    return r;
  },

  _interpretar(estado, texto, url) {
    /* 404 no es un error: en LRCLIB significa "no tengo esa cancion", que es una
       respuesta perfectamente valida y muy comun. Distinguirlo importa porque un
       404 se puede guardar en cache y un 500 no. */
    if (estado === 404) return { ok: false, estado, datos: null, error: 'no encontrado' };
    if (estado < 200 || estado >= 300) return { ok: false, estado, error: `respuesta ${estado} de ${url}` };
    try {
      return { ok: true, estado, datos: JSON.parse(texto) };
    } catch {
      return { ok: false, estado, error: 'la respuesta no era JSON' };
    }
  },
};
