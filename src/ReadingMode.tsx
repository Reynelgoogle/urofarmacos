// Modo lectura de UroFármacos: la ficha a pantalla completa, fondo
// BLANCO (decisión de Rey para leer), una sola columna, con control
// del tamaño de letra. Patrón tomado de UroCampus ReadingMode.tsx,
// adaptado a Vite (sin "use client", con createPortal de react-dom).
// La variable --tam-letra se pone EN EL CONTENEDOR del overlay, no
// en :root, y de ella derivan .sec p, .sec li, .dose y .laguna (con
// su tamaño actual como fallback, así la ficha normal no cambia).
// jsdom no implementa requestFullscreen ni IntersectionObserver:
// todo va con try/catch y optional chaining y se degrada sin errores.
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { DrugView } from "./App";
import type { Drug } from "./data/drugs";

const KEY = "uf:letra";
const DEFAULT_SIZE = 13.5;
const MIN = 11;
const MAX = 21;
const STEP = 1;

function clamp(v: number): number {
  return Math.min(MAX, Math.max(MIN, v));
}

function loadSize(): number {
  try {
    const raw = parseFloat(localStorage.getItem(KEY) ?? "");
    if (!Number.isNaN(raw)) return clamp(raw);
  } catch {
    // Sin almacenamiento: tamaño por defecto.
  }
  return DEFAULT_SIZE;
}

export default function ReadingMode({
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
  onClose,
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
  onClose: () => void;
}) {
  const [size, setSize] = useState(loadSize);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Bloquear el scroll de la página de fondo.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Pantalla completa real cuando el navegador/WebView lo permite;
    // el WebView viejo puede no soportarlo: el overlay fijo ya cubre
    // toda la pantalla, así que el fallo se ignora en silencio.
    try {
      const el = document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      };
      el.requestFullscreen?.()?.catch?.(() => {});
    } catch {
      // No soportado: nada que hacer.
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      try {
        if (document.fullscreenElement) {
          const d = document as Document & {
            exitFullscreen?: () => Promise<void>;
          };
          d.exitFullscreen?.()?.catch?.(() => {});
        }
      } catch {
        // No soportado: nada que hacer.
      }
    };
  }, []);

  // Cerrar con la tecla Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const change = (delta: number) => {
    setSize((prev) => {
      const next = clamp(prev + delta);
      try {
        localStorage.setItem(KEY, String(next));
      } catch {
        // Sin almacenamiento: el tamaño solo vive en esta sesión.
      }
      return next;
    });
  };

  const reset = () => {
    setSize(DEFAULT_SIZE);
    try {
      localStorage.setItem(KEY, String(DEFAULT_SIZE));
    } catch {
      // Sin almacenamiento.
    }
  };

  if (!mounted) return null;
  const pct = Math.round((size / DEFAULT_SIZE) * 100);

  // Navegar desde dentro del overlay cierra primero el modo lectura
  // y después abre la vista pedida en la app de fondo.
  const closeAnd =
    <T extends unknown[]>(fn: (...args: T) => void) =>
    (...args: T) => {
      onClose();
      fn(...args);
    };

  return createPortal(
    <div
      className="reading-mode"
      style={{ "--tam-letra": `${size}px` } as CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label={`Modo lectura: ${drug.name}`}
    >
      <div className="reading-bar">
        <button
          type="button"
          className="reading-close"
          onClick={onClose}
          aria-label="Salir del modo lectura"
          title="Salir (Esc)"
        >
          ✕
        </button>
        <p className="reading-title">
          Modo lectura · <span>{drug.name}</span>
        </p>
        <div className="reading-zoom" role="group" aria-label="Tamaño de letra">
          <button
            type="button"
            onClick={() => change(-STEP)}
            disabled={size <= MIN}
            aria-label="Reducir letra"
          >
            A−
          </button>
          <button
            type="button"
            onClick={reset}
            className="reading-pct"
            aria-label="Tamaño normal"
            title="Tocar para tamaño normal"
          >
            {pct}%
          </button>
          <button
            type="button"
            onClick={() => change(STEP)}
            disabled={size >= MAX}
            aria-label="Aumentar letra"
          >
            A+
          </button>
        </div>
      </div>

      <div className="reading-scroll">
        <div className="reading-content">
          <DrugView
            drug={drug}
            highlight={highlight}
            fav={fav}
            onToggleFav={onToggleFav}
            onHome={closeAnd(onHome)}
            onOpenFamily={closeAnd(onOpenFamily)}
            onOpen={closeAnd(onOpen)}
            onSearch={closeAnd(onSearch)}
            onOpenOrgan={closeAnd(onOpenOrgan)}
            onOpenCondition={closeAnd(onOpenCondition)}
            hideReadingButton
            readingMode
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
