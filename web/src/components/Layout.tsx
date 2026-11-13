import type { ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { DEMO_COLLECTION_ID } from "../config";
import { useRoles } from "../lib/useRoles";
import LoginChip from "./LoginChip";

/** Page shell. Phone: header, content, optional sticky action, bottom nav. Laptop (lg): top nav; `wide` pages use the full width. */
export default function Layout({ title, subtitle, children, footnote, bottom, wide }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footnote?: string;
  /** Sticky action shown just above the bottom nav (e.g. the Pay button). */
  bottom?: ReactNode;
  /** Laptop only: let the page use up to 72rem (two-column pages). Others stay phone-width, centered. */
  wide?: boolean;
}) {
  const roles = useRoles();
  const current = useSection();
  const tabs = TABS.filter((t) => !t.only || (t.only === "officer" ? roles.isTreasurer || roles.isAdviser : roles.isAdmin));
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-cream lg:max-w-6xl">
      <header className="flex flex-col gap-3 px-5 pb-4 pt-6 lg:flex-row lg:items-center lg:gap-8 lg:px-8">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="AmbagPay home"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold font-display text-lg font-bold text-dark"
          >
            A
          </Link>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold leading-tight text-dark">{title}</p>
            {subtitle && <p className="truncate text-xs font-medium text-muted">{subtitle}</p>}
          </div>
        </div>
        <nav aria-label="Main" className="hidden rounded-full bg-sand p-1 lg:flex lg:gap-1">
          {tabs.map((t) => (
            <NavLink
              key={t.label}
              to={t.to}
              className={() =>
                `rounded-full px-3.5 py-1.5 text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-green ${section(t.to) === current ? "bg-paper text-dark shadow-card" : "text-muted hover:text-dark"}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="lg:ml-auto lg:min-w-0">
          <LoginChip />
        </div>
      </header>

      <main className={`mx-auto flex w-full flex-1 flex-col gap-3.5 px-5 lg:px-8 ${wide ? "" : "lg:max-w-md lg:px-5"} ${bottom ? "pb-44" : "pb-24 lg:pb-10"}`}>
        {children}
        {footnote && <p className="py-3 text-center text-xs text-muted">{footnote}</p>}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md">
        {bottom && <div className="bg-gradient-to-t from-cream from-70% to-transparent px-5 pb-3 pt-6">{bottom}</div>}
        <div className="lg:hidden">
          <BottomNav tabs={tabs} />
        </div>
      </div>
    </div>
  );
}

type Tab = { to: string; label: string; icon: string; only?: "officer" | "admin" };

// Records shows for treasurer/adviser, Admin for ADMIN_ROLE (read on-chain).
const TABS: Tab[] = [
  { to: `/pay/${DEMO_COLLECTION_ID}`, label: "Pay", icon: "M3 7h18v10H3zM3 11h18M7 15h3" },
  { to: "/payments", label: "My payments", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" },
  { to: `/ledger/${DEMO_COLLECTION_ID}`, label: "Ledger", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { to: "/officer", label: "Officer", icon: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2 2 4-4" },
  { to: "/records", label: "Records", icon: "M4 5h16M4 10h16M4 15h10M4 20h7M17 15l2 2 3-4", only: "officer" },
  { to: "/admin", label: "Admin", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1", only: "admin" },
];

/** Active by section, so /pay/1 still lights the Pay tab (its link is /pay/0). */
function useSection() {
  return "/" + useLocation().pathname.split("/")[1];
}
const section = (to: string) => "/" + to.split("/")[1];

function BottomNav({ tabs }: { tabs: Tab[] }) {
  const current = useSection();
  return (
    <nav aria-label="Main" className="flex border-t border-line bg-paper pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <NavLink
          key={t.label}
          to={t.to}
          className={() =>
            `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold outline-none focus-visible:bg-greenbg ${
              section(t.to) === current ? "text-green" : "text-muted"
            }`
          }
        >
          {() => (
            <>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              <span className="max-w-full truncate px-0.5 text-[11px]">{t.label}</span>
              <span className={`h-0.5 w-6 rounded ${section(t.to) === current ? "bg-green" : "bg-transparent"}`} aria-hidden="true" />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
