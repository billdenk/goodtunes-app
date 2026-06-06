import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Search,
  Home as HomeIcon,
  Library,
  Music2,
  Users,
  ListMusic,
  Clock,
  ChevronRight,
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
// Collection item as indented children, instead of living in separate
// "Library"/"Playlists" sections whose indentation read as arbitrary.
// The fan's own playlists still fold in via `playlistsSlot` (storefront
// rail only), beneath the Playlists child. Top group is the primary
// destinations (Search, Home, Recents).
//
// Task #1440 — the tree spine (drawn left border) is replaced by a caret
// open/close disclosure, mirroring the admin sidebar's Section: a chevron
// rotates right→down and toggles the children with a Stripe-style spring
// (reduced-motion → instant). The Collection row still navigates; only the
// chevron toggles. Expanded state persists in localStorage. We borrow the
// interaction, not the admin coloring — the fan rail keeps its Apple-Music
// blue pill + white/70 idle chrome.

const COLLECTION_EXPANDED_KEY = "fan-rail:collection-expanded";

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
  const reduceMotion = useReducedMotion();

  const childActive =
    active?.kind === "songs" ||
    active?.kind === "artists" ||
    active?.kind === "playlists";

  // Mirror the admin sidebar's persistence: the stored value wins, and we
  // never auto-expand on later navigation. With no stored preference we
  // default open (expanded covers the case where a child is the active row).
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(COLLECTION_EXPANDED_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return childActive ? true : true;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLECTION_EXPANDED_KEY, expanded ? "1" : "0");
    } catch {}
  }, [expanded]);

  // Stripe-style spring on open; quick settle on close (same feel as the
  // admin Section). Reduced-motion users get an instant toggle.
  const openTransition = reduceMotion
    ? { duration: 0 }
    : {
        height: {
          type: "spring" as const,
          stiffness: 520,
          damping: 28,
          mass: 0.9,
        },
        opacity: { duration: 0.18, ease: "easeOut" as const },
      };
  const closeTransition = reduceMotion
    ? { duration: 0 }
    : {
        height: {
          duration: 0.18,
          ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
        },
        opacity: { duration: 0.12, ease: "easeIn" as const },
      };

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

      {/* Collection + its detail destinations as a caret disclosure. The
          chevron rotates right→down and toggles Songs / Artists / Playlists
          (and the fan's own playlists). The row itself still navigates to
          the Collection page; only the chevron toggles open/closed. */}
      <div
        className={`relative w-full flex items-center h-9 rounded-md text-sm font-medium transition-colors ${
          active?.kind === "collection"
            ? "text-[color:var(--brand-blue)] bg-[rgba(49,158,216,0.14)]"
            : "text-white/70 hover:text-white hover:bg-white/[0.06]"
        }`}
      >
        <button
          type="button"
          onClick={() => navigate(COLLECTION_HREF)}
          data-testid="rail-collection"
          className="flex-1 min-w-0 flex items-center gap-3 h-9 pl-3 text-left"
        >
          <span className="w-6 flex items-center justify-center flex-shrink-0">
            <Library className="w-[18px] h-[18px]" strokeWidth={2} />
          </span>
          <span className="flex-1 text-left truncate">Collection</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse Collection" : "Expand Collection"}
          data-testid="rail-collection-toggle"
          className="flex items-center justify-center h-9 w-9 flex-shrink-0 rounded-md text-fan-faint hover:text-fan-primary"
        >
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 520, damping: 28, mass: 0.9 }
            }
            className="flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="collection-children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expanded ? openTransition : closeTransition}
            style={{ overflow: "hidden" }}
          >
            <div className="ml-5 pl-1.5 space-y-0.5 pt-0.5">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
