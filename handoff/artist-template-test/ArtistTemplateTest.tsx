// ArtistTemplateTest — the ARTIST-side template TEST page. Every art block in
// the Artist portal points here ("Tap any piece to open its test view").
//
// Bill, Aug 16 2026: rebuild as the SAME EXACT LAYOUT as Otis's live
// "Template. Test. Certify." page (three attached screenshots), "just removing
// the items not pertinent to the artist." So this is a faithful structural copy
// of that live page — collapsed pass card, template header card, viewer toolbar,
// overlay-chip row (with Line|Area seg + zoom -/+), and the big white canvas with
// the CALIFORNIALAND jacket spread seated in it — with the PRESS-ONLY pieces
// stripped: artists upload ART, never press templates or GT layers, and never
// edit/save the template. So gone are: "18 GT layers read", the "Originally
// 20260814_GoodTunes_MRP_…" line, the "full trail under •••" flag line, the
// Cancel/Save pill pair, the File-hygiene GT-layer check, and the layers/•••
// press actions. The "Save result & test another" press action is replaced with
// the artist-appropriate quiet "Download test proof".
//
// Self-contained per handoff rules; the check-row + toolbar + overlay-chip
// grammar mirrors the live page. It is a viewer, so it carries NO filled-blue
// primary action (the live page's blue Save pill is a press-only edit action,
// removed). Route auto-registers at #/ArtistTemplateTest. Focused sheet — no rail.
//
// Canon: statuses are word + icon (Bill is colorblind), never color alone; real
// GoodTunes(R) with the literal (R); "estimate" never "quote"; sentence case.

import { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  MinusCircle,
  BadgeCheck,
  Layers,
  Download,
  PenLine,
  ZoomIn,
  Sun,
  Moon,
} from 'lucide-react';
import niinaJacket from '../assets/niina-jacket.png';

