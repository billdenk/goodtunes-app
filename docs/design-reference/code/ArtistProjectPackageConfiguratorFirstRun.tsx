// ArtistProjectPackageConfiguratorFirstRun — the FIRST-TIME-THROUGH variant of
// ArtistProjectPackageConfigurator.tsx. Same Apple-configurator shell, tokens,
// layout, pricing math, and section markup — but nothing is chosen yet, so the
// page teaches one decision at a time (Apple's progressive-disclosure rule).
//
// What's different from the base configurator:
//   • Album name starts EMPTY (placeholder "Album name"). Header: "Design your
//     record." with the subhead about a brand-new 12" LP.
//   • The product stage shows a PLACEHOLDER jacket — no artwork yet — a very
//     light-gray sleeve with the pressing partner's logo centered in light gray,
//     and a neutral-gray vinyl disc behind it until a color is picked.
//   • Each right-column decision section is GRAYED OUT and non-interactive until
//     the previous step completes:
//         a. Album name  → typing ≥1 char unlocks
//         b. The record  → picking Single/Double LP unlocks
//         c. Color       → picking a swatch unlocks
//         d. Tracks      → auto-complete (sane default of 10) unlocks with itself
//         e. The run     → picking a run size unlocks
//         f. Price / GoodDeed / summary — the final group
//   • The left money card shows calm "—" placeholders until a run size is chosen,
//     then the real math (identical formulas to the base file).
//
// Selections are nullable (lpConfig / selectedSwatch / qty), so all derived math
// is guarded. The original file is NOT modified.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  User,
  Disc3,
  Activity,
  Users,
  Megaphone,
  ShoppingBag,
  UserCheck,
  BarChart3,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  Check,
  Minus,
  Plus,
  PenLine,
  Download,
  ImagePlus,
} from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import niinaPhoto from '../assets/niina-soleil.webp';
import mrpLogo from '../assets/mrp-logo.png';
// MRP's real logo mark (black, single-colour vector) for the record label.
import mrpLabelLogo from '../assets/mrp-logo.svg';

// ─── Brand tokens ────────────────────────────────────────────────────
const BLUE = '#319ED8';
const RUBY = '#C81E38';
const RUBY_SOFT = 'rgba(200, 30, 56, 0.06)';

// Apple-system surface tokens (mirrors the base configurator)
const INK = '#1d1d1f'; // near-black headline ink
const SUBINK = '#6e6e73'; // calm secondary gray
const HAIRLINE = '#e6e6ea'; // whisper-quiet card border
const CANVAS = '#f5f5f7'; // near-white page canvas
const RAIL = '#f5f5f7'; // left-rail surface
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

// Placeholder tokens for the empty-state jacket + disc
const PLACEHOLDER_JACKET = '#f2f2f5';
const PLACEHOLDER_DISC = '#d6d6db';

const DASH = '—';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
const fmtUSD0 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
// Three-decimal for the per-track publishing rate ($0.127).
const fmtUSD3 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 });

// ─── Shell primitives (mirrors the base configurator) ─────────────────

type ArtistNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const ARTIST_NAV: ArtistNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'People', icon: User },
  { label: 'Projects', icon: Disc3, active: true },
  { label: 'Overview', icon: Activity },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Reports', icon: BarChart3 },
];

function NavRow({ label, icon: Icon, active }: ArtistNavItem) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-[13px] transition-colors',
        active ? 'hover:bg-white' : 'hover:bg-slate-200',
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? INK : SUBINK,
        backgroundColor: active ? '#ffffff' : undefined,
        boxShadow: active ? PILL_SHADOW : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? BLUE : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
    </a>
  );
}

