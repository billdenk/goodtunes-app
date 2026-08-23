// ArtistReleaseArtTab — CALIFORNIALAND release detail, Vinyl tab with the ART
// sub-chip active. Fresh pass on the artist art surface (Bill, Aug 16 2026):
// "drag art onto blocks" — artists never touch a dieline. One drop zone per
// component block; the system checks each file instantly (format, size, PPI,
// CMYK) against the press's certified template. Downloading the PDF template
// stays available as the quiet secondary path for artists with designers.
//
// Shell copied from ArtistReleaseVinylTab (canon artist rail — Dashboard /
// Catalog{Releases,People} / Audience / Acquisition / Orders / Buyers /
// Referrals / Shopify / Reports; no Overview) — NOW THEMED: the account
// dropdown carries the canon Appearance control (Light / Dark / System,
// matching Otis's live admin menu — Bill, Aug 16 2026) and it actually
// re-themes the page. Artist light stays the default; dark is charcoal
// (never fan navy). One filled blue per screen, statuses word + icon never
// color alone, "estimate" never "quote", real GoodDeed®.
//
// Awaiting Otis's #3145 art-blocks spec brief — real geometry numbers, per-press
// check semantics, and bleed-toggle behavior land when the brief arrives; the
// numbers below are believable placeholders in the meantime.

import { useEffect, useState, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Gift,
  Megaphone,
  ShoppingBag,
  UserCheck,
  Store,
  BarChart3,
  Bell,
  MessageSquarePlus,
  UserPen,
  LogOut,
  Lock,
  ChevronDown,
  Check,
  X,
  Download,
  UploadCloud,
  RefreshCw,
  FileImage,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { ChevronDown as NavChevron } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLabelLogo from '../assets/mrp-logo.svg';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Brand tokens — light (artist default) + charcoal dark ──────────
const BLUE = '#319ED8';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

const THEMES = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    soft: '#f0f0f2',
    hoverWash: 'hover:bg-slate-200',
    hoverCard: 'hover:bg-slate-100',
    headerBg: 'rgba(255,255,255,0.72)',
    ready: '#1c8a5b',
    warn: '#c98a00',
    fail: '#c93a3a',
    passBg: '#eaf5ef',
    failBg: '#fbeeee',
    warnBg: '#fbf4e8',
    warnBorder: '#f0dfc0',
    warnInk: '#8a6100',
    passBorder: '#cfe8db',
    dropEmpty: '#fcfcfd',
    dropFill: '#fafafa',
    dashed: '#c9c9cf',
    dot: '#d0d0d5',
    logoFilter: 'none',
  },
  dark: {
    canvas: '#161618',
    rail: '#1c1c1f',
    card: '#232327',
    ink: '#f5f5f7',
    subink: '#a1a1a6',
    faint: '#6e6e73',
    hairline: '#2e2e33',
    soft: '#2a2a2f',
    hoverWash: 'hover:bg-white/5',
    hoverCard: 'hover:bg-white/10',
    headerBg: 'rgba(22,22,24,0.72)',
    ready: '#3fbf82',
    warn: '#f59e0b',
    fail: '#e5484d',
    passBg: 'rgba(63,191,130,0.12)',
    failBg: 'rgba(229,72,77,0.12)',
    warnBg: 'rgba(245,158,11,0.10)',
    warnBorder: 'rgba(245,158,11,0.28)',
    warnInk: '#f2b23e',
    passBorder: 'rgba(63,191,130,0.30)',
    dropEmpty: '#1d1d21',
    dropFill: '#202024',
    dashed: '#46464d',
    dot: '#46464d',
    logoFilter: 'invert(1)', // only dark logo assets exist
  },
};

type Theme = (typeof THEMES)['light'];
type Mode = 'light' | 'dark' | 'system';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const PARTNER_NAME = 'Memphis Record Pressing';

// ═══════════════════════════════════════════════════════════════════
// SHELL (structure from ArtistReleaseVinylTab, themed)
// ═══════════════════════════════════════════════════════════════════
type NavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean; route?: string };

