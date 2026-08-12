// PressCatalogStickers — a PRESS-facing "Stickers" catalog page where a record
// pressing plant defines the promo & UPC sticker options they offer.
//
// Stickers ship on the shrink-wrap: promo stickers carry artwork or a logo,
// UPC stickers carry the barcode retailers scan.
//
//   • LEFT — a large, calm sticker preview that live-updates with the selected
//     size + style, resting on the stage floor with a contact shadow.
//   • RIGHT — two steps: pick a size (2×2 square / 2×3 rectangle / 2" circle /
//     3" circle), then pick a style (Promo / UPC).
//
// Apple canon: two-tone headings, frosted/blurred chrome, hairline borders,
// generous whitespace, no emojis, real ® character. Self-contained handoff:
// this file compiles alone — no imports from ../mockups or shared mock modules.
// Allowed deps only: react, lucide-react, and image assets under ./assets/.

import { useState, useRef, useEffect, createContext, useContext, type ReactNode, type ButtonHTMLAttributes } from 'react';
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
import { Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate } from 'lucide-react';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.png';
// MRP's real logo mark (black, single-color vector) for the sticker face.
import mrpLabelLogo from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';

// ─── Press identity is DATA ──────────────────────────────────────────
// Per-press: every press sees their own name/logo here (e.g. Hellbender),
// never Memphis's.
const MOCK_PRESS = {
  name: 'Memphis Record Pressing',
  logo: mrpLogo,       // white-carrier chip logo (header)
  labelLogo: mrpLabelLogo, // single-color mark on the sticker face
};

const PRESS_STICKER_LOGO = MOCK_PRESS.labelLogo;

// ─── Self-contained UI primitives (were shared @workspace components) ──
// Inlined so this handoff file has no non-allowed imports. The Button
// reproduces the ghost/sm variant class string verbatim; the Popover is a
// minimal state-driven dropdown that renders the same chrome as before.
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground border border-primary-border',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm border-destructive-border',
  outline: 'border [border-color:var(--button-outline)] shadow-xs active:shadow-none',
  secondary: 'border bg-secondary text-secondary-foreground border border-secondary-border',
  ghost: 'border border-transparent',
  link: 'text-primary underline-offset-4 hover:underline',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  default: 'min-h-9 px-4 py-2',
  sm: 'min-h-8 rounded-md px-3 text-xs',
  lg: 'min-h-10 rounded-md px-8',
  icon: 'h-9 w-9',
};

function Button({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      {...props}
    />
  );
}

const PopoverContext = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

// Minimal popover: click trigger to toggle, click-outside / Escape to close.
function Popover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <PopoverContext.Provider value={{ open, setOpen }}>{children}</PopoverContext.Provider>
    </div>
  );
}

function PopoverTrigger({ asChild, children }: { asChild?: boolean; children: ReactNode }) {
  const { open, setOpen } = useContext(PopoverContext);
  void asChild;
  return (
    <span onClick={() => setOpen(!open)} className="inline-flex">
      {children}
    </span>
  );
}

