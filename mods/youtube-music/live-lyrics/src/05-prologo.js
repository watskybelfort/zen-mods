/* --- Prologo --------------------------------------------------------------
   El motor entero vive dentro de UNA sola funcion anonima que arma
   dev/powershell/Build-LetraViva.ps1 concatenando los parciales de mods/youtube-music/live-lyrics/src/ en
   orden numerico. Es el mismo patron que userContent.css, que se arma con los
   parciales de web/: cada archivo se lee solo y el entregable es uno.

   Consecuencia practica: todos los parciales comparten el mismo cierre. Cada
   uno cuelga lo suyo de LV y nadie escribe en el objeto global de la pagina,
   asi que YouTube Music no ve nada nuestro y no hay colision posible con su
   codigo. La unica salida al exterior es window.__zenLetra, y es de solo
   lectura para depurar. */
'use strict';

const LV = {
  version: '__VERSION__',
  /* Prefijo de TODA clase, id y clave de almacen que escribimos. Un solo
     sitio del que salen, para que se puedan barrer de una pasada. */
  marca: 'zen-letra',
  debug: false,
  /* Cada parcial que traiga estilos los empuja aqui y el arranque los inyecta
     todos en UNA hoja. Asi el orden de los parciales no decide si una vista
     encuentra su CSS declarado, y sobre todo no hay cinco elementos <style>
     nuestros repartidos por el head. */
  hojas: [],
};

const log = (...a) => { if (LV.debug) console.log('%c[letra]', 'color:#d97757;font-weight:600', ...a); };
const warn = (...a) => console.warn('[letra]', ...a);

/* EL IDIOMA ---------------------------------------------------------------
   Lo que se ve sale en el idioma de la pagina de YouTube Music, que es el que el
   usuario tiene puesto en su cuenta (<html lang>), o en el que fuerce la pref
   zen.mods.idioma ('es' / 'en'), que llega del cargador como __zenIdioma. Si no
   es espanol, en ingles. Se mira cada vez y no una sola al arrancar: el lang se
   puede cambiar sin recargar. */
const idioma = () => {
  const forzado = typeof __zenIdioma === 'string' ? __zenIdioma : '';
  if (forzado === 'es' || forzado === 'en') return forzado;
  const l = (document.documentElement && document.documentElement.lang) || navigator.language || '';
  return /^es\b/i.test(l) ? 'es' : 'en';
};
const tr = (en, es) => (idioma() === 'es' ? es : en);

/* --- Utilidades ---------------------------------------------------------- */

const limitar = (n, min, max) => (n < min ? min : n > max ? max : n);

/* Clases con la marca delante, para no repetir el prefijo en cada plantilla. */
const c = (...partes) => partes.map((p) => `${LV.marca}-${p}`).join(' ');

const crear = (tag, clases, props) => {
  const el = document.createElement(tag);
  if (clases) el.className = clases;
  if (props) Object.assign(el, props);
  return el;
};

/* Espera a que un selector exista. YouTube Music es una SPA que construye el
   reproductor despues del primer pintado, asi que a document-start no hay casi
   nada: sin esto, cualquier querySelector del arranque devuelve null y el mod
   parece no cargar. Un MutationObserver en lugar de un intervalo porque el
   arbol de Polymer se rehace por partes y queremos enterarnos en el momento,
   no hasta 200 ms despues.

   SE OBSERVA `document`, NO `document.documentElement` ------------- MEDIDO -
   A document-start, que es cuando entra este script, `document.documentElement`
   TODAVIA ES NULL: el parser aun no ha emitido la etiqueta <html>. Pasarle null
   a observe() lanza "parameter 1 is not of type 'Node'", y como esto se llama
   desde el arranque, la excepcion se llevaba por delante el resto del arranque
   entero — el mod quedaba cargado y completamente muerto, sin una sola senal.
   El nodo Document si es observable y ya existe, asi que sirve de raiz. */
const esperar = (selector, limiteMs = 30000) => new Promise((resolve) => {
  const ya = document.querySelector(selector);
  if (ya) return resolve(ya);

  let reloj = 0;
  const obs = new MutationObserver(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    obs.disconnect();
    clearTimeout(reloj);
    resolve(el);
  });
  obs.observe(document.documentElement || document, { childList: true, subtree: true });
  reloj = setTimeout(() => { obs.disconnect(); resolve(null); }, limiteMs);
});

/* Vigila que un nodo nuestro siga colgado donde lo pusimos. Polymer rehace
   sus contenedores al cambiar de pagina o de estado del reproductor y se
   lleva por delante lo que le hayamos metido dentro; el sintoma es que la
   vista desaparece sola al volver de una busqueda. `montar` se vuelve a
   llamar cuando eso pasa. */
const vigilarMontaje = (contenedor, nodo, montar) => {
  const obs = new MutationObserver(() => {
    if (!nodo.isConnected && contenedor.isConnected) {
      log('remontando', nodo.className);
      montar();
    }
  });
  obs.observe(contenedor, { childList: true });
  return obs;
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
