<#
.SYNOPSIS
    Comprueba sobre el Zen abierto que los mods no solo encajan, sino que hacen
    efecto.

.DESCRIPTION
    Test-ZenContract.ps1 prueba que el NOMBRE existe. Eso no prueba que el
    EFECTO ocurra: el elemento puede seguir llamandose igual y haber dejado de
    pintar el fondo, o tenerlo tapado por una capa nueva, o el CSS del mod puede
    no haberse cargado siquiera. Aqui se mide lo segundo, que es lo que el
    usuario ve.

    Es la version automatizada de una leccion que ya esta en el historial de este
    repo: se dio por demostrado que `backdrop-filter` no funcionaba, se quitaron
    reglas por eso, y lo que no funcionaba era la forma de medirlo. Un
    verificador que solo comprueba nombres habria firmado ese fallo como
    correcto.

    POR QUE MARIONETTE Y NO BiDi. WebDriver BiDi solo llega al CONTENIDO de las
    paginas. Todo lo que toca este repo vive en el chrome del navegador
    —browser.xhtml—, y a eso solo se entra por Marionette, que tiene un contexto
    `chrome` explicito. Es tambien la razon de que Start-ZenClaudeLink.ps1 tenga
    el interruptor -Marionette.

    QUE COMPRUEBA
      1. Que el CSS de cada mod esta REALMENTE aplicado, mirando una variable que
         solo declara ese mod. Es el unico check de extremo a extremo: si falla,
         no hace falta seguir mirando nada mas.
      2. Que cada selector del contrato encaja con algo en el DOM de verdad.
      3. Que cada pref del contrato existe en este binario. Aqui se resuelven las
         que el omni.ja no puede contestar, como jit_trustedprincipals, que vive
         compilada en xul.dll.
      4. Las afirmaciones de efecto del contrato (campo `vivo`): que el fondo sea
         transparente, que el circulo mida lo que debe, y demas.

.PARAMETER Port
    Puerto de Marionette. 2828 por defecto.

.PARAMETER Contract
    Carpeta de contratos. Por defecto dev\contract\ del repo.

.PARAMETER Mod
    Comprobar solo estos mods.

.PARAMETER Json
    Salida JSON.

.EXAMPLE
    .\dev\powershell\Start-ZenClaudeLink.ps1 -Marionette
    .\dev\powershell\Test-ZenLive.ps1
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)] [int] $Port = 2828,
    [string] $Contract,
    [string[]] $Mod,
    [switch] $Json
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $Contract) { $Contract = Join-Path $RepoRoot 'contract' }
if (-not (Test-Path $Contract)) { throw "No se encontro la carpeta de contrato en $Contract" }

# --------------------------------------------------------------------------
# Cliente Marionette
# El encuadre es `<bytes>:<json>`. El JSON es un array posicional:
#   peticion  [0, id, comando, parametros]
#   respuesta [1, id, error, resultado]
# Al conectar, el servidor manda primero su saludo sin que nadie lo pida, asi
# que hay que leerlo antes de hablar o el primer id se descuadra.
# --------------------------------------------------------------------------
$script:cliente = $null
$script:flujo = $null
$script:idMensaje = 0

function Connect-Marionette {
    param([int] $Puerto)
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect('127.0.0.1', $Puerto) }
    catch {
        throw ("No hay nadie escuchando en 127.0.0.1:$Puerto.`n" +
            "Marionette no se levanta solo: arranca Zen con`n" +
            "  .\dev\powershell\Start-ZenClaudeLink.ps1 -Marionette")
    }
    $script:cliente = $c
    $script:flujo = $c.GetStream()
    $script:flujo.ReadTimeout = 60000
    [void](Read-MarionetteRaw)   # el saludo
}

