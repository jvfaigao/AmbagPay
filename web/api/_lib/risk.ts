// Risk floor computed by CODE (docs/AGENT.md). The model can only raise it, never lower it.

export const RISK = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = 0 | 1 | 2;

// receipt = official receipt · digital = e-wallet/bank/online-order screenshot · none = no receipt, only a photo proof + the treasurer's explanation
export const PROOF_TYPES = ["receipt", "digital", "none"] as const;
export type ProofType = (typeof PROOF_TYPES)[number];

export type FloorInput = {
  proofType: ProofType;
  aiFailed: boolean;
  readable: boolean;
  amount: number | null; // pesos from the receipt
  categoryKnown: boolean;
  categoryMismatch: boolean; // treasurer picked a different category than the AI
  duplicate: boolean;
  suspiciousText: string[];
  remaining: number; // pesos left in the category
  pastAmounts: number[]; // same collection + category
  vendorSeen: boolean;
  similarExpense: number | null; // expense id of a past receipt with the same vendor, total and date
  splitPattern: boolean;
};

export type PastReceipt = { vendor: string | null; total: number | null; date: string | null; payee: string | null; expenseId: number | null; createdAt: number };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Same vendor + total + date as a past receipt = the same purchase photographed again (the file hash differs, so the contract can't see it). */
export function findSimilar(past: PastReceipt[], vendor: string | null, total: number | null, date: string | null): number | null {
  if (!norm(vendor) || total === null || !date) return null;
  const hit = past.find((p) => norm(p.vendor) === norm(vendor) && p.total === total && p.date === date);
  return hit ? (hit.expenseId ?? -1) : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** ≥2 other receipts to the same payee in 24 h that, with this one, go over the adviser threshold while this one alone does not. */
export function isSplit(past: PastReceipt[], payee: string, amount: number | null, threshold: number, now: number): boolean {
  if (amount === null || amount > threshold) return false;
  const recent = past.filter((p) => norm(p.payee) === norm(payee) && now - p.createdAt < DAY_MS && typeof p.total === "number");
  const sum = recent.reduce((s, p) => s + (p.total as number), amount);
  return recent.length >= 2 && sum > threshold;
}

export function riskFloor(i: FloorInput): { risk: RiskLevel; reasons: string[] } {
  const high: string[] = [];
  if (i.aiFailed) high.push("AI review unavailable — needs human review");
  // No receipt = the adviser must always approve (HIGH forces it in the contract). The photo is only proof, so it need not be readable.
  if (i.proofType === "none") high.push("No receipt — the adviser must approve");
  else if (!i.readable) high.push("Receipt is unreadable");
  if (i.amount === null || !(i.amount > 0)) high.push("No clear total on the receipt");
  if (!i.categoryKnown) high.push("Does not match any category");
  if (i.duplicate) high.push("This receipt was already used");
  if (i.similarExpense !== null)
    high.push(`Possible duplicate: same vendor, amount and date${i.similarExpense >= 0 ? ` as Expense #${i.similarExpense}` : ""}`);
  if (i.suspiciousText.length > 0) high.push("Hidden instruction found in the receipt");
  if (i.amount !== null && i.amount > i.remaining) high.push("Over the remaining budget");
  if (high.length) return { risk: 2, reasons: high };

  const medium: string[] = [];
  if (i.proofType === "digital") medium.push("Digital proof only, not an official receipt");
  const avg = i.pastAmounts.length ? i.pastAmounts.reduce((a, b) => a + b, 0) / i.pastAmounts.length : 0;
  if (avg > 0 && i.amount! > 1.5 * avg) medium.push("Higher than the usual price");
  if (!i.vendorSeen && i.amount! > 1000) medium.push("New vendor and over ₱1,000");
  if (i.categoryMismatch) medium.push("The treasurer chose a different category than the AI guessed");
  if (i.splitPattern) medium.push("Expense may have been split to avoid the adviser");
  if (medium.length) return { risk: 1, reasons: medium };

  return { risk: 0, reasons: [] };
}
