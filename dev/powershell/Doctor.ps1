<#
.SYNOPSIS
    Un solo comando que revisa todo: lo que se ejecuta el dia que Zen se
    actualiza.

.DESCRIPTION
    Los verificadores sueltos contestan preguntas sueltas. Esto contesta la unica
    que se hace de verdad: "esta todo como deberia?". Reune en un informe:

      1. El perfil, y que los mods del repo esten copiados, registrados y
         activados en el.
      2. Que el CSS instalado en el perfil sea EL DEL REPO. Es el fallo mas
         tonto y el mas facil de tener: se arregla el mod, se olvida reinstalar,
         y se pasa media hora depurando el bug que ya estaba corregido.
      3. Que la hoja de mods contenga de verdad el CSS de cada mod. Zen no
         regenera ese archivo al arrancar, asi que un mod puede estar registrado
         y no aplicar.
      4. Que las prefs de las opciones esten sembradas. Un checkbox sin definir
         vale `false` para @media -moz-pref, o sea que la mitad de los
         interruptores arrancarian apagados.
      5. La coherencia INTERNA del contrato de Zen Mods, que es la que se rompe
         mas callada y encima por nuestra propia mano: renombrar un mod en
         theme.json mata todos sus desplegables sin tocar una linea de CSS.
      6. El contrato contra la build instalada, con el diff de la linea base.
      7. El backdrop que aplica DWM de verdad, y los CVE pendientes.

    Los pasos 6 y 7 delegan en las herramientas que ya existen. Aqui no se
    duplica su logica, se llaman y se resume su codigo de salida.

.PARAMETER ProfilePath
    Perfil a revisar. Si se omite se detecta el de por defecto.

.PARAMETER Quiet
    Guardar el BuildID visto y hablar solo si algo va mal o si la build ha
    cambiado. Para colgarlo de una tarea programada.

.PARAMETER SkipCves
    No consultar los avisos de Mozilla (evita la parte que necesita red).

.EXAMPLE
    .\dev\powershell\Doctor.ps1
#>
[CmdletBinding()]
param(
    [string] $ProfilePath,
    [switch] $Quiet,
    [switch] $SkipCves
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'dev\powershell\ZenProfile.psm1') -Force -DisableNameChecking

$RepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$ModsRoot = Join-Path $RepoRoot 'mod'
$WebRoot = Join-Path $RepoRoot 'web'

# Los parciales de web\, en un solo texto y sin comentarios. Un interruptor de
# un mod no siempre se lee desde su chrome.css: userContent.css es hoja de
# USUARIO, y eso le basta a `-moz-pref` para funcionar tambien dentro de una
# pagina. Sin mirar aqui, el paso 5 avisaria de que sobra una opcion que si se
# usa — y el aviso llevaria a borrarla.
$cssWeb = ''
if (Test-Path $WebRoot) {
    $cssWeb = [regex]::Replace(
        ((Get-ChildItem $WebRoot -Filter '*.css' | Get-Content -Raw -Encoding UTF8) -join "`n"),
        '/\*[\s\S]*?\*/', ' ')
}

$hallazgos = @()
function Add-Hallazgo {
    param([string] $Area, [string] $Estado, [string] $Texto, [string] $Arreglo = '')
    $script:hallazgos += [pscustomobject]@{ area = $Area; estado = $Estado; texto = $Texto; arreglo = $Arreglo }
}

# --- 1. Perfil y registro --------------------------------------------------
if (-not $ProfilePath) {
    try { $ProfilePath = Resolve-ZenProfile }
    catch { Add-Hallazgo 'perfil' 'FALLA' $_.Exception.Message 'Comprueba que Zen esta instalado para este usuario.' }
}

