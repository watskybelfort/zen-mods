#!/usr/bin/env bash
# Copia de Zen para probar Zen Mezcla sin tocar el Zen del usuario: perfil en
# blanco, salida a volumen 0, sin teclas multimedia, minimizada.
#   bash mods/youtube-music/crossfade/sonda/copia.sh crear     copia la build e instala el mod
#   bash mods/youtube-music/crossfade/sonda/copia.sh arrancar  [politica-autoplay: 0 permite, 1 bloquea]
#   bash mods/youtube-music/crossfade/sonda/copia.sh parar
#   bash mods/youtube-music/crossfade/sonda/copia.sh borrar
RAIZ="$(cd "$(dirname "$0")/../../../.." && pwd)"
B="$TEMP/zen-mix"
parar() {
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='zen.exe'\" | Where-Object { \$_.ExecutablePath -like '*\Temp\zen-mix\*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep 2"
  rm -f "$B/perfil/parent.lock" "$B/perfil/lock"
}
case "$1" in
  crear)
    mkdir -p "$B/perfil/chrome"
    powershell.exe -NoProfile -Command "robocopy 'C:\Program Files\Zen Browser' '$(cygpath -w "$B/app")' /E /NFL /NDL /NJH /NJS /NP /XD updated | Out-Null; exit 0"
    mkdir -p "$B/app/distribution"
    echo '{"policies":{"DisableAppUpdate":true}}' > "$B/app/distribution/policies.json"
    (cd "$RAIZ" && node installer/instalar-mezcla.mjs --ruta-zen "$(cygpath -w "$B/app")" --perfil "$(cygpath -w "$B/perfil")")
    ;;
  instalar)
    (cd "$RAIZ" && node installer/instalar-mezcla.mjs --solo-perfil --ruta-zen "$(cygpath -w "$B/app")" --perfil "$(cygpath -w "$B/perfil")")
    ;;
  arrancar)
    parar
    cat > "$B/perfil/user.js" <<EOF
user_pref("media.autoplay.default", ${2:-0});
user_pref("media.autoplay.blocking_policy", 0);
user_pref("media.block-autoplay-until-in-foreground", false);
user_pref("dom.disable_beforeunload", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("zen.welcome-screen.seen", true);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("media.volume_scale", "0.0");
user_pref("media.hardwaremediakeys.enabled", false);
user_pref("zen.mezcla.encendido", ${3:-true});
EOF
    powershell.exe -NoProfile -Command "\$b=\$env:TEMP+'\zen-mix'; Start-Process -WindowStyle Minimized -FilePath (\$b+'\app\zen.exe') -ArgumentList '-no-remote','-profile',(\$b+'\perfil'),'--remote-debugging-port','9344','--remote-allow-system-access','about:blank'"
    for i in $(seq 1 40); do netstat -ano | grep -q ":9344 .*LISTENING" && break; sleep 1; done
    echo "copia en marcha"
    ;;
  parar) parar ;;
  borrar) parar; rm -rf "$B" ;;
esac
