/* Pruebas del parser de LRC y del interpolador de palabras, sin navegador.
 *
 * El resto del motor no se puede probar sin una pagina: necesita un elemento de
 * video, un DOM de YouTube Music y una peticion de red. Pero el parser y la
 * interpolacion son funciones puras, y son justo la parte donde un fallo se ve
 * como "la letra va desincronizada" — un sintoma que en vivo se confunde con
 * otras cinco causas. Aqui se comprueban de forma que la respuesta sea si o no.
 *
 * Los textos de prueba son inventados a proposito (palabras sueltas y numeros):
 * lo que se comprueba son los TIEMPOS, y para eso el contenido da igual.
 *
 *   node dev/tools/probar-lrc.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Se cargan los mismos parciales que van al userscript, no una copia: si el
   parser cambia y la prueba no, la prueba avisa. Solo los tres que no tocan el
   DOM al cargarse. */
const fuente = ['mods/youtube-music/live-lyrics/src/05-prologo.js', 'mods/youtube-music/live-lyrics/src/30-lrc.js', 'mods/youtube-music/live-lyrics/src/35-palabras.js', 'mods/youtube-music/live-lyrics/src/50-lrclib.js', 'mods/youtube-music/live-lyrics/src/55-musixmatch.js', 'mods/youtube-music/live-lyrics/src/57-subtitulos.js']
  .map((f) => readFileSync(join(raiz, f), 'utf8'))
  .join('\n')
  .replace('__VERSION__', 'prueba');

/* 55-musixmatch.js y 57-subtitulos.js entran aqui porque sus conversiones son
   puras. Lo que toca red, DOM y ajustes vive dentro de los metodos de los
   proveedores, que no se llaman: al evaluar el archivo solo se definen
   constantes y funciones. */
const motor = new Function(`
  ${fuente}
  return { parsearLrc, componerLineaDeTiempo, lineaEn, silabas, trocear,
           marcaLrc, interpretarPalabras, richsyncALrc, subtituloALrc,
           json3ALrc, elegirPista, esAcotacion,
           parecido, ProveedorLrclib };
`)();

const { parsearLrc, componerLineaDeTiempo, lineaEn, silabas } = motor;
const { marcaLrc, interpretarPalabras, richsyncALrc, subtituloALrc } = motor;

// --- Arnes ----------------------------------------------------------------
let fallos = 0;
let hechas = 0;

const ok = (nombre, condicion, detalle) => {
  hechas++;
  if (condicion) { console.log(`  ok    ${nombre}`); return; }
  fallos++;
  console.log(`  FALLO ${nombre}${detalle ? `\n        ${detalle}` : ''}`);
};

const cerca = (a, b, tol = 0.005) => Math.abs(a - b) < tol;

const grupo = (nombre) => console.log(`\n${nombre}`);

// --- El formato -----------------------------------------------------------
grupo('Marcas de tiempo');
{
  const t = parsearLrc('[00:14.94]uno\n[01:02.50]dos');
  ok('centesimas', t && cerca(t.lineas[0].inicio, 14.94), t && `salio ${t.lineas[0].inicio}`);
  ok('minutos', t && cerca(t.lineas[1].inicio, 62.50), t && `salio ${t.lineas[1].inicio}`);

  const ms = parsearLrc('[00:14.940]uno');
  ok('milesimas no se leen como centesimas', ms && cerca(ms.lineas[0].inicio, 14.94), ms && `salio ${ms.lineas[0].inicio}`);

  const sinFrac = parsearLrc('[00:14]uno');
  ok('sin fraccion', sinFrac && cerca(sinFrac.lineas[0].inicio, 14));

  const dosPuntos = parsearLrc('[00:14:50]uno');
  ok('separador con dos puntos', dosPuntos && cerca(dosPuntos.lineas[0].inicio, 14.5));
}

