<#
.SYNOPSIS
    Instala Zen Sintonia: la pestana de YouTube Music le cuenta al widget de
    musica que suena, y nada mas del navegador puede colarse.

.DESCRIPTION
    Escribe en tres sitios, y conviene saber por que en cada uno:

      <instalacion>\config.js                     el cargador de autoconfig, COMPARTIDO
                                                  con los demas mods nativos (core\config.js)
      <instalacion>\defaults\pref\zen-sintonia.js las prefs que lo encienden
      <perfil>\chrome\zen-sintonia\proceso.js     el inyector

    Las dos primeras van en el directorio de instalacion porque el autoconfig se
    lee antes de que exista un perfil. Eso significa DOS COSAS:

      1. Hace falta ejecutarlo como administrador.
      2. Una actualizacion de Zen reemplaza el directorio de instalacion y se
         lleva por delante esos dos archivos. El inyector, que vive en el perfil,
         sobrevive. Cuando pase, se vuelve a ejecutar con -SoloInstalacion.

    EL CARGADOR ES DE TODOS. La pref general.config.filename admite un solo
    archivo, asi que no puede haber un config.js por mod. El que se escribe aqui
    lleva la tabla con TODOS los mods nativos del repo y carga solo los que
    encuentre en el perfil, asi que instalar Sintonia no desarma Letra Viva ni al
    reves, y el orden de los instaladores da igual.

    Si ya hay un config.js que no es del repo (fx-autoconfig, por ejemplo), el
    script NO lo sobrescribe: avisa y se para.

    El puerto tiene que coincidir con el del widget. Por defecto 9463 en los dos
    lados; si el widget se arranca con -Port, hay que pasar el mismo -Puerto aqui
    (o cambiar zen.sintonia.puerto en about:config).

.PARAMETER RutaZen
    Directorio de instalacion de Zen. Si se omite se busca en los sitios de
    siempre.

.PARAMETER ProfilePath
    Ruta del perfil. Si se omite se detecta el perfil por defecto.

.PARAMETER Puerto
    Puerto del widget de musica. Por defecto 9463.

.PARAMETER SoloInstalacion
    Reescribe unicamente config.js y las prefs. Es lo que hay que ejecutar
    despues de que Zen se actualice.

.PARAMETER SoloPerfil
    Reescribe unicamente el inyector del perfil. No necesita administrador.

.PARAMETER Desinstalar
    Quita las piezas de este mod. El cargador compartido se queda si hay otro mod
    nativo instalado que lo necesite.

.EXAMPLE
    .\Install-Sintonia.ps1
.EXAMPLE
    .\Install-Sintonia.ps1 -SoloPerfil
.EXAMPLE
    .\Install-Sintonia.ps1 -Puerto 9500
#>
[CmdletBinding()]
param(
    [string] $RutaZen,
    [string] $ProfilePath,
    [int]    $Puerto = 9463,
    [switch] $SoloInstalacion,
    [switch] $SoloPerfil,
    [switch] $Desinstalar
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$NativoDir = Join-Path $RepoRoot 'mods\youtube-music\obs-now-playing\nativo'
$Cargador = Join-Path $RepoRoot 'core\config.js'

# Marca que dice que el config.js instalado salio de este repo. Vale cualquiera
# de los dos nombres: el cargador compartido los lleva a ambos, y el config.js
# viejo de Letra Viva -- de cuando era solo suyo -- lleva el primero. Asi este
# instalador reconoce como propio el que dejo el otro y lo puede actualizar al
# compartido sin quejarse.
$MarcaNuestra = 'Zen Letra Viva|Zen Sintonia'

if ($Puerto -lt 1024 -or $Puerto -gt 65535) { throw "Puerto fuera de rango: $Puerto" }

# --- Localizar Zen ---------------------------------------------------------
function Resolve-ZenInstall {
    param([string] $Sugerida)

    if ($Sugerida) {
        if (-not (Test-Path (Join-Path $Sugerida 'application.ini'))) {
            throw "En $Sugerida no hay un application.ini: no parece la instalacion de Zen"
        }
        return $Sugerida
    }

    $candidatos = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Zen Browser'),
        (Join-Path $env:LOCALAPPDATA 'Zen Browser'),
        (Join-Path ${env:ProgramFiles} 'Zen Browser'),
        (Join-Path ${env:ProgramFiles(x86)} 'Zen Browser')
    )
    foreach ($c in $candidatos) {
        if ($c -and (Test-Path (Join-Path $c 'application.ini'))) { return $c }
    }

    foreach ($clave in @('HKLM:\SOFTWARE\Clients\StartMenuInternet\zen\shell\open\command',
                         'HKCU:\SOFTWARE\Clients\StartMenuInternet\zen\shell\open\command')) {
        try {
            $cmd = (Get-ItemProperty -Path $clave -ErrorAction Stop).'(default)'
            if ($cmd) {
                $exe = ($cmd -replace '^"([^"]+)".*$', '$1')
                $dir = Split-Path -Parent $exe
                if (Test-Path (Join-Path $dir 'application.ini')) { return $dir }
            }
        } catch { }
    }

    throw 'No encontre la instalacion de Zen. Pasala con -RutaZen "C:\ruta\a\Zen Browser"'
}

