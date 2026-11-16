<#
.SYNOPSIS
    Comprueba que los enganches de los que dependen los mods siguen existiendo
    en una build de Zen.

.DESCRIPTION
    Un CSS cuyo selector ya no existe no da error, no sale en ningun log y no
    cambia el estado "activado" del mod: la regla simplemente no aplica. Esto es
    lo que convierte ese fallo en algo que se ve.

    Lee dev\contract\*.json y busca cada `buscar` dentro de los dos omni.ja de Zen,
    que son zip normales (unas 13.000 entradas legibles con
    System.IO.Compression). No abre Zen, no necesita el canal de agente, no toca
    el perfil.

    LO QUE MAS SIRVE: -ZenPath acepta cualquier carpeta de instalacion, tambien
    una build recien descargada y todavia sin instalar. O sea que se puede saber
    si la version nueva rompe algo ANTES de actualizar.

    NO BASTA CON "APARECE LA CADENA". Un id de Firefox como `main-window` sale
    tambien en un archivo de traduccion, asi que informar del primer archivo que
    lo contenga es ruido, no informacion. Aqui cada coincidencia se PUNTUA segun
    el tipo de enganche —`id="x"` vale mas que mencionar x— y solo se toma como
    declaracion la de mejor puntuacion. Sin eso, el informe avisa de mudanzas
    que no han ocurrido y se deja de mirar.

    LO QUE ESTO NO PRUEBA. Que el nombre exista no prueba que el efecto ocurra:
    el elemento puede seguir llamandose igual y haber dejado de pintar el fondo,
    o pintarlo otro encima. Eso se mide sobre el navegador abierto con
    Test-ZenLive.ps1. Los dos hacen falta.

.PARAMETER ZenPath
    Carpeta de instalacion de Zen. Si se omite se busca en las rutas habituales.

.PARAMETER Contract
    Carpeta con los archivos de contrato. Por defecto dev\contract\ del repo.

.PARAMETER Mod
    Comprobar solo estos mods (por el campo `mod` del contrato).

.PARAMETER Json
    Salida JSON, para encadenarlo.

.PARAMETER Quiet
    Solo lo que falla.

.PARAMETER Baseline
    Archivo de linea base con el que comparar. Por defecto
    dev\contract\baseline.json si existe. Con la linea base el informe deja de decir
    "presente/ausente" y pasa a decir QUE HA CAMBIADO desde la version en la que
    esto estaba funcionando, que es la pregunta de verdad.

.PARAMETER UpdateBaseline
    Escribir la linea base con el estado actual. Se hace cuando se ha validado a
    mano que con esta version de Zen todo va bien.

.PARAMETER NoBaseline
    Ignorar la linea base aunque exista.

.EXAMPLE
    .\dev\powershell\Test-ZenContract.ps1

.EXAMPLE
    .\dev\powershell\Test-ZenContract.ps1 -ZenPath 'D:\descargas\zen-1.22'
#>
[CmdletBinding()]
param(
    [string] $ZenPath,
    [string] $Contract,
    [string[]] $Mod,
    [switch] $Json,
    [switch] $Quiet,
    [string] $Baseline,
    [switch] $UpdateBaseline,
    [switch] $NoBaseline
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Contract) { $Contract = Join-Path $RepoRoot 'contract' }
if (-not (Test-Path $Contract)) { throw "No se encontro la carpeta de contrato en $Contract" }

# --- 1. Localizar la build --------------------------------------------------
if (-not $ZenPath) {
    $ZenPath = @(
        (Join-Path $env:ProgramFiles 'Zen Browser'),
        (Join-Path ${env:ProgramFiles(x86)} 'Zen Browser'),
        (Join-Path $env:LOCALAPPDATA 'Zen Browser')
    ) | Where-Object { $_ -and (Test-Path (Join-Path $_ 'omni.ja')) } | Select-Object -First 1
}
if (-not $ZenPath -or -not (Test-Path $ZenPath)) {
    Write-Error 'No se encontro ninguna instalacion de Zen. Pasa la carpeta con -ZenPath.'
    exit 3
}

