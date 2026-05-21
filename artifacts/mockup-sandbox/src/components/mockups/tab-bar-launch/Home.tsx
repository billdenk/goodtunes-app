import { ChevronRight, Play } from "lucide-react";
import { SiQobuz } from "react-icons/si";

import {
  ALBUM_COVER,
  AlbumTile,
  ARTIST_PHOTO,
  BRAND_BLUE,
  Chip,
  FanAvatar,
  PageHeader,
  PhoneFrame,
  SectionHeader,
} from "./_shared";

/**
 * Home — recommended-bar mockup over a real-content Home view.
 *
 * Shows the proposed first-tab content in context:
 *   • Streaming-live banner ("X Album is live on Qobuz")
 *   • Continue Listening rail
 *   • New on GoodTunes rail (with one SuperCredits chip)
 *   • Albums with SuperCredits rail
 *
 * Bottom bar is the recommended 4-slot layout, Home active.
 */
export default function Home() {
  return (
    <PhoneFrame tab="home">
      <PageHeader
        title="Home"
        action={<FanAvatar initials="NC" />}
      />

      {/* Streaming-live banner — only renders when the album the fan owns
          has just gone live on their preferred streaming service. */}
      <div className="px-5 mb-6">
        <button
          type="button"
          className="w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
          style={{
            background: "linear-gradient(135deg, rgba(74,255,202,0.14) 0%, rgba(49,158,216,0.16) 100%)",
            border: "1px solid rgba(74,255,202,0.32)",
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <SiQobuz size={22} color="#4AFFCA" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#4AFFCA] text-[10px] font-bold uppercase tracking-wider">
              Live on streaming
            </p>
            <p className="text-white text-[14px] font-semibold leading-tight">
              Love &amp; Life Tragedy is live on Qobuz
            </p>
            <p className="text-white/55 text-[12px] leading-tight mt-0.5">
              Tap to open in Qobuz →
            </p>
          </div>
          <ChevronRight size={18} color="rgba(255,255,255,0.55)" />
        </button>
      </div>

      {/* Continue Listening rail */}
      <SectionHeader title="Continue Listening" />
      <div className="flex gap-3 px-5 overflow-x-auto scrollbar-hide pb-2 mb-6">
        <AlbumTile title="Love & Life Tragedy" artist="Nick Carter" cover={ALBUM_COVER} size={150} />
        <AlbumTile title="Quiet Storm" artist="Aisha Reyes" size={150} />
        <AlbumTile title="Half Light" artist="Tom Linnen" size={150} />
        <AlbumTile title="Westbound" artist="The Northern Pines" size={150} />
      </div>

      {/* New on GoodTunes rail */}
      <SectionHeader title="New on GoodTunes" />
      <div className="flex gap-3 px-5 overflow-x-auto scrollbar-hide pb-2 mb-6">
        <AlbumTile title="Visionary Apothecary" artist="Mara Holloway" size={150} badge="supercredits" />
        <AlbumTile title="Iron & Cedar" artist="Wilson Drake" size={150} />
        <AlbumTile title="Saltwater Letters" artist="Pia Esposito" size={150} badge="supercredits" />
        <AlbumTile title="Highway 9" artist="Cole Marquez" size={150} />
      </div>

      {/* Featured artist card — "from artists you own" */}
      <SectionHeader title="From artists you own" />
      <div className="px-5 mb-6">
        <button
          type="button"
          className="w-full rounded-2xl overflow-hidden flex items-center text-left"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <img
            src={ARTIST_PHOTO}
            alt="Nick Carter"
            className="w-[88px] h-[88px] object-cover flex-shrink-0"
            style={{ objectPosition: "50% 20%" }}
          />
          <div className="flex-1 min-w-0 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: BRAND_BLUE }}>
              New single
            </p>
            <p className="text-white text-[14px] font-semibold truncate leading-tight">
              Nick Carter — "Storms"
            </p>
            <p className="text-white/55 text-[12px] leading-tight mt-0.5 truncate">
              Out now on GoodTunes
            </p>
          </div>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
            style={{ background: BRAND_BLUE }}
          >
            <Play size={16} color="white" fill="white" />
          </div>
        </button>
      </div>

      {/* Albums with SuperCredits rail */}
      <SectionHeader title="Albums with SuperCredits™" />
      <div className="flex gap-3 px-5 overflow-x-auto scrollbar-hide pb-2 mb-2">
        <AlbumTile title="Love & Life Tragedy" artist="Nick Carter" cover={ALBUM_COVER} size={140} badge="supercredits" />
        <AlbumTile title="Saltwater Letters" artist="Pia Esposito" size={140} badge="supercredits" />
        <AlbumTile title="Visionary Apothecary" artist="Mara Holloway" size={140} badge="supercredits" />
      </div>
      <p className="px-5 text-white/40 text-[11px] leading-relaxed pb-2">
        See every musician — and the gear they used — on these albums.
      </p>

      {/* Annotation overlay — labels the bar so the operator sees what's
          new at a glance. Keeps the mock self-documenting. */}
      <Annotation />
    </PhoneFrame>
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
          Bottom-bar changes
        </p>
        <p>
          <span className="text-white font-semibold">Home</span> &middot;{" "}
          <span className="text-white font-semibold">Library</span> &middot;{" "}
          <span className="text-white font-semibold">Search</span> &middot;{" "}
          <span className="text-white font-semibold">Account</span>
        </p>
        <p className="mt-1.5 text-white/55">
          Drops Chat &amp; Playlists. Home is new — picks up the
          streaming-live banner + curated rails. Search reserves the slot
          for the post-launch surface.
        </p>
      </div>
    </div>
  );
}

export { Home };
