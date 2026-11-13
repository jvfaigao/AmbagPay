import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";

export type Student = { studentId: string; name: string; section: string; email: string; paid: boolean; loggedIn: boolean; address: `0x${string}` | null };
export type Roster = { uploadedAt: number | null; students: Student[]; notOnRoster: { email: string; address: `0x${string}` }[] };

/** Officers only: the class list of a fee with paid / not yet, from /api/roster. */
export function useRoster(collectionId: bigint) {
  const { getAccessToken } = usePrivy();
  return useQuery({
    queryKey: ["roster", collectionId.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/roster?collectionId=${collectionId}`, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data as Roster;
    },
    refetchInterval: 15_000,
    retry: false,
  });
}
