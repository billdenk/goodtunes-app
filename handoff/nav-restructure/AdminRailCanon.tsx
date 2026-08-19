// AdminRailCanon — THE canonical GoodTunes super-admin left rail, captured
// from Bill's live-app screenshots (Aug 16 2026) and blessed as GoodStudio
// canon, the sibling of PressRailCanon. Admin mocks copy their nav from here.
//
// Canon decisions baked in:
// - Full tree: Dashboard / People, then four collapsible groups (Catalog,
//   Partners, Queues, Audience), then Reports / GoodDeed® / Publishing and
//   the System group at the bottom.
// - Counts ride the right edge as quiet numbers (People 224, Presses 7…);
//   zero shows as 0, not hidden — a queue at zero is information.
// - Admin dark is CHARCOAL, never the fan navy (standing rule). GoodTunes
//   wordmark up top: dark asset inverted via CSS in dark mode.
// - Groups collapse like the press rail: the group holding the active page
//   opens on arrival, the rest stay folded. Chevron rotates, nothing slides.
// - Real ® in GoodDeed®, always.

import { useState } from 'react';
import {
  LayoutDashboard, User, Users, Library, Handshake, ListTodo, Radio,
  BarChart3, BadgeDollarSign, ScrollText, Settings2, Search, Bell,
  MessageSquarePlus, Moon, Sun, ChevronDown as NavChevron,
  Disc3, Guitar, Gift, Tag, UserCog, HeartHandshake, Factory, Hammer,
  Store, Truck, UsersRound, ClipboardList, ShoppingBag, PenLine, Zap,
  Activity, MessageCircle, Contact, Mail, DollarSign, Wallet, Landmark,
  Receipt, UserPlus, Network, BookUser,
} from 'lucide-react';
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

// Admin dark = charcoal (standing rule) — a touch deeper than the press rail.
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
    hairline: 'rgba(255,255,255,0.10)', canvas: '#131314', rail: '#1a1a1c', card: '#28282b', cardSoft: '#202023',
    pillShadow: '0 1px 3px rgba(0,0,0,0.5)', headerBg: 'rgba(19,19,20,0.72)',
    searchPlaceholder: 'placeholder:text-white/30', avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5', logoFilter: 'invert(1) brightness(1.8)',
  },
};

type NavIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
type NavChild = { label: string; icon: NavIcon; count?: number };
type NavItem = { label: string; icon: NavIcon; count?: number; children?: NavChild[] };

// ─── THE canon super-admin nav tree — from the live app, Aug 16 2026 ───
export const ADMIN_NAV_CANON: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User, count: 224 },
  {
    label: 'Catalog', icon: Library,
    children: [
      { label: 'Projects', icon: Disc3, count: 67 },
      { label: 'Gear', icon: Guitar, count: 51 },
      { label: 'Custom add-ons', icon: Gift },
    ],
  },
  {
    label: 'Partners', icon: Handshake,
    children: [
      { label: 'Labels', icon: Tag, count: 8 },
      { label: 'Managers', icon: UserCog, count: 1 },
      { label: 'NPOs', icon: HeartHandshake, count: 5 },
      { label: 'Presses', icon: Factory, count: 7 },
      { label: 'Makers', icon: Hammer, count: 14 },
      { label: 'Resellers', icon: Store, count: 11 },
      { label: 'Fulfillment', icon: Truck, count: 2 },
      { label: 'Team accounts', icon: UsersRound },
    ],
  },
  {
    label: 'Queues', icon: ListTodo,
    children: [
      { label: 'Press Orders', icon: ClipboardList },
      { label: 'Fan orders', icon: ShoppingBag, count: 65 },
      { label: 'Cert names', icon: PenLine },
      { label: 'Early cut review', icon: Zap },
      { label: 'Jobs', icon: Activity },
      { label: 'Feedback', icon: MessageCircle, count: 0 },
    ],
  },
  {
    label: 'Audience', icon: Radio,
    children: [
      { label: 'Customers', icon: Contact, count: 2813 },
      { label: 'Welcome back', icon: Mail },
    ],
  },
  { label: 'Reports', icon: BarChart3 },
  { label: 'GoodDeed\u00AE', icon: BadgeDollarSign },
  { label: 'Publishing', icon: ScrollText },
  {
    label: 'System', icon: Settings2,
    children: [
      { label: 'Platform pricing', icon: DollarSign },
      { label: 'Payouts to release', icon: Wallet },
      { label: 'Vendor payees', icon: Landmark },
      { label: 'Payment requests', icon: Receipt },
      { label: 'Invites', icon: UserPlus },
      { label: 'Invite tree', icon: Network },
      { label: 'Invite directory', icon: BookUser },
    ],
  },
];