grupo('Varias marcas en una linea (estribillo)');
{
  const t = parsearLrc('[00:10.00][01:30.00]estribillo\n[00:20.00]otra');
  ok('salen las dos apariciones', t && t.lineas.filter((l) => l.texto === 'estribillo').length === 2,
    t && `salieron ${t.lineas.filter((l) => l.texto === 'estribillo').length}`);
  ok('quedan ordenadas por tiempo', t && t.lineas.map((l) => l.inicio).every((v, i, a) => i === 0 || a[i - 1] <= v),
    t && JSON.stringify(t.lineas.map((l) => l.inicio)));
  ok('el texto no arrastra la segunda marca', t && !/\[/.test(t.lineas[0].texto), t && JSON.stringify(t.lineas[0].texto));
}

grupo('Etiqueta offset');
{
  const t = parsearLrc('[offset:+500]\n[00:10.00]uno');
  ok('positivo resta (la letra iba adelantada)', t && cerca(t.lineas[0].inicio, 9.5), t && `salio ${t.lineas[0].inicio}`);
  const n = parsearLrc('[offset:-500]\n[00:10.00]uno');
  ok('negativo suma', n && cerca(n.lineas[0].inicio, 10.5), n && `salio ${n.lineas[0].inicio}`);
  const meta = parsearLrc('[ar:artista]\n[ti:titulo]\n[00:10.00]uno');
  ok('las metaetiquetas no se cuelan como letra', meta && meta.lineas.length === 1, meta && `${meta.lineas.length} lineas`);
}

grupo('LRC mejorado: tiempos por palabra reales');
{
  const t = parsearLrc('[00:10.00]<00:10.00>uno <00:10.80>dos <00:11.60>tres');
  ok('se marca como porPalabra', t && t.porPalabra === true);
  ok('tres palabras', t && t.lineas[0].palabras && t.lineas[0].palabras.length === 3,
    t && JSON.stringify(t.lineas[0].palabras));
  ok('la segunda empieza donde dice la marca', t && cerca(t.lineas[0].palabras[1].inicio, 10.8));
  ok('el texto queda sin marcas dentro', t && !/[<>]/.test(t.lineas[0].texto), t && t.lineas[0].texto);
  const plano = parsearLrc('[00:10.00]uno dos tres');
  ok('sin marcas por dentro, porPalabra es false', plano && plano.porPalabra === false);
}

grupo('Basura y casos limite');
{
  ok('cadena vacia devuelve null', parsearLrc('') === null);
  ok('texto sin marcas devuelve null', parsearLrc('uno\ndos') === null);
  ok('null devuelve null', parsearLrc(null) === null);
  const dup = parsearLrc('[00:10.00]uno\n[00:10.00]uno');
  ok('duplicado exacto se colapsa', dup && dup.lineas.length === 1, dup && `${dup.lineas.length} lineas`);
  const vacia = parsearLrc('[00:10.00]\n[00:20.00]dos');
  ok('linea sin texto es interludio', vacia && vacia.lineas[0].interludio === true);
}

// --- Silabas --------------------------------------------------------------
grupo('Conteo de silabas (el peso del reparto)');
{
  /* Lo que se comprueba es el ORDEN, no el numero exacto. El contador cuenta
     grupos de vocales, asi que no parte los hiatos: "idea" le sale 2 (i, ea) y
     no 3. Es una imprecision asumida — para repartir tiempo entre palabras solo
     importan los pesos relativos, y equivocarse en una silaba de tres mueve el
     relleno unas decimas. Si algun dia se quiere afinar, aqui es donde se ve. */
  ok('strength: 8 letras, 1 silaba', silabas('strength') === 1, `salio ${silabas('strength')}`);
  ok('corazon', silabas('corazon') === 3, `salio ${silabas('corazon')}`);
  ok('nunca menos de 1', silabas('shh') === 1);
  ok('acentos cuentan', silabas('cancion') >= 2, `salio ${silabas('cancion')}`);
  ok('lo que importa: pesa mas la corta con mas silabas', silabas('idea') > silabas('strength'),
    `idea=${silabas('idea')} contra strength=${silabas('strength')}`);
  ok('el hiato no se parte, y es a proposito', silabas('idea') === 2, `salio ${silabas('idea')}`);
}

// --- Interpolacion --------------------------------------------------------
grupo('Interpolacion de palabras');
{
  const t = componerLineaDeTiempo(parsearLrc('[00:10.00]uno dos tres cuatro\n[00:14.00]final'));
  const l = t.lineas.find((x) => x.texto.startsWith('uno'));
  ok('cuatro palabras', l.palabras.length === 4);
  ok('la primera empieza con la linea', cerca(l.palabras[0].inicio, 10));
  ok('monotona y sin huecos', l.palabras.every((p, i) => i === 0 || cerca(p.inicio, l.palabras[i - 1].fin)),
    JSON.stringify(l.palabras.map((p) => [+p.inicio.toFixed(2), +p.fin.toFixed(2)])));
  ok('no se sale de la linea', l.palabras[l.palabras.length - 1].fin <= 14.001,
    `acaba en ${l.palabras[l.palabras.length - 1].fin}`);
  ok('reparto desigual: mas silabas, mas tiempo',
    (() => {
      const p = componerLineaDeTiempo(parsearLrc('[00:00.00]strength idea\n[00:04.00]x'))
        .lineas[0].palabras;
      return (p[1].fin - p[1].inicio) > (p[0].fin - p[0].inicio);
    })(), 'la palabra de 3 silabas debe durar mas que la de 1 aunque tenga menos letras');
}

grupo('El techo por silaba (lo que evita el relleno moribundo)');
{
  /* Una linea corta seguida de un hueco de 40 segundos: es el caso del solo de
     guitarra. Sin techo, "uno dos" tardaria 40s en rellenarse. */
  const t = componerLineaDeTiempo(parsearLrc('[00:00.00]uno dos\n[00:40.00]final'));
  const l = t.lineas[0];
  const duracionCanto = l.palabras[l.palabras.length - 1].fin - l.palabras[0].inicio;
  ok('el canto no ocupa el hueco entero', duracionCanto < 4, `ocupo ${duracionCanto.toFixed(2)}s de 40`);
  ok('el hueco se convierte en interludio', t.lineas.some((x) => x.interludio),
    JSON.stringify(t.lineas.map((x) => ({ i: +x.inicio.toFixed(1), f: +x.fin.toFixed(1), int: !!x.interludio }))));
}

grupo('Interludios');
{
  const conIntro = componerLineaDeTiempo(parsearLrc('[00:30.00]entra tarde\n[00:34.00]dos'));
  ok('intro larga genera latido en el cero', conIntro.lineas[0].interludio === true && cerca(conIntro.lineas[0].inicio, 0));
  const sinIntro = componerLineaDeTiempo(parsearLrc('[00:01.00]entra pronto\n[00:04.00]dos'));
  ok('intro corta no genera latido', sinIntro.lineas[0].interludio !== true);
  ok('finLetra es el fin de la ultima', cerca(sinIntro.finLetra, sinIntro.lineas[sinIntro.lineas.length - 1].fin));
}

// --- Busqueda binaria -----------------------------------------------------
grupo('Busqueda de la linea activa');
{
  const lineas = Array.from({ length: 200 }, (_, i) => ({ inicio: i * 3, fin: i * 3 + 3 }));
  const lineal = (t) => { let r = -1; for (let i = 0; i < lineas.length; i++) if (lineas[i].inicio <= t) r = i; return r; };
  let iguales = true;
  for (const t of [-5, 0, 0.001, 2.999, 3, 299.5, 597, 600, 9999]) {
    if (lineaEn(lineas, t) !== lineal(t)) { iguales = false; console.log(`        difiere en t=${t}: binaria ${lineaEn(lineas, t)}, lineal ${lineal(t)}`); }
  }
  ok('coincide con el recorrido lineal', iguales);
  ok('antes de la primera devuelve -1', lineaEn(lineas, -1) === -1);
}

// --- Musixmatch: richsync a LRC mejorado ----------------------------------
grupo('Marcas de tiempo que escribimos');
{
  ok('centesimas con relleno', marcaLrc(9.5) === '00:09.50', marcaLrc(9.5));
  ok('minutos de dos cifras', marcaLrc(605.25) === '10:05.25', marcaLrc(605.25));
  ok('el cero', marcaLrc(0) === '00:00.00', marcaLrc(0));
  ok('negativo se recorta a cero', marcaLrc(-3) === '00:00.00', marcaLrc(-3));
  ok('ida y vuelta', (() => {
    const t = parsearLrc(`[${marcaLrc(62.37)}]uno`);
    return t && Math.abs(t.lineas[0].inicio - 62.37) < 0.006;
  })());
}

grupo('Desplazamiento de palabra: relativo contra absoluto');
{
  // Relativo (lo documentado): o cuenta desde ts.
  const rel = interpretarPalabras({ ts: 30, te: 33, l: [{ c: 'uno', o: 0 }, { c: 'dos', o: 1 }, { c: 'tres', o: 2 }] });
  ok('relativo: las palabras caen dentro de la linea', rel.every((p) => p.inicio >= 30 && p.inicio <= 33),
    JSON.stringify(rel.map((p) => p.inicio)));
  ok('relativo: la segunda en ts+1', cerca(rel[1].inicio, 31), String(rel[1].inicio));

  // Absoluto: o ya viene en tiempo de cancion. Si se tratara como relativo,
  // saldrian en el minuto uno en lugar de en el medio minuto.
  const abs = interpretarPalabras({ ts: 30, te: 33, l: [{ c: 'uno', o: 30 }, { c: 'dos', o: 31.5 }] });
  ok('absoluto: se detecta y no se suma dos veces', abs.every((p) => p.inicio >= 30 && p.inicio <= 33),
    JSON.stringify(abs.map((p) => p.inicio)));
  ok('absoluto: la primera se queda en ts', cerca(abs[0].inicio, 30), String(abs[0].inicio));

  ok('sin palabras devuelve null', interpretarPalabras({ ts: 1, te: 2, l: [] }) === null);
  ok('sin la lista devuelve null', interpretarPalabras({ ts: 1, te: 2 }) === null);
}

grupo('Richsync entero, que acabe en linea de tiempo por palabra');
{
  const entradas = [
    { ts: 10, te: 12, x: 'uno dos', l: [{ c: 'uno ', o: 0 }, { c: 'dos', o: 1 }] },
    { ts: 12, te: 15, x: 'tres', l: [{ c: 'tres', o: 0 }] },
  ];
  const lrc = richsyncALrc(entradas);
  ok('sale LRC mejorado con marcas por dentro', /^\[00:10\.00\]</.test(lrc), JSON.stringify(lrc));

  const t = componerLineaDeTiempo(parsearLrc(lrc, 'musixmatch'));
  ok('el parser lo marca como porPalabra', t.porPalabra === true);
  ok('dos lineas', t.lineas.filter((l) => !l.interludio).length === 2, `${t.lineas.length}`);
  /* Y NO es lineas[0]: la letra empieza en el segundo 10, asi que el motor mete
     delante un interludio de entrada — que es lo que se quiere. La primera
     cantada se busca, no se asume. */
  const primera = t.lineas.find((l) => !l.interludio);
  ok('delante hay un interludio de entrada', t.lineas[0].interludio === true);
  ok('la primera cantada empieza en 10', cerca(primera.inicio, 10), String(primera.inicio));
  ok('su segunda palabra en 11, tiempo REAL y no interpolado', cerca(primera.palabras[1].inicio, 11),
    JSON.stringify(primera.palabras.map((p) => +p.inicio.toFixed(2))));
  ok('no se pega separador que parta contracciones', primera.palabras.every((p) => !/\s\s/.test(p.texto)));
  ok('richsync vacio devuelve null', richsyncALrc([]) === null);
}

grupo('Subtitulo por linea de Musixmatch');
{
  const conTotal = subtituloALrc(JSON.stringify([{ text: 'uno', time: { total: 12.34 } }]));
  ok('usa el total cuando viene', /^\[00:12\.34\]uno$/.test(conTotal), JSON.stringify(conTotal));
  const desglosado = subtituloALrc(JSON.stringify([{ text: 'dos', time: { minutes: 1, seconds: 5, hundredths: 50 } }]));
  ok('compone desde minutos/segundos/centesimas', /^\[01:05\.50\]dos$/.test(desglosado), JSON.stringify(desglosado));
  ok('basura devuelve null', subtituloALrc('no soy json') === null);
  ok('lista vacia devuelve null', subtituloALrc('[]') === null);
}

// --- Subtitulos de YouTube: json3 a LRC -----------------------------------
/* La forma de json3 esta medida contra el servicio (mods/youtube-music/live-lyrics/src/57-subtitulos.js
   lo cuenta), pero lo que se prueba aqui son las DECISIONES, que es donde estan
   los fallos que se ven como una letra rara: que se cuele una acotacion de
   sonido, que se pierdan los tiempos por palabra, o que pase una transcripcion
   que no entendio el audio. Los textos son inventados; lo que importa es el
   veredicto. */
const { json3ALrc, elegirPista, esAcotacion } = motor;

/* Rotulos sueltos, como los subtitulos escritos a mano. */
const conRotulos = (lista) => ({ events: lista.map(([ms, txt]) => ({ tStartMs: ms, segs: [{ utf8: txt }] })) });

/* Una tira de palabras con desplazamiento, como los automaticos: cada grupo va
   precedido del evento `aAppend` de salto de linea que trae la ventana rodante. */
const conPalabras = (grupos) => ({
  events: [
    { tStartMs: 0, dDurationMs: 10 },                    // ventana, sin segs
    ...grupos.flatMap(([ms, palabras]) => [
      { tStartMs: ms, aAppend: 1, segs: [{ utf8: '\n' }] },
      { tStartMs: ms, segs: palabras.map((p, i) => ({ utf8: (i ? ' ' : '') + p, ...(i ? { tOffsetMs: i * 300 } : {}) })) },
    ]),
  ],
});

grupo('Acotaciones de sonido, que no son letra');
{
  ok('[Music]', esAcotacion('[Music]'));
  ok('con acento dentro', esAcotacion('[Musica]'));
  ok('solo notas', esAcotacion('[♪♪♪]'));
  ok('entre parentesis', esAcotacion('(risas)'));
  ok('un verso normal no lo es', !esAcotacion('uno dos tres'));
  ok('un verso con un corchete dentro tampoco', !esAcotacion('uno [dos] tres'));
}

grupo('Subtitulos por rotulo (escritos a mano)');
{
  const r = json3ALrc(conRotulos([
    [1000, '[Music]'],
    [2000, '♪ uno dos tres ♪'],
    [4000, 'cuatro cinco seis'],
    [6000, 'siete\nocho nueve'],
    [8000, 'diez once'],
    [8000, 'doce trece'],
    [10000, 'catorce quince dieciseis'],
    [12000, 'diecisiete dieciocho diecinueve'],
  ]), 'es');

  ok('la acotacion no entra como verso', r.lrc && !/Music/.test(r.lrc), r.rechazo || r.lrc);
  ok('las notas no llegan al texto', r.lrc && !/[♪♫♬]/.test(r.lrc), r.lrc);
  ok('el salto dentro de un rotulo se vuelve espacio', r.lrc && /siete ocho nueve/.test(r.lrc), r.lrc);
  /* Dos rotulos en el mismo instante son un rotulo pintado por partes. Sin
     juntarlos queda una linea de duracion cero, que el render no llega a
     ensenar nunca. */
  ok('dos rotulos en el mismo instante se juntan', r.lrc && /\[00:08\.00\]diez once doce trece/.test(r.lrc), r.lrc);
  ok('sin desplazamientos, no es porPalabra', r.porPalabra === false);
}

grupo('Subtitulos por palabra (automaticos)');
{
  const r = json3ALrc(conPalabras([
    [2000, ['aa', 'bb', 'cc']],
    [5000, ['dd', 'ee', 'ff']],
    [8000, ['gg', 'hh', 'ii']],
    [11000, ['jj', 'kk', 'll']],
    [14000, ['mm', 'nn', 'oo']],
    [17000, ['pp', 'qq', 'rr']],
  ]), 'es');

  ok('se marca como porPalabra', r.porPalabra === true, r.rechazo);
  ok('el evento aAppend no mete una linea vacia', r.lrc && !/\]\s*$/m.test(r.lrc), r.lrc);
  ok('la ventana sin segs se ignora', r.lrc && !/^\[00:00\.00\]/m.test(r.lrc), r.lrc);

  /* El tiempo de cada palabra es el del evento MAS su desplazamiento. Sumar mal
     aqui no da error: da una letra cronometrada contra el segundo equivocado. */
  ok('el desplazamiento se suma al inicio del evento', r.lrc && /\[00:02\.00\]<00:02\.00>aa <00:02\.30>bb <00:02\.60>cc/.test(r.lrc),
    r.lrc && r.lrc.split('\n')[0]);

  const t = componerLineaDeTiempo(parsearLrc(r.lrc, 'youtube-auto'));
  ok('el parser lo lee como porPalabra', t && t.porPalabra === true);
  const primera = t.lineas.find((l) => !l.interludio);
  ok('los tiempos sobreviven la ida y vuelta', cerca(primera.palabras[1].inicio, 2.3),
    JSON.stringify(primera.palabras.map((p) => +p.inicio.toFixed(2))));
}

