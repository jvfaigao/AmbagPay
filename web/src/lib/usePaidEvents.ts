import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, parseAbiItem } from "viem";
import { chain, LOGS_RPC_URL, VAULT_ADDRESS, VAULT_FROM_BLOCK } from "../config";

export type Payment = { collectionId: bigint; member: `0x${string}`; amount: bigint; txHash: `0x${string}`; timestamp: number };

const logsClient = createPublicClient({ chain, transport: http(LOGS_RPC_URL) });
const PAID = parseAbiItem("event Paid(uint256 indexed collectionId, address indexed member, uint256 amount)");
const CHUNK = 50_000n; // publicnode's limit per eth_getLogs call

/**
 * Every `Paid` event of the vault, newest first, filtered by member or by fee.
 * Read from the chain, so date + tx need no database. On failure the caller shows "Recorded on-chain".
 */
export function usePaidEvents(filter: { member?: `0x${string}`; collectionId?: bigint }, enabled = true) {
  return useQuery({
    queryKey: ["paid", filter.member ?? "", filter.collectionId?.toString() ?? ""],
    enabled,
    staleTime: 15_000,
    retry: 1,
    queryFn: async (): Promise<Payment[]> => {
      const head = await logsClient.getBlockNumber();
      const ranges: [bigint, bigint][] = [];
      for (let from = VAULT_FROM_BLOCK; from <= head; from += CHUNK) ranges.push([from, from + CHUNK - 1n > head ? head : from + CHUNK - 1n]);
      const chunks = await Promise.all(
        ranges.map(([fromBlock, toBlock]) =>
          logsClient.getLogs({ address: VAULT_ADDRESS, event: PAID, args: { member: filter.member, collectionId: filter.collectionId }, fromBlock, toBlock }),
        ),
      );
      const logs = chunks.flat();
      const blocks = [...new Set(logs.map((l) => l.blockNumber))];
      const times = new Map(
        await Promise.all(blocks.map(async (n) => [n, Number((await logsClient.getBlock({ blockNumber: n })).timestamp)] as const)),
      );
      return logs
        .map((l) => ({
          collectionId: l.args.collectionId!,
          member: l.args.member!,
          amount: l.args.amount!,
          txHash: l.transactionHash,
          timestamp: times.get(l.blockNumber) ?? 0,
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
    },
  });
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
