// PressWhiteLabelSettings — Settings › White Label for a press (the rail's
// "Soon" chip becomes this page). Bill's brief (Aug 19 2026):
// - Config sections LEFT, one sticky LIVE PREVIEW pane RIGHT that re-skins
//   keystroke-live (the star of the page).
// - ONE accent only (ratified): chrome stays ours; their accent applies only
//   where the system already uses accent — confirms, links, status icons.
// - Always-GoodTunes list: GoodDeed® certificates, the fan-funded pressing
//   story, the fan player, "Powered by GoodTunes®" footer.
// Canon: word + icon statuses (Bill is colorblind), quiet pills, page-header
// "Save changes" EARNS its blue only after something changes, "estimate"
// never "quote", real ®, light + dark. Self-contained per handoff rules.

import { useMemo, useState, useEffect, type ReactNode } from 'react';
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
  Check,
  AlertCircle,
  Globe,
  Upload,
  Mail,
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
import mrpLogoSvg from '../assets/mrp-logo.svg';
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

const Q_THEME_CSS = String.raw`
:root { --q-ink:#1d1d1f; --q-subink:#6e6e73; --q-hairline:#e6e6ea; --q-canvas:#f5f5f7; --q-rail:#f5f5f7; --q-card:#ffffff; --q-track:#f2f2f5; --q-frost:rgba(255,255,255,0.78); --q-pill-shadow:0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04); }
html[data-gt-dark] { --q-ink:#f5f5f7; --q-subink:#98989d; --q-hairline:rgba(255,255,255,0.12); --q-canvas:#161617; --q-rail:#1c1c1e; --q-card:#2a2a2d; --q-track:rgba(255,255,255,0.08); --q-frost:rgba(22,22,23,0.72); --q-pill-shadow:0 1px 3px rgba(0,0,0,0.5); }
html[data-gt-dark] .q-root .bg-white { background-color: var(--q-card) !important; }
html[data-gt-dark] .q-root .hover\:bg-slate-50:hover, html[data-gt-dark] .q-root .hover\:bg-slate-100:hover, html[data-gt-dark] .q-root .hover\:bg-black\/5:hover { background-color: rgba(255,255,255,0.07) !important; }
html[data-gt-dark] .q-root .ring-slate-200 { --tw-ring-color: rgba(255,255,255,0.15); }
html[data-gt-dark] .q-root .placeholder\:text-slate-400::placeholder { color: rgba(255,255,255,0.30); }
html[data-gt-dark] [data-radix-popper-content-wrapper] > div { background-color: #2a2a2d !important; border-color: rgba(255,255,255,0.12) !important; }
html[data-gt-dark] [data-radix-popper-content-wrapper] .hover\:bg-slate-50:hover { background-color: rgba(255,255,255,0.07) !important; }
html[data-gt-dark] .q-root .wl-logo-dark-invert { filter: brightness(0) invert(1); }
`;

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// SHELL — canon press rail (PressRailCanon), Settings pinned bottom
// ═══════════════════════════════════════════════════════════════════
type PressNavChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; route?: string };
type PressNavItem = { label: string; icon: typeof LayoutDashboard; soon?: boolean; children?: PressNavChild[] };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Details', icon: NavInsert },
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
      { label: 'GoodDeed® Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave },
      { label: 'Templates', icon: NavTemplate },
    ],
  },
  {
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

// Settings — pinned bottom; THIS page is White Label, so it's the active leaf.
const PRESS_SETTINGS: PressNavItem = {
  label: 'Settings', icon: Cog,
  children: [
    { label: 'General', icon: Cog },
    { label: 'Team', icon: Users },
    { label: 'Contacts', icon: Users },
    { label: 'White Label', icon: NavLayers },
  ],
};

const ACTIVE_NAV = 'White Label';

function NavLeaf({ label, icon: Icon, route, child }: PressNavChild & { child?: boolean }) {
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
    </a>
  );
}

