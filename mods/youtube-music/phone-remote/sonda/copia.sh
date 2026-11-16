#!/usr/bin/env bash
# Copia de Zen para probar Zen Remoto sin tocar el Zen del usuario: salida a
# volumen 0, sin teclas multimedia, minimizada. BiDi por 9345.
#   bash mods/youtube-music/phone-remote/sonda/copia.sh crear     copia la build (perfil en blanco)
#   bash mods/youtube-music/phone-remote/sonda/copia.sh instalar  instala el mod en la copia
#   bash mods/youtube-music/phone-remote/sonda/copia.sh arrancar
#   bash mods/youtube-music/phone-remote/sonda/copia.sh parar
#   bash mods/youtube-music/phone-remote/sonda/copia.sh borrar
RAIZ="$(cd "$(dirname "$0")/../../../.." && pwd)"
B="$TEMP/zen-remoto"
parar() {
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='zen.exe'\" | Where-Object { \$_.ExecutablePath -like '*\Temp\zen-remoto\*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep 2"
  rm -f "$B/perfil/parent.lock" "$B/perfil/lock"
}
case "$1" in
  crear)
    mkdir -p "$B/perfil/chrome"
    powershell.exe -NoProfile -Command "robocopy 'C:\Program Files\Zen Browser' '$(cygpath -w "$B/app")' /E /NFL /NDL /NJH /NJS /NP /XD updated | Out-Null; exit 0"
    mkdir -p "$B/app/distribution"
    echo '{"policies":{"DisableAppUpdate":true}}' > "$B/app/distribution/policies.json"
    ;;
  instalar)
    (cd "$RAIZ" && node installer/instalar-remoto.mjs --ruta-zen "$(cygpath -w "$B/app")" --perfil "$(cygpath -w "$B/perfil")" ${2:+--puerto $2})
    ;;
  arrancar)
    parar
    cat > "$B/perfil/user.js" <<EOP
user_pref("media.autoplay.default", 0);
user_pref("media.autoplay.blocking_policy", 0);
user_pref("media.block-autoplay-until-in-foreground", false);
user_pref("dom.disable_beforeunload", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("zen.welcome-screen.seen", true);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("media.volume_scale", "0.0");
user_pref("media.hardwaremediakeys.enabled", false);
user_pref("zen.remoto.puerto", 8643);
user_pref("layout.css.prefers-color-scheme.content-override", 0);
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("acrylic-zen.ytmusic-search", true);
user_pref("acrylic-zen.youtube-search", true);
user_pref("acrylic-zen.search-blur", true);
EOP
    powershell.exe -NoProfile -Command "\$env:MOZ_REMOTE_ALLOW_SYSTEM_ACCESS='1'; \$b=\$env:TEMP+'\zen-remoto'; Start-Process -WindowStyle Minimized -FilePath (\$b+'\app\zen.exe') -ArgumentList '-no-remote','-profile',(\$b+'\perfil'),'--remote-debugging-port','9345','--remote-allow-system-access','about:blank'"
    for i in $(seq 1 40); do netstat -ano | grep -q ":9345 .*LISTENING" && break; sleep 1; done
    echo "copia en marcha"
    ;;
  parar) parar ;;
  borrar) parar; rm -rf "$B" ;;
esac
