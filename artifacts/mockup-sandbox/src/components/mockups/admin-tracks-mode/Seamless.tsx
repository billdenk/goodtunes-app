import { useState } from "react";
import {
  GripVertical,
  Plus,
  Play,
  Pause,
  Pencil,
  ChevronDown,
  Disc3,
  Scissors,
  FileText,
  Users,
  Trash2,
  Check,
  EyeOff,
  SkipBack,
  SkipForward,
} from "lucide-react";

// Same shape as Interactive.tsx so the two mockups are direct siblings.
const TRACKS = [
  { n: 1, title: "Made for Us",      master: true,  snippet: true,  lyrics: true,  instrumental: false, credits: true,  duration: "3:30" },
  { n: 2, title: "Storms",           master: true,  snippet: false, lyrics: true,  instrumental: false, credits: false, duration: "4:12" },
  { n: 3, title: "Cold Night",       master: true,  snippet: true,  lyrics: false, instrumental: true,  credits: true,  duration: "2:58" },
  { n: 4, title: "Hurts To Love You",master: true,  snippet: true,  lyrics: true,  instrumental: false, credits: true,  duration: "3:47" },
  { n: 5, title: "Lighthouse",       master: false, snippet: false, lyrics: false, instrumental: false, credits: false, duration: "—" },
];

const MASTERED_COUNT = TRACKS.filter((t) => t.master).length;

/* ── Dot meter (collapsed row, right side) ─────────────────────────── */
function StatusMeter({
  t,
  onExpand,
}: {
  t: (typeof TRACKS)[number];
  onExpand: () => void;
}) {
  const dots = [t.master, t.snippet];
  let word: string;
  let tone: "ready" | "warn" | "draft";
  if (t.master) {
    word = "Ready";
    tone = "ready";
  } else if (t.snippet || t.lyrics || t.credits) {
    word = "Master";
    tone = "warn";
  } else {
    word = "Draft";
    tone = "draft";
  }
  const wordColor =
    tone === "ready"
      ? "text-emerald-600"
      : tone === "warn"
      ? "text-amber-600"
      : "text-slate-500";
  const isClickable = tone !== "ready";
  return (
    <button
      type="button"
      onClick={isClickable ? onExpand : undefined}
      disabled={!isClickable}
      className={[
        "flex-shrink-0 inline-flex items-center gap-2 px-2 py-1 rounded-md",
        isClickable ? "hover:bg-slate-100" : "cursor-default",
      ].join(" ")}
    >
      <span
        className={[
          "text-[11px] font-semibold uppercase tracking-wider",
          wordColor,
        ].join(" ")}
      >
        {word}
      </span>
      <span className="flex items-center gap-1">
        {dots.map((on, i) => (
          <span
            key={i}
            className={[
              "w-1.5 h-1.5 rounded-full",
              on
                ? tone === "warn"
                  ? "bg-amber-500"
                  : "bg-emerald-500"
                : tone === "warn"
                ? "ring-1 ring-inset ring-amber-400"
                : "ring-1 ring-inset ring-slate-300",
            ].join(" ")}
          />
        ))}
      </span>
    </button>
  );
}

