import { BaseError, ContractFunctionRevertedError } from "viem";

// Contract custom error -> friendly text (table in docs/ARCHITECTURE.md).
const CONTRACT_ERRORS: Record<string, string> = {
  AlreadyPaid: "Bayad ka na sa collection na ito.",
  ReceiptAlreadyUsed: "Nagamit na ang resibong ito.",
  OverBudget: "Lagpas na sa budget ng category.",
  InsufficientFunds: "Kulang ang pondo ng collection.",
  AdviserRequired: "Kailangan ng approval ng adviser.",
  NotApproved: "Hindi pa naa-approve ng treasurer.",
  NotApprover: "Wala kang permiso para dito.",
  NotProposer: "Wala kang permiso para dito.",
  PendingExpenses: "May pending pa na gastos.",
  NothingToClaim: "Wala kang refund na makukuha.",
  NotOpen: "Closed na ang collection na ito.",
  NotClosed: "Hindi pa closed ang collection.",
  InvalidInput: "May kulang o mali sa form (pangalan, halaga o categories).",
};

export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
    if (e.walk((x) => x instanceof Error && x.name === "UserRejectedRequestError")) return "Kinansela ang transaction.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "May error. Subukan ulit.";
}
