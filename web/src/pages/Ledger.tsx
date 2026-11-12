import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useReadContracts } from "wagmi";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Row } from "../components/ui";
import { EXPECTED_MEMBERS, ORG_NAME, VAULT_ADDRESS } from "../config";
import { COLLECTION_STATUS, EXPENSE_STATUS, RISK_LABEL, vault } from "../lib/contracts";
import { formatDate, percent, peso, pesoShort } from "../lib/format";

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
    contracts: Array.from({ length: expenseCount }, (_, i) => ({
      ...vault,
      functionName: "getExpense" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: expenseCount > 0, refetchInterval: REFRESH_MS },
  });

  const expenses = (expensesQuery.data ?? [])
    .map((r, i) => ({ id: i, e: r.result }))
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
    >
      <div className="flex gap-2">
        <Stat label="Collected" value={pesoShort(collection.totalCollected)} />
        <Stat label="Spent" value={pesoShort(collection.totalSpent)} />
        <Stat label="Left" value={pesoShort(left)} />
      </div>

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

      <Card className="px-4 py-1">
        {expenses.length === 0 ? (
          <p className="py-4 text-sm text-muted">Wala pang gastos sa collection na ito.</p>
        ) : (
          expenses.map(({ id: expenseId, e }) => {
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusChip status={exp.status} treasurer={exp.treasurerApproved} adviser={exp.adviserApproved} risk={exp.risk} />
                  {exp.receiptURI && (
                    <a href={exp.receiptURI} target="_blank" rel="noreferrer" className="text-xs font-semibold text-green">
                      Receipt ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>

      <div className="flex justify-center">
        <ExplorerLink path={`address/${VAULT_ADDRESS}`}>View the contract on BscScan</ExplorerLink>
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[14px] border border-line bg-paper p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="font-display text-lg font-bold text-dark">{value}</p>
    </div>
  );
}

function StatusChip({ status, treasurer, adviser, risk }: { status: number; treasurer: boolean; adviser: boolean; risk: number }) {
  if (status === EXPENSE_STATUS.Executed) {
    return <Chip tone="green">Paid · {adviser ? "Treasurer + Adviser" : "Treasurer approved"}</Chip>;
  }
  if (status === EXPENSE_STATUS.Rejected) {
    return <Chip tone="risk">Rejected · {RISK_LABEL[risk]} risk</Chip>;
  }
  const waitingFor = !treasurer ? "treasurer" : "adviser";
  return (
    <Chip tone={risk === 2 ? "risk" : "neutral"}>
      Pending · waiting for {waitingFor} · {RISK_LABEL[risk]} risk
    </Chip>
  );
}
