// AdminAlbumOverview — the reorganized super-admin album Overview tab
// (Bill + Ruby, Aug 23 2026). Replaces the live eleven-section pile with:
//
//   • An "at a glance" strip up top — status, release date, share link,
//     press, needs-attention — the facts you check when you open an album.
//   • Four groups: The record / Where fans find it / Marketing /
//     GoodDeed® & giving.
//   • Evictions: Split shipments moves to Physical → Fulfillment (its twin
//     already lives there); SPIN Promo hides behind a quiet "Legacy
//     settings" disclosure at the very bottom.
//
// Canon: charcoal admin dark (never navy), sentence-case headings, word +
// icon statuses, ONE filled accent action per page (here: none — this is a
// view; per-section edits are quiet pencils), "estimate" never "quote",
// real ®, no raw hex in UI copy (swatch + name instead).
// Rail copied verbatim from AdminRailCanon (mocks are self-contained).

import { useState } from 'react';
import {
  LayoutDashboard, User, Users, Library, Handshake, ListTodo, Radio,
  BarChart3, BadgeDollarSign, ScrollText, Settings2, Search, Bell,
  MessageSquarePlus, Moon, Sun, ChevronDown as NavChevron,
  Disc3, Guitar, Gift, Tag, UserCog, HeartHandshake, Factory, Hammer,
  Store, Truck, UsersRound, ClipboardList, ShoppingBag, PenLine, Zap,
  Activity, MessageCircle, Contact, Mail, DollarSign, Wallet, Landmark,
  Receipt, UserPlus, Network, BookUser,
  Pencil, ExternalLink, Copy, CircleCheck, TriangleAlert, CircleDashed,
  Link2, ImagePlus, ChevronRight, Plus, Lock, Music,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';
import californialandCover from '../assets/californialand-cover.jpg';
import logoAppleMusic from '../assets/logo-applemusic.svg';
import logoSpotify from '../assets/logo-spotify.svg';
import logoTidal from '../assets/logo-tidal.svg';
import logoDeezer from '../assets/logo-deezer.svg';
import logoPandora from '../assets/logo-pandora.svg';
import logoQobuz from '../assets/logo-qobuz.svg';

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
    hairline: 'rgba(255,255,255,0.10)', canvas: '#161617', rail: '#1c1c1e', card: '#1e1e20', cardSoft: '#26262a',
    pillShadow: '0 1px 3px rgba(0,0,0,0.5)', headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30', avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5', logoFilter: 'invert(1) brightness(1.8)',
  },
};

type NavIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
type NavChild = { label: string; icon: NavIcon; count?: number };
type NavItem = { label: string; icon: NavIcon; count?: number; children?: NavChild[] };

