// PressTemplateLiveTest — LIVE end-to-end proof of the GT-layer canon.
// Step 1: upload a press template PDF with GT layers (Illustrator OCGs).
//         The browser reads every layer's exact mm geometry — no guessing.
// Step 2: upload an art file (PDF preferred; PNG/JPG visual-only).
// Results: the art composites under the template's own GT lines, with
//          measured pass/fail checks (word + icon, never color alone).
// Shares the apple-canon press shell verbatim — no drift.

import { useEffect, useMemo, useRef, useState } from 'react';

// The Templates page's upload sheet stashes the chosen file here, then routes
// to this page, which picks it up on mount (Bill, Aug 14 2026).
export const pendingTemplateFile: { file: File | null; name?: string | null; fromSaved?: boolean; status?: 'certified' | 'pending' } = { file: null, name: null, fromSaved: false };

// Demo shelf (Bill, Aug 14 2026): Accept & Save puts the tested template here;
// the Templates page shows it and tapping it re-opens the live test with the
// same file. In-memory only — a hard refresh clears the shelf.
export type SavedTest = { art: string; at: string; verdict: string };
export const savedLiveTemplates: Array<{
  name: string; file: File; img: string; wMm: number; hMm: number;
  layerCount: number; savedAt: string; tests: SavedTest[]; fresh?: boolean;
}> = [];
import * as pdfjs from 'pdfjs-dist';
// Vite-friendly worker wiring — ?url gives us the served asset path.
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
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
  LayoutDashboard, Users, Disc3, UserPlus, Library, Cog, Gift,
  Search, Bell, MessageSquarePlus, CheckCircle2, XCircle, MinusCircle, FileText, ChevronRight, Moon, Sun, Upload, RotateCcw, ZoomIn, ShieldCheck, X, Pencil, PenLine, PaintBucket, ChevronDown, Info, History, BadgeCheck,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import labelTemplatePdfUrl from '../assets/label-template-r091125.pdf?url';
import mrpLogo from '../assets/mrp-logo.svg';

// Demo draft for the "Resume where you left off" sheet (canon rule, Aug 15 2026):
// nothing saves automatically — Save is the one act that creates a revision — but
// an in-progress session is kept as a browser-local draft so a crash or closed tab
// never loses work. A draft never becomes a revision by itself.
const MOCK_DRAFT = { title: 'Center labels', keptNote: 'kept as a draft on this computer' };
import goodtunesLogo from '../assets/goodtunes-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';

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
      <style>{`@keyframes gt-thin-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
@keyframes gt-certify-glow { 0%, 100% { box-shadow: 0 0 0 0 rgba(49,158,216,0); } 50% { box-shadow: 0 0 0 4px rgba(49,158,216,0.25); } }`}</style>
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

// ─── Apple-canon press shell (duplicated verbatim across all press mocks — no drift) ───
const PRESS_NAV: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children?: Array<{ label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; soon?: boolean }> }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    label: 'Catalog',
    icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: NavPackage },
      { label: 'White Label', icon: NavLayers, soon: true },
      { label: 'GoodDeed Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave, soon: true },
      { label: 'Templates', icon: NavTemplate, soon: true },
    ],
  },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function PressShell({ active, t, children }: { active: string; t: Theme; children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={mrpLogo} alt="Memphis Record Pressing" className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            Memphis Record Pressing
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink }} data-testid="button-feedback">
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <span className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 flex-shrink-0', t.avatarRing)}>
            <img src={brandonPhoto} alt="BS" className="w-full h-full object-cover" />
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={cn('w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.soft }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>⌘K</span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) => {
              if (item.children) {
                const groupActive = item.label === active;
                return (
                  <div key={item.label}>
                    <button
                      type="button"
                      className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !groupActive && t.hoverWash)}
                      style={{ fontWeight: groupActive ? 600 : 500, color: groupActive ? t.ink : t.subink, backgroundColor: groupActive ? t.card : undefined, boxShadow: groupActive ? t.navShadow : undefined }}
                    >
                      <NavChevron className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    </button>
                    <div className="space-y-0.5">
                      {item.children.map(({ label, icon: Icon, soon }) => {
                        const isActive = label === active;
                        return (
                          <a
                            key={label}
                            href="#"
                            onClick={(e) => e.preventDefault()}
                            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !isActive && t.hoverWash)}
                            style={{ fontWeight: isActive ? 600 : 500, color: isActive ? t.ink : t.subink, backgroundColor: isActive ? t.card : undefined, boxShadow: isActive ? t.navShadow : undefined }}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                            <span className="truncate flex-1">{label}</span>
                            {soon && (
                              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.soft, color: t.subink }}>
                                Request
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              const { label, icon: Icon } = item;
              const isActive = label === active;
              return (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !isActive && t.hoverWash)}
                  style={{ fontWeight: isActive ? 600 : 500, color: isActive ? t.ink : t.subink, backgroundColor: isActive ? t.card : undefined, boxShadow: isActive ? t.navShadow : undefined }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                  <span className="truncate flex-1">{label}</span>
                </a>
              );
            })}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>Powered by</span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
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
  const OPS = pdfjs.OPS as Record<string, number>;
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
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  return { img: canvas.toDataURL('image/png'), wMm: vp1.width * PT_TO_MM, hMm: vp1.height * PT_TO_MM };
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

