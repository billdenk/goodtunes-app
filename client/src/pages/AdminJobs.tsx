import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

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
        : "bg-rose-50 text-rose-700";
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
        className="text-[var(--brand-blue)] hover:underline font-mono text-xs"
        data-testid={`link-album-${row.id}`}
      >
        album {row.albumId.slice(0, 8)}…
      </a>
    );
  }
  return <span className="text-slate-400">—</span>;
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

  // Query key includes the filter so each tab maintains its own cache
  // entry — switching tabs doesn't refetch the previous one.
  const queryKey =
    jobType === "all"
      ? ["/api/admin/job-runs?limit=100"]
      : [`/api/admin/job-runs?jobType=${jobType}&limit=100`];

  const { data = [], isLoading } = useQuery<JobRun[]>({ queryKey });

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

  return (
    <AdminFrame active="jobs">
      <AdminPageHeader title="Jobs" />
      <div className="max-w-[1100px]">
        <p className="text-sm text-slate-600 mb-4">
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
                  ? "bg-[var(--brand-blue)] text-white"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100",
              ].join(" ")}
              data-testid={`button-type-${t.value}`}
            >
              {t.label}
            </button>
          ))}
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
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100",
                  ].join(" ")}
                  data-testid={`button-sort-${o.value}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mb-4" data-testid="text-sort-help">{activeSortHelp}</p>
          </>
        )}

        {isLoading ? (
          <div className="text-sm text-slate-500" data-testid="loading-jobs">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center" data-testid="empty-jobs">
            No runs recorded for this filter yet.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" data-testid="table-jobs">
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
    </AdminFrame>
  );
}

function AutoSyncTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
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
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const s = row.summary ?? {};
          const sttMs = s.sttMs ?? null;
          const sttHot = sttMs != null && sttMs >= 90_000;
          return (
            <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2 whitespace-nowrap"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtMB(s.sourceBytes)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtMB(s.transcodedBytes)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtMs(s.transcodeMs)}</td>
              <td
                className={["px-4 py-2 text-right tabular-nums", sttHot ? "text-rose-600 font-semibold" : "text-slate-700"].join(" ")}
                data-testid={`stt-${row.id}`}
              >
                {fmtMs(sttMs)}
              </td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>
                    {row.errorMessage}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ImportTracksTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-right px-4 py-2 font-semibold">Created</th>
          <th className="text-right px-4 py-2 font-semibold">Errors</th>
          <th className="text-right px-4 py-2 font-semibold">Skipped</th>
          <th className="text-left px-4 py-2 font-semibold">Album</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{len(s.created)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-rose-700">{len(s.errors)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{len(s.skipped)}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ImportLyricsTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
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
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{len(s.matched)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-amber-700">{len(s.unmatched)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-rose-700">{len(s.errors)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{s.fileCount ?? "—"}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function FindMissingLyricsTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
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
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.scanned ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{s.synced ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.plain ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{s.instrumental ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-amber-700">{s.notFound ?? 0}</td>
              <td className="px-4 py-2 text-right tabular-nums text-rose-700">{s.failed ?? 0}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LrclibTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-left px-4 py-2 font-semibold">Source</th>
          <th className="text-right px-4 py-2 font-semibold">Cues</th>
          <th className="text-right px-4 py-2 font-semibold">Chars</th>
          <th className="text-left px-4 py-2 font-semibold">Song</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-slate-700">
                {s.source ?? "—"}
                {s.hasSynced === false && s.source ? <span className="text-slate-400"> (plain)</span> : null}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700">{s.cueCount ?? "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{s.charCount ?? "—"}</td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CreditsTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-left px-4 py-2 font-semibold">File</th>
          <th className="text-left px-4 py-2 font-semibold">Song</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const s = row.summary ?? {};
          return (
            <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
              <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
              <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
              <td className="px-4 py-2 text-slate-700 truncate max-w-[320px]" data-testid={`file-${row.id}`}>
                {s.filename ?? (s.fileCount != null ? `${s.fileCount} candidate${s.fileCount === 1 ? "" : "s"}` : "—")}
              </td>
              <td className="px-4 py-2">
                <SongLink row={row} />
                {row.errorMessage && (
                  <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AllTimelineTable({ rows }: { rows: JobRun[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
        <tr>
          <th className="text-left px-4 py-2 font-semibold">When</th>
          <th className="text-left px-4 py-2 font-semibold">Type</th>
          <th className="text-left px-4 py-2 font-semibold">Status</th>
          <th className="text-left px-4 py-2 font-semibold">Summary</th>
          <th className="text-left px-4 py-2 font-semibold">Target</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
            <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
            <td className="px-4 py-2 text-slate-700 whitespace-nowrap" data-testid={`type-${row.id}`}>
              {TYPE_LABEL[row.jobType] ?? row.jobType}
            </td>
            <td className="px-4 py-2"><StatusPill status={row.status} id={row.id} /></td>
            <td className="px-4 py-2 text-slate-700" data-testid={`summary-${row.id}`}>
              {describeRun(row)}
              {row.errorMessage && (
                <div className="text-[11px] text-rose-600 mt-0.5" data-testid={`error-${row.id}`}>{row.errorMessage}</div>
              )}
            </td>
            <td className="px-4 py-2"><SongLink row={row} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
