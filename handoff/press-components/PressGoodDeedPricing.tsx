// PressGoodDeedPricing — PRESS-facing "GoodDeed Certificates" pricing page.
// Duplicated from PressCatalogStickers (donor, untouched).
//
// The press (as GoodTunes' certificate printer) sets what THEY charge GoodTunes
// per printed, hologrammed GoodDeed certificate at each batch size. This is the
// press's cost TO GoodTunes — it is NOT the wholesale ladder GoodTunes charges
// artists, and no GoodTunes margin or artist pricing appears here.
//
// Apple canon: two-tone headings, frosted/blurred chrome, hairline borders,
// generous whitespace, no emojis, real (R) character. Self-contained mock.

import { useState, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Library,
  Gift,
  Settings as Cog,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Layers,
  Moon,
  Sun,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
// MRP's real logo mark (black, single-color vector) for the sticker face.
import mrpLabelLogo from '../assets/mrp-logo.svg';
import brandonPhoto from '../assets/brandon-seavers.png';

const PRESS_STICKER_LOGO = mrpLabelLogo;

// ─── Themes — light = apple-canon (default, unchanged); dark = charcoal ──
// The whole page (shell chrome, tiles, cards, headings) reads from THEMES[mode].
// Light stays the default so the ratified light rendering is byte-identical.
// The vinyl/sticker preview render, album art, splatter masks, and product
// imagery are NOT themed — they look identical in both modes.
type Theme = {
  // shell / page surfaces + ink
  canvas: string;
  rail: string;
  card: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string; // quietest gray (#a1a1a6 in light)
  tick: string;  // breadcrumb dot separator (#d0d0d5 in light)
  blue: string;
  // raised active nav-pill shadow
  pillShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // "Request" chip fill
  chipFill: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // popover / user-menu shadow + menu-row hover wash
  popShadow: string;
  menuHover: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    tick: '#d0d0d5',
    blue: '#319ED8',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-slate-400',
    avatarRing: 'ring-slate-200',
    hoverWash: 'hover:bg-slate-200',
    chipFill: 'rgba(0,0,0,0.06)',
    logoFilter: undefined,
    popShadow: '0 12px 40px rgba(0,0,0,0.16)',
    menuHover: 'hover:bg-slate-50',
  },
  dark: {
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    tick: '#48484c',
    blue: '#319ED8',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    chipFill: 'rgba(255,255,255,0.08)',
    logoFilter: 'invert(1) brightness(1.8)',
    popShadow: '0 12px 40px rgba(0,0,0,0.5)',
    menuHover: 'hover:bg-white/5',
  },
};

// The sticker render, contact shadow, and barcode are product imagery — they
// stay identical in both themes and do NOT read from the theme.

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Shell primitives (Press persona, mirrors PressDashboard) ────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog', icon: Library, active: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, active, t }: PressNavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && t.hoverWash,
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.card : undefined,
        boxShadow: active ? t.pillShadow : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

// ─── Catalog + Components pull-downs ──────────────────────────────────
const COMPONENTS_CHILDREN: { label: string; mock: string }[] = [
  { label: 'Vinyl', mock: 'PressVinylColorSetup' },
  { label: 'Jackets', mock: 'ArtistChooseJacket' },
  { label: 'Inner Sleeves', mock: 'ArtistChooseInnerSleeve' },
  { label: 'Center Labels', mock: 'PressCatalogVinylLabels' },
  { label: 'Inserts', mock: 'ArtistChooseInserts' },
  { label: 'Stickers', mock: 'PressCatalogStickers' },
  { label: 'Pricing', mock: 'PressCatalogPricing' },
];
const COMPONENTS_ACTIVE = '';


type CatalogChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; active?: boolean };
const CATALOG_CHILDREN: CatalogChild[] = [
  { label: 'GoodTunes Packages', icon: NavPackage },
  { label: 'White Label', icon: NavLayers, soon: true },
  { label: 'GoodDeed Certificates', icon: NavAward, active: true },
  { label: 'Specs', icon: NavWave, soon: true },
  { label: 'Templates', icon: NavTemplate, soon: true },
];