function Read-MarionetteRaw {
    # La longitud viene en ASCII hasta el primer ':'
    $largo = ''
    while ($true) {
        $b = $script:flujo.ReadByte()
        if ($b -lt 0) { throw 'Marionette cerro la conexion.' }
        $ch = [char] $b
        if ($ch -eq ':') { break }
        $largo += $ch
    }
    $n = [int] $largo
    $buf = New-Object byte[] $n
    $leidos = 0
    while ($leidos -lt $n) {
        $r = $script:flujo.Read($buf, $leidos, $n - $leidos)
        if ($r -le 0) { throw 'Marionette corto la respuesta a medias.' }
        $leidos += $r
    }
    return [System.Text.Encoding]::UTF8.GetString($buf)
}

function Invoke-Marionette {
    param([string] $Comando, $Parametros = @{})
    $script:idMensaje++
    $cuerpo = ConvertTo-Json @(0, $script:idMensaje, $Comando, $Parametros) -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($cuerpo)
    $marco = [System.Text.Encoding]::UTF8.GetBytes("$($bytes.Length):")
    $script:flujo.Write($marco, 0, $marco.Length)
    $script:flujo.Write($bytes, 0, $bytes.Length)
    $script:flujo.Flush()

    $resp = ConvertFrom-Json (Read-MarionetteRaw)
    # [1, id, error, resultado]
    if ($null -ne $resp[2]) {
        $e = $resp[2]
        throw ("Marionette: {0} {1}" -f $e.error, $e.message)
    }
    return $resp[3]
}

function Invoke-ChromeJs {
    <#
    .SYNOPSIS
        Ejecuta JS en el chrome de Zen y devuelve el valor.
    .DESCRIPTION
        Se envuelve en try/catch dentro de la propia pagina: un fallo de UNA
        comprobacion no puede tumbar la sesion entera, porque entonces el primer
        selector obsoleto impediria ver los otros veinte.
    #>
    param([string] $Js)
    $envuelto = @"
try { return JSON.stringify({ ok: true, v: (function(){ $Js })() }); }
catch (e) { return JSON.stringify({ ok: false, e: String(e && e.message || e) }); }
"@
    $crudo = Invoke-Marionette 'WebDriver:ExecuteScript' @{ script = $envuelto; args = @() }
    if ($crudo -is [System.Management.Automation.PSCustomObject] -and $crudo.PSObject.Properties['value']) {
        $crudo = $crudo.value
    }
    if (-not $crudo) { return [pscustomobject]@{ ok = $false; e = 'sin respuesta' } }
    return ConvertFrom-Json $crudo
}

# --- 1. Contratos ----------------------------------------------------------
$contracts = @()
foreach ($f in (Get-ChildItem $Contract -Filter '*.json' | Sort-Object Name)) {
    $c = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    # baseline.json comparte carpeta y no es un contrato: se filtra por forma.
    if (-not $c.mod -or -not ($c.hooks -is [array])) { continue }
    if ($Mod -and $c.mod -notin $Mod) { continue }
    $contracts += $c
}
if (-not $contracts) { throw "No hay contratos que comprobar en $Contract" }

