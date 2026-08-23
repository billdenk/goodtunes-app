// AdminPressPricingSetup — the GOODTUNES SUPER ADMIN pricing setup for a
// press (Bill, Aug 22 2026). What Bill and Otis discussed: presses don't all
// price the same way — MRP updates the TIER/STYLE price (Black, Splatter,
// EcoMix…) and colors under it inherit; Viryl prices every color/component
// individually. GOODTUNES chooses the model per press here in the super
// admin — the press never sees this switch, their Components → Pricing page
// simply takes the chosen shape. Also chosen here: the PRICING SOURCE —
// GoodTunes native, CODA.io, or Odoo (Shopify-connect feel). Connecting an
// external source SYNC-LOCKS in-app editing: rows show "Synced from … ·
// last sync" and honest gaps stay gaps.
//
// Skin: GoodTunes admin charcoal canon (never MRP gold, never fan navy),
// shell copied verbatim from AdminPressWhiteLabelEnable (partner-scoped
// rail; Components group open, Pricing the active leaf). GoodTunes blue
// accent; exactly ONE filled accent action. Word + icon statuses (Bill is
// colorblind), real ®, "estimate" never "quote", commas in dollars, Apple
// heading grammar, no emojis. Self-contained: MOCK_ consts, default export.

import { useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Award,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronLeft,
  Circle,
  CircleDot,
  ClipboardList,
  Clock,
  Disc,
  Disc3,
  Eye,
  FileText,
  Gift,
  Globe,
  Layers,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  Mail,
  Package,
  ReceiptText,
  Settings as Cog,
  Square,
  UserPlus,
  Users,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';

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
};

const BLUE = '#319ED8'; // GoodTunes admin accent — the ONE filled action

// ─── Mock data — all values in MOCK_ consts (handoff rule) ───────────
const MOCK_TOPBAR = { initials: 'B' };

const MOCK_PARTNER = {
  name: 'Memphis Record Pressing',
  short: 'MRP',
  domain: 'memphisrecordpressing.com',
  backLabel: 'Presses',
};

// Included subdomains live on OUR white-label domains (Bill, Aug 21 2026)
// — one slug, two addresses; both work, press picks the primary later.
const MOCK_SLUG_DEFAULT = 'mrp';
const MOCK_WL_DOMAINS = ['pressesvinyl.com', 'makesvinyl.com'];

// Plan/entitlement — what GoodTunes decides at enable time.
const MOCK_PLANS = [
  {
    id: 'included',
    name: 'Included',
    price: 'No added fee',
    detail: 'Included subdomains, one accent, their logo on estimates, portal, and emails.',
  },
  {
    id: 'plus',
    name: 'Plus',
    price: '$149 /month',
    detail: 'Everything in Included, plus their own domain (CNAME) and branded email sending.',
  },
];
const MOCK_PLAN_DEFAULT = 'plus';

// Who at the press gets the setup invite — from the press's contacts.
const MOCK_CONTACTS = [
  { id: 'brandon', name: 'Brandon Seavers', title: 'Client Services', email: 'brandon@memphisrecordpressing.com', primary: true },
  { id: 'lori', name: 'Lori Patton', title: 'Operations', email: 'lori@memphisrecordpressing.com', primary: false },
];
const MOCK_CONTACT_DEFAULT = 'brandon';

const MOCK_ENABLED_META = { enabledBy: 'Bill', enabledOn: 'Aug 22, 2026' };

// After enable — the hand-off checklist. GoodTunes' side is done; the
// rest is the press's, tracked here so the team can see setup progress.
const MOCK_HANDOFF = [
  { label: 'Subdomains provisioned', owner: 'GoodTunes', done: true },
  { label: 'Setup invite sent', owner: 'GoodTunes', done: true },
  { label: 'Logo and accent chosen', owner: 'Press', done: false },
  { label: 'First branded estimate sent', owner: 'Press', done: false },
];

// ─── Partner-scope rail nav — mirrors the press's OWN rail exactly ───
type NavChild = { label: string; soon?: boolean; icon: typeof LayoutDashboard };
type NavItem = { label: string; icon: typeof LayoutDashboard; soon?: boolean; children?: NavChild[] };

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

// Settings pinned bottom — White Label is THIS page (active leaf).
const SETTINGS_NAV: NavItem = {
  label: 'Settings', icon: Cog,
  children: [
    { label: 'General', icon: Cog },
    { label: 'Team', icon: Users },
    { label: 'Contacts', icon: Users },
    { label: 'White Label', icon: Layers },
  ],
};

const ACTIVE_NAV = 'Pricing';

