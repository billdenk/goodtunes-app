import { useLocation } from "wouter";
import { Settings, LogOut } from "lucide-react";
import { FanRailNav } from "@/components/ui/FanRailNav";
import { useAuth } from "@/hooks/useAuth";
import { STOREFRONT_SIDEBAR_WIDTH } from "@/hooks/useDesktopShell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
 *
 * Task #1566 — this wrapper is reconciled with StorefrontSidebar so the
 * rail looks fixed in place as the fan moves between the album page and
 * every other tab: same 260px width, same logo/header + nav padding, and
 * a bottom account chip at full parity (w-11 avatar, name + "View
 * profile" subtitle, account dropdown). The only intentional divergence
 * is the layout mechanism — this rail sits in the album flex layout with
 * a stretch margin (rather than the storefront's fixed top/left card) and
 * bakes the safe-area + always-on compact-dock clearance into the footer.
 */
export function AlbumDesktopSidebar({
  user,
  searchActive = false,
  onSearch,
  hideLogin = false,
}: {
  user?: AlbumDesktopSidebarUser | null;
  /** True while the album shell has swapped its content into search
   *  mode — highlights the Search row in the shared rail. */
  searchActive?: boolean;
  /** Selecting the top "Search" entry. The host swaps the main content
   *  area into search mode (the sidebar just highlights). */
  onSearch?: () => void;
  /** Task #1784 — on the public preview surfaces (/hope, /staging) we hide the
   *  logged-out "Log in" rail button so the page reads as a clean preview and
   *  doesn't push reviewers/fans into the auth flow. */
  hideLogin?: boolean;
}) {
  const [, navigate] = useLocation();
  const { logout } = useAuth();
  // The album-detail page always mounts its compact dock, which now stays
  // tucked in the content channel between the rails at EVERY desktop width
  // and never overlaps this rail (Apple-Music parity, Task #1764). So the
  // bottom-pinned account chip just keeps the storefront chip's `mb-4`
  // (16px) resting gap; we still always add the device safe-area inset so
  // the chip clears the home indicator in the Capacitor webview.
  const chipMarginBottom = `calc(16px + env(safe-area-inset-bottom, 0px))`;
  // A logged-out visitor (no fan/admin session) landing on a shared
  // Preview & Purchase link sees a stripped rail: just the GoodTunes
  // lockup up top and a branded "Log in" CTA pinned to the bottom. The
  // Collection/Search nav + account footer are meaningless until they
  // have an account, so we hide them rather than dead-end.
  const loggedIn = !!user;

  const accountName = user?.displayName || user?.email || "Account";
  const avatarInitials = (user?.displayName || user?.email || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  return (
    <aside
      className="flex flex-col flex-shrink-0 text-fan-primary overflow-hidden"
      style={{
        width: STOREFRONT_SIDEBAR_WIDTH,
        background: RAIL_CARD_BG,
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: RAIL_CARD_BORDER_RADIUS,
        border: RAIL_CARD_BORDER,
        boxShadow: RAIL_CARD_SHADOW,
        // Top margin honors the device top safe-area (status bar / clock /
        // date) inside the Capacitor webview — like Apple Music's sidebar —
        // so the rail card clears the iPad clock; falls back to RAIL_INSET on
        // the web where the inset is 0. The rail is `alignSelf: stretch` in
        // the 100dvh flex shell, so a larger top margin shrinks the card from
        // the top rather than pushing its bottom under the home indicator.
        margin: `max(${RAIL_INSET}px, env(safe-area-inset-top, 0px)) 0 ${RAIL_INSET}px ${RAIL_INSET}px`,
        alignSelf: "stretch",
      }}
      data-testid="desktop-sidebar"
    >
      {/* Brand — white wordmark, matches StorefrontSidebar's px-5 pt-6 pb-5 */}
      <div className="px-5 pt-6 pb-5">
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
        <nav className="px-3">
          <FanRailNav
            active={searchActive ? { kind: "search" } : null}
            onSearch={onSearch}
          />
        </nav>
      )}

      <div className="flex-1" />

      {loggedIn ? (
        /* Account footer — mirrors StorefrontSidebar's identity chip +
           dropdown so the rail reads identically across tabs. */
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-3 mx-3 mb-4 px-3 py-2.5 rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-blue)] hover:bg-white/[0.06]"
              style={{ marginBottom: chipMarginBottom }}
              data-testid="sidebar-account"
            >
              <div
                className="relative w-11 h-11 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white text-xs font-semibold">
                    {avatarInitials}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-white text-sm font-semibold truncate">
                  {accountName}
                </div>
                <div className="text-[color:var(--brand-blue)] text-xs truncate">
                  View profile
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={8}
            className="w-60 border-0 bg-[rgba(20,24,52,0.92)] text-white shadow-2xl backdrop-blur-xl"
            style={{
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
            }}
            data-testid="menu-sidebar-account"
          >
            <div className="px-2 py-2">
              <div
                className="text-white text-sm font-semibold truncate"
                data-testid="text-account-name"
              >
                {accountName}
              </div>
            </div>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={() => navigate("/account")}
              data-testid="menu-item-account-settings"
              className="cursor-pointer text-fan-primary focus:bg-white/10 focus:text-white"
            >
              <Settings className="w-4 h-4 mr-2 text-fan-secondary" />
              Account settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              onClick={handleSignOut}
              data-testid="menu-item-sign-out"
              className="cursor-pointer text-[color:var(--brand-pink)] focus:bg-[rgba(255,84,112,0.14)] focus:text-[color:var(--brand-pink)]"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : hideLogin ? null : (
        <div className="px-4 pt-4" style={{ paddingBottom: chipMarginBottom }}>
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
