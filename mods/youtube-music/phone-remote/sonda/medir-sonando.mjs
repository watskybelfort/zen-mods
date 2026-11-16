// Mide "Sonando" a varios tamanos de iPhone: si el volumen queda a la vista o
// tapado por la barra de pestanas.
//   node mods/youtube-music/phone-remote/sonda/medir-sonando.mjs
import {abrir} from './lib.mjs';
const z=await abrir();const d=ms=>new Promise(r=>setTimeout(r,ms));
const TAMANOS=[[393,659,'Safari iPhone 15 con barras'],[375,553,'Safari iPhone SE'],[393,852,'pantalla de inicio iPhone 15'],[430,739,'Safari Pro Max']];
try{
  await z.ev(`document.querySelector('.zr-panel').hidden && document.querySelector('.zr-boton').click()`);await d(1500);
  const c=(await z.ev(`document.querySelector('.zr-codigo').textContent`)).replace(/\D/g,'');
  const {context:tab}=await z.s('browsingContext.create',{type:'tab',background:true});
  const ev=async(code)=>(await z.s('script.evaluate',{expression:code,target:{context:tab},awaitPromise:true})).result?.value;
  await z.s('browsingContext.navigate',{context:tab,url:'http://127.0.0.1:8643/#c='+c,wait:'complete'});await d(3000);
  for(const [w,h,n] of TAMANOS){
    await z.s('browsingContext.setViewport',{context:tab,viewport:{width:w,height:h},devicePixelRatio:2});await d(600);
    console.log(n, await ev(`(()=>{const v=document.querySelector('.volumen').getBoundingClientRect(),p=document.querySelector('.pestanas').getBoundingClientRect();return JSON.stringify({volumenAbajo:Math.round(v.bottom),pestanasArriba:Math.round(p.top),visible:v.bottom<=p.top,scroll:document.documentElement.scrollHeight-innerHeight})})()`));
  }
  const r=await z.s('browsingContext.captureScreenshot',{context:tab});
  (await import('node:fs')).writeFileSync(process.env.TEMP+'/zen-remoto/capturas/sonando-medida.png',Buffer.from(r.data,'base64'));
  await z.s('browsingContext.close',{context:tab});
  await z.ev(`document.querySelector('.zr-boton').click()`);
}catch(e){console.log('ERR',e.message)}
await z.fin();
