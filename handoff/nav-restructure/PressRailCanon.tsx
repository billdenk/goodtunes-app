// PressRailCanon — THE canonical press left rail, captured from the real app
// (Bill's screenshots, Aug 16 2026) and blessed as GoodStudio canon. Every
// Press* mock's PressShell copies its nav structure from here; when the real
// rail changes, this file changes first, then the mocks follow.
//
// Canon decisions baked in (rev. Bill's cross-vendor rail standard):
// - Main tree: Dashboard / Details / Clients / Create / Projects /
//   Acquisition, then the collapsible groups (Product Specs, Components),
//   then Referrals. Settings is PINNED to the rail bottom, always last,
//   with General / Team / Contacts / White Label inside it.
// - Components is FORMAT-FIRST, two layers max: Vinyl · CD · Cassette ·
//   Pricing (only formats the press offers appear; Hellbender/MRP-style
//   full house shows all three). Per-component pages (Jackets, Inner
//   Sleeves, Center Labels, Inserts, Stickers) live as in-page segmented
//   controls on each format's page — never in the rail.
// - Groups are collapsible; the group holding the active page starts open,
//   the other starts closed (matches the real rail's behavior).
// - Templates keeps OUR icon (LayoutTemplate) — Bill prefers it over the
//   real app's file icon (Aug 16 2026). Otis should adopt ours.
// - "Soon" badge (quiet pill) marks not-yet-live items; mocks that want the
//   press-facing "Request" wording swap the label, nothing else.
// - Search sits above the nav with ⌘K hint; "Powered by GoodTunes" footer.
//
// Theme-aware: light + dark via THEMES; dark charcoal is the press default.

import { useState } from 'react';
import {
  LayoutDashboard, Users, Disc3, UserPlus, Library, Cog, Gift, Search,
  Bell, MessageSquarePlus, Moon, Sun, ChevronDown as NavChevron,
  Package as NavPackage, Layers as NavLayers, Award as NavAward,
  AudioLines as NavWave, LayoutTemplate as NavTemplate, Boxes,
  Disc as NavVinyl, Square as NavJacket, CircleDot as NavLabel,
  FileText as NavInsert, ReceiptText as NavPricing,
  ClipboardList as NavEstimatesIcon,
} from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.svg';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type Theme = {
  blue: string; ink: string; subink: string; faint: string; hairline: string;
  canvas: string; rail: string; card: string; cardSoft: string;
  pillShadow: string; headerBg: string; searchPlaceholder: string;
  avatarRing: string; hoverWash: string; logoFilter: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8', ink: '#1d1d1f', subink: 'rgba(0,0,0,0.62)', faint: 'rgba(0,0,0,0.42)',
    hairline: '#e6e6ea', canvas: '#f5f5f7', rail: '#fbfbfd', card: '#ffffff', cardSoft: '#f5f5f7',
    pillShadow: '0 1px 2px rgba(0,0,0,0.06)', headerBg: 'rgba(251,251,253,0.72)',
    searchPlaceholder: 'placeholder:text-black/30', avatarRing: 'ring-black/10',
    hoverWash: 'hover:bg-black/5', logoFilter: 'none',
  },
  dark: {
    blue: '#319ED8', ink: '#f5f5f7', subink: '#98989d', faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)', canvas: '#161617', rail: '#1c1c1e', card: '#2a2a2d', cardSoft: '#232326',
    pillShadow: '0 1px 3px rgba(0,0,0,0.5)', headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30', avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5', logoFilter: 'invert(1) brightness(1.8)',
  },
};

type NavIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
type NavChild = { label: string; icon: NavIcon; soon?: boolean; route?: string };
type NavItem = { label: string; icon: NavIcon; soon?: boolean; children?: NavChild[] };

// ─── THE canon nav tree — real app structure, our Templates icon ───
export const PRESS_NAV_CANON: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  // "Details" (Bill): named for consistency with the artist release tabs.
  { label: 'Details', icon: NavInsert },
  { label: 'Clients', icon: Users },
  {
    // Create (founder, Aug 16 2026): an estimate or a package are two different
    // creations on two pages — one "Create" entry, live links to each.
    label: 'Create', icon: NavEstimatesIcon,
    children: [
      { label: 'Estimates', icon: NavEstimatesIcon, route: 'PressEstimatesIndex' },
      { label: 'Packages', icon: NavPackage, route: 'PressPackagesIndex' },
    ],
  },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    // Renamed from "Catalog" (Bill, Aug 16 2026): these are the pieces the
    // upcoming building tool composes from — the name should say so.
    label: 'Product Specs', icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: NavPackage },
      { label: 'GoodDeed® Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave },
      { label: 'Templates', icon: NavTemplate }, // ours, not the file icon (Bill, Aug 16 2026)
    ],
  },
  {
    // Format-first (Bill): formats are rail items, components are in-page
    // tabs. Only offered formats appear — all three shown here.
    label: 'Components', icon: Boxes,
    children: [
      { label: 'Vinyl', icon: NavVinyl },
      { label: 'CD', icon: NavLabel },
      { label: 'Cassette', icon: NavJacket },
      { label: 'Pricing', icon: NavPricing }, // all-format roll-up sheet
    ],
  },
  { label: 'Referrals', icon: Gift },
];

