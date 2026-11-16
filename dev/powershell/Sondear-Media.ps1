<#
.SYNOPSIS
    Lista lo que Windows publica como "media que suena" y dice cual elegiria el
    widget de musica. Es la sonda que demuestra por que hace falta Zen Sintonia.

.DESCRIPTION
    El widget de musica de Hades (widgets\music\server.ps1) no lee el navegador:
    lee SMTC, la API de Windows que alimenta el panel de volumen. Cada aplicacion
    que reproduce algo publica ahi una sesion, y la sesion trae un
    SourceAppUserModelId que dice de quien es.

    ESA ES LA PIEZA QUE CAMBIA ENTRE NAVEGADORES, y es todo el problema:

      - Chromium (Arc, Chrome, Edge) publica una sesion POR PESTANA/PWA, y una
        PWA de YouTube Music sale con su propia identidad. Por eso el filtro
        'youtube|ytm|music' del widget acertaba en Arc.
      - Gecko (Zen, Firefox) publica UNA SOLA sesion para todo el navegador: la
        del controlador principal, que es lo ultimo que se puso a sonar en
        cualquier pestana. El AppUserModelId es el del ejecutable, siempre el
        mismo, suene lo que suene.

    O sea que en Zen no existe ningun campo de SMTC que distinga la pestana de
    YouTube Music de un video suelto o de una playlist. El filtro no casa nunca,
    el widget cae a su respaldo ("cualquier sesion reproduciendo") y muestra lo
    que sea. Eso no se arregla con parametros: se arregla trayendo el dato desde
    dentro de la pagina, que es lo que hace el mod Zen Sintonia.

    Esta sonda imprime las sesiones tal cual, y ademas simula la eleccion del
    widget para que se vea el fallo en vivo en lugar de tener que creerselo.

    Requiere Windows PowerShell 5.1 (powershell.exe). En pwsh 7 la proyeccion de
    WinRT no funciona igual y los tipos no se resuelven.

.PARAMETER Filtro
    El mismo regex que usa el widget en -AppFilter. Por defecto el suyo.

.PARAMETER Vigilar
    En vez de una foto, se queda mirando y avisa cada vez que cambia la sesion
    elegida. Es la forma de ver el secuestro: pon musica en YouTube Music, abre
    otra pestana con cualquier video, y mira que imprime.

.PARAMETER Segundos
    Cuanto dura -Vigilar. Por defecto 60.

.EXAMPLE
    .\Sondear-Media.ps1

.EXAMPLE
    .\Sondear-Media.ps1 -Vigilar -Segundos 120
#>
[CmdletBinding()]
param(
    [string] $Filtro = 'youtube|ytm|music',
    [switch] $Vigilar,
    [int]    $Segundos = 60
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -ge 6) {
    throw 'Esto necesita Windows PowerShell 5.1 (powershell.exe), no pwsh. Los tipos WinRT no se proyectan igual.'
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime

# Helper para await de IAsyncOperation<T>. Es el mismo que usa el widget.
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]

