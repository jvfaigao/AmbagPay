import { Link } from "react-router-dom";
import { DEMO_COLLECTION_ID, ORG_NAME } from "../config";

// The whole product in four steps. This is a real sequence, so it is numbered.
const STEPS = [
  { title: "Members pay", body: "Sign in with Google and pay ₱150 in one tap. No wallet app, no gas fee." },
  { title: "The AI checks every receipt", body: "The Treasurer Agent reads it, spots duplicates and hidden instructions, and rates the risk." },
  { title: "Officers approve", body: "The treasurer approves. Over ₱1,000 or HIGH risk, the adviser must approve too." },
  { title: "The contract pays, the ledger shows it", body: "Funds move only within each budget cap, and every peso appears on the public ledger." },
];

export default function Home() {
  return (
    // Full-bleed dark page. Phone: one column (hero, steps, buttons). Laptop: hero + buttons left, steps right.
    <div className="flex min-h-screen w-full bg-dark text-cream">
      <div className="mx-auto grid w-full max-w-md grid-cols-1 content-start px-6 py-10 lg:max-w-6xl lg:grid-cols-[1.1fr_1fr] lg:content-center lg:gap-x-20 lg:px-12">
      <div className="lg:col-start-1 lg:row-start-1">
        <p className="text-xs font-semibold uppercase tracking-[2px] text-gold">{ORG_NAME}</p>
        <h1 className="mt-12 font-display text-6xl font-bold leading-none lg:mt-8 lg:text-8xl">AmbagPay</h1>
        <p className="mt-3 font-display text-2xl font-medium text-gold lg:text-4xl">Every peso, accounted for.</p>
        <p className="mt-4 text-[15px] leading-relaxed text-soft lg:max-w-lg lg:text-lg">
          Transparent student contributions, guarded by an AI Treasurer Agent and enforced on BNB Smart Chain.
        </p>
      </div>

      <section aria-labelledby="how" className="my-10 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:my-0 lg:self-center lg:rounded-[24px] lg:bg-dark2 lg:p-8">
        <h2 id="how" className="font-display text-lg font-bold text-cream">How it works</h2>
        <ol className="mt-4 flex flex-col">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex gap-4 pb-5 last:pb-0">
              {i < STEPS.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-dark2 lg:bg-[#2c5446]" aria-hidden="true" />}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold font-display text-sm font-bold text-gold">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold text-cream">{s.title}</p>
                <p className="text-sm leading-relaxed text-soft">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-2 lg:mt-10 lg:max-w-md">
        <Link
          to={`/pay/${DEMO_COLLECTION_ID}`}
          className="flex h-14 items-center justify-center rounded-2xl bg-gold text-base font-bold text-dark"
        >
          Pay your share
        </Link>
        <Link
          to={`/ledger/${DEMO_COLLECTION_ID}`}
          className="flex h-14 items-center justify-center rounded-2xl border border-gold text-base font-bold text-gold"
        >
          View public ledger
        </Link>
        <Link to="/officer" className="text-center text-sm font-semibold text-soft underline-offset-2 hover:underline">
          Officer login
        </Link>
      </div>
      </div>
    </div>
  );
}
