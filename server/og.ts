import type { Request } from "express";
import { sql } from "drizzle-orm";
import { getAlbumMeta } from "../shared/albumMeta";
import { db } from "./db";
import { storage } from "./storage";
import { people } from "../shared/schema";
import { normalizeShareSlug, RESERVED_SLUGS } from "../shared/shareSlug";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

// Resolve a stored image reference (object-storage `/objects/uploads/<id>`,
// `/figmaAssets/...`, or already-absolute URL) into an absolute, publicly
// fetchable URL that an unfurl bot can GET without auth.
function absoluteUrl(base: string, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return `${base}${s}`;
  return `${base}/${s}`;
}

const DEFAULT_IMAGE_PATH = "/goodtunes-logo-color.png";

type OgInput = {
  title: string;
  description: string;
  image: string; // absolute URL
  url: string; // absolute URL
  type?: string; // og:type, defaults "website"
  imageAlt?: string;
  noindex?: boolean;
};

function buildTags(input: OgInput): string {
  const type = input.type ?? "website";
  const alt = input.imageAlt ?? input.title;
  const lines = [
    `<title>${escapeHtml(input.title)}</title>`,
    `<meta name="description" content="${escapeHtml(input.description)}">`,
    input.noindex
      ? `<meta name="robots" content="noindex, nofollow">`
      : `<meta name="robots" content="index, follow">`,
    `<meta property="og:site_name" content="GoodTunes">`,
    `<meta property="og:title" content="${escapeHtml(input.title)}">`,
    `<meta property="og:description" content="${escapeHtml(input.description)}">`,
    `<meta property="og:type" content="${escapeHtml(type)}">`,
    `<meta property="og:url" content="${escapeHtml(input.url)}">`,
    `<meta property="og:image" content="${escapeHtml(input.image)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(input.image)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(input.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(input.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(input.image)}">`,
  ];
  return lines.join("\n    ");
}

// Strip every meta/title tag we own from the template, then re-inject ours.
// Centralised so every entity (album, person, instrument, admin, default)
// goes through the same escape + replace path — no per-call regex drift.
function inject(template: string, input: OgInput): string {
  const tags = buildTags(input);
  let out = template;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(
    /<meta\s+(?:name|property)=["'](?:description|robots|og:site_name|og:title|og:description|og:type|og:url|og:image|og:image:[^"']+|twitter:card|twitter:title|twitter:description|twitter:image)["'][^>]*>\s*/gi,
    "",
  );
  out = out.replace(/<head>/i, `<head>\n    ${tags}`);
  return out;
}

// ─── Album ────────────────────────────────────────────────────────────────
// Tries the real DB first (covers everything Bill has added through admin),
// falls back to the hard-coded demo array in `shared/albumMeta.ts` so the
// four seeded demo albums still unfurl even on a fresh DB. Returns null
// when neither resolves so the caller can fall through to the default card
// instead of 404ing.
export async function injectAlbumOg(
  template: string,
  req: Request,
  albumId: string,
): Promise<string | null> {
  const base = getBaseUrl(req);
  const url = `${base}/album/${albumId}`;

  try {
    const row = await storage.getAlbumById(albumId);
    if (row && !row.isHidden) {
      const image =
        absoluteUrl(base, row.artwork) ?? `${base}${DEFAULT_IMAGE_PATH}`;
      const title = `${row.title} by ${row.artist} — GoodTunes®`;
      const description =
        (row.description && row.description.trim()) ||
        `Own ${row.title} by ${row.artist} on GoodTunes.`;
      return inject(template, {
        title,
        description,
        image,
        url,
        type: "music.album",
        imageAlt: `${row.title} album cover`,
      });
    }
  } catch {
    // fall through to demo / null
  }

  const demo = getAlbumMeta(albumId);
  if (demo) {
    const image = absoluteUrl(base, demo.artwork) ?? `${base}${DEFAULT_IMAGE_PATH}`;
    return inject(template, {
      title: `${demo.title} by ${demo.artist} — GoodTunes®`,
      description: demo.description,
      image,
      url,
      type: "music.album",
      imageAlt: `${demo.title} album cover`,
    });
  }
  return null;
}

