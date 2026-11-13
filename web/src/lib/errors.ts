import { BaseError, ContractFunctionRevertedError } from "viem";

// Contract custom error -> friendly English text.
const CONTRACT_ERRORS: Record<string, string> = {
  AlreadyPaid: "You already paid this collection.",
  ReceiptAlreadyUsed: "This receipt was already used.",
  OverBudget: "Over the category budget.",
  InsufficientFunds: "The collection does not have enough funds.",
  AdviserRequired: "Adviser approval is required.",
  NotApproved: "The treasurer has not approved this yet.",
  NotApprover: "You do not have permission to do this.",
  NotProposer: "You do not have permission to do this.",
  PendingExpenses: "There are still pending expenses.",
  NothingToClaim: "You have no refund to claim.",
  NotOpen: "This collection is already closed.",
  NotClosed: "This collection is not closed yet.",
  CollectionNotFound: "This collection does not exist. Check the link or QR code.",
  ExpenseNotFound: "This expense does not exist.",
  InvalidCategory: "That category does not exist in this collection.",
  InvalidInput: "Something is missing or wrong in the form (name, amount or categories).",
};

export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name];
    if (e.walk((x) => x instanceof Error && x.name === "UserRejectedRequestError")) return "Transaction cancelled.";
    if (/insufficient funds/i.test(e.message)) return "Not enough gas in your wallet. Refresh the page to get a top-up, then try again.";
    if (e.walk((x) => x instanceof Error && (x.name === "HttpRequestError" || x.name === "TimeoutError")))
      return "Cannot reach BNB Smart Chain right now. Check your internet and try again.";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}
