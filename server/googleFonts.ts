// Task #3410 — Google Fonts catalog fetch + cache.
//
// The completed-art fonts check classifies each unembedded font: if the
// family exists in the Google Fonts catalog (open licenses — legally
// redistributable) we can fetch it later to render mockups, so the customer
// sees "available via Google Fonts" instead of a dead-end failure. Adobe
// Fonts and other licensed foundry type can't be fetched programmatically,
// so anything not in this catalog routes to the upload-or-outline path.
//
// Failure canon: the catalog being unreachable must NEVER block or fail a
// scan — getGoogleFontsIndex resolves null and every unembedded font then
// reports "missing" (needs upload), the same honest fallback as no match.
// Success is cached in-memory for a day; failures are negative-cached
// briefly so a Google outage can't add a hung fetch to every check.

import { fontMatchKey } from "./validators/completedTemplate";

/** fontMatchKey(family) → canonical Google Fonts family name. */
export type GoogleFontsIndex = ReadonlyMap<string, string>;

const METADATA_URL = "https://fonts.google.com/metadata/fonts";
const FETCH_TIMEOUT_MS = 8_000;
const OK_TTL_MS = 24 * 60 * 60 * 1000; // catalog changes rarely
const FAIL_TTL_MS = 5 * 60 * 1000; // retry soon, but not per-request
// A real catalog has ~1,800 families; a tiny parse result means the
// response shape changed — treat as failure rather than mass "no match".
const MIN_PLAUSIBLE_FAMILIES = 100;

let cached: { at: number; index: GoogleFontsIndex | null } | null = null;
let inFlight: Promise<GoogleFontsIndex | null> | null = null;

/** Build the match index from a list of family names (also the test seam). */
export function buildGoogleFontsIndex(families: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const family of families) {
    const key = fontMatchKey(family);
    if (key && !index.has(key)) index.set(key, family);
  }
  return index;
}

/** Parse the fonts.google.com metadata payload (it may lead with the
 * anti-JSON-hijacking prefix `)]}'`). Returns family names or throws. */
export function parseGoogleFontsMetadata(text: string): string[] {
  const body = text.replace(/^\)\]\}'\s*/, "");
  const data = JSON.parse(body) as { familyMetadataList?: { family?: unknown }[] };
  const families = (data.familyMetadataList ?? [])
    .map((f) => (typeof f.family === "string" ? f.family.trim() : ""))
    .filter(Boolean);
  if (families.length < MIN_PLAUSIBLE_FAMILIES) {
    throw new Error(`implausibly small catalog (${families.length} families)`);
  }
  return families;
}

/**
 * Fetch (or return the cached) Google Fonts index. Never throws; null =
 * catalog currently unreachable (callers degrade to "needs upload").
 * Concurrent callers share one in-flight fetch.
 */
export async function getGoogleFontsIndex(): Promise<GoogleFontsIndex | null> {
  const now = Date.now();
  if (cached) {
    const ttl = cached.index ? OK_TTL_MS : FAIL_TTL_MS;
    if (now - cached.at < ttl) return cached.index;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(METADATA_URL, {
          signal: ctl.signal,
          headers: { accept: "application/json,text/plain,*/*" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const families = parseGoogleFontsMetadata(await res.text());
        const index = buildGoogleFontsIndex(families);
        cached = { at: Date.now(), index };
        return index;
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      // [completed-scan] canon: reason-coded, never blocking.
      console.warn(
        `[completed-scan] google-fonts catalog unavailable — unembedded fonts fall back to needs-upload: ${e?.message ?? e}`,
      );
      cached = { at: Date.now(), index: null };
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Test seam — clear the module cache between cases. */
export function __resetGoogleFontsCacheForTests(): void {
  cached = null;
  inFlight = null;
}
