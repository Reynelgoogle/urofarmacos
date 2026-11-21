// Prepara el proyecto Android (Capacitor) para compilar la APK en el PC
// de Rey. Un solo comando: `npm run android:setup`. Idempotente: se puede
// correr las veces que haga falta; lo que ya está hecho se deja como está.
//
// Pasos:
//   1. Si no existe android/, lo genera con `npx cap add android`.
//   2. Re-aplica el fix de kotlin-stdlib-jdk7/jdk8 en
//      android/app/build.gradle (SIN ESTO FALLA :app:checkDebugDuplicateClasses
//      por kotlin-stdlib duplicado; el `cap sync` no lo borra, pero un
//      `cap add` nuevo sí lo pierde, porque android/ no viaja al repo).
//   3. Regenera los iconos launcher oficiales desde el maestro
//      (el `cap add` pone el robot por defecto de Capacitor).
//   4. Corre `npx cap sync android`.
// Después: `npm run android:apk` compila la APK debug.
//
// Uso en Windows (PC de Rey): `npm run android:setup` desde cmd, PowerShell
// o Git Bash. En Linux/macOS igual. Requiere Node 20+, JDK 21 y
// build-tools 35.0.0 (ver README, sección «Empaquetado»).
const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildGradle = path.join(root, "android", "app", "build.gradle");

const FIX_MARKER = 'exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk7"';
const FIX_BLOCK = `
// Excluye kotlin-stdlib-jdk7/jdk8 viejos: sus clases ya vienen en kotlin-stdlib 2.x
// (los trae kotlinx-coroutines-android:1.6.4) y duplican clases en el APK.
// SIN ESTO FALLA :app:checkDebugDuplicateClasses. Hay que re-aplicarlo tras
// cada \`npx cap add android\` / \`npx cap sync android\` que regenere este archivo,
// porque android/ no viaja al repo.
configurations.all {
    exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk7"
    exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk8"
}
`;

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, shell: process.platform === "win32", ...opts });
  if (r.status !== 0) throw new Error(`falló: ${cmd} ${args.join(" ")} (código ${r.status})`);
}

function applyStdlibFix() {
  if (!fs.existsSync(buildGradle)) {
    console.log("android/app/build.gradle no existe; lo genera el `cap add` primero.");
    return;
  }
  const text = fs.readFileSync(buildGradle, "utf8");
  if (text.includes(FIX_MARKER)) {
    console.log("Fix kotlin-stdlib: ya aplicado, no se toca.");
    return;
  }
  const anchor = "apply plugin: 'com.android.application'";
  const idx = text.indexOf(anchor);
  const next = idx >= 0
    ? text.slice(0, idx + anchor.length) + FIX_BLOCK + text.slice(idx + anchor.length)
    : FIX_BLOCK + text;
  fs.writeFileSync(buildGradle, next);
  console.log("Fix kotlin-stdlib: aplicado en android/app/build.gradle.");
}

function regenerateIcons() {
  const script = path.join(root, "scripts", "make-launcher-icons.py");
  const master = path.join(root, "public", "urofarmacos-icon.png");
  if (!fs.existsSync(script) || !fs.existsSync(master)) {
    console.log("AVISO: no están el script o el icono maestro; se salta la regeneración de iconos.");
    return;
  }
  for (const py of ["python3", "python", "py"]) {
    try {
      execFileSync(py, [script, master], { stdio: "inherit", cwd: root });
      console.log("Iconos launcher: regenerados desde el maestro.");
      return;
    } catch {
      // prueba con el siguiente intérprete
    }
  }
  console.log("AVISO: no se encontró Python (python3/python/py); los iconos quedan como los dejó `cap add` (robot de Capacitor). Instala Python y corre `npm run android:setup` de nuevo, o `python3 scripts/make-launcher-icons.py public/urofarmacos-icon.png` a mano.");
}

function main() {
  if (!fs.existsSync(path.join(root, "android"))) {
    run("npx", ["cap", "add", "android"]);
  } else {
    console.log("android/ ya existe, no se regenera.");
  }
  applyStdlibFix();
  regenerateIcons();
  run("npx", ["cap", "sync", "android"]);
  console.log("\nListo. Ahora compila la APK con: npm run android:apk");
}

main();
