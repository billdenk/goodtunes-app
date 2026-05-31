// Renders the GoodDeed link-preview (Open Graph) image with @napi-rs/canvas.
// This is the thumbnail crawlers (iMessage, Twitter/X, BlueSky, Facebook,
// Discord, WhatsApp) fetch when a fan shares the `/share/cert` link, so it
// must be a real raster PNG at a public URL.
//
// Approved design ("Texting · California gradient, logo right" — locked on the
// canvas 2026-05-31): the album art wrapped in a GoodTunes-orange frame, a navy
// bottom gradient scrim, and the white GoodTunes logo floated bottom-RIGHT (the
// right corner avoids the album's own bottom-left title text). We do NOT bake
// the album/owner/number text into the image — the messaging app draws that
// from the OG/Twitter meta tags (the "native caption"), so the picture stays
// clean and the text stays crisp.
//
// @napi-rs/canvas is already a dependency (vendorColorScrape) and is
// externalized in script/build.ts, so this adds no new native deps.
import path from "path";
import { existsSync, readFileSync } from "fs";

export interface CertOgInput {
  album: string;
  artist: string;
  owner: string;
  num: string; // already zero-padded, digits only
  artUrl: string | null; // absolute or relative path to album art
  origin: string;
}

// 1200×840 (~1.43:1) mirrors the approved mockup's framed-art proportions and
// renders full-bleed in iMessage/WhatsApp/Discord (the texting surfaces this
// card is for). Twitter center-crops to ~1.91:1, which is acceptable secondary.
const W = 1200;
const H = 840;
const BORDER = 30; // orange frame thickness around the art
const ART_RADIUS = 18;

// Brand palette (see replit.md / index.css).
const BG = "#00062B";
const ORANGE = "#FF7C06"; // GoodTunes logo orange — share-card framing
const PANEL_A = "#1B3A8C";
const PANEL_B = "#2A1670";
const WHITE = "#ffffff";

let fontsReady = false;
function ensureFonts(GlobalFonts: any) {
  if (fontsReady) return;
  try {
    const dir = path.join(process.cwd(), "server", "assets", "fonts");
    const reg = path.join(dir, "DejaVuSans.ttf");
    const bold = path.join(dir, "DejaVuSans-Bold.ttf");
    if (existsSync(reg)) GlobalFonts.registerFromPath(reg, "GoodTunes Sans");
    if (existsSync(bold)) GlobalFonts.registerFromPath(bold, "GoodTunes Sans Bold");
  } catch {
    // If registration fails we fall back to whatever the system fontconfig
    // provides (DejaVu is present on the NixOS base in dev and prod).
  }
  fontsReady = true;
}

function fontFamily(bold: boolean) {
  return bold
    ? `"GoodTunes Sans Bold", "DejaVu Sans", sans-serif`
    : `"GoodTunes Sans", "DejaVu Sans", sans-serif`;
}

// Block private / link-local / cloud-metadata hosts so the public `art` param
// can never make the server reach internal infrastructure, even in the (edge-
// only) case where the Host header is spoofed so origin host === art host.
// Loopback/localhost are intentionally NOT blocked: in dev the app's own origin
// *is* localhost, and the same-host check means loopback only ever resolves
// back to this app — the dangerous targets are the metadata endpoint and
// private LAN ranges, which a legitimate public origin never uses.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h.endsWith(".internal")) return true;
  if (/^10\./.test(h)) return true; // private
  if (/^192\.168\./.test(h)) return true; // private
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true; // private
  if (/^169\.254\./.test(h)) return true; // link-local + cloud metadata
  if (/^fe80:/i.test(h) || /^fc/i.test(h) || /^fd/i.test(h)) return true; // IPv6 link-local / ULA
  return false;
}

// Resolve the album-art URL to a safe, fetchable absolute URL. Relative paths
// resolve against our own origin (object storage / public assets); absolute
// URLs are only allowed when they point at the SAME host and a non-internal
// address. This prevents the public `art` query param from being used to make
// the server fetch arbitrary internal/metadata endpoints (SSRF).
function resolveArtUrl(artUrl: string, origin: string): string | null {
  try {
    const target = new URL(artUrl, origin);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    if (target.host !== new URL(origin).host) return null;
    if (isBlockedHost(target.hostname)) return null;
    return target.toString();
  } catch {
    return null;
  }
}

