import { useEffect, useRef, useState } from "react";
import { parseEther } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { useBalance } from "wagmi";
import { CHAIN_ID } from "../config";

const MIN_GAS = parseEther("0.002"); // keep in sync with api/onboard.ts

/**
 * First login: asks /api/onboard once to top up gas (+ test pesos). The server re-checks the chain.
 * `tphp` is the wallet's tPHP balance, or undefined while loading; pass null when the page does not need pesos.
 */
export function useOnboarding(address: `0x${string}` | undefined, tphp: bigint | null | undefined, onDone: () => unknown) {
  const { getAccessToken } = usePrivy();
  const gas = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: 4000 } });
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string>();
  const tried = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const refetchGas = gas.refetch;

  useEffect(() => {
    if (!address || tphp === undefined || gas.data === undefined || tried.current) return;
    if ((tphp === null || tphp > 0n) && gas.data.value >= MIN_GAS) return;
    tried.current = true;
    setOnboarding(true);
    getAccessToken()
      .then((token) => fetch("/api/onboard", { method: "POST", headers: { authorization: `Bearer ${token}` } }))
      .then(async (r) => {
        if (r.ok) return r.json();
        const reason = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`;
        throw new Error(`Hindi na-setup ang wallet (${reason}). Subukan ulit mamaya.`);
      })
      .then(() => Promise.all([refetchGas(), onDoneRef.current()]))
      .catch((e: Error) => setOnboardError(e.message))
      .finally(() => setOnboarding(false));
  }, [address, tphp, gas.data, refetchGas, getAccessToken]);

  return { onboarding, onboardError };
}
