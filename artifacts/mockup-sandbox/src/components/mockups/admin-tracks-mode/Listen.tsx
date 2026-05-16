import { Play, Pause, Check } from "lucide-react";

const TRACKS = [
  { n: 1, title: "Made for Us", master: true, duration: "3:30", playing: false },
  { n: 2, title: "Storms", master: true, duration: "4:12", playing: true, progress: 0.42 },
  { n: 3, title: "Cold Night", master: true, duration: "2:58", playing: false },
  { n: 4, title: "Hurts To Love You", master: true, duration: "3:47", playing: false },
  { n: 5, title: "Lighthouse", master: false, duration: "—", playing: false },
];

export function Listen() {
  return (
    <div className="min-h-screen bg-slate-50 p-10 font-[Inter,system-ui,-apple-system,sans-serif]">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {/* Panel header with segmented control + Play all */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-3">
              <button className="w-9 h-9 rounded-full bg-[#319ED8] text-white inline-flex items-center justify-center shadow-sm hover:bg-[#2890c8]">
                <Play className="w-4 h-4 ml-0.5 fill-current" />
              </button>
              <div>
                <h2 className="text-slate-900 text-[14px] font-bold">Tracks</h2>
                <p className="text-slate-500 text-[11.5px] mt-0.5">
                  Bulk-QA the masters. 4 of 5 loaded.
                </p>
              </div>
            </div>
            {/* Segmented control — Listen active */}
            <div
              role="tablist"
              className="inline-flex p-0.5 bg-slate-100 rounded-lg text-[12px] font-semibold"
            >
              <button
                role="tab"
                aria-selected="false"
                className="px-3 py-1.5 rounded-md text-slate-500 hover:text-slate-700"
              >
                Edit
              </button>
              <button
                role="tab"
                aria-selected="true"
                className="px-3 py-1.5 rounded-md bg-white text-slate-900 shadow-sm"
              >
                Listen
              </button>
            </div>
          </div>

          <ul>
            {TRACKS.map((t, i) => {
              const playable = t.master;
              const active = t.playing;
              return (
                <li
                  key={t.n}
                  className={[
                    "px-5 py-3 transition-colors",
                    active ? "bg-[#319ED8]/5" : "hover:bg-slate-50/70",
                    i < TRACKS.length - 1 && "border-b border-slate-100",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="flex items-center gap-4">
                    <button
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
                        {/* scrubber */}
                        <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                          {playable && (
                            <div
                              className="h-full bg-[#319ED8] rounded-full"
                              style={{
                                width: active
                                  ? `${(t.progress ?? 0) * 100}%`
                                  : "0%",
                              }}
                            />
                          )}
                        </div>
                        <span className="text-slate-400 text-[11px] tabular-nums w-9 text-right">
                          {t.duration}
                        </span>
                      </div>
                    </div>
                    {playable ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 flex-shrink-0">
                        <Check className="w-2.5 h-2.5" />
                        Master loaded
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-slate-100 text-slate-400 flex-shrink-0">
                        No master
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400 text-center">
          Listen mode · same panel, no edit clutter — tap any track to QA
        </p>
      </div>
    </div>
  );
}
