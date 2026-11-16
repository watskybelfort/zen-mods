// Pasa el raton real por un video de la portada de YouTube y dice que queda
// encima en ese punto y si la previsualizacion avanza.
import {abrir} from '../../../youtube-music/phone-remote/sonda/lib.mjs';
const z=await abrir();const d=ms=>new Promise(r=>setTimeout(r,ms));
try{
const it=JSON.parse(await z.ev(`JSON.stringify((()=>{const it=[...document.querySelectorAll('ytd-rich-item-renderer')].filter(e=>e.getBoundingClientRect().width>100&&!e.querySelector('yt-collections-stack')&&!/Sponsored|Patrocinado/.test(e.textContent)&&e.querySelector('a[href*="/watch"]'))[0];const r=it.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+80)}})())`));
await z.s('input.performActions',{context:z.ctx,actions:[{type:'pointer',id:'raton',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',x:it.x,y:it.y},{type:'pause',duration:200},{type:'pointerMove',x:it.x+2,y:it.y+1}]}]});
await d(3500);
const leer=()=>z.ev(`JSON.stringify((()=>{const v=document.querySelector('#video-preview video');const e=document.elementFromPoint(${it.x},${it.y});let a=e,ruta=[];while(a&&ruta.length<6){ruta.push(a.tagName.toLowerCase()+(a.id?'#'+a.id:''));a=a.parentElement;}return {encima:ruta.join(' < '),dentroPreview:!!(e&&e.closest('#video-preview')),t:v&&+v.currentTime.toFixed(2),pausado:v&&v.paused}})())`);
const a=JSON.parse(await leer());console.log(await z.ev(`JSON.stringify((()=>{const p=document.querySelector('.ytdVideoPreviewActive');const sel=document.querySelector('ytd-rich-item-renderer:has(.ytSpecTouchFeedbackShapeHovered)');return {activa:!!p,escalaPreview:p&&getComputedStyle(p).scale,escalaTarjeta:sel&&getComputedStyle(sel).scale}})())`));await d(1500);const b=JSON.parse(await leer());
console.log(JSON.stringify(a));console.log('avanza:',b.t>a.t,a.t,'->',b.t);
}catch(e){console.log('ERR',e.message)}
await z.fin();
