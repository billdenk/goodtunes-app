// ArtistReleaseDraftBuilder — the TOP of the GoodTunes Build-a-Quote builder as
// Niina Soleil (the signed-in artist) sees it inside a Vinyl DRAFT for the
// CALIFORNIALAND release. A representative slice of the builder, not the whole
// thing: the breadcrumb / draft-identity zone, the size + quantity card row,
// and the running estimate strip.
//
// Three treatments this mockup exists to prove:
//   1. Breadcrumb + draft identity — Releases › CALIFORNIALAND › Vinyl draft,
//      with the draft name "CALIFORNIALAND — Vinyl" as the page identity and a
//      quiet drafts switcher that shows a sibling "CALIFORNIALAND — Vinyl 2".
//   2. Auto-save affordance — an ambient "Saved just now" indicator (faint
//      check), no Save button anywhere. A crash never loses the draft.
//   3. Pricing pending — the invited press (Memphis Record Pressing) hasn't
//      confirmed pricing, so the estimate strip reads "Est. $ —"
//      (never $0.00), per-component cost lines and run-quantity cards show a
//      quiet "Pricing pending" placeholder.
//
// Self-contained for handoff: local ArtistShell (adapted from ArtistProjects),
// THEMES map (light default, artist-facing) copied from CDCatalogBuildDesktopDark,
// mock-only View light / View dark toggle pill, MOCK_ seed data. Every
// interactive element carries a kebab-case data-testid.
//
// Canon: light canvas #f5f5f7, white cards, ONE filled blue pill max per screen,
// rounded-full pills, two-tone headings, colorblind-safe statuses (word + dot),
// real ® on GoodTunes®. 12″ is the default record size.

import { useState, type ReactNode } from 'react';
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
  ChevronDown,
  Check,
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
import mrpLabelLogo from '../assets/mrp-logo.svg';

// ─── Themes — light = apple-canon light (DEFAULT, artist-facing); dark = canon
// charcoal. Copied from CDCatalogBuildDesktopDark's THEMES convention. Only
// page surfaces / ink / rail / cards / hairlines are theme tokens. ──────────
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
  dashed: string;
  headerBg: string;
  navHoverClass: string;
  placeholderClass: string;
  logoFilter: string;
  railLogoRing: string;
  selectionWash: string; // quiet wash used behind pending / selected states
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
    dashed: 'rgba(0,0,0,0.18)',
    headerBg: 'rgba(255,255,255,0.72)',
    navHoverClass: 'hover:bg-black/5',
    placeholderClass: 'placeholder:text-black/30',
    logoFilter: 'none',
    railLogoRing: 'ring-black/10',
    selectionWash: '#f6f6f8',
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
    dashed: 'rgba(255,255,255,0.18)',
    headerBg: 'rgba(22,22,23,0.72)',
    navHoverClass: 'hover:bg-white/5',
    placeholderClass: 'placeholder:text-white/30',
    logoFilter: 'invert(1) brightness(1.8)',
    railLogoRing: 'ring-white/15',
    selectionWash: 'rgba(255,255,255,0.04)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── MOCK seed data ─────────────────────────────────────────────────────
const MOCK_ARTIST_NAME = 'Niina Soleil';
const MOCK_USER_EMAIL = 'niina@niinasoleil.com';
const MOCK_PRESS_NAME = 'Memphis Record Pressing';
const MOCK_RELEASE_NAME = 'CALIFORNIALAND';

// The draft the artist is inside, plus a sibling to prove the switcher.
type DraftRef = { id: string; name: string; note: string };
const MOCK_DRAFTS: DraftRef[] = [
  { id: 'vinyl-1', name: 'CALIFORNIALAND — Vinyl', note: '12″ · edited just now' },
  { id: 'vinyl-2', name: 'CALIFORNIALAND — Vinyl 2', note: '12″ · alt jacket · edited 3d ago' },
];
const MOCK_ACTIVE_DRAFT_ID = 'vinyl-1';

