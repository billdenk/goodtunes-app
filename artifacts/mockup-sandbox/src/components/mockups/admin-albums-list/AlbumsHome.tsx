import {
  Plus,
  Search,
  Filter,
  ChevronRight,
  Check,
  AlertCircle,
  Disc3,
  Music2,
  Sparkles,
  Clock,
  Users,
} from "lucide-react";

/**
 * Admin home · Albums list.
 *
 * This is the landing page after the admin signs in. One row per album with
 * just enough signal to decide what to open next: cover thumb, title, artist,
 * track count, % credited, last edited, and the same P/W/M optional-section
 * status pattern used inside TracksList — bubbled up to the album level.
 *
 * Tapping a row → Album · Overview (TitleOverview).
 */
export function AlbumsHome() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-3 pb-1">
          <div className="min-w-0">
            <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
              Admin · Nick Carter
            </div>
            <h2 className="text-slate-900 text-[22px] font-bold">Albums</h2>
            <p className="text-slate-500 text-[12px]">
              Manage everything that shows up in the GoodTunes® player.
            </p>
          </div>
          <button className="px-3 py-2 rounded-md bg-[#319ED8] text-white text-[12.5px] font-semibold hover:bg-[#2890c8] inline-flex items-center gap-1.5 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> New album
          </button>
        </div>

        {/* TOOLBAR */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-2.5 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              className="flex-1 bg-transparent text-[12.5px] text-slate-700 placeholder-slate-400 focus:outline-none"
              placeholder="Find an album, track or artist…"
            />
          </div>
          <button className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-600 text-[12px] hover:bg-slate-50 inline-flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> All artists
          </button>
        </section>

        {/* STATS */}
        <div className="grid grid-cols-4 gap-2">
          <Stat label="Albums" value="1" />
          <Stat label="Tracks" value="17" />
          <Stat label="Fully credited" value="4" tone="ok" />
          <Stat label="Drafts" value="0" />
        </div>

        {/* ALBUM ROWS */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            <AlbumRow
              cover="LLT"
              coverGrad="from-purple-500 via-fuchsia-500 to-rose-500"
              title="Love Life Tragedy"
              artist="Nick Carter"
              year="2022"
              tracks={17}
              credited={4}
              status="in-progress"
              updated="Edited 2 minutes ago"
              highlight
            />
            <EmptyStateRow />
          </div>
        </section>

        {/* FOOTER NOTE */}
        <p className="text-slate-400 text-[11px] leading-relaxed px-1 pt-2">
          <span className="font-semibold text-slate-500">Scope:</span> the
          admin only manages what the player needs — cover art, metadata,
          credits, lyrics, files. No distribution, no royalty collection, no
          DSP delivery.
        </p>
      </div>
    </div>
  );
}

function AlbumRow({
  cover,
  coverGrad,
  title,
  artist,
  year,
  tracks,
  credited,
  status,
  updated,
  highlight,
}: {
  cover: string;
  coverGrad: string;
  title: string;
  artist: string;
  year: string;
  tracks: number;
  credited: number;
  status: "in-progress" | "ready" | "draft";
  updated: string;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        "w-full text-left flex items-center gap-4 px-4 py-3.5 transition-colors",
        "hover:bg-slate-50 active:bg-slate-100",
        highlight ? "bg-[#319ED8]/[0.03]" : "",
      ].join(" ")}
    >
      {/* cover */}
      <div
        className={`w-14 h-14 rounded-lg bg-gradient-to-br ${coverGrad} flex-shrink-0 relative overflow-hidden shadow-sm`}
      >
        <div className="absolute inset-0 flex items-center justify-center text-white text-[14px] font-black tracking-tight opacity-90">
          {cover}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-900 text-[14.5px] font-bold truncate">
            {title}
          </span>
          <span className="px-1.5 py-px rounded bg-slate-100 text-slate-500 text-[9.5px] font-bold uppercase tracking-wide flex-shrink-0">
            {year}
          </span>
        </div>
        <div className="text-slate-500 text-[12px] mt-0.5 truncate inline-flex items-center gap-1.5">
          <Music2 className="w-3 h-3 text-slate-400" />
          {artist}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Disc3 className="w-3 h-3 text-slate-400" />
            {tracks} tracks
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-400" />
            {credited}/{tracks} fully credited
          </span>
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Clock className="w-3 h-3" />
            {updated}
          </span>
        </div>
      </div>

      {/* status */}
      <div className="flex-shrink-0 text-right">
        {status === "ready" ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
            <Check className="w-3 h-3" /> Ready
          </span>
        ) : status === "in-progress" ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold">
            <AlertCircle className="w-3 h-3" /> In progress
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 text-slate-500 text-[11px] font-semibold">
            Draft
          </span>
        )}
        <div className="text-slate-400 text-[10.5px] mt-1">
          {Math.round((credited / tracks) * 100)}% credited
        </div>
      </div>

      <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
    </button>
  );
}

function EmptyStateRow() {
  return (
    <button className="w-full text-left flex items-center gap-4 px-4 py-5 hover:bg-slate-50">
      <div className="w-14 h-14 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center flex-shrink-0 text-slate-300">
        <Plus className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-slate-700 text-[13.5px] font-semibold inline-flex items-center gap-2">
          New album
          <Sparkles className="w-3.5 h-3.5 text-[#319ED8]" />
        </div>
        <div className="text-slate-500 text-[11.5px] mt-0.5">
          Import from Muso, paste a UPC, or start blank
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok";
}) {
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-3 py-2.5">
      <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div
        className={[
          "text-[20px] font-bold tabular-nums mt-0.5",
          tone === "ok" ? "text-emerald-700" : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
