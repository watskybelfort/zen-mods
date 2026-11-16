#!/usr/bin/env node
// ===========================================================================
// The installer menu / El menu del instalador
// ---------------------------------------------------------------------------
// What Install.cmd (Windows) and Install.command (macOS) open: pick the mods
// by number and it runs the right installers in the right order. Speaks
// Spanish if the system is in Spanish, English otherwise.
//
//   node installer/menu.mjs
//   node installer/menu.mjs --mods acrylic-glass,live-lyrics   (no questions)
// ===========================================================================

import { spawnSync, execFileSync } from 'node:child_process'
import path from 'node:path'
import readline from 'node:readline/promises'

import * as z from './lib/zen.mjs'

// El idioma: --es / --en mandan; si no, se pregunta al abrir el menu (con el del
// sistema como respuesta por defecto). Preguntar sale mejor que adivinar: hay
// mucha gente que habla espanol con Windows en ingles.
let ES = process.argv.includes('--es') ? true
  : process.argv.includes('--en') ? false
  : /^es\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale || '') || /^es/i.test(process.env.LANG || '')
const IDIOMA_FIJO = process.argv.includes('--es') || process.argv.includes('--en')
const t = (en, es) => (ES ? es : en)

// Every mod: what it is and how it installs.
//   css     a Zen Mods theme, installed by instalar.mjs (Zen closed)
//   native  a script under installer/ that also writes to Zen's install folder
//           (administrator on Windows)
//   prefs   installer/blindar.mjs
const MODS = [
  { id: 'acrylic-glass', cat: 'appearance', name: 'Acrylic Glass',
    en: 'Real Windows 11 acrylic / macOS vibrancy behind Zen, and websites that let it through.',
    es: 'Acrílico real de Windows 11 / vibrancy de macOS detrás de Zen, y webs que lo dejan ver.',
    css: true },
  { id: 'glass-toggle', cat: 'appearance', name: 'Glass Toggle',
    en: 'Right-click any site to see it without glass.',
    es: 'Clic derecho en cualquier web para verla sin cristal.',
    native: 'instalar-sin-cristal.mjs' },
  { id: 'motion', cat: 'appearance', name: 'Motion',
    en: 'Animated search bar, tab and menu micro-interactions, Montserrat type.',
    es: 'Buscador animado, microanimaciones en pestañas y menús, tipografía Montserrat.',
    css: true },
  { id: 'traffic-lights', cat: 'appearance', name: 'Traffic Lights',
    en: 'macOS-style minimize, maximize and close buttons.',
    es: 'Botones de minimizar, maximizar y cerrar como en macOS.',
    css: true },
  { id: 'dark-mode', cat: 'appearance', name: 'Dark Mode',
    en: 'A real dark mode for any page, from the right-click menu (Dark Reader engine).',
    es: 'Un modo oscuro de verdad para cualquier web, desde el clic derecho (motor de Dark Reader).',
    css: true, native: 'instalar-modo-oscuro.mjs' },
  { id: 'immersive-web', cat: 'appearance', name: 'Immersive Web',
    en: 'Transparent, clean websites with effects (667 sites). Replaces the Zen Internet extension.',
    es: 'Webs transparentes, limpias y con efectos (667 sitios). Sustituye a la extensión Zen Internet.',
    native: 'instalar-inmersivo.mjs' },
  { id: 'live-lyrics', cat: 'youtube-music', name: 'Live Lyrics',
    en: 'Synced, word-by-word lyrics in YouTube Music.',
    es: 'Letra sincronizada, palabra a palabra, en YouTube Music.',
    native: 'instalar-letra.mjs' },
  { id: 'crossfade', cat: 'youtube-music', name: 'Crossfade',
    en: 'Blends the end of a song into the next one.',
    es: 'Funde el final de una canción con el principio de la siguiente.',
    native: 'instalar-mezcla.mjs' },
  { id: 'phone-remote', cat: 'youtube-music', name: 'Phone Remote',
    en: 'Control YouTube Music on your PC from your phone: scan a QR and go.',
    es: 'Controla el YouTube Music del PC desde el móvil: escaneas un QR y listo.',
    native: 'instalar-remoto.mjs' },
  { id: 'obs-now-playing', cat: 'youtube-music', name: 'OBS Now Playing',
    en: 'Feeds the current song to an OBS music widget.',
    es: 'Le pasa la canción que suena a un widget de música de OBS.',
    native: 'instalar-sintonia.mjs' },
  { id: 'web-apps', cat: 'utilities', name: 'Web Apps',
    en: 'Hides the empty sidebar in web app windows.',
    es: 'Quita la barra lateral vacía de las ventanas de aplicación web.',
    css: true, native: 'instalar-web-apps.mjs' },
  { id: 'agent-indicator', cat: 'utilities', name: 'Agent Indicator',
    en: 'A small pill that shows when an AI agent is driving the browser.',
    es: 'Una pastilla que avisa cuando un agente de IA maneja el navegador.',
    css: true },
  { id: 'privacy-hardening', cat: 'utilities', name: 'Privacy Hardening',
    en: 'Prefs that shrink the attack surface (balanced level).',
    es: 'Prefs que reducen la superficie de ataque (nivel equilibrado).',
    prefs: true },
]

