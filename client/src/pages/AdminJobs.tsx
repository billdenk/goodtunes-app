import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminFrame } from "@/components/admin/AdminFrame";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type AutoSyncSummary = {
  lineCount?: number;
  wordCount?: number;
  backfilledPlainLyrics?: boolean;
  hallucinatedCuesDropped?: number;
  sourceBytes?: number | null;
  transcodedBytes?: number | null;
  transcodeMs?: number | null;
  sttMs?: number | null;
};

interface JobRun {
  id: string;
  jobType: string;
  albumId: string | null;
  songId: string | null;
  status: string;
  summary: AutoSyncSummary | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string;
}

type SortKey = "recent" | "slowest" | "largest";

const SORT_OPTIONS: { value: SortKey; label: string; help: string }[] = [
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

/**
 * Task #136 — Admin Jobs · auto-sync-lyrics history.
 *
 * Read-only window onto the `job_runs` audit table for the lyric
 * auto-sync route. Each row already captured a one-line summary; the
 * route now also persists sourceBytes / transcodedBytes / transcodeMs
 * / sttMs into that summary so an STT wall-clock creeping toward
 * ElevenLabs's 120s cap (or a 24-bit/96kHz master that fails to shrink
 * on transcode) surfaces here without anyone tailing the server log.
 *
 * Three sort modes — most-recent, slowest STT, largest source — let
 * the operator answer the two questions that matter: "is anything
 * close to timing out?" and "are big masters getting bigger?".
 */
export function AdminJobs() {
  const [sort, setSort] = useState<SortKey>("slowest");

  const { data = [], isLoading } = useQuery<JobRun[]>({
    queryKey: ["/api/admin/job-runs?jobType=auto-sync-lyrics&limit=100"],
  });

  const sorted = useMemo(() => {
    const rows = [...data];
    if (sort === "recent") {
      rows.sort((a, b) => +new Date(b.finishedAt) - +new Date(a.finishedAt));
    } else if (sort === "slowest") {
      rows.sort((a, b) => (b.summary?.sttMs ?? -1) - (a.summary?.sttMs ?? -1));
    } else {
      rows.sort((a, b) => (b.summary?.sourceBytes ?? -1) - (a.summary?.sourceBytes ?? -1));
    }
    return rows;
  }, [data, sort]);

  const activeHelp = SORT_OPTIONS.find((s) => s.value === sort)?.help ?? "";

  return (
    <AdminFrame active="jobs">
      <AdminPageHeader title="Jobs" />
      <div className="max-w-[1100px]">
        <p className="text-sm text-slate-600 mb-4">
          Auto-sync-lyrics runs from the last 100 calls. ElevenLabs's STT timeout is 120 s — anything
          creeping past ~90 s is the regression to watch.
        </p>

        <div className="flex items-center gap-2 mb-3" data-testid="sort-tabs">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setSort(o.value)}
              className={[
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                sort === o.value
                  ? "bg-[var(--brand-blue)] text-white"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100",
              ].join(" ")}
              data-testid={`button-sort-${o.value}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-4" data-testid="text-sort-help">{activeHelp}</p>

        {isLoading ? (
          <div className="text-sm text-slate-500" data-testid="loading-jobs">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6 text-center" data-testid="empty-jobs">
            No auto-sync runs recorded yet.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" data-testid="table-jobs">
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
                {sorted.map((row) => {
                  const s = row.summary ?? {};
                  const sttMs = s.sttMs ?? null;
                  const sttHot = sttMs != null && sttMs >= 90_000;
                  const ok = row.status === "success";
                  return (
                    <tr key={row.id} className="hover:bg-slate-50" data-testid={`row-job-${row.id}`}>
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{fmtWhen(row.finishedAt)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={[
                            "px-2 py-0.5 rounded-full text-[11px] font-semibold",
                            ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
                          ].join(" ")}
                          data-testid={`status-${row.id}`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtMB(s.sourceBytes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtMB(s.transcodedBytes)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtMs(s.transcodeMs)}</td>
                      <td
                        className={[
                          "px-4 py-2 text-right tabular-nums",
                          sttHot ? "text-rose-600 font-semibold" : "text-slate-700",
                        ].join(" ")}
                        data-testid={`stt-${row.id}`}
                      >
                        {fmtMs(sttMs)}
                      </td>
                      <td className="px-4 py-2">
                        {row.albumId && row.songId ? (
                          <a
                            href={`/admin/albums/${row.albumId}#song-${row.songId}`}
                            className="text-[var(--brand-blue)] hover:underline font-mono text-xs"
                            data-testid={`link-song-${row.id}`}
                          >
                            {row.songId.slice(0, 8)}…
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
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
          </div>
        )}
      </div>
    </AdminFrame>
  );
}
