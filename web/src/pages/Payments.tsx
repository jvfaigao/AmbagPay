import { useState } from "react";
import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import Layout from "../components/Layout";
import WalletCard from "../components/WalletCard";
import { Card, Chip, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Row, Stats } from "../components/ui";
import { ORG_NAME } from "../config";
import { COLLECTION_STATUS } from "../lib/contracts";
import { formatDate, percent, peso, pesoShort, shortAddress } from "../lib/format";
import { useCollections, type CollectionSummary } from "../lib/useCollections";
import { formatDateTime, usePaidEvents, type Payment } from "../lib/usePaidEvents";

const link = "font-semibold text-green underline-offset-2 hover:underline";

/** A member's own history: every fee, paid or not, with date, tx and how much of their share was spent. */
export default function Payments() {
  const { ready, authenticated, login, user } = usePrivy();
  const { address } = useAccount();
  const { collections, isLoading } = useCollections(address);
  const events = usePaidEvents({ member: address }, !!address);
  const [open, setOpen] = useState<{ c: CollectionSummary; p: Payment }>();

  if (ready && !authenticated) {
    return (
      <Layout title="My payments" subtitle={ORG_NAME}>
        <Card className="flex flex-col gap-3 p-5">
          <h1 className="font-display text-xl font-bold text-dark">See what you have paid</h1>
          <p className="text-sm">
            Sign in with the same Google account you paid with. You will see every fee, what you paid, when, and how much of it has been spent.
          </p>
          <button onClick={login} className="h-14 rounded-2xl bg-gold text-base font-bold text-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark">
            Sign in with Google
          </button>
        </Card>
      </Layout>
    );
  }
  if (!ready || !address || isLoading) {
    return (
      <Layout title="My payments" subtitle={ORG_NAME}>
        <LoadingCard />
      </Layout>
    );
  }

  const paid = collections.filter((c) => c.paid);
  const unpaid = collections.filter((c) => !c.paid);
  const total = paid.reduce((s, c) => s + c.amountPerMember, 0n);
  const due = unpaid.filter((c) => c.status === COLLECTION_STATUS.Open).reduce((s, c) => s + c.amountPerMember, 0n);
  // Cheapest open fee still unpaid: if the balance is below this, the member cannot pay any fee.
  const nextDue = unpaid
    .filter((c) => c.status === COLLECTION_STATUS.Open)
    .reduce<CollectionSummary | undefined>((min, c) => (!min || c.amountPerMember < min.amountPerMember ? c : min), undefined);
  const paymentFor = (id: bigint) => events.data?.find((p) => p.collectionId === id);

  return (
    <Layout title="My payments" subtitle={ORG_NAME}>
      <WalletCard address={address} nextDue={nextDue && { name: nextDue.name, amount: nextDue.amountPerMember }} />
      <Stats
        items={[
          { label: "Total paid", value: pesoShort(total) },
          { label: "Fees paid", value: `${paid.length} of ${collections.length}` },
          { label: "Still due", value: pesoShort(due) },
        ]}
      />

      <Card className="flex flex-col px-4 py-3">
        <Eyebrow>Paid</Eyebrow>
        {paid.length === 0 && <p className="py-2 text-sm text-muted">You have not paid any fee yet.</p>}
        {paid.map((c) => {
          const p = paymentFor(c.id);
          // Every member pays the same amount, so each share is spent at the same rate as the whole fee.
          const used = c.totalCollected > 0n ? (c.totalSpent * c.amountPerMember) / c.totalCollected : 0n;
          return (
            <div key={c.id.toString()} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-semibold text-dark">{c.name}</span>
                <span className="font-semibold tabular-nums text-dark">{peso(c.amountPerMember)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <Chip tone="green">Paid ✓</Chip>
                <span className="text-muted">{p ? formatDateTime(p.timestamp) : events.isLoading ? "Loading date…" : "Recorded on-chain"}</span>
                {p && <span className="font-mono text-muted">{shortAddress(p.txHash)}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-3 text-xs">
                  <span>Your share used so far</span>
                  <span className="font-semibold tabular-nums text-dark">
                    {peso(used)} of {peso(c.amountPerMember)}
                  </span>
                </div>
                <ProgressBar value={percent(used, c.amountPerMember)} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {p && (
                  <button onClick={() => setOpen({ c, p })} className={link}>
                    Payment receipt
                  </button>
                )}
                <Link to={`/ledger/${c.id}`} className={link}>
                  Where the money went ›
                </Link>
                {p && <ExplorerLink path={`tx/${p.txHash}`}>BscScan</ExplorerLink>}
              </div>
            </div>
          );
        })}
      </Card>

      {unpaid.length > 0 && (
        <Card className="flex flex-col px-4 py-3">
          <Eyebrow>Not paid yet</Eyebrow>
          {unpaid.map((c) => {
            const closed = c.status === COLLECTION_STATUS.Closed;
            return (
              <div key={c.id.toString()} className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold text-dark">{c.name}</span>
                  <span className="font-semibold tabular-nums text-dark">{peso(c.amountPerMember)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <Chip tone={closed ? "neutral" : "gold"}>{closed ? "Closed" : `Due ${formatDate(c.deadline)}`}</Chip>
                  {!closed && (
                    <Link to={`/pay/${c.id}`} className={link}>
                      Pay now ›
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {events.isError && <p className="px-1 text-xs text-muted">Payment dates could not be loaded right now. Your paid status still comes straight from the contract.</p>}

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Payment receipt" className="fixed inset-0 z-30 grid place-items-center bg-dark/45 p-4" onClick={() => setOpen(undefined)}>
          <div className="flex w-full max-w-sm flex-col gap-2.5 rounded-[20px] bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <Eyebrow>Payment receipt</Eyebrow>
            <p className="font-display text-lg font-bold text-dark">{open.c.name}</p>
            <p className="font-display text-4xl font-bold tabular-nums text-dark">{peso(open.p.amount)}</p>
            <Row label="Paid by" value={user?.google?.email ?? shortAddress(open.p.member)} />
            <Row label="Date" value={formatDateTime(open.p.timestamp)} />
            <Row label="Wallet" value={shortAddress(open.p.member)} />
            <Row label="Transaction" value={shortAddress(open.p.txHash)} />
            <div className="flex items-center justify-between pt-1">
              <ExplorerLink path={`tx/${open.p.txHash}`}>View on BscScan</ExplorerLink>
              <button autoFocus onClick={() => setOpen(undefined)} className="h-10 rounded-xl bg-sand px-4 text-sm font-semibold text-dark">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
