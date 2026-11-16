<#
.SYNOPSIS
    Instala Zen Letra Viva sin gestor de userscripts, con el cargador nativo.

.DESCRIPTION
    Deja el mod funcionando en Zen sin depender de ninguna extension. Escribe en
    dos sitios, y conviene saber por que en cada uno:

      <instalacion>\config.js                  el cargador de autoconfig (COMPARTIDO
                                               por todos los mods nativos: core\config.js)
      <instalacion>\defaults\pref\zen-letra.js las prefs que lo encienden
      <perfil>\chrome\zen-letra\proceso.js     el inyector
      <perfil>\chrome\zen-letra\zen-letra-viva.user.js  el motor, copiado tal cual

    El motor se copia SIN transformarlo, y es a proposito: el archivo que corre
    con el cargador nativo es el mismo que se instalaria en un gestor de
    userscripts. Un artefacto, dos cargadores. El primer intento fue generar el
    inyector con el motor incrustado como literal de cadena, y salio mal de la
    forma mas instructiva: ConvertTo-Json de PowerShell 5.1, con una cadena, no
    devuelve un literal de cadena sino un objeto {"value":...}. El comprobador de
    sintaxis daba el archivo por bueno, porque un literal de objeto es sintaxis
    valida, y el mod habria quedado instalado y muerto.

    Las dos primeras van en el directorio de instalacion porque el autoconfig se
    lee antes de que exista un perfil. Eso significa DOS COSAS que hay que tener
    presentes:

      1. Casi siempre hace falta ejecutarlo como administrador.
      2. Una actualizacion de Zen reemplaza el directorio de instalacion y se
         lleva por delante esos dos archivos. El inyector, que vive en el perfil,
         sobrevive. Cuando eso pase, se vuelve a ejecutar este script con
         -SoloInstalacion y en dos segundos esta arreglado; Doctor.ps1 lo detecta.

    Si ya hay un config.js de otra cosa (fx-autoconfig, por ejemplo), el script NO
    lo sobrescribe: avisa y se para. Pisarlo dejaria sin cargador a lo que hubiera
    antes, y eso es de las cosas que uno tarda semanas en relacionar.

.PARAMETER RutaZen
    Directorio de instalacion de Zen. Si se omite se busca en los sitios de
    siempre.

.PARAMETER ProfilePath
    Ruta del perfil. Si se omite se detecta el perfil por defecto.

.PARAMETER SoloInstalacion
    Reescribe unicamente config.js y las prefs. Es lo que hay que ejecutar despues
    de que Zen se actualice.

.PARAMETER SoloPerfil
    Reescribe unicamente el inyector y el motor del perfil. Es lo que hay que
    ejecutar despues de cambiar el motor y volver a compilarlo, y no necesita
    administrador.

.PARAMETER Desinstalar
    Quita las tres piezas.

.EXAMPLE
    .\Install-LetraNativa.ps1
.EXAMPLE
    .\Install-LetraNativa.ps1 -SoloPerfil
#>
[CmdletBinding()]
param(
    [string] $RutaZen,
    [string] $ProfilePath,
    [switch] $SoloInstalacion,
    [switch] $SoloPerfil,
    [switch] $Desinstalar
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'ZenProfile.psm1') -Force

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$NativoDir = Join-Path $RepoRoot 'mods\youtube-music\live-lyrics\nativo'
$Construido = Join-Path $RepoRoot 'mods\youtube-music\live-lyrics\dist\zen-letra-viva.user.js'

# El cargador es COMPARTIDO y vive fuera de mods\youtube-music\live-lyrics\: la pref
# general.config.filename admite un solo archivo, asi que el directorio de
# instalacion solo puede tener un config.js para todos los mods nativos. Lo
# escriben igual este instalador y el de Zen Sintonia, con el mismo contenido,
# asi que el orden no importa y reinstalar uno no desarma al otro.
$Cargador = Join-Path $RepoRoot 'core\config.js'

$MarcaNuestra = 'Zen Letra Viva'

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

    # Ultimo recurso: preguntarle al registro por el ejecutable registrado.
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
$PrefsDestino = Join-Path $ZenDir 'defaults\pref\zen-letra.js'
$ProcesoDir = Join-Path $ProfilePath 'chrome\zen-letra'
$ProcesoDestino = Join-Path $ProcesoDir 'proceso.js'
$MotorDestino = Join-Path $ProcesoDir 'zen-letra-viva.user.js'

