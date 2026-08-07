// PressVinylColorSetup — a PRESS-facing "Add your vinyl" tool where a record
// pressing plant defines the vinyl COLORS they can press. Copy-then-rework of
// ArtistProjectPackageConfigurator.tsx (donor, untouched), now mirroring the
// artist-side "Color. Pick your pressing." picker:
//   • LEFT — a large, calm vinyl DISC (no jacket) that live-previews the
//     selected swatch, rendered with the SplatterVinylPreview PNG-mask kit, plus
//     a quiet "Colors in your catalog" list.
//   • RIGHT — two steps: (1) pick a category via disc-preview cards (Black,
//     Splatter, Translucent, Opaque) with a "+ More types" popover to add a
//     category; (2) pick a swatch from a glossy-ball grid, or add a new swatch
//     via a frosted Apple popover (name + hex fields + upload + size chips).
//
// Apple canon: two-tone headings, frosted/blurred chrome, hairline borders,
// generous whitespace, no emojis, real ® character. The ONE filled blue pill on
// the screen is the "Save color" button inside the add-swatch popover. Press
// persona is light (charcoal is admin-only). Self-contained, inline mock data.

import { useMemo, useState, type ReactNode } from 'react';
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
  UploadCloud,
  Plus,
  MoreHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
// MRP's real logo mark (black, single-colour vector) for the record label.
import mrpLabelLogo from '../assets/mrp-logo.svg';

// ── Per-press label branding ─────────────────────────────────────────
// Each press supplies a center-label logo (SVG preferred) + a label
// background colour. The mockup hardcodes Memphis Record Pressing's brand:
// a BLACK label with their WHITE logo, always — regardless of vinyl colour
// (matches their real pressings). Future presses would swap these two inputs.
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
// The supplied asset is black, so invert it to white for the black label.
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';
import brandonPhoto from '../assets/brandon-seavers.png';

// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8'; // single accent
const INK = '#1d1d1f'; // headline ink
const SUBINK = '#6e6e73'; // calm secondary gray
const HAIRLINE = '#e6e6ea'; // whisper-quiet border
const CANVAS = '#f5f5f7'; // near-white page canvas
const RAIL = '#f5f5f7'; // left-rail surface
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from SplatterVinylPreview) ─────────────────────
const LAYERS = {
  opaque: '/__mockup/vinyl-layers/opaque-vinyl.png',
  translucent: '/__mockup/vinyl-layers/translucent-vinyl.png',
  splatter1: '/__mockup/vinyl-layers/splatter-one.png',
  splatter2: '/__mockup/vinyl-layers/splatter-two.png',
  splatter3: '/__mockup/vinyl-layers/splatter-three.png',
  highlights: '/__mockup/vinyl-layers/vinyl-highlights.png',
  inner: '/__mockup/vinyl-layers/inner-circle.png',
};

type CategoryId = string;

// ─── A single CSS-masked color layer ─────────────────────────────────
function MaskLayer({
  color,
  mask,
  blendMode = 'normal',
  opacity = 1,
  maskSize = '102% 102%',
}: {
  color: string;
  mask: string;
  blendMode?: React.CSSProperties['mixBlendMode'];
  opacity?: number;
  maskSize?: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundColor: color,
        opacity,
        mixBlendMode: blendMode,
        maskImage: `url(${mask})`,
        WebkitMaskImage: `url(${mask})`,
        maskSize,
        WebkitMaskSize: maskSize,
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
      }}
    />
  );
}

// ─── The disc render — a swatch drives the layer stack ───────────────
// "kind" selects how the disc composites: black, opaque body, translucent tint,
// or a splatter stack (base + 3 splatters).
type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter';

type Swatch = {
  id: string;
  name: string;
  kind: SwatchKind;
  base: string;
  s1?: string;
  s2?: string;
  s3?: string;
  sizes: SizeId[];
};

