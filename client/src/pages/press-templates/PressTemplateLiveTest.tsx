// PressTemplateLiveTest — LIVE end-to-end proof of the GT-layer canon.
// Step 1: upload a press template PDF with GT layers (Illustrator OCGs).
//         The browser reads every layer's exact mm geometry — no guessing.
// Step 2: upload an art file (PDF preferred; PNG/JPG visual-only).
// Results: the art composites under the template's own GT lines, with
//          measured pass/fail checks (word + icon, never color alone).
//
// Wired from handoff/press-template-live-test/PressTemplateLiveTest.tsx
// (Bill, Aug 14 2026) — copied character-for-character below the breadcrumb.
// Only the mock chrome (PressShell + theme toggle) and the two in-memory
// stores changed: theme now follows the app's Light/Dark setting
// (useAdminDark), and "Accept & Save" persists the template + its test
// trail through POST/PATCH /api/press/:id/templates/live.

import { useEffect, useMemo, useRef, useState } from 'react';

// The Templates page's upload sheet stashes the chosen file here, then routes
// to this page, which picks it up on mount (Bill, Aug 14 2026). liveId is set
// when re-opening a template already saved to the shelf (re-save appends the
// new test trail instead of creating a duplicate row).
export const pendingTemplateFile: {
  file: File | null;
  name?: string | null;
  liveId?: string | null;
  component?: string | null;
  /** Slot-mode upload (dashed tile / Replace, Bill's handoff): Accept & Save
   *  attaches to THIS canon slot (new revision) instead of the saved shelf. */
  slot?: {
    format: string;
    componentKey: string;
    variantKey?: string;
    discCount?: number;
    title: string;
  } | null;
  /** Reopening a saved template arrives CLEAN — Save stays quiet until
   *  something changes (Bill's handoff, Addendum 4). Fresh uploads are dirty. */
  fromSaved?: boolean;
  /** Already-persisted test trail for a reopened shelf template — shown in
   *  the History & tests panel only, NEVER re-sent on Save (the server
   *  appends payload tests; re-sending would duplicate the trail). */
  priorTests?: Array<{ artName: string; verdict: string }> | null;
} = { file: null, name: null, liveId: null, component: null, slot: null, fromSaved: false, priorTests: null };

// Just-saved marker — the Index pulses the fresh shelf tile once (blue
// hairline, then back to gray) when it sees this flag on mount.
export const freshLiveSave = { flag: false };

export type SavedTest = { art: string; at: string; verdict: string };
import type * as pdfjs from 'pdfjs-dist';
// pdf.js is loaded LAZILY: a top-level `import 'pdfjs-dist'` (and its static
// `?url` worker import) crashed any node test that transitively imported this
// file (DOMMatrix isn't defined outside the browser; `?url` isn't a real
// module). Vite code-splits both dynamic imports; the browser behavior is
// unchanged. Only type imports stay at module scope.
let pdfjsModule: typeof import('pdfjs-dist') | null = null;
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
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
import {
  CheckCircle2, XCircle, MinusCircle, FileText, ChevronRight, Upload, ZoomIn, ShieldCheck, X, Pencil, PenLine, PaintBucket, ChevronDown, Info, History, BadgeCheck,
} from 'lucide-react';
import { saveLiveTestDraft, loadLiveTestDraft, clearLiveTestDraft, type LiveTestDraft } from './draftStore';
import { ChevronDown as NavChevron, Layers as NavLayers } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, authHeaders } from '@/lib/queryClient';
import { uploadAdminDoc } from '@/lib/adminUpload';
import { templateTestPath, certifyRunPath } from './apiPaths';
import { useAdminDark } from '@/lib/adminAppearance';

// ─── Themes — dark = canon charcoal default; light = apple-canon ──
type Theme = {
  canvas: string; rail: string; card: string; soft: string; hairline: string;
  ink: string; subink: string; faint: string; blue: string;
  ready: string; crit: string; readyWash: string; critWash: string; neutralWash: string;
  navShadow: string; headerBg: string; searchPlaceholder: string; avatarRing: string;
  hoverWash: string; hoverInk: string; logoFilter?: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7', rail: '#f5f5f7', card: '#ffffff', soft: '#f0f0f2', hairline: '#e6e6ea',
    ink: '#1d1d1f', subink: '#6e6e73', faint: '#a1a1a6', blue: '#319ED8',
    ready: '#1c8a5b', crit: '#e0245e', readyWash: 'rgba(28,138,91,0.10)', critWash: 'rgba(224,36,94,0.10)', neutralWash: 'rgba(0,0,0,0.05)',
    navShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)', searchPlaceholder: 'placeholder:text-black/30', avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5', hoverInk: 'hover:text-black', logoFilter: undefined,
  },
  dark: {
    canvas: '#161617', rail: '#1c1c1e', card: '#1e1e20', soft: '#26262a', hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7', subink: '#98989d', faint: '#6e6e73', blue: '#319ED8',
    ready: '#34c98e', crit: '#ff5d8f', readyWash: 'rgba(52,201,142,0.12)', critWash: 'rgba(255,93,143,0.12)', neutralWash: 'rgba(255,255,255,0.06)',
    navShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)', searchPlaceholder: 'placeholder:text-white/30', avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5', hoverInk: 'hover:text-white', logoFilter: 'invert(1) brightness(1.8)',
  },
};

/* Thin apple-canon indeterminate progress bar — Bill, Aug 14 2026: use this for
   any "reading/working" state on the Flow pages instead of button-label swaps. */
function ThinProgress({ label, t, testid }: { label: string; t: Theme; testid: string }) {
  return (
    <div className="mt-6 flex flex-col items-center" data-testid={testid} role="status" aria-label={label}>
      <style>{`@keyframes gt-thin-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }`}</style>
      <div className="rounded-full overflow-hidden" style={{ width: 220, height: 3, backgroundColor: t.soft }}>
        <div
          className="h-full rounded-full"
          style={{ width: '40%', backgroundColor: t.blue, animation: 'gt-thin-sweep 1.1s ease-in-out infinite' }}
        />
      </div>
      <div className="mt-2.5 text-[12.5px]" style={{ color: t.subink }}>{label}</div>
    </div>
  );
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
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
};

type Matrix = [number, number, number, number, number, number];
const mulM = (a: Matrix, b: number[]): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const applyM = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const PT_TO_MM = 25.4 / 72;

function zoneFromName(raw: string): { zone: string; kind: 'line' | 'area' | 'other' } {
  const n = raw.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  const kind: 'line' | 'area' | 'other' = n.endsWith(' LINE') ? 'line' : n.endsWith(' AREA') ? 'area' : 'other';
  let core = n.replace(/ (LINE|AREA)$/, '');
  if (core.startsWith('GT ')) core = core.slice(3);
  const zone = core.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return { zone, kind };
}

async function extractGtLayers(doc: pdfjs.PDFDocumentProxy, pageNum: number): Promise<{ layers: GtLayer[]; layerNames: string[] }> {
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
  const boxes: Record<string, { minX: number; minY: number; maxX: number; maxY: number; curves: number; lines: number; subs: SubBox[] }> = {};

  // Walk pdf.js 5.x packed path data (cmd, ...args): moveTo=0(2), lineTo=1(2),
  // curveTo=2(6), closePath=3/4(0). Lets us tell a circle (all curves) from a box.
  // Proven against Andrew's 12in label PDF (Aug 14 2026): the Float32Array sits
  // at args[1][0], closePath arrives as 4, and register-tick layers emit
  // zero-length lineTos that must not count as straight edges.
  const countPathOps = (data: ArrayLike<number> | undefined, m: Matrix) => {
    let curves = 0, lines = 0;
    const subs: SubBox[] = [];
    let cur: SubBox | null = null;
    const mark = (x: number, y: number) => {
      const [X, Y] = applyM(m, x, y);
      if (!cur) cur = { minX: X, minY: Y, maxX: X, maxY: Y };
      else {
        cur.minX = Math.min(cur.minX, X); cur.maxX = Math.max(cur.maxX, X);
        cur.minY = Math.min(cur.minY, Y); cur.maxY = Math.max(cur.maxY, Y);
      }
    };
    if (data && data.length) {
      let j = 0, px = NaN, py = NaN;
      while (j < data.length) {
        const cmd = data[j++];
        if (cmd === 0) {
          if (cur) subs.push(cur);
          cur = null;
          px = data[j]; py = data[j + 1]; mark(px, py); j += 2;
        } else if (cmd === 1) {
          const x = data[j], y = data[j + 1]; j += 2;
          if (Math.abs(x - px) > 0.01 || Math.abs(y - py) > 0.01) lines++;
          mark(x, y); px = x; py = y;
        } else if (cmd === 2) {
          curves++;
          mark(data[j], data[j + 1]); mark(data[j + 2], data[j + 3]); mark(data[j + 4], data[j + 5]);
          px = data[j + 4]; py = data[j + 5]; j += 6;
        } else if (cmd === 3 || cmd === 4) { /* closePath */ }
        else { curves = 0; lines = 1; break; } // unknown encoding — treat as straight-edged
      }
      if (cur) subs.push(cur);
    }
    return { curves, lines, subs };
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
      const b = boxes[layer] ?? (boxes[layer] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, curves: 0, lines: 0, subs: [] });
      for (const [x, y] of [c1, c2, c3, c4]) {
        b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
        b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
      }
      const pc = countPathOps((args?.[1] as Array<ArrayLike<number>> | undefined)?.[0], ctm);
      b.curves += pc.curves; b.lines += pc.lines; b.subs.push(...pc.subs);
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
  return { layers, layerNames: Object.values(names) };
}

