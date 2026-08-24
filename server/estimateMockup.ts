// Task #3359 — server-composited estimate mockup for the estimate email.
//
// Renders the "jacket with the colored vinyl peeking out" hero (same visual
// idea as PressClientEstimate's album stage) as ONE flat PNG so the estimate
// email can show the artist their record. Email clients fetch images from a
// public URL with no auth, so this renderer is served from
// GET /api/estimate-link/:token/mockup.png (registered in pressPortal.ts),
// keyed to the estimate's private share token.
//
// Composition rules (mirrors the task spec):
//   - Jacket: the estimate's resolved artwork when present; otherwise the
//     press's "house jacket" — dark board (#111112) with the press logo
//     rendered as a WHITE mark (the server twin of WhiteMarkGlyph's CSS
//     mask), falling back to the press name in white when there's no
//     usable raster logo.
//   - Disc: the real tinted-disc photo for the quoted vinyl color via the
//     shared resolveVinylColor chain (shared/pressing.ts); a neutral drawn
//     disc (grooves + swatch-tinted label) when the color has no photo.
//   - Never throws for a resolvable estimate: every layer has a drawn
//     fallback, so a valid token always yields bytes.
//
// Fetch rules are FAIL-CLOSED (completion review, Aug 24 2026): this
// renderer is reachable through a public token route and its source URLs
// (artwork/logo/disc) are press-editor-influenced, so it never makes an
// outbound HTTP request at all. Only `/objects/...` object-storage paths are
// readable (straight from storage — no HTTP, no SSRF surface). Anything else
// (absolute URLs, other relative paths) returns null and the drawn fallback
// renders instead. This matches the standing external-links rule: pasted
// https art is mirrored into object storage at save time, so real data is
// always `/objects/uploads/...` anyway.

import path from "path";
import { existsSync, readFileSync } from "fs";
import type { Readable } from "stream";
import { resolveVinylColor } from "@shared/pressing";
import { safeRasterForRender } from "./imageProcessing";

// Geometry — the client hero (430×296: jacket 288² at x=0, disc 280⌀ at
// x=128) scaled ×2.5 for crisp retina rendering at the email's ~528px slot.
const W = 1020;
const H = 730;
const JACKET = 720; // square, top-left
const JACKET_X = 0;
const JACKET_Y = 5;
const DISC = 700;
const DISC_X = 320;
const DISC_Y = 15;
const JACKET_RADIUS = 10;

export interface EstimateMockupInput {
  /** Resolved artwork URL — only `/objects/...` storage paths are readable;
   * anything else falls back to the house jacket. Null = house jacket. */
  artUrl: string | null;
  pressName: string;
  /** Press logo URL for the white house-jacket mark (any color; it's used
   * as an alpha mask). Only `/objects/...` paths load; SVG is skipped
   * (canvas can't rasterize it). */
  pressLogoUrl: string | null;
  /** Stored vinyl color (id or catalog display name) from the builder state. */
  colorName: string | null;
}

function streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const finish = (val: Buffer | null) => {
      if (done) return;
      done = true;
      try { stream.destroy(); } catch { /* noop */ }
      resolve(val);
    };
    stream.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) return finish(null);
      chunks.push(Buffer.from(c));
    });
    stream.on("end", () => finish(Buffer.concat(chunks)));
    stream.on("error", () => finish(null));
  });
}

// Read image bytes for a stored URL — object storage ONLY, fail closed.
// `/objects/...` reads straight from storage (no HTTP). Everything else —
// absolute http(s) URLs, loopback/host tricks, data:, protocol-relative,
// traversal attempts, other relative paths — returns null and the caller
// draws its fallback. This renderer never performs a network fetch.
// Exported for the SSRF-posture tests in estimateMockup.test.ts.
export async function fetchImageBytes(sourceUrl: string): Promise<Buffer | null> {
  const MAX_BYTES = 16 * 1024 * 1024;
  try {
    if (sourceUrl.startsWith("/objects/") && !sourceUrl.includes("..")) {
      const { ObjectStorageService } = await import(
        "./replit_integrations/object_storage/objectStorage"
      );
      const svc = new ObjectStorageService();
      const file = await svc.getObjectEntityFile(sourceUrl);
      return await streamToBuffer(file.createReadStream() as unknown as Readable, MAX_BYTES);
    }
  } catch {
    // ObjectNotFound / storage error → caller draws its fallback.
  }
  return null;
}

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

