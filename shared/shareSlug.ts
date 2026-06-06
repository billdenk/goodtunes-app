// Task #965 — clean per-release share links on get.goodtunes.music/<slug>.
// Task #1310 — two-part artist/album share links: get.goodtunes.music/<artist>/<album>.
// One source of truth for slug normalization + validation so the admin
// editor (client), the PUT validator (server), and the public resolver
// all agree on what a legal slug is.

// Reserved single-segment paths that must NEVER resolve to an album by
// slug. These are either real top-level routes in client/src/App.tsx,
// server-served paths, or words we want to keep open for future routes.
// Keep this list lowercase; matching is done against the normalized slug.
// NOTE: Every first segment of a two-segment route in App.tsx (e.g. /album/:id,
// /artist/:slug, /g/:shortId) must also be in this set so an artist share slug
// can never shadow a real route — enforced by the drift-guard test in
// shared/shareSlug.test.ts.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // server / infra paths
  "api",
  "objects",
  "assets",
  "figmaassets",
  "sitemap",
  "sitemap.xml",
  "robots",
  "robots.txt",
  "manifest",
  "favicon",
  "share",
  ".well-known",
  // auth + account routes
  "login",
  "logout",
  "register",
  "signup",
  "signin",
  "account",
  "delete-account",
  "forgot-password",
  "reset-password",
  "set-password",
  "delete-account",
  "verify",
  "welcome",
  "welcome-back",
  "welcome-invitee",
  "finish-setup",
  "invite",
  "accept",
  // catalog / app routes
  "album",
  "albums",
  "artist",
  "artists",
  "song",
  "songs",
  "collection",
  "library",
  "store",
  "storefront",
  "instrument",
  "instruments",
  "gear",
  "playlist",
  "playlists",
  "orders",
  "order",
  "cart",
  "checkout",
  "gift",
  "redeem",
  "vendor",
  "vendors",
  "label",
  "labels",
  "non-profit",
  "nonprofit",
  "manufacturer",
  "manufacturers",
  "fulfillment",
  "manager",
  "press",
  "presses",
  // Task #1310 — /g/:shortId (cert provenance short-link; first segment
  // must be reserved even though "g" can't pass the min-length slug check,
  // so the drift-guard test never flags it as missing).
  "g",
  // admin
  "admin",
  // misc
  "about",
  "help",
  "support",
  "terms",
  "privacy",
  "contact",
  "home",
  "search",
  "chat",
  "recents",
  "error",
]);

export const SHARE_SLUG_MIN = 2;
export const SHARE_SLUG_MAX = 64;

// Canonical host that fronts the clean per-release share links
// (get.goodtunes.music/<artist>/<album>). One source of truth so the admin editor,
// the fan copy-link buttons, and OG/unfurl all build the same URL.
export const SHARE_LINK_HOST = "get.goodtunes.music";

// Build the clean public share URL for a saved single slug (legacy — prefer
// shareUrlForSlugs for new two-part links). Callers should only pass an
// already-saved slug (normalize first if it came from raw input).
export function shareUrlForSlug(slug: string): string {
  return `https://${SHARE_LINK_HOST}/${slug}`;
}

// Task #1310 — Build the two-part public share URL from the artist slug
// and album slug. Both should already be saved/normalized before calling.
export function shareUrlForSlugs(artistSlug: string, albumSlug: string): string {
  return `https://${SHARE_LINK_HOST}/${artistSlug}/${albumSlug}`;
}

// Normalize any operator input into a URL-safe slug:
// lowercase, ASCII letters/digits/hyphens only, no leading/trailing or
// doubled hyphens. Spaces and underscores collapse to a single hyphen.
export function normalizeShareSlug(input: string): string {
  return (input || "")
    .toLowerCase()
    .trim()
    // accented latin → ascii where possible
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ShareSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: string };

// Validate a RAW operator input. Returns the normalized slug on success,
// or a human-readable reason on failure. Callers that want to clear the
// slug should pass an empty string and treat `ok:false` "empty" specially
// (server treats empty input as "clear the slug", not an error).
export function validateShareSlug(input: string): ShareSlugValidation {
  const slug = normalizeShareSlug(input);
  if (!slug) {
    return { ok: false, reason: "Enter a slug using letters, numbers, and hyphens." };
  }
  if (slug.length < SHARE_SLUG_MIN) {
    return { ok: false, reason: `Slug must be at least ${SHARE_SLUG_MIN} characters.` };
  }
  if (slug.length > SHARE_SLUG_MAX) {
    return { ok: false, reason: `Slug must be ${SHARE_SLUG_MAX} characters or fewer.` };
  }
  // A purely-numeric slug would collide with how some surfaces treat ids;
  // require at least one letter so slugs read like names, not numbers.
  if (!/[a-z]/.test(slug)) {
    return { ok: false, reason: "Slug must contain at least one letter." };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, reason: `"${slug}" is a reserved word — pick another.` };
  }
  return { ok: true, slug };
}
