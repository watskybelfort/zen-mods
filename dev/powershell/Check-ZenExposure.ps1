<#
.SYNOPSIS
    Dice si tu Zen tiene CVEs conocidos sin parchear, ahora mismo.

.DESCRIPTION
    El miedo razonable con un fork de Firefox no es "sera inseguro", es "no se
    si ahora mismo estoy dentro de una ventana de exposicion". Zen va detras de
    Mozilla por definicion: Mozilla publica el parche Y el aviso a la vez, asi
    que entre que sale el aviso y Zen reempaqueta hay un intervalo en el que el
    fallo es publico y tu build todavia no lo tiene.

    Ese intervalo no es visible desde el navegador. `about:support` te dice tu
    version, pero no contra que compararla. Esto lo compara por ti:

      1. Lee la version de Gecko de tu Zen instalado (application.ini).
      2. Pregunta a Mozilla cual es la ultima Firefox estable.
      3. Se baja los avisos de seguridad (MFSA) machine-readable del repo
         oficial de Mozilla y se queda con los que dicen "fixed in Firefox N"
         con N mayor que tu version: esos son exactamente tus CVE abiertos.
      4. Mira si Zen ya publico una release mas nueva que la tuya.

    No usa listas de terceros ni scraping de blogs. Las dos fuentes son de
    Mozilla y la tercera es la API de releases de Zen.

.PARAMETER Depth
    Cuantos avisos recientes revisar. 20 cubre varios meses de sobra.

.PARAMETER Json
    Emite el resultado como JSON en vez de texto, para encadenarlo.

.PARAMETER AssumeGecko
    Calcula el informe como si tuvieras esa version de Gecko en lugar de la
    instalada. Sirve para comprobar que la deteccion dispara de verdad (una
    alarma que nunca suena no vale de nada) y para saber a que te expondrias
    si te quedaras en una version concreta.

.OUTPUTS
    Codigo de salida:
      0  al dia, sin CVE conocidos abiertos
      1  hay una version mas nueva pero sin avisos de seguridad pendientes
      2  tienes CVE conocidos sin parchear
      3  no se pudo determinar (sin red, Zen no encontrado)

.EXAMPLE
    .\dev\powershell\Check-ZenExposure.ps1

.EXAMPLE
    .\dev\powershell\Check-ZenExposure.ps1 -Json | ConvertFrom-Json
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 60)] [int] $Depth = 20,
    [switch] $Json,
    [string] $AssumeGecko
)

$ErrorActionPreference = 'Stop'
# PowerShell 5.1 negocia TLS 1.0 por defecto y product-details lo rechaza.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$MOZ_VERSIONS = 'https://product-details.mozilla.org/1.0/firefox_versions.json'
$MFSA_LIST = 'https://api.github.com/repos/mozilla/foundation-security-advisories/contents/announce/{0}'
$MFSA_RAW = 'https://raw.githubusercontent.com/mozilla/foundation-security-advisories/master/announce/{0}/{1}'
$ZEN_LATEST = 'https://api.github.com/repos/zen-browser/desktop/releases/latest'


function ConvertTo-Comparable {
    <#
    .SYNOPSIS
        "153" / "153.0" / "152.0.6" -> [version] comparable.
    .DESCRIPTION
        [version] exige al menos major.minor, asi que "153" a secas revienta.
        Los avisos de Mozilla escriben las releases mayores sin minor.
    #>
    param([Parameter(Mandatory)] [string] $Raw)
    $v = ($Raw -replace '[^\d.]', '').Trim('.')
    if (-not $v) { return $null }
    if ($v -notmatch '\.') { $v = "$v.0" }
    try { return [version] $v } catch { return $null }
}

function Get-InstalledZen {
    <#
    .SYNOPSIS
        Localiza Zen y devuelve version de Zen + version de Gecko + fecha de build.
    .DESCRIPTION
        application.ini es la fuente fiable: [App]Version es la version de Zen y
        [Gecko]MinVersion la de Firefox sobre la que esta construido, que es la
        unica que importa para cruzar con los CVE de Mozilla.
    #>
    # El @() de fuera no es decorativo: con un unico resultado el pipeline
    # devuelve un string y $candidates[0] daria su primer caracter, no la ruta.
    $candidates = @(@(
            (Join-Path $env:ProgramFiles 'Zen Browser'),
            (Join-Path ${env:ProgramFiles(x86)} 'Zen Browser'),
            (Join-Path $env:LOCALAPPDATA 'Zen Browser')
        ) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'application.ini')) })

    if ($candidates.Count -eq 0) { return $null }

    $ini = Join-Path $candidates[0] 'application.ini'
    $info = @{ Path = $candidates[0] }
    $section = ''
    foreach ($raw in (Get-Content $ini -Encoding UTF8)) {
        $line = $raw.Trim()
        if ($line -match '^\[(.+)\]$') { $section = $Matches[1]; continue }
        if ($section -eq 'App' -and $line -match '^Version=(.+)$') { $info.ZenVersion = $Matches[1] }
        if ($section -eq 'App' -and $line -match '^BuildID=(\d{8})') { $info.BuildDate = [datetime]::ParseExact($Matches[1], 'yyyyMMdd', $null) }
        if ($section -eq 'Gecko' -and $line -match '^MinVersion=(.+)$') { $info.Gecko = $Matches[1] }
    }
    if (-not $info.Gecko) { return $null }
    return [pscustomobject] $info
}

