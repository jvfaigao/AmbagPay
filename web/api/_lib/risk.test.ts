// Run: npm test  (Node's built-in test runner; Node strips the TS types)
import { test } from "node:test";
import assert from "node:assert/strict";
import { riskFloor, type FloorInput } from "./risk.ts";

const ok: FloorInput = {
  aiFailed: false,
  readable: true,
  amount: 850,
  categoryKnown: true,
  duplicate: false,
  suspiciousText: [],
  remaining: 1150,
  pastAmounts: [800, 900],
  vendorSeen: true,
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
  ]) {
    assert.equal(riskFloor({ ...ok, ...bad }).risk, 2, JSON.stringify(bad));
  }
});

test("unusual price or big new vendor is MEDIUM", () => {
  assert.equal(riskFloor({ ...ok, amount: 1300, remaining: 5000 }).risk, 1); // > 1.5 × 850 avg = 1,275
  assert.equal(riskFloor({ ...ok, amount: 1250, remaining: 5000 }).risk, 0); // just under
  assert.equal(riskFloor({ ...ok, amount: 1001, remaining: 5000, pastAmounts: [], vendorSeen: false }).risk, 1);
  assert.equal(riskFloor({ ...ok, amount: 900, pastAmounts: [], vendorSeen: false }).risk, 0); // new vendor, small amount
});