function Await($op, $resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null

$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
    ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

function Get-Resumen($s) {
    if (-not $s) { return $null }
    $props = $null
    try {
        $props = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    } catch { }
    [pscustomobject]@{
        App      = $s.SourceAppUserModelId
        Estado   = $s.GetPlaybackInfo().PlaybackStatus.ToString()
        Tipo     = "$($s.GetPlaybackInfo().PlaybackType)"
        Titulo   = if ($props) { $props.Title } else { '' }
        Artista  = if ($props) { $props.Artist } else { '' }
        Album    = if ($props) { $props.AlbumTitle } else { '' }
        Portada  = if ($props -and $props.Thumbnail) { 'si' } else { 'no' }
    }
}

# La misma eleccion que hace widgets\music\server.ps1, copiada a proposito: si
# alli cambia, aqui hay que cambiarla, y por eso esta sonda vive en el repo.
function Select-ComoElWidget($mgr, $filtro) {
    $sessions = @($mgr.GetSessions())
    $match = @($sessions | Where-Object { $_.SourceAppUserModelId -imatch $filtro })
    $playingMatch = @($match | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' })
    if ($playingMatch.Count -gt 0) { return @{ s = $playingMatch[0]; via = 'filtro + reproduciendo' } }
    if ($match.Count -gt 0)        { return @{ s = $match[0];        via = 'filtro' } }
    $playingAny = @($sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus.ToString() -eq 'Playing' })
    if ($playingAny.Count -gt 0)   { return @{ s = $playingAny[0];   via = 'RESPALDO: cualquiera reproduciendo' } }
    return @{ s = $mgr.GetCurrentSession(); via = 'RESPALDO: sesion actual' }
}

function Show-Foto {
    $sessions = @($mgr.GetSessions())
    Write-Host ''
    Write-Host "  Sesiones SMTC vivas: $($sessions.Count)" -ForegroundColor Cyan
    if ($sessions.Count -eq 0) {
        Write-Host '  Nada esta sonando. Pon musica y repite: sin audio en marcha no hay sesion que mirar.' -ForegroundColor DarkGray
        Write-Host ''
        return
    }

    $i = 0
    foreach ($s in $sessions) {
        $i++
        $r = Get-Resumen $s
        $casa = if ($r.App -imatch $Filtro) { 'SI' } else { 'NO' }
        $color = if ($casa -eq 'SI') { 'Green' } else { 'Yellow' }
        Write-Host ''
        Write-Host "  [$i] $($r.App)" -ForegroundColor $color
        Write-Host "      casa con '$Filtro' : $casa"
        Write-Host "      estado             : $($r.Estado)"
        Write-Host "      suena              : $($r.Titulo) - $($r.Artista)"
        if ($r.Album)  { Write-Host "      album              : $($r.Album)" }
        Write-Host "      portada            : $($r.Portada)"
    }

    $elegida = Select-ComoElWidget $mgr $Filtro
    $r = Get-Resumen $elegida.s
    Write-Host ''
    Write-Host '  --- Lo que mostraria el widget hoy ---' -ForegroundColor Cyan
    if ($r) {
        Write-Host "      $($r.Titulo) - $($r.Artista)"
        Write-Host "      app  : $($r.App)"
        Write-Host "      via  : $($elegida.via)" -ForegroundColor $(if ($elegida.via -like 'RESPALDO*') { 'Red' } else { 'Green' })
        if ($elegida.via -like 'RESPALDO*') {
            Write-Host ''
            Write-Host '      Ese respaldo es el bug: ninguna sesion casa con el filtro, asi que' -ForegroundColor Red
            Write-Host '      el widget coge lo que sea que este sonando. En Gecko siempre acaba' -ForegroundColor Red
            Write-Host '      aqui, porque el navegador publica una sola sesion para todo el.' -ForegroundColor Red
        }
    } else {
        Write-Host '      (nada)'
    }
    Write-Host ''
}

if (-not $Vigilar) {
    Show-Foto
    Write-Host '  Procesos de navegador vivos:' -ForegroundColor DarkGray
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -and $_.ProcessName -imatch 'zen|firefox|chrome|msedge|arc|brave|opera|vivaldi|spotify' } |
        ForEach-Object { Write-Host "    $($_.ProcessName) ($($_.Id)) - $($_.MainWindowTitle)" -ForegroundColor DarkGray }
    Write-Host ''
    return
}

# --- Modo vigilancia -------------------------------------------------------
Write-Host ''
Write-Host "  Vigilando $Segundos s. Cambia de pestana, abre un video, dale a una playlist." -ForegroundColor Cyan
Write-Host '  Cada linea es un cambio de lo que el widget mostraria.' -ForegroundColor DarkGray
Write-Host ''

$fin = (Get-Date).AddSeconds($Segundos)
$anterior = $null
while ((Get-Date) -lt $fin) {
    try {
        $elegida = Select-ComoElWidget $mgr $Filtro
        $r = Get-Resumen $elegida.s
        $clave = if ($r) { "$($r.App)|$($r.Titulo)|$($r.Artista)|$($r.Estado)" } else { '(nada)' }
        if ($clave -ne $anterior) {
            $anterior = $clave
            $hora = (Get-Date).ToString('HH:mm:ss')
            if ($r) {
                $color = if ($elegida.via -like 'RESPALDO*') { 'Red' } else { 'Green' }
                Write-Host "  $hora  $($r.Titulo) - $($r.Artista)" -ForegroundColor $color
                Write-Host "            app: $($r.App)  |  estado: $($r.Estado)  |  via: $($elegida.via)" -ForegroundColor DarkGray
            } else {
                Write-Host "  $hora  (nada sonando)" -ForegroundColor DarkGray
            }
        }
    } catch {
        Write-Host "  error leyendo SMTC: $_" -ForegroundColor Red
        # El manager puede quedarse viejo si el navegador se reinicia.
        $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) `
            ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
    }
    Start-Sleep -Milliseconds 700
}
Write-Host ''
Write-Host '  Fin de la vigilancia.' -ForegroundColor Cyan
Write-Host ''