grupo('Donde se corta la linea de un automatico');
{
  /* Los automaticos vienen en una tira continua que la ventana rodante parte a
     mitad de frase. Se rehace por silencios: sin esto, la vista ensena versos
     cortados como "We're no strangers to" / "love. You know the rules". */
  const seguido = json3ALrc(conPalabras([
    [2000, ['aa', 'bb', 'cc']],
    [2900, ['dd', 'ee', 'ff']],       // hueco 0.3s: sigue la misma linea
    [5000, ['gg', 'hh', 'ii']],
    [8000, ['jj', 'kk', 'll']],
    [11000, ['mm', 'nn', 'oo']],
    [14000, ['pp', 'qq', 'rr']],
    [17000, ['ss', 'tt', 'uu']],
  ]), 'es');
  ok('un respiro corto con la linea corta no la parte',
    seguido.lrc && /\[00:02\.00\][^\n]*>ff/.test(seguido.lrc),
    seguido.rechazo || seguido.lrc.split('\n')[0]);

  const cortado = json3ALrc(conPalabras([
    [2000, ['aa', 'bb', 'cc']],
    [5000, ['dd', 'ee', 'ff']],       // hueco 2.4s: corta siempre
    [8000, ['gg', 'hh', 'ii']],
    [11000, ['jj', 'kk', 'll']],
    [14000, ['mm', 'nn', 'oo']],
    [17000, ['pp', 'qq', 'rr']],
  ]), 'es');
  ok('un silencio largo empieza linea nueva',
    cortado.lrc && cortado.lrc.split('\n')[1].startsWith('[00:05.00]'),
    cortado.rechazo || cortado.lrc.split('\n').slice(0, 2).join(' | '));
}

