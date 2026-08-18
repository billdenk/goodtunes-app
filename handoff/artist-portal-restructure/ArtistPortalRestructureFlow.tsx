// ArtistPortalRestructureFlow — ONE-OFF exploration of the Aug 16 2026 Artist
// Portal Restructure brief (Claude, from Bill / GoodTunes). Not a handoff file,
// not canon — a stitched "flow walk" that renders the six Part-7 scenes behind
// a scene stepper so Bill can click through the restructure end to end.
//
// IRON RULE OBSERVED: nothing here is invented. Every token, every shell, every
// art block, every CTA pill, every status word+icon is COPIED VERBATIM from the
// existing artist mocks:
//   - THEMES map, PressShell chrome, ReleaseHeader, art slots (Looks good /
//     Needs fixes / Waiting for art), VerdictChip, DropFace, BlockCard, check
//     rows  → ArtistReleaseArtTab.tsx
//   - Releases wall cards, RollupBadge, StatusGlyph, ArtistShell rail
//     → ArtistReleasesIndex.tsx / ArtistReleaseDetail.tsx
//   - dark artist charcoal shell → ArtistReleasePriceGoodDeed.tsx
//   - stitched flow-walk chrome (scene list, click-through) → ArtistEstimatesFlow.tsx
//   - storefront choice copy → ArtistProjectSellChoice.tsx / ArtistStorefrontMoment
//   - CTA pill weight → PressQuoteBuilder.tsx canon "Send estimate" pill
//
// Canon held: dark artist charcoal (never fan navy), "estimate" never "quote",
// one filled #319ED8 blue max per scene, statuses = word + icon never color
// alone (founder is colorblind), no emojis, real GoodDeed®, sentence case,
// commas in every dollar amount, CTAs verbatim from the PressQuoteBuilder pill.

import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Gift,
  ShoppingBag,
  Store,
  BarChart3,
  Bell,
  Upload,
  ImagePlus,
  LayoutTemplate,
  MessageSquarePlus,
  UserPen,
  LogOut,
  Lock,
  Eye,
  ChevronRight,
  Check,
  X,
  Download,
  UploadCloud,
  FileImage,
  Sun,
  Moon,
  Monitor,
  Plus,
  Link2,
  Copy,
  ExternalLink,
  Mail,
  ArrowRight,
  Settings,
  Circle,
  Clock,
  EyeOff,
  BadgeCheck,
  MoreHorizontal,
  Pencil,
  History,
  PenLine,
  PaintBucket,
  ZoomIn,
  ChevronDown,
  Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import shopifyLogo from '../assets/shopify-logo.png';
import mrpLabelLogo from '../assets/mrp-logo.svg';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';
import mrpTemplate from '../assets/mrp-jacket-template.png';

// ═══════════════════════════════════════════════════════════════════
// TOKENS — copied verbatim from ArtistReleaseArtTab.tsx (light + charcoal dark)
// ═══════════════════════════════════════════════════════════════════
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
    wordmarkFilter: 'none',
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
    logoFilter: 'invert(1)',
    // GoodTunes wordmark on dark — apple-canon CSS-invert to white (canon
    // permits CSS invert for the single-color GoodTunes wordmark only).
    wordmarkFilter: 'invert(1) brightness(2)',
  },
};

type Theme = (typeof THEMES)['light'];
type Mode = 'light' | 'dark' | 'system';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const PARTNER_NAME = 'Memphis Record Pressing';

// ═══════════════════════════════════════════════════════════════════
// MOCK_ DATA — all dummy content lives here so Otis can swap it for real
// product data in one place. JSX below references these; no literals inline.
// ═══════════════════════════════════════════════════════════════════
const MOCK_USER = { firstName: 'Niina', email: 'niina@niinasoleil.com', initials: 'NS', fullName: 'Niina Soleil' };

// ═══════════════════════════════════════════════════════════════════
// RAIL — new order per Part 1 (Audience/Acquisition/Buyers folded into Reports)
// ═══════════════════════════════════════════════════════════════════
type NavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean; scene?: SceneId };

// Part 1: Dashboard · Releases · Orders · Reports · Shopify · Referrals in the
// main list. Settings is NOT in this list — per the cross-vendor rail standard
// (Bill) it is PINNED to the bottom of the rail, and Team lives INSIDE Settings
// as a child section. Audience / Acquisition / Buyers are GONE — folded into
// Reports as tabs. The Shopify item is EARNED: it only appears once the artist
// has connected a Shopify store. Niina is connected on CALIFORNIALAND, so it
// shows here, below Reports.
const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Releases', icon: Disc3, active: true, scene: 'wall' },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Reports', icon: BarChart3, scene: 'reports' },
  { label: 'Shopify', icon: Store },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, active, scene, t, onNav }: NavItem & { t: Theme; onNav?: (s: SceneId) => void }) {
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); if (scene && onNav) onNav(scene); }}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !active && t.hoverWash)}
      style={{ fontWeight: active ? 600 : 500, color: active ? t.ink : t.subink, backgroundColor: active ? t.card : undefined, boxShadow: active ? PILL_SHADOW : undefined }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

// Account dropdown — copied verbatim from ArtistReleaseArtTab.tsx.
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
          <img src={niinaPhoto} alt={MOCK_USER.initials} className="w-full h-full object-cover" />
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
          <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{MOCK_USER.firstName}</div>
          <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{MOCK_USER.email}</div>
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
                  className="w-8 h-7 rounded-full inline-flex items-center justify-center transition-all"
                  style={{ background: active ? t.card : 'transparent', boxShadow: active ? PILL_SHADOW : undefined, color: active ? t.ink : t.faint }}
                  data-testid={`appearance-${id}`}
                >
                  <Icon className="w-3.5 h-3.5" />
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

// PressShell chrome — copied verbatim from ArtistReleaseArtTab.tsx, rail swapped
// to the new NAV_MAIN order (Team stays bottom-pinned).
function ArtistShell({ children, t, mode, setMode, onNav }: { children: ReactNode; t: Theme; mode: Mode; setMode: (m: Mode) => void; onNav: (s: SceneId) => void }) {
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
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
          <img src={niinaPhoto} alt={MOCK_USER.fullName} className="h-9 w-9 rounded-full object-cover flex-shrink-0 ring-1 ring-black/10" />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>{MOCK_USER.fullName}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" variant="ghost" className="rounded-full" style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }} data-testid="button-feedback">
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverCard)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} mode={mode} setMode={setMode} />
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
            {NAV_MAIN.map((item) => <NavRow key={item.label} {...item} t={t} onNav={onNav} />)}
          </nav>
          {/* Settings pinned to the rail bottom (cross-vendor rail standard).
              Team is no longer a rail row — it lives inside Settings. */}
          <div className="px-2.5 pb-2">
            <NavRow label="Settings" icon={Settings} scene="settings" t={t} onNav={onNav} />
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

// ═══════════════════════════════════════════════════════════════════
// Shared small primitives — copied grammar from source mocks
// ═══════════════════════════════════════════════════════════════════

// Canon page-header / next-step action pill. NOT filled blue (Bill, round 6 —
// now in apple-canon.md): page-header actions are quiet dark-gray-outline pills.
// Filled #319ED8 blue is reserved for confirms that have earned it (the dialog
// rule) — nothing on the wall/dashboard/detail views is big blue.
// Canon page-header / next-step action — Apple-like quiet pill (Bill, round 6):
// dark-gray hairline outline (t.dot, stronger than t.hairline), ink text + glyph,
// NO fill, rounded-full. Filled blue is reserved for confirms that earn it (the
// dialog rule) — nothing on the wall/dashboard/detail views is big blue.
function CanonPill({ label, onClick, icon: Icon, t }: { label: string; onClick?: () => void; icon?: typeof ArrowRight; t: Theme }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-2 rounded-full font-semibold transition-colors', t.hoverCard)}
      style={{ background: 'transparent', color: t.ink, height: 44, padding: '0 26px', fontSize: 13, border: `1px solid ${t.dot}` }}
      data-testid={`cta-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {Icon && <Icon className="w-4 h-4" style={{ color: t.subink }} />}
      {label}
    </button>
  );
}

// Canon quiet secondary — a hairline pill (rounded-full, subink text + icon,
// transparent with a light hover tint), NOT a second filled blue. Used when a
// secondary/prerequisite action sits on a screen that already has its one
// filled-blue primary elsewhere (apple-canon one-blue-max rule).
function QuietPill({ label, onClick, icon: Icon, t }: { label: string; onClick?: () => void; icon?: typeof ArrowRight; t: Theme }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('inline-flex items-center gap-2 rounded-full font-medium transition-colors', t.hoverCard)}
      style={{ height: 44, padding: '0 24px', fontSize: 14.5, color: t.ink, border: `1px solid ${t.hairline}`, background: 'transparent' }}
      data-testid={`cta-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENE 1 — Releases wall with the new rail, card badges, channel glyph, money flag
// (card grammar copied from ArtistReleasesIndex.tsx)
// ═══════════════════════════════════════════════════════════════════
type Channel = 'goodtunes' | 'shopify' | null;
type WallCard = {
  id: string;
  name: string;
  year: string;
  cover?: string;
  badge: string;          // derived from pill states, per Part 3
  channel: Channel;
  moneyFlag?: string;     // only when action needed
  artFlag?: string;       // small cover chip when print art is still needed
  dimmed?: boolean;
  needsArt?: boolean;     // first-run: no print art yet — cover overflow offers sources
};

// The active release the walk drills into (CALIFORNIALAND). Facts here feed the
// breadcrumb, the Details tab, and the Store/Payments copy.
const MOCK_RELEASE = {
  id: 'californialand',
  title: 'CALIFORNIALAND',
  artist: 'Niina Soleil',
  format: 'LP',
  year: '2026',
  tracks: '12 tracks',
  visibility: 'Preview',
  editing: 'Locked',
};

const MOCK_WALL_CARDS: WallCard[] = [
  { id: 'californialand', name: 'CALIFORNIALAND', year: '2026', cover: californialandCover, badge: 'Digital live · Vinyl at press · CD draft', channel: 'goodtunes', moneyFlag: 'Balance due Sep 4' },
  { id: 'goldenrod', name: 'GOLDENROD', year: '2026', badge: 'No print art yet — start from the blank template', channel: 'shopify', needsArt: true, artFlag: 'Needs print-ready art' },
  { id: 'hope', name: 'HOPE', year: '2025', badge: 'Digital live', channel: 'goodtunes' },
  { id: 'midnight', name: 'MIDNIGHT POSTCARDS', year: '2027', badge: 'Vinyl draft · CD draft', channel: null },
  { id: 'paper', name: 'PAPER LANTERNS', year: '2019', badge: 'Sunset', channel: 'goodtunes', dimmed: true },
  { id: 'first-light', name: 'FIRST LIGHT', year: '2017', badge: 'Sunset', channel: 'shopify', dimmed: true },
];

// Channel — logo only, no name text. Larger glyph, monochrome WHITE on dark
// (brightness(0) invert(1)) so GoodTunes and Shopify read the same regardless of
// their source colors.
const WHITE_GLYPH = 'brightness(0) invert(1)';
function ChannelGlyph({ channel }: { channel: Channel }) {
  if (channel === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: '#fff', opacity: 0.55 }} data-testid="channel-none">
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} /> No channel yet
      </span>
    );
  }
  if (channel === 'shopify') {
    return (
      <span className="inline-flex items-center" data-testid="channel-shopify" aria-label="Shopify">
        <img src={shopifyLogo} alt="Shopify" className="h-4 w-auto" style={{ filter: WHITE_GLYPH }} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" data-testid="channel-goodtunes" aria-label="GoodTunes®">
      <img src={goodtunesLogo} alt="GoodTunes®" className="h-4 w-auto" style={{ filter: WHITE_GLYPH }} />
    </span>
  );
}

// Cover overflow menu items for a release that still needs print art — how the
// artist would set the cover once panels exist. Mock dead-ends.
const COVER_MENU: Array<{ id: string; label: string; icon: typeof ArrowRight }> = [
  { id: 'front', label: 'Use Front panel as cover', icon: ImagePlus },
  { id: 'back', label: 'Use Back panel as cover', icon: ImagePlus },
  { id: 'upload', label: 'Upload your own thumbnail', icon: Upload },
];

