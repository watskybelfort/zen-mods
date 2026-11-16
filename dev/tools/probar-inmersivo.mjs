/* Pruebas de Zen Inmersivo, sin navegador.
 *
 * La principal es de PARIDAD: ejecuta el background.js de la extension Zen
 * Internet 3.2.0 (mods/appearance/immersive-web/referencia, MIT) en node con un `browser` de mentira,
 * y compara el CSS que mandaria a cada pestana con el que calcula
 * mods/appearance/immersive-web/nativo/puro.js. Todas las webs del catalogo, sus subdominios, los
 * alias del mapeo y webs sin tema, con varios juegos de ajustes.
 *
 *   node dev/tools/probar-inmersivo.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = createRequire(import.meta.url)(join(raiz, 'mods/appearance/immersive-web/nativo/puro.js'));
const catalogo = JSON.parse(fs.readFileSync(join(raiz, 'mods/appearance/immersive-web/catalogo/styles.json'), 'utf8'));
const motorOriginal = fs.readFileSync(join(raiz, 'mods/appearance/immersive-web/referencia/zeninternet-3.2.0/background.js'), 'utf8');

let bien = 0;
let mal = 0;
const prueba = (nombre, fn) => {
  try { fn(); bien++; } catch (e) { mal++; console.log(`  FALLA  ${nombre}\n         ${e.message}`); }
};
const pruebaAsync = async (nombre, fn) => {
  try { await fn(); bien++; } catch (e) { mal++; console.log(`  FALLA  ${nombre}\n         ${e.message}`); }
};

// --- La extension, en una caja con un `browser` de mentira --------------------
// Sin require, sin process, sin red: solo lo que background.js usa.
const extension = (almacen) => {
  const enviados = [];
  const evento = () => ({ addListener() {} });
  const browser = {
    storage: {
      local: {
        async get(k) {
          const ks = k === undefined ? Object.keys(almacen) : [].concat(k);
          const r = {};
          for (const x of ks) if (x in almacen) r[x] = JSON.parse(JSON.stringify(almacen[x]));
          return r;
        },
        async set(o) { Object.assign(almacen, JSON.parse(JSON.stringify(o))); },
      },
      onChanged: evento(),
    },
    tabs: {
      async sendMessage(id, m) { enviados.push(m); return { success: true }; },
      async query() { return []; },
      async get() { return {}; },
      onUpdated: evento(),
      onActivated: evento(),
    },
    webNavigation: { onBeforeNavigate: evento(), onCommitted: evento() },
    runtime: { onMessage: evento(), getBrowserInfo() {} },
    alarms: { create() {}, onAlarm: evento() },
    commands: { onCommand: evento() },
    action: { setIcon() {} },
  };
  const ctx = vm.createContext({ browser, console: { log() {}, error() {} }, URL, Map, Object, JSON, Promise, Date, navigator: { userAgent: 'firefox' } });
  vm.runInContext(motorOriginal, ctx, { filename: 'background.js' });
  return {
    async css(host) {
      enviados.length = 0;
      await ctx.applyCSSToTab({ id: 1, url: `https://${host}/` });
      const m = enviados[enviados.length - 1];
      if (!m) return null;
      return m.action === 'applyStyles' ? m.css : '';
    },
  };
};

// Ajustes del mod -> almacen de la extension.
const almacenDe = (a) => {
  const c = P.ajustesCompletos(a);
  const s = {
    styles: catalogo,
    stylesMapping: { mapping: catalogo.mapping || {} },
    userStylesMapping: { mapping: c.mapeo },
    transparentZenSettings: Object.assign({}, c.global),
    skipThemingList: c.sinTema,
    skipForceThemingList: c.sinForzar,
    fallbackBackgroundList: c.fondo,
  };
  for (const [h, v] of Object.entries(c.sitios)) s[`transparentZenSettings.${h}`] = v;
  return s;
};

// --- Hosts a probar --------------------------------------------------------------
const hosts = new Set(['example.org', 'mi-web-sin-tema.dev', 'localhost', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'x.com', 'mobile.x.com']);
for (const k of Object.keys(catalogo.website)) {
  const n = k.replace('.css', '');
  if (n.startsWith('+')) { hosts.add(n.slice(1)); hosts.add('sub.' + n.slice(1)); }
  else if (n.startsWith('-')) { const b = n.slice(1); hosts.add(b); hosts.add(b.split('.').slice(0, -1).join('.') + '.fr'); }
  else { hosts.add(n); hosts.add('a.' + n); }
}
for (const destinos of Object.values(catalogo.mapping || {})) for (const d of destinos) hosts.add(d.replace(/^[-+]/, ''));
// Solo nombres de web posibles: el catalogo trae alguna clave con espacios
// ("bestbuy.com .css") que ningun navegador puede visitar.
const lista = [...hosts].filter((h) => /^[a-z0-9.-]+$/i.test(h));

const JUEGOS = {
  'por defecto (los tuyos)': {},
  'sin transparencia, sin hover, sin pie': { global: { disableTransparency: true, disableHover: true, disableFooter: true, disableDarkReader: true } },
  'forzar en todas, lista negra': { global: { forceStyling: true }, sinForzar: ['example.org'] },
  'forzar, lista blanca': { global: { forceStyling: true, whitelistMode: true }, sinForzar: ['mi-web-sin-tema.dev'] },
  'webs excluidas y fondo de respaldo': { sinTema: ['github.com', 'reddit.com'], fondo: ['youtube.com', 'wikipedia.org', 'mi-web-sin-tema.dev'] },
  'lista blanca de estilos': { global: { whitelistStyleMode: true }, sinTema: ['youtube.com', 'x.com'] },
  'funciones apagadas y chat': { sitios: { 'youtube.com': { 'yt-Transparency': false, movableLiveChat: false }, 'music.youtube.com': { 'Player sidebar': false } } },
  'alias propio': { mapeo: { 'github.com.css': ['mi-forja.dev'] } },
  'todo apagado': { global: { enableStyling: false } },
};

for (const [nombre, ajustes] of Object.entries(JUEGOS)) {
  await pruebaAsync(`paridad: ${nombre} (${lista.length} webs)`, async () => {
    const ext = extension(almacenDe(ajustes));
    const lista2 = nombre === 'alias propio' ? lista.concat(['mi-forja.dev']) : lista;
    let distintas = 0;
    let ejemplo = '';
    for (const h of lista2) {
      const a = await ext.css(h);
      const b = P.cssPara(h, catalogo, ajustes).css;
      // La extension no manda nada cuando decide no tocar la pestana y ya no
      // habia estilos: para el mod eso es css vacio.
      if ((a || '') !== b) { distintas++; if (!ejemplo) ejemplo = `${h}: extension ${String(a).length} B, mod ${b.length} B`; }
    }
    if (distintas) throw new Error(`${distintas} webs distintas; p. ej. ${ejemplo}`);
  });
}

// --- Lo demas ------------------------------------------------------------------
prueba('funciones de YouTube Music para el menu', () => {
  const f = P.funcionesDe('music.youtube.com', catalogo, {});
  const nombres = f.funciones.map((x) => x.nombre);
  if (!nombres.includes('Player sidebar') || !nombres.includes('Hover')) throw new Error(nombres.join(', '));
  if (!f.funciones.every((x) => x.puesta)) throw new Error('todo deberia venir puesto');
});
prueba('YouTube: chat movible primero y descripcion tras el $', () => {
  const f = P.funcionesDe('www.youtube.com', catalogo, {});
  if (f.funciones[0].id !== 'movableLiveChat') throw new Error('falta el chat movible');
  const b = f.funciones.find((x) => x.nombre === 'Immersive search');
  if (!b || !/blur/i.test(b.descripcion)) throw new Error('falta Immersive search con su descripcion');
});
prueba('anuladas por un interruptor global', () => {
  const f = P.funcionesDe('youtube.com', catalogo, { global: { disableTransparency: true } });
  const t = f.funciones.find((x) => x.id === 'yt-Transparency');
  if (!t.anulada) throw new Error('la transparencia deberia salir anulada');
});
prueba('catalogo valido e invalido', () => {
  if (!P.catalogoValido(catalogo)) throw new Error('el catalogo real no pasa');
  for (const malo of [null, {}, { website: [] }, { website: { 'a.css': { f: 1 } } }, { website: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`s${i}.css`, { f: 'x' }])), mapping: 3 }]) {
    if (P.catalogoValido(malo)) throw new Error('acepto ' + JSON.stringify(malo).slice(0, 60));
  }
});
prueba('ajustes basura no rompen', () => {
  const r = P.cssPara('youtube.com', catalogo, { global: { enableStyling: 'si' }, sinTema: 'x', sitios: 5, mapeo: { a: 'b' } });
  if (!r.css.length) throw new Error('deberia aplicar con valores por defecto');
});

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
