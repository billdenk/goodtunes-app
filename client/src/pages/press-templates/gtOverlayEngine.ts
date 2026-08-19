// gtOverlayEngine — the GT-layer template/overlay engine shared by the press
// live-test page (PressTemplateLiveTest.tsx) and the artist art-test page
// (ArtistTemplateTest.tsx). Factored out of PressTemplateLiveTest verbatim
// (Task #3184) so both surfaces read the SAME measured geometry the same way:
// pdf.js lazy loading, Illustrator OCG layer extraction (exact mm bounding
// boxes + true drawn shapes), page rasterization, and the zone color canon.
//
// Behavior is byte-identical to the press page's previous inline copies —
// only the module boundary moved.

import type * as pdfjs from 'pdfjs-dist';

// pdf.js is loaded LAZILY: a top-level `import 'pdfjs-dist'` (and its static
// `?url` worker import) crashed any node test that transitively imported this
// file (DOMMatrix isn't defined outside the browser; `?url` isn't a real
// module). Vite code-splits both dynamic imports; the browser behavior is
// unchanged. Only type imports stay at module scope.
let pdfjsModule: typeof import('pdfjs-dist') | null = null;
export async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsModule) {
    const m = await import('pdfjs-dist');
    // eslint-disable-next-line import/no-unresolved
    const w = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as { default: string };
    m.GlobalWorkerOptions.workerSrc = w.default;
    pdfjsModule = m;
  }
  return pdfjsModule;
}
// pdf.js 5.x calls Map.getOrInsertComputed (a stage-3 JS proposal) that
// current browsers don't ship yet — polyfill it on Map + WeakMap.
for (const proto of [Map.prototype, WeakMap.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getOrInsertComputed !== 'function') {
    // eslint-disable-next-line no-param-reassign
    proto.getOrInsertComputed = function (this: Map<unknown, unknown>, key: unknown, compute: (k: unknown) => unknown) {
      if (!this.has(key)) this.set(key, compute(key));
      return this.get(key);
    };
  }
}

// ─── GT layer extraction — the real magic, in the browser ───
// Reads Illustrator layers (PDF OCGs) by name and computes each layer's
// exact bounding box in mm by walking the page's operator list.
// Gotcha (proven Aug 2026): Illustrator wraps each layer group in an
// invisible full-page CLIP rectangle. constructPath's first arg is the
// paint op — clips arrive as OPS.endPath and MUST be skipped, or every
// layer measures as the full page.

export type GtLayer = {
  name: string;      // raw layer name, e.g. "GT CUT LINE"
  zone: string;      // display zone, e.g. "Cut"
  kind: 'line' | 'area' | 'other';
  xMm: number; yMm: number; wMm: number; hMm: number; // top-left origin, mm
  round?: boolean;   // path drawn purely with curves (circle/ellipse) — draw the overlay round
  // Frame layers (an AREA drawn as outer edge + inner hole, like a bleed band):
  // the inner hole's box, so the wash can paint only the band, not the whole box.
  inXMm?: number; inYMm?: number; inWMm?: number; inHMm?: number;
  // True drawn shape (Task #3164): SVG path data in mm, top-left origin,
  // covering ALL subpaths of the layer. Only set when the shape is genuinely
  // non-rectangular (e.g. a bleed edge with a glue-flap notch) and capture
  // succeeded — simple rects/single circles keep the classic box rendering
  // so existing templates look byte-identical.
  pathMm?: string;
};

type Matrix = [number, number, number, number, number, number];
const mulM = (a: Matrix, b: number[]): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const applyM = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const PT_TO_MM = 25.4 / 72;

export function zoneFromName(raw: string): { zone: string; kind: 'line' | 'area' | 'other' } {
  const n = raw.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  const kind: 'line' | 'area' | 'other' = n.endsWith(' LINE') ? 'line' : n.endsWith(' AREA') ? 'area' : 'other';
  let core = n.replace(/ (LINE|AREA)$/, '');
  if (core.startsWith('GT ')) core = core.slice(3);
  const zone = core.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { zone, kind };
}

