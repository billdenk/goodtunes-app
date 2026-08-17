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

import { useEffect, useState, type ReactNode } from 'react';
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
  MessageSquarePlus,
  UserPen,
  LogOut,
  Lock,
  Eye,
  ChevronDown,
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
  CreditCard,
  Circle,
  Clock,
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
type NavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

// Part 1: Dashboard · Releases · Orders · Reports · Shopify · Referrals, then
// Settings pinned last (standard Apple bottom position). Audience / Acquisition /
// Buyers are GONE — folded into Reports as tabs. The Shopify item is EARNED: it
// only appears once the artist has connected a Shopify store. Niina is connected
// on CALIFORNIALAND, so it shows here, below Reports.
const NAV_MAIN: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Shopify', icon: Store },
  { label: 'Referrals', icon: Gift },
  { label: 'Settings', icon: Settings },
];

function NavRow({ label, icon: Icon, active, t }: NavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
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
function ArtistShell({ children, t, mode, setMode }: { children: ReactNode; t: Theme; mode: Mode; setMode: (m: Mode) => void }) {
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
            {NAV_MAIN.map((item) => <NavRow key={item.label} {...item} t={t} />)}
          </nav>
          <div className="px-2.5 pb-2">
            <NavRow label="Team" icon={UserPlus} t={t} />
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

// Canon CTA pill — verbatim weight from PressQuoteBuilder "Send estimate" pill.
function CanonPill({ label, onClick, icon: Icon }: { label: string; onClick?: () => void; icon?: typeof ArrowRight }) {
  return (
    <Button
      className="rounded-full px-7 gap-2"
      style={{ background: BLUE, color: '#fff', height: 44, fontSize: 14.5 }}
      onClick={onClick}
      data-testid={`cta-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {label}
    </Button>
  );
}

// Word + icon status chip — copied from VerdictChip grammar (never color alone).
type StatusWord = 'requested' | 'paid' | 'held' | 'released' | 'confirmed';
function MilestoneStatus({ word, t }: { word: StatusWord; t: Theme }) {
  const map: Record<StatusWord, { label: string; color: string; bg: string; glyph: 'dot' | 'ring' | 'check' | 'lock' | 'arrow' }> = {
    requested: { label: 'Requested', color: t.subink, bg: t.soft, glyph: 'ring' },
    paid: { label: 'Paid by you', color: BLUE, bg: `${BLUE}14`, glyph: 'dot' },
    held: { label: 'Held', color: t.warnInk, bg: t.warnBg, glyph: 'lock' },
    released: { label: 'Released to press', color: BLUE, bg: `${BLUE}14`, glyph: 'arrow' },
    confirmed: { label: 'Confirmed', color: t.ready, bg: t.passBg, glyph: 'check' },
  };
  const s = map[word];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: s.bg, color: s.color }} data-testid={`milestone-status-${word}`}>
      {s.glyph === 'check' && <Check className="w-3 h-3" strokeWidth={3} />}
      {s.glyph === 'lock' && <Lock className="w-3 h-3" />}
      {s.glyph === 'arrow' && <ArrowRight className="w-3 h-3" strokeWidth={2.5} />}
      {s.glyph === 'dot' && <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, background: s.color }} />}
      {s.glyph === 'ring' && <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${s.color}` }} />}
      {s.label}
    </span>
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
  dimmed?: boolean;
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
  { id: 'goldenrod', name: 'GOLDENROD', year: '2026', badge: 'Digital live · CD at press', channel: 'shopify' },
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

function WallCardTile({ card, t, onOpen }: { card: WallCard; t: Theme; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
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
          <div className="absolute inset-0 flex items-center justify-center">
            <Disc3 style={{ width: 56, height: 56, color: t.faint, strokeWidth: 1.25 }} />
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

function SceneReleasesWall({ t, onOpenRelease }: { t: Theme; onOpenRelease: () => void }) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
        <span style={{ color: t.ink }}>Releases. </span>
        <span style={{ color: t.subink }}>Every record you&rsquo;ve made.</span>
      </h1>
      <p className="text-[13.5px]" style={{ marginTop: 8, color: t.subink, maxWidth: 620, lineHeight: 1.5 }}>
        Cards stay canon — no table, no stats header. Each shows only derived facts: its per-format status, its channel, and a money flag when there&rsquo;s something to do.
      </p>
      <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 18 }}>
        {MOCK_WALL_CARDS.map((c) => (
          <WallCardTile key={c.id} card={c} t={t} onOpen={c.id === 'californialand' ? onOpenRelease : () => {}} />
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
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
        <button type="button" onClick={onCrumb} className="transition-colors hover:opacity-80" data-testid="crumb-releases">Releases</button>
        <span style={{ color: t.dot }}>›</span>
        <span style={{ color: t.subink }}>{MOCK_RELEASE.title}</span>
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
      {/* Hero — art bleeds edge-to-edge across the top. */}
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
          <span className="w-full h-full flex items-center justify-center">
            <UploadCloud className="w-8 h-8" style={{ color: t.faint }} />
          </span>
        )}
      </span>

      {/* Info under the image — name + which file is in effect. No specs. */}
      <div className="w-full flex flex-col flex-1" style={{ padding: '14px 18px 16px' }}>
        <div className="text-[15px] font-semibold truncate" style={{ color: t.ink, letterSpacing: '-0.01em' }}>{block.title}</div>
        <div style={{ marginTop: 8 }}>
          <InheritanceChip inheritance={block.inheritance} t={t} />
        </div>

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
      Press
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
// but for ONE release. ONE filled blue max: the "Pay balance" pill.
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
// actionable item (balance due) that carries the ONE filled blue pill.
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
          one actionable item (balance due) carrying the ONE filled blue pill. */}
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
        <CanonPill label={MOCK_DASH_NEXT.cta} onClick={() => {}} />
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

function SceneFormats({ t, onCrumb }: { t: Theme; onCrumb: () => void }) {
  const [tab, setTab] = useState('assets');
  const [lane, setLane] = useState<'art' | 'audio'>('art');  // Art / Audio pair
  // Format sub tabs — the SAME list drives both Art & Audio lanes. Digital (the
  // GoodTunes Player master) sits in every list alongside the physical formats.
  const [assetFormat, setAssetFormat] = useState<'digital' | 'master' | 'vinyl'>('vinyl');

  // Vinyl (12" LP) art pieces — inherited album art vs format-specific override.
  const blocks = MOCK_LP_BLOCKS;

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} t={t} onTab={setTab} onCrumb={onCrumb} />

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

function SceneStore({ t, onCrumb }: { t: Theme; onCrumb: () => void }) {
  const [tab, setTab] = useState('store');
  const [channel, setChannel] = useState<'goodtunes' | 'shopify'>('goodtunes');
  const [gtFulfills, setGtFulfills] = useState(true);

  const checklist = MOCK_STORE.checklist;
  const ready = checklist.every((c) => c.done);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} t={t} onTab={setTab} onCrumb={onCrumb} />

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
                      style={{ padding: '16px 18px', border: `${active ? 2 : 1}px solid ${active ? BLUE : t.hairline}`, background: t.canvas }}
                    >
                      <div className="flex items-center gap-4">
                        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 72 }}>
                          <img src={o.logo} alt={o.alt} style={{ height: o.h, width: 'auto', filter: t.logoFilter }} />
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
                  <CanonPill label="Connect Shopify" onClick={() => {}} icon={ArrowRight} />
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
                <CanonPill label="Publish to fans" onClick={() => {}} icon={ArrowRight} />
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
// SCENE 5 — RELEASE PAYMENTS TAB (two project rows, expanded milestone schedule)
// ═══════════════════════════════════════════════════════════════════
type Milestone = { id: string; label: string; amount: string; status: StatusWord; note: string };
type Project = {
  id: string;
  title: string;
  press: string;
  pressLogo: string;
  summary: string;
  outstanding?: string;
  milestones?: Milestone[];
};

