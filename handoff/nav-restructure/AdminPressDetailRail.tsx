// AdminPressDetailRail — SUPER ADMIN view of a single press (Hellbender
// Vinyl) with a PARTNER-SCOPED LEFT RAIL instead of the overflowing
// 13-tab horizontal bar (Bill, Aug 16 2026). When a press is open, the
// admin rail swaps to partner scope: back link, identity block, "View as
// this partner", then the press's OWN rail mirrored exactly, then a
// separated Admin group (Overview · Contacts · Analytics). NO horizontal
// tab bar anywhere.
//
// Canon: super-admin charcoal (never navy), light + dark themes, word +
// icon statuses, real ®, no emojis, at most one filled blue (none needed
// here — rail actives use the usual pill treatment).

import { useState } from 'react';
import {
  ArrowUpRight,
  Award,
  AudioLines,
  Bell,
  Boxes,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  ClipboardList,
  Disc,
  Disc3,
  Eye,
  FileText,
  Gift,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Package,
  ReceiptText,
  Search,
  Settings as Cog,
  Square,
  UserPlus,
  Users,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import hellbenderIcon from '../assets/hellbender-icon.svg';

// ─── Themes — charcoal admin dark (default) + light ──────────────────
type Theme = typeof DARK;

const DARK = {
  dark: true,
  canvas: '#161617',
  card: '#1e1e20',
  cardSoft: '#26262a',
  rail: '#1b1b1d',
  ink: '#f5f5f7',
  subink: '#98989d',
  faint: '#6e6e73',
  hairline: 'rgba(255,255,255,0.10)',
  pillActive: '#3a3a3e',
  pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
  markBg: '#0d0d0e',
  logoFilter: 'invert(1) brightness(2)',
  hoverClass: 'hover:bg-white/5',
  linkHoverClass: 'hover:text-white',
};

const LIGHT: Theme = {
  dark: false,
  canvas: '#f5f5f7',
  card: '#ffffff',
  cardSoft: '#f0f0f2',
  rail: '#fbfbfd',
  ink: '#1d1d1f',
  subink: '#6e6e73',
  faint: '#a1a1a6',
  hairline: 'rgba(0,0,0,0.10)',
  pillActive: '#e8e8ed',
  pillShadow: '0 1px 2px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.04)',
  markBg: '#f0f0f2',
  logoFilter: 'none',
  hoverClass: 'hover:bg-black/5',
  linkHoverClass: 'hover:text-black',
};

// ─── Dummy data (handoff rule: all mock values in MOCK_ consts) ──────
const MOCK_TOPBAR = { initials: 'B' };

const MOCK_PARTNER = {
  name: 'Hellbender Vinyl',
  domain: 'hellbendervinyl.com',
  backLabel: 'Presses',
};

// ─── Partner-scope rail nav — mirrors the press's OWN rail exactly ───
type NavChild = { label: string; soon?: boolean; icon: typeof LayoutDashboard };
type NavItem = { label: string; icon: typeof LayoutDashboard; soon?: boolean; children?: NavChild[] };

// Bill revisions (round 2): no Admin group — super admin sees exactly the
// press's own rail. "Details" replaces Overview (named for consistency
// with artist release tabs). Contacts + White Label live INSIDE Settings.
// Components is format-first, two layers max: Vinyl · CD · Cassette ·
// Pricing (formats appear only if the press offers them; Hellbender
// offers all three). Per-component pages become the in-page segmented
// control on each format's page.
const PARTNER_NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Details', icon: FileText },
  { label: 'Clients', icon: Users },
  {
    label: 'Create', icon: ClipboardList,
    children: [
      { label: 'Estimates', icon: ClipboardList },
      { label: 'Packages', icon: Package },
    ],
  },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    label: 'Product Specs', icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: Package },
      { label: 'GoodDeed® Certificates', icon: Award },
      { label: 'Specs', icon: AudioLines },
      { label: 'Templates', icon: LayoutTemplate },
    ],
  },
  {
    label: 'Components', icon: Boxes,
    children: [
      { label: 'Vinyl', icon: Disc },
      { label: 'CD', icon: CircleDot },
      { label: 'Cassette', icon: Square },
      { label: 'Pricing', icon: ReceiptText },
    ],
  },
  { label: 'Referrals', icon: Gift },
];

