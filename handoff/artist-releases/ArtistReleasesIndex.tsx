// ArtistReleasesIndex — the GoodTunes ARTIST portal "Releases" catalog.
//
// Replaces the artist's Albums/Projects catalog with a scannable LIST of
// RELEASES. A Release is a container above albums (e.g. CALIFORNIALAND) with
// lanes underneath: the digital album plus physical drafts (Vinyl/CD/Cassette).
// A Release has NO stored status — its badge is always DERIVED from its lanes.
//
// Self-contained for handoff: local ArtistShell (adapted from ArtistProjects.tsx),
// THEMES map (light default, dark charcoal canon) copied from
// CDCatalogBuildDesktopDark.tsx, MOCK_ prefixed seed data, and a mock-only
// floating "View light / View dark" toggle pill (bottom-right, Sun/Moon).
//
// Apple canon: one filled blue pill max per screen, quiet text buttons
// elsewhere, two-tone headings, breadcrumbs with ChevronRight separators,
// statuses never rely on color alone (word + dot/shape). No emojis; real ®.

import { useState, type ReactNode, type CSSProperties } from 'react';
import {
  Search,
  LayoutDashboard,
  User,
  Disc3,
  Activity,
  Users,
  Megaphone,
  ShoppingBag,
  UserCheck,
  UserPlus,
  Store,
  BarChart3,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Plus,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Themes — copied convention from CDCatalogBuildDesktopDark.tsx ────────
// Light = apple-canon light (DEFAULT, artist-facing). Dark = charcoal canon.
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  rail: string;
  card: string;
  cardSoft: string;
  pillActive: string;
  pillShadow: string;
  headerBg: string;
  navHoverClass: string;
  placeholderClass: string;
  logoFilter: string;
  railLogoRing: string;
  coverPlaceholder: string; // muted Disc3 cover fill
  discGlyph: string;        // muted Disc3 icon color
  hoverLift: string;        // card hover shadow
  chipBg: string;           // quiet gray chip (badge dots carrier, etc.)
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    ink: '#1d1d1f',
    subink: 'rgba(0,0,0,0.62)',
    faint: 'rgba(0,0,0,0.4)',
    hairline: 'rgba(0,0,0,0.08)',
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    cardSoft: '#f0f0f2',
    pillActive: '#ffffff',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    navHoverClass: 'hover:bg-black/5',
    placeholderClass: 'placeholder:text-black/30',
    logoFilter: 'none',
    railLogoRing: 'ring-black/10',
    coverPlaceholder: '#ececef',
    discGlyph: '#c7c7cc',
    hoverLift: '0 8px 28px rgba(0,0,0,0.10)',
    chipBg: '#e8e8ed',
  },
  dark: {
    blue: '#319ED8',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)',
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    cardSoft: '#26262a',
    pillActive: '#3a3a3e',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    navHoverClass: 'hover:bg-white/5',
    placeholderClass: 'placeholder:text-white/30',
    logoFilter: 'invert(1) brightness(1.8)',
    railLogoRing: 'ring-white/15',
    coverPlaceholder: '#26262a',
    discGlyph: '#6e6e73',
    hoverLift: '0 12px 32px rgba(0,0,0,0.5)',
    chipBg: '#3a3a3e',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Domain model ─────────────────────────────────────────────────────────
// Album lifecycle stages: Prepping / At press / Staged / Released / Sunset.
type Stage = 'Prepping' | 'At press' | 'Staged' | 'Released' | 'Sunset';
type LaneKind = 'Digital' | 'Vinyl' | 'CD' | 'Cassette';

type Lane = {
  kind: LaneKind;
  stage: Stage;
  /** physical pressing price per unit; missing → "Pricing pending". */
  price?: string;
};

type Release = {
  id: string;
  name: string;
  /** cover comes from the primary album when one exists. */
  cover?: string;
  artist: string;
  year: string;
  lanes: Lane[];
};

// ─── Seed back-catalog (Niina Soleil is signed-in) — MOCK_ prefixed ────────
const MOCK_ARTIST_NAME = 'Niina Soleil';

