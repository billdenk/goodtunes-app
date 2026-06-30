import { useMemo, useState, useEffect, useCallback } from "react";
import { getInitials } from "@/lib/initials";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import {
  AdminErrorBoundary,
  ErrorState,
  LoadingState,
  fetchJson,
} from "@/components/admin/AdminErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/Spinner";
import { X, Search, User, Tag, Heart } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, MapPin, TrendingUp, ChevronDown, ChevronRight, Clock, LogIn, FileEdit, RefreshCw, Package, ShoppingCart, Users } from "lucide-react";
import { CampaignLinkBuilder } from "@/components/operator/CampaignLinkBuilder";

const BLUE = "#319ED8";
const MINT = "#4AFFCA";
const PURPLE = "#7F10A7";
const PINK = "#FF5470";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// Saved date ranges — persist to URL (?from=…&to=…) so the operator
// can share a link to a specific window, and to localStorage so the
// next visit restores their last view even without query params.
const DATE_LS_KEY = "admin-reports:dateRange";
function useDateRange() {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400_000);
  // Single state object so setters always see the latest paired value
  // (avoids the stale-closure bug where setFrom(...) followed by
  // setTo(...) would persist the old `from` from a frozen render).
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    const defaults = { from: isoDay(monthAgo), to: isoDay(today) };
    if (typeof window === "undefined") return defaults;
    const url = new URLSearchParams(window.location.search);
    if (url.get("from") && url.get("to")) {
      return { from: url.get("from")!, to: url.get("to")! };
    }
    try {
      const saved = JSON.parse(localStorage.getItem(DATE_LS_KEY) || "null");
      if (saved?.from && saved?.to) return { from: saved.from, to: saved.to };
    } catch {}
    return defaults;
  });
  function persist(next: { from: string; to: string }) {
    try {
      localStorage.setItem(DATE_LS_KEY, JSON.stringify(next));
    } catch {}
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("from", next.from);
      url.searchParams.set("to", next.to);
      window.history.replaceState(null, "", url.toString());
    }
  }
  const setFrom = (v: string) => setRange((prev) => { const next = { ...prev, from: v }; persist(next); return next; });
  const setTo = (v: string) => setRange((prev) => { const next = { ...prev, to: v }; persist(next); return next; });
  return { from: range.from, to: range.to, setFrom, setTo };
}

type PartnerKind = "label" | "artist" | "non_profit";

function buildQs(from: string, to: string, asPartner: string, asKind: string): string {
  const p = new URLSearchParams({ from, to });
  if (asPartner) {
    p.set("asPartner", asPartner);
    p.set("asPartnerKind", asKind || "label");
  }
  return p.toString();
}

interface ScopeInfo {
  role: "super_admin" | "admin" | "label" | "artist" | "org" | "non_profit" | "manufacturer" | "fulfillment";
  roleScopeId: string | null;
  viewAs: { kind: PartnerKind; id: string } | null;
}

interface PartnerSearchResult {
  id: string;
  kind: PartnerKind;
  name: string;
  secondary: string | null;
  imageUrl: string | null;
}

export function AdminReports({ embedded = false }: { embedded?: boolean } = {}) {
  const { from, to, setFrom, setTo } = useDateRange();
  // Task #1456 — partner dashboards deep-link here scoped to a single
  // partner via `?asPartner=<id>&asPartnerKind=<kind>&asPartnerName=<name>`.
  // Read once on mount (mirrors the `tab` URL-read below); the date range
  // is already picked up by useDateRange() above.
  const initialAs = useMemo(() => {
    if (typeof window === "undefined") return { id: "", kind: "label" as PartnerKind, name: "" };
    const p = new URLSearchParams(window.location.search);
    const id = p.get("asPartner") || "";
    const kindRaw = p.get("asPartnerKind") || "label";
    const kind: PartnerKind =
      kindRaw === "artist" || kindRaw === "non_profit" ? kindRaw : "label";
    return { id, kind, name: p.get("asPartnerName") || "" };
  }, []);
  const [asPartner, setAsPartner] = useState(initialAs.id);
  const [asKind, setAsKind] = useState<PartnerKind>(initialAs.kind);
  const [asPartnerName, setAsPartnerName] = useState(initialAs.name);
  const [asPartnerImageUrl, setAsPartnerImageUrl] = useState<string | null>(null);
  const qs = useMemo(() => buildQs(from, to, asPartner, asKind), [from, to, asPartner, asKind]);

  const { data: scope } = useQuery<ScopeInfo>({
    queryKey: ["/api/partner/reports/scope", asPartner, asKind],
    queryFn: () => fetchJson(`/api/partner/reports/scope?${qs}`),
  });

  const isSuper = scope?.role === "super_admin" && !scope.viewAs;
  // Admin tier (non-sensitive god-view): super_admin + plain admin, both
  // when not impersonating a partner. Sees KPIs, revenue, engagement,
  // funnels, ops health, PostHog embeds — but NOT payout reconciliation
  // or the raw event explorer (super_admin only).
  const isAdmin = (scope?.role === "super_admin" || scope?.role === "admin") && !scope.viewAs;
  // Non-profit perspective: either the caller is themselves a non-profit
  // partner, or super_admin is impersonating one via the Viewing-as
  // combobox (Task #524). Album-scoped tabs (sales / plays / payouts /
  // redemption / fans / map) don't apply for orgs — they only see
  // Referrals — so we gate the tab row on this flag.
  const isOrgView =
    scope?.role === "org" ||
    scope?.role === "non_profit" ||
    scope?.viewAs?.kind === "non_profit";
  const showAlbumScopedTabs = !isOrgView;
  const showReferrals = isOrgView || scope?.role === "artist" || isSuper;

  // Task #145 — Dashboard KPI tiles deep-link here as
  // `/admin/reports?tab=<name>&from=…&to=…`. We read `tab` once on
  // mount to pick the initial active tab; the date range is already
  // picked up by useDateRange() above.
  const initialTab = useMemo(() => {
    if (typeof window === "undefined") return "sales";
    const t = new URLSearchParams(window.location.search).get("tab");
    const allowed = new Set([
      "sales", "plays", "payouts", "redemption", "fans", "map",
      "referrals", "overview", "revenue", "engagement", "funnels",
      "ops",
    ]);
    // Super-only tabs are allowed to be the initial tab — but TabsContent is
    // already gated by {isSuper && ...} so non-super users see an empty panel.
    // Keeping them out of the general set means a non-super user who tweaks the
    // URL param still gets "sales" as the safe fallback.
    const superOnlyTabs = new Set(["recon", "events", "partner-activity"]);
    if (t && (allowed.has(t) || superOnlyTabs.has(t))) return t;
    return "sales";
  }, []);

  const body = (
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900" data-testid="text-reports-title">
              Reports
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Sales, plays, payouts, and fan reach across your catalogue.
            </p>
          </div>
          <DateRangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
        </header>

        {(isSuper || (scope?.role === "super_admin" && scope?.viewAs)) && (
          <ViewingAsControl
            asPartner={asPartner}
            asPartnerName={asPartnerName}
            asPartnerImageUrl={asPartnerImageUrl}
            asKind={asKind}
            onPick={(r) => {
              setAsPartner(r.id);
              setAsKind(r.kind);
              setAsPartnerName(r.name);
              setAsPartnerImageUrl(r.imageUrl);
            }}
            onClear={() => {
              setAsPartner("");
              setAsPartnerName("");
              setAsPartnerImageUrl(null);
            }}
          />
        )}

        <AdminErrorBoundary title="Reports failed to render">
        <Tabs defaultValue={initialTab} className="w-full">
          <div className="border-b border-slate-200 -mx-1 overflow-x-auto">
            <TabsList className="bg-transparent border-0 p-0 h-auto gap-6 px-1 flex-nowrap justify-start rounded-none">
              {showAlbumScopedTabs && <ReportTab value="sales" testId="tab-sales">Sales</ReportTab>}
              {showAlbumScopedTabs && <ReportTab value="plays" testId="tab-plays">Plays &amp; GoodSync</ReportTab>}
              {showAlbumScopedTabs && <ReportTab value="payouts" testId="tab-payouts">Payouts</ReportTab>}
              {showAlbumScopedTabs && <ReportTab value="redemption" testId="tab-redemption">Shopify redemption</ReportTab>}
              {showAlbumScopedTabs && <ReportTab value="fans" testId="tab-fans">Top fans</ReportTab>}
              {showAlbumScopedTabs && <ReportTab value="map" testId="tab-map">Fan map</ReportTab>}
              {showReferrals && (
                <ReportTab value="referrals" testId="tab-referrals">Referrals</ReportTab>
              )}
              {isAdmin && <ReportTab value="overview" testId="tab-overview">Overview (god-view)</ReportTab>}
              {isAdmin && <ReportTab value="revenue" testId="tab-revenue">Revenue breakdown</ReportTab>}
              {isAdmin && <ReportTab value="engagement" testId="tab-engagement">Engagement</ReportTab>}
              {isAdmin && <ReportTab value="funnels" testId="tab-funnels">Funnels &amp; cohorts</ReportTab>}
              {isAdmin && <ReportTab value="ops" testId="tab-ops">Ops health</ReportTab>}
              {isSuper && <ReportTab value="recon" testId="tab-reconciliation">Payout reconciliation</ReportTab>}
              {isSuper && <ReportTab value="events" testId="tab-events">Raw events</ReportTab>}
              {isSuper && <ReportTab value="partner-activity" testId="tab-partner-activity">Partner activity</ReportTab>}
            </TabsList>
          </div>

          {showAlbumScopedTabs && <TabsContent value="sales"><SalesTab qs={qs} /></TabsContent>}
          {showAlbumScopedTabs && <TabsContent value="plays"><PlaysTab qs={qs} /></TabsContent>}
          {showAlbumScopedTabs && <TabsContent value="payouts"><PayoutsTab qs={qs} /></TabsContent>}
          {showAlbumScopedTabs && <TabsContent value="redemption"><RedemptionTab qs={qs} /></TabsContent>}
          {showAlbumScopedTabs && <TabsContent value="fans"><TopFansTab qs={qs} /></TabsContent>}
          {showAlbumScopedTabs && <TabsContent value="map"><FanMapTab qs={qs} /></TabsContent>}
          {showReferrals && <TabsContent value="referrals"><ReferralsTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="overview"><OverviewTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="revenue"><RevenueTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="engagement"><EngagementTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="funnels"><FunnelsTab qs={qs} /></TabsContent>}
          {isAdmin && <TabsContent value="ops"><OpsTab qs={qs} /></TabsContent>}
          {isSuper && <TabsContent value="recon"><ReconciliationTab qs={qs} /></TabsContent>}
          {isSuper && <TabsContent value="events"><RawEventsTab qs={qs} /></TabsContent>}
          {isSuper && <TabsContent value="partner-activity"><PartnerActivityTab /></TabsContent>}
        </Tabs>
        </AdminErrorBoundary>
      </div>
  );
  // Task #2075 — the press portal renders this body inline (no operator
  // /admin chrome). Everyone else still gets the full AdminFrame wrapper.
  return embedded ? body : <AdminFrame active="reports">{body}</AdminFrame>;
}

