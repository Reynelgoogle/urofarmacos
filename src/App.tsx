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
import NavDrawer from "./NavDrawer";
import ReadingMode from "./ReadingMode";
import CommandPalette from "./CommandPalette";
import DrugIndexView from "./DrugIndexView";
import CompareView from "./CompareView";
import { SECTIONS, haystack, readingMinutesOf } from "./drugMeta";
import { Highlight, HighlightAll, excerpt, normalize } from "./text";

type View =
  | { type: "home" }
  | { type: "family"; id: string }
  | { type: "drug"; id: string }
  | { type: "favorites" }
  | { type: "organ"; name: string }
  | { type: "condition"; name: string }
  | { type: "credits" }
  | { type: "index" }
  | { type: "compare"; ids: string[] };

const FAV_KEY = "urofarmacos:favoritos";
const RECENT_KEY = "urofarmacos:recientes";

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return [];
    return ids.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

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
    case "credits":
      return "#/creditos";
    case "index":
      return "#/farmacos";
    case "compare":
      return view.ids.length > 0
        ? `#/comparar/${view.ids.map(encodeURIComponent).join(",")}`
        : "#/comparar";
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
    case "creditos":
      return { view: { type: "credits" }, query: "" };
    case "farmacos":
    case "indice":
      return { view: { type: "index" }, query: "" };
    case "comparar": {
      const ids = tail
        .split(",")
        .map((x) => decodeSafe(x).trim())
        .filter((x) => !!drugById(x));
      return { view: { type: "compare", ids: [...new Set(ids)].slice(0, 3) }, query: "" };
    }
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
const SvgCompare = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h10M4 7l3-3M4 7l3 3" />
    <path d="M20 17H10M20 17l-3-3M20 17l-3 3" />
    <path d="M8 4v6M16 14v6" />
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
const SvgExpand = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);
const SvgInfo = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </svg>
);

