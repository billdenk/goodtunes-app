// Task #76 — Label rollup reporting dashboard.
//
// Stripe/ElevenLabs-grade overview at `/label` for accounts with admin
// role="label" (super_admin can target any label via ?labelId=). Reads
// /api/label/* — every endpoint is label-scoped server-side. Drill-through
// to an individual roster artist routes to /artist?personId=… which is
// also label-gated server-side (see server/artistReports.ts).
//
// Mirrors ArtistDashboard.tsx in chrome, primitives, palette so the two
// dashboards feel like one product. Headline view is the roster table;
// catalog/audience/orders match the artist layout.

import { useMemo, useState } from "react";
import { formatUsd, formatUsdCents } from "@shared/money";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, ResponsiveContainer, Legend, Line,
} from "recharts";
// Heart for song-favorite metrics, Star for artist-roster metrics —
// per docs/design-system.md the brand uses these two icons as a quick
// visual cue for what a count means (favorites vs roster size).
import { Heart, Star, Building2, LayoutDashboard, BarChart3, Users, Disc3, ShoppingBag, FileBarChart } from "lucide-react";
import { RangePicker, CompareToggle } from "@/components/partner/dashboard-controls";
import { OperatorShell } from "@/components/operator/OperatorShell";
import { modulesForRole } from "@/components/operator/registry";
import { PartnerDashboard } from "@/components/partner/PartnerDashboard";
import { CertRunsSection } from "@/components/partner/cert-runs-section";
import { SalesMap, type SalesGeoPayload } from "@/components/partner/SalesMap";
import { OrganizationPeople } from "@/components/admin/OrganizationPeople";
import { BRAND, CHART_STACK_PALETTE, CHART_TOOLTIP_STYLE } from "@/lib/brand-tokens";

type Range = { from: string; to: string };
type LabelMe = {
  labelId: string; name: string; logoUrl: string | null; coverUrl: string | null;
  location: string | null; albumCount: number; songCount: number; rosterSize: number;
  invitedPress?: { id: string; name: string; logoUrl: string | null } | null;
  hasShippedFirst?: boolean;
};
type Kpis = {
  grossCents: number; labelShareCents: number; refundedCents: number;
  units: number; buyers: number;
  plays: number; completions: number; completionRate: number;
  listeners: number; newFans: number;
  rosterSize: number; albumCount: number;
};
type Summary = { range: Range; compare: Range | null; current: Kpis; previous: Kpis | null };
type Timeseries = {
  range: Range;
  revenue: { day: string; skuKind: string; revenueCents: number }[];
  plays: { day: string; starts: number; completes: number; listeners: number }[];
};
type RevByArtist = {
  range: Range;
  artists: { personId: string; name: string }[];
  days: string[];
  points: { day: string; personId: string; revenueCents: number }[];
};
type Roster = {
  range: Range;
  artists: {
    personId: string; name: string; photoUrl: string | null; albumCount: number;
    revenueCents: number; labelShareCents: number; units: number; buyers: number;
    plays: number; listeners: number;
  }[];
};
type GeoPayload = {
  range: Range;
  sales?: SalesGeoPayload;
};
type AlbumsPayload = {
  range: Range;
  albums: {
    albumId: string; title: string; artist: string; artwork: string | null;
    primaryArtistId: string | null;
    revenueCents: number; labelShareCents: number; units: number; buyers: number;
    plays: number; listeners: number;
  }[];
};
type Tracks = {
  range: Range;
  tracks: {
    songId: string; title: string; albumTitle: string; albumArtist: string;
    plays: number; completes: number; favorites: number; playlistAdds: number; shares: number;
  }[];
};
type OrdersPayload = {
  range: Range;
  orders: {
    id: string; createdAt: string; status: string; totalCents: number;
    labelShareCents: number; country: string | null;
    albumId: string; albumTitle: string; albumArtist: string;
    primaryArtistId: string | null;
  }[];
};

// Brand palette + chart helpers come from the shared token module so
// LabelDashboard and ArtistDashboard reach the same hexes the CSS
// vars do (see client/src/lib/brand-tokens.ts).
const C = BRAND;

function colorFor(i: number) { return CHART_STACK_PALETTE[i % CHART_STACK_PALETTE.length]; }

const dollars = (c: number) => formatUsdCents(c, { maximumFractionDigits: 0 });
const dollarsCents = (c: number) => formatUsdCents(c);
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const pct = (x: number) => `${Math.round(x * 100)}%`;

const RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "12mo", label: "Last 12 months", days: 365 },
] as const;
type PresetId = (typeof RANGE_PRESETS)[number]["id"];

