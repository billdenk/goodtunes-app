// Shared vendor color-catalog scraping + image helpers.
//
// These pure functions back BOTH the interactive admin importers in
// `routes.ts` and the one-shot `scripts/backfill-press-photos.ts` photo
// backfill, so the disc-masking and MRP page-parsing logic lives in one
// place instead of being duplicated between request handlers and scripts.

export const MRP_COLOR_LIBRARY_URL =
  "https://memphisrecordpressing.com/all-vinyl-colors/";

export type MrpParsedTile = {
  code: string;
  prefix: string;
  name: string;
  sourceUrl: string;
  family: string;
};

// Auto-mask a vendor mockup down to just the vinyl disc. Vendor swatch
// photos always sit the record dead-center on a uniform studio backdrop
// (Hellbender = gray, MRP = black/checkerboard). We detect the largest
// non-background region, take the inscribed circle of its bounding box,
// and write everything outside that circle to transparent. Returns a PNG
// buffer on success, or null when we can't confidently find a disc (low
// foreground coverage, wrong aspect, or foreground doesn't fill the
// inscribed circle) — the caller falls back to the original upload.
export async function maskToVinylDisc(buf: Buffer): Promise<Buffer | null> {
  const { loadImage, createCanvas, ImageData } = await import("@napi-rs/canvas");
  let img;
  try {
    img = await loadImage(buf);
  } catch {
    return null;
  }
  const w = img.width;
  const h = img.height;
  if (w < 32 || h < 32) return null;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Sample the 1-px perimeter ring as background colors. Studio
  // backdrops are uniform on the outer edge by design, so any pixel
  // inside the frame that doesn't match any sampled edge color (within
  // tolerance) is treated as foreground (vinyl + label).
  const bgSamples: number[] = []; // packed r,g,b triples
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  const pushSample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 16) return; // already transparent
    bgSamples.push(px[i], px[i + 1], px[i + 2]);
  };
  for (let x = 0; x < w; x += step) {
    pushSample(x, 0);
    pushSample(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    pushSample(0, y);
    pushSample(w - 1, y);
  }
  if (bgSamples.length === 0) return null;

  const THRESH = 38; // per-channel tolerance
  const isBg = (r: number, g: number, b: number): boolean => {
    for (let k = 0; k < bgSamples.length; k += 3) {
      if (
        Math.abs(r - bgSamples[k]) <= THRESH &&
        Math.abs(g - bgSamples[k + 1]) <= THRESH &&
        Math.abs(b - bgSamples[k + 2]) <= THRESH
      ) {
        return true;
      }
    }
    return false;
  };

  // Build foreground mask + bounding box
  const fg = new Uint8Array(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let fgCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 16) continue;
      if (!isBg(px[i], px[i + 1], px[i + 2])) {
        fg[y * w + x] = 1;
        fgCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || fgCount < (w * h) * 0.05) return null;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  // Discs are roughly square; reject elongated regions
  const aspect = bw / bh;
  if (aspect < 0.75 || aspect > 1.35) return null;
  if (bw < w * 0.25 || bh < h * 0.25) return null;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const radius = Math.min(bw, bh) / 2;

  // Confidence: most pixels inside the inscribed circle should be
  // foreground. Bail if the bounding box is something other than a
  // disc (e.g. a rectangular sleeve or text block).
  let inside = 0;
  let insideFg = 0;
  const r2 = radius * radius;
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        inside++;
        if (fg[y * w + x]) insideFg++;
      }
    }
  }
  if (inside === 0 || insideFg / inside < 0.82) return null;

  // Tight crop to the inscribed circle's bounding box and mask
  // everything outside the circle to alpha=0 with a 1-px AA fade so
  // the disc edge doesn't show a stair-step against transparency.
  const outX = Math.max(0, Math.floor(cx - radius));
  const outY = Math.max(0, Math.floor(cy - radius));
  const outW = Math.min(w - outX, Math.ceil(radius * 2));
  const outH = Math.min(h - outY, Math.ceil(radius * 2));
  const out = createCanvas(outW, outH);
  const octx = out.getContext("2d");
  const od = new Uint8ClampedArray(outW * outH * 4);
  const ncx = cx - outX;
  const ncy = cy - outY;
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sx = x + outX;
      const sy = y + outY;
      const si = (sy * w + sx) * 4;
      const di = (y * outW + x) * 4;
      od[di] = px[si];
      od[di + 1] = px[si + 1];
      od[di + 2] = px[si + 2];
      const dx = x - ncx;
      const dy = y - ncy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let alpha = px[si + 3];
      if (dist >= radius) alpha = 0;
      else if (dist > radius - 1) alpha = Math.round(alpha * (radius - dist));
      od[di + 3] = alpha;
    }
  }
  octx.putImageData(new ImageData(od, outW, outH), 0, 0);
  return await out.encode("png");
}

// Parse MRP's all-vinyl-colors page into per-color tiles. Each color
// renders as `<h3>CODE - Name</h3>` under a family `<h2>` heading; the
// image lives in a sibling node whose filename starts with the tile's
// code. We index code→image in one pass, then walk h2/h3 in document
// order to attach the family + image to each tile.
export function parseMrpColorPage(html: string): MrpParsedTile[] {
  const tiles: MrpParsedTile[] = [];
  const seenCodes = new Set<string>();
  const imgByCode = new Map<string, string>();
  const imgRe = /(?:data-src|src)\s*=\s*"(https?:\/\/memphisrecordpressing\.com\/wp-content\/uploads\/[^"]+?\.(?:png|jpg|jpeg|webp))"/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const url = m[1];
    const fname = url.split("/").pop() ?? "";
    const codeMatch = fname.match(/^([A-Z]{1,4}\d{1,3})\b/);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    const cleaned = url.replace(/-\d+x\d+(\.[a-z]+)$/i, "$1");
    if (!imgByCode.has(code)) imgByCode.set(code, cleaned);
  }
  // Walk h2 and h3 in one regex so document order is preserved.
  const walkRe = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/g;
  let currentFamily = "Other";
  while ((m = walkRe.exec(html))) {
    const level = m[1];
    const inner = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!inner) continue;
    if (level === "2") {
      currentFamily = inner.replace(/\s+(series|colors|collection)$/i, "").trim() || inner;
      continue;
    }
    const tileMatch = inner.match(/^([A-Z]{1,4}\d{1,3})\s*[-–—]\s*(.+?)\s*$/);
    if (!tileMatch) continue;
    const code = tileMatch[1];
    const rawName = tileMatch[2];
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);
    const prefix = code.match(/^([A-Z]+)/)?.[1] ?? code;
    const sourceUrl = imgByCode.get(code);
    if (!sourceUrl) continue;
    tiles.push({ code, prefix, name: rawName, sourceUrl, family: currentFamily });
  }
  return tiles;
}

// Family heading ↔ tier-name matcher. Both sides are normalized
// (lowercased, non-alphanumerics stripped) and we accept either
// direction of substring overlap so "Neon-Glow" matches a tier named
// "Neon/Glow" (and vice versa).
export function matchFamilyToTier<T extends { id: string; name: string }>(
  family: string,
  tiers: T[],
): T | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fn = norm(family);
  if (!fn) return null;
  let best: T | null = null;
  let bestLen = 0;
  for (const t of tiers) {
    const tn = norm(t.name);
    if (!tn) continue;
    if (tn === fn) return t;
    if (tn.includes(fn) || fn.includes(tn)) {
      const overlap = Math.min(tn.length, fn.length);
      if (overlap > bestLen) { best = t; bestLen = overlap; }
    }
  }
  return best;
}
