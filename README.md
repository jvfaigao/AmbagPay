# AmbagPay — Every peso, accounted for.

Transparent student contributions for student organizations, guarded by an AI Treasurer Agent and enforced by a smart contract on **BNB Smart Chain Testnet**.

Built by **Team Kiro** (Jv, Jayson, Jaizel) for BCC Hackathon 2026.

## The problem
Students pay org fees and class contributions but rarely see where the money goes. Treasurers struggle to prove they handled funds honestly, and leftovers are rarely returned.

## How it works
1. Members log in with Google and pay a collection — no wallet setup, no gas.
2. The treasurer uploads a receipt. The **Treasurer Agent** (Gemini) reads it, checks for duplicates, budget and price history, and proposes the expense on-chain with a risk level.
3. `AmbagVault` enforces category budget caps and approvals (treasurer; adviser for > ₱1,000 or HIGH risk) and blocks reused receipts.
4. Anyone can view the public ledger, with every receipt and BscScan transaction.

The AI can only propose. It can make the rules stricter, never looser.

## Live demo
- App: https://ambagpay.vercel.app (pay: `/pay/0`, public ledger: `/ledger/0`, officers: `/officer`)

## Deployed contracts (BSC Testnet, chain 97, verified)
- AmbagVault: `0xB1930A7A22edcc231E09415f66490a132460DC15` — https://testnet.bscscan.com/address/0xB1930A7A22edcc231E09415f66490a132460DC15#code
- MockPHP (tPHP, test token): `0xf24D1b05d6EDA85ce22361F3fb327b2c022455Ea` — https://testnet.bscscan.com/address/0xf24D1b05d6EDA85ce22361F3fb327b2c022455Ea#code

## Features
- Google login with an embedded wallet; gas is covered (tBNB drip), members get test pesos on first login
- Pay a fee in one tap; several fees per org
- AI Treasurer Agent (Gemini): reads the receipt, checks duplicates (same file or re-photographed), budget, price history, split expenses and hidden instructions; code sets the minimum risk; the agent proposes on-chain
- Approvals: treasurer, plus adviser for > ₱1,000 or HIGH risk; the contract pays out
- Public ledger with receipts and BscScan links
- Class list upload: officers see who paid per section
- Admin: create and close fees from the web; leftover refunds that members claim themselves

## Repo
- `contracts/` — Hardhat project (Solidity 0.8.24, OpenZeppelin 5.0.2)
- `web/` — React + Vite + TypeScript frontend, Vercel functions in `web/api/`
- `docs/` — PRD, architecture, agent spec, tasks, demo

## Run
```bash
# contracts
cd contracts && npm install && npx hardhat test
cp .env.example .env   # fill in
npx hardhat run scripts/deploy.js --network bscTestnet

# web (frontend + /api functions)
cd web && npm install
npm run dev            # frontend only
vercel dev             # frontend + /api functions
npm test               # agent risk + class list tests
```
