import { useState } from "react";
import { Link } from "react-router-dom";
import { parseEther } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink } from "./ui";
import { CHAIN_ID, DEMO_COLLECTION_ID } from "../config";
import { COLLECTION_STATUS, vault } from "../lib/contracts";
import { friendlyError } from "../lib/errors";
import { peso } from "../lib/format";
import { useCollections } from "../lib/useCollections";

const MAX_CATEGORIES = 20; // AmbagVault.MAX_CATEGORIES
const PESOS = /^\d+(\.\d{1,2})?$/;
const input = "rounded-[10px] border border-line bg-white px-3 py-2";

/** President (ADMIN_ROLE) tools: create a new fee, close a fee so members can claim the leftover. */
export default function AdminPanel({ address }: { address: `0x${string}` }) {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const { collections, refetch } = useCollections();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [cats, setCats] = useState([{ name: "", cap: "" }]);
  const [busy, setBusy] = useState<string>(); // "create" or the id being closed
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ text: string; id?: bigint; hash: `0x${string}` }>();

  const formOk =
    name.trim() !== "" &&
    PESOS.test(amount) && Number(amount) > 0 &&
    cats.length > 0 && cats.every((c) => c.name.trim() !== "" && PESOS.test(c.cap) && Number(c.cap) > 0);

  async function run(key: string, send: () => Promise<{ text: string; id?: bigint; hash: `0x${string}` }>) {
    setError(undefined);
    setDone(undefined);
    setBusy(key);
    try {
      const result = await send();
      const receipt = await publicClient!.waitForTransactionReceipt({ hash: result.hash });
      if (receipt.status !== "success") throw new Error("Hindi natuloy ang transaction.");
      setDone(result);
      await refetch();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(undefined);
    }
  }

  function onCreate() {
    run("create", async () => {
      // Same as scripts/create-collection.js: end of the due date, Manila time. 0 = no deadline.
      const deadline = due ? BigInt(Math.floor(new Date(`${due}T23:59:59+08:00`).getTime() / 1000)) : 0n;
      // Simulate first: a bad input reverts here with no gas spent, and gives us the new id.
      const args = [name.trim(), parseEther(amount), deadline, cats.map((c) => c.name.trim()), cats.map((c) => parseEther(c.cap))] as const;
      const { result: id } = await publicClient!.simulateContract({ ...vault, account: address, functionName: "createCollection", args });
      const hash = await writeContractAsync({ ...vault, functionName: "createCollection", args });
      setName("");
      setAmount("");
      setDue("");
      setCats([{ name: "", cap: "" }]);
      return { text: `Nagawa ang "${name.trim()}".`, id, hash };
    });
  }

  function onClose(id: bigint, feeName: string) {
    const ok = confirm(
      `I-close ang "${feeName}"? Hindi na ito mababawi: wala nang makakabayad, at hahatiin ang natirang pondo bilang refund sa lahat ng nagbayad.`,
    );
    if (!ok) return;
    run(id.toString(), async () => {
      await publicClient!.simulateContract({ ...vault, account: address, functionName: "closeCollection", args: [id] });
      const hash = await writeContractAsync({ ...vault, functionName: "closeCollection", args: [id] });
      return { text: `Closed na ang "${feeName}". Pwede nang i-claim ng mga nagbayad ang refund sa Pay page.`, id, hash };
    });
  }

  const setCat = (i: number, patch: Partial<{ name: string; cap: string }>) => setCats(cats.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Card className="flex flex-col gap-3 p-5">
      <Eyebrow>Admin · Fees</Eyebrow>

      <ul className="flex flex-col">
        {collections.map((c) => {
          const open = c.status === COLLECTION_STATUS.Open;
          const demo = Number(c.id) === DEMO_COLLECTION_ID;
          return (
            <li key={c.id.toString()} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
              <Link to={`/ledger/${c.id}`} className="flex min-w-0 flex-col focus-visible:outline-2 focus-visible:outline-green">
                <span className="truncate font-semibold text-dark">{c.name}</span>
                <span className="text-xs text-muted">#{c.id.toString()} · {peso(c.amountPerMember)}</span>
              </Link>
              {!open ? (
                <Chip tone="neutral">Closed</Chip>
              ) : demo ? (
                // The live demo pays into this fee; closing it cannot be undone. Use scripts/close-collection.js if really needed.
                <Chip tone="green">Open · live demo</Chip>
              ) : (
                <button
                  onClick={() => onClose(c.id, c.name)}
                  disabled={!!busy}
                  className="shrink-0 rounded-[10px] border border-risk px-3 py-1.5 text-xs font-semibold text-risk focus-visible:outline-2 focus-visible:outline-risk disabled:opacity-50"
                >
                  {busy === c.id.toString() ? "Closing…" : "Close + refund"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <details className="flex flex-col gap-3 text-sm">
        <summary className="cursor-pointer font-semibold text-dark">+ Gumawa ng bagong fee</summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span>Pangalan</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Hal.: Org Shirt" disabled={!!busy} className={input} />
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span>Halaga bawat member (₱)</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value.trim())} inputMode="decimal" placeholder="250" disabled={!!busy} className={input} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span>Due (optional)</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} disabled={!!busy} className={input} />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1">Saan mapupunta (category + budget cap ₱)</legend>
            {cats.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  aria-label={`Category ${i + 1} name`}
                  value={c.name}
                  onChange={(e) => setCat(i, { name: e.target.value })}
                  placeholder="Shirts"
                  disabled={!!busy}
                  className={`${input} min-w-0 flex-1`}
                />
                <input
                  aria-label={`Category ${i + 1} cap in pesos`}
                  value={c.cap}
                  onChange={(e) => setCat(i, { cap: e.target.value.trim() })}
                  inputMode="decimal"
                  placeholder="5000"
                  disabled={!!busy}
                  className={`${input} w-24`}
                />
                {cats.length > 1 && (
                  <button
                    aria-label={`Remove category ${i + 1}`}
                    onClick={() => setCats(cats.filter((_, j) => j !== i))}
                    disabled={!!busy}
                    className="px-2 text-muted hover:text-risk"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {cats.length < MAX_CATEGORIES && (
              <button onClick={() => setCats([...cats, { name: "", cap: "" }])} disabled={!!busy} className="self-start text-xs font-semibold text-green">
                + Add category
              </button>
            )}
          </fieldset>
          <button
            onClick={onCreate}
            disabled={!formOk || !!busy}
            className="h-12 rounded-[14px] bg-gold text-base font-bold text-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark disabled:opacity-50"
          >
            {busy === "create" ? "Creating on BNB Smart Chain…" : "Create fee"}
          </button>
        </div>
      </details>

      {done && (
        <div className="flex flex-col gap-1 rounded-xl bg-greenbg p-3 text-sm text-dark">
          <p>{done.text}</p>
          {done.id !== undefined && (
            <p className="flex flex-wrap gap-3 text-xs font-semibold">
              <Link to={`/pay/${done.id}`} className="text-green underline-offset-2 hover:underline">Pay link /pay/{done.id.toString()}</Link>
              <Link to={`/ledger/${done.id}`} className="text-green underline-offset-2 hover:underline">Ledger</Link>
              <ExplorerLink path={`tx/${done.hash}`}>BscScan</ExplorerLink>
            </p>
          )}
        </div>
      )}
      {error && <ErrorCard title="Hindi natuloy" message={error} />}
    </Card>
  );
}
