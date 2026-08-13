// ArtistReleaseDetail — the CALIFORNIALAND release detail page for the
// GoodTunes ARTIST portal (Niina Soleil). Apple canon, light-default,
// theme-aware (light + dark token sets copied from CDCatalogBuildDesktopDark).
//
// A "Release" is a container above albums. It has NO stored status — its
// badge is always DERIVED from its lanes. This page shows CALIFORNIALAND's
// lanes: the digital album lane (quiet text link into the embedded album
// view) and a Vinyl draft lane (status Draft, last-edited time, and a
// "Pricing pending" treatment where a price would appear — never $0.00).
//
// Primary action: Create Draft (the screen's ONE filled blue pill). It opens
// an in-page centered portal modal (pickerOpen) with three format cards —
// Vinyl / CD / Cassette (card language from PressQuoteBuilder's size cards:
// rounded white cards, blue 2px active border on hover/selection). Choosing
// a format drops the artist into the builder (no navigation in the mock).
//
// Self-contained for handoff: local ArtistShell (adapted from ArtistProjects
// — left rail with "Releases" active, sticky frosted header with GoodTunes
// wordmark, Feedback ghost pill, bell, artist avatar), MOCK_ seed data,
// data-testid on every interactive element. Statuses never rely on color
// alone (founder is colorblind): always word + dot/shape.

import {
  useState,
  useEffect,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
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
  ChevronRight,
  ArrowRight,
  X,
  Sun,
  Moon,
  Music4,
  ArrowUpRight,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import goodtunesLogoWhite from '../assets/goodtunes-logo-white.svg';
import niinaPhoto from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Themes — light = artist-facing default; dark = canon charcoal.
// Convention copied verbatim from CDCatalogBuildDesktopDark. Only page
// SURFACES / ink / rail / cards / hairlines are theme tokens.
type Theme = {
  blue: string;
  blueWash: string; // soft selection / hover tint for blue actions
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
  cardHoverShadow: string;
  dashed: string;
  headerBg: string;
  navHoverClass: string;
  placeholderClass: string;
  logo: string; // GoodTunes wordmark asset for this theme
  railLogoRing: string;
  dotReady: string;
  dotDraft: string;
  dotSunset: string;
  overlayBg: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    blueWash: '#f0f7fc',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    cardSoft: '#f0f0f2',
    pillActive: '#ffffff',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    cardHoverShadow: '0 8px 24px rgba(0,0,0,0.08)',
    dashed: 'rgba(0,0,0,0.18)',
    headerBg: 'rgba(255,255,255,0.72)',
    navHoverClass: 'hover:bg-black/5',
    placeholderClass: 'placeholder:text-black/30',
    logo: goodtunesLogo,
    railLogoRing: 'ring-black/10',
    dotReady: '#1c8a5b',
    dotDraft: '#c98a00',
    dotSunset: '#a1a1a6',
    overlayBg: 'rgba(15, 23, 42, 0.4)',
  },
  dark: {
    blue: '#319ED8',
    blueWash: 'rgba(49,158,216,0.16)',
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
    cardHoverShadow: '0 12px 32px rgba(0,0,0,0.55)',
    dashed: 'rgba(255,255,255,0.18)',
    headerBg: 'rgba(22,22,23,0.72)',
    navHoverClass: 'hover:bg-white/5',
    placeholderClass: 'placeholder:text-white/30',
    logo: goodtunesLogoWhite,
    railLogoRing: 'ring-white/15',
    dotReady: '#37d38a',
    dotDraft: '#e0b23a',
    dotSunset: '#6e6e73',
    overlayBg: 'rgba(0,0,0,0.6)',
  },
};

// ═══════════════════════════════════════════════════════════════════
// MOCK seed data — Niina Soleil is the signed-in artist.
// A Release derives its badge from its lanes; it stores no status.
// ═══════════════════════════════════════════════════════════════════

const MOCK_ARTIST = {
  name: 'Niina Soleil',
  firstName: 'Niina',
  email: 'niina@niinasoleil.com',
  initials: 'NS',
};

