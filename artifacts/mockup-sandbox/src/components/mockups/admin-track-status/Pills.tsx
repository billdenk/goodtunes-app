import { Check } from "lucide-react";

type Status = "done" | "missing";

function Pill({ label, status }: { label: string; status: Status }) {
  const done = status === "done";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-semibold tracking-wide",
        done
          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
      ].join(" ")}
    >
      {done && <Check className="w-3 h-3" strokeWidth={3} />}
      {label}
    </span>
  );
}

function TrackRow({
  num,
  title,
  duration,
  audio,
  lyrics,
  credits,
}: {
  num: number;
  title: string;
  duration: string;
  audio: Status;
  lyrics: Status;
  credits: Status;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <div className="w-5 text-right text-[12px] text-slate-400 tabular-nums">{num}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-900 truncate">{title}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <Pill label="Audio" status={audio} />
        <Pill label="Lyrics" status={lyrics} />
        <Pill label="Credits" status={credits} />
      </div>
      <div className="w-10 text-right text-[12px] text-slate-400 tabular-nums">{duration}</div>
    </div>
  );
}

export function Pills() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Inter',system-ui,sans-serif]">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Option A · Labeled status pills
        </div>
        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
          <TrackRow num={1} title="Storms" duration="3:42" audio="done" lyrics="done" credits="done" />
          <TrackRow num={2} title="Long Way Home" duration="4:08" audio="done" lyrics="missing" credits="done" />
          <TrackRow num={3} title="Carolina Pines" duration="3:21" audio="done" lyrics="missing" credits="missing" />
          <TrackRow num={4} title="Tennessee River" duration="5:14" audio="missing" lyrics="missing" credits="missing" />
        </div>
        <div className="mt-3 text-[11.5px] text-slate-500 leading-relaxed">
          The word is the icon. Tinted emerald = done, slate = still missing.
          Reads instantly without a legend.
        </div>
      </div>
    </div>
  );
}