grupo('El corte que tira una transcripcion que no entendio el audio');
{
  /* Medido sobre cinco pistas reales: las cuatro buenas dan de 1.40 a 3.01
     palabras/segundo; el videoclip de MONACO, que es español con subtitulo
     automatico declarado en ingles, da 0.46 y lo que sale es "demonon",
     "fore", "foree". El corte va en 0.8, en mitad de ese hueco. */
  const basura = json3ALrc(conRotulos([
    [10000, 'fore'], [40000, 'foree'], [80000, 'demonon'],
    [120000, 'speee'], [160000, 'for'], [200000, 'm'], [230000, 'st'],
  ]), 'en');
  ok('la basura se rechaza en lugar de ensenarse', !!basura.rechazo, JSON.stringify(basura).slice(0, 120));
  ok('y dice por que', /palabras\/s/.test(basura.rechazo || ''), basura.rechazo);

  const buena = json3ALrc(conRotulos([
    [2000, 'uno dos tres'], [4000, 'cuatro cinco seis'], [6000, 'siete ocho nueve'],
    [8000, 'diez once doce'], [10000, 'trece catorce quince'], [12000, 'dieciseis diecisiete'],
  ]), 'es');
  ok('una densidad normal pasa', !buena.rechazo, buena.rechazo);

  const corta = json3ALrc(conRotulos([[1000, 'uno dos'], [3000, 'tres cuatro']]), 'es');
  ok('cuatro versos sueltos no son una letra', /lineas/.test(corta.rechazo || ''), corta.rechazo);
  ok('sin eventos con texto se rechaza', !!json3ALrc({ events: [] }, 'es').rechazo);
}

