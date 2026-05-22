// Helpers for the per-track "From Dropbox link" credits importer.
//
// Pure module — no DB, no Express, no fetch. Two responsibilities:
//   1) URL hygiene: validate the host is Dropbox, force `dl=1` so the
//      shared link returns the raw bytes instead of an HTML viewer,
//      and tell folder shares apart from single-file shares.
//   2) Filename matching: given a song title and a folder listing,
//      pick the single best-matching file (or refuse on ambiguity).
//
// The route layer wires these helpers into the existing
// streamDropboxEntries / fetchDropboxFileBytes / credits-LLM pipeline.

export function isDropboxHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === "dropbox.com" || host === "www.dropbox.com") return true;
  if (host === "dl.dropboxusercontent.com") return true;
  // Per-bucket download subdomain Dropbox redirects single-file
  // shares to (e.g. ucb01a3.dl.dropboxusercontent.com).
  if (/^[a-z0-9-]+\.dl\.dropboxusercontent\.com$/i.test(host)) return true;
  return false;
}

export function normalizeDropboxDownloadUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a URL.");
  }
  if (u.protocol !== "https:") {
    throw new Error("Dropbox links must use https://.");
  }
  if (!isDropboxHost(u)) {
    throw new Error("That doesn't look like a Dropbox link.");
  }
  // Force the raw-bytes variant. Dropbox returns an HTML preview page
  // by default — `dl=1` flips it to a direct download.
  u.searchParams.set("dl", "1");
  return u;
}

// A Dropbox folder share path looks like `/scl/fo/<id>/<rlkey>` (new
// format) or `/sh/<id>/<rlkey>` (older shares). Single-file shares are
// `/scl/fi/<id>/<filename>` or `/s/<id>/<filename>`.
export function isDropboxFolderUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!isDropboxHost(u)) return false;
    return /^\/(scl\/fo|sh)\//i.test(u.pathname);
  } catch {
    return false;
  }
}

function fuzzy(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stripExt(name: string): string {
  const base = name.split("/").pop() ?? name;
  const i = base.lastIndexOf(".");
  return i === -1 ? base : base.slice(0, i);
}

export type FilenameMatchResult<T> =
  | { kind: "exact"; hit: T }
  | { kind: "substring"; hit: T }
  | { kind: "none" }
  | { kind: "ambiguous"; candidates: T[] };

// Pick the single file that best matches a song title. Mirrors the
// lyrics-importer matching ladder so the two importers behave the same
// way and refuse rather than guess when more than one file plausibly
// matches.
//
//   tier 1 — exact fuzzy equality (alphanumerics only, diacritics stripped)
//   tier 2 — substring either direction, ONLY when one candidate matches
//   otherwise — "none" or "ambiguous" so the operator can rename + retry
export function pickBestFilenameMatch<T extends { filename: string }>(
  songTitle: string,
  candidates: T[],
): FilenameMatchResult<T> {
  const target = fuzzy(songTitle);
  if (!target || candidates.length === 0) return { kind: "none" };
  const keyed = candidates.map((c) => ({ c, key: fuzzy(stripExt(c.filename)) }));

  const exact = keyed.filter((k) => k.key === target);
  if (exact.length === 1) return { kind: "exact", hit: exact[0].c };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact.map((k) => k.c) };

  const sub = keyed.filter(
    (k) => k.key && (k.key.includes(target) || target.includes(k.key)),
  );
  if (sub.length === 1) return { kind: "substring", hit: sub[0].c };
  if (sub.length > 1) return { kind: "ambiguous", candidates: sub.map((k) => k.c) };

  return { kind: "none" };
}
