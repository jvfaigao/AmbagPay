import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePublicClient, useReadContract, useWriteContract } from "wagmi";
import AdminPanel from "../components/AdminPanel";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Row, Tabs } from "../components/ui";
import { CHAIN_ID, ORG_NAME } from "../config";
import { COLLECTION_STATUS, vault } from "../lib/contracts";
import { friendlyError } from "../lib/errors";
import { percent, peso, pesoShort, shortAddress } from "../lib/format";
import { useCollections } from "../lib/useCollections";
import { ADVISER_ROLE, TREASURER_ROLE, useRoles } from "../lib/useRoles";

type Tab = "officers" | "fees" | "categories";

/** President (ADMIN_ROLE) only: assign officers, create/close fees, see each fee's categories. */
export default function Admin() {
  const { ready, authenticated, login } = usePrivy();
  const roles = useRoles();
  const [tab, setTab] = useState<Tab>("officers");

  let body;
  if (!ready || roles.isLoading) body = <LoadingCard label="Loading…" />;
  else if (!authenticated) {
    body = (
      <Card className="flex flex-col gap-3 p-5">
        <h1 className="font-display text-xl font-bold text-dark">Admin</h1>
        <p className="text-sm">For the org president: assign the treasurer and adviser, and create or close fees.</p>
        <button onClick={login} className="h-14 rounded-2xl bg-gold text-base font-bold text-dark">
          Sign in with Google
        </button>
      </Card>
    );
  } else if (!roles.isAdmin || !roles.address) body = <ErrorCard title="Admin only" message="Only the wallet with the ADMIN role (the org president) can use this page." />;
  else {
    body = (
      <>
        <Tabs
          label="Admin sections"
          value={tab}
          onChange={setTab}
          className="lg:max-w-md"
          options={[
            { value: "officers", label: "Officers" },
            { value: "fees", label: "Fees" },
            { value: "categories", label: "Categories" },
          ]}
        />
        {tab === "officers" && <OfficersTab admin={roles.address} />}
        {tab === "fees" && (
          <div className="lg:max-w-2xl">
            <AdminPanel address={roles.address} />
          </div>
        )}
        {tab === "categories" && <CategoriesTab />}
      </>
    );
  }

  return (
    <Layout title="Admin" subtitle={ORG_NAME} footnote="Roles and fees live in the AmbagVault contract." wide={roles.isAdmin}>
      {body}
    </Layout>
  );
}

// ───────────────────────── Officers ─────────────────────────

type Officer = { email: string; address: `0x${string}`; treasurer: boolean; adviser: boolean };

