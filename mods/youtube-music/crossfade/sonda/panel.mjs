// Captura del boton y del panel de Zen Mezcla, comparados con la barra real.
//   node mods/youtube-music/crossfade/sonda/panel.mjs <salida.png>
import fs from 'node:fs';
import { abrir } from './lib.mjs';

const salida = process.argv[2];
const z = await abrir();
const d = (ms) => new Promise((r) => { setTimeout(r, ms); });
try {
  await z.s('browsingContext.navigate', { context: z.ctx, url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', wait: 'interactive' });
  for (let i = 0; i < 40; i++) {
    await d(1500);
    const listo = await z.ev(`!!document.querySelector('.zm-boton') && !document.querySelector('#movie_player').classList.contains('ad-showing') && document.querySelector('video').currentTime > 1`);
    if (listo) break;
  }
  await z.ev(`document.querySelector('.zm-boton').click()`);
  await d(1500);
  console.log(await z.ev(`(() => {
    const p = document.querySelector('.zm-panel'), b = document.querySelector('.zm-boton');
    const r = p.getBoundingClientRect(), s = b.getBoundingClientRect();
    return JSON.stringify({
      oculto: p.hidden, panel: [r.left, r.top, r.width, r.height].map(Math.round), boton: [s.left, s.top, s.width, s.height].map(Math.round),
      ventana: [innerWidth, innerHeight], letra: getComputedStyle(p).fontFamily, texto: p.innerText,
    });
  })()`));
  const r = await z.s('browsingContext.captureScreenshot', { context: z.ctx });
  fs.writeFileSync(salida, Buffer.from(r.data, 'base64'));
} catch (e) { console.log('ERR', e.message); }
await z.fin();