type LaneKind = 'digital' | 'vinyl' | 'cd' | 'cassette';
type AlbumStage = 'Prepping' | 'At press' | 'Staged' | 'Released' | 'Sunset';
type LaneStatus = AlbumStage | 'Draft' | 'Live';

type Lane = {
  id: string;
  kind: LaneKind;
  title: string;
  status: LaneStatus;
  lastEdited: string;
  price: string | null; // null → "Pricing pending" (never $0.00)
  cover: string | null; // null → Disc3 muted placeholder
  note: string;
};

// CALIFORNIALAND — the release this page details.
const MOCK_RELEASE = {
  id: 'californialand',
  title: 'CALIFORNIALAND',
  artist: 'Niina Soleil',
  cover: californialandCover,
  year: '2026',
  lanes: [
    {
      id: 'lane-digital',
      kind: 'digital' as LaneKind,
      title: 'CALIFORNIALAND',
      status: 'Live' as LaneStatus,
      lastEdited: 'Published Mar 4, 2026',
      price: null,
      cover: californialandCover,
      note: '11 tracks · 38 min',
    },
    {
      id: 'lane-vinyl',
      kind: 'vinyl' as LaneKind,
      title: 'CALIFORNIALAND — Vinyl',
      status: 'Draft' as LaneStatus,
      lastEdited: 'Last edited 2 days ago',
      price: null, // real press pricing missing → "Pricing pending"
      cover: null,
      note: '12" LP · configuration in progress',
    },
  ] as Lane[],
};

// ─── Format picker cards (choices in the Create Draft modal) ──────────
type FormatChoice = { id: string; title: string; note: string };
const MOCK_FORMATS: FormatChoice[] = [
  { id: 'vinyl', title: 'Vinyl', note: 'Pressed record — the classic listen.' },
  { id: 'cd', title: 'CD', note: 'Compact disc — a low-cost short run.' },
  { id: 'cassette', title: 'Cassette', note: 'Tape — collectible and quick to press.' },
];

// ═══════════════════════════════════════════════════════════════════
// Rollup badge — DERIVED from lanes, never stored.
// Grammar: multi-lane = middot-joined compact clauses ("Digital live ·
// Vinyl draft"); single-word cases: "Sunset" (all sunset), "Draft"
// (nothing live), "Empty" (no lanes).
// ═══════════════════════════════════════════════════════════════════
function laneClause(lane: Lane): string {
  const noun =
    lane.kind === 'digital'
      ? 'Digital'
      : lane.kind === 'vinyl'
      ? 'Vinyl'
      : lane.kind === 'cd'
      ? 'CD'
      : 'Cassette';
  const state =
    lane.status === 'Live' || lane.status === 'Released'
      ? 'live'
      : lane.status === 'Draft' || lane.status === 'Prepping'
      ? 'draft'
      : lane.status === 'Sunset'
      ? 'sunset'
      : lane.status === 'At press'
      ? 'at press'
      : 'staged';
  return `${noun} ${state}`;
}

type Rollup = { label: string; shape: 'dot' | 'ring' | 'square'; tone: 'ready' | 'draft' | 'sunset' | 'mixed' };

function deriveRollup(lanes: Lane[]): Rollup {
  if (lanes.length === 0) return { label: 'Empty', shape: 'square', tone: 'sunset' };
  const allSunset = lanes.every((l) => l.status === 'Sunset');
  if (allSunset) return { label: 'Sunset', shape: 'ring', tone: 'sunset' };
  const anyLive = lanes.some((l) => l.status === 'Live' || l.status === 'Released');
  if (!anyLive) return { label: 'Draft', shape: 'dot', tone: 'draft' };
  const label = lanes.map(laneClause).join(' · ');
  return { label, shape: 'dot', tone: 'mixed' };
}

