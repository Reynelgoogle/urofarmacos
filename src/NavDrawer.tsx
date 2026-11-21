// Cajón de navegación de UroFármacos (UN SOLO cajón para todos los
// tamaños, escritorio y móvil): el panel de navegación (Inicio,
// Favoritos, familias, órganos, patologías, Créditos) ya no es una
// sidebar fija: se abre con la hamburguesa de la topbar y el contenido
// principal ocupa todo el ancho cuando está cerrado.
//
// Patrón del MobileDrawer de UroCampus (portal a document.body,
// siempre montado para animar la salida, backdrop oscuro con blur,
// bloqueo del scroll de fondo, cierre al navegar), con las mejoras de
// accesibilidad de su ReadingMode (y del ReadingMode de UroFármacos):
// Escape, role="dialog" + aria-modal, foco al botón ✕ al abrir y
// devuelto al botón que lo abrió al cerrar, aria-expanded en la
// hamburguesa. En Vite no hace falta la guarda anti-hidratación SSR
// de UroCampus (useSyncExternalStore), se simplifica.
// El cierre al navegar lo hacen los callbacks de navegación de App
// (todos ponen setDrawer(false)) y su listener de hashchange.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function NavDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const prevFocus = useRef<Element | null>(null);

  // Bloqueo del scroll de la página de fondo mientras está abierto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Cerrar con la tecla Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Foco: al abrir se guarda el elemento activo y se mueve el foco al
  // botón ✕ del cajón; al cerrar se devuelve al que lo tenía
  // (normalmente la hamburguesa de la topbar).
  useEffect(() => {
    if (open) {
      prevFocus.current = document.activeElement;
      closeRef.current?.focus();
    } else if (prevFocus.current instanceof HTMLElement) {
      prevFocus.current.focus();
      prevFocus.current = null;
    }
  }, [open]);

  // Trampa de foco mientras el cajón está abierto: Tab recorre solo sus
  // controles y no se escapa al contenido del fondo (teclado en escritorio).
  const trapFocus = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Tab") return;
    const root = panelRef.current;
    if (!root) return;
    const focusables = root.querySelectorAll<HTMLElement>(
      'button, input, select, a[href], [tabindex]:not([tabindex="-1"])'
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

  return createPortal(
    <div
      id="nav-drawer"
      className={`nav-drawer${open ? " open" : ""}`}
      aria-hidden={!open}
    >
      <div
        className="nav-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="nav-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Índice de navegación"
        ref={panelRef}
        onKeyDown={trapFocus}
      >
        <div className="nav-drawer-head">
          <span className="nav-drawer-brand">
            <img
              src={`${import.meta.env.BASE_URL}icon-512.png`}
              alt="UroFármacos"
              className="nav-drawer-logo"
            />
            <span>Índice</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            className="nav-drawer-close"
            onClick={onClose}
            aria-label="Cerrar menú"
            title="Cerrar (Esc)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className="nav-drawer-nav" aria-label="Navegación principal">
          {children}
        </nav>
      </aside>
    </div>,
    document.body
  );
}
