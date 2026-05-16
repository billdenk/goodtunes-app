import {
  ChevronRight,
  ChevronLeft,
  Upload,
  Check,
  Wand2,
  Play,
  Eye,
  Pencil,
  AlertCircle,
  Mic2,
  Search,
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
              We're not a streaming service, so we don't license a lyrics feed.
              The canonical source is the artist (or their lyricist) — typed,
              pasted, or uploaded here. Fallback search providers below are
              for when the artist doesn't have a clean copy on hand.
            </p>
          </header>

          <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
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

          <div className="px-4 py-3 bg-slate-50/50">
            <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-2">
              Fallback search (if the artist can't supply)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FallbackProvider
                name="Musixmatch"
                role="Catalog search · admin contact on file"
                connected
              />
              <FallbackProvider
                name="LyricFind"
                role="Catalog search · admin contact on file"
                connected
              />
            </div>
            <p className="text-slate-400 text-[10.5px] mt-2 italic">
              Both are reference lookups only — the artist still has to
              confirm/edit before saving. We don't auto-write third-party
              lyrics into the database.
            </p>
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
                <Mic2 className="w-3 h-3 text-emerald-600" /> Request from artist
              </button>
              <button className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[11.5px] hover:bg-slate-50 inline-flex items-center gap-1">
                <Search className="w-3 h-3" /> Look up
              </button>
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

        {/* PREVIEW */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-slate-900 text-[14px] font-bold">Player preview</h3>
              <p className="text-slate-500 text-[11.5px] mt-0.5">
                Live render of the lyrics overlay at 0:42 (active line bold,
                past lines fade, future lines preview)
              </p>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
              Live
            </span>
          </header>
          <div className="px-4 py-4 bg-[#00062B] text-white space-y-2 text-center font-sans">
            <div className="text-slate-500/60 text-[12px] tracking-wide uppercase">
              [Verse 1]
            </div>
            <div className="text-white/35 text-[15px]">
              The lights came up too early
            </div>
            <div className="text-white/35 text-[15px]">
              Like a film we didn't write
            </div>
            <div className="text-white text-[17px] font-bold scale-[1.04]">
              Two ghosts in someone's hallway
            </div>
            <div className="text-white/55 text-[15px]">
              Holding on against the night
            </div>
            <div className="text-slate-500/60 text-[12px] tracking-wide uppercase pt-1">
              [Pre-chorus]
            </div>
            <div className="text-white/55 text-[15px]">
              And every time I close my eyes
            </div>
            <div className="text-white/55 text-[15px]">
              I see the way you held my hand
            </div>
          </div>
          <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center">
                <Play className="w-3 h-3 fill-white" />
              </button>
              <span className="tabular-nums">0:42 / 3:28</span>
            </div>
            <div className="flex-1 mx-2 h-1 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-[#319ED8]" style={{ width: "20%" }} />
            </div>
            <button className="text-slate-400 hover:text-slate-700 inline-flex items-center gap-1">
              <Pencil className="w-3 h-3" /> Tap any line to seek
            </button>
          </div>
        </section>

        {/* HINT */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="text-[11.5px] text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">
              Why artist-direct first?
            </span>{" "}
            Streaming services pay licensing fees to Musixmatch / LyricFind
            because they need lyrics for tens of millions of tracks they
            don't own. We have the opposite shape — a smaller catalog the
            artist is uploading themselves — so the cleanest, cheapest, most
            accurate source is the artist's own copy. The provider lookups
            stay as a research aid for when memory fails.
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

function FallbackProvider({
  name,
  role,
  connected,
}: {
  name: string;
  role: string;
  connected?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
        <Search className="w-3.5 h-3.5 text-slate-500" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-slate-900 text-[12px] font-semibold truncate inline-flex items-center gap-1.5">
          {name}
          {connected && (
            <span className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-emerald-50 text-emerald-700 text-[9.5px] font-bold uppercase tracking-wide">
              <Check className="w-2.5 h-2.5" /> linked
            </span>
          )}
        </div>
        <div className="text-slate-500 text-[10.5px] truncate">{role}</div>
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