export async function extractGtLayers(doc: pdfjs.PDFDocumentProxy, pageNum: number): Promise<{ layers: GtLayer[]; layerNames: string[]; paintedLayerNames: string[] }> {
  const oc = await doc.getOptionalContentConfig();
  const names: Record<string, string> = {};
  const order = (oc.getOrder() ?? []) as Array<string | { order?: unknown[] }>;
  const collect = (ids: Array<string | { order?: unknown[] }>) => {
    for (const id of ids) {
      if (typeof id === 'string') {
        const g = oc.getGroup(id) as { name?: string } | null;
        if (g?.name) names[id] = g.name;
      } else if (id && Array.isArray(id.order)) {
        collect(id.order as Array<string | { order?: unknown[] }>);
      }
    }
  };
  collect(order);

  const page = await doc.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 });
  const ol = await page.getOperatorList();
  const OPS = (await loadPdfjs()).OPS as Record<string, number>;
  // Paint ops that mean REAL geometry. Clips (endPath) are skipped.
  const PAINT = new Set([OPS.fill, OPS.eoFill, OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter((v) => typeof v === 'number'));

  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const ctmStack: Matrix[] = [];
  const mcStack: Array<string | null> = [];
  type SubBox = { minX: number; minY: number; maxX: number; maxY: number };
  const boxes: Record<string, { minX: number; minY: number; maxX: number; maxY: number; curves: number; lines: number; subs: SubBox[]; dParts: string[]; pathOk: boolean; rectish: boolean }> = {};

  // Walk pdf.js 5.x packed path data (cmd, ...args): moveTo=0(2), lineTo=1(2),
  // curveTo=2(6), closePath=3/4(0). Lets us tell a circle (all curves) from a box.
  // Proven against Andrew's 12in label PDF (Aug 14 2026): the Float32Array sits
  // at args[1][0], closePath arrives as 4, and register-tick layers emit
  // zero-length lineTos that must not count as straight edges.
  const countPathOps = (data: ArrayLike<number> | undefined, m: Matrix) => {
    let curves = 0, lines = 0;
    const subs: SubBox[] = [];
    let cur: SubBox | null = null;
    // Real-shape capture (Task #3164): build SVG path data in mm (top-left
    // origin) alongside the bbox, and note whether every subpath is a plain
    // axis-aligned rectangle (all vertices sit on its own bbox edges) so
    // callers can keep the classic box rendering for simple layers.
    const dParts: string[] = [];
    let pathOk = true;
    let rectish = true;
    let subCurves = 0;
    let verts: Array<[number, number]> = [];
    const mm = (x: number, y: number): [number, number] => {
      const [X, Y] = applyM(m, x, y);
      return [X * PT_TO_MM, (vp1.height - Y) * PT_TO_MM];
    };
    const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString();
    const mark = (x: number, y: number) => {
      const [X, Y] = applyM(m, x, y);
      if (!cur) cur = { minX: X, minY: Y, maxX: X, maxY: Y };
      else {
        cur.minX = Math.min(cur.minX, X); cur.maxX = Math.max(cur.maxX, X);
        cur.minY = Math.min(cur.minY, Y); cur.maxY = Math.max(cur.maxY, Y);
      }
    };
    const vert = (x: number, y: number) => { verts.push(applyM(m, x, y)); };
    const flushSub = () => {
      if (cur) {
        subs.push(cur);
        // Rect test only meaningful for straight-edged subpaths.
        if (subCurves > 0) rectish = false;
        else {
          const eps = 0.5; // pt
          const c = cur as SubBox;
          for (const [vx, vy] of verts) {
            const onX = Math.abs(vx - c.minX) < eps || Math.abs(vx - c.maxX) < eps;
            const onY = Math.abs(vy - c.minY) < eps || Math.abs(vy - c.maxY) < eps;
            if (!onX || !onY) { rectish = false; break; }
          }
        }
      }
      cur = null; subCurves = 0; verts = [];
    };
    if (data && data.length) {
      let j = 0, px = NaN, py = NaN;
      while (j < data.length) {
        const cmd = data[j++];
        if (cmd === 0) {
          flushSub();
          px = data[j]; py = data[j + 1]; mark(px, py); vert(px, py);
          const [mx, my] = mm(px, py);
          dParts.push(`M ${fmt(mx)} ${fmt(my)}`);
          j += 2;
        } else if (cmd === 1) {
          const x = data[j], y = data[j + 1]; j += 2;
          if (Math.abs(x - px) > 0.01 || Math.abs(y - py) > 0.01) lines++;
          mark(x, y); vert(x, y);
          const [mx, my] = mm(x, y);
          dParts.push(`L ${fmt(mx)} ${fmt(my)}`);
          px = x; py = y;
        } else if (cmd === 2) {
          curves++; subCurves++;
          mark(data[j], data[j + 1]); mark(data[j + 2], data[j + 3]); mark(data[j + 4], data[j + 5]);
          const [x1, y1] = mm(data[j], data[j + 1]);
          const [x2, y2] = mm(data[j + 2], data[j + 3]);
          const [x3, y3] = mm(data[j + 4], data[j + 5]);
          dParts.push(`C ${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)} ${fmt(x3)} ${fmt(y3)}`);
          px = data[j + 4]; py = data[j + 5]; j += 6;
        } else if (cmd === 3 || cmd === 4) { dParts.push('Z'); }
        else { curves = 0; lines = 1; pathOk = false; break; } // unknown encoding — treat as straight-edged
      }
      flushSub();
    }
    return { curves, lines, subs, d: dParts.join(' '), pathOk, rectish };
  };

  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i];
    const args = ol.argsArray[i] as unknown[];
    if (fn === OPS.save) ctmStack.push(ctm);
    else if (fn === OPS.restore) ctm = ctmStack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mulM(ctm, args as number[]);
    else if (fn === OPS.beginMarkedContentProps) {
      const props = args?.[1] as { id?: string } | null;
      mcStack.push((props?.id && names[props.id]) || null);
    } else if (fn === OPS.beginMarkedContent) mcStack.push(null);
    else if (fn === OPS.endMarkedContent) mcStack.pop();
    else if (fn === OPS.constructPath) {
      const layer = [...mcStack].reverse().find(Boolean);
      if (!layer) continue;
      const paintOp = args?.[0] as number;
      if (!PAINT.has(paintOp)) continue; // skip Illustrator's invisible clip rects
      const mm3 = args?.[2] as number[] | undefined;
      if (!mm3 || mm3.length < 4 || !mm3.every((v) => Number.isFinite(v))) continue;
      const c1 = applyM(ctm, mm3[0], mm3[1]);
      const c2 = applyM(ctm, mm3[2], mm3[3]);
      const c3 = applyM(ctm, mm3[0], mm3[3]);
      const c4 = applyM(ctm, mm3[2], mm3[1]);
      const b = boxes[layer] ?? (boxes[layer] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, curves: 0, lines: 0, subs: [], dParts: [], pathOk: true, rectish: true });
      for (const [x, y] of [c1, c2, c3, c4]) {
        b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
        b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
      }
      const pc = countPathOps((args?.[1] as Array<ArrayLike<number>> | undefined)?.[0], ctm);
      b.curves += pc.curves; b.lines += pc.lines; b.subs.push(...pc.subs);
      if (pc.d) b.dParts.push(pc.d);
      b.pathOk = b.pathOk && pc.pathOk;
      b.rectish = b.rectish && pc.rectish;
    }
  }

  const layers: GtLayer[] = [];
  for (const [name, b] of Object.entries(boxes)) {
    if (!Number.isFinite(b.minX)) continue;
    const { zone, kind } = zoneFromName(name);
    // Round overlay ONLY when the layer is a SINGLE circle/ellipse: all
    // curves AND the largest curve subpath spans (nearly) the whole merged
    // bbox. A multi-up label layer (Task #3156 — e.g. Hellbender's two-up
    // 12" page, one circle per die on the same layer) merges into a wide
    // bbox no single subpath fills — drawing that with 50% radius invents a
    // page-spanning oval over the real dies, so it falls back to the honest
    // rectangular bounding box instead.
    let singleRound = b.curves > 0 && b.lines === 0;
    if (singleRound && b.subs.length > 0) {
      const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
      const covers = b.subs.some((s) =>
        bw > 0 && bh > 0 && (s.maxX - s.minX) >= 0.8 * bw && (s.maxY - s.minY) >= 0.8 * bh);
      if (!covers) singleRound = false;
    }
    const layer: GtLayer = {
      name, zone, kind,
      xMm: b.minX * PT_TO_MM,
      yMm: (vp1.height - b.maxY) * PT_TO_MM, // flip to top-left origin
      wMm: (b.maxX - b.minX) * PT_TO_MM,
      hMm: (b.maxY - b.minY) * PT_TO_MM,
      round: singleRound,
    };
    // Real drawn shape (Task #3164): expose the captured SVG path only when
    // the layer is genuinely non-rectangular (glue-flap notch, multi-die
    // circles, …) and every constructPath decoded cleanly. Plain rects and
    // single circles keep the classic box/ellipse rendering unchanged.
    if (b.pathOk && b.dParts.length > 0 && !b.rectish && !singleRound) {
      layer.pathMm = b.dParts.join(' ');
    }
    // Frame detection: an AREA drawn as outer edge + inner hole. The largest
    // subpath strictly inside the outer box is the hole — wash only the band.
    const margin = 0.5; // pt
    const inner = b.subs
      .filter((s) => s.minX > b.minX + margin && s.minY > b.minY + margin && s.maxX < b.maxX - margin && s.maxY < b.maxY - margin)
      .sort((a, s) => (s.maxX - s.minX) * (s.maxY - s.minY) - (a.maxX - a.minX) * (a.maxY - a.minY))[0];
    if (inner) {
      layer.inXMm = inner.minX * PT_TO_MM;
      layer.inYMm = (vp1.height - inner.maxY) * PT_TO_MM;
      layer.inWMm = (inner.maxX - inner.minX) * PT_TO_MM;
      layer.inHMm = (inner.maxY - inner.minY) * PT_TO_MM;
    }
    layers.push(layer);
  }
  // paintedLayerNames = layers that actually PAINT content on this page.
  // Viryl false-positive (Aug 18 2026): Illustrator flattens can leave GT
  // guide layers behind as empty OCG *definitions* with zero geometry —
  // hygiene must key off painted layers, not defined names.
  return { layers, layerNames: Object.values(names), paintedLayerNames: Object.keys(boxes) };
}

