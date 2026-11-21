// Índice alfabético completo: las 103 fichas navegables sin depender
// de una búsqueda previa. Incluye filtro por familia, orden y selección
// de hasta 3 fármacos para el comparador.
import { useMemo, useState } from "react";
import { drugs, families, familyOf, type Drug } from "./data/drugs";
import { normalize } from "./text";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function initialOf(name: string): string {
  const n = normalize(name).charAt(0).toUpperCase();
  return LETTERS.includes(n) ? n : "#";
}

export default function DrugIndexView({
  onHome,
  onOpen,
  onCompare,
}: {
  onHome: () => void;
  onOpen: (id: string) => void;
  onCompare: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("todas");
  const [sort, setSort] = useState<"az" | "familia">("az");
  const [selected, setSelected] = useState<string[]>([]);
  const [hint, setHint] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = drugs.filter((d) => {
      if (family !== "todas" && d.familyId !== family) return false;
      if (!q) return true;
      const fam = familyOf(d);
      return normalize(
        `${d.name} ${d.commercial} ${fam.name} ${fam.short} ${d.conditions.join(" ")} ${d.organs.join(" ")}`
      ).includes(q);
    });
    return list.sort((a, b) => {
      if (sort === "familia") {
        const f = familyOf(a).name.localeCompare(familyOf(b).name, "es");
        if (f !== 0) return f;
      }
      return a.name.localeCompare(b.name, "es");
    });
  }, [query, family, sort]);

  const groups = useMemo(() => {
    if (sort === "familia") {
      return families
        .map((f) => ({
          key: f.id,
          label: `${f.icon} ${f.name}`,
          accent: f.accent,
          items: filtered.filter((d) => d.familyId === f.id),
        }))
        .filter((g) => g.items.length > 0);
    }
    const map = new Map<string, Drug[]>();
    for (const d of filtered) {
      const l = initialOf(d.name);
      const list = map.get(l) ?? [];
      list.push(d);
      map.set(l, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
      .map(([key, items]) => ({ key, label: key, accent: "", items }));
  }, [filtered, sort]);

  const toggle = (id: string) => {
    setHint("");
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        setHint("Puedes comparar como máximo 3 fármacos.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const selectedDrugs = selected
    .map((id) => drugs.find((d) => d.id === id))
    .filter((d): d is Drug => !!d);

  return (
    <div className="page idx-page">
      <button className="back-btn" onClick={onHome}>
        ← Inicio
      </button>

      <header className="idx-head">
        <div>
          <p className="eyebrow">Catálogo completo</p>
          <h2>Índice de fármacos</h2>
          <p>
            Las {drugs.length} fichas de la wiki, ordenadas y filtrables. Marca
            dos o tres fármacos para compararlos en paralelo.
          </p>
        </div>
        <div className="idx-head-stats">
          <div>
            <b>{drugs.length}</b>
            <span>fichas</span>
          </div>
          <div>
            <b>{families.length}</b>
            <span>familias</span>
          </div>
        </div>
      </header>

      <div className="idx-toolbar">
        <div className="idx-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nombre, comercial, patología u órgano…"
            aria-label="Filtrar el índice de fármacos"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Limpiar filtro">
              ×
            </button>
          )}
        </div>
        <label className="idx-sort">
          <span>Orden</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as "az" | "familia")}>
            <option value="az">A–Z</option>
            <option value="familia">Por familia</option>
          </select>
        </label>
      </div>

      <div className="idx-fams" role="group" aria-label="Filtrar por familia">
        <button
          type="button"
          className={`idx-fam${family === "todas" ? " on" : ""}`}
          onClick={() => setFamily("todas")}
        >
          Todas <span>{drugs.length}</span>
        </button>
        {families.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`idx-fam${family === f.id ? " on" : ""}`}
            onClick={() => setFamily(f.id)}
            style={{ "--acc": f.accent } as React.CSSProperties}
          >
            <span aria-hidden="true">{f.icon}</span>
            {f.short}
            <span>{drugs.filter((d) => d.familyId === f.id).length}</span>
          </button>
        ))}
      </div>

      <div className="idx-result-line">
        <span>
          {filtered.length} {filtered.length === 1 ? "ficha" : "fichas"}
          {query.trim() ? ` para «${query.trim()}»` : ""}
        </span>
        {(query || family !== "todas") && (
          <button
            type="button"
            className="block-link"
            onClick={() => {
              setQuery("");
              setFamily("todas");
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="idx-selbar" role="region" aria-label="Fármacos seleccionados para comparar">
          <div className="idx-sel-chips">
            <b>Comparar:</b>
            {selectedDrugs.map((d) => (
              <button
                key={d.id}
                type="button"
                className="idx-sel-chip"
                onClick={() => toggle(d.id)}
                title={`Quitar ${d.name}`}
              >
                {d.name} <span aria-hidden="true">×</span>
              </button>
            ))}
            {selected.length < 2 && <span className="idx-sel-hint">elige al menos 2</span>}
          </div>
          <div className="idx-sel-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={selected.length < 2}
              onClick={() => onCompare(selected)}
            >
              Comparar {selected.length} fichas →
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setSelected([])}>
              Limpiar
            </button>
          </div>
        </div>
      )}
      {hint && <p className="idx-hint">{hint}</p>}

      {groups.length === 0 ? (
        <div className="search-empty">
          Ningún fármaco coincide con «{query.trim()}».
        </div>
      ) : (
        <div className="idx-groups">
          {groups.map((g) => (
            <section className="idx-group" key={g.key}>
              <h3 className="idx-letter" style={g.accent ? ({ "--acc": g.accent } as React.CSSProperties) : undefined}>
                {g.label}
                <span>{g.items.length}</span>
              </h3>
              <div className="idx-rows">
                {g.items.map((d) => {
                  const fam = familyOf(d);
                  const isSel = selected.includes(d.id);
                  return (
                    <div
                      key={d.id}
                      className={`idx-row${isSel ? " selected" : ""}`}
                      style={{ "--acc": fam.accent } as React.CSSProperties}
                    >
                      <button
                        type="button"
                        className={`idx-check${isSel ? " on" : ""}`}
                        aria-pressed={isSel}
                        aria-label={`${isSel ? "Quitar" : "Añadir"} ${d.name} ${isSel ? "de" : "a"} la comparación`}
                        onClick={() => toggle(d.id)}
                      >
                        {isSel ? "✓" : "+"}
                      </button>
                      <button type="button" className="idx-open" onClick={() => onOpen(d.id)}>
                        <span className="idx-avatar" style={{ background: fam.accent }}>
                          {d.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="idx-main">
                          <b>{d.name}</b>
                          <span>
                            {fam.short}
                            {d.commercial ? ` · ${d.commercial}` : ""}
                          </span>
                        </span>
                        <span className="idx-arrow" aria-hidden="true">→</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