export default function PressTemplateLiveTest() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [template, setTemplate] = useState<TemplateState | null>(null);
  const [art, setArt] = useState<ArtState | null>(null);
  const [busy, setBusy] = useState<'template' | 'art' | null>(null);
  // Arrived from the Templates page with a file already in hand — nothing is
  // being uploaded, so show "Opening template" instead of the upload step
  // (Bill, Aug 15 2026).
  const [arriving, setArriving] = useState(false);
  // "Resume where you left off" — offered when the page opens empty-handed but a
  // draft exists (mock: always offers MOCK_DRAFT on a deep link / refresh).
  const [resumeOffer, setResumeOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [panC, setPanC] = useState<{ x: number; y: number } | null>(null); // view center as fraction of template
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number; w: number; h: number } | null>(null);
  // Bill, Aug 14 2026: layer table pops open over the page (icon right of Line/Area).
  const [showLayers, setShowLayers] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [originalName, setOriginalName] = useState<string | null>(null);
  // Bill, Aug 14 2026: Front/Back zone chips consolidate Cover+Safety behind a dropdown.
  const [openGroup, setOpenGroup] = useState<'Front' | 'Back' | null>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const artInput = useRef<HTMLInputElement>(null);
  // Save is the only act that creates a revision — so it stays quiet until
  // something actually changed (Bill, Aug 15 2026). Opening a saved template
  // arrives clean; replace / rename / new test results make it dirty.
  const [dirty, setDirty] = useState(true);
  // Status carries over from the Templates tile (Bill, Aug 15 2026): a certified
  // template says so here too; a fresh upload reads "Not tested" — usable, just
  // not certified yet. Mock: reopening the saved template = the certified one.
  const [savedMeta, setSavedMeta] = useState<{ certified: string; lastTest: string } | null>(null);
  // Header ••• under Save — view the saved tests, or replace the template
  // (replace = supersede: the old revision slides into history automatically,
  // per template canon; the new file loads here for testing) (Bill, Aug 15 2026).
  const [headerMenu, setHeaderMenu] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const replacingName = useRef<string | null>(null);
  // One tile per template, forever (Bill, Aug 15 2026): replacing supersedes —
  // the old revision moves into history *inside the same block*, tests attached.
  const [revisions, setRevisions] = useState<Array<{ name: string; wMm: number; hMm: number; at: string; tests: SavedTest[] }>>([]);
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
    const keepName = replacingName.current;
    replacingName.current = null;
    await loadTemplate(f, keepName ?? undefined);
    setDirty(true);
    setSavedMeta(null); // a replacing file is a new revision — certified status stays with the old one
  };

  const loadTemplate = async (f: File, displayName?: string) => {
    currentFile.current = f;
    setTestLog([]);
    setBusy('template'); setError(null);
    try {
      const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
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
    if (f) {
      const fromSaved = pendingTemplateFile.fromSaved === true;
      const status = pendingTemplateFile.status;
      pendingTemplateFile.file = null; pendingTemplateFile.name = null; pendingTemplateFile.fromSaved = false; pendingTemplateFile.status = undefined;
      setDirty(!fromSaved); // reopening a saved template = clean; fresh upload = unsaved work
      // Only a certified tile carries the badge over; pending arrives as "Not tested".
      setSavedMeta(fromSaved && status !== 'pending' ? { certified: 'Sep 14, 2026', lastTest: 'CALIFORNIALAND labels — Pass · Sep 14, 2026' } : null);
      setArriving(true); void loadTemplate(f, nm ?? undefined);
    }
    // Arrived with nothing in hand (refresh, deep link)? If a draft exists,
    // offer to resume it (Aug 15 2026 canon: crash-safety = drafts, not
    // auto-save). Production: only when a draft exists; otherwise route to
    // the Templates page as before. Mock always offers the demo draft.
    else setResumeOffer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume = load the draft exactly where it stood; Discard = the draft is gone,
  // back to Templates. Neither creates a revision.
  const resumeDraft = async () => {
    setResumeOffer(false);
    setArriving(true);
    try {
      const blob = await (await fetch(labelTemplatePdfUrl)).blob();
      await loadTemplate(new File([blob], 'label-template-r091125.pdf', { type: 'application/pdf' }), MOCK_DRAFT.title);
    } catch {
      setArriving(false);
      setError('Could not reopen the draft.');
    }
  };
  const discardDraft = () => { setResumeOffer(false); window.location.hash = '#/PressTemplatesIndex'; };

  const onPickArt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy('art'); setError(null);
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        const doc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
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
      setDirty(true); // new results are unsaved work until Save
    }
    artInput.current?.click();
  };

  const saveAndExit = () => {
    if (template && currentFile.current) {
      const at = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const tests = art ? [...testLog, { art: art.name, at, verdict: verdictWord }] : testLog;
      savedLiveTemplates.push({
        name: template.name, file: currentFile.current, img: template.img,
        wMm: template.wMm, hMm: template.hMm, layerCount: template.layers.length,
        savedAt: at, tests, fresh: true, // Templates page pulses this tile's line blue once
      });
    }
    window.location.hash = '#/PressTemplatesIndex';
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
    <PressShell active="Templates" t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        <nav aria-label="breadcrumb" data-testid="breadcrumb-livetest">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center"><button type="button" className={cn('transition-colors', t.hoverInk)}>Templates</button></li>
            <li role="presentation" aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            {/* Crumb = where you are: the template's own name once one is open
                (Bill, Aug 15 2026); "Live test" only before a file arrives. */}
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>{template?.name ?? 'Live test'}</span></li>
          </ol>
        </nav>

        <div className="mt-3 flex items-end justify-between gap-6 flex-wrap">
          <div>
            {/* Heading tells the job (Bill, Aug 15 2026): an uncertified template
                still needs certifying, so the third word appears only then. */}
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: t.ink }}>Template. </span>
              <span style={{ color: t.subink, fontWeight: 500 }}>Test.</span>
              {!savedMeta && <span style={{ color: t.subink, fontWeight: 500 }}> Certify.</span>}
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: t.subink, maxWidth: 720 }}>
              Upload a press template with GT layers, then an art file. The overlays below are read
              straight from the template&rsquo;s own Illustrator layers — exact to the hundredth of a millimeter.
            </p>
          </div>
          {/* "Start over" removed (Bill, Aug 15 2026) — it was playground chrome.
              Cancel leaves; Replace template… (header •••) swaps the file. */}
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

        {/* "Resume where you left off" — dimmed sheet over the page (Aug 15 2026). */}
        {resumeOffer && (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center p-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
            data-testid="sheet-resume-backdrop"
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
                onClick={discardDraft}
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
                {MOCK_DRAFT.title} — {MOCK_DRAFT.keptNote}.
              </p>
              <p className="mt-1 text-[12px] mx-auto" style={{ color: t.faint, maxWidth: 330 }} data-testid="text-draft-note">
                You opened this without pressing Save. Nothing lands in Templates until you do.
              </p>
              {/* Canon (Bill, Aug 15 2026): confirming action rightmost; Cancel/dismiss quiet text to its left. */}
              <div className="mt-6 flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={discardDraft}
                  className="h-9 px-4 rounded-full text-[13px] font-medium transition-colors hover:opacity-80"
                  style={{ color: t.subink }}
                  data-testid="button-discard-draft"
                >
                  Discard draft
                </button>
                <button
                  type="button"
                  onClick={() => { void resumeDraft(); }}
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
            {/* One line, Apple-quiet; the detail lives behind the i (canon, Aug 15 2026). */}
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
                  {/* Where the previous test stood — so a returning operator knows
                      without opening the ••• trail (Bill, Aug 15 2026) */}
                  {savedMeta && testLog.length === 0 && (
                    <div className="text-[11px] mt-0.5 truncate" style={{ color: t.faint }} data-testid="text-last-test">
                      Last test: {savedMeta.lastTest} — full trail under •••
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
                        onClick={() => { window.location.hash = '#/PressTemplatesIndex'; }}
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
                        // Not yet certified? The button is the next move — it says so
                        // ("Test & certify") and breathes a gentle blue ring to draw
                        // the eye without shouting (Bill, Aug 15 2026).
                        <button
                          type="button"
                          onClick={() => artInput.current?.click()}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-opacity disabled:opacity-60"
                          style={{
                            backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}`,
                            animation: !savedMeta && busy === null ? 'gt-certify-glow 2.4s ease-in-out infinite' : undefined,
                          }}
                          data-testid="button-upload-art"
                        >
                          <ShieldCheck style={{ width: 14, height: 14, color: t.blue }} />
                          {savedMeta ? 'Test' : 'Test & certify'}
                        </button>
                      )}
                      {/* Save tells the truth (Bill, Aug 15 2026): filled blue only
                          when there's something to save; otherwise a quiet outline —
                          background showing through, never a grayed-out blue. */}
                      <button
                        type="button"
                        onClick={saveAndExit}
                        disabled={busy !== null || !dirty}
                        title={dirty ? undefined : 'Nothing to save — replace the file, rename, or run a new test'}
                        className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors"
                        style={dirty
                          ? { backgroundColor: t.blue, color: '#fff', opacity: busy !== null ? 0.6 : 1 }
                          : { backgroundColor: 'transparent', color: t.subink, border: `1px solid ${t.hairline}` }}
                        data-testid="button-accept-save"
                      >
                        Save
                      </button>
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
                                {[{ name: template.name, wMm: template.wMm, hMm: template.hMm, at: uploadedAt ?? '', tests: testLog, current: true }, ...revisions.map((r) => ({ ...r, current: false }))].map((rev, ri) => (
                                  <div key={ri} className="py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                                    <div className="flex items-baseline justify-between gap-3">
                                      <span className="text-[12.5px] font-semibold truncate" style={{ color: t.ink }} title={rev.name}>{rev.name}</span>
                                      <span className="text-[11px] font-semibold flex-shrink-0 inline-flex items-center gap-1" style={{ color: rev.current ? t.ready : t.faint }}>
                                        {rev.current ? <><BadgeCheck style={{ width: 12, height: 12 }} /> Current</> : <><History style={{ width: 12, height: 12 }} /> Superseded</>}
                                      </span>
                                    </div>
                                    <div className="text-[11.5px] mt-0.5 tabular-nums" style={{ color: t.subink }}>
                                      {rev.wMm.toFixed(1)} × {rev.hMm.toFixed(1)} mm{rev.at ? ` · uploaded ${rev.at}` : ''}
                                    </div>
                                    {rev.tests.length === 0 ? (
                                      <div className="text-[11.5px] mt-1.5" style={{ color: t.faint }}>No art files tested</div>
                                    ) : rev.tests.map((e, ei) => (
                                      <div key={ei} className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: t.subink }}>
                                        {e.verdict === 'Pass' ? <CheckCircle2 style={{ width: 12, height: 12, color: t.ready, flexShrink: 0 }} /> : e.verdict === 'Fail' ? <XCircle style={{ width: 12, height: 12, color: '#E5484D', flexShrink: 0 }} /> : <MinusCircle style={{ width: 12, height: 12, color: t.faint, flexShrink: 0 }} />}
                                        <span className="truncate" title={e.art}>{e.art}</span>
                                        <span className="flex-shrink-0" style={{ color: t.faint }}>— {e.verdict} · {e.at}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
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

            {/* No save-confirm dialog (Bill, Aug 15 2026): Save in the header
                saves and returns to Templates — one act, no congrats sheet. */}

          </div>
        )}

        <input ref={templateInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPickTemplate} data-testid="input-template-pdf" />
        <input ref={artInput} type="file" accept="application/pdf,.pdf,image/png,image/jpeg" className="hidden" onChange={onPickArt} data-testid="input-art-file" />
      </div>

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-[60] h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}