const MOCK_PAYMENT_PROJECTS: Project[] = [
  {
    id: 'lp',
    title: '12" LP',
    press: 'Memphis Record Pressing',
    pressLogo: mrpLabelLogo,
    summary: 'pressed by Memphis Record Pressing',
    outstanding: '$4,135 outstanding',
    // 50% hybrid — two milestones (Part 5)
    milestones: [
      { id: 'm1', label: '50% to get on the press schedule', amount: '$4,135', status: 'confirmed', note: 'You paid, we held, then released to Memphis Record Pressing — confirmed by the plant.' },
      { id: 'm2', label: 'Balance at launch', amount: '$4,135', status: 'requested', note: 'A quantity upsize at launch recalculates this balance milestone.' },
    ],
  },
  {
    id: 'cd',
    title: 'CD',
    press: 'Hellbender',
    pressLogo: hellbenderIcon,
    summary: 'pressed by Hellbender',
  },
];

function ProjectRow({ project, expanded, onToggle, t }: { project: Project; expanded: boolean; onToggle: () => void; t: Theme }) {
  const quoted = !project.milestones;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${t.hairline}`, background: t.card }} data-testid={`project-row-${project.id}`}>
      <button type="button" onClick={project.milestones ? onToggle : undefined} className="w-full flex items-center justify-between gap-4 px-5" style={{ height: 68 }}>
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
        <div className="flex items-center gap-3 flex-shrink-0">
          {quoted ? (
            <span className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold" style={{ padding: '4px 10px', background: t.soft, color: t.subink }}>
              <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 7, height: 7, border: `1.5px solid ${t.subink}` }} />
              Estimated
            </span>
          ) : (
            <ChevronDown className="w-4 h-4 transition-transform" style={{ color: t.faint, transform: expanded ? 'rotate(180deg)' : 'none' }} />
          )}
        </div>
      </button>

      {expanded && project.milestones && (
        <div className="px-5 pb-5" style={{ borderTop: `1px solid ${t.hairline}`, paddingTop: 16 }} data-testid={`schedule-${project.id}`}>
          <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
            <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: t.faint }}>Payment schedule</span>
            <span className="text-[12px]" style={{ color: t.subink }}>50% hybrid — generated from your accepted estimate</span>
          </div>
          <div className="space-y-3">
            {project.milestones.map((m, i) => (
              <div key={m.id} className="rounded-xl" style={{ border: `1px solid ${t.hairline}`, padding: 16, background: t.canvas }} data-testid={`milestone-${m.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold" style={{ background: t.soft, color: t.subink }}>{i + 1}</span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{m.label}</div>
                      <div className="text-[15px] font-semibold" style={{ marginTop: 2, color: t.ink }}>{m.amount}</div>
                      <p className="text-[11.5px]" style={{ marginTop: 4, color: t.faint, lineHeight: 1.45 }}>{m.note}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <MilestoneStatus word={m.status} t={t} />
                    {m.status === 'requested' && <CanonPill label="Pay GoodTunes®" onClick={() => {}} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11.5px]" style={{ marginTop: 12, color: t.faint, lineHeight: 1.5 }}>
            You only ever pay GoodTunes®. Press names are context, never the payee — GoodTunes® releases funds to {project.press} at each milestone.
          </p>
        </div>
      )}
    </div>
  );
}