$jars = @(
    (Join-Path $ZenPath 'omni.ja'),
    (Join-Path $ZenPath 'browser\omni.ja')
) | Where-Object { Test-Path $_ }
if (-not $jars) {
    Write-Error "No hay ningun omni.ja en $ZenPath. No parece una instalacion de Zen."
    exit 3
}

$version = 'desconocida'; $gecko = '?'; $buildId = '?'
$appIni = Join-Path $ZenPath 'application.ini'
if (Test-Path $appIni) {
    foreach ($line in (Get-Content $appIni)) {
        if ($line -match '^Version=(.+)$') { $version = $Matches[1].Trim() }
        if ($line -match '^BuildID=(.+)$') { $buildId = $Matches[1].Trim() }
        if ($line -match '^MinVersion=(.+)$' -and $gecko -eq '?') { $gecko = $Matches[1].Trim() }
    }
}

# --- 2. Cargar el contrato -------------------------------------------------
$contracts = @()
foreach ($f in (Get-ChildItem $Contract -Filter '*.json' | Sort-Object Name)) {
    $c = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    # baseline.json vive en la misma carpeta y NO es un contrato. Se filtra por
    # forma y no solo por nombre, para que cualquier otro archivo que acabe aqui
    # tampoco se cuele como un mod fantasma.
    if (-not $c.mod -or -not ($c.hooks -is [array])) { continue }
    if ($Mod -and $c.mod -notin $Mod) { continue }
    $contracts += $c
}
if (-not $contracts) { throw "No hay contratos que comprobar en $Contract" }

# Un solo recorrido del zip para todos los tokens: descomprimir 13.000 entradas
# una vez por token seria minutos en lugar de segundos.
$targets = [ordered]@{}
foreach ($c in $contracts) {
    foreach ($h in $c.hooks) {
        if ($h.comprobable -is [bool] -and -not $h.comprobable) { continue }
        if ($h.comprobable -eq 'vivo') { continue }
        if (-not $h.buscar -or $h.buscar -eq '-') { continue }
        if (-not $targets.Contains($h.buscar)) {
            $targets[$h.buscar] = [pscustomobject]@{
                kind       = $h.kind
                n          = 0
                mejor      = $null
                puntuacion = 0
                # Todos los archivos que lo contienen. Hace falta la lista
                # entera, no solo el mejor: un token se declara legitimamente en
                # VARIOS sitios (el elemento en browser.xhtml, su estilo en dos
                # hojas), asi que "el mejor cambio" no significa nada. Lo que si
                # significa algo es que el archivo al que apunta el contrato haya
                # dejado de contenerlo: eso es el puntero que se quedo obsoleto.
                archivos   = New-Object System.Collections.Generic.HashSet[string]
            }
        }
    }
}

# --- 3. Puntuar: declaracion vs simple mencion -----------------------------
# El objetivo no es "aparece la cadena" —eso lo cumple cualquier traduccion—
# sino "aqui esta declarado". Cada tipo de enganche tiene su firma:
#   id     <box id="x">            o  #x { }
#   class  class="... x ..."       o  .x { }
#   attr   setAttribute("x", ...)  o  x="..."  o  [x]
#   var    --x: valor              (una declaracion, no un var(--x))
#   pref   pref("x", ...)
#   media  (x) dentro de un @media
# Todo lo que no encaje puntua 1: cuenta como visto, no como declarado.
$q = '"'
function Get-Puntuacion {
    param([string] $texto, [string] $token, [string] $kind)
    $e = [regex]::Escape($token)
    switch ($kind) {
        'id' {
            if ($texto -match ('id\s*=\s*' + $q + $e + $q)) { return 100 }
            if ($texto -match ('#' + $e + '\s*[,{:\)]')) { return 85 }
            if ($texto -match ('getElementById\(\s*' + $q + $e + $q)) { return 70 }
        }
        'class' {
            if ($texto -match ('class\s*=\s*' + $q + '[^' + $q + ']*(^|\s)' + $e + '(\s|' + $q + ')')) { return 100 }
            if ($texto -match ('\.' + $e + '\s*[,{:\)]')) { return 85 }
        }
        'attr' {
            if ($texto -match ('setAttribute\(\s*' + $q + $e + $q)) { return 100 }
            if ($texto -match ('(^|\s)' + $e + '\s*=\s*' + $q)) { return 85 }
            if ($texto -match ('\[' + $e + '[\]=~^*|$]')) { return 75 }
        }
        'var' {
            if ($texto -match ('(?m)^\s*' + $e + '\s*:')) { return 100 }
            if ($texto -match ($e + '\s*:\s*[^;]')) { return 75 }
        }
        'pref' {
            if ($texto -match ('pref\(\s*' + $q + $e + $q)) { return 100 }
            if ($texto -match ($q + $e + $q)) { return 70 }
        }
        'media' {
            if ($texto -match ('\(\s*' + $e + '\s*[\):]')) { return 90 }
        }
    }
    return 1
}

