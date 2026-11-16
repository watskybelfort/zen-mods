<#
.SYNOPSIS
    Dice que backdrop le esta aplicando DWM a la ventana de Zen, ahora mismo.

.DESCRIPTION
    Comprobar el acrilico leyendo prefs.js no funciona, por dos motivos que se
    combinan de la peor manera:

      1. `widget.windows.mica.toplevel-backdrop` NO es el enum de dwmapi.h. Es
         un indice interno de Gecko que se traduce antes de llamar a DWM, asi que
         los numeros no coinciden y un valor "razonable" puede estar fuera de
         rango. Poner 3 pensando en DWMSBT_TRANSIENTWINDOW (que en el enum de DWM
         si es 3) hace que Gecko caiga a mica alt.
      2. Zen descarta al salir las lineas de prefs.js cuyo valor coincide con el
         de fabrica, y el valor bueno (2) ES el de fabrica. O sea que la linea
         desaparece precisamente cuando esta bien puesta.

    Asi que en vez de deducirlo, esto se lo pregunta a Windows:
    DwmGetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE) sobre la ventana de Zen
    devuelve el material que DWM tiene asignado de verdad.

    Ademas avisa del otro fallo que se confunde con "el mod no funciona": mica y
    mica alt muestrean UNICAMENTE el fondo de escritorio, nunca las ventanas de
    detras. Con un escritorio de color solido oscuro dan negro plano por diseno,
    con la config perfecta.

.PARAMETER Json
    Emite el resultado como JSON en vez de texto, para encadenarlo.

.OUTPUTS
    Codigo de salida:
      0  acrilico activo (DWMSBT_TRANSIENTWINDOW)
      1  hay backdrop, pero no es acrilico (mica, mica alt o ninguno)
      2  Zen no esta abierto, o no tiene ventana con backdrop
      3  no se pudo determinar (DWM no respondio, Windows anterior a 22H2)

.EXAMPLE
    .\dev\powershell\Get-ZenBackdrop.ps1

.EXAMPLE
    .\dev\powershell\Get-ZenBackdrop.ps1 -Json | ConvertFrom-Json
#>
[CmdletBinding()]
param([switch] $Json)

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class AcrylicZenDwm {
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("dwmapi.dll")] public static extern int DwmIsCompositionEnabled(out bool enabled);
}
'@

# DWMWA_SYSTEMBACKDROP_TYPE. No esta en los headers publicos viejos; el numero
# es estable desde Windows 11 21H2.
$DWMWA_SYSTEMBACKDROP_TYPE = 38

$MATERIALES = @{
    0 = 'AUTO           (lo decide DWM)'
    1 = 'NONE           (sin backdrop)'
    2 = 'MICA           (DWMSBT_MAINWINDOW, solo tinte del escritorio)'
    3 = 'ACRILICO       (DWMSBT_TRANSIENTWINDOW, difumina lo que hay detras)'
    4 = 'MICA ALT       (DWMSBT_TABBEDWINDOW, solo tinte del escritorio)'
}

$salida = [ordered]@{
    composicionDwm = $false
    build          = 0
    transparencia  = $false
    fondoEscritori = ''
    ventanas       = @()
    acrilico       = $false
    avisos         = @()
}

# --- Estado del sistema ---
$comp = $false
[void][AcrylicZenDwm]::DwmIsCompositionEnabled([ref]$comp)
$salida.composicionDwm = $comp

$salida.build = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuild
$personalize = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$salida.transparencia = ((Get-ItemProperty $personalize -ErrorAction SilentlyContinue).EnableTransparency -eq 1)

# --- Que hay detras de la ventana ---
# Sin esto el diagnostico se queda a medias: el backdrop puede estar perfecto y
# verse negro porque lo que muestrea es negro.
$papel = (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -ErrorAction SilentlyContinue).WallPaper
$fondoOscuro = $false
if ([string]::IsNullOrWhiteSpace($papel)) {
    $rgb = (Get-ItemProperty 'HKCU:\Control Panel\Colors' -ErrorAction SilentlyContinue).Background
    $partes = @($rgb -split '\s+' | Where-Object { $_ })
    if ($partes.Count -eq 3) {
        # Luminancia perceptual: un fondo bajo ~40 no deja ver ningun material.
        $lum = 0.2126 * [int]$partes[0] + 0.7152 * [int]$partes[1] + 0.0722 * [int]$partes[2]
        $fondoOscuro = ($lum -lt 40)
        $salida.fondoEscritori = "color solido rgb($($partes -join ',')), luminancia $([math]::Round($lum, 1))"
    }
    else {
        $salida.fondoEscritori = 'color solido (no se pudo leer)'
    }
}
else {
    $salida.fondoEscritori = "imagen: $papel"
}

