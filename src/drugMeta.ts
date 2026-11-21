// Utilidades derivadas de las fichas: tiempo de lectura y texto de
// búsqueda. No inventan contenido clínico: solo cuentan y normalizan lo
// que ya está en src/data/drugs.ts.
import { familyOf, type Drug } from "./data/drugs";
import { normalize } from "./text";

export const SECTIONS = [
  { id: "sec-mecanismo", label: "Mecanismo de acción", short: "Mecanismo de acción" },
  { id: "sec-indicaciones", label: "Indicaciones", short: "Indicaciones" },
  { id: "sec-dosis", label: "Dosis habitual", short: "Dosis habitual" },
  { id: "sec-efectos", label: "Efectos adversos", short: "Efectos adversos" },
  {
    id: "sec-contraindicaciones",
    label: "Contraindicaciones y precauciones",
    short: "Contraindicaciones",
  },
  { id: "sec-interacciones", label: "Interacciones", short: "Interacciones" },
  { id: "sec-relacionados", label: "Fármacos relacionados", short: "Fármacos relacionados" },
  { id: "sec-patologias", label: "Patologías que trata", short: "Patologías" },
  { id: "sec-organos", label: "Órganos", short: "Órganos" },
] as const;

export function readingMinutesOf(drug: Drug): number {
  const text = [
    drug.mechanism,
    drug.dose,
    ...drug.indications,
    ...drug.adverse,
    ...drug.contraindications,
    ...drug.interactions,
  ].join(" ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 190));
}

export function haystack(d: Drug): string {
  return normalize(
    [
      d.name,
      d.commercial,
      familyOf(d).name,
      familyOf(d).short,
      d.mechanism,
      ...d.indications,
      d.dose,
      ...d.adverse,
      ...d.contraindications,
      ...d.interactions,
      ...d.conditions,
      ...d.organs,
      d.source,
    ].join(" ")
  );
}
