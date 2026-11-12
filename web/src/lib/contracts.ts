import { ambagVaultAbi } from "../abi/AmbagVault";
import { mockPhpAbi } from "../abi/MockPHP";
import { CHAIN_ID, TOKEN_ADDRESS, VAULT_ADDRESS } from "../config";

export const vault = { address: VAULT_ADDRESS, abi: ambagVaultAbi, chainId: CHAIN_ID } as const;
export const token = { address: TOKEN_ADDRESS, abi: mockPhpAbi, chainId: CHAIN_ID } as const;

// Mirrors the enums in AmbagVault.sol
export const RISK_LABEL = ["LOW", "MEDIUM", "HIGH"] as const;
export const EXPENSE_STATUS = { Proposed: 0, Executed: 1, Rejected: 2 } as const;
export const COLLECTION_STATUS = { Open: 0, Closed: 1 } as const;
