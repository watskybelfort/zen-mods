/* ==========================================================================
   Senalar — "esto de aqui se ve raro"
   --------------------------------------------------------------------------
   Pega esto en la consola de Zen (F12) en la web que se vea mal, o deja que lo
   inyecte el agente conectado. Se arma un selector: pasas el raton, se ilumina
   lo que hay debajo, haces clic, y sale el informe de QUE esta pintando eso y
   la regla lista para pegar en mods\appearance\acrylic-glass\web\50-sites.css.

   POR QUE NO BASTA CON MIRAR EL ELEMENTO EN EL QUE HAS HECHO CLIC
   Esta es la razon de ser de esta herramienta. Casi nunca pinta el fondo el
   elemento que senalas: senalas un titulo, y el color que te molesta lo pone un
   contenedor cuatro niveles mas arriba. Por eso lo primero que hace el informe
   es SUBIR por los ancestros hasta encontrar el primero que pinta de verdad, y
   te dice cual es. Ese es el que hay que atacar.

   Es la misma leccion que dejaron los arreglos de este repo, uno detras de
   otro: la banda de ChatGPT no estaba en el chat sino en un ancestro; la fila
   de iconos del compositor de X era hermana y no descendiente; lo de YouTube
   Music no era un color sino un degradado.

   QUE MIRA, Y POR QUE CADA COSA
     background-color   lo evidente
     background-image   un degradado tapa igual que un color, y con
                        `background-color: transparent` NO se va: hace falta
                        `background-image: none`. Fue exactamente el fallo que
                        dejo pasar YouTube Music
     backdrop-filter    no pinta color propio, asi que no aparece en ninguna de
                        las dos anteriores, pero oscurece igual. Es lo que habia
                        detras de la franja negra de ChatGPT, dos veces
     opacity            un ancestro con opacidad rompe la transparencia de todo
                        el subarbol y no se arregla desde el hijo
     var(--token)       si el valor sale de una variable, ataca LA VARIABLE: el
                        selector cambia con cada despliegue del sitio, el token
                        aguanta mucho mas

   Escape cancela.
   ========================================================================== */

