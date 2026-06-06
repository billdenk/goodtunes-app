import { type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  Search,
  Home as HomeIcon,
  Library,
  Music2,
  Users,
  ListMusic,
  Clock,
  type LucideIcon,
} from "lucide-react";
import {
  HOME_HREF,
  COLLECTION_HREF,
  COLLECTION_SONGS_HREF,
  COLLECTION_ARTISTS_HREF,
  type FanRailActive,
} from "@/lib/fanRail";

// Task #1074 — single source of truth for the desktop fan rail's nav
// items so the album-page rail (AlbumDesktopSidebar) and the storefront
// rail (StorefrontSidebar) stay byte-identical: same items, same order,
// same Apple-Music rounded highlight. Each rail keeps its own brand
// header + account footer; only this middle nav is shared.
//
// Task #1404 — desktop/tablet rail cleanup: the Collection detail
// destinations (Songs, Artists, Playlists) now nest directly UNDER the
// Collection item as indented children with a tree spine, instead of
// living in separate "Library"/"Playlists" sections whose indentation
// read as arbitrary. The fan's own playlists still fold in via
// `playlistsSlot` (storefront rail only), beneath the Playlists child.
// Top group is the primary destinations (Search, Home, Recents).

// Task #1081 — the URL→active-state logic + types now live in
// `@/lib/fanRail` (pure, testable). Re-export the type so existing
// `from "@/components/ui/FanRailNav"` imports keep working.
export type { FanRailActive } from "@/lib/fanRail";

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
  /** Rendered beneath the Playlists child row, inside the Collection
   *  sub-tree — the storefront rail passes the fan's own playlist rows
   *  here so they read as one cohesive Playlists group. The album-page
   *  rail omits it. */
  playlistsSlot?: ReactNode;
}) {
  const [, navigate] = useLocation();

  return (
    <div className="space-y-0.5">
      {/* Top group — the primary destinations. */}
      <Row
        testId="rail-search"
        icon={Search}
        label="Search"
        active={active?.kind === "search"}
        onClick={() => (onSearch ? onSearch() : navigate("/search"))}
      />
      <Row
        testId="rail-home"
        icon={HomeIcon}
        label="Home"
        active={active?.kind === "home"}
        onClick={() => navigate(HOME_HREF)}
      />
      <Row
        testId="rail-recents"
        icon={Clock}
        label="Recents"
        active={active?.kind === "recents"}
        onClick={() => navigate("/recents")}
      />

      {/* Collection + its detail destinations as indented children. The
          left border is a tree spine so Songs / Artists / Playlists (and
          the fan's own playlists) clearly belong to Collection. */}
      <Row
        testId="rail-collection"
        icon={Library}
        label="Collection"
        active={active?.kind === "collection"}
        onClick={() => navigate(COLLECTION_HREF)}
      />
      <div className="ml-5 border-l border-white/[0.08] pl-1.5 space-y-0.5">
        <Row
          testId="rail-collection-songs"
          icon={Music2}
          label="Songs"
          active={active?.kind === "songs"}
          onClick={() => navigate(COLLECTION_SONGS_HREF)}
        />
        <Row
          testId="rail-collection-artists"
          icon={Users}
          label="Artists"
          active={active?.kind === "artists"}
          onClick={() => navigate(COLLECTION_ARTISTS_HREF)}
        />
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