function toIso(d: Date) { return d.toISOString(); }
function rangeFor(preset: PresetId): Range {
  const to = new Date();
  const from = new Date(to.getTime() - (RANGE_PRESETS.find((p) => p.id === preset)!.days) * 86400_000);
  return { from: toIso(from), to: toIso(to) };
}

type SortKey = "revenue" | "units" | "plays" | "listeners" | "buyers" | "albumCount" | "name";

export function LabelDashboard() {
  const [preset, setPreset] = useState<PresetId>("30d");
  const [compare, setCompare] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "overview" | "roster" | "catalog" | "orders">("dashboard");
  const range = useMemo(() => rangeFor(preset), [preset]);
  const qs = useMemo(() => {
    const u = new URLSearchParams({ from: range.from, to: range.to });
    if (!compare) u.set("compare", "off");
    const params = new URLSearchParams(window.location.search);
    const labelId = params.get("labelId");
    if (labelId) u.set("labelId", labelId);
    return u.toString();
  }, [range, compare]);
  const labelIdParam = useMemo(() => new URLSearchParams(window.location.search).get("labelId"), []);

  const me = useQuery<LabelMe>({ queryKey: [`/api/label/me?${qs}`] });

  if (me.error) {
    const msg = (me.error as any)?.message ?? "";
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md text-center" data-testid="label-dashboard-gate">
          <h1 className="text-2xl font-bold mb-2">Label dashboard</h1>
          <p className="text-slate-500 text-sm">
            {msg.includes("Super-admin") ? "Pass ?labelId= to inspect a specific label."
              : msg.includes("Insufficient") ? "This dashboard is for label accounts. Ask a super-admin to invite you."
              : msg.includes("Unauthorized") ? "Sign in with your label account to continue."
              : "We couldn't load your label scope. Please try again."}
          </p>
        </div>
      </main>
    );
  }

  const labelName = me.data?.name ?? "Your dashboard";
  const rosterSize = me.data?.rosterSize ?? 0;
  const albumCount = me.data?.albumCount ?? 0;
  const invitedPress = me.data?.invitedPress ?? null;
  const hasShippedFirst = !!me.data?.hasShippedFirst;

  return (
    <OperatorShell
      testId="label-shell"
      roleLabel="Label dashboard"
      name={labelName}
      logoUrl={me.data?.logoUrl ?? null}
      fallbackIcon={Building2}
      subtitle={`${rosterSize} artist${rosterSize === 1 ? "" : "s"} · ${albumCount} album${albumCount === 1 ? "" : "s"}`}
      headerExtras={invitedPress ? <InvitedByPressRow press={invitedPress} hasShippedFirst={hasShippedFirst} /> : null}
      headerActions={
        <>
          <RangePicker presets={RANGE_PRESETS} value={preset} onChange={setPreset} />
          <CompareToggle active={compare} onToggle={setCompare} />
        </>
      }
      tabs={LABEL_TABS}
      activeTab={tab}
      onTabChange={setTab}
      spaceContent
      layout="leftnav"
      navIcons={{
        dashboard: LayoutDashboard,
        overview: BarChart3,
        roster: Users,
        catalog: Disc3,
        orders: ShoppingBag,
      }}
      navExtras={[{ id: "reports", label: "Reports", href: "/admin/reports", icon: FileBarChart }]}
    >
      {tab === "dashboard" && (
        <PartnerDashboard
          scope="label"
          title={me.data?.name ?? "Your dashboard"}
          subtitle={
            me.data
              ? `${me.data.rosterSize} artist${me.data.rosterSize === 1 ? "" : "s"} · ${me.data.albumCount} album${me.data.albumCount === 1 ? "" : "s"}`
              : undefined
          }
          scopeIdQs={labelIdParam}
        />
      )}
      {tab === "overview" && <OverviewTab qs={qs} labelId={me.data?.labelId ?? null} labelName={labelName} />}
      {tab === "roster" && <RosterTab qs={qs} labelIdParam={labelIdParam} />}
      {tab === "catalog" && <CatalogTab qs={qs} />}
      {tab === "orders" && <OrdersTab qs={qs} labelIdParam={labelIdParam} />}
    </OperatorShell>
  );
}

