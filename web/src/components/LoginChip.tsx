import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { shortAddress } from "../lib/format";

/** "Signed in with Google" pill + log out. Renders nothing when logged out: each page has its own sign-in action. */
export default function LoginChip() {
  const { ready, authenticated, user, logout } = usePrivy();
  const { address } = useAccount();
  if (!ready || !authenticated) return null;

  const email = user?.google?.email ?? "Google account";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 rounded-full bg-greenbg py-1 pl-1 pr-3 text-xs font-semibold text-green">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green text-[11px] font-bold uppercase text-white" aria-hidden="true">
          {email[0]}
        </span>
        <span className="truncate">
          Signed in · {email}
          {address && <span className="font-medium text-muted"> · {shortAddress(address)}</span>}
        </span>
      </span>
      <button onClick={logout} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-green">
        Log out
      </button>
    </div>
  );
}
