// Cargador nativo del repo (autoconfig) — Zen Letra Viva, Zen Sintonia, Zen Descargas y los demas
//
// Este archivo va en el DIRECTORIO DE INSTALACION de Zen y lo ejecuta el
// navegador al arrancar con privilegios de sistema. Es el mecanismo legado de
// autoconfig de Firefox, el mismo que usa fx-autoconfig.
//
//   Windows   junto a zen.exe            C:\Program Files\Zen Browser\
//   macOS     Zen.app/Contents/Resources/    <- NO junto al binario
//
// En macOS el sitio no es `Contents/MacOS`, donde esta el ejecutable, sino
// `Contents/Resources`: es lo que Gecko resuelve como `XCurProcD`, y contra eso
// se resuelven `general.config.filename` y `defaults/pref`. Se reconoce porque
// ahi estan `application.ini` y los `omni.ja`. Puesto junto al binario, el
// navegador arranca igual y no carga nada, sin ningun error.
//
// El propio archivo no tiene nada de especifico de un sistema: solo usa APIs de
// Gecko y rutas relativas al perfil. El que cambia es el sitio donde se copia,
// y de eso se encarga installer/lib/nativo.mjs.
//
// Hace tres cosas por cada mod nativo instalado, y ninguna es obligatoria:
// publicar lo que el mod necesite donde los procesos de contenido puedan leerlo,
// cargar su inyector en cada uno de ellos, y engancharle un script en cada
// ventana de navegador.
//
// LO DE LAS VENTANAS LLEGO CON EL TERCER MOD. Los dos primeros viven enteros
// dentro de la pagina; Zen Sin Cristal necesita ademas poner una entrada en el
// menu del clic derecho, y eso es interfaz, o sea que vive en el proceso padre y
// una vez por ventana. Se resuelve con la misma tabla en vez de con un cargador
// aparte: un campo mas, `ventana`, y el mod que no lo tenga sigue igual que
// antes.
//
// UN SOLO CONFIG.JS PARA TODOS LOS MODS ------------------------------ MEDIDO -
// La pref general.config.filename admite UN nombre de archivo, no una lista, o
// sea que el directorio de instalacion solo puede tener un cargador. Cuando
// llego el segundo mod nativo la salida no era "otro config.js" — no existe tal
// cosa — sino esta tabla. Los dos instaladores escriben ESTE MISMO archivo, asi
// que da igual en que orden se ejecuten y volver a ejecutar uno no desarma al
// otro. Cada mod se salta solo si sus piezas no estan en el perfil, que es como
// se nota que no esta instalado.
//
// EL MOTOR SE PUBLICA EN sharedData, NO SE INCRUSTA EN EL INYECTOR.
// El primer intento fue generar el inyector con el motor dentro, como literal de
// cadena. Mala idea por dos motivos, y el segundo casi se cuela:
//
//   - Obliga a escapar 135 KB de codigo a mano o con una herramienta, y el
//     escapado es la clase de cosa que falla en un caracter y rompe el mod entero
//     con un error de sintaxis que no se puede relacionar con nada.
//   - Y de hecho fallo: ConvertTo-Json de PowerShell 5.1, con una cadena, no
//     devuelve un literal de cadena sino un objeto {"value":...}. El comprobador
//     de sintaxis daba el archivo por bueno — un literal de objeto ES sintaxis
//     valida — y el mod habria quedado instalado y muerto.
//
// sharedData es un mapa que el proceso padre escribe y los de contenido leen de
// forma SINCRONA, que es la parte que importa: el inyector necesita el motor en el
// momento en que nace el documento, no una promesa. Es el mismo mecanismo con el
// que el navegador reparte datos a los procesos para las extensiones. Y asi el
// motor viaja sin transformarse: el archivo que se publica es exactamente el mismo
// .user.js que se instalaria en un gestor de userscripts.
//
// La primera linea de un config.js SIEMPRE se ignora (el cargador la trata como
// comentario), asi que esta de aqui esta a proposito.