const ADMIN_NAV_CANON: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User, count: 224 },
  {
    label: 'Catalog', icon: Library,
    children: [
      { label: 'Releases', icon: Disc3, count: 72 },
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

function AdminRail({ active, t }: { active: string; t: Theme }) {
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

// ─── Mock data — CALIFORNIALAND, matching the live album ────────────
const MOCK_ALBUM = {
  title: 'CALIFORNIALAND',
  artist: 'Niina Soleil',
  type: 'LP (8+ tracks)',
  year: '2026',
  genre: 'Soul',
  label: 'Independent',
  copyright: '© 2026 Niina Soleil',
  catalogNo: 'NS-001',
  upc: null as string | null,
  tracks: 12,
  status: 'At press',
  press: 'Memphis Record Pressing',
  releaseDate: 'Jul 14, 2026',
  originalRelease: 'Aug 14, 2026',
  sunset: 'Aug 14, 2026',
  presave: null as string | null,
  streamingRelease: null as string | null,
  artBlockers: 2,
  shareUrl: 'get.goodtunes.music/niina-soleil/californialand',
  artistSlug: 'niina-soleil',
  albumSlug: 'californialand',
  // Official marks (brand-color SVGs) on white carrier circles per canon
  // logo rule (Qobuz mark from Wikimedia Commons).
  streaming: [
    { name: 'Apple Music', set: true, logo: logoAppleMusic },
    { name: 'Spotify', set: true, logo: logoSpotify },
    { name: 'Tidal', set: false, logo: logoTidal },
    { name: 'Deezer', set: false, logo: logoDeezer },
    { name: 'Pandora', set: false, logo: logoPandora },
    { name: 'Qobuz', set: false, logo: logoQobuz },
  ],
  buttonColorName: 'Poppy red',
  buttonColorSwatch: '#D8342C', // swatch fill only — never shown as text
  npo: { name: 'Endometriosis Foundation', perUnit: '$1.00', locked: true },
};

const MAIN_TABS = ['Dashboard', 'Overview', 'Package', 'Digital', 'Physical', 'Shopify', 'Payments', 'Customers', 'Early access'];

const MOCK_SERVICE_URLS: Record<string, string> = {
  'Apple Music': 'music.apple.com/us/artist/niina-soleil/1618122241',
  Spotify: 'open.spotify.com/artist/3SCtnUPSAO4z0Lq8VE4Ck2',
};

// ─── Shared bits ─────────────────────────────────────────────────────
function SectionCard({ t, title, sub, edit, action, children, testid }: {
  t: Theme; title: string; sub?: string; edit?: boolean; action?: React.ReactNode; children: React.ReactNode; testid: string;
}) {
  return (
    <section className="group rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid={testid}>
      <div className="flex items-start justify-between gap-4 px-7 pt-6 pb-1">
        <h2 className="text-[21px] font-semibold tracking-tight leading-snug" style={{ color: t.ink, letterSpacing: '-0.02em' }}>
          {title}.{' '}
          {sub && <span className="font-medium" style={{ color: t.subink }}>{sub}.</span>}
        </h2>
        <div className="flex items-center gap-1 flex-shrink-0 pt-1">
          {action}
          {edit && (
            <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100', t.hoverWash)} style={{ color: t.subink }} aria-label={`Edit ${title.toLowerCase()}`} data-testid={`button-edit-${testid}`}>
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="px-7 pb-7">{children}</div>
    </section>
  );
}

function Field({ t, label, value, notSet }: { t: Theme; label: string; value?: string | null; notSet?: string }) {
  return (
    <div>
      <div className="text-[13px]" style={{ color: t.faint }}>{label}</div>
      {value ? (
        <div className="mt-1 text-[15px] font-medium" style={{ color: t.ink }}>{value}</div>
      ) : (
        <div className="mt-1 text-[15px] italic" style={{ color: t.faint }}>{notSet ?? 'Not set'}</div>
      )}
    </div>
  );
}

// Canon: row/secondary actions are quiet borderless text buttons —
// blue for the section's main verb, subink for the rest.
function TextButton({ t, blue, children, testid }: { t: Theme; blue?: boolean; children: React.ReactNode; testid: string }) {
  return (
    <button
      type="button"
      className="h-8 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[13.5px] font-medium transition-colors"
      style={{ color: blue ? t.blue : t.subink, backgroundColor: 'transparent' }}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

// ─── The page ────────────────────────────────────────────────────────
export default function AdminAlbumOverview() {
  const [mode, setMode] = useState<'light' | 'dark'>('dark');
  const t = THEMES[mode];
  const [blockersOpen, setBlockersOpen] = useState(true);
  const [linkTab, setLinkTab] = useState<'Release' | 'Pre-save'>('Release');
  const [openService, setOpenService] = useState<string | null>('Apple Music');
  const a = MOCK_ALBUM;

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
      <header className="h-14 flex-shrink-0 flex items-center justify-between gap-4 px-6 sticky top-0 z-20" style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}>
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
        <AdminRail active="Releases" t={t} />

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
            {/* Breadcrumb + album header */}
            <div className="flex items-center gap-1 text-[13px]">
              <a href="#" onClick={(e) => e.preventDefault()} style={{ color: t.faint }}>Albums</a>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: t.faint }} />
              <span style={{ color: t.ink }}>{a.title}</span>
            </div>
            <div className="mt-5 flex items-center gap-6">
              <img src={californialandCover} alt="" className="rounded-lg object-cover flex-shrink-0" style={{ width: 80, height: 80, boxShadow: t.pillShadow }} />
              <div className="min-w-0">
                <div className="text-[14px] font-medium" style={{ color: t.subink }}>
                  LP · {a.artist}
                </div>
                <h1 className="text-[30px] font-semibold leading-tight" style={{ color: t.ink, letterSpacing: '-0.02em' }} data-testid="heading-album">{a.title}</h1>
                <div className="mt-1 flex items-center gap-2 text-[13.5px]" style={{ color: t.subink }}>
                  <span>{a.year}</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1"><Music className="w-3 h-3" /> {a.tracks} tracks</span>
                </div>
              </div>
            </div>

            {/* Main tabs — plain text, active underline, no dots */}
            <nav className="mt-8 flex items-center gap-7 text-[13.5px] font-medium overflow-x-auto" style={{ borderBottom: `1px solid ${t.hairline}` }}>
              {MAIN_TABS.map((tab) => {
                const active = tab === 'Overview';
                return (
                  <a
                    key={tab}
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="pb-2.5 whitespace-nowrap"
                    style={{
                      color: active ? t.ink : t.subink,
                      fontWeight: active ? 600 : 500,
                      borderBottom: active ? `2px solid ${t.ink}` : '2px solid transparent',
                      marginBottom: -1,
                    }}
                    data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {tab}
                  </a>
                );
              })}
            </nav>

            {/* ── At a glance — the facts you came to check ── */}
            <div className="mt-8 rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="strip-at-a-glance">
            <div className="px-7 py-5 flex flex-wrap items-center gap-x-10 gap-y-4">
              <div>
                <div className="text-[13px]" style={{ color: t.faint }}>Status</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium" style={{ color: t.ink }}>
                  <Factory className="w-3.5 h-3.5" style={{ color: t.subink }} /> {a.status}
                </div>
              </div>
              <div>
                <div className="text-[13px]" style={{ color: t.faint }}>Release date</div>
                <div className="mt-1 text-[15px] font-medium" style={{ color: t.ink }}>{a.releaseDate}</div>
              </div>
              <div>
                <div className="text-[13px]" style={{ color: t.faint }}>Press</div>
                <div className="mt-1 text-[15px] font-medium" style={{ color: t.ink }}>{a.press}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[13px]" style={{ color: t.faint }}>Share link</div>
                <div className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium" style={{ color: t.ink }}>
                  <CircleCheck className="w-3.5 h-3.5" style={{ color: t.subink }} /> Live
                  <span className="truncate font-normal" style={{ color: t.subink }}>· {a.shareUrl}</span>
                </div>
              </div>
              <div className="ml-auto">
                <div className="text-[13px]" style={{ color: t.faint }}>Needs attention</div>
                <button
                  type="button"
                  onClick={() => setBlockersOpen((v) => !v)}
                  aria-expanded={blockersOpen}
                  className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-medium"
                  style={{ color: t.ink }}
                  data-testid="button-needs-attention"
                >
                  <TriangleAlert className="w-3.5 h-3.5" style={{ color: t.subink }} />
                  {a.artBlockers} art blockers
                  <NavChevron className="w-3.5 h-3.5 transition-transform" style={{ color: t.faint, transform: blockersOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
              </div>
            </div>
            {blockersOpen && (
              <div className="px-7 pb-5 space-y-2.5" style={{ borderTop: `1px solid ${t.hairline}` }} data-testid="panel-art-blockers">
                {[
                  { piece: 'Cover · jacket', issue: 'Bleed is 0.147" short of the template on the right edge' },
                  { piece: 'Center labels', issue: 'Side B text crosses the safe area near the spindle hole' },
                ].map((b) => (
                  <div key={b.piece} className="pt-4 first:pt-5 flex items-center gap-3">
                    <TriangleAlert className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} />
                    <div className="flex-1 min-w-0 text-[14px]">
                      <span className="font-medium" style={{ color: t.ink }}>{b.piece}</span>
                      <span className="mx-1.5" aria-hidden>·</span>
                      <span style={{ color: t.subink }}>{b.issue}</span>
                    </div>
                    <a href="#" onClick={(e) => e.preventDefault()} className="text-[13px] font-medium flex-shrink-0" style={{ color: t.blue }}>
                      Fix on Physical →
                    </a>
                  </div>
                ))}
              </div>
            )}
            </div>

            <div className="mt-6 space-y-6">
              {/* ── 1 · The record ── */}
              <SectionCard t={t} title="The record" sub="What this album is — identity, dates, and who played on it" edit testid="section-record">
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                  <Field t={t} label="Title" value={a.title} />
                  <Field t={t} label="Artist" value={a.artist} />
                  <Field t={t} label="Type" value={a.type} />
                  <Field t={t} label="Year" value={a.year} />
                  <Field t={t} label="Genre" value={a.genre} />
                  <Field t={t} label="Label" value={a.label} />
                  <Field t={t} label="Copyright" value={a.copyright} />
                  <Field t={t} label="Catalog number" value={a.catalogNo} />
                  <Field t={t} label="UPC code" value={a.upc} />
                  <Field t={t} label="Bundle price (USD)" value={null} />
                </div>
                <div className="mt-5 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4" style={{ borderTop: `1px solid ${t.hairline}` }}>
                  <Field t={t} label="GoodTunes release" value={a.releaseDate} />
                  <Field t={t} label="Original release" value={a.originalRelease} />
                  <Field t={t} label="Streaming release" value={a.streamingRelease} />
                  <Field t={t} label="Pre-save date" value={a.presave} />
                </div>
                <div className="mt-5 pt-4 flex items-center justify-between gap-4" style={{ borderTop: `1px solid ${t.hairline}` }}>
                  <div className="text-[14px]" style={{ color: t.subink }}>
                    <span className="font-medium" style={{ color: t.ink }}>Lineup</span>
                    <span className="mx-1.5" aria-hidden>·</span>
                    No one credited yet — add a member and per-track credits roll up here
                  </div>
                  <TextButton t={t} testid="button-add-member"><Plus className="w-3.5 h-3.5" /> Add member</TextButton>
                </div>
              </SectionCard>

              {/* ── 2 · Where fans find it ── */}
              <SectionCard t={t} title="Where fans find it" sub="The share link fans land on, and the streaming services this album links out to" edit testid="section-find">
                {/* Release / Pre-save segmented toggle — one rounded chip */}
                <div className="mt-3">
                  <span className="inline-flex rounded-full p-0.5" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }} role="group" aria-label="Link">
                    {(['Release', 'Pre-save'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setLinkTab(v)}
                        className="h-7 px-3.5 rounded-full text-[13px] font-medium transition-colors"
                        style={{
                          backgroundColor: linkTab === v ? t.card : 'transparent',
                          color: linkTab === v ? t.ink : t.subink,
                          boxShadow: linkTab === v ? t.pillShadow : undefined,
                        }}
                        data-testid={`link-tab-${v.toLowerCase()}`}
                      >
                        {v}
                      </button>
                    ))}
                  </span>
                </div>
                {linkTab === 'Release' ? (
                  <>
                    {/* The GoodTunes link as a rounded-rect tile — same
                        grammar as the streaming tiles below, one size up */}
                    <div className="mt-5 flex items-center gap-3.5 h-14 px-4 rounded-xl" style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.cardSoft }} data-testid="tile-goodtunes-link">
                      <span className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#ffffff', border: `1px solid ${t.hairline}` }} aria-hidden>
                        <img src={goodtunesLogo} alt="" className="w-5 h-5 object-contain" />
                      </span>
                      <span className="text-[14px] font-medium truncate" style={{ color: t.ink }}>
                        <span style={{ color: t.subink }}>get.goodtunes.music/</span>{a.artistSlug}<span style={{ color: t.subink }}>/</span>{a.albumSlug}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[13.5px] flex-shrink-0" style={{ color: t.subink }}>
                        <CircleCheck className="w-3.5 h-3.5" /> Live
                      </span>
                      <span className="flex-1" />
                      <TextButton t={t} blue testid="button-open-share"><ExternalLink className="w-3.5 h-3.5" /> Open</TextButton>
                      <TextButton t={t} testid="button-copy-share"><Copy className="w-3.5 h-3.5" /> Copy</TextButton>
                    </div>
                    <p className="mt-2.5 text-[13px]" style={{ color: t.faint }}>Live — fans can preview and buy. The artist part is shared across all of {a.artist}'s releases.</p>
                  </>
                ) : (
                  <div className="mt-5 flex items-center gap-3 text-[14px]" data-testid="row-presave-link">
                    <CircleDashed className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
                    <span className="italic" style={{ color: t.faint }}>Not set — created when you schedule a pre-save date, and shared separately before release day</span>
                  </div>
                )}
                {/* Service tiles: official brand marks on WHITE carrier
                    circles per canon logo rule (object-contain, never
                    recolored or inverted). */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {a.streaming.map((s) => (
                    <button type="button" key={s.name} onClick={() => setOpenService((v) => (v === s.name ? null : s.name))} className="flex items-center gap-2.5 h-12 px-3.5 rounded-lg text-left" style={{ border: `1px solid ${openService === s.name ? t.subink : t.hairline}`, backgroundColor: s.set ? t.cardSoft : 'transparent' }} data-testid={`streaming-${s.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      <span
                        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: '#ffffff', border: `1px solid ${t.hairline}`, opacity: s.set ? 1 : 0.45 }}
                        aria-hidden
                      >
                        {s.logo ? (
                          <img src={s.logo} alt="" className="w-[18px] h-[18px] object-contain" />
                        ) : (
                          <span className="text-[11px] font-semibold" style={{ color: '#1d1d1f' }}>{s.name[0]}</span>
                        )}
                      </span>
                      <span className="text-[14px] font-medium flex-1 truncate" style={{ color: s.set ? t.ink : t.subink }}>{s.name}</span>
                      <span className="inline-flex items-center gap-1 text-[13px]" style={{ color: s.set ? t.subink : t.faint }}>
                        {s.set ? <CircleCheck className="w-3.5 h-3.5" /> : <CircleDashed className="w-3.5 h-3.5" />}
                        {s.set ? 'Linked' : 'Not set'}
                      </span>
                    </button>
                  ))}
                </div>
                {/* Clicked state — a linked service reveals its URL with
                    Open/Copy; an unlinked one reveals the paste field with a
                    quiet confirm that earns its blue when a link is pasted */}
                {openService && (() => {
                  const s = a.streaming.find((x) => x.name === openService)!;
                  return (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3" style={{ border: `1px solid ${t.hairline}` }} data-testid="panel-service-link">
                      {s.set ? (
                        <>
                          <span className="text-[13.5px] truncate" style={{ color: t.ink }}>{MOCK_SERVICE_URLS[s.name]}</span>
                          <span className="flex-1" />
                          <TextButton t={t} blue testid="button-open-service"><ExternalLink className="w-3.5 h-3.5" /> Open</TextButton>
                          <TextButton t={t} testid="button-copy-service"><Copy className="w-3.5 h-3.5" /> Copy</TextButton>
                          <TextButton t={t} testid="button-remove-service">Remove</TextButton>
                        </>
                      ) : (
                        <>
                          <input
                            readOnly
                            placeholder={`Paste the ${s.name} album link`}
                            className={cn('flex-1 min-w-[220px] h-9 px-3.5 rounded-full text-[13.5px] focus:outline-none', t.searchPlaceholder)}
                            style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: 'transparent' }}
                          />
                          {/* Idle confirm — quiet outline pill; fills blue only once a valid link is pasted */}
                          <button type="button" className="h-9 px-4 rounded-full text-[13.5px] font-medium" style={{ border: `1px solid ${t.hairline}`, color: t.subink }} data-testid="button-save-service">
                            Save
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </SectionCard>

              {/* ── 3 · Marketing ── */}
              <SectionCard
                t={t}
                title="Marketing"
                sub="How this album looks in fans' inboxes and on the campaign page"
                edit
                action={<TextButton t={t} testid="button-preview-email"><Mail className="w-3.5 h-3.5" /> Preview email</TextButton>}
                testid="section-marketing"
              >
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-[13px]" style={{ color: t.subink }}>"Get my music" button</span>
                  <span className="inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12.5px] font-medium" style={{ border: `1px solid ${t.hairline}`, color: t.ink }}>
                    <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: a.buttonColorSwatch }} aria-hidden />
                    {a.buttonColorName}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Default graphic', sub: 'Cover art (auto)', set: true },
                    { label: 'Vinyl orders', sub: 'Custom graphic', set: true },
                    { label: 'CD orders', sub: 'Custom graphic', set: true },
                    { label: 'Cassette orders', sub: 'No graphic yet', set: false },
                  ].map((g) => (
                    <div key={g.label} data-testid={`graphic-${g.label.toLowerCase().replace(/\s+/g, '-')}`}>
                      <div
                        className="aspect-square rounded-lg overflow-hidden flex items-center justify-center"
                        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.cardSoft }}
                      >
                        {g.set ? (
                          <img src={californialandCover} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImagePlus className="w-5 h-5" style={{ color: t.faint }} />
                        )}
                      </div>
                      <div className="mt-1.5 text-[12.5px] font-medium" style={{ color: t.ink }}>{g.label}</div>
                      <div className="text-[12px]" style={{ color: g.set ? t.subink : t.faint }}>{g.sub}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-4 pt-4" style={{ borderTop: `1px solid ${t.hairline}` }}>
                  <div className="text-[14px]" style={{ color: t.subink }}>
                    <span className="font-medium" style={{ color: t.ink }}>Campaign gallery</span>
                    <span className="mx-1.5" aria-hidden>·</span>
                    No images yet — the built-in gallery shows until you add one
                  </div>
                  <TextButton t={t} testid="button-add-gallery-image"><ImagePlus className="w-3.5 h-3.5" /> Add image</TextButton>
                </div>
              </SectionCard>

              {/* ── 4 · GoodDeed® & giving ── */}
              <SectionCard t={t} title="GoodDeed® & giving" sub="Non-profit shares per unit, funded from the GoodTunes margin — album price is unchanged" edit testid="section-giving">
                <div className="mt-3 flex items-center gap-3 h-12 px-4 rounded-lg" style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.cardSoft }}>
                  <HeartHandshake className="w-4 h-4 flex-shrink-0" style={{ color: t.subink }} />
                  <span className="text-[13.5px] font-medium flex-1 truncate" style={{ color: t.ink }}>{a.npo.name}</span>
                  <span className="text-[13.5px] font-medium tabular-nums" style={{ color: t.ink }}>{a.npo.perUnit} / unit</span>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 text-[13.5px]" style={{ color: t.subink }}>
                    <Lock className="w-3.5 h-3.5" />
                    Locked — this album has sold. You can add new NPOs or raise shares, but can't reduce or remove one.
                  </span>
                  <TextButton t={t} testid="button-add-npo"><Plus className="w-3.5 h-3.5" /> Add NPO</TextButton>
                </div>
              </SectionCard>

              {/* Legacy settings (SPIN Promo) intentionally ABSENT here:
                  CALIFORNIALAND is a new-artist album. The quiet "Legacy
                  settings" disclosure renders ONLY on albums imported from
                  the old system (pre-Nightbirde), super-admin only — absent,
                  not toggled-off, everywhere else (Bill, Aug 23 2026). */}

              <p className="text-[13px] pb-6" style={{ color: t.faint }}>
                Split shipments now lives on Physical → Fulfillment, with the destination it configures.
              </p>
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
