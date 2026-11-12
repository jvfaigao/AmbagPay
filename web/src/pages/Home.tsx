import { Link } from "react-router-dom";
import { DEMO_COLLECTION_ID, ORG_NAME } from "../config";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between bg-dark px-6 py-10 text-cream">
      <p className="text-xs font-semibold uppercase tracking-[2px] text-gold">{ORG_NAME}</p>

      <div>
        <h1 className="font-display text-6xl font-bold leading-none">AmbagPay</h1>
        <p className="mt-3 font-display text-2xl font-medium text-gold">Every peso, accounted for.</p>
        <p className="mt-4 text-[15px] leading-relaxed text-[#BFD3C9]">
          Transparent student contributions, guarded by an AI Treasurer Agent and enforced on BNB Smart Chain.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to={`/pay/${DEMO_COLLECTION_ID}`}
          className="flex h-14 items-center justify-center rounded-[14px] bg-gold text-base font-bold text-dark"
        >
          Pay your share
        </Link>
        <Link
          to={`/ledger/${DEMO_COLLECTION_ID}`}
          className="flex h-14 items-center justify-center rounded-[14px] border border-gold text-base font-bold text-gold"
        >
          View public ledger
        </Link>
        <Link to="/officer" className="text-center text-sm font-semibold text-[#BFD3C9] underline-offset-2 hover:underline">
          Officer login
        </Link>
      </div>
    </div>
  );
}