grupo('Mayusculas de los subtitulos de emision');
{
  const gritado = json3ALrc(conRotulos([
    [2000, 'I HAVE THIS THING'], [4000, 'MIDNIGHTS BECOME MINE'], [6000, 'WHEN I WORK THE SHIFT'],
    [8000, 'ALL OF THE PEOPLE'], [10000, 'STAND THERE IN THE ROOM'], [12000, 'I WAKE UP SCREAMING'],
  ]), 'en');
  ok('un texto casi todo en alta se baja', /I have this thing/.test(gritado.lrc), gritado.lrc.split('\n')[0]);
  ok('el I del ingles vuelve a su sitio', /when I work/i.test(gritado.lrc) && /\bI\b/.test(gritado.lrc.split('\n')[2]),
    gritado.lrc.split('\n')[2]);
  ok('cada linea empieza en alta', gritado.lrc.split('\n').every((l) => /^\[[\d:.]+\][A-Z]/.test(l)),
    gritado.lrc);

  const normal = json3ALrc(conRotulos([
    [2000, 'Uno dos tres'], [4000, 'cuatro CINCO seis'], [6000, 'siete ocho nueve'],
    [8000, 'diez once doce'], [10000, 'trece catorce quince'], [12000, 'dieciseis diecisiete'],
  ]), 'es');
  ok('un texto normal no se toca', /cuatro CINCO seis/.test(normal.lrc), normal.lrc);
}

