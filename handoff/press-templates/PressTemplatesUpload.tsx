// PressTemplatesUpload — Templates index (tile style) with the add-template
// modal open. Canonized from the legacy upload popup; extracted checks,
// no Save button, no re-hosted footnote. Duplicated from PressTemplatesIndex — Surface 3 from the template-canon brief: the
// library of canon, a new page under Specs. Each entry: component,
// variant, template code, revision, certification date, status.
// Statuses are icon + word (never color alone). One certified revision
// is live per component; superseded revisions stay in history.
// MOCK_ data from the worked example (MRP 12-LBL100M-2 R-091125).
// Shares the apple-canon press shell verbatim with the other press mocks.

import { useState } from 'react';
import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, ClipboardList, Cog, Gift,
  Search, Bell, MessageSquarePlus, BadgeCheck, Clock3, XCircle, History, Upload, FileQuestion, X, CloudUpload, MoreHorizontal, Archive, Moon, Sun,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import mrpLogo from './assets/mrp-logo.svg';
import gtPreviewTemplate from './assets/gt-preview-template-circle.png';
import goodtunesLogo from './assets/goodtunes-logo.png';
import brandonPhoto from './assets/brandon-seavers.png';

// ─── Themes — dark = canon charcoal (unchanged); light = apple-canon ──
// The whole page (shell chrome, tiles, and modal) reads from THEMES[mode].
// Dark stays the default so the canon rendering is byte-identical.
type Theme = {
  // shell / page surfaces + ink
  canvas: string;
  rail: string;
  card: string;
  soft: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string;
  blue: string;
  // status accents (word + shape carry meaning; color is supportive only)
  ready: string;
  crit: string;
  warn: string;
  // raised segmented-control thumb
  pillActive: string;
  pillShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // faint hover wash on tiles + drop zones
  tileHover: string;
  // active nav pill shadow
  navShadow: string;
  // dashed "add" cell border color
  dashedBorder: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // popover / dropdown shadow
  popShadow: string;
  // modal scrim (dark-tinted in both themes) + panel shadow
  modalScrim: string;
  modalShadow: string;
  // frosted "…" overflow button over the preview art
  overlayBtn: string;
  // white carrier ring for the preview logo circle
  logoRing: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    soft: '#f0f0f2',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    blue: '#319ED8',
    ready: '#1c8a5b',
    crit: '#e0245e',
    warn: '#c98a00',
    pillActive: '#ffffff',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5',
    tileHover: 'hover:bg-black/[0.02]',
    navShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    dashedBorder: 'rgba(0,0,0,0.18)',
    logoFilter: undefined,
    popShadow: '0 12px 40px rgba(0,0,0,0.16)',
    modalScrim: 'rgba(0,0,0,0.42)',
    modalShadow: '0 24px 80px rgba(0,0,0,0.24)',
    overlayBtn: 'rgba(0,0,0,0.06)',
    logoRing: '#e6e6ea',
  },
  dark: {
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    soft: '#26262a',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    blue: '#319ED8',
    ready: '#34c98e', // brightened ready accent on dark
    crit: '#ff5d8f', // brightened critical accent on dark
    warn: '#e8b34b', // brightened warning accent on dark
    pillActive: '#3a3a3e',
    pillShadow: '0 1px 3px rgba(0,0,0,0.4)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    tileHover: 'hover:bg-white/[0.03]',
    navShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    dashedBorder: 'rgba(255,255,255,0.22)',
    logoFilter: 'invert(1) brightness(1.8)',
    popShadow: '0 12px 40px rgba(0,0,0,0.5)',
    modalScrim: 'rgba(0,0,0,0.55)',
    modalShadow: '0 24px 80px rgba(0,0,0,0.55)',
    overlayBtn: 'rgba(255,255,255,0.10)',
    logoRing: 'rgba(255,255,255,0.10)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

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
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
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
          <button
            type="button"
            className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid="button-feedback"
          >
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>
                ⌘K
              </span>
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
                      style={{
                        fontWeight: groupActive ? 600 : 500,
                        color: groupActive ? t.ink : t.subink,
                        backgroundColor: groupActive ? t.card : undefined,
                        boxShadow: groupActive ? t.navShadow : undefined,
                      }}
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
                            style={{
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? t.ink : t.subink,
                              backgroundColor: isActive ? t.card : undefined,
                              boxShadow: isActive ? t.navShadow : undefined,
                            }}
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
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? t.ink : t.subink,
                    backgroundColor: isActive ? t.card : undefined,
                    boxShadow: isActive ? t.navShadow : undefined,
                  }}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                  <span className="truncate flex-1">{label}</span>
                </a>
              );
            })}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

