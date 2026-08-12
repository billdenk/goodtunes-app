// ArtistChooseInserts — artist-facing "Choose Your Inserts" screen.
//
// LEFT  — large sticky insert preview. Updates as the artist selects.
// RIGHT — vinyl size picker (7" / 10" / 12"), then insert style tiles with
//         construction variants (mirrors the jacket / inner sleeve pattern).
//
// Insert styles: Insert Sheet · Booklet · Poster
//
// Apple canon: two-tone headings, frosted chrome, hairline borders, generous whitespace.
//
// ─── Handoff export ───────────────────────────────────────────────────
// Self-contained verbatim-replacement screen for the real GoodTunes app.
// Compiles alone: only react, lucide-react, and local image assets. Shell
// chrome, the full THEMES map (light + dark, light default), and a minimal
// self-contained Popover are all inlined here.

import { useState, useEffect, useRef, type ReactNode } from 'react';
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
// Per-press: every press sees their own name/logo here (e.g. Hellbender),
// never Memphis's. Referenced everywhere the press name/logo appears
// (header, intro copy, disc center labels).
const MOCK_PRESS = { name: 'Memphis Record Pressing', logo: mrpLogo };

// SVG logo is black — invert to white for dark/rainbow surfaces.
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';

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
        {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
        <img src={PRESS_LABEL_LOGO} alt="" aria-hidden style={{ width: logoSize, height: logoSize, objectFit: 'contain', filter: PRESS_LABEL_LOGO_FILTER, opacity: 0.92 }} />
      </div>
    </>
  );
}

// ─── Self-contained Popover ───────────────────────────────────────────
// Minimal click-outside dropdown, replacing the shared Radix popover so this
// screen compiles alone. Renders identically: trigger toggles an end-aligned
// panel; clicking outside closes it.
function Popover({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode }) {
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
    <div ref={ref} style={{ position: 'relative' }} data-popover-open={open}>
      {children}
    </div>
  );
}

function PopoverTrigger({ asChild: _asChild, children }: { asChild?: boolean; children: ReactNode }) {
  return <>{children}</>;
}

function PopoverContent({
  align = 'center',
  className,
  style,
  children,
}: {
  align?: 'start' | 'center' | 'end';
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const alignStyle: React.CSSProperties =
    align === 'end' ? { right: 0 } : align === 'start' ? { left: 0 } : { left: '50%', transform: 'translateX(-50%)' };
  return (
    <div
      className={className}
      style={{ position: 'absolute', top: 'calc(100% + 4px)', zIndex: 50, ...alignStyle, ...style }}
    >
      {children}
    </div>
  );
}

// ─── Themes — light = apple-canon (default, unchanged); dark = charcoal ──
// The whole page (shell chrome, stage panels, tiles) reads from THEMES[mode].
// Light stays the default so the ratified light rendering is pixel-identical:
// every light literal that used to live inline moves verbatim into `light`.
// Dark = charcoal admin canon (never navy).
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;       // the old '#a1a1a6' role — quiet captions / placeholders
  hairline: string;
  canvas: string;      // page background
  rail: string;        // sidebar background
  card: string;        // tile / picker surface
  soft: string;        // segmented-control track
  pillActive: string;  // raised active pill on the segmented track
  pillInactive: string; // inactive segmented-control label
  pillShadow: string;
  headerBg: string;    // sticky translucent header
  breadcrumbSep: string; // '›' separator color
  emptyBorder: string; // dashed empty-stage border color
  navActiveBg: string; // active rail row wash
  navHoverBg: string;  // rail row hover wash (inline, non-hover fallback)
  railHover: string;   // rail row hover wash class
  menuHover: string;   // popover menu row hover class
  popShadow: string;   // popover / menu shadow
  logoFilter?: string; // CSS invert for the dark-only wordmark asset
  avatarRing: string;  // logo/avatar carrier ring class
  searchPlaceholder: string; // input placeholder utility class
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
    pillActive: '#ffffff',
    pillInactive: '#8e8e93',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.82)',
    breadcrumbSep: '#d0d0d5',
    emptyBorder: '#d0d0d5',
    navActiveBg: '#f1f5f9',
    navHoverBg: '#f8fafc',
    railHover: 'hover:bg-slate-50',
    menuHover: 'hover:bg-slate-50',
    popShadow: '0 12px 40px rgba(0,0,0,0.16)',
    logoFilter: undefined,
    avatarRing: 'ring-slate-200',
    searchPlaceholder: 'placeholder:text-slate-400',
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
    pillActive: '#3a3a3e',
    pillInactive: '#98989d',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    breadcrumbSep: '#48484a',
    emptyBorder: 'rgba(255,255,255,0.22)',
    navActiveBg: 'rgba(255,255,255,0.08)',
    navHoverBg: 'rgba(255,255,255,0.05)',
    railHover: 'hover:bg-white/5',
    menuHover: 'hover:bg-white/5',
    popShadow: '0 12px 40px rgba(0,0,0,0.5)',
    logoFilter: 'invert(1) brightness(1.8)',
    avatarRing: 'ring-white/15',
    searchPlaceholder: 'placeholder:text-white/30',
  },
};

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Brand tokens ─────────────────────────────────────────────────────
// Kept for the vinyl/print visuals that are NOT themed (the RainbowPrintFace
// stage bodies render identically in both modes). Theme-driven surfaces use
// the `t` prop instead.
const HAIRLINE = '#e6e6ea';

