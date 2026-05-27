import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Heart, Music as MusicIcon, Mail, Clock } from "lucide-react";
import { DashboardPanel, DashboardTabs } from "@/components/partner/dashboard-controls";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Task #78 — Non-profit partner shell. Task #518 wraps the original
// single-page surface in a tabbed shell so Dashboard is the leftmost
// tab and the default landing — matching the operator AdminDashboard
// chrome via the shared `PartnerDashboard` primitive. The existing
// "Your artists" + "Outstanding invites" content lives under its own
// tab one step to the right.
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

const NPO_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "artists", label: "Your artists" },
  { id: "invites", label: "Invites" },
] as const;
type NpoTabId = (typeof NPO_TABS)[number]["id"];

export function NonProfitDashboard() {
  const me = useQuery<Me>({ queryKey: ["/api/non-profit/me"] });
  const [tab, setTab] = useState<NpoTabId>("dashboard");

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

      <DashboardTabs tabs={NPO_TABS} value={tab} onChange={setTab} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-6">
        {tab === "dashboard" && (
          <PartnerDashboard
            scope="npo"
            title={me.data?.name ?? "Your dashboard"}
            subtitle="Referred-artist activity and payout accrual"
          />
        )}
        {tab === "artists" && <ArtistsTab />}
        {tab === "invites" && <InvitesTab />}
      </div>
    </main>
  );
}

function ArtistsTab() {
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  return (
    <>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="npo-kpis">
        <Kpi label="Pending payout" value={fmt(dash.data?.pendingCents ?? 0)} sub={`${dash.data?.pendingCount ?? 0} unit${(dash.data?.pendingCount ?? 0) === 1 ? "" : "s"}`} testId="kpi-npo-pending" />
        <Kpi label="Paid out" value={fmt(dash.data?.paidCents ?? 0)} testId="kpi-npo-paid" />
        <Kpi label="Referred artists" value={String(dash.data?.artists.length ?? 0)} testId="kpi-npo-artists" />
      </section>

      <section className="mt-6">
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
                <div className="group/artist flex items-center gap-3 mb-3">
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-white/5" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.name}</p>
                    <p className="text-[11px] text-white/55">{a.albums.length} album{a.albums.length === 1 ? "" : "s"} listed</p>
                  </div>
                  {a.status === "active" && (
                    <AmbassadorChip personId={a.id} canInviteAmbassadors={a.canInviteAmbassadors} />
                  )}
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
    </>
  );
}

function InvitesTab() {
  const dash = useQuery<Dashboard>({ queryKey: ["/api/non-profit/dashboard"] });
  const items = dash.data?.pendingInvites ?? [];
  return (
    <section>
      <h2 className="text-sm font-semibold text-white/85 mb-3">Outstanding invites</h2>
      {dash.isLoading ? (
        <p className="py-8 text-center text-white/45 text-[13px]">Loading…</p>
      ) : items.length === 0 ? (
        <DashboardPanel className="p-8 text-center" padding="none" data-testid="empty-npo-invites">
          <Mail className="w-8 h-8 text-white/30 mx-auto mb-3" />
          <p className="text-sm text-white/65">No outstanding invites.</p>
        </DashboardPanel>
      ) : (
        <DashboardPanel as="ul" padding="none" className="divide-y divide-white/5" data-testid="list-npo-invites">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-[13px]" data-testid={`row-npo-invite-${i.id}`}>
              <Mail className="w-4 h-4 text-white/45" />
              <span className="flex-1 truncate">{i.email}</span>
              <span className="text-[11px] text-white/55 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> expires {new Date(i.expiresAt).toLocaleDateString()}
              </span>
            </li>
          ))}
        </DashboardPanel>
      )}
    </section>
  );
}

// Task #355 — At-a-glance ambassador chip on the NPO artist row.
// Follows the AdminAlbum tracklist P/L/C pattern (StatusChip): a single
// 20px square monogram that's filled brand-blue when ON (visible at
// rest, so an NPO can scan the column for ambassadors) and hidden until
// the row is hovered/focused when OFF (the affordance is there without
// cluttering the resting state). Click toggles via the same Task #353
// PATCH; server re-checks NPO ownership.
function AmbassadorChip({ personId, canInviteAmbassadors }: { personId: string; canInviteAmbassadors: boolean }) {
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
  const on = canInviteAmbassadors;
  return (
    <button
      type="button"
      onClick={() => m.mutate(!on)}
      disabled={m.isPending}
      aria-pressed={on}
      title={on ? "Ambassador — can invite other artists. Click to revoke." : "Make ambassador — allow this artist to invite other artists."}
      className={[
        "inline-flex w-[20px] h-[20px] items-center justify-center rounded-[5px]",
        "font-mono text-xs font-bold leading-none transition-opacity",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)]/60 focus-visible:opacity-100",
        on
          ? "bg-[color:var(--brand-blue)] text-white"
          : "bg-white/10 text-white/55 ring-1 ring-inset ring-white/15 opacity-0 group-hover/artist:opacity-100",
        m.isPending && "opacity-60 cursor-wait",
      ].filter(Boolean).join(" ")}
      data-testid={`chip-npo-ambassador-${personId}`}
      data-state={on ? "on" : "off"}
      aria-label={on ? "Ambassador (click to revoke)" : "Make ambassador"}
    >
      A
    </button>
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
