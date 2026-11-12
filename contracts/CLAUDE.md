# contracts/ — Lane B rules

Read ../CLAUDE.md and ../docs/ARCHITECTURE.md first.

## What's here

- `contracts/AmbagVault.sol` — the vault (roles, collections, expenses, approvals, refunds). Rules are final; ask the team before changing any rule.
- `contracts/MockPHP.sol` — tPHP test token (18 decimals, EIP-2612 permit, `faucet()`, owner `mint()`).
- `test/AmbagVault.test.js` — 11 tests covering the demo rules. Keep them green.
- `scripts/deploy.js` — deploys both, sets the agent role, creates the demo collection, verifies on BscScan, writes `deployments/bscTestnet.json`.
- `scripts/grant-role.js` — grants TREASURER / ADVISER / AGENT roles to addresses in `.env`.

## Rules

- **Pinned versions:** OpenZeppelin `5.0.2`, Solidity `0.8.24`, `evmVersion: "paris"`. Do not upgrade (OZ ≥5.1 needs `cancun` opcodes).
- Network is `bscTestnet` (chain 97) only. Check the chain ID before every deploy.
- `.env` holds `PRIVATE_KEY` — never commit it, never print it.
- Verify right after deploy. If auto-verify fails, run the printed `npx hardhat verify` commands.
- If you change the contract: update tests first, run `npx hardhat test`, redeploy, update addresses in `../CLAUDE.md`, `deployments/bscTestnet.json`, and tell Lanes A and C (ABI changed → copy the new ABI to `web/src/abi/`).
- After deploy, copy `artifacts/contracts/AmbagVault.sol/AmbagVault.json` and `MockPHP.json` (`abi` field) to `web/src/abi/`.

## Commands

```bash
npm install
npx hardhat test
npx hardhat run scripts/deploy.js --network bscTestnet
npx hardhat run scripts/grant-role.js --network bscTestnet
```
