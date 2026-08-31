// ArtistDashboardAccountStack — approved Super-admin proposal.
//
// Information architecture (approved):
//  - Global header shows only the GoodTunes logo; utilities stay to the
//    right. No adjacent "Super admin" / "Artist portal" text label.
//  - Six peer destinations (Dashboard, Releases, Audience, Orders,
//    Reports, Settings) render as underline tabs — never chips.
//  - Normal Super-admin Dashboard has no greeting; the artist identity
//    header above provides context. Range controls + View orders stay
//    aligned top-right. The artist greeting appears only in the
//    prototype's Artist view.
//  - The full approved account-management region is arranged by change
//    frequency: Links, Stores (GoodTunes + Shopify), Identity,
//    Notifications, then Production. Production remains the final
//    operational category before the separate Danger Zone, with every
//    interaction from AdminArtistProfileInteractionCanon intact.
//    The Settings page opens with "Settings. Manage this artist." and ends
//    with a subdued Danger Zone card. Artists with operational history
//    are archived (reversible); deletion is reserved for disposable test
//    records that never progressed beyond an estimate.
//  - Dashboard ends after its own operational sections.
//  - Super-admin operator controls (Change press, View as artist, ···
//    overflow) live in the profile/account UI, not the tab strip.
//  - Light theme is artist-portal default; dark is super-admin default;
//    the Appearance picker in the account menu controls both.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { tokens } from '@workspace/goodtunes-design-system';
import { AppleCard, AppleQuietAction, AppleSectionHeader } from '@workspace/goodtunes-design-system/components/ui/apple';
import { ServiceIdentity } from '@workspace/goodtunes-design-system/components/ui/service-identity';
import { OperatorRail } from '@workspace/goodtunes-design-system/components/operator-rail';
import { ComponentIcon, type IconKind } from './PressTemplatesIndex';
import { ArtistDashboardNextStepsStrip } from './ArtistDashboardNextSteps';
import { ArtistTemplateTest } from './ArtistTemplateTest';
import { ArtistReleasePackageBuilderContent, type ArtistPackageSnapshot } from './ArtistReleasePackageTemplates';
import {
  Award,
  Banknote,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  CreditCard,
  Disc3,
  Download,
  Eye,
  ExternalLink,
  Factory,
  FileText,
  Globe,
  Image,
  Info,
  Link2,
  ListChecks,
  LogOut,
  Landmark,
  MapPin,
  MessageSquarePlus,
  MoreHorizontal,
  Music2,
  Pencil,
  Plus,
  Receipt,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  User,
  UserPen,
  UserPlus,
  Video,
  X,
  ArrowLeftRight,
  BarChart3,
  Gift,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShoppingBag,
  Store,
  UserCheck,
  Users,
} from 'lucide-react';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.svg';
import shopifyWordmarkDark from '../assets/shopify-wordmark-dark.svg';
import shopifyWordmarkLight from '../assets/shopify-wordmark-light.svg';
import shopifyBagLogo from '../assets/logo-shopify-bag.svg';
import niinaShopifyLaptop from '../assets/niina-shopify-laptop.png';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import virylIcon from '../assets/viryl-icon.svg';
import pmpIcon from '../assets/pmp-icon.svg';
import paramountIcon from '../assets/paramount/paramount-symbol.png';
import tidalLogo from '../assets/logo-tidal.svg';
import qobuzLogo from '../assets/logo-qobuz.svg';
import deezerLogo from '../assets/logo-deezer.svg';
import pandoraLogo from '../assets/logo-pandora.svg';
import spotifyLogo from '../assets/logo-spotify.svg';
import appleMusicLogo from '../assets/logo-applemusic.svg';
import instagramLogo from '../assets/logo-instagram.svg';
import tikTokLogo from '../assets/logo-tiktok.svg';
import xLogo from '../assets/logo-x.svg';
import blueskyLogo from '../assets/logo-bluesky.svg';
import facebookLogo from '../assets/logo-facebook.svg';
import californialandCover from '../assets/californialand-cover.jpg';
import niinaSoleilPhoto from '../assets/niina-soleil.webp';
import niinaLabelOne from '../assets/niina-label-1.png';
import goodDeedA4Preview from '../assets/gooddeed-californialand-a4.png';
import goodDeedLetterPreview from '../assets/gooddeed-californialand-letter.png';

const goodDeedA4Pdf = new URL('../assets/gooddeed-californialand-a4.pdf', import.meta.url).href;
const goodDeedLetterPdf = new URL('../assets/gooddeed-californialand-letter.pdf', import.meta.url).href;

// ─── Utility ────────────────────────────────────────────────────────────
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Palette tokens ──────────────────────────────────────────────────────
const BLUE = '#319ED8';
const INK = '#1d1d1f';
const SUBINK = '#6e6e73';
const FAINT = '#a1a1a6';
const HAIRLINE = '#e6e6ea';
const TRACK = '#f0f0f2';
const READY = '#1c8a5b';
const CRITICAL = '#e0245e';
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,.08), 0 0 0 .5px rgba(0,0,0,.04)';

// ─── Theme system (matches AdminArtistProfileInteractionCanon exactly) ───
type Theme = {
  blue: string; ink: string; subink: string; faint: string; hairline: string;
  canvas: string; rail: string; card: string; cardSoft: string;
  pillShadow: string; headerBg: string; searchPlaceholder: string;
  avatarRing: string; hoverWash: string; ready: string; critical: string;
  overlay: string; selectWash: string; popShadow: string; logoFilter?: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8', ink: '#1d1d1f', subink: '#6e6e73', faint: '#a1a1a6',
    hairline: '#e6e6ea', canvas: '#f5f5f7', rail: '#fbfbfd', card: '#ffffff',
    cardSoft: '#f0f0f2',
    pillShadow: '0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(251,251,253,0.72)',
    searchPlaceholder: 'placeholder:text-black/30',
    avatarRing: 'ring-black/10', hoverWash: 'hover:bg-black/5',
    ready: '#1c8a5b', critical: '#e0245e',
    overlay: 'rgba(0,0,0,0.28)', selectWash: '#f0f7fc',
    popShadow: '0 20px 48px rgba(0,0,0,0.18)', logoFilter: undefined,
  },
  dark: {
    blue: '#319ED8', ink: '#f5f5f7', subink: '#98989d', faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)', canvas: '#161617', rail: '#1c1c1e',
    card: '#1e1e20', cardSoft: '#26262a',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15', hoverWash: 'hover:bg-white/5',
    ready: '#34c98e', critical: '#ff5c8a',
    overlay: 'rgba(0,0,0,0.55)', selectWash: 'rgba(49,158,216,0.14)',
    popShadow: '0 20px 48px rgba(0,0,0,0.55)', logoFilter: 'invert(1) brightness(1.8)',
  },
};

type Mode = 'light' | 'dark' | 'system';

// ─── Navigation — six-destination artist portal (proposal) ──────────────
// Proposed consolidation: Acquisition → Audience › Growth, Buyers →
// Audience › Buyers, Referrals → Audience › Growth, Shopify → Settings ›
// Integrations. Nested page bodies are intentionally not built here.
export const ARTIST_PORTAL_TABS_GIT_BASELINE = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'catalog', label: 'Releases' },
  { id: 'audience', label: 'Audience' },
  { id: 'orders', label: 'Orders' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
] as const;
type ArtistTab = (typeof ARTIST_PORTAL_TABS_GIT_BASELINE)[number]['id'];
type ArtistLiveTab = ArtistTab | 'acquisition' | 'buyers' | 'referrals' | 'shopify';

const ARTIST_LIVE_NAV: Array<{ id: ArtistLiveTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'catalog', label: 'Releases', icon: Disc3 },
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'acquisition', label: 'Acquisition', icon: Megaphone },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'buyers', label: 'Buyers', icon: UserCheck },
  { id: 'referrals', label: 'Referrals', icon: Gift },
  { id: 'shopify', label: 'Shopify', icon: Store },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

type ReleaseFormatId = 'single_lp' | 'cd' | 'cassette';
type AdminRelease = {
  id: string;
  title: string;
  format: ReleaseFormatId;
  status: 'Prepping' | 'At press' | 'Released';
  cover?: string;
  year?: string;
  catalogNumber?: string;
  upc?: string;
  packageState: 'draft' | 'agreed';
  packageSnapshot?: ArtistPackageSnapshot;
};

const RELEASE_FORMATS: Array<{ id: ReleaseFormatId; label: string; detail: string }> = [
  { id: 'single_lp', label: 'Vinyl', detail: 'Choose size in builder' },
  { id: 'cd', label: 'CD', detail: 'Compact disc' },
  { id: 'cassette', label: 'Cassette', detail: 'Tape' },
];

const INITIAL_ADMIN_RELEASES: AdminRelease[] = [
  { id: 'california-land', title: 'CALIFORNIALAND', format: 'single_lp', status: 'At press', cover: californialandCover, packageState: 'agreed' },
];

type Preset = 'today' | '7d' | '30d' | '90d' | 'all';
type Metric = 'plays' | 'revenue' | 'orders';

// ─── Mock data (Git baseline) ────────────────────────────────────────────
const MOCK_PERSON = {
  id: 'person_niina_soleil',
  name: 'Niina Soleil',
  labelId: null,
  photoUrl: niinaSoleilPhoto,
  shape: 'artist',
  isGroup: false,
  bio: 'Artist behind CALIFORNIALAND.',
};

const RANGE_DATA = {
  today: { grossCents: 18400, prior: 16100, plays: 1284, priorPlays: 1160, listeners: 742, buyers: 9 },
  '7d': { grossCents: 127500, prior: 119200, plays: 8912, priorPlays: 8340, listeners: 4811, buyers: 61 },
  '30d': { grossCents: 486200, prior: 431500, plays: 34820, priorPlays: 31140, listeners: 18420, buyers: 224 },
  '90d': { grossCents: 1398400, prior: 1270600, plays: 101240, priorPlays: 93210, listeners: 51760, buyers: 641 },
  all: { grossCents: 8461200, prior: 7468000, plays: 648320, priorPlays: 590140, listeners: 284610, buyers: 3827 },
} satisfies Record<Preset, { grossCents: number; prior: number; plays: number; priorPlays: number; listeners: number; buyers: number }>;

const MOCK_LIFETIME = { grossCents: 8461200, refundedCents: 18400 };
const MOCK_ACTIVITY = [
  { kind: 'order', title: 'New order received', detail: 'CALIFORNIALAND · 2 vinyl', age: '18m ago', icon: Receipt },
  { kind: 'release', title: 'Release details updated', detail: 'CALIFORNIALAND', age: '1d ago', icon: Disc3 },
  { kind: 'certificate', title: 'Certificate names approved', detail: 'CALIFORNIALAND', age: '2d ago', icon: Award },
];
const MOCK_PROJECTS = [
  { albumId: 'california-land', title: 'CALIFORNIALAND', artist: 'Niina Soleil', revenueCents: 0, units: 0 },
];

const shortRange: Record<Preset, string> = {
  today: 'today', '7d': 'last 7d', '30d': 'last 30d', '90d': 'last 90d', all: 'all time',
};
const trendTitle: Record<Preset, string> = {
  today: 'Today.', '7d': 'The last 7 days.', '30d': 'The last 30 days.', '90d': 'The last 90 days.', all: 'All time.',
};