function PopoverContent({
  align = 'center',
  sideOffset = 4,
  className,
  style,
  children,
  ...rest
}: {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'style'>) {
  const { open } = useContext(PopoverContext);
  if (!open) return null;
  const alignStyle: React.CSSProperties =
    align === 'end' ? { right: 0 } : align === 'start' ? { left: 0 } : { left: '50%', transform: 'translateX(-50%)' };
  return (
    <div
      className={cn(
        'absolute z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
        className,
      )}
      style={{ top: `calc(100% + ${sideOffset}px)`, ...alignStyle, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

// ─── Themes — light = apple-canon (default, unchanged); dark = charcoal ──
// The whole page (shell chrome, tiles, cards, headings) reads from THEMES[mode].
// Light stays the default so the ratified light rendering is byte-identical.
// The vinyl/sticker preview render, album art, splatter masks, and product
// imagery are NOT themed — they look identical in both modes.
type Theme = {
  // shell / page surfaces + ink
  canvas: string;
  rail: string;
  card: string;
  hairline: string;
  ink: string;
  subink: string;
  faint: string; // quietest gray (#a1a1a6 in light)
  tick: string;  // breadcrumb dot separator (#d0d0d5 in light)
  blue: string;
  // raised active nav-pill shadow
  pillShadow: string;
  // sticky translucent header
  headerBg: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // "Request" chip fill
  chipFill: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
  // popover / user-menu shadow + menu-row hover wash
  popShadow: string;
  menuHover: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    hairline: '#e6e6ea',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    tick: '#d0d0d5',
    blue: '#319ED8',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    searchPlaceholder: 'placeholder:text-slate-400',
    avatarRing: 'ring-slate-200',
    hoverWash: 'hover:bg-slate-200',
    chipFill: 'rgba(0,0,0,0.06)',
    logoFilter: undefined,
    popShadow: '0 12px 40px rgba(0,0,0,0.16)',
    menuHover: 'hover:bg-slate-50',
  },
  dark: {
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    hairline: 'rgba(255,255,255,0.10)',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    tick: '#48484c',
    blue: '#319ED8',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    chipFill: 'rgba(255,255,255,0.08)',
    logoFilter: 'invert(1) brightness(1.8)',
    popShadow: '0 12px 40px rgba(0,0,0,0.5)',
    menuHover: 'hover:bg-white/5',
  },
};

// The sticker render, contact shadow, and barcode are product imagery — they
// stay identical in both themes and do NOT read from the theme.

// ─── Shapes → sizes: the sticker options a press can offer ───────────
// Artists pick a shape first, then a size within it (mirrors how presses
// publish their template lists). UPC is its own shape with one fixed size.
type StickerShapeId = 'rect' | 'square' | 'circle' | 'upc';

type StickerSize = {
  id: string;
  name: string;
  wIn: number; // real-world width, inches
  hIn: number; // real-world height, inches
};

type StickerShape = {
  id: StickerShapeId;
  name: string;
  note: string;
  kind: 'promo' | 'upc'; // face artwork: promo logo vs barcode
  round: boolean;
  sizes: StickerSize[];
};

const sz = (wIn: number, hIn: number, round = false): StickerSize => ({
  id: `${wIn}x${hIn}`,
  name: round ? `${wIn}"` : `${wIn}" × ${hIn}"`,
  wIn,
  hIn,
});

const MOCK_STICKER_SHAPES: StickerShape[] = [
  {
    id: 'rect',
    name: 'Rectangle',
    note: 'Wide promo strips and title stickers.',
    kind: 'promo',
    round: false,
    sizes: [sz(1.5, 1), sz(2, 1), sz(2, 3), sz(2, 4), sz(2.5, 1)],
  },
  {
    id: 'square',
    name: 'Square',
    note: 'Compact hype squares, tiny to full-size.',
    kind: 'promo',
    round: false,
    sizes: [sz(1, 1), sz(1.5, 1.5), sz(2, 2), sz(2.5, 2.5), sz(3, 3), sz(3.5, 3.5), sz(4, 4)],
  },
  {
    id: 'circle',
    name: 'Circle',
    note: 'Classic round hype stickers.',
    kind: 'promo',
    round: true,
    sizes: [sz(1, 1, true), sz(1.5, 1.5, true), sz(2, 2, true), sz(2.5, 2.5, true), sz(3, 3, true), sz(3.5, 3.5, true), sz(4, 4, true)],
  },
  {
    id: 'upc',
    name: 'UPC',
    note: 'Barcode retailers scan — one standard size.',
    kind: 'upc',
    round: false,
    sizes: [sz(1.75, 0.75)],
  },
];

// ─── Barcode — quiet CSS-only UPC bars, no libraries ─────────────────
// Deterministic bar pattern so it renders identically every time.
const UPC_BARS = [
  2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 1, 1, 2,
  1, 1, 2, 1, 3, 1, 1, 2, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 1, 2,
];

function Barcode({ height, scale = 1 }: { height: number; scale?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 * scale }}>
      <div style={{ display: 'flex', alignItems: 'stretch', height, gap: 1 * scale }} aria-hidden>
        {UPC_BARS.map((w, i) => (
          <div
            key={i}
            style={{
              width: Math.max(1, w * scale),
              background: i % 2 === 0 ? '#111114' : 'transparent',
            }}
          />
        ))}
      </div>
      {scale >= 0.9 && (
        <div style={{ fontSize: 8 * scale, letterSpacing: 2 * scale, color: '#111114', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          8 12345 67890 4
        </div>
      )}
    </div>
  );
}

// ─── The sticker render — white stock, per-shape face ────────────────
// pxPerInch drives real-world proportion; the paper is bright white with a
// soft top-light and a hairline edge so it reads as a die-cut sticker.
function Sticker({
  size,
  shape,
  pxPerInch,
}: {
  size: StickerSize;
  shape: StickerShape;
  pxPerInch: number;
}) {
  const kind = shape.kind;
  const w = Math.round(size.wIn * pxPerInch);
  const h = Math.round(size.hIn * pxPerInch);
  const isCircle = shape.round;
  const radius = isCircle ? '50%' : Math.round(pxPerInch * 0.09);
  const minDim = Math.min(w, h);

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: radius,
        background: 'radial-gradient(circle at 40% 30%, #ffffff 0%, #f7f7f8 62%, #eeeef0 100%)',
        border: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06), inset 0 1px 2px rgba(255,255,255,0.9)',
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {kind === 'promo' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: minDim * 0.05, padding: minDim * 0.12 }}>
          {/* Per-press: this mark is MOCK_PRESS.labelLogo — each press's own logo. */}
          <img
            src={PRESS_STICKER_LOGO}
            alt=""
            aria-hidden
            style={{ width: minDim * 0.52, height: minDim * 0.52, objectFit: 'contain' }}
          />
          {minDim >= 120 && (
            <div
              style={{
                fontSize: Math.max(7, minDim * 0.045),
                fontWeight: 700,
                letterSpacing: minDim * 0.012,
                textTransform: 'uppercase',
                color: '#6e6e73',
                whiteSpace: 'nowrap',
              }}
            >
              Limited Pressing
            </div>
          )}
        </div>
      ) : (
        <Barcode height={h * 0.34} scale={minDim / 200} />
      )}
    </div>
  );
}