// Record sizes — 12″ is always the default.
type SizeId = '7' | '10' | '12';
const MOCK_SIZES: { id: SizeId; label: string; note: string }[] = [
  { id: '7', label: '7″', note: 'Single' },
  { id: '10', label: '10″', note: 'EP' },
  { id: '12', label: '12″', note: 'LP · Standard' },
];
const DEFAULT_SIZE: SizeId = '12';

// Press-run quantities. The invited press has NOT confirmed pricing, so every
// run reads "Pricing pending" — never $0.00.
const MOCK_QUANTITIES = [100, 300, 500, 1000, 2000, 3000];
const DEFAULT_QTY = 500;

// Per-component cost lines for the running estimate — all pending until MRP
// returns confirmed pricing.
const MOCK_COST_LINES = [
  { label: 'Vinyl · 12″ · 140g' },
  { label: 'Single jacket' },
  { label: 'Center labels' },
];

// ─── Artist rail nav — "Releases" reads for the catalog item and is active ──
type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };
const MOCK_NAV: ArtistNavItem[] = [
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

// ─── Local ArtistShell — adapted from ArtistProjects (sticky frosted header
// with GoodTunes wordmark contexts, Feedback ghost pill, bell, artist avatar).
function ArtistShell({ children, t }: { children: ReactNode; t: Theme }) {
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
          <img
            src={niinaPhoto}
            alt={MOCK_ARTIST_NAME}
            className={`h-9 w-9 rounded-full object-cover flex-shrink-0 ring-1 ${t.railLogoRing}`}
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {MOCK_ARTIST_NAME}
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
            className={`w-9 h-9 rounded-full flex items-center justify-center ${t.navHoverClass}`}
            style={{ color: t.subink }}
            aria-label="Notifications"
            data-testid="button-notifications"
          >
            <Bell style={{ width: 18, height: 18 }} />
          </button>
          <button
            type="button"
            className={`w-8 h-8 rounded-full overflow-hidden ring-1 ${t.railLogoRing}`}
            aria-label="Account menu"
            data-testid="button-user-menu"
          >
            <img src={niinaPhoto} alt="NS" className="w-full h-full object-cover" />
          </button>
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
                className={`w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] ${t.placeholderClass} focus:outline-none`}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.cardSoft }}
                placeholder="Search…"
                readOnly
                data-testid="input-rail-search"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>
                ⌘K
              </span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {MOCK_NAV.map((item) => (
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

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Two-tone page heading ("Bold clause. Quiet clause.") ────────────────
function PageHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h1
      className="font-semibold"
      style={{ fontSize: 30, lineHeight: 1.12, letterSpacing: '-0.03em', marginTop: 12 }}
      data-testid="heading-draft"
    >
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.subink, fontWeight: 500 }}>{rest}</span>
    </h1>
  );
}

// Two-tone section step heading.
function StepHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h2 style={{ fontSize: 22, letterSpacing: '-0.02em', fontWeight: 600, lineHeight: 1.15 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.subink, fontWeight: 500 }}>{rest}</span>
    </h2>
  );
}

// ─── Breadcrumb — GDS pattern: FAINT crumb links, ChevronRight w-3.5, current
// page in INK, ~13px, mt-3 to the H1. ───────────────────────────────────
function Breadcrumb({ t }: { t: Theme }) {
  const crumbLink = 'transition-colors hover:opacity-80 focus:outline-none';
  return (
    <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
      <a href="#" onClick={(e) => e.preventDefault()} className={crumbLink} style={{ color: t.faint }} data-testid="crumb-releases">
        Releases
      </a>
      <ChevronRight className="w-3.5 flex-shrink-0" style={{ color: t.faint }} />
      <a href="#" onClick={(e) => e.preventDefault()} className={crumbLink} style={{ color: t.faint }} data-testid="crumb-release">
        {MOCK_RELEASE_NAME}
      </a>
      <ChevronRight className="w-3.5 flex-shrink-0" style={{ color: t.faint }} />
      <span style={{ color: t.ink }} data-testid="crumb-current">Vinyl draft</span>
    </nav>
  );
}