function PressNavTree() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
                data-testid={`nav-group-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
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

// Settings pinned to the rail bottom — expanded (this page lives inside it).
function PressSettingsPinned() {
  const [isOpen, setIsOpen] = useState(true);
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
          {PRESS_SETTINGS.children!.map((c) => <NavLeaf key={c.label} {...c} child />)}
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

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
// ─── Mock data ───────────────────────────────────────────────────────
const MOCK_SUBDOMAIN = 'mrp.goodtunes.music';
const MOCK_CUSTOM_DOMAIN_DEFAULT = 'estimates.memphisrecordpressing.com';
const MOCK_ACCENT_DEFAULT = '#B3282D'; // MRP red
const MOCK_REP = { name: 'Brandon Seavers', first: 'Brandon', title: 'Client Services', email: 'brandon@memphisrecordpressing.com' };
const MOCK_ESTIMATE = { no: '071526-02', client: 'Niina Soleil', job: 'Californialand', tier: '1,000 units · $5.37 /unit', total: '$8,375.00' };

// Accent presets — one is deliberately too light so the contrast rule shows.
const ACCENT_PRESETS = [
  { id: 'mrp-red', name: 'MRP Red', hex: '#B3282D' },
  { id: 'ink-blue', name: 'Ink Blue', hex: '#1E5AA8' },
  { id: 'forest', name: 'Forest', hex: '#1F6E43' },
  { id: 'plum', name: 'Plum', hex: '#6D3FA0' },
  { id: 'copper', name: 'Copper', hex: '#B4652A' },
  { id: 'gold', name: 'Gold', hex: '#F2C94C' }, // too light on dark
];

// Relative luminance — enough for a mock's readable-on-dark check.
function hexLuminance(hex: string): number {
  const m = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
      {children}
    </div>
  );
}

function WordIcon({ icon: Icon, children, tone = 'sub' }: { icon: typeof Check; children: ReactNode; tone?: 'sub' | 'ink' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: tone === 'ink' ? INK : SUBINK }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
      {children}
    </span>
  );
}

export default function PressWhiteLabelSettings() {
  // ── Config state ──
  const [domainTier, setDomainTier] = useState<'sub' | 'custom'>('sub');
  const [customDomain, setCustomDomain] = useState(MOCK_CUSTOM_DOMAIN_DEFAULT);
  const [accent, setAccent] = useState(MOCK_ACCENT_DEFAULT);
  const [previewTab, setPreviewTab] = useState<'estimate' | 'email'>('estimate');
  const [saved, setSaved] = useState(false);

  const dirty =
    domainTier !== 'sub' ||
    customDomain !== MOCK_CUSTOM_DOMAIN_DEFAULT ||
    accent.toUpperCase() !== MOCK_ACCENT_DEFAULT;

  const accentValid = /^#[0-9a-fA-F]{6}$/.test(accent);
  const accentLive = accentValid ? accent : MOCK_ACCENT_DEFAULT;
  const accentTooLight = useMemo(() => hexLuminance(accentLive) > 0.55, [accentLive]);

  const activeDomain = domainTier === 'sub' ? MOCK_SUBDOMAIN : (customDomain.trim() || MOCK_CUSTOM_DOMAIN_DEFAULT);

  return (
    <PressShell>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '44px 40px 96px' }}>
        {/* ── Heading + earned-blue Save ── */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="tracking-tight" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.08 }}>
              <span style={{ color: INK }}>White Label. </span>
              <span style={{ color: '#a1a1a6', fontWeight: 600 }}>Your brand, our system.</span>
            </h1>
            <p className="text-[15px]" style={{ marginTop: 8, maxWidth: 560, color: SUBINK }}>
              What your artists see carries your name. The estimate flow, the emails,
              the portal — skinned once, applied everywhere.
            </p>
          </div>
          {/* Save changes — earns its blue only after something changes (canon). */}
          <button
            type="button"
            disabled={!dirty && !saved}
            onClick={() => { if (dirty) setSaved(true); }}
            className="rounded-full flex-shrink-0"
            style={{
              marginTop: 6, padding: '11px 24px', fontSize: 14, fontWeight: 600,
              cursor: dirty ? 'pointer' : 'default',
              background: dirty ? BLUE : 'transparent',
              border: dirty ? '1px solid transparent' : `1px solid ${HAIRLINE}`,
              color: dirty ? '#ffffff' : SUBINK,
            }}
            data-testid="button-save-changes"
          >
            {saved && !dirty ? 'Saved' : 'Save changes'}
          </button>
        </div>

        {/* ── Config LEFT · live preview RIGHT ── */}
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 48, alignItems: 'start' }}>
          <div className="min-w-0" style={{ display: 'grid', gap: 44 }}>

            {/* ═══ 1 · DOMAIN ═══ */}
            <section>
              <SectionLabel>Domain</SectionLabel>
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                {/* Tier A — GoodTunes subdomain */}
                <button
                  type="button"
                  onClick={() => setDomainTier('sub')}
                  aria-pressed={domainTier === 'sub'}
                  className="rounded-2xl bg-white text-left w-full"
                  style={{ padding: '16px 18px', cursor: 'pointer', border: domainTier === 'sub' ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
                  data-testid="domain-tier-sub"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold" style={{ color: INK }}>GoodTunes subdomain</div>
                        <div className="text-[12.5px]" style={{ color: SUBINK, marginTop: 1 }}>{MOCK_SUBDOMAIN}</div>
                      </div>
                    </div>
                    <WordIcon icon={Check}>Ready now</WordIcon>
                  </div>
                </button>
                {/* Tier B — their own domain */}
                <button
                  type="button"
                  onClick={() => setDomainTier('custom')}
                  aria-pressed={domainTier === 'custom'}
                  className="rounded-2xl bg-white text-left w-full"
                  style={{ padding: '16px 18px', cursor: 'pointer', border: domainTier === 'custom' ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
                  data-testid="domain-tier-custom"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                      <div className="text-[14px] font-semibold" style={{ color: INK }}>Your own domain</div>
                    </div>
                    <WordIcon icon={AlertCircle}>Needs DNS verification</WordIcon>
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 12 }}>
                    <input
                      value={customDomain}
                      onChange={(e) => { setCustomDomain(e.target.value); setDomainTier('custom'); }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-[220px] focus:outline-none"
                      style={{ height: 36, borderRadius: 10, padding: '0 12px', fontSize: 13, background: CANVAS, border: `1px solid ${HAIRLINE}`, color: INK }}
                      data-testid="input-custom-domain"
                    />
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full inline-flex items-center flex-shrink-0"
                      style={{ padding: '8px 16px', fontSize: 12.5, fontWeight: 500, border: '1px solid #6e6e73', color: INK, cursor: 'pointer' }}
                      data-testid="button-verify-domain"
                    >
                      Verify domain
                    </span>
                  </div>
                </button>
              </div>
              <p className="text-[12px]" style={{ color: '#a1a1a6', marginTop: 8 }}>
                Estimate links, your portal, and email links all use this address.
              </p>
            </section>

            {/* ═══ 2 · BRAND COLOR ═══ */}
            <section>
              <SectionLabel>Brand color</SectionLabel>
              <p className="text-[13px]" style={{ color: SUBINK, marginTop: 8, maxWidth: 480, lineHeight: 1.6 }}>
                One accent. The chrome stays ours — your accent applies only where the
                system already uses accent: confirms, links, status icons.
              </p>
              <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 14 }}>
                {ACCENT_PRESETS.map((p) => {
                  const active = accentLive.toUpperCase() === p.hex.toUpperCase();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAccent(p.hex)}
                      aria-pressed={active}
                      title={p.name}
                      className="rounded-full flex-shrink-0"
                      style={{
                        width: 34, height: 34, padding: 0, cursor: 'pointer', background: p.hex,
                        border: active ? `2px solid ${INK}` : `1px solid ${HAIRLINE}`,
                        boxShadow: active ? PILL_SHADOW : undefined,
                      }}
                      data-testid={`accent-swatch-${p.id}`}
                    />
                  );
                })}
                <div className="flex items-center gap-1.5" style={{ marginLeft: 6 }}>
                  <span
                    aria-hidden
                    className="rounded-full flex-shrink-0"
                    style={{ width: 18, height: 18, background: accentLive, border: `1px solid ${HAIRLINE}` }}
                  />
                  <input
                    value={accent}
                    onChange={(e) => setAccent(e.target.value)}
                    className="focus:outline-none"
                    style={{ width: 96, height: 34, borderRadius: 10, padding: '0 10px', fontSize: 13, fontVariantNumeric: 'tabular-nums', background: 'var(--q-card)', border: `1px solid ${HAIRLINE}`, color: INK }}
                    data-testid="input-accent-hex"
                  />
                </div>
              </div>
              {/* Contrast check — word + icon, never color alone */}
              <div style={{ marginTop: 10 }} data-testid="accent-contrast-check">
                {accentTooLight ? (
                  <WordIcon icon={AlertCircle}>Too light on dark — pick a deeper shade</WordIcon>
                ) : (
                  <WordIcon icon={Check}>Readable on light and dark — passes</WordIcon>
                )}
              </div>
            </section>

            {/* ═══ 3 · LOGO KIT ═══ */}
            <section>
              <SectionLabel>Logo kit</SectionLabel>
              <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 480 }}>
                <div className="rounded-2xl" style={{ border: `1px solid ${HAIRLINE}`, background: '#ffffff', padding: 18, textAlign: 'center' }} data-testid="logo-tile-light">
                  <img src={mrpLogoSvg} alt="Logo for light backgrounds" style={{ width: 56, height: 56, margin: '0 auto' }} />
                  <div className="text-[12px] font-semibold" style={{ color: '#1d1d1f', marginTop: 10 }}>Light backgrounds</div>
                  <div className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: '#6e6e73', marginTop: 4 }}>
                    <Upload className="w-3 h-3" /> Replace
                  </div>
                </div>
                <div className="rounded-2xl" style={{ border: `1px solid ${HAIRLINE}`, background: '#161617', padding: 18, textAlign: 'center' }} data-testid="logo-tile-dark">
                  <img src={mrpLogoSvg} alt="Logo for dark backgrounds" style={{ width: 56, height: 56, margin: '0 auto', filter: 'brightness(0) invert(1)' }} />
                  <div className="text-[12px] font-semibold" style={{ color: '#f5f5f7', marginTop: 10 }}>Dark backgrounds</div>
                  <div className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: '#98989d', marginTop: 4 }}>
                    <Upload className="w-3 h-3" /> Replace
                  </div>
                </div>
              </div>
              <p className="text-[12px]" style={{ color: '#a1a1a6', marginTop: 8 }}>
                Both required — estimates and emails run in both themes.
              </p>
            </section>

            {/* ═══ 4 · REP IDENTITY ═══ */}
            <section>
              <SectionLabel>Rep identity</SectionLabel>
              <div className="rounded-2xl bg-white flex items-center gap-4" style={{ marginTop: 12, padding: '16px 18px', border: `1px solid ${HAIRLINE}`, maxWidth: 480 }} data-testid="rep-identity-card">
                <span style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0, border: `1px solid ${HAIRLINE}` }}>
                  <img src={brandonPhoto} alt={MOCK_REP.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold" style={{ color: INK }}>{MOCK_REP.name}</div>
                  <div className="text-[12px]" style={{ color: SUBINK, marginTop: 1 }}>{MOCK_REP.title}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, maxWidth: 480 }}>
                <WordIcon icon={Mail}>
                  Replies stay in your estimate thread — {MOCK_REP.first} is notified at {MOCK_REP.email}
                </WordIcon>
              </div>
            </section>

            {/* ═══ 5 · ALWAYS GOODTUNES ═══ */}
            <section>
              <SectionLabel>Always GoodTunes</SectionLabel>
              <div className="rounded-2xl" style={{ marginTop: 12, padding: '18px 20px', border: `1px solid ${HAIRLINE}`, maxWidth: 480 }} data-testid="always-goodtunes-card">
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                  {[
                    'GoodDeed® certificates',
                    'The fan-funded pressing story',
                    'The fan player',
                    'The "Powered by GoodTunes®" footer',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[13px]" style={{ color: INK }}>
                      <NavAward className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 14, lineHeight: 1.6 }}>
                  You brand your relationship with the artist. GoodTunes® stays the
                  fans&rsquo; side of the record.
                </p>
              </div>
            </section>
          </div>

          {/* ── STICKY LIVE PREVIEW — the star of the page ── */}
          <div className="sticky" style={{ top: 100 }}>
            {/* canon segmented control */}
            <div className="inline-flex items-center p-0.5 rounded-full" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label="Preview">
              {(['estimate', 'email'] as const).map((tab) => {
                const active = previewTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPreviewTab(tab)}
                    className="px-4 h-8 rounded-full text-[13px] leading-none capitalize"
                    style={{
                      fontWeight: active ? 600 : 500,
                      color: active ? INK : SUBINK,
                      backgroundColor: active ? 'var(--q-card)' : 'transparent',
                      boxShadow: active ? PILL_SHADOW : undefined,
                      cursor: 'pointer',
                    }}
                    data-testid={`preview-tab-${tab}`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {previewTab === 'estimate' ? (
              /* ── Mini estimate — dark, like the client page ── */
              <div className="rounded-2xl" style={{ marginTop: 14, background: '#111112', color: '#f5f5f7', border: `1px solid ${HAIRLINE}`, padding: 24 }} data-testid="preview-estimate">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <img src={mrpLogoSvg} alt="" aria-hidden style={{ width: 34, height: 34, filter: 'brightness(0) invert(1)' }} />
                  <div style={{ fontSize: 10.5, color: '#a1a1a6' }}>Estimate {MOCK_ESTIMATE.no}</div>
                </div>
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#a1a1a6' }}>Prepared for</div>
                  <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, marginTop: 3 }}>{MOCK_ESTIMATE.client}</div>
                  <div style={{ fontSize: 11, color: '#a1a1a6', marginTop: 2 }}>{MOCK_ESTIMATE.job}</div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#a1a1a6' }}>Run</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{MOCK_ESTIMATE.tier}</span>
                </div>
                <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: accentLive }}>Estimate total</span>
                  <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums' }}>{MOCK_ESTIMATE.total}</span>
                </div>
                {/* the earned confirm — rendered in THEIR accent */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  style={{ marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 999, border: 'none', background: accentLive, color: accentTooLight ? '#1d1d1f' : '#ffffff', fontSize: 12.5, fontWeight: 600, pointerEvents: 'none' }}
                >
                  Start this project
                </button>
                <div style={{ marginTop: 12, fontSize: 10.5, color: '#a1a1a6', textAlign: 'center', wordBreak: 'break-all' }} data-testid="preview-estimate-link">
                  {activeDomain}/e/{MOCK_ESTIMATE.no}
                </div>
              </div>
            ) : (
              /* ── Mini email — one line, one button ── */
              <div className="rounded-2xl bg-white" style={{ marginTop: 14, border: `1px solid ${HAIRLINE}`, padding: '28px 24px', textAlign: 'center' }} data-testid="preview-email">
                <div className="text-[10.5px]" style={{ color: '#a1a1a6' }} data-testid="preview-email-from">
                  {MOCK_REP.first} at {PARTNER_NAME} · {domainTier === 'sub' ? 'via goodtunes.music' : activeDomain}
                </div>
                <img src={mrpLogoSvg} alt="" aria-hidden className="wl-logo-dark-invert" style={{ width: 40, height: 40, margin: '18px auto 0' }} />
                <p className="text-[13.5px]" style={{ color: INK, margin: '14px auto 0', maxWidth: 260, lineHeight: 1.55 }}>
                  {MOCK_REP.first} at {PARTNER_NAME} sent you an estimate for <strong>{MOCK_ESTIMATE.job}</strong>.
                </p>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  style={{ marginTop: 16, padding: '10px 24px', borderRadius: 999, border: 'none', background: accentLive, color: accentTooLight ? '#1d1d1f' : '#ffffff', fontSize: 12.5, fontWeight: 600, pointerEvents: 'none' }}
                >
                  View estimate
                </button>
                <div className="text-[10.5px]" style={{ color: '#a1a1a6', marginTop: 16 }}>
                  Private link · no account needed
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
                  Powered by GoodTunes®
                </div>
              </div>
            )}

            <p className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 12, lineHeight: 1.6 }}>
              Live preview — accent, logo and domain update as you type.
            </p>
          </div>
        </div>
      </div>
    </PressShell>
  );
}
