// Server-side chain access (never imported by the browser). Keys come from process.env only.
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet, hardhat } from "viem/chains";

const chain = Number(process.env.CHAIN_ID || 97) === 31337 ? hardhat : bscTestnet;
export const CHAIN_ID = chain.id;
const rpc = process.env.RPC_URL || process.env.BSC_TESTNET_RPC || undefined;

export const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS as `0x${string}`;
export const VAULT_ADDRESS = process.env.VAULT_ADDRESS as `0x${string}`;

export const publicClient = createPublicClient({ chain, transport: http(rpc) });

function walletFrom(envName: "FAUCET_PRIVATE_KEY" | "AGENT_PRIVATE_KEY") {
  const key = process.env[envName];
  if (!key) throw new Error(`${envName} is not set`);
  return createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain, transport: http(rpc) });
}

/** Faucet = owner of MockPHP: sends the gas drip and mints test pesos. */
export const faucetClient = () => walletFrom("FAUCET_PRIVATE_KEY");

/** Agent wallet: has ONLY AGENT_ROLE, so it can only propose expenses. */
export const agentClient = () => walletFrom("AGENT_PRIVATE_KEY");