// ─── Theme — dark artist charcoal is the canon default; light for parity. ──
type Theme = {
  canvas: string;
  card: string;
  soft: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  ready: string;
  readyWash: string;
  chipBorder: string;
  hoverCard: string;
  headerBg: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    card: '#ffffff',
    soft: '#f0f0f2',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    ready: '#1c8a5b',
    readyWash: '#eaf5ef',
    chipBorder: '#d9d9de',
    hoverCard: 'hover:bg-slate-100',
    headerBg: 'rgba(255,255,255,0.72)',
  },
  dark: {
    canvas: '#161618',
    card: '#1c1c1f',
    soft: '#2a2a2f',
    ink: '#f5f5f7',
    subink: '#a1a1a6',
    faint: '#6e6e73',
    hairline: '#2e2e33',
    ready: '#3fbf82',
    readyWash: 'rgba(63,191,130,0.12)',
    chipBorder: '#3a3a40',
    hoverCard: 'hover:bg-white/10',
    headerBg: 'rgba(22,22,24,0.72)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// MOCK DATA — all dummy values live here (export handoff rule: no literal
// dummy values inside JSX). Swap these for real data on the app side.
// ═══════════════════════════════════════════════════════════════════

// The art being tested. The image import stays a module import (asset), but is
// referenced through this const so the app can repoint it.
const MOCK_ART = {
  title: 'Cover \u00b7 12\u2033 jacket',   // breadcrumb current-page label
  image: niinaJacket,                       // wide CALIFORNIALAND jacket spread
  alt: 'CALIFORNIALAND 12-inch jacket spread seated in the press template',
};

// The certified press template this art is tested against (read-only facts an
// artist cares about — press-internal lines were removed).
const MOCK_TEMPLATE = {
  name: 'MRP_Jacket12in_3.5mmSpine',
  certifiedDate: 'Aug 16, 2026',
  size: '779.41 \u00d7 539.33 mm',
  uploaded: 'uploaded Aug 16 at 7:45 PM',
  artFilename: 'CALIFORNIALAND_12-JKTSG3D-100.pdf',
};

// The uploaded test file's display name (upload-card summary line).
const MOCK_TEST_FILE = 'CALIFORNIALAND_12-JKTSG3D-100 \u2014 12in Single 3D Jacket with Gusseted Pocket, 3.5mm Spine \u2014 R030326 (2).pdf';

// Check rows inside the upload card — word + icon (Pass / Not measured),
// explanation below. Press-only "File hygiene / GT template layers" dropped;
// what an artist needs kept: Bleed size, Pages, Color & resolution.
type CheckTone = 'pass' | 'na';
const MOCK_CHECKS: Array<{ param: string; tone: CheckTone; detail: string }> = [
  { param: 'Bleed size', tone: 'pass', detail: 'Art measures 779.4 \u00d7 539.3 mm \u2014 covers the template\u2019s bleed (636.5 \u00d7 326.1 mm); the extra trims away' },
  { param: 'Pages', tone: 'pass', detail: '1 page \u2014 a jacket is one spread' },
  { param: 'Resolution', tone: 'pass', detail: '347 PPI \u2014 above the 300 PPI floor' },
  { param: 'Color & resolution', tone: 'pass', detail: 'CMYK \u2014 spot preserved, ink and image resolution both clear' },
];

// ─── Viewer toolbar tabs + overlay chips — mirror the live page verbatim. ────
const VIEW_TABS = ['Full Template', 'Back', 'Front', 'Spine'] as const;
type ViewTab = (typeof VIEW_TABS)[number];
const OVERLAY_CHIPS: Array<{ id: string; label: string; hasCaret?: boolean }> = [
  { id: 'template', label: 'Template off' },
  { id: 'bleed', label: 'Bleed off' },
  { id: 'cut', label: 'Cut off' },
  { id: 'spine', label: 'Spine off' },
  { id: 'front', label: 'Front off', hasCaret: true },
  { id: 'back', label: 'Back off', hasCaret: true },
];

export function ArtistTemplateTest() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];

  const [view, setView] = useState<ViewTab>('Full Template');
  const [lineArea, setLineArea] = useState<'Line' | 'Area'>('Line');
  const [zoom, setZoom] = useState(100);

  return (
    <div className="min-h-[100dvh]" style={{ background: t.canvas, color: t.ink }} data-testid="artist-template-test">
      {/* Mock-only appearance toggle */}
      <div className="fixed z-20" style={{ top: 16, right: 16 }}>
        <button
          type="button"
          onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
          className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)}
          style={{ width: 36, height: 36, border: `1px solid ${t.hairline}`, background: t.card, color: t.subink }}
          data-testid="button-appearance"
          aria-label="Toggle appearance"
        >
          {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="mx-auto w-full" style={{ maxWidth: 1080, padding: '32px 40px 96px' }}>
        {/* 1 · Breadcrumb — back into the release Assets (artist grammar). */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center">
              <a href="#/ArtistPortalRestructureFlow" className="transition-opacity hover:opacity-80" data-testid="link-back-assets">Assets</a>
            </li>
            <li aria-hidden><ChevronRight className="w-3.5 h-3.5" /></li>
            <li className="inline-flex items-center"><span aria-current="page" style={{ color: t.ink }}>{MOCK_ART.title}</span></li>
          </ol>
        </nav>

        {/* 2 · Headline — two-tone, same typographic treatment as the live page.
            Artist copy: they upload ART only, never press templates or GT layers. */}
        <h1 style={{ marginTop: 12, fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
          <span style={{ color: t.ink }}>Test. </span>
          <span style={{ color: t.subink, fontWeight: 500 }}>Certify.</span>
        </h1>
        <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
          Your CALIFORNIALAND art, seated in the press template. The overlays below are read straight from the
          template so you can see exactly how the art will trim, fold, and print &mdash; before it goes to press.
        </p>

        {/* 3 · Upload / check card — resting PASSED state (collapsed), per
            screenshot 3. Check-circle + "Pass! All measured checks passed" +
            "5 of 5 passed" + filename; chevron to expand the rows; "Try another
            file" quiet action bottom-right when open. */}
        <UploadCard t={t} rows={MOCK_CHECKS} fileName={MOCK_TEST_FILE} />

        {/* 4 · Template header card — read-only facts an artist cares about.
            Press-internal lines + Cancel/Save removed. */}
        <div className="rounded-2xl" style={{ marginTop: 16, padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="template-header">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[16px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{MOCK_TEMPLATE.name}</h2>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: t.ready }} data-testid="badge-certified">
              <BadgeCheck className="w-4 h-4" /> Certified
            </span>
            <span className="text-[13px]" style={{ color: t.faint }}>{MOCK_TEMPLATE.certifiedDate}</span>
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.faint }}>
            {MOCK_TEMPLATE.size} &middot; {MOCK_TEMPLATE.uploaded} &middot; art: {MOCK_TEMPLATE.artFilename}
          </p>
        </div>

        {/* 5 · Viewer toolbar — segmented view tabs left; artist-quiet actions
            right (layers view + Download test proof; press •••/Save removed). */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
          <div className="inline-flex items-center rounded-full p-0.5" style={{ background: t.soft, border: `1px solid ${t.hairline}` }} data-testid="view-tabs" role="tablist">
            {VIEW_TABS.map((tab) => {
              const active = tab === view;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(tab)}
                  className="h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap"
                  style={{ color: active ? t.ink : t.subink, background: active ? t.card : 'transparent', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.18)' : undefined }}
                  data-testid={`view-tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)} style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: t.subink }} data-testid="button-layers" aria-label="Layers view">
              <Layers className="w-4 h-4" />
            </button>
            <button
              type="button"
              className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
              style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
              data-testid="button-download-proof"
            >
              <Download className="w-4 h-4 flex-shrink-0" /> Download test proof
            </button>
          </div>
        </div>

        {/* 6 · Overlay-chip row — toggle chips left; Line|Area seg + zoom right.
            Matches the live page (this replaces the invented slider UI). */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 14 }}>
          <div className="flex items-center gap-2 flex-wrap" data-testid="overlay-chips">
            {OVERLAY_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={cn('inline-flex items-center gap-1.5 h-7 rounded-full text-[12px] font-medium transition-colors', t.hoverCard)}
                style={{ padding: c.hasCaret ? '0 8px 0 10px' : '0 12px', color: t.subink, border: `1px solid ${t.chipBorder}` }}
                data-testid={`overlay-${c.id}`}
              >
                <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, border: `1.5px solid ${t.faint}` }} />
                {c.label}
                {c.hasCaret && <ChevronDown className="w-3.5 h-3.5" style={{ color: t.faint }} />}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* Line | Area segmented */}
            <div className="inline-flex items-center rounded-full p-0.5" style={{ background: t.soft, border: `1px solid ${t.hairline}` }} data-testid="line-area">
              {(['Line', 'Area'] as const).map((opt) => {
                const active = opt === lineArea;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setLineArea(opt)}
                    className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-medium transition-colors"
                    style={{ color: active ? t.ink : t.subink, background: active ? t.card : 'transparent', boxShadow: active ? '0 1px 2px rgba(0,0,0,0.18)' : undefined }}
                    data-testid={`la-${opt.toLowerCase()}`}
                  >
                    {opt === 'Line' && <PenLine className="w-3.5 h-3.5" />}
                    {opt === 'Area' && <Layers className="w-3.5 h-3.5" />}
                    {opt}
                  </button>
                );
              })}
            </div>
            {/* Zoom − 100% + */}
            <div className="inline-flex items-center gap-1 rounded-full" style={{ padding: '0 4px', border: `1px solid ${t.hairline}` }} data-testid="zoom">
              <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 10))} className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)} style={{ width: 28, height: 28, color: t.subink }} data-testid="button-zoom-out" aria-label="Zoom out">
                <span className="text-[16px] leading-none" style={{ marginTop: -1 }}>&minus;</span>
              </button>
              <span className="inline-flex items-center gap-1 text-[12.5px] font-medium tabular-nums" style={{ color: t.subink, minWidth: 52, justifyContent: 'center' }}>
                <ZoomIn className="w-3.5 h-3.5" style={{ color: t.faint }} /> {zoom}%
              </span>
              <button type="button" onClick={() => setZoom((z) => Math.min(200, z + 10))} className={cn('inline-flex items-center justify-center rounded-full transition-colors', t.hoverCard)} style={{ width: 28, height: 28, color: t.subink }} data-testid="button-zoom-in" aria-label="Zoom in">
                <span className="text-[15px] leading-none">+</span>
              </button>
            </div>
          </div>
        </div>

        {/* 7 · Big white canvas — the CALIFORNIALAND jacket SPREAD (wide, not
            square) seated in it, zoom-scaled. */}
        <div
          className="w-full overflow-hidden rounded-2xl flex items-center justify-center"
          style={{ marginTop: 14, background: '#ffffff', border: `1px solid ${t.hairline}`, padding: '56px 40px' }}
          data-testid="template-canvas"
        >
          <img
            src={MOCK_ART.image}
            alt={MOCK_ART.alt}
            className="w-full h-auto"
            style={{ maxWidth: `${zoom}%`, transition: 'max-width 0.1s linear' }}
            data-testid="canvas-art"
          />
        </div>
      </div>
    </div>
  );
}

// The upload / check card. Resting state = collapsed PASS summary (screenshot 3);
// expanding shows the check rows + "Try another file" (screenshot 1).
function UploadCard({ t, rows, fileName }: { t: Theme; rows: typeof MOCK_CHECKS; fileName: string }) {
  const [open, setOpen] = useState(false);
  const passed = rows.filter((r) => r.tone === 'pass').length;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ marginTop: 22, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="upload-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn('w-full flex items-center gap-3 text-left transition-colors', t.hoverCard)}
        style={{ padding: '16px 20px' }}
        data-testid="upload-summary"
      >
        <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: t.ready }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-[14px] font-semibold" style={{ color: t.ink }}>Pass! All measured checks passed </span>
          <span className="text-[13px]" style={{ color: t.subink }}>{passed} of {rows.length} passed</span>
          <span className="block text-[12.5px] truncate" style={{ marginTop: 2, color: t.faint }}>
            {fileName}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: t.faint, transform: open ? 'rotate(180deg)' : undefined }} aria-hidden />
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${t.hairline}` }} data-testid="upload-rows">
          {rows.map((r, i) => {
            const color = r.tone === 'pass' ? t.ready : t.faint;
            const Icon = r.tone === 'pass' ? CheckCircle2 : MinusCircle;
            const word = r.tone === 'pass' ? 'Pass' : 'Not measured';
            return (
              <div key={r.param} className="flex items-start gap-3" style={{ padding: '14px 20px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }} data-testid={`row-${r.param.toLowerCase().replace(/[\s&]+/g, '-')}`}>
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color, marginTop: 1 }} aria-hidden />
                <div className="min-w-0">
                  <div className="text-[13px]">
                    <span className="font-semibold" style={{ color: t.ink }}>{r.param} </span>
                    <span className="font-semibold" style={{ color }}>{word}</span>
                  </div>
                  <div className="text-[12.5px]" style={{ marginTop: 2, color: t.subink }}>{r.detail}</div>
                </div>
              </div>
            );
          })}
          <div className="flex justify-end" style={{ padding: '12px 20px', borderTop: `1px solid ${t.hairline}` }}>
            <button type="button" className="text-[13px] font-medium transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-try-another">Try another file</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ArtistTemplateTest;
