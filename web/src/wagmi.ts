import { createConfig, http } from "wagmi";
import { bscTestnet, hardhat } from "viem/chains";
import { CHAIN_ID, RPC_URL } from "./config";

// Read-only config for now. Phase 3 swaps this for Privy's wagmi config (Google login + embedded wallet).
export const wagmiConfig = createConfig({
  chains: [bscTestnet, hardhat],
  transports: {
    [bscTestnet.id]: http(CHAIN_ID === 97 ? RPC_URL : undefined),
    [hardhat.id]: http(CHAIN_ID === 31337 ? RPC_URL : undefined),
  },
});
