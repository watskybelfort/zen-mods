// Capturas de la pagina del movil en la copia, a tamano de iPhone (390x844), con la
// pestana de YouTube Music como primera pestana. Las deja en %TEMP%\zen-remoto\capturas.
//   node mods/youtube-music/phone-remote/sonda/capturas.mjs [puerto]
import fs from 'node:fs';
import path from 'node:path';
import {abrir} from './lib.mjs';
const PUERTO = Number(process.argv[2] || 8643);
const dir = path.join(process.env.TEMP, 'zen-remoto', 'capturas');
fs.mkdirSync(dir, { recursive: true });
const d = (ms) => new Promise((r) => setTimeout(r, ms));
const z = await abrir();
try {
  await z.ev(`document.querySelector('.zr-panel') && document.querySelector('.zr-panel').hidden && document.querySelector('.zr-boton').click()`);
  await d(1500);
  const codigo = (await z.ev(`document.querySelector('.zr-codigo').textContent`)).replace(/\D/g, '');
  const pc = await z.s('browsingContext.captureScreenshot', { context: z.ctx });
  fs.writeFileSync(path.join(dir, '0-panel-pc.png'), Buffer.from(pc.data, 'base64'));
  const { context: tab } = await z.s('browsingContext.create', { type: 'tab', background: true });
  await z.s('browsingContext.setViewport', { context: tab, viewport: { width: 390, height: 844 }, devicePixelRatio: 2 });
  await z.s('browsingContext.navigate', { context: tab, url: `http://127.0.0.1:${PUERTO}/#c=${codigo}`, wait: 'complete' });
  const ev = async (code) => { const r = await z.s('script.evaluate', { expression: code, target: { context: tab }, awaitPromise: true, resultOwnership: 'none' }); return r.result?.value; };
  const foto = async (n) => { const r = await z.s('browsingContext.captureScreenshot', { context: tab }); fs.writeFileSync(path.join(dir, n + '.png'), Buffer.from(r.data, 'base64')); console.log('captura', n); };
  await d(3000);
  await foto('1-sonando');
  await ev(`document.querySelector('[data-vista=buscar]').click()`);
  await ev(`(()=>{const q=document.getElementById('q');q.value='bad bunny';document.getElementById('form-buscar').requestSubmit();})()`);
  await d(3500);
  await foto('2-buscar');
  await ev(`(()=>{const b=[...document.querySelectorAll('#resultados .fila-cuerpo')].find(x=>/Álbum/.test(x.textContent));b&&b.click()})()`);
  await d(3500);
  await foto('3-album');
  await ev(`document.querySelector('#pagina .fila .icono-boton').click()`);
  await d(600);
  await foto('4-menu');
  await ev(`document.getElementById('hoja-fondo').click()`);
  await ev(`document.querySelector('[data-vista=cola]').click()`);
  await d(2500);
  await foto('5-cola');
  await ev(`document.querySelector('[data-vista=biblioteca]').click()`);
  await d(3000);
  await foto('6-biblioteca');
  console.log('errores consola?', await ev(`document.title`));
  await z.s('browsingContext.close', { context: tab });
  await z.ev(`document.querySelector('.zr-boton').click()`);
} catch (e) { console.log('ERR', e.message); }
await z.fin();