// ─── Rail pieces (structure from AdminPressDetailRail) ───────────────
function RailLeaf({ item, t, child }: { item: NavChild | NavItem; t: Theme; child?: boolean }) {
  const active = item.label === ACTIVE_NAV;
  const Icon = item.icon;
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
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
    </a>
  );
}

function PartnerNav({ t }: { t: Theme }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Components: true });
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
                  {item.children.map((c) => <RailLeaf key={c.label} item={c} t={t} child />)}
                </div>
              )}
            </div>
          );
        }
        return <RailLeaf key={item.label} item={item} t={t} />;
      })}
    </>
  );
}

function BottomSettings({ t }: { t: Theme }) {
  const [isOpen, setIsOpen] = useState(false); // Pricing lives under Components, not here
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
          {SETTINGS_NAV.children!.map((c) => <RailLeaf key={c.label} item={c} t={t} child />)}
        </div>
      )}
    </div>
  );
}

// ─── Small canon pieces ───────────────────────────────────────────────
// Word + icon status — never color alone.
function WordIcon({ icon: Icon, children, t, ink }: { icon: typeof Check; children: React.ReactNode; t: Theme; ink?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium flex-shrink-0" style={{ color: ink ? t.ink : t.subink }}>
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
      {children}
    </span>
  );
}

