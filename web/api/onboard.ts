// POST /api/onboard { address } -> gives a new wallet a little gas + ₱1,000 tPHP.
import { isAddress, parseEther } from "viem";
import { mockPhpAbi } from "../src/abi/MockPHP";
import { faucetClient, publicClient, TOKEN_ADDRESS } from "./_lib/chain";

const GAS_DRIP = parseEther("0.005");
const MIN_GAS = parseEther("0.002"); // below this a wallet cannot send a few txs; keep in sync with Pay.tsx
const START_BALANCE = parseEther("1000");

const json = (body: object, status = 200) => Response.json(body, { status });

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    const body = (await request.json().catch(() => null)) as { address?: string } | null;
    const address = body?.address;
    if (!address || !isAddress(address)) return json({ error: "Invalid address" }, 400);

    try {
      // The chain is the memory: only top up what is missing, so repeat calls cost nothing.
      // shortcut: a wallet that empties itself can be topped up again, and two parallel calls can double-drip. Fine on testnet; use Firestore `onboarded` if abused.
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