$mods = @()
if ($ProfilePath -and (Test-Path $ProfilePath)) {
    Add-Hallazgo 'perfil' 'ok' $ProfilePath

    $themesFile = Join-Path $ProfilePath 'zen-themes.json'
    $registrados = @{}
    if (Test-Path $themesFile) {
        $raw = (Get-Content $themesFile -Raw -Encoding UTF8).Trim()
        if ($raw) {
            foreach ($p in (ConvertFrom-Json $raw).PSObject.Properties) { $registrados[$p.Name] = $p.Value }
        }
        Add-Hallazgo 'registro' 'ok' "$($registrados.Count) mod(s) en zen-themes.json"
    }
    else {
        Add-Hallazgo 'registro' 'FALLA' 'no existe zen-themes.json' 'Ejecuta .\dev\powershell\Install-AcrylicZen.ps1'
    }

    # La hoja compilada, una sola lectura para todas las comprobaciones
    $sheetFile = Join-Path $ProfilePath 'chrome\zen-themes.css'
    $sheet = if (Test-Path $sheetFile) { Get-Content $sheetFile -Raw -Encoding UTF8 } else { $null }
    if (-not $sheet) {
        Add-Hallazgo 'hoja' 'FALLA' 'no existe chrome\zen-themes.css' 'Ejecuta .\dev\powershell\Install-AcrylicZen.ps1'
    }

    # Normalizar saltos de linea antes de comparar: git convierte a CRLF al
    # sacar del repo y el instalador copia tal cual, asi que una comparacion
    # cruda daria diferencias que no existen.
    function Get-Normalizado { param([string] $t) ($t -replace "`r`n", "`n").TrimEnd() }

    $mods = @(Get-ChildItem $ModsRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'theme.json') })
    foreach ($m in $mods) {
        $man = ConvertFrom-Json (Get-Content (Join-Path $m.FullName 'theme.json') -Raw -Encoding UTF8)
        $id = $man.id
        # Se apunta cuantos hallazgos habia antes de revisar este mod, para poder
        # decir "ok" al final. Un informe donde los mods sanos no aparecen deja
        # la duda de si se han revisado.
        $antesDeEste = $script:hallazgos.Count

        if (-not $registrados.ContainsKey($id)) {
            Add-Hallazgo $man.name 'FALLA' 'no esta registrado en zen-themes.json' 'Ejecuta .\dev\powershell\Install-AcrylicZen.ps1'
            continue
        }
        $reg = $registrados[$id]
        $activo = ($null -eq $reg.enabled) -or [bool] $reg.enabled
        if (-not $activo) {
            Add-Hallazgo $man.name 'aviso' 'registrado pero DESACTIVADO' 'Ajustes > Zen Mods, o .\dev\powershell\Disable-Mods.ps1 -Enable'
        }
        if ($reg.version -and $reg.version -ne $man.version) {
            Add-Hallazgo $man.name 'aviso' "registrado como v$($reg.version), el repo va por v$($man.version)" 'Reinstala para actualizar'
        }

        # 2. El CSS del perfil es el del repo?
        $cssRepo = Join-Path $m.FullName 'chrome.css'
        $cssPerfil = Join-Path $ProfilePath "chrome\zen-themes\$id\chrome.css"
        if (-not (Test-Path $cssPerfil)) {
            Add-Hallazgo $man.name 'FALLA' 'no hay chrome.css copiado en el perfil' 'Ejecuta .\dev\powershell\Install-AcrylicZen.ps1'
            continue
        }
        $repoTxt = Get-Normalizado (Get-Content $cssRepo -Raw -Encoding UTF8)
        $perfilTxt = Get-Normalizado (Get-Content $cssPerfil -Raw -Encoding UTF8)
        if ($repoTxt -ne $perfilTxt) {
            Add-Hallazgo $man.name 'FALLA' 'el CSS del perfil NO es el del repo' 'Reinstala: los cambios del repo no estan puestos'
        }

        # 3. Y esta dentro de la hoja compilada?
        #    Solo si el mod esta ACTIVO: en uno apagado a proposito la ausencia de
        #    su CSS en la hoja es lo correcto, y avisar ahi mandaria a reinstalar
        #    justo a quien acaba de apagarlo con el interruptor de panico.
        #    Con .Contains() y no con -like: el CSS esta lleno de `*` y de `[`,
        #    que en un patron -like son comodines y clase de caracteres. Pasarle
        #    un archivo entero como patron no compara, revienta.
        if ($activo -and $sheet -and -not (Get-Normalizado $sheet).Contains($perfilTxt)) {
            Add-Hallazgo $man.name 'FALLA' 'su CSS no esta en chrome\zen-themes.css, o sea que NO aplica' 'Reinstala: Zen no regenera esa hoja al arrancar'
        }

        # 4. Las prefs de sus opciones estan sembradas?
        $prefsJson = Join-Path $m.FullName 'preferences.json'
        if (Test-Path $prefsJson) {
            $esperadas = Get-ZenModDefaultPrefs $prefsJson
            $puestas = @{}
            foreach ($f in @('prefs.js', 'user.js')) {
                $p = Join-Path $ProfilePath $f
                if (Test-Path $p) { foreach ($kv in (Read-UserPrefFile $p).GetEnumerator()) { $puestas[$kv.Key] = $kv.Value } }
            }
            $faltan = @($esperadas.Keys | Where-Object { -not $puestas.ContainsKey($_) })
            if ($faltan.Count) {
                Add-Hallazgo $man.name 'aviso' ("{0} opcion(es) sin sembrar: {1}" -f $faltan.Count, ($faltan -join ', ')) 'Un checkbox sin definir vale false: reinstala'
            }
        }

        # 5. Coherencia interna del contrato de Zen Mods.
        #    Las tres derivaciones salen de ZenMods.mjs (#writeToDom y
        #    sanitizeModName) y ninguna avisa cuando se rompe.
        $css = Get-Content $cssRepo -Raw -Encoding UTF8
        $cssSinComentarios = [regex]::Replace($css, '/\*[\s\S]*?\*/', ' ')
        $divEsperado = 'theme-' + ($man.name -replace '\s+', '-' -replace '[^A-Za-z0-9-]', '')

        if (Test-Path $prefsJson) {
            foreach ($op in (ConvertFrom-Json (Get-Content $prefsJson -Raw -Encoding UTF8))) {
                if (-not $op.property) { continue }
                $sanit = $op.property -replace '\.', '-'
                # Otra vez .Contains(): `var(--x` y `#theme-X[y=` llevan
                # parentesis y corchetes, que -like interpretaria como patron.
                switch ($op.type) {
                    'string' {
                        if (-not $cssSinComentarios.Contains("var(--$sanit")) {
                            Add-Hallazgo $man.name 'aviso' "la opcion '$($op.property)' escribe --$sanit y el CSS no la lee" 'Sobra la opcion, o falta el var() en el CSS'
                        }
                    }
                    'dropdown' {
                        if (-not $cssSinComentarios.Contains("#$divEsperado[$sanit=")) {
                            Add-Hallazgo $man.name 'FALLA' "el desplegable '$($op.property)' no se lee: el CSS deberia mirar #$divEsperado[$sanit='...']" "Zen deriva ese id del NAME de theme.json ('$($man.name)'); si renombraste el mod, actualiza el CSS"
                        }
                    }
                    'checkbox' {
                        # En su chrome.css o en la capa web: los dos sitios
                        # valen, porque los dos son hojas privilegiadas.
                        $lee = "-moz-pref('$($op.property)'"
                        if (-not ($cssSinComentarios.Contains($lee) -or $cssWeb.Contains($lee))) {
                            Add-Hallazgo $man.name 'aviso' "el interruptor '$($op.property)' no se lee desde ningun @media -moz-pref" 'Sobra la opcion, o falta el @media (mirado en su chrome.css y en web\)'
                        }
                    }
                }
            }
        }

        if ($script:hallazgos.Count -eq $antesDeEste) {
            Add-Hallazgo $man.name 'ok' "v$($man.version), instalado, en la hoja y con sus opciones"
        }
    }

    # La capa web
    $uc = Join-Path $ProfilePath 'chrome\userContent.css'
    if (Test-Path $uc) {
        $ucTxt = Get-Content $uc -Raw -Encoding UTF8
        $nivel = if ($ucTxt -match '(?m)^\s*\*\s*NIVEL:\s*(\S+)') { $Matches[1] } else { '?' }
        Add-Hallazgo 'capa web' 'ok' "userContent.css, nivel $nivel"
    }
    else {
        Add-Hallazgo 'capa web' 'aviso' 'no hay userContent.css: las paginas taparan el cristal' 'Reinstala sin -WebLevel off'
    }
}

