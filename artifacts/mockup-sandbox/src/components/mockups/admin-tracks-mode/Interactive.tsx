import { useState } from "react";
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
  X,
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
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12.5px] font-bold text-slate-900">{title}</h3>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
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
  return (
    <DetailWrap title="Master" onClose={onClose}>
      {hasMaster ? (
        <>
          <div className="flex items-center gap-3 p-2.5 rounded-md bg-slate-50 border border-slate-200">
            <span className="w-9 h-9 rounded-md bg-[#00062B] text-[#4AFFCA] inline-flex items-center justify-center flex-shrink-0">
              <Disc3 className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                storms_master_24-96.wav
              </div>
              <div className="text-[11px] text-slate-500">
                24-bit · 96 kHz · 4:12 · 47.3 MB
              </div>
            </div>
            <button className="w-8 h-8 rounded-full bg-[#319ED8] text-white inline-flex items-center justify-center flex-shrink-0">
              <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 inline-flex items-center gap-1">
              <Upload className="w-3 h-3" />
              Replace master
            </button>
            <button className="px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50">
              Remove
            </button>
          </div>
        </>
      ) : (
        <button className="w-full px-3 py-6 rounded-md border-2 border-dashed border-slate-300 hover:border-[#319ED8] hover:bg-[#319ED8]/5 text-[12.5px] font-semibold text-slate-500 hover:text-[#319ED8]">
          <Upload className="w-4 h-4 mx-auto mb-1" />
          Drop a WAV or AIFF master here, or click to choose
        </button>
      )}
    </DetailWrap>
  );
}

function SnippetDetail({ onClose }: { onClose: () => void }) {
  /* iMovie-style fixed-width 30-sec window draggable along the waveform.
     The total clip is 4:12 = 252s. Window = 30s starts at 65s → left=25.8%, width=11.9%. */
  const left = 25.8;
  const width = 11.9;
  return (
    <DetailWrap title="30-sec snippet" onClose={onClose}>
      <p className="text-[11.5px] text-slate-500 -mt-1">
        Drag the yellow window along the waveform. Width is locked to 30 seconds.
      </p>

      {/* Waveform with window overlay */}
      <div className="relative h-20 rounded-md bg-slate-50 border border-slate-200 px-2 overflow-hidden">
        <div className="absolute inset-x-2 inset-y-2 flex items-center justify-between gap-[1px]">
          {WAVE_BARS.map((h, i) => (
            <div
              key={i}
              className="flex-1 bg-slate-300 rounded-full"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        {/* Yellow 30-sec window */}
        <div
          className="absolute top-1 bottom-1 border-2 border-amber-400 bg-amber-400/15 rounded-md cursor-grab shadow-[0_0_0_3px_rgba(251,191,36,0.15)]"
          style={{ left: `${left}%`, width: `${width}%` }}
        >
          <div className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 bg-amber-400 rounded-l-md" />
          <div className="absolute right-0 top-0 bottom-0 w-1.5 -mr-0.5 bg-amber-400 rounded-r-md" />
        </div>
        {/* Timecodes */}
        <div className="absolute -bottom-0.5 left-2 right-2 flex justify-between text-[9px] tabular-nums text-slate-400 pointer-events-none">
          <span>0:00</span>
          <span>1:03</span>
          <span>2:06</span>
          <span>3:09</span>
          <span>4:12</span>
        </div>
      </div>

      {/* Inputs row */}
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
            Start
          </label>
          <input
            defaultValue="1:05"
            className="w-20 px-2 py-1 rounded-md border border-slate-200 text-[12px] tabular-nums focus:outline-none focus:border-[#319ED8] focus:ring-2 focus:ring-[#319ED8]/20"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">
            End (auto)
          </label>
          <input
            value="1:35"
            readOnly
            className="w-20 px-2 py-1 rounded-md border border-slate-200 bg-slate-50 text-slate-500 text-[12px] tabular-nums"
          />
        </div>
        <button className="ml-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
          <Play className="w-3 h-3 ml-0.5 fill-current" />
          Preview clip
        </button>
        <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11.5px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8]">
          Save snippet
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
  return (
    <DetailWrap title="Lyrics" onClose={onClose}>
      <textarea
        defaultValue={
          hasLyrics
            ? `[Verse 1]\nThe storms came in across the bay\nI didn't know what to say\n\n[Chorus]\nAnd I'd weather them all for you\nAnd I'd weather them all for you`
            : ""
        }
        placeholder="Paste lyrics here. Use [Verse 1], [Chorus] markers to group sections."
        rows={8}
        className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-[12.5px] leading-relaxed text-slate-900 font-mono focus:outline-none focus:border-[#319ED8] focus:ring-2 focus:ring-[#319ED8]/20"
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">
          Per-line timing is auto-distributed today; word-level karaoke later.
        </span>
        <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11.5px] font-semibold bg-[#319ED8] text-white hover:bg-[#2890c8]">
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
        <div className="pl-20 pr-16 pb-5 -mt-1 space-y-4">
          {/* Required */}
          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">
              Required to publish
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

          {/* Optional */}
          <div>
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
