import { type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Disc3,
  Music2,
  Users,
  ListMusic,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { collectionTabHref, type FanRailActive } from "@/lib/fanRail";

// Task #1074 — single source of truth for the desktop fan rail's nav
// items so the album-page rail (AlbumDesktopSidebar) and the storefront
// rail (StorefrontSidebar) stay byte-identical: same items, same order,
// same Apple-Music rounded highlight. Each rail keeps its own brand
// header + account footer; only this middle nav is shared.
//
// Task #1139 — grouped into Apple-Music-style sections: a top group
// (Search, no header), a "Library" header over Albums/Songs/Artists/
// Recents, and a "Playlists" header over the Playlists destination
// (plus, on the storefront rail, the fan's own playlists folded in via
// the `playlistsSlot` below).

// Task #1081 — the URL→active-state logic + tab types now live in
// `@/lib/fanRail` (pure, testable). Re-export the types so existing
// `from "@/components/ui/FanRailNav"` imports keep working.
export type { CollectionTab, FanRailActive } from "@/lib/fanRail";

function Row({
  active,
  onClick,
  icon: Icon,
  label,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`relative w-full flex items-center gap-3 h-9 rounded-md px-3 text-sm font-medium transition-colors ${
        active
          ? "text-[color:var(--brand-blue)] bg-[rgba(49,158,216,0.14)]"
          : "text-white/70 hover:text-white hover:bg-white/[0.06]"
      }`}
    >
      <span className="w-6 flex items-center justify-center flex-shrink-0">
        <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

/** Quiet uppercase muted section label — non-interactive, matches the
 *  existing "Your Playlists" header treatment so the rail's group
 *  headers read consistently. */
function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-xs font-semibold uppercase tracking-wider text-fan-faint">
      {children}
    </div>
  );
}

export function FanRailNav({
  active,
  onSearch,
  playlistsSlot,
}: {
  active: FanRailActive;
  /** When provided, the Search row runs an in-page handler (the album
   *  shell swaps its content into search mode) instead of routing to
   *  /search. Omit on storefront pages so Search navigates normally. */
  onSearch?: () => void;
  /** Rendered under the "Playlists" group header, beneath the Playlists
   *  destination row — the storefront rail passes the fan's own playlist
   *  rows here so they read as one cohesive Playlists section. The
   *  album-page rail omits it. */
  playlistsSlot?: ReactNode;
}) {
  const [, navigate] = useLocation();
  const isCollection = active?.kind === "collection";

  return (
    <div>
      {/* Top group — Search, no header. */}
      <div className="space-y-0.5">
        <Row
          testId="rail-search"
          icon={Search}
          label="Search"
          active={active?.kind === "search"}
          onClick={() => (onSearch ? onSearch() : navigate("/search"))}
        />
      </div>

      {/* Library group — Albums / Songs / Artists / Recents. The header
          replaces the old standalone "Collection" parent row; the
          destinations sit directly under it (de-indented). */}
      <GroupHeader>Library</GroupHeader>
      <div className="space-y-0.5">
        <Row
          testId="rail-collection-albums"
          icon={Disc3}
          label="Albums"
          active={isCollection && active.tab === "albums"}
          onClick={() => navigate(collectionTabHref("albums"))}
        />
        <Row
          testId="rail-collection-songs"
          icon={Music2}
          label="Songs"
          active={isCollection && active.tab === "songs"}
          onClick={() => navigate(collectionTabHref("songs"))}
        />
        <Row
          testId="rail-collection-artists"
          icon={Users}
          label="Artists"
          active={isCollection && active.tab === "artists"}
          onClick={() => navigate(collectionTabHref("artists"))}
        />
        <Row
          testId="rail-recents"
          icon={Clock}
          label="Recents"
          active={active?.kind === "recents"}
          onClick={() => navigate("/recents")}
        />
      </div>

      {/* Playlists group — the Playlists destination, then the fan's own
          playlists (folded in via `playlistsSlot` on the storefront rail;
          the album-page rail leaves the slot empty). */}
      <GroupHeader>Playlists</GroupHeader>
      <div className="space-y-0.5">
        <Row
          testId="rail-playlists"
          icon={ListMusic}
          label="Playlists"
          active={active?.kind === "playlists"}
          onClick={() => navigate("/playlists")}
        />
        {playlistsSlot}
      </div>
    </div>
  );
}
