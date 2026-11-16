/* --- Arranque -------------------------------------------------------------
   El userscript entra a document-start, cuando la pagina esta practicamente
   vacia: a esa altura no hay reproductor, no hay barra y no hay video. Asi que
   arrancar es esperar al primer punto critico y solo entonces empezar.

   Se espera al elemento de video y no a ytmusic-app porque la app aparece
   enseguida y el video tarda: si arrancaramos con la app, el reloj naceria sin
   fuente y habria que reintentar desde dentro. */

const arrancar = async () => {
  /* UNA SOLA VEZ POR DOCUMENTO -------------------------------------- MEDIDO -
     Este archivo llamaba a arrancar() dos veces: una envuelta en el catch y otra
     al final, resto de una edicion. Y arrancar dos veces no da ningun error: da
     dos bucles de pintado, dos vigilantes de tema y dos oyentes de teclado. Con
     dos oyentes, cada pulsacion de ajuste movia el desfase 0.2s en lugar de 0.1s,
     que es lo que midio la prueba — un atajo que hace el doble de lo que dice, y
     de los fallos mas dificiles de ver a mano porque el efecto sigue siendo
     plausible.

     Quitada la llamada de mas, la guarda se queda: con un gestor de userscripts
     hay otras formas de que el paquete se evalue dos veces en la misma pagina
     (inyeccion en dos contextos, o el script instalado dos veces). La marca se
     pone ANTES del primer await, porque entre el await y su vuelta cabe
     perfectamente la segunda ejecucion. */
  if (window.__zenLetraVivo) { log('ya hay una instancia en esta pagina; esta no arranca'); return; }
  window.__zenLetraVivo = true;

  const video = await esperar('video');
  if (!video) { warn('no aparecio ningun elemento de video en 30s; el mod no arranca'); return; }

  Ajustes.cargar();
  meterEstilos();
  Reloj.video();
  Reloj.vigilarAnuncios();
  Motor.arrancar();

  /* La letra se pide al cambiar el tema, no en un bucle: el unico momento en
     que hace falta pedirla es cuando cambia lo que suena. */
  Tema.alCambiar((id) => Letra.cargar(id));
  /* Y por el mismo sitio se decide si esta cancion tiene videoclip. Va como
     oyente aparte y no dentro del anterior para que una excepcion suya no se
     lleve por delante la carga de la letra, que es lo que hace este mod. */
  Tema.alCambiar((id) => Video.atender(id));
  Tema.vigilar();

  /* La barra tarda mas en aparecer que el video, asi que el boton se intenta y,
     si no puede, se espera a que exista en lugar de darse por vencido. */
  if (!Controles.poner()) {
    esperar('ytmusic-player-bar #right-controls').then(() => Controles.poner());
  }
  ponerTeclado();
  Vistas.restaurar();
  Controles.refrescar();

  log(`Zen Letra Viva ${LV.version} en pie (red por ${Red.via()}, almacen ${Almacen.via})`);
  if (LV.debug) informe();
};

/* La unica salida al exterior, y solo para depurar a mano desde la consola de
   la pagina. Nada de la logica lee de aqui. Se asigna ANTES de arrancar para
   que este disponible aunque el arranque se caiga: es justo cuando hace falta. */
