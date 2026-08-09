// Task #2258 — Partner acquisition dashboard.
//
// A partner-facing copy of the operator acquisition funnel (landed → viewed
// offer → started checkout → bought, by source) scoped STRICTLY to the
// partner's own releases via /api/partner/reports/funnel*, plus an in-app
// campaign UTM link-builder so a partner can mint self-attributing share
// links per channel. super_admin QA's a partner scope through the same
// ?asPartner=<id>&asPartnerKind=<kind> impersonation the rest of the partner
// reports honor (requireReportScope).
//
// Funnel correctness lives in server/reports/admin.ts — this surface only
// renders it. Partner portals use the LIGHT slate theme (see
// docs/admin-conventions.md), so the markup mirrors AdminReports' NativeFunnel.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ErrorState,
  LoadingState,
  fetchJson,
} from "@/components/admin/AdminErrorBoundary";
import { Label } from "@/components/ui/label";
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
import { Search } from "lucide-react";
import { RangePicker } from "@/components/partner/dashboard-controls";
import { CampaignLinkBuilder } from "./CampaignLinkBuilder";

type PartnerKind = "artist" | "label" | "non_profit";

// Self-contained date window for partner surfaces that have NO page-level
// RangePicker (e.g. the non-profit dashboard). Artist/label pass their shared
// `rangeQs` in and this internal picker stays hidden; mirrors their presets.
const SELF_RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "12mo", label: "Last 12 months", days: 365 },
] as const;
type SelfPresetId = (typeof SELF_RANGE_PRESETS)[number]["id"];
function selfRangeFor(preset: SelfPresetId): { from: string; to: string } {
  const to = new Date();
  const from = new Date(
    to.getTime() - (SELF_RANGE_PRESETS.find((p) => p.id === preset)!.days) * 86400_000,
  );
  return { from: from.toISOString(), to: to.toISOString() };
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
type ReleaseLite = {
  albumId: string;
  title: string;
  artist: string;
  landed: number;
  shareSlug: string | null;
};

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[color:var(--apple-hairline)] bg-white p-5 ${className}`}>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-[color:var(--apple-subink)] text-sm" data-testid="empty-state">
      {message}
    </div>
  );
}

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
        htmlFor="partner-funnel-release-trigger"
        className="text-xs uppercase tracking-wider text-[color:var(--apple-subink)] font-semibold"
      >
        Release
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="partner-funnel-release-trigger"
            type="button"
            className="inline-flex items-center gap-2 h-9 self-start min-w-[280px] max-w-[420px] rounded-md border border-[color:var(--apple-hairline)] bg-white px-3 text-sm text-left text-[color:var(--apple-ink)] hover:border-[color:var(--apple-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] focus:border-transparent"
            data-testid="button-partner-funnel-release"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Search className="w-3.5 h-3.5 text-[color:var(--apple-faint)] flex-shrink-0" />
            <span className="flex-1 truncate">
              {selected ? `${selected.title} — ${selected.artist}` : "Pick a release…"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="p-0 w-[min(420px,calc(100vw-2rem))] bg-white border border-[color:var(--apple-hairline)] text-[color:var(--apple-ink)] shadow-lg"
        >
          <Command
            className={[
              "bg-white text-[color:var(--apple-ink)]",
              "[&_[cmdk-input-wrapper]]:border-[color:var(--apple-hairline)]",
              "[&_[cmdk-item]]:text-[color:var(--apple-ink)]",
              "[&_[cmdk-item][data-selected=true]]:bg-[color:var(--apple-tile)]",
              "[&_[cmdk-item][data-selected=true]]:text-[color:var(--apple-ink)]",
            ].join(" ")}
          >
            <CommandInput
              placeholder="Search releases…"
              className="text-[color:var(--apple-ink)] placeholder:text-[color:var(--apple-faint)]"
              data-testid="input-partner-funnel-release-search"
            />
            <CommandList>
              <CommandEmpty>
                <div className="px-3 py-4 text-xs text-[color:var(--apple-subink)]">No matching releases.</div>
              </CommandEmpty>
              <CommandGroup heading="Your releases">
                {releases.map((r) => (
                  <CommandItem
                    key={r.albumId}
                    value={`${r.title} ${r.artist} ${r.albumId}`}
                    onSelect={() => {
                      onPick(r.albumId);
                      setOpen(false);
                    }}
                    data-testid={`option-partner-funnel-release-${r.albumId}`}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[color:var(--apple-ink)]">{r.title}</div>
                      <div className="truncate text-xs text-[color:var(--apple-subink)] mt-0.5">{r.artist}</div>
                    </div>
                    <span className="text-xs text-[color:var(--apple-faint)] tabular-nums flex-shrink-0">
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

/**
 * Partner acquisition dashboard tab. Rendered by Artist/Label/NonProfit
 * dashboards. `scopeId` is the super_admin impersonation target (personId /
 * labelId / npoId from the URL) or null for a real partner viewing their own
 * scope; `rangeQs` carries the dashboard's from/to window (other params are
 * ignored — only from/to + impersonation reach the report endpoints).
 *
 * `apiBase` overrides the report endpoint root (default `/api/partner/reports`).
 * Press portals pass `/api/press/<pressId>` so the requests go to the press-
 * specific funnel routes gated by requirePressScope instead of requireReportScope
 * (which explicitly 403s manufacturer-role callers).
 */
export function AcquisitionTab({
  kind,
  scopeId,
  rangeQs,
  apiBase = "/api/partner/reports",
}: {
  kind: PartnerKind;
  scopeId: string | null;
  rangeQs?: string;
  apiBase?: string;
}) {
  // Partner surfaces with a page-level RangePicker (artist/label) pass `rangeQs`
  // in; surfaces without one (non-profit) fall back to this in-tab picker so the
  // date window is honored everywhere.
  const usesOwnRange = rangeQs === undefined;
  const [selfPreset, setSelfPreset] = useState<SelfPresetId>("30d");
  const effectiveRangeQs = useMemo(() => {
    if (!usesOwnRange) return rangeQs ?? "";
    const { from, to } = selfRangeFor(selfPreset);
    return new URLSearchParams({ from, to }).toString();
  }, [usesOwnRange, rangeQs, selfPreset]);

  const reportQs = useMemo(() => {
    const out = new URLSearchParams();
    const src = new URLSearchParams(effectiveRangeQs);
    const from = src.get("from");
    const to = src.get("to");
    if (from) out.set("from", from);
    if (to) out.set("to", to);
    // Impersonation: pass through an explicit ?asPartner already on the URL,
    // else translate the dashboard's scope id into the report endpoint's shape.
    const url = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const asPartner = url.get("asPartner");
    const asKind = url.get("asPartnerKind");
    if (asPartner && asKind) {
      out.set("asPartner", asPartner);
      out.set("asPartnerKind", asKind);
    } else if (scopeId) {
      out.set("asPartner", scopeId);
      out.set("asPartnerKind", kind);
    }
    return out.toString();
  }, [effectiveRangeQs, scopeId, kind]);

  const [albumId, setAlbumId] = useState<string>("");
  const [excludeInternal, setExcludeInternal] = useState(true);

  const { data: releaseData, isLoading: loadingReleases } = useQuery<{ releases: ReleaseLite[] }>({
    queryKey: [`${apiBase}/funnel/releases`, reportQs],
    queryFn: () => fetchJson(`${apiBase}/funnel/releases?${reportQs}`),
  });
  const releases = releaseData?.releases ?? [];
  const effectiveAlbumId = albumId || releases[0]?.albumId || "";
  const selectedRelease = releases.find((r) => r.albumId === effectiveAlbumId) ?? null;

  const { data, isLoading, isError, error, refetch } = useQuery<FunnelData>({
    queryKey: [`${apiBase}/funnel`, effectiveAlbumId, reportQs, excludeInternal],
    queryFn: () =>
      fetchJson(
        `${apiBase}/funnel?albumId=${encodeURIComponent(effectiveAlbumId)}${
          excludeInternal ? "&excludeInternal=1" : ""
        }&${reportQs}`,
      ),
    enabled: !!effectiveAlbumId,
  });

  const maxSessions = data?.steps?.[0]?.sessions || 0;

  return (
    <div className="space-y-4" data-testid="acquisition-tab">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--apple-ink)]">Acquisition funnel</h3>
            <p className="text-xs text-[color:var(--apple-subink)] mt-0.5">
              Landed → viewed the offer → started checkout → bought, for your own
              releases. Distinct sessions from first-party analytics.{" "}
              <span className="text-[color:var(--apple-faint)]">
                "Landed" counts unique sessions that opened the release page. Your team's
                own views and preview-link opens are filtered out by default.
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            {usesOwnRange && (
              <RangePicker
                presets={SELF_RANGE_PRESETS}
                value={selfPreset}
                onChange={setSelfPreset}
                testId="range-picker-partner-funnel"
              />
            )}
            {releases.length > 0 && (
              <label
                className="flex items-center gap-2 text-xs text-[color:var(--apple-subink)] cursor-pointer select-none"
                data-testid="toggle-partner-funnel-exclude-internal"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[color:var(--apple-hairline)] accent-[var(--brand-blue)]"
                  checked={excludeInternal}
                  onChange={(e) => setExcludeInternal(e.target.checked)}
                  data-testid="checkbox-partner-funnel-exclude-internal"
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
          <EmptyState message="You don't have any releases yet. Once a release of yours is live, its funnel and campaign links will show up here." />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <LoadingState />
        ) : (
          <div className="space-y-5" data-testid="partner-native-funnel">
            <div className="flex items-baseline gap-3">
              <span
                className="text-2xl font-semibold text-[color:var(--apple-ink)] tabular-nums"
                data-testid="text-partner-funnel-overall-conversion"
              >
                {fmtPct(data.overallConversion)}
              </span>
              <span className="text-xs text-[color:var(--apple-subink)]">
                landed → bought ({data.steps[0]?.sessions.toLocaleString() ?? 0} sessions →{" "}
                {data.steps[3]?.sessions.toLocaleString() ?? 0} purchases)
              </span>
            </div>
            {excludeInternal && (data.excludedInternal ?? 0) > 0 && (
              <p className="text-xs text-[color:var(--apple-faint)] -mt-3" data-testid="text-partner-funnel-excluded-internal">
                {data.excludedInternal?.toLocaleString()} internal/test record
                {data.excludedInternal === 1 ? "" : "s"} excluded (sessions + purchases)
              </p>
            )}

            <div className="space-y-2.5">
              {data.steps.map((step, i) => {
                const pct = maxSessions ? Math.round((step.sessions / maxSessions) * 100) : 0;
                return (
                  <div key={step.key} data-testid={`partner-funnel-step-${step.key}`}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-[color:var(--apple-ink)]">{step.label}</span>
                      <span className="text-[color:var(--apple-subink)] tabular-nums">
                        <span
                          className="font-semibold text-[color:var(--apple-ink)]"
                          data-testid={`text-partner-funnel-step-count-${step.key}`}
                        >
                          {step.sessions.toLocaleString()}
                        </span>
                        {i > 0 && (
                          <span className="ml-2 text-xs text-[color:var(--apple-faint)]">
                            {fmtPct(step.stepConversion)} from prev
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[color:var(--apple-tile)] overflow-hidden">
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
                <h4 className="text-xs uppercase tracking-wider text-[color:var(--apple-subink)] font-bold">By source</h4>
              </div>
              {data.bySource.length === 0 ? (
                <EmptyState message="No source breakdown for this window." />
              ) : (
                <table className="w-full text-sm" data-testid="table-partner-funnel-sources">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-[color:var(--apple-subink)] border-b border-[color:var(--apple-hairline)]">
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
                      <tr
                        key={s.key}
                        className="border-b border-[color:var(--apple-hairline)]"
                        data-testid={`row-partner-funnel-source-${s.key}`}
                      >
                        <td className="py-2 text-[color:var(--apple-ink)]">{s.source}</td>
                        <td className="py-2 text-right tabular-nums text-[color:var(--apple-ink)]">{s.landed.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-[color:var(--apple-ink)]">{s.viewedOffer.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-[color:var(--apple-ink)]">{s.startedCheckout.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-[color:var(--apple-ink)] font-medium">{s.completed.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums text-[color:var(--apple-ink)]">{fmtPct(s.conversion)}</td>
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
