import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { keccak256, toBytes } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, ExpenseSteps, Eyebrow, ExplorerLink, LoadingCard } from "../components/ui";
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
      <Card className="flex flex-col gap-3 p-5">
        <h1 className="font-display text-xl font-bold text-dark">For treasurers and advisers</h1>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>Upload a receipt and the AI Treasurer Agent checks it before anything reaches the vault.</li>
          <li>Approve or reject proposed expenses. The contract pays out only after approval.</li>
          <li>Expenses over ₱1,000 or marked HIGH risk also need the adviser.</li>
        </ul>
        <button
          onClick={login}
          className="h-14 rounded-[14px] bg-gold text-base font-bold text-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark"
        >
          Sign in with Google
        </button>
        <p className="text-xs text-muted">Members do not need this page. Anyone can view the public ledger.</p>
      </Card>
    );
  } else if (!address || roles.isLoading || !categories) body = <LoadingCard />;
  else if (!isTreasurer && !isAdviser) {
    body = (
      <Card className="flex flex-col gap-1.5 text-sm">
        <p className="font-semibold text-dark">Wala kang officer role.</p>
        <p>Hilingin sa admin na i-grant ang TREASURER o ADVISER role sa address na ito:</p>
        <p className="break-all rounded-lg bg-[#ECE8DC] p-2 font-mono text-xs text-dark">{address}</p>
        <p className="text-xs text-muted">Pagkatapos ma-grant, i-refresh ang page.</p>
      </Card>
    );
  } else {
    body = (
      <>
        <p className="text-sm lg:text-base">
          Signed in as <span className="font-semibold text-dark">{isAdviser ? "Adviser" : "Treasurer"}</span>
          {isAdviser ? ": you give the second approval on big or HIGH-risk expenses." : ": upload receipts and give the first approval."}
        </p>
        {onboarding && <p className="text-xs text-muted">Setting up your wallet…</p>}
        {onboardError && <p className="text-xs text-risk">{onboardError}</p>}
        {/* Laptop: upload + agent result on the left, approvals on the right. Adviser has one column. */}
        <div className={`grid items-start gap-3.5 lg:gap-6 ${isTreasurer && !isAdviser ? "lg:grid-cols-2" : "lg:max-w-2xl"}`}>
          {isTreasurer && !isAdviser && (
            <div className="flex flex-col gap-3.5">
              <ReviewPanel address={address} categories={categories} />
            </div>
          )}
          <div className="flex flex-col gap-3.5">
            <PendingList count={expenseCount} categories={categories} isTreasurer={isTreasurer} isAdviser={isAdviser} />
          </div>
        </div>
      </>
    );
  }

  return (
    <Layout title="Officer" subtitle={ORG_NAME} footnote="The agent can only propose. The contract decides." wide={authenticated && (isTreasurer || isAdviser)}>
      {body}
    </Layout>
  );
}

// ───────────────────────── Receipt upload + agent result ─────────────────────────

