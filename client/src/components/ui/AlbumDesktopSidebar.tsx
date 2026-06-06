import { useLocation } from "wouter";
import { FanRailNav } from "@/components/ui/FanRailNav";

/* Brand tokens — kept inline so the primitive is self-contained and can
   live in the mockup sandbox via re-export (the sandbox alias can't
   reach `client/src` so anything it imports must be flat). */
export const BRAND_BG = "#00062B";
export const BRAND_BLUE = "#319ED8";

/* Shared floating-card values — must match StorefrontSidebar exactly. */
const RAIL_CARD_BG = "rgba(8, 12, 40, 0.92)";
const RAIL_CARD_BORDER_RADIUS = 16;
const RAIL_CARD_BORDER = "1px solid rgba(255,255,255,0.10)";
const RAIL_CARD_SHADOW = "0 8px 32px rgba(0,0,0,0.32)";
const RAIL_INSET = 12;

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
  // A logged-out visitor (no fan/admin session) landing on a shared
  // Preview & Purchase link sees a stripped rail: just the GoodTunes
  // lockup up top and a branded "Log in" CTA pinned to the bottom. The
  // Collection/Search nav + account footer are meaningless until they
  // have an account, so we hide them rather than dead-end.
  const loggedIn = !!user;
  return (
    <aside
      className="flex flex-col flex-shrink-0 text-fan-primary overflow-hidden"
      style={{
        width: 220,
        background: RAIL_CARD_BG,
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: RAIL_CARD_BORDER_RADIUS,
        border: RAIL_CARD_BORDER,
        boxShadow: RAIL_CARD_SHADOW,
        margin: `${RAIL_INSET}px 0 ${RAIL_INSET}px ${RAIL_INSET}px`,
        alignSelf: "stretch",
      }}
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

      {loggedIn && (
        <nav className="px-2">
          <FanRailNav
            active={searchActive ? { kind: "search" } : null}
            onSearch={onSearch}
          />
        </nav>
      )}

      <div className="flex-1" />

      {loggedIn ? (
        <div className="px-4 pb-6 pt-4">
          <div className="flex items-center gap-3 px-1">
            <button
              type="button"
              onClick={() => navigate("/account")}
              className="flex items-center gap-3 min-w-0 flex-1 rounded-lg -mx-1 px-1 py-1 text-left hover:bg-white/[0.06] transition-colors"
              data-testid="button-open-account"
            >
              <div
                className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-white/[0.18] ring-1 ring-white/30"
                aria-hidden
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-fan-primary text-[13px] font-semibold">
                    {(user?.displayName || user?.email || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-fan-primary text-[13px] font-semibold truncate">
                  {user?.displayName || "Guest"}
                </div>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-6 pt-4">
          <button
            type="button"
            onClick={() => {
              const next = window.location.pathname + window.location.search;
              navigate(`/login?next=${encodeURIComponent(next)}`);
            }}
            className="w-full h-11 rounded-full font-semibold text-sm text-fan-primary transition-opacity hover:opacity-90"
            style={{ background: BRAND_BLUE }}
            data-testid="button-fan-login"
          >
            Log in
          </button>
        </div>
      )}
    </aside>
  );
}