// Fetch the art bytes ourselves (rather than letting loadImage follow the URL)
// so we can refuse redirects, cap size, bound time, and confirm it's an image —
// closing redirect-to-internal and slow-loris vectors on the art fetch.
async function fetchArtBuffer(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url, { redirect: "error", signal: ctrl.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > 8 * 1024 * 1024) return null; // 8MB cap
    return Buffer.from(ab);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Trace a rounded rectangle as the current path (no fill/stroke).
function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

let logoBuf: Buffer | null | undefined;
function getLogoBuffer(): Buffer | null {
  if (logoBuf !== undefined) return logoBuf;
  try {
    const p = path.join(process.cwd(), "server", "assets", "goodtunes-logo-white.png");
    logoBuf = existsSync(p) ? readFileSync(p) : null;
  } catch {
    logoBuf = null;
  }
  return logoBuf;
}

export async function renderCertOgImage(input: CertOgInput): Promise<Buffer> {
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas");
  ensureFonts(GlobalFonts);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ---- Orange frame: fill the whole canvas; the art sits inset by BORDER.
  // The messaging app rounds the card's outer corners itself, so we keep the
  // baked corners square and let the orange run to the edges.
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, W, H);

  // ---- Inner album-art rectangle (rounded).
  const ax = BORDER;
  const ay = BORDER;
  const aw = W - BORDER * 2;
  const ah = H - BORDER * 2;

  ctx.save();
  roundRectPath(ctx, ax, ay, aw, ah, ART_RADIUS);
  ctx.clip();

  // Album art, cover-fit and TOP-anchored (keeps faces / upper title art; the
  // bottom — where the album's own title often sits — is where the gradient and
  // logo land, so cropping there is intentional and matches the approved card).
  let artDrawn = false;
  const safeArt = input.artUrl ? resolveArtUrl(input.artUrl, input.origin) : null;
  const artBuf = safeArt ? await fetchArtBuffer(safeArt) : null;
  if (artBuf) {
    try {
      const img = await loadImage(artBuf);
      const targetAR = aw / ah;
      let sw = img.width;
      let sh = img.height;
      let sx = 0;
      let sy = 0;
      if (img.width / img.height > targetAR) {
        // source wider than target → crop sides, keep full height
        sw = Math.round(img.height * targetAR);
        sx = Math.round((img.width - sw) / 2);
      } else {
        // source taller/squarer than target → crop bottom, anchor top
        sh = Math.round(img.width / targetAR);
        sy = 0;
      }
      ctx.drawImage(img, sx, sy, sw, sh, ax, ay, aw, ah);
      artDrawn = true;
    } catch {
      artDrawn = false;
    }
  }
  if (!artDrawn) {
    const g = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah);
    g.addColorStop(0, PANEL_A);
    g.addColorStop(1, PANEL_B);
    ctx.fillStyle = g;
    ctx.fillRect(ax, ay, aw, ah);
  }

  // Bottom gradient scrim so a white logo reads on any artwork.
  const scrimH = Math.round(ah * 0.55);
  const scrimTop = ay + ah - scrimH;
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, ay + ah);
  scrim.addColorStop(0, "rgba(0,6,43,0)");
  scrim.addColorStop(0.58, "rgba(0,6,43,0.5)");
  scrim.addColorStop(1, "rgba(0,6,43,0.92)");
  ctx.fillStyle = scrim;
  ctx.fillRect(ax, scrimTop, aw, scrimH);

  ctx.restore(); // drop the art clip

  // ---- GoodTunes wordmark, bottom-RIGHT, floated on the scrim.
  const logoH = Math.round(ah * 0.12);
  const marginR = Math.round(aw * 0.04);
  const marginB = Math.round(ah * 0.05);
  const lb = getLogoBuffer();
  let logoDrawn = false;
  if (lb) {
    try {
      const logo = await loadImage(lb);
      const logoW = Math.round((logo.width / logo.height) * logoH);
      const lx = ax + aw - marginR - logoW;
      const ly = ay + ah - marginB - logoH;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 2;
      ctx.drawImage(logo, lx, ly, logoW, logoH);
      ctx.restore();
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn) {
    // Text fallback if the logo asset is missing.
    ctx.save();
    ctx.fillStyle = WHITE;
    ctx.font = `bold ${Math.round(logoH * 0.7)}px ${fontFamily(true)}`;
    ctx.textBaseline = "alphabetic";
    const mark = "GoodTunes®";
    const markW = ctx.measureText(mark).width;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 12;
    ctx.fillText(mark, ax + aw - marginR - markW, ay + ah - marginB);
    ctx.restore();
  }

  return canvas.encode("png");
}
