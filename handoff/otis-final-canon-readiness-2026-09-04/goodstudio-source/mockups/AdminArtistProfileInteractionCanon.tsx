// AdminArtistProfileInteractionCanon — the merged SUPER-ADMIN artist profile
// with a COMPLETE clickable behavior contract for every new/updated action.
//
// Derived directly from AdminArtistProfile.tsx (its visual shell, tabs,
// artist data, page states, rail, header, cards and existing working
// interactions are preserved verbatim). This file only ADDS the interaction
// canon on top: every consequential action now runs through an accessible
// Apple-canon dialog/sheet with explicit confirmation, and nothing silently
// mutates or dead-ends.
//
// Canon followed (docs/apple-canon.md):
//   • Dark charcoal admin default; light mode via the account Appearance
//     control (persisted at localStorage 'gt-appearance').
//   • Confirm buttons only fill blue once the action is valid; Cancel is a
//     quiet borderless text button to the left of the confirm; confirm is
//     rightmost. Sheets carry an X in a gray circle top-right.
//   • One-line dialog subtext; longer explanation behind a quiet ⓘ tooltip.
//   • Word + icon for status, never color alone.
//   • Close/cancel changes nothing.
//
// Self-contained: MOCK_ data only. Reuses the same logo assets.

import { useEffect, useId, useRef, useState } from 'react';
import { AppleCard, AppleQuietAction, AppleSectionHeader } from '@workspace/goodtunes-design-system/components/ui/apple';
import { ServiceIdentity } from '@workspace/goodtunes-design-system/components/ui/service-identity';
import {
  Search, Bell,
  MessageSquarePlus, ChevronDown, ChevronRight, ChevronLeft,
  Factory,
  UserPlus, BadgeCheck, ArrowLeftRight, Info,
  Copy, Check, MoreHorizontal, Eye, Link2, Plus, ExternalLink, Pencil,
  Sparkles, LogOut, UserPen, CircleAlert, RotateCw, X, Lock, Trash2,
  MapPin, ListChecks, ShieldCheck, Globe, Disc3, Image, Music2,
} from 'lucide-react';
import { OperatorRail } from '@workspace/goodtunes-design-system/components/operator-rail';
import ArtistDashboardAccountStack from './ArtistDashboardAccountStack';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.svg';
import shopifyWordmarkDark from '../assets/shopify-wordmark-dark.svg';
import shopifyWordmarkLight from '../assets/shopify-wordmark-light.svg';
import shopifyBagLogo from '../assets/logo-shopify-bag.svg';
import niinaShopifyLaptop from '../assets/niina-shopify-laptop.png';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import virylIcon from '../assets/viryl-icon.svg';
import pmpIcon from '../assets/pmp-icon.svg';
import niinaSoleil from '../assets/niina-soleil.webp';
import californialandCover from '../assets/californialand-cover.jpg';
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

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Themes — dark charcoal = admin canon default; light = apple-canon ──
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


const TABS = ['Dashboard', 'Overview', 'Cover', 'Releases', 'Streaming', 'Gear', 'Splits', 'Payouts', 'Permissions'];

// ─── MOCK data ───────────────────────────────────────────────────────────
const MOCK_ADMIN = { name: 'Bill Denk', email: 'bill@goodtunes.music', initials: 'BD' };

const MOCK_ARTIST = {
  name: 'AWOLNATION',
  label: 'Independent',
  type: 'Solo artist',
  manager: 'Unmanaged',
  slug: 'awolnation',
  suggestedSlug: 'awolnation-official',
  credits: ['Artist', 'Producer'],
  email: 'aaron@awolnationmusic.com',
  location: 'Los Angeles, CA',
  status: 'Active',
};

type ReleaseFormatId = 'single_lp' | 'cd' | 'cassette';
type AdminRelease = {
  id: string;
  title: string;
  format: ReleaseFormatId;
  status: 'Prepping' | 'At press' | 'Released';
  year?: string;
  catalogNumber?: string;
  upc?: string;
};
const INITIAL_ADMIN_RELEASES: AdminRelease[] = [
  { id: 'california-land', title: 'California Land', format: 'single_lp', status: 'At press' },
  { id: 'run', title: 'Run', format: 'cd', status: 'Released' },
  { id: 'megalithic-symphony', title: 'Megalithic Symphony', format: 'single_lp', status: 'Prepping' },
];
const RELEASE_FORMATS: Array<{ id: ReleaseFormatId; label: string; detail: string }> = [
  { id: 'single_lp', label: 'Vinyl', detail: 'Choose size in builder' },
  { id: 'cd', label: 'CD', detail: 'Compact disc' },
  { id: 'cassette', label: 'Cassette', detail: 'Tape' },
];

// ── Production assignment — drives "Pressed by" heading, routing chip,
//    pricing/packages/Physical tab. Entirely separate from referral origin.
// 'default'    → MRP platform default (no explicit assignment)
// 'reassigned' → admin explicitly moved artist to a different press
type ProductionAssignment = 'default' | 'reassigned';

const PRODUCTION_META: Record<ProductionAssignment, { chip: string; line: string }> = {
  default:    { chip: 'GoodTunes standard',    line: 'Every artist presses with Memphis Record Pressing unless they came in through a press or we reassign them.' },
  reassigned: { chip: 'Reassigned by GoodTunes', line: 'GoodTunes moved this artist off the standard press.' },
};

// ── Referral origin — attribution/history only. Never mutates production
//    press or routing. Set by "Mark as came in via press" or back-fill.
type ReferralOrigin = { press: string; via: 'direct' | 'backfill'; date?: string } | null;

// Realistic press directory for the picker.
type Press = { id: string; name: string; location: string; specialty: string; status: 'Available' | 'Limited' | 'Backlogged'; isDefault?: boolean };
const MOCK_PRESSES: Press[] = [
  { id: 'mrp', name: 'Memphis Record Pressing', location: 'Bartlett, TN', specialty: 'Platform default · all formats', status: 'Available', isDefault: true },
  { id: 'hellbender', name: 'Hellbender Vinyl', location: 'Pittsburgh, PA', specialty: 'Short runs · color variants', status: 'Available' },
  { id: 'paramount', name: 'Paramount Pressing & Plating', location: 'Denver, CO', specialty: 'High-volume · standard black', status: 'Limited' },
  { id: 'viryl', name: 'Viryl Technologies', location: 'Toronto, ON, Canada', specialty: 'Precision manufacturing · color variants', status: 'Available' },
  { id: 'pmp', name: 'Physical Music Products (PMP)', location: 'Nashville, TN', specialty: 'Full-service · packaging', status: 'Available' },
];
const PARAMOUNT_LOGO = 'https://paramountpressing.com/hs-fs/hubfs/2a2c766a-803f-4745-b3af-047057e98b3a_720.png?width=400&height=455&name=2a2c766a-803f-4745-b3af-047057e98b3a_720.png';

const MOCK_LINKS_SET = [
  { label: 'Apple Music', value: 'music.apple.com/us/artist/awolnation/371362363' },
  { label: 'Spotify', value: 'open.spotify.com/artist/4njdEjTnLfcGlmKZu1iSrz' },
];
const MOCK_LINKS_UNSET = ['Instagram', 'TikTok', 'X', 'Bluesky', 'Facebook', 'Website', 'Tidal', 'Qobuz', 'Deezer', 'Pandora'];

const ARTIST_TYPES = ['Solo artist', 'Band', 'Producer', 'DJ / Electronic', 'Ensemble'];
const ARTIST_STATUSES = ['Active', 'Draft', 'Suspended'];

const NOTIFY_CATEGORIES = ['Orders', 'Payouts', 'Production updates', 'Fan messages'];
const NOTIFY_ROLES = ['Owner', 'Manager', 'Accounting', 'Assistant'];

const SHOPIFY_SYNC = [
  'Products & variants for this artist\u2019s releases',
  'Inventory levels as records are pressed',
  'Fan orders back into GoodTunes fulfillment',
];

const MOCK_ERROR_LINE = "This artist's profile didn't load.";

type Recipient = { id: string; name: string; email: string; categories: string[]; role: string };
type CustomLink = { id: string; label: string; value: string };
type LinkPopoverState = {
  mode: 'choices' | 'more' | 'form';
  anchor: { top: number; bottom: number; left: number; right: number };
  label?: string;
  existing?: CustomLink;
};

// ─── Small shared bits ───────────────────────────────────────────────────
function SectionCard({ t, children, testid }: { t: Theme; children: React.ReactNode; testid?: string }) {
  return (
    <AppleCard className="group" style={{ backgroundColor: t.card, borderColor: t.hairline }} data-testid={testid}>{children}</AppleCard>
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
    <div className="relative flex items-center gap-4 px-6 h-12" style={{ borderTop: `1px solid ${t.hairline}` }}>
      <div className="text-[13px] flex-shrink-0" style={{ color: t.subink, width: 150 }}>{label}</div>
      <div className={cn('min-w-0 flex-1 truncate text-right text-[14px]', action ? 'pr-40' : undefined)} style={{ color: quiet ? t.faint : t.ink, fontStyle: quiet ? 'italic' : undefined, fontWeight: quiet ? 400 : 500 }}>
        {value}
      </div>
      {action && <div className="absolute right-6 flex items-center justify-end">{action}</div>}
    </div>
  );
}

type IdentityData = { name: string; slug: string; email: string; location: string; type: string; status: string };

function SkeletonBar({ t, w, h = 12 }: { t: Theme; w: number | string; h?: number }) {
  return <span className="inline-block rounded-full animate-pulse" style={{ backgroundColor: t.cardSoft, width: w, height: h }} />;
}

// ─── Disclosure — quiet Apple-canon inline help. Text-forward trigger,
//     opens a small frosted popover on hover, keyboard focus, AND touch/
//     click. No native title tooltip. Works in both themes. ──────────────
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
          style={{
            top: pos.top,
            left: pos.left,
            width: 'min(320px, calc(100vw - 24px))',
            maxWidth: 'calc(100vw - 24px)',
            backgroundColor: t.card,
            border: `1px solid ${t.hairline}`,
            boxShadow: t.popShadow,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            fontStyle: 'normal',
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
          data-testid={testid ? `${testid}-popover` : undefined}
        >
          {children}
        </span>
      )}
    </span>
  );
}

// ─── Toast — small success confirmation ──────────────────────────────────
function Toast({ t, message }: { t: Theme; message: string }) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-full px-4 h-10 shadow-xl"
      style={{ bottom: 24, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }}
      role="status"
      aria-live="polite"
      data-testid="toast"
    >
      <Check className="w-4 h-4" style={{ color: t.ready }} />
      <span className="text-[13px] font-medium" style={{ color: t.ink }}>{message}</span>
    </div>
  );
}

