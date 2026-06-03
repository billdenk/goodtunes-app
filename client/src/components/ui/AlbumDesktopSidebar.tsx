import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { FanRailNav } from "@/components/ui/FanRailNav";

/* Brand tokens — kept inline so the primitive is self-contained and can
   live in the mockup sandbox via re-export (the sandbox alias can't
   reach `client/src` so anything it imports must be flat). */
export const BRAND_BG = "#00062B";
export const BRAND_BLUE = "#319ED8";

export type AlbumDesktopSidebarUser = {
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

/**
 * Desktop sidebar for the fan-facing Preview & Purchase shell.
 *
 * Graduated from `artifacts/mockup-sandbox/.../preview-purchase-desktop/
 * _shared.tsx`. The mockup sandbox keeps its own hand-maintained copy;
 * the shared nav items live in FanRailNav so this rail and the
 * storefront rail stay identical.
 */
export function AlbumDesktopSidebar({
  user,
  searchActive = false,
  onSearch,
}: {
  user?: AlbumDesktopSidebarUser | null;
  /** True while the album shell has swapped its content into search
   *  mode — highlights the Search row in the shared rail. */
  searchActive?: boolean;
  /** Selecting the top "Search" entry. The host swaps the main content
   *  area into search mode (the sidebar just highlights). */
  onSearch?: () => void;
}) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };
  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full text-fan-primary"
      style={{ width: 220, background: BRAND_BG }}
      data-testid="desktop-sidebar"
    >
      <div className="px-5 pt-6 pb-8">
        {/* Real GoodTunes brand mark (white wordmark, "Powered by GoGoodr"
            tagline baked into the asset) — replaces the prior stacked
            "Good / Tunes" text so the rail reads as the actual brand. */}
        <img
          src="/goodtunes-logo-white-sm.png"
          alt="GoodTunes®"
          className="w-[124px] h-auto block"
          decoding="async"
          draggable={false}
          data-testid="img-sidebar-logo"
        />
      </div>

      <nav className="px-2">
        <FanRailNav
          active={searchActive ? { kind: "search" } : null}
          onSearch={onSearch}
        />
      </nav>

      <div className="flex-1" />

      <div className="px-4 pb-6 pt-4">
        <div className="flex items-center gap-3 px-1">
          <button
            type="button"
            onClick={() => navigate("/account")}
            className="flex items-center gap-3 min-w-0 flex-1 rounded-lg -mx-1 px-1 py-1 text-left hover:bg-white/[0.06] transition-colors"
            data-testid="button-open-account"
          >
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-white/10"
              aria-hidden
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-fan-secondary text-[13px] font-semibold">
                  {(user?.displayName || user?.email || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-fan-primary text-[13px] font-semibold truncate">
                {user?.displayName || "Guest"}
              </div>
              {user?.email && (
                <div className="text-fan-secondary text-[11.5px] truncate">{user.email}</div>
              )}
            </div>
          </button>
          <button
            type="button"
            aria-label="Sign out"
            data-testid="button-signout"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-fan-secondary hover:text-white hover:bg-white/8 transition-colors flex-shrink-0"
            onClick={handleSignOut}
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  );
}