function WallCardTile({ card, t, onOpen }: { card: WallCard; t: Theme; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="group rounded-3xl overflow-hidden cursor-pointer flex flex-col"
      style={{
        backgroundColor: t.card,
        border: `1px solid ${t.hairline}`,
        boxShadow: hover ? '0 12px 32px rgba(0,0,0,0.5)' : 'none',
        transform: hover ? 'translateY(-3px)' : 'none',
        opacity: card.dimmed ? 0.6 : 1,
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      data-testid={`row-release-${card.id}`}
    >
      <div className="relative w-full" style={{ aspectRatio: '1 / 1', backgroundColor: t.soft }}>
        {card.cover ? (
          <img src={card.cover} alt={`${card.name} artwork`} className="absolute inset-0 w-full h-full object-cover" style={{ filter: card.dimmed ? 'saturate(0.4)' : 'none' }} draggable={false} />
        ) : (
          /* No cover yet — the same quiet placeholder tile every coverless card
             uses (Disc3 on the soft field). No dashed drop-zone: whether art is
             missing is carried by the small chip, not the cover treatment. */
          <div className="absolute inset-0 flex items-center justify-center" data-testid={`cover-placeholder-${card.id}`}>
            <Disc3 style={{ width: 56, height: 56, color: t.faint, strokeWidth: 1.25 }} />
          </div>
        )}

        {/* Art-needed chip — same treatment as the money chip, top-left so it
            doesn't collide with the overflow. Word + icon, never color alone. */}
        {card.artFlag && (
          <div
            className="absolute inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold"
            style={{ top: 10, left: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', backdropFilter: 'blur(6px)' }}
            data-testid={`art-flag-${card.id}`}
            title="This release has no print-ready art yet"
          >
            <FileImage className="w-3.5 h-3.5 flex-shrink-0" />
            {card.artFlag}
          </div>
        )}

        {/* Money flag — overlaid on the cover art, top right. Wording is
            unambiguous: the artist pays GoodTunes for manufacturing milestones. */}
        {card.moneyFlag && (
          <div
            className="absolute inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold"
            style={{ top: 10, right: 10, padding: '4px 10px', background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.16)', color: '#fff', backdropFilter: 'blur(6px)' }}
            data-testid={`money-flag-${card.id}`}
            title="You owe GoodTunes® for this release"
          >
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `2px solid ${t.warn}` }} />
            {card.moneyFlag}
          </div>
        )}

        {/* Cover overflow — canon frosted circle revealed on hover, opens the
            small white rounded-xl menu to set the cover once art exists. */}
        {card.needsArt && (
          <div className="absolute" style={{ top: 8, right: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-7 h-7 rounded-full inline-flex items-center justify-center transition-opacity"
              style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', backdropFilter: 'blur(6px)', opacity: hover || menuOpen ? 1 : 0 }}
              aria-label="Cover options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-testid={`cover-menu-${card.id}`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} data-testid={`cover-menu-backdrop-${card.id}`} />
                <div
                  className="absolute z-20 rounded-xl overflow-hidden"
                  style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 216, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}
                  role="menu"
                  data-testid={`cover-menu-list-${card.id}`}
                >
                  {COVER_MENU.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)}
                      style={{ padding: '10px 14px', color: t.ink, borderTop: i === 0 ? 'none' : `1px solid ${t.hairline}` }}
                      data-testid={`cover-menu-${m.id}-${card.id}`}
                    >
                      <m.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col" style={{ padding: '13px 16px 15px' }}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15.5px] font-semibold truncate min-w-0" style={{ color: t.ink, letterSpacing: '-0.015em' }}>{card.name}</h3>
          <ChevronRight className="w-4 h-4 flex-shrink-0 transition-opacity" style={{ color: t.faint, opacity: hover ? 1 : 0 }} aria-hidden />
        </div>
        {/* Derived per-format status line, directly under the title */}
        <div className="text-[12px] truncate" style={{ marginTop: 6, color: t.subink, lineHeight: 1.4 }} data-testid={`badge-${card.id}`}>{card.badge}</div>
        {/* Bottom row — year on the left, channel glyph (logo only) on the right */}
        <div className="flex items-center justify-between gap-3" style={{ marginTop: 10 }}>
          <span className="text-[11.5px]" style={{ color: t.faint }}>{card.year}</span>
          <ChannelGlyph channel={card.channel} />
        </div>
      </div>
    </div>
  );
}

function SceneReleasesWall({ t, onOpenRelease, onOpenGoldenrod }: { t: Theme; onOpenRelease: () => void; onOpenGoldenrod: () => void }) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      {/* Page header row: title/measure on the left, the canon primary
          "Create release" on the top-right (apple-canon page-action spot). */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
            <span style={{ color: t.ink }}>Releases. </span>
            <span style={{ color: t.subink }}>Every record you&rsquo;ve made.</span>
          </h1>
          <p className="text-[13.5px]" style={{ marginTop: 8, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
            Cards stay canon — no table, no stats header. Each shows only derived facts: its per-format status, its channel, and a money flag when there&rsquo;s something to do.
          </p>
        </div>
        {/* Quiet page-header action (Apple-like, dark-gray outline, no fill) —
            starts the Release → Draft → Project builder (artist estimates flow). */}
        <div className="flex-shrink-0">
          <CanonPill label="Create release" icon={Plus} t={t} onClick={() => { window.location.hash = '#/ArtistEstimatesFlow'; }} />
        </div>
      </div>
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
        {MOCK_WALL_CARDS.map((c) => (
          <WallCardTile
            key={c.id}
            card={c}
            t={t}
            onOpen={c.id === 'goldenrod' ? onOpenGoldenrod : c.id === 'californialand' ? onOpenRelease : () => {}}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RELEASE HEADER — five tabs (Part 2). Copied from ArtistReleaseArtTab header.
// ═══════════════════════════════════════════════════════════════════
const RELEASE_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'details', label: 'Details' },
  { id: 'assets', label: 'Assets' },
  { id: 'store', label: 'Store' },
  { id: 'payments', label: 'Payments' },
];

function ReleaseHeader({ activeTab, t, onTab, onCrumb }: { activeTab: string; t: Theme; onTab: (id: string) => void; onCrumb: () => void }) {
  return (
    <div>
      {/* Apple-canon breadcrumb: faint crumb links, ChevronRight separators,
          current page in ink, ~13px, sentence case, no uppercase, no middot. */}
      <div className="flex items-center gap-2 text-[13px]" data-testid="release-breadcrumb">
        <button type="button" onClick={onCrumb} className="font-medium transition-opacity hover:opacity-80" style={{ color: t.faint }} data-testid="crumb-releases">Releases</button>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} aria-hidden />
        <span className="font-medium" style={{ color: t.ink }}>{MOCK_RELEASE.title}</span>
        {/* Compact LIVE badge (replaces the old full-width "is live for fans"
            banner). Small rounded-rect, stronger hairline, word + icon so it
            never reads by color alone. */}
        <span
          className="inline-flex items-center gap-1 rounded-md text-[11px] font-semibold"
          style={{ padding: '2px 7px', color: t.subink, border: `1px solid ${t.dot}`, letterSpacing: '0.03em' }}
          data-testid="badge-live"
        >
          <Check className="w-3 h-3" strokeWidth={3} /> LIVE
        </span>
      </div>

      {/* Quiet plain-text page navigation — no chip, no container, no dots.
          Active = ink/white/600, inactive = muted/500. Larger text (15px) so it
          reads as the primary release nav. */}
      <div className="flex items-center gap-8 flex-wrap" style={{ marginTop: 56 }} data-testid="release-tabbar" role="tablist" aria-label="Release section">
        {RELEASE_TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className="text-[15px] transition-colors whitespace-nowrap hover:opacity-90"
              style={{
                fontWeight: active ? 600 : 500,
                letterSpacing: '0.01em',
                color: active ? t.ink : t.subink,
                opacity: active ? 1 : 0.8,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Full-width hairline — separates the breadcrumb + tab chip from the scene
          content below. (The art/title header block was removed; its facts now
          live on the Details tab.) */}
      <div style={{ marginTop: 10, marginBottom: 18, borderTop: `1px solid ${t.hairline}` }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENE 2 + 3 — ASSETS TAB (Art / Audio lanes, Master / Vinyl formats)
// ═══════════════════════════════════════════════════════════════════

// ONE solid segmented pill group — copied verbatim from PressEstimatesIndex
// SegGroup (canon, reads by weight/surface not color). Used for the Art/Audio
// pair and the Master/Vinyl sub tab bar.
function SegChip<T extends string>({ options, value, onChange, ariaLabel, testPrefix, t, size = 'sm', icons }: {
  options: Array<[T, string, string?]>;   // [id, label, optional muted detail]
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  testPrefix: string;
  t: Theme;
  size?: 'sm' | 'lg';
  icons?: Partial<Record<T, LucideIcon>>;  // optional leading icon per segment
}) {
  return (
    <div className="inline-flex items-center rounded-full flex-shrink-0" style={{ background: t.soft, padding: size === 'lg' ? 4 : 3 }} role="radiogroup" aria-label={ariaLabel} data-testid={testPrefix}>
      {options.map(([id, label, detail]) => {
        const on = value === id;
        const Icon: LucideIcon | undefined = icons?.[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className={cn('inline-flex items-center gap-1.5 rounded-full transition-colors', size === 'lg' ? 'h-10 px-5 text-[14px]' : 'h-8 px-3.5 text-[12.5px]')}
            style={{
              fontWeight: on ? 600 : 500,
              color: on ? t.ink : t.subink,
              background: on ? t.card : 'transparent',
              boxShadow: on ? PILL_SHADOW : undefined,
            }}
            data-testid={`${testPrefix}-${id.toLowerCase()}`}
          >
            {/* Understated leading icon — muted when inactive, ink when active */}
            {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: on ? t.ink : t.faint }} aria-hidden />}
            {label}
            {/* Optional muted detail text inside the same pill */}
            {detail && <span style={{ fontWeight: 500, color: t.faint }}>{detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Art slot model — copied verbatim from ArtistReleaseArtTab, plus an
// inheritance chip per Part 3 (the critical primitive). ───
type CheckRow = { label: string; value: string; verdict: 'pass' | 'fail' };
type Inheritance =
  | { kind: 'inherited-pass'; note: string }       // Using album art — passes spec
  | { kind: 'format-specific'; note: string }       // Format-specific file
  | { kind: 'inherited-fail'; note: string };        // Album art fails spec — drop format art
type BlockState =
  | { kind: 'pass'; file: string; checks: CheckRow[] }
  | { kind: 'fail'; file: string; checks: CheckRow[] }
  | { kind: 'empty' };
type ArtBlock = {
  id: string;
  title: string;
  hint: string;
  shape: 'square' | 'circle' | 'tall';
  inheritance: Inheritance;
  state: BlockState;
};

// 12" LP art slots — inherited album art passes the LP press template.
const MOCK_LP_BLOCKS: ArtBlock[] = [
  {
    id: 'cover',
    title: 'Cover · 12″ jacket',
    hint: 'Front · back · spine — 317.5 × 317.5 mm finished + 3 mm bleed',
    shape: 'tall',
    inheritance: { kind: 'inherited-pass', note: 'Using album art — passes 12" LP spec' },
    state: {
      kind: 'pass',
      file: 'CALIFORNIALAND_album_art.png',
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
    inheritance: { kind: 'format-specific', note: 'Format-specific file — overrides the album art' },
    state: {
      kind: 'pass',
      file: 'LP_labels_v3.png',
      checks: [
        { label: 'Format', value: 'PNG', verdict: 'pass' },
        { label: 'Size', value: '100 mm circle', verdict: 'pass' },
        { label: 'Resolution', value: '320 PPI', verdict: 'pass' },
        { label: 'Color', value: 'CMYK', verdict: 'pass' },
      ],
    },
  },
  {
    id: 'sleeve',
    title: 'Inner sleeve',
    hint: 'Both faces — 302 × 302 mm finished + 3 mm bleed',
    shape: 'square',
    inheritance: { kind: 'inherited-pass', note: 'Using album art — passes 12" LP spec' },
    state: {
      kind: 'pass',
      file: 'CALIFORNIALAND_album_art.png',
      checks: [
        { label: 'Format', value: 'PNG', verdict: 'pass' },
        { label: 'Size', value: '308 × 308 mm — covers trim + bleed', verdict: 'pass' },
        { label: 'Resolution', value: '347 PPI', verdict: 'pass' },
        { label: 'Color', value: 'CMYK', verdict: 'pass' },
      ],
    },
  },
  {
    // First-run empty slot — no file yet. Renders the dashed drop-zone + spec
    // hint + "Upload art" pill so a first-time artist sees WHAT and WHERE.
    id: 'obi',
    title: 'Obi strip',
    hint: 'Optional spine wrap — 40 × 302 mm finished + 3 mm bleed · PNG or PDF · CMYK · 300 PPI+',
    shape: 'tall',
    inheritance: { kind: 'inherited-fail', note: 'No art yet — upload to add this piece' },
    state: { kind: 'empty' },
  },
];

function VerdictChip({ kind, t }: { kind: 'pass' | 'fail' | 'empty'; t: Theme }) {
  if (kind === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.passBg, color: t.ready }} data-testid="chip-block-pass">
        <Check className="w-3 h-3" strokeWidth={3} /> Passed
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

// Inheritance chip — the Part 3 primitive rendered as word + icon (never color
// alone). Reads which file is in effect for this slot.
function InheritanceChip({ inheritance, t }: { inheritance: Inheritance; t: Theme }) {
  if (inheritance.kind === 'inherited-pass') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-medium" style={{ padding: '3px 9px', background: t.soft, color: t.subink }} data-testid="chip-inherit-pass">
        <Link2 className="w-3 h-3" /> {inheritance.note}
      </span>
    );
  }
  if (inheritance.kind === 'format-specific') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-medium" style={{ padding: '3px 9px', background: `${BLUE}14`, color: BLUE }} data-testid="chip-inherit-override">
        <FileImage className="w-3 h-3" /> {inheritance.note}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: t.failBg, color: t.fail }} data-testid="chip-inherit-fail">
      <X className="w-3 h-3" strokeWidth={3} /> {inheritance.note}
    </span>
  );
}

// BlockCard — GoodStudio-card treatment copied verbatim from PressTemplatesIndex
// tiles (Bill, Aug 15/16 2026): the ART is the hero — full-bleed image bleeds
// edge-to-edge across the tile's top, quiet text block flush-left below. Format
// / size / spec detail is HIDDEN — the card shows only the art and that it's
// good/certified. The whole tile is a button (clicking will later open the
// artist template Test page). The pass/needs-fixes chip sits at the BOTTOM,
// under the info; the top is reserved for art only.
function BlockCard({ block, t }: { block: ArtBlock; t: Theme }) {
  const s = block.state;
  const filled = s.kind !== 'empty';
  return (
    <a
      href="#/ArtistTemplateTest"
      className={cn('gt-tile w-full h-full rounded-2xl overflow-hidden flex flex-col text-left transition-colors cursor-pointer', t.hoverCard)}
      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}
      data-testid={`block-${block.id}`}
    >
      {/* Hero — art bleeds edge-to-edge across the top; empty slots show a
          dashed drop-zone so the upload target is unmistakable. */}
      <span className="block w-full flex-shrink-0" style={{ height: 200, backgroundColor: t.dropEmpty, borderBottom: `1px solid ${t.hairline}` }}>
        {filled ? (
          <img
            src={californialandCover}
            alt={`${block.title} art`}
            className="w-full h-full object-cover object-top"
            style={{ opacity: s.kind === 'fail' ? 0.55 : 1 }}
            data-testid={`img-block-${block.id}`}
          />
        ) : (
          <span className="w-full h-full flex flex-col items-center justify-center gap-2 text-center" style={{ padding: 12 }}>
            <span className="flex flex-col items-center justify-center gap-2 w-full h-full rounded-xl" style={{ border: `2px dashed ${t.dashed}` }}>
              <UploadCloud className="w-8 h-8" style={{ color: t.subink, strokeWidth: 1.5 }} />
              <span className="text-[11.5px]" style={{ color: t.faint }}>Drop art here</span>
            </span>
          </span>
        )}
      </span>

      {/* Info under the image — name + which file is in effect. No specs. */}
      <div className="w-full flex flex-col flex-1" style={{ padding: '14px 18px 16px' }}>
        <div className="text-[15px] font-semibold truncate" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{block.title}</div>

        {filled ? (
          <div style={{ marginTop: 8 }}>
            <InheritanceChip inheritance={block.inheritance} t={t} />
          </div>
        ) : (
          <>
            {/* Empty slot — spell out WHAT to upload (spec hint) and give a
                visible upload pill so a first-time artist can't miss it. */}
            <p className="text-[11.5px]" style={{ marginTop: 6, color: t.faint, lineHeight: 1.4 }} data-testid={`hint-${block.id}`}>{block.hint}</p>
            <span
              className={cn('inline-flex items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold w-full transition-colors', t.hoverCard)}
              style={{ marginTop: 10, padding: '8px 12px', border: `1px solid ${t.hairline}`, color: t.ink }}
              data-testid={`upload-${block.id}`}
            >
              <UploadCloud className="w-4 h-4 flex-shrink-0" /> Upload {block.title.split(' \u00b7 ')[0].toLowerCase()} art
            </span>
          </>
        )}

        {/* Status chip pinned to the BOTTOM — word + icon, never color alone. */}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <VerdictChip kind={s.kind} t={t} />
        </div>
      </div>
    </a>
  );
}

// Master audio rows — apple-canon hairline cards with download, reused verbatim
// from the Layer-1 "Release sources" row grammar in this file. Vinyl audio shows
// the same list plus a Wave call-out (Piper's mastering company).
const MOCK_MASTER_TRACKS = [
  'Golden Hour', 'Coastline', 'Paper Moon', 'Undertow', 'Neon Rain', 'Ferris Wheel',
  'Static', 'Long Drive', 'Saltwater', 'Midnight Postcard', 'Afterglow', 'Homecoming',
];

function AudioMasterList({ t, forVinyl }: { t: Theme; forVinyl: boolean }) {
  return (
    <div style={{ marginTop: 18 }}>
      {forVinyl && (
        <div className="rounded-xl flex items-center justify-between gap-4 flex-wrap" style={{ padding: '14px 16px', marginBottom: 16, border: `1px solid ${t.hairline}`, background: t.canvas }} data-testid="callout-wave">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Master these for vinyl with Wave</div>
            <p className="text-[12px]" style={{ marginTop: 3, color: t.subink, lineHeight: 1.45 }}>Vinyl cuts best from a dedicated master. Wave prepares a lacquer-ready set from your album masters.</p>
          </div>
          <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium flex-shrink-0 transition-colors', t.hoverCard)} style={{ padding: '8px 16px', color: t.subink, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="button-master-with-wave">
            <ArrowRight className="w-3.5 h-3.5" /> Master with Wave
          </button>
        </div>
      )}
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid={forVinyl ? 'audio-list-vinyl' : 'audio-list-master'}>
        {MOCK_MASTER_TRACKS.map((title, i) => (
          <div key={title} className="flex items-center gap-3 px-4" style={{ height: 52, borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }} data-testid={`track-${i + 1}`}>
            <span className="text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ width: 22, color: t.faint }}>{i + 1}</span>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: t.soft }}>
              <Disc3 className="w-4 h-4" style={{ color: t.subink }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium truncate" style={{ color: t.ink }}>{title}</div>
              <div className="text-[11.5px]" style={{ color: t.faint }}>{forVinyl ? 'Wave lacquer master · 24-bit / 96 kHz WAV' : '24-bit / 96 kHz WAV'}</div>
            </div>
            <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium flex-shrink-0 transition-colors', t.hoverCard)} style={{ padding: '6px 12px', color: t.subink, border: `1px solid ${t.hairline}` }} data-testid={`button-download-track-${i + 1}`}>
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Press attribution — physical-format press partner, sits flush right of a
// lane heading. Word + logo, never color alone.
// Press — quiet inline text+icon utility (grayed to t.faint so the heading
// dominates). No container: the MRP mark uses our standard dark-surface treatment
// (brightness(0) invert(1)) so it sits monochrome white directly on the dark bg,
// its opacity matched to the grayed text so they read as one unit.
function PressAttribution({ t }: { t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80"
      style={{ color: t.faint }}
      data-testid="press-attribution"
      title={`Press: ${PARTNER_NAME}`}
    >
      <img src={mrpLabelLogo} alt={PARTNER_NAME} className="h-3.5 w-auto flex-shrink-0" style={{ filter: 'brightness(0) invert(1)', opacity: 0.55 }} />
      {PARTNER_NAME}
    </span>
  );
}

// Templates — quiet inline text+icon utility, grayed to t.faint; no pill/border.
function TemplatesChip({ t }: { t: Theme }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80"
      style={{ color: t.faint }}
      data-testid="button-download-templates"
      title="Download the PDF templates"
    >
      <Download className="w-3.5 h-3.5 flex-shrink-0" /> Templates
    </button>
  );
}

// The format word that leads every lane heading, so the chip selection and the
// heading read as one thought (Master → "Master art.").
const FORMAT_WORD: Record<'digital' | 'master' | 'vinyl', string> = {
  master: 'Master',
  digital: 'GoodTunes\u00AE Player',
  vinyl: 'Vinyl',
};

// Details scene — the home for the facts the removed art/title header carried:
// format, artist, year, track count, and the Preview / Locked state. Quiet
// hairline rows (canon), word + icon for state so it's colorblind-safe.
// ═══════════════════════════════════════════════════════════════════
// RELEASE DASHBOARD — the release-level front door (scoped to CALIFORNIALAND).
// Borrows the portal dashboard grammar (next-thing band, stat cards, activity)
// but for ONE release. No big blue — the "Pay balance" next-step is a quiet
// dark-gray-outline CanonPill (Bill, round 6).
// ═══════════════════════════════════════════════════════════════════

// Per-format heartbeat rows. Status is always word + icon (never color alone,
// Bill is colorblind). 'live' → check, 'press' → quiet dot, 'draft' → hollow ring.
type FmtStatus = 'live' | 'press' | 'draft';
const MOCK_DASH_FORMATS: Array<{ id: string; label: string; word: string; status: FmtStatus }> = [
  { id: 'digital', label: 'Digital', word: 'Live', status: 'live' },
  { id: 'vinyl', label: 'Vinyl', word: 'At press', status: 'press' },
  { id: 'cd', label: 'CD', word: 'Draft', status: 'draft' },
];

function FormatStatusIcon({ status, t }: { status: FmtStatus; t: Theme }) {
  if (status === 'live') return <Check className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} style={{ color: t.subink }} aria-hidden />;
  if (status === 'press') return <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, background: t.subink }} />;
  return <Circle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} aria-hidden />;
}

// Next-thing band copy — the release's single most important state + the one
// actionable item (balance due) that carries the quiet next-step pill.
const MOCK_DASH_NEXT = {
  headline: 'Vinyl is at press. Test pressing expected Sep 2.',
  balance: <>Balance due Sep 4 &mdash; $2,135 to GoodTunes&reg;.</>,
  cta: 'Pay balance',
};

type DashStat = { label: string; value: string; delta: string; testid: string };
const MOCK_DASH_STATS: DashStat[] = [
  { label: 'Sales · last 30d', value: '$4,280', delta: 'Up from $3,110 prior 30d', testid: 'stat-sales' },
  { label: 'Fan plays · last 30d', value: '18,940', delta: 'Up from 14,200 prior 30d', testid: 'stat-plays' },
  { label: 'Certified GoodDeeds\u00AE', value: '312', delta: 'Up from 244 prior 30d', testid: 'stat-gooddeeds' },
];

type DashActivity = { text: ReactNode; date: string; testid: string };
const MOCK_DASH_ACTIVITY: DashActivity[] = [
  { text: 'Test pressing scheduled — Memphis Record Pressing', date: 'Aug 28', testid: 'activity-test-pressing' },
  { text: <>12 masters delivered to GoodTunes&reg; Player</>, date: 'Aug 24', testid: 'activity-masters' },
  { text: 'Estimate accepted', date: 'Aug 19', testid: 'activity-estimate' },
];

function ReleaseDashboard({ t, onOpenFormat }: { t: Theme; onOpenFormat: () => void }) {
  return (
    <div style={{ marginTop: 26 }} data-testid="release-dashboard">
      {/* 1 · Next-thing band. The release's single most important state, with the
          one actionable item (balance due) carrying the quiet next-step pill. */}
      <div
        className="flex items-center justify-between gap-6 rounded-2xl flex-wrap"
        style={{ padding: '18px 20px', border: `1px solid ${t.hairline}`, background: t.card }}
        data-testid="dashboard-nextthing"
      >
        <div className="flex items-start gap-3 min-w-0">
          <Clock className="w-5 h-5 flex-shrink-0" style={{ color: t.subink, marginTop: 1 }} aria-hidden />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: t.ink }}>{MOCK_DASH_NEXT.headline}</p>
            <p className="text-[13px]" style={{ marginTop: 3, color: t.subink }}>{MOCK_DASH_NEXT.balance}</p>
          </div>
        </div>
        <CanonPill label={MOCK_DASH_NEXT.cta} t={t} onClick={() => {}} />
      </div>

      {/* 2 · Per-format heartbeat. Each row hints (chevron) it jumps to that format
          in Assets. */}
      <div className="rounded-2xl overflow-hidden" style={{ marginTop: 18, border: `1px solid ${t.hairline}`, background: t.card }} data-testid="dashboard-formats">
        {MOCK_DASH_FORMATS.map((f, i) => (
          <button
            key={f.id}
            type="button"
            onClick={onOpenFormat}
            className={cn('w-full flex items-center justify-between gap-6 text-left transition-colors', t.hoverCard)}
            style={{ padding: '15px 18px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
            data-testid={`dashboard-format-${f.id}`}
          >
            <span className="text-[14px] font-semibold min-w-0" style={{ color: t.ink }}>
              {f.label}
              {f.id === 'digital' && <span className="font-medium" style={{ color: t.faint }}> · GoodTunes&reg; Player</span>}
            </span>
            <span className="flex items-center gap-4 flex-shrink-0">
              <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: t.subink }}>
                <FormatStatusIcon status={f.status} t={t} /> {f.word}
              </span>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} aria-hidden />
            </span>
          </button>
        ))}
      </div>

      {/* 3 · Release-scoped stat cards (portal dashboard grammar). */}
      <div className="grid gap-4" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }} data-testid="dashboard-stats">
        {MOCK_DASH_STATS.map((s) => (
          <div key={s.testid} className="rounded-2xl" style={{ padding: '16px 18px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid={s.testid}>
            <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>{s.label}</p>
            <p className="font-semibold" style={{ marginTop: 8, fontSize: 26, letterSpacing: '-0.02em', color: t.ink }}>{s.value}</p>
            <p className="text-[12px]" style={{ marginTop: 4, color: t.subink }}>{s.delta}</p>
          </div>
        ))}
      </div>

      {/* 4 · Release-only activity. Quiet rows with dates. */}
      <section style={{ marginTop: 26 }} data-testid="dashboard-activity">
        <h2 className="text-[15px] font-semibold" style={{ color: t.ink, marginBottom: 12 }}>As it happens.</h2>
        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }}>
          {MOCK_DASH_ACTIVITY.map((a, i) => (
            <div
              key={a.testid}
              className="flex items-center justify-between gap-6"
              style={{ padding: '14px 18px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
              data-testid={a.testid}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: t.dot }} />
                <span className="text-[13.5px] min-w-0" style={{ color: t.subink }}>{a.text}</span>
              </span>
              <span className="text-[12.5px] flex-shrink-0" style={{ color: t.faint }}>{a.date}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ReleaseDetails({ t }: { t: Theme }) {
  const rows: Array<{ label: string; value: ReactNode; testid: string }> = [
    { label: 'Title', value: <span className="font-semibold" style={{ color: t.ink }}>{MOCK_RELEASE.title}</span>, testid: 'detail-title' },
    { label: 'Artist', value: MOCK_RELEASE.artist, testid: 'detail-artist' },
    { label: 'Format', value: MOCK_RELEASE.format, testid: 'detail-format' },
    { label: 'Year', value: MOCK_RELEASE.year, testid: 'detail-year' },
    { label: 'Tracks', value: MOCK_RELEASE.tracks, testid: 'detail-tracks' },
    {
      label: 'Visibility',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} aria-hidden /> {MOCK_RELEASE.visibility}
        </span>
      ),
      testid: 'detail-visibility',
    },
    {
      label: 'Editing',
      value: (
        <span className="inline-flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} aria-hidden /> {MOCK_RELEASE.editing}
        </span>
      ),
      testid: 'detail-editing',
    },
  ];
  return (
    <div style={{ marginTop: 26 }}>
      <div className="min-w-0" style={{ marginBottom: 18 }}>
        <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Details.</h2>
        <p className="text-[13.5px]" style={{ marginTop: 4, color: t.subink }}>Everything about this release at a glance.</p>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid="release-details">
        {rows.map((r, i) => (
          <div
            key={r.testid}
            className="flex items-center justify-between gap-6"
            style={{ padding: '13px 18px', borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}
            data-testid={r.testid}
          >
            <span className="text-[12px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: t.faint }}>{r.label}</span>
            <span className="text-[13.5px] text-right min-w-0" style={{ color: t.subink }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Which top-level scene owns each release tab. Store / Payments are their own
// fully-built scenes; Dashboard / Details / Assets all live inside the Assets
// scene. The release tab bar routes to the owning scene so navigation crosses
// between the three fully-built scenes instead of dead-ending in placeholders.
const TAB_SCENE: Record<string, SceneId> = {
  dashboard: 'assets',
  details: 'assets',
  assets: 'assets',
  store: 'store',
  payments: 'payments',
};

// Build the release tab-bar click handler for a given scene: switch local tab
// when the target lives in this scene, otherwise jump to the owning scene.
function makeTabRouter(ownScene: SceneId, setLocal: (id: string) => void, onJump: (s: SceneId) => void) {
  return (id: string) => {
    const target = TAB_SCENE[id] ?? ownScene;
    if (target === ownScene) setLocal(id);
    else onJump(target);
  };
}

function SceneFormats({ t, onCrumb, onJump }: { t: Theme; onCrumb: () => void; onJump: (s: SceneId) => void }) {
  const [tab, setTab] = useState('assets');
  const onTab = makeTabRouter('assets', setTab, onJump);
  const [lane, setLane] = useState<'art' | 'audio'>('art');  // Art / Audio pair
  // Format sub tabs — the SAME list drives both Art & Audio lanes. Digital (the
  // GoodTunes Player master) sits in every list alongside the physical formats.
  const [assetFormat, setAssetFormat] = useState<'digital' | 'master' | 'vinyl'>('vinyl');

  // Vinyl (12" LP) art pieces — inherited album art vs format-specific override.
  const blocks = MOCK_LP_BLOCKS;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} t={t} onTab={onTab} onCrumb={onCrumb} />

      {tab === 'dashboard' ? (
        <ReleaseDashboard t={t} onOpenFormat={() => setTab('assets')} />
      ) : tab === 'details' ? (
        <ReleaseDetails t={t} />
      ) : tab !== 'assets' ? (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 26, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
          <p className="text-[14px] font-semibold" style={{ color: t.ink }}>The {RELEASE_TABS.find((x) => x.id === tab)?.label} tab lives here.</p>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>This walk focuses on Assets, Store, and Payments. Tap Assets to see the three-layer asset model.</p>
          <button type="button" onClick={() => setTab('assets')} className="text-[13px] font-semibold" style={{ marginTop: 14, color: BLUE }}>Back to Assets</button>
        </div>
      ) : (
        <>
          {/* Top row — just the format chip + expanding "+". The Art / Audio lane
              chip has moved down to the lane-heading row. Formats stay in sync
              across both lanes (the SAME list drives both). */}
          <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 14 }} data-testid="asset-lane-row">
            {/* Segmented chip (canon SegGroup proportions). This is the one
                view switcher on screen. */}
            <SegChip
              options={[['master', 'Master'], ['digital', 'GoodTunes\u00AE Player'], ['vinyl', 'Vinyl']]}
              value={assetFormat}
              onChange={(v) => setAssetFormat(v)}
              ariaLabel="Asset format"
              testPrefix="assetformat"
              t={t}
            />
            {/* Expanding add affordance — a "+" that grows rightward on hover to
                reveal "Add format" (smooth width/opacity), apple-clean. Scoped
                CSS keeps the width/opacity transition off arbitrary utilities. */}
            <style>{`
              .apr-add{transition:background-color .15s ease}
              .apr-add .apr-add-label{max-width:0;opacity:0;margin-left:0;overflow:hidden;white-space:nowrap;transition:max-width .22s ease,opacity .18s ease,margin-left .22s ease}
              .apr-add:hover .apr-add-label,.apr-add:focus-visible .apr-add-label{max-width:96px;opacity:1;margin-left:6px}
            `}</style>
            <button
              type="button"
              className={cn('apr-add inline-flex items-center h-9 px-2.5 rounded-full text-[13px] font-semibold flex-shrink-0', t.hoverCard)}
              style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
              data-testid="button-add-format"
              aria-label="Add format"
              title="Add format"
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="apr-add-label">Add format</span>
            </button>
          </div>

          {lane === 'audio' ? (
            <>
              <div className="flex items-start justify-between gap-6 flex-wrap" style={{ marginTop: 36 }}>
                <div className="min-w-0">
                  {/* Heading echoes the chip selection, with quiet inline items to
                      its right (baseline-aligned): Press on Vinyl, Add bonus
                      content on Digital. */}
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>
                      {FORMAT_WORD[assetFormat]} audio.
                    </h2>
                    {assetFormat === 'vinyl' && <PressAttribution t={t} />}
                    {assetFormat === 'digital' && (
                      <button type="button" className="inline-flex items-center gap-1.5 text-[13px] font-medium flex-shrink-0 transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-add-bonus-content" title="Add bonus content to the GoodTunes® Player">
                        <Plus className="w-3.5 h-3.5 flex-shrink-0" /> Add bonus content
                      </button>
                    )}
                  </div>
                  <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
                    {assetFormat === 'vinyl'
                      ? 'The lacquer-ready set for this pressing. References your album masters until Wave prepares a vinyl cut.'
                      : assetFormat === 'digital'
                        ? 'What buyers stream in the GoodTunes® Player. Uses your album masters — add any bonus content you want in the player.'
                        : 'Your canonical album masters. Every format references them until you override.'}
                  </p>
                </div>
                {/* Art / Audio lane chip — flush right of the heading row */}
                <SegChip
                  options={[['art', 'Art'], ['audio', 'Audio']]}
                  value={lane}
                  onChange={(v) => setLane(v)}
                  ariaLabel="Asset lane"
                  testPrefix="lane"
                  t={t}
                  icons={{ art: FileImage, audio: Disc3 }}
                />
              </div>
              <AudioMasterList t={t} forVinyl={assetFormat === 'vinyl'} />
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-6 flex-wrap" style={{ marginTop: 36 }}>
                <div className="min-w-0">
                  {/* Heading echoes the chip selection, with quiet inline items to
                      its right (baseline-aligned): Press (Vinyl only) · Templates. */}
                  <div className="flex items-baseline gap-4 flex-wrap">
                    <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>
                      {FORMAT_WORD[assetFormat]} art.
                    </h2>
                    {assetFormat === 'vinyl' && <PressAttribution t={t} />}
                    <TemplatesChip t={t} />
                  </div>
                  <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
                    {assetFormat === 'master'
                      ? 'Your canonical album art. Every format references it until you override.'
                      : assetFormat === 'digital'
                        ? 'What buyers see in the GoodTunes® Player. Uses your album art as-is — no press template to meet.'
                        : `Each piece references your album art until you drop a file to ${PARTNER_NAME}'s templates. Tap any piece to open its test view.`}
                  </p>
                </div>
                {/* Art / Audio lane chip — flush right of the heading row */}
                <SegChip
                  options={[['art', 'Art'], ['audio', 'Audio']]}
                  value={lane}
                  onChange={(v) => setLane(v)}
                  ariaLabel="Asset lane"
                  testPrefix="lane"
                  t={t}
                  icons={{ art: FileImage, audio: Disc3 }}
                />
              </div>

              {assetFormat === 'vinyl' ? (
                <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 18 }}>
                  {blocks.map((b) => <BlockCard key={b.id} block={b} t={t} />)}
                </div>
              ) : (
                <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 18, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
                  <p className="text-[14px] font-semibold" style={{ color: t.ink }}>
                    {assetFormat === 'digital' ? 'Player art — uses your album art' : 'Album art — the canonical source'}
                  </p>
                  <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 420 }}>
                    {assetFormat === 'digital'
                      ? 'The GoodTunes® Player shows your album art as-is — no press template to meet. Switch to Vinyl to see each piece checked against that press template.'
                      : 'Uploaded once at Master. Switch to a physical format (Vinyl) to see each piece checked against that press template.'}
                  </p>
                  <button type="button" onClick={() => setAssetFormat('vinyl')} className="text-[13px] font-semibold" style={{ marginTop: 14, color: BLUE }}>Show vinyl art</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENE 4 — STORE TAB (channel picker, share link, Shopify connect, toggle,
// email appearance, Publish + readiness checklist). Copy from ArtistProjectSellChoice.
// ═══════════════════════════════════════════════════════════════════
// Store tab dummy data — channel options, share-link URLs, email preview copy,
// and the readiness checklist (Part 4).
const MOCK_STORE = {
  channels: [
    { id: 'goodtunes' as const, title: 'GoodTunes® Direct', blurb: 'We press it, sell it, and fulfill it. The GoodTunes® storefront is the share link below.', logo: goodtunesLogo, alt: 'GoodTunes®', h: 26 },
    { id: 'shopify' as const, title: 'GoodTunes® for Shopify', blurb: 'You sell on your own Shopify store. We press, run GoodDeed®, and can fulfill for you too.', logo: shopifyLogo, alt: 'Shopify', h: 22 },
  ],
  shareLinks: [
    { label: 'Artist URL', url: 'goodtunes.co/niinasoleil' },
    { label: 'Album URL', url: 'goodtunes.co/niinasoleil/californialand' },
  ],
  emailPreview: {
    heading: 'Thank you for backing CALIFORNIALAND',
    body: 'Your music is in the GoodTunes® player, and your GoodDeed® is on its way.',
  },
  checklist: [
    { id: 'art', label: 'Art passed', done: true },
    { id: 'audio', label: 'Audio passed', done: true },
    { id: 'price', label: 'Price set', done: true },
    { id: 'channel', label: 'Channel chosen', done: true },
  ],
};

function SceneStore({ t, onCrumb, onJump }: { t: Theme; onCrumb: () => void; onJump: (s: SceneId) => void }) {
  const [tab, setTab] = useState('store');
  const onTab = makeTabRouter('store', setTab, onJump);
  const [channel, setChannel] = useState<'goodtunes' | 'shopify'>('goodtunes');
  const [gtFulfills, setGtFulfills] = useState(true);

  const checklist = MOCK_STORE.checklist;
  const ready = checklist.every((c) => c.done);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} t={t} onTab={onTab} onCrumb={onCrumb} />

      {tab !== 'store' ? (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 26, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
          <p className="text-[14px] font-semibold" style={{ color: t.ink }}>The {RELEASE_TABS.find((x) => x.id === tab)?.label} tab lives here.</p>
          <button type="button" onClick={() => setTab('store')} className="text-[13px] font-semibold" style={{ marginTop: 14, color: BLUE }}>Back to Store</button>
        </div>
      ) : (
        <div className="grid gap-5" style={{ marginTop: 26, gridTemplateColumns: 'minmax(0, 1fr) 340px' }}>
          {/* LEFT — channel picker + channel-specific content */}
          <div className="space-y-5">
            {/* Channel picker — stacked rows w/ real brand marks (Sell-choice canon) */}
            <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="channel-picker">
              <h2 className="text-[16px] font-semibold" style={{ color: t.ink }}>Where does this sell?</h2>
              <p className="text-[13px]" style={{ marginTop: 4, color: t.subink, lineHeight: 1.5 }}>
                Pick once — you can switch any time before Publish. Fans always get the music in the GoodTunes® player and their GoodDeed® no matter which you pick; only checkout differs.
              </p>
              <div className="flex flex-col" style={{ marginTop: 16, gap: 12 }}>
                {MOCK_STORE.channels.map((o) => {
                  const active = o.id === channel;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setChannel(o.id)}
                      data-testid={`channel-option-${o.id}`}
                      className="w-full rounded-2xl text-left transition-colors"
                      style={{ padding: '16px 18px', border: `${active ? 2 : 1}px solid ${active ? BLUE : t.hairline}`, background: t.card }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 72 }}>
                          <img src={o.logo} alt={o.alt} style={{ height: o.h, width: 'auto', filter: o.id === 'goodtunes' ? t.wordmarkFilter : t.logoFilter }} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] font-semibold" style={{ color: t.ink }}>{o.title}</div>
                          <p className="text-[12.5px]" style={{ marginTop: 3, color: t.subink, lineHeight: 1.45 }}>{o.blurb}</p>
                        </div>
                        <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, border: `2px solid ${active ? BLUE : t.dashed}`, background: active ? BLUE : 'transparent', boxShadow: active ? `inset 0 0 0 3px ${t.card}` : undefined }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Channel-specific block */}
            {channel === 'goodtunes' ? (
              <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="share-link-section">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4" style={{ color: t.subink }} />
                  <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Share link</h3>
                  <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: t.passBg, color: t.ready }}>
                    <Check className="w-3 h-3" strokeWidth={3} /> Live
                  </span>
                </div>
                <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink }}>This is your GoodTunes® storefront — the page fans land on.</p>
                {MOCK_STORE.shareLinks.map((row) => (
                  <div key={row.label} className="flex items-center gap-2" style={{ marginTop: 12 }}>
                    <div className="flex-1 min-w-0 rounded-xl flex items-center px-3" style={{ height: 40, border: `1px solid ${t.hairline}`, background: t.canvas }}>
                      <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint, marginRight: 8 }}>{row.label}</span>
                      <span className="text-[12.5px] truncate" style={{ color: t.ink }}>{row.url}</span>
                    </div>
                    <button type="button" className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors', t.hoverCard)} style={{ border: `1px solid ${t.hairline}`, color: t.subink }} aria-label="Copy" data-testid={`copy-${row.label}`}>
                      <Copy className="w-4 h-4" />
                    </button>
                    <button type="button" className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors', t.hoverCard)} style={{ border: `1px solid ${t.hairline}`, color: t.subink }} aria-label="Open" data-testid={`open-${row.label}`}>
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="shopify-connect-section">
                <div className="flex items-center gap-2">
                  <img src={shopifyLogo} alt="Shopify" style={{ height: 18, filter: t.logoFilter }} />
                  <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Connect your Shopify store</h3>
                </div>
                <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, lineHeight: 1.5 }}>Connect the store, map this album to a product, and paste its sale URL. Fans buy on your store; we handle GoodDeed® and can fulfill.</p>
                <div className="flex items-center gap-2 rounded-xl" style={{ marginTop: 14, padding: '12px 14px', background: t.warnBg, border: `1px solid ${t.warnBorder}` }}>
                  <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, border: `2px solid ${t.warn}` }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: t.warnInk }}>Not connected — needed before you can publish to Shopify</span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <QuietPill label="Connect Shopify" onClick={() => {}} icon={ArrowRight} t={t} />
                </div>
              </div>
            )}

            {/* GoodTunes fulfills orders toggle — moved here from Payments */}
            <div className="rounded-2xl flex items-center justify-between gap-4" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 18 }} data-testid="toggle-fulfillment">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: t.ink }}>GoodTunes® fulfills orders</div>
                <p className="text-[12.5px]" style={{ marginTop: 3, color: t.subink }}>We pack and ship every order. Turn off to fulfill from your own warehouse.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={gtFulfills}
                onClick={() => setGtFulfills((v) => !v)}
                className="relative rounded-full flex-shrink-0 transition-colors"
                style={{ width: 46, height: 28, background: gtFulfills ? BLUE : t.soft }}
                data-testid="switch-fulfillment"
              >
                <span className="absolute rounded-full bg-white transition-transform" style={{ width: 22, height: 22, top: 3, left: 3, transform: gtFulfills ? 'translateX(18px)' : 'none', boxShadow: PILL_SHADOW }} />
              </button>
            </div>

            {/* Email appearance — moved here from Overview */}
            <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="email-appearance">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" style={{ color: t.subink }} />
                <h3 className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Email appearance</h3>
              </div>
              <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink }}>The post-purchase note fans get. Follows the channel you chose above.</p>
              <div className="rounded-xl flex items-start gap-3" style={{ marginTop: 12, padding: 14, border: `1px solid ${t.hairline}`, background: t.canvas }}>
                <img src={californialandCover} alt="" aria-hidden className="rounded-md flex-shrink-0" style={{ width: 44, height: 44, objectFit: 'cover' }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold" style={{ color: t.ink }}>{MOCK_STORE.emailPreview.heading}</div>
                  <p className="text-[12px]" style={{ marginTop: 2, color: t.subink, lineHeight: 1.45 }}>{MOCK_STORE.emailPreview.body}</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — Publish + readiness checklist */}
          <div className="space-y-5">
            <div className="rounded-2xl sticky" style={{ top: 24, border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid="publish-panel">
              <h3 className="text-[15px] font-semibold" style={{ color: t.ink }}>Ready to publish?</h3>
              <p className="text-[12.5px]" style={{ marginTop: 4, color: t.subink, lineHeight: 1.5 }}>Publish makes {MOCK_RELEASE.title} real for fans on the {channel === 'goodtunes' ? 'GoodTunes® storefront' : 'your Shopify store'}.</p>
              <div className="space-y-2" style={{ marginTop: 16 }}>
                {checklist.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5" data-testid={`readiness-${c.id}`}>
                    {c.done
                      ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: t.ready }} strokeWidth={3} />
                      : <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 9, height: 9, border: `2px solid ${t.warn}` }} />}
                    <span className="text-[13px] font-medium" style={{ color: c.done ? t.ink : t.subink }}>{c.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18 }}>
                <CanonPill label="Publish to fans" t={t} onClick={() => {}} icon={ArrowRight} />
              </div>
              {ready && (
                <p className="text-[11.5px]" style={{ marginTop: 10, color: t.faint, lineHeight: 1.5 }}>Everything passed — you never have to hunt for the button that makes it real.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENE 5 — RELEASE PAYMENTS TAB (one row per project; balance paid inline)
// ═══════════════════════════════════════════════════════════════════
type Project = {
  id: string;
  title: string;
  pressLogo: string;
  summary: string;
  outstanding?: string;
  // A launch balance is due — the row shows the "Pay balance" primary.
  // When false/absent the project is still being estimated.
  balanceDue?: boolean;
};

const MOCK_PAYMENT_PROJECTS: Project[] = [
  {
    id: 'lp',
    title: '12" LP',
    pressLogo: mrpLabelLogo,
    summary: 'pressed by Memphis Record Pressing',
    outstanding: '$4,135 outstanding',
    balanceDue: true,
  },
  {
    id: 'cd',
    title: 'CD',
    pressLogo: hellbenderIcon,
    summary: 'pressed by Hellbender',
  },
];

function ProjectRow({ project, t }: { project: Project; t: Theme }) {
  const quoted = !project.balanceDue;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid={`project-row-${project.id}`}>
      <div className="w-full flex items-center justify-between gap-4 px-5" style={{ minHeight: 72 }}>
        <div className="flex items-center gap-3.5 min-w-0">
          <span className="h-9 w-9 rounded-full bg-white ring-1 ring-black/10 flex items-center justify-center flex-shrink-0 p-1.5">
            <img src={project.pressLogo} alt="" aria-hidden className="w-full h-full object-contain" style={{ filter: 'brightness(0)' }} />
          </span>
          <div className="min-w-0 text-left">
            <div className="text-[14.5px] font-semibold truncate" style={{ color: t.ink }}>
              {project.title} · <span style={{ color: t.subink, fontWeight: 500 }}>{project.summary}</span>
            </div>
            <div className="text-[12.5px] mt-0.5" style={{ color: quoted ? t.subink : t.warnInk }}>
              {quoted ? 'Estimate accepted — schedule pending' : project.outstanding}
            </div>
          </div>
        </div>
        {/* Right of the action row: the canon primary for a project with a
            balance due; a quiet status chip for one still being estimated. */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {quoted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.soft, color: t.subink }}>
              <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${t.subink}` }} />
              Estimated
            </span>
          ) : (
            <CanonPill label="Pay balance" t={t} onClick={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
}

function ScenePayments({ t, onCrumb, onJump }: { t: Theme; onCrumb: () => void; onJump: (s: SceneId) => void }) {
  const [tab, setTab] = useState('payments');
  const onTab = makeTabRouter('payments', setTab, onJump);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} t={t} onTab={onTab} onCrumb={onCrumb} />

      {tab !== 'payments' ? (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 26, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
          <p className="text-[14px] font-semibold" style={{ color: t.ink }}>The {RELEASE_TABS.find((x) => x.id === tab)?.label} tab lives here.</p>
          <button type="button" onClick={() => setTab('payments')} className="text-[13px] font-semibold" style={{ marginTop: 14, color: BLUE }}>Back to Payments</button>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-6 flex-wrap" style={{ marginTop: 24 }}>
            <div className="min-w-0">
              <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Money out to the plant</h2>
              <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 560, lineHeight: 1.5 }}>
                One row per project — a format pressed by one plant. You only ever pay GoodTunes®; we release funds to the plant at each milestone.
              </p>
            </div>
          </div>
          <div className="space-y-3" style={{ marginTop: 20 }}>
            {MOCK_PAYMENT_PROJECTS.map((p) => (
              <ProjectRow key={p.id} project={p} t={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENE 6 — REPORTS CONSOLIDATION (tabs + two money ledgers, never netted)
// ═══════════════════════════════════════════════════════════════════
const REPORTS_TABS = [
  { id: 'audience', label: 'Audience' },
  { id: 'acquisition', label: 'Acquisition' },
  { id: 'buyers', label: 'Buyers' },
  { id: 'payments', label: 'Payments' },
  { id: 'earnings', label: 'Earnings' },
];

// Reports — two money ledgers, never netted (Part 6). Owed = money out to the
// plant; earned = money in from fan sales.
const MOCK_LEDGERS = {
  owed: {
    total: '$4,135',
    rows: [
      { label: 'CALIFORNIALAND · 12" LP', sub: 'Balance at launch · due Sep 4', amount: '$4,135' },
      { label: 'GOLDENROD · CD', sub: 'Test pressings · held', amount: '$1,240' },
    ],
  },
  earned: {
    total: '$2,000',
    rows: [
      { label: 'CALIFORNIALAND · fan sales', sub: 'Paid out Aug 1', amount: '$1,200' },
      { label: 'HOPE · fan sales', sub: 'Paid out Jul 1', amount: '$800' },
    ],
  },
};

function LedgerCard({ kind, t }: { kind: 'owed' | 'earned'; t: Theme }) {
  const owed = kind === 'owed';
  const ledger = owed ? MOCK_LEDGERS.owed : MOCK_LEDGERS.earned;
  const rows = ledger.rows;
  const total = ledger.total;
  return (
    <div className="rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, padding: 20 }} data-testid={`ledger-${kind}`}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-semibold" style={{ padding: '3px 9px', background: owed ? t.warnBg : t.passBg, color: owed ? t.warnInk : t.ready }}>
          {owed
            ? <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
            : <Check className="w-3 h-3" strokeWidth={3} />}
          {owed ? 'Money out' : 'Money in'}
        </span>
      </div>
      <h3 className="text-[16px] font-semibold" style={{ marginTop: 12, color: t.ink }}>{owed ? 'Payments' : 'Earnings'}</h3>
      <p className="text-[12.5px]" style={{ marginTop: 4, color: t.subink }}>
        {owed ? 'What you owe GoodTunes® for manufacturing, across all releases.' : 'What GoodTunes® has paid you from fan sales.'}
      </p>
      <div className="text-[30px] font-semibold" style={{ marginTop: 12, color: t.ink, letterSpacing: '-0.02em' }}>{total}</div>
      <div className="text-[12px]" style={{ color: t.subink }}>{owed ? 'outstanding' : 'paid to you'}</div>
      <div className="space-y-0" style={{ marginTop: 14 }}>
        {rows.map((r, i) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: i === 0 ? undefined : `1px solid ${t.hairline}` }}>
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate" style={{ color: t.ink }}>{r.label}</div>
              <div className="text-[11.5px]" style={{ color: t.faint }}>{r.sub}</div>
            </div>
            <span className="text-[13.5px] font-semibold flex-shrink-0" style={{ color: t.ink }}>{r.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// RAW TEMPLATE SCENE — where GOLDENROD lands. This release has never had print
// art uploaded, so the artist sees the blank press template (white canvas,
// Front/Back panels with template line work) and drops art straight onto it.
// Mirrors the raw-template pre-upload state in ArtistTemplateTest.tsx. Self-
// contained: all copy/facts in MOCK_RAW below, canon buttons only, no color-only.
// ═══════════════════════════════════════════════════════════════════
const MOCK_RAW = {
  release: 'GOLDENROD',
  templateName: '12″ single 3D jacket',
  spec: '779.41 × 539.33 mm bleed · CMYK · 300 PPI+',
  // File-header card facts — reused from the press-side "Widespine jacket" card
  // grammar, artist-appropriate: title, source file, dims · layers · uploaded.
  headerTitle: '12in Single 3D Jacket',
  sourceFile: 'GOLDENROD-jacket-v3.pdf',
  dims: '779.41 × 539.33 mm',
  layers: 18,
  uploadedAt: 'Aug 18 at 3:19 PM',
};

// The full press-side MRP template facts — mirrors the Memphis Record Pressing
// template page (12-JKTSG3D-100). Rendered around the real mrp-jacket-template.png
// (Andrew's PDF render). Self-contained MOCK, no press-file edits.
const MOCK_MRP = {
  press: 'Memphis Record Pressing',
  title: '12in Single 3D Jacket',
  number: '12-JKTSG3D-100',
};

// Per-panel upload — GOLDENROD is a 12" jacket-style cover, so three segments:
// Front, Back, Spine. Each seats a mock art crop once "uploaded". Mock art is a
// self-contained styled gradient (goldenrod has no cover asset yet) so the file
// needs no new binary asset.
type PanelId = 'front' | 'back' | 'spine';
const MOCK_PANELS: Array<{ id: PanelId; label: string; hint: string; art: string }> = [
  { id: 'front', label: 'Front', hint: '311.15 × 311.15 mm + bleed', art: 'linear-gradient(140deg, #e9b949 0%, #d98f3a 42%, #b5532e 78%, #7a2f52 100%)' },
  { id: 'back', label: 'Back', hint: '311.15 × 311.15 mm + bleed', art: 'linear-gradient(140deg, #7a2f52 0%, #b5532e 40%, #d98f3a 80%, #e9b949 100%)' },
  { id: 'spine', label: 'Spine', hint: '3.5 mm × 311.15 mm', art: 'linear-gradient(180deg, #d98f3a 0%, #b5532e 55%, #7a2f52 100%)' },
];

// Panel regions as fractions of the full MRP template sheet (6138 × 4247 render).
// Measured from mrp-jacket-template.png: BACK is the left panel, FRONT the right,
// SPINE the thin center strip between them. Bleed rects (outer) — art extends to
// these; used to place the focus highlight, drop affordance and seated art.
type Rect = { left: number; top: number; width: number; height: number };
const PANEL_REGIONS: Record<PanelId, Rect> = {
  back:  { left: 0.100, top: 0.195, width: 0.292, height: 0.600 },
  front: { left: 0.515, top: 0.195, width: 0.292, height: 0.600 },
  spine: { left: 0.483, top: 0.195, width: 0.028, height: 0.600 },
};
const pct = (n: number) => `${n * 100}%`;

// Overlay toggle chips — the full press-side Test/Certify row grammar, reused
// verbatim (word carries state: "Bleed off" / "Bleed on", plus a ring dot; never
// color-only). Simple ring-dot chips: Bleed · Cut · Spine. Front · Back are
// consolidated chips with a chevron dropdown (Cover / Safety / Foil), exactly
// like the press-side Front/Back zone chips.
const OVERLAY_SIMPLE: Array<{ id: string; label: string }> = [
  { id: 'bleed', label: 'Bleed' },
  { id: 'cut', label: 'Cut' },
  { id: 'spine', label: 'Spine' },
];
// Front / Back consolidated dropdown parts (mirrors press "Front Cover / Front
// Safety / Foil Stamping Front" behind one chip).
const OVERLAY_GROUPS: Record<'front' | 'back', Array<{ id: string; label: string }>> = {
  front: [
    { id: 'front-cover', label: 'Cover' },
    { id: 'front-safety', label: 'Safety' },
    { id: 'front-foil', label: 'Foil' },
  ],
  back: [
    { id: 'back-cover', label: 'Cover' },
    { id: 'back-safety', label: 'Safety' },
    { id: 'back-foil', label: 'Foil' },
  ],
};
// Every overlay id the seatArt/toggle logic tracks (superset of both).
const OVERLAY_IDS = [
  'template', 'bleed', 'cut', 'safety', 'spine',
  'front-cover', 'front-safety', 'front-foil',
  'back-cover', 'back-safety', 'back-foil',
];


// The MRP template — the REAL press PDF render (mrp-jacket-template.png, Andrew's
// "20260814_GoodTunes_MRP_Jacket12in_3.5mmSpine", 200dpi) on a white sheet at its
// true aspect (≈ 1.445). No hand-built header/legend chrome — the MRP header,
// BACK/FRONT panels, spine and legends all live in the asset itself.
//
// Until the artist uploads, the SHEET AREA ONLY is dimmed with the drop box over
// it (a scrim scoped to the sheet, not the screen) — the segmented control above
// stays live so they can switch to Upload images. After a mock upload the scrim
// clears and the template shows normally.
const JACKET_ASPECT = 779.41 / 539.33;

// The canon drag & drop box — charcoal rounded-2xl card with a light dashed
// border, cloud icon, bold white title, muted subtext — floating over a grayed
// template area (dim scoped to the parent viewport). Identical in template mode
// and in each zoomed Upload-images panel viewport. Fixed dark styling so it reads
// the same in light + dark (it always sits over the white template sheet).
function TemplateDropBox({ onUpload, title, testid }: { onUpload: () => void; title: string; testid: string }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(20,20,22,0.42)', backdropFilter: 'blur(1px)', WebkitBackdropFilter: 'blur(1px)', padding: 16 }}
      data-testid={`${testid}-scrim`}
    >
      <button
        type="button"
        onClick={onUpload}
        className="flex flex-col items-center justify-center text-center gap-2 rounded-2xl transition-opacity hover:opacity-95"
        style={{
          width: 'min(90%, 380px)',
          padding: '26px 22px',
          background: '#1c1c1e',
          border: '1.5px dashed rgba(255,255,255,0.35)',
          boxShadow: '0 16px 44px rgba(0,0,0,0.4)',
        }}
        data-testid={testid}
      >
        <UploadCloud className="w-7 h-7" style={{ color: 'rgba(255,255,255,0.85)', strokeWidth: 1.5 }} aria-hidden />
        <span className="font-semibold text-[14px]" style={{ color: '#ffffff', lineHeight: 1.25 }}>{title}</span>
        <span className="text-[12.5px]" style={{ color: 'rgba(255,255,255,0.6)' }}>or click to upload &middot; paste a URL</span>
      </button>
    </div>
  );
}

// File-header card — reused verbatim from the press-side "Widespine jacket ·
// Not tested / Originally … / dims · GT layers · uploaded … by you [Cancel]
// [Save]" card, adapted for the artist. Title = the jacket/template name; status
// chip is word + icon (No art yet → Not tested); sub-lines carry the source file
// and, once something is uploaded, the dims · layers · uploaded-when-by-you line.
// Right side: quiet Cancel + Save that OBEYS confirm-earns-its-blue — a gray
// hairline-outline pill until something's changed/uploaded, filled blue once
// earned. Mock actions.
function FileHeaderCard({ t, uploaded, dirty, onCancel, onSave }: {
  t: Theme;
  uploaded: boolean;
  dirty: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-2xl" style={{ padding: '16px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="file-header-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Title + status ride together, same as the press card. */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="text-[18px] font-semibold truncate" style={{ color: t.ink, letterSpacing: '-0.01em' }} title={MOCK_RAW.headerTitle}>
              {MOCK_RAW.headerTitle}
            </div>
            {uploaded ? (
              <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium ml-1.5" style={{ color: t.faint }} data-testid="chip-file-status">
                <History style={{ width: 13, height: 13 }} />
                Not tested
              </span>
            ) : (
              <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-[12px] font-medium ml-1.5" style={{ color: t.faint }} data-testid="chip-file-status">
                <Clock style={{ width: 13, height: 13 }} />
                No art yet
              </span>
            )}
            <button
              type="button"
              aria-label="Rename"
              className="flex-shrink-0 opacity-0 hover:opacity-100 transition-opacity"
              style={{ color: t.subink }}
              data-testid="button-rename-file"
            >
              <Pencil style={{ width: 13, height: 13 }} />
            </button>
          </div>
          {/* Source file line — reads "Originally …" like the press card. */}
          <div className="text-[11px] mt-0.5 truncate" style={{ color: t.faint }} title={MOCK_RAW.sourceFile}>
            Originally {MOCK_RAW.sourceFile}
          </div>
          {/* Dims · layers · uploaded — only once something is uploaded, verbatim
              press grammar ("… mm · NN GT layers read · uploaded … by you"). */}
          {uploaded ? (
            <div className="text-[12px] mt-0.5 truncate" style={{ color: t.subink }} title={`${MOCK_RAW.dims} · ${MOCK_RAW.layers} GT layers read · uploaded ${MOCK_RAW.uploadedAt} by you`}>
              {MOCK_RAW.dims} &middot; {MOCK_RAW.layers} GT layers read &middot; uploaded {MOCK_RAW.uploadedAt} by you
            </div>
          ) : (
            <div className="text-[12px] mt-0.5 truncate" style={{ color: t.subink }}>
              {MOCK_RAW.dims} &middot; drop art to run the measured checks
            </div>
          )}
        </div>
        {/* Right group — quiet Cancel + earn-its-blue Save. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {dirty && (
            <button
              type="button"
              onClick={onCancel}
              className={cn('h-8 px-2.5 rounded-full text-[12.5px] font-medium transition-colors', t.hoverCard)}
              style={{ color: t.subink }}
              data-testid="button-cancel-file"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-colors disabled:cursor-default"
            style={dirty
              ? { backgroundColor: BLUE, color: '#fff' }
              : { backgroundColor: 'transparent', color: t.subink, border: `1px solid ${t.hairline}` }}
            data-testid="button-save-file"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function MrpTemplateCanvas({ t, hasArt, onUpload, onConfirm, onCloseDialog, dialogOpen }: {
  t: Theme;
  hasArt: boolean;
  onUpload: () => void;
  onConfirm: () => void;
  onCloseDialog: () => void;
  dialogOpen: boolean;
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-2xl"
      style={{ background: t.card, border: `1px solid ${t.hairline}`, padding: '28px 32px' }}
      data-testid="mrp-template"
    >
      <div className="flex justify-center">
        <div
          className="relative overflow-hidden rounded-lg"
          style={{ width: '100%', maxWidth: 900, aspectRatio: `${JACKET_ASPECT}`, background: '#ffffff', border: `1px solid ${t.hairline}` }}
          data-testid="mrp-sheet"
        >
          {/* The template render — real MRP PDF asset, edge to edge. */}
          <img src={mrpTemplate} alt={`${MOCK_MRP.title} template`} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain' }} draggable={false} data-testid="mrp-spread" />

          {/* Sheet-scoped scrim + drop box — only until art lands. You can still
              read the template under it and flip the toggle above. */}
          {!hasArt && !dialogOpen && (
            <TemplateDropBox onUpload={onUpload} title="Drag & drop your template" testid="mrp-drop" />
          )}

          {/* The upload dialog scoped to THIS sheet only — the rail, header and
              mode toggle above stay crisp and clickable (Bill, round 5). */}
          {dialogOpen && (
            <UploadDialog
              t={t}
              title="Upload template"
              variant="contained"
              onClose={onCloseDialog}
              onConfirm={onConfirm}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// The upload dialog — the already-built canon pattern (scrim + card, X close
// top-right, Upload file / Paste a URL segmented, one subtext line, Cancel quiet
// borderless left of the rightmost confirm). Reused verbatim in grammar from
// PressTemplatesUpload's add-template modal, sized down. Dead-end.
function UploadDialog({ t, title, onClose, onConfirm, variant = 'screen' }: { t: Theme; title: string; onClose: () => void; onConfirm?: () => void; variant?: 'screen' | 'contained' }) {
  const [source, setSource] = useState<'Upload file' | 'Paste a URL'>('Upload file');
  // Canon rule "Confirm buttons earn their blue" — the confirm stays a quiet
  // dark-gray-outline pill until the user has done something actionable: chosen a
  // mock file (clicking the drop-zone) or typed a URL.
  const [fileChosen, setFileChosen] = useState(false);
  const [urlText, setUrlText] = useState('');
  const canConfirm = source === 'Upload file' ? fileChosen : urlText.trim().length > 0;
  // 'contained' scopes the scrim to the parent (the template sheet viewport)
  // instead of the whole screen — the rail/header/toggle stay crisp and live.
  const contained = variant === 'contained';
  return (
    <div
      className={cn('flex items-center justify-center', contained ? 'absolute inset-0 z-20' : 'fixed inset-0 z-40')}
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', padding: contained ? 16 : 20 }}
      data-testid="upload-dialog-scrim"
      onClick={onClose}
    >
      <div
        className="rounded-2xl overflow-hidden w-full"
        style={{ maxWidth: 460, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="upload-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — title + one subtext line, X close top-right gray circle. */}
        <div className="flex items-start justify-between gap-4" style={{ padding: '20px 22px 0' }}>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{title}</h2>
            <p className="text-[12.5px]" style={{ marginTop: 3, color: t.subink }}>Press-ready art for {MOCK_RAW.release} &mdash; we validate it automatically.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn('w-8 h-8 -mr-1 rounded-full flex items-center justify-center flex-shrink-0 transition-colors', t.hoverCard)}
            style={{ background: t.soft, color: t.subink }}
            aria-label="Close"
            data-testid="button-close-dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div style={{ padding: '16px 22px 0' }}>
          {/* Source toggle — canon segmented control. */}
          <div className="inline-flex items-center rounded-full" style={{ padding: 3, background: t.soft }} role="tablist" aria-label="File source" data-testid="dialog-source">
            {(['Upload file', 'Paste a URL'] as const).map((label) => {
              const on = source === label;
              return (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSource(label)}
                  className="rounded-full transition-colors"
                  style={{ padding: '5px 14px', fontSize: 12.5, fontWeight: on ? 600 : 500, color: on ? t.ink : t.faint, background: on ? t.card : 'transparent', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.16)' : 'none' }}
                  data-testid={`dialog-tab-${label === 'Upload file' ? 'upload' : 'url'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {source === 'Upload file' ? (
            <button
              type="button"
              onClick={() => setFileChosen(true)}
              className={cn('mt-3 w-full rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-colors', t.hoverCard)}
              style={{ border: `1.5px ${fileChosen ? 'solid' : 'dashed'} ${fileChosen ? t.subink : t.dashed}`, padding: '26px 20px' }}
              data-testid="dialog-drop"
            >
              {fileChosen ? (
                <>
                  <FileImage className="w-6 h-6" style={{ color: t.subink }} />
                  <span className="text-[13.5px] font-medium" style={{ color: t.ink }}>{MOCK_RAW.release}_art.pdf</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: t.subink }}><Check className="w-3.5 h-3.5" strokeWidth={2.5} /> File chosen · click to replace</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6" style={{ color: t.subink }} />
                  <span className="text-[13.5px] font-medium" style={{ color: t.ink }}>Drag a file here, or click to pick</span>
                  <span className="text-[12px]" style={{ color: t.faint }}>PDF, PNG or TIFF · CMYK · 300 PPI+</span>
                </>
              )}
            </button>
          ) : (
            <div className="mt-3 w-full rounded-2xl flex flex-col items-center justify-center gap-2.5" style={{ border: `1.5px dashed ${t.dashed}`, padding: '26px 20px' }} data-testid="dialog-url">
              <div className="w-full flex items-center gap-2.5">
                <input
                  value={urlText}
                  onChange={(e) => setUrlText(e.target.value)}
                  placeholder="https://… paste a link to your file"
                  className="flex-1 h-9 px-3.5 rounded-full text-[12.5px] focus:outline-none"
                  style={{ background: t.soft, border: `1px solid ${t.hairline}`, color: t.ink }}
                  data-testid="input-dialog-url"
                />
              </div>
              <span className="text-[12px]" style={{ color: t.faint }}>We fetch the file from the link · validated automatically</span>
            </div>
          )}
        </div>

        {/* Footer — Cancel quiet borderless left, confirm filled-blue rightmost. */}
        <div className="flex items-center justify-end gap-2" style={{ padding: '18px 22px 20px' }}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ padding: '0 14px', height: 38, color: t.subink, background: 'transparent' }}
            data-testid="button-dialog-cancel"
          >
            Cancel
          </button>
          {/* Canon "Confirm buttons earn their blue": quiet dark-gray-outline pill
              until an action is valid, then filled blue. */}
          <button
            type="button"
            onClick={canConfirm ? (onConfirm ?? onClose) : undefined}
            aria-disabled={!canConfirm}
            className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors', canConfirm && 'hover:opacity-90')}
            style={
              canConfirm
                ? { height: 38, padding: '0 20px', fontSize: 13, background: BLUE, color: '#fff', border: '1px solid transparent' }
                : { height: 38, padding: '0 20px', fontSize: 13, background: 'transparent', color: t.subink, border: `1px solid ${t.dot}`, cursor: 'not-allowed' }
            }
            data-testid="button-dialog-confirm"
          >
            <Upload className="w-4 h-4" style={{ color: canConfirm ? '#fff' : t.subink }} /> {source === 'Upload file' ? 'Upload' : 'Fetch file'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Overlay-chip row — mirrors the Test/Certify canvas grammar verbatim: quiet
// hairline chips whose WORD carries the on/off state (ring dot + "Bleed off" →
// filled dot + "Bleed on"). Never color-only. Reused above the panel boxes and
// on the stitched preview.
// Zoom steps for the stepper (mirrors the press ZOOMS ladder).
const OVERLAY_ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

// The full press-side overlay chip row, reused verbatim: ring-dot toggle chips
// (Bleed · Cut · Spine) + consolidated Front · Back chips with a chevron
// dropdown (Cover / Safety / Foil), then the right-side cluster — a Line / Area
// segmented toggle (PenLine / PaintBucket) and a zoom stepper (− · ZoomIn NN% · +).
function OverlayChipRow({ t, state, onToggle }: { t: Theme; state: Record<string, boolean>; onToggle: (id: string) => void }) {
  const [openGroup, setOpenGroup] = useState<null | 'front' | 'back'>(null);
  const [viewMode, setViewMode] = useState<'line' | 'area'>('line');
  const [zoom, setZoom] = useState(1);
  const stepZoom = (dir: 1 | -1) => setZoom((z) => {
    const i = OVERLAY_ZOOMS.indexOf(z as (typeof OVERLAY_ZOOMS)[number]);
    const ni = Math.min(OVERLAY_ZOOMS.length - 1, Math.max(0, (i === -1 ? 2 : i) + dir));
    return OVERLAY_ZOOMS[ni];
  });

  const SimpleChip = ({ id, label }: { id: string; label: string }) => {
    const on = !!state[id];
    return (
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={cn('inline-flex items-center gap-1.5 h-7 rounded-full text-[12px] font-medium transition-colors', t.hoverCard)}
        style={{ padding: '0 12px', color: on ? t.ink : t.subink, border: `1px solid ${on ? t.subink : t.hairline}`, background: on ? t.soft : 'transparent' }}
        aria-pressed={on}
        data-testid={`overlay-${id}`}
      >
        <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, border: `1.5px solid ${on ? t.ink : t.faint}`, background: on ? t.ink : 'transparent' }} />
        {label} {on ? 'on' : 'off'}
      </button>
    );
  };

  const GroupChip = ({ side }: { side: 'front' | 'back' }) => {
    const parts = OVERLAY_GROUPS[side];
    const onParts = parts.filter((p) => state[p.id]);
    const anyOn = onParts.length > 0;
    const label = side === 'front' ? 'Front' : 'Back';
    const status = anyOn ? onParts.map((p) => p.label).join(' + ') : 'off';
    return (
      <div className="relative">
        <div
          className="inline-flex items-center h-7 rounded-full overflow-hidden"
          style={{ border: `1px solid ${anyOn ? t.subink : t.hairline}`, background: anyOn ? t.soft : 'transparent' }}
        >
          <button
            type="button"
            onClick={() => {
              if (onParts.length > 0) parts.forEach((p) => { if (state[p.id]) onToggle(p.id); });
              else parts.forEach((p) => { if (!state[p.id]) onToggle(p.id); });
            }}
            className="inline-flex items-center gap-1.5 h-full pl-3 pr-1.5 text-[12px] font-medium"
            style={{ color: anyOn ? t.ink : t.subink }}
            data-testid={`overlay-${side}`}
          >
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, border: `1.5px solid ${anyOn ? t.ink : t.faint}`, background: anyOn ? t.ink : 'transparent' }} />
            {label} <span style={{ color: t.faint }}>{status}</span>
          </button>
          <button
            type="button"
            onClick={() => setOpenGroup((g) => (g === side ? null : side))}
            aria-label={`${label} options`}
            aria-expanded={openGroup === side}
            className="h-full pl-1 pr-2 inline-flex items-center"
            style={{ color: t.subink, borderLeft: `1px solid ${anyOn ? t.subink : t.hairline}` }}
            data-testid={`overlay-${side}-menu`}
          >
            <ChevronDown style={{ width: 13, height: 13, transform: openGroup === side ? 'rotate(180deg)' : undefined, transition: 'transform 120ms' }} />
          </button>
        </div>
        {openGroup === side && (
          <>
            <div className="fixed inset-0 z-[65]" onClick={() => setOpenGroup(null)} data-testid={`overlay-${side}-backdrop`} />
            <div
              className="absolute z-[66] mt-1.5 rounded-xl overflow-hidden shadow-xl"
              style={{ background: t.card, border: `1px solid ${t.hairline}`, minWidth: 150 }}
              role="menu"
              data-testid={`overlay-menu-${side}`}
            >
              {parts.map((p) => {
                const on = !!state[p.id];
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => onToggle(p.id)}
                    className={cn('w-full flex items-center justify-between gap-3 px-3.5 py-2 text-[12px] font-medium text-left transition-colors', t.hoverCard)}
                    style={{ color: t.ink }}
                    data-testid={`overlay-menuitem-${p.id}`}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, border: `1.5px solid ${on ? t.ink : t.faint}`, background: on ? t.ink : 'transparent' }} />
                      {p.label}
                    </span>
                    <span style={{ color: on ? BLUE : t.faint }}>{on ? 'on' : 'off'}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap w-full" data-testid="overlay-chips">
      {/* Left — the overlay toggle chips. */}
      <div className="flex items-center gap-2 flex-wrap">
        {OVERLAY_SIMPLE.map((c) => <SimpleChip key={c.id} id={c.id} label={c.label} />)}
        <GroupChip side="front" />
        <GroupChip side="back" />
      </div>
      {/* Right — Line / Area toggle + zoom stepper (press cluster, verbatim). */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="inline-flex items-center rounded-full p-0.5" style={{ background: t.soft }} role="group" aria-label="Overlay view" data-testid="overlay-view-mode">
          {(['line', 'area'] as const).map((m) => {
            const on = viewMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-semibold transition-colors"
                style={{ background: on ? t.card : 'transparent', color: on ? t.ink : t.subink, boxShadow: on ? PILL_SHADOW : undefined }}
                aria-pressed={on}
                data-testid={`overlay-view-${m}`}
              >
                {m === 'line' ? <PenLine style={{ width: 12, height: 12 }} /> : <PaintBucket style={{ width: 12, height: 12 }} />}
                {m === 'line' ? 'Line' : 'Area'}
              </button>
            );
          })}
        </div>
        <div className="inline-flex items-center h-7 rounded-full overflow-hidden" style={{ border: `1px solid ${zoom !== 1 ? BLUE : t.hairline}` }} data-testid="overlay-zoom">
          <button
            type="button"
            onClick={() => stepZoom(-1)}
            disabled={zoom <= OVERLAY_ZOOMS[0]}
            aria-label="Zoom out"
            className="h-full px-2.5 text-[14px] font-semibold disabled:opacity-40"
            style={{ color: t.subink }}
            data-testid="overlay-zoom-out"
          >
            &minus;
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            title="Reset to 100%"
            aria-label="Reset zoom to 100%"
            className="inline-flex items-center gap-1 px-1 h-full text-[11px] font-semibold tabular-nums"
            style={{ color: zoom !== 1 ? BLUE : t.subink, minWidth: 54, justifyContent: 'center', cursor: zoom !== 1 ? 'pointer' : 'default' }}
            data-testid="overlay-zoom-level"
          >
            <ZoomIn style={{ width: 12, height: 12 }} />
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => stepZoom(1)}
            disabled={zoom >= OVERLAY_ZOOMS[OVERLAY_ZOOMS.length - 1]}
            aria-label="Zoom in"
            className="h-full px-2.5 text-[14px] font-semibold disabled:opacity-40"
            style={{ color: t.subink }}
            data-testid="overlay-zoom-in"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

// ONE large viewport for the selected area (Front / Back / Spine) — the press-
// side per-segment grammar: the selected panel's region of the real template is
// CROPPED + ZOOMED to fill the white sheet card (Front = front panel, Back = back
// panel, Spine = the tall thin strip). No spotlight, no highlight ring — the
// zoomed region IS the view. The crop is a pure CSS background (background-size +
// background-position) so the template stays undistorted at any width; the
// viewport takes the region's true pixel aspect. Until art is seated, the canon
// The ••• menu items for the artist toolbar — canon white rounded-xl menu, word
// + icon rows (reused from the press ••• / the WallCardTile cover menu grammar).
// Artists don't certify, so no Test & Certify anywhere; these are file actions.
const FILE_MENU: Array<{ id: string; label: string; icon: typeof ArrowRight }> = [
  { id: 'history', label: 'File history', icon: History },
  { id: 'download', label: 'Download raw template', icon: Download },
  { id: 'replace', label: 'Replace file', icon: Upload },
];

// The view toolbar — reused VERBATIM from the press-side Test/Certify view row:
// a segmented view pill on the LEFT (Full Template · Back · Front · Spine, in that
// order) and a right cluster of ghost circle buttons. The ONE difference for the
// artist: NO "Test & Certify" pill (artists don't certify) — just the layers
// ghost circle + the ••• ghost circle. "Full Template" plays the role of the
// whole-sheet view; in images mode it stays locked until all three panels have
// art. The ••• opens the small white canon menu (File history / Download raw
// template / Replace file). Mock actions.
function ViewToolbar({ t, area, onArea, fullLocked, onMenu }: {
  t: Theme;
  area: PanelId | 'all';
  onArea: (v: PanelId | 'all') => void;
  fullLocked: boolean;
  onMenu: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap" data-testid="view-toolbar">
      {/* Left — segmented view pill, press order: Full Template · Back · Front · Spine. */}
      <div className="inline-flex items-center rounded-full p-0.5 flex-shrink-0" style={{ background: t.soft }} role="radiogroup" aria-label="Preview view" data-testid="chip-view-area">
        {([['all', 'Full Template'], ['back', 'Back'], ['front', 'Front'], ['spine', 'Spine']] as const).map(([v, label]) => {
          const on = area === v;
          const locked = v === 'all' && fullLocked;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={locked}
              disabled={locked}
              onClick={() => { if (!locked) onArea(v); }}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-[12.5px] transition-colors"
              style={{
                fontWeight: on ? 600 : 500,
                color: locked ? t.faint : on ? t.ink : t.subink,
                background: on ? t.card : 'transparent',
                boxShadow: on ? PILL_SHADOW : undefined,
                opacity: locked ? 0.55 : 1,
                cursor: locked ? 'not-allowed' : 'pointer',
              }}
              title={locked ? 'Add front, back and spine art to see the full spread' : undefined}
              data-testid={`chip-area-${v}`}
            >
              {locked && <Lock className="w-3 h-3 flex-shrink-0" style={{ color: t.faint }} aria-hidden />}
              {label}
            </button>
          );
        })}
      </div>

      {/* Right — ghost circle cluster. NO Test & Certify (artists don't certify). */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          title="Layers read from the file"
          aria-label="Layers read from the file"
          className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors"
          style={{ border: `1px solid ${t.hairline}`, color: t.subink, background: 'transparent' }}
          data-testid="button-show-layers"
        >
          <Layers style={{ width: 14, height: 14 }} />
        </button>
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="w-8 h-8 rounded-full inline-flex items-center justify-center transition-colors"
            style={{ border: `1px solid ${t.hairline}`, color: t.subink }}
            data-testid="button-file-overflow"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} data-testid="file-menu-backdrop" />
              <div
                className="absolute z-20 rounded-xl overflow-hidden"
                style={{ top: 'calc(100% + 6px)', right: 0, minWidth: 216, background: t.card, border: `1px solid ${t.hairline}`, boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}
                role="menu"
                data-testid="file-menu-list"
              >
                {FILE_MENU.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onMenu(m.id); }}
                    className={cn('w-full flex items-center gap-2.5 text-left text-[13px] transition-colors', t.hoverCard)}
                    style={{ padding: '10px 14px', color: t.ink, borderTop: i === 0 ? 'none' : `1px solid ${t.hairline}` }}
                    data-testid={`file-menu-${m.id}`}
                  >
                    <m.icon className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} /> {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// dark drag & drop box floats over a dimmed copy of the zoomed region; once
// seated, the region shows the art crop with the toggled overlay line work.
function PanelViewport({ t, panel, hasArt, overlay, onUpload, onCloseDialog, onConfirm, dialogOpen }: {
  t: Theme;
  panel: (typeof MOCK_PANELS)[number];
  hasArt: boolean;
  overlay: Record<string, boolean>;
  onUpload: () => void;
  onCloseDialog: () => void;
  onConfirm: () => void;
  dialogOpen: boolean;
}) {
  const RED = 'rgba(200,60,60,0.85)';
  const BLUELINE = 'rgba(120,170,220,0.95)';
  const r = PANEL_REGIONS[panel.id];
  const isSpine = panel.id === 'spine';
  // Viewport aspect = the region's true pixel aspect on the sheet. Background
  // crop: scale the sheet so the region fills the viewport, then offset to it.
  const regionAspect = (r.width * JACKET_ASPECT) / r.height;
  const cropStyle: CSSProperties = {
    backgroundImage: `url(${mrpTemplate})`,
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#ffffff',
    backgroundSize: `${(1 / r.width) * 100}% auto`,
    backgroundPosition: `${(r.left / (1 - r.width)) * 100}% ${(r.top / (1 - r.height)) * 100}%`,
  };
  return (
    <div
      className="w-full overflow-hidden rounded-2xl"
      style={{ background: t.card, border: `1px solid ${t.hairline}`, padding: '28px 32px' }}
      data-testid="panel-viewport"
    >
      <div className="relative flex items-center justify-center" style={{ minHeight: 360 }}>
        <div
          className="group relative block overflow-hidden rounded-lg"
          style={{
            height: 460,
            maxHeight: '70vh',
            aspectRatio: `${regionAspect}`,
            maxWidth: '100%',
            background: '#ffffff',
            border: `1px solid ${t.hairline}`,
            ...(hasArt ? {} : cropStyle),
          }}
          data-testid={`panel-box-${panel.id}`}
        >
          {hasArt && (
            <button
              type="button"
              onClick={onUpload}
              className="absolute inset-0 block"
              data-testid={`panel-art-${panel.id}`}
              aria-label={`${panel.label} — replace art`}
            >
              <span className="absolute inset-0" style={{ background: panel.art }} />
              {/* Template line work overlaid on the seated art, toggled by the
                  overlay chips (bleed / cut are global; the panel's own Cover +
                  Safety come from the Front/Back group chips; spine has its own). */}
              {overlay.bleed && <span className="absolute" style={{ inset: 4, border: `1px dashed ${BLUELINE}` }} aria-hidden />}
              {overlay.cut && <span className="absolute" style={{ inset: 8, border: `1px solid ${RED}` }} aria-hidden />}
              {(isSpine ? overlay.spine : overlay[`${panel.id}-cover`]) && <span className="absolute" style={{ inset: 0, border: `1.5px solid ${RED}` }} aria-hidden />}
              {!isSpine && overlay[`${panel.id}-safety`] && <span className="absolute" style={{ inset: 20, border: `1px dashed ${BLUELINE}` }} aria-hidden />}
              {!isSpine && <span className="absolute top-2 left-2 text-[11px] font-semibold rounded-md" style={{ padding: '2px 7px', color: '#fff', background: 'rgba(20,20,22,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>{panel.label}</span>}
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(20,20,22,0.34)' }}>
                <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium" style={{ padding: '6px 12px', color: '#fff', background: 'rgba(20,20,22,0.6)', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <Upload className="w-3.5 h-3.5" /> Replace
                </span>
              </span>
            </button>
          )}
        </div>

        {/* Empty state — the contained dialog, or the canon dark drop box. Both
            overlay the OUTER container (not the narrow zoomed region), so the box
            is the SAME standard size on every panel including the thin spine. The
            dimmed zoomed region stays behind it as-is; the box just floats over it,
            capped at 90% of the outer container on small widths. */}
        {!hasArt && (dialogOpen ? (
          <UploadDialog
            t={t}
            title={`Upload ${panel.label.toLowerCase()} art`}
            variant="contained"
            onClose={onCloseDialog}
            onConfirm={onConfirm}
          />
        ) : (
          <TemplateDropBox onUpload={onUpload} title={`Drag & drop your ${panel.label} art`} testid={`panel-drop-${panel.id}`} />
        ))}
      </div>
    </div>
  );
}

function SceneRawTemplate({ t, onCrumb }: { t: Theme; onCrumb: () => void }) {
  // Two entry modes toggled by the canon segmented control: per-panel image
  // upload, or the full press template.
  const [mode, setMode] = useState<'images' | 'template'>('images');
  // Images-mode viewport focus — mirrors the press-side Test/Certify view pill:
  // Front · Back · Spine · All. 'all' is the stitched full spread (replaces the
  // old separate Preview action), disabled until all three panels have art.
  const [area, setArea] = useState<PanelId | 'all'>('front');
  const [dialog, setDialog] = useState<null | 'images' | 'template' | PanelId>(null);
  // Mock upload state — clicking Upload in the dialog seats the mock crop.
  const [panelArt, setPanelArt] = useState<Record<PanelId, boolean>>({ front: false, back: false, spine: false });
  const [templateArt, setTemplateArt] = useState(false);
  // Overlay toggles shared across both modes (Test/Certify grammar). Kept a
  // single easily-swappable component (OverlayChipRow) for later consolidation.
  const [overlay, setOverlay] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(OVERLAY_IDS.map((id) => [id, false])),
  );
  // Transparency check on the stitched (All) view.
  const [transparent, setTransparent] = useState(false);
  // File-header card: Save is the one act that persists — it earns its blue only
  // once there's unsaved work (something uploaded since the last Save).
  const [saved, setSaved] = useState(false);

  const anyArt = panelArt.front || panelArt.back || panelArt.spine;
  const allArt = panelArt.front && panelArt.back && panelArt.spine;
  const hasArt = mode === 'template' ? templateArt : anyArt;
  const toggleOverlay = (id: string) => setOverlay((s) => ({ ...s, [id]: !s[id] }));

  // The dialog's confirm seats mock art for whichever target is uploading.
  const seatArt = () => {
    if (dialog === 'front' || dialog === 'back' || dialog === 'spine') {
      setPanelArt((s) => ({ ...s, [dialog]: true }));
    } else if (dialog === 'images') {
      setPanelArt({ front: true, back: true, spine: true });
    } else if (dialog === 'template') {
      setTemplateArt(true);
    }
    setSaved(false); // fresh upload = unsaved work; Save earns its blue
    setDialog(null);
  };
  const anyUpload = anyArt || templateArt;

  // Keep the view pill sensible when switching modes: template mode opens on the
  // whole-sheet "Full Template" view; images mode leaves Full Template only when
  // it's still locked (not all three panels in yet).
  useEffect(() => {
    if (mode === 'template') setArea('all');
    else if (area === 'all' && !allArt) setArea('front');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1080, padding: '32px 40px 96px' }} data-testid="scene-rawtemplate">
      {/* Apple-canon breadcrumb: faint crumb link, ChevronRight, current in ink. */}
      <div className="flex items-center gap-1.5 text-[13px]" data-testid="raw-breadcrumb">
        <button type="button" onClick={onCrumb} className="font-medium transition-opacity hover:opacity-80" style={{ color: t.faint }} data-testid="crumb-releases-raw">Releases</button>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} aria-hidden />
        <span className="font-medium" style={{ color: t.ink }}>{MOCK_RAW.release}</span>
      </div>

      <h1 style={{ marginTop: 12, fontSize: 30, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.12 }}>
        <span style={{ color: t.ink }}>Add your art. </span>
        <span style={{ color: t.subink, fontWeight: 500 }}>Straight onto the template.</span>
      </h1>
      <p className="text-[13.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
        {MOCK_RAW.release} doesn&rsquo;t have print art yet. Add your front, back and spine art below, or drop the full {MOCK_RAW.templateName} &mdash; we&rsquo;ll check it against the press spec the moment it lands.
      </p>

      {/* Status — word + icon, quiet, never color alone. Reflects mock state. */}
      <div className="rounded-2xl" style={{ marginTop: 22, padding: '16px 20px', border: `1px solid ${t.hairline}`, background: t.card }} data-testid="raw-pending">
        <div className="flex items-center gap-3">
          {anyArt ? (
            <BadgeCheck className="w-5 h-5 flex-shrink-0" style={{ color: t.subink }} aria-hidden />
          ) : (
            <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, border: `2px solid ${t.subink}` }} />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold" style={{ color: t.ink }}>
              {allArt ? 'Art placed — see the full spread' : anyArt ? 'Art started — some panels still pending' : 'Pending — no art uploaded yet'}
            </div>
            <div className="text-[12.5px]" style={{ marginTop: 2, color: t.faint }}>{MOCK_RAW.spec}</div>
          </div>
        </div>
      </div>

      {/* Toolbar — ONE canon segmented control (Upload images / Upload template)
          on the left, quiet "Download raw template" on the right. */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 16 }}>
        <SegChip
          options={[['images', 'Upload images'], ['template', 'Upload template']]}
          value={mode}
          onChange={(v) => setMode(v)}
          ariaLabel="Upload mode"
          testPrefix="raw-entry-chips"
          t={t}
          icons={{ images: ImagePlus, template: LayoutTemplate }}
        />
        <button
          type="button"
          className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
          style={{ padding: '7px 14px', color: t.subink, border: `1px solid ${t.hairline}` }}
          data-testid="button-download-raw"
        >
          <Download className="w-4 h-4 flex-shrink-0" /> Download raw template
        </button>
      </div>

      {/* View toolbar — reused press-side view row verbatim (Full Template · Back ·
          Front · Spine segmented pill + layers / ••• ghost circles), in BOTH modes.
          No Test & Certify — artists don't certify. "Full Template" plays the role
          of the whole-sheet view; in images mode it stays locked until all three
          panels have art. In template mode picking a panel zooms into the uploaded
          template; Full Template is the whole sheet. */}
      <div style={{ marginTop: 16 }}>
        <ViewToolbar
          t={t}
          area={area}
          onArea={setArea}
          fullLocked={mode === 'images' && !allArt}
          onMenu={(id) => { if (id === 'replace') setDialog(mode === 'template' ? 'template' : (area === 'all' ? 'front' : area)); }}
        />
      </div>

      {/* Transparency check — its own quiet control, only on the Full Template view
          once all art is in (both modes read the stitched/whole sheet there). */}
      {area === 'all' && ((mode === 'images' && allArt) || (mode === 'template' && templateArt)) && (
        <div className="flex items-center justify-end" style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setTransparent((v) => !v)}
            className={cn('inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors', t.hoverCard)}
            style={{ padding: '7px 14px', color: transparent ? t.ink : t.subink, border: `1px solid ${t.hairline}`, background: transparent ? t.soft : 'transparent' }}
            aria-pressed={transparent}
            data-testid="button-transparency"
          >
            {transparent ? <Eye className="w-4 h-4 flex-shrink-0" /> : <EyeOff className="w-4 h-4 flex-shrink-0" />}
            Transparency {transparent ? 'on' : 'off'}
          </button>
        </div>
      )}

      {/* Full overlay chip row (reused press-side grammar) — its own full-width
          row in both modes, only after art/template exists (same gating as
          before). */}
      {((mode === 'images' && anyArt) || (mode === 'template' && templateArt)) && (
        <div style={{ marginTop: 16 }}>
          <OverlayChipRow t={t} state={overlay} onToggle={toggleOverlay} />
        </div>
      )}

      {/* File-header card — reused press-side card grammar, sits on top of the
          template view in both modes. */}
      <div style={{ marginTop: 16 }}>
        <FileHeaderCard
          t={t}
          uploaded={anyUpload}
          dirty={anyUpload && !saved}
          onCancel={() => { setPanelArt({ front: false, back: false, spine: false }); setTemplateArt(false); setSaved(false); }}
          onSave={() => setSaved(true)}
        />
      </div>

      {/* Canvas — one large viewport, switched by mode / area. Full Template =
          the whole sheet (template mode: MrpTemplateCanvas; images mode: the
          stitched spread). A panel = the zoomed per-panel viewport. */}
      <div style={{ marginTop: 14 }}>
        {area === 'all' && mode === 'template' && (
          <MrpTemplateCanvas t={t} hasArt={templateArt} onUpload={() => setDialog('template')} onConfirm={seatArt} onCloseDialog={() => setDialog(null)} dialogOpen={dialog === 'template'} />
        )}

        {area === 'all' && mode === 'images' && (
          <div data-testid="all-view">
            <StitchedPreview t={t} panelArt={panelArt} transparent={transparent} />
          </div>
        )}

        {area !== 'all' && (
          <div data-testid="images-view">
            <PanelViewport
              t={t}
              panel={MOCK_PANELS.find((p) => p.id === area)!}
              hasArt={mode === 'template' ? templateArt : panelArt[area]}
              overlay={overlay}
              onUpload={() => setDialog(mode === 'template' ? 'template' : area)}
              onConfirm={seatArt}
              onCloseDialog={() => setDialog(null)}
              dialogOpen={mode === 'template' ? dialog === 'template' : dialog === area}
            />
          </div>
        )}
      </div>

      {/* The template dialog is scoped to the sheet viewport (MrpTemplateCanvas)
          and each panel dialog is scoped to its zoomed viewport (PanelViewport).
          Only the bulk "images" dialog, if ever triggered, renders at screen
          level — panels no longer use it. */}
      {dialog === 'images' && (
        <UploadDialog
          t={t}
          title="Upload images"
          onClose={() => setDialog(null)}
          onConfirm={seatArt}
        />
      )}
    </div>
  );
}

// Stitched full-template preview (the "All" view) — the WHOLE real MRP template
// crisp, with each panel's seated art dropped into its region (Back · spine ·
// Front). The transparency check drops the art to ~45% so the template header,
// panels and line work show through beneath, confirming the fit against the spec.
function StitchedPreview({ t, panelArt, transparent }: { t: Theme; panelArt: Record<PanelId, boolean>; transparent: boolean }) {
  const artOpacity = transparent ? 0.45 : 1;
  const byId = (id: PanelId) => MOCK_PANELS.find((p) => p.id === id)!;
  const seg = (id: PanelId) => {
    const rr = PANEL_REGIONS[id];
    return (
      <div
        key={id}
        className="absolute"
        style={{ left: pct(rr.left), top: pct(rr.top), width: pct(rr.width), height: pct(rr.height) }}
        data-testid={`stitch-${id}`}
      >
        {panelArt[id] && <div className="absolute inset-0" style={{ background: byId(id).art, opacity: artOpacity }} />}
      </div>
    );
  };
  return (
    <div
      className="w-full overflow-hidden rounded-2xl"
      style={{ background: t.card, border: `1px solid ${t.hairline}`, padding: '28px 32px' }}
      data-testid="stitched-preview"
    >
      <div className="relative mx-auto overflow-hidden rounded-lg" style={{ width: '100%', maxWidth: 900, aspectRatio: `${JACKET_ASPECT}`, background: '#fff', border: `1px solid ${t.hairline}` }}>
        {/* The real template, crisp — the whole sheet. */}
        <img src={mrpTemplate} alt={`${MOCK_MRP.title} template`} className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain' }} draggable={false} />
        {/* Seated art dropped into each region. Transparency lets the template
            show through to check the fit. */}
        {seg('back')}
        {seg('spine')}
        {seg('front')}
      </div>
      <div className="flex items-center justify-center gap-2" style={{ marginTop: 12 }}>
        <span className="text-[11.5px]" style={{ color: t.faint }}>
          {transparent ? 'Art at 45% — the template shows through to check the fit' : 'Full template · your art seated into back, spine and front'}
        </span>
      </div>
    </div>
  );
}

function SceneReports({ t }: { t: Theme }) {
  const [tab, setTab] = useState('payments');
  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Reports. </span>
        <span style={{ color: t.subink }}>How am I doing?</span>
      </h1>
      <p className="text-[13.5px]" style={{ marginTop: 8, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
        Audience, Acquisition, and Buyers folded in here as tabs — all read-only analytics about one funnel. Two money ledgers sit side by side and are never netted.
      </p>

      <div className="flex items-center gap-1 overflow-x-auto" style={{ marginTop: 22, borderBottom: `1px solid ${t.hairline}` }}>
        {REPORTS_TABS.map((r) => {
          const active = r.id === tab;
          return (
            <button key={r.id} type="button" onClick={() => setTab(r.id)} data-testid={`reports-tab-${r.id}`} className="relative inline-flex items-center gap-2 text-[14px] transition-colors whitespace-nowrap" style={{ padding: '10px 14px', fontWeight: active ? 600 : 500, color: active ? t.ink : t.subink }}>
              {!active && <span aria-hidden className="rounded-full" style={{ width: 6, height: 6, background: t.dot }} />}
              {r.label}
              {active && <span aria-hidden className="absolute left-0 right-0" style={{ bottom: -1, height: 2, background: BLUE, borderRadius: 2 }} />}
            </button>
          );
        })}
      </div>

      {tab === 'payments' || tab === 'earnings' ? (
        <>
          <div className="flex items-center gap-2.5 rounded-xl" style={{ marginTop: 20, padding: '10px 16px', background: t.soft }} data-testid="never-netted-note">
            <Lock className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} />
            <span className="text-[13px] font-semibold" style={{ color: t.ink }}>Kept separate on purpose</span>
            <span className="text-[12.5px]" style={{ color: t.subink }}>— you owe {MOCK_LEDGERS.owed.total} and you&rsquo;re owed {MOCK_LEDGERS.earned.total}. Two truths, never shown as &ldquo;$2,135.&rdquo;</span>
          </div>
          <div className="grid gap-5" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
            <LedgerCard kind="owed" t={t} />
            <LedgerCard kind="earned" t={t} />
          </div>
        </>
      ) : (
        <div className="rounded-2xl flex flex-col items-center justify-center text-center" style={{ marginTop: 20, padding: '48px 24px', border: `1px solid ${t.hairline}`, background: t.card }}>
          <p className="text-[14px] font-semibold" style={{ color: t.ink }}>{REPORTS_TABS.find((x) => x.id === tab)?.label} analytics live here.</p>
          <p className="text-[12.5px]" style={{ marginTop: 6, color: t.subink, maxWidth: 460 }}>
            {tab === 'acquisition' ? 'The campaign link builder survives as a section inside this tab.' : 'Read-only analytics about the found-it → listened → bought funnel.'}
          </p>
          <button type="button" onClick={() => setTab('payments')} className="text-[13px] font-semibold" style={{ marginTop: 14, color: BLUE }}>Show the two ledgers</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENE 7 — SETTINGS (Team + Connections, quiet hairline rows)
// The rail is static, so Settings lives here as a 7th stepper scene. Shows the
// rule directly: Shopify appears in the rail only once connected; the Store tab
// still offers inline connect that deep-links here.
// ═══════════════════════════════════════════════════════════════════
type Member = { name: string; role: string; initials: string };
const MOCK_TEAM: Member[] = [
  { name: 'Niina Soleil', role: 'Owner', initials: 'NS' },
  { name: 'Marcus Reyes', role: 'Manager', initials: 'MR' },
  { name: 'Devon Clarke', role: 'Collaborator', initials: 'DC' },
];

// A quiet hairline-row card section — same grammar as ReleaseDetails.
function SettingsSection({
  t,
  title,
  caption,
  children,
  testid,
}: {
  t: Theme;
  title: string;
  caption?: string;
  children: ReactNode;
  testid: string;
}) {
  return (
    <section style={{ marginTop: 26 }} data-testid={testid}>
      <div className="flex items-baseline justify-between gap-4" style={{ marginBottom: 12 }}>
        <h2 className="text-[15px] font-semibold" style={{ color: t.ink }}>{title}</h2>
        {caption && <span className="text-[12.5px]" style={{ color: t.faint }}>{caption}</span>}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }}>
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  t,
  first,
  left,
  right,
  testid,
  dimmed,
  clickable,
  onClick,
}: {
  t: Theme;
  first?: boolean;
  left: ReactNode;
  right: ReactNode;
  testid: string;
  dimmed?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn('flex items-center justify-between gap-6 transition-colors', clickable && cn('cursor-pointer', t.hoverWash))}
      style={{ minHeight: 60, padding: '12px 18px', borderTop: first ? undefined : `1px solid ${t.hairline}`, opacity: dimmed ? 0.55 : 1 }}
      data-testid={testid}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex items-center gap-4 flex-shrink-0">{right}</div>
    </div>
  );
}

// Apple Settings leading mark — a fixed 32px rounded-square icon TILE holding
// ONLY the glyph (never a wordmark). Hairline border + subtle card fill; in dark
// the fill lifts slightly so the mark sits naturally. Glyph centered with even
// padding so it never squishes.
function AppIconTile({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${t.hairline}`, background: t.soft }}
      aria-hidden
    >
      {children}
    </span>
  );
}

// Compact canon hairline-pill secondary sized for a settings row (quiet — not a
// filled blue; rounded-full, hairline border, subink text + chevron).
function RowActionPill({ label, t, testid }: { label: string; t: Theme; testid: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full text-[12.5px] font-semibold transition-colors', t.hoverCard)}
      style={{ padding: '5px 12px', border: `1px solid ${t.hairline}`, color: t.ink }}
      data-testid={testid}
    >
      {label} <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} />
    </span>
  );
}

function SceneSettings({ t }: { t: Theme }) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Settings. </span>
        <span style={{ color: t.subink }}>Who&rsquo;s on the account and what&rsquo;s connected.</span>
      </h1>
      <p className="text-[13.5px]" style={{ marginTop: 8, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
        Shopify shows in the rail only once a store is connected. The Store tab still offers an inline connect that deep-links right here.
      </p>

      {/* Team */}
      <SettingsSection t={t} title="Team" testid="settings-team">
        {MOCK_TEAM.map((m, i) => (
          <SettingsRow
            key={m.name}
            t={t}
            first={i === 0}
            testid={`team-row-${m.initials.toLowerCase()}`}
            left={
              <>
                <span
                  className="inline-flex items-center justify-center rounded-full flex-shrink-0 text-[12px] font-semibold"
                  style={{ width: 32, height: 32, background: t.soft, color: t.subink }}
                  aria-hidden
                >
                  {m.initials}
                </span>
                <span className="text-[14px] font-semibold min-w-0 truncate" style={{ color: t.ink }}>{m.name}</span>
              </>
            }
            right={<span className="text-[13px]" style={{ color: t.subink }}>{m.role}</span>}
          />
        ))}
        <SettingsRow
          t={t}
          testid="team-invite"
          left={
            <button type="button" className="inline-flex items-center gap-1.5 text-[13px] font-semibold transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-invite-member">
              <UserPlus className="w-4 h-4 flex-shrink-0" /> Invite
            </button>
          }
          right={<span className="text-[12.5px]" style={{ color: t.faint }}>Add a manager or collaborator</span>}
        />
      </SettingsSection>

      {/* Connections */}
      <SettingsSection t={t} title="Connections" testid="settings-connections">
        <SettingsRow
          t={t}
          first
          clickable
          onClick={() => {}}
          testid="connection-shopify"
          left={
            <>
              {/* Apple app-icon tile — glyph only, no wordmark. Interim glyph is
                  the ShoppingBag lucide mark: the shopify-logo.png asset is a
                  glyph+wordmark lockup that can't be cropped cleanly at runtime.
                  Swap in an isolated Shopify bag glyph asset when one ships. */}
              <AppIconTile t={t}>
                <ShoppingBag className="w-4 h-4" style={{ color: t.ink }} strokeWidth={2} />
              </AppIconTile>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: t.ink }}>Shopify</div>
                <div className="text-[12px]" style={{ marginTop: 2, color: t.faint }}>Sell on your own store</div>
              </div>
            </>
          }
          right={
            <>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: t.subink }} data-testid="shopify-status">
                <X className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} /> Not connected
              </span>
              <RowActionPill label="Connect" t={t} testid="button-connect-shopify" />
            </>
          }
        />
        <SettingsRow
          t={t}
          clickable
          onClick={() => {}}
          testid="connection-payout"
          left={
            <>
              {/* No Stripe asset ships in this sandbox — interim tile carries a
                  semibold "S" initial (never a fabricated Stripe mark). Swap in
                  the real Stripe glyph when an asset ships. */}
              <AppIconTile t={t}>
                <span className="text-[15px] font-semibold leading-none" style={{ color: t.ink }}>S</span>
              </AppIconTile>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold" style={{ color: t.ink }}>Stripe</div>
                <div className="text-[12px]" style={{ marginTop: 2, color: t.faint }}>Payout account — where your earnings land</div>
              </div>
            </>
          }
          right={
            <>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: t.subink }} data-testid="payout-status">
                <X className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} /> Not set up
              </span>
              <RowActionPill label="Set up" t={t} testid="button-setup-payout" />
            </>
          }
        />
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SCENES — the six reachable surfaces. Navigation is pure click-through:
// the rail (Releases / Reports / Settings), the wall cards (→ release), and
// the release breadcrumb + tab bar (which crosses between Assets / Store /
// Payments). No scene stepper.
// ═══════════════════════════════════════════════════════════════════
type SceneId = 'wall' | 'assets' | 'store' | 'payments' | 'reports' | 'settings' | 'rawtemplate';

export function ArtistPortalRestructureFlow() {
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

  const [scene, setScene] = useState<SceneId>('wall');

  // Single navigation entry point — the rail, the release breadcrumb/tab bar,
  // and the wall cards all route through this. (The old scene stepper is gone;
  // every scene is reachable purely by clicking through the pages.)
  const goScene = (s: SceneId) => { setScene(s); window.scrollTo({ top: 0 }); };
  const goRelease = () => goScene('assets');
  const goWall = () => goScene('wall');
  // GOLDENROD has never had print art uploaded — clicking it lands on the blank
  // raw press-template state (not the seated-art release view).
  const goRawTemplate = () => goScene('rawtemplate');

  return (
    <ArtistShell t={t} mode={mode} setMode={setMode} onNav={goScene}>
      {scene === 'wall' && <SceneReleasesWall t={t} onOpenRelease={goRelease} onOpenGoldenrod={goRawTemplate} />}
      {scene === 'assets' && <SceneFormats t={t} onCrumb={goWall} onJump={goScene} />}
      {scene === 'store' && <SceneStore t={t} onCrumb={goWall} onJump={goScene} />}
      {scene === 'payments' && <ScenePayments t={t} onCrumb={goWall} onJump={goScene} />}
      {scene === 'reports' && <SceneReports t={t} />}
      {scene === 'settings' && <SceneSettings t={t} />}
      {scene === 'rawtemplate' && <SceneRawTemplate t={t} onCrumb={goWall} />}
    </ArtistShell>
  );
}

export default ArtistPortalRestructureFlow;
