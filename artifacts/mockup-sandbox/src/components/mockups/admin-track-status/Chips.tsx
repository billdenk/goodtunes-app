import { Upload } from "lucide-react";

type BoxState = "untouched" | "manual" | "auto";

function Box({ letter, state }: { letter: "P" | "L" | "C"; state: BoxState }) {
  const tone =
    state === "auto"
      ? "bg-[#319ED8] text-white"
      : state === "manual"
      ? "bg-white text-slate-900 ring-1 ring-inset ring-slate-300"
      : "bg-slate-100 text-slate-300";
  return (
    <span
      className={[
        "inline-flex w-[20px] h-[20px] items-center justify-center rounded-[5px]",
        "font-mono text-[11px] font-bold leading-none",
        tone,
      ].join(" ")}
      title={`${letter} · ${state}`}
    >
      {letter}
    </span>
  );
}

function UploadMasterBtn() {
  return (
    <button
      className="inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-md bg-amber-50 ring-1 ring-inset ring-amber-200 text-amber-700 text-[12px] font-semibold hover:bg-amber-100"
      type="button"
    >
      <Upload className="w-3.5 h-3.5" strokeWidth={2.25} />
      Upload master
    </button>
  );
}

function TrackRow({
  num,
  title,
  duration,
  audioMissing,
  p,
  l,
  c,
}: {
  num: number;
  title: string;
  duration: string;
  audioMissing?: boolean;
  p: BoxState;
  l: BoxState;
  c: BoxState;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <div className="w-5 text-right text-[12px] text-slate-400 tabular-nums">{num}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-900 truncate">{title}</div>
      </div>
      {audioMissing ? (
        <UploadMasterBtn />
      ) : (
        <div className="flex items-center gap-1">
          <Box letter="P" state={p} />
          <Box letter="L" state={l} />
          <Box letter="C" state={c} />
        </div>
      )}
      <div className="w-10 text-right text-[12px] text-slate-400 tabular-nums">{duration}</div>
    </div>
  );
}

export function Chips() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Inter',system-ui,sans-serif]">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          P · L · C letter boxes
        </div>

        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
          <TrackRow num={1} title="Pacific Drive"  duration="3:28" p="auto"      l="auto"      c="auto"      />
          <TrackRow num={2} title="Venice Beach"   duration="3:15" p="manual"    l="auto"      c="manual"    />
          <TrackRow num={3} title="Canyon Road"    duration="3:51" p="manual"    l="manual"    c="untouched" />
          <TrackRow num={4} title="Sunset Strip"   duration="3:32" p="auto"      l="untouched" c="untouched" />
          <TrackRow num={5} title="California Way" duration="4:08" p="untouched" l="untouched" c="untouched" />
          <TrackRow num={6} title="Mojave Wind"    duration="—"    audioMissing  p="untouched" l="untouched" c="untouched" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <Box letter="P" state="untouched" />
            <span>untouched</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box letter="P" state="manual" />
            <span>set manually</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box letter="P" state="auto" />
            <span>set by tech (auto)</span>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 text-[11.5px] text-slate-600 leading-relaxed">
          <div>
            <span className="font-semibold text-slate-900">P</span> · Preview — chorus
            snippet for the player. Auto = tech found a chorus. Manual = a human
            moved or trimmed it.
          </div>
          <div>
            <span className="font-semibold text-slate-900">L</span> · Lyrics — Auto =
            <span className="font-semibold text-[#319ED8]"> GoodSync™</span> (line-level
            timestamps). Manual = plain lyrics typed or pasted in.
          </div>
          <div>
            <span className="font-semibold text-slate-900">C</span> · Credits — Auto =
            tech matched writers/performers to a source. Manual = a human entered
            or edited credits.
          </div>
          <div className="pt-1 text-slate-500">
            Audio doesn't get a box — if the row shows{" "}
            <span className="inline-block align-middle"><UploadMasterBtn /></span>{" "}
            the master is still missing. No button = audio is in.
          </div>
        </div>
      </div>
    </div>
  );
}
