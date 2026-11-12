// Risk floor computed by CODE (docs/AGENT.md). The model can only raise it, never lower it.

export const RISK = ["LOW", "MEDIUM", "HIGH"] as const;
export type RiskLevel = 0 | 1 | 2;

export type FloorInput = {
  aiFailed: boolean;
  readable: boolean;
  amount: number | null; // pesos from the receipt
  categoryKnown: boolean;
  duplicate: boolean;
  suspiciousText: string[];
  remaining: number; // pesos left in the category
  pastAmounts: number[]; // same collection + category
  vendorSeen: boolean;
};

export function riskFloor(i: FloorInput): { risk: RiskLevel; reasons: string[] } {
  const high: string[] = [];
  if (i.aiFailed) high.push("AI review unavailable — kailangan ng human review");
  if (!i.readable) high.push("Hindi mabasa ang resibo");
  if (i.amount === null || !(i.amount > 0)) high.push("Walang malinaw na total sa resibo");
  if (!i.categoryKnown) high.push("Hindi tugma sa kahit anong category");
  if (i.duplicate) high.push("Nagamit na ang resibong ito");
  if (i.suspiciousText.length > 0) high.push("May nakatagong instruction sa resibo");
  if (i.amount !== null && i.amount > i.remaining) high.push("Lagpas sa natitirang budget");
  if (high.length) return { risk: 2, reasons: high };

  const medium: string[] = [];
  const avg = i.pastAmounts.length ? i.pastAmounts.reduce((a, b) => a + b, 0) / i.pastAmounts.length : 0;
  if (avg > 0 && i.amount! > 1.5 * avg) medium.push("Mas mataas sa karaniwang presyo");
  if (!i.vendorSeen && i.amount! > 1000) medium.push("Bagong vendor at lampas ₱1,000");
  if (medium.length) return { risk: 1, reasons: medium };

  return { risk: 0, reasons: [] };
}