type Status = 'certified' | 'pending' | 'failed' | 'superseded' | 'unread';

// Status = icon + word (never color alone — Bill is colorblind). The color
// only supports the word/shape; `tone` picks the theme-aware accent.
const STATUS_META: Record<Status, { label: string; tone: 'ready' | 'warn' | 'crit' | 'faint'; Icon: typeof BadgeCheck }> = {
  certified: { label: 'Certified', tone: 'ready', Icon: BadgeCheck },
  pending: { label: 'Pending', tone: 'warn', Icon: Clock3 },
  failed: { label: 'Failed', tone: 'crit', Icon: XCircle },
  superseded: { label: 'Superseded', tone: 'faint', Icon: History },
  unread: { label: "Couldn't read", tone: 'warn', Icon: FileQuestion },
};

function StatusChip({ status, t }: { status: Status; t: Theme }) {
  const { label, tone, Icon } = STATUS_META[status];
  const color = tone === 'ready' ? t.ready : tone === 'warn' ? t.warn : tone === 'crit' ? t.crit : t.faint;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color }}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
}

// ─── Component icons — blueprint die-line canon from the package builder ────
// Solid strokes are edges; dashed strokes are folds, holes, and hidden parts.
// (Same drawings as BlueprintIcon in the catalog builder — one icon language.)
type IconKind = 'jacket' | 'sleeve' | 'labels' | 'booklet';

