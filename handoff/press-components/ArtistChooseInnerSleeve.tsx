// ArtistChooseInnerSleeve — artist-facing "Choose Your Inner Sleeve" screen.
//
// LEFT  — large sticky inner-sleeve preview. Updates as the artist selects.
// RIGHT — vinyl size picker (7" / 10" / 12"), then six sleeve style tiles.
//
// Sleeve types:
//   Printed Paper · Printed Board Weight · White · Black · White Polylined · Black Polylined
//
// Apple canon: two-tone headings, frosted chrome, hairline borders, generous whitespace.
//
// HANDOFF COPY — self-contained verbatim-replacement screen for the real GoodTunes app.
// Compiles alone: only react, lucide-react, and local ./assets/* imports.

import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  ChevronRight,
  Layers,
  Moon,
  Sun,
} from 'lucide-react';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.png';
import mrpLabelLogo from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';

// ─── Press identity is data ───────────────────────────────────────────
// Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's.
const MOCK_PRESS = {
  name: 'Memphis Record Pressing',
  logo: mrpLogo,
  labelLogo: mrpLabelLogo,
};

// SVG logo is black — invert to white for dark/rainbow surfaces.
const PRESS_LABEL_LOGO = MOCK_PRESS.labelLogo;
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

// ─── Self-contained popover (align="end" dropdown) ────────────────────
// MOCK-ONLY inline replacement for the design-system Popover so this file
// compiles with no shared-module imports.
function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  popShadow,
  hairline,
  card,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  popShadow: string;
  hairline: string;
  card: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onOpenChange]);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div
          className="absolute right-0 z-50 p-0 w-52 rounded-2xl overflow-hidden"
          style={{ top: 'calc(100% + 6px)', border: `1px solid ${hairline}`, background: card, boxShadow: popShadow }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Full-color print — same iridescent sunburst as the Full Color center label,
// so "printed" instantly reads as full color.
function RainbowPrintFace({ logoSize }: { logoSize: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'conic-gradient(from 210deg,' +
            '#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg,' +
            '#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg,' +
            '#e05a1a 305deg, #e91e8c 360deg)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)', mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)' }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: logoSize, height: logoSize, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.92 }} />
      </div>
    </>
  );
}

