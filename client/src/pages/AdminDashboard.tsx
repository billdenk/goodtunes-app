import { Component, useEffect, useMemo, useState, type ReactNode, type ErrorInfo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, authHeaders, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ShoppingBag,
  UserPlus,
  Banknote,
  Heart,
  Truck,
  CreditCard,
  Clock3,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { KpiCard, type KpiCardModel } from "@/components/admin/KpiCard";
import { useAuth } from "@/hooks/useAuth";

/**
 * Task #140 — Stripe-style admin dashboard. Lives at /admin and
 * /admin/dashboard, replaces the old Albums redirect. All data is
 * wired to existing admin-stats endpoints (no new server pipelines):
 *   • /api/admin/reports/kpis  — KPIs + daily series (current + prior)
 *   • /api/admin/reports/ops   — ops health strip
 *   • /api/admin/orders        — recent activity (orders + payouts)
 *   • /api/admin/customers     — recent activity (new fans)
 */

// Per-section error boundary so a crash in one dashboard widget paints
// the actual error inline (instead of leaving the whole /admin landing
// blank against the dark body bg). React error boundaries don't catch
// errors thrown from effects or async callbacks — those still bubble
// to `installGlobalErrorReporter()` in GlobalErrorBoundary.tsx and
// paint the red fixed banner.
class SectionBoundary extends Component<
  { section: string; children: ReactNode },
  { error: Error | null; info: string | null }
> {
  state = { error: null as Error | null, info: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error(`[AdminDashboard:${this.props.section}]`, error, info);
    this.setState({ info: info?.componentStack ?? null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    const stack = (e.stack ?? "").split("\n").slice(0, 8).join("\n");
    const comp = (this.state.info ?? "").split("\n").slice(0, 8).join("\n");
    return (
      <div
        className="rounded-lg border border-rose-300 bg-rose-50 text-rose-900 p-3 text-xs"
        data-testid={`dashboard-section-error-${this.props.section}`}
      >
        <div className="font-bold mb-1">
          Dashboard section "{this.props.section}" crashed
        </div>
        <div className="font-mono text-xs whitespace-pre-wrap break-all mb-2">
          {e.name || "Error"}: {e.message || "(no message)"}
        </div>
        {stack && (
          <pre className="font-mono text-xs whitespace-pre-wrap break-all opacity-80">
{stack}
          </pre>
        )}
        {comp && (
          <pre className="font-mono text-xs whitespace-pre-wrap break-all opacity-80 mt-2">
Component stack:
{comp}
          </pre>
        )}
      </div>
    );
  }
}

/**
 * Task #1217 — Outer safety net for the entire dashboard content body.
 *
 * The per-`SectionBoundary` wrappers catch individual widget crashes and
 * keep the rest of the page rendering. This boundary sits above ALL of
 * them inside `<AdminFrame>` — if anything in the dashboard throws before
 * a SectionBoundary can catch it (e.g. AdminPageHeader, a top-level hook
 * evaluation, or a SectionBoundary itself failing), this still renders
 * within the admin chrome (sidebar + top bar stay visible) and gives the
 * operator a visible "Dashboard couldn't load" card with a Try again
 * button AND a direct "Go to Albums" link.
 *
 * The "Go to Albums" link is the key addition: previously, any failure
 * that bubbled past the per-section boundaries left Bill staring at an
 * error card with no obvious next step — he had to know to manually type
 * /admin/albums. Now one click gets him to the proven-working page.
 */
class DashboardContentBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; info: string | null }
> {
  state = { error: null as Error | null, info: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AdminDashboard:content]", error, info);
    this.setState({ info: info?.componentStack ?? null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    const stack = (e.stack ?? "").split("\n").slice(0, 8).join("\n");
    return (
      <div
        className="rounded-xl border border-rose-200 bg-rose-50/60 p-6"
        data-testid="dashboard-content-error"
      >
        <div className="text-sm font-semibold text-rose-900 mb-1">
          Dashboard couldn't load
        </div>
        <div className="text-sm text-rose-800/80 mb-4">
          Something went wrong rendering the dashboard. You can try again or
          go straight to Albums — everything else in the admin is working.
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => this.setState({ error: null, info: null })}
            className="h-9 px-4 rounded-md bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            data-testid="button-dashboard-retry"
          >
            Try again
          </button>
          {/* Hard navigate — wouter push might be unreliable inside an
              errored React subtree, and a hard navigation will also clear
              any corrupt client state that contributed to the crash. */}
          <a
            href="/admin/albums"
            className="h-9 px-4 rounded-md border border-slate-300 text-slate-900 text-sm font-semibold hover:bg-slate-100 inline-flex items-center"
            data-testid="link-dashboard-go-to-albums"
          >
            Go to Albums
          </a>
        </div>
        {stack && (
          <details className="text-xs">
            <summary className="cursor-pointer text-rose-800/60 hover:text-rose-800 font-medium">
              Error details
            </summary>
            <pre className="mt-2 font-mono whitespace-pre-wrap break-all text-rose-800/70 rounded border border-rose-200 bg-white p-2">
              {e.name || "Error"}: {e.message || "(no message)"}
              {"\n"}
              {stack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}

const BLUE = "#319ED8";

type RangeKey = "today" | "7d" | "30d" | "90d" | "all";
const RANGE_LS_KEY = "admin-dashboard:range";

function rangeBounds(key: RangeKey): { from: Date; to: Date } {
  const to = new Date();
  let from: Date;
  if (key === "today") {
    from = new Date(to);
    from.setUTCHours(0, 0, 0, 0);
  } else if (key === "7d") {
    from = new Date(to.getTime() - 6 * 86400_000);
  } else if (key === "30d") {
    from = new Date(to.getTime() - 29 * 86400_000);
  } else if (key === "90d") {
    from = new Date(to.getTime() - 89 * 86400_000);
  } else {
    // "All" — anchor to GoodTunes' first full year. Anything earlier
    // predates the catalog so the bound is effectively unconstrained.
    from = new Date(Date.UTC(2024, 0, 1));
  }
  return { from, to };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Em-dash placeholder is used everywhere a numeric tile has no value
// yet (loading, or — critically — when the KPIs endpoint returns a
// partial response in prod). See Task #153: a single undefined field
// used to crash the whole dashboard via `.toLocaleString` on undefined.
const DASH = "—";
// Hardened JSON fetcher for the admin dashboard's parameterised
// endpoints. The default queryClient fetcher joins queryKey segments
// with "/", which would mangle the `?from=…&to=…` query string, so the
// dashboard has to use a custom queryFn. Task #153: the previous version
// silently `.json()`'d non-2xx responses, so a 401/500/HTML reply in
// prod became a truthy-but-empty object that crashed render via
// `undefined.toLocaleString`. We now throw on non-ok so React Query
// surfaces the page-level error boundary instead.
async function fetchAdminJson<T>(url: string): Promise<T> {
  // Session cookie AND bearer token — mirrors the default queryFn, so the
  // parameterised report fetches authenticate in every context the rest of
  // the dashboard does (token-hash logins have no usable session cookie).
  const res = await fetch(url, { credentials: "include", headers: authHeaders() });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}
function fmtUsd(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return DASH;
  if (Math.abs(cents) >= 100_000_00) {
    return `$${(cents / 100_000).toFixed(1)}k`;
  }
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtNum(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return DASH;
  return n.toLocaleString("en-US");
}
function fmtRel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

interface KpisData {
  gmvCents: number;
  netCents: number;
  orderCount: number;
  newSignups: number;
  plays: number;
  series: Array<{ date: string; gmvCents: number; orders: number; signups: number; plays: number }>;
  prior?: {
    from?: string;
    to?: string;
    gmvCents?: number;
    netCents?: number;
    orderCount?: number;
    newSignups?: number;
    plays?: number;
  };
}

interface OpsData {
  stuckFulfillments: { count: number };
  failedCheckouts: { last24hCount: number; last7dCount: number };
  stuckPayoutCount: number;
}
interface ReferralPendingSummary { payableCount: number; blockedCount: number; totalCents: number; batches: Array<any> }
interface WinningData {
  topAlbums: Array<{ id: string; title: string; artist: string; coverUrl?: string | null; cents: number; units: number; deltaPct: number | null }>;
  byPress: Array<{ id: string; name: string; location: string; logoUrl?: string | null; cents: number; units: number; deltaPct: number | null }>;
}

interface OrderRow {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string | null;
  shippedAt: string | null;
  payoutStatus: string | null;
  payoutAmountCents: number | null;
  payoutTransferredAt?: string | null;
  albumTitle: string;
  albumArtist: string;
  customerName: string | null;
  customerEmail: string;
  customerId: string;
}

interface CustomerRow {
  id: string;
  displayName: string | null;
  username: string | null;
  realName: string | null;
  email: string;
  createdAt: string | null;
}

interface CustomersResp {
  rows: CustomerRow[];
  total: number;
}

// Task #1498 — keep the operator dashboard above the fold. The shared
// AdminFrame content wrapper is a plain block (it has a fixed
// `pb-[120px]`), so the dashboard's flex chain never gets a definite
// height to fill — that's why the Trend chart + Recent activity push
// below the fold. Rather than change the shared wrapper (which would
// touch every admin page), the dashboard measures the space between its
// own top and the bottom of the viewport and constrains itself to that.
// A negative bottom margin cancels the wrapper's bottom padding so the
// content can reach the bottom of the screen instead of leaving a
// ~120px dead band. RETIRED in the Apple-canon Round 2 restyle — the
// canon dashboard is a naturally scrolling page (attention cards, KPI
// row, story chart, activity, and the Who's-winning lists stack past
// the fold, matching docs/design-reference/AdminDashboardApple.jpg).

export function AdminDashboard() {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(/\s+/)[0] || "there";
  const [range, setRange] = useState<RangeKey>(() => {
    if (typeof window === "undefined") return "30d";
    try {
      const saved = localStorage.getItem(RANGE_LS_KEY) as RangeKey | null;
      if (saved && ["today", "7d", "30d", "90d", "all"].includes(saved)) return saved;
    } catch {}
    return "30d";
  });
  useEffect(() => {
    try {
      localStorage.setItem(RANGE_LS_KEY, range);
    } catch {}
  }, [range]);

  const { from, to } = useMemo(() => rangeBounds(range), [range]);
  const windowMs = to.getTime() - from.getTime();
  const priorTo = new Date(from.getTime() - 1);
  const priorFrom = new Date(priorTo.getTime() - windowMs);

  const qs = useMemo(
    () => `from=${isoDay(from)}&to=${isoDay(to)}`,
    [from, to],
  );
  const priorQs = useMemo(
    () => `from=${isoDay(priorFrom)}&to=${isoDay(priorTo)}`,
    [priorFrom, priorTo],
  );

  const { data: role } = useQuery<{ role: string; roleScopeId: string | null }>({
    queryKey: ["/api/me/role"],
  });
  const isArtistEarly = role?.role === "artist";

  // God-view KPI/ops endpoints are super_admin/admin-only — don't fire
  // them at all for artist partners (they'd 403). Wait until role loads.
  const { data: kpis, isLoading: kpisLoading } = useQuery<KpisData>({
    queryKey: ["/api/admin/reports/kpis", qs],
    queryFn: () => fetchAdminJson<KpisData>(`/api/admin/reports/kpis?${qs}`),
    enabled: !!role && !isArtistEarly,
  });

  // Second fetch for the prior-period daily series. The KPIs endpoint
  // already includes prior totals in `data.prior`, but not the prior
  // daily series — so for the comparison line on the primary chart we
  // re-query the same endpoint over the prior window.
  const { data: priorKpis } = useQuery<KpisData>({
    queryKey: ["/api/admin/reports/kpis", priorQs],
    queryFn: () => fetchAdminJson<KpisData>(`/api/admin/reports/kpis?${priorQs}`),
    enabled: !!role && !isArtistEarly,
  });

  const { data: ops } = useQuery<OpsData>({
    queryKey: ["/api/admin/reports/ops", qs],
    queryFn: () => fetchAdminJson<OpsData>(`/api/admin/reports/ops?${qs}`),
    enabled: !!role && !isArtistEarly,
  });

  const { data: artistSummary } = useQuery<{
    current: { grossCents: number; units: number; buyers: number; plays: number; topAlbum: { title: string; revenue: string } | null };
    previous: { grossCents: number; units: number; buyers: number; plays: number } | null;
    topFans: { email: string; totalCents: number }[];
    npoPayout: number;
  }>({
    queryKey: ["/api/artist/summary", qs],
    queryFn: () => fetchAdminJson(`/api/artist/summary?${qs}`),
    enabled: isArtistEarly,
  });

  const { data: recentOrders } = useQuery<OrderRow[]>({
    queryKey: ["/api/admin/orders"],
  });

  const { data: recentCustomers } = useQuery<CustomersResp>({
    queryKey: ["/api/admin/customers"],
  });
  // Referral payouts are a super_admin-only verb — don't fetch (or surface
  // the attention card / header pill) for ordinary admins.
  const { data: pendingPayouts } = useQuery<ReferralPendingSummary>({
    queryKey: ["/api/admin/referral-payouts/pending"],
    enabled: role?.role === "super_admin",
  });
  const { data: winning } = useQuery<WinningData>({
    queryKey: ["/api/admin/reports/winning", qs],
    queryFn: () => fetchAdminJson<WinningData>(`/api/admin/reports/winning?${qs}`),
    enabled: !!role && !isArtistEarly,
  });

  const isSuperAdmin = role?.role === "super_admin";
  const isArtist = isArtistEarly;

  // Task #1498 — the operator dashboard fits one screen; the artist
  // variant has no Trend chart and keeps its natural scroll.
  return (
    <AdminFrame active="dashboard">
      {/* Task #1217 — DashboardContentBoundary wraps the entire content
          body so ANY throw that escapes the per-SectionBoundary wrappers
          (including AdminPageHeader or a SectionBoundary's own render)
          still shows a visible recovery card WITH a "Go to Albums" link
          inside the admin chrome — sidebar and header remain visible.
          Without this, those throws would bubble to AdminErrorBoundary
          (which shows a generic admin error card with no Albums escape)
          or, if AdminFrame itself were involved, to AdminShellErrorBoundary
          which removes the sidebar entirely. */}
      <DashboardContentBoundary>
        <div
          className="gt-dashboard-canon flex flex-col gap-14 lg:gap-20 min-h-full pt-6 pb-20 max-w-[1240px] mx-auto w-full"
        >
          <SectionBoundary section="page-header">
            <AdminPageHeader
              title={<span>Good morning, {firstName}.</span>}
              subtitle={isArtist ? "Your releases and recent fan activity." : (attentionCount(ops, pendingPayouts) > 0 ? `${attentionCount(ops, pendingPayouts)} thing${attentionCount(ops, pendingPayouts) === 1 ? "" : "s"} need${attentionCount(ops, pendingPayouts) === 1 ? "s" : ""} you before anything else.` : "Nothing needs you before anything else.")}
              testId="heading-admin-dashboard"
              actions={<div className="flex items-center gap-3"><RangeSwitcher value={range} onChange={setRange} />{isSuperAdmin && <button type="button" className="gt-primary-pill" onClick={() => window.dispatchEvent(new Event("gt:run-payouts"))} data-testid="button-run-payouts-header"><Banknote className="w-4 h-4" />Run payouts</button>}</div>}
            />
          </SectionBoundary>

          {!isArtist && (
            <>
              <SectionBoundary section="ops-health">
                <AttentionSection ops={ops} pending={pendingPayouts} />
              </SectionBoundary>

              <SectionBoundary section="referral-payouts">
                {isSuperAdmin && <ReferralPayoutsCard />}
              </SectionBoundary>

              <SectionBoundary section="kpi-grid">
                <section><CanonHeading lead="The numbers." rest="At a glance."/><KpiGrid kpis={kpis} loading={kpisLoading} qs={qs} /></section>
              </SectionBoundary>

              {/* Heading spans the full row; the Trend card sets the row
                  height (reference: items-stretch 2fr/1fr grid) and the
                  activity feed absolutely fills its cell so both cards
                  share top and bottom edges on lg. */}
              <section>
                <CanonHeading lead="The story." rest={`How the last ${range === "30d" ? "month" : "period"} moved.`}/>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-stretch">
                  <div className="flex flex-col min-h-0">
                    <SectionBoundary section="primary-chart">
                      <PrimaryChart kpis={kpis} prior={priorKpis} loading={kpisLoading} range={range} />
                    </SectionBoundary>
                  </div>
                  <div className="relative min-h-0">
                    <SectionBoundary section="activity-feed">
                      <div className="lg:absolute lg:inset-0">
                        <ActivityFeed orders={recentOrders ?? []} customers={recentCustomers?.rows ?? []} className="h-full lg:overflow-hidden" />
                      </div>
                    </SectionBoundary>
                  </div>
                </div>
              </section>
              <SectionBoundary section="winning"><WinningSection data={winning} /></SectionBoundary>
            </>
          )}

          {isArtist && (
            <>
              <SectionBoundary section="artist-kpis">
                <ArtistKpiTiles
                  summary={artistSummary}
                  loading={!role}
                  openOrders={recentOrders?.filter(o => o.status === "paid").length ?? 0}
                />
              </SectionBoundary>
              <SectionBoundary section="activity-feed">
                <ActivityFeed orders={recentOrders ?? []} customers={recentCustomers?.rows ?? []} />
              </SectionBoundary>
            </>
          )}
        </div>
      </DashboardContentBoundary>
    </AdminFrame>
  );
}

function attentionCount(ops?: OpsData, pending?: ReferralPendingSummary) {
  return (ops?.stuckFulfillments.count ? 1 : 0) + (ops?.failedCheckouts.last24hCount ? 1 : 0) +
    (ops?.stuckPayoutCount ? 1 : 0) + (pending?.payableCount ? 1 : 0);
}

function CanonHeading({ lead, rest }: { lead: string; rest: string }) {
  return <h2 className="gt-section-heading"><strong>{lead}</strong> <span>{rest}</span></h2>;
}

// Severity tokens — exact values from the design reference
// (docs/design-reference/code/AdminDashboardApple.tsx WorkQueueCard).
const SEVERITY: Record<string, { color: string; wash: string; label: string }> = {
  critical: { color: "var(--apple-critical)", wash: "var(--apple-critical-wash)", label: "Needs action" },
  warning: { color: "var(--apple-warning)", wash: "var(--apple-warning-wash)", label: "In transit" },
  ready: { color: "var(--apple-ready)", wash: "var(--apple-ready-wash)", label: "Ready to run" },
};

function AttentionSection({ ops, pending }: { ops?: OpsData; pending?: ReferralPendingSummary }) {
  const [open, setOpen] = useState(true);
  const cards = [
    ops?.stuckFulfillments.count ? { Icon: Truck, title: `${ops.stuckFulfillments.count} orders failed to reach fulfillment`, detail: "Paid, but never pushed to the press. Fans are waiting.", action: "Push to fulfillment", href: "/admin/orders?needsPush=1", tone: "critical", link: false } : null,
    ops?.failedCheckouts.last24hCount ? { Icon: CreditCard, title: `${ops.failedCheckouts.last24hCount} checkouts failed in the last 24h`, detail: `${ops.failedCheckouts.last7dCount} in the last 7 days. Lost revenue if unresolved.`, action: "Investigate", href: "/admin/reports", tone: "critical", link: true } : null,
    ops?.stuckPayoutCount ? { Icon: Clock3, title: `${ops.stuckPayoutCount} payouts stuck in transit`, detail: "Transfer created but not confirmed by Stripe. Retry or inspect.", action: "Review", href: "/admin/reports", tone: "warning", link: true } : null,
    pending?.payableCount ? { Icon: Banknote, title: `${fmtUsd(pending.totalCents)} in referral payouts ready to run`, detail: `${pending.payableCount} payees clear${pending.blockedCount ? `, ${pending.blockedCount} blocked on Stripe setup` : ""}.`, action: "Run payouts", href: "#", tone: "ready", link: false } : null,
  ].filter(Boolean) as Array<any>;
  // Zero items → the header subtitle already says "Nothing needs you
  // before anything else." — the bar would just be noise. The section
  // reappears (bar + collapsible cards) the moment anything qualifies.
  if (cards.length === 0) return null;
  return <section data-testid="ops-health-strip">
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      data-testid="button-attention-toggle"
      className="w-full flex items-center justify-between rounded-2xl bg-white border border-[var(--apple-hairline)] px-5 py-3.5 text-left"
    >
      <span className="text-[13px] font-semibold text-[var(--apple-ink)]">Needs your attention</span>
      <span className="flex items-center gap-2 text-[12.5px] text-[var(--apple-subink)]">
        {cards.length} item{cards.length === 1 ? "" : "s"}
        <ChevronDown
          className="w-4 h-4 text-[var(--apple-faint)] transition-transform duration-300"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-180deg)" }}
          aria-hidden
        />
      </span>
    </button>
    {/* Reference collapse: grid-template-rows 1fr/0fr over 300ms. */}
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden min-h-0">
        <div className="grid gap-4 pt-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {cards.map((c, i) => {
            const sev = SEVERITY[c.tone];
            const CardIcon = c.Icon;
            return (
              <article key={i} className="rounded-2xl bg-white border border-[var(--apple-hairline)] p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: sev.wash }}>
                    <CardIcon className="w-[18px] h-[18px]" style={{ color: sev.color }} />
                  </span>
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: sev.color }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: sev.color }} aria-hidden />
                    {sev.label}
                  </span>
                </div>
                <h3 className="text-[17px] font-semibold text-[var(--apple-ink)] leading-snug mb-1.5">{c.title}</h3>
                <p className="text-[13.5px] text-[var(--apple-subink)] leading-relaxed flex-1 mb-5">{c.detail}</p>
                {c.href === "#" ? (
                  <span className="flex items-center gap-4">
                    <button type="button" className="gt-primary-mini" onClick={() => window.dispatchEvent(new Event("gt:run-payouts"))} data-testid="button-attention-run-payouts">{c.action}<ArrowRight className="w-3.5 h-3.5" /></button>
                    <button type="button" className="gt-quiet-link" onClick={() => window.dispatchEvent(new Event("gt:preview-payouts"))} data-testid="button-referral-payouts-preview">Preview<ChevronRight className="w-3.5 h-3.5" /></button>
                  </span>
                ) : c.link ? (
                  <Link href={c.href} className="gt-quiet-link">{c.action}<ChevronRight className="w-3.5 h-3.5" /></Link>
                ) : (
                  <Link href={c.href} className="gt-primary-mini self-start">{c.action}<ArrowRight className="w-3.5 h-3.5" /></Link>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  </section>;
}

function WinningSection({ data }: { data?: WinningData }) {
  const maxAlbum = data?.topAlbums?.[0]?.cents || 1;
  const maxPress = data?.byPress?.[0]?.cents || 1;
  // Reference RankedListPanel rows: rank (13px #c7c7cc, w-4 right) ·
  // w-11 thumb (rounded-xl art / white circle press logo) · 15px title +
  // 12.5px subtitle · 15px semibold revenue; progress line beneath,
  // aligned under the title.
  const list = (rows: any[], press = false) =>
    rows?.length ? (
      rows.slice(0, 5).map((r, i) => (
        <div className="flex items-start gap-3.5 py-3" key={r.id}>
          <span className="w-4 text-right text-[13px] leading-[44px] flex-shrink-0" style={{ color: "var(--apple-axis)" }}>{i + 1}</span>
          <span
            className={[
              "w-11 h-11 flex-shrink-0 overflow-hidden",
              press
                ? "rounded-full bg-white border border-[var(--apple-hairline)] p-1"
                : "rounded-xl bg-[var(--apple-tile)]",
            ].join(" ")}
          >
            {(press ? r.logoUrl : r.coverUrl) ? (
              <img src={press ? r.logoUrl : r.coverUrl} alt="" className={`w-full h-full ${press ? "object-contain" : "object-cover"}`} />
            ) : null}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] font-medium text-[var(--apple-ink)] truncate">{r.title || r.name}</span>
              <span className="text-[15px] font-semibold text-[var(--apple-ink)] tabular-nums flex-shrink-0">{fmtUsd(r.cents)}</span>
            </div>
            <div className="text-[12.5px] text-[var(--apple-subink)] truncate">{r.artist || r.location}</div>
            <div className="flex items-center gap-2 mt-2.5">
              <span className="flex-1 h-1.5 rounded-full bg-[var(--apple-track)] overflow-hidden">
                <i className="block h-full rounded-full bg-[var(--apple-blue)]" style={{ width: `${Math.round((r.cents / (press ? maxPress : maxAlbum)) * 100)}%` }} />
              </span>
              <span className="w-16 text-[12px] text-[var(--apple-faint)] whitespace-nowrap">{fmtNum(r.units)} units</span>
              {r.deltaPct != null && (
                <span
                  className="w-14 text-right text-[12px] font-semibold tabular-nums"
                  style={{ color: r.deltaPct < 0 ? "var(--apple-critical)" : "var(--apple-ready)" }}
                >
                  {r.deltaPct >= 0 ? "+" : ""}
                  {r.deltaPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      ))
    ) : (
      <p className="text-[13px] text-[var(--apple-subink)]">No data for this period yet.</p>
    );
  const panel = (heading: string, sub: string, href: string, body: ReactNode) => (
    <div className="rounded-2xl bg-white border border-[var(--apple-hairline)] p-6 h-full">
      <header className="flex items-baseline justify-between mb-2">
        <h3 className="text-[20px] tracking-[-0.02em]">
          <span className="font-semibold text-[var(--apple-ink)]">{heading}</span>{" "}
          <span className="font-medium text-[var(--apple-subink)]">{sub}</span>
        </h3>
        <Link href={href} className="text-[13.5px] font-medium text-[var(--apple-blue)] hover:underline underline-offset-2 transition-colors">View all</Link>
      </header>
      {body}
    </div>
  );
  return <section><CanonHeading lead="Who's winning." rest="The catalog and the presses behind it."/><div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-stretch">
    {panel("Top projects.", "By revenue.", "/admin/reports?tab=revenue", list(data?.topAlbums || []))}
    {panel("Sales by press.", "Your partners.", "/admin/vendors", list(data?.byPress || [], true))}
  </div></section>;
}

// ─── Range switcher ────────────────────────────────────────────────────

function RangeSwitcher({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: Array<{ v: RangeKey; label: string }> = [
    { v: "today", label: "Today" },
    { v: "7d", label: "7 days" },
    { v: "30d", label: "30 days" },
    { v: "90d", label: "90 days" },
    { v: "all", label: "All" },
  ];
  // Reference: rounded-full track (#f0f0f2) p-1 gap-2; buttons px-3.5 h-8
  // text-[13px] rounded-full; active = white pill, 600, soft shadow.
  return (
    <div
      className="inline-flex items-center rounded-full p-1 gap-2 bg-[var(--apple-track)]"
      data-testid="dashboard-range-switcher"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={active}
            data-testid={`button-range-${o.v}`}
            className={[
              "px-3.5 h-8 text-[13px] rounded-full transition-all",
              active
                ? "bg-white text-[var(--apple-ink)] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "text-[var(--apple-subink)] font-medium hover:text-[var(--apple-ink)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── KPI tiles ─────────────────────────────────────────────────────────

// Reference KpiBoard tile — rounded-2xl p-6 card, 13px label, 38px
// value, 13px delta vs prior. No sparklines (reference has none).
function KpiTile({
  label,
  value,
  prior,
  currency,
  testId,
  href,
  loading,
}: {
  label: string;
  value: number | null | undefined;
  prior: number | null | undefined;
  currency?: boolean;
  testId: string;
  href: string;
  loading: boolean;
}) {
  const delta =
    value != null && prior != null && prior !== 0
      ? ((value - prior) / prior) * 100
      : null;
  return (
    <Link
      href={href}
      data-testid={testId}
      className="block rounded-2xl bg-white border border-[var(--apple-hairline)] p-6 transition-shadow hover:shadow-sm"
    >
      <div className="text-[13px] text-[var(--apple-subink)]">{label}</div>
      <div
        className="mt-3 text-[38px] leading-none font-semibold tracking-[-0.03em] text-[var(--apple-ink)] tabular-nums"
        data-testid={`${testId}-value`}
      >
        {loading || value == null ? "—" : currency ? fmtUsd(value) : fmtNum(value)}
      </div>
      <div className="mt-2 text-[13px]">
        {delta == null ? (
          <span className="text-[var(--apple-faint)]">—</span>
        ) : (
          <>
            <span className="font-semibold" style={{ color: delta >= 0 ? "var(--apple-ready)" : "var(--apple-critical)" }}>
              {delta >= 0 ? "+" : ""}
              {delta.toFixed(1)}%
            </span>{" "}
            <span className="text-[var(--apple-faint)]">vs prior</span>
          </>
        )}
      </div>
    </Link>
  );
}

function KpiGrid({ kpis, loading, qs }: { kpis?: KpisData; loading: boolean; qs: string }) {
  const prior = kpis?.prior ?? {};
  // Task #145 — each tile drills into the matching detailed report
  // with the dashboard's selected date range carried through in the
  // query string. `/admin/reports` reads `?tab=` to pick the right
  // pane and `?from=…&to=…` for the date filter.
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      data-testid="dashboard-kpi-grid"
    >
      <KpiTile label="Gross sales" value={kpis?.gmvCents} prior={prior.gmvCents} currency testId="tile-gmv" href={`/admin/reports?tab=revenue&${qs}`} loading={loading} />
      <KpiTile label="Net revenue" value={kpis?.netCents} prior={prior.netCents} currency testId="tile-net" href={`/admin/reports?tab=revenue&${qs}`} loading={loading} />
      <KpiTile label="Orders" value={kpis?.orderCount} prior={prior.orderCount} testId="tile-orders" href={`/admin/orders?${qs}`} loading={loading} />
      <KpiTile label="New fans" value={kpis?.newSignups} prior={prior.newSignups} testId="tile-signups" href={`/admin/customers?${qs}`} loading={loading} />
      <KpiTile label="Plays" value={kpis?.plays} prior={prior.plays} testId="tile-plays" href={`/admin/reports?tab=plays&${qs}`} loading={loading} />
    </div>
  );
}

// ─── Primary chart ─────────────────────────────────────────────────────

type ChartMetric = "gmv" | "orders" | "signups" | "plays";

// Reference TrendChart header title, keyed to the selected range.
const RANGE_CHART_TITLE: Record<RangeKey, string> = {
  today: "Today.",
  "7d": "The last 7 days.",
  "30d": "The last 30 days.",
  "90d": "The last 90 days.",
  all: "All time.",
};

function PrimaryChart({
  kpis,
  prior,
  loading,
  range,
}: {
  kpis?: KpisData;
  prior?: KpisData;
  loading: boolean;
  range: RangeKey;
}) {
  const [metric, setMetric] = useState<ChartMetric>("gmv");
  const series = kpis?.series ?? [];
  const priorSeries = prior?.series ?? [];

  // Align prior series by day-offset so it can be drawn alongside the
  // current series in the same chart.
  const merged = useMemo(() => {
    const rows = series.map((s, i) => {
      const p = priorSeries[i];
      const key = metric === "gmv" ? "gmvCents" : metric === "orders" ? "orders" : metric === "signups" ? "signups" : "plays";
      const currentVal = (s as any)?.[key];
      const priorVal = p ? (p as any)[key] : undefined;
      return {
        date: s?.date ?? "",
        current: typeof currentVal === "number" ? currentVal : 0,
        prior: typeof priorVal === "number" ? priorVal : null,
      };
    });
    // "All" anchors the window at Jan 2024, which pads the front of the
    // series with months of flat zeros and crushes the real data into a
    // sliver at the right edge. Trim leading all-zero days (keeping one
    // day of runway) so the plot starts where activity starts. Bounded
    // ranges (7/30/90 days) are left intact — a quiet week should still
    // look like a quiet week.
    const first = rows.findIndex((r) => r.current !== 0 || (r.prior ?? 0) !== 0);
    if (first > 1 && rows.length - first >= 2) return rows.slice(first - 1);
    return rows;
  }, [series, priorSeries, metric]);

  const isCurrency = metric === "gmv";
  const opts: Array<{ v: ChartMetric; label: string }> = [
    { v: "gmv", label: "GMV" },
    { v: "orders", label: "Orders" },
    { v: "signups", label: "New fans" },
    { v: "plays", label: "Plays" },
  ];

  return (
      <div className="rounded-2xl border border-[var(--apple-hairline)] bg-white p-7 h-full flex flex-col" data-testid="dashboard-primary-chart">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]">{RANGE_CHART_TITLE[range]}</h3>
          <p className="text-[13.5px] text-[var(--apple-subink)] mt-0.5">This period, measured against the one before.</p>
        </div>
        <div className="inline-flex items-center rounded-full p-1 gap-1 bg-[var(--apple-track)]">
          {opts.map((o) => {
            const active = metric === o.v;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => setMetric(o.v)}
                aria-pressed={active}
                data-testid={`button-chart-metric-${o.v}`}
                className={[
                  "px-3 h-7 text-[12.5px] rounded-full transition-all",
                  active
                    ? "bg-white text-[var(--apple-ink)] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                    : "text-[var(--apple-subink)] font-medium hover:text-[var(--apple-ink)]",
                ].join(" ")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Fixed-height chart box (matches the reference screenshot) — the
          chart fills this box; it must NEVER size itself off the page, or
          ResponsiveContainer's height:100% feedback loop grows it without
          bound now that the dashboard scrolls naturally. */}
      {/* Mobile: fixed 300px box so ResponsiveContainer's height:100%
          feedback loop can't grow it without bound while the page
          scrolls naturally. lg: flex-1 with the reference's min-height
          (the card's natural height sets the story-grid row). */}
      <div className="h-[300px] lg:h-auto lg:flex-1 lg:min-h-[280px] flex flex-col">
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Loading…
        </div>
      ) : merged.length === 0 ? (
        <div className="flex-1 relative" data-testid="dashboard-chart-empty">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[]} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: "#c7c7cc", fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fill: "#c7c7cc", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={[0, 1]}
                tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-400 text-sm">No activity in this range yet.</span>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gtTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BLUE} stopOpacity={0.18} />
                <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: "#c7c7cc", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={40}
              tickFormatter={(d: string) => (typeof d === "string" ? d.slice(5) : d)}
            />
            <YAxis
              tick={{ fill: "#c7c7cc", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
            />
            <Tooltip
              formatter={(v: number) => (isCurrency ? fmtUsd(v) : fmtNum(v))}
              labelStyle={{ color: "var(--apple-ink)" }}
              contentStyle={{
                borderRadius: 12,
                background: "var(--apple-card)",
                border: "1px solid var(--apple-hairline)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              }}
            />
            <Area
              type="monotone"
              dataKey="prior"
              stroke="#c7c7cc"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="none"
              dot={false}
              name="Prior period"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="current"
              stroke={BLUE}
              strokeWidth={2.5}
              fill="url(#gtTrendFill)"
              dot={false}
              name="This period"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
      </div>
    </div>
  );
}

// ─── Activity feed ─────────────────────────────────────────────────────

// ─── Artist KPI tiles ──────────────────────────────────────────────────

type ArtistSummaryData = {
  current: { grossCents: number; units: number; buyers: number; plays: number; topAlbum: { title: string; revenue: string } | null };
  previous: { grossCents: number; units: number; buyers: number; plays: number } | null;
  topFans: { email: string; totalCents: number }[];
  npoPayout: number;
};

function ArtistKpiTiles({
  summary,
  loading,
  openOrders,
}: {
  summary: ArtistSummaryData | undefined;
  loading: boolean;
  openOrders: number;
}) {
  const topFans = summary?.topFans ?? [];
  const npoPayout = summary?.npoPayout ?? 0;
  const cur = summary?.current;
  const prev = summary?.previous;
  const tiles: Array<{ model: KpiCardModel; testId: string }> = [
    {
      testId: "kpi-tile-revenue",
      model: {
        id: "revenue",
        label: "Revenue",
        value: cur ? cur.grossCents : null,
        prior: prev ? prev.grossCents : null,
        format: "currency",
      },
    },
    {
      testId: "kpi-tile-units-sold",
      model: {
        id: "units",
        label: "Units sold",
        value: cur ? cur.units : null,
        prior: prev ? prev.units : null,
        format: "number",
      },
    },
    {
      testId: "kpi-tile-fans",
      model: {
        id: "fans",
        label: "Fans",
        value: cur ? cur.buyers : null,
        prior: prev ? prev.buyers : null,
        format: "number",
      },
    },
    {
      testId: "kpi-tile-streams",
      model: {
        id: "plays",
        label: "Streams",
        value: cur ? cur.plays : null,
        prior: prev ? prev.plays : null,
        format: "number",
      },
    },
    {
      testId: "kpi-tile-open-orders",
      model: {
        id: "openOrders",
        label: "Open orders",
        value: loading ? null : openOrders,
        format: "number",
      },
    },
  ];
  const topAlbum = cur?.topAlbum ?? null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="artist-kpi-grid">
        {tiles.map((t) => (
          <KpiCard key={t.testId} model={t.model} testId={t.testId} />
        ))}
      </div>
      {topAlbum && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3" data-testid="artist-top-album">
          <ShoppingBag className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-600">Top release this period:</span>
          <span className="text-sm font-semibold text-slate-900 truncate">{topAlbum.title}</span>
          <span className="text-sm text-slate-500 ml-auto flex-shrink-0">
            ${(Number(topAlbum.revenue) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      )}
      {topFans.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3" data-testid="artist-top-fans">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Top fans this period</p>
          <div className="space-y-1.5">
            {topFans.map((fan, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700 truncate min-w-0">{fan.email}</span>
                <span className="text-sm font-semibold text-slate-900 flex-shrink-0">
                  ${(fan.totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {npoPayout > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3" data-testid="artist-npo-payout">
          <Heart className="w-4 h-4 text-[color:var(--heart-pink)] flex-shrink-0" />
          <span className="text-sm text-slate-600">NPO giving this period:</span>
          <span className="text-sm font-semibold text-slate-900 ml-auto">
            ${(npoPayout / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </span>
        </div>
      )}
    </div>
  );
}

interface FeedItem {
  kind: "order" | "signup" | "payout";
  ts: Date;
  title: string;
  detail: string;
  href: string;
}

function ActivityFeed({ orders, customers, className = "" }: { orders: OrderRow[]; customers: CustomerRow[]; className?: string }) {
  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    for (const o of orders) {
      if (o.status === "paid" || o.status === "shipped") {
        const ts = o.createdAt ? new Date(o.createdAt) : null;
        if (ts) {
          out.push({
            kind: "order",
            ts,
            title: `${o.customerName || o.customerEmail} bought ${o.albumTitle}`,
            detail: `${o.albumArtist} · ${fmtUsd(o.totalCents)}`,
            href: "/admin/orders",
          });
        }
      }
      if (o.payoutStatus === "transferred" && o.payoutTransferredAt && o.payoutAmountCents) {
        out.push({
          kind: "payout",
          ts: new Date(o.payoutTransferredAt),
          title: `Payout sent · ${fmtUsd(o.payoutAmountCents)}`,
          detail: `${o.albumArtist} — ${o.albumTitle}`,
          href: "/admin/reports",
        });
      }
    }
    for (const c of customers) {
      if (!c.createdAt) continue;
      out.push({
        kind: "signup",
        ts: new Date(c.createdAt),
        title: `${c.displayName || c.username || c.realName || c.email} joined`,
        detail: c.email,
        // Task #2533 — stamp the dashboard origin so the customer page's
        // back-crumb returns to the dashboard, not "← Customers".
        href: `/admin/customers/${c.id}?from=partner&backHref=${encodeURIComponent("/admin/dashboard")}&backName=${encodeURIComponent("Dashboard")}`,
      });
    }
    out.sort((a, b) => b.ts.getTime() - a.ts.getTime());
    // 14 most recent (reference feed length) — the card is a glance,
    // not a log; the panel scrolls for the rest.
    return out.slice(0, 14);
  }, [orders, customers]);

  // Reference chips: All / Sales / Added / Ops.
  const [filter, setFilter] = useState<"all" | "sales" | "added" | "ops">("all");
  const KIND_CATEGORY: Record<FeedItem["kind"], "sales" | "added" | "ops"> = {
    order: "sales",
    signup: "added",
    payout: "ops",
  };
  const visible = filter === "all" ? items : items.filter((it) => KIND_CATEGORY[it.kind] === filter);
  const chips: Array<{ v: typeof filter; label: string }> = [
    { v: "all", label: "All" },
    { v: "sales", label: "Sales" },
    { v: "added", label: "Added" },
    { v: "ops", label: "Ops" },
  ];

  return (
    <div className={`rounded-2xl border border-[var(--apple-hairline)] bg-white p-6 flex flex-col ${className}`} data-testid="dashboard-activity-feed">
      <div className="flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-2">
        <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--apple-ink)]">As it happens.</h3>
        <div className="flex items-center gap-1.5">
          {chips.map((c) => {
            const active = filter === c.v;
            return (
              <button
                key={c.v}
                type="button"
                onClick={() => setFilter(c.v)}
                aria-pressed={active}
                data-testid={`activity-chip-${c.v}`}
                className={[
                  "px-3 h-7 rounded-full text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-[var(--apple-ink)] text-white"
                    : "bg-[var(--apple-tile)] text-[var(--apple-subink)] hover:text-[var(--apple-ink)]",
                ].join(" ")}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">Nothing yet.</p>
      ) : (
        // Task #1498 — the feed scrolls inside its own panel (flex-1
        // min-h-0 + overflow-y-auto) rather than stretching the page; on
        // lg the card matches the Trend card's height and scrolls within.
        <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {visible.map((it, i) => (
            <li key={i} data-testid={`activity-${it.kind}-${i}`}>
              <Link
                href={it.href}
                className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors"
              >
                <ActivityIcon kind={it.kind} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-[var(--apple-ink)] font-medium truncate">{it.title}</div>
                  <div className="text-[12px] text-[var(--apple-subink)] truncate">{it.detail}</div>
                </div>
                <div className="text-[11.5px] text-[var(--apple-faint)] tabular-nums flex-shrink-0">
                  {fmtRel(it.ts)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityIcon({ kind }: { kind: FeedItem["kind"] }) {
  // Reference rows: quiet gray icon tile (w-9 rounded-xl #f2f2f5);
  // sales rows carry the blue accent, everything else stays monochrome.
  const map = {
    order: { Icon: ShoppingBag, color: "text-[var(--apple-blue)]" },
    signup: { Icon: UserPlus, color: "text-[var(--apple-subink)]" },
    payout: { Icon: Banknote, color: "text-[var(--apple-subink)]" },
  }[kind];
  const Icon = map.Icon;
  return (
    <span className="w-9 h-9 rounded-xl bg-[var(--apple-tile)] inline-flex items-center justify-center flex-shrink-0">
      <Icon className={`w-4 h-4 ${map.color}`} />
    </span>
  );
}

// ─── Referral payouts card (super-admin only) ──────────────────────────
//
// Task #358 — surfaces the pending referral-payout run on the admin home
// so a super-admin doesn't have to curl /api/admin/referral-payouts/* to
// see what's queued. Preview opens a per-payee breakdown (including who
// is blocked because they haven't connected Stripe); Run hits the live
// endpoint with a confirm step and toasts paid/skipped/failed counts.

type ReferralPayoutBatch = {
  ownerKind: "person" | "organization";
  ownerId: string;
  ownerName: string | null;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
  currency: string;
  creditIds: string[];
  totalCents: number;
  units: number;
};
type ReferralPayoutsPending = {
  batches: ReferralPayoutBatch[];
  totalCents: number;
  payableCount: number;
  blockedCount: number;
};
type ReferralPayoutsRunResult = {
  dryRun: boolean;
  attempted: number;
  paid: number;
  skipped: number;
  failed: number;
  totalCents: number;
  batches: Array<{
    ownerKind: string;
    ownerId: string;
    ownerName: string | null;
    status: "paid" | "skipped" | "failed";
    amountCents: number;
    creditCount: number;
    transferId?: string;
    error?: string;
  }>;
};

function ReferralPayoutsCard() {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    const open = () => setConfirmOpen(true);
    const openPreview = () => setPreviewOpen(true);
    window.addEventListener("gt:run-payouts", open);
    window.addEventListener("gt:preview-payouts", openPreview);
    return () => {
      window.removeEventListener("gt:run-payouts", open);
      window.removeEventListener("gt:preview-payouts", openPreview);
    };
  }, []);

  const { data, isLoading } = useQuery<ReferralPayoutsPending>({
    queryKey: ["/api/admin/referral-payouts/pending"],
  });

  const run = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/referral-payouts/run", { dryRun: false });
      return (await r.json()) as ReferralPayoutsRunResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referral-payouts/pending"] });
      toast({
        title: `Referral payouts: ${result.paid} paid · ${result.skipped} skipped · ${result.failed} failed`,
        description: result.totalCents > 0 ? `Sent ${fmtUsd(result.totalCents)}` : undefined,
      });
      setConfirmOpen(false);
    },
    onError: (e: any) =>
      toast({
        title: "Couldn't run referral payouts",
        description: e?.message,
        variant: "destructive",
      }),
  });

  if (isLoading) return null;
  const totalCents = data?.totalCents ?? 0;
  const payable = data?.payableCount ?? 0;
  const blocked = data?.blockedCount ?? 0;
  if (payable === 0 && blocked === 0) return null;

  return (
    <>
      {/* Apple-canon dashboard: the visible referral-payouts banner became
          an attention card (AttentionSection). This component now hosts
          only the preview/confirm dialogs, opened via the gt:run-payouts /
          gt:preview-payouts window events fired by the header pill and the
          attention card. */}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-referral-payouts-preview">
          <DialogHeader>
            <DialogTitle>Referral payouts preview</DialogTitle>
          </DialogHeader>
          <ReferralPayoutsPreviewBody data={data} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="dialog-referral-payouts-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Run referral payouts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send {fmtUsd(totalCents)} via Stripe Transfers to {payable} payee
              {payable === 1 ? "" : "s"}.
              {blocked > 0
                ? ` ${blocked} payee${blocked === 1 ? " is" : "s are"} blocked (no connected Stripe account) and will be skipped.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-referral-payouts-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run.mutate();
              }}
              disabled={run.isPending}
              data-testid="button-referral-payouts-confirm"
            >
              {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Send payouts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReferralPayoutsPreviewBody({ data }: { data: ReferralPayoutsPending | undefined }) {
  if (!data || data.batches.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-slate-500" data-testid="text-referral-payouts-empty">
        No pending referral credits.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{data.batches.length} payee{data.batches.length === 1 ? "" : "s"}</span>
        <span>
          Total: <strong className="text-slate-700">{fmtUsd(data.totalCents)}</strong>
        </span>
      </div>
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md max-h-[60vh] overflow-y-auto">
        {data.batches.map((b) => {
          const blocked = !b.stripeAccountId || !b.payoutsEnabled;
          const reason = !b.stripeAccountId
            ? "No connected Stripe account"
            : !b.payoutsEnabled
              ? "Stripe account exists but payouts not enabled"
              : null;
          const detailHref =
            b.ownerKind === "person" ? `/admin/people/${b.ownerId}` : `/admin/non-profits/${b.ownerId}`;
          return (
            <li
              key={`${b.ownerKind}-${b.ownerId}`}
              className="px-3 py-2.5 flex items-center gap-3"
              data-testid={`row-referral-payout-${b.ownerKind}-${b.ownerId}`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">
                  <Link href={detailHref} className="hover:underline">
                    {b.ownerName || `(unnamed ${b.ownerKind})`}
                  </Link>
                  <span className="ml-2 text-xs uppercase tracking-wide text-slate-400">
                    {b.ownerKind}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {b.creditIds.length} credit{b.creditIds.length === 1 ? "" : "s"} · {b.units} unit
                  {b.units === 1 ? "" : "s"}
                  {reason ? <span className="text-amber-700"> · {reason}</span> : null}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-900">{fmtUsd(b.totalCents)}</div>
                <div
                  className={`text-xs uppercase tracking-wide font-semibold ${blocked ? "text-amber-700" : "text-emerald-700"}`}
                >
                  {blocked ? "Blocked" : "Ready"}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
