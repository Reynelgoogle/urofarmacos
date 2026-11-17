import { useEffect, useMemo, useRef, useState } from "react";
import {
  conditions,
  drugs,
  drugById,
  drugsInFamily,
  families,
  familyOf,
  organs,
  type Drug,
  type Family,
} from "./data/drugs";

type View =
  | { type: "home" }
  | { type: "family"; id: string }
  | { type: "drug"; id: string }
  | { type: "favorites" }
  | { type: "organ"; name: string }
  | { type: "condition"; name: string };

const FAV_KEY = "urofarmacos:favoritos";

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Resalta la primera ocurrencia de la búsqueda (filas de resultados). */
function Highlight({ text, query }: { text: string; query: string }) {
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
function HighlightAll({ text, query }: { text: string; query: string }) {
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

function haystack(d: Drug): string {
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
    ].join(" ")
  );
}

/** Una sección está en laguna si el campo está vacío o su clave figura en
 *  `drug.gaps`. Comparación EXACTA tras normalizar (minúsculas, sin
 *  acentos): nunca por subcadena — «contraindicaciones» contiene
 *  «indicaciones» y un `includes` escondería las indicaciones reales de
 *  toda ficha con gap en contraindicaciones (18 fichas en la fase 2).
 *  Cada clave (es/en) se traduce a su título canónico de laguna. */
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

function isGap(drug: Drug, ...keys: string[]): boolean {
  const gaps = (drug as Drug & { gaps?: string[] }).gaps;
  if (!gaps || gaps.length === 0) return false;
  return gaps.some((g) => {
    const ng = normalize(g);
    return keys.some((k) => ng === GAP_ALIASES[normalize(k)]);
  });
}

const LAGUNA = "Sin datos en el corpus (LAGUNA).";