// ─── Left preview stage — one large sticker ──────────────────────────
// Fixed-height stage; the sticker rests on the stage floor so the contact
// shadow stays under it (same convention as the label-disc stage).
// 75px per inch: the largest option (4" × 4") renders at 300px and every
// size stays true-to-proportion against the others.
const STAGE_PX_PER_INCH = 75;

function StickerStage({ size, shape }: { size: StickerSize; shape: StickerShape }) {
  const w = Math.round(size.wIn * STAGE_PX_PER_INCH);
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 310, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <Sticker size={size} shape={shape} pxPerInch={STAGE_PX_PER_INCH} />
        </div>
        {/* Contact shadow */}
        <div
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            width: Math.round(w * 0.66),
            height: 14,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.18)',
            filter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      </div>
    </div>
  );
}

// ─── Shape option tile — mini sticker face, representative size ──────
function ShapeTile({
  shape,
  active,
  onSelect,
  t,
}: {
  shape: StickerShape;
  active: boolean;
  onSelect: () => void;
  t: Theme;
}) {
  // Each shape previews at a representative mid-size, scaled to fit 80px.
  const rep = shape.sizes[Math.floor(shape.sizes.length / 2)];
  const tilePxPerInch = 76 / Math.max(rep.wIn, rep.hIn);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`sticker-shape-${shape.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ backgroundColor: t.card, padding: 16, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}` }}
    >
      {/* Fixed thumb box so cards stay aligned; mini sticker scales inside. */}
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sticker size={rep} shape={shape} pxPerInch={tilePxPerInch} />
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
        {shape.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.35 }}>
        {shape.sizes.length === 1 ? shape.sizes[0].name : `${shape.sizes.length} sizes`}
      </div>
    </div>
  );
}

// ─── Size option card — quiet text card (mirrors the record-size row) ─
function SizeCard({
  size,
  round,
  active,
  onSelect,
  t,
}: {
  size: StickerSize;
  round: boolean;
  active: boolean;
  onSelect: () => void;
  t: Theme;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`sticker-size-${size.id}`}
      className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
      style={{ backgroundColor: t.card, padding: '14px 10px', border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, textAlign: 'center', cursor: 'pointer' }}
    >
      <div className="text-[15px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{size.name}</div>
      <div className="text-[11px]" style={{ marginTop: 2, color: t.faint }}>
        {round ? 'Circle' : size.wIn === size.hIn ? 'Square' : 'Rectangle'}
      </div>
    </button>
  );
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

