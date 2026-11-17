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
import { drugToMarkdown, slugify } from "./exportMarkdown";

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

// ---------- Routing por hash ----------
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function hashFor(view: View, query: string): string {
  switch (view.type) {
    case "drug": {
      const d = drugById(view.id);
      return `#/ficha/${d ? slugify(d.name) : view.id}`;
    }
    case "family":
      return `#/familia/${view.id}`;
    case "organ":
      return `#/organo/${slugify(view.name)}`;
    case "condition":
      return `#/patologia/${slugify(view.name)}`;
    case "favorites":
      return "#/favoritos";
    default:
      return query.trim().length >= 2
        ? `#/buscar/${encodeURIComponent(query.trim())}`
        : "#/";
  }
}

function parseHash(hash: string): { view: View; query: string } {
  const home = { view: { type: "home" } as View, query: "" };
  const h = hash.replace(/^#\/?/, "");
  if (!h) return home;
  const [head, ...rest] = h.split("/");
  const tail = rest.join("/");
  switch (head) {
    case "ficha": {
      const slug = decodeSafe(tail);
      const d =
        drugs.find((x) => slugify(x.name) === slug) ??
        drugs.find((x) => x.id === slug);
      return d ? { view: { type: "drug", id: d.id }, query: "" } : home;
    }
    case "familia": {
      const f = families.find((x) => x.id === tail);
      return f ? { view: { type: "family", id: f.id }, query: "" } : home;
    }
    case "organo": {
      const o = organs.find((x) => slugify(x) === tail);
      return o ? { view: { type: "organ", name: o }, query: "" } : home;
    }
    case "patologia": {
      const c = conditions.find((x) => slugify(x) === tail);
      return c ? { view: { type: "condition", name: c }, query: "" } : home;
    }
    case "buscar":
      return { view: { type: "home" }, query: decodeSafe(tail) };
    case "favoritos":
      return { view: { type: "favorites" }, query: "" };
    default:
      return home;
  }
}

function scrollToId(id: string) {
  try {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  } catch {
    // jsdom no implementa scrollIntoView; en el navegador real funciona.
  }
}

function scrollTop() {
  try {
    window.scrollTo({ top: 0 });
  } catch {
    // jsdom no implementa scrollTo; en el navegador real funciona.
  }
}

// SVGs del mockup (casa, estrella, lupa, índice).
const SvgHome = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V21h13V9.5" />
  </svg>
);
const SvgStar = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
  </svg>
);
const SvgSearch = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const SvgGrid = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);
const SvgMenu = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
const SvgLink = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" />
  </svg>
);
const SvgDownload = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

