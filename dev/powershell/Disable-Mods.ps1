<#
.SYNOPSIS
    Apaga los mods sin desinstalar nada. El interruptor de panico.

.DESCRIPTION
    Pone `enabled: false` en zen-themes.json y recompila la hoja, con lo que Zen
    arranca de fabrica. No borra el CSS, ni el registro, ni las prefs, ni la capa
    web: volver a encenderlos es una linea.

    POR QUE HACE FALTA SI ZEN YA TIENE INTERRUPTORES. Porque el caso malo es
    justo el que no te deja usarlos: si un mod rompe la interfaz —una capa opaca
    encima de todo, un panel que no abre, la barra lateral desaparecida— no
    puedes llegar a Ajustes > Zen Mods para apagarlo. Esto se hace desde fuera,
    con Zen cerrado.

    COMO SE USA CUANDO ALGO SE ROMPE
      1. .\dev\powershell\Disable-Mods.ps1          apaga todos
      2. abre Zen: si sigue roto, no eran los mods
      3. .\dev\powershell\Disable-Mods.ps1 -Enable -Only <id>   y vas encendiendo de uno
         en uno hasta que aparezca el culpable

    NO toca la capa web (userContent.css), que es lo que vacia el fondo de las
    paginas: eso vive en otro archivo y se quita con el instalador
    (-WebLevel off). Aqui se dice para que no se busque donde no esta.

.PARAMETER ProfilePath
    Perfil. Si se omite se detecta el de por defecto.

.PARAMETER Enable
    Al contrario: encender en lugar de apagar.

.PARAMETER Only
    Actuar solo sobre estos ids de mod (los de theme.json).

.EXAMPLE
    .\dev\powershell\Disable-Mods.ps1

.EXAMPLE
    .\dev\powershell\Disable-Mods.ps1 -Enable -Only acrylic-zen-native-win
#>
[CmdletBinding()]
param(
    [string] $ProfilePath,
    [switch] $Enable,
    [string[]] $Only
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force -DisableNameChecking

if (-not $ProfilePath) { $ProfilePath = Resolve-ZenProfile }

# Con Zen abierto no vale: reescribe zen-themes.json a su manera al salir y se
# perderia lo que dejemos escrito aqui.
Assert-ZenClosed

$themesFile = Join-Path $ProfilePath 'zen-themes.json'
if (-not (Test-Path $themesFile)) { throw "No hay zen-themes.json en $ProfilePath. No hay nada instalado que apagar." }

$raw = (Get-Content $themesFile -Raw -Encoding UTF8).Trim()
if (-not $raw) { throw "zen-themes.json esta vacio." }
$mods = ConvertTo-OrderedHashtable (ConvertFrom-Json $raw)

$valor = [bool] $Enable
$tocados = @()
foreach ($id in @($mods.Keys)) {
    if ($Only -and $id -notin $Only) { continue }
    $mod = $mods[$id]
    if ($null -eq $mod) { continue }
    $antes = if ($null -eq $mod.enabled) { $true } else { [bool] $mod.enabled }
    if ($antes -eq $valor) { continue }

    # Add-Member -Force porque el objeto puede no tener la propiedad todavia: los
    # theme.json la traen, pero un mod registrado por la interfaz de Zen puede no.
    $mod | Add-Member -NotePropertyName 'enabled' -NotePropertyValue $valor -Force
    $tocados += "$($mod.name) [$id]"
}

if ($Only) {
    $desconocidos = @($Only | Where-Object { -not $mods.Contains($_) })
    foreach ($d in $desconocidos) { Write-Warning "No hay ningun mod registrado con id '$d'." }
}

Write-Utf8NoBom $themesFile (ConvertTo-Json $mods -Depth 20)
$n = Update-ZenModsStylesheet -ProfilePath $ProfilePath

Write-Host ''
$accion = if ($Enable) { 'Encendidos' } else { 'Apagados' }
if ($tocados.Count) {
    Write-Host "${accion}       : $($tocados.Count) mod(s)" -ForegroundColor Green
    foreach ($t in $tocados) { Write-Host "                  $t" -ForegroundColor DarkGray }
}
else {
    Write-Host 'Sin cambios     : ya estaban asi' -ForegroundColor DarkGray
}
Write-Host "Hoja recompilada: $n mod(s) activos en chrome\zen-themes.css"
Write-Host ''
if (-not $Enable) {
    Write-Host 'Zen arrancara de fabrica. No se ha borrado nada:' -ForegroundColor Yellow
    Write-Host '  .\dev\powershell\Disable-Mods.ps1 -Enable        para volver a encenderlos'
    Write-Host ''
    Write-Host 'Si Zen sigue viendose raro, NO eran los mods: la capa web vive aparte,' -ForegroundColor DarkGray
    Write-Host 'en chrome\userContent.css, y se quita con el instalador (-WebLevel off).' -ForegroundColor DarkGray
}
else {
    Write-Host 'Comprueba con: .\dev\powershell\Doctor.ps1'
}
exit 0