// Center-label artwork — the press's ACTUAL logo mark, sized generously so it
// dominates the label as in MRP's real pressings. It's printed on the label,
// so it rotates with the record body — the off-centre skyline/arcs make the
// spin read on every colour. The black asset is inverted to white for the
// black label. Fixed shine layer (elsewhere) never rotates.
function DiscLabelArt({ size }: { size: number }) {
  // `size` is the label diameter. The full logo (SVG) stays crisp at any size
  // and reads as a tiny brand dot on the small thumbnails. The subordinate
  // catalog arc text would be mush when small, so it only shows on large labels.
  const showArcText = size >= 70;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <img
        src={PRESS_LABEL_LOGO}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          // Logo dominates the label, as in the reference pressing.
          width: size * 0.9,
          height: size * 0.9,
          objectFit: 'contain',
          filter: PRESS_LABEL_LOGO_FILTER,
        }}
      />
      {/* quiet catalog line, arced along the bottom — subordinate to the logo */}
      {showArcText && (
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          aria-hidden
          style={{ position: 'absolute', inset: 0 }}
        >
          <defs>
            <path id="gt-label-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#gt-label-bottom" startOffset="50%" textAnchor="middle">
              MRP-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

function VinylDisc({ size, swatch, spin = false }: { size: number; swatch: Swatch; spin?: boolean }) {
  const LABEL_RATIO = 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const translucent = swatch.kind === 'translucent';
  const isSplatter = swatch.kind === 'splatter';

  return (
    <div
      className={spin ? 'gt-vinyl' : undefined}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: translucent ? '#ffffff' : '#000000',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* ── Rotating record body: grooves, splatter, label, inner detail ──
          Physically part of the pressing, so it spins together. */}
      <div
        className={spin ? 'gt-vinyl-body' : undefined}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: spin ? 'transform' : undefined }}
      >
        {translucent ? (
          <MaskLayer color={swatch.base} mask={LAYERS.translucent} opacity={1} />
        ) : (
          <MaskLayer color={swatch.base} mask={LAYERS.opaque} />
        )}

        {isSplatter && (
          <>
            <MaskLayer color={swatch.s1 ?? swatch.base} mask={LAYERS.splatter1} />
            <MaskLayer color={swatch.s2 ?? swatch.base} mask={LAYERS.splatter2} />
            <MaskLayer color={swatch.s3 ?? swatch.base} mask={LAYERS.splatter3} />
          </>
        )}

        {/* Translucent marbling — a barely-visible off-centre blotch so
            translucent vinyl reads as never perfectly even. Rotates. */}
        {spin && translucent && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              mixBlendMode: 'multiply',
              opacity: 0.14,
              background:
                'radial-gradient(38% 44% at 38% 34%, rgba(0,0,0,0.7), rgba(0,0,0,0) 62%),' +
                'radial-gradient(30% 34% at 68% 66%, rgba(0,0,0,0.55), rgba(0,0,0,0) 60%),' +
                'radial-gradient(24% 26% at 60% 24%, rgba(0,0,0,0.4), rgba(0,0,0,0) 58%)',
            }}
          />
        )}

        {/* Groove texture — a faint angular (conic) irregularity so the spin
            reads even on a uniform colour. ~2% opacity, rotates with the disc. */}
        {spin && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              mixBlendMode: translucent ? 'multiply' : 'screen',
              opacity: translucent ? 0.05 : 0.06,
              background:
                'conic-gradient(from 0deg,' +
                'rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 24deg, rgba(255,255,255,0) 70deg,' +
                'rgba(255,255,255,0) 150deg, rgba(255,255,255,0.7) 176deg, rgba(255,255,255,0) 220deg,' +
                'rgba(255,255,255,0) 300deg, rgba(255,255,255,0.6) 324deg, rgba(255,255,255,0) 360deg)',
            }}
          />
        )}

        {/* Center label — part of the record, rotates with the body.
            MRP's brand is a black label with their white logo, ALWAYS —
            regardless of vinyl colour (label bg + logo are per-press inputs). */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * LABEL_RATIO,
            height: size * LABEL_RATIO,
            borderRadius: '50%',
            backgroundColor: PRESS_LABEL_BG,
            overflow: 'hidden',
          }}
        >
          {/* Branded logo on the big stage disc and the ~90px type cards; at
              ~30px labels it reads as a tiny white brand dot. Skipped on the
              tiny 40/44px popover + editor discs, where it would be noise. */}
          {size >= 70 && <DiscLabelArt size={size * LABEL_RATIO} />}
        </div>

        {/* Inner circle detail — also on the disc */}
        <img
          src={LAYERS.inner}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * INNER_RATIO,
            height: size * INNER_RATIO,
            opacity: 1,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      </div>

      {/* ── Fixed sheen — a record spinning under a fixed light keeps its
          highlight in the same spot, so this layer NEVER rotates. ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: 0.6,
          mixBlendMode: 'normal',
          maskImage: `url(${LAYERS.highlights})`,
          WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />

      {/* Spindle hole — it's a HOLE punched through the record, so you see the
          stage behind it: fill it with the page/stage canvas colour, not white.
          A subtle inset shadow ring reads as a cut edge rather than a printed dot. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * 0.018,
          height: size * 0.018,
          borderRadius: '50%',
          backgroundColor: CANVAS,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// Subtle spin physics: the record body rotates on hover under a fixed light.
// CSS-only — the sheen layer (rendered outside .gt-vinyl-body) never rotates.
const DISC_SPIN_CSS = `
@keyframes gt-vinyl-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.gt-vinyl {
  transition: transform 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gt-vinyl .gt-vinyl-body {
  animation: gt-vinyl-spin 8s linear infinite;
  animation-play-state: paused;
  /* ease into the spin when hover begins */
  transition: transform 900ms ease-in;
}
.gt-vinyl:hover {
  /* barely-perceptible lift — no scale, no shadow jump */
  transform: translateY(-2px);
}
.gt-vinyl:hover .gt-vinyl-body {
  animation-play-state: running;
}
@media (prefers-reduced-motion: reduce) {
  .gt-vinyl:hover { transform: none; }
  .gt-vinyl .gt-vinyl-body { animation: none; }
}
`;

// Large stage disc with a Keynote-style contact shadow.
function DiscStage({ swatch }: { swatch: Swatch }) {
  const SIZE = 340;
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <style dangerouslySetInnerHTML={{ __html: DISC_SPIN_CSS }} />
      <VinylDisc size={SIZE} swatch={swatch} spin />
      <div
        style={{
          position: 'absolute',
          bottom: -16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: Math.round(SIZE * 0.43),
          height: 12,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.32)',
          filter: 'blur(7px)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// Glossy round color ball — radial-gradient highlight (matches artist grid).
function ColorBall({ color, size = 40 }: { color: string; size?: number }) {
  return (
    <span className="relative block rounded-full" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}>
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color} 70%)`, opacity: 0.94 }}
      />
    </span>
  );
}