// Task #965 — clean per-release share link unfurl. get.goodtunes.music/<slug>
// resolves the same buy-eligible release the public by-slug endpoint serves
// (getAlbumBySlug already filters hidden/trashed/sunrise) and rich-unfurls it
// with the album's own OG card so a pasted /<slug> looks like the release in
// iMessage/Slack. Returns null on no-match so the dispatcher can fall back to
// the branded default card.
export async function injectAlbumOgBySlug(
  template: string,
  req: Request,
  slug: string,
): Promise<string | null> {
  const base = getBaseUrl(req);
  try {
    const row = await storage.getAlbumBySlug(slug);
    if (row && !row.isHidden && !row.isPrepping) {
      const image =
        absoluteUrl(base, row.artwork) ?? `${base}${DEFAULT_IMAGE_PATH}`;
      const title = `${row.title} by ${row.artist} — GoodTunes®`;
      const description =
        (row.description && row.description.trim()) ||
        `Own ${row.title} by ${row.artist} on GoodTunes.`;
      return inject(template, {
        title,
        description,
        image,
        url: `${base}/${slug}`,
        type: "music.album",
        imageAlt: `${row.title} album cover`,
      });
    }
  } catch {
    // fall through to null
  }
  return null;
}

// ─── Artist / Person ──────────────────────────────────────────────────────
// Fan-side route is `/artist/:slug` where slug is the URL-encoded display
// name (see ArtistDetail.tsx). We do a case-insensitive name lookup so the
// unfurl bot doesn't need a separate slug column.
export async function injectArtistOg(
  template: string,
  req: Request,
  slug: string,
): Promise<string | null> {
  let name = "";
  try {
    name = decodeURIComponent(slug || "").trim();
  } catch {
    name = (slug || "").trim();
  }
  if (!name) return null;
  const base = getBaseUrl(req);
  const url = `${base}/artist/${encodeURIComponent(name)}`;

  try {
    const [row] = await db
      .select()
      .from(people)
      .where(sql`lower(${people.name}) = lower(${name})`)
      .limit(1);
    if (row) {
      const image =
        absoluteUrl(base, row.photoUrl) ??
        absoluteUrl(base, row.coverUrl) ??
        `${base}${DEFAULT_IMAGE_PATH}`;
      const description =
        (row.bio && row.bio.trim().split(/\s+/).slice(0, 40).join(" ")) ||
        `${row.name} on GoodTunes — own the music, support the artist.`;
      return inject(template, {
        title: `${row.name} — GoodTunes®`,
        description,
        image,
        url,
        type: "profile",
        imageAlt: row.name,
      });
    }
  } catch {
    // fall through
  }
  return null;
}

// ─── Instrument / Gear ────────────────────────────────────────────────────
export async function injectInstrumentOg(
  template: string,
  req: Request,
  instrumentId: string,
): Promise<string | null> {
  const base = getBaseUrl(req);
  try {
    const row = await storage.getInstrumentById(instrumentId);
    if (row) {
      const image =
        absoluteUrl(base, row.photoUrl) ?? `${base}${DEFAULT_IMAGE_PATH}`;
      const description =
        (row.about && row.about.trim().split(/\s+/).slice(0, 40).join(" ")) ||
        `${row.name} on GoodTunes.`;
      return inject(template, {
        title: `${row.name} — GoodTunes®`,
        description,
        image,
        url: `${base}/instrument/${instrumentId}`,
        type: "website",
        imageAlt: row.name,
      });
    }
  } catch {
    // fall through
  }
  return null;
}

// ─── Default branded card ────────────────────────────────────────────────
// Floor for any public route that didn't get a more specific injection
// (the mobile app root, unmatched paths). Promotes the inline defaults in
// client/index.html to absolute URLs so unfurl bots can fetch the image.
export function injectDefaultOg(
  template: string,
  req: Request,
  opts?: { noindex?: boolean },
): string {
  const base = getBaseUrl(req);
  const url = `${base}${req.originalUrl || "/"}`;
  return inject(template, {
    title: "GoodTunes",
    description:
      "GoodTunes® Player — own the music you love. Numbered, verified GoodDeeds for the artists and records that matter.",
    image: `${base}${DEFAULT_IMAGE_PATH}`,
    url,
    type: "website",
    imageAlt: "GoodTunes",
    noindex: opts?.noindex,
  });
}