export async function renderPage(doc: pdfjs.PDFDocumentProxy, pageNum: number, targetWidth = 1400): Promise<{ img: string; wMm: number; hMm: number }> {
  const page = await doc.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = targetWidth / vp1.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // PDFs have no background of their own
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp } as Parameters<typeof page.render>[0]).promise;
  return { img: canvas.toDataURL('image/png'), wMm: vp1.width * PT_TO_MM, hMm: vp1.height * PT_TO_MM };
}

// Shrink the full-res preview data URL down to a small tile image (JPEG) so
// the saved-shelf payload stays light — the shelf tile is a ~180px circle.
export async function shrinkDataUrl(dataUrl: string, targetWidth = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, targetWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── Zone accents (word + shape carry meaning; color supportive) ───
export const ZONE_COLORS: Record<string, string> = {
  Bleed: '#e0245e', Cut: '#319ED8', Spine: '#b07ce8', 'Front Cover': '#f5a623', 'Back Cover': '#f5a623',
  'Front Safety': '#34c98e', 'Back Safety': '#34c98e', Artboard: '#98989d',
};
export const zoneColor = (z: string) => ZONE_COLORS[z] ?? '#8fd4c1';

// SVG path for a rect or ellipse zone box (mm coordinates, top-left origin).
export function shapePath(x: number, y: number, w: number, h: number, round?: boolean): string {
  return round
    ? `M ${x + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y + h} A ${w / 2} ${h / 2} 0 1 0 ${x + w / 2} ${y} Z`
    : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}