const ARTIST_NAME = 'Niina Soleil';
const USER_FIRST_NAME = 'Niina';
const USER_EMAIL = 'niina@niinasoleil.com';
const USER_INITIALS = 'NS';

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
          <img src={niinaPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-0" data-testid="menu-user">
        <div className="px-3 py-3 border-b border-slate-200">
          <div className="text-[13.5px] font-semibold text-slate-900">{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] text-slate-500 truncate">{USER_EMAIL}</div>
        </div>
        <div className="py-1">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1 border-t border-slate-200">
          <button
            type="button"
            className="w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ArtistShell({ children }: { children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 bg-white pl-3 pr-6"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={niinaPhoto}
            alt={ARTIST_NAME}
            className="h-9 w-9 rounded-full object-cover flex-shrink-0"
            style={{ border: `1px solid ${HAIRLINE}` }}
          />
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {ARTIST_NAME}
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
            {ARTIST_NAV.map((item) => (
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

// ─── Pressing catalog — real pressing TYPES, each with its own palette ─
// (copied verbatim from the base configurator)

type Swatch = { id: string; name: string; color: string };
type Pressing = { id: string; name: string; popular?: boolean; swatches: Swatch[] };

const TRANSLUCENT_SWATCHES: Swatch[] = [
  { id: 'T01', name: 'Ruby', color: '#C81E38' },
  { id: 'T02', name: 'Clear', color: '#E8ECEF' },
  { id: 'T03', name: 'Cobalt', color: '#2563EB' },
  { id: 'T04', name: 'Emerald', color: '#059669' },
  { id: 'T05', name: 'Magenta', color: '#A21457' },
  { id: 'T06', name: 'Seafoam', color: '#8FCFC4' },
  { id: 'T07', name: 'Amber', color: '#D9A441' },
  { id: 'T08', name: 'Tangerine', color: '#E4622A' },
  { id: 'T09', name: 'Smoke', color: '#8A8F98' },
  { id: 'T10', name: 'Chartreuse', color: '#C7C948' },
  { id: 'T11', name: 'Bone', color: '#D8D2C4' },
  { id: 'T12', name: 'Forest', color: '#2F4F3A' },
];

const PRESSINGS: Pressing[] = [
  {
    id: 'black',
    name: 'Black',
    popular: true,
    swatches: [
      { id: 'BK1', name: 'Classic Black', color: '#111114' },
      { id: 'BK2', name: 'Ink', color: '#1B1B22' },
      { id: 'BK3', name: 'Charcoal', color: '#2B2B31' },
    ],
  },
  {
    id: 'splatter',
    name: 'Splatter',
    popular: true,
    swatches: [
      { id: 'SP1', name: 'Fireworks', color: '#E4622A' },
      { id: 'SP2', name: 'Storm', color: '#3B5BA5' },
      { id: 'SP3', name: 'Meadow', color: '#5FA35F' },
      { id: 'SP4', name: 'Berry', color: '#A21457' },
      { id: 'SP5', name: 'Sunburst', color: '#D9A441' },
    ],
  },
  {
    id: 'ecomix',
    name: 'EcoMix',
    swatches: [
      { id: 'EC1', name: 'Recycled Grey', color: '#7C7F86' },
      { id: 'EC2', name: 'Earth', color: '#6B5B4A' },
      { id: 'EC3', name: 'Sea Glass', color: '#8FB8A8' },
    ],
  },
  {
    id: 'translucent',
    name: 'Translucent',
    popular: true,
    swatches: TRANSLUCENT_SWATCHES,
  },
  {
    id: 'opaque',
    name: 'Opaque',
    popular: true,
    swatches: [
      { id: 'OP1', name: 'True Red', color: '#C21B2C' },
      { id: 'OP2', name: 'Royal', color: '#1E3A8A' },
      { id: 'OP3', name: 'Kelly', color: '#1F7A3D' },
      { id: 'OP4', name: 'Sunflower', color: '#E7B92B' },
      { id: 'OP5', name: 'Bubblegum', color: '#E778A6' },
      { id: 'OP6', name: 'Bone White', color: '#EDE8DC' },
      { id: 'OP7', name: 'Jet', color: '#17171B' },
      { id: 'OP8', name: 'Orange', color: '#E4622A' },
    ],
  },
  {
    id: 'neon',
    name: 'Neon/Glow',
    swatches: [
      { id: 'NE1', name: 'Glow Green', color: '#8CF04A' },
      { id: 'NE2', name: 'Hot Pink', color: '#FF4FA3' },
      { id: 'NE3', name: 'Electric Blue', color: '#31B7FF' },
      { id: 'NE4', name: 'Highlighter', color: '#E7F53A' },
    ],
  },
  {
    id: 'smoke',
    name: 'Smoke Blends',
    swatches: [
      { id: 'SM1', name: 'Ash', color: '#9A9EA6' },
      { id: 'SM2', name: 'Blue Smoke', color: '#6E86A8' },
      { id: 'SM3', name: 'Rose Smoke', color: '#B08790' },
    ],
  },
  {
    id: 'cream',
    name: 'Cream Blends',
    swatches: [
      { id: 'CR1', name: 'Vanilla', color: '#EFE6CE' },
      { id: 'CR2', name: 'Butter', color: '#EBD79A' },
      { id: 'CR3', name: 'Latte', color: '#C9A987' },
    ],
  },
  {
    id: 'metallic',
    name: 'Metallic Blends',
    swatches: [
      { id: 'MT1', name: 'Gold', color: '#C6A24A' },
      { id: 'MT2', name: 'Silver', color: '#B9BEC6' },
      { id: 'MT3', name: 'Bronze', color: '#9A6B3F' },
    ],
  },
  {
    id: 'standard',
    name: 'Standard Blends',
    swatches: [
      { id: 'ST1', name: 'Red / Black', color: '#7A2230' },
      { id: 'ST2', name: 'Blue / White', color: '#5E7FB0' },
      { id: 'ST3', name: 'Green / Cream', color: '#79936B' },
    ],
  },
  {
    id: 'deluxe',
    name: 'Deluxe Blends',
    swatches: [
      { id: 'DX1', name: 'Aurora', color: '#7C5CC4' },
      { id: 'DX2', name: 'Sunset', color: '#D66A4B' },
      { id: 'DX3', name: 'Tide', color: '#3F8FA0' },
    ],
  },
  {
    id: 'double',
    name: 'Double Double',
    swatches: [
      { id: 'DD1', name: 'Split Ruby', color: '#B01E38' },
      { id: 'DD2', name: 'Split Cobalt', color: '#2C57C0' },
    ],
  },
  {
    id: 'shimmer',
    name: 'Shimmer Blends',
    swatches: [
      { id: 'SH1', name: 'Pearl', color: '#D8D2E0' },
      { id: 'SH2', name: 'Opal', color: '#A9C4C7' },
      { id: 'SH3', name: 'Rose Gold', color: '#C99A8E' },
    ],
  },
  {
    id: 'glitter',
    name: 'Glitter Blends',
    swatches: [
      { id: 'GL1', name: 'Ruby Glitter', color: '#C81E38' },
      { id: 'GL2', name: 'Gold Glitter', color: '#CBA33F' },
      { id: 'GL3', name: 'Violet Glitter', color: '#7C4CC4' },
    ],
  },
  {
    id: 'ghostly',
    name: 'Ghostly Effect',
    swatches: [
      { id: 'GH1', name: 'Phantom Clear', color: '#DDE3E8' },
      { id: 'GH2', name: 'Haze', color: '#B8C0CB' },
    ],
  },
  {
    id: 'torrent',
    name: 'Torrent Effect',
    swatches: [
      { id: 'TR1', name: 'Rapids', color: '#3C6E8F' },
      { id: 'TR2', name: 'Lava', color: '#C2452B' },
    ],
  },
  {
    id: 'colorincolor',
    name: 'Color In Color',
    swatches: [
      { id: 'CC1', name: 'Ruby in Clear', color: '#C81E38' },
      { id: 'CC2', name: 'Blue in White', color: '#2E63C0' },
      { id: 'CC3', name: 'Green in Bone', color: '#3E8A54' },
    ],
  },
  {
    id: 'half',
    name: 'Half',
    swatches: [
      { id: 'HF1', name: 'Half Red / Black', color: '#8A2230' },
      { id: 'HF2', name: 'Half Blue / Clear', color: '#3E6FB0' },
    ],
  },
];

const DEFAULT_PRESSING = 'translucent';
const POPULAR_PRESSINGS = PRESSINGS.filter((p) => p.popular);
const MORE_PRESSINGS = PRESSINGS.filter((p) => !p.popular);

// ─── Product stage — the calm big mockup with the greet animation ────
// FIRST-RUN twist: `swatch` is nullable. When null (no color yet), the disc
// renders in a neutral gray and the jacket shows a placeholder — no artwork.

// The draw-out is split into TWO transforms on TWO nested layers so the shine
// can ride the slide without rolling with the record:
//   • POS  → translateX only, on the outer (translating) container
//   • ROT  → rotate only, on the inner (rotating) disc body
// The sheen lives between them (child of POS, sibling of ROT) → it slides but
// never rotates, like a fixed light on a record that rolls out of its sleeve.
const DISC_TUCKED_POS = 'translateX(-12%)'; // rest: slim moon only
const DISC_GREET_POS = 'translateX(30%)'; // auto greet + hover/tap
const DISC_TUCKED_ROT = 'rotate(-14deg)';
const DISC_GREET_ROT = 'rotate(16deg)';
const JACKET_REST = 'translateX(0)';
const JACKET_PULLED = 'translateX(-9%)'; // eases left on draw-out
// ONE easing + ONE duration shared by every layer of the draw-out (disc
// translate, disc rotate, jacket) so the whole gesture reads as a single
// continuous glide with no competing timings.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DRAW_MS = 600;

// ── Per-press label branding (see PressVinylColorSetup) ──────────────
// Each press supplies a center-label logo (SVG preferred) + a label
// background colour. Memphis Record Pressing's brand is a BLACK label with
// their WHITE logo, always. The supplied asset is black, so we invert it.
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';
// The spindle is a HOLE — you see the stage behind it. This screen's stage is
// the light gradient below, so the hole reads with its lower stop colour.
const STAGE_HOLE_BG = '#F1F5F9';
// Same specular sheen mask as the PressVinylColorSetup stage disc, so both
// screens' vinyl look identical. It lives INSIDE the translating disc so it
// slides out with the record (light rides translation; it only stays put under
// pure rotation, which this greet is not).
const VINYL_SHEEN = '/__mockup/vinyl-layers/vinyl-highlights.png';

function ProductStage({ swatch }: { swatch: Swatch | null }) {
  const [greetKey, setGreetKey] = useState(0);
  const [active, setActive] = useState(false);
  // Re-greet whenever a (new) color is chosen.
  useEffect(() => {
    setGreetKey((k) => k + 1);
  }, [swatch?.id]);

  const animName = `cfgfr-disc-greet-${greetKey}`; // translateX track (outer)
  const animNameRot = `cfgfr-disc-greet-rot-${greetKey}`; // rotate track (inner)
  const discPosTransform = active ? DISC_GREET_POS : DISC_TUCKED_POS;
  const discRotTransform = active ? DISC_GREET_ROT : DISC_TUCKED_ROT;
  const discColor = swatch?.color ?? PLACEHOLDER_DISC;

  return (
    <div
      className="relative w-full rounded-3xl flex items-center justify-center"
      style={{
        background: 'linear-gradient(160deg, #F8FAFC 0%, #F1F5F9 100%)',
        minHeight: 520,
        padding: 56,
      }}
    >
      <div
        className="relative w-full select-none cursor-pointer"
        style={{ maxWidth: 380, aspectRatio: '1 / 1', overflow: 'visible' }}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={() => setActive(false)}
        onClick={() => setActive((v) => !v)}
        data-testid="record-mockup"
      >
        <style>{`
          @keyframes ${animName} {
            0%   { transform: ${DISC_TUCKED_POS} translateZ(0); }
            20%  { transform: ${DISC_GREET_POS} translateZ(0); }
            55%  { transform: ${DISC_GREET_POS} translateZ(0); }
            100% { transform: ${DISC_TUCKED_POS} translateZ(0); }
          }
          @keyframes ${animNameRot} {
            0%   { transform: ${DISC_TUCKED_ROT}; }
            20%  { transform: ${DISC_GREET_ROT}; }
            55%  { transform: ${DISC_GREET_ROT}; }
            100% { transform: ${DISC_TUCKED_ROT}; }
          }
        `}</style>

        {/* Vinyl disc — BEHIND the jacket. Neutral gray until a color is picked.
            OUTER layer: translation only (rides the sleeve-draw). */}
        <div
          key={greetKey}
          className="absolute rounded-full"
          style={{
            top: '8%',
            right: '-16%',
            width: '84%',
            height: '84%',
            transformOrigin: 'center center',
            transform: `${discPosTransform} translateZ(0)`,
            // ONE transform transition drives the whole slide (single easing +
            // duration). On interaction the transition owns the motion;
            // otherwise the keyed keyframe plays the greet then holds tucked.
            animation: active ? 'none' : `${animName} 2600ms ${EASE} 350ms 1 forwards`,
            transition: `transform ${DRAW_MS}ms ${EASE}`,
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }}
        >
          {/* ROTATING layer — the record body itself. Everything printed on the
              record (grooves, marbling, label, spindle) rolls with this. */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 50% 42%, ${discColor} 0%, ${discColor} 34%, rgba(0,0,0,0.30) 100%)`,
              boxShadow: '0 16px 44px rgba(15,23,42,0.30)',
              opacity: 0.97,
              transformOrigin: 'center center',
              transform: discRotTransform,
              // Rotate rides the slide on the SAME easing + duration as the
              // translate above, so the two never desync — one continuous roll.
              animation: active ? 'none' : `${animNameRot} 2600ms ${EASE} 350ms 1 forwards`,
              transition: `transform ${DRAW_MS}ms ${EASE}, background 400ms ease`,
              willChange: 'transform',
              backfaceVisibility: 'hidden',
            }}
          >
            {/* Concentric groove rings — printed on the record, roll with it */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'repeating-radial-gradient(circle at 50% 42%, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0) 2px, rgba(0,0,0,0.06) 4px)',
              }}
            />
            {/* Groove texture — a faint angular (conic) irregularity so the disc
                never reads as a perfectly uniform gradient. On the record. */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                pointerEvents: 'none',
                mixBlendMode: 'screen',
                opacity: 0.06,
                background:
                  'conic-gradient(from 0deg at 50% 42%,' +
                  'rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 24deg, rgba(255,255,255,0) 70deg,' +
                  'rgba(255,255,255,0) 150deg, rgba(255,255,255,0.7) 176deg, rgba(255,255,255,0) 220deg,' +
                  'rgba(255,255,255,0) 300deg, rgba(255,255,255,0.6) 324deg, rgba(255,255,255,0) 360deg)',
              }}
            />
            {/* Marbling — a barely-visible off-centre cloudiness so the finish
                reads as never perfectly even. On the record. */}
            <div
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                pointerEvents: 'none',
                mixBlendMode: 'multiply',
                opacity: 0.1,
                background:
                  'radial-gradient(38% 44% at 38% 30%, rgba(0,0,0,0.7), rgba(0,0,0,0) 62%),' +
                  'radial-gradient(30% 34% at 66% 58%, rgba(0,0,0,0.55), rgba(0,0,0,0) 60%)',
              }}
            />

            {/* Center label — MRP's brand: BLACK label + WHITE logo, always.
                Printed on the record, so it rolls with the disc. */}
            <div
              className="absolute rounded-full flex items-center justify-center overflow-hidden"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '34%',
                height: '34%',
                backgroundColor: PRESS_LABEL_BG,
                boxShadow: '0 0 0 1.5px rgba(255,255,255,0.25)',
              }}
            >
              <img
                src={PRESS_LABEL_LOGO}
                alt=""
                aria-hidden
                className="pointer-events-none select-none"
                style={{ width: '88%', height: '88%', objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER }}
              />
              {/* Spindle hole — punched through the record, so it shows the stage
                  behind it (this screen's background), not a printed dot. */}
              <div
                className="absolute rounded-full"
                style={{
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '10%',
                  height: '10%',
                  backgroundColor: STAGE_HOLE_BG,
                  boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.55)',
                }}
              />
            </div>
          </div>

          {/* Specular sheen — the SAME highlight mask as the press stage disc.
              Sibling of the rotating body but child of the translating layer:
              it SLIDES out with the record yet NEVER rotates, like a fixed
              stage light glancing off vinyl that rolls out of the sleeve. */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              backgroundColor: '#ffffff',
              opacity: 0.6,
              maskImage: `url(${VINYL_SHEEN})`,
              WebkitMaskImage: `url(${VINYL_SHEEN})`,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
            }}
          />
        </div>

        {/* Placeholder jacket — light gray sleeve with the press partner's logo
            in light gray, since no artwork exists yet. */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: PLACEHOLDER_JACKET,
            border: `1px solid ${HAIRLINE}`,
            boxShadow: '0 28px 60px rgba(15,23,42,0.18)',
            zIndex: 1,
            transform: active ? JACKET_PULLED : JACKET_REST,
            transition: `transform ${DRAW_MS}ms ${EASE}`,
            willChange: 'transform',
          }}
        >
          <img
            src={mrpLogo}
            alt=""
            aria-hidden="true"
            style={{ height: 72, width: 'auto', filter: 'grayscale(1)', opacity: 0.28 }}
          />
          <div
            className="absolute right-0 top-0 h-full"
            style={{ width: 14, background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.08) 100%)' }}
          />
          {/* Add-artwork affordance — appears on hover with the draw-out */}
          <div
            className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"
            style={{
              paddingBottom: 16,
              opacity: active ? 1 : 0,
              transform: active ? 'translateY(0)' : 'translateY(6px)',
              transition: `opacity 350ms ${EASE}, transform 350ms ${EASE}`,
            }}
          >
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-md"
              style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
              data-testid="pill-add-artwork"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Add artwork
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Apple-style two-tone step heading ───────────────────────────────

function StepHeading({ lead, rest }: { lead: string; rest: string }) {
  return (
    <h2 className="tracking-tight" style={{ fontSize: 27, lineHeight: 1.15, fontWeight: 600 }}>
      <span className="text-slate-900">{lead} </span>
      <span className="text-slate-400">{rest}</span>
    </h2>
  );
}

// ─── Locked-section wrapper — the progressive-disclosure primitive ────
// A later step stays grayed + non-interactive until its trigger unlocks it.

function LockableSection({
  locked,
  children,
  testId,
  scrollOnUnlock,
}: {
  locked: boolean;
  children: ReactNode;
  testId?: string;
  /** Glide this section into view the FIRST time it unlocks — once per
      unlock, never per change, and never for sections unlocked by typing. */
  scrollOnUnlock?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (scrollOnUnlock && wasLocked.current && !locked) {
      // Small delay lets the fade-in start so the glide lands on a section
      // that's already coming alive.
      const t = setTimeout(() => {
        ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 180);
      wasLocked.current = locked;
      return () => clearTimeout(t);
    }
    wasLocked.current = locked;
    return undefined;
  }, [locked, scrollOnUnlock]);
  return (
    <section
      ref={ref}
      aria-disabled={locked}
      data-testid={testId}
      style={{
        opacity: locked ? 0.35 : 1,
        pointerEvents: locked ? 'none' : 'auto',
        filter: locked ? 'saturate(0)' : 'none',
        transition: 'opacity 400ms ease, filter 400ms ease',
        scrollMarginTop: 24,
      }}
    >
      {children}
    </section>
  );
}

// ─── Pricing breakdown row (Apple tech-specs style) ──────────────────

function BreakdownRow({
  label,
  note,
  value,
  bold,
}: {
  label: string;
  note?: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ padding: '3px 0' }}>
      <div className="min-w-0 text-[12.5px]">
        <span className={bold ? 'font-bold text-slate-900' : 'text-slate-600'}>{label}</span>
        {note && <span className="text-slate-400"> ({note})</span>}
      </div>
      <span className={`tabular-nums text-[12.5px] flex-shrink-0 ${bold ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Mini record — a small 12" disc whose finish expresses the pressing ──
// (copied verbatim from the base configurator)

function MiniDisc({ pressing, size = 46 }: { pressing: Pressing; size?: number }) {
  const c0 = pressing.swatches[0]?.color ?? '#1F2937';
  const c1 = pressing.swatches[1]?.color ?? c0;

  let face: string;
  let overlay: string | undefined;
  const id = pressing.id;

  if (id === 'black') {
    face = `radial-gradient(circle at 38% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 22%), radial-gradient(circle at 50% 45%, #26262d 0%, #141418 40%, #050507 100%)`;
  } else if (id === 'opaque' || id === 'standard') {
    face = `radial-gradient(circle at 40% 32%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 52%, rgba(0,0,0,0.34) 100%)`;
  } else if (id === 'translucent' || id === 'ghostly') {
    face = `radial-gradient(circle at 38% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 30%), radial-gradient(circle at 50% 48%, ${c0} 0%, ${c0} 30%, rgba(255,255,255,0.28) 62%, rgba(0,0,0,0.22) 100%)`;
  } else if (id === 'smoke') {
    face = `radial-gradient(circle at 30% 26%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 68% 70%, ${c1} 0%, rgba(0,0,0,0) 55%), radial-gradient(circle at 50% 45%, ${c0} 0%, #6b7078 60%, rgba(0,0,0,0.30) 100%)`;
  } else if (id === 'half' || id === 'double') {
    face = `linear-gradient(90deg, ${c0} 0%, ${c0} 49.5%, ${c1} 50.5%, ${c1} 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 28%), radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.30) 100%)`;
  } else if (id === 'colorincolor') {
    face = `radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 42%, ${c1} 43%, ${c1} 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 28%), radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.28) 100%)`;
  } else if (id === 'neon') {
    face = `radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 46%, rgba(255,255,255,0.55) 78%, ${c0} 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0) 26%)`;
  } else if (id === 'splatter' || id === 'glitter') {
    face = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 52%, rgba(0,0,0,0.32) 100%)`;
    overlay = `radial-gradient(circle at 30% 34%, ${c1} 0 1.4px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 62% 30%, ${c1} 0 1.2px, rgba(0,0,0,0) 1.4px), radial-gradient(circle at 70% 62%, ${c1} 0 1.6px, rgba(0,0,0,0) 1.8px), radial-gradient(circle at 40% 68%, ${c1} 0 1.2px, rgba(0,0,0,0) 1.4px), radial-gradient(circle at 55% 52%, ${c1} 0 1.3px, rgba(0,0,0,0) 1.5px)`;
  } else if (id === 'metallic' || id === 'shimmer') {
    face = `linear-gradient(125deg, rgba(255,255,255,0.55) 0%, ${c0} 34%, ${c1} 62%, rgba(255,255,255,0.35) 100%)`;
    overlay = `radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.26) 100%)`;
  } else if (id === 'torrent' || id === 'deluxe' || id === 'cream' || id === 'ecomix') {
    face = `radial-gradient(circle at 34% 30%, ${c1} 0%, rgba(0,0,0,0) 48%), radial-gradient(circle at 66% 68%, ${c0} 0%, rgba(0,0,0,0) 52%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c1} 70%, rgba(0,0,0,0.28) 100%)`;
  } else {
    face = `radial-gradient(circle at 40% 32%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 50%, rgba(0,0,0,0.32) 100%)`;
  }

  return (
    <div
      className="relative rounded-full"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: face,
        boxShadow: '0 2px 6px rgba(15,23,42,0.22), inset 0 0 0 0.5px rgba(0,0,0,0.10)',
      }}
    >
      {overlay && (
        <div className="absolute inset-0 rounded-full" style={{ background: overlay }} />
      )}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'repeating-radial-gradient(circle at 50% 45%, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0) 1.4px, rgba(0,0,0,0.07) 2.6px)',
        }}
      />
      <div
        className="absolute rounded-full ring-1 ring-white/40 flex items-center justify-center"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '36%',
          height: '36%',
          backgroundColor: '#1F2937',
        }}
      >
        <div className="rounded-full bg-white/75" style={{ width: 3, height: 3 }} />
      </div>
    </div>
  );
}

// ─── apple.com-style option tile (pressing types) ────────────────────

function PressingTile({
  pressing,
  active,
  onSelect,
}: {
  pressing: Pressing;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`pressing-${pressing.id}`}
      className={
        active
          ? 'rounded-xl border-2 bg-white text-left transition-colors focus:outline-none'
          : 'rounded-xl border border-slate-200 bg-white text-left transition-colors hover:bg-slate-50 focus:outline-none'
      }
      style={{ padding: 12, borderColor: active ? BLUE : undefined }}
    >
      <div style={{ marginBottom: 8 }}>
        <MiniDisc pressing={pressing} />
      </div>
      <div className="text-[13px] font-semibold text-slate-900 leading-tight">{pressing.name}</div>
      <div className="text-[11.5px] text-slate-400" style={{ marginTop: 2 }}>
        {pressing.swatches.length} {pressing.swatches.length === 1 ? 'color' : 'colors'}
      </div>
    </button>
  );
}

// ─── Run size + cost model (identical to base configurator) ───────────
const MIN_RUN = 50;
const MAX_RUN = 3000;
const RUN_LADDER = [50, 100, 300, 500, 1000, 2000, 3000];

const MFG_LADDER: Array<{ min: number; max: number; unit: number }> = [
  { min: 50, max: 99, unit: 9.5 },
  { min: 100, max: 249, unit: 8.4 },
  { min: 250, max: 499, unit: 7.6 },
  { min: 500, max: 999, unit: 6.9 },
  { min: 1000, max: 1999, unit: 6.24 },
  { min: 2000, max: MAX_RUN, unit: 5.6 },
];
function mfgUnitFor(run: number): number {
  const tier = MFG_LADDER.find((t) => run >= t.min && run <= t.max);
  return tier ? tier.unit : MFG_LADDER[MFG_LADDER.length - 1].unit;
}
const PUBLISHING_PER_TRACK_SIDE = 0.127;
const PAYMENT_RATE = 0.029143;
const GOODTUNES_UNIT = 4.5;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Signed GoodDeed® cost ladder (identical to base configurator)
const SIGNED_COST_LADDER: Array<{ min: number; max: number; cost: number }> = [
  { min: 25, max: 49, cost: 13 },
  { min: 50, max: 99, cost: 12 },
  { min: 100, max: 249, cost: 9 },
  { min: 250, max: 499, cost: 7 },
  { min: 500, max: Infinity, cost: 6 },
];
function signedCostFor(count: number): number {
  const tier = SIGNED_COST_LADDER.find((t) => count >= t.min && count <= t.max);
  return tier ? tier.cost : SIGNED_COST_LADDER[0].cost;
}
const SIGNED_MINIMUM = 25;

// ─── Page ────────────────────────────────────────────────────────────

export function ArtistProjectPackageConfiguratorFirstRun() {
  // FIRST RUN: nothing is chosen yet. Nullable selections drive the disclosure.
  // Default from the project — CALIFORNIALAND — plus the format, so the
  // artist starts with a sensible name instead of a blank.
  const [albumName, setAlbumName] = useState('CALIFORNIALAND 12"');
  const [lpConfig, setLpConfig] = useState<'single' | 'double' | null>(null);
  const [selectedPressing, setSelectedPressing] = useState(DEFAULT_PRESSING);
  const [selectedSwatch, setSelectedSwatch] = useState<string | null>(null);
  const [tracks, setTracks] = useState(10); // sane default
  const [qty, setQty] = useState<number | null>(null);
  const [retail, setRetail] = useState(35);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Clamp any run size into the press-supported 50–3,000 window.
  const setRun = (n: number) => setQty(Math.max(MIN_RUN, Math.min(MAX_RUN, Math.round(n) || MIN_RUN)));

  const pressing = useMemo(
    () => PRESSINGS.find((p) => p.id === selectedPressing) ?? PRESSINGS.find((p) => p.id === DEFAULT_PRESSING)!,
    [selectedPressing],
  );
  const choosePressing = (id: string) => {
    const next = PRESSINGS.find((p) => p.id === id);
    if (!next) return;
    setSelectedPressing(id);
    // Selecting a new type clears the color so the artist re-confirms it,
    // keeping the disclosure honest.
    setSelectedSwatch(null);
  };

  // Signed GoodDeed® estimator state (same as base configurator)
  const [signedOn, setSignedOn] = useState(false);
  const [signedPrice, setSignedPrice] = useState(25);
  const [takeRate, setTakeRate] = useState(20);
  const [limitMode, setLimitMode] = useState<'demand' | 'limit'>('demand');
  const [signedCap, setSignedCap] = useState(200);

  // The active swatch — null until the artist picks a color.
  const swatch = useMemo<Swatch | null>(
    () => (selectedSwatch ? pressing.swatches.find((s) => s.id === selectedSwatch) ?? null : null),
    [pressing, selectedSwatch],
  );

  // ── Progressive-disclosure gates ──
  const nameDone = albumName.trim().length >= 1;
  const recordDone = lpConfig !== null;
  const colorDone = swatch !== null;
  const tracksDone = colorDone; // sane default of 10 → auto-complete with unlock
  const runDone = qty !== null;

  const recordLocked = !nameDone;
  const colorLocked = !recordDone;
  const tracksLocked = !colorDone;
  const runLocked = !tracksDone;
  const finalLocked = !runDone;

  // ── Guarded pricing math (identical formulas; null run → no numbers) ──
  const runQty = qty ?? 0;
  const mfgUnit = useMemo(() => mfgUnitFor(runQty || MIN_RUN), [runQty]);
  const publishingUnit = useMemo(() => round2(PUBLISHING_PER_TRACK_SIDE * 2 * tracks), [tracks]);
  const paymentUnit = useMemo(() => round2(retail * PAYMENT_RATE), [retail]);
  const perUnitCost = useMemo(
    () => round2(mfgUnit + publishingUnit + paymentUnit + GOODTUNES_UNIT),
    [mfgUnit, publishingUnit, paymentUnit],
  );
  const perUnitProfit = useMemo(() => round2(retail - perUnitCost), [retail, perUnitCost]);
  const total = useMemo(() => perUnitProfit * runQty, [perUnitProfit, runQty]);
  const runCost = useMemo(() => perUnitCost * runQty, [perUnitCost, runQty]);
  const fansPay = useMemo(() => retail * runQty, [retail, runQty]);

  const signedProjected = useMemo(() => {
    const byRate = Math.floor(runQty * (takeRate / 100));
    const capped = limitMode === 'limit' ? Math.min(byRate, signedCap) : byRate;
    return Math.max(0, Math.min(capped, runQty));
  }, [runQty, takeRate, limitMode, signedCap]);

  const signedCost = useMemo(() => signedCostFor(signedProjected), [signedProjected]);
  const signedNetPerCert = useMemo(() => signedPrice - signedCost, [signedPrice, signedCost]);
  const signedEarnings = useMemo(
    () => (signedOn ? Math.max(0, signedNetPerCert) * signedProjected : 0),
    [signedOn, signedNetPerCert, signedProjected],
  );
  const belowMinimum = signedOn && signedProjected > 0 && signedProjected < SIGNED_MINIMUM;
  const grandTotal = total + signedEarnings;

  // The stage caption reads differently before a color is picked.
  const stageCaption = colorDone ? null : 'Pick a color to see your record.';

  return (
    <ArtistShell>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 80 }}>
        {/* Quiet opening header — Apple "Shop" energy */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
                Projects
              </a>
              <span className="text-slate-300">›</span>
              <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
                CALIFORNIALAND
              </a>
              <span className="text-slate-300">›</span>
              <span className="text-slate-700">12&rdquo; Vinyl &mdash; {pressing.name}{swatch ? ` ${swatch.name}` : ''}</span>
            </div>
            <h1 className="tracking-tight text-slate-900" style={{ fontSize: 40, fontWeight: 700, marginTop: 10, lineHeight: 1.05 }}>
              Design your record.
            </h1>
            <p className="text-slate-500" style={{ fontSize: 16, marginTop: 10, maxWidth: 560 }}>
              Your new album — a 12" LP. Make one choice at a time.
            </p>
            {/* one slim printer credit line */}
            <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
              <span className="w-6 h-6 rounded-full bg-white ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 p-1">
                <img src={mrpLogo} alt="Memphis Record Pressing" className="w-full h-full object-contain" />
              </span>
              <span className="text-[12.5px] text-slate-500">
                Pressed by <span className="font-semibold text-slate-700">Memphis Record Pressing</span>
              </span>
            </div>
          </div>

        </div>

        {/* Split: sticky product stage · scrolling steps */}
        <div
          style={{
            marginTop: 36,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 460px',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* LEFT — sticky calm stage */}
          <div className="sticky" style={{ top: 24 }}>
            <ProductStage swatch={swatch} />
            <div className="flex items-center justify-center gap-2 text-[13px] text-slate-500" style={{ marginTop: 20 }}>
              {colorDone && swatch ? (
                <>
                  <span
                    className="inline-block w-3 h-3 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: swatch.color }}
                  />
                  <span className="font-semibold text-slate-700">
                    {swatch.id} {swatch.name}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>{pressing.name} {lpConfig === 'double' ? 'double LP' : '12" LP'} · {tracks} tracks</span>
                </>
              ) : (
                <span className="text-slate-400">{stageCaption}</span>
              )}
            </div>
            <p className="text-[12px] text-slate-400 text-center" style={{ marginTop: 6 }}>
              Every 12" LP ships in the standard jacket.
            </p>

            {/* Money story — three clearly-labeled parts. Until a run is chosen,
                calm "—" placeholders stand in for cost/take-home. */}
            <div
              className="rounded-2xl bg-white"
              style={{ marginTop: 24, border: '1px solid #E2E8F0', overflow: 'hidden' }}
            >
              {/* YOUR COST */}
              <div style={{ padding: 20, borderBottom: '1px solid #E2E8F0' }}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider font-bold text-slate-500">
                      Your cost — this run
                    </div>
                    <div className="tabular-nums leading-none text-slate-900" style={{ fontSize: 32, fontWeight: 700, marginTop: 8 }}>
                      {runDone ? fmtUSD(runCost) : DASH}
                    </div>
                  </div>
                  <div className="text-right text-[12px] text-slate-500 leading-snug">
                    {runDone ? (
                      <>
                        {fmtUSD(perUnitCost)}/unit
                        <br />
                        {runQty.toLocaleString()} pcs
                      </>
                    ) : (
                      <>
                        {DASH}/unit
                        <br />
                        {DASH} pcs
                      </>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400" style={{ marginTop: 10 }}>
                  {runDone
                    ? 'What you\u2019re billed to press — nothing is charged until you send this to press.'
                    : 'Choose a run size to see what this costs to press.'}
                </p>
              </div>

              {/* FANS PAY + TAKE-HOME */}
              <div style={{ padding: 20 }}>
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-slate-500">Fans pay · {fmtUSD(retail)} each</span>
                  <span className="tabular-nums font-semibold text-slate-700">{runDone ? fmtUSD(fansPay) : DASH}</span>
                </div>
                <p className="text-[11px] text-slate-400" style={{ marginTop: 2 }}>
                  {runDone ? `Gross at sell-out (${runQty.toLocaleString()} pcs)` : 'Gross at sell-out'}
                </p>

                {/* YOUR TAKE-HOME */}
                <div
                  className="rounded-xl text-white"
                  style={{ marginTop: 14, padding: 16, background: `linear-gradient(135deg, ${RUBY} 0%, #9A1230 100%)` }}
                >
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wider font-bold text-white/70">
                        Your take-home
                      </div>
                      <div className="tabular-nums leading-none" style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>
                        {runDone ? fmtUSD(grandTotal) : DASH}
                      </div>
                    </div>
                    <div className="text-right text-[12px] text-white/80 leading-snug">
                      {runDone ? (
                        <>
                          {fmtUSD(perUnitProfit)}/unit
                          <br />
                          at sell-out
                        </>
                      ) : (
                        <>
                          {DASH}/unit
                          <br />
                          at sell-out
                        </>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/12 px-3 py-2.5 text-[12px]" style={{ marginTop: 12 }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/80">Vinyl earnings</span>
                      <span className="tabular-nums font-semibold">{runDone ? fmtUSD(total) : DASH}</span>
                    </div>
                    {signedOn && runDone && (
                      <div className="flex items-center justify-between gap-3" style={{ marginTop: 6 }}>
                        <span className="flex items-center gap-1.5 text-white/80">
                          <PenLine className="w-3 h-3 flex-shrink-0" />
                          + Signed GoodDeed® est. · {signedProjected.toLocaleString()} certs
                        </span>
                        <span className="tabular-nums font-semibold">+{fmtUSD(signedEarnings)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-white/70" style={{ marginTop: 10 }}>
                    {runDone
                      ? signedOn
                        ? 'Signed certificates are an estimate — billed on actual sales.'
                        : 'Your profit at sell-out.'
                      : 'Your profit appears once you pick a run size.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — the decision sequence, disclosed one step at a time */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            {/* STEP a · The album — always active */}
            <section>
              <StepHeading lead="The album." rest="What's it called?" />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                This is the name fans will see everywhere — the store, the jacket, the GoodDeed® certificate.
              </p>
              <input
                type="text"
                value={albumName}
                onChange={(e) => setAlbumName(e.target.value)}
                placeholder="Album name"
                aria-label="Album name"
                data-testid="input-album-name"
                className="w-full rounded-xl bg-white font-semibold focus:outline-none transition-shadow"
                style={{
                  marginTop: 18,
                  padding: '16px 18px',
                  fontSize: 17,
                  color: INK,
                  border: `1px solid ${HAIRLINE}`,
                  boxShadow: PILL_SHADOW,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = `1px solid ${BLUE}`;
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(49,158,216,0.15)`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = `1px solid ${HAIRLINE}`;
                  e.currentTarget.style.boxShadow = PILL_SHADOW;
                }}
              />
              <p className="text-[12px] text-slate-400" style={{ marginTop: 10 }}>
                {nameDone
                  ? 'Nice. Hover the record on the left to add cover artwork anytime.'
                  : 'Start typing to begin — each choice unlocks the next.'}
              </p>
            </section>

            {/* STEP b · The record — unlocks once the album is named */}
            <LockableSection locked={recordLocked} testId="section-record">
              <StepHeading lead="The record." rest="Single or double LP?" />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Both are 12" vinyl. A double LP spreads a longer album across two discs.
              </p>
              <div
                style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
              >
                {([
                  { id: 'single' as const, title: 'Single LP', meta: 'One 12" disc' },
                  { id: 'double' as const, title: 'Double LP', meta: 'Two 12" discs' },
                ]).map((o) => {
                  const on = o.id === lpConfig;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setLpConfig(o.id)}
                      aria-pressed={on}
                      data-testid={`lp-${o.id}`}
                      className={
                        on
                          ? 'rounded-xl border-2 bg-white text-left transition-colors focus:outline-none'
                          : 'rounded-xl border border-slate-200 bg-white text-left transition-colors hover:bg-slate-50 focus:outline-none'
                      }
                      style={{ padding: 16, borderColor: on ? BLUE : undefined }}
                    >
                      <div className="text-[15px] font-semibold text-slate-900 leading-tight">{o.title}</div>
                      <div className="text-[12px] text-slate-400" style={{ marginTop: 3 }}>{o.meta}</div>
                    </button>
                  );
                })}
              </div>
            </LockableSection>

            {/* STEP c · Color — unlocks once the LP format is chosen */}
            <LockableSection locked={colorLocked} testId="section-color" scrollOnUnlock>
              <StepHeading lead="Color." rest="Pick your pressing." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Choose a pressing type, then a color. The record shows your choice on the left.
              </p>

              <div
                style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}
              >
                {POPULAR_PRESSINGS.map((p) => (
                  <PressingTile
                    key={p.id}
                    pressing={p}
                    active={p.id === pressing.id}
                    onSelect={() => choosePressing(p.id)}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                data-testid="pressing-more"
                className="group flex items-center gap-2 focus:outline-none"
                style={{ marginTop: 12 }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full border"
                  style={{
                    width: 20,
                    height: 20,
                    borderColor: BLUE,
                    color: BLUE,
                    transition: 'transform 300ms cubic-bezier(0.33,0,0.2,1)',
                    transform: moreOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                </span>
                <span className="text-[13px] font-semibold" style={{ color: BLUE }}>
                  {moreOpen ? 'Fewer types' : 'More types'}
                </span>
              </button>

              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: moreOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 320ms cubic-bezier(0.33,0,0.2,1)',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      marginTop: 12,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                      gap: 12,
                    }}
                  >
                    {MORE_PRESSINGS.map((p) => (
                      <PressingTile
                        key={p.id}
                        pressing={p}
                        active={p.id === pressing.id}
                        onSelect={() => choosePressing(p.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-[12px] text-slate-400" style={{ marginTop: 14 }}>
                {pressing.name} · {pressing.swatches.length} {pressing.swatches.length === 1 ? 'color' : 'colors'}
              </p>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {pressing.swatches.map((s) => {
                  const active = s.id === selectedSwatch;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSwatch(s.id)}
                      aria-pressed={active}
                      data-testid={`swatch-${s.id}`}
                      className="rounded-xl bg-white flex flex-col items-center gap-2 transition-all hover:-translate-y-px focus:outline-none"
                      style={{
                        padding: 12,
                        border: active ? `2px solid ${BLUE}` : '1px solid #E2E8F0',
                      }}
                    >
                      <span
                        className="relative rounded-full"
                        style={{ width: 34, height: 34, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}
                      >
                        <span
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${s.color} 70%)`,
                            opacity: 0.92,
                          }}
                        />
                        {active && (
                          <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                        )}
                      </span>
                      <span className="text-[11.5px] font-semibold text-slate-700 text-center leading-tight">
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </LockableSection>

            {/* STEP d · Tracks — unlocks with color; sane default of 10 */}
            <LockableSection locked={tracksLocked} testId="section-tracks" scrollOnUnlock>
              <StepHeading lead="Tracks." rest="How long is the record?" />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Starts at 10 — a full side each. Add more or fewer; we'll re-check the runtime fits.
              </p>
              <div
                className="flex items-center justify-between rounded-2xl bg-white"
                style={{ marginTop: 18, padding: 16, border: '1px solid #E2E8F0' }}
              >
                <div>
                  <div className="text-[13.5px] font-bold text-slate-900">Track count</div>
                  <div className="text-[12.5px] text-slate-500">Default 10 · adjustable anytime</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTracks((t) => Math.max(1, t - 1))}
                    className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    aria-label="Fewer tracks"
                    data-testid="button-tracks-minus"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={tracks}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      setTracks(Number.isFinite(n) ? Math.max(1, Math.min(99, n)) : 1);
                    }}
                    className="w-14 h-10 text-center text-[18px] font-semibold text-slate-900 tabular-nums rounded-xl border border-slate-200 focus:outline-none focus:border-slate-400 transition-colors"
                    aria-label="Track count"
                    data-testid="input-tracks"
                  />
                  <button
                    type="button"
                    onClick={() => setTracks((t) => t + 1)}
                    className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    aria-label="More tracks"
                    data-testid="button-tracks-plus"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </LockableSection>

            {/* STEP e · The run — unlocks with tracks; picking one unlocks final */}
            <LockableSection locked={runLocked} testId="section-run">
              <StepHeading lead="The run." rest="Choose how many to press." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Runs range from {MIN_RUN} to {MAX_RUN.toLocaleString()} units, press-dependent.
                Bigger runs cost less per record. Cost updates as you change the size.
              </p>

              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {RUN_LADDER.map((n) => {
                  const on = n === qty;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRun(n)}
                      aria-pressed={on}
                      data-testid={`run-tile-${n}`}
                      className={
                        on
                          ? 'rounded-xl border-2 bg-white text-left transition-colors focus:outline-none'
                          : 'rounded-xl border border-slate-200 bg-white text-left transition-colors hover:bg-slate-50 focus:outline-none'
                      }
                      style={{ padding: 12, borderColor: on ? BLUE : undefined }}
                    >
                      <div className="text-[17px] font-bold text-slate-900 tabular-nums leading-none">
                        {n.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-400" style={{ marginTop: 4 }}>
                        {fmtUSD(mfgUnitFor(n))}/unit to press
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Live cost / take-home once a run is chosen */}
              <div
                className="flex items-center justify-between rounded-2xl"
                style={{ marginTop: 12, padding: '14px 18px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}
              >
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Your cost</div>
                  <div className="text-[16px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 2 }}>{runDone ? fmtUSD(runCost) : DASH}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {runDone ? `${fmtUSD(perUnitCost)}/unit · ${runQty.toLocaleString()} pcs` : 'Pick a run size'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: BLUE }}>Take-home</div>
                  <div className="text-[16px] font-bold tabular-nums" style={{ marginTop: 2, color: RUBY }}>{runDone ? fmtUSD(total) : DASH}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {runDone ? `${fmtUSD(perUnitProfit)}/unit at sell-out` : 'at sell-out'}
                  </div>
                </div>
              </div>
            </LockableSection>

            {/* STEP f · Price — final group */}
            <LockableSection locked={finalLocked} testId="section-price" scrollOnUnlock>
              <StepHeading lead="The price." rest="Choose your sale price." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Set what each fan pays. Your profit is the sale price minus your cost per unit.
              </p>

              <div
                className="flex items-center justify-between rounded-2xl bg-white"
                style={{ marginTop: 18, padding: 16, border: '1px solid #E2E8F0' }}
              >
                <div>
                  <div className="text-[13.5px] font-bold text-slate-900">Retail price</div>
                  <div className="text-[12.5px] text-slate-500">What each fan pays</div>
                </div>
                <div className="flex items-center rounded-xl border border-slate-200 px-3" style={{ height: 44, width: 140 }}>
                  <span className="text-[15px] text-slate-400 mr-1.5">$</span>
                  <input
                    type="number"
                    min={0}
                    value={retail}
                    onChange={(e) => setRetail(Number(e.target.value) || 0)}
                    className="flex-1 bg-transparent text-[16px] font-semibold text-slate-900 tabular-nums focus:outline-none"
                    data-testid="input-retail"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-2xl bg-white" style={{ marginTop: 12, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setBreakdownOpen((v) => !v)}
                  data-testid="button-breakdown-toggle"
                  aria-expanded={breakdownOpen}
                  className="w-full flex items-center justify-between gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  style={{ padding: 16 }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ border: `1.5px solid ${BLUE}`, color: BLUE }}
                    >
                      <Plus
                        className="w-3.5 h-3.5"
                        style={{ transition: 'transform 300ms cubic-bezier(0.33,0,0.2,1)', transform: breakdownOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                        strokeWidth={2.5}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold text-slate-900">
                        Profit <span className="font-medium text-slate-400">per unit sold</span>
                      </div>
                      <div className="text-[12px] text-slate-500">
                        {breakdownOpen ? 'Hide the per-unit breakdown' : 'See where every dollar goes'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[20px] font-bold tabular-nums flex-shrink-0" style={{ color: RUBY }}>
                    {runDone ? fmtUSD(perUnitProfit) : DASH}
                  </span>
                </button>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: breakdownOpen ? '1fr' : '0fr',
                    transition: 'grid-template-rows 360ms cubic-bezier(0.33,0,0.2,1)',
                  }}
                >
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 16px 16px 16px' }}>
                      <div className="rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: 14 }}>
                        <BreakdownRow
                          label="Manufacturing"
                          note={runDone ? `${fmtUSD(mfgUnit * runQty)} run` : undefined}
                          value={fmtUSD(mfgUnit)}
                        />
                        <BreakdownRow
                          label="Publishing"
                          note={`(${fmtUSD3(PUBLISHING_PER_TRACK_SIDE)} × 2 [vinyl+digital]) × ${tracks} tracks`}
                          value={fmtUSD(publishingUnit)}
                        />
                        <BreakdownRow label="Payment processing" value={fmtUSD(paymentUnit)} />
                        <BreakdownRow label="GoodTunes" value={fmtUSD(GOODTUNES_UNIT)} />
                        <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 8, paddingTop: 8 }}>
                          <BreakdownRow
                            label="Cost / unit"
                            note={runDone ? `${fmtUSD(runCost)} run` : undefined}
                            value={fmtUSD(perUnitCost)}
                            bold
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                        <span className="text-[12.5px] text-slate-500">
                          Profit per unit sold {runDone ? `· ${runQty.toLocaleString()} pcs at sell-out` : ''}
                        </span>
                        <span className="text-[13.5px] font-bold tabular-nums text-slate-900">
                          {runDone ? fmtUSD0(total) : DASH}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </LockableSection>

            {/* STEP · GoodDeed® — final group */}
            <LockableSection locked={finalLocked} testId="section-gooddeed">
              <StepHeading lead="GoodDeed®." rest="Make it collectible." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8, maxWidth: 560 }}>
                Every record already includes a numbered, QR-verified GoodDeed® certificate of
                ownership (&ldquo;owns no. 5 of {albumName.trim() || 'your album'}&rdquo;) &mdash; free with the digital
                complement on every release. The option below adds a premium tier: a printed
                certificate you wet-sign, sealed with a holographic authentication sticker.
              </p>

              <div className="rounded-2xl bg-white" style={{ marginTop: 18, border: signedOn ? `2px solid ${BLUE}` : '1px solid #E2E8F0', boxShadow: signedOn ? '0 6px 20px rgba(49,158,216,0.14)' : 'none' }}>
                <button
                  type="button"
                  onClick={() => setSignedOn((v) => !v)}
                  data-testid="toggle-signed-gooddeed"
                  className="w-full text-left flex items-start justify-between gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded-2xl"
                  style={{ padding: 20 }}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: RUBY_SOFT, color: RUBY }}
                    >
                      <PenLine className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-slate-900">Offer Signed GoodDeed®</div>
                      <div className="text-[12.5px] text-slate-500" style={{ marginTop: 4, maxWidth: 460 }}>
                        You sign each certificate. We handle printing, the holographic authenticity
                        seal, and fulfillment with the record. One per vinyl &mdash; a true
                        collectible that helps the record sell.
                      </div>
                    </div>
                  </div>
                  <span
                    className="relative flex-shrink-0 rounded-full transition-colors"
                    style={{ width: 42, height: 24, backgroundColor: signedOn ? BLUE : '#CBD5E1' }}
                  >
                    <span
                      className="absolute rounded-full bg-white transition-transform"
                      style={{ width: 18, height: 18, top: 3, left: 3, transform: signedOn ? 'translateX(18px)' : 'translateX(0)', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                    />
                  </span>
                </button>

                {signedOn && (
                  <div style={{ padding: 20, paddingTop: 4 }}>
                    <div className="rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: 18 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                        <div>
                          <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                            Sale price
                            <span className="ml-1.5 text-[10px] font-semibold normal-case tracking-normal" style={{ color: BLUE }}>
                              Suggested $25
                            </span>
                          </label>
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3" style={{ height: 42, marginTop: 6 }}>
                            <span className="text-[15px] text-slate-400 mr-1.5">$</span>
                            <input
                              type="number"
                              min={0}
                              value={signedPrice}
                              onChange={(e) => setSignedPrice(Number(e.target.value) || 0)}
                              className="flex-1 bg-transparent text-[15px] font-semibold text-slate-900 tabular-nums focus:outline-none"
                              data-testid="input-signed-price"
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                            Expected take rate
                          </label>
                          <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3" style={{ height: 42, marginTop: 6 }}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={takeRate}
                              onChange={(e) => setTakeRate(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                              className="flex-1 bg-transparent text-[15px] font-semibold text-slate-900 tabular-nums focus:outline-none"
                              data-testid="input-take-rate"
                              style={{ width: '100%' }}
                            />
                            <span className="text-[15px] text-slate-400 ml-1.5">%</span>
                          </div>
                          <div className="text-[11px] text-slate-400" style={{ marginTop: 5 }}>
                            of vinyl buyers &mdash; an example of what typically sells
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 16 }}>
                        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                          How many
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => setLimitMode('demand')}
                            data-testid="mode-demand"
                            className="text-left rounded-xl bg-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                            style={{ padding: 12, border: limitMode === 'demand' ? `2px solid ${BLUE}` : '1px solid #E2E8F0' }}
                          >
                            <div className="text-[13px] font-semibold text-slate-900">Sell as many as demand allows</div>
                            <div className="text-[11.5px] text-slate-500" style={{ marginTop: 2 }}>
                              Up to one per vinyl sold
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setLimitMode('limit')}
                            data-testid="mode-limit"
                            className="text-left rounded-xl bg-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                            style={{ padding: 12, border: limitMode === 'limit' ? `2px solid ${BLUE}` : '1px solid #E2E8F0' }}
                          >
                            <div className="text-[13px] font-semibold text-slate-900">Limit quantity</div>
                            <div className="text-[11.5px] text-slate-500" style={{ marginTop: 2 }}>
                              Set a cap for scarcity
                            </div>
                          </button>
                        </div>
                        {limitMode === 'limit' && (
                          <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
                            <label className="text-[12px] text-slate-500">Cap</label>
                            <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3" style={{ height: 40, width: 130 }}>
                              <input
                                type="number"
                                min={0}
                                value={signedCap}
                                onChange={(e) => setSignedCap(Math.max(0, Number(e.target.value) || 0))}
                                className="flex-1 bg-transparent text-[14px] font-semibold text-slate-900 tabular-nums focus:outline-none"
                                data-testid="input-signed-cap"
                                style={{ width: '100%' }}
                              />
                              <span className="text-[12px] text-slate-400 ml-1.5">certs</span>
                            </div>
                            <span className="text-[11.5px] text-slate-400">
                              We use the lower of your cap and projected demand.
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
                        <div className="rounded-xl bg-white" style={{ border: '1px solid #E2E8F0', padding: 12 }}>
                          <div className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Projected certs</div>
                          <div className="text-[19px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 4 }}>
                            {signedProjected.toLocaleString()}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white" style={{ border: '1px solid #E2E8F0', padding: 12 }}>
                          <div className="text-[10.5px] uppercase tracking-wider font-bold text-slate-400">Net per cert</div>
                          <div className="text-[19px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 4 }}>
                            {fmtUSD(Math.max(0, signedNetPerCert))}
                          </div>
                          <div className="text-[10.5px] text-slate-400" style={{ marginTop: 2 }}>
                            {fmtUSD(signedPrice)} − {fmtUSD(signedCost)} cost
                          </div>
                        </div>
                        <div className="rounded-xl" style={{ border: `1px solid ${RUBY}`, backgroundColor: RUBY_SOFT, padding: 12 }}>
                          <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: RUBY }}>Additional earnings</div>
                          <div className="text-[19px] font-bold tabular-nums" style={{ marginTop: 4, color: RUBY }}>
                            {fmtUSD(signedEarnings)}
                          </div>
                        </div>
                      </div>

                      {belowMinimum && (
                        <div
                          className="flex items-start gap-2 rounded-xl text-[12px]"
                          style={{ marginTop: 12, padding: '10px 12px', backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E' }}
                          data-testid="warning-minimum"
                        >
                          <span className="font-semibold flex-shrink-0">Heads up:</span>
                          <span>
                            25-unit minimum. If fewer than 25 signed certificates sell by the
                            window closes, cert orders auto-refund and no print run happens.
                          </span>
                        </div>
                      )}

                      <p className="text-[11.5px] text-slate-400" style={{ marginTop: 12 }}>
                        This is an estimate &mdash; you&rsquo;re billed on actual sales.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </LockableSection>

            {/* Commit — the full three-part money story, one last time */}
            <LockableSection locked={finalLocked} testId="section-commit">
              <div
                className="rounded-2xl"
                style={{ padding: 22, background: '#F8FAFC', border: '1px solid #E2E8F0' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  <div className="rounded-xl bg-white" style={{ border: '1px solid #E2E8F0', padding: 14 }}>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Your cost</div>
                    <div className="text-[20px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 4 }}>{runDone ? fmtUSD0(runCost) : DASH}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums" style={{ marginTop: 2 }}>{runDone ? `${fmtUSD(perUnitCost)}/unit · billed to press` : 'billed to press'}</div>
                  </div>
                  <div className="rounded-xl bg-white" style={{ border: '1px solid #E2E8F0', padding: 14 }}>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Fans pay</div>
                    <div className="text-[20px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 4 }}>{runDone ? fmtUSD0(fansPay) : DASH}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums" style={{ marginTop: 2 }}>{runDone ? `${fmtUSD(retail)} × ${runQty.toLocaleString()} at sell-out` : 'at sell-out'}</div>
                  </div>
                  <div className="rounded-xl" style={{ border: `1px solid ${RUBY}`, backgroundColor: RUBY_SOFT, padding: 14 }}>
                    <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: RUBY }}>Your take-home</div>
                    <div className="text-[20px] font-bold tabular-nums" style={{ marginTop: 4, color: RUBY }}>{runDone ? fmtUSD0(grandTotal) : DASH}</div>
                    <div className="text-[11px] tabular-nums" style={{ marginTop: 2, color: RUBY }}>
                      {runDone
                        ? signedOn
                          ? `${fmtUSD0(total)} vinyl + ${fmtUSD0(signedEarnings)} signed est.`
                          : `${fmtUSD(perUnitProfit)}/unit at sell-out`
                        : 'at sell-out'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
                  <p className="text-[12px] text-slate-400" style={{ maxWidth: 300 }}>
                    Saved as a preview — nothing goes to press until you say so.
                    {signedOn ? ' Signed certificates are billed on actual sales.' : ''}
                  </p>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <Button
                      variant="outline"
                      className="rounded-full bg-white hover:bg-slate-50"
                      style={{ border: `1px solid ${HAIRLINE}`, color: INK, height: 44, paddingLeft: 22, paddingRight: 22, fontSize: 14 }}
                      data-testid="button-export"
                    >
                      <Download className="w-3.5 h-3.5" /> Export quote
                    </Button>
                    <Button
                      className="text-white hover:opacity-90 rounded-full"
                      style={{ backgroundColor: BLUE, borderColor: BLUE, height: 44, paddingLeft: 26, paddingRight: 26, fontSize: 14 }}
                      data-testid="button-save-package"
                    >
                      Save this package
                    </Button>
                  </div>
                </div>
              </div>
            </LockableSection>
          </div>
        </div>
      </div>
    </ArtistShell>
  );
}

export default ArtistProjectPackageConfiguratorFirstRun;