type Review = {
  extracted: { vendor: string | null; total: number | null; items?: { name: string }[]; suspiciousText?: string[] } | null;
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
  const [result, setResult] = useState<{ review: Review; previewUrl: string; at: Date }>();
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
      setResult({ review: data as Review, previewUrl: image.previewUrl, at: new Date() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <Card className="flex flex-col gap-3 p-5">
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
        className="h-12 rounded-[14px] bg-gold text-base font-bold text-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark disabled:opacity-50"
        aria-live="polite"
      >
        {busy ? LOADING_STEPS[stepIndex] : "Review with AI"}
      </button>
      {error && <ErrorCard title="Hindi natapos ang review" message={error} />}
    </Card>
    {result && <AgentResult {...result} categories={categories} />}
    </>
  );
}

const NOT_CONTRACT_BLOCKS = ["UnreadableAmount", "UnknownCategory"];

/** Bold lead for each check, so the card reads like the deck: "Duplicate receipt. <detail>". */
function checkLead(id: string, pass: boolean) {
  const leads: Record<string, string> = {
    duplicate: pass ? "New receipt." : "Duplicate receipt.",
    budget: "Budget.",
    price: "Price.",
    injection: pass ? "No hidden instructions." : "Hidden instruction found.",
    category: "Category changed.",
    similar: "Possible duplicate.",
    split: "Possible split.",
  };
  return leads[id] ?? "";
}

const peso2 = (n: number) => "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The agent's verdict, laid out like docs/prototype/agent.png: receipt, review, then what the contract did. */
function AgentResult({ review: r, previewUrl, at, categories }: { review: Review; previewUrl: string; at: Date; categories: readonly Category[] }) {
  const category = categories[r.categoryIndex]?.name;
  const item = r.extracted?.items?.[0]?.name;
  const total = r.extracted?.total;
  const border = r.risk === "HIGH" ? "border-risk" : r.risk === "LOW" ? "border-green" : "border-line";
  const contractBlocked = r.outcome === "blocked" && !!r.blockedBy && !NOT_CONTRACT_BLOCKS.includes(r.blockedBy);
  const hidden = r.extracted?.suspiciousText?.[0];

  return (
    <section className="flex flex-col gap-3" aria-live="polite" aria-label="Treasurer Agent review">
      <Card className="flex items-center gap-4">
        <img src={previewUrl} alt="Uploaded receipt" className="h-20 w-16 shrink-0 rounded-md border border-line object-cover" />
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold text-dark">{r.extracted?.vendor ?? "Vendor not readable"}</p>
          <p className="text-sm">
            {[item, category].filter(Boolean).join(" · ") || "No items read"}
            {total != null && ` · ${peso2(total)}`}
          </p>
          <p className="text-xs text-muted">Uploaded by you · {at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</p>
        </div>
      </Card>

      <div className={`flex flex-col gap-3 rounded-2xl border bg-paper p-5 ${border}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-dark">Review result</h2>
          <RiskBadge risk={r.risk} />
        </div>
        <ul className="flex flex-col gap-2.5 text-sm">
          {r.checks.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${c.pass ? "bg-green" : "bg-risk"}`}
                role="img"
                aria-label={c.pass ? "Passed" : "Failed"}
              >
                {c.pass ? "✓" : "✕"}
              </span>
              <span>
                <span className="font-semibold text-dark">{checkLead(c.id, c.pass)}</span>{" "}
                {c.id === "injection" && !c.pass && hidden ? `"${hidden}" Treated as data, ignored.` : c.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-3 text-sm italic">"{r.reason}"</p>
      </div>

      <div className="flex flex-col gap-1 rounded-2xl bg-dark p-5 text-cream">
        <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-gold">Smart contract</p>
        {r.outcome === "proposed" ? (
          <>
            <p className="font-display text-lg font-bold">Proposed on-chain · Expense #{r.expenseId}</p>
            <p className="text-sm text-[#BFD3C9]">
              No funds move until officers approve it below.{" "}
              {r.txHash && <ExplorerLink path={`tx/${r.txHash}`}>BscScan</ExplorerLink>}
            </p>
          </>
        ) : contractBlocked ? (
          <>
            <p className="font-display text-lg font-bold">Blocked by AmbagVault</p>
            <p className="text-sm text-[#BFD3C9]">{r.blockedBy} · no funds moved</p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-bold">Not sent to the contract</p>
            <p className="text-sm text-[#BFD3C9]">
              {r.blockedBy === "UnknownCategory"
                ? "Pumili ng category sa itaas at i-review ulit."
                : "Hindi mabasa ang total. Kumuha ng mas malinaw na litrato at i-review ulit."}
            </p>
          </>
        )}
      </div>
    </section>
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
            <ExpenseSteps status={x.status} treasurer={x.treasurerApproved} adviser={x.adviserApproved} needsAdviser={needsAdviser} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <RiskBadge risk={RISK_LABEL[x.risk]} />
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
                  className="h-10 flex-1 rounded-xl bg-gold text-sm font-bold text-dark disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Approve"}
                </button>
              )}
              {ready && (
                <button
                  onClick={() => execute(id)}
                  disabled={busyId !== undefined}
                  className="h-10 flex-1 rounded-xl bg-green text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Execute payment"}
                </button>
              )}
              <button
                onClick={() => reject(id)}
                disabled={busyId !== undefined}
                className="h-10 rounded-xl border border-risk px-4 text-sm font-semibold text-risk disabled:opacity-50"
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