function OfficersTab({ admin }: { admin: `0x${string}` }) {
  const { getAccessToken } = usePrivy();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const { writeContractAsync } = useWriteContract();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"treasurer" | "adviser">("treasurer");
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; hash?: `0x${string}` }>();
  const [confirmRevoke, setConfirmRevoke] = useState<string>();

  async function api(query = "") {
    const res = await fetch(`/api/officers${query}`, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  }
  const officers = useQuery({ queryKey: ["officers"], queryFn: async () => (await api()).officers as Officer[], retry: false });

  async function send(key: string, fn: "grantRole" | "revokeRole", roleId: `0x${string}`, account: `0x${string}`, text: string) {
    setBusy(key);
    setMsg(undefined);
    try {
      // Simulate first: a missing permission reverts here with no gas spent.
      await publicClient!.simulateContract({ ...vault, account: admin, functionName: fn, args: [roleId, account] });
      const hash = await writeContractAsync({ ...vault, functionName: fn, args: [roleId, account] });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction did not go through.");
      setMsg({ ok: true, text, hash });
      await officers.refetch();
      return true;
    } catch (e) {
      setMsg({ ok: false, text: friendlyError(e) });
      return false;
    } finally {
      setBusy(undefined);
    }
  }

  async function onGrant() {
    const clean = email.trim().toLowerCase();
    setMsg(undefined);
    setBusy("grant");
    let address: `0x${string}` | null;
    try {
      address = (await api(`?email=${encodeURIComponent(clean)}`)).address;
    } catch (e) {
      setBusy(undefined);
      return setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
    if (!address) {
      setBusy(undefined);
      // Their wallet is created on first sign-in, so there is nothing to grant the role to yet.
      return setMsg({ ok: false, text: `${clean} has not signed in to AmbagPay yet. Ask them to sign in once with that Gmail, then try again.` });
    }
    const label = role === "treasurer" ? "Treasurer" : "Adviser";
    const ok = await send("grant", "grantRole", role === "treasurer" ? TREASURER_ROLE : ADVISER_ROLE, address, `${clean} is now ${label}. They can open the Officer page.`);
    if (ok) setEmail("");
  }

  const emailOk = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email.trim());

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
      <Card className="flex flex-col gap-3 p-5">
        <Eyebrow>Add an officer</Eyebrow>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-dark">Gmail</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@gmail.com" disabled={!!busy} className="input" />
          <span className="text-xs text-muted">They must have signed in to AmbagPay once with this Gmail.</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-dark">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "treasurer" | "adviser")} disabled={!!busy} className="input">
            <option value="treasurer">Treasurer: uploads receipts, first approval</option>
            <option value="adviser">Adviser: second approval on big or HIGH-risk expenses</option>
          </select>
        </label>
        <button onClick={onGrant} disabled={!emailOk || !!busy} className="h-12 rounded-2xl bg-gold text-base font-bold text-dark disabled:opacity-50">
          {busy === "grant" ? "Granting on BNB Smart Chain…" : "Grant role"}
        </button>
        {msg && (
          <div className={`rounded-[14px] p-3 text-sm ${msg.ok ? "bg-greenbg text-green" : "bg-riskbg text-risk"}`} role="status">
            {msg.text} {msg.hash && <ExplorerLink path={`tx/${msg.hash}`}>BscScan</ExplorerLink>}
          </div>
        )}
      </Card>

      <Card className="flex flex-col px-4 py-3">
        <Eyebrow>Officers</Eyebrow>
        {officers.isLoading && <p className="py-3 text-sm text-muted">Loading…</p>}
        {officers.isError && <p className="py-3 text-sm text-risk">{officers.error.message}</p>}
        {officers.data?.length === 0 && <p className="py-3 text-sm text-muted">No treasurer or adviser yet.</p>}
        {officers.data?.map((o) =>
          (["treasurer", "adviser"] as const)
            .filter((r) => o[r])
            .map((r) => {
              const key = `${o.email}:${r}`;
              return (
                <div key={key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line py-3 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green text-xs font-bold uppercase text-white" aria-hidden="true">
                      {o.email[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-all text-sm font-semibold text-dark">{o.email}</span>
                      <span className="block text-xs text-muted">{shortAddress(o.address)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={r === "treasurer" ? "green" : "gold"}>{r === "treasurer" ? "Treasurer" : "Adviser"}</Chip>
                    {confirmRevoke === key ? (
                      <>
                        <button
                          onClick={() => send(key, "revokeRole", r === "treasurer" ? TREASURER_ROLE : ADVISER_ROLE, o.address, `${o.email} is no longer ${r}.`).then(() => setConfirmRevoke(undefined))}
                          disabled={!!busy}
                          className="h-8 rounded-[10px] bg-risk px-3 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {busy === key ? "Removing…" : "Yes, remove"}
                        </button>
                        <button onClick={() => setConfirmRevoke(undefined)} disabled={!!busy} className="h-8 rounded-[10px] bg-sand px-3 text-xs font-semibold text-dark">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmRevoke(key)} disabled={!!busy} className="h-8 rounded-[10px] bg-riskbg px-3 text-xs font-semibold text-risk disabled:opacity-50">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            }),
        )}
      </Card>
    </div>
  );
}

// ───────────────────────── Categories (read-only) ─────────────────────────

function CategoriesTab() {
  const { collections, isLoading } = useCollections();
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-[14px] bg-goldbg p-3 text-xs text-[#5d4a0a] lg:text-sm">
        Categories and caps are locked in the contract when a fee is created, so nobody can raise a cap later. To use a new category, create a new fee on the Fees tab.
      </p>
      {isLoading && <LoadingCard />}
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-6">
        {collections.map((c) => (
          <FeeCategories key={c.id.toString()} id={c.id} name={c.name} amount={c.amountPerMember} closed={c.status === COLLECTION_STATUS.Closed} />
        ))}
      </div>
    </div>
  );
}

function FeeCategories({ id, name, amount, closed }: { id: bigint; name: string; amount: bigint; closed: boolean }) {
  const categories = useReadContract({ ...vault, functionName: "getCategories", args: [id] });
  const capTotal = categories.data?.reduce((s, c) => s + c.cap, 0n) ?? 0n;
  const spentTotal = categories.data?.reduce((s, c) => s + c.spent, 0n) ?? 0n;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold text-dark">{name}</p>
          <p className="text-xs text-muted">
            #{id.toString()} · {peso(amount)} per member
          </p>
        </div>
        <Chip tone={closed ? "neutral" : "green"}>{closed ? "Closed" : "Open"}</Chip>
      </div>
      {categories.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {categories.data?.map((c) => (
        <div key={c.name} className="flex flex-col gap-1.5">
          <Row label={c.name} value={`${pesoShort(c.spent)} / ${pesoShort(c.cap)}`} />
          <ProgressBar value={percent(c.spent, c.cap)} />
        </div>
      ))}
      {categories.data && (
        <div className="flex justify-between gap-3 border-t border-line pt-3 text-sm">
          <span className="text-muted">Total</span>
          <span className="font-semibold tabular-nums text-dark">
            {pesoShort(spentTotal)} spent of {pesoShort(capTotal)}
          </span>
        </div>
      )}
      <Link to={`/ledger/${id}`} className="self-start text-xs font-semibold text-green underline-offset-2 hover:underline">
        Open ledger ›
      </Link>
    </Card>
  );
}
