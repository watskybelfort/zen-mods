#!/bin/sh
# Zen Mods - installer for macOS. Double-click it (or run it from a terminal).
# Instalador de Zen Mods para macOS. Doble clic (o desde una terminal).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js 18 or newer is required / Hace falta Node.js 18 o superior:"
  echo "  https://nodejs.org"
  echo ""
  read -r _
  exit 1
fi
node installer/menu.mjs "$@"
echo ""
printf "  Press Enter to close / Pulsa Enter para cerrar "
read -r _
