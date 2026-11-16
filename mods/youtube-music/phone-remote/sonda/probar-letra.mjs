// Vista "Letra" del movil en la copia: linea actual, que avanza, y saltar al tocar.
//   node mods/youtube-music/phone-remote/sonda/probar-letra.mjs
import fs from 'node:fs';
import {abrir} from './lib.mjs';
const z=await abrir();const d=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await z.ev(`document.querySelector('.zr-panel').hidden && document.querySelector('.zr-boton').click()`);await d(1500);
  const c=(await z.ev(`document.querySelector('.zr-codigo').textContent`)).replace(/\D/g,'');
  await z.ev(`document.querySelector('#movie_player').playVideo()`);
  const {context:tab}=await z.s('browsingContext.create',{type:'tab',background:true});
  await z.s('browsingContext.setViewport',{context:tab,viewport:{width:393,height:659},devicePixelRatio:2});
  // Una pestana de fondo dice 'hidden' y la pagina no anima: se finge visible.
  await z.s('script.addPreloadScript',{functionDeclaration:`()=>{Object.defineProperty(document,'visibilityState',{get:()=>'visible'});}`,contexts:[tab]});
  const ev=async(code)=>(await z.s('script.evaluate',{expression:code,target:{context:tab},awaitPromise:true})).result?.value;
  await z.s('browsingContext.navigate',{context:tab,url:'http://'+(process.env.IP_MOVIL||'127.0.0.1')+':8643/#c='+c,wait:'complete'});
  for(let i=0;i<20;i++){await d(500);if(await ev(`!document.getElementById('app').hidden && document.getElementById('ahora-titulo').textContent.trim().length>1`))break;}
  await ev(`document.getElementById('b-letra').click()`);await d(2500);
  const leer=()=>ev(`(()=>{const a=document.querySelector('.letra-linea.actual');return JSON.stringify({n:document.querySelectorAll('.letra-linea').length,actual:a&&a.textContent,i:a&&a.dataset.i,titulo:document.getElementById('titulo-vista').textContent})})()`);
  const a1=JSON.parse(await leer());console.log('1',JSON.stringify(a1));
  await d(6000);
  const a2=JSON.parse(await leer());console.log('2',JSON.stringify(a2));
  console.log(Number(a2.i)>=Number(a1.i)?'ok   la linea avanza o se mantiene':'FALLA retrocede');
  const r=await z.s('browsingContext.captureScreenshot',{context:tab});
  fs.writeFileSync(process.env.TEMP+'/zen-remoto/capturas/letra.png',Buffer.from(r.data,'base64'));
  // Tocar la linea 5 y ver que el PC salta alli.
  const objetivo=await ev(`(()=>{const b=document.querySelectorAll('.letra-linea')[5];b.click();return b.textContent})()`);
  await d(2500);
  const pos=await z.ev(`document.querySelector('#movie_player').getCurrentTime()`);
  const a3=JSON.parse(await leer());
  console.log('toque', JSON.stringify(objetivo), '-> PC en', pos.toFixed(1), 's; actual:', a3.actual, a3.i==='5'||a3.i==='6'?'ok':'REVISAR');
  await z.s('browsingContext.close',{context:tab});
  await z.ev(`document.querySelector('.zr-boton').click()`);
}catch(e){console.log('ERR',e.message)}
await z.fin();
