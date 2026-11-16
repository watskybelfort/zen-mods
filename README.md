# Zen Mods

Thirteen mods for [Zen Browser](https://zen-browser.app): real system glass behind the
browser, an immersive web, a proper dark mode, and a set of YouTube Music upgrades
(synced lyrics, crossfade, and a phone remote).

Windows 11 and macOS. Pick only the ones you want; the rest of your browser is untouched.

**[Instalación en español → INSTALAR.md](INSTALAR.md)**

---

## Install

You need [Zen Browser](https://zen-browser.app) and [Node.js 18 or newer](https://nodejs.org).

1. Download this repository (green **Code** button → **Download ZIP**) and unzip it.
2. Double-click **`Install.cmd`** on Windows or **`Install.command`** on macOS.
3. Type the numbers of the mods you want (or `a` for all) and press Enter.

That's it. The installer closes Zen if it has to (your tabs come back), backs up what
it touches, and keeps the options you already chose. On Windows it asks for
administrator rights once: the native mods write a small loader into Zen's install
folder.

Prefer to do it by hand? **[Manual install guide → INSTALL.md](INSTALL.md)**

---

## The mods

### Appearance

| Mod | What it does |
| --- | --- |
| **[Acrylic Glass](mods/appearance/acrylic-glass/)** | Real Windows 11 acrylic (DWM) or macOS vibrancy behind Zen, without Mica For Everyone or any injected DLL. Websites become transparent so the glass shows through, with hand-made fixes for dozens of sites. Intensity and tint in *Settings → Zen Mods*. |
| **[Glass Toggle](mods/appearance/glass-toggle/)** | Right-click any page → *Zen Cristal* → see that site without glass. Remembered per site. |
| **[Motion](mods/appearance/motion/)** | Animated search bar with cascading results, tab and menu micro-interactions, Montserrat as the UI font (install [Montserrat](https://fonts.google.com/specimen/Montserrat) for the full look). |
| **[Traffic Lights](mods/appearance/traffic-lights/)** | macOS-style minimize, maximize and close buttons. Size, colors and order are configurable. |
| **[Dark Mode](mods/appearance/dark-mode/)** | A real dark mode for any page from the right-click menu, powered by Dark Reader. It recolors instead of inverting, and leaves the glass alone. |
| **[Immersive Web](mods/appearance/immersive-web/)** | Transparent, clean websites with effects: hidden clutter, hover reveals, YouTube's immersive search, the YouTube Music side panel that slides in on hover… 667 sites from the [my-internet](https://github.com/sameerasw/my-internet) catalog. A native replacement for the Zen Internet extension, byte-for-byte identical output. Right-click → *Zen Inmersivo* to toggle each feature per site. |

### YouTube Music

| Mod | What it does |
| --- | --- |
| **[Live Lyrics](mods/youtube-music/live-lyrics/)** | Synced lyrics, word by word: a karaoke stage instead of the video, full screen, or a mini strip above the player bar. |
| **[Crossfade](mods/youtube-music/crossfade/)** | Blends the end of each song into the next one, like AutoMix. Fade length 3–12 s. |
| **[Phone Remote](mods/youtube-music/phone-remote/)** | Control YouTube Music on your PC from your phone. Click the phone button in the player bar, scan the QR code, done. Now playing, search, your library, the queue, volume and live lyrics. No app to install; works great as a home-screen web app on iOS. |
| **[OBS Now Playing](mods/youtube-music/obs-now-playing/)** | Feeds the current song to an OBS music widget, and nothing else from your browser. |

### Utilities

| Mod | What it does |
| --- | --- |
| **[Web Apps](mods/utilities/web-apps/)** | Hides Zen's sidebar in web app windows, where it is always empty. |
| **[Agent Indicator](mods/utilities/agent-indicator/)** | A floating pill that shows when an AI agent is connected to the browser session. |
| **[Privacy Hardening](mods/utilities/privacy-hardening/)** | Prefs that shrink the attack surface (balanced or strict level). |

---

## How it works

There are two kinds of mods:

- **CSS mods** (Acrylic Glass, Motion, Traffic Lights, the visual half of Dark Mode and
  Web Apps, Agent Indicator) are regular [Zen Mods](https://docs.zen-browser.app/guides/mods):
  a `chrome.css` with its `theme.json` and options. They show up in *Settings → Zen Mods*.
- **Native mods** (everything else) need to run a little JavaScript inside the browser,
  which plain CSS can't do. They use Firefox's
  [autoconfig](https://support.mozilla.org/kb/customizing-firefox-using-autoconfig)
  mechanism: one shared loader (`core/config.js`) in Zen's install folder loads each
  native mod from your profile. Every native mod has an emergency off switch
  (a pref, listed in its readme) and stops quietly instead of breaking the browser.

When Zen updates, its install folder is replaced and the loader goes with it. Run the
installer again and pick any native mod: it puts the loader back.

## Uninstall

```bash
node installer/desinstalar.mjs                       # the CSS mods
node installer/instalar-<mod>.mjs --desinstalar      # a native mod, e.g. instalar-remoto.mjs
```

Every install leaves a backup in `<your profile>/acrylic-zen-backup/`; `node installer/restaurar.mjs`
puts the latest one back.

## Security and privacy

- Native mods run with browser privileges. Read the code before installing; it is all here,
  unminified and commented.
- **Phone Remote** opens a small web server on your home network (port 8642). It only answers
  private IP addresses, pairs with a one-time 6-digit code that exists only while its panel is
  open, uses an HttpOnly cookie, blocks brute force, and rejects DNS rebinding and cross-site
  requests. It is plain HTTP inside your Wi-Fi. Details in its [readme](mods/youtube-music/phone-remote/readme.md).
- Nothing phones home. The only outgoing requests are the ones each feature needs
  (lyrics providers for Live Lyrics, the style catalog for Immersive Web every two hours).

## Repository layout

```
Install.cmd / Install.command   double-click installers
installer/                      the installers (node), menu.mjs is what the launchers open
mods/<category>/<mod>/          each mod with its own readme
core/config.js                  the shared loader for native mods
dev/                            tests, compatibility contracts, maintenance notes
docs/README-tecnico.md          the long technical write-up (Spanish)
```

The mods' own menus are in Spanish, and so are most of the inline documentation and the per-mod readmes: they record
what was measured and why, which is what you need when Zen changes something.

## Development

```bash
node dev/tools/doctor.mjs            # is everything installed and working?
node dev/tools/probar-inmersivo.mjs  # Immersive Web vs. the original extension engine
node dev/tools/probar-remoto.mjs     # Phone Remote: parser, validation, QR
node dev/tools/probar-mezcla.mjs     # Crossfade
node dev/tools/probar-lrc.mjs        # Live Lyrics parser
```

## Credits

- [Dark Reader](https://github.com/darkreader/darkreader) (MIT), the engine of Dark Mode.
- [my-internet](https://github.com/sameerasw/my-internet) and [Zen Internet](https://github.com/sameerasw/zeninternet) by sameerasw (MIT), the style catalog and the reference behind Immersive Web.
- [Geist](https://github.com/vercel/geist-font) (SIL OFL 1.1) and [Phosphor Icons](https://phosphoricons.com) (MIT), in the Phone Remote web app.
- Lyrics from [LRCLIB](https://lrclib.net) and other providers, fetched on demand.

See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Everything else: [MIT](LICENSE).
