/* --- El motor de pintado --------------------------------------------------
   Una Escena es una caja con la letra dentro. Hay cuatro vistas y todas usan la
   misma Escena con distinto tamano y sitio; la mini tira es la excepcion y va
   aparte, porque no es una lista con scroll sino dos lineas.

   TRES DECISIONES DE RENDIMIENTO, porque esto corre en cada frame mientras suena
   musica y tiene que costar practicamente nada:

   1. EL DESPLAZAMIENTO SE MUEVE AL CAMBIAR DE LINEA, NO EN CADA FRAME. La
      tentacion es recalcular el translate continuamente para que la letra suba
      suave. Es al reves: si se escribe transform en cada frame, el navegador no
      puede interpolar nada y el movimiento sale peor, ademas de costar un
      recalculo de estilo por frame. Se escribe una vez por linea y lo interpola
      la transicion CSS con su easing.

   2. SOLO SE TOCAN LAS PALABRAS DE LA LINEA ACTIVA. Las demas no tienen
      degradado (lo apaga el CSS), asi que escribirles --f no haria nada visible y
      si costaria. Y dentro de la activa solo se escribe la palabra cuyo relleno
      ha cambiado.

   3. EL BUCLE SE PARA. Sin nada que pintar — en pausa, sin letra, sin vista
      abierta — no hay rAF pedido. Un bucle vacio a 60fps en un reproductor de
      musica que se deja abierto horas es bateria regalada. */

const FOCO = 0.42;   // a que altura de la caja se centra la linea que suena

class Escena {
  constructor(nombre, opciones = {}) {
    this.nombre = nombre;
    this.opciones = opciones;
    this.raiz = null;
    this.pista = null;
    this.nodos = [];
    this.lineaDeTiempo = null;
    this.iActiva = -1;
    this.iPalabra = -1;
    this.visible = false;
  }

