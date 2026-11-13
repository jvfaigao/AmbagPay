import { keccak256, toBytes } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { vault } from "./contracts";

export const TREASURER_ROLE = keccak256(toBytes("TREASURER_ROLE"));
export const ADVISER_ROLE = keccak256(toBytes("ADVISER_ROLE"));
export const ADMIN_ROLE = keccak256(toBytes("ADMIN_ROLE"));

/** The signed-in wallet's on-chain roles. All false while logged out or loading. */
export function useRoles() {
  const { address } = useAccount();
  const roles = useReadContracts({
    contracts: [
      { ...vault, functionName: "hasRole", args: [TREASURER_ROLE, address!] },
      { ...vault, functionName: "hasRole", args: [ADVISER_ROLE, address!] },
      { ...vault, functionName: "hasRole", args: [ADMIN_ROLE, address!] },
    ],
    query: { enabled: !!address },
  });
  return {
    address,
    isLoading: !!address && roles.isLoading,
    isTreasurer: roles.data?.[0]?.result === true,
    isAdviser: roles.data?.[1]?.result === true,
    isAdmin: roles.data?.[2]?.result === true,
    refetch: roles.refetch,
  };
}
