// ArtistChooseJacket — artist-facing "Choose Your Jacket" screen.
//
// Self-contained handoff copy: verbatim-replacement screen for the real
// GoodTunes app. Compiles alone — no imports from ../mockups or shared mock
// modules. Only depends on react, lucide-react, and local image assets.
//
// Shows ONLY the jacket picker — no disc, no vinyl colors, no swatches.
//   • LEFT  — large sticky jacket preview with gatefold open-on-hover physics.
//             When nothing is selected: neutral placeholder.
//   • RIGHT — five jacket option tiles (Full Color Sleeve, Double Gatefold,
//             Triple Gatefold, Discobag, PVC Deluxe Bag) with hover-fold animations.
//
// Apple canon: two-tone headings, frosted chrome, hairline borders,
// generous whitespace, no emojis.

import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from 'react';
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
  Eye,
  EyeOff,
  ChevronRight,
  Layers,
  Moon,
  Sun,
} from 'lucide-react';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.png';
import mrpLabelLogo from './assets/mrp-logo.svg';
import brandonPhoto from './assets/brandon-seavers.png';

// ── Per-press identity — press name + logos live here ────────────────
// Per-press: every press sees their own name/logo here (e.g. Hellbender),
// never Memphis's.
const MOCK_PRESS = {
  name: 'Memphis Record Pressing',
  logo: mrpLogo,        // header carrier + partner mark
  labelLogo: mrpLabelLogo, // jacket-face / disc-center label mark
};

// ── Per-press label branding ─────────────────────────────────────────
const PRESS_LABEL_LOGO = MOCK_PRESS.labelLogo;
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

// ─── Inlined shell primitives — Button + Popover ─────────────────────
// Self-contained equivalents of the design-system components used by the
// shell chrome (Feedback ghost button + account menu popover). Kept visually
// identical to the real components' rendered output.

const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost'; size?: 'sm' }
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2',
      'border border-transparent',
      'min-h-8 rounded-md px-3 text-xs',
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

// Lightweight popover: click-to-toggle with click-outside dismiss. Matches
// the account-menu positioning (align=end, sideOffset=8) used below.
function Popover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {(Array.isArray(children) ? children : [children]).map((child, i) => {
        if (!child || typeof child !== 'object' || !('type' in child)) return child;
        if (child.type === PopoverTrigger) {
          return (
            <div key={i} onClick={() => setOpen((v) => !v)} style={{ display: 'contents' }}>
              {child}
            </div>
          );
        }
        if (child.type === PopoverContent) {
          return open ? <div key={i} style={{ display: 'contents' }}>{child}</div> : null;
        }
        return child;
      })}
    </div>
  );
}

function PopoverTrigger({ children }: { asChild?: boolean; children: ReactNode }) {
  return <>{children}</>;
}

function PopoverContent({
  children,
  className,
  style,
  'data-testid': testid,
}: {
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
  style?: React.CSSProperties;
  'data-testid'?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      className={cn('z-50 shadow-md outline-none', className)}
      style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, ...style }}
    >
      {children}
    </div>
  );
}

// ─── Themes — light default (pixel-identical to the ratified render) +
//     dark = charcoal admin canon (never navy). The shell chrome, page
//     copy, picker tiles, and the mock-only toggle read from THEMES[mode].
//     Product imagery (vinyl disc, jacket faces, splatter, album art) is
//     NOT themed — it looks the same in both modes.
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;    // was the '#a1a1a6' literal on light
  hairline: string;
  canvas: string;
  rail: string;
  card: string;     // white surface on light
  soft: string;     // segmented-control track
  pillShadow: string;
  // idle (unselected) segmented-control pill label
  pillIdle: string;
  // sticky translucent header
  headerBg: string;
  // faint breadcrumb divider
  divider: string;
  // input placeholder utility class
  searchPlaceholder: string;
  // logo/avatar carrier ring utility class
  avatarRing: string;
  // rail/nav/list hover wash utility class
  hoverWash: string;
  // dashed placeholder border
  dashedBorder: string;
  // dark-only wordmark CSS invert
  logoFilter?: string;
};

