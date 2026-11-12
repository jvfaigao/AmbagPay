import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { keccak256, toBytes } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink, LoadingCard, Row } from "../components/ui";
import { CHAIN_ID, DEMO_COLLECTION_ID, ORG_NAME } from "../config";
import { EXPENSE_STATUS, RISK_LABEL, vault } from "../lib/contracts";
import { friendlyError } from "../lib/errors";
import { shrinkImage } from "../lib/image";
import { peso, shortAddress } from "../lib/format";
import { useOnboarding } from "../lib/useOnboarding";

const REFRESH_MS = 4000;
const TREASURER_ROLE = keccak256(toBytes("TREASURER_ROLE"));
const ADVISER_ROLE = keccak256(toBytes("ADVISER_ROLE"));
const collectionId = BigInt(DEMO_COLLECTION_ID);

type Category = { name: string; cap: bigint; spent: bigint };

export default function Officer() {
  const { ready, authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { onboarding, onboardError } = useOnboarding(address, null, () => undefined);

  const roles = useReadContracts({
    contracts: [
      { ...vault, functionName: "hasRole", args: [TREASURER_ROLE, address!] },
      { ...vault, functionName: "hasRole", args: [ADVISER_ROLE, address!] },
    ],
    query: { enabled: !!address },
  });
  const base = useReadContracts({
    contracts: [
      { ...vault, functionName: "getCategories", args: [collectionId] },
      { ...vault, functionName: "expenseCount" },
    ],
    query: { refetchInterval: REFRESH_MS },
  });

  const isTreasurer = roles.data?.[0]?.result === true;
  const isAdviser = roles.data?.[1]?.result === true;
  const categories = base.data?.[0]?.result as readonly Category[] | undefined;
  const expenseCount = Number(base.data?.[1]?.result ?? 0n);

  let body;
  if (!ready) body = <LoadingCard label="Loading…" />;
  else if (!authenticated) {
    body = (
      <button onClick={login} className="h-14 rounded-[14px] bg-gold text-base font-bold text-dark">
        Officer login with Google
      </button>
    );
  } else if (!address || roles.isLoading || !categories) body = <LoadingCard />;
  else if (!isTreasurer && !isAdviser) {
    body = (
      <Card className="flex flex-col gap-1.5 text-sm">
        <p className="font-semibold text-dark">Wala kang officer role.</p>
        <p>Ipadala ang address na ito sa admin para ma-grant ang TREASURER o ADVISER role:</p>
        <p className="break-all rounded-lg bg-[#ECE8DC] p-2 font-mono text-xs text-dark">{address}</p>
      </Card>
    );
  } else {
    body = (
      <>
        <Chip tone="green">{isAdviser ? "Adviser" : "Treasurer"}</Chip>
        {onboarding && <p className="text-xs text-muted">Setting up your wallet…</p>}
        {onboardError && <p className="text-xs text-risk">{onboardError}</p>}
        {isTreasurer && !isAdviser && <ReviewPanel address={address} categories={categories} />}
        <PendingList count={expenseCount} categories={categories} isTreasurer={isTreasurer} isAdviser={isAdviser} />
      </>
    );
  }

  return (
    <Layout title="Officer" subtitle={ORG_NAME}>
      {body}
    </Layout>
  );
}

// ───────────────────────── Receipt upload + agent result ─────────────────────────

type Review = {
  extracted: { vendor: string | null; total: number | null } | null;
  categoryIndex: number;
  checks: { id: string; pass: boolean; label: string }[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  outcome: "proposed" | "blocked";
  expenseId?: number;
  txHash?: string;
  blockedBy: string | null;
  imageUrl: string;
};

const LOADING_STEPS = ["Reading receipt…", "Checking duplicates…", "Checking budget…", "Comparing with past expenses…", "Deciding risk…"];

function ReviewPanel({ address, categories }: { address: `0x${string}`; categories: readonly Category[] }) {
  const [image, setImage] = useState<{ base64: string; mimeType: string; previewUrl: string }>();
  const [payee, setPayee] = useState<string>(address);
  const [categoryIndex, setCategoryIndex] = useState<number | null>(null); // null = let the AI choose
  const { getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState<Review>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStepIndex((i) => Math.min(i + 1, LOADING_STEPS.length - 1)), 2500);
    return () => clearInterval(timer);
  }, [busy]);

  async function onPick(file: File | undefined) {
    setResult(undefined);
    setError(undefined);
    setImage(file ? await shrinkImage(file) : undefined);
  }

  async function onReview() {
    if (!image) return;
    setBusy(true);
    setStepIndex(0);
    setResult(undefined);
    setError(undefined);
    try {
      const res = await fetch("/api/agent/review", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({
          collectionId: Number(collectionId),
          imageBase64: image.base64,
          mimeType: image.mimeType,
          payee,
          categoryIndex,
        }),
      });
      const data = await res.json().catch(() => ({ error: "Hindi natapos ang review. Subukan ulit." }));
      if (!res.ok) throw new Error(data.error ?? "Hindi natapos ang review. Subukan ulit.");
      setResult(data as Review);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <Eyebrow>Upload receipt</Eyebrow>
      <label className="flex flex-col gap-1 text-sm">
        <span>Litrato ng resibo</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => onPick(e.target.files?.[0])}
          className="text-sm file:mr-3 file:rounded-[10px] file:border-0 file:bg-[#ECE8DC] file:px-3 file:py-2 file:font-semibold"
        />
      </label>
      {image && <img src={image.previewUrl} alt="Receipt preview" className="max-h-56 rounded-xl border border-line object-contain" />}
      <label className="flex flex-col gap-1 text-sm">
        <span>Category</span>
        <select
          value={categoryIndex ?? ""}
          onChange={(e) => setCategoryIndex(e.target.value === "" ? null : Number(e.target.value))}
          disabled={busy}
          className="rounded-[10px] border border-line bg-white px-3 py-2"
        >
          <option value="">Hayaan ang AI pumili</option>
          {categories.map((c, i) => (
            <option key={c.name} value={i}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">Kapag iba sa hula ng AI, magiging MEDIUM risk ito para makita ng adviser.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Ibabalik kanino? (default: ikaw, ang nag-abono)</span>
        <input
          value={payee}
          onChange={(e) => setPayee(e.target.value.trim())}
          disabled={busy}
          className="rounded-[10px] border border-line bg-white px-3 py-2 font-mono text-xs"
        />
        <span className="text-xs text-muted">Walang wallet ang vendor, kaya ire-reimburse ng vault ang nag-abono.</span>
      </label>
      <button
        onClick={onReview}
        disabled={!image || busy || !/^0x[0-9a-fA-F]{40}$/.test(payee)}
        className="h-12 rounded-[14px] bg-gold text-base font-bold text-dark disabled:opacity-50"
      >
        {busy ? LOADING_STEPS[stepIndex] : "Review with AI"}
      </button>
      {error && <ErrorCard message={error} />}
      {result && <AgentResultCard result={result} categories={categories} />}
    </Card>
  );
}

const NOT_CONTRACT_BLOCKS = ["UnreadableAmount", "UnknownCategory"];

function AgentResultCard({ result, categories }: { result: Review; categories: readonly Category[] }) {
  const category = categories[result.categoryIndex]?.name ?? "—";
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-cream p-4" aria-live="polite">
      <div className="flex items-center justify-between">
        <Eyebrow>Treasurer Agent</Eyebrow>
        <RiskBadge risk={result.risk} />
      </div>
      <Row label="Vendor" value={result.extracted?.vendor ?? "Hindi mabasa"} />
      <Row label="Amount" value={result.extracted?.total != null ? `₱${result.extracted.total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—"} />
      <Row label="Category" value={category} />
      <ul className="flex flex-col gap-1 text-sm">
        {result.checks.map((c) => (
          <li key={c.id} className={c.pass ? "text-dark" : "font-semibold text-risk"}>
            {c.pass ? "✓" : "✗"} {c.label}
          </li>
        ))}
      </ul>
      <p className="text-sm italic">"{result.reason}"</p>
      {result.outcome === "proposed" ? (
        <p className="text-sm font-semibold text-green">
          Proposed on-chain · Expense #{result.expenseId}{" "}
          {result.txHash && <ExplorerLink path={`tx/${result.txHash}`}>BscScan</ExplorerLink>}
        </p>
      ) : (
        <Chip tone="risk">
          {result.blockedBy && !NOT_CONTRACT_BLOCKS.includes(result.blockedBy)
            ? `Blocked by AmbagVault · ${result.blockedBy}`
            : result.blockedBy === "UnknownCategory"
              ? "Hindi na-propose · pumili ng category sa itaas at i-review ulit"
              : "Hindi na-propose · kailangan ng malinaw na resibo"}
        </Chip>
      )}
    </div>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  return <Chip tone={risk === "HIGH" ? "risk" : risk === "LOW" ? "green" : "neutral"}>{risk} RISK</Chip>;
}

// ───────────────────────── Pending expenses: approve / reject / execute ─────────────────────────

function PendingList({ count, categories, isTreasurer, isAdviser }: { count: number; categories: readonly Category[]; isTreasurer: boolean; isAdviser: boolean }) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [busyId, setBusyId] = useState<number>();
  const [message, setMessage] = useState<{ id: number; text: string; error?: boolean }>();

  const ids = Array.from({ length: count }, (_, i) => i);
  const rows = useReadContracts({
    contracts: ids.flatMap((i) => [
      { ...vault, functionName: "getExpense" as const, args: [BigInt(i)] as const },
      { ...vault, functionName: "needsAdviser" as const, args: [BigInt(i)] as const },
    ]),
    query: { enabled: count > 0, refetchInterval: REFRESH_MS },
  });

  const pending = ids
    .map((i) => ({
      id: i,
      e: rows.data?.[i * 2]?.result as
        | { collectionId: bigint; categoryIndex: number; amount: bigint; payee: string; receiptURI: string; risk: number; status: number; treasurerApproved: boolean; adviserApproved: boolean }
        | undefined,
      needsAdviser: rows.data?.[i * 2 + 1]?.result === true,
    }))
    .filter((x) => x.e && x.e.collectionId === collectionId && x.e.status === EXPENSE_STATUS.Proposed)
    .reverse();

  async function send(hash: `0x${string}`) {
    const receipt = await publicClient!.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Hindi natuloy ang transaction.");
    return hash;
  }

  async function approve(id: number, treasurerDone: boolean, adviserDone: boolean, needsAdviser: boolean) {
    setBusyId(id);
    setMessage(undefined);
    try {
      await send(await writeContractAsync({ ...vault, functionName: "approveExpense", args: [BigInt(id)] }));
      // Same rule as the contract: an adviser wallet always counts as the adviser.
      const treasurer = treasurerDone || !isAdviser;
      const adviser = adviserDone || isAdviser;
      if (treasurer && (!needsAdviser || adviser)) {
        const hash = await send(await writeContractAsync({ ...vault, functionName: "executeExpense", args: [BigInt(id)] }));
        setMessage({ id, text: `Bayad na sa vendor · tx ${shortAddress(hash)}` });
      } else {
        setMessage({ id, text: "Approved. Hinihintay ang adviser." });
      }
      await rows.refetch();
    } catch (e) {
      setMessage({ id, text: friendlyError(e), error: true });
    } finally {
      setBusyId(undefined);
    }
  }

  async function execute(id: number) {
    setBusyId(id);
    try {
      const hash = await send(await writeContractAsync({ ...vault, functionName: "executeExpense", args: [BigInt(id)] }));
      setMessage({ id, text: `Bayad na sa vendor · tx ${shortAddress(hash)}` });
      await rows.refetch();
    } catch (e) {
      setMessage({ id, text: friendlyError(e), error: true });
    } finally {
      setBusyId(undefined);
    }
  }

  async function reject(id: number) {
    const reason = window.prompt("Bakit ire-reject?", "Hindi tugma sa resibo");
    if (reason === null) return;
    setBusyId(id);
    try {
      await send(await writeContractAsync({ ...vault, functionName: "rejectExpense", args: [BigInt(id), reason || "Rejected"] }));
      setMessage({ id, text: "Rejected." });
      await rows.refetch();
    } catch (e) {
      setMessage({ id, text: friendlyError(e), error: true });
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <Card className="flex flex-col gap-1 px-4 py-3">
      <Eyebrow>Pending expenses</Eyebrow>
      {pending.length === 0 && <p className="py-2 text-sm text-muted">Walang pending na gastos.</p>}
      {pending.map(({ id, e, needsAdviser }) => {
        const x = e!;
        const ready = x.treasurerApproved && (!needsAdviser || x.adviserApproved);
        const canApprove = isAdviser ? needsAdviser && !x.adviserApproved : isTreasurer && !x.treasurerApproved;
        const busy = busyId === id;
        return (
          <div key={id} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-dark">
                {categories[x.categoryIndex]?.name ?? "Expense"} · #{id}
              </span>
              <span className="font-semibold text-dark">{peso(x.amount)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <RiskBadge risk={RISK_LABEL[x.risk]} />
              <span>Treasurer {x.treasurerApproved ? "✓" : "—"}</span>
              {needsAdviser && <span>Adviser {x.adviserApproved ? "✓" : "— (kailangan)"}</span>}
              <span className="text-muted">to {shortAddress(x.payee)}</span>
              {x.receiptURI && (
                <a href={x.receiptURI} target="_blank" rel="noreferrer" className="font-semibold text-green">
                  Receipt ↗
                </a>
              )}
            </div>
            <div className="flex gap-2">
              {canApprove && (
                <button
                  onClick={() => approve(id, x.treasurerApproved, x.adviserApproved, needsAdviser)}
                  disabled={busyId !== undefined}
                  className="h-10 flex-1 rounded-[12px] bg-gold text-sm font-bold text-dark disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Approve"}
                </button>
              )}
              {ready && (
                <button
                  onClick={() => execute(id)}
                  disabled={busyId !== undefined}
                  className="h-10 flex-1 rounded-[12px] bg-green text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Execute payment"}
                </button>
              )}
              <button
                onClick={() => reject(id)}
                disabled={busyId !== undefined}
                className="h-10 rounded-[12px] border border-risk px-4 text-sm font-semibold text-risk disabled:opacity-50"
              >
                Reject
              </button>
            </div>
            {message?.id === id && <p className={`text-xs ${message.error ? "text-risk" : "text-green"}`}>{message.text}</p>}
          </div>
        );
      })}
    </Card>
  );
}
