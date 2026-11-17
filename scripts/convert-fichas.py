#!/usr/bin/env python3
"""UroFármacos FASE 2 — conversor determinista de fichas a src/data/drugs.ts.

Lee los 9 archivos de familia de ~/workspace/urofarmacos/documento/ (documento
firmado, 103 fichas auditadas, Gauntlet ronda 4, 0 fallos) y regenera
src/data/drugs.ts del mockup Vite React+TS.

Reglas (encargo de fase 2, aplicadas literalmente):
  - Nada se inventa: lo que no está en el corpus queda vacío y en `gaps`.
  - Campo LAGUNA (el valor empieza por "LAGUNA") -> campo vacío + gap.
  - Se eliminan solo los corchetes de cita [...]; "[mg]" (unidad, no cita) se conserva.
  - mechanism/dose: párrafo completo; indications/adverse/contraindications/
    interactions: frases (divisor con guardas: p. ej., vs., EE. UU., v.o.,
    b.i.d./t.i.d./q.d./q.i.d., máx., iniciales "E. coli", decimales).
  - organs/conditions/relatedDrugs: división por comas y punto y coma,
    ignorando las comas dentro de paréntesis y las comas decimales (2,8-...);
    se quitan los paréntesis. Órganos: subconjunto de los 7 del mockup.
  - relatedDrugs: slugify; se resuelve también por el nombre base de la ficha
    (nombre sin paréntesis: "Trospio" -> ficha "Trospio (cloruro de trospio)");
    lo que no tiene ficha se descarta y se reporta.
  - source: etiquetas cortas condensadas de la línea "Fuentes:", sin duplicados.
  - Campos extra dentro de una ficha: etiqueta con "Dosis"/"Uso" -> dose;
    con "Interacciones" -> interactions; con "Contraindicaciones" ->
    contraindications; cualquier otro -> indications con prefijo "Etiqueta: ".
  - `families`: se conservan las 8 existentes (mismos ids, nombres, shorts,
    descripciones, iconos y accents) con `drugs` = nombres del documento;
    se añade la 9.ª ("otros").
  - `conditions`: lista completa y distinta de patologías del documento.

Uso:  python3 scripts/convert-fichas.py
Re-ejecutable: regenera drugs.ts y verifica sus propios conteos. No toca el
corpus (~/workspace/urofarmacos/corpus/) ni el documento. No ejecuta builds.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

DOC_DIR = Path.home() / "workspace/urofarmacos/documento"
MOCKUP_DIR = Path.home() / "workspace/urofarmacos-mockup"
DRUGS_TS = MOCKUP_DIR / "src/data/drugs.ts"
MASTER_INDEX = DOC_DIR / "DOCUMENTO-FICHAS.md"

FAMILY_FILES = [
    ("familia-01-alfabloqueadores.md", "alfabloqueadores"),
    ("familia-02-inhibidores-5ari.md", "inhibidores-5ari"),
    ("familia-03-vejiga-hiperactiva.md", "vejiga-hiperactiva"),
    ("familia-04-salud-sexual.md", "salud-sexual"),
    ("familia-05-antibioticos.md", "antibioticos"),
    ("familia-06-quimioterapia.md", "quimioterapia"),
    ("familia-07-dirigida-inmuno.md", "dirigida-inmuno"),
    ("familia-08-hormonoterapia.md", "hormonoterapia"),
    ("familia-09-otros.md", "otros"),
]
EXPECTED_COUNTS = {
    "alfabloqueadores": 6, "inhibidores-5ari": 2, "vejiga-hiperactiva": 14,
    "salud-sexual": 9, "antibioticos": 17, "quimioterapia": 10,
    "dirigida-inmuno": 19, "hormonoterapia": 13, "otros": 13,
}
ORGANS7 = ["Riñón", "Uréter", "Vejiga", "Próstata", "Uretra", "Testículo", "Pene"]

EAU_GUIDES = {
    "Male-LUTS": "Male LUTS", "Female-LUTS": "Female LUTS",
    "Urological-Infections": "Urological Infections",
    "Sexual-Reproductive-Health": "Sexual and Reproductive Health",
    "Prostate-Cancer": "Prostate Cancer", "NMIBC": "NMIBC", "MIBC": "MIBC",
    "Renal-Cell-Carcinoma": "Renal Cell Carcinoma",
    "Urolithiasis": "Urolithiasis", "Neuro-Urology": "Neuro-Urology",
    "UTUC": "UTUC", "Testicular-Cancer": "Testicular Cancer",
    "Penile-Cancer": "Penile Cancer", "Thromboprophylaxis": "Thromboprophylaxis",
}

NEW_FAMILY_9 = {
    "id": "otros",
    "name": "Otros fármacos de uso urológico",
    "short": "Otros",
    "description": ("Fármacos con cobertura en el corpus que no encajan en las 8 "
                    "familias: litiasis, soporte oncológico, contraste y anestésicos."),
    "icon": "🧩",
    "accent": "#64748b",
}

# Campos de la plantilla; el campo de dosis de Cefalosporinas lleva variante.
DOSE_FIELDS = ("Dosis habitual", "Dosis habitual (por agente principal)")
CORE_FIELDS = {
    "Familia", "Nombres comerciales", "Mecanismo de acción", "Indicaciones",
    "Efectos adversos", "Contraindicaciones", "Interacciones",
    "Órganos", "Patologías", "Fármacos relacionados", "Fuentes", "LAGUNAS",
} | set(DOSE_FIELDS)
SKIP_SECTIONS = {"LAGUNAS de esta familia", "Discrepancias detectadas"}
GAP_LABEL = {
    "Nombres comerciales": "Nombres comerciales",
    "Mecanismo de acción": "Mecanismo de acción",
    "Indicaciones": "Indicaciones",
    "Dosis habitual": "Dosis habitual",
    "Dosis habitual (por agente principal)": "Dosis habitual",
    "Efectos adversos": "Efectos adversos",
    "Contraindicaciones": "Contraindicaciones",
    "Interacciones": "Interacciones",
    "Órganos": "Órganos",
    "Patologías": "Patologías",
    "Fármacos relacionados": "Fármacos relacionados",
}

# ---------------------------------------------------------------- citas
CIT_PATTERNS = [
    r"EAU-2025-[A-Za-z-]+(?:, [^]]*)?",
    r"UT: [^]]+",
    r"Campbell ch\d+[^]]*",
    r"Campbell-test[^]]*",
    r"UroCampus: [^]]+",
    r"HHA: [^]]+",
]
CIT_RE = re.compile(r"\[(" + "|".join(CIT_PATTERNS) + r")\]")


def strip_citations(text: str) -> str:
    """Elimina solo los corchetes de cita; "[mg]" (unidad) se conserva."""
    return CIT_RE.sub("", text)


BOLD_REMOVED = [0]


def clean_text(text: str) -> str:
    """Quita citas, el separador '---' final de ficha y colapsa espacios.
    También quita los marcadores de negrita markdown (**) — el texto se
    conserva íntegro; en drugs.ts se mostraría como asteriscos literales."""
    text = re.sub(r"\n\s*---\s*$", "", text)
    text = strip_citations(text)
    BOLD_REMOVED[0] += text.count("**")
    text = text.replace("**", "")
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)  # "texto ." -> "texto."
    text = re.sub(r"\.{2,}", ".", text)  # "v.o.." -> "v.o." (abreviatura + cita + punto)
    return " ".join(text.split()).strip()


def is_laguna(value: str) -> bool:
    return re.match(r"LAGUNA\b", value.strip()) is not None


def clean_name(heading: str) -> str:
    name = heading.strip()
    name = re.sub(r"^ADICIÓN(?: \d+)? — ", "", name)
    name = re.sub(r" — ADICIÓN$", "", name)
    name = re.sub(r" \(ficha de grupo\)$", "", name)
    return name.strip()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def dedupe(items):
    seen, out = set(), []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


# ---------------------------------------------------------------- listas
def strip_parens(text: str):
    """Quita el contenido entre paréntesis (con anidamiento). Devuelve
    (texto, equilibrado)."""
    out, depth, balanced = [], 0, True
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth > 0:
                depth -= 1
            else:
                balanced = False
                out.append(ch)
        elif depth == 0:
            out.append(ch)
    if depth != 0:
        balanced = False
    return "".join(out), balanced


def split_list(text: str):
    """Divide por comas y punto y coma a profundidad de paréntesis 0.
    No parte la coma decimal (dígito, dígito: 2,8-dihidroxiadenina).
    Devuelve [(segmento, separador)] con separador None para el primero."""
    items, buf, depth, seps = [], [], 0, []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")":
            depth = max(0, depth - 1)
            buf.append(ch)
        elif depth == 0 and ch in ",;":
            if (ch == "," and i > 0 and i + 1 < len(text)
                    and text[i - 1].isdigit() and text[i + 1].isdigit()):
                buf.append(ch)  # coma decimal, no es separador
            else:
                items.append("".join(buf))
                seps.append(ch)
                buf = []
        else:
            buf.append(ch)
        i += 1
    items.append("".join(buf))
    return list(zip(items, [None] + seps))


# ---------------------------------------------------------------- frases
ABBREV = {
    "p. ej.": "p\x01ej\x01",
    "vs.": "vs\x01",
    "EE. UU.": "EE\x01 UU\x01",
    "v.o.": "v\x01o\x01",
    "i.v.": "i\x01v\x01",
    "s.c.": "s\x01c\x01",
    "i.m.": "i\x01m\x01",
    "q.d.": "q\x01d\x01",
    "b.i.d.": "b\x01i\x01d\x01",
    "t.i.d.": "t\x01i\x01d\x01",
    "q.i.d.": "q\x01i\x01d\x01",
    "máx.": "máx\x01",
    "E. coli": "E\x01 coli",
    "C. trachomatis": "C\x01 trachomatis",
    "N.º": "Nº",
    "Dr.": "Dr",
    "Dra.": "Dra",
}
ABBREV_WORDS = {"ej", "etc", "vs", "dr", "dra", "sr", "sra", "srta", "cap",
                "fig", "vol", "ed", "no", "nos", "aprox", "máx", "pág", "pp", "art"}


def split_sentences(text: str):
    """Divide un párrafo en frases. No parte tras abreviaturas protegidas,
    tras una inicial ("E. coli"), ni dentro de un número decimal (5.2.1)."""
    s = text
    for k in sorted(ABBREV, key=len, reverse=True):
        s = s.replace(k, ABBREV[k])
    parts, start = [], 0
    for m in re.finditer(r"[.!?…]+", s):
        j = m.end()
        while j < len(s) and s[j] == " ":
            j += 1
        if j >= len(s):
            continue  # puntuación final del párrafo, no es frontera
        nxt = s[j]
        if not (nxt.isupper() or nxt.isdigit() or nxt in "«\"“("):
            continue
        k = m.start() - 1
        while k >= 0 and (s[k].isalnum() or s[k] in "ºª"):
            k -= 1
        word = s[k + 1:m.start()].lower()
        if word in ABBREV_WORDS:
            continue
        if len(word) == 1 and word.isalpha():
            continue  # inicial ("E."), p. ej. "E. coli"
        if (m.start() > 0 and s[m.start() - 1].isdigit()
                and j < len(s) and s[j].isdigit()):
            continue  # número con punto decimal (5.2.1)
        parts.append(s[start:m.end()].strip())
        start = j
    parts.append(s[start:].strip())
    out = []
    for p in parts:
        p = p.replace("\x01", ".")
        p = p.strip().strip(".;:…").strip()
        p = " ".join(p.split())
        if p:
            out.append(p)
    return out


# ---------------------------------------------------------------- fuentes
def condense_source(fuentes: str, ficha: str, anomalies: list) -> str:
    labels = []
    for tok in re.findall(r"\[([^\]]+)\]", fuentes):
        tok = tok.strip()
        label = None
        m = re.match(r"EAU-2025-([A-Za-z-]+)", tok)
        if m:
            slug = m.group(1)
            if slug not in EAU_GUIDES:
                anomalies.append((ficha, "Fuentes", "guía EAU sin mapeo", slug))
            label = "EAU " + EAU_GUIDES.get(slug, slug.replace("-", " ")) + " 2025"
        elif tok.startswith("UT:"):
            label = "Urology-Textbook"
        elif tok.startswith("Campbell ch"):
            label = "Campbell-Walsh-Wein 13.ª ed."
        elif tok.startswith("Campbell-test"):
            label = "Campbell Review 12.ª ed. (contraste)"
        elif tok.startswith("UroCampus:"):
            label = "UroCampus"
        elif tok.startswith("HHA:"):
            label = "Protocolos HHA 2026"
        else:
            anomalies.append((ficha, "Fuentes", "cita sin mapeo", tok[:80]))
        if label and label not in labels:
            labels.append(label)
    rest = re.sub(r"\[[^\]]*\]", "", fuentes)
    rest = re.sub(r"[\s;,.]+", "", rest)
    if rest:
        anomalies.append((ficha, "Fuentes",
                          "texto fuera de corchetes (no es fuente, se descarta)",
                          rest[:100]))
    return " · ".join(labels)

# ---------------------------------------------------------------- parseo
def parse_family_file(path: Path):
    """Devuelve [(encabezado_crudo, {campo: valor})] de las fichas del archivo."""
    text = path.read_text(encoding="utf-8")
    parts = re.split(r"^## (.+)$", text, flags=re.M)
    fichas = []
    for i in range(1, len(parts), 2):
        heading, body = parts[i].strip(), parts[i + 1]
        if heading in SKIP_SECTIONS:
            continue
        fields = {}
        for m in re.finditer(r"^- \*\*([^*]+):\*\* (.*?)(?=\n- \*\*|\n## |\Z)",
                             body, re.S | re.M):
            fields[m.group(1)] = m.group(2).strip()
        fichas.append((heading, fields))
    return fichas


def parse_organs(value: str, ficha: str, anomalies: list):
    organs = []
    for seg, _sep in split_list(clean_text(value)):
        s, balanced = strip_parens(seg)
        if not balanced:
            anomalies.append((ficha, "Órganos", "paréntesis desequilibrado", seg[:100]))
        s = " ".join(s.split()).strip().rstrip(".").strip()
        if not s:
            continue
        if s in ORGANS7:
            organs.append(s)
            continue
        if ". " in s:  # nota tras el órgano: "Testículo. No útil en próstata"
            head = s.split(". ", 1)[0].strip()
            if head in ORGANS7:
                organs.append(head)
                anomalies.append((ficha, "Órganos", "nota tras órgano (se descarta)", s))
                continue
        anomalies.append((ficha, "Órganos", "valor fuera de los 7 órganos (se descarta)", s))
    return dedupe(organs)


def parse_conditions(value: str, ficha: str, anomalies: list):
    items = []
    for seg, sep in split_list(clean_text(value)):
        s, balanced = strip_parens(seg)
        if not balanced:
            anomalies.append((ficha, "Patologías", "paréntesis desequilibrado", seg[:100]))
        s = " ".join(s.split()).strip().rstrip(".").strip()
        if not s:
            continue
        if sep == "," and s[0].islower() and items:
            # Continuación de la condición anterior ("..., con mutación BRCA1/2 ...").
            items[-1] = items[-1] + ", " + s
            anomalies.append((ficha, "Patologías", "continuación unida a la anterior", s))
            continue
        if s[0].islower():
            s = s[0].upper() + s[1:]
        items.append(s)
    return dedupe(items)


def parse_related(value: str, ficha: str, id_map: dict, base_map: dict,
                  anomalies: list):
    out = []
    for seg, _sep in split_list(clean_text(value)):
        s, _bal = strip_parens(seg)
        s = " ".join(s.split()).strip().rstrip(".").strip()
        if not s:
            continue
        slug = slugify(s)
        if slug in id_map:
            out.append(id_map[slug])
        elif slug in base_map:
            out.append(base_map[slug])
            anomalies.append((ficha, "Fármacos relacionados",
                              "resuelto por nombre base (paréntesis del nombre de ficha)", s))
        else:
            anomalies.append((ficha, "Fármacos relacionados", "sin ficha (se descarta)", s))
    return dedupe(out)


def build_drug(heading: str, fields: dict, family_id: str,
               id_map: dict, base_map: dict, anomalies: list, extra_routing: list):
    name = clean_name(heading)
    drug_id = slugify(name)
    gaps = []

    def laguna_field(label):
        return label in fields and is_laguna(fields[label])

    # --- Nombres comerciales
    if laguna_field("Nombres comerciales"):
        commercial, gaps = "", gaps + ["Nombres comerciales"]
    else:
        commercial = clean_text(fields.get("Nombres comerciales", ""))

    # --- Mecanismo de acción (párrafo completo)
    if laguna_field("Mecanismo de acción"):
        mechanism, gaps = "", gaps + ["Mecanismo de acción"]
    else:
        mechanism = clean_text(fields.get("Mecanismo de acción", ""))

    # --- Dosis habitual (párrafo completo; variante por agente principal)
    dose_label = next((f for f in DOSE_FIELDS if f in fields), "Dosis habitual")
    if laguna_field(dose_label):
        dose, gaps = "", gaps + ["Dosis habitual"]
    else:
        dose = clean_text(fields.get(dose_label, ""))

    # --- Arrays de frases
    arrays = {}
    for label, key in (("Indicaciones", "indications"),
                       ("Efectos adversos", "adverse"),
                       ("Contraindicaciones", "contraindications"),
                       ("Interacciones", "interactions")):
        if laguna_field(label):
            arrays[key] = []
            gaps.append(GAP_LABEL[label])
        else:
            arrays[key] = split_sentences(clean_text(fields.get(label, "")))
            if not arrays[key]:
                anomalies.append((name, label, "campo sin frases tras la división", ""))

    # --- Órganos / Patologías / Relacionados
    if laguna_field("Órganos"):
        organs, gaps = [], gaps + ["Órganos"]
    else:
        organs = parse_organs(fields.get("Órganos", ""), name, anomalies)
    if laguna_field("Patologías"):
        conditions, gaps = [], gaps + ["Patologías"]
    else:
        conditions = parse_conditions(fields.get("Patologías", ""), name, anomalies)
    if laguna_field("Fármacos relacionados"):
        related, gaps = [], gaps + ["Fármacos relacionados"]
    else:
        related = parse_related(fields.get("Fármacos relacionados", ""), name,
                                id_map, base_map, anomalies)
    if drug_id in related:
        related = [r for r in related if r != drug_id]
        anomalies.append((name, "Fármacos relacionados", "autorreferencia (se descarta)", name))

    source = condense_source(fields.get("Fuentes", ""), name, anomalies)

    # --- Campos extra dentro de la ficha
    for label, value in fields.items():
        if label in CORE_FIELDS:
            continue
        extra_routing.append((name, label, value[:120]))
        if label == "Justificación de la adición":
            # Metadato de compilación (por qué se añadió la ficha), no
            # contenido clínico: queda en el documento firmado, no entra
            # en la app (no debe aparecer como viñeta de Indicaciones).
            continue
        if is_laguna(value):
            anomalies.append((name, label, "campo extra LAGUNA (no se añade)", ""))
            continue
        text = clean_text(value)
        if "Dosis" in label or "Uso" in label:
            dose = (dose + " " + text).strip() if dose else text
        elif "Interacciones" in label:
            arrays["interactions"].extend(split_sentences(text))
        elif "Contraindicaciones" in label:
            arrays["contraindications"].extend(split_sentences(text))
        else:
            arrays["indications"].append(f"{label}: {text}")

    drug = {
        "id": drug_id,
        "name": name,
        "familyId": family_id,
        "commercial": commercial,
        "mechanism": mechanism,
        "indications": arrays["indications"],
        "dose": dose,
        "adverse": arrays["adverse"],
        "contraindications": arrays["contraindications"],
        "interactions": arrays["interactions"],
        "relatedDrugs": related,
        "conditions": conditions,
        "organs": organs,
        "source": source,
        "full": True,
    }
    if gaps:
        drug["gaps"] = gaps
    return drug


# ---------------------------------------------------------------- TS
def ts_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def ts_array(items, indent: int) -> str:
    """Array TS estilo del archivo actual: [] si vacío, una línea si cabe,
    si no un elemento por línea."""
    if not items:
        return "[]"
    pad = " " * indent
    inline = "[" + ", ".join(ts_str(i) for i in items) + "]"
    if len(inline) + indent <= 100:
        return inline
    lines = ["["] + [pad + "  " + ts_str(i) + "," for i in items] + [pad + "]"]
    return "\n".join(lines)


def split_top_level_objects(text: str):
    """Divide un bloque [...] en sus objetos {...} de nivel superior,
    respetando strings entrecomillados."""
    objs, depth, start, in_str, esc = [], 0, None, False, False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                objs.append(text[start:i + 1])
                start = None
    return objs


def extract_family_metadata(current: str):
    """Extrae los 8 objetos de familia del drugs.ts actual (texto íntegro)."""
    m = re.search(r"export const families: Family\[\] = \[", current)
    start = m.end()
    depth, i = 1, start
    while i < len(current):
        ch = current[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                break
        i += 1
    inner = current[start:i]
    objs = split_top_level_objects(inner)
    metas = {}
    for obj in objs:
        fid = re.search(r'\bid: "([^"]+)"', obj).group(1)
        metas[fid] = obj
    return metas


def replace_drugs_array(obj_text: str, names) -> str:
    arr = ts_array(names, 4)
    new, n = re.subn(r"drugs: \[[^\]]*\]", "drugs: " + arr, obj_text, count=1, flags=re.S)
    assert n == 1, "no se encontró el array drugs en la familia"
    return new


def render_family_9(names) -> str:
    f = NEW_FAMILY_9
    return (
        "  {\n"
        f"    id: {ts_str(f['id'])},\n"
        f"    name: {ts_str(f['name'])},\n"
        f"    short: {ts_str(f['short'])},\n"
        "    description:\n"
        f"      {ts_str(f['description'])},\n"
        f"    icon: {ts_str(f['icon'])},\n"
        f"    accent: {ts_str(f['accent'])},\n"
        f"    drugs: {ts_array(names, 4)},\n"
        "  },"
    )


def render_drug(d: dict) -> str:
    lines = [
        "  {",
        f"    id: {ts_str(d['id'])},",
        f"    name: {ts_str(d['name'])},",
        f"    familyId: {ts_str(d['familyId'])},",
        f"    commercial: {ts_str(d['commercial'])},",
        f"    mechanism: {ts_str(d['mechanism'])},",
        f"    indications: {ts_array(d['indications'], 4)},",
        f"    dose: {ts_str(d['dose'])},",
        f"    adverse: {ts_array(d['adverse'], 4)},",
        f"    contraindications: {ts_array(d['contraindications'], 4)},",
        f"    interactions: {ts_array(d['interactions'], 4)},",
        f"    relatedDrugs: {ts_array(d['relatedDrugs'], 4)},",
        f"    conditions: {ts_array(d['conditions'], 4)},",
        f"    organs: {ts_array(d['organs'], 4)},",
        f"    source: {ts_str(d['source'])},",
        "    full: true,",
    ]
    if d.get("gaps"):
        lines.append(f"    gaps: {ts_array(d['gaps'], 4)},")
    lines.append("  },")
    return "\n".join(lines)


HEADER = """// UroFármacos — datos del mockup (fase 2: 103 fichas auditadas y firmadas).
// Generado por scripts/convert-fichas.py a partir de los 9 archivos de familia
// de ~/workspace/urofarmacos/documento/ (documento firmado,
// DOCUMENTO-FICHAS.md; Gauntlet ronda 4, 0 fallos). No editar a mano:
// regenerar con el conversor. Cada dato lleva su cita en el documento;
// aquí solo se conserva la etiqueta de fuente (campo source). Los campos
// marcados LAGUNA en el documento quedan vacíos y la sección se lista en
// gaps. Las dosis son orientativas: verificar siempre con la ficha
// técnica vigente.
"""

# ---------------------------------------------------------------- verificación
def extract_field_string(obj: str, field: str):
    m = re.search(re.escape(field) + r': (")', obj)
    if not m:
        return None
    i = m.end() - 1
    j, esc = i + 1, False
    while j < len(obj):
        ch = obj[j]
        if esc:
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == '"':
            break
        j += 1
    return json.loads(obj[i:j + 1])


def extract_field_array(obj: str, field: str):
    m = re.search(re.escape(field) + r": \[", obj)
    if not m:
        return None
    start = m.end() - 1
    depth, i, in_str, esc = 0, start, False, False
    while i < len(obj):
        ch = obj[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "[":
                depth += 1
            elif ch == "]":
                depth -= 1
                if depth == 0:
                    # Los arrays TS llevan coma final; JSON no la admite.
                    return json.loads(re.sub(r",\s*]", "]", obj[start:i + 1]))
        i += 1
    return None


def verify_model(drugs, families_names, all_conditions, failures, notes):
    from collections import Counter
    total = len(drugs)
    if total != 103:
        failures.append(f"total de fichas: {total} (esperadas 103)")
    counts = Counter(d["familyId"] for d in drugs)
    for fid, exp in EXPECTED_COUNTS.items():
        if counts.get(fid, 0) != exp:
            failures.append(f"familia {fid}: {counts.get(fid, 0)} (esperadas {exp})")
    ids = [d["id"] for d in drugs]
    if len(set(ids)) != len(ids):
        failures.append("ids duplicados: " +
                        str([k for k, v in Counter(ids).items() if v > 1]))
    idset = set(ids)
    for d in drugs:
        for r in d["relatedDrugs"]:
            if r not in idset:
                failures.append(f"{d['name']}: relatedDrugs apunta a id inexistente {r}")
        for o in d["organs"]:
            if o not in ORGANS7:
                failures.append(f"{d['name']}: órgano fuera de los 7: {o}")
        for c in d["conditions"]:
            if c not in all_conditions:
                failures.append(f"{d['name']}: patología fuera de la lista global: {c}")
        if not d["mechanism"]:
            if "Mecanismo de acción" not in d.get("gaps", []):
                failures.append(f"{d['name']}: mechanism vacío sin LAGUNA")
        if not d["dose"]:
            if "Dosis habitual" not in d.get("gaps", []):
                failures.append(f"{d['name']}: dose vacío sin LAGUNA")
        if d["id"] in d["relatedDrugs"]:
            failures.append(f"{d['name']}: autorreferencia en relatedDrugs")
        for key in ("indications", "adverse", "contraindications", "interactions"):
            if not d[key]:
                gap_needed = {"indications": "Indicaciones", "adverse": "Efectos adversos",
                              "contraindications": "Contraindicaciones",
                              "interactions": "Interacciones"}[key]
                if gap_needed not in d.get("gaps", []):
                    failures.append(f"{d['name']}: {key} vacío sin LAGUNA")
            for item in d[key]:
                if item and item[0].islower():
                    notes.append(f"{d['name']}: ítem de {key} empieza en minúscula: {item[:60]}")
    for fid, names in families_names.items():
        fam_drugs = [d["name"] for d in drugs if d["familyId"] == fid]
        if fam_drugs != names:
            failures.append(f"familia {fid}: drugs no coincide con el documento")
    if len(all_conditions) != len(set(all_conditions)):
        failures.append("patologías globales duplicadas")
    unused = [c for c in all_conditions
              if not any(c in d["conditions"] for d in drugs)]
    if unused:
        failures.append(f"patologías globales sin uso: {unused}")
    # Índice maestro: multiset idéntico de encabezados crudos
    idx_text = MASTER_INDEX.read_text(encoding="utf-8")
    idx_names = []
    for m in re.finditer(r"^### Familia \d+ — .+ \(\d+ fichas\)\n((?:- .+\n)+)",
                         idx_text, re.M):
        idx_names.extend(re.findall(r"^- (.+)$", m.group(1), re.M))
    raw_headings = [h for h, _ in RAW_HEADINGS]
    if sorted(idx_names) != sorted(raw_headings):
        failures.append("índice maestro no coincide con los encabezados: "
                        f"solo índice={sorted(set(idx_names) - set(raw_headings))} "
                        f"solo fichas={sorted(set(raw_headings) - set(idx_names))}")
    return counts


def verify_generated_file(path: Path, failures):
    text = path.read_text(encoding="utf-8")
    m = re.search(r"export const drugs: Drug\[\] = \[", text)
    start = m.end()
    depth, i = 1, start
    while i < len(text):
        ch = text[i]
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                break
        i += 1
    inner = text[start:i]
    objs = split_top_level_objects(inner)
    if len(objs) != 103:
        failures.append(f"archivo generado: {len(objs)} fichas (esperadas 103)")
        return
    ids, counts, gaps_counter = [], {}, {}
    commercial_empty = 0
    from collections import Counter
    for obj in objs:
        did = extract_field_string(obj, "id")
        fid = extract_field_string(obj, "familyId")
        ids.append(did)
        counts[fid] = counts.get(fid, 0) + 1
        if extract_field_string(obj, "commercial") == "":
            commercial_empty += 1
        for g in extract_field_array(obj, "gaps") or []:
            gaps_counter[g] = gaps_counter.get(g, 0) + 1
        for r in extract_field_array(obj, "relatedDrugs") or []:
            pass  # se comprueba abajo con el conjunto completo de ids
    idset = set(ids)
    if len(idset) != len(ids):
        failures.append("archivo generado: ids duplicados")
    for obj in objs:
        for r in extract_field_array(obj, "relatedDrugs") or []:
            if r not in idset:
                failures.append(f"archivo generado: relatedDrugs huérfano {r}")
        for o in extract_field_array(obj, "organs") or []:
            if o not in ORGANS7:
                failures.append(f"archivo generado: órgano inválido {o}")
    for fid, exp in EXPECTED_COUNTS.items():
        if counts.get(fid, 0) != exp:
            failures.append(f"archivo generado: familia {fid}={counts.get(fid, 0)} (esperadas {exp})")
    # Sin corchetes de cita en la sección de fichas ([mg] sí se conserva)
    leftover = CIT_RE.findall(inner)
    if leftover:
        failures.append(f"archivo generado: quedan {len(leftover)} citas [...] sin eliminar")
    # Sin espacios dobles dentro de los valores string del archivo generado.
    in_str, esc, buf = False, False, []
    for ch in inner:
        if in_str:
            if esc:
                esc = False
                buf.append(ch)
            elif ch == "\\":
                esc = True
                buf.append(ch)
            elif ch == '"':
                in_str = False
                if "  " in "".join(buf):
                    failures.append("archivo generado: espacios dobles dentro de un string")
                    break
                buf = []
            else:
                buf.append(ch)
        elif ch == '"':
            in_str = True
            buf = []
    return {"commercial_empty": commercial_empty, "gaps": gaps_counter}


# ---------------------------------------------------------------- main
RAW_HEADINGS = []


def main():
    global RAW_HEADINGS
    anomalies, extra_routing = [], []
    parsed = []  # (family_id, heading, fields)
    for fname, fid in FAMILY_FILES:
        for heading, fields in parse_family_file(DOC_DIR / fname):
            parsed.append((fid, heading, fields))
    RAW_HEADINGS = [(h, f) for _fid, h, f in parsed]

    # Mapas de ids (slug completo y nombre base sin paréntesis)
    id_map, base_map, seen_slug = {}, {}, {}
    for _fid, heading, _fields in parsed:
        name = clean_name(heading)
        slug, base = slugify(name), slugify(strip_parens(name)[0])
        if slug in seen_slug and seen_slug[slug] != name:
            anomalies.append((name, "id", "colisión de slug completo", slug))
        seen_slug[slug] = name
        id_map[slug] = slug
        if base in base_map and base_map[base] != slug:
            anomalies.append((name, "id", "colisión de slug base", base))
        base_map.setdefault(base, slug)

    drugs, families_names = [], {}
    for fid, heading, fields in parsed:
        drugs.append(build_drug(heading, fields, fid, id_map, base_map,
                                anomalies, extra_routing))
        families_names.setdefault(fid, []).append(clean_name(heading))

    all_conditions = sorted({c for d in drugs for c in d["conditions"]},
                            key=lambda s: s.lower())

    # --- Emitir drugs.ts preservando tipos, familias y helpers actuales
    current = DRUGS_TS.read_text(encoding="utf-8")
    family_type = re.search(r"export type Family = \{.*?\n\};", current, re.S).group(0)
    drug_type = re.search(r"export type Drug = \{.*?\n\};", current, re.S).group(0)
    if "gaps?:" not in drug_type:  # idempotente: no duplicar en re-ejecuciones
        drug_type = drug_type.replace(
            "  full: boolean; // true = ficha completa, false = ficha compacta\n",
            "  full: boolean; // true = ficha completa, false = ficha compacta\n"
            "  gaps?: string[]; // secciones marcadas LAGUNA en la ficha\n")
    helpers = current[current.index("export function familyOf"):]

    metas = extract_family_metadata(current)
    expected8 = set(EXPECTED_COUNTS) - {"otros"}
    # Idempotente: el archivo puede ser el original (8 familias) o uno ya
    # convertido (9, con "otros"); en ambos casos se conservan las 8.
    if set(metas) != expected8 and set(metas) != expected8 | {"otros"}:
        print("ERROR: las familias del drugs.ts actual no coinciden con lo esperado",
              file=sys.stderr)
        return 1
    existing_accents = [re.search(r'accent: "([^"]+)"', metas[f]).group(1)
                        for f in expected8]
    if NEW_FAMILY_9["accent"] in existing_accents:
        print("ERROR: el accent de la familia 9 choca con uno existente", file=sys.stderr)
        return 1
    fam_objs = []
    for _fname, fid in FAMILY_FILES[:8]:
        # split_top_level_objects devuelve el objeto sin la sangría inicial
        # ni la coma final: se restituyen ambas al reensamblar.
        fam_objs.append("  " + replace_drugs_array(metas[fid], families_names[fid]) + ",")
    fam_objs.append(render_family_9(families_names["otros"]))
    families_ts = "export const families: Family[] = [\n" + "\n".join(fam_objs) + "\n];\n"

    conditions_ts = ("export const conditions = [\n"
                     + "".join(f"  {ts_str(c)},\n" for c in all_conditions) + "];\n")
    organs_ts = ("export const organs = [\n"
                 + "".join(f"  {ts_str(o)},\n" for o in ORGANS7) + "];\n")
    drugs_ts = ("export const drugs: Drug[] = [\n"
                + "\n".join(render_drug(d) for d in drugs) + "\n];\n")

    out = (HEADER + "\n" + family_type + "\n\n" + drug_type + "\n\n"
           + families_ts + "\n" + conditions_ts + "\n" + organs_ts + "\n"
           + drugs_ts + "\n" + helpers)
    DRUGS_TS.write_text(out, encoding="utf-8")

    # --- Verificación (modelo + archivo generado + índice maestro)
    failures, notes = [], []
    counts = verify_model(drugs, families_names, all_conditions, failures, notes)
    file_stats = verify_generated_file(DRUGS_TS, failures)

    from collections import Counter
    gaps_counter = Counter()
    for d in drugs:
        for g in d.get("gaps", []):
            gaps_counter[g] += 1
    commercial_empty = sum(1 for d in drugs if d["commercial"] == "")
    empty_arrays = Counter()
    for d in drugs:
        for key in ("indications", "adverse", "contraindications", "interactions"):
            if not d[key]:
                empty_arrays[key] += 1

    print("=" * 70)
    print("UroFármacos FASE 2 — conversión de fichas a src/data/drugs.ts")
    print("=" * 70)
    print(f"Fichas totales: {len(drugs)}")
    for _fname, fid in FAMILY_FILES:
        print(f"  {fid}: {counts.get(fid, 0)} (esperadas {EXPECTED_COUNTS[fid]})")
    print(f"Patologías distintas: {len(all_conditions)}")
    print(f"Órganos distintos: {sorted({o for d in drugs for o in d['organs']})}")
    print(f"Comerciales vacíos (LAGUNA): {commercial_empty}")
    print("Gaps por sección (fichas con LAGUNA):")
    for sec in ("Nombres comerciales", "Dosis habitual", "Efectos adversos",
                "Contraindicaciones", "Interacciones", "Mecanismo de acción",
                "Indicaciones", "Órganos", "Patologías", "Fármacos relacionados"):
        if gaps_counter.get(sec):
            print(f"  {sec}: {gaps_counter[sec]}")
    print(f"Campos array vacíos por LAGUNA: {dict(empty_arrays)}")
    print(f"Campos extra dentro de fichas: {len(extra_routing)}")
    for name, label, _v in extra_routing:
        print(f"  {name} | {label}")
    print(f"Marcadores de negrita markdown (**) eliminados (texto conservado): "
          f"{BOLD_REMOVED[0]}")
    print(f"Anomalías registradas: {len(anomalies)}")
    for ficha, field, kind, detail in anomalies:
        print(f"  [{ficha}] {field} — {kind}: {detail[:110]}")
    if notes:
        print(f"Avisos (revisar): {len(notes)}")
        for n in notes[:20]:
            print(f"  {n}")
    print("-" * 70)
    if failures:
        print(f"VERIFICACIÓN: FALLO ({len(failures)} problemas)")
        for f in failures:
            print(f"  !! {f}")
        return 1
    print("VERIFICACIÓN: OK")
    print(f"  archivo generado: {DRUGS_TS} ({len(out)} caracteres)")
    print(f"  stats del archivo: comerciales vacíos={file_stats['commercial_empty']}, "
          f"gaps={file_stats['gaps']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
