// PressPackagesIndex — the press-side "MRP Packages" catalog. A press (MRP)
// sees and edits the packages they've built with the builder. These are the
// press's OWN saved packages, distinct from GoodTunes' standard set.
//
// Shell + canon rail copied verbatim from PressQuoteBuilder (the donor).
// Self-contained: only react + lucide-react + the shared Button/Popover.

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
  CheckCircle2,
  Pencil,
  Plus,
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

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
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

type PkgStatus = 'live' | 'draft';

type Pkg = {
  id: string;
  name: string;
  summary: string;      // component summary line
  perUnit: number;      // per-unit price at 1,000
  status: PkgStatus;
  note?: string;        // small provenance line under the summary
};

const MOCK_PACKAGES: Pkg[] = [
  {
    id: 'heavyweight',
    name: 'The Heavyweight',
    summary: '180g black vinyl · gatefold jacket · printed inner sleeve · booklet insert · shrinkwrapped',
    // 180g adds 0.40 to vinyl; gatefold 1.26; booklet 1.44
    perUnit: (MOCK_UNIT_PRICES.vinyl + 0.40) + MOCK_UNIT_PRICES.label + 1.26 + MOCK_UNIT_PRICES.sleeve + 1.44 + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'live',
    note: 'Your top seller — 12 estimates sent this month.',
  },
  {
    id: 'standard-black',
    name: 'Standard Black',
    summary: '140g black vinyl · single jacket · printed inner sleeve · sheet insert · shrinkwrapped',
    perUnit: MOCK_UNIT_PRICES.vinyl + MOCK_UNIT_PRICES.label + MOCK_UNIT_PRICES.jacket + MOCK_UNIT_PRICES.sleeve + MOCK_UNIT_PRICES.insert + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'live',
  },
  {
    id: 'splatter-special',
    name: 'Splatter Special',
    summary: '140g splatter vinyl · single jacket · polylined sleeve · sheet insert · shrinkwrapped',
    // splatter priced as base vinyl; polylined 0.30
    perUnit: MOCK_UNIT_PRICES.vinyl + MOCK_UNIT_PRICES.label + MOCK_UNIT_PRICES.jacket + 0.30 + MOCK_UNIT_PRICES.insert + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'live',
    note: 'Minimum 300 units — the press won\u2019t run splatter below that.',
  },
  {
    id: 'ruby-translucent',
    name: 'Ruby Translucent',
    summary: '180g ruby vinyl · gatefold jacket · printed inner sleeve · poster insert · shrinkwrapped',
    perUnit: (MOCK_UNIT_PRICES.vinyl + 0.40) + MOCK_UNIT_PRICES.label + 1.26 + MOCK_UNIT_PRICES.sleeve + 1.65 + MOCK_UNIT_PRICES.assembly + MOCK_UNIT_PRICES.shrink,
    status: 'draft',
    note: 'Saved from the builder as \u201cRuby Translucent\u201d \u2014 not published yet.',
  },
  {
    id: 'disco-bag',
    name: 'DJ Disco Bag',
    summary: '140g black vinyl · disco bag jacket · unprinted sleeve · no insert · not shrinkwrapped',
    perUnit: MOCK_UNIT_PRICES.vinyl + MOCK_UNIT_PRICES.label + 0.54 + 0.24,
    status: 'draft',
    note: 'Bare-bones club pressing \u2014 still tuning the price.',
  },
];

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Word + icon status (Bill is colorblind — never color alone).
function StatusPill({ status }: { status: PkgStatus }) {
  const live = status === 'live';
  const Icon = live ? CheckCircle2 : Pencil;
  const label = live ? 'Live' : 'Draft';
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

function PackageCard({ pkg }: { pkg: Pkg }) {
  return (
    <div
      className="rounded-2xl bg-white flex flex-col transition-all hover:-translate-y-px"
      style={{ border: `1px solid ${HAIRLINE}`, boxShadow: PILL_SHADOW, padding: 20 }}
      data-testid={`package-card-${pkg.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[18px] font-semibold tracking-tight" style={{ color: INK }}>{pkg.name}</h3>
        <StatusPill status={pkg.status} />
      </div>

      <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, lineHeight: 1.5 }}>
        {pkg.summary}
      </p>

      {pkg.note && (
        <p className="text-[12px]" style={{ color: '#a1a1a6', marginTop: 10, lineHeight: 1.45 }}>
          {pkg.note}
        </p>
      )}

      <div className="flex items-end justify-between gap-3" style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
        <div>
          <div className="text-[19px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(pkg.perUnit)}
          </div>
          <div className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 1 }}>
            / unit at 1,000
          </div>
        </div>
        {/* Quiet link-styled edit — reopens the builder pre-filled. */}
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold hover:opacity-70 transition-opacity"
          style={{ color: BLUE }}
          data-testid={`edit-${pkg.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </a>
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

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function PressPackagesIndex() {
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
          {MOCK_PACKAGES.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
          <NewPackageHint />
        </div>

      </div>
    </PressShell>
  );
}

export default PressPackagesIndex;
