# web/ — Lane A rules (frontend)

Read ../CLAUDE.md, ../docs/FRONTEND.md and ../docs/ARCHITECTURE.md first.

## Status

Scaffold is done: Vite + React + TypeScript + Tailwind v4 + wagmi v3 + viem + react-router.
Working pages: `/` (home) and `/ledger/:id` (public ledger, reads from chain every 4 s).
Next: Privy Google login (`@privy-io/react-auth` + `@privy-io/wagmi`, replaces `src/wagmi.ts`), `/pay/:id`, `/officer`.
Check the current Privy docs for the provider setup. Config goals: Google login only; create an embedded
wallet on login; default and only chain = the one in `src/config.ts`.

## Local development (no testnet needed)

```bash
# terminal 1
cd contracts && npx hardhat node
# terminal 2
cd contracts && npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/seed-local.js --network localhost
# terminal 3: web/.env.local with VITE_CHAIN_ID=31337 and the printed addresses
cd web && npm install && npm run dev
```

## Rules

- Mobile-first. Test at 390px width. Match the deck colors (FRONTEND.md tokens).
- Only `VITE_` public values in the browser. Never import server keys.
- Contract addresses and ABIs come from `src/config.ts` and `src/abi/` — no hardcoded addresses in components.
- Amounts: `formatEther` → `₱` + 2 decimals with thousands separators.
- Map contract custom errors to the Taglish messages in ARCHITECTURE.md.
- Every tx shows: pending state → success with `TxLink` (testnet.bscscan.com) → refetch.
- Keep pages working without login where possible (`/ledger/:id` must never require login).
- Commit after each screen works: `feat(web): ledger reads categories from chain`.

## Deploy

Vercel project root = `web/`. Functions in `web/api/` deploy automatically. Set env vars in Vercel (see ARCHITECTURE.md).
