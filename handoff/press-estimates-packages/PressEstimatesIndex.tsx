// ─────────────────────────────────────────────────────────────────────
// PRESS MOCK_ESTIMATES HOME — Create › Estimates lands here (founder brief).
// The builder now lives ONE LEVEL DOWN: this index's single filled-blue
// "Build estimate" CTA (and every row/card) leads to #/PressQuoteBuilder.
// Canon: light/dark press shell from PressQuoteBuilder, "estimate" never
// "quote" in copy, one filled blue max, statuses always word + icon —
// never color alone (founder is colorblind).
// ─────────────────────────────────────────────────────────────────────
import { useState, useEffect, type ReactNode } from 'react';
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
  LayoutGrid,
  SlidersHorizontal,
  Check,
  Rows3,
  ArrowUpRight,
  ArrowDownLeft,
  PencilLine,
  Send,
  Eye,
  CircleCheck,
  CircleSlash,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate, Boxes, Disc as NavVinyl, Square as NavJacket, CircleDot as NavLabel, FileText as NavInsert, Sticker as NavSticker, ReceiptText as NavPricing, ClipboardList as NavEstimates } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';
import californialandCover from '../assets/californialand-cover.jpg';
import niinaJacket from '../assets/niina-jacket.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import jeannePhoto from '../assets/jeanne-rebillard.jpg';
import arianPhoto from '../assets/arian-kennedy.jpg';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = 'var(--q-ink)';
const SUBINK = 'var(--q-subink)';
const HAIRLINE = 'var(--q-hairline)';
const CANVAS = 'var(--q-canvas)';
const RAIL = 'var(--q-rail)';
const PILL_SHADOW = 'var(--q-pill-shadow)';

type QMode = 'light' | 'dark' | 'system';

const Q_THEME_CSS = String.raw`
:root { --q-ink:#1d1d1f; --q-subink:#6e6e73; --q-hairline:#e6e6ea; --q-canvas:#f5f5f7; --q-rail:#f5f5f7; --q-card:#ffffff; --q-track:#f2f2f5; --q-frost:rgba(255,255,255,0.78); --q-pill-shadow:0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04); }
html[data-gt-dark] { --q-ink:#f5f5f7; --q-subink:#98989d; --q-hairline:rgba(255,255,255,0.12); --q-canvas:#161617; --q-rail:#1c1c1e; --q-card:#2a2a2d; --q-track:rgba(255,255,255,0.08); --q-frost:rgba(22,22,23,0.72); --q-pill-shadow:0 1px 3px rgba(0,0,0,0.5); }
html[data-gt-dark] .q-root .bg-white { background-color: var(--q-card) !important; }
html[data-gt-dark] .q-root .hover\:bg-slate-50:hover, html[data-gt-dark] .q-root .hover\:bg-slate-100:hover, html[data-gt-dark] .q-root .hover\:bg-slate-200:hover, html[data-gt-dark] .q-root .hover\:bg-black\/5:hover { background-color: rgba(255,255,255,0.07) !important; }
html[data-gt-dark] .q-root .ring-slate-200 { --tw-ring-color: rgba(255,255,255,0.15); }
html[data-gt-dark] .q-root .placeholder\:text-slate-400::placeholder { color: rgba(255,255,255,0.30); }
html[data-gt-dark] .q-root .hover\:text-slate-600:hover { color: #d0d0d5 !important; }
html[data-gt-dark] [data-radix-popper-content-wrapper] > div { background-color: #2a2a2d !important; border-color: rgba(255,255,255,0.12) !important; }
html[data-gt-dark] [data-radix-popper-content-wrapper] .hover\:bg-slate-50:hover { background-color: rgba(255,255,255,0.07) !important; }
`;

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// SHELL (from PressQuoteBuilder, verbatim)
// ═══════════════════════════════════════════════════════════════════
type PressNavChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; route?: string };
type PressNavItem = { label: string; icon: typeof LayoutDashboard; soon?: boolean; children?: PressNavChild[] };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  {
    label: 'Create', icon: NavEstimates,
    children: [
      { label: 'Estimates', icon: NavEstimates, route: 'PressEstimatesIndex' },
      { label: 'Packages', icon: NavPackage, route: 'PressPackagesIndex' },
    ],
  },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    label: 'Product Specs', icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: NavPackage },
      { label: 'GoodDeed Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave },
      { label: 'Templates', icon: NavTemplate },
    ],
  },
  {
    label: 'Components', icon: Boxes,
    children: [
      { label: 'Vinyl', icon: NavVinyl },
      { label: 'Jackets', icon: NavJacket },
      { label: 'Inner Sleeves', icon: NavLayers },
      { label: 'Center Labels', icon: NavLabel },
      { label: 'Inserts', icon: NavInsert },
      { label: 'Stickers', icon: NavSticker },
      { label: 'Pricing', icon: NavPricing },
    ],
  },
  { label: 'White Label', icon: NavLayers, soon: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

const ACTIVE_NAV = 'Estimates';

function NavLeaf({ label, icon: Icon, soon, route, child }: PressNavChild & { child?: boolean }) {
  const isActive = label === ACTIVE_NAV;
  return (
    <a
      href={route ? `#/${route}` : '#'}
      onClick={(e) => { if (!route) e.preventDefault(); }}
      className={cn(
        'flex items-center gap-2.5 pr-2.5 h-9 rounded-lg transition-colors',
        child ? 'pl-7 text-[13px]' : 'pl-2.5 text-[13.5px]',
        !isActive && 'hover:bg-black/5',
      )}
      style={{
        fontWeight: isActive ? 600 : 500,
        color: isActive ? INK : SUBINK,
        backgroundColor: isActive ? 'var(--q-card)' : undefined,
        boxShadow: isActive ? PILL_SHADOW : undefined,
      }}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? INK : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
      {soon && (
        <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: SUBINK }}>
          Request
        </span>
      )}
    </a>
  );
}