# --- 2. Conectar -----------------------------------------------------------
$resultados = @()
try {
    Connect-Marionette -Puerto $Port
    [void](Invoke-Marionette 'WebDriver:NewSession' @{ capabilities = @{} })
    # Sin esto se ejecutaria en el contenido de la pagina, donde no existe nada
    # de lo que mide este repo.
    [void](Invoke-Marionette 'Marionette:SetContext' @{ value = 'chrome' })

    $info = Invoke-ChromeJs 'return { titulo: document.documentElement.id, agente: navigator.userAgent };'

    foreach ($c in $contracts) {
        # 2.a Lo primero: el CSS del mod, esta aplicado o no. Si no lo esta, todo
        #     lo demas sobra.
        if ($c.testigo) {
            $r = Invoke-ChromeJs ("return getComputedStyle(document.documentElement).getPropertyValue('{0}').trim();" -f $c.testigo)
            $vale = $r.ok -and $r.v
            $resultados += [pscustomobject]@{
                mod = $c.mod; tipo = 'css-aplicado'; que = "la variable $($c.testigo) llega al documento"
                estado = if ($vale) { 'ok' } else { 'FALLA' }
                detalle = if ($vale) { $r.v } else { 'vacia: el CSS de este mod no esta aplicandose (mod desactivado, o la hoja de mods sin recompilar)' }
                severity = 'critico'
            }
        }

        foreach ($h in $c.hooks) {
            # 2.b Selectores: encajan con algo de verdad?
            $sel = $h.selector
            if (-not $sel -and $h.kind -in @('id', 'class') -and $h.token -match '^[#.][A-Za-z][\w-]*$') {
                $sel = $h.token
            }
            if ($sel -and -not $h.opcional) {
                $r = Invoke-ChromeJs ("return document.querySelectorAll({0}).length;" -f (ConvertTo-Json $sel))
                $n = if ($r.ok) { [int] $r.v } else { -1 }

                # Hay elementos que solo existen en cierto estado de la interfaz:
                # las filas de resultados con el buscador abierto, el overlay de
                # Glance con una vista rapida. Que no esten no dice nada, y
                # tratarlo como fallo hace que el informe grite cada vez que se
                # ejecuta. Su existencia la cubre el verificador estatico.
                $estado = if ($n -gt 0) { 'ok' }
                elseif ($n -eq 0 -and $h.transitorio) { 'transitorio' }
                elseif ($n -eq 0) { 'FALLA' }
                else { 'error' }
                $detalle = switch ($estado) {
                    'ok' { "$n elemento(s)" }
                    'transitorio' { "ninguno en pantalla: $($h.motivo_transitorio)" }
                    'FALLA' { $h.si_falta }
                    default { $r.e }
                }
                $resultados += [pscustomobject]@{
                    mod = $c.mod; tipo = 'dom'; que = $sel
                    estado = $estado; detalle = $detalle; severity = $h.severity
                }
            }

            # 2.c Prefs: existen en ESTE binario? Aqui se resuelven las que el
            #     omni.ja no puede contestar porque viven en xul.dll.
            # OJO: getPrefType devuelve 0 tanto si la pref no existe como si
            # existe pero SIN valor por defecto registrado, y eso segundo es
            # normal en las prefs que solo se leen cuando alguien las escribe.
            # Medido: javascript.options.jit_trustedprincipals da 0 en un Zen
            # recien abierto y su cadena esta dentro de xul.dll, o sea que hay
            # codigo leyendola y funciona perfectamente. Tratar el 0 como "no
            # existe" habria hecho sonar la alarma sobre una pref sana.
            if ($h.kind -eq 'pref' -and $h.buscar -and $h.buscar -ne '-') {
                $r = Invoke-ChromeJs ("return Services.prefs.getPrefType({0});" -f (ConvertTo-Json $h.buscar))
                $tipo = if ($r.ok) { [int] $r.v } else { -1 }
                $estado = if ($tipo -gt 0) { 'ok' }
                elseif ($tipo -eq 0 -and $h.sin_default) { 'ok' }
                elseif ($tipo -eq 0) { 'aviso' }
                else { 'error' }
                $detalle = switch ($estado) {
                    'ok' { if ($tipo -gt 0) { "tipo $tipo" } else { 'sin valor por defecto, como se esperaba' } }
                    'aviso' { 'sin valor por defecto. Puede ser normal si la pref solo se lee al escribirla: comprobar si su cadena esta en xul.dll antes de darla por retirada' }
                    default { $r.e }
                }
                $resultados += [pscustomobject]@{
                    mod = $c.mod; tipo = 'pref'; que = $h.buscar
                    estado = $estado; detalle = $detalle; severity = $h.severity
                }
            }
        }

        # 2.d Afirmaciones de efecto
        foreach ($v in $c.vivo) {
            $r = Invoke-ChromeJs $v.js
            $obtenido = if ($r.ok) { [string] $r.v } else { $null }
            $bien = $false
            if ($r.ok) {
                switch ($v.espera) {
                    'no-vacio' { $bien = -not [string]::IsNullOrWhiteSpace($obtenido) }
                    default {
                        if ($v.espera -like 'regex:*') { $bien = $obtenido -match $v.espera.Substring(6) }
                        else { $bien = ($obtenido -eq [string] $v.espera) }
                    }
                }
            }
            $resultados += [pscustomobject]@{
                mod = $c.mod; tipo = 'efecto'; que = $v.que
                estado = if ($bien) { 'ok' } elseif ($r.ok) { 'FALLA' } else { 'error' }
                detalle = if ($bien) { $obtenido } elseif ($r.ok) { "esperaba '$($v.espera)', obtuvo '$obtenido'" } else { $r.e }
                severity = if ($v.severity) { $v.severity } else { 'degrada' }
            }
        }
    }
}
finally {
    # La sesion se cierra SIEMPRE. Marionette no admite dos a la vez, asi que una
    # sesion colgada por un error envenena todas las llamadas siguientes.
    if ($script:cliente -and $script:cliente.Connected) {
        try { [void](Invoke-Marionette 'WebDriver:DeleteSession' @{}) } catch { }
        try { $script:cliente.Close() } catch { }
    }
}

