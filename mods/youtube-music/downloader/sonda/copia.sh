#!/usr/bin/env bash
# Copia de Zen para probar Zen Descargas sin tocar el Zen del usuario: perfil en
# blanco, sin sonido, minimizada, y las descargas en una carpeta temporal.
#   bash mods/youtube-music/downloader/sonda/copia.sh crear     copia la build e instala el mod
#   bash mods/youtube-music/downloader/sonda/copia.sh instalar  vuelve a copiar las piezas
#   bash mods/youtube-music/downloader/sonda/copia.sh arrancar  [url]
#   bash mods/youtube-music/downloader/sonda/copia.sh parar
#   bash mods/youtube-music/downloader/sonda/copia.sh borrar
RAIZ="$(cd "$(dirname "$0")/../../../.." && pwd)"
B="$TEMP/zen-desc"
parar() {
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='zen.exe'\" | Where-Object { \$_.ExecutablePath -like '*\Temp\zen-desc\*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep 2"
  rm -f "$B/perfil/parent.lock" "$B/perfil/lock"
}
case "$1" in
  crear)
    mkdir -p "$B/perfil/chrome" "$B/bajadas"
    powershell.exe -NoProfile -Command "robocopy 'C:\Program Files\Zen Browser' '$(cygpath -w "$B/app")' /E /NFL /NDL /NJH /NJS /NP /XD updated | Out-Null; exit 0"
    mkdir -p "$B/app/distribution"
    echo '{"policies":{"DisableAppUpdate":true}}' > "$B/app/distribution/policies.json"
    (cd "$RAIZ" && node installer/instalar-descargas.mjs --ruta-zen "$(cygpath -w "$B/app")" --perfil "$(cygpath -w "$B/perfil")")
    ;;
  instalar)
    (cd "$RAIZ" && node installer/instalar-descargas.mjs --solo-perfil --sin-bajar --ruta-zen "$(cygpath -w "$B/app")" --perfil "$(cygpath -w "$B/perfil")")
    ;;
  arrancar)
    parar
    # Ruta larga y con las barras escapadas: con la corta (MXRNIN~1) Zen ignora la pref y baja a Descargas.
    BAJ="$(node -e "console.log(JSON.stringify(require('fs').realpathSync.native(process.argv[1])))" "$(cygpath -w "$B/bajadas")")"
    cat > "$B/perfil/user.js" <<EOP
user_pref("browser.download.dir", $BAJ);
user_pref("browser.download.folderList", 2);
user_pref("media.autoplay.default", 0);
user_pref("media.volume_scale", "0.0");
user_pref("media.hardwaremediakeys.enabled", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("zen.welcome-screen.seen", true);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("zen.descargas.avisos", false);
user_pref("zen.mods.idioma", "es");
EOP
    powershell.exe -NoProfile -Command "\$b=\$env:TEMP+'\zen-desc'; Start-Process -WindowStyle Minimized -FilePath (\$b+'\app\zen.exe') -ArgumentList '-no-remote','-profile',(\$b+'\perfil'),'--remote-debugging-port','9346','--remote-allow-system-access','${2:-about:blank}'"
    for i in $(seq 1 40); do netstat -ano | grep -q ":9346 .*LISTENING" && break; sleep 1; done
    echo "copia en marcha"
    ;;
  parar) parar ;;
  borrar) parar; rm -rf "$B" ;;
esac