function money(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}
function compact(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
function delta(cur: number, prior: number) {
  return `${cur >= prior ? '+' : ''}${(((cur - prior) / prior) * 100).toFixed(1)}%`;
}

// ─── Dashboard sub-components (exact Git baseline) ───────────────────────
function RangeSwitcher({ value, onChange, t }: { value: Preset; onChange: (p: Preset) => void; t: Theme }) {
  const options: Array<{ value: Preset; label: string }> = [
    { value: 'today', label: 'Today' }, { value: '7d', label: '7d' },
    { value: '30d', label: '30d' }, { value: '90d', label: '90d' }, { value: 'all', label: 'All' },
  ];
  return (
    <div className="inline-flex items-center p-1 rounded-full" style={{ background: t.cardSoft, gap: 2 }} data-testid="dashboard-range-switcher">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} className="px-3.5 h-8 text-[13px] rounded-full transition-all" style={{ color: active ? t.ink : t.subink, background: active ? t.card : undefined, boxShadow: active ? t.pillShadow : undefined, fontWeight: active ? 600 : 500 }} aria-pressed={active}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function KpiStrip({ preset, t }: { preset: Preset; t: Theme }) {
  const d = RANGE_DATA[preset];
  const rows: Array<{ id: string; label: string; value: string; cur?: number; prior?: number; note?: string }> = [
    { id: 'sales', label: `Sales · ${shortRange[preset]}`, value: money(d.grossCents), cur: d.grossCents, prior: d.prior },
    { id: 'salesLifetime', label: 'Sales · lifetime', value: money(MOCK_LIFETIME.grossCents), note: `${money(MOCK_LIFETIME.refundedCents)} refunded` },
    { id: 'plays', label: `Fan plays · ${shortRange[preset]}`, value: compact(d.plays), cur: d.plays, prior: d.priorPlays },
    { id: 'listeners', label: 'Listeners', value: compact(d.listeners), cur: d.listeners, prior: Math.round(d.listeners * 0.92) },
    { id: 'buyers', label: 'Buyers', value: compact(d.buyers), cur: d.buyers, prior: Math.round(d.buyers * 0.9) },
  ];
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }} data-testid="kpi-strip">
      {rows.map((row) => (
        <div key={row.id} className="rounded-2xl p-5 flex flex-col" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
          <div className="text-[13px] font-medium truncate" style={{ color: t.subink }}>{row.label}</div>
          <div className="mt-3 tabular-nums truncate" style={{ fontSize: 32, lineHeight: 1, fontWeight: 600, letterSpacing: '-.03em', color: t.ink }}>{row.value}</div>
          <div className="mt-3 flex items-start flex-wrap gap-x-1.5 text-[13px]">
            {row.cur != null && row.prior != null && <>
              <span className="font-semibold tabular-nums" style={{ color: row.cur >= row.prior ? t.ready : t.critical }}>{delta(row.cur, row.prior)}</span>
              <span style={{ color: t.subink }}>vs prior</span>
            </>}
            {row.note && <span className="text-[12px]" style={{ color: t.subink }}>{row.cur != null ? `· ${row.note}` : row.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendPanel({ preset, t }: { preset: Preset; t: Theme }) {
  const [metric, setMetric] = useState<Metric>('plays');
  const values = useMemo(() => {
    return metric === 'plays' ? [28, 37, 31, 48, 42, 58, 64, 55, 72, 69, 83, 76]
      : metric === 'revenue' ? [18, 24, 21, 31, 27, 38, 44, 36, 52, 47, 61, 57]
      : [8, 10, 9, 15, 12, 19, 17, 21, 18, 25, 23, 28];
  }, [metric]);
  const points = values.map((v, i) => `${24 + i * 48},${205 - v * 1.75}`).join(' ');
  const metricLead = metric === 'plays' ? 'Plays.' : metric === 'revenue' ? 'Revenue.' : 'Orders.';
  const subtitle = metric === 'plays' ? 'The tracks fans love.' : metric === 'revenue' ? 'What fans spend.' : 'What ships to fans.';
  return (
    <div className="rounded-2xl p-6 h-full flex flex-col" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="chart-trend">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-[20px] font-semibold" style={{ color: t.ink, letterSpacing: '-.01em' }}>
          {metricLead} <span style={{ color: t.subink, fontWeight: 500 }}>{subtitle}</span>
        </h3>
        <div className="inline-flex p-1 rounded-full" style={{ background: t.cardSoft, gap: 2 }}>
          {(['plays', 'revenue', 'orders'] as Metric[]).map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)} className="px-3 h-7 text-[12.5px] rounded-full capitalize" style={{ color: metric === m ? t.ink : t.subink, background: metric === m ? t.card : undefined, boxShadow: metric === m ? t.pillShadow : undefined, fontWeight: metric === m ? 600 : 500 }}>{m}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-[260px]">
        <svg viewBox="0 0 580 235" className="w-full h-full" preserveAspectRatio="none" aria-label={`${metric} trend`}>
          {[35, 80, 125, 170, 215].map((y) => <line key={y} x1="24" x2="565" y1={y} y2={y} stroke={t.hairline} strokeDasharray="3 3" />)}
          <line x1="24" x2="24" y1="12" y2="215" stroke={t.hairline} />
          <line x1="24" x2="565" y1="215" y2="215" stroke={t.hairline} />
          <polyline points={points} fill="none" stroke={BLUE} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
          {['08/01', '08/07', '08/14', '08/21', '08/30'].map((x, i) => <text key={x} x={24 + i * 133} y="232" fontSize="10" fill={t.faint}>{x}</text>)}
        </svg>
      </div>
    </div>
  );
}

function ActivityFeed({ t, onAction }: { t: Theme; onAction: (s: string) => void }) {
  return (
    <div className="rounded-2xl p-6 flex flex-col h-full" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[20px]" style={{ letterSpacing: '-.01em' }}>
          <span className="font-semibold" style={{ color: t.ink }}>Activity.</span>{' '}
          <span className="font-medium" style={{ color: t.subink }}>Insights for you.</span>
        </h3>
        <button type="button" onClick={() => onAction('Orders link held in comparison frame.')} className="text-[13px] font-medium" style={{ color: t.blue }}>View all</button>
      </div>
      <ul className="space-y-0.5 flex-1">
        {MOCK_ACTIVITY.map((it) => {
          const Icon = it.icon;
          return (
            <li key={`${it.kind}-${it.title}`}>
              <button type="button" onClick={() => onAction(`${it.title} link held in comparison frame.`)} className={cn('w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left', t.hoverWash)}>
                <span className="w-9 h-9 rounded-xl inline-flex items-center justify-center flex-shrink-0" style={{ background: t.cardSoft }}><Icon className="w-4 h-4" style={{ color: t.subink }} /></span>
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] truncate" style={{ color: t.ink }}>{it.title}</span><span className="block text-[12px] truncate" style={{ color: t.subink }}>{it.detail}</span></span>
                <span className="text-[11.5px] flex-shrink-0" style={{ color: t.faint }}>{it.age}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TopProjects({ t, onAction }: { t: Theme; onAction: (s: string) => void }) {
  return (
    <div className="rounded-2xl p-6 flex flex-col h-full" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[20px]"><span className="font-semibold" style={{ color: t.ink }}>Top projects.</span>{' '}<span className="font-medium" style={{ color: t.subink }}>Ranked by sales.</span></h3>
        <button type="button" onClick={() => onAction('Releases link held in comparison frame.')} className="text-[13px] font-medium" style={{ color: t.blue }}>View all</button>
      </div>
      <ul className="flex-1">
        {MOCK_PROJECTS.map((a, i) => (
          <li key={a.albumId} style={{ borderTop: i ? `1px solid ${t.hairline}` : undefined }}>
            <button type="button" onClick={() => onAction(`${a.title} admin release link held in comparison frame.`)} className={cn('w-full flex items-center gap-3 -mx-2 px-2 py-2.5 rounded-xl text-left', t.hoverWash)}>
              <span className="text-[12px] font-semibold w-4 text-center" style={{ color: t.faint }}>{i + 1}</span>
              <span className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: t.cardSoft }}><Music2 className="w-4 h-4" style={{ color: t.subink }} /></span>
              <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold truncate" style={{ color: t.ink }}>{a.title}</span><span className="block text-[12px]" style={{ color: t.subink }}>{a.artist}</span></span>
              <span className="text-right"><span className="block text-[13.5px] font-semibold" style={{ color: t.ink }}>{money(a.revenueCents)}</span><span className="block text-[11px]" style={{ color: t.subink }}>{a.units} units</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DashboardBody({ preset, t, onAction, isSuperAdmin }: { preset: Preset; t: Theme; onAction: (msg: string) => void; isSuperAdmin: boolean }) {
  return (
    <div className="flex flex-col gap-5" data-testid="artist-dashboard-body">
      {/* Normal Super-admin mode: no greeting — the artist identity header above
          already provides context. The artist greeting appears only in the
          prototype's Artist view. Range controls + View orders stay aligned
          cleanly to the top-right either way. */}
      <div className={cn('flex gap-3 flex-wrap', isSuperAdmin ? 'items-center justify-end' : 'items-end justify-between')}>
        {!isSuperAdmin && (
          <div>
            <h1 className="text-[30px] font-semibold" style={{ letterSpacing: '-.02em', lineHeight: 1.12, color: t.ink }}>Good afternoon, {MOCK_PERSON.name}</h1>
            <p className="text-[14px] mt-1" style={{ color: t.subink }}>Nothing needs you right now — your catalog is running clean.</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <RangeSwitcher value={preset} onChange={() => {}} t={t} />
          <button type="button" onClick={() => onAction('Orders link held in comparison frame.')} className="inline-flex items-center gap-2 text-[14px] font-medium rounded-full px-4 h-9 text-white" style={{ background: BLUE }}>
            <Banknote className="w-4 h-4" />View orders
          </button>
        </div>
      </div>
      <section className="w-full flex items-center justify-between rounded-2xl px-5 py-3.5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <span className="flex items-center gap-2.5 text-[13px] font-semibold" style={{ color: t.ink }}><CheckCircle2 className="w-4 h-4" style={{ color: t.ready }} />You're all caught up.</span>
        <span className="text-[12.5px]" style={{ color: t.subink }}>New work appears here the moment it needs you.</span>
      </section>
      <KpiStrip preset={preset} t={t} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
        <div className="xl:col-span-2 min-w-0"><TrendPanel preset={preset} t={t} /></div>
        <div className="max-h-[420px]"><ActivityFeed t={t} onAction={onAction} /></div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-stretch">
        <div className="xl:col-span-2 min-w-0"><TopProjects t={t} onAction={onAction} /></div>
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl p-6 flex flex-col h-full" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[17px] font-semibold" style={{ color: t.ink }}>Where sales come from.</h3>
              <button type="button" onClick={() => onAction('Acquisition link held in comparison frame.')} className="text-[13px] font-medium" style={{ color: t.blue }}>View all</button>
            </div>
            <p className="flex-1 flex items-center text-[13px] leading-relaxed" style={{ color: t.subink }}>As orders come in, you'll see the split between your GoodTunes store, Shopify, and campaign traffic here.</p>
          </div>
          <div className="rounded-2xl p-6" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <h3 className="text-[17px] font-semibold mb-3" style={{ color: t.ink }}>Giving.</h3>
            <p className="text-[13px] leading-relaxed" style={{ color: t.subink }}>When a release supports a cause through GoodDeed®, the amount raised from your sales shows up here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Account section primitives (verbatim from Canon) ────────────────────

function SectionCard({ t, children, testid, className, allowOverflow = false }: { t: Theme; children: React.ReactNode; testid?: string; className?: string; allowOverflow?: boolean }) {
  return (
    <AppleCard
      className={cn('group rounded-2xl', allowOverflow ? 'overflow-visible' : 'overflow-hidden', className)}
      style={{ backgroundColor: t.card, borderColor: t.hairline }}
      data-testid={testid}
    >
      {children}
    </AppleCard>
  );
}

function CardHead({ t, title, action }: { t: Theme; title: string; action?: React.ReactNode }) {
  return (
    <AppleSectionHeader title={title} action={action} className="text-foreground" />
  );
}

function QuietAction({ t, icon: Icon, children, onClick, testid, danger, className }: { t: Theme; icon?: typeof Plus; children: React.ReactNode; onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void; testid?: string; danger?: boolean; className?: string }) {
  return (
    <AppleQuietAction icon={Icon} onClick={onClick} className={cn(className, danger && 'text-destructive')} data-testid={testid}>{children}</AppleQuietAction>
  );
}

function FieldRow({ t, label, value, quiet, action }: { t: Theme; label: React.ReactNode; value: React.ReactNode; quiet?: boolean; action?: React.ReactNode }) {
  return (
    <div className="group/field-row relative flex items-center gap-4 px-6 h-12" style={{ borderTop: `1px solid ${t.hairline}` }}>
      <div className="text-[13px] flex-shrink-0" style={{ color: t.subink, width: 150 }}>{label}</div>
      <div className={cn('min-w-0 flex-1 truncate text-right text-[14px]', action ? 'pr-40' : undefined)} style={{ color: quiet ? t.faint : t.ink, fontStyle: quiet ? 'italic' : undefined, fontWeight: quiet ? 400 : 500 }}>
        {value}
      </div>
      {action && <div className="absolute right-6 flex items-center justify-end opacity-100 transition-opacity md:opacity-0 md:group-hover/field-row:opacity-100 md:group-focus-within/field-row:opacity-100">{action}</div>}
    </div>
  );
}

function SkeletonBar({ t, w, h = 12 }: { t: Theme; w: number | string; h?: number }) {
  return <span className="inline-block rounded-full animate-pulse" style={{ backgroundColor: t.cardSoft, width: w, height: h }} />;
}

// ─── Disclosure (verbatim from Canon) ────────────────────────────────────
function Disclosure({ t, label, children, testid, iconOnly, ariaLabel }: { t: Theme; label: string; children: React.ReactNode; testid?: string; iconOnly?: boolean; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const panelId = useId();

  const cancelClose = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { cancelClose(); closeTimer.current = window.setTimeout(() => setOpen(false), 120); };
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 24);
    const estimatedHeight = 270;
    const left = Math.min(Math.max(12, r.right - width), window.innerWidth - width - 12);
    let top = r.bottom + 6;
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, r.top - estimatedHeight - 6);
    setPos({ top, left });
  };
  const openNow = () => { cancelClose(); place(); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onScroll = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);
  useEffect(() => () => cancelClose(), []);

  return (
    <span ref={wrapRef} className="relative inline-flex" onMouseEnter={iconOnly ? undefined : openNow} onMouseLeave={iconOnly ? undefined : scheduleClose}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (iconOnly ? openNow() : (open ? setOpen(false) : openNow()))}
        onFocus={openNow}
        onBlur={iconOnly ? undefined : scheduleClose}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        className={cn(iconOnly ? 'flex h-8 w-8 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2' : 'inline-flex items-center gap-1 rounded-full px-2 h-6 text-[12px] font-medium transition-colors focus:outline-none focus-visible:ring-2', t.hoverWash)}
        style={{ color: t.subink }}
        data-testid={testid}
      >
        {iconOnly ? <Info className="h-4 w-4" /> : <>{label}<ChevronDown className="w-3 h-3 transition-transform" style={{ color: t.faint, transform: open ? 'rotate(180deg)' : 'none' }} /></>}
      </button>
      {open && pos && (
        <span
          id={panelId}
          role="tooltip"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-[65] block min-w-0 rounded-xl p-3 text-left normal-case"
          style={{ top: pos.top, left: pos.left, width: 'min(320px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)', backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', fontStyle: 'normal', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
          data-testid={testid ? `${testid}-popover` : undefined}
        >
          {children}
        </span>
      )}
    </span>
  );
}

// ─── Toast (verbatim from Canon) ─────────────────────────────────────────
function Toast({ t, message }: { t: Theme; message: string }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-full px-4 h-10 shadow-xl" style={{ bottom: 24, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }} role="status" aria-live="polite" data-testid="toast">
      <Check className="w-4 h-4" style={{ color: t.ready }} />
      <span className="text-[13px] font-medium" style={{ color: t.ink }}>{message}</span>
    </div>
  );
}

// ─── Dialog scaffold (verbatim from Canon) ───────────────────────────────
function Dialog({
  t, title, subtitle, onClose, children, footer, footerOverlay = false, size = 'md', back, testid,
}: {
  t: Theme; title: string; subtitle?: React.ReactNode; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg';
  footerOverlay?: boolean; back?: () => void; testid?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const width = size === 'sm' ? 420 : size === 'lg' ? 620 : 520;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0" style={{ backgroundColor: t.overlay, backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative w-full rounded-2xl overflow-hidden focus:outline-none" style={{ maxWidth: width, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }} data-testid={testid}>
        <div className="flex items-start gap-3 px-6 pt-5 pb-4">
          {back && (
            <button type="button" onClick={back} className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Back" data-testid="dialog-back">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-[28px] font-semibold leading-tight" style={{ color: t.ink, letterSpacing: '-0.025em' }}>{title}</h2>
            {subtitle && <div className="mt-1 text-[16px] leading-snug" style={{ color: t.subink }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }} aria-label="Close" data-testid="dialog-close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className={cn('px-6 pb-2 max-h-[62vh] overflow-y-auto', footerOverlay && 'relative')}>{children}</div>
        {footer && (
          <div
            className={cn(
              'flex items-center justify-end gap-1 px-6 py-4',
              footerOverlay ? 'absolute inset-x-0 bottom-0 z-20' : 'mt-2',
            )}
            style={footerOverlay ? {
              backgroundColor: t === THEMES.dark ? 'rgba(29,29,31,0.82)' : 'rgba(255,255,255,0.82)',
              borderTop: `1px solid ${t.hairline}`,
              backdropFilter: 'blur(18px) saturate(140%)',
              WebkitBackdropFilter: 'blur(18px) saturate(140%)',
              boxShadow: t === THEMES.dark ? '0 -18px 34px rgba(29,29,31,0.48)' : '0 -18px 34px rgba(255,255,255,0.48)',
            } : { borderTop: `1px solid ${t.hairline}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmButton({ t, label, onClick, ready, testid, danger, className }: { t: Theme; label: string; onClick: () => void; ready: boolean; testid?: string; danger?: boolean; className?: string }) {
  const activeColor = danger ? t.critical : t.blue;
  return (
    <button type="button" onClick={onClick} disabled={!ready} className={cn('h-9 px-4 rounded-full text-[13px] font-semibold transition-all', className)} style={ready ? { backgroundColor: activeColor, color: '#ffffff' } : { backgroundColor: 'transparent', color: t.subink, border: `1px solid ${t.hairline}`, cursor: 'not-allowed' }} data-testid={testid}>
      {label}
    </button>
  );
}

function CancelButton({ t, onClick, label = 'Cancel', testid, className }: { t: Theme; onClick: () => void; label?: string; testid?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-9 px-3 rounded-full text-[13px] font-medium transition-colors', t.hoverWash, className)} style={{ color: t.subink }} data-testid={testid}>
      {label}
    </button>
  );
}

function Field({ t, label, children, hint }: { t: Theme; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block py-2">
      <div className="mb-1.5">
        <span className="text-[12.5px] font-medium" style={{ color: t.subink }}>{label}</span>
      </div>
      {children}
      {hint && <span className="block mt-1 text-[11.5px] leading-snug" style={{ color: t.faint }}>{hint}</span>}
    </label>
  );
}

function inputStyle(t: Theme): React.CSSProperties {
  return { backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}`, color: t.ink };
}

function ReleasesWall({ t, releases, onNewRelease, onOpenRelease, onDuplicateRelease, onDeleteRelease }: {
  t: Theme;
  releases: AdminRelease[];
  onNewRelease: () => void;
  onOpenRelease: (id: string) => void;
  onDuplicateRelease: (release: AdminRelease) => void;
  onDeleteRelease: (release: AdminRelease) => void;
}) {
  return (
    <section data-testid="tab-view-releases">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-[30px] font-semibold leading-tight" style={{ color: t.ink, letterSpacing: '-0.03em' }}>
          Releases. <span className="font-normal" style={{ color: t.subink }}>Every record you&apos;ve made.</span>
        </h2>
        <button type="button" onClick={onNewRelease} className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-colors" style={{ backgroundColor: 'transparent', border: `1px solid ${t.subink}`, color: t.ink }} data-testid="button-new-release">
          <Plus className="h-4 w-4" style={{ color: t.subink }} />New Release
        </button>
      </div>
      {releases.length === 0 ? (
        <div className="mt-6 rounded-2xl px-6 py-12 text-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="wall-empty">
          <Disc3 className="mx-auto h-8 w-8" style={{ color: t.faint }} />
          <p className="mt-3 text-[15px] font-semibold" style={{ color: t.ink }}>No releases yet.</p>
          <p className="mt-1 text-[13px]" style={{ color: t.subink }}>Start your first with New Release, top right.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {releases.map((release) => (
            <ReleaseWallCard key={release.id} t={t} release={release} onOpen={() => onOpenRelease(release.id)} onDuplicate={() => onDuplicateRelease(release)} onDelete={() => onDeleteRelease(release)} />
            ))}
        </div>
      )}
    </section>
  );
}

function ReleaseWallCard({ t, release, onOpen, onDuplicate, onDelete }: { t: Theme; release: AdminRelease; onOpen: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const close = () => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} className={cn('group relative rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2', t.hoverWash)} style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid={`row-release-${release.id}`}>
      <div className="relative aspect-square w-full rounded-t-2xl" style={{ backgroundColor: t.cardSoft }}>
        {release.cover ? <img src={release.cover} alt={`${release.title} artwork`} className="absolute inset-0 h-full w-full rounded-t-[15px] object-cover" draggable={false} /> : <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-t-[15px]"><Disc3 className="h-14 w-14" style={{ color: t.faint, strokeWidth: 1.25 }} /></div>}
        <button ref={triggerRef} type="button" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} className={cn('absolute right-3 top-3 z-30 flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100', open && 'opacity-100')} style={{ backgroundColor: 'rgba(255,255,255,0.9)', color: '#1d1d1f', backdropFilter: 'blur(8px)' }} aria-label={`Actions for ${release.title}`} aria-expanded={open} data-open={open} data-testid={`button-release-menu-${release.id}`}><MoreHorizontal className="h-4 w-4" strokeWidth={2.25} /></button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={(event) => { event.stopPropagation(); close(); }} aria-hidden />
            <div className="absolute right-3 top-12 z-50 w-44 overflow-hidden rounded-xl py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }} role="menu" data-testid={`menu-release-${release.id}`}>
              <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); close(); onDuplicate(); }} className={cn('flex h-9 w-full items-center px-3 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} data-testid={`menuitem-duplicate-release-${release.id}`}>Duplicate release</button>
              <button type="button" role="menuitem" onClick={(event) => { event.stopPropagation(); close(); onDelete(); }} className={cn('flex h-9 w-full items-center px-3 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.critical }} data-testid={`menuitem-delete-release-${release.id}`}>Delete release…</button>
            </div>
          </>
        )}
      </div>
      <div className="px-4 pb-4 pt-3">
        <h3 className="truncate text-[15.5px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.015em' }}>{release.title}</h3>
        <p className="mt-1.5 truncate text-[12px]" style={{ color: t.subink }}>{RELEASE_FORMATS.find((format) => format.id === release.format)?.label} {release.status.toLowerCase()}</p>
      </div>
    </div>
  );
}

const RELEASE_DETAIL_TABS = ['Dashboard', 'Package', 'Assets', 'Details', 'Store', 'Payments'] as const;
type ReleaseDetailTab = (typeof RELEASE_DETAIL_TABS)[number];

function ReleaseDashboard({
  t,
  release,
  formatLabel,
  onOpenTab,
}: {
  t: Theme;
  release: AdminRelease;
  formatLabel: string;
  onOpenTab: (tab: ReleaseDetailTab) => void;
}) {
  const [range, setRange] = useState('30d');
  const metrics = [
    { label: `Sales · ${range === 'All' ? 'lifetime' : range}`, value: '$0', note: '0 copies sold' },
    { label: 'Sales · lifetime', value: '$0', note: '0 copies sold' },
    { label: `Fan plays · ${range === 'All' ? 'lifetime' : range}`, value: '32', note: 'Across the GoodTunes® Player' },
    { label: 'Listeners', value: '—', note: 'Release-level total unavailable' },
    { label: 'Buyers', value: '—', note: 'Release-level total unavailable' },
    { label: 'Certified GoodDeeds®', value: '0', note: 'One per copy sold' },
  ];
  return <div data-testid="release-dashboard">
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }} aria-label="Release dashboard range">
        {['Today', '7d', '30d', '90d', 'All'].map((item) => <button key={item} type="button" onClick={() => setRange(item)} className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ backgroundColor: range === item ? t.card : 'transparent', boxShadow: range === item ? t.pillShadow : undefined, color: range === item ? t.ink : t.subink }} aria-pressed={range === item}>{item}</button>)}
      </div>
      <button type="button" className={cn('inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold', t.hoverWash)} style={{ border: `1px solid ${t.hairline}`, color: t.ink }}><Receipt className="h-3.5 w-3.5" />View orders</button>
    </div>

    <button type="button" onClick={() => onOpenTab('Assets')} className={cn('mt-5 flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left', t.hoverWash)} style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <span><span className="text-[14px] font-semibold" style={{ color: t.ink }}>{formatLabel}</span><span className="ml-2 text-[12px]" style={{ color: t.subink }}>Production format</span></span>
      <span className="inline-flex items-center gap-2 text-[13px]" style={{ color: t.subink }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.subink }} />{release.status}<ChevronRight className="h-4 w-4" /></span>
    </button>

    <div className="mt-5">
      <ArtistDashboardNextStepsStrip onUploadFiles={() => onOpenTab('Assets')} />
    </div>

    <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric, index) => <div key={`${metric.label}-${index}`} className="min-w-0 rounded-2xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>{metric.label}</p>
        <p className="mt-2 text-[28px] font-semibold tabular-nums" style={{ color: t.ink }}>{metric.value}</p>
        <p className="mt-1 min-h-8 text-[11.5px] leading-snug" style={{ color: t.subink }}>{metric.note}</p>
      </div>)}
    </div>

    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
      <div className="rounded-2xl p-6" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[21px] font-semibold" style={{ color: t.ink }}>Performance. <span className="font-normal" style={{ color: t.subink }}>CALIFORNIALAND over time.</span></h2>
          <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }}>
            {['Plays', 'Revenue', 'Orders'].map((item, index) => <button key={item} type="button" className="rounded-full px-3 py-1.5 text-[11.5px] font-medium" style={{ backgroundColor: index === 0 ? t.card : 'transparent', boxShadow: index === 0 ? t.pillShadow : undefined, color: index === 0 ? t.ink : t.subink }}>{item}</button>)}
          </div>
        </div>
        <div className="mt-6 flex h-56 items-end">
          <div className="relative h-full w-full" style={{ borderLeft: `1px solid ${t.hairline}`, borderBottom: `1px solid ${t.hairline}` }}>
            {[25, 50, 75].map((top) => <span key={top} className="absolute left-0 right-0" style={{ top: `${top}%`, borderTop: `1px dashed ${t.hairline}` }} />)}
            <svg viewBox="0 0 700 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Release performance trend">
              <path d="M0 188 C90 184 120 170 190 174 S310 142 370 150 S480 106 545 118 S640 76 700 88" fill="none" stroke={t.blue} strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        </div>
        <p className="mt-3 text-[11.5px]" style={{ color: t.subink }}>32 recorded fan plays. Daily source values are not exposed in this mock.</p>
      </div>

      <div className="rounded-2xl p-6" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-[21px] font-semibold" style={{ color: t.ink }}>Activity. <span className="font-normal" style={{ color: t.subink }}>This release only.</span></h2><button type="button" className={cn('text-[12px] font-medium', t.hoverWash)} style={{ color: t.blue }}>View all</button></div>
        <div className="flex min-h-52 flex-col items-center justify-center text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: t.cardSoft, color: t.subink }}><TrendingUp className="h-4 w-4" /></div>
          <p className="mt-3 text-[13px] font-semibold" style={{ color: t.ink }}>No recent activity</p>
          <p className="mt-1 max-w-56 text-[12px]" style={{ color: t.subink }}>Orders, production updates, and certificate events for CALIFORNIALAND will appear here.</p>
        </div>
      </div>
    </div>

    <div className="mt-5">
      <div className="rounded-2xl p-6" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <h2 className="text-[21px] font-semibold" style={{ color: t.ink }}>Sales sources. <span className="font-normal" style={{ color: t.subink }}>Where this release sells.</span></h2>
        <div className="mt-5 space-y-4">
          {['GoodTunes® Direct', 'Shopify'].map((source) => <div key={source} className="flex items-center justify-between gap-4"><span className="text-[13px]" style={{ color: t.subink }}>{source}</span><span className="text-[13px] font-semibold" style={{ color: t.ink }}>—</span></div>)}
        </div>
        <p className="mt-5 text-[11.5px]" style={{ color: t.subink }}>No verified channel totals are available.</p>
      </div>
    </div>
  </div>;
}

const VINYL_AUDIO_SIDES = [
  {
    label: 'Side A',
    duration: '18:09',
    tracks: [
      ['A1', 'Welcome to the Dream', '2:32'],
      ['A2', "Ramblin'", '3:41'],
      ['A3', 'Say It In My Skirt', '2:31'],
      ['A4', 'Take Me Into the Sunshine', '2:51'],
      ['A5', 'Right On Hollywood', '3:14'],
      ['A6', 'Life & Times of a Wannabe Rockstar', '3:10'],
    ],
  },
  {
    label: 'Side B',
    duration: '21:18',
    tracks: [
      ['B1', 'In the Darkness of the Desert', '3:54'],
      ['B2', 'Tequila Tears', '3:15'],
      ['B3', 'Devil Wind', '3:57'],
      ['B4', 'Run For Cover', '3:11'],
      ['B5', 'Heaven Take Me Up', '4:49'],
      ['B6', 'Dream (Reprise)', '2:02'],
    ],
  },
] as const;

function VinylAudioPanel({ t }: { t: Theme }) {
  const checks = [
    ['Source format', 'Lossless WAV'],
    ['Bit depth', '24-bit · minimum 24-bit'],
    ['Sample rate', '48 kHz · minimum 44.1 kHz'],
    ['Album consistency', 'One sample rate throughout'],
    ['Longest side', '21:18 · under the 22:00 maximum'],
  ];
  return <div className="mt-5 space-y-5" data-testid="vinyl-audio-panel">
    <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
        <div>
          <p className="text-[15px] font-semibold" style={{ color: t.ink }}>MRP audio check</p>
          <p className="mt-1 text-[12px]" style={{ color: t.subink }}>Checked against Memphis Record Pressing’s configured cutting requirements.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ backgroundColor: `color-mix(in srgb, ${t.ready} 12%, transparent)`, color: t.ready }}><CheckCircle2 className="h-3.5 w-3.5" />All 5 checks passed</span>
      </div>
      <div>
        {checks.map(([label, value], index) => <div key={label} className="flex min-h-14 items-center justify-between gap-4 px-5 py-3" style={{ borderBottom: index < checks.length - 1 ? `1px solid ${t.hairline}` : undefined }}>
          <span className="text-[12.5px]" style={{ color: t.subink }}>{label}</span>
          <span className="inline-flex items-center gap-1.5 text-right text-[12.5px] font-medium" style={{ color: t.ink }}><Check className="h-3.5 w-3.5" style={{ color: t.ready }} />{value}</span>
        </div>)}
      </div>
    </div>

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {VINYL_AUDIO_SIDES.map((side) => <div key={side.label} className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div><p className="text-[15px] font-semibold" style={{ color: t.ink }}>{side.label}</p><p className="mt-0.5 text-[11.5px]" style={{ color: t.subink }}>6 tracks · WAV · 24-bit / 48 kHz</p></div>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: t.ready }}><CheckCircle2 className="h-3.5 w-3.5" />{side.duration}</span>
        </div>
        <div>
          {side.tracks.map(([number, title, duration], index) => <div key={number} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3" style={{ borderBottom: index < side.tracks.length - 1 ? `1px solid ${t.hairline}` : undefined }}>
            <span className="text-[11.5px] font-semibold tabular-nums" style={{ color: t.faint }}>{number}</span>
            <div className="min-w-0"><p className="truncate text-[13px] font-medium" style={{ color: t.ink }}>{title}</p><p className="mt-0.5 text-[10.5px]" style={{ color: t.subink }}>Lossless WAV · 24-bit · 48 kHz</p></div>
            <span className="inline-flex items-center gap-2 text-[11.5px] tabular-nums" style={{ color: t.subink }}>{duration}<Check className="h-3.5 w-3.5" style={{ color: t.ready }} /></span>
          </div>)}
        </div>
      </div>)}
    </div>
  </div>;
}

function PlayerArtPanel({ t, release }: { t: Theme; release: AdminRelease }) {
  return <div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="player-art-panel">
    <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,420px)_1fr]">
      <div className="aspect-square overflow-hidden" style={{ backgroundColor: t.cardSoft }}>
        <img src={release.cover ?? californialandCover} alt={`${release.title} player artwork`} className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-col justify-center px-7 py-8 md:px-10">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: t.faint }}>GoodTunes® Player</span>
        <h3 className="mt-3 text-[24px] font-semibold tracking-tight" style={{ color: t.ink }}>Album artwork</h3>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed" style={{ color: t.subink }}>This is what fans see while they browse and play {release.title}. It uses the release artwork as supplied—there is no press template to meet.</p>
        <div className="mt-6 flex items-center gap-2 text-[12.5px] font-medium" style={{ color: t.ready }}><CheckCircle2 className="h-4 w-4" />Artwork added</div>
      </div>
    </div>
  </div>;
}

function PlayerBonusRow({
  t,
  label,
  detail,
  action,
  accept,
  multiple,
  Icon,
  divided,
}: {
  t: Theme;
  label: string;
  detail: string;
  action: string;
  accept: string;
  multiple?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
  divided?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<string[]>([]);
  return <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5" style={{ borderBottom: divided ? `1px solid ${t.hairline}` : undefined }}>
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: t.cardSoft, color: t.subink }}><Icon className="h-4 w-4" /></div>
      <div><p className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{label}</p><p className="mt-0.5 text-[11.5px]" style={{ color: t.subink }}>{files.length ? `${files.length} added · ${files.join(', ')}` : `None added · ${detail}`}</p></div>
    </div>
    <button type="button" onClick={() => inputRef.current?.click()} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium', t.hoverWash)} style={{ color: t.blue }}><Plus className="h-3.5 w-3.5" />{action}</button>
    <input ref={inputRef} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(event) => { setFiles(Array.from(event.target.files ?? []).map((file) => file.name)); event.currentTarget.value = ''; }} />
  </div>;
}

function PlayerAudioPanel({ t }: { t: Theme }) {
  const tracks = VINYL_AUDIO_SIDES.reduce<Array<{ number: number; title: string; duration: string }>>((all, side) => [
    ...all,
    ...side.tracks.map((track, trackIndex) => ({ number: all.length + trackIndex + 1, title: track[1], duration: track[2] })),
  ], []);
  return <div className="mt-5 space-y-7" data-testid="player-audio-panel">
    <section>
      <div className="mb-3">
        <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: t.ink }}>Tracks. <span className="font-normal" style={{ color: t.subink }}>What fans hear.</span></h3>
      </div>
      <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        {tracks.map((track, index) => <div key={track.number} className="grid min-h-12 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5" style={{ borderBottom: index < tracks.length - 1 ? `1px solid ${t.hairline}` : undefined }}>
          <span className="text-[11.5px] tabular-nums" style={{ color: t.faint }}>{track.number}</span>
          <span className="truncate text-[13px] font-medium" style={{ color: t.ink }}>{track.title}</span>
          <span className="text-[11.5px] tabular-nums" style={{ color: t.subink }}>{track.duration}</span>
        </div>)}
      </div>
    </section>
    <section>
      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: t.ink }}>Bonus content. <span className="font-normal" style={{ color: t.subink }}>More for listeners.</span></h3>
      <div className="mt-3 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <PlayerBonusRow t={t} label="Videos" detail="MP4, MOV, or WebM · up to 500 MB" action="Add video" accept="video/mp4,video/quicktime,video/webm" Icon={Video} divided />
        <PlayerBonusRow t={t} label="Photos" detail="JPG, PNG, or WebP · up to 8 MB" action="Add photos" accept="image/jpeg,image/png,image/webp" multiple Icon={Image} />
      </div>
    </section>
  </div>;
}