$textExt = '\.(css|js|mjs|jsm|xhtml|xml|inc|yaml)$'   # ni .json ni .ftl: solo
                                                     # traen ruido de traducciones
$keys = @($targets.Keys)
$entradas = 0
$zenModsHash = $null

foreach ($jar in $jars) {
    $z = [System.IO.Compression.ZipFile]::OpenRead($jar)
    try {
        foreach ($e in $z.Entries) {
            if ($e.FullName -notmatch $textExt) { continue }
            $entradas++
            $sr = New-Object System.IO.StreamReader($e.Open())
            try { $text = $sr.ReadToEnd() } finally { $sr.Dispose() }

            # El canario de la frontera del instalador. Todo lo que
            # ZenProfile.psm1 replica —el formato de zen-themes.css, el esquema
            # de zen-themes.json, la siembra de valores por defecto y la
            # derivacion del id del div de preferencias— sale de este archivo. Un
            # hash distinto no significa que algo se haya roto, significa "lee el
            # diff antes de confiar en el instalador", y es la unica forma de
            # enterarse sin repasar el codigo de Zen entero.
            if ($e.FullName -like '*zen-components/ZenMods.mjs') {
                $sha = [System.Security.Cryptography.SHA256]::Create()
                try {
                    $zenModsHash = ([System.BitConverter]::ToString(
                            $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))) -replace '-', '')
                }
                finally { $sha.Dispose() }
            }

            foreach ($k in $keys) {
                if (-not $text.Contains($k)) { continue }
                $t = $targets[$k]
                $t.n++
                [void]$t.archivos.Add($e.FullName)
                $p = Get-Puntuacion -texto $text -token $k -kind $t.kind
                if ($p -gt $t.puntuacion) { $t.puntuacion = $p; $t.mejor = $e.FullName }
            }
        }
    }
    finally { $z.Dispose() }
}

# --- 4. Informe ------------------------------------------------------------
$filas = @()
foreach ($c in $contracts) {
    foreach ($h in $c.hooks) {
        $estado = 'ok'; $encontrado = 0; $donde = $null; $punt = 0; $ancla = $null

        if (($h.comprobable -is [bool] -and -not $h.comprobable) -or $h.comprobable -eq 'vivo' -or
            -not $h.buscar -or $h.buscar -eq '-') {
            $estado = 'sin-comprobar'
        }
        else {
            $t = $targets[$h.buscar]
            $encontrado = $t.n; $donde = $t.mejor; $punt = $t.puntuacion
            if ($encontrado -eq 0) {
                # Un token `opcional` es un nombre historico que se conserva a
                # proposito: su ausencia es lo esperado, no un fallo.
                $estado = if ($h.opcional) { 'historico' } else { 'FALTA' }
            }
            elseif ($h.declarado_en -and $h.declarado_en -ne '-' -and
                $h.declarado_en -notmatch '^(xul\.dll|greprefs)') {
                $ancla = $t.archivos.Contains($h.declarado_en)
            }
        }

        $filas += [pscustomobject]@{
            mod          = $c.mod
            token        = $h.token
            buscar       = $h.buscar
            kind         = $h.kind
            owner        = $h.owner
            severity     = $h.severity
            estado       = $estado
            archivos     = $encontrado
            declara      = $donde
            puntuacion   = $punt
            ancla_ok     = $ancla
            declarado_en = $h.declarado_en
            si_falta     = $h.si_falta
        }
    }
}

$faltan = @($filas | Where-Object { $_.estado -eq 'FALTA' })
$criticos = @($faltan | Where-Object { $_.severity -eq 'critico' })

