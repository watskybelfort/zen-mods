// Mete puro.js, qr.js y motor.js en la pestana de la copia con un puente falso que
// guarda lo que el motor envia, y le pasa ordenes. Sirve para probar el motor sin
// las piezas nativas.
//   node mods/youtube-music/phone-remote/sonda/motor-suelto.mjs '<orden json>' ['<orden json>' ...]
import fs from 'node:fs';
import {abrir} from './lib.mjs';
const raiz=new URL('../nativo/',import.meta.url);
const leer=n=>fs.readFileSync(new URL(n,raiz),'utf8');
const z=await abrir();
const d=ms=>new Promise(r=>setTimeout(r,ms));
try{
  const ya=await z.ev('!!window.__zenRemoto');
  if(!ya){
    await z.ev(`window.__salida=[];window.__zenRemotoPuente={enviar:(s)=>{window.__salida.push(s);if(window.__salida.length>200)window.__salida.shift()}};`);
    await z.ev(leer('puro.js')+'\n;'+leer('qr.js')+'\n;'+leer('motor.js')+'\n;"ok"');
    await d(1200);
  }
  let id=1;
  for(const a of process.argv.slice(2)){
    const o=JSON.parse(a);const mi='p'+Date.now()+(id++);
    await z.ev(`globalThis.__zenRemotoRecibir(${JSON.stringify(JSON.stringify({tipo:'orden',id:mi,orden:o.orden,args:o.args}))})`);
    let r=null;
    for(let i=0;i<60&&!r;i++){await d(250);r=await z.ev(`(window.__salida.map(JSON.parse).find(m=>m.tipo==='respuesta'&&m.id===${JSON.stringify(mi)})||null)&&JSON.stringify(window.__salida.map(JSON.parse).find(m=>m.tipo==='respuesta'&&m.id===${JSON.stringify(mi)}))`);}
    console.log('>>',a);console.log(r?String(r).slice(0,Number(process.env.LARGO||1500)):'SIN RESPUESTA');
    await d(Number(process.env.PAUSA||800));
  }
  const ult=await z.ev(`JSON.stringify(window.__salida.map(JSON.parse).filter(m=>m.tipo==='estado').slice(-1)[0]||null)`);
  console.log('ESTADO',ult);
  console.log('ERRORES',await z.ev(`JSON.stringify(window.__zenRemoto.registro().filter(x=>x.k==='error'))`));
}catch(e){console.log('ERR',e.message)}
await z.fin();
