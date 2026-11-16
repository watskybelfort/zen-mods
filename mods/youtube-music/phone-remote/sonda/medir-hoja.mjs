// Mide la hoja de acciones y las miniaturas en la pagina del movil (pestana de fondo).
import {abrir} from './lib.mjs';
const z=await abrir();const d=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await z.ev(`document.querySelector('.zr-panel').hidden && document.querySelector('.zr-boton').click()`);await d(1500);
  const c=(await z.ev(`document.querySelector('.zr-codigo').textContent`)).replace(/\D/g,'');
  const {context:tab}=await z.s('browsingContext.create',{type:'tab',background:true});
  await z.s('browsingContext.setViewport',{context:tab,viewport:{width:390,height:844},devicePixelRatio:2});
  await z.s('browsingContext.navigate',{context:tab,url:'http://127.0.0.1:8643/#c='+c,wait:'complete'});
  const ev=async(code)=>(await z.s('script.evaluate',{expression:code,target:{context:tab},awaitPromise:true})).result?.value;
  await d(2500);
  await ev(`document.querySelector('[data-vista=buscar]').click();document.getElementById('q').value='bad bunny';document.getElementById('form-buscar').requestSubmit()`);
  await d(4000);
  console.log(await ev(`(async()=>{const imgs=[...document.querySelectorAll('#resultados img')];const antes=imgs.filter(i=>i.naturalWidth>0).length;imgs.forEach(i=>i.loading='eager');await new Promise(r=>setTimeout(r,3000));const tras=imgs.filter(i=>i.naturalWidth>0).length;
   document.querySelector('#resultados .fila .icono-boton').click();await new Promise(r=>setTimeout(r,800));const h=document.getElementById('hoja');
   return JSON.stringify({imgs:imgs.length,cargadasLazy:antes,cargadasEager:tras,hoja:{oculta:h.hidden,rect:h.getBoundingClientRect().top+'/'+h.getBoundingClientRect().height,op:getComputedStyle(h).opacity,anims:h.getAnimations().map(a=>a.playState+':'+a.currentTime)},acciones:[...document.querySelectorAll('#hoja-acciones .accion')].map(a=>a.textContent)})})()`));
  await z.s('browsingContext.close',{context:tab});
  await z.ev(`document.querySelector('.zr-boton').click()`);
}catch(e){console.log('ERR',e.message)}
await z.fin();
