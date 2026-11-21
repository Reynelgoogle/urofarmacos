// Comparador de fichas: hasta 3 fármacos en paralelo, con lectura
// "solo diferencias" y exportación a impresión. Todo el contenido sale
// de las mismas fichas.
import { useMemo, useState, type ReactNode } from "react";
import { drugById, drugs, familyOf, type Drug } from "./data/drugs";
import { normalize } from "./text";

type Row = {
  key: string;
  label: string;
  raw: (d: Drug) => string;
  render: (d: Drug) => ReactNode;
};

function ListCell({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <span className="cmp-gap-soft">No consta en la ficha.</span>;
  }
  return (
    <ul className="cmp-list">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function ChipsCell({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="cmp-gap-soft">No consta</span>;
  return (
    <div className="cmp-chips">
      {items.map((x) => (
        <span key={x} className="cmp-chip">
          {x}
        </span>
      ))}
    </div>
  );
}

export default function CompareView({
  ids,
  onHome,
  onOpen,
  onChange,
}: {
  ids: string[];
  onHome: () => void;
  onOpen: (id: string) => void;
  onChange: (ids: string[]) => void;
}) {
  const selected = useMemo(
    () => ids.map((id) => drugById(id)).filter((d): d is Drug => !!d),
    [ids]
  );
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);

  const candidates = useMemo(() => {
    const q = normalize(query.trim());
    return drugs
      .filter((d) => !ids.includes(d.id))
      .filter((d) => {
        if (!q) return true;
        const fam = familyOf(d);
        return normalize(
          `${d.name} ${d.commercial} ${fam.name} ${fam.short} ${d.conditions.join(" ")} ${d.organs.join(" ")}`
        ).includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .slice(0, 12);
  }, [ids, query]);

  const add = (id: string) => {
    if (ids.length >= 3 || ids.includes(id)) return;
    onChange([...ids, id]);
    setPicker(false);
    setQuery("");
  };

  const rows = useMemo<Row[]>(
    () => [
      {
        key: "family",
        label: "Familia",
        raw: (d) => familyOf(d).id,
        render: (d) => {
          const fam = familyOf(d);
          return (
            <span className="cmp-fam" style={{ "--acc": fam.accent } as React.CSSProperties}>
              <span aria-hidden="true">{fam.icon}</span>
              {fam.name}
            </span>
          );
        },
      },
      {
        key: "commercial",
        label: "Nombres comerciales",
        raw: (d) => normalize(d.commercial),
        render: (d) =>
          d.commercial.trim() ? (
            <span>{d.commercial}</span>
          ) : (
            <span className="cmp-gap-soft">No consta</span>
          ),
      },
      {
        key: "mechanism",
        label: "Mecanismo de acción",
        raw: (d) => d.mechanism,
        render: (d) =>
          d.mechanism.trim() ? (
            <p>{d.mechanism}</p>
          ) : (
            <span className="cmp-gap-soft">No consta en la ficha.</span>
          ),
      },
      {
        key: "indications",
        label: "Indicaciones",
        raw: (d) => d.indications.join(" | "),
        render: (d) => <ListCell items={d.indications} />,
      },
      {
        key: "dose",
        label: "Dosis habitual",
        raw: (d) => d.dose,
        render: (d) =>
          d.dose.trim() ? (
            <div className="dose cmp-dose">{d.dose}</div>
          ) : (
            <span className="cmp-gap-soft">No consta en la ficha.</span>
          ),
      },
      {
        key: "adverse",
        label: "Efectos adversos",
        raw: (d) => d.adverse.join(" | "),
        render: (d) => <ListCell items={d.adverse} />,
      },
      {
        key: "contraindications",
        label: "Contraindicaciones",
        raw: (d) => d.contraindications.join(" | "),
        render: (d) => <ListCell items={d.contraindications} />,
      },
      {
        key: "interactions",
        label: "Interacciones",
        raw: (d) => d.interactions.join(" | "),
        render: (d) => <ListCell items={d.interactions} />,
      },
      {
        key: "conditions",
        label: "Patologías que trata",
        raw: (d) => d.conditions.join(" | "),
        render: (d) => <ChipsCell items={d.conditions} />,
      },
      {
        key: "organs",
        label: "Órganos",
        raw: (d) => d.organs.join(" | "),
        render: (d) => <ChipsCell items={d.organs} />,
      },
      {
        key: "source",
        label: "Fuente",
        raw: (d) => d.source,
        render: (d) => <span className="cmp-source">{d.source}</span>,
      },
    ],
    []
  );

  const visibleRows = useMemo(() => {
    if (!onlyDiff || selected.length < 2) return rows;
    return rows.filter(
      (r) => new Set(selected.map((d) => normalize(r.raw(d)))).size > 1
    );
  }, [rows, onlyDiff, selected]);

  const diffCount = useMemo(
    () =>
      selected.length < 2
        ? 0
        : rows.filter(
            (r) => new Set(selected.map((d) => normalize(r.raw(d)))).size > 1
          ).length,
    [rows, selected]
  );

  return (
    <div className="page cmp-page">
      <button className="back-btn" onClick={onHome}>
        ← Inicio
      </button>

      <header className="cmp-head">
        <div>
          <p className="eyebrow">Lectura comparada</p>
          <h2>Comparador de fármacos</h2>
          <p>
            Hasta tres fichas en paralelo. En el móvil cada sección se lee en
            vertical, con el nombre del fármaco delante de cada dato.
          </p>
        </div>
        {selected.length > 0 && (
          <div className="cmp-head-actions">
            <button
              type="button"
              className={`cmp-toggle${onlyDiff ? " on" : ""}`}
              aria-pressed={onlyDiff}
              onClick={() => setOnlyDiff((v) => !v)}
              title="Oculta las filas idénticas"
            >
              <span className="cmp-switch" aria-hidden="true" />
              Solo diferencias
              {selected.length > 1 && <b>{diffCount}</b>}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              Imprimir
            </button>
          </div>
        )}
      </header>

      {selected.length === 0 ? (
        <div className="cmp-empty">
          <span className="cmp-empty-ico" aria-hidden="true">⇄</span>
          <h3>Elige los fármacos que quieres comparar</h3>
          <p>
            Añade dos o tres fichas. También puedes seleccionarlas desde el
            índice alfabético.
          </p>
          <div className="cmp-picker-wrap">
            <div className="cmp-picker">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar fármaco para añadir…"
                aria-label="Buscar fármaco para comparar"
              />
              <div className="cmp-picker-list">
                {candidates.map((d) => (
                  <button key={d.id} type="button" onClick={() => add(d.id)}>
                    <span className="cmp-picker-fam" style={{ background: familyOf(d).accent }}>
                      {d.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <b>{d.name}</b>
                      <small>{familyOf(d).short}</small>
                    </span>
                    <span aria-hidden="true">+</span>
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="cmp-picker-empty">Sin coincidencias.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="cmp-toolbar">
            <div className="cmp-cols">
              {selected.map((d) => {
                const fam = familyOf(d);
                return (
                  <div
                    key={d.id}
                    className="cmp-col-chip"
                    style={{ "--acc": fam.accent } as React.CSSProperties}
                  >
                    <button type="button" className="cmp-col-open" onClick={() => onOpen(d.id)}>
                      <span className="cmp-col-avatar" style={{ background: fam.accent }}>
                        {d.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <b>{d.name}</b>
                        <small>{fam.short}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cmp-remove"
                      aria-label={`Quitar ${d.name} de la comparación`}
                      onClick={() => onChange(ids.filter((x) => x !== d.id))}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              {selected.length < 3 && (
                <button
                  type="button"
                  className={`cmp-add${picker ? " on" : ""}`}
                  onClick={() => setPicker((v) => !v)}
                  aria-expanded={picker}
                >
                  + Añadir fármaco
                </button>
              )}
            </div>
            {picker && (
              <div className="cmp-picker">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar fármaco para añadir…"
                  aria-label="Buscar fármaco para comparar"
                  autoFocus
                />
                <div className="cmp-picker-list">
                  {candidates.map((d) => (
                    <button key={d.id} type="button" onClick={() => add(d.id)}>
                      <span className="cmp-picker-fam" style={{ background: familyOf(d).accent }}>
                        {d.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <b>{d.name}</b>
                        <small>{familyOf(d).short}</small>
                      </span>
                      <span aria-hidden="true">+</span>
                    </button>
                  ))}
                  {candidates.length === 0 && (
                    <p className="cmp-picker-empty">Sin coincidencias.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <p className="cmp-scroll-hint">Desliza horizontalmente para ver todas las columnas.</p>

          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col">Sección</th>
                  {selected.map((d) => (
                    <th key={d.id} scope="col">
                      {d.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {selected.map((d) => (
                      <td key={d.id} data-drug={d.name}>
                        {row.render(d)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onlyDiff && visibleRows.length === 0 && (
            <div className="search-empty">
              Las fichas seleccionadas coinciden en todas las secciones comparadas.
            </div>
          )}

          <p className="cmp-note">
            Comparación de las fichas de UroFármacos. No sustituye la ficha
            técnica ni el juicio clínico. Verifica siempre la dosis y las
            interacciones en la fuente vigente.
          </p>
        </>
      )}
    </div>
  );
}
