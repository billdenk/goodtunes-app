// ArtistProjectPackageConfigurator — an ALTERNATIVE package page for
// CALIFORNIALAND, modeled on the calm confidence of Apple's "Shop iPad Pro"
// configurator. It's the side-by-side counterpart to ArtistProjectPackage.tsx
// (which is left untouched).
//
// The Apple pattern, translated to GoodTunes:
//   • A LARGE, calm product stage on the LEFT that stays with you as you scroll
//     (sticky) — here the CALIFORNIALAND jacket + vinyl disc, big and
//     celebrated, with the same "greet" behavior as the other page: the disc
//     rolls out slowly on load and on every color change, then tucks back to a
//     sliver behind the jacket.
//   • The RIGHT is a vertical sequence of decision steps, each led by a big
//     two-tone Apple heading ("Color. Pick your pressing.") with generous
//     bordered option cards that highlight when selected and write the price
//     consequence right on the card.
//   • A quiet opening header with an artist-net "from" number, and a persistent
//     take-home total that updates as choices change — the most motivating
//     element on the page.
//
// Money story has three clearly-labeled parts so the artist can answer "what
// does this cost me?" at a glance and never read the page as a "$20,700
// project": 12" LP, T01 Ruby, $35 retail, 1,000 pcs → COST $14.30/unit =
// $14,300 billed to press; FANS PAY $35 × 1,000 = $35,000 at sell-out;
// TAKE-HOME $20.70/unit = $20,700.00. A GoodDeed® is a numbered, QR-verified
// certificate of ownership included free on every record; the OPT-IN Signed
// GoodDeed® estimator adds wet-signed, holographically sealed premium certs
// (GoodTunes Direct only) with additional earnings shown as a separate line,
// never blended into take-home. Pressed by Memphis Record Pressing. No
// charity/cause math. Conventions: no emojis, brand blue #319ED8 inline for
// primary actions, real cover asset, inline styles for anything
// Tailwind-arbitrary. Only this file is touched.

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
import californialandCover from '../assets/californialand-cover.jpg';

// ─── Brand tokens ────────────────────────────────────────────────────
const BLUE = '#319ED8';
const RUBY = '#C81E38';
const RUBY_SOFT = 'rgba(200, 30, 56, 0.06)';

// Apple-system surface tokens (mirrors ArtistDashboard)
const INK = '#1d1d1f'; // near-black headline ink
const SUBINK = '#6e6e73'; // calm secondary gray
const HAIRLINE = '#e6e6ea'; // whisper-quiet card border
const CANVAS = '#f5f5f7'; // near-white page canvas
const RAIL = '#f5f5f7'; // left-rail surface
const PILL_SHADOW = '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)';

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