function NavRow({ label, icon: Icon, active, t }: PressNavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && t.hoverWash,
      )}
      style={{
        fontWeight: active ? 600 : 500,
        color: active ? t.ink : t.subink,
        backgroundColor: active ? t.card : undefined,
        boxShadow: active ? t.pillShadow : undefined,
      }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
      <span className="truncate flex-1">{label}</span>
    </a>
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
const COMPONENTS_ACTIVE = 'Stickers';


type CatalogChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; active?: boolean };
const CATALOG_CHILDREN: CatalogChild[] = [
  { label: 'GoodTunes Packages', icon: NavPackage },
  { label: 'White Label', icon: NavLayers, soon: true },
  { label: 'GoodDeed Certificates', icon: NavAward },
  { label: 'Specs', icon: NavWave, soon: true },
  { label: 'Templates', icon: NavTemplate, soon: true },
];

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
        className={cn(
          'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
          !item.active && t.hoverWash,
        )}
        style={{
          fontWeight: item.active ? 600 : 500,
          color: item.active ? t.ink : t.subink,
          backgroundColor: item.active ? t.card : undefined,
          boxShadow: item.active ? t.pillShadow : undefined,
        }}
      >
        <CatalogIcon className="w-4 h-4 flex-shrink-0" style={{ color: item.active ? t.ink : t.faint }} />
        <span className="truncate flex-1 text-left">{item.label}</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint, transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      <div className="space-y-0.5">
        {CATALOG_CHILDREN.map(({ label, icon: Icon, soon, active }) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            className={cn('flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors', !active && t.hoverWash)}
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? t.ink : t.subink,
              backgroundColor: active ? t.card : undefined,
              boxShadow: active ? t.pillShadow : undefined,
            }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? t.ink : t.faint }} />
            <span className="truncate flex-1">{label}</span>
            {soon && (
              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.chipFill, color: t.subink }}>
                Request
              </span>
            )}
          </a>
        ))}
      </div>


      <button
        type="button"
        aria-expanded={componentsOpen}
        onClick={() => setComponentsOpen((v) => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', t.hoverWash)}
        style={{ fontWeight: 500, color: t.subink }}
      >
        <Layers className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
        <span className="truncate flex-1 text-left">Components</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.faint, transform: componentsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {componentsOpen && (
        <div className="space-y-0.5" style={{ marginLeft: 18, paddingLeft: 12, borderLeft: `1px solid ${t.hairline}` }}>
          {COMPONENTS_CHILDREN.map((c) => {
            const active = c.label === COMPONENTS_ACTIVE;
            return (
              <a
                key={c.label}
                href={`#/${c.mock}`}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13px] transition-colors',
                  !active && t.hoverWash,
                )}
                style={{
                  fontWeight: active ? 600 : 500,
                  color: active ? t.ink : t.subink,
                  backgroundColor: active ? t.card : undefined,
                  boxShadow: active ? t.pillShadow : undefined,
                }}
              >
                <span className="truncate flex-1">{c.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

const MOCK_USER = {
  firstName: 'Brandon',
  email: 'brandon@memphisrecordpressing.com',
  initials: 'BS',
  photo: brandonPhoto,
};

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu({ t }: { t: Theme }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow', t.avatarRing)}
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={MOCK_USER.photo} alt={MOCK_USER.initials} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, boxShadow: t.popShadow }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{MOCK_USER.firstName}</div>
          <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{MOCK_USER.email}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.label}
                type="button"
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.menuHover)}
                style={{ color: t.ink }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.menuHover)}
            style={{ color: t.ink }}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
            <span>Sign out</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PressShell({ t, mode, onToggleMode, children }: { t: Theme; mode: 'light' | 'dark'; onToggleMode: () => void; children: ReactNode }) {
  return (
    <div className="h-screen flex flex-col font-sans" style={{ backgroundColor: t.canvas, color: t.ink }}>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: t.headerBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${t.hairline}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* White logo carrier chip stays white in BOTH themes — it is the light surface. */}
          {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={MOCK_PRESS.logo} alt={MOCK_PRESS.name} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {MOCK_PRESS.name}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button
            type="button"
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside
          className="w-60 flex-shrink-0 flex flex-col"
          style={{ backgroundColor: t.rail, borderRight: `1px solid ${t.hairline}` }}
        >
          <div className="px-2.5 py-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
              <input
                className={cn('w-full h-9 pl-8 pr-2 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.card }}
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
            <span className="text-[9px] uppercase tracking-wider font-bold flex-shrink-0" style={{ color: t.faint }}>
              Powered by
            </span>
            <img src={goodtunesLogo} alt="GoodTunes" className="h-5 w-auto" style={{ filter: t.logoFilter }} />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>

      {/* MOCK-ONLY chrome — remove when wiring real theming. */}
      <button
        type="button"
        onClick={onToggleMode}
        className="fixed bottom-4 right-4 z-50 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </div>
  );
}

// ─── Two-tone headings ───────────────────────────────────────────────
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

// ─── Page ────────────────────────────────────────────────────────────
export function PressCatalogStickers() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [selectedShapeId, setSelectedShapeId] = useState<StickerShapeId>('circle');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('3x3');

  const shape = MOCK_STICKER_SHAPES.find((s) => s.id === selectedShapeId) ?? MOCK_STICKER_SHAPES[0];
  const size = shape.sizes.find((s) => s.id === selectedSizeId) ?? shape.sizes[Math.floor(shape.sizes.length / 2)];

  // Picking a shape re-seeds the size to that shape's middle option.
  const chooseShape = (id: StickerShapeId) => {
    setSelectedShapeId(id);
    const next = MOCK_STICKER_SHAPES.find((s) => s.id === id);
    if (next) setSelectedSizeId(next.sizes[Math.floor(next.sizes.length / 2)].id);
  };

  return (
    <PressShell t={t} mode={mode} onToggleMode={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Catalog
            </a>
            <span style={{ color: t.tick }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Vinyl
            </a>
            <span style={{ color: t.tick }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Components
            </a>
            <span style={{ color: t.tick }}>›</span>
            <span style={{ color: t.subink }}>Stickers</span>
          </div>
          <PageHeading lead="Stickers." rest="Promo and UPC options." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
            Pick the sticker sizes you offer. Artists choose from these when they design a record with {MOCK_PRESS.name}.
          </p>
        </div>

        {/* Split: sticky sticker stage · size + style picker */}
        <div
          style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 520px',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* LEFT — the calm sticker stage (sticky) */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <StickerStage size={size} shape={shape} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: t.subink }}>
                <span className="font-semibold" style={{ color: t.ink }}>
                  {size.name}
                </span>
                <span style={{ color: t.tick }}>·</span>
                <span>{shape.name}</span>
              </div>
              <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: t.faint }}>
                {shape.note}
              </p>
            </div>
          </div>

          {/* RIGHT — pick a shape → pick a size */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            {/* Shape */}
            <section>
              <StepHeading lead="Pick a shape." rest="Die-cut to fit." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                Stickers apply to the shrink-wrap, not the jacket itself.
              </p>
              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {MOCK_STICKER_SHAPES.map((s) => (
                  <ShapeTile
                    key={s.id}
                    shape={s}
                    active={s.id === selectedShapeId}
                    onSelect={() => chooseShape(s.id)}
                    t={t}
                  />
                ))}
              </div>
            </section>

            {/* Size — options follow the chosen shape */}
            <section>
              <StepHeading lead="Pick a size." rest={`For ${shape.name.toLowerCase()}s.`} t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {shape.id === 'upc'
                  ? 'UPC stickers come in one standard retail size.'
                  : 'Every size prints on the same white die-cut stock.'}
              </p>
              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {shape.sizes.map((s) => (
                  <SizeCard
                    key={s.id}
                    size={s}
                    round={shape.round}
                    active={s.id === selectedSizeId}
                    onSelect={() => setSelectedSizeId(s.id)}
                    t={t}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </PressShell>
  );
}

export default PressCatalogStickers;
