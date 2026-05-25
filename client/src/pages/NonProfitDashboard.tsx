import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Heart, Music as MusicIcon, Mail, Clock } from "lucide-react";
import { DashboardPanel } from "@/components/partner/dashboard-controls";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #78 — Non-profit partner shell. Single-page dashboard showing
// the NPO's referred artists, their for-sale albums + paid units, and
// the running $1/unit credit roll-up. No analytics surface (yet) — the
// signal customers told us they want is "are my artists earning?".
type Me = { id: string; name: string; logoUrl: string | null; websiteUrl: string | null };
type Dashboard = {
  pendingCents: number;
  pendingCount: number;
  paidCents: number;
  artists: {
    id: string;
    name: string;
    photoUrl: string | null;
    status: "active" | "pending_invite";
    canInviteAmbassadors: boolean;
    albums: { id: string; title: string; coverUrl: string | null; paidUnits: number }[];
  }[];
  pendingInvites: { id: string; email: string; role: string; createdAt: string; expiresAt: string }[];
};

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export function NonProfitDashboard() {
  const me = useQuery<Me>({ queryKey: ["/api/non-profit/me"] });
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });

  if (me.error) {
    const msg = (me.error as any)?.message || "We couldn't load your non-profit scope.";
    return (
      <main className="min-h-screen bg-[color:var(--brand-bg)] text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="non-profit-gate">
          <h1 className="text-2xl font-bold mb-2">Non-profit dashboard</h1>
          <p className="text-white/60 text-sm">{msg}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--brand-bg)] text-white pb-20">
      <header className="border-b border-white/10 bg-gradient-to-b from-[color:var(--brand-header-gradient-top)] to-[color:var(--brand-bg)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-4">
            {me.data?.logoUrl ? (
              <img src={me.data.logoUrl} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/10 ring-1 ring-white/15" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-[color:var(--brand-purple)]/30 ring-1 ring-white/15 flex items-center justify-center">
                <Heart className="w-6 h-6 text-[color:var(--brand-pink)]" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white/55 text-[12px] uppercase tracking-wider font-semibold">Non-profit dashboard</p>
              <h1 className="text-2xl sm:text-3xl font-bold truncate" data-testid="text-npo-name">{me.data?.name ?? "Loading…"}</h1>
              {me.data?.websiteUrl && (
                <a href={me.data.websiteUrl} target="_blank" rel="noreferrer" className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors">
                  {me.data.websiteUrl.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="npo-kpis">
        <Kpi label="Pending payout" value={fmt(dash.data?.pendingCents ?? 0)} sub={`${dash.data?.pendingCount ?? 0} unit${(dash.data?.pendingCount ?? 0) === 1 ? "" : "s"}`} testId="kpi-npo-pending" />
        <Kpi label="Paid out" value={fmt(dash.data?.paidCents ?? 0)} testId="kpi-npo-paid" />
        <Kpi label="Referred artists" value={String(dash.data?.artists.length ?? 0)} testId="kpi-npo-artists" />
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 mt-6">
        <h2 className="text-sm font-semibold text-white/85 mb-3">Your artists</h2>
        {dash.isLoading ? (
          <p className="py-8 text-center text-white/45 text-[13px]">Loading…</p>
        ) : (dash.data?.artists.length ?? 0) === 0 ? (
          <DashboardPanel className="p-8 text-center" padding="none" data-testid="empty-npo-artists">
            <Heart className="w-8 h-8 text-[color:var(--brand-pink)] mx-auto mb-3" />
            <p className="text-sm text-white/65">
              You haven't referred any artists yet. Email <a href="mailto:nick@goodtunes.fm" className="underline">nick@goodtunes.fm</a> to
              get your first artist onboarded — you'll earn $1 on every paid unit they ship.
            </p>
          </DashboardPanel>
        ) : (
          <ul className="space-y-3" data-testid="list-npo-artists">
            {dash.data!.artists.map((a) => (
              <li key={a.id} data-testid={`row-npo-artist-${a.id}`}>
              <DashboardPanel>
                <div className="flex items-center gap-3 mb-3">
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white/5" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.name}</p>
                    <p className="text-[11px] text-white/55">{a.albums.length} album{a.albums.length === 1 ? "" : "s"} listed</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold ${
                      a.status === "active"
                        ? "bg-[color:var(--brand-mint)]/15 text-[color:var(--brand-mint)] ring-1 ring-[color:var(--brand-mint)]/30"
                        : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"
                    }`}
                    data-testid={`status-npo-artist-${a.id}`}
                  >
                    {a.status === "active" ? "Active" : "Pending invite"}
                  </span>
                  <Link href={`/artist/${a.id}`} className="text-xs text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors">View →</Link>
                </div>
                {a.status === "active" && (
                  <AmbassadorToggle personId={a.id} canInviteAmbassadors={a.canInviteAmbassadors} />
                )}
                {a.albums.length > 0 && (
                  <ul className="divide-y divide-white/5">
                    {a.albums.map((al) => (
                      <li key={al.id} className="flex items-center gap-3 py-2" data-testid={`row-npo-album-${al.id}`}>
                        {al.coverUrl ? (
                          <img src={al.coverUrl} alt="" className="w-9 h-9 rounded object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-white/5 flex items-center justify-center"><MusicIcon className="w-4 h-4 text-white/30" /></div>
                        )}
                        <p className="flex-1 min-w-0 text-[13px] truncate">{al.title}</p>
                        <span className="text-[11px] text-white/55 tabular-nums">
                          {al.paidUnits} paid · <span className="text-[color:var(--brand-mint)]">{fmt(al.paidUnits * 100)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </DashboardPanel>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(dash.data?.pendingInvites.length ?? 0) > 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 mt-8">
          <h2 className="text-sm font-semibold text-white/85 mb-3">Outstanding invites</h2>
          <DashboardPanel as="ul" padding="none" className="divide-y divide-white/5" data-testid="list-npo-invites">
            {dash.data!.pendingInvites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-[13px]" data-testid={`row-npo-invite-${i.id}`}>
                <Mail className="w-4 h-4 text-white/45" />
                <span className="flex-1 truncate">{i.email}</span>
                <span className="text-[11px] text-white/55 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> expires {new Date(i.expiresAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </DashboardPanel>
        </section>
      )}
    </main>
  );
}

// Task #353 — Per-artist ambassador toggle inside the NPO partner shell.
// Mirrors the admin Permissions-tab toggle (AdminPerson.tsx) but scoped
// to the NPO's own referred artists. PATCH endpoint re-checks NPO
// ownership server-side, so a stray person id can't be promoted.
function AmbassadorToggle({ personId, canInviteAmbassadors }: { personId: string; canInviteAmbassadors: boolean }) {
  const { toast } = useToast();
  const m = useMutation({
    mutationFn: async (next: boolean) => {
      await apiRequest("PATCH", `/api/admin/people/${personId}/can-invite-ambassadors`, { enabled: next });
      return next;
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["/api/non-profit/dashboard"] });
      toast({ title: next ? "Promoted to ambassador" : "Ambassador verb removed" });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    },
  });
  return (
    <label
      htmlFor={`amb-${personId}`}
      className="mb-3 flex items-start gap-3 rounded-lg bg-white/[0.03] ring-1 ring-white/10 px-3 py-2.5 cursor-pointer"
    >
      <input
        id={`amb-${personId}`}
        type="checkbox"
        checked={canInviteAmbassadors}
        disabled={m.isPending}
        onChange={(e) => m.mutate(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[var(--brand-blue)]"
        data-testid={`toggle-npo-ambassador-${personId}`}
      />
      <span className="block min-w-0">
        <span className="block text-xs font-semibold text-white/85">Make ambassador</span>
        <span className="block text-xs text-white/55 mt-0.5">
          When ON, this artist can invite other artists on your non-profit's behalf. Their referrals' credits flow to them, and you still see the roll-up.
        </span>
      </span>
    </label>
  );
}

function Kpi({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId: string }) {
  return (
    <DashboardPanel data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wider text-white/55 font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums" data-testid={`${testId}-value`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-white/55">{sub}</p>}
    </DashboardPanel>
  );
}
