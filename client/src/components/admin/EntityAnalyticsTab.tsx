import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Task #295 — shared "Analytics" tab rendered on entity-detail
// admin pages. The server aggregates existing typed analytics_events
// rows; no new instrumentation is added by this task. The bucket
// shapes are stable across NPO / Reseller / Press so the component
// is fully parameterised by apiPath.

export type AnalyticsBucket = {
  id: string;
  label: string;
  href?: string | null;
  count: number;
};

export type EntityAnalyticsResponse = {
  totals: { views: number; plays: number; clicks: number };
  range?: { from: string | null; to: string | null };
  byAlbum: AnalyticsBucket[];
  byTrack?: AnalyticsBucket[];
  byPerson: AnalyticsBucket[];
  byGear: AnalyticsBucket[];
};

export interface EntityAnalyticsTabProps {
  apiPath: string;
  testIdPrefix: string;
}

type RangeChoice = "7d" | "30d" | "90d" | "all";

const RANGE_OPTIONS: { value: RangeChoice; label: string; days: number | null }[] = [
  { value: "7d", label: "7d", days: 7 },
  { value: "30d", label: "30d", days: 30 },
  { value: "90d", label: "90d", days: 90 },
  { value: "all", label: "All time", days: null },
];

export function EntityAnalyticsTab({
  apiPath,
  testIdPrefix,
}: EntityAnalyticsTabProps) {
  // 30 days is the default both here and on the server. Picking another
  // range only changes the query string; the response shape is stable.
  const [range, setRange] = useState<RangeChoice>("30d");
  const queryString = (() => {
    if (range === "all") return "?range=all";
    const opt = RANGE_OPTIONS.find((o) => o.value === range)!;
    if (!opt.days) return "";
    const from = new Date(Date.now() - opt.days * 24 * 60 * 60 * 1000).toISOString();
    return `?from=${encodeURIComponent(from)}`;
  })();
  const url = `${apiPath}${queryString}`;
  const { data, isLoading } = useQuery<EntityAnalyticsResponse>({
    queryKey: [apiPath, range],
    queryFn: async () => {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load analytics");
      return r.json();
    },
  });
  const totals = data?.totals ?? { views: 0, plays: 0, clicks: 0 };
  const allEmpty =
    !isLoading &&
    totals.views === 0 &&
    totals.plays === 0 &&
    totals.clicks === 0 &&
    (data?.byAlbum.length ?? 0) === 0 &&
    (data?.byTrack?.length ?? 0) === 0 &&
    (data?.byPerson.length ?? 0) === 0 &&
    (data?.byGear.length ?? 0) === 0;
  return (
    <div className="space-y-6" data-testid={`tab-${testIdPrefix}-analytics`}>
      <RangePicker
        value={range}
        onChange={setRange}
        testIdPrefix={testIdPrefix}
      />
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : allEmpty ? (
        <div
          className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
          data-testid={`empty-${testIdPrefix}-analytics`}
        >
          No events captured in this window for this partner's connections.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Totals
              label="Views"
              value={totals.views}
              testId={`stat-${testIdPrefix}-views`}
            />
            <Totals
              label="Plays"
              value={totals.plays}
              testId={`stat-${testIdPrefix}-plays`}
            />
            <Totals
              label="Clicks"
              value={totals.clicks}
              testId={`stat-${testIdPrefix}-clicks`}
            />
          </div>
          <BucketSection
            title="By album"
            rows={data?.byAlbum ?? []}
            testIdPrefix={`${testIdPrefix}-byalbum`}
          />
          <BucketSection
            title="By track"
            rows={data?.byTrack ?? []}
            testIdPrefix={`${testIdPrefix}-bytrack`}
          />
          <BucketSection
            title="By person"
            rows={data?.byPerson ?? []}
            testIdPrefix={`${testIdPrefix}-byperson`}
          />
          <BucketSection
            title="By gear"
            rows={data?.byGear ?? []}
            testIdPrefix={`${testIdPrefix}-bygear`}
          />
        </>
      )}
    </div>
  );
}

function RangePicker({
  value,
  onChange,
  testIdPrefix,
}: {
  value: RangeChoice;
  onChange: (v: RangeChoice) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" data-testid={`range-${testIdPrefix}`}>
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "px-2.5 h-7 text-xs font-medium rounded transition-colors",
            value === opt.value
              ? "bg-slate-900 text-white"
              : "text-slate-500 hover:text-slate-900",
          ].join(" ")}
          data-testid={`range-${testIdPrefix}-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Totals({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3" data-testid={testId}>
      <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function BucketSection({
  title,
  rows,
  testIdPrefix,
}: {
  title: string;
  rows: AnalyticsBucket[];
  testIdPrefix: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid={`section-${testIdPrefix}`}>
      <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
        {title}
      </h3>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-3 px-3 py-2"
            data-testid={`row-${testIdPrefix}-${row.id}`}
          >
            {row.href ? (
              <Link href={row.href} className="flex-1 min-w-0 text-sm font-medium truncate transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">
                {row.label}
              </Link>
            ) : (
              <span className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate">
                {row.label}
              </span>
            )}
            <span className="text-xs text-slate-600 tabular-nums">
              {row.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