  construir() {
    if (this.raiz) return this.raiz;

    this.raiz = crear('div', `${c('raiz')} ${this.opciones.clase || ''}`.trim());
    this.raiz.dataset.vista = this.nombre;
    if (this.opciones.velo) this.raiz.classList.add(c('velo'));
    if (this.opciones.mascara !== false) this.raiz.dataset.mascara = '1';
    this.aplicarTamano();

    this.pista = crear('div', c('pista'));
    this.raiz.appendChild(this.pista);

    this.pie = crear('div', c('pie'));
    this.raiz.appendChild(this.pie);

    /* Pulsar una linea salta a ella. Es la funcion que uno espera de una letra
       sincronizada en cuanto la ve correr, y sale gratis: ya sabemos el tiempo de
       cada linea. Se delega en la pista y no se pone un oyente por linea. */
    this.pista.addEventListener('click', (e) => {
      const l = e.target.closest(`.${c('l')}`);
      if (!l || l.dataset.int === '1') return;
      const i = Number(l.dataset.i);
      const linea = this.lineaDeTiempo && this.lineaDeTiempo.lineas[i];
      if (!linea) return;
      /* Se le suma el desfase porque el tiempo de la linea esta en tiempo de
         letra y el reloj del video esta en tiempo de audio. Sin esto, en una
         cancion con desfase ajustado, pulsar una linea salta al sitio de al lado. */
      Reloj.buscar(linea.inicio + Letra.desfase() - 0.15);
      Motor.despertar();
    });

    /* Si cambia el tamano de la caja, el centrado calculado ya no vale. Pasa al
       abrir y cerrar la barra lateral de YTM y al cambiar de vista. */
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { this._ajustarAire(); this.iActiva = -1; Motor.despertar(); }).observe(this.raiz);
    }

    return this.raiz;
  }

  /* EL TAMANO ES UN FACTOR, NO UN NUMERO POR VISTA -------------------- MEDIDO -
     Antes cada vista traia su tamano fijo en rem y el ajuste del menu los pisaba
     todos con el mismo valor: subir la letra del escenario ponia el panel, que es
     una columna estrecha, a la misma medida que una vista a pantalla completa.

     Ahora la vista declara su PROPORCION respecto al tamano que elige el usuario
     — el escenario es la referencia, el panel la mitad, la pantalla completa un
     tercio mas — y el ajuste mueve las cuatro a la vez sin descuadrar ninguna. */
  aplicarTamano() {
    if (!this.raiz) return;
    const factor = this.opciones.factor || 1;
    const base = Ajustes.get('tamano') || 44;
    this.raiz.style.setProperty('--zl-tamano', `${Math.round(base * factor)}px`);
  }

  /* El aire de arriba y de abajo va en pixeles y calculado desde el alto real,
     por lo dicho en 70-estilos.js: en porcentaje se resolveria contra el ancho.
     Arriba, lo que hace falta para que la primera linea pueda subir hasta el punto
     de foco; abajo, lo que sobra para que la ultima tambien llegue en lugar de
     quedarse a media caja. */
  _ajustarAire() {
    if (!this.pista || !this.raiz) return;
    const alto = this.raiz.clientHeight;
    if (!alto) return;
    this.pista.style.paddingTop = `${Math.round(alto * FOCO)}px`;
    this.pista.style.paddingBottom = `${Math.round(alto * (1 - FOCO))}px`;
  }

  /* Rehace el contenido. Se llama al cambiar de cancion o de estado, nunca en un
     frame. */
  poner(estado) {
    this.construir();
    this.lineaDeTiempo = estado.clave === 'lista' || estado.clave === 'plano' ? estado.lineaDeTiempo : null;
    this.iActiva = -1;
    this.iPalabra = -1;
    this.pista.textContent = '';
    this.nodos = [];
    const avisoViejo = this.raiz.querySelector(`.${c('aviso')}`);
    if (avisoViejo) avisoViejo.remove();

    if (!this.lineaDeTiempo) { this._pintarAviso(estado); this._pintarPie(estado); return; }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.lineaDeTiempo.lineas.length; i++) {
      const linea = this.lineaDeTiempo.lineas[i];
      const nodo = crear('div', c('l'));
      nodo.dataset.i = String(i);

      if (linea.interludio) {
        nodo.dataset.int = '1';
        for (let k = 0; k < 3; k++) nodo.appendChild(crear('i'));
      } else if (linea.palabras && Ajustes.get('porPalabra') !== false && estado.clave === 'lista') {
        for (let k = 0; k < linea.palabras.length; k++) {
          const p = crear('span', c('p'), { textContent: linea.palabras[k].texto });
          nodo.appendChild(p);
          if (k < linea.palabras.length - 1) nodo.appendChild(document.createTextNode(' '));
        }
      } else {
        nodo.textContent = linea.texto;
      }

      frag.appendChild(nodo);
      this.nodos.push(nodo);
    }
    this.pista.appendChild(frag);

    /* La letra plana no corre: se deja legible y quieta, y el pie explica por
       que. Fingir un desplazamiento sobre tiempos que no existen es peor que no
       tenerlos. */
    if (estado.clave === 'plano') {
      this.pista.style.transform = 'translateY(0)';
      this.pista.style.transition = 'none';
      this.raiz.style.overflowY = 'auto';
      for (const n of this.nodos) { n.dataset.e = 'pasada'; n.style.cursor = 'default'; }
    } else {
      this.pista.style.transition = '';
      this.raiz.style.overflowY = 'hidden';
    }

    this._ajustarAire();
    this._pintarPie(estado);
    Motor.despertar();
  }

  _pintarAviso(estado) {
    const aviso = crear('div', c('aviso'));
    if (estado.clave === 'buscando') {
      aviso.appendChild(crear('div', c('girando')));
      aviso.appendChild(crear('div', null, { textContent: 'Buscando la letra' }));
    } else if (estado.clave === 'instrumental') {
      aviso.appendChild(crear('b', null, { textContent: 'Instrumental' }));
      aviso.appendChild(crear('small', null, { textContent: 'La base de datos dice que este tema no tiene letra' }));
    } else if (estado.clave === 'sin-letra') {
      aviso.appendChild(crear('b', null, { textContent: 'Sin letra' }));
      aviso.appendChild(crear('small', null, { textContent: 'Nadie tiene la letra cronometrada de este tema. Si el titulo trae adornos, a veces cambiando de version de la cancion aparece.' }));
    } else {
      aviso.appendChild(crear('small', null, { textContent: 'Pon algo y la letra sale aqui' }));
    }
    this.raiz.appendChild(aviso);
  }

  _pintarPie(estado) {
    if (!this.pie) return;
    this.pie.textContent = '';
    if (estado.clave === 'vacio' || estado.clave === 'buscando') return;

    /* Que ponga AUTOMATICOS cuando lo son no es un detalle: ese texto sale de
       reconocer voz cantada y se equivoca. Diciendolo, una palabra rara se lee
       como lo que es; callandolo, parece que el mod trae la letra mal. */
    const de = {
      lrclib: 'LRCLIB',
      'lrclib-plano': 'LRCLIB, sin cronometrar',
      musixmatch: 'Musixmatch, palabra a palabra',
      youtube: 'Subtitulos de YouTube',
      'youtube-auto': 'Subtitulos automaticos de YouTube',
    };
    const fuente = de[estado.fuente] || estado.fuente || '';
    if (fuente) this.pie.appendChild(crear('span', null, { textContent: fuente }));
    if (estado.mensaje) this.pie.appendChild(crear('span', null, { textContent: `— ${estado.mensaje}` }));

    this.desfaseNodo = crear('span', c('desfase'));
    this.pie.appendChild(this.desfaseNodo);
    this._pintarDesfase();
  }

  _pintarDesfase() {
    if (!this.desfaseNodo) return;
    const d = Letra.desfase();
    this.desfaseNodo.textContent = Math.abs(d) < 0.001 ? '' : `${d > 0 ? '+' : ''}${d.toFixed(1)}s`;
  }

  /* El frame. `t` ya viene en tiempo de letra: el desfase se resto fuera. */
  pintar(t, hubaSalto) {
    if (!this.lineaDeTiempo || !this.visible) return;
    const lineas = this.lineaDeTiempo.lineas;

    const i = limitar(lineaEn(lineas, t), 0, lineas.length - 1);

    if (i !== this.iActiva) {
      this._cambiarLinea(i, hubaSalto);
      this.iActiva = i;
      this.iPalabra = -1;
      this._pintarDesfase();
    }

    this._pintarRelleno(lineas[i], t);
  }

  _cambiarLinea(i, hubaSalto) {
    /* Con un salto de barra no se recorre el camino con easing: se aparece. Un
       easing de 0.7s recorriendo cuarenta lineas es un borron que marea. */
    this.raiz.dataset.salto = hubaSalto ? '1' : '0';

    for (let k = 0; k < this.nodos.length; k++) {
      const n = this.nodos[k];
      const e = k < i ? 'pasada' : k === i ? 'activa' : 'futura';
      if (n.dataset.e !== e) n.dataset.e = e;
      if (e === 'futura') {
        /* La distancia se topa: mas alla de seis lineas el desenfoque ya no
           aumenta nada visible y el blur es caro. */
        const d = Math.min(k - i, 6);
        n.style.setProperty('--d', String(d));
      } else if (n.style.getPropertyValue('--d')) {
        n.style.removeProperty('--d');
      }
      /* Las que quedan lejos por detras se pueden dejar de pintar del todo. Con
         una letra larga esto quita del compositor la mayoria de los nodos. */
      const lejos = Math.abs(k - i) > 14;
      if (lejos !== (n.style.contentVisibility === 'hidden')) n.style.contentVisibility = lejos ? 'hidden' : '';
    }

    const activa = this.nodos[i];
    if (!activa) return;
    const alto = this.raiz.clientHeight || 1;
    const destino = activa.offsetTop + activa.offsetHeight / 2 - alto * FOCO;
    this.pista.style.transform = `translateY(${-Math.max(0, destino).toFixed(1)}px)`;

    if (hubaSalto) {
      /* Devolver la transicion en el frame siguiente: si se devuelve ya, el
         navegador coge el cambio de transform y el de transition juntos y anima
         el salto igualmente. */
      requestAnimationFrame(() => { if (this.raiz) this.raiz.dataset.salto = '0'; });
    }
  }

  _pintarRelleno(linea, t) {
    const nodo = this.nodos[this.iActiva];
    if (!nodo) return;

    if (linea.interludio) {
      /* Los tres puntos se encienden repartiendo el hueco. Es lo que dice que la
         cancion sigue viva cuando no hay nada que cantar. */
      const total = Math.max(0.1, linea.fin - linea.inicio);
      const avance = limitar((t - linea.inicio) / total, 0, 1);
      const puntos = nodo.children;
      for (let k = 0; k < puntos.length; k++) {
        const on = avance > (k + 1) / (puntos.length + 1) ? '1' : '0';
        if (puntos[k].dataset.on !== on) puntos[k].dataset.on = on;
      }
      return;
    }

    if (!linea.palabras || Ajustes.get('porPalabra') === false) return;

    const palabras = linea.palabras;
    const spans = nodo.querySelectorAll(`.${c('p')}`);
    if (!spans.length) return;

    for (let k = 0; k < palabras.length && k < spans.length; k++) {
      const p = palabras[k];
      let f;
      if (t >= p.fin) f = 100;
      else if (t <= p.inicio) f = 0;
      else f = ((t - p.inicio) / Math.max(0.001, p.fin - p.inicio)) * 100;

      /* Solo se escribe si el valor cambio de verdad. Redondear a un entero es
         lo que hace que en la practica se escriba una sola palabra por frame en
         lugar de todas. */
      const redondo = f === 0 || f === 100 ? f : Math.round(f);
      if (spans[k]._f !== redondo) {
        spans[k].style.setProperty('--f', `${redondo}%`);
        spans[k]._f = redondo;
      }
    }
  }

  mostrar(v) {
    this.visible = v;
    if (this.raiz) this.raiz.style.display = v ? '' : 'none';
    if (v) { this.iActiva = -1; Motor.despertar(); }
  }
}

