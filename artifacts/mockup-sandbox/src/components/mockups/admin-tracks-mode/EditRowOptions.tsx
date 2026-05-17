import {
  GripVertical,
  Pencil,
  MoreHorizontal,
  Play,
  AudioLines,
  AlignLeft,
  Users,
  AlertCircle,
} from "lucide-react";

type Track = {
  n: number;
  title: string;
  master: boolean;
  lyrics: boolean;
  credits: boolean;
};

const TRACKS: Track[] = [
  { n: 1, title: "Made for Us", master: true, lyrics: true, credits: true },
  { n: 2, title: "Storms", master: true, lyrics: true, credits: false },
  { n: 3, title: "Cold Night", master: true, lyrics: false, credits: true },
  { n: 4, title: "Hurts To Love You", master: true, lyrics: true, credits: true },
  { n: 5, title: "Lighthouse", master: false, lyrics: false, credits: false },
];

/* ---------- Shared row chrome ---------- */

function RowShell({
  t,
  status,
}: {
  t: Track;
  status: React.ReactNode;
}) {
  return (
    <li className="group px-5 py-2.5 transition-colors hover:bg-slate-50/70 border-b border-slate-100 last:border-b-0">
      <div className="flex items-center gap-4">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
        <div className="w-5 -ml-1.5 flex-shrink-0 flex items-center justify-center">
          <span className="text-slate-400 text-[12px] tabular-nums font-medium group-hover:hidden">
            {t.n}
          </span>
          <button
            disabled={!t.master}
            className={[
              "hidden group-hover:inline-flex w-5 h-5 rounded-full items-center justify-center",
              t.master ? "text-slate-700 hover:text-[#319ED8]" : "text-slate-300",
            ].join(" ")}
          >
            <Play className="w-3 h-3 ml-0.5 fill-current" />
          </button>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="text-slate-900 text-[13.5px] font-medium truncate">
            {t.title}
          </div>
          {status}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button className="w-7 h-7 rounded-md text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------- Option A · Icon trio (always present, dim when missing) ---------- */

function IconTrio({ t }: { t: Track }) {
  const items: { ok: boolean; icon: any; tip: string }[] = [
    { ok: t.master, icon: AudioLines, tip: "Master" },
    { ok: t.lyrics, icon: AlignLeft, tip: "Lyrics" },
    { ok: t.credits, icon: Users, tip: "Credits" },
  ];
  return (
    <div className="ml-auto flex items-center gap-1 flex-shrink-0">
      {items.map(({ ok, icon: Icon, tip }) => (
        <span
          key={tip}
          title={`${tip}: ${ok ? "complete" : "missing"}`}
          className={[
            "w-6 h-6 rounded-md inline-flex items-center justify-center",
            ok ? "text-emerald-600" : "text-slate-300",
          ].join(" ")}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={ok ? 2.25 : 1.75} />
        </span>
      ))}
    </div>
  );
}

/* ---------- Option B · Quiet — only flag what's missing ---------- */

function OnlyMissing({ t }: { t: Track }) {
  const missing: string[] = [];
  if (!t.master) missing.push("master");
  if (!t.lyrics) missing.push("lyrics");
  if (!t.credits) missing.push("credits");
  if (missing.length === 0) return null;
  const label =
    missing.length === 1
      ? `Needs ${missing[0]}`
      : `Needs ${missing.slice(0, -1).join(", ")} & ${missing.slice(-1)}`;
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-600 flex-shrink-0">
      <AlertCircle className="w-3 h-3" />
      {label}
    </span>
  );
}

/* ---------- Option C · Completeness meter (3 dots) ---------- */

function DotMeter({ t }: { t: Track }) {
  const dots = [t.master, t.lyrics, t.credits];
  const complete = dots.every(Boolean);
  const labels = ["Master", "Lyrics", "Credits"];
  return (
    <div
      className="ml-auto flex items-center gap-1.5 flex-shrink-0"
      title={dots
        .map((ok, i) => `${labels[i]}: ${ok ? "✓" : "missing"}`)
        .join(" · ")}
    >
      {/* Shape carries the signal so color-blind users see it: filled
          circle = done, hollow ring = needed. */}
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
      <span
        className={[
          "text-[10.5px] font-semibold tabular-nums",
          complete ? "text-slate-400" : "text-amber-600",
        ].join(" ")}
      >
        {dots.filter(Boolean).length}/3
      </span>
    </div>
  );
}

/* ---------- Panel ---------- */

function Panel({
  label,
  pitch,
  render,
}: {
  label: string;
  pitch: string;
  render: (t: Track) => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-baseline justify-between">
        <h2 className="text-slate-900 text-[14px] font-bold">{label}</h2>
        <p className="text-[11.5px] text-slate-500">{pitch}</p>
      </div>
      <ul>
        {TRACKS.map((t) => (
          <RowShell key={t.n} t={t} status={render(t)} />
        ))}
      </ul>
    </div>
  );
}

export function EditRowOptions() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-8 font-[Inter,system-ui,-apple-system,sans-serif]">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Option A
          </p>
          <h1 className="text-slate-900 text-[18px] font-bold mt-1">
            Icon trio — always shown, dim if missing
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-1">
            Three tiny status icons (master · lyrics · credits) lock to the right
            of every row. Lit green = complete, ghosted = missing. Tooltip on
            hover. Scans like a checklist.
          </p>
          <div className="mt-3">
            <Panel
              label="Tracks"
              pitch="Hover to see what's missing"
              render={(t) => <IconTrio t={t} />}
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Option B
          </p>
          <h1 className="text-slate-900 text-[18px] font-bold mt-1">
            Quiet — only flag what's missing
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-1">
            Complete tracks show only their title. Incomplete tracks get a small
            amber "Needs lyrics" caption. Rows stay calm; the eye lands exactly
            on what still needs work.
          </p>
          <div className="mt-3">
            <Panel
              label="Tracks"
              pitch="2 tracks need attention"
              render={(t) => <OnlyMissing t={t} />}
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Option C
          </p>
          <h1 className="text-slate-900 text-[18px] font-bold mt-1">
            Completeness meter — 3 dots + count
          </h1>
          <p className="text-[12.5px] text-slate-500 mt-1">
            Three dots show the master/lyrics/credits state in a glance, with a
            "2/3" count next to them (amber if not complete). Compact, scannable,
            no icon noise.
          </p>
          <div className="mt-3">
            <Panel
              label="Tracks"
              pitch="Hover dots for which is which"
              render={(t) => <DotMeter t={t} />}
            />
          </div>
        </div>

        <p className="text-center text-[11.5px] text-slate-400 pt-2">
          Pick a direction — I'll bake the winner into the live demo.
        </p>
      </div>
    </div>
  );
}