// ─── Themes — light = apple-canon (default, byte-identical to prior render);
// dark = charcoal admin canon (never navy). The whole page (shell chrome,
// tiles, headings, content) reads from THEMES[mode]. Light stays the default
// so the ratified light rendering is pixel-identical.
type Theme = {
  // shell / page surfaces + ink
  canvas: string;   // page background
  rail: string;     // side rail background
  card: string;     // raised surfaces (tiles, popovers, inputs)
  soft: string;     // recessed pill track
  hairline: string; // borders
  ink: string;      // primary text
  subink: string;   // secondary text
  faint: string;    // tertiary / muted text
  blue: string;     // accent
  // segmented / variant pill thumb
  pillActive: string;
  pillShadow: string;
  pillInk: string;      // active pill label
  pillInkIdle: string;  // idle pill label
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class (slate in light, white in dark)
  hoverWash: string;
  // active nav pill background utility class
  navActive: string;
  // popover shadow
  popShadow: string;
  // dashed empty-stage border color
  dashedBorder: string;
  // breadcrumb separator color
  crumbSep: string;
  // dark-only wordmark CSS invert (undefined in light)
  logoFilter?: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    soft: '#f2f2f5',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    blue: '#319ED8',
    pillActive: '#ffffff',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    pillInk: '#1d1d1f',
    pillInkIdle: '#8e8e93',
    headerBg: 'rgba(255,255,255,0.82)',
    searchPlaceholder: 'placeholder:text-slate-400',
    avatarRing: 'ring-slate-200',
    hoverWash: 'hover:bg-slate-50',
    navActive: 'bg-slate-100',
    popShadow: '0 12px 40px rgba(0,0,0,0.16)',
    dashedBorder: '#d0d0d5',
    crumbSep: '#d0d0d5',
    logoFilter: undefined,
  },
  dark: {
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    soft: '#26262a',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    blue: '#319ED8',
    pillActive: '#3a3a3e',
    pillShadow: '0 1px 3px rgba(0,0,0,0.4)',
    pillInk: '#f5f5f7',
    pillInkIdle: '#98989d',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    navActive: 'bg-white/10',
    popShadow: '0 12px 40px rgba(0,0,0,0.5)',
    dashedBorder: 'rgba(255,255,255,0.22)',
    crumbSep: '#6e6e73',
    logoFilter: 'invert(1) brightness(1.8)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const PARTNER_NAME = MOCK_PRESS.name;

// ─── Vinyl sizes ──────────────────────────────────────────────────────
const VINYL_SIZES = [
  { id: '7',  label: '7"',  note: 'Single' },
  { id: '10', label: '10"', note: 'EP' },
  { id: '12', label: '12"', note: 'LP · Standard' },
];

// ─── Inner sleeve styles + variants ───────────────────────────────────
// Three styles; each carries its own toggle: Printed → stock, others → color.
type SleeveVariant = {
  id: string;
  label: string;
  note: string; // shown when the variant is selected; '' if self-evident
};

type SleeveOption = {
  id: 'printed' | 'unprinted' | 'polylined';
  name: string;
  note: string;
  variants: SleeveVariant[];
};

const SLEEVE_OPTIONS: SleeveOption[] = [
  {
    id: 'printed',
    name: 'Printed',
    note: 'Full-color print on the sleeve face. Artist supplies artwork.',
    variants: [
      { id: 'paper', label: 'Paper',        note: 'Single-sided print on standard paper stock.' },
      { id: 'board', label: 'Board Weight', note: 'Heavier board stock. More rigid — protects the record better.' },
    ],
  },
  {
    id: 'unprinted',
    name: 'Unprinted',
    note: 'Plain paper sleeve. Clean and minimal — no artwork required.',
    variants: [
      { id: 'white', label: 'White', note: '' },
      { id: 'black', label: 'Black', note: '' },
    ],
  },
  {
    id: 'polylined',
    name: 'Polylined',
    note: 'Paper with anti-static poly lining. Protects against dust and scratches.',
    variants: [
      { id: 'white', label: 'White', note: '' },
      { id: 'black', label: 'Black', note: '' },
    ],
  },
];

// Visual flags for a style + variant combination — what thumbnails and the
// stage actually render.
type SleeveLook = {
  color: 'white' | 'black';
  printed: boolean;
  polylined: boolean;
  boardWeight: boolean;
};

function sleeveLook(style: SleeveOption, variantId: string): SleeveLook {
  if (style.id === 'printed') {
    return { color: 'white', printed: true, polylined: false, boardWeight: variantId === 'board' };
  }
  return {
    color: variantId === 'black' ? 'black' : 'white',
    printed: false,
    polylined: style.id === 'polylined',
    boardWeight: false,
  };
}

// Stage size — same baseline as jacket stage for visual consistency
const SS = 321;

// ─── Sleeve thumbnail (48px tile preview) ────────────────────────────
// Center hole = vinyl label size. Label is ~101mm on a 305mm record ≈ 0.33 of the face.
const HOLE_RATIO = 0.33;

function SleeveThumbnail({ sleeve, size = 48 }: { sleeve: SleeveLook; size: number }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? '1.5px solid #333' : `1.5px solid #e6e6ea`;
  const hole    = size * HOLE_RATIO;

  // CSS mask punches a transparent die-cut hole in the center
  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Poly lining behind masked sleeve — shines through die-cut hole */}
      {sleeve.polylined && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: hole, height: hole, borderRadius: '50%',
          overflow: 'hidden', zIndex: 1,
          background: 'radial-gradient(circle at 38% 32%, rgba(210,225,238,0.96) 0%, rgba(165,185,205,0.88) 55%, rgba(185,205,222,0.92) 100%)',
        }}>
          <div style={{ position: 'absolute', top: '10%', left: '14%', width: '55%', height: '32%', background: 'linear-gradient(120deg, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', transform: 'rotate(-18deg)', filter: 'blur(1px)' }} />
        </div>
      )}
      {/* Sleeve face — CSS mask cuts the die-cut hole */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        background: sleeve.printed
          ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
          : bg,
        border,
        overflow: 'hidden',
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {/* Printed: full-color rainbow print with logo */}
        {sleeve.printed && <RainbowPrintFace logoSize={size * 0.52} />}
        {/* Board weight: thicker-edge visual cue */}
        {sleeve.boardWeight && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, background: 'rgba(255,255,255,0.25)' }} />
        )}
      </div>
    </div>
  );
}