// Section head — Apple grammar: real sentence-case heading, not an eyebrow.
function SectionHead({ n, title, t }: { n: number; title: string; t: Theme }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[11.5px] font-semibold flex-shrink-0"
        style={{ backgroundColor: t.cardSoft, color: t.subink, border: `1px solid ${t.hairline}` }}
      >
        {n}
      </span>
      <h2 className="text-[17px] font-semibold" style={{ color: t.ink, letterSpacing: -0.2, margin: 0 }}>{title}</h2>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
export function AdminPressPricingSetup() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = mode === 'dark' ? DARK : LIGHT;

  // ── Pricing setup state ──
  const [model, setModel] = useState<'ladder' | 'itemized'>('ladder');
  const [source, setSource] = useState<'native' | 'coda' | 'odoo'>('native');
  const [saved, setSaved] = useState(false);

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

      {/* Top bar */}
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
        {/* Partner-scoped left rail */}
        <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
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
              <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 p-1" style={{ backgroundColor: '#ffffff', border: `1px solid ${t.hairline}` }}>
                <img src={mrpLogo} alt="" aria-hidden className="w-full h-full object-contain" />
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

          <nav className="flex-1 px-3 pt-2 pb-3 space-y-0.5 overflow-y-auto">
            <PartnerNav t={t} />
          </nav>

          <div className="flex-shrink-0 px-3 pt-2 pb-3" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <BottomSettings t={t} />
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full" style={{ maxWidth: 880, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
              <span>{MOCK_PARTNER.name}</span>
              <span style={{ opacity: 0.6 }}>›</span>
              <span>Components</span>
              <span style={{ opacity: 0.6 }}>›</span>
              <span style={{ color: t.subink }}>Pricing</span>
            </div>

            {/* ── Header ── */}
            <h1 className="tracking-tight" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.08, marginTop: 10 }}>
              <span style={{ color: t.ink }}>Pricing setup. </span>
              <span style={{ color: t.faint, fontWeight: 600 }}>How Memphis prices, and where prices live.</span>
            </h1>
            <p className="text-[14.5px]" style={{ marginTop: 10, maxWidth: 620, color: t.subink }}>
              Chosen by GoodTunes, per press. Memphis never sees this switch —
              their Components&nbsp;›&nbsp;Pricing page simply takes the shape
              you pick here.
            </p>

            {/* ── 1 · Pricing model ── */}
            <section style={{ marginTop: 36 }}>
              <SectionHead n={1} title="Pricing model" t={t} />
              <div role="radiogroup" aria-label="Pricing model" style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
                {([
                  { id: 'ladder' as const, name: 'Tier ladder', example: 'How Memphis prices', body: 'The press prices the tier or style — Black, Splatter, EcoMix — and every color under it inherits. Their Pricing page shows tier rows, not each color.' },
                  { id: 'itemized' as const, name: 'Component-itemized', example: 'How Viryl prices', body: 'Every color and component carries its own price. Their Pricing page shows the full per-color grid, and estimates resolve line by line.' },
                ]).map((m) => {
                  const active = model === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => { setModel(m.id); setSaved(false); }}
                      className="text-left rounded-2xl transition-colors"
                      style={{ padding: 18, backgroundColor: t.card, border: active ? '1.5px solid ' + BLUE : '1px solid ' + t.hairline }}
                      data-testid={'model-' + m.id}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold" style={{ color: t.ink }}>{m.name}</span>
                        <span className="text-[11.5px] font-medium rounded-full" style={{ padding: '2px 8px', backgroundColor: t.cardSoft, color: t.subink, border: '1px solid ' + t.hairline }}>{m.example}</span>
                        {active && <WordIcon icon={Check} t={t} ink>Selected</WordIcon>}
                      </div>
                      <p className="text-[12.5px]" style={{ marginTop: 8, color: t.subink, lineHeight: 1.55 }}>{m.body}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px]" style={{ marginTop: 10, color: t.faint }}>
                More models can be added as presses need them.
              </p>
            </section>

            {/* ── 2 · Pricing source ── */}
            <section style={{ marginTop: 36 }}>
              <SectionHead n={2} title="Pricing source" t={t} />
              <p className="text-[13px]" style={{ marginTop: 10, maxWidth: 620, color: t.subink, lineHeight: 1.6 }}>
                Where the numbers live. Connecting an external source locks
                in-app editing — rows read from the sync, and a missing price
                stays an honest gap, never a stale one.
              </p>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {([
                  { id: 'native' as const, name: 'GoodTunes native', body: 'Priced right here in Components › Pricing. The press edits rows directly.', meta: null },
                  { id: 'coda' as const, name: 'CODA.io', body: 'Their pricing doc stays the source of truth. We read it on a schedule; their Pricing page becomes read-only with per-row sync stamps.', meta: 'Sync every 6 hours' },
                  { id: 'odoo' as const, name: 'Odoo', body: 'Prices sync from their Odoo price list. Read-only in GoodTunes; renames and duplicates reconcile per the lifecycle brief.', meta: 'Sync every 6 hours' },
                ]).map((c) => {
                  const active = source === c.id;
                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl"
                      style={{ padding: 18, backgroundColor: t.card, border: active ? '1.5px solid ' + BLUE : '1px solid ' + t.hairline }}
                      data-testid={'source-' + c.id}
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-semibold" style={{ color: t.ink }}>{c.name}</span>
                            {active
                              ? <WordIcon icon={Check} t={t} ink>{c.id === 'native' ? 'In use' : 'Connected'}</WordIcon>
                              : <WordIcon icon={Circle} t={t}>Not connected</WordIcon>}
                          </div>
                          <p className="text-[12.5px]" style={{ marginTop: 6, maxWidth: 560, color: t.subink, lineHeight: 1.55 }}>{c.body}</p>
                          {active && c.id !== 'native' && (
                            <p className="text-[12px]" style={{ marginTop: 8, color: t.faint }}>
                              Synced from {c.name} · last sync Aug 22, 9:14 AM · {c.meta}
                            </p>
                          )}
                        </div>
                        {!active && (
                          <button
                            type="button"
                            onClick={() => { setSource(c.id); setSaved(false); }}
                            className={'h-9 px-4 rounded-full text-[12.5px] font-medium transition-colors ' + t.hoverClass}
                            style={{ color: t.subink, border: '1px solid ' + t.hairline, backgroundColor: 'transparent' }}
                            data-testid={'button-connect-' + c.id}
                          >
                            {c.id === 'native' ? 'Use native' : 'Connect'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── What Memphis will see ── */}
            <section style={{ marginTop: 36 }}>
              <div className="rounded-2xl" style={{ padding: 18, backgroundColor: t.cardSoft, border: '1px solid ' + t.hairline }} data-testid="effect-preview">
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>What Memphis will see</div>
                <p className="text-[13px]" style={{ marginTop: 8, color: t.subink, lineHeight: 1.6, maxWidth: 620 }}>
                  {model === 'ladder'
                    ? 'Components › Pricing shows one row per tier — Black, Splatter, EcoMix — with a single type upcharge each. No per-color grid.'
                    : 'Components › Pricing shows the full per-color grid — every color under every tier carries its own upcharge.'}
                  {source !== 'native' && ' Rows are read-only, stamped with the last sync.'}
                </p>
              </div>
            </section>

            {/* The ONE filled accent action */}
            <div className="flex items-center gap-3" style={{ marginTop: 28 }}>
              <button
                type="button"
                onClick={() => setSaved(true)}
                className="h-10 px-5 rounded-full text-[13.5px] font-semibold text-white transition-transform hover:-translate-y-px"
                style={{ backgroundColor: BLUE, boxShadow: t.pillShadow }}
                data-testid="button-save-setup"
              >
                Save pricing setup
              </button>
              {saved && <WordIcon icon={Check} t={t} ink>Saved</WordIcon>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminPressPricingSetup;
