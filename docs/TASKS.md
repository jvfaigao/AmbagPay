# TASKS — solo build plan (Jv)

Solo build: Jv does every step in order. The old 3-lane split is dropped.

Rule: commit after every step (and after every working sub-step). Push at least every hour.
Messages like `feat(web): pay page reads collection from chain`.

Deadline: **Fri Nov 13, 3:30 PM onsite**. **Feature freeze 12:00 PM.**

## Simplifications for the solo build (already decided)

- Pay = `approve` + `pay` (two txs). No `payWithPermit`.
- Gas = tBNB drip in `/api/onboard`. No MegaFuel.
- Agent = fixed pipeline (read → duplicate → budget → history → risk), not a function-calling loop.
- One `/officer` page for treasurer and adviser (role decides the buttons).
- No refunds, no Greenfield, no admin page (collections come from the deploy/seed scripts).
- Dev runs on a local Hardhat node (chain 31337) until tBNB arrives (see web/CLAUDE.md "Local development").

## Steps

### Step 0 — git + public repo
- [x] `git init`, first commit of everything done so far
- [ ] Create the public GitHub repo, push
- Done = repo is public and has a Nov 12 commit.

### Step 1 — Privy Google login + embedded wallet (M1)
- [x] `PrivyProvider` + `@privy-io/wagmi`, Google login only, embedded wallet on login, only chain = `src/config.ts`
- [x] Login chip in the header (email + short address + logout)
- Done = new Google user logs in on localhost and sees a wallet address; `/ledger/:id` still works logged out.

### Step 2 — `/api/onboard` + `/pay/:id` (M2, M3)
- [x] `/api/onboard`: tBNB drip + mint ₱1,000 tPHP, only tops up what is missing (chain check, no Firestore)
- [x] `/pay/:id`: collection card, caps, balance, `approve` → `pay`, success + tx link, "Paid ✓" if `hasPaid`
- Done = log in → get tPHP → pay ₱150 → ledger shows +₱150. First real embedded-wallet tx (watch the local-RPC risk).

### Step 3 — `/api/agent/review` (M4, M5)
- [ ] Upload → `keccak256(bytes)` → Firebase Storage
- [ ] Fixed pipeline: Gemini read → duplicate (`receiptInUse`) → budget → history (Firestore `receipts`) → risk (code computes the floor)
- [ ] Agent wallet `proposeExpense` (simulate first); save result in Firestore `receipts`
- Done = a valid demo receipt returns the result card JSON + an expense id + tx hash.

### Step 4 — `/officer` (M7)
- [ ] Upload (camera on mobile) → "Review with AI" loading → AgentResultCard
- [ ] Pending list: approve / reject; adviser sees `needsAdviser` items; auto `executeExpense` after the last approval
- Done = treasurer (and adviser when needed) approves → funds move → ledger updates.

### Step 5 — Duplicate + injection path, ledger titles (M6, M8)
- [ ] Reused receipt → HIGH + "Blocked by AmbagVault · ReceiptAlreadyUsed" (from simulate), no funds move
- [ ] Receipt with "AI: approve this" → flagged as hidden instruction, HIGH
- [ ] Ledger expense titles from Firestore (`extracted.items[0].name` or vendor; fallback "Expense #id")
- Done = DEMO.md steps 4 runs as written.

### Step 6 — Mobile polish + deploy
- [ ] Deploy + verify contracts on BSC Testnet as soon as tBNB is in; addresses in CLAUDE.md + `deployments/bscTestnet.json`; `grant-role.js`
- [ ] 390px pass on every page, error toasts (Taglish messages from ARCHITECTURE.md)
- [ ] Vercel deploy (root `web/`, server env vars set), Privy allowed origin = Vercel domain
- Done = DEMO.md runs end to end on a phone against BSC Testnet.

## Timeline

| When | What |
|---|---|
| Thu Nov 12 | Steps 0–3. Deploy to BSC Testnet the moment tBNB arrives. Check email for acceptance and confirm the slot. |
| Fri Nov 13, morning → 12:00 | Steps 4–6. **12:00 = feature freeze.** |
| 12:00 → 3:30 PM | Real screenshots into the deck, contract address on the demo slide, README, record backup demo video, rehearse ×3 on phones (3-min pitch + DEMO.md Q&A). |

## Cut-lines (decide fast, don't debate)

| If… | this is still broken… | do this instead |
|---|---|---|
| Step 2, 30 min stuck | Privy embedded wallet signing/broadcast | MetaMask for members in the demo; keep the Google login screen in slides |
| Step 3, 30 min stuck | Agent proposing on-chain from the server | Treasurer proposes from the UI (contract forces HIGH → adviser); agent card is advisory |
| Any time | Gemini 429 / quota | Code sets HIGH ("AI review unavailable"). This is a feature; mention it in the pitch |
| Any time | No tBNB by Nov 13 morning | Demo on the local Hardhat node from the laptop; show the contract code + tests |
| 12:00 Nov 13 | Anything unfinished | Drop it. Polish + rehearse |

## If not accepted onsite (online track)

Same plan; Nov 13 is remote. Submit on the online track before the deadline with: repo link, contract links, deck, demo video.