export default function App() {
  const [view, setView] = useState<View>({ type: "home" });
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  }, [favs]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goHome = () => {
    setQuery("");
    setHighlight("");
    setView({ type: "home" });
    setDrawer(false);
  };

  const openDrug = (id: string, hl = "") => {
    setQuery("");
    setHighlight(hl);
    setView({ type: "drug", id });
    setDrawer(false);
  };

  const openFamily = (id: string) => {
    setQuery("");
    setHighlight("");
    setView({ type: "family", id });
    setDrawer(false);
  };

  const openOrgan = (name: string) => {
    setQuery("");
    setHighlight("");
    setView({ type: "organ", name });
    setDrawer(false);
  };

  const openCondition = (name: string) => {
    setQuery("");
    setHighlight("");
    setView({ type: "condition", name });
    setDrawer(false);
  };

  // ---------- Buscador completo estilo UroApp: texto completo, agrupado ----------
  const searchGroups = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return null;
    return {
      drugHits: drugs.filter((d) => haystack(d).includes(q)),
      famHits: families.filter((f) =>
        normalize(`${f.name} ${f.short} ${f.description}`).includes(q)
      ),
      condHits: conditions.filter((c) => normalize(c).includes(q)),
      organHits: organs.filter((o) => normalize(o).includes(q)),
    };
  }, [query]);

  const searching = searchGroups !== null;
  const totalHits = searchGroups
    ? searchGroups.drugHits.length +
      searchGroups.famHits.length +
      searchGroups.condHits.length +
      searchGroups.organHits.length
    : 0;

  const familyList = useMemo(
    () =>
      families.map((f) => ({
        ...f,
        available: drugsInFamily(f.id).length,
      })),
    []
  );

  const organCounts = useMemo(
    () =>
      organs.map((o) => ({
        name: o,
        count: drugs.filter((d) => d.organs.includes(o)).length,
      })),
    []
  );

  const condCounts = useMemo(
    () =>
      conditions.map((c) => ({
        name: c,
        count: drugs.filter((d) => d.conditions.includes(c)).length,
      })),
    []
  );

  const conditionCount = useMemo(
    () => new Set(drugs.flatMap((d) => d.conditions)).size,
    []
  );

  const currentDrug: Drug | undefined =
    view.type === "drug" ? drugById(view.id) : undefined;
  const currentFamily: Family | undefined =
    view.type === "family"
      ? families.find((f) => f.id === view.id)
      : undefined;

  return (
    <>
      {/* ---------- Cabecera ---------- */}
      <header className="glass-header">
        <div className="header-inner">
          <button
            className="icon-btn menu-btn"
            onClick={() => setDrawer(true)}
            aria-label="Abrir índice"
          >
            ☰
          </button>
          <button className="brand" onClick={goHome} aria-label="UroFármacos inicio">
            <img src="/icon-512.png" alt="UroFármacos" className="brand-mark-img" />
            <span className="brand-name">
              Uro<b>Fármacos</b>
              <small>Wiki de fármacos en urología</small>
            </span>
          </button>
          <div className="search-wrap">
            <div className="search-box">
              <span aria-hidden="true">🔍</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar fármaco, familia, órgano o patología…"
                aria-label="Buscar fármaco"
              />
              {query && (
                <button className="clear" onClick={() => setQuery("")} aria-label="Limpiar búsqueda">
                  ×
                </button>
              )}
            </div>
          </div>
          <nav className="nav-desktop" aria-label="Navegación principal">
            <button
              className={view.type === "home" ? "active" : ""}
              onClick={goHome}
            >
              Inicio
            </button>
            <button
              className={view.type === "favorites" ? "active" : ""}
              onClick={() => {
                setQuery("");
                setHighlight("");
                setView({ type: "favorites" });
              }}
            >
              Favoritos ({favs.size})
            </button>
          </nav>
        </div>
      </header>

      {/* ---------- Cajón móvil ---------- */}
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <aside className="drawer">
            <h3>UroFármacos</h3>
            <button
              className={`drawer-link ${view.type === "home" ? "active" : ""}`}
              onClick={goHome}
            >
              🏠 Inicio
            </button>
            <button
              className={`drawer-link ${view.type === "favorites" ? "active" : ""}`}
              onClick={() => {
                setQuery("");
                setHighlight("");
                setView({ type: "favorites" });
                setDrawer(false);
              }}
            >
              ⭐ Favoritos ({favs.size})
            </button>
            <h3 style={{ marginTop: "1.25rem" }}>Familias</h3>
            {families.map((f) => (
              <button
                key={f.id}
                className={`drawer-link ${view.type === "family" && view.id === f.id ? "active" : ""}`}
                onClick={() => openFamily(f.id)}
              >
                {f.icon} {f.name}
              </button>
            ))}
            <h3 style={{ marginTop: "1.25rem" }}>Órganos</h3>
            {organs.map((o) => (
              <button
                key={o}
                className={`drawer-link ${view.type === "organ" && view.name === o ? "active" : ""}`}
                onClick={() => openOrgan(o)}
              >
                {o}
              </button>
            ))}
            <h3 style={{ marginTop: "1.25rem" }}>Patologías</h3>
            {conditions.map((c) => (
              <button
                key={c}
                className={`drawer-link ${view.type === "condition" && view.name === c ? "active" : ""}`}
                onClick={() => openCondition(c)}
              >
                {c}
              </button>
            ))}
          </aside>
        </>
      )}

      <main className="animate-fade-in">
        {/* ---------- Búsqueda en vivo, agrupada ---------- */}
        {searching && searchGroups ? (
          <div className="page">
            <div className="section-head">
              <h2>Resultados para “{query.trim()}”</h2>
              <p>
                {totalHits === 0
                  ? `Sin coincidencias. La búsqueda cubre las ${drugs.length} fichas.`
                  : `${totalHits} ${totalHits === 1 ? "coincidencia" : "coincidencias"}: fármacos, familias, patologías y órganos.`}
              </p>
            </div>
            {totalHits === 0 ? (
              <div className="search-empty">
                Sin coincidencias. La búsqueda cubre las {drugs.length} fichas.
              </div>
            ) : (
              <>
                {searchGroups.drugHits.length > 0 && (
                  <div className="result-block">
                    <p className="result-group">Fármacos · {searchGroups.drugHits.length}</p>
                    <div className="drug-list">
                      {searchGroups.drugHits.map((d) => (
                        <DrugRow
                          key={d.id}
                          drug={d}
                          query={query}
                          onOpen={(id) => openDrug(id, query.trim())}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {searchGroups.famHits.length > 0 && (
                  <div className="result-block">
                    <p className="result-group">Familias · {searchGroups.famHits.length}</p>
                    <div className="drug-list">
                      {searchGroups.famHits.map((f) => (
                        <button
                          key={f.id}
                          className="drug-row"
                          onClick={() => openFamily(f.id)}
                        >
                          <span className="pill" style={{ background: f.accent }}>
                            {f.icon}
                          </span>
                          <span className="row-main">
                            <b>
                              <Highlight text={f.name} query={query} />
                            </b>
                            <span>{f.description}</span>
                          </span>
                          <span className="arrow">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {searchGroups.condHits.length > 0 && (
                  <div className="result-block">
                    <p className="result-group">Patologías · {searchGroups.condHits.length}</p>
                    <div className="chips">
                      {searchGroups.condHits.map((c) => (
                        <button key={c} className="chip" onClick={() => openCondition(c)}>
                          <Highlight text={c} query={query} /> →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {searchGroups.organHits.length > 0 && (
                  <div className="result-block">
                    <p className="result-group">Órganos · {searchGroups.organHits.length}</p>
                    <div className="chips">
                      {searchGroups.organHits.map((o) => (
                        <button key={o} className="chip" onClick={() => openOrgan(o)}>
                          <Highlight text={o} query={query} /> →
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : view.type === "home" ? (
          <>
            {/* ---------- Héroe ---------- */}
            <section className="hero">
              <div className="hero-inner">
                <img src="/urofarmacos-icon.jpg" alt="UroFármacos — Wiki" className="hero-logo" />
                <span className="hero-badge animate-fade-in-up">
                  <span className="dot" /> Material docente en español
                </span>
                <h1 className="animate-fade-in-up delay-100">
                  Todos los fármacos de la urología,{" "}
                  <span>explicados fármaco a fármaco</span>.
                </h1>
                <p className="animate-fade-in-up delay-200">
                  Una wiki interactiva solo de fármacos: mecanismo, indicaciones,
                  dosis, efectos adversos, contraindicaciones e interacciones,
                  con las guías EAU como fuente. Explora por familia, por órgano
                  o por patología.
                </p>
                <div className="hero-cta animate-fade-in-up delay-300">
                  <button
                    className="btn-brand"
                    onClick={() =>
                      document
                        .getElementById("familias")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Explorar las familias
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => searchRef.current?.focus()}
                  >
                    Buscar un fármaco
                  </button>
                </div>
                <div className="hero-stats animate-fade-in-up delay-300">
                  <div>
                    <b>{families.length}</b>
                    <span>familias</span>
                  </div>
                  <div>
                    <b>{organs.length}</b>
                    <span>órganos</span>
                  </div>
                  <div>
                    <b>{drugs.length}</b>
                    <span>fichas</span>
                  </div>
                  <div>
                    <b>{conditionCount}</b>
                    <span>patologías</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- Familias ---------- */}
            <div className="page" id="familias">
              <div className="section-head">
                <h2>Familias de fármacos</h2>
                <p>
                  Entra por familia o busca directamente el fármaco. Cada ficha
                  enlaza con los fármacos relacionados y con las patologías que
                  trata.
                </p>
              </div>
              <div className="grid">
                {familyList.map((f, i) => (
                  <button
                    key={f.id}
                    className="card animate-fade-in-up"
                    style={{ animationDelay: `${i * 60}ms` }}
                    onClick={() => openFamily(f.id)}
                  >
                    <span className="fam-icon">{f.icon}</span>
                    <h3>{f.name}</h3>
                    <p>{f.description}</p>
                    <span className="meta">
                      <span className="count-badge">
                        {f.available} {f.available === 1 ? "ficha" : "fichas"}
                      </span>
                      <span className="arrow">→</span>
                    </span>
                  </button>
                ))}
              </div>

              {/* ---------- Por órgano ---------- */}
              <div className="section-head" style={{ marginTop: "2rem" }}>
                <h2>Por órgano</h2>
                <p>
                  ¿Qué fármacos actúan sobre cada órgano del aparato urinario
                  y genital masculino?
                </p>
              </div>
              <div className="chips">
                {organCounts.map((o) => (
                  <button key={o.name} className="chip" onClick={() => openOrgan(o.name)}>
                    {o.name} · {o.count} {o.count === 1 ? "ficha" : "fichas"}
                  </button>
                ))}
              </div>

              {/* ---------- Por patología ---------- */}
              <div className="section-head" style={{ marginTop: "1.5rem" }}>
                <h2>Por patología</h2>
                <p>
                  Entra por la enfermedad y ve todos los fármacos que la tratan.
                </p>
              </div>
              <div className="chips">
                {condCounts.map((c) => (
                  <button key={c.name} className="chip" onClick={() => openCondition(c.name)}>
                    {c.name} · {c.count} {c.count === 1 ? "ficha" : "fichas"}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : view.type === "family" && currentFamily ? (
          <FamilyView
            family={currentFamily}
            onBack={goHome}
            onOpen={openDrug}
          />
        ) : view.type === "organ" ? (
          <AxisView
            title={view.name}
            subtitle="Fármacos que actúan sobre este órgano"
            items={drugs.filter((d) => d.organs.includes(view.name))}
            onBack={goHome}
            onOpen={openDrug}
            emptyText="Aún no hay fichas para este órgano."
          />
        ) : view.type === "condition" ? (
          <AxisView
            title={view.name}
            subtitle="Fármacos que tratan esta patología"
            items={drugs.filter((d) => d.conditions.includes(view.name))}
            onBack={goHome}
            onOpen={openDrug}
            emptyText="Aún no hay fichas para esta patología."
          />
        ) : view.type === "drug" && currentDrug ? (
          <DrugView
            drug={currentDrug}
            highlight={highlight}
            fav={favs.has(currentDrug.id)}
            onToggleFav={() => toggleFav(currentDrug.id)}
            onBack={() => openFamily(currentDrug.familyId)}
            onOpen={openDrug}
            onSearch={(q) => setQuery(q)}
            onOpenOrgan={openOrgan}
            onOpenCondition={openCondition}
          />
        ) : view.type === "favorites" ? (
          <div className="page">
            <div className="section-head">
              <h2>Favoritos</h2>
              <p>
                Tus fichas marcadas con la estrella. Se guardan en este
                dispositivo.
              </p>
            </div>
            {favs.size === 0 ? (
              <div className="search-empty">
                Aún no tienes favoritos. Abre una ficha y toca la estrella ☆
                para guardarla aquí.
              </div>
            ) : (
              <div className="drug-list">
                {drugs
                  .filter((d) => favs.has(d.id))
                  .map((d) => (
                    <DrugRow key={d.id} drug={d} query="" onOpen={openDrug} />
                  ))}
              </div>
            )}
          </div>
        ) : (
          <div className="page">
            <div className="search-empty">Esta vista no existe.</div>
            <p style={{ textAlign: "center" }}>
              <button className="btn-brand" onClick={goHome}>
                Volver al inicio
              </button>
            </p>
          </div>
        )}
      </main>

      {/* ---------- Pie ---------- */}
      <footer className="footer">
        <div className="footer-inner">
          <b>UroFármacos</b> · Wiki de fármacos en urología.
        </div>
      </footer>

      {/* ---------- Barra inferior móvil ---------- */}
      <nav className="bottom-nav" aria-label="Navegación inferior">
        <button className={view.type === "home" ? "active" : ""} onClick={goHome}>
          <span className="ic">🏠</span>Inicio
        </button>
        <button
          onClick={() => {
            setQuery("");
            setHighlight("");
            searchRef.current?.focus();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span className="ic">🔍</span>Buscar
        </button>
        <button
          className={view.type === "favorites" ? "active" : ""}
          onClick={() => {
            setQuery("");
            setHighlight("");
            setView({ type: "favorites" });
          }}
        >
          <span className="ic">⭐</span>Favoritos
        </button>
      </nav>
    </>
  );
}

function DrugRow({
  drug,
  query,
  onOpen,
}: {
  drug: Drug;
  query: string;
  onOpen: (id: string) => void;
}) {
  const fam = familyOf(drug);
  return (
    <button className="drug-row" onClick={() => onOpen(drug.id)}>
      <span className="pill" style={{ background: fam.accent }}>
        {drug.name.slice(0, 2).toUpperCase()}
      </span>
      <span className="row-main">
        <b>
          <Highlight text={drug.name} query={query} />
        </b>
        <span>
          {fam.short} · {drug.mechanism.slice(0, 110)}…
        </span>
      </span>
      {drug.full ? (
        <span className="tag-full">Ficha completa</span>
      ) : (
        <span className="tag-full">Ficha</span>
      )}
      <span className="arrow">→</span>
    </button>
  );
}

function FamilyView({
  family,
  onBack,
  onOpen,
}: {
  family: Family;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const available = drugsInFamily(family.id);
  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        ← Todas las familias
      </button>
      <div className="section-head">
        <h2>
          {family.icon} {family.name}
        </h2>
        <p>{family.description}</p>
      </div>
      <div className="drug-list">
        {family.drugs.map((name) => {
          const d = available.find((x) => x.name === name);
          if (!d) return null;
          return <DrugRow key={d.id} drug={d} query="" onOpen={onOpen} />;
        })}
      </div>
    </div>
  );
}

function AxisView({
  title,
  subtitle,
  items,
  onBack,
  onOpen,
  emptyText,
}: {
  title: string;
  subtitle: string;
  items: Drug[];
  onBack: () => void;
  onOpen: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        ← Inicio
      </button>
      <div className="section-head">
        <h2>{title}</h2>
        <p>{subtitle}.</p>
      </div>
      {items.length === 0 ? (
        <div className="search-empty">{emptyText}</div>
      ) : (
        <div className="drug-list">
          {items.map((d) => (
            <DrugRow key={d.id} drug={d} query="" onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function DrugView({
  drug,
  highlight,
  fav,
  onToggleFav,
  onBack,
  onOpen,
  onSearch,
  onOpenOrgan,
  onOpenCondition,
}: {
  drug: Drug;
  highlight: string;
  fav: boolean;
  onToggleFav: () => void;
  onBack: () => void;
  onOpen: (id: string) => void;
  onSearch: (q: string) => void;
  onOpenOrgan: (name: string) => void;
  onOpenCondition: (name: string) => void;
}) {
  const fam = familyOf(drug);
  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        ← {fam.name}
      </button>
      <div className="ficha-head animate-fade-in-up">
        <div className="crumbs">
          <button onClick={onBack}>{fam.name}</button> / {drug.name}
        </div>
        <h1>{drug.name}</h1>
        {drug.commercial === "" ? (
          <p className="commercial disclaimer">
            Nombres comerciales: no constan en el corpus.
          </p>
        ) : (
          <p className="commercial">
            Nombres comerciales: <b>{drug.commercial}</b>
          </p>
        )}
        <div className="ficha-tags">
          <span
            className="count-badge"
            style={{ background: fam.accent, color: "#fff" }}
          >
            {fam.short}
          </span>
          <button
            className={`fav-btn ${fav ? "on" : ""}`}
            onClick={onToggleFav}
            aria-pressed={fav}
          >
            {fav ? "★ En favoritos" : "☆ Guardar en favoritos"}
          </button>
        </div>
      </div>

      <section className="ficha-section animate-fade-in-up delay-100">
        <h2>Mecanismo de acción</h2>
        {isGap(drug, "mechanism", "mecanismo") || !drug.mechanism.trim() ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <p>
            <HighlightAll text={drug.mechanism} query={highlight} />
          </p>
        )}
      </section>

      <section className="ficha-section animate-fade-in-up delay-100">
        <h2>Indicaciones</h2>
        {isGap(drug, "indications", "indicaciones") ||
        drug.indications.length === 0 ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <ul>
            {drug.indications.map((x, i) => (
              <li key={i}>
                <HighlightAll text={x} query={highlight} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ficha-section animate-fade-in-up delay-200">
        <h2>Dosis habitual</h2>
        {isGap(drug, "dose", "dosis") || !drug.dose.trim() ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <div className="dose-box">
            <HighlightAll text={drug.dose} query={highlight} />
          </div>
        )}
      </section>

      <section className="ficha-section animate-fade-in-up delay-200">
        <h2>Efectos adversos</h2>
        {isGap(drug, "adverse", "efectos adversos", "efectos") ||
        drug.adverse.length === 0 ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <ul>
            {drug.adverse.map((x, i) => (
              <li key={i}>
                <HighlightAll text={x} query={highlight} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ficha-section animate-fade-in-up delay-300">
        <h2>Contraindicaciones y precauciones</h2>
        {isGap(drug, "contraindications", "contraindicaciones") ||
        drug.contraindications.length === 0 ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <ul>
            {drug.contraindications.map((x, i) => (
              <li key={i}>
                <HighlightAll text={x} query={highlight} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ficha-section animate-fade-in-up delay-300">
        <h2>Interacciones</h2>
        {isGap(drug, "interactions", "interacciones") ||
        drug.interactions.length === 0 ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <ul>
            {drug.interactions.map((x, i) => (
              <li key={i}>
                <HighlightAll text={x} query={highlight} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ficha-section">
        <h2>Fármacos relacionados</h2>
        {drug.relatedDrugs.length === 0 ||
        isGap(drug, "related", "farmacos relacionados") ? (
          <p className="disclaimer">{LAGUNA}</p>
        ) : (
          <div className="related">
            {drug.relatedDrugs.map((id) => {
              const r = drugById(id);
              if (!r) return null;
              return (
                <button key={id} className="rel-drug" onClick={() => onOpen(id)}>
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="ficha-section">
        <h2>Patologías que trata</h2>
        <div className="related">
          {drug.conditions.map((c) => (
            <button key={c} className="rel-cond" onClick={() => onOpenCondition(c)}>
              {c} →
            </button>
          ))}
        </div>
      </section>

      <section className="ficha-section">
        <h2>Órganos</h2>
        <div className="related">
          {drug.organs.map((o) => (
            <button key={o} className="rel-cond" onClick={() => onOpenOrgan(o)}>
              {o} →
            </button>
          ))}
        </div>
      </section>

      <p className="source">Fuente: {drug.source}.</p>
      {highlight && (
        <p className="disclaimer" style={{ marginTop: "0.75rem" }}>
          Término buscado “{highlight}” resaltado en amarillo en esta ficha.{" "}
          <button
            className="rel-cond"
            onClick={() => onSearch(highlight)}
            style={{ marginLeft: "0.25rem" }}
          >
            Ver todos los resultados →
          </button>
        </p>
      )}
    </div>
  );
}
