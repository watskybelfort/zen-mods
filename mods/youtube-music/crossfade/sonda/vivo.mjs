// Prueba viva de Zen Mezcla en la copia. Acelera hasta el tramo final de cada cancion (saltar no vale sin sesion: ver salto.mjs) y deja
// que la mezcla ocurra sola. Todo en una sola sesion BiDi.
//   node mods/youtube-music/crossfade/sonda/vivo.mjs [canciones] [videoId]
import {abrir} from './lib.mjs';
const veces=Number(process.argv[2]||4), id=process.argv[3]||'dQw4w9WgXcQ', natural=process.argv[4]==='natural';
const z=await abrir(); const d=ms=>new Promise(r=>setTimeout(r,ms));
const ev=c=>z.ev(c);
const leer=async()=>JSON.parse(await ev(`(()=>{const v=document.querySelector('video'),m=document.querySelector('#movie_player'),e=window.__zenMezcla&&__zenMezcla.estado();return JSON.stringify({e,ct:v&&v.currentTime,dur:v&&v.duration,p:v&&v.paused,ad:m&&m.className.includes('ad-showing'),id:m&&m.getVideoData&&m.getVideoData().video_id,t:document.title,err:!!document.querySelector('.ytp-error')})})()`));
try{
 await z.s('browsingContext.navigate',{context:z.ctx,url:'https://music.youtube.com/watch?v='+id,wait:'interactive'});
 for(let i=0;i<40;i++){await d(1500);const s=await leer();if(s.e&&s.dur>30&&!s.ad&&s.ct>1)break;}
 console.log('inicio',JSON.stringify(await leer()));
 for(let n=0;n<veces;n++){
  for(let i=0;i<60;i++){const s=await leer();if(s.err){console.log('ERROR del reproductor',s.t);break}if(s.dur>60&&!s.ad&&s.e.enlazado&&s.ct>1)break;await d(1000)}
  const a=await leer(); if(natural){console.log('natural',a.t,a.dur);for(let i=0;i<500;i++){await d(1000);const s=await leer();if(s.err){console.log('ERROR',s.ct);break}if(!s.ad&&s.dur>60&&s.ct>=s.dur-32)break;}}else await ev(`document.querySelector('video').playbackRate=8`);
  if(!natural)for(let i=0;i<300;i++){await d(300);const s=await leer();if(s.err||s.ct>=s.dur-32)break;}
  await ev(`document.querySelector('video').playbackRate=1`);
  console.log(`--- ${n+1}: ${(await leer()).ct} ${a.t} (${a.id}) ${a.dur}s ${JSON.stringify(a.e&&a.e.formato)} ${a.e&&a.e.version} ${a.e&&a.e.lkfs}`);
  let vio=false;
  for(let i=0;i<300;i++){await d(200);const s=await leer();if(s.e.fase!=='reposo')vio=true;if(vio&&s.e.fase==='reposo')break;if(!vio&&i>200)break;}
  await d(1500);
 }
 const r=JSON.parse(await ev(`JSON.stringify(__zenMezcla.registro())`));
 for(const x of r)if(x.k!=='pista')console.log(JSON.stringify(x));
 console.log('fin',JSON.stringify(await leer()));
}catch(e){console.log('ERR',e.message)}
await z.fin();console.log('FIN');