# --- 3. Informe ------------------------------------------------------------
# 'transitorio' no es un fallo: es "no habia ninguno en pantalla". Se cuenta
# aparte para que el informe lo diga sin contarlo como rojo.
$transitorios = @($resultados | Where-Object { $_.estado -eq 'transitorio' })
$malos = @($resultados | Where-Object { $_.estado -notin @('ok', 'transitorio') })
$criticos = @($malos | Where-Object { $_.severity -eq 'critico' -and $_.estado -ne 'aviso' })

if ($Json) {
    [pscustomobject]@{
        ventana = $info.v
        resumen = [pscustomobject]@{
            total = $resultados.Count; ok = ($resultados.Count - $malos.Count)
            fallan = $malos.Count; criticos = $criticos.Count
        }
        checks  = $resultados
    } | ConvertTo-Json -Depth 6
}
else {
    Write-Host ''
    Write-Host "Ventana medida  : $($info.v.titulo)"
    Write-Host ("Comprobaciones  : {0}" -f $resultados.Count)
    Write-Host ''
    foreach ($g in ($resultados | Group-Object mod)) {
        $m = @($g.Group | Where-Object { $_.estado -notin @('ok', 'transitorio') })
        $color = if ($m.Count) { 'Red' } else { 'Green' }
        $marca = if ($m.Count) { 'FALLA' } else { 'ok   ' }
        Write-Host ("  {0}  {1,-20} {2,3} comprobaciones" -f $marca, $g.Name, $g.Count) -ForegroundColor $color
        foreach ($f in ($g.Group | Where-Object { $_.estado -eq 'transitorio' })) {
            Write-Host ("          no medible  {0}" -f $f.que) -ForegroundColor DarkGray
            Write-Host ("                      {0}" -f $f.detalle) -ForegroundColor DarkGray
        }
        foreach ($f in $m) {
            $c2 = if ($f.estado -eq 'aviso') { 'DarkYellow' } else { 'Red' }
            Write-Host ("          {0} [{1}] {2}" -f $f.estado, $f.severity, $f.que) -ForegroundColor $c2
            Write-Host ("                 {0}" -f $f.detalle) -ForegroundColor Yellow
        }
    }
    Write-Host ''
    if ($criticos.Count) { Write-Host "$($criticos.Count) comprobacion(es) CRITICA(s) fallando." -ForegroundColor Red }
    elseif ($malos.Count) { Write-Host "$($malos.Count) con aviso, ninguna critica." -ForegroundColor Yellow }
    else { Write-Host 'Todo aplica y hace efecto.' -ForegroundColor Green }
    if ($transitorios.Count) {
        Write-Host "$($transitorios.Count) no se pueden medir sin abrir la parte de la interfaz donde viven." -ForegroundColor DarkGray
    }
}

if ($criticos.Count) { exit 2 }
if ($malos.Count) { exit 1 }
exit 0
