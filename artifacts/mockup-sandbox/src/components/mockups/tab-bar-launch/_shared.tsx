import { type ReactNode } from "react";
import { Home, Library, Search, User, Music2 } from "lucide-react";

import albumCover from "../../../assets/albums/love-life-tragedy.png";
import nickPhoto from "../../../assets/people/nick-carter.jpg";

export const BRAND_BG = "#00062B";
export const BRAND_BLUE = "#319ED8";
export const HEART_PINK = "#FF5470";

export const ALBUM_COVER = albumCover;
export const ARTIST_PHOTO = nickPhoto;

export type TabId = "home" | "library" | "search" | "account";

const TABS: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "library", label: "Library", Icon: Library },
  { id: "search", label: "Search", Icon: Search },
  { id: "account", label: "Account", Icon: User },
];

/**
 * Recommended launch bar — 4 slots, glass pill, matches today's
 * BottomNav chrome so the operator can compare like-for-like.
 *
 * Built inline here (not graduated into `client/src/components/ui/`)
 * because this surface is still under review. Once signed off, the
 * follow-up implementation task ports it into `BottomNav.tsx`.
 */
export function LaunchBar({ active }: { active: TabId }) {
  const glassStyle = {
    background: "rgba(28, 30, 48, 0.55)",
    backdropFilter: "blur(36px) saturate(200%)",
    WebkitBackdropFilter: "blur(36px) saturate(200%)",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 8px 36px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset",
  } as const;

  return (
    <div className="absolute bottom-3 left-3 right-3 pointer-events-auto" data-testid="launch-bar">
      <nav
        className="flex items-center justify-around px-2 py-2 rounded-full"
        style={glassStyle}
      >
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              className="relative flex flex-col items-center gap-[2px] min-w-[78px]"
              data-testid={`launch-tab-${id}`}
            >
              <span
                aria-hidden
                className="absolute rounded-full"
                style={{
                  background: isActive ? "rgba(49,158,216,0.18)" : "transparent",
                  left: "-2px",
                  right: "-2px",
                  top: "-3px",
                  bottom: "-4px",
                }}
              />
              <div className="relative w-14 h-7 flex items-center justify-center">
                <Icon
                  size={23}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  color={isActive ? BRAND_BLUE : "rgba(255,255,255,0.42)"}
                />
              </div>
              <span
                className="relative text-[10px] font-medium"
                style={{ color: isActive ? BRAND_BLUE : "rgba(255,255,255,0.42)" }}
              >
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/** Phone-shaped 390px-wide frame with safe brand bg and centered column. */
export function PhoneFrame({ children, tab }: { children: ReactNode; tab: TabId }) {
  return (
    <div
      className="w-full min-h-screen flex items-start justify-center py-6"
      style={{
        background: "#0b0d24",
        fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif",
      }}
    >
      <div
        className="relative w-[390px] h-[820px] rounded-[44px] overflow-hidden shadow-2xl"
        style={{ background: BRAND_BG, border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="absolute inset-0 overflow-y-auto pb-[120px] scrollbar-hide">
          {children}
        </div>
        <LaunchBar active={tab} />
      </div>
    </div>
  );
}

/** Apple-Music-style large header. */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between px-5 pt-14 pb-3">
      <h1 className="text-white text-[34px] font-bold leading-none tracking-tight">{title}</h1>
      {action}
    </header>
  );
}

/** Tiny chip used to label SuperCredits albums + streaming-live banner. */
export function Chip({ label, tone = "blue" }: { label: string; tone?: "blue" | "mint" | "pink" }) {
  const colorMap: Record<string, string> = {
    blue: BRAND_BLUE,
    mint: "#4AFFCA",
    pink: HEART_PINK,
  };
  const c = colorMap[tone];
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-[10px] font-bold uppercase tracking-wider"
      style={{ background: `${c}22`, color: c, border: `1px solid ${c}44` }}
    >
      <Music2 size={9} />
      {label}
    </span>
  );
}

/** Mock fan-name avatar circle — matches today's Account tile chrome. */
export function FanAvatar({ initials = "NC", size = 32 }: { initials?: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "linear-gradient(135deg, #319ED8 0%, #7F10A7 100%)",
        border: "1px solid rgba(255,255,255,0.16)",
      }}
    >
      {initials}
    </div>
  );
}

/** Stand-in album tile. We only have one real cover in the sandbox, so the
 *  rest use brand-gradient placeholders with synthetic titles. */
export function AlbumTile({
  title,
  artist,
  cover,
  badge,
  size = 168,
}: {
  title: string;
  artist: string;
  cover?: string;
  badge?: "supercredits" | null;
  size?: number;
}) {
  return (
    <div className="flex flex-col" style={{ width: size }}>
      <div
        className="rounded-2xl overflow-hidden mb-2 relative"
        style={{
          width: size,
          height: size,
          background:
            "linear-gradient(135deg, #1a1f4a 0%, #2a1156 50%, #319ED8 120%)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        {cover && <img src={cover} alt={title} className="w-full h-full object-cover" />}
        {badge === "supercredits" && (
          <div className="absolute bottom-2 left-2 right-2 flex">
            <Chip label="SuperCredits" tone="mint" />
          </div>
        )}
      </div>
      <p className="text-white text-[13px] font-semibold leading-tight truncate">{title}</p>
      <p className="text-white/45 text-[11px] leading-tight mt-0.5 truncate">{artist}</p>
    </div>
  );
}

/** Section header for Home/Library rails. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-5 mb-3">
      <h2 className="text-white text-[17px] font-bold leading-tight">{title}</h2>
    </div>
  );
}
