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

// ── Task #3339 — press bring-your-own custom domain ─────────────────────────
//
// A press can point a subdomain of THEIR domain (vinyl.memphisrecordpressing
// .com) at our deployment via CNAME; once verified + operator-linked in
// Replit Domains it serves the same white-label skin as <slug>.makesvinyl.com.
// The static parser here can't know DB state — these helpers only decide
// (a) whether a typed hostname is an acceptable custom domain, and
// (b) whether a request host COULD be a custom domain (candidate), so the
// client/boot layers know to ask the DB-backed branding endpoint.

// The record a press adds at their DNS provider. Both apexes serve; we
// instruct the primary for consistency with minted links.
export const CUSTOM_DOMAIN_CNAME_TARGET = WHITELABEL_PRIMARY_APEX;

export type CustomDomainStatus = "pending_dns" | "pending_activation" | "active";

// Domain families a press may never claim as "their" custom domain: our own
// product hosts, the white-label family itself, and Replit infrastructure.
const PLATFORM_DOMAIN_SUFFIXES = [
  "goodtunes.music",
  "goodtunes.app",
  ...WHITELABEL_APEX_DOMAINS,
  "replit.app",
  "replit.dev",
  "repl.co",
  "replit.local",
] as const;

function hostIsUnderSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isPlatformOwnedHost(rawHost: string | undefined | null): boolean {
  const host = (rawHost || "").toLowerCase().split(":")[0];
  return PLATFORM_DOMAIN_SUFFIXES.some((s) => hostIsUnderSuffix(host, s));
}

const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type CustomDomainValidation =
  | { ok: true; host: string }
  | { ok: false; message: string };

// Validates a press-entered custom hostname. Accepts a bare hostname (also
// tolerates a pasted https:// URL — we keep only the hostname). Subdomain
// form is REQUIRED: we never take over a bare apex (that's their marketing
// site) and `www.` counts as the apex site too.
export function validateCustomWhitelabelDomain(raw: string): CustomDomainValidation {
  let input = (raw || "").trim().toLowerCase();
  input = input.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  if (!input) return { ok: false, message: "Enter a hostname like vinyl.yourpress.com." };
  if (input.length > 253) return { ok: false, message: "That hostname is too long." };
  const labels = input.split(".");
  if (labels.some((l) => !HOST_LABEL_RE.test(l))) {
    return { ok: false, message: "That doesn't look like a valid hostname — letters, numbers, and hyphens only." };
  }
  // TLD must be alphabetic — also rejects raw IPv4 literals.
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) {
    return { ok: false, message: "That doesn't look like a valid domain name." };
  }
  if (labels.length < 3) {
    return { ok: false, message: "Use a subdomain of your domain (vinyl.yourpress.com) — we can't take over your main domain." };
  }
  if (labels[0] === "www") {
    return { ok: false, message: "www is your main site — pick a dedicated subdomain like vinyl.yourpress.com." };
  }
  if (isPlatformOwnedHost(input)) {
    return { ok: false, message: "That domain is operated by the platform — use a subdomain of your own domain." };
  }
  return { ok: true, host: input };
}

// True when a request host is OUTSIDE every family we know statically —
// i.e. it can only be serving us because someone CNAMEd it here. The client
// treats candidates as white-label-flavored and asks /api/whitelabel/branding
// (which fail-closes: unknown/unverified hosts get the neutral page).
// Dev/preview/localhost hosts are never candidates.
export function isCustomWhitelabelCandidateHost(rawHost: string | undefined | null): boolean {
  const host = (rawHost || "").toLowerCase().split(":")[0];
  if (!host || !host.includes(".")) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[") || host.includes(":")) return false;
  if (isPlatformOwnedHost(host)) return false;
  if (!/^[a-z]{2,}$/.test(host.split(".").pop() || "")) return false;
  return true;
}
