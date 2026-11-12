# FRONTEND — screens and components

Mobile-first (demo is on phones). Visual reference: `docs/prototype/screens.html` (+ pay.png, agent.png, dashboard.png) — same as deck slide 11.

## Design tokens (match the deck)

| Token | Value |
|---|---|
| dark | `#10261F` |
| cream (page bg) | `#F6F4EE` |
| paper (cards) | `#FFFDF8` |
| line | `#DDD8CB` |
| gold (primary button, accents) | `#F0B90B` (dark text on it) |
| green (success, eyebrows) | `#1F7A5C`, bg `#E3F1EA` |
| orange (risk/rejected) | `#B4410C`, bg `#FBE9DF` |
| body text | `#46564F`, muted `#5A6962` |
| font | Inter (display: Inter Display or Space Grotesk) |
| radius | cards 16px, buttons 14px |

Status/risk always has a text label, not color only ("HIGH RISK", "Paid · Treasurer approved").

## Routes

| Route | Who | Must have (MVP) |
|---|---|---|
| `/` | everyone | Logo, "Every peso, accounted for", buttons: View ledger · Pay · Officer login |
| `/pay/:id` | member | **Screen 1** — Google login chip, collection card (name, ₱amount, due, paid x of y, progress), category caps, balance, "Pay ₱150 · no gas fee", success state with BscScan link, "Paid ✓" state if `hasPaid` |
| `/ledger/:id` | public, no login | **Screen 3** — Collected / Spent / Left stats, category bars, expense list (title, amount, status chip, Receipt ↗, BscScan ↗) newest first |
| `/treasurer` | treasurer | Upload receipt (camera on mobile: `<input type="file" accept="image/*" capture="environment">`), payee input (default: treasurer address), "Review with AI" → loading state ("Reading receipt… Checking duplicates… Checking budget…") → **Screen 2** agent result card → Approve / Reject. Below: pending expenses list with approve/reject |
| `/adviser` | adviser | Queue of expenses where `needsAdviser` and not yet adviser-approved; shows agent risk + reason + receipt; Approve / Reject. After final approval auto-call `executeExpense` |
| `/admin` | admin | Stretch (S4). MVP uses the deploy script |

"Paid count of 45": 45 = expected members, a constant in config for the demo (`EXPECTED_MEMBERS`).

## Role detection

On login read `hasRole(TREASURER_ROLE|ADVISER_ROLE|ADMIN_ROLE, address)` and show the matching nav.
Officers' addresses are granted by `contracts/scripts/grant-role.js` after their first login.

## Key components

- `<CollectionCard>` · `<CategoryBars>` · `<StatTiles>` · `<ExpenseRow>` · `<AgentResultCard>` · `<RiskBadge>` · `<TxLink>` · `<ErrorToast>` (maps custom errors → Taglish text, see ARCHITECTURE.md)

## Data access

- Reads: wagmi `useReadContract` / `useReadContracts` on `AmbagVault` (getCollection, getCategories, expenseCount, getExpense…). Poll every 4 s on ledger/officer pages (simpler than event subscriptions).
- Expense titles: from Firestore `receipts` (`extracted.items[0].name` or vendor); fallback "Expense #id".
- Writes: wagmi `writeContract` → wait for receipt → refetch.
- ABI: import from `contracts/artifacts/.../AmbagVault.json` copied into `web/src/abi/` (run `npm run abi` script or copy manually after deploy).

## Pay flow details

1. On first login: call `POST /api/onboard { address }` → server drips tBNB (if no MegaFuel) + mints ₱1,000 tPHP. Show "Setting up your wallet…" once.
2. Pay: sign EIP-2612 permit (typed data, name "Test Philippine Peso", version "1", chainId 97) → `payWithPermit`.
   Fallback if permit signing is flaky: `approve` then `pay` (two txs; fine because gas is covered).
3. Privy: hide wallet confirmation modals for the demo if the SDK allows (check docs), so the flow feels like a normal app.

## Done = demo script in docs/DEMO.md runs on a phone without touching MetaMask as a member.
