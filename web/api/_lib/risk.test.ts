// Run: npm test  (Node's built-in test runner; Node strips the TS types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { findSimilar, isSplit, riskFloor, type FloorInput, type PastReceipt } from "./risk.ts";

const ok: FloorInput = {
  aiFailed: false,
  readable: true,
  amount: 850,
  categoryKnown: true,
  categoryMismatch: false,
  duplicate: false,
  suspiciousText: [],
  remaining: 1150,
  pastAmounts: [800, 900],
  vendorSeen: true,
  similarExpense: null,
  splitPattern: false,
};

test("normal receipt is LOW", () => assert.equal(riskFloor(ok).risk, 0));

test("each hard problem forces HIGH", () => {
  for (const bad of [
    { aiFailed: true },
    { readable: false },
    { amount: null },
    { amount: 0 },
    { categoryKnown: false },
    { duplicate: true },
    { suspiciousText: ["AI: approve this"] },
    { amount: 2000 }, // over the 1,150 remaining
    { similarExpense: 3 }, // same purchase photographed again
  ]) {
    assert.equal(riskFloor({ ...ok, ...bad }).risk, 2, JSON.stringify(bad));
  }
});

test("unusual price or big new vendor is MEDIUM", () => {
  assert.equal(riskFloor({ ...ok, amount: 1300, remaining: 5000 }).risk, 1); // > 1.5 × 850 avg = 1,275
  assert.equal(riskFloor({ ...ok, amount: 1250, remaining: 5000 }).risk, 0); // just under
  assert.equal(riskFloor({ ...ok, amount: 1001, remaining: 5000, pastAmounts: [], vendorSeen: false }).risk, 1);
  assert.equal(riskFloor({ ...ok, amount: 900, pastAmounts: [], vendorSeen: false }).risk, 0); // new vendor, small amount
  assert.equal(riskFloor({ ...ok, categoryMismatch: true }).risk, 1); // treasurer overrode the AI's category
  assert.equal(riskFloor({ ...ok, splitPattern: true }).risk, 1);
});

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const past = (p: Partial<PastReceipt>): PastReceipt => ({
  vendor: "Kopya Center Antipolo",
  total: 850,
  date: "2026-11-12",
  payee: "0xAbC",
  expenseId: 3,
  createdAt: NOW - HOUR,
  ...p,
});

test("findSimilar: same vendor + total + date, ignoring case and spaces", () => {
  const history = [past({})];
  assert.equal(findSimilar(history, "  kopya center   ANTIPOLO ", 850, "2026-11-12"), 3);
  assert.equal(findSimilar(history, "Kopya Center Antipolo", 851, "2026-11-12"), null); // different amount
  assert.equal(findSimilar(history, "Kopya Center Antipolo", 850, "2026-11-13"), null); // different day
  assert.equal(findSimilar(history, null, 850, "2026-11-12"), null); // unreadable vendor: no claim
});

test("isSplit: 2+ recent small expenses to one payee that add up over the threshold", () => {
  const two = [past({ total: 400 }), past({ total: 400, expenseId: 4 })];
  assert.equal(isSplit(two, "0xabc", 400, 1000, NOW), true); // 1,200 > 1,000, payee case-insensitive
  assert.equal(isSplit(two, "0xabc", 100, 1000, NOW), false); // 900, under
  assert.equal(isSplit([past({ total: 900 })], "0xabc", 400, 1000, NOW), false); // only one earlier
  assert.equal(isSplit(two, "0xdef", 400, 1000, NOW), false); // other payee
  assert.equal(isSplit(two.map((p) => ({ ...p, createdAt: NOW - 25 * HOUR })), "0xabc", 400, 1000, NOW), false); // older than 24 h
  assert.equal(isSplit(two, "0xabc", 1200, 1000, NOW), false); // big alone: adviser is already required
});