# El token sigue existiendo, pero el archivo al que apunta el contrato ya no lo
# contiene: Zen lo movio de sitio. No rompe nada hoy, y por eso mismo interesa
# —suele ser el aviso previo a que desaparezca—, ademas de que deja el
# `declarado_en` mandando a buscar donde no esta.
$mudados = @($filas | Where-Object { $_.ancla_ok -eq $false })

$resumen = [pscustomobject]@{
    zen           = $version
    gecko         = $gecko
    buildId       = $buildId
    ruta          = $ZenPath
    zenmods       = $zenModsHash
    entradas      = $entradas
    hooks         = $filas.Count
    ok            = @($filas | Where-Object { $_.estado -eq 'ok' }).Count
    historicos    = @($filas | Where-Object { $_.estado -eq 'historico' }).Count
    sin_comprobar = @($filas | Where-Object { $_.estado -eq 'sin-comprobar' }).Count
    faltan        = $faltan.Count
    criticos      = $criticos.Count
    mudados       = $mudados.Count
}

# --- 5. Linea base ---------------------------------------------------------
# Sin ella el informe solo sabe decir "presente/ausente". Con ella dice que ha
# cambiado desde la version en la que esto estaba funcionando, que es la unica
# pregunta que importa el dia de una actualizacion.
if (-not $Baseline) { $Baseline = Join-Path $Contract 'baseline.json' }
$base = $null
if (-not $NoBaseline -and (Test-Path $Baseline)) {
    $base = Get-Content $Baseline -Raw -Encoding UTF8 | ConvertFrom-Json
}

$cambios = @()
if ($base) {
    $antes = @{}
    foreach ($p in $base.hooks.PSObject.Properties) { $antes[$p.Name] = $p.Value }
    foreach ($f in $filas) {
        $clave = "$($f.mod)|$($f.token)"
        if (-not $antes.ContainsKey($clave)) {
            $cambios += [pscustomobject]@{ clave = $clave; de = '(nuevo en el contrato)'; a = $f.estado; severity = $f.severity }
        }
        elseif ($antes[$clave] -ne $f.estado) {
            $cambios += [pscustomobject]@{ clave = $clave; de = $antes[$clave]; a = $f.estado; severity = $f.severity }
        }
        $antes.Remove($clave)
    }
    foreach ($k in $antes.Keys) {
        $cambios += [pscustomobject]@{ clave = $k; de = $antes[$k]; a = '(fuera del contrato)'; severity = 'cosmetico' }
    }
}

if ($UpdateBaseline) {
    $mapa = [ordered]@{}
    foreach ($f in ($filas | Sort-Object mod, token)) { $mapa["$($f.mod)|$($f.token)"] = $f.estado }
    $nuevo = [ordered]@{
        generado       = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
        zen            = $version
        gecko          = $gecko
        buildId        = $buildId
        zenmods_sha256 = $zenModsHash
        hooks          = $mapa
    }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Baseline, (ConvertTo-Json $nuevo -Depth 6), $enc)
    if (-not $Json) { Write-Host "Linea base escrita: $Baseline" -ForegroundColor Green }
}

