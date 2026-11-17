// Construye el HTML autocontenido de UroFármacos a partir de dist/:
// inlina el JS y el CSS del bundle y las imágenes de public/ como data URI.
// El script del bundle va al final del <body> como script CLÁSICO:
// Vite lo emite en el <head> como type="module" (diferido), pero al
// inlinearlo sin type="module" corre antes de que exista #root
// (error React #299); con type="module" jsdom no lo ejecuta.
// OJO: todos los String.replace usan FUNCIÓN de reemplazo: el JS
// minificado contiene secuencias $ ($&, $', $`...) que el string de
// reemplazo interpretaría y corromperían el bundle.
// Uso: node scripts/inline-single-file.cjs [salida]
// Salida por defecto: dist-single/urofarmacos.html
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = process.argv[2] || path.join(root, "dist-single", "urofarmacos.html");

const distHtml = fs.readFileSync(path.join(root, "dist", "index.html"), "utf8");
const jsName = distHtml.match(/src="\/assets\/([^"]+\.js)"/)[1];
const cssName = distHtml.match(/href="\/assets\/([^"]+\.css)"/)[1];
let js = fs.readFileSync(path.join(root, "dist", "assets", jsName), "utf8");
let css = fs.readFileSync(path.join(root, "dist", "assets", cssName), "utf8");

function dataUri(file, mime) {
  const b64 = fs.readFileSync(path.join(root, "public", file)).toString("base64");
  return `data:${mime};base64,${b64}`;
}

const icon512 = dataUri("icon-512.png", "image/png");
const heroBg = dataUri("hero-bg.jpg", "image/jpeg");

// Imágenes dentro del CSS y del JS (las rutas aparecen como literales).
css = css.replace(/url\(\/hero-bg\.jpg\)/g, () => `url(${heroBg})`);
js = js.replace(/\/icon-512\.png/g, () => icon512);

let html = distHtml;
// Favicon -> data URI.
html = html.replace(/href="\/icon-512\.png"/, () => `href="${icon512}"`);
// CSS inlinado.
html = html.replace(
  /<link rel="stylesheet"[^>]*>/,
  () => `<style>${css}</style>`,
);
// JS inlinado como script clásico al final del body.
html = html.replace(/<script type="module"[^>]*><\/script>/, () => "");
html = html.replace(/<\/body>/, () => `<script>${js}</script></body>`);

// Comprobaciones: no debe quedar ninguna referencia externa a assets.
const leftovers = [
  ...html.matchAll(/(?:src|href)="\/[^"]*"/g),
  ...html.matchAll(/url\(\/[^)]*\)/g),
].map((m) => m[0]);
if (leftovers.length > 0) {
  console.error("REFERENCIAS EXTERNAS RESTANTES:", leftovers);
  process.exit(1);
}
if (html.includes("/icon-512.png") || html.includes("/urofarmacos-icon.png") || html.includes("/hero-bg.jpg")) {
  console.error("Quedan rutas de imágenes sin inlinear");
  process.exit(1);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`OK ${out} — ${(fs.statSync(out).size / 1024).toFixed(0)} KB (js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`);
