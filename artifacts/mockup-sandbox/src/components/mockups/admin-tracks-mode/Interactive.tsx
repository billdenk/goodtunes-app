import { useEffect, useRef, useState } from "react";
import {
  GripVertical,
  Plus,
  Play,
  Pause,
  Headphones,
  Pencil,
  ChevronDown,
  Disc3,
  Scissors,
  FileText,
  Users,
  Trash2,
  X,
  Check,
  Upload,
  EyeOff,
  Lock,
  LockOpen,
  MoveHorizontal,
  Link as LinkIcon,
  Sparkles,
  Loader2,
  Check as CheckIcon,
  Mic,
  RefreshCw,
  Play as PlayIcon,
  Search,
} from "lucide-react";

type Mode = "edit" | "listen";

const TRACKS = [
  { n: 1, title: "Made for Us",      master: true,  snippet: true,  lyrics: true,  credits: true,  duration: "3:30" },
  { n: 2, title: "Storms",           master: true,  snippet: false, lyrics: true,  credits: false, duration: "4:12" },
  { n: 3, title: "Cold Night",       master: true,  snippet: true,  lyrics: false, credits: true,  duration: "2:58" },
  { n: 4, title: "Hurts To Love You",master: true,  snippet: true,  lyrics: true,  credits: true,  duration: "3:47" },
  { n: 5, title: "Lighthouse",       master: false, snippet: false, lyrics: false, credits: false, duration: "—" },
];