if ($Json) {
    [pscustomobject]@{ resumen = $resumen; hooks = $filas; cambios = $cambios } | ConvertTo-Json -Depth 6
}
else {
    Write-Host ''
    # Solo ASCII en la salida: la consola de Windows no siempre esta en UTF-8 y
    # un separador bonito se convierte en basura ilegible.
    Write-Host "Zen $($resumen.zen)  |  Gecko $($resumen.gecko)  |  BuildID $($resumen.buildId)"
    Write-Host "$ZenPath"
    Write-Host ("{0} enganches contra {1} archivos de los omni.ja" -f $resumen.hooks, $resumen.entradas)
    Write-Host ''

    foreach ($grupo in ($filas | Group-Object mod)) {
        $malos = @($grupo.Group | Where-Object { $_.estado -eq 'FALTA' })
        $color = if ($malos.Count) { 'Red' } else { 'Green' }
        $marca = if ($malos.Count) { 'FALLA' } else { 'ok   ' }
        Write-Host ("  {0}  {1,-20} {2,2} enganches" -f $marca, $grupo.Name, $grupo.Count) -ForegroundColor $color

        if (-not $Quiet) {
            foreach ($f in ($grupo.Group | Where-Object { $_.estado -eq 'historico' })) {
                Write-Host ("          historico   {0}" -f $f.token) -ForegroundColor DarkGray
            }
            foreach ($f in ($grupo.Group | Where-Object { $_.estado -eq 'sin-comprobar' })) {
                Write-Host ("          sin medir   {0}" -f $f.token) -ForegroundColor DarkGray
            }
        }
        foreach ($f in $malos) {
            Write-Host ("          FALTA [{0}]  {1}" -f $f.severity, $f.token) -ForegroundColor Red
            Write-Host ("                      {0}" -f $f.si_falta) -ForegroundColor Yellow
        }
    }

    if ($mudados.Count -and -not $Quiet) {
        Write-Host ''
        Write-Host '  sigue existiendo, pero ya no en el archivo que dice el contrato:' -ForegroundColor DarkYellow
        foreach ($m in $mudados) {
            Write-Host ("      {0,-18} {1}" -f $m.mod, $m.token) -ForegroundColor DarkYellow
            Write-Host ("          contrato: {0}" -f $m.declarado_en) -ForegroundColor DarkGray
            Write-Host ("          ahora   : {0}" -f $m.declara) -ForegroundColor DarkGray
        }
        Write-Host '      No rompe nada hoy. Interesa porque suele ser el paso previo' -ForegroundColor DarkGray
        Write-Host '      a que desaparezca, y porque deja el contrato apuntando mal.' -ForegroundColor DarkGray
    }

    if ($base) {
        Write-Host ''
        if ($base.buildId -ne $buildId) {
            Write-Host ("  Build distinta de la validada: {0} ({1}) -> {2} ({3})" -f
                $base.zen, $base.buildId, $version, $buildId) -ForegroundColor Cyan
        }
        else {
            Write-Host "  Misma build que la linea base ($($base.zen))." -ForegroundColor DarkGray
        }
        if ($base.zenmods_sha256 -and $zenModsHash -and $base.zenmods_sha256 -ne $zenModsHash) {
            Write-Host '  ZenMods.mjs HA CAMBIADO. Lee su diff antes de confiar en el instalador:' -ForegroundColor Yellow
            Write-Host '  de ahi salen el formato de zen-themes.css, el esquema de zen-themes.json,' -ForegroundColor DarkGray
            Write-Host '  la siembra de valores por defecto y el id del div de preferencias.' -ForegroundColor DarkGray
        }
        if ($cambios.Count) {
            Write-Host ("  {0} enganche(s) han cambiado de estado:" -f $cambios.Count) -ForegroundColor Yellow
            foreach ($ch in $cambios) {
                Write-Host ("      {0,-58} {1} -> {2}" -f $ch.clave, $ch.de, $ch.a) -ForegroundColor Yellow
            }
        }
        elseif ($base.buildId -ne $buildId) {
            Write-Host '  Ningun enganche ha cambiado de estado pese al cambio de build.' -ForegroundColor Green
        }
    }
    else {
        Write-Host ''
        Write-Host '  Sin linea base. Cuando compruebes que con esta version todo va bien:' -ForegroundColor DarkGray
        Write-Host '      .\dev\powershell\Test-ZenContract.ps1 -UpdateBaseline' -ForegroundColor DarkGray
    }

    Write-Host ''
    if ($resumen.criticos) {
        Write-Host "$($resumen.criticos) enganche(s) CRITICO(s) desaparecido(s)." -ForegroundColor Red
    }
    elseif ($resumen.faltan) {
        Write-Host "$($resumen.faltan) enganche(s) desaparecido(s), ninguno critico." -ForegroundColor Yellow
    }
    else {
        Write-Host 'Todos los enganches comprobables siguen en su sitio.' -ForegroundColor Green
    }
    if ($resumen.sin_comprobar) {
        Write-Host "$($resumen.sin_comprobar) no se pueden medir aqui: usa .\dev\powershell\Test-ZenLive.ps1" -ForegroundColor DarkGray
    }
}

# 0 al dia · 1 falta algo no critico · 2 falta algo critico · 3 no se pudo leer
if ($resumen.criticos) { exit 2 }
if ($resumen.faltan) { exit 1 }
exit 0
