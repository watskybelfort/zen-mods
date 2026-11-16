export async function abrir(port=9344){
  const ws=new WebSocket(`ws://127.0.0.1:${port}/session`);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  let id=0;const p=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){const{r,j}=p.get(m.id);p.delete(m.id);m.type==='error'?j(new Error(m.error+': '+m.message)):r(m.result)}};
  const s=(method,params={})=>new Promise((r,j)=>{const i=++id;p.set(i,{r,j});ws.send(JSON.stringify({id:i,method,params}))});
  try{await s('session.new',{capabilities:{alwaysMatch:{unhandledPromptBehavior:'ignore'}}})}catch(e){console.log('sesion:',e.message)}
  const t=await s('browsingContext.getTree',{maxDepth:0});
  const ctx=t.contexts[0].context;
  const ev=async(code)=>{const r=await s('script.evaluate',{expression:code,target:{context:ctx},awaitPromise:true,resultOwnership:'none'});
    if(r.type==='exception')throw new Error(r.exceptionDetails.text);return r.result?.value};
  return {s,ctx,ev,fin:async()=>{try{await s('session.end')}catch{};ws.close()}};
}
