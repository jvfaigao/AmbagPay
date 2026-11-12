import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Phone-width page shell with the AmbagPay top bar. */
export default function Layout({ title, subtitle, children, footnote }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footnote?: string;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-cream">
      <header className="flex items-center gap-3 px-5 pb-4 pt-6">
        <Link
          to="/"
          aria-label="AmbagPay home"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold font-display text-lg font-bold text-dark"
        >
          A
        </Link>
        <div>
          <p className="font-display text-lg font-bold leading-tight text-dark">{title}</p>
          {subtitle && <p className="text-xs font-medium text-muted">{subtitle}</p>}
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-3.5 px-5">{children}</main>
      {footnote && <p className="px-5 py-5 text-center text-xs text-muted">{footnote}</p>}
    </div>
  );
}