// One-word status meter. Replaces the old "n/2" ratio because the bare
// number couldn't communicate "those four chips include two optionals." Word
// names what's missing; the dot pair shows which slot is empty. When the
// word is actionable (Master / Snippet / Draft), the meter is a button that
// expands the row and auto-opens the offending section so the user lands
// on the empty drop zone in one tap. "Ready" is a status, not a CTA.
function StatusMeter({
  t,
  onJumpTo,
}: {
  t: (typeof TRACKS)[number];
  onJumpTo: (section: "master" | "snippet") => void;
}) {
  // Master is the only gate now. The 30-sec snippet auto-defaults to the
  // first 30 seconds of the master — the artist can override the window
  // but never has to. So:
  //   dot 1 = master ready (filled emerald) or needed (hollow ring)
  //   dot 2 = custom snippet chosen (filled emerald) or using auto default
  //           (hollow ring). Never warns — it's a "did the artist pick a
  //           hook?" signal, not a "you must do this" signal.
  const dots = [t.master, t.snippet];
  let word: string;
  let target: "master" | "snippet" | null;
  let tone: "ready" | "warn" | "draft";
  let hint: string;
  if (t.master) {
    word = "Ready";
    target = null;
    tone = "ready";
    hint = t.snippet
      ? "Master is in and a custom 30-sec snippet is set. Publishable."
      : "Master is in. Snippet defaults to the first 30 seconds — tap to customize.";
  } else if (t.snippet || t.lyrics || t.credits) {
    word = "Master";
    target = "master";
    tone = "warn";
    hint = "Tap to drop a .wav, .flac, or .aiff master.";
  } else {
    word = "Draft";
    target = "master";
    tone = "draft";
    hint = "Tap to add the master file. Everything else can come after.";
  }
  const isClickable = target !== null;
  const wordColor =
    tone === "warn" ? "text-amber-600" : "text-slate-400";
  return (
    // min-width keeps the dots column-aligned across all 5 rows regardless
    // of which word is showing. justify-end pins to the right edge.
    <div className="flex items-center gap-1.5 flex-shrink-0 min-w-[110px] justify-end">
      <button
        type="button"
        onClick={() => target && onJumpTo(target)}
        disabled={!isClickable}
        title={hint}
        className={[
          "text-[10.5px] font-semibold transition-colors",
          wordColor,
          isClickable
            ? "hover:text-amber-700 hover:underline decoration-dotted underline-offset-2 cursor-pointer"
            : "cursor-default",
        ].join(" ")}
      >
        {word}
      </button>
      {/* Status dots — accessibility note:
          Color alone can't carry meaning here (deuteranopia makes emerald
          and slate look the same hue). So shape carries it: filled circle
          = done, hollow ring = needed. The word + amber tone is the
          redundant signal on top. */}
      <div className="flex items-center gap-0.5" aria-hidden>
        {dots.map((ok, i) => (
          <span
            key={i}
            className={[
              "w-2 h-2 rounded-full",
              ok
                ? "bg-emerald-500"
                : "bg-transparent border border-slate-300",
            ].join(" ")}
          />
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  ok,
  icon: Icon,
  label,
  subtitle,
  severity = "soft",
  active,
  onClick,
  size = "default",
  compact = false,
}: {
  ok: boolean;
  icon: any;
  label: string;
  // Optional second line under the label, e.g. "Auto · first 30 sec" for the
  // snippet tile when the artist hasn't customized the window.
  subtitle?: string;
  // 'required' → not-ok renders amber (Master). 'soft' → not-ok renders
  // neutral slate (Lyrics, Credits, Snippet — none of these block publish).
  severity?: "required" | "soft";
  active: boolean;
  onClick: () => void;
  // 'emphasized' → taller, larger icon, heavier label. Used for the lone
  // REQUIRED tile (Master) sitting on top of the 1-over-3 grid.
  size?: "default" | "emphasized";
  // Stacked vertical layout — icon on top, label below — for the three
  // small OPTIONAL tiles sharing one row.
  compact?: boolean;
}) {
  const notOkIconClasses =
    severity === "required"
      ? "bg-amber-50 text-amber-600"
      : "bg-slate-100 text-slate-500";
  const emphasized = size === "emphasized";
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={[
          "group/card flex flex-col items-center justify-center gap-1.5 px-2 py-2.5 rounded-lg bg-white border text-center w-full transition-all relative",
          active
            ? "border-[#319ED8] ring-2 ring-[#319ED8]/20"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
        ].join(" ")}
      >
        <span
          className={[
            "w-8 h-8 rounded-md inline-flex items-center justify-center flex-shrink-0 relative",
            ok ? "bg-emerald-50 text-emerald-600" : notOkIconClasses,
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
        {/* Pencil pip floats top-right on hover; check pip already lives on the icon */}
        <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover/card:opacity-100 transition-opacity absolute top-1.5 right-1.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group/card flex items-center justify-between gap-2 rounded-lg bg-white border text-left w-full transition-all",
        emphasized ? "px-4 py-3" : "px-3 py-2",
        active
          ? "border-[#319ED8] ring-2 ring-[#319ED8]/20"
          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={[
            "rounded-md inline-flex items-center justify-center flex-shrink-0",
            emphasized ? "w-10 h-10" : "w-7 h-7",
            ok ? "bg-emerald-50 text-emerald-600" : notOkIconClasses,
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
      {/* Right slot: check (complete, at rest) → pencil (on hover) */}
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

/* ---- Detail panels: one per status card ---- */

function DetailWrap({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mt-2 rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-bold text-slate-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/* Mocked waveform — fixed pseudo-random bars */
const WAVE_BARS = Array.from({ length: 96 }, (_, i) =>
  Math.round(20 + 60 * Math.abs(Math.sin(i * 0.6) * Math.cos(i * 0.13))),
);

function MasterDetail({
  hasMaster,
  onGoToSnippet,
  onClose,
}: {
  hasMaster: boolean;
  onGoToSnippet: () => void;
  onClose: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Plain React hover state on the pill. Avoids any Tailwind `group`/`group/pill`
  // ambiguity with the outer track row (which also uses `group`) and is exactly
  // scoped to this one element — cursor on the pill = active, anywhere else = not.
  const [pillHover, setPillHover] = useState(false);
  const active = pillHover || menuOpen;
  return (
    <DetailWrap title="Master" onClose={onClose}>
      {hasMaster ? (
        <>
          {/* Success banner — Apple "completed, here's the next thing"
              pattern. Emerald check carries the success (shape + color
              both signal it, deuteranopia-safe). The next step is a
              real action, not a sentence: "Pick your 30-second snippet"
              is a brand-blue link that jumps straight to that tile. */}
          <div className="-mt-1 rounded-lg bg-emerald-500/5 border border-emerald-500/30 px-3 py-2.5 flex items-start gap-2.5">
            <span className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-600 inline-flex items-center justify-center flex-shrink-0">
              <Check className="w-4 h-4" />
            </span>
            <div className="text-[11.5px] leading-snug flex-1 min-w-0">
              <div className="font-semibold text-slate-900">
                Master uploaded
              </div>
              <div className="text-slate-600 mt-0.5">
                Give it a listen below, then{" "}
                <button
                  onClick={onGoToSnippet}
                  className="font-semibold text-[#319ED8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40 rounded"
                >
                  pick your 30-second snippet
                </button>
                {" "}— or leave it auto-set to the first 30 seconds.
              </div>
            </div>
          </div>

        {/* Single row: [▶ subdued play] [filename + meta] [Replace ▾]
            The whole row is a drop target — drag a new .wav/.aiff/.flac to swap. */}
        <div
          onMouseEnter={() => setPillHover(true)}
          onMouseLeave={() => setPillHover(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          className={[
            "relative flex items-center gap-3 p-2.5 rounded-md border-2 transition-colors",
            // Pill stays visually quiet at all times — no bg/border change on
            // hover. Only the play button warms up and Replace fades in.
            dragOver
              ? "border-dashed border-[#319ED8] bg-[#319ED8]/5"
              : "border-slate-200 bg-slate-50",
          ].join(" ")}
        >
          {/* Play — subdued slate at rest, brand-blue when the pill is active */}
          <button
            type="button"
            aria-label="Play storms_master_24-96.wav"
            className={[
              "w-9 h-9 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors",
              active ? "bg-[#319ED8] text-white" : "bg-slate-200/70 text-slate-500",
            ].join(" ")}
          >
            <Play className="w-4 h-4 translate-x-[1px] fill-current" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-slate-900 truncate">
              storms_master_24-96.wav
            </div>
            <div className="text-[11px] text-slate-500">
              24-bit · 96 kHz · 4:12 · 47.3 MB
            </div>
          </div>

          {/* Replace — the "ghost pill" pattern.
              Apple HIG default for secondary actions on an existing item:
              ALWAYS visible (so users know what's available) but quiet at
              rest, only lifting on hover. Same treatment as Snippet's
              "Import" button, the Override/Add-gear buttons in Credits,
              and the pencil edit button — one secondary-action vocabulary
              across every surface.

              Three states:
                rest          → slate-400 text, transparent bg + border
                row-active    → slate-700 text, white bg, slate-200 border
                                (subtle lift signaling "this is the action")
                button-hover  → slate-100 bg, slate-900 text (commit hint)

              Menu-open is folded into row-active so the pill never
              disappears mid-click. */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className={[
                "px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold inline-flex items-center gap-1 transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40",
                active
                  ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  : "bg-transparent border-transparent text-slate-400 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              <Upload className="w-3 h-3" />
              Replace
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 mt-1 z-20 w-56 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden text-left">
                  <button className="w-full flex items-start gap-2 px-3 py-2 text-[12px] hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Upload from this device
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        .wav · .aiff · .flac
                      </div>
                    </div>
                  </button>
                  <div className="border-t border-slate-100" />
                  <button className="w-full flex items-start gap-2 px-3 py-2 text-[12px] hover:bg-slate-50">
                    <LinkIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                    <div>
                      <div className="font-semibold text-slate-900">
                        Paste a link
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        Dropbox · Drive · any URL
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {dragOver && (
            <div className="absolute inset-0 rounded-md bg-[#319ED8]/10 flex items-center justify-center text-[12px] font-semibold text-[#319ED8] pointer-events-none">
              Drop to replace master
            </div>
          )}
        </div>
        </>
      ) : (
        <button className="w-full px-3 py-6 rounded-md border-2 border-dashed border-slate-300 hover:border-[#319ED8] hover:bg-[#319ED8]/5 text-[12.5px] font-semibold text-slate-500 hover:text-[#319ED8]">
          <Upload className="w-4 h-4 mx-auto mb-1" />
          Drop a WAV, AIFF, or FLAC master here, or click to choose
        </button>
      )}
    </DetailWrap>
  );
}

function SnippetDetail({
  hasMaster,
  hasCustomSnippet,
  onGoToMaster,
  onClose,
}: {
  hasMaster: boolean;
  hasCustomSnippet: boolean;
  onGoToMaster: () => void;
  onClose: () => void;
}) {
  // No master = nothing to scrub. Show the same waveform skeleton (so the
  // layout doesn't jump when a master is later uploaded) but with flat,
  // dimmed bars and a brand-blue callout that links straight back to the
  // Master tile. Mirrors the Apple pattern of "show the empty slot, name
  // the unlock, point at the action."
  if (!hasMaster) {
    return (
      <DetailWrap title="30-sec snippet" onClose={onClose}>
        <div className="-mt-1 rounded-lg bg-[#319ED8]/5 border border-[#319ED8]/20 px-3 py-2.5 flex items-start gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#319ED8]/10 text-[#319ED8] inline-flex items-center justify-center flex-shrink-0">
            <Upload className="w-4 h-4" />
          </span>
          <div className="text-[11.5px] leading-snug flex-1 min-w-0">
            <div className="font-semibold text-slate-900">
              Snippet picker unlocks after the master
            </div>
            <div className="text-slate-600 mt-0.5">
              Once you{" "}
              <button
                onClick={onGoToMaster}
                className="font-semibold text-[#319ED8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40 rounded"
              >
                upload the master track
              </button>
              , drag the yellow window anywhere on the waveform to pick your
              30-second preview. Or leave it auto.
            </div>
          </div>
        </div>

        {/* Skeleton waveform — same shape and timecode axis as the live one,
            but bars sit at a flat 20% height and everything is non-interactive.
            Padlock is dimmed; preview play is hidden (nothing to preview). */}
        <div className="flex items-center gap-2 opacity-60 pointer-events-none">
          <span
            aria-hidden
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center flex-shrink-0"
          >
            <Play className="w-3.5 h-3.5 translate-x-[1px] fill-current" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="relative h-20 rounded-md bg-slate-50 border border-dashed border-slate-200 px-2 overflow-hidden">
              <div className="absolute inset-x-2 inset-y-2 flex items-center justify-between gap-[1px]">
                {WAVE_BARS.map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 bg-slate-200 rounded-full"
                    style={{ height: `20%` }}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[9px] tabular-nums text-slate-300 mt-1 px-2">
              <span>0:00</span>
              <span>—</span>
              <span>—</span>
              <span>—</span>
              <span>—</span>
            </div>
          </div>
          <span aria-hidden className="text-slate-300 flex-shrink-0">
            <Lock className="w-4 h-4" />
          </span>
        </div>
      </DetailWrap>
    );
  }

  /* iMovie-style trim row: play · waveform · lock.
     Total clip 4:12 = 252s · window = 30s (= 11.9% of width).
     Drag anywhere inside the yellow window to slide; the chip updates live.
     Type into the chip to fine-tune; the window snaps to the new position.
     Locking freezes the clip and hides the chip; preview always works. */
  const TOTAL_SEC = 252; // 4:12
  const WINDOW_SEC = 30;
  const width = (WINDOW_SEC / TOTAL_SEC) * 100;

  // Two state pairs, not one:
  //   committedLeft → what fans actually hear (the "live" snippet position)
  //   draftLeft     → what the artist is editing right now (autosaved locally)
  // Locked = saved & frozen. Unlocked = editing. Drag while unlocked drifts
  // draft away from committed → "Unsaved changes" banner appears with
  // [Save & lock] + [Revert]. Tapping the padlock when dirty saves & locks
  // in one move (so padlock + Save & lock = the same action). When this
  // graduates to AdminAlbum we'll persist `draftLeft` to localStorage
  // (key: `gt:snippet-draft:t_${trackId}`) so a browser crash or accidental
  // tab-close restores the in-progress edit on next open.
  const initialPos = hasCustomSnippet ? 33 : 0;
  const [committedLeft, setCommittedLeft] = useState(initialPos);
  const [draftLeft, setDraftLeft] = useState(initialPos);
  const [locked, setLocked] = useState(true);
  // Sheet that appears when the user tries to close while dirty —
  // Apple action-sheet style: Save & close · Discard · Cancel.
  const [confirmClose, setConfirmClose] = useState(false);

  const isDirty = Math.abs(draftLeft - committedLeft) > 0.5;
  const maxLeft = 100 - width;

  const wfRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);

  const draftSec = (draftLeft / 100) * TOTAL_SEC;
  const committedSec = (committedLeft / 100) * TOTAL_SEC;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const draftStartLabel = fmt(draftSec);
  const draftEndLabel = fmt(draftSec + WINDOW_SEC);
  const committedStartLabel = fmt(committedSec);
  const committedEndLabel = fmt(committedSec + WINDOW_SEC);

  // Chip input — controlled, synced from drag, parsed on commit
  const [chipDraft, setChipDraft] = useState(draftStartLabel);
  useEffect(() => {
    setChipDraft(draftStartLabel);
  }, [draftStartLabel]);

  const commitChip = () => {
    const m = chipDraft.match(/^(\d+):(\d{1,2})$/);
    if (!m) {
      setChipDraft(draftStartLabel);
      return;
    }
    const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const clamped = Math.max(0, Math.min(TOTAL_SEC - WINDOW_SEC, sec));
    setDraftLeft((clamped / TOTAL_SEC) * 100);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    dragRef.current = { startX: e.clientX, startLeft: draftLeft };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !wfRef.current) return;
    const rect = wfRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
    const next = Math.max(
      0,
      Math.min(maxLeft, dragRef.current.startLeft + dxPct),
    );
    setDraftLeft(next);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };

  // Save = commit the draft as the new live position AND lock the slider.
  // One action does two things because they're really the same intent:
  // "I'm done; this is the version fans hear; freeze it."
  const saveAndLock = () => {
    setCommittedLeft(draftLeft);
    setLocked(true);
  };
  // Revert = throw away the in-progress edit. Draft snaps back to live.
  // Stays unlocked so the artist can keep editing if they want; if they
  // wanted to exit, they'd tap the padlock or close the panel.
  const revertDraft = () => {
    setDraftLeft(committedLeft);
  };
  // Padlock: pure UI lock-toggle when clean, save+lock when dirty.
  const onPadlockClick = () => {
    if (isDirty) saveAndLock();
    else setLocked((v) => !v);
  };
  // Close guard: dirty close pops a confirm sheet. Clean close just closes.
  const guardedClose = () => {
    if (isDirty) setConfirmClose(true);
    else onClose();
  };
  return (
    <DetailWrap
      title="30-sec snippet"
      onClose={guardedClose}
      action={
        /* X close button — runs `guardedClose`, so a dirty close pops the
           confirm sheet. Tapping the Snippet status badge again still
           dismisses the panel via the parent's setOpenSection(null) (i.e.
           bypasses the guard) — when this graduates to AdminAlbum we'll
           intercept the parent close path too. For the mockup, the X is
           the primary "I'm done with this panel" affordance and the
           dirty banner above the waveform makes the save model obvious. */
        <button
          onClick={guardedClose}
          aria-label="Close snippet panel"
          title="Close"
          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          data-testid="button-snippet-close"
        >
          <X className="w-4 h-4" />
        </button>
      }
    >
      {/* Five-state header (Bill's Option B "draft + live" model):
          1. locked + committed=auto         → blue tip pointing at the padlock
          2. unlocked + committed=auto + clean → blue MoveHorizontal "drag to pick" tip
          3. unlocked + dirty (draft≠live)   → NEW "Unsaved changes" banner
                                               with Save & lock · Revert
          4. unlocked + clean + committed>0  → "Custom hook at X–Y" plain status
          5. locked + committed>0            → "Locked in at X–Y" plain status
          Apple-style tip cards (not pulsing animations) — discoverable
          on first open, never nag on repeat visits. */}
      {locked && committedLeft < 0.5 ? (
        <div className="-mt-1 rounded-lg bg-[#319ED8]/5 border border-[#319ED8]/20 px-3 py-2.5 flex items-start gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#319ED8]/10 text-[#319ED8] inline-flex items-center justify-center flex-shrink-0">
            <Lock className="w-4 h-4" />
          </span>
          <div className="text-[11.5px] leading-snug flex-1 min-w-0">
            <div className="font-semibold text-slate-900">
              Auto-locked at 0:00–0:30
            </div>
            <div className="text-slate-600 mt-0.5">
              We've set your 30-second preview to the first 30 seconds — no
              action needed. Want to pick a different hook? Tap the{" "}
              <Lock className="inline w-3 h-3 -translate-y-0.5 text-emerald-600" />{" "}
              padlock on the right, then drag the yellow window.
            </div>
          </div>
        </div>
      ) : isDirty ? (
        /* The "unsaved changes" banner — brand-blue surface, not amber:
           amber is reserved for the editing window itself (the moving piece).
           Two actions, gap + hairline divider keeps the safe Save action
           away from the destructive Revert per the design system rule. */
        <div className="-mt-1 rounded-lg bg-[#319ED8]/5 border border-[#319ED8]/20 px-3 py-2.5 flex items-start gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#319ED8]/10 text-[#319ED8] inline-flex items-center justify-center flex-shrink-0">
            <MoveHorizontal className="w-4 h-4" />
          </span>
          <div className="text-[11.5px] leading-snug flex-1 min-w-0">
            <div className="font-semibold text-slate-900">
              Unsaved changes
            </div>
            <div className="text-slate-600 mt-0.5">
              You moved the window to{" "}
              <span className="font-semibold tabular-nums text-slate-900">
                {draftStartLabel}–{draftEndLabel}
              </span>
              . Fans still hear{" "}
              <span className="tabular-nums">
                {committedLeft < 0.5
                  ? "0:00–0:30"
                  : `${committedStartLabel}–${committedEndLabel}`}
              </span>{" "}
              until you save.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={saveAndLock}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#319ED8] text-white hover:bg-[#319ED8]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
                data-testid="button-snippet-save"
              >
                <Lock className="w-3 h-3" />
                Save &amp; lock
              </button>
              <span className="w-px h-4 bg-slate-300/70" aria-hidden />
              <button
                onClick={revertDraft}
                className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
                data-testid="button-snippet-revert"
                title="Discard your changes and go back to what fans hear now"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      ) : !locked && committedLeft < 0.5 ? (
        <div className="-mt-1 rounded-lg bg-[#319ED8]/5 border border-[#319ED8]/20 px-3 py-2.5 flex items-start gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#319ED8]/10 text-[#319ED8] inline-flex items-center justify-center flex-shrink-0">
            <MoveHorizontal className="w-4 h-4" />
          </span>
          <div className="text-[11.5px] leading-snug flex-1 min-w-0">
            <div className="font-semibold text-slate-900">
              Pick your 30-second preview
            </div>
            <div className="text-slate-600 mt-0.5">
              Drag the yellow window anywhere on the waveform to start it
              from a different spot — it stays locked to 30 sec wide. Tap
              the padlock again when you're satisfied.
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[11.5px] text-slate-500 -mt-1">
          {locked
            ? `Locked in at ${committedStartLabel}–${committedEndLabel}. Tap the padlock to slide it again.`
            : `Custom hook at ${committedStartLabel}–${committedEndLabel}. Drag to edit, then tap the padlock to save.`}
        </p>
      )}

      {/* Trim row: play · waveform · lock — Apple iMovie pattern */}
      <div className="flex items-center gap-2">
        <button
          aria-label="Preview snippet"
          title="Preview snippet"
          className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center justify-center flex-shrink-0"
        >
          <Play className="w-3.5 h-3.5 translate-x-[1px] fill-current" />
        </button>

        <div className="flex-1 min-w-0">
          {/* Waveform area — no side handles (fixed 30-sec window, the whole
              rectangle is the grab target). Timecode axis sits below it, not behind it. */}
          <div
            ref={wfRef}
            className="relative h-20 rounded-md bg-slate-50 border border-slate-200 px-2 overflow-hidden touch-none select-none"
          >
            <div className="absolute inset-x-2 inset-y-2 flex items-center justify-between gap-[1px]">
              {WAVE_BARS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-slate-300 rounded-full"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>

            {/* Floating start-time chip — editable. Tracks the window's left edge live.
                Type to fine-tune, or just drag the window. */}
            {!locked && (
              <div
                className="absolute -top-1 -translate-y-full after:content-[''] after:absolute after:left-2 after:-bottom-1 after:border-4 after:border-transparent after:border-t-slate-800 transition-[left] duration-0"
                style={{ left: `calc(${draftLeft}% + 4px)` }}
              >
                <input
                  value={chipDraft}
                  onChange={(e) => setChipDraft(e.target.value)}
                  onBlur={commitChip}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setChipDraft(draftStartLabel);
                      (e.target as HTMLInputElement).blur();
                    }
                    // Arrow keys nudge by ±1 sec (or ±5 sec with shift). Apple inspector pattern.
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const step = e.shiftKey ? 5 : 1;
                      const dir = e.key === "ArrowUp" ? 1 : -1;
                      const next = Math.max(
                        0,
                        Math.min(TOTAL_SEC - WINDOW_SEC, draftSec + dir * step),
                      );
                      setDraftLeft((next / TOTAL_SEC) * 100);
                    }
                  }}
                  aria-label="Snippet start time — type to fine-tune"
                  title="Type to fine-tune (mm:ss)"
                  className="w-[42px] px-1.5 py-0.5 rounded-md bg-slate-800 text-white text-[10px] font-semibold tabular-nums text-center shadow-md focus:outline-none focus:ring-2 focus:ring-[#319ED8]/60 cursor-text"
                />
              </div>
            )}

            {/* Ghost of the committed (live) window — only visible while
                dirty + unlocked. Helps the artist see where fans currently
                hear the snippet vs. where they've dragged it to. */}
            {isDirty && !locked && (
              <div
                aria-hidden
                className="absolute top-1 bottom-1 rounded-md border border-emerald-500/40 bg-emerald-500/5 pointer-events-none"
                style={{ left: `${committedLeft}%`, width: `${width}%` }}
                title={`Fans currently hear ${committedLeft < 0.5 ? "0:00–0:30" : `${committedStartLabel}–${committedEndLabel}`}`}
              />
            )}

            {/* 30-sec window — drag anywhere inside to slide.
                No side handles: nothing to imply resizing. */}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={[
                "absolute top-1 bottom-1 rounded-md border-2 transition-colors",
                locked
                  ? "border-emerald-500/70 bg-emerald-500/20 cursor-default"
                  : "border-amber-400 bg-amber-400/25 cursor-grab active:cursor-grabbing shadow-[0_0_0_3px_rgba(251,191,36,0.15)]",
              ].join(" ")}
              style={{ left: `${draftLeft}%`, width: `${width}%` }}
            />
          </div>
          {/* Timecode axis — own row, won't be covered by the window */}
          <div className="flex justify-between text-[9px] tabular-nums text-slate-400 mt-1 px-2">
            <span>0:00</span>
            <span>1:03</span>
            <span>2:06</span>
            <span>3:09</span>
            <span>4:12</span>
          </div>
        </div>

        <button
          onClick={onPadlockClick}
          aria-label={
            locked
              ? "Unlock snippet — allow sliding"
              : isDirty
                ? "Save and lock snippet"
                : "Lock snippet in"
          }
          title={
            locked
              ? "Unlock to slide again"
              : isDirty
                ? "Save & lock — commits your edit"
                : "Lock in when done"
          }
          className={[
            "w-8 h-8 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors hover:bg-slate-100",
            locked ? "text-emerald-600" : "text-amber-600",
          ].join(" ")}
          data-testid="button-snippet-padlock"
        >
          {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Close-while-dirty confirm — Apple action-sheet pattern. Three
          choices, destructive (Discard) gets rose tint per design system,
          Save is the primary brand-blue action, Cancel is ghost. */}
      {confirmClose && (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-slate-900/40 rounded-2xl">
          <div className="w-full bg-white rounded-b-2xl rounded-t-xl shadow-2xl border-t border-slate-200 p-4 space-y-3">
            <div>
              <div className="text-[13px] font-semibold text-slate-900">
                Save your snippet edit?
              </div>
              <div className="text-[11.5px] text-slate-500 mt-0.5">
                You moved the window to{" "}
                <span className="font-semibold tabular-nums">
                  {draftStartLabel}–{draftEndLabel}
                </span>
                . If you close without saving, fans keep hearing{" "}
                <span className="tabular-nums">
                  {committedLeft < 0.5
                    ? "0:00–0:30"
                    : `${committedStartLabel}–${committedEndLabel}`}
                </span>
                .
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  saveAndLock();
                  setConfirmClose(false);
                  onClose();
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold bg-[#319ED8] text-white hover:bg-[#319ED8]/90"
                data-testid="button-confirm-save-close"
              >
                <Lock className="w-3.5 h-3.5" />
                Save &amp; close
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setDraftLeft(committedLeft);
                    setConfirmClose(false);
                    onClose();
                  }}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md text-[12px] font-semibold text-rose-600 hover:bg-rose-50"
                  data-testid="button-confirm-discard"
                >
                  Discard changes
                </button>
                {/* Hairline divider — design-system rule: destructive
                    action keeps breathing room from non-destructive ones. */}
                <span className="w-px h-6 bg-slate-200" aria-hidden />
                <button
                  onClick={() => setConfirmClose(false)}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-100"
                  data-testid="button-confirm-cancel"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DetailWrap>
  );
}

function LyricsDetail({
  hasLyrics,
  onClose,
}: {
  hasLyrics: boolean;
  onClose: () => void;
}) {
  const seed = hasLyrics
    ? `[Verse 1]\nThe storms came in across the bay\nI didn't know what to say\n\n[Chorus]\nAnd I'd weather them all for you\nAnd I'd weather them all for you`
    : "";
  const [text, setText] = useState(seed);
  const [url, setUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // 'plain' = no timing · 'syncing' = forced-alignment call in flight · 'synced' = GoodSync™ (word-level VTT stored)
  const [syncState, setSyncState] = useState<"plain" | "syncing" | "synced">(
    "plain",
  );
  // Once GoodSync™'d, the synced view becomes the source of truth — each line
  // is editable in place, keeping its own timestamp. The plain textarea is hidden.
  type Cue = { id: string; timeMs: number; text: string; isHeader: boolean };
  const [cues, setCues] = useState<Cue[]>([]);
  const [cuesBaseline, setCuesBaseline] = useState<Cue[]>([]);
  const plainDirty = text !== seed;
  const cuesDirty =
    JSON.stringify(cues.map((c) => c.text)) !==
    JSON.stringify(cuesBaseline.map((c) => c.text));
  const dirty = syncState === "synced" ? cuesDirty : plainDirty;
  const canSync = text.trim().length > 0 && syncState !== "syncing";
  const fmtTime = (ms: number) => {
    const total = ms / 1000;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
  };
  const handleAutoSync = () => {
    setSyncState("syncing");
    // mock: forced-aligner round trip ~2s. Real call goes to ElevenLabs Forced Alignment API.
    setTimeout(() => {
      // Derive mocked cues from current text by distributing timestamps across
      // the song's duration — same shape the real endpoint returns from ElevenLabs.
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const realLines = lines.filter((l) => !/^\[.+\]$/.test(l));
      const DURATION_S = 252; // matches the 4:12 mocked master
      let realIdx = 0;
      const next: Cue[] = lines.map((l, i) => {
        const isHeader = /^\[.+\]$/.test(l);
        const timeMs = isHeader
          ? 0
          : Math.round(((realIdx + 1) * DURATION_S * 1000) / (realLines.length + 1));
        if (!isHeader) realIdx++;
        return { id: `c${i}`, timeMs, text: l, isHeader };
      });
      setCues(next);
      setCuesBaseline(next);
      setSyncState("synced");
    }, 2000);
  };
  const updateCue = (id: string, newText: string) => {
    setCues((prev) => prev.map((c) => (c.id === id ? { ...c, text: newText } : c)));
  };
  // Transcribe — used when no lyrics text exists yet. ElevenLabs Scribe returns
  // a word-level transcript; we group into lines and drop straight into the
  // synced editor. The admin then corrects any misheard words inline —
  // timestamps stay locked because they're tied to the audio, not the chars.
  const hasText = text.trim().length > 0;
  const handleTranscribe = () => {
    setSyncState("syncing");
    setTimeout(() => {
      const mockText =
        "The storms came in across the bay\nI didn't know what to say\nAnd I'd weather them all for you\nAnd I'd weather them all for you";
      setText(mockText);
      const lines = mockText.split("\n");
      const DURATION_S = 252;
      const next: Cue[] = lines.map((l, i) => ({
        id: `t${i}`,
        timeMs: Math.round(((i + 1) * DURATION_S * 1000) / (lines.length + 1)),
        text: l,
        isHeader: false,
      }));
      setCues(next);
      setCuesBaseline(next);
      setSyncState("synced");
    }, 2500);
  };
  // Re-sync — re-runs forced alignment on the current cue text. Used when an
  // admin has fixed enough lines that timing might have drifted. Cheaper than
  // a full transcription since we already have the text — same code path as
  // Upgrade, just from the cue list instead of the textarea.
  const handleResync = () => {
    const flatText = cues.map((c) => c.text).join("\n");
    setText(flatText);
    setSyncState("syncing");
    setTimeout(() => {
      const lines = flatText.split("\n").map((l) => l.trim()).filter(Boolean);
      const realLines = lines.filter((l) => !/^\[.+\]$/.test(l));
      const DURATION_S = 252;
      let realIdx = 0;
      const next: Cue[] = lines.map((l, i) => {
        const isHeader = /^\[.+\]$/.test(l);
        const timeMs = isHeader
          ? 0
          : Math.round(((realIdx + 1) * DURATION_S * 1000) / (realLines.length + 1));
        if (!isHeader) realIdx++;
        return { id: `r${i}`, timeMs, text: l, isHeader };
      });
      setCues(next);
      setCuesBaseline(next);
      setSyncState("synced");
    }, 2000);
  };

  const importAction = (
    <div className="relative">
      <button
        onClick={() => setImportOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100"
      >
        <Upload className="w-3 h-3" />
        Import
      </button>
      {importOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setImportOpen(false)} aria-hidden />
          <div className="absolute right-0 mt-1 z-20 w-72 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden text-left">
            <label className="w-full flex items-start gap-2 px-3 py-2 text-[12px] hover:bg-slate-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
              <div className="flex-1">
                <div className="font-semibold text-slate-900">Upload a file</div>
                <div className="text-[10.5px] text-slate-500">.vtt · .lrc · .srt · .txt</div>
              </div>
              <input type="file" accept=".vtt,.lrc,.srt,.txt" className="sr-only" />
            </label>
            <div className="border-t border-slate-100" />
            <div className="px-3 py-2">
              <div className="flex items-start gap-2 mb-1.5">
                <LinkIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-500" />
                <div className="font-semibold text-slate-900 text-[12px]">Paste a URL</div>
              </div>
              <div className="flex gap-1">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…/storms.vtt"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-slate-200 text-[11.5px] focus:outline-none focus:border-[#319ED8] focus:ring-2 focus:ring-[#319ED8]/20"
                />
                <button
                  disabled={!url}
                  className="px-2 py-1.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // GoodSync™ badge — same chip family as Dolby Atmos / Lossless / SuperCredits™.
  // Brand-blue solid pill, mic glyph + check, used here in the card header and
  // intended to graduate to album covers / song rows / library filter ("Albums with GoodSync™").
  const goodSyncBadge = (
    <span
      title="Word-level synced to the master audio"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#319ED8] text-white text-[10.5px] font-bold uppercase tracking-wider shadow-sm"
    >
      <Mic className="w-3 h-3" />
      GoodSync™
      <CheckIcon className="w-3 h-3 -ml-0.5" strokeWidth={3} />
    </span>
  );

  const titleAction =
    syncState === "synced" ? (
      <div className="flex items-center gap-1.5">{goodSyncBadge}{importAction}</div>
    ) : (
      importAction
    );

  return (
    <DetailWrap title="Lyrics" onClose={onClose} action={titleAction}>
      {syncState === "synced" ? (
        // -- Upgraded state: synced view is now the source of truth. Each line
        // -- shows its timestamp and is editable in place. A small ↻ on hover
        // -- re-times that single line (cheap) instead of the whole song.
        <div className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <button
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11.5px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/10"
              title="Play the master with the synced lyrics highlighting"
            >
              <PlayIcon className="w-3.5 h-3.5 fill-current" />
              Preview
            </button>
            <span className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400">
              {cues.filter((c) => !c.isHeader).length} cues · word-level timing
            </span>
          </div>
          <div className="rounded-md border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {cues.map((cue) => (
              <div
                key={cue.id}
                className={[
                  "group flex items-center gap-3 px-3 py-1.5 hover:bg-slate-50",
                  cue.isHeader ? "bg-slate-50/60" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "font-mono tabular-nums text-[10.5px] flex-shrink-0 w-14",
                    cue.isHeader ? "text-slate-300" : "text-slate-400",
                  ].join(" ")}
                >
                  {cue.isHeader ? "——:——" : fmtTime(cue.timeMs)}
                </span>
                <input
                  value={cue.text}
                  onChange={(e) => updateCue(cue.id, e.target.value)}
                  className={[
                    "flex-1 min-w-0 bg-transparent focus:outline-none",
                    cue.isHeader
                      ? "text-[10.5px] uppercase tracking-wider font-semibold text-slate-500"
                      : "text-[12.5px] text-slate-900 font-mono",
                  ].join(" ")}
                />
                {!cue.isHeader && (
                  <button
                    title="Re-time this line"
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-[#319ED8] p-1 -mr-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        // -- Plain / syncing state: single textarea. Drag a .vtt/.lrc over it
        // -- to import; overlay only appears while dragging.
        <div
          className="relative"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={syncState === "syncing"}
            placeholder="Paste lyrics here, drop a .vtt/.lrc file, or hit Transcribe & GoodSync™ to let ElevenLabs listen to the master and write the lyrics for you. Use [Verse 1], [Chorus] for section headers."
            rows={8}
            className={[
              "w-full px-3 py-2 rounded-md border bg-white text-[12.5px] leading-relaxed text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20 transition-colors",
              dragOver ? "border-[#319ED8] ring-2 ring-[#319ED8]/20" : "border-slate-200 focus:border-[#319ED8]",
              syncState === "syncing" ? "opacity-60 cursor-not-allowed" : "",
            ].join(" ")}
          />
          {dragOver && (
            <div className="absolute inset-0 rounded-md bg-[#319ED8]/10 flex flex-col items-center justify-center text-[#319ED8] pointer-events-none">
              <Upload className="w-5 h-5 mb-1" />
              <span className="text-[12px] font-semibold">Drop to import lyrics</span>
              <span className="text-[10.5px]">.vtt · .lrc · .srt · .txt</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Plain idle: text-aware CTA.
              - No text yet  → "Transcribe & GoodSync™" (ElevenLabs Scribe writes the lyrics + times them)
              - Has text     → "Upgrade to GoodSync™" (forced alignment on the text you supplied) */}
          {syncState === "plain" && !hasText && (
            <button
              onClick={handleTranscribe}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-white border border-[#319ED8] text-[#319ED8] hover:bg-[#319ED8]/5"
            >
              <Mic className="w-3 h-3" />
              Transcribe &amp; GoodSync™
            </button>
          )}
          {syncState === "plain" && hasText && (
            <button
              onClick={handleAutoSync}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-white border border-[#319ED8] text-[#319ED8] hover:bg-[#319ED8]/5"
            >
              <Sparkles className="w-3 h-3" />
              Upgrade to GoodSync™
            </button>
          )}
          {syncState === "syncing" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-[#319ED8]/10 text-[#319ED8]">
              <Loader2 className="w-3 h-3 animate-spin" />
              {hasText ? "Upgrading to GoodSync™…" : "Transcribing & syncing…"}
            </span>
          )}
          {syncState === "synced" && (
            <button
              onClick={handleResync}
              title="Re-run alignment using the current line text"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className="w-3 h-3" />
              Re-sync
            </button>
          )}
        </div>

        {/* Save — Apple-ghost style: dimmed text at rest, brand-blue solid when dirty. No underline. */}
        <button
          disabled={!dirty}
          className={
            dirty
              ? "inline-flex items-center px-3 py-1.5 rounded-md text-[11.5px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8]"
              : "inline-flex items-center px-3 py-1.5 text-[11.5px] font-semibold text-slate-400 cursor-not-allowed"
          }
        >
          Save
        </button>
      </div>
    </DetailWrap>
  );
}

function CreditsDetail({
  hasCredits,
  onClose,
}: {
  hasCredits: boolean;
  onClose: () => void;
}) {
  // Song · Performance · Production — three buckets, royalty-aligned,
  // matches what fans see on liner notes + Apple Music expanded credits.
  //
  //   Song        → who wrote it. Earns mechanical/publishing royalties.
  //   Performance → who's on the record. Featured/neighboring-rights bucket.
  //                 SuperCredits™ instrument-tagging lives here.
  //   Production  → who shaped how it sounds. Mostly work-for-hire.
  //
  // Why three (not flat): fans on liner notes scan by tier already
  // (writers up top, players in the middle, technical credits at the
  // bottom). Grouping mirrors that and removes the "is Mix engineer a
  // performer or…?" decision the admin currently has to make.
  type BucketKey = "song" | "performance" | "production";
  // `quickPicks` = chips pinned at the top of the picker (the 3–4 most
  // common roles for this bucket). `catalog` = the full alphabetized
  // industry-standard list, shown scrollable + filterable below the
  // search box so an artist isn't flying blind when they can't remember
  // the right word ("topliner? co-writer? adapter?").
  //
  // CATALOG SOURCE — for now this is a hand-curated industry list per
  // bucket. Future swap: DDEX `ContributorRole` taxonomy (the label/DSP
  // standard; ~80+ roles) or muso.ai's role list when MUSO_API_KEY is
  // wired. ASCAP is too narrow — writers/publishers only. Whichever we
  // pick, the picker UI doesn't change; only this array does.
  const BUCKETS: {
    key: BucketKey;
    label: string;
    blurb: string;
    quickPicks: string[];
    catalog: string[];
  }[] = [
    {
      key: "song",
      label: "Song",
      blurb: "Who wrote it.",
      quickPicks: ["Composer", "Lyricist", "Arranger"],
      catalog: [
        "Adapter",
        "Arranger",
        "Composer",
        "Co-writer",
        "Librettist",
        "Lyricist",
        "Sample originator",
        "Songwriter",
        "Topliner",
        "Translator",
      ],
    },
    {
      key: "performance",
      label: "Performance",
      blurb: "Who's on the record.",
      quickPicks: ["Lead vocals", "Backing vocals", "Acoustic guitar", "Drums"],
      catalog: [
        "Accordion",
        "Acoustic guitar",
        "Backing vocals",
        "Banjo",
        "Bass",
        "Bass guitar",
        "Cello",
        "Choir",
        "Clarinet",
        "Double bass",
        "Drums",
        "Electric guitar",
        "Featured artist",
        "Fiddle",
        "Flute",
        "Guest vocals",
        "Harmonica",
        "Harp",
        "Horns",
        "Keys",
        "Lead vocals",
        "Mandolin",
        "Organ",
        "Pedal steel",
        "Percussion",
        "Piano",
        "Saxophone",
        "Slide guitar",
        "Strings",
        "Synthesizer",
        "Trombone",
        "Trumpet",
        "Turntables",
        "Ukulele",
        "Upright bass",
        "Viola",
        "Violin",
      ],
    },
    {
      key: "production",
      label: "Production",
      blurb: "Who shaped how it sounds.",
      quickPicks: ["Producer", "Mix engineer", "Master engineer", "Recorded by"],
      catalog: [
        "A&R",
        "Artwork",
        "Assistant engineer",
        "Conductor",
        "Co-producer",
        "Editor",
        "Engineer",
        "Executive producer",
        "Horn arranger",
        "Liner notes",
        "Master engineer",
        "Mix engineer",
        "Photography",
        "Producer",
        "Programmer",
        "Recorded at",
        "Recorded by",
        "Recording engineer",
        "Sound designer",
        "String arranger",
        "Vocal producer",
      ],
    },
  ];
  // Lookup table: role string → bucket. Case-insensitive. Checks the
  // FULL catalog (not just quickPicks), so "Pedal steel" routes to
  // Performance even though it isn't a quick-pick chip. Anything not in
  // any catalog falls back to Performance (the broadest bucket — covers
  // anything the artist invents).
  const bucketForRole = (role: string): BucketKey => {
    const r = role.trim().toLowerCase();
    for (const b of BUCKETS) {
      if (b.catalog.some((x) => x.toLowerCase() === r)) return b.key;
    }
    return "performance";
  };

  type Row = {
    name: string;
    role: string;
    instrument: string;
    source?: "album" | "track";
  };
  // Inherited from album-level credits (faded at the top of Production).
  // Both Producer + Mix engineer live in Production by definition.
  const INHERITED: Row[] = [
    { name: "Sarah Lin", role: "Producer", instrument: "", source: "album" },
    { name: "Mike Torres", role: "Mix engineer", instrument: "", source: "album" },
  ];
  const SEED: Row[] = hasCredits
    ? [
        // Song bucket — the writer credit fans see at the top of liner notes.
        { name: "James Walsh", role: "Composer", instrument: "" },
        { name: "James Walsh", role: "Lyricist", instrument: "" },
        // Performance bucket — instrument-tagged for SuperCredits™.
        { name: "James Walsh", role: "Lead vocals", instrument: "" },
        { name: "James Walsh", role: "Acoustic guitar", instrument: "1973 Martin D-28" },
        { name: "Mike Torres", role: "Drums", instrument: "Ludwig Black Beauty kit" },
      ]
    : [];
  const [trackRows, setTrackRows] = useState<Row[]>(SEED);

  const ROSTER = [
    { id: "p1", name: "James Walsh" },
    { id: "p2", name: "Sarah Lin" },
    { id: "p3", name: "Mike Torres" },
    { id: "p4", name: "Ana Reyes" },
  ];

  // Picker state. addingBucket = which bucket's "+ Add" was tapped (null
  // = picker closed). pickedRole = phase 2 (we have a role, now picking a
  // person). The bucket scopes the role-chip suggestions in phase 1.
  const [addingBucket, setAddingBucket] = useState<BucketKey | null>(null);
  const [pickedRole, setPickedRole] = useState<string | null>(null);
  const [roleQuery, setRoleQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");

  const handleOpenAdd = (bucket: BucketKey) => {
    setAddingBucket(bucket);
    setPickedRole(null);
    setRoleQuery("");
    setPersonQuery("");
  };
  const handlePickRole = (role: string) => {
    setPickedRole(role);
    setRoleQuery("");
    setPersonQuery("");
  };
  const handleAddCredit = (name: string) => {
    if (!pickedRole) return;
    setTrackRows((r) => [
      ...r,
      { name: name.trim(), role: pickedRole, instrument: "" },
    ]);
    setAddingBucket(null);
    setPickedRole(null);
    setPersonQuery("");
  };
  const handleCancelRole = () => {
    // From phase 2 → back to phase 1 (still in the same bucket).
    setPickedRole(null);
    setPersonQuery("");
  };
  const handleCloseAdd = () => {
    setAddingBucket(null);
    setPickedRole(null);
    setRoleQuery("");
    setPersonQuery("");
  };

  const initials = (n: string) =>
    n
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join("")
      .toUpperCase();

  // Override rule: if a track-level row exists for the same role, the
  // album-level one is suppressed (per-track wins, like Apple Music's
  // override behavior). Keeps inherited Producer until the user adds
  // their own Producer credit on this specific track.
  const overriddenRoles = new Set(
    trackRows.map((r) => r.role.toLowerCase()),
  );
  const visibleInherited = INHERITED.filter(
    (r) => !overriddenRoles.has(r.role.toLowerCase()),
  );

  // Group all rows by bucket. Inherited rows always come first within
  // their bucket so the override CTA stays visible above any user-added
  // overrides.
  const rowsByBucket: Record<BucketKey, Row[]> = {
    song: [],
    performance: [],
    production: [],
  };
  for (const r of visibleInherited) rowsByBucket[bucketForRole(r.role)].push(r);
  for (const r of trackRows) rowsByBucket[bucketForRole(r.role)].push(r);

  const personMatches = ROSTER.filter((p) =>
    p.name.toLowerCase().includes(personQuery.trim().toLowerCase()),
  );
  const showCreatePerson =
    personQuery.trim().length > 0 &&
    !ROSTER.some(
      (p) => p.name.toLowerCase() === personQuery.trim().toLowerCase(),
    );

  return (
    <DetailWrap title="Credits" onClose={onClose}>
      <div className="space-y-5">
        {BUCKETS.map((bucket) => {
          const rows = rowsByBucket[bucket.key];
          const isAdding = addingBucket === bucket.key;
          // Quick-pick chips at the top of the picker are FIXED (no
          // filter) — they're always the 3–4 most common roles for the
          // bucket. The scrollable catalog list below the search box is
          // what filters as the artist types.
          const q = roleQuery.trim().toLowerCase();
          const catalogMatches = q
            ? bucket.catalog.filter((r) => r.toLowerCase().includes(q))
            : bucket.catalog;
          const showCustomRole =
            q.length > 0 &&
            !bucket.catalog.some((r) => r.toLowerCase() === q);
          return (
            <section key={bucket.key}>
              {/* Bucket header — uppercase 10pt label + small blurb, with
                  a hairline divider trailing off to the right. Same vocab
                  as the REQUIRED / OPTIONAL headers on the tile grid so
                  the surface feels consistent. */}
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {bucket.label}
                </span>
                <span className="text-[11px] text-slate-400">
                  {bucket.blurb}
                </span>
                <span className="h-px flex-1 bg-slate-200 self-center" aria-hidden />
                <span className="text-[10.5px] font-semibold text-slate-400">
                  {rows.filter((r) => r.source !== "album").length}
                </span>
              </div>

              {rows.length > 0 ? (
                <ul className="space-y-1.5">
                  {rows.map((r, i) => {
                    const fromAlbum = r.source === "album";
                    return (
                      <li
                        key={`${r.source ?? "track"}-${r.name}-${r.role}-${i}`}
                        className={[
                          "flex items-center gap-3 p-2 rounded-md",
                          fromAlbum ? "bg-slate-50/60" : "hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "w-8 h-8 rounded-full text-white text-[11px] font-bold inline-flex items-center justify-center flex-shrink-0",
                            fromAlbum
                              ? "bg-slate-300"
                              : "bg-gradient-to-br from-[#319ED8] to-[#7F10A7]",
                          ].join(" ")}
                        >
                          {initials(r.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className={[
                              "text-[12.5px] font-semibold truncate flex items-center gap-1.5",
                              fromAlbum ? "text-slate-500" : "text-slate-900",
                            ].join(" ")}
                          >
                            {r.name}
                            {fromAlbum && (
                              <span
                                title="From album credits — override by adding the same role here."
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400"
                              >
                                Album
                              </span>
                            )}
                          </div>
                          <div
                            className={[
                              "text-[11px] truncate",
                              fromAlbum ? "text-slate-400" : "text-slate-500",
                            ].join(" ")}
                          >
                            {r.role}
                            {r.instrument ? ` · ${r.instrument}` : ""}
                          </div>
                        </div>
                        {/* Gear upsell is Performance-only. Song + Production
                            credits don't carry instrument data, so the chip
                            would just be noise there. */}
                        {!fromAlbum &&
                          !r.instrument &&
                          bucket.key === "performance" && (
                            <button
                              className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5"
                              title="Add gear to turn this into a SuperCredit™"
                            >
                              <Plus className="w-3 h-3" />
                              Add gear
                            </button>
                          )}
                        {!fromAlbum && (
                          <button
                            aria-label={`Edit ${r.name} — ${r.role}`}
                            title={`Edit ${r.name} — ${r.role}`}
                            className="w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {/* Inherited row → quick override CTA. Opens the
                            picker in this bucket pre-filled at phase 2
                            with the same role, so the user lands directly
                            on "who plays this role on THIS track?" */}
                        {fromAlbum && (
                          <button
                            onClick={() => {
                              setAddingBucket(bucket.key);
                              setPickedRole(r.role);
                              setPersonQuery("");
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10.5px] font-semibold text-slate-500 hover:text-[#319ED8] hover:bg-[#319ED8]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
                            title={`Replace the album-level ${r.role.toLowerCase()} for this track only`}
                          >
                            Override
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isAdding && (
                  <p className="text-[11.5px] text-slate-400 italic px-2 py-1">
                    {bucket.key === "song" &&
                      "No writers yet — add the composer + lyricist."}
                    {bucket.key === "performance" &&
                      "No performers yet — credit who's on the recording."}
                    {bucket.key === "production" &&
                      "No production credits yet — album-level fills these in by default."}
                  </p>
                )
              )}

              {/* Picker — opens inline at the bottom of the bucket. Phase
                  1 = role chips scoped to this bucket. Phase 2 = person
                  chips. Closing the picker (X) collapses back to the
                  "+ Add to {bucket}" CTA. */}
              {isAdding ? (
                pickedRole === null ? (
                  <div className="mt-2 rounded-md border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                        Add to {bucket.label} · pick a role
                      </div>
                      <button
                        onClick={handleCloseAdd}
                        aria-label="Cancel — close the picker"
                        title="Cancel"
                        className="w-6 h-6 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Quick picks — the 3–4 most common roles for this
                        bucket, always visible, never filtered. Lets a
                        confident artist tap-and-go in one move. */}
                    <div className="flex flex-wrap gap-1.5">
                      {bucket.quickPicks.map((role) => (
                        <button
                          key={role}
                          onClick={() => handlePickRole(role)}
                          className="inline-flex items-center px-2.5 py-1 rounded-full border border-slate-200 hover:border-[#319ED8] hover:bg-[#319ED8]/5 active:bg-[#319ED8]/10 text-[11.5px] font-medium text-slate-700"
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                    {/* Search box — drives the alphabetical catalog list
                        below. Empty = show whole catalog; typing filters
                        live. Enter picks the top match (or the custom
                        value if nothing matches). */}
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white focus-within:border-[#319ED8] focus-within:ring-2 focus-within:ring-[#319ED8]/20">
                      <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <input
                        autoFocus
                        value={roleQuery}
                        onChange={(e) => setRoleQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (catalogMatches.length > 0) {
                              handlePickRole(catalogMatches[0]);
                            } else if (roleQuery.trim()) {
                              handlePickRole(roleQuery.trim());
                            }
                          } else if (e.key === "Escape") {
                            handleCloseAdd();
                          }
                        }}
                        placeholder={`Search ${bucket.label.toLowerCase()} roles… (${bucket.catalog.length})`}
                        className="flex-1 min-w-0 bg-transparent text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none"
                      />
                    </label>
                    {/* Alphabetical catalog — scrollable list, capped at
                        ~200px so the picker never runs off the screen.
                        One row per role, 32px touch height. Tapping a
                        row advances to phase 2 (person picker). */}
                    <div className="rounded-md border border-slate-200 bg-white max-h-[200px] overflow-y-auto">
                      {catalogMatches.length === 0 ? (
                        <div className="px-3 py-6 text-center text-[11.5px] text-slate-400">
                          No matches in the {bucket.label.toLowerCase()} list.
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {catalogMatches.map((role) => (
                            <li key={role}>
                              <button
                                onClick={() => handlePickRole(role)}
                                className="w-full text-left px-3 py-2 text-[12.5px] text-slate-700 hover:bg-[#319ED8]/5 active:bg-[#319ED8]/10 focus-visible:outline-none focus-visible:bg-[#319ED8]/5"
                              >
                                {role}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {/* Custom role fallback — only appears when the query
                        doesn't match any catalog entry. Whatever the
                        artist typed becomes a brand-new role string,
                        scoped to this bucket. */}
                    {showCustomRole && (
                      <button
                        onClick={() => handlePickRole(roleQuery.trim())}
                        className="w-full inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-md border border-dashed border-[#319ED8] text-[#319ED8] text-[11.5px] font-semibold hover:bg-[#319ED8]/5"
                      >
                        <Plus className="w-3 h-3" />
                        Use “{roleQuery.trim()}” as a custom {bucket.label.toLowerCase()} role
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 rounded-md border border-[#319ED8]/40 bg-[#319ED8]/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider font-semibold text-[#319ED8]">
                          {bucket.label} · adding credit
                        </div>
                        <div className="text-[13px] font-semibold text-slate-900 truncate">
                          {bucket.key === "song"
                            ? `Who's the ${pickedRole.toLowerCase()}?`
                            : bucket.key === "production"
                              ? `Who's the ${pickedRole.toLowerCase()}?`
                              : `Who played ${pickedRole.toLowerCase()}?`}
                        </div>
                      </div>
                      {/* Two escapes: "Change role" (back to phase 1, same
                          bucket) and X (close picker entirely). */}
                      <button
                        onClick={handleCancelRole}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-white"
                      >
                        Change role
                      </button>
                      <button
                        onClick={handleCloseAdd}
                        aria-label="Cancel — close the picker"
                        title="Cancel"
                        className="w-7 h-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-white inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#319ED8]/40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white focus-within:border-[#319ED8] focus-within:ring-2 focus-within:ring-[#319ED8]/20">
                      <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <input
                        autoFocus
                        value={personQuery}
                        onChange={(e) => setPersonQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (personMatches.length > 0) {
                              handleAddCredit(personMatches[0].name);
                            } else if (personQuery.trim()) {
                              handleAddCredit(personQuery.trim());
                            }
                          } else if (e.key === "Escape") {
                            handleCancelRole();
                          }
                        }}
                        placeholder="Search your roster, or type a new name…"
                        className="flex-1 min-w-0 bg-transparent text-[12px] text-slate-700 placeholder-slate-400 focus:outline-none"
                      />
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {personMatches.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddCredit(p.name)}
                          className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 bg-white hover:border-[#319ED8] hover:bg-[#319ED8]/10 text-[11.5px] text-slate-700"
                        >
                          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#319ED8] to-[#7F10A7] text-white text-[9px] font-bold inline-flex items-center justify-center">
                            {initials(p.name)}
                          </span>
                          {p.name}
                        </button>
                      ))}
                      {showCreatePerson && (
                        <button
                          onClick={() => handleAddCredit(personQuery.trim())}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[#319ED8] text-[#319ED8] text-[11.5px] font-semibold hover:bg-[#319ED8]/5"
                        >
                          <Plus className="w-3 h-3" />
                          Create “{personQuery.trim()}”
                        </button>
                      )}
                      {!showCreatePerson && personMatches.length === 0 && (
                        <span className="text-[11.5px] text-slate-400 italic px-1 py-1">
                          No matches — keep typing to create a new person.
                        </span>
                      )}
                    </div>
                  </div>
                )
              ) : (
                <button
                  onClick={() => handleOpenAdd(bucket.key)}
                  className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-slate-300 text-[11.5px] font-semibold text-slate-500 hover:text-[#319ED8] hover:border-[#319ED8] hover:bg-[#319ED8]/5"
                >
                  <Plus className="w-3 h-3" />
                  Add to {bucket.label}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </DetailWrap>
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

type Section = "master" | "snippet" | "lyrics" | "credits" | null;

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
  const [openSection, setOpenSection] = useState<Section>(null);
  const toggleSection = (s: Section) =>
    setOpenSection(openSection === s ? null : s);
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
        {/* When collapsed: dot meter shows status at a glance.
            When expanded: meter is redundant (all 4 cards are visible), so swap
            in the destructive controls — clearly track-scoped, sitting next to the chevron. */}
        {expanded ? (
          <div className="flex items-center flex-shrink-0">
            <button
              aria-label="Hide track (parks it without losing lyrics or credits)"
              title="Hide track (parks it without losing lyrics or credits)"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
            {/* Hairline spacer so a thumb can't fall from Hide straight onto Trash */}
            <span className="mx-2 h-4 w-px bg-slate-200" aria-hidden />
            <button
              aria-label="Delete track (asks to confirm)"
              title="Delete track — asks to confirm"
              className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <StatusMeter
            t={t}
            onJumpTo={(section) => {
              // If the row is collapsed, expand it; then open the offending
              // section so the user lands directly on the empty drop zone.
              if (!expanded) onToggle();
              setOpenSection(section);
            }}
          />
        )}
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
        <div className="pl-20 pr-16 pb-5 -mt-1 space-y-4">
          {/* 1-over-3 layout (Bill's pick):
              REQUIRED group → Master sits on top, full-width, emphasized
                (taller, larger icon, heavier label). It's the gate that
                blocks publish, so it gets the loudest hierarchy.
              OPTIONAL group → Snippet · Lyrics · Credits share one row
                in compact form (icon on top, label below). They don't
                block publish, so they sit smaller and quieter. The
                snippet tile still reports ok=true because the auto
                default is real shipped state.
              REQUIRED / OPTIONAL headers above each group make the
                contract explicit at a glance. */}
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
                active={openSection === "master"}
                onClick={() => toggleSection("master")}
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
                  ok
                  icon={Scissors}
                  label="Snippet"
                  severity="soft"
                  compact
                  active={openSection === "snippet"}
                  onClick={() => toggleSection("snippet")}
                />
                <StatusBadge
                  ok={t.lyrics}
                  icon={FileText}
                  label="Lyrics"
                  severity="soft"
                  compact
                  active={openSection === "lyrics"}
                  onClick={() => toggleSection("lyrics")}
                />
                <StatusBadge
                  ok={t.credits}
                  icon={Users}
                  label="Credits"
                  severity="soft"
                  compact
                  active={openSection === "credits"}
                  onClick={() => toggleSection("credits")}
                />
              </div>
            </div>
          </div>

          {/* Detail panel for whichever section is open */}
          {openSection === "master" && (
            <MasterDetail
              hasMaster={t.master}
              onGoToSnippet={() => setOpenSection("snippet")}
              onClose={() => setOpenSection(null)}
            />
          )}
          {openSection === "snippet" && (
            <SnippetDetail
              hasMaster={t.master}
              hasCustomSnippet={t.snippet}
              onGoToMaster={() => setOpenSection("master")}
              onClose={() => setOpenSection(null)}
            />
          )}
          {openSection === "lyrics" && (
            <LyricsDetail
              hasLyrics={t.lyrics}
              onClose={() => setOpenSection(null)}
            />
          )}
          {openSection === "credits" && (
            <CreditsDetail
              hasCredits={t.credits}
              onClose={() => setOpenSection(null)}
            />
          )}

          {/* Hide / Trash live in the row header next to the chevron now —
              this footer is just the track ID for reference. */}
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
            <Play className="w-3.5 h-3.5 translate-x-[1px] fill-current" />
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
                    <Play className="w-4 h-4 translate-x-[1.5px] fill-current" />
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
            <div className="flex items-center gap-2">
              {mode === "edit" && (
                <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5">
                  <Plus className="w-3.5 h-3.5" />
                  Add track
                </button>
              )}
              <SegmentedControl mode={mode} setMode={setMode} />
            </div>
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

        </div>

        <p className="mt-4 text-[11.5px] text-slate-400 text-center">
          Try tapping Master · 30-sec snippet · Lyrics · Credits on the open row
        </p>
      </div>
    </div>
  );
}
