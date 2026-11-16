/* --- Los estilos ----------------------------------------------------------
   Una sola hoja para las cuatro vistas. Se inyecta en la pagina, no en
   userContent.css, por dos razones: el CSS de usuario no puede depender de una
   variable que cambia sesenta veces por segundo, y porque asi el mod es una sola
   pieza que se instala sola.

   EL RELLENO SE HACE CON background-clip:text Y NO CON DOS CAPAS SUPERPUESTAS.
   La alternativa clasica es pintar la palabra dos veces, una apagada y otra
   encendida recortada con clip-path. Funciona, pero duplica el texto en el arbol
   y en el arbol de accesibilidad, y con una letra de 80 lineas eso es el doble de
   nodos para nada. Con un degradado de dos paradas duras sobre el mismo nodo, el
   corte esta donde diga --f y el texto sigue siendo uno.

   EL CONTRASTE ES EL DE SIEMPRE EN ESTE REPO. La ventana es de cristal y por
   debajo puede pasar cualquier cosa, incluida una caratula clara. Texto blanco
   sobre eso no se lee, asi que las vistas grandes llevan su propio velo oscuro
   con blur, igual que la barra del reproductor, y el texto lleva sombra: sin la
   sombra, la palabra apagada al 30% desaparece del todo sobre un fondo claro. */

