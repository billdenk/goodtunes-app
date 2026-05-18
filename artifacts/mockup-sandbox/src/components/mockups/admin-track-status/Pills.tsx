type Status = "done" | "missing" | "goodsync";
type Size = "sm" | "xs";

const SIZE_TOKENS: Record<Size, { text: string; h: string; px: string; gap: string }> = {
  sm: { text: "text-[11px]", h: "h-[20px]", px: "px-1.5", gap: "gap-1" },
  xs: { text: "text-[10px]", h: "h-[18px]", px: "px-1.5", gap: "gap-1" },
};

function Pill({ label, status, size }: { label: string; status: Status; size: Size }) {
  const t = SIZE_TOKENS[size];
  const tone =
    status === "goodsync"
      ? "bg-[#319ED8] text-white"
      : status === "done"
      ? "bg-white text-slate-900 ring-1 ring-inset ring-slate-200"
      : "bg-slate-100 text-slate-400";
  return (
    <span
      className={[
        "inline-flex items-center rounded-md font-semibold tracking-wide whitespace-nowrap",
        t.text,
        t.h,
        t.px,
        tone,
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
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
      <div className="w-5 text-right text-[12px] text-slate-400 tabular-nums">{num}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-900 truncate">{title}</div>
      </div>
      <div className={["flex items-center", t.gap].join(" ")}>
        <Pill label="Audio"   status={audio}   size={size} />
        <Pill label="Lyrics"  status={lyrics}  size={size} />
        <Pill label="Credits" status={credits} size={size} />
      </div>
      <div className="w-10 text-right text-[12px] text-slate-400 tabular-nums">{duration}</div>
    </div>
  );
}

function Tier({ label, size }: { label: string; size: Size }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
      <div className="rounded-xl bg-white ring-1 ring-slate-200 overflow-hidden shadow-sm">
        <TrackRow num={1} title="Storms"          duration="3:42" audio="done"    lyrics="goodsync" credits="done"    size={size} />
        <TrackRow num={2} title="Long Way Home"   duration="4:08" audio="done"    lyrics="done"     credits="done"    size={size} />
        <TrackRow num={3} title="Carolina Pines"  duration="3:21" audio="done"    lyrics="missing"  credits="missing" size={size} />
        <TrackRow num={4} title="Tennessee River" duration="5:14" audio="missing" lyrics="missing"  credits="missing" size={size} />
      </div>
    </div>
  );
}

export function Pills() {
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Inter',system-ui,sans-serif]">
      <div className="mx-auto max-w-[560px]">
        <Tier label="Pill text 11px" size="sm" />
        <Tier label="Pill text 10px" size="xs" />

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <Pill label="Done" status="done" size="sm" />
            <span>hairline + black text</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pill label="Missing" status="missing" size="sm" />
            <span>soft gray placeholder</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pill label="GoodSync" status="goodsync" size="sm" />
            <span>brand blue · synced lyrics</span>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          Track title text is unchanged. Only the pill size and tone are moving.
          Brand blue is reserved for <span className="font-semibold text-slate-900">GoodSync™</span> so
          it stays meaningful when you spot one.
        </div>
      </div>
    </div>
  );
}