let fontsReady = false;
function ensureFonts(GlobalFonts: any) {
  if (fontsReady) return;
  try {
    const dir = path.join(process.cwd(), "server", "assets", "fonts");
    const bold = path.join(dir, "DejaVuSans-Bold.ttf");
    if (existsSync(bold)) GlobalFonts.registerFromPath(bold, "GoodTunes Sans Bold");
  } catch {
    // System fontconfig fallback (DejaVu ships on the NixOS base).
  }
  fontsReady = true;
}

// Neutral drawn disc for colors without a real photo: dark vinyl body with
// subtle groove rings and a label tinted by the color's swatch (when it's a
// flat hex — gradients/unknowns get a neutral gray label).
function drawNeutralDisc(ctx: any, cx: number, cy: number, r: number, swatch: string) {
  ctx.save();
  // Body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#161617";
  ctx.fill();
  // Grooves
  for (let gr = r * 0.45; gr < r * 0.97; gr += r * 0.045) {
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // Sheen — a soft diagonal highlight so the disc doesn't read as a flat dot.
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sheen.addColorStop(0, "rgba(255,255,255,0.10)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = sheen;
  ctx.fill();
  // Label
  const labelR = r * 0.34;
  const flatHex = /^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : "#4a4a4e";
  ctx.beginPath();
  ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
  ctx.fillStyle = flatHex;
  ctx.fill();
  // Spindle hole
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.016, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0b";
  ctx.fill();
  ctx.restore();
}

export async function renderEstimateMockupImage(input: EstimateMockupInput): Promise<Buffer> {
  const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas");
  ensureFonts(GlobalFonts);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  // Transparent canvas — the email's own background (dark charcoal or warm
  // MRP white) shows through, so one render works in both skins.

  // ── Disc (behind the jacket, peeking out the right side) ────────────────
  const discR = DISC / 2;
  const discCx = DISC_X + discR;
  const discCy = DISC_Y + discR;
  const color = resolveVinylColor(input.colorName);
  let discDrawn = false;
  if (color.thumbnailUrl) {
    const raw = await fetchImageBytes(color.thumbnailUrl);
    const buf = raw ? await safeRasterForRender(raw) : null;
    if (buf) {
      try {
        const img = await loadImage(buf);
        ctx.save();
        ctx.beginPath();
        ctx.arc(discCx, discCy, discR, 0, Math.PI * 2);
        ctx.clip();
        // Cover-fit with the same slight zoom the page hero uses (1.13) so
        // the photo's square matte never shows inside the circle.
        const zoom = 1.13;
        const scale = Math.max(DISC / img.width, DISC / img.height) * zoom;
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, discCx - dw / 2, discCy - dh / 2, dw, dh);
        ctx.restore();
        discDrawn = true;
      } catch {
        discDrawn = false;
      }
    }
  }
  if (!discDrawn) drawNeutralDisc(ctx, discCx, discCy, discR, color.swatch);

  // ── Jacket (on top, left) ────────────────────────────────────────────────
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 10;
  roundRectPath(ctx, JACKET_X, JACKET_Y, JACKET, JACKET, JACKET_RADIUS);
  ctx.fillStyle = "#111112";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, JACKET_X, JACKET_Y, JACKET, JACKET, JACKET_RADIUS);
  ctx.clip();

  let artDrawn = false;
  if (input.artUrl) {
    const raw = await fetchImageBytes(input.artUrl);
    const buf = raw ? await safeRasterForRender(raw) : null;
    if (buf) {
      try {
        const img = await loadImage(buf);
        // Cover-fit, center-anchored.
        const scale = Math.max(JACKET / img.width, JACKET / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, JACKET_X + (JACKET - dw) / 2, JACKET_Y + (JACKET - dh) / 2, dw, dh);
        artDrawn = true;
      } catch {
        artDrawn = false;
      }
    }
  }
  if (!artDrawn) {
    // House jacket: dark board + white press mark (server twin of
    // WhiteMarkGlyph — the logo raster becomes an alpha mask filled white).
    ctx.fillStyle = "#111112";
    ctx.fillRect(JACKET_X, JACKET_Y, JACKET, JACKET);
    let markDrawn = false;
    const logoUrl = input.pressLogoUrl && !/\.svg(\?|$)/i.test(input.pressLogoUrl) ? input.pressLogoUrl : null;
    if (logoUrl) {
      const raw = await fetchImageBytes(logoUrl);
      const buf = raw ? await safeRasterForRender(raw) : null;
      if (buf) {
        try {
          const { createCanvas: mk } = await import("@napi-rs/canvas");
          const img = await loadImage(buf);
          const markW = Math.round(JACKET * 0.46);
          const scale = Math.min(markW / img.width, markW / img.height);
          const dw = Math.max(1, Math.round(img.width * scale));
          const dh = Math.max(1, Math.round(img.height * scale));
          const off = mk(dw, dh);
          const octx = off.getContext("2d");
          octx.drawImage(img, 0, 0, dw, dh);
          octx.globalCompositeOperation = "source-in";
          octx.fillStyle = "#ffffff";
          octx.fillRect(0, 0, dw, dh);
          ctx.drawImage(off, JACKET_X + (JACKET - dw) / 2, JACKET_Y + (JACKET - dh) / 2);
          markDrawn = true;
        } catch {
          markDrawn = false;
        }
      }
    }
    if (!markDrawn) {
      // No usable logo — press name in white, centered.
      ctx.fillStyle = "#ffffff";
      let size = 64;
      ctx.font = `bold ${size}px "GoodTunes Sans Bold", "DejaVu Sans", sans-serif`;
      const name = input.pressName.trim() || "Your press";
      while (size > 28 && ctx.measureText(name).width > JACKET * 0.78) {
        size -= 4;
        ctx.font = `bold ${size}px "GoodTunes Sans Bold", "DejaVu Sans", sans-serif`;
      }
      const tw = ctx.measureText(name).width;
      ctx.fillText(name, JACKET_X + (JACKET - tw) / 2, JACKET_Y + JACKET / 2 + size * 0.35);
    }
    // Subtle board texture edge (hairline inset) so the dark board reads as
    // a physical jacket, not a void, on the dark email skin.
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    roundRectPath(ctx, JACKET_X + 1, JACKET_Y + 1, JACKET - 2, JACKET - 2, JACKET_RADIUS);
    ctx.stroke();
  }
  ctx.restore();

  return canvas.encode("png");
}

// ── Small in-memory render cache (keyed by share token + inputs) ──────────
// Email opens fan out (every recipient/client fetches the same URL), so the
// send path warms this and subsequent opens hit memory. Per-instance only —
// a cache miss just re-renders (~tens of ms).
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { key: string; buf: Buffer; at: number }>();

export async function getEstimateMockupPng(token: string, input: EstimateMockupInput): Promise<Buffer> {
  const key = JSON.stringify([input.artUrl, input.pressLogoUrl, input.colorName, input.pressName]);
  const hit = cache.get(token);
  if (hit && hit.key === key && Date.now() - hit.at < CACHE_TTL_MS) return hit.buf;
  const buf = await renderEstimateMockupImage(input);
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(token, { key, buf, at: Date.now() });
  return buf;
}
