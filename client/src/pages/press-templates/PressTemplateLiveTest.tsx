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
} = { file: null, name: null, liveId: null, component: null, slot: null };

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
  CheckCircle2, XCircle, MinusCircle, FileText, ChevronRight, Upload, RotateCcw, ZoomIn, ShieldCheck, X, Pencil, PenLine, PaintBucket, ChevronDown, Info, History,
} from 'lucide-react';
import { saveLiveTestDraft, loadLiveTestDraft, clearLiveTestDraft, type LiveTestDraft } from './draftStore';
import { ChevronDown as NavChevron, Layers as NavLayers } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest, authHeaders } from '@/lib/queryClient';
import { uploadAdminDoc } from '@/lib/adminUpload';
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
    const layer: GtLayer = {
      name, zone, kind,
      xMm: b.minX * PT_TO_MM,
      yMm: (vp1.height - b.maxY) * PT_TO_MM, // flip to top-left origin
      wMm: (b.maxX - b.minX) * PT_TO_MM,
      hMm: (b.maxY - b.minY) * PT_TO_MM,
      round: b.curves > 0 && b.lines === 0,
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
  const [panC, setPanC] = useState<{ x: number; y: number } | null>(null); // view center as fraction of template
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number; w: number; h: number } | null>(null);
  // Bill, Aug 14 2026: layer table pops open over the page (icon right of Line/Area).
  const [showLayers, setShowLayers] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
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

  const onPickTemplate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    liveId.current = null; // a fresh file is a fresh shelf row
    await loadTemplate(f);
    // The draft snapshot must follow the replacement, or a crash would
    // resume the file that was just swapped out (review, Aug 15 2026).
    void saveLiveTestDraft({
      pressId,
      blob: f,
      fileName: f.name,
      name: null,
      component: componentPill.current,
      liveId: null,
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
      pendingTemplateFile.file = null; pendingTemplateFile.name = null; pendingTemplateFile.liveId = null; pendingTemplateFile.component = null; pendingTemplateFile.slot = null;
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
          // Bearer + cookie (cookie-only fetches 401 under #token-hash admin
          // logins — standing landmine on admin surfaces).
          const r = await fetch(`/api/press/${pressId}/templates/${specId}/file`, {
            headers: { ...authHeaders() },
            credentials: 'include',
            signal: ctrl.signal,
          });
          if (!r.ok) throw new Error(`Couldn't fetch the template file (${r.status})`);
          const blob = await r.blob();
          if (cancelled) return;
          const file = new File([blob], spec.templateFileName ?? 'template.pdf', { type: 'application/pdf' });
          await loadTemplate(file, spec.templateFileName ?? undefined);
        } catch (err) {
          if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
          setBusy(null);
          setError(err instanceof Error ? err.message : 'Could not load that template.');
        }
      })();
      return () => { cancelled = true; ctrl.abort(); };
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
    setArriving(true);
    try {
      const file = new File([d.blob], d.fileName, { type: 'application/pdf' });
      await loadTemplate(file, d.name ?? undefined);
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
    setBusy('art'); setError(null);
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        const doc = await (await loadPdfjs()).getDocument({ data: await f.arrayBuffer() }).promise;
        const { img, wMm, hMm } = await renderPage(doc, 1);
        const { layerNames } = await extractGtLayers(doc, 1);
        const gtNames = layerNames.filter((n) => n.trim().toUpperCase().startsWith('GT'));
        setArt({ name: f.name, img, wMm, hMm, pageCount: doc.numPages, gtLayerNames: gtNames });
        setShowTemplate(false);
      } else {
        // Raster image — visual overlay only; no physical size in the file.
        const img = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Could not read that image.'));
          reader.readAsDataURL(f);
        });
        setArt({ name: f.name, img, wMm: null, hMm: null, pageCount: null, gtLayerNames: [] });
        setShowTemplate(false);
      }
    } catch (err) {
      setArt(null);
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally { setBusy(null); }
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
    if (art.wMm === null || art.hMm === null) {
      rows.push({ param: 'Physical size', tone: 'na', detail: 'Raster image — no physical size in the file. Export a PDF for measured checks; overlay below is visual only.' });
    } else {
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
      ? { param: 'File hygiene', tone: art.wMm === null ? 'na' : 'pass', detail: art.wMm === null ? 'Layer check needs a PDF' : 'No GT template layers left inside the art file' }
      : { param: 'File hygiene', tone: 'fail', detail: `Template layers still present in the art file: ${art.gtLayerNames.join(', ')} — delete them before handoff` });
    rows.push({ param: 'Safety', tone: 'na', detail: 'Visual — toggle the Safety overlays and look' });
    rows.push({ param: 'Color & resolution', tone: 'na', detail: 'Ink + ppi inspection runs at prepress' });
    return rows;
  }, [template, art, bleedBox, cutBox]);

  const measured = checks.filter((c) => c.tone !== 'na');
  const allPass = measured.length > 0 && measured.every((c) => c.tone === 'pass');
  const verdictWord = allPass ? 'Pass' : measured.some((c) => c.tone === 'fail') ? 'Flagged' : 'Visual only';

  // Save the current art's result into the trail, then invite the next file.
  const saveResultAndTestAnother = () => {
    if (art) {
      const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setTestLog((log) => [...log, { art: art.name, at, verdict: verdictWord }]);
    }
    artInput.current?.click();
  };

  // Accept & Save — persist the template + its test trail on the server,
  // then return to the Templates page (which refetches the shelf).
  const saveAndExit = async () => {
    if (!template || !currentFile.current) { onExit(); return; }
    setBusy('save'); setError(null);
    try {
      const tests = art ? [...testLog, { art: art.name, at: '', verdict: verdictWord }] : testLog;
      const testsPayload = tests.map((e) => ({ artName: e.art, verdict: e.verdict }));
      const previewImg = await shrinkDataUrl(template.img);
      if (slotTarget.current) {
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
        // One file covering several options (e.g. both center-hole sizes):
        // stamp the note only with the operator's OK (Task #3065 consent kept)
        // — swap the confirm sheet to the options question and stop here.
        if (data.detectedOptions && data.detectedOptions.length >= 2) {
          setDetected({ specId: data.spec.id, options: data.detectedOptions });
          setBusy(null);
          return;
        }
      } else if (liveId.current) {
        await apiRequest('PATCH', `/api/press/${pressId}/templates/live/${liveId.current}`, {
          name: template.name,
          previewImg,
          wMm: template.wMm,
          hMm: template.hMm,
          layerCount: template.layers.length,
          tests: testsPayload,
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
      setConfirmSave(false);
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
    if (!template || !art || !anchor) return null;
    if (art.wMm === null || art.hMm === null) return anchor; // raster: fit to anchor
    // Orientation-aware: if rotated match, still center on anchor with real dims.
    const cx = anchor.xMm + anchor.wMm / 2;
    const cy = anchor.yMm + anchor.hMm / 2;
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
        <nav aria-label="breadcrumb" data-testid="breadcrumb-livetest">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" onClick={onExit} className={cn('transition-colors', t.hoverInk)}>Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>Live test</span></li>
          </ol>
        </nav>

        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Template. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Test.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 720 }}>
              Upload a press template with GT layers, then an art file. The overlays below are read
              straight from the template&rsquo;s own Illustrator layers — exact to the hundredth of a millimeter.
            </p>
          </div>
          {(template || art) && (
            <button
              type="button"
              onClick={() => { setTemplate(null); setArt(null); setError(null); liveId.current = null; }}
              className={cn('inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] font-medium flex-shrink-0 transition-colors', t.hoverWash)}
              style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
              data-testid="button-start-over"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start over
            </button>
          )}
        </div>

        {/* Step rail — quiet Apple-style text steps, no pills (Bill, Aug 14 2026) */}
        <div className="mt-6 flex items-center gap-2.5 text-[13px]" data-testid="step-rail">
          {(['Template', 'Art file', 'Results'] as const).map((label, i) => {
            const n = i + 1;
            const state = step > n ? 'done' : step === n ? 'now' : 'todo';
            return (
              <div key={label} className="flex items-center gap-2.5">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} />}
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{
                    color: state === 'now' ? t.ink : state === 'done' ? t.subink : t.faint,
                    fontWeight: state === 'now' ? 600 : 500,
                  }}
                >
                  {state === 'done' && <CheckCircle2 style={{ width: 14, height: 14, color: t.ready }} />}
                  {label}
                </span>
              </div>
            );
          })}
        </div>

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
              <p className="mt-1.5 text-[13px] mx-auto inline-flex items-center gap-1.5" style={{ color: t.subink }}>
                {resumeOffer.name ?? resumeOffer.slot?.title ?? resumeOffer.fileName} — kept as a draft on this computer.
                <span
                  className="inline-flex items-center justify-center cursor-help"
                  title="Your in-progress session is kept automatically on this computer. Nothing is saved to Templates until you press Save."
                  aria-label="About drafts"
                  data-testid="info-draft"
                >
                  <Info className="w-3.5 h-3.5" style={{ color: t.faint }} />
                </span>
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
                        if (v) setTemplate((prev) => (prev ? { ...prev, name: v } : prev));
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
                      <div className="text-[16px] font-semibold truncate" style={{ color: t.ink }} title={template.name}>{template.name}</div>
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
                  <div className="text-[12px] mt-0.5" style={{ color: t.subink }}>
                    {template.wMm.toFixed(2)} × {template.hMm.toFixed(2)} mm · {template.layers.length} GT layers read
                    {uploadedAt ? ` · uploaded ${uploadedAt} by you` : ''}
                    {art ? ` · art: ${art.name}` : ''}
                  </div>
                  {testLog.length > 0 && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: t.faint }} data-testid="text-test-trail">
                      Saved results: {testLog.map((e) => `${e.art} — ${e.verdict} · ${e.at}`).join('  ·  ')}
                    </div>
                  )}
                </div>
                {/* Tight right-hand group — apple-canon spacing (Bill, Aug 14 2026) */}
                <div className="flex items-center gap-2 flex-shrink-0">
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
                          <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Layers read from the file</div>
                          <div className="text-[12px] mt-0.5" style={{ color: t.subink }}>Exact mm, straight from Illustrator</div>
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
                            <div key={zone} className="flex items-baseline justify-between gap-3 py-2" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                              <span className="text-[12.5px] font-medium flex items-center gap-2" style={{ color: t.ink }}>
                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor(zone) }} />
                                {zone}
                                <span className="text-[10.5px] font-semibold" style={{ color: t.faint }}>
                                  {line && area ? 'LINE + AREA' : line ? 'LINE' : 'AREA'}
                                </span>
                              </span>
                              <span className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: t.subink }}>
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
                  {/* Accept actions — alongside the layers icon (Bill, Aug 14 2026) */}
                  {busy === 'art' ? (
                    <ThinProgress label="Reading art" t={t} testid="progress-reading-art" />
                  ) : (
                    <>
                      {/* Apple-way header (Otis + Bill, Aug 15 2026): nothing saves
                          automatically — Cancel leaves quietly, Test runs an art file,
                          Save is the only action that persists (the one filled blue). */}
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
                        <button
                          type="button"
                          onClick={() => artInput.current?.click()}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-opacity disabled:opacity-60"
                          style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
                          data-testid="button-upload-art"
                        >
                          <ShieldCheck style={{ width: 14, height: 14, color: t.blue }} />
                          Test
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setConfirmSave(true)}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-60"
                          style={{ backgroundColor: t.blue }}
                          data-testid="button-accept-save"
                        >
                          Save
                        </button>
                      )}
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
                  {art && artRect && (
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
                                fill={`${c}14`}
                                fillRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                left: pct(area.xMm, template.wMm), top: pct(area.yMm, template.hMm),
                                width: pct(area.wMm, template.wMm), height: pct(area.hMm, template.hMm),
                                backgroundColor: `${c}14`,
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

            {/* Results — full width, below the preview */}
            {art && (
              <div className="mt-4">
                <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
                  <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                    <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: allPass ? t.readyWash : measured.some((c) => c.tone === 'fail') ? t.critWash : t.neutralWash }}>
                      {allPass
                        ? <CheckCircle2 className="w-4.5 h-4.5" style={{ color: t.ready, width: 18, height: 18 }} />
                        : measured.some((c) => c.tone === 'fail')
                          ? <XCircle style={{ color: t.crit, width: 18, height: 18 }} />
                          : <MinusCircle style={{ color: t.faint, width: 18, height: 18 }} />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold" style={{ color: t.ink }} data-testid="text-verdict">
                        {allPass ? 'Measured checks pass' : measured.some((c) => c.tone === 'fail') ? 'Measured checks flag issues' : 'Visual only'}
                      </div>
                      <div className="text-[12px] mt-0.5 truncate" style={{ color: t.subink }}>{art.name}</div>
                    </div>
                  </div>
                  <div className="px-5">
                    {checks.map((row) => <CheckLine key={row.param} row={row} t={t} />)}
                    <div className="flex items-center justify-between py-3 text-[12px]">
                      <span style={{ color: t.subink }}>
                        {measured.filter((c) => c.tone === 'pass').length} of {measured.length} measured checks passed
                      </span>
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
                </div>
              </div>
            )}

            {/* Pop-over: layers read from the file */}
            {/* Save confirm — Apple-style alert (Bill, Aug 14 2026) */}
            {confirmSave && (
              <>
                <div className="fixed inset-0 z-[70]" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={() => { if (busy !== 'save') setConfirmSave(false); }} />
                <div
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="confirm-save-title"
                  className="fixed z-[71] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl px-6 pt-6 pb-5 text-center shadow-2xl"
                  style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, width: 340 }}
                  data-testid="dialog-confirm-save"
                >
                  {/* Copy knows where you are: mid-test = congrats, untested = a gentle nudge (Bill, Aug 14 2026) */}
                  <div id="confirm-save-title" className="text-[15px] font-semibold" style={{ color: t.ink }}>
                    {art ? 'Test saved' : 'Save this template?'}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: t.subink }}>
                    {art
                      ? 'Congrats — your test has been saved, and you can compare these results at any time. Your template is ready to go.'
                      : 'The GT layers are read and look good. Save it to your Templates page now, or go back and run an art test first.'}
                  </p>
                  <div className="mt-5 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => void saveAndExit()}
                      disabled={busy === 'save'}
                      className="h-9 rounded-full text-[13px] font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: t.blue }}
                      data-testid="button-save-exit"
                    >
                      {busy === 'save' ? 'Saving…' : art ? 'Back to Templates' : 'Save & exit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSave(false)}
                      disabled={busy === 'save'}
                      className="h-9 rounded-full text-[13px] font-semibold disabled:opacity-60"
                      style={{ color: t.ink, border: `1px solid ${t.hairline}` }}
                      data-testid="button-return-test"
                    >
                      {art ? 'Stay here' : 'Return & test'}
                    </button>
                  </div>
                </div>
              </>
            )}

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
        <input ref={artInput} type="file" accept="application/pdf,.pdf,image/png,image/jpeg" className="hidden" onChange={onPickArt} data-testid="input-art-file" />
    </div>
  );
}
