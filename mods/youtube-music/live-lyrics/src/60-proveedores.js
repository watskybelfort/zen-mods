/* --- Quien pide la letra y en que orden -----------------------------------
   Una sola pieza por encima de los proveedores, para que el render no sepa nunca
   de donde salio la letra ni tenga que enterarse de que hay cache.

   EL ESTADO ES EXPLICITO Y TIENE SEIS VALORES, no dos. Un booleano "hay letra o
   no" es lo que produce esas interfaces en las que no se distingue si esta
   cargando, si no hay letra, o si el mod se ha roto. Aqui:

     vacio        no suena nada
     buscando     hay peticion en marcha
     lista        letra sincronizada, corre
     plano        hay texto pero SIN tiempos: se muestra quieto y se dice
     instrumental el proveedor dice que no tiene letra porque no la tiene
     sin-letra    nadie la tiene

   La diferencia entre `plano`, `instrumental` y `sin-letra` es justo la que hace
   que el usuario sepa si merece la pena buscarla a mano o si esta perdiendo el
   tiempo.

   EL DESFASE NO SE APLICA A LA LINEA DE TIEMPO. Se resta del reloj en el
   momento de pintar. Asi ajustarlo es instantaneo y no obliga a recomponer nada:
   con 80 lineas y sus palabras, recomponer en cada pulsacion de tecla se notaria
   justo mientras el usuario intenta afinar. */

/* El orden es el que importa: Musixmatch primero PORQUE trae tiempos por palabra
   reales, y eso le gana a la mejor interpolacion posible. Pero es la fuente
   fragil, asi que va delante justamente para que cuando falle — y va a fallar —
   LRCLIB conteste detras sin que el usuario note nada. Si estuviera detras, una
   cancion con letra en LRCLIB nunca llegaria a pedir la version buena.

   Y los subtitulos de YouTube al final, aun teniendo la mejor sincronizacion de
   las tres — es la unica fuente cronometrada contra la pista que suena de
   verdad. Van ultimos por el TEXTO: salen de reconocer voz cantada y se
   equivocan. Una letra humana algo desfasada, que el usuario cuadra con
   Alt+izquierda una sola vez y se le guarda, vale mas que una transcripcion
   clavada que dice otra cosa. */
const PROVEEDORES = () => [ProveedorMusixmatch, ProveedorLrclib, ProveedorSubtitulos];