// ─── Vinyl sizes ──────────────────────────────────────────────────────
// No 7" inserts — sleeves that small ship without printed extras.
const MOCK_VINYL_SIZES = [
  { id: '10', label: '10"', note: 'EP' },
  { id: '12', label: '12"', note: 'LP · Standard' },
];

// Stage scale per record size — 12" is the full-size baseline; smaller
// records shrink the preview proportionally (diameter ratio).
const SIZE_SCALE: Record<string, number> = { '7': 7 / 12, '10': 10 / 12, '12': 1 };

// ─── Inner insert styles + variants ───────────────────────────────────
// Three styles; each carries its own toggle: Printed → stock, others → color.
type InsertVariant = {
  id: string;
  label: string;
  note: string; // shown when the variant is selected; '' if self-evident
};

type InsertOption = {
  id: 'sheet' | 'gatefold' | 'booklet' | 'poster';
  name: string;
  note: string;
  variants: InsertVariant[];
  sizes?: string[]; // if set, only offered for these record sizes
};

const MOCK_INSERT_OPTIONS: InsertOption[] = [
  {
    id: 'sheet',
    name: 'Insert Sheet',
    note: 'Full-color flat sheet — lyrics, credits, liner notes. Printed both sides.',
    variants: [],
  },
  {
    id: 'gatefold',
    name: 'Gatefold Insert',
    note: 'Two-panel fold-out that opens from the center. Printed both sides.',
    variants: [],
  },
  {
    id: 'booklet',
    name: 'Booklet',
    note: 'Stapled multi-page booklet. Room for lyrics, art, and stories.',
    variants: [
      { id: 'p4', label: '4-Page', note: '' },
      { id: 'p8', label: '8-Page', note: '' },
    ],
  },
  {
    id: 'poster',
    name: 'Poster',
    note: 'Large fold-out poster that ships inside the jacket.',
    variants: [
      { id: 'small', label: '18" × 24"', note: 'Folds to fit the jacket.' },
      { id: 'large', label: '24" × 36"', note: 'Full wall poster — folds to fit.' },
    ],
    sizes: ['12'], // posters only ship with 12" LPs
  },
];

// Visual flags for a style + variant combination — what thumbnails and the
// stage actually render. All inserts are printed; the kind drives overlays.
type InsertLook = {
  kind: 'sheet' | 'gatefold' | 'booklet' | 'poster';
  posterSize: 'small' | 'large' | null;
};

function insertLook(style: InsertOption, variantId: string): InsertLook {
  return {
    kind: style.id,
    posterSize: style.id === 'poster' ? (variantId === 'large' ? 'large' : 'small') : null,
  };
}

// Poster aspect ratios (width : height) — 18"×24" and 24"×36".
const POSTER_RATIO: Record<'small' | 'large', number> = { small: 18 / 24, large: 24 / 36 };

// Stage size — same baseline as jacket stage for visual consistency
const SS = 321;

