// ¿El salto de posicion rompe el reproductor? Prueba por video, sin mezclar nada.
//   node mods/youtube-music/crossfade/sonda/salto.mjs <id> <id> ...
import {abrir} from './lib.mjs';
const z=await abrir(); const d=ms=>new Promise(r=>setTimeout(r,ms));
const leer=async()=>JSON.parse(await z.ev(`(()=>{const v=document.querySelector('video'),m=document.querySelector('#movie_player');return JSON.stringify({mod:!!window.__zenMezcla,ct:v&&+v.currentTime.toFixed(1),dur:v&&v.duration,st:m&&m.getPlayerState&&m.getPlayerState(),ad:m&&m.className.includes('ad-showing'),verr:v&&v.error&&(v.error.code+' '+v.error.message),err:(document.querySelector('.ytp-error')||{}).innerText||null})})()`));
try{ for(const id of process.argv.slice(2)){
 await z.s('browsingContext.navigate',{context:z.ctx,url:'https://music.youtube.com/watch?v='+id,wait:'interactive'});
 let s; for(let i=0;i<30;i++){await d(1500);s=await leer();if(s.err||(s.dur>30&&!s.ad&&s.ct>1))break;}
 const a=s; await z.ev(`document.querySelector('#movie_player').seekTo(document.querySelector('video').duration-30,true)`);
 for(let i=0;i<10;i++){await d(1000);s=await leer();if(s.err)break;}
 console.log(id,'antes',JSON.stringify(a),'\n   tras salto',JSON.stringify(s));
}}catch(e){console.log('ERR',e.message)}
await z.fin();
