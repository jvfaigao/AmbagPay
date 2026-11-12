import { http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { bscTestnet, hardhat } from "viem/chains";
import { chain, RPC_URL } from "./config";

// Privy drives the connector (embedded wallet); the only chain is the one in config.ts.
// Both ids are listed only to satisfy the type; RPC_URL already matches the active chain.
export const wagmiConfig = createConfig({
  chains: [chain],
  transports: { [bscTestnet.id]: http(RPC_URL), [hardhat.id]: http(RPC_URL) },
});