// ─── Insert thumbnail (64px tile preview) ────────────────────────────
// All inserts print full color; the kind drives overlays (pages, folds).
// Booklet opens like a book on hover (3D cover swing).
function InsertThumbnail({ insert, size = 48, hovered = false }: { insert: InsertLook; size: number; hovered?: boolean }) {
  const isBooklet = insert.kind === 'booklet';
  const isPoster  = insert.kind === 'poster';
  const posterW   = isPoster ? Math.round(size * POSTER_RATIO[insert.posterSize ?? 'small']) : size;

  // Gatefold — mini version: front cover lifts from its LEFT hinge, same as
  // the gatefold jacket. Interior reveals the rainbow artwork face.
  if (insert.kind === 'gatefold') {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, perspective: 300 }}>
        {/* Interior page — kraft paper, same as gatefold jacket interior */}
        <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', border: `1.5px solid #d0c4b0` }}>
          {Array.from({ length: 14 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: 'rgba(0,0,0,0.035)' }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 7, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Interior</span>
          </div>
        </div>
        {/* Front cover — left-edge hinge, lifts toward the viewer */}
        <div style={{
          position: 'absolute', inset: 0,
          overflow: 'hidden', transformOrigin: 'left center',
          transform: hovered ? 'rotateY(-75deg)' : 'rotateY(0deg)',
          transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
          border: '1.5px solid #333',
          background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
          boxShadow: hovered ? '6px 4px 12px rgba(0,0,0,0.25)' : 'none',
        }}>
          <RainbowPrintFace logoSize={size * 0.52} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />
        </div>
      </div>
    );
  }

  if (isBooklet) {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, perspective: 300 }}>
        {/* Inside page — revealed as the cover swings open */}
        <div style={{ position: 'absolute', inset: 0, background: '#ffffff', border: `1.5px solid ${HAIRLINE}`, overflow: 'hidden' }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: '18%', right: '14%', top: `${28 + i * 15}%`, height: 2, borderRadius: 1, background: '#dcdce0' }} />
          ))}
        </div>
        {/* Front cover — hinged on the left edge */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
          border: '1.5px solid #333',
          overflow: 'hidden',
          transformOrigin: 'left center',
          transform: hovered ? 'rotateY(-52deg)' : 'rotateY(0deg)',
          transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
          boxShadow: hovered ? '6px 4px 12px rgba(0,0,0,0.25)' : 'none',
        }}>
          <RainbowPrintFace logoSize={size * 0.52} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        position: 'relative',
        width: posterW, height: size,
        background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
        border: '1.5px solid #333',
        overflow: 'hidden',
        transition: 'width 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)',
      }}>
        <RainbowPrintFace logoSize={Math.min(posterW, size) * 0.52} />
        {/* Poster: fold creases — quiet. 18"×24" folds in half both ways;
            24"×36" folds in half across and in thirds down to hit 12"×12". */}
        {isPoster && insert.posterSize === 'small' && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
          </>
        )}
        {isPoster && insert.posterSize === 'large' && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
          </>
        )}
      </div>
    </div>
  );
}