function CatalogRail({ item, t }: { item: PressNavItem; t: Theme }) {
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [componentsOpen, setComponentsOpen] = useState(true);
  const CatalogIcon = item.icon;
  return (
    <>
      <button
        type="button"
        aria-expanded={catalogOpen}
        onClick={() => setCatalogOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
          !item.active && t.hoverWash,
        )}
        style={{
          fontWeight: item.active ? 600 : 500,
          color: item.active ? t.ink : t.subink,
          backgroundColor: item.active ? t.card : undefined,
          boxShadow: item.active ? t.pillShadow : undefined,
        }}
      >
        <CatalogIcon className="w-4 h-4 flex-shrink-0" style={{ color: item.active ? t.ink : t.faint }} />
        <span className="truncate flex-1 text-left">{item.label}</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint, transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      <div className="space-y-0.5">
        {CATALOG_CHILDREN.map(({ label, icon: Icon, soon, active }) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !active && t.hoverWash)}
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? t.ink : t.subink,
              backgroundColor: active ? t.card : undefined,
              boxShadow: active ? t.pillShadow : undefined,
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
            <span className="truncate flex-1">{label}</span>
            {soon && (
              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.chipFill, color: t.subink }}>
                Request
              </span>
            )}
          </a>
        ))}
      </div>


      <button
        type="button"
        aria-expanded={componentsOpen}
        onClick={() => setComponentsOpen((v) => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', t.hoverWash)}
        style={{ fontWeight: 500, color: t.subink }}
      >
        <Layers className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
        <span className="truncate flex-1 text-left">Components</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint, transform: componentsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {componentsOpen && (
        <div className="space-y-0.5" style={{ marginLeft: 18, paddingLeft: 12, borderLeft: `1px solid ${t.hairline}` }}>
          {COMPONENTS_CHILDREN.map((c) => {
            const active = c.label === COMPONENTS_ACTIVE;
            return (
              <a
                key={c.label}
                href={`#/${c.mock}`}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] transition-colors',
                  !active && t.hoverWash,
                )}
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? t.ink : t.subink,
                  backgroundColor: active ? t.card : undefined,
                  boxShadow: active ? t.pillShadow : undefined,
                }}
              >
                <span className="truncate flex-1">{c.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

const PARTNER_NAME = 'Memphis Record Pressing';
const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL = 'brandon@memphisrecordpressing.com';
const USER_INITIALS = 'BS';

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu({ t }: { t: Theme }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow', t.avatarRing)}
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={brandonPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, boxShadow: t.popShadow }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.menuHover)}
                style={{ color: t.ink }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.menuHover)}
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

function PressShell({ t, mode, onToggleMode, children }: { t: Theme; mode: 'light' | 'dark'; onToggleMode: () => void; children: ReactNode }) {
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
          {/* White logo carrier chip stays white in BOTH themes — it is the light surface. */}
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={mrpLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {PARTNER_NAME}
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
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} />
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
                className={cn('w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) =>
              item.label === 'Catalog'
                ? <CatalogRail key={item.label} item={item} t={t} />
                : <NavRow key={item.label} {...item} t={t} />
            )}
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

      {/* Mock-only theme toggle */}
      <button
        type="button"
        onClick={onToggleMode}
        className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </div>
  );
}

// ─── Two-tone headings ───────────────────────────────────────────────
function PageHeading({ lead, rest, t }: { lead: React.ReactNode; rest: string; t: Theme }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint }}>{rest}</span>
    </h2>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

// ─── Batch rungs — same rungs GoodTunes orders in after a signed window ──
type Rung = { id: string; batch: string; note: string };
const RUNGS: Rung[] = [
  { id: '25', batch: '25–49', note: 'Smallest print run' },
  { id: '50', batch: '50–99', note: '' },
  { id: '100', batch: '100–199', note: '' },
  { id: '200', batch: '200–299', note: '' },
  { id: '300', batch: '300+', note: 'Best rate' },
];

// ─── Price cell — quiet editable input, $-prefixed, tabular ──────────
function PriceCell({
  value,
  onChange,
  t,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  t: Theme;
  testId: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      className="flex items-center justify-end gap-0.5 rounded-lg transition-all"
      style={{
        width: 128,
        height: 36,
        paddingRight: 10,
        border: focused ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
        backgroundColor: t.card,
      }}
    >
      <span className="text-[13px]" style={{ color: value ? t.ink : t.faint }}>$</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="0.00"
        inputMode="decimal"
        data-testid={testId}
        className={cn('text-right text-[14px] font-semibold tabular-nums focus:outline-none', t.searchPlaceholder)}
        style={{ width: 68, background: 'transparent', border: 'none', color: t.ink }}
      />
    </div>
  );
}