function CountBadge({ n, t }: { n: number; t: Theme }) {
  return (
    <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: t.faint }}>
      {n}
    </span>
  );
}

// ─── The rail itself — copy this block into admin mocks verbatim ───
export function AdminRail({ active, t }: { active: string; t: Theme }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const item of ADMIN_NAV_CANON) {
      if (item.children) o[item.label] = item.label === active || item.children.some((c) => c.label === active);
    }
    return o;
  });
  return (
    <aside className="w-64 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
      <div className="px-5 pt-5 pb-2 flex-shrink-0">
        <img src={goodtunesLogo} alt="GoodTunes" className="h-8 w-auto" style={{ filter: t.logoFilter }} />
      </div>
      <div className="px-2.5 py-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
          <input
            className={cn('w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
            style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.cardSoft }}
            placeholder="Search admin…"
            readOnly
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: t.faint }}>⌘K</span>
        </div>
      </div>
      <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
        {ADMIN_NAV_CANON.map((item) => {
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
                    {item.children.map(({ label, icon: Icon, count }) => {
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
                          data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? t.ink : t.faint }} />
                          <span className="truncate flex-1">{label}</span>
                          {count !== undefined && <CountBadge n={count} t={t} />}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const { label, icon: Icon, count } = item;
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
              {count !== undefined && <CountBadge n={count} t={t} />}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

// ─── Showcase page: the rail live, plus the canon notes beside it ───
export default function AdminRailCanon() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [active, setActive] = useState('Presses');
  return (
    <div className="h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 px-6 sticky top-0 z-20"
        style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}
      >
        <span className="text-[15px] font-semibold" style={{ color: t.ink }}>Super admin</span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button type="button" className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <span className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 flex-shrink-0', t.avatarRing)}>
            <img src={brandonPhoto} alt="Admin" className="w-full h-full object-cover" />
          </span>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <AdminRail active={active} t={t} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-[720px] px-10 py-10">
            <div className="text-[12px] font-medium" style={{ color: t.faint }}>GoodStudio · Canon</div>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight" style={{ color: t.ink }}>
              Admin rail. <span style={{ color: t.subink }}>The one true nav.</span>
            </h1>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: t.subink }}>
              Captured from the live super admin, Aug 16 2026 — the sibling of the Press rail canon.
              Every admin mock copies this rail; when the real app's rail changes, this page changes first.
            </p>
            <div className="mt-6 rounded-xl px-5 py-4 space-y-3 text-[13px] leading-relaxed" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, color: t.subink }}>
              <p><strong style={{ color: t.ink }}>Structure.</strong> Dashboard · People, then four collapsible groups — Catalog (Projects, Gear, Custom add-ons), Partners (Labels, Managers, NPOs, Presses, Makers, Resellers, Fulfillment, Team accounts), Queues (Press Orders, Fan orders, Cert names, Early cut review, Jobs, Feedback), Audience (Customers, Welcome back) — then Reports · GoodDeed® · Publishing, with System (Platform pricing, Payouts to release, Vendor payees, Payment requests, Invites, Invite tree, Invite directory) at the bottom.</p>
              <p><strong style={{ color: t.ink }}>Counts.</strong> Live tallies ride the right edge as quiet numbers — People 224, Customers 2813. Zero shows as 0, never hidden: an empty queue is information.</p>
              <p><strong style={{ color: t.ink }}>Groups collapse.</strong> Same law as the press rail — the group holding the current page opens on arrival, the rest stay folded.</p>
              <p><strong style={{ color: t.ink }}>Charcoal, not navy.</strong> Admin dark is charcoal; fan navy never appears here. The GoodTunes wordmark sits atop the rail — dark asset, inverted by CSS in dark mode.</p>
              <p><strong style={{ color: t.ink }}>Wording.</strong> GoodDeed® keeps its real ®. Super-admin views may say "Soon" where press-facing rails say "Request" — same pill, different audience.</p>
            </div>
            <div className="mt-6 text-[12.5px]" style={{ color: t.faint }}>
              Click any item to preview its active state:
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Dashboard', 'Presses', 'Fan orders', 'Customers', 'Platform pricing'].map((l) => (
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
                  data-testid={`chip-active-${l.toLowerCase().replace(/\s+/g, '-')}`}
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