const Letra = {
  _gen: 0,
  _estado: { clave: 'vacio', lineaDeTiempo: null, fuente: null, mensaje: '', id: null },
  _oyentes: new Set(),

  _oyentesDesfase: new Set(),

  estado() { return this._estado; },

  alCambiar(f) { this._oyentes.add(f); return () => this._oyentes.delete(f); },

  /* El desfase tiene su propia senal, aparte del cambio de estado. Si avisara por
     alCambiar, cada pulsacion de ajuste reconstruiria el DOM de las 80 lineas
     — carisimo, y encima justo mientras el usuario esta afinando a base de
     pulsaciones seguidas. Los oyentes de desfase solo tienen que repintar el
     indicador y volver a colocar la vista. */
  alDesfase(f) { this._oyentesDesfase.add(f); return () => this._oyentesDesfase.delete(f); },

  _avisarDesfase() {
    for (const f of this._oyentesDesfase) { try { f(this.desfase()); } catch (e) { warn(e); } }
  },

  _poner(parcial) {
    this._estado = { ...this._estado, ...parcial };
    for (const f of this._oyentes) { try { f(this._estado); } catch (e) { warn(e); } }
  },

  /* Segundos que hay que restarle al reloj. Suma el ajuste global y el de esta
     cancion en concreto. Positivo = la letra sale mas tarde. */
  desfase() {
    const id = this._estado.id;
    return (Ajustes.get('desfase') || 0) + (id ? Desfases.de(id) : 0);
  },

  ajustarDesfase(delta) {
    const id = this._estado.id;
    if (!id) return 0;
    const nuevo = Math.round((Desfases.de(id) + delta) * 1000) / 1000;
    Desfases.poner(id, nuevo);
    this._avisarDesfase();
    return nuevo;
  },

  reiniciarDesfase() {
    const id = this._estado.id;
    if (id) Desfases.poner(id, 0);
    this._avisarDesfase();
    return 0;
  },

  /* Se llama en cada cambio de tema. La generacion evita la carrera clasica:
     el usuario pasa tres canciones seguidas, las tres peticiones vuelven en
     cualquier orden y la primera en volver pinta la letra de la cancion
     equivocada. Cada busqueda comprueba que sigue siendo la vigente antes de
     escribir el estado. */
  async cargar(id, { ignorarCache = false } = {}) {
    const gen = ++this._gen;
    const vigente = () => gen === this._gen;

    if (!id) { this._poner({ clave: 'vacio', lineaDeTiempo: null, fuente: null, mensaje: '', id: null }); return; }

    this._poner({ clave: 'buscando', lineaDeTiempo: null, fuente: null, mensaje: '', id: id.id });

    if (!ignorarCache) {
      const guardada = Cache.obtener(id.id);
      if (guardada) {
        log('cache:', id.id, guardada.fuente || '(vacio)');
        this._aplicar(guardada, id, true);
        return;
      }
    }

    /* La duracion llega un poco despues que el titulo, y es el desempate bueno
       de la busqueda. Merece la pena esperarla un momento: pedir sin ella
       significa elegir version a ciegas. */
    if (!id.duracion) {
      for (let i = 0; i < 10 && !Reloj.duracion(); i++) await dormir(200);
      if (!vigente()) return;
      id = { ...id, duracion: Reloj.duracion() };
    }

    /* Se anota antes de preguntar para saber, al final, si algun proveedor se
       quedo sin poder hablar con su servidor. */
    const fallosAntes = Red.fallosDeTransporte;

    /* EL TEXTO SIN CRONOMETRAR NO CORTA LA CADENA ---------------------------
       Una entrada de solo texto plano contaba como respuesta y paraba la
       busqueda ahi mismo. O sea que un tema con letra sin cronometrar en LRCLIB
       nunca llegaba a preguntar a la fuente siguiente — y desde que existen los
       subtitulos de YouTube eso es cambiar una letra que CORRE por una que se
       queda quieta, que es justo lo que este mod existe para evitar.

       Asi que el texto plano se guarda a un lado y la cadena sigue. Solo se usa
       si detras no aparece nada cronometrado, que es cuando de verdad es lo
       mejor que hay.

       `instrumental` SI corta, y no es una inconsistencia: ahi una persona
       afirmo que este tema no tiene letra. Seguir preguntando despues de eso
       solo puede acabar en un reconocedor de voz inventandose versos sobre una
       pista sin voz. */
    let respaldoPlano = null;

    for (const p of PROVEEDORES()) {
      if (!p.disponible()) continue;
      let res = null;
      try {
        res = await p.buscar(id);
      } catch (e) {
        warn(`proveedor ${p.nombre} se cayo:`, e && e.message);
      }
      if (!vigente()) return;
      if (!res) continue;

      if (res.plano) {
        if (!respaldoPlano) { respaldoPlano = res; log(`${p.nombre} tiene el texto pero sin cronometrar; se guarda por si no hay nada mejor`); }
        continue;
      }

      const entrada = { texto: res.texto, fuente: res.fuente, plano: false, instrumental: !!res.instrumental, porPalabra: !!res.porPalabra };
      Cache.guardar(id.id, entrada);
      this._aplicar(entrada, id, false);
      return;
    }

    if (!vigente()) return;

    if (respaldoPlano) {
      const entrada = { texto: respaldoPlano.texto, fuente: respaldoPlano.fuente, plano: true, instrumental: false, porPalabra: false };
      Cache.guardar(id.id, entrada);
      this._aplicar(entrada, id, false);
      return;
    }

    /* NO SE GUARDA UN VACIO SI LO QUE FALLO FUE LA RED ------------------------
       "Nadie tiene la letra" y "no pude preguntar" acaban los dos sin letra, pero
       significan cosas opuestas, y la diferencia solo se nota dias despues: un
       vacio guardado dura tres dias, asi que un rato sin conexion — o un puente
       roto — deja marcadas como vacias todas las canciones que sonaron mientras
       tanto, y siguen saliendo vacias cuando ya todo va bien. Pasa exactamente
       eso al estrenar el cargador nativo: 18 canciones envenenadas antes de que
       la primera peticion llegara a salir. */
    const huboCorte = Red.fallosDeTransporte > fallosAntes;
    if (!huboCorte) {
      Cache.guardar(id.id, { vacio: true });
    } else {
      log('no se guarda el vacio: la red fallo, no la busqueda');
    }

    this._poner({
      clave: 'sin-letra',
      lineaDeTiempo: null,
      fuente: null,
      mensaje: huboCorte ? tr("Couldn't reach the lyrics providers (see window.__zenLetra.probarRed())", 'No se pudo preguntar a nadie: mira window.__zenLetra.probarRed()') : tr('Nobody has the lyrics for this', 'Nadie tiene la letra de esta canción'),
      id: id.id,
    });
  },

  _aplicar(entrada, id, deCache) {
    if (entrada.vacio) {
      this._poner({ clave: 'sin-letra', lineaDeTiempo: null, fuente: null, mensaje: tr('Nobody has the lyrics for this', 'Nadie tiene la letra de esta canción'), id: id.id });
      return;
    }
    if (entrada.instrumental) {
      this._poner({ clave: 'instrumental', lineaDeTiempo: null, fuente: entrada.fuente, mensaje: tr('Instrumental', 'Instrumental'), id: id.id });
      return;
    }
    if (entrada.plano) {
      this._poner({
        clave: 'plano',
        lineaDeTiempo: { fuente: entrada.fuente, porPalabra: false, lineas: entrada.texto.split(/\r?\n/).map((t) => ({ inicio: 0, fin: 0, texto: t, palabras: null, interludio: !t.trim() })), finLetra: 0 },
        fuente: entrada.fuente,
        mensaje: tr('Only unsynced lyrics available', 'Solo hay letra sin sincronizar'),
        id: id.id,
      });
      return;
    }

    const linea = componerLineaDeTiempo(parsearLrc(entrada.texto, entrada.fuente));
    if (!linea) {
      this._poner({ clave: 'sin-letra', lineaDeTiempo: null, fuente: entrada.fuente, mensaje: tr("The lyrics that came back couldn't be read", 'La letra que llegó no se pudo leer'), id: id.id });
      return;
    }

    /* Aviso de version equivocada. Si la letra se acaba mucho antes de que se
       acabe la cancion, no es un desfase: es otra edicion del tema, y el usuario
       tiene que saberlo porque ningun ajuste de desfase lo va a arreglar. */
    const dur = id.duracion || Reloj.duracion();
    let mensaje = '';
    if (dur > 30 && linea.finLetra > 0 && linea.finLetra < dur * 0.6) {
      mensaje = tr('These lyrics seem to be from another version of the song', 'La letra parece de otra versión de la canción');
      log(`la letra acaba en ${linea.finLetra.toFixed(0)}s y la cancion dura ${dur.toFixed(0)}s`);
    }

    this._poner({ clave: 'lista', lineaDeTiempo: linea, fuente: entrada.fuente, mensaje, id: id.id });
    log(`letra ${deCache ? 'de cache' : 'nueva'}: ${linea.lineas.length} lineas, ${linea.porPalabra ? 'tiempos por palabra REALES' : 'palabras interpoladas'}`);
  },

  /* "Esta no es" ------------------------------------------------------------
     Pasa a la siguiente version de la lista que ya se trajo, sin volver a
     preguntar. Es la salida para los temas con varias versiones legitimas —
     directo, remix, edicion de album — donde desde fuera no hay forma de saber
     cual suena, y tambien la red de seguridad para cuando el filtro deja pasar
     algo que no era.

     Si se acabaron las versiones, se vuelve a buscar desde cero saltandose la
     cache, que es lo unico que queda por probar. */
  otraVersion() {
    const id = Tema.actual();
    if (!id) return null;

    const otra = ProveedorLrclib.otra(id);
    if (otra) {
      const entrada = { texto: otra.texto, fuente: otra.fuente, plano: !!otra.plano, instrumental: !!otra.instrumental };
      Cache.guardar(id.id, entrada);
      this._aplicar(entrada, id, false);
      return ProveedorLrclib.cuantasVersiones(id);
    }

    Almacen.borrar(`cache:${id.id}`);
    this.cargar(id, { ignorarCache: true });
    return null;
  },

  /* Vuelve a pedirla saltandose la cache. */
  recargar() {
    const id = Tema.actual();
    if (!id) return;
    Almacen.borrar(`cache:${id.id}`);
    return this.cargar(id, { ignorarCache: true });
  },
};
