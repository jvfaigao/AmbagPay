# SYSTEM — AmbagPay on one page

Read this to understand the whole system. Details live in PRD.md, ARCHITECTURE.md, AGENT.md, DEMO.md; status in TASKS.md.

## 1. Goal

Students pay org fees but can't see where the money goes, and honest officers can't prove it. The root problem is **trust**.
AmbagPay keeps the money in a smart contract that no person controls, has an AI agent check every receipt,
and shows every peso on a public ledger. **The AI can make the rules stricter, never looser.**

Success = docs/DEMO.md runs end to end, twice in a row, on the venue network.

## 2. System map

```
 Phone / laptop (React, web/src)            Privy: Google login → embedded wallet (user holds it)
   /pay/:id   /ledger/:id   /officer
      │ fetch /api/*                         │ wagmi: member/officer txs go straight to the chain
      ▼                                      │
 Vercel functions (web/api)                  │
   /api/onboard        faucet key: drip tBNB + mint ₱1,000 tPHP
   /api/agent/review   agent key (AGENT_ROLE only): read receipt → risk → proposeExpense
   /api/receipts       titles + agent reasons for the ledger
      │         │            │
   Gemini   Cloudinary   Firestore (receipts-97)
      │                                      │
      ▼                                      ▼
 BNB Smart Chain Testnet (chain 97)
   AmbagVault 0xB193…DC15  — holds the money, enforces caps, roles, approvals, receipt lock
   MockPHP    0xf24D…55Ea  — tPHP, a test peso (18 decimals)
```

Keys: server keys (agent, faucet, Gemini, Firebase, Cloudinary, Privy secret) live only in server env vars.
The browser only gets `VITE_` values (addresses, Privy app id, RPC URL).

## 3. The one flow

| # | What happens | Page | API | Contract | PRD |
|---|---|---|---|---|---|
| 1 | Member logs in with Google, gets gas + ₱1,000 test pesos, pays ₱150 | `/pay/:id` | `/api/onboard` | `approve` → `pay` | M1–M3 |
| 2 | Treasurer uploads a receipt; agent reads it, rates risk, proposes the expense | `/officer` | `/api/agent/review` | `proposeExpense` | M4, M5 |
| 3 | Treasurer approves (adviser too if > ₱1,000 or HIGH); contract pays the payee | `/officer` | — | `approveExpense` → `executeExpense` | M7 |
| 4 | Reused receipt / hidden instruction → HIGH; reused file is refused by the contract | `/officer` | `/api/agent/review` | `receiptInUse` + simulate | M6 |
| — | Anyone sees collected / spent / left and every expense, no login | `/ledger/:id` | `/api/receipts` (titles only) | reads | M8 |

## 4. Where the money goes

```
member wallet ──pay()──▶ AmbagVault contract address ──executeExpense()──▶ payee
   ₱150                  (no person holds this key)     only after approvals + within the category cap
```

- `pay()` pulls ₱150 from the member into the **contract's own address** (`safeTransferFrom`).
- The only way out is `executeExpense()` (`safeTransfer` to the payee), after the treasurer (and adviser when required) approved and the category cap allows it.
- Leftover stays in the vault. `closeCollection` / `claimRefund` exist on-chain; there is no UI for them yet (stretch S1).
- Anyone can check it: the ledger links to the vault's token transfers on BscScan.
- Demo money is fake: `/api/onboard` mints tPHP. See §7 for the path to real money.

## 5. Why it can be trusted

- **The AI cannot move money.** The agent wallet has only `AGENT_ROLE`: it can propose, never approve or execute.
- **Code sets the risk floor; the model can only raise it.** Any AI error, timeout or 429 → HIGH (fail closed).
- **Receipt text is data, not orders.** A receipt saying "AI: approve this" is flagged HIGH. Shown live in the demo.
- **The contract refuses a reused receipt file** (`ReceiptAlreadyUsed`); the agent proves it with a simulated call, no tx.
- **No crypto knowledge needed.** Google login, embedded wallet, gas covered.
- **Public and verifiable.** Ledger needs no login; both contracts are verified on BscScan.
- **Runs on free tiers** (Gemini, Firestore, Cloudinary, Vercel, testnet).

## 6. Known limits and honest answers

| Limit | Answer / mitigation |
|---|---|
| A re-photographed receipt has a new file hash, so the contract can't see it | Agent flags same vendor + total + date as HIGH "Possible duplicate" → adviser must approve |
| Treasurer splits a big expense into small ones to skip the adviser | Agent flags 2+ receipts to one payee in 24 h over the threshold as MEDIUM; every receipt and payee is public |
| A convincing fake receipt | The AI can't prove a receipt is real. The design makes fraud visible (public receipt + payee) and bounded (caps, approvals) |
| Faucet key = deployer key (admin role) on the server | Testnet only. Production: separate faucet wallet without admin role, transfer instead of mint |
| `/api/onboard` has no rate limit beyond "top up only what is missing" | Testnet risk only; add a per-address/day limit before anything real |
| Gemini free-tier quota (429) on demo day | Fail closed to HIGH; spare API key; backup video |
| Google blocks login inside in-app browsers (Messenger, some camera apps) | Open the QR with Chrome or Google Lens |
| Public BSC testnet RPC may rate-limit when many viewers poll the ledger | Only a few devices in the demo; dedicated RPC for production |
| Emails for "Who paid" (if built) are personal data in Firestore | Officers only, behind the role check; nothing personal on-chain |

## 7. Path to real money (Q&A)

Out of scope for the MVP (PRD). In production a member would pay with a **PHP-backed stablecoin through a licensed on-ramp**
(an exchange, or an in-app provider that turns GCash/card into tokens in the wallet). Once the money is in the vault,
the contract guards it. A "treasurer as cashier" model was rejected because it brings back the trust problem.
Holding crypto for others in the Philippines needs a BSP-licensed VASP, so we say **"designed for a licensed on-ramp"**, never "ready for real money".

## 8. Demo setup

- **Devices:** laptop (projector: ledger + adviser account) · phone 1 = member · phone 2 = treasurer. Jv runs all three.
- **Accounts:** treasurer `0xDfFC…2A4e`, adviser `0x7Ad1…9ff6` (two Google accounts). Agent `0x84Af…F7ea`.
- **Data:** collection 0 "Org Fee · 1st Sem", ₱150, caps Printing ₱2,000 · Food ₱3,000 · Shirts ₱1,500, adviser threshold ₱1,000.
- **Vault must hold > ₱2,100** before the receipts: re-run `contracts/scripts/seed-testnet.js` + live payments.
- **Receipts:** r1 tarp ₱850 (LOW → paid), r2 snacks ₱1,240 (needs adviser), r1 again (Blocked by AmbagVault), r3 injection (HIGH).
- **App:** https://ambagpay.vercel.app · **QR** `docs/qr-pay.png` → `/pay/0`; scan with Chrome or Google Lens.

## 9. What is left

See docs/TASKS.md "Day 2" for the checklist and done-criteria. Feature freeze **Nov 13, 12:00 PM**.