// Canon rail (Bill + Claude, Aug 16 2026): Catalog group killed — Releases is
// top-level; People renamed Team, pinned at the bottom of the rail (moves into
// Settings if/when Settings exists on the artist side). Order logic: create
// first, know your fans second, commerce third, analysis fourth, admin last.
const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Releases', icon: Disc3, active: true, route: 'ArtistReleasesIndex' },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: Gift },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, active, route, t }: NavItem & { t: Theme }) {
  return (
    <a
      href={route ? `#/${route}` : '#'}
      onClick={route ? undefined : (e) => e.preventDefault()}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !active && t.hoverWash)}
      style={{ fontWeight: active ? 600 : 500, color: active ? t.ink : t.subink, backgroundColor: active ? t.card : undefined, boxShadow: active ? PILL_SHADOW : undefined }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}


const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS';

// Canon account dropdown — mirrors Otis's live admin menu (name/email header,
// Edit profile, Invite teammate, Appearance segmented Light/Dark/System, Sign
// out). The Appearance control is LIVE: it drives the page theme.
function UserMenu({ t, mode, setMode }: { t: Theme; mode: Mode; setMode: (m: Mode) => void }) {
  const APPEARANCE: Array<{ id: Mode; icon: typeof Sun; label: string }> = [
    { id: 'light', icon: Sun, label: 'Light' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'system', icon: Monitor, label: 'System' },
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow"
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, color: t.ink }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {([{ label: 'Edit profile', icon: UserPen }, { label: 'Invite teammate', icon: UserPlus }] as const).map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.hoverCard)}
                style={{ color: t.ink }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        {/* Appearance — canon segmented control, live */}
        <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <span className="text-[13px]" style={{ color: t.ink }}>Appearance</span>
          <div className="flex items-center rounded-full" style={{ background: t.soft, padding: 2 }} role="radiogroup" aria-label="Appearance">
            {APPEARANCE.map(({ id, icon: Icon, label }) => {
              const active = id === mode;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={label}
                  title={label}
                  onClick={() => setMode(id)}
                  className="h-7 px-3 rounded-full inline-flex items-center justify-center transition-all text-[12px]"
                  style={{ background: active ? t.card : 'transparent', boxShadow: active ? PILL_SHADOW : undefined, color: active ? t.ink : t.faint, fontWeight: active ? 600 : 400 }}
                  data-testid={`appearance-${id}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.hoverCard)}
            style={{ color: t.ink }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PressShell({ children, t, mode, setMode }: { children: ReactNode; t: Theme; mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
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
          <img
            src={niinaPhoto}
            alt="Niina Soleil"
            className="h-9 w-9 rounded-full object-cover flex-shrink-0 ring-1 ring-black/10"
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            Niina Soleil
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverCard)}
            style={{ color: t.subink }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} mode={mode} setMode={setMode} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className="w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none"
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }}
                placeholder="Search…"
                readOnly
              />
              {/* Canon: ⌘K sits flush right inside the search bar */}
              <span
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium rounded-md"
                style={{ color: t.faint, background: t.soft, padding: '2px 6px' }}
                aria-hidden
              >
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {NAV_MAIN.map((item) => <NavRow key={item.label} {...item} t={t} />)}
          </nav>
          <div className="px-2.5 pb-2">
            <NavRow label="Team" icon={UserPlus} t={t} />
          </div>
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

// ═══════════════════════════════════════════════════════════════════
// RELEASE HEADER (shared across format tabs — structure from VinylTab)
// ═══════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'overview', label: 'Overview' },
  { id: 'music', label: 'Audio' },
  { id: 'vinyl', label: 'Art' },
  { id: 'sales', label: 'Sales' },
];

function ReleaseHeader({ activeTab, t }: { activeTab: string; t: Theme }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
        <a href="#/ArtistReleasesIndex" className="transition-colors hover:opacity-80" data-testid="crumb-releases">Releases</a>
        <span style={{ color: t.dot }}>›</span>
        <span style={{ color: t.subink }} data-testid="crumb-current">CALIFORNIALAND</span>
      </div>

      <div className="flex items-start justify-between gap-6 flex-wrap" style={{ marginTop: 14 }}>
        <div className="flex items-start gap-5 min-w-0">
          <div
            className="rounded-2xl overflow-hidden flex-shrink-0"
            style={{
              width: 96, height: 96,
              background: 'linear-gradient(150deg, #ff8a5c 0%, #d0468f 55%, #5b3b9e 100%)',
              boxShadow: PILL_SHADOW,
            }}
          >
            <img src={californialandCover} alt="CALIFORNIALAND cover" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5" style={{ marginBottom: 6 }}>
              <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: t.subink }}>LP · NIINA SOLEIL</span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full text-[11px] font-semibold"
                style={{ padding: '3px 9px', background: `${BLUE}14`, color: BLUE }}
                data-testid="chip-preview"
              >
                <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: BLUE }} />
                PREVIEW
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full text-[11px] font-semibold"
                style={{ padding: '3px 9px', background: t.soft, color: t.subink }}
                data-testid="chip-locked"
              >
                <Lock className="w-3 h-3" />
                Locked
              </span>
            </div>
            <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.03, color: t.ink }}>
              CALIFORNIALAND
            </h1>
            <p className="text-[13.5px]" style={{ marginTop: 8, color: t.subink }}>
              2026 · 12 tracks
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="status-control"
          className="inline-flex items-center gap-2.5 rounded-full transition-colors flex-shrink-0"
          style={{ padding: '8px 14px', border: `1px solid ${t.hairline}`, backgroundColor: t.card }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Status</span>
          <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: t.ink }}>
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, border: `2px solid ${t.warn}` }} />
            At press
          </span>
          <ChevronDown className="w-3.5 h-3.5" style={{ color: t.faint }} />
        </button>
      </div>

      <div className="flex items-center gap-1" style={{ marginTop: 22, borderBottom: `1px solid ${t.hairline}` }}>
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`tab-${tab.id}`}
              className="relative inline-flex items-center gap-2 text-[14px] transition-colors"
              style={{
                padding: '10px 14px',
                fontWeight: active ? 600 : 500,
                color: active ? t.ink : t.subink,
              }}
            >
              {!active && <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: t.dot }} />}
              {tab.label}
              {active && (
                <span aria-hidden className="absolute left-0 right-0" style={{ bottom: -1, height: 2, background: BLUE, borderRadius: 2 }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ART TAB — drag-art-onto-blocks builder
// ═══════════════════════════════════════════════════════════════════
const SUB_CHIPS = [
  { id: 'package', label: 'Package' },
  { id: 'art', label: 'Art' },
  { id: 'prep', label: 'Prep' },
  { id: 'payments', label: 'Payments' },
];

// Check rows mirror the press-side template test (format · size · resolution ·
// color). Numbers here are placeholders until Otis's #3145 brief lands.
type CheckRow = { label: string; value: string; verdict: 'pass' | 'fail' };
type BlockState =
  | { kind: 'pass'; file: string; checks: CheckRow[] }
  | { kind: 'fail'; file: string; checks: CheckRow[] }
  | { kind: 'empty' };

type ArtBlock = {
  id: string;
  title: string;
  hint: string;      // finished size in plain words
  shape: 'square' | 'circle' | 'tall';
  state: BlockState;
};

const MOCK_BLOCKS: ArtBlock[] = [
  {
    id: 'cover',
    title: 'Cover · 12″ jacket',
    hint: 'Front · back · spine — 317.5 × 317.5 mm finished + 3 mm bleed',
    shape: 'tall',
    state: {
      kind: 'pass',
      file: 'CALIFORNIALAND_jacket_v4.png',
      checks: [
        { label: 'Format', value: 'PNG', verdict: 'pass' },
        { label: 'Size', value: '323.5 × 323.5 mm — covers trim + bleed', verdict: 'pass' },
        { label: 'Resolution', value: '347 PPI', verdict: 'pass' },
        { label: 'Color', value: 'CMYK', verdict: 'pass' },
      ],
    },
  },
  {
    id: 'labels',
    title: 'Center labels · Disk 1',
    hint: 'Side A + Side B — 100 mm circle with center hole',
    shape: 'circle',
    state: {
      kind: 'fail',
      file: 'labels_draft.jpg',
      checks: [
        { label: 'Format', value: 'JPEG', verdict: 'pass' },
        { label: 'Size', value: '100 mm circle', verdict: 'pass' },
        { label: 'Resolution', value: '72 PPI — needs 300 or better', verdict: 'fail' },
        { label: 'Color', value: 'RGB — flagged, not converted silently', verdict: 'fail' },
      ],
    },
  },
  {
    id: 'sleeve',
    title: 'Inner sleeve',
    hint: 'Both faces — 302 × 302 mm finished + 3 mm bleed',
    shape: 'square',
    state: { kind: 'empty' },
  },
];

function VerdictChip({ kind, t }: { kind: 'pass' | 'fail' | 'empty'; t: Theme }) {
  if (kind === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.passBg, color: t.ready }} data-testid="chip-block-pass">
        <Check className="w-3 h-3" strokeWidth={3} /> Looks good
      </span>
    );
  }
  if (kind === 'fail') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.failBg, color: t.fail }} data-testid="chip-block-fail">
        <X className="w-3 h-3" strokeWidth={3} /> Needs fixes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.soft, color: t.subink }} data-testid="chip-block-waiting">
      <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${t.subink}` }} />
      Waiting for art
    </span>
  );
}

// The drop face — shape mirrors the physical component so the artist always
// knows what they're dropping onto (circle for labels, square for sleeve, the
// jacket shows front/back/spine panes).
function DropFace({ block, t }: { block: ArtBlock; t: Theme }) {
  const filled = block.state.kind !== 'empty';
  const outline = block.state.kind === 'fail' ? t.fail : block.state.kind === 'pass' ? t.ready : t.dashed;

  const face = (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: block.shape === 'circle' ? 168 : 188,
        height: block.shape === 'circle' ? 168 : block.shape === 'tall' ? 148 : 168,
        borderRadius: block.shape === 'circle' ? '50%' : 12,
        border: `1.5px ${filled ? 'solid' : 'dashed'} ${outline}`,
        background: filled ? t.dropFill : t.dropEmpty,
        overflow: 'hidden',
      }}
    >
      {block.id === 'cover' && filled ? (
        <img src={californialandCover} alt="" aria-hidden className="w-full h-full object-cover" style={{ opacity: 0.9 }} />
      ) : filled ? (
        <FileImage className="w-8 h-8" style={{ color: outline }} />
      ) : (
        <UploadCloud className="w-8 h-8" style={{ color: t.faint }} />
      )}
      {block.shape === 'circle' && (
        <span aria-hidden className="absolute rounded-full" style={{ width: 14, height: 14, background: t.card, border: `1.5px solid ${outline}` }} />
      )}
    </div>
  );
  return <div className="flex items-center justify-center" style={{ padding: '18px 0 6px' }}>{face}</div>;
}

