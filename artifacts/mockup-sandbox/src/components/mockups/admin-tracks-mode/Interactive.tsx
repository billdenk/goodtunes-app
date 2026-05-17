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
  Check,
  Upload,
  EyeOff,
  Lock,
  LockOpen,
  Link as LinkIcon,
  Sparkles,
  Loader2,
  Check as CheckIcon,
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
  label,
  active,
  onClick,
}: {
  ok: boolean;
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group/card flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border text-left w-full transition-all",
        active
          ? "border-[#319ED8] ring-2 ring-[#319ED8]/20"
          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={[
            "w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0",
            ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600",
          ].join(" ")}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="text-[12px] font-semibold text-slate-900 truncate">
          {label}
        </div>
      </div>
      {/* Right slot: check (complete, at rest) → pencil (on hover) */}
      <span className="w-5 h-5 inline-flex items-center justify-center flex-shrink-0 relative">
        {ok && (
          <Check className="w-3.5 h-3.5 text-emerald-600 group-hover/card:opacity-0 transition-opacity" />
        )}
        <Pencil
          className={[
            "w-3.5 h-3.5 text-slate-500 transition-opacity",
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
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 space-y-3">
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
  onClose,
}: {
  hasMaster: boolean;
  onClose: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DetailWrap title="Master" onClose={onClose}>
      {hasMaster ? (
        // Single row: [▶ subdued play] [filename + meta] [Replace ▾]
        // The whole row is a drop target — drag a new .wav/.aiff/.flac to swap.
        <div
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
            "group relative flex items-center gap-3 p-2.5 rounded-md border-2 transition-colors",
            dragOver
              ? "border-dashed border-[#319ED8] bg-[#319ED8]/5"
              : "border-slate-200 bg-slate-50",
          ].join(" ")}
        >
          {/* Play — subdued slate at rest, brand-blue on row hover */}
          <button
            type="button"
            aria-label="Play storms_master_24-96.wav"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center flex-shrink-0 bg-slate-200/70 text-slate-500 group-hover:bg-[#319ED8] group-hover:text-white transition-colors"
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

          {/* Replace — opens a small menu: upload from device · paste a link */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1"
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
      ) : (
        <button className="w-full px-3 py-6 rounded-md border-2 border-dashed border-slate-300 hover:border-[#319ED8] hover:bg-[#319ED8]/5 text-[12.5px] font-semibold text-slate-500 hover:text-[#319ED8]">
          <Upload className="w-4 h-4 mx-auto mb-1" />
          Drop a WAV, AIFF, or FLAC master here, or click to choose
        </button>
      )}
    </DetailWrap>
  );
}

function SnippetDetail({ onClose }: { onClose: () => void }) {
  /* iMovie-style trim row: play · waveform · lock.
     Total clip 4:12 = 252s · window = 30s (= 11.9% of width).
     Drag anywhere inside the yellow window to slide; the chip updates live.
     Type into the chip to fine-tune; the window snaps to the new position.
     Locking freezes the clip and hides the chip; preview always works. */
  const TOTAL_SEC = 252; // 4:12
  const WINDOW_SEC = 30;
  const width = (WINDOW_SEC / TOTAL_SEC) * 100;

  const [locked, setLocked] = useState(false);
  const [left, setLeft] = useState(25.8); // % from waveform's left edge
  const maxLeft = 100 - width;

  const wfRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startLeft: number } | null>(null);

  const startSec = (left / 100) * TOTAL_SEC;
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const startLabel = fmt(startSec);
  const endLabel = fmt(startSec + WINDOW_SEC);

  // Chip input — controlled, synced from drag, parsed on commit
  const [chipDraft, setChipDraft] = useState(startLabel);
  useEffect(() => {
    setChipDraft(startLabel);
  }, [startLabel]);

  const commitChip = () => {
    const m = chipDraft.match(/^(\d+):(\d{1,2})$/);
    if (!m) {
      setChipDraft(startLabel);
      return;
    }
    const sec = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const clamped = Math.max(0, Math.min(TOTAL_SEC - WINDOW_SEC, sec));
    setLeft((clamped / TOTAL_SEC) * 100);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    dragRef.current = { startX: e.clientX, startLeft: left };
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
    setLeft(next);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
  };
  return (
    <DetailWrap title="30-sec snippet" onClose={onClose}>
      <p className="text-[11.5px] text-slate-500 -mt-1">
        {locked
          ? `Snippet locked in at ${startLabel}–${endLabel}. Tap the padlock to slide it again.`
          : "Slide the yellow window — width is locked to 30 seconds. Tap the padlock when you're done."}
      </p>

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
                style={{ left: `calc(${left}% + 4px)` }}
              >
                <input
                  value={chipDraft}
                  onChange={(e) => setChipDraft(e.target.value)}
                  onBlur={commitChip}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setChipDraft(startLabel);
                      (e.target as HTMLInputElement).blur();
                    }
                    // Arrow keys nudge by ±1 sec (or ±5 sec with shift). Apple inspector pattern.
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const step = e.shiftKey ? 5 : 1;
                      const dir = e.key === "ArrowUp" ? 1 : -1;
                      const next = Math.max(
                        0,
                        Math.min(TOTAL_SEC - WINDOW_SEC, startSec + dir * step),
                      );
                      setLeft((next / TOTAL_SEC) * 100);
                    }
                  }}
                  aria-label="Snippet start time — type to fine-tune"
                  title="Type to fine-tune (mm:ss)"
                  className="w-[42px] px-1.5 py-0.5 rounded-md bg-slate-800 text-white text-[10px] font-semibold tabular-nums text-center shadow-md focus:outline-none focus:ring-2 focus:ring-[#319ED8]/60 cursor-text"
                />
              </div>
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
              style={{ left: `${left}%`, width: `${width}%` }}
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
          onClick={() => setLocked(!locked)}
          aria-label={locked ? "Unlock snippet — allow sliding" : "Lock snippet in"}
          title={locked ? "Unlock to slide again" : "Lock in when done"}
          className={[
            "w-8 h-8 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors hover:bg-slate-100",
            locked ? "text-emerald-600" : "text-amber-600",
          ].join(" ")}
        >
          {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
        </button>
      </div>

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
  // 'plain' = no timing · 'syncing' = forced-alignment call in flight · 'synced' = word-level VTT stored
  const [syncState, setSyncState] = useState<"plain" | "syncing" | "synced">(
    "plain",
  );
  const dirty = text !== seed;
  const canSync = text.trim().length > 0 && syncState !== "syncing";
  const handleAutoSync = () => {
    setSyncState("syncing");
    // mock: forced-aligner round trip ~2s. Real call goes to ElevenLabs Forced Alignment API.
    setTimeout(() => setSyncState("synced"), 2000);
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

  return (
    <DetailWrap title="Lyrics" onClose={onClose} action={importAction}>
      {/* The textarea is the primary input. It also accepts dropped .vtt/.lrc
          files — drag-over shows a subtle overlay so the affordance is
          discoverable without cluttering the resting state. */}
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
          placeholder="Paste lyrics here, or drop a .vtt/.lrc file. Use [Verse 1], [Chorus] for section headers."
          rows={8}
          className={[
            "w-full px-3 py-2 rounded-md border bg-white text-[12.5px] leading-relaxed text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#319ED8]/20 transition-colors",
            dragOver ? "border-[#319ED8] ring-2 ring-[#319ED8]/20" : "border-slate-200 focus:border-[#319ED8]",
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
      <div className="flex items-center justify-between gap-3">
        {/* Status pill — shows current timing fidelity */}
        <div className="flex items-center gap-2">
          {syncState === "plain" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10.5px] font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              Plain text · auto-distributed
            </span>
          )}
          {syncState === "syncing" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#319ED8]/10 text-[#319ED8] text-[10.5px] font-semibold uppercase tracking-wider">
              <Loader2 className="w-3 h-3 animate-spin" />
              Auto-syncing to audio…
            </span>
          )}
          {syncState === "synced" && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#4AFFCA]/20 text-emerald-700 text-[10.5px] font-semibold uppercase tracking-wider">
              <CheckIcon className="w-3 h-3" />
              Word-level synced
            </span>
          )}
          {/* Auto-sync button — kicks off forced alignment (ElevenLabs API in real impl). */}
          {syncState !== "synced" && (
            <button
              onClick={handleAutoSync}
              disabled={!canSync}
              className={
                canSync
                  ? "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-white border border-[#319ED8] text-[#319ED8] hover:bg-[#319ED8]/5"
                  : "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed"
              }
            >
              <Sparkles className="w-3 h-3" />
              {syncState === "syncing" ? "Syncing…" : "Auto-sync to audio"}
            </button>
          )}
          {syncState === "synced" && (
            <button
              onClick={() => setSyncState("plain")}
              className="text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2"
            >
              Re-sync
            </button>
          )}
        </div>

        <button
          disabled={!dirty}
          className={
            dirty
              ? "inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11.5px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8]"
              : "inline-flex items-center gap-1 px-3 py-1.5 text-[11.5px] font-semibold text-slate-400 border-b border-slate-200 cursor-not-allowed"
          }
        >
          Save lyrics
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
  const rows = hasCredits
    ? [
        { name: "James Walsh", role: "Lead vocals · Acoustic guitar", instrument: "1973 Martin D-28" },
        { name: "Sarah Lin", role: "Producer · Bass", instrument: "1965 Fender Precision" },
        { name: "Mike Torres", role: "Drums", instrument: "Ludwig Black Beauty kit" },
      ]
    : [];
  return (
    <DetailWrap title="Credits" onClose={onClose}>
      {rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.name}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-slate-50"
            >
              <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#319ED8] to-[#7F10A7] text-white text-[11px] font-bold inline-flex items-center justify-center flex-shrink-0">
                {r.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                  {r.name}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {r.role} · {r.instrument}
                </div>
              </div>
              <button className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center">
                <Pencil className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-slate-500 italic">
          No credits yet. SuperCredits™ work better with at least a writer and a
          performer.
        </p>
      )}
      <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5">
        <Plus className="w-3.5 h-3.5" />
        Add credit
      </button>
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
          <DotMeter t={t} />
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
          {/* One row of cards: Required pair · divider · Optional pair */}
          <div className="flex items-stretch gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
                Required
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatusBadge
                  ok={t.master}
                  icon={Disc3}
                  label="Master"
                  active={openSection === "master"}
                  onClick={() => toggleSection("master")}
                />
                <StatusBadge
                  ok={t.snippet}
                  icon={Scissors}
                  label="30-sec snippet"
                  active={openSection === "snippet"}
                  onClick={() => toggleSection("snippet")}
                />
              </div>
            </div>
            <div className="w-px bg-slate-200 self-stretch mt-5" aria-hidden />
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
                Optional
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatusBadge
                  ok={t.lyrics}
                  icon={FileText}
                  label="Lyrics"
                  active={openSection === "lyrics"}
                  onClick={() => toggleSection("lyrics")}
                />
                <StatusBadge
                  ok={t.credits}
                  icon={Users}
                  label="Credits"
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
              onClose={() => setOpenSection(null)}
            />
          )}
          {openSection === "snippet" && (
            <SnippetDetail onClose={() => setOpenSection(null)} />
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
