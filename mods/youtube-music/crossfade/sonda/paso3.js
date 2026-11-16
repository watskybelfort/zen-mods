(()=>{ const R=window.__res={ev:[],hecho:false}; const L=(k,o)=>R.ev.push(Object.assign({k,t:+performance.now().toFixed(0)},o||{}));
(async()=>{
 const d=ms=>new Promise(r=>setTimeout(r,ms));
 const v=document.querySelector('video'), mp=document.querySelector('#movie_player');
 const ctx=new AudioContext({latencyHint:'playback'}); await Promise.race([ctx.resume(),d(1500)]); const sr=ctx.sampleRate;
 const BS=2048, mudo=ctx.createGain(); mudo.gain.value=0; mudo.connect(ctx.destination);
 const src=ctx.createMediaElementSource(v), gM=ctx.createGain(), gT=ctx.createGain(), sal=ctx.createGain(), sonda=ctx.createGain(); gT.gain.value=0;
 src.connect(gM); gM.connect(sal); gT.connect(sal); sal.connect(ctx.destination);
 // UN solo nodo, tres canales: 0 reproductor crudo, 1 cola, 2 salida final
 const mrg=ctx.createChannelMerger(3); src.connect(mrg,0,0); sonda.connect(mrg,0,1); sal.connect(mrg,0,2);
 const tap=ctx.createScriptProcessor(BS,3,1); const T=[]; let g=true;
 tap.onaudioprocess=e=>{if(!g)return;const b=e.inputBuffer;T.push([b.getChannelData(0).slice(),b.getChannelData(1).slice(),b.getChannelData(2).slice()]);if(T.length>1500)T.shift()};
 mrg.connect(tap); tap.connect(mudo);
 const ult=(n,c)=>{const s=T.slice(-n);const a=new Float32Array(s.length*BS);s.forEach((b,i)=>a.set(b[c],i*BS));return a};
 const lag=(a,b,rad)=>{let best=-2,bl=0;const n=Math.min(a.length,b.length)-2*rad;for(let l=-rad;l<=rad;l++){let s=0,x=0,y=0;for(let i=rad;i<rad+n;i+=3){const u=a[i],w=b[i+l];s+=u*w;x+=u*u;y+=w*w}const c=s/Math.sqrt(x*y+1e-12);if(c>best){best=c;bl=l}}return{c:best,l:bl}};
 const nulo=(a,b)=>{let e=0,x=0;for(let i=0;i<a.length;i++){const q=a[i]-b[i];e+=q*q;x+=a[i]*a[i]}return +(10*Math.log10((e+1e-15)/(x+1e-15))).toFixed(1)};
 const dur=v.duration, e=__mix.sb.filter(e=>/audio/.test(e.mime)).at(-1), n0=e.chunks.length;
 mp.seekTo(dur-40,true); for(let i=0;i<240&&(v.currentTime<dur-40||v.paused);i++)await d(50);
 for(let i=0;i<400&&v.currentTime<dur-26;i++) await d(100);
 const ini=e.chunks[0].b,res=e.chunks.slice(Math.max(1,n0));const tot=res.reduce((a,c)=>a+c.b.length,0);const all=new Uint8Array(tot);let o=0;for(const c of res){all.set(c.b,o);o+=c.b.length}
 let pos=-1;for(let i=0;i<all.length-4;i++){if(all[i]==0x1f&&all[i+1]==0x43&&all[i+2]==0xb6&&all[i+3]==0x75){pos=i;break}}
 let p=pos+4,l0=all[p],w=1,m=0x80;while(!(l0&m)){m>>=1;w++}p+=w;let tc=0;if(all[p]==0xe7){const nb=all[p+1]&0x7f;p+=2;for(let i=0;i<nb;i++)tc=tc*256+all[p+i]}
 const pack=new Uint8Array(ini.length+all.length-pos);pack.set(ini,0);pack.set(all.subarray(pos),ini.length);
 const ab=await ctx.decodeAudioData(pack.buffer.slice(0)); const pL=ab.getChannelData(0).slice(),pR=ab.getChannelData(1).slice(),pcm=pL.map((x,i)=>(x+pR[i])/2), base=tc/1000;
 // 1a: arranque a ojo con video.currentTime, por la sonda (inaudible)
 const lanza=(when,off)=>{const n=ctx.createBufferSource();n.buffer=ab;n.connect(sonda);n.connect(gT);n.start(when,off);return n};
 let w1=ctx.currentTime+0.1, o1=v.currentTime+0.1-base; let t1=lanza(w1,o1); await d(900);
 const c1=lag(ult(16,1),ult(16,0),14400); L('aOjo',{c:+c1.c.toFixed(5),lagMs:+(c1.l/sr*1000).toFixed(2)});
 // 2a: corregido. l>0 significa que el reproductor (ch0) va por detras l muestras de la cola... se prueba y se mide
 const w2=ctx.currentTime+0.12; const o2=o1+(w2-w1)-c1.l/sr; const t2=lanza(w2,o2); t1.stop(w2); await d(900);
 const c2=lag(ult(16,1),ult(16,0),2400); const nu=nulo(ult(16,0),ult(16,1)); L('corregido',{c:+c2.c.toFixed(6),lagMuestras:c2.l,nuloDb:nu});
 // relevo real
 const when=ctx.currentTime+0.1, F0=0.02;
 gT.gain.setValueAtTime(0,when);gT.gain.linearRampToValueAtTime(1,when+F0);gM.gain.setValueAtTime(1,when);gM.gain.linearRampToValueAtTime(0,when+F0);
 await d(500);
 const sal0=ult(30,2),ch0=ult(30,0),ch1=ult(30,1); L('costura',{nuloSalidaVsCola:nulo(sal0.slice(-4096),ch1.slice(-4096)),nuloSalidaVsReproductorEnTodoElTramo:nulo(sal0,ch0)});
 const tN=performance.now(); mp.nextVideo(); let vis=null,marca=T.length;
 for(let i=0;i<300;i++){await d(25);if(v.currentTime>0.05&&v.currentTime<5&&!v.paused&&v.readyState>=3){vis={ms:Math.round(performance.now()-tN),ad:mp.className.includes('ad-showing'),title:document.title};break}}
 L('entra',vis||{fallo:true});
 const seg=T.slice(marca>6?marca-6:0).slice(0,40); let min=2,N=0; let pos2=Math.round((o2+(ctx.currentTime-w2))*sr)-seg.length*BS-48000; 
 const cat=new Float32Array(seg.length*BS);seg.forEach((b,i)=>cat.set(b[1],i*BS));
 // cola durante el salto contra la referencia: localiza una vez y exige continuidad
 const ref=lag(cat.subarray(0,BS*2),pcm.subarray(Math.max(0,pos2-24000),pos2+96000),0);
 let bp=-1,bc=-2;for(let q=Math.max(0,pos2-48000);q<pos2+96000;q+=1){let s=0,x=0,y=0;for(let i=0;i<BS;i+=8){const u=cat[i],w=pcm[q+i]||0;s+=u*w;x+=u*u;y+=w*w}const c=s/Math.sqrt(x*y+1e-12);if(c>bc){bc=c;bp=q}}
 for(let k=0;k<seg.length;k++){let s=0,x=0,y=0;for(let i=0;i<BS;i+=2){const u=cat[k*BS+i],w=pcm[bp+k*BS+i]||0;s+=u*w;x+=u*u;y+=w*w}const c=s/Math.sqrt(x*y+1e-12);N++;if(c<min)min=c}
 L('colaDuranteSalto',{bloques:N,seg:+(N*BS/sr).toFixed(2),inicio:+bc.toFixed(5),minCorr:+min.toFixed(5)});
 const nw=ctx.currentTime,F=6,c=512,cu=new Float32Array(c),cd=new Float32Array(c);for(let i=0;i<c;i++){const x=i/(c-1);cu[i]=Math.sin(x*Math.PI/2);cd[i]=Math.cos(x*Math.PI/2)}
 gM.gain.cancelScheduledValues(nw);gT.gain.cancelScheduledValues(nw);gM.gain.setValueCurveAtTime(cu,nw,F);gT.gain.setValueCurveAtTime(cd,nw,F);
 await d(F*1000+300);t2.stop();g=false;
 L('fin',{title:document.title,ct:v.currentTime});
 R.hecho=true;
})().catch(x=>{L('error',{m:''+x,s:(x&&x.stack||'').slice(0,400)});R.hecho=true});
return 'lanzado';})()
