import { useState } from "react";
import {
  GripVertical,
  Plus,
  Play,
  Pause,
  Headphones,
  Pencil,
  ChevronDown,
  Upload,
  Scissors,
  FileText,
  Users,
  Trash2,
} from "lucide-react";

type Mode = "edit" | "listen";

const TRACKS = [
  { n: 1, title: "Made for Us",      master: true,  snippet: true,  lyrics: true,  credits: true,  duration: "3:30" },
  { n: 2, title: "Storms",           master: true,  snippet: false, lyrics: true,  credits: false, duration: "4:12" },
  { n: 3, title: "Cold Night",       master: true,  snippet: true,  lyrics: false, credits: true,  duration: "2:58" },
  { n: 4, title: "Hurts To Love You",master: true,  snippet: true,  lyrics: true,  credits: true,  duration: "3:47" },
  { n: 5, title: "Lighthouse",       master: false, snippet: false, lyrics: false, credits: false, duration: "—" },
];

function DotMeter({ t }: { t: (typeof TRACKS)[number] }) {
  // Required to publish: master + 30-sec snippet
  const dots = [t.master, t.snippet];
  const labels = ["Master", "30-sec snippet"];
  const complete = dots.every(Boolean);
  return (
    <div
      className="flex items-center gap-1.5 flex-shrink-0"
      title={dots
        .map((ok, i) => `${labels[i]}: ${ok ? "✓" : "missing"}`)
        .join(" · ")}
    >
      <div className="flex items-center gap-0.5">
        {dots.map((ok, i) => (
          <span
            key={i}
            className={[
              "w-1.5 h-1.5 rounded-full",
              ok ? "bg-emerald-500" : "bg-slate-200",
            ].join(" ")}
          />
        ))}
      </div>
      <span
        className={[
          "text-[10.5px] font-semibold tabular-nums",
          complete ? "text-slate-400" : "text-amber-600",
        ].join(" ")}
      >
        {dots.filter(Boolean).length}/2
      </span>
    </div>
  );
}

function StatusBadge({
  ok,
  icon: Icon,
  okText,
  missingText,
  cta,
}: {
  ok: boolean;
  icon: any;
  okText: string;
  missingText: string;
  cta: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={[
            "w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0",
            ok
              ? "bg-emerald-50 text-emerald-600"
              : "bg-amber-50 text-amber-600",
          ].join(" ")}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold text-slate-900 truncate">
            {ok ? okText : missingText}
          </div>
        </div>
      </div>
      <button
        className={[
          "text-[11.5px] font-semibold flex-shrink-0",
          ok ? "text-slate-500 hover:text-slate-700" : "text-[#319ED8] hover:underline",
        ].join(" ")}
      >
        {cta}
      </button>
    </div>
  );
}

function SegmentedControl({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Tracks view mode"
      className="inline-flex p-1 bg-slate-100 rounded-xl text-[12.5px] font-semibold shadow-inner"
    >
      <button
        role="tab"
        aria-selected={mode === "edit"}
        onClick={() => setMode("edit")}
        className={[
          "px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all",
          mode === "edit"
            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
            : "text-slate-500 hover:text-slate-700",
        ].join(" ")}
      >
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </button>
      <button
        role="tab"
        aria-selected={mode === "listen"}
        onClick={() => setMode("listen")}
        className={[
          "px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-all",
          mode === "listen"
            ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60"
            : "text-slate-500 hover:text-slate-700",
        ].join(" ")}
      >
        <Headphones className="w-3.5 h-3.5" />
        Listen
      </button>
    </div>
  );
}