function Read-Advisory {
    <#
    .SYNOPSIS
        Extrae de un .yml de MFSA lo justo: a que versiones aplica y que CVE trae.
    .DESCRIPTION
        PowerShell 5.1 no trae parser de YAML y no merece la pena arrastrar uno:
        el formato de estos archivos es plano y estable. Se leen por regex los
        cuatro campos que se necesitan.
    #>
    param([Parameter(Mandatory)] [string] $Text, [Parameter(Mandatory)] [string] $Id)

    $lines = $Text -split "`r?`n"
    $fixedIn = @()
    $inFixed = $false
    $impact = ''
    $announced = ''

    foreach ($line in $lines) {
        if ($line -match '^fixed_in:') { $inFixed = $true; continue }
        if ($inFixed) {
            if ($line -match '^\s*-\s+(.+?)\s*$') { $fixedIn += $Matches[1]; continue }
            $inFixed = $false
        }
        if (-not $impact -and $line -match '^impact:\s*(.+?)\s*$') { $impact = $Matches[1] }
        if (-not $announced -and $line -match '^announced:\s*(.+?)\s*$') { $announced = $Matches[1] }
    }

    $cves = [regex]::Matches($Text, '(?m)^\s{2}(CVE-\d{4}-\d+):') | ForEach-Object { $_.Groups[1].Value }
    $critical = ([regex]::Matches($Text, '(?m)^\s+impact:\s*critical\s*$')).Count

    # Solo Firefox de escritorio: "Firefox ESR 140.13" y "Thunderbird 153" no
    # son esta build. El anclaje del $ es lo que descarta las variantes ESR.
    $firefox = @()
    foreach ($f in $fixedIn) {
        if ($f -match '^Firefox\s+([\d.]+)$') { $firefox += (ConvertTo-Comparable $Matches[1]) }
    }

    return [pscustomobject] @{
        Id            = $Id
        Announced     = $announced
        Impact        = $impact
        FixedIn       = $fixedIn
        FirefoxFixes  = @($firefox | Where-Object { $_ })
        Cves          = @($cves)
        CriticalCount = $critical
        Url           = "https://www.mozilla.org/en-US/security/advisories/$Id/"
    }
}


# --- 1. Que tienes instalado ------------------------------------------------

$zen = Get-InstalledZen
if (-not $zen) {
    Write-Error "No se encontro Zen Browser (se busco application.ini en Program Files y LocalAppData)."
    exit 3
}
if ($AssumeGecko) {
    $zen | Add-Member -NotePropertyName GeckoReal -NotePropertyValue $zen.Gecko -Force
    $zen.Gecko = $AssumeGecko
}
$installed = ConvertTo-Comparable $zen.Gecko
if (-not $installed) {
    Write-Error "No se pudo interpretar la version de Gecko: '$($zen.Gecko)'"
    exit 3
}

# --- 2. Que hay publicado ---------------------------------------------------

try {
    $moz = Invoke-RestMethod -Uri $MOZ_VERSIONS -TimeoutSec 20
    $latestFx = ConvertTo-Comparable $moz.LATEST_FIREFOX_VERSION
}
catch {
    Write-Error "No se pudo consultar product-details de Mozilla: $($_.Exception.Message)"
    exit 3
}

$zenLatest = $null
try {
    $rel = Invoke-RestMethod -Uri $ZEN_LATEST -Headers @{ 'User-Agent' = 'check-zen-exposure' } -TimeoutSec 20
    $zenLatest = [pscustomobject] @{
        Tag       = $rel.tag_name
        Published = [datetime] $rel.published_at
        Firefox   = if ($rel.body -match 'Updated (?:to )?Firefox (?:to )?([\d.]+)') { $Matches[1] } else { '' }
    }
}
catch {
    Write-Warning "No se pudo consultar las releases de Zen: $($_.Exception.Message)"
}

# --- 3. Que avisos te dejan fuera -------------------------------------------
# Un aviso te afecta si arregla una version de Firefox POSTERIOR a la tuya:
# significa que el fallo es publico y tu build todavia no lo lleva.

$year = (Get-Date).Year
$open = @()
$checked = 0

