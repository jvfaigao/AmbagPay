// Server-side chain access (never imported by the browser). Keys come from process.env only.
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet, hardhat } from "viem/chains";

const chain = Number(process.env.CHAIN_ID || 97) === 31337 ? hardhat : bscTestnet;
const rpc = process.env.RPC_URL || process.env.BSC_TESTNET_RPC || undefined;

export const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as `0x${string}`;

export const publicClient = createPublicClient({ chain, transport: http(rpc) });

/** Faucet = owner of MockPHP: sends the gas drip and mints test pesos. */
export function faucetClient() {
  const key = process.env.FAUCET_PRIVATE_KEY;
  if (!key) throw new Error("FAUCET_PRIVATE_KEY is not set");
  return createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain, transport: http(rpc) });
}