function ScenePayments({ t, onCrumb }: { t: Theme; onCrumb: () => void }) {
  const [tab, setTab] = useState('payments');
  const [expanded, setExpanded] = useState<string | null>('lp');

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
      <ReleaseHeader activeTab={tab} t={t} onTab={setTab} onCrumb={onCrumb} />

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
              <ProjectRow key={p.id} project={p} expanded={expanded === p.id} onToggle={() => setExpanded((cur) => (cur === p.id ? null : p.id))} t={t} />
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
}: {
  t: Theme;
  first?: boolean;
  left: ReactNode;
  right: ReactNode;
  testid: string;
  dimmed?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-6"
      style={{ padding: '14px 18px', borderTop: first ? undefined : `1px solid ${t.hairline}`, opacity: dimmed ? 0.55 : 1 }}
      data-testid={testid}
    >
      <div className="flex items-center gap-3 min-w-0">{left}</div>
      <div className="flex items-center gap-4 flex-shrink-0">{right}</div>
    </div>
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
          testid="connection-shopify"
          left={
            <>
              <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32 }} aria-hidden>
                <img src={shopifyLogo} alt="Shopify" className="h-4 w-auto" style={{ filter: WHITE_GLYPH }} />
              </span>
              <span className="text-[14px] font-semibold" style={{ color: t.ink }}>Shopify</span>
            </>
          }
          right={
            <>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: t.subink }} data-testid="shopify-status">
                <Check className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} /> Connected
              </span>
              <button type="button" className="text-[13px] font-semibold transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-manage-shopify">Manage</button>
            </>
          }
        />
        <SettingsRow
          t={t}
          dimmed
          testid="connection-payout"
          left={
            <>
              <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32 }} aria-hidden>
                <CreditCard className="w-4 h-4" style={{ color: t.subink }} />
              </span>
              <span className="text-[14px] font-semibold" style={{ color: t.ink }}>Payout account</span>
            </>
          }
          right={
            <>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: t.subink }} data-testid="payout-status">
                <X className="w-4 h-4 flex-shrink-0" strokeWidth={2.5} /> Not set up
              </span>
              <button type="button" className="text-[13px] font-semibold transition-opacity hover:opacity-80" style={{ color: t.subink }} data-testid="button-setup-payout">Set up</button>
            </>
          }
        />
      </SettingsSection>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FLOW WALK CHROME — scene stepper + caption (pattern from ArtistEstimatesFlow)