# --- 6. Contrato contra la build, con diff de la linea base ----------------
$contratoSalida = $null
$contratoCodigo = $null
try {
    $contratoSalida = & (Join-Path $PSScriptRoot 'Test-ZenContract.ps1') -Json 2>$null | ConvertFrom-Json
    $contratoCodigo = $LASTEXITCODE
}
catch { Add-Hallazgo 'contrato' 'aviso' "no se pudo ejecutar Test-ZenContract.ps1: $($_.Exception.Message)" }

if ($contratoSalida) {
    $rs = $contratoSalida.resumen
    if ($rs.criticos) {
        Add-Hallazgo 'contrato' 'FALLA' "$($rs.criticos) enganche(s) CRITICO(s) desaparecido(s) en Zen $($rs.zen)" 'Detalle: .\dev\powershell\Test-ZenContract.ps1'
    }
    elseif ($rs.faltan) {
        Add-Hallazgo 'contrato' 'aviso' "$($rs.faltan) enganche(s) desaparecido(s), ninguno critico" 'Detalle: .\dev\powershell\Test-ZenContract.ps1'
    }
    else {
        Add-Hallazgo 'contrato' 'ok' "$($rs.hooks) enganches en su sitio (Zen $($rs.zen), Gecko $($rs.gecko))"
    }
    if (@($contratoSalida.cambios).Count) {
        Add-Hallazgo 'contrato' 'aviso' ("{0} enganche(s) han cambiado de estado desde la linea base" -f @($contratoSalida.cambios).Count) 'Detalle: .\dev\powershell\Test-ZenContract.ps1'
    }
}