async function renderPage(doc: pdfjs.PDFDocumentProxy, pageNum: number, targetWidth = 1400): Promise<{ img: string; wMm: number; hMm: number }> {
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
async function shrinkDataUrl(dataUrl: string, targetWidth = 480): Promise<string> {
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

// ─── Zone display order + accents (word + shape carry meaning; color supportive) ───
const ZONE_ORDER = ['Bleed', 'Cut', 'Spine', 'Front Cover', 'Back Cover', 'Front Safety', 'Back Safety', 'Artboard'];
const ZONE_COLORS: Record<string, string> = {
  Bleed: '#e0245e', Cut: '#319ED8', Spine: '#b07ce8', 'Front Cover': '#f5a623', 'Back Cover': '#f5a623',
  'Front Safety': '#34c98e', 'Back Safety': '#34c98e', Artboard: '#98989d',
};
const zoneColor = (z: string) => ZONE_COLORS[z] ?? '#8fd4c1';
const zoneSort = (a: string, b: string) => {
  const ia = ZONE_ORDER.indexOf(a); const ib = ZONE_ORDER.indexOf(b);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
};

type CheckRow = { param: string; tone: 'pass' | 'fail' | 'na'; detail: string };

function CheckLine({ row, t }: { row: CheckRow; t: Theme }) {
  const color = row.tone === 'pass' ? t.ready : row.tone === 'fail' ? t.crit : t.faint;
  const Icon = row.tone === 'pass' ? CheckCircle2 : row.tone === 'fail' ? XCircle : MinusCircle;
  return (
    <div className="flex items-start gap-2.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }} data-testid={`check-${row.param.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 2 }} />
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold" style={{ color: t.ink }}>
          {row.param}
          <span className="ml-2 font-semibold" style={{ color }}>{row.tone === 'pass' ? 'Pass' : row.tone === 'fail' ? 'Fail' : 'Not measured'}</span>
        </div>
        <div className="text-[12.5px] mt-0.5" style={{ color: t.subink }}>{row.detail}</div>
      </div>
    </div>
  );
}

type TemplateState = {
  name: string; img: string; wMm: number; hMm: number;
  layers: GtLayer[]; layerNames: string[]; pageCount: number;
};
type ArtState = {
  name: string; img: string;
  wMm: number | null; hMm: number | null; // null = raster image, no physical size
  pageCount: number | null;
  gtLayerNames: string[]; // GT layers left inside the art file (hygiene)
  pxAspect?: number; // raster only — pixel w/h from the server scan, keeps the overlay unsquished
};

export default function PressTemplateLiveTest({
  pressId,
  canEdit,
  specId,
  onExit,
}: {
  pressId: string;
  canEdit: boolean;
  /** Open the instrument on a saved canon template (?template=<id>) — its
   *  stored PDF is fetched back into a File and read live, GT overlays and
   *  all, exactly like a fresh upload (Bill, Aug 14 2026: the template page
   *  is the working instrument, not a static record). */
  specId?: string | null;
  onExit: () => void;
}) {
  const dark = useAdminDark();
  const t = THEMES[dark ? 'dark' : 'light'];
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState<TemplateState | null>(null);
  const [art, setArt] = useState<ArtState | null>(null);
  // Results banner: collapsed when everything passed (a pass doesn't need your
  // attention), auto-open when something failed or nothing was measured.
  const [checksOpen, setChecksOpen] = useState(true);
  const [pendingOpen, setPendingOpen] = useState(false);
  // gogoods, Aug 15 2026 — live server-side ink + resolution inspection of
  // the picked art PDF ("we need it to run here — verify CMYK and 300ppi").
  // 'checking' while the scan streams; rows replace the Color & resolution
  // line; 'error' degrades to the old prepress note.
  const [inkChecks, setInkChecks] = useState<'checking' | 'error' | CheckRow[] | null>(null);
  // A server-sent reason for a failed inspection (e.g. a PSD that couldn't be
  // flattened) — shown instead of the generic "didn't finish" line so the
  // artist knows to export TIFF/PDF rather than retrying (Task #3161).
  const [inkErrorMsg, setInkErrorMsg] = useState<string | null>(null);
  // Up-front format guidance for the picked art file (PNG can't be CMYK).
  const [formatNotice, setFormatNotice] = useState<string | null>(null);
  // Upload progress for the server ink/PPI scan (0..1 while the file streams
  // up, 1 = uploaded & server measuring, null = idle). Drives the thin
  // progress bar in the verdict banner (gogoods, Aug 16 2026: "we could all
  // wait for it to process and see it happen").
  const [inkProgress, setInkProgress] = useState<number | null>(null);
  // The in-flight inspect request — aborted the moment a new art file is
  // picked (or the page unmounts) so a superseded scan can never write
  // progress or results over the new selection (review, Aug 16 2026).
  const inkXhr = useRef<XMLHttpRequest | null>(null);
  // Monotonic pick token — a slow parse of pick A must never overwrite state
  // after pick B lands (review, Aug 16 2026: FileReader/pdfjs are async, so
  // rapid A→B picks race without this).
  const pickSeq = useRef(0);
  useEffect(() => () => { inkXhr.current?.abort(); }, []);
  const [busy, setBusy] = useState<'template' | 'art' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Arrived from the Templates page with a file already in hand — nothing is
  // being uploaded, so show "Opening template" instead of the upload step
  // (Bill, Aug 15 2026).
  const [arriving, setArriving] = useState(false);
  // "Resume where you left off?" — offered when the page opens empty-handed
  // but a browser-local draft exists (canon, Aug 15 2026: crash-safety =
  // drafts, not auto-save). Holds the found draft while the sheet is up.
  const [resumeOffer, setResumeOffer] = useState<LiveTestDraft | null>(null);
  const [activeZones, setActiveZones] = useState<Set<string>>(new Set());
  const [artOpacity, setArtOpacity] = useState(1);
  // Bill, Aug 14 2026: chip on the right to view overlays by Line or by Area.
  const [viewMode, setViewMode] = useState<'line' | 'area'>('line');
  // Bill, Aug 14 2026: chips above the preview — Full Template / Back / Front /
  // Spine — plus a magnifying glass that zooms in and lets you drag to pan.
  const [viewArea, setViewArea] = useState<'full' | 'Back Cover' | 'Front Cover' | 'Spine'>('full');
  const [zoom, setZoom] = useState(1); // 1 = fit the current view; > 1 in, < 1 out
  const [showTemplate, setShowTemplate] = useState(true); // hidden by default once art is in (Bill, Aug 14 2026)
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false); // art-opacity dropdown on the Template chip
  const templateHintShown = useRef(false); // slider hint auto-opens once per session
  const [testLog, setTestLog] = useState<SavedTest[]>([]); // saved results — the trail staff can revisit
  const currentFile = useRef<File | null>(null);
  const liveId = useRef<string | null>(null); // set when re-opening a saved shelf template
  const componentPill = useRef<string | null>(null); // optional component from the upload sheet
  const slotTarget = useRef<typeof pendingTemplateFile.slot>(null); // slot-mode: save mints a revision on this slot
  // Spec-mode (opened from a filled slot tile, gogoods bug Aug 15 2026):
  // the file already lives on the slot, so a plain Save must NOT re-attach
  // it (no needless revision) and must NEVER create a shelf row — it only
  // persists a rename via the display-name PATCH. A header Replace flips
  // fileReplaced and rides the slot PUT (revision supersedes in place).
  const specRef = useRef<string | null>(null);
  const initialName = useRef<string | null>(null);
  const [panC, setPanC] = useState<{ x: number; y: number } | null>(null); // view center as fraction of template
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number; w: number; h: number } | null>(null);
  // Bill, Aug 14 2026: layer table pops open over the page (icon right of Line/Area).
  const [showLayers, setShowLayers] = useState(false);
  // Save is the only act that creates a revision — so it stays quiet until
  // something actually changed (Bill, Aug 15 2026). Opening a saved template
  // arrives clean; replace / rename / new test results make it dirty.
  const [dirty, setDirty] = useState(true);
  // Status carries over from the Templates tile (Bill, Aug 15 2026): a certified
  // template says so here too; a fresh upload reads "Not tested" — usable, just
  // not certified yet. Derived from the spec's real revisions/runs (never mocked).
  const [savedMeta, setSavedMeta] = useState<{ certified: string; lastTest: string } | null>(null);
  // Header ••• under Save — view the saved tests, or replace the template
  // (replace = supersede: the old revision slides into history automatically,
  // per template canon; the new file loads here for testing) (Bill, Aug 15 2026).
  const [headerMenu, setHeaderMenu] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const replacingName = useRef<string | null>(null);
  // True when the CURRENT file differs from the one stored on the saved row —
  // Save's PATCH must then upload + persist the new PDF (review, Aug 15 2026).
  const fileReplaced = useRef(false);
  // Already-persisted trail for a reopened shelf template — panel display
  // only, never re-sent on Save (the server APPENDS payload tests).
  const [priorTests, setPriorTests] = useState<SavedTest[]>([]);
  // One tile per template, forever (Bill, Aug 15 2026): replacing supersedes —
  // the old revision moves into history *inside the same block*, tests attached.
  const [revisions, setRevisions] = useState<Array<{ name: string; wMm: number; hMm: number; at: string; tests: SavedTest[] }>>([]);
  // Task #3065 consent kept in slot mode: one file covering several options
  // (e.g. both center-hole sizes) asks before stamping the note.
  const [detected, setDetected] = useState<{ specId: string; options: Array<{ key: string; label: string }> } | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState<string | null>(null);
  // Bill, Aug 14 2026: Front/Back zone chips consolidate Cover+Safety behind a dropdown.
  const [openGroup, setOpenGroup] = useState<'Front' | 'Back' | null>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const artInput = useRef<HTMLInputElement>(null);
  // Raw art File from this session's test — spec/slot-mode Save submits it to
  // the server test endpoint so a passing run certifies the revision for real
  // (review, Aug 15 2026: the certify endpoints had no client caller, so a
  // press with "require a passing test" On could never certify).
  const artFile = useRef<File | null>(null);
  const replaceTemplate = () => {
    if (template) {
      replacingName.current = template.name;
      setRevisions((r) => [{ name: template.name, wMm: template.wMm, hMm: template.hMm, at: uploadedAt ?? '', tests: testLog }, ...r]);
    }
    setHeaderMenu(false);
    templateInput.current?.click();
  };

  const onPickTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    // Replace (header •••) supersedes in place: keep the name AND the saved
    // row / slot target, so Save updates the same tile — never a second one
    // (Bill, Aug 15 2026). A non-replace pick is a fresh shelf row as before.
    const keepName = replacingName.current;
    replacingName.current = null;
    if (!keepName) liveId.current = null; // a fresh file is a fresh shelf row
    if (liveId.current) fileReplaced.current = true; // PATCH must persist the new PDF
    // Spec-mode Replace (gogoods, Aug 15 2026): the new PDF must ride the
    // slot PUT on Save — a revision supersedes in place on the SAME slot.
    if (specRef.current) fileReplaced.current = true;
    await loadTemplate(f, keepName ?? undefined);
    setDirty(true);
    setSavedMeta(null); // a replacing file is a new revision — certified status stays with the old one
    // The draft snapshot must follow the replacement — keeping the saved row's
    // identity (liveId + name), or a crash-resume would mint a SECOND tile
    // and lose the display name (review, Aug 15 2026).
    void saveLiveTestDraft({
      pressId,
      blob: f,
      fileName: f.name,
      name: keepName ?? null,
      component: componentPill.current,
      liveId: liveId.current,
      slot: slotTarget.current
        ? { format: slotTarget.current.format, componentKey: slotTarget.current.componentKey, variantKey: slotTarget.current.variantKey ?? null, discCount: slotTarget.current.discCount ?? null, title: (slotTarget.current as { title?: string }).title }
        : null,
      savedAt: Date.now(),
    });
  };

  const loadTemplate = async (f: File, displayName?: string) => {
    currentFile.current = f;
    setTestLog([]);
    setBusy('template'); setError(null);
    try {
      const doc = await (await loadPdfjs()).getDocument({ data: await f.arrayBuffer() }).promise;
      const [{ img, wMm, hMm }, { layers, layerNames }] = [await renderPage(doc, 1), await extractGtLayers(doc, 1)];
      const gt = layers.filter((l) => l.name.toUpperCase().includes('LINE') || l.name.toUpperCase().includes('AREA') || l.name.toUpperCase().startsWith('GT'));
      if (!gt.length) {
        setError('No GT layers found in this PDF. Add layers named like "GT CUT LINE" / "GT CUT AREA" in Illustrator and re-save.');
      }
      setTemplate({ name: displayName ?? f.name, img, wMm, hMm, layers: gt, layerNames, pageCount: doc.numPages });
      setUploadedAt(new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
      setOriginalName(f.name); // if a custom name was given, "Originally …" shows the file's own name
      // All overlays start off — you turn on only what you want to see (Bill, Aug 14 2026).
      setActiveZones(new Set());
      setArt(null);
      artFile.current = null;
    } catch (err) {
      setTemplate(null);
      setArriving(false); // fall back to the upload step if the file couldn't be read
      setError(err instanceof Error ? err.message : 'Could not read that PDF.');
    } finally { setBusy(null); }
  };

  // Flow starts on the Templates page now (Bill, Aug 14 2026): its upload sheet
  // stashes the file here, and we pick it up the moment this page mounts.
  useEffect(() => {
    const f = pendingTemplateFile.file;
    const nm = pendingTemplateFile.name;
    liveId.current = pendingTemplateFile.liveId ?? null;
    componentPill.current = pendingTemplateFile.component ?? null;
    slotTarget.current = pendingTemplateFile.slot ?? null;
    if (f) {
      const fromSaved = pendingTemplateFile.fromSaved === true;
      const prior = pendingTemplateFile.priorTests ?? null;
      pendingTemplateFile.file = null; pendingTemplateFile.name = null; pendingTemplateFile.liveId = null; pendingTemplateFile.component = null; pendingTemplateFile.slot = null; pendingTemplateFile.fromSaved = false; pendingTemplateFile.priorTests = null;
      setDirty(!fromSaved); // reopening a saved template = clean; fresh upload = unsaved work
      // A saved reopen carries the row's own file; anything else riding in
      // with a liveId (Index tile Replace) is a NEW file the PATCH must persist.
      fileReplaced.current = !fromSaved && !!liveId.current;
      if (prior) setPriorTests(prior.map((t) => ({ art: t.artName, at: '', verdict: t.verdict })));
      setArriving(true);
      void loadTemplate(f, nm ?? undefined);
      // Automatic browser-local draft (canon, Aug 15 2026) — a crash or
      // closed tab never loses the session. Best-effort, never blocks.
      void saveLiveTestDraft({
        pressId,
        blob: f,
        fileName: f.name,
        name: nm ?? null,
        component: componentPill.current,
        liveId: liveId.current,
        slot: slotTarget.current
          ? { format: slotTarget.current.format, componentKey: slotTarget.current.componentKey, variantKey: slotTarget.current.variantKey ?? null, discCount: slotTarget.current.discCount ?? null, title: (slotTarget.current as { title?: string }).title }
          : null,
        savedAt: Date.now(),
      });
    }
    // Deep link onto a saved canon template: download its stored PDF through
    // our same-origin file route (external template links would die on CORS
    // from the browser) and run it through the same live pipeline. Guarded
    // against Strict-Mode double-mounts / specId changes / unmount races.
    else if (specId) {
      let cancelled = false;
      const ctrl = new AbortController();
      void (async () => {
        setBusy('template');
        try {
          const payload = await queryClient.fetchQuery<import('./types').TemplatesPayload>({ queryKey: [`/api/press/${pressId}/templates`] });
          if (cancelled) return;
          const spec = payload.specs.find((s) => s.id === specId);
          if (!spec?.templateFileUrl) { if (!cancelled) onExit(); return; }
          // Spec-mode identity (gogoods bug, Aug 15 2026): opening a slot's
          // template must save back to THAT slot — never mint a shelf row.
          // slotTarget makes a header Replace supersede in place (PUT mints
          // a revision on this same slot); specRef routes a plain Save
          // (rename / test session) to the display-name PATCH instead.
          specRef.current = spec.id;
          initialName.current = spec.displayName ?? spec.templateFileName ?? null;
          // Status carries over from the tile (Bill, Aug 15 2026): only a
          // certified revision brings the badge; pending arrives "Not tested".
          const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          const verdictWordFor = (v: string) => (v === 'pass' ? 'Pass' : v === 'unverified' ? 'Visual only' : 'Flagged');
          const certRev = spec.revisions.find((rv) => rv.status === 'certified' && rv.certifiedAt);
          if (certRev?.certifiedAt) {
            const lastRun = spec.runs[0]; // newest-first from the server
            setSavedMeta({
              certified: fmt(certRev.certifiedAt),
              lastTest: lastRun ? `${lastRun.fileName ?? 'Art file'} — ${verdictWordFor(lastRun.verdict)} · ${fmt(lastRun.createdAt)}` : '',
            });
          } else {
            setSavedMeta(null);
          }
          // History & tests must show the SERVER-logged runs too (gogoods
          // bug, Aug 16 2026: real recorded tests showed as "No art files
          // tested" because the sheet only listed this session's local log).
          const runToTest = (run: (typeof spec.runs)[number]) => ({
            art: run.fileName ?? 'Art file',
            at: fmt(run.createdAt),
            verdict: verdictWordFor(run.verdict),
          });
          const currentRevIds = new Set(
            spec.revisions.filter((rv) => rv.status !== 'superseded' && rv.status !== 'archived').map((rv) => rv.id),
          );
          setPriorTests(
            spec.runs
              .filter((run) => run.revisionId === null || currentRevIds.has(run.revisionId))
              .slice()
              .reverse() // server is newest-first; the sheet reads oldest→newest
              .map(runToTest),
          );
          setRevisions(
            spec.revisions
              .filter((rv) => rv.status === 'superseded' || rv.status === 'archived')
              .map((rv) => ({
                name: rv.fileName ?? rv.revLabel,
                wMm: 0, // unknown for stored revisions — the sheet hides 0-size
                hMm: 0,
                at: fmt(rv.createdAt),
                tests: spec.runs.filter((run) => run.revisionId === rv.id).slice().reverse().map(runToTest),
              })),
          );
          slotTarget.current = {
            format: spec.format,
            componentKey: spec.componentKey,
            variantKey: spec.variantKey ?? "",
            discCount: spec.discCount ?? 0,
            title: spec.displayName ?? spec.templateFileName ?? "Template",
          };
          // Bearer + cookie (cookie-only fetches 401 under #token-hash admin
          // logins — standing landmine on admin surfaces).
          const r = await fetch(`/api/press/${pressId}/templates/${specId}/file`, {
            headers: { ...authHeaders() },
            credentials: 'include',
            signal: ctrl.signal,
          });
          if (!r.ok) {
            // Task #3154 — a legacy pasted link that no longer serves the
            // file comes back 422 { code: "template_link_dead" }: surface
            // the actionable re-upload message, not a generic fetch error.
            let msg = `Couldn't fetch the template file (${r.status})`;
            try {
              const body = (await r.json()) as { code?: string; message?: string };
              if (body?.code === 'template_link_dead') {
                msg = body.message ?? "This template's file link no longer works — replace the file from the Templates page.";
              }
            } catch { /* non-JSON body — keep the generic message */ }
            throw new Error(msg);
          }
          const blob = await r.blob();
          if (cancelled) return;
          const file = new File([blob], spec.templateFileName ?? 'template.pdf', { type: 'application/pdf' });
          await loadTemplate(file, spec.displayName ?? spec.templateFileName ?? undefined);
          setDirty(false); // opening a saved template arrives clean (Bill, Aug 15 2026)
          // View mode (gogoods, Aug 16 2026): opening a CERTIFIED template
          // re-hydrates the certifying test run's art so anyone (CEO check-in)
          // can inspect bleeds/overlays without uploading. Pure viewing —
          // dirty stays false, Close changes nothing, "Try another file"
          // still works exactly as before.
          if (certRev) {
            // Pin to THIS certified revision (review): a certified run from a
            // superseded revision must never masquerade as the current proof.
            const viewRun =
              spec.runs.find((run) => run.certifiedAt && run.revisionId === certRev.id) ??
              spec.runs.find(
                (run) => run.revisionId === certRev.id && (run.verdict === 'pass' || run.verdict === 'warn'),
              );
            if (viewRun?.fileUrl?.startsWith('/objects/')) {
              try {
                const ar = await fetch(`/api/press/${pressId}/templates/${specId}/runs/${viewRun.id}/file`, {
                  headers: { ...authHeaders() },
                  credentials: 'include',
                  signal: ctrl.signal,
                });
                if (ar.ok && !cancelled) {
                  const artBlob = await ar.blob();
                  const artName = viewRun.fileName ?? 'Saved art file';
                  const isPdf = /\.pdf$/i.test(viewRun.fileUrl) || artBlob.type === 'application/pdf';
                  const artFileObj = new File([artBlob], artName, {
                    type: isPdf ? 'application/pdf' : artBlob.type || 'image/jpeg',
                  });
                  if (!cancelled) {
                    await loadArtFromFile(artFileObj, { markDirty: false });
                    // Viewed-only art must never be re-submitted/re-certified
                    // by an unrelated Save (e.g. a rename) — only a fresh
                    // deliberate pick clears this flag (review).
                    artIsViewedRun.current = true;
                  }
                }
              } catch {
                // Best-effort — the template alone is still a useful view.
              }
            }
          }
        } catch (err) {
          if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
          setBusy(null);
          setError(err instanceof Error ? err.message : 'Could not load that template.');
        }
      })();
      return () => {
        cancelled = true;
        ctrl.abort();
        // Invalidate any in-flight art parse/ink-inspect from the saved-run
        // hydration too — pickSeq is the loader's staleness token (review:
        // the fetch abort alone didn't cover the parse/inspect stages).
        pickSeq.current++;
        inkXhr.current?.abort();
        inkXhr.current = null;
      };
    }
    // Arrived with nothing in hand (refresh, deep link)? If a browser-local
    // draft exists, offer to resume it (canon, Aug 15 2026); otherwise
    // Templates is the start page — go there as before.
    else if (!specId) {
      // Idempotence guard (review, Aug 15 2026): on a Strict-Mode remount the
      // pending file is already consumed, but the same component instance is
      // mid-arrival — currentFile survives in the ref. Never exit or offer a
      // resume sheet over a session that's already opening/opened a file.
      if (currentFile.current) return;
      let cancelled = false;
      void loadLiveTestDraft(pressId).then((d) => {
        if (cancelled || currentFile.current) return;
        if (d) setResumeOffer(d);
        else onExit();
      });
      return () => { cancelled = true; };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specId]);

  // Resume = load the draft exactly where it stood; Discard = the draft is
  // gone, back to Templates. X close leaves too, but keeps the draft.
  // Neither creates a revision — Save remains the only act that does.
  const resumeDraft = async (d: LiveTestDraft) => {
    setResumeOffer(null);
    liveId.current = d.liveId;
    componentPill.current = d.component;
    slotTarget.current = d.slot as typeof slotTarget.current;
    // A draft can't prove its blob matches the saved row's file, so a
    // liveId draft re-persists the PDF on Save — harmless when identical,
    // correct when the draft was a replacement (review, Aug 15 2026).
    fileReplaced.current = !!d.liveId;
    setArriving(true);
    try {
      const file = new File([d.blob], d.fileName, { type: 'application/pdf' });
      await loadTemplate(file, d.name ?? undefined);
      setDirty(true); // a draft is in-progress unsaved work by definition
    } catch {
      setArriving(false);
      setError('Could not reopen the draft.');
    }
  };
  const discardDraft = (d: LiveTestDraft) => {
    setResumeOffer(null);
    void clearLiveTestDraft(d.pressId);
    onExit();
  };

  const onPickArt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    artIsViewedRun.current = false; // a deliberate fresh pick is submittable again
    await loadArtFromFile(f);
  };

  // True while `art`/`artFile` hold a SAVED run's art re-hydrated for viewing
  // a certified template — Save must not re-upload/re-test/re-certify it.
  const artIsViewedRun = useRef(false);

  // Shared art loader — the picker and the saved-run rehydrate (view mode)
  // both run the same parse + overlay + ink-inspect pipeline. markDirty=false
  // means "just viewing a saved result": nothing to save, Close changes nothing.
  const loadArtFromFile = async (f: File, opts?: { markDirty?: boolean }) => {
    const markDirty = opts?.markDirty !== false;
    const myPick = ++pickSeq.current;
    setBusy('art'); setError(null);
    // Supersede any in-flight ink scan IMMEDIATELY — before the new file even
    // parses — so the old request can't keep painting progress/results while
    // the new one loads (and the raster/parse-failure paths start clean too).
    inkXhr.current?.abort();
    inkXhr.current = null;
    artFile.current = null;
    setInkChecks(null);
    setInkProgress(null);
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        const doc = await (await loadPdfjs()).getDocument({ data: await f.arrayBuffer() }).promise;
        const { img, wMm, hMm } = await renderPage(doc, 1);
        const { layerNames } = await extractGtLayers(doc, 1);
        if (pickSeq.current !== myPick) return; // a newer pick superseded this parse
        const gtNames = layerNames.filter((n) => n.trim().toUpperCase().startsWith('GT'));
        setFormatNotice(null);
        setArt({ name: f.name, img, wMm, hMm, pageCount: doc.numPages, gtLayerNames: gtNames });
        artFile.current = f;
        setShowTemplate(false);
        runInkInspect(f, 'application/pdf');
      } else {
        // Raster image (JPEG/PNG/TIFF, plus best-effort PSD) — measurable too
        // (gogoods, Aug 16 2026: MRP wants art-only files at the proper
        // artboard size, so a correct JPG is a legitimate final; Aug 18 2026:
        // TIFF is the standard print raster, and PSD is flattened server-side).
        // The overlay preview stays visual (no physical size client-side), but
        // the server check measures pixel dims + PPI tag + color space against
        // the slot's artboard.
        const name = f.name.toLowerCase();
        const contentType = f.type
          || (name.endsWith('.tif') || name.endsWith('.tiff') ? 'image/tiff'
            : name.endsWith('.psd') ? 'image/vnd.adobe.photoshop'
            : 'image/jpeg');
        // Browsers can't render TIFF/PSD in an <img> — skip the local data-URL
        // preview for those; the server sends back a resized sRGB preview that
        // swaps in once the inspection lands (same path CMYK JPEGs already use).
        const browserRenders = contentType.startsWith('image/png') || contentType.startsWith('image/jpeg');
        const img = browserRenders
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error('Could not read that image.'));
              reader.readAsDataURL(f);
            })
          : '';
        if (pickSeq.current !== myPick) return; // a newer pick superseded this read
        // PNG is structurally RGB — it can never carry CMYK ink, so the color
        // check will always fail. Say so up front instead of a puzzling late
        // failure (Task #3161).
        setFormatNotice(contentType.startsWith('image/png')
          ? 'PNG can\u2019t be CMYK, so it won\u2019t pass the color check. Export a CMYK TIFF, CMYK JPEG, or PDF for print ink.'
          : null);
        setArt({ name: f.name, img, wMm: null, hMm: null, pageCount: null, gtLayerNames: [] });
        artFile.current = f; // server test submission still requires a PDF and skips rasters
        setShowTemplate(false);
        runInkInspect(f, contentType);
      }
      if (pickSeq.current !== myPick) return;
      if (markDirty) setDirty(true); // a loaded art result is unsaved work — Save persists it
    } catch (err) {
      if (pickSeq.current !== myPick) return; // stale failure — don't clobber the newer pick
      setArt(null);
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally { if (pickSeq.current === myPick) setBusy(null); }
  };

  // Ink + PPI (and, for rasters, size/color) live on the server scanner —
  // stream the file up in the background; the row shows "Measuring…" until
  // it lands.
  // The deployment edge 413s big request bodies before they ever reach the
  // server (gogoods' 59MB CMYK jacket JPEG "inspection unavailable" on prod,
  // Aug 16 2026 — dev has no such cap). Files over this ride the signed-PUT
  // direct-to-storage flow instead, then we post just the object path.
  const EDGE_SAFE_BYTES = 20 * 1024 * 1024;

  const runInkInspect = (f: File, contentType: string) => {
    setInkChecks('checking');
    setInkErrorMsg(null);
    setInkProgress(0);
    let myXhr: XMLHttpRequest | null = null;
    void (async () => {
      try {
        let sendBody: File | string = f;
        let sendCt = contentType;
        if (f.size > EDGE_SAFE_BYTES) {
          const signRes = await fetch('/api/admin/upload-doc/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authHeaders() as Record<string, string>) },
            credentials: 'include',
            body: JSON.stringify({ contentType }),
          });
          if (!signRes.ok) throw new Error(String(signRes.status));
          const { uploadUrl, finalPath } = (await signRes.json()) as { uploadUrl: string; finalPath: string };
          if (artFile.current !== f) return; // superseded while signing
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            myXhr = xhr;
            inkXhr.current = xhr;
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable && artFile.current === f) setInkProgress(Math.min(ev.loaded / ev.total, 1));
            };
            xhr.upload.onload = () => { if (artFile.current === f) setInkProgress(1); };
            xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
            xhr.onerror = () => reject(new Error('network'));
            xhr.onabort = () => reject(new Error('superseded'));
            xhr.timeout = 6 * 60_000;
            xhr.ontimeout = () => reject(new Error('timeout'));
            xhr.send(f);
          });
          if (artFile.current !== f) return; // superseded during the upload
          sendBody = JSON.stringify({ objectPath: finalPath });
          sendCt = 'application/json';
        }
        // XHR instead of fetch: fetch can't report UPLOAD progress, and
        // watching the measurement happen live is the point (gogoods).
        const d = await new Promise<{ checks: CheckRow[]; previewDataUrl?: string; pxW?: number; pxH?: number }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          myXhr = xhr;
          inkXhr.current = xhr;
          // specId (when this session is on a known slot) lets the server
          // check bleed/artboard against the slot's certified template line.
          // The template's GT Bleed box rides along too — a matching-the-
          // template image is placed at the bleed frame, so the server can
          // measure PDF image PPI against that intended footprint instead of
          // only the full-artboard worst case (gogoods, Aug 16 2026).
          const bleedZ = zones.find((z) => z.zone === 'Bleed');
          const bb = bleedZ?.line ?? bleedZ?.area;
          const qs = new URLSearchParams();
          if (specRef.current) qs.set('specId', specRef.current);
          if (bb) { qs.set('bleedWIn', String(bb.wMm / 25.4)); qs.set('bleedHIn', String(bb.hMm / 25.4)); }
          xhr.open('POST', `/api/press/${pressId}/templates/art-inspect${qs.size ? `?${qs}` : ''}`);
          xhr.setRequestHeader('Content-Type', sendCt);
          for (const [k, v] of Object.entries(authHeaders() as Record<string, string>)) xhr.setRequestHeader(k, v);
          xhr.withCredentials = true;
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && artFile.current === f) setInkProgress(Math.min(ev.loaded / ev.total, 1));
          };
          // Upload done — the server is now measuring; the bar goes indeterminate.
          xhr.upload.onload = () => { if (artFile.current === f) setInkProgress(1); };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try { resolve(JSON.parse(xhr.responseText) as { checks: CheckRow[]; previewDataUrl?: string; pxW?: number; pxH?: number }); }
              catch { reject(new Error('bad response')); }
            } else {
              // Surface the server's reason when it sent one (e.g. a PSD
              // that couldn't be flattened → "export TIFF or PDF instead").
              let msg = '';
              try { msg = String((JSON.parse(xhr.responseText) as { message?: string })?.message ?? ''); } catch { /* not JSON */ }
              if (msg && artFile.current === f) setInkErrorMsg(msg);
              reject(new Error(String(xhr.status)));
            }
          };
          xhr.onerror = () => reject(new Error('network'));
          xhr.onabort = () => reject(new Error('superseded'));
          xhr.timeout = 6 * 60_000; // hair past the server's 5-minute cap
          xhr.ontimeout = () => reject(new Error('timeout'));
          xhr.send(sendBody);
        });
        setInkChecks((prev) => (artFile.current === f ? d.checks : prev));
        // CMYK JPEGs don't decode in the browser — the local <img> preview
        // comes up blank exactly when the ink check passes. The server sends
        // a resized sRGB preview; swap it in for raster art (gogoods, Aug 16
        // 2026). PDFs keep their pdfjs render.
        if (d.previewDataUrl && artFile.current === f) {
          setArt((prev) => (prev && prev.wMm == null
            ? { ...prev, img: d.previewDataUrl!, pxAspect: d.pxW && d.pxH ? d.pxW / d.pxH : undefined }
            : prev));
        }
      } catch {
        setInkChecks((prev) => (artFile.current === f ? 'error' : prev));
      } finally {
        if (artFile.current === f) setInkProgress(null);
        // Only clear the ref if it's still OUR xhr — a newer pick may have
        // already installed its own request (review, Aug 16 2026).
        if (myXhr && inkXhr.current === myXhr) inkXhr.current = null;
      }
    })();
  };

  // Zones present in the template, grouped LINE + AREA.
  const zones = useMemo(() => {
    if (!template) return [];
    const byZone = new Map<string, { zone: string; line?: GtLayer; area?: GtLayer }>();
    for (const l of template.layers) {
      const entry = byZone.get(l.zone) ?? { zone: l.zone };
      if (l.kind === 'line') entry.line = l;
      else entry.area = entry.area ?? l;
      byZone.set(l.zone, entry);
    }
    return [...byZone.values()].sort((a, b) => zoneSort(a.zone, b.zone));
  }, [template]);

  const bleed = zones.find((z) => z.zone === 'Bleed');
  const cut = zones.find((z) => z.zone === 'Cut');
  const bleedBox = bleed?.line ?? bleed?.area;
  const cutBox = cut?.line ?? cut?.area;

  // Measured checks — PDF art only. Word + icon, never color alone.
  const checks: CheckRow[] = useMemo(() => {
    if (!template || !art) return [];
    const rows: CheckRow[] = [];
    // gogoods, Aug 16 2026: rasters get NO "Physical size — Not measured" row —
    // a JPG/PNG can never carry physical mm, so the row is permanent noise;
    // Artboard size + Image resolution cover the slot fit for pixels.
    if (art.wMm !== null && art.hMm !== null) {
      const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
      const dims = `${art.wMm.toFixed(1)} × ${art.hMm.toFixed(1)} mm`;
      if (bleedBox) {
        // Andrew, Aug 14 2026: pass when art ≥ the bleed area (either orientation).
        // Bigger than bleed is fine — only smaller fails. ±1mm grace on "equal".
        const atLeast = (a: number, b: number, tol = 1) => a >= b - tol;
        const covers = (w: number, h: number) => atLeast(art.wMm!, w) && atLeast(art.hMm!, h);
        const ok = covers(bleedBox.wMm, bleedBox.hMm) || covers(bleedBox.hMm, bleedBox.wMm);
        const exact = (near(art.wMm, bleedBox.wMm) && near(art.hMm, bleedBox.hMm)) || (near(art.wMm, bleedBox.hMm) && near(art.hMm, bleedBox.wMm));
        rows.push(ok
          ? { param: 'Bleed size', tone: 'pass', detail: exact
              ? `Art measures ${dims} — matches the template’s GT Bleed (${bleedBox.wMm.toFixed(1)} × ${bleedBox.hMm.toFixed(1)} mm)`
              : `Art measures ${dims} — covers the template’s GT Bleed (${bleedBox.wMm.toFixed(1)} × ${bleedBox.hMm.toFixed(1)} mm); the extra trims away` }
          : { param: 'Bleed size', tone: 'fail', detail: `Art measures ${dims} — smaller than the template’s GT Bleed (${bleedBox.wMm.toFixed(1)} × ${bleedBox.hMm.toFixed(1)} mm)` });
        if (!ok && cutBox && ((near(art.wMm, cutBox.wMm) && near(art.hMm, cutBox.hMm)) || (near(art.wMm, cutBox.hMm) && near(art.hMm, cutBox.wMm)))) {
          rows.push({ param: 'Bleed missing', tone: 'fail', detail: 'Art matches the Cut size exactly — it was exported without bleed. Extend art to the Bleed line.' });
        }
      } else {
        rows.push({ param: 'Bleed size', tone: 'na', detail: 'Template has no GT Bleed layer to measure against.' });
      }
      rows.push(art.pageCount === 1
        ? { param: 'Pages', tone: 'pass', detail: '1 page — a jacket is one spread' }
        : { param: 'Pages', tone: 'fail', detail: `${art.pageCount} pages — a jacket spread is 1 page` });
    }
    rows.push(art.gtLayerNames.length === 0
      ? { param: 'File hygiene', tone: 'pass', detail: art.wMm === null ? 'Raster image — flat pixels can’t carry template layers, so the file is clean by definition' : 'No GT template layers left inside the art file' }
      : { param: 'File hygiene', tone: 'fail', detail: `Template layers still present in the art file: ${art.gtLayerNames.join(', ')} — delete them before handoff` });
    // No "Safety — Not measured" filler row (gogoods, Aug 16 2026): safety is
    // a human eyeball check, and it lives in the overlay toggles below — the
    // checklist holds only what the system actually measures.
    // Ink + PPI — measured live by the server scanner (gogoods, Aug 15 2026).
    // Rasters (JPEG/PNG) get measured too since Aug 16: pixel dims + PPI tag
    // + color space against the slot's artboard.
    if (inkChecks === 'checking') {
      rows.push({ param: 'Color & resolution', tone: 'na', detail: 'Measuring ink and image resolution…' });
    } else if (Array.isArray(inkChecks)) {
      rows.push(...inkChecks);
    }
    // Up-front format guidance (PNG can't be CMYK) — shows even while the
    // server is still measuring, so the color fail is never a surprise.
    if (formatNotice) rows.unshift({ param: 'Format', tone: 'fail', detail: formatNotice }); else {
      // A dead measurement is not a shrug — offer the retry right here
      // (gogoods, Aug 16 2026: a one-off network drop left "unavailable",
      // a Pass! header, and a blank preview until a full page refresh).
      rows.push({ param: 'Color & resolution', tone: 'na', detail: 'The ink + resolution check didn’t finish (connection hiccup). Use “Re-run measurement” below — no need to re-pick the file.' });
    }
    return rows;
  }, [template, art, bleedBox, cutBox, inkChecks, formatNotice]);

  const measured = checks.filter((c) => c.tone !== 'na');
  // While the server ink/PPI scan is still in flight, the header must not
  // claim a clean pass over rows that aren't measured yet (review, Aug 15
  // 2026); a failed inspection stays advisory like the old prepress note.
  const inkPending = inkChecks === 'checking';
  // A failed measurement must never let the header claim a clean pass —
  // for a raster nothing real was measured yet (gogoods, Aug 16 2026).
  const inkFailed = inkChecks === 'error';
  const allPass = !inkPending && !inkFailed && measured.length > 0 && measured.every((c) => c.tone === 'pass');
  // New result → banner folds itself on a clean pass, opens on anything else.
  // A new file opens the detail rows; a finished measurement KEEPS them open —
  // the auto-fold on a clean pass yanked the list away mid-read (gogoods,
  // Aug 16 2026). Completion instead replays the settle + ring animation as a
  // gentle "it's done" — the viewer closes the banner when they choose.
  useEffect(() => { if (art) setChecksOpen(true); }, [art?.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const [donePulse, setDonePulse] = useState(0);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !inkPending && inkChecks !== null) setDonePulse((p) => p + 1);
    wasPending.current = inkPending;
  }, [inkPending, inkChecks]);
  const verdictWord = inkPending ? 'Checking…' : inkFailed ? 'Incomplete' : allPass ? 'Pass' : measured.some((c) => c.tone === 'fail') ? 'Flagged' : 'Visual only';

  // Re-run the server measurement on the SAME file — a network hiccup must
  // not force a page refresh + re-pick (gogoods, Aug 16 2026).
  const retryInkInspect = () => {
    const f = artFile.current;
    if (!f) return;
    const name = f.name.toLowerCase();
    const isPdf = f.type === 'application/pdf' || name.endsWith('.pdf');
    const rasterCt = f.type
      || (name.endsWith('.tif') || name.endsWith('.tiff') ? 'image/tiff'
        : name.endsWith('.psd') ? 'image/vnd.adobe.photoshop'
        : 'image/jpeg');
    runInkInspect(f, isPdf ? 'application/pdf' : rasterCt);
  };

  // Save the current art's result into the trail, then invite the next file.
  const saveResultAndTestAnother = () => {
    if (art) {
      const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setTestLog((log) => [...log, { art: art.name, at, verdict: verdictWord }]);
      setDirty(true); // new results are unsaved work until Save
    }
    artInput.current?.click();
  };

  // Spec/slot-mode: submit this session's tested art PDF to the real server
  // test endpoint so the run lands in the spec's trail — and certify the live
  // revision when the server verdict passes. This is what "it certifies
  // itself when a finished file passes" actually does; without it a press
  // with "require a passing test before a template goes live" On could never
  // certify (review, Aug 15 2026). Raster overlays never reach here (PDF only).
  const submitServerTest = async (specId: string) => {
    const f = artFile.current;
    if (!f) return;
    if (artIsViewedRun.current) return; // viewing a saved run — nothing new to test
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return;
    const url = await uploadAdminDoc(f);
    // Thread the template's OWN bleed line (read from its GT Bleed/Cut layer
    // boxes) to the server test — templates that draw guides in GT layers
    // (not a dieline separation) have no stored line, and without one the
    // server run hard-failed Bleed against the art's meaningless PDF BleedBox
    // (gogoods, Aug 16 2026: shelf said "Failed" after a clean live pass).
    const templateBleedLineInches = (() => {
      if (!bleedBox || !cutBox) return undefined;
      const wIn = (bleedBox.wMm - cutBox.wMm) / 2 / 25.4;
      const hIn = (bleedBox.hMm - cutBox.hMm) / 2 / 25.4;
      const m = Math.min(wIn, hIn);
      return m > 0.01 && m <= 2 ? Math.round(m * 1000) / 1000 : undefined;
    })();
    // The cut rectangle itself (template coords, inches) — sheet-with-margins
    // templates put the cut line deep inside the artboard, so the server's
    // rendered-content bleed measurement needs the real geometry.
    const r3 = (v: number) => Math.round((v / 25.4) * 1000) / 1000;
    const templateCutRect = cutBox
      ? { leftIn: r3(cutBox.xMm), topIn: r3(cutBox.yMm), widthIn: r3(cutBox.wMm), heightIn: r3(cutBox.hMm) }
      : undefined;
    const r = await apiRequest('POST', templateTestPath(pressId, specId), { url, fileName: f.name, templateBleedLineInches, templateCutRect });
    const { run } = (await r.json()) as { run?: { id: string; verdict: string } };
    if (run && (run.verdict === 'pass' || run.verdict === 'warn')) {
      await apiRequest('POST', certifyRunPath(pressId, specId, run.id), {});
    }
  };

  // Accept & Save — persist the template + its test trail on the server,
  // then return to the Templates page (which refetches the shelf).
  const saveAndExit = async () => {
    if (!template || !currentFile.current) { onExit(); return; }
    setBusy('save'); setError(null);
    try {
      // "Save result & test another" may have already logged the CURRENT art
      // (picker cancelled) — don't serialize the same result twice.
      const last = testLog[testLog.length - 1];
      const currentLogged = !!(art && last && last.art === art.name && last.verdict === verdictWord);
      const tests = art && !currentLogged ? [...testLog, { art: art.name, at: '', verdict: verdictWord }] : testLog;
      const testsPayload = tests.map((e) => ({ artName: e.art, verdict: e.verdict }));
      const previewImg = await shrinkDataUrl(template.img);
      if (specRef.current && !fileReplaced.current) {
        // Spec-mode plain Save (gogoods bug, Aug 15 2026): the file already
        // lives on the slot — re-attaching would mint a needless revision,
        // and the old code fell through to the shelf POST and minted a
        // duplicate tile. Only the rename persists (display-name PATCH).
        if (template.name !== (initialName.current ?? '')) {
          await apiRequest('PATCH', `/api/press/${pressId}/templates/${specRef.current}/display-name`, {
            displayName: template.name,
          });
        }
        await submitServerTest(specRef.current);
      } else if (slotTarget.current) {
        // Slot-mode (dashed tile / Replace, Bill's handoff): Accept & Save
        // attaches the PDF to the canon slot — a NEW revision is minted, the
        // previous one moves to history, it is never deleted.
        const s = slotTarget.current;
        const fileUrl = await uploadAdminDoc(currentFile.current);
        const r = await apiRequest('PUT', `/api/press/${pressId}/templates`, {
          format: s.format,
          componentKey: s.componentKey,
          variantKey: s.variantKey,
          discCount: s.discCount,
          fileUrl,
          fileName: originalName ?? currentFile.current.name,
        });
        const data = (await r.json()) as { spec: { id: string }; detectedOptions?: Array<{ key: string; label: string }> };
        // A rename made in this session rides along — for FIRST attaches too,
        // not just Replace (gogoods bug, Aug 16 2026: renaming during the
        // initial slot attach was silently dropped because the PATCH was
        // gated on the pre-existing spec ref, which is null on first attach).
        // Runs BEFORE the detected-options early return so that path keeps
        // the rename as well. Baseline = whatever name the session started
        // with (saved display name, else the file's own name).
        const nameBaseline = initialName.current ?? originalName ?? currentFile.current.name;
        if (template.name && template.name !== nameBaseline) {
          // Best-effort: the PDF is already attached above — a failed rename
          // must not fail the whole Save (a retry would re-PUT and mint a
          // duplicate revision). The operator can redo the rename any time.
          try {
            await apiRequest('PATCH', `/api/press/${pressId}/templates/${data.spec.id}/display-name`, {
              displayName: template.name,
            });
          } catch (e) {
            console.warn('[live-test] rename did not persist:', e);
          }
        }
        // One file covering several options (e.g. both center-hole sizes):
        // stamp the note only with the operator's OK (Task #3065 consent kept)
        // — swap the confirm sheet to the options question and stop here.
        if (data.detectedOptions && data.detectedOptions.length >= 2) {
          setDetected({ specId: data.spec.id, options: data.detectedOptions });
          setBusy(null);
          return;
        }
        await submitServerTest(data.spec.id);
      } else if (liveId.current) {
        // Replace (••• menu / Index tile): the swapped-in PDF must persist on
        // the same row, or reopening the tile would serve the OLD file.
        const replacedFile = fileReplaced.current
          ? { fileUrl: await uploadAdminDoc(currentFile.current), fileName: originalName ?? currentFile.current.name }
          : {};
        await apiRequest('PATCH', `/api/press/${pressId}/templates/live/${liveId.current}`, {
          name: template.name,
          previewImg,
          wMm: template.wMm,
          hMm: template.hMm,
          layerCount: template.layers.length,
          tests: testsPayload,
          ...replacedFile,
        });
      } else {
        const fileUrl = await uploadAdminDoc(currentFile.current);
        await apiRequest('POST', `/api/press/${pressId}/templates/live`, {
          name: template.name,
          component: componentPill.current,
          fileUrl,
          fileName: originalName ?? currentFile.current.name,
          previewImg,
          wMm: template.wMm,
          hMm: template.hMm,
          layerCount: template.layers.length,
          tests: testsPayload,
        });
      }
      freshLiveSave.flag = true;
      void clearLiveTestDraft(pressId); // saved for real — the crash-safety draft has done its job
      await queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
      onExit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template.');
    } finally { setBusy(null); }
  };

  // Answer to the detected-options question (slot mode): optionally stamp the
  // note, then finish the save the same way the direct path does.
  const resolveDetected = async (yes: boolean) => {
    if (!detected) return;
    setBusy('save');
    try {
      if (yes) {
        await apiRequest('POST', `/api/press/${pressId}/templates/${detected.specId}/options`, { options: detected.options });
      }
      // The detected-options early-return skipped the direct path's server
      // test — run it here so the session's passing art still certifies.
      await submitServerTest(detected.specId);
      setDetected(null);
      freshLiveSave.flag = true;
      void clearLiveTestDraft(pressId); // saved for real — the crash-safety draft has done its job
      await queryClient.invalidateQueries({ queryKey: [`/api/press/${pressId}/templates`] });
      onExit();
    } catch (err) {
      // The file is already attached — keep the dialog so the operator can
      // retry the note (re-attaching would mint a needless extra revision).
      setError(err instanceof Error ? err.message : 'Could not save the options note.');
    } finally { setBusy(null); }
  };

  // Art placement: centered on the GT Bleed box (fallback: Cut, then full page).
  const anchor = bleedBox ?? cutBox ?? null;
  const artRect = useMemo(() => {
    if (!template || !art) return null;
    // No GT Bleed/Cut box in the template (layerless PDF): never go blank —
    // anchor to the full page instead so you can still look (Bill, Aug 16 2026).
    const anchor2 = anchor ?? { xMm: 0, yMm: 0, wMm: template.wMm, hMm: template.hMm };
    if (art.wMm === null || art.hMm === null) {
      // Raster: contain-fit inside the anchor at the image's own aspect —
      // stretch-filling squished the JPG (gogoods, Aug 16 2026). Before the
      // server scan reports pixel dims, fill the anchor as before.
      if (!art.pxAspect) return anchor2;
      // A raster whose proportions match the FULL template sheet is a
      // full-artboard export — place it edge-to-edge over the template, not
      // inside the bleed box (gogoods, Aug 16 2026: the full-artboard JPG
      // rendered shrunken inside the bleed frame).
      const pageAspect = template.wMm / template.hMm;
      // Closest-aspect-wins (review, Aug 16 2026): on templates where the
      // bleed frame and the full sheet have near-identical proportions, an
      // aspect-only 2% gate could promote a bleed-sized JPG to full-sheet.
      // Promote only when the full sheet is BOTH within tolerance and a
      // strictly better aspect match than the anchor box; ties stay on the
      // anchor (the safer placement — art never renders larger than intended).
      const pageErr = Math.abs(art.pxAspect / pageAspect - 1);
      const anchorErr = Math.abs(art.pxAspect / (anchor2.wMm / anchor2.hMm) - 1);
      const box = pageErr <= 0.02 && pageErr < anchorErr
        ? { xMm: 0, yMm: 0, wMm: template.wMm, hMm: template.hMm }
        : anchor2;
      const boxAspect = box.wMm / box.hMm;
      let w = box.wMm, h = box.hMm;
      if (art.pxAspect > boxAspect) h = w / art.pxAspect; else w = h * art.pxAspect;
      return { xMm: box.xMm + (box.wMm - w) / 2, yMm: box.yMm + (box.hMm - h) / 2, wMm: w, hMm: h };
    }
    // Orientation-aware: if rotated match, still center on anchor with real dims.
    const cx = anchor2.xMm + anchor2.wMm / 2;
    const cy = anchor2.yMm + anchor2.hMm / 2;
    return { xMm: cx - art.wMm / 2, yMm: cy - art.hMm / 2, wMm: art.wMm, hMm: art.hMm };
  }, [template, art, anchor]);

  const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;

  // SVG path (mm units) for a rect or ellipse — used for even-odd frame washes.
  const shapePath = (x: number, y: number, w: number, h: number, round?: boolean) =>
    round
      ? `M ${x} ${y + h / 2} a ${w / 2} ${h / 2} 0 1 0 ${w} 0 a ${w / 2} ${h / 2} 0 1 0 ${-w} 0 Z`
      : `M ${x} ${y} h ${w} v ${h} h ${-w} Z`;

  // ── View focus: Full Template, or crop to a GT zone (Back/Front/Spine). ──
  const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];
  const focus = useMemo(() => {
    if (!template) return null;
    let r = { x: 0, y: 0, w: template.wMm, h: template.hMm };
    if (viewArea !== 'full') {
      const z = zones.find((zz) => zz.zone === viewArea);
      const b = z?.line ?? z?.area;
      if (b) {
        const pad = Math.max(b.wMm, b.hMm) * 0.04;
        r = { x: b.xMm - pad, y: b.yMm - pad, w: b.wMm + pad * 2, h: b.hMm + pad * 2 };
      }
    }
    return r;
  }, [template, zones, viewArea]);

  // The viewport itself reshapes to the focus rect (Bill, Aug 14 2026): its
  // aspect matches the selected zone (e.g. square for the front cover), width
  // shrinks to what the zone needs while the height stays roughly the same.
  // The inner "world" keeps the full template's aspect; the transform maps the
  // focus rect to exactly fill the reshaped viewport. MAG zooms, pan shifts.
  const viewT = useMemo(() => {
    if (!template || !focus) return { s: 1, tx: 0, ty: 0 };
    let s = template.wMm / focus.w;
    s *= zoom;
    const cx = panC ? panC.x : (focus.x + focus.w / 2) / template.wMm;
    const cy = panC ? panC.y : (focus.y + focus.h / 2) / template.hMm;
    return {
      s,
      tx: 0.5 - cx * s,
      ty: 0.5 * (focus.h / focus.w) * (template.wMm / template.hMm) - cy * s,
    };
  }, [template, focus, zoom, panC]);

  // Viewport width as a % of the card, so a square zone reads square and the
  // spine reads as a tall strip — height stays what the full view would use.
  const viewportPct = useMemo(() => {
    if (!template || !focus) return 100;
    return Math.min(100, ((focus.w / focus.h) / (template.wMm / template.hMm)) * 100);
  }, [template, focus]);

  // Which zone chips make sense for the current view — picking Spine hides
  // everything that isn't the spine (Bill, Aug 14 2026).
  const zoneRelevant = (zone: string) => {
    if (viewArea === 'full') return true;
    // Bleed and Cut are template-wide lines that run through every panel —
    // they must stay toggleable in the cropped views too (gogoods, Aug 16
    // 2026: "there's no bleed setting in the dropdown — where did it go?").
    if (zone === 'Bleed' || zone === 'Cut') return true;
    if (viewArea === 'Spine') return zone === 'Spine';
    const side = viewArea.split(' ')[0]; // 'Front' | 'Back'
    return zone.includes(side);
  };

  const pickView = (v: typeof viewArea) => { setViewArea(v); setPanC(null); setZoom(1); };
  const stepZoom = (dir: 1 | -1) => setZoom((z) => {
    const i = ZOOMS.indexOf(z);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir))];
    if (next === 1) setPanC(null); // back to fit — recenter
    return next;
  });
  const step: 1 | 2 | 3 = !template ? 1 : !art ? 2 : 3;

  const toggleZone = (z: string) => setActiveZones((prev) => {
    const next = new Set(prev);
    if (next.has(z)) next.delete(z); else next.add(z);
    return next;
  });

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px', color: t.ink }}>
        {/* Keyframes live at page root — they used to sit inside ThinProgress
            and disappeared whenever no progress bar was mounted (Bill, Aug 16 2026:
            "I don't see any animations at all"). */}
        <style>{`@keyframes gt-thin-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
@keyframes gt-certify-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(49,158,216,0); } 50% { box-shadow: 0 0 0 4px rgba(49,158,216,0.25); } }
@keyframes gt-verdict-arrive { 0% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 1; transform: translateY(0); } }
@keyframes gt-verdict-ring { 0% { box-shadow: 0 0 0 0 var(--gt-verdict-glow); } 45% { box-shadow: 0 0 0 6px var(--gt-verdict-glow); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
@keyframes gt-orbit-spin { from { transform: translate(-50%,-50%) rotate(0deg); } to { transform: translate(-50%,-50%) rotate(360deg); } }
@keyframes gt-pending-fill { 0%, 100% { background-color: rgba(245,158,11,0); box-shadow: 0 0 0 0 rgba(245,158,11,0); } 50% { background-color: rgba(245,158,11,0.16); box-shadow: 0 0 0 3px rgba(245,158,11,0.16); } }
@keyframes gt-ink-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
        <nav aria-label="breadcrumb" data-testid="breadcrumb-livetest">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" onClick={onExit} className={cn('transition-colors', t.hoverInk)}>Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            {/* Crumb = where you are: the template's own name once one is open
                (Bill, Aug 15 2026); "Live test" only before a file arrives. */}
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>{template?.name ?? 'Live test'}</span></li>
          </ol>
        </nav>

        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              {/* Heading tells the job (Bill, Aug 15 2026): an uncertified template
                  still needs certifying, so the third word appears only then. */}
              <span style={{ color: t.ink }}>Template. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Test.</span>
              <span style={{ color: t.subink, fontWeight: 500 }}> Certify.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 720 }}>
              Upload a press template with GT layers, then an art file. The overlays below are read
              straight from the template&rsquo;s own Illustrator layers — exact to the hundredth of a millimeter.
            </p>
          </div>
          {/* "Start over" removed (Bill, Aug 15 2026) — it was playground chrome.
              Cancel leaves; Replace template… (header •••) swaps the file. */}
        </div>

        {/* Step rail removed (Bill, Aug 16 2026) — the checks banner
            below the heading carries the state now. */}

        {error && (
          <p className="mt-4 text-[12.5px]" style={{ color: t.crit }} data-testid="text-error">{error}</p>
        )}

        {/* "Resume where you left off?" — empty-handed arrival with a draft
            on this computer (canon, Aug 15 2026). Handoff-verbatim visuals;
            X close keeps the draft, Discard deletes it, Resume reopens it. */}
        {resumeOffer && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            data-testid="sheet-resume-draft-backdrop"
          >
            <div
              className="relative rounded-2xl overflow-hidden shadow-2xl w-full text-center px-8 py-9"
              style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 440 }}
              role="dialog"
              aria-label="Resume where you left off?"
              data-testid="sheet-resume-draft"
            >
              <button
                type="button"
                onClick={() => { setResumeOffer(null); onExit(); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
                style={{ backgroundColor: t.soft, color: t.subink }}
                aria-label="Close"
                data-testid="button-close-resume"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: t.soft, border: `1px solid ${t.hairline}` }}>
                <History className="w-5 h-5" style={{ color: t.subink }} />
              </div>
              <div className="mt-4 text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
                Resume where you left off?
              </div>
              {/* One line, Apple-quiet (canon, Aug 15 2026). */}
              {/* The ⓘ tooltip read as a dead button (Bill, Aug 15 2026) — the
                  explanation just says itself now, one quiet line. */}
              <p className="mt-1.5 text-[13px] mx-auto" style={{ color: t.subink }}>
                {resumeOffer.name ?? resumeOffer.slot?.title ?? resumeOffer.fileName} — kept as a draft on this computer.
              </p>
              <p className="mt-1 text-[12px] mx-auto" style={{ color: t.faint, maxWidth: 330 }} data-testid="text-draft-note">
                You opened this without pressing Save. Nothing lands in Templates until you do.
              </p>
              {/* Canon (Bill, Aug 15 2026): confirming action rightmost; Cancel/dismiss quiet text to its left. */}
              <div className="mt-6 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => discardDraft(resumeOffer)}
                  className="h-9 px-4 rounded-full text-[13px] font-medium transition-colors hover:opacity-80"
                  style={{ color: t.subink }}
                  data-testid="button-discard-draft"
                >
                  Discard draft
                </button>
                <button
                  type="button"
                  onClick={() => { void resumeDraft(resumeOffer); }}
                  className="h-9 px-5 rounded-full text-[13px] font-semibold text-white"
                  style={{ backgroundColor: t.blue }}
                  data-testid="button-resume-draft"
                >
                  Resume
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Arrived with a template in hand — plain opening state, no upload talk. */}
        {step === 1 && arriving && (
          <div className="mt-6 flex flex-col items-center justify-center px-8 py-24">
            <ThinProgress label="Opening template" t={t} testid="progress-opening-template" />
          </div>
        )}

        {/* ── Step 1 · Upload the template ── */}
        {step === 1 && !arriving && (
          <div className="mt-6 rounded-2xl flex flex-col items-center justify-center text-center px-8 py-20" style={{ backgroundColor: t.card, border: `1.5px dashed ${t.hairline}` }}>
            <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: t.neutralWash }}>
              <FileText className="w-6 h-6" style={{ color: t.subink }} />
            </span>
            <div className="mt-4 text-[16px] font-semibold" style={{ color: t.ink }}>Upload your template</div>
            {/* One line, Apple-quiet; the detail lives behind the i (Bill, Aug 15 2026) */}
            <p className="mt-1.5 text-[13px] inline-flex items-center gap-1.5" style={{ color: t.subink }}>
              Your Illustrator PDF, GT layers included.
              <span
                className="inline-flex items-center justify-center cursor-help"
                title={'Layers named "GT CUT LINE", "GT BLEED AREA", and so on are read by name, exactly where you drew them.'}
                aria-label="About GT layers"
                data-testid="info-gt-layers"
              >
                <Info className="w-3.5 h-3.5" style={{ color: t.faint }} />
              </span>
            </p>
            {busy === 'template' ? (
              <ThinProgress label="Reading layers" t={t} testid="progress-reading-layers" />
            ) : (
              <button
                type="button"
                onClick={() => templateInput.current?.click()}
                disabled={busy !== null}
                className="mt-6 inline-flex items-center gap-2 h-10 px-5 rounded-full text-[13.5px] font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: t.blue }}
                data-testid="button-upload-template"
              >
                <Upload className="w-4 h-4" />
                Choose template PDF
              </button>
            )}
          </div>
        )}

        {/* ── Step 2+3 · Template loaded — full-width preview; layers pop over ── */}
        {template && (
          <div className="mt-6">
            {/* Pending — same module as Pass/Fail, shown while an uncertified
                template has no test yet (Bill, Aug 16 2026): the banner is the
                page's one status voice, Pending → Pass/Fail. */}
            {!art && !savedMeta && priorTests.length === 0 && testLog.length === 0 && (
              <div className="mb-4">
                {/* Action wanted — a quiet amber ring with a point of light
                    orbiting the border, Apple-subtle (Bill, Aug 16 2026).
                    Browsers without @property just show the soft amber ring. */}
                <div className="rounded-2xl relative overflow-hidden" style={{ padding: 1.5 }}>
                  {/* The beam: an oversized conic square spinning by transform —
                      moves everywhere, no @property needed. */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: '50%', top: '50%', width: '250%', aspectRatio: '1 / 1',
                      background: `conic-gradient(rgba(245,158,11,0.16) 0deg, rgba(245,158,11,0.6) 24deg, rgba(255,255,255,0.92) 32deg, rgba(245,158,11,0.6) 40deg, rgba(245,158,11,0.16) 90deg, rgba(245,158,11,0.16) 360deg)`,
                      animation: 'gt-orbit-spin 3.6s linear infinite',
                    }}
                    aria-hidden
                  />
                <div className="relative rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, borderRadius: 14.5 }}>
                  <button
                    type="button"
                    onClick={() => setPendingOpen((v) => !v)}
                    aria-expanded={pendingOpen}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
                    style={{ borderBottom: pendingOpen ? `1px solid ${t.hairline}` : 'none' }}
                    data-testid="button-toggle-pending"
                  >
                    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.neutralWash }}>
                      <History style={{ color: t.faint, width: 18, height: 18 }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold" style={{ color: t.ink }} data-testid="text-pending-verdict">
                        Pending
                        <span className="ml-2 font-normal" style={{ color: t.subink }}>not certified yet</span>
                      </div>
                      <div className="text-[12px] mt-0.5 truncate" style={{ color: t.subink }}>
                        Upload an art file and the measured checks run right here — pass them and this template is certified.
                      </div>
                    </div>
                    <ChevronDown
                      className="w-4 h-4 flex-shrink-0 transition-transform"
                      style={{ color: t.faint, transform: pendingOpen ? 'rotate(180deg)' : 'none' }}
                      aria-hidden
                    />
                  </button>
                  {pendingOpen && (
                    <div className="px-5">
                      {/* Rows align under the banner title, same as the results card */}
                      <div style={{ marginLeft: 48 }} className="py-3 text-[12.5px]">
                        <span style={{ color: t.faint }}>No art files tested yet.</span>
                      </div>
                      <div className="flex items-center justify-end py-3 text-[12px]">
                        <button
                          type="button"
                          onClick={() => artInput.current?.click()}
                          className={cn('font-medium transition-colors', t.hoverInk)}
                          style={{ color: t.subink }}
                          data-testid="button-upload-art-pending"
                        >
                          Choose an art file
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>
              </div>
            )}

            {/* Results — moved up under the heading so the verdict never
                gets lost below the fold (Bill, Aug 16 2026). Collapsible as before. */}
            {art && (
              <div className="mb-4" key={art.name}>
                {/* Arrival = settle + one soft ring pulse in the verdict color —
                    draws the eye once, then goes quiet (Bill, Aug 16 2026). */}
                <div
                  // Remount on completion replays settle + ring in the verdict
                  // color — the gentle Apple-like "it's done" cue that replaced
                  // the auto-fold (gogoods, Aug 16 2026).
                  key={donePulse}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    backgroundColor: t.card,
                    border: `1px solid ${t.hairline}`,
                    ['--gt-verdict-glow' as string]: inkPending
                      ? 'rgba(120,120,128,0.25)'
                      : allPass
                        ? 'rgba(48,164,108,0.35)'
                        : measured.some((c) => c.tone === 'fail')
                          ? 'rgba(229,72,77,0.35)'
                          : 'rgba(120,120,128,0.25)',
                    animation: 'gt-verdict-arrive 0.45s cubic-bezier(0.22,1,0.36,1) both, gt-verdict-ring 1.1s ease-out 0.45s 1',
                  }}
                >
                  {/* Banner = the verdict. Click to fold/unfold the detail rows —
                      folded by default on a clean pass, open on anything else. */}
                  <button
                    type="button"
                    onClick={() => setChecksOpen((v) => !v)}
                    aria-expanded={checksOpen}
                    className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
                    style={{ borderBottom: checksOpen ? `1px solid ${t.hairline}` : 'none' }}
                    data-testid="button-toggle-checks"
                  >
                    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: !inkPending && allPass ? t.readyWash : !inkPending && measured.some((c) => c.tone === 'fail') ? t.critWash : t.neutralWash }}>
                      {inkPending
                        ? <History style={{ color: t.faint, width: 18, height: 18 }} />
                        : allPass
                          ? <CheckCircle2 className="w-4.5 h-4.5" style={{ color: t.ready, width: 18, height: 18 }} />
                          : measured.some((c) => c.tone === 'fail')
                            ? <XCircle style={{ color: t.crit, width: 18, height: 18 }} />
                            : <MinusCircle style={{ color: t.faint, width: 18, height: 18 }} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold" style={{ color: t.ink }} data-testid="text-verdict">
                        {inkPending
                          ? (inkProgress !== null && inkProgress < 1
                              ? `Uploading art for ink & resolution check… ${Math.round(inkProgress * 100)}%`
                              : 'Measuring ink & resolution…')
                          : inkFailed ? (inkErrorMsg ?? 'Measurement didn’t finish — re-run the ink & resolution check')
                          : allPass ? 'Pass! All measured checks passed' : measured.some((c) => c.tone === 'fail') ? 'Fail! Measured checks flag issues' : 'Visual only — nothing to measure'}
                        <span className="ml-2 font-normal" style={{ color: t.subink }}>
                          {!inkPending && measured.length > 0 ? `${measured.filter((c) => c.tone === 'pass').length} of ${measured.length} passed` : ''}
                        </span>
                      </div>
                      <div className="text-[12px] mt-0.5 truncate" style={{ color: t.subink }}>{art.name}</div>
                      {/* Thin live progress: definite width while the art file
                          streams up, gentle pulse once the server is measuring
                          (gogoods, Aug 16 2026 — the room waits and watches). */}
                      {inkPending && (
                        <div className="mt-2 h-[3px] w-full max-w-[420px] rounded-full overflow-hidden" style={{ backgroundColor: t.neutralWash }} data-testid="bar-ink-progress">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.round((inkProgress ?? 1) * 100)}%`,
                              backgroundColor: t.blue,
                              transition: 'width 0.3s ease',
                              ...(inkProgress === null || inkProgress >= 1 ? { animation: 'gt-ink-pulse 1.2s ease-in-out infinite' } : {}),
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <ChevronDown
                      className="w-4 h-4 flex-shrink-0 transition-transform"
                      style={{ color: t.faint, transform: checksOpen ? 'rotate(180deg)' : 'none' }}
                      aria-hidden
                    />
                  </button>
                  {checksOpen && (
                  <div className="px-5">
                    {/* Rows align under the banner's title, not its icon (36px circle + 12px gap) */}
                    <div style={{ marginLeft: 48 }}>
                      {checks.map((row) => <CheckLine key={row.param} row={row} t={t} />)}
                    </div>
                    <div className="flex items-center justify-end gap-4 py-3 text-[12px]">
                      {inkFailed && (
                        <button
                          type="button"
                          onClick={retryInkInspect}
                          disabled={busy !== null}
                          className="font-semibold transition-opacity disabled:opacity-60"
                          style={{ color: t.blue }}
                          data-testid="button-retry-ink-inspect"
                        >
                          Re-run measurement
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => artInput.current?.click()}
                        className={cn('font-medium transition-colors', t.hoverInk)}
                        style={{ color: t.subink }}
                        data-testid="button-upload-art-again"
                      >
                        Try another file
                      </button>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            )}
            {/* Preview card — accept actions live in the card header now (Bill, Aug 14 2026) */}
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
              <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                <div className="min-w-0">
                  {editingName ? (
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => {
                        const v = nameDraft.trim();
                        if (v && v !== template.name) { setTemplate((prev) => (prev ? { ...prev, name: v } : prev)); setDirty(true); }
                        setEditingName(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                      className="w-full max-w-[520px] text-[16px] font-semibold rounded-lg px-2 py-0.5 focus:outline-none"
                      style={{ color: t.ink, backgroundColor: t.soft, border: `1px solid ${t.blue}` }}
                      data-testid="input-rename-template"
                    />
                  ) : (
                    <div className="group flex items-center gap-1.5 min-w-0">
                      <div className="text-[18px] font-semibold truncate" style={{ color: t.ink, letterSpacing: '-0.01em' }} title={template.name}>{template.name}</div>
                      {/* Status rides with the name — same truth as the tile on
                          the previous screen (Bill, Aug 15 2026) */}
                      {savedMeta ? (
                        <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold ml-1.5" style={{ color: t.ready }} data-testid="chip-template-status">
                          <BadgeCheck style={{ width: 14, height: 14 }} />
                          Certified
                          <span className="font-normal" style={{ color: t.faint }}>{savedMeta.certified}</span>
                        </span>
                      ) : (
                        <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium ml-1.5" style={{ color: t.faint }} data-testid="chip-template-status">
                          <History style={{ width: 13, height: 13 }} />
                          Not tested
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => { setNameDraft(template.name); setEditingName(true); }}
                        aria-label="Rename template"
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: t.subink }}
                        data-testid="button-rename-template"
                      >
                        <Pencil style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  )}
                  {originalName && template.name !== originalName && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: t.faint }} title={originalName} data-testid="text-original-name">
                      Originally {originalName}
                    </div>
                  )}
                  {/* Capped + ellipsized — the fine print never runs the card's
                      full width (Bill, Aug 16 2026). Full text on hover. */}
                  <div
                    className="text-[12px] mt-0.5 truncate"
                    style={{ color: t.subink, maxWidth: 520 }}
                    title={`${template.wMm.toFixed(2)} × ${template.hMm.toFixed(2)} mm · ${template.layers.length} GT layers read${uploadedAt ? ` · uploaded ${uploadedAt} by you` : ''}${art ? ` · art: ${art.name}` : ''}`}
                  >
                    {template.wMm.toFixed(2)} × {template.hMm.toFixed(2)} mm · {template.layers.length} GT layers read
                    {uploadedAt ? ` · uploaded ${uploadedAt} by you` : ''}
                    {art ? ` · art: ${art.name}` : ''}
                  </div>
                  {testLog.length > 0 && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: t.faint }} data-testid="text-test-trail">
                      Saved results: {testLog.map((e) => `${e.art} — ${e.verdict} · ${e.at}`).join('  ·  ')}
                    </div>
                  )}
                  {/* Where the previous test stood — so a returning operator knows
                      without opening the ••• trail (Bill, Aug 15 2026) */}
                  {savedMeta && savedMeta.lastTest && testLog.length === 0 && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: t.faint }} data-testid="text-last-test">
                      Last test: {savedMeta.lastTest} — full trail under •••
                    </div>
                  )}
                </div>
                {/* Tight right-hand group — apple-canon spacing (Bill, Aug 14 2026) */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {busy === 'art' ? (
                    <ThinProgress label="Reading art" t={t} testid="progress-reading-art" />
                  ) : (
                    <>
                      {/* Cancel only when there's unsaved work to walk away from
                          (Bill, Aug 16 2026) — opening a template clean shows no Cancel. */}
                      {dirty && (
                        <button
                          type="button"
                          onClick={onExit}
                          disabled={busy !== null}
                          className={cn('h-8 px-2.5 rounded-full text-[12.5px] font-medium transition-colors disabled:opacity-60', t.hoverWash)}
                          style={{ color: t.subink }}
                          data-testid="button-cancel-template"
                        >
                          Cancel
                        </button>
                      )}
                      {/* Clean template = quiet Close; unsaved work = filled-blue Save
                          (Bill, Aug 16 2026). Nothing autosaves; Save stays the one act
                          that persists. */}
                      <button
                        type="button"
                        onClick={() => { if (dirty && canEdit) void saveAndExit(); else onExit(); }}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors disabled:opacity-60"
                        style={dirty && canEdit
                          ? { backgroundColor: t.blue, color: '#fff' }
                          : { backgroundColor: 'transparent', color: t.subink, border: `1px solid ${t.hairline}` }}
                        data-testid="button-accept-save"
                      >
                        {busy === 'save' ? 'Saving…' : dirty && canEdit ? 'Save' : 'Close'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* View chips — Full Template / Back / Front / Spine (moved up, Bill Aug 14 2026) */}
              <div className="flex flex-wrap items-center gap-2 px-6 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                <div className="inline-flex items-center rounded-full p-0.5" style={{ backgroundColor: t.soft }} role="group" aria-label="Preview view" data-testid="chip-view-area">
                  {([
                    ['full', 'Full Template'],
                    ['Back Cover', 'Back'],
                    ['Front Cover', 'Front'],
                    ['Spine', 'Spine'],
                  ] as const)
                    .filter(([v]) => v === 'full' || zones.some((z) => z.zone === v && (z.line || z.area)))
                    .map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => pickView(v)}
                        className="h-8 px-4 rounded-full text-[13px] font-semibold transition-colors"
                        style={{
                          backgroundColor: viewArea === v ? t.card : 'transparent',
                          color: viewArea === v ? t.ink : t.subink,
                          boxShadow: viewArea === v ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
                        }}
                        data-testid={`chip-area-${label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {label}
                      </button>
                    ))}
                </div>
                {/* Working controls moved down beside the view chips — layers,
                    Test & Certify, and ••• live where the work happens
                    (Bill, Aug 16 2026 — matches the live build). */}
                <div className="ml-auto flex items-center gap-2">
                  {/* Pop-open layer table — anchored popover on the icon (Bill, Aug 14 2026) */}
                  <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLayers(true)}
                    title="Layers read from the file"
                    aria-label="Layers read from the file"
                    className="w-7 h-7 rounded-full inline-flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ border: `1.5px solid ${t.hairline}`, color: t.subink, backgroundColor: 'transparent' }}
                    data-testid="button-show-layers"
                  >
                    <NavLayers style={{ width: 14, height: 14 }} />
                  </button>
                {showLayers && (
                  <>
                    {/* Anchored popover, no dimming — click anywhere else to dismiss (Bill, Aug 14 2026) */}
                    <div className="fixed inset-0 z-[70]" onClick={() => setShowLayers(false)} data-testid="modal-layers-backdrop" />
                    <div
                      className="absolute z-[71] rounded-2xl overflow-hidden shadow-2xl w-full"
                      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, maxWidth: 420, top: 'calc(100% + 8px)', right: 0 }}
                      role="dialog"
                      aria-label="Layers read from the file"
                      data-testid="modal-layers"
                    >
                      <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                        <div>
                          <div className="text-[15px] font-semibold" style={{ color: t.ink }}>Layers read from the file</div>
                          <div className="text-[13px] mt-0.5" style={{ color: t.subink }}>Exact mm, straight from Illustrator</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowLayers(false)}
                          aria-label="Close"
                          className="w-7 h-7 rounded-full inline-flex items-center justify-center flex-shrink-0"
                          style={{ border: `1px solid ${t.hairline}`, color: t.subink }}
                          data-testid="button-close-layers"
                        >
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                      <div className="px-5 py-2 max-h-[420px] overflow-y-auto">
                        {zones.map(({ zone, line, area }) => {
                          const box = line ?? area;
                          if (!box) return null;
                          return (
                            <div key={zone} className="flex items-baseline justify-between gap-3 py-2.5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                              <span className="text-[14px] font-semibold flex items-center gap-2" style={{ color: t.ink }}>
                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor(zone) }} />
                                {zone}
                                <span className="text-[11px] font-semibold" style={{ color: t.faint }}>
                                  {line && area ? 'LINE + AREA' : line ? 'LINE' : 'AREA'}
                                </span>
                              </span>
                              <span className="text-[13.5px] font-medium tabular-nums flex-shrink-0" style={{ color: t.ink }}>
                                {box.wMm.toFixed(2)} × {box.hMm.toFixed(2)} mm
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                  </div>
                  {/* Once a test is underway, "Test" gives way to
                          "Save result & test another" — a trail staff can revisit (Bill, Aug 14 2026) */}
                      {art && (
                        <button
                          type="button"
                          onClick={saveResultAndTestAnother}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-opacity disabled:opacity-60"
                          style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
                          data-testid="button-save-result-test-another"
                        >
                          <ShieldCheck style={{ width: 14, height: 14, color: t.blue }} />
                          Save result &amp; test another
                        </button>
                      )}
                      {!art && (
                        // Not yet certified? The button is the next move — it pulses a
                        // gradated amber fill on the Pending banner's own 3.6s rhythm;
                        // blue stays reserved for the one filled action (Bill, Aug 16 2026).
                        <button
                          type="button"
                          onClick={() => artInput.current?.click()}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-opacity disabled:opacity-60"
                          style={{
                            backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}`,
                            animation: !savedMeta && busy === null ? 'gt-pending-fill 3.6s ease-in-out infinite' : undefined,
                          }}
                          data-testid="button-upload-art"
                        >
                          <ShieldCheck style={{ width: 14, height: 14, color: t.blue }} />
                          Test &amp; Certify
                        </button>
                      )}
                      {/* ••• under Save — history & tests live here; Replace supersedes
                          in place so the template keeps one tile forever (Bill, Aug 15 2026). */}
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setHeaderMenu((v) => !v)}
                          aria-label="More actions"
                          aria-expanded={headerMenu}
                          className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors"
                          style={{ border: `1px solid ${t.hairline}`, color: t.subink }}
                          data-testid="button-template-overflow"
                        >
                          <span aria-hidden="true" style={{ letterSpacing: 1, fontWeight: 700, fontSize: 13, lineHeight: 1 }}>•••</span>
                        </button>
                        {headerMenu && (
                          <>
                            <div className="fixed inset-0 z-[70]" onClick={() => setHeaderMenu(false)} />
                            <div
                              className="absolute z-[71] rounded-xl overflow-hidden shadow-2xl py-1"
                              style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, top: 'calc(100% + 6px)', right: 0, minWidth: 220 }}
                              role="menu"
                              data-testid="menu-template-overflow"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setHeaderMenu(false); setShowTests(true); }}
                                className={cn('w-full text-left px-4 py-2 text-[13px] font-medium transition-colors flex items-center gap-2.5', t.hoverWash)}
                                style={{ color: t.ink }}
                                data-testid="menuitem-history-tests"
                              >
                                <History style={{ width: 14, height: 14, color: t.subink }} />
                                History &amp; tests
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={replaceTemplate}
                                  className={cn('w-full text-left px-4 py-2 text-[13px] font-medium transition-colors flex items-center gap-2.5', t.hoverWash)}
                                  style={{ color: t.ink }}
                                  data-testid="menuitem-replace-template"
                                >
                                  <Upload style={{ width: 14, height: 14, color: t.subink }} />
                                  Replace template&hellip;
                                </button>
                              )}
                              <div className="px-4 pb-2 pt-1 text-[11px] leading-snug" style={{ color: t.faint, maxWidth: 230 }}>
                                Replacing supersedes this revision — it moves into history with its tests. One tile, always.
                              </div>
                            </div>
                          </>
                        )}
                        {showTests && (
                          <>
                            <div className="fixed inset-0 z-[70]" onClick={() => setShowTests(false)} />
                            <div
                              className="absolute z-[71] rounded-2xl overflow-hidden shadow-2xl"
                              style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, top: 'calc(100% + 6px)', right: 0, width: 380 }}
                              role="dialog"
                              aria-label="History and tests"
                              data-testid="panel-history-tests"
                            >
                              <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                                <div>
                                  <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>History &amp; tests</div>
                                  <div className="text-[12px] mt-0.5" style={{ color: t.subink }}>Every revision of this template, tests attached</div>
                                </div>
                                <button type="button" onClick={() => setShowTests(false)} aria-label="Close" className="w-7 h-7 rounded-full inline-flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${t.hairline}`, color: t.subink }} data-testid="button-close-history">
                                  <X style={{ width: 14, height: 14 }} />
                                </button>
                              </div>
                              <div className="px-5 py-3 max-h-[420px] overflow-y-auto">
                                {[{ name: template.name, wMm: template.wMm, hMm: template.hMm, at: uploadedAt ?? '', tests: [...priorTests, ...testLog], current: true }, ...revisions.map((r) => ({ ...r, current: false }))].map((rev, ri) => (
                                  <div key={ri} className="py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                                    <div className="flex items-baseline justify-between gap-3">
                                      <span className="text-[12.5px] font-semibold truncate" style={{ color: t.ink }} title={rev.name}>{rev.name}</span>
                                      <span className="text-[11px] font-semibold flex-shrink-0 inline-flex items-center gap-1" style={{ color: rev.current ? t.ready : t.faint }}>
                                        {rev.current ? <><BadgeCheck style={{ width: 12, height: 12 }} /> Current</> : <><History style={{ width: 12, height: 12 }} /> Superseded</>}
                                      </span>
                                    </div>
                                    <div className="text-[11.5px] mt-0.5 tabular-nums" style={{ color: t.subink }}>
                                      {rev.wMm > 0 ? `${rev.wMm.toFixed(1)} × ${rev.hMm.toFixed(1)} mm` : ''}{rev.at ? `${rev.wMm > 0 ? ' · ' : ''}uploaded ${rev.at}` : ''}
                                    </div>
                                    {rev.tests.length === 0 ? (
                                      <div className="text-[11.5px] mt-1.5" style={{ color: t.faint }}>No art files tested</div>
                                    ) : rev.tests.map((e, ei) => (
                                      <div key={ei} className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: t.subink }}>
                                        {e.verdict === 'Pass' ? <CheckCircle2 style={{ width: 12, height: 12, color: t.ready, flexShrink: 0 }} /> : e.verdict === 'Flagged' ? <XCircle style={{ width: 12, height: 12, color: t.crit, flexShrink: 0 }} /> : <MinusCircle style={{ width: 12, height: 12, color: t.faint, flexShrink: 0 }} />}
                                        <span className="truncate" title={e.art}>{e.art}</span>
                                        <span className="flex-shrink-0" style={{ color: t.faint }}>— {e.verdict}{e.at ? ` · ${e.at}` : ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                </div>
              </div>

              {/* The composite: template raster · art · GT overlays */}
              <div className="p-6">
                {/* Zone toggles (consolidated) + magnifier — swapped down here, Bill Aug 14 2026 */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Template underlay — off by default during a test; art opacity
                        lives in its dropdown, not the header (Bill, Aug 14 2026) */}
                    {art && (
                      <div className="relative flex-shrink-0">
                        <span
                          className="inline-flex items-center h-6 rounded-full overflow-hidden transition-colors"
                          style={{
                            border: `1px solid ${showTemplate ? t.subink : t.hairline}`,
                            backgroundColor: showTemplate ? t.soft : 'transparent',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setShowTemplate((v) => {
                              const on = !v;
                              if (on) {
                                setArtOpacity(1); // template arrives at full strength
                                if (!templateHintShown.current) {
                                  templateHintShown.current = true;
                                  setTemplatePanelOpen(true); // hint once: the slider lives here
                                }
                              }
                              return on;
                            })}
                            className="inline-flex items-center gap-1.5 h-full pl-2.5 pr-1.5 text-[11px] font-medium"
                            style={{ color: showTemplate ? t.ink : t.faint }}
                            data-testid="chip-template-underlay"
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: showTemplate ? t.subink : t.faint }} />
                            Template
                            <span style={{ color: t.faint }}>{showTemplate ? 'on' : 'off'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setTemplatePanelOpen((v) => !v)}
                            aria-label="Template display options"
                            aria-expanded={templatePanelOpen}
                            className="h-full pr-2 pl-0.5 inline-flex items-center"
                            style={{ color: t.faint }}
                            data-testid="button-template-options"
                          >
                            <ChevronDown style={{ width: 12, height: 12, transform: templatePanelOpen ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
                          </button>
                        </span>
                        {templatePanelOpen && (
                          <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setTemplatePanelOpen(false)} />
                            <div
                              className="absolute z-[61] rounded-xl shadow-2xl px-4 py-3"
                              style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, top: 'calc(100% + 6px)', left: 0, width: 210 }}
                              role="dialog"
                              aria-label="Template display options"
                              data-testid="popover-template-options"
                            >
                              {/* Apple-style slider: thin hairline track, plain white thumb */}
                              <style>{`
                                .gt-slider { -webkit-appearance: none; appearance: none; height: 20px; background: transparent; cursor: pointer; }
                                .gt-slider::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: ${t.hairline}; }
                                .gt-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 0.5px solid rgba(0,0,0,0.18); box-shadow: 0 1px 4px rgba(0,0,0,0.35); margin-top: -6.5px; }
                                .gt-slider::-moz-range-track { height: 3px; border-radius: 2px; background: ${t.hairline}; }
                                .gt-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 0.5px solid rgba(0,0,0,0.18); box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
                              `}</style>
                              <label className="block text-[11px] font-semibold" style={{ color: t.subink }}>
                                Art opacity
                                <input
                                  type="range" min={0} max={100} value={Math.round(artOpacity * 100)}
                                  onChange={(e) => setArtOpacity(Number(e.target.value) / 100)}
                                  className="gt-slider block w-full mt-2"
                                  data-testid="slider-art-opacity"
                                />
                              </label>
                              <div className="mt-1.5 text-[10.5px]" style={{ color: t.faint }}>
                                Lower it to see the template through your art.
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {zones.filter((z) => !['Front Cover', 'Front Safety', 'Back Cover', 'Back Safety'].includes(z.zone) && !z.zone.startsWith('Foil Stamping') && zoneRelevant(z.zone)).map(({ zone }) => {
                      const on = activeZones.has(zone);
                      const c = zoneColor(zone);
                      return (
                        <button
                          key={zone}
                          type="button"
                          onClick={() => toggleZone(zone)}
                          className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors"
                          style={{
                            border: `1px solid ${on ? c : t.hairline}`,
                            color: on ? t.ink : t.faint,
                            backgroundColor: on ? `${c}1f` : 'transparent',
                          }}
                          data-testid={`chip-zone-${zone.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: on ? c : t.faint }} />
                          {zone}
                          <span style={{ color: t.faint }}>{on ? 'on' : 'off'}</span>
                        </button>
                      );
                    })}
                    {/* Front / Back — Cover + Safety consolidated behind a dropdown */}
                    {(['Front', 'Back'] as const).map((side) => {
                      if (!zoneRelevant(`${side} Cover`)) return null;
                      const parts = [`${side} Cover`, `${side} Safety`, `Foil Stamping ${side}`].filter((p) => zones.some((z) => z.zone === p));
                      if (parts.length === 0) return null;
                      const partLabel = (p: string) => (p.startsWith('Foil') ? 'Foil' : p.split(' ')[1]);
                      const onParts = parts.filter((p) => activeZones.has(p));
                      const anyOn = onParts.length > 0;
                      const c = zoneColor(`${side} Cover`);
                      const status = anyOn ? onParts.map(partLabel).join(' + ') : 'off';
                      return (
                        <div key={side} className="relative">
                          <div
                            className="inline-flex items-center h-6 rounded-full overflow-hidden"
                            style={{
                              border: `1px solid ${anyOn ? c : t.hairline}`,
                              backgroundColor: anyOn ? `${c}1f` : 'transparent',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveZones((prev) => {
                                  const next = new Set(prev);
                                  if (onParts.length > 0) parts.forEach((p) => next.delete(p));
                                  else parts.forEach((p) => next.add(p));
                                  return next;
                                });
                              }}
                              className="inline-flex items-center gap-1.5 h-full pl-2.5 pr-1.5 text-[11px] font-medium"
                              style={{ color: anyOn ? t.ink : t.faint }}
                              data-testid={`chip-zone-${side.toLowerCase()}`}
                            >
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: anyOn ? c : t.faint }} />
                              {side}
                              <span style={{ color: t.faint }}>{status}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenGroup((g) => (g === side ? null : side))}
                              aria-label={`${side} options`}
                              className="h-full pl-1 pr-2 inline-flex items-center"
                              style={{ color: t.subink, borderLeft: `1px solid ${anyOn ? `${c}55` : t.hairline}` }}
                              data-testid={`chip-zone-${side.toLowerCase()}-menu`}
                            >
                              <NavChevron style={{ width: 13, height: 13 }} />
                            </button>
                          </div>
                          {openGroup === side && (
                            <>
                              <div className="fixed inset-0 z-[65]" onClick={() => setOpenGroup(null)} />
                              <div
                                className="absolute z-[66] mt-1.5 rounded-xl overflow-hidden shadow-xl"
                                style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 148 }}
                                data-testid={`menu-zone-${side.toLowerCase()}`}
                              >
                                {parts.map((p) => {
                                  const on = activeZones.has(p);
                                  return (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => toggleZone(p)}
                                      className="w-full flex items-center justify-between gap-3 px-3.5 py-2 text-[12px] font-medium text-left"
                                      style={{ color: t.ink }}
                                      data-testid={`menu-zone-${p.toLowerCase().replace(/\s+/g, '-')}`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: on ? zoneColor(p) : t.faint }} />
                                        {partLabel(p)}
                                      </span>
                                      <span style={{ color: on ? t.blue : t.faint }}>{on ? 'on' : 'off'}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Line/Area — lives with the overlay toggles now (Bill, Aug 14 2026) */}
                  <div
                    className="inline-flex items-center rounded-full p-0.5"
                    style={{ backgroundColor: t.soft }}
                    role="group"
                    aria-label="Overlay view"
                    data-testid="chip-view-mode"
                  >
                    {(['line', 'area'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setViewMode(m)}
                        className="h-6 px-2.5 rounded-full text-[11px] font-semibold transition-colors"
                        style={{
                          backgroundColor: viewMode === m ? t.card : 'transparent',
                          color: viewMode === m ? t.ink : t.subink,
                          boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,0.18)' : 'none',
                        }}
                        data-testid={`chip-view-${m}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {m === 'line'
                            ? <PenLine style={{ width: 12, height: 12 }} />
                            : <PaintBucket style={{ width: 12, height: 12 }} />}
                          {m === 'line' ? 'Line' : 'Area'}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* Zoom stepper — out as well as in (Bill, Aug 14 2026) */}
                  <div
                    className="inline-flex items-center h-6 rounded-full overflow-hidden"
                    style={{ border: `1px solid ${zoom !== 1 ? t.blue : t.hairline}` }}
                    data-testid="control-zoom"
                  >
                    <button
                      type="button"
                      onClick={() => stepZoom(-1)}
                      disabled={zoom <= ZOOMS[0]}
                      aria-label="Zoom out"
                      className="h-full px-2 text-[13px] font-semibold disabled:opacity-40"
                      style={{ color: t.subink }}
                      data-testid="button-zoom-out"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => { setZoom(1); setPanC(null); }}
                      disabled={zoom === 1}
                      title="Reset to 100%"
                      aria-label="Reset zoom to 100%"
                      className="inline-flex items-center gap-1 px-1 h-full text-[11px] font-semibold tabular-nums"
                      style={{ color: zoom !== 1 ? t.blue : t.subink, minWidth: 52, justifyContent: 'center', cursor: zoom !== 1 ? 'pointer' : 'default' }}
                      data-testid="text-zoom-level"
                    >
                      <ZoomIn style={{ width: 12, height: 12 }} />
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => stepZoom(1)}
                      disabled={zoom >= ZOOMS[ZOOMS.length - 1]}
                      aria-label="Zoom in"
                      className="h-full px-2 text-[13px] font-semibold disabled:opacity-40"
                      style={{ color: t.subink }}
                      data-testid="button-zoom-in"
                    >
                      +
                    </button>
                  </div>
                  </div>
                </div>
                <div className="flex justify-center">
                <div
                  className="relative overflow-hidden rounded-lg"
                  style={{
                    width: `${viewportPct.toFixed(3)}%`,
                    minWidth: 96,
                    aspectRatio: focus ? `${focus.w} / ${focus.h}` : `${template.wMm} / ${template.hMm}`,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${t.hairline}`,
                    cursor: zoom !== 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
                    touchAction: zoom !== 1 ? 'none' : 'auto',
                  }}
                  data-testid="preview-composite"
                  onPointerDown={(e) => {
                    if (zoom === 1 || !template || !focus) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const cx = panC ? panC.x : (focus.x + focus.w / 2) / template.wMm;
                    const cy = panC ? panC.y : (focus.y + focus.h / 2) / template.hMm;
                    dragRef.current = { px: e.clientX, py: e.clientY, cx, cy, w: rect.width, h: rect.height };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d) return;
                    setPanC({
                      x: d.cx - (e.clientX - d.px) / d.w / viewT.s,
                      // World height = viewport width × template aspect (the
                      // world keeps the full template's shape).
                      y: d.cy - (e.clientY - d.py) / (d.w * (template.hMm / template.wMm)) / viewT.s,
                    });
                  }}
                  onPointerUp={() => { dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                >
                 <div
                  className="absolute top-0 left-0 w-full"
                  style={{
                    aspectRatio: `${template.wMm} / ${template.hMm}`,
                    transform: `translate(${(viewT.tx * 100).toFixed(3)}%, ${(viewT.ty * 100).toFixed(3)}%) scale(${viewT.s.toFixed(4)})`,
                    transformOrigin: '0 0',
                  }}
                 >
                  {(!art || showTemplate) && (
                    <img src={template.img} alt="Template" className="absolute inset-0 w-full h-full" draggable={false} />
                  )}
                  {art && artRect && art.img && (
                    <img
                      src={art.img}
                      alt="Art"
                      draggable={false}
                      className="absolute"
                      style={{
                        left: pct(artRect.xMm, template.wMm),
                        top: pct(artRect.yMm, template.hMm),
                        width: pct(artRect.wMm, template.wMm),
                        height: pct(artRect.hMm, template.hMm),
                        opacity: artOpacity,
                      }}
                      data-testid="img-art-overlay"
                    />
                  )}
                  {/* GT overlays — drawn from the template's own measured layers */}
                  {zones.filter((z) => activeZones.has(z.zone) && zoneRelevant(z.zone)).map(({ zone, line, area }) => {
                    // View chip: Line = the drawn LINE layer; Area = the AREA layer (with wash).
                    const box = viewMode === 'line' ? (line ?? area) : (area ?? line);
                    if (!box) return null;
                    const c = zoneColor(zone);
                    // Area shading alpha: dark canvas uses 0x30 (~19%) and light
                    // canvas uses 0x40 (~25%) — both are ~3x the previous 0x14
                    // (~8%) so on/off state is unmistakable at a glance while
                    // underlying template linework remains readable through the wash.
                    const areaAlpha = dark ? '30' : '40';
                    return (
                      <div key={zone}>
                        {viewMode === 'area' && area && (
                          area.inWMm ? (
                            // Frame layer — wash only the band between outer edge and inner hole
                            <svg
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              viewBox={`0 0 ${template.wMm} ${template.hMm}`}
                              preserveAspectRatio="none"
                            >
                              <path
                                d={`${shapePath(area.xMm, area.yMm, area.wMm, area.hMm, area.round)} ${shapePath(area.inXMm!, area.inYMm!, area.inWMm!, area.inHMm!, area.round)}`}
                                fill={`${c}${areaAlpha}`}
                                fillRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                left: pct(area.xMm, template.wMm), top: pct(area.yMm, template.hMm),
                                width: pct(area.wMm, template.wMm), height: pct(area.hMm, template.hMm),
                                backgroundColor: `${c}${areaAlpha}`,
                                borderRadius: area.round ? '50%' : undefined,
                              }}
                            />
                          )
                        )}
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            left: pct(box.xMm, template.wMm), top: pct(box.yMm, template.hMm),
                            width: pct(box.wMm, template.wMm), height: pct(box.hMm, template.hMm),
                            border: `1.5px ${zone === 'Bleed' || zone.includes('Safety') ? 'dashed' : 'solid'} ${c}`,
                            boxSizing: 'border-box',
                            borderRadius: box.round ? '50%' : undefined,
                          }}
                          data-testid={`overlay-${zone.toLowerCase().replace(/\s+/g, '-')}`}
                        />
                        <span
                          className="absolute pointer-events-none text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            left: pct(box.xMm, template.wMm), top: `calc(${pct(box.yMm, template.hMm)} - 18px)`,
                            backgroundColor: c, color: '#fff', whiteSpace: 'nowrap',
                          }}
                        >
                          {zone} · {box.wMm.toFixed(1)} × {box.hMm.toFixed(1)} mm
                        </span>
                      </div>
                    );
                  })}
                 </div>
                </div>
                </div>
              </div>
            </div>

            {/* No save-confirm dialog (Bill, Aug 15 2026): Save in the header
                saves and returns to Templates — one act, no congrats sheet. */}

            {/* Task #3065 consent, slot mode: the attach found a template that
                mentions several options (e.g. both center-hole sizes). Nothing
                is stamped unless the operator says yes. */}
            {detected && (
              <>
                <div className="fixed inset-0 z-[70]" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} />
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="detected-options-title"
                  className="fixed z-[71] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-6 pt-6 pb-5 text-center shadow-2xl"
                  style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, width: 340 }}
                  data-testid="dialog-detected-options"
                >
                  <div id="detected-options-title" className="text-[15px] font-semibold" style={{ color: t.ink }}>
                    One template, {detected.options.length} options?
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: t.subink }}>
                    This template mentions {detected.options.map((o) => o.label).join(' and ')}. Note that this one
                    file serves both? It stays a single file and a single tile.
                  </p>
                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void resolveDetected(true)}
                      disabled={busy === 'save'}
                      className="h-9 rounded-full text-[13px] font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: t.blue }}
                      data-testid="button-options-yes"
                    >
                      {busy === 'save' ? 'Saving…' : 'Yes, it covers both'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolveDetected(false)}
                      disabled={busy === 'save'}
                      className="h-9 rounded-full text-[13px] font-semibold disabled:opacity-60"
                      style={{ color: t.ink, border: `1px solid ${t.hairline}` }}
                      data-testid="button-options-no"
                    >
                      No, just this one
                    </button>
                  </div>
                </div>
              </>
            )}

          </div>
        )}

        <input ref={templateInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickTemplate} data-testid="input-template-pdf" />
        <input ref={artInput} type="file" accept="application/pdf,.pdf,image/png,image/jpeg,image/tiff,.tif,.tiff,image/vnd.adobe.photoshop,.psd" className="hidden" onChange={onPickArt} data-testid="input-art-file" />
    </div>
  );
}
