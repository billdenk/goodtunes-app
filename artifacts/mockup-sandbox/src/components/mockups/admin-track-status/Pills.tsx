type Status = "done" | "missing";

type Size = "sm" | "xs" | "xxs";

const SIZE_TOKENS: Record<
  Size,
  { text: string; h: string; px: string; gap: string; rowText: string; rowGap: string }
> = {
  sm:  { text: "text-[11px]", h: "h-[20px]", px: "px-1.5", gap: "gap-1",    rowText: "text-[13px]",   rowGap: "gap-2.5" },
  xs:  { text: "text-[10px]", h: "h-[17px]", px: "px-1.5", gap: "gap-1",    rowText: "text-[12.5px]", rowGap: "gap-2" },
  xxs: { text: "text-[9px]",  h: "h-[15px]", px: "px-1",   gap: "gap-0.5",  rowText: "text-[12px]",   rowGap: "gap-1.5" },
};

function Pill({ label, status, size }: { label: string; status: Status; size: Size }) {
  const t = SIZE_TOKENS[size];
  const done = status === "done";
  return (
    <span
      className={[
        "inline-flex items-center rounded-md font-semibold tracking-wide whitespace-nowrap",
        t.text,
        t.h,
        t.px,
        done
          ? "bg-slate-900 text-white"
          : "bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200",
      ].join(" ")}
    >
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
  size,
}: {
  num: number;
  title: string;
  duration: string;
  audio: Status;
  lyrics: Status;
  credits: Status;
  size: Size;
}) {
  const t = SIZE_TOKENS[size];
  return (
    <div
      className={[
        "flex items-center px-3 py-2 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60",
        t.rowGap,
      ].join(" ")}
    >
      <div className="w-4 text-right text-[11px] text-slate-400 tabular-nums">{num}</div>
      <div className="min-w-0 flex-1">
        <div className={["font-semibold text-slate-900 truncate", t.rowText].join(" ")}>
          {title}
        </div>
      </div>
      <div className={["flex items-center", t.gap].join(" ")}>
        <Pill label="Audio" status={audio} size={size} />
        <Pill label="Lyrics" status={lyrics} size={size} />
        <Pill label="Credits" status={credits} size={size} />
      </div>
      <div className="w-10 text-right text-[11px] text-slate-400 tabular-nums">{duration}</div>
    </div>
  );
}

function Tier({ label, size }: { label: string; size: Size }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="rounded-lg bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
        <TrackRow num={1} title="Storms"          duration="3:42" audio="done"    lyrics="done"    credits="done"    size={size} />
        <TrackRow num={2} title="Long Way Home"   duration="4:08" audio="done"    lyrics="missing" credits="done"    size={size} />
        <TrackRow num={3} title="Carolina Pines"  duration="3:21" audio="done"    lyrics="missing" credits="missing" size={size} />
        <TrackRow num={4} title="Tennessee River" duration="5:14" audio="missing" lyrics="missing" credits="missing" size={size} />
      </div>
    </div>
  );
}

export function Pills() {
  return (
    <div className="min-h-screen bg-slate-50 p-5 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Inter',system-ui,sans-serif]">
      <div className="mx-auto max-w-[540px]">
        <div className="mb-4 text-[11px] text-slate-500 leading-relaxed">
          One tone: <span className="font-semibold text-slate-900">slate</span>.
          Done = solid slate-900. Missing = soft slate-100 outline. No second hue.
        </div>
        <Tier label="Small · 11px (current)" size="sm" />
        <Tier label="Extra small · 10px"     size="xs" />
        <Tier label="Micro · 9px"            size="xxs" />
        <div className="text-[11px] text-slate-500 leading-relaxed">
          My read: <span className="font-semibold text-slate-700">10px</span> is the
          floor for comfortable scanning at desktop resolution. 9px works but
          starts to feel like a footnote — fine if it lives on the row's edge
          and isn't the primary signal.
        </div>
      </div>
    </div>
  );
}
