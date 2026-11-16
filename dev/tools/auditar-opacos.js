/* ==========================================================================
   Acrylic Web — auditor de capas opacas
   --------------------------------------------------------------------------
   Pega esto entero en la consola de Zen (F12) en cualquier web y te dice QUE
   sigue tapando el cristal, de que tamano, y de que regla sale el color.

   Existe porque ir a ojo no funciona: la banda negra de YouTube resulto ser un
   div llamado #frosted-glass, invisible en el inspector si no sabes que
   buscarlo. Con esto sale en la primera linea de la tabla.

   TAMBIEN MIRA LOS DEGRADADOS, y no es un extra: antes solo miraba
   `background-color` y por eso daba VIA LIBRE a YouTube Music, donde lo que
   tapaba era un `linear-gradient` de 1585 x 2782 — la pagina entera — con
   `background-color` transparente. La tabla salia limpia y la web se veia
   fatal. Un fondo tapa igual lo pinte con un color o con una imagen.

   Salida:
     - `sel`    selector con el que atacarlo
     - `bg`     color que esta pintando (vacio si solo pinta con imagen)
     - `img`    degradado, si lo hay. Si aparece esto, `background-color:
                transparent` NO basta: hace falta `background-image: none`
     - `area`   miles de px2; ordenado de mayor a menor, lo de arriba es lo que
                mas tapa
     - `regla`  la regla CSS que lo declara. Si dice `var(--algo)`, ataca ESA
                variable en `html, body`: es mas estable que el selector.
   ========================================================================== */

(() => {
  const MIN_W = 150;
  const MIN_H = 40;
  const MIN_ALPHA = 0.5;

  // LA ALFA YA NO ESTA SIEMPRE EN LA CUARTA POSICION ---------------- MEDIDO -
  // Contar numeros y quedarse con el cuarto valia cuando todo era `rgba()`. Hoy
  // los sitios sirven `oklab()`, `color(srgb ...)` y `rgb(... / ...)`, y ahi la
  // cuenta sale mal de las dos maneras:
  //
  //   oklab(1 0 5.96046e-8 / 0.02)   -> 5 numeros por la notacion cientifica,
  //                                     asi que se daba por OPACO un 2%
  //   oklab(0.183 0.001 -0.003)      -> 3 numeros: opaco, y esta bien
  //   color(srgb 0 0 0 / 0.92)       -> 4 numeros: sale 0.92, y esta bien
  //
  // El primero salio en la auditoria del 12-09-2026: Codebase Memory aparecia
  // con 45 capas opacas que en realidad eran velos del 2%. La regla de verdad es
  // que la alfa va detras de la barra cuando hay barra, y la posicion no importa.
  const alpha = bg => {
    const s = String(bg).trim();
    if (s === 'transparent') return 0;
    const barra = s.match(/\/\s*([\d.]+)(%?)\s*\)\s*$/);
    if (barra) return barra[2] ? parseFloat(barra[1]) / 100 : parseFloat(barra[1]);
    const m = s.match(/-?[\d.]+(?:e-?\d+)?/g);
    if (!m) return 0;
    // `rgba(0, 0, 0, 0.5)` y `hsla(...)`: la forma antigua, con coma y sin barra.
    if (/^(rgba|hsla)\(/.test(s) && m.length === 4) return parseFloat(m[3]);
    return 1;
  };

  const nombre = el => {
    const cls = String(el.className || '')
      .split(/\s+/)
      .filter(c => c && c !== 'style-scope')
      .slice(0, 2)
      .map(c => '.' + c)
      .join('');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  };

  // Un degradado tapa igual que un color. Las `url()` se dejan fuera a
  // proposito: esas son caratulas, fotos de portada y avatares, o sea
  // contenido, no fondo de pagina.
  const degradado = cs => {
    const img = cs.backgroundImage;
    if (!img || img === 'none' || img.includes('url(')) return '';
    return img;
  };

  // 1. Todo lo grande que siga tapando, lo pinte con color o con imagen
  const grupos = new Map();
  const muestras = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) continue;
    const cs = getComputedStyle(el);
    if (cs.opacity === '0' || cs.visibility === 'hidden') continue;

    const grad = degradado(cs);
    const opaco = alpha(cs.backgroundColor) >= MIN_ALPHA;
    if (!opaco && !grad) continue;

    const k = nombre(el) + '  ' + cs.backgroundColor + '  ' + grad;
    const g = grupos.get(k) || {
      sel: nombre(el),
      bg: opaco ? cs.backgroundColor : '',
      img: grad.slice(0, 70),
      n: 0,
      area: 0,
      el,
    };
    g.n++;
    g.area = Math.max(g.area, Math.round((r.width * r.height) / 1000));
    grupos.set(k, g);
    if (muestras.length < 40) muestras.push(el);
  }

  // 2. De que regla sale cada color (para saber si hay un token que atacar)
  const reglaDe = new Map();
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
      const bg =
        rule.style.getPropertyValue('background-color') ||
        rule.style.getPropertyValue('background');
      if (!bg || bg === 'transparent') continue;
      for (const g of grupos.values()) {
        if (reglaDe.has(g.sel)) continue;
        try {
          if (g.el.matches(rule.selectorText)) reglaDe.set(g.sel, bg.trim().slice(0, 60));
        } catch {
          /* selector que este navegador no entiende */
        }
      }
    }
  }

  const tabla = [...grupos.values()]
    .sort((a, b) => b.area - a.area)
    .map(g => ({
      sel: g.sel,
      bg: g.bg,
      img: g.img,
      veces: g.n,
      'area (k px2)': g.area,
      regla: reglaDe.get(g.sel) || '(color literal o hoja externa)',
    }));

  console.table(tabla);
  console.log(
    `%c${tabla.length} capas siguen tapando el cristal. Las de arriba son las que mas.`,
    'font-weight:bold'
  );
  console.log(
    'Si la columna "regla" dice var(--algo), sobreescribe esa variable en html, body: aguanta mucho mas que el selector.'
  );
  console.log(
    'Si una fila trae algo en "img", esa capa pinta con un degradado: necesita background-image: none, con background-color: transparent no se va.'
  );
  return tabla;
})();
