// POST /api/onboard (Authorization: Bearer <Privy access token>) -> gives the caller's wallet a little gas + ₱1,000 tPHP.
import { parseEther } from "viem";
import { mockPhpAbi } from "../src/abi/MockPHP.js";
import { callerAccount } from "./_lib/auth.js";
import { faucetClient, publicClient, TOKEN_ADDRESS } from "./_lib/chain.js";
import { members } from "./_lib/firebase.js";

const GAS_DRIP = parseEther("0.001"); // ~70 txs at 0.1 gwei; keeps the faucet alive for ~260 new users
const MIN_GAS = parseEther("0.0005"); // below this a wallet cannot send a few txs; keep in sync with src/lib/useOnboarding.ts
const START_BALANCE = parseEther("1000");

const json = (body: object, status = 200) => Response.json(body, { status });

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    // Only a logged-in Privy user, and only their own wallet: random addresses cannot drain the faucet.
    const account = await callerAccount(request);
    if (!account) return json({ error: "Please sign in first." }, 401);
    const { address, email } = account;

    // Remember Google email → wallet so officers can match the class list to on-chain payments. Fail-soft.
    if (email) await members().doc(email).set({ address, updatedAt: Date.now() }).catch((e) => console.error("member save failed:", e?.message ?? e));

    try {
      // The chain is the memory: only top up what is missing, so repeat calls cost nothing.
      // shortcut: a user who empties their wallet can be topped up again, and two parallel calls can double-drip. Fine on testnet; use Firestore `onboarded` if abused.
      const [gas, tphp] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.readContract({ address: TOKEN_ADDRESS, abi: mockPhpAbi, functionName: "balanceOf", args: [address] }),
      ]);

      const faucet = faucetClient();
      const sent: `0x${string}`[] = [];
      if (gas < MIN_GAS) sent.push(await faucet.sendTransaction({ to: address, value: GAS_DRIP }));
      if (tphp === 0n) {
        sent.push(await faucet.writeContract({ address: TOKEN_ADDRESS, abi: mockPhpAbi, functionName: "mint", args: [address, START_BALANCE] }));
      }
      await Promise.all(sent.map((hash) => publicClient.waitForTransactionReceipt({ hash })));

      return json({ ok: true, topped_up: sent.length > 0, txs: sent });
    } catch (e) {
      console.error("onboard failed:", e instanceof Error ? e.message : e);
      return json({ error: "Onboarding failed" }, 500);
    }
  },
};
