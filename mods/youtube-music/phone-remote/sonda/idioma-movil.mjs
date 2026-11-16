// Abre la pagina del movil (390x844) y saca sus textos y una captura.
// Uso: node idioma-movil.mjs <nombre-captura>
import fs from 'node:fs';
import {abrir} from './lib.mjs';
const z=await abrir();
try{
  const {context:tab}=await z.s('browsingContext.create',{type:'tab',background:true});
  await z.s('browsingContext.setViewport',{context:tab,viewport:{width:390,height:844},devicePixelRatio:2});
  await z.s('browsingContext.navigate',{context:tab,url:'http://127.0.0.1:8643/',wait:'complete'});
  await new Promise(r=>setTimeout(r,1500));
  const r=await z.s('script.evaluate',{expression:`navigator.language+' | '+document.documentElement.lang+' | '+[...document.querySelectorAll('#vista-emparejar h1, #vista-emparejar p, #vista-emparejar button, #vista-emparejar label')].map(n=>n.textContent.trim()).join(' | ')`,target:{context:tab},awaitPromise:true});
  console.log(r.result.value);
  const c=await z.s('browsingContext.captureScreenshot',{context:tab});
  fs.writeFileSync(process.env.TEMP+'/zen-remoto/capturas/'+(process.argv[2]||'movil')+'.png',Buffer.from(c.data,'base64'));
  await z.s('browsingContext.close',{context:tab});
}catch(e){console.log('ERR',e.message)}
await z.fin();