// ─── Category catalog (each category owns its swatches) ──────────────
type Category = {
  id: CategoryId;
  name: string;
  kind: SwatchKind;
  swatches: Swatch[];
};

const mk = (id: string, name: string, kind: SwatchKind, base: string, extra?: Partial<Swatch>): Swatch => ({
  id,
  name,
  kind,
  base,
  sizes: ['12"'],
  ...extra,
});

const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'black',
    name: 'Black',
    kind: 'black',
    swatches: [
      mk('BK1', 'Classic Black', 'black', '#111114', { sizes: ['7"', '10"', '12"'] }),
      mk('BK2', 'Ink', 'black', '#1B1B22', { sizes: ['12"'] }),
      mk('BK3', 'Charcoal', 'black', '#2B2B31', { sizes: ['10"', '12"'] }),
    ],
  },
  {
    id: 'splatter',
    name: 'Splatter',
    kind: 'splatter',
    swatches: [
      mk('SP1', 'Cosmic', 'splatter', '#1B3A6B', { s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0', sizes: ['12"'] }),
      mk('SP2', 'Classic', 'splatter', '#C81E38', { s1: '#F5F5DC', s2: '#1A1A2E', s3: '#E8C84A', sizes: ['12"'] }),
      mk('SP3', 'Forest Mist', 'splatter', '#2D4A3E', { s1: '#A8C5A0', s2: '#F5E6D3', s3: '#7BA3A1', sizes: ['10"', '12"'] }),
      mk('SP4', 'Blue Flame', 'splatter', '#1B3A6B', { s1: '#FF6B35', s2: '#FFD700', s3: '#E0E0E0', sizes: ['12"'] }),
      mk('SP5', 'Midnight Gold', 'splatter', '#0A0A0A', { s1: '#C89A3C', s2: '#8A6B1F', s3: '#F5F0E0', sizes: ['12"'] }),
    ],
  },
  {
    id: 'translucent',
    name: 'Translucent',
    kind: 'translucent',
    swatches: [
      mk('T01', 'Ruby', 'translucent', '#C81E38'),
      mk('T02', 'Clear', 'translucent', '#E8ECEF'),
      mk('T03', 'Cobalt', 'translucent', '#2563EB'),
      mk('T04', 'Emerald', 'translucent', '#059669'),
      mk('T05', 'Magenta', 'translucent', '#A21457'),
      mk('T06', 'Seafoam', 'translucent', '#8FCFC4'),
      mk('T07', 'Amber', 'translucent', '#D9A441'),
      mk('T08', 'Tangerine', 'translucent', '#E4622A'),
      mk('T09', 'Smoke', 'translucent', '#8A8F98'),
      mk('T10', 'Chartreuse', 'translucent', '#C7C948'),
      mk('T11', 'Bone', 'translucent', '#D8D2C4'),
      mk('T12', 'Forest', 'translucent', '#2F4F3A'),
    ],
  },
  {
    id: 'opaque',
    name: 'Opaque',
    kind: 'opaque',
    swatches: [
      mk('OP1', 'Bone White', 'opaque', '#EDE9DF', { sizes: ['12"'] }),
      mk('OP2', 'Oxblood', 'opaque', '#5A1620', { sizes: ['12"'] }),
      mk('OP3', 'Sea Blue', 'opaque', '#2B6DA8', { sizes: ['12"'] }),
      mk('OP4', 'Moss', 'opaque', '#4A5D34', { sizes: ['10"', '12"'] }),
      mk('OP5', 'Marigold', 'opaque', '#E0A22B', { sizes: ['12"'] }),
      mk('OP6', 'Plum', 'opaque', '#4E2A55', { sizes: ['12"'] }),
      mk('OP7', 'Slate', 'opaque', '#54606B', { sizes: ['7"', '12"'] }),
      mk('OP8', 'Coral', 'opaque', '#E4634E', { sizes: ['12"'] }),
    ],
  },
];

// Representative preview swatch for each category card's mini disc.
function categoryPreview(cat: Category): Swatch {
  return cat.swatches[0];
}

// ─── Shell primitives (Press persona, mirrors PressDashboard) ────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog', icon: Library, active: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

function NavRow({ label, icon: Icon, active }: PressNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && 'hover:bg-slate-200',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
    </a>
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

function UserMenu() {
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
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-9 w-9 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 p-1">
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
          <UserMenu />
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
                className="w-full h-9 pl-8 pr-2 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                placeholder="Search…  ⌘K"
                readOnly
              />
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {PRESS_NAV.map((item) => (
              <NavRow key={item.label} {...item} />
            ))}
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

// ─── Two-tone headings ───────────────────────────────────────────────
function PageHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h1 className="tracking-tight" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.05, marginTop: 10 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
    </h1>
  );
}

function StepHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600 }}>
      <span style={{ color: INK }}>{lead} </span>
      <span style={{ color: '#a1a1a6' }}>{rest}</span>
    </h2>
  );
}