function EditRow({
  t,
  isLast,
  expanded,
  onToggle,
}: {
  t: (typeof TRACKS)[number];
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={[
        "group transition-colors",
        expanded ? "bg-slate-50/80" : "hover:bg-slate-50/70",
        !isLast && "border-b border-slate-100",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="w-full px-5 py-3 flex items-center gap-4"
      >
        <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
        {/* Apple Music: # at rest, play on hover */}
        <div className="w-5 -ml-1.5 flex-shrink-0 flex items-center justify-center">
          <span className="text-slate-400 text-[12px] tabular-nums font-medium group-hover:hidden">
            {t.n}
          </span>
          <span
            className={[
              "hidden group-hover:inline-flex w-5 h-5 rounded-full items-center justify-center",
              t.master ? "text-slate-700" : "text-slate-300",
            ].join(" ")}
            aria-label={`Play ${t.title}`}
          >
            <Play className="w-3 h-3 ml-0.5 fill-current" />
          </span>
        </div>
        {/* Title — plain text at rest, editable input when expanded */}
        <div className="flex-1 min-w-0">
          {expanded ? (
            <input
              defaultValue={t.title}
              autoFocus
              className="w-full px-2 -mx-2 py-0.5 rounded-md text-slate-900 text-[13.5px] font-medium bg-transparent border border-transparent hover:border-slate-200 focus:bg-white focus:border-[#319ED8] focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20"
            />
          ) : (
            <button
              type="button"
              onClick={onToggle}
              className="block w-full text-left text-slate-900 text-[13.5px] font-medium truncate"
            >
              {t.title}
            </button>
          )}
        </div>
        <DotMeter t={t} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-shrink-0 w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        >
          <ChevronDown
            className={[
              "w-4 h-4 transition-transform",
              expanded ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>
      </div>

      {expanded && (
        <div className="px-5 pb-5 -mt-1 space-y-4">
          {/* Required */}
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Required to publish
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatusBadge
                ok={t.master}
                icon={Upload}
                okText="Master loaded"
                missingText="No master"
                cta={t.master ? "Replace" : "Upload"}
              />
              <StatusBadge
                ok={t.snippet}
                icon={Scissors}
                okText="30-sec snippet set"
                missingText="No 30-sec snippet"
                cta={t.snippet ? "Edit" : "Set clip"}
              />
            </div>
          </div>

          {/* Optional */}
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Optional
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatusBadge
                ok={t.lyrics}
                icon={FileText}
                okText="Lyrics set"
                missingText="No lyrics"
                cta={t.lyrics ? "Edit" : "Add"}
              />
              <StatusBadge
                ok={t.credits}
                icon={Users}
                okText="Credits set"
                missingText="No credits"
                cta={t.credits ? "Edit" : "Add"}
              />
            </div>
          </div>

          {/* Danger row */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">
              Track ID · t_{1000 + t.n}
            </span>
            <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50">
              <Trash2 className="w-3 h-3" />
              Delete track
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ListenRow({
  t,
  isLast,
  playingId,
  onToggle,
}: {
  t: (typeof TRACKS)[number];
  isLast: boolean;
  playingId: number | null;
  onToggle: (n: number) => void;
}) {
  const playable = t.master;
  const active = playingId === t.n;
  return (
    <li
      className={[
        "px-5 py-3 transition-colors",
        active ? "bg-[#319ED8]/5" : "hover:bg-slate-50/70",
        !isLast && "border-b border-slate-100",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => playable && onToggle(t.n)}
          disabled={!playable}
          className={[
            "w-8 h-8 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors",
            playable
              ? active
                ? "bg-[#319ED8] text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : "bg-slate-50 text-slate-300 cursor-not-allowed",
          ].join(" ")}
        >
          {active ? (
            <Pause className="w-3.5 h-3.5 fill-current" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
          )}
        </button>
        <span className="w-5 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
          {t.n}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={[
              "text-[13.5px] font-medium truncate",
              active ? "text-[#319ED8]" : "text-slate-900",
            ].join(" ")}
          >
            {t.title}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
              {playable && (
                <div
                  className="h-full bg-[#319ED8] rounded-full transition-all"
                  style={{ width: active ? "42%" : "0%" }}
                />
              )}
            </div>
            <span className="text-slate-400 text-[11px] tabular-nums w-9 text-right">
              {t.duration}
            </span>
          </div>
        </div>
        {!playable && (
          <span className="text-[11px] italic text-slate-400 flex-shrink-0">
            No master
          </span>
        )}
      </div>
    </li>
  );
}

export function Interactive() {
  const [mode, setMode] = useState<Mode>("edit");
  const [playingId, setPlayingId] = useState<number | null>(2);
  const [expandedId, setExpandedId] = useState<number | null>(2);

  return (
    <div className="min-h-screen bg-slate-50 p-10 font-[Inter,system-ui,-apple-system,sans-serif]">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-3">
              {mode === "listen" && (
                <button
                  onClick={() =>
                    setPlayingId(playingId === null ? 1 : null)
                  }
                  className="w-9 h-9 rounded-full bg-[#319ED8] text-white inline-flex items-center justify-center shadow-sm hover:bg-[#2890c8]"
                  aria-label="Play all"
                >
                  {playingId !== null ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5 fill-current" />
                  )}
                </button>
              )}
              <div>
                <h2 className="text-slate-900 text-[14px] font-bold">Tracks</h2>
                <p className="text-slate-500 text-[11.5px] mt-0.5">
                  {mode === "edit"
                    ? "Reorder, edit titles, attach masters and credits."
                    : "Bulk-QA the masters. 4 of 5 loaded."}
                </p>
              </div>
            </div>
            <SegmentedControl mode={mode} setMode={setMode} />
          </div>

          <ul>
            {TRACKS.map((t, i) =>
              mode === "edit" ? (
                <EditRow
                  key={t.n}
                  t={t}
                  isLast={i === TRACKS.length - 1}
                  expanded={expandedId === t.n}
                  onToggle={() =>
                    setExpandedId(expandedId === t.n ? null : t.n)
                  }
                />
              ) : (
                <ListenRow
                  key={t.n}
                  t={t}
                  isLast={i === TRACKS.length - 1}
                  playingId={playingId}
                  onToggle={(n) => setPlayingId(playingId === n ? null : n)}
                />
              ),
            )}
          </ul>

          {mode === "edit" && (
            <div className="px-5 py-3 border-t border-slate-100">
              <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5">
                <Plus className="w-3.5 h-3.5" />
                Add track
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400 text-center">
          Tap any row to expand · tap{" "}
          <span className="font-semibold text-slate-600">Edit</span> ·{" "}
          <span className="font-semibold text-slate-600">Listen</span> to switch
          modes
        </p>
      </div>
    </div>
  );
}
