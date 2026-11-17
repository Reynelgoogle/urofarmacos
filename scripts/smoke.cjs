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
async function mount(url, readySelector) {
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

  // Sin referencias externas restantes.
  check("sin src/href externos en el HTML", !/src="\/|href="\/|url\(\//.test(html));

  console.log(failures === 0 ? `\nSMOKE OK (${file})` : `\nSMOKE FALLIDO: ${failures} comprobaciones`);
  process.exit(failures === 0 ? 0 : 1);
})();
