import { createContext, useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { ErrorState } from "@/components/admin/AdminErrorBoundary";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

interface AlbumPick {
  id: string;
  title: string;
  artist: string;
}

interface SongPick {
  id: string;
  title: string;
  trackNumber: number;
}

interface AlbumFullLite {
  id: string;
  songs: SongPick[];
}

// Context so each table's <tr> can open the detail sheet without us
// threading a callback through every per-job-type table component.
const OpenRunContext = createContext<(id: string) => void>(() => {});
function useRowProps(id: string) {
  const open = useContext(OpenRunContext);
  return {
    onClick: () => open(id),
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(id);
      }
    },
  };
}
// Inner interactive elements (SongLink) need to stop propagation so a
// click on an album/song link still navigates instead of opening the
// sheet over the row.
const stop = (e: React.MouseEvent) => e.stopPropagation();

type JobSummary = Record<string, any> | null;

interface JobRun {
  id: string;
  jobType: string;
  albumId: string | null;
  songId: string | null;
  status: string;
  summary: JobSummary;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
}

// Job types we know how to render. Anything outside this list still
// shows up in the "All" timeline with a generic summary line, so a
// newly-added jobType isn't invisible until someone updates this file.
type JobType =
  | "all"
  | "auto-sync-lyrics"
  | "import-tracks-from-dropbox"
  | "import-lyrics-from-dropbox"
  | "import-track-credits-from-dropbox"
  | "fetch-lyrics-from-lrclib"
  | "find-missing-lyrics";

const TYPE_TABS: { value: JobType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "auto-sync-lyrics", label: "Auto-sync lyrics" },
  { value: "import-tracks-from-dropbox", label: "Import tracks" },
  { value: "import-lyrics-from-dropbox", label: "Import lyrics" },
  { value: "import-track-credits-from-dropbox", label: "Import credits" },
  { value: "fetch-lyrics-from-lrclib", label: "LRCLIB fetch" },
  { value: "find-missing-lyrics", label: "Find missing lyrics" },
];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TYPE_TABS.filter((t) => t.value !== "all").map((t) => [t.value, t.label]),
);

type SortKey = "recent" | "slowest" | "largest";

const AUTO_SYNC_SORTS: { value: SortKey; label: string; help: string }[] = [
  { value: "recent", label: "Most recent", help: "Latest runs first." },
  { value: "slowest", label: "Slowest STT", help: "Largest STT wall-clock first — the 120s ElevenLabs timeout is the regression to watch." },
  { value: "largest", label: "Largest source", help: "Biggest master audio first — flags long FLACs / 24-bit AIFFs that pressure the transcode + STT budget." },
];