// ---------- Contenido del índice: mismo en la sidebar y en el cajón ----------
function SidebarContent({
  view,
  searching,
  favCount,
  organCounts,
  topConds,
  onHome,
  onFavorites,
  onFamily,
  onOrgan,
  onCondition,
  onAllConditions,
}: {
  view: View;
  searching: boolean;
  favCount: number;
  organCounts: { name: string; count: number }[];
  topConds: { name: string; count: number }[];
  onHome: () => void;
  onFavorites: () => void;
  onFamily: (id: string) => void;
  onOrgan: (name: string) => void;
  onCondition: (name: string) => void;
  onAllConditions: () => void;
}) {
  return (
    <>
      <div className="side-group">
        <button
          className={`side-item${view.type === "home" && !searching ? " active" : ""}`}
          onClick={onHome}
        >
          {SvgHome}Inicio
        </button>
        <button
          className={`side-item${view.type === "favorites" ? " active" : ""}`}
          onClick={onFavorites}
        >
          {SvgStar}Favoritos
          <span className="side-count">{favCount}</span>
        </button>
      </div>
      <div className="side-divider" />
      <div>
        <p className="side-label">
          Familias<span className="side-count">{families.length}</span>
        </p>
        <div className="side-group">
          {families.map((f) => (
            <button
              key={f.id}
              className={`side-fam${view.type === "family" && view.id === f.id ? " active" : ""}`}
              onClick={() => onFamily(f.id)}
            >
              <span
                className="fam-dot-side"
                style={{ background: `${f.accent}1c` }}
              >
                {f.icon}
              </span>
              <span className="side-fam-name">{f.short}</span>
              <span className="side-count">{drugsInFamily(f.id).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="side-divider" />
      <div>
        <p className="side-label">
          Órganos<span className="side-count">{organs.length}</span>
        </p>
        <div className="side-group">
          {organCounts.map((o) => (
            <button
              key={o.name}
              className={`side-fam${view.type === "organ" && view.name === o.name ? " active" : ""}`}
              onClick={() => onOrgan(o.name)}
            >
              <span className="side-fam-name">{o.name}</span>
              <span className="side-count">{o.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="side-divider" />
      <div>
        <p className="side-label">
          Patologías<span className="side-count">{conditions.length}</span>
        </p>
        <div className="side-group">
          <button className="side-fam" onClick={onAllConditions}>
            <span className="side-fam-name">Todas las patologías</span>
            <span className="side-count">{conditions.length}</span>
          </button>
          {topConds.map((c) => (
            <button
              key={c.name}
              className={`side-fam${view.type === "condition" && view.name === c.name ? " active" : ""}`}
              onClick={() => onCondition(c.name)}
            >
              <span className="side-fam-name">{c.name}</span>
              <span className="side-count">{c.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="side-foot">
        <b>UroFármacos</b>
        <span>Wiki de fármacos en urología.</span>
      </div>
    </>
  );
}

export default function App() {
  const [initial] = useState(() =>
    typeof window === "undefined"
      ? { view: { type: "home" } as View, query: "" }
      : parseHash(window.location.hash || "")
  );
  const [view, setView] = useState<View>(initial.view);
  const [query, setQuery] = useState(initial.query);
  const [highlight, setHighlight] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const [condFilter, setCondFilter] = useState("");
  const [condExpanded, setCondExpanded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  }, [favs]);

  useEffect(() => {
    scrollTop();
  }, [view]);

  // Sincroniza el hash con el estado (replaceState, sin entrada en historial).
  useEffect(() => {
    const h = hashFor(view, query);
    if (window.location.hash !== h) {
      try {
        window.history.replaceState(null, "", h);
      } catch {
        // Entorno sin historial; nada que hacer.
      }
    }
  }, [view, query]);

  // Aplica el hash cuando cambia desde fuera (atrás/adelante, enlace
  // pegado); solo si difiere del estado actual, para no hacer bucles.
  useEffect(() => {
    const onHash = () => {
      if (hashFor(view, query) === window.location.hash) return;
      const parsed = parseHash(window.location.hash || "");
      setQuery(parsed.query);
      setHighlight("");
      setView(parsed.view);
      setDrawer(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [view, query]);

  // Atajo Ctrl/⌘+K: enfoca el buscador y sube arriba.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        scrollTop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const goFavorites = () => {
    setQuery("");
    setHighlight("");
    setView({ type: "favorites" });
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

  const goAllConditions = () => {
    setQuery("");
    setHighlight("");
    setView({ type: "home" });
    setDrawer(false);
    setCondFilter("");
    setCondExpanded(true);
    window.setTimeout(() => scrollToId("patologias"), 50);
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

  const topConds = useMemo(
    () =>
      [...condCounts]
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
        .slice(0, 3),
    [condCounts]
  );

  const conditionCount = useMemo(
    () => new Set(drugs.flatMap((d) => d.conditions)).size,
    []
  );

  const filteredConds = useMemo(() => {
    const q = normalize(condFilter.trim());
    if (!q) return condCounts;
    return condCounts.filter((c) => normalize(c.name).includes(q));
  }, [condFilter, condCounts]);
  const shownConds = condExpanded
    ? filteredConds
    : filteredConds.slice(0, 12);

  const currentDrug: Drug | undefined =
    view.type === "drug" ? drugById(view.id) : undefined;
  const currentFamily: Family | undefined =
    view.type === "family"
      ? families.find((f) => f.id === view.id)
      : undefined;

  const sidebarProps = {
    view,
    searching,
    favCount: favs.size,
    organCounts,
    topConds,
    onHome: goHome,
    onFavorites: goFavorites,
    onFamily: openFamily,
    onOrgan: openOrgan,
    onCondition: openCondition,
    onAllConditions: goAllConditions,
  };

  const focusSearch = () => {
    searchRef.current?.focus();
    scrollTop();
  };

  return (
    <>
      {/* ---------- Topbar ---------- */}
      <header className="topbar">
        <button
          className="icon-btn"
          onClick={() => setDrawer(true)}
          aria-label="Abrir índice"
        >
          {SvgMenu}
        </button>
        <button className="brand" onClick={goHome} aria-label="UroFármacos inicio">
          <img src="/icon-512.png" alt="UroFármacos" className="brand-img" />
          <span className="brand-text">
            Uro<b>Fármacos</b>
            <small>Wiki de fármacos en urología</small>
          </span>
        </button>
        <div className="search">
          <div className="search-inner">
            {SvgSearch}
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar fármaco, familia, órgano o patología…"
              aria-label="Buscar fármaco"
            />
            {query && (
              <button
                className="clear"
                onClick={() => setQuery("")}
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
            <kbd>⌘ K</kbd>
          </div>
        </div>
        <div className="top-actions">
          <button className="ghost-btn" onClick={goFavorites}>
            {SvgStar}Favoritos <span className="n">{favs.size}</span>
          </button>
        </div>
      </header>

      {/* ---------- Cajón móvil (mismo contenido que la sidebar) ---------- */}
      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <aside className="drawer">
            <SidebarContent {...sidebarProps} />
          </aside>
        </>
      )}

      <div className="shell">
        <aside className="sidebar">
          <SidebarContent {...sidebarProps} />
        </aside>

        <main className="main animate-fade-in">
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
              {/* ---------- Héroe (solo foto de fondo, sin logo) ---------- */}
              <section className="hero">
                <div className="hero-inner">
                  <span className="hero-badge animate-fade-in-up">
                    <span className="dot" /> Material docente en español
                  </span>
                  <h1 className="animate-fade-in-up delay-100">
                    Todos los fármacos de la urología,{" "}
                    <span>explicados fármaco a fármaco</span>.
                  </h1>
                  <p className="animate-fade-in-up delay-200">
                    Mecanismo, indicaciones, dosis, efectos adversos,
                    contraindicaciones e interacciones, con las guías EAU
                    como fuente. Explora por familia, por órgano o por
                    patología.
                  </p>
                  <div className="hero-cta animate-fade-in-up delay-300">
                    <button
                      className="btn btn-primary"
                      onClick={() => scrollToId("familias")}
                    >
                      Explorar las familias →
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => searchRef.current?.focus()}
                    >
                      Buscar un fármaco
                    </button>
                  </div>
                  <div className="hero-stats animate-fade-in-up delay-300">
                    <div className="stat">
                      <b>{families.length}</b>
                      <span>familias</span>
                    </div>
                    <div className="stat">
                      <b>{organs.length}</b>
                      <span>órganos</span>
                    </div>
                    <div className="stat">
                      <b>{drugs.length}</b>
                      <span>fichas</span>
                    </div>
                    <div className="stat">
                      <b>{conditionCount}</b>
                      <span>patologías</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* ---------- Familias ---------- */}
              <div className="page">
                <section className="block" id="familias">
                  <div className="block-head">
                    <div>
                      <h2>Familias de fármacos</h2>
                      <p>
                        Entra por familia o busca directamente el fármaco.
                        Cada ficha enlaza con los fármacos relacionados y con
                        las patologías que trata.
                      </p>
                    </div>
                  </div>
                  <div className="grid-fam">
                    {familyList.map((f, i) => (
                      <button
                        key={f.id}
                        className="fam-card animate-fade-in-up"
                        style={{ "--acc": f.accent, animationDelay: `${i * 60}ms` } as React.CSSProperties}
                        onClick={() => openFamily(f.id)}
                      >
                        <span className="fam-top">
                          <span className="fam-icon">{f.icon}</span>
                          <h3>{f.name}</h3>
                        </span>
                        <p>{f.description}</p>
                        <span className="fam-foot">
                          <span className="count-pill">
                            {f.available} {f.available === 1 ? "ficha" : "fichas"}
                          </span>
                          <span className="fam-arrow">›</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="m-fam-list">
                    {familyList.map((f) => (
                      <button
                        key={f.id}
                        className="m-fam"
                        style={{ "--acc": f.accent } as React.CSSProperties}
                        onClick={() => openFamily(f.id)}
                      >
                        <span className="fam-icon">{f.icon}</span>
                        <span className="txt">
                          <b>{f.name}</b>
                          <span>
                            {f.available} {f.available === 1 ? "ficha" : "fichas"} · {f.short}
                          </span>
                        </span>
                        <span className="chev">›</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* ---------- Por órgano ---------- */}
                <section className="block">
                  <div className="block-head">
                    <div>
                      <h2>Por órgano</h2>
                      <p>
                        ¿Qué fármacos actúan sobre cada órgano del aparato
                        urinario y genital masculino?
                      </p>
                    </div>
                  </div>
                  <div className="chips">
                    {organCounts.map((o) => (
                      <button key={o.name} className="chip" onClick={() => openOrgan(o.name)}>
                        {o.name} <span className="n">{o.count}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* ---------- Por patología ---------- */}
                <section className="block" id="patologias">
                  <div className="block-head">
                    <div>
                      <h2>Por patología</h2>
                      <p>
                        Filtra por enfermedad y ve todos los fármacos que la
                        tratan.
                      </p>
                    </div>
                    {filteredConds.length > 12 && (
                      <button
                        className="block-link"
                        onClick={() => setCondExpanded((v) => !v)}
                      >
                        {condExpanded ? "Ver menos" : `Ver las ${filteredConds.length}`}
                      </button>
                    )}
                  </div>
                  <div className="panel">
                    <div className="panel-search">
                      {SvgSearch}
                      <input
                        type="text"
                        value={condFilter}
                        onChange={(e) => setCondFilter(e.target.value)}
                        placeholder="Filtrar patologías…"
                        aria-label="Filtrar patologías"
                      />
                      {condFilter && (
                        <button
                          onClick={() => setCondFilter("")}
                          aria-label="Limpiar filtro"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {filteredConds.length === 0 ? (
                      <div className="search-empty">
                        Sin patologías que coincidan con «{condFilter.trim()}».
                      </div>
                    ) : (
                      <div className="chips">
                        {shownConds.map((c) => (
                          <button
                            key={c.name}
                            className="chip"
                            onClick={() => openCondition(c.name)}
                          >
                            {c.name} <span className="n">{c.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="panel-foot">
                      <span>
                        Mostrando {shownConds.length} de {conditions.length} patologías
                      </span>
                      {filteredConds.length > 12 && (
                        <button
                          className="block-link"
                          onClick={() => setCondExpanded((v) => !v)}
                        >
                          {condExpanded ? "Ver menos" : "Ver todas las patologías"}
                        </button>
                      )}
                    </div>
                  </div>
                </section>
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
              onHome={goHome}
              onOpenFamily={openFamily}
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
                <button className="btn btn-primary" onClick={goHome}>
                  Volver al inicio
                </button>
              </p>
            </div>
          )}
        </main>
      </div>

      {/* ---------- Pie ---------- */}
      <footer className="footer">
        <div className="footer-inner">
          <b>UroFármacos</b> · Wiki de fármacos en urología.
        </div>
      </footer>

      {/* ---------- Barra inferior móvil ---------- */}
      <nav className="m-bottomnav" aria-label="Navegación inferior">
        <button
          className={view.type === "home" && !searching ? "active" : ""}
          onClick={goHome}
        >
          {SvgHome}Inicio
          {view.type === "home" && !searching && <span className="nav-dot" />}
        </button>
        <button onClick={() => setDrawer(true)}>
          {SvgGrid}Índice
        </button>
        <button
          className={searching ? "active" : ""}
          onClick={focusSearch}
        >
          {SvgSearch}Buscar
          {searching && <span className="nav-dot" />}
        </button>
        <button
          className={view.type === "favorites" ? "active" : ""}
          onClick={goFavorites}
        >
          {SvgStar}Favoritos
          {view.type === "favorites" && <span className="nav-dot" />}
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
      <div className="block-head">
        <div>
          <h2>
            {family.icon} {family.name}
          </h2>
          <p>{family.description}</p>
        </div>
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
      <div className="block-head">
        <div>
          <h2>{title}</h2>
          <p>
            {subtitle}. {items.length}{" "}
            {items.length === 1 ? "ficha" : "fichas"}.
          </p>
        </div>
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

const SECTIONS = [
  { id: "sec-mecanismo", label: "Mecanismo de acción", short: "Mecanismo de acción" },
  { id: "sec-indicaciones", label: "Indicaciones", short: "Indicaciones" },
  { id: "sec-dosis", label: "Dosis habitual", short: "Dosis habitual" },
  { id: "sec-efectos", label: "Efectos adversos", short: "Efectos adversos" },
  { id: "sec-contraindicaciones", label: "Contraindicaciones y precauciones", short: "Contraindicaciones" },
  { id: "sec-interacciones", label: "Interacciones", short: "Interacciones" },
  { id: "sec-relacionados", label: "Fármacos relacionados", short: "Fármacos relacionados" },
  { id: "sec-patologias", label: "Patologías que trata", short: "Patologías" },
  { id: "sec-organos", label: "Órganos", short: "Órganos" },
] as const;

const QUICKNAV = [
  { id: "sec-mecanismo", label: "Mecanismo" },
  { id: "sec-indicaciones", label: "Indicaciones" },
  { id: "sec-dosis", label: "Dosis" },
  { id: "sec-efectos", label: "Efectos" },
  { id: "sec-contraindicaciones", label: "Contraindic." },
] as const;

function DrugView({
  drug,
  highlight,
  fav,
  onToggleFav,
  onHome,
  onOpenFamily,
  onOpen,
  onSearch,
  onOpenOrgan,
  onOpenCondition,
}: {
  drug: Drug;
  highlight: string;
  fav: boolean;
  onToggleFav: () => void;
  onHome: () => void;
  onOpenFamily: (id: string) => void;
  onOpen: (id: string) => void;
  onSearch: (q: string) => void;
  onOpenOrgan: (name: string) => void;
  onOpenCondition: (name: string) => void;
}) {
  const fam = familyOf(drug);
  const [activeSec, setActiveSec] = useState<string>(SECTIONS[0].id);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (copyTimer.current !== undefined) {
        window.clearTimeout(copyTimer.current);
      }
    },
    []
  );

  // Índice lateral: marca la sección visible (guardado para jsdom,
  // que no implementa IntersectionObserver; sin él queda la primera).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSec(e.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [drug.id]);

  const copyLink = async () => {
    const url = window.location.href;
    let ok = false;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(url);
        ok = true;
      } else if (typeof document.execCommand === "function") {
        const ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      }
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      if (copyTimer.current !== undefined) {
        window.clearTimeout(copyTimer.current);
      }
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const exportMd = () => {
    try {
      const md = drugToMarkdown(drug);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      if (typeof URL.createObjectURL !== "function") return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(drug.name)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => {
        try {
          if (typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(url);
          }
        } catch {
          // Nada que hacer si el entorno no lo soporta.
        }
      }, 1000);
    } catch {
      // Nada debe lanzar en jsdom ni en el navegador.
    }
  };

  const scrollToSec = (id: string) => scrollToId(id);

  return (
    <div className="page">
      <nav className="crumb" aria-label="Ruta de navegación">
        <button onClick={onHome}>Inicio</button>
        <span aria-hidden="true">›</span>
        <button onClick={() => onOpenFamily(drug.familyId)}>{fam.name}</button>
        <span aria-hidden="true">›</span>
        <span>{drug.name}</span>
      </nav>

      <div className="ficha-head-card animate-fade-in-up">
        <div className="ficha-kicker">
          <span
            className="family-pill"
            style={{ "--acc": fam.accent } as React.CSSProperties}
          >
            {fam.icon} {fam.name}
          </span>
          {drug.full ? (
            <span className="full-pill">
              <span className="dot" />
              Ficha completa
            </span>
          ) : (
            <span className="full-pill">Ficha</span>
          )}
        </div>
        <h1 className="ficha-title">{drug.name}</h1>
        {drug.commercial === "" ? (
          <p className="commercial disclaimer">
            Nombres comerciales: no constan en el corpus.
          </p>
        ) : (
          <p className="commercial">
            Nombres comerciales: <b>{drug.commercial}</b>
          </p>
        )}
        <div className="ficha-actions">
          <button
            className={`fav${fav ? " fav-primary" : ""}`}
            onClick={onToggleFav}
            aria-pressed={fav}
          >
            {fav ? "★ En favoritos" : "☆ Guardar en favoritos"}
          </button>
          <button className="fav" onClick={copyLink}>
            {SvgLink}
            {copied ? "¡Enlace copiado!" : "Copiar enlace"}
          </button>
          <button className="fav" onClick={exportMd}>
            {SvgDownload}
            Exportar
          </button>
        </div>
      </div>

      <div className="m-quicknav">
        {QUICKNAV.map((q) => (
          <button key={q.id} className="chip" onClick={() => scrollToSec(q.id)}>
            {q.label}
          </button>
        ))}
      </div>

      <div className="ficha-layout">
        <div className="ficha-main">
          <section className="sec" id="sec-mecanismo">
            <h2>Mecanismo de acción</h2>
            {isGap(drug, "mechanism", "mecanismo") || !drug.mechanism.trim() ? (
              <p className="laguna">{LAGUNA}</p>
            ) : (
              <p>
                <HighlightAll text={drug.mechanism} query={highlight} />
              </p>
            )}
          </section>

          <section className="sec" id="sec-indicaciones">
            <h2>Indicaciones</h2>
            {isGap(drug, "indications", "indicaciones") ||
            drug.indications.length === 0 ? (
              <p className="laguna">{LAGUNA}</p>
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

          <section className="sec" id="sec-dosis">
            <h2>Dosis habitual</h2>
            {isGap(drug, "dose", "dosis") || !drug.dose.trim() ? (
              <p className="laguna">{LAGUNA}</p>
            ) : (
              <div className="dose">
                <HighlightAll text={drug.dose} query={highlight} />
              </div>
            )}
          </section>

          <section className="sec" id="sec-efectos">
            <h2>Efectos adversos</h2>
            {isGap(drug, "adverse", "efectos adversos", "efectos") ||
            drug.adverse.length === 0 ? (
              <p className="laguna">{LAGUNA}</p>
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

          <section className="sec" id="sec-contraindicaciones">
            <h2>Contraindicaciones y precauciones</h2>
            {isGap(drug, "contraindications", "contraindicaciones") ||
            drug.contraindications.length === 0 ? (
              <p className="laguna">{LAGUNA}</p>
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

          <section className="sec" id="sec-interacciones">
            <h2>Interacciones</h2>
            {isGap(drug, "interactions", "interacciones") ||
            drug.interactions.length === 0 ? (
              <p className="laguna">{LAGUNA}</p>
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

          <section className="sec" id="sec-relacionados">
            <h2>Fármacos relacionados</h2>
            {drug.relatedDrugs.length === 0 ||
            isGap(drug, "related", "farmacos relacionados") ? (
              <p className="laguna">{LAGUNA}</p>
            ) : (
              <div className="rel-chips">
                {drug.relatedDrugs.map((id) => {
                  const r = drugById(id);
                  if (!r) return null;
                  return (
                    <button
                      key={id}
                      className="rel rel-drug"
                      onClick={() => onOpen(id)}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="sec" id="sec-patologias">
            <h2>Patologías que trata</h2>
            <div className="rel-chips">
              {drug.conditions.map((c) => (
                <button
                  key={c}
                  className="rel rel-soft"
                  onClick={() => onOpenCondition(c)}
                >
                  {c} →
                </button>
              ))}
            </div>
          </section>

          <section className="sec" id="sec-organos">
            <h2>Órganos</h2>
            <div className="rel-chips">
              {drug.organs.map((o) => (
                <button
                  key={o}
                  className="rel rel-soft"
                  onClick={() => onOpenOrgan(o)}
                >
                  {o} →
                </button>
              ))}
            </div>
          </section>

          <p className="source-line">Fuente: {drug.source}.</p>
          {highlight && (
            <p className="disclaimer" style={{ marginTop: "0.75rem" }}>
              Término buscado “{highlight}” resaltado en amarillo en esta
              ficha.{" "}
              <button
                className="rel rel-soft"
                onClick={() => onSearch(highlight)}
                style={{ marginLeft: "0.25rem" }}
              >
                Ver todos los resultados →
              </button>
            </p>
          )}
        </div>

        <aside className="sec-index">
          <p className="lbl">En esta ficha</p>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              className={activeSec === s.id ? "on" : ""}
              onClick={() => scrollToSec(s.id)}
            >
              {s.short}
            </a>
          ))}
        </aside>
      </div>
    </div>
  );
}
