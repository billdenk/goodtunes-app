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
// removed). Route auto-registers at #/ArtistTemplateTest. Renders inside the
// shared artist chrome (top bar + left rail, copied locally).
//
// Aug 2026 additions (Bill): a real "Upload another file" replace affordance in
// the checks-card footer (mirrors the press upload treatment); a "File history"
// audit-trail card (uploads + the press download, newest first, word+icon
// results); and a production LOCK — once the press downloads the file it locks,
// the footer flips to a locked banner and the upload pill disables until the
// press unlocks. Page stays zero-blue.
//
// Canon: statuses are word + icon (Bill is colorblind), never color alone; real
// GoodTunes(R) with the literal (R); "estimate" never "quote"; sentence case.

import { useState, type ReactNode } from 'react';
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  MinusCircle,
  BadgeCheck,
  Layers,
  Download,
  Upload,
  UploadCloud,
  Lock,
  ArrowLeftRight,
  Circle,
  History,
  X,
  Clock,
  Link2,
  FileUp,
  ImagePlus,
  LayoutTemplate,
  PenLine,
  ZoomIn,
  Search,
  Bell,
  MessageSquarePlus,
  LayoutDashboard,
  Disc3,
  ShoppingBag,
  BarChart3,
  Store,
  Gift,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import niinaJacket from '../assets/niina-jacket.png';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';

const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

// ─── Theme — dark artist charcoal is the canon default; light for parity.
// Tokens mirror ArtistPortalRestructureFlow so the shared top bar + left rail
// chrome (copied locally per handoff law) renders identically here. ──
type Theme = {
  canvas: string;
  rail: string;
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
  hoverWash: string;
  headerBg: string;
  logoFilter: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
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
    hoverWash: 'hover:bg-slate-200',
    headerBg: 'rgba(255,255,255,0.72)',
    logoFilter: 'none',
  },
  dark: {
    canvas: '#161618',
    rail: '#1c1c1f',
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
    hoverWash: 'hover:bg-white/5',
    headerBg: 'rgba(22,22,24,0.72)',
    logoFilter: 'invert(1)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// MOCK DATA — all dummy values live here (export handoff rule: no literal
// dummy values inside JSX). Swap these for real data on the app side.
// ═══════════════════════════════════════════════════════════════════

// Account identity shown in the shared top bar (copied from the portal chrome).
const MOCK_USER = { fullName: 'Niina Soleil', initials: 'NS' };

// Left-rail nav — same groups/items/order as ArtistPortalRestructureFlow.
// This is a release asset test page, so the highlight sits on Releases.
// Settings is NOT in this list — per the cross-vendor rail standard (Bill) it is
// PINNED to the bottom of the rail, with Team living inside Settings.
type NavItem = { label: string; icon: LucideIcon; active?: boolean };
const MOCK_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Shopify', icon: Store },
  { label: 'Referrals', icon: Gift },
];

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

// ─── Lock state (Item 3) — when the press downloads the file for production it
// locks; the artist can't replace it until the press unlocks. This is the
// audit-trail guard so an artist can't claim the press used the wrong file. The
// download details are the placeholder proof shown in the locked banner. ────
const MOCK_LOCK = {
  press: 'Memphis Record Pressing',
  downloadedAt: 'Aug 17 at 9:12 AM',
};

// ─── File history (Item 2) — the upload/download audit trail, newest first. The
// current file is marked "Current"; prior uploads show their check result; the
// press download is logged as its own event. Word + icon on every result. ────
type HistoryEvent = 'current' | 'passed' | 'replaced' | 'downloaded';
const MOCK_HISTORY: Array<{
  id: string;
  file: string;
  dims: string;
  when: string;
  event: HistoryEvent;
}> = [
  { id: 'dl', file: 'CALIFORNIALAND_12-JKTSG3D-100.pdf', dims: '779.4 \u00d7 539.3 mm', when: 'Aug 17 at 9:12 AM', event: 'downloaded' },
  { id: 'v3', file: 'CALIFORNIALAND_12-JKTSG3D-100.pdf', dims: '779.4 \u00d7 539.3 mm', when: 'Aug 16 at 7:45 PM', event: 'current' },
  { id: 'v2', file: 'CALIFORNIALAND_12-JKTSG3D-098.pdf', dims: '779.4 \u00d7 539.3 mm', when: 'Aug 14 at 2:03 PM', event: 'passed' },
  { id: 'v1', file: 'CALIFORNIALAND_12-JKT-draft.pdf', dims: '762.0 \u00d7 528.0 mm', when: 'Aug 11 at 11:20 AM', event: 'replaced' },
];

