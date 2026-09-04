// TemplateArtViewer — the shared template/art composite viewer (Task #3184).
//
// The press live-test page (PressTemplateLiveTest.tsx) proved this overlay
// model: the template PDF's own GT layers (measured in mm by gtOverlayEngine)
// drive zone chips, side/family pills, Line/Area rendering, view crops
// (Full Template / Back / Front / Spine), a stepper zoom with pan-drag, a
// hi-DPI crop re-render, and the art seated at its real measured placement.
// This component packages that exact model for the ARTIST art-test page so
// artists see their checked art in the template the same way the press does.
// The press page keeps its own inline JSX (press flow unchanged by design);
// the view math here mirrors it line-for-line.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, PenLine, PaintBucket, ZoomIn, Download } from 'lucide-react';
import { ChevronDown as NavChevron, Layers as NavLayers } from 'lucide-react';
import type * as pdfjs from 'pdfjs-dist';
import { zoneColor, shapePath, renderPage, type GtLayer } from './gtOverlayEngine';
import { groupZonesForPills, zoneSort, zoneSide, pickSideFocusZone, SIDE_NAMES, type SideName, type FamilyGroup } from './sidePillGroups';
import { computeCropCanvasSize, rasterCssLayout } from './cropDimensions';
import { createFullSharpController } from './fullSharpRender';
// Bounded-retry hi-DPI crop render (Task #3213) — never strands the viewer on
// the blurry base raster silently.
import { renderCropOnce, runWithRetry, type CropRender } from './cropSharpRender';
import { computePdfArtRect, computeRasterArtRect } from './artPlacement';
import {
  DEFAULT_TEMPLATE_OPACITY,
  selectTemplateRaster,
  templateCompositeStyle,
} from './proofComposite';

export type ViewerTemplate = { img: string; wMm: number; hMm: number; layers: GtLayer[] };
export type ViewerArt = {
  name: string;
  img: string; // data URL / hosted preview; '' = none renderable
  wMm: number | null; // real measured mm for PDF art; null for rasters
  hMm: number | null;
  pxAspect?: number; // raster aspect (w/h) when known — drives contain-fit
} | null;

export type ViewerTheme = {
  card: string; soft: string; hairline: string;
  ink: string; subink: string; faint: string; blue: string;
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];