// Task #205 — Read-only "Invited by {Press}" credit on the label
// dashboard. Mirrors the artist-dashboard row so the two surfaces feel
// like one product; softens after the label's first physical run ships.
function InvitedByPressRow({ press, hasShippedFirst }: {
  press: { id: string; name: string; logoUrl: string | null };
  hasShippedFirst: boolean;
}) {
  const prefix = hasShippedFirst ? "Originally invited by" : "Invited by";
  return (
    <div
      className={`mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 ring-1 ${hasShippedFirst ? "bg-white ring-slate-200 text-slate-500" : "bg-white ring-slate-200 text-slate-700"}`}
      data-testid="row-invited-by-press"
    >
      {press.logoUrl ? (
        <img src={press.logoUrl} alt="" className="w-5 h-5 rounded-sm object-cover" />
      ) : (
        <div className="w-5 h-5 rounded-sm bg-slate-100" />
      )}
      <span className="text-[12px]">
        {prefix}{" "}
        <span className="font-semibold text-slate-900" data-testid="text-invited-press-name">{press.name}</span>
      </span>
      {!hasShippedFirst && (
        <>
          <span className="text-slate-300">·</span>
          <Link href="/chat">
            <a className="text-xs font-semibold text-[color:var(--brand-blue)] hover:underline" data-testid="link-message-goodtunes">
              Message GoodTunes to switch
            </a>
          </Link>
        </>
      )}
    </div>
  );
}

const LABEL_TABS = modulesForRole("label") as ReadonlyArray<{
  id: "dashboard" | "overview" | "roster" | "catalog" | "orders";
  label: string;
}>;
type LabelTabId = (typeof LABEL_TABS)[number]["id"];