// History row status meta — word + icon, never colour alone (Bill is colourblind).
const HISTORY_META: (t: Theme) => Record<HistoryEvent, { word: string; icon: LucideIcon; color: string; fillDot?: boolean }> = (t) => ({
  current: { word: 'Current', icon: Circle, color: t.ready, fillDot: true },
  passed: { word: 'Passed', icon: CheckCircle2, color: t.subink },
  replaced: { word: 'Replaced', icon: ArrowLeftRight, color: t.faint },
  downloaded: { word: 'Downloaded by press', icon: Download, color: t.subink },
});

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

// ═══════════════════════════════════════════════════════════════════
// PORTAL CHROME — top bar + left rail, copied locally from
// ArtistPortalRestructureFlow (kept self-contained per handoff law). Same
// groups/items, same top bar, same light/dark theming. The appearance toggle
// lives in the top bar here (kept as a plain button so this file needs no
// Popover dependency — react + lucide + assets only).
// ═══════════════════════════════════════════════════════════════════
function NavRow({ label, icon: Icon, active, t }: NavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !active && t.hoverWash)}
      style={{ fontWeight: active ? 600 : 500, color: active ? t.ink : t.subink, backgroundColor: active ? t.soft : undefined, boxShadow: active ? PILL_SHADOW : undefined }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

function ArtistShell({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={niinaPhoto} alt={MOCK_USER.fullName} className="h-9 w-9 rounded-full object-cover flex-shrink-0 ring-1 ring-black/10" />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>{MOCK_USER.fullName}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] transition-colors', t.hoverCard)} style={{ color: t.subink, padding: '6px 12px' }} data-testid="button-feedback">
            <MessageSquarePlus className="w-3.5 h-3.5" /> Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverCard)} style={{ color: t.subink }} aria-label="Notifications" data-testid="button-notifications">
            <Bell className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={cn('h-8 w-8 overflow-hidden rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2', t.hoverCard)}
            aria-label="Open account menu"
            aria-haspopup="menu"
            data-testid="button-account-menu"
          >
            <img src={niinaPhoto} alt="" className="h-full w-full object-cover" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 hidden md:flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className="w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none"
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium rounded-md" style={{ color: t.faint, background: t.soft, padding: '2px 6px' }} aria-hidden>⌘K</span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {MOCK_NAV.map((item) => <NavRow key={item.label} {...item} t={t} />)}
          </nav>
          <div className="px-2.5 pb-2">
            <NavRow label="Settings" icon={Settings} t={t} />
          </div>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>Powered by</span>
            <img src={goodtunesLogo} alt="GoodTunes®" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

