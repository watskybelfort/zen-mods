// Clic de raton real (BiDi) en un selector de la primera pestana y captura.
//   node mods/appearance/immersive-web/sonda-clic.mjs <selector> <nombre> [espera ms]
import fs from 'node:fs';
import {abrir} from '../../../youtube-music/phone-remote/sonda/lib.mjs';
const [sel, nombre, espera] = process.argv.slice(2);
const z = await abrir();
try {
  const r = JSON.parse(await z.ev(`JSON.stringify((()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})())`));
  if (!r) console.log('no hay', sel);
  else await z.s('input.performActions', { context: z.ctx, actions: [{ type: 'pointer', id: 'raton', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: r.x, y: r.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] });
  await new Promise((res) => setTimeout(res, Number(espera || 1500)));
  const c = await z.s('browsingContext.captureScreenshot', { context: z.ctx });
  fs.writeFileSync(`${process.env.TEMP}/zen-remoto/capturas/${nombre}.png`, Buffer.from(c.data, 'base64'));
  console.log('captura', nombre, await z.ev(`document.querySelector('.ytSearchboxComponentInputBoxHasFocus')?'con foco':'sin foco'`));
} catch (e) { console.log('ERR', e.message); }
await z.fin();