// ─── Ambient auto-save indicator — faint check + "Saved just now". No Save
// button anywhere. Communicates: a crash never loses the draft. ───────────
function SavedIndicator({ t }: { t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12.5px]"
      style={{ color: t.faint }}
      data-testid="autosave-indicator"
      title="Every change is saved automatically. A crash never loses your draft."
    >
      <Check className="w-3.5 h-3.5" style={{ color: t.faint }} />
      <span>Saved just now</span>
    </span>
  );
}

// ─── Drafts switcher — quiet ghost pill dropdown proving a sibling draft
// ("CALIFORNIALAND — Vinyl 2"). ──────────────────────────────────────────
function DraftsSwitcher({
  drafts,
  activeId,
  onSelect,
  t,
}: {
  drafts: DraftRef[];
  activeId: string;
  onSelect: (id: string) => void;
  t: Theme;
}) {
  const active = drafts.find((d) => d.id === activeId) ?? drafts[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-drafts-switcher"
          className={`inline-flex items-center gap-1.5 rounded-full text-[12.5px] transition-colors ${t.navHoverClass}`}
          style={{ color: t.subink, padding: '5px 12px', border: `1px solid ${t.hairline}` }}
        >
          <span className="font-medium">{drafts.length} drafts</span>
          <ChevronDown className="w-3.5 h-3.5" style={{ color: t.faint }} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 p-1.5"
        style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.ink }}
        data-testid="menu-drafts"
      >
        <div className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>
          {MOCK_RELEASE_NAME} · Vinyl drafts
        </div>
        {drafts.map((d) => {
          const isActive = d.id === activeId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onSelect(d.id)}
              data-testid={`draft-option-${d.id}`}
              className={`w-full flex items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${t.navHoverClass}`}
              style={{ backgroundColor: isActive ? t.selectionWash : undefined }}
            >
              <span className="mt-0.5 w-4 flex-shrink-0">
                {isActive && <Check className="w-4 h-4" style={{ color: t.blue }} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium truncate" style={{ color: t.ink }}>
                  {d.name}
                </span>
                <span className="block text-[11.5px] truncate" style={{ color: t.faint }}>
                  {d.note}
                </span>
              </span>
            </button>
          );
        })}
        <div className="mt-1 pt-1" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            data-testid="button-new-draft"
            className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium transition-colors ${t.navHoverClass}`}
            style={{ color: t.blue }}
          >
            <span className="w-4 flex justify-center">+</span>
            New Vinyl draft
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Pending pricing pill — colorblind-safe (word + hollow dot shape) ─────
function PendingPill({ t }: { t: Theme }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-medium"
      style={{
        padding: '2px 9px',
        color: t.subink,
        backgroundColor: t.cardSoft,
      }}
      data-testid="pending-pill"
    >
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: 6, height: 6, border: `1.5px solid ${t.faint}` }}
      />
      $ —
    </span>
  );
}

// ─── Invited-press row — MRP on a white carrier circle, pending pricing note.
function PressRow({ t }: { t: Theme }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl"
      style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, padding: '14px 16px' }}
      data-testid="press-row"
    >
      <span className={`h-10 w-10 rounded-full bg-white ring-1 ${t.railLogoRing} flex items-center justify-center flex-shrink-0 p-1.5`}>
        <img src={mrpLabelLogo} alt={MOCK_PRESS_NAME} className="w-full h-full object-contain" style={{ filter: 'brightness(0)' }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold truncate" style={{ color: t.ink }}>
          {MOCK_PRESS_NAME}
        </div>
        <div className="text-[12px] flex items-center gap-1.5" style={{ color: t.faint }}>
          <span
            aria-hidden
            className="rounded-full"
            style={{ width: 6, height: 6, border: `1.5px solid ${t.faint}` }}
          />
          Invited · pricing pending
        </div>
      </div>
      <button
        type="button"
        data-testid="button-ping-press"
        className={`rounded-full text-[12.5px] font-medium transition-colors ${t.navHoverClass}`}
        style={{ color: t.blue, padding: '6px 12px' }}
      >
        Ping press
      </button>
    </div>
  );
}

// ─── Mock-only floating View light / View dark toggle ────────────────────
function ThemeToggle({ mode, onToggle, t }: { mode: 'light' | 'dark'; onToggle: () => void; t: Theme }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid="button-theme-toggle"
      className="fixed z-50 inline-flex items-center gap-2 rounded-full text-[12.5px] font-medium transition-all hover:-translate-y-px"
      style={{
        right: 24,
        bottom: 24,
        padding: '9px 16px',
        color: t.ink,
        backgroundColor: t.card,
        border: `1px solid ${t.hairline}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      }}
    >
      {mode === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      {mode === 'light' ? 'View dark' : 'View light'}
    </button>
  );
}

