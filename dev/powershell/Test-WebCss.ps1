<#
.SYNOPSIS
    Comprueba que la capa web y los mods no tienen comentarios rotos.

.DESCRIPTION
    Existe por un fallo real que estuvo semanas sin verse. En el bloque de
    ChatGPT de mods\appearance\acrylic-glass\web\50-sites.css habia un `*/` de mas:

        ... 0 elementos con backdrop-filter. */
        Los pseudoelementos van aparte a proposito ... */
        *, *::before, *::after { backdrop-filter: none !important; }

    El primer `*/` cerraba el comentario, asi que la frase siguiente pasaba a
    ser texto CSS. El parser se lo traga como si fuera un selector, se come
    todo hasta la primera `{`, y descarta la regla entera. Resultado: la regla
    que quitaba los backdrop-filter de ChatGPT NO se aplicaba, y no habia
    ningun aviso en ninguna parte. CSS no falla: descarta y sigue.

    Esa es justo la trampa de este repo, donde los archivos son mitad CSS y
    mitad explicacion: un comentario mal cerrado no rompe nada visible, solo
    apaga en silencio la regla que viene detras.

    Se comprueban tres cosas:
      - `*/` fuera de comentario   -> descarta la regla siguiente
      - `/*` sin cerrar            -> se traga el resto del archivo
      - llaves descompensadas      -> descoloca los @-moz-document

    Codigos de salida: 0 todo bien, 1 hay algo que revisar.

.EXAMPLE
    .\dev\powershell\Test-WebCss.ps1
#>
[CmdletBinding()]
param([string[]] $Path)

$ErrorActionPreference = 'Stop'

if (-not $Path) {
    $repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $Path = @(
        (Get-ChildItem (Join-Path $repo 'web') -Filter *.css -ErrorAction SilentlyContinue).FullName
        (Get-ChildItem (Join-Path $repo 'mod') -Filter chrome.css -Recurse -ErrorAction SilentlyContinue).FullName
    ) | Where-Object { $_ }
}

$fallos = 0

foreach ($file in $Path) {
    $txt = [System.IO.File]::ReadAllText($file)
    $problemas = @()
    $i = 0
    $n = $txt.Length
    $depth = 0
    $linea = 1

    while ($i -lt $n) {
        $c = $txt[$i]

        if ($c -eq "`n") { $linea++; $i++; continue }

        # Dentro de un comentario no hay CSS: se salta entero.
        if ($c -eq '/' -and $i + 1 -lt $n -and $txt[$i + 1] -eq '*') {
            $fin = $txt.IndexOf('*/', $i + 2)
            if ($fin -lt 0) {
                $problemas += "linea ${linea}: /* sin cerrar (se traga el resto del archivo)"
                break
            }
            for ($k = $i; $k -lt $fin; $k++) { if ($txt[$k] -eq "`n") { $linea++ } }
            $i = $fin + 2
            continue
        }

        if ($c -eq '*' -and $i + 1 -lt $n -and $txt[$i + 1] -eq '/') {
            $problemas += "linea ${linea}: */ suelto (descarta la regla siguiente)"
            $i += 2
            continue
        }

        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') {
            $depth--
            if ($depth -lt 0) { $problemas += "linea ${linea}: } de mas"; $depth = 0 }
        }
        $i++
    }

    if ($depth -ne 0) { $problemas += "quedan $depth llave(s) sin cerrar" }

    $nombre = Split-Path -Leaf $file
    if ($problemas.Count) {
        $fallos++
        Write-Host ("FALLA  {0}" -f $nombre) -ForegroundColor Red
        foreach ($p in $problemas) { Write-Host "         $p" }
        Write-Host "         $file" -ForegroundColor DarkGray
    }
    else {
        Write-Host ("ok     {0}" -f $nombre) -ForegroundColor DarkGray
    }
}

Write-Host ''
if ($fallos) {
    Write-Host "$fallos archivo(s) con comentarios rotos. Las reglas que vengan detras no se estan aplicando." -ForegroundColor Red
    exit 1
}
Write-Host 'Sin comentarios rotos.' -ForegroundColor Green
exit 0
