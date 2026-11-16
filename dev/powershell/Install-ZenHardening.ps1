<#
.SYNOPSIS
    Aplica prefs de reduccion de superficie de ataque a un perfil de Zen.

.DESCRIPTION
    Va aparte de Install-AcrylicZen.ps1 a proposito: son cosas distintas y quien
    instale el mod por estetica no deberia quedarse sin JIT sin haberlo pedido.
    Escribe su propio bloque marcado, asi que los dos instaladores conviven sin
    pisarse.

    ANTES DE NADA, lo que esto NO es: no parchea vulnerabilidades. Un fallo de
    corrupcion de memoria en Gecko vive en xul.dll y solo lo arregla la build
    nueva de Zen. No existe ningun mod, CSS ni pref que blinde un navegador
    contra fallos de su motor.

    Lo que si hace: quitar codigo del alcance de una pagina web. Cuando exista
    una ventana de exposicion —entre que Mozilla publica el aviso y Zen publica
    la build— hay menos motor expuesto. El nivel 'strict' apaga el JIT de
    JavaScript solo para el contenido web, que es donde se concentra alrededor
    del 45% de las vulnerabilidades del motor.

    Para saber si ahora mismo estas en una de esas ventanas:
        .\dev\powershell\Check-ZenExposure.ps1

.PARAMETER Level
    balanced  red, PDF y rastreo. Sin rotura perceptible. Por defecto.
    strict    + JIT y WebAssembly fuera para las webs, WebRTC apagado.
              Las webs pesadas van mas lentas.
    paranoid  + interprete baseline, regex nativo, WebGL y service workers.
              Equivalente al "Safest" de Tor Browser.

.PARAMETER ProfilePath
    Ruta del perfil. Si se omite se detecta el perfil por defecto de Zen.

.PARAMETER Lock
    Escribe en user.js en lugar de prefs.js: las prefs se reaplican en cada
    arranque y about:config no puede cambiarlas de forma permanente.

.PARAMETER Revert
    Quita todas las prefs que puso este script, de cualquier nivel. Cada una
    vuelve al valor de fabrica de Zen.

.EXAMPLE
    .\dev\powershell\Install-ZenHardening.ps1

.EXAMPLE
    .\dev\powershell\Install-ZenHardening.ps1 -Level strict

.EXAMPLE
    .\dev\powershell\Install-ZenHardening.ps1 -Revert
#>
[CmdletBinding()]
param(
    [ValidateSet('balanced', 'strict', 'paranoid')] [string] $Level = 'balanced',
    [string] $ProfilePath,
    [switch] $Lock,
    [switch] $Revert
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$HardenSource = Join-Path $RepoRoot 'mods\appearance\acrylic-glass\prefs\harden'
$Marker = '// --- Zen Hardening ---'

if (-not (Test-Path $HardenSource)) { throw "No se encontro la carpeta de prefs en $HardenSource" }

# Los parciales se acumulan: cada nivel anade al anterior, igual que los
# parciales de web\ en Build-UserContentCss.
$partsByLevel = [ordered]@{
    balanced = @('00-balanced.user.js')
    strict   = @('00-balanced.user.js', '10-strict.user.js')
    paranoid = @('00-balanced.user.js', '10-strict.user.js', '20-paranoid.user.js')
}

if (-not $ProfilePath) { $ProfilePath = Resolve-ZenProfile }
Write-Host "Perfil objetivo : $ProfilePath"

# Zen reescribe prefs.js entero al salir: con el navegador abierto, todo lo que
# escribamos aqui se perderia al cerrarlo.
Assert-ZenClosed

$target = if ($Lock) { Join-Path $ProfilePath 'user.js' } else { Join-Path $ProfilePath 'prefs.js' }

# --- Backup ---------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $ProfilePath "zen-hardening-backup\$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($f in @('prefs.js', 'user.js')) {
    $src = Join-Path $ProfilePath $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $backupDir $f) -Force }
}
Write-Host "Backup          : $backupDir"

# --- Revertir -------------------------------------------------------------
# Se borran los nombres de TODOS los niveles, no solo los del nivel pedido: si
# alguien aplico paranoid y luego revierte, no puede quedarse a medias.
$allNames = @()
foreach ($p in @('00-balanced.user.js', '10-strict.user.js', '20-paranoid.user.js')) {
    $file = Join-Path $HardenSource $p
    if (Test-Path $file) { $allNames += @((Read-UserPrefFile $file).Keys) }
}
$allNames = @($allNames | Select-Object -Unique)

if ($Revert) {
    $removed = 0
    foreach ($f in @('prefs.js', 'user.js')) {
        $path = Join-Path $ProfilePath $f
        if (Test-Path $path) { $removed += Remove-ZenPrefs -Path $path -Names $allNames -Marker $Marker }
    }
    Write-Host ''
    Write-Host "Revertido: $removed prefs eliminadas. Vuelven al valor de fabrica de Zen." -ForegroundColor Green
    return
}

# --- Aplicar --------------------------------------------------------------
$wanted = [ordered]@{}
foreach ($p in $partsByLevel[$Level]) {
    $file = Join-Path $HardenSource $p
    if (-not (Test-Path $file)) { throw "Falta el parcial $file" }
    foreach ($kv in (Read-UserPrefFile $file).GetEnumerator()) { $wanted[$kv.Key] = $kv.Value }
    Write-Host "Parcial         : $p"
}

# Un nivel bajo tiene que poder desandar lo que dejo uno alto. Sin esto, pasar
# de paranoid a balanced dejaria WebGL y el JIT apagados para siempre.
$stale = @($allNames | Where-Object { -not $wanted.Contains($_) })
if ($stale.Count -gt 0) {
    foreach ($f in @('prefs.js', 'user.js')) {
        $path = Join-Path $ProfilePath $f
        if (Test-Path $path) { [void] (Remove-ZenPrefs -Path $path -Names $stale -Marker $Marker) }
    }
}

$applied = Set-ZenPrefs -Path $target -Prefs $wanted -Marker $Marker
Write-Host "Prefs aplicadas : $target ($applied prefs, nivel '$Level')"

Write-Host ''
Write-Host "Nivel '$Level' aplicado. Abre Zen Browser." -ForegroundColor Green

if ($Level -ne 'balanced') {
    Write-Host ''
    Write-Host 'Recuerda lo que acabas de cambiar:' -ForegroundColor Yellow
    Write-Host '  - Las webs con mucho JavaScript iran mas lentas.'
    Write-Host '  - Videollamadas en el navegador desactivadas (WebRTC).'
    Write-Host '  - Figma, Google Earth y similares no funcionaran (WebAssembly).'
    if ($Level -eq 'paranoid') {
        Write-Host '  - Mapas 3D y juegos web no funcionaran (WebGL).'
        Write-Host '  - Sin modo offline ni notificaciones push (service workers).'
    }
    Write-Host ''
    Write-Host '  Para volver atras:  .\dev\powershell\Install-ZenHardening.ps1 -Revert'
}

Write-Host ''
Write-Host 'Esto reduce superficie de ataque; NO parchea vulnerabilidades.'
Write-Host 'Lo unico que las parchea es actualizar Zen. Comprueba si estas expuesto:'
Write-Host '  .\dev\powershell\Check-ZenExposure.ps1'
