# El motor

`darkreader.js` es **Dark Reader 4.9.133**, copiado tal cual del paquete npm
`darkreader` (la build UMD, `main` del paquete). No se modifica: el unico ajuste
que se le hace va en `../nativo/proceso.js`, en memoria, al inyectarlo.

- Autor y licencia: Dark Reader Ltd, MIT. Va su texto en `LICENSE-darkreader`.
- Origen: https://github.com/darkreader/darkreader
- Por que Dark Reader y no un filtro `invert()`: genera un tema oscuro de verdad
  —recalcula los colores de cada regla, de las variables CSS y de las imagenes
  que lo necesitan— en vez de invertir la pagina entera, que desvirtua las fotos,
  rompe `backdrop-filter` y cuesta pintado en cada fotograma.

Actualizar:

```
npm pack darkreader@<version>
tar xzf darkreader-<version>.tgz
cp package/darkreader.js mods/appearance/dark-mode/motor/darkreader.js
cp package/LICENSE       mods/appearance/dark-mode/motor/LICENSE-darkreader
```

y anotar la version en `mods/appearance/dark-mode/readme.md`. Despues de actualizar, abrir una
pagina clara y una con `define`/`require` globales (Facebook) y mirar que sigue
oscureciendo: el ajuste de `proceso.js` busca un texto concreto del motor y
avisa en la consola si ya no lo encuentra.
