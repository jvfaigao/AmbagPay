// Central app config. Components import from here: no hardcoded addresses elsewhere.
import { bscTestnet, hardhat } from "viem/chains";

const env = import.meta.env;

export const CHAIN_ID = Number(env.VITE_CHAIN_ID || 97) as 97 | 31337;
export const chain = CHAIN_ID === 31337 ? hardhat : bscTestnet;

export const VAULT_ADDRESS = (env.VITE_VAULT_ADDRESS || "") as `0x${string}`;
export const TOKEN_ADDRESS = (env.VITE_TOKEN_ADDRESS || "") as `0x${string}`;
export const DEMO_COLLECTION_ID = Number(env.VITE_DEMO_COLLECTION_ID || 0);

export const RPC_URL: string =
  env.VITE_RPC_URL || (CHAIN_ID === 31337 ? "http://127.0.0.1:8545" : "https://data-seed-prebsc-1-s1.bnbchain.org:8545");

// Empty on the local chain (no explorer), so links are hidden there.
export const EXPLORER_URL = CHAIN_ID === 97 ? "https://testnet.bscscan.com" : "";

export const ORG_NAME = "CpE Student Society";
// Expected number of members for the demo collection ("32 of 45 paid").
export const EXPECTED_MEMBERS = 45;

export const PRIVY_APP_ID: string = env.VITE_PRIVY_APP_ID || "";

export const isConfigured = VAULT_ADDRESS.startsWith("0x") && VAULT_ADDRESS.length === 42 && PRIVY_APP_ID !== "";
