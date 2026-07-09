import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type ErrorInfo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ShoppingBag,
  UserPlus,
  Banknote,
  AlertTriangle,
  ArrowUpRight,
  Heart,
} from "lucide-react";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { KpiCard, type KpiCardModel } from "@/components/admin/KpiCard";

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
const MINT = "#4AFFCA";
const PURPLE = "#7F10A7";
const PINK = "#FF5470";

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
  const res = await fetch(url, { credentials: "include" });
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
// ~120px dead band. Disabled below the desktop breakpoint or when the
// window is too short to fit everything legibly — there it falls back
// to the natural vertical scroll.
const FIT_MIN_WIDTH = 1024; // Tailwind lg — below this we stack + scroll.
const FIT_MIN_HEIGHT = 520; // Below this the panels would be crushed.
const FIT_BOTTOM_GAP = 24; // Breathing room above the viewport bottom.

function useFitToViewport(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ height: number; marginBottom: number } | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setFit((prev) => (prev === null ? prev : null));
      return;
    }
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      if (window.innerWidth < FIT_MIN_WIDTH) {
        setFit((prev) => (prev === null ? prev : null));
        return;
      }
      const top = el.getBoundingClientRect().top;
      const parent = el.parentElement;
      const padBottom = parent
        ? parseFloat(getComputedStyle(parent).paddingBottom) || 0
        : 0;
      const available = window.innerHeight - top - FIT_BOTTOM_GAP;
      if (available < FIT_MIN_HEIGHT) {
        setFit((prev) => (prev === null ? prev : null));
        return;
      }
      const next = { height: available, marginBottom: -padBottom };
      setFit((prev) =>
        prev && prev.height === next.height && prev.marginBottom === next.marginBottom
          ? prev
          : next,
      );
    };

    compute();
    window.addEventListener("resize", compute);
    // Banners (auto-sync / Mux health) mount/unmount above us inside the
    // <main> scroll container, which shifts our top — recompute when the
    // main column's direct children change so we stay exactly one screen.
    const main = el.closest("main");
    let mo: MutationObserver | undefined;
    if (main) {
      mo = new MutationObserver(compute);
      mo.observe(main, { childList: true });
    }
    return () => {
      window.removeEventListener("resize", compute);
      mo?.disconnect();
    };
  }, [enabled]);

  return { ref, fit };
}