// Cross-vendor rail standard (Bill): Settings is PINNED to the rail
// bottom, always last, and Team lives inside it as a child.
const SETTINGS_NAV: NavItem = {
  label: 'Settings', icon: Cog,
  children: [
    { label: 'General', icon: Cog },
    { label: 'Team', icon: Users },
    { label: 'Contacts', icon: Users },
    { label: 'White Label', icon: Layers, soon: true },
  ],
};

const DEFAULT_ACTIVE_NAV = 'Vinyl';

// In-page segmented control on the Vinyl format page — the old rail
// children live here now (canon segmented pattern from PressCatalogPricing).
const MOCK_VINYL_TABS = ['Vinyl', 'Jackets', 'Inner Sleeves', 'Center Labels', 'Inserts', 'Stickers'];

// ─── Rail pieces ─────────────────────────────────────────────────────
function RailLeaf({ item, t, child, activeNav, onSelect }: { item: NavChild | NavItem; t: Theme; child?: boolean; activeNav: string; onSelect: (label: string) => void }) {
  const active = item.label === activeNav;
  const Icon = item.icon;
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); onSelect(item.label); }}
      className={`flex items-center gap-2.5 pr-2.5 h-[30px] rounded-lg text-[12.5px] transition-colors ${active ? '' : t.hoverClass}`}
      style={{
        paddingLeft: child ? 26 : 10,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.pillActive : 'transparent',
        boxShadow: active ? t.pillShadow : undefined,
        fontWeight: active ? 600 : 500,
      }}
      data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="flex-1 truncate">{item.label}</span>
      {'soon' in item && item.soon && (
        <span className="text-[9.5px] font-semibold px-1.5 h-[16px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.faint }}>
          Soon
        </span>
      )}
    </a>
  );
}