// ---------- Contenido del índice: el panel de navegación que vive
// dentro del cajón (único, para todos los tamaños) ----------
function NavContent({
  view,
  searching,
  favCount,
  organCounts,
  topConds,
  onHome,
  onFavorites,
  onCredits,
  onFamily,
  onOrgan,
  onCondition,
  onAllConditions,
  onIndex,
  onCompare,
}: {
  view: View;
  searching: boolean;
  favCount: number;
  organCounts: { name: string; count: number }[];
  topConds: { name: string; count: number }[];
  onHome: () => void;
  onFavorites: () => void;
  onCredits: () => void;
  onFamily: (id: string) => void;
  onOrgan: (name: string) => void;
  onCondition: (name: string) => void;
  onAllConditions: () => void;
  onIndex: () => void;
  onCompare: () => void;
}) {
  return (
    <>
      <div className="side-group">
        <button
          className={`side-item${view.type === "home" && !searching ? " active" : ""}`}
          onClick={onHome}
          title="Inicio"
        >
          {SvgHome}Inicio
        </button>
        <button
          className={`side-item${view.type === "favorites" ? " active" : ""}`}
          onClick={onFavorites}
          title="Favoritos"
        >
          {SvgStar}Favoritos
          <span className="side-count">{favCount}</span>
        </button>
        <button
          className={`side-item${view.type === "credits" ? " active" : ""}`}
          onClick={onCredits}
          title="Créditos"
        >
          {SvgInfo}Créditos
        </button>
        <button
          className={`side-tool${view.type === "index" ? " active" : ""}`}
          onClick={onIndex}
          title="Índice alfabético completo"
        >
          {SvgGrid}Índice A–Z
          <span className="side-count">{drugs.length}</span>
        </button>
        <button
          className={`side-tool${view.type === "compare" ? " active" : ""}`}
          onClick={onCompare}
          title="Comparador de fármacos"
        >
          {SvgCompare}Comparador
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
              title={`${f.name} · ${drugsInFamily(f.id).length} fichas`}
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
              title={o.name}
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
          <button className="side-fam" onClick={onAllConditions} title="Todas las patologías">
            <span className="side-fam-name">Todas las patologías</span>
            <span className="side-count">{conditions.length}</span>
          </button>
          {topConds.map((c) => (
            <button
              key={c.name}
              className={`side-fam${view.type === "condition" && view.name === c.name ? " active" : ""}`}
              onClick={() => onCondition(c.name)}
              title={c.name}
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
  const [recents, setRecents] = useState<string[]>(loadRecents);
  const [condFilter, setCondFilter] = useState("");
  const [condExpanded, setCondExpanded] = useState(false);
  const [reading, setReading] = useState(false);
  const [palette, setPalette] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  }, [favs]);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
    } catch {
      // Sin almacenamiento: la lista vive solo en esta sesión.
    }
  }, [recents]);

  // Título de documento por vista: historial, pestañas y lectores de
  // pantalla reciben un título útil en lugar del genérico de la app.
  useEffect(() => {
    const base = "UroFármacos";
    if (view.type === "drug") {
      const d = drugById(view.id);
      document.title = d ? `${d.name} · ${base}` : base;
    } else if (view.type === "family") {
      const f = families.find((x) => x.id === view.id);
      document.title = f ? `${f.name} · ${base}` : base;
    } else if (view.type === "index") {
      document.title = `Índice de fármacos · ${base}`;
    } else if (view.type === "compare") {
      document.title = `Comparador · ${base}`;
    } else if (view.type === "favorites") {
      document.title = `Favoritos · ${base}`;
    } else if (view.type === "credits") {
      document.title = `Créditos · ${base}`;
    } else if (query.trim().length >= 2) {
      document.title = `Buscar “${query.trim()}” · ${base}`;
    } else {
      document.title = "UroFármacos — Wiki de fármacos en urología";
    }
  }, [view, query]);

  // Clave estable de vista: cambiar de fármaco, familia, órgano o
  // patología vuelve arriba, pero añadir o quitar una columna en el
  // comparador NO debe hacer saltar la página al principio.
  const viewKey =
    view.type === "drug"
      ? `drug:${view.id}`
      : view.type === "family"
        ? `family:${view.id}`
        : view.type === "organ"
          ? `organ:${view.name}`
          : view.type === "condition"
            ? `condition:${view.name}`
            : view.type;

  useEffect(() => {
    scrollTop();
  }, [viewKey]);

  // Al navegar (hash, atrás/adelante, enlace interno) el modo lectura
  // se cierra: el overlay pertenece a la ficha que se estaba viendo.
  useEffect(() => {
    setReading(false);
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

  // Atajos de producto: ⌘/Ctrl+K abre la paleta de comandos; «/» también
  // cuando el foco no está en un campo de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        setPalette(true);
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

  const goCredits = () => {
    setQuery("");
    setHighlight("");
    setView({ type: "credits" });
    setDrawer(false);
  };

  const remember = (id: string) => {
    setRecents((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 8));
  };

  const openDrug = (id: string, hl = "") => {
    setQuery("");
    setHighlight(hl);
    setView({ type: "drug", id });
    setDrawer(false);
    remember(id);
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

  const goIndex = () => {
    setQuery("");
    setHighlight("");
    setView({ type: "index" });
    setDrawer(false);
  };

  const openCompare = (ids: string[] = []) => {
    setQuery("");
    setHighlight("");
    setView({ type: "compare", ids: [...new Set(ids)].filter(Boolean).slice(0, 3) });
    setDrawer(false);
  };

  const openRandom = () => {
    const pool = drugs.filter(
      (d) => !(view.type === "drug" && d.id === view.id)
    );
    const d = pool[Math.floor(Math.random() * pool.length)];
    if (d) openDrug(d.id);
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

  const recentDrugs = useMemo(
    () =>
      recents
        .map((id) => drugById(id))
        .filter((d): d is Drug => !!d)
        .slice(0, 4),
    [recents]
  );

  // Fármaco del día determinista: mismo día, misma ficha; sin aleatoriedad
  // entre renders ni entre sesiones.
  const dailyDrug = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    return drugs[day % drugs.length];
  }, []);

  const dailyFam = familyOf(dailyDrug);

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

  const navProps = {
    view,
    searching,
    favCount: favs.size,
    organCounts,
    topConds,
    onHome: goHome,
    onFavorites: goFavorites,
    onCredits: goCredits,
    onFamily: openFamily,
    onOrgan: openOrgan,
    onCondition: openCondition,
    onAllConditions: goAllConditions,
    onIndex: goIndex,
    onCompare: () => openCompare(),
  };

  const focusSearch = () => {
    searchRef.current?.focus();
    scrollTop();
  };

  const openPalette = () => setPalette(true);

  return (
    <>
      {/* ---------- Topbar ---------- */}
      <header className="topbar">
        <button
          className="icon-btn"
          onClick={() => setDrawer(true)}
          aria-label="Abrir índice"
          aria-expanded={drawer}
          aria-controls="nav-drawer"
        >
          {SvgMenu}
        </button>
        <button className="brand" onClick={goHome} aria-label="UroFármacos inicio">
          <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="UroFármacos" className="brand-img" />
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
          <button
            className="icon-btn palette-btn"
            onClick={openPalette}
            aria-label="Abrir paleta de comandos"
            title="Paleta de comandos (⌘ K)"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <span className="cmd-glyph" aria-hidden="true">⌘</span>
          </button>
          <button className="ghost-btn" onClick={goFavorites}>
            {SvgStar}Favoritos <span className="n">{favs.size}</span>
          </button>
        </div>
      </header>

      <CommandPalette
        open={palette}
        onClose={() => setPalette(false)}
        recent={recents}
        onHome={goHome}
        onFavorites={goFavorites}
        onCredits={goCredits}
        onIndex={goIndex}
        onCompare={() => openCompare()}
        onRandom={openRandom}
        onOpenDrug={openDrug}
        onOpenFamily={openFamily}
        onOpenOrgan={openOrgan}
        onOpenCondition={openCondition}
      />

      {/* ---------- Cajón de navegación (único, todos los tamaños):
           el panel de navegación ya no es una sidebar fija: se abre
           con la hamburguesa y el contenido ocupa todo el ancho. ---------- */}
      <NavDrawer open={drawer} onClose={() => setDrawer(false)}>
        <NavContent {...navProps} />
      </NavDrawer>

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
                    Consulta los fármacos que se usan en urología y
                    encuéntralos por familia, por órgano o por patología.
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

              <div className="page">
                {/* ---------- Escritorio personal: recientes + fármaco del día ---------- */}
                <section className="desk-band" aria-label="Tu espacio de trabajo">
                  {recentDrugs.length > 0 && (
                    <div className="recent-block">
                      <div className="desk-head">
                        <div>
                          <p className="eyebrow">Tu recorrido</p>
                          <h2>Continúa donde lo dejaste</h2>
                        </div>
                        <button className="block-link" onClick={goIndex}>
                          Ver todo el índice →
                        </button>
                      </div>
                      <div className="recent-grid">
                        {recentDrugs.map((d) => {
                          const fam = familyOf(d);
                          return (
                            <button
                              key={d.id}
                              className="recent-card"
                              style={{ "--acc": fam.accent } as React.CSSProperties}
                              onClick={() => openDrug(d.id)}
                            >
                              <span className="recent-avatar">{d.name.slice(0, 2).toUpperCase()}</span>
                              <span className="recent-main">
                                <b>{d.name}</b>
                                <small>
                                  {fam.short}
                                  {d.commercial ? ` · ${d.commercial}` : ""}
                                </small>
                              </span>
                              <span className="recent-arrow" aria-hidden="true">→</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <article
                    className="daily-card"
                    style={{ "--acc": dailyFam.accent } as React.CSSProperties}
                  >
                    <div className="daily-glow" aria-hidden="true" />
                    <p className="eyebrow">Fármaco del día</p>
                    <div className="daily-fam">
                      <span className="daily-icon">{dailyFam.icon}</span>
                      {dailyFam.name}
                    </div>
                    <h2>{dailyDrug.name}</h2>
                    <p className="daily-excerpt">{excerpt(dailyDrug.mechanism, 170)}</p>
                    <div className="daily-actions">
                      <button className="btn btn-primary" onClick={() => openDrug(dailyDrug.id)}>
                        Abrir ficha →
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => openCompare([dailyDrug.id])}
                      >
                        Comparar
                      </button>
                    </div>
                  </article>
                </section>

                {/* ---------- Familias ---------- */}
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
                    <button className="block-link" onClick={goIndex}>
                      Índice A–Z de las {drugs.length} fichas →
                    </button>
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
          ) : view.type === "credits" ? (
            <CreditsView onHome={goHome} />
          ) : view.type === "index" ? (
            <DrugIndexView onHome={goHome} onOpen={openDrug} onCompare={openCompare} />
          ) : view.type === "compare" ? (
            <CompareView
              ids={view.ids}
              onHome={goHome}
              onOpen={openDrug}
              onChange={(ids) => setView({ type: "compare", ids })}
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
              onOpenReading={() => setReading(true)}
              onCompare={(ids) => openCompare(ids)}
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

      {/* ---------- Pie ---------- */}
      <footer className="footer">
        <div className="footer-inner">
          <b>UroFármacos</b> · Wiki de fármacos en urología.
        </div>
        <div className="footer-links">
          <button className="footer-link" onClick={goCredits}>
            Créditos
          </button>
          <button className="footer-link" onClick={goIndex}>
            Índice A–Z
          </button>
          <button className="footer-link" onClick={() => openCompare()}>
            Comparador
          </button>
        </div>
      </footer>

      {/* ---------- Modo lectura (portal a document.body) ---------- */}
      {reading && currentDrug && (
        <ReadingMode
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
          onCompare={(ids) => openCompare(ids)}
          onClose={() => setReading(false)}
        />
      )}

      {/* ---------- Barra inferior móvil ---------- */}
      <nav className="m-bottomnav" aria-label="Navegación inferior">
        <button
          className={view.type === "home" && !searching ? "active" : ""}
          onClick={goHome}
        >
          {SvgHome}Inicio
          {view.type === "home" && !searching && <span className="nav-dot" />}
        </button>
        <button
          className={`${view.type === "index" ? "active" : ""}`}
          onClick={goIndex}
          aria-current={view.type === "index" ? "page" : undefined}
        >
          {SvgGrid}Índice
          {view.type === "index" && <span className="nav-dot" />}
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

function CreditsView({ onHome }: { onHome: () => void }) {
  return (
    <div className="page credits-page">
      <button className="back-btn" onClick={onHome}>
        ← Inicio
      </button>

      <div className="credits-hero">
        <p className="eyebrow">Acerca de la app</p>
        <h2>Créditos</h2>
        <p className="credits-sub">
          Una wiki de fármacos en urología, en español, escrita para consultar
          rápido en la consulta y para estudiar con criterio.
        </p>
        <div className="credits-stats">
          <div>
            <b>{drugs.length}</b>
            <span>fichas</span>
          </div>
          <div>
            <b>{families.length}</b>
            <span>familias</span>
          </div>
        </div>
      </div>

      <div className="credits">
        <p>
          <b>Autor:</b> Reynel Busto González, Médico Urólogo, Hospital
          «Hermanos Ameijeiras».
        </p>
        <p>
          <b>ORCID:</b> 0009-0003-2233-9021
        </p>
        <p>
          UroFármacos reúne {drugs.length} fichas agrupadas en{" "}
          {families.length} familias: mecanismo de acción, indicaciones, dosis
          habitual, efectos adversos, contraindicaciones e interacciones de
          cada fármaco.
        </p>
        <p>
          <b>Fuentes:</b> guías de la Asociación Europea de Urología (EAU)
          2025, Urology-Textbook, Campbell-Walsh-Wein y fichas técnicas de
          referencia.
        </p>

        <p className="disclaimer">
          Material docente para profesionales de la salud. No sustituye el
          juicio clínico ni la ficha técnica oficial de cada fármaco. Las dosis
          son orientativas: verifica siempre la ficha técnica vigente.
        </p>
      </div>
    </div>
  );
}

const QUICKNAV = [
  { id: "sec-mecanismo", label: "Mecanismo" },
  { id: "sec-indicaciones", label: "Indicaciones" },
  { id: "sec-dosis", label: "Dosis" },
  { id: "sec-efectos", label: "Efectos" },
  { id: "sec-contraindicaciones", label: "Contraindic." },
] as const;

export function DrugView({
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
  onOpenReading,
  onCompare,
  hideReadingButton,
  readingMode,
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
  onOpenReading?: () => void;
  onCompare?: (ids: string[]) => void;
  hideReadingButton?: boolean;
  readingMode?: boolean;
}) {
  const fam = familyOf(drug);
  const [activeSec, setActiveSec] = useState<string>(SECTIONS[0].id);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const copyTimer = useRef<number | undefined>(undefined);
  const mins = readingMinutesOf(drug);
  const familyDrugs = drugsInFamily(drug.familyId);
  const familyIndex = familyDrugs.findIndex((d) => d.id === drug.id);
  const prevDrug = familyIndex > 0 ? familyDrugs[familyIndex - 1] : undefined;
  const nextDrug =
    familyIndex >= 0 && familyIndex < familyDrugs.length - 1
      ? familyDrugs[familyIndex + 1]
      : undefined;

  // Progreso de lectura de la ficha (solo en la vista normal; el modo
  // lectura tiene su propio contenedor con scroll).
  useEffect(() => {
    if (readingMode) return;
    if (typeof window === "undefined") return;
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [drug.id, readingMode]);

  // En el modo lectura la ficha de fondo sigue montada: las secciones
  // del overlay llevan el prefijo "rm-" para no duplicar IDs, y el
  // índice lateral no se renderiza (una sola columna).
  const secId = (id: string) => (readingMode ? `rm-${id}` : id);

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
  // En el modo lectura está DESACTIVADO: la ficha de fondo sigue
  // montada y el observer observaría sus elementos (IDs duplicados)
  // y marcaría secciones equivocadas; además el overlay no tiene
  // índice lateral (una sola columna).
  useEffect(() => {
    if (readingMode) return;
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
  }, [drug.id, readingMode]);

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

  const scrollToSec = (id: string) => scrollToId(secId(id));

  const printFicha = () => {
    try {
      window.print();
    } catch {
      // Entorno sin impresión (jsdom/WebView antiguo): sin efecto.
    }
  };

  return (
    <div className="page">
      {!readingMode && (
        <div className="read-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      <nav className="crumb" aria-label="Ruta de navegación">
        <button onClick={onHome}>Inicio</button>
        <span aria-hidden="true">›</span>
        <button onClick={() => onOpenFamily(drug.familyId)}>{fam.name}</button>
        <span aria-hidden="true">›</span>
        <span>{drug.name}</span>
      </nav>

      <div
        className="ficha-head-card animate-fade-in-up"
        style={{ "--acc": fam.accent } as React.CSSProperties}
      >
        <div className="ficha-kicker">
          <span
            className="family-pill"
            style={{ "--acc": fam.accent } as React.CSSProperties}
          >
            {fam.icon} {fam.name}
          </span>

        </div>
        <h1 className="ficha-title">{drug.name}</h1>
        {drug.commercial === "" ? (
          <p className="commercial disclaimer">
            Nombres comerciales: no constan en la ficha.
          </p>
        ) : (
          <p className="commercial">
            Nombres comerciales: <b>{drug.commercial}</b>
          </p>
        )}

        <div className="ficha-facts">
          <div className="fact">
            <span className="fact-label">Familia</span>
            <b>{fam.short}</b>
          </div>
          <div className="fact">
            <span className="fact-label">Órganos diana</span>
            <b>{drug.organs.join(" · ")}</b>
          </div>
          <div className="fact">
            <span className="fact-label">Patologías</span>
            <b>
              {drug.conditions.length}{" "}
              {drug.conditions.length === 1 ? "indicación" : "indicaciones"}
            </b>
          </div>
          <div className="fact">
            <span className="fact-label">Lectura</span>
            <b>≈ {mins} min</b>
          </div>
        </div>

        <div className="ficha-actions">
          <button
            className={`fav${fav ? " fav-primary" : ""}`}
            onClick={onToggleFav}
            aria-pressed={fav}
          >
            {fav ? "★ En favoritos" : "☆ Guardar en favoritos"}
          </button>
          {onCompare && (
            <button className="fav" onClick={() => onCompare([drug.id])}>
              {SvgCompare}
              Comparar
            </button>
          )}
          <button className="fav" onClick={copyLink}>
            {SvgLink}
            {copied ? "¡Enlace copiado!" : "Copiar enlace"}
          </button>
          <button className="fav" onClick={exportMd}>
            {SvgDownload}
            Exportar
          </button>
          <button className="fav" onClick={printFicha}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9V3h12v6" />
              <path d="M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
              <path d="M6 14h12v7H6z" />
            </svg>
            Imprimir
          </button>
          {!hideReadingButton && (
            <button className="fav" onClick={onOpenReading}>
              {SvgExpand}
              Modo lectura
            </button>
          )}
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
          <section className="sec" id={secId("sec-mecanismo")}>
            <h2>Mecanismo de acción</h2>
            {drug.mechanism.trim() ? (
              <p>
                <HighlightAll text={drug.mechanism} query={highlight} />
              </p>
            ) : (
              <p className="no-data">No consta en la ficha.</p>
            )}
          </section>

          <section className="sec" id={secId("sec-indicaciones")}>
            <h2>Indicaciones</h2>
            {drug.indications.length === 0 ? (
              <p className="no-data">No consta en la ficha.</p>
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

          <section className="sec" id={secId("sec-dosis")}>
            <h2>Dosis habitual</h2>
            {drug.dose.trim() ? (
              <div className="dose">
                <HighlightAll text={drug.dose} query={highlight} />
              </div>
            ) : (
              <p className="no-data">No consta en la ficha.</p>
            )}
          </section>

          <section className="sec" id={secId("sec-efectos")}>
            <h2>Efectos adversos</h2>
            {drug.adverse.length === 0 ? (
              <p className="no-data">No consta en la ficha.</p>
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

          <section className="sec" id={secId("sec-contraindicaciones")}>
            <h2>Contraindicaciones y precauciones</h2>
            {drug.contraindications.length === 0 ? (
              <p className="no-data">No consta en la ficha.</p>
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

          <section className="sec" id={secId("sec-interacciones")}>
            <h2>Interacciones</h2>
            {drug.interactions.length === 0 ? (
              <p className="no-data">No consta en la ficha.</p>
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

          <section className="sec" id={secId("sec-relacionados")}>
            <h2>Fármacos relacionados</h2>
            {drug.relatedDrugs.length === 0 ? (
              <p className="no-data">No consta en la ficha.</p>
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

          <section className="sec" id={secId("sec-patologias")}>
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

          <section className="sec" id={secId("sec-organos")}>
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

        {!readingMode && (
          <aside className="sec-index">
            <p className="lbl">En esta ficha</p>
            <div className="sec-progress" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
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
        )}
      </div>

      {(prevDrug || nextDrug) && (
        <nav className="ficha-pager" aria-label="Fichas de la misma familia">
          {prevDrug ? (
            <button className="pager-card prev" onClick={() => onOpen(prevDrug.id)}>
              <span className="pager-dir">← Anterior</span>
              <b>{prevDrug.name}</b>
              <small>{familyOf(prevDrug).short}</small>
            </button>
          ) : (
            <span />
          )}
          {nextDrug ? (
            <button className="pager-card next" onClick={() => onOpen(nextDrug.id)}>
              <span className="pager-dir">Siguiente →</span>
              <b>{nextDrug.name}</b>
              <small>{familyOf(nextDrug).short}</small>
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