export function ArtistTemplateTest({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const mode = 'dark' as const;
  const t = THEMES[mode];

  const [view, setView] = useState<ViewTab>('Full Template');
  const [lineArea, setLineArea] = useState<'Line' | 'Area'>('Line');
  const [zoom, setZoom] = useState(100);
  // Mock-only: flip the press-download lock to demo both states (like the
  // appearance toggle). Not shipped — the real lock is set by the press.
  const locked = false;
  // Mock-only: "No art yet" = the raw-template landing state a first-time artist
  // sees; true = the tested/certified state. Not shipped.
  const hasArt = true;
  // File history is revealed from the toolbar icon (same as the press side), not
  // a standing card. Only meaningful once there's art/upload history.
  const [showHistory, setShowHistory] = useState(false);
  // The upload/check card's expanded state is lifted so the toolbar "Replace"
  // pill can open it (the replace affordance is otherwise invisible while the
  // check card is collapsed — Bill, Aug 18 2026).
  const [uploadOpen, setUploadOpen] = useState(false);
  // Whether the actual drag-drop upload box is showing in the card footer. The
  // toolbar Replace takes the artist straight to it — one click, no intermediate
  // buttons (Bill, Aug 18 2026 late: "This should just show me the upload box.").
  const [showDrop, setShowDrop] = useState(false);

  const workspace = (
      <div className="mx-auto w-full" style={{ maxWidth: 1080, padding: embedded ? '8px 0 96px' : '32px 40px 96px' }} data-testid="artist-template-test">
        {/* 1 · Breadcrumb — back into the release Assets (artist grammar). */}
        <nav aria-label="breadcrumb" data-testid="breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: t.faint }}>
            <li className="inline-flex items-center">
              {embedded
                ? <button type="button" onClick={onBack} className="transition-opacity hover:opacity-80" data-testid="link-back-assets">Assets</button>
                : <a href="#/ArtistPortalRestructureFlow" className="transition-opacity hover:opacity-80" data-testid="link-back-assets">Assets</a>}
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
        {hasArt ? (
          <UploadCard t={t} rows={MOCK_CHECKS} fileName={MOCK_TEST_FILE} locked={locked} open={uploadOpen} onOpenChange={setUploadOpen} showDrop={showDrop} onShowDropChange={setShowDrop} />
        ) : (
          <PendingCard t={t} />
        )}

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

        {/* File history is no longer a standing card — it's revealed from the
            toolbar history/layers icon below, same as the press Test/Certify surface. */}

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
            {/* History/layers icon — reveals the File history popover (same as the
                press Test/Certify surface). Only meaningful once there's art. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { if (hasArt) setShowHistory((v) => !v); }}
                aria-disabled={!hasArt}
                aria-expanded={hasArt ? showHistory : undefined}
                aria-haspopup="dialog"
                className={cn('inline-flex items-center justify-center rounded-full transition-colors', hasArt && t.hoverCard)}
                style={{ width: 34, height: 34, border: `1px solid ${t.hairline}`, color: hasArt ? t.subink : t.faint, opacity: hasArt ? 1 : 0.55, cursor: hasArt ? 'pointer' : 'not-allowed' }}
                data-testid="button-layers"
                aria-label="File history"
                title="File history"
              >
                <History className="w-4 h-4" />
              </button>
              {hasArt && showHistory && <HistoryPanel t={t} locked={locked} onClose={() => setShowHistory(false)} />}
            </div>
            {!hasArt && (
              <button
                type="button"
                className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
                style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
                data-testid="button-download-raw"
              >
                <LayoutTemplate className="w-4 h-4 flex-shrink-0" /> Download raw template
              </button>
            )}

            {/* Replace — the toolbar counterpart of the press "Save result & test
                another" slot. Visible once art exists; goes straight to the upload
                box in one click (opens the card AND reveals the drop target — no
                intermediate button). When locked, becomes a disabled Lock pill. */}
            {hasArt && (locked ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium"
                style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.faint, opacity: 0.6, cursor: 'not-allowed' }}
                aria-disabled="true"
                data-testid="button-replace-locked"
              >
                <Lock className="w-4 h-4 flex-shrink-0" /> Upload locked
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setUploadOpen(true); setShowDrop(true); }}
                className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
                style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
                data-testid="button-replace"
                aria-label="Replace file"
                title="Replace file"
              >
                <Upload className="w-4 h-4 flex-shrink-0" /> Replace
              </button>
            ))}

            {/* Download test proof — circular icon-only button that expands to the
                LEFT on hover to reveal its label (same 34px circle as the history
                button). Disabled/faint when there's no art. */}
            <button
              type="button"
              className="group inline-flex items-center justify-end rounded-full overflow-hidden transition-colors"
              style={{ height: 34, border: `1px solid ${t.hairline}`, color: hasArt ? t.subink : t.faint, opacity: hasArt ? 1 : 0.55, cursor: hasArt ? 'pointer' : 'not-allowed', paddingLeft: 0, paddingRight: 0 }}
              aria-disabled={!hasArt}
              data-testid="button-download-proof"
              aria-label="Download test proof"
              title="Download test proof"
            >
              <span
                className="text-[13px] font-medium whitespace-nowrap transition-all duration-200 opacity-0 max-w-0 group-hover:opacity-100 group-hover:max-w-[160px] group-hover:pl-3.5"
                style={{ color: t.ink }}
              >
                Download test proof
              </span>
              <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32 }}>
                <Download className="w-4 h-4" />
              </span>
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

        {/* 7 · Big white canvas. With art: the CALIFORNIALAND jacket SPREAD
            seated in the template, zoom-scaled. Without art: the RAW press
            template — white with Front/Back panels and an upload overlay on
            each so the artist drops art straight onto the layout. */}
        <div
          className="w-full overflow-hidden rounded-2xl flex items-center justify-center"
          style={{ marginTop: 14, background: '#ffffff', border: `1px solid ${t.hairline}`, padding: '56px 40px' }}
          data-testid="template-canvas"
        >
          {hasArt ? (
            <img
              src={MOCK_ART.image}
              alt={MOCK_ART.alt}
              className="w-full h-auto"
              style={{ maxWidth: `${zoom}%`, transition: 'max-width 0.1s linear' }}
              data-testid="canvas-art"
            />
          ) : (
            <RawTemplate zoom={zoom} />
          )}
        </div>
      </div>
  );
  return embedded
    ? workspace
    : <ArtistShell t={t}>{workspace}</ArtistShell>;
}

