<#
.SYNOPSIS
    Instala el mod Acrylic Zen en un perfil de Zen Browser.

.DESCRIPTION
    Hace seis cosas, todas reversibles con Uninstall-AcrylicZen.ps1:
      1. Copia el mod a  <perfil>\chrome\zen-themes\acrylic-zen-native-win\
      2. Lo registra en  <perfil>\zen-themes.json
      3. Recompila       <perfil>\chrome\zen-themes.css   (si no, Zen no aplica
         el CSS hasta que alguien toca un ajuste de mods desde su interfaz)
      4. Genera          <perfil>\chrome\userContent.css  desde los parciales de
         web\, que es lo que quita el fondo opaco de las paginas web
      5. Siembra los valores por defecto de las opciones del mod
      6. Aplica las prefs de mods\appearance\acrylic-glass\prefs\acrylic-zen.user.js, que son las que hacen
         que DWM dibuje acrilico real detras de la ventana

    Antes de tocar nada guarda una copia de zen-themes.json, zen-themes.css,
    userContent.css, prefs.js y user.js en <perfil>\acrylic-zen-backup\<fecha>\.

.PARAMETER ProfilePath
    Ruta del perfil. Si se omite se detecta el perfil por defecto de Zen.

.PARAMETER WebLevel
    Cuanto se insiste en vaciar el fondo de las paginas:
      safe        solo html/body
      full        + contenedores raiz de frameworks (por defecto)
      aggressive  + primeros descendientes del body; maximo efecto, mas riesgo
                  de que algun sitio quede raro
      off         no instalar la capa de contenido web

.PARAMETER Lock
    Escribe las prefs en user.js en lugar de prefs.js. Con user.js las prefs se
    reaplican en cada arranque y no se pueden cambiar desde about:config de
    forma permanente. Sin este switch las prefs quedan editables a mano.

.EXAMPLE
    .\Install-AcrylicZen.ps1
#>
[CmdletBinding()]
param(
    [string] $ProfilePath,
    [switch] $Lock,
    [ValidateSet('safe', 'full', 'aggressive', 'off')] [string] $WebLevel = 'full'
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ModsRoot = Join-Path $RepoRoot 'mod'
$WebSource = Join-Path $RepoRoot 'web'
$PrefsSource = Join-Path $RepoRoot 'mods\appearance\acrylic-glass\prefs\acrylic-zen.user.js'

# --- 1. Comprobaciones previas -------------------------------------------
if (-not (Test-Path $ModsRoot)) { throw "No se encontro la carpeta de mods en $ModsRoot" }
if (-not (Test-Path $PrefsSource)) { throw "No se encontro el archivo de prefs en $PrefsSource" }

# Cada subcarpeta de mod\ con theme.json es un mod. Asi se pueden anadir mods
# nuevos sin tocar el instalador.
$Mods = @(Get-ChildItem $ModsRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'theme.json') })
if ($Mods.Count -eq 0) { throw "No hay ningun mod con theme.json en $ModsRoot" }

if (-not $ProfilePath) { $ProfilePath = Resolve-ZenProfile }
Write-Host "Perfil objetivo : $ProfilePath"

Assert-ZenClosed

# --- 2. Backup ------------------------------------------------------------
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $ProfilePath "acrylic-zen-backup\$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
foreach ($f in @('zen-themes.json', 'prefs.js', 'user.js', 'chrome\zen-themes.css', 'chrome\userContent.css')) {
    $src = Join-Path $ProfilePath $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $backupDir (Split-Path -Leaf $f)) -Force }
}
Write-Host "Backup          : $backupDir"

# --- 3 y 4. Copiar y registrar cada mod -----------------------------------
$themesFile = Join-Path $ProfilePath 'zen-themes.json'
$themes = [ordered]@{}
if (Test-Path $themesFile) {
    $rawThemes = (Get-Content $themesFile -Raw -Encoding UTF8).Trim()
    if ($rawThemes) {
        try { $themes = ConvertTo-OrderedHashtable (ConvertFrom-Json $rawThemes) }
        catch { Write-Warning "zen-themes.json ilegible, se reconstruye (copia en el backup)." }
    }
}

foreach ($mod in $Mods) {
    $manifest = ConvertFrom-Json (Get-Content (Join-Path $mod.FullName 'theme.json') -Raw -Encoding UTF8)
    $modTarget = Join-Path $ProfilePath "chrome\zen-themes\$($manifest.id)"
    New-Item -ItemType Directory -Path $modTarget -Force | Out-Null
    foreach ($f in @('chrome.css', 'preferences.json', 'readme.md')) {
        $src = Join-Path $mod.FullName $f
        if (Test-Path $src) { Copy-Item $src (Join-Path $modTarget $f) -Force }
    }
    $themes[$manifest.id] = $manifest
    Write-Host "Mod instalado   : $($manifest.name) v$($manifest.version)"
}

Write-Utf8NoBom $themesFile (ConvertTo-Json $themes -Depth 20)
Write-Host "Mods registrados: $themesFile"

# --- 5. Recompilar la hoja de mods ----------------------------------------
$modCount = Update-ZenModsStylesheet -ProfilePath $ProfilePath
Write-Host "Hoja recompilada: $modCount mod(s) en chrome\zen-themes.css"

