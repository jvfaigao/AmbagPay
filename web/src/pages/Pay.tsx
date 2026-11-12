import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Row } from "../components/ui";
import { CHAIN_ID, EXPECTED_MEMBERS, ORG_NAME, VAULT_ADDRESS } from "../config";
import { COLLECTION_STATUS, token, vault } from "../lib/contracts";
import { friendlyError } from "../lib/errors";
import { formatDate, percent, peso, pesoShort, shortAddress } from "../lib/format";

const REFRESH_MS = 4000;
const MIN_GAS = parseEther("0.002"); // keep in sync with api/onboard.ts

type Step = "idle" | "approving" | "paying" | "done";

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
    ],
    query: { enabled: !!address, refetchInterval: REFRESH_MS },
  });
  const gas = useBalance({ address, chainId: CHAIN_ID, query: { enabled: !!address, refetchInterval: REFRESH_MS } });

  const collection = base.data?.[0]?.result;
  const categories = base.data?.[1]?.result;
  const hasPaid = mine.data?.[0]?.result;
  const balance = mine.data?.[1]?.result;

  // First login: ask the server to top up gas + test pesos once. The server re-checks the chain.
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string>();
  const onboardTried = useRef(false);
  const refetchMine = mine.refetch;
  const refetchGas = gas.refetch;
  useEffect(() => {
    if (!address || balance === undefined || gas.data === undefined || onboardTried.current) return;
    if (balance > 0n && gas.data.value >= MIN_GAS) return;
    onboardTried.current = true;
    setOnboarding(true);
    fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Hindi na-setup ang wallet. Subukan ulit mamaya."))))
      .then(() => Promise.all([refetchMine(), refetchGas()]))
      .catch((e: Error) => setOnboardError(e.message))
      .finally(() => setOnboarding(false));
  }, [address, balance, gas.data, refetchMine, refetchGas]);

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<`0x${string}`>();

  async function confirmed(hash: `0x${string}`) {
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Hindi natuloy ang transaction.");
  }

  async function onPay() {
    if (!collection || !publicClient) return;
    setError(undefined);
    try {
      setStep("approving");
      const approveHash = await writeContractAsync({ ...token, functionName: "approve", args: [VAULT_ADDRESS, collection.amountPerMember] });
      await confirmed(approveHash);

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

  if (base.isLoading) {
    return (
      <Layout title="Pay" subtitle={ORG_NAME}>
        <LoadingCard />
      </Layout>
    );
  }
  if (!collection || !categories) {
    return (
      <Layout title="Pay" subtitle={ORG_NAME}>
        <ErrorCard message={base.error?.message ?? base.data?.[0]?.error?.message ?? "Collection not found."} />
      </Layout>
    );
  }

  const closed = collection.status === COLLECTION_STATUS.Closed;
  const tooPoor = balance !== undefined && balance < collection.amountPerMember;
  const busy = step === "approving" || step === "paying";
  const paid = hasPaid === true || step === "done";

  return (
    <Layout title="Pay your share" subtitle={collection.name} footnote="Gas fee is covered by AmbagPay.">
      <Card className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <Eyebrow>Contribution</Eyebrow>
          <Chip tone={closed ? "neutral" : "green"}>{closed ? "Closed" : "Open"}</Chip>
        </div>
        <p className="font-display text-3xl font-bold text-dark">{peso(collection.amountPerMember)}</p>
        <Row label="Paid so far" value={`${collection.payerCount} of ${EXPECTED_MEMBERS}`} />
        <ProgressBar value={Math.min(100, (collection.payerCount / EXPECTED_MEMBERS) * 100)} />
        <p className="text-xs text-muted">Due {formatDate(collection.deadline)}</p>
      </Card>

      <Card className="flex flex-col gap-2.5">
        <Eyebrow>Where it goes</Eyebrow>
        {categories.map((c) => (
          <div key={c.name} className="flex flex-col gap-1.5">
            <Row label={c.name} value={`${pesoShort(c.spent)} / ${pesoShort(c.cap)}`} />
            <ProgressBar value={percent(c.spent, c.cap)} />
          </div>
        ))}
      </Card>

      {!ready ? null : !authenticated ? (
        <button onClick={login} className="h-14 rounded-[14px] bg-gold text-base font-bold text-dark">
          Sign in with Google to pay
        </button>
      ) : paid ? (
        <Card className="flex flex-col items-start gap-1.5">
          <Chip tone="green">Paid ✓</Chip>
          <p className="text-sm">Salamat! Makikita mo na ang bayad mo sa public ledger.</p>
          {txHash && (
            <p className="text-xs text-muted">
              Tx {shortAddress(txHash)} <ExplorerLink path={`tx/${txHash}`}>BscScan</ExplorerLink>
            </p>
          )}
          <Link to={`/ledger/${collectionId}`} className="text-sm font-semibold text-green">
            View public ledger →
          </Link>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-1.5">
            <Row label="Your balance" value={balance === undefined ? "…" : peso(balance)} />
            {onboarding && <p className="text-xs text-muted">Setting up your wallet…</p>}
            {onboardError && <p className="text-xs text-risk">{onboardError}</p>}
            {tooPoor && !onboarding && <p className="text-xs text-risk">Kulang ang tPHP mo para sa bayad na ito.</p>}
          </Card>
          {error && <ErrorCard message={error} />}
          <button
            onClick={onPay}
            disabled={busy || onboarding || closed || tooPoor || balance === undefined}
            className="h-14 rounded-[14px] bg-gold text-base font-bold text-dark disabled:opacity-50"
          >
            {step === "approving"
              ? "Step 1 of 2 · Approving…"
              : step === "paying"
                ? "Step 2 of 2 · Paying…"
                : `Pay ${peso(collection.amountPerMember)} · no gas fee`}
          </button>
        </>
      )}
    </Layout>
  );
}
