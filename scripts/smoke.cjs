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

(async () => {
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
    url: "http://localhost/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  window.addEventListener("error", (e) => errors.push("window error: " + e.message));

  // Esperar a que React monte.
  for (let i = 0; i < 50 && !window.document.querySelector(".hero"); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const doc = window.document;
  const tick = () => new Promise((r) => setTimeout(r, 50));

  check("sin errores de ventana/jsdom", errors.length === 0, errors.slice(0, 3).join(" | "));
  check("héroe renderizado", !!doc.querySelector(".hero"));

  // Imágenes inlinadas como data URI.
  const logo = doc.querySelector(".hero-logo");
  check("logo del héroe con data URI", !!logo && logo.src.startsWith("data:image/jpeg"));
  const mark = doc.querySelector(".brand-mark-img");
  check("marca de cabecera con data URI", !!mark && mark.src.startsWith("data:image/png"));
  check("favicon inlinado", !!doc.querySelector('link[rel="icon"][href^="data:image/png"]'));

  // Contadores del héroe: 9 familias, 7 órganos, 103 fichas.
  const stats = doc.querySelector(".hero-stats")?.textContent || "";
  check("9 familias en el héroe", /9\s*familias/.test(stats), stats.replace(/\s+/g, " ").slice(0, 120));
  check("103 fichas en el héroe", /103\s*fichas/.test(stats));
  check("7 órganos en el héroe", /7\s*órganos/.test(stats));

  // Interfaz sin metadatos (decisión de Rey 2026-11-17): el pie es una
  // línea corta, sin lista del corpus, sin Gauntlet ni aviso de dosis.
  const footerText = (doc.querySelector(".footer-inner")?.textContent || "").replace(/\s+/g, " ").trim();
  check("pie corto sin metadatos", footerText === "UroFármacos · Wiki de fármacos en urología.", footerText);
  check("pie sin Gauntlet/corpus/EAU", !/Gauntlet|corpus|EAU|Campbell|Urology-Textbook/.test(footerText));
  check("héroe sin 'auditadas'", !/auditad/.test(doc.querySelector(".hero")?.textContent || ""));
  check("sin aviso de dosis en la ficha", !doc.querySelector(".warn-box"));

  // 9 tarjetas de familia con su conteo.
  const cards = [...doc.querySelectorAll(".grid .card")];
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
    const badge = card?.querySelector(".count-badge")?.textContent || "";
    check(`familia ${name}: ${n} fichas`, !!card && badge.includes(String(n)), badge);
  }

  // Buscador: escribir y esperar resultados.
  const input = doc.querySelector('input[type="search"]');
  async function search(q) {
    // SOLO el setter nativo + evento input: asignar input.value
    // directamente antes confunde el rastreador de valor de React y
    // el onChange no se dispara.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, q);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await tick(); await tick();
  }
  function headings() { return [...doc.querySelectorAll("h2")].map((h) => h.textContent.trim()); }

  await search("tamsulosina");
  const group = doc.querySelector(".result-group")?.textContent || "";
  check("buscar tamsulosina: grupo Fármacos", /Fármacos · [1-9]/.test(group), group);
  const firstRow = doc.querySelector(".drug-row");
  check("buscar tamsulosina: hay resultado clicable", !!firstRow);
  check("resaltado amarillo en el resultado", !!doc.querySelector(".drug-row .hl"));

  // Abrir la ficha desde el resultado.
  firstRow?.click(); await tick(); await tick();
  check("ficha tamsulosina abierta", headings().includes("Indicaciones") && !!doc.querySelector("h1, h2") && doc.body.textContent.includes("Tamsulosina"));
  const detailText = doc.body.textContent;
  check("ficha muestra Mecanismo de acción", headings().includes("Mecanismo de acción"));
  check("ficha muestra Dosis habitual", headings().includes("Dosis habitual"));
  check("ficha muestra Contraindicaciones y precauciones", headings().includes("Contraindicaciones y precauciones"));
  check("ficha muestra Fuentes", !!doc.querySelector(".source") && (doc.querySelector(".source")?.textContent || "").includes("EAU Male LUTS 2025"));

  // Volver y probar la regresión FALLO-1: fichas con gap de
  // contraindicaciones (pero no de indicaciones) deben MOSTRAR
  // sus Indicaciones. Antes del arreglo, isGap() por subcadena
  // hacía desaparecer esa sección en 18 fichas.
  const back = doc.querySelector(".back-btn");
  back?.click(); await tick();
  for (const name of ["naftopidil", "cabazitaxel", "denosumab"]) {
    await search(name);
    const row = [...doc.querySelectorAll(".drug-row")].find((r) => r.textContent.toLowerCase().includes(name));
    if (!row) { check(`FALLO-1 ${name}: encontrado en búsqueda`, false); continue; }
    row.click(); await tick(); await tick();
    const h = headings();
    const hasIndic = h.includes("Indicaciones");
    const hasLagunaContra = h.includes("Contraindicaciones y precauciones") && doc.body.textContent.includes("Sin datos en el corpus (LAGUNA).");
    check(`FALLO-1 ${name}: muestra Indicaciones`, hasIndic);
    check(`FALLO-1 ${name}: marca LAGUNA en contraindicaciones`, hasLagunaContra);
    doc.querySelector(".back-btn")?.click(); await tick();
  }

  // Eje por órgano: volver a Inicio (tras la ficha, el botón
  // Atrás devuelve a la vista de búsqueda, no al inicio) y abrir
  // Próstata para contar sus fichas.
  doc.querySelector(".brand")?.click(); await tick(); await tick();
  check("vuelta a Inicio tras las fichas", !!doc.querySelector(".hero"));
  const chip = [...doc.querySelectorAll(".chip")].find((c) => c.textContent.startsWith("Próstata ·"));
  check("chip Próstata presente", !!chip, chip?.textContent || "");
  chip?.click(); await tick(); await tick();
  const organRows = doc.querySelectorAll(".drug-row").length;
  check("vista Próstata lista 53 fichas", organRows === 53, `${organRows} filas`);

  // Sin referencias externas restantes.
  check("sin src/href externos en el HTML", !/src="\/|href="\/|url\(\//.test(html));

  console.log(failures === 0 ? `\nSMOKE OK (${file})` : `\nSMOKE FALLIDO: ${failures} comprobaciones`);
  process.exit(failures === 0 ? 0 : 1);
})();