function GoodDeedAssetPanel({ t, release }: { t: Theme; release: AdminRelease }) {
  const [paperSize, setPaperSize] = useState<'letter' | 'a4'>('letter');
  const preview = paperSize === 'letter' ? goodDeedLetterPreview : goodDeedA4Preview;
  const pdf = paperSize === 'letter' ? goodDeedLetterPdf : goodDeedA4Pdf;
  const dimensions = paperSize === 'letter' ? '8.5 × 11 in · 612 × 792 pt' : '210 × 297 mm · 595.28 × 841.89 pt';
  return <div data-testid="gooddeed-assets">
    <div className="flex justify-end">
      <div className="inline-flex gap-1 rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="GoodDeed paper size">
        {([
          ['letter', 'US Letter'],
          ['a4', 'A4'],
        ] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={paperSize === value} onClick={() => setPaperSize(value)} className="h-8 rounded-full px-3 text-[12px] font-medium" style={{ backgroundColor: paperSize === value ? t.card : 'transparent', boxShadow: paperSize === value ? t.pillShadow : undefined, color: paperSize === value ? t.ink : t.subink }} data-testid={`tab-gooddeed-${value}`}>{label}</button>)}
      </div>
    </div>
    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(360px,1.15fr)_minmax(280px,.85fr)]">
      <div className="flex min-h-[520px] items-center justify-center overflow-hidden rounded-2xl p-7" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
        <img src={preview} alt={`Official GoodDeed ${paperSize === 'letter' ? 'US Letter' : 'A4'} template preview`} className="max-h-[700px] w-auto max-w-full object-contain" style={{ boxShadow: '0 12px 36px rgba(0,0,0,.12)' }} />
      </div>
      <div className="overflow-hidden rounded-2xl self-start" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="px-5 py-5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: t.faint }}>Artwork source</p>
          <div className="mt-3 flex items-center gap-3">
            <img src={release.cover ?? californialandCover} alt={`${release.title} album artwork`} className="h-16 w-16 rounded-xl object-cover" />
            <div><p className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{release.title}</p><p className="mt-1 text-[11.5px]" style={{ color: t.subink }}>Album cover art</p></div>
          </div>
        </div>
        {[
          ['Paper size', paperSize === 'letter' ? 'US Letter' : 'A4'],
          ['Page box', dimensions],
          ['Certificate data', 'Owner · number · QR'],
          ['Output', 'Generated PDF'],
        ].map(([label, value], index, rows) => <div key={label} className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: index < rows.length - 1 ? `1px solid ${t.hairline}` : undefined }}><span className="text-[12px]" style={{ color: t.subink }}>{label}</span><span className="text-right text-[12px] font-medium" style={{ color: t.ink }}>{value}</span></div>)}
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <p className="text-[11.5px] leading-relaxed" style={{ color: t.subink }}>The document shown uses sample owner data so the true template can be reviewed before any fan certificate is issued.</p>
          <a href={pdf} target="_blank" rel="noreferrer" className={cn('mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium', t.hoverWash)} style={{ color: t.blue }} data-testid="link-gooddeed-pdf"><Eye className="h-3.5 w-3.5" />Open PDF preview</a>
        </div>
      </div>
    </div>
  </div>;
}

