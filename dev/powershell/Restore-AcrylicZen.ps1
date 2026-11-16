<#
.SYNOPSIS
    Vuelve a un backup del instalador.

.DESCRIPTION
    El instalador guarda copia de zen-themes.json, zen-themes.css,
    userContent.css, prefs.js y user.js en <perfil>\acrylic-zen-backup\<fecha>\
    antes de tocar nada. Hasta ahora esas copias existian y no habia forma de
    volver a ellas mas que a mano.

    QUE RESTAURA Y QUE NO. Solo devuelve los archivos que hay en el backup. Las
    carpetas de los mods (chrome\zen-themes\<id>\) NO se respaldan, y no hace
    falta: lo que Zen aplica es la hoja compilada zen-themes.css, asi que
    devolviendo esa hoja y el registro se vuelve al comportamiento anterior
    aunque las carpetas de los mods sigan ahi.

    LO QUE FALTABA EN EL BACKUP se dice, no se adivina. Si un archivo no estaba
    en la copia —porque antes no existia— se avisa y se deja como esta, en vez de
    borrarlo por deduccion. Un restaurador que borra por su cuenta no es una red
    de seguridad.

.PARAMETER ProfilePath
    Perfil. Si se omite se detecta el de por defecto.

.PARAMETER Stamp
    Carpeta de backup a usar (el nombre con fecha). Si se omite, la mas reciente.

.PARAMETER List
    Solo listar los backups disponibles con lo que dice su manifiesto. Muestra
    los 10 mas recientes, porque el instalador crea uno por ejecucion y no borra
    ninguno: con veintitantos, un listado completo no se lee.

.PARAMETER All
    Con -List, mostrarlos todos.

.EXAMPLE
    .\dev\powershell\Restore-AcrylicZen.ps1 -List

.EXAMPLE
    .\dev\powershell\Restore-AcrylicZen.ps1 -Stamp 20260729-213749
#>
[CmdletBinding()]
param(
    [string] $ProfilePath,
    [string] $Stamp,
    [switch] $List,
    [switch] $All
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force -DisableNameChecking

if (-not $ProfilePath) { $ProfilePath = Resolve-ZenProfile }
$raiz = Join-Path $ProfilePath 'acrylic-zen-backup'
if (-not (Test-Path $raiz)) { throw "No hay backups en $raiz. El instalador no se ha ejecutado nunca en este perfil." }

$backups = @(Get-ChildItem $raiz -Directory | Sort-Object Name -Descending)
if (-not $backups.Count) { throw "La carpeta $raiz esta vacia." }

function Get-Manifiesto {
    param([string] $Dir)
    $f = Join-Path $Dir 'manifest.json'
    if (-not (Test-Path $f)) { return $null }
    try { return Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

if ($List) {
    $mostrar = if ($All) { $backups } else { $backups | Select-Object -First 10 }
    Write-Host ''
    Write-Host "Backups en $raiz" -ForegroundColor Cyan
    Write-Host ("{0} en total{1}" -f $backups.Count,
        $(if (-not $All -and $backups.Count -gt 10) { ", se muestran los 10 mas recientes (-All para todos)" } else { '' }))
    Write-Host ''
    foreach ($b in $mostrar) {
        $m = Get-Manifiesto $b.FullName
        $archivos = @(Get-ChildItem $b.FullName -File | Where-Object { $_.Name -ne 'manifest.json' })
        Write-Host ("  {0}" -f $b.Name) -ForegroundColor White
        if ($m) {
            # Solo ASCII: la consola de Windows no siempre esta en UTF-8 y un
            # separador bonito se convierte en basura ilegible.
            Write-Host ("      Zen {0} (build {1})  |  capa web '{2}'  |  prefs en {3}" -f
                $m.zen.version, $m.zen.buildId, $m.web_level, $m.prefs_en) -ForegroundColor DarkGray
            Write-Host ("      repo {0}  |  mods: {1}" -f $m.repo_commit,
                (($m.mods | ForEach-Object { "$($_.name) v$($_.version)" }) -join ', ')) -ForegroundColor DarkGray
        }
        else {
            Write-Host '      (sin manifiesto: backup anterior a que se guardase)' -ForegroundColor DarkYellow
        }
        Write-Host ("      archivos: {0}" -f (($archivos | ForEach-Object { $_.Name }) -join ', ')) -ForegroundColor DarkGray
    }
    Write-Host ''
    exit 0
}

$elegido = if ($Stamp) {
    $backups | Where-Object { $_.Name -eq $Stamp } | Select-Object -First 1
}
else { $backups[0] }
if (-not $elegido) { throw "No existe el backup '$Stamp'. Usa -List para ver los disponibles." }

Assert-ZenClosed

$m = Get-Manifiesto $elegido.FullName
Write-Host ''
Write-Host "Restaurando     : $($elegido.Name)" -ForegroundColor Cyan
if ($m) {
    Write-Host "Se hizo con     : Zen $($m.zen.version) (build $($m.zen.buildId)), repo $($m.repo_commit)"
    Write-Host "Deshace         : capa web '$($m.web_level)', $(@($m.prefs).Count) prefs en $($m.prefs_en)"
}
Write-Host ''

# Donde va cada archivo del backup dentro del perfil.
$destinos = @{
    'zen-themes.json'  = 'zen-themes.json'
    'prefs.js'         = 'prefs.js'
    'user.js'          = 'user.js'
    'zen-themes.css'   = 'chrome\zen-themes.css'
    'userContent.css'  = 'chrome\userContent.css'
}

$restaurados = 0
foreach ($kv in $destinos.GetEnumerator()) {
    $src = Join-Path $elegido.FullName $kv.Key
    $dst = Join-Path $ProfilePath $kv.Value
    if (Test-Path $src) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
        Copy-Item $src $dst -Force
        Write-Host ("  restaurado    : {0}" -f $kv.Value) -ForegroundColor Green
        $restaurados++
    }
    elseif (Test-Path $dst) {
        Write-Host ("  se deja       : {0}" -f $kv.Value) -ForegroundColor DarkYellow
        Write-Host '                  no estaba en el backup, asi que antes no existia.' -ForegroundColor DarkGray
        Write-Host '                  Se deja como esta a proposito: borrarlo por deduccion' -ForegroundColor DarkGray
        Write-Host '                  seria adivinar, y esto es una red de seguridad.' -ForegroundColor DarkGray
    }
}

Write-Host ''
Write-Host "$restaurados archivo(s) restaurado(s)." -ForegroundColor Green
Write-Host 'Comprueba con: .\dev\powershell\Doctor.ps1'
Write-Host ''
Write-Host 'Nota: esto devuelve el estado del perfil, no el del repo. Si querias' -ForegroundColor DarkGray
Write-Host 'volver a instalar la version actual, ejecuta el instalador otra vez.' -ForegroundColor DarkGray
exit 0
