// SAFE-ZONE STUDY of the GoodDeed Instagram Story. Renders the exact same
// StoryCard from Stories.tsx (single source of truth — no layout drift) with
// Instagram's own UI mocked ON TOP, so we can see what gets covered. The shaded
// pink bands are the strips Meta reserves for its chrome on a 1080×1920 frame
// (2026 spec): TOP ~250px = 13% (progress bar + profile row) and BOTTOM ~320px
// ≈ 17% — the March-2026 UNIFIED Stories+Reels reserve (organic Stories alone is
// only ~250px/13%, but we design to the larger Reels tray so one asset is safe
// in both placements).
import "./_group.css";
import { StoryCard, TOP_SAFE, BOTTOM_SAFE } from "./Stories";

function IgChrome() {
  return (
    <>
      {/* ===== TOP unsafe band — Instagram profile chrome ===== */}
      <div
        className="absolute left-0 right-0 top-0 flex flex-col justify-between"
        style={{
          height: TOP_SAFE,
          background: "rgba(255,84,112,0.16)",
          borderBottom: "1.5px dashed rgba(255,84,112,0.7)",
        }}
      >
        {/* story progress bar */}
        <div className="flex gap-1 px-3 pt-2">
          <span className="flex-1 h-[3px] rounded-full bg-white/85" />
          <span className="flex-1 h-[3px] rounded-full bg-white/30" />
          <span className="flex-1 h-[3px] rounded-full bg-white/30" />
        </div>
        {/* profile row */}
        <div className="flex items-center justify-between px-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-white/30 border border-white/50" />
            <span className="text-white text-xs font-semibold">goodtunes.music</span>
            <span className="text-white/60 text-xs">now</span>
          </div>
          <span className="text-white text-lg leading-none">×</span>
        </div>
        <span className="absolute right-2 top-1 text-[9px] font-bold tracking-wide" style={{ color: "rgba(255,84,112,0.95)" }}>
          IG UI · ~250px (13%)
        </span>
      </div>

      {/* ===== BOTTOM unsafe band — Instagram reply / reaction chrome ===== */}
      <div
        className="absolute left-0 right-0 bottom-0 flex items-center gap-2 px-3"
        style={{
          height: BOTTOM_SAFE,
          background: "rgba(255,84,112,0.16)",
          borderTop: "1.5px dashed rgba(255,84,112,0.7)",
        }}
      >
        <div className="flex-1 h-9 rounded-full border border-white/50 flex items-center px-3">
          <span className="text-white/70 text-xs">Send message</span>
        </div>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        <span className="absolute right-2 top-1 text-[9px] font-bold tracking-wide" style={{ color: "rgba(255,84,112,0.95)" }}>
          IG UI · ~320px (17%, Stories+Reels)
        </span>
      </div>
    </>
  );
}

export function StoriesSafeZone() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#05030f" }}>
      <StoryCard overlay={<IgChrome />} />
    </div>
  );
}
