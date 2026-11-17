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
  que el icono de UroCampus. Es el favicon y la marca de la cabecera. Ya
  NO va en el héroe (decisión de Rey 2026-11-17 04:43: el héroe lleva
  solo la foto de fondo, como en UroCampus). **La imagen maestra para
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

## Diseño (rediseño 2026-11-17, desde el mockup de Rey)

- Guía: `mockups/diseno-moderno/` (commit de Rey, HTML estático + capturas). Titulares en **serif** (decisión de Rey; el mockup usa sans).
- Cajón de navegación en todos los tamaños (hamburguesa ☰ en la topbar), bottom nav de 4 destinos en móvil, índice de secciones en la ficha, panel de patologías filtrable, tarjetas de familia con acento propio, tokens del mockup (fondo `#eef2f5`, radios 12/18 px, anillo de foco teal).
- **Routing por hash**: `#/ficha/<slug>`, `#/familia/<id>`, `#/organo/<slug>`, `#/patologia/<slug>`, `#/buscar/<texto>`, `#/favoritos`. «Copiar enlace» en la ficha copia la URL con el hash.
- **Exportar**: descarga la ficha como `<slug>.md` (todo el contenido + «Fuente:» + LAGUNA), generado en cliente (`src/exportMarkdown.ts`).
- **Modo lectura** (`src/ReadingMode.tsx`): overlay a pantalla completa con fondo blanco, A− / % / A+ (fuente 11–21 px, persistente en `localStorage` `uf:letra`), pantalla completa con degradado silencioso, Escape para salir. Patrón de UroCampus (estructura) + UroApp (variable CSS `--tam-letra`).
- **Créditos** (`#/creditos`): vista propia con autor (Reynel Busto González, Médico Urólogo, Hospital «Hermanos Ameijeiras», ORCID 0009-0003-2233-9021), qué es la app y sus fuentes. Enlaces en el cajón de navegación y en el pie.
- **Cajón de navegación** (`src/NavDrawer.tsx`): un solo cajón deslizante desde la izquierda para todos los tamaños, abierto con la hamburguesa ☰ de la topbar (visible siempre, también en escritorio); mismo panel que la antigua sidebar fija (Inicio, Favoritos con contador, 9 familias, 7 órganos, patologías, Créditos). Backdrop oscuro, cierre con Escape / clic fuera / al navegar, foco al ✕ al abrir y devuelto a la hamburguesa al cerrar. Patrón del `MobileDrawer` de UroCampus (portal, siempre montado, bloqueo de scroll) sin su inconsistencia de breakpoints (`lg:hidden` + `md:flex` entre 768 y 1023 px) y con las mejoras de accesibilidad de su `ReadingMode`. Sin sidebar fija ni riel colapsable: el contenido ocupa todo el ancho con el cajón cerrado.
- **Preparación de empaquetado**: `vite.config.ts` con `base: './'` (rutas relativas, funciona desde `file://` y en WebView); sin `fetch`/XHR ni referencias externas; hash routing apto para `file://`. Faltan por generar durante el empaquetado: derivados del icono para Tauri (`tauri icon` desde el maestro 1024) y para Capacitor (icono adaptativo + splash con `@capacitor/assets`).

## Desarrollo

```sh
npm install
npm run dev
```

No empaquetar nada ahora: ni instalador Tauri ni APK. El empaquetado se
decide aparte, cuando Rey lo pida.
