import {
  ChevronRight,
  Check,
  Music2,
  Sparkles,
  Disc3,
  AlertCircle,
  Search,
  Filter,
  GripVertical,
  Clock,
  Plus,
} from "lucide-react";

/**
 * Album · Tracks tab — tappable per-track summary.
 *
 * This is the body of the "Tracks" tab in the album admin shell. It replaces
 * the CD-Baby-style inline-expandable tracklist (where every track unfolds in
 * place with a cramped Credits/Gear strip).
 *
 * Pattern: each row is a tap-target. Tapping navigates to ProgressiveV3 for
 * that track. The row surfaces just enough status that an admin can decide
 * what to open next, without making them open every row to find out.
 *
 * Per-row signal:
 *   - Track number · title · duration
 *   - Three optional-section pills: Performance · Writers · Mechanical
 *       · solid = filled · outline = empty · amber = partial · rose = warning
 *   - "X to resolve" or "Ready" summary on the right
 *   - Chevron-right to make tappability obvious
 *
 * Nothing here is publish-gating — Performance, Writers, Mechanical are all
 * OPTIONAL. The pills are diagnostic, not blocking.
 */
export function TracksList() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* ============================ HEADER ============================ */}
        <div className="space-y-2 pb-1">
          <div className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
            <span>Albums</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700 font-semibold">Love Life Tragedy</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                Album · Nick Carter
              </div>
              <h2 className="text-slate-900 text-[20px] font-bold truncate">
                Love Life Tragedy
              </h2>
            </div>
            <button className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] font-medium hover:bg-slate-50 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
              Re-import from Muso
            </button>
          </div>

          {/* tabs — Tracks is active here */}
          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Overview" />
            <Tab label="Tracks" badge="17" active />
            <Tab label="Artwork" />
            <Tab label="Files" />
          </div>
        </div>

        {/* ============================ TOOLBAR ============================ */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-2.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
              placeholder="Find a track…"
            />
          </div>
          <button className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Missing credits
          </button>
          <button className="px-2.5 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-medium hover:bg-[#2890c8] inline-flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add track
          </button>
        </section>

        {/* ============================ LEGEND ============================ */}
        <div className="flex items-center gap-3 px-1 text-[10.5px] text-slate-500">
          <span className="font-semibold uppercase tracking-wider text-slate-400">
            Status
          </span>
          <LegendPill tone="ok" label="P" /> <span>Performance</span>
          <LegendPill tone="ok" label="W" /> <span>Writers</span>
          <LegendPill tone="ok" label="M" /> <span>Mechanical</span>
          <span className="ml-auto italic text-slate-400">
            All sections are optional — these only flag what's still empty.
          </span>
        </div>

        {/* ============================ TRACKLIST ============================ */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {TRACKS.map((t, i) => (
              <TrackRow key={t.n} track={t} highlighted={i === 0} />
            ))}
          </div>
        </section>

        {/* ============================ FOOTER ============================ */}
        <div className="sticky bottom-0 -mx-1 mt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 shadow-md px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
              <Disc3 className="w-3.5 h-3.5 text-slate-400" />
              <span>17 tracks · 4 fully credited · 13 still empty</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium hover:bg-slate-200">
                Bulk import from Muso
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1">
                Open Track 1 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-2">
          <span className="font-semibold text-slate-500">Pattern note:</span>{" "}
          Rows are tap-targets — clicking any row opens that track in the
          Credits editor (ProgressiveV3). No inline expand, no two-line strip
          stuffed with everything. One row, one tap, one focused editor.
        </p>
      </div>
    </div>
  );
}

/* =============================== row ===================================== */

type Status = "ok" | "partial" | "empty" | "warn";

type Track = {
  n: number;
  title: string;
  duration: string;
  performance: Status;
  writers: Status;
  mechanical: Status;
  note?: string;
  bonus?: boolean;
};