export function PressGoodDeedPricing() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [prices, setPrices] = useState<Record<string, string>>({ '25': '', '50': '', '100': '', '200': '', '300': '' });
  const priced = RUNGS.filter((r) => prices[r.id] !== '').length;

  return (
    <PressShell t={t} mode={mode} onToggleMode={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">Catalog</a>
            <span style={{ color: t.tick }}>›</span>
            <span style={{ color: t.subink }}>GoodDeed Certificates</span>
          </div>
          <PageHeading
            lead={<>GoodDeed<span style={{ fontSize: '0.45em', verticalAlign: 'super', fontWeight: 600 }}>®</span> Certificate.</>}
            rest="Signed Sealed & Delivered."
            t={t}
          />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 620, color: t.subink }}>
            When a pre-sale window closes, GoodTunes orders the whole batch from you in one run.
            Set the per-certificate price you charge at each batch size.
          </p>
        </div>

        <div
          style={{
            marginTop: 44,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 380px',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* LEFT — the editable ladder */}
          <section className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <StepHeading lead="Batch ladder." rest="Price each run size." t={t} />
              <span className="text-[12px] tabular-nums flex-shrink-0" style={{ marginTop: 6, color: t.faint }}>
                {priced} of {RUNGS.length} priced
              </span>
            </div>
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              Per certificate — printed, hologrammed, and shrink-wrap ready. Larger batches
              usually earn a better rate.
            </p>

            <div className="rounded-2xl overflow-hidden" style={{ marginTop: 18, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>
              <div className="flex items-center" style={{ padding: '10px 20px', borderBottom: `1px solid ${t.hairline}` }}>
                <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>Batch</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-right" style={{ color: t.faint }}>Your price / unit</span>
              </div>
              {RUNGS.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center"
                  style={{ padding: '12px 20px', borderBottom: i < RUNGS.length - 1 ? `1px solid ${t.hairline}` : undefined }}
                  data-testid={`row-rung-${r.id}`}
                >
                  <div className="flex-1 min-w-0 flex items-baseline gap-2.5">
                    <span className="text-[15px] font-semibold tabular-nums" style={{ color: t.ink }}>{r.batch}</span>
                    {r.note && <span className="text-[11.5px]" style={{ color: t.faint }}>{r.note}</span>}
                  </div>
                  <PriceCell value={prices[r.id]} onChange={(v) => setPrices((p) => ({ ...p, [r.id]: v }))} t={t} testId={`input-price-${r.id}`} />
                </div>
              ))}
            </div>

            <p className="text-[12px]" style={{ marginTop: 14, maxWidth: 560, color: t.faint, lineHeight: 1.5 }}>
              <span className="font-semibold" style={{ color: t.subink }}>25-certificate minimum.</span>{' '}
              If fewer than 25 sell by window close, no print run happens — you&rsquo;re never
              asked to run a batch below your smallest rung.
            </p>
          </section>

          {/* RIGHT — how batches work (quiet explainer) */}
          <aside className="rounded-2xl self-start" style={{ marginTop: 77, padding: '22px 24px', border: `1px solid ${t.hairline}`, backgroundColor: t.card }}>
            <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>How a batch works.</h3>
            <ol style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                ['Window closes', 'A signed pre-sale window ends and every buyer is known.'],
                ['One print run', 'GoodTunes orders the full batch from you — numbered, hologrammed, one run.'],
                ['Ship to artist', 'The stack ships out for wet signatures, then returns for insertion.'],
                ['You get paid', 'At the rate you set here, snapped to the actual batch size.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-3">
                  <span
                    className="flex items-center justify-center rounded-full text-[11px] font-semibold flex-shrink-0 tabular-nums"
                    style={{ width: 22, height: 22, marginTop: 1, backgroundColor: t.chipFill, color: t.subink }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold" style={{ color: t.ink }}>{title}</span>
                    <span className="block text-[12px]" style={{ marginTop: 2, color: t.subink, lineHeight: 1.45 }}>{body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-[11.5px]" style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.hairline}`, color: t.faint, lineHeight: 1.5 }}>
              These rates are between you and GoodTunes. Artists never see them.
            </p>
          </aside>
        </div>
      </div>
    </PressShell>
  );
}

export default PressGoodDeedPricing;
