import {
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Play,
  Image as ImageIcon,
  Video,
  GripVertical,
  Lock,
} from "lucide-react";

/**
 * Album · Bonus tab — album-level extras (videos + photos).
 *
 * Sits as the 5th album-level tab: Overview · Tracks · Artwork · Masters · Bonus.
 * Lock-by-default + hover-reveal edit pattern (matches the videos/photos UX
 * Bill already likes). First-entry rows render as inputs; once saved they
 * lock down and only show Edit / 🗑 on hover.
 */
export function BonusTab() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans antialiased">
      <div className="max-w-[720px] mx-auto space-y-3">
        {/* HEADER */}
        <div className="space-y-2 pb-1">
          <div className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
            <span>Albums</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-slate-700 font-semibold">Love Life Tragedy</span>
          </div>
          <div className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">
            Album · Nick Carter
          </div>
          <h2 className="text-slate-900 text-[22px] font-bold">Love Life Tragedy</h2>

          {/* album-level tabs */}
          <div className="flex items-center gap-5 border-b border-slate-200 pt-1">
            <Tab label="Overview" />
            <Tab label="Tracks" badge="17" />
            <Tab label="Artwork" />
            <Tab label="Masters" />
            <Tab label="Bonus" active />
          </div>
        </div>

        {/* Intro */}
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11.5px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-800">Bonus content</span> ·
          Album-level extras — music videos, behind-the-scenes clips, studio
          photos, lyric sheets, liner notes. Shown to fans on the album page
          beneath the tracklist. Locked-down by default; hover any row to
          reveal edit controls.
        </div>

        {/* VIDEOS */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40 flex items-center justify-between gap-3">
            <div className="min-w-0 inline-flex items-center gap-2">
              <Video className="w-4 h-4 text-[#319ED8]" />
              <h3 className="text-slate-900 text-[14px] font-bold">Videos</h3>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                2
              </span>
            </div>
            <button className="text-[#319ED8] text-[11.5px] font-semibold hover:underline inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add video
            </button>
          </header>

          <div className="divide-y divide-slate-100">
            <VideoRow
              title="Made for Us — official music video"
              meta="3:42 · YouTube · Featured"
              thumb="from-[#FF5470] via-[#7F10A7] to-[#00062B]"
              locked
            />
            <VideoRow
              title="Behind the scenes: hallway shoot"
              meta="2:18 · Uploaded · Position 2"
              thumb="from-[#319ED8] via-[#4AFFCA] to-[#00062B]"
              locked
            />
          </div>
        </section>

        {/* PHOTOS */}
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <header className="px-4 py-3 border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/40 flex items-center justify-between gap-3">
            <div className="min-w-0 inline-flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#319ED8]" />
              <h3 className="text-slate-900 text-[14px] font-bold">Photos</h3>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                4
              </span>
            </div>
            <button className="text-[#319ED8] text-[11.5px] font-semibold hover:underline inline-flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Add photo
            </button>
          </header>

          <div className="p-3 grid grid-cols-3 gap-2">
            <PhotoTile gradient="from-[#FF5470] to-[#7F10A7]" caption="Cover shoot · roll 1" />
            <PhotoTile gradient="from-[#319ED8] to-[#4AFFCA]" caption="Mastering at Blackbird" />
            <PhotoTile gradient="from-[#7F10A7] to-[#00062B]" caption="Studio · Nashville TN" />
            <PhotoTile gradient="from-[#4AFFCA] to-[#319ED8]" caption="Hallway scene · BTS" />
            <PhotoTile gradient="from-[#FF5470] to-[#00062B]" caption="Acoustic session" />
            <PhotoTile gradient="from-[#319ED8] to-[#7F10A7]" caption="Release-day press" />
          </div>
        </section>

        {/* FUTURE BUCKETS (placeholder rows for what could land here later) */}
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-3">
          <div className="text-slate-400 text-[10px] font-semibold uppercase tracking-wider mb-2">
            Future bonus types (not built yet)
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11.5px] text-slate-500">
            <FutureRow icon="📝" label="Liner notes (PDF)" />
            <FutureRow icon="🎼" label="Lyric sheets (PDF)" />
            <FutureRow icon="🎙" label="Commentary audio" />
            <FutureRow icon="📰" label="Press kit" />
          </div>
          <p className="text-slate-400 text-[10.5px] mt-2 italic">
            Bucket scaffolding — wire each type up when a partner album asks
            for it. Videos + Photos are the only two we ship day-one.
          </p>
        </section>
      </div>
    </div>
  );
}

function VideoRow({
  title,
  meta,
  thumb,
  locked,
}: {
  title: string;
  meta: string;
  thumb: string;
  locked?: boolean;
}) {
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/70 transition-colors">
      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-slate-400 hover:text-slate-600 cursor-grab">
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <div
        className={[
          "w-16 h-10 rounded-md bg-gradient-to-br shadow-sm flex-shrink-0 relative flex items-center justify-center",
          thumb,
        ].join(" ")}
      >
        <Play className="w-4 h-4 text-white fill-white drop-shadow" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-slate-900 text-[12.5px] font-semibold truncate inline-flex items-center gap-1.5">
          {title}
          {locked && (
            <Lock className="w-2.5 h-2.5 text-slate-300 group-hover:hidden" />
          )}
        </div>
        <div className="text-slate-500 text-[11px] truncate">{meta}</div>
      </div>
      {/* hover-only edit affordances — matches user's preferred pattern */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="px-2 py-1 rounded-md text-slate-500 text-[11px] hover:bg-slate-100 inline-flex items-center gap-1">
          <Pencil className="w-3 h-3" /> Edit
        </button>
        <button className="px-2 py-1 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function PhotoTile({
  gradient,
  caption,
}: {
  gradient: string;
  caption: string;
}) {
  return (
    <div className="group relative rounded-lg overflow-hidden aspect-square">
      <div
        className={["absolute inset-0 bg-gradient-to-br", gradient].join(" ")}
      />
      {/* caption strip — only on hover, lock-by-default pattern */}
      <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/55 text-white text-[10.5px] opacity-0 group-hover:opacity-100 transition-opacity">
        {caption}
      </div>
      {/* edit/trash float top-right on hover */}
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="w-6 h-6 rounded-md bg-white/85 backdrop-blur flex items-center justify-center text-slate-600 hover:bg-white">
          <Pencil className="w-3 h-3" />
        </button>
        <button className="w-6 h-6 rounded-md bg-white/85 backdrop-blur flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-white">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {/* lock dot — visible at rest, hidden on hover */}
      <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/30 backdrop-blur flex items-center justify-center group-hover:opacity-0 transition-opacity">
        <Lock className="w-2.5 h-2.5 text-white/80" />
      </div>
    </div>
  );
}

function FutureRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="rounded-md border border-slate-200/80 bg-white px-2.5 py-1.5 inline-flex items-center gap-2">
      <span className="text-[13px]">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
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
        "px-0 pb-2 text-[12.5px] font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5",
        active
          ? "text-slate-900 border-[#319ED8]"
          : "text-slate-400 border-transparent hover:text-slate-600",
      ].join(" ")}
    >
      {label}
      {badge && (
        <span className="px-1.5 py-px rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}
