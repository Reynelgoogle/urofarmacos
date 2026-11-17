const fs = require("fs");
// Exportar los datos como hizo el verificador
// datos ya compilados con tsc a /tmp/drugs-out/drugs.js
const { drugs } = require("/tmp/drugs-out/drugs.js");
// Extraer normalize + GAP_ALIASES + isGap VERBATIM de App.tsx
const src = fs.readFileSync("src/App.tsx", "utf8");
function extract(re, name) {
  const m = src.match(re);
  if (!m) { console.error("NO ENCONTRADO:", name); process.exit(2); }
  return m[0];
}
let code =
  extract(/function normalize[\s\S]*?\n}/, "normalize") + "\n" +
  extract(/const GAP_ALIASES[\s\S]*?\n};/, "GAP_ALIASES") + "\n" +
  extract(/function isGap[\s\S]*?\n}/, "isGap");
code = code
  .replace("function normalize(s: string): string", "function normalize(s)")
  .replace("function isGap(drug: Drug, ...keys: string[]): boolean", "function isGap(drug, ...keys)")
  .replace("(drug as Drug & { gaps?: string[] }).gaps", "drug.gaps")
  .replace("const GAP_ALIASES: Record<string, string> =", "const GAP_ALIASES =");
eval(code);

const SECTIONS = [
  ["mechanism", "mecanismo", "Mecanismo de acción", (d) => d.mechanism],
  ["indications", "indicaciones", "Indicaciones", (d) => d.indications],
  ["dose", "dosis", "Dosis habitual", (d) => d.dose],
  ["adverse", "efectos adversos", "Efectos adversos", (d) => d.adverse],
  ["contraindications", "contraindicaciones", "Contraindicaciones", (d) => d.contraindications],
  ["interactions", "interacciones", "Interacciones", (d) => d.interactions],
  ["related", "farmacos relacionados", "Fármacos relacionados", (d) => d.relatedDrugs],
];
let fails = 0, checks = 0;
for (const d of drugs) {
  const gaps = new Set((d.gaps || []).map((g) => normalize(g)));
  for (const [kEn, kEs, gapTitle, getField] of SECTIONS) {
    checks++;
    const got = isGap(d, kEn, kEs);
    const want = gaps.has(normalize(gapTitle));
    if (got !== want) { console.log(`FAIL ${d.name} [${gapTitle}]: isGap=${got} want=${want}`); fails++; }
    // El componente además muestra LAGUNA si el campo está vacío: eso no es isGap, se verifica aparte
    const field = getField(d);
    const empty = Array.isArray(field) ? field.length === 0 : !String(field || "").trim();
    if (empty && !want) { console.log(`NOTA ${d.name} [${gapTitle}]: campo vacío sin gap (lo cubre el || !campo)`); }
  }
}
// Caso concreto del fallo: las 18 fichas con gap Contraindicaciones deben MOSTRAR indicaciones
const affected = ["Naftopidil","Imidafenacina","Cabazitaxel","Vinflunina","Ifosfamida","Everolimus","Sorafenib","Avelumab","Lenvatinib","Belzutifan","Rucaparib","Ciproterona (acetato de ciproterona)","Ácido zoledrónico","Denosumab","Tiazidas","Tiopronina","Ondansetrón","D-penicilamina"];
for (const name of affected) {
  const d = drugs.find((x) => x.name === name);
  if (!d) { console.log("FAIL: no encontrada", name); fails++; continue; }
  checks++;
  if (isGap(d, "indications", "indicaciones")) { console.log(`FAIL ${name}: indicaciones marcadas en laguna`); fails++; }
  if (d.indications.length === 0) { console.log(`FAIL ${name}: sin indicaciones`); fails++; }
}
// Vinflunina dosis y Ondansetrón relacionados
const vin = drugs.find((x) => x.name === "Vinflunina");
checks++; if (!isGap(vin, "dose", "dosis")) { console.log("FAIL Vinflunina dosis"); fails++; }
const ond = drugs.find((x) => x.name === "Ondansetrón");
checks++; if (!isGap(ond, "related", "farmacos relacionados")) { console.log("FAIL Ondansetrón relacionados"); fails++; }
console.log(`\nisGap: ${checks - fails}/${checks} comprobaciones en verde. ${fails ? fails + " FALLOS" : "TODO EN VERDE."}`);
process.exit(fails ? 1 : 0);
