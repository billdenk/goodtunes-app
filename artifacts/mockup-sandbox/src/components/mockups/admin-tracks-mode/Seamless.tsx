import { useEffect, useState } from "react";
import {
  GripVertical,
  Plus,
  Play,
  Pause,
  Pencil,
  ChevronDown,
  ChevronUp,
  Disc3,
  Headphones,
  FileText,
  Users,
  Trash2,
  Check,
  EyeOff,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  Mic2,
} from "lucide-react";

// Same shape as Interactive.tsx so the two mockups are direct siblings.
const TRACKS = [
  { n: 1, title: "Made for Us",      master: true,  snippet: true,  lyrics: true,  instrumental: false, credits: true,  duration: "3:30" },
  { n: 2, title: "Storms",           master: true,  snippet: false, lyrics: true,  instrumental: false, credits: false, duration: "4:12" },
  { n: 3, title: "Cold Night",       master: true,  snippet: true,  lyrics: false, instrumental: true,  credits: true,  duration: "2:58" },
  { n: 4, title: "Hurts To Love You",master: true,  snippet: true,  lyrics: true,  instrumental: false, credits: true,  duration: "3:47" },
  { n: 5, title: "Lighthouse",       master: false, snippet: false, lyrics: false, instrumental: false, credits: false, duration: "—" },
];

/* ── Animated 3-bar equalizer for the "now-playing" row indicator.
   Replaces the static ⏸ icon — same shape Apple Music uses, signals
   STATUS (this row is playing) rather than offering a control. The
   bars are NOT the pause button; pause lives in the bottom dock. ─── */
