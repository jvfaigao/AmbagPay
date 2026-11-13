import type { ReactNode } from "react";
import { EXPLORER_URL } from "../config";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] bg-paper p-4.5 shadow-card ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[13px] font-semibold text-muted">{children}</p>;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sand" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-green transition-[width] duration-400 motion-reduce:transition-none" style={{ width: `${value}%` }} />
    </div>
  );
}

export function Chip({ tone, children }: { tone: "green" | "risk" | "neutral" | "gold"; children: ReactNode }) {
  const tones = {
    green: "bg-greenbg text-green",
    risk: "bg-riskbg text-risk",
    neutral: "bg-sand text-body",
    gold: "bg-goldbg text-[#6b5200]",
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

export function ErrorCard({ message, title = "Could not load the data" }: { message: string; title?: string }) {
  return (
    <Card className="bg-riskbg text-sm shadow-none">
      <p className="font-semibold text-risk">{title}</p>
      <p className="mt-1 break-words text-risk">{message}</p>
    </Card>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="text-right font-semibold tabular-nums text-dark">{value}</span>
    </div>
  );
}

type StepState = "done" | "waiting" | "rejected" | "todo";

/** Where an expense is in the approval process: Proposed → Treasurer → (Adviser) → Paid. Icon + text, never color only. */
export function ExpenseSteps({ status, treasurer, adviser, needsAdviser }: { status: number; treasurer: boolean; adviser: boolean; needsAdviser: boolean }) {
  const executed = status === 1;
  const rejected = status === 2;
  const steps: { label: string; done: boolean }[] = [
    { label: "Proposed", done: true },
    { label: "Treasurer", done: treasurer || executed },
    ...(needsAdviser ? [{ label: "Adviser", done: adviser || executed }] : []),
    { label: rejected ? "Rejected" : "Paid", done: executed },
  ];
  let waitingShown = false;
  const states: StepState[] = steps.map((st, i) => {
    if (rejected && i === steps.length - 1) return "rejected";
    if (st.done) return "done";
    if (!rejected && !waitingShown) return (waitingShown = true), "waiting";
    return "todo";
  });

  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" aria-label="Approval steps">
      {steps.map((st, i) => (
        <li key={st.label} className="flex items-center gap-1.5">
          {i > 0 && <span className="h-px w-3 bg-line" aria-hidden="true" />}
          <StepDot state={states[i]} />
          <span className={states[i] === "todo" ? "text-muted" : states[i] === "rejected" ? "font-semibold text-risk" : "font-semibold text-dark"}>
            {st.label}
            {states[i] === "waiting" && <span className="font-normal text-muted"> (waiting)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StepDot({ state }: { state: StepState }) {
  if (state === "done") return <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green text-[10px] text-white" aria-hidden="true">✓</span>;
  if (state === "rejected") return <span className="flex h-4 w-4 items-center justify-center rounded-full bg-risk text-[10px] text-white" aria-hidden="true">✕</span>;
  if (state === "waiting") return <span className="h-4 w-4 rounded-full border-2 border-gold bg-paper" aria-hidden="true" />;
  return <span className="h-4 w-4 rounded-full border-2 border-line" aria-hidden="true" />;
}

/** One white surface for a row of numbers, not a box per number. */
export function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-x-4 gap-y-3 rounded-[20px] bg-paper px-[18px] py-4 shadow-card">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="text-xs text-muted">{it.label}</p>
          <p className="truncate font-display text-[19px] font-bold tabular-nums text-dark sm:text-[22px]">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Pill segmented control (tabs). */
export function Tabs<T extends string>({ value, options, onChange, label, className = "" }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 rounded-full bg-sand p-1 text-sm font-semibold ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-full px-2.5 py-2 focus-visible:outline-2 focus-visible:outline-green ${
            value === o.value ? "bg-paper text-dark shadow-[0_1px_3px_rgba(16,38,31,.12)]" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