// ─── Admin lockdown ───────────────────────────────────────────────────────
// Admin URLs MUST never leak record titles, names, or thumbnails into
// unfurls. Emit noindex + the same neutral branded card as the default.
export function injectAdminOg(template: string, req: Request): string {
  const base = getBaseUrl(req);
  return inject(template, {
    title: "GoodTunes Admin",
    description: "GoodTunes administrative console.",
    image: `${base}${DEFAULT_IMAGE_PATH}`,
    url: `${base}${req.originalUrl || "/admin"}`,
    type: "website",
    imageAlt: "GoodTunes",
    noindex: true,
  });
}

// Single dispatcher used by both the dev (Vite) and prod (static) middleware.
// Keeps the URL→injector mapping in one place so behaviour stays identical.
// Returns the rewritten template, or the original on no-match.
//
// Routes covered: /album/:id, /artist/:slug, /instrument/:id, all /admin/*,
// and the catch-all default. NOT covered (no public detail route exists in
// client/src/App.tsx today): /vendor/:id, /label/:id, /playlist/:id, song
// deep-links. Add them here when those pages ship.
// Auth-walled / single-use surfaces that should never appear in search
// indexes even when someone pastes the link. These still unfurl with the
// branded default card (so a shared invite link looks like GoodTunes in
// iMessage) but carry `noindex, nofollow` so Google/Bing skip them.
// Excludes /album/:id, /artist/:slug, /instrument/:id — those are
// shareable content surfaces with real entity OG.
function isAuthWalledPath(pathOnly: string): boolean {
  if (pathOnly === "/welcome") return true;
  if (pathOnly === "/login" || pathOnly === "/register") return true;
  if (pathOnly === "/forgot-password") return true;
  if (pathOnly.startsWith("/reset-password/")) return true;
  if (pathOnly === "/orders" || pathOnly === "/collection") return true;
  // Partner dashboards (one segment, no detail page).
  if (pathOnly === "/artist" || pathOnly === "/non-profit" || pathOnly === "/vendor") return true;
  // Single-use claim/redeem/invite tokens — must not be crawled.
  if (pathOnly.startsWith("/gift/")) return true;
  if (pathOnly.startsWith("/redeem/")) return true;
  if (pathOnly.startsWith("/invite/")) return true;
  return false;
}

export async function injectOgForUrl(
  template: string,
  req: Request,
): Promise<string> {
  const rawUrl = req.originalUrl || "/";
  const pathOnly = rawUrl.split("?")[0];
  const host = (req.get("host") || "").toLowerCase().split(":")[0];
  const isAdmin =
    host === "admin.goodtunes.music" || pathOnly === "/admin" || pathOnly.startsWith("/admin/");
  if (isAdmin) return injectAdminOg(template, req);

  const albumMatch = pathOnly.match(/^\/album\/([^/]+)\/?$/);
  if (albumMatch) {
    const out = await injectAlbumOg(template, req, albumMatch[1]);
    if (out) return out;
    return injectDefaultOg(template, req);
  }
  const artistMatch = pathOnly.match(/^\/artist\/([^/]+)\/?$/);
  if (artistMatch) {
    const out = await injectArtistOg(template, req, artistMatch[1]);
    if (out) return out;
    return injectDefaultOg(template, req);
  }
  const instrumentMatch = pathOnly.match(/^\/instrument\/([^/]+)\/?$/);
  if (instrumentMatch) {
    const out = await injectInstrumentOg(template, req, instrumentMatch[1]);
    if (out) return out;
    return injectDefaultOg(template, req);
  }

  // Task #965 — clean per-release share link. A single-segment path that
  // isn't a reserved word may be a release share slug. Normalize it the same
  // way the resolver does, skip reserved words (real routes / infra paths),
  // and try the by-slug album OG. On no-match fall through to the branded
  // default card. Multi-segment paths never reach here.
  const slugMatch = pathOnly.match(/^\/([^/]+)\/?$/);
  if (slugMatch) {
    const slug = normalizeShareSlug(decodeURIComponent(slugMatch[1]));
    if (slug && !RESERVED_SLUGS.has(slug)) {
      const out = await injectAlbumOgBySlug(template, req, slug);
      if (out) return out;
    }
  }

  if (isAuthWalledPath(pathOnly)) {
    return injectDefaultOg(template, req, { noindex: true });
  }
  return injectDefaultOg(template, req);
}
