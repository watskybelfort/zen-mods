import {abrir} from './lib.mjs'; import fs from 'fs';
const dir=new URL('./',import.meta.url);const rd=f=>fs.readFileSync(new URL(f,dir),'utf8');
const z=await abrir(); const d=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await z.s('script.addPreloadScript',{functionDeclaration:rd('gancho.js')});
 await z.s('browsingContext.navigate',{context:z.ctx,url:'https://music.youtube.com/watch?v='+(process.argv[2]||'dQw4w9WgXcQ'),wait:'interactive'});
 for(let i=0;i<60;i++){await d(2000);const r=await z.ev(`(()=>{const v=document.querySelector('video'),m=document.querySelector('#movie_player');return JSON.stringify({ok:!!v&&v.duration>30&&v.currentTime>3&&!m.className.includes('ad-showing'),d:v&&v.duration,c:v&&v.currentTime})})()`);if(JSON.parse(r).ok){console.log('listo',r);break}}
 console.log(await z.ev(rd('paso3.js')));
 for(let i=0;i<60;i++){await d(3000);const r=await z.ev(rd('ver.js'));if(r.includes('"hecho":true')){console.log(r);break}}
 
}catch(e){console.log('ERR',e.message)}
await z.fin(); console.log('FIN');
