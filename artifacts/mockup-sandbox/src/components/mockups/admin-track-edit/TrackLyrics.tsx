import {
  ChevronRight,
  ChevronLeft,
  Upload,
  Check,
  Wand2,
  Eye,
  AlertCircle,
  Star,
  MoreHorizontal,
} from "lucide-react";

/**
 * Track · Lyrics tab.
 *
 * Two modes: plain lyrics (auto-distributed at runtime, our current shipped
 * pattern) or synced lyrics via .vtt upload. Live preview pane shows how the
 * lyric overlay actually renders in the player.
 */
export function TrackLyrics() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="space-y-2 pb-1">
          <div className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
            <span>Albums</span>
            <ChevronRight className="w-3 h-3" />
            <span>Love Life Tragedy</span>
            <ChevronRight className="w-3 h-3" />
            <span>Tracks</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
                Track 1 of 17 · Love Life Tragedy · Nick Carter
              </div>
              <h2 className="text-slate-900 text-[20px] font-bold truncate">
                Made for Us
              </h2>
            </div>
          </div>

          {/* tabs */}
          <div className="flex items-center gap-4 border-b border-slate-200 pt-1">
            <Tab label="Details" />
            <Tab label="Credits" badge="7 to fill" />
            <Tab label="Lyrics" active />
            <Tab label="Files" />
          </div>
        </div>

        {/* SOURCE / PROVENANCE */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40">
            <h3 className="text-slate-900 text-[14px] font-bold inline-flex items-center gap-2">
              Lyrics source
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                Artist-provided
              </span>
            </h3>
            <p className="text-slate-500 text-[11.5px] mt-0.5">
              Canonical source is the artist — typed, pasted, or uploaded here.
              Third-party lyric services (Musixmatch, LyricFind) are deferred;
              synced timing can become a paid service we offer the artist later.
            </p>
          </header>

          <div className="grid grid-cols-2 divide-x divide-slate-100">
            <ModeCard
              label="Plain lyrics"
              hint="Auto-distributed at runtime"
              icon={<Wand2 className="w-4 h-4 text-[#319ED8]" />}
              active
            />
            <ModeCard
              label="Synced (WebVTT)"
              hint="Line-level timings · upload .vtt"
              icon={<Upload className="w-4 h-4 text-slate-400" />}
            />
          </div>
        </section>

        {/* EDITOR */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-slate-900 text-[14px] font-bold">Lyrics</h3>
              <p className="text-slate-500 text-[11.5px] mt-0.5">
                Use <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-[10.5px]">[Verse 1]</code>{" "}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-700 text-[10.5px]">[Chorus]</code>{" "}
                etc. for section headers — they'll render dimmed and uppercase
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[11.5px] hover:bg-slate-50 inline-flex items-center gap-1">
                <Eye className="w-3 h-3" /> Preview
              </button>
            </div>
          </header>
          <div className="p-3">
            <textarea
              className="w-full min-h-[260px] rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#319ED8] resize-y font-mono leading-relaxed"
              defaultValue={`[Verse 1]
The lights came up too early
Like a film we didn't write
Two ghosts in someone's hallway
Holding on against the night

[Pre-chorus]
And every time I close my eyes
I see the way you held my hand

[Chorus]
We were made for us, made for us
The whole world fell away
We were made for us, made for us
And there's nothing left to say

[Verse 2]
The morning comes and finds us
Still tangled in the sheets
Your laugh against my shoulder
Like every song I keep`}
            />
            <div className="flex items-center justify-between mt-2 text-[10.5px] text-slate-400">
              <span>16 non-header lines · ~12s per line at 208s</span>
              <span className="inline-flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-500" />
                Markdown-safe · saved 3 seconds ago
              </span>
            </div>
          </div>
        </section>

        {/* PREVIEW — Apple Music style */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-slate-900 text-[14px] font-bold">Player preview</h3>
              <p className="text-slate-500 text-[11.5px] mt-0.5">
                Apple Music-style overlay at 0:42 · section headers hidden,
                active line big &amp; bold, neighbors blur
              </p>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
              Live
            </span>
          </header>

          {/* Lyric stage: blurred art backdrop, left-aligned, no section header, no progress bar in pane */}
          <div className="relative overflow-hidden">
            {/* soft tonal backdrop standing in for blurred album art */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 30% 20%, #c9a3a3 0%, #8e7474 40%, #4a3a3a 75%, #2a2222 100%)",
              }}
            />
            <div className="absolute inset-0 backdrop-blur-3xl bg-black/10" />

            <div className="relative px-5 pt-4 pb-5">
              {/* mini now-playing strip */}
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-md bg-gradient-to-br from-[#FF5470] via-[#7F10A7] to-[#00062B] shadow-md flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[12.5px] font-semibold leading-tight truncate">
                    Made for Us
                  </div>
                  <div className="text-white/70 text-[11px] leading-tight truncate">
                    Nick Carter
                  </div>
                </div>
                <button className="w-7 h-7 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                  <Star className="w-3.5 h-3.5 text-white" />
                </button>
                <button className="w-7 h-7 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                  <MoreHorizontal className="w-3.5 h-3.5 text-white" />
                </button>
              </div>

              {/* lyric lines — left-aligned, Apple-style */}
              <div className="space-y-2.5 text-left">
                <div className="text-white/25 text-[15px] font-bold leading-tight blur-[1.5px]">
                  The lights came up too early
                </div>
                <div className="text-white/35 text-[15px] font-bold leading-tight blur-[0.5px]">
                  Like a film we didn't write
                </div>
                <div className="text-white text-[22px] font-bold leading-tight tracking-tight">
                  Two ghosts in someone's hallway
                </div>
                <div className="text-white/55 text-[15px] font-bold leading-tight blur-[0.5px]">
                  Holding on against the night
                </div>
                <div className="text-white/40 text-[15px] font-bold leading-tight blur-[1px]">
                  And every time I close my eyes
                </div>
                <div className="text-white/30 text-[15px] font-bold leading-tight blur-[1.5px]">
                  I see the way you held my hand
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 border-t border-slate-100">
            <span className="tabular-nums">0:42 / 3:28</span>
            <span className="text-slate-400">Tap any line to seek</span>
          </div>
        </section>

        {/* HINT */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">
              Apple-parity preview.
            </span>{" "}
            Section headers like <code className="px-1 rounded bg-slate-100 text-slate-700">[Verse 1]</code>
            {" "}stay in the editor for the artist's benefit but render hidden
            in the player — matching the Apple Music lyrics view. Active line
            is large + bold; neighbors blur and fade like the iOS overlay.
          </div>
        </div>

        {/* ACTION BAR */}
        <div className="sticky bottom-0 -mx-1 mt-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-200 shadow-md px-3 py-2.5">
            <button className="px-2.5 py-1.5 rounded-md text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1">
              <ChevronLeft className="w-3.5 h-3.5" /> Credits
            </button>
            <div className="flex items-center gap-1.5">
              <button className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 text-[12px] font-medium hover:bg-slate-200">
                Save
              </button>
              <button className="px-3 py-1.5 rounded-md bg-[#319ED8] text-white text-[12px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1">
                Next: Files <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  label,
  hint,
  icon,
  active,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      className={[
        "flex items-center gap-3 px-4 py-3 text-left w-full",
        active ? "bg-[#319ED8]/[0.04]" : "hover:bg-slate-50",
      ].join(" ")}
    >
      <span className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-slate-900 text-[12.5px] font-bold inline-flex items-center gap-1.5">
          {label}
          {active && <Check className="w-3 h-3 text-emerald-500" />}
        </div>
        <div className="text-slate-500 text-[11px]">{hint}</div>
      </div>
    </button>
  );
}

function Tab({
  label,
  active,
  badge,
}: {
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <button
      className={[
        "px-1 pb-2 text-[12.5px] font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5",
        active
          ? "text-slate-900 border-[#319ED8]"
          : "text-slate-400 border-transparent hover:text-slate-600",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span className="px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}
