import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useDesktopShell,
  STOREFRONT_SIDEBAR_WIDTH,
} from "@/hooks/useDesktopShell";
import { chatEnabled } from "@/lib/platform";
import { subscribeChats, totalUnread } from "@/lib/chatStore";
const goodTunesLogo = "/figmaAssets/--.svg";

// Task #547 — Apple-Music-web-style fixed sidebar that takes over from
// the floating BottomNav pill at lg+ (≥1024px). Web only — Capacitor
// native shell stays on the bottom-nav pill regardless of viewport.
//
// Routes covered: /collection, /search, /recents, /playlists, /account*,
// /artist/:slug, /favorite-artists, /bookmarks. /album/* keeps its own
// pre-existing desktop layout (AlbumDetailDesktop renders its own
// sidebar) so we skip mounting here on that route to avoid a double
// sidebar.

interface UserPlaylist {
  id: string;
  name: string;
  artworks?: string[];
  songCount?: number;
}

const STOREFRONT_ROUTE_PREFIXES = [
  "/collection",
  "/search",
  "/recents",
  "/playlists",
  "/account",
  "/artist/",
  "/favorite-artists",
  "/bookmarks",
];

export function shouldRenderStorefrontSidebar(location: string): boolean {
  if (location === "/album" || location.startsWith("/album/")) return false;
  return STOREFRONT_ROUTE_PREFIXES.some(
    (p) => location === p || location.startsWith(p),
  );
}

function NavLink({
  active,
  onClick,
  icon,
  label,
  badge,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`relative w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "text-[color:var(--brand-blue)] bg-[rgba(49,158,216,0.14)]"
          : "text-white/70 hover:text-white hover:bg-white/[0.06]"
      }`}
    >
      <span className="w-6 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="text-xs font-bold px-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-white"
          style={{ background: "var(--brand-pink)" }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export function StorefrontSidebar() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const isDesktop = useDesktopShell();
  const [, setTick] = useState(0);
  useEffect(() => subscribeChats(() => setTick((n) => n + 1)), []);

  const { data: playlistsRaw } = useQuery<UserPlaylist[] | null>({
    queryKey: ["/api/playlists"],
    enabled: isDesktop && shouldRenderStorefrontSidebar(location) && !!user,
  });

  if (!isDesktop) return null;
  if (!shouldRenderStorefrontSidebar(location)) return null;
  if (!user) return null;

  const unread = chatEnabled ? totalUnread() : 0;
  const playlists = (playlistsRaw ?? []).slice(0, 12);

  const isLibrary =
    location === "/collection" || location === "/" || location.startsWith("/album");
  const isPlaylists =
    location === "/playlists" || location.startsWith("/playlist");
  const isRecents = location.startsWith("/recents");
  const isSearch = location.startsWith("/search");
  const isAccount = location.startsWith("/account");

  const avatarInitials = (user?.displayName || user?.username || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside
      className="hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col text-white"
      style={{
        width: STOREFRONT_SIDEBAR_WIDTH,
        background: "rgba(8, 12, 40, 0.92)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
      data-testid="storefront-sidebar"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <img src={goodTunesLogo} alt="" className="w-7 h-9" />
        <div className="leading-tight">
          <div className="text-white text-base font-bold tracking-tight">
            GoodTunes<span className="text-white/40 align-super text-xs ml-0.5">®</span>
          </div>
          <div className="text-white/40 text-xs">Player</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-hide">
        <div className="space-y-1">
          <NavLink
            active={isLibrary}
            onClick={() => navigate("/collection")}
            testId="sidebar-collection"
            label="Library"
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="4" height="18" rx="1" />
                <rect x="9" y="3" width="3" height="18" rx="1" />
                <rect x="14" y="3" width="7" height="11" rx="1" />
                <rect x="14" y="16" width="7" height="5" rx="1" />
              </svg>
            }
          />
          <NavLink
            active={isSearch}
            onClick={() => navigate("/search")}
            testId="sidebar-search"
            label="Search"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            }
          />
          <NavLink
            active={isRecents}
            onClick={() => navigate("/recents")}
            testId="sidebar-recents"
            label="Recents"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            }
          />
          <NavLink
            active={isPlaylists}
            onClick={() => navigate("/playlists")}
            testId="sidebar-playlists"
            label="Playlists"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M3 6h18M3 10h14M3 14h8" />
                <path d="M17 14v6M14 17h6" />
              </svg>
            }
          />
        </div>

        {playlists.length > 0 && (
          <>
            <div className="px-3 pt-6 pb-2 text-xs font-semibold uppercase tracking-wider text-white/35">
              Your Playlists
            </div>
            <div className="space-y-0.5">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() =>
                    navigate(`/playlists?playlist=${encodeURIComponent(pl.id)}`)
                  }
                  className="w-full flex items-center gap-3 px-3 h-9 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                  data-testid={`sidebar-playlist-${pl.id}`}
                >
                  <div
                    className="w-6 h-6 rounded flex-shrink-0 overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(135deg, #1D5E8F 0%, #4A1E8F 100%)",
                    }}
                  >
                    {pl.artworks?.[0] && (
                      <img
                        src={pl.artworks[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <span className="truncate flex-1 text-left">{pl.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </nav>

      {/* Account footer */}
      <button
        type="button"
        onClick={() => navigate("/account")}
        className={`flex items-center gap-3 mx-3 mb-4 px-3 py-2.5 rounded-xl transition-colors ${
          isAccount ? "bg-[rgba(49,158,216,0.14)]" : "hover:bg-white/[0.06]"
        }`}
        data-testid="sidebar-account"
      >
        <div
          className="relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          {user?.photoUrl ? (
            <img
              src={user.photoUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-xs font-semibold">
              {avatarInitials}
            </span>
          )}
          {unread > 0 && (
            <span
              aria-label={`${unread} unread messages`}
              className="absolute top-0 right-0 w-2.5 h-2.5"
              style={{
                background: "var(--brand-pink)",
                border: "1.5px solid var(--app-background)",
                borderRadius: 9999,
              }}
              data-testid="badge-sidebar-unread"
            />
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-white text-sm font-semibold truncate">
            {user?.displayName || user?.username || "Account"}
          </div>
          <div className="text-white/45 text-xs truncate">View profile</div>
        </div>
      </button>
    </aside>
  );
}