// ═══════════════════════════════════════════════════════════════════
type SceneId = 'wall' | 'assets' | 'store' | 'payments' | 'reports' | 'settings';
const SCENES: Array<{ id: SceneId; label: string; caption: string }> = [
  { id: 'wall', label: '1 · Releases wall', caption: 'New rail order, card badges from pill states, channel glyph, money flag only where action is needed.' },
  { id: 'assets', label: '2–3 · Assets + inheritance', caption: 'Five-tab shell, Art / Audio lanes with Master / Vinyl formats, and the inheritance primitive on 12" LP and CD art pieces.' },
  { id: 'store', label: '4 · Store', caption: 'Channel picker (both states), share link, Shopify connect, fulfillment toggle, email appearance, Publish checklist.' },
  { id: 'payments', label: '5 · Payments', caption: 'Two project rows and an expanded 50% hybrid milestone schedule. You only ever pay GoodTunes®.' },
  { id: 'reports', label: '6 · Reports', caption: 'Audience / Acquisition / Buyers folded into tabs; two money ledgers side by side, never netted.' },
  { id: 'settings', label: '7 · Settings', caption: 'Team members and Connections. Shopify appears in the rail only once connected; the Store tab still offers inline connect that deep-links here.' },
];

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
  const activeCaption = SCENES.find((s) => s.id === scene)?.caption ?? '';

  const goRelease = () => { setScene('assets'); window.scrollTo({ top: 0 }); };
  const goWall = () => { setScene('wall'); window.scrollTo({ top: 0 }); };

  return (
    <ArtistShell t={t} mode={mode} setMode={setMode}>
      {/* Quiet one-off exploration banner */}
      <div className="flex items-center gap-2.5 flex-wrap" style={{ padding: '10px 40px', background: t.soft, borderBottom: `1px solid ${t.hairline}` }} data-testid="banner-oneoff">
        <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: t.faint }}>One-off exploration</span>
        <span className="text-[12.5px]" style={{ color: t.subink }}>Claude restructure brief, Aug 16 2026. Nothing else changed.</span>
      </div>

      {/* Scene stepper + caption */}
      <div className="sticky z-10" style={{ top: 0, background: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}>
        <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '12px 40px' }}>
          <div className="flex items-center gap-2 overflow-x-auto" data-testid="scene-stepper">
            {SCENES.map((s) => {
              const active = s.id === scene;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setScene(s.id); window.scrollTo({ top: 0 }); }}
                  data-testid={`scene-${s.id}`}
                  className="rounded-full text-[12.5px] transition-all whitespace-nowrap"
                  style={{ padding: '7px 14px', fontWeight: active ? 600 : 500, color: active ? '#fff' : t.subink, background: active ? BLUE : t.card, border: `1px solid ${active ? BLUE : t.hairline}` }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="text-[12.5px]" style={{ marginTop: 8, color: t.subink, lineHeight: 1.45 }}>{activeCaption}</p>
        </div>
      </div>

      {scene === 'wall' && <SceneReleasesWall t={t} onOpenRelease={goRelease} />}
      {scene === 'assets' && <SceneFormats t={t} onCrumb={goWall} />}
      {scene === 'store' && <SceneStore t={t} onCrumb={goWall} />}
      {scene === 'payments' && <ScenePayments t={t} onCrumb={goWall} />}
      {scene === 'reports' && <SceneReports t={t} />}
      {scene === 'settings' && <SceneSettings t={t} />}
    </ArtistShell>
  );
}

export default ArtistPortalRestructureFlow;