// ─── Dialog scaffold — accessible, calm Apple sheet ──────────────────────
function Dialog({
  t, title, subtitle, onClose, children, footer, size = 'md', back, testid,
}: {
  t: Theme; title: string; subtitle?: React.ReactNode; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg';
  back?: () => void; testid?: string;
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
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full rounded-2xl overflow-hidden focus:outline-none"
        style={{ maxWidth: width, backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }}
        data-testid={testid}
      >
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
        <div className="px-6 pb-2 max-h-[62vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-1 px-6 py-4 mt-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Confirm button — quiet outline until valid, fills blue when it earns it.
function ConfirmButton({ t, label, onClick, ready, testid, danger, className }: { t: Theme; label: string; onClick: () => void; ready: boolean; testid?: string; danger?: boolean; className?: string }) {
  const activeColor = danger ? t.critical : t.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready}
      className={cn('h-9 px-4 rounded-full text-[13px] font-semibold transition-all', className)}
      style={
        ready
          ? { backgroundColor: activeColor, color: '#ffffff' }
          : { backgroundColor: 'transparent', color: t.subink, border: `1px solid ${t.hairline}`, cursor: 'not-allowed' }
      }
      data-testid={testid}
    >
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

// Labeled field for forms. `hint` renders as quiet plain subcopy under the
// control — never a mystery glyph with a native tooltip.
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

function HandlePathField({ t, value, onChange, testid, autoFocus, compact, onKeyDown }: { t: Theme; value: string; onChange: (value: string) => void; testid: string; autoFocus?: boolean; compact?: boolean; onKeyDown?: React.KeyboardEventHandler<HTMLInputElement> }) {
  const descriptionId = useId();
  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl" style={inputStyle(t)} role="group" aria-label="Artist URL; only the final path can change">
      <span className="min-w-[100px] max-w-[150px] flex-shrink truncate pl-3 text-[12.5px]" style={{ color: t.subink }}>get.goodtunes.music/</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\s+/g, '-').toLowerCase())}
        onKeyDown={onKeyDown}
        className={cn(compact ? 'h-8' : 'h-10', 'min-w-[80px] flex-1 border-l bg-transparent px-2.5 text-[13px] font-medium focus:outline-none')}
        style={{ color: t.ink, borderColor: t.hairline, boxShadow: `inset 0 0 0 1px ${t.selectWash}` }}
        aria-label="Editable artist URL path"
        aria-describedby={descriptionId}
        data-testid={testid}
      />
      <span id={descriptionId} className="sr-only">Only the final path after get.goodtunes.music slash can be changed.</span>
    </div>
  );
}

