// Paleta de comandos (⌘/Ctrl + K): búsqueda difusa de fármacos,
// familias, patologías y órganos + acciones rápidas. Es el acceso
// "de power user" a toda la app sin levantar las manos del teclado.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  conditions,
  drugs,
  families,
  familyOf,
  organs,
  type Drug,
} from "./data/drugs";
import { haystack } from "./drugMeta";
import { Highlight, normalize } from "./text";

type Group = "Acciones" | "Recientes" | "Fármacos" | "Familias" | "Patologías" | "Órganos";

type Item = {
  key: string;
  group: Group;
  label: string;
  sub?: string;
  badge?: string;
  accent?: string;
  glyph?: string;
  score?: number;
  run: () => void;
};

function scoreFor(label: string, sub: string, q: string): number {
  const nl = normalize(label);
  const ns = normalize(sub);
  if (nl === q) return 120;
  if (nl.startsWith(q)) return 100;
  if (nl.split(/[\s/().,;:-]+/).some((t) => t.startsWith(q))) return 85;
  if (nl.includes(q)) return 70;
  if (ns.includes(q)) return 35;
  return -1;
}

export default function CommandPalette({
  open,
  onClose,
  recent,
  onHome,
  onFavorites,
  onCredits,
  onIndex,
  onCompare,
  onRandom,
  onOpenDrug,
  onOpenFamily,
  onOpenOrgan,
  onOpenCondition,
}: {
  open: boolean;
  onClose: () => void;
  recent: string[];
  onHome: () => void;
  onFavorites: () => void;
  onCredits: () => void;
  onIndex: () => void;
  onCompare: () => void;
  onRandom: () => void;
  onOpenDrug: (id: string) => void;
  onOpenFamily: (id: string) => void;
  onOpenOrgan: (name: string) => void;
  onOpenCondition: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Al abrir: foco en el buscador, estado limpio y scroll de fondo bloqueado.
  // Al cerrar se devuelve el foco a quien abrió la paleta (buscador o
  // botón ⌘): imprescindible para navegar solo con teclado en escritorio.
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement;
    setQuery("");
    setActive(0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
      if (prevFocus.current instanceof HTMLElement) {
        prevFocus.current.focus();
        prevFocus.current = null;
      }
    };
  }, [open]);

  // Escape cierra la paleta. Se captura antes que el resto de atajos.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = useMemo<Item[]>(() => {
    const q = normalize(query.trim());
    const recentDrugs = recent
      .map((id) => drugs.find((d) => d.id === id))
      .filter((d): d is Drug => !!d);

    const actions: Item[] = [
      {
        key: "act-index",
        group: "Acciones",
        label: "Índice alfabético completo",
        sub: "Las 103 fichas, de la A a la Z",
        glyph: "AZ",
        score: scoreFor("Índice alfabético completo", "todas las fichas A-Z", q),
        run: onIndex,
      },
      {
        key: "act-compare",
        group: "Acciones",
        label: "Comparar fármacos",
        sub: "Hasta 3 fichas en paralelo",
        glyph: "⇄",
        score: scoreFor("Comparar fármacos", "comparador paralelo", q),
        run: onCompare,
      },
      {
        key: "act-random",
        group: "Acciones",
        label: "Fármaco al azar",
        sub: "Descubrir una ficha nueva",
        glyph: "⚄",
        score: scoreFor("Fármaco al azar", "aleatorio random", q),
        run: onRandom,
      },
      {
        key: "act-favs",
        group: "Acciones",
        label: "Favoritos",
        sub: "Tus fichas guardadas en este dispositivo",
        glyph: "★",
        score: scoreFor("Favoritos", "fichas guardadas", q),
        run: onFavorites,
      },
      {
        key: "act-home",
        group: "Acciones",
        label: "Inicio",
        sub: "Familias, órganos y patologías",
        glyph: "⌂",
        score: scoreFor("Inicio", "portada hogar", q),
        run: onHome,
      },
      {
        key: "act-credits",
        group: "Acciones",
        label: "Créditos",
        sub: "Autoría y fuentes",
        glyph: "ℹ",
        score: scoreFor("Créditos", "autor fuentes", q),
        run: onCredits,
      },
    ];

    const drugItems: Item[] = drugs.map((d) => {
      const fam = familyOf(d);
      return {
        key: `drug-${d.id}`,
        group: "Fármacos" as const,
        label: d.name,
        sub: `${fam.short}${d.commercial ? ` · ${d.commercial}` : ""}`,
        badge: fam.short,
        accent: fam.accent,
        glyph: d.name.slice(0, 2).toUpperCase(),
        score: scoreFor(`${d.name} ${d.commercial}`, `${fam.name} ${fam.short} ${haystack(d)}`, q),
        run: () => onOpenDrug(d.id),
      };
    });

    const familyItems: Item[] = families.map((f) => ({
      key: `fam-${f.id}`,
      group: "Familias" as const,
      label: f.name,
      sub: `${drugs.filter((d) => d.familyId === f.id).length} fichas · ${f.description}`,
      accent: f.accent,
      glyph: f.icon,
      score: scoreFor(`${f.name} ${f.short}`, f.description, q),
      run: () => onOpenFamily(f.id),
    }));

    const conditionItems: Item[] = conditions.map((c) => ({
      key: `cond-${c}`,
      group: "Patologías" as const,
      label: c,
      sub: `${drugs.filter((d) => d.conditions.includes(c)).length} fármacos`,
      glyph: "◇",
      score: scoreFor(c, "", q),
      run: () => onOpenCondition(c),
    }));

    const organItems: Item[] = organs.map((o) => ({
      key: `organ-${o}`,
      group: "Órganos" as const,
      label: o,
      sub: `${drugs.filter((d) => d.organs.includes(o)).length} fármacos`,
      glyph: "◉",
      score: scoreFor(o, "", q),
      run: () => onOpenOrgan(o),
    }));

    if (!q) {
      const recentItems: Item[] = recentDrugs.slice(0, 5).map((d) => {
        const fam = familyOf(d);
        return {
          key: `recent-${d.id}`,
          group: "Recientes" as const,
          label: d.name,
          sub: `${fam.short}${d.commercial ? ` · ${d.commercial}` : ""}`,
          badge: "Reciente",
          accent: fam.accent,
          glyph: d.name.slice(0, 2).toUpperCase(),
          run: () => onOpenDrug(d.id),
        };
      });
      return [
        ...actions.slice(0, 4),
        ...recentItems,
        ...familyItems,
        ...actions.slice(4),
      ];
    }

    const rank = (a: Item, b: Item) =>
      (b.score ?? -1) - (a.score ?? -1) || a.label.localeCompare(b.label, "es");
    const filtered = (list: Item[], max: number) =>
      list
        .filter((i) => (i.score ?? -1) >= 0)
        .sort(rank)
        .slice(0, max);

    return [
      ...filtered(actions, 5),
      ...filtered(drugItems, 9),
      ...filtered(familyItems, 4),
      ...filtered(conditionItems, 6),
      ...filtered(organItems, 4),
    ];
  }, [
    query,
    recent,
    onIndex,
    onCompare,
    onRandom,
    onFavorites,
    onHome,
    onCredits,
    onOpenDrug,
    onOpenFamily,
    onOpenOrgan,
    onOpenCondition,
  ]);

  // Mantén el elemento activo dentro de la vista y sincroniza el índice
  // cuando cambia la lista.
  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const item = items[active];
    if (!item) return;
    const el = optionRefs.current[item.key];
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active, items, open]);

  if (!open) return null;

  const choose = (item: Item) => {
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) choose(item);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, items.length - 1));
    }
  };

  // Trampa de foco: Tab no debe escapar al contenido del fondo mientras
  // el diálogo modal está abierto (WebView de escritorio y móvil).
  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'input, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Agrupa respetando el orden de aparición para pintar separadores.
  const groups: { name: Group; items: (Item & { index: number })[] }[] = [];
  items.forEach((item, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push({ ...item, index });
    else groups.push({ name: item.group, items: [{ ...item, index }] });
  });

  return createPortal(
    <div className="cp-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="cp-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        ref={panelRef}
        onKeyDown={trapFocus}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-logo" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar fármacos, patologías, órganos o comandos…"
            aria-label="Buscar en la paleta de comandos"
            aria-controls="cp-list"
            aria-activedescendant={items[active] ? `cp-option-${items[active].key}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="cp-esc" onClick={onClose} aria-label="Cerrar paleta">
            Esc
          </button>
        </div>

        <div className="cp-list" id="cp-list" role="listbox" ref={listRef}>
          {items.length === 0 ? (
            <div className="cp-empty">
              <b>Sin coincidencias</b>
              <span>Prueba con un fármaco, una familia, una patología o un órgano.</span>
            </div>
          ) : (
            groups.map((group) => (
              <div className="cp-group" key={group.name} role="group" aria-label={group.name}>
                <p className="cp-group-label">{group.name}</p>
                {group.items.map((item) => {
                  const selected = item.index === active;
                  return (
                    <button
                      key={item.key}
                      id={`cp-option-${item.key}`}
                      ref={(el) => {
                        optionRefs.current[item.key] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`cp-row${selected ? " on" : ""}`}
                      onMouseEnter={() => setActive(item.index)}
                      onClick={() => choose(item)}
                      style={
                        item.accent
                          ? ({ "--cp-acc": item.accent } as React.CSSProperties)
                          : undefined
                      }
                    >
                      <span className="cp-glyph" aria-hidden="true">
                        {item.glyph}
                      </span>
                      <span className="cp-main">
                        <b>
                          <Highlight text={item.label} query={query} />
                        </b>
                        {item.sub && <span>{item.sub}</span>}
                      </span>
                      {item.badge && <span className="cp-badge">{item.badge}</span>}
                      <span className="cp-enter" aria-hidden="true">
                        ↵
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="cp-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>↵</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
          <span className="cp-foot-brand">
            <b>UroFármacos</b> · índice inteligente
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
