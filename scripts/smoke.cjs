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

  // Estructura nueva: topbar, sidebar, shell y bottom nav móvil.
  check("topbar presente", !!doc.querySelector(".topbar"));
  check("atajo ⌘ K visible", (doc.querySelector(".topbar kbd")?.textContent || "") === "⌘ K");
  check("sidebar presente", !!doc.querySelector(".sidebar"));
  check("sidebar con grupo Familias", (doc.querySelector(".sidebar")?.textContent || "").includes("Familias"));
  check("sidebar con Todas las patologías", (doc.querySelector(".sidebar")?.textContent || "").includes("Todas las patologías"));
  const bottomBtns = [...doc.querySelectorAll(".m-bottomnav button")];
  check("bottom nav móvil con 4 botones", bottomBtns.length === 4, `${bottomBtns.length} botones`);
  check("bottom nav: Inicio, Índice, Buscar, Favoritos",
    ["Inicio", "Índice", "Buscar", "Favoritos"].every((t) =>
      bottomBtns.some((b) => b.textContent.includes(t))));

  // ---------- Sidebar colapsable (escritorio) ----------
  const sidebar = doc.querySelector(".sidebar");
  const collapseBtn = doc.querySelector(".side-collapse");
  check("botón de colapso de la sidebar existe", !!collapseBtn);
  check("sidebar empieza expandida", !!sidebar && !sidebar.classList.contains("collapsed"));
  check("sidebar expandida mide 264px", window.getComputedStyle(sidebar).width === "264px", window.getComputedStyle(sidebar).width);
  collapseBtn?.click(); await tick(); await tick();
  check("al pulsar colapso la sidebar se contrae (clase)", sidebar.classList.contains("collapsed"));
  check("sidebar colapsada mide 60px", window.getComputedStyle(sidebar).width === "60px", window.getComputedStyle(sidebar).width);
  check("estado colapsado persiste en localStorage uf:sidebar",
    window.localStorage.getItem("uf:sidebar") === "collapsed");
  check("riel colapsado sigue con Inicio/Favoritos/Créditos",
    doc.querySelectorAll(".sidebar .side-item").length === 3,
    `${doc.querySelectorAll(".sidebar .side-item").length} botones`);
  check("riel colapsado sigue con 9 familias + 7 órganos + 4 patologías",
    doc.querySelectorAll(".sidebar .side-fam").length === 20,
    `${doc.querySelectorAll(".sidebar .side-fam").length} botones`);
  check("riel colapsado con título/tooltip en cada icono",
    [...doc.querySelectorAll(".sidebar .side-item, .sidebar .side-fam")].every((b) =>
      (b.getAttribute("title") || "").length > 0));
  check("botón cambia a Expandir índice",
    collapseBtn.getAttribute("aria-label") === "Expandir índice");
  // El riel colapsado sigue navegando: primera familia (alfabloqueadores).
  doc.querySelector(".sidebar .side-fam")?.click(); await tick(); await tick();
  check("riel colapsado: pulsar una familia abre su vista (6 filas)",
    doc.querySelectorAll(".drug-row").length === 6,
    `${doc.querySelectorAll(".drug-row").length} filas`);
  doc.querySelector(".brand")?.click(); await tick(); await tick();
  check("vuelta a Inicio tras navegar desde el riel", !!doc.querySelector(".hero"));
  collapseBtn?.click(); await tick(); await tick();
  check("al pulsar de nuevo la sidebar se expande", !sidebar.classList.contains("collapsed"));
  check("estado expandido persiste en localStorage uf:sidebar",
    window.localStorage.getItem("uf:sidebar") === "open");
  // Persistencia entre visitas: una instancia nueva con uf:sidebar
  // sembrado en "collapsed" arranca ya colapsada.
  const persisted = await mount("http://localhost/", ".hero",
    (w) => w.localStorage.setItem("uf:sidebar", "collapsed"));
  check("sidebar colapsada recordada entre visitas",
    !!persisted.doc.querySelector(".sidebar")?.classList.contains("collapsed"));
  check("sidebar recordada: sin errores de ventana/jsdom",
    persisted.errors.length === 0, persisted.errors.slice(0, 3).join(" | "));

  // Contadores del héroe: 9 familias, 7 órganos, 103 fichas, 103 patologías.
  const stats = [...doc.querySelectorAll(".hero-stats .stat")].map((s) => s.textContent.replace(/\s+/g, " ").trim());
  check("9 familias en el héroe", stats.some((s) => /^9familias/.test(s.replace(/\s/g, ""))), stats.join(" | "));
  check("103 fichas en el héroe", stats.some((s) => s.replace(/\s/g, "").startsWith("103fichas")));
  check("7 órganos en el héroe", stats.some((s) => s.replace(/\s/g, "").startsWith("7órganos")));
  check("103 patologías en el héroe", stats.some((s) => s.replace(/\s/g, "").startsWith("103patologías")));

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

  // Volver y probar la regresión FALLO-1: fichas con gap de
  // contraindicaciones (pero no de indicaciones) deben MOSTRAR
  // sus Indicaciones. Antes del arreglo, isGap() por subcadena
  // hacía desaparecer esa sección en 18 fichas.
  const crumbHome = doc.querySelector(".crumb button");
  crumbHome?.click(); await tick(); await tick();
  check("vuelta a Inicio con el breadcrumb", !!doc.querySelector(".hero"));
  for (const name of ["naftopidil", "cabazitaxel", "denosumab"]) {
    await search(name);
    const row = [...doc.querySelectorAll(".drug-row")].find((r) => r.textContent.toLowerCase().includes(name));
    if (!row) { check(`FALLO-1 ${name}: encontrado en búsqueda`, false); continue; }
    row.click(); await tick(); await tick();
    const h = headings(doc);
    const hasIndic = h.includes("Indicaciones");
    const laguna = doc.querySelector(".sec#sec-contraindicaciones .laguna");
    const hasLagunaContra = h.includes("Contraindicaciones y precauciones") &&
      laguna?.textContent.trim() === "Sin datos en el corpus (LAGUNA).";
    check(`FALLO-1 ${name}: muestra Indicaciones`, hasIndic);
    check(`FALLO-1 ${name}: marca LAGUNA en contraindicaciones`, hasLagunaContra);
    doc.querySelector(".crumb button")?.click(); await tick(); await tick();
  }

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
    new RegExp(`Mostrando ${panelChips.length} de 103 patologías`).test(panelFoot), panelFoot);
  await typeInto(window, panelInput, "", tick);
  check("sin filtro: 12 patologías visibles",
    doc.querySelectorAll(".panel .chips .chip").length === 12);
  const expandBtn = [...doc.querySelectorAll(".panel-foot .block-link")].find((b) =>
    b.textContent.includes("Ver todas las patologías"));
  check("botón Ver todas las patologías presente", !!expandBtn);
  expandBtn?.click(); await tick(); await tick();
  check("Ver todas las patologías expande a las 103",
    doc.querySelectorAll(".panel .chips .chip").length === 103,
    `${doc.querySelectorAll(".panel .chips .chip").length} chips`);
  check("pie con 103 de 103 tras expandir",
    /Mostrando 103 de 103 patologías/.test(doc.querySelector(".panel-foot span")?.textContent || ""));
  check("botón cambia a Ver menos tras expandir",
    [...doc.querySelectorAll(".panel-foot .block-link")].some((b) => b.textContent.includes("Ver menos")));
  // El enlace del encabezado del bloque también alterna.
  doc.querySelector(".block#patologias .block-head .block-link")?.click(); await tick();
  check("Ver menos del encabezado colapsa a 12",
    doc.querySelectorAll(".panel .chips .chip").length === 12);

  // ---------- Atajo Ctrl+K ----------
  input.blur();
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  await tick();
  check("Ctrl+K enfoca el buscador", doc.activeElement === input);

  // ---------- Sin metadatos en el texto visible ----------
  const bodyText = doc.body.textContent || "";
  check("texto visible sin metadatos",
    !/auditad|Gauntlet|corpus congelado|fuente citada|ronda 4/i.test(bodyText),
    (bodyText.match(/auditad|Gauntlet|corpus congelado|fuente citada|ronda 4/i) || [""])[0]);

  // ---------- Routing por hash: ficha ----------
  const ficha = await mount("http://localhost/#/ficha/tamsulosina", ".ficha-title");
  const fdoc = ficha.doc, fwin = ficha.window, ftick = ficha.tick;
  check("hash #/ficha/tamsulosina abre la ficha",
    (fdoc.querySelector(".ficha-title")?.textContent || "") === "Tamsulosina");
  check("hash ficha: índice de secciones presente", !!fdoc.querySelector(".sec-index"));
  check("hash ficha: quicknav presente", !!fdoc.querySelector(".m-quicknav"));
  check("hash ficha: sin errores de ventana/jsdom", ficha.errors.length === 0, ficha.errors.slice(0, 3).join(" | "));
  check("hash ficha: texto visible sin metadatos",
    !/auditad|Gauntlet|corpus congelado|fuente citada|ronda 4/i.test(fdoc.body.textContent || ""));

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

  // Exportar una ficha con laguna: el markdown marca LAGUNA.
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
  check("exportar naftopidil: markdown con LAGUNA",
    lagMd.includes("Sin datos en el corpus (LAGUNA)."));
  check("exportar naftopidil: archivo naftopidil.md", lagDownload === "naftopidil.md", lagDownload);
  lagWin.HTMLAnchorElement.prototype.click = origClick2;
  const lagunaEl = lagDoc.querySelector(".sec#sec-contraindicaciones .laguna");
  check(".laguna existe en ficha con gap y texto exacto",
    lagunaEl?.textContent.trim() === "Sin datos en el corpus (LAGUNA).",
    lagunaEl?.textContent.trim() || "sin .laguna");

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
  const sideCred = [...doc.querySelectorAll(".sidebar .side-item")].find((b) =>
    b.textContent.includes("Créditos"));
  check("enlace Créditos en la sidebar", !!sideCred);
  sideCred?.click(); await tick(); await tick();
  check("clic en Créditos de la sidebar abre la vista", !!doc.querySelector(".credits"));

  // Sin referencias externas restantes.
  check("sin src/href externos en el HTML", !/src="\/|href="\/|url\(\//.test(html));

  console.log(failures === 0 ? `\nSMOKE OK (${file})` : `\nSMOKE FALLIDO: ${failures} comprobaciones`);
  process.exit(failures === 0 ? 0 : 1);
})();
