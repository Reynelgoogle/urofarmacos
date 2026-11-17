# UroFármacos — Wiki de fármacos en urología

Mockup navegable de **UroFármacos**: wiki interactiva solo de fármacos en
urología, en español. Ficha por fármaco (mecanismo, indicaciones, dosis,
efectos adversos, contraindicaciones, interacciones), agrupadas por familias,
con buscador y enlaces fármaco ↔ patología y fármaco ↔ órgano.

- **Stack:** React + Vite + TypeScript. Base para la app de escritorio
  (Tauri) y la APK Android (Capacitor), siguiendo el método UroApp/Campbell.
- **Estética:** heredada de UroCampus (teal, serif, cabecera de cristal).

## Contenido

**103 fichas auditadas y firmadas** contra el corpus congelado (Gauntlet
firmado, ronda 4, 0 fallos). El corpus y las fichas de referencia viven en
el documento `~/workspace/urofarmacos/documento/DOCUMENTO-FICHAS.md`
(guías EAU 2025, Urology-Textbook, UroCampus, Campbell y Protocolos HHA).

Las secciones sin datos en el corpus se muestran como laguna explícita
(«Sin datos en el corpus (LAGUNA).»); nunca se inventa contenido clínico.
Los datos viven en `src/data/drugs.ts`.

## Recursos visuales (`public/`)

- **`urofarmacos-icon.jpg` (2000×2000, JPEG) — versión web del icono
  oficial, variante TEAL** (ilustración pop-art: riñón, cápsulas,
  jeringa, vejiga con próstata, «UroFármacos» + «WIKI», fondo verde
  azulado con círculo claro), elegida por Rey como icono oficial
  (decisión final 2026-11-17 00:03). Es la tarjeta de logo del héroe.
  **La imagen maestra para la APK Android y la app de escritorio
  Tauri es el PNG real `~/workspace/urofarmacos/urofarmacos-icon-master.png`
  (2000×2000, fuera de `public/` para no empaquetarlo en la web).**
  La variante beige quedó archivada como `urofarmacos-icon-beige.jpg`
  (alternativa, no usar; su maestro PNG está en la misma carpeta).
  Aviso técnico: la ilustración llena el cuadro hasta los bordes, así
  que el icono adaptativo de Android recortaría los extremos (riñón y
  vejiga); al generarlo habrá que darle margen o fondo del mismo teal.
- **`icon-512.png`** — recorte limpio de la ilustración central
  (512×512). Es el favicon (`index.html`) y la marca de la cabecera.
- **`hero-bg.jpg`** — foto de fondo del héroe (bata blanca entregando un
  frasco ámbar de pastillas), con velo oscuro teal encima para que el
  texto blanco siga legible.

## Desarrollo

```sh
npm install
npm run dev
```

No empaquetar nada ahora: ni instalador Tauri ni APK. El empaquetado se
decide aparte, cuando Rey lo pida.