# Los parentesis de ($year - 1) son obligatorios: en PowerShell la coma liga
# mas fuerte que el menos, y "$year, $year - 1" se evaluaria como (array) - 1.
foreach ($y in @($year, ($year - 1))) {
    if ($checked -ge $Depth) { break }
    try {
        $files = Invoke-RestMethod -Uri ($MFSA_LIST -f $y) -Headers @{ 'User-Agent' = 'check-zen-exposure' } -TimeoutSec 20
    }
    catch { continue }

    $ordered = $files |
        Where-Object { $_.name -match '^mfsa\d{4}-(\d+)\.yml$' } |
        Sort-Object { [int] ([regex]::Match($_.name, '-(\d+)\.yml$').Groups[1].Value) } -Descending

    foreach ($f in $ordered) {
        if ($checked -ge $Depth) { break }
        $checked++
        try { $text = Invoke-RestMethod -Uri ($MFSA_RAW -f $y, $f.name) -TimeoutSec 20 }
        catch { continue }

        $adv = Read-Advisory -Text $text -Id ($f.name -replace '\.yml$', '')
        if (-not $adv.FirefoxFixes) { continue }
        # Si alguna de las versiones que arregla es mas nueva que la tuya, te falta.
        if (($adv.FirefoxFixes | Where-Object { $_ -gt $installed })) { $open += $adv }
    }
}

# --- 4. Informe -------------------------------------------------------------

$openCves = @($open | ForEach-Object { $_.Cves } | Select-Object -Unique)
$criticals = ($open | Measure-Object -Property CriticalCount -Sum).Sum
$behind = $latestFx -gt $installed

$status = if ($openCves.Count -gt 0) { 'EXPUESTO' } elseif ($behind) { 'DETRAS' } else { 'AL DIA' }
$code = if ($openCves.Count -gt 0) { 2 } elseif ($behind) { 1 } else { 0 }

if ($Json) {
    [pscustomobject] @{
        status        = $status
        zenVersion    = $zen.ZenVersion
        gecko         = $zen.Gecko
        buildDate     = if ($zen.BuildDate) { $zen.BuildDate.ToString('yyyy-MM-dd') } else { $null }
        latestFirefox = $moz.LATEST_FIREFOX_VERSION
        behind        = [bool] $behind
        zenLatestTag  = $zenLatest.Tag
        zenUpdateAvailable = [bool] ($zenLatest -and $zenLatest.Tag -ne $zen.ZenVersion)
        openAdvisories = @($open | ForEach-Object { @{ id = $_.Id; impact = $_.Impact; announced = $_.Announced; cves = $_.Cves; url = $_.Url } })
        openCveCount  = $openCves.Count
        criticalCount = $criticals
    } | ConvertTo-Json -Depth 6
    exit $code
}

$color = switch ($status) { 'EXPUESTO' { 'Red' } 'DETRAS' { 'Yellow' } default { 'Green' } }

Write-Host ''
# Sin caracteres fuera de ASCII: PowerShell 5.1 lee los .ps1 sin BOM como ANSI
# y cualquier acento o simbolo tipografico sale como mojibake en consola.
if ($AssumeGecko) { Write-Host "  (simulando Gecko $AssumeGecko; el instalado es $($zen.GeckoReal))" -ForegroundColor DarkGray }
Write-Host "  Zen $($zen.ZenVersion)  |  Gecko $($zen.Gecko)" -NoNewline
if ($zen.BuildDate) { Write-Host "  |  build $($zen.BuildDate.ToString('yyyy-MM-dd'))" -NoNewline }
Write-Host ''
Write-Host "  Firefox estable publicado: $($moz.LATEST_FIREFOX_VERSION)"
if ($zenLatest) {
    $upd = if ($zenLatest.Tag -ne $zen.ZenVersion) { "  <-- hay actualizacion" } else { '' }
    Write-Host "  Ultima release de Zen:     $($zenLatest.Tag) ($($zenLatest.Published.ToString('yyyy-MM-dd')))$upd"
}
Write-Host ''
Write-Host "  ESTADO: $status" -ForegroundColor $color

if ($openCves.Count -gt 0) {
    Write-Host ''
    Write-Host "  $($openCves.Count) CVE conocidos sin parchear en tu build" -ForegroundColor Red
    if ($criticals -gt 0) { Write-Host "  $criticals de ellos marcados como CRITICAL" -ForegroundColor Red }
    foreach ($a in $open) {
        Write-Host ''
        Write-Host "    $($a.Id)  [$($a.Impact)]  $($a.Announced)"
        Write-Host "    arreglado en: $($a.FixedIn -join ', ')"
        Write-Host "    $($a.Url)"
    }
    Write-Host ''
    Write-Host "  Que hacer: actualiza Zen. Si Zen aun no ha publicado la build," -ForegroundColor Yellow
    Write-Host "  ejecuta el instalador con -HardenLevel strict para reducir" -ForegroundColor Yellow
    Write-Host "  superficie de ataque mientras dura la ventana." -ForegroundColor Yellow
}
elseif ($behind) {
    Write-Host ''
    Write-Host "  Tu Gecko ($($zen.Gecko)) es anterior a la ultima Firefox, pero"
    Write-Host "  ninguno de los $checked avisos revisados arregla algo que te falte."
    Write-Host "  Es una release sin contenido de seguridad. No hay exposicion conocida."
}
else {
    Write-Host ''
    Write-Host "  Tu build lleva todos los avisos de seguridad publicados."
    Write-Host "  ($checked avisos revisados)"
}
Write-Host ''

exit $code