// ─── Shell primitives (mirrors ArtistFirstRun / ArtistProjectPackage) ─

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
// The full press catalog runs ~18 types. We keep it Apple-calm: a short row of
// popular types plus a "More types" select, with the swatch grid below swapping
// to the chosen type's palette. Translucent is the default (our original 12).
// Non-default palettes are plausible mockup sets; the disc on the left follows
// whichever swatch is picked.

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
    // Demo of a press-created category rendered "on the fly": a new type is
    // just a name + color list + finish recipe — everything below renders
    // automatically from that data.
    id: 'galaxy',
    name: 'Galaxy Swirl',
    swatches: [
      { id: 'GX1', name: 'Nebula', color: '#6D4A9E' },
      { id: 'GX2', name: 'Supernova', color: '#1F8A8C' },
      { id: 'GX3', name: 'Red Dwarf', color: '#B03040' },
      { id: 'GX4', name: 'Cosmic Gold', color: '#C89A3C' },
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

// The disc must stay VISIBLE AT ALL TIMES — its start/rest pose keeps a clear
// slim crescent (a moon of color) peeking past the jacket's right edge. On the
// automatic greet (load + color change) the disc rolls well out to show the
// color, then eases back. On hover/tap the jacket eases LEFT while the disc
// rolls further RIGHT, like the record being drawn out of the sleeve.
const DISC_TUCKED = 'translateX(-12%) rotate(-14deg)'; // rest: slim moon only
const DISC_GREET = 'translateX(30%) rotate(16deg)'; // auto greet + hover/tap
const JACKET_REST = 'translateX(0)';
const JACKET_PULLED = 'translateX(-9%)'; // eases left on draw-out
const EASE = 'cubic-bezier(0.33, 0, 0.2, 1)'; // same unhurried family as greet

function ProductStage({ swatch, pressingId }: { swatch: Swatch; pressingId?: string }) {
  const [greetKey, setGreetKey] = useState(0);
  // `active` drives the draw-out via CSS transitions so pointer + touch share
  // one code path (no hover-only pseudo-classes). Hover sets/clears it; tap
  // toggles it for touch devices with no hover.
  const [active, setActive] = useState(false);
  useEffect(() => {
    setGreetKey((k) => k + 1);
  }, [swatch.id]);

  const animName = `cfg-disc-greet-${greetKey}`;
  // While the auto-greet keyframe runs we let it own the transform; once the
  // user interacts (active) we hand control to the transition-driven pose.
  const discTransform = active ? DISC_GREET : DISC_TUCKED;

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
            0%   { transform: ${DISC_TUCKED}; }
            8%   { transform: ${DISC_TUCKED}; }
            48%  { transform: ${DISC_GREET}; }
            62%  { transform: ${DISC_GREET}; }
            100% { transform: ${DISC_TUCKED}; }
          }
        `}</style>

        {/* Vinyl disc — BEHIND the jacket, emerging from its right edge */}
        <div
          key={greetKey}
          className="absolute rounded-full"
          style={{
            top: '8%',
            right: '-16%',
            width: '84%',
            height: '84%',
            background:
              pressingId === 'galaxy'
                ? // Finish recipe drives the render — same swirl as the tile,
                  // scaled up, in the press's exact hex.
                  `radial-gradient(circle at 50% 42%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.30) 100%), conic-gradient(from 210deg at 50% 42%, ${swatch.color} 0%, rgba(255,255,255,0.85) 11%, ${swatch.color} 26%, rgba(18,18,26,0.92) 44%, ${swatch.color} 58%, rgba(255,255,255,0.65) 71%, ${swatch.color} 85%, rgba(18,18,26,0.88) 100%)`
                : `radial-gradient(circle at 50% 42%, ${swatch.color} 0%, ${swatch.color} 34%, rgba(0,0,0,0.30) 100%)`,
            boxShadow: '0 16px 44px rgba(15,23,42,0.30)',
            opacity: 0.97,
            transformOrigin: 'center center',
            transform: discTransform,
            // On interaction, the transition owns the motion; otherwise the
            // keyed keyframe plays the greet then holds the tucked pose.
            animation: active ? 'none' : `${animName} 5000ms ${EASE} 350ms 1 forwards`,
            transition: `transform 750ms ${EASE}`,
            willChange: 'transform',
          }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'repeating-radial-gradient(circle at 50% 42%, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0) 2px, rgba(0,0,0,0.06) 4px)',
            }}
          />
          <div
            className="absolute rounded-full ring-2 ring-white/40 flex items-center justify-center"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '34%',
              height: '34%',
              backgroundColor: '#1F2937',
            }}
          >
            <div className="w-2 h-2 rounded-full bg-white/70" />
          </div>
        </div>

        {/* Jacket with cover art — on top; eases left as the disc draws out */}
        <div
          className="absolute inset-0 overflow-hidden rounded-xl ring-1 ring-black/5"
          style={{
            boxShadow: '0 28px 60px rgba(15,23,42,0.24)',
            zIndex: 1,
            transform: active ? JACKET_PULLED : JACKET_REST,
            transition: `transform 750ms ${EASE}`,
            willChange: 'transform',
          }}
        >
          <img
            src={californialandCover}
            alt="CALIFORNIALAND cover"
            className="w-full h-full object-cover"
          />
          <div
            className="absolute right-0 top-0 h-full"
            style={{ width: 14, background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%)' }}
          />
          {/* Change-artwork affordance — appears on hover with the draw-out */}
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
              data-testid="pill-change-artwork"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              Change artwork
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

// ─── Apple-style − / value / + stepper (Signed GoodDeed panel) ───────

function SignedStepper({
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
  minusLabel,
  plusLabel,
  testId,
  inline,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
  minusLabel: string;
  plusLabel: string;
  testId: string;
  inline?: boolean;
}) {
  const btn =
    'rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300';
  const size = inline ? 32 : 36;
  return (
    <div className="flex items-center gap-2" style={{ marginTop: inline ? 0 : 8 }}>
      <button
        type="button"
        className={btn}
        style={{ width: size, height: size }}
        onClick={() => onChange(value - step)}
        aria-label={minusLabel}
        data-testid={`${testId}-minus`}
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <div
        className="flex items-center justify-center rounded-xl border border-slate-200 bg-white tabular-nums"
        style={{ height: size, minWidth: inline ? 92 : 104, padding: '0 14px' }}
        data-testid={testId}
      >
        {prefix && <span className={`${inline ? 'text-[12px]' : 'text-[14px]'} text-slate-400 mr-1`}>{prefix}</span>}
        <span className={`${inline ? 'text-[14px]' : 'text-[15px]'} font-semibold text-slate-900`}>
          {value.toLocaleString()}
        </span>
        {suffix && <span className={`${inline ? 'text-[12px]' : 'text-[14px]'} text-slate-400 ml-1`}>{suffix}</span>}
      </div>
      <button
        type="button"
        className={btn}
        style={{ width: size, height: size }}
        onClick={() => onChange(value + step)}
        aria-label={plusLabel}
        data-testid={`${testId}-plus`}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
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
// Same radial-gradient visual language as the big stage disc: dimensional,
// glossy, calm. Each type gets a plausible finish approximation built from
// its own palette (mockup-grade, not photoreal).

function MiniDisc({ pressing, size = 46 }: { pressing: Pressing; size?: number }) {
  const c0 = pressing.swatches[0]?.color ?? '#1F2937';
  const c1 = pressing.swatches[1]?.color ?? c0;

  // Face fill differs by finish family; grooves + label are shared so every
  // disc reads as the same product.
  let face: string;
  let overlay: string | undefined;
  const id = pressing.id;

  if (id === 'black') {
    // Glossy jet black with a bright specular highlight.
    face = `radial-gradient(circle at 38% 30%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 22%), radial-gradient(circle at 50% 45%, #26262d 0%, #141418 40%, #050507 100%)`;
  } else if (id === 'opaque' || id === 'standard') {
    // Solid matte color, low sheen.
    face = `radial-gradient(circle at 40% 32%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 52%, rgba(0,0,0,0.34) 100%)`;
  } else if (id === 'translucent' || id === 'ghostly') {
    // Soft see-through sheen — lighter core, glassy highlight.
    face = `radial-gradient(circle at 38% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 30%), radial-gradient(circle at 50% 48%, ${c0} 0%, ${c0} 30%, rgba(255,255,255,0.28) 62%, rgba(0,0,0,0.22) 100%)`;
  } else if (id === 'smoke') {
    // Wispy gray smoke blended into the base color.
    face = `radial-gradient(circle at 30% 26%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 68% 70%, ${c1} 0%, rgba(0,0,0,0) 55%), radial-gradient(circle at 50% 45%, ${c0} 0%, #6b7078 60%, rgba(0,0,0,0.30) 100%)`;
  } else if (id === 'half' || id === 'double') {
    // Two-tone split down the middle.
    face = `linear-gradient(90deg, ${c0} 0%, ${c0} 49.5%, ${c1} 50.5%, ${c1} 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 28%), radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.30) 100%)`;
  } else if (id === 'colorincolor') {
    // Ring-in-ring: inner color sitting inside an outer color.
    face = `radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 42%, ${c1} 43%, ${c1} 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0) 28%), radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.28) 100%)`;
  } else if (id === 'neon') {
    // Pale luminous glowing edge.
    face = `radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 46%, rgba(255,255,255,0.55) 78%, ${c0} 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.40) 0%, rgba(255,255,255,0) 26%)`;
  } else if (id === 'splatter' || id === 'glitter') {
    // Base color with fine speckles (layered tiny radial dots).
    face = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c0} 52%, rgba(0,0,0,0.32) 100%)`;
    overlay = `radial-gradient(circle at 30% 34%, ${c1} 0 1.4px, rgba(0,0,0,0) 1.6px), radial-gradient(circle at 62% 30%, ${c1} 0 1.2px, rgba(0,0,0,0) 1.4px), radial-gradient(circle at 70% 62%, ${c1} 0 1.6px, rgba(0,0,0,0) 1.8px), radial-gradient(circle at 40% 68%, ${c1} 0 1.2px, rgba(0,0,0,0) 1.4px), radial-gradient(circle at 55% 52%, ${c1} 0 1.3px, rgba(0,0,0,0) 1.5px)`;
  } else if (id === 'metallic' || id === 'shimmer') {
    // Metallic sheen — angled bright band across the color.
    face = `linear-gradient(125deg, rgba(255,255,255,0.55) 0%, ${c0} 34%, ${c1} 62%, rgba(255,255,255,0.35) 100%)`;
    overlay = `radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.26) 100%)`;
  } else if (id === 'galaxy') {
    // Swirled arcs of the color against deep space + starlight.
    face = `conic-gradient(from 210deg at 50% 45%, ${c0} 0%, rgba(255,255,255,0.85) 11%, ${c0} 26%, rgba(18,18,26,0.92) 44%, ${c0} 58%, rgba(255,255,255,0.65) 71%, ${c0} 85%, rgba(18,18,26,0.88) 100%)`;
    overlay = `radial-gradient(circle at 40% 30%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 26%), radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.30) 100%)`;
  } else if (id === 'torrent' || id === 'deluxe' || id === 'cream' || id === 'ecomix') {
    // Marbled blend of the two palette colors.
    face = `radial-gradient(circle at 34% 30%, ${c1} 0%, rgba(0,0,0,0) 48%), radial-gradient(circle at 66% 68%, ${c0} 0%, rgba(0,0,0,0) 52%), radial-gradient(circle at 50% 45%, ${c0} 0%, ${c1} 70%, rgba(0,0,0,0.28) 100%)`;
  } else {
    // Fallback: clean glossy solid.
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
      {/* Grooves */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'repeating-radial-gradient(circle at 50% 45%, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0) 1.4px, rgba(0,0,0,0.07) 2.6px)',
        }}
      />
      {/* Center label + spindle */}
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

// ─── apple.com-style option tile (pressing types + run sizes) ────────

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

// ─── Generous option card (Apple model-card shape) ───────────────────

function OptionCard({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="group w-full rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      style={{
        padding: 20,
        border: selected ? `2px solid ${BLUE}` : '1px solid #E2E8F0',
        boxShadow: selected ? '0 6px 20px rgba(49,158,216,0.14)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

// ─── GoodDeed® certificate + Signed GoodDeed® Estimator ─────────────
// A GoodDeed® is a numbered, QR-verified certificate of ownership for the fan
// ("owns no. 5 of CALIFORNIALAND"). Every record already includes the standard
// certificate free with its digital complement — automatic, not a choice. The
// OPT-IN premium tier below is a printed certificate the artist wet-signs,
// sealed with a holographic authentication seal, fulfilled with the record
// (one per vinyl). The estimator projects additional earnings from actual
// sales — GoodTunes Direct only.

// Per-cert print cost ladder by projected signed-cert volume tier. Net per
// cert = sale price − ladder cost. Higher volume → lower cost.
const SIGNED_COST_LADDER: Array<{ min: number; max: number; cost: number }> = [
  { min: 25, max: 49, cost: 13 },
  { min: 50, max: 99, cost: 12 },
  { min: 100, max: 249, cost: 9 },
  { min: 250, max: 499, cost: 7 },
  { min: 500, max: Infinity, cost: 6 },
];

function signedCostFor(count: number): number {
  const tier = SIGNED_COST_LADDER.find((t) => count >= t.min && count <= t.max);
  // Below the 25-unit minimum there is no print run; fall back to the entry
  // tier cost for a stable net-per-cert projection.
  return tier ? tier.cost : SIGNED_COST_LADDER[0].cost;
}

const SIGNED_MINIMUM = 25;

// ─── Run size + cost model ───────────────────────────────────────────
// Runs range 50–3,000 units (press-dependent). One quiet control chooses the
// size; a few common sizes plus a custom stepper keep it calm, not a grid.
const MIN_RUN = 50;
const MAX_RUN = 3000;
// Fixed run ladder shown as apple.com-style option tiles (click-to-select only).
const RUN_LADDER = [50, 100, 300, 500, 1000, 2000, 3000];

// Per-unit cost is the SUM of real components so the disclosed breakdown always
// reconciles to the headline number. Anchored so that at $35 retail, 1,000 pcs,
// 10 tracks: $6.24 + $2.54 + $1.02 + $4.50 = $14.30/unit, profit $20.70.
//
// Manufacturing per unit by run-size tier — bigger runs press cheaper.
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
const PUBLISHING_PER_TRACK_SIDE = 0.127; // × 2 (vinyl + digital) × tracks
const PAYMENT_RATE = 0.029143; // of retail → $1.02 at $35
const GOODTUNES_UNIT = 4.5; // flat platform fee per unit
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Page ────────────────────────────────────────────────────────────

export function ArtistProjectPackageConfigurator() {
  // Default pressing is Translucent → Ruby (our original 12 swatches).
  const [albumName, setAlbumName] = useState('CALIFORNIALAND');
  const [selectedPressing, setSelectedPressing] = useState(DEFAULT_PRESSING);
  const [selectedSwatch, setSelectedSwatch] = useState('T01');
  const [tracks, setTracks] = useState(10);
  const [qty, setQty] = useState(1000);
  const [retail, setRetail] = useState(35);
  // Single vs Double LP (12" vinyl). Mockup-level only — not wired into pricing.
  const [lpConfig, setLpConfig] = useState<'single' | 'double'>('single');
  // Apple "learn more ⊕" disclosure for the per-unit pricing breakdown.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  // Inline "More types" drawer for the pressing-type picker (not a popover).
  const [moreOpen, setMoreOpen] = useState(false);
  // ⊕ disclosure for the money-summary detail (per-unit, gross, signed est.).
  const [moneyOpen, setMoneyOpen] = useState(false);

  // Clamp any run size into the press-supported 50–3,000 window.
  const setRun = (n: number) => setQty(Math.max(MIN_RUN, Math.min(MAX_RUN, Math.round(n) || MIN_RUN)));

  // Switching pressing type swaps to that type's palette and selects its first
  // swatch so the disc on the left always follows a valid color.
  const pressing = useMemo(
    () => PRESSINGS.find((p) => p.id === selectedPressing) ?? PRESSINGS.find((p) => p.id === DEFAULT_PRESSING)!,
    [selectedPressing],
  );
  const choosePressing = (id: string) => {
    const next = PRESSINGS.find((p) => p.id === id);
    if (!next) return;
    setSelectedPressing(id);
    setSelectedSwatch(next.swatches[0].id);
  };

  // Signed GoodDeed® estimator. Standard certificate is automatic on every
  // record (not a choice); this opt-in adds the wet-signed premium tier.
  const [signedOn, setSignedOn] = useState(false);
  const [signedPrice, setSignedPrice] = useState(25); // suggested default
  const [takeRate, setTakeRate] = useState(20); // % of vinyl buyers
  const [limitMode, setLimitMode] = useState<'demand' | 'limit'>('demand');
  const [signedCap, setSignedCap] = useState(200);

  const swatch = useMemo(
    () => pressing.swatches.find((s) => s.id === selectedSwatch) ?? pressing.swatches[0],
    [pressing, selectedSwatch],
  );

  // Money story has three clearly-labeled parts, never blended:
  //   COST      — what the artist is billed for the press run (up-front).
  //   FANS PAY   — gross at sell-out (retail × qty).
  //   TAKE-HOME  — the artist's profit (per-unit profit × qty).
  // Cost is the SUM of its components (see breakdown), so the disclosed detail
  // always reconciles: $6.24 + $2.54 + $1.02 + $4.50 = $14.30/unit → profit
  // $20.70 at $35 retail, 1,000 pcs, 10 tracks.
  const mfgUnit = useMemo(() => mfgUnitFor(qty), [qty]);
  const publishingUnit = useMemo(() => round2(PUBLISHING_PER_TRACK_SIDE * 2 * tracks), [tracks]);
  const paymentUnit = useMemo(() => round2(retail * PAYMENT_RATE), [retail]);
  const perUnitCost = useMemo(
    () => round2(mfgUnit + publishingUnit + paymentUnit + GOODTUNES_UNIT),
    [mfgUnit, publishingUnit, paymentUnit],
  );
  const perUnitProfit = useMemo(() => round2(retail - perUnitCost), [retail, perUnitCost]);
  const total = useMemo(() => perUnitProfit * qty, [perUnitProfit, qty]);
  const runCost = useMemo(() => perUnitCost * qty, [perUnitCost, qty]);
  const fansPay = useMemo(() => retail * qty, [retail, qty]);

  // Signed GoodDeed® projection. Rule: max one signed cert per vinyl sold.
  // "No limit" projects from the expected take rate; "Limit quantity" uses the
  // artist's cap directly (scarcity — you decide the number, demand fills it).
  const signedProjected = useMemo(() => {
    const byMode = limitMode === 'limit' ? signedCap : Math.floor(qty * (takeRate / 100));
    return Math.max(0, Math.min(byMode, qty));
  }, [qty, takeRate, limitMode, signedCap]);

  const signedCost = useMemo(() => signedCostFor(signedProjected), [signedProjected]);
  const signedNetPerCert = useMemo(() => signedPrice - signedCost, [signedPrice, signedCost]);
  const signedEarnings = useMemo(
    () => (signedOn ? Math.max(0, signedNetPerCert) * signedProjected : 0),
    [signedOn, signedNetPerCert, signedProjected],
  );
  const belowMinimum = signedOn && signedProjected > 0 && signedProjected < SIGNED_MINIMUM;
  const grandTotal = total + signedEarnings;

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
              <span className="text-slate-700">12&rdquo; Vinyl &mdash; {pressing.name} {swatch.name}</span>
            </div>
            <h1 className="tracking-tight text-slate-900" style={{ fontSize: 40, fontWeight: 700, marginTop: 10, lineHeight: 1.05 }}>
              Design your record.
            </h1>
            <p className="text-slate-500" style={{ fontSize: 16, marginTop: 10, maxWidth: 560 }}>
              {albumName || 'Your album'} by Niina Soleil — a 12" LP.
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
          {/* LEFT — calm stage. Sticky while compact; when the money details
              are expanded the column is taller than the viewport, so it
              simply flows with the page (no nested scrollbar, nothing
              unreachable, and the vinyl pop-out is never clipped). */}
          <div
            className={moneyOpen ? undefined : 'sticky'}
            style={{ top: 24 }}
          >
            <ProductStage swatch={swatch} pressingId={pressing.id} />
            <div className="flex items-center justify-center gap-2 text-[13px] text-slate-500" style={{ marginTop: 20 }}>
              <span
                className="inline-block w-3 h-3 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: swatch.color }}
              />
              <span className="font-semibold text-slate-700">
                {swatch.id} {swatch.name}
              </span>
              <span className="text-slate-300">·</span>
              <span>{pressing.name} {lpConfig === 'double' ? 'double LP' : '12" LP'} · {tracks} tracks</span>
            </div>
            <p className="text-[12px] text-slate-400 text-center" style={{ marginTop: 6 }}>
              Every 12" LP ships in the standard jacket.
            </p>

            {/* Money story — one compact, quiet card. Three lines (cost / fans
                pay / take-home), take-home as ruby TEXT. Detail lives behind a
                ⊕ disclosure so the resting state stays calm. */}
            <div
              className="rounded-2xl bg-white"
              style={{ marginTop: 24, border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }}
            >
              <div style={{ padding: 20 }}>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[13px] text-slate-500">Your cost</span>
                  <span className="tabular-nums text-[15px] font-semibold text-slate-900">{fmtUSD0(runCost)}</span>
                </div>
                <div className="flex items-center justify-between gap-4" style={{ marginTop: 10 }}>
                  <span className="text-[13px] text-slate-500">Fans pay</span>
                  <span className="tabular-nums text-[15px] font-semibold text-slate-900">{fmtUSD0(fansPay)}</span>
                </div>
                <div
                  className="flex items-end justify-between gap-4"
                  style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${HAIRLINE}` }}
                >
                  <span className="text-[14px] font-semibold text-slate-900">Take-home</span>
                  <span className="tabular-nums leading-none" style={{ fontSize: 28, fontWeight: 700, color: RUBY }}>
                    {fmtUSD0(grandTotal)}
                  </span>
                </div>
              </div>

              {/* ⊕ disclosure — quiet detail */}
              <button
                type="button"
                onClick={() => setMoneyOpen((v) => !v)}
                data-testid="button-money-toggle"
                aria-expanded={moneyOpen}
                className="w-full flex items-center gap-2 text-left transition-colors hover:bg-slate-50 focus:outline-none"
                style={{ padding: '12px 20px', borderTop: `1px solid ${HAIRLINE}` }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full border flex-shrink-0"
                  style={{ width: 18, height: 18, borderColor: BLUE, color: BLUE }}
                >
                  <Plus
                    className="w-3 h-3"
                    strokeWidth={2.5}
                    style={{ transition: 'transform 300ms cubic-bezier(0.33,0,0.2,1)', transform: moneyOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                  />
                </span>
                <span className="text-[12.5px] font-semibold" style={{ color: BLUE }}>
                  {moneyOpen ? 'Hide details' : 'View details'}
                </span>
              </button>

              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: moneyOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 360ms cubic-bezier(0.33,0,0.2,1)',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '4px 20px 20px 20px' }}>
                    <div className="rounded-xl" style={{ background: '#F8FAFC', border: `1px solid ${HAIRLINE}`, padding: 14 }}>
                      <BreakdownRow label="Cost / unit" value={fmtUSD(perUnitCost)} />
                      <BreakdownRow label="Fans pay / unit" value={fmtUSD(retail)} />
                      <BreakdownRow label="Gross at sell-out" note={`${qty.toLocaleString()} pcs`} value={fmtUSD(fansPay)} />
                      <div style={{ borderTop: `1px solid ${HAIRLINE}`, marginTop: 8, paddingTop: 8 }}>
                        <BreakdownRow label="Vinyl take-home" note={`${fmtUSD(perUnitProfit)}/unit`} value={fmtUSD(total)} bold />
                      </div>
                      {signedOn && (
                        <div className="flex items-baseline justify-between gap-3" style={{ padding: '3px 0' }}>
                          <span className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
                            <PenLine className="w-3 h-3 flex-shrink-0" />
                            Signed GoodDeed® est. · {signedProjected.toLocaleString()} certs
                          </span>
                          <span className="tabular-nums text-[12.5px] font-semibold" style={{ color: RUBY }}>+{fmtUSD(signedEarnings)}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400" style={{ marginTop: 10 }}>
                      {signedOn
                        ? 'Nothing is charged until you send this to press. Signed certificates are billed on actual sales.'
                        : 'Nothing is charged until you send this to press.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — the decision sequence */}
          <div className="min-w-0 flex flex-col" style={{ gap: 72 }}>
            {/* STEP · The album — name it first */}
            <section>
              <StepHeading lead="The album." rest="What's it called?" />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Fans see this everywhere.
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
            </section>

            {/* STEP · The record — Single vs Double LP (12" vinyl) */}
            <section>
              <StepHeading lead="The record." rest="Single or double LP?" />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Both are 12" vinyl.
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
            </section>

            {/* STEP · Color */}
            <section>
              <StepHeading lead="Color." rest="Pick your pressing." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Choose a type, then a color.
              </p>

              {/* apple.com-style option tiles: popular types + inline "More" drawer */}
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

              {/* More — circled + disclosure expanding an inline drawer */}
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
            </section>

            {/* STEP · Tracks */}
            <section>
              <StepHeading lead="Tracks." rest="How long is the record?" />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Starts at 10.
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
            </section>

            {/* STEP · The run — one quiet control for 50–3,000 units */}
            <section>
              <StepHeading lead="The run." rest="Choose how many to press." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Bigger runs cost less per record.
              </p>

              {/* apple.com-style run-size option tiles — click-to-select only */}
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
                        {fmtUSD(mfgUnitFor(n))}/unit
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* STEP · The price — retail input + Apple-style breakdown */}
            <section>
              <StepHeading lead="The price." rest="Choose your sale price." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Your profit is the sale price minus your cost.
              </p>

              {/* Retail price field */}
              <div
                className="flex items-center justify-between rounded-2xl bg-white"
                style={{ marginTop: 18, padding: 16, border: '1px solid #E2E8F0' }}
              >
                <div>
                  <div className="text-[13.5px] font-bold text-slate-900">Retail price</div>
                  <div className="text-[12.5px] text-slate-500">What each fan pays</div>
                </div>
                {/* Naked inline value — right edge aligns with the profit
                    figure on the card below; border appears only on focus. */}
                <div
                  className="flex items-center justify-end rounded-xl border border-transparent focus-within:border-slate-200 focus-within:bg-white transition-colors"
                  style={{ height: 44, width: 140, paddingRight: 0 }}
                >
                  <span className="text-[16px] text-slate-400 mr-1">$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={retail}
                    onChange={(e) => {
                      const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                      setRetail(Number.isFinite(n) ? Math.max(0, n) : 0);
                    }}
                    className="bg-transparent text-right text-[20px] font-bold text-slate-900 tabular-nums focus:outline-none"
                    data-testid="input-retail"
                    // Auto-size to the digits so the "$" hugs the number.
                    style={{ width: `${Math.max(String(retail).length, 1)}ch` }}
                  />
                </div>
              </div>

              {/* Breakdown — collapsed by default; the ⊕ discloses tech-specs style */}
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
                    {fmtUSD(perUnitProfit)}
                  </span>
                </button>

                {/* Smoothly expanding detail, same div */}
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
                          note={`${fmtUSD(mfgUnit * qty)} run`}
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
                            note={`${fmtUSD(runCost)} run`}
                            value={fmtUSD(perUnitCost)}
                            bold
                          />
                        </div>
                      </div>
                      {/* Profit resolution — mirrors the tech-specs summary line */}
                      <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
                        <span className="text-[12.5px] text-slate-500">
                          Profit per unit sold · {qty.toLocaleString()} pcs at sell-out
                        </span>
                        <span className="text-[13.5px] font-bold tabular-nums text-slate-900">
                          {fmtUSD0(total)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* STEP · GoodDeed® — Signed GoodDeed® Estimator */}
            <section>
              <StepHeading lead="GoodDeed®." rest="Make it collectible." />
              <p className="text-[13.5px] text-slate-500" style={{ marginTop: 8 }}>
                Every record includes a free certificate. Add a signed premium tier below.
              </p>

              {/* Single opt-in card — standard is automatic, so there is no second choice */}
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
                  {/* Switch affordance */}
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
                      {/* Sale price — its own moment */}
                      <div>
                        <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                          Sale price
                        </div>
                        <SignedStepper
                          value={signedPrice}
                          prefix="$"
                          onChange={(n) => setSignedPrice(Math.max(0, n))}
                          minusLabel="Lower price"
                          plusLabel="Raise price"
                          testId="input-signed-price"
                        />
                      </div>

                      {/* Quantity rule — the choice comes first; what follows
                          depends on it (take rate for No limit, cap for Limit) */}
                      <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #E2E8F0' }}>
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
                            <div className="text-[13px] font-semibold text-slate-900">No limit</div>
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
                        {/* The follow-up control sits directly under the tile
                            it belongs to, so the change is easy to spot. */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        {limitMode === 'demand' ? (
                          <div style={{ marginTop: 14, gridColumn: '1' }}>
                            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                              Expected take rate
                            </div>
                            <SignedStepper
                              value={takeRate}
                              suffix="%"
                              onChange={(n) => setTakeRate(Math.max(0, Math.min(100, n)))}
                              minusLabel="Lower take rate"
                              plusLabel="Raise take rate"
                              testId="input-take-rate"
                            />
                            <div className="text-[11px] text-slate-400" style={{ marginTop: 6 }}>
                              of vinyl buyers &mdash; an example of what typically sells
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 14, gridColumn: '2' }}>
                            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                              Cap
                            </div>
                            <SignedStepper
                              value={signedCap}
                              step={25}
                              suffix="certs"
                              onChange={(n) => setSignedCap(Math.max(0, n))}
                              minusLabel="Lower cap"
                              plusLabel="Raise cap"
                              testId="input-signed-cap"
                            />
                            <div className="text-[11px] text-slate-400" style={{ marginTop: 6 }}>
                              never more than one per vinyl sold
                            </div>
                          </div>
                        )}
                        </div>
                      </div>

                      {/* Projection readout */}
                      <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500" style={{ marginTop: 20 }}>
                        What you&rsquo;d earn
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 8 }}>
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

                      {/* Below-minimum warning — happy path stays clean */}
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
            </section>

            {/* Commit — the full three-part money story, one last time */}
            <section
              className="rounded-2xl"
              style={{ padding: 22, background: '#F8FAFC', border: '1px solid #E2E8F0' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <div className="rounded-xl bg-white" style={{ border: '1px solid #E2E8F0', padding: 14 }}>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Your cost</div>
                  <div className="text-[20px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 4 }}>{fmtUSD0(runCost)}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums" style={{ marginTop: 2 }}>{fmtUSD(perUnitCost)}/unit · billed to press</div>
                </div>
                <div className="rounded-xl bg-white" style={{ border: '1px solid #E2E8F0', padding: 14 }}>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Fans pay</div>
                  <div className="text-[20px] font-bold text-slate-900 tabular-nums" style={{ marginTop: 4 }}>{fmtUSD0(fansPay)}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums" style={{ marginTop: 2 }}>{fmtUSD(retail)} × {qty.toLocaleString()} at sell-out</div>
                </div>
                <div className="rounded-xl bg-white" style={{ border: `1px solid ${HAIRLINE}`, padding: 14 }}>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Your take-home</div>
                  <div className="text-[20px] font-bold tabular-nums" style={{ marginTop: 4, color: RUBY }}>{fmtUSD0(grandTotal)}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums" style={{ marginTop: 2 }}>
                    {signedOn ? `${fmtUSD0(total)} vinyl + ${fmtUSD0(signedEarnings)} signed est.` : `${fmtUSD(perUnitProfit)}/unit at sell-out`}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 flex-wrap" style={{ marginTop: 16 }}>
                <p className="text-[12px] text-slate-400 whitespace-nowrap">
                  Saved as a preview — nothing goes to press until you say so.
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
            </section>
          </div>
        </div>
      </div>
    </ArtistShell>
  );
}

export default ArtistProjectPackageConfigurator;