// The upload / check card. Resting state = collapsed PASS summary (screenshot 3);
// expanding shows the check rows + the "Upload another file" replace affordance
// (mirrors the press-side upload treatment). When the press has downloaded the
// file for production, the footer flips to a locked banner and the upload pill
// disables (word + icon, never color alone).
function UploadCard({ t, rows, fileName, locked, open, onOpenChange, showDrop, onShowDropChange }: { t: Theme; rows: typeof MOCK_CHECKS; fileName: string; locked: boolean; open: boolean; onOpenChange: (v: boolean) => void; showDrop: boolean; onShowDropChange: (v: boolean) => void }) {
  const setOpen = (fn: (v: boolean) => boolean) => onOpenChange(fn(open));
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
          {/* Footer — replace affordance, or the locked-for-production banner
              once the press has downloaded the file. */}
          {locked ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ padding: '14px 20px', borderTop: `1px solid ${t.hairline}` }} data-testid="locked-banner">
              <div className="flex items-start gap-2.5 min-w-0">
                <Lock className="w-4 h-4 flex-shrink-0" style={{ color: t.subink, marginTop: 1 }} aria-hidden />
                <p className="text-[12.5px]" style={{ color: t.subink, lineHeight: 1.5 }}>
                  <span className="font-semibold" style={{ color: t.ink }}>Locked for production</span>
                  {' \u2014 '}{MOCK_LOCK.press} downloaded this file {MOCK_LOCK.downloadedAt}. Ask them to unlock it if you need to replace it.
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium flex-shrink-0"
                style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.faint, cursor: 'not-allowed', opacity: 0.6 }}
                aria-disabled="true"
                data-testid="button-upload-another-disabled"
              >
                <Lock className="w-4 h-4 flex-shrink-0" /> Upload locked
              </span>
            </div>
          ) : showDrop ? (
            /* The actual drag-drop upload box — shown in one click from the
               toolbar Replace pill (or the footer button). No intermediate step:
               the drop target is visible and ready. */
            <div style={{ padding: '16px 20px', borderTop: `1px solid ${t.hairline}` }} data-testid="replace-dropbox">
              <button
                type="button"
                className="w-full flex flex-col items-center justify-center text-center gap-2 rounded-xl transition-colors"
                style={{ padding: '28px 20px', border: `2px dashed ${t.hairline}`, background: t.soft, color: t.subink }}
                data-testid="upload-dropzone"
              >
                <UploadCloud className="w-7 h-7" style={{ color: t.subink, strokeWidth: 1.5 }} aria-hidden />
                <span className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Drag &amp; drop your new art here</span>
                <span className="text-[12px]" style={{ color: t.faint }}>or click to upload &middot; paste a URL &mdash; replaces the current file and re-runs the checks</span>
              </button>
              <div className="flex justify-end" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => onShowDropChange(false)}
                  className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
                  style={{ padding: '6px 14px', border: `1px solid ${t.hairline}`, color: t.subink }}
                  data-testid="button-cancel-replace"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3" style={{ padding: '12px 20px', borderTop: `1px solid ${t.hairline}` }}>
              <span className="text-[12px]" style={{ color: t.faint }}>Replaces the current file and re-runs the checks.</span>
              <button
                type="button"
                onClick={() => onShowDropChange(true)}
                className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors flex-shrink-0', t.hoverCard)}
                style={{ padding: '7px 14px', border: `1px solid ${t.hairline}`, color: t.ink }}
                data-testid="button-upload-another"
              >
                <Upload className="w-4 h-4 flex-shrink-0" /> Save result &amp; upload new
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// File history card (Item 2) — the upload/download audit trail. Canon list rows,
// faint text, word + icon result on every row; newest first.
// File history — the SAME right-anchored popover the press Test/Certify surface
// uses (rounded-2xl, soft header band, close X, revision rows newest first),
// reused verbatim for the artist. Revealed by the toolbar layers/history icon,
// not a standing card. Artist content = MOCK_HISTORY (filename · dims · date ·
// Current/Passed/Replaced/Downloaded word+icon states).
function HistoryPanel({ t, locked, onClose }: { t: Theme; locked: boolean; onClose: () => void }) {
  const meta = HISTORY_META(t);
  // The press-download event only exists once the file is locked.
  const rows = MOCK_HISTORY.filter((h) => h.event !== 'downloaded' || locked);
  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} data-testid="file-history-backdrop" />
      <div
        className="absolute z-[71] rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, top: 'calc(100% + 6px)', right: 0, width: 380 }}
        role="dialog"
        aria-label="File history"
        data-testid="file-history"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}`, backgroundColor: t.soft }}>
          <div>
            <div className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: t.ink }}>File history</div>
            <div className="text-[12px] mt-0.5" style={{ color: t.subink }}>Every upload and download, newest first</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-full inline-flex items-center justify-center flex-shrink-0" style={{ border: `1px solid ${t.hairline}`, color: t.subink }} data-testid="button-close-history">
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div className="px-5 py-3 max-h-[420px] overflow-y-auto">
          {rows.map((h, i) => {
            const m = meta[h.event];
            const Icon = m.icon;
            return (
              <div key={h.id} className="py-3 flex items-center justify-between gap-4" style={{ borderBottom: i < rows.length - 1 ? `1px solid ${t.hairline}` : undefined }} data-testid={`history-row-${h.id}`}>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate" style={{ color: t.ink }} title={h.file}>{h.file}</div>
                  <div className="text-[11.5px] mt-0.5 tabular-nums" style={{ color: t.subink }}>{h.dims} &middot; {h.when}</div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold flex-shrink-0" style={{ color: m.color }} data-testid={`history-status-${h.event}`}>
                  <Icon className="w-3 h-3 flex-shrink-0" style={m.fillDot ? { fill: m.color } : undefined} aria-hidden />
                  {m.word}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Pending card (Part B) — the pre-upload state that replaces the PASSED summary
// when there's no art yet. Quiet, word + icon, zero blue. Mirrors the checks-card
// shell so the two states swap cleanly in place.
function PendingCard({ t }: { t: Theme }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ marginTop: 22, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="pending-card">
      <div className="flex items-center gap-3" style={{ padding: '16px 20px' }}>
        <Clock className="w-5 h-5 flex-shrink-0" style={{ color: t.subink }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold" style={{ color: t.ink }}>
            Pending &mdash; not tested yet
          </div>
          <div className="text-[12.5px]" style={{ marginTop: 2, color: t.faint }}>
            Drop your Front and Back art onto the template below to run the checks.
          </div>
        </div>
      </div>
    </div>
  );
}

// Panel upload overlay (Part B) — the dashed drop-zone that sits over each raw
// template panel. Clicking opens a small dead-end popover with "Choose file" and
// "Paste URL" rows — the same upload-menu affordance used elsewhere.
function PanelUpload({ t, panel }: { t: Theme; panel: 'Front' | 'Back' }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="absolute inset-3">
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        className="w-full h-full flex flex-col items-center justify-center text-center gap-2 rounded-xl transition-colors"
        style={{ border: '2px dashed rgba(200,60,60,0.55)', background: 'rgba(200,60,60,0.05)', color: '#7a2a2a' }}
        data-testid={`panel-upload-${panel.toLowerCase()}`}
      >
        <ImagePlus className="w-7 h-7" style={{ strokeWidth: 1.5 }} aria-hidden />
        <span className="text-[13px] font-semibold">Drag &amp; drop your {panel} art here</span>
        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ opacity: 0.8 }}>
          or click to upload &middot; paste a URL
        </span>
      </button>
      {menu && (
        <div
          className="absolute left-1/2 rounded-xl overflow-hidden"
          style={{ top: '50%', transform: 'translate(-50%, 8px)', minWidth: 190, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 12px 32px rgba(0,0,0,0.28)', zIndex: 5 }}
          data-testid={`panel-menu-${panel.toLowerCase()}`}
        >
          <button type="button" className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)} style={{ padding: '10px 14px', color: t.ink }} data-testid={`menu-choose-${panel.toLowerCase()}`}>
            <FileUp className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> Choose file
          </button>
          <button type="button" className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)} style={{ padding: '10px 14px', color: t.ink, borderTop: `1px solid ${t.hairline}` }} data-testid={`menu-url-${panel.toLowerCase()}`}>
            <Link2 className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> Paste URL
          </button>
        </div>
      )}
    </div>
  );
}

// Raw press template (Part B) — the white template the artist lands on before
// uploading. Front + Back panels with hairline red template linework (simple
// styled divs, no assets) and an upload overlay on each. Zoom-scaled to match
// the seated-art canvas.
function RawTemplate({ zoom }: { zoom: number }) {
  const t = THEMES.light; // the canvas is always white; use light tokens for the menu
  const RED = 'rgba(200,60,60,0.7)';
  return (
    <div
      className="w-full"
      style={{ maxWidth: `${zoom}%`, transition: 'max-width 0.1s linear' }}
      data-testid="raw-template"
    >
      <div className="grid grid-cols-2" style={{ gap: 2 }}>
        {(['Back', 'Front'] as const).map((panel) => (
          <div key={panel} className="relative" style={{ aspectRatio: '1 / 1', background: '#ffffff', outline: `1.5px solid ${RED}`, outlineOffset: -1 }} data-testid={`raw-panel-${panel.toLowerCase()}`}>
            {/* Bleed guide — dashed inset rectangle, press template convention. */}
            <div className="absolute" style={{ inset: 14, border: `1px dashed ${RED}` }} aria-hidden />
            {/* Panel label, top-left, template red. */}
            <span className="absolute text-[11px] font-semibold" style={{ top: 6, left: 8, color: RED, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{panel}</span>
            <PanelUpload t={t} panel={panel} />
          </div>
        ))}
      </div>
      {/* Spine strip between panels is implied by the 2px gap; a thin center
          fold guide keeps the template read. */}
      <div className="flex items-center justify-center" style={{ marginTop: 8 }}>
        <span className="text-[11px]" style={{ color: RED, letterSpacing: '0.06em' }}>Raw press template &middot; art not placed yet</span>
      </div>
    </div>
  );
}

export default ArtistTemplateTest;