# --- La pregunta de verdad ---
$procs = @(Get-Process -Name 'zen' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
$codigo = 2

foreach ($p in $procs) {
    $valor = -1
    $hr = [AcrylicZenDwm]::DwmGetWindowAttribute($p.MainWindowHandle, $DWMWA_SYSTEMBACKDROP_TYPE, [ref]$valor, 4)
    if ($hr -ne 0) {
        $salida.ventanas += [ordered]@{ pid = $p.Id; titulo = $p.MainWindowTitle; valor = $null; material = "DWM devolvio 0x{0:X8}" -f $hr }
        if ($codigo -eq 2) { $codigo = 3 }
        continue
    }
    $mat = $MATERIALES[$valor]
    if (-not $mat) { $mat = "desconocido ($valor)" }
    $salida.ventanas += [ordered]@{ pid = $p.Id; titulo = $p.MainWindowTitle; valor = $valor; material = $mat }
    if ($valor -eq 3) { $salida.acrilico = $true; $codigo = 0 }
    elseif ($codigo -ne 0) { $codigo = 1 }
}

# --- Avisos, en orden de probabilidad de ser tu problema ---
if ($salida.ventanas.Count -eq 0) {
    $salida.avisos += 'Zen no esta abierto (o no tiene ventana). Abrelo y vuelve a ejecutar: el backdrop es una propiedad de la ventana, no del perfil.'
}
if (-not $salida.acrilico -and $salida.ventanas.Count -gt 0) {
    $salida.avisos += 'El backdrop no es acrilico. Pon widget.windows.mica.toplevel-backdrop = 2 (no 3: se sale de rango y Gecko cae a mica alt) y reinicia Zen.'
}
if ($fondoOscuro) {
    if ($salida.acrilico) {
        $salida.avisos += 'Tu escritorio es un color solido casi negro. El acrilico difumina lo que hay DETRAS de la ventana, asi que sobre el escritorio pelado seguira viendose negro; solo se notara cuando haya otra ventana detras. Pon un fondo de pantalla para verlo siempre.'
    }
    else {
        $salida.avisos += 'Tu escritorio es un color solido casi negro, y mica/mica alt muestrean SOLO el escritorio. Eso da negro plano aunque todo lo demas este bien: es el sintoma que mas se confunde con "el mod no funciona".'
    }
}
if (-not $salida.transparencia) {
    $salida.avisos += 'Los efectos de transparencia de Windows estan APAGADOS. Configuracion > Personalizacion > Colores.'
}
if ($salida.build -lt 22621) {
    $salida.avisos += "Windows build $($salida.build): el acrilico de ventana necesita Windows 11 22H2 (22621) o superior."
}
if (-not $salida.composicionDwm) {
    $salida.avisos += 'DWM informa que la composicion esta desactivada. Sin compositor no hay backdrop posible.'
}

# --- Informe ---
if ($Json) {
    $salida | ConvertTo-Json -Depth 6
    exit $codigo
}

Write-Host "Composicion DWM   : $($salida.composicionDwm)"
Write-Host "Windows build     : $($salida.build)"
Write-Host "Transparencia     : $($salida.transparencia)"
Write-Host "Fondo escritorio  : $($salida.fondoEscritori)"
Write-Host ''
if ($salida.ventanas.Count -eq 0) {
    Write-Host 'Ventanas de Zen   : ninguna'
}
else {
    Write-Host 'Ventanas de Zen   :'
    foreach ($v in $salida.ventanas) {
        $color = 'Yellow'
        if ($v.valor -eq 3) { $color = 'Green' }
        Write-Host ("  PID {0,-6} {1}" -f $v.pid, $v.material) -ForegroundColor $color
        if ($v.titulo) { Write-Host "             $($v.titulo)" -ForegroundColor DarkGray }
    }
}
if ($salida.avisos.Count) {
    Write-Host ''
    foreach ($a in $salida.avisos) { Write-Warning $a }
}
exit $codigo