function ReportTab({ value, testId, children }: { value: string; testId: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      data-testid={testId}
      className="
        relative rounded-none border-0 bg-transparent px-0 pb-3 pt-2 h-auto
        text-sm font-medium text-slate-500 whitespace-nowrap shrink-0
        shadow-none ring-0
        hover:text-slate-900 transition-colors
        data-[state=active]:bg-transparent data-[state=active]:text-slate-900
        data-[state=active]:shadow-none
        after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px]
        after:bg-[color:var(--brand-blue)] after:scale-x-0 after:transition-transform
        data-[state=active]:after:scale-x-100
      "
    >
      {children}
    </TabsTrigger>
  );
}

function PartnerThumb({
  imageUrl,
  name,
  kind,
  size = 28,
}: {
  imageUrl: string | null;
  name: string;
  kind: PartnerKind;
  size?: number;
}) {
  const rounded = kind === "artist" ? "rounded-full" : "rounded-md";
  const initials = getInitials(name, "?");
  const style = { width: size, height: size };
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        style={style}
        className={`${rounded} object-cover bg-slate-100 border border-slate-200 flex-shrink-0`}
      />
    );
  }
  return (
    <div
      style={style}
      className={`${rounded} flex items-center justify-center bg-slate-100 text-slate-500 text-xs font-semibold border border-slate-200 flex-shrink-0`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function PartnerKindChip({ kind }: { kind: PartnerKind }) {
  const Icon = kind === "label" ? Tag : kind === "artist" ? User : Heart;
  const text = kind === "label" ? "Label" : kind === "artist" ? "Artist" : "Non-profit";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}

function ViewingAsControl({
  asPartner,
  asPartnerName,
  asPartnerImageUrl,
  asKind,
  onPick,
  onClear,
}: {
  asPartner: string;
  asPartnerName: string;
  asPartnerImageUrl: string | null;
  asKind: PartnerKind;
  onPick: (r: PartnerSearchResult) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { data, isLoading } = useQuery<{ results: PartnerSearchResult[] }>({
    queryKey: ["/api/admin/partner-search", query],
    queryFn: () =>
      fetchJson(`/api/admin/partner-search?q=${encodeURIComponent(query)}`),
    enabled: open,
  });
  const results = data?.results ?? [];

  if (asPartner) {
    return (
      <div className="flex flex-col gap-1.5" data-testid="impersonation-bar">
        <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          Viewing as
        </span>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white pl-1.5 pr-1.5 py-1 text-sm text-slate-900 shadow-sm">
          <PartnerThumb
            imageUrl={asPartnerImageUrl}
            name={asPartnerName || asPartner}
            kind={asKind}
            size={22}
          />
          <span className="font-medium" data-testid="text-as-partner-name">
            {asPartnerName || asPartner}
          </span>
          <span className="text-slate-300">·</span>
          <PartnerKindChip kind={asKind} />
          <button
            type="button"
            onClick={onClear}
            data-testid="button-clear-as-partner"
            aria-label="Stop viewing as partner"
            className="
              ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full
              text-slate-500 hover:bg-slate-100 hover:text-slate-900
              focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]
            "
          >
            <X className="w-3.5 h-3.5" />
            <span className="sr-only">Stop viewing as partner</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="impersonation-bar">
      <Label
        htmlFor="viewing-as-trigger"
        className="text-xs uppercase tracking-wider text-slate-500 font-semibold"
      >
        Viewing as
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="viewing-as-trigger"
            type="button"
            className="
              inline-flex items-center gap-2 h-9 self-start min-w-[280px] max-w-[420px]
              rounded-md border border-slate-300 bg-white px-3 text-sm
              text-left text-slate-500 hover:border-slate-400
              focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]
              focus:border-transparent
            "
            data-testid="button-as-partner-search"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="flex-1 truncate">
              Search labels, artists, and non-profits…
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[min(420px,calc(100vw-2rem))] bg-white border border-slate-200 text-slate-900 shadow-lg"
        >
          <Command
            shouldFilter={false}
            className={[
              "bg-white text-slate-900",
              "[&_[cmdk-input-wrapper]]:border-slate-200",
              "[&_[cmdk-item]]:text-slate-700",
              "[&_[cmdk-item][data-selected=true]]:bg-slate-100",
              "[&_[cmdk-item][data-selected=true]]:text-slate-900",
            ].join(" ")}
          >
            <CommandInput
              placeholder="Search labels, artists, and non-profits…"
              value={query}
              onValueChange={setQuery}
              className="text-slate-900 placeholder:text-slate-400"
              data-testid="input-as-partner-search"
            />
            <CommandList>
              {isLoading ? (
                <div className="p-4 text-xs text-slate-500 inline-flex items-center gap-2">
                  <Spinner className="w-3.5 h-3.5 animate-spin" />
                  Searching…
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    <div className="px-3 py-4 text-xs text-slate-500">
                      {query.trim()
                        ? `No partners matching "${query.trim()}".`
                        : "Start typing to search labels, artists, and non-profits."}
                    </div>
                  </CommandEmpty>
                  {results.length > 0 && (
                    <CommandGroup heading="Partners">
                      {results.map((r) => (
                        <CommandItem
                          key={`${r.kind}-${r.id}`}
                          value={`${r.name}-${r.kind}-${r.id}`}
                          onSelect={() => {
                            onPick(r);
                            setOpen(false);
                            setQuery("");
                          }}
                          data-testid={`option-as-partner-${r.kind}-${r.id}`}
                          className="flex items-center gap-2 py-2"
                        >
                          <PartnerThumb
                            imageUrl={r.imageUrl}
                            name={r.name}
                            kind={r.kind}
                            size={28}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium text-slate-900">
                                {r.name}
                              </span>
                              <PartnerKindChip kind={r.kind} />
                            </div>
                            {r.secondary && (
                              <div className="truncate text-xs text-slate-500 mt-0.5">
                                {r.secondary}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DateRangePicker({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  const presets: Array<{ label: string; days: number }> = [
    { label: "7d", days: 7 },
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "YTD", days: -1 },
  ];
  function setPreset(days: number) {
    const today = new Date();
    if (days === -1) {
      const jan1 = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      setFrom(isoDay(jan1));
    } else {
      const start = new Date(today.getTime() - (days - 1) * 86400_000);
      setFrom(isoDay(start));
    }
    setTo(isoDay(today));
  }
  return (
    <div className="flex items-end gap-2" data-testid="date-range-picker">
      <div className="flex flex-col gap-1">
        <Label htmlFor="date-from" className="text-[11px] text-slate-500">From</Label>
        <Input id="date-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[140px]" data-testid="input-date-from" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="date-to" className="text-[11px] text-slate-500">To</Label>
        <Input id="date-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[140px]" data-testid="input-date-to" />
      </div>
      <div className="flex gap-1">
        {presets.map((p) => (
          <Button
            key={p.label}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreset(p.days)}
            className="h-9"
            data-testid={`button-preset-${p.label.toLowerCase()}`}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-[#319ED8] hover:underline font-medium"
      data-testid="link-export-csv"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </a>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-slate-500 text-sm" data-testid="empty-state">
      {message}
    </div>
  );
}

function SalesTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/sales", qs],
    queryFn: () => fetchJson(`/api/partner/reports/sales?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState testId="loading-sales" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Units sold" value={data.totalUnits.toLocaleString()} sub={data.scopeLabel} /></Card>
        <Card><Stat label="Gross sales" value={fmtUsd(data.totalCents)} /></Card>
        <Card className="flex items-center justify-end"><ExportLink href={`/api/partner/reports/sales.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Sales over time</h3>
          <TrendingUp className="w-4 h-4 text-slate-400" />
        </div>
        {data.totalUnits === 0 ? (
          <EmptyState message="No paid orders in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.series}>
              <defs>
                <linearGradient id="g-sales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} labelStyle={{ color: "#0f172a" }} />
              <Area type="monotone" dataKey="dollarsCents" stroke={BLUE} fill="url(#g-sales)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function PlaysTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/plays", qs],
    queryFn: () => fetchJson(`/api/partner/reports/plays?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  const t = data.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="Play starts" value={t.playStarts.toLocaleString()} /></Card>
        <Card><Stat label="Completions" value={t.playCompletes.toLocaleString()} sub={`${fmtPct(t.completionRate)} of starts`} /></Card>
        <Card><Stat label="GoodSync opens" value={t.lyricsOpens.toLocaleString()} sub={`${fmtPct(t.goodSyncRate)} of starts`} /></Card>
        <Card><Stat label="30s holds" value={t.play30s.toLocaleString()} /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Plays & engagement</h3>
          <ExportLink href={`/api/partner/reports/plays.csv?${qs}`} label="CSV" />
        </div>
        {t.playStarts === 0 ? (
          <EmptyState message="No plays in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="playStarts" stroke={BLUE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="playCompletes" stroke={MINT} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="lyricsOpens" stroke={PURPLE} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function PayoutsTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/payouts", qs],
    queryFn: () => fetchJson(`/api/partner/reports/payouts?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Payouts" value={fmtUsd(data.totalCents)} sub={`${data.totalCount} transfers`} /></Card>
        <Card className="sm:col-span-2 flex items-center justify-end"><ExportLink href={`/api/partner/reports/payouts.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Payouts received</h3>
        {data.totalCount === 0 ? (
          <EmptyState message="No payouts yet for this range." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.series}>
              <defs>
                <linearGradient id="g-payouts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={MINT} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={MINT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: number) => fmtUsd(v)} />
              <Area type="monotone" dataKey="dollarsCents" stroke={MINT} fill="url(#g-payouts)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function RedemptionTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/redemption", qs],
    queryFn: () => fetchJson(`/api/partner/reports/redemption?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Shopify orders" value={data.ordered.toLocaleString()} /></Card>
        <Card><Stat label="Redeemed" value={data.redeemed.toLocaleString()} sub={`${fmtPct(data.rate)} redemption rate`} /></Card>
        <Card className="flex items-center justify-end"><ExportLink href={`/api/partner/reports/redemption.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Orders vs. redemptions</h3>
        {data.ordered === 0 ? (
          <EmptyState message="No Shopify-origin orders in this range." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Line type="monotone" dataKey="ordered" stroke={BLUE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="redeemed" stroke={MINT} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function TopFansTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/top-fans", qs],
    queryFn: () => fetchJson(`/api/partner/reports/top-fans?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Top fans by spend</h3>
        <ExportLink href={`/api/partner/reports/top-fans.csv?${qs}`} label="CSV" />
      </div>
      {data.rows.length === 0 ? (
        <EmptyState message="No paying fans in this range yet." />
      ) : (
        <table className="w-full text-sm" data-testid="table-top-fans">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 font-bold">Fan</th>
              <th className="py-2 font-bold">Location</th>
              <th className="py-2 font-bold text-right">Units</th>
              <th className="py-2 font-bold text-right">Spend</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any, i: number) => (
              <tr key={i} className="border-b border-slate-100" data-testid={`row-fan-${i}`}>
                <td className="py-2.5 text-slate-900 font-medium">{r.name}</td>
                <td className="py-2.5 text-slate-500">{[r.city, r.region, r.country].filter(Boolean).join(", ") || "—"}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.units}</td>
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.spendCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Name is first name + last initial only. No email, phone, or street address is ever included.
      </p>
    </Card>
  );
}

/**
 * SVG world map with dots projected from lat/lon. Avoids the Leaflet
 * tile-server question for v1. Outline is a single simplified path of
 * world land masses; dots scale by `orders` count.
 */
function FanMapTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/fan-map", qs],
    queryFn: () => fetchJson(`/api/partner/reports/fan-map?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#319ED8]" />
          Where your fans are
        </h3>
        <div className="text-xs text-slate-500">
          {data.geocoded} of {data.totalCities} cities mapped
        </div>
      </div>
      {data.points.length === 0 ? (
        <EmptyState message="No fans to map in this range yet." />
      ) : (
        <WorldMap points={data.points} />
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Dots are city-level. Geocoding is cached via OpenStreetMap (Nominatim).
      </p>
    </Card>
  );
}

// Lazy-load (and code-split) the vendored Natural Earth world geometry.
function useWorldGeoData() {
  const [fc, setFc] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    import("@/assets/geo/world-countries.geo.json")
      .then((mod) => {
        if (alive) setFc((mod as any).default ?? mod);
      })
      .catch(() => {
        if (alive) setFc(null);
      });
    return () => { alive = false; };
  }, []);
  return fc;
}

// Convert a GeoJSON Polygon/MultiPolygon geometry to an SVG path string
// using the supplied projection (lon, lat) → [x, y].
function geoToPath(geometry: any, proj: (lon: number, lat: number) => [number, number]): string {
  const polys: number[][][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates
        : [];
  let d = "";
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach(([lon, lat]: number[], i: number) => {
        const [x, y] = proj(lon, lat);
        d += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
      });
      d += "Z";
    }
  }
  return d;
}

function WorldMap({ points }: { points: Array<{ lat: number; lon: number; orders: number; city: string | null; region: string | null; country: string | null; fans: number }> }) {
  // Equirectangular projection — simple, good enough for a city-dot map.
  // Signature matches the GeoJSON coordinate order: proj(lon, lat) → [x, y].
  const W = 960, H = 480;
  // Crop the empty polar bands (Arctic/Antarctic) so landmasses fill the card,
  // matching the partner SalesMap's "0 14 800 312" crop scaled to this 1.2×
  // canvas (14→16.8 top, 312→374.4 height). Projection math is unchanged — only
  // the viewBox window shrinks, so dot positions stay correct.
  const VIEWBOX = "0 16.8 960 374.4";
  function proj(lon: number, lat: number): [number, number] {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [x, y];
  }
  const geoData = useWorldGeoData();
  const maxOrders = Math.max(1, ...points.map((p) => p.orders));
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-slate-200 bg-[#eef2f7]">
      <svg viewBox={VIEWBOX} className="w-full h-auto" data-testid="svg-fan-map">
        {/* Country outlines — rendered first so dots sit on top */}
        {geoData?.features?.map((f: any, i: number) => {
          const d = geoToPath(f.geometry, proj);
          if (!d) return null;
          const name = f.properties?.name;
          return (
            <path
              key={i}
              d={d}
              fill="#dce5ef"
              stroke="#c4d0de"
              strokeWidth={0.4}
              strokeLinejoin="round"
            >
              {name ? <title>{name}</title> : null}
            </path>
          );
        })}
        {/* Latitude/longitude graticule for orientation */}
        {[-60, -30, 0, 30, 60].map((lat) => {
          const [, y] = proj(0, lat);
          return <line key={`la${lat}`} x1={0} x2={W} y1={y} y2={y} stroke="#c8d4e0" strokeWidth={0.4} />;
        })}
        {[-120, -60, 0, 60, 120].map((lon) => {
          const [x] = proj(lon, 0);
          return <line key={`lo${lon}`} x1={x} x2={x} y1={0} y2={H} stroke="#c8d4e0" strokeWidth={0.4} />;
        })}
        {/* Equator highlight */}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#b0c0d0" strokeWidth={0.5} />
        {/* Fan dots */}
        {points.map((p, i) => {
          const [x, y] = proj(p.lon, p.lat);
          const r = 3 + 8 * Math.sqrt(p.orders / maxOrders);
          return (
            <g key={i} data-testid={`map-dot-${i}`}>
              <circle cx={x} cy={y} r={r} fill={BLUE} fillOpacity={0.35} stroke={BLUE} strokeWidth={1} />
              <title>
                {[p.city, p.region, p.country].filter(Boolean).join(", ")} — {p.orders} order{p.orders === 1 ? "" : "s"}, {p.fans} fan{p.fans === 1 ? "" : "s"}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ReferralsTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/partner/reports/referrals", qs],
    queryFn: () => fetchJson(`/api/partner/reports/referrals?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Referred units" value={data.totalUnits.toLocaleString()} sub={data.scopeLabel} /></Card>
        <Card><Stat label="Earnings" value={fmtUsd(data.earningsCents)} sub={`${fmtUsd(data.perUnitCents)} per unit · default`} /></Card>
        <Card className="flex items-center justify-end"><ExportLink href={`/api/partner/reports/referrals.csv?${qs}`} label="Download CSV" /></Card>
      </div>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Artists you referred</h3>
        {data.artists.length === 0 ? (
          <EmptyState message="No referred artists with sales in this range yet." />
        ) : (
          <table className="w-full text-sm" data-testid="table-referrals">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Artist</th>
                <th className="py-2 font-bold text-right">Units</th>
                <th className="py-2 font-bold text-right">Rate</th>
                <th className="py-2 font-bold text-right">Earnings</th>
              </tr>
            </thead>
            <tbody>
              {data.artists.map((a: any) => (
                <tr key={a.artistId} className="border-b border-slate-100" data-testid={`row-referral-${a.artistId}`}>
                  <td className="py-2.5 text-slate-900 font-medium">{a.artistName}</td>
                  <td className="py-2.5 text-slate-700 text-right tabular-nums">{a.units}</td>
                  <td className="py-2.5 text-slate-500 text-right tabular-nums">{fmtUsd(a.perUnitCents)}</td>
                  <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(a.earningsCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Per-unit rate is set per referred artist (default $1.00). NPO and person referrers both earn the same way; GoodTunes funds the kickback from platform fees.
        </p>
      </Card>
    </div>
  );
}

// ─── Task #77 — Super-admin god-view tabs ─────────────────────────────

function deltaSub(curr: number, prior: number, formatter: (n: number) => string = (n) => n.toLocaleString()): string {
  if (prior === 0 && curr === 0) return "vs prior: —";
  const delta = curr - prior;
  const pct = prior === 0 ? null : delta / prior;
  const sign = delta > 0 ? "+" : "";
  const pctStr = pct === null ? "n/a" : `${sign}${(pct * 100).toFixed(1)}%`;
  return `vs prior ${formatter(prior)} (${pctStr})`;
}

function OverviewTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/kpis", qs],
    queryFn: () => fetchJson(`/api/admin/reports/kpis?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState testId="loading-overview" />;
  const p = data.prior ?? {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="GMV" value={fmtUsd(data.gmvCents)} sub={deltaSub(data.gmvCents, p.gmvCents ?? 0, fmtUsd)} /></Card>
        <Card><Stat label="Net (platform)" value={fmtUsd(data.netCents)} sub={deltaSub(data.netCents, p.netCents ?? 0, fmtUsd)} /></Card>
        <Card><Stat label="Paid orders" value={data.orderCount.toLocaleString()} sub={deltaSub(data.orderCount, p.orderCount ?? 0)} /></Card>
        <Card><Stat label="Unique buyers" value={data.uniqueBuyers.toLocaleString()} sub={deltaSub(data.uniqueBuyers, p.uniqueBuyers ?? 0)} /></Card>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="New signups" value={data.newSignups.toLocaleString()} sub={deltaSub(data.newSignups, p.newSignups ?? 0)} /></Card>
        <Card><Stat label="Plays" value={(data.plays ?? 0).toLocaleString()} sub={deltaSub(data.plays ?? 0, p.plays ?? 0)} /></Card>
        <Card><Stat label="Unique listeners" value={(data.uniqueListeners ?? 0).toLocaleString()} sub={deltaSub(data.uniqueListeners ?? 0, p.uniqueListeners ?? 0)} /></Card>
        <Card><Stat label="Conversion" value={fmtPct(data.conversionRate)} sub={`${data.firstPurchases} of ${data.visits} visitor sessions`} /></Card>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><Stat label="DAU" value={data.dau.toLocaleString()} sub="last 24h sessions" /></Card>
        <Card><Stat label="WAU" value={data.wau.toLocaleString()} sub="last 7d sessions" /></Card>
        <Card><Stat label="MAU" value={data.mau.toLocaleString()} sub="last 30d sessions" /></Card>
        <Card><Stat label="Refund rate" value={fmtPct(data.refundRate)} sub={`${data.refundedCount} refunded`} /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">GMV & signups over time</h3>
          <ExportLink href={`/api/admin/reports/kpis.csv?${qs}`} label="CSV" />
        </div>
        {data.orderCount === 0 && data.newSignups === 0 ? (
          <EmptyState message="No activity in this range yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} />
              <Tooltip formatter={(v: number, name: string) => name === "gmvCents" ? fmtUsd(v) : v.toLocaleString()} />
              <Line yAxisId="left" type="monotone" dataKey="gmvCents" stroke={BLUE} strokeWidth={2} dot={false} name="GMV" />
              <Line yAxisId="right" type="monotone" dataKey="signups" stroke={MINT} strokeWidth={2} dot={false} name="Signups" />
              <Line yAxisId="right" type="monotone" dataKey="orders" stroke={PURPLE} strokeWidth={2} dot={false} name="Orders" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

function RevenueTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/revenue", qs],
    queryFn: () => fetchJson(`/api/admin/reports/revenue?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <BreakdownTable title="Revenue by SKU kind" rows={data.bySku.map((r: any) => ({ key: r.kind, name: r.kind, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=sku&${qs}`} />
      <BreakdownTable title="Top labels by revenue" rows={data.byLabel.map((r: any) => ({ key: r.id, name: r.name, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=label&${qs}`} />
      <BreakdownTable title="Top artists by revenue" rows={data.byArtist.map((r: any) => ({ key: r.id, name: r.name, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=artist&${qs}`} />
      <BreakdownTable title="Revenue by country" rows={data.byCountry.map((r: any) => ({ key: r.country, name: r.country, units: r.units, cents: r.cents }))} csv={`/api/admin/reports/revenue.csv?dim=country&${qs}`} />
    </div>
  );
}

function BreakdownTable({ title, rows, csv }: { title: string; rows: Array<{ key: string; name: string; units: number; cents: number }>; csv: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <ExportLink href={csv} label="CSV" />
      </div>
      {rows.length === 0 ? (
        <EmptyState message="No data in this range." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 font-bold">Name</th>
              <th className="py-2 font-bold text-right">Units</th>
              <th className="py-2 font-bold text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-slate-100" data-testid={`row-breakdown-${r.key}`}>
                <td className="py-2.5 text-slate-900 font-medium">{r.name || "—"}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.units.toLocaleString()}</td>
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function EngagementTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/top-content", qs],
    queryFn: () => fetchJson(`/api/admin/reports/top-content?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <TopList title="Top tracks" rows={data.songs} columns={[{ label: "Title", key: "title" }, { label: "Artist", key: "artist" }]} csv={`/api/admin/reports/top-content.csv?dim=songs&${qs}`} testIdPrefix="row-track" idKey="songId" />
      <TopList title="Top albums" rows={data.albums} columns={[{ label: "Album", key: "title" }, { label: "Artist", key: "artist" }]} csv={`/api/admin/reports/top-content.csv?dim=albums&${qs}`} testIdPrefix="row-album" idKey="albumId" />
      <TopList title="Top artists" rows={data.artists} columns={[{ label: "Artist", key: "name" }]} csv={`/api/admin/reports/top-content.csv?dim=artists&${qs}`} testIdPrefix="row-artist" idKey="artistId" />
      <TopList title="Top labels" rows={data.labels} columns={[{ label: "Label", key: "name" }]} csv={`/api/admin/reports/top-content.csv?dim=labels&${qs}`} testIdPrefix="row-label" idKey="labelId" />
    </div>
  );
}

function TopList({ title, rows, columns, csv, testIdPrefix, idKey }: { title: string; rows: any[]; columns: Array<{ label: string; key: string }>; csv: string; testIdPrefix: string; idKey: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <ExportLink href={csv} label="CSV" />
      </div>
      {rows.length === 0 ? (
        <EmptyState message="No plays in this range." />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              {columns.map((c) => <th key={c.key} className="py-2 font-bold">{c.label}</th>)}
              <th className="py-2 font-bold text-right">Plays</th>
              <th className="py-2 font-bold text-right">Listeners</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[idKey]} className="border-b border-slate-100" data-testid={`${testIdPrefix}-${r[idKey]}`}>
                {columns.map((c) => <td key={c.key} className="py-2.5 text-slate-900 font-medium">{r[c.key] || "—"}</td>)}
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{r.plays.toLocaleString()}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.listeners.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

type FunnelStep = { key: string; label: string; sessions: number; stepConversion: number };
type FunnelData = {
  album: { id: string; title: string; artist: string } | null;
  steps: FunnelStep[];
  overallConversion: number;
  bySource: {
    key: string;
    source: string;
    landed: number;
    viewedOffer: number;
    startedCheckout: number;
    completed: number;
    conversion: number;
  }[];
  excludedInternal?: number;
};
type ReleaseLite = { albumId: string; title: string; artist: string; landed: number; shareSlug: string | null };

function ReleasePicker({
  releases,
  value,
  onPick,
}: {
  releases: ReleaseLite[];
  value: string;
  onPick: (albumId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = releases.find((r) => r.albumId === value);
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor="funnel-release-trigger"
        className="text-xs uppercase tracking-wider text-slate-500 font-semibold"
      >
        Release
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="funnel-release-trigger"
            type="button"
            className="
              inline-flex items-center gap-2 h-9 self-start min-w-[280px] max-w-[420px]
              rounded-md border border-slate-300 bg-white px-3 text-sm
              text-left text-slate-900 hover:border-slate-400
              focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]
              focus:border-transparent
            "
            data-testid="button-funnel-release"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="flex-1 truncate">
              {selected ? `${selected.title} — ${selected.artist}` : "Pick a release…"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[min(420px,calc(100vw-2rem))] bg-white border border-slate-200 text-slate-900 shadow-lg"
        >
          <Command
            className={[
              "bg-white text-slate-900",
              "[&_[cmdk-input-wrapper]]:border-slate-200",
              "[&_[cmdk-item]]:text-slate-700",
              "[&_[cmdk-item][data-selected=true]]:bg-slate-100",
              "[&_[cmdk-item][data-selected=true]]:text-slate-900",
            ].join(" ")}
          >
            <CommandInput
              placeholder="Search releases…"
              className="text-slate-900 placeholder:text-slate-400"
              data-testid="input-funnel-release-search"
            />
            <CommandList>
              <CommandEmpty>
                <div className="px-3 py-4 text-xs text-slate-500">No releases with funnel traffic yet.</div>
              </CommandEmpty>
              <CommandGroup heading="Releases with traffic">
                {releases.map((r) => (
                  <CommandItem
                    key={r.albumId}
                    value={`${r.title} ${r.artist} ${r.albumId}`}
                    onSelect={() => {
                      onPick(r.albumId);
                      setOpen(false);
                    }}
                    data-testid={`option-funnel-release-${r.albumId}`}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{r.title}</div>
                      <div className="truncate text-xs text-slate-500 mt-0.5">{r.artist}</div>
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
                      {r.landed.toLocaleString()} landed
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function NativeFunnel({ qs }: { qs: string }) {
  const [albumId, setAlbumId] = useState<string>("");
  // Task #2257 — opt-in: drop operator/staff + flagged-internal-device
  // sessions from every funnel step. Off by default so the headline number
  // stays the raw total until the operator chooses to filter.
  const [excludeInternal, setExcludeInternal] = useState(false);
  const { data: releaseData, isLoading: loadingReleases } = useQuery<{ releases: ReleaseLite[] }>({
    queryKey: ["/api/admin/reports/funnel/releases"],
    queryFn: () => fetchJson(`/api/admin/reports/funnel/releases`),
  });
  const releases = releaseData?.releases ?? [];
  // Default to the busiest release once the list loads.
  const effectiveAlbumId = albumId || releases[0]?.albumId || "";

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<FunnelData>({
    queryKey: ["/api/admin/reports/funnel", effectiveAlbumId, qs, excludeInternal],
    queryFn: () =>
      fetchJson(
        `/api/admin/reports/funnel?albumId=${encodeURIComponent(effectiveAlbumId)}&groupBy=source${
          excludeInternal ? "&excludeInternal=1" : ""
        }&${qs}`,
      ),
    enabled: !!effectiveAlbumId,
  });

  const maxSessions = data?.steps?.[0]?.sessions || 0;
  const selectedRelease = releases.find((r) => r.albumId === effectiveAlbumId) ?? null;

  return (
    <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Acquisition funnel</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Landed → viewed the offer → started checkout → bought. Distinct sessions, computed from
            first-party analytics — no PostHog required.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {releases.length > 0 && (
            <label
              className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none"
              data-testid="toggle-funnel-exclude-internal"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-[var(--brand-blue)]"
                checked={excludeInternal}
                onChange={(e) => setExcludeInternal(e.target.checked)}
                data-testid="checkbox-funnel-exclude-internal"
              />
              Exclude internal/test traffic
            </label>
          )}
          {releases.length > 0 && (
            <ReleasePicker releases={releases} value={effectiveAlbumId} onPick={setAlbumId} />
          )}
        </div>
      </div>

      {loadingReleases ? (
        <LoadingState />
      ) : releases.length === 0 ? (
        <EmptyState message="No release has funnel traffic yet. Once fans land on a release page, it'll show up here." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-5" data-testid="native-funnel">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-semibold text-slate-900 tabular-nums" data-testid="text-funnel-overall-conversion">
              {fmtPct(data.overallConversion)}
            </span>
            <span className="text-xs text-slate-500">
              landed → bought ({data.steps[0]?.sessions.toLocaleString() ?? 0} sessions →{" "}
              {data.steps[3]?.sessions.toLocaleString() ?? 0} purchases)
            </span>
          </div>
          {excludeInternal && (data.excludedInternal ?? 0) > 0 && (
            <p className="text-xs text-slate-400 -mt-3" data-testid="text-funnel-excluded-internal">
              {data.excludedInternal?.toLocaleString()} internal/test record
              {data.excludedInternal === 1 ? "" : "s"} excluded (sessions + purchases)
            </p>
          )}

          <div className="space-y-2.5">
            {data.steps.map((step, i) => {
              const pct = maxSessions ? Math.round((step.sessions / maxSessions) * 100) : 0;
              return (
                <div key={step.key} data-testid={`funnel-step-${step.key}`}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{step.label}</span>
                    <span className="text-slate-500 tabular-nums">
                      <span className="font-semibold text-slate-900" data-testid={`text-funnel-step-count-${step.key}`}>
                        {step.sessions.toLocaleString()}
                      </span>
                      {i > 0 && (
                        <span className="ml-2 text-xs text-slate-400">
                          {fmtPct(step.stepConversion)} from prev
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--brand-blue)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wider text-slate-500 font-bold">By source</h4>
            </div>
            {data.bySource.length === 0 ? (
              <EmptyState message="No source breakdown for this window." />
            ) : (
              <table className="w-full text-sm" data-testid="table-funnel-sources">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="py-2 font-bold">Source</th>
                    <th className="py-2 font-bold text-right">Landed</th>
                    <th className="py-2 font-bold text-right">Offer</th>
                    <th className="py-2 font-bold text-right">Checkout</th>
                    <th className="py-2 font-bold text-right">Bought</th>
                    <th className="py-2 font-bold text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bySource.map((s) => (
                    <tr key={s.key} className="border-b border-slate-100" data-testid={`row-funnel-source-${s.key}`}>
                      <td className="py-2 text-slate-700">{s.source}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{s.landed.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{s.viewedOffer.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{s.startedCheckout.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-900 font-medium">{s.completed.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums text-slate-700">{fmtPct(s.conversion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Card>
    {selectedRelease && <CampaignLinkBuilder release={selectedRelease} />}
    </div>
  );
}

function FunnelsTab({ qs }: { qs: string }) {
  const { data } = useQuery<{ funnelUrl: string | null; retentionUrl: string | null; host: string }>({
    queryKey: ["/api/admin/reports/posthog"],
    queryFn: () => fetchJson(`/api/admin/reports/posthog`),
  });
  return (
    <div className="space-y-4">
      <NativeFunnel qs={qs} />
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Funnel — visit → play → checkout</h3>
        {data?.funnelUrl ? (
          <iframe
            src={data.funnelUrl}
            className="w-full h-[520px] rounded-md border border-slate-200 bg-slate-50"
            data-testid="iframe-posthog-funnel"
            title="PostHog funnel"
          />
        ) : (
          <PosthogPlaceholder envVar="POSTHOG_FUNNEL_EMBED_URL" host={data?.host} />
        )}
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Cohort retention</h3>
        {data?.retentionUrl ? (
          <iframe
            src={data.retentionUrl}
            className="w-full h-[520px] rounded-md border border-slate-200 bg-slate-50"
            data-testid="iframe-posthog-retention"
            title="PostHog retention"
          />
        ) : (
          <PosthogPlaceholder envVar="POSTHOG_RETENTION_EMBED_URL" host={data?.host} />
        )}
      </Card>
    </div>
  );
}

function PosthogPlaceholder({ envVar, host }: { envVar: string; host?: string }) {
  return (
    <div className="py-10 text-center text-sm text-slate-500 bg-slate-50 rounded-md border border-dashed border-slate-200" data-testid={`empty-${envVar.toLowerCase()}`}>
      <p className="font-medium text-slate-700">PostHog embed not configured.</p>
      <p className="mt-2">Set <code className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[12px]">{envVar}</code> to a PostHog shared-dashboard iframe URL.</p>
      {host && <p className="text-[11px] text-slate-400 mt-1">Detected host: {host}</p>}
    </div>
  );
}

function OpsTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/ops", qs],
    queryFn: () => fetchJson(`/api/admin/reports/ops?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card><Stat label="Failed pushes" value={data.stuckFulfillments.count.toLocaleString()} sub="push to fulfillment failed" /></Card>
        <Card><Stat label="Failed checkouts · 24h" value={(data.failedCheckouts.last24hCount ?? 0).toLocaleString()} sub="abandoned / never paid" /></Card>
        <Card><Stat label="Failed checkouts · 7d" value={(data.failedCheckouts.last7dCount ?? 0).toLocaleString()} sub="abandoned / never paid" /></Card>
        <Card><Stat label="Refund rate" value={fmtPct(data.refunds.rate)} sub={`${data.refunds.refundedInRange} of ${data.refunds.paidInRange}`} /></Card>
        <Card><Stat label="Chargeback rate" value={data.chargebackRate == null ? "—" : fmtPct(data.chargebackRate)} sub={data.chargebackRate == null ? "dispute webhook not ingested" : "from Stripe disputes"} /></Card>
        <Card><Stat label="Stuck payouts" value={data.stuckPayoutCount.toLocaleString()} sub="shipped, not transferred" /></Card>
      </div>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Failed fulfillment pushes</h3>
          <ExportLink href={`/api/admin/reports/ops/stuck.csv?${qs}`} label="CSV" />
        </div>
        {data.stuckFulfillments.rows.length === 0 ? (
          <EmptyState message="No failed pushes — every order reached fulfillment." />
        ) : (
          <table className="w-full text-sm" data-testid="table-stuck-fulfillments">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Order</th>
                <th className="py-2 font-bold">Buyer</th>
                <th className="py-2 font-bold">Status</th>
                <th className="py-2 font-bold">OD id</th>
                <th className="py-2 font-bold text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.stuckFulfillments.rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100" data-testid={`row-stuck-${r.id}`}>
                  <td className="py-2.5 text-slate-900 font-mono text-[12px]">{r.id.slice(0, 8)}</td>
                  <td className="py-2.5 text-slate-700">{r.buyerName || r.buyerEmail || "—"}</td>
                  <td className="py-2.5 text-slate-700">{r.fulfillmentStatus}</td>
                  <td className="py-2.5 text-slate-500 font-mono text-[12px]">{r.orderDeskOrderId || "—"}</td>
                  <td className="py-2.5 text-slate-500 text-right tabular-nums">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Pending checkouts (never advanced)</h3>
          <ExportLink href={`/api/admin/reports/ops/failed.csv?${qs}`} label="CSV" />
        </div>
        {data.failedCheckouts.rows.length === 0 ? (
          <EmptyState message="No abandoned checkouts in this range." />
        ) : (
          <table className="w-full text-sm" data-testid="table-failed-checkouts">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Order</th>
                <th className="py-2 font-bold">Buyer</th>
                <th className="py-2 font-bold text-right">Amount</th>
                <th className="py-2 font-bold text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.failedCheckouts.rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100" data-testid={`row-failed-${r.id}`}>
                  <td className="py-2.5 text-slate-900 font-mono text-[12px]">{r.id.slice(0, 8)}</td>
                  <td className="py-2.5 text-slate-700">{r.buyerEmail || "—"}</td>
                  <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.totalCents)}</td>
                  <td className="py-2.5 text-slate-500 text-right tabular-nums">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          {data.failedCheckouts.proxyNote || "Counts include abandoned Checkout Sessions that never advanced to paid."} Cross-check disputes at <code className="px-1 py-0.5 bg-slate-50 border border-slate-200 rounded">stripe.com/dashboard/payments/disputes</code>.
        </p>
      </Card>
    </div>
  );
}

function ReconciliationTab({ qs }: { qs: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/reconciliation", qs],
    queryFn: () => fetchJson(`/api/admin/reports/reconciliation?${qs}`),
  });
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Payout reconciliation by owner</h3>
        <ExportLink href={`/api/admin/reports/reconciliation.csv?${qs}`} label="CSV" />
      </div>
      {data.rows.length === 0 ? (
        <EmptyState message="No shipped orders in this range." />
      ) : (
        <table className="w-full text-sm" data-testid="table-reconciliation">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 font-bold">Owner</th>
              <th className="py-2 font-bold">Stripe acct</th>
              <th className="py-2 font-bold text-right">Shipped</th>
              <th className="py-2 font-bold text-right">Transferred</th>
              <th className="py-2 font-bold text-right">Computed</th>
              <th className="py-2 font-bold text-right">Δ Delta</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => (
              <tr key={`${r.kind}:${r.id}`} className="border-b border-slate-100" data-testid={`row-recon-${r.id}`}>
                <td className="py-2.5">
                  <div className="text-slate-900 font-medium">{r.ownerName}</div>
                  <div className="text-[11px] text-slate-400">{r.kind}</div>
                </td>
                <td className="py-2.5 text-slate-500 font-mono text-[12px]">
                  {r.stripeAccountId || <span className="text-[#FF5470]">not connected</span>}
                  {r.stripeAccountId && !r.payoutsEnabled && <div className="text-[10px] text-[#FF5470]">payouts disabled</div>}
                </td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.shippedCount}</td>
                <td className="py-2.5 text-slate-700 text-right tabular-nums">{r.transferredCount} · {fmtUsd(r.transferredCents)}</td>
                <td className="py-2.5 text-slate-900 text-right tabular-nums font-medium">{fmtUsd(r.computedCents)}</td>
                <td className={`py-2.5 text-right tabular-nums font-medium ${r.deltaCents > 0 ? "text-[#FF5470]" : "text-slate-500"}`}>{fmtUsd(r.deltaCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Δ Delta = computed (snapshot at ship) − transferred via Stripe Connect. Non-zero deltas surface owners with skipped/failed transfers that need a retry from the Payouts admin.
      </p>
    </Card>
  );
}

// ─── Partner activity tab (super-admin only) ──────────────────────────────

type PartnerActivityStatus = "invited" | "expired_or_revoked" | "idle" | "active" | "stalled";

interface PartnerActivityRow {
  inviteId: string;
  role: string;
  roleScopeId: string | null;
  scopeName: string;
  scopeThumbUrl: string | null;
  inviteeEmail: string | null;
  inviterDisplayName: string | null;
  inviterEmail: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
  status: PartnerActivityStatus;
  lastSeenAt: string | null;
  albumCount: number;
  rosterCount: number;
  pendingChangesCount: number;
  pricingSyncsCount: number;
  importsCount: number;
  recentSalesCount: number;
  catalogItemsCount: number;
}

interface ActivityTimelineItem {
  kind: "login" | "edit" | "pricing_sync" | "import" | "sale";
  ts: string;
  detail: string;
}

const ROLE_LABELS: Record<string, string> = {
  artist: "Artist",
  label: "Label",
  manufacturer: "Press",
  non_profit: "NPO",
  fulfillment: "Fulfillment",
  vendor: "Vendor",
  manager: "Manager",
};

const STATUS_META: Record<PartnerActivityStatus, { label: string; className: string }> = {
  invited:           { label: "Invite sent",      className: "bg-blue-50 text-blue-700" },
  expired_or_revoked:{ label: "Expired / Revoked", className: "bg-slate-100 text-slate-500" },
  idle:              { label: "Joined · idle",    className: "bg-amber-50 text-amber-700" },
  active:            { label: "Active",            className: "bg-green-50 text-green-700" },
  stalled:           { label: "Stalled",           className: "bg-orange-50 text-orange-700" },
};

function StatusPill({ status }: { status: PartnerActivityStatus }) {
  const { label, className } = STATUS_META[status] ?? { label: status, className: "bg-slate-100 text-slate-500" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 86400_000;
  if (diff < 1) return "today";
  if (diff < 2) return "yesterday";
  if (diff < 30) return `${Math.floor(diff)}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}y ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TimelineIcon({ kind }: { kind: ActivityTimelineItem["kind"] }) {
  if (kind === "login") return <LogIn className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
  if (kind === "edit") return <FileEdit className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
  if (kind === "import") return <Package className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
  if (kind === "sale") return <ShoppingCart className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
  return <RefreshCw className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
}

function PartnerTimeline({ inviteId }: { inviteId: string }) {
  const { data, isLoading } = useQuery<{ timeline: ActivityTimelineItem[] }>({
    queryKey: ["/api/admin/reports/partner-activity", inviteId, "timeline"],
    queryFn: () => fetchJson(`/api/admin/reports/partner-activity/${inviteId}/timeline`),
  });

  if (isLoading) {
    return <div className="py-3 text-xs text-slate-400">Loading activity…</div>;
  }

  const items = data?.timeline ?? [];
  if (items.length === 0) {
    return (
      <div className="py-3 text-xs text-slate-400 italic">
        No dated activity recorded yet — counts above are snapshot totals only.
      </div>
    );
  }

  return (
    <ul className="space-y-1.5 py-2" data-testid="list-partner-timeline">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-[12px] text-slate-600">
          <TimelineIcon kind={item.kind} />
          <span className="text-slate-400 shrink-0 tabular-nums">{fmtDate(item.ts)}</span>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

const ALL_STATUSES: PartnerActivityStatus[] = [
  "active", "stalled", "idle", "invited", "expired_or_revoked",
];

function PartnerActivityTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery<{
    partners: PartnerActivityRow[];
    activeWithinDays: number;
  }>({
    queryKey: ["/api/admin/reports/partner-activity"],
    queryFn: () => fetchJson("/api/admin/reports/partner-activity"),
    staleTime: 60_000,
  });

  const toggleRow = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    return data.partners.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (typeFilter !== "all" && p.role !== typeFilter) return false;
      if (q) {
        const haystack = [p.scopeName, p.inviterDisplayName ?? "", p.inviterEmail ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusFilter, typeFilter, search]);

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isLoading || !data) return <LoadingState />;

  const activeWithinDays = data.activeWithinDays ?? 30;

  return (
    <div className="space-y-4" data-testid="section-partner-activity">
      <Card>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search partners…"
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30"
              data-testid="input-partner-search"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#319ED8]/30 bg-white"
            data-testid="select-partner-type"
          >
            <option value="all">All types</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${statusFilter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              data-testid="filter-status-all"
            >
              All
            </button>
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${statusFilter === s ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                data-testid={`filter-status-${s}`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState message="No partners match these filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-partner-activity">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2 font-bold w-6"></th>
                  <th className="py-2 font-bold">Partner</th>
                  <th className="py-2 font-bold">Status</th>
                  <th className="py-2 font-bold">Last seen</th>
                  <th className="py-2 font-bold text-right">Albums</th>
                  <th className="py-2 font-bold text-right">Roster</th>
                  <th className="py-2 font-bold text-right">Edits</th>
                  <th className="py-2 font-bold text-right">Imports</th>
                  <th className="py-2 font-bold text-right">Sales (30d)</th>
                  <th className="py-2 font-bold text-right">Syncs</th>
                  <th className="py-2 font-bold text-right">Catalog</th>
                  <th className="py-2 font-bold">Invited by</th>
                  <th className="py-2 font-bold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isExpanded = expandedId === p.inviteId;
                  return [
                    <tr
                      key={p.inviteId}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => toggleRow(p.inviteId)}
                      data-testid={`row-partner-${p.inviteId}`}
                    >
                      <td className="py-2.5 pl-1 text-slate-400">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />
                        }
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          {p.scopeThumbUrl ? (
                            <img src={p.scopeThumbUrl} alt="" className="w-6 h-6 rounded object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 shrink-0">
                              {p.scopeName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="text-slate-900 font-medium leading-tight">{p.scopeName}</div>
                            <div className="text-[11px] text-slate-400">{ROLE_LABELS[p.role] ?? p.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <StatusPill status={p.status} />
                      </td>
                      <td className="py-2.5 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span title={p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleString() : undefined}>
                            {fmtRelative(p.lastSeenAt)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.albumCount > 0 ? p.albumCount : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.rosterCount > 0 ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Users className="w-3 h-3 text-slate-400" />
                            {p.rosterCount}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.pendingChangesCount > 0 ? p.pendingChangesCount : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.importsCount > 0 ? p.importsCount : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.recentSalesCount > 0 ? p.recentSalesCount : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.pricingSyncsCount > 0 ? p.pricingSyncsCount : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-700">
                        {p.catalogItemsCount > 0 ? (
                          <span title="press_format_costs + press_color_tiers rows configured">
                            {p.catalogItemsCount}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 text-slate-500 text-[12px]">
                        {p.inviterDisplayName ?? p.inviterEmail ?? "—"}
                      </td>
                      <td className="py-2.5 text-slate-500 text-[12px] whitespace-nowrap">
                        {p.acceptedAt ? fmtDate(p.acceptedAt) : <span className="text-slate-300">Not yet</span>}
                      </td>
                    </tr>,
                    isExpanded && (
                      <tr key={`${p.inviteId}:timeline`} className="border-b border-slate-100 bg-slate-50/60">
                        <td></td>
                        <td colSpan={12} className="px-3 pb-3">
                          <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider pt-2 mb-1">
                            Recent activity
                          </div>
                          {p.acceptedAt ? (
                            <PartnerTimeline inviteId={p.inviteId} />
                          ) : (
                            <div className="py-2 text-xs text-slate-400 italic">
                              Partner hasn't accepted their invite yet.
                            </div>
                          )}
                          <div className="mt-2 text-[11px] text-slate-400">
                            Invited {fmtDate(p.invitedAt)}
                            {p.inviteeEmail && ` · ${p.inviteeEmail}`}
                            {p.pricingSyncsCount > 0 && ` · ${p.pricingSyncsCount} pricing sync${p.pricingSyncsCount !== 1 ? "s" : ""} total`}
                            {p.albumCount > 0 && ` · ${p.albumCount} album${p.albumCount !== 1 ? "s" : ""} in scope`}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-slate-400 mt-3">
          {filtered.length} of {data.partners.length} partners shown.
          {" "}<span className="font-medium">Active</span> = any signal within {activeWithinDays} days (logins · edits · imports · orders · pricing syncs).
          {" "}<span className="font-medium">Albums / Roster</span> are snapshot totals (no created_at).
          {" "}<span className="font-medium">Sales (30d)</span> = paid orders in the last 30 days.
          {" "}<span className="font-medium">Catalog</span> = format-cost rows + color/tier rows configured (manufacturers only).
          Expand a row for the full dated activity timeline.
        </p>
      </Card>
    </div>
  );
}

function RawEventsTab({ qs }: { qs: string }) {
  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const filterQs = useMemo(() => {
    const p = new URLSearchParams(qs);
    if (name) p.set("name", name);
    if (userId) p.set("userId", userId);
    if (sessionId) p.set("sessionId", sessionId);
    return p.toString();
  }, [qs, name, userId, sessionId]);
  const { data, isLoading, isError, error, refetch } = useQuery<any>({
    queryKey: ["/api/admin/reports/events", filterQs],
    queryFn: () => fetchJson(`/api/admin/reports/events?${filterQs}`),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ev-name" className="text-[11px] text-slate-500">Event name</Label>
          <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="play_start" className="h-9 w-[180px]" data-testid="input-event-name" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ev-user" className="text-[11px] text-slate-500">User id</Label>
          <Input id="ev-user" value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid…" className="h-9 w-[220px]" data-testid="input-event-user" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ev-session" className="text-[11px] text-slate-500">Session id</Label>
          <Input id="ev-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="session…" className="h-9 w-[220px]" data-testid="input-event-session" />
        </div>
        <ExportLink href={`/api/admin/reports/events.csv?${filterQs}`} label="CSV" />
      </div>
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingState />
      ) : data.rows.length === 0 ? (
        <EmptyState message="No events match these filters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-raw-events">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="py-2 font-bold">Time</th>
                <th className="py-2 font-bold">Event</th>
                <th className="py-2 font-bold">User</th>
                <th className="py-2 font-bold">Session</th>
                <th className="py-2 font-bold">Payload</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-b border-slate-100 align-top" data-testid={`row-event-${r.id}`}>
                  <td className="py-2 text-slate-500 text-[12px] whitespace-nowrap">{r.ts ? new Date(r.ts).toLocaleString() : ""}</td>
                  <td className="py-2 text-slate-900 font-medium whitespace-nowrap">{r.name}</td>
                  <td className="py-2 text-slate-500 font-mono text-[11px]">{r.userId ? r.userId.slice(0, 8) : "—"}</td>
                  <td className="py-2 text-slate-500 font-mono text-[11px]">{r.sessionId ? r.sessionId.slice(0, 10) : "—"}</td>
                  <td className="py-2 text-slate-600 font-mono text-[11px] max-w-[400px] truncate">{r.payload ? JSON.stringify(r.payload) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-3">
        Showing up to {data?.limit ?? 200} most-recent matching events. Use filters to drill down; download a 1,000-row CSV for analysis in a spreadsheet.
      </p>
    </Card>
  );
}

export default AdminReports;