function fmtMB(bytes?: number | null): string {
  if (bytes == null) return "—";
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function fmtMs(ms?: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function len(x: any): number {
  return Array.isArray(x) ? x.length : 0;
}

// One-line summary used in the unified "All" timeline. Each job type
// gets its own most-useful sentence; unknown types fall back to JSON so
// they're still visible until we wire up a renderer.
function describeRun(row: JobRun): string {
  const s = row.summary ?? {};
  switch (row.jobType) {
    case "auto-sync-lyrics": {
      const lines = s.lineCount ?? 0;
      const stt = s.sttMs != null ? ` · STT ${fmtMs(s.sttMs)}` : "";
      return `${lines} line${lines === 1 ? "" : "s"} synced${stt}`;
    }
    case "import-tracks-from-dropbox":
      return `${len(s.created)} created · ${len(s.errors)} errored · ${len(s.skipped)} skipped`;
    case "import-lyrics-from-dropbox":
      return `${len(s.matched)} matched · ${len(s.unmatched)} unmatched · ${len(s.errors)} errored (of ${s.fileCount ?? 0} files)`;
    case "import-track-credits-from-dropbox":
      if (s.filename) return `from ${s.filename}`;
      if (s.fileCount != null) return `${s.fileCount} candidate file${s.fileCount === 1 ? "" : "s"}`;
      return row.status;
    case "fetch-lyrics-from-lrclib":
      if (row.status !== "success") return row.status;
      return `${s.source ?? "lrclib"} · ${s.hasSynced ? `${s.cueCount ?? 0} cues` : "plain lyrics"}`;
    case "find-missing-lyrics":
      return `scanned ${s.scanned ?? 0} · synced ${s.synced ?? 0} · plain ${s.plain ?? 0} · not found ${s.notFound ?? 0}${s.failed ? ` · failed ${s.failed}` : ""}`;
    default:
      return row.status;
  }
}

function StatusPill({ status, id }: { status: string; id: string }) {
  const tone =
    status === "success"
      ? "bg-emerald-50 text-emerald-700"
      : status === "partial"
        ? "bg-amber-50 text-amber-700"
        : "bg-[var(--apple-critical)]/10 text-[var(--apple-critical)]";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${tone}`}
      data-testid={`status-${id}`}
    >
      {status}
    </span>
  );
}

function SongLink({ row }: { row: JobRun }) {
  if (row.albumId && row.songId) {
    return (
      <a
        href={`/admin/albums/${row.albumId}#song-${row.songId}`}
        onClick={stop}
        className="text-[var(--brand-blue)] hover:underline font-mono text-xs"
        data-testid={`link-song-${row.id}`}
      >
        {row.songId.slice(0, 8)}…
      </a>
    );
  }
  if (row.albumId) {
    return (
      <a
        href={`/admin/albums/${row.albumId}`}
        onClick={stop}
        className="text-[var(--brand-blue)] hover:underline font-mono text-xs"
        data-testid={`link-album-${row.id}`}
      >
        album {row.albumId.slice(0, 8)}…
      </a>
    );
  }
  return <span className="text-[var(--apple-faint)]">—</span>;
}

function JobRow({ row, children }: { row: JobRun; children: React.ReactNode }) {
  const rowProps = useRowProps(row.id);
  return (
    <tr
      {...rowProps}
      className="hover:bg-[var(--apple-track)] cursor-pointer focus:outline-none focus:bg-[var(--apple-track)]"
      data-testid={`row-job-${row.id}`}
    >
      {children}
    </tr>
  );
}

/**
 * Task #137 — Admin Jobs · all background jobs.
 *
 * Read-only window onto the `job_runs` audit table. Originally scoped
 * to auto-sync-lyrics (Task #136), now widened to every job type that
 * writes a row — Dropbox track / lyrics / credits imports, LRCLIB
 * fetches, find-missing-lyrics sweeps. The job-type tabs swap the
 * fetch's `jobType` query param and the column set; the "All" tab
 * renders a compact unified timeline so the operator can see what ran
 * last across every kind of job without picking one first.
 */
