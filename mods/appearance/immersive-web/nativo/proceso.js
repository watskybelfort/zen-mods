// Zen Inmersivo — inyector de proceso de contenido.
//
// Pone en cada pagina la hoja que decide puro.js, en un <style id="zeninternet-
// styles">: el mismo id que usa la extension, para que todo lo que ya convivia
// con ella (Zen Sin Cristal la apaga con media="not all", la capa web de
// Acrylic Zen la tiene en cuenta) siga funcionando igual.
//
// Como la extension: solo el documento de arriba (no los iframes), la hoja la
// ultima del <head> para ganar en cascada, y se recoloca si la pagina mete hojas
// despues. Mas el aviso animado de los atajos y el chat movible de YouTube, que
// son las dos cosas que la extension hace en la pagina ademas de la hoja.
//
// El motor (puro.js) y el catalogo viven en una caja con principal de sistema por
// proceso: el catalogo (~900 KB) se parsea una vez por proceso y por version, no
// una vez por pagina.

'use strict';

(() => {
  const SV = (typeof Services !== 'undefined' && Services)
    ? Services
    : ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;

  const ID = 'zeninternet-styles';
  const registrar = (msg) => { try { SV.console.logStringMessage('[inmersivo] ' + msg); } catch (e) { /* nada */ } };
  const sd = () => SV.cpmm.sharedData;

  // --- El motor ----------------------------------------------------------------------
  let caja = null;
  let catalogoVisto = null;
  let ajustesVistos = null;
  let ajustes = {};
  const motor = () => {
    const puro = sd().get('zen-inmersivo:puro');
    const cat = sd().get('zen-inmersivo:catalogo');
    if (!puro || !cat) return null;
    if (!caja) {
      caja = Cu.Sandbox(SV.scriptSecurityManager.getSystemPrincipal(), { freshZone: true, sandboxName: 'zen-inmersivo' });
      Cu.evalInSandbox(puro, caja, undefined, 'zen-inmersivo-puro.js', 1);
    }
    if (cat !== catalogoVisto) {
      caja.texto = cat;
      Cu.evalInSandbox('globalThis.catalogo = JSON.parse(texto); delete globalThis.texto;', caja);
      catalogoVisto = cat;
    }
    const aj = sd().get('zen-inmersivo:ajustes') || '{}';
    if (aj !== ajustesVistos) {
      ajustesVistos = aj;
      try { ajustes = JSON.parse(aj); } catch (e) { ajustes = {}; }
    }
    return caja;
  };
  const cssPara = (host) => {
    const c = motor();
    if (!c) return '';
    c.host = host;
    c.ajustesTexto = ajustesVistos;
    return String(Cu.evalInSandbox('ZenInmersivoPuro.cssPara(host, catalogo, JSON.parse(ajustesTexto)).css', c));
  };
  const activo = () => sd().get('zen-inmersivo:activo') === true;

  // --- La hoja ------------------------------------------------------------------------
  const docs = new Set(); // WeakRef de los documentos con hoja o candidatos

  const ponerUltima = (doc, el) => {
    const head = doc.head || doc.documentElement;
    if (head && head.lastChild !== el) head.appendChild(el);
  };

  const aplicar = (doc) => {
    try {
      const win = doc.defaultView;
      if (!win) return;
      const host = doc.location.hostname;
      const css = activo() ? cssPara(host) : '';
      let el = doc.getElementById(ID);
      if (!css) {
        if (el) el.textContent = '';
        return;
      }
      if (!el) {
        el = doc.createElement('style');
        el.id = ID;
      }
      if (el.textContent !== css) el.textContent = css;
      ponerUltima(doc, el);
      if (!doc.__zenInmersivoObs) {
        // Si la pagina mete hojas despues, la nuestra vuelve al final. Y mientras
        // no haya <head>, se espera a que aparezca para mudarse alli.
        const obs = new win.MutationObserver((cambios) => {
          for (const m of cambios) {
            if (m.addedNodes.length) {
              const nuestra = doc.getElementById(ID);
              if (nuestra && nuestra.textContent && ![...m.addedNodes].includes(nuestra)) ponerUltima(doc, nuestra);
              break;
            }
          }
        });
        obs.observe(doc.documentElement, { childList: true });
        const mirarHead = () => { if (doc.head) obs.observe(doc.head, { childList: true }); };
        if (doc.head) mirarHead();
        else doc.addEventListener('DOMContentLoaded', () => { mirarHead(); const n = doc.getElementById(ID); if (n && n.textContent) ponerUltima(doc, n); }, { once: true });
        Object.defineProperty(doc, '__zenInmersivoObs', { value: obs });
      }
    } catch (e) {
      registrar('no pude aplicar la hoja: ' + e);
    }
  };

  const repintarTodo = () => {
    for (const ref of [...docs]) {
      const d = ref.deref();
      if (!d || !d.defaultView) { docs.delete(ref); continue; }
      aplicar(d);
      Chat.revisar(d);
    }
  };

  // Ajustes, catalogo o interruptor cambiados en el padre: se repinta todo.
  try {
    sd().addEventListener('change', (e) => {
      const k = e.changedKeys || [];
      if (k.some((x) => String(x).startsWith('zen-inmersivo:'))) repintarTodo();
    });
  } catch (e) { registrar('sin aviso de cambios: ' + e); }

  // --- El aviso de los atajos --------------------------------------------------------
  // El de la extension: pastilla arriba a la derecha que entra con rebote, con un
  // interruptor que dice si quedo puesto o quitado, y un anillo de luz que se
  // expande (encendido) o se recoge (apagado). Mismo color y mismos tiempos.
  const ACENTO = '#f98764';
  const aviso = (doc, texto, encendido) => {
    const win = doc.defaultView;
    if (!win) return;
    const raizDoc = doc.documentElement;
    if (!doc.getElementById('zen-animations-styles')) {
      const st = doc.createElement('style');
      st.id = 'zen-animations-styles';
      st.textContent = `
        @keyframes zen-glow-out { 0% { transform: translate(-50%, -50%) scale(0.1); opacity: 0.6; } 100% { transform: translate(-50%, -50%) scale(15); opacity: 0; } }
        @keyframes zen-glow-in { 0% { transform: translate(-50%, -50%) scale(15); opacity: 0; } 100% { transform: translate(-50%, -50%) scale(0.1); opacity: 0.6; } }
        @keyframes zen-toast-in { 0% { transform: translateX(120%) scale(0.9); opacity: 0; } 70% { transform: translateX(-10px) scale(1.02); opacity: 1; } 100% { transform: translateX(0) scale(1); opacity: 1; } }
        @keyframes zen-toast-out { 0% { transform: translateX(0) scale(1); opacity: 1; } 100% { transform: translateX(120%) scale(0.9); opacity: 0; } }`;
      (doc.head || raizDoc).appendChild(st);
    }
    const anillo = doc.createElement('div');
    Object.assign(anillo.style, {
      position: 'fixed', top: '40px', right: '40px', width: '150px', height: '150px', borderRadius: '50%',
      border: `4px solid ${ACENTO}`, boxShadow: `0 0 60px ${ACENTO}, inset 0 0 60px ${ACENTO}`, filter: 'blur(20px)',
      pointerEvents: 'none', zIndex: '2147483646', opacity: '0', transform: 'translate(-50%, -50%)',
      animation: encendido ? 'zen-glow-out 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'zen-glow-in 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    });
    raizDoc.appendChild(anillo);
    win.setTimeout(() => anillo.remove(), 1300);

    const viejo = doc.getElementById('zeninternet-toast');
    if (viejo) viejo.remove();
    const claro = win.matchMedia('(prefers-color-scheme: light)').matches;
    const t = doc.createElement('div');
    t.id = 'zeninternet-toast';
    Object.assign(t.style, {
      position: 'fixed', top: '20px', right: '20px', padding: '10px 16px',
      background: claro ? 'rgba(245, 247, 250, 0.9)' : 'rgba(25, 25, 25, 0.85)',
      backdropFilter: 'blur(12px)', color: claro ? '#343a40' : '#ffffff', borderRadius: '14px',
      fontSize: '14px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontWeight: '500',
      boxShadow: `0 8px 32px ${claro ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.4)'}, 0 0 0 1px ${claro ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.1)'}`,
      zIndex: '2147483647', display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'none',
      transform: 'translateX(120%) scale(0.9)', opacity: '0', animation: 'zen-toast-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    });
    const etiqueta = doc.createElement('span');
    etiqueta.textContent = texto;
    etiqueta.style.marginRight = '4px';
    const sw = doc.createElement('div');
    Object.assign(sw.style, { position: 'relative', width: '32px', height: '18px', borderRadius: '18px', backgroundColor: encendido ? ACENTO : (claro ? '#ced4da' : '#4c4c63') });
    const bola = doc.createElement('div');
    Object.assign(bola.style, { position: 'absolute', top: '3px', width: '12px', height: '12px', backgroundColor: 'white', borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' });
    bola.style[encendido ? 'right' : 'left'] = '3px';
    sw.appendChild(bola);
    t.appendChild(etiqueta);
    t.appendChild(sw);
    raizDoc.appendChild(t);
    win.setTimeout(() => {
      t.style.animation = 'zen-toast-out 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      win.setTimeout(() => t.remove(), 500);
    }, 3000);
  };

  SV.cpmm.addMessageListener('zen-inmersivo:aviso', ({ data }) => {
    for (const ref of docs) {
      const d = ref.deref();
      try {
        if (d && d.defaultView && d.defaultView.browsingContext && d.defaultView.browsingContext.id === data.bc) aviso(d, String(data.texto), !!data.encendido);
      } catch (e) { /* esa pagina ya no esta */ }
    }
  });

  // --- El chat movible de YouTube -------------------------------------------------
  // En modo cine, el chat en directo pasa a ser una ventana flotante que se arrastra
  // por el asa de arriba, se redimensiona por la esquina, se pega al borde mas
  // cercano al soltar y cambia de opacidad con la rueda sobre el asa. Posicion y
  // opacidad se guardan en el padre. Es la clase MovableLiveChat de la extension.
  const CSS_CHAT = `
    ytd-watch-flexy[theater] #chat.zen-movable { position: fixed !important; z-index: 2001 !important; margin: 0 !important; transform: none !important; display: flex !important; flex-direction: column !important; background: var(--bg-color, #1e1e2e) !important; border-radius: 12px !important; overflow: hidden !important; box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important; min-width: 200px !important; min-height: 200px !important; -webkit-backface-visibility: hidden !important; backface-visibility: hidden !important; }
    #chat.zen-movable iframe { margin-top: -50px !important; height: calc(100% + 50px) !important; transition: margin-top 0.3s cubic-bezier(0.16, 1, 0.3, 1), height 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important; opacity: 0.95 !important; }
    #chat.zen-movable:hover iframe { margin-top: 0 !important; height: 100% !important; opacity: 1 !important; }
    #chat.zen-movable.zen-dragging iframe { pointer-events: none !important; transition: none !important; margin-top: 0 !important; height: 100% !important; opacity: 1 !important; }
    #chat.zen-movable.zen-sticking { transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1), right 0.3s cubic-bezier(0.16, 1, 0.3, 1), top 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important; }
    #chat.zen-movable .zen-drag-handle { height: 12px !important; width: 100% !important; background: rgba(249, 135, 100, 0.4) !important; cursor: move !important; display: flex !important; align-items: center !important; justify-content: center !important; opacity: 0 !important; transition: opacity 0.3s ease !important; z-index: 2002 !important; flex-shrink: 0 !important; }
    #chat.zen-movable:hover .zen-drag-handle { opacity: 1 !important; }
    #chat.zen-movable .zen-resize-handle { position: absolute !important; right: 0 !important; bottom: 0 !important; width: 20px !important; height: 20px !important; cursor: nwse-resize !important; background: linear-gradient(135deg, transparent 50%, #f98764 60%) !important; z-index: 2003 !important; border-radius: 0 0 12px 0 !important; opacity: 0 !important; transition: opacity 0.3s ease !important; }
    #chat.zen-movable:hover .zen-resize-handle { opacity: 1 !important; }`;

  const Chat = {
    estados: new WeakMap(),
    quiere(doc) {
      const h = (doc.location.hostname || '').replace(/^www\./, '');
      if (h !== 'youtube.com' || !activo()) return false;
      const sitio = (ajustes.sitios && ajustes.sitios['youtube.com']) || {};
      const g = ajustes.global || {};
      return sitio.movableLiveChat !== false && g.enableStyling !== false;
    },
    revisar(doc) {
      try {
        const st = this.estados.get(doc);
        if (!this.quiere(doc)) { if (st) this.quitar(doc, st); return; }
        if (st) return;
        const win = doc.defaultView;
        const e = { chat: null, cine: null, intervalo: 0 };
        this.estados.set(doc, e);
        if (!doc.getElementById('zen-movable-chat-styles')) {
          const s = doc.createElement('style');
          s.id = 'zen-movable-chat-styles';
          s.textContent = CSS_CHAT;
          (doc.head || doc.documentElement).appendChild(s);
        }
        e.intervalo = win.setInterval(() => this.vigilar(doc, e), 1000);
      } catch (err) { registrar('chat: ' + err); }
    },
    guardado() {
      const c = ajustes.chat || {};
      return { pos: c.posicion || null, opacidad: Number(c.opacidad) || 1 };
    },
    guardar(e) {
      if (!e.chat || !e.cine) return;
      const s = e.chat.style;
      try { SV.cpmm.sendAsyncMessage('zen-inmersivo:chat', { posicion: { top: s.top, left: s.left, right: s.right, width: s.width, height: s.height }, opacidad: e.opacidad }); } catch (err) { /* nada */ }
    },
    vigilar(doc, e) {
      const chat = doc.querySelector('#chat');
      if (chat && (!chat.classList.contains('zen-movable-inited') || !doc.querySelector('.zen-drag-handle'))) this.montar(doc, e, chat);
      const flexy = doc.querySelector('ytd-watch-flexy');
      const cine = !!(flexy && flexy.hasAttribute('theater'));
      if (cine !== e.cine || (e.chat && e.chat.getAttribute('theater-synced') !== String(cine))) {
        e.cine = cine;
        if (e.chat) e.chat.setAttribute('theater-synced', String(cine));
        this.colocar(e);
      }
    },
    poner(el, k, v) { el.style.setProperty(k, v, 'important'); },
    colocar(e) {
      const c = e.chat;
      if (!c) return;
      if (e.cine) {
        c.classList.add('zen-movable');
        const g = this.guardado();
        e.opacidad = e.opacidad || g.opacidad;
        const pos = g.pos || { right: '0px', top: '60px', width: '400px', height: '600px' };
        if (pos.right && pos.right !== 'auto') { this.poner(c, 'right', pos.right); this.poner(c, 'left', 'auto'); } else { this.poner(c, 'left', pos.left || '0px'); this.poner(c, 'right', 'auto'); }
        this.poner(c, 'top', pos.top || '60px');
        if (pos.width) this.poner(c, 'width', pos.width);
        if (pos.height) this.poner(c, 'height', pos.height);
        this.poner(c, 'bottom', 'auto');
        this.poner(c, 'opacity', String(e.opacidad));
        this.poner(c, 'display', 'flex');
        if (!g.pos) this.guardar(e);
      } else {
        c.classList.remove('zen-movable');
        for (const k of ['top', 'left', 'width', 'height', 'right', 'bottom', 'opacity', 'display', 'position']) c.style.removeProperty(k);
      }
    },
    montar(doc, e, chat) {
      if (chat.classList.contains('zen-movable-inited')) { this.colocar(e); return; }
      e.chat = chat;
      chat.classList.add('zen-movable-inited');
      for (const s of ['.zen-drag-handle', '.zen-resize-handle']) { const v = chat.querySelector(s); if (v) v.remove(); }
      const asa = doc.createElement('div');
      asa.className = 'zen-drag-handle';
      chat.insertBefore(asa, chat.firstChild);
      const esquina = doc.createElement('div');
      esquina.className = 'zen-resize-handle';
      chat.appendChild(esquina);
      this.colocar(e);
      const win = doc.defaultView;

      asa.addEventListener('wheel', (ev) => {
        if (!e.cine) return;
        ev.preventDefault();
        e.opacidad = ev.deltaY < 0 ? Math.min(1, (e.opacidad || 1) + 0.05) : Math.max(0.1, (e.opacidad || 1) - 0.05);
        this.poner(chat, 'opacity', String(e.opacidad));
        this.guardar(e);
      });

      let mx, my, ex, ey, an, al, rx, ry;
      const mover = (ev) => {
        ev.preventDefault();
        this.poner(chat, 'top', (ey + ev.clientY - my) + 'px');
        this.poner(chat, 'left', (ex + ev.clientX - mx) + 'px');
        this.poner(chat, 'right', 'auto');
        this.poner(chat, 'bottom', 'auto');
      };
      const redimensionar = (ev) => {
        ev.preventDefault();
        const w = an + (ev.clientX - rx);
        const h = al + (ev.clientY - ry);
        if (w > 200) this.poner(chat, 'width', w + 'px');
        if (h > 200) this.poner(chat, 'height', h + 'px');
      };
      const soltar = () => {
        doc.removeEventListener('mouseup', soltar);
        doc.removeEventListener('mousemove', mover);
        doc.removeEventListener('mousemove', redimensionar);
        chat.classList.remove('zen-dragging');
        const r = chat.getBoundingClientRect();
        chat.classList.add('zen-sticking');
        if (r.left + r.width / 2 < win.innerWidth / 2) { this.poner(chat, 'left', '0px'); this.poner(chat, 'right', 'auto'); } else { this.poner(chat, 'left', 'auto'); this.poner(chat, 'right', '0px'); }
        this.poner(chat, 'top', chat.getBoundingClientRect().top + 'px');
        win.setTimeout(() => { chat.classList.remove('zen-sticking'); this.guardar(e); }, 300);
      };
      asa.addEventListener('mousedown', (ev) => {
        if (!e.cine) return;
        ev.preventDefault();
        mx = ev.clientX; my = ev.clientY;
        const r = chat.getBoundingClientRect();
        ex = r.left; ey = r.top;
        chat.classList.add('zen-dragging');
        doc.addEventListener('mouseup', soltar);
        doc.addEventListener('mousemove', mover);
      });
      esquina.addEventListener('mousedown', (ev) => {
        if (!e.cine) return;
        ev.preventDefault();
        rx = ev.clientX; ry = ev.clientY;
        const r = chat.getBoundingClientRect();
        an = r.width; al = r.height;
        chat.classList.add('zen-dragging');
        doc.addEventListener('mouseup', soltar);
        doc.addEventListener('mousemove', redimensionar);
      });
    },
    quitar(doc, e) {
      try {
        doc.defaultView.clearInterval(e.intervalo);
        const c = e.chat;
        if (c) {
          for (const k of ['zen-movable-inited', 'zen-movable', 'zen-sticking', 'zen-dragging']) c.classList.remove(k);
          for (const k of ['top', 'left', 'width', 'height', 'right', 'bottom', 'position', 'opacity', 'display']) c.style.removeProperty(k);
        }
        for (const s of ['.zen-drag-handle', '.zen-resize-handle', '#zen-movable-chat-styles']) { const v = doc.querySelector(s); if (v) v.remove(); }
      } catch (err) { /* la pagina ya no esta */ }
      this.estados.delete(doc);
    },
  };

  // --- Documentos ------------------------------------------------------------------
  const observador = {
    observe(doc) {
      try {
        if (!doc || !doc.location || !/^https?:$/.test(doc.location.protocol)) return;
        const win = doc.defaultView;
        if (!win || win.top !== win) return;
        docs.add(new WeakRef(doc));
        aplicar(doc);
        // El chat necesita el DOM de YouTube: se empieza a vigilar cuando hay cuerpo.
        doc.addEventListener('DOMContentLoaded', () => Chat.revisar(doc), { once: true });
      } catch (e) {
        registrar('fallo observando un documento: ' + e);
      }
    },
  };
  // Mismo momento que document_start de la extension: hay raiz y aun no hay scripts.
  SV.obs.addObserver(observador, 'document-element-inserted');
})();
