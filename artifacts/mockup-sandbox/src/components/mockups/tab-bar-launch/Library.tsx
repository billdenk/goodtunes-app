import { Search, ArrowDownUp } from "lucide-react";

import {
  ALBUM_COVER,
  AlbumTile,
  BRAND_BLUE,
  PageHeader,
  PhoneFrame,
} from "./_shared";

/**
 * Library — recommended-bar mockup over a real-content Library view.
 *
 * Library absorbs Playlists (Apple-Music pattern: playlists live as a
 * tab inside Library, not as a top-level bar slot). The page's own
 * segmented control gains a fourth "Playlists" tab to host them.
 *
 * Bottom bar is the recommended 4-slot layout, Library active.
 */
export default function Library() {
  return (
    <PhoneFrame tab="library">
      <PageHeader
        title="Library"
        action={
          <div className="flex items-center gap-2">
            <CircleIconButton ariaLabel="Search">
              <Search size={18} color="white" strokeWidth={2.2} />
            </CircleIconButton>
            <CircleIconButton ariaLabel="Sort">
              <ArrowDownUp size={17} color="white" strokeWidth={2.2} />
            </CircleIconButton>
          </div>
        }
      />

      {/* Recently Played rail — unchanged from today */}
      <div className="mb-5">
        <div className="flex items-center justify-between px-5 mb-3">
          <h2 className="text-white text-[15px] font-bold">Recently Played</h2>
        </div>
        <div className="flex gap-3 px-5 overflow-x-auto scrollbar-hide pb-2">
          <RecentTile title="Love & Life Tragedy" artist="Nick Carter" cover={ALBUM_COVER} active />
          <RecentTile title="Quiet Storm" artist="Aisha Reyes" />
          <RecentTile title="Half Light" artist="Tom Linnen" />
          <RecentTile title="Westbound" artist="The Northern Pines" />
        </div>
      </div>

      {/* In-page segmented tabs — gains "Playlists" as a 4th option since
          Playlists is no longer a top-level tab. */}
      <div className="px-5 mb-4">
        <InPageTabs active="albums" />
      </div>

      {/* Album grid — matches today's Collection albums view */}
      <div className="px-5 pb-4 grid grid-cols-2 gap-4">
        <AlbumTile title="Love & Life Tragedy" artist="Nick Carter" cover={ALBUM_COVER} size={168} badge="supercredits" />
        <AlbumTile title="Quiet Storm" artist="Aisha Reyes" size={168} />
        <AlbumTile title="Half Light" artist="Tom Linnen" size={168} />
        <AlbumTile title="Westbound" artist="The Northern Pines" size={168} />
        <AlbumTile title="Iron & Cedar" artist="Wilson Drake" size={168} />
        <AlbumTile title="Saltwater Letters" artist="Pia Esposito" size={168} badge="supercredits" />
      </div>

      <Annotation />
    </PhoneFrame>
  );
}

function CircleIconButton({ children, ariaLabel }: { children: React.ReactNode; ariaLabel: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="w-11 h-11 rounded-full flex items-center justify-center"
      style={{
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {children}
    </button>
  );
}

function RecentTile({
  title,
  artist,
  cover,
  active,
}: {
  title: string;
  artist: string;
  cover?: string;
  active?: boolean;
}) {
  return (
    <button type="button" className="flex-shrink-0 flex flex-col text-left" style={{ width: 96 }}>
      <div
        className="rounded-2xl overflow-hidden mb-1.5"
        style={{
          width: 96,
          height: 96,
          background: "linear-gradient(135deg, #1a1f4a 0%, #2a1156 50%, #319ED8 120%)",
          boxShadow: active
            ? "0 0 0 2px #319ED8, 0 4px 16px rgba(0,0,0,0.5)"
            : "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        {cover && <img src={cover} alt={title} className="w-full h-full object-cover" />}
      </div>
      <p className="text-white text-[11px] font-semibold leading-tight truncate">{title}</p>
      <p className="text-white/45 text-[10px] leading-tight truncate mt-0.5">{artist}</p>
    </button>
  );
}

function InPageTabs({ active }: { active: "albums" | "songs" | "artists" | "playlists" }) {
  const tabs = [
    { id: "albums", label: "Albums" },
    { id: "songs", label: "Songs" },
    { id: "artists", label: "Artists" },
    { id: "playlists", label: "Playlists" },
  ] as const;
  const idx = tabs.findIndex((t) => t.id === active);
  return (
    <div className="relative flex p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.07)" }}>
      <div
        className="absolute top-1 bottom-1 rounded-lg"
        style={{
          width: "calc(25% - 2px)",
          left: `calc(${idx * 25}% + 2px)`,
          background: "rgba(49,158,216,0.22)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      />
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className="relative flex-1 py-2 rounded-lg text-xs font-semibold"
          style={{
            color: active === t.id ? BRAND_BLUE : "rgba(255,255,255,0.45)",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Annotation() {
  return (
    <div className="px-5 mt-2 mb-6">
      <div
        className="rounded-xl px-3.5 py-3 text-[11px] leading-relaxed"
        style={{
          background: "rgba(49,158,216,0.10)",
          border: "1px dashed rgba(49,158,216,0.45)",
          color: "rgba(255,255,255,0.75)",
        }}
      >
        <p className="text-[#319ED8] font-bold uppercase tracking-wider text-[9px] mb-1">
          What changed
        </p>
        <p>
          Playlists are no longer a bar slot — they're a tab{" "}
          <span className="text-white font-semibold">inside</span> Library
          (Apple-Music pattern). Frees the slot for Search.
        </p>
      </div>
    </div>
  );
}

export { Library };