(() => {
  const ID = '__senalar_overlay__';
  const previo = document.getElementById(ID);
  if (previo) previo.remove();

  const transparente = c => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
  const hayDegradado = cs => {
    const img = cs.backgroundImage;
    // Las url() se dejan fuera a proposito: son caratulas, avatares y fotos de
    // portada, o sea contenido, no fondo de pagina.
    if (!img || img === 'none' || img.includes('url(')) return '';
    return img;
  };

  const nombre = el => {
    if (!el || el.nodeType !== 1) return String(el);
    const cls = String(el.className || '')
      .split(/\s+/)
      .filter(c => c && c !== 'style-scope')
      .slice(0, 2)
      .map(c => '.' + c)
      .join('');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  };

  /* Selector con el que atacarlo. Se sube hasta cuatro niveles y se para en
     cuanto el selector ya identifica un solo elemento: uno mas corto aguanta
     mejor un rediseno que una cadena larga y fragil. */
  const selectorDe = el => {
    const partes = [];
    let n = el;
    for (let i = 0; i < 4 && n && n.nodeType === 1 && n !== document.documentElement; i++) {
      let p = n.tagName.toLowerCase();
      if (n.id && !/^[0-9]/.test(n.id)) {
        p = '#' + CSS.escape(n.id);
        partes.unshift(p);
        break;
      }
      const cls = String(n.className || '')
        .split(/\s+/)
        .filter(c => c && c !== 'style-scope' && !/^[0-9]/.test(c))
        .slice(0, 2);
      if (cls.length) p += cls.map(c => '.' + CSS.escape(c)).join('');
      partes.unshift(p);
      const intento = partes.join(' > ');
      try {
        if (document.querySelectorAll(intento).length === 1) return intento;
      } catch {
        /* selector que este navegador no acepta */
      }
      n = n.parentElement;
    }
    return partes.join(' > ');
  };

  /* De que regla sale el fondo, y si viene de una variable. Se recorren las
     hojas del documento buscando la ultima que case: la ultima es la que gana
     a igual especificidad, que es la que el usuario esta viendo. */
  const reglaDe = el => {
    let encontrada = null;
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // hoja de otro origen
      }
      if (!rules) continue;
      for (const rule of rules) {
        if (!rule.selectorText || !rule.style) continue;
        const v =
          rule.style.getPropertyValue('background') ||
          rule.style.getPropertyValue('background-color') ||
          rule.style.getPropertyValue('background-image');
        if (!v) continue;
        try {
          if (el.matches(rule.selectorText)) {
            encontrada = { selector: rule.selectorText.slice(0, 90), valor: v.trim().slice(0, 90) };
          }
        } catch {
          /* selector que este navegador no entiende */
        }
      }
    }
    return encontrada;
  };

  /* El corazon: subir hasta el primero que pinte de verdad. */
  const quienPinta = el => {
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      const grad = hayDegradado(cs);
      const color = transparente(cs.backgroundColor) ? '' : cs.backgroundColor;
      if (color || grad) return { el: n, cs, color, grad };
      n = n.parentElement;
    }
    return null;
  };

  /* Ancestros que estropean la transparencia aunque no pinten color. */
  const saboteadores = el => {
    const lista = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      // Se guarda el selector ya resuelto, no el nodo: el informe tiene que
      // poder viajar como JSON hasta el agente, y un nodo del DOM no viaja.
      const bf = cs.backdropFilter || cs.webkitBackdropFilter;
      if (bf && bf !== 'none') {
        lista.push({ sel: nombre(n), selector: selectorDe(n), que: 'backdrop-filter', valor: bf });
      }
      if (cs.opacity !== '' && parseFloat(cs.opacity) < 1) {
        lista.push({ sel: nombre(n), selector: selectorDe(n), que: 'opacity', valor: cs.opacity });
      }
      n = n.parentElement;
    }
    return lista;
  };

  // --- la capa que ilumina ---------------------------------------------------
  const capa = document.createElement('div');
  capa.id = ID;
  capa.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'pointer-events:none',
    'border:2px solid #d97757',
    'background:rgba(217,119,87,.16)',
    'border-radius:3px',
    'transition:all .05s linear',
    'display:none',
  ].join(';');

  const hud = document.createElement('div');
  hud.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'pointer-events:none',
    'left:50%',
    'transform:translateX(-50%)',
    'bottom:18px',
    'padding:8px 14px',
    'border-radius:999px',
    'background:rgba(20,16,14,.92)',
    'color:#f6e6df',
    'font:600 12px/1 system-ui,sans-serif',
    'box-shadow:0 2px 14px rgba(0,0,0,.5),inset 0 0 0 1px rgba(217,119,87,.5)',
  ].join(';');
  hud.textContent = 'Senalando — haz clic en lo que veas raro  ·  Esc para salir';

  document.documentElement.append(capa, hud);

  let ultimo = null;

  const alMover = e => {
    const el = e.composedPath()[0]; // atraviesa shadow DOM: sin esto, en sitios
    if (!el || el.nodeType !== 1) return; // como YouTube siempre saldria el host
    ultimo = el;
    const r = el.getBoundingClientRect();
    capa.style.display = 'block';
    capa.style.left = r.left + 'px';
    capa.style.top = r.top + 'px';
    capa.style.width = r.width + 'px';
    capa.style.height = r.height + 'px';
  };

  const limpiar = () => {
    capa.remove();
    hud.remove();
    document.removeEventListener('mousemove', alMover, true);
    document.removeEventListener('click', alPulsar, true);
    document.removeEventListener('mousedown', tragar, true);
    document.removeEventListener('mouseup', tragar, true);
    document.removeEventListener('keydown', alTecla, true);
  };

  // El sitio no debe enterarse del clic: si no, navegas a un enlace en vez de
  // senalarlo.
  const tragar = e => {
    e.preventDefault();
    e.stopPropagation();
  };

  let resolver;
  const espera = new Promise(r => (resolver = r));

  const alPulsar = e => {
    tragar(e);
    const el = e.composedPath()[0] || ultimo;
    limpiar();

    const pintor = quienPinta(el);
    const rota = saboteadores(el);
    const dominio = location.hostname.replace(/^www\./, '');

    const informe = {
      dominio,
      url: location.href,
      senalado: nombre(el),
      selectorSenalado: selectorDe(el),
      pinta: pintor ? nombre(pintor.el) : '(nadie: el fondo llega del documento)',
      esElMismo: pintor ? pintor.el === el : null,
      selectorPintor: pintor ? selectorDe(pintor.el) : null,
      color: pintor ? pintor.color : '',
      degradado: pintor ? pintor.grad.slice(0, 120) : '',
      regla: pintor ? reglaDe(pintor.el) : null,
      rompenTransparencia: rota,
      caja: (() => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })(),
    };

    // La regla lista para pegar. Si el valor sale de un token se propone atacar
    // el token en html/body, que sobrevive a los rediseños; si no, el selector.
    const token = informe.regla && informe.regla.valor.match(/var\((--[\w-]+)/);
    const cuerpo = token
      ? `  html, body { ${token[1]}: transparent !important; }`
      : [
          `  ${informe.selectorPintor} {`,
          '    background-color: transparent !important;',
          informe.degradado ? '    background-image: none !important;' : null,
          '  }',
        ]
          .filter(Boolean)
          .join('\n');

    // Cada backdrop-filter se apaga EN EL ELEMENTO QUE LO LLEVA, no en el que
    // se ha senalado: apagarlo en el hijo no hace nada, porque el que oscurece
    // es el ancestro. No se recorta la lista — si hay tres capas encima, las
    // tres tienen que salir o el parche se queda a medias sin avisar.
    const extra = rota
      .filter(r => r.que === 'backdrop-filter')
      .map(r => `  /* ${r.sel} */\n  ${r.selector} { backdrop-filter: none !important; }`);

    informe.parche = [`@-moz-document domain(${dominio}) {`, cuerpo, ...extra, '}'].join('\n');

    console.log('%cSenalado', 'font-weight:bold;color:#d97757;font-size:14px');
    console.log('Has senalado :', informe.senalado);
    if (informe.esElMismo === false) {
      console.log(
        `%cPero el fondo NO lo pinta ese: lo pinta ${informe.pinta}. Es el que hay que atacar.`,
        'font-weight:bold'
      );
    }
    console.table([
      {
        pinta: informe.pinta,
        color: informe.color,
        degradado: informe.degradado.slice(0, 60),
        'regla del sitio': informe.regla ? informe.regla.valor : '(color literal o hoja externa)',
      },
    ]);
    if (rota.length) {
      console.log('Ademas, esto rompe la transparencia desde arriba:');
      console.table(rota);
    }
    if (token) {
      console.log(
        `%cSale de la variable ${token[1]}: atacala en html, body — aguanta mucho mas que el selector.`,
        'font-weight:bold'
      );
    }
    console.log('%cPara mods\\appearance\\acrylic-glass\\web\\50-sites.css:', 'font-weight:bold');
    console.log(informe.parche);

    window.__senalado = informe; // para que lo lea el agente conectado
    resolver(informe);
  };

  const alTecla = e => {
    if (e.key !== 'Escape') return;
    tragar(e);
    limpiar();
    console.log('Senalar: cancelado.');
    resolver(null);
  };

  document.addEventListener('mousemove', alMover, true);
  document.addEventListener('click', alPulsar, true);
  document.addEventListener('mousedown', tragar, true);
  document.addEventListener('mouseup', tragar, true);
  document.addEventListener('keydown', alTecla, true);

  console.log(
    '%cSenalando — haz clic en lo que veas raro. Esc para salir.',
    'font-weight:bold;color:#d97757'
  );
  return espera;
})();