const CSS = `
/* TODAS LAS MEDIDAS DE TEXTO VAN EN PIXELES ------------------------- MEDIDO -
   Esta hoja estuvo escrita en rem, que es lo razonable en una pagina propia. Aqui
   no: YouTube Music pone el tamano de raiz del documento en 10px, no en los 16px
   de fabrica — es un truco viejo para que 1rem sea 10px y las cuentas salgan
   redondas. Consecuencia: TODO lo que escribimos en rem se renderizaba al 62.5%
   de lo disenado. Medido: --zl-tamano en 3rem daba 30px de texto, el pie de
   0.68rem daba 6.8px y la mini tira 10.5px.

   El sintoma es "se ve muy pequeno", que parece cuestion de gusto y no lo era. En
   pixeles, lo que decide el tamano es esta hoja y no lo que la pagina anfitriona
   haga con su raiz. */
.zen-letra-raiz {
  --zl-on: rgb(255 255 255 / 0.97);
  --zl-off: rgb(255 255 255 / 0.32);
  --zl-pasado: rgb(255 255 255 / 0.40);
  --zl-tamano: 44px;
  --zl-easing: cubic-bezier(0.22, 0.61, 0.24, 1);
  font-family: Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
  color: var(--zl-on);
  overflow: hidden;
  position: relative;
  contain: paint;
}

/* El velo. Blur mas tinte, no solo blur: difuminar una caratula clara devuelve
   un borron claro y el texto blanco sigue sin leerse. Mismo razonamiento y
   misma receta que la barra del reproductor en mods/appearance/acrylic-glass/web/50-sites.css. */
.zen-letra-velo {
  background: rgb(10 10 12 / 0.58);
  backdrop-filter: blur(34px) saturate(135%);
}

/* --- El panel TAPA, no flota ------------------------------------- MEDIDO -
   Probado con velo translucido y esta mal: por debajo del panel esta la lista de
   "A continuacion" de YouTube Music, con su titulo y sus miniaturas, y al 58% de
   tinte se leian las dos cosas a la vez. No es cuestion de subir el tinte hasta
   que tape — el panel SUSTITUYE el contenido de la pestana, asi que ese contenido
   se esconde mientras esta puesto.

   Con visibility y no con display: display:none saca el nodo del flujo y Polymer
   recalcula la pestana entera al volver, con su parpadeo. visibility lo deja donde
   esta, invisible y sin poder recibir el raton. */
ytmusic-player-page[zen-letra-panel] #tab-renderer { visibility: hidden !important; }

.zen-letra-panel {
  background: rgb(8 9 11 / 0.88);
  backdrop-filter: blur(30px) saturate(130%);
  /* Un poco mas de luz que en las vistas grandes: la tipografia del panel es
     pequena y al 32% de blanco una linea de 1.3rem no se lee. */
  --zl-off: rgb(255 255 255 / 0.40);
  --zl-pasado: rgb(255 255 255 / 0.46);
}
.zen-letra-panel .zen-letra-l { opacity: 0.42; }
.zen-letra-panel .zen-letra-l[data-e="futura"] { opacity: calc(0.42 - var(--d, 0) * 0.04); }

/* El aire de arriba y de abajo — el que permite que la primera y la ultima linea
   lleguen al punto de foco — lo pone el motor en pixeles, NO aqui en porcentaje.
   Medido: un padding en porcentaje se resuelve contra el ANCHO del contenedor
   tambien en vertical, asi que un 45% arriba y abajo en una caja de 413x726 daba
   186px en lugar de 327, y la linea activa se centraba al 25% de la altura en
   lugar de al 42%. Es de esas reglas que parecen funcionar porque el numero que
   sale es plausible.

   (Y ojo con los comentarios de aqui dentro: esto es una plantilla de JavaScript,
   asi que una comilla invertida la cierra. Lo caza node --check en el build.) */
.zen-letra-pista {
  will-change: transform;
  transition: transform 0.72s var(--zl-easing);
  padding: 0;
}
.zen-letra-raiz[data-salto="1"] .zen-letra-pista { transition: none; }

/* --- Una linea ----------------------------------------------------------- */
.zen-letra-l {
  font-size: var(--zl-tamano);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.22;
  margin: 0 0 0.62em;
  padding: 0.06em 0.1em;
  color: var(--zl-off);
  text-shadow: 0 1px 14px rgb(0 0 0 / 0.55);
  transform-origin: left center;
  transition: opacity 0.5s var(--zl-easing), filter 0.5s var(--zl-easing), transform 0.5s var(--zl-easing);
  cursor: pointer;
  opacity: 0.34;
}
.zen-letra-l:hover { opacity: 0.75; }

/* Ya cantadas: se quedan encendidas pero atras. Sin desenfoque, porque lo que
   uno mira cuando vuelve la vista es la linea de antes, no la de despues. */
.zen-letra-l[data-e="pasada"] { color: var(--zl-pasado); opacity: 0.5; }

/* La que suena. El salto de escala es pequeno a proposito: mas de esto y el
   texto se mueve tanto al cambiar de linea que cuesta leerlo. */
.zen-letra-l[data-e="activa"] {
  opacity: 1;
  transform: scale(1.028);
  filter: none;
}

/* Las de mas adelante se van desenfocando con la distancia, que es lo que hace
   que la vista caiga sola en la linea que suena. --d lo pone el motor. */
.zen-letra-l[data-e="futura"] {
  opacity: calc(0.34 - var(--d, 0) * 0.045);
  filter: blur(calc(var(--d, 0) * 0.7px));
}

.zen-letra-p {
  background-image: linear-gradient(90deg,
    var(--zl-on) 0%, var(--zl-on) var(--f, 0%),
    var(--zl-off) var(--f, 0%), var(--zl-off) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  /* El relleno de la palabra activa se anima solo dentro de la palabra: la
     transicion tapa el escalon entre frame y frame cuando el video da un valor
     de tiempo a saltos. */
  transition: none;
}
/* Cuando la linea no es la activa no hace falta degradado: pintar 80 lineas con
   background-clip cuesta, y solo una necesita el corte. */
.zen-letra-l:not([data-e="activa"]) .zen-letra-p {
  background-image: none;
  color: inherit;
}

/* --- Interludio: el latido de espera ------------------------------------- */
.zen-letra-l[data-int="1"] { display: flex; gap: 0.34em; align-items: center; cursor: default; }
.zen-letra-l[data-int="1"] i {
  width: 0.34em; height: 0.34em; border-radius: 50%;
  background: var(--zl-off);
  transform: scale(0.8);
  transition: background-color 0.25s linear, transform 0.25s var(--zl-easing);
}
.zen-letra-l[data-int="1"] i[data-on="1"] { background: var(--zl-on); transform: scale(1.22); }

/* --- Estados sin letra --------------------------------------------------- */
.zen-letra-aviso {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; gap: 8px;
  align-items: center; justify-content: center;
  text-align: center; padding: 32px;
  font-size: 15px; font-weight: 500;
  color: rgb(255 255 255 / 0.72);
  text-shadow: 0 1px 10px rgb(0 0 0 / 0.6);
}
.zen-letra-aviso b { font-size: 18px; font-weight: 700; color: rgb(255 255 255 / 0.9); }
.zen-letra-aviso small { font-size: 13px; color: rgb(255 255 255 / 0.5); max-width: 26ch; line-height: 1.4; }

.zen-letra-girando {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 0.22);
  border-top-color: rgb(255 255 255 / 0.85);
  animation: zen-letra-gira 0.8s linear infinite;
}
@keyframes zen-letra-gira { to { transform: rotate(360deg); } }

/* --- Pie: de donde viene la letra y el desfase --------------------------- */
.zen-letra-pie {
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px;
  font-size: 11px; font-weight: 500; letter-spacing: 0.02em;
  color: rgb(255 255 255 / 0.42);
  background: linear-gradient(transparent, rgb(0 0 0 / 0.35));
  opacity: 0; transition: opacity 0.25s;
  pointer-events: none;
}
.zen-letra-raiz:hover .zen-letra-pie { opacity: 1; }
.zen-letra-pie .zen-letra-desfase { margin-left: auto; font-variant-numeric: tabular-nums; }

/* --- Degradados de borde ----------------------------------------- MEDIDO -
   El corte recto arriba y abajo delata que hay una caja. Con la mascara, las
   lineas entran y salen desvaneciendose.

   LA MASCARA VA EN LA PISTA, NO EN LA RAIZ. Estuvo en la raiz y el sintoma fue
   desconcertante: en pantalla completa, la cabecera y la barra del reproductor de
   YouTube Music se veian nitidas por encima de la letra, como si la superposicion
   no estuviera delante. Medido con elementFromPoint: SI estaba delante, en los
   tres puntos. Lo que pasaba es que mask-image no recorta solo el texto — recorta
   el elemento entero, incluido su fondo Y el resultado de su backdrop-filter. En
   la franja donde la mascara es transparente desaparecia el velo, asi que por ahi
   se veia la pagina sin filtrar ni oscurecer.

   Aplicada a la pista, el texto sigue desvaneciendose en los bordes y el velo
   tapa de arriba abajo, que es lo que hace de esto una vista y no una ventana. */
.zen-letra-raiz[data-mascara="1"] .zen-letra-pista {
  mask-image: linear-gradient(transparent, #000 12%, #000 84%, transparent);
}

/* --- Movimiento reducido -------------------------------------------------
   Quien pide menos movimiento no quiere una letra que se desliza, se escala y se
   desenfoca. Se queda el relleno de la palabra, que es la informacion, y se va
   todo lo demas. */
@media (prefers-reduced-motion: reduce) {
  .zen-letra-pista { transition: none; }
  .zen-letra-l { transition: opacity 0.2s linear; transform: none !important; filter: none !important; }
  .zen-letra-l[data-e="futura"] { opacity: 0.36; }
}
`;

LV.hojas.push(CSS);

/* La pista de salida de la vista de pantalla completa. Vive aqui y no en su
   parcial porque es de las cuatro cosas que comparten todas las vistas. */
LV.hojas.push(`
.zen-letra-salida {
  position: absolute; top: 20px; right: 22px;
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: rgb(255 255 255 / 0.34);
  pointer-events: none;
}
`);

const meterEstilos = () => {
  const id = `${LV.marca}-estilos`;
  if (document.getElementById(id)) return;
  const s = crear('style', null, { id, textContent: LV.hojas.join('\n') });
  (document.head || document.documentElement).appendChild(s);
};