try {
  // SERVICES YA NO SE IMPORTA ---------------------------------------- MEDIDO -
  // La primera version hacia
  //   ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs')
  // y en Gecko 153 eso falla con "Failed to load". Mozilla retiro ese modulo
  // cuando `Services` paso a ser un global automatico en todo contexto con
  // principal de sistema: ya no hay nada que importar porque ya esta ahi.
  //
  // Se mira el global primero y el import queda de respaldo para builds
  // anteriores. Al reves seria peor: en las nuevas, el import lanza antes de
  // llegar a comprobar nada.
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  // Un mod nativo por entrada. `inyector`, `publicar` y `ventana` son los tres
  // opcionales, y ninguno sobra:
  //
  //   inyector   el script que corre en los procesos de CONTENIDO, o sea el que
  //              toca las paginas. Los tres primeros mods viven de el.
  //   publicar   solo lo usan los mods cuyo cuerpo vive en un archivo aparte y
  //              tiene que llegar entero al proceso de contenido. Zen Sintonia
  //              no lo necesita porque su emisor cabe dentro del propio
  //              inyector.
  //   ventana    un script que se carga en cada ventana de navegador, para los
  //              mods que ponen algo en la interfaz.
  //
  // EL CUARTO MOD ES EL PRIMERO SIN INYECTOR. Zen Web Apps no toca ninguna
  // pagina: lo unico que hace es corregir la disposicion de la interfaz en las
  // ventanas de aplicacion web. Por eso `inyector` dejo de ser obligatorio, y
  // con el se movio la senal de "este mod esta instalado": ya no es "existe su
  // inyector" sino "existe su primera pieza", sea cual sea.
  const MODS = [
    {
      nombre: 'Zen Letra Viva',
      dir: 'zen-letra',
      inyector: 'proceso.js',
      publicar: { clave: 'zen-letra:motor', archivo: 'zen-letra-viva.user.js' },
      ventana: null,
    },
    {
      nombre: 'Zen Sintonia',
      dir: 'zen-sintonia',
      inyector: 'proceso.js',
      publicar: null,
      ventana: null,
    },
    {
      nombre: 'Zen Sin Cristal',
      dir: 'zen-sin-cristal',
      inyector: 'proceso.js',
      publicar: null,
      ventana: 'ventana.js',
    },
    {
      nombre: 'Zen Web Apps',
      dir: 'zen-web-apps',
      inyector: null,
      publicar: null,
      ventana: 'ventana.js',
    },
    {
      nombre: 'Zen Modo Oscuro',
      dir: 'zen-modo-oscuro',
      inyector: 'proceso.js',
      publicar: [
        { clave: 'zen-oscuro:motor', archivo: 'darkreader.js' },
        { clave: 'zen-oscuro:arreglos', archivo: 'arreglos.json', opcional: true },
      ],
      ventana: 'ventana.js',
    },
    {
      nombre: 'Zen Mezcla',
      dir: 'zen-mezcla',
      inyector: 'proceso.js',
      publicar: [
        { clave: 'zen-mezcla:puro', archivo: 'puro.js' },
        { clave: 'zen-mezcla:motor', archivo: 'motor.js' },
      ],
      ventana: null,
    },
    // EL SEPTIMO ES EL PRIMERO CON PIEZA EN EL PROCESO PADRE, Y SOLO UNA VEZ.
    // Zen Remoto abre un servidor para el movil: no puede vivir en la pagina
    // (no hay sockets de servidor alli) ni en `ventana`, que se carga una vez
    // por ventana y abriria el puerto dos veces. `padre` son scripts que se
    // cargan una sola vez en el proceso padre, en orden y en el ambito de este
    // cargador.
    {
      nombre: 'Zen Remoto',
      dir: 'zen-remoto',
      inyector: 'proceso.js',
      publicar: [
        { clave: 'zen-remoto:puro', archivo: 'puro.js' },
        { clave: 'zen-remoto:qr', archivo: 'qr.js' },
        { clave: 'zen-remoto:motor', archivo: 'motor.js' },
      ],
      ventana: null,
      padre: ['puro.js', 'servidor.js'],
    },
    // Sustituto nativo de la extension Zen Internet: inyector en las paginas,
    // servicio del catalogo en el padre y menu y atajos en cada ventana.
    {
      nombre: 'Zen Inmersivo',
      dir: 'zen-inmersivo',
      inyector: 'proceso.js',
      publicar: [
        { clave: 'zen-inmersivo:puro', archivo: 'puro.js' },
      ],
      ventana: 'ventana.js',
      padre: ['puro.js', 'servicio.js'],
    },
    // Descargar canciones y videos de YouTube y YouTube Music: boton en la pagina y
    // yt-dlp en el padre (lanzar procesos solo se puede desde ahi).
    {
      nombre: 'Zen Descargas',
      dir: 'zen-descargas',
      inyector: 'proceso.js',
      publicar: [
        { clave: 'zen-descargas:puro', archivo: 'puro.js' },
        { clave: 'zen-descargas:motor', archivo: 'motor.js' },
      ],
      ventana: null,
      padre: ['puro.js', 'descargador.js'],
    },
  ];

  const enElPerfil = (...partes) => {
    const f = SV.dirsvc.get('ProfD', Ci.nsIFile).clone();
    for (const p of partes) f.append(p);
    return f;
  };

  // Lectura sincrona con la API de flujos de siempre. Se usa esta y no IOUtils
  // porque IOUtils es asincrono, y aqui el orden importa: el inyector no se puede
  // cargar antes de que el motor este publicado. Con una promesa habria una
  // ventana, corta pero real, en la que un proceso de contenido arrancaria sin
  // encontrar nada.
  const leerTexto = (archivo) => {
    const flujo = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(Ci.nsIFileInputStream);
    flujo.init(archivo, 0x01, 0o444, 0);           // 0x01 = solo lectura
    const conversor = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
    conversor.init(flujo, 'UTF-8', 0, 0xFFFD);
    let texto = '';
    const trozo = {};
    while (conversor.readString(4096, trozo) !== 0) texto += trozo.value;
    conversor.close();
    flujo.close();
    return texto;
  };

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[nativo] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  // Carga un script en cada ventana de navegador, presente y futura.
  //
  // SE ESPERA AL 'load' Y SE MIRA EL windowtype, no la url. Cuando salta
  // 'domwindowopened' la ventana todavia esta en about:blank, asi que preguntar
  // ahi por su direccion no distingue una ventana de navegador de un dialogo
  // cualquiera. El atributo `windowtype="navigator:browser"` del elemento raiz
  // es el mismo dato por el que Services.wm sabe enumerar ventanas de
  // navegador: si eso cambiara de nombre, se romperia mucho mas que esto.
  //
  // El bucle sobre las que ya estan abiertas no sobra aunque al arrancar no haya
  // ninguna: este cargador tambien se ejecuta cuando se recarga a mano desde la
  // consola del navegador, y ahi la ventana ya existe.
  // `loadSubScript` NO ACEPTA UNA URL `file://` --------------------- MEDIDO -
  // Medido el 12-09-2026 en Zen 1.22b (Gecko 155.0.1): cargar el script de
  // ventana desde su ruta en el perfil falla con
  //
  //   Trying to load untrusted URI.: file:///C:/.../zen-sin-cristal/ventana.js
  //
  // Gecko solo deja meter codigo en un ambito privilegiado desde esquemas que
  // considera de confianza, y `file://` no lo es por mucho que el archivo sea
  // tuyo y el codigo corra como sistema. El inyector de proceso no se entera
  // porque `loadProcessScript` va por otro camino y si acepta `file://`: por eso
  // el sintoma era tan raro —el mod arrancaba, marcaba los documentos, y la
  // entrada del menu no aparecia nunca—.
  //
  // La salida es la misma que usa fx-autoconfig: registrar una sustitucion
  // `resource://` que apunte a `<perfil>/chrome` y cargar por ahi. `resource:`
  // si esta en la lista de confianza. Se registra una sola vez, la primera vez
  // que un mod pide script de ventana, y no se retira: vive lo que viva Zen.
  const ESPACIO = 'zen-nativo';
  let sustitucionPuesta = false;

  const ponerSustitucion = () => {
    if (sustitucionPuesta) return true;
    try {
      const manejador = SV.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
      manejador.setSubstitution(ESPACIO, SV.io.newFileURI(enElPerfil('chrome')));
      sustitucionPuesta = true;
      return true;
    } catch (e) {
      registrar('no pude registrar resource://' + ESPACIO + '/: ' + e);
      return false;
    }
  };

  const engancharEnVentanas = (nombre, dir, nombreArchivo, archivo) => {
    if (!ponerSustitucion()) return;
    // La marca de tiempo en la url evita que se sirva la version anterior desde
    // la cache de scripts cuando se reinstala.
    const url = `resource://${ESPACIO}/${dir}/${nombreArchivo}?${archivo.lastModifiedTime}`;

    const poner = (win) => {
      try {
        const raiz = win.document && win.document.documentElement;
        if (!raiz || raiz.getAttribute('windowtype') !== 'navigator:browser') return;
        SV.scriptloader.loadSubScript(url, win);
      } catch (e) {
        registrar(nombre + ' no engancho en una ventana: ' + e);
      }
    };

    SV.obs.addObserver({
      observe(sujeto) {
        try {
          sujeto.addEventListener('load', () => poner(sujeto), { once: true });
        } catch (e) {
          registrar(nombre + ' no pudo esperar a una ventana: ' + e);
        }
      },
    }, 'domwindowopened');

    try {
      for (const win of SV.wm.getEnumerator('navigator:browser')) poner(win);
    } catch (e) {
      registrar(nombre + ' no pudo repasar las ventanas abiertas: ' + e);
    }
  };

  const enPie = [];

  for (const mod of MODS) {
    try {
      const inyector = mod.inyector ? enElPerfil('chrome', mod.dir, mod.inyector) : null;
      const ventana = mod.ventana ? enElPerfil('chrome', mod.dir, mod.ventana) : null;

      // Sin su primera pieza no hay mod. Y no se avisa: lo normal es que un mod
      // que no esta instalado simplemente no este, y una consola llena de
      // quejas por los mods que el usuario nunca quiso es ruido que acaba
      // tapando lo que si importa.
      const primeraPieza = inyector || ventana;
      if (!primeraPieza || !primeraPieza.exists()) continue;

      // `publicar` es una entrada o una lista de entradas, y cada una puede ir
      // marcada `opcional`: Zen Modo Oscuro lleva su motor (obligatorio) y la
      // base de arreglos por sitio (sin ella funciona igual, solo mas torpe).
      if (mod.publicar) {
        let completo = true;
        for (const entrada of [].concat(mod.publicar)) {
          const cuerpo = enElPerfil('chrome', mod.dir, entrada.archivo);
          if (!cuerpo.exists()) {
            if (entrada.opcional) continue;
            // Esto SI se avisa: hay medio mod instalado. Es el estado que deja una
            // copia a medias, y sin el aviso el sintoma es "no hace nada".
            registrar(mod.nombre + ': falta ' + cuerpo.path + '. Vuelve a ejecutar su instalador');
            completo = false;
            break;
          }
          SV.ppmm.sharedData.set(entrada.clave, leerTexto(cuerpo));
        }
        if (!completo) continue;

        // El flush va ANTES de cargar el inyector, no al final del bucle: el
        // process script arranca en cuanto se le llama y lo primero que hace es
        // leer sharedData. Si el flush quedara para el final, el primer mod
        // podria nacer sin encontrar lo suyo.
        SV.ppmm.sharedData.flush();
      }

      // El segundo argumento es lo que hace que tambien se cargue en los procesos
      // de contenido que nazcan DESPUES de arrancar, que son casi todos: Zen crea
      // uno por sitio. Sin el, el mod solo funcionaria en la primera pestana.
      // La marca de tiempo en la url evita que se sirva la version anterior desde
      // la cache de scripts cuando se reinstala.
      if (inyector) {
        const url = SV.io.newFileURI(inyector).spec + '?' + inyector.lastModifiedTime;
        SV.ppmm.loadProcessScript(url, true);
      }

      // Va DESPUES del inyector a proposito: el script de ventana es el que
      // pone el interruptor a mano del usuario, y no debe poder pulsarse antes
      // de que exista quien le haga caso.
      if (ventana) {
        if (ventana.exists()) engancharEnVentanas(mod.nombre, mod.dir, mod.ventana, ventana);
        else registrar(mod.nombre + ': falta ' + ventana.path + '. Vuelve a ejecutar su instalador');
      }

      // Scripts del proceso padre, una sola vez. Por `resource://` y no por
      // `file://`, por lo mismo que los de ventana (ver arriba).
      if (mod.padre && ponerSustitucion()) {
        for (const nombreArchivo of mod.padre) {
          const archivo = enElPerfil('chrome', mod.dir, nombreArchivo);
          if (!archivo.exists()) {
            registrar(mod.nombre + ': falta ' + archivo.path + '. Vuelve a ejecutar su instalador');
            break;
          }
          SV.scriptloader.loadSubScript(`resource://${ESPACIO}/${mod.dir}/${nombreArchivo}?${archivo.lastModifiedTime}`);
        }
      }

      enPie.push(mod.nombre);
    } catch (e) {
      // Un mod que falla no se lleva por delante a los demas.
      registrar(mod.nombre + ' no arranco: ' + e);
    }
  }

  if (enPie.length) registrar('cargador en pie: ' + enPie.join(', '));
  else registrar('cargador en pie, sin ningun mod nativo en el perfil');
} catch (e) {
  // Sin este try/catch, un fallo aqui puede impedir que Zen arranque: el
  // autoconfig corre antes que la interfaz. Que se quede sin mods, no sin
  // navegador.
  Components.utils.reportError('[nativo] el cargador fallo: ' + e);
}
