import { useLocation } from "wouter";
import {
  Search,
  Library,
  Disc3,
  Music2,
  Users,
  ListMusic,
  Clock,
  type LucideIcon,
} from "lucide-react";

// Task #1074 — single source of truth for the desktop fan rail's nav
// items so the album-page rail (AlbumDesktopSidebar) and the storefront
// rail (StorefrontSidebar) stay byte-identical: same items, same order,
// same Apple-Music rounded highlight. Each rail keeps its own brand
// header + account footer; only this middle nav is shared.
//
// Order: Search · Collection (Albums/Songs/Artists) · Playlists · Recents.

export type CollectionTab = "albums" | "songs" | "artists";

export type FanRailActive =
  | { kind: "search" }
  | { kind: "collection"; tab: CollectionTab }
  | { kind: "playlists" }
  | { kind: "recents" }
  | null;

function Row({
  active,
  onClick,
  icon: Icon,
  label,
  indent = false,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  indent?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`relative w-full flex items-center gap-3 h-10 rounded-lg text-sm font-medium transition-colors ${
        indent ? "pl-11 pr-3" : "px-3"
      } ${
        active
          ? "text-[color:var(--brand-blue)] bg-[rgba(49,158,216,0.14)]"
          : "text-white/70 hover:text-white hover:bg-white/[0.06]"
      }`}
    >
      <span className="w-6 flex items-center justify-center flex-shrink-0">
        <Icon
          className={indent ? "w-[18px] h-[18px]" : "w-5 h-5"}
          strokeWidth={2}
        />
      </span>
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

export function FanRailNav({
  active,
  onSearch,
}: {
  active: FanRailActive;
  /** When provided, the Search row runs an in-page handler (the album
   *  shell swaps its content into search mode) instead of routing to
   *  /search. Omit on storefront pages so Search navigates normally. */
  onSearch?: () => void;
}) {
  const [, navigate] = useLocation();
  const isCollection = active?.kind === "collection";

  return (
    <div className="space-y-1">
      <Row
        testId="rail-search"
        icon={Search}
        label="Search"
        active={active?.kind === "search"}
        onClick={() => (onSearch ? onSearch() : navigate("/search"))}
      />

      <Row
        testId="rail-collection"
        icon={Library}
        label="Collection"
        active={false}
        onClick={() => navigate("/collection?tab=albums")}
      />
      <div className="space-y-0.5">
        <Row
          indent
          testId="rail-collection-albums"
          icon={Disc3}
          label="Albums"
          active={isCollection && active.tab === "albums"}
          onClick={() => navigate("/collection?tab=albums")}
        />
        <Row
          indent
          testId="rail-collection-songs"
          icon={Music2}
          label="Songs"
          active={isCollection && active.tab === "songs"}
          onClick={() => navigate("/collection?tab=songs")}
        />
        <Row
          indent
          testId="rail-collection-artists"
          icon={Users}
          label="Artists"
          active={isCollection && active.tab === "artists"}
          onClick={() => navigate("/collection?tab=artists")}
        />
      </div>

      <Row
        testId="rail-playlists"
        icon={ListMusic}
        label="Playlists"
        active={active?.kind === "playlists"}
        onClick={() => navigate("/playlists")}
      />
      <Row
        testId="rail-recents"
        icon={Clock}
        label="Recents"
        active={active?.kind === "recents"}
        onClick={() => navigate("/recents")}
      />
    </div>
  );
}