Write-Host "Instalacion     : $ZenDir"
Write-Host "Perfil          : $ProfilePath"

# --- Desinstalar -----------------------------------------------------------
if ($Desinstalar) {
    $quitados = 0
    foreach ($f in @($ConfigDestino, $PrefsDestino)) {
        if (Test-Path $f) {
            $contenido = Get-Content $f -Raw -Encoding UTF8
            if ($contenido -notmatch [regex]::Escape($MarcaNuestra)) {
                Write-Warning "$f no es nuestro; se deja como esta"
                continue
            }
            if (-not (Test-Administrador)) { throw 'Hace falta ejecutar como administrador para tocar el directorio de instalacion' }
            Remove-Item $f -Force
            $quitados++
        }
    }
    if (Test-Path $ProcesoDir) { Remove-Item $ProcesoDir -Recurse -Force; $quitados++ }
    Write-Host "Desinstalado    : $quitados pieza(s). Reinicia Zen."
    return
}

# --- Comprobaciones --------------------------------------------------------
if (-not $SoloInstalacion) {
    if (-not (Test-Path $Construido)) {
        throw "No existe $Construido. Ejecuta primero dev\powershell\Build-LetraViva.ps1"
    }
}

# --- 1. El inyector y el motor, en el perfil ------------------------------
if (-not $SoloInstalacion) {
    if (-not (Test-Path $ProcesoDir)) { New-Item -ItemType Directory -Path $ProcesoDir -Force | Out-Null }

    # Los dos se copian tal cual. El inyector no se genera y el motor no se
    # transforma: config.js lo lee del disco y lo publica en sharedData, que es lo
    # que evita todo el asunto del escapado.
    Copy-Item (Join-Path $NativoDir 'proceso.js') $ProcesoDestino -Force
    Copy-Item $Construido $MotorDestino -Force

    $kbMotor = [math]::Round((Get-Item $MotorDestino).Length / 1KB, 1)
    Write-Host "Inyector        : $ProcesoDestino"
    Write-Host "Motor           : $MotorDestino ($kbMotor KB)"
}

# --- 2. El cargador, en la instalacion ------------------------------------
if (-not $SoloPerfil) {
    if (Test-Path $ConfigDestino) {
        $actual = Get-Content $ConfigDestino -Raw -Encoding UTF8
        if ($actual -notmatch [regex]::Escape($MarcaNuestra)) {
            throw @"
Ya hay un $ConfigDestino que no es nuestro.

Probablemente sea fx-autoconfig u otro cargador. Pisarlo dejaria sin arrancar a lo
que hubiera antes, y ese fallo no se relaciona con esto en semanas. Salidas:

  - Anadir a mano al config.js existente el contenido de core\config.js
    (es un bucle sobre una tabla: carga el inyector de cada mod del perfil).
  - O instalar el mod como userscript, que no toca el directorio de instalacion:
    mods\youtube-music\live-lyrics\dist\zen-letra-viva.user.js
"@
        }
    }

    if (-not (Test-Administrador)) {
        throw @"
Hace falta administrador para escribir en $ZenDir.

Abre PowerShell como administrador y repite. Si prefieres no tocar el directorio de
instalacion, instala el mod como userscript: mods\youtube-music\live-lyrics\dist\zen-letra-viva.user.js
"@
    }

    $prefsDir = Split-Path -Parent $PrefsDestino
    if (-not (Test-Path $prefsDir)) { New-Item -ItemType Directory -Path $prefsDir -Force | Out-Null }

    Write-Utf8NoBom -Path $ConfigDestino -Content (Get-Content $Cargador -Raw -Encoding UTF8)
    Write-Utf8NoBom -Path $PrefsDestino -Content (Get-Content (Join-Path $NativoDir 'config-prefs.js') -Raw -Encoding UTF8)

    Write-Host "Cargador        : $ConfigDestino"
    Write-Host "Prefs           : $PrefsDestino"
}

Write-Host ''
Write-Host 'Listo. Reinicia Zen del todo (cerrar la ventana no basta si queda en la bandeja)'
Write-Host 'y abre music.youtube.com. Para comprobarlo, en la consola de la pagina:'
Write-Host '  window.__zenLetra.estado()'
Write-Host 'El campo via.red tiene que decir "puente".'