function PartnerNav({ t, activeNav, onSelect }: { t: Theme; activeNav: string; onSelect: (label: string) => void }) {
  // The group holding the active leaf starts open (Components → Vinyl).
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const item of PARTNER_NAV) {
      if (item.children) o[item.label] = item.children.some((c) => c.label === activeNav);
    }
    return o;
  });
  return (
    <>
      {PARTNER_NAV.map((item) => {
        if (item.children) {
          const isOpen = open[item.label];
          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [item.label]: !o[item.label] }))}
                aria-expanded={isOpen}
                className={`w-full flex items-center gap-2.5 px-2.5 h-[30px] rounded-lg text-[12.5px] transition-colors ${t.hoverClass}`}
                style={{ fontWeight: 500, color: t.subink }}
                data-testid={`nav-group-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
              >
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 transition-transform" style={{ color: t.faint, transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                <span className="flex-1 truncate text-left">{item.label}</span>
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {item.children.map((c) => <RailLeaf key={c.label} item={c} t={t} child activeNav={activeNav} onSelect={onSelect} />)}
                </div>
              )}
            </div>
          );
        }
        return <RailLeaf key={item.label} item={item} t={t} activeNav={activeNav} onSelect={onSelect} />;
      })}
    </>
  );
}

function BottomSettings({ t, activeNav, onSelect }: { t: Theme; activeNav: string; onSelect: (label: string) => void }) {
  const [isOpen, setIsOpen] = useState(
    SETTINGS_NAV.children?.some((c) => c.label === activeNav) ?? false,
  );
  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-2.5 px-2.5 h-[30px] rounded-lg text-[12.5px] transition-colors ${t.hoverClass}`}
        style={{ fontWeight: 500, color: t.subink }}
        data-testid="nav-group-settings"
      >
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 transition-transform" style={{ color: t.faint, transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
        <span className="flex-1 truncate text-left">{SETTINGS_NAV.label}</span>
      </button>
      {isOpen && (
        <div className="space-y-0.5">
          {SETTINGS_NAV.children!.map((c) => <RailLeaf key={c.label} item={c} t={t} child activeNav={activeNav} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function AdminPressDetailRail() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const [activeNav, setActiveNav] = useState(DEFAULT_ACTIVE_NAV);
  const [vinylTab, setVinylTab] = useState('Vinyl');
  const [pricingFormat, setPricingFormat] = useState('Vinyl');
  const t = mode === 'dark' ? DARK : LIGHT;
  const showPricing = activeNav === 'Pricing';

  return (
    <div className="h-screen w-full flex flex-col font-sans overflow-hidden" style={{ backgroundColor: t.canvas, color: t.ink }}>
      {/* MOCK-ONLY theme pill — remove in the real app */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        className="fixed bottom-4 right-4 z-50 h-8 px-3.5 rounded-full text-[12px] font-medium"
        style={{ backgroundColor: t.card, color: t.subink, border: `1px solid ${t.hairline}`, boxShadow: t.pillShadow }}
        data-testid="button-theme-toggle"
      >
        {mode === 'dark' ? 'View light' : 'View dark'}
      </button>

      {/* Top bar — full width: logo left, bell + avatar right */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4" style={{ backgroundColor: t.rail, borderBottom: `1px solid ${t.hairline}` }}>
        <img src={goodtunesLogo} alt="GoodTunes" className="h-6 w-auto object-contain" style={{ filter: t.logoFilter }} />
        <span className="flex items-center gap-3">
          <Bell className="w-4 h-4" style={{ color: t.subink }} />
          <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11.5px] font-semibold" style={{ backgroundColor: t.pillActive, color: t.ink, boxShadow: t.pillShadow }}>
            {MOCK_TOPBAR.initials}
          </span>
        </span>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* PARTNER-SCOPED left rail — replaces the 13-tab horizontal bar */}
        <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          {/* Back to the Presses index */}
          <div className="px-3 pt-3 flex-shrink-0">
            <a
              href="#/SuperAdminPressesFindDark"
              className={`inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 rounded-full text-[12px] font-medium transition-colors ${t.hoverClass}`}
              style={{ color: t.subink }}
              data-testid="link-back-presses"
            >
              <ChevronLeft className="w-3.5 h-3.5" style={{ color: t.faint }} />
              {MOCK_PARTNER.backLabel}
            </a>
          </div>

          {/* Partner identity block */}
          <div className="px-4 pt-2 pb-3 flex-shrink-0" style={{ borderBottom: `1px solid ${t.hairline}` }}>
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 p-1.5" style={{ backgroundColor: t.markBg, border: `1px solid ${t.hairline}` }}>
                <img src={hellbenderIcon} alt="" aria-hidden className="w-full h-full object-contain" style={{ filter: t.dark ? 'invert(1) brightness(1.6)' : 'none' }} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold truncate" style={{ color: t.ink }}>{MOCK_PARTNER.name}</span>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center gap-0.5 text-[11px] truncate hover:underline"
                  style={{ color: t.subink }}
                  data-testid="link-partner-domain"
                >
                  {MOCK_PARTNER.domain}
                  <ArrowUpRight className="w-3 h-3 flex-shrink-0" style={{ color: t.faint }} />
                </a>
              </span>
            </div>
            {/* Quiet hairline pill — word + icon, no color-only signal */}
            <button
              type="button"
              className={`mt-2.5 w-full h-8 rounded-full text-[12px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${t.hoverClass}`}
              style={{ color: t.subink, border: `1px solid ${t.hairline}`, backgroundColor: t.card }}
              data-testid="button-view-as-partner"
            >
              <Eye className="w-3.5 h-3.5" style={{ color: t.faint }} />
              View as this partner
            </button>
          </div>

          {/* The press's own rail, mirrored exactly */}
          <nav className="flex-1 px-3 pt-2 pb-3 space-y-0.5 overflow-y-auto">
            <PartnerNav t={t} activeNav={activeNav} onSelect={setActiveNav} />
          </nav>

          {/* Settings — pinned to the rail bottom (cross-vendor standard) */}
          <div className="flex-shrink-0 px-3 pt-2 pb-3" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <BottomSettings t={t} activeNav={activeNav} onSelect={setActiveNav} />
          </div>
        </aside>

        {/* Content — Stickers page header placeholder so the rail context reads */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full" style={{ maxWidth: 1080, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>
            {/* Breadcrumb — no horizontal tab bar anywhere */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
              <span>{MOCK_PARTNER.name}</span>
              <span style={{ opacity: 0.6 }}>›</span>
              <span>Components</span>
              <span style={{ opacity: 0.6 }}>›</span>
              <span style={{ color: t.subink }}>{showPricing ? 'Pricing' : 'Vinyl'}</span>
            </div>

            {showPricing ? (
              <>
                {/* Pricing roll-up placeholder — the all-format sheet */}
                <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
                  <span style={{ color: t.ink }}>Pricing. </span>
                  <span style={{ color: t.faint, fontWeight: 600 }}>All formats.</span>
                </h1>
                <p className="text-[15px]" style={{ marginTop: 10, maxWidth: 560, color: t.subink }}>
                  Every per-unit price {MOCK_PARTNER.name} charges, in one sheet — switch
                  format with the chip.
                </p>

                {/* Canon segmented format chip */}
                <div className="inline-flex items-center p-0.5 rounded-full" style={{ marginTop: 28, border: `1px solid ${t.hairline}` }} role="tablist" aria-label="Pricing format">
                  {['Vinyl', 'CD', 'Cassette'].map((f) => {
                    const active = f === pricingFormat;
                    return (
                      <button
                        key={f}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPricingFormat(f)}
                        className="inline-flex items-center justify-center px-4 h-8 rounded-full text-[13px] leading-none transition-all focus:outline-none"
                        style={{
                          fontWeight: active ? 600 : 500,
                          color: active ? t.ink : t.subink,
                          background: active ? t.card : 'transparent',
                          boxShadow: active ? t.pillShadow : undefined,
                        }}
                        data-testid={`chip-pricing-${f.toLowerCase()}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11.5px]" style={{ marginTop: 8, color: t.faint }}>
                  Same numbers as each format page — edited in either place, one source of truth.
                </p>

                <div
                  className="rounded-2xl flex flex-col items-center justify-center text-center"
                  style={{ marginTop: 24, border: `1px solid ${t.hairline}`, backgroundColor: t.card, padding: '88px 32px' }}
                  data-testid="placeholder-pricing-content"
                >
                  <ReceiptText className="w-8 h-8" style={{ color: t.faint }} aria-hidden />
                  <div className="text-[16px] font-semibold" style={{ marginTop: 14, color: t.ink }}>
                    {pricingFormat} pricing sheet renders here
                  </div>
                  <p className="text-[13px]" style={{ marginTop: 6, maxWidth: 420, color: t.subink }}>
                    The all-format roll-up: quantity tiers across the top, components down
                    the side, per-unit prices in the grid.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
                  <span style={{ color: t.ink }}>Vinyl. </span>
                  <span style={{ color: t.faint, fontWeight: 600 }}>Components and pricing.</span>
                </h1>
                <p className="text-[15px]" style={{ marginTop: 10, maxWidth: 560, color: t.subink }}>
                  Everything {MOCK_PARTNER.name} offers for a vinyl pressing — each component
                  carries its options and per-unit pricing inline.
                </p>

                {/* Canon segmented control — ONE hairline container, active on card
                    + pill shadow (same pattern as PressCatalogPricing). The old rail
                    children live here now. */}
                <div className="inline-flex items-center p-0.5 rounded-full" style={{ marginTop: 28, border: `1px solid ${t.hairline}` }} role="tablist" aria-label="Vinyl components">
                  {MOCK_VINYL_TABS.map((tab) => {
                    const active = tab === vinylTab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setVinylTab(tab)}
                        className="inline-flex items-center justify-center px-4 h-8 rounded-full text-[13px] leading-none transition-all focus:outline-none"
                        style={{
                          fontWeight: active ? 600 : 500,
                          color: active ? t.ink : t.subink,
                          background: active ? t.card : 'transparent',
                          boxShadow: active ? t.pillShadow : undefined,
                        }}
                        data-testid={`tab-vinyl-${tab.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      >
                        {tab}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11.5px]" style={{ marginTop: 8, color: t.faint }}>
                  {/* Live link — activates Components ▸ Pricing in the rail (Bill) */}
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setActiveNav('Pricing'); }}
                    className={`underline underline-offset-2 transition-colors ${t.linkHoverClass}`}
                    style={{ color: t.subink }}
                    data-testid="link-pricing-rollup"
                  >
                    Pricing
                  </a>
                  {' '}in the rail is the all-format roll-up sheet, with a Vinyl / CD / Cassette chip.
                </p>

                {/* Quiet placeholder panel — the format page renders here */}
                <div
                  className="rounded-2xl flex flex-col items-center justify-center text-center"
                  style={{ marginTop: 24, border: `1px solid ${t.hairline}`, backgroundColor: t.card, padding: '88px 32px' }}
                  data-testid="placeholder-partner-content"
                >
                  <Disc className="w-8 h-8" style={{ color: t.faint }} aria-hidden />
                  <div className="text-[16px] font-semibold" style={{ marginTop: 14, color: t.ink }}>
                    {vinylTab} components render here
                  </div>
                  <p className="text-[13px]" style={{ marginTop: 6, maxWidth: 420, color: t.subink }}>
                    Formats are rail items; components are these in-page tabs. Two layers,
                    no sideways scrolling.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminPressDetailRail;