// ─── Account menu ────────────────────────────────────────────────────────
function AccountMenu({ t, mode, setMode }: { t: Theme; mode: Mode; setMode: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const APPEARANCE: Array<{ id: Mode; label: string }> = [
    { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'System' },
  ];
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn('w-8 h-8 rounded-full ring-1 flex items-center justify-center text-[11.5px] font-semibold', t.avatarRing)}
        style={{ backgroundColor: t.cardSoft, color: t.ink }}
        aria-label="Account menu"
        aria-expanded={open}
      >
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

type PageState = 'ready' | 'loading' | 'error' | 'readonly';

// Which dialog / flow is open
type ActiveDialog =
  | null
  | { kind: 'backfill' }
  | { kind: 'viewAs' }
  | { kind: 'press'; mode: 'reassign' | 'origin' }
  | { kind: 'pressReview'; mode: 'reassign' | 'origin'; press: Press }
  | { kind: 'pressStandard' }
  | { kind: 'linkChoice' }
  | { kind: 'linkForm'; existing?: CustomLink; label?: string }
  | { kind: 'linkRemove'; link: CustomLink }
  | { kind: 'shopify' }
  | { kind: 'recipientForm'; existing?: Recipient }
  | { kind: 'recipientRemove'; recipient: Recipient }
  | { kind: 'newRelease' }
  | { kind: 'releaseDelete'; release: AdminRelease }
  | { kind: 'guide' };

// ─────────────────────────────────────────────────────────────────────────
function LegacyAdminArtistProfileInteractionCanon() {
  const [mode, setModeState] = useState<Mode>(() => {
    try {
      const saved = window.localStorage.getItem('gt-appearance');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch { /* ignore */ }
    return 'dark';
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

  // Internal alternate states remain reachable without product-canvas chrome:
  // append ?mockState=loading, ?mockState=error, or ?mockState=readonly.
  const [pageState, setPageState] = useState<PageState>(() => {
    const requested = new URLSearchParams(window.location.search).get('mockState');
    return requested === 'loading' || requested === 'error' || requested === 'readonly' ? requested : 'ready';
  });
  const readonly = pageState === 'readonly';

  // ── Production press state (routing / pricing / Physical tab) ──────────
  // These two move together only when admin explicitly reassigns production.
  const [productionAssignment, setProductionAssignment] = useState<ProductionAssignment>('default');
  const [productionPressName, setProductionPressName] = useState('Memphis Record Pressing');

  // ── Referral origin state (attribution / history only) ──────────────
  // Set by "Mark as came in via press" or back-fill. Never changes production.
  const [referralOrigin, setReferralOrigin] = useState<ReferralOrigin>(null);

  const [pressMenu, setPressMenu] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [identityMenu, setIdentityMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const [bio, setBio] = useState('');
  const [linkPopover, setLinkPopover] = useState<LinkPopoverState | null>(null);
  const [copied, setCopied] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [editingArtistUrl, setEditingArtistUrl] = useState(false);
  const [artistUrlDraft, setArtistUrlDraft] = useState('');
  const [identity, setIdentity] = useState({
    name: MOCK_ARTIST.name, slug: MOCK_ARTIST.slug, email: MOCK_ARTIST.email,
    location: MOCK_ARTIST.location, type: MOCK_ARTIST.type, status: MOCK_ARTIST.status,
  });
  const [bulkEditingIdentity, setBulkEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityData>(identity);
  const [bioDraft, setBioDraft] = useState('');
  const identityMoreRef = useRef<HTMLButtonElement>(null);
  const identityFirstFieldRef = useRef<HTMLInputElement>(null);
  const addLinkRef = useRef<HTMLButtonElement>(null);
  const artistUrlEditRef = useRef<HTMLButtonElement>(null);
  const [extraLinks, setExtraLinks] = useState<CustomLink[]>([]);
  const [linkEntryPhase, setLinkEntryPhase] = useState<{ id: string; phase: 'entering' | 'active' | 'exiting' } | null>(null);
  const [returnedService, setReturnedService] = useState<string | null>(null);
  const linkRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [viewingAs, setViewingAs] = useState(false);
  const [releases, setReleases] = useState<AdminRelease[]>(INITIAL_ADMIN_RELEASES);
  const [selectedRelease, setSelectedRelease] = useState<AdminRelease | null>(null);

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

  const beginBulkIdentityEdit = () => {
    setIdentityDraft(identity);
    setBioDraft(bio);
    setIdentityMenu(false);
    setBulkEditingIdentity(true);
  };
  const closeBulkIdentityEdit = () => {
    setIdentityDraft(identity);
    setBioDraft(bio);
    setBulkEditingIdentity(false);
    window.requestAnimationFrame(() => identityMoreRef.current?.focus());
  };
  const saveBulkIdentityEdit = () => {
    const next = { name: identityDraft.name.trim(), email: identityDraft.email.trim(), location: identityDraft.location.trim(), type: identityDraft.type, status: identityDraft.status };
    if (!next.name || !/.+@.+\..+/.test(next.email)) return;
    setIdentity((current) => ({ ...current, ...next }));
    setBio(bioDraft.trim());
    setBulkEditingIdentity(false);
    showToast('Identity saved');
    window.requestAnimationFrame(() => identityMoreRef.current?.focus());
  };
  const bulkIdentityValid = identityDraft.name.trim().length > 0 && /.+@.+\..+/.test(identityDraft.email);
  const bulkIdentityChanged = identityDraft.name !== identity.name || identityDraft.email !== identity.email || identityDraft.location !== identity.location || identityDraft.type !== identity.type || identityDraft.status !== identity.status || bioDraft !== bio;
  const artistUrlValid = artistUrlDraft.trim().length > 0;
  const startArtistUrlEdit = () => {
    setArtistUrlDraft(identity.slug);
    setSuggesting(false);
    setEditingArtistUrl(true);
  };
  const cancelArtistUrlEdit = () => {
    setArtistUrlDraft(identity.slug);
    setSuggesting(false);
    setEditingArtistUrl(false);
    window.requestAnimationFrame(() => artistUrlEditRef.current?.focus());
  };
  const saveArtistUrlEdit = () => {
    const slug = artistUrlDraft.trim().replace(/\s+/g, '-').toLowerCase();
    if (!slug) return;
    setIdentity((current) => ({ ...current, slug }));
    setSuggesting(false);
    setEditingArtistUrl(false);
    showToast('Artist URL updated');
    window.requestAnimationFrame(() => artistUrlEditRef.current?.focus());
  };

  // Derived — production chip/copy only (referral origin rendered separately)
  const productionMeta = PRODUCTION_META[productionAssignment];
  const unsetLinks = MOCK_LINKS_UNSET.filter((l) => !extraLinks.some((e) => e.label === l));
  const animateLinkEntry = (id: string) => {
    setLinkEntryPhase({ id, phase: 'entering' });
    window.requestAnimationFrame(() => {
      setLinkEntryPhase({ id, phase: 'active' });
      const row = linkRowRefs.current[id];
      if (row) {
        const rect = row.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          row.focus({ preventScroll: true });
          row.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
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
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
  };
  const openLinkPopover = (event: React.MouseEvent<HTMLButtonElement>, existing?: CustomLink, label?: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setLinkPopover({
    mode: existing || label ? 'form' : 'choices',
      existing,
      label: existing?.label ?? label,
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    });
  };
  const closeLinkPopover = () => {
    setLinkPopover(null);
    window.requestAnimationFrame(() => addLinkRef.current?.focus());
  };

  return (
    <div className="min-h-[100dvh] h-screen flex flex-col font-sans" style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: t.canvas, color: t.ink }}>
      {/* ── View-as-artist preview banner ── */}
      {viewingAs && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-6 h-11 z-30" style={{ backgroundColor: t.blue, color: '#ffffff' }} data-testid="banner-view-as">
          <Eye className="w-4 h-4" />
          <span className="text-[13px] font-medium">Previewing as {identity.name} — read-only artist view. No admin changes are saved while previewing.</span>
          <button type="button" onClick={() => { setViewingAs(false); showToast('Exited artist preview'); }} className="h-7 px-3 rounded-full text-[12.5px] font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#ffffff' }} data-testid="button-exit-preview">
            Exit preview
          </button>
        </div>
      )}

      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-4 pr-6 sticky top-0 z-20"
        style={{ backgroundColor: t.headerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${t.hairline}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <img
            src={goodtunesLogo}
            alt="GoodTunes"
            className="h-8 w-auto"
            style={{ filter: t.logoFilter }}
          />
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Interaction guide — quiet top-level ghost action */}
          <button type="button" onClick={() => setDialog({ kind: 'guide' })} className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink }} data-testid="button-interaction-guide">
            <ListChecks className="w-3.5 h-3.5" />
            Interaction guide
          </button>
          <button type="button" className={cn('h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink }} data-testid="button-feedback">
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="Notifications">
            <Bell className="w-4 h-4" />
          </button>
          <AccountMenu t={t} mode={mode} setMode={setMode} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <OperatorRail
          activeId="people"
          logoSrc={goodtunesLogo}
          showLogo={false}
          className={t === THEMES.dark ? 'gt-admin-dark' : undefined}
          onNavigate={(id) => showToast(`Navigate: ${id}`)}
        />

        <main className="flex-1 min-w-0 overflow-y-auto" style={viewingAs ? { pointerEvents: 'none', opacity: 0.55 } : undefined} aria-hidden={viewingAs}>
          <div className="mx-auto w-full" style={{ maxWidth: 1240, padding: '32px 40px 96px' }}>
            {/* Breadcrumb + page actions */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap items-center gap-1.5 text-[13px]" style={{ color: t.faint }}>
                <button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('Dashboard'); }} className="hover:underline" style={{ color: t.faint }}>People</button>
                <ChevronRight className="w-3.5 h-3.5" />
                {selectedRelease ? <button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('Dashboard'); }} className="hover:underline" style={{ color: t.faint }}>{identity.name}</button> : <span style={{ color: t.ink, fontWeight: 600 }}>{identity.name}</span>}
                {selectedRelease && <><ChevronRight className="w-3.5 h-3.5" /><button type="button" onClick={() => { setSelectedRelease(null); setActiveTab('Releases'); }} className="hover:underline" style={{ color: t.faint }}>Releases</button><ChevronRight className="w-3.5 h-3.5" /><span style={{ color: t.ink, fontWeight: 600 }}>{selectedRelease.title}</span></>}
              </div>
              <div className="flex items-center gap-1.5">
                {readonly && (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 h-6" style={{ color: t.subink, backgroundColor: t.cardSoft }} data-testid="chip-view-only">
                    <Lock className="w-3 h-3" />
                    View only
                  </span>
                )}
                <QuietAction t={t} icon={Eye} onClick={() => setDialog({ kind: 'viewAs' })} testid="button-view-as-artist">View as this artist</QuietAction>
                {!readonly && (
                  <div className="relative">
                    <button type="button" onClick={() => setHeaderMenu(!headerMenu)} className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)} style={{ color: t.subink }} aria-label="More actions" aria-expanded={headerMenu} data-testid="button-artist-overflow">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {headerMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setHeaderMenu(false)} aria-hidden />
                        <div className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 210, boxShadow: t.popShadow }} role="menu" data-testid="menu-artist-overflow">
                          <button type="button" onClick={() => { setHeaderMenu(false); setDialog({ kind: 'backfill' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem" data-testid="menuitem-backfill-referral">
                            <UserPlus className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                            Back-fill a referral…
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {pageState === 'error' ? (
              <div className="mt-3">
                <SectionCard t={t} testid="card-load-error">
                  <div className="flex items-center gap-3 px-6 py-6">
                    <CircleAlert className="w-4 h-4 flex-shrink-0" style={{ color: t.critical }} />
                    <div className="flex-1 min-w-0 text-[13.5px]" style={{ color: t.ink }}>
                      {MOCK_ERROR_LINE}
                      <span className="ml-1.5" style={{ color: t.subink }}>Nothing was changed.</span>
                    </div>
                    <QuietAction t={t} icon={RotateCw} onClick={() => setPageState('ready')} testid="button-retry">Try again</QuietAction>
                  </div>
                </SectionCard>
              </div>
            ) : pageState === 'loading' ? (
              <div data-testid="state-loading">
                <div className="mt-5 flex items-center gap-5">
                  <span className="w-[76px] h-[76px] rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: t.cardSoft }} />
                  <div className="space-y-2.5">
                    <SkeletonBar t={t} w={72} h={10} />
                    <div><SkeletonBar t={t} w={280} h={26} /></div>
                  </div>
                </div>
                <div className="mt-6" style={{ borderBottom: `1px solid ${t.hairline}`, paddingBottom: 12 }}>
                  <div className="flex items-center gap-5">
                    {TABS.slice(0, 6).map((tab) => <SkeletonBar key={tab} t={t} w={64} h={12} />)}
                  </div>
                </div>
                <div className="mt-7 space-y-5">
                  {[88, 56, 320, 220, 56].map((h, i) => (
                    <div key={i} className="rounded-2xl animate-pulse" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, height: h }} />
                  ))}
                </div>
              </div>
            ) : (
              selectedRelease ? (
                <ReleaseDetailSurface t={t} release={selectedRelease} onSave={(updated) => { setReleases((current) => current.map((item) => item.id === updated.id ? updated : item)); setSelectedRelease(updated); showToast('Release details saved'); }} />
              ) : (
              <>
                {/* Artist header */}
                <div className="mt-5 flex items-center gap-5">
                  <span className={cn('w-[76px] h-[76px] rounded-full ring-1 flex-shrink-0 flex items-center justify-center text-[22px] font-bold', t.avatarRing)} style={{ backgroundColor: t.cardSoft, color: t.subink }}>
                    AW
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>{identity.status === 'Active' ? MOCK_ARTIST.label : `${MOCK_ARTIST.label} · ${identity.status}`}</div>
                    <h1 className="truncate text-[28px] font-semibold sm:text-[32px]" style={{ letterSpacing: '-0.025em', lineHeight: 1.1, color: t.ink }}>
                      {identity.name}
                    </h1>
                  </div>
                </div>

                {/* Tabs */}
                <div className="mt-6 flex items-center gap-1 overflow-x-auto" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                  {TABS.map((tab) => {
                    const on = tab === activeTab;
                    return (
                      <button key={tab} type="button" onClick={() => setActiveTab(tab)} className="px-3 pb-2.5 pt-1 text-[13.5px] whitespace-nowrap transition-colors" style={{ fontWeight: on ? 600 : 500, color: on ? t.ink : t.subink, borderBottom: on ? `2px solid ${t.blue}` : '2px solid transparent', marginBottom: -1 }} data-testid={`tab-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                        {tab}
                      </button>
                    );
                  })}
                </div>

                {activeTab !== 'Overview' && (
                  <ProfileTabView
                    t={t}
                    tab={activeTab}
                    releases={releases}
                    readonly={readonly}
                    onNewRelease={() => setDialog({ kind: 'newRelease' })}
                    onOpenRelease={setSelectedRelease}
                    onDuplicateRelease={(release) => {
                      const duplicate = { ...release, id: `release-${Date.now()}`, title: `${release.title} copy`, status: 'Prepping' as const };
                      setReleases((current) => [duplicate, ...current]);
                      setSelectedRelease(duplicate);
                      showToast('Album duplicated — opened the new Prepping draft');
                    }}
                    onDeleteRelease={(release) => setDialog({ kind: 'releaseDelete', release })}
                  />
                )}
                <div className="mt-7 space-y-5" style={{ display: activeTab === 'Overview' ? undefined : 'none' }}>
                  {/* ── Pressed by ── */}
                  <SectionCard t={t} testid="card-pressed-by">
                    <CardHead t={t} title="Production" />
                    <div className="flex items-center gap-4 px-6 py-5 flex-wrap sm:flex-nowrap">
                      <PressBrandTile t={t} press={MOCK_PRESSES.find((press) => press.name === productionPressName) ?? MOCK_PRESSES[0]} large />
                      <div className="flex-1 min-w-0">
                        {/* ── Production press row — routing/pricing/Physical ── */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-[15px] font-semibold" style={{ color: t.ink }} data-testid="text-production-press-name">
                            Pressed by {productionPressName}
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 h-6"
                            style={{ color: productionAssignment === 'default' ? t.ready : t.subink, backgroundColor: t.cardSoft }}
                            data-testid="chip-production-assignment"
                          >
                            {productionAssignment === 'default'
                              ? <BadgeCheck className="w-3.5 h-3.5" />
                              : <ArrowLeftRight className="w-3.5 h-3.5" />}
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

                        {/* ── Referral origin row — attribution/history only ── */}
                        {referralOrigin && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="row-referral-origin">
                            <span
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium rounded-full px-2.5 h-6"
                              style={{ color: t.subink, backgroundColor: t.cardSoft }}
                              data-testid="chip-referral-origin"
                            >
                              <PressBrandTile t={t} press={MOCK_PRESSES.find((press) => press.name === referralOrigin.press) ?? MOCK_PRESSES[0]} compact />
                              {referralOrigin.via === 'backfill' ? 'Referral back-filled' : 'Came in via'}
                              {' '}&mdash; {referralOrigin.press}
                            </span>
                            {referralOrigin.date && (
                              <span className="text-[11.5px]" style={{ color: t.faint }} data-testid="text-referral-date">
                                effective {referralOrigin.date}
                              </span>
                            )}
                            <span className="text-[11.5px]" style={{ color: t.faint }} data-testid="text-referral-attribution-note">
                              Attribution only — production routing is unchanged.
                            </span>
                          </div>
                        )}
                      </div>
                      {!readonly && (
                        <div className="relative flex-shrink-0">
                          <QuietAction t={t} onClick={() => setPressMenu(!pressMenu)} testid="button-change-press">Change…</QuietAction>
                          {pressMenu && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setPressMenu(false)} aria-hidden />
                              <div className="absolute right-0 mt-1 z-20 rounded-xl overflow-hidden py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, minWidth: 270, boxShadow: t.popShadow }} role="menu" data-testid="menu-change-press">
                                <button type="button" onClick={() => { setPressMenu(false); setDialog({ kind: 'press', mode: 'reassign' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem" data-testid="menuitem-reassign-press">
                                  <ArrowLeftRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                                  Reassign to another press…
                                </button>
                                <button type="button" onClick={() => { setPressMenu(false); setDialog({ kind: 'press', mode: 'origin' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem" data-testid="menuitem-mark-direct">
                                  <Factory className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                                  Mark as came in via press
                                </button>
                                {/* Only shown when production is explicitly assigned — not relevant to referral origin */}
                                {productionAssignment !== 'default' && (
                                  <button type="button" onClick={() => { setPressMenu(false); setDialog({ kind: 'pressStandard' }); }} className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] font-medium text-left', t.hoverWash)} style={{ color: t.ink }} role="menuitem" data-testid="menuitem-restore-default">
                                    <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                                    Back to GoodTunes standard
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </SectionCard>

                  {/* ── Artist link ── */}
                  <SectionCard t={t} testid="card-artist-link">
                    <CardHead t={t} title="Artist URL" />
                    {editingArtistUrl ? (
                      <form className="flex min-h-16 items-center gap-3 px-6 py-3" onSubmit={(event) => { event.preventDefault(); if (artistUrlValid) saveArtistUrlEdit(); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelArtistUrlEdit(); } }} data-testid="artist-url-inline-editor">
                        <Link2 className="h-4 w-4 flex-shrink-0" style={{ color: t.faint }} />
                        <HandlePathField t={t} value={artistUrlDraft} onChange={setArtistUrlDraft} testid="input-artist-url-slug" autoFocus />
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <QuietAction t={t} icon={Sparkles} onClick={() => setSuggesting((open) => !open)} testid="button-suggest-slug">Suggest</QuietAction>
                          <CancelButton t={t} onClick={cancelArtistUrlEdit} testid="button-cancel-artist-url" />
                          <ConfirmButton t={t} label="Save" ready={artistUrlValid && artistUrlDraft !== identity.slug} onClick={saveArtistUrlEdit} testid="button-save-artist-url" />
                        </div>
                      </form>
                    ) : (
                      <div className="flex min-h-16 items-center gap-3 px-6 py-3 flex-wrap sm:flex-nowrap">
                        <Link2 className="h-4 w-4 flex-shrink-0" style={{ color: t.faint }} />
                        <button ref={artistUrlEditRef} type="button" disabled={readonly} onClick={startArtistUrlEdit} className={cn('flex-1 min-w-0 truncate rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-default', !readonly && t.hoverWash)} style={{ color: t.ink, cursor: readonly ? undefined : 'pointer' }} aria-label="Edit artist URL" data-testid="button-edit-artist-url">
                          <span style={{ color: t.subink }}>get.goodtunes.music/</span>
                          <span style={{ color: t.ink, fontWeight: 600 }}>{identity.slug}</span>
                        </button>
                        <QuietAction t={t} icon={copied ? Check : Copy} className="h-11" onClick={() => { void navigator.clipboard?.writeText(`get.goodtunes.music/${identity.slug}`); setCopied(true); showToast('Link copied'); setTimeout(() => setCopied(false), 1400); }} testid="button-copy-link">
                          {copied ? 'Copied' : 'Copy'}
                        </QuietAction>
                      </div>
                    )}
                    {suggesting && editingArtistUrl && !readonly && (
                      <div className="flex items-center gap-3 px-6 py-3 flex-wrap" style={{ borderTop: `1px solid ${t.hairline}` }} data-testid="row-slug-suggestion">
                        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint }} />
                        <div className="flex-1 min-w-0 text-[13px] truncate" style={{ color: t.subink }}>
                          Suggested: <span style={{ color: t.ink, fontWeight: 600 }}>get.goodtunes.music/{MOCK_ARTIST.suggestedSlug}</span>
                        </div>
                        <QuietAction t={t} icon={X} onClick={() => setSuggesting(false)} testid="button-dismiss-suggestion">Keep current</QuietAction>
                        <QuietAction t={t} icon={Check} onClick={() => { setArtistUrlDraft(MOCK_ARTIST.suggestedSlug); setSuggesting(false); }} testid="button-use-suggestion">Use it</QuietAction>
                      </div>
                    )}
                  </SectionCard>

                  {/* ── Identity ── */}
                  <SectionCard t={t} testid="card-identity">
                    <CardHead t={t} title={bulkEditingIdentity ? 'Edit identity' : 'Identity'} action={bulkEditingIdentity ? <div className="flex items-center gap-1"><CancelButton t={t} onClick={closeBulkIdentityEdit} testid="button-cancel-identity-inline" className="h-11" /><ConfirmButton t={t} label="Save changes" ready={bulkIdentityChanged && bulkIdentityValid} onClick={saveBulkIdentityEdit} testid="button-save-identity-inline" className="h-11" /></div> : !readonly ? (
                      <div className="relative">
                        <button ref={identityMoreRef} type="button" onClick={() => setIdentityMenu((open) => !open)} className={cn('flex h-8 w-8 items-center justify-center rounded-full', t.hoverWash)} style={{ color: t.subink, backgroundColor: t.cardSoft }} aria-label="More identity actions" data-testid="button-identity-more"><MoreHorizontal className="h-4 w-4" /></button>
                        {identityMenu && <div className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-xl py-1" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }}><button type="button" onClick={beginBulkIdentityEdit} className={cn('flex h-9 w-full items-center gap-2 px-3 text-left text-[12.5px] font-medium', t.hoverWash)} style={{ color: t.ink }} data-testid="button-edit-identity">Edit</button></div>}
                      </div>
                    ) : undefined} />
                    {bulkEditingIdentity ? (
                      <IdentityBulkEditor t={t} draft={identityDraft} bio={bioDraft} firstFieldRef={identityFirstFieldRef} valid={bulkIdentityValid} onDraftChange={setIdentityDraft} onBioChange={setBioDraft} onSave={saveBulkIdentityEdit} />
                    ) : (
                      <div className="mt-2 grid grid-cols-1 lg:grid-cols-2">
                        <FieldRow t={t} label="Name" value={identity.name} />
                        <FieldRow t={t} label="Contact email" value={identity.email} />
                        <FieldRow t={t} label="Location" value={identity.location} />
                        <FieldRow t={t} label="Label" value={MOCK_ARTIST.label} />
                        <FieldRow t={t} label="Type" value={identity.type} />
                        <FieldRow t={t} label="Status" value={identity.status} />
                        <FieldRow t={t} label="Manager" value={MOCK_ARTIST.manager} />
                        <FieldRow t={t} label="Credits" value={MOCK_ARTIST.credits.join(' · ')} />
                        <FieldRow t={t} label="Bio" value={bio || 'Not set'} quiet={!bio} />
                      </div>
                    )}
                  </SectionCard>

                  {/* ── Links & services ── */}
                  <SectionCard t={t} testid="card-links">
                    <CardHead t={t} title="Links" action={!readonly ? <button ref={addLinkRef} type="button" onClick={(event) => openLinkPopover(event)} className={cn('flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium focus:outline-none focus-visible:ring-2', t.hoverWash)} style={{ color: t.blue }} data-testid="button-add-link"><Plus className="h-3.5 w-3.5" />Add</button> : undefined} />
                    <div className="mt-2">
                      <div className="grid grid-cols-1 gap-3 px-6 pb-6 lg:grid-cols-2">
                      {MOCK_LINKS_SET.map((l) => (
                        <div key={l.label} className="min-h-24 rounded-xl px-4 py-4" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}><ServiceIdentity carrier="brand" icon={<ServiceMark t={t} service={l.label} bare />} title={l.label} secondary={<span className="inline-flex max-w-full items-center gap-1.5"><span className="truncate">{l.value}</span><ExternalLink className="h-3 w-3 flex-shrink-0" /></span>} /></div>
                      ))}
                      {extraLinks.map((l) => (
                        <div ref={(node) => { linkRowRefs.current[l.id] = node; }} key={l.id} tabIndex={-1} className={cn('transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:!translate-y-0', linkEntryPhase?.id === l.id && linkEntryPhase.phase === 'entering' && 'translate-y-1 opacity-0', linkEntryPhase?.id === l.id && linkEntryPhase.phase === 'active' && 'bg-blue-500/10', linkEntryPhase?.id === l.id && linkEntryPhase.phase === 'exiting' && 'translate-y-1 opacity-0')}>
                          <div className="min-h-24 rounded-xl px-4 py-4" style={{ backgroundColor: t.cardSoft, border: `1px solid ${t.hairline}` }}><ServiceIdentity carrier="brand" icon={<ServiceMark t={t} service={l.label} bare />} title={l.label} secondary={l.value} trailing={!readonly && <div className="flex items-center">
                                <QuietAction t={t} icon={Pencil} onClick={(event) => openLinkPopover(event, l)} testid={`button-edit-link-${l.label.toLowerCase().replace(/\s+/g, '-')}`}>Edit</QuietAction>
                                <QuietAction t={t} icon={Trash2} danger onClick={() => setDialog({ kind: 'linkRemove', link: l })} testid={`button-remove-link-${l.label.toLowerCase().replace(/\s+/g, '-')}`}>Remove</QuietAction>
                              </div>} /></div>
                        </div>
                      ))}
                      </div>
                    </div>
                  </SectionCard>
                  <SectionCard t={t} testid="card-shopify">
                    <CardHead t={t} title="Shopify" />
                    <div className="flex min-h-20 items-center justify-between gap-4 px-6 py-4">
                      <ServiceIdentity carrier="brand" icon={<img src={shopifyBagLogo} alt="" />} title="Artist Shopify store" secondary={shopifyConnected ? 'Store connected' : 'Not connected'} />
                      {!readonly && (shopifyConnected ? <QuietAction t={t} icon={Check} testid="button-shopify-connected">Manage</QuietAction> : <QuietAction t={t} onClick={() => setDialog({ kind: 'shopify' })} testid="button-connect-shopify">Connect…</QuietAction>)}
                    </div>
                  </SectionCard>

                  {/* ── Notifications ── */}
                  <SectionCard t={t} testid="card-notifications">
                    {recipients.length === 0 ? (
                      <>
                      <CardHead t={t} title="Notifications" action={<div className="flex items-center gap-1"><Disclosure t={t} label="Who gets emailed" iconOnly ariaLabel="About notification recipients" testid="button-notification-recipients-info"><span className="block text-[12.5px] font-semibold not-italic mb-1" style={{ color: t.ink }}>Who gets emailed</span><span className="block text-[12.5px] leading-snug not-italic" style={{ color: t.subink }}>People here receive updates about this artist, including orders, payouts, production, and fan messages.</span></Disclosure>{!readonly && <QuietAction t={t} icon={Plus} onClick={() => setDialog({ kind: 'recipientForm' })} testid="button-add-recipient">Add recipient</QuietAction>}</div>} />
                      <div className="flex items-center gap-3 px-6 pb-4">
                        <Bell className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                        <div className="flex-1 min-w-0 text-[13.5px]" style={{ color: t.faint, fontStyle: 'italic' }}>
                          Choose who receives updates about this artist.
                        </div>
                      </div>
                      </>
                    ) : (
                      <>
                        <CardHead t={t} title="Notifications" action={<div className="flex items-center gap-1"><Disclosure t={t} label="Who gets emailed" iconOnly ariaLabel="About notification recipients" testid="button-notification-recipients-info"><span className="block text-[12.5px] font-semibold not-italic mb-1" style={{ color: t.ink }}>Notification recipients</span><span className="block text-[12.5px] leading-snug not-italic" style={{ color: t.subink }}>People here receive updates about this artist, including orders, payouts, production, and fan messages.</span></Disclosure>{!readonly && <QuietAction t={t} icon={Plus} onClick={() => setDialog({ kind: 'recipientForm' })} testid="button-add-recipient">Add recipient</QuietAction>}</div>} />
                        <div className="mt-2">
                          {recipients.map((r) => (
                            <FieldRow
                              key={r.id}
                              t={t}
                              label={r.name}
                              value={<span className="inline-flex items-center gap-2 max-w-full"><span className="truncate">{r.email}</span><span className="text-[11px] rounded-full px-2 h-5 inline-flex items-center flex-shrink-0" style={{ backgroundColor: t.cardSoft, color: t.subink }}>{r.role}</span></span>}
                              action={!readonly ? (
                                <div className="flex items-center">
                                  <QuietAction t={t} icon={Pencil} onClick={() => setDialog({ kind: 'recipientForm', existing: r })} testid="button-edit-recipient">Edit</QuietAction>
                                  <QuietAction t={t} icon={Trash2} danger onClick={() => setDialog({ kind: 'recipientRemove', recipient: r })} testid="button-remove-recipient">Remove</QuietAction>
                                </div>
                              ) : undefined}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </SectionCard>
                </div>
              </>
              )
            )}
          </div>
        </main>
      </div>

      {/* ══════════════════ DIALOGS / SHEETS ══════════════════ */}
      {dialog?.kind === 'backfill' && (
        <BackfillDialog
          t={t}
          onClose={() => setDialog(null)}
          onConfirm={(press, date) => {
            // Back-fill sets referral attribution only — production press is never touched.
            setReferralOrigin({ press, via: 'backfill', date });
            setDialog(null);
            showToast('Referral back-filled — attribution updated');
          }}
        />
      )}

      {dialog?.kind === 'viewAs' && (
        <Dialog
          t={t}
          title="View as this artist"
          subtitle="You'll see this profile exactly as the artist does."
          onClose={() => setDialog(null)}
          testid="dialog-view-as"
          footer={<>
            <CancelButton t={t} onClick={() => setDialog(null)} />
            <ConfirmButton t={t} label="Continue" ready onClick={() => { setViewingAs(true); setDialog(null); }} testid="confirm-view-as" />
          </>}
        >
          <div className="py-2 flex items-start gap-3 rounded-xl px-4" style={{ backgroundColor: t.cardSoft }}>
            <Eye className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.subink }} />
            <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>
              This is a <span style={{ color: t.ink, fontWeight: 600 }}>read-only preview</span>. Admin edits are disabled while previewing — no writes are made to this account. Use <span style={{ color: t.ink, fontWeight: 600 }}>Exit preview</span> in the banner to return.
            </div>
          </div>
        </Dialog>
      )}

      {dialog?.kind === 'press' && (
        <PressPickerDialog
          t={t}
          modeKind={dialog.mode}
          currentPressName={productionPressName}
          onClose={() => setDialog(null)}
          onSelect={(press) => setDialog({ kind: 'pressReview', mode: dialog.mode, press })}
        />
      )}

      {dialog?.kind === 'pressReview' && (
        <PressReviewDialog
          t={t}
          modeKind={dialog.mode}
          fromName={productionPressName}
          press={dialog.press}
          onBack={() => setDialog({ kind: 'press', mode: dialog.mode })}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            if (dialog.mode === 'reassign') {
              // ── Production press changes. Referral origin is untouched. ──
              setProductionAssignment('reassigned');
              setProductionPressName(dialog.press.name);
              showToast(`Press reassigned to ${dialog.press.name}`);
            } else {
              // ── Referral origin changes. Production press is untouched. ──
              setReferralOrigin({ press: dialog.press.name, via: 'direct' });
              showToast(`Attribution set: came in via ${dialog.press.name}`);
            }
            setDialog(null);
          }}
        />
      )}

      {dialog?.kind === 'pressStandard' && (
        <Dialog
          t={t}
          title="Back to GoodTunes standard"
          subtitle="Explicit production assignment will be cleared. Referral origin is unchanged."
          onClose={() => setDialog(null)}
          testid="dialog-press-standard"
          footer={<>
            <CancelButton t={t} onClick={() => setDialog(null)} />
            <ConfirmButton
              t={t}
              label="Set to standard"
              ready
              onClick={() => {
                // Clears explicit production assignment only. Referral origin stays.
                setProductionAssignment('default');
                setProductionPressName('Memphis Record Pressing');
                setDialog(null);
                showToast('Production press set back to GoodTunes standard');
              }}
              testid="confirm-press-standard"
            />
          </>}
        >
          <div className="py-2 space-y-2.5">
            <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }}>
              <BadgeCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.ready }} />
              <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>
                <span style={{ color: t.ink, fontWeight: 600 }}>Memphis Record Pressing</span> becomes the production press again and the explicit reassignment is removed. Pricing, packages, and the Physical tab will follow the standard press.
              </div>
            </div>
            {referralOrigin && (
              <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: t.cardSoft }} data-testid="note-referral-preserved">
                <Factory className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: t.subink }} />
                <div className="text-[13px] leading-relaxed" style={{ color: t.subink }}>
                  Referral origin (<span style={{ color: t.ink, fontWeight: 600 }}>{referralOrigin.press}</span>) is <span style={{ color: t.ink, fontWeight: 600 }}>not affected</span> — attribution history is preserved separately.
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {linkPopover && (
        <LinkPopover
          t={t}
          state={linkPopover}
          unsetLinks={unsetLinks}
          onClose={closeLinkPopover}
          onStateChange={setLinkPopover}
          onSave={(link) => {
            setExtraLinks((xs) => {
              const idx = xs.findIndex((x) => x.id === link.id);
              if (idx >= 0) { const copy = [...xs]; copy[idx] = link; return copy; }
              return [...xs, link];
            });
            setLinkPopover(null);
            if (!linkPopover.existing) animateLinkEntry(link.id);
            showToast(linkPopover.existing ? 'Link updated' : 'Link added');
          }}
        />
      )}

      {dialog?.kind === 'linkRemove' && (
        <Dialog
          t={t}
          title={`Remove ${dialog.link.label}?`}
          subtitle="This link will be taken off the profile."
          onClose={() => setDialog(null)}
          testid="dialog-link-remove"
          footer={<>
            <CancelButton t={t} onClick={() => setDialog(null)} />
            <ConfirmButton t={t} label="Remove link" ready danger onClick={() => { returnLinkToDestinations(dialog.link); setDialog(null); }} testid="confirm-link-remove" />
          </>}
        >
          <div className="py-2 text-[13px]" style={{ color: t.subink }}>
            <span style={{ color: t.ink, fontWeight: 600 }}>{dialog.link.label}</span> — {dialog.link.value}
          </div>
        </Dialog>
      )}

      {dialog?.kind === 'shopify' && (
        <ShopifyDialog t={t} onClose={() => setDialog(null)} onConnect={() => { setShopifyConnected(true); setDialog(null); showToast('Shopify store connected'); }} />
      )}

      {dialog?.kind === 'recipientForm' && (
        <RecipientDialog
          t={t}
          existing={dialog.existing}
          onClose={() => setDialog(null)}
          onSave={(r) => {
            setRecipients((xs) => {
              const idx = xs.findIndex((x) => x.id === r.id);
              if (idx >= 0) { const copy = [...xs]; copy[idx] = r; return copy; }
              return [...xs, r];
            });
            setDialog(null);
            showToast(dialog.existing ? 'Recipient updated' : 'Recipient added');
          }}
        />
      )}

      {dialog?.kind === 'recipientRemove' && (
        <Dialog
          t={t}
          title={`Remove ${dialog.recipient.name}?`}
          subtitle="They'll stop receiving notifications for this artist."
          onClose={() => setDialog(null)}
          testid="dialog-recipient-remove"
          footer={<>
            <CancelButton t={t} onClick={() => setDialog(null)} />
            <ConfirmButton t={t} label="Remove recipient" ready danger onClick={() => { setRecipients((xs) => xs.filter((x) => x.id !== dialog.recipient.id)); setDialog(null); showToast('Recipient removed'); }} testid="confirm-recipient-remove" />
          </>}
        >
          <div className="py-2 text-[13px]" style={{ color: t.subink }}>
            <span style={{ color: t.ink, fontWeight: 600 }}>{dialog.recipient.name}</span> — {dialog.recipient.email}
          </div>
        </Dialog>
      )}

      {dialog?.kind === 'guide' && (
        <InteractionGuide t={t} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'newRelease' && (
        <NewReleaseDialog
          t={t}
          artistName={identity.name}
          onClose={() => setDialog(null)}
          onCreated={(release) => {
            setReleases((current) => [release, ...current]);
            setDialog(null);
            setActiveTab('Releases');
            // Production POST /api/admin/albums lands at
            // /admin/albums/:id?onboarding=1. This prototype keeps that
            // artist-scoped handoff in-frame so the release walk is reviewable.
            setSelectedRelease(release);
          }}
        />
      )}

      {dialog?.kind === 'releaseDelete' && (
        <Dialog
          t={t}
          title={`Delete ${dialog.release.title}?`}
          subtitle="This removes the release from GoodTunes."
          onClose={() => setDialog(null)}
          testid="dialog-release-delete"
          footer={<>
            <CancelButton t={t} onClick={() => setDialog(null)} />
            <ConfirmButton t={t} label="Delete release" ready danger onClick={() => {
              // Production maps to DELETE /api/admin/albums/:id, then Trash.
              setReleases((current) => current.filter((release) => release.id !== dialog.release.id));
              if (selectedRelease?.id === dialog.release.id) setSelectedRelease(null);
              setDialog(null);
              showToast('Release moved to Trash');
            }} testid="confirm-release-delete" />
          </>}
        >
          <p className="py-2 text-[13px]" style={{ color: t.subink }}>Delete <span style={{ color: t.ink, fontWeight: 600 }}>{dialog.release.title}</span> from this artist&apos;s releases?</p>
        </Dialog>
      )}

      {toast && <Toast t={t} message={toast} />}
    </div>
  );
}

// ─── Back-fill referral dialog ───────────────────────────────────────────
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
      <Dialog
        t={t}
        title="Confirm back-fill"
        subtitle="Attribution only — production stays the same."
        onClose={onClose}
        back={() => setReview(false)}
        testid="dialog-backfill-review"
        footer={<>
          <CancelButton t={t} onClick={onClose} />
          <ConfirmButton t={t} label="Back-fill referral" ready onClick={() => onConfirm(selected.name, date)} testid="confirm-backfill" />
        </>}
      >
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
    <Dialog
      t={t}
      title="Back-fill a referral"
      subtitle="Record who referred this artist, after the fact."
      onClose={onClose}
      testid="dialog-backfill"
      footer={<>
        <CancelButton t={t} onClick={onClose} />
        <ConfirmButton t={t} label="Review" ready={canReview} onClick={() => setReview(true)} testid="confirm-backfill-review" />
      </>}
    >
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
            {results.length === 0 && <div className="text-[13px] px-3 py-2" style={{ color: t.faint }}>No presses match “{query}”.</div>}
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

function ReviewRow({ t, label, value }: { t: Theme; label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5" style={{ borderBottom: `1px solid ${t.hairline}` }}>
      <span className="text-[12.5px] flex-shrink-0" style={{ color: t.subink }}>{label}</span>
      <span className="text-[13.5px] font-medium text-right" style={{ color: t.ink }}>{value}</span>
    </div>
  );
}

function ProfileTabView({ t, tab, releases, readonly, onNewRelease, onOpenRelease, onDuplicateRelease, onDeleteRelease }: {
  t: Theme;
  tab: string;
  releases: AdminRelease[];
  readonly: boolean;
  onNewRelease: () => void;
  onOpenRelease: (release: AdminRelease) => void;
  onDuplicateRelease: (release: AdminRelease) => void;
  onDeleteRelease: (release: AdminRelease) => void;
}) {
  if (tab === 'Releases') {
    return (
      <div className="mt-7 space-y-5" data-testid="tab-view-goodtunes-releases">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[22px] font-semibold" style={{ color: t.ink, letterSpacing: '-0.025em' }}>
              Releases. <span className="font-medium" style={{ color: t.subink }}>Every record you’ve made.</span>
            </h2>
          </div>
          {!readonly && (
            <button type="button" onClick={onNewRelease} className="h-9 px-4 rounded-full text-[13px] font-semibold" style={{ border: `1px solid ${t.subink}`, color: t.ink, backgroundColor: 'transparent' }} data-testid="button-new-release">
              <Plus className="w-3.5 h-3.5 inline-block mr-1.5 -mt-0.5" /> New release
            </button>
          )}
        </div>
        {releases.length === 0 ? (
          <SectionCard t={t} testid="card-releases-empty">
            <div className="px-6 py-12 text-center">
              <Disc3 className="mx-auto w-8 h-8" style={{ color: t.faint }} />
              <p className="mt-3 text-[15px] font-semibold" style={{ color: t.ink }}>No releases yet.</p>
              <p className="mt-1 text-[13px]" style={{ color: t.subink }}>Create the first release to start its project.</p>
            </div>
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="release-collection">
            {releases.map((release) => (
              <ReleaseWallCard key={release.id} t={t} release={release} readonly={readonly} onOpen={() => onOpenRelease(release)} onDuplicate={() => onDuplicateRelease(release)} onDelete={() => onDeleteRelease(release)} />
            ))}
          </div>
        )}
      </div>
    );
  }
  const content: Record<string, { title: string; detail: string; stat: string; rows: [string, string][] }> = {
    Dashboard: { title: 'Artist activity', detail: 'Operational summary for AWOLNATION.', stat: '3 active releases', rows: [['Active releases', '3'], ['Payout status', 'Review scheduled'], ['Needs attention', '2 production notes']] },
    Cover: { title: 'Artist cover', detail: 'Current identity artwork and provenance.', stat: 'Current cover', rows: [['Profile image', 'AW monogram'], ['Banner', 'California Land artwork'], ['Last updated', 'May 18']] },
    Releases: { title: 'Releases', detail: 'Cover-first release collection and production states.', stat: '3 releases', rows: [['California Land', 'Vinyl · In production'], ['Run', 'Digital · Published'], ['Megalithic Symphony', 'Vinyl · Draft']] },
    Streaming: { title: 'Streaming performance', detail: 'Demo totals across verified artist destinations.', stat: '2 connected services', rows: [['Spotify', 'Verified · sync healthy'], ['Apple Music', 'Verified · sync healthy'], ['Last sync', 'Today']] },
    Gear: { title: 'Artist gear', detail: 'Assigned merchandise and availability.', stat: '2 assigned items', rows: [['California Land LP', 'Available · 42 in stock'], ['AWOLNATION tee', 'Paused'], ['Fulfillment', 'Memphis Record Pressing']] },
    Splits: { title: 'Release splits', detail: 'Contributor allocations reconcile per release.', stat: '1 needs review', rows: [['California Land', '100% allocated'], ['Aaron Bruno', '75% · Accepted'], ['Producer split', '25% · Needs review']] },
    Payouts: { title: 'Payouts', detail: 'Artist payment account and statement history.', stat: 'Next review · May 31', rows: [['Available', 'Demo balance · ready'], ['Pending', 'Statement processing'], ['Payout account', 'Verified']] },
    Permissions: { title: 'Permissions', detail: 'People with access to this artist account.', stat: '2 members', rows: [['Aaron Bruno', 'Owner · active'], ['Management team', 'Editor · active'], ['Last audit', 'Today']] },
  };
  const view = content[tab] ?? content.Dashboard;
  return <div className="mt-7 space-y-5" data-testid={`tab-view-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
    <SectionCard t={t}><CardHead t={t} title={view.title} action={<QuietAction t={t} onClick={() => window.alert(`${tab} review opened`)} testid={`button-review-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`}>Review</QuietAction>} /><div className="px-6 pb-5"><p className="text-[14px]" style={{ color: t.subink }}>{view.detail}</p><div className="mt-4 inline-flex rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ backgroundColor: t.cardSoft, color: t.ink }}>{view.stat}</div></div></SectionCard>
    <SectionCard t={t}><CardHead t={t} title="Details" /><div>{view.rows.map(([label, value]) => <FieldRow key={label} t={t} label={label} value={value} />)}</div></SectionCard>
  </div>;
}

function ReleaseWallCard({ t, release, readonly, onOpen, onDuplicate, onDelete }: {
  t: Theme;
  release: AdminRelease;
  readonly: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const closeMenu = () => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} className="group relative cursor-pointer overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid={`row-release-${release.id}`}>
      <div className="relative flex aspect-square items-center justify-center" style={{ backgroundColor: t.cardSoft }}>
        {release.id === 'california-land' ? <img src={californialandCover} alt={`${release.title} artwork`} className="absolute inset-0 h-full w-full object-cover" /> : <Disc3 className="h-14 w-14" style={{ color: t.faint }} />}
        {!readonly && (
          <button ref={triggerRef} type="button" onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }} className={cn('absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100', menuOpen && 'opacity-100')} style={{ backgroundColor: 'rgba(255,255,255,0.88)', color: '#1d1d1f', backdropFilter: 'blur(8px)' }} aria-label={`Actions for ${release.title}`} aria-expanded={menuOpen} data-open={menuOpen} data-testid={`button-release-menu-${release.id}`}>
            <MoreHorizontal className="h-4 w-4" strokeWidth={2.25} />
          </button>
        )}
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(event) => { event.stopPropagation(); closeMenu(); }} aria-hidden />
            <div className="absolute right-3 top-12 z-20 w-44 overflow-hidden rounded-xl py-1 shadow-xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}`, boxShadow: t.popShadow }} role="menu" data-testid={`menu-release-${release.id}`}>
              <button type="button" onClick={(event) => { event.stopPropagation(); closeMenu(); onDuplicate(); }} className={cn('flex h-9 w-full items-center px-3 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.ink }} role="menuitem" data-testid={`menuitem-duplicate-release-${release.id}`}>Duplicate release</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); closeMenu(); onDelete(); }} className={cn('flex h-9 w-full items-center px-3 text-left text-[13px] font-medium', t.hoverWash)} style={{ color: t.critical }} role="menuitem" data-testid={`menuitem-delete-release-${release.id}`}>Delete release…</button>
            </div>
          </>
        )}
      </div>
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <span className="truncate text-[15px] font-semibold" style={{ color: t.ink }}>{release.title}</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: t.faint }} />
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[12.5px]" style={{ color: t.subink }}>
          <span>{RELEASE_FORMATS.find((f) => f.id === release.format)?.label ?? 'Format'}</span><span>·</span><span>{release.status}</span>
        </div>
      </div>
    </div>
  );
}

function NewReleaseDialog({ t, artistName, onClose, onCreated }: {
  t: Theme;
  artistName: string;
  onClose: () => void;
  onCreated: (release: AdminRelease) => void;
}) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<ReleaseFormatId>('single_lp');
  const canSubmit = name.trim().length > 0;
  return (
    <Dialog t={t} title="New release." subtitle="Name it and pick the first format — everything else happens on the project page." onClose={onClose} size="lg" testid="sheet-new-release" footer={<>
      <CancelButton t={t} onClick={onClose} testid="button-new-release-cancel" />
      <ConfirmButton t={t} label="Create release" ready={canSubmit} onClick={() => onCreated({ id: `release-${Date.now()}`, title: name.trim(), format, status: 'Prepping' })} testid="button-new-release-create" />
    </>}>
      <div className="py-1">
        <Field t={t} label="Release name">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onCreated({ id: `release-${Date.now()}`, title: name.trim(), format, status: 'Prepping' }); }} placeholder="e.g. CALIFORNIALAND" className="w-full h-10 px-3 rounded-xl text-[14px] focus:outline-none" style={inputStyle(t)} data-testid="input-new-release-name" />
        </Field>
        {RELEASE_FORMATS.length > 1 && (
          <Field t={t} label="First format">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="First format">
              {RELEASE_FORMATS.map((item) => {
                const selected = item.id === format;
                return <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setFormat(item.id)} className="min-h-[76px] rounded-xl px-3 py-3 text-left transition-colors" style={{ backgroundColor: selected ? t.selectWash : 'transparent', border: `1px solid ${selected ? t.blue : t.hairline}`, color: t.ink }} data-testid={`option-new-release-format-${item.id}`}>
                  <span className="block text-[14px] font-semibold">{item.label}</span>
                  <span className="block mt-0.5 text-[12px]" style={{ color: t.subink }}>{item.detail}</span>
                </button>;
              })}
            </div>
          </Field>
        )}
        <p className="mt-2 text-[11.5px]" style={{ color: t.faint }}>This creates a GoodTunes release draft for {artistName} and opens onboarding.</p>
      </div>
    </Dialog>
  );
}

const RELEASE_DETAIL_TABS = ['Dashboard', 'Details', 'Assets', 'Store', 'Payments'] as const;
type ReleaseDetailTab = (typeof RELEASE_DETAIL_TABS)[number];

function ReleaseDetailSurface({ t, release, onSave }: { t: Theme; release: AdminRelease; onSave: (release: AdminRelease) => void }) {
  const [tab, setTab] = useState<ReleaseDetailTab>('Dashboard');
  const [assetFormat, setAssetFormat] = useState<'Master' | 'GoodTunes® Player' | 'Vinyl'>('Master');
  const [assetLane, setAssetLane] = useState<'Art' | 'Audio'>('Art');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: release.title, year: release.year ?? '', catalogNumber: release.catalogNumber ?? '', upc: release.upc ?? '' });
  const format = RELEASE_FORMATS.find((item) => item.id === release.format);
  const assetFormats: Array<typeof assetFormat> = release.format === 'single_lp'
    ? ['Master', 'GoodTunes® Player', 'Vinyl']
    : ['Master', 'GoodTunes® Player'];
  const formatStatus = release.status === 'Released' ? 'Live' : release.status === 'At press' ? 'At press' : 'Draft';
  const cancelEdit = () => { setDraft({ title: release.title, year: release.year ?? '', catalogNumber: release.catalogNumber ?? '', upc: release.upc ?? '' }); setEditing(false); };
  const saveEdit = () => { if (!draft.title.trim()) return; onSave({ ...release, title: draft.title.trim(), year: draft.year.trim() || undefined, catalogNumber: draft.catalogNumber.trim() || undefined, upc: draft.upc.trim() || undefined }); setEditing(false); };
  return (
    <section data-testid="release-detail-surface">
      {/* Verified artist release route: /admin/albums/:id for operator view.
          A locally created release retains the source onboarding query
          /admin/albums/:id?onboarding=1 while this sandbox keeps navigation in-frame. */}
      <div className="mt-6 flex items-center gap-8 overflow-x-auto" role="tablist" aria-label="Release section" data-testid="release-tabbar">
        {RELEASE_DETAIL_TABS.map((item) => {
          const active = item === tab;
          return <button key={item} type="button" role="tab" aria-selected={active} onClick={() => setTab(item)} className="pb-2.5 text-[15px] whitespace-nowrap transition-colors" style={{ color: active ? t.ink : t.subink, fontWeight: active ? 600 : 500, borderBottom: active ? `2px solid ${t.blue}` : '2px solid transparent' }} data-testid={`tab-release-${item.toLowerCase()}`}>{item}</button>;
        })}
      </div>
      <div style={{ borderTop: `1px solid ${t.hairline}`, marginTop: -1 }} />
      <div className="mt-6">
        {tab === 'Dashboard' && (
          <><div className="overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="release-dashboard">
            <button type="button" onClick={() => setTab('Assets')} className={cn('flex w-full items-center justify-between gap-6 px-5 py-4 text-left transition-colors', t.hoverWash)} data-testid={`dashboard-format-${release.format}-0`}>
              <span className="text-[14px] font-semibold" style={{ color: t.ink }}>{format?.label}</span>
              <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: t.subink }}>
                {formatStatus === 'Live' ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.subink }} />}
                {formatStatus}<ChevronRight className="h-4 w-4" style={{ color: t.faint }} />
              </span>
            </button>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3" data-testid="dashboard-stats">{[['Sales · lifetime','—','Copies sold'],['Fan plays · lifetime','—','Across the GoodTunes® Player'],['Certified GoodDeeds®','—','One per copy sold']].map(([label,value,note]) => <div key={label} className="rounded-2xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}><p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>{label}</p><p className="mt-2 text-[28px] font-semibold tabular-nums" style={{ color: t.ink }}>{value}</p><p className="mt-1 text-[12px]" style={{ color: t.subink }}>{note}</p></div>)}</div></>
        )}
        {tab === 'Details' && <><div className="flex items-end justify-between gap-4"><div><h2 className="text-[22px] font-semibold" style={{ color: t.ink }}>Release details.</h2><p className="mt-1 text-[13px]" style={{ color: t.subink }}>Everything about this release at a glance.</p></div>{!editing && <button type="button" onClick={() => setEditing(true)} className={cn('rounded-full px-3 py-2 text-[13px] font-medium', t.hoverWash)} style={{ color: t.blue }}>Edit</button>}</div><div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="release-details">{[['Title','title'],['Year','year'],['Catalog Number','catalogNumber'],['UPC Code','upc']].map(([label,key]) => <FieldRow key={key} t={t} label={label} value={editing ? <input value={draft[key as keyof typeof draft]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') saveEdit(); }} className="h-8 w-44 rounded-lg px-2 text-right text-[13px] outline-none" style={inputStyle(t)} aria-label={label} /> : (key === 'title' ? release.title : release[key as keyof AdminRelease] || '—')} />)}<FieldRow t={t} label="Artist" value={MOCK_ARTIST.name} /><FieldRow t={t} label="Format" value={format?.label ?? '—'} /><FieldRow t={t} label="Tracks" value="—" /><FieldRow t={t} label="Visibility" value="—" /></div>{editing && <div className="mt-4 flex justify-end gap-1"><CancelButton t={t} onClick={cancelEdit} /><ConfirmButton t={t} label="Save" ready={Boolean(draft.title.trim())} onClick={saveEdit} /></div>}</>}
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
                <h2 className="text-[22px] font-semibold tracking-tight" style={{ color: t.ink }}>{assetFormat} {assetLane.toLowerCase()}</h2>
                {assetLane === 'Art' && <button type="button" className={cn('inline-flex items-center gap-1 text-[12px] font-medium', t.hoverWash)} style={{ color: t.subink }}><Image className="h-3.5 w-3.5" />Templates</button>}
              </div>
              <p className="mt-1 text-[13px]" style={{ color: t.subink }}>{assetLane === 'Art' ? assetFormat === 'Master' ? 'Your canonical album art. Every format references it until you override.' : assetFormat === 'Vinyl' ? 'Print requirements appear here after file scanning.' : 'Artwork for the GoodTunes® Player.' : 'Audio masters appear here once they are added.'}</p>
            </div>
            <div className="inline-flex rounded-full p-1" style={{ backgroundColor: t.cardSoft }} role="tablist" aria-label="Asset lane">
              <button type="button" role="tab" aria-selected={assetLane === 'Art'} onClick={() => setAssetLane('Art')} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ backgroundColor: assetLane === 'Art' ? t.card : 'transparent', boxShadow: assetLane === 'Art' ? t.pillShadow : undefined, color: assetLane === 'Art' ? t.ink : t.subink }}><Image className="h-3.5 w-3.5" />Art</button>
              <button type="button" role="tab" aria-selected={assetLane === 'Audio'} onClick={() => setAssetLane('Audio')} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ backgroundColor: assetLane === 'Audio' ? t.card : 'transparent', boxShadow: assetLane === 'Audio' ? t.pillShadow : undefined, color: assetLane === 'Audio' ? t.ink : t.subink }}><Music2 className="h-3.5 w-3.5" />Audio</button>
            </div>
          </div>
          <div className="mt-5 flex min-h-[300px] items-center justify-center rounded-2xl px-6 py-9 text-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}>
            {assetLane === 'Art' && assetFormat !== 'Vinyl' ? <div className="max-w-sm">
              {release.id === 'california-land' ? <img src={californialandCover} alt={`${release.title} artwork`} className="mx-auto h-28 w-28 rounded-xl object-cover" /> : <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-xl" style={{ backgroundColor: t.cardSoft }}><Disc3 className="h-8 w-8" style={{ color: t.faint }} /></div>}
              <p className="mt-4 text-[14px] font-semibold" style={{ color: t.ink }}>{assetFormat === 'Master' ? 'Album art — the canonical source' : 'Player art — using album art'}</p>
              <p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>{assetFormat === 'Master' ? 'Uploaded once at Master. Switch to a physical format to see each checked press template.' : 'The GoodTunes® Player uses your album art until you override it.'}</p>
            </div> : assetLane === 'Art' ? <div><p className="text-[14px] font-semibold" style={{ color: t.ink }}>No print files scanned yet</p><p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Print requirements appear here after file scanning.</p></div> : <div><p className="text-[14px] font-semibold" style={{ color: t.ink }}>No audio master added yet.</p><p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Audio masters appear here once they are added.</p></div>}
          </div>
        </div>}
        {tab === 'Store' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]" data-testid="release-store"><div className="space-y-5"><div className="rounded-2xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}><p className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Where fans buy</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{['GoodTunes® Direct','GoodTunes® for Shopify'].map((item) => <div key={item} className="rounded-xl p-3 text-[13px] font-medium" style={{ border: `1px solid ${t.hairline}`, color: t.subink }}>{item}</div>)}</div></div><div className="rounded-2xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}><p className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Share link</p><p className="mt-1 text-[12.5px]" style={{ color: t.subink }}>Share links appear once your storefront page is set up.</p></div><div className="rounded-2xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}><p className="text-[14.5px] font-semibold" style={{ color: t.ink }}>Email appearance</p><p className="mt-3 text-[13px]" style={{ color: t.subink }}>Your {release.title} order is on its way.</p></div></div><div className="rounded-2xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }}><p className="text-[15px] font-semibold" style={{ color: t.ink }}>Getting ready</p>{['Artwork — not started','Audio — not started','Price — not set','Sales channel — not chosen'].map((item) => <p key={item} className="mt-4 text-[13px]" style={{ color: t.subink }}>○ {item}</p>)}</div></div>
        )}
        {tab === 'Payments' && (
          <><h2 className="text-[22px] font-semibold" style={{ color: t.ink }}>Money out to the plant.</h2><p className="mt-1 text-[13px]" style={{ color: t.subink }}>Track payments due for this release.</p><div className="mt-5 rounded-2xl px-6 py-12 text-center" style={{ backgroundColor: t.card, border: `1px solid ${t.hairline}` }} data-testid="release-payments"><p className="text-[14px] font-semibold" style={{ color: t.ink }}>Nothing owed on this release</p></div></>
        )}
      </div>
    </section>
  );
}