// Settings — pinned to the rail BOTTOM, always last (cross-vendor
// standard, Bill). Team lives inside; White Label moved here too.
export const PRESS_SETTINGS_CANON: NavItem = {
  label: 'Settings', icon: Cog,
  children: [
    { label: 'General', icon: Cog },
    { label: 'Team', icon: Users },
    { label: 'Contacts', icon: Users },
    { label: 'White Label', icon: NavLayers, soon: true },
  ],
};

// ─── The rail itself — copy this block into Press* mocks verbatim ───
export function PressRail({ active, t }: { active: string; t: Theme }) {
  // The group holding the active page starts open; others start closed.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const item of PRESS_NAV_CANON) {
      if (item.children) o[item.label] = item.label === active || item.children.some((c) => c.label === active);
    }
    return o;
  });
  // Pinned Settings: collapsed by default, opens when it holds the active page.
  const [settingsOpen, setSettingsOpen] = useState(
    () => PRESS_SETTINGS_CANON.label === active || (PRESS_SETTINGS_CANON.children?.some((c) => c.label === active) ?? false),
  );
  return (
    <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
      <div className="px-2.5 py-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
          <input
            className={cn('w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
            style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.cardSoft }}
            placeholder="Search…"
            readOnly
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>⌘K</span>
        </div>
      </div>
      <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
        {PRESS_NAV_CANON.map((item) => {
          if (item.children) {
            const isOpen = open[item.label];
            const groupActive = item.label === active;
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [item.label]: !o[item.label] }))}
                  aria-expanded={isOpen}
                  className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !groupActive && t.hoverWash)}
                  style={{
                    fontWeight: groupActive ? 600 : 500,
                    color: groupActive ? t.ink : t.subink,
                    backgroundColor: groupActive ? t.card : undefined,
                    boxShadow: groupActive ? t.pillShadow : undefined,
                  }}
                  data-testid={`nav-group-${item.label.toLowerCase()}`}
                >
                  <NavChevron className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: t.faint, transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                  <span className="truncate flex-1 text-left">{item.label}</span>
                </button>
                {isOpen && (
                  <div className="space-y-0.5">
                    {item.children.map(({ label, icon: Icon, soon, route }) => {
                      const isActive = label === active;
                      return (
                        <a
                          key={label}
                          href={route ? `#/${route}` : '#'}
                          onClick={(e) => { if (!route) e.preventDefault(); }}
                          className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !isActive && t.hoverWash)}
                          style={{
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? t.ink : t.subink,
                            backgroundColor: isActive ? t.card : undefined,
                            boxShadow: isActive ? t.pillShadow : undefined,
                          }}
                          data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                          <span className="truncate flex-1">{label}</span>
                          {soon && (
                            <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>
                              Request
                            </span>
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const { label, icon: Icon, soon } = item as NavItem & { soon?: boolean };
          const isActive = label === active;
          return (
            <a
              key={label}
              href="#"
              onClick={(e) => e.preventDefault()}
              className={cn('flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', !isActive && t.hoverWash)}
              style={{
                fontWeight: isActive ? 600 : 500,
                color: isActive ? t.ink : t.subink,
                backgroundColor: isActive ? t.card : undefined,
                boxShadow: isActive ? t.pillShadow : undefined,
              }}
              data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
              <span className="truncate flex-1">{label}</span>
              {soon && (
                <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>
                  Request
                </span>
              )}
            </a>
          );
        })}
      </nav>

      {/* Settings — pinned to the rail bottom, always last, above "Powered by" */}
      <div className="flex-shrink-0 px-2.5 pt-2 pb-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', t.hoverWash)}
          style={{ fontWeight: 500, color: t.subink }}
          data-testid="nav-group-settings"
        >
          <NavChevron className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: t.faint, transform: settingsOpen ? 'none' : 'rotate(-90deg)' }} />
          <span className="truncate flex-1 text-left">{PRESS_SETTINGS_CANON.label}</span>
        </button>
        {settingsOpen && (
          <div className="space-y-0.5">
            {PRESS_SETTINGS_CANON.children!.map(({ label, icon: Icon, soon }) => {
              const isActive = label === active;
              return (
                <a
                  key={label}
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !isActive && t.hoverWash)}
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? t.ink : t.subink,
                    backgroundColor: isActive ? t.card : undefined,
                    boxShadow: isActive ? t.pillShadow : undefined,
                  }}
                  data-testid={`nav-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                  <span className="truncate flex-1">{label}</span>
                  {soon && (
                    <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>
                      Soon
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
        <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>Powered by</span>
        <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
      </div>
    </aside>
  );
}

// ─── Showcase page: the rail live, plus the canon notes beside it ───
export default function PressRailCanon() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [active, setActive] = useState('Templates');
  return (
    <div className="h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={mrpLogo} alt="Memphis Record Pressing" className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>Memphis Record Pressing</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <span className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 flex-shrink-0', t.avatarRing)}>
            <img src={brandonPhoto} alt="BS" className="w-full h-full object-cover" />
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* key remounts the rail so the group/Settings open-state re-derives */}
        <PressRail key={active} active={active} t={t} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[720px] px-10 py-10">
            <div className="text-[12px] font-medium" style={{ color: t.faint }}>GoodStudio · Canon</div>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight" style={{ color: t.ink }}>
              Press rail. <span style={{ color: t.subink }}>The one true nav.</span>
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: t.subink }}>
              Bill's cross-vendor rail standard, locked Aug 16 2026. Every Press mock copies
              this rail; when the standard changes, this page changes first.
            </p>
            <div className="mt-6 rounded-xl px-5 py-4 space-y-3 text-[13px] leading-relaxed" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.subink }}>
              <p><strong style={{ color: t.ink }}>Structure.</strong> Dashboard · Details · Clients · Create (Estimates, Packages) · Projects · Acquisition, then two collapsible groups — Product Specs (GoodTunes Packages, GoodDeed® Certificates, Specs, Templates — the pieces the building tool composes from) and Components — then Referrals. Settings is pinned to the rail bottom, always last.</p>
              <p><strong style={{ color: t.ink }}>Components is format-first.</strong> Two layers max: Vinyl · CD · Cassette · Pricing. Only formats the press offers appear (all three shown here). Per-component pages — Jackets, Inner Sleeves, Center Labels, Inserts, Stickers — live as the in-page segmented control on each format's page, never in the rail. Pricing is the all-format roll-up sheet with a Vinyl / CD / Cassette chip.</p>
              <p><strong style={{ color: t.ink }}>Settings pinned bottom.</strong> Collapsible, above "Powered by": General · Team · Contacts · White Label (quiet Soon chip). Team moved inside Settings; White Label moved in from top level.</p>
              <p><strong style={{ color: t.ink }}>Cross-vendor.</strong> Labels, managers, NPOs, makers, resellers, and fulfillment reuse this exact skeleton — Dashboard/Details up top, their own middle items, Referrals last, Settings pinned bottom.</p>
              <p><strong style={{ color: t.ink }}>Groups collapse.</strong> The group holding the current page opens on arrival; the others stay folded. Chevron rotates, nothing slides.</p>
              <p><strong style={{ color: t.ink }}>Templates icon.</strong> Ours (the layout glyph), not the file icon in the live app — the live app should adopt this one.</p>
              <p><strong style={{ color: t.ink }}>Badges.</strong> "Request" is the press-facing pill for not-yet-live group items; the pinned White Label child reads "Soon". Same quiet pill, word + never color alone.</p>
              <p><strong style={{ color: t.ink }}>Active state.</strong> Card-colored pill + lift shadow + ink text. Hover is a wash. One filled blue lives in the page, never the rail.</p>
            </div>
            <div className="mt-6 text-[12.5px]" style={{ color: t.faint }}>
              Click any item to preview its active state:
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Dashboard', 'Details', 'Templates', 'Vinyl', 'CD', 'Pricing', 'Team', 'White Label'].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setActive(l)}
                  className="h-7 px-3 rounded-full text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: active === l ? t.card : 'transparent',
                    border: `1px solid ${t.hairline}`,
                    color: active === l ? t.ink : t.subink,
                    boxShadow: active === l ? t.pillShadow : undefined,
                  }}
                  data-testid={`chip-active-${l.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>

      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-[60] h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </div>
  );
}
