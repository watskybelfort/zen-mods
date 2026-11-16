// Zen Sin Cristal — inyector de proceso de contenido
//
// Corre una vez por proceso de contenido, con principal de sistema, y hace dos
// cosas en cada documento cuyo sitio este en la lista de apagados: poner el
// atributo `zen-sin-cristal` en el elemento raiz, y dejar muerta la hoja que
// inyecta la extension Zen Internet. La segunda la hace tambien, con el cristal
// puesto, en los sitios de SIN_EXTENSION.
//
// De ahi en adelante no hace nada mas: quien apaga el cristal es el CSS. Las
// reglas de mods/appearance/acrylic-glass/web/00-base.css, mods/appearance/acrylic-glass/web/10-wrappers.css, mods/appearance/acrylic-glass/web/20-aggressive.css y los
// bloques por sitio de mods/appearance/acrylic-glass/web/50-sites.css llevan una guarda que las desactiva
// cuando ese atributo esta puesto. Este archivo solo decide en que documentos
// aparece.
//
// POR QUE UN ATRIBUTO Y NO UNA HOJA DE ESTILOS ---------------------- MEDIDO -
// La primera idea era la obvia: inyectar aqui una hoja que devolviera el fondo.
// No se puede, y no por una limitacion de Gecko sino de la cascada. Nuestras
// reglas viven en una hoja de USUARIO con `!important`, y en ese origen solo las
// gana el navegador. Para deshacerlas habria que escribir un valor concreto, y
// el valor que queremos —el fondo que puso el AUTOR de la pagina— no se puede
// nombrar: `revert` desde origen usuario retrocede al del navegador y se salta
// justo eso. La unica salida es que la regla no llegue a aplicar, o sea decidirlo
// ANTES, en el selector. Por eso este mod pone una marca en vez de estilos.
//
// LA LISTA VIAJA POR PREFS, NO POR sharedData ----------------------- MEDIDO -
// Zen Letra Viva usa `sharedData` porque tiene que mover 135 KB de motor. Aqui
// lo que cruza es una lista de dominios, y para eso las prefs ya hacen el
// trabajo: Gecko las replica solo a todos los procesos de contenido y avisa a
// los observadores cuando cambian. Es lo que hace que el interruptor se note sin
// recargar la pagina y sin que el lado del chrome tenga que hablar con nadie:
// escribe la pref y ya.
//
// Y quita una carrera que sharedData si tenia: los procesos de contenido de las
// pestanas restauradas nacen antes de que termine de abrirse la primera ventana,
// asi que un publicador que viviera en la ventana llegaria tarde al primer
// documento. Una pref con valor por defecto esta antes que todo eso.
//
// LA OTRA FUENTE DE CRISTAL: LA EXTENSION --------------------------- MEDIDO -
// Nuestra capa web no es la unica que deja las paginas transparentes. La
// extension Zen Internet ({91aa3897-2634-4a8a-9092-279db23a7689}) hace lo mismo
// por su cuenta, y el interruptor no la tocaba: se apagaba nuestro cristal, se
// quedaba el suyo, y desde fuera parecia que el menu no hacia nada.
//
// Su forma de trabajar, leida de su `content-script.js` v3.2.0: crea un
// `<style id="zeninternet-styles">`, lo cuelga como ULTIMO hijo de `<head>` para
// ganar la cascada, y lo re-ancla con un MutationObserver propio cada vez que la
// pagina mete otra hoja. Escribe `textContent` y llama a `appendChild`, y nunca
// toca `media`. Por eso aqui se apaga con `media` (el porque de no usar
// `disabled` esta en `apagarHoja`): no hay propiedad en disputa, no hay pelea de
// observadores, y la extension conserva sus ajustes intactos —en su panel el
// sitio sigue figurando encendido, que es justo lo acordado: el interruptor es
// nuestro y no le reescribe la configuracion a nadie.
//
// HACE FALTA UN OBSERVADOR, Y POR ESO ES BARATO. La hoja todavia no existe
// cuando se dispara `document-element-inserted`: la extension la inyecta cuando
// su proceso de fondo le contesta, mas tarde. Se vigila solo en los documentos
// que estan en la lista, con `childList` y SIN `subtree`: la extension siempre
// cuelga de `head`, y un observador de subarbol en una pagina grande se paga en
// cada mutacion del DOM.