const MOCK_RELEASES: Release[] = [
  {
    id: 'californialand',
    name: 'CALIFORNIALAND',
    cover: californialandCover,
    artist: 'Niina Soleil',
    year: '2026',
    // digital live + vinyl draft
    lanes: [
      { kind: 'Digital', stage: 'Released' },
      { kind: 'Vinyl', stage: 'Prepping' }, // draft — no price yet
    ],
  },
  {
    id: 'hope',
    name: 'HOPE',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2025',
    // digital-only, live
    lanes: [{ kind: 'Digital', stage: 'Released' }],
  },
  {
    id: 'midnight-postcards',
    name: 'MIDNIGHT POSTCARDS',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2027',
    // draft-only: nothing live yet
    lanes: [
      { kind: 'Vinyl', stage: 'Prepping' },
      { kind: 'CD', stage: 'Prepping' },
    ],
  },
  {
    id: 'saltwater-hymns',
    name: 'SALTWATER HYMNS',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2028',
    // Empty — no lanes, brand new
    lanes: [],
  },
  {
    id: 'paper-lanterns',
    name: 'PAPER LANTERNS',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2019',
    // legacy all-Sunset
    lanes: [
      { kind: 'Digital', stage: 'Sunset' },
      { kind: 'Vinyl', stage: 'Sunset' },
    ],
  },
  {
    id: 'first-light',
    name: 'FIRST LIGHT',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2017',
    // legacy all-Sunset
    lanes: [
      { kind: 'Digital', stage: 'Sunset' },
      { kind: 'CD', stage: 'Sunset' },
      { kind: 'Cassette', stage: 'Sunset' },
    ],
  },
  {
    id: 'the-long-way-home',
    name: 'THE LONG WAY HOME',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2015',
    // legacy all-Sunset, single lane
    lanes: [{ kind: 'Digital', stage: 'Sunset' }],
  },
  {
    id: 'goldenrod',
    name: 'GOLDENROD',
    cover: undefined,
    artist: 'Niina Soleil',
    year: '2026',
    // mixed multi-lane, in motion
    lanes: [
      { kind: 'Digital', stage: 'Released' },
      { kind: 'CD', stage: 'At press' },
    ],
  },
];

// ─── Rollup badge grammar (DERIVED — a release has no stored status) ───────
// multi-lane = middot-joined compact clauses ("Digital live · Vinyl draft" or
// "At press"); single-word cases: "Sunset" (all lanes sunset), "Draft"
// (nothing live), "Empty" (no lanes). Colorblind-safe: word + dot/shape.
type BadgeTone = 'live' | 'motion' | 'draft' | 'sunset' | 'empty';

type Rollup = { label: string; tone: BadgeTone; dimmed: boolean };

// Compact clause word for a single lane, used in multi-lane rollups.
function laneClause(lane: Lane): string {
  const word =
    lane.stage === 'Released'
      ? 'live'
      : lane.stage === 'At press'
        ? 'at press'
        : lane.stage === 'Staged'
          ? 'staged'
          : lane.stage === 'Sunset'
            ? 'sunset'
            : 'draft'; // Prepping
  return `${lane.kind} ${word}`;
}

function deriveRollup(lanes: Lane[]): Rollup {
  if (lanes.length === 0) return { label: 'Empty', tone: 'empty', dimmed: false };

  const allSunset = lanes.every((l) => l.stage === 'Sunset');
  if (allSunset) return { label: 'Sunset', tone: 'sunset', dimmed: true };

  const anyLive = lanes.some((l) => l.stage === 'Released');
  const anyMotion = lanes.some((l) => l.stage === 'At press' || l.stage === 'Staged');

  // Nothing live and nothing in motion → pure Draft (single word).
  if (!anyLive && !anyMotion) return { label: 'Draft', tone: 'draft', dimmed: false };

  // Multi-lane compact clause. Drop sunset lanes from the active clause so the
  // rollup reads as what's alive, not the archive.
  const activeLanes = lanes.filter((l) => l.stage !== 'Sunset');
  const label = activeLanes.map(laneClause).join(' · ');
  const tone: BadgeTone = anyLive ? 'live' : 'motion';
  return { label, tone, dimmed: false };
}

