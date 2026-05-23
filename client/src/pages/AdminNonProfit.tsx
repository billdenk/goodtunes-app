import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ReferralSummaryPanel } from "@/pages/AdminPerson";

// Task #78 — Super-admin detail page for a non-profit partner. Keeps the
// surface deliberately thin (identity card + referral summary panel) —
// non-profits don't have a CRUD-heavy admin surface like artists or
// labels, but operators still need a place to audit accrued $1/unit
// credits and see who's been referred.
type NonProfit = {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
};

export default function AdminNonProfit() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<NonProfit>({
    queryKey: [`/api/non-profits/${id}`],
    queryFn: async () => {
      const r = await fetch(`/api/non-profits`);
      if (!r.ok) throw new Error("Failed to load non-profits");
      const list = (await r.json()) as NonProfit[];
      const row = list.find((o) => o.id === id);
      if (!row) throw new Error("Non-profit not found");
      return row;
    },
    retry: false,
  });

  if (q.isLoading) {
    return <main className="p-6 text-slate-500">Loading…</main>;
  }
  if (q.error || !q.data) {
    return (
      <main className="p-6">
        <p className="text-sm text-rose-700">{(q.error as Error)?.message ?? "Not found"}</p>
        <Link href="/admin/invites" className="text-sm text-[var(--brand-blue)] hover:underline">← Back to invites</Link>
      </main>
    );
  }

  const npo = q.data;
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-5" data-testid="page-admin-non-profit">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4">
        {npo.logoUrl ? (
          <img src={npo.logoUrl} alt="" className="w-14 h-14 rounded-xl object-cover bg-slate-100" />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-slate-100" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Non-profit</p>
          <h1 className="text-xl font-bold text-slate-900 truncate" data-testid="text-npo-admin-name">{npo.name}</h1>
          {npo.websiteUrl && (
            <a href={npo.websiteUrl} target="_blank" rel="noreferrer" className="text-[12px] text-[var(--brand-blue)] hover:underline">
              {npo.websiteUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>
      <ReferralSummaryPanel kind="non_profit" id={npo.id} />
    </main>
  );
}
