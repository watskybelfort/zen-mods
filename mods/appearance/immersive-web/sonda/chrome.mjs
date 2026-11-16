// Evalua JS en la ventana del navegador (chrome) de la copia, por BiDi.
//   node mods/appearance/immersive-web/sonda-chrome.mjs <archivo.js>
import fs from 'node:fs';
const ws = new WebSocket('ws://127.0.0.1:9345/session');
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const p = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { const { r, j } = p.get(m.id); p.delete(m.id); m.type === 'error' ? j(new Error(m.error + ': ' + m.message)) : r(m.result); } };
const s = (method, params = {}) => new Promise((r, j) => { const i = ++id; p.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  try { await s('session.new', { capabilities: { alwaysMatch: { unhandledPromptBehavior: 'ignore' } } }); } catch (e) { /* ya hay */ }
  const t = await s('browsingContext.getTree', { 'moz:scope': 'chrome' });
  const ctx = t.contexts[0].context;
  const r = await s('script.evaluate', { expression: fs.readFileSync(process.argv[2], 'utf8'), target: { context: ctx }, awaitPromise: true, resultOwnership: 'none' });
  console.log(r.type === 'exception' ? 'EXC ' + r.exceptionDetails.text : r.result.value);
} catch (e) { console.log('ERR', e.message); }
try { await s('session.end'); } catch (e) { /* nada */ }
ws.close();