# --- 7. DWM y CVEs ---------------------------------------------------------
# Con Zen cerrado no hay ventana a la que preguntarle su backdrop, y eso no es un
# aviso: es que no se puede medir. Contarlo como aviso haria que el modo -Quiet
# hablase cada vez que se ejecuta con el navegador cerrado, que es siempre.
if (-not (Get-Process -Name 'zen' -ErrorAction SilentlyContinue)) {
    Add-Hallazgo 'backdrop' 'n/d' 'no se mide con Zen cerrado'
}
else {
    & (Join-Path $PSScriptRoot 'Get-ZenBackdrop.ps1') -Json 2>$null | Out-Null
    switch ($LASTEXITCODE) {
        0 { Add-Hallazgo 'backdrop' 'ok' 'DWM confirma acrilico (DWMSBT_TRANSIENTWINDOW)' }
        1 {
            # AVISO Y NO FALLO, a proposito. DWMWA_SYSTEMBACKDROP_TYPE devuelve lo
            # que la aplicacion PIDIO, y el valor 0 es DWMSBT_AUTO: "lo decide
            # DWM", que no es lo mismo que "no hay acrilico". Medido en Windows
            # build 26200 con las prefs correctas (widget.windows.mica=true,
            # toplevel-backdrop=2, ambas comprobadas en vivo) sale AUTO, y el
            # consejo automatico seria poner una pref que ya esta puesta.
            # Este repo ya se equivoco una vez dando por roto lo que fallaba era
            # la medida; aqui se dice lo que se ve y se deja la conclusion a los
            # ojos, que para el cristal son el unico instrumento fiable.
            Add-Hallazgo 'backdrop' 'aviso' 'DWM no declara acrilico explicito (puede ser AUTO: lo decide el)' 'Si la ventana se ve de cristal, es la medida y no el mod. Detalle: .\dev\powershell\Get-ZenBackdrop.ps1'
        }
        3 { Add-Hallazgo 'backdrop' 'n/d' 'DWM no respondio, o Windows anterior a 22H2' }
        default { Add-Hallazgo 'backdrop' 'n/d' "Get-ZenBackdrop devolvio $LASTEXITCODE" }
    }
}

