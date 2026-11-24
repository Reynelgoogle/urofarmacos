// Smoke test de UroFármacos sobre el HTML autocontenido (jsdom).
// Uso: node scripts/smoke.cjs [ruta-al-html]
// Salida por defecto: dist-single/urofarmacos.html
// Falla (exit 1) si alguna comprobación no pasa.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = process.argv[2] || path.resolve(__dirname, "..", "dist-single", "urofarmacos.html");
const html = fs.readFileSync(file, "utf8");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

// Monta una instancia jsdom y espera a que React monte (selector dado).
// `seed` opcional siembra el localStorage antes de que corran los
// scripts (para probar que un estado se recuerda entre visitas).
async function mount(url, readySelector, seed) {
  const errors = [];
  const vc = new VirtualConsole();
  // jsdom no implementa scrollTo/scrollIntoView: limitación del
  // entorno de pruebas, no un fallo de la app (en el navegador real
  // funcionan). Se filtran esos dos avisos.
  vc.on("jsdomError", (e) => {
    const msg = e.detail || e.message || String(e);
    if (/scrollTo|scrollIntoView/.test(msg)) return;
    errors.push("jsdomError: " + msg);
  });
  const dom = new JSDOM(html, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    ...(seed ? { beforeParse: seed } : {}),
  });
  const { window } = dom;
  window.addEventListener("error", (e) => errors.push("window error: " + e.message));
  const doc = window.document;
  const tick = () => new Promise((r) => setTimeout(r, 50));
  for (let i = 0; i < 50 && !doc.querySelector(readySelector); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  return { dom, window, doc, errors, tick };
}

function headings(doc) {
  return [...doc.querySelectorAll("h2")].map((h) => h.textContent.trim());
}

// Escribir en un input como lo haría un usuario (setter nativo +
// evento input: asignar input.value directamente confunde el
// rastreador de valor de React y el onChange no se dispara).
async function typeInto(window, input, text, tick) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, text);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(); await tick();
}

// El Blob de jsdom no tiene .text() ni .arrayBuffer(): se lee con FileReader.
function blobText(window, blob) {
  return new Promise((resolve, reject) => {
    const fr = new window.FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("FileReader error"));
    fr.readAsText(blob);
  });
}

// Extrae el cuerpo de un bloque @media cuya condición casa con `re`
// (conteo de llaves; el CSS viene minificado).
function mediaBlock(css, re) {
  const m = css.match(re);
  if (!m) return "";
  const open = css.indexOf("{", m.index);
  if (open < 0) return "";
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") { depth--; if (depth === 0) return css.slice(open + 1, j); }
  }
  return "";
}

// Cuerpo de la regla del selector exacto `sel` (p. ej. ".search-inner
// input"): busca `sel + "{"` para no casar con :hover, ::placeholder
// ni :focus-visible del mismo selector.
function ruleBody(css, sel) {
  const i = css.indexOf(sel + "{");
  if (i < 0) return null;
  const open = i + sel.length;
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") { depth--; if (depth === 0) return css.slice(open + 1, j); }
  }
  return null;
}

