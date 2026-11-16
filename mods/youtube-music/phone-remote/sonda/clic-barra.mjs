// Pulsa con un raton de verdad (BiDi input) un boton de la barra del reproductor
// y dice si se abrio o se cerro el reproductor grande.
//   node mods/youtube-music/phone-remote/sonda/clic-barra.mjs [selector]
import {abrir} from './lib.mjs';
const sel=process.argv[2]||'.zr-boton';
const z=await abrir();const d=ms=>new Promise(r=>setTimeout(r,ms));
const abierto=()=>z.ev(`(()=>{const l=document.querySelector('ytmusic-app-layout');return !!(l&&(l.hasAttribute('player-page-open')||l.playerPageOpen))})()`);
try{
  const r=JSON.parse(await z.ev(`JSON.stringify((()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return null;const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})())`));
  if(!r){console.log('no hay',sel);}else{
    const antes=await abierto();
    await z.s('input.performActions',{context:z.ctx,actions:[{type:'pointer',id:'raton',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:r.x,y:r.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
    await d(1200);
    const tras=await abierto();
    console.log(sel,'reproductor grande:',antes,'->',tras,tras!==antes?'SE MOVIO (fallo)':'quieto (bien)');
    await z.ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);
    // Deja el reproductor como estaba y cierra paneles.
    if(tras!==antes) await z.ev(`document.querySelector('ytmusic-player-bar').click()`);
  }
}catch(e){console.log('ERR',e.message)}
await z.fin();
