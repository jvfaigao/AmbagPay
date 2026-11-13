import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import Layout from "../components/Layout";
import { Card, Chip, ErrorCard, Eyebrow, ExplorerLink, LoadingCard, ProgressBar, Stats, Tabs } from "../components/ui";
import { DEMO_COLLECTION_ID, ORG_NAME } from "../config";
import { peso, pesoShort, shortAddress } from "../lib/format";
import { useCollections } from "../lib/useCollections";
import { formatDateTime, usePaidEvents, type Payment } from "../lib/usePaidEvents";
import { useRoles } from "../lib/useRoles";
import { useRoster } from "../lib/useRoster";

type Status = "all" | "paid" | "unpaid";
type Rec = { name: string; studentId: string; section: string; email: string; paid: boolean; onList: boolean; payment?: Payment };

/** Officers only: who paid each fee, when, with which transaction. Search, filter, copy as CSV. */
export default function Records() {
  const { ready, authenticated, login } = usePrivy();
  const roles = useRoles();
  const isOfficer = roles.isTreasurer || roles.isAdviser;

  let body;
  if (!ready || roles.isLoading) body = <LoadingCard label="Loading…" />;
  else if (!authenticated) {
    body = (
      <Card className="flex flex-col gap-3 p-5">
        <h1 className="font-display text-xl font-bold text-dark">Payment records</h1>
        <p className="text-sm">For the treasurer and adviser: who paid each fee, when, and the transaction.</p>
        <button onClick={login} className="h-14 rounded-2xl bg-gold text-base font-bold text-dark">
          Sign in with Google
        </button>
      </Card>
    );
  } else if (!isOfficer) body = <ErrorCard title="Officers only" message="Records has students' names and emails, so only the treasurer and adviser can see it." />;
  else body = <RecordsBody />;

  return (
    <Layout title="Records" subtitle={ORG_NAME} wide={isOfficer}>
      {body}
    </Layout>
  );
}

function RecordsBody() {
  const [collectionId, setCollectionId] = useState(BigInt(DEMO_COLLECTION_ID));
  const { collections } = useCollections();
  const fee = collections.find((c) => c.id === collectionId);
  const roster = useRoster(collectionId);
  const events = usePaidEvents({ collectionId });

  const [q, setQ] = useState("");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [sort, setSort] = useState<"newest" | "name">("newest");
  const [copied, setCopied] = useState<string>();
  const [csvFallback, setCsvFallback] = useState<string>();

  const all: Rec[] = useMemo(() => {
    const byAddress = new Map((events.data ?? []).map((p) => [p.member.toLowerCase(), p]));
    const pay = (a: string | null) => (a ? byAddress.get(a.toLowerCase()) : undefined);
    const listed = (roster.data?.students ?? []).map((s) => ({ ...s, onList: true, payment: pay(s.address) }));
    // Paid with a Gmail that is not on the class list.
    const extra = (roster.data?.notOnRoster ?? []).map((m) => ({ name: m.email, studentId: "", section: "", email: m.email, paid: true, onList: false, payment: pay(m.address) }));
    return [...listed, ...extra];
  }, [roster.data, events.data]);

  const sections = [...new Set(all.map((r) => r.section).filter(Boolean))].sort();
  const needle = q.trim().toLowerCase();
  const rows = all
    .filter((r) => (!section || r.section === section) && (status === "all" || (status === "paid") === r.paid))
    .filter((r) => !needle || [r.name, r.email, r.studentId].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : (b.payment?.timestamp ?? (b.paid ? 1 : 0)) - (a.payment?.timestamp ?? (a.paid ? 1 : 0))));

  const onList = all.filter((r) => r.onList);
  const paidOnList = onList.filter((r) => r.paid).length;

  async function copyCsv() {
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [["Name", "Student ID", "Section", "Email", "Status", "Amount", "Date", "Tx"].join(",")];
    for (const r of rows) {
      lines.push(
        [r.name, r.studentId, r.section, r.email, r.paid ? "Paid" : "Not yet", r.paid && fee ? peso(fee.amountPerMember) : "", r.payment ? formatDateTime(r.payment.timestamp) : "", r.payment?.txHash ?? ""]
          .map(cell)
          .join(","),
      );
    }
    const csv = lines.join("\n");
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(`Copied ${rows.length} rows.`);
      setCsvFallback(undefined);
    } catch {
      setCsvFallback(csv); // clipboard blocked: let the officer copy by hand
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {collections.length > 1 && (
        <label className="flex flex-col gap-1.5 text-sm lg:max-w-md">
          <span className="font-medium text-dark">Fee</span>
          <select value={collectionId.toString()} onChange={(e) => setCollectionId(BigInt(e.target.value))} className="input">
            {collections.map((c) => (
              <option key={c.id.toString()} value={c.id.toString()}>
                {c.name} · {peso(c.amountPerMember)}
              </option>
            ))}
          </select>
        </label>
      )}

      {roster.isLoading ? (
        <LoadingCard label="Loading the class list…" />
      ) : roster.isError ? (
        <ErrorCard message={roster.error.message} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_2.4fr] lg:gap-6">
          <div className="flex flex-col gap-4 lg:sticky lg:top-6">
            <Stats
              items={[
                { label: "Paid (on list)", value: `${paidOnList} of ${onList.length}` },
                { label: "Not yet", value: String(onList.length - paidOnList) },
                { label: "Collected", value: fee ? pesoShort(fee.totalCollected) : "…" },
              ]}
            />
            {sections.length > 0 && (
              <Card className="flex flex-col gap-2">
                <Eyebrow>By section</Eyebrow>
                {sections.map((sec) => {
                  const inSec = onList.filter((r) => r.section === sec);
                  const p = inSec.filter((r) => r.paid).length;
                  return (
                    <div key={sec} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-sm">
                        <span>{sec}</span>
                        <span className="font-semibold tabular-nums text-dark">
                          {p} of {inSec.length}
                        </span>
                      </div>
                      <ProgressBar value={inSec.length ? (p / inSec.length) * 100 : 0} />
                    </div>
                  );
                })}
              </Card>
            )}
            {onList.length === 0 && <p className="px-1 text-sm text-muted">No class list for this fee yet. Upload one on the Officer page (Members card).</p>}
          </div>

          <Card className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="flex min-w-0 flex-[2_1_200px] flex-col gap-1 text-xs text-muted">
                Search
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or student ID" className="input text-sm text-body" />
              </label>
              <label className="flex min-w-0 flex-[1_1_120px] flex-col gap-1 text-xs text-muted">
                Section
                <select value={section} onChange={(e) => setSection(e.target.value)} className="input text-sm text-body">
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-[1_1_120px] flex-col gap-1 text-xs text-muted">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "name")} className="input text-sm text-body">
                  <option value="newest">Newest payment</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Tabs
                label="Status"
                value={status}
                onChange={setStatus}
                className="min-w-[240px] flex-1"
                options={[
                  { value: "all", label: "All" },
                  { value: "paid", label: "Paid" },
                  { value: "unpaid", label: "Not yet" },
                ]}
              />
              <button onClick={copyCsv} className="h-10 rounded-xl bg-sand px-4 text-sm font-semibold text-dark">
                Copy as CSV
              </button>
            </div>
            {copied && <p className="text-xs text-green" role="status">{copied}</p>}
            {csvFallback && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Copying is blocked here. Select all and copy:
                <textarea readOnly value={csvFallback} rows={5} className="input font-mono text-xs" onFocus={(e) => e.target.select()} autoFocus />
              </label>
            )}
            {events.isError && <p className="text-xs text-muted">Payment dates could not be loaded right now. Paid status still comes from the contract.</p>}

            <p className="text-xs text-muted">
              Showing {rows.length} of {all.length}
            </p>
            <RecordsTable rows={rows} amount={fee?.amountPerMember} loadingDates={events.isLoading} />
          </Card>
        </div>
      )}
    </div>
  );
}

