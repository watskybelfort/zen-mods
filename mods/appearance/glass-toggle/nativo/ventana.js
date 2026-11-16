// Zen Sin Cristal — el submenu "Zen Cristal" del clic derecho
//
// Lo carga el cargador nativo en cada ventana de navegador, con
// `loadSubScript`, asi que corre DENTRO del ambito de la ventana: `document`,
// `gBrowser` y compania estan a mano sin pedirlos.
//
// Todo lo que hace es escribir una pref. Quien apaga el cristal es el inyector
// de contenido (proceso.js), que escucha esa pref y marca los documentos, y
// quien lo apaga de verdad es el CSS, que deja de aplicar donde esta la marca.
// Tres piezas, una direccion: pref -> atributo -> regla que no aplica.
//
// POR QUE EL CLIC DERECHO Y NO UN BOTON EN LA BARRA. Un boton necesita un sitio
// donde ponerse, y la barra de Zen es suya: cambia de estructura entre versiones
// y con cada ajuste de la interfaz. `#contentAreaContextMenu` es de Firefox, no
// de Zen, y lleva con ese id desde siempre. Se paga un clic de mas y se gana no
// tener que perseguir el nombre de un contenedor en cada actualizacion.
//
// POR QUE UN SUBMENU Y NO UNA ENTRADA SUELTA. Una entrada nuestra en el menu del
// clic derecho de Firefox es una linea ajena en un menu ajeno, y en cuanto son
// dos ya no se sabe de quien son. Una sola, "Zen Cristal", dice de quien es lo
// que hay dentro y ocupa una linea pase lo que pase.
//
// El precio es que el interruptor pierde el titulo: un <menu> XUL no admite
// type="checkbox" -el marco de la casilla lo pinta el menuitem, no el menu- asi
// que BAJA dentro del popup, y es ahi donde sigue diciendo "Ver ejemplo.com sin
// cristal". Las dos cosas que decia siguen dichas: el checkbox, que esto se
// queda puesto y se vuelve a pulsar para deshacerlo; y el dominio, que lo que se
// apaga es el SITIO entero y no la pestana.
//
// FIREFOX SE METE DENTRO DE NUESTRO POPUP ---------------------------- MEDIDO -
// nsContextMenu.sys.mjs recorre los hijos del menu y, con cada <menu> que no
// este oculto, entra en su `menupopup` a ordenar separadores. De ahi salen dos
// obligaciones que no se adivinan:
//
//   - el <menupopup> tiene que estar colgado del <menu> ANTES de meter el <menu>
//     en el documento. Un <menu> sin popup pinta la flechita y no abre nada.
//   - nuestro popupshowing corre DESPUES del de Firefox -el suyo se registra en
//     DOMContentLoaded y a nosotros nos engancha el cargador en `load`- asi que
//     cuando Firefox ordena los separadores todavia esta mirando los `hidden`
//     del clic ANTERIOR. Por eso al final se le vuelve a pedir que los ordene,
//     con la funcion que el mismo publica en el menu para esto y que solo existe
//     mientras el menu esta abierto.
//
// Y NINGUN ID NUESTRO EMPIEZA POR `context-`. browser-context.js cuelga un
// listener de `command` del propio #contentAreaContextMenu con un switch sobre
// `event.target.id` que remata en `startsWith("context-pdfjs-")`. Nuestros
// command burbujean hasta ahi. Con el prefijo `zen-cristal-` no hay forma de
// chocar, ni hoy ni cuando anadan casos nuevos.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const PREF_SITIOS = 'zen.sincristal.sitios';
  const PREF_ENCENDIDO = 'zen.sincristal.encendido';

  // El timbre de la lista de paginas pendientes. NO lleva la lista: lleva
  // "<cuantas>@<milisegundos>", o sea algo que cambia siempre. Su unico trabajo
  // es despertar a las demas ventanas; la lista vive en el archivo.
  //
  // POR QUE LA LISTA NO ES UNA PREF, aunque la de sitios si lo sea:
  //
  //   - la de sitios son seis dominios y la LEE cada proceso de contenido, que
  //     es justo para lo que las prefs sirven. Esta crece sin techo y no la lee
  //     ningun proceso de contenido: replicarla seria copiar la lista de lectura
  //     del usuario a los veintitantos procesos que Zen abre, a cambio de nada.
  //   - y sobre todo, una pref llega al disco cuando Gecko vuelca prefs.js, que
  //     es perezoso. El motivo entero de que esto exista es poder pasarle el
  //     archivo a alguien SIN cerrar el navegador, y una pref entregaria el de
  //     hace diez minutos.
  const PREF_SELLO = 'zen.sincristal.pendientes.sello';

  // EN LA RAIZ DEL PERFIL, NO EN chrome/zen-sin-cristal/ -------------- MEDIDO -
  // El desinstalador borra esa carpeta entera con rmSync recursivo. La lista ahi
  // dentro se iria con ella, que es justo lo que ese mismo instalador promete no
  // hacer con los datos del usuario. En la raiz del perfil es donde Zen pone los
  // suyos: zen-themes.json y zen-keyboard-shortcuts.json. Misma forma, mismo
  // sitio, y un agente la encuentra sin preguntar.
  const ARCHIVO = 'zen-cristal-pendientes.json';
  const FORMATO = 1;

  const ID_RAIZ = 'zen-cristal-menu';
  const ID_POPUP = 'zen-cristal-popup';
  const ID_APAGAR = 'zen-cristal-apagar';
  const ID_SEP = 'zen-cristal-sep';
  const ID_GUARDAR = 'zen-cristal-guardar';
  const ID_EXPORTAR = 'zen-cristal-exportar';
  const ID_IMPORTAR = 'zen-cristal-importar';

  // El id de cuando esto era una entrada suelta. Se conserva solo para poder
  // retirarla al recargar en caliente; ver mas abajo.
  const ID_VIEJO = 'zen-sin-cristal-item';

  const ID_MENU = 'contentAreaContextMenu';

  // Donde intentar meterlo, en orden. Se elige el primero que exista y va justo
  // ANTES; si no hay ninguno, al final del menu. La lista es de mas a menos
  // deseable, no de mas a menos probable: son todas entradas de "esta pagina",
  // que es el grupo al que esto pertenece.
  const VECINOS = ['context-savepage', 'context-take-screenshot', 'context-viewsource', 'context-selectall'];

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[sin-cristal] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  const menu = document.getElementById(ID_MENU);
  if (!menu) {
    registrar('no hay #' + ID_MENU + ' en esta ventana: sin interruptor');
    return;
  }

  // Volver a cargarlo en la misma ventana no debe dejar dos entradas. Pasa al
  // reinstalar sin reiniciar, que es lo que uno hace mientras lo esta afinando,
  // y puede encontrarse dos estados distintos: el submenu ya puesto, o la
  // entrada suelta de la version anterior. La segunda se retira. Su listener
  // sigue registrado y no hay forma de quitarlo, pero como captura el nodo en su
  // propio ambito, lo unico que seguira tocando es un elemento ya desconectado
  // del documento: invisible y sin efecto.
  if (document.getElementById(ID_RAIZ)) return;
  const suelta = document.getElementById(ID_VIEJO);
  if (suelta && suelta.parentNode === menu) suelta.remove();

  // --- La lista, tal y como se guarda --------------------------------------
  const partir = (crudo) => String(crudo || '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^\.+/, ''))
    .filter(Boolean);

  const leer = () => {
    try { return partir(SV.prefs.getStringPref(PREF_SITIOS, '')); } catch (e) { return []; }
  };

  // Se guarda separado por comas y espacio: es lo que mejor se lee cuando uno
  // acaba mirandolo en about:config, que es donde se mira cuando algo va raro.
  const escribir = (lista) => {
    try { SV.prefs.setStringPref(PREF_SITIOS, lista.join(', ')); } catch (e) { registrar('no pude escribir la lista: ' + e); }
  };

  // --- Que sitio es este ----------------------------------------------------
  // El dominio base y no el host: apagar el cristal en `www.ejemplo.com` tiene
  // que apagarlo en `ejemplo.com`, o el interruptor pareceria no funcionar en
  // cuanto el sitio te mueva de subdominio. `getBaseDomainFromHost` es el que
  // sabe de sufijos publicos, o sea el que acierta con `ejemplo.com.co` y con
  // `ejemplo.co.uk`, donde recortar por puntos se equivocaria.
  //
  // Lanza con las IP y con los hosts de una sola etiqueta (`localhost`): ahi no
  // hay dominio base que sacar y el host ya es la respuesta.
  const sitioDe = (uri) => {
    if (!uri) return '';
    if (uri.scheme !== 'http' && uri.scheme !== 'https') return '';
    let host = '';
    try { host = uri.host; } catch (e) { return ''; }
    if (!host) return '';
    try { return SV.eTLD.getBaseDomainFromHost(host).toLowerCase(); } catch (e) { return host.toLowerCase(); }
  };

  const sitioActual = () => {
    try { return sitioDe(gBrowser.selectedBrowser.currentURI); } catch (e) { return ''; }
  };

  // --- La pagina de ahora, tal y como se apuntaria ---------------------------
  // `null` donde no hay pagina que apuntar: about:, file:, el visor de PDF, la
  // pagina de nueva pestana.
  const paginaActual = () => {
    let uri = null;
    try { uri = gBrowser.selectedBrowser.currentURI; } catch (e) { return null; }
    if (!uri || (uri.scheme !== 'http' && uri.scheme !== 'https')) return null;
    let url = '';
    try { url = uri.spec; } catch (e) { return null; }
    if (!url) return null;
    return {
      url,
      sitio: sitioDe(uri),
      // Se captura AHORA y no se deriva luego: en cuanto se cierre la pestana no
      // hay de donde sacarlo, y un archivo de URLs peladas no lo entiende nadie
      // a los tres dias.
      titulo: String((typeof gBrowser !== 'undefined' && gBrowser.contentTitle) || ''),
      guardado: new Date().toISOString(),
    };
  };

  const sitioDeTexto = (url) => {
    try { return sitioDe(SV.io.newURI(url)); } catch (e) { return ''; }
  };

  // Es lo mismo que hace PrivateBrowsingUtils.privacyContextFromWindow, escrito
  // aqui en vez de importar el modulo entero por una linea.
  //
  // Se pregunta por el docShell y NO por el atributo privatebrowsingmode de la
  // raiz, que seria mas corto: ese atributo solo se pone en las ventanas
  // privadas TEMPORALES. Con browser.privatebrowsing.autostart encendido la
  // ventana es privada y el atributo no esta, o sea que el atajo daria
  // exactamente la respuesta contraria en el unico caso que importa.
  const esPrivada = () => {
    try { return !!window.docShell.QueryInterface(Ci.nsILoadContext).usePrivateBrowsing; } catch (e) { return false; }
  };

  // --- La lista de paginas pendientes ---------------------------------------
  const rutaLista = () => PathUtils.join(PathUtils.profileDir, ARCHIVO);

  // La copia en memoria de ESTA ventana. Solo la usa el menu al abrirse, que
  // tiene que ser sincrono; escribir nunca parte de aqui, siempre relee.
  let pendientes = [];

  // Las escrituras de ESTA ventana, en fila. Es la carrera que si es alcanzable
  // a mano: tres clics seguidos en el mismo menu.
  let cola = Promise.resolve();

  const envolver = (lista) => ({ formato: FORMATO, generado: new Date().toISOString(), pendientes: lista });

  // Se acepta tambien un array pelado y entradas que sean solo una cadena: el
  // archivo esta pensado para que lo edite una persona o lo escriba un agente, y
  // exigirle el sobre entero para que valga seria exigirle que lea esto antes.
  const sanear = (bruto) => {
    const crudas = Array.isArray(bruto) ? bruto : (bruto && Array.isArray(bruto.pendientes) ? bruto.pendientes : []);
    const vistas = new Set();
    const salida = [];
    for (const e of crudas) {
      const url = (typeof e === 'string') ? e : ((e && e.url) || '');
      if (!/^https?:\/\//i.test(url) || vistas.has(url)) continue;
      vistas.add(url);
      salida.push({
        url,
        sitio: (e && e.sitio) || sitioDeTexto(url),
        titulo: (e && typeof e.titulo === 'string') ? e.titulo : '',
        guardado: (e && e.guardado) || new Date().toISOString(),
      });
    }
    return salida;
  };

  // Devuelve ok:false cuando el archivo ESTA pero no se deja leer, que es
  // distinto de que no exista. Quien escribe mira esa bandera.
  const leerLista = async () => {
    const ruta = rutaLista();
    try {
      if (!(await IOUtils.exists(ruta))) return { lista: [], ok: true };
    } catch (e) {
      return { lista: [], ok: false };
    }
    try {
      return { lista: sanear(await IOUtils.readJSON(ruta)), ok: true };
    } catch (e) {
      registrar('no pude leer ' + ruta + ': ' + e);
      return { lista: [], ok: false };
    }
  };

  const sellar = (n) => {
    try { SV.prefs.setStringPref(PREF_SELLO, n + '@' + Date.now()); } catch (e) { registrar('no pude tocar el timbre: ' + e); }
  };

  // tmpPath escribe aparte y renombra encima, asi que nadie puede leer el
  // archivo a medio escribir: ni otra ventana, ni el agente que lo este mirando.
  const escribirLista = async (lista) => {
    const ruta = rutaLista();
    await IOUtils.writeJSON(ruta, envolver(lista), { tmpPath: ruta + '.tmp' });
    pendientes = lista;
    // El timbre va DESPUES de que el archivo este en su sitio: es el que
    // despierta a las otras ventanas, y despertarlas antes las mandaria a leer
    // lo viejo.
    sellar(lista.length);
  };

  const refrescar = () => {
    cola = cola
      .then(async () => {
        const r = await leerLista();
        if (r.ok) pendientes = r.lista;
      })
      .catch((e) => registrar('no pude releer la lista: ' + e));
    return cola;
  };

  // mutar recibe la lista recien leida del DISCO y devuelve la nueva, o null si
  // no habia nada que cambiar.
  //
  // DOS VENTANAS A LA VEZ, DICHO ENTERO. Todas las ventanas de chrome corren en
  // el mismo hilo del proceso padre, asi que un manejador de command corre
  // entero sin que nadie se cuele: el unico punto de entrelazado es el await del
  // disco. La secuencia mala existe --A lee, B lee, A escribe, B escribe y se
  // come lo de A-- pero para llegar ahi hay que hacer clic en la otra ventana
  // dentro de los dos o tres milisegundos que dura una lectura. No es alcanzable
  // a mano, y se cura sola: cada escritura RELEE el disco en vez de fiarse de la
  // copia en memoria, y el timbre pone al dia a las demas ventanas, asi que una
  // entrada perdida se ve al instante --la casilla sale sin marcar-- y se vuelve
  // a pulsar. Un candado de verdad necesitaria un objeto compartido por todo el
  // proceso, y en un script que se carga por ventana con loadSubScript no hay
  // ninguno limpio: no es un olvido, es que no compensa.
  const mutarLista = (mutar) => {
    cola = cola
      .then(async () => {
        const r = await leerLista();
        // UN ARCHIVO ILEGIBLE NO SE PISA. Un JSON a medias --una copia
        // interrumpida, un editor que lo dejo abierto-- se convertiria, con una
        // escritura encima, en la perdida de la lista entera, que es el unico
        // dato del mod que no se puede regenerar. Se avisa y no se toca. Es la
        // misma regla que el instalador aplica al config.js ajeno.
        if (!r.ok) {
          registrar('la lista no se deja leer: no se escribe nada encima. Mira ' + rutaLista());
          return;
        }
        const nueva = mutar(r.lista);
        if (!nueva) return;
        await escribirLista(nueva);
      })
      .catch((e) => registrar('no pude guardar la lista: ' + e));
    return cola;
  };

  // --- El submenu -----------------------------------------------------------
  // Se construye entero y solo al final se inserta: ver la nota de cabecera
  // sobre por que el <menupopup> no puede llegar despues que el <menu>.
  const crear = (etiqueta, id, atributos) => {
    const n = document.createXULElement(etiqueta);
    if (id) n.id = id;
    for (const [k, v] of Object.entries(atributos || {})) n.setAttribute(k, v);
    return n;
  };

  const raiz = crear('menu', ID_RAIZ, { label: 'Zen Cristal' });
  const popup = crear('menupopup', ID_POPUP);
  const itemApagar = crear('menuitem', ID_APAGAR, { type: 'checkbox', label: 'Ver este sitio sin cristal' });

  const sep = crear('menuseparator', ID_SEP);
  const itemGuardar = crear('menuitem', ID_GUARDAR, { type: 'checkbox', label: 'Guardar esta pagina para revisar' });
  const itemExportar = crear('menuitem', ID_EXPORTAR, { label: 'Exportar la lista...' });
  const itemImportar = crear('menuitem', ID_IMPORTAR, { label: 'Importar una lista...' });

  popup.append(itemApagar, sep, itemGuardar, itemExportar, itemImportar);
  raiz.appendChild(popup);

  const vecino = VECINOS.map((id) => document.getElementById(id)).find((n) => n && n.parentNode === menu);
  if (vecino) menu.insertBefore(raiz, vecino);
  else menu.appendChild(raiz);

  itemApagar.addEventListener('command', () => {
    const sitio = sitioActual();
    if (!sitio) return;
    const lista = leer();
    const i = lista.indexOf(sitio);
    if (i >= 0) lista.splice(i, 1);
    else lista.push(sitio);
    escribir(lista);
  });


  // --- Exportar e importar --------------------------------------------------
  // SE USA EL SELECTOR DE ARCHIVOS Y NO UNA RUTA FIJA. Una ruta fija obliga a
  // contarle al usuario donde esta, y a que quien reciba el archivo lo deje en
  // un sitio exacto antes de que pase nada. El selector es lo que ya sabe usar.
  // El archivo del perfil se sigue escribiendo solo en cada cambio: esto es
  // ademas, no en vez.
  //
  // LA FIRMA CAMBIO Y NO AVISA --------------------------------------- MEDIDO -
  // En Gecko moderno fp.init toma un browsingContext, no una ventana. Medido en
  // Zen 1.22.2b (Gecko 156.0): no queda ni un "fp.init(window," en los dos
  // omni.ja, y si veintitantos "fp.init(window.browsingContext, ...)". Pasarle
  // la ventana lanza, y el sintoma es un boton de menu que no hace nada.
  const abrirSelector = (titulo, modo, preparar, hecho) => {
    let fp;
    try {
      fp = Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);
      fp.init(window.browsingContext, titulo, modo);
      fp.appendFilter('Listas de Zen Cristal', '*.json');
      fp.appendFilters(Ci.nsIFilePicker.filterAll);
      if (preparar) preparar(fp);
    } catch (e) {
      registrar('no pude abrir el selector de archivos: ' + e);
      return;
    }
    fp.open((res) => {
      // returnReplace es "ha elegido un archivo que ya existe y ha dicho que
      // si". Comprobar solo returnOK deja el boton mudo justo al volver a
      // exportar encima del archivo de ayer, que es el caso normal.
      const bueno = res === Ci.nsIFilePicker.returnOK || res === Ci.nsIFilePicker.returnReplace;
      if (!bueno || !fp.file) return;
      Promise.resolve(hecho(fp.file.path)).catch((e) => registrar('el selector fallo despues: ' + e));
    });
  };

  const exportar = () => {
    abrirSelector(
      'Exportar la lista de Zen Cristal',
      Ci.nsIFilePicker.modeSave,
      (fp) => {
        fp.defaultString = ARCHIVO;
        fp.defaultExtension = 'json';
      },
      async (ruta) => {
        const r = await leerLista();
        if (!r.ok) {
          registrar('no exporto nada: la lista del perfil no se deja leer');
          return;
        }
        await IOUtils.writeJSON(ruta, envolver(r.lista));
        registrar('exportadas ' + r.lista.length + ' paginas a ' + ruta);
      }
    );
  };

  const importar = () => {
    abrirSelector(
      'Importar una lista en Zen Cristal',
      Ci.nsIFilePicker.modeOpen,
      null,
      async (ruta) => {
        let entrantes;
        try {
          entrantes = sanear(await IOUtils.readJSON(ruta));
        } catch (e) {
          SV.prompt.alert(window, 'Zen Cristal', 'Ese archivo no se pudo leer como una lista de Zen Cristal.');
          registrar('no pude leer la lista importada: ' + e);
          return;
        }

        // SE SUMA, NO SE SUSTITUYE. Importar es "anade lo que me han mandado", no
        // "tira lo mio". Quien recibe el archivo de otro suele tener su propia
        // lista a medio hacer, y perderla no se deshace con nada.
        let nuevas = 0;
        await mutarLista((lista) => {
          const vistas = new Set(lista.map((e) => e.url));
          for (const e of entrantes) {
            if (vistas.has(e.url)) continue;
            vistas.add(e.url);
            lista.push(e);
            nuevas++;
          }
          return nuevas ? lista : null;
        });

        // Un menu que no contesta nada parece roto aunque haya funcionado, y aqui
        // el numero importa: "he metido 12 de 40" y "no he metido ninguna porque
        // ya estaban" son dos resultados buenos que se ven igual.
        SV.prompt.alert(
          window,
          'Zen Cristal',
          nuevas
            ? nuevas + ' pagina(s) anadidas de las ' + entrantes.length + ' del archivo.'
            : 'No habia ninguna pagina nueva: las ' + entrantes.length + ' del archivo ya estaban en la lista.'
        );
      }
    );
  };

  itemGuardar.addEventListener('command', () => {
    const pagina = paginaActual();
    if (!pagina) return;
    mutarLista((lista) => {
      const i = lista.findIndex((e) => e.url === pagina.url);
      if (i >= 0) lista.splice(i, 1);
      else lista.push(pagina);
      return lista;
    });
  });

  itemExportar.addEventListener('command', exportar);
  itemImportar.addEventListener('command', importar);

  // --- Cuando se abre el menu -----------------------------------------------
  // Todo se recalcula en el popupshowing del PADRE y nada en el del submenu, a
  // proposito: el `hidden` del <menu> hay que decidirlo antes de que se pinte
  // nada, y el del submenu solo salta cuando el usuario ya esta encima. Ademas,
  // un solo sitio donde se decide es un solo sitio que puede equivocarse.
  //
  // El estado no se cachea: la lista la puede haber cambiado otra ventana, el
  // panel de mods o about:config.
  menu.addEventListener('popupshowing', (ev) => {
    // Los submenus burbujean su propio popupshowing hasta aqui, y desde que
    // tenemos uno, el nuestro tambien. Sin esto, abrir "Zen Cristal" volveria a
    // recalcular "Zen Cristal" mientras se abre.
    if (ev.target !== menu) return;

    let encendido = true;
    try { encendido = SV.prefs.getBoolPref(PREF_ENCENDIDO, true); } catch (e) { /* por defecto si */ }

    // Sin sitio no hay nada que apagar: `about:`, `file:`, el visor de PDF, la
    // pagina de nueva pestana. Esas tienen su propio trato en 90-exclusions.css
    // y no se apagan por dominio porque no tienen dominio.
    const sitio = sitioActual();

    // El submenu se queda aunque no haya sitio: importar una lista se hace
    // normalmente desde una pestana vacia, que es justo donde no hay dominio. Lo
    // que se esconde es lo que no aplica.
    raiz.hidden = !encendido;
    if (raiz.hidden) return;

    itemApagar.hidden = !sitio;
    if (sitio) {
      itemApagar.setAttribute('label', 'Ver ' + sitio + ' sin cristal');
      if (leer().includes(sitio)) itemApagar.setAttribute('checked', 'true');
      else itemApagar.removeAttribute('checked');
    }

    // GUARDAR NO APARECE EN UNA VENTANA PRIVADA, y el interruptor si. No es una
    // incoherencia: el interruptor apunta un DOMINIO que el usuario acaba de
    // decidir configurar, igual que cualquier otro ajuste; guardar apunta la URL
    // entera, el titulo y la hora, o sea un registro de por donde estuvo. Eso es
    // historial, y escribirlo al disco desde una ventana privada es exactamente
    // lo que una ventana privada promete no hacer.
    const pagina = paginaActual();
    itemGuardar.hidden = !pagina || esPrivada();
    if (!itemGuardar.hidden) {
      if (pendientes.some((e) => e.url === pagina.url)) itemGuardar.setAttribute('checked', 'true');
      else itemGuardar.removeAttribute('checked');
    }

    // El recuento va en la etiqueta de exportar y no en una entrada aparte: una
    // linea menos, y es la unica a la que el numero le cambia el sentido
    // --exportar cero paginas no lo quiere nadie--.
    const n = pendientes.length;
    itemExportar.setAttribute('label', n ? 'Exportar la lista (' + n + ')...' : 'Exportar la lista...');
    itemExportar.setAttribute('disabled', n ? 'false' : 'true');

    // Y ahora que los `hidden` son los de este clic, se le pide a Firefox que
    // vuelva a ordenar los separadores. Sin esto quedarian colocados segun el
    // estado del clic ANTERIOR, porque nsContextMenu ya paso por aqui antes que
    // nosotros. La funcion la publica el propio nsContextMenu para esto y solo
    // existe con el menu abierto, de ahi el `typeof`.
    try { if (typeof menu.showHideSeparators === 'function') menu.showHideSeparators(); } catch (e) { /* cosmetico */ }
  });

  // --- Enterarse de lo que hagan las demas ventanas -------------------------
  const observador = { observe: () => { try { refrescar(); } catch (e) { registrar('fallo refrescando: ' + e); } } };
  try {
    SV.prefs.addObserver(PREF_SELLO, observador);
    window.addEventListener('unload', () => {
      try { SV.prefs.removeObserver(PREF_SELLO, observador); } catch (e) { /* la ventana se va igual */ }
    }, { once: true });
  } catch (e) {
    registrar('sin observador de ' + PREF_SELLO + ': ' + e);
  }

  // La primera lectura. Es asincrona y no pasa nada: hasta que llegue, el menu
  // dice "Exportar la lista..." sin numero, que es lo mismo que dice con cero.
  refrescar();
})();