function WaveBars({ paused = false }: { paused?: boolean }) {
  // animation-play-state doesn't inherit — has to live on the children that
  // actually animate. We hand the parent a class and let CSS target the bars.
  return (
    <span
      className={[
        "inline-flex items-end gap-[2px] h-3",
        paused && "gt-eq-paused",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <span className="gt-eq-bar" />
      <span className="gt-eq-bar" />
      <span className="gt-eq-bar" />
    </span>
  );
}

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
  isPaused,
  onExpand,
  onPlay,
}: {
  t: (typeof TRACKS)[number];
  isLast: boolean;
  expanded: boolean;
  playing: boolean;     // this row is the currently-selected playback target
  isPaused: boolean;    // global paused state (only used when playing=true)
  onExpand: () => void;
  onPlay: () => void;
}) {
  const playable = t.master;
  // Active-row pill treatment — Apple-style elevated capsule around the
  // playing row. Subtle blue tint so the eye reads "this is in flight"
  // without competing with the dark bottom dock.
  const activePill = playing && !expanded;
  return (
    <li
      className={[
        "group relative transition-colors",
        expanded
          ? "bg-slate-50/80"
          : activePill
          ? ""
          : "hover:bg-slate-50/70",
        !isLast && !activePill && "border-b border-slate-100",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "w-full flex items-center gap-4 transition-all",
          activePill
            ? "mx-3 my-1 px-3 py-2.5 rounded-xl bg-[#319ED8]/8 ring-1 ring-[#319ED8]/20"
            : "px-5 py-3",
        ].join(" ")}
      >
        {/* Grip — hover-revealed, but suppressed on the playing row so the
            waveform bars own the left side uncontested (Apple's anatomy). */}
        <GripVertical
          className={[
            "w-3.5 h-3.5 text-slate-300 flex-shrink-0 transition-opacity",
            activePill
              ? "opacity-0"
              : "opacity-0 group-hover:opacity-100",
          ].join(" ")}
        />

        {/* # at rest · ▶ on hover/focus · animated bars when playing.
            One slot, three states. Bars are STATUS, not a control —
            pause lives in the bottom dock. */}
        <div className="w-5 -ml-1.5 flex-shrink-0 flex items-center justify-center">
          {playing ? (
            <WaveBars paused={isPaused} />
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

        {/* Right side: track length at rest, destructive controls when expanded. */}
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
                  icon={Headphones}
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

/* ── Floating bottom dock. Apple-Music-style PILL.
   This dock is the canonical anatomy that will graduate to the future
   desktop / iPad consumer player. Admin doesn't strictly need volume
   or a lyrics overlay, but designing the shape with all of it in place
   now means the desktop fan player can be lifted from this primitive
   without redrawing the player vocabulary. See docs/roadmap.md.

   Anatomy (Apple parity):
     LEFT cluster  — transport: shuffle · prev · PLAY (flat, no circle) · next · repeat
     CENTER cluster — thumb · title/subtitle · inline scrubber with elapsed / total
     RIGHT cluster — lyrics glyph · volume icon + thin slider

   IDLE (no selection): pill collapses to just the LEFT cluster, content
   on the right hidden. Pill width auto-sizes so the dock doesn't
   look like a half-empty bar when nothing's playing. ─────────── */
function BottomDock({
  current,
  hasSelection,
  playing,
  progress,
  onTogglePlay,
  onPrev,
  onNext,
}: {
  current: (typeof TRACKS)[number];
  hasSelection: boolean;
  playing: boolean;
  progress: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const playable = current.master;

  // Volume affordance mirrors Apple's dock anatomy:
  //   • Speaker icon is the always-visible control; slider slides out
  //     to its LEFT on hover.
  //   • Click the speaker → toggle mute (preserves previous level).
  //   • Click anywhere on the rail → set level to that point and unmute.
  //   • The speaker GLYPH itself changes with the level, matching Apple:
  //       muted or 0%  → VolumeX  (speaker-slash)
  //       1–14%        → Volume   (speaker, no waves)
  //       15–64%       → Volume1  (speaker, one wave)
  //       65–100%      → Volume2  (speaker, two waves)
  //     When this graduates into PlayerDock, the level is driven by real
  //     audio state and the icon swap comes for free.
  const [volumeMuted, setVolumeMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(65);

  // Shuffle is a binary toggle (off ↔ on). Repeat cycles through three
  // states matching Apple Music's pattern: off → all → one → off.
  //   • off  : plain grey icon, no background
  //   • on / all / one : brand-blue (#319ED8) icon + soft blue bubble
  //   • repeat-one  : same styling as "all", but the glyph swaps from
  //     `Repeat` → `Repeat1` (the version with a small 1 tucked in)
  // Admin surface uses #319ED8 for active states; #FF5470 stays reserved
  // for fan-side favoriting per the design-system rules.
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");

  // Scrub hover state — drives Apple's hover treatment for the progress
  // bar. Hovering the bar (a) blurs the CENTER column (cover + title)
  // only, leaving left/right icon clusters sharp; (b) reveals the
  // elapsed + remaining time labels at the title's vertical position,
  // flush-aligned with the bar's left and right edges; (c) thickens
  // the bar without changing its width. CSS group/peer can't reach
  // the center column from the absolutely-positioned bar across DOM
  // levels, so we lift it to component state.
  const [scrubHover, setScrubHover] = useState(false);

  // Manual hide/show — chevron-down on the dock collapses it into a small
  // corner pill (cover thumb + play/pause + chevron-up). Mirrors the
  // "clean canvas while editing" Bill asked for. Independent of the
  // auto-compact responsive pattern Apple uses on narrow viewports
  // (deferred until graduation, where admin's LIVE PREVIEW column eats
  // horizontal room and auto-compact becomes more valuable).
  const [dockHidden, setDockHidden] = useState(false);

  // ── Responsive auto-compact (Apple's narrow-viewport dock pattern) ──
  // At wide widths the dock is a centered 760px pill with an inset
  // bottom scrubber + hover time labels. At narrow widths (post-
  // graduation, when admin's LIVE PREVIEW column eats horizontal room)
  // it stretches edge-to-edge, drops the inset scrubber, and renders
  // a thin progress hairline at the TOP edge of the pill instead —
  // exactly what Apple Music does at the same breakpoint.
  //
  // `forcedCompact` is a demo-only override so we can preview compact
  // mode inside the canvas's fixed 1280px iframe without resizing the
  // browser. In production (post-graduation), forcedCompact stays null
  // and the layout is driven purely by container width.
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  const [forcedCompact, setForcedCompact] = useState<boolean | null>(null);
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const compact = forcedCompact ?? windowWidth < 1100;
  const cycleRepeat = () =>
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  const VolumeIcon =
    volumeMuted || volumeLevel === 0
      ? VolumeX
      : volumeLevel < 15
      ? Volume
      : volumeLevel < 65
      ? Volume1
      : Volume2;

  const handleVolumeRail = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
    );
    setVolumeLevel(Math.round(pct));
    if (volumeMuted) setVolumeMuted(false);
  };

  // demo-only elapsed/total derived from `progress` so the scrubber
  // labels feel real even though playback is mocked.
  const totalSeconds = 252; // 4:12 — matches Storms
  const elapsedSeconds = Math.floor((progress / 100) * totalSeconds);
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Clamp slider handle inside the rail so the knob never hangs off the
  // end-caps at 0% / 100%. Handle is 10px wide → -5px centers it on the
  // tick. Clamping into [0, 100] keeps it inset at the extremes. Architect
  // flagged this as a "polish before graduation" issue — fix it here since
  // this dock will be lifted into client/src/components/ui/PlayerDock.tsx.
  const knobLeft = (pct: number) =>
    `calc(${Math.max(0, Math.min(100, pct))}% - 5px)`;

  // When minimized, render a compact corner pill instead of the full dock.
  // Contents are intentionally minimal: cover thumb (so the user knows
  // *what's* playing at a glance), play/pause (the one control you might
  // actually need with the dock collapsed), and chevron-up to restore.
  // Title/artist deliberately omitted — a tooltip on the cover or a
  // dedicated "now playing" sheet can answer that without bloating the pill.
  if (dockHidden && hasSelection) {
    return (
      <div className="absolute right-4 bottom-4 z-20">
        <div className="rounded-full bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 flex items-center gap-1 pl-1.5 pr-1.5 py-1.5">
          <div
            className="w-9 h-9 rounded-md flex-shrink-0"
            style={{
              background:
                "linear-gradient(135deg, #319ED8 0%, #7F10A7 100%)",
            }}
            aria-label={`${current.title} — now playing`}
            title={`${current.title} — ${current.artist}`}
          />
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!playable}
            aria-label={playing ? "Pause" : "Play"}
            className={[
              "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
              playable
                ? "text-white hover:bg-white/10"
                : "text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            {playing ? (
              <Pause className="w-[18px] h-[18px] fill-current" />
            ) : (
              <Play className="w-[18px] h-[18px] ml-0.5 fill-current" />
            )}
          </button>
          <button
            type="button"
            aria-label="Show player"
            title="Show player"
            onClick={() => setDockHidden(false)}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Demo-only viewport toggle — lets us preview compact mode inside
          the canvas iframe (fixed 1280px). Removed when the dock graduates
          into client/src/components/ui/PlayerDock.tsx; production behavior
          is driven purely by container width via the resize listener. */}
      <div className="absolute top-2 right-2 z-30 flex items-center gap-1 rounded-full bg-slate-900/80 backdrop-blur-md ring-1 ring-white/10 px-1 py-1 text-[11px] tracking-wide uppercase text-slate-300 shadow-lg">
        <span className="px-2 text-slate-400">Demo viewport</span>
        <button
          type="button"
          onClick={() => setForcedCompact(false)}
          className={[
            "px-2.5 py-1 rounded-full transition-colors",
            !compact
              ? "bg-white text-slate-900"
              : "text-slate-300 hover:text-white",
          ].join(" ")}
        >
          Wide
        </button>
        <button
          type="button"
          onClick={() => setForcedCompact(true)}
          className={[
            "px-2.5 py-1 rounded-full transition-colors",
            compact
              ? "bg-white text-slate-900"
              : "text-slate-300 hover:text-white",
          ].join(" ")}
        >
          Compact
        </button>
        {forcedCompact !== null && (
          <button
            type="button"
            onClick={() => setForcedCompact(null)}
            className="px-2 py-1 rounded-full text-slate-400 hover:text-white"
            title="Clear override — follow window width"
          >
            Auto
          </button>
        )}
      </div>

    <div
      className={[
        "absolute bottom-4 z-20",
        compact
          ? "left-2 right-2"
          : "left-1/2 -translate-x-1/2",
      ].join(" ")}
      style={
        !compact && hasSelection
          ? { width: "min(760px, calc(100% - 32px))" }
          : undefined
      }
    >
      {/* Symmetric py-4 keeps every transport button + the album cover
          vertically centered in the pill (their shared items-center row
          centers on the tallest element, the 44px Play button). At py-4
          the pill is 76px tall — chunkier than 68px to match Apple's
          mini-player proportions, which gives the inset progress bar a
          clearly visible 10px gap below the cover instead of reading as
          flush. The bar lives in the bottom slice of that padding zone. */}
      {/* Pill corner radius drops from `rounded-full` → `rounded-3xl` in
          compact mode. With a 76px-tall capsule, rounded-full = 38px
          radius, which clips the top-edge hairline entirely (the curve
          eats the full top edge). At rounded-3xl (24px radius), the
          hairline has visible width across the middle of the pill while
          still reading as a softly-rounded chip — matching Apple's
          narrow-dock geometry. Wide mode keeps the capsule. */}
      <div
        className={[
          "relative bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 overflow-hidden",
          compact ? "rounded-3xl" : "rounded-full",
        ].join(" ")}
      >
        {/* Compact-mode top hairline scrubber — Apple's narrow-viewport
            pattern: when the dock can't afford an inset bar between
            clusters, the progress moves to a thin strip across the very
            top edge of the pill. `overflow-hidden` on the pill clips the
            hairline to the rounded shape so it tucks naturally into the
            curve at both ends. */}
        {compact && hasSelection && (
          <div className="absolute top-0 left-0 right-0 h-[2px] z-10 pointer-events-none">
            <div className="relative h-full bg-white/15">
              <div
                className="absolute inset-y-0 left-0 bg-white transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {/* Vertical padding tightens slightly in compact mode (py-3 vs
            py-4) — the inset bottom scrubber is gone, so we don't need
            the extra 8px of bottom padding it lived in. The Play button
            (44px) still drives row height, and `items-center` keeps every
            transport + right-cluster button vertically aligned regardless. */}
        <div
          className={[
            "flex items-center gap-1.5 px-3",
            compact ? "py-3" : "py-4",
          ].join(" ")}
        >

          {/* ── LEFT · transport ─────────────────────────────────── */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              aria-label="Shuffle"
              aria-pressed={shuffleOn}
              title={shuffleOn ? "Shuffle on" : "Shuffle off"}
              onClick={() => setShuffleOn((s) => !s)}
              className={[
                "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
                shuffleOn
                  ? "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20"
                  : "text-slate-300 hover:text-white hover:bg-white/10",
              ].join(" ")}
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous track"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <SkipBack className="w-[18px] h-[18px] fill-current" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!playable}
              aria-label={playing ? "Pause" : "Play"}
              className={[
                "w-11 h-11 rounded-full inline-flex items-center justify-center transition-colors",
                playable
                  ? "text-white hover:bg-white/10"
                  : "text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {playing ? (
                // Pause sized down vs Play to optically balance — Lucide's
                // pause bars are visually heavier than the Play triangle at
                // equal size (architect's polish note). Drop to w-6 h-6.
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-7 h-7 translate-x-[1.5px] fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next track"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <SkipForward className="w-[18px] h-[18px] fill-current" />
            </button>
            <button
              type="button"
              aria-label={
                repeatMode === "off"
                  ? "Repeat off"
                  : repeatMode === "all"
                  ? "Repeat all"
                  : "Repeat one"
              }
              title={
                repeatMode === "off"
                  ? "Repeat off"
                  : repeatMode === "all"
                  ? "Repeat all"
                  : "Repeat one"
              }
              onClick={cycleRepeat}
              className={[
                "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
                repeatMode === "off"
                  ? "text-slate-300 hover:text-white hover:bg-white/10"
                  : "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20",
              ].join(" ")}
            >
              <RepeatIcon className="w-4 h-4" />
            </button>
          </div>

          {hasSelection && (
            <>
              <span className="mx-2 h-6 w-px bg-white/10 flex-shrink-0" aria-hidden />

              {/* ── CENTER · track info ────────────────────────────
                  Apple proportions: the album cover is ≈65% of the pill's
                  content height, not full-bleed. 44px cover (w-11 h-11)
                  with the title/subtitle stack vertically centered beside
                  it leaves the breathing room above + below that the
                  reference shot shows. The progress scrubber is NOT in
                  this column anymore — it lives at the pill's bottom
                  edge and runs UNDER everything (see below). */}
              {/* Center cluster blurs out while the user is hovering the
                  progress bar — Apple's hover treatment. Left/right icon
                  clusters stay sharp; only the now-playing card recedes
                  so the time labels above the bar have visual breathing
                  room. Blur is moderate (6px) + 50% opacity — still
                  faintly readable so context isn't lost. */}
              <div
                className={[
                  "flex items-center gap-3 min-w-0 flex-1 transition-[filter,opacity] duration-150",
                  scrubHover ? "blur-[6px] opacity-50" : "",
                ].join(" ")}
                aria-hidden={scrubHover}
              >
                {/* Cover at 40px (w-10) — intentionally one notch shorter
                    than the 44px Play button so the Play button drives
                    the row's intrinsic height. Stays clearly the
                    largest visual anchor in the center cluster. */}
                <div className="w-10 h-10 rounded-md bg-gradient-to-br from-[#319ED8] to-[#7F10A7] flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate leading-tight">
                    {current.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                    Nick Carter — Love Life Tragedy
                  </div>
                </div>
              </div>

              {/* ── RIGHT · utility cluster ───────────────────────
                  Apple's ⋯ opens a song-options menu (Download, Add to
                  Playlist, Create Station, Share, etc.). The admin Tracks
                  row already owns its own ⋯ on each row, so this dock
                  doesn't need a duplicate — dropped per Bill's call.
                  Shuffle + Repeat remain on the LEFT cluster because this
                  dock graduates to the consumer player where both matter. */}
              {/* gap-1.5 between mic and volume cluster — Apple's right
                  cluster has visible breathing room between each icon
                  (not the tight gap-0.5 used inside the transport row).
                  Buttons bump to w-10 (40px) so 20px icons sit centered
                  with proper Apple-HIG hit-zone margin. */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  aria-label="Show lyrics"
                  title="Show lyrics — QA-preview synced lyrics while the master plays"
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                >
                  {/* Lyrics glyph — Lucide Mic2 (singer's mic). Matches
                      the canonical primitive at client/src/components/ui/
                      LyricsIcon.tsx. Sandbox can't import that primitive,
                      so use Mic2 directly here. Keep both surfaces aligned.
                      20px on the right cluster (vs 18px transport-skip
                      arrows) — Apple's right-side glyphs read chunkier
                      than the transport row in the reference. */}
                  <Mic2 className="w-5 h-5" />
                </button>
                {/* Volume cluster — Apple's pattern:
                    • Default: just the speaker icon (no slider clutter).
                    • Hover: slider slides out to the LEFT of the speaker
                      with a smooth width transition.
                    • Click speaker: toggle mute → swap Volume2 ↔ VolumeX,
                      the filled portion of the slider collapses to 0 and
                      the knob hides. Slider rail stays visible (hover) so
                      the user can drag to unmute. */}
                <div className="group/vol flex items-center pr-0.5">
                  <div
                    className="overflow-hidden transition-[width,margin] duration-200 ease-out w-0 group-hover/vol:w-[68px] group-hover/vol:mr-1.5"
                  >
                    {/* Click anywhere on the rail to set volume to that
                        point — demonstrates the icon swap as Bill drags. */}
                    <div
                      className="relative w-16 h-[3px] bg-white/15 rounded-full cursor-pointer"
                      onClick={handleVolumeRail}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-150"
                        style={{ width: volumeMuted ? "0%" : `${volumeLevel}%` }}
                      />
                      {!volumeMuted && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow ring-1 ring-black/10"
                          style={{ left: knobLeft(volumeLevel) }}
                          aria-hidden
                        />
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={volumeMuted ? "Unmute" : "Mute"}
                    title={volumeMuted ? "Unmute" : "Mute"}
                    onClick={() => setVolumeMuted((v) => !v)}
                    className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                  >
                    <VolumeIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Minimize — collapses the full dock to a corner pill.
                    Sits at the far right of the cluster (after volume) as
                    a "view chrome" control, the same slot Apple puts its
                    full-screen collapse chevron. ChevronDown points toward
                    where the mini-pill will land (bottom-right corner). */}
                <button
                  type="button"
                  aria-label="Minimize player"
                  title="Minimize player"
                  onClick={() => setDockHidden(true)}
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* ── Progress bar — Apple's mini-player anatomy ─────────────
            Bar is SCOPED to the now-playing card area: its left edge
            sits ~12px past the repeat button's right edge, and its
            right edge sits ~12px before the lyrics button's left edge
            — Apple's bar has visually SYMMETRIC gaps to whichever icon
            is nearest on either side. Bar does NOT run under the
            transport buttons or the lyrics/volume icons.

            Pixel insets (left-[228px] / right-[120px]) are tuned so
            the gap-to-nearest-icon reads as visually balanced on both
            ends (right cluster needs more breathing room because the
            mic + volume glyphs are chunkier than the transport icons):
              left  = px-3 (12) + transport (196) + divider zone (~17) + ~3
              right = px-3 (12) + right cluster (~86) + ~22 clear
            If the cluster shapes change, retune these two numbers.

            • At REST: 2px rounded bar, time labels collapsed to w-0.
            • On HOVER: bar thickens to 4px + brightens; elapsed (left)
              and remaining-time (right) labels expand in — bar's flex-1
              contracts to make room, so nothing jumps vertically.
            • On CLICK / scrubbing: 5px, brighter again.
            • End of the white fill IS the play head — no knob dot.
            Gated on !compact: in compact mode the scrubber moves up to
            the top hairline above and these labels + inset bar disappear. */}
        {!compact && hasSelection && (
          <>
            {/* Time labels — appear at the SAME vertical position as the
                (now-blurred) title text, flush-aligned with the bar's
                left + right edges. text-[13px] = Apple's footnote size.
                Pointer-events disabled so they don't intercept the
                bar's hover area. */}
            <div
              className={[
                "absolute left-[228px] right-[120px] inset-y-0 flex items-center justify-between pointer-events-none z-10",
                "transition-opacity duration-150",
                scrubHover ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              <span className="text-[13px] tabular-nums text-slate-300 whitespace-nowrap">
                {fmt(elapsedSeconds)}
              </span>
              <span className="text-[13px] tabular-nums text-slate-300 whitespace-nowrap">
                −{fmt(totalSeconds - elapsedSeconds)}
              </span>
            </div>

            {/* Bar — fixed width (no shrink-to-make-room dance). On
                hover the cover+title behind it blur via scrubHover
                state, and the bar itself thickens 2 → 4 → 5px. */}
            <div
              className="group/scrub absolute left-[228px] right-[120px] bottom-1.5 h-3 flex items-center cursor-pointer"
              onMouseEnter={() => setScrubHover(true)}
              onMouseLeave={() => setScrubHover(false)}
            >
              <div className="relative flex-1 h-[2px] rounded-full bg-white/15 transition-[height,background-color] duration-100 group-hover/scrub:h-[4px] group-hover/scrub:bg-white/25 group-active/scrub:h-[5px] group-active/scrub:bg-white/40">
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

export function Seamless() {
  // Playing AND expanded are independent — you can listen to Made for Us
  // while editing Storms' credits, or expand a row to QA without losing
  // the dock. That's the whole point.
  const [playingId, setPlayingId] = useState<number | null>(2);
  const [expandedId, setExpandedId] = useState<number | null>(2);
  const [playing, setPlaying] = useState<boolean>(true);
  const progress = 42; // demo only

  const hasSelection = playingId !== null;
  const currentId = playingId ?? 1;
  const current = TRACKS.find((t) => t.n === currentId) ?? TRACKS[0];

  const stepPlaying = (dir: 1 | -1) => {
    // Skip unmastered tracks — otherwise we'd land on Lighthouse and
    // surface a disabled play state (architect's bug fix).
    const idx = TRACKS.findIndex((t) => t.n === currentId);
    for (let step = 1; step <= TRACKS.length; step++) {
      const candidate =
        TRACKS[(idx + dir * step + TRACKS.length * step) % TRACKS.length];
      if (candidate.master) {
        setPlayingId(candidate.n);
        setPlaying(true);
        return;
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-10 font-[Inter,system-ui,-apple-system,sans-serif]">
      {/* Scoped keyframes for the row-level waveform bars. Three bars,
          three durations, organic feel. Brand blue (#319ED8) to match
          the existing admin playing-row vocabulary; brand heart-pink
          stays reserved for fan favoriting. */}
      <style>{`
        @keyframes gtEqBar {
          0%, 100% { transform: scaleY(0.35); }
          50%      { transform: scaleY(1);    }
        }
        .gt-eq-bar {
          display: inline-block;
          width: 2px;
          height: 12px;
          background: #319ED8;
          border-radius: 1px;
          transform-origin: center bottom;
          animation: gtEqBar 700ms ease-in-out infinite;
        }
        .gt-eq-bar:nth-child(2) { animation-duration: 900ms; animation-delay: -150ms; }
        .gt-eq-bar:nth-child(3) { animation-duration: 600ms; animation-delay: -300ms; }
        .gt-eq-paused .gt-eq-bar { animation-play-state: paused; }
      `}</style>

      <div className="max-w-3xl mx-auto">
        <div className="relative rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {/* Panel header — title on the left, Add track on the right. */}
          <div className="px-5 py-4 flex items-center justify-between gap-4 border-b border-slate-100">
            <div className="min-w-0">
              <h2 className="text-slate-900 text-[14px] font-bold">Tracks</h2>
              <p className="text-slate-500 text-[11.5px] mt-0.5 truncate">
                Reorder, edit, and play right from the list.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5"
              data-testid="button-add-track"
            >
              <Plus className="w-3.5 h-3.5" />
              Add track
            </button>
          </div>

          {/* The list. Extra bottom padding so the floating dock can sit
              ON TOP of the last rows when scrolled, matching Apple. */}
          <ul className="pb-24">
            {TRACKS.map((t, i) => (
              <Row
                key={t.n}
                t={t}
                isLast={i === TRACKS.length - 1}
                expanded={expandedId === t.n}
                playing={hasSelection && playingId === t.n}
                isPaused={!playing}
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

          <BottomDock
            current={current}
            hasSelection={hasSelection}
            playing={playing}
            progress={progress}
            onTogglePlay={() => setPlaying((v) => !v)}
            onPrev={() => stepPlaying(-1)}
            onNext={() => stepPlaying(1)}
          />
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400 text-center">
          Hover a row to play. Tap a title or chevron to edit. They no longer fight for the same screen.
        </p>
      </div>
    </div>
  );
}
