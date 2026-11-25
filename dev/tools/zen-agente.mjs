/* ==========================================================================
   Zen Agente — manejar Zen desde fuera, por el canal que abre el RemoteAgent
   --------------------------------------------------------------------------
   La tercera pieza del enganche. Zen Claude Link avisa de que hay un agente
   dentro; senalar.js sirve para ensenarle QUE arreglar; y esto es por donde el
   agente entra, sin que nadie tenga que abrir la consola ni pegar nada.

   POR QUE NO SIRVE PLAYWRIGHT NI NADA QUE HABLE CDP
   En Gecko 153 el Chrome DevTools Protocol YA NO EXISTE: la carpeta
   chrome/remote/content/cdp no esta en el omni.ja de esta build. Lo unico que
   queda es WebDriver BiDi. El flag se sigue llamando --remote-debugging-port
   por compatibilidad, pero /json/version no contesta y nunca contestara.

   Y Playwright tampoco vale por otro motivo: su soporte de Firefox necesita
   una build propia parcheada con el protocolo Juggler. Contra un Firefox o un
   Zen de los que se instalan normalmente, no conecta.

   Asi que se habla BiDi directamente. Node 22+ trae WebSocket nativo, o sea
   que esto no necesita ni un paquete instalado.

   UNA SESION A LA VEZ
   BiDi no admite dos sesiones activas contra el mismo navegador, y cerrar el
   WebSocket NO la cierra: queda colgada y la siguiente llamada se estrella con
   "Maximum number of active sessions". Por eso aqui la sesion se cierra
   siempre con `session.end`, pase lo que pase, y si aun asi encuentra una
   sesion viva la reutiliza en lugar de rendirse.

   De ahi tambien el modo `guion`: encadenar los pasos en UNA sola sesion es
   mas rapido y no deja nada colgando entre llamadas.

   USO
     node dev/tools/zen-agente.mjs contextos
     node dev/tools/zen-agente.mjs ir <url>
     node dev/tools/zen-agente.mjs eval "<js>"
     node dev/tools/zen-agente.mjs evalfile <ruta.js>      <- para senalar.js
     node dev/tools/zen-agente.mjs captura <salida.png>
     node dev/tools/zen-agente.mjs esperar <js-que-devuelva-true> [segundos]
     node dev/tools/zen-agente.mjs guion <pasos.json>

   El guion es una lista de pasos, cada uno con una sola clave:
     [ {"ir": "https://..."},
       {"esperar": "!!document.querySelector('#algo')"},
       {"eval": "JSON.stringify(...)"},
       {"captura": "salida.png"} ]

   Opciones:
     --port 9222              puerto del RemoteAgent
     --url <trozo>            trabajar sobre la pestana cuya url lo contenga
     --contexto <id>          por id exacto (ojo: los ids caducan entre llamadas)
   Sin ninguna de las dos, se usa la primera pestana.

   Antes hay que abrir el canal:  .\dev\powershell\Start-ZenClaudeLink.ps1
   ========================================================================== */

const args = process.argv.slice(2);
const orden = args[0];

/* Los errores de los argumentos se imprimen solos, sin traza: son un uso mal
   escrito de la herramienta, no un fallo del programa. */
const morir = (mensaje) => {
  console.error(mensaje);
  process.exit(2);
};

const flag = (nombre, pordefecto) => {
  const i = args.indexOf('--' + nombre);
  if (i < 0) return pordefecto;
  const valor = args[i + 1];
  // Antes, `--port` al final de la linea devolvia el valor por defecto sin
  // avisar: uno creia estar hablando con otro puerto y el error salia luego como
  // «No hay nadie escuchando en ws://127.0.0.1:9222».
  if (valor === undefined || valor.startsWith('--')) {
    morir(`Falta el valor de --${nombre}. Uso: --${nombre} <valor>`);
  }
  return valor;
};
const puerto = flag('port', '9222');
if (!/^\d+$/.test(puerto) || Number(puerto) < 1 || Number(puerto) > 65535) {
  morir(`--port debe ser un numero entero entre 1 y 65535 (llego: ${JSON.stringify(puerto)}).`);
}
const contextoFijo = flag('contexto', null);
const filtroUrl = flag('url', null); // elegir pestana por un trozo de su url

