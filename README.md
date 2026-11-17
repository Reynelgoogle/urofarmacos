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

- **`urofarmacos-icon.png` (1024×1024, PNG con esquinas transparentes)
  — ICONO OFICIAL** (diseño plano: dos riñones con uréteres hacia la
  vejiga, jeringa, cápsula y pastilla, todo en blanco sobre círculo teal
  oscuro), elegido por Rey el 2026-11-17 04:35 para seguir la misma línea
  que el icono de UroCampus. Es la tarjeta de logo del héroe (sobre fondo
  blanco), el favicon y la marca de la cabecera. **La imagen maestra para
  la APK Android y la app de escritorio Tauri es
  `~/workspace/urofarmacos/urofarmacos-icon-master.png` (1024×1024,
  fuera de `public/` para no empaquetarlo en la web).** El original
  subido por Rey tenía las esquinas en blanco; se transparentaron por
  flood-fill desde el borde (la ilustración blanca queda intacta porque
  el círculo teal la encierra). Las variantes pop-art anteriores quedaron
  archivadas (`urofarmacos-icon-popart-teal.jpg`,
  `urofarmacos-icon-beige.jpg`, `icon-512-popart-teal.png`): NO usar.
  Aviso técnico: el círculo llena casi todo el cuadro; al generar el
  icono adaptativo de Android habrá que darle un poco de margen para que
  la máscara no recorte el borde del círculo.
- **`icon-512.png`** — el mismo icono a 512×512. Es el favicon
  (`index.html`) y la marca de la cabecera.
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