(async () => {
  const { window, doc, errors, tick } = await mount("http://localhost/", ".hero");

  check("sin errores de ventana/jsdom", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("héroe renderizado", !!doc.querySelector(".hero"));

  // Imágenes inlinadas como data URI.
  const logo = doc.querySelector(".hero-logo");
  check("sin logo del icono en el héroe (decisión Rey 2026-11-17)", !logo);
  const mark = doc.querySelector(".brand-img");
  check("marca de cabecera con data URI", !!mark && mark.src.startsWith("data:image/png"));
  check("favicon inlinado", !!doc.querySelector('link[rel="icon"][href^="data:image/png"]'));

  // Estructura nueva: topbar, cajón de navegación y bottom nav móvil.
  // Sin sidebar fija ni riel: el panel de navegación vive en el cajón.
  check("topbar presente", !!doc.querySelector(".topbar"));
  check("atajo ⌘ K visible", (doc.querySelector(".topbar kbd")?.textContent || "") === "⌘ K");
  check("sin sidebar fija (.sidebar)", !doc.querySelector(".sidebar"));
  check("sin botón de colapso de la sidebar", !doc.querySelector(".side-collapse"));
  check("sin contenedor .shell", !doc.querySelector(".shell"));
  check("sin clave uf:sidebar en localStorage",
    window.localStorage.getItem("uf:sidebar") === null);
  check("cajón de navegación presente (siempre montado)",
    !!doc.querySelector(".nav-drawer"));
  check("cajón con grupo Familias", (doc.querySelector(".nav-drawer")?.textContent || "").includes("Familias"));
  check("cajón con Todas las patologías", (doc.querySelector(".nav-drawer")?.textContent || "").includes("Todas las patologías"));
  check("cajón con Favoritos y contador",
    (doc.querySelector(".nav-drawer")?.textContent || "").includes("Favoritos"));
  const bottomBtns = [...doc.querySelectorAll(".m-bottomnav button")];
  check("bottom nav móvil con 4 botones", bottomBtns.length === 4, `${bottomBtns.length} botones`);
  check("bottom nav: Inicio, Índice, Buscar, Favoritos",
    ["Inicio", "Índice", "Buscar", "Favoritos"].every((t) =>
      bottomBtns.some((b) => b.textContent.includes(t))));

  // ---------- Cajón de navegación (único, todos los tamaños) ----------
  const drawer = doc.querySelector(".nav-drawer");
  const burger = doc.querySelector('.topbar .icon-btn[aria-label="Abrir índice"]');
  check("botón hamburguesa en la topbar", !!burger);
  check("hamburguesa con aria-expanded=false al arrancar",
    burger?.getAttribute("aria-expanded") === "false");
  check("hamburguesa con aria-controls=nav-drawer",
    burger?.getAttribute("aria-controls") === "nav-drawer");
  check("cajón oculto por defecto (aria-hidden)",
    drawer?.getAttribute("aria-hidden") === "true");
  check("cajón oculto por defecto (sin clase open)",
    !!drawer && !drawer.classList.contains("open"));
  check("cajón con role=dialog y aria-modal en el panel",
    drawer?.querySelector(".nav-drawer-panel")?.getAttribute("role") === "dialog" &&
    drawer?.querySelector(".nav-drawer-panel")?.getAttribute("aria-modal") === "true");
  check("cajón con botón ✕ Cerrar menú",
    !!drawer?.querySelector('[aria-label="Cerrar menú"]'));
  check("cajón con Inicio/Favoritos/Créditos",
    doc.querySelectorAll(".nav-drawer .side-item").length === 3,
    `${doc.querySelectorAll(".nav-drawer .side-item").length} botones`);
  check("cajón con 9 familias + 7 órganos + 4 patologías",
    doc.querySelectorAll(".nav-drawer .side-fam").length === 20,
    `${doc.querySelectorAll(".nav-drawer .side-fam").length} botones`);
  check("Favoritos del cajón con contador 0",
    (doc.querySelector(".nav-drawer .side-item .side-count")?.textContent || "") === "0");
  // La hamburguesa NO se esconde en escritorio: el CSS no tiene regla
  // que oculte .icon-btn (jsdom no evalúa media queries, se revisa el CSS).
  const styleText = [...doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");
  check("CSS sin regla que oculte la hamburguesa en escritorio",
    !/\.icon-btn\s*\{[^}]*display\s*:\s*none/.test(styleText));
  // Abrir con la hamburguesa: foco al botón ✕, scroll bloqueado.
  burger?.focus();
  burger?.click(); await tick(); await tick();
  check("hamburguesa abre el cajón (clase open)",
    !!drawer && drawer.classList.contains("open"));
  check("cajón abierto: aria-hidden=false",
    drawer?.getAttribute("aria-hidden") === "false");
  check("hamburguesa con aria-expanded=true al abrir",
    burger?.getAttribute("aria-expanded") === "true");
  check("cajón abierto bloquea el scroll del fondo", doc.body.style.overflow === "hidden");
  check("al abrir, el foco va al botón ✕ del cajón",
    doc.activeElement?.getAttribute("aria-label") === "Cerrar menú",
    `${doc.activeElement?.tagName} ${doc.activeElement?.getAttribute("aria-label") || ""}`);
  // Navegar desde el cajón abre la vista y lo cierra.
  doc.querySelector(".nav-drawer .side-fam")?.click(); await tick(); await tick();
  check("desde el cajón: pulsar una familia abre su vista (6 filas)",
    doc.querySelectorAll(".drug-row").length === 6,
    `${doc.querySelectorAll(".drug-row").length} filas`);
  check("al navegar, el cajón se cierra",
    drawer?.getAttribute("aria-hidden") === "true" && !drawer.classList.contains("open"));
  check("al cerrar, el scroll del fondo se restaura", doc.body.style.overflow === "");
  check("al cerrar, el foco vuelve a la hamburguesa", doc.activeElement === burger);
  doc.querySelector(".brand")?.click(); await tick(); await tick();
  check("vuelta a Inicio tras navegar desde el cajón", !!doc.querySelector(".hero"));
  // Escape lo cierra.
  burger?.click(); await tick(); await tick();
  check("el cajón reabre con la hamburguesa", !!drawer?.classList.contains("open"));
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick(); await tick();
  check("Escape cierra el cajón", !drawer?.classList.contains("open"));
  check("Escape restaura el scroll del fondo", doc.body.style.overflow === "");
  // El backdrop lo cierra.
  burger?.click(); await tick(); await tick();
  doc.querySelector(".nav-drawer-backdrop")?.click(); await tick(); await tick();
  check("clic en el backdrop cierra el cajón", !drawer?.classList.contains("open"));
  // El botón ✕ lo cierra.
  burger?.click(); await tick(); await tick();
  drawer?.querySelector('[aria-label="Cerrar menú"]')?.click(); await tick(); await tick();
  check("✕ cierra el cajón", !drawer?.classList.contains("open"));
  // El botón Índice de la bottom nav abre el índice A–Z real (no el cajón):
  // el cajón sigue disponible con la hamburguesa y con las acciones.
  const idxBtn = [...doc.querySelectorAll(".m-bottomnav button")].find((b) =>
    b.textContent.includes("Índice"));
  idxBtn?.click(); await tick(); await tick();
  check("Índice de la bottom nav abre el índice A–Z", !!doc.querySelector(".idx-page"));
  check("Índice A–Z con hash #/farmacos", window.location.hash === "#/farmacos",
    window.location.hash);
  check("Índice A–Z con las 103 fichas", doc.querySelectorAll(".idx-row").length === 103,
    `${doc.querySelectorAll(".idx-row").length} filas`);
  check("la bottom nav marca Índice como activo", !!idxBtn?.classList.contains("active"));
  doc.querySelector(".brand")?.click(); await tick(); await tick();
  check("volver a Inicio desde el índice A–Z", !!doc.querySelector(".hero"));

  // ---------- Barra de desplazamiento modernizada ----------
  check("CSS con ::-webkit-scrollbar", styleText.includes("::-webkit-scrollbar"));
  check("CSS con pulgar teal redondeado",
    /::-webkit-scrollbar-thumb\s*\{[^}]*border-radius:\s*999px/.test(styleText));
  check("CSS con scrollbar-width thin (Firefox)",
    /scrollbar-width:\s*thin/.test(styleText));
  check("CSS con scrollbar-color teal (Firefox)",
    // El minificador reescribe rgba(13,148,136,.45) como #0d948873.
    /scrollbar-color:\s*(rgba\(13,\s*148,\s*136|#0d9488)/.test(styleText));
  check("CSS con hover más visible en el pulgar",
    /::-webkit-scrollbar-thumb:hover/.test(styleText));

  // ---------- Buscador en móvil (topbar): no colapsar al girar ----------
  // Causa raíz: .brand y .top-actions tenían flex:none (no se
  // encogen) y su ancho de contenido (~225px la marca con el
  // subtítulo, ~120px Favoritos) superaba el viewport en portrait
  // (~360-393px CSS en el Redmi Note 10S), así que .search (el
  // único flexible) colapsaba a ~0px y los caracteres se
  // amontonaban al teclear. El arreglo: marca solo icono, kbd
  // oculto y Favoritos compacto en pantallas estrechas y en
  // horizontal, input con direction:ltr y min-width:0 en cada
  // ancestro flex.
  const topInput = doc.querySelector('.topbar .search .search-inner input[type="search"]');
  check("buscador: input type=search dentro de .topbar .search .search-inner", !!topInput);
  check("buscador: sin dir=rtl en el input", topInput?.getAttribute("dir") !== "rtl");
  const inputCss = ruleBody(styleText, ".search-inner input") || "";
  check("CSS: input del buscador con direction:ltr", /direction\s*:\s*ltr/.test(inputCss), inputCss);
  check("CSS: input del buscador con text-align:left", /text-align\s*:\s*left/.test(inputCss), inputCss);
  check("CSS: input del buscador flex:1 con min-width:0",
    /flex\s*:\s*1/.test(inputCss) && /min-width\s*:\s*0/.test(inputCss), inputCss);
  check("CSS: input del buscador sin ancho fijo en px", !/(?:^|[^-])width\s*:\s*\d+px/.test(inputCss), inputCss);
  check("CSS: sin direction:rtl en todo el CSS", !/direction\s*:\s*rtl/.test(styleText));
  const searchCss = ruleBody(styleText, ".search") || "";
  check("CSS: .search flex:1 con min-width:0",
    /flex\s*:\s*1/.test(searchCss) && /min-width\s*:\s*0/.test(searchCss), searchCss);
  check("CSS: .search sin ancho fijo en px", !/(?:^|[^-])width\s*:\s*\d+px/.test(searchCss), searchCss);
  const innerCss = ruleBody(styleText, ".search-inner") || "";
  check("CSS: .search-inner con min-width:0", /min-width\s*:\s*0/.test(innerCss), innerCss);
  check("CSS: .search-inner sin ancho fijo en px", !/(?:^|[^-])width\s*:\s*\d+px/.test(innerCss), innerCss);
  // El minificador reescribe max-width:639px como width<=639px.
  const mobCss = mediaBlock(styleText, /@media[^{]*639px/);
  check("CSS móvil (≤639px): existe el bloque", mobCss.length > 0);
  check("CSS móvil: texto de la marca oculto (.brand-text display:none)",
    /\.brand-text\s*\{[^}]*display\s*:\s*none/.test(mobCss), mobCss.slice(0, 200));
  check("CSS móvil: kbd ⌘K oculto", /\.search-inner kbd\s*\{[^}]*display\s*:\s*none/.test(mobCss));
  check("CSS móvil: .search-inner sin tope de 520px (max-width:none)",
    /max-width\s*:\s*none/.test(mobCss));
  check("CSS móvil: Favoritos compacto (solo icono + contador)",
    /\.top-actions \.ghost-btn\s*\{[^}]*font-size\s*:\s*0/.test(mobCss));
  const landCss = mediaBlock(styleText, /@media[^{]*orientation\s*:\s*landscape/);
  check("CSS: existe bloque para móvil en horizontal (orientation:landscape)", landCss.length > 0);
  check("CSS horizontal: texto de la marca oculto",
    /\.brand-text\s*\{[^}]*display\s*:\s*none/.test(landCss));
  check("CSS horizontal: kbd ⌘K oculto", /\.search-inner kbd\s*\{[^}]*display\s*:\s*none/.test(landCss));
  check("CSS horizontal: .search-inner sin tope (max-width:none)", /max-width\s*:\s*none/.test(landCss));

  // Contadores del héroe: 9 familias, 7 órganos, 103 fichas, 102 patologías.
  // (102, no 103: el chip raro de Penicilina «Sífilis . No es fármaco de ITU»
  // se normalizó a «Sífilis», así que hay una patología distinta menos.)
  const stats = [...doc.querySelectorAll(".hero-stats .stat")].map((s) => s.textContent.replace(/\s+/g, " ").trim());
  check("9 familias en el héroe", stats.some((s) => /^9familias/.test(s.replace(/\s/g, ""))), stats.join(" | "));
  check("103 fichas en el héroe", stats.some((s) => s.replace(/\s/g, "").startsWith("103fichas")));
  check("7 órganos en el héroe", stats.some((s) => s.replace(/\s/g, "").startsWith("7órganos")));
  check("102 patologías en el héroe", stats.some((s) => s.replace(/\s/g, "").startsWith("102patologías")));

  // Interfaz sin metadatos (decisión de Rey 2026-11-17): el pie es una
  // línea corta, sin lista del corpus, sin Gauntlet ni aviso de dosis.
  const footerText = (doc.querySelector(".footer-inner")?.textContent || "").replace(/\s+/g, " ").trim();
  check("pie corto sin metadatos", footerText === "UroFármacos · Wiki de fármacos en urología.", footerText);
  check("pie sin Gauntlet/corpus/EAU", !/Gauntlet|corpus|EAU|Campbell|Urology-Textbook/.test(footerText));
  check("héroe sin 'auditadas'", !/auditad/.test(doc.querySelector(".hero")?.textContent || ""));
  check("sin aviso de dosis en la ficha", !doc.querySelector(".warn-box"));

  // 9 tarjetas de familia con su conteo.
  const cards = [...doc.querySelectorAll(".grid-fam .fam-card")];
  check("9 tarjetas de familia", cards.length === 9, `hay ${cards.length}`);
  const expected = {
    Alfabloqueadores: 6, "Inhibidores de la 5-alfa-reductasa": 2,
    "Antimuscarínicos y agonistas beta-3": 14, "Inhibidores de PDE5 y salud sexual": 9,
    "Antibióticos urinarios": 17, "Quimioterapia urológica": 10,
    "Terapia dirigida e inmunoterapia": 19, "Hormonoterapia prostática": 13,
    "Otros fármacos de uso urológico": 13,
  };
  for (const [name, n] of Object.entries(expected)) {
    const card = cards.find((c) => c.querySelector("h3")?.textContent.trim() === name);
    const pill = card?.querySelector(".count-pill")?.textContent || "";
    check(`familia ${name}: ${n} fichas`, !!card && pill.includes(String(n)) && pill.includes("ficha"), pill);
  }
  // Lista móvil de familias (misma información, otro formato).
  const mFams = [...doc.querySelectorAll(".m-fam-list .m-fam")];
  check("9 filas móviles de familia", mFams.length === 9, `hay ${mFams.length}`);

  // Buscador: escribir y esperar resultados.
  const input = doc.querySelector('.topbar input[type="search"]');
  async function search(q) {
    await typeInto(window, input, q, tick);
  }

  await search("tamsulosina");
  const group = doc.querySelector(".result-group")?.textContent || "";
  check("buscar tamsulosina: grupo Fármacos", /Fármacos · [1-9]/.test(group), group);
  const firstRow = doc.querySelector(".drug-row");
  check("buscar tamsulosina: hay resultado clicable", !!firstRow);
  check("resaltado amarillo en el resultado", !!doc.querySelector(".drug-row .hl"));

  // Abrir la ficha desde el resultado.
  firstRow?.click(); await tick(); await tick();
  check("ficha tamsulosina abierta", headings(doc).includes("Indicaciones") && doc.body.textContent.includes("Tamsulosina"));
  const detailText = doc.body.textContent;
  check("ficha muestra Mecanismo de acción", headings(doc).includes("Mecanismo de acción"));
  check("ficha muestra Dosis habitual", headings(doc).includes("Dosis habitual"));
  check("ficha muestra Contraindicaciones y precauciones", headings(doc).includes("Contraindicaciones y precauciones"));
  check("ficha muestra Fuentes", !!doc.querySelector(".source-line") && (doc.querySelector(".source-line")?.textContent || "").includes("EAU Male LUTS 2025"));
  check("ficha con breadcrumb", !!doc.querySelector(".crumb"));
  check("ficha con índice de secciones", !!doc.querySelector(".sec-index"));
  check("ficha con quicknav móvil", !!doc.querySelector(".m-quicknav"));
  check("ficha sin botón atrás (lo sustituye el breadcrumb)", !doc.querySelector(".page .back-btn"));

  // ---------- Modo lectura ----------
  const findReadBtn = () =>
    [...doc.querySelectorAll(".ficha-actions .fav")].find((b) =>
      b.textContent.includes("Modo lectura"));
  check("botón Modo lectura existe en la ficha", !!findReadBtn());
  findReadBtn()?.click(); await tick(); await tick();
  const rm = doc.querySelector(".reading-mode");
  check("modo lectura abierto (portal a body)", !!rm);
  check("modo lectura con fondo blanco",
    !!rm && window.getComputedStyle(rm).backgroundColor === "rgb(255, 255, 255)",
    rm ? window.getComputedStyle(rm).backgroundColor : "sin overlay");
  check("modo lectura con título del fármaco",
    (rm?.querySelector(".reading-title")?.textContent || "").includes("Tamsulosina"));
  check("modo lectura con variable --tam-letra 13.5px",
    rm?.style.getPropertyValue("--tam-letra") === "13.5px",
    rm?.style.getPropertyValue("--tam-letra") || "");
  check("modo lectura con píldora 100%",
    (rm?.querySelector(".reading-pct")?.textContent || "") === "100%");
  check("modo lectura sin botón Modo lectura dentro (no recursivo)",
    !!rm && ![...rm.querySelectorAll(".ficha-actions .fav")].some((b) =>
      b.textContent.includes("Modo lectura")));
  check("modo lectura sin índice lateral", !!rm && !rm.querySelector(".sec-index"));
  check("modo lectura con secciones rm- únicas", !!rm?.querySelector("#rm-sec-indicaciones"));
  check("sin IDs de sección duplicados (el fondo conserva sec-*)",
    doc.querySelectorAll("#sec-indicaciones").length === 1,
    `${doc.querySelectorAll("#sec-indicaciones").length} con ese id`);
  check("modo lectura muestra Indicaciones",
    !!rm && [...rm.querySelectorAll(".sec h2")].some((h) => h.textContent.trim() === "Indicaciones"));
  check("modo lectura bloquea el scroll del fondo", doc.body.style.overflow === "hidden");
  const plusBtn = [...(rm?.querySelectorAll(".reading-zoom button") || [])].find((b) =>
    b.textContent.trim() === "A+");
  plusBtn?.click(); await tick(); await tick();
  check("A+ sube --tam-letra a 14.5px",
    rm?.style.getPropertyValue("--tam-letra") === "14.5px",
    rm?.style.getPropertyValue("--tam-letra") || "");
  check("A+ actualiza la píldora a 107%",
    (rm?.querySelector(".reading-pct")?.textContent || "") === "107%");
  check("A+ persiste en localStorage uf:letra",
    window.localStorage.getItem("uf:letra") === "14.5",
    window.localStorage.getItem("uf:letra") || "");
  rm?.querySelector(".reading-pct")?.click(); await tick(); await tick();
  check("la píldora % resetea a 100%",
    rm?.style.getPropertyValue("--tam-letra") === "13.5px" &&
    (rm?.querySelector(".reading-pct")?.textContent || "") === "100%");
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick(); await tick();
  check("Escape cierra el modo lectura", !doc.querySelector(".reading-mode"));
  check("al cerrar se restaura el scroll del fondo", doc.body.style.overflow === "");
  findReadBtn()?.click(); await tick(); await tick();
  check("el modo lectura reabre y recuerda el 100% reseteado",
    doc.querySelector(".reading-mode")?.style.getPropertyValue("--tam-letra") === "13.5px");
  doc.querySelector(".reading-close")?.click(); await tick(); await tick();
  check("✕ cierra el modo lectura", !doc.querySelector(".reading-mode"));

  // Volver y comprobar que las fichas que antes tenían lagunas ya
  // muestran sus secciones completas y sin marcas editoriales.
  const crumbHome = doc.querySelector(".crumb button");
  crumbHome?.click(); await tick(); await tick();
  check("vuelta a Inicio con el breadcrumb", !!doc.querySelector(".hero"));
  // Cabazitaxel ya no va en este bucle: sus contraindicaciones e
  // interacciones quedaron en LAGUNA por decisión del árbitro 2026-11-23
  // (eran trasplantes de docetaxel/abiraterona); se verifica aparte abajo.
  for (const name of ["naftopidil", "denosumab"]) {
    await search(name);
    const row = [...doc.querySelectorAll(".drug-row")].find((r) => r.textContent.toLowerCase().includes(name));
    if (!row) { check(`ficha ${name}: encontrada en búsqueda`, false); continue; }
    row.click(); await tick(); await tick();
    const h = headings(doc);
    const contra = doc.querySelector(".sec#sec-contraindicaciones");
    check(`ficha ${name}: muestra Indicaciones`, h.includes("Indicaciones"));
    check(`ficha ${name}: contraindicaciones con contenido`,
      h.includes("Contraindicaciones y precauciones") &&
      (contra?.textContent || "").includes("Hipersensibilidad"));
    check(`ficha ${name}: sin LAGUNA visible`,
      !/LAGUNA|laguna/i.test(doc.body.textContent || ""));
    doc.querySelector(".crumb button")?.click(); await tick(); await tick();
  }

  // Cabazitaxel en LAGUNA (árbitro 2026-11-23): ambas secciones deben
  // mostrar «No consta en la ficha.» y ninguna marca de laguna.
  await search("cabazitaxel");
  const cabRow = [...doc.querySelectorAll(".drug-row")].find((r) => r.textContent.toLowerCase().includes("cabazitaxel"));
  check("ficha cabazitaxel: encontrada en búsqueda", !!cabRow);
  cabRow?.click(); await tick(); await tick();
  const cabContra = doc.querySelector(".sec#sec-contraindicaciones");
  const cabInter = doc.querySelector(".sec#sec-interacciones");
  check("ficha cabazitaxel: contraindicaciones «No consta en la ficha.»",
    (cabContra?.textContent || "").includes("No consta en la ficha."));
  check("ficha cabazitaxel: interacciones «No consta en la ficha.»",
    (cabInter?.textContent || "").includes("No consta en la ficha."));
  check("ficha cabazitaxel: sin LAGUNA visible",
    !/LAGUNA|laguna/i.test(doc.body.textContent || ""));
  doc.querySelector(".crumb button")?.click(); await tick(); await tick();

  // Eje por órgano: abrir Próstata para contar sus fichas.
  check("vuelta a Inicio tras las fichas", !!doc.querySelector(".hero"));
  const chip = [...doc.querySelectorAll(".block .chips .chip")].find((c) => c.textContent.startsWith("Próstata"));
  check("chip Próstata presente", !!chip, chip?.textContent || "");
  check("chip Próstata con contador .n 53", (chip?.querySelector(".n")?.textContent || "") === "53");
  chip?.click(); await tick(); await tick();
  const organRows = doc.querySelectorAll(".drug-row").length;
  check("vista Próstata lista 53 fichas", organRows === 53, `${organRows} filas`);
  doc.querySelector(".brand")?.click(); await tick(); await tick();

  // ---------- Panel de patologías ----------
  const panelInput = doc.querySelector(".panel-search input");
  check("panel de patologías con input de filtro", !!panelInput);
  await typeInto(window, panelInput, "litiasis", tick);
  const panelChips = [...doc.querySelectorAll(".panel .chips .chip")];
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  check("filtro litiasis: chips filtradas",
    panelChips.length > 0 && panelChips.length < 12 &&
    panelChips.every((c) => norm(c.textContent).includes("litiasis")),
    `${panelChips.length} chips`);
  const panelFoot = (doc.querySelector(".panel-foot span")?.textContent || "");
  check("filtro litiasis: el pie cambia",
    new RegExp(`Mostrando ${panelChips.length} de 102 patologías`).test(panelFoot), panelFoot);
  await typeInto(window, panelInput, "", tick);
  check("sin filtro: 12 patologías visibles",
    doc.querySelectorAll(".panel .chips .chip").length === 12);
  const expandBtn = [...doc.querySelectorAll(".panel-foot .block-link")].find((b) =>
    b.textContent.includes("Ver todas las patologías"));
  check("botón Ver todas las patologías presente", !!expandBtn);
  expandBtn?.click(); await tick(); await tick();
  check("Ver todas las patologías expande a las 102",
    doc.querySelectorAll(".panel .chips .chip").length === 102,
    `${doc.querySelectorAll(".panel .chips .chip").length} chips`);
  check("pie con 102 de 102 tras expandir",
    /Mostrando 102 de 102 patologías/.test(doc.querySelector(".panel-foot span")?.textContent || ""));
  check("botón cambia a Ver menos tras expandir",
    [...doc.querySelectorAll(".panel-foot .block-link")].some((b) => b.textContent.includes("Ver menos")));
  // El enlace del encabezado del bloque también alterna.
  doc.querySelector(".block#patologias .block-head .block-link")?.click(); await tick();
  check("Ver menos del encabezado colapsa a 12",
    doc.querySelectorAll(".panel .chips .chip").length === 12);

  // ---------- Paleta de comandos (Ctrl/⌘ + K) ----------
  // El atajo ya no enfoca el buscador: abre la paleta. Al cerrar,
  // devuelve el foco a quien la abrió.
  input.focus();
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  await tick(); await tick();
  const cpPanel = doc.querySelector(".cp-panel");
  check("Ctrl+K abre la paleta de comandos", !!cpPanel);
  check("paleta enfoca su buscador", doc.activeElement === doc.querySelector(".cp-input"));
  check("paleta incluye acciones de producto",
    (cpPanel?.textContent || "").includes("Comparar fármacos") &&
    (cpPanel?.textContent || "").includes("Índice alfabético completo"));
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await tick(); await tick();
  check("Escape cierra la paleta", !doc.querySelector(".cp-panel"));
  check("al cerrar la paleta, el foco vuelve al buscador", doc.activeElement === input);

  // ---------- Sin metadatos en el texto visible ----------
  const bodyText = doc.body.textContent || "";
  check("texto visible sin metadatos",
    !/auditad|Gauntlet|corpus|fuente citada|ronda 4|transparencia editorial|sabes lo que está|laguna|cobertura editorial/i.test(bodyText),
    (bodyText.match(/auditad|Gauntlet|corpus|fuente citada|ronda 4|transparencia editorial|sabes lo que está|laguna|cobertura editorial/i) || [""])[0]);

  // ---------- Routing por hash: ficha ----------
  const ficha = await mount("http://localhost/#/ficha/tamsulosina", ".ficha-title");
  const fdoc = ficha.doc, fwin = ficha.window, ftick = ficha.tick;
  check("hash #/ficha/tamsulosina abre la ficha",
    (fdoc.querySelector(".ficha-title")?.textContent || "") === "Tamsulosina");
  check("hash ficha: índice de secciones presente", !!fdoc.querySelector(".sec-index"));
  check("hash ficha: quicknav presente", !!fdoc.querySelector(".m-quicknav"));
  check("hash ficha: sin errores de ventana/jsdom", ficha.errors.length === 0, ficha.errors.slice(0, 3).join(" | "));
  check("hash ficha: texto visible sin metadatos",
    !/auditad|Gauntlet|corpus|fuente citada|ronda 4|transparencia editorial|sabes lo que está|laguna|cobertura editorial/i.test(fdoc.body.textContent || ""));

  // Copiar enlace (clipboard stubbeado).
  const copyBtn = [...fdoc.querySelectorAll(".ficha-actions .fav")].find((b) =>
    b.textContent.includes("Copiar enlace"));
  check("botón Copiar enlace existe en la ficha", !!copyBtn);
  let capturedUrl = "";
  Object.defineProperty(fwin.navigator, "clipboard", {
    value: { writeText: async (t) => { capturedUrl = t; } },
    configurable: true,
  });
  copyBtn?.click(); await ftick(); await ftick();
  check("Copiar enlace copia la URL con el hash",
    capturedUrl.endsWith("#/ficha/tamsulosina"), capturedUrl);
  check("Copiar enlace cambia la etiqueta",
    (copyBtn?.textContent || "").includes("¡Enlace copiado!"));

  // Exportar a Markdown (createObjectURL y click del <a> stubbeados).
  let capturedBlob = null;
  let capturedDownload = "";
  fwin.URL.createObjectURL = (blob) => { capturedBlob = blob; return "blob:test"; };
  const origAnchorClick = fwin.HTMLAnchorElement.prototype.click;
  fwin.HTMLAnchorElement.prototype.click = function () { capturedDownload = this.download || ""; };
  const exportBtn = [...fdoc.querySelectorAll(".ficha-actions .fav")].find((b) =>
    b.textContent.includes("Exportar"));
  check("botón Exportar existe en la ficha", !!exportBtn);
  exportBtn?.click(); await ftick(); await ftick();
  const mdText = capturedBlob ? await blobText(fwin, capturedBlob) : "";
  check("exportar: markdown con título", mdText.includes("# Tamsulosina"), mdText.slice(0, 60));
  check("exportar: markdown con Dosis habitual", mdText.includes("## Dosis habitual"));
  check("exportar: markdown con Fuente", mdText.includes("Fuente:"));
  check("exportar: nombre de archivo tamsulosina.md", capturedDownload === "tamsulosina.md", capturedDownload);
  fwin.HTMLAnchorElement.prototype.click = origAnchorClick;

  // Exportar una ficha antes incompleta: ya no debe contener marcas de laguna.
  const lag = await mount("http://localhost/#/ficha/naftopidil", ".ficha-title");
  const lagDoc = lag.doc, lagWin = lag.window, lagTick = lag.tick;
  let lagBlob = null;
  let lagDownload = "";
  lagWin.URL.createObjectURL = (blob) => { lagBlob = blob; return "blob:test"; };
  const origClick2 = lagWin.HTMLAnchorElement.prototype.click;
  lagWin.HTMLAnchorElement.prototype.click = function () { lagDownload = this.download || ""; };
  const lagExport = [...lagDoc.querySelectorAll(".ficha-actions .fav")].find((b) =>
    b.textContent.includes("Exportar"));
  lagExport?.click(); await lagTick(); await lagTick();
  const lagMd = lagBlob ? await blobText(lagWin, lagBlob) : "";
  check("exportar naftopidil: sin LAGUNA", !lagMd.includes("LAGUNA"));
  check("exportar naftopidil: contraindicaciones completas",
    lagMd.includes("Hipersensibilidad a naftopidil"));
  check("exportar naftopidil: archivo naftopidil.md", lagDownload === "naftopidil.md", lagDownload);
  lagWin.HTMLAnchorElement.prototype.click = origClick2;
  check("ficha naftopidil: sin bloque .laguna",
    !lagDoc.querySelector(".laguna"));

  // ---------- Routing por hash: familia ----------
  const fam = await mount("http://localhost/#/familia/alfabloqueadores", ".drug-row");
  check("hash #/familia/alfabloqueadores abre la vista (6 filas)",
    fam.doc.querySelectorAll(".drug-row").length === 6,
    `${fam.doc.querySelectorAll(".drug-row").length} filas`);
  check("hash familia: sin errores de ventana/jsdom", fam.errors.length === 0, fam.errors.slice(0, 3).join(" | "));

  // ---------- Créditos ----------
  const cred = await mount("http://localhost/#/creditos", ".credits");
  const cdoc = cred.doc;
  const credText = (cdoc.querySelector(".credits")?.textContent || "").replace(/\s+/g, " ");
  check("hash #/creditos abre la vista", !!cdoc.querySelector(".credits"));
  check("créditos con autor", credText.includes("Reynel Busto González"), credText.slice(0, 80));
  check("créditos con cargo y hospital",
    credText.includes("Médico Urólogo") && credText.includes("Hermanos Ameijeiras"));
  check("créditos con ORCID", credText.includes("0009-0003-2233-9021"));
  check("créditos con 103 fichas en 9 familias",
    credText.includes("103 fichas") && credText.includes("9 familias"));
  check("créditos con fuentes EAU 2025 y Urology-Textbook",
    credText.includes("EAU") && credText.includes("2025") && credText.includes("Urology-Textbook"));
  check("créditos: sin errores de ventana/jsdom", cred.errors.length === 0, cred.errors.slice(0, 3).join(" | "));

  // ---------- Routing por hash: índice A–Z y comparador ----------
  const idx = await mount("http://localhost/#/farmacos", ".idx-page");
  check("hash #/farmacos abre el índice A–Z", !!idx.doc.querySelector(".idx-page"));
  check("índice A–Z: 103 filas", idx.doc.querySelectorAll(".idx-row").length === 103,
    `${idx.doc.querySelectorAll(".idx-row").length} filas`);
  check("índice A–Z: buscador y filtros de familia",
    !!idx.doc.querySelector(".idx-search input") && idx.doc.querySelectorAll(".idx-fam").length === 10);
  check("índice A–Z: sin errores de ventana/jsdom", idx.errors.length === 0, idx.errors.slice(0, 3).join(" | "));

  const cmp = await mount("http://localhost/#/comparar/tamsulosina,naftopidil", ".cmp-table");
  check("hash #/comparar/... abre el comparador", !!cmp.doc.querySelector(".cmp-table"));
  check("comparador: 2 fármacos en 3 columnas",
    cmp.doc.querySelectorAll(".cmp-table thead th").length === 3,
    `${cmp.doc.querySelectorAll(".cmp-table thead th").length} columnas`);
  const cmpText = (cmp.doc.querySelector(".cmp-table")?.textContent || "").replace(/\s+/g, " ");
  check("comparador: secciones clínicas",
    cmpText.includes("Mecanismo de acción") &&
    cmpText.includes("Dosis habitual") &&
    cmpText.includes("Interacciones"));
  check("comparador: sin cobertura ni lagunas",
    !/cobertura editorial|LAGUNA|laguna/i.test(cmp.doc.body.textContent || ""));
  const cmpCells = [...cmp.doc.querySelectorAll(".cmp-table td[data-drug]")];
  check("comparador móvil: cada celda declara su fármaco",
    cmpCells.length > 0 && cmpCells.every((td) => !!td.getAttribute("data-drug")),
    `${cmpCells.length} celdas`);
  check("comparador móvil: chips de fármacos presentes",
    cmp.doc.querySelectorAll(".cmp-cols .cmp-col-chip").length === 2);
  const diffToggle = cmp.doc.querySelector(".cmp-toggle");
  const rowsBefore = cmp.doc.querySelectorAll(".cmp-table tbody tr").length;
  diffToggle?.click(); await cmp.tick();
  const rowsAfter = cmp.doc.querySelectorAll(".cmp-table tbody tr").length;
  check("comparador: 'solo diferencias' reduce filas",
    rowsBefore > 0 && rowsAfter > 0 && rowsAfter <= rowsBefore,
    `${rowsBefore} → ${rowsAfter}`);
  check("comparador: sin errores de ventana/jsdom", cmp.errors.length === 0, cmp.errors.slice(0, 3).join(" | "));

  const unknown = await mount("http://localhost/#/noexiste", ".hero");
  check("hash desconocido va a inicio", !!unknown.doc.querySelector(".hero"));
  // Enlaces a Créditos en la primera instancia (en inicio).
  const footLink = doc.querySelector(".footer-link");
  check("enlace Créditos en el pie (fuera de .footer-inner)",
    !!footLink && footLink.textContent.trim() === "Créditos");
  check("pie .footer-inner intacto (línea corta)",
    (doc.querySelector(".footer-inner")?.textContent || "").replace(/\s+/g, " ").trim() ===
      "UroFármacos · Wiki de fármacos en urología.");
  footLink?.click(); await tick(); await tick();
  check("clic en Créditos del pie abre la vista", !!doc.querySelector(".credits"));
  check("clic en Créditos pone el hash #/creditos",
    window.location.hash === "#/creditos", window.location.hash);
  // Créditos desde el cajón: abre la vista y cierra el cajón.
  burger?.click(); await tick(); await tick();
  const drawerCred = [...doc.querySelectorAll(".nav-drawer .side-item")].find((b) =>
    b.textContent.includes("Créditos"));
  check("enlace Créditos en el cajón", !!drawerCred);
  drawerCred?.click(); await tick(); await tick();
  check("clic en Créditos del cajón abre la vista", !!doc.querySelector(".credits"));
  check("al ir a Créditos el cajón se cierra", !drawer?.classList.contains("open"));

  // Sin referencias externas restantes.
  check("sin src/href externos en el HTML", !/src="\/|href="\/|url\(\//.test(html));

  console.log(failures === 0 ? `\nSMOKE OK (${file})` : `\nSMOKE FALLIDO: ${failures} comprobaciones`);
  process.exit(failures === 0 ? 0 : 1);
})();
