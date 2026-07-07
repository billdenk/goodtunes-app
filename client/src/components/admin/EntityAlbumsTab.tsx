import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AlbumCover } from "@/components/ui/AlbumCover";
import { albumStage, type AlbumStage, type StageInput } from "@shared/albumStage";
import { ViewModeToggle, useViewMode } from "@/components/admin/ViewModeToggle";
import {
  PublishingPipelineStrip,
  type PublishingAlbumState,
} from "./PublishingPipelineStrip";

// Task #295 / #2618 — shared "Albums" tab rendered on each entity-detail
// admin page (NPO / Reseller / Press) and the partner-login portals.
// The connection logic (which albums tie to this entity, and why) lives
// server-side; this component renders the same lifecycle chrome as the
// main catalog: canonical `albumStage` tabs (Prepping → At press →
// Staged → Released → Sunset) plus a grid/list toggle and a per-row
// readiness pipeline strip.

export type EntityAlbumPress = { id: string; name: string; status: string };

export type EntityAlbumRow = {
  id: string;
  title: string;
  artistName: string | null;
  coverUrl: string | null;
  connectionReason: string | null;
  firstSoldAt: string | null;
  // Task #2618 — stage-input fields so each row buckets by the canonical
  // `albumStage` ladder, matching the main AdminAlbums catalog.
  submittedToPressAt?: string | null;
  goodTunesReleaseDate?: string | null;
  streamingReleaseDate?: string | null;
  state: PublishingAlbumState;
  presses?: EntityAlbumPress[];
  awaitingPressingOrder?: boolean;
};

export type EntityAlbumsResponse = {
  albums: EntityAlbumRow[];
};

export interface EntityAlbumsTabProps {
  apiPath: string;
  testIdPrefix: string;
  emptyHint?: string;
  /**
   * When true (Reseller use), render a "Presses" subsection that
   * rolls every connected album up by the press(es) it was sent to.
   * Server must include row.presses for this to render anything.
   */
  showPressesSubsection?: boolean;
}

function stageOf(row: EntityAlbumRow): AlbumStage {
  const input: StageInput = {
    isPrepping: row.state.isPrepping,
    isHidden: row.state.isHidden,
    submittedToPressAt: row.submittedToPressAt ?? null,
    goodTunesReleaseDate: row.goodTunesReleaseDate ?? null,
    streamingReleaseDate: row.streamingReleaseDate ?? null,
  };
  return albumStage(input);
}

const STAGE_TABS: { key: AlbumStage; label: string }[] = [
  { key: "prepping", label: "Prepping" },
  { key: "at_press", label: "At press" },
  { key: "staged", label: "Staged" },
  { key: "released", label: "Released" },
  { key: "sunset", label: "Sunset" },
];

