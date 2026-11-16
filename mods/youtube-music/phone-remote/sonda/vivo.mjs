// Prueba viva de Zen Remoto en la copia (bash mods/youtube-music/phone-remote/sonda/copia.sh arrancar):
// hace de movil contra el servidor de verdad y abre el panel por BiDi para leer el
// codigo. Comprueba el piso de seguridad y las ordenes contra YouTube Music.
//   node mods/youtube-music/phone-remote/sonda/vivo.mjs [puerto]
import {abrir} from './lib.mjs';
const PUERTO = Number(process.argv[2] || 8643);
// IP_MOVIL: la prueba de fuerza bruta deja la IP de origen bloqueada 10 minutos;
// para repetir enseguida, entrar por otra (la de la red de casa).
const IP = process.env.IP_MOVIL || '127.0.0.1';
const BASE = `http://${IP}:${PUERTO}`;
const ORIGEN = BASE;
const d = (ms) => new Promise((r) => setTimeout(r, ms));
let bien = 0, mal = 0;
const ok = (c, msg, extra = '') => { if (c) { bien++; console.log('  ok   ', msg); } else { mal++; console.log('  FALLA', msg, extra); } };

// fetch de node no deja poner Host ni Origin a mano en todos los casos: se usa http.
import http from 'node:http';
const pedir = (ruta, { cuerpo, cab = {}, metodo = cuerpo === undefined ? 'GET' : 'POST' } = {}) => new Promise((res) => {
  const datos = cuerpo === undefined ? null : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
  const h = Object.assign({ Host: `${IP}:${PUERTO}` }, datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos), Origin: ORIGEN } : {}, cab);
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  const r = http.request({ host: IP, port: PUERTO, path: ruta, method: metodo, headers: h, setHost: false }, (rr) => {
    let b = ''; rr.setEncoding('utf8'); rr.on('data', (x) => b += x);
    rr.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { /* no es json */ } res({ s: rr.statusCode, h: rr.headers, b, j }); });
  });
  r.on('error', (e) => res({ s: 0, e: String(e) }));
  if (datos) r.write(datos);
  r.end();
});