export function AdminDashboard() {
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

  const isSuperAdmin = role?.role === "super_admin";
  const isArtist = isArtistEarly;

  // Task #1498 — the operator dashboard fits one screen; the artist
  // variant has no Trend chart and keeps its natural scroll.
  const { ref: fitRef, fit } = useFitToViewport(!isArtist);

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
          ref={fitRef}
          className={`flex flex-col gap-5 ${fit ? "overflow-hidden" : "min-h-full"}`}
          style={fit ? { height: fit.height, marginBottom: fit.marginBottom } : undefined}
        >
          <SectionBoundary section="page-header">
            <AdminPageHeader
              title="Dashboard"
              subtitle={isArtist ? "Your releases and recent fan activity." : "How GoodTunes is doing right now."}
              testId="heading-admin-dashboard"
              actions={<RangeSwitcher value={range} onChange={setRange} />}
            />
          </SectionBoundary>

          {!isArtist && (
            <>
              <SectionBoundary section="ops-health">
                {ops && <OpsHealthStrip ops={ops} />}
              </SectionBoundary>

              <SectionBoundary section="referral-payouts">
                {isSuperAdmin && <ReferralPayoutsCard />}
              </SectionBoundary>

              <SectionBoundary section="kpi-grid">
                <KpiGrid kpis={kpis} loading={kpisLoading} qs={qs} />
              </SectionBoundary>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:flex-1 lg:min-h-0 lg:auto-rows-fr">
                <div className="lg:col-span-2 flex flex-col min-h-0">
                  <SectionBoundary section="primary-chart">
                    <PrimaryChart kpis={kpis} prior={priorKpis} loading={kpisLoading} />
                  </SectionBoundary>
                </div>
                <div className="flex flex-col min-h-0">
                  <SectionBoundary section="activity-feed">
                    <ActivityFeed orders={recentOrders ?? []} customers={recentCustomers?.rows ?? []} className="h-full" />
                  </SectionBoundary>
                </div>
              </div>
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

// ─── Range switcher ────────────────────────────────────────────────────

function RangeSwitcher({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: Array<{ v: RangeKey; label: string }> = [
    { v: "today", label: "Today" },
    { v: "7d", label: "7d" },
    { v: "30d", label: "30d" },
    { v: "90d", label: "90d" },
    { v: "all", label: "All" },
  ];
  return (
    <div
      className="inline-flex items-center bg-slate-100 rounded-md p-0.5"
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
              "px-3 h-8 text-[12.5px] font-semibold rounded transition-colors",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
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

function KpiGrid({ kpis, loading, qs }: { kpis?: KpisData; loading: boolean; qs: string }) {
  const prior = kpis?.prior ?? {};
  const series = kpis?.series ?? [];
  // Task #145 — each tile drills into the matching detailed report
  // with the dashboard's selected date range carried through in the
  // query string. `/admin/reports` reads `?tab=` to pick the right
  // pane and `?from=…&to=…` for the date filter.
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="dashboard-kpi-grid">
      <KpiCard
        model={{
          id: "gross",
          label: "Gross sales",
          value: kpis?.gmvCents ?? null,
          prior: prior.gmvCents ?? null,
          format: "currency",
        }}
        testId="tile-gmv"
        href={`/admin/reports?tab=revenue&${qs}`}
        spark={series.map((s) => s?.gmvCents ?? 0)}
        color={BLUE}
      />
      <KpiCard
        model={{
          id: "net",
          label: "Net revenue",
          value: kpis?.netCents ?? null,
          prior: prior.netCents ?? null,
          format: "currency",
        }}
        testId="tile-net"
        href={`/admin/reports?tab=revenue&${qs}`}
        spark={null}
        color={MINT}
      />
      <KpiCard
        model={{
          id: "orders",
          label: "Orders",
          value: kpis?.orderCount ?? null,
          prior: prior.orderCount ?? null,
          format: "number",
        }}
        testId="tile-orders"
        href={`/admin/orders?${qs}`}
        spark={series.map((s) => s?.orders ?? 0)}
        color={PURPLE}
      />
      <KpiCard
        model={{
          id: "newFans",
          label: "New fans",
          value: kpis?.newSignups ?? null,
          prior: prior.newSignups ?? null,
          format: "number",
        }}
        testId="tile-signups"
        href={`/admin/customers?${qs}`}
        spark={series.map((s) => s?.signups ?? 0)}
        color={PINK}
      />
      <KpiCard
        model={{
          id: "plays",
          label: "Plays",
          value: kpis?.plays ?? null,
          prior: prior.plays ?? null,
          format: "number",
        }}
        testId="tile-plays"
        href={`/admin/reports?tab=plays&${qs}`}
        spark={series.map((s) => s?.plays ?? 0)}
        color={BLUE}
      />
    </div>
  );
}

// ─── Ops health strip ──────────────────────────────────────────────────

function OpsHealthStrip({ ops }: { ops: OpsData }) {
  const items: Array<{ label: string; count: number; href: string; testId: string }> = [];
  if (ops.stuckFulfillments.count > 0) {
    items.push({
      label: `${ops.stuckFulfillments.count} order${ops.stuckFulfillments.count === 1 ? "" : "s"} failed to reach fulfillment`,
      count: ops.stuckFulfillments.count,
      href: "/admin/orders?needsPush=1",
      testId: "ops-chip-stuck-fulfillments",
    });
  }
  const failed = ops.failedCheckouts.last24hCount ?? 0;
  if (failed > 0) {
    items.push({
      label: `${failed} failed checkout${failed === 1 ? "" : "s"} · 24h`,
      count: failed,
      href: "/admin/reports",
      testId: "ops-chip-failed-checkouts",
    });
  }
  if (ops.stuckPayoutCount > 0) {
    items.push({
      label: `${ops.stuckPayoutCount} stuck payout${ops.stuckPayoutCount === 1 ? "" : "s"}`,
      count: ops.stuckPayoutCount,
      href: "/admin/reports",
      testId: "ops-chip-stuck-payouts",
    });
  }
  if (items.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
      data-testid="ops-health-strip"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className="text-[12px] font-semibold text-amber-900 mr-1">Needs attention</span>
      {items.map((it) => (
        <Link
          key={it.testId}
          href={it.href}
          data-testid={it.testId}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-amber-300 text-[12px] font-medium text-amber-900 hover:bg-amber-100 transition-colors"
        >
          {it.label}
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      ))}
    </div>
  );
}

// ─── Primary chart ─────────────────────────────────────────────────────

type ChartMetric = "gmv" | "orders" | "signups" | "plays";

function PrimaryChart({
  kpis,
  prior,
  loading,
}: {
  kpis?: KpisData;
  prior?: KpisData;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<ChartMetric>("gmv");
  const series = kpis?.series ?? [];
  const priorSeries = prior?.series ?? [];

  // Align prior series by day-offset so it can be drawn alongside the
  // current series in the same chart.
  const merged = useMemo(() => {
    return series.map((s, i) => {
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
  }, [series, priorSeries, metric]);

  const isCurrency = metric === "gmv";
  const opts: Array<{ v: ChartMetric; label: string }> = [
    { v: "gmv", label: "GMV" },
    { v: "orders", label: "Orders" },
    { v: "signups", label: "New fans" },
    { v: "plays", label: "Plays" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 h-full flex flex-col" data-testid="dashboard-primary-chart">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Trend</h3>
        <div className="inline-flex items-center bg-slate-100 rounded-md p-0.5">
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
                  "px-2.5 h-7 text-[12px] font-semibold rounded transition-colors",
                  active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900",
                ].join(" ")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-[180px] flex flex-col">
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Loading…
        </div>
      ) : merged.length === 0 ? (
        <div className="flex-1 relative min-h-[180px]" data-testid="dashboard-chart-empty">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[]} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis
                stroke="#94a3b8"
                fontSize={11}
                domain={[0, 1]}
                tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-slate-400 text-sm">No activity in this range yet.</span>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(v: number) => (isCurrency ? `$${(v / 100).toFixed(0)}` : `${v}`)}
            />
            <Tooltip
              formatter={(v: number) => (isCurrency ? fmtUsd(v) : fmtNum(v))}
              labelStyle={{ color: "#0f172a" }}
            />
            <Line
              type="monotone"
              dataKey="prior"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              name="Prior period"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="current"
              stroke={BLUE}
              strokeWidth={2}
              dot={false}
              name="This period"
            />
          </LineChart>
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
    return out.slice(0, 20);
  }, [orders, customers]);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 flex flex-col ${className}`} data-testid="dashboard-activity-feed">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex-shrink-0">Recent activity</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">Nothing yet.</p>
      ) : (
        // Task #1498 — when the dashboard is height-constrained to fit one
        // screen, the feed scrolls inside its own panel (flex-1 min-h-0 +
        // overflow-y-auto) rather than stretching the whole page. The
        // negative margin lets rows reach the panel edges while keeping the
        // scrollbar tucked against the card padding.
        <ul className="space-y-2.5 flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {items.map((it, i) => (
            <li key={i} data-testid={`activity-${it.kind}-${i}`}>
              <Link
                href={it.href}
                className="flex items-start gap-2.5 -mx-2 px-2 py-1.5 rounded-md hover:bg-slate-50 transition-colors"
              >
                <ActivityIcon kind={it.kind} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-slate-900 font-medium truncate">{it.title}</div>
                  <div className="text-[11.5px] text-slate-500 truncate">{it.detail}</div>
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums flex-shrink-0 pt-0.5">
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
  const map = {
    order: { Icon: ShoppingBag, bg: "bg-[#319ED8]/10", color: "text-[#319ED8]" },
    signup: { Icon: UserPlus, bg: "bg-[#FF5470]/10", color: "text-[#FF5470]" },
    payout: { Icon: Banknote, bg: "bg-[#4AFFCA]/20", color: "text-emerald-600" },
  }[kind];
  const Icon = map.Icon;
  return (
    <span className={`w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 ${map.bg}`}>
      <Icon className={`w-3.5 h-3.5 ${map.color}`} />
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
      <section
        className="rounded-lg border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-x-4 gap-y-3"
        data-testid="card-referral-payouts"
      >
        <span
          className="w-8 h-8 rounded-md inline-flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(74,255,202,0.2)" }}
        >
          <Banknote className="w-4 h-4 text-emerald-600" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900" data-testid="text-referral-payouts-summary">
            Referral payouts ready: {fmtUsd(totalCents)} across {payable} payee{payable === 1 ? "" : "s"}
            {blocked > 0 ? `, ${blocked} blocked` : ""}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Stripe Transfers to artists, ambassadors, and non-profits with connected payouts.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            data-testid="button-referral-payouts-preview"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={payable === 0 || run.isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            style={{ backgroundColor: "var(--brand-blue)" }}
            data-testid="button-referral-payouts-run"
          >
            {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Run payouts
          </button>
        </div>
      </section>

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