if (-not $SkipCves) {
    try {
        & (Join-Path $PSScriptRoot 'Check-ZenExposure.ps1') -Json 2>$null | Out-Null
        switch ($LASTEXITCODE) {
            0 { Add-Hallazgo 'cve' 'ok' 'al dia con Mozilla' }
            1 { Add-Hallazgo 'cve' 'ok' 'por detras de Firefox, sin avisos pendientes' }
            2 { Add-Hallazgo 'cve' 'FALLA' 'hay CVE publicados que tu build no lleva' 'Detalle: .\dev\powershell\Check-ZenExposure.ps1' }
            default { Add-Hallazgo 'cve' 'aviso' 'no se pudo determinar la exposicion' 'Comprueba la conexion' }
        }
    }
    catch { Add-Hallazgo 'cve' 'aviso' 'no se pudo consultar a Mozilla' }
}

# --- 8. Memoria del BuildID, para el modo silencioso -----------------------
$buildActual = if ($contratoSalida) { $contratoSalida.resumen.buildId } else { $null }
$memoria = Join-Path $env:LOCALAPPDATA 'acrylic-zen\ultima-build.txt'
$buildCambio = $false
if ($buildActual) {
    $primeraVez = -not (Test-Path $memoria)
    $visto = if ($primeraVez) { '' } else { (Get-Content $memoria -Raw).Trim() }
    # En la primera ejecucion no hay nada con que comparar, asi que no se dice
    # que Zen se ha actualizado: seria mentira y ademas la mas creible de todas.
    $buildCambio = (-not $primeraVez -and $visto -ne $buildActual)
    New-Item -ItemType Directory -Path (Split-Path -Parent $memoria) -Force | Out-Null
    Set-Content -Path $memoria -Value $buildActual -Encoding utf8
}

# --- 9. Informe ------------------------------------------------------------
$fallan = @($hallazgos | Where-Object { $_.estado -eq 'FALLA' })
$avisos = @($hallazgos | Where-Object { $_.estado -eq 'aviso' })

if ($Quiet -and -not $fallan.Count -and -not $avisos.Count -and -not $buildCambio) { exit 0 }

Write-Host ''
Write-Host 'Doctor de Acrylic Zen' -ForegroundColor Cyan
if ($buildCambio) { Write-Host "Zen se ha actualizado desde la ultima revision (BuildID $buildActual)" -ForegroundColor Cyan }
Write-Host ''

foreach ($g in ($hallazgos | Group-Object area)) {
    foreach ($h in $g.Group) {
        $color = switch ($h.estado) { 'ok' { 'Green' } 'aviso' { 'DarkYellow' } 'n/d' { 'DarkGray' } default { 'Red' } }
        $marca = switch ($h.estado) { 'ok' { 'ok   ' } 'aviso' { 'aviso' } 'n/d' { ' -   ' } default { 'FALLA' } }
        Write-Host ("  {0}  {1,-20} {2}" -f $marca, $h.area, $h.texto) -ForegroundColor $color
        if ($h.arreglo -and $h.estado -ne 'ok') {
            Write-Host ("                              -> {0}" -f $h.arreglo) -ForegroundColor DarkGray
        }
    }
}

Write-Host ''
if ($fallan.Count) { Write-Host "$($fallan.Count) cosa(s) mal, $($avisos.Count) aviso(s)." -ForegroundColor Red }
elseif ($avisos.Count) { Write-Host "Nada roto, $($avisos.Count) aviso(s)." -ForegroundColor Yellow }
else { Write-Host 'Todo en orden.' -ForegroundColor Green }
Write-Host ''
Write-Host 'Lo que esto NO puede medir: que los mods hagan efecto en pantalla.' -ForegroundColor DarkGray
Write-Host 'Para eso hace falta el navegador abierto:' -ForegroundColor DarkGray
Write-Host '  .\dev\powershell\Start-ZenClaudeLink.ps1 -Marionette' -ForegroundColor DarkGray
Write-Host '  .\dev\powershell\Test-ZenLive.ps1' -ForegroundColor DarkGray

if ($fallan.Count) { exit 2 }
if ($avisos.Count) { exit 1 }
exit 0
