// Abre la pagina del movil en otra pestana de la copia a 390x844 y mide anchos.
import {abrir} from './lib.mjs';
const z=await abrir();
try{
  const {context:tab}=await z.s('browsingContext.create',{type:'tab',background:true});
  await z.s('browsingContext.setViewport',{context:tab,viewport:{width:390,height:844},devicePixelRatio:2});
  await z.s('browsingContext.navigate',{context:tab,url:'http://127.0.0.1:8643/',wait:'complete'});
  await new Promise(r=>setTimeout(r,1500));
  const r=await z.s('script.evaluate',{expression:`JSON.stringify({iw:innerWidth,dw:document.documentElement.scrollWidth,anchos:[...document.querySelectorAll('#vista-emparejar *')].map(e=>e.tagName+'.'+e.className+'#'+e.id+'='+Math.round(e.getBoundingClientRect().width)).slice(0,12)})`,target:{context:tab},awaitPromise:true});
  console.log(r.result.value);
  await z.s('browsingContext.close',{context:tab});
}catch(e){console.log('ERR',e.message)}
await z.fin();
