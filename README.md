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

## Deployed contracts (BSC Testnet, chain 97)
- AmbagVault: `TBD` — https://testnet.bscscan.com/address/TBD
- MockPHP (tPHP, test token): `TBD`

## Repo
- `contracts/` — Hardhat project (Solidity 0.8.24, OpenZeppelin 5.0.2)
- `web/` — React + Vite + TypeScript frontend, Vercel functions in `web/api/`
- `docs/` — PRD, architecture, agent spec, tasks, demo

## Run
```bash
cd contracts && npm install && npx hardhat test
cp .env.example .env   # fill in
npx hardhat run scripts/deploy.js --network bscTestnet
```
