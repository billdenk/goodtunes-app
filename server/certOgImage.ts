// Renders the 1200×630 GoodDeed link-preview (Open Graph) image with
// @napi-rs/canvas. This is the thumbnail crawlers (iMessage, Twitter/X,
// BlueSky, Facebook, Discord, WhatsApp) fetch when a fan shares the
// `/share/cert` link, so it must be a real raster PNG at a public URL.
//
// @napi-rs/canvas is already a dependency (vendorColorScrape) and is
// externalized in script/build.ts, so this adds no new native deps.
import path from "path";
import { existsSync } from "fs";

export interface CertOgInput {
  album: string;
  artist: string;
  owner: string;
  num: string; // already zero-padded, digits only
  artUrl: string | null; // absolute or relative path to album art
  origin: string;
}

const W = 1200;
const H = 630;

// Brand palette (see replit.md / index.css).
const BG = "#00062B";
const PANEL_A = "#1B3A8C";
const PANEL_B = "#2A1670";
const MINT = "#4AFFCA";
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
// *is* localhost, and the same-host check above means loopback only ever
// resolves back to this app — the dangerous targets are the metadata endpoint
// and private LAN ranges, which a legitimate public origin never uses.
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

// Greedy word-wrap that returns at most `maxLines` lines, ellipsizing the last.
function wrapLines(
  ctx: any,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Ellipsize the final line if there's leftover text or it overflows.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    if (ctx.measureText(last).width > maxWidth) {
      while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
        last = last.slice(0, -1).trimEnd();
      }
      lines[maxLines - 1] = `${last}…`;
    }
  }
  return lines;
}

export async function renderCertOgImage(input: CertOgInput): Promise<Buffer> {
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas");
  ensureFonts(GlobalFonts);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Base background.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ---- Left: album art square (full height) ----
  const artSize = H; // 630×630
  let artDrawn = false;
  const safeArt = input.artUrl ? resolveArtUrl(input.artUrl, input.origin) : null;
  const artBuf = safeArt ? await fetchArtBuffer(safeArt) : null;
  if (artBuf) {
    try {
      const img = await loadImage(artBuf);
      // cover-fit into the square
      const ar = img.width / img.height;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (ar > 1) {
        sw = img.height;
        sx = (img.width - sw) / 2;
      } else if (ar < 1) {
        sh = img.width;
        sy = (img.height - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, artSize, artSize);
      artDrawn = true;
    } catch {
      artDrawn = false;
    }
  }
  if (!artDrawn) {
    const g = ctx.createLinearGradient(0, 0, artSize, artSize);
    g.addColorStop(0, PANEL_A);
    g.addColorStop(1, PANEL_B);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, artSize, artSize);
  }

  // Subtle gradient seam so art blends into the navy text panel.
  const seam = ctx.createLinearGradient(artSize - 80, 0, artSize, 0);
  seam.addColorStop(0, "rgba(0,6,43,0)");
  seam.addColorStop(1, BG);
  ctx.fillStyle = seam;
  ctx.fillRect(artSize - 80, 0, 80, H);

  // ---- Right: text panel ----
  const panelX = artSize + 56;
  const panelW = W - panelX - 56;
  let y = 92;

  // Verified eyebrow with a mint check dot.
  ctx.fillStyle = MINT;
  ctx.beginPath();
  ctx.arc(panelX + 9, y - 6, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BG;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(panelX + 5, y - 6);
  ctx.lineTo(panelX + 8, y - 3);
  ctx.lineTo(panelX + 13.5, y - 10);
  ctx.stroke();
  ctx.fillStyle = MINT;
  ctx.font = `bold 22px ${fontFamily(true)}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("VERIFIED OWNERSHIP", panelX + 28, y);

  // Album title (up to 2 lines).
  y += 64;
  ctx.fillStyle = WHITE;
  ctx.font = `bold 52px ${fontFamily(true)}`;
  const titleLines = wrapLines(ctx, input.album, panelW, 2);
  for (const line of titleLines) {
    ctx.fillText(line, panelX, y);
    y += 58;
  }

  // Artist.
  if (input.artist) {
    y += 2;
    ctx.fillStyle = "rgba(255,255,255,0.66)";
    ctx.font = `28px ${fontFamily(false)}`;
    ctx.fillText(wrapLines(ctx, input.artist, panelW, 1)[0] ?? "", panelX, y);
    y += 18;
  }

  // Certifying line + owner.
  y += 52;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `24px ${fontFamily(false)}`;
  ctx.fillText("This GoodDeed® certifies that", panelX, y);

  y += 46;
  ctx.fillStyle = WHITE;
  ctx.font = `bold 38px ${fontFamily(true)}`;
  ctx.fillText(wrapLines(ctx, input.owner || "a verified fan", panelW, 1)[0] ?? "", panelX, y);

  y += 36;
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `24px ${fontFamily(false)}`;
  ctx.fillText(`owns No. ${input.num} of this series.`, panelX, y);

  // Big serial, mint, anchored near the bottom.
  ctx.fillStyle = MINT;
  ctx.font = `bold 76px ${fontFamily(true)}`;
  ctx.fillText(`No. ${input.num}`, panelX, H - 64);

  // GoodTunes wordmark, bottom-right.
  ctx.fillStyle = WHITE;
  ctx.font = `bold 26px ${fontFamily(true)}`;
  const mark = "GoodTunes®";
  const markW = ctx.measureText(mark).width;
  ctx.fillText(mark, W - 56 - markW, H - 74);

  return canvas.encode("png");
}
