/* --- Vista mini tira ------------------------------------------------ MEDIDO -
   Dos lineas flotando sobre la barra del reproductor: la que suena y la que
   viene. Para cuando estas navegando por la aplicacion y no quieres abrir la
   letra, pero la quieres ver.

   NO ES UNA ESCENA CON DOS LINEAS. La Escena es una lista larga que se desplaza,
   y aqui no hay desplazamiento: hay dos huecos fijos donde el texto se
   reemplaza. Reutilizarla obligaria a apagarle el scroll, el aire, la mascara y
   la mitad de su comportamiento — mas trabajo que escribir las cuarenta lineas
   que hacen falta. Lo que si comparte es la interfaz que espera el Motor
   (poner, pintar, mostrar), asi que el bucle la trata igual que a las demas sin
   saber que es distinta.

   La altura sale del alto real de ytmusic-player-bar (72px medidos) y no de un
   numero escrito a mano, para que siga en su sitio si YTM cambia la barra. */

const CSS_TIRA = `
.zen-letra-tira {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  max-width: min(832px, 68vw);
  padding: 10px 22px;
  border-radius: 14px;
  background: rgb(8 9 11 / 0.72);
  backdrop-filter: blur(26px) saturate(130%);
  border: 1px solid rgb(255 255 255 / 0.08);
  font-family: Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
  text-align: center;
  /* Que no se coma los clics de lo que hay debajo. La tira es informativa; solo
     su propio contenido responde al raton. */
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.zen-letra-tira[data-hay="1"] { opacity: 1; }

.zen-letra-tira-ahora {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  line-height: 1.3;
  color: rgb(255 255 255 / 0.34);
  text-shadow: 0 1px 10px rgb(0 0 0 / 0.6);
}
.zen-letra-tira-luego {
  font-size: 13px; font-weight: 500;
  line-height: 1.3;
  color: rgb(255 255 255 / 0.32);
  text-shadow: 0 1px 10px rgb(0 0 0 / 0.6);
}
.zen-letra-tira .zen-letra-p {
  background-image: linear-gradient(90deg,
    rgb(255 255 255 / 0.97) 0%, rgb(255 255 255 / 0.97) var(--f, 0%),
    rgb(255 255 255 / 0.34) var(--f, 0%), rgb(255 255 255 / 0.34) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
@media (prefers-reduced-motion: reduce) {
  .zen-letra-tira { transition: none; }
}
`;

LV.hojas.push(CSS_TIRA);

class Tira {
  constructor() {
    this.nombre = 'tira';
    this.raiz = null;
    this.lineaDeTiempo = null;
    this.visible = false;
    this.iActiva = -1;
  }

  construir() {
    if (this.raiz) return this.raiz;
    this.raiz = crear('div', c('tira'));
    this.raiz.dataset.vista = 'tira';
    this.ahora = crear('div', c('tira-ahora'));
    this.luego = crear('div', c('tira-luego'));
    this.raiz.appendChild(this.ahora);
    this.raiz.appendChild(this.luego);
    return this.raiz;
  }

  poner(estado) {
    this.construir();
    this.lineaDeTiempo = estado.clave === 'lista' ? estado.lineaDeTiempo : null;
    this.iActiva = -1;
    this.raiz.dataset.hay = this.lineaDeTiempo ? '1' : '0';
    if (!this.lineaDeTiempo) { this.ahora.textContent = ''; this.luego.textContent = ''; }
    this._colocar();
    Motor.despertar();
  }

  _colocar() {
    const barra = punto('barra');
    const alto = barra ? barra.offsetHeight : 72;
    this.raiz.style.bottom = `${alto + 12}px`;
  }

  pintar(t) {
    if (!this.lineaDeTiempo || !this.visible) return;
    const lineas = this.lineaDeTiempo.lineas;
    const i = limitar(lineaEn(lineas, t), 0, lineas.length - 1);

    if (i !== this.iActiva) {
      this.iActiva = i;
      this._texto(lineas, i);
      this._colocar();
    }

    /* El relleno, solo en la de arriba. La siguiente no se rellena: es un
       adelanto, no algo que este sonando. */
    const linea = lineas[i];
    if (!linea.palabras || linea.interludio || Ajustes.get('porPalabra') === false) return;
    const spans = this.ahora.querySelectorAll(`.${c('p')}`);
    for (let k = 0; k < linea.palabras.length && k < spans.length; k++) {
      const p = linea.palabras[k];
      const f = t >= p.fin ? 100 : t <= p.inicio ? 0 : Math.round(((t - p.inicio) / Math.max(0.001, p.fin - p.inicio)) * 100);
      if (spans[k]._f !== f) { spans[k].style.setProperty('--f', `${f}%`); spans[k]._f = f; }
    }
  }

  _texto(lineas, i) {
    const linea = lineas[i];
    this.ahora.textContent = '';

    if (linea.interludio) {
      /* En un interludio la tira no se queda vacia: adelanta lo que viene, que es
         mas util que tres puntos en un espacio de dos lineas. */
      this.ahora.textContent = '· · ·';
    } else if (linea.palabras && Ajustes.get('porPalabra') !== false) {
      for (let k = 0; k < linea.palabras.length; k++) {
        this.ahora.appendChild(crear('span', c('p'), { textContent: linea.palabras[k].texto }));
        if (k < linea.palabras.length - 1) this.ahora.appendChild(document.createTextNode(' '));
      }
    } else {
      this.ahora.textContent = linea.texto;
    }

    const siguiente = lineas.slice(i + 1).find((l) => !l.interludio && l.texto);
    this.luego.textContent = siguiente ? siguiente.texto : '';
  }

  mostrar(v) {
    this.visible = v;
    if (this.raiz) this.raiz.style.display = v ? '' : 'none';
    if (v) { this.iActiva = -1; this._colocar(); Motor.despertar(); }
  }
}

Vistas.registrar('tira', {
  /* Al body y no a ytmusic-app: la tira es fija respecto a la ventana y no
     necesita nada de la jerarquia de la aplicacion, asi que cuanto mas arriba
     cuelgue, menos posibilidades hay de que Polymer se la lleve. */
  anfitrion: () => document.body,
  /* No exclusiva: la tira acompana a cualquier otra vista, o va sola mientras
     navegas. Es la unica que convive. */
  exclusiva: false,
  fijo: true,
  crear: () => new Tira(),
  colocar: (raiz, anfitrion) => { anfitrion.appendChild(raiz); },
});
