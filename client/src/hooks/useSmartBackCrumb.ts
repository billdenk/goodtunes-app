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
  // "partner" is a generic origin used by the shared org Contacts panel
  // (OrganizationPeople): the origin page passes its own href + display
  // name directly via the URL, so it needs no ORIGINS config or name
  // fetch. Every other origin is a keyed ORIGINS entry.
  origin: SmartBackOrigin | "partner";
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
  // Generic partner Contacts-panel back-link: the origin page passes its
  // own href + display name directly so no ORIGINS entry / name fetch is
  // needed. See OrganizationPeople.
  let partnerHref: string | null = null;
  let partnerName: string | null = null;
  try {
    const sp = new URLSearchParams(search);
    const from = sp.get("from");
    if (from === "partner") {
      const href = sp.get("backHref");
      // Only honor internal admin paths — a crafted URL must not be able
      // to point the breadcrumb at an off-site/arbitrary destination.
      partnerHref = href && href.startsWith("/admin/") ? href : null;
      partnerName = sp.get("backName");
    } else if (from && (from in ORIGINS)) {
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

  if (partnerHref) {
    return {
      origin: "partner",
      id: partnerHref,
      name: partnerName ?? "Back",
      href: partnerHref,
      testId: "link-back-to-partner",
    };
  }

  if (!cfg || !id) return null;
  const name = data?.name ?? data?.title ?? cfg.fallbackName;

  let track: SmartBackCrumbTrack | undefined;
  if (origin === "album" && trackId) {
    const song = data?.songs?.find((s) => s.id === trackId);
    if (song) {
      track = {
        id: trackId,
        name: song.title,
        href: `/admin/albums/${id}/tracks/${trackId}?tt=credits`,
        testId: `link-back-to-track-${trackId}`,
      };
    }
  }

  return {
    origin: origin!,
    id,
    name,
    // When a track is in scope the "Album" crumb lands on the album with
    // that row scrolled-to + highlighted (?track=), while the "Track"
    // sub-crumb (track.href) deep-links the dedicated track page.
    href: track ? `${cfg.href(id)}?track=${track.id}` : cfg.href(id),
    testId: `link-back-to-${cfg.testIdPrefix}-${id}`,
    track,
  };
}
