# PRE-EVENT checklist (do tonight, Nov 11 — at the latest Nov 12 morning)

Accounts and keys only. No feature code yet, so Nov 12–13 commits show the real build.

## Everyone (Jv, Jayson, Jaizel)

- [ ] Install MetaMask → add **BSC Testnet** (chain ID **97**, RPC `https://data-seed-prebsc-1-s1.bnbchain.org:8545`, symbol tBNB, explorer `https://testnet.bscscan.com`)
- [ ] Claim **tBNB** from the BNB Chain testnet faucet. Do it tonight — faucets run dry on build day. Share within the team.
- [ ] Join the event chat. If stuck 30 minutes: post the error + tx hash there.

## Lane B — Contracts (owner: ______)

- [ ] Create a **deployer wallet** used only for this hackathon (new MetaMask account). Fund it with ≥0.3 tBNB.
- [ ] Get an **Etherscan API key** at etherscan.io (V2 multichain key, covers BSC Testnet verification). If verify fails with it, try a key from bscscan.com.
- [ ] Ask in the event chat: *"We deploy a mock peso test token (tPHP) on testnet only for our demo payments. Is that OK under the no-token-launch rule?"*

## Lane C — Agent / backend (owner: ______)

- [ ] **Gemini API key** at aistudio.google.com (free). Check which Flash models are free on Nov 12 and note the model ID → `GEMINI_MODEL`.
  - Free tier data may be used by Google to improve products: use **sample/fake receipts only**, no real personal data.
- [ ] Create an **agent wallet** (new MetaMask account, used only by the server). Fund with 0.1 tBNB. Its private key goes only into Vercel env `AGENT_PRIVATE_KEY`.
- [ ] **Firebase project** (Spark/free): enable Firestore + Storage. Download a service account JSON (server only).
- [ ] Prepare **demo receipts** (photos): see docs/DEMO.md → "Demo receipts".

## Lane A — Frontend (owner: Jv)

- [ ] **Privy** account at privy.io → create app → enable **Google** login → enable embedded wallets → add `http://localhost:5173` and your Vercel domain to allowed origins. Note the **App ID**.
- [ ] **Vercel** account linked to GitHub.
- [ ] **GitHub**: create the **public** repo `ambagpay`. Add `.gitignore` (from this repo) BEFORE the first commit. Add Jayson and Jaizel as collaborators.

## Optional — MegaFuel gasless (~30 min, any lane)

1. Log in at nodereal.io/meganode with GitHub → create an API key (keep private, server only).
2. MegaFuel Dashboard → create a policy → network **BSC Testnet** → note the **Policy UUID**.
3. Fund the policy with tBNB (set a funding address you own, then send tBNB to the MegaFuel receiver address).
4. After the contract is deployed (Nov 12), whitelist the contracts (ToAccountWhitelist):

```bash
curl --location 'https://open-platform-ap.nodereal.io/<MEGANODE_API_KEY>/megafuel' \
  --header 'Content-Type: application/json' \
  --data '{
    "jsonrpc": "2.0", "id": 1, "method": "pm_addToWhitelist",
    "params": [{
      "policyUuid": "<POLICY_UUID>",
      "whitelistType": "ToAccountWhitelist",
      "values": ["<AMBAGVAULT_ADDRESS>", "<MOCKPHP_ADDRESS>"]
    }]
  }'
```

If MegaFuel is not working by Nov 12 evening → use the `/api/onboard` tBNB drip fallback. Do not spend Nov 13 on it.

## Onsite logistics for Nov 13 (University of Makati)

- [ ] Laptops + chargers + extension cord
- [ ] **Phone hotspot** as backup internet (venue Wi-Fi may be slow)
- [ ] 2–3 phones logged in as Member / Treasurer / Adviser for the live demo
- [ ] Printed QR poster for the demo collection
- [ ] Printed demo receipts (snap them live on stage)
- [ ] Backup demo video on a laptop and a USB drive (recorded Nov 12 night or Nov 13 noon)