// ─── SleeveStage — large left-panel preview ───────────────────────────
function SleeveStage({ sleeve, t }: { sleeve: SleeveLook | null; t: Theme }) {
  const isBlack = sleeve?.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  // Rendered sleeve is product imagery — its own hairline stays fixed, not themed
  const border  = isBlack ? `1px solid #222` : `1px solid #e6e6ea`;
  const hole    = SS * HOLE_RATIO; // label-sized center hole

  if (!sleeve) {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: `1.5px dashed ${t.dashedBorder}`, borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: t.faint,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <path d="M14 4 L14 32" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select a sleeve style</span>
      </div>
    );
  }

  // CSS mask punches a transparent die-cut hole in the center
  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Contact shadow — rendered first so it sits behind everything */}
      <div style={{
        position: 'absolute',
        bottom: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: SS * 0.75, height: 20,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {/* Poly lining — sits between shadow and sleeve body; shines through the masked hole */}
      {sleeve.polylined && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: hole, height: hole, borderRadius: '50%',
          overflow: 'hidden', zIndex: 1,
          background: 'radial-gradient(circle at 38% 32%, rgba(210,225,238,0.96) 0%, rgba(165,185,205,0.88) 55%, rgba(185,205,222,0.92) 100%)',
          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.10)',
        }}>
          <div style={{ position: 'absolute', top: '12%', left: '16%', width: '55%', height: '30%', background: 'linear-gradient(120deg, rgba(255,255,255,0.60) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', transform: 'rotate(-18deg)', filter: 'blur(2px)' }} />
          <div style={{ position: 'absolute', bottom: '18%', right: '12%', width: '45%', height: '24%', background: 'linear-gradient(300deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', transform: 'rotate(14deg)', filter: 'blur(2px)' }} />
        </div>
      )}

      {/* Stage body — CSS mask cuts the die-cut hole, poly layer shows through it */}
      <div style={{ zIndex: 2,
        position: 'relative',
        width: SS, height: SS, flexShrink: 0,
        background: sleeve.printed
          ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
          : bg,
        border,
        overflow: 'hidden',
        boxShadow: sleeve.color === 'black'
          ? '0 8px 32px rgba(0,0,0,0.45)'
          : '0 8px 32px rgba(0,0,0,0.10)',
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {/* Printed: full-color rainbow print with logo */}
        {sleeve.printed && <RainbowPrintFace logoSize={SS * 0.42} />}

        {/* Plain white: show subtle grain texture lines */}
        {!sleeve.printed && sleeve.color === 'white' && (
          <>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 5.2}%`, height: 0.5, background: 'rgba(0,0,0,0.025)' }} />
            ))}
          </>
        )}

        {/* Plain black: faint sheen */}
        {!sleeve.printed && sleeve.color === 'black' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)' }} />
        )}

        {/* Board weight edge cue */}
        {sleeve.boardWeight && !sleeve.printed && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, background: isBlack ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
        )}
      </div>
    </div>
  );
}

// ─── Sleeve tile ──────────────────────────────────────────────────────
// div[role=button] — the variant pills inside are real <button>s, and
// nesting buttons is invalid HTML (hydration error).
function SleeveTile({
  sleeve,
  active,
  variantId,
  onSelect,
  onVariantSelect,
  t,
}: {
  sleeve: SleeveOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
  t: Theme;
}) {
  const selectedVariant = sleeve.variants.find((v) => v.id === variantId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`sleeve-${sleeve.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, background: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}` }}
    >
      {/* SleeveThumbnail is product imagery — NOT themed (same in both modes) */}
      <SleeveThumbnail sleeve={sleeveLook(sleeve, variantId)} size={64} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {sleeve.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>
          {sleeve.note}
        </div>
        {/* Variant toggle — revealed inside the selected style */}
        {active && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: t.soft, border: `1px solid ${t.hairline}` }}>
              {sleeve.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`sleeve-variant-${sleeve.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: vActive ? t.pillInk : t.pillInkIdle,
                      background: vActive ? t.pillActive : 'transparent',
                      boxShadow: vActive ? t.pillShadow : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
            {selectedVariant && selectedVariant.note && (
              <div className="text-[11.5px]" style={{ marginTop: 8, color: t.faint, lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };
const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard',   icon: LayoutDashboard },
  { label: 'Clients',     icon: Users },
  { label: 'Projects',    icon: Disc3, active: true },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog',     icon: Library },
  { label: 'Settings',    icon: Cog },
  { label: 'Referrals',   icon: Gift },
];
const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL      = 'brandon@memphisrecordpressing.com';
const USER_MENU = [
  { label: 'Edit profile',     icon: UserPen },
  { label: 'Account security', icon: ShieldCheck },
  { label: 'Sign out',         icon: LogOut },
];

function NavRow({ label, icon: Icon, active, t }: PressNavItem & { t: Theme }) {
  return (
    <div
      className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', active ? t.navActive : t.hoverWash)}
      style={{ color: active ? t.ink : t.subink }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-[13px] font-medium">{label}</span>
    </div>
  );
}

// ─── Catalog + Components pull-downs ──────────────────────────────────
const COMPONENTS_CHILDREN: { label: string; mock: string }[] = [
  { label: 'Vinyl', mock: 'PressVinylColorSetup' },
  { label: 'Jackets', mock: 'ArtistChooseJacket' },
  { label: 'Inner Sleeves', mock: 'ArtistChooseInnerSleeve' },
  { label: 'Center Labels', mock: 'PressCatalogVinylLabels' },
  { label: 'Inserts', mock: 'ArtistChooseInserts' },
  { label: 'Stickers', mock: 'PressCatalogStickers' },
  { label: 'Pricing', mock: 'PressCatalogPricing' },
];
const COMPONENTS_ACTIVE = 'Inner Sleeves';

function CatalogRail({ item, t }: { item: PressNavItem; t: Theme }) {
  const [catalogOpen, setCatalogOpen] = useState(true);
  const [componentsOpen, setComponentsOpen] = useState(true);
  const CatalogIcon = item.icon;
  return (
    <>
      <button
        type="button"
        aria-expanded={catalogOpen}
        onClick={() => setCatalogOpen((v) => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', item.active ? t.navActive : t.hoverWash)}
        style={{ color: item.active ? t.ink : t.subink }}
      >
        <CatalogIcon className="w-4 h-4 flex-shrink-0" />
        <span className="text-[13px] font-medium flex-1 text-left">{item.label}</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      <button
        type="button"
        aria-expanded={componentsOpen}
        onClick={() => setComponentsOpen((v) => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', t.hoverWash)}
        style={{ color: t.subink }}
      >
        <Layers className="w-4 h-4 flex-shrink-0" />
        <span className="text-[13px] font-medium flex-1 text-left">Components</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ transform: componentsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {componentsOpen && (
        <div className="space-y-0.5" style={{ marginLeft: 18, paddingLeft: 12, borderLeft: `1px solid ${t.hairline}` }}>
          {COMPONENTS_CHILDREN.map((c) => {
            const active = c.label === COMPONENTS_ACTIVE;
            return (
              <a
                key={c.label}
                href={`#/${c.mock}`}
                className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', active ? t.navActive : t.hoverWash)}
                style={{ color: active ? t.ink : t.subink, fontWeight: active ? 600 : 500 }}
              >
                <span className="text-[13px] flex-1">{c.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

function PressShell({ t, children }: { t: Theme; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: t.canvas, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif' }}>
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4" style={{ height: 52, background: t.headerBg, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: `1px solid ${t.hairline}` }}>
        <div className="flex items-center gap-2.5">
          {/* Wordmark: dark asset only — CSS invert paints it white on dark */}
          {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
          <img src={MOCK_PRESS.logo} alt={MOCK_PRESS.name} className="h-6 w-auto" style={{ filter: t.logoFilter }} />
          <span className="text-[13px] font-semibold" style={{ color: t.ink }}>{MOCK_PRESS.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors', t.hoverWash)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('rounded-full p-1.5 transition-colors', t.hoverWash)} aria-label="Notifications">
            <Bell className="w-4 h-4" style={{ color: t.subink }} />
          </button>
          <Popover open={menuOpen} onOpenChange={setMenuOpen} popShadow={t.popShadow} hairline={t.hairline} card={t.card}
            trigger={
              <button type="button" className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 focus:outline-none transition-shadow', t.avatarRing)}>
                <img src={brandonPhoto} alt={USER_FIRST_NAME} className="w-full h-full object-cover" />
              </button>
            }
          >
            <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
              <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{USER_FIRST_NAME}</div>
              <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{USER_EMAIL}</div>
            </div>
            <div className="py-1.5">
              {USER_MENU.map((m) => {
                const Icon = m.icon;
                return (
                  <button key={m.label} type="button" className={cn('w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors', t.hoverWash)} style={{ color: t.ink }}>
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Popover>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Side rail */}
        <aside className="flex-shrink-0 flex flex-col" style={{ width: 210, background: t.rail, borderRight: `1px solid ${t.hairline}` }}>
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: t.faint }} />
              <input
                type="search"
                className={cn('w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, background: t.card }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) =>
              item.label === 'Catalog'
                ? <CatalogRail key={item.label} item={item} t={t} />
                : <NavRow key={item.label} {...item} t={t} />
            )}
          </nav>
          <div className="flex-shrink-0 px-4 py-3 flex items-center gap-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>Powered by</span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

// ─── Headings ─────────────────────────────────────────────────────────
function PageHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint, fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest, t }: { lead: string; rest: string; t: Theme }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: t.ink }}>{lead} </span>
      <span style={{ color: t.faint }}>{rest}</span>
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export function ArtistChooseInnerSleeve() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [selectedSleeveId, setSelectedSleeveId] = useState<string | null>('printed');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('paper');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');

  const sleeveType = SLEEVE_OPTIONS.find((s) => s.id === selectedSleeveId) ?? null;
  const selectedVariant = sleeveType?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const look = sleeveType ? sleeveLook(sleeveType, selectedVariantId) : null;

  const selectSleeve = (id: string) => {
    setSelectedSleeveId(id);
    const opt = SLEEVE_OPTIONS.find((s) => s.id === id);
    setSelectedVariantId(opt?.variants[0]?.id ?? 'white');
  };

  return (
    <PressShell t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>

        {/* Breadcrumb + heading */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:opacity-70 transition-opacity">Catalog</a>
            <span style={{ color: t.crumbSep }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:opacity-70 transition-opacity">Vinyl</a>
            <span style={{ color: t.crumbSep }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:opacity-70 transition-opacity">Components</a>
            <span style={{ color: t.crumbSep }}>›</span>
            <span style={{ color: t.subink }}>Inner Sleeves</span>
          </div>
          <PageHeading lead="Choose your inner sleeve." rest="How will it be lined?" t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            The inner sleeve protects the record inside the jacket. Choose a material and finish.
          </p>
        </div>

        {/* Split: sticky sleeve stage · pickers */}
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 520px', gap: 56, alignItems: 'start' }}>

          {/* LEFT — sticky sleeve preview */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <SleeveStage sleeve={look} t={t} />
              {sleeveType && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: t.ink }}>
                    {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {sleeveType.name}
                    {selectedVariant && (
                      <span style={{ color: t.faint }}> · {selectedVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: t.faint, maxWidth: 280 }}>
                    {sleeveType.note}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — size + style pickers */}
          <div className="min-w-0">

            {/* Size */}
            <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              The record size determines which inner sleeves fit.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {VINYL_SIZES.map((s) => {
                const active = s.id === selectedSizeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSizeId(s.id)}
                    aria-pressed={active}
                    data-testid={`size-${s.id}`}
                    className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                    style={{ flex: 1, padding: '16px 12px', background: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, textAlign: 'center', cursor: 'pointer' }}
                  >
                    <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{s.label}</div>
                    <div className="text-[11px]" style={{ marginTop: 3, color: t.faint }}>{s.note}</div>
                  </button>
                );
              })}
            </div>

            {/* Style */}
            <div style={{ marginTop: 36 }}>
              <StepHeading lead="Pick a finish." rest="Printed, unprinted, or polylined." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {SLEEVE_OPTIONS.length} inner sleeve styles available from {PARTNER_NAME}.
              </p>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SLEEVE_OPTIONS.map((s) => (
                <SleeveTile
                  key={s.id}
                  sleeve={s}
                  active={s.id === selectedSleeveId}
                  variantId={s.id === selectedSleeveId ? selectedVariantId : s.variants[0].id}
                  onSelect={() => selectSleeve(s.id)}
                  onVariantSelect={setSelectedVariantId}
                  t={t}
                />
              ))}
            </div>

            {sleeveType && (
              <p className="text-[12px]" style={{ marginTop: 12, color: t.faint }}>
                {sleeveType.id === 'printed'
                  ? 'You supply print-ready artwork for the sleeve face.'
                  : sleeveType.id === 'polylined'
                    ? 'No artwork needed — ships with anti-static poly lining.'
                    : 'No artwork needed — packaging ships as-is.'}
              </p>
            )}

          </div>
        </div>
      </div>

      {/* MOCK-ONLY chrome — remove when wiring real theming. */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}
        className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}

export default ArtistChooseInnerSleeve;