// posicionales, saltandose los flags y sus valores
const sueltos = [];
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    i++;
    continue;
  }
  sueltos.push(args[i]);
}

// Sin esto, `guion` sin ruta llegaba al readFileSync de dentro de main y moria
// con «The "path" argument must be of type string», despues de conectarse.
if (orden === 'guion' && !sueltos[0]) {
  morir('Falta el archivo del guion. Uso: node dev/tools/zen-agente.mjs guion <pasos.json>');
}

const url = `ws://127.0.0.1:${puerto}/session`;

/* --------------------------------------------------------------------------
   Cliente BiDi minimo. Cada comando lleva un id y la respuesta trae el mismo,
   asi que basta con guardar el resolve en un mapa.
   -------------------------------------------------------------------------- */
class BiDi {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pend = new Map();
    ws.addEventListener('message', ev => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.id === undefined) return; // evento, no respuesta
      const p = this.pend.get(m.id);
      if (!p) return;
      this.pend.delete(m.id);
      if (m.type === 'error') p.rechaza(new Error(`${m.error}: ${m.message}`));
      else p.resuelve(m.result);
    });
  }

  manda(method, params = {}) {
    const id = ++this.id;
    return new Promise((resuelve, rechaza) => {
      this.pend.set(id, { resuelve, rechaza });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pend.delete(id)) rechaza(new Error(`sin respuesta a ${method}`));
      }, 60000);
    });
  }
}

const conecta = () =>
  new Promise((resuelve, rechaza) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resuelve(new BiDi(ws)));
    ws.addEventListener('error', () =>
      rechaza(
        new Error(
          `No hay nadie escuchando en ${url}.\n` +
            `Arranca Zen con el canal abierto:  .\\dev\\powershell\\Start-ZenClaudeLink.ps1 -Port ${puerto}`
        )
      )
    );
  });

/* BiDi devuelve los valores serializados por tipo: {type:'string', value:'x'},
   {type:'object', value:[[k,v],...]}, etc. Reconstruirlo entero es trabajo de
   una libreria; aqui basta con desenvolver los primitivos, porque todo lo que
   sea complejo se pide ya como JSON desde la propia pagina. */
const desenvuelve = r => {
  if (!r) return r;
  if (r.type === 'undefined' || r.type === 'null') return null;
  if ('value' in r) return r.value;
  return r;
};

let abierta = null; // la conexion viva, para poder cerrar la sesion pase lo que pase