/* ── Status badge (expanded row, REQUIRED + 3-up OPTIONAL) ─────────── */
function StatusBadge({
  ok,
  icon: Icon,
  label,
  subtitle,
  severity = "soft",
  size = "default",
  compact = false,
  onClick,
}: {
  ok: boolean;
  icon: any;
  label: string;
  subtitle?: string;
  severity?: "required" | "soft";
  size?: "default" | "emphasized";
  compact?: boolean;
  onClick?: () => void;
}) {
  const notOkIcon =
    severity === "required"
      ? "bg-amber-50 text-amber-600"
      : "bg-slate-100 text-slate-500";
  const emphasized = size === "emphasized";
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group/card flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-center w-full transition-all relative"
      >
        <span
          className={[
            "w-8 h-8 rounded-md inline-flex items-center justify-center flex-shrink-0 relative",
            ok ? "bg-emerald-50 text-emerald-600" : notOkIcon,
          ].join(" ")}
        >
          <Icon className="w-4 h-4" />
          {ok && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 inline-flex items-center justify-center ring-2 ring-white">
              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
            </span>
          )}
        </span>
        <div className="text-[11px] font-semibold text-slate-900 truncate w-full">
          {label}
        </div>
        {subtitle && (
          <div className="text-[10px] text-slate-500 truncate w-full leading-tight">
            {subtitle}
          </div>
        )}
        <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover/card:opacity-100 transition-opacity absolute top-1.5 right-1.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group/card flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left w-full transition-all",
        emphasized ? "px-4 py-3" : "px-3 py-2",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={[
            "rounded-md inline-flex items-center justify-center flex-shrink-0",
            emphasized ? "w-10 h-10" : "w-7 h-7",
            ok ? "bg-emerald-50 text-emerald-600" : notOkIcon,
          ].join(" ")}
        >
          <Icon className={emphasized ? "w-5 h-5" : "w-3.5 h-3.5"} />
        </span>
        <div className="min-w-0">
          <div
            className={[
              "font-semibold text-slate-900 truncate",
              emphasized ? "text-[14px]" : "text-[12px]",
            ].join(" ")}
          >
            {label}
          </div>
          {subtitle && (
            <div
              className={[
                "text-slate-500 truncate leading-tight",
                emphasized ? "text-[11.5px] mt-0.5" : "text-[10px]",
              ].join(" ")}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
      <span
        className={[
          "inline-flex items-center justify-center flex-shrink-0 relative",
          emphasized ? "w-6 h-6" : "w-5 h-5",
        ].join(" ")}
      >
        {ok && (
          <Check
            className={[
              "text-emerald-600 group-hover/card:opacity-0 transition-opacity",
              emphasized ? "w-4 h-4" : "w-3.5 h-3.5",
            ].join(" ")}
          />
        )}
        <Pencil
          className={[
            "text-slate-500 transition-opacity",
            emphasized ? "w-4 h-4" : "w-3.5 h-3.5",
            ok
              ? "absolute inset-0 m-auto opacity-0 group-hover/card:opacity-100"
              : "opacity-0 group-hover/card:opacity-100",
          ].join(" ")}
        />
      </span>
    </button>
  );
}

