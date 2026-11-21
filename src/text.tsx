// Utilidades de texto compartidas por la app, la paleta de comandos y
// el comparador. Se separan de App.tsx para evitar importaciones
// circulares entre componentes.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Resalta la primera ocurrencia de la búsqueda (filas de resultados). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = normalize(text).indexOf(normalize(q));
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/** Resalta TODAS las ocurrencias (texto de la ficha al saltar desde Buscar). */
export function HighlightAll({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const nq = normalize(q);
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  for (;;) {
    const idx = normalize(rest).indexOf(nq);
    if (idx < 0) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, idx));
    parts.push(
      <mark key={key++} className="hl">
        {rest.slice(idx, idx + q.length)}
      </mark>
    );
    rest = rest.slice(idx + q.length);
  }
  return <>{parts}</>;
}

/** Estimación de lectura: 190 palabras por minuto, mínimo 1 minuto. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 190));
}

/** Recorta un texto largo sin partir palabras y sin dejar espacios raros. */
export function excerpt(text: string, max = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max)}…`;
}
