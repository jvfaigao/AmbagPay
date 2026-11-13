import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useReadContracts } from "wagmi";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, ExpenseSteps, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Row } from "../components/ui";
import { EXPECTED_MEMBERS, ORG_NAME, VAULT_ADDRESS } from "../config";
import { COLLECTION_STATUS, RISK_LABEL, vault } from "../lib/contracts";
import { formatDate, percent, peso, pesoShort, shortAddress } from "../lib/format";

const REFRESH_MS = 4000;

export default function Ledger() {
  const { id } = useParams();
  const collectionId = BigInt(id && /^\d+$/.test(id) ? id : 0);

  // 1) Collection, categories and how many expenses exist (all collections share one counter).
  const base = useReadContracts({
    contracts: [
      { ...vault, functionName: "getCollection", args: [collectionId] },
      { ...vault, functionName: "getCategories", args: [collectionId] },
      { ...vault, functionName: "expenseCount" },
    ],
    query: { refetchInterval: REFRESH_MS },
  });

  const collection = base.data?.[0]?.result;
  const categories = base.data?.[1]?.result;
  const expenseCount = Number(base.data?.[2]?.result ?? 0n);

  // 2) Every expense, then keep only this collection's.
  const expensesQuery = useReadContracts({
    contracts: Array.from({ length: expenseCount }, (_, i) => [
      { ...vault, functionName: "getExpense" as const, args: [BigInt(i)] as const },
      { ...vault, functionName: "needsAdviser" as const, args: [BigInt(i)] as const },
    ]).flat(),
    query: { enabled: expenseCount > 0, refetchInterval: REFRESH_MS },
  });

  const expenses = Array.from({ length: expenseCount }, (_, i) => ({
    id: i,
    e: expensesQuery.data?.[i * 2]?.result as Expense | undefined,
    needsAdviser: expensesQuery.data?.[i * 2 + 1]?.result === true,
  }))
    .filter((x) => x.e && x.e.collectionId === collectionId)
    .reverse(); // newest first

  // 3) Off-chain titles + agent reasons (Firestore via /api). Optional: the ledger still works from chain data alone.
  const receipts = useQuery({
    queryKey: ["receipts", collectionId.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/receipts?collectionId=${collectionId}`);
      if (!res.ok) throw new Error("receipts unavailable");
      return (await res.json()).expenses as Record<number, { title: string | null; reason: string }>;
    },
    refetchInterval: 10_000,
    retry: false,
  });

  if (base.isLoading) {
    return (
      <Layout title="Public Ledger" subtitle={ORG_NAME}>
        <LoadingCard />
      </Layout>
    );
  }

  const failure = base.error?.message ?? base.data?.[0]?.error?.message;
  if (!collection || !categories) {
    return (
      <Layout title="Public Ledger" subtitle={ORG_NAME}>
        <ErrorCard message={failure ?? "Collection not found."} />
      </Layout>
    );
  }

  const left = collection.totalCollected - collection.totalSpent;
  const closed = collection.status === COLLECTION_STATUS.Closed;

  return (
    <Layout
      title="Public Ledger"
      subtitle={collection.name}
      footnote="Anyone can view this page · Live from BNB Smart Chain"
      wide
    >
      {/* Laptop/projector: summary on the left (sticky), expenses on the right. Phone: one column. */}
      <div className="grid items-start gap-3.5 lg:grid-cols-[5fr_7fr] lg:gap-6">
      <div className="flex flex-col gap-3.5 lg:sticky lg:top-6">
      <div className="flex gap-2">
        <Stat label="Collected" value={pesoShort(collection.totalCollected)} />
        <Stat label="Spent" value={pesoShort(collection.totalSpent)} />
        <Stat label="Left" value={pesoShort(left)} />
      </div>
      <p className="text-xs text-muted">
        Money is held by the AmbagVault contract, not by any officer.{" "}
        <ExplorerLink path={`address/${VAULT_ADDRESS}#tokentxns`}>See every transfer on BscScan</ExplorerLink>
      </p>

      <Card className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <Eyebrow>Contributions</Eyebrow>
          <Chip tone={closed ? "neutral" : "green"}>{closed ? "Closed" : "Open"}</Chip>
        </div>
        <Row label={`${peso(collection.amountPerMember)} per member`} value={`${collection.payerCount} of ${EXPECTED_MEMBERS} paid`} />
        <ProgressBar value={Math.min(100, (collection.payerCount / EXPECTED_MEMBERS) * 100)} />
        <p className="text-xs text-muted">Due {formatDate(collection.deadline)}</p>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Budget by category</Eyebrow>
        {categories.map((c) => (
          <div key={c.name} className="flex flex-col gap-1.5">
            <Row label={c.name} value={`${pesoShort(c.spent)} / ${pesoShort(c.cap)}`} />
            <ProgressBar value={percent(c.spent, c.cap)} />
          </div>
        ))}
      </Card>
      </div>

      <Card className="px-4 py-3 lg:px-6 lg:py-5">
        <Eyebrow>Expenses</Eyebrow>
        {expenses.length === 0 ? (
          <p className="py-4 text-sm text-muted">Wala pang gastos sa collection na ito. Bawat gastos ay lalabas dito kasama ang resibo at approvals.</p>
        ) : (
          expenses.map(({ id: expenseId, e, needsAdviser }) => {
            const exp = e!;
            const categoryName = categories[exp.categoryIndex]?.name ?? "Uncategorized";
            const offChain = receipts.data?.[expenseId];
            return (
              <div key={expenseId} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span className="flex flex-col">
                    <span className="font-semibold text-dark">{offChain?.title ?? `${categoryName} · Expense #${expenseId}`}</span>
                    {offChain?.title && (
                      <span className="text-xs text-muted">
                        {categoryName} · Expense #{expenseId}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-dark">{pesoShort(exp.amount)}</span>
                </div>
                {offChain?.reason && <p className="text-xs italic">Agent: "{offChain.reason}"</p>}
                <ExpenseSteps status={exp.status} treasurer={exp.treasurerApproved} adviser={exp.adviserApproved} needsAdviser={needsAdviser} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Chip tone={exp.risk === 2 ? "risk" : exp.risk === 0 ? "green" : "neutral"}>{RISK_LABEL[exp.risk]} risk</Chip>
                  <span className="text-muted">to {shortAddress(exp.payee)}</span>
                  {exp.receiptURI && (
                    <a href={exp.receiptURI} target="_blank" rel="noreferrer" className="font-semibold text-green underline-offset-2 hover:underline">
                      Receipt ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[14px] border border-line bg-paper p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-lg font-bold text-dark lg:text-3xl">{value}</p>
    </div>
  );
}

type Expense = {
  collectionId: bigint;
  categoryIndex: number;
  amount: bigint;
  payee: string;
  receiptURI: string;
  risk: number;
  status: number;
  treasurerApproved: boolean;
  adviserApproved: boolean;
};
