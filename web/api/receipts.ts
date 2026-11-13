// GET /api/receipts?collectionId=0 -> public titles + agent verdicts for the ledger, keyed by expense id.
// Only public fields leave the server (vendor, first item, risk, reason, proof type, no-receipt note); never member data.
import { receipts } from "./_lib/firebase.js";

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "public, max-age=5" } });

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return json({ error: "GET only" }, 405);
    const collectionId = Number(new URL(request.url).searchParams.get("collectionId"));
    if (!Number.isInteger(collectionId) || collectionId < 0) return json({ error: "Invalid collectionId" }, 400);

    try {
      const snap = await receipts().where("collectionId", "==", collectionId).get();
      const expenses: Record<number, { title: string | null; risk: string; reason: string; proofType: string; note: string | null; txHash: string | null }> = {};
      for (const doc of snap.docs) {
        const x = doc.data();
        if (typeof x.expenseId !== "number") continue;
        const vendor = x.extracted?.vendor ?? null;
        const item = x.extracted?.items?.[0]?.name ?? null;
        expenses[x.expenseId] = {
          title: [vendor, item].filter(Boolean).join(" · ") || null,
          risk: x.risk,
          reason: x.reason,
          proofType: x.proofType ?? "receipt", // older docs predate proof types
          note: x.note || null, // treasurer's public explanation when there is no receipt
          txHash: x.txHash ?? null, // the agent's proposeExpense tx (already public on-chain)
        };
      }
      return json({ expenses });
    } catch (e) {
      console.error("receipts failed:", e instanceof Error ? e.message : e);
      return json({ error: "Could not load the receipts." }, 500);
    }
  },
};
