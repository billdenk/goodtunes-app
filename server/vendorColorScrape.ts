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
  const cropDisc = async (cx: number, cy: number, radius: number): Promise<Buffer> => {
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
  };

  // Classify every pixel as background or foreground. The naive
  // "match any sampled edge color" test breaks on Hellbender mockups,
  // which use a TWO-TONE studio backdrop (gray upper-left, light-gray/
  // white lower-right) joined by a diagonal gradient seam plus a soft
  // drop shadow — none of those intermediate gray/shadow pixels match a
  // flat sampled tone, so they leaked into the foreground and the disc
  // came out as a rough square. The key invariant: the whole backdrop
  // (both tones + seam + shadow) is ACHROMATIC (gray→white), while the
  // pressed disc is either chromatic (gold/blue/red/multicolor) or very
  // dark (black vinyl). So we model the backdrop as "low-chroma pixels
  // within a brightness band", which absorbs the seam and shadow without
  // a flood-fill that could leak across anti-aliased disc edges. We
  // still keep a flat-tone fallback for uniform/transparent backdrops
  // (MRP) so those don't regress.
  const CHROMA_TH = 30; // max-min channel spread at/below which a pixel reads as gray
  const SHADOW_MARGIN = 60; // extend the gray band downward to swallow drop shadow
  const TONE_TOL = 34; // per-channel tolerance for the flat-tone fallback

  const step = Math.max(1, Math.floor(Math.min(w, h) / 128));
  // Deduplicate perimeter tones (quantized), kept split by chroma. The
  // flat-tone fallback stays a handful of comparisons per pixel instead
  // of hundreds. Chromatic tones always count as background; achromatic
  // (gray) tones are only used as flat background when there's NO light
  // studio backdrop — when there IS one, the gray band below handles all
  // grays (including the seam + shadow) and folding gray tones into the
  // flat matcher would eat grayish translucent discs (coke bottle).
  const chromaSeen = new Set<number>();
  const achroSeen = new Set<number>();
  const chromaTones: number[] = [];
  const achroTones: number[] = [];
  let periCount = 0;
  let achroCount = 0;
  let achroMin = 255;
  let achroMax = 0;
  const sampleEdge = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 16) return; // transparent edge -> not a studio tone
    periCount++;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const v = Math.max(r, g, b);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    if (chroma <= CHROMA_TH) {
      achroCount++;
      if (v < achroMin) achroMin = v;
      if (v > achroMax) achroMax = v;
      if (!achroSeen.has(key) && achroTones.length < 64 * 3) { achroSeen.add(key); achroTones.push(r, g, b); }
    } else if (!chromaSeen.has(key) && chromaTones.length < 64 * 3) {
      chromaSeen.add(key);
      chromaTones.push(r, g, b);
    }
  };
  for (let x = 0; x < w; x += step) {
    sampleEdge(x, 0);
    sampleEdge(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sampleEdge(0, y);
    sampleEdge(w - 1, y);
  }
  if (periCount === 0) return null;

  // A "studio" backdrop is mostly light, achromatic gray/white on the
  // perimeter. When present we treat the whole gray band as background;
  // the band floor is capped so a true-black disc (or its label ring)
  // stays foreground even if the shadow touches the frame edge.
  const studio = achroCount / periCount >= 0.5 && achroMax >= 170;
  const bandLo = studio ? Math.max(78, achroMin - SHADOW_MARGIN) : -1;
  // Flat tones used by the fallback matcher: always the chromatic ones;
  // add gray tones only for non-studio uniform opaque backdrops.
  const tones = studio ? chromaTones : chromaTones.concat(achroTones);

  const isBg = (r: number, g: number, b: number): boolean => {
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const v = Math.max(r, g, b);
    if (studio && chroma <= CHROMA_TH && v >= bandLo) return true;
    for (let k = 0; k < tones.length; k += 3) {
      if (
        Math.abs(r - tones[k]) <= TONE_TOL &&
        Math.abs(g - tones[k + 1]) <= TONE_TOL &&
        Math.abs(b - tones[k + 2]) <= TONE_TOL
      ) {
        return true;
      }
    }
    return false;
  };

  const fg = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 16) continue;
      if (!isBg(px[i], px[i + 1], px[i + 2])) fg[y * w + x] = 1;
    }
  }

  // Hole-fill: background reachable from the frame border is the real
  // backdrop; any enclosed background pocket is an interior hole (the
  // white label, or the reflective light grooves inside a black disc)
  // and gets promoted to foreground so the disc reads as one solid blob.
  const reach = new Uint8Array(w * h);
  const fillStack: number[] = [];
  const seedReach = (x: number, y: number) => {
    const i = y * w + x;
    if (!fg[i] && !reach[i]) {
      reach[i] = 1;
      fillStack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    seedReach(x, 0);
    seedReach(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seedReach(0, y);
    seedReach(w - 1, y);
  }
  while (fillStack.length) {
    const idx = fillStack.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x + 1 < w) seedReach(x + 1, y);
    if (x - 1 >= 0) seedReach(x - 1, y);
    if (y + 1 < h) seedReach(x, y + 1);
    if (y - 1 >= 0) seedReach(x, y - 1);
  }
  for (let i = 0; i < w * h; i++) if (!fg[i] && !reach[i]) fg[i] = 1;

  // Take the largest 4-connected foreground component as the disc
  // candidate; stray seam fragments or specks drop out here.
  const seen = new Uint8Array(w * h);
  const compStack: number[] = [];
  let count = 0, minX = w, minY = h, maxX = -1, maxY = -1;
  for (let s = 0; s < w * h; s++) {
    if (!fg[s] || seen[s]) continue;
    let c = 0, aMinX = w, aMinY = h, aMaxX = -1, aMaxY = -1;
    seen[s] = 1;
    compStack.push(s);
    while (compStack.length) {
      const idx = compStack.pop()!;
      const x = idx % w;
      const y = (idx / w) | 0;
      c++;
      if (x < aMinX) aMinX = x;
      if (x > aMaxX) aMaxX = x;
      if (y < aMinY) aMinY = y;
      if (y > aMaxY) aMaxY = y;
      if (x + 1 < w && fg[idx + 1] && !seen[idx + 1]) { seen[idx + 1] = 1; compStack.push(idx + 1); }
      if (x - 1 >= 0 && fg[idx - 1] && !seen[idx - 1]) { seen[idx - 1] = 1; compStack.push(idx - 1); }
      if (y + 1 < h && fg[idx + w] && !seen[idx + w]) { seen[idx + w] = 1; compStack.push(idx + w); }
      if (y - 1 >= 0 && fg[idx - w] && !seen[idx - w]) { seen[idx - w] = 1; compStack.push(idx - w); }
    }
    if (c > count) { count = c; minX = aMinX; minY = aMinY; maxX = aMaxX; maxY = aMaxY; }
  }
  const minDim = Math.min(w, h);

  // Confidence checks — when the color-segmented component looks like a
  // centered disc, crop to it. Otherwise we DON'T give up yet: fall
  // through to the shape/edge-aware pass below, which can recover the
  // discs color thresholding can't separate from the backdrop (true
  // black, and the translucent white/clear/silver/smokey/natural stocks).
  //  - size: fills a meaningful fraction of the frame
  //  - aspect: near-square bounding box
  //  - fillCircle: component ≈ its inscribed circle (rejects squares,
  //    which over-fill at 4/π ≈ 1.27, and partial arcs, which under-fill)
  //  - fillBbox: component fills enough of its bbox (rejects ragged/L shapes)
  if (maxX >= 0) {
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const radius = Math.min(bw, bh) / 2;
    const aspect = bw / bh;
    const fillBbox = count / (bw * bh);
    const fillCircle = count / (Math.PI * radius * radius);
    const ok =
      bw >= minDim * 0.33 && bh >= minDim * 0.33 &&
      aspect >= 0.85 && aspect <= 1.18 &&
      fillCircle >= 0.8 && fillCircle <= 1.15 &&
      fillBbox >= 0.62;
    if (ok) return await cropDisc(cx, cy, radius);
  }

  // Shape/edge-aware fallback. Color thresholding can't separate these
  // discs from the studio backdrop (the disc body is itself achromatic /
  // translucent, or — for true black — its drop shadow is the same tone).
  // But the disc is a centered, near-complete circular RIM with concentric
  // grooves, so we detect it by shape instead of color: vote for the disc
  // CENTRE from edge-gradient directions (every groove + the rim point at
  // it), then take the OUTERMOST radius whose circumference is well-covered
  // by edges. A non-disc photo lacks that centered, near-complete ring and
  // is rejected, so rectangles/lifestyle shots still bail to the original.
  const circle = detectDiscByEdges(px, w, h);
  if (circle) return await cropDisc(circle.cx, circle.cy, circle.r);
  return null;
}