export function AdminJobs() {
  const [jobType, setJobType] = useState<JobType>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [albumPick, setAlbumPick] = useState<AlbumPick | null>(null);
  const [songPick, setSongPick] = useState<SongPick | null>(null);
  const [albumSearch, setAlbumSearch] = useState("");
  const [, navigate] = useLocation();
  const search = useSearch();
  const selectedRunId = useMemo(() => {
    const p = new URLSearchParams(search);
    return p.get("run");
  }, [search]);

  const openRun = (id: string) => {
    const p = new URLSearchParams(search);
    p.set("run", id);
    navigate(`/admin/jobs?${p.toString()}`);
  };
  const closeRun = () => {
    const p = new URLSearchParams(search);
    p.delete("run");
    const qs = p.toString();
    navigate(qs ? `/admin/jobs?${qs}` : `/admin/jobs`);
  };

  // Album list — load once, search/filter client-side. Same list the
  // rest of /admin uses, so already cached when navigating from there.
  const { data: allAlbums = [] } = useQuery<AlbumPick[]>({
    queryKey: ["/api/albums"],
  });

  // Songs for the picked album — only fetched once an album is chosen.
  const { data: albumFull } = useQuery<AlbumFullLite>({
    queryKey: ["/api/albums", albumPick?.id],
    enabled: !!albumPick,
  });

  // Build the job-runs URL from all active filters. Including filters
  // in the queryKey keeps each combination cached separately.
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (jobType !== "all") params.set("jobType", jobType);
    if (albumPick) params.set("albumId", albumPick.id);
    if (songPick) params.set("songId", songPick.id);
    params.set("limit", "100");
    return `/api/admin/job-runs?${params.toString()}`;
  }, [jobType, albumPick, songPick]);

  const {
    data = [],
    isLoading,
    isError: jobsError,
    error: jobsErrorObj,
    refetch: refetchJobs,
  } = useQuery<JobRun[]>({ queryKey: [queryUrl] });

  // Open the album combobox dropdown when the search input has focus
  // *and* user has typed something (or no album is picked yet).
  const [albumFocused, setAlbumFocused] = useState(false);
  const filteredAlbums = useMemo(() => {
    if (!albumSearch.trim()) return allAlbums.slice(0, 12);
    const q = albumSearch.trim().toLowerCase();
    return allAlbums
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.artist ?? "").toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [allAlbums, albumSearch]);

  const clearTarget = () => {
    setAlbumPick(null);
    setSongPick(null);
    setAlbumSearch("");
  };

  const sorted = useMemo(() => {
    const rows = [...data];
    if (jobType === "auto-sync-lyrics" && sort === "slowest") {
      rows.sort((a, b) => (b.summary?.sttMs ?? -1) - (a.summary?.sttMs ?? -1));
    } else if (jobType === "auto-sync-lyrics" && sort === "largest") {
      rows.sort((a, b) => (b.summary?.sourceBytes ?? -1) - (a.summary?.sourceBytes ?? -1));
    } else {
      rows.sort((a, b) => +new Date(b.finishedAt) - +new Date(a.finishedAt));
    }
    return rows;
  }, [data, sort, jobType]);

  const activeSortHelp =
    jobType === "auto-sync-lyrics"
      ? AUTO_SYNC_SORTS.find((s) => s.value === sort)?.help ?? ""
      : "";

  // Resolve the selected run: prefer the row already in `data` (no
  // extra fetch when the operator just clicked it), fall back to a
  // single-row fetch for deep links to older rows that have rotated
  // off the listing.
  const selectedFromList = useMemo(
    () => (selectedRunId ? data.find((r) => r.id === selectedRunId) ?? null : null),
    [data, selectedRunId],
  );
  const { data: selectedFetched } = useQuery<JobRun>({
    queryKey: ["/api/admin/job-runs", selectedRunId],
    enabled: !!selectedRunId && !selectedFromList,
  });
  const selected = selectedFromList ?? selectedFetched ?? null;

  return (
    <AdminFrame active="jobs">
      <AdminPageHeader
        title="Jobs."
        subtitle="Background jobs from the last 100 runs. Pick a job type to see the columns that matter for it, or stay on All for a unified timeline."
      />
      <OpenRunContext.Provider value={openRun}>
      <div className="max-w-[1100px] mt-4">
        <p className="sr-only">
          Background jobs from the last 100 runs. Pick a job type to see the columns that matter for it, or stay on All for a unified timeline.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="type-tabs">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setJobType(t.value)}
              className={[
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                jobType === t.value
                  ? "bg-[color:var(--brand-blue)] text-white border border-transparent"
                  : "bg-white text-[var(--apple-subink)] border border-[var(--apple-hairline)] hover:bg-[var(--apple-track)]",
              ].join(" ")}
              data-testid={`button-type-${t.value}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="target-pickers">
          <div className="relative">
            {albumPick ? (
              <div
                className="inline-flex items-center gap-2 bg-[color:var(--brand-blue)] text-white text-xs font-semibold rounded-full pl-3 pr-1.5 py-1"
                data-testid="pill-album-pick"
              >
                <span className="truncate max-w-[260px]">
                  {albumPick.artist ? `${albumPick.artist} — ` : ""}
                  {albumPick.title}
                </span>
                <button
                  type="button"
                  onClick={clearTarget}
                  className="rounded-full w-5 h-5 inline-flex items-center justify-center bg-white/20 hover:bg-white/30"
                  aria-label="Clear album filter"
                  data-testid="button-clear-album"
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={albumSearch}
                  onChange={(e) => setAlbumSearch(e.target.value)}
                  onFocus={() => setAlbumFocused(true)}
                  onBlur={() => setTimeout(() => setAlbumFocused(false), 150)}
                  placeholder="Filter by album or artist…"
                  className="text-xs bg-white text-[var(--apple-ink)] placeholder:text-[var(--apple-faint)] border border-[var(--apple-hairline)] rounded-full px-3 py-1.5 w-[280px] focus:outline-none focus:border-[var(--brand-blue)]"
                  data-testid="input-album-search"
                />
                {albumFocused && filteredAlbums.length > 0 && (
                  <div
                    className="absolute z-10 mt-1 w-[320px] max-h-[280px] overflow-auto bg-white border border-[var(--apple-hairline)] rounded-lg shadow-lg"
                    data-testid="list-album-options"
                  >
                    {filteredAlbums.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAlbumPick(a);
                          setAlbumSearch("");
                          setAlbumFocused(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--apple-track)] text-xs"
                        data-testid={`button-album-option-${a.id}`}
                      >
                        <div className="font-semibold text-[var(--apple-ink)] truncate">{a.title}</div>
                        {a.artist && (
                          <div className="text-[var(--apple-subink)] truncate">{a.artist}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {albumPick && albumFull && albumFull.songs.length > 0 && (
            <select
              value={songPick?.id ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  setSongPick(null);
                  return;
                }
                const found = albumFull.songs.find((s) => s.id === id);
                setSongPick(found ?? null);
              }}
              className="text-xs border border-[var(--apple-hairline)] rounded-full px-3 py-1.5 bg-white focus:outline-none focus:border-[var(--brand-blue)]"
              data-testid="select-song"
            >
              <option value="">All songs in album</option>
              {[...albumFull.songs]
                .sort((a, b) => a.trackNumber - b.trackNumber)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.trackNumber}. {s.title}
                  </option>
                ))}
            </select>
          )}
        </div>

        {jobType === "auto-sync-lyrics" && (
          <>
            <div className="flex items-center gap-2 mb-3" data-testid="sort-tabs">
              {AUTO_SYNC_SORTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSort(o.value)}
                  className={[
                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                    sort === o.value
                      ? "bg-[var(--apple-ink)] text-white"
                      : "bg-white text-[var(--apple-subink)] border border-[var(--apple-hairline)] hover:bg-[var(--apple-track)]",
                  ].join(" ")}
                  data-testid={`button-sort-${o.value}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--apple-subink)] mb-4" data-testid="text-sort-help">{activeSortHelp}</p>
          </>
        )}

        {isLoading ? (
          <div className="text-sm text-[var(--apple-subink)]" data-testid="loading-jobs">Loading…</div>
        ) : jobsError ? (
          <ErrorState
            error={jobsErrorObj}
            onRetry={() => refetchJobs()}
            title="Couldn't load job runs"
            testId="admin-jobs-error"
          />
        ) : sorted.length === 0 ? (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl" data-testid="empty-jobs">
            <AdminEmptyState>No runs recorded for this filter yet.</AdminEmptyState>
          </div>
        ) : (
          <div className="bg-white border border-[var(--apple-hairline)] rounded-2xl overflow-hidden" data-testid="table-jobs">
            {jobType === "auto-sync-lyrics" ? (
              <AutoSyncTable rows={sorted} />
            ) : jobType === "import-tracks-from-dropbox" ? (
              <ImportTracksTable rows={sorted} />
            ) : jobType === "import-lyrics-from-dropbox" ? (
              <ImportLyricsTable rows={sorted} />
            ) : jobType === "find-missing-lyrics" ? (
              <FindMissingLyricsTable rows={sorted} />
            ) : jobType === "fetch-lyrics-from-lrclib" ? (
              <LrclibTable rows={sorted} />
            ) : jobType === "import-track-credits-from-dropbox" ? (
              <CreditsTable rows={sorted} />
            ) : (
              <AllTimelineTable rows={sorted} />
            )}
          </div>
        )}
      </div>
      <JobDetailSheet run={selected} open={!!selectedRunId} onClose={closeRun} />
      </OpenRunContext.Provider>
    </AdminFrame>
  );
}

function AutoSyncTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-right px-4 py-2 font-semibold">Source</th>
          <th className="text-right px-4 py-2 font-semibold">Transcoded</th>
          <th className="text-right px-4 py-2 font-semibold">Transcode</th>
          <th className="text-right px-4 py-2 font-semibold">STT</th>
          <th className="text-left px-4 py-2 font-semibold">Song</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => {
          const s = row.summary ?? {};
          const sttMs = s.sttMs ?? null;
          const sttHot = sttMs != null && sttMs >= 90_000;
          return (
            <JobRow key={row.id} row={row}>
              <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2 whitespace-nowrap"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-ink)]">{fmtMB(s.sourceBytes)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-ink)]">{fmtMB(s.transcodedBytes)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-ink)]">{fmtMs(s.transcodeMs)}</td>
              <td
                className={["px-4 py-2 text-right tabular-nums", sttHot ? "text-[var(--apple-critical)] font-semibold" : "text-[var(--apple-ink)]"].join(" ")}
                data-testid={`stt-${row.id}`}
              >
                {fmtMs(sttMs)}
              </td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>
                    {row.errorMessage}
                  </div>
                )}
              </td>
            </JobRow>
          );
        })}
      </tbody>
    </table>
  );
}

function ImportTracksTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-right px-4 py-2 font-semibold">Created</th>
          <th className="text-right px-4 py-2 font-semibold">Errors</th>
          <th className="text-right px-4 py-2 font-semibold">Skipped</th>
          <th className="text-left px-4 py-2 font-semibold">Album</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <JobRow key={row.id} row={row}>
              <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{len(s.created)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-critical)]">{len(s.errors)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-subink)]">{len(s.skipped)}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </JobRow>
          );
        })}
      </tbody>
    </table>
  );
}

function ImportLyricsTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-right px-4 py-2 font-semibold">Matched</th>
          <th className="text-right px-4 py-2 font-semibold">Unmatched</th>
          <th className="text-right px-4 py-2 font-semibold">Errors</th>
          <th className="text-right px-4 py-2 font-semibold">Files</th>
          <th className="text-left px-4 py-2 font-semibold">Album</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <JobRow key={row.id} row={row}>
              <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{len(s.matched)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-amber-700">{len(s.unmatched)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-critical)]">{len(s.errors)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-subink)]">{s.fileCount ?? "—"}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </JobRow>
          );
        })}
      </tbody>
    </table>
  );
}

function FindMissingLyricsTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-right px-4 py-2 font-semibold">Scanned</th>
          <th className="text-right px-4 py-2 font-semibold">Synced</th>
          <th className="text-right px-4 py-2 font-semibold">Plain</th>
          <th className="text-right px-4 py-2 font-semibold">Instr.</th>
          <th className="text-right px-4 py-2 font-semibold">Not found</th>
          <th className="text-right px-4 py-2 font-semibold">Failed</th>
          <th className="text-left px-4 py-2 font-semibold">Album</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <JobRow key={row.id} row={row}>
              <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-ink)]">{s.scanned ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{s.synced ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-ink)]">{s.plain ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-subink)]">{s.instrumental ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-amber-700">{s.notFound ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-critical)]">{s.failed ?? 0}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </JobRow>
          );
        })}
      </tbody>
    </table>
  );
}

function LrclibTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-left px-4 py-2 font-semibold">Source</th>
          <th className="text-right px-4 py-2 font-semibold">Cues</th>
          <th className="text-right px-4 py-2 font-semibold">Chars</th>
          <th className="text-left px-4 py-2 font-semibold">Song</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <JobRow key={row.id} row={row}>
              <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-[var(--apple-ink)]">
                {s.source ?? "—"}
                {s.hasSynced === false && s.source ? <span className="text-[var(--apple-faint)]"> (plain)</span> : null}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-ink)]">{s.cueCount ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums text-[var(--apple-subink)]">{s.charCount ?? "—"}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </JobRow>
          );
        })}
      </tbody>
    </table>
  );
}

function CreditsTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-left px-4 py-2 font-semibold">File</th>
          <th className="text-left px-4 py-2 font-semibold">Song</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <JobRow key={row.id} row={row}>
              <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-[var(--apple-ink)] truncate max-w-[320px]" data-testid={`file-${row.id}`}>
                {s.filename ?? (s.fileCount != null ? `${s.fileCount} candidate${s.fileCount === 1 ? "" : "s"}` : "—")}
              </td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </JobRow>
          );
        })}
      </tbody>
    </table>
  );
}

function AllTimelineTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-[var(--apple-track)] text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)]">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Type</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-left px-4 py-2 font-semibold">Summary</th>
          <th className="text-left px-4 py-2 font-semibold">Target</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--apple-hairline)]">
        {rows.map((row) => (
          <JobRow key={row.id} row={row}>
            <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
            <td className="px-4 py-2 text-[var(--apple-ink)] whitespace-nowrap" data-testid={`type-${row.id}`}>
              {TYPE_LABEL[row.jobType] ?? row.jobType}
            </td>
            <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
            <td className="px-4 py-2 text-[var(--apple-ink)]" data-testid={`summary-${row.id}`}>
              {describeRun(row)}
              {row.errorMessage && (
                <div className="text-[11px] text-[var(--apple-critical)] mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
              )}
            </td>
            <td className="px-4 py-2"><SongLink row={row} /></td>
          </JobRow>
        ))}
      </tbody>
    </table>
  );
}

// -----------------------------------------------------------------------
// JobDetailSheet — full per-run breakdown.
//
// The one-line summary in each table is intentionally lossy; the
// underlying `summary` JSON often carries lists that an operator needs
// to act on (which Dropbox filenames failed to match, which tracks
// errored during import, the Genius URL we *almost* matched, etc.).
// This side sheet renders those lists with a renderer chosen by
// jobType, and falls back to a pretty-printed JSON block for anything
// we don't have a bespoke layout for yet — so a freshly-added job type
// is still inspectable.
// -----------------------------------------------------------------------

