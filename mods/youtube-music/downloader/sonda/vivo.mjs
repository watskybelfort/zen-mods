// Sonda de Zen Descargas contra la copia (sonda/copia.sh arrancar, BiDi en 9346).
//   node mods/youtube-music/downloader/sonda/vivo.mjs ir <url>
//   node mods/youtube-music/downloader/sonda/vivo.mjs ver            -> datos del boton y captura
//   node mods/youtube-music/downloader/sonda/vivo.mjs clic <x> <y>   -> clic de raton real y captura
//   node mods/youtube-music/downloader/sonda/vivo.mjs eval <codigo>
import fs from 'node:fs';
import path from 'node:path';
import { abrir } from '../../phone-remote/sonda/lib.mjs';

const [orden, ...resto] = process.argv.slice(2);
const dir = path.join(process.env.TEMP, 'zen-desc', 'capturas');
fs.mkdirSync(dir, { recursive: true });
const { s, ctx, ev, fin } = await abrir(9346);
const captura = async (nombre) => {
  const c = await s('browsingContext.captureScreenshot', { context: ctx });
  const f = path.join(dir, nombre + '.png');
  fs.writeFileSync(f, Buffer.from(c.data, 'base64'));
  console.log('captura', f);
};
try {
  if (orden === 'ir') {
    await s('browsingContext.navigate', { context: ctx, url: resto[0], wait: 'complete' });
    console.log('ok');
  } else if (orden === 'ver') {
    console.log(await ev(`JSON.stringify((() => { const b = document.querySelector('zen-descargas-boton'); const p = document.querySelector('zen-descargas-panel');
      return { url: location.href, boton: b ? b.getBoundingClientRect().toJSON() : null, padre: b && b.parentElement ? b.parentElement.id || b.parentElement.tagName : null, panel: !!p, ancho: innerWidth, alto: innerHeight }; })())`));
    await captura(resto[0] || 'ver');
  } else if (orden === 'clic') {
    const [x, y] = resto.map(Number);
    await s('input.performActions', { context: ctx, actions: [{ type: 'pointer', id: 'raton', parameters: { pointerType: 'mouse' }, actions: [
      { type: 'pointerMove', x: Math.round(x), y: Math.round(y) }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] });
    await new Promise((r) => setTimeout(r, Number(resto[2] || 800)));
    await captura(resto[3] || 'clic');
  } else if (orden === 'eval') {
    console.log(await ev(resto.join(' ')));
  }
} finally { await fin(); }