// Detect a centered vinyl disc purely from its shape, for swatches whose
// disc can't be told from the backdrop by colour. Returns the disc circle
// {cx,cy,r} or null when no confident centered ring is found.
function detectDiscByEdges(
  px: Uint8ClampedArray,
  w: number,
  h: number,
): { cx: number; cy: number; r: number } | null {
  const n = w * h;
  const minDim = Math.min(w, h);

  // Grayscale + Sobel gradient (magnitude + unit direction).
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    gray[i] = 0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2];
  }
  const mag = new Float32Array(n);
  const dirx = new Float32Array(n);
  const diry = new Float32Array(n);
  let sum = 0;
  let cnt = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], t = gray[i - w], tr = gray[i - w + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + w - 1], b = gray[i + w], br = gray[i + w + 1];
      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > 0) { dirx[i] = gx / m; diry[i] = gy / m; }
      sum += m;
      cnt++;
    }
  }
  // Adaptive edge threshold relative to the image's mean gradient — the
  // studio mockups are very low-contrast (mean ≈ 10), lifestyle photos
  // much higher, so a fixed cut-off won't work for both.
  const edgeTh = Math.min(255, Math.max(28, (sum / cnt) * 1.8));

  // Radius range: vinyl fills most of the (near-square) frame.
  const rMin = Math.floor(0.3 * minDim);
  const rMax = Math.floor(0.49 * minDim);

  // Vote for the disc centre. Each edge pixel's gradient points across the
  // rim/groove, so the centre lies along ±gradient at some radius; we
  // accumulate those candidate centres (downsampled ×2) but only inside a
  // central window, which enforces the "disc is dead-centre" prior and
  // keeps off-centre photo edges from forming a false centre.
  const af = 2;
  const aw = Math.ceil(w / af);
  const ah = Math.ceil(h / af);
  const acc = new Float32Array(aw * ah);
  const xLo = w * 0.4, xHi = w * 0.6, yLo = h * 0.4, yHi = h * 0.6;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mag[i] <= edgeTh) continue;
      const dx = dirx[i], dy = diry[i];
      for (let r = rMin; r <= rMax; r += 3) {
        for (const s of [-1, 1]) {
          const ccx = x + s * r * dx;
          const ccy = y + s * r * dy;
          if (ccx < xLo || ccx > xHi || ccy < yLo || ccy > yHi) continue;
          acc[(((ccy / af) | 0) * aw) + ((ccx / af) | 0)] += 1;
        }
      }
    }
  }
  let pk = -1, pi = 0;
  for (let i = 0; i < acc.length; i++) if (acc[i] > pk) { pk = acc[i]; pi = i; }
  if (pk <= 0) return null;
  let cx = (pi % aw) * af + af / 2;
  let cy = ((pi / aw) | 0) * af + af / 2;

  // Fraction of a circle's circumference that has edge support nearby.
  const coverage = (ccx: number, ccy: number, r: number): number => {
    const band = Math.max(2, Math.round(r * 0.04));
    const N = 180;
    let hits = 0;
    for (let a = 0; a < N; a++) {
      const ang = (a * 2 * Math.PI) / N;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      for (let dr = -band; dr <= band; dr++) {
        const rr = r + dr;
        const xx = Math.round(ccx + rr * ca);
        const yy = Math.round(ccy + rr * sa);
        if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue;
        if (mag[yy * w + xx] > edgeTh) { hits++; break; }
      }
    }
    return hits / N;
  };

  // Outermost radius whose rim is at least half-covered — that's the disc
  // edge (grooves sit further in; shadows/reflections beyond it are only
  // partial arcs, so they don't pass). Stopping at the first hit from the
  // outside in also stops a photo's inner ring from masquerading as a disc.
  let r0 = -1;
  for (let r = rMax; r >= rMin; r--) {
    if (coverage(cx, cy, r) >= 0.5) { r0 = r; break; }
  }
  if (r0 < 0) return null;

  // Refine centre + radius locally to maximise coverage.
  let bestCov = coverage(cx, cy, r0);
  let bestR = r0;
  let bestCx = cx;
  let bestCy = cy;
  for (let oy = -6; oy <= 6; oy += 2) {
    for (let ox = -6; ox <= 6; ox += 2) {
      for (let r = r0 - 4; r <= r0 + 6; r++) {
        if (r < rMin || r > rMax) continue;
        const cov = coverage(cx + ox, cy + oy, r);
        if (cov > bestCov) { bestCov = cov; bestR = r; bestCx = cx + ox; bestCy = cy + oy; }
      }
    }
  }

  // Require a near-complete circular rim. Real discs score ~1.0; the black
  // lifestyle photo (off-centre, occluded record) tops out ~0.52, so 0.62
  // cleanly separates discs from photos that merely have some round edges.
  if (bestCov < 0.62) return null;
  return { cx: bestCx, cy: bestCy, r: bestR };
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
