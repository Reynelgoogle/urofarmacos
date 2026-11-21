// Compila la APK debug de UroFármacos: `npm run android:apk`.
//   1. `npm run build` (web)
//   2. `npx cap sync android`
//   3. Gradle `:app:assembleDebug` (gradlew.bat en Windows, ./gradlew en Linux/macOS)
// La APK queda en android/app/build/outputs/apk/debug/app-debug.apk.
// Requiere JDK 21 como Gradle JDK y build-tools 35.0.0 (ver README,
// sección «Empaquetado»). Antes de la primera vez, correr
// `npm run android:setup` (genera android/, aplica el fix de kotlin-stdlib
// y regenera los iconos launcher oficiales).
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

// Gradle necesita un JDK 21. Si JAVA_HOME no está definido, se busca en
// las ubicaciones habituales (el jbr de Android Studio en Windows, ~/jdk-21
// en Linux). Si no se encuentra nada, gradlew dará su propio error y el
// mensaje de abajo dice dónde ponerlo.
function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  const javaBin = isWin ? "java.exe" : "java";
  const candidates = isWin
    ? [
        "C:\\Program Files\\Android\\Android Studio\\jbr",
        "C:\\Program Files\\Java\\jdk-21",
      ]
    : [
        path.join(process.env.HOME || "", "jdk-21"),
        "/usr/lib/jvm/java-21-openjdk-amd64",
        "/usr/lib/jvm/default-java",
      ];
  const found = candidates.find((p) => fs.existsSync(path.join(p, "bin", javaBin)));
  if (found) console.log(`JAVA_HOME no estaba definido; usando ${found}`);
  return found || undefined;
}

function run(cmd, args, cwd = root, env) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd, shell: isWin, env });
  if (r.status !== 0) throw new Error(`falló: ${cmd} ${args.join(" ")} (código ${r.status})`);
}

function main() {
  run("npm", ["run", "build"]);
  run("npx", ["cap", "sync", "android"]);
  const gradlew = isWin ? "gradlew.bat" : "./gradlew";
  const env = { ...process.env, JAVA_HOME: javaHome() };
  const args = [":app:assembleDebug"];
  // En este entorno (VM de TOKI) el wrapper y las dependencias están
  // pre-cacheados en ~/.gradle-urofarmacos y la JVM no puede descargar
  // (proxy con interceptación TLS): se compila offline con ese GRADLE_USER_HOME.
  // En el PC de Rey ese directorio no existe y se compila normal, con
  // descarga si hace falta.
  const home = process.env.HOME || "";
  const cachedHome = path.join(home, ".gradle-urofarmacos");
  if (!isWin && fs.existsSync(cachedHome)) {
    env.GRADLE_USER_HOME = process.env.GRADLE_USER_HOME || cachedHome;
    env.ANDROID_HOME = process.env.ANDROID_HOME || path.join(home, "android-sdk");
    env._JAVA_OPTIONS = "-Djava.net.preferIPv4Stack=true";
    args.push("--offline", "-x", "lint");
    console.log("Entorno con caché local detectado; compilando offline.");
  }
  try {
    run(gradlew, args, path.join(root, "android"), env);
  } catch (e) {
    console.error("\nSi el fallo es por JAVA_HOME: define el JDK 21 (Android Studio: File > Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK, o variable de entorno JAVA_HOME apuntando a tu JDK 21).");
    throw e;
  }
  console.log("\nAPK lista: android/app/build/outputs/apk/debug/app-debug.apk");
}

main();