// ─── InsertStage — large left-panel preview ───────────────────────────
// `sizeId` scales the whole preview: 12" is the baseline, smaller records
// shrink proportionally. The outer SS×SS wrapper keeps layout stable.
function InsertStage({ insert, sizeId, t }: { insert: InsertLook | null; sizeId: string; t: Theme }) {
  const [hovered, setHovered] = useState(false);
  const base = Math.round(SS * (SIZE_SCALE[sizeId] ?? 1));

  // Gatefold auto-opens on mount (same 600ms delay as the jacket), then stays
  // open while hovered. Hooks must run unconditionally before any return.
  const isGatefoldLike = insert?.kind === 'gatefold';
  useEffect(() => {
    if (!isGatefoldLike) {
      setHovered(false);
      return;
    }
    const id = setTimeout(() => setHovered(true), 600);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert?.kind]);

  if (!insert) {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: `1.5px dashed ${t.emptyBorder}`, borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: t.faint,
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <path d="M14 4 L14 32" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select an insert style</span>
      </div>
    );
  }

  const isBooklet  = insert.kind === 'booklet';
  const isPoster   = insert.kind === 'poster';
  const isGatefold = insert.kind === 'gatefold';

  // Poster: true aspect ratio — height stays at base, width follows the size toggle.
  const stageW = isPoster ? Math.round(base * POSTER_RATIO[insert.posterSize ?? 'small']) : base;

  if (isBooklet) {
    return <BookletStage stage={base} />;
  }

  // Gatefold — opens on hover. Posters render flat at true aspect ratio
  // that opens the same way, but auto-opens (see the effect above).
  // Gatefold — opens exactly like the gatefold jacket: the front cover lifts
  // from its LEFT hinge toward the viewer (rotateY −75°), revealing the
  // interior page behind it. Auto-opens on mount; hover keeps it open.
  if (isGatefold) {
    const tilt = hovered
      ? 'perspective(1200px) rotateY(0deg) rotateX(0deg)'
      : 'perspective(1200px) rotateY(-8deg) rotateX(2deg)';
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {/* Contact shadow — behind the sheet */}
        <div style={{
          position: 'absolute',
          bottom: -14, left: '50%',
          transform: 'translateX(-50%)',
          width: base * 0.88, height: 22,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Fixed SS×SS wrapper so the sticky column doesn't jump per size */}
        <div style={{ position: 'relative', zIndex: 1, width: SS, height: SS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            position: 'relative', width: base, height: base, flexShrink: 0,
            transform: tilt,
            transition: 'transform 600ms cubic-bezier(0.32, 0.72, 0.28, 1)',
            transformStyle: 'preserve-3d',
          }}>
            <div style={{ position: 'absolute', inset: 0, perspective: '1200px', perspectiveOrigin: '50% 50%', overflow: 'visible' }}>
              {/* Interior page — kraft paper, same as gatefold jacket interior */}
              <div style={{
                position: 'absolute',
                top: hovered ? 0 : 5, left: hovered ? 0 : -5,
                width: base, height: base,
                overflow: 'hidden', zIndex: 1,
                background: '#E8DBCA',
                border: `1px solid #d0c4b0`,
                transition: 'top 600ms cubic-bezier(0.32, 0.72, 0.28, 1), left 600ms cubic-bezier(0.32, 0.72, 0.28, 1)',
              }}>
                {Array.from({ length: 14 }, (_, i) => (
                  <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 6.5}%`, height: 1, background: 'rgba(0,0,0,0.035)' }} />
                ))}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(80,60,30,0.28)', letterSpacing: 2.5, textTransform: 'uppercase' }}>Interior</span>
                </div>
              </div>
              {/* Front cover — left-edge hinge, lifts toward the viewer */}
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: base, height: base,
                transformOrigin: 'left center',
                transform: hovered ? 'rotateY(-75deg)' : 'rotateY(0deg)',
                transition: 'transform 600ms cubic-bezier(0.32, 0.72, 0.28, 1)',
                willChange: 'transform',
                zIndex: 2, overflow: 'hidden',
                border: '1px solid #222',
                background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
              }}>
                <RainbowPrintFace logoSize={base * 0.42} />
              </div>
              {/* Fold crease — visible when open */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, width: 2,
                background: 'rgba(0,0,0,0.40)', zIndex: 3, pointerEvents: 'none',
                opacity: hovered ? 1 : 0, transition: 'opacity 300ms ease 150ms',
              }} />
              {hovered && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0) 60%)',
                  zIndex: 1, pointerEvents: 'none',
                }} />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Contact shadow — behind the body, tracks the visible width */}
      <div style={{
        position: 'absolute',
        bottom: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: stageW * 0.75, height: 20,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
        pointerEvents: 'none', zIndex: 0,
        transition: 'width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
      }} />

      {/* Fixed SS×SS wrapper so the sticky column doesn't jump when sizes change */}
      <div style={{ position: 'relative', zIndex: 1, width: SS, height: SS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Stage body */}
        <div style={{
          position: 'relative',
          width: stageW, height: base, flexShrink: 0,
          background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
          border: '1px solid #222',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          transition: 'width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1), height 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
        }}>
          <RainbowPrintFace logoSize={Math.min(stageW, base) * 0.42} />

          {/* Poster: fold creases — quiet. 18"×24" folds in half both ways
              (9"×12"); 24"×36" folds to 12"×12" (half across, thirds down). */}
          {isPoster && insert.posterSize === 'small' && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            </>
          )}
          {isPoster && insert.posterSize === 'large' && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 'calc(50% + 1px)', width: 2, background: 'linear-gradient(90deg, rgba(0,0,0,0.12), rgba(0,0,0,0))' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BookletStage — opens like a book on hover ───────────────────────
function BookletStage({ stage = SS }: { stage?: number }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
    >
      {/* Contact shadow — behind the booklet */}
      <div style={{
        position: 'absolute',
        bottom: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: stage * 0.75, height: 20,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
        pointerEvents: 'none', zIndex: 0,
      }} />
      {/* Fixed SS×SS wrapper so the sticky column doesn't jump per size */}
      <div style={{ position: 'relative', zIndex: 1, width: SS, height: SS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: stage, height: stage, position: 'relative', perspective: 1100 }}>
        {/* Inside page — revealed as the cover swings open */}
        <div style={{ position: 'absolute', inset: 0, background: '#ffffff', border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }}>
          {/* Mock lyric lines */}
          <div style={{ position: 'absolute', left: '16%', top: '14%', width: '38%', height: 8, borderRadius: 2, background: '#c9c9cf' }} />
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: '16%', right: `${14 + (i % 3) * 9}%`, top: `${28 + i * 7}%`, height: 4, borderRadius: 2, background: '#e3e3e8' }} />
          ))}
          {/* Center-fold shading + staples */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 22, background: 'linear-gradient(90deg, rgba(0,0,0,0.14), rgba(0,0,0,0))' }} />
          <div style={{ position: 'absolute', left: 8, top: '30%', width: 2.5, height: 16, background: '#9a9aa0', borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: 8, bottom: '30%', width: 2.5, height: 16, background: '#9a9aa0', borderRadius: 1 }} />
        </div>
        {/* Front cover — hinged on the left edge */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
          border: '1px solid #222',
          overflow: 'hidden',
          transformOrigin: 'left center',
          transform: hovered ? 'rotateY(-58deg)' : 'rotateY(0deg)',
          transition: 'transform 0.6s cubic-bezier(0.32, 0.72, 0.28, 1)',
          boxShadow: hovered ? '18px 10px 36px rgba(0,0,0,0.35)' : '0 8px 32px rgba(0,0,0,0.35)',
        }}>
          <RainbowPrintFace logoSize={stage * 0.42} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, background: 'linear-gradient(90deg, rgba(0,0,0,0.5), rgba(0,0,0,0))' }} />
        </div>
      </div>
      </div>

    </div>
  );
}

// ─── Insert tile ──────────────────────────────────────────────────────
// div[role=button] — the variant pills inside are real <button>s, and
// nesting buttons is invalid HTML (hydration error).
function InsertTile({
  insert,
  active,
  variantId,
  onSelect,
  onVariantSelect,
  t,
}: {
  insert: InsertOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
  t: Theme;
}) {
  const selectedVariant = insert.variants.find((v) => v.id === variantId);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`insert-${insert.id}`}
      className="rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, background: t.card, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}` }}
    >
      <InsertThumbnail insert={insertLook(insert, variantId)} size={64} hovered={hovered} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {insert.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: t.faint, lineHeight: 1.4 }}>
          {insert.note}
        </div>
        {/* Variant toggle — revealed inside the selected style */}
        {active && insert.variants.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: t.soft, border: `1px solid ${t.hairline}` }}>
              {insert.variants.map((v) => {
                const vActive = v.id === variantId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVariantSelect(v.id)}
                    aria-pressed={vActive}
                    data-testid={`insert-variant-${insert.id}-${v.id}`}
                    className="transition-all focus:outline-none"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: vActive ? t.ink : t.pillInactive,
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
      className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', !active && t.railHover)}
      style={{ color: active ? t.ink : t.subink, backgroundColor: active ? t.navActiveBg : undefined }}
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
const COMPONENTS_ACTIVE = 'Inserts';

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
        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', !item.active && t.railHover)}
        style={{ color: item.active ? t.ink : t.subink, backgroundColor: item.active ? t.navActiveBg : undefined }}
      >
        <CatalogIcon className="w-4 h-4 flex-shrink-0" />
        <span className="text-[13px] font-medium flex-1 text-left">{item.label}</span>
        <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ transform: catalogOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      <button
        type="button"
        aria-expanded={componentsOpen}
        onClick={() => setComponentsOpen((v) => !v)}
        className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', t.railHover)}
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
                className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors', !active && t.railHover)}
                style={{ color: active ? t.ink : t.subink, fontWeight: active ? 600 : 500, backgroundColor: active ? t.navActiveBg : undefined }}
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

function PressShell({ children, t }: { children: ReactNode; t: Theme }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: t.canvas, color: t.ink, fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif' }}>
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4" style={{ height: 52, background: t.headerBg, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: `1px solid ${t.hairline}` }}>
        <div className="flex items-center gap-2.5">
          {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
          <img src={MOCK_PRESS.logo} alt={MOCK_PRESS.name} className="h-6 w-auto" style={{ filter: t.logoFilter }} />
          <span className="text-[13px] font-semibold" style={{ color: t.ink }}>{MOCK_PRESS.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors', t.railHover)} style={{ color: t.subink, border: `1px solid ${t.hairline}` }}>
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Feedback
          </button>
          <button type="button" className={cn('rounded-full p-1.5 transition-colors', t.railHover)} aria-label="Notifications">
            <Bell className="w-4 h-4" style={{ color: t.subink }} />
          </button>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button type="button" onClick={() => setMenuOpen((v) => !v)} className={cn('w-8 h-8 rounded-full overflow-hidden ring-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow', t.avatarRing)}>
                <img src={brandonPhoto} alt={USER_FIRST_NAME} className="w-full h-full object-cover" />
              </button>
            </PopoverTrigger>
            {menuOpen && (
              <PopoverContent align="end" className="p-0 w-52 rounded-2xl" style={{ border: `1px solid ${t.hairline}`, background: t.card, boxShadow: t.popShadow }}>
                <div className="px-3.5 py-3" style={{ borderBottom: `1px solid ${t.hairline}` }}>
                  <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>{USER_FIRST_NAME}</div>
                  <div className="text-[11.5px] truncate" style={{ color: t.subink }}>{USER_EMAIL}</div>
                </div>
                <div className="py-1.5">
                  {USER_MENU.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button key={m.label} type="button" className={cn('w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] transition-colors', t.menuHover)} style={{ color: t.ink }}>
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            )}
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
export function ArtistChooseInserts() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [selectedInsertId, setSelectedInsertId] = useState<string | null>('sheet');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');

  // Styles offered for the current record size (no posters below 12").
  const visibleOptions = MOCK_INSERT_OPTIONS.filter((o) => !o.sizes || o.sizes.includes(selectedSizeId));

  const insertType = visibleOptions.find((s) => s.id === selectedInsertId) ?? null;
  const selectedVariant = insertType?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const look = insertType ? insertLook(insertType, selectedVariantId) : null;

  const selectInsert = (id: string) => {
    setSelectedInsertId(id);
    const opt = MOCK_INSERT_OPTIONS.find((s) => s.id === id);
    setSelectedVariantId(opt?.variants[0]?.id ?? '');
  };

  const selectSize = (id: string) => {
    setSelectedSizeId(id);
    // If the current style isn't offered for this size, fall back to the sheet.
    const current = MOCK_INSERT_OPTIONS.find((s) => s.id === selectedInsertId);
    if (current?.sizes && !current.sizes.includes(id)) selectInsert('sheet');
  };

  return (
    <PressShell t={t}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>

        {/* Breadcrumb + heading */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">Catalog</a>
            <span style={{ color: t.breadcrumbSep }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">Vinyl</a>
            <span style={{ color: t.breadcrumbSep }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">Components</a>
            <span style={{ color: t.breadcrumbSep }}>›</span>
            <span style={{ color: t.subink }}>Inserts</span>
          </div>
          <PageHeading lead="Choose your inserts." rest="What ships inside?" t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Lyrics, credits, art — the extras fans find when they open the jacket.
          </p>
        </div>

        {/* Split: sticky insert stage · pickers */}
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 520px', gap: 56, alignItems: 'start' }}>

          {/* LEFT — sticky insert preview */}
          <div className="sticky" style={{ top: 88 }}>
            <div className="flex flex-col items-center">
              <InsertStage insert={look} sizeId={selectedSizeId} t={t} />
              {insertType && (
                <>
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: t.ink }}>
                    {MOCK_VINYL_SIZES.find((s) => s.id === selectedSizeId)?.label} {insertType.name}
                    {selectedVariant && (
                      <span style={{ color: t.faint }}> · {selectedVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: t.faint, maxWidth: 280 }}>
                    {insertType.note}
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
              The record size determines which inserts fit the jacket.
            </p>
            <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
              {MOCK_VINYL_SIZES.map((s) => {
                const active = s.id === selectedSizeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSize(s.id)}
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
              <StepHeading lead="Pick a style." rest="What the artwork ships on." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {/* Per-press: every press sees their own name/logo here (e.g. Hellbender), never Memphis's. */}
                {visibleOptions.length} insert styles available from {MOCK_PRESS.name}.
              </p>
            </div>
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleOptions.map((s) => (
                <InsertTile
                  key={s.id}
                  insert={s}
                  active={s.id === selectedInsertId}
                  variantId={s.id === selectedInsertId ? selectedVariantId : (s.variants[0]?.id ?? '')}
                  onSelect={() => selectInsert(s.id)}
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
        className="fixed bottom-4 right-4 z-30 h-9 px-3.5 rounded-full inline-flex items-center gap-2 text-[12.5px] font-medium shadow-lg"
        style={{ backgroundColor: t.card, color: t.ink, border: `1px solid ${t.hairline}` }}
        data-testid="button-theme-toggle"
      >
        {mode === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
        {mode === 'light' ? 'View dark' : 'View light'}
      </button>
    </PressShell>
  );
}

export default ArtistChooseInserts;