# --- 6. Capa de contenido web ---------------------------------------------
# Lo que hace que las paginas dejen ver el cristal: sin esto la ventana es de
# cristal pero cada web sigue pintando su fondo opaco encima.
if ($WebLevel -eq 'off') {
    $ucFile = Join-Path $ProfilePath 'chrome\userContent.css'
    if (Test-Path $ucFile) { Remove-Item $ucFile -Force -Confirm:$false }
    Write-Host "Capa web        : desactivada (-WebLevel off)"
}
else {
    $partCount = Build-UserContentCss -ProfilePath $ProfilePath -WebSource $WebSource -Level $WebLevel
    Write-Host "Capa web        : nivel '$WebLevel', $partCount parciales en chrome\userContent.css"
}

# --- 7. Prefs -------------------------------------------------------------
# Las del sistema (backdrop de DWM) y los valores por defecto de las opciones
# del mod van al mismo sitio, en un solo bloque.
$wanted = Read-UserPrefFile $PrefsSource
foreach ($mod in $Mods) {
    foreach ($kv in (Get-ZenModDefaultPrefs (Join-Path $mod.FullName 'preferences.json')).GetEnumerator()) {
        if (-not $wanted.Contains($kv.Key)) { $wanted[$kv.Key] = $kv.Value }
    }
}

$target = if ($Lock) { Join-Path $ProfilePath 'user.js' } else { Join-Path $ProfilePath 'prefs.js' }
$applied = Set-ZenPrefs -Path $target -Prefs $wanted
Write-Host "Prefs aplicadas : $target ($applied prefs)"

# --- 7.b Manifiesto del backup --------------------------------------------
# Un backup sin manifiesto es una carpeta con fecha: no dice a que estado vuelve,
# ni con que version de Zen se hizo, ni que nivel de capa web tenia. Con esto
# Restore-AcrylicZen.ps1 puede contar lo que va a deshacer antes de hacerlo.
$zenDir = @(
    (Join-Path $env:ProgramFiles 'Zen Browser'),
    (Join-Path ${env:ProgramFiles(x86)} 'Zen Browser'),
    (Join-Path $env:LOCALAPPDATA 'Zen Browser')
) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'application.ini')) } | Select-Object -First 1

$zenVer = '?'; $zenBuild = '?'; $zenGecko = '?'
if ($zenDir) {
    foreach ($line in (Get-Content (Join-Path $zenDir 'application.ini'))) {
        if ($line -match '^Version=(.+)$') { $zenVer = $Matches[1].Trim() }
        if ($line -match '^BuildID=(.+)$') { $zenBuild = $Matches[1].Trim() }
        if ($line -match '^MinVersion=(.+)$' -and $zenGecko -eq '?') { $zenGecko = $Matches[1].Trim() }
    }
}

$commit = '?'
try {
    $commit = (& git -C $RepoRoot rev-parse --short HEAD 2>$null)
    if (-not $commit) { $commit = '?' }
}
catch { $commit = '?' }

$manifiesto = [ordered]@{
    fecha        = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    perfil       = $ProfilePath
    repo_commit  = "$commit".Trim()
    zen          = [ordered]@{ version = $zenVer; gecko = $zenGecko; buildId = $zenBuild }
    web_level    = $WebLevel
    prefs_en     = $(if ($Lock) { 'user.js' } else { 'prefs.js' })
    prefs        = @($wanted.Keys)
    mods         = @($Mods | ForEach-Object {
            $mm = ConvertFrom-Json (Get-Content (Join-Path $_.FullName 'theme.json') -Raw -Encoding UTF8)
            [ordered]@{ id = $mm.id; name = $mm.name; version = $mm.version }
        })
    respaldados  = @(Get-ChildItem $backupDir -File | ForEach-Object { $_.Name })
}
Write-Utf8NoBom (Join-Path $backupDir 'manifest.json') (ConvertTo-Json $manifiesto -Depth 6)
Write-Host "Manifiesto      : $backupDir\manifest.json"

# --- 8. Avisos del sistema ------------------------------------------------
$personalize = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$transparency = (Get-ItemProperty $personalize -ErrorAction SilentlyContinue).EnableTransparency
if ($transparency -ne 1) {
    Write-Warning "Windows tiene los efectos de transparencia APAGADOS. DWM no dibujara acrilico. Actívalos en Configuracion > Personalizacion > Colores."
}
$prevalence = (Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\DWM' -ErrorAction SilentlyContinue).ColorPrevalence
if ($prevalence -eq 1) {
    Write-Warning "Tienes activado 'Mostrar color de acento en barras de titulo'. Zen pinta ese color solido sobre la ventana; el mod lo neutraliza, pero se ve mejor con esa opcion apagada."
}
$build = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuild
if ($build -lt 22621) {
    Write-Warning "Windows build ${build}: DWMSBT_TRANSIENTWINDOW (acrilico) necesita Windows 11 22H2 (build 22621) o superior. El mod se quedara en un tinte plano."
}

Write-Host ''
Write-Host 'Listo. Abre Zen Browser.' -ForegroundColor Green
Write-Host 'Ajustes > Zen Mods > Acrylic Zen para cambiar intensidad y tintes.'
