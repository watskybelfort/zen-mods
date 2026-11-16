// Inicio y la hoja de "Sonando" en la pagina del movil, en la copia, a 393x659
// (Safari del iPhone con sus barras): portada de Inicio, abrir la hoja desde la
// mini barra, que el volumen quepa, y bajarla deslizando con el dedo (BiDi touch).
//   IP_MOVIL=192.168.1.50 node mods/youtube-music/phone-remote/sonda/probar-hoja.mjs
import fs from 'node:fs';
import { abrir } from './lib.mjs';
const z = await abrir();
const d = (ms) => new Promise((r) => setTimeout(r, ms));
let bien = 0, mal = 0;
const ok = (c, m, x = '') => { if (c) { bien++; console.log('  ok   ', m); } else { mal++; console.log('  FALLA', m, x); } };
try {
  await z.ev(`document.querySelector('.zr-panel').hidden && document.querySelector('.zr-boton').click()`);
  await d(1500);
  const c = (await z.ev(`document.querySelector('.zr-codigo').textContent`)).replace(/\D/g, '');
  const { context: tab } = await z.s('browsingContext.create', { type: 'tab', background: true });
  await z.s('script.addPreloadScript', { functionDeclaration: `()=>{Object.defineProperty(document,'visibilityState',{get:()=>'visible'});}`, contexts: [tab] });
  await z.s('browsingContext.setViewport', { context: tab, viewport: { width: 393, height: 659 }, devicePixelRatio: 2 });
  const ev = async (code) => (await z.s('script.evaluate', { expression: code, target: { context: tab }, awaitPromise: true })).result?.value;
  await z.s('browsingContext.navigate', { context: tab, url: 'http://' + (process.env.IP_MOVIL || '127.0.0.1') + ':8643/#c=' + c, wait: 'complete' });
  for (let i = 0; i < 30; i++) { await d(500); if (await ev(`!document.getElementById('app').hidden && !document.getElementById('mini').hidden && document.querySelectorAll('#inicio .grupo').length>0`)) break; }
  // El panel se cierra DESPUES de emparejar: cerrarlo caduca el codigo.
  await z.ev(`document.querySelector('.zr-panel').hidden || document.querySelector('.zr-boton').click()`);
  const ini = JSON.parse(await ev(`JSON.stringify({titulo:document.getElementById('titulo-vista').textContent,grupos:[...document.querySelectorAll('#inicio .grupo h2')].map(h=>h.textContent),mini:!document.getElementById('mini').hidden,pestana:document.querySelector('.pestanas [aria-current]').dataset.vista})`));
  console.log('       inicio:', JSON.stringify(ini));
  ok(ini.titulo === 'Inicio' && ini.pestana === 'inicio', 'arranca en Inicio');
  ok(ini.grupos.length >= 2, 'Inicio trae las secciones de YouTube Music', ini.grupos.length);
  ok(ini.mini, 'la mini barra esta abajo');

  await ev(`document.getElementById('mini-abrir').click()`);
  await d(700);
  const ab = JSON.parse(await ev(`(()=>{const h=document.getElementById('vista-ahora');const v=document.querySelector('.volumen').getBoundingClientRect();return JSON.stringify({abierta:h.classList.contains('abierta'),mini:document.getElementById('mini').hidden,volAbajo:Math.round(v.bottom),alto:innerHeight,scroll:h.scrollHeight-h.clientHeight})})()`));
  ok(ab.abierta && ab.mini, 'tocar la mini barra sube la hoja y esconde la mini barra');
  console.log('       hijos:', await ev(`JSON.stringify([...document.querySelectorAll('#vista-ahora > *, #reproductor > *')].map(n=>{const r=n.getBoundingClientRect();return (n.id||n.className).toString().slice(0,18)+':'+Math.round(r.top)+'-'+Math.round(r.bottom)}))`), 'pad', await ev(`getComputedStyle(document.getElementById('vista-ahora')).padding`));
  ok(ab.volAbajo <= ab.alto && ab.scroll <= 0, 'en la hoja cabe todo, volumen incluido', JSON.stringify(ab));
  const r = await z.s('browsingContext.captureScreenshot', { context: tab });
  fs.writeFileSync(process.env.TEMP + '/zen-remoto/capturas/hoja.png', Buffer.from(r.data, 'base64'));

  // Deslizar con el dedo: de arriba hacia abajo, 260 px.
  await z.s('input.performActions', { context: tab, actions: [{ type: 'pointer', id: 'dedo', parameters: { pointerType: 'touch' }, actions: [
    { type: 'pointerMove', x: 196, y: 160 }, { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', x: 196, y: 220, duration: 120 }, { type: 'pointerMove', x: 196, y: 330, duration: 120 }, { type: 'pointerMove', x: 196, y: 420, duration: 120 },
    { type: 'pointerUp', button: 0 }] }] });
  await d(700);
  const ce = JSON.parse(await ev(`JSON.stringify({abierta:document.getElementById('vista-ahora').classList.contains('abierta'),mini:!document.getElementById('mini').hidden,titulo:document.getElementById('titulo-vista').textContent})`));
  ok(!ce.abierta && ce.mini && ce.titulo === 'Inicio', 'deslizar hacia abajo baja la hoja y vuelve Inicio con la mini barra', JSON.stringify(ce));

  // Un deslizamiento corto no la baja.
  await ev(`document.getElementById('mini-abrir').click()`);
  await d(600);
  await z.s('input.performActions', { context: tab, actions: [{ type: 'pointer', id: 'dedo2', parameters: { pointerType: 'touch' }, actions: [
    { type: 'pointerMove', x: 196, y: 160 }, { type: 'pointerDown', button: 0 }, { type: 'pointerMove', x: 196, y: 200, duration: 300 }, { type: 'pointerUp', button: 0 }] }] });
  await d(600);
  ok(await ev(`document.getElementById('vista-ahora').classList.contains('abierta')`), 'un gesto corto no la baja');
  await ev(`document.getElementById('cerrar-sonando').click()`);
  await d(500);
  ok(await ev(`!document.getElementById('vista-ahora').classList.contains('abierta')`), 'la flecha tambien la baja');
  await z.s('browsingContext.close', { context: tab });
} catch (e) { mal++; console.log('ERR', e.message); }
await z.fin();
console.log(`\n${bien} bien, ${mal} mal`);
