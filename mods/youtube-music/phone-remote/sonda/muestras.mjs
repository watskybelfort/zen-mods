// Guarda respuestas reales de la API interna de YouTube Music (sesion anonima de la
// copia) para las pruebas del extractor. Sin los campos de seguimiento.
//   node mods/youtube-music/phone-remote/sonda/muestras.mjs
import fs from 'node:fs';
import path from 'node:path';
import {abrir} from './lib.mjs';
import {fileURLToPath} from 'node:url';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'muestras');
const pedidos={
  'buscar':['/search',{query:'bad bunny'}],
  'buscar-canciones':['/search',{query:'bad bunny',params:'EgWKAQIIAWoSEAUQCRAKEAMQEBAEEA4QFRAR'}],
  'sugerencias':['/music/get_search_suggestions',{input:'bad bun'}],
  'album':['/browse',{browseId:'MPREb_tZC7e1H5mfm'}],
  'artista':['/browse',{browseId:'UCiY3z8HAGD6BlSNKVn2kSvQ'}],
  'playlist':['/browse',{browseId:'VLRDCLAK5uy_nDL8KeBrUagwyISwNmyEiSfYgz1gVCesg'}],
  'inicio':['/browse',{browseId:'FEmusic_home'}],
  'cola':['/music/get_queue',{videoIds:['dQw4w9WgXcQ']}],
};
const z=await abrir();
for(const [n,[u,b]] of Object.entries(pedidos)){
  try{
    const r=await z.ev(`(async()=>{const r=await document.querySelector('ytmusic-app').networkManager.fetch(${JSON.stringify(u)},${JSON.stringify(b)});return JSON.stringify(r,(k,v)=>/^(trackingParams|clickTrackingParams|loggingContext|serviceTrackingParams|responseContext|frameworkUpdates|logging_directives|loggingDirectives)$/.test(k)?undefined:v)})()`);
    fs.writeFileSync(path.join(dir,n+'.json'),r);console.log(n,r.length);
  }catch(e){console.log(n,'ERR',e.message)}
}
await z.fin();
