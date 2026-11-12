# ARCHITECTURE — AmbagPay

## System

```
 ┌──────────────── web/ (Vercel) ────────────────┐
 │  React + Vite + TS                             │
 │  Privy (Google login, embedded wallet)         │       ┌─────────────────────────┐
 │  wagmi/viem ──── reads + member/officer txs ───┼──────▶│ BSC Testnet (chain 97)  │
 │                                                │       │  MockPHP (tPHP, permit) │
 │  web/api/ (serverless, Node)                   │       │  AmbagVault             │
 │   POST /api/onboard  → tBNB drip + mint tPHP ──┼──────▶│                         │
 │   POST /api/agent/review → Treasurer Agent ────┼──────▶│  (agent: proposeExpense)│
 └───────────────┬───────────────────────────────┘       └─────────────────────────┘
                 │
      ┌──────────┴──────────┐        ┌────────────────────┐
      │ Firebase            │        │ Gemini (AI Studio) │
      │  Firestore: members,│        │  vision + function │
      │  receipts, onboarded│        │  calling           │
      │  Storage: receipt   │        └────────────────────┘
      │  images             │
      └─────────────────────┘
```

Who signs what:

| Action | Signer | How |
|---|---|---|
| pay / payWithPermit / claimRefund | Member (embedded wallet) | wagmi `writeContract` in browser |
| approveExpense / rejectExpense / executeExpense | Treasurer / Adviser wallet | wagmi in browser |
| proposeExpense | **Agent server wallet** | viem in `/api/agent/review` |
| tBNB drip + tPHP mint | Deployer/faucet wallet (owner of MockPHP) | viem in `/api/onboard` |
| createCollection / grantRole | Admin (deployer) | Hardhat scripts |

## Contract API (AmbagVault) — source of truth: contracts/contracts/AmbagVault.sol

Roles: `ADMIN_ROLE`, `TREASURER_ROLE`, `ADVISER_ROLE`, `AGENT_ROLE` (bytes32 = keccak256 of the name).

Writes:
- `createCollection(name, amountPerMember, deadline, categoryNames[], caps[]) → id` — admin
- `closeCollection(id)` — admin, requires 0 pending
- `pay(id)` — needs prior `approve`; `payWithPermit(id, deadline, v, r, s)` — one tx
- `claimRefund(id)` — after close
- `proposeExpense(collectionId, categoryIndex, amount, payee, receiptHash, receiptURI, risk) → expenseId` — agent or treasurer (treasurer = forced HIGH + counts as treasurer approval)
- `approveExpense(expenseId)` — adviser role → adviser approval; else treasurer role → treasurer approval
- `rejectExpense(expenseId, reason)` — treasurer/adviser; releases the receipt hash
- `executeExpense(expenseId)` — anyone; needs treasurer approval, plus adviser if `amount > ₱1,000 || risk == HIGH`

Reads: `collectionCount()`, `getCollection(id)`, `getCategories(id)`, `expenseCount()`, `getExpense(id)`,
`needsAdviser(expenseId)`, `availableBalance(id)`, `hasPaid(id, addr)`, `hasClaimed(id, addr)`,
`receiptInUse(hash)`, `adviserThreshold()`, `hasRole(role, addr)`.

Enums: `Risk { LOW=0, MEDIUM=1, HIGH=2 }`, `ExpenseStatus { Proposed=0, Executed=1, Rejected=2 }`, `CollectionStatus { Open=0, Closed=1 }`.

Events (ledger activity feed): `Paid`, `ExpenseProposed`, `ExpenseApproved`, `ExpenseExecuted`, `ExpenseRejected`, `CollectionClosed`, `RefundClaimed`.

Custom errors to map to friendly UI text:

| Error | UI text |
|---|---|
| `AlreadyPaid` | "Bayad ka na sa collection na ito." |
| `ReceiptAlreadyUsed` | "Nagamit na ang resibong ito." |
| `OverBudget` | "Lagpas na sa budget ng category." |
| `InsufficientFunds` | "Kulang ang pondo ng collection." |
| `AdviserRequired` | "Kailangan ng approval ng adviser." |
| `NotApproved` | "Hindi pa naa-approve ng treasurer." |
| `NotApprover` / `NotProposer` | "Wala kang permiso para dito." |
| `PendingExpenses` | "May pending pa na gastos." |
| `NothingToClaim` | "Wala kang refund na makukuha." |

## Receipt hash

`receiptHash = keccak256(raw image bytes)` computed **on the server** from the uploaded file
(viem `keccak256(toBytes(buffer))`). Same file → same hash → duplicate is caught on-chain.

## Off-chain data (Firestore)

| Collection | Doc id | Fields |
|---|---|---|
| `members` | wallet address (lowercase) | `email`, `displayName`, `createdAt` — never put on-chain |
| `onboarded` | wallet address | `tbnbTx`, `tphpTx`, `at` — prevents repeat drips |
| `receipts` | receiptHash | `collectionId`, `imageUrl`, `extracted` (JSON), `risk`, `reason`, `checks[]`, `expenseId` or `blockedReason`, `createdAt` |

The agent's "memory" = `receipts` for the same collection/category (past vendors + amounts).

## Environment variables

`contracts/.env`
```
PRIVATE_KEY=            # deployer = admin = MockPHP owner
ETHERSCAN_API_KEY=
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.bnbchain.org:8545
TREASURER_ADDRESS=
ADVISER_ADDRESS=
AGENT_ADDRESS=
```

`web/.env` (browser — public values only)
```
VITE_PRIVY_APP_ID=
VITE_VAULT_ADDRESS=
VITE_TOKEN_ADDRESS=
VITE_DEMO_COLLECTION_ID=0
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_APP_ID=
```

Vercel env (server only — never `VITE_`)
```
BSC_TESTNET_RPC=
VAULT_ADDRESS=
TOKEN_ADDRESS=
AGENT_PRIVATE_KEY=          # wallet with AGENT_ROLE only
FAUCET_PRIVATE_KEY=         # deployer (owner of MockPHP), used by /api/onboard
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash   # confirm the free Flash model ID on Nov 12
FIREBASE_SERVICE_ACCOUNT=   # JSON string
MEGANODE_API_KEY=           # optional (MegaFuel)
MEGAFUEL_POLICY_UUID=       # optional
```
