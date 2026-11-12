// Privy's documented workaround: EVM-only app, so stub the optional Solana peer that breaks the Vite build.
export function getTransferSolInstruction(): never {
  throw new Error("@solana-program/system is not installed (AmbagPay does not use Solana wallets).");
}