window.__zenLetra = Object.freeze({
  version: LV.version,
  /* Lo lee Zen Remoto para enseñar la letra en el movil. `firma` cambia cuando
     cambia la cancion, llega la letra o se toca el desfase, y es barata: el
     remoto la mira dos veces por segundo. `letra` es una copia plana, sin las
     palabras sueltas: lo de dentro del mod no se puede tocar desde fuera. */
  firma: () => {
    const l = Letra.estado();
    return [l.id, l.clave, l.lineaDeTiempo ? l.lineaDeTiempo.lineas.length : 0, Letra.desfase()].join('|');
  },
  letra: () => {
    const l = Letra.estado();
    const lt = l.lineaDeTiempo;
    const lineas = lt ? lt.lineas.map((x) => ({ i: x.inicio, f: x.fin, t: x.texto, p: !!x.interludio })) : [];
    return {
      id: l.id, clave: l.clave, fuente: l.fuente, mensaje: l.mensaje,
      desfase: Letra.desfase(),
      sincronizada: lineas.some((x) => x.i > 0),
      lineas,
    };
  },
  doctor: informe,
  puntos: PUNTOS,
  debug: (v = true) => { LV.debug = v; return `depuracion ${v ? 'encendida' : 'apagada'}`; },
  arrancar,
  /* Lo que se mira cuando la letra va desincronizada: si el estado dice
     `anuncio` el reloj esta congelado a proposito, y si la duracion sale
     absurda es que se leyo durante un anuncio. */
  estado: () => {
    const l = Letra.estado();
    return {
      reloj: { tiempo: +Reloj.tiempo().toFixed(3), estado: Reloj.estado(), duracion: +Reloj.duracion().toFixed(1) },
      tema: Tema.actual(),
      letra: {
        clave: l.clave,
        fuente: l.fuente,
        mensaje: l.mensaje,
        lineas: l.lineaDeTiempo ? l.lineaDeTiempo.lineas.length : 0,
        porPalabra: l.lineaDeTiempo ? l.lineaDeTiempo.porPalabra : false,
        desfase: Letra.desfase(),
      },
      via: { red: Red.via(), almacen: Almacen.via, cache: Cache.cuantas() },
      /* Por que suena el audio y no el videoclip, que sin esto solo se puede
         averiguar mirando atributos de Polymer a mano. Distingue "esta cancion
         no tiene video" de "YouTube Music no deja conmutar", que es la
         diferencia entre no hay nada que hacer y falta iniciar sesion. */
      video: Video.estado(),
    };
  },
  /* Las vistas se exponen para poder abrirlas y cerrarlas desde la consola: es
     lo que permite probar una vista sin depender de acertarle al boton. */
  vistas: {
    abrir: (n) => Vistas.abrir(n),
    cerrar: (n) => Vistas.cerrar(n),
    alternar: (n) => Vistas.alternar(n),
    abiertas: () => [...Vistas.abiertas],
    hay: () => [...Vistas.registro.keys()],
  },
  /* Diagnostico de red. Existe porque el fallo del puente entre compartimentos no
     daba ninguna senal: las peticiones salian, volvian, y el motor recibia un
     objeto cuyas propiedades no podia leer. El sintoma era "nadie tiene la letra
     de ninguna cancion", que se parece muchisimo a un problema de la base de
     datos y no lo era. Esto lo distingue en una linea: si `ok` es true pero
     `clavesVisibles` sale vacio, el problema es la frontera, no la red. */
  probarRed: async () => {
    const r = await Red.json('https://lrclib.net/api/search?track_name=test');
    let claves = [];
    try { claves = Object.keys(r || {}); } catch (e) { claves = ['ILEGIBLE: ' + e.message]; }
    let sonda = null;
    /* La sonda solo existe con el cargador nativo, y dice que globales hay de
       verdad en el proceso privilegiado. Adivinarlo costo tres reinicios. */
    try { const p = Red.puente(); if (p && p.sonda) sonda = p.sonda(); } catch (e) { sonda = 'no se pudo sondear: ' + e.message; }
    return {
      via: Red.via(),
      ok: r && r.ok,
      estado: r && r.estado,
      error: r && r.error,
      mecanismo: r && r.mecanismo,
      clavesVisibles: claves,
      resultados: (r && r.datos && r.datos.length) || 0,
      sonda,
    };
  },
  /* El conmutador cancion/video, para poder mirarlo y forzarlo a mano. Sin
     esto, comprobar por que una cancion no salta al videoclip obliga a leer
     atributos de Polymer desde la consola. */
  video: {
    estado: () => Video.estado(),
    lectura: () => Video.lectura(),
    poner: () => Video.poner(),
    reconsiderar: () => Video.reconsiderar(),
  },
  ajustes: () => Ajustes.todos(),
  ajustar: (k, v) => Ajustes.set(k, v),
  recargar: () => Letra.recargar(),
  vaciarCache: () => Cache.vaciar(),
});

/* El catch NO es decoracion. Una excepcion aqui deja el mod cargado y muerto: el
   gestor de userscripts no reporta nada, la consola de la pagina esta llena de
   ruido de YouTube y el sintoma es indistinguible de "no se instalo". Ya paso dos
   veces — un observe() sobre documentElement todavia nulo, y un innerHTML contra
   la politica de Trusted Types de YouTube Music. Las dos las encontro esta linea.
   Que grite con nuestra marca delante y diga que hacer. */
arrancar().catch((e) => {
  console.error('[letra] el arranque se cayo, el mod no esta funcionando:', e);
  console.error('[letra] pega esto en un issue junto con window.__zenLetra.doctor()');
});
