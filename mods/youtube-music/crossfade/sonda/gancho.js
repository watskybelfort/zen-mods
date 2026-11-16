()=>{ if(window.__mix) return;
 const m=window.__mix={sb:[],log:[]};
 const add=MediaSource.prototype.addSourceBuffer;
 MediaSource.prototype.addSourceBuffer=function(mime){const sb=add.call(this,mime);
   const e={mime,chunks:[],bytes:0,t0:performance.now(),sb}; m.sb.push(e); sb.__e=e; m.log.push('addSourceBuffer '+mime); return sb;};
 const ap=SourceBuffer.prototype.appendBuffer;
 SourceBuffer.prototype.appendBuffer=function(d){try{const e=this.__e;if(e&&/audio/.test(e.mime)){
   const u=d instanceof ArrayBuffer?new Uint8Array(d):new Uint8Array(d.buffer,d.byteOffset,d.byteLength);
   e.chunks.push({at:performance.now(),off:this.timestampOffset,b:u.slice()});e.bytes+=u.length;}}catch(x){m.log.push('err '+x)}
   return ap.call(this,d)};
 const ro=SourceBuffer.prototype.remove; SourceBuffer.prototype.remove=function(a,b){if(this.__e)m.log.push('remove '+this.__e.mime.slice(0,10)+' '+a.toFixed(1)+'-'+(b>1e6?'inf':b.toFixed(1)));return ro.call(this,a,b)};
}
