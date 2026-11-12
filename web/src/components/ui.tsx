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

export function ErrorCard({ message, title = "Hindi ma-load ang data" }: { message: string; title?: string }) {
  return (
    <Card className="border-risk text-sm">
      <p className="font-semibold text-risk">{title}</p>
      <p className="mt-1 break-words text-muted">{message}</p>
    </Card>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <span className="font-semibold text-dark">{value}</span>
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