'use strict';

(() => {
  // Igual que en el cargador: en Gecko 153 `Services` es un global automatico en
  // todo contexto con principal de sistema, y el modulo que se importaba ya no
  // existe. El global primero, el import de respaldo para builds anteriores.
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const PREF_SITIOS = 'zen.sincristal.sitios';
  const PREF_ENCENDIDO = 'zen.sincristal.encendido';

  // El nombre que buscan las guardas del CSS. Si se cambia aqui hay que
  // cambiarlo en mods/appearance/acrylic-glass/web/00-base.css, mods/appearance/acrylic-glass/web/10-wrappers.css, mods/appearance/acrylic-glass/web/20-aggressive.css y
  // mods/appearance/acrylic-glass/web/50-sites.css: no hay forma de que uno se entere del otro, y el sintoma
  // de no hacerlo es que el interruptor deja de hacer nada, sin ningun error.
  const ATRIBUTO = 'zen-sin-cristal';

  // El id de la hoja de la extension. Es una frontera con software de un
  // tercero: si Zen Internet lo renombra, esto deja de apagarla y no avisa
  // nadie. Esta anotado en dev/MAINTENANCE.md como frontera 10.
  const HOJA_EXTENSION = 'zeninternet-styles';

  // Sitios donde la hoja de la extension se apaga SIEMPRE, con el cristal
  // puesto. Son sitios con bloque propio en mods/appearance/acrylic-glass/web/50-sites.css que ademas tienen
  // estilo en Zen Internet, y donde las dos capas juntas se pisan: la suya
  // trae `backdrop-filter`, que sobre una pagina vaciada se compone en negro, y
  // velos oscuros pensados para su cristal, no para el nuestro. Y la suya se
  // actualiza sola desde su repositorio cada dos horas, asi que lo que hoy
  // casa bien manana puede no casar: con ella fuera, el bloque medido es la
  // unica fuente y no hay nada que cambie por debajo.
  //
  // Solo va aqui lo que se ha comparado con y sin la hoja. ChatGPT, medido el
  // 24-09-2026: sin ella, cristal limpio; con ella, una burbuja al 30% de
  // negro detras de cada respuesta y un degradado negro del 34% en el pie.
  const SIN_EXTENSION = ['chatgpt.com'];

  const registrar = (msg) => {
    try { SV.console.logStringMessage('[sin-cristal] ' + msg); } catch (e) { /* nada que hacer */ }
  };

  // --- La lista -------------------------------------------------------------
  // Se acepta coma, punto y coma o espacios como separador. La pref la escribe
  // el menu del navegador, pero tambien se puede editar a mano en about:config o
  // desde el panel de mods, y ahi cada uno separa como le sale.
  const partir = (crudo) => String(crudo || '')
    .toLowerCase()
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^\.+/, ''))
    .filter(Boolean);

  let sitios = [];

  const releer = () => {
    let encendido = true;
    try { encendido = SV.prefs.getBoolPref(PREF_ENCENDIDO, true); } catch (e) { /* por defecto si */ }
    if (!encendido) { sitios = []; return; }
    try { sitios = partir(SV.prefs.getStringPref(PREF_SITIOS, '')); } catch (e) { sitios = []; }
  };

  // Un dominio de la lista cubre sus subdominios, igual que el `domain()` de las
  // reglas del CSS: apagar `ejemplo.com` apaga tambien `www.ejemplo.com`. Lo que
  // NO hace, y tampoco lo hace `domain()`, es cruzar sufijos: `ejemplo.com` no
  // cubre `ejemplo.com.co`. Son dominios distintos y se apagan por separado.
  const casaEn = (lista, host) => {
    if (!host) return false;
    const h = host.toLowerCase();
    for (const s of lista) {
      if (h === s || h.endsWith('.' + s)) return true;
    }
    return false;
  };
  const casa = (host) => casaEn(sitios, host);

  // --- La hoja de la extension ----------------------------------------------
  // Se apaga con `media="not all"`, NO con `disabled`, y la diferencia es
  // exactamente el fallo intermitente que tuvo el interruptor. -------- MEDIDO -
  //
  // `disabled` no es del elemento sino de SU HOJA: HTMLStyleElement.disabled
  // pone la bandera en el CSSStyleSheet que el <style> tiene en ese momento. Y
  // la extension reescribe `textContent` cada vez que reaplica —al activar la
  // pestana, en cada navegacion, y cada dos horas cuando baja estilos nuevos
  // (background.js v3.2.0: tabs.onActivated, tabs.onUpdated,
  // webNavigation.onCommitted)—. Reescribir el texto tira la hoja y monta otra,
  // que nace encendida. Como el <style> ya era el ultimo hijo de <head>, no se
  // mueve, el observador de abajo no ve ninguna mutacion, y su cristal volvia
  // sin avisar a nadie. De ahi que "a veces funcione y a veces no": dependia de
  // si habias cambiado de pestana desde que pulsaste el menu.
  //
  // `media` si es del elemento: cada hoja nueva que se monte a partir de el
  // hereda la consulta, y `not all` no casa con nada. La extension no toca
  // `media` en ningun sitio, asi que sigue sin haber propiedad en disputa. Lo
  // que el atributo valiera antes se guarda aparte para devolverlo tal cual.
  //
  // Y sigue sin borrarse el elemento: borrarlo dispara el observador de la
  // extension, que lo volveria a montar, y quedariamos los dos en un bucle
  // pegandonos por el mismo nodo.
  const MEDIA_APAGADA = 'not all';
  const MEDIA_GUARDADA = 'data-zen-sin-cristal-media';

  const apagarHoja = (doc, apagar) => {
    try {
      const hoja = doc.getElementById(HOJA_EXTENSION);
      // Sin la extension instalada esto es `null` siempre, y no pasa nada: el
      // mod no comprueba que exista ni depende de ella.
      if (!hoja) return;
      if (apagar) {
        if (!hoja.hasAttribute(MEDIA_GUARDADA)) hoja.setAttribute(MEDIA_GUARDADA, hoja.getAttribute('media') || '');
        if (hoja.getAttribute('media') !== MEDIA_APAGADA) hoja.setAttribute('media', MEDIA_APAGADA);
      } else if (hoja.hasAttribute(MEDIA_GUARDADA)) {
        const antes = hoja.getAttribute(MEDIA_GUARDADA);
        if (antes) hoja.setAttribute('media', antes);
        else hoja.removeAttribute('media');
        hoja.removeAttribute(MEDIA_GUARDADA);
      }
    } catch (e) { /* documento cerrandose */ }
  };

  // Un observador por documento apagado. En WeakMap para que se vaya con el
  // documento: a un MutationObserver lo mantienen vivo los nodos que observa, no
  // al reves, asi que cuando el documento muere se lo lleva por delante.
  const vigilados = new WeakMap();

  const enganchar = (doc, mo) => {
    // Dos objetivos y no uno: `documentElement` para cazar el `<head>` cuando
    // todavia no existe —en `document-element-inserted` muchas veces no esta—, y
    // `head` para cazar el `<style>` y los re-anclajes de la extension.
    try { if (doc.documentElement) mo.observe(doc.documentElement, { childList: true }); } catch (e) { /* nada */ }
    try { if (doc.head) mo.observe(doc.head, { childList: true }); } catch (e) { /* nada */ }
  };

  const vigilar = (doc) => {
    if (vigilados.has(doc)) return;
    // El constructor se le pide a la ventana del documento, no al global de este
    // script: un observador creado en el compartimento del contenido es el que
    // Gecko deja observar nodos del contenido sin pelearse con los Xray.
    const win = doc.defaultView;
    const MO = (win && win.MutationObserver)
      || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
    if (!MO) return;
    let mo;
    try {
      mo = new MO(() => {
        apagarHoja(doc, true);
        // Re-enganchar en cada pasada es lo que recoge el `<head>` en cuanto
        // aparece. Volver a observar un objetivo que ya se observa con las
        // mismas opciones no duplica nada.
        enganchar(doc, mo);
      });
    } catch (e) {
      registrar('no pude vigilar la hoja de la extension: ' + e);
      return;
    }
    vigilados.set(doc, mo);
    enganchar(doc, mo);
  };

  const desvigilar = (doc) => {
    const mo = vigilados.get(doc);
    if (!mo) return;
    try { mo.disconnect(); } catch (e) { /* nada */ }
    vigilados.delete(doc);
  };

  // --- Los documentos -------------------------------------------------------
  // Se guardan en WeakRef para poder repasarlos cuando cambie la lista, que es
  // lo que hace que el interruptor se note sin recargar. En WeakRef y no en
  // WeakSet porque un WeakSet no se puede recorrer: aqui hace falta justo eso.
  // El precio es tener que barrer las referencias muertas a mano.
  const vistos = new Set();

  const barrer = () => {
    for (const ref of vistos) {
      if (!ref.deref()) vistos.delete(ref);
    }
  };

  const aplicar = (doc) => {
    try {
      const raiz = doc.documentElement;
      if (!raiz) return;
      // `hostname` y no `host`: `host` lleva el puerto pegado y el lado del
      // chrome, que es quien escribe la lista, lo saca de `nsIURI.host`, que no
      // lo lleva. Con `host` no casaria nada en cuanto hubiera un puerto.
      const host = doc.location ? doc.location.hostname : '';
      const apagado = casa(host);
      if (apagado) raiz.setAttribute(ATRIBUTO, '');
      else raiz.removeAttribute(ATRIBUTO);

      // Las dos mitades del interruptor van juntas a proposito: si la hoja de la
      // extension se apagara en otro sitio, habria un instante con el atributo
      // ya puesto y el cristal de ella todavia encendido, y eso se ve. La hoja
      // se queda apagada tambien donde nuestro bloque manda (SIN_EXTENSION),
      // tambien al volver a encender el cristal en ese sitio.
      const sinHoja = apagado || casaEn(SIN_EXTENSION, host);
      apagarHoja(doc, sinHoja);
      if (sinHoja) vigilar(doc);
      else desvigilar(doc);
    } catch (e) {
      // Un documento que se cierra mientras se le mira lanza al tocar el DOM.
      // No es un fallo del mod y no merece una linea en la consola.
    }
  };

  const repasar = () => {
    releer();
    for (const ref of vistos) {
      const doc = ref.deref();
      if (doc) aplicar(doc);
      else vistos.delete(ref);
    }
  };

  const observadorDeDocumentos = {
    observe(sujeto) {
      try {
        const doc = sujeto;
        if (!doc || !doc.documentElement) return;
        if (vistos.size > 400) barrer();
        vistos.add(new WeakRef(doc));
        aplicar(doc);
      } catch (e) {
        registrar('fallo mirando un documento: ' + e);
      }
    },
  };

  // Las prefs llegan replicadas a este proceso y el observador se dispara con la
  // replicacion, que es lo que convierte "he pulsado el menu" en "la pagina ya
  // cambio" sin recargar nada.
  const observadorDePrefs = {
    observe() {
      try { repasar(); } catch (e) { registrar('fallo repasando: ' + e); }
    },
  };

  releer();

  // document-element-inserted es el momento en que el documento ya tiene su
  // elemento raiz pero todavia no ha corrido ningun script de la pagina: la
  // marca esta puesta antes del primer pintado, asi que no hay parpadeo.
  SV.obs.addObserver(observadorDeDocumentos, 'document-element-inserted');
  SV.prefs.addObserver(PREF_SITIOS, observadorDePrefs);
  SV.prefs.addObserver(PREF_ENCENDIDO, observadorDePrefs);
})();
