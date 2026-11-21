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

const EMPTY = "No consta en la ficha.";

function textSection(text: string): string {
  return text.trim() ? text : EMPTY;
}

function listSection(items: string[]): string {
  return items.length ? items.map((x) => `- ${x}`).join("\n") : EMPTY;
}

export function drugToMarkdown(drug: Drug): string {
  const fam = familyOf(drug);
  const commercial = drug.commercial.trim()
    ? drug.commercial
    : "no constan en la ficha.";
  const related = drug.relatedDrugs
    .map((id) => drugById(id)?.name)
    .filter((n): n is string => !!n);
  const sections: [string, string][] = [
    ["Mecanismo de acción", textSection(drug.mechanism)],
    ["Indicaciones", listSection(drug.indications)],
    ["Dosis habitual", textSection(drug.dose)],
    ["Efectos adversos", listSection(drug.adverse)],
    ["Contraindicaciones y precauciones", listSection(drug.contraindications)],
    ["Interacciones", listSection(drug.interactions)],
    ["Fármacos relacionados", listSection(related)],
    ["Patologías que trata", listSection(drug.conditions)],
    ["Órganos", listSection(drug.organs)],
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
