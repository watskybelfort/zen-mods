// Captura de la primera pestana de la copia tras ejecutar un JS.
//   node mods/appearance/immersive-web/sonda-captura.mjs <nombre> '<js>' [espera ms]
import fs from 'node:fs';
import {abrir} from '../../../youtube-music/phone-remote/sonda/lib.mjs';
const [nombre, js, espera] = process.argv.slice(2);
const z = await abrir();
try {
  if (js) console.log(await z.ev(js));
  await new Promise((r) => setTimeout(r, Number(espera || 1500)));
  const r = await z.s('browsingContext.captureScreenshot', { context: z.ctx });
  const dir = process.env.TEMP + '/zen-remoto/capturas';
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/${nombre}.png`, Buffer.from(r.data, 'base64'));
  console.log('captura', nombre);
} catch (e) { console.log('ERR', e.message); }
await z.fin();
