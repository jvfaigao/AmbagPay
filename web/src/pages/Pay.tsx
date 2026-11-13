import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import FeeList from "../components/FeeList";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Row } from "../components/ui";
import { CHAIN_ID, EXPECTED_MEMBERS, ORG_NAME, VAULT_ADDRESS } from "../config";
import { COLLECTION_STATUS, token, vault } from "../lib/contracts";
import { friendlyError } from "../lib/errors";
import { formatDate, percent, peso, pesoShort, shortAddress } from "../lib/format";
import { useOnboarding } from "../lib/useOnboarding";

const REFRESH_MS = 4000;

type Step = "idle" | "approving" | "paying" | "done" | "claiming" | "claimed";

export default function Pay() {
  const { id } = useParams();
  const collectionId = BigInt(id && /^\d+$/.test(id) ? id : 0);

  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();

  const base = useReadContracts({
    contracts: [
      { ...vault, functionName: "getCollection", args: [collectionId] },
      { ...vault, functionName: "getCategories", args: [collectionId] },
    ],
    query: { refetchInterval: REFRESH_MS },
  });
  const mine = useReadContracts({
    contracts: [
      { ...vault, functionName: "hasPaid", args: [collectionId, address!] },
      { ...token, functionName: "balanceOf", args: [address!] },
      { ...vault, functionName: "hasClaimed", args: [collectionId, address!] },
      { ...token, functionName: "allowance", args: [address!, VAULT_ADDRESS] },
    ],
    query: { enabled: !!address, refetchInterval: REFRESH_MS },
  });

  const collection = base.data?.[0]?.result;
  const categories = base.data?.[1]?.result;
  const hasPaid = mine.data?.[0]?.result;
  const balance = mine.data?.[1]?.result;
  const hasClaimed = mine.data?.[2]?.result;
  const allowance = mine.data?.[3]?.result;

  const { onboarding, onboardError } = useOnboarding(address, balance, mine.refetch);

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<`0x${string}`>();

  async function confirmed(hash: `0x${string}`) {
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction did not go through.");
  }

  async function onPay() {
    if (!collection || !publicClient) return;
    setError(undefined);
    try {
      // A retry after a failed pay already has the allowance: skip straight to step 2.
      if (allowance === undefined || allowance < collection.amountPerMember) {
        setStep("approving");
        const approveHash = await writeContractAsync({ ...token, functionName: "approve", args: [VAULT_ADDRESS, collection.amountPerMember] });
        await confirmed(approveHash);
      }

      setStep("paying");
      const payHash = await writeContractAsync({ ...vault, functionName: "pay", args: [collectionId] });
      await confirmed(payHash);

      setTxHash(payHash);
      setStep("done");
      await Promise.all([base.refetch(), mine.refetch()]);
    } catch (e) {
      setError(friendlyError(e));
      setStep("idle");
    }
  }

  async function onClaim() {
    setError(undefined);
    try {
      setStep("claiming");
      const hash = await writeContractAsync({ ...vault, functionName: "claimRefund", args: [collectionId] });
      await confirmed(hash);
      setTxHash(hash);
      setStep("claimed");
      await mine.refetch();
    } catch (e) {
      setError(friendlyError(e));
      setStep("idle");
    }
  }

  if (base.isLoading) {
    return (
      <Layout title="AmbagPay" subtitle={ORG_NAME}>
        <LoadingCard />
      </Layout>
    );
  }
  if (!collection || !categories) {
    return (
      <Layout title="AmbagPay" subtitle={ORG_NAME}>
        <ErrorCard message={friendlyError(base.error ?? base.data?.[0]?.error ?? new Error("Collection not found."))} />
      </Layout>
    );
  }

  const closed = collection.status === COLLECTION_STATUS.Closed;
  const tooPoor = balance !== undefined && balance < collection.amountPerMember;
  const busy = step === "approving" || step === "paying" || step === "claiming";
  const paid = hasPaid === true || step === "done";
  const refund = collection.refundPerMember;
  const claimed = hasClaimed === true || step === "claimed";
  const canClaim = closed && hasPaid === true && refund > 0n && !claimed;
  const amount = peso(collection.amountPerMember);

  // The one action on this page, pinned above the bottom nav like the deck prototype.
  let action = null;
  if (ready && !authenticated) {
    action = <PrimaryButton onClick={login}>{closed ? "Sign in to claim your refund" : "Sign in with Google to pay"}</PrimaryButton>;
  } else if (ready && canClaim) {
    action = (
      <PrimaryButton onClick={onClaim} disabled={busy}>
        {step === "claiming" ? "Claiming refund…" : `Claim refund ${peso(refund)}`}
      </PrimaryButton>
    );
  } else if (ready && !paid) {
    action = (
      <PrimaryButton onClick={onPay} disabled={busy || onboarding || closed || tooPoor || balance === undefined}>
        {step === "approving"
          ? "Step 1 of 2 · Approving…"
          : step === "paying"
            ? "Step 2 of 2 · Paying…"
            : closed
              ? "Collection closed"
              : `Pay ${amount} · no gas fee`}
      </PrimaryButton>
    );
  }

  return (
    <Layout
      title="AmbagPay"
      subtitle={ORG_NAME}
      bottom={
        action && (
          <>
            {action}
            <p className="pt-2 text-center text-xs text-muted">Secured by a smart contract on BNB Smart Chain</p>
          </>
        )
      }
    >
      <Card className="flex flex-col gap-2.5 p-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Collection</Eyebrow>
          <Chip tone={closed ? "neutral" : "green"}>{closed ? "Closed" : "Open"}</Chip>
        </div>
        <h1 className="font-display text-xl font-bold text-dark">{collection.name}</h1>
        <p className="font-display text-5xl font-bold tracking-tight text-dark">{amount}</p>
        <Row label="Due" value={formatDate(collection.deadline)} />
        <Row label="Members paid" value={`${collection.payerCount} of ${EXPECTED_MEMBERS}`} />
        <ProgressBar value={Math.min(100, (collection.payerCount / EXPECTED_MEMBERS) * 100)} />
      </Card>

      <Card className="flex flex-col gap-2.5 p-5">
        <Eyebrow>Where it goes</Eyebrow>
        {categories.map((c) => (
          <div key={c.name} className="flex flex-col gap-1.5">
            <Row label={c.name} value={`${pesoShort(c.spent)} spent · ${pesoShort(c.cap)} cap`} />
            <ProgressBar value={percent(c.spent, c.cap)} />
          </div>
        ))}
      </Card>

      {authenticated && paid ? (
        <Card className="flex flex-col items-start gap-2 bg-greenbg p-5 shadow-none">
          <Chip tone="green">Paid ✓</Chip>
          <p className="text-sm text-dark">Thank you! Your payment is recorded on BNB Smart Chain.</p>
          {closed && (
            <p className="text-sm text-dark">
              {claimed
                ? `Refund claimed ✓ ${peso(refund)} was returned to your wallet.`
                : refund > 0n
                  ? `This collection is closed. Your refund: ${peso(refund)}.`
                  : "This collection is closed. No funds were left to refund."}
            </p>
          )}
          {txHash && (
            <p className="text-xs text-muted">
              Tx {shortAddress(txHash)} <ExplorerLink path={`tx/${txHash}`}>BscScan</ExplorerLink>
            </p>
          )}
          <Link to={`/ledger/${collectionId}`} className="text-sm font-semibold text-green underline-offset-2 hover:underline">
            See it on the public ledger
          </Link>
          <Link to="/payments" className="text-sm font-semibold text-green underline-offset-2 hover:underline">
            See all my payments
          </Link>
        </Card>
      ) : authenticated ? (
        <div className="flex flex-col gap-1 px-1">
          <Row label="Your balance" value={balance === undefined ? "…" : `${peso(balance)} tPHP`} />
          {onboarding && <p className="text-xs text-muted">Setting up your wallet…</p>}
          {onboardError && <p className="text-xs text-risk">{onboardError}</p>}
          {tooPoor && !onboarding && <p className="text-xs text-risk">Not enough tPHP for this payment.</p>}
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">Sign in with Google. We create a wallet for you and give you test pesos; no gas fee.</p>
      )}
      {error && <ErrorCard title="Payment failed" message={error} />}
      <FeeList currentId={collectionId} member={address} />
    </Layout>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-14 w-full rounded-2xl bg-gold text-base font-bold text-dark shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark disabled:opacity-50"
    >
      {children}
    </button>
  );
}