function ReleaseStore({ t, release }: { t: Theme; release: AdminRelease }) {
  const [launchDate, setLaunchDate] = useState('');
  const [launchDraft, setLaunchDraft] = useState('');
  const [editingLaunch, setEditingLaunch] = useState(false);
  return <div data-testid="release-store">
    <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Store. <span className="font-normal" style={{ color: t.subink }}>How fans buy this release.</span></h2>
    <p className="mt-1 text-[13px]" style={{ color: t.subink }}>The artist’s connected storefronts, with selling status for this release.</p>
    <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="release-store-destinations">
      <div className="group/release-goodtunes overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}><p className="text-[15px] font-semibold" style={{ color: t.ink }}>GoodTunes store</p></div>
        <div className="flex min-h-24 items-center justify-between gap-4 px-5 py-4">
          <ServiceIdentity
            carrier="brand"
            icon={<img src={goodtunesLogo} alt="" style={{ filter: 'brightness(0) invert(1)' }} />}
            title={`get.goodtunes.music/${MOCK_ARTIST_ACCOUNT.slug}`}
            secondary="GoodTunes® Direct is not selected for this release"
          />
          <span className="text-[12px] font-medium" style={{ color: t.subink }}>Not selected</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}><p className="text-[15px] font-semibold" style={{ color: t.ink }}>Shopify store</p></div>
        <div className="flex min-h-24 items-center justify-between gap-4 px-5 py-4">
          <ServiceIdentity carrier="brand" icon={<img src={shopifyBagLogo} alt="" />} title={`${MOCK_PERSON.name} on Shopify`} secondary="Connected artist storefront" />
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: t.ready }}><CheckCircle2 className="h-3.5 w-3.5" />Selling</span>
        </div>
      </div>
    </div>
    <h3 className="mt-8 text-[20px] font-semibold tracking-tight" style={{ color: t.ink }}>Release availability. <span className="font-normal" style={{ color: t.subink }}>Publishing details for {release.title}.</span></h3>
    <div className="mt-3 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="grid min-h-[76px] grid-cols-1 items-center gap-4 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(280px,1fr)]">
        <div><p className="text-[13.5px] font-semibold" style={{ color: t.ink }}>Launch</p><p className="mt-1 text-[11.5px]" style={{ color: t.subink }}>Pre-save and release timing.</p></div>
        <div className="flex items-center justify-start gap-2 md:justify-end">
          {editingLaunch ? <>
            <input type="date" value={launchDraft} onChange={(event) => setLaunchDraft(event.target.value)} className="h-9 rounded-xl px-3 text-[13px] outline-none" style={inputStyle(t)} aria-label="Release launch date" data-testid="input-release-launch-date" />
            <CancelButton t={t} onClick={() => { setLaunchDraft(launchDate); setEditingLaunch(false); }} />
            <ConfirmButton t={t} label="Save" ready={Boolean(launchDraft)} onClick={() => { if (!launchDraft) return; setLaunchDate(launchDraft); setEditingLaunch(false); }} />
          </> : <>
            <span className="text-[13px] font-medium" style={{ color: launchDate ? t.ink : t.subink }}>{launchDate ? new Date(`${launchDate}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not scheduled'}</span>
            <QuietAction t={t} icon={launchDate ? Pencil : Plus} onClick={() => { setLaunchDraft(launchDate); setEditingLaunch(true); }} testid="button-edit-release-launch">{launchDate ? 'Edit' : 'Set date'}</QuietAction>
          </>}
        </div>
      </div>
    </div>
  </div>;
}

type VinylArtPiece = {
  label: string;
  kind: IconKind;
  image: string | null;
};

function VinylArtPieceCard({
  piece,
  t,
  onReview,
  onUpload,
  onNotice,
}: {
  piece: VinylArtPiece;
  t: Theme;
  onReview: () => void;
  onUpload: (url: string) => void;
  onNotice: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const acceptFile = (file?: File) => {
    if (!file) return;
    onUpload(URL.createObjectURL(file));
    onNotice(`${piece.label} artwork added`);
    setMenuOpen(false);
  };
  const downloadArtwork = () => {
    if (!piece.image) return;
    const anchor = document.createElement('a');
    anchor.href = piece.image;
    anchor.download = `${piece.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-artwork`;
    anchor.click();
    setMenuOpen(false);
  };
  return <div className={cn('group relative overflow-visible rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus-within:ring-2', t.hoverWash)} style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
    <button
      type="button"
      onClick={piece.image ? onReview : () => inputRef.current?.click()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); acceptFile(event.dataTransfer.files?.[0]); }}
      className="block w-full overflow-hidden rounded-t-2xl text-left focus:outline-none"
      aria-label={piece.image ? `Open prepress review for ${piece.label}` : `Upload artwork for ${piece.label}`}
      data-testid={`vinyl-art-piece-${piece.kind}`}
    >
      <div className="relative aspect-[1.45/1] overflow-hidden" style={{ backgroundColor: t.cardSoft }}>
        {piece.image ? <img src={piece.image} alt={`${piece.label} artwork`} className="h-full w-full object-cover" /> : <div className="flex h-full flex-col items-center justify-center gap-3" style={{ color: t.subink }}><ComponentIcon kind={piece.kind} color={t.faint} fill={t.cardSoft} size={48} /><span className="text-[12px]">Drop file or tap to upload</span></div>}
      </div>
      <div className="px-4 py-3.5">
        <p className="text-[14px] font-semibold" style={{ color: t.ink }}>{piece.label}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px]" style={{ color: t.subink }}><Image className="h-3 w-3" />{piece.image ? 'Custom art uploaded' : 'No custom art yet'}</p>
      </div>
    </button>
    <input ref={inputRef} type="file" accept=".pdf,image/*" className="sr-only" onChange={(event) => { acceptFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
    <div className="absolute right-3 top-3 z-20">
      <button type="button" onClick={() => setMenuOpen((open) => !open)} className="flex h-8 w-8 items-center justify-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100" style={{ backgroundColor: t.card, color: t.subink }} aria-label={`More options for ${piece.label}`} aria-expanded={menuOpen}><MoreHorizontal className="h-4 w-4" /></button>
      {menuOpen && <>
        <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} aria-label="Close artwork menu" />
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} role="menu">
          <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => inputRef.current?.click()} role="menuitem"><Upload className="h-3.5 w-3.5" style={{ color: t.subink }} />{piece.image ? 'Replace file…' : 'Upload artwork…'}</button>
          {piece.image && <>
            <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setMenuOpen(false); onNotice('Artwork preview refreshed'); }} role="menuitem"><RotateCw className="h-3.5 w-3.5" style={{ color: t.subink }} />Refresh preview</button>
            <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={downloadArtwork} role="menuitem"><Download className="h-3.5 w-3.5" style={{ color: t.subink }} />Download artwork</button>
            <button type="button" className={cn('flex h-9 w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} onClick={() => { setMenuOpen(false); onNotice('Prepress report prepared'); }} role="menuitem"><FileText className="h-3.5 w-3.5" style={{ color: t.subink }} />Download report</button>
          </>}
        </div>
      </>}
    </div>
  </div>;
}

function ReleasePayments({ t, release }: { t: Theme; release: AdminRelease }) {
  const [view, setView] = useState<'plant' | 'artist'>('plant');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card');
  const isLegacy = release.id === 'california-land';
  return <div data-testid="release-payments">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Payments. <span className="font-normal" style={{ color: t.subink }}>Money for this release.</span></h2>
        <p className="mt-1 text-[13px]" style={{ color: t.subink }}>{view === 'plant' ? 'What this release owes its manufacturing partner.' : 'What this release has earned and paid to the artist.'}</p>
      </div>
      <div className="inline-flex gap-1 rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Payment direction">
        <button type="button" role="tab" aria-selected={view === 'plant'} onClick={() => setView('plant')} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[12.5px] font-medium" style={{ backgroundColor: view === 'plant' ? t.card : 'transparent', boxShadow: view === 'plant' ? t.pillShadow : undefined, color: view === 'plant' ? t.ink : t.subink }} data-testid="tab-payments-plant"><Factory className="h-3.5 w-3.5" />To the plant</button>
        <button type="button" role="tab" aria-selected={view === 'artist'} onClick={() => setView('artist')} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[12.5px] font-medium" style={{ backgroundColor: view === 'artist' ? t.card : 'transparent', boxShadow: view === 'artist' ? t.pillShadow : undefined, color: view === 'artist' ? t.ink : t.subink }} data-testid="tab-payments-artist"><User className="h-3.5 w-3.5" />To the artist</button>
      </div>
    </div>

    {view === 'plant' ? <div className="mt-7 space-y-8">
      <section>
      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: t.ink }}>Manufacturing. <span className="font-normal" style={{ color: t.subink }}>What this release owes the plant.</span></h3>
      <div className="mt-3 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-semibold" style={{ color: t.ink }}>Manufacturing payments</p>
              <span className="rounded-full px-2 py-1 text-[10.5px] font-semibold" style={{ backgroundColor: t.cardSoft, color: t.subink }}>{isLegacy ? 'Legacy project record' : 'Current estimate model'}</span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: t.subink }}>{isLegacy ? `Memphis Record Pressing · preserved from the payment path used when ${release.title} began.` : 'Manufacturing partner and payment totals appear after an estimate becomes this project.'}</p>
          </div>
          <Factory className="h-4 w-4" style={{ color: t.faint }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {[
            ['Estimated', isLegacy ? '$5,430.00' : '—'],
            ['Paid', isLegacy ? '$1,295.00' : '—'],
            ['Outstanding', isLegacy ? '$4,135.00' : '—'],
          ].map(([label, value], index) => <div key={label} className="px-5 py-4" style={{ borderRight: index < 2 ? `1px solid ${t.hairline}` : undefined }}>
            <p className="text-[11.5px]" style={{ color: t.subink }}>{label}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: t.ink }}>{value}</p>
          </div>)}
        </div>
        <p className="px-5 pb-4 text-[11.5px] leading-relaxed" style={{ color: t.subink }}>{isLegacy ? 'Legacy totals are shown as recorded. New projects take their estimated manufacturing cost from the estimate that graduated into the project.' : 'The estimated manufacturing cost remains linked to the accepted estimate; actual plant payments are recorded separately as they clear.'}</p>
      </div>
      </section>

      <section>
      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: t.ink }}>Estimate. <span className="font-normal" style={{ color: t.subink }}>The source record for this project.</span></h3>
      <div className="mt-3 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <p className="text-[15px] font-semibold" style={{ color: t.ink }}>Estimate used for this project</p>
          <p className="mt-1 text-[12px]" style={{ color: t.subink }}>{isLegacy ? 'This release predates the current estimate experience, so its original MRP estimate remains attached as a legacy record.' : 'The accepted estimate remains the source for the project’s planned configuration and estimated manufacturing cost.'}</p>
        </div>
        <div className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left" data-testid={isLegacy ? 'legacy-estimate-placeholder' : 'current-estimate-placeholder'}>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium" style={{ color: isLegacy ? t.ink : t.subink }}>{isLegacy ? 'MRP estimate · CALIFORNIALAND · Single LP' : 'No estimate attached yet'}</span>
            <span className="mt-1 block text-[11.5px]" style={{ color: t.subink }}>{isLegacy ? 'Original estimate record · legacy PDF retained' : 'When an estimate becomes this project, it appears here in the new estimate presentation.'}</span>
          </span>
          <FileText className="h-4 w-4 flex-shrink-0" style={{ color: t.faint }} />
        </div>
      </div>
      </section>

      <section>
      <h3 className="text-[20px] font-semibold tracking-tight" style={{ color: t.ink }}>Requests. <span className="font-normal" style={{ color: t.subink }}>Each payment milestone.</span></h3>
      <div className="mt-3 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <p className="text-[15px] font-semibold" style={{ color: t.ink }}>Payment requests</p>
          <p className="mt-1 text-[12px]" style={{ color: t.subink }}>GoodTunes releases each payment to the plant after it clears. Card processing is calculated separately for every milestone payment.</p>
        </div>
        {isLegacy ? [
          { label: 'Set up costs (test pressings)', amount: '$1,295.00', payer: 'Artist pays', status: 'Paid', done: true },
          { label: 'Deposit for balance of run', amount: '$5,370.00', payer: 'Artist pays', status: 'Awaiting transfer', done: false },
        ].map((request, index) => <div key={request.label} style={{ borderBottom: index === 0 ? `1px solid ${t.hairline}` : undefined }}>
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-[13px] font-medium" style={{ color: t.ink }}>{request.label}</p>
              <p className="mt-1 text-[11.5px] tabular-nums" style={{ color: t.subink }}>{request.amount} bank-transfer amount · {request.payer}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ color: request.done ? t.ready : t.blue, backgroundColor: `color-mix(in srgb, ${request.done ? t.ready : t.blue} 10%, transparent)` }}>{request.done ? <CheckCircle2 className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}{request.status}</span>
          </div>
          {!request.done && <div className="mx-5 mb-5 overflow-hidden rounded-xl" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }} data-testid="payment-method-choice">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: t.ink }}>Choose how to pay</p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: t.subink }}>Save $160.69—about 3%—when you pay by bank.</p>
              </div>
              <div className="inline-flex gap-1 rounded-full p-1" style={{ backgroundColor: t.card }} role="tablist" aria-label="Payment method">
                <button type="button" role="tab" aria-selected={paymentMethod === 'card'} onClick={() => setPaymentMethod('card')} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium" style={{ backgroundColor: paymentMethod === 'card' ? t.cardSoft : 'transparent', boxShadow: paymentMethod === 'card' ? t.pillShadow : undefined, color: paymentMethod === 'card' ? t.ink : t.subink }} data-testid="tab-method-card"><CreditCard className="h-3.5 w-3.5" />Credit card</button>
                <button type="button" role="tab" aria-selected={paymentMethod === 'bank'} onClick={() => setPaymentMethod('bank')} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium" style={{ backgroundColor: paymentMethod === 'bank' ? t.cardSoft : 'transparent', boxShadow: paymentMethod === 'bank' ? t.pillShadow : undefined, color: paymentMethod === 'bank' ? t.ink : t.subink }} data-testid="tab-method-bank"><Landmark className="h-3.5 w-3.5" />Bank transfer</button>
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 px-4 py-4">
              <div>
                <p className="text-[11.5px]" style={{ color: t.subink }}>{paymentMethod === 'card' ? 'Card total' : 'Bank-transfer total'}</p>
                <p className="mt-1 text-[22px] font-semibold tabular-nums" style={{ color: t.ink }}>{paymentMethod === 'card' ? '$5,530.69' : '$5,370.00'}</p>
                <p className="mt-1 text-[11.5px]" style={{ color: t.subink }}>{paymentMethod === 'card' ? 'Includes $160.69 card processing. The plant receives exactly $5,370.00.' : 'No processing fee. You save $160.69 by paying from your bank.'}</p>
              </div>
              <button type="button" className="h-9 rounded-full px-4 text-[12.5px] font-semibold text-white" style={{ backgroundColor: t.blue }} data-testid="button-plant-payment">{paymentMethod === 'card' ? 'Pay $5,530.69' : 'Pay $5,370.00'}</button>
            </div>
          </div>}
        </div>) : <div className="px-5 py-8 text-center"><p className="text-[14px] font-semibold" style={{ color: t.ink }}>No plant payment requests yet</p><p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Requests appear after the estimate becomes a project and the plant reaches a payment milestone.</p></div>}
      </div>
      </section>
    </div> : <div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
      <div className="grid grid-cols-1 sm:grid-cols-3">
        {['Sales received', 'Eligible payout', 'Paid to artist'].map((label, index) => <div key={label} className="px-5 py-4" style={{ borderRight: index < 2 ? `1px solid ${t.hairline}` : undefined }}>
          <p className="text-[11.5px]" style={{ color: t.subink }}>{label}</p>
          <p className="mt-1 text-[20px] font-semibold" style={{ color: t.faint }}>—</p>
        </div>)}
      </div>
      <div className="px-5 py-8 text-center" style={{ borderTop: `1px solid ${t.hairline}` }}>
        <Banknote className="mx-auto h-5 w-5" style={{ color: t.faint }} />
        <p className="mt-3 text-[14px] font-semibold" style={{ color: t.ink }}>No artist payout data attached</p>
        <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed" style={{ color: t.subink }}>{isLegacy ? 'CALIFORNIALAND is a legacy project. New releases show sales received, the amount eligible for payout, and every payment sent to the artist.' : 'Sales received, the amount eligible for payout, and every payment sent to the artist appear here when available.'}</p>
      </div>
    </div>}
  </div>;
}

type PackageSpecRow = { label: string; value: string; known?: boolean };
type PackageSpecValue = Omit<PackageSpecRow, 'label'>;

function AgreedPackageRecord({ t, release, onRequestChange }: { t: Theme; release: AdminRelease; onRequestChange: () => void }) {
  const snapshot = release.packageSnapshot;
  const snapshotExplicitlyNamesBlack = Boolean(snapshot && /\bblack\b/i.test(`${snapshot.title} ${snapshot.subtitle}`));
  const isCaliforniaLandRecord = release.id === 'california-land' && !snapshot;
  const known = (value: string): PackageSpecValue => ({ value, known: true });
  const unknown = (): PackageSpecValue => ({ value: 'Not exposed' });
  const specificationGroups: Array<{ title: string; rows: PackageSpecRow[] }> = [
    {
      title: 'Record',
      rows: [
        { label: 'Format', ...(isCaliforniaLandRecord ? known('Vinyl') : unknown()) },
        { label: 'Size', ...unknown() },
        { label: 'Disc count / configuration', ...(isCaliforniaLandRecord ? known('Single LP') : unknown()) },
        { label: 'Weight', ...unknown() },
        { label: 'Vinyl type', ...unknown() },
        { label: 'Color', ...unknown() },
        { label: 'Center label', ...unknown() },
      ],
    },
    {
      title: 'Packaging',
      rows: [
        { label: 'Jacket', ...unknown() },
        { label: 'Inner sleeve', ...unknown() },
        { label: 'Insert / add-ons', ...unknown() },
      ],
    },
    {
      title: 'Production',
      rows: [
        { label: 'Package title', ...(snapshot ? known(snapshot.title) : unknown()) },
        { label: 'Component summary', ...(snapshot ? known(snapshot.subtitle) : unknown()) },
        { label: 'Quantity / minimum run', ...(snapshot ? known(snapshot.minRun.toLocaleString()) : unknown()) },
        { label: 'Calculated / recorded unit cost', ...(snapshot ? known(`$${snapshot.unitCost.toFixed(2)} / unit`) : unknown()) },
        { label: 'Setup', ...unknown() },
        { label: 'Manufacturing total', ...(isCaliforniaLandRecord ? known('$5,430 estimated') : unknown()) },
        { label: 'Paid', ...(isCaliforniaLandRecord ? known('$1,295 paid') : unknown()) },
        { label: 'Outstanding', ...(isCaliforniaLandRecord ? known('$4,135 outstanding') : unknown()) },
        { label: 'Manufacturing partner', ...(isCaliforniaLandRecord ? known('Memphis Record Pressing') : unknown()) },
        { label: 'Estimate', ...(isCaliforniaLandRecord ? known('MRP estimate · CALIFORNIALAND · Single LP') : unknown()) },
        { label: 'Production status', ...(isCaliforniaLandRecord ? known('At press') : unknown()) },
        { label: 'Source / provenance', ...(snapshot ? known(snapshot.source) : unknown()) },
      ],
    },
  ];
  const previewStatus = snapshotExplicitlyNamesBlack ? 'Black vinyl sourced by package details' : 'Color not exposed';

  return (
    <section data-testid="agreed-package-production-record">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>Package. <span className="font-normal" style={{ color: t.subink }}>The agreed production record.</span></h2>
          <p className="mt-1 text-[13px]" style={{ color: t.subink }}>A read-only record of manufacturing values available to this release.</p>
        </div>
        <QuietAction t={t} onClick={onRequestChange} testid="button-request-package-change">Request change</QuietAction>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard t={t} className="min-w-0" testid="card-package-product-preview">
          <div className="p-5">
            <p className="text-[15px] font-semibold" style={{ color: t.ink }}>Product preview</p>
            <p className="mt-1 text-[13px]" style={{ color: t.subink }}>Jacket artwork and the available record treatment.</p>
            <div className="relative mt-6 flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl p-5" style={{ backgroundColor: t.cardSoft }}>
              <div className="relative h-48 w-48 sm:h-56 sm:w-56">
                <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full sm:h-48 sm:w-48" style={{ transform: 'translate(-12%, -50%)', background: snapshotExplicitlyNamesBlack ? '#111111' : t.card, border: `1px solid ${t.hairline}`, boxShadow: snapshotExplicitlyNamesBlack ? 'inset 0 0 0 1px rgba(255,255,255,0.18)' : `inset 0 0 0 10px ${t.cardSoft}` }} aria-label={previewStatus}>
                  <span className="absolute inset-5 rounded-full" style={{ border: `1px solid ${t.hairline}` }} />
                  <span className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: snapshotExplicitlyNamesBlack ? '#26262a' : t.cardSoft, border: `1px solid ${t.hairline}` }} />
                  <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: t.faint }} />
                </div>
                {release.cover ? (
                  <img src={release.cover} alt={`${release.title} jacket artwork`} className="absolute inset-0 h-full w-full rounded-xl object-cover" style={{ boxShadow: `0 0 0 1px ${t.hairline}, 0 18px 36px rgba(0,0,0,0.18)` }} data-testid="img-package-jacket-art" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl" style={{ backgroundColor: t.card, boxShadow: `0 0 0 1px ${t.hairline}, 0 18px 36px rgba(0,0,0,0.18)` }} data-testid="package-jacket-art-not-exposed">
                    <Image className="h-5 w-5" style={{ color: t.faint }} />
                    <span className="text-[12px]" style={{ color: t.faint }}>Jacket art not exposed</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: t.cardSoft }}>
              <Disc3 className="h-4 w-4 shrink-0" style={{ color: t.subink }} />
              <span className="text-[13px] font-medium" style={{ color: snapshotExplicitlyNamesBlack ? t.ink : t.subink }}>{previewStatus}</span>
            </div>
          </div>
        </SectionCard>
        <div className="min-w-0 space-y-4" data-testid="package-specification-groups">
          {specificationGroups.map((group) => (
            <SectionCard key={group.title} t={t} className="overflow-hidden">
              <CardHead t={t} title={group.title} />
              {group.rows.map((row) => (
                <FieldRow key={row.label} t={t} label={row.label} value={row.value} quiet={!row.known} />
              ))}
            </SectionCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReleaseDetailSurface({ t, release, onSave }: { t: Theme; release: AdminRelease; onSave: (release: AdminRelease) => void }) {
  const [tab, setTab] = useState<ReleaseDetailTab>('Dashboard');
  const [assetFormat, setAssetFormat] = useState<'GoodTunes® Player' | 'Vinyl' | 'GoodDeed®'>(release.format === 'single_lp' ? 'Vinyl' : 'GoodTunes® Player');
  const [assetLane, setAssetLane] = useState<'Art' | 'Audio'>('Art');
  const [vinylArtUploads, setVinylArtUploads] = useState<Record<string, string>>({});
  const [templateOpen, setTemplateOpen] = useState(false);
  const [assetNotice, setAssetNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: release.title, year: release.year ?? '', catalogNumber: release.catalogNumber ?? '', upc: release.upc ?? '' });
  const format = RELEASE_FORMATS.find((item) => item.id === release.format);
  const assetFormats: Array<typeof assetFormat> = release.format === 'single_lp'
    ? ['Vinyl', 'GoodTunes® Player', 'GoodDeed®']
    : ['GoodTunes® Player', 'GoodDeed®'];
  const cancelEdit = () => { setDraft({ title: release.title, year: release.year ?? '', catalogNumber: release.catalogNumber ?? '', upc: release.upc ?? '' }); setEditing(false); };
  const saveEdit = () => { if (!draft.title.trim()) return; onSave({ ...release, title: draft.title.trim(), year: draft.year.trim() || undefined, catalogNumber: draft.catalogNumber.trim() || undefined, upc: draft.upc.trim() || undefined }); setEditing(false); };
  useEffect(() => {
    if (!assetNotice) return;
    const timer = window.setTimeout(() => setAssetNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [assetNotice]);
  if (templateOpen) {
    return <section data-testid="release-template-admin-view">
      <ArtistTemplateTest embedded onBack={() => setTemplateOpen(false)} />
    </section>;
  }
  return <section data-testid="release-detail-surface">
    {/* Production handoff: /admin/albums/:id; new releases retain ?onboarding=1. */}
    <div className="mt-6 flex items-center gap-8 overflow-x-auto" role="tablist" aria-label="Release section" data-testid="release-tabbar">{RELEASE_DETAIL_TABS.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className="pb-2.5 text-[15px] whitespace-nowrap" style={{ color: tab === item ? t.ink : t.subink, fontWeight: tab === item ? 600 : 500, borderBottom: tab === item ? `2px solid ${t.blue}` : '2px solid transparent' }} data-testid={`tab-release-${item.toLowerCase()}`}>{item}</button>)}</div>
    <div style={{ borderTop: `1px solid ${t.hairline}` }} className="-mt-px" />
    <div className="mt-6">{tab === 'Dashboard' && <ReleaseDashboard t={t} release={release} formatLabel={format?.label ?? 'Format'} onOpenTab={setTab} />}
      {tab === 'Details' && <>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-[22px] font-semibold" style={{ color: t.ink }}>Details. <span className="font-normal" style={{ color: t.subink }}>Everything about this release.</span></h2>
          {!editing && <QuietAction t={t} onClick={() => setEditing(true)} testid="button-edit-release-details">Edit</QuietAction>}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { heading: 'Release', fields: [['Title','title'],['Artist','artist'],['Format','format'],['Year','year']] },
            { heading: 'Identifiers', fields: [['Tracks','tracks'],['Catalog number','catalogNumber'],['UPC code','upc'],['Visibility','visibility']] },
          ].map((group) => <div key={group.heading} className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            <div className="px-5 py-4">
              <p className="text-[15px] font-semibold" style={{ color: t.ink }}>{group.heading}</p>
            </div>
            {group.fields.map(([label, key]) => {
              const editable = ['title', 'year', 'catalogNumber', 'upc'].includes(key);
               const readValue: string = key === 'title' ? release.title : key === 'artist' ? MOCK_PERSON.name : key === 'format' ? format?.label ?? '—' : key === 'tracks' || key === 'visibility' ? '—' : (release[key as 'year' | 'catalogNumber' | 'upc'] || '—');
              return <div key={key} className="flex min-h-[56px] items-center justify-between gap-5 px-5 py-3" style={{ borderTop: `1px solid ${t.hairline}` }}>
                <span className="text-[12.5px]" style={{ color: t.subink }}>{label}</span>
                {editing && editable ? <input value={draft[key as keyof typeof draft]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') saveEdit(); }} className="h-8 min-w-0 max-w-[220px] flex-1 rounded-lg px-2 text-right text-[13px] outline-none" style={inputStyle(t)} aria-label={label} /> : <span className="truncate text-right text-[13px] font-medium" style={{ color: key === 'tracks' || key === 'visibility' ? t.faint : t.ink }}>{readValue}</span>}
              </div>;
            })}
          </div>)}
        </div>
        {editing && <div className="mt-3 flex justify-end gap-1"><CancelButton t={t} onClick={cancelEdit} /><ConfirmButton t={t} label="Save" ready={Boolean(draft.title.trim())} onClick={saveEdit} /></div>}
      </>}
      {tab === 'Assets' && <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Asset format">
            {assetFormats.map((item) => {
              const active = assetFormat === item;
              return <button key={item} type="button" role="tab" aria-selected={active} onClick={() => setAssetFormat(item)} className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors" style={{ backgroundColor: active ? t.card : 'transparent', boxShadow: active ? t.pillShadow : undefined, color: active ? t.ink : t.subink }}>{item}</button>;
            })}
          </div>
          <button type="button" className={cn('flex h-8 w-8 items-center justify-center rounded-full', t.hoverWash)} style={{ border: `1px solid ${t.hairline}`, color: t.subink }} aria-label="Add format"><Plus className="h-4 w-4" /></button>
        </div>
        <div className="mt-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>{assetFormat === 'GoodDeed®' ? 'GoodDeed®' : `${assetFormat} ${assetLane.toLowerCase()}`}</h2>
              {assetFormat !== 'GoodDeed®' && assetLane === 'Art' && <button type="button" className={cn('inline-flex items-center gap-1 text-[12px] font-medium', t.hoverWash)} style={{ color: t.subink }}><Image className="h-3.5 w-3.5" />Templates</button>}
            </div>
            <p className="mt-1 max-w-2xl text-[13px]" style={{ color: t.subink }}>{assetFormat === 'GoodDeed®' ? 'The personalized ownership certificate fans receive with this release.' : assetLane === 'Art' ? assetFormat === 'Vinyl' ? 'Each piece references your album art until you add artwork to the press template.' : 'What fans see while they browse and listen in the GoodTunes® Player.' : assetFormat === 'Vinyl' ? 'The lacquer-ready set for this pressing, checked against the selected plant’s audio requirements.' : 'Tracks and optional bonus content for listeners.'}</p>
          </div>
          {assetFormat !== 'GoodDeed®' && <div className="ml-auto inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Asset type">
            {([
              ['Art', Image],
              ['Audio', Music2],
            ] as const).map(([lane, Icon]) => {
              const active = assetLane === lane;
              return <button key={lane} type="button" role="tab" aria-selected={active} onClick={() => setAssetLane(lane)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ backgroundColor: active ? t.card : 'transparent', boxShadow: active ? t.pillShadow : undefined, color: active ? t.ink : t.subink }} data-testid={`tab-assets-${lane.toLowerCase()}`}><Icon className="h-3.5 w-3.5" />{lane}</button>;
            })}
          </div>}
        </div>
        {assetFormat === 'GoodDeed®' ? <div className="mt-5"><GoodDeedAssetPanel t={t} release={release} /></div> : assetLane === 'Audio' && assetFormat === 'Vinyl' ? <VinylAudioPanel t={t} /> : assetLane === 'Audio' ? <PlayerAudioPanel t={t} /> : assetFormat === 'Vinyl' ? <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="vinyl-template-grid">
            {[
              { label: 'Cover · jacket', kind: 'jacket' as IconKind, image: release.cover ?? californialandCover },
              { label: 'Center labels', kind: 'labels' as IconKind, image: niinaLabelOne },
              { label: 'Printed inner sleeve', kind: 'sleeve' as IconKind, image: null },
            ].map((piece) => <VinylArtPieceCard
              key={piece.label}
              piece={{ ...piece, image: vinylArtUploads[piece.label] ?? piece.image }}
              t={t}
              onReview={() => setTemplateOpen(true)}
              onUpload={(url) => setVinylArtUploads((current) => ({ ...current, [piece.label]: url }))}
              onNotice={setAssetNotice}
            />)}
        </div> : <PlayerArtPanel t={t} release={release} />}
      </div>}
      {tab === 'Package' && <div data-testid="release-package">
        {release.packageState === 'agreed' ? <AgreedPackageRecord t={t} release={release} onRequestChange={() => onSave({ ...release, packageState: 'draft', packageSnapshot: undefined })} /> : <ArtistReleasePackageBuilderContent
          embedded
          packageState={release.packageState}
          packageSnapshot={release.packageSnapshot}
          onConvert={(snapshot) => onSave({ ...release, packageState: 'agreed', packageSnapshot: snapshot })}
          onRequestChange={() => onSave({ ...release, packageState: 'draft', packageSnapshot: undefined })}
        />}
      </div>}
      {tab === 'Store' && <ReleaseStore t={t} release={release} />}
      {tab === 'Payments' && <ReleasePayments t={t} release={release} />}
    </div>
    {assetNotice && <Toast t={t} message={assetNotice} />}
  </section>;
}

function NewReleaseDialog({ t, artistName, onClose, onCreate }: {
  t: Theme;
  artistName: string;
  onClose: () => void;
  onCreate: (title: string, format: ReleaseFormatId) => void;
}) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<ReleaseFormatId>('single_lp');
  const canSubmit = name.trim().length > 0;
  const submit = () => { if (canSubmit) onCreate(name.trim(), format); };
  return (
    <Dialog t={t} title="New release." subtitle="Name it and pick the first format — everything else happens on the project page." onClose={onClose} size="lg" testid="sheet-new-release" footer={<><CancelButton t={t} onClick={onClose} testid="button-new-release-cancel" /><ConfirmButton t={t} label="Create release" ready={canSubmit} onClick={submit} testid="button-new-release-create" /></>}>
      <div className="py-1">
        <Field t={t} label="Release name">
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} placeholder="e.g. CALIFORNIALAND" className="h-10 w-full rounded-xl px-3 text-[14px] focus:outline-none" style={inputStyle(t)} data-testid="input-new-release-name" />
        </Field>
        <Field t={t} label="First format">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="First format">
            {RELEASE_FORMATS.map((item) => {
              const selected = item.id === format;
              return <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setFormat(item.id)} className="min-h-[76px] rounded-xl px-3 py-3 text-left transition-colors" style={{ backgroundColor: selected ? t.selectWash : 'transparent', border: `1px solid ${selected ? t.blue : t.hairline}`, color: t.ink }} data-testid={`option-new-release-format-${item.id}`}>
                <span className="block text-[14px] font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-[12px]" style={{ color: t.subink }}>{item.detail}</span>
              </button>;
            })}
          </div>
        </Field>
        <p className="mt-2 text-[11.5px]" style={{ color: t.faint }}>Creates a GoodTunes release draft for {artistName} and opens onboarding.</p>
      </div>
    </Dialog>
  );
}

function HandlePathField({ t, value, onChange, testid, autoFocus }: { t: Theme; value: string; onChange: (value: string) => void; testid: string; autoFocus?: boolean }) {
  const descriptionId = useId();
  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl" style={inputStyle(t)} role="group" aria-label="Artist URL; only the final path can change">
      <span className="min-w-[100px] max-w-[150px] flex-shrink truncate pl-3 text-[12.5px]" style={{ color: t.subink }}>get.goodtunes.music/</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\s+/g, '-').toLowerCase())}
        className="h-10 min-w-[80px] flex-1 border-l bg-transparent px-2.5 text-[13px] font-medium focus:outline-none"
        style={{ color: t.ink, borderColor: t.hairline, boxShadow: `inset 0 0 0 1px ${t.selectWash}` }}
        aria-label="Editable artist URL path"
        aria-describedby={descriptionId}
        data-testid={testid}
      />
      <span id={descriptionId} className="sr-only">Only the final path after get.goodtunes.music slash can be changed.</span>
    </div>
  );
}

// ─── Account menu (verbatim from Canon) ──────────────────────────────────
const MOCK_ADMIN = { name: 'Bill Denk', email: 'bill@goodtunes.music', initials: 'BD' };

function AccountMenu({ t, mode, setMode }: { t: Theme; mode: Mode; setMode: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const APPEARANCE: Array<{ id: Mode; label: string }> = [
    { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' },
  ];
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={() => setOpen(!open)} className={cn('w-8 h-8 rounded-full ring-1 flex items-center justify-center text-[11.5px] font-semibold', t.avatarRing)} style={{ backgroundColor: t.cardSoft, color: t.ink }} aria-label="Account menu" aria-expanded={open}>
        {MOCK_ADMIN.initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 mt-1.5 z-40 rounded-2xl overflow-hidden shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, width: 264 }}>
            <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
              <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{MOCK_ADMIN.name}</div>
              <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{MOCK_ADMIN.email}</div>
            </div>
            <div className="py-1.5">
              {([{ label: 'Edit profile', icon: UserPen }, { label: 'Invite teammate', icon: UserPlus }] as const).map((m) => {
                const Icon = m.icon;
                return (
                  <button key={m.label} type="button" onClick={() => setOpen(false)} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors text-left', t.hoverWash)} style={{ color: t.ink }}>
                    <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
              <span className="text-[13px]" style={{ color: t.ink }}>Appearance</span>
              <div className="flex items-center rounded-full" style={{ background: t.cardSoft, padding: 2 }} role="radiogroup" aria-label="Appearance">
                {APPEARANCE.map(({ id, label }) => {
                  const active = id === mode;
                  return (
                    <button key={id} type="button" role="radio" aria-checked={active} onClick={() => setMode(id)} className="h-7 px-3 rounded-full inline-flex items-center justify-center transition-all text-[12px]" style={{ background: active ? t.card : 'transparent', boxShadow: active ? t.pillShadow : undefined, color: active ? t.ink : t.faint, fontWeight: active ? 600 : 400 }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="py-1.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
              <button type="button" onClick={() => setOpen(false)} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors text-left', t.hoverWash)} style={{ color: t.ink }}>
                <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Press data ──────────────────────────────────────────────────────────
type Press = { id: string; name: string; location: string; specialty: string; status: 'Available' | 'Limited' | 'Backlogged'; isDefault?: boolean };
const MOCK_PRESSES: Press[] = [
  { id: 'mrp', name: 'Memphis Record Pressing', location: 'Bartlett, TN', specialty: 'Platform default · all formats', status: 'Available', isDefault: true },
  { id: 'hellbender', name: 'Hellbender Vinyl', location: 'Pittsburgh, PA', specialty: 'Short runs · color variants', status: 'Available' },
  { id: 'paramount', name: 'Paramount Pressing & Plating', location: 'Denver, CO', specialty: 'High-volume · standard black', status: 'Limited' },
  { id: 'viryl', name: 'Viryl Technologies', location: 'Toronto, ON, Canada', specialty: 'Precision manufacturing · color variants', status: 'Available' },
  { id: 'pmp', name: 'Physical Music Products (PMP)', location: 'Nashville, TN', specialty: 'Full-service · packaging', status: 'Available' },
];
const MOCK_LINKS_SET: Array<{ label: string; value: string }> = [];
const MOCK_LINKS_UNSET = ['Apple Music', 'Spotify', 'Instagram', 'TikTok', 'X', 'Bluesky', 'Facebook', 'Website', 'Tidal', 'Qobuz', 'Deezer', 'Pandora'];

const ARTIST_TYPES = ['Solo artist', 'Band', 'Producer', 'DJ / Electronic', 'Ensemble'];
const ARTIST_STATUSES = ['Active', 'Draft', 'Suspended'];
const NOTIFY_CATEGORIES = ['Orders', 'Payouts', 'Production updates', 'Fan messages'];
const NOTIFY_ROLES = ['Owner', 'Manager', 'Accounting', 'Assistant'];

const MOCK_ARTIST_ACCOUNT = {
  name: 'Niina Soleil', label: 'Independent', type: 'Solo artist', manager: 'Unmanaged',
  slug: 'niina-soleil', suggestedSlug: 'niina-soleil', credits: ['Artist'],
  email: '—', location: '—', status: 'Active',
};

type ProductionAssignment = 'default' | 'reassigned';
const PRODUCTION_META: Record<ProductionAssignment, { chip: string; line: string }> = {
  default: { chip: 'GoodTunes standard', line: 'Every artist presses with Memphis Record Pressing unless they came in through a press or we reassign them.' },
  reassigned: { chip: 'Reassigned by GoodTunes', line: 'GoodTunes moved this artist off the standard press.' },
};
type ReferralOrigin = { press: string; via: 'direct' | 'backfill'; date?: string } | null;
type Recipient = { id: string; name: string; email: string; categories: string[]; role: string };
type CustomLink = { id: string; label: string; value: string };
type LinkPopoverState = {
  mode: 'choices' | 'more' | 'form';
  anchor: { top: number; bottom: number; left: number; right: number };
  label?: string;
  existing?: CustomLink;
};
type IdentityData = { name: string; slug: string; email: string; location: string; type: string; status: string };

type ActiveDialog =
  | null
  | { kind: 'backfill' }
  | { kind: 'viewAs' }
  | { kind: 'press'; mode: 'reassign' | 'origin' }
  | { kind: 'pressReview'; mode: 'reassign' | 'origin'; press: Press }
  | { kind: 'pressStandard' }
  | { kind: 'linkRemove'; link: CustomLink }
  | { kind: 'shopify' }
  | { kind: 'recipientForm'; existing?: Recipient }
  | { kind: 'recipientRemove'; recipient: Recipient }
  | { kind: 'deleteArtist' }
  | { kind: 'guide' };

// ─── PressBrandTile (verbatim from Canon) ─────────────────────────────────
function PressBrandTile({ t, press, large, compact }: { t: Theme; press: Press; large?: boolean; compact?: boolean }) {
  const logos: Record<string, string | undefined> = { mrp: mrpLogo, hellbender: hellbenderIcon, paramount: paramountIcon, viryl: virylIcon, pmp: pmpIcon };
  const size = compact ? 'h-5 w-5 p-0.5' : large ? 'h-12 w-12 p-1.5' : 'h-11 w-11 p-1.5';
  return (
    <span className={cn('flex flex-shrink-0 items-center justify-center rounded-xl', size)} style={{ backgroundColor: '#ffffff', border: '1px solid #e6e6ea' }}>
      {logos[press.id] ? (
        <img src={logos[press.id]} alt="" className={large ? 'max-h-9 max-w-9 object-contain' : compact ? 'max-h-4 max-w-4 object-contain' : 'max-h-8 max-w-8 object-contain'} />
      ) : (
        <span className="text-[10px] font-semibold tracking-wide" style={{ color: t.subink }} aria-label={`${press.name} monogram`}>•</span>
      )}
    </span>
  );
}

// ─── ServiceMark (verbatim from Canon) ────────────────────────────────────
function ServiceMark({ t, service, bare = false }: { t: Theme; service: string; bare?: boolean }) {
  const assets: Record<string, string | undefined> = { 'Apple Music': appleMusicLogo, Tidal: tidalLogo, Qobuz: qobuzLogo, Deezer: deezerLogo, Pandora: pandoraLogo, Spotify: spotifyLogo, Instagram: instagramLogo, TikTok: tikTokLogo, X: xLogo, Bluesky: blueskyLogo, Facebook: facebookLogo };
  const marks: Record<string, string> = { 'Custom link': '+' };
  const isDark = t === THEMES.dark;
  const needsDarkInversion = isDark && ['X', 'Tidal', 'Qobuz'].includes(service);
  const mark = service === 'Website' ? <Globe className="h-4 w-4" aria-hidden /> : assets[service] ? <img src={assets[service]} alt="" className="max-h-full max-w-full object-contain" style={needsDarkInversion ? { filter: 'invert(1)' } : undefined} /> : <span className="text-[9px] font-semibold">{marks[service] ?? '•'}</span>;
  if (bare) return <>{mark}</>;
  return <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg p-1" style={{ backgroundColor: t.cardSoft, color: t.subink }}>{mark}</span>;
}

// ─── Press picker (verbatim from Canon) ─────────────────────────────────
function PressPickerDialog({ t, modeKind, currentPressName, onClose, onSelect }: { t: Theme; modeKind: 'reassign' | 'origin'; currentPressName: string; onClose: () => void; onSelect: (p: Press) => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Press | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const results = MOCK_PRESSES
    .filter((p) => [p.name, p.location, p.specialty, p.status].some((value) => value.toLowerCase().includes(normalizedQuery)))
    .sort((a, b) => {
      const aCurrent = a.name === currentPressName;
      const bCurrent = b.name === currentPressName;
      if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const title = modeKind === 'reassign' ? 'Reassign to another press' : 'Came in via press';
  const subtitle = modeKind === 'reassign' ? 'Selecting doesn\u2019t commit — you\u2019ll review first.' : 'Set referral origin — production press is unchanged until you review.';
  const statusColor = (s: Press['status']) => s === 'Available' ? t.ready : s === 'Limited' ? t.subink : t.critical;
  return (
    <Dialog t={t} title={title} subtitle={subtitle} onClose={onClose} size="lg" testid="dialog-press-picker" footerOverlay footer={<><CancelButton t={t} onClick={onClose} /><ConfirmButton t={t} label="Review" ready={!!picked} onClick={() => picked && onSelect(picked)} testid="confirm-press-select" /></>}>
      <div className="py-1">
        <div className="text-[12px] mb-2" style={{ color: t.subink }}>Current press: <span style={{ color: t.ink, fontWeight: 600 }}>{currentPressName}</span></div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: t.faint }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search presses…" className="w-full h-10 pl-9 pr-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-press-search" autoFocus />
        </div>
        <div className="h-[336px] space-y-1.5 overflow-y-auto pr-1 pb-20" data-testid="press-results-viewport">
          {results.map((p) => {
            const on = picked?.id === p.id;
            const isCurrent = p.name === currentPressName;
            return (
              <button key={p.id} type="button" onClick={() => setPicked(p)} disabled={isCurrent} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-colors" style={{ backgroundColor: on ? t.selectWash : 'transparent', border: on ? `1px solid ${t.blue}` : `1px solid ${t.hairline}`, opacity: isCurrent ? 0.5 : 1, cursor: isCurrent ? 'not-allowed' : 'pointer' }} data-testid={`press-option-${p.id}`}>
                <PressBrandTile t={t} press={p} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold truncate" style={{ color: t.ink }}>{p.name}</span>
                    {isCurrent && <span className="text-[11px] rounded-full px-2 h-5 inline-flex items-center flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>Current</span>}
                    {on && <span className="inline-flex h-5 flex-shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium" style={{ backgroundColor: t.cardSoft, color: t.blue }}><Check className="h-3 w-3" />Selected</span>}
                  </span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: t.faint }} />
                    <span className="text-[12px] truncate" style={{ color: t.subink }}>{p.location} · {p.specialty}</span>
                  </span>
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor(p.status) }} />
                  <span className="text-[12px] font-medium" style={{ color: statusColor(p.status) }}>{p.status}</span>
                </span>
              </button>
            );
          })}
          {results.length === 0 && <div className="flex h-full items-center justify-center px-3 text-center text-[13px]" style={{ color: t.faint }}>No presses match "{query}".</div>}
        </div>
      </div>
    </Dialog>
  );
}

// ─── Press review dialog (verbatim from Canon) ────────────────────────────
function PressReviewDialog({ t, modeKind, fromName, press, onBack, onClose, onConfirm }: { t: Theme; modeKind: 'reassign' | 'origin'; fromName: string; press: Press; onBack: () => void; onClose: () => void; onConfirm: () => void }) {
  const isReassign = modeKind === 'reassign';
  return (
    <Dialog t={t} title={isReassign ? 'Review reassignment' : 'Review referral origin'} subtitle={isReassign ? 'This changes the production press.' : 'Attribution only — production press stays the same.'} onClose={onClose} back={onBack} testid="dialog-press-review" footer={<><CancelButton t={t} onClick={onClose} /><ConfirmButton t={t} label={isReassign ? 'Reassign press' : 'Set as referral origin'} ready onClick={onConfirm} testid="confirm-press-commit" /></>}>
      <div className="py-2 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
            <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: t.faint }}>From</div>
            <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>{fromName}</div>
          </div>
          <ArrowLeftRight className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
          <div className="flex-1 rounded-xl px-4 py-3" style={{ backgroundColor: t.selectWash, border: `1px solid ${t.blue}` }}>
            <div className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: t.blue }}>To</div>
            <div className="text-[13.5px] font-medium mt-0.5" style={{ color: t.ink }}>{press.name}</div>
            <div className="text-[11.5px] mt-0.5" style={{ color: t.subink }}>{press.location} · {press.specialty}</div>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.subink }} />
          <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>
            {isReassign ? <>Pricing, packages, and the Physical tab will follow <span style={{ color: t.ink, fontWeight: 600 }}>{press.name}</span> going forward. Existing orders in flight are not moved.</> : <>This records that the artist <span style={{ color: t.ink, fontWeight: 600 }}>came in via {press.name}</span>. It sets attribution only and does <span style={{ color: t.ink, fontWeight: 600 }}>not</span> change the current production press.</>}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Identity bulk editor (verbatim from Canon) ───────────────────────────
function IdentityBulkEditor({ t, draft, bio, firstFieldRef, valid, onDraftChange, onBioChange, onSave }: { t: Theme; draft: IdentityData; bio: string; firstFieldRef: React.RefObject<HTMLInputElement | null>; valid: boolean; onDraftChange: (next: IdentityData) => void; onBioChange: (next: string) => void; onSave: () => void }) {
  return (
    <form className="mt-2" onSubmit={(event) => { event.preventDefault(); if (valid) onSave(); }} data-testid="identity-inline-editor">
      <div className="grid grid-cols-1 gap-x-4 px-6 lg:grid-cols-2">
        <Field t={t} label="Artist name">
          <input ref={firstFieldRef} value={draft.name} onChange={(e) => onDraftChange({ ...draft, name: e.target.value })} className="h-10 w-full rounded-xl px-3 text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-identity-name" />
        </Field>
        <Field t={t} label="Contact email">
          <input value={draft.email} onChange={(e) => onDraftChange({ ...draft, email: e.target.value })} type="email" className="h-10 w-full rounded-xl px-3 text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-identity-email" />
        </Field>
        <Field t={t} label="Location">
          <input value={draft.location} onChange={(e) => onDraftChange({ ...draft, location: e.target.value })} className="h-10 w-full rounded-xl px-3 text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-identity-location" />
        </Field>
        <Field t={t} label="Artist type">
          <select value={draft.type} onChange={(e) => onDraftChange({ ...draft, type: e.target.value })} className="h-10 w-full appearance-none rounded-xl px-3 text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="select-identity-type">
            {ARTIST_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field t={t} label="Status">
          <select value={draft.status} onChange={(e) => onDraftChange({ ...draft, status: e.target.value })} className="h-10 w-full appearance-none rounded-xl px-3 text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="select-identity-status">
            {ARTIST_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <div className="px-6 pb-2">
        <Field t={t} label="Bio">
          <textarea value={bio} onChange={(event) => onBioChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && valid) onSave(); }} placeholder="Add a short artist bio…" className="min-h-20 w-full resize-none rounded-xl px-3 py-2 text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-identity-bio" />
        </Field>
      </div>
    </form>
  );
}

// ─── Link popover (verbatim from Canon) ───────────────────────────────────
function LinkPopover({ t, state, unsetLinks, onClose, onStateChange, onSave }: { t: Theme; state: LinkPopoverState; unsetLinks: string[]; onClose: () => void; onStateChange: (state: LinkPopoverState) => void; onSave: (link: CustomLink) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(state.existing?.label ?? (state.label === 'Custom link' ? '' : state.label ?? ''));
  const [value, setValue] = useState(state.existing?.value ?? '');
  const [filter, setFilter] = useState<'All' | 'Music' | 'Social' | 'Web'>('All');
  const isForm = state.mode === 'form';
  const isCustom = !state.existing && state.label === 'Custom link';
  const validUrl = /\.[a-z]{2,}/i.test(value.trim());
  const valid = label.trim().length > 0 && validUrl;
  const serviceGroups = {
    Music: ['Apple Music', 'Spotify', 'Tidal', 'Qobuz', 'Deezer', 'Pandora'],
    Social: ['Instagram', 'TikTok', 'X', 'Bluesky', 'Facebook'],
    Web: ['Website'],
  };
  const coreChoices = (filter === 'All' ? [...serviceGroups.Music, ...serviceGroups.Social, ...serviceGroups.Web] : serviceGroups[filter]).filter((name) => unsetLinks.includes(name));

  useEffect(() => {
    setLabel(state.existing?.label ?? (state.label === 'Custom link' ? '' : state.label ?? ''));
    setValue(state.existing?.value ?? '');
  }, [state.existing, state.label, state.mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (state.mode === 'form' && !state.existing) onStateChange({ ...state, mode: 'choices', label: undefined });
      else onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose, onStateChange, state]);

  const choose = (choice: string) => onStateChange({ ...state, mode: 'form', label: choice, existing: undefined });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0" style={{ backgroundColor: t.overlay, backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <section ref={wrapRef} role="dialog" aria-modal="true" aria-label={isForm ? 'Link editor' : 'Add a link'} className={cn('relative z-10 flex max-h-[calc(100dvh-32px)] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl', isForm ? 'h-[400px]' : 'h-[510px]')} style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }} data-testid={isForm ? 'dialog-link-editor' : 'dialog-link-chooser'}>
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          {isForm && !state.existing ? (
            <button type="button" onClick={() => onStateChange({ ...state, mode: 'choices', label: undefined })} className={cn('inline-flex h-7 items-center gap-1 rounded-full px-1 text-[12px] font-medium', t.hoverWash)} style={{ color: t.subink }} data-testid="button-link-popover-back"><ChevronLeft className="h-3.5 w-3.5" />Back</button>
          ) : <span className="text-[28px] font-semibold leading-tight" style={{ color: t.ink, letterSpacing: '-0.025em' }}>{isForm ? `Edit ${state.existing?.label}` : 'Add a link'}</span>}
          {isForm && !state.existing && <span className="text-[28px] font-semibold leading-tight" style={{ color: t.ink, letterSpacing: '-0.025em' }}>Add a link</span>}
          <button type="button" onClick={onClose} className={cn('flex h-6 w-6 items-center justify-center rounded-full', t.hoverWash)} style={{ color: t.subink, backgroundColor: t.cardSoft }} aria-label="Close link editor" data-testid="button-close-link-popover"><X className="h-3.5 w-3.5" /></button>
        </div>
        {isForm ? (
          <form className="flex flex-1 flex-col px-4 pb-4" onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ id: state.existing?.id ?? `lnk-${Date.now()}`, label: label.trim(), value: value.trim() }); }}>
            <p className="mb-3 text-[16px]" style={{ color: t.subink }}>Paste the destination fans should reach.</p>
            {isCustom && <Field t={t} label="Label"><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Bandcamp" className="h-9 w-full rounded-xl px-3 text-[13px] focus:outline-none" style={inputStyle(t)} data-testid="input-link-label" /></Field>}
            <Field t={t} label="URL"><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://…" className="h-9 w-full rounded-xl px-3 text-[13px] focus:outline-none" style={inputStyle(t)} data-testid="input-link-url" autoFocus /></Field>
            {value.trim() && !validUrl && <p className="mt-1 text-[11.5px]" style={{ color: t.critical }}>Enter a valid URL.</p>}
            <div className="mt-auto flex items-center justify-end gap-3">
              <button type="button" onClick={onClose} className={cn('h-8 rounded-full px-2 text-[12.5px] font-medium', t.hoverWash)} style={{ color: t.subink }}>Cancel</button>
              <button type="submit" disabled={!valid} className="h-8 rounded-full px-3.5 text-[12.5px] font-medium transition-colors disabled:opacity-60" style={{ color: valid ? '#fff' : t.subink, backgroundColor: valid ? t.blue : 'transparent', border: `1px solid ${valid ? t.blue : t.hairline}` }} data-testid="button-submit-link">{state.existing ? 'Save link' : 'Add link'}</button>
            </div>
          </form>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
            <p className="px-2 pb-3 text-[16px]" style={{ color: t.subink }}>Choose a destination to add.</p>
            <div className="mb-3 inline-flex self-start rounded-full" style={{ background: t.cardSoft, padding: 2 }} role="group" aria-label="Destination category">
              {(['All', 'Music', 'Social', 'Web'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className="h-8 min-w-14 rounded-full px-3 text-[13px] transition-all focus:outline-none focus-visible:ring-2" style={{ background: filter === item ? t.card : 'transparent', boxShadow: filter === item ? t.pillShadow : undefined, color: filter === item ? t.ink : t.faint, fontWeight: filter === item ? 600 : 400 }} aria-pressed={filter === item} data-testid={`filter-link-${item.toLowerCase()}`}>{item}</button>)}
            </div>
            <div className="h-[300px] flex-shrink-0 overflow-y-scroll px-2 pb-1" style={{ scrollbarGutter: 'stable' }}>
              {coreChoices.length ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {coreChoices.map((choice) => (
                  <button key={choice} type="button" onClick={() => choose(choice)} className={cn('flex min-h-20 items-center gap-4 rounded-xl px-4 text-left text-[16px] font-semibold', t.hoverWash)} style={{ color: t.ink, border: `1px solid ${t.hairline}` }} data-testid={`choice-link-${choice.toLowerCase().replace(/\s+/g, '-')}`}><span className="scale-125"><ServiceMark t={t} service={choice} /></span><span className="min-w-0 truncate">{choice}</span></button>
                ))}
              </div> : <p className="px-2 py-4 text-[12px]" style={{ color: t.subink }}>No unconnected destinations in this category.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Shopify dialog (verbatim from Canon) ─────────────────────────────────
function ShopifyDialog({ t, onClose, onConnect }: { t: Theme; onClose: () => void; onConnect: () => void }) {
  const [phase, setPhase] = useState<'ready' | 'authorizing' | 'connected'>('ready');
  const authorizing = phase === 'authorizing';
  const connected = phase === 'connected';
  useEffect(() => {
    if (!authorizing) return;
    const timer = window.setTimeout(() => setPhase('connected'), 1100);
    return () => window.clearTimeout(timer);
  }, [authorizing]);
  const partnerAccent = '#95BF47';
  const shellStyle: React.CSSProperties = t === THEMES.dark
    ? { background: 'radial-gradient(ellipse 125% 115% at 50% 50%, #0f2728 0%, #0a1d1e 50%, #081819 76%, #050f10 90%, #030809 100%)', border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }
    : { backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow };
  const wordmark = t === THEMES.dark ? shopifyWordmarkDark : shopifyWordmarkLight;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-8" role="presentation">
      <div className="absolute inset-0" style={{ backgroundColor: t.overlay, backdropFilter: 'blur(2px)' }} onClick={onClose} aria-hidden />
      <section role="dialog" aria-modal="true" aria-label="Connect Shopify store" className="relative w-full overflow-hidden rounded-2xl focus:outline-none" style={{ maxWidth: 900, ...shellStyle }} data-testid="dialog-shopify">
        <button type="button" onClick={onClose} className={cn('absolute right-6 top-5 z-10 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 ease-out', t.hoverWash)} style={{ backgroundColor: t.cardSoft, color: t.subink }} aria-label="Close" data-testid="dialog-close">
          <X className="w-4 h-4" />
        </button>
        <div className="px-5 pt-10 lg:px-12 lg:pt-16" aria-live="polite">
          <img src={wordmark} alt="Shopify" className="mx-auto h-10 w-auto object-contain lg:h-14" />
          <div className="mx-auto mt-6 max-w-2xl text-center">
            <h2 className="text-[34px] font-semibold leading-none lg:text-[50px]" style={{ color: t.ink, letterSpacing: '-0.045em' }}>Live. Perform. <span>Shop</span><span style={{ color: t.subink }}>ify.</span></h2>
            <p className="mt-3 text-[16px] lg:text-[23px]" style={{ color: t.subink }}>Connect a Shopify store in less than five minutes.</p>
          </div>
          <div className="mx-auto mt-1 w-full overflow-hidden lg:mt-2" style={{ maxWidth: 525 }}>
            <div className="relative overflow-hidden" style={{ height: 'clamp(300px, 40vw, 350px)' }} data-testid="shopify-connection-visual">
              <img src={niinaShopifyLaptop} alt="Niina Soleil's CALIFORNIALAND Shopify storefront on a laptop" className="absolute left-1/2 max-w-none -translate-x-1/2 select-none" style={{ width: '171%', top: -72 }} draggable={false} />
              {(authorizing || connected) && (
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: t === THEMES.dark ? 'rgba(5,41,39,0.24)' : 'rgba(255,255,255,0.20)' }}>
                  <div className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12.5px] font-medium" style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}`, boxShadow: t.pillShadow }} data-testid={authorizing ? 'shopify-connecting' : 'shopify-connected'}>
                    {authorizing ? <RotateCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" style={{ color: partnerAccent }} /> : <Check className="h-3.5 w-3.5" style={{ color: t.ready }} />}
                    {authorizing ? 'Opening Shopify permissions…' : 'Store connected'}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="relative z-10 mx-auto w-full border-t-2" style={{ borderColor: t === THEMES.dark ? 'rgba(255,255,255,0.24)' : 'rgba(29,29,31,0.22)' }} />
        </div>
        <div className="px-5 pb-6 pt-8 lg:px-12 lg:pb-7 lg:pt-9">
          <div className="mx-auto flex w-full items-center justify-end gap-1" style={{ maxWidth: 525 }}>
            {connected ? (
              <ConfirmButton t={t} label="Done" ready onClick={onConnect} testid="confirm-shopify-done" />
            ) : (
              <>
                <CancelButton t={t} onClick={onClose} />
                <ConfirmButton t={t} label={authorizing ? 'Connecting…' : 'Continue to Shopify'} ready={!authorizing} onClick={() => setPhase('authorizing')} testid="confirm-shopify" />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Recipient dialog (verbatim from Canon) ────────────────────────────────
function RecipientDialog({ t, existing, onClose, onSave }: { t: Theme; existing?: Recipient; onClose: () => void; onSave: (r: Recipient) => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState(existing?.role ?? NOTIFY_ROLES[0]);
  const [cats, setCats] = useState<string[]>(existing?.categories ?? ['Orders']);
  const valid = name.trim().length > 0 && /.+@.+\..+/.test(email) && cats.length > 0;
  const toggle = (c: string) => setCats((xs) => xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]);
  return (
    <Dialog t={t} title={existing ? 'Edit recipient' : 'Add recipient'} subtitle="Choose who receives updates about this artist." onClose={onClose} size="lg" testid="dialog-recipient" footer={<><CancelButton t={t} onClick={onClose} /><ConfirmButton t={t} label={existing ? 'Save recipient' : 'Add recipient'} ready={valid} onClick={() => onSave({ id: existing?.id ?? `rcp-${Date.now()}`, name: name.trim(), email: email.trim(), role, categories: cats })} testid="confirm-recipient" /></>}>
      <div className="py-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field t={t} label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-recipient-name" /></Field>
          <Field t={t} label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-recipient-email" /></Field>
        </div>
        <Field t={t} label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none appearance-none" style={inputStyle(t)} data-testid="select-recipient-role">
            {NOTIFY_ROLES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field t={t} label="Notification categories">
          <div className="flex flex-wrap gap-2 pt-0.5">
            {NOTIFY_CATEGORIES.map((c) => {
              const on = cats.includes(c);
              return (
                <button key={c} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium transition-colors" style={on ? { backgroundColor: t.selectWash, color: t.blue, border: `1px solid ${t.blue}` } : { backgroundColor: t.cardSoft, color: t.subink, border: `1px solid ${t.hairline}` }} data-testid={`recipient-cat-${c.toLowerCase().replace(/\s+/g, '-')}`}>
                  {on && <Check className="w-3.5 h-3.5" />}
                  {c}
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

// ─── Backfill dialog (verbatim from Canon) ────────────────────────────────
function ReviewRow({ t, label, value }: { t: Theme; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
      <span className="text-[12.5px] flex-shrink-0" style={{ color: t.subink }}>{label}</span>
      <span className="text-[13.5px] font-medium text-right" style={{ color: t.ink }}>{value}</span>
    </div>
  );
}

function BackfillDialog({ t, onClose, onConfirm }: { t: Theme; onClose: () => void; onConfirm: (press: string, date: string) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Press | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [review, setReview] = useState(false);
  const results = MOCK_PRESSES.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  const canReview = !!selected && !!date;

  if (review && selected) {
    return (
      <Dialog t={t} title="Confirm back-fill" subtitle="Attribution only — production stays the same." onClose={onClose} back={() => setReview(false)} testid="dialog-backfill-review" footer={<><CancelButton t={t} onClick={onClose} /><ConfirmButton t={t} label="Back-fill referral" ready onClick={() => onConfirm(selected.name, date)} testid="confirm-backfill" /></>}>
        <div className="py-2 space-y-3">
          <ReviewRow t={t} label="Referring press" value={selected.name} />
          <ReviewRow t={t} label="Effective date" value={date} />
          {note && <ReviewRow t={t} label="Reference / note" value={note} />}
          <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.subink }} />
            <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>
              This records past <span style={{ color: t.ink, fontWeight: 600 }}>attribution and history</span> — it does <span style={{ color: t.ink, fontWeight: 600 }}>not</span> change the current production press assignment.
            </div>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog t={t} title="Back-fill a referral" subtitle="Record who referred this artist, after the fact." onClose={onClose} testid="dialog-backfill" footer={<><CancelButton t={t} onClick={onClose} /><ConfirmButton t={t} label="Review" ready={canReview} onClick={() => setReview(true)} testid="confirm-backfill-review" /></>}>
      <div className="py-1">
        <Field t={t} label="Referring press">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: t.faint }} />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder="Search presses…" className="w-full h-10 pl-9 pr-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-backfill-search" />
          </div>
          <div className="mt-2 space-y-1">
            {results.map((p) => {
              const on = selected?.id === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setSelected(p)} className="w-full flex items-center gap-3 px-3 h-11 rounded-xl text-left transition-colors" style={{ backgroundColor: on ? t.selectWash : 'transparent', border: on ? `1px solid ${t.blue}` : `1px solid transparent` }} data-testid={`backfill-press-${p.id}`}>
                  <Factory className="w-4 h-4 flex-shrink-0" style={{ color: on ? t.blue : t.faint }} />
                  <span className="flex-1 min-w-0"><span className="text-[13.5px] font-medium block truncate" style={{ color: t.ink }}>{p.name}</span><span className="text-[11.5px]" style={{ color: t.faint }}>{p.location}</span></span>
                  {on && <Check className="w-4 h-4" style={{ color: t.blue }} />}
                </button>
              );
            })}
            {results.length === 0 && <div className="text-[13px] px-3 py-2" style={{ color: t.faint }}>No presses match "{query}".</div>}
          </div>
        </Field>
        <Field t={t} label="Effective date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-backfill-date" />
        </Field>
        <Field t={t} label="Reference / note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Deal memo #, contact, or context" className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-backfill-note" />
        </Field>
      </div>
    </Dialog>
  );
}

// ─── Interaction guide (verbatim from Canon) ─────────────────────────────
const GUIDE_ITEMS: Array<{ title: string; body: string }> = [
  { title: 'Back-fill a referral', body: 'Header ••• → search a press, set date & optional note, review, confirm. Changes attribution/history only, not production.' },
  { title: 'View as this artist', body: 'Confirm dialog explains read-only mode → Continue enters a preview banner with Exit; no admin writes while previewing.' },
  { title: 'Reassign press', body: 'Searchable picker → From/To review with impact → explicit Reassign press commits. Cancel/back safe.' },
  { title: 'Came in via press', body: 'Same picker in referral-origin mode → review confirms attribution only; production press is not silently changed.' },
  { title: 'Artist URL', body: 'Suggest → Use it / Keep current. Copy shows Copied feedback and a toast. Nothing changes without an explicit action.' },
  { title: 'Identity edit', body: 'Edit all fields transforms the existing card in place. Save is explicit; Cancel preserves every value.' },
  { title: 'Add / edit / remove link', body: 'Add opens a choice menu then a labeled URL form. Edit reuses the form. Remove asks to confirm.' },
  { title: 'Shopify Connect', body: 'Dialog lists what will sync → Continue to Shopify advances to a connected success state. Cancel has no side effect.' },
  { title: 'Notifications', body: 'Add recipient form (name, email, categories, role). Edit reuses the form. Remove asks to confirm.' },
];

function InteractionGuide({ t, onClose }: { t: Theme; onClose: () => void }) {
  return (
    <Dialog t={t} title="Variation A — Dashboard then Account" subtitle="Interaction canon checklist for this layout." onClose={onClose} size="lg" testid="dialog-interaction-guide" footer={<ConfirmButton t={t} label="Got it" ready onClick={onClose} testid="confirm-guide" />}>
      <div className="py-1 space-y-2.5">
        {GUIDE_ITEMS.map((g) => (
          <div key={g.title} className="flex items-start gap-3">
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.ready }} />
            <div>
              <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{g.title}</div>
              <div className="text-[12.5px] leading-snug mt-0.5" style={{ color: t.subink }}>{g.body}</div>
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

// ─── Delete artist dialog (Apple-canon destructive confirmation) ─────────
// Names the artist explicitly and requires typing the exact name before the
// destructive confirm enables. Cancel stays quiet on the left; the red
// confirm is rightmost. No deletion is executed in this mock.
function DeleteArtistDialog({ t, artistName, onClose, onConfirm }: { t: Theme; artistName: string; onClose: () => void; onConfirm: () => void }) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === artistName;
  return (
    <Dialog
      t={t}
      title="Delete this artist?"
      subtitle={<>You're about to delete <span style={{ color: t.ink, fontWeight: 600 }}>{artistName}</span>. This removes the profile, its catalog links, and all account configuration. This cannot be undone.</>}
      onClose={onClose}
      testid="dialog-delete-artist"
      footer={<>
        <CancelButton t={t} onClick={onClose} testid="button-cancel-delete-artist" />
        <ConfirmButton t={t} label="Delete artist" ready={matches} danger onClick={onConfirm} testid="confirm-delete-artist" />
      </>}
    >
      <div className="py-2 space-y-3">
        <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
          <CircleAlert className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.critical }} />
          <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>
            Deleting an artist is permanent. Orders, payouts, and referral history tied to this account will no longer be reachable from here.
          </div>
        </div>
        <Field t={t} label={`Type ${artistName} to confirm`}>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={artistName}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            className="h-9 w-full rounded-xl px-3 text-[13px] focus:outline-none"
            style={inputStyle(t)}
            data-testid="input-delete-artist-confirm"
          />
        </Field>
      </div>
    </Dialog>
  );
}

// ─── Account section (full Overview cards with interactions) ─────────────
function AccountSection({ t, isSuperAdmin }: { t: Theme; isSuperAdmin: boolean }) {
  const accountSectionRef = useRef<HTMLDivElement>(null);
  const [isArchived, setIsArchived] = useState(false);
  // This active artist has releases, orders, and a production relationship.
  // It therefore has protected history and cannot be permanently deleted.
  const hasProtectedHistory = true;

  // Production
  const [productionAssignment, setProductionAssignment] = useState<ProductionAssignment>('default');
  const [productionPressName, setProductionPressName] = useState('Memphis Record Pressing');
  const [referralOrigin, setReferralOrigin] = useState<ReferralOrigin>(null);
  const [pressMenu, setPressMenu] = useState(false);
  const pressMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pressMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!pressMenuRef.current?.contains(event.target as Node)) setPressMenu(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPressMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [pressMenu]);

  // Artist URL
  const [identity, setIdentity] = useState({
    name: MOCK_ARTIST_ACCOUNT.name, slug: MOCK_ARTIST_ACCOUNT.slug, email: MOCK_ARTIST_ACCOUNT.email,
    location: MOCK_ARTIST_ACCOUNT.location, type: MOCK_ARTIST_ACCOUNT.type, status: MOCK_ARTIST_ACCOUNT.status,
  });
  const [editingArtistUrl, setEditingArtistUrl] = useState(false);
  const [artistUrlDraft, setArtistUrlDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [copied, setCopied] = useState(false);
  const artistUrlEditRef = useRef<HTMLButtonElement>(null);

  // Identity
  const [bio, setBio] = useState('');
  const [bulkEditingIdentity, setBulkEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityData>(identity);
  const [bioDraft, setBioDraft] = useState('');
  const [identityMenu, setIdentityMenu] = useState(false);
  const identityMoreRef = useRef<HTMLButtonElement>(null);
  const identityFirstFieldRef = useRef<HTMLInputElement>(null);

  // Links
  const [extraLinks, setExtraLinks] = useState<CustomLink[]>([]);
  const [linkEntryPhase, setLinkEntryPhase] = useState<{ id: string; phase: 'entering' | 'active' | 'exiting' } | null>(null);
  const [returnedService, setReturnedService] = useState<string | null>(null);
  const linkRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [linkPopover, setLinkPopover] = useState<LinkPopoverState | null>(null);
  const addLinkRef = useRef<HTMLButtonElement>(null);

  // Shopify
  const [shopifyConnected, setShopifyConnected] = useState(false);

  // Notifications
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Dialogs + toast
  const [dialog, setDialog] = useState<ActiveDialog>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    if (!bulkEditingIdentity) return;
    const frame = window.requestAnimationFrame(() => identityFirstFieldRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [bulkEditingIdentity]);

  const productionMeta = PRODUCTION_META[productionAssignment];
  const unsetLinks = MOCK_LINKS_UNSET.filter((l) => !extraLinks.some((e) => e.label === l));

  const artistUrlValid = artistUrlDraft.trim().length > 0;
  const startArtistUrlEdit = () => { setArtistUrlDraft(identity.slug); setSuggesting(false); setEditingArtistUrl(true); };
  const cancelArtistUrlEdit = () => { setArtistUrlDraft(identity.slug); setSuggesting(false); setEditingArtistUrl(false); window.requestAnimationFrame(() => artistUrlEditRef.current?.focus()); };
  const saveArtistUrlEdit = () => {
    const slug = artistUrlDraft.trim().replace(/\s+/g, '-').toLowerCase();
    if (!slug) return;
    setIdentity((current) => ({ ...current, slug }));
    setSuggesting(false); setEditingArtistUrl(false);
    showToast('Artist URL updated');
    window.requestAnimationFrame(() => artistUrlEditRef.current?.focus());
  };

  const beginBulkIdentityEdit = () => { setIdentityDraft(identity); setBioDraft(bio); setIdentityMenu(false); setBulkEditingIdentity(true); };
  const closeBulkIdentityEdit = () => { setIdentityDraft(identity); setBioDraft(bio); setBulkEditingIdentity(false); window.requestAnimationFrame(() => identityMoreRef.current?.focus()); };
  const saveBulkIdentityEdit = () => {
    const next = { name: identityDraft.name.trim(), email: identityDraft.email.trim(), location: identityDraft.location.trim(), type: identityDraft.type, status: identityDraft.status };
    if (!next.name || !/.+@.+\..+/.test(next.email)) return;
    setIdentity((current) => ({ ...current, ...next }));
    setBio(bioDraft.trim()); setBulkEditingIdentity(false);
    showToast('Identity saved');
    window.requestAnimationFrame(() => identityMoreRef.current?.focus());
  };
  const bulkIdentityValid = identityDraft.name.trim().length > 0 && /.+@.+\..+/.test(identityDraft.email);
  const bulkIdentityChanged = identityDraft.name !== identity.name || identityDraft.email !== identity.email || identityDraft.location !== identity.location || identityDraft.type !== identity.type || identityDraft.status !== identity.status || bioDraft !== bio;

  const animateLinkEntry = (id: string) => {
    setLinkEntryPhase({ id, phase: 'entering' });
    window.requestAnimationFrame(() => {
      setLinkEntryPhase({ id, phase: 'active' });
      const row = linkRowRefs.current[id];
      if (row) {
        const rect = row.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    });
    window.setTimeout(() => setLinkEntryPhase((current) => current?.id === id ? null : current), 240);
  };
  const returnLinkToDestinations = (link: CustomLink) => {
    setLinkEntryPhase({ id: link.id, phase: 'exiting' });
    window.setTimeout(() => {
      setExtraLinks((xs) => xs.filter((x) => x.id !== link.id));
      setLinkEntryPhase(null);
      setReturnedService(link.label);
      window.setTimeout(() => setReturnedService((current) => current === link.label ? null : current), 240);
      showToast('Link removed');
    }, 200);
  };
  const openLinkPopover = (event: React.MouseEvent<HTMLButtonElement>, existing?: CustomLink, label?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLinkPopover({ mode: existing || label ? 'form' : 'choices', existing, label: existing?.label ?? label, anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } });
  };
  const closeLinkPopover = () => { setLinkPopover(null); window.requestAnimationFrame(() => addLinkRef.current?.focus()); };

  // Suppress unused warning
  void returnedService;

  return (
    <div ref={accountSectionRef} data-testid="settings-body">
      {/* ── Settings page heading (semantic + quiet continuation) ── */}
      <div className="pb-6">
        <h1 className="text-[30px] font-semibold" style={{ letterSpacing: '-.02em', lineHeight: 1.12, color: t.ink }}>
          Settings. <span className="font-medium" style={{ color: t.subink }}>Manage this artist.</span>
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: t.subink }}>
          Links, stores, identity, notification recipients, and production.
        </p>
      </div>

      <div className="flex flex-col gap-4" data-testid="settings-groups">
        {/* ── Production ── */}
        <SectionCard t={t} className="group/production order-6 relative z-10" testid="card-pressed-by" allowOverflow>
          <CardHead t={t} title="Production" />
          <div className="flex items-center gap-4 px-6 py-5 flex-wrap sm:flex-nowrap">
            <PressBrandTile t={t} press={MOCK_PRESSES.find((p) => p.name === productionPressName) ?? MOCK_PRESSES[0]} large />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[15px] font-semibold" style={{ color: t.ink }} data-testid="text-production-press-name">
                  Pressed by {productionPressName}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 h-6" style={{ color: productionAssignment === 'default' ? t.ready : t.subink, backgroundColor: t.cardSoft }} data-testid="chip-production-assignment">
                  {productionAssignment === 'default' ? <BadgeCheck className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
                  {productionMeta.chip}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12.5px] flex-wrap" style={{ color: t.subink }}>
                <span>Pricing, packages, and the Physical tab all follow this press.</span>
                <Disclosure t={t} label="How press routing works" testid="disclosure-press-rule">
                  <span className="block text-[12.5px] font-semibold not-italic mb-1" style={{ color: t.ink }}>How press routing works</span>
                  <span className="block text-[12.5px] leading-snug not-italic" style={{ color: t.subink }}>{productionMeta.line}</span>
                  <span className="block text-[11.5px] leading-snug not-italic mt-2" style={{ color: t.faint }}>Reassigning changes the production press — routing, pricing, and the Physical tab all update. Referral origin is separate and unaffected.</span>
                </Disclosure>
              </div>
              {referralOrigin && (
                <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="row-referral-origin">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 h-6" style={{ color: t.subink, backgroundColor: t.cardSoft }} data-testid="chip-referral-origin">
                    <PressBrandTile t={t} press={MOCK_PRESSES.find((p) => p.name === referralOrigin.press) ?? MOCK_PRESSES[0]} compact />
                    {referralOrigin.via === 'backfill' ? 'Referral back-filled' : 'Came in via'} — {referralOrigin.press}
                  </span>
                  {referralOrigin.date && <span className="text-[11.5px]" style={{ color: t.faint }}>effective {referralOrigin.date}</span>}
                  <span className="text-[11.5px]" style={{ color: t.faint }}>Attribution only — production routing is unchanged.</span>
                </div>
              )}
            </div>
            {isSuperAdmin && (
              <div ref={pressMenuRef} className="relative flex-shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-hover/production:opacity-100 md:group-focus-within/production:opacity-100">
                <QuietAction t={t} onClick={() => setPressMenu(!pressMenu)} testid="button-change-press">Change…</QuietAction>
                {pressMenu && (
                  <div className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 270, boxShadow: t.popShadow }} role="menu" data-testid="menu-change-press">
                    <button type="button" onClick={() => { setPressMenu(false); setDialog({ kind: 'press', mode: 'reassign' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem"><ArrowLeftRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />Reassign to another press…</button>
                    <button type="button" onClick={() => { setPressMenu(false); setDialog({ kind: 'press', mode: 'origin' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem"><Factory className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />Mark as came in via press</button>
                    {productionAssignment !== 'default' && (
                      <button type="button" onClick={() => { setPressMenu(false); setDialog({ kind: 'pressStandard' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem"><BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />Back to GoodTunes standard</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── Stores: one section surface containing equal peer destinations. ── */}
        <SectionCard t={t} className="order-3" testid="section-stores">
          <CardHead t={t} title="Stores" />
          <p className="px-6 pb-4 text-[13px]" style={{ color: t.subink }}>
            Where fans can find you.
          </p>
          <div className="grid grid-cols-1 gap-4 px-4 pb-4 md:grid-cols-2" data-testid="stores-grid">
            <SectionCard t={t} className="group/goodtunes-store" testid="card-artist-link">
              <CardHead t={t} title="GoodTunes store" />
              {editingArtistUrl ? (
                <form className="px-6 py-4" onSubmit={(event) => { event.preventDefault(); if (artistUrlValid) saveArtistUrlEdit(); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelArtistUrlEdit(); } }} data-testid="artist-url-inline-editor">
                  <div className="flex items-center gap-3">
                    <Link2 className="h-4 w-4 flex-shrink-0" style={{ color: t.faint }} />
                    <HandlePathField t={t} value={artistUrlDraft} onChange={setArtistUrlDraft} testid="input-artist-url-slug" autoFocus />
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1">
                  <QuietAction t={t} icon={Sparkles} onClick={() => setSuggesting((o) => !o)} testid="button-suggest-slug">Suggest</QuietAction>
                  <CancelButton t={t} onClick={cancelArtistUrlEdit} testid="button-cancel-artist-url" />
                  <ConfirmButton t={t} label="Save" ready={artistUrlValid && artistUrlDraft !== identity.slug} onClick={saveArtistUrlEdit} testid="button-save-artist-url" />
                  </div>
                </form>
              ) : (
                <div className="flex min-h-20 items-center gap-3 px-6 py-4">
                  <Link2 className="h-4 w-4 flex-shrink-0" style={{ color: t.faint }} />
                  <button ref={artistUrlEditRef} type="button" onClick={startArtistUrlEdit} className={cn('flex-1 min-w-0 truncate rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors focus:outline-none focus-visible:ring-2', t.hoverWash)} style={{ color: t.ink }} aria-label="Edit artist URL" data-testid="button-edit-artist-url">
                    <span style={{ color: t.subink }}>get.goodtunes.music/</span>
                    <span style={{ color: t.ink, fontWeight: 600 }}>{identity.slug}</span>
                  </button>
                  <QuietAction t={t} icon={copied ? Check : Copy} className="h-11 opacity-100 transition-opacity md:opacity-0 md:group-hover/goodtunes-store:opacity-100 md:group-focus-within/goodtunes-store:opacity-100" onClick={() => { void navigator.clipboard?.writeText(`get.goodtunes.music/${identity.slug}`); setCopied(true); showToast('Link copied'); setTimeout(() => setCopied(false), 1400); }} testid="button-copy-link">
                    {copied ? 'Copied' : 'Copy'}
                  </QuietAction>
                </div>
              )}
              {suggesting && editingArtistUrl && (
                <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center" style={{ borderTop: `1px solid ${t.hairline}` }} data-testid="row-slug-suggestion">
                  <Sparkles className="hidden h-3.5 w-3.5 flex-shrink-0 sm:block" style={{ color: t.faint }} />
                  <div className="min-w-0 flex-1 break-all text-[13px]" style={{ color: t.subink }}>
                  Suggested: <span style={{ color: t.ink, fontWeight: 600 }}>get.goodtunes.music/{MOCK_ARTIST_ACCOUNT.suggestedSlug}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center justify-end gap-1">
                    <QuietAction t={t} icon={X} onClick={() => setSuggesting(false)} testid="button-dismiss-suggestion">Keep current</QuietAction>
                    <QuietAction t={t} icon={Check} onClick={() => { setArtistUrlDraft(MOCK_ARTIST_ACCOUNT.suggestedSlug); setSuggesting(false); }} testid="button-use-suggestion">Use it</QuietAction>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard t={t} className="group/shopify-store" testid="card-shopify">
              <CardHead t={t} title="Shopify store" />
              <div className="flex min-h-20 items-center justify-between gap-4 px-6 py-4">
                <ServiceIdentity carrier="brand" icon={<img src={shopifyBagLogo} alt="" />} title="Artist Shopify store" secondary={shopifyConnected ? 'Store connected' : 'Not connected'} />
                <div className="opacity-100 transition-opacity md:opacity-0 md:group-hover/shopify-store:opacity-100 md:group-focus-within/shopify-store:opacity-100">
                  {shopifyConnected
                    ? <QuietAction t={t} icon={Check} testid="button-shopify-connected">Manage</QuietAction>
                    : <QuietAction t={t} onClick={() => setDialog({ kind: 'shopify' })} testid="button-connect-shopify">Connect…</QuietAction>}
                </div>
              </div>
            </SectionCard>
          </div>
        </SectionCard>

        {/* ── Identity ── */}
        <SectionCard t={t} className="group/identity order-4" testid="card-identity">
          <CardHead
            t={t}
            title={bulkEditingIdentity ? 'Edit identity' : 'Identity'}
            action={bulkEditingIdentity ? (
              <div className="flex items-center gap-1">
                <CancelButton t={t} onClick={closeBulkIdentityEdit} testid="button-cancel-identity-inline" className="h-11" />
                <ConfirmButton t={t} label="Save changes" ready={bulkIdentityChanged && bulkIdentityValid} onClick={saveBulkIdentityEdit} testid="button-save-identity-inline" className="h-11" />
              </div>
            ) : (
              <div className="relative opacity-100 transition-opacity md:opacity-0 md:group-hover/identity:opacity-100 md:group-focus-within/identity:opacity-100">
                <button ref={identityMoreRef} type="button" onClick={() => setIdentityMenu((o) => !o)} className={cn('flex h-8 w-8 items-center justify-center rounded-full', t.hoverWash)} style={{ color: t.subink, backgroundColor: t.cardSoft }} aria-label="More identity actions" data-testid="button-identity-more">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {identityMenu && (
                  <div className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-xl py-1" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }}>
                    <button type="button" onClick={beginBulkIdentityEdit} className={cn('flex h-9 w-full items-center gap-2 px-3 text-left text-[12.5px] font-medium', t.hoverWash)} style={{ color: t.ink }} data-testid="button-edit-identity">Edit</button>
                  </div>
                )}
              </div>
            )}
          />
          {bulkEditingIdentity ? (
            <IdentityBulkEditor t={t} draft={identityDraft} bio={bioDraft} firstFieldRef={identityFirstFieldRef} valid={bulkIdentityValid} onDraftChange={setIdentityDraft} onBioChange={setBioDraft} onSave={saveBulkIdentityEdit} />
          ) : (
            <div className="mt-2 grid grid-cols-1 lg:grid-cols-2">
              <FieldRow t={t} label="Name" value={identity.name} />
              <FieldRow t={t} label="Contact email" value={identity.email} />
              <FieldRow t={t} label="Location" value={identity.location} />
              <FieldRow t={t} label="Label" value={MOCK_ARTIST_ACCOUNT.label} />
              <FieldRow t={t} label="Type" value={identity.type} />
              <FieldRow t={t} label="Status" value={identity.status} />
              <FieldRow t={t} label="Manager" value={MOCK_ARTIST_ACCOUNT.manager} />
              <FieldRow t={t} label="Credits" value={MOCK_ARTIST_ACCOUNT.credits.join(' · ')} />
              <FieldRow t={t} label="Bio" value={bio || 'Not set'} quiet={!bio} />
            </div>
          )}
        </SectionCard>

        {/* ── Links ── */}
        <SectionCard t={t} className="group/links order-1" testid="card-links">
          <CardHead t={t} title="Links" action={
            <button ref={addLinkRef} type="button" onClick={(event) => openLinkPopover(event)} className={cn('flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 md:opacity-0 md:group-hover/links:opacity-100 md:group-focus-within/links:opacity-100', t.hoverWash)} style={{ color: t.blue }} data-testid="button-add-link">
              <Plus className="h-3.5 w-3.5" />Add
            </button>
          } />
          <div className="mt-2">
            <div className="grid grid-cols-1 gap-3 px-6 pb-6 lg:grid-cols-2">
              {MOCK_LINKS_SET.map((l) => (
                <div key={l.label} className="min-h-24 rounded-xl px-4 py-4" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
                  <ServiceIdentity carrier="brand" icon={<ServiceMark t={t} service={l.label} bare />} title={l.label} secondary={<span className="inline-flex max-w-full items-center gap-1.5"><span className="truncate">{l.value}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></span>} />
                </div>
              ))}
              {extraLinks.map((l) => (
                <div
                  ref={(node) => { linkRowRefs.current[l.id] = node; }}
                  key={l.id}
                  tabIndex={-1}
                  className={cn('group/link-row transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:!translate-y-0', linkEntryPhase?.id === l.id && linkEntryPhase.phase === 'entering' && 'translate-y-1 opacity-0', linkEntryPhase?.id === l.id && linkEntryPhase.phase === 'active' && 'bg-blue-500/10', linkEntryPhase?.id === l.id && linkEntryPhase.phase === 'exiting' && 'translate-y-1 opacity-0')}
                >
                  <div className="min-h-24 rounded-xl px-4 py-4" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}>
                    <ServiceIdentity
                      className="gap-4 [&_[data-slot=service-identity-carrier]]:size-14 [&_[data-slot=service-identity-logo]]:size-11"
                      carrier="brand"
                      icon={<ServiceMark t={t} service={l.label} bare />}
                      title={l.label}
                      secondary={l.value}
                      trailing={
                        <div className="flex items-center opacity-100 transition-opacity md:opacity-0 md:group-hover/link-row:opacity-100 md:group-focus-within/link-row:opacity-100">
                          <QuietAction t={t} icon={Pencil} onClick={(event) => openLinkPopover(event, l)} testid={`button-edit-link-${l.label.toLowerCase().replace(/\s+/g, '-')}`}>Edit</QuietAction>
                          <QuietAction t={t} icon={Trash2} danger onClick={() => setDialog({ kind: 'linkRemove', link: l })} testid={`button-remove-link-${l.label.toLowerCase().replace(/\s+/g, '-')}`}>Remove</QuietAction>
                        </div>
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── Notifications ── */}
        <SectionCard t={t} className="group/notifications order-5" testid="card-notifications">
          {recipients.length === 0 ? (
            <>
              <CardHead t={t} title="Notifications" action={
                <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/notifications:opacity-100 md:group-focus-within/notifications:opacity-100">
                  <Disclosure t={t} label="Who gets emailed" iconOnly ariaLabel="About notification recipients" testid="button-notification-recipients-info">
                    <span className="block text-[12.5px] font-semibold not-italic mb-1" style={{ color: t.ink }}>Who gets emailed</span>
                    <span className="block text-[12.5px] leading-snug not-italic" style={{ color: t.subink }}>People here receive updates about this artist, including orders, payouts, production, and fan messages.</span>
                  </Disclosure>
                  <QuietAction t={t} icon={Plus} onClick={() => setDialog({ kind: 'recipientForm' })} testid="button-add-recipient">Add recipient</QuietAction>
                </div>
              } />
              <div className="flex items-center gap-3 px-6 pb-4">
                <Bell className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <div className="flex-1 min-w-0 text-[13.5px]" style={{ color: t.faint, fontStyle: 'italic' }}>Choose who receives updates about this artist.</div>
              </div>
            </>
          ) : (
            <>
              <CardHead t={t} title="Notifications" action={
                <div className="flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover/notifications:opacity-100 md:group-focus-within/notifications:opacity-100">
                  <Disclosure t={t} label="Who gets emailed" iconOnly ariaLabel="About notification recipients" testid="button-notification-recipients-info">
                    <span className="block text-[12.5px] font-semibold not-italic mb-1" style={{ color: t.ink }}>Notification recipients</span>
                    <span className="block text-[12.5px] leading-snug not-italic" style={{ color: t.subink }}>People here receive updates about this artist, including orders, payouts, production, and fan messages.</span>
                  </Disclosure>
                  <QuietAction t={t} icon={Plus} onClick={() => setDialog({ kind: 'recipientForm' })} testid="button-add-recipient">Add recipient</QuietAction>
                </div>
              } />
              <div className="mt-2">
                {recipients.map((r) => (
                  <FieldRow
                    key={r.id}
                    t={t}
                    label={r.name}
                    value={<span className="inline-flex items-center gap-2 max-w-full"><span className="truncate">{r.email}</span><span className="text-[11px] rounded-full px-2 h-5 inline-flex items-center flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>{r.role}</span></span>}
                    action={
                      <div className="flex items-center">
                        <QuietAction t={t} icon={Pencil} onClick={() => setDialog({ kind: 'recipientForm', existing: r })} testid="button-edit-recipient">Edit</QuietAction>
                        <QuietAction t={t} icon={Trash2} danger onClick={() => setDialog({ kind: 'recipientRemove', recipient: r })} testid="button-remove-recipient">Remove</QuietAction>
                      </div>
                    }
                  />
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* ── Danger Zone (super-admin only) ── */}
      {isSuperAdmin && (
        <div className="mt-16 pt-10" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <SectionCard t={t} testid="card-danger-zone">
            <div className="flex items-center justify-between gap-4 px-6 py-5 flex-wrap sm:flex-nowrap">
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold" style={{ color: t.ink }}>{isArchived ? 'Artist archived' : 'Archive artist'}</h3>
                <p className="mt-1 text-[12.5px] leading-snug" style={{ color: t.subink }}>
                  {isArchived
                    ? `${MOCK_ARTIST_ACCOUNT.name} is hidden from active operator views. Its orders, releases, payments, and production history remain intact.`
                    : `This artist has production and order history. Archive it to remove it from active operator views while preserving its complete record.`}
                </p>
                {!isArchived && hasProtectedHistory && (
                  <p className="mt-2 text-[11.5px]" style={{ color: t.faint }}>
                    Deletion is reserved for disposable test records with no history beyond a test estimate.
                  </p>
                )}
              </div>
              <QuietAction
                t={t}
                onClick={() => {
                  setIsArchived((value) => !value);
                  showToast(isArchived ? 'Artist restored to active views' : 'Artist archived — history preserved');
                }}
                testid="button-toggle-archive-artist"
              >
                {isArchived ? 'Restore artist' : 'Archive artist'}
              </QuietAction>
            </div>
          </SectionCard>
        </div>
      )}

      {/* ── Dialogs ── */}
      {dialog?.kind === 'backfill' && (
        <BackfillDialog t={t} onClose={() => setDialog(null)} onConfirm={(press, date) => { setReferralOrigin({ press, via: 'backfill', date }); setDialog(null); showToast('Referral back-filled — attribution updated'); }} />
      )}
      {dialog?.kind === 'viewAs' && (
        <Dialog t={t} title="View as this artist" subtitle="You'll see this profile exactly as the artist does." onClose={() => setDialog(null)} testid="dialog-view-as" footer={<><CancelButton t={t} onClick={() => setDialog(null)} /><ConfirmButton t={t} label="Continue" ready onClick={() => { setDialog(null); showToast('Artist preview opened'); }} testid="confirm-view-as" /></>}>
          <div className="py-2 flex items-start gap-3 rounded-xl px-4" style={{ backgroundColor: t.cardSoft }}>
            <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.subink }} />
            <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>This is a <span style={{ color: t.ink, fontWeight: 600 }}>read-only preview</span>. Admin edits are disabled while previewing — no writes are made to this account.</div>
          </div>
        </Dialog>
      )}
      {dialog?.kind === 'press' && (
        <PressPickerDialog t={t} modeKind={dialog.mode} currentPressName={productionPressName} onClose={() => setDialog(null)} onSelect={(press) => setDialog({ kind: 'pressReview', mode: dialog.mode, press })} />
      )}
      {dialog?.kind === 'pressReview' && (
        <PressReviewDialog t={t} modeKind={dialog.mode} fromName={productionPressName} press={dialog.press} onBack={() => setDialog({ kind: 'press', mode: dialog.mode })} onClose={() => setDialog(null)} onConfirm={() => {
          if (dialog.mode === 'reassign') { setProductionAssignment('reassigned'); setProductionPressName(dialog.press.name); showToast(`Press reassigned to ${dialog.press.name}`); }
          else { setReferralOrigin({ press: dialog.press.name, via: 'direct' }); showToast(`Attribution set: came in via ${dialog.press.name}`); }
          setDialog(null);
        }} />
      )}
      {dialog?.kind === 'pressStandard' && (
        <Dialog t={t} title="Back to GoodTunes standard" subtitle="Explicit production assignment will be cleared. Referral origin is unchanged." onClose={() => setDialog(null)} testid="dialog-press-standard" footer={<><CancelButton t={t} onClick={() => setDialog(null)} /><ConfirmButton t={t} label="Set to standard" ready onClick={() => { setProductionAssignment('default'); setProductionPressName('Memphis Record Pressing'); setDialog(null); showToast('Production press set back to GoodTunes standard'); }} testid="confirm-press-standard" /></>}>
          <div className="py-2 space-y-2.5">
            <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
              <BadgeCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.ready }} />
              <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}><span style={{ color: t.ink, fontWeight: 600 }}>Memphis Record Pressing</span> becomes the production press again and the explicit reassignment is removed.</div>
            </div>
            {referralOrigin && (
              <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
                <Factory className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.subink }} />
                <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>Referral origin (<span style={{ color: t.ink, fontWeight: 600 }}>{referralOrigin.press}</span>) is <span style={{ color: t.ink, fontWeight: 600 }}>not affected</span> — attribution history is preserved separately.</div>
              </div>
            )}
          </div>
        </Dialog>
      )}
      {linkPopover && (
        <LinkPopover t={t} state={linkPopover} unsetLinks={unsetLinks} onClose={closeLinkPopover} onStateChange={setLinkPopover} onSave={(link) => {
          setExtraLinks((xs) => { const idx = xs.findIndex((x) => x.id === link.id); if (idx >= 0) { const copy = [...xs]; copy[idx] = link; return copy; } return [...xs, link]; });
          setLinkPopover(null);
          if (!linkPopover.existing) animateLinkEntry(link.id);
          showToast(linkPopover.existing ? 'Link updated' : 'Link added');
        }} />
      )}
      {dialog?.kind === 'linkRemove' && (
        <Dialog t={t} title={`Remove ${dialog.link.label}?`} subtitle="This link will be taken off the profile." onClose={() => setDialog(null)} testid="dialog-link-remove" footer={<><CancelButton t={t} onClick={() => setDialog(null)} /><ConfirmButton t={t} label="Remove link" ready danger onClick={() => { returnLinkToDestinations(dialog.link); setDialog(null); }} testid="confirm-link-remove" /></>}>
          <div className="py-2 text-[13px]" style={{ color: t.subink }}><span style={{ color: t.ink, fontWeight: 600 }}>{dialog.link.label}</span> — {dialog.link.value}</div>
        </Dialog>
      )}
      {dialog?.kind === 'shopify' && (
        <ShopifyDialog t={t} onClose={() => setDialog(null)} onConnect={() => { setShopifyConnected(true); setDialog(null); showToast('Shopify store connected'); }} />
      )}
      {dialog?.kind === 'recipientForm' && (
        <RecipientDialog t={t} existing={dialog.existing} onClose={() => setDialog(null)} onSave={(r) => {
          setRecipients((xs) => { const idx = xs.findIndex((x) => x.id === r.id); if (idx >= 0) { const copy = [...xs]; copy[idx] = r; return copy; } return [...xs, r]; });
          setDialog(null);
          showToast(dialog.existing ? 'Recipient updated' : 'Recipient added');
        }} />
      )}
      {dialog?.kind === 'recipientRemove' && (
        <Dialog t={t} title={`Remove ${dialog.recipient.name}?`} subtitle="They'll stop receiving notifications for this artist." onClose={() => setDialog(null)} testid="dialog-recipient-remove" footer={<><CancelButton t={t} onClick={() => setDialog(null)} /><ConfirmButton t={t} label="Remove recipient" ready danger onClick={() => { setRecipients((xs) => xs.filter((x) => x.id !== dialog.recipient.id)); setDialog(null); showToast('Recipient removed'); }} testid="confirm-recipient-remove" /></>}>
          <div className="py-2 text-[13px]" style={{ color: t.subink }}><span style={{ color: t.ink, fontWeight: 600 }}>{dialog.recipient.name}</span> — {dialog.recipient.email}</div>
        </Dialog>
      )}
      {dialog?.kind === 'deleteArtist' && (
        <DeleteArtistDialog
          t={t}
          artistName={MOCK_ARTIST_ACCOUNT.name}
          onClose={() => setDialog(null)}
          onConfirm={() => { setDialog(null); showToast(`${MOCK_ARTIST_ACCOUNT.name} deletion confirmed (mock — no record changed)`); }}
        />
      )}
      {dialog?.kind === 'guide' && <InteractionGuide t={t} onClose={() => setDialog(null)} />}
      {toast && <Toast t={t} message={toast} />}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export type ArtistDashboardAccountStackProps = {
  initialRole?: 'super-admin' | 'artist';
  lockRole?: boolean;
  artistShell?: boolean;
  viewingAs?: boolean;
};

export function ArtistDashboardAccountStack({
  initialRole = 'super-admin',
  lockRole = false,
  artistShell = false,
  viewingAs = false,
}: ArtistDashboardAccountStackProps = {}) {
  // Theme state (persisted)
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const saved = window.localStorage.getItem('gt-appearance');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch { /* ignore */ }
    return artistShell || initialRole === 'super-admin' ? 'dark' : 'light';
  });
  const setMode = (m: Mode) => {
    setModeState(m);
    try { window.localStorage.setItem('gt-appearance', m); } catch { /* ignore */ }
  };
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const t = mode === 'dark' || (mode === 'system' && systemDark) ? THEMES.dark : THEMES.light;

  // Role toggle (super-admin = extra operator controls)
  const [isSuperAdmin, setIsSuperAdmin] = useState(initialRole === 'super-admin');

  // Dashboard state
  const [preset, setPreset] = useState<Preset>('30d');
  const [activeTab, setActiveTab] = useState<ArtistLiveTab>('dashboard');
  const [message, setMessage] = useState('');
  const [releases, setReleases] = useState<AdminRelease[]>(INITIAL_ADMIN_RELEASES);
  const [selectedRelease, setSelectedRelease] = useState<AdminRelease | null>(null);
  const [newReleaseOpen, setNewReleaseOpen] = useState(false);
  const [deleteRelease, setDeleteRelease] = useState<AdminRelease | null>(null);

  // Header overflow menu (super-admin)
  const [headerMenu, setHeaderMenu] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div
      className={cn('min-h-[100dvh] flex flex-col font-sans antialiased', t === THEMES.dark && 'gt-admin-dark dark')}
      style={{ backgroundColor: t.canvas, color: t.ink, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}
      data-person-id={MOCK_PERSON.id}
      data-testid="artist-dashboard-account-stack"
    >
      {/* ── Caller-owned header ── */}
      {artistShell ? <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-5 sticky top-0 z-20"
        style={{ backgroundColor: t.rail, borderBottom: `1px solid ${t.hairline}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={niinaSoleilPhoto} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" style={{ border: `1px solid ${t.hairline}` }} />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>{MOCK_PERSON.name}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {viewingAs && <span className="inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium" style={{ padding: '6px 12px', border: `1px solid ${t.hairline}`, backgroundColor: t.card, color: t.ink }}>
            <Eye className="w-3.5 h-3.5" style={{ color: t.blue }} />Viewing as {MOCK_PERSON.name}
          </span>}
          <button type="button" className={cn('inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-medium px-3 h-8', t.hoverWash)} style={{ color: t.subink }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />Feedback
          </button>
          <button type="button" onClick={() => setMessage('Feedback and notifications are stubbed at the API boundary.')} className={cn('w-8 h-8 rounded-full flex items-center justify-center', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          {viewingAs
            ? <span className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-semibold" style={{ backgroundColor: t.blue, color: '#fff' }} aria-label="Admin account">Bi</span>
            : <AccountMenu t={t} mode={mode} setMode={setMode} />}
        </div>
      </header> : <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-4 pr-6 sticky top-0 z-20"
        style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo only — no adjacent role label. Utilities remain to the right. */}
          <img src={goodtunesLogo} alt="GoodTunes" className="h-7 w-auto flex-shrink-0" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!lockRole && <>
            {/* Role toggle — prototype chrome */}
            <button
              type="button"
              onClick={() => setIsSuperAdmin((v) => !v)}
              className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-colors', t.hoverWash)}
              style={{ color: t.faint, border: `1px solid ${t.hairline}` }}
              aria-label="Toggle between super-admin and artist view"
              title={isSuperAdmin ? 'Switch to Artist view' : 'Switch to Super-admin view'}
            >
              {isSuperAdmin ? <User className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
              <span className="hidden sm:inline">{isSuperAdmin ? 'Artist view' : 'Super-admin'}</span>
            </button>
            {/* Variation guide */}
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)}
              style={{ color: t.subink }}
              data-testid="button-interaction-guide"
            >
              <ListChecks className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Guide</span>
            </button>
          </>}
          <button
            type="button"
            className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Feedback</span>
          </button>
          <button
            type="button"
            onClick={() => setMessage('Feedback and notifications are stubbed at the API boundary.')}
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <AccountMenu t={t} mode={mode} setMode={setMode} />
        </div>
      </header>}

      <div className="flex flex-1 min-h-0">
        {/* ── Super-admin rail — DS OperatorRail (canon) ── */}
        {isSuperAdmin && (
          <OperatorRail
            activeId="people"
            logoSrc={goodtunesLogo}
            showLogo={false}
            className={cn('hidden lg:flex', t === THEMES.dark ? 'gt-admin-dark dark' : '')}
            onNavigate={(id) => setMessage(`${id} link held in comparison frame.`)}
          />
        )}
        {artistShell && !isSuperAdmin && (
          <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}>
            <div className="px-2.5 py-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
                <input className={cn('w-full h-9 pl-8 pr-9 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)} style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }} placeholder="Search…" readOnly />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold rounded px-1 py-0.5" style={{ color: t.faint, border: `1px solid ${t.hairline}` }}>⌘K</span>
              </div>
            </div>
            <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
              {ARTIST_LIVE_NAV.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return <button key={item.id} type="button" onClick={() => { setActiveTab(item.id); setSelectedRelease(null); }} className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors', !active && t.hoverWash)} style={{ fontWeight: active ? 600 : 500, color: active ? t.ink : t.subink, backgroundColor: active ? t.cardSoft : undefined, boxShadow: active ? t.pillShadow : undefined }}>
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.blue : t.faint }} />
                  <span className="truncate flex-1 text-left">{item.label}</span>
                </button>;
              })}
            </nav>
            <div className="px-2.5 pb-2">
              <button type="button" onClick={() => { setActiveTab('settings'); setSelectedRelease(null); }} className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors', activeTab !== 'settings' && t.hoverWash)} style={{ fontWeight: activeTab === 'settings' ? 600 : 500, color: activeTab === 'settings' ? t.ink : t.subink, backgroundColor: activeTab === 'settings' ? t.cardSoft : undefined, boxShadow: activeTab === 'settings' ? t.pillShadow : undefined }}>
                <Settings className="w-4 h-4" style={{ color: activeTab === 'settings' ? t.blue : t.faint }} /><span>Settings</span>
              </button>
            </div>
            <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
              <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: t.faint }}>Powered by</span>
              <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="mx-auto w-full px-6 sm:px-10 pt-6 pb-[120px]" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingBottom: 96 }}>
            <div className="space-y-6">

              {/* ── Breadcrumb + operator actions ── */}
              {(!artistShell || selectedRelease) && <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]" style={{ color: t.faint }}>
                  {isSuperAdmin ? <>
                    <button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('dashboard'); }} className="hover:underline" style={{ color: t.faint }}>People</button>
                    <ChevronRight className="w-3.5 h-3.5" />
                    {selectedRelease ? <button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('dashboard'); }} className="hover:underline" style={{ color: t.faint }}>{MOCK_PERSON.name}</button> : <span style={{ color: t.ink, fontWeight: 600 }}>{MOCK_PERSON.name}</span>}
                  </> : <>
                    {selectedRelease ? <button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('catalog'); }} className="hover:underline" style={{ color: t.faint }}>Releases</button> : <span style={{ color: t.ink, fontWeight: 600 }}>{activeTab === 'catalog' ? 'Releases' : ARTIST_PORTAL_TABS_GIT_BASELINE.find((item) => item.id === activeTab)?.label ?? 'Dashboard'}</span>}
                  </>}
                  {selectedRelease && (isSuperAdmin
                    ? <><ChevronRight className="w-3.5 h-3.5" /><button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('catalog'); }} className="hover:underline" style={{ color: t.faint }}>Releases</button><ChevronRight className="w-3.5 h-3.5" /><span style={{ color: t.ink, fontWeight: 600 }}>{selectedRelease.title}</span></>
                    : <><ChevronRight className="w-3.5 h-3.5" /><span style={{ color: t.ink, fontWeight: 600 }}>{selectedRelease.title}</span></>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isSuperAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMessage(`Artist portal preview opened for ${MOCK_PERSON.id} (navigation stubbed).`)}
                        className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium transition-colors', t.hoverWash)}
                        style={{ color: t.subink, border: `1px solid ${t.hairline}` }}
                      >
                        <Eye className="w-3.5 h-3.5" />View as this artist
                      </button>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setHeaderMenu(!headerMenu)}
                          className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
                          style={{ color: t.subink }}
                          aria-label="More actions"
                          aria-expanded={headerMenu}
                          data-testid="button-artist-overflow"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {headerMenu && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setHeaderMenu(false)} aria-hidden />
                            <div className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 210, boxShadow: t.popShadow }} role="menu">
                              <button type="button" onClick={() => { setHeaderMenu(false); setMessage('Back-fill referral — available in Account section below.'); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem">
                                <UserPlus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />Back-fill a referral…
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>}

              {!selectedRelease && !artistShell && <>{/* ── Artist identity header ── */}
              <div className="flex items-start gap-5">
                <button
                  type="button"
                  onClick={() => setMessage('Photo editor is stubbed at the upload boundary.')}
                  className="w-20 h-20 rounded-full flex-shrink-0 overflow-hidden ring-1"
                  style={{ backgroundColor: t.cardSoft, ...(t === THEMES.dark ? { boxShadow: `inset 0 0 0 1px ${t.hairline}` } : {}) }}
                  aria-label="Edit artist photo"
                >
                  <img src={MOCK_PERSON.photoUrl} alt="" className="h-full w-full object-cover" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>{MOCK_PERSON.shape === 'artist' ? 'Independent' : MOCK_PERSON.shape}</div>
                  <h1 className="text-[28px] sm:text-[32px] font-semibold truncate" style={{ letterSpacing: '-0.025em', lineHeight: 1.1, color: t.ink }}>
                    {MOCK_PERSON.name}
                  </h1>
                  <p className="text-[13px] mt-1 line-clamp-2 max-w-xl" style={{ color: t.subink }}>{MOCK_PERSON.bio}</p>
                </div>
              </div>

              {/* ── Six-destination underline navigation (peers, never chips) ── */}
              <div className="flex items-end gap-5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                <div className="flex items-center gap-1 overflow-x-auto min-w-0 pb-px">
                  {ARTIST_PORTAL_TABS_GIT_BASELINE.map((tab) => {
                    const on = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className="relative pb-2.5 pt-1 px-1 text-[13.5px] font-semibold whitespace-nowrap"
                        style={{ color: on ? t.ink : t.subink, borderBottom: on ? `2px solid ${t.blue}` : '2px solid transparent', marginBottom: -1 }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              </>}
              {/* ── Dashboard body (Git baseline exact) — ends after its own
                     operational sections. Account management now lives under
                     the Settings tab. ── */}
              {activeTab === 'dashboard' && (
                <DashboardBody preset={preset} t={t} onAction={setMessage} isSuperAdmin={isSuperAdmin} />
              )}

              {/* ── Settings tab — the full approved account-management region ── */}
              {activeTab === 'settings' && (
                <AccountSection t={t} isSuperAdmin={isSuperAdmin} />
              )}

              {activeTab === 'catalog' && selectedRelease ? (
                <ReleaseDetailSurface t={t} release={selectedRelease} onSave={(updated) => { setReleases((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelectedRelease(updated); setMessage('Release details saved'); }} />
              ) : activeTab === 'catalog' && (
                <ReleasesWall
                  t={t}
                  releases={releases}
                  onNewRelease={() => setNewReleaseOpen(true)}
                  onOpenRelease={(id) => {
                    const release = releases.find((item) => item.id === id);
                    if (release) setSelectedRelease(release);
                  }}
                  onDuplicateRelease={(release) => {
                     const duplicate = { ...release, id: `release-${Date.now()}`, title: `${release.title} copy`, status: 'Prepping' as const, packageState: 'draft' as const, packageSnapshot: undefined };
                    setReleases((current) => [duplicate, ...current]);
                    setSelectedRelease(duplicate);
                    setMessage('Album duplicated — opened the new Prepping draft');
                  }}
                  onDeleteRelease={setDeleteRelease}
                />
              )}

              {activeTab !== 'dashboard' && activeTab !== 'settings' && activeTab !== 'catalog' && (
                <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
                  <p className="text-[15px]" style={{ color: t.subink }}>
                    {ARTIST_LIVE_NAV.find((tab) => tab.id === activeTab)?.label ?? ARTIST_PORTAL_TABS_GIT_BASELINE.find((tab) => tab.id === activeTab)?.label ?? activeTab} — body held outside this Dashboard+Account extraction.
                  </p>
                  <button type="button" onClick={() => setActiveTab('dashboard')} className="mt-4 inline-flex items-center gap-2 text-[13.5px] font-medium rounded-full px-4 h-9" style={{ color: t.blue }}>
                    ← Back to Dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* ── Toast for dashboard actions ── */}
      {message && (
        <button
          type="button"
          onClick={() => setMessage('')}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-[12.5px] shadow-lg"
          style={{ backgroundColor: t.ink, color: t.canvas }}
          aria-live="polite"
        >
          {message}
        </button>
      )}

      {/* ── Interaction guide dialog (top-level) ── */}
      {showGuide && <InteractionGuide t={t} onClose={() => setShowGuide(false)} />}
      {newReleaseOpen && (
        <NewReleaseDialog
          t={t}
          artistName={MOCK_PERSON.name}
          onClose={() => setNewReleaseOpen(false)}
          onCreate={(title, format) => {
            const id = `release-${Date.now()}`;
             setReleases((current) => [{ id, title, format, status: 'Prepping', packageState: 'draft' }, ...current]);
            setNewReleaseOpen(false);
             setSelectedRelease({ id, title, format, status: 'Prepping', packageState: 'draft' });
          }}
        />
      )}
      {deleteRelease && (
        <Dialog t={t} title={`Delete ${deleteRelease.title}?`} subtitle="This removes the release from GoodTunes." onClose={() => setDeleteRelease(null)} testid="dialog-release-delete" footer={<><CancelButton t={t} onClick={() => setDeleteRelease(null)} /><ConfirmButton t={t} label="Delete release" ready danger onClick={() => {
          // Production maps to DELETE /api/admin/albums/:id, then Trash behavior.
          setReleases((current) => current.filter((item) => item.id !== deleteRelease.id));
          if (selectedRelease?.id === deleteRelease.id) setSelectedRelease(null);
          setDeleteRelease(null);
          setMessage('Release moved to Trash');
        }} testid="confirm-release-delete" /></>}>
          <p className="py-2 text-[13px]" style={{ color: t.subink }}>Delete <span style={{ color: t.ink, fontWeight: 600 }}>{deleteRelease.title}</span> from this artist&apos;s releases?</p>
        </Dialog>
      )}
    </div>
  );
}

export default ArtistDashboardAccountStack;
