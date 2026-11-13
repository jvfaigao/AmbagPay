// /api/officers — President (ADMIN_ROLE) only. Personal data: Google emails ↔ wallets.
//   GET                 → every signed-in member who holds TREASURER_ROLE or ADVISER_ROLE
//   GET ?email=x@gmail  → that member's wallet (null if they never signed in), so the admin can grant a role on-chain
// The grant itself is signed by the admin's own wallet in the browser; this API never holds a role key.
import { keccak256, toBytes } from "viem";
import { ambagVaultAbi } from "../src/abi/AmbagVault.js";
import { callerWallet } from "./_lib/auth.js";
import { CHAIN_ID, publicClient, VAULT_ADDRESS } from "./_lib/chain.js";
import { members } from "./_lib/firebase.js";

const ADMIN_ROLE = keccak256(toBytes("ADMIN_ROLE"));
const TREASURER_ROLE = keccak256(toBytes("TREASURER_ROLE"));
const ADVISER_ROLE = keccak256(toBytes("ADVISER_ROLE"));
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
const vault = { address: VAULT_ADDRESS, abi: ambagVaultAbi } as const;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return json({ error: "GET only" }, 405);
    const caller = await callerWallet(request);
    if (!caller) return json({ error: "Please sign in first." }, 401);

    try {
      const isAdmin = await publicClient.readContract({ ...vault, functionName: "hasRole", args: [ADMIN_ROLE, caller] });
      if (!isAdmin) return json({ error: "Only the admin can manage officers." }, 403);

      const emailParam = new URL(request.url).searchParams.get("email");
      if (emailParam !== null) {
        const email = emailParam.trim().toLowerCase();
        if (!EMAIL.test(email)) return json({ error: "That does not look like an email address." }, 400);
        const doc = await members().doc(email).get();
        return json({ email, address: (doc.data()?.address as string | undefined) ?? null });
      }

      const docs = (await members().get()).docs.map((d) => ({ email: d.id, address: d.data().address as `0x${string}` }));
      const calls = docs.flatMap((m) => [
        { ...vault, functionName: "hasRole" as const, args: [TREASURER_ROLE, m.address] as const },
        { ...vault, functionName: "hasRole" as const, args: [ADVISER_ROLE, m.address] as const },
      ]);
      // The local Hardhat chain has no Multicall3 contract; BSC Testnet does.
      const flags = (
        CHAIN_ID === 31337 ? await Promise.all(calls.map((c) => publicClient.readContract(c))) : await publicClient.multicall({ contracts: calls, allowFailure: false })
      ) as boolean[];
      const officers = docs
        .map((m, i) => ({ ...m, treasurer: flags[i * 2], adviser: flags[i * 2 + 1] }))
        .filter((m) => m.treasurer || m.adviser);
      return json({ officers });
    } catch (e) {
      console.error("officers failed:", e instanceof Error ? e.message : e);
      return json({ error: "Could not load the officers. Please try again." }, 500);
    }
  },
};