// ─── Category card — mini disc + name + count (artist-picker shape) ──
function CategoryCard({
  category,
  active,
  onSelect,
}: {
  category: Category;
  active: boolean;
  onSelect: () => void;
}) {
  const preview = categoryPreview(category);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`category-${category.id}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={90} swatch={preview} />
      </div>
      <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {category.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 2, color: '#a1a1a6' }}>
        {category.swatches.length} {category.swatches.length === 1 ? 'color' : 'colors'}
      </div>
    </button>
  );
}

// ─── "+ More types" popover — name a new category ────────────────────
function MoreTypesPopover({ onAdd }: { onAdd: (name: string, desc: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), desc.trim());
    setName('');
    setDesc('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 focus:outline-none"
          data-testid="button-more-types"
        >
          <span
            className="inline-flex items-center justify-center rounded-full border flex-shrink-0"
            style={{ width: 20, height: 20, borderColor: BLUE, color: BLUE }}
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: BLUE }}>
            More types
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-80 p-0 rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 20px 48px rgba(0,0,0,0.16)',
        }}
        data-testid="popover-more-types"
      >
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold" style={{ color: INK }}>
            New pressing type
          </div>
          <p className="text-[12.5px]" style={{ color: SUBINK, marginTop: 2, lineHeight: 1.4 }}>
            Add a category you press that isn&rsquo;t listed.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
                Type name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Picture disc"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: '0 12px', color: INK, background: '#fff' }}
                data-testid="input-type-name"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
                One-line description
              </label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. Full-face artwork on the disc"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: '0 12px', color: INK, background: '#fff' }}
                data-testid="input-type-desc"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1" style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            data-testid="button-type-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100 disabled:opacity-40"
            style={{ color: BLUE }}
            data-testid="button-type-add"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Hex color field with live swatch ────────────────────────────────
function ColorField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
        {label}
      </label>
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="cursor-pointer"
          style={{ width: 38, height: 38, border: 'none', padding: 2, borderRadius: 10, background: 'none' }}
          aria-label={`${label} picker`}
          data-testid={`${testId}-picker`}
        />
        <input
          type="text"
          value={value.toUpperCase()}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
          }}
          className="font-mono text-[13px] focus:outline-none"
          style={{ width: 100, height: 38, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: '0 12px', color: INK, background: '#fff' }}
          aria-label={`${label} hex`}
          data-testid={`${testId}-hex`}
        />
        <span className="rounded-lg flex-shrink-0" style={{ width: 26, height: 26, backgroundColor: value, border: `1px solid ${HAIRLINE}` }} />
      </div>
    </div>
  );
}

// ─── Size toggle chip ────────────────────────────────────────────────
const SIZES = ['7"', '10"', '12"'] as const;
type SizeId = (typeof SIZES)[number];

function SizeChip({ size, active, onToggle }: { size: SizeId; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      data-testid={`size-${size.replace('"', 'in')}`}
      className="rounded-full transition-colors focus:outline-none tabular-nums"
      style={{
        padding: '8px 18px',
        fontSize: 13.5,
        fontWeight: 600,
        color: active ? '#ffffff' : INK,
        backgroundColor: active ? BLUE : '#fff',
        border: active ? `1px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
      }}
    >
      {size}
    </button>
  );
}