export function TemplateArtViewer({
  template,
  pdfDoc,
  art,
  dark,
  t,
  proofName,
  actions,
  renderFullPage,
  sharpDebounceMs = 180,
}: {
  template: ViewerTemplate;
  /** Kept alive for hi-DPI crop re-renders; crops fall back to the base raster without it. */
  pdfDoc?: pdfjs.PDFDocumentProxy | null;
  art: ViewerArt;
  dark: boolean;
  t: ViewerTheme;
  /** Base name for the "Download test proof" PNG; omitting hides the button. */
  proofName?: string;
  /** Host-page toolbar actions (e.g. the artist page's File-history popover +
      Replace pill — Ruby's Aug 18 handoff) rendered at the head of the
      right-side action cluster. The toolbar is permanent architecture: the
      host keeps the same buttons in every state, disabled until applicable. */
  actions?: React.ReactNode;
  /** Test seam (Task #3212): sharp Full-Template rasterizer. Defaults to a
      real pdf.js full-page render at the given width. */
  renderFullPage?: (doc: pdfjs.PDFDocumentProxy, targetWidth: number) => Promise<{ img: string }>;
  /** Test seam: debounce for the sharp Full-Template render. */
  sharpDebounceMs?: number;
}) {
  const [activeZones, setActiveZones] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'line' | 'area'>('line');
  const [viewArea, setViewArea] = useState<'full' | SideName>('full');
  const [zoom, setZoom] = useState(1);
  const [panC, setPanC] = useState<{ x: number; y: number } | null>(null);
  // Artist default: the template IS the point — arrive with it on under the art.
  const [showTemplate, setShowTemplate] = useState(true);
  const [templateOpacity, setTemplateOpacity] = useState(DEFAULT_TEMPLATE_OPACITY);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [artOpacity, setArtOpacity] = useState(1);
  const [showLayers, setShowLayers] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [cropImg, setCropImg] = useState<CropRender | null>(null);
  // Task #3213 — the crop render exhausted its retries: keep the blurry base
  // raster visible but say so with a subtle pill instead of failing silently.
  const [cropFailed, setCropFailed] = useState(false);
  const cropRenderSeq = useRef(0);
  // Sharp Full-Template raster (Task #3212) — mirrors the press page: the base
  // 1400px render goes blurry under a 200–400% CSS zoom (× Retina DPR), so a
  // zoom-sized full-page re-render overlays it once ready.
  const [fullImg, setFullImg] = useState<string | null>(null);
  const fullSharp = useRef(createFullSharpController()).current;
  const fullSharpId = useRef<{ doc: pdfjs.PDFDocumentProxy | null; img: string }>({ doc: null, img: '' });
  const dragRef = useRef<{ px: number; py: number; cx: number; cy: number; w: number; h: number } | null>(null);

  // Zones present in the template, grouped LINE + AREA (press page verbatim).
  const zones = useMemo(() => {
    const byZone = new Map<string, { zone: string; line?: GtLayer; area?: GtLayer }>();
    for (const l of template.layers) {
      const entry = byZone.get(l.zone) ?? { zone: l.zone };
      if (l.kind === 'line') entry.line = l;
      else entry.area = entry.area ?? l;
      byZone.set(l.zone, entry);
    }
    return Array.from(byZone.values()).sort((a, b) => zoneSort(a.zone, b.zone));
  }, [template]);

  const sideGroups = useMemo(() => groupZonesForPills(template.layers), [template]);
  const { familyGrouped, familyGroups } = sideGroups;

  const bleed = zones.find((z) => z.zone === 'Bleed');
  const cut = zones.find((z) => z.zone === 'Cut');
  const bleedBox = bleed?.line ?? bleed?.area;
  const cutBox = cut?.line ?? cut?.area;

  // Art placement: centered on the GT Bleed box (fallback: Cut, then full page).
  const anchor = bleedBox ?? cutBox ?? null;
  // Side-panel seats (Front-first) for raster panel art — Niina's Full
  // Template ruling: art never floats unregistered over the spread.
  const sideBoxes = useMemo(() => {
    const measurable = zones.filter((zz) => zz.line || zz.area).map((zz) => zz.zone);
    return SIDE_NAMES
      .map((s) => pickSideFocusZone(measurable, s))
      .map((name) => (name ? zones.find((zz) => zz.zone === name) : undefined))
      .map((z) => z?.line ?? z?.area)
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({ xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, hMm: b.hMm }));
  }, [zones]);

  const artRect = useMemo(() => {
    if (!art) return null;
    if (art.wMm === null || art.hMm === null) {
      // Raster: shared decision — full-artboard exports seat edge-to-edge,
      // spread-shaped art centers on the anchor, panel-shaped art (e.g. a
      // square front cover on a wide jacket spread) seats registered in the
      // best-matching side panel so the die-line guides land on its edges.
      return computeRasterArtRect(template, anchor, art.pxAspect, sideBoxes);
    }
    // PDF with real physical dims: full-artboard exports seat edge-to-edge,
    // everything else centers on the anchor (shared decision, Task #3189).
    return computePdfArtRect(template, anchor, { wMm: art.wMm, hMm: art.hMm });
  }, [template, art, anchor, sideBoxes]);

  const pct = (v: number, total: number) => `${((v / total) * 100).toFixed(3)}%`;

  // ── View focus: Full Template, or crop to a GT zone (Back/Front/Spine). ──
  const focus = useMemo(() => {
    let r = { x: 0, y: 0, w: template.wMm, h: template.hMm };
    if (viewArea !== 'full') {
      const measurable = zones.filter((zz) => zz.line || zz.area).map((zz) => zz.zone);
      const pick = pickSideFocusZone(measurable, viewArea);
      const z = pick ? zones.find((zz) => zz.zone === pick) : undefined;
      const b = z?.line ?? z?.area;
      if (b) {
        const pad = Math.max(b.wMm, b.hMm) * 0.04;
        r = { x: b.xMm - pad, y: b.yMm - pad, w: b.wMm + pad * 2, h: b.hMm + pad * 2 };
      }
    }
    return r;
  }, [template, zones, viewArea]);

  const viewT = useMemo(() => {
    if (!focus) return { s: 1, tx: 0, ty: 0 };
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

  // Sharp raster for crop views — re-render the focus sub-region from the PDF.
  useEffect(() => {
    if (!focus || viewArea === 'full') { setCropImg(null); setCropFailed(false); return; }
    const doc = pdfDoc;
    if (!doc) { setCropFailed(false); return; }
    const seq = ++cropRenderSeq.current;
    setCropFailed(false);
    const desiredPx = Math.round(1440 * ZOOMS[ZOOMS.length - 1] * (window.devicePixelRatio || 1));
    const f = { x: focus.x, y: focus.y, w: focus.w, h: focus.h };
    // Task #3213 — bounded retry: a single transient pdf.js failure right
    // after a fresh upload used to strand the tab on the blurry base raster
    // forever (silent catch, no retry). Retry a few times; if it genuinely
    // can't render, surface the "Sharp preview unavailable" pill instead.
    void (async () => {
      const res = await runWithRetry(
        () => renderCropOnce(doc, f, desiredPx),
        () => cropRenderSeq.current === seq,
      );
      if (cropRenderSeq.current !== seq) return;
      if (res.ok) setCropImg(res.value);
      else if (!res.superseded) setCropFailed(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewArea, pdfDoc, template.img, focus?.x, focus?.y, focus?.w, focus?.h]);

  // ── Sharp Full-Template render (Task #3212) — press page verbatim. ──
  // Debounced across rapid zoom steps, cached per zoom tier (keyed on the
  // template's base raster identity), silently keeps the low-res raster on
  // failure or when no pdf.js document was passed in. Canvas size rides the
  // same computeCropCanvasSize guard as the crop views (≤ 4096px/side).
  useEffect(() => {
    // Template identity sync FIRST — invalidation happens inside this effect,
    // before this run's token is minted, so effect ordering can never stale a
    // fresh template's own first render, and a swapped template can never
    // serve a prior template's cached raster (completion review, Task #3212).
    if (fullSharpId.current.doc !== (pdfDoc ?? null) || fullSharpId.current.img !== template.img) {
      fullSharpId.current = { doc: pdfDoc ?? null, img: template.img };
      fullSharp.invalidate();
      setFullImg(null);
    }
    // Invalidate any in-flight render on EVERY change — including zoom-out
    // and template swap — so a slow render can never land a stale overlay
    // (rules tested in fullSharpRender.test.ts).
    const token = fullSharp.begin();
    if (viewArea !== 'full' || zoom <= 1) { setFullImg(null); return; }
    const doc = pdfDoc;
    if (!doc) return;
    // Cache is scoped to ONE template (cleared above on any change), so the
    // zoom tier alone identifies an entry — no cross-template collisions.
    const key = `z${zoom}`;
    const cached = fullSharp.cache.get(key);
    if (cached) { setFullImg(cached); return; }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const desiredPx = Math.round(1440 * zoom * (window.devicePixelRatio || 1));
          const { targetW } = computeCropCanvasSize(template.wMm, template.hMm, desiredPx);
          if (targetW <= 1400) return; // base raster already carries this detail
          const { img } = await (renderFullPage
            ? renderFullPage(doc, targetW)
            : renderPage(doc, 1, targetW));
          if (token.isCurrent()) {
            fullSharp.cache.set(key, img);
            setFullImg(img);
          }
        } catch {
          // Best-effort — keep showing the base raster.
        }
      })();
    }, sharpDebounceMs);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewArea, zoom, pdfDoc, template.img, template.wMm, template.hMm]);

  const viewportPct = useMemo(() => {
    if (!focus) return 100;
    return Math.min(100, ((focus.w / focus.h) / (template.wMm / template.hMm)) * 100);
  }, [template, focus]);

  const zoneRelevant = (zone: string) => {
    if (viewArea === 'full') return true;
    if (zone === 'Bleed' || zone === 'Cut') return true;
    if (viewArea === 'Spine') return zone === 'Spine' || zone.startsWith('Spine ');
    return zone.includes(viewArea) || zoneSide(zone) === viewArea;
  };
  const templateRaster = selectTemplateRaster({
    hasFullSharp: !!fullImg,
    hasCropSharp: !!cropImg,
    fullView: viewArea === 'full',
    zoom,
  });

  const pickView = (v: typeof viewArea) => { setViewArea(v); setPanC(null); setZoom(1); };
  const stepZoom = (dir: 1 | -1) => setZoom((z) => {
    const i = ZOOMS.indexOf(z);
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir))];
    if (next === 1) setPanC(null);
    return next;
  });
  const toggleZone = (z: string) => setActiveZones((prev) => {
    const next = new Set(prev);
    if (next.has(z)) next.delete(z); else next.add(z);
    return next;
  });

  // Sides that actually resolve to a measurable focus zone in THIS template.
  const availableSides = useMemo(() => {
    const measurable = zones.filter((zz) => zz.line || zz.area).map((zz) => zz.zone);
    return SIDE_NAMES.filter((s) => !!pickSideFocusZone(measurable, s));
  }, [zones]);

  // ── Download test proof — a real PNG composite of exactly what's on screen
  // at Full Template: template raster (when shown), art at its measured
  // placement, and the toggled GT overlays. ──
  const [proofBusy, setProofBusy] = useState(false);
  const downloadProof = async () => {
    if (proofBusy) return;
    setProofBusy(true);
    try {
      const loadImg = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image'));
        img.src = src;
      });
      const W = 1600;
      const H = Math.round((W * template.hMm) / template.wMm);
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      const s = W / template.wMm; // mm → px
      if (art && artRect && art.img) {
        try {
          ctx.globalAlpha = artOpacity;
          ctx.drawImage(await loadImg(art.img), artRect.xMm * s, artRect.yMm * s, artRect.wMm * s, artRect.hMm * s);
          ctx.globalAlpha = 1;
        } catch { /* keep going */ }
      }
      if ((!art || showTemplate) && template.img) {
        try {
          const templateImage = await loadImg(template.img);
          const composite = templateCompositeStyle(!!art, templateOpacity);
          ctx.save();
          try {
            ctx.globalAlpha = composite.opacity;
            ctx.globalCompositeOperation = composite.mixBlendMode;
            ctx.drawImage(templateImage, 0, 0, W, H);
          } finally {
            ctx.restore();
          }
        } catch { /* keep going */ }
      }
      const areaAlpha = dark ? 0.19 : 0.25;
      for (const { zone, line, area } of zones) {
        if (!activeZones.has(zone)) continue;
        const box = viewMode === 'line' ? (line ?? area) : (area ?? line);
        if (!box) continue;
        const c = zoneColor(zone);
        ctx.save();
        ctx.scale(s, s);
        if (viewMode === 'area' && area) {
          ctx.fillStyle = c;
          ctx.globalAlpha = areaAlpha;
          const d = area.pathMm
            ? area.pathMm
            : area.inWMm
              ? `${shapePath(area.xMm, area.yMm, area.wMm, area.hMm, area.round)} ${shapePath(area.inXMm!, area.inYMm!, area.inWMm!, area.inHMm!, area.round)}`
              : shapePath(area.xMm, area.yMm, area.wMm, area.hMm, area.round);
          ctx.fill(new Path2D(d), 'evenodd');
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = c;
        ctx.lineWidth = 2 / s;
        if (zone === 'Bleed' || zone.includes('Safety')) ctx.setLineDash([5 / s, 4 / s]);
        ctx.stroke(new Path2D(box.pathMm ?? shapePath(box.xMm, box.yMm, box.wMm, box.hMm, box.round)));
        ctx.restore();
        // Label pill — same grammar as the on-screen overlay label.
        const label = `${zone} · ${box.wMm.toFixed(1)} × ${box.hMm.toFixed(1)} mm`;
        ctx.font = '600 18px system-ui, -apple-system, sans-serif';
        const tw = ctx.measureText(label).width;
        const lx = box.xMm * s, ly = Math.max(0, box.yMm * s - 26);
        ctx.fillStyle = c;
        ctx.fillRect(lx, ly, tw + 14, 26);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, lx + 7, ly + 19);
      }
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${(proofName ?? 'test-proof').replace(/\.[a-z0-9]+$/i, '')} — test proof.png`;
      a.click();
    } finally {
      setProofBusy(false);
    }
  };

  return (
    <div>
      {/* View chips (Full Template / sides with a measurable zone) + layers + proof */}
      <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
        <div className="inline-flex items-center rounded-full p-0.5" style={{ background: t.soft, border: `1px solid ${t.hairline}` }} data-testid="view-tabs" role="tablist">
          {(['full', ...availableSides] as Array<'full' | SideName>).map((v) => {
            const label = v === 'full' ? 'Full Template' : v;
            const active = v === viewArea;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pickView(v)}
                className="h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap"
                style={{ color: active ? t.ink : t.subink, background: active ? t.card : 'transparent', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.18)' : undefined }}
                data-testid={`view-tab-${label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLayers((v) => !v)}
              aria-expanded={showLayers}
              className="inline-flex items-center justify-center rounded-full transition-colors"
              style={{ width: 34, height: 34, border: `1px solid ${showLayers ? t.blue : t.hairline}`, color: showLayers ? t.blue : t.subink }}
              data-testid="button-layers"
              aria-label="Layers view"
            >
              <NavLayers className="w-4 h-4" />
            </button>
            {showLayers && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setShowLayers(false)} />
                <div
                  className="absolute right-0 z-[61] rounded-xl shadow-2xl overflow-hidden"
                  style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, top: 'calc(100% + 6px)', minWidth: 280 }}
                  role="dialog"
                  aria-label="Template layers"
                  data-testid="popover-layers"
                >
                  <div className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: t.faint, borderBottom: `1px solid ${t.hairline}` }}>
                    Measured template layers
                  </div>
                  {zones.map(({ zone, line, area }) => {
                    const box = line ?? area;
                    if (!box) return null;
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => toggleZone(zone)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2 text-[12.5px] text-left"
                        style={{ color: t.ink }}
                        data-testid={`layer-row-${zone.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor(zone) }} />
                          <span className="truncate">{zone}</span>
                          <span className="text-[10px] font-semibold" style={{ color: t.faint }}>
                            {line && 'LINE'}{line && area && ' + '}{area && 'AREA'}
                          </span>
                        </span>
                        <span className="tabular-nums flex-shrink-0" style={{ color: activeZones.has(zone) ? t.blue : t.faint }}>
                          {box.wMm.toFixed(1)} × {box.hMm.toFixed(1)} mm
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {proofName !== undefined && (
            /* Circular icon button that expands to the LEFT on hover to reveal
               its label (Ruby's Aug 18 handoff — same 34px circle as the
               history/layers buttons). */
            <button
              type="button"
              onClick={() => void downloadProof()}
              disabled={proofBusy}
              className="group inline-flex items-center justify-end rounded-full overflow-hidden transition-colors disabled:opacity-60"
              style={{ height: 34, border: `1px solid ${t.hairline}`, color: t.subink, paddingLeft: 0, paddingRight: 0 }}
              data-testid="button-download-proof"
              aria-label="Download test proof"
              title="Download test proof"
            >
              <span
                className="text-[13px] font-medium whitespace-nowrap transition-all duration-200 opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[160px] group-hover:pl-3.5"
                style={{ color: t.ink }}
              >
                {proofBusy ? 'Preparing…' : 'Download test proof'}
              </span>
              <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32 }}>
                <Download className="w-4 h-4" />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Zone toggles + Line/Area + zoom (press-page composite toolbar) */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 14 }}>
        <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => setShowTemplate((v) => !v)}
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
                    <style>{`
                      .gt-slider { -webkit-appearance: none; appearance: none; height: 20px; background: transparent; cursor: pointer; }
                      .gt-slider::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: ${t.hairline}; }
                      .gt-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 0.5px solid rgba(0,0,0,0.18); box-shadow: 0 1px 4px rgba(0,0,0,0.35); margin-top: -6.5px; }
                      .gt-slider::-moz-range-track { height: 3px; border-radius: 2px; background: ${t.hairline}; }
                      .gt-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 0.5px solid rgba(0,0,0,0.18); box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
                    `}</style>
                    <label className="block text-[11px] font-semibold" style={{ color: t.subink }}>
                      Template opacity
                      <input
                        type="range" min={0} max={100} value={Math.round(templateOpacity * 100)}
                        onChange={(e) => setTemplateOpacity(Number(e.target.value) / 100)}
                        className="gt-slider block w-full mt-2"
                        data-testid="slider-template-opacity"
                      />
                    </label>
                    <div className="mt-1.5 text-[10.5px]" style={{ color: t.faint }}>
                      Adjust the press template without changing your artwork.
                    </div>
                    <label className="mt-3 block text-xs font-semibold" style={{ color: t.subink }}>
                      Art opacity
                      <input
                        type="range" min={0} max={100} value={Math.round(artOpacity * 100)}
                        onChange={(e) => setArtOpacity(Number(e.target.value) / 100)}
                        className="gt-slider block w-full mt-2"
                        data-testid="slider-art-opacity"
                      />
                    </label>
                    <div className="mt-1.5 text-[10.5px]" style={{ color: t.faint }}>
                      Adjust the artwork independently from the press template.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {zones.filter((z) => !sideGroups.grouped.has(z.zone) && !familyGrouped.has(z.zone) && zoneRelevant(z.zone)).map(({ zone }) => {
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
          {SIDE_NAMES.map((side) => {
            const group = sideGroups.groups.find((g) => g.side === side);
            if (!group) return null;
            const entries = group.entries.filter((e) => zoneRelevant(e.zone));
            if (entries.length === 0) return null;
            const parts = entries.map((e) => e.zone);
            const partLabel = (p: string) => group.entries.find((e) => e.zone === p)?.label ?? p;
            const onParts = parts.filter((p) => activeZones.has(p));
            const anyOn = onParts.length > 0;
            const c = zoneColor(side === 'Spine' ? 'Spine' : `${side} Cover`);
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
          {familyGroups.map((family: FamilyGroup) => {
            const entries = family.entries.filter((e) => zoneRelevant(e.zone));
            if (entries.length === 0) return null;
            const parts = entries.map((e) => e.zone);
            const partLabel = (p: string) => family.entries.find((e) => e.zone === p)?.label ?? p;
            const onParts = parts.filter((p) => activeZones.has(p));
            const anyOn = onParts.length > 0;
            const c = zoneColor(family.prefix);
            const status = anyOn ? onParts.map(partLabel).join(' + ') : 'off';
            const testKey = family.prefix.toLowerCase().replace(/\s+/g, '-');
            return (
              <div key={family.prefix} className="relative">
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
                    data-testid={`chip-zone-${testKey}`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: anyOn ? c : t.faint }} />
                    {family.prefix}
                    <span style={{ color: t.faint }}>{status}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenGroup((g) => (g === family.prefix ? null : family.prefix))}
                    aria-label={`${family.prefix} options`}
                    className="h-full pl-1 pr-2 inline-flex items-center"
                    style={{ color: t.subink, borderLeft: `1px solid ${anyOn ? `${c}55` : t.hairline}` }}
                    data-testid={`chip-zone-${testKey}-menu`}
                  >
                    <NavChevron style={{ width: 13, height: 13 }} />
                  </button>
                </div>
                {openGroup === family.prefix && (
                  <>
                    <div className="fixed inset-0 z-[65]" onClick={() => setOpenGroup(null)} />
                    <div
                      className="absolute z-[66] mt-1.5 rounded-xl overflow-hidden shadow-xl"
                      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 148 }}
                      data-testid={`menu-zone-${testKey}`}
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

      {/* Canon composite: white proof · art · exactly one template raster · GT overlays */}
      <div
        className="flex justify-center rounded-2xl"
        style={{
          marginTop: 14,
          padding: 'clamp(16px, 3vw, 36px)',
          backgroundColor: t.soft,
          border: `1px solid ${t.hairline}`,
        }}
        data-testid="template-preview-stage"
      >
        <div
          className="relative overflow-hidden"
          style={{
            width: `${viewportPct.toFixed(3)}%`,
            minWidth: 96,
            aspectRatio: focus ? `${focus.w} / ${focus.h}` : `${template.wMm} / ${template.hMm}`,
            // The proof sheet is intentionally white in BOTH appearances.
            backgroundColor: '#ffffff',
            border: '1px solid rgba(255,255,255,0.14)',
            boxShadow: dark ? '0 18px 42px rgba(0,0,0,0.42)' : '0 12px 30px rgba(0,0,0,0.12)',
            cursor: zoom !== 1 ? (dragRef.current ? 'grabbing' : 'grab') : 'default',
            touchAction: zoom !== 1 ? 'none' : 'auto',
          }}
          data-testid="preview-composite"
          onPointerDown={(e) => {
            if (zoom === 1 || !focus) return;
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
              y: d.cy - (e.clientY - d.py) / (d.w * (template.hMm / template.wMm)) / viewT.s,
            });
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          {/* Task #3213 — crop render exhausted its retries: subtle pill,
              blurry base raster stays visible underneath. */}
          {cropFailed && viewArea !== 'full' && (
            <div
              className="absolute bottom-2 left-2 z-10 pointer-events-none rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: '#ffffff' }}
              data-testid="pill-crop-sharp-unavailable"
            >
              Sharp preview unavailable
            </div>
          )}
          <div
            className="absolute top-0 left-0 w-full"
            style={{
              aspectRatio: `${template.wMm} / ${template.hMm}`,
              transform: `translate(${(viewT.tx * 100).toFixed(3)}%, ${(viewT.ty * 100).toFixed(3)}%) scale(${viewT.s.toFixed(4)})`,
              transformOrigin: '0 0',
            }}
          >
            {/* Task #3374 — every RASTER in this frame is laid out via
                rasterCssLayout: full-size layout box + transform placement, so
                Chromium's whole-pixel paint snapping can't shift/squeeze the
                bitmap under the frame's huge crop scale (vector overlays are
                immune and stay put; the rasters must match them). */}
            {art && artRect && art.img && (
              <img
                src={art.img}
                alt="Art"
                draggable={false}
                className="absolute"
                style={{
                  ...rasterCssLayout({ x: artRect.xMm, y: artRect.yMm, w: artRect.wMm, h: artRect.hMm }, template.wMm, template.hMm, viewT.s),
                  opacity: artOpacity,
                }}
                data-testid="img-art-overlay"
              />
            )}
            {(!art || showTemplate) && templateRaster === 'base' && (
              <img
                src={template.img}
                alt="Template"
                className="absolute"
                style={{
                  ...rasterCssLayout({ x: 0, y: 0, w: template.wMm, h: template.hMm }, template.wMm, template.hMm, viewT.s),
                  ...templateCompositeStyle(!!art, templateOpacity),
                }}
                draggable={false}
              />
            )}
            {/* Sharp Full-Template raster (Task #3212): overlays the base render
                once the zoom-sized re-render lands — crisp 200–400% zoom. */}
            {(!art || showTemplate) && fullImg && templateRaster === 'full' && (
              <img
                src={fullImg}
                alt=""
                draggable={false}
                className="absolute pointer-events-none"
                style={{
                  ...rasterCssLayout({ x: 0, y: 0, w: template.wMm, h: template.hMm }, template.wMm, template.hMm, viewT.s),
                  ...templateCompositeStyle(!!art, templateOpacity),
                }}
                data-testid="img-full-sharp"
              />
            )}
            {(!art || showTemplate) && cropImg && focus && templateRaster === 'crop' && (
              <img
                src={cropImg.img}
                alt=""
                draggable={false}
                className="absolute pointer-events-none"
                // Task #3290 — stretch over the EXACT rect the raster covers
                // (post canvas-size rounding), so raster and overlay share
                // one coordinate frame and cannot diverge.
                style={{
                  ...rasterCssLayout(cropImg.rectMm, template.wMm, template.hMm, viewT.s),
                  ...templateCompositeStyle(!!art, templateOpacity),
                }}
              />
            )}
            {zones.filter((z) => activeZones.has(z.zone) && zoneRelevant(z.zone)).map(({ zone, line, area }) => {
              const box = viewMode === 'line' ? (line ?? area) : (area ?? line);
              if (!box) return null;
              const c = zoneColor(zone);
              const areaAlpha = dark ? '30' : '40';
              // Scale-aware stroke (Task #3195): non-scaling-stroke only cancels the SVG's
              // internal viewBox scaling — the CSS scale on the canvas still multiplies the
              // stroke and dash pattern. Divide both by the effective view scale so lines
              // stay hairline (~1.5px on screen) at every crop/zoom.
              const sw = 1.5 / viewT.s;
              const dash = `${5 / viewT.s} ${4 / viewT.s}`;
              return (
                <div key={zone}>
                  {viewMode === 'area' && area && (
                    area.pathMm ? (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox={`0 0 ${template.wMm} ${template.hMm}`}
                        preserveAspectRatio="none"
                      >
                        <path d={area.pathMm} fill={`${c}${areaAlpha}`} fillRule="evenodd" />
                      </svg>
                    ) : area.inWMm ? (
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
                  {box.pathMm ? (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${template.wMm} ${template.hMm}`}
                      preserveAspectRatio="none"
                      data-testid={`overlay-${zone.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <path
                        d={box.pathMm}
                        fill="none"
                        stroke={c}
                        strokeWidth={sw}
                        vectorEffect="non-scaling-stroke"
                        strokeDasharray={zone === 'Bleed' || zone.includes('Safety') ? dash : undefined}
                      />
                    </svg>
                  ) : (
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      viewBox={`0 0 ${template.wMm} ${template.hMm}`}
                      preserveAspectRatio="none"
                      data-testid={`overlay-${zone.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {box.round ? (
                        <ellipse
                          cx={box.xMm + box.wMm / 2}
                          cy={box.yMm + box.hMm / 2}
                          rx={box.wMm / 2}
                          ry={box.hMm / 2}
                          fill="none"
                          stroke={c}
                          strokeWidth={sw}
                          vectorEffect="non-scaling-stroke"
                          strokeDasharray={zone === 'Bleed' || zone.includes('Safety') ? dash : undefined}
                        />
                      ) : (
                        <rect
                          x={box.xMm}
                          y={box.yMm}
                          width={box.wMm}
                          height={box.hMm}
                          fill="none"
                          stroke={c}
                          strokeWidth={sw}
                          vectorEffect="non-scaling-stroke"
                          strokeDasharray={zone === 'Bleed' || zone.includes('Safety') ? dash : undefined}
                        />
                      )}
                    </svg>
                  )}
                  <span
                    className="absolute pointer-events-none text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      left: pct(box.xMm, template.wMm),
                      top: pct(box.yMm, template.hMm),
                      backgroundColor: c, color: '#fff', whiteSpace: 'nowrap',
                      transform: `scale(${(1 / viewT.s).toFixed(6)})`,
                      transformOrigin: '0 100%',
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
  );
}

export default TemplateArtViewer;