export function ArtistReleaseDraftBuilder() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];

  const [activeDraft, setActiveDraft] = useState(MOCK_ACTIVE_DRAFT_ID);
  const [sizeId, setSizeId] = useState<SizeId>(DEFAULT_SIZE);
  const [qty, setQty] = useState<number>(DEFAULT_QTY);

  const activeDraftRef = MOCK_DRAFTS.find((d) => d.id === activeDraft) ?? MOCK_DRAFTS[0];
  const sizeLabel = MOCK_SIZES.find((s) => s.id === sizeId)?.label ?? '';

  return (
    <ArtistShell t={t}>
      {/* ─── Running estimate strip — frosted, pinned under the top bar.
          Pricing is pending, so it reads "Est. $ —", NEVER $0.00. */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between gap-4 flex-wrap"
        style={{
          minHeight: 48,
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
        data-testid="estimate-strip"
      >
        <div className="flex items-center gap-2 text-[12.5px] min-w-0" style={{ color: t.subink }}>
          <span className="font-semibold" style={{ color: t.ink }}>{sizeLabel}</span>
          <span style={{ color: t.faint }}>·</span>
          <span>{qty.toLocaleString()} units</span>
          <span style={{ color: t.faint }}>·</span>
          <span className="truncate">{MOCK_PRESS_NAME}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[12.5px]" style={{ color: t.subink }}>
            Est.{' '}
            <span className="font-medium" style={{ color: t.subink }} data-testid="estimate-pending-label">
              $ —
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium rounded-full"
            style={{ padding: '4px 12px', backgroundColor: t.cardSoft, color: t.subink }}
            data-testid="estimate-total"
          >
            <span
              aria-hidden
              className="rounded-full"
              style={{ width: 6, height: 6, border: `1.5px solid ${t.faint}` }}
            />
            $ —
          </span>
        </div>
      </div>

      <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
        {/* ─── 1 · Breadcrumb + draft identity + auto-save ─── */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <Breadcrumb t={t} />
            <div className="flex items-center gap-3">
              <SavedIndicator t={t} />
              <DraftsSwitcher drafts={MOCK_DRAFTS} activeId={activeDraft} onSelect={setActiveDraft} t={t} />
            </div>
          </div>

          <div className="flex items-start gap-4" style={{ marginTop: 12 }}>
            {/* Release cover thumb — CALIFORNIALAND art */}
            <img
              src={californialandCover}
              alt={`${MOCK_RELEASE_NAME} cover`}
              className="rounded-xl object-cover flex-shrink-0"
              style={{ width: 56, height: 56, boxShadow: t.pillShadow }}
              data-testid="release-cover"
            />
            <div className="min-w-0">
              <PageHeading lead={`${activeDraftRef.name}.`} rest="Your working draft." t={t} />
              <p className="text-[13.5px]" style={{ color: t.faint, marginTop: 6 }}>
                12″ LP for the {MOCK_RELEASE_NAME} release. A sibling draft,{' '}
                <span style={{ color: t.subink }}>CALIFORNIALAND — Vinyl 2</span>, is open too.
              </p>
            </div>
          </div>
        </div>

        {/* Invited press — ties the pending pricing to Memphis Record Pressing */}
        <div style={{ marginTop: 28, maxWidth: 520 }}>
          <PressRow t={t} />
        </div>

        <div className="h-px w-full" style={{ backgroundColor: t.hairline, margin: '32px 0' }} />

        {/* ─── 2 · Size card row — 12″ default ─── */}
        <section>
          <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
          <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink, maxWidth: 560 }}>
            The size you pick here carries through every step below. 12″ is the standard LP.
          </p>
          <div
            style={{ marginTop: 18, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
          >
            {MOCK_SIZES.map((s) => {
              const active = s.id === sizeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSizeId(s.id)}
                  aria-pressed={active}
                  data-testid={`size-${s.id}`}
                  className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                  style={{
                    padding: '16px 12px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: t.card,
                    border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
                  }}
                >
                  <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink }}>
                    {s.label}
                  </div>
                  <div className="text-[11px]" style={{ marginTop: 3, color: t.faint }}>
                    {s.note}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── 3 · Quantity card row — every run shows Pricing pending (no $0.00) ─── */}
        <section style={{ marginTop: 48 }}>
          <StepHeading lead="Pick a run." rest="Pricing lands when the press confirms." t={t} />
          <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink, maxWidth: 560 }}>
            {MOCK_PRESS_NAME} hasn&rsquo;t returned confirmed pricing yet, so every run shows a
            quiet placeholder. Your pick still saves — the numbers fill in when they land.
          </p>
          <div
            style={{ marginTop: 18, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}
          >
            {MOCK_QUANTITIES.map((q) => {
              const active = q === qty;
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQty(q)}
                  aria-pressed={active}
                  data-testid={`qty-${q}`}
                  className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none"
                  style={{
                    padding: '16px 16px',
                    cursor: 'pointer',
                    backgroundColor: t.card,
                    border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink, fontVariantNumeric: 'tabular-nums' }}>
                      {q.toLocaleString()}
                    </div>
                    <div className="text-[11px]" style={{ color: t.faint }}>units</div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <PendingPill t={t} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Running estimate breakdown card — per-component lines, all pending ─── */}
        <section style={{ marginTop: 48 }}>
          <StepHeading lead="Running estimate." rest="It fills in as pricing arrives." t={t} />
          <div
            className="rounded-2xl"
            style={{ marginTop: 18, backgroundColor: t.card, border: `1px solid ${t.hairline}`, padding: '8px 20px' }}
            data-testid="estimate-breakdown"
          >
            {MOCK_COST_LINES.map((line, i) => (
              <div
                key={line.label}
                className="flex items-center justify-between gap-4"
                style={{
                  padding: '14px 0',
                  borderTop: i === 0 ? undefined : `1px solid ${t.hairline}`,
                }}
                data-testid={`cost-line-${i}`}
              >
                <span className="text-[13.5px]" style={{ color: t.ink }}>{line.label}</span>
                <span className="text-[12.5px]" style={{ color: t.faint }}>
                  <PendingPill t={t} />
                </span>
              </div>
            ))}
            <div
              className="flex items-center justify-between gap-4"
              style={{ padding: '16px 0', borderTop: `1px solid ${t.hairline}` }}
              data-testid="cost-line-total"
            >
              <span className="text-[14px] font-semibold" style={{ color: t.ink }}>
                Est. per unit
              </span>
              <span className="text-[13px] font-medium" style={{ color: t.subink }}>
                $ —
              </span>
            </div>
          </div>
          <p className="text-[12px]" style={{ marginTop: 12, color: t.faint, maxWidth: 560 }}>
            Every edit is saved to your GoodTunes® draft automatically — there&rsquo;s no Save
            button, and a crash never loses your work.
          </p>
        </section>
      </div>

      <ThemeToggle mode={mode} onToggle={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))} t={t} />
    </ArtistShell>
  );
}

export default ArtistReleaseDraftBuilder;
