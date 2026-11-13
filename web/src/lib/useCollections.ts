import { useReadContract, useReadContracts } from "wagmi";
import { vault } from "./contracts";

export type CollectionSummary = {
  id: bigint;
  name: string;
  amountPerMember: bigint;
  status: number;
  deadline: bigint;
  totalCollected: bigint;
  totalSpent: bigint;
  paid?: boolean;
};

/** Every collection (fee) on the vault, plus whether `member` paid each one when given. */
export function useCollections(member?: `0x${string}`) {
  const count = useReadContract({ ...vault, functionName: "collectionCount" });
  const ids = Array.from({ length: Number(count.data ?? 0n) }, (_, i) => BigInt(i));
  const rows = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...vault, functionName: "getCollection" as const, args: [id] as const },
      { ...vault, functionName: "hasPaid" as const, args: [id, member ?? "0x0000000000000000000000000000000000000000"] as const },
    ]),
    query: { enabled: ids.length > 0 },
  });

  const collections: CollectionSummary[] = ids.flatMap((id, i) => {
    const c = rows.data?.[i * 2]?.result as Omit<CollectionSummary, "id" | "paid"> | undefined;
    if (!c) return [];
    const paid = member ? (rows.data?.[i * 2 + 1]?.result as boolean | undefined) : undefined;
    const { name, amountPerMember, status, deadline, totalCollected, totalSpent } = c;
    return [{ id, name, amountPerMember, status, deadline, totalCollected, totalSpent, paid }];
  });
  // count first: a new fee changes the list of ids, and the rows query follows it
  return { collections, isLoading: count.isLoading || rows.isLoading, refetch: () => count.refetch().then(() => rows.refetch()) };
}
