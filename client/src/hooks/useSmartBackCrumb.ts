import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

/**
 * Smart cross-section breadcrumb.
 *
 * When an admin detail page is arrived at via a deep-link from a
 * sibling section (e.g. People → Gear, Gear → Person, Gear → Vendor),
 * the first crumb on the destination should point BACK at the origin
 * row instead of the canonical section root ("People", "Gear",
 * "Vendors"). The signal is carried over the URL as
 *
 *   ?from=<entity>&<entity>Id=<id>
 *
 * so refreshes + share-links still resolve correctly without any
 * client state.
 *
 * The `album` origin additionally accepts an optional `&trackId=<id>`
 * so a credit tapped from inside a track row carries the track
 * context forward. When present the hook returns a second-segment
 * `track` crumb and rewrites the album href to deep-link the row
 * open on landing, so the breadcrumb reads `<Album> › <Track> ›
 * <Person>` and either segment returns the user to the exact row
 * they came from.
 *
 * Consumers render the returned `{ name, href, testId }` as the first
 * crumb when present, and fall back to their canonical section link
 * when this hook returns `null`. See `replit.md` → "Cross-section deep
 * links" for the full convention + how to extend it to a new entity.
 */
export type SmartBackOrigin = "instrument" | "person" | "vendor" | "album" | "label";

interface OriginConfig {
  /** Query-param name carrying the origin row's id. */
  param: string;
  /** API path that returns `{ id, name }` (or `{ id, title }` for albums). */
  apiKey: (id: string) => readonly unknown[];
  /** Admin route the back-crumb links to. */
  href: (id: string) => string;
  /** Used to build the `data-testid` on the rendered link. */
  testIdPrefix: string;
  /** Section-root label to show while the name is loading or missing. */
  fallbackName: string;
}

const ORIGINS: Record<SmartBackOrigin, OriginConfig> = {
  instrument: {
    param: "instrumentId",
    apiKey: (id) => ["/api/instruments", id],
    href: (id) => `/admin/instruments/${id}`,
    testIdPrefix: "instrument",
    fallbackName: "Gear",
  },
  person: {
    param: "personId",
    apiKey: (id) => ["/api/people", id],
    href: (id) => `/admin/people/${id}`,
    testIdPrefix: "person",
    fallbackName: "Person",
  },
  vendor: {
    param: "vendorId",
    apiKey: (id) => ["/api/vendors", id],
    href: (id) => `/admin/vendors/${id}`,
    testIdPrefix: "vendor",
    fallbackName: "Vendor",
  },
  album: {
    param: "albumId",
    apiKey: (id) => ["/api/albums", id],
    href: (id) => `/admin/albums/${id}`,
    testIdPrefix: "album",
    fallbackName: "Album",
  },
  label: {
    param: "labelId",
    apiKey: (id) => ["/api/labels", id],
    href: (id) => `/admin/labels/${id}`,
    testIdPrefix: "label",
    fallbackName: "Label",
  },
};

export interface SmartBackCrumbTrack {
  id: string;
  name: string;
  href: string;
  testId: string;
}

export interface SmartBackCrumb {
  origin: SmartBackOrigin;
  id: string;
  name: string;
  href: string;
  testId: string;
  /**
   * Optional second segment for the `album` origin when the deep-link
   * carried a `trackId`. Present iff the album's songs list has been
   * fetched AND contains a matching row, so unknown / mistyped ids
   * silently fall back to the two-segment crumb.
   */
  track?: SmartBackCrumbTrack;
}

export function useSmartBackCrumb(): SmartBackCrumb | null {
  const { user } = useAuth();
  const search = typeof window !== "undefined" ? window.location.search : "";

  let origin: SmartBackOrigin | null = null;
  let id: string | null = null;
  let trackId: string | null = null;
  try {
    const sp = new URLSearchParams(search);
    const from = sp.get("from");
    if (from && (from in ORIGINS)) {
      origin = from as SmartBackOrigin;
      const cfg = ORIGINS[origin];
      id = sp.get(cfg.param);
      if (origin === "album") {
        trackId = sp.get("trackId");
      }
    }
  } catch {
    /* malformed query string — fall through to null crumb */
  }

  const cfg = origin ? ORIGINS[origin] : null;
  const { data } = useQuery<{
    id: string;
    name?: string;
    title?: string;
    songs?: Array<{ id: string; title: string }>;
  }>({
    queryKey: cfg && id ? cfg.apiKey(id) : ["smart-back-crumb-disabled"],
    enabled: !!user?.isAdmin && !!cfg && !!id,
  });

  if (!cfg || !id) return null;
  const name = data?.name ?? data?.title ?? cfg.fallbackName;

  let track: SmartBackCrumbTrack | undefined;
  if (origin === "album" && trackId) {
    const song = data?.songs?.find((s) => s.id === trackId);
    if (song) {
      track = {
        id: trackId,
        name: song.title,
        href: `${cfg.href(id)}?track=${trackId}`,
        testId: `link-back-to-track-${trackId}`,
      };
    }
  }

  return {
    origin: origin!,
    id,
    name,
    // When a track is in scope BOTH crumb segments deep-link the row
    // open — tapping "Album" vs "Track" lands the user on the same
    // expanded row, since either intent is "go back to where I was."
    href: track ? `${cfg.href(id)}?track=${track.id}` : cfg.href(id),
    testId: `link-back-to-${cfg.testIdPrefix}-${id}`,
    track,
  };
}
