import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { shortAddress } from "../lib/format";

/** Google sign-in button, or the signed-in email + embedded wallet address. */
export default function LoginChip() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { address } = useAccount();

  if (!ready) return null;

  if (!authenticated) {
    return (
      <button onClick={login} className="h-9 rounded-[14px] bg-gold px-3 text-xs font-bold text-dark">
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-right">
      <div className="leading-tight">
        <p className="max-w-[140px] truncate text-xs font-semibold text-dark">{user?.google?.email ?? "Signed in"}</p>
        <p className="text-[11px] text-muted">{address ? shortAddress(address) : "Creating wallet…"}</p>
      </div>
      <button onClick={logout} className="h-9 rounded-[14px] border border-line px-2.5 text-xs font-semibold text-dark">
        Logout
      </button>
    </div>
  );
}