grupo('El texto no puede romper el LRC que se genera');
{
  /* El resultado va a un LRC mejorado, donde < y > delimitan las marcas de
     palabra. Un ">>" de un subtitulo de television — que los llevan — se leeria
     como una marca rota y partiria la linea. */
  const r = json3ALrc(conRotulos([
    [2000, '>> uno dos tres'], [4000, 'cuatro <cinco> seis'], [6000, 'siete ocho nueve'],
    [8000, 'diez once doce'], [10000, 'trece catorce quince'], [12000, 'dieciseis diecisiete'],
  ]), 'es');
  ok('no quedan angulos en un LRC sin tiempos por palabra', !/[<>]/.test(r.lrc), r.lrc);
  ok('el parser lo lee entero', (() => {
    const t = parsearLrc(r.lrc, 'youtube');
    return t && t.lineas.length === 6;
  })(), JSON.stringify(parsearLrc(r.lrc, 'youtube').lineas.length));
}

grupo('Que pista de subtitulos se coge');
{
  /* Es la decision que decide si esto sirve o miente: captionTracks no son
     versiones de lo mismo, son idiomas, y varios son traducciones. */
  const p = (lang, kind) => ({ languageCode: lang, kind, baseUrl: 'https://x/' });

  const conDefecto = elegirPista({
    captionTracks: [p('zh-Hans'), p('en'), p('es')],
    audioTracks: [{ defaultCaptionTrackIndex: 1 }],
    defaultAudioTrackIndex: 0,
  });
  ok('manda la que encenderia el reproductor', conDefecto.pista.languageCode === 'en',
    'coger la de es seria ensenar la letra traducida mientras suena en ingles');

  const porElAutomatico = elegirPista({ captionTracks: [p('en'), p('es'), p('es', 'asr')], audioTracks: [{}] });
  ok('sin defecto, el idioma del automatico delata el del audio', porElAutomatico.pista.languageCode === 'es' && !porElAutomatico.pista.kind,
    JSON.stringify(porElAutomatico && porElAutomatico.pista));

  const soloAuto = elegirPista({ captionTracks: [p('es', 'asr')], audioTracks: [{}] });
  ok('si solo hay automatica, esa', soloAuto.pista.kind === 'asr');

  const soloMano = elegirPista({ captionTracks: [p('ja')], audioTracks: [{}] });
  ok('si solo hay una a mano, esa', soloMano.pista.languageCode === 'ja');

  ok('sin pistas devuelve null', elegirPista({ captionTracks: [] }) === null);
  ok('sin lista devuelve null', elegirPista(null) === null);
}

