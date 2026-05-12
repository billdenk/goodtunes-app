import type { Request } from "express";
import { getAlbumMeta } from "../shared/albumMeta";

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

export function injectAlbumOg(template: string, req: Request, albumId: string): string | null {
  const album = getAlbumMeta(albumId);
  if (!album) return null;

  const base = getBaseUrl(req);
  const title = `${album.title} by ${album.artist} — GoodTunes®`;
  const description = album.description;
  const image = `${base}${album.artwork}`;
  const url = `${base}/album/${album.id}`;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="music.album">`,
    `<meta property="og:url" content="${escapeHtml(url)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(image)}">`,
    `<meta property="og:image:width" content="500">`,
    `<meta property="og:image:height" content="500">`,
    `<meta property="og:image:alt" content="${escapeHtml(album.title + " album cover")}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
  ].join("\n    ");

  let out = template;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, "");
  out = out.replace(
    /<meta\s+(?:name|property)=["'](?:description|og:title|og:description|og:type|og:url|og:image|og:image:[^"']+|twitter:card|twitter:title|twitter:description|twitter:image)["'][^>]*>\s*/gi,
    "",
  );
  out = out.replace(/<head>/i, `<head>\n    ${tags}`);
  return out;
}
