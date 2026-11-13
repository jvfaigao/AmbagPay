import { useEffect, useRef, useState } from "react";
import { parseEther } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { useBalance } from "wagmi";
import { CHAIN_ID } from "../config";

const MIN_GAS = parseEther("0.0005"); // keep in sync with api/onboard.ts

/**
 * Once per page load: asks /api/onboard to top up gas (+ test pesos) and to remember this Google email → wallet
 * (officers match the class list with it). The server re-checks the chain, so a call with nothing to top up is cheap.
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
    const needsTopUp = !((tphp === null || tphp > 0n) && gas.data.value >= MIN_GAS);
    tried.current = true;
    if (!needsTopUp) {
      // Quiet call: only registers the email; no spinner, no error shown.
      getAccessToken()
        .then((token) => fetch("/api/onboard", { method: "POST", headers: { authorization: `Bearer ${token}` } }))
        .catch(() => undefined);
      return;
    }
    setOnboarding(true);
    getAccessToken()
      .then((token) => fetch("/api/onboard", { method: "POST", headers: { authorization: `Bearer ${token}` } }))
      .then(async (r) => {
        if (r.ok) return r.json();
        const reason = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`;
        throw new Error(`Could not set up your wallet (${reason}). Please try again later.`);
      })
      .then(() => Promise.all([refetchGas(), onDoneRef.current()]))
      .catch((e: Error) => setOnboardError(e.message))
      .finally(() => setOnboarding(false));
  }, [address, tphp, gas.data, refetchGas, getAccessToken]);

  return { onboarding, onboardError };
}
