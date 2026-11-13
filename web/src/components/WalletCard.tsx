import { useBalance, useReadContract } from "wagmi";
import { CHAIN_ID } from "../config";
import { token } from "../lib/contracts";
import { peso, shortAddress } from "../lib/format";
import { MIN_GAS } from "../lib/useOnboarding";
import { Card, Chip, Eyebrow, ExplorerLink } from "./ui";

const REFRESH_MS = 4000;

/** What is left in the member's wallet: test pesos, gas status, and a warning if the next fee will not fit. */
export default function WalletCard({ address, nextDue }: { address: `0x${string}`; nextDue?: { name: string; amount: bigint } }) {
  const tphp = useReadContract({ ...token, functionName: "balanceOf", args: [address], query: { refetchInterval: REFRESH_MS } });
  const gas = useBalance({ address, chainId: CHAIN_ID, query: { refetchInterval: REFRESH_MS } });

  const balance = tphp.data;
  const short = balance !== undefined && nextDue && balance < nextDue.amount;
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>My wallet</Eyebrow>
        {gas.data && <Chip tone={gas.data.value >= MIN_GAS ? "green" : "gold"}>{gas.data.value >= MIN_GAS ? "Gas ready" : "Gas low"}</Chip>}
      </div>
      <p className="font-display text-3xl font-bold tabular-nums text-dark">
        {balance === undefined ? (tphp.isError ? "Could not load" : "…") : peso(balance)}
        <span className="ml-1.5 text-sm font-semibold text-muted">tPHP</span>
      </p>
      {short && (
        <p className="rounded-xl bg-goldbg px-3 py-2 text-xs font-semibold text-[#6b5200]">
          Not enough for {nextDue.name} ({peso(nextDue.amount)}).
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
        <span className="font-mono">{shortAddress(address)}</span>
        <ExplorerLink path={`address/${address}`}>BscScan</ExplorerLink>
      </div>
    </Card>
  );
}
