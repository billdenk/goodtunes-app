// PressPackagesIndex — the press-side "MRP Packages" catalog. A press (MRP)
// sees and edits the packages they've built with the builder. These are the
// press's OWN saved packages, distinct from GoodTunes' standard set.
//
// Shell + canon rail copied verbatim from PressQuoteBuilder (the donor).
// Self-contained: only react + lucide-react + the shared Button/Popover.

import { useState, useEffect, useRef, type ReactNode } from 'react';
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
  CheckCircle2,
  Pencil,
  Plus,
  X,
  MoreHorizontal,
  Archive,
  Trash2,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate, Boxes, Disc as NavVinyl, Square as NavJacket, CircleDot as NavLabel, FileText as NavInsert, ReceiptText as NavPricing, ClipboardList as NavEstimates } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import mrpLabelLogo from '../assets/mrp-logo.svg';
import rubyVinylPhoto from '../assets/mrp-ruby-translucent.png';
import brandonPhoto from '../assets/brandon-seavers.png';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
const INK = 'var(--q-ink)';
const SUBINK = 'var(--q-subink)';
const HAIRLINE = 'var(--q-hairline)';
const CANVAS = 'var(--q-canvas)';
const RAIL = 'var(--q-rail)';
const PILL_SHADOW = 'var(--q-pill-shadow)';

type QMode = 'light' | 'dark' | 'system';

// Vars live on :root so portalled popovers resolve them too. The <style> tag
// mounts only while this mock is mounted; tailwind-class remaps stay scoped.
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
// SHELL (from the donor screens, verbatim)
// ═══════════════════════════════════════════════════════════════════
// ─── THE canon press rail — copied from PressRailCanon (Bill, Aug 16 2026) ───
type PressNavChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; route?: string };
type PressNavItem = { label: string; icon: typeof LayoutDashboard; soon?: boolean; children?: PressNavChild[] };

// Rail updated to PressRailCanon (Bill's cross-vendor standard, Aug 18 2026):
// Details after Dashboard, Components format-first (Vinyl · CD · Cassette ·
// Pricing), Settings PINNED to the rail bottom with General/Team/Contacts/
// White Label inside.
const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Details', icon: NavInsert },
  { label: 'Clients', icon: Users },
  {
    // Create (founder, Aug 16 2026): an estimate or a package are two different
    // creations on two pages — one "Create" entry, live links to each.
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
      // On this page the press's own catalog lives here. It reads
      // "MRP Packages" — the press's built packages, not GoodTunes' set.
      { label: 'MRP Packages', icon: NavPackage },
      { label: 'GoodDeed® Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave },
      { label: 'Templates', icon: NavTemplate },
    ],
  },
  {
    // Format-first: formats are rail items; per-component pages live as
    // in-page segmented controls on each format's page.
    label: 'Components', icon: Boxes,
    children: [
      { label: 'Vinyl', icon: NavVinyl },
      { label: 'CD', icon: NavLabel },
      { label: 'Cassette', icon: NavJacket },
      { label: 'Pricing', icon: NavPricing },
    ],
  },
  { label: 'Referrals', icon: Gift },
];

// Settings — pinned to the rail bottom, always last (cross-vendor standard).
const PRESS_SETTINGS: PressNavItem = {
  label: 'Settings', icon: Cog,
  children: [
    { label: 'General', icon: Cog },
    { label: 'Team', icon: Users },
    { label: 'Contacts', icon: Users },
    { label: 'White Label', icon: NavLayers, soon: true },
  ],
};

// This page IS the MRP Packages catalog, so that leaf is the active page.
// This page is where Create › Packages lands (founder, Aug 16 2026).
const ACTIVE_NAV = 'Packages';

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
      data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
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
  // The group holding the active page starts open; the other starts closed.
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

