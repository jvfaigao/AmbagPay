// /api/roster — class list per collection, officers only (personal data: names, student ids, emails).
//   POST { collectionId, csv }  (treasurer)          → save the list
//   GET  ?collectionId=N        (treasurer/adviser)  → every student + paid/not yet, matched by Google email → wallet → hasPaid
import { keccak256, toBytes } from "viem";
import { ambagVaultAbi } from "../src/abi/AmbagVault.js";
import { callerWallet } from "./_lib/auth.js";
import { CHAIN_ID, publicClient, VAULT_ADDRESS } from "./_lib/chain.js";
import { members, rosters } from "./_lib/firebase.js";
import { parseRoster, type Student } from "./_lib/roster.js";

const TREASURER_ROLE = keccak256(toBytes("TREASURER_ROLE"));
const ADVISER_ROLE = keccak256(toBytes("ADVISER_ROLE"));
const MAX_CSV_CHARS = 512 * 1024;
const vault = { address: VAULT_ADDRESS, abi: ambagVaultAbi } as const;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request: Request) {
    const caller = await callerWallet(request);
    if (!caller) return json({ error: "Mag-login muna." }, 401);

    try {
      const [isTreasurer, isAdviser] = await Promise.all([
        publicClient.readContract({ ...vault, functionName: "hasRole", args: [TREASURER_ROLE, caller] }),
        publicClient.readContract({ ...vault, functionName: "hasRole", args: [ADVISER_ROLE, caller] }),
      ]);

      if (request.method === "POST") {
        if (!isTreasurer) return json({ error: "Treasurer lang ang puwedeng mag-upload ng listahan." }, 403);
        const body = (await request.json().catch(() => null)) as { collectionId?: number; csv?: string } | null;
        if (!Number.isInteger(body?.collectionId) || body!.collectionId! < 0) return json({ error: "Invalid collectionId" }, 400);
        if (typeof body!.csv !== "string" || !body!.csv.trim()) return json({ error: "Walang CSV." }, 400);
        if (body!.csv.length > MAX_CSV_CHARS) return json({ error: "Sobrang laki ng file (hanggang 512 KB)." }, 400);

        const { students, errors } = parseRoster(body!.csv);
        if (students.length === 0) return json({ error: errors[0] ?? "Walang student sa file.", errors }, 400);
        // Replaces the previous list for this collection.
        await rosters().doc(String(body!.collectionId)).set({ students, uploadedBy: caller, uploadedAt: Date.now() });
        return json({ saved: students.length, errors });
      }

      if (request.method !== "GET") return json({ error: "GET or POST only" }, 405);
      if (!isTreasurer && !isAdviser) return json({ error: "Officers lang ang puwedeng makakita ng listahan." }, 403);
      const idParam = new URL(request.url).searchParams.get("collectionId") ?? "";
      if (!/^\d+$/.test(idParam)) return json({ error: "Invalid collectionId" }, 400);
      const collectionId = BigInt(idParam);

      const [rosterDoc, memberDocs] = await Promise.all([rosters().doc(idParam).get(), members().get()]);
      const students = (rosterDoc.data()?.students ?? []) as Student[];
      const walletOf = new Map(memberDocs.docs.map((d) => [d.id, d.data().address as `0x${string}`]));

      // One multicall for every known wallet (roster + registered members).
      const wallets = [...walletOf.entries()];
      const paidFlags = await hasPaidMany(collectionId, wallets.map(([, a]) => a));
      const paidByEmail = new Map(wallets.map(([email], i) => [email, paidFlags[i]]));

      const onRoster = new Set(students.map((s) => s.email));
      return json({
        uploadedAt: rosterDoc.data()?.uploadedAt ?? null,
        students: students.map((s) => ({ ...s, paid: paidByEmail.get(s.email) === true, loggedIn: walletOf.has(s.email) })),
        // Paid with an email that is not on the list (e.g. a personal Gmail): officers can match them by hand.
        notOnRoster: wallets.filter(([email], i) => paidFlags[i] && !onRoster.has(email)).map(([email, address]) => ({ email, address })),
      });
    } catch (e) {
      console.error("roster failed:", e instanceof Error ? e.message : e);
      return json({ error: "Hindi makuha ang listahan. Subukan ulit." }, 500);
    }
  },
};

async function hasPaidMany(collectionId: bigint, addresses: `0x${string}`[]): Promise<boolean[]> {
  if (addresses.length === 0) return [];
  const calls = addresses.map((a) => ({ ...vault, functionName: "hasPaid" as const, args: [collectionId, a] as const }));
  // The local Hardhat chain has no Multicall3 contract; BSC Testnet does.
  if (CHAIN_ID === 31337) return Promise.all(calls.map((c) => publicClient.readContract(c)));
  const results = await publicClient.multicall({ contracts: calls, allowFailure: false });
  return results as boolean[];
}