export function EntityAlbumsTab({
  apiPath,
  testIdPrefix,
  emptyHint = "No connected albums yet.",
  showPressesSubsection = false,
}: EntityAlbumsTabProps) {
  const { data, isLoading } = useQuery<EntityAlbumsResponse>({
    queryKey: [apiPath],
  });
  const [view, setView] = useViewMode(`entity-albums:${testIdPrefix}`);

  const albums = useMemo(() => data?.albums ?? [], [data]);
  const byStage = useMemo(() => {
    const map: Record<AlbumStage, EntityAlbumRow[]> = {
      prepping: [], at_press: [], staged: [], released: [], sunset: [],
    };
    for (const a of albums) map[stageOf(a)].push(a);
    return map;
  }, [albums]);

  // Default the active tab to the first stage that actually has albums so
  // the operator never lands on an empty tab.
  const firstNonEmpty =
    STAGE_TABS.find((t) => byStage[t.key].length > 0)?.key ?? "prepping";
  const [tab, setTab] = useState<AlbumStage | null>(null);
  const activeTab = tab ?? firstNonEmpty;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (albums.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
        data-testid={`empty-${testIdPrefix}-albums`}
      >
        {emptyHint}
      </div>
    );
  }

  const visible = byStage[activeTab];

  return (
    <div className="space-y-4" data-testid={`tab-${testIdPrefix}-albums`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-0 rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
          {STAGE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                activeTab === t.key
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
              ].join(" ")}
              data-testid={`tab-${testIdPrefix}-stage-${t.key}`}
            >
              {t.label}
              {byStage[t.key].length > 0 && (
                <span
                  className={[
                    "text-xs font-semibold tabular-nums",
                    activeTab === t.key ? "opacity-70" : "opacity-50",
                  ].join(" ")}
                >
                  {byStage[t.key].length}
                </span>
              )}
            </button>
          ))}
        </div>
        <ViewModeToggle
          value={view}
          onChange={setView}
          testIdPrefix={`view-${testIdPrefix}-albums`}
        />
      </div>

      {visible.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400"
          data-testid={`empty-${testIdPrefix}-stage`}
        >
          No {STAGE_TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} albums.
        </div>
      ) : view === "grid" ? (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
          data-testid={`grid-${testIdPrefix}-albums`}
        >
          {visible.map((row) => (
            <div
              key={row.id}
              className="group rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all"
              data-testid={`card-${testIdPrefix}-album-${row.id}`}
            >
              <Link href={`/admin/albums/${row.id}`} className="block gt-nav" data-testid={`link-album-${row.id}`}>
                <div className="aspect-square bg-slate-100 overflow-hidden">
                  <AlbumCover
                    title={row.title}
                    artwork={row.coverUrl}
                    showName={false}
                    brandFallback
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2.5">
                  <div className="text-slate-900 text-xs font-semibold truncate">
                    {row.title}
                  </div>
                  <div className="text-slate-400 text-xs truncate mt-0.5">
                    {row.artistName ?? "—"}
                  </div>
                  {row.awaitingPressingOrder && (
                    <div
                      className="mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      data-testid={`badge-awaiting-pressing-${row.id}`}
                    >
                      Awaiting pressing order
                    </div>
                  )}
                </div>
              </Link>
              <div className="px-2.5 pb-2.5">
                <PublishingPipelineStrip state={row.state} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2" data-testid={`list-${testIdPrefix}-albums`}>
          {visible.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-slate-200 bg-white p-3"
              data-testid={`row-${testIdPrefix}-${row.id}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-md overflow-hidden bg-slate-100 flex-shrink-0">
                  <AlbumCover
                    title={row.title}
                    artwork={row.coverUrl}
                    showName={false}
                    brandFallback
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/admin/albums/${row.id}`} className="block text-sm font-semibold truncate transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2" data-testid={`link-album-${row.id}`}>
                    {row.title}
                  </Link>
                  <p className="text-xs text-slate-500 truncate">
                    {row.artistName ?? "—"}
                  </p>
                  {row.awaitingPressingOrder && (
                    <div
                      className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      data-testid={`badge-awaiting-pressing-${row.id}`}
                    >
                      Awaiting pressing order
                    </div>
                  )}
                </div>
                {row.connectionReason && (
                  <span
                    className="hidden md:inline text-xs uppercase tracking-wide font-medium text-slate-400"
                    data-testid={`reason-${row.id}`}
                    title={row.connectionReason}
                  >
                    {row.connectionReason}
                  </span>
                )}
              </div>
              <div className="mt-2 pl-15">
                <PublishingPipelineStrip state={row.state} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {showPressesSubsection && (
        <PressesSubsection rows={albums} testIdPrefix={testIdPrefix} />
      )}
    </div>
  );
}

function PressesSubsection({
  rows,
  testIdPrefix,
}: {
  rows: EntityAlbumRow[];
  testIdPrefix: string;
}) {
  // Roll albums up by press: each press shows the albums it's pressing
  // for this reseller's connected gear. Skips the section entirely
  // when no album has a press snapshot (most rows won't, since not
  // every artist who features this gear has run "Go to Press!" yet).
  const byPress = new Map<string, { name: string; albums: EntityAlbumRow[] }>();
  for (const row of rows) {
    for (const p of row.presses ?? []) {
      const entry = byPress.get(p.id) ?? { name: p.name, albums: [] };
      if (!entry.albums.find((a) => a.id === row.id)) entry.albums.push(row);
      byPress.set(p.id, entry);
    }
  }
  if (byPress.size === 0) return null;
  const entries = Array.from(byPress.entries()).sort(
    (a, b) => b[1].albums.length - a[1].albums.length,
  );
  return (
    <section data-testid={`section-${testIdPrefix}-presses`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide font-semibold text-slate-500">
          Presses
        </h3>
        <span className="text-xs text-slate-400 tabular-nums">
          {entries.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {entries.map(([pressId, info]) => (
          <li
            key={pressId}
            className="px-3 py-2"
            data-testid={`row-${testIdPrefix}-press-${pressId}`}
          >
            <div className="flex items-center justify-between gap-3">
              <Link href={`/admin/manufacturers/${pressId}`} className="text-sm font-semibold transition-colors hover:text-[color:var(--brand-blue)] hover:underline underline-offset-2">
                {info.name}
              </Link>
              <span className="text-xs text-slate-500 tabular-nums">
                {info.albums.length} album{info.albums.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {info.albums.map((a) => a.title).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