// Settings pinned to the rail bottom — collapsible, above "Powered by".
// The pinned White Label child reads "Soon" (canon: quiet pill, word never
// color alone).
function PressSettingsPinned() {
  const [isOpen, setIsOpen] = useState(
    PRESS_SETTINGS.children!.some((c) => c.label === ACTIVE_NAV),
  );
  return (
    <div className="flex-shrink-0 px-2.5 pt-1.5 pb-2" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors hover:bg-black/5"
        style={{ fontWeight: 500, color: SUBINK }}
        data-testid="nav-group-settings"
      >
        <NavChevron className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: '#a1a1a6', transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
        <span className="truncate flex-1 text-left">{PRESS_SETTINGS.label}</span>
      </button>
      {isOpen && (
        <div className="space-y-0.5">
          {PRESS_SETTINGS.children!.map(({ label, icon: Icon, soon }) => (
            <a
              key={label}
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors hover:bg-black/5"
              style={{ fontWeight: 500, color: SUBINK }}
              data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
              <span className="truncate flex-1">{label}</span>
              {soon && (
                <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: SUBINK }}>
                  Soon
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
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
        {/* Appearance — canon segmented control (Light / Dark / System) */}
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
  // Appearance canon: dark default, persisted via localStorage 'gt-appearance'.
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
          <PressSettingsPinned />
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

// ─── Two-tone heading (from the donor's PageHeading) ─────────────────
function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PACKAGE DATA
// ═══════════════════════════════════════════════════════════════════
// Prices per unit at 1,000, calibrated to the frozen MRP estimate consts:
// vinyl 2.30 · label 0.25 · jacket 0.81 · sleeve 0.81 · insert 0.67 ·
// assembly 0.36 · shrinkwrap 0.17. Each package sums its own components.
const MOCK_UNIT_PRICES = { vinyl: 2.30, label: 0.25, jacket: 0.81, sleeve: 0.81, insert: 0.67, assembly: 0.36, shrink: 0.17 };

// ─── The uniform artist-card cover system ────────────────────────────
// Same compositions as ArtistReleasePackageTemplates / the builder's
// "How artists will see it" preview. Unique `ppi-` gradient ids so the
// SVG defs can't collide with other mocks on the page.
type CoverId = 'amber' | 'charcoal' | 'teal' | 'ruby' | 'pressroom';

function CoverArt({ coverId }: { coverId: CoverId }) {
  switch (coverId) {
    case 'amber':
      return (
        <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Amber cover: warm sunset bands">
          <defs>
            <linearGradient id="ppi-amber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a1f0e" /><stop offset="0.55" stopColor="#8a4718" /><stop offset="1" stopColor="#d67a34" />
            </linearGradient>
          </defs>
          <rect width="460" height="260" fill="url(#ppi-amber)" />
          <rect x="0" y="128" width="460" height="14" fill="rgba(0,0,0,0.28)" />
          <rect x="0" y="150" width="460" height="10" fill="rgba(0,0,0,0.2)" />
          <rect x="0" y="167" width="460" height="7" fill="rgba(0,0,0,0.14)" />
        </svg>
      );
    case 'charcoal':
      return (
        <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Charcoal cover: quiet pinstripes">
          <defs>
            <linearGradient id="ppi-char" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#232327" /><stop offset="1" stopColor="#101012" />
            </linearGradient>
          </defs>
          <rect width="460" height="260" fill="url(#ppi-char)" />
          {[0, 60, 120, 180, 240, 300, 360, 420].map((x) => (
            <line key={x} x1={x} y1="0" x2={x + 90} y2="260" stroke="rgba(255,255,255,0.045)" strokeWidth="10" />
          ))}
        </svg>
      );
    case 'teal':
      return (
        <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Teal cover: splatter dabs">
          <defs>
            <linearGradient id="ppi-teal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0e2b2a" /><stop offset="1" stopColor="#123c38" />
            </linearGradient>
          </defs>
          <rect width="460" height="260" fill="url(#ppi-teal)" />
          <circle cx="70" cy="60" r="16" fill="#f2c94c" /><circle cx="395" cy="48" r="11" fill="#e0466b" />
          <circle cx="330" cy="120" r="8" fill="#f2c94c" /><circle cx="120" cy="140" r="7" fill="#4ec9b0" />
          <circle cx="420" cy="150" r="14" fill="#4ec9b0" /><circle cx="30" cy="180" r="9" fill="#e0466b" />
        </svg>
      );
    case 'ruby':
      return (
        <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ruby cover: deep red with spine line">
          <defs>
            <linearGradient id="ppi-ruby" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#3a0d16" /><stop offset="1" stopColor="#7d1b2c" />
            </linearGradient>
          </defs>
          <rect width="460" height="260" fill="url(#ppi-ruby)" />
          <line x1="230" y1="0" x2="230" y2="178" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
        </svg>
      );
    case 'pressroom':
      return (
        <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Pressroom cover: warm gray with groove rings">
          <defs>
            <linearGradient id="ppi-press" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b2723" /><stop offset="1" stopColor="#4a423a" />
            </linearGradient>
          </defs>
          <rect width="460" height="260" fill="url(#ppi-press)" />
          {[40, 70, 100, 130].map((r) => (
            <circle key={r} cx="392" cy="52" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2" />
          ))}
        </svg>
      );
  }
}

// ─── Realistic layered vinyl render — VERBATIM port of the artist rail's
// RealVinylDisc (ArtistReleasePackageTemplates / PressQuoteBuilder technique):
// real photographed layer masks, groove sheen pass, MRP black label, spindle
// hole. Bill's rule: the press index shows the IDENTICAL disc the artist sees.
const LAYERS = {
  opaque: '/__mockup/vinyl-layers/opaque-vinyl.png',
  translucent: '/__mockup/vinyl-layers/translucent-vinyl.png',
  splatter1: '/__mockup/vinyl-layers/splatter-one.png',
  splatter2: '/__mockup/vinyl-layers/splatter-two.png',
  splatter3: '/__mockup/vinyl-layers/splatter-three.png',
  highlights: '/__mockup/vinyl-layers/vinyl-highlights.png',
  inner: '/__mockup/vinyl-layers/inner-circle.png',
};

const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

function MaskLayer({ color, mask, opacity = 1, maskSize = '102% 102%' }: {
  color: string; mask: string; opacity?: number; maskSize?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        maskImage: `url(${mask})`,
        WebkitMaskImage: `url(${mask})`,
        maskSize,
        WebkitMaskSize: maskSize,
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }}
    />
  );
}

function DiscLabelArt({ size }: { size: number }) {
  const showArcText = size >= 70;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <img
        src={PRESS_LABEL_LOGO}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.9,
          height: size * 0.9,
          objectFit: 'contain',
          filter: PRESS_LABEL_LOGO_FILTER,
        }}
      />
      {showArcText && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="ppi-disc-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#ppi-disc-arc-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

type DiscKind = 'black' | 'opaque' | 'translucent' | 'splatter';

function RealVinylDisc({ size, kind, base, s1, s2, s3, photo }: {
  size: number; kind: DiscKind; base: string; s1?: string; s2?: string; s3?: string; photo?: string;
}) {
  const LABEL_RATIO = 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const holeRatio = 0.018;
  const translucent = kind === 'translucent';
  const isSplatter = kind === 'splatter';

  // Real press photo (e.g. ruby translucent) — the photographed disc IS the art.
  if (photo) {
    return (
      <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        <img src={photo} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: translucent ? '#ffffff' : '#000000',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%' }}>
        {translucent ? (
          <MaskLayer color={base} mask={LAYERS.translucent} opacity={1} />
        ) : (
          <MaskLayer color={base} mask={LAYERS.opaque} />
        )}

        {isSplatter && (
          <>
            <MaskLayer color={s1 ?? base} mask={LAYERS.splatter1} />
            <MaskLayer color={s2 ?? base} mask={LAYERS.splatter2} />
            <MaskLayer color={s3 ?? base} mask={LAYERS.splatter3} />
          </>
        )}

        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * LABEL_RATIO,
            height: size * LABEL_RATIO,
            borderRadius: '50%',
            backgroundColor: PRESS_LABEL_BG,
            overflow: 'hidden',
          }}
        >
          {size >= 70 && <DiscLabelArt size={size * LABEL_RATIO} />}
        </div>

        <img
          src={LAYERS.inner}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * INNER_RATIO,
            height: size * INNER_RATIO,
            opacity: 1,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>

      {/* Fixed sheen — never rotates */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: 0.6,
          maskImage: `url(${LAYERS.highlights})`,
          WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />

      {/* Spindle hole */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * holeRatio,
          height: size * holeRatio,
          borderRadius: '50%',
          backgroundColor: 'var(--q-card)',
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// One card face, any size — the artist rail's EXACT 460×260 composition
// (cover edge-to-edge, RealVinylDisc size 330 at left 50% / top 78) rendered
// on a fixed stage and scaled to fit, so mini and full card are pixel-for-
// pixel the same face.
function ArtistCardFace({ coverId, vinyl, sell, radius = 14, bordered = true }: {
  coverId: CoverId; vinyl: VinylSpec; sell?: string; radius?: number; bordered?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setScale(el.offsetWidth / 460);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', aspectRatio: '460 / 260', borderRadius: radius, overflow: 'hidden', border: bordered ? `1px solid ${HAIRLINE}` : 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 460, height: 260, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CoverArt coverId={coverId} />
        <div
          aria-hidden
          style={{ position: 'absolute', left: '50%', top: 78, transform: 'translateX(-50%)', filter: 'drop-shadow(0 -6px 22px rgba(0,0,0,0.45))' }}
        >
          <RealVinylDisc size={330} kind={vinyl.kind} base={vinyl.base} s1={vinyl.s1} s2={vinyl.s2} s3={vinyl.s3} photo={vinyl.photo} />
        </div>
        {sell && (
          <>
            <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 92, background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)' }} />
            <div style={{ position: 'absolute', left: 16, right: 100, top: 14, zIndex: 2, fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3, letterSpacing: -0.1, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
              {sell}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type PkgStatus = 'live' | 'draft';

// The artist-card system (Bill, Aug 19 2026): every package the press saves
// IS one of the Apple-Music-style cards on the artist rail. The index shows a
// miniature of that same card so press view and artist view stay one loop.
// Disc spec — same shape as the artist rail's `disc` field, plus an optional
// real press photo (ruby translucent has one).
type VinylSpec = {
  name: string;
  kind: 'black' | 'opaque' | 'translucent' | 'splatter';
  base: string;
  s1?: string;
  s2?: string;
  s3?: string;
  photo?: string;
};

// Per-unit price re-anchored at the package's minimum run — the same tier
// scale the builder uses, normalized to the 1,000-unit canon consts.
const minRunFactor = (q: number) => (q <= 100 ? 1.0 : q <= 300 ? 0.88 : q <= 500 ? 0.80 : 0.70) / 0.70;
const priceAtMin = (p: { perUnit: number; minRun: number }) => p.perUnit * minRunFactor(p.minRun);

type Pkg = {
  id: string;
  name: string;
  summary: string;      // component summary line
  perUnit: number;      // per-unit price at 1,000
  minRun: number;       // package minimum run — the price anchor (Bill)
  status: PkgStatus;
  note?: string;        // small provenance line under the summary
  coverId: CoverId;     // cover from the uniform card system
  vinyl: VinylSpec;     // disc color — follows the package's record
  sell: string;         // the one-line sell line on the artist card
  hasSales: boolean;    // sent on estimates? decides Archive vs Delete
};

const MOCK_PACKAGES: Pkg[] = [
  {
    id: 'heavyweight',
    minRun: 500,
    name: 'The Heavyweight',
    summary: '180g splatter vinyl · gatefold jacket · printed inner sleeve · booklet insert · shrinkwrapped',
    // 180g adds 0.40 to vinyl; gatefold 1.26; booklet 1.44
    perUnit: (MOCK_UNIT_PRICES.vinyl + 0.40) + MOCK_UNIT_PRICES.label + 1.26 + MOCK_UNIT_PRICES.sleeve + 1.44 + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'live',
    note: 'Your top seller — 12 estimates sent this month.',
    coverId: 'amber',
    // EXACT artist-rail counterpart (ArtistReleasePackageTemplates 'heavyweight')
    vinyl: { name: 'Red/Yellow Splatter', kind: 'splatter', base: '#C81E38', s1: '#F5F5DC', s2: '#E8C84A', s3: '#F0E6C8' },
    hasSales: true,
    sell: 'The one that sounds like the master.',
  },
  {
    id: 'standard-black',
    minRun: 300,
    name: 'Standard Black',
    summary: '140g black vinyl · single jacket · printed inner sleeve · sheet insert · shrinkwrapped',
    perUnit: MOCK_UNIT_PRICES.vinyl + MOCK_UNIT_PRICES.label + MOCK_UNIT_PRICES.jacket + MOCK_UNIT_PRICES.sleeve + MOCK_UNIT_PRICES.insert + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'live',
    coverId: 'charcoal',
    // EXACT artist-rail counterpart ('standard') — glossy black vinyl
    vinyl: { name: '140g Black', kind: 'black', base: '#111114' },
    sell: 'Everything a first pressing needs.',
    hasSales: true,
  },
  {
    id: 'splatter-special',
    minRun: 300,
    name: 'Splatter Special',
    summary: '140g splatter vinyl · single jacket · polylined sleeve · sheet insert · shrinkwrapped',
    // splatter priced as base vinyl; polylined 0.30
    perUnit: MOCK_UNIT_PRICES.vinyl + MOCK_UNIT_PRICES.label + MOCK_UNIT_PRICES.jacket + 0.30 + MOCK_UNIT_PRICES.insert + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'live',
    note: 'The press won\u2019t run splatter below the minimum.',
    coverId: 'teal',
    // EXACT artist-rail counterpart ('splatter') — red/orange splatter record
    vinyl: { name: 'Red/Orange Splatter', kind: 'splatter', base: '#D2401E', s1: '#F2C94C', s2: '#7A1220', s3: '#F5EBD8' },
    hasSales: true,
    sell: 'Loud on the shelf, louder on the deck.',
  },
  {
    id: 'ruby-translucent',
    minRun: 500,
    name: 'Ruby Translucent',
    summary: '180g ruby vinyl · gatefold jacket · printed inner sleeve · poster insert · shrinkwrapped',
    perUnit: (MOCK_UNIT_PRICES.vinyl + 0.40) + MOCK_UNIT_PRICES.label + 1.26 + MOCK_UNIT_PRICES.sleeve + 1.65 + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'draft',
    note: 'Saved from the builder as \u201cRuby Translucent\u201d \u2014 not published yet.',
    coverId: 'ruby',
    // Real press photo — the photographed ruby translucent disc
    vinyl: { name: 'Ruby Translucent', kind: 'translucent', base: '#9b1c2e', photo: rubyVinylPhoto },
    hasSales: false,
    sell: 'Hold it up to the light.',
  },
  {
    id: 'disco-bag',
    minRun: 300,
    name: 'DJ Disco Bag',
    summary: '140g black vinyl · disco bag jacket · unprinted sleeve · no insert · not shrinkwrapped',
    perUnit: MOCK_UNIT_PRICES.vinyl + MOCK_UNIT_PRICES.label + 0.54 + 0.24,
    status: 'draft',
    note: 'Bare-bones club pressing \u2014 still tuning the price.',
    coverId: 'pressroom',
    vinyl: { name: '140g Black', kind: 'black', base: '#111114' },
    sell: 'No jacket, no fuss — just the record.',
    hasSales: false,
  },
];

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Word + icon status (Bill is colorblind — never color alone).
function StatusPill({ status }: { status: PkgStatus | 'archived' }) {
  const live = status === 'live';
  const Icon = live ? CheckCircle2 : status === 'archived' ? Archive : Pencil;
  const label = live ? 'Live' : status === 'archived' ? 'Archived' : 'Draft';
  const tone = live ? BLUE : '#8e8e93';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold"
      style={{
        padding: '4px 11px 4px 9px',
        color: tone,
        backgroundColor: live ? `${BLUE}12` : 'rgba(142,142,147,0.14)',
        border: `1px solid ${live ? `${BLUE}33` : 'rgba(142,142,147,0.28)'}`,
      }}
      data-testid={`status-${status}`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
      {label}
    </span>
  );
}

function PackageCard({ pkg, archived, onPreview, onArchive, onAskDelete, arrival = null }: {
  pkg: Pkg;
  archived: boolean;
  onPreview: (p: Pkg) => void;
  onArchive: (id: string) => void;
  onAskDelete: (p: Pkg) => void;
  arrival?: 'on' | 'fading' | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onPreview(pkg)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(pkg); } }}
      className="group relative rounded-2xl bg-white flex flex-col transition-all hover:-translate-y-px cursor-pointer overflow-hidden"
      style={{ border: `1px solid ${HAIRLINE}`, boxShadow: PILL_SHADOW }}
      data-testid={`package-card-${pkg.id}`}
    >
      {/* Save-arrival whisper: thin blue line draws once around the border,
          rests as a soft ring while a quiet "Saved" chip fades in, then all
          fades back. Pure overlay — no border-width, no layout shift. */}
      {arrival && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 20, opacity: arrival === 'fading' ? 0 : 1, transition: 'opacity 450ms ease' }}
          data-testid={`saved-arrival-${pkg.id}`}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
            <rect
              pathLength={1}
              rx={15}
              fill="none"
              stroke={BLUE}
              strokeWidth={1.5}
              style={{ x: 1, y: 1, width: 'calc(100% - 2px)', height: 'calc(100% - 2px)', strokeDasharray: 1, strokeDashoffset: 1, animation: 'ppiSavedDraw 700ms ease-out forwards' } as React.CSSProperties}
            />
          </svg>
          <span
            className="absolute inline-flex items-center gap-1.5 rounded-full text-[12px] font-semibold"
            style={{
              top: 12, left: 12, padding: '4px 11px', color: BLUE,
              background: 'rgba(255,255,255,0.92)', border: `1px solid ${BLUE}33`,
              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              animation: 'ppiSavedChip 400ms ease-out 550ms both',
            }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
            Saved
          </span>
        </div>
      )}
      {/* Cover miniature — the SAME card the artist sees, in small. Bleeds
          edge-to-edge, App-Store style: cropped by the card's own radius, no
          inner frame. Drafts and archived show theirs slightly dimmed. */}
      <div className="relative" style={{ opacity: archived ? 0.4 : pkg.status === 'draft' ? 0.55 : 1 }} data-testid={`mini-${pkg.id}`}>
        <ArtistCardFace coverId={pkg.coverId} vinyl={pkg.vinyl} radius={0} bordered={false} />
      </div>

      {/* ••• housekeeping — hover-revealed frosted circle over the art (same
          grammar as elsewhere in the studio); never triggers the preview. */}
      <div className="absolute" style={{ top: 10, right: 10, zIndex: 10 }}>
        <button
          type="button"
          aria-label={`More actions for ${pkg.name}`}
          aria-expanded={menuOpen}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v); }}
          className={cn(
            'flex items-center justify-center rounded-full transition-opacity',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          style={{
            width: 30, height: 30, border: 'none', cursor: 'pointer',
            background: 'rgba(20,20,22,0.55)', color: '#f5f5f7',
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          }}
          data-testid={`menu-button-${pkg.id}`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <>
            {/* fixed scrim — click closes, as in FlowLauncher */}
            <div
              className="fixed inset-0"
              style={{ zIndex: 40 }}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
              data-testid={`menu-scrim-${pkg.id}`}
            />
            <div
              className="absolute rounded-2xl bg-white"
              style={{ top: 36, right: 0, zIndex: 50, width: 224, border: `1px solid ${HAIRLINE}`, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: 6 }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`menu-${pkg.id}`}
            >
              <a
                href={`#/PressPackageBuilder?pkg=${pkg.id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2.5 rounded-xl px-3 h-9 text-[13px] font-medium hover:bg-black/5 transition-colors"
                style={{ color: INK }}
                data-testid={`menu-edit-${pkg.id}`}
              >
                <Pencil className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                Edit
              </a>
              {pkg.hasSales ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive(pkg.id); }}
                  className="w-full flex items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-black/5 transition-colors"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                  data-testid={`menu-archive-${pkg.id}`}
                >
                  <Archive className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6', marginTop: 1 }} />
                  <span>
                    <span className="block text-[13px] font-medium" style={{ color: INK }}>Archive</span>
                    <span className="block text-[11px]" style={{ color: '#a1a1a6', marginTop: 1 }}>Keeps its estimate history</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAskDelete(pkg); }}
                  className="w-full flex items-center gap-2.5 rounded-xl px-3 h-9 text-[13px] font-medium hover:bg-black/5 transition-colors"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ff453a' }}
                  data-testid={`menu-delete-${pkg.id}`}
                >
                  <Trash2 className="w-4 h-4 flex-shrink-0" />
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col" style={{ padding: '14px 20px 20px' }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[18px] font-semibold tracking-tight" style={{ color: INK }}>{pkg.name}</h3>
          <StatusPill status={archived ? 'archived' : pkg.status} />
        </div>

        {/* Variable middle content grows — the rule + price row below pin to the
            card bottom so they land at the SAME height on every card in a row. */}
        <div className="flex-1" style={{ paddingBottom: 16 }}>
          <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, lineHeight: 1.5 }}>
            {pkg.summary}
          </p>

          {pkg.note && (
            <p className="text-[12px]" style={{ color: '#a1a1a6', marginTop: 10, lineHeight: 1.45 }}>
              {pkg.note}
            </p>
          )}
        </div>

        {/* Pinned price row — housekeeping moved to the ••• menu, so the
            right side stays calm. */}
        <div className="flex items-end justify-between gap-3" style={{ marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
          <div>
            <div className="text-[19px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(priceAtMin(pkg))}
            </div>
            <div className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 1 }}>
              / unit at {pkg.minRun.toLocaleString()} minimum
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The hint card showing where a newly saved package lands.
function NewPackageHint() {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center text-center"
      style={{
        border: `1.5px dashed ${HAIRLINE}`,
        padding: 24,
        minHeight: 168,
        color: SUBINK,
      }}
      data-testid="package-hint"
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{ width: 40, height: 40, backgroundColor: 'rgba(0,0,0,0.04)' }}
      >
        <Plus className="w-5 h-5" style={{ color: '#a1a1a6' }} />
      </span>
      <div className="text-[14px] font-semibold" style={{ color: INK, marginTop: 12 }}>
        Your next package lands here
      </div>
      <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 6, maxWidth: 240, lineHeight: 1.5 }}>
        Anything you save from the builder shows up in this catalog, ready to send as an estimate.
      </p>
    </div>
  );
}

// ─── Preview overlay — the full-size artist card, one connected loop:
// index → this sheet → "Edit in builder →" ──────────────────────────
function PackagePreviewSheet({ pkg, onClose }: { pkg: Pkg; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', padding: 24 }}
      onClick={onClose}
      data-testid="sheet-package-preview"
    >
      <div
        className="rounded-3xl bg-white relative"
        style={{ width: 540, maxWidth: '92vw', border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', padding: '28px 32px 26px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* canon circled × — the ONE dismissal grammar */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
          style={{ top: 16, right: 16, width: 32, height: 32, background: 'rgba(120,120,128,0.14)', color: SUBINK, border: 'none', cursor: 'pointer' }}
          data-testid="sheet-package-preview-close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-[17px] font-bold tracking-tight" style={{ color: INK }}>How artists see it</div>
        <p className="text-[13px]" style={{ color: SUBINK, marginTop: 4, lineHeight: 1.5 }}>
          This card sits at the top of their release builder — your package, on their rail.
        </p>

        {/* The full-size Apple-Music-style card — exact builder-preview grammar */}
        <div style={{ marginTop: 20 }} data-testid="preview-artist-card">
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#a1a1a6' }}>
            MRP PACKAGE
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, marginTop: 4, color: INK }}>
            {pkg.name}
          </div>
          <div style={{ fontSize: 13, color: SUBINK, marginTop: 2, lineHeight: 1.35 }}>
            {pkg.summary}
          </div>
          {/* one object, not a framed image — shadow only, no hairline ring */}
          <div style={{ marginTop: 12, boxShadow: '0 4px 14px rgba(0,0,0,0.25)', borderRadius: 14 }}>
            <ArtistCardFace coverId={pkg.coverId} vinyl={pkg.vinyl} sell={pkg.sell} bordered={false} />
          </div>
          <div style={{ fontSize: 12, color: SUBINK, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>
            From {fmt(priceAtMin(pkg))} / unit at {pkg.minRun.toLocaleString()}
          </div>
        </div>

        {/* ONE quiet action — no filled blue in the sheet */}
        <div className="flex justify-end" style={{ marginTop: 20 }}>
          <a
            href={`#/PressPackageBuilder?pkg=${pkg.id}`}
            className="rounded-full inline-flex items-center text-[13.5px] font-semibold transition-colors hover:bg-black/5"
            style={{ padding: '10px 20px', border: '1px solid #6e6e73', color: INK }}
            data-testid="button-edit-in-builder"
          >
            Edit in builder →
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm — small canon sheet (circled ×, one red confirm).
// Only reachable for packages that have never been sent on an estimate. ──
function DeleteConfirmSheet({ pkg, onClose, onConfirm }: { pkg: Pkg; onClose: () => void; onConfirm: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', padding: 24 }}
      onClick={onClose}
      data-testid="sheet-delete-confirm"
    >
      <div
        className="rounded-3xl bg-white relative"
        style={{ width: 400, maxWidth: '92vw', border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', padding: '28px 28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
          style={{ top: 14, right: 14, width: 32, height: 32, background: 'rgba(120,120,128,0.14)', color: SUBINK, border: 'none', cursor: 'pointer' }}
          data-testid="sheet-delete-confirm-close"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="text-[19px] font-bold tracking-tight" style={{ color: INK, paddingRight: 32 }}>
          Delete {pkg.name}?
        </div>
        <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, lineHeight: 1.55 }}>
          This package has never been sent on an estimate. This can&rsquo;t be undone.
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className="w-full rounded-full text-[14px] font-semibold transition-opacity hover:opacity-90"
          style={{ marginTop: 20, padding: '12px 0', border: 'none', cursor: 'pointer', background: '#ff453a', color: '#ffffff' }}
          data-testid="button-delete-package"
        >
          Delete package
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function PressPackagesIndex() {
  const [previewPkg, setPreviewPkg] = useState<Pkg | null>(null);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Pkg | null>(null);

  // ── Subtle save arrival (Bill, Aug 20 2026): the builder rolls back here
  // with ?saved={id}. The matching card gets a whisper — a thin blue line
  // drawn once around its border, a quiet word+icon "Saved" chip, then
  // everything fades back to normal. Overlay-based: zero layout shift.
  const [arrivalId, setArrivalId] = useState<string | null>(null);
  const [arrivalFading, setArrivalFading] = useState(false);
  useEffect(() => {
    const m = window.location.hash.match(/[?&]saved=([a-z0-9-]+)/i);
    if (!m) return;
    const id = m[1];
    setArrivalId(id);
    // Strip the param without firing hashchange (no re-route).
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/PressPackagesIndex`);
    const t0 = window.setTimeout(() => {
      document.querySelector(`[data-testid="package-card-${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const t1 = window.setTimeout(() => setArrivalFading(true), 2300);
    const t2 = window.setTimeout(() => { setArrivalId(null); setArrivalFading(false); }, 2800);
    return () => { window.clearTimeout(t0); window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  return (
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>

        {/* Breadcrumb + page heading + primary action */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">Product Specs</a>
              <span style={{ color: '#d0d0d5' }}>›</span>
              <span style={{ color: SUBINK }}>MRP Packages</span>
            </div>
            <PageHeading lead="MRP Packages." rest="Your saved builds." />
            <p style={{ fontSize: 15, marginTop: 10, maxWidth: 560, color: SUBINK }}>
              Packages skip quantity and price &mdash; artists pick their quantity later.
            </p>
          </div>

          {/* Quiet canon pill (founder, Aug 16 2026): the index CTA leads into
              the package builder — hairline pill, not a filled blue button. */}
          <a
            href="#/PressPackageBuilder"
            className="rounded-full inline-flex items-center gap-2 text-[14px] font-semibold flex-shrink-0 transition-colors hover:bg-black/5"
            style={{ height: 44, padding: '0 22px', border: `1px solid ${HAIRLINE}`, background: 'var(--q-card)', color: INK, marginTop: 34 }}
            data-testid="button-build-package"
          >
            <Plus className="w-4 h-4" style={{ color: '#a1a1a6' }} />
            Create package
          </a>
        </div>

        {/* Grid of saved packages + the "lands here" hint */}
        <div
          className="grid"
          style={{ marginTop: 40, gap: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
        >
          {MOCK_PACKAGES.filter((pkg) => !deletedIds.includes(pkg.id)).map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              archived={archivedIds.includes(pkg.id)}
              onPreview={setPreviewPkg}
              onArchive={(id) => setArchivedIds((a) => (a.includes(id) ? a : [...a, id]))}
              onAskDelete={setDeleteTarget}
              arrival={arrivalId === pkg.id ? (arrivalFading ? 'fading' : 'on') : null}
            />
          ))}
          <NewPackageHint />
        </div>

        {/* Keyframes for the save-arrival whisper. */}
        <style>{`
          @keyframes ppiSavedDraw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
          @keyframes ppiSavedChip { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

      </div>
      {previewPkg && <PackagePreviewSheet pkg={previewPkg} onClose={() => setPreviewPkg(null)} />}
      {deleteTarget && (
        <DeleteConfirmSheet
          pkg={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => { setDeletedIds((d) => [...d, deleteTarget.id]); setDeleteTarget(null); }}
        />
      )}
    </PressShell>
  );
}

export default PressPackagesIndex;
