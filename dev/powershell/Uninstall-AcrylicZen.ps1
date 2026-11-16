<#
.SYNOPSIS
    Desinstala el mod Acrylic Zen y devuelve el perfil a su estado anterior.

.DESCRIPTION
    Borra la carpeta del mod, lo saca de zen-themes.json, recompila la hoja de
    mods sin el, y elimina las lineas user_pref que instalo el script (con lo
    que cada pref vuelve a su valor por defecto de Zen: contenido opaco, webs
    con su propio tema, etc.). El backdrop de DWM se queda en acrilico porque
    ese ES el valor de fabrica de Zen (toplevel-backdrop = 2); lo que devuelve
    la ventana a su aspecto solido es la retirada del CSS, que trae de vuelta
    las capas opacas.

    Los backups creados por el instalador NO se tocan; siguen en
    <perfil>\acrylic-zen-backup\.

.PARAMETER ProfilePath
    Ruta del perfil. Si se omite se detecta el perfil por defecto de Zen.

.PARAMETER KeepPrefs
    Deja las prefs de about:config como estan y solo quita el CSS del mod.

.EXAMPLE
    .\Uninstall-AcrylicZen.ps1
#>
[CmdletBinding()]
param(
    [string] $ProfilePath,
    [switch] $KeepPrefs
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ModsRoot = Join-Path $RepoRoot 'mod'
$PrefsSource = Join-Path $RepoRoot 'mods\appearance\acrylic-glass\prefs\acrylic-zen.user.js'

$Mods = @(Get-ChildItem $ModsRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'theme.json') })

if (-not $ProfilePath) { $ProfilePath = Resolve-ZenProfile }
Write-Host "Perfil objetivo : $ProfilePath"

Assert-ZenClosed

# --- Carpetas y registro de cada mod --------------------------------------
$themesFile = Join-Path $ProfilePath 'zen-themes.json'
$themes = [ordered]@{}
if (Test-Path $themesFile) {
    $raw = (Get-Content $themesFile -Raw -Encoding UTF8).Trim()
    if ($raw) { $themes = ConvertTo-OrderedHashtable (ConvertFrom-Json $raw) }
}

foreach ($mod in $Mods) {
    $manifest = ConvertFrom-Json (Get-Content (Join-Path $mod.FullName 'theme.json') -Raw -Encoding UTF8)
    $modTarget = Join-Path $ProfilePath "chrome\zen-themes\$($manifest.id)"
    if (Test-Path $modTarget) { Remove-Item $modTarget -Recurse -Force -Confirm:$false }
    if ($themes.Contains($manifest.id)) { $themes.Remove($manifest.id) }
    Write-Host "Mod borrado     : $($manifest.name)"
}

Write-Utf8NoBom $themesFile (ConvertTo-Json $themes -Depth 20)
Write-Host "Desregistrados  : $themesFile"

# --- Hoja de mods ---------------------------------------------------------
$modCount = Update-ZenModsStylesheet -ProfilePath $ProfilePath
Write-Host "Hoja recompilada: $modCount mod(s) en chrome\zen-themes.css"

# --- Capa de contenido web ------------------------------------------------
# Solo se borra si la generamos nosotros: si el usuario ya tenia su propio
# userContent.css, borrarlo seria destruir trabajo ajeno.
$ucFile = Join-Path $ProfilePath 'chrome\userContent.css'
if (Test-Path $ucFile) {
    $head = Get-Content $ucFile -TotalCount 1 -Encoding UTF8
    if ($head -like '*Acrylic Web*') {
        Remove-Item $ucFile -Force -Confirm:$false
        Write-Host "Capa web        : borrada"
    }
    else {
        Write-Warning "chrome\userContent.css no lo genero este instalador; se deja intacto."
    }
}

# --- Prefs ----------------------------------------------------------------
if ($KeepPrefs) {
    Write-Host "Prefs           : intactas (-KeepPrefs)"
}
else {
    $names = @()
    $names += @((Read-UserPrefFile $PrefsSource).Keys)

    # Todas las opciones del mod, tengan o no valor por defecto: las de tipo
    # string se declaran sin defaultValue a proposito (vacio = usar el preset),
    # pero si el usuario escribio una hay que limpiarla igual.
    foreach ($mod in $Mods) {
        $prefsJson = Join-Path $mod.FullName 'preferences.json'
        if (Test-Path $prefsJson) {
            foreach ($entry in (ConvertFrom-Json (Get-Content $prefsJson -Raw -Encoding UTF8))) { $names += $entry.property }
        }
    }

    foreach ($file in @('prefs.js', 'user.js')) {
        $target = Join-Path $ProfilePath $file
        if (-not (Test-Path $target)) { continue }
        $removed = Remove-ZenPrefs -Path $target -Names $names
        Write-Host "Prefs limpiadas : $target ($removed lineas)"
    }
}

Write-Host ''
Write-Host 'Hecho. Zen vuelve a su aspecto original al abrirlo.' -ForegroundColor Green
