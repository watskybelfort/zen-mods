<#
.SYNOPSIS
    Arma el userscript de Zen Letra Viva desde los parciales de mods\youtube-music\live-lyrics\src\.

.DESCRIPTION
    Concatena mods\youtube-music\live-lyrics\src\*.js en orden numerico dentro de una sola funcion
    anonima, le pone delante la cabecera de userscript de mods\youtube-music\live-lyrics\cabecera.txt y
    escribe el resultado en mods\youtube-music\live-lyrics\dist\zen-letra-viva.user.js.

    Es el mismo patron que la capa web: userContent.css se arma con los
    parciales de web\, y esto se arma con los de mods\youtube-music\live-lyrics\src\. Los parciales se
    leen solos y el entregable es uno.

    Comprueba tres cosas antes de escribir, porque las tres se rompen calladas:
      1. Que la version de la cabecera y la del prologo coinciden. Si no, el
         gestor de userscripts cree que no hay actualizacion y sirve el viejo.
      2. Que ningun parcial abre un comentario de bloque y no lo cierra. Un
         /* sin */ se come todo el parcial siguiente sin dar error de sintaxis.
      3. Que el resultado es JavaScript valido, preguntandole a node si esta.

.PARAMETER Salida
    Ruta del .user.js a escribir. Por defecto mods\youtube-music\live-lyrics\dist\zen-letra-viva.user.js.

.PARAMETER SinComprobar
    Salta la comprobacion de sintaxis con node. Solo para maquinas sin node.

.EXAMPLE
    .\Build-LetraViva.ps1
#>
[CmdletBinding()]
param(
    [string] $Salida,
    [switch] $SinComprobar
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$FuenteDir = Join-Path $RepoRoot 'mods\youtube-music\live-lyrics\src'
$CabeceraFile = Join-Path $RepoRoot 'mods\youtube-music\live-lyrics\cabecera.txt'
if (-not $Salida) { $Salida = Join-Path $RepoRoot 'mods\youtube-music\live-lyrics\dist\zen-letra-viva.user.js' }

if (-not (Test-Path $FuenteDir)) { throw "No se encontro la carpeta de parciales en $FuenteDir" }
if (-not (Test-Path $CabeceraFile)) { throw "No se encontro la cabecera en $CabeceraFile" }

# --- 1. La cabecera y su version -----------------------------------------
$Cabecera = (Get-Content $CabeceraFile -Raw -Encoding UTF8).TrimEnd()
if ($Cabecera -notmatch '(?m)^//\s*@match\s+https://music\.youtube\.com/') {
    throw 'La cabecera no declara @match para music.youtube.com: el userscript no correria en ningun sitio'
}
if ($Cabecera -notmatch '(?m)^//\s*@version\s+(\S+)') {
    throw 'La cabecera no declara @version'
}
$Version = $Matches[1]

# --- 2. Los parciales ------------------------------------------------------
$Parciales = @(Get-ChildItem $FuenteDir -Filter '*.js' | Sort-Object Name)
if ($Parciales.Count -eq 0) { throw "No hay parciales .js en $FuenteDir" }

$Cuerpo = New-Object System.Text.StringBuilder
foreach ($p in $Parciales) {
    $texto = Get-Content $p.FullName -Raw -Encoding UTF8

    # Comentario de bloque abierto y sin cerrar. Se cuenta sobre el texto crudo:
    # es una heuristica, pero el caso que importa (un /* huerfano al final del
    # archivo) lo caza siempre, y es justo el que apaga el parcial siguiente.
    $abre = ([regex]::Matches($texto, '/\*')).Count
    $cierra = ([regex]::Matches($texto, '\*/')).Count
    if ($abre -ne $cierra) {
        throw "$($p.Name): $abre '/*' contra $cierra '*/'. Un comentario sin cerrar se come el parcial siguiente sin dar error"
    }

    [void]$Cuerpo.AppendLine("/* ===== $($p.Name) ".PadRight(76, '=') + ' */')
    [void]$Cuerpo.AppendLine($texto.TrimEnd())
    [void]$Cuerpo.AppendLine()
}

$CuerpoTexto = $Cuerpo.ToString()

# La version viaja de la cabecera al codigo, no al contrario: un solo sitio
# que editar al subir de version.
if ($CuerpoTexto -notmatch '__VERSION__') {
    throw 'Ningun parcial contiene el marcador __VERSION__; el motor no sabria su propia version'
}
$CuerpoTexto = $CuerpoTexto -replace '__VERSION__', $Version

# --- 3. El envoltorio ------------------------------------------------------
# 'use strict' lo pone el prologo dentro de la funcion, no aqui: en un
# userscript el ambito exterior no es nuestro.
$Contenido = @"
$Cabecera

/* Generado por dev\powershell\Build-LetraViva.ps1 desde mods\youtube-music\live-lyrics\src\ — NO EDITAR A MANO.
   $($Parciales.Count) parciales, version $Version.
   Para cambiar algo se edita el parcial y se vuelve a ejecutar el build. */

(() => {
$CuerpoTexto
})();
"@

# --- 4. Comprobacion de sintaxis ------------------------------------------
$SalidaDir = Split-Path -Parent $Salida
if (-not (Test-Path $SalidaDir)) { New-Item -ItemType Directory -Path $SalidaDir -Force | Out-Null }

if (-not $SinComprobar) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        $tmp = Join-Path $env:TEMP "letra-viva-check-$PID.js"
        # Se comprueba SOLO el cuerpo envuelto, sin la cabecera de userscript:
        # las lineas @grant no son JavaScript pero si comentarios, asi que
        # tambien valdrian; se quitan igual para que el numero de linea del
        # error apunte a algo util.
        Set-Content -Path $tmp -Value "(() => {`n$CuerpoTexto`n})();" -Encoding UTF8
        $err = & node --check $tmp 2>&1
        $ok = $LASTEXITCODE -eq 0
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        if (-not $ok) { throw "El userscript no es JavaScript valido:`n$err" }
        Write-Host 'Sintaxis        : valida (node --check)'
    } else {
        Write-Host 'Sintaxis        : sin comprobar (node no esta en el PATH)'
    }
}

Set-Content -Path $Salida -Value $Contenido -Encoding UTF8

$kb = [math]::Round((Get-Item $Salida).Length / 1KB, 1)
Write-Host "Parciales       : $($Parciales.Count) ($($Parciales.Name -join ', '))"
Write-Host "Version         : $Version"
Write-Host "Escrito         : $Salida ($kb KB)"
