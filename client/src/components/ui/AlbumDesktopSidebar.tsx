import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Search, Compass, Music2, Users, LifeBuoy, Bell, LogOut } from "lucide-react";

/* Brand tokens — kept inline so the primitive is self-contained and can
   live in the mockup sandbox via re-export (the sandbox alias can't
   reach `client/src` so anything it imports must be flat). */
export const BRAND_BG = "#00062B";
export const BRAND_BLUE = "#319ED8";

type NavKey = "search" | "discover" | "songs" | "artists";

function NavRow({
  icon,
  label,
  active,
  onClick,
  href,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
          style={{ background: BRAND_BLUE }}
        />
      )}
      <span className="[&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>
      <span className="text-[14px] font-semibold tracking-[-0.005em]">{label}</span>
    </>
  );
  const cls = "relative w-full h-11 pl-5 pr-3 flex items-center gap-3 rounded-lg transition-colors";
  const style = {
    background: active ? "rgba(49,158,216,0.16)" : "transparent",
    color: active ? "#fff" : "rgba(255,255,255,0.72)",
  } as const;
  if (href) {
    return (
      <Link
        href={href}
        data-testid={`nav-${label.toLowerCase()}`}
        className={cls}
        style={style}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cls}
      style={style}
    >
      {inner}
    </button>
  );
}

export type AlbumDesktopSidebarUser = {
  displayName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

/**
 * Desktop sidebar for the fan-facing Preview & Purchase shell.
 *
 * Graduated from `artifacts/mockup-sandbox/.../preview-purchase-desktop/
 * _shared.tsx`. Re-exported by the sandbox via a thin shim so the
 * mockup canvas stays in sync.
 */
export function AlbumDesktopSidebar({
  user,
  activeKey = "discover",
  onSearch,
  onSignOut,
}: {
  user?: AlbumDesktopSidebarUser | null;
  activeKey?: NavKey;
  /** Selecting the top "Search" entry. The host swaps the main content
   *  area into search mode (the sidebar just highlights). */
  onSearch?: () => void;
  onSignOut?: () => void;
}) {
  const [active, setActive] = useState<NavKey>(activeKey);
  // Stay in sync with the host-controlled key so toggling search mode
  // (or landing back on the album) re-highlights the right row.
  useEffect(() => setActive(activeKey), [activeKey]);
  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full text-white"
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

      <nav className="px-2 flex flex-col gap-0.5">
        <NavRow
          icon={<Search strokeWidth={1.9} />}
          label="Search"
          active={active === "search"}
          onClick={() => {
            setActive("search");
            onSearch?.();
          }}
        />
        <NavRow
          icon={<Compass strokeWidth={1.9} />}
          label="Discover"
          active={active === "discover"}
          onClick={() => setActive("discover")}
          href="/collection"
        />
        <NavRow
          icon={<Music2 strokeWidth={1.9} />}
          label="Songs"
          active={active === "songs"}
          onClick={() => setActive("songs")}
        />
        <NavRow
          icon={<Users strokeWidth={1.9} />}
          label="Artists"
          active={active === "artists"}
          onClick={() => setActive("artists")}
        />
      </nav>

      <div className="mx-5 my-6 h-px bg-white/8" />

      <nav className="px-2 flex flex-col gap-0.5">
        <NavRow icon={<LifeBuoy strokeWidth={1.9} />} label="Support" />
        <NavRow icon={<Bell strokeWidth={1.9} />} label="Notifications" />
      </nav>

      <div className="flex-1" />

      <div className="px-4 pb-6 pt-4">
        <div className="flex items-center gap-3 px-1">
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-white/10"
            aria-hidden
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/70 text-[13px] font-semibold">
                {(user?.displayName || user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-[13px] font-semibold truncate">
              {user?.displayName || "Guest"}
            </div>
            {user?.email && (
              <div className="text-white/45 text-[11.5px] truncate">{user.email}</div>
            )}
          </div>
          <button
            type="button"
            aria-label="Sign out"
            data-testid="button-signout"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            onClick={onSignOut}
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  );
}