function BlockCard({ block, t }: { block: ArtBlock; t: Theme }) {
  const s = block.state;
  return (
    <div className="rounded-2xl flex flex-col" style={{ border: `1px solid ${t.hairline}`, padding: 18, backgroundColor: t.card }} data-testid={`block-${block.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold" style={{ color: t.ink }}>{block.title}</div>
          <div className="text-[11.5px] mt-0.5" style={{ color: t.faint }}>{block.hint}</div>
        </div>
        <VerdictChip kind={s.kind} t={t} />
      </div>

      <DropFace block={block} t={t} />

      {s.kind === 'empty' ? (
        <div className="text-center" style={{ paddingBottom: 6 }}>
          <div className="text-[13px] font-medium" style={{ color: t.ink }}>Drag your art here</div>
          <div className="text-[12px] mt-0.5" style={{ marginBottom: 12, color: t.subink }}>JPEG or PNG · we check it instantly</div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full text-[13px] font-semibold text-white transition-transform hover:-translate-y-px"
            style={{ padding: '8px 16px', background: BLUE, boxShadow: PILL_SHADOW }}
            data-testid={`button-choose-file-${block.id}`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Choose a file
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
            <span className="text-[12px] font-medium truncate" style={{ color: t.subink }} title={s.file}>{s.file}</span>
            <button
              type="button"
              className={cn('inline-flex items-center gap-1 rounded-full text-[12px] font-medium flex-shrink-0 transition-colors', t.hoverCard)}
              style={{ padding: '4px 10px', color: t.subink }}
              data-testid={`button-replace-${block.id}`}
            >
              <RefreshCw className="w-3 h-3" />
              Replace
            </button>
          </div>
          <div className="rounded-xl" style={{ border: `1px solid ${t.hairline}` }}>
            {s.checks.map((c, i) => (
              <div key={c.label} className="flex items-center gap-2.5 px-3" style={{ height: 34, borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}>
                {c.verdict === 'pass'
                  ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.ready }} strokeWidth={3} />
                  : <X className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.fail }} strokeWidth={3} />}
                <span className="text-[12px] font-semibold flex-shrink-0" style={{ width: 76, color: t.ink }}>{c.label}</span>
                <span className="text-[12px] truncate" style={{ color: c.verdict === 'fail' ? t.fail : t.subink }} title={c.value}>{c.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ArtistReleaseArtTab() {
  const [subChip, setSubChip] = useState('art');
  // Appearance canon (Bill, Aug 16 2026): DARK is the default, and the chosen
  // mode persists across all mocks via localStorage.
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const saved = window.localStorage.getItem('gt-appearance');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch { /* ignore */ }
    return 'dark';
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try { window.localStorage.setItem('gt-appearance', m); } catch { /* ignore */ }
  };
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const t: Theme = mode === 'dark' || (mode === 'system' && systemDark) ? THEMES.dark : THEMES.light;

  const passCount = MOCK_BLOCKS.filter((b) => b.state.kind === 'pass').length;
  const total = MOCK_BLOCKS.length;
  const allPass = passCount === total;

  return (
    <PressShell t={t} mode={mode} setMode={setMode}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 32, paddingBottom: 96 }}>
        <ReleaseHeader activeTab="vinyl" t={t} />

        {/* Sub-chips row + press attribution */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 24 }}>
          <div className="flex items-center gap-2 rounded-full" style={{ background: t.soft, padding: 3 }}>
            {SUB_CHIPS.map((c) => {
              const active = c.id === subChip;
              return (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`chip-sub-${c.id}`}
                  onClick={() => setSubChip(c.id)}
                  className="rounded-full text-[13px] transition-all"
                  style={{
                    padding: '6px 16px',
                    fontWeight: active ? 600 : 500,
                    color: active ? t.ink : t.subink,
                    background: active ? t.card : 'transparent',
                    boxShadow: active ? PILL_SHADOW : undefined,
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-2 text-[12.5px]" style={{ color: t.subink }}>
              <span className="h-6 w-6 rounded-full bg-white ring-1 ring-black/10 flex items-center justify-center flex-shrink-0 p-[3px]">
                <img src={mrpLabelLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" style={{ filter: 'brightness(0)' }} />
              </span>
              Press: <span className="font-semibold" style={{ color: t.ink }}>{PARTNER_NAME}</span>
            </span>
          </div>
        </div>

        {/* Intro strip — the promise, plus the quiet designer path */}
        <div className="flex items-end justify-between gap-6 flex-wrap" style={{ marginTop: 26 }}>
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Drop your art. We handle the templates.</h2>
            <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
              Drag an image onto each piece below — we instantly check it against {PARTNER_NAME}&rsquo;s
              certified template: right size, print colors (CMYK), and sharp enough to press (300 PPI).
            </p>
          </div>
          {/* Working with a designer? The classic PDF-template path stays, quiet. */}
          <button
            type="button"
            className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium transition-colors flex-shrink-0', t.hoverCard)}
            style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}`, background: t.card }}
            data-testid="button-download-templates"
          >
            <Download className="w-3.5 h-3.5" />
            Working with a designer? Download the PDF templates
          </button>
        </div>

        {/* Readiness strip — word + icon, never color alone */}
        <div
          className="flex items-center gap-2.5 rounded-xl"
          style={{ marginTop: 18, padding: '10px 16px', background: allPass ? t.passBg : t.warnBg, border: `1px solid ${allPass ? t.passBorder : t.warnBorder}` }}
          data-testid="banner-art-readiness"
        >
          {allPass
            ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: t.ready }} strokeWidth={3} />
            : <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, border: `2px solid ${t.warn}` }} />}
          <span className="text-[13px] font-semibold" style={{ color: allPass ? t.ready : t.warnInk }}>
            {allPass ? 'All art looks good — ready to send to press' : `${passCount} of ${total} pieces look good`}
          </span>
          <span className="text-[12.5px]" style={{ color: t.subink }}>
            {allPass ? '' : '— fix the flagged file and drop art on the empty piece'}
          </span>
        </div>

        {/* The blocks */}
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18 }}>
          {MOCK_BLOCKS.map((b) => <BlockCard key={b.id} block={b} t={t} />)}
        </div>

        <p className="text-[12px]" style={{ marginTop: 16, color: t.faint, lineHeight: 1.5 }}>
          When everything looks good, we place your art into {PARTNER_NAME}&rsquo;s real press template for you —
          you never touch a dieline. Not sure about a check? Send it anyway and we&rsquo;ll review it with the press.
        </p>
      </div>
    </PressShell>
  );
}

export default ArtistReleaseArtTab;
