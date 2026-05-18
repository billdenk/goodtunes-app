import { FileAudio, Mic2, UserPlus, Check } from "lucide-react";

type Status = "done" | "missing";

function Chip({
  icon: Icon,
  label,
  status,
}: {
  icon: typeof FileAudio;
  label: string;
  status: Status;
}) {
  const done = status === "done";
  return (
    <span
      className="relative inline-flex w-8 h-8 rounded-lg bg-slate-900 text-slate-100 items-center justify-center"
      title={`${label} · ${done ? "done" : "missing"}`}
    >
      <Icon className="w-4 h-4" strokeWidth={1.75} />
      {done && (
        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white inline-flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
        </span>
      )}
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
        <Chip icon={FileAudio} label="Audio" status={audio} />
        <Chip icon={Mic2} label="Lyrics" status={lyrics} />
        <Chip icon={UserPlus} label="Credits" status={credits} />
      </div>
      <div className="w-10 text-right text-[12px] text-slate-400 tabular-nums">{duration}</div>
    </div>
  );
}

export function Chips() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Inter',system-ui,sans-serif]">
      <div className="mx-auto max-w-[560px]">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Option B · Monochrome icon chips
        </div>
        <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
          <TrackRow num={1} title="Storms" duration="3:42" audio="done" lyrics="done" credits="done" />
          <TrackRow num={2} title="Long Way Home" duration="4:08" audio="done" lyrics="missing" credits="done" />
          <TrackRow num={3} title="Carolina Pines" duration="3:21" audio="done" lyrics="missing" credits="missing" />
          <TrackRow num={4} title="Tennessee River" duration="5:14" audio="missing" lyrics="missing" credits="missing" />
        </div>
        <div className="mt-3 text-[11.5px] text-slate-500 leading-relaxed">
          Dark slate chip · outline glyph · emerald check overlay when done.
          The glyph carries the meaning; the check carries the state. Same
          tonal logic as the App Store's "installed" badge.
        </div>
      </div>
    </div>
  );
}