// ─── Add-a-swatch frosted popover ────────────────────────────────────
// Holds the entire "define a color" flow: name, hex(es), upload, sizes, and the
// ONE filled blue "Save color" pill on the screen.
const CRITICAL = '#e0245e'; // severity-critical accent (Remove)

// The shared frosted color editor — used for BOTH "Add color" and "Edit color".
// `edit` supplies the existing swatch to pre-fill and enables the quiet Remove
// button; when absent the popover is in "add" mode.
function SwatchEditorPopover({
  kind,
  open,
  onOpenChange,
  trigger,
  edit,
  onSave,
  onRemove,
}: {
  kind: SwatchKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  edit?: Swatch;
  onSave: (s: Swatch) => void;
  onRemove?: () => void;
}) {
  const isBlack = kind === 'black';
  const isSplatter = kind === 'splatter';

  const defaultBase = isBlack ? '#111114' : isSplatter ? '#1B3A6B' : '#C81E38';

  const [name, setName] = useState(edit?.name ?? '');
  const [base, setBase] = useState(edit?.base ?? defaultBase);
  const [s1, setS1] = useState(edit?.s1 ?? '#F5F5DC');
  const [s2, setS2] = useState(edit?.s2 ?? '#E8C84A');
  const [s3, setS3] = useState(edit?.s3 ?? '#E0E0E0');
  const [sizes, setSizes] = useState<SizeId[]>(edit?.sizes ?? ['12"']);
  const [uploaded, setUploaded] = useState(false);

  const canSave = name.trim().length > 0 && sizes.length > 0;

  const toggleSize = (s: SizeId) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Re-seed fields whenever the popover opens (fresh in add mode, or from the
  // current swatch in edit mode).
  const seed = () => {
    setName(edit?.name ?? '');
    setBase(edit?.base ?? defaultBase);
    setS1(edit?.s1 ?? '#F5F5DC');
    setS2(edit?.s2 ?? '#E8C84A');
    setS3(edit?.s3 ?? '#E0E0E0');
    setSizes(edit?.sizes ?? ['12"']);
    setUploaded(false);
  };

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: edit?.id ?? `new-${Date.now()}`,
      name: name.trim(),
      kind,
      base: isBlack ? '#111114' : base,
      s1: isSplatter ? s1 : undefined,
      s2: isSplatter ? s2 : undefined,
      s3: isSplatter ? s3 : undefined,
      sizes,
    });
    onOpenChange(false);
  };

  const previewSwatch: Swatch = {
    id: 'preview',
    name: name || (edit ? edit.name : 'New color'),
    kind,
    base: isBlack ? '#111114' : base,
    s1: isSplatter ? s1 : undefined,
    s2: isSplatter ? s2 : undefined,
    s3: isSplatter ? s3 : undefined,
    sizes,
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) seed();
        onOpenChange(v);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[360px] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 24px 56px rgba(0,0,0,0.18)',
          // Never taller than the viewport; the middle scrolls, header/footer pin.
          maxHeight: 'min(640px, calc(100vh - 32px))',
        }}
        data-testid={edit ? 'popover-edit-color' : 'popover-add-color'}
      >
        {/* Pinned header — two-tone title, always visible */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '18px 18px 14px 18px' }}>
          <VinylDisc size={44} swatch={previewSwatch} />
          <div>
            <div className="text-[15px] font-semibold tracking-tight" style={{ color: INK }}>
              {edit ? (
                <>
                  Edit color. <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{edit.name}.</span>
                </>
              ) : (
                'New color'
              )}
            </div>
            <div className="text-[12px]" style={{ color: SUBINK }}>
              {isBlack ? 'Black is black — just name and size it.' : 'Define, then save to your catalog.'}
            </div>
          </div>
        </div>

        {/* Scrollable body — quiet, only a hairline separates it from the footer */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 18px 18px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
                Color name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cosmic Splatter"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${HAIRLINE}`, borderRadius: 10, padding: '0 12px', color: INK, background: '#fff' }}
                data-testid="input-color-name"
              />
            </div>

            {/* hex fields (hidden for black) */}
            {!isBlack && (
              <div className="rounded-xl bg-white" style={{ border: `1px solid ${HAIRLINE}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ColorField
                  label={kind === 'translucent' ? 'Translucent tint' : isSplatter ? 'Base color' : 'Vinyl color'}
                  value={base}
                  onChange={setBase}
                  testId="color-base"
                />
                {isSplatter && (
                  <>
                    <div style={{ height: 1, background: HAIRLINE }} />
                    <ColorField label="Splatter color 1" value={s1} onChange={setS1} testId="color-s1" />
                    <ColorField label="Splatter color 2" value={s2} onChange={setS2} testId="color-s2" />
                    <ColorField label="Splatter color 3" value={s3} onChange={setS3} testId="color-s3" />
                  </>
                )}
              </div>
            )}

            {/* upload */}
            <button
              type="button"
              onClick={() => setUploaded((v) => !v)}
              data-testid="button-upload-swatch"
              className="w-full rounded-xl flex flex-col items-center justify-center text-center transition-colors hover:bg-slate-50 focus:outline-none"
              style={{ padding: '16px 12px', border: `1px dashed ${uploaded ? BLUE : '#d0d0d5'}`, background: uploaded ? '#f0f7fc' : '#fff' }}
            >
              {uploaded ? (
                <>
                  <Check className="w-4 h-4" style={{ color: BLUE }} strokeWidth={2.5} />
                  <span className="text-[12.5px] font-semibold" style={{ color: BLUE, marginTop: 6 }}>
                    swatch-reference.png
                  </span>
                  <span className="text-[11.5px]" style={{ color: SUBINK, marginTop: 1 }}>
                    Uploaded — tap to replace
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" style={{ color: '#a1a1a6' }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: INK, marginTop: 6 }}>
                    Upload a swatch
                  </span>
                  <span className="text-[11.5px]" style={{ color: SUBINK, marginTop: 1 }}>
                    PNG or JPG reference
                  </span>
                </>
              )}
            </button>

            {/* sizes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
                Available sizes
              </label>
              <div className="flex items-center gap-2">
                {SIZES.map((s) => (
                  <SizeChip key={s} size={s} active={sizes.includes(s)} onToggle={() => toggleSize(s)} />
                ))}
              </div>
            </div>

            {/* Remove — quiet borderless red text button (edit mode only) */}
            {edit && onRemove && (
              <div style={{ paddingTop: 2 }}>
                <button
                  type="button"
                  onClick={() => {
                    onRemove();
                    onOpenChange(false);
                  }}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-full px-2.5 py-1.5 transition-colors"
                  style={{ color: CRITICAL }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fdeef2')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  data-testid="button-remove-color"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove color
                </button>
              </div>
            )}
          </div>
        </div>

        {/* action row — pinned footer, THE one filled blue pill on the screen */}
        <div className="flex items-center justify-end gap-3 flex-shrink-0" style={{ padding: '12px 18px', borderTop: `1px solid ${HAIRLINE}` }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors hover:bg-slate-100"
            style={{ color: SUBINK }}
            data-testid="button-color-cancel"
          >
            Cancel
          </button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={submit}
            className="text-white hover:opacity-90 rounded-full disabled:opacity-40"
            style={{ backgroundColor: BLUE, borderColor: BLUE, paddingLeft: 18, paddingRight: 18 }}
            data-testid="button-save-color"
          >
            {edit ? 'Save' : 'Save color'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Add-a-swatch tile (opens the editor in add mode) ────────────────
function AddSwatchTile({ kind, onSave }: { kind: SwatchKind; onSave: (s: Swatch) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <SwatchEditorPopover
      kind={kind}
      open={open}
      onOpenChange={setOpen}
      onSave={onSave}
      trigger={
        <button
          type="button"
          data-testid="tile-add-color"
          className="rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors hover:bg-slate-50 focus:outline-none"
          style={{ padding: 12, minHeight: 108, border: `1px dashed #d0d0d5`, background: '#fff' }}
        >
          <span className="inline-flex items-center justify-center rounded-full border" style={{ width: 30, height: 30, borderColor: BLUE, color: BLUE }}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </span>
          <span className="text-[11.5px] font-semibold" style={{ color: SUBINK }}>
            Add color
          </span>
        </button>
      }
    />
  );
}

// ─── Catalog search — magnifier reveals a frosted find-a-color popover ─
type CatalogEntry = { swatch: Swatch; categoryId: CategoryId; categoryName: string };

function CatalogSearchPopover({
  entries,
  selectedId,
  onPick,
}: {
  entries: CatalogEntry[];
  selectedId: string;
  onPick: (categoryId: CategoryId, swatchId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      ({ swatch, categoryName }) =>
        swatch.name.toLowerCase().includes(q) || categoryName.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Search catalog colors"
          data-testid="button-catalog-search"
          className="inline-flex items-center justify-center rounded-full flex-shrink-0 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          style={{ width: 34, height: 34, color: SUBINK, border: `1px solid ${HAIRLINE}`, background: '#fff' }}
        >
          <Search className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={10}
        avoidCollisions
        collisionPadding={16}
        className="w-[480px] max-w-[calc(100vw-32px)] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${HAIRLINE}`,
          backgroundColor: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 24px 56px rgba(0,0,0,0.18)',
          // Never escape the viewport: bound by both an absolute cap and the
          // space Radix measures between the trigger and the collision edge.
          maxHeight: 'min(560px, calc(100vh - 32px), var(--radix-popover-content-available-height))',
        }}
        data-testid="popover-catalog-search"
      >
        {/* Pinned header — small-caps title + count, then the search pill */}
        <div className="flex-shrink-0" style={{ padding: '14px 18px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: SUBINK }}>
              Colors in your catalog
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: '#a1a1a6' }}>
              {entries.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: '#a1a1a6' }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-8 rounded-full text-[12.5px] placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              style={{ border: `1px solid ${HAIRLINE}`, color: INK, background: '#fff' }}
              placeholder="Find a color…"
              data-testid="input-catalog-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                data-testid="button-catalog-clear"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
                style={{ width: 18, height: 18, color: SUBINK }}
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable divided list — mini disc render + name + category/sizes */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div style={{ padding: '18px' }}>
              <p className="text-[12.5px]" style={{ color: '#a1a1a6' }}>
                No colors match.
              </p>
            </div>
          ) : (
            <ul>
              {filtered.map(({ swatch, categoryId: cId, categoryName }) => {
                const on = swatch.id === selectedId;
                return (
                  <li key={`${cId}-${swatch.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(cId, swatch.id);
                        setQuery('');
                        setOpen(false);
                      }}
                      data-testid={`catalog-item-${swatch.id}`}
                      className="w-full flex items-center gap-3 text-left transition-colors hover:bg-slate-50 focus:outline-none"
                      style={{ padding: '11px 18px', borderBottom: `1px solid ${HAIRLINE}`, backgroundColor: on ? '#f0f7fc' : undefined }}
                    >
                      <VinylDisc size={40} swatch={swatch} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: on ? BLUE : INK }}>
                          {swatch.name}
                        </div>
                        <div className="text-[11.5px]" style={{ color: SUBINK }}>
                          {categoryName} · {swatch.sizes.join(', ')}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Swatch grid tile ────────────────────────────────────────────────
// Whole tile selects the swatch; a quiet frosted ··· button (revealed on hover
// / keyboard focus) opens the edit popover without triggering selection.
function SwatchTile({
  swatch,
  kind,
  active,
  onSelect,
  onSave,
  onRemove,
}: {
  swatch: Swatch;
  kind: SwatchKind;
  active: boolean;
  onSelect: () => void;
  onSave: (s: Swatch) => void;
  onRemove: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        data-testid={`swatch-${swatch.id}`}
        className="w-full rounded-2xl bg-white flex flex-col items-center gap-2 transition-all hover:-translate-y-px focus:outline-none"
        style={{ padding: 12, minHeight: 108, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
      >
        <span className="relative">
          <ColorBall color={swatch.base} size={40} />
          {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
        </span>
        <span className="text-[11.5px] font-semibold text-center leading-tight" style={{ color: active ? BLUE : INK }}>
          {swatch.name}
        </span>
      </button>

      {/* Frosted ··· — invisible until hover / focus-within */}
      <div
        className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        style={{ top: 8, right: 8 }}
      >
        <SwatchEditorPopover
          kind={kind}
          edit={swatch}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSave={onSave}
          onRemove={onRemove}
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Edit ${swatch.name}`}
              data-testid={`swatch-menu-${swatch.id}`}
              className="inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              style={{
                width: 26,
                height: 26,
                backgroundColor: 'rgba(255,255,255,0.88)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: `1px solid ${HAIRLINE}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                color: SUBINK,
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          }
        />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
export function PressVinylColorSetup() {
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [categoryId, setCategoryId] = useState<CategoryId>('translucent');
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>('T01');

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? categories[0],
    [categories, categoryId],
  );

  const selectedSwatch = useMemo(
    () => category.swatches.find((s) => s.id === selectedSwatchId) ?? category.swatches[0],
    [category, selectedSwatchId],
  );

  // Preview swatch on the left — falls back to the first in the category.
  const previewSwatch = selectedSwatch ?? categoryPreview(category);

  const chooseCategory = (id: CategoryId) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat && cat.swatches[0]) setSelectedSwatchId(cat.swatches[0].id);
  };

  const addCategory = (name: string, _desc: string) => {
    const id = `custom-${Date.now()}`;
    const seed = mk(`${id}-1`, `${name} 1`, 'opaque', '#7A7F88', { sizes: ['12"'] });
    const next: Category = { id, name, kind: 'opaque', swatches: [seed] };
    setCategories((prev) => [...prev, next]);
    setCategoryId(id);
    setSelectedSwatchId(seed.id);
  };

  const addSwatch = (s: Swatch) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, swatches: [...c.swatches, s] } : c)),
    );
    setSelectedSwatchId(s.id);
  };

  // Update a swatch in place within a specific category.
  const updateSwatchIn = (catId: CategoryId, next: Swatch) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, swatches: c.swatches.map((s) => (s.id === next.id ? next : s)) } : c,
      ),
    );
  };

  // Remove a swatch from a specific category; reselect a sibling if needed.
  const removeSwatchFrom = (catId: CategoryId, swatchId: string) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, swatches: c.swatches.filter((s) => s.id !== swatchId) } : c)),
    );
    if (catId === categoryId && swatchId === selectedSwatchId) {
      const cat = categories.find((c) => c.id === catId);
      const remaining = cat?.swatches.filter((s) => s.id !== swatchId) ?? [];
      setSelectedSwatchId(remaining[0]?.id ?? '');
    }
  };

  // Jump to a swatch from the catalog search — select it and switch category.
  const selectFromCatalog = (catId: CategoryId, swatchId: string) => {
    setCategoryId(catId);
    setSelectedSwatchId(swatchId);
  };

  // The catalog = a flat list of swatches across all categories, fed to the
  // find-a-color search popover.
  const catalogList = useMemo(
    () => categories.flatMap((c) => c.swatches.map((s) => ({ swatch: s, categoryId: c.id, categoryName: c.name }))),
    [categories],
  );

  return (
    <PressShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Catalog
            </a>
            <span style={{ color: '#d0d0d5' }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Vinyl colors
            </a>
            <span style={{ color: '#d0d0d5' }}>›</span>
            <span style={{ color: SUBINK }}>Add color</span>
          </div>
          <PageHeading lead="Add your vinyl." rest="The colors you can press." />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
            Pick a type, then pick or add a color. Artists choose from these when they design a record with {PARTNER_NAME}.
          </p>
        </div>

        {/* Split: sticky disc stage · scrolling steps */}
        <div
          style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 520px',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* LEFT — the calm disc stage (sticky) */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <DiscStage swatch={previewSwatch} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                <ColorBall color={previewSwatch.base} size={16} />
                <span className="font-semibold" style={{ color: INK }}>
                  {previewSwatch.name}
                </span>
                <span style={{ color: '#d0d0d5' }}>·</span>
                <span>{category.name}</span>
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6' }}>
                {previewSwatch.sizes.length > 0 ? `Presses for ${previewSwatch.sizes.join(', ')}` : 'No sizes assigned yet'}
              </p>
              <p className="text-[12px] text-center tabular-nums" style={{ marginTop: 14, color: '#a1a1a6' }}>
                {catalogList.length} colors in your catalog
              </p>
            </div>
          </div>

          {/* RIGHT — pick a type → pick or add a color */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            {/* Category */}
            <section>
              <div className="flex items-start justify-between gap-3">
                <StepHeading lead="Pick a type." rest="What kind of vinyl?" />
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-[12px] tabular-nums" style={{ color: '#a1a1a6' }}>
                    {catalogList.length} colors
                  </span>
                  <CatalogSearchPopover
                    entries={catalogList}
                    selectedId={selectedSwatch?.id ?? ''}
                    onPick={selectFromCatalog}
                  />
                </div>
              </div>
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {categories.map((c) => (
                  <CategoryCard key={c.id} category={c} active={c.id === categoryId} onSelect={() => chooseCategory(c.id)} />
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <MoreTypesPopover onAdd={addCategory} />
              </div>
            </section>

            {/* Swatches */}
            <section>
              <StepHeading lead="Pick a color." rest="Or add a new one." />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                <span className="font-semibold" style={{ color: INK }}>{category.name}</span> · {category.swatches.length}{' '}
                {category.swatches.length === 1 ? 'color' : 'colors'}
              </p>
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {category.swatches.map((s) => (
                  <SwatchTile
                    key={s.id}
                    swatch={s}
                    kind={category.kind}
                    active={s.id === selectedSwatch?.id}
                    onSelect={() => setSelectedSwatchId(s.id)}
                    onSave={(next) => updateSwatchIn(category.id, next)}
                    onRemove={() => removeSwatchFrom(category.id, s.id)}
                  />
                ))}
                <AddSwatchTile kind={category.kind} onSave={addSwatch} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </PressShell>
  );
}

export default PressVinylColorSetup;