/** Table on laptop; on a phone each row stacks into name + status + amount + date. */
function RecordsTable({ rows, amount, loadingDates }: { rows: Rec[]; amount?: bigint; loadingDates: boolean }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted">No one matches these filters.</p>;
  return (
    <div className="max-h-[480px] overflow-auto rounded-[14px] bg-paper">
      <table className="block w-full border-collapse text-[13px] md:table">
        <thead className="hidden md:table-header-group">
          <tr className="text-left text-xs text-muted">
            {["Name", "Student ID", "Section", "Status", "Amount", "Date", "Tx"].map((h) => (
              <th key={h} className={`sticky top-0 whitespace-nowrap bg-sand px-3 py-2.5 font-semibold ${h === "Amount" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {rows.map((r) => (
            <tr
              key={r.email}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-line px-3.5 py-3 first:border-t-0 md:table-row md:hover:bg-field"
            >
              <td className="row-span-2 min-w-0 md:border-t md:border-line md:px-3 md:py-2.5">
                <span className="block break-words font-semibold text-dark md:whitespace-nowrap">{r.name}</span>
                <span className="block break-words text-[11.5px] text-muted">
                  {r.email}
                  <span className="md:hidden">{r.section ? ` · ${r.section}` : ""}</span>
                </span>
              </td>
              <td className="hidden whitespace-nowrap md:table-cell md:border-t md:border-line md:px-3 md:py-2.5">{r.studentId || "—"}</td>
              <td className="hidden whitespace-nowrap md:table-cell md:border-t md:border-line md:px-3 md:py-2.5">{r.section || "—"}</td>
              <td className="justify-self-end md:border-t md:border-line md:px-3 md:py-2.5">
                {r.paid ? <Chip tone="green">Paid ✓</Chip> : <Chip tone="neutral">Not yet</Chip>}
                {!r.onList && (
                  <span className="ml-1">
                    <Chip tone="gold">Not on list</Chip>
                  </span>
                )}
              </td>
              <td className="text-right tabular-nums md:whitespace-nowrap md:border-t md:border-line md:px-3 md:py-2.5">{r.paid && amount !== undefined ? peso(amount) : "—"}</td>
              <td className="text-xs text-muted md:whitespace-nowrap md:border-t md:border-line md:px-3 md:py-2.5 md:text-[13px] md:text-body">
                {r.payment ? formatDateTime(r.payment.timestamp) : r.paid ? (loadingDates ? "Loading…" : "On-chain") : "—"}
              </td>
              <td className="text-right md:whitespace-nowrap md:border-t md:border-line md:px-3 md:py-2.5 md:text-left">
                {r.payment ? <ExplorerLink path={`tx/${r.payment.txHash}`}>{shortAddress(r.payment.txHash)}</ExplorerLink> : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