function PressBrandTile({ t, press, large, compact }: { t: Theme; press: Press; large?: boolean; compact?: boolean }) {
  const logos: Record<string, string | undefined> = { mrp: mrpLogo, hellbender: hellbenderIcon, paramount: PARAMOUNT_LOGO, viryl: virylIcon, pmp: pmpIcon };
  const size = compact ? 'h-5 w-5 p-0.5' : large ? 'h-12 w-12 p-1.5' : 'h-11 w-11 p-1.5';
  return (
    <span className={cn('flex flex-shrink-0 items-center justify-center rounded-xl', size)} style={{ backgroundColor: press.id === 'mrp' ? '#ffffff' : t.cardSoft, border: `1px solid ${t.hairline}` }}>
      {logos[press.id] ? (
        <img src={logos[press.id]} alt="" className={large ? 'max-h-9 max-w-9 object-contain' : compact ? 'max-h-4 max-w-4 object-contain' : 'max-h-8 max-w-8 object-contain'} />
      ) : (
        <span className="text-[10px] font-semibold tracking-wide" style={{ color: t.subink }} aria-label={`${press.name} monogram`}>•</span>
      )}
    </span>
  );
}

// ─── Press picker dialog (reassign / origin) ─────────────────────────────
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
    <Dialog
      t={t}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      size="lg"
      testid="dialog-press-picker"
      footer={<>
        <CancelButton t={t} onClick={onClose} />
        <ConfirmButton t={t} label="Review" ready={!!picked} onClick={() => picked && onSelect(picked)} testid="confirm-press-select" />
      </>}
    >
      <div className="py-1">
        <div className="text-[12px] mb-2" style={{ color: t.subink }}>
          Current press: <span style={{ color: t.ink, fontWeight: 600 }}>{currentPressName}</span>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: t.faint }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search presses…" className="w-full h-10 pl-9 pr-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-press-search" autoFocus />
        </div>
        <div className="relative h-[268px] overflow-hidden" data-testid="press-results-viewport">
          <div className="h-full space-y-1.5 overflow-y-auto pr-1 pb-12">
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
            {results.length === 0 && <div className="flex h-full items-center justify-center px-3 text-center text-[13px]" style={{ color: t.faint }}>No presses match “{query}”.</div>}
          </div>
          {results.length > 3 && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
              style={{
                background: `linear-gradient(to bottom, transparent, ${t.card})`,
                backdropFilter: 'blur(2px)',
                WebkitBackdropFilter: 'blur(2px)',
              }}
              aria-hidden
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ─── Press review / confirm ──────────────────────────────────────────────
function PressReviewDialog({ t, modeKind, fromName, press, onBack, onClose, onConfirm }: { t: Theme; modeKind: 'reassign' | 'origin'; fromName: string; press: Press; onBack: () => void; onClose: () => void; onConfirm: () => void }) {
  const isReassign = modeKind === 'reassign';
  return (
    <Dialog
      t={t}
      title={isReassign ? 'Review reassignment' : 'Review referral origin'}
      subtitle={isReassign ? 'This changes the production press.' : 'Attribution only — production press stays the same.'}
      onClose={onClose}
      back={onBack}
      testid="dialog-press-review"
      footer={<>
        <CancelButton t={t} onClick={onClose} />
        <ConfirmButton t={t} label={isReassign ? 'Reassign press' : 'Set as referral origin'} ready onClick={onConfirm} testid="confirm-press-commit" />
      </>}
    >
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
            {isReassign ? (
              <>Pricing, packages, and the Physical tab will follow <span style={{ color: t.ink, fontWeight: 600 }}>{press.name}</span> going forward. Existing orders in flight are not moved.</>
            ) : (
              <>This records that the artist <span style={{ color: t.ink, fontWeight: 600 }}>came in via {press.name}</span>. It sets attribution only and does <span style={{ color: t.ink, fontWeight: 600 }}>not</span> change the current production press.</>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Identity bulk editor — same card, one atomic commit ─────────────────
function IdentityBulkEditor({
  t, draft, bio, firstFieldRef, valid, onDraftChange, onBioChange, onSave,
}: {
  t: Theme; draft: IdentityData; bio: string; firstFieldRef: React.RefObject<HTMLInputElement | null>; valid: boolean;
  onDraftChange: (next: IdentityData) => void; onBioChange: (next: string) => void; onSave: () => void;
}) {
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

function ServiceMark({ t, service, bare = false }: { t: Theme; service: string; bare?: boolean }) {
  const assets: Record<string, string | undefined> = { 'Apple Music': appleMusicLogo, Tidal: tidalLogo, Qobuz: qobuzLogo, Deezer: deezerLogo, Pandora: pandoraLogo, Spotify: spotifyLogo, Instagram: instagramLogo, TikTok: tikTokLogo, X: xLogo, Bluesky: blueskyLogo, Facebook: facebookLogo };
  const marks: Record<string, string> = { 'Custom link': '+' };
  const isDark = t === THEMES.dark;
  const needsDarkInversion = isDark && ['X', 'Tidal', 'Qobuz'].includes(service);
  const mark = service === 'Website' ? <Globe className="h-4 w-4" aria-hidden /> : assets[service] ? <img src={assets[service]} alt="" className="max-h-full max-w-full object-contain" style={needsDarkInversion ? { filter: 'invert(1)' } : undefined} /> : <span className="text-[9px] font-semibold">{marks[service] ?? '•'}</span>;
  if (bare) return <>{mark}</>;
  return <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg p-1" style={{ backgroundColor: t.cardSoft, color: t.subink }}>{mark}</span>;
}

// ─── Anchored link chooser/editor — desktop Apple-canon popover ───────────
function LinkPopover({
  t, state, unsetLinks, onClose, onStateChange, onSave,
}: {
  t: Theme; state: LinkPopoverState; unsetLinks: string[];
  onClose: () => void; onStateChange: (state: LinkPopoverState) => void;
  onSave: (link: CustomLink) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: state.anchor.bottom + 8, left: state.anchor.right - 340 });
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
    const estimatedHeight = state.mode === 'form' ? 266 : 560;
    const width = 340;
    const left = Math.min(Math.max(12, state.anchor.right - width), window.innerWidth - width - 12);
    let top = state.anchor.bottom + 8;
    if (top + estimatedHeight > window.innerHeight - 12) top = Math.max(12, state.anchor.top - estimatedHeight - 8);
    setPosition({ top, left });
  }, [state.anchor, state.mode]);

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
          <p className="px-2 pb-3 text-[16px]" style={{ color: t.subink }}>{state.mode === 'more' ? 'More places fans can find this artist.' : 'Choose a destination to add.'}</p>
            <div className="mb-3 inline-flex self-start rounded-full" style={{ background: t.cardSoft, padding: 2 }} role="group" aria-label="Destination category">
              {(['All', 'Music', 'Social', 'Web'] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className="h-8 min-w-14 rounded-full px-3 text-[13px] transition-all focus:outline-none focus-visible:ring-2" style={{ background: filter === item ? t.card : 'transparent', boxShadow: filter === item ? t.pillShadow : undefined, color: filter === item ? t.ink : t.faint, fontWeight: filter === item ? 600 : 400 }} aria-pressed={filter === item} data-testid={`filter-link-${item.toLowerCase()}`}>{item}</button>)}
            </div>
            <div className="h-[300px] flex-shrink-0 overflow-y-scroll px-2 pb-1 transition-opacity" style={{ scrollbarGutter: 'stable' }}>
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

// ─── Link form dialog (legacy destructive-safe form; chooser uses LinkPopover) ─
function LinkFormDialog({ t, existing, presetLabel, onBack, onClose, onSave }: { t: Theme; existing?: CustomLink; presetLabel?: string; onBack?: () => void; onClose: () => void; onSave: (l: CustomLink) => void }) {
  const [label, setLabel] = useState(existing?.label ?? (presetLabel && presetLabel !== 'Custom link' ? presetLabel : ''));
  const [value, setValue] = useState(existing?.value ?? '');
  const custom = !existing && presetLabel === 'Custom link';
  const validUrl = /\.[a-z]{2,}/i.test(value.trim());
  const valid = label.trim().length > 0 && validUrl;
  return (
    <Dialog
      t={t}
      title={existing ? `Edit ${existing.label}` : (presetLabel && presetLabel !== 'Custom link' ? `Add ${presetLabel}` : 'Add custom link')}
      subtitle="Enter the full URL for this link."
      onClose={onClose}
      back={onBack}
      testid="dialog-link-form"
      footer={<>
        <CancelButton t={t} onClick={onClose} />
        <ConfirmButton t={t} label={existing ? 'Save link' : 'Add link'} ready={valid} onClick={() => onSave({ id: existing?.id ?? `lnk-${Date.now()}`, label: label.trim(), value: value.trim() })} testid="confirm-link-form" />
      </>}
    >
      <div className="py-1">
        {custom && (
          <Field t={t} label="Label">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Bandcamp" className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-link-label" />
          </Field>
        )}
        <Field t={t} label="URL">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…" className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-link-url" autoFocus />
        </Field>
        {value.trim() && !validUrl && <div className="text-[12px] pb-2" style={{ color: t.critical }}>Enter a valid URL.</div>}
      </div>
    </Dialog>
  );
}

// ─── Shopify connect dialog — an intentionally scoped partner moment ──────
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
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Connect Shopify store"
        className="relative w-full overflow-hidden rounded-2xl focus:outline-none"
        style={{ maxWidth: 900, ...shellStyle }}
        data-testid="dialog-shopify"
      >
        <button type="button" onClick={onClose} className={cn('absolute right-6 top-5 z-10 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 ease-out hover:-translate-y-px hover:brightness-110 active:translate-y-0 active:opacity-80 focus:outline-none focus-visible:ring-2 motion-reduce:hover:translate-y-0', t.hoverWash)} style={{ backgroundColor: t.cardSoft, color: t.subink }} aria-label="Close" data-testid="dialog-close">
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
              <img src={niinaShopifyLaptop} alt="Niina Soleil’s CaliforniaLand Shopify storefront on a laptop" className="absolute left-1/2 max-w-none -translate-x-1/2 select-none" style={{ width: '171%', top: -72 }} draggable={false} />
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
                <CancelButton t={t} onClick={onClose} className="duration-150 ease-out hover:brightness-110 active:opacity-75 focus:outline-none focus-visible:ring-2" />
                <ConfirmButton t={t} label={authorizing ? 'Connecting…' : 'Continue to Shopify'} ready={!authorizing} onClick={() => setPhase('authorizing')} testid="confirm-shopify" className="duration-150 ease-out hover:-translate-y-px hover:brightness-105 hover:shadow-md active:translate-y-0 active:opacity-90 focus:outline-none focus-visible:ring-2 motion-reduce:hover:translate-y-0" />
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Recipient dialog ────────────────────────────────────────────────────
function RecipientDialog({ t, existing, onClose, onSave }: { t: Theme; existing?: Recipient; onClose: () => void; onSave: (r: Recipient) => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [role, setRole] = useState(existing?.role ?? NOTIFY_ROLES[0]);
  const [cats, setCats] = useState<string[]>(existing?.categories ?? ['Orders']);
  const valid = name.trim().length > 0 && /.+@.+\..+/.test(email) && cats.length > 0;
  const toggle = (c: string) => setCats((xs) => xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]);
  return (
    <Dialog
      t={t}
      title={existing ? 'Edit recipient' : 'Add recipient'}
      subtitle="Choose who receives updates about this artist."
      onClose={onClose}
      size="lg"
      testid="dialog-recipient"
      footer={<>
        <CancelButton t={t} onClick={onClose} />
        <ConfirmButton t={t} label={existing ? 'Save recipient' : 'Add recipient'} ready={valid} onClick={() => onSave({ id: existing?.id ?? `rcp-${Date.now()}`, name: name.trim(), email: email.trim(), role, categories: cats })} testid="confirm-recipient" />
      </>}
    >
      <div className="py-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
          <Field t={t} label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-recipient-name" />
          </Field>
          <Field t={t} label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full h-10 px-3 rounded-xl text-[13.5px] focus:outline-none" style={inputStyle(t)} data-testid="input-recipient-email" />
          </Field>
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

// ─── Interaction guide panel ─────────────────────────────────────────────
const GUIDE_ITEMS: Array<{ title: string; body: string }> = [
  { title: 'Back-fill a referral', body: 'Header ••• → search a press, set date & optional note, review, confirm. Changes attribution/history only, not production.' },
  { title: 'View as this artist', body: 'Confirm dialog explains read-only mode → Continue enters a preview banner with Exit; no admin writes while previewing.' },
  { title: 'Reassign press', body: 'Searchable picker (status + location + specialty) → From/To review with impact → explicit Reassign press commits. Cancel/back safe.' },
  { title: 'Came in via press', body: 'Same picker in referral-origin mode → review confirms attribution only; production press is not silently changed.' },
  { title: 'Back to GoodTunes standard', body: 'Confirmation explains Memphis Record Pressing becomes default and explicit assignment is cleared before committing.' },
  { title: 'Artist URL', body: 'Suggest → Use it / Keep current. Copy shows Copied feedback and a toast. Nothing changes without an explicit action.' },
  { title: 'Identity edit', body: 'Edit all fields transforms the existing card in place. Save is explicit; Cancel preserves every value.' },
  { title: 'Add / edit / remove link', body: 'Add opens a choice menu then a labeled URL form. Edit reuses the form. Remove asks to confirm.' },
  { title: 'Shopify Connect', body: 'Dialog lists what will sync → Continue to Shopify advances to a connected success state. Cancel has no side effect.' },
  { title: 'Notifications', body: 'Add recipient form (name, email, categories, role). Edit reuses the form. Remove asks to confirm.' },
  { title: 'Every action resolves', body: 'No control silently mutates or dead-ends. Consequential changes require explicit confirmation; close/cancel changes nothing.' },
];

function InteractionGuide({ t, onClose }: { t: Theme; onClose: () => void }) {
  return (
    <Dialog
      t={t}
      title="Interaction canon checklist"
      subtitle="Every new/updated action and its behavior contract."
      onClose={onClose}
      size="lg"
      testid="dialog-interaction-guide"
      footer={<ConfirmButton t={t} label="Got it" ready onClick={onClose} testid="confirm-guide" />}
    >
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

// The Interaction Canon and Account Stack are paired views of the same approved
// Super-admin artist surface. Keep this route on the approved Account Stack
// implementation so Dashboard, Settings, and nested Releases cannot drift back
// to the legacy shell retained above for historical comparison.
const AdminArtistProfileInteractionCanon = ArtistDashboardAccountStack;

export default AdminArtistProfileInteractionCanon;
export { AdminArtistProfileInteractionCanon };