const CATEGORIAS = () => ({
  appearance: t('Appearance', 'Apariencia'),
  'youtube-music': 'YouTube Music',
  utilities: t('Utilities', 'Utilidades'),
})

// --ruta-zen y --perfil pasan a cada instalador (sirve para probar en una copia).
let comunes = []
const correr = (script, args = []) => {
  const r = spawnSync(process.execPath, [path.join(z.RAIZ_REPO, 'installer', script), ...args, ...comunes], { stdio: 'inherit' })
  return r.status === 0
}

const zenAbierto = () => {
  try { return z.pidsDeZen().length > 0 } catch { return false }
}

const cerrarZen = async () => {
  try {
    if (z.ES_WINDOWS) execFileSync('taskkill', ['/IM', 'zen.exe'], { stdio: 'ignore' })
    else execFileSync('osascript', ['-e', 'quit app "Zen"'], { stdio: 'ignore' })
  } catch { /* ya veremos si se cerro */ }
  for (let i = 0; i < 30 && zenAbierto(); i++) await new Promise((r) => setTimeout(r, 1000))
  return !zenAbierto()
}

z.principal(async () => {
  const args = z.parsearArgs(process.argv.slice(2), { interruptores: ['es', 'en'], claves: ['mods', 'ruta-zen', 'perfil'] })
  if (args.perfil) comunes.push('--perfil', args.perfil)
  const rl = args.mods ? null : readline.createInterface({ input: process.stdin, output: process.stdout })
  const preguntar = async (q) => (rl ? (await rl.question(q)).trim() : '')

  if (rl && !IDIOMA_FIJO) {
    const r = await preguntar(`\n  Language / Idioma:  1. English   2. Español   [${ES ? 2 : 1}] `)
    if (r === '1') ES = false
    else if (r === '2') ES = true
  }

  console.log('')
  console.log(z.tinta.fuerte('  Zen Mods'))
  console.log('  ' + t('Mods for Zen Browser. Pick what you want; the rest is untouched.', 'Mods para Zen Browser. Elige los que quieras; lo demás no se toca.'))
  console.log('')

  const dirZen = args['ruta-zen'] || z.resolverInstalacionZen()
  let perfil = args.perfil || null
  if (!perfil) { try { perfil = z.resolverPerfil() } catch { /* lo dice abajo */ } }
  if (!dirZen || !perfil) {
    throw new Error(t('Zen Browser not found. Install it from https://zen-browser.app and open it once.',
      'No encuentro Zen Browser. Instálalo desde https://zen-browser.app y ábrelo una vez.'))
  }
  z.linea('Zen', dirZen)
  z.linea(t('Profile', 'Perfil'), perfil)
  console.log('')

  let elegidos
  if (args.mods) {
    const pedidos = String(args.mods).split(',').map((x) => x.trim())
    elegidos = MODS.filter((m) => pedidos.includes(m.id))
    const malos = pedidos.filter((p) => !MODS.some((m) => m.id === p))
    if (malos.length) throw new Error(t('Unknown mods: ', 'No conozco estos mods: ') + malos.join(', '))
  } else {
    let n = 0
    for (const [cat, titulo] of Object.entries(CATEGORIAS())) {
      console.log('  ' + titulo)
      for (const m of MODS.filter((x) => x.cat === cat)) {
        m.n = ++n
        console.log(`   ${String(m.n).padStart(2)}. ${m.name.padEnd(18)} ${ES ? m.es : m.en}`)
      }
      console.log('')
    }
    const r = await preguntar(t('  Numbers to install (e.g. 1 3 7), "a" for all, Enter to cancel: ',
      '  Números a instalar (p. ej. 1 3 7), "a" para todos, Enter para salir: '))
    if (!r) { rl.close(); return }
    elegidos = r.toLowerCase() === 'a' ? MODS : MODS.filter((m) => r.split(/[\s,;]+/).map(Number).includes(m.n))
    if (!elegidos.length) { console.log(t('  Nothing selected.', '  No has elegido nada.')); rl.close(); return }
  }

  console.log('')
  console.log('  ' + t('Installing:', 'Se instala:') + ' ' + elegidos.map((m) => m.name).join(', '))

  // Los mods de CSS y las prefs se escriben en el perfil, y eso exige Zen cerrado.
  // Sin preguntas (--mods) nunca se cierra solo: se para y lo dice.
  const hayQueCerrar = elegidos.some((m) => m.css || m.prefs)
  if (hayQueCerrar && zenAbierto()) {
    if (!rl) throw new Error(t('Zen is open: close it and run this again.', 'Zen está abierto: ciérralo y vuelve a ejecutar esto.'))
    const r = await preguntar(t('  Zen is open and has to be closed (your tabs come back). Close it now? [Y/n] ',
      '  Zen está abierto y hay que cerrarlo (tus pestañas vuelven). ¿Lo cierro ahora? [S/n] '))
    if (/^n/i.test(r) || !(await cerrarZen())) {
      if (rl) rl.close()
      throw new Error(t('Close Zen and run the installer again.', 'Cierra Zen y vuelve a abrir el instalador.'))
    }
  }

  const fallos = []
  const css = elegidos.filter((m) => m.css).map((m) => m.id)
  if (css.length && !correr('instalar.mjs', ['--mods', css.join(','), '--idioma', ES ? 'es' : 'en'])) fallos.push('CSS: ' + css.join(', '))
  for (const m of elegidos.filter((x) => x.native)) {
    console.log('')
    console.log('  --- ' + m.name)
    if (!correr(m.native, args['ruta-zen'] ? ['--ruta-zen', args['ruta-zen']] : [])) fallos.push(m.name)
  }
  if (elegidos.some((m) => m.prefs) && !correr('blindar.mjs')) fallos.push('Privacy Hardening')

  console.log('')
  if (fallos.length) {
    console.log('  ' + t('Some steps failed: ', 'Fallaron algunos pasos: ') + fallos.join(', '))
    if (z.ES_WINDOWS) console.log('  ' + t('Native mods need administrator rights: run Install.cmd again and accept the prompt.',
      'Los mods nativos necesitan permisos de administrador: abre Install.cmd otra vez y acepta el aviso.'))
    else console.log('  ' + t('If it was a permissions error, run: sudo node installer/menu.mjs',
      'Si fue un error de permisos, ejecuta: sudo node installer/menu.mjs'))
  } else {
    console.log('  ' + t('Done. Open Zen and enjoy.', 'Listo. Abre Zen y a disfrutar.'))
  }
  if (rl) rl.close()
})
