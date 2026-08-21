// Task #3258 — makesvinyl.com / pressesvinyl.com white-label host family.
//
// A press with a saved white-label slug gets a branded customer-family host
// (e.g. mrp.makesvinyl.com) that fronts the SAME SPA bundle as
// my.goodtunes.music. Estimate share links (/e/:token) and press-referred
// invite links generate on that host when the slug is set; the login /
// invite-accept / estimate surfaces skin themselves from the press's
// white-label branding (accent, corner style, logo kit, contact line).
//
// This module is shared client+server so host-kind mapping, slug parsing,
// and origin building can never drift between the two sides. Pure functions
// only — no imports.

// Both apex domains resolve identically; makesvinyl.com is the PRIMARY one
// used when WE build a link (pressesvinyl.com is an alias that also serves).
export const WHITELABEL_APEX_DOMAINS = ["makesvinyl.com", "pressesvinyl.com"] as const;
export const WHITELABEL_PRIMARY_APEX = WHITELABEL_APEX_DOMAINS[0];

// Slugs a press may never claim — infrastructure labels plus anything that
// could read as "official" on a shared apex.
export const RESERVED_WHITELABEL_SLUGS = new Set([
  "www", "api", "app", "mail", "smtp", "imap", "ftp", "ns1", "ns2",
  "admin", "my", "get", "store", "login", "auth", "static", "cdn",
  "goodtunes", "support", "help", "status", "dev", "staging", "test",
]);

// DNS label rules, tightened: 2-40 chars, lowercase alnum + hyphen, no
// leading/trailing hyphen. (1-char slugs read like typos; keep them out.)
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;

export function isValidWhitelabelSlug(slug: string): boolean {
  const s = slug.toLowerCase();
  return SLUG_RE.test(s) && !RESERVED_WHITELABEL_SLUGS.has(s);
}

export type ParsedWhitelabelHost = {
  apex: (typeof WHITELABEL_APEX_DOMAINS)[number];
  // The press slug, or null for the bare apex / www / a structurally
  // invalid label (multi-level, reserved). null renders the neutral page.
  slug: string | null;
};

// Strips an optional :port, lowercases, and classifies the host. Returns
// null when the host is not in the white-label family at all.
export function parseWhitelabelHost(rawHost: string | undefined | null): ParsedWhitelabelHost | null {
  const host = (rawHost || "").toLowerCase().split(":")[0];
  for (const apex of WHITELABEL_APEX_DOMAINS) {
    if (host === apex) return { apex, slug: null };
    if (host.endsWith(`.${apex}`)) {
      const label = host.slice(0, -(apex.length + 1));
      // Only a single, valid, non-reserved label counts as a press slug.
      // www./deep.sub. and reserved labels land on the neutral page.
      if (!label.includes(".") && isValidWhitelabelSlug(label)) {
        return { apex, slug: label };
      }
      return { apex, slug: null };
    }
  }
  return null;
}

export function isWhitelabelHost(rawHost: string | undefined | null): boolean {
  return parseWhitelabelHost(rawHost) !== null;
}

// The origin we mint links on for a press slug. Always the primary apex —
// pressesvinyl.com serves too, but every link WE generate is consistent.
export function whitelabelOriginForSlug(slug: string): string {
  return `https://${slug.toLowerCase()}.${WHITELABEL_PRIMARY_APEX}`;
}

export function whitelabelHostForSlug(slug: string): string {
  return `${slug.toLowerCase()}.${WHITELABEL_PRIMARY_APEX}`;
}
