import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, Chip, ErrorCard, Eyebrow, ProgressBar } from "./ui";
import { shortAddress } from "../lib/format";

type Student = { studentId: string; name: string; section: string; email: string; paid: boolean; loggedIn: boolean };
type Roster = { uploadedAt: number | null; students: Student[]; notOnRoster: { email: string; address: string }[] };

/** Officers only: upload the class list (CSV) and see who has paid, per section. */
export default function MembersCard({ collectionId, canUpload }: { collectionId: bigint; canUpload: boolean }) {
  const { getAccessToken } = usePrivy();
  const [tab, setTab] = useState<"unpaid" | "paid">("unpaid");
  const [section, setSection] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string; errors?: string[] }>();

  const roster = useQuery({
    queryKey: ["roster", collectionId.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/roster?collectionId=${collectionId}`, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data as Roster;
    },
    refetchInterval: 15_000,
    retry: false,
  });

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadMsg(undefined);
    try {
      const res = await fetch("/api/roster", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ collectionId: Number(collectionId), csv: await file.text() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { errors: data.errors as string[] | undefined });
      setUploadMsg({ ok: true, text: `Na-save ang ${data.saved} students.`, errors: data.errors });
      await roster.refetch();
    } catch (e) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : String(e), errors: (e as { errors?: string[] }).errors });
    } finally {
      setUploading(false);
    }
  }

  // No email = delete the whole list.
  async function onDelete(email?: string) {
    setUploadMsg(undefined);
    try {
      const res = await fetch("/api/roster", {
        method: "DELETE",
        headers: { "content-type": "application/json", authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ collectionId: Number(collectionId), email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await roster.refetch();
    } catch (e) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const students = roster.data?.students ?? [];
  const sections = useMemo(() => [...new Set(students.map((s) => s.section).filter(Boolean))].sort(), [students]);
  const inSection = section ? students.filter((s) => s.section === section) : students;
  const paid = inSection.filter((s) => s.paid);
  const unpaid = inSection.filter((s) => !s.paid);
  const shown = tab === "paid" ? paid : unpaid;

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Members</Eyebrow>
        <span className="text-xs text-muted">Officers only</span>
      </div>

      {canUpload && (
        <label className="flex flex-col gap-1 text-sm">
          <span>Upload class list (CSV: student id, fullname, section, gmail)</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={uploading}
            onChange={(e) => {
              onUpload(e.target.files?.[0]);
              e.target.value = ""; // allow re-uploading the same file
            }}
            className="text-sm file:mr-3 file:rounded-[10px] file:border-0 file:bg-[#ECE8DC] file:px-3 file:py-2 file:font-semibold"
          />
          <span className="text-xs text-muted">Papalitan nito ang dating listahan. Itutugma ang gmail sa Google login ng student.</span>
        </label>
      )}
      {uploading && <p className="text-xs text-muted">Uploading…</p>}
      {uploadMsg && (
        <div className={`rounded-xl p-3 text-xs ${uploadMsg.ok ? "bg-greenbg text-green" : "bg-riskbg text-risk"}`} role="status">
          <p className="font-semibold">{uploadMsg.text}</p>
          {!!uploadMsg.errors?.length && (
            <ul className="mt-1 list-disc pl-4">
              {uploadMsg.errors.slice(0, 5).map((err) => (
                <li key={err}>{err}</li>
              ))}
              {uploadMsg.errors.length > 5 && <li>…at {uploadMsg.errors.length - 5} pa</li>}
            </ul>
          )}
        </div>
      )}

      {roster.isLoading ? (
        <p className="text-sm text-muted">Loading list…</p>
      ) : roster.error ? (
        <ErrorCard title="Hindi ma-load ang listahan" message={roster.error.message} />
      ) : students.length === 0 ? (
        <p className="text-sm text-muted">Wala pang listahan. {canUpload ? "Mag-upload ng CSV sa itaas." : "Ang treasurer ang mag-a-upload."}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="section" className="text-muted">
              Section
            </label>
            <select id="section" value={section} onChange={(e) => setSection(e.target.value)} className="rounded-[10px] border border-line bg-white px-3 py-1.5">
              <option value="">All ({students.length})</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm">
              <span className="font-semibold text-dark">{paid.length} paid</span> · {unpaid.length} not yet
            </p>
            <ProgressBar value={inSection.length ? (paid.length / inSection.length) * 100 : 0} />
          </div>

          <div role="tablist" aria-label="Payment status" className="flex gap-1 rounded-xl bg-[#ECE8DC] p-1 text-sm font-semibold">
            {(["unpaid", "paid"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 focus-visible:outline-2 focus-visible:outline-green ${tab === t ? "bg-paper text-dark shadow-sm" : "text-muted"}`}
              >
                {t === "unpaid" ? `Not yet (${unpaid.length})` : `Paid (${paid.length})`}
              </button>
            ))}
          </div>

          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {shown.length === 0 && <li className="py-3 text-sm text-muted">{tab === "paid" ? "Wala pang nagbayad." : "Bayad na lahat. 🎉"}</li>}
            {shown.map((s) => (
              <li key={s.email} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-dark">{s.name}</span>
                  <span className="truncate text-xs text-muted">
                    {s.studentId} · {s.section} · {s.email}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {s.paid ? (
                    <Chip tone="green">✓ Paid</Chip>
                  ) : (
                    <Chip tone="neutral">{s.loggedIn ? "Logged in, not paid" : "Not yet"}</Chip>
                  )}
                  {canUpload && (
                    <button
                      aria-label={`Remove ${s.name} from the list`}
                      onClick={() => {
                        const warn = s.paid ? " Nagbayad na siya; lalabas siya sa 'wala sa listahan'." : "";
                        if (confirm(`Tanggalin si ${s.name} sa listahan?${warn}`)) onDelete(s.email);
                      }}
                      className="rounded-md px-2 py-1 text-muted hover:bg-riskbg hover:text-risk focus-visible:outline-2 focus-visible:outline-green"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {canUpload && (
            <button
              onClick={() => {
                if (confirm(`I-delete ang buong listahan (${students.length} students)? Hindi nito binabago ang mga bayad sa chain.`)) onDelete();
              }}
              className="self-start rounded-[10px] border border-line px-3 py-1.5 text-xs font-semibold text-risk focus-visible:outline-2 focus-visible:outline-green"
            >
              Delete whole list
            </button>
          )}

          {!!roster.data?.notOnRoster.length && (
            <div className="rounded-xl border border-line p-3 text-xs">
              <p className="font-semibold text-dark">Nagbayad pero wala sa listahan ({roster.data.notOnRoster.length})</p>
              <p className="text-muted">Baka ibang Gmail ang ginamit. I-check at itugma nang manual.</p>
              <ul className="mt-1">
                {roster.data.notOnRoster.map((m) => (
                  <li key={m.email}>
                    {m.email} · {shortAddress(m.address)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