function ComponentIcon({ kind, color, fill, size = 44 }: { kind: IconKind; color: string; fill: string; size?: number }) {
  const s: React.SVGProps<SVGSVGElement> = {
    width: size, height: size, viewBox: '0 0 26 26', fill: 'none',
    stroke: color, strokeWidth: 0.9, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (kind) {
    case 'jacket': // square jacket, record peeking out the right
      return (
        <svg {...s} aria-hidden>
          <circle cx="17.5" cy="13" r="6.5" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="17.5" cy="13" r="1.4" strokeDasharray="1.2 1.6" opacity={0.7} />
          <rect x="3" y="4" width="18" height="18" rx="1.2" fill={fill} />
        </svg>
      );
    case 'labels': // center label — dashed record as context, solid label as the piece
      return (
        <svg {...s} aria-hidden>
          <circle cx="13" cy="13" r="11" strokeDasharray="2 2.2" opacity={0.7} />
          <circle cx="13" cy="13" r="6.5" fill={fill} />
          <circle cx="13" cy="13" r="1.3" />
          <path d="M9.6 10.4a4.6 4.6 0 0 1 6.8 0" opacity={0.6} />
        </svg>
      );
    case 'sleeve': // inner sleeve — square sleeve half-hidden behind the dashed jacket
      return (
        <svg {...s} aria-hidden>
          <rect x="9" y="5.5" width="15" height="15" rx="1" fill={fill} />
          <rect x="2" y="5" width="16" height="16" rx="1.2" strokeDasharray="2 2.2" opacity={0.7} fill={fill} />
        </svg>
      );
    case 'booklet': // folded booklet — dashed center fold, text lines
      return (
        <svg {...s} aria-hidden>
          <rect x="4" y="4.5" width="18" height="17" rx="1.2" fill={fill} />
          <path d="M13 4.5v17" strokeDasharray="2 2.2" opacity={0.7} />
          <path d="M7 9.5h3.5M7 12.5h3.5M7 15.5h2.5M15.5 9.5h3.5M15.5 12.5h3.5" opacity={0.7} />
        </svg>
      );
  }
}

const MOCK_TEMPLATES: Array<{
  icon: IconKind; title: string;
  component: string; variant: string; code: string; rev: string;
  certified?: string; status: Status; note?: string; history?: Array<{ rev: string; note: string }>;
}> = [
  {
    icon: 'labels', title: 'Center labels',
    component: '12" LP center label', variant: '2LP · 100mm trim', code: '12-LBL100M-2', rev: 'R-091125',
    certified: 'Certified Sep 14, 2026', status: 'certified',
    history: [{ rev: 'R-072326', note: 'Superseded Sep 14, 2026 — 2 jobs in flight were flagged for review' }],
  },
];

export default function PressTemplatesUpload() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const th = THEMES[mode];
  const [fileMenuOpen, setFileMenuOpen] = useState(true);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [fileSource, setFileSource] = useState<'Upload file' | 'Paste a URL'>('Upload file');
  return (
    <PressShell active="Templates" t={th}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="text-[12px] font-medium" style={{ color: th.faint }}>Catalog · Templates</div>
            <h1 className="mt-1" style={{ fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
              <span style={{ color: th.ink }}>Templates. </span>
              <span style={{ color: th.subink, fontWeight: 500 }}>Your standards, set.</span>
            </h1>
            <p className="mt-1.5 text-[13.5px]" style={{ color: th.subink, maxWidth: 620 }}>
              Every file a client uploads is measured against the live canon below — your numbers, read straight
              from your template PDFs. One certified revision is live per component.
            </p>
          </div>
          {/* Format switcher — same segmented control as the catalog pricing pages */}
          <div className="inline-flex items-center rounded-full flex-shrink-0" style={{ padding: 3, backgroundColor: th.soft }} role="tablist" aria-label="Template format" data-testid="tabs-template-format">
            {[
              { label: 'Vinyl', enabled: true },
              { label: 'CD', enabled: false },
              { label: 'Cassette', enabled: false },
              { label: 'Stickers', enabled: false },
            ].map((f) => (
              <button
                key={f.label}
                type="button"
                role="tab"
                aria-selected={f.enabled}
                className="rounded-full transition-colors"
                style={{
                  padding: '6px 18px', fontSize: 13.5,
                  fontWeight: f.enabled ? 600 : 500,
                  color: f.enabled ? th.ink : th.faint,
                  backgroundColor: f.enabled ? th.pillActive : 'transparent',
                  boxShadow: f.enabled ? th.pillShadow : 'none',
                  cursor: f.enabled ? 'pointer' : 'default',
                }}
                data-testid={`tab-format-${f.label.toLowerCase()}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: th.faint }}>Vinyl · Templates</div>
          <div className="flex items-center gap-1.5">
            {['7″', '10″', '12″'].map((size) => (
              <button
                key={size}
                type="button"
                className="h-7 px-3 rounded-full text-[12px] font-semibold tabular-nums transition-colors"
                style={size === '12″' ? { backgroundColor: th.pillActive, color: th.ink, boxShadow: th.pillShadow } : { color: th.faint }}
                data-testid={`filter-size-${size.replace('″', '')}`}
              >
                {size}
              </button>
            ))}
            {/* Overflow menu hidden for now — "Duplicate a template" is parked for a
                future pass per Bill, Aug 12 2026. Keep in lockstep with PressTemplatesIndex. */}
          </div>
        </div>

        {/* Template tiles — Print-prep style containers (per Andrew, Aug 12 2026):
            press picks the component (jacket / inner sleeve / center labels / booklet),
            names it, the icon appears; each template lives in one of these tiles. */}
        <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {MOCK_TEMPLATES.map((tpl) => (
            <div key={tpl.code + tpl.rev} className={cn('rounded-2xl px-6 pt-7 pb-5 flex flex-col items-center text-center transition-colors', th.tileHover)} style={{ backgroundColor: th.card, border: `1px solid ${th.hairline}` }} data-testid={`tile-template-${tpl.code}`}>
              <ComponentIcon kind={tpl.icon} color={th.blue} fill={th.card} />
              <div className="mt-4 text-[15px] font-semibold" style={{ color: th.ink, letterSpacing: '-0.01em' }}>{tpl.title}</div>
              <div className="mt-1 text-[12.5px]" style={{ color: th.subink }}>{tpl.component} · {tpl.variant}</div>
              <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: th.subink }}>{tpl.code} <span style={{ color: th.faint }}>·</span> {tpl.rev}</div>
              <div className="mt-3 flex items-center gap-2">
                <StatusChip status={tpl.status} t={th} />
                {tpl.certified && <span className="text-[11.5px]" style={{ color: th.faint }}>{tpl.certified.replace('Certified ', '')}</span>}
              </div>
              {tpl.history?.map((h) => (
                <div key={h.rev} className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px]" style={{ color: th.faint, opacity: 0.85 }}>
                  <History className="w-3 h-3 flex-shrink-0" />
                  <span className="tabular-nums">{h.rev}</span>
                  <span>superseded · in history</span>
                </div>
              ))}
            </div>
          ))}

          {/* Known-needed slots — every vinyl format needs these; empty ones sit
              as dashed placeholders until the press fills them. */}
          {([
            { kind: 'jacket' as const, title: 'Single jacket', note: 'Outer sleeve — no spine' },
            { kind: 'jacket' as const, title: 'Widespine jacket', note: 'Outer sleeve — wide spine' },
            { kind: 'jacket' as const, title: 'Gatefold jacket', note: 'Outer sleeve — opens flat' },
            { kind: 'sleeve' as const, title: 'Inner sleeve', note: 'Paper' },
            { kind: 'booklet' as const, title: 'Insert', note: '12 \u00d7 12 in \u00b7 2 pages' },
          ]).map(({ kind, title, note }) => (
            <button
              key={title}
              type="button"
              className="group relative rounded-2xl px-6 py-9 flex flex-col items-center justify-center text-center"
              style={{ border: `1.5px dashed ${th.dashedBorder}` }}
              data-testid={`tile-empty-${title.toLowerCase().replace(/ /g, '-')}`}
            >
              {/* At rest: just the piece. On hover the content dims and "Click to add" appears. */}
              <div className="flex flex-col items-center transition-opacity group-hover:opacity-30">
                <ComponentIcon kind={kind} color={th.faint} fill={th.canvas} />
                <div className="mt-4 text-[15px] font-semibold" style={{ color: th.ink, letterSpacing: '-0.01em' }}>{title}</div>
                <div className="mt-1 text-[12.5px]" style={{ color: th.faint }}>{note || 'Needed for vinyl packages'}</div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="h-9 px-5 rounded-full inline-flex items-center gap-2 text-[13px] font-semibold text-white" style={{ backgroundColor: th.blue }}>
                  <Upload className="w-4 h-4" />
                  Click to add
                </span>
              </div>
            </button>
          ))}
        </div>

      </div>
      {/* ── Add-template modal (canonized from the legacy upload popup) ──
          Scrim stays dark-tinted in both themes; the panel/menus follow theme. */}
      <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ backgroundColor: th.modalScrim, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
        <div className="rounded-2xl overflow-hidden" style={{ width: 780, backgroundColor: th.card, border: `1px solid ${th.hairline}`, boxShadow: th.modalShadow }}>
          <div className="flex items-start justify-between gap-4 px-7 pt-6">
            <div className="relative">
              {/* The tile you clicked names the modal — the chevron swaps to another 12″ type. */}
              <button
                type="button"
                className="flex items-center gap-2 hover:opacity-90"
                onClick={() => setTypeMenuOpen((v) => !v)}
                data-testid="button-modal-type"
              >
                <h2 className="text-[19px] font-semibold" style={{ color: th.ink, letterSpacing: '-0.01em' }}>
                  Center labels · 12″
                </h2>
                <NavChevron className="w-4.5 h-4.5 flex-shrink-0 transition-transform" style={{ width: 18, height: 18, color: th.subink, transform: typeMenuOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              <p className="mt-1 text-[12.5px]" style={{ color: th.subink }}>
                Drop the PDF — done.
              </p>
              {typeMenuOpen && (
                <div className="absolute left-0 z-30 mt-1.5 rounded-xl py-1.5" style={{ top: '100%', minWidth: 380, backgroundColor: th.card, boxShadow: th.popShadow, border: `1px solid ${th.hairline}` }} data-testid="menu-template-type">
                  {/* Scoped to the 12″ vinyl library you're standing in — keep in lockstep
                      with SLOT_SETS in PressTemplatesIndex. */}
                  <div className="px-3.5 pt-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: th.faint }}>Vinyl · 12″</div>
                  {[
                    { label: 'Center labels', note: 'A & B sides — one file', selected: true },
                    { label: 'Single jacket', note: 'Outer sleeve — no spine', selected: false },
                    { label: 'Widespine jacket', note: 'Outer sleeve — wide spine', selected: false },
                    { label: 'Gatefold jacket', note: 'Opens flat', selected: false },
                    { label: 'Inner sleeve', note: 'Paper', selected: false },
                    { label: 'Insert', note: '12 × 12 in · 2 pages', selected: false },
                  ].map(({ label, note, selected }) => (
                    <button key={label} type="button" className={cn('w-full flex items-center justify-between gap-3 px-3.5 py-2 text-[12.5px]', th.hoverWash)} style={{ color: th.ink }} data-testid={`option-type-${label.toLowerCase().replace(/ /g, '-')}`}>
                      <span className="flex items-baseline gap-2 whitespace-nowrap">
                        <span className="font-medium">{label}</span>
                        {note && <span className="text-[11.5px]" style={{ color: th.faint }}>{note}</span>}
                      </span>
                      {selected && <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: th.blue }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className={cn('w-8 h-8 -mr-2 rounded-full flex items-center justify-center transition-colors flex-shrink-0', th.hoverWash)} style={{ color: th.subink }} aria-label="Close" data-testid="button-close-upload">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-7 pt-5 pb-7 grid gap-6" style={{ gridTemplateColumns: '250px 1fr' }}>
            {/* Current file */}
            <div>
              {/* h-7 matches the New file header row (chips) so both boxes start at the same y */}
              <div className="h-7 flex items-center text-[11px] font-semibold uppercase tracking-wider" style={{ color: th.faint }}>Current file</div>
              {/* Preview card — matches the Artwork Check canon: preview always shown,
                  all file actions live in the "…" overflow over the art. */}
              <div className="mt-2.5 aspect-square rounded-xl flex items-center justify-center relative" style={{ backgroundColor: th.soft }} data-testid="preview-current-file">
                <button
                  type="button"
                  aria-label="File actions"
                  onClick={() => setFileMenuOpen((v) => !v)}
                  className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full inline-flex items-center justify-center hover:opacity-80 z-10"
                  style={{ backgroundColor: th.overlayBtn }}
                  data-testid="button-file-menu"
                >
                  <MoreHorizontal className="w-4 h-4" style={{ color: th.ink }} />
                </button>
                {fileMenuOpen && (
                  <div
                    className="absolute z-20 rounded-xl py-1.5 text-left"
                    style={{ top: 44, right: 10, minWidth: 180, backgroundColor: th.card, boxShadow: th.popShadow, border: `1px solid ${th.hairline}` }}
                    data-testid="menu-file-actions"
                  >
                    {/* This file is live canon — it's been used, so delete isn't offered.
                        Used files can only be archived (revision + associations kept). */}
                    {[
                      { id: 'button-replace-file-menu', Icon: Upload, label: 'Replace file' },
                      { id: 'button-archive-file-menu', Icon: Archive, label: 'Archive file' },
                    ].map(({ id, Icon, label }) => (
                      <button key={id} type="button" className={cn('w-full flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium', th.hoverWash)} style={{ color: th.ink }} data-testid={id}>
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                    <div className="px-3.5 pt-1.5 pb-1 text-[11px]" style={{ color: th.faint, borderTop: `1px solid ${th.hairline}`, marginTop: 4, maxWidth: 200 }} data-testid="text-archive-note">
                      This file has been used — it can be archived, never deleted.
                    </div>
                  </div>
                )}
                {/* Logo/preview chip keeps a WHITE circle background in both themes. */}
                <span className="rounded-full overflow-hidden" style={{ width: 150, height: 150, backgroundColor: '#fff', border: `1px solid ${th.logoRing}` }}>
                  <img src={gtPreviewTemplate} alt="Current template — cropped from the GT PREVIEW layer" className="w-full h-full object-cover" data-testid="img-upload-current" />
                </span>
              </div>
              <div className="mt-3 text-center">
                <div className="text-[12.5px] font-medium break-all" style={{ color: th.ink }}>12-LBL100M-2 … R072326.pdf</div>
                <div className="mt-0.5 text-[11.5px]" style={{ color: th.faint }}>Live canon · R-072326</div>
                <div className="mt-0.5 text-[11.5px] tabular-nums" style={{ color: th.faint }}>165 × 195 mm · 2 pages · 350 PPI</div>
              </div>
            </div>

            {/* Upload side */}
            <div className="flex flex-col">
              {/* Source toggle — canon segmented control; the drop zone stretches to
                  match the left column (box top through the 350 PPI baseline). */}
              <div className="h-7 flex items-center justify-between gap-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: th.faint }}>New file</div>
                <div className="inline-flex items-center rounded-full" style={{ padding: 3, backgroundColor: th.soft }} role="tablist" aria-label="File source" data-testid="tabs-file-source">
                  {(['Upload file', 'Paste a URL'] as const).map((label) => {
                    const on = fileSource === label;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setFileSource(label)}
                        className="rounded-full transition-colors"
                        style={{
                          padding: '4px 14px', fontSize: 12,
                          fontWeight: on ? 600 : 500,
                          color: on ? th.ink : th.faint,
                          backgroundColor: on ? th.pillActive : 'transparent',
                          boxShadow: on ? th.pillShadow : 'none',
                          cursor: 'pointer',
                        }}
                        data-testid={`tab-source-${label === 'Upload file' ? 'upload' : 'url'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {fileSource === 'Upload file' ? (
                <button type="button" className={cn('mt-2.5 w-full flex-1 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-colors', th.tileHover)} style={{ border: `1.5px dashed ${th.dashedBorder}`, padding: '20px' }} data-testid="button-upload-drop">
                  <CloudUpload className="w-5 h-5" style={{ color: th.subink }} />
                  <span className="text-[13.5px] font-medium" style={{ color: th.ink }}>Drag a file here, or click to pick</span>
                  <span className="text-[12px]" style={{ color: th.faint }}>Press-ready PDF · validated automatically</span>
                </button>
              ) : (
                <div className="mt-2.5 w-full flex-1 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ border: `1.5px dashed ${th.dashedBorder}`, padding: '20px 28px' }} data-testid="panel-paste-url">
                  <div className="w-full flex items-center gap-2.5" style={{ maxWidth: 420 }}>
                    <input readOnly placeholder="https://… Dropbox, Drive, WeTransfer" className={cn('flex-1 h-9 px-3.5 rounded-full text-[12.5px] focus:outline-none', th.searchPlaceholder)} style={{ backgroundColor: th.soft, border: `1px solid ${th.hairline}`, color: th.ink }} />
                    <button type="button" className="h-9 px-4 rounded-full text-[12.5px] font-semibold flex-shrink-0" style={{ backgroundColor: th.soft, color: th.subink }} data-testid="button-use-url">Use URL</button>
                  </div>
                  <span className="text-[12px]" style={{ color: th.faint }}>We fetch the PDF from the link · validated automatically</span>
                </div>
              )}

              {/* File facts now live under the preview on the left — read-only,
                  part of the file's record card, no section label needed. */}
            </div>
          </div>
        </div>
      </div>

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: th.card, color: th.ink, border: `1px solid ${th.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}