/* ── The one row — handles both listen-state AND edit-state in one place ── */
function Row({
  t,
  isLast,
  expanded,
  playing,
  progress,
  onExpand,
  onPlay,
}: {
  t: (typeof TRACKS)[number];
  isLast: boolean;
  expanded: boolean;
  playing: boolean;
  progress: number; // 0–100, only meaningful when playing
  onExpand: () => void;
  onPlay: () => void;
}) {
  const playable = t.master;
  return (
    <li
      className={[
        "group relative transition-colors",
        expanded
          ? "bg-slate-50/80"
          : playing
          ? "bg-[#319ED8]/5"
          : "hover:bg-slate-50/70",
        !isLast && "border-b border-slate-100",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="w-full px-5 py-3 flex items-center gap-4">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />

        {/* # at rest · ▶ on hover/focus · ⏸ when playing. One slot, three states.
            Uses focus-within so keyboard users can Tab to the play button and
            see it materialize, not just mouse users (architect's a11y note). */}
        <div className="w-5 -ml-1.5 flex-shrink-0 flex items-center justify-center">
          {playing ? (
            <button
              type="button"
              onClick={onPlay}
              aria-label={`Pause ${t.title}`}
              className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[#319ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
            >
              <Pause className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <>
              <span className="text-slate-400 text-[12px] tabular-nums font-medium group-hover:hidden group-focus-within:hidden">
                {t.n}
              </span>
              <button
                type="button"
                onClick={playable ? onPlay : undefined}
                disabled={!playable}
                aria-label={`Play ${t.title}`}
                className={[
                  "hidden group-hover:inline-flex group-focus-within:inline-flex w-5 h-5 rounded-full items-center justify-center",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40",
                  playable
                    ? "text-slate-700 hover:text-[#319ED8]"
                    : "text-slate-300 cursor-not-allowed",
                ].join(" ")}
              >
                <Play className="w-3 h-3 ml-0.5 fill-current" />
              </button>
            </>
          )}
        </div>

        {/* Title — plain at rest, input when expanded. Click expands when collapsed. */}
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
              onClick={onExpand}
              className={[
                "block w-full text-left text-[13.5px] font-medium truncate",
                playing ? "text-[#319ED8]" : "text-slate-900",
              ].join(" ")}
            >
              {t.title}
            </button>
          )}
        </div>

        {/* Right side: track length at rest (subtle, so the row feels listen-ready),
            destructive controls when expanded (track-scoped, sits next to chevron). */}
        {expanded ? (
          <div className="flex items-center flex-shrink-0">
            <button
              aria-label="Hide track"
              title="Hide track (parks it without losing lyrics or credits)"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
            <span className="mx-2 h-4 w-px bg-slate-200" aria-hidden />
            <button
              aria-label="Delete track"
              title="Delete track — asks to confirm"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-slate-400 text-[11.5px] tabular-nums w-9 text-right">
              {t.duration}
            </span>
            <StatusMeter t={t} onExpand={onExpand} />
          </div>
        )}

        <button
          type="button"
          onClick={onExpand}
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

      {/* Hairline progress under playing row — same width as the row, no extra chrome. */}
      {playing && !expanded && (
        <div className="absolute left-0 right-0 bottom-0 h-px bg-slate-100">
          <div
            className="h-full bg-[#319ED8] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="pl-20 pr-16 pb-5 -mt-1 space-y-4">
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Required
                </span>
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
              </div>
              <StatusBadge
                ok={t.master}
                icon={Disc3}
                label="Master"
                subtitle={
                  t.master ? "Uploaded · tap to replace" : "Required to publish"
                }
                severity="required"
                size="emphasized"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Optional
                </span>
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatusBadge
                  ok={t.snippet}
                  icon={Scissors}
                  label="Preview"
                  subtitle={t.snippet ? undefined : "Auto · first 30 sec"}
                  severity="soft"
                  compact
                />
                <StatusBadge
                  ok={t.lyrics || t.instrumental}
                  icon={FileText}
                  label="Lyrics"
                  subtitle={t.instrumental ? "Instrumental" : undefined}
                  severity="soft"
                  compact
                />
                <StatusBadge
                  ok={t.credits}
                  icon={Users}
                  label="Credits"
                  severity="soft"
                  compact
                />
              </div>
            </div>
          </div>
          <div className="pt-1">
            <span className="text-[11px] text-slate-400">
              Track ID · t_{1000 + t.n}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

/* ── Docked mini-player. Always present in the header.
   Plays the currently-selected row; carries the "4 of 5 loaded" counter
   so the Listen-mode signal never goes away. ───────────────────────── */
function MiniPlayer({
  current,
  playing,
  progress,
  onTogglePlay,
  onPrev,
  onNext,
}: {
  current: (typeof TRACKS)[number];
  playing: boolean;
  progress: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const playable = current.master;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900 text-white shadow-sm">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous track"
        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
      >
        <SkipBack className="w-3.5 h-3.5 fill-current" />
      </button>
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!playable}
        aria-label={playing ? "Pause" : "Play"}
        className={[
          "w-9 h-9 rounded-full inline-flex items-center justify-center",
          playable
            ? "bg-[#319ED8] text-white hover:bg-[#2890c8]"
            : "bg-white/10 text-slate-500 cursor-not-allowed",
        ].join(" ")}
      >
        {playing ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 translate-x-[1.5px] fill-current" />
        )}
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next track"
        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
      >
        <SkipForward className="w-3.5 h-3.5 fill-current" />
      </button>
      <div className="min-w-[180px] max-w-[220px]">
        <div className="text-[12px] font-semibold truncate">{current.title}</div>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-[#319ED8] rounded-full transition-all"
              style={{ width: playing ? `${progress}%` : "0%" }}
            />
          </div>
          <span className="text-slate-300 text-[10.5px] tabular-nums w-9 text-right">
            {current.duration}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Bulk-QA chip. Lives next to the "Tracks" title so the
   "how done is this album?" signal stays primary even when the
   mini-player is busy. Filled segments = mastered, hollow ring = pending. ── */
function MasteredChip() {
  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200"
      title={`${MASTERED_COUNT} of ${TRACKS.length} tracks have a master uploaded`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Mastered
      </span>
      <span className="text-[12px] font-bold tabular-nums text-slate-900">
        {MASTERED_COUNT}<span className="text-slate-400">/{TRACKS.length}</span>
      </span>
      <span className="flex items-center gap-0.5" aria-hidden>
        {TRACKS.map((t, i) => (
          <span
            key={i}
            className={[
              "w-1.5 h-1.5 rounded-full",
              t.master ? "bg-emerald-500" : "ring-1 ring-inset ring-slate-300",
            ].join(" ")}
          />
        ))}
      </span>
    </div>
  );
}

export function Seamless() {
  // Playing AND expanded are independent now — you can listen to Made for Us
  // while editing Storms' credits, or expand a row to QA without losing the
  // mini-player. That's the whole point.
  const [playingId, setPlayingId] = useState<number | null>(2);
  const [expandedId, setExpandedId] = useState<number | null>(2);
  const [playing, setPlaying] = useState<boolean>(true);
  const progress = 42; // demo only

  const currentId = playingId ?? 1;
  const current = TRACKS.find((t) => t.n === currentId) ?? TRACKS[0];

  const stepPlaying = (dir: 1 | -1) => {
    // Skip unmastered tracks — otherwise we'd land on Lighthouse and show
    // a "playing" row whose play button is disabled (architect's bug #1).
    const idx = TRACKS.findIndex((t) => t.n === currentId);
    for (let step = 1; step <= TRACKS.length; step++) {
      const candidate = TRACKS[(idx + dir * step + TRACKS.length * step) % TRACKS.length];
      if (candidate.master) {
        setPlayingId(candidate.n);
        setPlaying(true);
        return;
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-10 font-[Inter,system-ui,-apple-system,sans-serif]">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {/* Panel header — no toggle. Mini-player lives here permanently. */}
          <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-100">
            <div className="min-w-0 flex items-center gap-3">
              <div className="min-w-0">
                <h2 className="text-slate-900 text-[14px] font-bold">Tracks</h2>
                <p className="text-slate-500 text-[11.5px] mt-0.5 truncate">
                  Reorder, edit, and play right from the list.
                </p>
              </div>
              <MasteredChip />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <MiniPlayer
                current={current}
                playing={playing}
                progress={progress}
                onTogglePlay={() => setPlaying((v) => !v)}
                onPrev={() => stepPlaying(-1)}
                onNext={() => stepPlaying(1)}
              />
              <button
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5"
                data-testid="button-add-track"
              >
                <Plus className="w-3.5 h-3.5" />
                Add track
              </button>
            </div>
          </div>

          <ul>
            {TRACKS.map((t, i) => (
              <Row
                key={t.n}
                t={t}
                isLast={i === TRACKS.length - 1}
                expanded={expandedId === t.n}
                playing={playing && playingId === t.n}
                progress={progress}
                onExpand={() =>
                  setExpandedId(expandedId === t.n ? null : t.n)
                }
                onPlay={() => {
                  if (playingId === t.n) {
                    setPlaying((v) => !v);
                  } else {
                    setPlayingId(t.n);
                    setPlaying(true);
                  }
                }}
              />
            ))}
          </ul>
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400 text-center">
          Hover a row to play. Tap a title or chevron to edit. They no longer fight for the same screen.
        </p>
      </div>
    </div>
  );
}