const main = async () => {
  const bidi = (abierta = await conecta());

  /* Una sesion colgada de una llamada anterior no se puede heredar: la sesion
     pertenece a SU conexion, y desde otra el navegador contesta "invalid
     session id" a todo. Asi que se dice lo que pasa y como salir, en vez de
     dejar que el fallo aparezca tres comandos mas tarde disfrazado de otra
     cosa. */
  try {
    await bidi.manda('session.new', { capabilities: { alwaysMatch: {} } });
  } catch (e) {
    if (/Maximum number of active sessions/i.test(e.message)) {
      throw new Error(
        'Ya hay una sesion BiDi abierta contra este Zen y no se puede compartir.\n' +
          'Suele ser una llamada anterior que murio sin cerrarse. Cierra Zen y vuelve a\n' +
          'abrirlo con .\\dev\\powershell\\Start-ZenClaudeLink.ps1, o usa el modo `guion` para\n' +
          'hacerlo todo en una sola sesion.'
      );
    }
    throw e;
  }

  const tree = await bidi.manda('browsingContext.getTree', {});
  const pestanas = tree.contexts || [];
  if (!pestanas.length) throw new Error('Zen no tiene ninguna pestana abierta.');

  /* Elegir pestana por URL, y no solo por id, porque los ids de contexto no
     sobreviven de una llamada a otra: cada invocacion abre su sesion y los
     vuelve a repartir. Un id copiado de un `contextos` anterior falla con "no
     such frame", que no dice nada de la causa. Con `--url` se resuelve dentro
     de la misma sesion y el problema desaparece. */
  let ctx;
  if (contextoFijo) {
    if (!pestanas.some(p => p.context === contextoFijo)) {
      throw new Error(
        `Ese contexto ya no existe. Los ids caducan entre llamadas: usa --url <trozo-de-url>.\n` +
          `Abiertas ahora:\n` +
          pestanas.map(p => `  ${p.url}`).join('\n')
      );
    }
    ctx = contextoFijo;
  } else if (filtroUrl) {
    const hallada = pestanas.find(p => (p.url || '').includes(filtroUrl));
    if (!hallada) {
      throw new Error(
        `Ninguna pestana con "${filtroUrl}" en la url.\nAbiertas ahora:\n` +
          pestanas.map(p => `  ${p.url}`).join('\n')
      );
    }
    ctx = hallada.context;
  } else {
    ctx = pestanas[0].context;
  }

  const evalua = async expr => {
    const r = await bidi.manda('script.evaluate', {
      expression: expr,
      target: { context: ctx },
      awaitPromise: true,
      resultOwnership: 'none',
    });
    if (r.type === 'exception') {
      throw new Error('la pagina lanzo: ' + (r.exceptionDetails?.text || 'error'));
    }
    return desenvuelve(r.result);
  };

  const { readFileSync, writeFileSync } = await import('node:fs');

  /* Un paso = una accion. Se define una sola vez para que la linea de comandos
     y el modo `guion` no puedan divergir. */
  const pasos = {
    contextos: () =>
      JSON.stringify(
        pestanas.map(p => ({ context: p.context, url: p.url })),
        null,
        2
      ),

    ir: async destino => {
      if (!destino) throw new Error('falta la url');
      await bidi.manda('browsingContext.navigate', {
        context: ctx,
        url: destino,
        wait: 'complete',
      });
      return 'en ' + destino;
    },

    eval: async js => {
      if (!js) throw new Error('falta el javascript');
      const v = await evalua(js);
      return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
    },

    evalfile: async ruta => {
      if (!ruta) throw new Error('falta la ruta del archivo');
      return pasos.eval(readFileSync(ruta, 'utf8'));
    },

    /* Para lo que carga solo: se sondea la condicion en vez de dormir a ojo,
       que es lo que hace que una espera de 15s tarde 15s aunque la pagina
       estuviese lista en 2. */
    esperar: async (cond, seg) => {
      const limite = Number(seg || 30) * 1000;
      const t0 = Date.now();
      for (;;) {
        let ok = false;
        try {
          ok = !!(await evalua(cond));
        } catch {
          /* la pagina puede estar navegando */
        }
        if (ok) return 'cumplido en ' + Math.round((Date.now() - t0) / 100) / 10 + 's';
        if (Date.now() - t0 > limite) throw new Error('se agoto la espera: ' + cond);
        await new Promise(r => setTimeout(r, 400));
      }
    },

    /* Traer la pestana al frente. Hace falta para cualquier comprobacion que
       mire la PANTALLA en vez del DOM: navegar o inyectar en una pestana de
       fondo no cambia lo que se ve, y entonces la captura de escritorio sale
       de otra pagina distinta sin que nada avise. */
    activar: async () => {
      await bidi.manda('browsingContext.activate', { context: ctx });
      return 'pestana al frente';
    },

    /* OJO CON ESTA CAPTURA: NO PINTA `backdrop-filter`.
       `browsingContext.captureScreenshot` rasteriza el documento por un camino
       distinto al de la pantalla, y ahi el filtro de fondo no se aplica. Sale
       una imagen con el contenido de detras NITIDO aunque el navegador lo este
       difuminando perfectamente delante del usuario.

       Costo un rato: se dio por demostrado que `backdrop-filter` "no funciona"
       en esta configuracion, y se llegaron a quitar reglas por eso. Lo que no
       funcionaba era la captura. Comprobado con una pagina opaca de rayas y un
       recuadro con blur(22px): por aqui salian las rayas intactas, en el
       escritorio salia un borron uniforme.

       Asi que para validar `backdrop-filter`, `filter`, `mix-blend-mode` o el
       acrilico de la ventana, captura el ESCRITORIO (CopyFromScreen). Esta
       vale para todo lo demas: geometria, colores planos, texto, layout. */
    captura: async salida => {
      const destino = salida || 'zen.png';
      const r = await bidi.manda('browsingContext.captureScreenshot', { context: ctx });
      writeFileSync(destino, Buffer.from(r.data, 'base64'));
      return 'captura: ' + destino;
    },
  };

  if (orden === 'guion') {
    const archivoGuion = sueltos[0];
    let lista;
    try {
      lista = JSON.parse(readFileSync(archivoGuion, 'utf8'));
    } catch (e) {
      // JSON.parse a secas decia «Unexpected token } in JSON at position 42» sin
      // decir de que archivo era ni que forma tiene un guion.
      if (e instanceof SyntaxError) {
        throw new Error(`El guion ${archivoGuion} no es JSON valido (${e.message}).`);
      }
      throw new Error(`No se pudo leer el guion ${archivoGuion}: ${e.message}`);
    }
    if (!Array.isArray(lista)) {
      throw new Error(`El guion ${archivoGuion} debe ser una lista de pasos, por ejemplo [{"ir": "https://..."}].`);
    }
    for (const [i, paso] of lista.entries()) {
      if (!paso || typeof paso !== 'object' || Array.isArray(paso)) {
        throw new Error(`Paso ${i + 1} del guion: se esperaba un objeto con una sola clave, llego ${JSON.stringify(paso)}.`);
      }
      const claves = Object.keys(paso);
      if (claves.length !== 1) {
        throw new Error(`Paso ${i + 1} del guion: tiene ${claves.length} claves (${claves.join(', ')}); cada paso lleva exactamente una.`);
      }
      const nombre = claves[0];
      const valor = paso[nombre];
      if (!pasos[nombre]) {
        throw new Error(`Paso ${i + 1} del guion: paso desconocido «${nombre}». Los pasos son: ${Object.keys(pasos).join(', ')}.`);
      }
      const args = Array.isArray(valor) ? valor : [valor];
      console.log(await pasos[nombre](...args));
    }
  } else if (pasos[orden]) {
    console.log(await pasos[orden](...sueltos));
  } else {
    console.log(
      'ordenes: contextos | ir <url> | eval <js> | evalfile <ruta> | esperar <js> [seg] | captura <png> | guion <pasos.json>'
    );
  }
};

/* La sesion se cierra SIEMPRE, tambien cuando el comando ha fallado. Si no, un
   error deja la sesion viva y la siguiente llamada muere con "Maximum number of
   active sessions" — o sea que un fallo cualquiera envenena todas las llamadas
   que vengan detras. */
const cierra = async () => {
  if (!abierta) return;
  try {
    await abierta.manda('session.end', {});
  } catch {
    /* ya estaba cerrada, o el navegador se fue */
  }
  try {
    abierta.ws.close();
  } catch {
    /* nada que cerrar */
  }
};

/* El `process.exit` explicito hace falta: un WebSocket abierto mantiene vivo el
   bucle de eventos de Node, asi que sin esto el comando termina su trabajo,
   imprime el resultado y se queda colgado para siempre. */
main()
  .then(async () => {
    await cierra();
    process.exit(0);
  })
  .catch(async e => {
    console.error(String(e.message || e));
    await cierra();
    process.exit(1);
  });
