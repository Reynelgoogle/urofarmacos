// UroFármacos — exportación de fichas a Markdown + slugify para el
// routing por hash (#/ficha/<slug>, #/organo/<slug>, #/patologia/<slug>).
import { drugById, familyOf, type Drug } from "./data/drugs";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const LAGUNA = "Sin datos en el corpus (LAGUNA).";

// Copia exacta de la lógica de lagunas de App.tsx: comparación EXACTA
// tras normalizar (minúsculas, sin acentos), nunca por subcadena.
const GAP_ALIASES: Record<string, string> = {
  mechanism: "mecanismo de accion",
  mecanismo: "mecanismo de accion",
  indications: "indicaciones",
  indicaciones: "indicaciones",
  dose: "dosis habitual",
  dosis: "dosis habitual",
  adverse: "efectos adversos",
  "efectos adversos": "efectos adversos",
  efectos: "efectos adversos",
  contraindications: "contraindicaciones",
  contraindicaciones: "contraindicaciones",
  interactions: "interacciones",
  interacciones: "interacciones",
  related: "farmacos relacionados",
  "farmacos relacionados": "farmacos relacionados",
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isGap(drug: Drug, ...keys: string[]): boolean {
  const gaps = (drug as Drug & { gaps?: string[] }).gaps;
  if (!gaps || gaps.length === 0) return false;
  return gaps.some((g) => {
    const ng = normalize(g);
    return keys.some((k) => ng === GAP_ALIASES[normalize(k)]);
  });
}

function textSection(text: string, gap: boolean): string {
  return gap || !text.trim() ? LAGUNA : text;
}

function listSection(items: string[], gap: boolean): string {
  return gap || items.length === 0
    ? LAGUNA
    : items.map((x) => `- ${x}`).join("\n");
}

export function drugToMarkdown(drug: Drug): string {
  const fam = familyOf(drug);
  const commercial = drug.commercial.trim()
    ? drug.commercial
    : "no constan en el corpus.";
  const related = drug.relatedDrugs
    .map((id) => drugById(id)?.name)
    .filter((n): n is string => !!n);
  const sections: [string, string][] = [
    [
      "Mecanismo de acción",
      textSection(drug.mechanism, isGap(drug, "mechanism", "mecanismo")),
    ],
    [
      "Indicaciones",
      listSection(drug.indications, isGap(drug, "indications", "indicaciones")),
    ],
    [
      "Dosis habitual",
      textSection(drug.dose, isGap(drug, "dose", "dosis")),
    ],
    [
      "Efectos adversos",
      listSection(
        drug.adverse,
        isGap(drug, "adverse", "efectos adversos", "efectos")
      ),
    ],
    [
      "Contraindicaciones y precauciones",
      listSection(
        drug.contraindications,
        isGap(drug, "contraindications", "contraindicaciones")
      ),
    ],
    [
      "Interacciones",
      listSection(
        drug.interactions,
        isGap(drug, "interactions", "interacciones")
      ),
    ],
    [
      "Fármacos relacionados",
      listSection(related, isGap(drug, "related", "farmacos relacionados")),
    ],
    ["Patologías que trata", listSection(drug.conditions, false)],
    ["Órganos", listSection(drug.organs, false)],
  ];
  const parts: string[] = [
    `# ${drug.name}`,
    `**Familia:** ${fam.name}`,
    `**Nombres comerciales:** ${commercial}`,
  ];
  for (const [title, body] of sections) {
    parts.push(`## ${title}\n${body}`);
  }
  return parts.join("\n\n") + `\n\nFuente: ${drug.source}.\n`;
}
