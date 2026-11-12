import type { ReactNode } from "react";
import { EXPLORER_URL } from "../config";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-paper p-4 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-green">{children}</p>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded bg-[#E7E2D6]" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded bg-green" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Chip({ tone, children }: { tone: "green" | "risk" | "neutral"; children: ReactNode }) {
  const tones = {
    green: "bg-greenbg text-green",
    risk: "bg-riskbg text-risk",
    neutral: "bg-[#ECE8DC] text-dark",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

/** Link to the block explorer. Renders nothing on the local chain. */
export function ExplorerLink({ path, children }: { path: string; children: ReactNode }) {
  if (!EXPLORER_URL) return null;
  return (
    <a href={`${EXPLORER_URL}/${path}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-green underline-offset-2 hover:underline">
      {children} ↗
    </a>
  );
}

export function LoadingCard({ label = "Loading from BNB Smart Chain…" }: { label?: string }) {
  return <Card className="text-sm text-muted">{label}</Card>;
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-risk text-sm">
      <p className="font-semibold text-risk">Hindi ma-load ang data</p>
      <p className="mt-1 break-words text-muted">{message}</p>
    </Card>
  );
}