// ─── Status glyph — never color alone: each tone gets a distinct SHAPE ─────
// live = filled dot, motion = ring dot, draft = hollow square, sunset = dash,
// empty = plus outline. Word always accompanies (in the badge text).
function StatusGlyph({ tone, t }: { tone: BadgeTone; t: Theme }) {
  const color =
    tone === 'live'
      ? '#1c8a5b'
      : tone === 'motion'
        ? t.blue
        : tone === 'sunset'
          ? t.faint
          : tone === 'empty'
            ? t.faint
            : t.subink; // draft
  const base: CSSProperties = { display: 'inline-block', flexShrink: 0 };
  if (tone === 'live') {
    return <span aria-hidden style={{ ...base, width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />;
  }
  if (tone === 'motion') {
    return (
      <span
        aria-hidden
        style={{ ...base, width: 8, height: 8, borderRadius: '50%', border: `2px solid ${color}` }}
      />
    );
  }
  if (tone === 'draft') {
    return (
      <span aria-hidden style={{ ...base, width: 7, height: 7, borderRadius: 1.5, border: `1.5px solid ${color}` }} />
    );
  }
  if (tone === 'sunset') {
    return <span aria-hidden style={{ ...base, width: 9, height: 2, borderRadius: 1, backgroundColor: color }} />;
  }
  // empty
  return <Plus aria-hidden style={{ width: 10, height: 10, color, strokeWidth: 2.5 }} />;
}

// ─── Artist persona shell (adapted from ArtistProjects.tsx, theme-aware) ───
type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

// Rail's catalog nav item reads "Releases" and is active.
const ARTIST_NAV: ArtistNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Overview', icon: Activity },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS';

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function NavRow({ label, icon: Icon, active, t }: ArtistNavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      data-testid={`nav-${label.toLowerCase()}`}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors',
        active ? '' : t.navHoverClass,
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.card : undefined,
        boxShadow: active ? t.pillShadow : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.blue : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

function UserMenu({ t }: { t: Theme }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-8 h-8 rounded-full overflow-hidden focus:outline-none ring-1 ${t.railLogoRing}`}
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0" data-testid="menu-user">
        <div className="px-3 py-3 border-b border-slate-200">
          <div className="text-[13.5px] font-semibold text-slate-900">{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] text-slate-500 truncate">{USER_EMAIL}</div>
        </div>
        <div className="py-1">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid={`menu-item-${m.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1 border-t border-slate-200">
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
            data-testid="menu-item-sign-out"
          >
            <LogOut className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ArtistShell({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-30"
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto flex-shrink-0" style={{ filter: t.logoFilter }} />
          <span className="hidden sm:inline text-[13px]" style={{ color: t.faint }}>
            Artist Portal
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className={`rounded-full ${t.navHoverClass}`}
            style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.navHoverClass}`}
            style={{ color: t.subink }}
            aria-label="Notifications"
            data-testid="button-notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 hidden md:flex flex-col"
          style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={`w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] ${t.placeholderClass} focus:outline-none`}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }}
                placeholder="Search…  ⌘K"
                readOnly
                data-testid="input-rail-search"
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {ARTIST_NAV.map((item) => (
              <NavRow key={item.label} {...item} t={t} />
            ))}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="relative flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Breadcrumbs (canon: muted crumbs, ChevronRight w-3.5, current in ink) ─
export function Breadcrumbs({ current, t }: { current: string; t: Theme }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px]" style={{ color: t.faint }} data-testid="breadcrumbs">
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="transition-colors hover:opacity-80"
        style={{ color: t.faint }}
        data-testid="crumb-catalog"
      >
        Catalog
      </a>
      <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} />
      <span style={{ color: t.ink }}>{current}</span>
    </nav>
  );
}

// ─── Two-tone page heading ─────────────────────────────────────────────────
export function PageHeading({ lead, rest, t, testId }: { lead: string; rest: string; t: Theme; testId?: string }) {
  return (
    <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }} data-testid={testId}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.subink }}>{rest}</span>
    </h1>
  );
}

// ─── Rollup badge — dot/shape + word, quiet chip ───────────────────────────
export function RollupBadge({ rollup, t }: { rollup: Rollup; t: Theme }) {
  const textColor =
    rollup.tone === 'live'
      ? t.ink
      : rollup.tone === 'motion'
        ? t.ink
        : rollup.tone === 'empty' || rollup.tone === 'sunset'
          ? t.faint
          : t.subink;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium"
      style={{ backgroundColor: t.chipBg, color: textColor, padding: '4px 10px', letterSpacing: '-0.005em' }}
      data-testid="rollup-badge"
    >
      <StatusGlyph tone={rollup.tone} t={t} />
      {rollup.label}
    </span>
  );
}

// ─── Cover thumb ────────────────────────────────────────────────────────────
function CoverThumb({ release, t, size = 72 }: { release: Release; t: Theme; size?: number }) {
  return (
    <div
      className="relative rounded-xl overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, border: `1px solid ${t.hairline}` }}
    >
      {release.cover ? (
        <img src={release.cover} alt={`${release.name} artwork`} className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: t.coverPlaceholder }}>
          <Disc3 style={{ width: size * 0.42, height: size * 0.42, color: t.discGlyph }} />
        </div>
      )}
    </div>
  );
}

// ─── Lane summary line — quiet per-lane chips under the release name ────────
function LaneSummary({ lanes, t }: { lanes: Lane[]; t: Theme }) {
  if (lanes.length === 0) {
    return (
      <span className="text-[12.5px]" style={{ color: t.faint }}>
        No lanes yet — add the digital album to begin.
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]" style={{ color: t.subink }}>
      {lanes.map((lane, i) => {
        // Sunset lanes are history — no pricing chip. Real $ figures are out
        // of scope (pending placeholders only), so active physical lanes
        // without confirmed press pricing read "Pricing pending".
        const pricing =
          lane.kind === 'Digital' || lane.stage === 'Sunset'
            ? null
            : lane.price
              ? lane.price
              : '$ —';
        return (
          <span key={`${lane.kind}-${i}`} className="inline-flex items-center gap-1.5">
            <span style={{ color: t.ink, fontWeight: 500 }}>{lane.kind}</span>
            <span style={{ color: t.faint }}>{lane.stage}</span>
            {pricing && (
              <span
                className="text-[11.5px]"
                style={{ color: lane.price ? t.subink : t.faint, fontStyle: lane.price ? 'normal' : 'italic' }}
              >
                · {pricing}
              </span>
            )}
            {i < lanes.length - 1 && <span style={{ color: t.faint }}>|</span>}
          </span>
        );
      })}
    </div>
  );
}

// ─── Release card — Apple "Explore the lineup" grammar (Bill, Aug 13 2026) ──
// Wide rounded rects in a grid, the COVER ART is the hero (full-bleed square,
// like a product shot), centered copy beneath: name, derived badge, quiet
// lane line, then a blue "Open ›" text link. Sunset cards dim as a whole.
export function ReleaseRow({ release, t }: { release: Release; t: Theme }) {
  const rollup = deriveRollup(release.lanes);
  const [hover, setHover] = useState(false);

  // Compact centered lane line — "Digital Released · Vinyl Prepping".
  const laneLine =
    release.lanes.length === 0
      ? 'No lanes yet — add the digital album to begin.'
      : release.lanes.map((l) => `${l.kind} ${l.stage.toLowerCase()}`).join(' · ');
  const pricingPending = release.lanes.some(
    (l) => l.kind !== 'Digital' && l.stage !== 'Sunset' && !l.price,
  );

  return (
    <div
      className="group rounded-3xl overflow-hidden cursor-pointer flex flex-col"
      style={{
        backgroundColor: t.card,
        border: `1px solid ${t.hairline}`,
        boxShadow: hover ? t.hoverLift : 'none',
        transform: hover ? 'translateY(-3px)' : 'none',
        opacity: rollup.dimmed ? 0.6 : 1,
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, opacity 0.2s ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`row-release-${release.id}`}
    >
      {/* Hero — full-bleed square cover art, the card's product shot. */}
      <div className="relative w-full" style={{ aspectRatio: '1 / 1', backgroundColor: t.coverPlaceholder }}>
        {release.cover ? (
          <img
            src={release.cover}
            alt={`${release.name} artwork`}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: rollup.dimmed ? 'saturate(0.4)' : 'none' }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Disc3 style={{ width: 56, height: 56, color: t.discGlyph, strokeWidth: 1.25 }} />
          </div>
        )}
      </div>

      {/* Centered copy block — Apple lineup card rhythm. */}
      <div className="flex-1 flex flex-col items-center text-center px-6 pt-5 pb-6">
        <h3 className="text-[17px] font-semibold w-full truncate" style={{ color: t.ink, letterSpacing: '-0.015em' }}>
          {release.name}
        </h3>
        <div style={{ marginTop: 8 }}>
          <RollupBadge rollup={rollup} t={t} />
        </div>
        <p className="text-[12.5px] w-full" style={{ color: t.subink, marginTop: 10, lineHeight: 1.45 }}>
          {laneLine}
        </p>
        <p className="text-[11.5px]" style={{ color: t.faint, marginTop: 3 }}>
          {release.year}
          {pricingPending && <span style={{ fontStyle: 'italic' }}> · $ —</span>}
        </p>
        <div className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full text-[13px] font-medium transition-colors"
          style={{
            color: t.blue,
            padding: '6px 12px',
            marginTop: 14,
            backgroundColor: hover ? (t.canvas === '#f5f5f7' ? '#f0f7fc' : 'rgba(49,158,216,0.14)') : 'transparent',
          }}
          onClick={(e) => e.stopPropagation()}
          data-testid={`button-open-${release.id}`}
        >
          Open
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Mock-only floating theme toggle (bottom-right) ─────────────────────────
export function ThemeToggle({ mode, onToggle }: { mode: 'light' | 'dark'; onToggle: () => void }) {
  const t = THEMES[mode];
  return (
    <button
      type="button"
      onClick={onToggle}
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full text-[13px] font-medium transition-colors"
      style={{
        backgroundColor: t.card,
        color: t.ink,
        border: `1px solid ${t.hairline}`,
        boxShadow: '0 6px 22px rgba(0,0,0,0.18)',
        padding: '9px 16px',
      }}
      data-testid="button-theme-toggle"
      aria-label={mode === 'light' ? 'View dark' : 'View light'}
    >
      {mode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      {mode === 'light' ? 'View dark' : 'View light'}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export function ArtistReleasesIndex() {
  const [mode, setMode] = useState<'light' | 'dark'>('light'); // DEFAULT: light
  const t = THEMES[mode];

  return (
    <>
      <ArtistShell t={t}>
        <div className="flex flex-col gap-7">
          <div>
            <Breadcrumbs current="Releases" t={t} />
            <div className="flex items-end justify-between gap-4" style={{ marginTop: 12 }}>
              <PageHeading lead="Releases." rest="Your whole catalog, at a glance." t={t} testId="heading-releases" />
              {/* One filled blue primary pill per screen. */}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full text-[14px] font-medium text-white transition-opacity hover:opacity-90 flex-shrink-0"
                style={{ backgroundColor: t.blue, padding: '9px 18px' }}
                data-testid="button-new-release"
              >
                <Plus className="w-4 h-4" />
                New Release
              </button>
            </div>
            <p className="text-[14px]" style={{ color: t.subink, marginTop: 10, maxWidth: 620, lineHeight: 1.5 }}>
              A release holds the digital album and every physical pressing beside it. The badge is read
              straight from those lanes — nothing to set by hand.
            </p>
          </div>

          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="list-releases">
            {MOCK_RELEASES.map((r) => (
              <ReleaseRow key={r.id} release={r} t={t} />
            ))}
          </section>

          <p className="text-[12px]" style={{ color: t.faint }}>
            {MOCK_RELEASES.length} releases · {MOCK_ARTIST_NAME}
          </p>
        </div>
      </ArtistShell>

      <ThemeToggle mode={mode} onToggle={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} />
    </>
  );
}

// Shared exports for the New-Release flow variant.
export { THEMES, MOCK_RELEASES, MOCK_ARTIST_NAME, deriveRollup };
export type { Theme, Release };

export default ArtistReleasesIndex;
