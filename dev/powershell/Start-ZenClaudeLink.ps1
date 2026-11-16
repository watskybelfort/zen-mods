<#
.SYNOPSIS
    Arranca Zen Browser con el canal de agente abierto.

.DESCRIPTION
    Zen normal, tu perfil de siempre, mas el RemoteAgent escuchando. Eso hace
    dos cosas a la vez:

      1. Enciende el indicador. gRemoteControl escucha "remote-listening" y pone
         remotecontrol="true" en la raiz, que es de donde cuelga TODO el mod
         Zen Claude Link. Sin esto el mod no pinta nada, y hace bien.
      2. Abre el canal por el que un agente se engancha a la sesion.

    QUE PROTOCOLO. En Gecko 153 el RemoteAgent ya solo habla WebDriver BiDi: la
    carpeta chrome/remote/content/cdp no existe en el omni.ja de esta build.
    El flag se sigue llamando --remote-debugging-port por compatibilidad, pero
    lo que levanta es BiDi. Un cliente que solo hable CDP no encontrara ni
    /json/version.

    ESTO ABRE UNA PUERTA. Quien pueda hablar con ese puerto manda en el
    navegador: tus sesiones abiertas, tus cookies, tu historial. Queda en
    127.0.0.1 y no se toca --remote-allow-hosts, asi que no entra nadie desde la
    red; pero cualquier proceso que corra como tu en esta maquina si puede. Es
    exactamente el mismo trato que aceptas al automatizar Chrome, solo que aqui
    esta escrito. Se cierra al cerrar Zen.

.PARAMETER Port
    Puerto del RemoteAgent. 9222 por defecto.

.PARAMETER Marionette
    Levantar ademas Marionette (puerto 2828). Marionette da acceso al CHROME del
    navegador, no solo al contenido de las paginas: un cliente conectado ahi
    puede leer y tocar la interfaz de Zen entera. Solo si sabes que lo
    necesitas. Es lo que necesita dev\powershell\Test-ZenLive.ps1.

    Anade tambien -remote-allow-system-access, y no es opcional: desde Gecko 133
    el contexto `chrome` esta cerrado sin ese flag, y Marionette contesta
    "System access is required" a la primera orden. O sea que sin el, este
    switch no sirve para lo unico que sirve.

    Sube la apuesta de lo que se abre: con acceso de sistema el cliente no solo
    maneja paginas, tambien lee y escribe prefs, abre archivos y toca la
    interfaz. Sigue en 127.0.0.1 y se cierra al cerrar Zen, pero mientras este
    abierto cualquier proceso que corra como tu puede usarlo.

.PARAMETER ProfilePath
    Perfil a usar. Si se omite, el que Zen abriria por su cuenta.

.EXAMPLE
    .\Start-ZenClaudeLink.ps1

.EXAMPLE
    .\Start-ZenClaudeLink.ps1 -Port 9333
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)] [int] $Port = 9222,
    [switch] $Marionette,
    [string] $ProfilePath,
    [string] $ZenExe
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force

# --- 1. Localizar el ejecutable -------------------------------------------
if (-not $ZenExe) {
    $candidatos = @(
        (Join-Path $env:ProgramFiles 'Zen Browser\zen.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Zen Browser\zen.exe'),
        (Join-Path $env:LOCALAPPDATA 'Zen Browser\zen.exe')
    )
    $ZenExe = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $ZenExe) { throw 'No se encontro zen.exe. Pasa la ruta con -ZenExe.' }

# --- 2. Zen tiene que estar cerrado ---------------------------------------
# Y no es una manía: con Zen abierto, la capa de remoting de Gecko le pasa la
# linea de comandos a la instancia que ya corre —que se limita a abrir una
# pestaña— y el proceso nuevo se muere sin llegar a arrancar el RemoteAgent.
# Tendrias un Zen abierto, ningun canal, y ningun indicador.
Assert-ZenClosed

# --- 3. Arrancar -----------------------------------------------------------
$argumentos = @('--remote-debugging-port', "$Port")
# Los dos juntos, siempre: --marionette sin --remote-allow-system-access levanta
# el puerto pero deja el contexto `chrome` cerrado, y entonces la primera orden
# muere con "System access is required" (comprobado en Gecko 153).
if ($Marionette) { $argumentos += @('--marionette', '--remote-allow-system-access') }
if ($ProfilePath) {
    if (-not (Test-Path $ProfilePath)) { throw "El perfil no existe: $ProfilePath" }
    $argumentos += @('-profile', "`"$ProfilePath`"")
}

Write-Host "Zen             : $ZenExe"
Write-Host "Perfil          : $(if ($ProfilePath) { $ProfilePath } else { 'el de por defecto' })"
Start-Process $ZenExe -ArgumentList $argumentos

# --- 4. Esperar a que escuche ---------------------------------------------
# Se comprueba el socket, no una URL: BiDi no sirve ningun endpoint HTTP de
# descubrimiento, asi que "el puerto acepta conexiones" es la unica senal
# fiable de que el agente esta arriba.
$escuchando = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 750
    $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($c) { $escuchando = $true; break }
}

Write-Host ''
if (-not $escuchando) {
    Write-Warning "El puerto $Port no llego a escuchar. Lo mas comun es que ya estuviese ocupado: prueba con -Port 9333."
    exit 1
}

Write-Host "RemoteAgent     : ws://127.0.0.1:$Port/session   (WebDriver BiDi)" -ForegroundColor Green
if ($Marionette) {
    $m = Get-NetTCPConnection -State Listen -LocalPort 2828 -ErrorAction SilentlyContinue
    if ($m) {
        Write-Host 'Marionette      : 127.0.0.1:2828   (chrome + acceso de sistema)' -ForegroundColor Yellow
        Write-Host '                  Con esto un cliente local puede leer y escribir prefs' -ForegroundColor DarkGray
        Write-Host '                  y tocar la interfaz entera, no solo las paginas.' -ForegroundColor DarkGray
    }
    else { Write-Warning 'Marionette no llego a escuchar en 2828.' }
}

Write-Host ''
Write-Host 'La sesion esta bajo control remoto. Si tienes Zen Claude Link instalado y'
Write-Host 'activado, ya deberias ver la pastilla en la esquina. Si NO la ves, el mod'
Write-Host 'esta desactivado o sin instalar: Ajustes > Zen Mods.'
Write-Host ''
Write-Host 'El canal se cierra al cerrar Zen.'