function JobDetailSheet({
  run,
  open,
  onClose,
}: {
  run: JobRun | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto" data-testid="sheet-job-detail">
        {run ? (
          <>
            <SheetHeader>
              <SheetTitle data-testid="text-job-title">
                {TYPE_LABEL[run.jobType] ?? run.jobType}
              </SheetTitle>
              <div className="flex items-center gap-2 text-xs text-[var(--apple-subink)] mt-1">
                <StatusPill status={run.status} id={`detail-${run.id}`} />
                <span>{fmtWhen(run.finishedAt)}</span>
                <span className="font-mono">{run.id}</span>
              </div>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div className="text-xs text-[var(--apple-subink)]" data-testid="text-target">
                Target: <SongLink row={run} />
              </div>
              {run.errorMessage && (
                <DetailSection title="Error">
                  <pre
                    className="text-xs bg-[var(--apple-critical)]/10 text-[var(--apple-critical)] rounded-lg p-3 whitespace-pre-wrap break-words"
                    data-testid="text-error-message"
                  >
                    {run.errorMessage}
                  </pre>
                </DetailSection>
              )}
              <SummaryRenderer run={run} />
              <DetailSection title="Raw summary">
                <pre
                  className="text-[11px] bg-[var(--apple-track)] text-[var(--apple-ink)] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words"
                  data-testid="text-raw-summary"
                >
                  {JSON.stringify(run.summary ?? {}, null, 2)}
                </pre>
              </DetailSection>
            </div>
          </>
        ) : (
          <div className="text-sm text-[var(--apple-subink)]" data-testid="loading-job-detail">Loading…</div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--apple-subink)] font-semibold mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function StringList({ items, tone, testId }: { items: any[]; tone: "good" | "warn" | "bad" | "muted"; testId: string }) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-[var(--apple-critical)]"
          : "text-[var(--apple-subink)]";
  return (
    <ul className={`text-xs ${toneClass} space-y-0.5`} data-testid={testId}>
      {items.map((it, i) => {
        const label =
          typeof it === "string"
            ? it
            : it && typeof it === "object"
              ? it.filename ?? it.file ?? it.name ?? it.title ?? it.path ?? it.message ?? it.error ?? JSON.stringify(it)
              : String(it);
        const extra =
          it && typeof it === "object" && (it.error || it.reason || it.message) && (it.filename || it.file || it.name)
            ? ` — ${it.error ?? it.reason ?? it.message}`
            : "";
        return (
          <li key={i} className="font-mono break-all">
            {label}
            {extra && <span className="text-[var(--apple-subink)]">{extra}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function SummaryRenderer({ run }: { run: JobRun }) {
  const s = run.summary ?? {};
  const sections: React.ReactNode[] = [];

  const list = (key: string, title: string, tone: "good" | "warn" | "bad" | "muted") => {
    const arr = s[key];
    if (Array.isArray(arr) && arr.length > 0) {
      sections.push(
        <DetailSection key={key} title={`${title} (${arr.length})`}>
          <StringList items={arr} tone={tone} testId={`list-${key}`} />
        </DetailSection>,
      );
    }
  };

  switch (run.jobType) {
    case "import-lyrics-from-dropbox":
    case "import-track-credits-from-dropbox": {
      list("matched", "Matched", "good");
      list("unmatched", "Unmatched", "warn");
      list("errors", "Errors", "bad");
      list("skipped", "Skipped", "muted");
      if (s.fileCount != null) {
        sections.push(
          <DetailSection key="filecount" title="Files scanned">
            <div className="text-xs text-[var(--apple-subink)]" data-testid="text-file-count">{s.fileCount}</div>
          </DetailSection>,
        );
      }
      break;
    }
    case "import-tracks-from-dropbox": {
      list("created", "Created", "good");
      list("errors", "Errors", "bad");
      list("skipped", "Skipped", "muted");
      break;
    }
    case "find-missing-lyrics": {
      const stats: Array<[string, any]> = [
        ["Scanned", s.scanned], ["Synced", s.synced], ["Plain", s.plain],
        ["Instrumental", s.instrumental], ["Not found", s.notFound], ["Failed", s.failed],
      ];
      sections.push(
        <DetailSection key="stats" title="Counts">
          <div className="grid grid-cols-3 gap-2 text-xs">
            {stats.map(([k, v]) => (
              <div key={k} className="bg-[var(--apple-track)] rounded-lg px-2 py-1.5">
                <div className="text-[10px] uppercase text-[var(--apple-subink)]">{k}</div>
                <div className="text-[var(--apple-ink)] tabular-nums">{v ?? 0}</div>
              </div>
            ))}
          </div>
        </DetailSection>,
      );
      list("notFoundSongs", "Not-found songs", "warn");
      list("failedSongs", "Failed songs", "bad");
      break;
    }
    case "fetch-lyrics-from-lrclib": {
      const lines: Array<[string, any]> = [
        ["Source", s.source],
        ["Has synced", s.hasSynced == null ? null : s.hasSynced ? "yes" : "no"],
        ["Cues", s.cueCount],
        ["Characters", s.charCount],
        ["Lookup URL", s.url ?? s.lookupUrl ?? s.geniusUrl],
      ].filter(([, v]) => v != null && v !== "") as Array<[string, any]>;
      if (lines.length > 0) {
        sections.push(
          <DetailSection key="lrclib" title="Lookup">
            <dl className="text-xs space-y-1">
              {lines.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-28 text-[var(--apple-subink)]">{k}</dt>
                  <dd className="text-[var(--apple-ink)] break-all">
                    {typeof v === "string" && /^https?:\/\//.test(v) ? (
                      <a href={v} target="_blank" rel="noreferrer" className="text-[var(--brand-blue)] hover:underline">
                        {v}
                      </a>
                    ) : (
                      String(v)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </DetailSection>,
        );
      }
      break;
    }
    case "auto-sync-lyrics": {
      const lines: Array<[string, any]> = [
        ["Source", fmtMB(s.sourceBytes)],
        ["Transcoded", fmtMB(s.transcodedBytes)],
        ["Transcode time", fmtMs(s.transcodeMs)],
        ["STT time", fmtMs(s.sttMs)],
        ["Line count", s.lineCount],
        ["Source format", s.sourceFormat ?? s.sourceMimeType],
      ].filter(([, v]) => v != null && v !== "" && v !== "—") as Array<[string, any]>;
      sections.push(
        <DetailSection key="autosync" title="Timings">
          <dl className="text-xs space-y-1">
            {lines.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-28 text-[var(--apple-subink)]">{k}</dt>
                <dd className="text-[var(--apple-ink)] tabular-nums">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>,
      );
      break;
    }
  }

  if (sections.length === 0) return null;
  return <>{sections}</>;
}
