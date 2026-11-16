@echo off
rem Zen Mods - installer for Windows. Double-click it.
rem Instalador de Zen Mods para Windows. Doble clic.
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js 18 or newer is required / Hace falta Node.js 18 o superior:
  echo   https://nodejs.org
  echo.
  pause
  exit /b 1
)

rem The native mods write to Zen's install folder, which needs administrator.
rem Los mods nativos escriben en la carpeta de Zen, y eso pide administrador.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

node "%~dp0installer\menu.mjs" %*
echo.
pause