function PressNavTree() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const item of PRESS_NAV) {
      if (item.children) o[item.label] = item.children.some((c) => c.label === ACTIVE_NAV);
    }
    return o;
  });
  return (
    <>
      {PRESS_NAV.map((item) => {
        if (item.children) {
          const isOpen = open[item.label];
          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [item.label]: !o[item.label] }))}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors hover:bg-black/5"
                style={{ fontWeight: 500, color: SUBINK }}
                data-testid={`nav-group-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <NavChevron className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: '#a1a1a6', transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                <span className="truncate flex-1 text-left">{item.label}</span>
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {item.children.map((c) => <NavLeaf key={c.label} {...c} child />)}
                </div>
              )}
            </div>
          );
        }
        return <NavLeaf key={item.label} {...item} />;
      })}
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

function UserMenu({ qMode, setQMode }: { qMode: QMode; setQMode: (m: QMode) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow"
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
        style={{ border: `1px solid ${HAIRLINE}` }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
                style={{ color: INK }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="px-3.5 py-2.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginBottom: 8 }}>Appearance</div>
          <div className="flex rounded-full p-0.5" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label="Appearance">
            {(['light', 'dark', 'system'] as QMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={qMode === m}
                onClick={() => setQMode(m)}
                className="flex-1 h-7 rounded-full text-[12px] transition-colors capitalize"
                style={{
                  fontWeight: qMode === m ? 600 : 500,
                  color: qMode === m ? INK : SUBINK,
                  backgroundColor: qMode === m ? 'var(--q-canvas)' : 'transparent',
                  boxShadow: qMode === m ? PILL_SHADOW : undefined,
                }}
                data-testid={`appearance-${m}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
            style={{ color: INK }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PressShell({ children }: { children: ReactNode }) {
  const [qMode, setQMode] = useState<QMode>(() => {
    try {
      const v = localStorage.getItem('gt-appearance');
      return v === 'light' || v === 'dark' || v === 'system' ? v : 'dark';
    } catch { return 'dark'; }
  });
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const isDark = qMode === 'dark' || (qMode === 'system' && systemDark);
  useEffect(() => {
    try { localStorage.setItem('gt-appearance', qMode); } catch { /* mock */ }
    if (isDark) document.documentElement.setAttribute('data-gt-dark', '');
    else document.documentElement.removeAttribute('data-gt-dark');
    return () => { document.documentElement.removeAttribute('data-gt-dark'); };
  }, [qMode, isDark]);
  return (
    <div className="q-root h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <style>{Q_THEME_CSS}</style>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: 'var(--q-frost)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-full ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 p-1" style={{ backgroundColor: '#ffffff' }}>
            <img src={mrpLogo} alt={PARTNER_NAME} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {PARTNER_NAME}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            style={{ color: SUBINK, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu qMode={qMode} setQMode={setQMode} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: RAIL, borderRight: `1px solid ${HAIRLINE}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
              <input
                className="w-full h-9 pl-8 pr-10 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: '#a1a1a6' }}>⌘K</span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            <PressNavTree />
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: '#a1a1a6' }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Two-tone heading (canon) ────────────────────────────────────────
function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ESTIMATE MODEL — seeded rows (word + icon statuses; never color alone)
// ═══════════════════════════════════════════════════════════════════
type EstStatus = 'Draft' | 'Sent' | 'Viewed' | 'Converted' | 'Abandoned';
type EstDirection = 'Outbound' | 'Inbound';
type VinylSize = '7' | '10' | '12';

const STATUS_META: Record<EstStatus, { icon: typeof PencilLine; color: string }> = {
  // Color is a secondary cue only — the word + icon carry the meaning.
  Draft: { icon: PencilLine, color: '#a1a1a6' },
  Sent: { icon: Send, color: BLUE },
  Viewed: { icon: Eye, color: BLUE },
  Converted: { icon: CircleCheck, color: '#34a853' },
  Abandoned: { icon: CircleSlash, color: '#a1a1a6' },
};

type Estimate = {
  id: string;
  artist: string;
  build: string;          // 12" · 300 · Ruby …
  size: VinylSize;
  total: string;
  direction: EstDirection; // Outbound = press-created / Inbound = artist self-service
  source: string;          // MRP referral code / site
  status: EstStatus;
  lastActivity: string;
  cover?: string;          // artwork; falls back to Memphis house art
  thumb?: string;          // circular artist photo; falls back to initials
};

const MOCK_ESTIMATES: Estimate[] = [
  { id: 'MRP-081626-01', artist: 'Niina Soleil', build: '12" · 500 · Ruby translucent · gatefold', size: '12', total: '$3,595', direction: 'Outbound', source: 'Referral MRP-4417', status: 'Sent', lastActivity: 'Aug 14, 2026', cover: niinaJacket, thumb: niinaPhoto },
  { id: 'MRP-081526-03', artist: 'Alma Rivera', build: '12" · 300 · Black 180g · single jacket', size: '12', total: '$1,988', direction: 'Inbound', source: 'memphisrecordpressing.com', status: 'Viewed', lastActivity: 'Aug 15, 2026', cover: californialandCover, thumb: jeannePhoto },
  { id: 'MRP-081226-02', artist: 'The Blue Hours', build: '12" · 1,000 · Black 140g · printed sleeve', size: '12', total: '$5,370', direction: 'Outbound', source: 'Referral MRP-2210', status: 'Converted', lastActivity: 'Aug 12, 2026', thumb: arianPhoto },
  { id: 'MRP-081626-04', artist: 'Turnstile Collective', build: '12" · 300 · Splatter · discobag', size: '12', total: '$1,764', direction: 'Inbound', source: 'memphisrecordpressing.com', status: 'Draft', lastActivity: 'Aug 16, 2026' },
  { id: 'MRP-081026-01', artist: 'June & The Half Moons', build: '7" · 500 · Black 140g · unprinted sleeve', size: '7', total: '$1,215', direction: 'Outbound', source: 'Referral MRP-1178', status: 'Sent', lastActivity: 'Aug 10, 2026' },
  { id: 'MRP-073026-05', artist: 'Ravenna Gray', build: '12" · 500 · Cobalt translucent · gatefold', size: '12', total: '$3,410', direction: 'Inbound', source: 'memphisrecordpressing.com', status: 'Abandoned', lastActivity: 'Jul 30, 2026' },
  { id: 'MRP-081326-01', artist: 'Hotel Saturn', build: '10" · 300 · Black 140g · single jacket', size: '10', total: '$1,842', direction: 'Outbound', source: 'Referral MRP-3305', status: 'Viewed', lastActivity: 'Aug 13, 2026' },
  { id: 'MRP-080926-02', artist: 'Motor City Vows', build: '12" · 2,000 · Black 140g · shrinkwrapped', size: '12', total: '$9,840', direction: 'Outbound', source: 'Referral MRP-2210', status: 'Converted', lastActivity: 'Aug 9, 2026' },
];

// ─── Shared bits ─────────────────────────────────────────────────────
function StatusWord({ status }: { status: EstStatus }) {
  const { icon: Icon, color } = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: INK }} data-testid={`status-${status.toLowerCase()}`}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} aria-hidden />
      {status}
    </span>
  );
}

function DirectionWord({ direction }: { direction: EstDirection }) {
  const Icon = direction === 'Outbound' ? ArrowUpRight : ArrowDownLeft;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: SUBINK }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} aria-hidden />
      {direction}
    </span>
  );
}

// Memphis house art — estimates with no uploaded artwork get the MRP mark.
function HouseArt() {
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <img src={mrpLogo} alt="" aria-hidden className="w-1/3 h-auto opacity-80" style={{ filter: 'invert(1) brightness(1.7)' }} />
    </div>
  );
}

function ArtistThumb({ e, size = 34 }: { e: Estimate; size?: number }) {
  const initials = e.artist.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ring-1 ring-slate-200"
      style={{ width: size, height: size, backgroundColor: 'var(--q-track)' }}
    >
      {e.thumb
        ? <img src={e.thumb} alt={e.artist} className="w-full h-full object-cover" />
        : <span className="text-[11px] font-semibold" style={{ color: SUBINK }}>{initials}</span>}
    </span>
  );
}

// ONE solid segmented pill group (canon, matches the view toggle & the
// appearance control) — reads by weight/surface, not color.
function SegGroup<T extends string>({ options, value, onChange, ariaLabel, testPrefix }: {
  options: Array<[T, string]>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  testPrefix: string;
}) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-full flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label={ariaLabel}>
      {options.map(([id, label]) => {
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(id)}
            className="h-8 px-3.5 rounded-full text-[12.5px] transition-colors"
            style={{
              fontWeight: on ? 600 : 500,
              color: on ? INK : SUBINK,
              backgroundColor: on ? 'var(--q-card)' : 'transparent',
              boxShadow: on ? PILL_SHADOW : undefined,
            }}
            data-testid={`${testPrefix}-${id.toLowerCase()}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Status filter — ported from the admin toolbar pattern (SuperAdminPressesFind):
// quiet hairline pill opening a checklist; statuses word + icon, never color alone.
function StatusFilter({ selected, onToggle }: { selected: EstStatus[]; onToggle: (s: EstStatus) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-9 px-3.5 rounded-full text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-black/5 flex-shrink-0"
          style={{ color: selected.length ? INK : SUBINK, border: `1px solid ${HAIRLINE}` }}
          data-testid="button-filter-status"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: '#a1a1a6' }} />
          Filter
          {selected.length > 0 && (
            <span className="text-[10.5px] font-semibold rounded-full px-1.5 h-4 inline-flex items-center" style={{ backgroundColor: 'var(--q-track)', color: INK }}>
              {selected.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-52 p-1.5 rounded-2xl" style={{ border: `1px solid ${HAIRLINE}` }} data-testid="menu-filter-status">
        {(Object.keys(STATUS_META) as EstStatus[]).map((s) => {
          const { icon: Icon, color } = STATUS_META[s];
          const on = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => onToggle(s)}
              aria-pressed={on}
              className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] hover:bg-slate-50 transition-colors"
              style={{ color: INK, fontWeight: on ? 600 : 500 }}
              data-testid={`filter-status-${s.toLowerCase()}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} aria-hidden />
              <span className="flex-1 text-left">{s}</span>
              {on && <Check className="w-4 h-4 flex-shrink-0" style={{ color: INK }} />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
type Format = 'All' | 'Vinyl' | 'CD' | 'Cassette';
type View = 'grid' | 'table';

export function PressEstimatesIndex() {
  const [view, setView] = useState<View>('grid');
  const [format, setFormat] = useState<Format>('All');
  const [size, setSize] = useState<VinylSize | 'all'>('all');
  const [statuses, setStatuses] = useState<EstStatus[]>([]);

  const toggleStatus = (s: EstStatus) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const formatEmpty = format === 'CD' || format === 'Cassette';
  const rows = formatEmpty
    ? []
    : MOCK_ESTIMATES
        .filter((e) => format !== 'Vinyl' || size === 'all' || e.size === size)
        .filter((e) => statuses.length === 0 || statuses.includes(e.status));

  return (
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>
        {/* Header */}
        <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#a1a1a6' }}>
          Estimates
        </div>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <PageHeading lead="Estimates." rest="Every build, one place." />
            <p className="text-[15px]" style={{ marginTop: 10, maxWidth: 560, color: SUBINK }}>
              Outbound estimates your team sent, and inbound ones artists started themselves.
            </p>
            <p className="text-[12px]" style={{ marginTop: 6, color: '#a1a1a6' }}>
              Estimates are immutable once sent — edits issue a new estimate variant.
            </p>
          </div>
          {/* ONE filled blue — canon primary, verbatim copy of PressQuoteBuilder's
              "Send estimate" pill. Rule: CTAs are copied from a canon button, never
              hand-styled (founder, Aug 16 2026). */}
          <Button
            asChild
            className="rounded-full px-7 flex-shrink-0"
            style={{ background: BLUE, color: '#fff', height: 44, fontSize: 14.5, marginTop: 34 }}
            data-testid="button-build-estimate"
          >
            <a href="#/PressQuoteBuilder">Build estimate</a>
          </Button>
        </div>

        {/* Toolbar: format segments left · sizes (vinyl only) + search + filter + view right */}
        <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 34 }}>
          <SegGroup
            options={[['All', 'All'], ['Vinyl', 'Vinyl'], ['CD', 'CD'], ['Cassette', 'Cassette']]}
            value={format}
            onChange={(f) => { setFormat(f); setSize('all'); }}
            ariaLabel="Format"
            testPrefix="chip-format"
          />
          <div className="flex items-center gap-2.5 flex-wrap">
            {format === 'Vinyl' && (
              <SegGroup
                options={[['all', 'All sizes'], ['7', '7"'], ['10', '10"'], ['12', '12"']] as Array<[VinylSize | 'all', string]>}
                value={size}
                onChange={(v) => setSize(v)}
                ariaLabel="Vinyl size"
                testPrefix="chip-size"
              />
            )}
            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-black/5 flex-shrink-0"
              style={{ color: SUBINK, border: `1px solid ${HAIRLINE}` }}
              aria-label="Search estimates"
              data-testid="button-search-estimates"
            >
              <Search className="w-4 h-4" />
            </button>
            <StatusFilter selected={statuses} onToggle={toggleStatus} />
            {/* View toggle — quiet segmented pair, grid / table */}
            <div className="flex rounded-full p-0.5 flex-shrink-0" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label="View">
              {([['grid', LayoutGrid, 'Grid'], ['table', Rows3, 'Table']] as Array<[View, typeof LayoutGrid, string]>).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={`${label} view`}
                  onClick={() => setView(v)}
                  className="h-8 w-10 rounded-full flex items-center justify-center transition-colors"
                  style={{
                    color: view === v ? INK : '#a1a1a6',
                    backgroundColor: view === v ? 'var(--q-card)' : 'transparent',
                    boxShadow: view === v ? PILL_SHADOW : undefined,
                  }}
                  data-testid={`view-${v}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Empty state for formats with no model yet */}
        {formatEmpty && (
          <div
            className="rounded-2xl bg-white flex flex-col items-center justify-center text-center"
            style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, padding: '72px 32px' }}
            data-testid="empty-format"
          >
            <NavVinyl className="w-8 h-8" style={{ color: '#a1a1a6' }} aria-hidden />
            <div className="text-[16px] font-semibold" style={{ marginTop: 14, color: INK }}>
              No {format} estimates yet
            </div>
            <p className="text-[13px]" style={{ marginTop: 6, maxWidth: 380, color: SUBINK }}>
              {format} builds aren&rsquo;t modeled yet. Every estimate so far is vinyl — switch back to see them.
            </p>
          </div>
        )}

        {/* GRID VIEW — cover art with circular artist thumb overlaid */}
        {!formatEmpty && rows.length === 0 && (
          <div
            className="rounded-2xl bg-white flex flex-col items-center justify-center text-center"
            style={{ marginTop: 28, border: `1px solid ${HAIRLINE}`, padding: '72px 32px' }}
            data-testid="empty-filter"
          >
            <SlidersHorizontal className="w-8 h-8" style={{ color: '#a1a1a6' }} aria-hidden />
            <div className="text-[16px] font-semibold" style={{ marginTop: 14, color: INK }}>
              No estimates match
            </div>
            <p className="text-[13px]" style={{ marginTop: 6, maxWidth: 380, color: SUBINK }}>
              Nothing matches the current filters — clear a status or size to see more.
            </p>
          </div>
        )}

        {!formatEmpty && rows.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5" style={{ marginTop: 28 }}>
            {rows.map((e) => (
              <a
                key={e.id}
                href="#/PressQuoteBuilder"
                className="group rounded-2xl bg-white overflow-hidden transition-all hover:-translate-y-px"
                style={{ border: `1px solid ${HAIRLINE}` }}
                data-testid={`card-estimate-${e.id}`}
              >
                <div className="relative aspect-square overflow-hidden">
                  {e.cover
                    ? <img src={e.cover} alt={`${e.artist} artwork`} className="w-full h-full object-cover" />
                    : <HouseArt />}
                  <span className="absolute left-3 bottom-3">
                    <ArtistThumb e={e} size={38} />
                  </span>
                </div>
                <div className="px-4 pt-3 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[14px] font-semibold truncate" style={{ color: INK }}>{e.artist}</div>
                    <div className="text-[13.5px] font-semibold flex-shrink-0" style={{ color: INK }}>{e.total}</div>
                  </div>
                  <div className="text-[12px] truncate" style={{ marginTop: 3, color: SUBINK }}>{e.build}</div>
                  <div className="flex items-center justify-between gap-2" style={{ marginTop: 10 }}>
                    <StatusWord status={e.status} />
                    <DirectionWord direction={e.direction} />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* TABLE VIEW */}
        {!formatEmpty && rows.length > 0 && view === 'table' && (
          <div className="rounded-2xl bg-white overflow-hidden" style={{ marginTop: 28, border: `1px solid ${HAIRLINE}` }}>
            <table className="w-full text-left" data-testid="table-estimates">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
                  <th className="pl-5 pr-3 py-3 font-semibold">Artist</th>
                  <th className="px-3 py-3 font-semibold">Build</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Direction</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="pl-3 pr-5 py-3 font-semibold">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer transition-colors hover:bg-black/5"
                    style={{ borderTop: `1px solid ${HAIRLINE}` }}
                    onClick={() => { window.location.hash = '#/PressQuoteBuilder'; }}
                    data-testid={`row-estimate-${e.id}`}
                  >
                    <td className="pl-5 pr-3 py-3">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <ArtistThumb e={e} size={30} />
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-semibold truncate" style={{ color: INK }}>{e.artist}</span>
                          <span className="block text-[11px] truncate" style={{ color: '#a1a1a6' }}>{e.id}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[12.5px]" style={{ color: SUBINK }}>{e.build}</td>
                    <td className="px-3 py-3 text-[13px] font-semibold whitespace-nowrap" style={{ color: INK }}>{e.total}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><DirectionWord direction={e.direction} /></td>
                    <td className="px-3 py-3 text-[12.5px] truncate" style={{ color: SUBINK, maxWidth: 200 }}>{e.source}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><StatusWord status={e.status} /></td>
                    <td className="pl-3 pr-5 py-3 text-[12.5px] whitespace-nowrap" style={{ color: SUBINK }}>{e.lastActivity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PressShell>
  );
}