// ─── Status glyph — shape + word, never color alone (colorblind-safe) ──
function StatusGlyph({ shape, color }: { shape: 'dot' | 'ring' | 'square'; color: string }) {
  if (shape === 'ring') {
    return (
      <span
        aria-hidden
        className="inline-block flex-shrink-0 rounded-full"
        style={{ width: 9, height: 9, border: `2px solid ${color}` }}
      />
    );
  }
  if (shape === 'square') {
    return (
      <span
        aria-hidden
        className="inline-block flex-shrink-0"
        style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-block flex-shrink-0 rounded-full"
      style={{ width: 8, height: 8, backgroundColor: color }}
    />
  );
}

function toneColor(t: Theme, tone: Rollup['tone'] | 'ready' | 'draft' | 'sunset'): string {
  if (tone === 'ready') return t.dotReady;
  if (tone === 'draft') return t.dotDraft;
  if (tone === 'sunset') return t.dotSunset;
  return t.dotReady; // mixed rollup anchors on the live/ready tone
}

// Rollup badge — quiet chip carrying the derived label.
function RollupBadge({ rollup, t }: { rollup: Rollup; t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full text-[12.5px] font-medium"
      style={{
        padding: '5px 12px',
        color: t.ink,
        backgroundColor: t.cardSoft,
        border: `1px solid ${t.hairline}`,
      }}
      data-testid="badge-release-rollup"
    >
      <StatusGlyph shape={rollup.shape} color={toneColor(t, rollup.tone)} />
      {rollup.label}
    </span>
  );
}

// Lane-level status pill — word + dot/shape.
function LaneStatusPill({ status, t }: { status: LaneStatus; t: Theme }) {
  const tone: 'ready' | 'draft' | 'sunset' =
    status === 'Live' || status === 'Released'
      ? 'ready'
      : status === 'Sunset'
      ? 'sunset'
      : 'draft';
  const shape: 'dot' | 'ring' | 'square' = status === 'Sunset' ? 'ring' : 'dot';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-medium"
      style={{
        padding: '4px 10px',
        color: t.ink,
        backgroundColor: t.cardSoft,
        border: `1px solid ${t.hairline}`,
      }}
    >
      <StatusGlyph shape={shape} color={toneColor(t, tone)} />
      {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Artist portal shell — adapted from ArtistProjects. Sticky frosted
// header (GoodTunes wordmark, Feedback ghost pill, bell, avatar), left
// rail with "Releases" active. Theme-aware.
// ═══════════════════════════════════════════════════════════════════

type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

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

function NavRow({ label, icon: Icon, active, t }: ArtistNavItem & { t: Theme }) {
  return (
    <button
      type="button"
      data-testid={`nav-${label.toLowerCase()}`}
      className={`w-full flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors ${active ? '' : t.navHoverClass}`}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.pillActive : undefined,
        boxShadow: active ? t.pillShadow : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.blue : t.faint }} />
      <span className="truncate flex-1 text-left">{label}</span>
    </button>
  );
}

function ArtistShell({ children, t }: { children: ReactNode; t: Theme }) {
  return (
    <div className="flex flex-col font-sans" style={{ minHeight: '100dvh', backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-30"
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <img src={t.logo} alt="GoodTunes" className="h-5 w-auto flex-shrink-0" />
          <span className="hidden sm:block h-5 w-px flex-shrink-0" style={{ backgroundColor: t.hairline }} />
          <span className="text-[14px] font-medium truncate" style={{ color: t.subink }}>
            {MOCK_ARTIST.name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            data-testid="button-feedback"
            className={`inline-flex items-center gap-1.5 rounded-full h-8 px-3 text-[13px] font-medium transition-colors ${t.navHoverClass}`}
            style={{ color: t.subink }}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button
            type="button"
            data-testid="button-notifications"
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${t.navHoverClass}`}
            style={{ color: t.subink }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            type="button"
            data-testid="button-user-menu"
            className={`w-8 h-8 rounded-full overflow-hidden ring-1 ${t.railLogoRing}`}
            aria-label="Account menu"
          >
            <img src={niinaPhoto} alt={MOCK_ARTIST.initials} className="w-full h-full object-cover" />
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 hidden md:flex flex-col sticky top-14 self-start"
          style={{ height: 'calc(100dvh - 56px)', backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={`w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] ${t.placeholderClass} focus:outline-none`}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }}
                placeholder="Search…  ⌘K"
                readOnly
                data-testid="input-search"
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
            <img src={t.logo} alt="GoodTunes" className="h-4 w-auto" />
          </div>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

// ─── Breadcrumb — muted crumbs, ChevronRight w-3.5, current in ink ────
function Breadcrumb({ t }: { t: Theme }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb" data-testid="breadcrumb">
      <button
        type="button"
        data-testid="crumb-releases"
        className="transition-colors hover:underline"
        style={{ color: t.faint, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        Releases
      </button>
      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
      <span style={{ color: t.ink }} data-testid="crumb-current">
        CALIFORNIALAND
      </span>
    </nav>
  );
}

// ─── Two-tone heading — bold clause, quiet clause ─────────────────────
function PageHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h1 className="font-semibold" style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em' }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.subink }}>{rest}</span>
    </h1>
  );
}

// ─── Cover thumb — real art, or a muted Disc3 placeholder ─────────────
function CoverThumb({ src, size, t }: { src: string | null; size: number; t: Theme }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="flex-shrink-0 object-cover"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.14),
          boxShadow: t.pillShadow,
        }}
      />
    );
  }
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.14),
        backgroundColor: t.cardSoft,
        border: `1px solid ${t.hairline}`,
      }}
      aria-hidden
    >
      <Disc3 style={{ width: size * 0.42, height: size * 0.42, color: t.faint }} strokeWidth={1.5} />
    </div>
  );
}

// ─── Lane row — a single lane under the release ───────────────────────
function LaneRow({ lane, t }: { lane: Lane; t: Theme }) {
  const [hover, setHover] = useState(false);
  const isDigital = lane.kind === 'digital';
  const LaneIcon = isDigital ? Music4 : Disc3;
  return (
    <div
      className="rounded-2xl transition-shadow"
      style={{
        backgroundColor: t.card,
        border: `1px solid ${t.hairline}`,
        boxShadow: hover ? t.cardHoverShadow : 'none',
        transform: hover ? 'translateY(-1px)' : 'none',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`lane-${lane.kind}`}
    >
      <div className="flex items-center gap-4 p-4 flex-wrap sm:flex-nowrap">
        <CoverThumb src={lane.cover} size={64} t={t} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <LaneIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
              {isDigital ? 'Digital album' : `${lane.kind === 'vinyl' ? 'Vinyl' : lane.kind === 'cd' ? 'CD' : 'Cassette'} draft`}
            </span>
          </div>
          <div className="text-[15.5px] font-semibold truncate mt-1" style={{ color: t.ink, letterSpacing: '-0.01em' }}>
            {lane.title}
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: t.subink }}>
            {lane.note}
          </div>
        </div>

        {/* Status + price column */}
        <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
          <LaneStatusPill status={lane.status} t={t} />
          {lane.price ? (
            <span className="text-[13px] tabular-nums font-medium" style={{ color: t.ink }}>
              {lane.price}
            </span>
          ) : !isDigital ? (
            // Real press pricing missing — quiet "Pricing pending", never $0.00
            <span
              className="inline-flex items-center gap-1.5 text-[12px]"
              style={{ color: t.faint }}
              data-testid={`pricing-pending-${lane.kind}`}
            >
              <span aria-hidden className="inline-block rounded-full" style={{ width: 5, height: 5, backgroundColor: t.faint }} />
              Pricing pending
            </span>
          ) : null}
          <span className="text-[12px]" style={{ color: t.faint }}>
            {lane.lastEdited}
          </span>
        </div>
      </div>

      {/* Row footer action — quiet borderless text button */}
      <div className="px-4 pb-3.5 -mt-1 flex items-center gap-1" style={{ borderTop: `1px solid ${t.hairline}`, paddingTop: 12 }}>
        {isDigital ? (
          <button
            type="button"
            data-testid="link-open-album"
            className="inline-flex items-center gap-1.5 rounded-full h-8 px-3 text-[13px] font-medium transition-colors"
            style={{ color: t.blue }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.blueWash)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Open album view
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="link-open-builder"
              className="inline-flex items-center gap-1.5 rounded-full h-8 px-3 text-[13px] font-medium transition-colors"
              style={{ color: t.blue }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.blueWash)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              Continue draft
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-testid="link-lane-duplicate"
              className={`inline-flex items-center rounded-full h-8 px-3 text-[13px] font-medium transition-colors ${t.navHoverClass}`}
              style={{ color: t.subink }}
            >
              Duplicate
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Format picker card — PressQuoteBuilder size-card language ────────
function FormatCard({
  f,
  active,
  onSelect,
  t,
}: {
  f: FormatChoice;
  active: boolean;
  onSelect: () => void;
  t: Theme;
}) {
  const [hover, setHover] = useState(false);
  const highlight = active || hover;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`format-card-${f.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="rounded-2xl text-left transition-all focus:outline-none"
      style={{
        padding: 18,
        backgroundColor: t.card,
        border: highlight ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
        // keep geometry stable when the border thickens
        margin: highlight ? 0 : 1,
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
    >
      <div
        className="flex items-center justify-center rounded-xl mb-3"
        style={{ width: 48, height: 48, backgroundColor: t.cardSoft }}
      >
        <Disc3 className="w-6 h-6" style={{ color: highlight ? t.blue : t.faint }} strokeWidth={1.6} />
      </div>
      <div className="text-[15px] font-semibold" style={{ color: highlight ? t.blue : t.ink }}>
        {f.title}
      </div>
      <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: t.subink }}>
        {f.note}
      </p>
    </button>
  );
}

// ─── Create Draft format-picker modal — portal to document.body ───────
function CreateDraftModal({
  onClose,
  onChoose,
  t,
}: {
  onClose: () => void;
  onChoose: (id: string) => void;
  t: Theme;
}) {
  const [sel, setSel] = useState<string | null>('vinyl');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-draft-title"
      data-testid="modal-create-draft"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: t.overlayBg, backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
        onClick={onClose}
        data-testid="modal-backdrop"
      />
      <div
        className="relative w-full max-w-2xl rounded-2xl p-8"
        style={{
          backgroundColor: t.card,
          border: `1px solid ${t.hairline}`,
          boxShadow: '0 20px 48px rgba(0,0,0,0.35)',
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          data-testid="button-create-draft-close"
          className="absolute right-4 top-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: t.cardSoft, color: t.ink }}
        >
          <X className="w-4 h-4" />
        </button>

        <h2 id="create-draft-title" className="text-[22px] tracking-tight" style={{ fontWeight: 600, letterSpacing: '-0.02em' }}>
          <span style={{ color: t.ink }}>Pick a format. </span>
          <span className="font-medium" style={{ color: t.subink }}>Start a physical draft.</span>
        </h2>
        <p className="text-[13.5px] leading-relaxed" style={{ color: t.subink, marginTop: 8, maxWidth: 520 }}>
          A draft lets you configure and price a pressing for CALIFORNIALAND without touching the live digital album. You can add more formats later.
        </p>

        <div className="grid gap-3" style={{ marginTop: 24, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {MOCK_FORMATS.map((f) => (
            <FormatCard key={f.id} f={f} active={sel === f.id} onSelect={() => setSel(f.id)} t={t} />
          ))}
        </div>

        <div className="flex items-center justify-between gap-4" style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={onClose}
            data-testid="button-create-draft-cancel"
            className={`inline-flex items-center rounded-full h-9 px-3 text-[13px] font-medium transition-colors ${t.navHoverClass}`}
            style={{ color: t.subink }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!sel}
            onClick={() => sel && onChoose(sel)}
            data-testid="button-create-draft-continue"
            className="inline-flex items-center gap-1.5 rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{ backgroundColor: t.blue }}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Mock-only floating light/dark toggle pill (never shipped) ────────
function ThemeToggle({ mode, setMode, t }: { mode: 'light' | 'dark'; setMode: (m: 'light' | 'dark') => void; t: Theme }) {
  const btn: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    padding: '0 12px',
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    transition: 'all 0.2s ease',
  };
  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-full"
      style={{
        bottom: 20,
        right: 20,
        padding: 4,
        backgroundColor: t.card,
        border: `1px solid ${t.hairline}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      }}
      data-testid="theme-toggle"
    >
      <button
        type="button"
        onClick={() => setMode('light')}
        data-testid="toggle-light"
        style={{
          ...btn,
          color: mode === 'light' ? t.ink : t.faint,
          backgroundColor: mode === 'light' ? t.pillActive : 'transparent',
          boxShadow: mode === 'light' ? t.pillShadow : 'none',
        }}
      >
        <Sun style={{ width: 14, height: 14 }} />
        View light
      </button>
      <button
        type="button"
        onClick={() => setMode('dark')}
        data-testid="toggle-dark"
        style={{
          ...btn,
          color: mode === 'dark' ? t.ink : t.faint,
          backgroundColor: mode === 'dark' ? t.pillActive : 'transparent',
          boxShadow: mode === 'dark' ? t.pillShadow : 'none',
        }}
      >
        <Moon style={{ width: 14, height: 14 }} />
        View dark
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════
export function ArtistReleaseDetail() {
  const [mode, setMode] = useState<'light' | 'dark'>('light'); // DEFAULT: light (artist-facing)
  const t = THEMES[mode];

  // pickerOpen defaults FALSE — opened by the Create Draft pill. Both states
  // reachable so the mock can be screenshotted either way.
  const [pickerOpen, setPickerOpen] = useState(false);

  const rollup = deriveRollup(MOCK_RELEASE.lanes);

  return (
    <ArtistShell t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* Breadcrumb → H1 (mt-3 gap) */}
        <Breadcrumb t={t} />

        <div className="mt-3 flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-5 min-w-0">
            <CoverThumb src={MOCK_RELEASE.cover} size={92} t={t} />
            <div className="min-w-0">
              <PageHeading lead="CALIFORNIALAND." rest="Every format, one home." t={t} />
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <RollupBadge rollup={rollup} t={t} />
                <span className="text-[13px]" style={{ color: t.subink }}>
                  by {MOCK_RELEASE.artist}
                </span>
                <span aria-hidden style={{ color: t.faint }}>·</span>
                <span className="text-[13px]" style={{ color: t.subink }}>
                  {MOCK_RELEASE.lanes.length} lanes
                </span>
              </div>
            </div>
          </div>

          {/* THE one filled blue primary pill on this screen */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid="button-create-draft"
            className="inline-flex items-center gap-1.5 rounded-full px-5 h-10 text-[14px] font-medium text-white transition-opacity hover:opacity-90 flex-shrink-0"
            style={{ backgroundColor: t.blue }}
          >
            <Disc3 className="w-4 h-4" />
            Create Draft
          </button>
        </div>

        <div className="h-px w-full" style={{ backgroundColor: t.hairline, margin: '28px 0' }} />

        {/* Lanes */}
        <section>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[20px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.02em' }}>
              Lanes{' '}
              <span className="font-medium" style={{ color: t.subink }}>
                what fans can get.
              </span>
            </h2>
            <span className="text-[12px]" style={{ color: t.faint }}>
              Release status is derived from these lanes.
            </span>
          </div>

          <div className="flex flex-col gap-3 mt-5">
            {MOCK_RELEASE.lanes.map((lane) => (
              <LaneRow key={lane.id} lane={lane} t={t} />
            ))}

            {/* Quiet "add a format" affordance — dashed cell, not a primary pill */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              data-testid="button-add-lane"
              className="rounded-2xl flex items-center justify-center gap-2 text-[13px] font-medium transition-colors"
              style={{
                minHeight: 64,
                color: t.subink,
                border: `1.5px dashed ${t.dashed}`,
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.cardSoft)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Disc3 className="w-4 h-4" style={{ color: t.faint }} />
              Add another format
            </button>
          </div>
        </section>

        {/* A quiet note about the digital source of truth */}
        <p className="text-[13px] leading-relaxed mt-6" style={{ color: t.faint, maxWidth: 640 }}>
          The digital album is the source of truth for tracks and artwork. Physical drafts inherit
          from it — configure a pressing, price the runs, then send it to press when it&rsquo;s ready.
        </p>
      </div>

      {pickerOpen && (
        <CreateDraftModal
          t={t}
          onClose={() => setPickerOpen(false)}
          onChoose={() => {
            // Mock: choosing a format drops the artist into the builder.
            // No navigation in the mock — just close the picker.
            setPickerOpen(false);
          }}
        />
      )}

      <ThemeToggle mode={mode} setMode={setMode} t={t} />
    </ArtistShell>
  );
}

export default ArtistReleaseDetail;
