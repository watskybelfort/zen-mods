# Installing Zen Mods

**[Instrucciones en español → INSTALAR.md](INSTALAR.md)**

Two ways: the installer does everything for you, or you copy the files yourself.

## Automatic (recommended)

You need [Zen Browser](https://zen-browser.app) and [Node.js 18+](https://nodejs.org).

1. Download this repository (**Code → Download ZIP**) and unzip it anywhere.
2. Double-click **`Install.cmd`** (Windows) or **`Install.command`** (macOS).
   - Windows asks for administrator rights once. The native mods write a small loader into
     Zen's install folder, which lives under *Program Files*.
   - macOS may say the file is from an unidentified developer: right-click it → **Open**.
3. Pick a language, then type the numbers of the mods you want (e.g. `1 6 9`) or `a` for all.
4. Open Zen.

What the installer does for you: it closes Zen when it needs to (your tabs come back), backs up
everything it touches in `<profile>/acrylic-zen-backup/`, and keeps the options you already chose
in *Settings → Zen Mods*.

From a terminal, without questions:

```bash
node installer/menu.mjs --mods acrylic-glass,immersive-web,phone-remote
```

**After a Zen update** the native mods stop working, because the update replaces Zen's install
folder and the loader with it. Run the installer again and pick any native mod.

## Manual

Close Zen first. You'll need two folders:

| | Windows | macOS |
| --- | --- | --- |
| **Profile folder** | `about:profiles` → your profile → *Root Directory* → **Open Folder** | same |
| **Install folder** | `C:\Program Files\Zen Browser\` | `/Applications/Zen.app/Contents/Resources/` |

Writing to the install folder needs administrator rights on Windows (Explorer will ask).

File paths below are relative to each mod's folder under `mods/` (Acrylic Glass is
`mods/appearance/acrylic-glass/`, and so on).

### CSS mods

Acrylic Glass, Motion, Traffic Lights, Agent Indicator, and the visual half of Dark Mode and
Web Apps.

1. In `about:config`, set `toolkit.legacyUserProfileCustomizations.stylesheets` to `true`.
2. In your profile folder, create `chrome/userChrome.css` if it doesn't exist and paste in the
   `chrome.css` of each mod you want, one after another.
3. Each mod has a `preferences.json` with its options. For each entry, create the pref in
   `about:config` with its `defaultValue`. Without them, the mod's switchable parts stay off.

**Acrylic Glass** needs two more things:

4. Copy the lines of `prefs/acrylic-zen.user.js` and of `prefs/windows.user.js` (or
   `prefs/macos.user.js`) into `user.js` in your profile folder (create it if needed).
5. Join these files, in this order, into `chrome/userContent.css` in your profile:
   `web/00-base.css`, `web/10-wrappers.css`, `web/45-emergentes.css`, `web/50-sites.css`,
   `web/90-exclusions.css`. This is what makes websites transparent.

### Native mods

1. Copy `core/config.js` into the install folder (only once, it is shared by all native mods).
2. For each mod, copy its `nativo/config-prefs.js` to `<install folder>/defaults/pref/` with the
   name in the table, and its files into `<profile>/chrome/<folder>/`:

| Mod | Prefs file name | Profile folder | Files |
| --- | --- | --- | --- |
| Glass Toggle | `zen-sin-cristal.js` | `zen-sin-cristal` | `nativo/proceso.js`, `nativo/ventana.js` |
| Dark Mode | `zen-modo-oscuro.js` | `zen-modo-oscuro` | `nativo/proceso.js`, `nativo/ventana.js`, `motor/darkreader.js` |
| Immersive Web | `zen-inmersivo.js` | `zen-inmersivo` | `nativo/proceso.js`, `nativo/puro.js`, `nativo/servicio.js`, `nativo/ventana.js`, and `catalogo/styles.json` renamed to `catalogo.json` |
| Live Lyrics | `zen-letra.js` | `zen-letra` | `nativo/proceso.js`, `dist/zen-letra-viva.user.js` |
| Crossfade | `zen-mezcla.js` | `zen-mezcla` | `nativo/proceso.js`, `nativo/puro.js`, `nativo/motor.js` |
| Phone Remote | `zen-remoto.js` | `zen-remoto` | `nativo/proceso.js`, `nativo/puro.js`, `nativo/qr.js`, `nativo/motor.js`, `nativo/servidor.js`, and the whole `movil` folder |
| OBS Now Playing | `zen-sintonia.js` | `zen-sintonia` | `nativo/proceso.js` |
| Web Apps | `zen-web-apps.js` | `zen-web-apps` | `nativo/ventana.js` |

3. Start Zen. Open the Browser Console (**Ctrl+Shift+J** / **Cmd+Shift+J**): a line
   `[nativo] cargador en pie: …` lists the native mods that loaded.

Dark Mode installed by hand works without its per-site fix list (`arreglos.json`); the installer
builds that file from Dark Reader's database, so some sites look better with the installer.

### Privacy Hardening

Copy the lines of `mods/utilities/privacy-hardening/00-balanced.user.js` (or `10-strict`, or
`20-paranoid`) into `user.js` in your profile folder.

## Uninstall

```bash
node installer/desinstalar.mjs                     # CSS mods
node installer/instalar-<mod>.mjs --desinstalar    # one native mod
node installer/restaurar.mjs                       # put back the latest backup
```

By hand: delete what you copied. The loader (`config.js`) can stay; with no native mods in the
profile it does nothing.

## If something goes wrong

- **Nothing changed after installing.** Restart Zen completely (all windows).
- **Native mods stopped after a Zen update.** Run the installer again (see above).
- **A native mod misbehaves.** Each one has an off switch in `about:config`, listed in its readme.
  Set it to `false` and reload the page.
- `node dev/tools/doctor.mjs` checks what is installed and what isn't.