const THEMES: Record<'light' | 'dark', Theme> = {
  light: {
    blue: '#319ED8',
    ink: '#1d1d1f',
    subink: '#6e6e73',
    faint: '#a1a1a6',
    hairline: '#e6e6ea',
    canvas: '#f5f5f7',
    rail: '#f5f5f7',
    card: '#ffffff',
    soft: '#f2f2f5',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    pillIdle: '#8e8e93',
    headerBg: 'rgba(255,255,255,0.72)',
    divider: '#d0d0d5',
    searchPlaceholder: 'placeholder:text-slate-400',
    avatarRing: 'ring-slate-200',
    hoverWash: 'hover:bg-slate-200',
    dashedBorder: '#d0d0d5',
    logoFilter: undefined,
  },
  dark: {
    blue: '#319ED8',
    ink: '#f5f5f7',
    subink: '#98989d',
    faint: '#6e6e73',
    hairline: 'rgba(255,255,255,0.10)',
    canvas: '#161617',
    rail: '#1c1c1e',
    card: '#1e1e20',
    soft: '#26262a',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4)',
    pillIdle: '#98989d',
    headerBg: 'rgba(22,22,23,0.72)',
    divider: 'rgba(255,255,255,0.18)',
    searchPlaceholder: 'placeholder:text-white/30',
    avatarRing: 'ring-white/15',
    hoverWash: 'hover:bg-white/5',
    dashedBorder: 'rgba(255,255,255,0.22)',
    logoFilter: 'invert(1) brightness(1.8)',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Jacket options ───────────────────────────────────────────────────
type JacketVariant = {
  id: string;
  label: string;
  note: string; // shown when the variant is selected; '' for standard
};

type JacketOption = {
  id: string;
  name: string;
  note: string;
  gatefoldPanels: 0 | 1 | 2; // 0 = single, 1 = double gatefold, 2 = triple
  printed: boolean;
  variants: JacketVariant[]; // construction choices within this style
};

const V_STANDARD: JacketVariant = { id: 'standard', label: 'Standard', note: '' };
const V_WIDESPINE: JacketVariant = { id: 'widespine', label: 'Widespine', note: 'Wider spine — fits 2LP sets and heavyweight pressings.' };
const V_TIPON: JacketVariant = { id: 'tipon', label: 'Old-Style Tip-On', note: 'Artwork printed on textured paper, wrapped and glued over the board — the vintage look.' };

// ─── Vinyl sizes — chosen first; informs jacket & inner-sleeve options ─
const VINYL_SIZES = [
  { id: '7',  label: '7"',  note: 'Single' },
  { id: '10', label: '10"', note: 'EP' },
  { id: '12', label: '12"', note: 'LP · Standard' },
];

// Jacket styles per record size — mirrors the press's real template catalog
// (names only, not their art). Each style carries its construction variants.
const JACKET_CATALOG: Record<string, JacketOption[]> = {
  '7': [
    { id: 'single',   name: 'Single Jacket',   note: 'Standard printed jacket. Artist supplies artwork.', gatefoldPanels: 0, printed: true, variants: [
      { id: 'nospine', label: 'No Spine',  note: 'Flat pocket — the classic 45 sleeve.' },
      { id: 'spine3',  label: '3mm Spine', note: 'Adds a slim printable spine.' },
    ] },
    { id: 'gatefold', name: 'Gatefold Jacket', note: 'Two-panel fold-out. Extra interior art space.', gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  '10': [
    { id: 'single',   name: 'Single Jacket',   note: 'Standard printed jacket. Artist supplies artwork.', gatefoldPanels: 0, printed: true, variants: [V_STANDARD, V_WIDESPINE] },
    { id: 'gatefold', name: 'Gatefold Jacket', note: 'Two-panel fold-out. Extra interior art space.',     gatefoldPanels: 1, printed: true, variants: [V_STANDARD] },
  ],
  '12': [
    { id: 'single',   name: 'Single Jacket',            note: 'Standard printed jacket. Artist supplies artwork.', gatefoldPanels: 0, printed: true,  variants: [V_STANDARD, V_WIDESPINE, V_TIPON] },
    { id: 'gatefold', name: 'Gatefold Jacket',          note: 'Two-panel fold-out. Extra interior art space.',     gatefoldPanels: 1, printed: true,  variants: [V_STANDARD, V_TIPON] },
    { id: 'trifold',  name: 'Tri-Fold Gatefold Jacket', note: 'Three-panel fold-out. Maximum interior canvas.',    gatefoldPanels: 2, printed: true,  variants: [V_STANDARD] },
    { id: 'discobag', name: 'Discobag',                 note: 'Plain inner sleeve with die-cut center window.',    gatefoldPanels: 0, printed: false, variants: [V_STANDARD] },
  ],
};

const GATEFOLD_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

// ── Jacket Sizes ──────────────────────────────────────────────────────
const JS_BASE = 321; // jacket side length ~321px (≈1.07 × 300px disc)

// ─── Jacket tile thumbnail ─────────────────────────────────────────────
const THUMB = 64; // tile thumbnail side
const THUMB_LOGO = 0.52; // logo width as fraction of thumb — same on every jacket

function JacketThumbnail({ jacket, size = THUMB }: { jacket: JacketOption; size?: number }) {
  if (jacket.id === 'discobag') {
    // No logo. The die-cut window is label-sized — the record's center label
    // peeks through it.
    const hole = size * 0.33;
    return (
      <div
        style={{
          width: size, height: size, position: 'relative', overflow: 'hidden',
          background: '#0a0a0a', border: '1.5px solid #222', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: hole, height: hole,
          borderRadius: '50%',
          overflow: 'hidden',
          // Center label peeking through the window
          background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f2f2f2 60%, #e8e8e8 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 3px rgba(0,0,0,0.30)',
        }}>
          {/* Spindle hole */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: Math.max(2, hole * 0.10), height: Math.max(2, hole * 0.10), borderRadius: '50%', background: '#0a0a0a' }} />
        </div>
      </div>
    );
  }

  const panels = jacket.gatefoldPanels;
  return (
    <div
      style={{
        width: size, height: size, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
        boxShadow: '0 3px 10px rgba(0,0,0,0.40)', flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      {panels >= 1 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)', transform: 'translateX(-50%)' }} />}
      {panels >= 2 && (
        <>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '33.3%', width: 1, background: 'rgba(255,255,255,0.12)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '66.6%', width: 1, background: 'rgba(255,255,255,0.12)' }} />
        </>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: size * THUMB_LOGO, height: size * THUMB_LOGO, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.90 }} />
      </div>
    </div>
  );
}

// ─── Jacket option tile ───────────────────────────────────────────────
// div[role=button] — the variant pills inside are real <button>s, and
// nesting buttons is invalid HTML (hydration error).
function JacketTile({
  jacket,
  active,
  variantId,
  onSelect,
  onVariantSelect,
  t,
}: {
  jacket: JacketOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
  t: Theme;
}) {
  const [hovered, setHovered] = useState(false);
  const showFold = hovered && jacket.gatefoldPanels > 0;
  const hasVariants = jacket.variants.length > 1;
  const selectedVariant = jacket.variants.find((v) => v.id === variantId);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`jacket-${jacket.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, backgroundColor: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flexShrink: 0, display: 'flex', perspective: '300px', perspectiveOrigin: '50% 50%' }}>
        {jacket.gatefoldPanels === 0 ? (
          <JacketThumbnail jacket={jacket} size={THUMB} />
        ) : jacket.gatefoldPanels === 1 ? (
          // Double gatefold mini — front panel lifts toward viewer from left hinge.
          <div style={{ position: 'relative', width: THUMB, height: THUMB, perspective: '300px' }}>
            {/* Back panel — kraft interior, fixed */}
            <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', zIndex: 1 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 7, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Interior</span>
              </div>
            </div>
            {/* Front panel — left-edge hinge, rotateY(-75deg) toward viewer */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
              transformOrigin: 'left center',
              transform: showFold ? 'rotateY(-75deg)' : 'rotateY(0deg)',
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: 'transform',
              overflow: 'hidden', zIndex: 2,
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.90 }} />
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'rgba(0,0,0,0.45)', zIndex: 4 }} />
          </div>
        ) : (
          // Triple gatefold mini — P1 lifts from left hinge, P2 from right hinge.
          <div style={{ position: 'relative', width: THUMB, height: THUMB, perspective: '300px' }}>
            {/* P3 — fixed center anchor, kraft interior */}
            <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', zIndex: 1 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 6, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Interior</span>
              </div>
            </div>
            {/* P2 — right-edge hinge, rotateY(75deg) */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(155deg, #1c1c22 0%, #0f0f14 100%)',
              transformOrigin: 'right center',
              transform: showFold ? 'rotateY(75deg)' : 'rotateY(0deg)',
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: 'transform',
              overflow: 'hidden', zIndex: 2,
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.10)' }} />
            </div>
            {/* P1 — left-edge hinge, rotateY(-75deg) */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
              transformOrigin: 'left center',
              transform: showFold ? 'rotateY(-75deg)' : 'rotateY(0deg)',
              transition: `transform 600ms ${GATEFOLD_EASE}`,
              willChange: 'transform',
              overflow: 'hidden', zIndex: 3,
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.12)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.90 }} />
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'rgba(0,0,0,0.40)', zIndex: 4 }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 1, background: 'rgba(0,0,0,0.40)', zIndex: 4 }} />
          </div>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {jacket.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>
          {jacket.note}
        </div>
        {/* Construction variants — revealed inside the selected style */}
        {active && hasVariants && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: t.soft, border: `1px solid ${t.hairline}` }}>
              {jacket.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`variant-${jacket.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: vActive ? t.ink : t.pillIdle,
                      background: vActive ? t.card : 'transparent',
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

// ─── JacketStage — large left-panel jacket preview ────────────────────
// No disc. Jacket only with gatefold open-on-hover physics.
// When jacketType is null: neutral placeholder.
function JacketStage({ jacketType, widespine = false, tipOn = false, t }: { jacketType: JacketOption | null; widespine?: boolean; tipOn?: boolean; t: Theme }) {
  const JS = JS_BASE;
  const SPINE_W = widespine ? 20 : 10;
  const panels = jacketType?.gatefoldPanels ?? 0;
  const isGatefold = panels > 0;
  const [open, setOpen] = useState(false);
  const [showVinyl, setShowVinyl] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDiscobag = jacketType?.id === 'discobag';

  // hole geometry — shared by the mask and the rim overlay
  const HOLE_D = JS * (368 / 1104);
  const HOLE_R = HOLE_D / 2;

  useEffect(() => {
    // Tip-On: stay closed so the peeled corner on the front cover is the
    // hero — hover still opens the fold.
    if (isGatefold && !tipOn) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
    setOpen(false);
    return undefined;
  }, [jacketType?.id, isGatefold, tipOn]);

  // reset vinyl toggle whenever we leave discobag
  useEffect(() => {
    if (!isDiscobag) setShowVinyl(false);
  }, [isDiscobag]);

  // ── Face surfaces (closures over JS) ──────────────────────────────
  function PrintedFace() {
    const P = JS * 0.16; // peel corner size
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: JS * 0.52, height: JS * 0.52, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.92 }} />
        </div>
        {/* Old-Style Tip-On: the printed paper wrap lifts at the top-right
            corner — exposed board underneath, cream paper-back flap curled over. */}
        {tipOn && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: P, height: P, pointerEvents: 'none' }}>
            {/* Exposed board where the paper has lifted */}
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
              background: 'linear-gradient(135deg, #c4b294 0%, #a8946f 100%)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
            }} />
            {/* Curled paper flap — back side of the printed sheet (cream stock) */}
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
              background: 'linear-gradient(315deg, #ffffff 0%, #f3ecdf 45%, #ddd2bd 100%)',
              filter: 'drop-shadow(-2px 2px 3px rgba(0,0,0,0.35))',
              borderRadius: '0 0 0 4px',
            }} />
            {/* Fold crease highlight along the diagonal */}
            <div style={{
              position: 'absolute', top: 0, left: 0, width: Math.SQRT2 * P, height: 1.5,
              transformOrigin: '0 0', transform: 'rotate(45deg)',
              background: 'rgba(255,255,255,0.55)',
            }} />
          </div>
        )}
      </div>
    );
  }

  function KraftFace() {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden' }}>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: 'rgba(0,0,0,0.035)' }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(80,60,30,0.28)', letterSpacing: 2.5, textTransform: 'uppercase' }}>Interior</span>
        </div>
      </div>
    );
  }

  function DiscobagFace() {
    // CSS mask punches a genuine transparent hole through the bag, revealing the vinyl layer behind it.
    const holeMask = `radial-gradient(circle ${HOLE_R}px at 50% 50%, transparent ${HOLE_R}px, black ${HOLE_R + 0.5}px)`;
    return (
      <div style={{ position: 'absolute', inset: 0 }}>

        {/* ── Vinyl inside layer (z 0) — only rendered when toggled on ── */}
        {showVinyl && (
          <div style={{ position: 'absolute', inset: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Record body */}
            <div style={{
              width: JS * 0.86, height: JS * 0.86, borderRadius: '50%',
              background: 'radial-gradient(circle at 34% 30%, #1a1a1a 0%, #050505 60%)',
              flexShrink: 0, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Groove rings — very faint */}
              {[0.82, 0.68, 0.54, 0.40].map((r) => (
                <div key={r} style={{
                  position: 'absolute',
                  width: `${r * 100}%`, height: `${r * 100}%`,
                  borderRadius: '50%',
                  border: '0.5px solid rgba(255,255,255,0.04)',
                  pointerEvents: 'none',
                }} />
              ))}
              {/* Center label — white stock with press mark */}
              <div style={{
                width: HOLE_D * 0.96, height: HOLE_D * 0.96, borderRadius: '50%',
                background: '#ffffff',
                flexShrink: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{
                  width: HOLE_D * 0.56, height: HOLE_D * 0.56,
                  objectFit: 'contain',
                  filter: 'none',     // black logo on white label
                  opacity: 0.78,
                }} />
                {/* Spindle hole */}
                <div style={{
                  position: 'absolute', width: HOLE_D * 0.075, height: HOLE_D * 0.075,
                  borderRadius: '50%', background: '#f5f5f7',
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Bag face (z 1) — masked to punch the die-cut hole ── */}
        <div style={{
          position: 'absolute', inset: 0,
          background: '#0a0a0a',
          WebkitMaskImage: holeMask,
          maskImage: holeMask,
        }}>
          <div style={{ position: 'absolute', top: JS * 0.10, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#444', letterSpacing: 2, textTransform: 'uppercase' }}>Discobag</span>
          </div>
        </div>

        {/* ── Hole rim — hairline ring at the cut edge (z 2) ── */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: HOLE_D, height: HOLE_D, borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.50)',
          pointerEvents: 'none',
        }} />
      </div>
    );
  }

  function FrontFace() {
    if (jacketType?.id === 'discobag') return <DiscobagFace />;
    return <PrintedFace />;
  }

  const tilt = (!isGatefold || !open)
    ? 'perspective(1200px) rotateY(-8deg) rotateX(2deg)'
    : 'perspective(1200px) rotateY(0deg) rotateX(0deg)';

  const shadowWidthMultiplier = 1;

  // ── No-selection placeholder ──────────────────────────────────────
  if (jacketType === null) {
    return (
      <div style={{
        width: JS, height: JS, flexShrink: 0,
        border: `1.5px dashed ${t.dashedBorder}`, borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: t.faint,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <line x1={16} y1={4} x2={16} y2={32} />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select a jacket style</span>
      </div>
    );
  }

  // ── Jacket assembly ────────────────────────────────────────────────
  const openGatefold = () => { if (isGatefold) { clearTimeout(closeTimer.current); setOpen(true); } };
  const scheduleClose = () => { if (isGatefold) { closeTimer.current = setTimeout(() => setOpen(false), 200); } };

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={openGatefold}
      onMouseLeave={scheduleClose}
    >
      <div style={{
        position: 'relative',
        width: JS,
        height: JS,
        flexShrink: 0,
        zIndex: 2,
        transform: tilt,
        transition: `transform 600ms ${GATEFOLD_EASE}`,
        transformStyle: 'preserve-3d',
      }}>
        {/* perspective container */}
        <div style={{ position: 'absolute', inset: 0, perspective: '1200px', perspectiveOrigin: '50% 50%', overflow: 'visible' }}>

          {/* Single-panel (no gatefold) */}
          {panels === 0 && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <FrontFace />
            </div>
          )}

          {/* ── Double Gatefold ────────────────────────────────────────
              P2 fixed, P1 lifts from left hinge (right-to-left, toward viewer).
              rotateY(-75°) stops face-toward-viewer, not past 90°. */}
          {panels === 1 && (
            <>
              {/* P2 — fixed back board */}
              <div style={{
                position: 'absolute',
                top: open ? 0 : 5, left: open ? 0 : -5,
                width: JS, height: JS,
                overflow: 'hidden', zIndex: 1,
                transition: `top 600ms ${GATEFOLD_EASE}, left 600ms ${GATEFOLD_EASE}`,
              }}>
                <KraftFace />
              </div>
              {/* P1 — front cover, left-edge hinge */}
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: JS, height: JS,
                  transformOrigin: 'left center',
                  transform: open ? 'rotateY(-75deg)' : 'rotateY(0deg)',
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: 'transform',
                  zIndex: 2, overflow: 'hidden',
                }}>
                <FrontFace />
              </div>
              {/* Spine crease */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: 2,
                background: 'rgba(0,0,0,0.40)', zIndex: 3, pointerEvents: 'none',
                opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms`,
              }} />
              {open && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 60%)',
                  zIndex: 0, pointerEvents: 'none',
                }} />
              )}
            </>
          )}

          {/* ── Triple Gatefold ────────────────────────────────────────
              P3 fixed center, P1 lifts from left hinge, P2 from right hinge. */}
          {panels === 2 && (
            <>
              {/* Stacked-cardboard peeks — closed only */}
              {[8, 4].map((offset, i) => (
                <div key={i} style={{
                  position: 'absolute', top: offset, left: -offset,
                  width: JS, height: JS,
                  overflow: 'hidden', zIndex: i,
                  opacity: open ? 0 : 1,
                  transition: `opacity 150ms ease`, pointerEvents: 'none',
                }}>
                  <PrintedFace />
                  <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${0.14 + i * 0.08})` }} />
                </div>
              ))}
              {/* P3 — fixed center anchor */}
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1 }}>
                <KraftFace />
              </div>
              {/* P2 — right-edge hinge, rotateY(75deg) */}
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: JS, height: JS,
                  transformOrigin: 'right center',
                  transform: open ? 'rotateY(75deg)' : 'rotateY(0deg)',
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: 'transform',
                  zIndex: 2, overflow: 'hidden',
                }}>
                <FrontFace />
              </div>
              {/* P1 — left-edge hinge, rotateY(-75deg) */}
              <div
                onMouseEnter={openGatefold}
                onMouseLeave={scheduleClose}
                style={{
                  position: 'absolute', top: 0, left: 0,
                  width: JS, height: JS,
                  transformOrigin: 'left center',
                  transform: open ? 'rotateY(-75deg)' : 'rotateY(0deg)',
                  transition: `transform 600ms ${GATEFOLD_EASE}`,
                  willChange: 'transform',
                  zIndex: 3, overflow: 'hidden',
                }}>
                <FrontFace />
              </div>
              {/* Spine crease lines */}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, background: 'rgba(0,0,0,0.40)', zIndex: 4, pointerEvents: 'none', opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms` }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, background: 'rgba(0,0,0,0.40)', zIndex: 4, pointerEvents: 'none', opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms` }} />
            </>
          )}
        </div>

        {/* Right-spine thickness sliver (closed state) */}
        {!open && (
          <div style={{
            position: 'absolute', top: 0, right: -SPINE_W, bottom: 0, width: SPINE_W,
            background: 'linear-gradient(90deg, #0a0a10 0%, #1a1a22 100%)',
            transform: 'rotateY(90deg)', transformOrigin: 'left center',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {/* Contact shadow — widens as gatefold opens; radial-gradient avoids filter:blur compositing flicker */}
      <div style={{
        position: 'absolute',
        bottom: -14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: JS * shadowWidthMultiplier * 0.88,
        height: 22,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.10) 55%, transparent 80%)',
        pointerEvents: 'none',
        zIndex: 0,
        willChange: 'width',
        transition: `width 600ms ${GATEFOLD_EASE}`,
      }} />

      {/* Vinyl-inside toggle — only visible when discobag is selected */}
      {isDiscobag && (
        <button
          type="button"
          onClick={() => setShowVinyl((v) => !v)}
          aria-label={showVinyl ? 'Hide vinyl inside' : 'Show vinyl inside'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            marginTop: 14,
            padding: '5px 12px 5px 10px',
            borderRadius: 999,
            background: t.headerBg,
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${t.hairline}`,
            boxShadow: t.pillShadow,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: t.subink,
            transition: 'color 120ms ease, background 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = t.ink; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = t.subink; }}
        >
          {showVinyl
            ? <EyeOff style={{ width: 13, height: 13, flexShrink: 0 }} />
            : <Eye style={{ width: 13, height: 13, flexShrink: 0 }} />}
          {showVinyl ? 'Hide vinyl' : 'Vinyl inside'}
        </button>
      )}
    </div>
  );
}

// ─── Shell primitives ────────────────────────────────────────────────
type PressNavItem = { label: string; icon: typeof LayoutDashboard; active?: boolean };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard',   icon: LayoutDashboard },
  { label: 'Clients',     icon: Users },
  { label: 'Projects',    icon: Disc3,  active: true },
  { label: 'Acquisition', icon: UserPlus },
  { label: 'Catalog',     icon: Library },
  { label: 'Settings',    icon: Cog },
  { label: 'Referrals',   icon: Gift },
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
const COMPONENTS_ACTIVE = 'Jackets';

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

const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL    = 'brandon@memphisrecordpressing.com';
const USER_INITIALS = 'BS';

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile',    icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security',        icon: ShieldCheck },
];

function UserMenu({ t }: { t: Theme }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 focus:outline-none transition-shadow', t.avatarRing)}
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
        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, color: t.ink }}
        data-testid="menu-user"
      >
        <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
          <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{USER_FIRST_NAME}</div>
          <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{USER_EMAIL}</div>
        </div>
        <div className="py-1.5">
          {USER_MENU.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.label} type="button"
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.hoverWash)}
                style={{ color: t.ink }}
              >
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="py-1.5" style={{ borderTop: `1px solid ${t.hairline}` }}>
          <button type="button"
            className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.hoverWash)}
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

function PressShell({ t, children }: { t: Theme; children: ReactNode }) {
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
          {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={MOCK_PRESS.logo} alt={MOCK_PRESS.name} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {MOCK_PRESS.name}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Button size="sm" variant="ghost" className={cn('rounded-full', t.hoverWash)}
            style={{ color: t.subink, paddingLeft: 12, paddingRight: 12 }}
            data-testid="button-feedback"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </Button>
          <button type="button"
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', t.hoverWash)}
            style={{ color: t.subink }} aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>
          <UserMenu t={t} />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-60 flex-shrink-0 flex flex-col"
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
export function ArtistChooseJacket() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [selectedJacketId, setSelectedJacketId] = useState<string | null>('single');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('standard');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');

  const jacketOptions = JACKET_CATALOG[selectedSizeId] ?? JACKET_CATALOG['12'];
  const jacketType = jacketOptions.find((j) => j.id === selectedJacketId) ?? null;
  const selectedVariant = jacketType?.variants.find((v) => v.id === selectedVariantId) ?? null;

  const selectJacket = (id: string) => {
    setSelectedJacketId(id);
    // construction resets when the style changes
    const opt = jacketOptions.find((j) => j.id === id);
    setSelectedVariantId(opt?.variants[0]?.id ?? 'standard');
  };

  const selectSize = (id: string) => {
    setSelectedSizeId(id);
    const opts = JACKET_CATALOG[id] ?? JACKET_CATALOG['12'];
    // keep the style if this size offers it; otherwise fall back to the first
    const next = opts.find((j) => j.id === selectedJacketId) ?? opts[0];
    setSelectedJacketId(next.id);
    setSelectedVariantId(
      next.variants.some((v) => v.id === selectedVariantId) ? selectedVariantId : next.variants[0].id,
    );
  };

  return (
    <PressShell t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>

        {/* Breadcrumb + heading */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Catalog
            </a>
            <span style={{ color: t.divider }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Vinyl
            </a>
            <span style={{ color: t.divider }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Components
            </a>
            <span style={{ color: t.divider }}>›</span>
            <span style={{ color: t.subink }}>Jackets</span>
          </div>
          <PageHeading lead="Choose your jacket." rest="How will it be packaged?" t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            It&rsquo;s the first thing a fan holds. Make it worth holding.
          </p>
        </div>

        {/* Split: sticky jacket stage · jacket picker */}
        <div
          style={{
            marginTop: 40,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 520px',
            gap: 56,
            alignItems: 'start',
          }}
        >
          {/* LEFT — sticky jacket preview */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <JacketStage jacketType={jacketType} widespine={selectedVariantId === 'widespine'} tipOn={selectedVariantId === 'tipon'} t={t} />
              {jacketType && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: t.ink }}>
                    {VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {jacketType.name}
                    {selectedVariant && selectedVariant.id !== 'standard' && (
                      <span style={{ color: t.faint }}> · {selectedVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: t.faint, maxWidth: 280 }}>
                    {jacketType.note}
                    {jacketType.gatefoldPanels > 0 && (
                      <span> Hover to preview the fold.</span>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — size picker, then jacket tiles */}
          <div className="min-w-0">
            <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
            <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
              The record size determines which jackets and inner sleeves fit.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {VINYL_SIZES.map((s) => {
                const active = s.id === selectedSizeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSize(s.id)}
                    aria-pressed={active}
                    data-testid={`size-${s.id}`}
                    className="rounded-2xl transition-all hover:-translate-y-px focus:outline-none"
                    style={{
                      flex: 1,
                      padding: '16px 12px',
                      backgroundColor: t.card,
                      border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
                      textAlign: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{s.label}</div>
                    <div className="text-[11px]" style={{ marginTop: 3, color: t.faint }}>{s.note}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 36 }}>
              <StepHeading lead="Pick a style." rest="How the jacket is built." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {jacketOptions.length} styles available from {MOCK_PRESS.name}.
              </p>
            </div>
            <div
              style={{
                marginTop: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {jacketOptions.map((j) => (
                <JacketTile
                  key={j.id}
                  jacket={j}
                  active={j.id === selectedJacketId}
                  variantId={j.id === selectedJacketId ? selectedVariantId : j.variants[0].id}
                  onSelect={() => selectJacket(j.id)}
                  onVariantSelect={setSelectedVariantId}
                  t={t}
                />
              ))}
            </div>
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

export default ArtistChooseJacket;