function Test-Administrador {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

$ZenDir = Resolve-ZenInstall -Sugerida $RutaZen
if (-not $ProfilePath) { $ProfilePath = Resolve-ZenProfile }

$ConfigDestino = Join-Path $ZenDir 'config.js'
$PrefsDestino = Join-Path $ZenDir 'defaults\pref\zen-sintonia.js'
$ProcesoDir = Join-Path $ProfilePath 'chrome\zen-sintonia'
$ProcesoDestino = Join-Path $ProcesoDir 'proceso.js'
$LetraDir = Join-Path $ProfilePath 'chrome\zen-letra'

Write-Host "Instalacion     : $ZenDir"
Write-Host "Perfil          : $ProfilePath"

# --- Desinstalar -----------------------------------------------------------
if ($Desinstalar) {
    $quitados = 0

    if (Test-Path $ProcesoDir) {
        Remove-Item $ProcesoDir -Recurse -Force
        $quitados++
        Write-Host "Quitado         : $ProcesoDir"
    }

    if (Test-Path $PrefsDestino) {
        if (-not (Test-Administrador)) { throw 'Hace falta ejecutar como administrador para tocar el directorio de instalacion' }
        Remove-Item $PrefsDestino -Force
        $quitados++
        Write-Host "Quitado         : $PrefsDestino"
    }

    # EL CARGADOR NO SE BORRA A LA LIGERA. Es compartido: si queda otro mod
    # nativo instalado, llevarselo lo dejaria muerto tambien a el, y ese fallo no
    # se relaciona con haber desinstalado esto en semanas.
    if (Test-Path $ConfigDestino) {
        if (Test-Path (Join-Path $LetraDir 'proceso.js')) {
            Write-Host "Cargador        : se queda, lo sigue usando Zen Letra Viva"
        } else {
            $contenido = Get-Content $ConfigDestino -Raw -Encoding UTF8
            if ($contenido -match $MarcaNuestra) {
                if (-not (Test-Administrador)) { throw 'Hace falta ejecutar como administrador para tocar el directorio de instalacion' }
                Remove-Item $ConfigDestino -Force
                $quitados++
                Write-Host "Quitado         : $ConfigDestino"
            } else {
                Write-Warning "$ConfigDestino no es nuestro; se deja como esta"
            }
        }
    }

    Write-Host "Desinstalado    : $quitados pieza(s). Reinicia Zen."
    return
}

# --- 1. El inyector, en el perfil -----------------------------------------
if (-not $SoloInstalacion) {
    if (-not (Test-Path (Join-Path $NativoDir 'proceso.js'))) {
        throw "No existe $NativoDir\proceso.js. El repo esta incompleto."
    }
    if (-not (Test-Path $ProcesoDir)) { New-Item -ItemType Directory -Path $ProcesoDir -Force | Out-Null }

    # Se copia tal cual, sin generar nada: el recolector que corre dentro de la
    # pagina va escrito como una funcion dentro de este mismo archivo y se inyecta
    # con toString(), asi que no hay nada que compilar ni que escapar.
    Copy-Item (Join-Path $NativoDir 'proceso.js') $ProcesoDestino -Force

    $kb = [math]::Round((Get-Item $ProcesoDestino).Length / 1KB, 1)
    Write-Host "Inyector        : $ProcesoDestino ($kb KB)"
}

# --- 2. El cargador y las prefs, en la instalacion ------------------------
if (-not $SoloPerfil) {
    if (Test-Path $ConfigDestino) {
        $actual = Get-Content $ConfigDestino -Raw -Encoding UTF8
        if ($actual -notmatch $MarcaNuestra) {
            throw @"
Ya hay un $ConfigDestino que no es nuestro.

Probablemente sea fx-autoconfig u otro cargador. Pisarlo dejaria sin arrancar a lo
que hubiera antes, y ese fallo no se relaciona con esto en semanas. Salida:

  - Anadir a mano al config.js existente el contenido de core\config.js, que es
    un bucle sobre una tabla de mods: carga el inyector de cada uno desde el perfil.
"@
        }
    }

    if (-not (Test-Administrador)) {
        throw @"
Hace falta administrador para escribir en $ZenDir.

Abre PowerShell como administrador y repite:
  Start-Process powershell -Verb RunAs
"@
    }

    $prefsDir = Split-Path -Parent $PrefsDestino
    if (-not (Test-Path $prefsDir)) { New-Item -ItemType Directory -Path $prefsDir -Force | Out-Null }

    Write-Utf8NoBom -Path $ConfigDestino -Content (Get-Content $Cargador -Raw -Encoding UTF8)

    # El puerto se siembra en el archivo de prefs en lugar de dejarlo fijo en el
    # codigo, para que cambiarlo no obligue a tocar el mod: es una linea de
    # about:config, o este instalador con -Puerto.
    $prefs = Get-Content (Join-Path $NativoDir 'config-prefs.js') -Raw -Encoding UTF8
    $prefs = $prefs -replace "pref\('zen\.sintonia\.puerto', \d+\);", "pref('zen.sintonia.puerto', $Puerto);"
    Write-Utf8NoBom -Path $PrefsDestino -Content $prefs

    Write-Host "Cargador        : $ConfigDestino"
    Write-Host "Prefs           : $PrefsDestino (puerto $Puerto)"
}

Write-Host ''
Write-Host 'Listo. Reinicia Zen del todo (cerrar la ventana no basta si queda en la bandeja),'
Write-Host 'levanta el widget con widgets\music\start-widget.bat y pon musica en'
Write-Host 'music.youtube.com. Para comprobarlo:'
Write-Host "  http://localhost:$Puerto/nowplaying   ->   el campo fuente tiene que decir ""ytm"""