/* --- El bucle -------------------------------------------------------------- */

const Motor = {
  escenas: new Set(),
  _pedido: 0,
  _huboSalto: false,

  anadir(e) { this.escenas.add(e); return e; },
  quitar(e) { this.escenas.delete(e); },

  arrancar() {
    Letra.alCambiar((estado) => {
      for (const e of this.escenas) e.poner(estado);
      this.despertar();
    });
    /* Un cambio de desfase no rehace nada: repinta el indicador y obliga a
       recolocar la vista en el frame siguiente, poniendo la linea activa a -1
       para que se recalcule cual es y donde va. */
    Letra.alDesfase(() => {
      for (const e of this.escenas) {
        if (e._pintarDesfase) e._pintarDesfase();
        e.iActiva = -1;
      }
      this.despertar();
    });

    Reloj.alSaltar(() => { this._huboSalto = true; this.despertar(); });
    /* Al pausar hay que dar un frame mas: el ultimo relleno se queda a medias si
       se corta el bucle justo al pausar. */
    const v = Reloj.video();
    if (v) for (const ev of ['play', 'pause', 'seeked', 'ratechange']) v.addEventListener(ev, () => this.despertar());
  },

  despertar() {
    if (this._pedido) return;
    this._pedido = requestAnimationFrame(() => { this._pedido = 0; this._frame(); });
  },

  _frame() {
    const activas = [...this.escenas].filter((e) => e.visible);
    if (!activas.length) return;                  // nada abierto: no se sigue

    const t = Reloj.tiempo() - Letra.desfase();
    const salto = this._huboSalto;
    this._huboSalto = false;

    for (const e of activas) {
      try { e.pintar(t, salto); } catch (err) { warn('pintando', e.nombre, err); }
    }

    /* Se sigue solo si hay algo que se mueva. En pausa el relleno esta quieto,
       asi que no hace falta otro frame; al reanudar, el oyente de `play`
       despierta el bucle. */
    const sonando = Reloj.estado() === 'sonando';
    const conLetra = activas.some((e) => e.lineaDeTiempo);
    if (sonando && conLetra) this.despertar();
  },
};