// --- El filtro de candidatos ----------------------------------------------
grupo('El filtro que impide la letra equivocada');
{
  const { parecido, ProveedorLrclib } = motor;
  /* Los nombres son inventados: lo que se comprueba es la decision de aceptar o
     descartar, no que exista ninguna cancion en concreto. */
  const pedido = { id: 'x', titulo: 'Una Copa', artista: 'Homer El Mero Mero', album: '' };
  const filtra = (c, dur) => ProveedorLrclib._pasaElFiltro(
    c, pedido, dur, parecido(c.trackName, pedido.titulo), parecido(c.artistName, pedido.artista));

  ok('acepta el mismo tema con la misma duracion',
    filtra({ trackName: 'Una Copa', artistName: 'Homer El Mero Mero', duration: 200 }, 200) === null);

  ok('DESCARTA otro tema aunque traiga letra sincronizada',
    filtra({ trackName: 'Otra Cosa Distinta', artistName: 'Otro Artista', duration: 200, syncedLyrics: '[00:01.00]x' }, 200) !== null,
    'este es el fallo que se reporto en uso: la letra sincronizada bastaba para pasar');

  ok('descarta el titulo parecido pero de otro artista',
    filtra({ trackName: 'Una Copa', artistName: 'Grupo Sin Relacion Ninguna', duration: 200 }, 200) !== null);

  ok('perdona el artista cuando el titulo clava y la duracion tambien',
    filtra({ trackName: 'Una Copa', artistName: 'Homer El Mero Mero, Emanero y otros', duration: 201 }, 200) === null,
    'las colaboraciones se listan de formas distintas en cada base');

  ok('descarta por duracion muy distinta',
    filtra({ trackName: 'Una Copa', artistName: 'Homer El Mero Mero', duration: 400 }, 200) !== null);

  ok('sin duracion conocida no descarta por duracion',
    filtra({ trackName: 'Una Copa', artistName: 'Homer El Mero Mero', duration: 400 }, null) === null);

  const elegido = ProveedorLrclib._elegir([
    { trackName: 'Nada Que Ver', artistName: 'Otro', duration: 200, syncedLyrics: '[00:01.00]a' },
    { trackName: 'Tampoco', artistName: 'Otro Mas', duration: 199, syncedLyrics: '[00:01.00]b' },
  ], pedido, 200);
  ok('si NADIE pasa el filtro, devuelve null en lugar del menos malo', elegido === null,
    'mejor sin letra que con la equivocada: sin letra se corrige, la equivocada se sufre');

  ok('el titulo identico NO abre la puerta a un artista sin relacion',
    filtra({ trackName: 'Una Copa', artistName: 'Grupo Sin Relacion Ninguna', duration: 200 }, 200) !== null,
    'dos canciones pueden llamarse igual y durar lo mismo; lo que no hacen es compartir el nombre del artista');

  /* Las dos duraciones dentro del margen, para que las dos pasen el filtro y
     haya lista sobre la que avanzar. */
  const bueno = ProveedorLrclib._elegir([
    { trackName: 'Una Copa', artistName: 'Homer El Mero Mero', duration: 205, plainLyrics: 'x' },
    { trackName: 'Una Copa', artistName: 'Homer El Mero Mero', duration: 200, syncedLyrics: '[00:01.00]a' },
  ], pedido, 200);
  ok('entre los validos elige el sincronizado y con la duracion buena', bueno && bueno.fuente === 'lrclib' && !bueno.plano);
  const cuantas = ProveedorLrclib.cuantasVersiones(pedido);
  ok('guarda la lista para poder pasar a la siguiente', cuantas && cuantas.total === 2 && cuantas.actual === 1,
    JSON.stringify(cuantas));
  ok('otra() avanza a la siguiente version', !!ProveedorLrclib.otra(pedido));
  ok('y devuelve null cuando se acaban', ProveedorLrclib.otra(pedido) === null);
}

console.log(`\n${hechas - fallos}/${hechas} pruebas pasan`);
if (fallos) { console.log(`${fallos} FALLO(S)`); process.exit(1); }
