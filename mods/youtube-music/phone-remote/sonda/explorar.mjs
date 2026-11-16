// Exploracion: evalua un archivo JS en la primera pestana de la copia.
//   node mods/youtube-music/phone-remote/sonda/explorar.mjs ir <url>
//   node mods/youtube-music/phone-remote/sonda/explorar.mjs js <archivo>
import fs from 'node:fs';
import {abrir} from './lib.mjs';
const z=await abrir();
try{
  if(process.argv[2]==='ir') await z.s('browsingContext.navigate',{context:z.ctx,url:process.argv[3],wait:'interactive'});
  else { const r=await z.ev(fs.readFileSync(process.argv[3],'utf8')); console.log(typeof r==='string'?r:JSON.stringify(r,null,1)); }
}catch(e){console.log('ERR',e.message)}
await z.fin();
