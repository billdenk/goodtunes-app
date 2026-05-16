import {
  GripVertical,
  Pencil,
  MoreHorizontal,
  Plus,
  Check,
  AlignLeft,
  Users,
} from "lucide-react";

const TRACKS = [
  { n: 1, title: "Made for Us", master: true, lyrics: true, credits: true },
  { n: 2, title: "Storms", master: true, lyrics: true, credits: false },
  { n: 3, title: "Cold Night", master: true, lyrics: false, credits: true },
  { n: 4, title: "Hurts To Love You", master: true, lyrics: true, credits: true },
  { n: 5, title: "Lighthouse", master: false, lyrics: false, credits: false },
];

function Chip({ ok, icon: Icon, label }: { ok: boolean; icon: any; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold",
        ok
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-400",
      ].join(" ")}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

export function Edit() {
  return (
    <div className="min-h-screen bg-slate-50 p-10 font-[Inter,system-ui,-apple-system,sans-serif]">
      <div className="max-w-3xl mx-auto">
        {/* Panel header with segmented control */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
            <div>
              <h2 className="text-slate-900 text-[14px] font-bold">Tracks</h2>
              <p className="text-slate-500 text-[11.5px] mt-0.5">
                Reorder, edit titles, attach masters and credits.
              </p>
            </div>
            {/* Apple-style segmented control */}
            <div
              role="tablist"
              className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[12px] font-semibold"
            >
              <button
                role="tab"
                aria-selected="true"
                className="px-3 py-1.5 rounded-md bg-white text-slate-900 shadow-sm"
              >
                Edit
              </button>
              <button
                role="tab"
                aria-selected="false"
                className="px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-700"
              >
                Listen
              </button>
            </div>
          </div>

          <ul>
            {TRACKS.map((t, i) => (
              <li
                key={t.n}
                className={[
                  "group px-5 py-3 transition-colors hover:bg-slate-50/70",
                  i < TRACKS.length - 1 && "border-b border-slate-100",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="flex items-center gap-4">
                  <GripVertical className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                  <span className="w-5 -ml-1.5 text-right text-slate-400 text-[12px] tabular-nums font-medium flex-shrink-0">
                    {t.n}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900 text-[13.5px] font-medium truncate">
                      {t.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Chip
                        ok={t.master}
                        icon={Check}
                        label={t.master ? "Master loaded" : "No master"}
                      />
                      <Chip ok={t.lyrics} icon={AlignLeft} label="Lyrics" />
                      <Chip ok={t.credits} icon={Users} label="Credits" />
                    </div>
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
            ))}
          </ul>

          <div className="px-5 py-3 border-t border-slate-100">
            <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-[#319ED8] hover:bg-[#319ED8]/5">
              <Plus className="w-3.5 h-3.5" />
              Add track
            </button>
          </div>
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400 text-center">
          Edit mode · today's view
        </p>
      </div>
    </div>
  );
}