// ─── KPI card ─────────────────────────────────────────────────────────
function delta(cur: number, prev: number | null | undefined): { val: string; positive: boolean } | null {
  if (prev == null || prev === 0) return null;
  const change = (cur - prev) / prev;
  if (!isFinite(change)) return null;
  return { val: `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`, positive: change >= 0 };
}
function Kpi({ label, value, sub, prev, testId }: { label: React.ReactNode; value: string; sub?: string; prev?: { cur: number; prev: number | null } | null; testId: string }) {
  const d = prev ? delta(prev.cur, prev.prev) : null;
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-2xl sm:text-[28px] font-bold tabular-nums" data-testid={`${testId}-value`}>{value}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {sub && <span className="text-slate-500">{sub}</span>}
        {d && (
          <span className={`px-1.5 py-0.5 rounded-full font-semibold ${d.positive ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-rose-50 text-rose-700 ring-1 ring-rose-200"}`} data-testid={`${testId}-delta`}>
            {d.val}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────
function OverviewTab({ qs, labelId, labelName }: { qs: string; labelId: string | null; labelName: string }) {
  const summary = useQuery<Summary>({ queryKey: [`/api/label/summary?${qs}`] });
  const series = useQuery<Timeseries>({ queryKey: [`/api/label/timeseries?${qs}`] });
  const byArtist = useQuery<RevByArtist>({ queryKey: [`/api/label/revenue-by-artist?${qs}`] });
  const geo = useQuery<GeoPayload>({ queryKey: [`/api/label/geo?${qs}`] });
  const cur = summary.data?.current;
  const prev = summary.data?.previous ?? null;

  return (
    <>
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="kpi-grid">
        <Kpi label="Gross revenue" value={cur ? dollars(cur.grossCents) : "—"} sub={cur && cur.refundedCents ? `${dollars(cur.refundedCents)} refunded` : undefined} prev={cur ? { cur: cur.grossCents, prev: prev?.grossCents ?? null } : null} testId="kpi-gross" />
        <Kpi label="Units sold" value={cur ? compact(cur.units) : "—"} sub={cur ? `${cur.buyers} unique buyer${cur.buyers === 1 ? "" : "s"}` : undefined} prev={cur ? { cur: cur.units, prev: prev?.units ?? null } : null} testId="kpi-units" />
        <Kpi label="Total plays" value={cur ? compact(cur.plays) : "—"} sub={cur ? `${pct(cur.completionRate)} complete` : undefined} prev={cur ? { cur: cur.plays, prev: prev?.plays ?? null } : null} testId="kpi-plays" />
        <Kpi label="Unique listeners" value={cur ? compact(cur.listeners) : "—"} prev={cur ? { cur: cur.listeners, prev: prev?.listeners ?? null } : null} testId="kpi-listeners" />
        <Kpi label="New fans" value={cur ? compact(cur.newFans) : "—"} sub="First-ever play in window" prev={cur ? { cur: cur.newFans, prev: prev?.newFans ?? null } : null} testId="kpi-new-fans" />
        <Kpi label={<><Star className="w-3 h-3 inline -mt-0.5 mr-1 text-emerald-500 fill-emerald-500" />Roster</>} value={cur ? compact(cur.rosterSize) : "—"} sub={cur ? `${cur.albumCount} album${cur.albumCount === 1 ? "" : "s"}` : undefined} testId="kpi-roster" />
        <Kpi label="Completion rate" value={cur ? pct(cur.completionRate) : "—"} sub={cur ? `${compact(cur.completions)} completions` : undefined} testId="kpi-completion" />
        <Kpi label="Avg. revenue / artist" value={cur && cur.rosterSize ? dollars(cur.grossCents / cur.rosterSize) : "—"} testId="kpi-arpa" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Daily revenue" subtitle="Across the entire roster" testId="chart-revenue">
          <RevenueChart data={series.data?.revenue ?? []} loading={series.isLoading} />
        </Card>
        <Card title="Daily plays" subtitle="Starts & unique listeners" testId="chart-plays">
          <PlaysChart data={series.data?.plays ?? []} loading={series.isLoading} />
        </Card>
      </section>

      <section className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid="chart-geo">
        <SalesMap data={geo.data?.sales} loading={geo.isLoading} />
      </section>

      <Card title="Revenue by artist" subtitle="Stacked daily revenue across the roster" testId="chart-rev-by-artist">
        <RevByArtistChart data={byArtist.data} loading={byArtist.isLoading} />
      </Card>

      <CertRunsSection kind="label" qs={qs} />

      {/* Task #665 — Contacts panel parity with /admin/labels/:id.
          Same Add Admin dialog (pick existing Person or fill in
          name+title+email+phone). Server gates POSTs by invite_subusers
          on the caller; super-admins always pass. UI also gates the
          "+ Add ▾" menu via the can-invite probe so label staff
          without the verb don't see a button that would only 403. */}
      {labelId && (
        <LabelContactsPanel labelId={labelId} labelName={labelName} />
      )}

      {/* Task #952 — Self-serve "Invite an artist or label" panel. A
          label partner holding invite_subusers can onboard a fresh
          artist OR a fresh label, mirroring the artist dashboard. The
          server pins referrer_kind='label' so the chain is recorded for
          provenance (labels carry no per-unit referral column). */}
      <LabelInvitePanel />
    </>
  );
}

type LabelInviteRow = {
  id: string;
  email: string;
  role: string;
  scopeName: string | null;
  scopeThumbUrl: string | null;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  resentAt: string | null;
  acceptUrl: string | null;
};

function LabelInvitePanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [welcomeNote, setWelcomeNote] = useState("");
  const [inviteeRole, setInviteeRole] = useState<"artist" | "label">("artist");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const list = useQuery<{ invites: LabelInviteRow[]; outstanding: number; cap: number }>({
    queryKey: ["/api/label/invites"],
  });

  const send = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/label/invites", {
        email: email.trim(),
        name: name.trim(),
        role: inviteeRole,
        welcomeNote: welcomeNote.trim() || undefined,
      });
      return r.json();
    },
    onSuccess: (data: any) => {
      const kind = inviteeRole;
      setEmail(""); setName(""); setWelcomeNote(""); setInviteeRole("artist"); setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/label/invites"] });
      toast({
        title: data?.reviewStatus === "pending_review" ? "Held for review" : data?.emailDelivered ? "Invite sent" : "Invite created",
        description: data?.reviewStatus === "pending_review"
          ? "GoodTunes will review and notify you when approved."
          : `Emailed ${data?.email ?? `the ${kind}`}.`,
      });
    },
    onError: (e: Error) => toast({ title: "Couldn't invite", description: e.message, variant: "destructive" }),
  });

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/label/invites/${id}/resend`);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/label/invites"] });
      toast({ title: "Invite re-sent" });
    },
    onError: (e: Error) => toast({ title: "Couldn't resend", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/label/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/label/invites"] });
      toast({ title: "Invite revoked" });
    },
    onError: (e: Error) => toast({ title: "Couldn't revoke", description: e.message, variant: "destructive" }),
  });

  const copyLink = async (iv: LabelInviteRow) => {
    if (!iv.acceptUrl) return;
    try {
      await navigator.clipboard.writeText(iv.acceptUrl);
      setCopiedId(iv.id);
      setTimeout(() => setCopiedId((c) => (c === iv.id ? null : c)), 1500);
      toast({ title: "Invite link copied" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  const cap = list.data?.cap ?? 5;
  const outstanding = list.data?.outstanding ?? 0;
  const atCap = outstanding >= cap;
  const invites = list.data?.invites ?? [];
  const joinedCount = invites.filter((iv) => iv.usedAt).length;
  const subtitle = `${outstanding}/${cap} outstanding · ${joinedCount} joined`;
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <Card title="Invite an artist or label" subtitle={subtitle} testId="label-invite-panel">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={atCap}
          className="text-xs font-semibold text-white bg-[var(--brand-purple)] hover:opacity-90 rounded-md px-3 py-1.5 disabled:opacity-40"
          data-testid="button-open-label-invite"
        >
          {atCap ? "Cap reached — revoke one to invite another" : "Invite an artist or label"}
        </button>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (email.trim() && name.trim() && !atCap) send.mutate(); }}
          className="flex flex-col gap-2"
          data-testid="form-label-invite"
        >
          <div className="flex gap-1.5" data-testid="toggle-label-invitee-role">
            {(["artist", "label"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setInviteeRole(r)}
                className={`text-xs font-semibold rounded-md px-3 py-1.5 border ${inviteeRole === r ? "bg-[var(--brand-purple)] text-white border-transparent" : "bg-white text-slate-600 border-slate-200 hover:text-slate-900"}`}
                data-testid={`button-label-invitee-role-${r}`}
              >
                {r === "artist" ? "Artist" : "Label"}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={inviteeRole === "label" ? "Label name" : "Artist name"}
              required
              className="flex-1 px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm"
              data-testid="input-label-invite-name"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              className="flex-1 px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm"
              data-testid="input-label-invite-email"
            />
          </div>
          <textarea
            value={welcomeNote}
            onChange={(e) => setWelcomeNote(e.target.value)}
            placeholder="Optional personal note (1-2 sentences)"
            maxLength={1000}
            rows={2}
            className="px-3 py-2 rounded-md bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm"
            data-testid="input-label-invite-welcome-note"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={send.isPending || atCap}
              className="px-3 py-2 text-sm font-semibold text-white bg-[var(--brand-purple)] hover:opacity-90 rounded-md disabled:opacity-40"
              data-testid="button-send-label-invite"
            >
              {send.isPending ? "Sending…" : "Send invite"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setEmail(""); setName(""); setWelcomeNote(""); setInviteeRole("artist"); }}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
              data-testid="button-cancel-label-invite"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {invites.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100" data-testid="list-label-invites">
          {invites.map((iv) => {
            const accepted = !!iv.usedAt;
            const revoked = !!iv.revokedAt;
            const expired = !accepted && !revoked && new Date(iv.expiresAt) <= new Date();
            const status = accepted ? "Joined" : revoked ? "Revoked" : expired ? "Expired" : "Invited";
            const tone = accepted
              ? "text-emerald-600"
              : revoked || expired ? "text-slate-400"
              : "text-[color:var(--brand-blue)]";
            const metaBits: string[] = [`Invited ${fmtDate(iv.createdAt)}`];
            if (accepted && iv.usedAt) metaBits.push(`Joined ${fmtDate(iv.usedAt)}`);
            if (!accepted && !revoked && iv.resentAt) metaBits.push(`Resent ${fmtDate(iv.resentAt)}`);
            if (!accepted && !revoked && expired) metaBits.push(`Expired ${fmtDate(iv.expiresAt)}`);
            return (
              <li key={iv.id} className="py-2.5" data-testid={`row-label-invite-${iv.id}`}>
                <div className="flex items-center gap-3">
                  {iv.scopeThumbUrl ? (
                    <img src={iv.scopeThumbUrl} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-slate-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-sm flex items-center gap-1.5" data-testid={`text-label-invite-name-${iv.id}`}>
                      <span className="truncate min-w-0">{iv.scopeName ?? iv.email}</span>
                      {iv.role === "label" && (
                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-700 bg-slate-100 rounded px-1.5 py-0.5" data-testid={`tag-label-invite-role-${iv.id}`}>Label</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{iv.email}</p>
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${tone}`} data-testid={`text-label-invite-status-${iv.id}`}>{status}</span>
                  {!accepted && !revoked && (
                    <>
                      {iv.acceptUrl && (
                        <button
                          type="button"
                          onClick={() => copyLink(iv)}
                          className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1"
                          data-testid={`button-copy-label-invite-${iv.id}`}
                        >
                          {copiedId === iv.id ? "Copied" : "Copy link"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => resend.mutate(iv.id)}
                        disabled={resend.isPending}
                        className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 disabled:opacity-40"
                        data-testid={`button-resend-label-invite-${iv.id}`}
                      >
                        Resend
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Revoke invite to ${iv.email}?`)) revoke.mutate(iv.id); }}
                        disabled={revoke.isPending}
                        className="text-xs text-rose-600 hover:text-rose-700 px-2 py-1 disabled:opacity-40"
                        data-testid={`button-revoke-label-invite-${iv.id}`}
                      >
                        Revoke
                      </button>
                    </>
                  )}
                </div>
                <p className="mt-1.5 pl-14 text-xs text-slate-500" data-testid={`text-label-invite-meta-${iv.id}`}>
                  {metaBits.join(" · ")}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function LabelContactsPanel({ labelId, labelName }: { labelId: string; labelName: string }) {
  const probe = useQuery<{ ok: boolean }>({
    queryKey: ["/api/admin/partner-contacts/can-invite", { entityKind: "label", entityId: labelId }],
    queryFn: async () => {
      const r = await fetch(`/api/admin/partner-contacts/can-invite?entityKind=label&entityId=${encodeURIComponent(labelId)}`, { credentials: "include" });
      if (!r.ok) return { ok: false };
      return r.json();
    },
  });
  return (
    <section className="rounded-2xl bg-slate-100 p-1">
      <div className="bg-white rounded-2xl">
        <OrganizationPeople
          apiPath={`/api/labels/${labelId}/people`}
          testIdPrefix="label-shell"
          entityKind="label"
          entityId={labelId}
          entityName={labelName}
          title="Contacts"
          voice="partner"
          blurb="Invite teammates to your label. We'll grant the role if they already have an admin account, otherwise we mint an invite link."
          canInviteSubusers={probe.data?.ok === true}
        />
      </div>
    </section>
  );
}

// ─── Roster tab ───────────────────────────────────────────────────────
function RosterTab({ qs, labelIdParam }: { qs: string; labelIdParam: string | null }) {
  const roster = useQuery<Roster>({ queryKey: [`/api/label/roster?${qs}`] });
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const rows = useMemo(() => {
    const list = [...(roster.data?.artists ?? [])];
    const get = (a: any): number | string => {
      switch (sortKey) {
        case "name": return a.name.toLowerCase();
        case "revenue": return a.revenueCents;
        case "units": return a.units;
        case "plays": return a.plays;
        case "listeners": return a.listeners;
        case "buyers": return a.buyers;
        case "albumCount": return a.albumCount;
      }
    };
    list.sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [roster.data, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  const drillHref = (personId: string) => {
    const u = new URLSearchParams();
    u.set("personId", personId);
    if (labelIdParam) u.set("labelId", labelIdParam);
    return `/artist?${u.toString()}`;
  };

  return (
    <Card
      title="Roster"
      subtitle="Tap an artist to drill into their dashboard"
      testId="table-roster"
      action={<CsvButton href={`/api/label/roster?${qs}&format=csv`} label="roster.csv" testId="export-roster" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <SortableTh label="Artist" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-left pr-3" />
              <SortableTh label="Albums" k="albumCount" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Revenue" k="revenue" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Units" k="units" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Buyers" k="buyers" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Plays" k="plays" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right px-2" />
              <SortableTh label="Listeners" k="listeners" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="text-right pl-2" />
            </tr>
          </thead>
          <tbody>
            {roster.isLoading && <tr><td colSpan={7} className="py-6 text-center text-slate-400">Loading…</td></tr>}
            {!roster.isLoading && rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">No artists on the roster yet.</td></tr>}
            {rows.map((a) => (
              <tr key={a.personId} className="border-t border-slate-100 hover:bg-slate-50 transition" data-testid={`row-artist-${a.personId}`}>
                <td className="py-2 pr-3">
                  <Link href={drillHref(a.personId)}>
                    <a className="flex items-center gap-2 min-w-0 group" data-testid={`link-artist-${a.personId}`}>
                      {a.photoUrl ? (
                        <img src={a.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">{a.name.slice(0, 1).toUpperCase()}</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">{a.name}</p>
                        <p className="truncate text-slate-400 text-[11px]">{a.albumCount} album{a.albumCount === 1 ? "" : "s"}</p>
                      </div>
                    </a>
                  </Link>
                </td>
                <td className="px-2 text-right tabular-nums text-slate-600">{a.albumCount}</td>
                <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                <td className="px-2 text-right tabular-nums">{a.units}</td>
                <td className="px-2 text-right tabular-nums">{a.buyers}</td>
                <td className="px-2 text-right tabular-nums">{compact(a.plays)}</td>
                <td className="pl-2 text-right tabular-nums">{compact(a.listeners)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SortableTh({ label, k, sortKey, sortDir, onSort, className }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = sortKey === k;
  return (
    <th className={`${className ?? ""} font-medium py-2`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-wider ${active ? "text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
        data-testid={`sort-${k}`}
      >
        {label}
        <span className="text-[9px] w-2">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}

// ─── Catalog tab ──────────────────────────────────────────────────────
function CatalogTab({ qs }: { qs: string }) {
  const tracks = useQuery<Tracks>({ queryKey: [`/api/label/top-tracks?${qs}`] });
  const albums = useQuery<AlbumsPayload>({ queryKey: [`/api/label/top-albums?${qs}`] });
  return (
    <>
      <Card
        title="Top albums"
        subtitle="Revenue, units, and plays in window"
        testId="table-top-albums"
        action={<CsvButton href={`/api/label/top-albums?${qs}&format=csv`} label="albums.csv" testId="export-albums" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Album</th>
                <th className="text-right font-medium px-2">Revenue</th>
                <th className="text-right font-medium px-2">Units</th>
                <th className="text-right font-medium px-2">Buyers</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium pl-2">Listeners</th>
              </tr>
            </thead>
            <tbody>
              {albums.isLoading && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Loading…</td></tr>}
              {!albums.isLoading && (albums.data?.albums.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No albums in scope.</td></tr>}
              {albums.data?.albums.map((a) => (
                <tr key={a.albumId} className="border-t border-slate-100" data-testid={`row-album-${a.albumId}`}>
                  <td className="py-2 pr-3">
                    <Link href={`/album/${a.albumId}`}>
                      <a className="flex items-center gap-2 min-w-0 group" data-testid={`link-album-${a.albumId}`}>
                        {a.artwork && <img src={a.artwork} alt="" className="w-9 h-9 rounded object-cover" />}
                        <div className="min-w-0">
                          <p className="truncate font-semibold transition-colors group-hover:text-[color:var(--brand-blue)] group-hover:underline underline-offset-2">{a.title}</p>
                          <p className="truncate text-slate-400 text-[11px]">{a.artist}</p>
                        </div>
                      </a>
                    </Link>
                  </td>
                  <td className="px-2 text-right tabular-nums font-semibold">{dollars(a.revenueCents)}</td>
                  <td className="px-2 text-right tabular-nums">{a.units}</td>
                  <td className="px-2 text-right tabular-nums">{a.buyers}</td>
                  <td className="px-2 text-right tabular-nums">{compact(a.plays)}</td>
                  <td className="pl-2 text-right tabular-nums">{compact(a.listeners)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Top tracks"
        subtitle="Plays, completions, favorites, playlist adds, shares"
        testId="table-top-tracks"
        action={<CsvButton href={`/api/label/top-tracks?${qs}&format=csv`} label="tracks.csv" testId="export-tracks" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-2 pr-3">Track</th>
                <th className="text-right font-medium px-2">Plays</th>
                <th className="text-right font-medium px-2">Completes</th>
                <th className="text-right font-medium px-2">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <Heart className="w-3 h-3 text-rose-500" /> Favorites
                  </span>
                </th>
                <th className="text-right font-medium px-2">Playlist adds</th>
                <th className="text-right font-medium pl-2">Shares</th>
              </tr>
            </thead>
            <tbody>
              {tracks.isLoading && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Loading…</td></tr>}
              {!tracks.isLoading && (tracks.data?.tracks.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No plays yet in this window.</td></tr>}
              {tracks.data?.tracks.map((t) => (
                <tr key={t.songId} className="border-t border-slate-100" data-testid={`row-track-${t.songId}`}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-slate-400 text-[11px] truncate">{t.albumTitle} · {t.albumArtist}</p>
                  </td>
                  <td className="px-2 text-right tabular-nums">{compact(t.plays)}</td>
                  <td className="px-2 text-right tabular-nums">{compact(t.completes)}</td>
                  <td className="px-2 text-right tabular-nums text-rose-500">{compact(t.favorites)}</td>
                  <td className="px-2 text-right tabular-nums">{compact(t.playlistAdds)}</td>
                  <td className="pl-2 text-right tabular-nums">{compact(t.shares)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────
function OrdersTab({ qs, labelIdParam }: { qs: string; labelIdParam: string | null }) {
  const orders = useQuery<OrdersPayload>({ queryKey: [`/api/label/orders?${qs}`] });
  const drillHref = (personId: string) => {
    const u = new URLSearchParams();
    u.set("personId", personId);
    if (labelIdParam) u.set("labelId", labelIdParam);
    return `/artist?${u.toString()}`;
  };
  return (
    <Card
      title="Recent orders"
      subtitle="Across the entire roster"
      testId="table-orders"
      action={<CsvButton href={`/api/label/orders?${qs}&format=csv`} label="orders.csv" testId="export-orders" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-slate-400 text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left font-medium py-2 pr-3">Date</th>
              <th className="text-left font-medium px-2">Album</th>
              <th className="text-left font-medium px-2">Artist</th>
              <th className="text-left font-medium px-2">Country</th>
              <th className="text-left font-medium px-2">Status</th>
              <th className="text-right font-medium pl-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading && <tr><td colSpan={6} className="py-6 text-center text-slate-400">Loading…</td></tr>}
            {!orders.isLoading && (orders.data?.orders.length ?? 0) === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No orders in this window.</td></tr>}
            {orders.data?.orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100" data-testid={`row-order-${o.id}`}>
                <td className="py-2 pr-3 whitespace-nowrap text-slate-700">{new Date(o.createdAt).toLocaleDateString()}</td>
                <td className="px-2 truncate max-w-[200px]">
                  <Link href={`/album/${o.albumId}`}><a className="transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">{o.albumTitle}</a></Link>
                </td>
                <td className="px-2 truncate max-w-[160px] text-slate-700">
                  {o.primaryArtistId ? (
                    <Link href={drillHref(o.primaryArtistId)}><a className="transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">{o.albumArtist}</a></Link>
                  ) : o.albumArtist}
                </td>
                <td className="px-2 text-slate-600">{o.country ?? "—"}</td>
                <td className="px-2"><StatusPill status={o.status} /></td>
                <td className="pl-2 text-right tabular-nums font-semibold">{dollarsCents(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Charts & shared primitives ───────────────────────────────────────
const tooltipStyle = CHART_TOOLTIP_STYLE;

function Card({ title, subtitle, children, testId, action }: { title: string; subtitle?: string; children: React.ReactNode; testId: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          {subtitle && <p className="text-slate-400 text-[12px] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CsvButton({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <a href={href} className="text-xs font-semibold text-[color:var(--brand-blue)] hover:underline underline-offset-2 transition-colors whitespace-nowrap" data-testid={`button-${testId}`}>
      ↓ {label}
    </a>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    shipped: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    refunded: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${map[status] ?? "bg-slate-100 text-slate-700"}`}>{status}</span>;
}

function SkeletonBlock() {
  return <div className="h-48 rounded-2xl bg-slate-100 ring-1 ring-slate-200 animate-pulse" />;
}

function RevenueChart({ data, loading }: { data: Timeseries["revenue"]; loading: boolean }) {
  const rows = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of data) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.revenueCents / 100);
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day: day.slice(5), total }));
  }, [data]);
  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-slate-400 text-[13px]">No revenue in this window.</p>;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="day" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} />
          <YAxis stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatUsd(Number(v), { maximumFractionDigits: 0 })} />
          <Bar dataKey="total" fill={C.blue} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlaysChart({ data, loading }: { data: Timeseries["plays"]; loading: boolean }) {
  const rows = useMemo(() => data.map((r) => ({ day: r.day.slice(5), plays: r.starts, listeners: r.listeners })), [data]);
  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-slate-400 text-[13px]">No plays in this window.</p>;
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <AreaChart data={rows}>
          <defs>
            <linearGradient id="playsFillLabel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.blue} stopOpacity={0.7} />
              <stop offset="100%" stopColor={C.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="day" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} />
          <YAxis stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} />
          <Area type="monotone" dataKey="plays" stroke={C.blue} fill="url(#playsFillLabel)" strokeWidth={2} />
          <Line type="monotone" dataKey="listeners" stroke={C.mint} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RevByArtistChart({ data, loading }: { data: RevByArtist | undefined; loading: boolean }) {
  // Pivot points → rows-by-day with one column per artist. Top N artists
  // by total revenue render individually; the long tail rolls up under
  // "Others" so the legend stays readable.
  const { rows, top, hasOthers } = useMemo(() => {
    if (!data) return { rows: [] as any[], top: [] as { personId: string; name: string }[], hasOthers: false };
    const totalByArtist = new Map<string, number>();
    for (const p of data.points) totalByArtist.set(p.personId, (totalByArtist.get(p.personId) ?? 0) + p.revenueCents);
    const ranked = Array.from(totalByArtist.entries()).sort((a, b) => b[1] - a[1]);
    const TOP = 8;
    const topIds = new Set(ranked.slice(0, TOP).map(([id]) => id));
    const top = data.artists.filter((a) => topIds.has(a.personId));
    const hasOthers = ranked.length > TOP;

    const byDay = new Map<string, Record<string, number>>();
    for (const p of data.points) {
      const day = p.day;
      if (!byDay.has(day)) byDay.set(day, {});
      const bucket = byDay.get(day)!;
      const key = topIds.has(p.personId) ? p.personId : "_others";
      bucket[key] = (bucket[key] ?? 0) + p.revenueCents / 100;
    }
    const rows = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, vals]) => ({ day: day.slice(5), ...vals }));
    return { rows, top, hasOthers };
  }, [data]);

  if (loading) return <SkeletonBlock />;
  if (rows.length === 0) return <p className="py-10 text-center text-slate-400 text-[13px]">No revenue in this window.</p>;
  const nameById = new Map(top.map((a) => [a.personId, a.name] as const));

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(15,23,42,0.08)" vertical={false} />
          <XAxis dataKey="day" stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} />
          <YAxis stroke="#cbd5e1" tick={{ fill: "#64748b", fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, key: any) => [formatUsd(Number(v), { maximumFractionDigits: 0 }), key === "_others" ? "Others" : (nameById.get(String(key)) ?? key)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#64748b" }} formatter={(v) => v === "_others" ? "Others" : (nameById.get(String(v)) ?? v)} />
          {top.map((a, i) => (
            <Bar key={a.personId} dataKey={a.personId} stackId="rev" fill={colorFor(i)} />
          ))}
          {hasOthers && <Bar dataKey="_others" stackId="rev" fill="#cbd5e1" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
