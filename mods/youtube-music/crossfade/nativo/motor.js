/* Zen Mezcla — el motor. Corre en la pestana de YouTube Music, en una caja con el
 * principal de la pagina, y antes de que arranque ningun script suyo.
 *
 * La idea: no se adelanta la cancion siguiente, se guarda el final de la actual.
 *
 *   Captura   copia los bytes de audio que el reproductor mete en su SourceBuffer
 *   Grafo     pasa el <video> por Web Audio, con una rama para la cola
 *   Cola      decodifica el final y calcula donde acaba la musica
 *   Director  alinea, releva, salta a la siguiente y funde
 *   Panel     el boton de la barra y lo que dice que esta sonando
 *
 * LA REGLA QUE MANDA SOBRE TODO: si algo falla se deja de mezclar, no de sonar.
 * Nada de aqui puede lanzar hacia el reproductor, y `rescate` deja siempre el
 * camino del reproductor abierto.
 */
(() => {
  'use strict';

  if (window.__zenMezcla) return;

  // El idioma: el de la pagina de YouTube Music (el de la cuenta) o el forzado
  // por la pref compartida zen.mods.idioma (llega del cargador como __zenIdioma).
  const idioma = () => {
    const f = typeof __zenIdioma === 'string' ? __zenIdioma : '';
    if (f === 'es' || f === 'en') return f;
    const l = (document.documentElement && document.documentElement.lang) || navigator.language || '';
    return /^es\b/i.test(l) ? 'es' : 'en';
  };
  const tr = (en, es) => (idioma() === 'es' ? es : en);
  const P = ZenMezclaPuro;
  const L = P.LIMITES;

  const registro = [];
  const nota = (k, datos) => {
    registro.push({ t: Math.round(performance.now()), k, ...(datos || {}) });
    if (registro.length > 400) registro.shift();
  };

  // --- Ajustes ---------------------------------------------------------------
  const CLAVE = 'zen-mezcla';
  const Ajustes = {
    v: { activa: true, fundido: L.fundidoDefecto, discos: false },
    cargar() {
      try {
        const g = JSON.parse(localStorage.getItem(CLAVE) || '{}');
        if (typeof g.activa === 'boolean') this.v.activa = g.activa;
        if (typeof g.discos === 'boolean') this.v.discos = g.discos;
        const f = Number(g.fundido);
        if (f >= L.fundidoMin && f <= L.fundidoMax) this.v.fundido = f;
      } catch (e) { /* se queda con los valores por defecto */ }
    },
    guardar() {
      try { localStorage.setItem(CLAVE, JSON.stringify(this.v)); } catch (e) { /* solo no se recuerda */ }
    },
  };

  // --- Captura ---------------------------------------------------------------
  // Un MediaSource por cancion y por anuncio; el que suena es el que sigue abierto.
  const Captura = {
    tope: 48 * 1024 * 1024,
    pistas: [],
    porBuffer: new WeakMap(),

    instalar() {
      const proto = MediaSource.prototype;
      const protoSb = SourceBuffer.prototype;
      const anadir = proto.addSourceBuffer;
      const meter = protoSb.appendBuffer;
      const self = this;

      proto.addSourceBuffer = function (tipo) {
        const sb = anadir.call(this, tipo);
        try { self.nueva(this, sb, String(tipo)); } catch (e) { nota('error', { en: 'addSourceBuffer', m: String(e) }); }
        return sb;
      };
      protoSb.appendBuffer = function (datos) {
        const r = meter.call(this, datos);
        try { self.guardar(this, datos); } catch (e) { nota('error', { en: 'appendBuffer', m: String(e) }); }
        return r;
      };
    },

    nueva(ms, sb, tipo) {
      if (!/^audio\//i.test(tipo)) return;
      const pista = { ms, sb, tipo, trozos: [], bytes: 0 };
      this.porBuffer.set(sb, pista);
      this.pistas = this.pistas.filter((p) => p.ms.readyState !== 'closed').concat(pista);
      nota('pista', { tipo });
    },

    guardar(sb, datos) {
      const pista = this.porBuffer.get(sb);
      if (!pista) return;
      const b = datos instanceof ArrayBuffer
        ? new Uint8Array(datos.slice(0))
        : new Uint8Array(datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength));
      pista.trozos.push(b);
      pista.bytes += b.length;
      // El primer trozo lleva la cabecera y no se suelta nunca.
      while (pista.bytes > this.tope && pista.trozos.length > 2) {
        pista.bytes -= pista.trozos[1].length;
        pista.trozos.splice(1, 1);
      }
    },

    // La que suena es la que tiene bajado este instante. Puede haber mas de un
    // MediaSource abierto, y la mas nueva no tiene por que ser la que se oye.
    actual(ct) {
      const abiertas = this.pistas.filter((p) => p.ms.readyState !== 'closed');
      if (Number.isFinite(ct)) {
        for (let i = abiertas.length - 1; i >= 0; i--) {
          try {
            const r = abiertas[i].sb.buffered;
            for (let j = 0; j < r.length; j++) {
              if (r.start(j) - 1 <= ct && ct <= r.end(j) + 1) return abiertas[i];
            }
          } catch (e) { /* ese SourceBuffer ya no esta */ }
        }
      }
      return abiertas.length ? abiertas[abiertas.length - 1] : null;
    },
  };

  // --- Reproductor -----------------------------------------------------------
  const Rep = {
    nodo() { return document.querySelector('#movie_player'); },
    video() { return document.querySelector('#movie_player video') || document.querySelector('video'); },
    llamar(fn, ...args) {
      const n = this.nodo();
      try { return n && typeof n[fn] === 'function' ? n[fn](...args) : undefined; } catch (e) { return undefined; }
    },
    id() { const d = this.llamar('getVideoData'); return (d && d.video_id) || ''; },
    finBuffer() { const v = this.video(); return v ? Grafo.finRango(v.buffered, v.currentTime) : null; },
    estado() { return this.llamar('getPlayerState'); },
    anuncio() { const n = this.nodo(); return !!n && n.classList.contains('ad-showing'); },
    respuesta() { return this.llamar('getPlayerResponse') || {}; },
    lkfs() {
      const a = this.respuesta().playerConfig;
      const v = a && a.audioConfig && a.audioConfig.trackAbsoluteLoudnessLkfs;
      return Number.isFinite(v) ? v : NaN;
    },
    repetirUna() {
      const b = document.querySelector('ytmusic-player-bar');
      if (!b) return false;
      const m = b.repeatMode || b.getAttribute('repeat-mode') || b.repeatMode_;
      return String(m || '').toUpperCase() === 'ONE';
    },
    enDisco() {
      try { return (new URL(location.href).searchParams.get('list') || '').startsWith('OLAK5uy_'); } catch (e) { return false; }
    },
    formato() {
      const s = this.llamar('getStatsForNerds') || {};
      const c = String(s.codecs || '');
      const m = c.match(/([a-z0-9.]+)\s*\((\d+)\)\s*$/i);
      const itag = m ? Number(m[2]) : 0;
      const lista = (this.respuesta().streamingData || {}).adaptiveFormats || [];
      const f = lista.find((x) => x.itag === itag);
      const kbps = f ? Math.round((f.averageBitrate || f.bitrate || 0) / 1000) : 0;
      return P.describirFormato({ codecs: m ? m[1] : c, itag, kbps });
    },
    version() {
      const d = this.respuesta().videoDetails || {};
      const t = d.musicVideoType || '';
      if (t === 'MUSIC_VIDEO_TYPE_ATV') return 'estudio';
      if (t) return 'video';
      return '';
    },
  };

  // --- Grafo -----------------------------------------------------------------
  //   video ─ gM ──────┐
  //                    ├─ destino
  //   cola ── gT ─ gV ─┘
  //
  // gT lleva las curvas y gV el volumen del reproductor: un AudioParam no admite
  // otros eventos durante una curva.
  //
  // createMediaElementSource no se puede deshacer y, con el contexto parado, deja
  // el video mudo. Por eso solo se conecta con el contexto en marcha.
  const Grafo = {
    ctx: null, video: null, fuente: null, gM: null, gT: null, gV: null, sonda: null,
    analizador: null, fusion: null, toma: null, mudo: null,
    enlazando: false, tomaActiva: false, bloques: [],

    listo() { return !!this.fuente && this.ctx.state === 'running'; },

    async enlazar() {
      if (this.enlazando) return;
      const v = Rep.video();
      if (!v || this.video === v) return;
      this.enlazando = true;
      try {
        if (!this.ctx) {
          this.ctx = new AudioContext({ latencyHint: 'playback' });
          this.gM = this.ctx.createGain();
          this.gT = this.ctx.createGain();
          this.gT.gain.value = 0;
          this.gV = this.ctx.createGain();
          this.sonda = this.ctx.createGain();
          this.mudo = this.ctx.createGain();
          this.mudo.gain.value = 0;
          this.analizador = this.ctx.createAnalyser();
          this.analizador.fftSize = 2048;
          this.fusion = this.ctx.createChannelMerger(2);
          this.gM.connect(this.ctx.destination);
          this.gT.connect(this.gV);
          this.gV.connect(this.ctx.destination);
          this.mudo.connect(this.ctx.destination);
        }
        await Promise.race([
          this.ctx.resume(),
          new Promise((r) => { setTimeout(r, 1000); }),
        ]);
        if (this.ctx.state !== 'running') { nota('contexto', { estado: this.ctx.state }); return; }
        if (this.fuente) { try { this.fuente.disconnect(); } catch (e) { /* ya estaba */ } }
        this.fuente = this.ctx.createMediaElementSource(v);
        this.fuente.connect(this.gM);
        this.fuente.connect(this.analizador);
        this.video = v;
        nota('enlazado', { sr: this.ctx.sampleRate });
      } finally {
        this.enlazando = false;
      }
    },

    abrirToma() {
      if (this.tomaActiva) return;
      this.toma = this.ctx.createScriptProcessor(2048, 2, 1);
      this.bloques = [];
      this.toma.onaudioprocess = (e) => {
        const b = e.inputBuffer;
        this.bloques.push([b.getChannelData(0).slice(), b.getChannelData(1).slice()]);
        if (this.bloques.length > 64) this.bloques.shift();
      };
      this.fuente.connect(this.fusion, 0, 0);
      this.sonda.connect(this.fusion, 0, 1);
      this.fusion.connect(this.toma);
      this.toma.connect(this.mudo);
      this.tomaActiva = true;
    },

    cerrarToma() {
      if (!this.tomaActiva) return;
      this.tomaActiva = false;
      try {
        this.fuente.disconnect(this.fusion);
        this.sonda.disconnect(this.fusion);
        this.fusion.disconnect();
        this.toma.disconnect();
        this.toma.onaudioprocess = null;
      } catch (e) { nota('error', { en: 'cerrarToma', m: String(e) }); }
      this.toma = null;
      this.bloques = [];
    },

    leerToma(n) {
      const s = this.bloques.slice(-n);
      const a = new Float32Array(s.length * 2048);
      const b = new Float32Array(s.length * 2048);
      s.forEach((x, i) => { a.set(x[0], i * 2048); b.set(x[1], i * 2048); });
      return { rep: a, cola: b };
    },

    finRango(r, ct) {
      for (let j = 0; j < r.length; j++) {
        if (r.start(j) - 1 <= ct && ct <= r.end(j) + 1) return Number(r.end(j).toFixed(1));
      }
      return null;
    },

    finBuffer(sb) {
      try { return this.finRango(sb.buffered, Rep.video().currentTime); } catch (e) { return null; }
    },

    nivelDb() {
      const a = new Float32Array(this.analizador.fftSize);
      this.analizador.getFloatTimeDomainData(a);
      return 20 * Math.log10(P.rms(a) + 1e-9);
    },
  };

  const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const TRAMOS = 65;

  // --- Cola ------------------------------------------------------------------
  const Cola = {
    sinUltimos: 0,   // solo para pruebas: finge que el final no se ha bajado

    async construir(desde, duracion, ct) {
      const pista = Captura.actual(ct);
      if (!pista) return { motivo: 'sin captura', pistas: Captura.pistas.length };
      const b = P.concatenar(pista.trozos);
      const lectura = P.leerContenedor(b);
      let compensa = 0;
      try { compensa = pista.sb.timestampOffset || 0; } catch (e) { /* sin offset */ }
      const r = P.recortar(lectura, b, desde - compensa, duracion - compensa - Cola.sinUltimos);
      const info = {
        pistas: Captura.pistas.length, trozos: pista.trozos.length, mb: Number((pista.bytes / 1048576).toFixed(1)),
        segmentos: lectura ? lectura.segmentos.length : 0, compensa,
        ultimo: lectura && lectura.segmentos.length ? Number(lectura.segmentos[lectura.segmentos.length - 1].t.toFixed(1)) : null,
        bufVideo: Rep.finBuffer(), bufPista: Grafo.finBuffer(pista.sb),
      };
      if (!r) return { motivo: 'contenedor no reconocido', tipo: pista.tipo, ...info };
      const pcm = await Grafo.ctx.decodeAudioData(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength));
      const base = r.base + compensa;
      const fin = base + pcm.duration;
      const canales = [];
      for (let i = 0; i < pcm.numberOfChannels; i++) canales.push(pcm.getChannelData(i).slice());
      return {
        pcm, base, fin, entera: fin >= duracion - 1.5, info,
        finMusica: base + P.finMusical(canales, pcm.sampleRate),
      };
    },
  };

  // --- Director --------------------------------------------------------------
  // reposo → preparando → armada → alineando → alineada → cola → entrada → fundiendo
  const D = {
    fase: 'reposo',
    motivo: '',
    plan: null,
    idDescartado: '',
    pausadoPorNosotros: false,
    ultimoCt: 0,
    ultimoReloj: 0,
    idActual: '',
    reintentoEn: 0,

    descartar(motivo) {
      nota('descarte', { motivo, fase: this.fase });
      this.motivo = motivo;
      this.idDescartado = Rep.id();
      this.limpiarPlan();
      this.fase = 'reposo';
    },

    limpiarPlan() {
      const p = this.plan;
      if (p) {
        for (const f of [p.fuente, p.fuentePrueba]) {
          if (f) { try { f.stop(); } catch (e) { /* no habia arrancado */ } try { f.disconnect(); } catch (e) { /* ya */ } }
        }
      }
      this.plan = null;
      if (Grafo.fuente) {
        Grafo.cerrarToma();
        Grafo.gV.gain.cancelScheduledValues(0);
        Grafo.gV.gain.setValueAtTime(1, Grafo.ctx.currentTime);
      }
    },

    // Un fundido son tramos lineales y no setValueCurveAtTime. MEDIDO en Zen 1.24b:
    // una curva ya empezada no se deja cancelar, ni desde cero, y todo evento nuevo
    // lanza NotSupportedError hasta que acaba. Eso impedia cortar con "siguiente".
    trazar(param, valores, t, dura) {
      param.setValueAtTime(valores[0], t);
      for (let i = 1; i < valores.length; i++) {
        param.linearRampToValueAtTime(valores[i], t + dura * i / (valores.length - 1));
      }
    },

    quitarEventos() {
      Grafo.gM.gain.cancelScheduledValues(0);
      Grafo.gT.gain.cancelScheduledValues(0);
    },

    // Deja el camino del reproductor abierto, pase lo que pase.
    rescate(motivo) {
      nota('rescate', { motivo, fase: this.fase });
      try {
        const c = Grafo.ctx;
        if (c) {
          const t = c.currentTime;
          this.quitarEventos();
          Grafo.gM.gain.setValueAtTime(1, t);
          Grafo.gT.gain.setValueAtTime(0, t);
        }
      } catch (e) { /* sigue */ }
      this.descartar(motivo);
    },

    lanzar(cuando, desde) {
      const f = Grafo.ctx.createBufferSource();
      f.buffer = this.plan.pcm;
      f.connect(Grafo.sonda);
      f.connect(Grafo.gT);
      f.start(cuando, desde);
      return f;
    },

    async preparar(id, ct, dur) {
      const r = await Cola.construir(ct - 1, dur, ct);
      if (this.fase !== 'preparando' || Rep.id() !== id) return;
      const ahora = Rep.video().currentTime;
      const ultima = ahora >= P.ultimoMomento(dur, Ajustes.v.fundido) - 1;
      // Se espera al final exacto mientras haya tiempo; despues vale lo que haya.
      if (!r.pcm || (!r.entera && !ultima)) {
        nota('cola', { motivo: r.pcm ? 'final sin bajar' : r.motivo, ct: Number(ct.toFixed(1)), dur, fin: r.fin, ...(r.info || r) , pcm: undefined });
        this.reintentoEn = performance.now() + 1000;
        this.fase = 'reposo';
        return;
      }
      if (!P.colaSuficiente({ finMusica: r.finMusica, ahora })) {
        nota('cola', { motivo: 'cola corta', ct: Number(ahora.toFixed(1)), dur, fin: r.fin, ...r.info });
        this.descartar('cola corta');
        return;
      }
      const relevo = P.momentoDeRelevo({ finMusica: r.finMusica, fundido: Ajustes.v.fundido, ahora });
      this.plan = {
        id, pcm: r.pcm, base: r.base, finMusica: r.finMusica, relevo,
        lkfs: Rep.lkfs(), ganancia: 1, ancla: null, fuente: null, fuentePrueba: null,
      };
      nota('cola', { base: r.base, finMusica: r.finMusica, relevo, dur, entera: r.entera, ...r.info });
      this.fase = 'armada';
    },

    // Mide el desfase real por un mismo nodo y corrige hasta dejarlo en cero. El
    // arranque a ojo se va entre 12 y 84 ms y cambia de una vez a otra.
    async alinear() {
      const c = Grafo.ctx;
      const sr = c.sampleRate;
      const v = Rep.video();
      const p = this.plan;
      Grafo.abrirToma();
      let cuando = c.currentTime + 0.1;
      let desde = v.currentTime + 0.1 - p.base;
      let fuente = this.lanzar(cuando, desde);
      p.fuentePrueba = fuente;

      for (let intento = 0; intento < 6; intento++) {
        // Se mide solo lo que llego despues de arrancar esta fuente: un bloque de
        // la anterior baja la correlacion y parece un fallo.
        Grafo.bloques = [];
        await esperar(350);
        for (let i = 0; i < 12 && Grafo.bloques.length < 8; i++) await esperar(50);
        if (this.fase !== 'alineando') return;
        if (Grafo.bloques.length < 8) continue;
        const { rep, cola } = Grafo.leerToma(8);
        const d = P.desfase(cola, rep, 7200);
        nota('alineacion', { intento, muestras: d.l, c: Number(d.c.toFixed(5)) });
        if (d.c < L.correlacionMinima) continue;
        if (d.l === 0) {
          p.ganancia = P.rms(rep) / (P.rms(cola) + 1e-9);
          p.ancla = { cuando, desde };
          p.fuente = fuente;
          p.fuentePrueba = null;
          this.fase = 'alineada';
          return;
        }
        const nueva = c.currentTime + 0.1;
        const pos = desde + (nueva - cuando) - d.l / sr;
        const otra = this.lanzar(nueva, pos);
        fuente.stop(nueva);
        p.fuentePrueba = otra;
        fuente = otra;
        cuando = nueva;
        desde = pos;
        await esperar(150);
      }
      this.rescate('alineacion inestable');
    },

    relevo() {
      const c = Grafo.ctx;
      const p = this.plan;
      const t = c.currentTime + 0.05;
      this.quitarEventos();
      Grafo.gT.gain.setValueAtTime(0, t);
      Grafo.gM.gain.setValueAtTime(1, t);
      Grafo.gT.gain.linearRampToValueAtTime(p.ganancia, t + 0.02);
      Grafo.gM.gain.linearRampToValueAtTime(0, t + 0.02);
      p.volumen = this.volumen();
      this.fase = 'cola';
      p.tRelevo = t;
      p.finCola = t + (p.pcm.duration - (p.ancla.desde + (t - p.ancla.cuando)));
      nota('relevo', { ganancia: Number(p.ganancia.toFixed(4)), ct: Rep.video().currentTime, restaCola: p.finCola - t });
      setTimeout(() => {
        if (this.fase !== 'cola') return;
        Grafo.cerrarToma();
        p.pedido = performance.now();
        Rep.llamar('nextVideo');
        nota('siguiente');
      }, 80);
    },

    fundir() {
      const c = Grafo.ctx;
      const p = this.plan;
      const t = c.currentTime + 0.02;
      const dura = Math.min(Ajustes.v.fundido, Math.max(1, p.finCola - t));
      const { sube, baja } = P.curvas(TRAMOS, P.razonDeVolumen(p.lkfs, Rep.lkfs()));
      const cola = baja.map((x) => x * p.ganancia);
      this.quitarEventos();
      this.trazar(Grafo.gM.gain, sube, t, dura);
      this.trazar(Grafo.gT.gain, cola, t, dura);
      p.curva = { sube, cola, t, dura };
      p.finFundido = t + dura;
      p.idNueva = Rep.id();
      this.fase = 'fundiendo';
      nota('fundido', { dura, entro: Math.round(performance.now() - p.pedido) });
    },

    // Cortar en mitad de un fundido: un cancel a secas volveria al valor anterior
    // de golpe, asi que se parte del punto de la curva en el que se va.
    cortar(motivo) {
      const c = Grafo.ctx;
      const p = this.plan;
      const t = c.currentTime + 0.01;
      let m = 0;
      let k = p.ganancia;
      if (p.curva) {
        const x = Math.min(1, Math.max(0, (t - p.curva.t) / p.curva.dura));
        const i = Math.round(x * (TRAMOS - 1));
        m = p.curva.sube[i];
        k = p.curva.cola[i];
      }
      this.quitarEventos();
      Grafo.gM.gain.setValueAtTime(m, t);
      Grafo.gT.gain.setValueAtTime(k, t);
      Grafo.gM.gain.linearRampToValueAtTime(1, t + 0.3);
      Grafo.gT.gain.linearRampToValueAtTime(0, t + 0.3);
      nota('corte', { motivo });
      const fuente = p.fuente;
      setTimeout(() => { try { fuente.stop(); } catch (e) { /* ya acabo */ } }, 400);
      p.fuente = null;
      this.limpiarPlan();
      this.fase = 'reposo';
    },

    terminar() {
      const t = Grafo.ctx.currentTime;
      this.quitarEventos();
      Grafo.gM.gain.setValueAtTime(1, t);
      Grafo.gT.gain.setValueAtTime(0, t);
      this.limpiarPlan();
      this.fase = 'reposo';
      nota('fin');
    },

    motivoAhora(v, dur) {
      return P.motivoParaNoMezclar({
        activa: Ajustes.v.activa,
        anuncio: Rep.anuncio(),
        duracion: dur,
        repetirUna: Rep.repetirUna(),
        velocidad: v.playbackRate,
        enDisco: Rep.enDisco(),
        mezclarDiscos: Ajustes.v.discos,
      });
    },

    // Un salto de posicion se ve como un reloj que no cuadra con el tiempo real.
    saltoDePosicion(ct) {
      const ahora = performance.now();
      const dt = (ahora - this.ultimoReloj) / 1000;
      const salto = this.ultimoReloj && Math.abs(ct - this.ultimoCt - dt) > 1.5;
      this.ultimoCt = ct;
      this.ultimoReloj = ahora;
      return !!salto;
    },

    pausaDelUsuario() {
      const c = Grafo.ctx;
      const enPausa = Rep.estado() === 2;
      if (enPausa && c.state === 'running') { this.pausadoPorNosotros = true; c.suspend(); }
      if (!enPausa && this.pausadoPorNosotros) { this.pausadoPorNosotros = false; c.resume(); }
    },

    volumen() {
      const v = Rep.video();
      return v.muted ? 0 : v.volume;
    },

    // El volumen del reproductor manda tambien en la cola. La ganancia medida en
    // la alineacion ya lo incluye: aqui solo se sigue lo que cambie despues.
    seguirVolumen() {
      const p = this.plan;
      if (!p || !p.volumen) return;
      Grafo.gV.gain.setTargetAtTime(this.volumen() / p.volumen, Grafo.ctx.currentTime, 0.02);
    },

    tick() {
      const v = Rep.video();
      if (!v) return;
      if (!Grafo.fuente || Grafo.video !== v) {
        if (!v.paused && !Rep.anuncio()) Grafo.enlazar();
        return;
      }
      if (Grafo.ctx.state === 'suspended' && !this.pausadoPorNosotros) Grafo.ctx.resume();

      const id = Rep.id();
      const ct = v.currentTime;
      const dur = v.duration;
      const salto = this.saltoDePosicion(ct);
      if (id !== this.idActual) { this.idActual = id; this.idDescartado = ''; this.motivo = ''; }

      switch (this.fase) {
        case 'reposo': {
          this.motivo = this.motivoAhora(v, dur) || (this.idDescartado === id ? this.motivo : '');
          if (this.motivoAhora(v, dur) || this.idDescartado === id || v.paused) return;
          if (ct < P.momentoDePreparar(dur, Ajustes.v.fundido)) return;
          if (ct > P.ultimoMomento(dur, Ajustes.v.fundido)) return;
          if (performance.now() < this.reintentoEn) return;
          this.fase = 'preparando';
          this.preparar(id, ct, dur).catch((e) => {
            // Un tramo que no se decodifica no condena la cancion: al segundo
            // siguiente ya hay mas bytes.
            nota('cola', { motivo: 'decodificacion', m: String(e), ct: Number(ct.toFixed(1)), dur });
            this.reintentoEn = performance.now() + 1000;
            if (this.fase === 'preparando') this.fase = 'reposo';
          });
          return;
        }
        case 'preparando': return;
        case 'armada':
        case 'alineando':
        case 'alineada': {
          const p = this.plan;
          if (id !== p.id) { this.descartar('cambio de cancion'); return; }
          const motivo = this.motivoAhora(v, dur);
          if (motivo) { this.descartar(motivo); return; }
          if (salto) { this.limpiarPlan(); this.fase = 'reposo'; return; }
          if (v.paused) {
            if (this.fase !== 'armada') { this.limpiarPlan(); this.fase = 'reposo'; }
            return;
          }
          if (this.fase === 'armada' && ct >= p.relevo - L.alineacion) {
            this.fase = 'alineando';
            this.alinear().catch((e) => this.rescate('alineacion: ' + e));
          }
          if (this.fase === 'alineada' && ct >= p.relevo) this.relevo();
          return;
        }
        case 'cola': {
          const p = this.plan;
          this.pausaDelUsuario();
          this.seguirVolumen();
          const t = Grafo.ctx.currentTime;
          if (t > p.finCola + 0.2) { this.terminar(); return; }
          if (!p.pedido || id === p.id) return;
          if (Rep.anuncio()) { this.cortar('anuncio'); return; }
          if (ct > 0.02 && !v.paused && v.readyState >= 3) {
            p.entrada = t;
            this.fase = 'entrada';
          }
          return;
        }
        case 'entrada': {
          const p = this.plan;
          this.pausaDelUsuario();
          this.seguirVolumen();
          const t = Grafo.ctx.currentTime;
          // Una intro con silencio se come el fundido: se espera a que suene algo.
          if (Grafo.nivelDb() > L.umbralEntradaDb || t - p.entrada > L.esperaEntrada || t > p.finCola - 1) this.fundir();
          return;
        }
        case 'fundiendo': {
          const p = this.plan;
          this.pausaDelUsuario();
          this.seguirVolumen();
          if (id !== p.idNueva) { this.cortar('otra cancion'); return; }
          if (Grafo.ctx.currentTime >= p.finFundido + 0.05) this.terminar();
          return;
        }
        default:
      }
    },
  };

  // --- Panel -----------------------------------------------------------------
  const svgNs = 'http://www.w3.org/2000/svg';
  // ESTILO DE LOS MODS (16-11-2026): el de la app del movil de Zen Remoto, con aire
  // de iOS. Lamina esmerilada de 18px, grupos redondeados con separadores finos,
  // interruptores de iOS con el acento rosa y la letra del sistema.
  const CSS = `
.zm-boton { width: 40px; height: 40px; margin: 0 2px; padding: 8px; border: 0; border-radius: 50%; background: none;
  color: rgb(255 255 255 / 0.7); cursor: pointer; flex: none; }
.zm-boton:hover { color: #fff; background: rgb(255 255 255 / 0.1); }
.zm-boton[data-activa="true"] { color: #fff; }
.zm-boton[data-fase="activa"] { color: #ff5c7a; }
.zm-boton svg { display: block; width: 24px; height: 24px; }
.zm-panel { position: fixed; z-index: 2147483000; width: 320px; padding: 14px 12px 12px; border-radius: 18px; box-sizing: border-box;
  background: rgb(30 30 32 / 0.92); backdrop-filter: blur(30px) saturate(1.8);
  border: 1px solid rgb(255 255 255 / 0.1); box-shadow: 0 24px 60px rgb(0 0 0 / 0.5);
  color: rgb(255 255 255 / 0.92); font: 400 14px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.zm-panel[hidden] { display: none; }
.zm-cabeza { padding: 2px 6px 12px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; color: #fff; }
.zm-seccion { margin: 16px 6px 6px; font-size: 12px; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; color: rgb(235 235 245 / 0.55); }
.zm-grupo { border-radius: 12px; background: rgb(255 255 255 / 0.06); overflow: hidden; }
.zm-fila { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 6px 12px; box-sizing: border-box; }
.zm-fila + .zm-fila::before, .zm-fila + .zm-deslizador::before, .zm-deslizador + .zm-fila::before {
  content: ''; position: absolute; top: 0; left: 12px; right: 0; height: 1px; background: rgb(255 255 255 / 0.08); }
.zm-deslizador { position: relative; padding: 2px 12px 12px; }
.zm-suave { color: rgb(235 235 245 / 0.6); font-variant-numeric: tabular-nums; }
.zm-panel input[type=range] { width: 100%; margin: 0; accent-color: #ff5c7a; }
.zm-panel input[type=checkbox] { -webkit-appearance: none; appearance: none; flex: none; position: relative; width: 42px; height: 26px; margin: 0;
  border-radius: 13px; background: rgb(120 120 128 / 0.36); cursor: pointer; transition: background-color 0.2s ease; }
.zm-panel input[type=checkbox]::after { content: ''; position: absolute; top: 2px; left: 2px; width: 22px; height: 22px; border-radius: 50%;
  background: #fff; box-shadow: 0 2px 4px rgb(0 0 0 / 0.3); transition: transform 0.22s cubic-bezier(0.3, 0.7, 0.4, 1); }
.zm-panel input[type=checkbox]:checked { background: #ff5c7a; }
.zm-panel input[type=checkbox]:checked::after { transform: translateX(16px); }
.zm-panel input:focus-visible { outline: 2px solid #ff5c7a; outline-offset: 2px; }
.zm-nota { margin: 10px 6px 0; color: #ffc46b; font-size: 13px; }
.zm-estado { margin: 10px 6px 0; color: rgb(235 235 245 / 0.6); font-size: 13px; }
@media (prefers-reduced-motion: reduce) { .zm-panel input[type=checkbox], .zm-panel input[type=checkbox]::after { transition: none; } }
`;

  const MOTIVOS = () => ({
    apagada: tr('Crossfade off', 'Mezcla apagada'),
    anuncio: tr('Paused during the ad', 'En pausa durante el anuncio'),
    corta: tr('This song is short or live: no crossfade', 'Esta canción es corta o en directo: no se mezcla'),
    'repetir una': tr('Repeat one: no crossfade', 'Repetir una: no se mezcla'),
    velocidad: tr('No crossfade at another playback speed', 'Con otra velocidad no se mezcla'),
    disco: tr('Full album: its gaps are kept', 'Disco completo: se respetan sus pausas'),
    'cola corta': tr("This song ends without crossfade: its ending didn't download in time", 'Esta canción termina sin mezcla: no se bajó a tiempo'),
  });

  const Panel = {
    boton: null, nodo: null, partes: {},

    crear(tag, clase, texto) {
      const n = document.createElement(tag);
      if (clase) n.className = clase;
      if (texto) n.textContent = texto;
      return n;
    },

    icono() {
      const s = document.createElementNS(svgNs, 'svg');
      s.setAttribute('viewBox', '0 0 24 24');
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', '2');
      s.setAttribute('stroke-linecap', 'round');
      for (const d of ['M3 17c6 0 12-10 18-10', 'M3 7c6 0 12 10 18 10']) {
        const p = document.createElementNS(svgNs, 'path');
        p.setAttribute('d', d);
        s.appendChild(p);
      }
      return s;
    },

    fila(izquierda, derecha) {
      const f = this.crear('label', 'zm-fila');
      f.appendChild(izquierda);
      f.appendChild(derecha);
      return f;
    },

    casilla(valor, alCambiar) {
      const c = this.crear('input');
      c.type = 'checkbox';
      c.checked = valor;
      c.addEventListener('change', () => alCambiar(c.checked));
      return c;
    },

    montarPanel() {
      const n = this.crear('div', 'zm-panel');
      n.hidden = true;
      n.appendChild(this.crear('div', 'zm-cabeza', tr('Crossfade', 'Mezcla entre canciones')));
      const g1 = this.crear('div', 'zm-grupo');
      n.appendChild(g1);
      g1.appendChild(this.fila(this.crear('span', null, tr('Blend songs', 'Mezclar canciones')), this.casilla(Ajustes.v.activa, (x) => {
        Ajustes.v.activa = x; Ajustes.guardar(); this.pintar();
      })));

      const dura = this.crear('span', 'zm-suave');
      this.partes.dura = dura;
      g1.appendChild(this.fila(this.crear('span', null, tr('Fade length', 'Duración del fundido')), dura));
      const r = this.crear('input');
      r.type = 'range';
      r.min = L.fundidoMin; r.max = L.fundidoMax; r.step = 1;
      r.value = Ajustes.v.fundido;
      r.setAttribute('aria-label', tr('Fade length in seconds', 'Duración del fundido en segundos'));
      r.addEventListener('input', () => { Ajustes.v.fundido = Number(r.value); Ajustes.guardar(); this.pintar(); });
      const caja = this.crear('div', 'zm-deslizador');
      caja.appendChild(r);
      g1.appendChild(caja);

      g1.appendChild(this.fila(this.crear('span', null, tr('Also on full albums', 'Mezclar también en discos')), this.casilla(Ajustes.v.discos, (x) => {
        Ajustes.v.discos = x; Ajustes.guardar(); this.pintar();
      })));

      n.appendChild(this.crear('div', 'zm-seccion', tr('Now playing', 'Lo que suena')));
      const g2 = this.crear('div', 'zm-grupo');
      n.appendChild(g2);
      for (const [clave, etiqueta] of [['calidad', tr('Quality', 'Calidad')], ['version', tr('Version', 'Versión')], ['volumen', tr('Loudness', 'Volumen')]]) {
        const v = this.crear('span', 'zm-suave');
        this.partes[clave] = v;
        g2.appendChild(this.fila(this.crear('span', null, etiqueta), v));
      }
      this.partes.nota = this.crear('div', 'zm-nota');
      n.appendChild(this.partes.nota);
      this.partes.estado = this.crear('div', 'zm-estado');
      n.appendChild(this.partes.estado);
      document.body.appendChild(n);
      this.nodo = n;
      document.addEventListener('pointerdown', (e) => {
        if (n.hidden || n.contains(e.target) || (this.boton && this.boton.contains(e.target))) return;
        n.hidden = true;
      }, true);
    },

    textoEstado() {
      if (!Grafo.fuente) return tr('Connects when the first song plays', 'Se conecta al sonar la primera canción');
      if (['alineando', 'alineada', 'cola', 'entrada', 'fundiendo'].includes(D.fase)) return tr('Blending', 'Mezclando');
      if (D.motivo) return MOTIVOS()[D.motivo] || tr('This song ends without crossfade', 'Esta canción termina sin mezcla');
      return Ajustes.v.activa ? tr('Ready to blend', 'Lista para mezclar') : MOTIVOS().apagada;
    },

    pintar() {
      if (this.boton) {
        this.boton.dataset.activa = String(Ajustes.v.activa);
        this.boton.dataset.fase = ['cola', 'entrada', 'fundiendo'].includes(D.fase) ? 'activa' : 'quieta';
      }
      if (!this.nodo || this.nodo.hidden) return;
      const f = Rep.formato();
      const l = Rep.lkfs();
      const ver = Rep.version();
      this.partes.dura.textContent = Ajustes.v.fundido + ' s';
      this.partes.calidad.textContent = f.itag ? `${f.nombre}, ${f.kbps ? '~' + f.kbps + ' kbps' : 'itag ' + f.itag}` : '—';
      this.partes.version.textContent = ver === 'estudio' ? tr('Studio track', 'Pista de estudio') : ver === 'video' ? tr('Music video', 'Vídeo') : '—';
      this.partes.volumen.textContent = Number.isFinite(l) ? tr(l.toFixed(1), l.toFixed(1).replace('.', ',')) + ' LKFS' : '—';
      let aviso = '';
      if (f.itag && !f.alMaximo) aviso = tr('Below the best quality. Check the audio quality in YouTube Music settings.', 'Por debajo del máximo. Mira la calidad de audio en los ajustes de YouTube Music.');
      else if (ver === 'video') aviso = tr("This is the video's audio: the studio track may sound better.", 'Es el audio del vídeo: la pista de estudio puede sonar mejor.');
      this.partes.nota.textContent = aviso;
      this.partes.nota.hidden = !aviso;
      this.partes.estado.textContent = this.textoEstado();
    },

    colocar() {
      const r = this.boton.getBoundingClientRect();
      this.nodo.style.right = Math.max(8, innerWidth - r.right - 8) + 'px';
      this.nodo.style.bottom = Math.max(8, innerHeight - r.top + 8) + 'px';
    },

    ponerBoton() {
      const barra = document.querySelector('ytmusic-player-bar #right-controls, ytmusic-player-bar .right-controls');
      if (!barra || (this.boton && this.boton.isConnected)) return;
      if (!this.nodo) {
        const st = this.crear('style');
        st.textContent = CSS;
        document.documentElement.appendChild(st);
        this.montarPanel();
      }
      const b = this.boton || this.crear('button', 'zm-boton');
      if (!this.boton) {
        b.type = 'button';
        b.title = tr('Crossfade', 'Mezcla entre canciones');
        b.setAttribute('aria-label', tr('Crossfade', 'Mezcla entre canciones'));
        b.appendChild(this.icono());
        b.addEventListener('click', (e) => {
          // ytmusic-player-bar abre y cierra el reproductor grande con cualquier clic
          // que le llegue en burbuja (medido el 16-11-2026 con un raton real por
          // BiDi). El boton corta la propagacion: pulsarlo solo hace lo suyo.
          e.stopPropagation();
          this.nodo.hidden = !this.nodo.hidden;
          if (!this.nodo.hidden) { this.colocar(); this.pintar(); }
        });
      }
      const menu = barra.querySelector('#expanding-menu');
      if (menu && menu.parentElement === barra) barra.insertBefore(b, menu);
      else barra.insertBefore(b, barra.firstChild);
      this.boton = b;
      this.pintar();
    },
  };

  // --- Arranque --------------------------------------------------------------
  Ajustes.cargar();
  Captura.instalar();

  const paso = () => {
    try { D.tick(); } catch (e) { D.rescate('tick: ' + e); }
  };
  setInterval(paso, 100);
  setInterval(() => {
    try { Panel.ponerBoton(); Panel.pintar(); } catch (e) { nota('error', { en: 'panel', m: String(e) }); }
  }, 1000);

  // Por si el contexto necesitaba un gesto del usuario para arrancar.
  addEventListener('pointerdown', () => {
    if (Grafo.ctx && Grafo.ctx.state === 'suspended' && !D.pausadoPorNosotros) Grafo.ctx.resume();
  }, { capture: true, passive: true });

  window.__zenMezcla = Object.freeze({
    estado: () => ({
      fase: D.fase,
      motivo: D.motivo,
      enlazado: !!Grafo.fuente,
      contexto: Grafo.ctx ? Grafo.ctx.state : null,
      ajustes: { ...Ajustes.v },
      formato: Rep.formato(),
      version: Rep.version(),
      lkfs: Rep.lkfs(),
      captura: (Captura.actual(Rep.video() ? Rep.video().currentTime : NaN) || {}).tipo || null,
      ganancias: Grafo.ctx ? { m: Grafo.gM.gain.value, t: Grafo.gT.gain.value, v: Grafo.gV.gain.value } : null,
    }),
    registro: () => registro.slice(),
    simularSinFinal: (s) => { Cola.sinUltimos = Number(s) || 0; },
  });
  nota('arranque');
})();
