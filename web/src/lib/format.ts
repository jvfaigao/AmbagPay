import { formatEther } from "viem";

/** 150000000000000000000n -> "₱150.00" (tPHP has 18 decimals). */
export function peso(wei: bigint, decimals = 2): string {
  const n = Number(formatEther(wei));
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Whole pesos, for compact tiles: "₱6,750". */
export function pesoShort(wei: bigint): string {
  return peso(wei, 0);
}

export function shortAddress(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function percent(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Math.min(100, Number((part * 10000n) / whole) / 100);
}

export function formatDate(unixSeconds: bigint | number): string {
  const s = Number(unixSeconds);
  if (!s) return "No deadline";
  return new Date(s * 1000).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
