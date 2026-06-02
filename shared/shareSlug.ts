// Task #965 — clean per-release share links on get.goodtunes.music/<slug>.
// One source of truth for slug normalization + validation so the admin
// editor (client), the PUT validator (server), and the public resolver
// all agree on what a legal slug is.

// Reserved single-segment paths that must NEVER resolve to an album by
// slug. These are either real top-level routes in client/src/App.tsx,
// server-served paths, or words we want to keep open for future routes.
// Keep this list lowercase; matching is done against the normalized slug.
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
  "forgot-password",
  "reset-password",
  "set-password",
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