const z = await abrir();
try {
  console.log('Defensas');
  ok((await pedir('/api/yo', { cab: { Host: 'evil.example:8643' } })).s === 421, 'Host que no es IP: 421 (DNS rebinding)');
  ok((await pedir('/api/orden', { cuerpo: { orden: 'siguiente' } })).s === 401, 'orden sin emparejar: 401');
  ok((await pedir('/api/emparejar', { cuerpo: { codigo: '123456' }, cab: { Origin: 'http://evil.example' } })).s === 403, 'POST con Origin ajeno: 403 (CSRF)');
  ok((await pedir('/api/emparejar', { cuerpo: { codigo: '123456' }, cab: { Origin: null } })).s === 403, 'POST sin Origin: 403');
  ok((await pedir('/api/emparejar', { cuerpo: 'codigo=1', cab: { 'Content-Type': 'application/x-www-form-urlencoded' } })).s === 415, 'POST que no es JSON: 415');
  ok((await pedir('/../../prefs.js')).s === 404, 'ruta con ../: 404');
  ok((await pedir('/movil/app.js')).s === 404, 'nada fuera de la lista: 404');
  const grande = await pedir('/api/emparejar', { cuerpo: JSON.stringify({ x: 'a'.repeat(20000) }) });
  ok(grande.s === 413 || grande.s === 0, 'cuerpo de 20 KB: 413', grande.s);
  const est = await pedir('/');
  ok(est.s === 200 && /Content-Security-Policy/i.test(JSON.stringify(est.h)) && est.h['x-content-type-options'] === 'nosniff', 'la pagina sale con CSP y nosniff');
  ok(est.h['set-cookie'] === undefined, 'la pagina no pone cookie sin emparejar');

  console.log('Emparejar');
  ok((await pedir('/api/emparejar', { cuerpo: { codigo: '000000' } })).j?.error === 'abre-el-panel', 'sin panel abierto no hay codigo');
  await z.ev(`document.querySelector('.zr-boton').click()`);
  await d(1500);
  const panel = JSON.parse(await z.ev(`JSON.stringify({c:document.querySelector('.zr-codigo').textContent,u:document.querySelector('.zr-url').textContent,qr:!!document.querySelector('.zr-qr svg'),err:document.querySelector('.zr-error').textContent})`));
  console.log('       panel:', JSON.stringify(panel));
  const codigo = panel.c.replace(/\D/g, '');
  ok(/^\d{6}$/.test(codigo) && panel.qr, 'el panel enseña codigo y QR');
  ok(/^\d+\.\d+\.\d+\.\d+:\d+$/.test(panel.u), 'el panel enseña la IP de la red de casa');
  const malo = String((Number(codigo) + 1) % 1000000).padStart(6, '0');
  ok((await pedir('/api/emparejar', { cuerpo: { codigo: malo } })).j?.error === 'codigo-malo', 'codigo malo: rechazado');
  const e = await pedir('/api/emparejar', { cuerpo: { codigo } });
  const cookie = (e.h['set-cookie'] || [''])[0];
  ok(e.s === 200 && /HttpOnly/.test(cookie) && /SameSite=Strict/.test(cookie), 'codigo bueno: cookie HttpOnly SameSite=Strict');
  const sesion = cookie.split(';')[0];
  ok((await pedir('/api/emparejar', { cuerpo: { codigo } })).s === 401, 'el codigo no sirve dos veces');
  const C = { Cookie: sesion };
  ok((await pedir('/api/yo', { cab: C })).s === 200, 'con la cookie: dentro');
  ok((await pedir('/api/yo', { cab: { Cookie: 'zr=' + 'a'.repeat(64) } })).s === 401, 'cookie inventada: 401');

  console.log('Estado y ordenes');
  const s1 = await pedir('/api/estado?v=0', { cab: C });
  ok(s1.s === 200 && s1.j?.estado?.listo, 'estado de la pestana', s1.b.slice(0, 200));
  console.log('       suena:', s1.j?.estado?.titulo, '-', s1.j?.estado?.artista, 'vol', s1.j?.estado?.vol);
  const t0 = Date.now();
  const espera = pedir('/api/estado?v=' + s1.j.v, { cab: C });
  await d(600);
  const ov = await pedir('/api/orden', { cuerpo: { orden: 'volumen', args: { v: 23 } }, cab: C });
  ok(ov.s === 200 && ov.j?.ok, 'orden volumen');
  const s2 = await espera;
  ok(s2.s === 200 && Date.now() - t0 < 5000 && s2.j.v > s1.j.v, 'la espera larga despierta con el cambio', `${Date.now() - t0} ms`);
  await d(800);
  const s3 = await pedir('/api/estado?v=0', { cab: C });
  ok(s3.j?.estado?.vol === 23, 'el volumen llego a la barra del PC', s3.j?.estado?.vol);
  ok((await pedir('/api/orden', { cuerpo: { orden: 'volumen', args: { v: 400 } }, cab: C })).s === 400, 'volumen fuera de rango: 400');
  ok((await pedir('/api/orden', { cuerpo: { orden: 'evalua', args: {} }, cab: C })).s === 400, 'orden inventada: 400');
  const b = await pedir('/api/orden', { cuerpo: { orden: 'buscar', args: { q: 'karol g' } }, cab: C });
  const items = (b.j?.datos?.busqueda?.secciones || []).flatMap((g) => g.items);
  ok(b.s === 200 && items.length > 5, 'buscar', items.length);
  const cancion = items.find((i) => i.tipo === 'cancion' && i.encola);
  const enc = await pedir('/api/orden', { cuerpo: { orden: 'encolar', args: { ref: cancion.ref, donde: 'siguiente' } }, cab: C });
  ok(enc.j?.ok, 'poner a continuacion: ' + cancion.titulo);
  const cola = await pedir('/api/orden', { cuerpo: { orden: 'cola' }, cab: C });
  const c = cola.j?.datos?.cola;
  const sig = c && c.items.find((x) => x.i === c.actual + 1);
  ok(sig && sig.titulo === cancion.titulo, 'esta justo detras de la que suena', sig && sig.titulo);
  const album = items.find((i) => i.tipo === 'album');
  if (album) {
    const pa = await pedir('/api/orden', { cuerpo: { orden: 'abrir', args: { ref: album.ref } }, cab: C });
    ok(pa.j?.datos?.pagina?.secciones?.[0]?.items?.length > 3 && pa.j.datos.pagina.reproducir, 'abrir album: ' + album.titulo);
  }
  const lib = await pedir('/api/orden', { cuerpo: { orden: 'pagina', args: { id: 'inicio' } }, cab: C });
  ok(lib.j?.datos?.pagina?.secciones?.length > 0, 'pagina de inicio');

  console.log('Abuso');
  const rafaga = await Promise.all(Array.from({ length: 70 }, () => pedir('/api/yo', { cab: C })));
  ok(rafaga.some((r) => r.s === 429), 'rafaga de 70 peticiones: alguna 429', rafaga.filter((r) => r.s === 429).length);
  await d(6000);
  await z.ev(`document.querySelector('.zr-codigo').textContent`);
  let bloqueo = false;
  for (let i = 0; i < 7; i++) {
    const r = await pedir('/api/emparejar', { cuerpo: { codigo: String(100000 + i) } });
    if (r.s === 429) { bloqueo = true; break; }
  }
  ok(bloqueo, 'fuerza bruta del codigo: bloqueada tras 5 fallos');

  console.log('Salir');
  ok((await pedir('/api/salir', { cuerpo: {}, cab: C })).s === 200, 'salir');
  ok((await pedir('/api/yo', { cab: C })).s === 401, 'tras salir, la cookie vieja da 401');
  await z.ev(`document.querySelector('.zr-boton').click()`);
} catch (e) { mal++; console.log('ERR', e.stack); }
await z.fin();
console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