const TRACKS: Track[] = [
  { n: 1, title: "Made for Us", duration: "3:28", performance: "ok", writers: "ok", mechanical: "partial" },
  { n: 2, title: "Nothing Without Your Love", duration: "3:31", performance: "ok", writers: "ok", mechanical: "empty" },
  { n: 3, title: "Good Love", duration: "2:57", performance: "ok", writers: "ok", mechanical: "empty" },
  { n: 4, title: "Hey Kid", duration: "3:36", performance: "ok", writers: "ok", mechanical: "empty" },
  { n: 5, title: "Searchlight", duration: "3:46", performance: "partial", writers: "empty", mechanical: "empty", note: "Beck Nebel missing instrument" },
  { n: 6, title: "Never Break My Heart (Not Again)", duration: "3:54", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 7, title: "Easy (Home Version)", duration: "2:55", performance: "ok", writers: "ok", mechanical: "empty" },
  { n: 8, title: "Dirty Laundry", duration: "5:38", performance: "partial", writers: "warn", mechanical: "empty", note: "Don Henley / Kortchmar — PRO conflict in Songview" },
  { n: 9, title: "Hurts to Love You", duration: "3:42", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 10, title: "Superhero", duration: "3:18", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 11, title: "Don't Lose Hope", duration: "3:51", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 12, title: "Dark Side of the Sun", duration: "3:29", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 13, title: "Don't Pretend", duration: "3:24", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 14, title: "Easy (Album Version)", duration: "3:02", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 15, title: "Made for Us (Acoustic)", duration: "3:46", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 16, title: "Searchlight (Reprise)", duration: "1:58", performance: "empty", writers: "empty", mechanical: "empty" },
  { n: 17, title: "Take You with Me (Bonus Track)", duration: "3:14", performance: "empty", writers: "empty", mechanical: "empty", note: "Not in the LLT credits doc — hide or capture separately?", bonus: true },
];

function TrackRow({ track, highlighted }: { track: Track; highlighted?: boolean }) {
  const missingCount =
    Number(track.performance === "empty") +
    Number(track.writers === "empty") +
    Number(track.mechanical === "empty");
  const warn = [track.performance, track.writers, track.mechanical].includes(
    "warn",
  );
  const partial = [track.performance, track.writers, track.mechanical].includes(
    "partial",
  );

  return (
    <button
      type="button"
      className={[
        "w-full text-left flex items-center gap-3 px-3.5 py-3 transition-colors",
        "hover:bg-slate-50 active:bg-slate-100",
        highlighted ? "bg-[#319ED8]/[0.03]" : "",
      ].join(" ")}
    >
      {/* drag handle */}
      <span className="text-slate-300 hover:text-slate-500 cursor-grab flex-shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </span>

      {/* track number */}
      <span className="w-6 text-right text-slate-400 text-[12px] font-medium tabular-nums flex-shrink-0">
        {track.n}
      </span>

      {/* title + note */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-900 text-[13.5px] font-semibold truncate">
            {track.title}
          </span>
          {track.bonus && (
            <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[9.5px] font-bold uppercase tracking-wide flex-shrink-0">
              Bonus
            </span>
          )}
        </div>
        {track.note && (
          <div className="text-amber-700 text-[10.5px] mt-0.5 truncate flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
            {track.note}
          </div>
        )}
      </div>

      {/* duration */}
      <span className="text-slate-400 text-[11.5px] tabular-nums inline-flex items-center gap-1 flex-shrink-0 w-12 justify-end">
        <Clock className="w-3 h-3" />
        {track.duration}
      </span>

      {/* status pills */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <StatusPill letter="P" status={track.performance} />
        <StatusPill letter="W" status={track.writers} />
        <StatusPill letter="M" status={track.mechanical} />
      </div>

      {/* right-side summary */}
      <span
        className={[
          "text-[11px] font-medium tabular-nums w-[78px] text-right flex-shrink-0",
          warn
            ? "text-rose-700"
            : partial
              ? "text-amber-700"
              : missingCount === 0
                ? "text-emerald-700"
                : "text-slate-400",
        ].join(" ")}
      >
        {warn
          ? "Needs review"
          : missingCount === 0
            ? "Ready"
            : missingCount === 3
              ? "Empty"
              : `${missingCount} to fill`}
      </span>

      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </button>
  );
}

/* =============================== bits ===================================== */

function StatusPill({
  letter,
  status,
}: {
  letter: "P" | "W" | "M";
  status: Status;
}) {
  const cls =
    status === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "partial"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "warn"
          ? "bg-rose-50 text-rose-700 border-rose-200"
          : "bg-white text-slate-300 border-slate-200";
  return (
    <span
      className={`w-5 h-5 rounded-md border text-[10px] font-bold inline-flex items-center justify-center ${cls}`}
      title={`${letter} · ${status}`}
    >
      {letter}
    </span>
  );
}

function LegendPill({ tone, label }: { tone: "ok"; label: string }) {
  return (
    <span className="w-4 h-4 rounded border bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold inline-flex items-center justify-center">
      {label}
    </span>
  );
}

function Tab({
  label,
  active,
  badge,
}: {
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      className={[
        "px-1 pb-2 text-[12.5px] font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5",
        active
          ? "text-slate-900 border-[#319ED8]"
          : "text-slate-400 border-transparent hover:text-slate-600",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[10px] font-bold tabular-nums">
          {badge}
        </span>
      )}
    </button>
  );
}

// Reference Music2 so the lucide import isn't accidentally dropped; visually
// it's not used in the current layout but kept for parity with sibling files.
void Music2;
void Check;
