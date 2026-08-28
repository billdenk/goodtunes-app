// PressVinylPhotoshopMockup — a PRESS-facing "Add your vinyl" tool where a record
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

import { useMemo, useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react';
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
  RotateCcw,
  ChevronRight,
  Layers,
  Eye,
  EyeOff,
  Archive,
  Palette,
  Pencil,
  Star,
  Copy,
  Image as ImageIcon,
  Pipette,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate, Moon, Sun, ClipboardList as NavEstimatesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { createContext, useContext } from 'react';
import { useAdminDark } from '@/lib/adminAppearance';
import { displayPressColorName } from '@/lib/pressColorName';
import { postAdminImage } from '@/lib/adminUpload';
import { resolvePressMarkLogo, type PressComponentsPayload } from './usePressComponents';
import { WhiteMarkGlyph } from './PressMarkGlyph';
import { canApplyPhotoSuggestion } from './photoSuggestionGuard';
import type { VinylComponentConfig, OfferOption } from '@shared/pressComponents';

// ── Per-press label branding (data) ──────────────────────────────────
// Each press supplies a center-label mark (assumed to read white via the
// WhiteMarkGlyph mask) against a black label. When missing, render nothing —
// never another press's mark. Threaded via context so the verbatim handoff
// render tree doesn't need brand props at every DiscLabelArt call site.
const PRESS_LABEL_BG = '#0a0a0a';
const LabelBrandCtx = createContext<{ logoUrl: string | null; bgColor: string | null }>({
  logoUrl: null,
  bgColor: null,
});

function useLabelBg(): string {
  const { bgColor } = useContext(LabelBrandCtx);
  return bgColor || PRESS_LABEL_BG;
}
async function uploadPreviewImageFile(file: File): Promise<string | null> {
  try {
    const { url } = await postAdminImage(file, { mask: 'disc', noun: 'swatch' });
    return url;
  } catch {
    return null;
  }
}

// ─── Theme tokens — light (default) + dark (charcoal admin canon) ────
// The whole page (shell chrome, cards, popovers) reads from THEMES[mode].
// Light stays the default and every light literal is moved here verbatim so
// the light rendering is pixel-identical to before. Dark = charcoal admin
// canon (never navy). The vinyl disc render, album art, splatter masks, and
// product imagery are NOT themed — they look the same in both modes.
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string; // was the raw t.faint quiet gray
  hairline: string;
  canvas: string;
  rail: string;
  card: string; // opaque surface (was #fff / #ffffff)
  soft: string; // muted fill (Request chip); light = rgba(0,0,0,0.06)
  searchBg: string; // rail search field bg
  critical: string;
  pillShadow: string;
  headerBg: string; // sticky translucent header
  // frosted popover / dialog surfaces
  frostedBg: string;
  frostedStrongBg: string; // catalog search (slightly more opaque)
  popShadow: string; // 0 20px 48px…
  popShadowLg: string; // 0 24px 56px…
  // washes + accents
  selectWash: string; // active-item tint (#f0f7fc light)
  critWash: string; // destructive hover wash (#fdeef2 light)
  crumbDivider: string; // breadcrumb › color (#d0d0d5 light)
  dashedBorder: string; // dashed add-cell border (#d0d0d5 light)
  notOffered: string; // "Not offered in <size>" warning ink
  frostedBtnBg: string; // frosted circular ··· button bg
  frostedBtnStrongBg: string;
  // utility classes
  hoverWash: string; // rail / list hover
  hoverWashSoft: string; // slate-50 equivalents
  hoverWashRail: string; // slate-200 equivalents
  avatarRing: string;
  searchPlaceholder: string;
  focusFieldBorder: string; // focus:border-* utility
  // dark-only wordmark invert
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
    soft: 'rgba(0,0,0,0.06)',
    searchBg: '#ffffff',
    critical: '#e0245e',
    pillShadow: '0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
    headerBg: 'rgba(255,255,255,0.72)',
    frostedBg: 'rgba(255,255,255,0.82)',
    frostedStrongBg: 'rgba(255,255,255,0.85)',
    popShadow: '0 20px 48px rgba(0,0,0,0.16)',
    popShadowLg: '0 24px 56px rgba(0,0,0,0.18)',
    selectWash: '#f0f7fc',
    critWash: '#fdeef2',
    crumbDivider: '#d0d0d5',
    dashedBorder: '#d0d0d5',
    notOffered: '#c2410c',
    frostedBtnBg: 'rgba(255,255,255,0.9)',
    frostedBtnStrongBg: 'rgba(255,255,255,0.88)',
    hoverWash: '${t.hoverWash}',
    hoverWashSoft: '${t.hoverWashSoft}',
    hoverWashRail: '${t.hoverWashRail}',
    avatarRing: 'ring-slate-200',
    searchPlaceholder: 'placeholder:text-slate-400',
    focusFieldBorder: 'focus:border-slate-400',
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
    searchBg: '#26262a',
    critical: '#ff5d8f',
    pillShadow: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06)',
    headerBg: 'rgba(22,22,23,0.72)',
    frostedBg: 'rgba(30,30,32,0.82)',
    frostedStrongBg: 'rgba(30,30,32,0.86)',
    popShadow: '0 20px 48px rgba(0,0,0,0.5)',
    popShadowLg: '0 24px 56px rgba(0,0,0,0.55)',
    selectWash: 'rgba(49,158,216,0.16)',
    critWash: 'rgba(255,93,143,0.14)',
    crumbDivider: '#48484a',
    dashedBorder: 'rgba(255,255,255,0.22)',
    notOffered: '#e8b34b',
    frostedBtnBg: 'rgba(38,38,42,0.9)',
    frostedBtnStrongBg: 'rgba(38,38,42,0.88)',
    hoverWash: 'hover:bg-white/5',
    hoverWashSoft: 'hover:bg-white/5',
    hoverWashRail: 'hover:bg-white/5',
    avatarRing: 'ring-white/15',
    searchPlaceholder: 'placeholder:text-white/30',
    focusFieldBorder: 'focus:border-white/30',
    logoFilter: 'invert(1) brightness(1.8)',
  },
};

// Spindle-hole fill for the vinyl disc — the hole shows the light stage the
// disc rests on and is part of the (unthemed) disc render, so it stays fixed.
const DISC_HOLE_FILL = '#f5f5f7';

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ─── Vinyl layer kit (from SplatterVinylPreview) ─────────────────────
const LAYERS = {
  opaque: '/vinyl-layers/opaque-vinyl.png',
  translucent: '/vinyl-layers/translucent-vinyl.png',
  splatter1: '/vinyl-layers/splatter-one.png',
  splatter2: '/vinyl-layers/splatter-two.png',
  splatter3: '/vinyl-layers/splatter-three.png',
  highlights: '/vinyl-layers/vinyl-highlights.png',
  inner: '/vinyl-layers/inner-circle.png',
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
  /** Optional press-supplied reference image (mock only). When set, it
      replaces the rendered vinyl disc on the tile/thumbnail. */
  customImg?: string;
  /** Splatter-only: whether the base body is translucent (light passes
      through) rather than opaque. Drives which base mask VinylDisc uses. */
  splatterTranslucent?: boolean;
  /** Generator-made color: style + assigned hexes. Presence means the disc
      renders through GenDisc (the stencil art), and the swatch stays
      re-openable in the generator for hex tweaks. */
  gen?: { styleId: string; colors: string[]; option?: string; splatterCount?: number; baseKind?: 'opaque' | 'translucent'; locations?: number[] };
  /** Hidden = not offered to artists right now. Never deleted — pressed
      records keep their history. (Bill, Aug 20 2026.) */
  hidden?: boolean;
};

// Splatter composer presets — copied verbatim from SplatterVinylPreview.tsx
// (the canon device). Offered when defining a splatter-style color.
const SPLATTER_PRESETS: Array<{ label: string; vinylType: 'opaque' | 'translucent'; base: string; s1: string; s2: string; s3: string }> = [
  { label: 'Classic splatter', vinylType: 'opaque', base: '#C81E38', s1: '#F5F5DC', s2: '#1A1A2E', s3: '#E8C84A' },
  { label: 'Blue flame', vinylType: 'opaque', base: '#1B3A6B', s1: '#FF6B35', s2: '#FFD700', s3: '#E0E0E0' },
  { label: 'Forest mist', vinylType: 'opaque', base: '#2D4A3E', s1: '#A8C5A0', s2: '#F5E6D3', s3: '#7BA3A1' },
  { label: 'Candy stripe', vinylType: 'translucent', base: '#FF69B4', s1: '#00BFFF', s2: '#FFFFFF', s3: '#FF69B4' },
  { label: 'Midnight gold', vinylType: 'opaque', base: '#0A0A0A', s1: '#C89A3C', s2: '#8A6B1F', s3: '#F5F0E0' },
  { label: 'Smoke & amber', vinylType: 'translucent', base: '#C17A3A', s1: '#E8D5A3', s2: '#4A4A4A', s3: '#8B4513' },
];

// Center-label artwork — the press's ACTUAL logo mark, sized generously so it
// dominates the label as in MRP's real pressings. It's printed on the label,
// so it rotates with the record body — the off-centre skyline/arcs make the
// spin read on every color. The black asset is inverted to white for the
// black label. Fixed shine layer (elsewhere) never rotates.
function DiscLabelArt({ size }: { size: number }) {
  const { logoUrl: brandLogoUrl } = useContext(LabelBrandCtx);
  // `size` is the label diameter. The full logo (SVG) stays crisp at any size
  // and reads as a tiny brand dot on the small thumbnails. Decorative RPM /
  // catalog arc text was removed (Task #3445) — the label is logo-only.
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      {brandLogoUrl && (
        // Black label face — the mark renders WHITE via mask regardless of
        // the uploaded logo's color (shared WhiteMarkGlyph chain).
        <WhiteMarkGlyph
          logoUrl={brandLogoUrl}
          size={size * 0.9}
          opacity={1}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            // Nudge the logo UP so its notch (the arc center at the skyline
            // base, y=143.3 of the 272.4 viewBox ≈ 52.6%) lands exactly on
            // the spindle hole at the label center — hole sits in the dip,
            // not the buildings. Label itself stays put. (handoff 3dd5929)
            transform: `translate(-50%, calc(-50% - ${size * 0.9 * (143.3 / 272.4 - 0.5)}px))`,
          }}
        />
      )}
    </div>
  );
}

function VinylDisc({
  size,
  swatch,
  bodyRef,
  labelRatio,
  holeRatio = 0.018,
}: {
  size: number;
  swatch: Swatch;
  bodyRef?: React.Ref<HTMLDivElement>;
  /** Center label diameter as a fraction of the disc (7" uses a smaller 3.3" label). */
  labelRatio?: number;
  /** Spindle hole diameter as a fraction of the disc. */
  holeRatio?: number;
}) {
  const LABEL_RATIO = labelRatio ?? PSD_LABEL_RATIO;
  const INNER_RATIO = 129 / 1104;
  const labelBg = useLabelBg();
  // Real configs can carry a style with zero colors (the mock never did) —
  // render nothing rather than crash the whole tab.
  if (!swatch) return null;
  // A generator-made color renders through the stencil art everywhere the
  // disc device appears — stage, tiles, search rows — same frame, same label.
  if (swatch.gen) {
    return (
      <GenDisc
        size={size}
        gen={swatch.gen}
        labelRatio={LABEL_RATIO}
        holeRatio={holeRatio}
        bodyRef={bodyRef}
      />
    );
  }
  const isSplatter = swatch.kind === 'splatter';
  // Translucent body: always for the translucent type, and for a splatter
  // color whose composer base is set to translucent.
  const translucent = swatch.kind === 'translucent' || (isSplatter && !!swatch.splatterTranslucent);
  const spin = !!bodyRef;

  // A press-supplied reference image replaces the rendered disc, but still
  // reads as a round record: clipped to the circle, with the same fixed sheen
  // + spindle hole treatment on top so it sits in the same device family.
  if (swatch.customImg) {
    return (
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
          backgroundColor: '#000000',
        }}
      >
        <div
          ref={bodyRef}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: spin ? 'transform' : undefined }}
        >
          <img
            src={swatch.customImg}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* Branded center label composited over the reference photo — the
              photo replaces the vinyl BODY, but the press's printed label
              (bg color + white logo mark) still sits on top, exactly like the
              portal colors page overlays its label on photo swatches. Same
              size threshold as the rendered discs: logo art only ≥70px so
              tiny popover/editor thumbnails don't get a noise dot. */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: size * LABEL_RATIO,
              height: size * LABEL_RATIO,
              borderRadius: '50%',
              backgroundColor: labelBg,
              overflow: 'hidden',
            }}
          >
            {size >= 70 && <DiscLabelArt size={size * LABEL_RATIO} />}
          </div>
        </div>
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
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * holeRatio,
            height: size * holeRatio,
            borderRadius: '50%',
            backgroundColor: DISC_HOLE_FILL,
            boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  }

  return (
    <div
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
        ref={bodyRef}
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
            reads even on a uniform color. ~2% opacity, rotates with the disc. */}
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
            regardless of vinyl color (label bg + logo are per-press inputs). */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * LABEL_RATIO,
            height: size * LABEL_RATIO,
            borderRadius: '50%',
            backgroundColor: labelBg,
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
          stage behind it: fill it with the page/stage canvas color, not white.
          A subtle inset shadow ring reads as a cut edge rather than a printed dot. */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * holeRatio,
          height: size * holeRatio,
          borderRadius: '50%',
          backgroundColor: DISC_HOLE_FILL,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ─── JS-driven hover-spin physics (self-contained; duplicated per file) ──
// Hover → the body spins at 360°/8s via rAF. Pointer leaves → freeze at the
// current angle (like stopping a record by hand). If left off-upright, a quiet
// rewind affordance appears; clicking it eases the disc back to 0° along the
// shortest accumulated path. Honors prefers-reduced-motion (no spin/rewind).
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const SPIN_DPS = 360 / 8000; // degrees per millisecond (one rev / 8s)
const REWIND_MS = 700;
const REWIND_EASE = (t: number) => 1 - Math.pow(1 - t, 3); // ease-out cubic

function useVinylSpin() {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const [showRewind, setShowRewind] = useState(false);

  const apply = useCallback(() => {
    if (bodyRef.current) {
      bodyRef.current.style.transform = `rotate(${angleRef.current}deg)`;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTsRef.current = null;
  }, []);

  const spinLoop = useCallback((ts: number) => {
    if (lastTsRef.current !== null) {
      angleRef.current += (ts - lastTsRef.current) * SPIN_DPS;
      apply();
    }
    lastTsRef.current = ts;
    rafRef.current = requestAnimationFrame(spinLoop);
  }, [apply]);

  const onPointerEnter = useCallback(() => {
    if (reduced) return;
    setShowRewind(false);
    stopRaf();
    rafRef.current = requestAnimationFrame(spinLoop);
  }, [reduced, spinLoop, stopRaf]);

  const onPointerLeave = useCallback(() => {
    if (reduced) return;
    stopRaf();
    const settled = ((angleRef.current % 360) + 360) % 360;
    if (settled > 0.5) setShowRewind(true);
  }, [reduced, stopRaf]);

  const rewind = useCallback(() => {
    if (reduced) return;
    stopRaf();
    setShowRewind(false);
    const start = angleRef.current;
    const target = start - (((start % 360) + 360) % 360); // nearest upright below
    const delta = target - start;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / REWIND_MS);
      angleRef.current = start + delta * REWIND_EASE(p);
      apply();
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        angleRef.current = target;
        apply();
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [reduced, apply, stopRaf]);

  useEffect(() => () => stopRaf(), [stopRaf]);

  return { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind, reduced };
}

// ─── Quiet Apple-canon rewind affordance ─────────────────────────────
function RewindButton({ show, onClick, size = 28, t }: { show: boolean; onClick: () => void; size?: number; t: Theme }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label="Rewind record to start"
      data-testid="button-rewind"
      className="rounded-full flex items-center justify-center transition-all"
      style={{
        width: size,
        height: size,
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        transform: show ? 'scale(1)' : 'scale(0.9)',
        background: t.frostedBtnBg,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${t.hairline}`,
        boxShadow: t.pillShadow,
        color: t.subink,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = t.ink; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = t.subink; }}
    >
      <RotateCcw style={{ width: size * 0.5, height: size * 0.5 }} />
    </button>
  );
}

// Real record proportions — 340px stage disc = 12". The 7" single uses the
// smaller 3.3" label; 10"/12" share the standard 3.94" label. Hole = 0.3" spindle.
const STAGE_PX_PER_INCH = 340 / 12;
const SIZE_SPECS: Record<SizeId, { inches: number; labelInches: number }> = {
  '7"': { inches: 7, labelInches: 3.3 },
  '10"': { inches: 10, labelInches: 3.94 },
  '12"': { inches: 12, labelInches: 3.94 },
};

// Large stage disc with a Keynote-style contact shadow. The disc renders at
// true relative scale for the size picked in the page's "Pick a size" step.
function DiscStage({ swatch, sizeId = '12"', t }: { swatch: Swatch; sizeId?: SizeId; t: Theme }) {
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  const spec = SIZE_SPECS[sizeId] ?? SIZE_SPECS['12"'];
  const discPx = Math.round(spec.inches * STAGE_PX_PER_INCH);
  const labelRatio = spec.labelInches / spec.inches;
  const holeRatio = 0.3 / spec.inches;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Fixed-height stage so switching sizes never shifts the layout;
          the disc rests on the stage floor with its shadow. */}
      <div style={{ position: 'relative', height: 340, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', display: 'inline-block', transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
            <VinylDisc size={discPx} swatch={swatch} bodyRef={bodyRef} labelRatio={labelRatio} holeRatio={holeRatio} />
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: -16,
              left: '50%',
              transform: 'translateX(-50%)',
              width: Math.round(discPx * 0.43),
              height: 12,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.32)',
              filter: 'blur(7px)',
              pointerEvents: 'none',
            }}
          />
          {/* Rewind affordance — bottom-right of the disc */}
          <div style={{ position: 'absolute', bottom: 6, right: -6, zIndex: 5 }}>
            <RewindButton show={showRewind} onClick={rewind} size={28} t={t} />
          </div>
        </div>
      </div>
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
  /** Which record sizes this TYPE is offered in at all — gates the whole
      category (e.g. Splatter may not press for 7"), independent of colors. */
  sizes: SizeId[];
  /** Set when the type was created through the generator ("Create type").
      Locks every color added to this type to one stencil style. */
  genStyleId?: string;
  /** Press-supplied photo shown on the style tile (type editor upload). */
  customImg?: string;
  /** Finish styles only: which finishes this type offers artists.
      Undefined = all of the style's finishes. One shared truth — the main
      page's Finish bar and the sheet edit the same list. (Bill, Aug 20 2026.) */
  offeredFinishes?: string[];
  /** Hidden from the artist-facing picker — stays here for the press. */
  hidden?: boolean;
};

const mk = (id: string, name: string, kind: SwatchKind, base: string, extra?: Partial<Swatch>): Swatch => ({
  id,
  name,
  kind,
  base,
  sizes: ['12"'],
  ...extra,
});

// Default state for a brand-new press: exactly ONE type, "Black", containing
// exactly ONE color, "Black" (vinyl color #0C0C0C). The press grows its
// catalog from here — adding types ("+ More types") and colors ("Add color").
const INITIAL_CATEGORIES: Category[] = [
  {
    id: 'black',
    name: 'Black',
    kind: 'black',
    sizes: ['7"', '10"', '12"'],
    // Seeded as a generator style so Black gets the same editor as every
    // other style — no legacy popover, no gallery on open. (Bill, Aug 20 2026.)
    genStyleId: 'black',
    swatches: [
      mk('BK1', 'Black', 'black', '#0C0C0C', {
        sizes: ['7"', '10"', '12"'],
        gen: { styleId: 'black', colors: ['#0C0C0C'] },
      }),
    ],
  },
  // A migrated photo color — presses like MRP arrive with actual photos of
  // their pressed records. No gen data, so its menu offers "Edit color" →
  // the rebuild sheet, where the photo slides out for side-by-side matching.
  {
    id: 'ruby-red',
    name: 'Ruby Red',
    kind: 'opaque',
    sizes: ['7"', '10"', '12"'],
    swatches: [
      mk('UP1', 'Ruby Red', 'opaque', '#B01E2E', {
        sizes: ['7"', '10"', '12"'],
      }),
    ],
  },
];

// Representative preview swatch for each category card's mini disc.
function categoryPreview(cat: Category): Swatch {
  // Real configs can hold a style with no colors yet — fall back to a plain
  // black swatch so preview devices always have something to render.
  return (
    cat.swatches[0] ?? { id: `${cat.id}-empty`, name: cat.name, kind: 'black', base: '#0C0C0C', sizes: cat.sizes }
  );
}

// ─── Press identity (data) — the portal payload supplies the real press
// name; this module default is shadowed inside the page component. ────
const PARTNER_NAME = 'Memphis Record Pressing';

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

// ─── Type editor popover — rename a type, set which sizes it presses ─
function TypeEditorPopover({
  category,
  open,
  onOpenChange,
  trigger,
  onSave,
  onRemove,
  onEditColor,
  onDuplicate,
  onToggleHidden,
  t,
}: {
  category: Category;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  onSave: (name: string, sizes: SizeId[], customImg?: string) => void;
  onRemove?: () => void;
  /** Generator-made types: reopen the stencil sheet on the type's color. */
  onEditColor?: () => void;
  /** Copy the style with every color — tweak the copy, keep the original.
      (Bill, Aug 20 2026.) */
  onDuplicate?: () => void;
  onToggleHidden?: () => void;
  t: Theme;
}) {
  const [name, setName] = useState(category.name);
  const [sizes, setSizes] = useState<SizeId[]>(category.sizes);
  // Press-supplied preview image for the type card — persisted on the
  // category (real upload via uploadPreviewImageFile).
  const [customImg, setCustomImg] = useState<string | undefined>(category.customImg);

  const canSave = name.trim().length > 0 && sizes.length > 0;

  const toggleSize = (s: SizeId) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const seed = () => {
    setName(category.name);
    setSizes(category.sizes);
    setCustomImg(category.customImg);
  };

  const submit = () => {
    if (!canSave) return;
    onSave(name.trim(), sizes, customImg);
    onOpenChange(false);
  };

  // Generator styles get a two-row menu — Edit and Archive, nothing more.
  // Edit opens the style creator on the default color; renaming, sizes, and
  // colors all live there now. (Bill, Aug 20 2026.)
  if (onEditColor) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end" side="bottom" sideOffset={10} avoidCollisions collisionPadding={16}
          className="w-44 p-0 rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${t.hairline}`, backgroundColor: t.frostedBg,
            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: t.popShadow,
          }}
          data-testid={`popover-edit-type-${category.id}`}
        >
          <div style={{ padding: '6px 0' }}>
            <button
              type="button"
              onClick={() => { onOpenChange(false); onEditColor(); }}
              className="flex w-full items-center gap-2.5 text-left text-[13px] font-medium transition-colors hover:bg-black/[0.04] focus:outline-none"
              style={{ padding: '9px 14px', color: t.ink, background: 'transparent', border: 'none', cursor: 'pointer' }}
              data-testid={`button-type-edit-color-${category.id}`}
            >
              <Pencil className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
              Edit
            </button>
            {onDuplicate && (
              <button
                type="button"
                onClick={() => { onOpenChange(false); onDuplicate(); }}
                className="flex w-full items-center gap-2.5 text-left text-[13px] font-medium transition-colors hover:bg-black/[0.04] focus:outline-none"
                style={{ padding: '9px 14px', color: t.ink, background: 'transparent', border: 'none', cursor: 'pointer' }}
                data-testid={`button-type-duplicate-${category.id}`}
              >
                <Copy className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                Duplicate
              </button>
            )}
            {onRemove && (
              <div style={{ borderTop: `1px solid ${t.hairline}`, marginTop: 4, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { onOpenChange(false); onRemove(); }}
                  className="flex w-full items-center gap-2.5 text-left text-[13px] font-medium transition-colors focus:outline-none"
                  style={{ padding: '9px 14px', color: t.critical, background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.critWash)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  data-testid={`button-archive-type-${category.id}`}
                >
                  <Archive className="w-4 h-4 flex-shrink-0" />
                  Archive
                </button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

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
        // A form, not a menu — outside clicks (including the feedback
        // Comment tool) must not dismiss it. Cancel / Save / Esc close it.
        onInteractOutside={(e) => e.preventDefault()}
        className="w-80 p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${t.hairline}`,
          backgroundColor: t.frostedBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: t.popShadow,
          // Never taller than the viewport — the form scrolls, the footer
          // and the two action rows stay pinned above the fold.
          maxHeight: 'min(640px, calc(100vh - 32px))',
        }}
        data-testid={`popover-edit-type-${category.id}`}
      >
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>
            Edit style. <span style={{ color: t.faint, fontWeight: 600 }}>{category.name}.</span>
          </div>
          <p className="text-[12.5px]" style={{ color: t.subink, marginTop: 2, lineHeight: 1.4 }}>
            Sizes here gate the whole type — every color in it.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* preview image — round disc thumb + Change image… / Remove */}
            <PreviewImageRow
              disc={<VinylDisc size={44} swatch={{ ...categoryPreview(category), customImg }} />}
              img={customImg}
              onPick={async (file) => {
                const url = await uploadPreviewImageFile(file);
                if (url) setCustomImg(url);
              }}
              onRemove={() => setCustomImg(undefined)}
              testId="type-preview-img"
              t={t}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                Type name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
                data-testid={`input-edit-type-name-${category.id}`}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                Pressed in these sizes
              </label>
              <div className="flex items-center gap-2">
                {SIZES.map((s) => (
                  <SizeChip key={s} size={s} active={sizes.includes(s)} onToggle={() => toggleSize(s)} t={t} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3" style={{ padding: '12px 18px', borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn('text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid={`button-type-edit-cancel-${category.id}`}
          >
            Cancel
          </button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={submit}
            className="text-white hover:opacity-90 rounded-full disabled:opacity-40"
            style={{ backgroundColor: t.blue, borderColor: t.blue, paddingLeft: 18, paddingRight: 18 }}
            data-testid={`button-type-edit-save-${category.id}`}
          >
            Save
          </Button>
        </div>
        {/* Hide — same offered/not-offered grammar as sizes: word + icon. */}
        {onToggleHidden && (
          <button
            type="button"
            onClick={() => {
              onToggleHidden();
              onOpenChange(false);
            }}
            className={cn('w-full flex items-center gap-2.5 px-3.5 text-[13px] transition-colors whitespace-nowrap', t.hoverWashSoft)}
            style={{ padding: '12px 14px', borderTop: `1px solid ${t.hairline}`, color: t.ink, background: 'transparent' }}
            data-testid={`button-type-hide-${category.id}`}
          >
            {category.hidden
              ? <Eye className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
              : <EyeOff className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />}
            <span>{category.hidden ? "Offer" : "Don\u2019t offer"}</span>
          </button>
        )}
        {/* Archive — Apple convention: destructive-adjacent action gets its own
            hairline-separated full-width row at the very bottom. Archive (not
            delete): pressed records keep their history; the type just retires. */}
        {onRemove && (
          <button
            type="button"
            onClick={() => {
              onRemove();
              onOpenChange(false);
            }}
            className="w-full text-[13px] font-semibold transition-colors"
            style={{ padding: '12px 18px', borderTop: `1px solid ${t.hairline}`, color: t.critical, textAlign: 'center', background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.critWash)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            data-testid={`button-archive-type-${category.id}`}
          >
            Archive type
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Category card — mini disc + name + count (artist-picker shape) ──
function CategoryCard({
  category,
  active,
  pageSize,
  onSelect,
  onSaveType,
  onRemoveType,
  onDuplicateType,
  onEditColor,
  onToggleHidden,
  t,
}: {
  category: Category;
  active: boolean;
  /** The size currently picked in the "Pick a size" step. */
  pageSize: SizeId;
  onSelect: () => void;
  onSaveType: (name: string, sizes: SizeId[], customImg?: string) => void;
  onRemoveType?: () => void;
  onDuplicateType?: () => void;
  onEditColor?: () => void;
  onToggleHidden?: () => void;
  t: Theme;
}) {
  const preview = categoryPreview(category);
  const [menuOpen, setMenuOpen] = useState(false);
  // Type not offered in the currently-picked size → artists won't see it.
  const hiddenForSize = !category.sizes.includes(pageSize);
  const dimmed = hiddenForSize || !!category.hidden;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={active}
      data-testid={`category-${category.id}`}
      className="relative rounded-2xl text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer group"
      style={{ padding: 14, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, backgroundColor: t.card }}
    >
      <TypeEditorPopover
        category={category}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSave={onSaveType}
        onRemove={onRemoveType}
        onDuplicate={onDuplicateType}
        onEditColor={onEditColor}
        onToggleHidden={onToggleHidden}
        t={t}
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Edit ${category.name}`}
            data-testid={`button-edit-type-${category.id}`}
            className={`absolute inline-flex items-center justify-center rounded-full transition-all focus:outline-none ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
            style={{
              top: 8,
              right: 8,
              width: 26,
              height: 26,
              // Above the disc art — the record renders later in the DOM and
              // was eating the first click on the ···.
              zIndex: 2,
              color: t.subink,
              background: t.frostedBtnBg,
              border: `1px solid ${t.hairline}`,
              opacity: menuOpen ? 1 : undefined,
            }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        }
      />
      {/* Migration signal (Bill, Aug 20 2026): a quiet word+icon pill counts
          the photo colors still to rebuild. It clears itself — replace the
          last photo and the pill is gone. Word + icon, never color alone. */}
      {(() => {
        const photoCount = category.swatches.filter((s) => s.customImg).length;
        return photoCount > 0 ? (
          <span
            className="absolute inline-flex items-center gap-1 rounded-full text-[10.5px] font-semibold"
            data-testid={`badge-photos-${category.id}`}
            style={{ top: 10, left: 10, zIndex: 2, padding: '3px 8px', border: `1px solid ${t.hairline}`, background: t.frostedBtnBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: t.subink }}
          >
            <ImageIcon style={{ width: 11, height: 11 }} />
            {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
          </span>
        ) : null;
      })()}
      <div className="flex justify-center" style={{ marginBottom: 10, opacity: dimmed ? 0.35 : 1, filter: dimmed ? 'saturate(0.4)' : undefined, transition: 'opacity 0.3s, filter 0.3s' }}>
        <VinylDisc size={90} swatch={preview} />
      </div>
      <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
        {category.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 2, color: dimmed ? t.notOffered : t.faint }}>
        {category.hidden ? (
          <span className="inline-flex items-center gap-1">
            <EyeOff style={{ width: 11, height: 11 }} />
            Not offered
          </span>
        ) : hiddenForSize
          ? `Not offered in ${pageSize}`
          : `${category.swatches.length} ${category.swatches.length === 1 ? 'color' : 'colors'}`}
      </div>
    </div>
  );
}

// ─── "+ More types" popover — name a new category ────────────────────
function MoreTypesPopover({ onAdd, t }: { onAdd: (name: string, desc: string) => void; t: Theme }) {
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
            style={{ width: 20, height: 20, borderColor: t.blue, color: t.blue }}
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: t.blue }}>
            More types
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-80 p-0 rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${t.hairline}`,
          backgroundColor: t.frostedBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: t.popShadow,
        }}
        data-testid="popover-more-types"
      >
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold" style={{ color: t.ink }}>
            New pressing type
          </div>
          <p className="text-[12.5px]" style={{ color: t.subink, marginTop: 2, lineHeight: 1.4 }}>
            Add a category you press that isn&rsquo;t listed.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                Type name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Picture disc"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
                data-testid="input-type-name"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                One-line description
              </label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="e.g. Full-face artwork on the disc"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
                data-testid="input-type-desc"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1" style={{ padding: '12px 18px', borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn('text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid="button-type-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className={cn('text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors disabled:opacity-40', t.hoverWash)}
            style={{ color: t.blue }}
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
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  t: Theme;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
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
          style={{ width: 100, height: 38, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
          aria-label={`${label} hex`}
          data-testid={`${testId}-hex`}
        />
        <span className="rounded-lg flex-shrink-0" style={{ width: 26, height: 26, backgroundColor: value, border: `1px solid ${t.hairline}` }} />
      </div>
    </div>
  );
}

// ─── Size toggle chip ────────────────────────────────────────────────
// 12″ first, always — same 12/10/7 order everywhere sizes appear.
const SIZES = ['12"', '10"', '7"'] as const;
type SizeId = (typeof SIZES)[number];

function SizeChip({ size, active, onToggle, t }: { size: SizeId; active: boolean; onToggle: () => void; t: Theme }) {
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
        color: active ? '#ffffff' : t.ink,
        backgroundColor: active ? t.blue : t.card,
        border: active ? `1px solid ${t.blue}` : `1px solid ${t.hairline}`,
      }}
    >
      {size}
    </button>
  );
}

// ─── Add-a-swatch frosted popover ────────────────────────────────────
// Holds the entire "define a color" flow: name, hex(es), upload, sizes, and the
// ONE filled blue "Save color" pill on the screen.

// ─── Preview-image row — shared by the type editor and the color editor ─
// A round disc thumbnail + a blue "Change image…" text link and a quiet
// "Remove" beneath it. Mock-only: "Change image…" toggles in the stock
// reference image; "Remove" clears it. When set, the image replaces the
// rendered disc on the tile (via VinylDisc's customImg branch).
function PreviewImageRow({
  disc,
  img,
  onPick,
  onRemove,
  testId,
  t,
}: {
  disc: ReactNode;
  img: string | undefined;
  onPick: (file: File) => void;
  onRemove: () => void;
  testId: string;
  t: Theme;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
        Preview image
      </label>
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0">{disc}</span>
        <div className="flex flex-col items-start gap-0.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid={`${testId}-input`}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = '';
              if (!file) return;
              setUploading(true);
              try {
                await onPick(file);
              } finally {
                setUploading(false);
              }
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="text-[13px] font-semibold rounded transition-colors focus:outline-none disabled:opacity-50"
            style={{ color: t.blue }}
            data-testid={`${testId}-change`}
          >
            {uploading ? 'Uploading…' : 'Change image…'}
          </button>
          {img && !uploading && (
            <button
              type="button"
              onClick={onRemove}
              className="text-[12px] rounded transition-colors focus:outline-none hover:text-slate-600"
              style={{ color: t.subink }}
              data-testid={`${testId}-remove`}
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
  t,
}: {
  kind: SwatchKind;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  edit?: Swatch;
  onSave: (s: Swatch) => void;
  onRemove?: () => void;
  t: Theme;
}) {
  const isBlack = kind === 'black';
  const isSplatter = kind === 'splatter';

  const defaultBase = isBlack ? '#0C0C0C' : isSplatter ? '#1B3A6B' : '#C81E38';

  const [name, setName] = useState(edit?.name ?? '');
  const [base, setBase] = useState(edit?.base ?? defaultBase);
  const [s1, setS1] = useState(edit?.s1 ?? '#F5F5DC');
  const [s2, setS2] = useState(edit?.s2 ?? '#E8C84A');
  const [s3, setS3] = useState(edit?.s3 ?? '#E0E0E0');
  const [sizes, setSizes] = useState<SizeId[]>(edit?.sizes ?? ['12"']);
  const [uploaded, setUploaded] = useState(false);
  const [customImg, setCustomImg] = useState<string | undefined>(edit?.customImg);
  // Splatter composer: base body can be opaque or translucent (mirrors the
  // SplatterVinylPreview device). Defaults to opaque.
  const [vinylType, setVinylType] = useState<'opaque' | 'translucent'>(
    edit?.splatterTranslucent ? 'translucent' : 'opaque',
  );

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
    setCustomImg(edit?.customImg);
    setVinylType(edit?.splatterTranslucent ? 'translucent' : 'opaque');
  };

  const submit = () => {
    if (!canSave) return;
    onSave({
      id: edit?.id ?? `new-${Date.now()}`,
      name: name.trim(),
      kind,
      base: isBlack ? '#0C0C0C' : base,
      s1: isSplatter ? s1 : undefined,
      s2: isSplatter ? s2 : undefined,
      s3: isSplatter ? s3 : undefined,
      sizes,
      customImg,
      splatterTranslucent: isSplatter ? vinylType === 'translucent' : undefined,
    });
    onOpenChange(false);
  };

  const previewSwatch: Swatch = {
    id: 'preview',
    name: name || (edit ? edit.name : 'New color'),
    kind,
    base: isBlack ? '#0C0C0C' : base,
    s1: isSplatter ? s1 : undefined,
    s2: isSplatter ? s2 : undefined,
    s3: isSplatter ? s3 : undefined,
    sizes,
    customImg,
    splatterTranslucent: isSplatter ? vinylType === 'translucent' : undefined,
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
        // A form, not a menu — outside clicks (including the feedback
        // Comment tool) must not dismiss it. Cancel / Save / Esc close it.
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[360px] p-0 rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${t.hairline}`,
          backgroundColor: t.frostedBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: t.popShadowLg,
          // Never taller than the viewport; the middle scrolls, header/footer pin.
          maxHeight: 'min(640px, calc(100vh - 32px))',
        }}
        data-testid={edit ? 'popover-edit-color' : 'popover-add-color'}
      >
        {/* Pinned header — two-tone title, always visible */}
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '18px 18px 14px 18px' }}>
          <VinylDisc size={44} swatch={previewSwatch} />
          <div>
            <div className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>
              {edit ? (
                <>
                  Edit color. <span style={{ color: t.faint, fontWeight: 600 }}>{edit.name}.</span>
                </>
              ) : (
                'New color'
              )}
            </div>
            <div className="text-[12px]" style={{ color: t.subink }}>
              {isBlack ? 'Black is black — just name and size it.' : 'Define, then save to your catalog.'}
            </div>
          </div>
        </div>

        {/* Scrollable body — quiet, only a hairline separates it from the footer */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 18px 18px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* preview image — round disc thumb + Change image… / Remove */}
            <PreviewImageRow
              disc={<VinylDisc size={44} swatch={previewSwatch} />}
              img={customImg}
              onPick={async (file) => {
                const url = await uploadPreviewImageFile(file);
                if (url) setCustomImg(url);
              }}
              onRemove={() => setCustomImg(undefined)}
              testId="color-preview-img"
              t={t}
            />

            {/* name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                Color name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cosmic Splatter"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
                data-testid="input-color-name"
              />
            </div>

            {/* Splatter composer — the SplatterVinylPreview device: presets,
                opaque/translucent base toggle, base + 3 splatter color fields. */}
            {isSplatter && (
              <>
                {/* presets — a chip per combo, each with a live mini disc */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                    Presets
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {SPLATTER_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setVinylType(p.vinylType);
                          setBase(p.base);
                          setS1(p.s1);
                          setS2(p.s2);
                          setS3(p.s3);
                        }}
                        className={cn('inline-flex items-center gap-2 rounded-full transition-colors focus:outline-none', t.hoverWashSoft)}
                        style={{ padding: '5px 11px', border: `1px solid ${t.hairline}`, background: t.card, fontSize: 12, fontWeight: 500, color: t.ink }}
                        data-testid={`splatter-preset-${p.label.replace(/\s+/g, '-').toLowerCase()}`}
                      >
                        <VinylDisc
                          size={20}
                          swatch={{ id: 'p', name: p.label, kind: 'splatter', base: p.base, s1: p.s1, s2: p.s2, s3: p.s3, sizes: ['12"'], splatterTranslucent: p.vinylType === 'translucent' }}
                        />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* opaque / translucent base toggle */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                    Vinyl type
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([
                      { id: 'opaque' as const, label: 'Opaque vinyl', sub: 'Solid color — no see-through' },
                      { id: 'translucent' as const, label: 'Translucent vinyl', sub: 'Tinted, light passes through' },
                    ]).map((o) => {
                      const selected = vinylType === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setVinylType(o.id)}
                          data-testid={`splatter-vinyltype-${o.id}`}
                          className="flex flex-col items-start rounded-xl transition-colors focus:outline-none"
                          style={{
                            padding: '10px 12px',
                            border: selected ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
                            background: selected ? t.selectWash : t.card,
                            textAlign: 'left',
                            gap: 2,
                          }}
                        >
                          <span className="text-[13px] font-semibold" style={{ color: selected ? t.blue : t.ink }}>{o.label}</span>
                          <span className="text-[11px] leading-snug" style={{ color: t.subink }}>{o.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* base + splatter color fields */}
                <div className="rounded-xl" style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <ColorField
                    label={vinylType === 'translucent' ? 'Translucent base tint' : 'Opaque base color'}
                    value={base}
                    onChange={setBase}
                    testId="color-base"
                    t={t}
                  />
                  <div style={{ height: 1, background: t.hairline }} />
                  <ColorField label="Splatter color 1" value={s1} onChange={setS1} testId="color-s1" t={t} />
                  <ColorField label="Splatter color 2" value={s2} onChange={setS2} testId="color-s2" t={t} />
                  <ColorField label="Splatter color 3" value={s3} onChange={setS3} testId="color-s3" t={t} />
                </div>
              </>
            )}

            {/* single hex field — translucent / opaque types (not black, not splatter) */}
            {!isBlack && !isSplatter && (
              <div className="rounded-xl" style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <ColorField
                  label={kind === 'translucent' ? 'Translucent tint' : 'Vinyl color'}
                  value={base}
                  onChange={setBase}
                  testId="color-base"
                  t={t}
                />
              </div>
            )}

            {/* upload */}
            <button
              type="button"
              onClick={() => setUploaded((v) => !v)}
              data-testid="button-upload-swatch"
              className={cn('w-full rounded-xl flex flex-col items-center justify-center text-center transition-colors focus:outline-none', t.hoverWashSoft)}
              style={{ padding: '16px 12px', border: `1px dashed ${uploaded ? t.blue : t.dashedBorder}`, background: uploaded ? t.selectWash : t.card }}
            >
              {uploaded ? (
                <>
                  <Check className="w-4 h-4" style={{ color: t.blue }} strokeWidth={2.5} />
                  <span className="text-[12.5px] font-semibold" style={{ color: t.blue, marginTop: 6 }}>
                    swatch-reference.png
                  </span>
                  <span className="text-[11.5px]" style={{ color: t.subink, marginTop: 1 }}>
                    Uploaded — tap to replace
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" style={{ color: t.faint }} />
                  <span className="text-[12.5px] font-semibold" style={{ color: t.ink, marginTop: 6 }}>
                    Upload a swatch
                  </span>
                  <span className="text-[11.5px]" style={{ color: t.subink, marginTop: 1 }}>
                    PNG or JPG reference
                  </span>
                </>
              )}
            </button>

            {/* Sizes live on the TYPE, never per color — a color can't be
                "12-only"; the type's sizes gate every color in it. (Bill,
                Aug 20 2026.) Edit them in the type's ··· popover. */}

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
                  style={{ color: t.critical }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = t.critWash)}
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
        <div className="flex items-center justify-end gap-3 flex-shrink-0" style={{ padding: '12px 18px', borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={cn('text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid="button-color-cancel"
          >
            Cancel
          </button>
          <Button
            size="sm"
            disabled={!canSave}
            onClick={submit}
            className="text-white hover:opacity-90 rounded-full disabled:opacity-40"
            style={{ backgroundColor: t.blue, borderColor: t.blue, paddingLeft: 18, paddingRight: 18 }}
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
function AddSwatchTile({ kind, onSave, onOpen, t }: { kind: SwatchKind; onSave: (s: Swatch) => void; onOpen?: () => void; t: Theme }) {
  const [open, setOpen] = useState(false);
  // Generator styles skip the old popover — Add color opens the style's
  // sheet on its saved colors instead. (Bill, Aug 20 2026.)
  if (onOpen) {
    return (
      <button
        type="button"
        data-testid="tile-add-color"
        onClick={onOpen}
        className={cn('rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors focus:outline-none', t.hoverWashSoft)}
        style={{ padding: 12, minHeight: 108, border: `1px dashed ${t.dashedBorder}`, background: t.card }}
      >
        <span className="inline-flex items-center justify-center rounded-full border" style={{ width: 30, height: 30, borderColor: t.blue, color: t.blue }}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />
        </span>
        <span className="text-[11.5px] font-semibold" style={{ color: t.subink }}>
          Add color
        </span>
      </button>
    );
  }
  return (
    <SwatchEditorPopover
      kind={kind}
      open={open}
      onOpenChange={setOpen}
      onSave={onSave}
      t={t}
      trigger={
        <button
          type="button"
          data-testid="tile-add-color"
          className={cn('rounded-2xl flex flex-col items-center justify-center gap-2 transition-colors focus:outline-none', t.hoverWashSoft)}
          style={{ padding: 12, minHeight: 108, border: `1px dashed ${t.dashedBorder}`, background: t.card }}
        >
          <span className="inline-flex items-center justify-center rounded-full border" style={{ width: 30, height: 30, borderColor: t.blue, color: t.blue }}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />
          </span>
          <span className="text-[11.5px] font-semibold" style={{ color: t.subink }}>
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
  t,
}: {
  entries: CatalogEntry[];
  selectedId: string;
  onPick: (categoryId: CategoryId, swatchId: string) => void;
  t: Theme;
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
          className={cn('inline-flex items-center justify-center rounded-full flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300', t.hoverWash)}
          style={{ width: 34, height: 34, color: t.subink, border: `1px solid ${t.hairline}`, background: t.card }}
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
          border: `1px solid ${t.hairline}`,
          backgroundColor: t.frostedStrongBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: t.popShadowLg,
          // Never escape the viewport: bound by both an absolute cap and the
          // space Radix measures between the trigger and the collision edge.
          maxHeight: 'min(560px, calc(100vh - 32px), var(--radix-popover-content-available-height))',
        }}
        data-testid="popover-catalog-search"
      >
        {/* Pinned header — small-caps title + count, then the search pill */}
        <div className="flex-shrink-0" style={{ padding: '14px 18px', borderBottom: `1px solid ${t.hairline}` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
              Colors in your catalog
            </span>
            <span className="text-[12px] tabular-nums" style={{ color: t.faint }}>
              {entries.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: t.faint }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-8 rounded-full text-[12.5px] placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
              style={{ border: `1px solid ${t.hairline}`, color: t.ink, background: t.card }}
              placeholder="Find a color…"
              data-testid="input-catalog-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                data-testid="button-catalog-clear"
                className={cn('absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-full transition-colors', t.hoverWash)}
                style={{ width: 18, height: 18, color: t.subink }}
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
              <p className="text-[12.5px]" style={{ color: t.faint }}>
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
                      className={cn('w-full flex items-center gap-3 text-left transition-colors focus:outline-none', t.hoverWashSoft)}
                      style={{ padding: '11px 18px', borderBottom: `1px solid ${t.hairline}`, backgroundColor: on ? t.selectWash : undefined }}
                    >
                      <VinylDisc size={40} swatch={swatch} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold truncate" style={{ color: on ? t.blue : t.ink }}>
                          {displayPressColorName(swatch.name) ?? `${categoryName} color`}
                        </div>
                        <div className="text-[11.5px]" style={{ color: t.subink }}>
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
  isDefault,
  onSelect,
  onSave,
  onRemove,
  onEditGen,
  onRebuild,
  onMakeDefault,
  onToggleHidden,
  t,
}: {
  swatch: Swatch;
  kind: SwatchKind;
  active: boolean;
  /** First color in the style — what artists get unless they pick. */
  isDefault?: boolean;
  onSelect: () => void;
  onSave: (s: Swatch) => void;
  onRemove: () => void;
  onEditGen?: () => void;
  onRebuild?: () => void;
  onMakeDefault?: () => void;
  onToggleHidden?: () => void;
  t: Theme;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hidden = !!swatch.hidden;

  // Quiet left-aligned menu row — same grammar as the Edit-style popover rows.
  const menuRow = (testid: string, icon: ReactNode, label: string, onClick: () => void) => (
    <button
      type="button"
      data-testid={testid}
      onClick={() => { setMenuOpen(false); onClick(); }}
      className="flex w-full items-center gap-2.5 text-left text-[13px] font-medium transition-colors hover:bg-black/[0.04] focus:outline-none"
      style={{ padding: '9px 14px', color: t.ink, background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        data-testid={`swatch-${swatch.id}`}
        className="w-full rounded-2xl flex flex-col items-center gap-2 transition-all hover:-translate-y-px focus:outline-none"
        style={{
          padding: 12, minHeight: 108,
          border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
          backgroundColor: t.card, opacity: hidden ? 0.55 : 1,
        }}
      >
        <span className="relative" style={{ filter: hidden ? 'grayscale(1)' : undefined }}>
          <VinylDisc size={40} swatch={swatch} />
          {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
        </span>
        {displayPressColorName(swatch.name) && (
          <span className="text-[11.5px] font-semibold text-center leading-tight" style={{ color: active ? t.blue : t.ink }}>
            {displayPressColorName(swatch.name)}
          </span>
        )}
        {/* Word + icon, never color alone */}
        {hidden && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: t.faint }}>
            <EyeOff className="w-3 h-3" /> Not offered
          </span>
        )}
      </button>

      {/* Default = a quiet star in the corner; hover spells out the word.
          (Bill, Aug 20 2026.) */}
      {isDefault && !hidden && (
        <span
          className="absolute inline-flex items-center gap-1 pointer-events-none"
          style={{ top: 8, left: 8, color: t.faint }}
          data-testid={`swatch-default-${swatch.id}`}
        >
          <Star className="w-3.5 h-3.5" />
          <span className="text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Default</span>
        </span>
      )}

      {/* Frosted ··· — invisible until hover / focus-within */}
      <div
        className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
        style={{ top: 8, right: 8, opacity: menuOpen ? 1 : undefined }}
      >
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Options for ${swatch.name}`}
              data-testid={`swatch-menu-${swatch.id}`}
              className="inline-flex items-center justify-center rounded-full transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              style={{
                width: 26, height: 26,
                backgroundColor: t.frostedBtnStrongBg,
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                border: `1px solid ${t.hairline}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                color: t.subink,
              }}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end" side="bottom" sideOffset={8} avoidCollisions collisionPadding={16}
            className="w-52 p-0 rounded-2xl overflow-hidden"
            style={{
              border: `1px solid ${t.hairline}`, backgroundColor: t.frostedBg,
              backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', boxShadow: t.popShadow,
            }}
            data-testid={`popover-swatch-${swatch.id}`}
          >
            <div style={{ padding: '6px 0' }}>
              {/* Two offerings only: Edit (straight to the picker) and the
                  offer toggle below. (Bill, Aug 20 2026.) */}
              {menuRow(`button-swatch-edit-${swatch.id}`,
                <Pencil className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />, 'Edit',
                () => (onEditGen ? onEditGen() : onRebuild ? onRebuild() : setEditOpen(true)))}
              {onMakeDefault && !isDefault && !hidden && menuRow(`button-swatch-default-${swatch.id}`,
                <Star className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />, 'Make default',
                onMakeDefault)}
              {onToggleHidden && (
                <div style={{ borderTop: `1px solid ${t.hairline}`, marginTop: 4, paddingTop: 4 }}>
                  {menuRow(`button-swatch-hide-${swatch.id}`,
                    hidden
                      ? <Eye className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />
                      : <EyeOff className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />,
                    hidden ? "Offer" : "Don't offer",
                    onToggleHidden)}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Photo-swatch editor — opened from the menu's "Edit color" */}
        <SwatchEditorPopover
          kind={kind}
          edit={swatch}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSave={onSave}
          onRemove={onRemove}
          t={t}
          trigger={
            // Invisible anchor — the editor opens from the menu's "Edit
            // color" row, so the trigger only positions the popover.
            <span aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: 1, height: 1 }} />
          }
        />
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────
// ─── Vinyl weights ────────────────────────────────────────────────────
// Data-driven so each press can offer its own ladder — MRP runs 140g/180g
// today; a Viryl-equipped plant might add its own presets later.
const VINYL_WEIGHTS = [
  { id: '140', label: '140g', note: 'Standard' },
  { id: '180', label: '180g', note: 'Heavyweight' },
];

// ─── Vinyl sizes ──────────────────────────────────────────────────────
// Same size picker as the artist-facing screens — record diameter first.
// 12″ first, always — Bill's rule (Aug 20 2026): sizes read 12/10/7, 12 default.
const VINYL_SIZE_OPTIONS = [
  { id: '12', label: '12"', note: '' },
  { id: '10', label: '10"', note: '' },
  { id: '7',  label: '7"',  note: '' },
];

// ─── Records per release ──────────────────────────────────────────────
// How many discs the release presses — single LP up to a 4LP box.
const VINYL_QUANTITIES = [
  { id: '1', label: '1 LP', note: 'Single' },
  { id: '2', label: '2 LP', note: 'Double' },
  { id: '3', label: '3 LP', note: 'Triple' },
  { id: '4', label: '4 LP', note: 'Quad' },
];

// ─── Add a weight — same \u201cMore types\u201d canon popover pattern ─────────
// Some presses offer their own weights (150g, plant-specific runs), so the
// ladder isn't fixed: a press can add a weight the same way they add a
// pressing type. Frosted popover, two fields, Cancel / Add footer.
function AddWeightPopover({ onAdd, t }: { onAdd: (grams: string, note: string) => void; t: Theme }) {
  const [open, setOpen] = useState(false);
  const [grams, setGrams] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    if (!grams.trim()) return;
    onAdd(grams.trim(), note.trim());
    setGrams('');
    setNote('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 focus:outline-none"
          data-testid="button-add-weight"
        >
          <span
            className="inline-flex items-center justify-center rounded-full border flex-shrink-0"
            style={{ width: 20, height: 20, borderColor: t.blue, color: t.blue }}
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: t.blue }}>
            Add a weight
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-80 p-0 rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${t.hairline}`,
          backgroundColor: t.frostedBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: t.popShadow,
        }}
        data-testid="popover-add-weight"
      >
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold" style={{ color: t.ink }}>
            New weight
          </div>
          <p className="text-[12.5px]" style={{ color: t.subink, marginTop: 2, lineHeight: 1.4 }}>
            Add a weight your plant presses that isn&rsquo;t listed.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                Weight in grams
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={grams}
                onChange={(e) => setGrams(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 150"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
                data-testid="input-weight-grams"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                One-word label
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. House standard"
                className="text-[13.5px] focus:outline-none focus:border-slate-400 transition-colors"
                style={{ height: 40, border: `1px solid ${t.hairline}`, borderRadius: 10, padding: '0 12px', color: t.ink, background: t.card }}
                data-testid="input-weight-note"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1" style={{ padding: '12px 18px', borderTop: `1px solid ${t.hairline}` }}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn('text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors', t.hoverWash)}
            style={{ color: t.subink }}
            data-testid="button-weight-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!grams.trim()}
            className={cn('text-[13px] font-semibold rounded-full px-3 py-1.5 transition-colors disabled:opacity-40', t.hoverWash)}
            style={{ color: t.blue }}
            data-testid="button-weight-add"
          >
            Add
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Offerable option cards — shared by size / quantity / weight ─────
// Each card gets a hover \u22EF menu to mark the option "Not offered".
// The card never disappears: it stays in the ladder, muted, labeled with
// icon + word (never color alone), so the lineup reads consistently.
type OfferableOption = { id: string; label: string; note: string };

function OfferableOptionCards({
  options,
  selectedId,
  onSelect,
  offered,
  onToggleOffered,
  menuOpenId,
  onMenuOpenChange,
  testPrefix,
  t,
}: {
  options: OfferableOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  offered: Record<string, boolean>;
  onToggleOffered: (id: string) => void;
  menuOpenId: string | null;
  onMenuOpenChange: (id: string | null) => void;
  testPrefix: string;
  t: Theme;
}) {
  return (
    <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
      {options.map((s) => {
        const isOffered = !!offered[s.id];
        const active = isOffered && s.id === selectedId;
        return (
          <div key={s.id} className="group/offer relative" style={{ flex: 1 }}>
            <button
              type="button"
              onClick={() => isOffered && onSelect(s.id)}
              aria-pressed={active}
              aria-disabled={!isOffered}
              data-testid={`${testPrefix}-${s.id}`}
              className="w-full rounded-2xl transition-all focus:outline-none"
              style={{
                padding: '16px 12px',
                border: active ? `2px solid ${t.blue}` : `1px ${isOffered ? 'solid' : 'dashed'} ${t.hairline}`,
                textAlign: 'center',
                cursor: isOffered ? 'pointer' : 'default',
                opacity: isOffered ? 1 : 0.55,
                backgroundColor: t.card,
              }}
            >
              <div className="text-[17px] font-semibold" style={{ color: active ? t.blue : t.ink }}>{s.label}</div>
              {isOffered ? (
                <div className="text-[11px]" style={{ marginTop: 3, color: t.faint }}>{s.note}</div>
              ) : (
                <div className="text-[11px] font-semibold inline-flex items-center gap-1 justify-center" style={{ marginTop: 3, color: t.subink }}>
                  <EyeOff style={{ width: 11, height: 11 }} />
                  Not offered
                </div>
              )}
            </button>
            <Popover open={menuOpenId === s.id} onOpenChange={(v) => onMenuOpenChange(v ? s.id : null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${s.label} options`}
                  data-testid={`${testPrefix}-menu-${s.id}`}
                  className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition-opacity ${menuOpenId === s.id ? 'opacity-100' : 'opacity-0 group-hover/offer:opacity-100'}`}
                  style={{ border: `1px solid ${t.hairline}`, color: t.subink, boxShadow: '0 1px 3px rgba(15,23,42,0.08)', backgroundColor: t.card }}
                >
                  <MoreHorizontal style={{ width: 13, height: 13 }} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={8}
                className="w-auto p-0 rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, color: t.ink, boxShadow: t.popShadow }}
              >
                <div className="py-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleOffered(s.id)}
                    data-testid={`${testPrefix}-toggle-${s.id}`}
                    className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors whitespace-nowrap', t.hoverWashSoft)}
                    style={{ color: t.ink }}
                  >
                    {isOffered ? <EyeOff className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} /> : <Eye className="w-4 h-4 flex-shrink-0" style={{ color: t.faint }} />}
                    <span>{isOffered ? `Don\u2019t offer ${s.label}` : `Offer ${s.label}`}</span>
                  </button>
                </div>
                <div className="px-3.5 py-2" style={{ borderTop: `1px solid ${t.hairline}` }}>
                  <p className="text-[11px]" style={{ color: t.subink, whiteSpace: 'nowrap' }}>
                    {isOffered
                      ? 'Stays visible here \u2014 artists never see it.'
                      : 'Available to price and offer again.'}
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}
    </div>
  );
}

// ═══ Vinyl Disc Generator — the "pick-a-color" stencil builder ════════
// Per Otis's Aug 19 2026 brief: the press assigns hexes to a layered stencil
// (Andrew's PSD, 20 style groups), the backend renders a full-res disc PNG,
// and it lands in the catalog beside photo swatches. The mock renders each
// style with code (SVG stand-ins, one per PSD group) so the design maps 1:1
// to GET styles / POST render when Otis wires it. Constraints (either/or
// base, pick-one option sets, gradient maps, rule hints) are DATA, not
// hardcoded UI. The G label overlay is opaque and always on top; the shine
// layer composites identically over every style. Artists never see hex
// inputs — they only pick from the press's saved discs.

// ─── Generator data model — mirrors Andrew's PSD, layer for layer ────
// Each style is a z-ordered stack of the REAL layer PNGs extracted from
// Splatter_VinylMockup_ALLLAYERS.psd (one folder per PSD group under
// /vinyl-gen). Colorable layers are pure alpha stencils tinted via CSS
// mask; gradient-map textures re-ramp through an SVG luminance→table
// filter — the same math as the PSD's Gradient Map clips. Constraints
// (either/or base, pick-one sets, splatter counts) are DATA, never
// hardcoded UI. Otis's renderer swaps in the full-res pipeline 1:1.

const GEN_BASE = '/vinyl-gen/';

type GenLayerSpec = {
  /** Layer PNG inside the style's PSD group folder. */
  file?: string;
  /** Pick the file from the active pick-one option (null = layer off). */
  byOption?: Record<string, string | null>;
  /** File comes from the either/or base per the chosen base kind. */
  baseEither?: boolean;
  /** Dynamic splatter slot (0-based) — renders only while the chosen
      splatter count exceeds it; file + color come from the slot. */
  splatterSlot?: number;
  /** Tint with this fixed color row (index into the style's rows). */
  color?: number;
  /** Draw the PNG as-is (uncolored vinyl bodies, shading). */
  neutral?: boolean;
  /** Re-ramp the texture through the gradient-map stops. */
  gradient?: boolean;
  opacity?: number;
  blend?: React.CSSProperties['mixBlendMode'];
  /** PSD "adjust opacity for trans": layer drops to ~0.69 opacity when the
      base kind is translucent; fully opaque on opaque bases. */
  transAdjust?: boolean;
  /** Tint with this exact hex — for fixed styles (Black) with no color rows. */
  fixedColor?: string;
};

type GenStyleDef = {
  id: string;
  name: string;
  /** Folder under /vinyl-gen — the PSD group, verbatim. */
  psdGroup: string;
  /** Fixed color rows, in disc stacking order. */
  rows: { name: string }[];
  /** Gradient-map texture: the stops become color rows after `rows`.
      `locations` (0–1) mirror the PSD gradient editor stop positions. */
  gradient?: { stops: string[]; locations?: number[] };
  /** Splatter pass: one file per slot; the press picks how many. Each
      active slot adds a "Splatter N" color row after the ramp stops. */
  splatter?: { files: string[]; default: number };
  /** Opaque/Translucent either-or base — never both. */
  eitherOrBase?: { opaque: string; translucent: string };
  /** Exactly-one option set (Standard finish, Cornetto spokes…). */
  pickOne?: { label: string; options: { id: string; label: string }[]; default: string };
  /** Bottom→top layer stack. */
  layers: GenLayerSpec[];
  /** Rule notes from the PSD — surfaced as helper text; renderer enforces. */
  hints?: string[];
  /** Example hexes for the gallery tile (rows → stops → default splatters). */
  example: string[];
};

const GEN_STYLES: GenStyleDef[] = [
  {
    // Black leads the gallery — always the first tile, top left. (Andrew,
    // Aug 20 2026.) One color row like every other style: a press can carry
    // black, charcoal, off-black… the color is still theirs to pick. (Bill,
    // Aug 20 2026.)
    id: 'black', name: 'Black', psdGroup: 'standard-vinyl',
    rows: [{ name: 'Color' }],
    layers: [{ file: 'opaque-vinyl.png', color: 0 }],
    example: ['#0A0A0A'],
  },
  {
    id: 'standard', name: 'Standard', psdGroup: 'standard-vinyl',
    rows: [{ name: 'Color' }],
    pickOne: { label: 'Finish', options: [{ id: 'opaque', label: 'Opaque' }, { id: 'trans', label: 'Translucent' }, { id: 'ultra', label: 'Ultra clear' }], default: 'opaque' },
    layers: [
      { byOption: { ultra: 'ultra-clear-vinyl.png', trans: null, opaque: null }, color: 0, opacity: 0.26 },
      { byOption: { ultra: null, trans: 'translucent-vinyl.png', opaque: null }, color: 0, opacity: 0.69 },
      { byOption: { ultra: null, trans: null, opaque: 'opaque-vinyl.png' }, color: 0 },
    ],
    example: ['#1B3A6B'],
  },
  {
    id: 'cloudy', name: 'Cloudy', psdGroup: 'cloudy-trans-ultra-clear',
    // Stop locations 13/87 straight from Andrew's PSD gradient editor —
    // clamped ends, steeper mid-ramp. (Aug 20 2026 screenshot.)
    rows: [{ name: 'Base' }], gradient: { stops: ['Color 1', 'Color 2'], locations: [0.13, 0.87] },
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { file: 'texture.png', gradient: true, opacity: 0.9 },
    ],
    hints: ['The ramp maps onto the cloud texture — light areas take Color 2.'],
    example: ['#DDEBF2', '#7BB8E8', '#F5F5DC'],
  },
  {
    id: 'colorcloudy', name: 'Color Cloudy', psdGroup: 'color-cloudy-trans-trans',
    rows: [{ name: 'Base' }, { name: 'Cloud' }],
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { file: 'light.png', color: 1, opacity: 0.7 },
    ],
    example: ['#1B6BA8', '#F5F5DC'],
  },
  {
    id: 'cornetto', name: 'Cornetto', psdGroup: 'cornetto-any-color-base-opaque',
    rows: [{ name: 'Base' }, { name: 'Spokes' }],
    eitherOrBase: { opaque: 'opaque-vinyl.png', translucent: 'translucent-vinyl.png' },
    pickOne: { label: 'Spokes', options: [{ id: '4', label: '4' }, { id: '5', label: '5' }, { id: '6', label: '6' }], default: '6' },
    splatter: { files: ['splatter-one.png', 'splatter-two.png', 'splatter-three.png'], default: 0 },
    layers: [
      { baseEither: true, color: 0 },
      { byOption: { '4': '4-spokes.png', '5': '5-spokes.png', '6': '6-spokes.png' }, color: 1 },
      { splatterSlot: 0 }, { splatterSlot: 1 }, { splatterSlot: 2 },
    ],
    example: ['#E8C84A', '#B3262E'],
  },
  {
    id: 'butterfly', name: 'Butterfly', psdGroup: 'butterfly-trans-base-opaque-wings',
    rows: [{ name: 'Base' }, { name: 'Wings' }],
    splatter: { files: ['wing-splatter.png'], default: 1 },
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { file: 'wings-color.png', color: 1, opacity: 0.9 },
      { splatterSlot: 0 },
    ],
    example: ['#7BB8E8', '#1B3A6B', '#F5F5DC'],
  },
  {
    id: 'colorincolor', name: 'Color-in-Color + Splatter', psdGroup: 'color-in-color-splatter-trans-base-opaque',
    rows: [{ name: 'Base' }, { name: 'Blob' }],
    splatter: { files: ['splatter.png'], default: 1 },
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { splatterSlot: 0 },
      { file: 'opaque-blob.png', color: 1 },
    ],
    example: ['#F5E6D3', '#C81E38', '#1A1A2E'],
  },
  {
    id: 'striped3', name: '3-Color Striped', psdGroup: '3-color-striped-any-3-colors',
    rows: [{ name: 'Left' }, { name: 'Middle' }, { name: 'Right' }],
    splatter: { files: ['splatter-one.png', 'splatter-two.png', 'splatter-three.png'], default: 1 },
    layers: [
      { file: 'translucent-vinyl.png', neutral: true, opacity: 0.69 },
      { file: 'left-color.png', color: 0, opacity: 0.4 },
      { file: 'right-color.png', color: 2, opacity: 0.4 },
      { file: 'middle-color.png', color: 1 },
      { splatterSlot: 0 }, { splatterSlot: 1 }, { splatterSlot: 2 },
    ],
    hints: ['The outer stripes run softer — that comes straight from the press sheet.'],
    example: ['#C81E38', '#F5F5DC', '#1A1A2E', '#E8C84A'],
  },
  {
    id: 'sideab2', name: '2-Color Side A/B', psdGroup: '2-color-side-a-b-w-splatter-opaque-opaque',
    // PSD (Andrew, Aug 20 2026): exactly three color slots — OPAQUE VINYL
    // (base), SPLATTER (sits between base and texture), A/B TEXTURE on top.
    // No gradient ramp, no extra colors.
    rows: [{ name: 'Base' }, { name: 'A/B Texture' }],
    splatter: { files: ['splatter.png'], default: 0 },
    layers: [
      { file: 'opaque-vinyl.png', color: 0 },
      { splatterSlot: 0 },
      { file: 'a-b-texture.png', color: 1 },
    ],
    example: ['#C89A3C', '#0A0A0A'],
  },
  {
    id: 'sideab3', name: '3-Color Side A/B', psdGroup: '3-color-side-a-b-opaque-opaque-opaque',
    rows: [], gradient: { stops: ['Color 1', 'Color 2', 'Color 3'] },
    splatter: { files: ['splatter-one.png', 'splatter-two.png', 'splatter-three.png'], default: 1 },
    layers: [
      { file: 'texture.png', gradient: true },
      { splatterSlot: 0 }, { splatterSlot: 1 }, { splatterSlot: 2 },
    ],
    example: ['#B3262E', '#F5F5DC', '#1B3A6B', '#E8C84A'],
  },
  {
    id: 'sideabmulti', name: 'Side A/B Multi-Splatter', psdGroup: 'side-a-b-w-multi-splatter',
    // Same shape as 2-Color Side A/B (Andrew, Aug 20 2026): one BASE vinyl
    // color, one A/B TEXTURE color — no gradient ramp. Splatters unchanged.
    rows: [{ name: 'Base' }, { name: 'A/B Texture' }],
    splatter: { files: ['splatter-one.png', 'splatter-two.png', 'splatter-three.png'], default: 2 },
    layers: [
      { file: 'opaque-vinyl.png', color: 0 },
      { file: 'a-b-texture-if-black-move-to-top.png', color: 1 },
      { splatterSlot: 0 }, { splatterSlot: 1 }, { splatterSlot: 2 },
    ],
    hints: ['If black is one of the colors, it moves to the top of the stack automatically.'],
    example: ['#1A1A2E', '#E8C84A', '#F5F5DC', '#C81E38'],
  },
  {
    id: 'coloroncolor', name: 'Color on Color', psdGroup: 'color-on-color-opaque-in-trans',
    rows: [{ name: 'Base' }, { name: 'Blob' }],
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { file: 'opaque-blob.png', color: 1 },
    ],
    example: ['#1B3A6B', '#FF6B35'],
  },
  {
    id: 'doublecic', name: 'Double Color-in-Color', psdGroup: 'double-c-i-c-any-2-colors-trans-base',
    rows: [{ name: 'Base' }, { name: 'Outer' }, { name: 'Middle' }],
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { file: 'outer-color.png', color: 1 },
      { file: 'middle-color.png', color: 2 },
    ],
    example: ['#BFE6EE', '#C81E38', '#E8C84A'],
  },
  {
    id: 'cicmulti', name: 'C.I.C. Multi-Splatter', psdGroup: 'c-i-c-multi-splatter-opaque-in-trans-base-w-opaque-splatters',
    rows: [{ name: 'Base' }, { name: 'Blob' }, { name: 'Splatter' }],
    pickOne: { label: 'Splatter', options: [{ id: 'minimal', label: 'Minimal' }, { id: 'more', label: 'More' }, { id: 'extra', label: 'Extra' }], default: 'more' },
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { byOption: { minimal: 'minimal-splatter.png', more: 'more-splatter.png', extra: 'extra-splatter.png' }, color: 2 },
      { file: 'blob.png', color: 1 },
      { file: 'same-color-as-base-to-blend-colors.png', color: 0, opacity: 0.12 },
    ],
    hints: ['A whisper of the base blends the blob edge — the renderer handles it.'],
    example: ['#7BA3A1', '#1A1A2E', '#F5F5DC'],
  },
  {
    id: 'smoke', name: 'Smoke', psdGroup: 'smoke-trans-base-any-color-smoke',
    rows: [{ name: 'Base' }, { name: 'Smoke' }],
    layers: [
      { file: 'translucent-vinyl.png', color: 0, opacity: 0.69 },
      { file: 'smoke.png', color: 1, opacity: 0.5 },
    ],
    example: ['#E0E0E0', '#4A4A4A'],
  },
  {
    id: 'splitsplatter', name: 'Split + Splatter', psdGroup: 'split-splatter-any-2-colors-opaque-splatter',
    rows: [{ name: 'Base' }, { name: 'Half' }],
    eitherOrBase: { opaque: 'opaque-vinyl.png', translucent: 'translucent-vinyl.png' },
    splatter: { files: ['splatter-one.png', 'splatter-two.png', 'splatter-three.png'], default: 2 },
    layers: [
      { baseEither: true, color: 0 },
      // PSD: the half sits OPAQUE on top of the base — never multiplied
      // (multiply turned yellow-over-blue into olive). "Adjust opacity for
      // trans" = the half goes semi-transparent only on translucent bases.
      { file: 'half-color-adjust-opacity-for-trans.png', color: 1, transAdjust: true },
      { splatterSlot: 0 }, { splatterSlot: 1 }, { splatterSlot: 2 },
    ],
    hints: ['Translucent bases auto-adjust the half opacity — no manual tweak.'],
    example: ['#F5F5DC', '#1B3A6B', '#B3262E', '#E8C84A'],
  },
  {
    id: 'blended', name: 'Blended', psdGroup: 'blended-any-2-colors',
    rows: [{ name: 'Top' }, { name: 'Bottom' }],
    layers: [
      { file: 'opaque-vinyl.png', neutral: true },
      { file: 'bottom-color.png', color: 1 },
      { file: 'top-color.png', color: 0 },
    ],
    example: ['#FF69B4', '#00BFFF'],
  },
  {
    id: 'galaxy', name: 'Galaxy', psdGroup: 'galaxy-any-2-colors-high-contrast-works-best',
    rows: [], gradient: { stops: ['Color 1', 'Color 2'] },
    layers: [{ file: 'black-will-consume-other-dark-colors.png', gradient: true }],
    hints: ['High contrast works best — black will consume other dark colors.'],
    example: ['#1A1A2E', '#7A3FA0'],
  },
  {
    id: 'marble', name: 'Marble', psdGroup: 'marble-opaque-base-opaque-marble',
    rows: [], gradient: { stops: ['Color 1', 'Color 2'] },
    layers: [{ file: 'marble-texture.png', gradient: true }],
    example: ['#F5F5F0', '#6E6E73'],
  },
  {
    // Andrew's glitter layer (Aug 20 2026): one texture, gradient-mapped so
    // the press picks the vinyl color AND the glitter color.
    id: 'glitter', name: 'Glitter', psdGroup: 'glitter-any-color-w-glitter',
    // Highlight stop at 90% — matches Andrew's PSD Gradient Map 5 editor.
    rows: [], gradient: { stops: ['Vinyl', 'Glitter'], locations: [0.2, 0.9] },
    layers: [{ file: 'glitter-texture.png', gradient: true }],
    hints: ['The sparkle field takes the Glitter color — light flecks read strongest against a darker vinyl.'],
    example: ['#12303B', '#E8C84A'],
  },
  {
    // Andrew's metallic layer (Aug 20 2026): standard gradient map — darks
    // at 0, highlights at 100, no custom stop positions.
    id: 'metallic', name: 'Metallic Blend', psdGroup: 'metallic-blend',
    rows: [], gradient: { stops: ['Vinyl', 'Metallic'] },
    layers: [{ file: 'metallic-texture.png', gradient: true }],
    hints: [],
    example: ['#6E6E73', '#F2F2F5'],
  },
  {
    // Andrew's Double Double layer — same standard gradient map as
    // Metallic Blend: darks take the vinyl color, highlights the second.
    // (Aug 20 2026.)
    id: 'doubledouble', name: 'Double Double', psdGroup: 'double-double',
    rows: [], gradient: { stops: ['Vinyl', 'Double'] },
    layers: [{ file: 'double-double-texture.png', gradient: true }],
    hints: ['The marbling takes the Double color in the highlights — the vinyl color holds the body.'],
    example: ['#4A3728', '#E8DCC8'],
  },
  {
    id: 'splatter', name: 'Splatter', psdGroup: 'splatter-any-color-base-opaque-splatters',
    rows: [{ name: 'Base' }],
    eitherOrBase: { opaque: 'opaque-vinyl.png', translucent: 'translucent-vinyl.png' },
    splatter: { files: ['splatter-one.png', 'splatter-two.png', 'splatter-three.png'], default: 3 },
    layers: [
      { baseEither: true, color: 0 },
      { splatterSlot: 0 }, { splatterSlot: 1 }, { splatterSlot: 2 },
    ],
    example: ['#C81E38', '#F5F5DC', '#E8C84A', '#1A1A2E'],
  },
];

const genStyleById = (id: string) => GEN_STYLES.find((s) => s.id === id) ?? GEN_STYLES[0];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const hexToRgb01 = (hex: string): [number, number, number] => {
  const h = HEX_RE.test(hex) ? hex : '#C7C7CC';
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
};

/** The color rows the sheet shows for a style at a given splatter count. */
const genRowNames = (s: GenStyleDef, spl: number, extraStops = 0): string[] => [
  ...s.rows.map((r) => r.name),
  // Stops read numerically — "Color 1", "Color 2", … (Andrew, Aug 21 2026);
  // the PSD's own stop names stay in the data, not the labels.
  ...(s.gradient ? Array.from({ length: s.gradient.stops.length + extraStops }, (_, i) => `Color ${i + 1}`) : []),
  ...Array.from({ length: s.splatter ? spl : 0 }, (_, i) => `Splatter ${i + 1}`),
];

/** Everything a saved generator color carries — enough to re-render and re-edit. */
type GenColorSpec = {
  styleId: string;
  colors: string[];
  option?: string;
  splatterCount?: number;
  baseKind?: 'opaque' | 'translucent';
  /** Advanced Gradient (Andrew, Aug 21 2026): per-stop ramp positions (0–1),
      one per gradient stop. Absent = the style's own default locations. */
  locations?: number[];
};

// One PSD stencil layer, tinted: the PNG's alpha is the mask, the hex is flat.
function GenTint({ src, color, opacity, blend }: { src: string; color: string; opacity?: number; blend?: React.CSSProperties['mixBlendMode'] }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, backgroundColor: color, opacity, mixBlendMode: blend,
        maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`,
        maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
        maskPosition: 'center', WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
      }}
    />
  );
}

// Gradient-map layer — luminance → per-channel table ramp, the SVG twin of
// the PSD's Gradient Map adjustment clips (Cloudy, Side A/B, Galaxy, Marble).
function GenGradientMap({ src, stops, locations, opacity }: { src: string; stops: string[]; locations?: number[]; opacity?: number }) {
  const rawId = useId();
  const id = `gen-gm-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const rgb = (stops.length >= 2 ? stops : ['#0A0A0A', '#F5F5F7']).map(hexToRgb01);
  // PSD gradient maps put stops at LOCATIONS (Andrew's Cloudy: 13 / 87), so
  // the ends clamp to pure stop colors and the ramp between is steeper. A
  // plain feFuncR table spreads stops evenly 0→1, so when locations are
  // given we resample the located ramp into a dense even table.
  const locs = locations && locations.length === rgb.length ? locations : rgb.map((_, i) => i / Math.max(rgb.length - 1, 1));
  const SAMPLES = 33;
  const sample = (ch: number, t: number) => {
    if (t <= locs[0]) return rgb[0][ch];
    for (let i = 1; i < locs.length; i++) {
      if (t <= locs[i]) {
        const f = (t - locs[i - 1]) / Math.max(locs[i] - locs[i - 1], 1e-6);
        return rgb[i - 1][ch] + (rgb[i][ch] - rgb[i - 1][ch]) * f;
      }
    }
    return rgb[rgb.length - 1][ch];
  };
  const table = (ch: number) =>
    Array.from({ length: SAMPLES }, (_, i) => sample(ch, i / (SAMPLES - 1)).toFixed(4)).join(' ');
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', opacity }} aria-hidden>
      <defs>
        <filter id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={table(0)} />
            <feFuncG type="table" tableValues={table(1)} />
            <feFuncB type="table" tableValues={table(2)} />
          </feComponentTransfer>
        </filter>
      </defs>
      <image href={src} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" filter={`url(#${id})`} />
    </svg>
  );
}

// How far the generated-disc PSD layer stack bleeds past the clipping
// circle (percent inset, negative = oversize). ~1% is enough to push the
// PNGs' antialiased alpha edge outside the clip on every disc size (44px
// thumbnails → 2xx px stage) while being imperceptible on the textures.
const GEN_EDGE_BLEED_INSET = '-1%';

// The generator disc device — identical frame for every style: perfect
// circle, fixed diameter, opaque label always on top, shared shine layer.
// The art inside is Andrew's PSD, layer for layer.
function GenDisc({
  size,
  gen,
  labelRatio,
  holeRatio = 0.018,
  bodyRef,
  ghost,
}: {
  size: number;
  gen: GenColorSpec;
  labelRatio?: number;
  holeRatio?: number;
  bodyRef?: React.Ref<HTMLDivElement>;
  ghost?: boolean;
}) {
  const style = genStyleById(gen.styleId);
  const url = (f: string) => `${GEN_BASE}${style.psdGroup}/${f}`;
  const splCount = style.splatter ? (gen.splatterCount ?? style.splatter.default) : 0;
  // Gradient-map ramps take any number of stops (like the PSD adjustment) —
  // read the actual count from the saved colors, never just the base stops.
  const stopCount = style.gradient
    ? Math.max(style.gradient.stops.length, gen.colors.length - style.rows.length - splCount)
    : 0;
  const splOffset = style.rows.length + stopCount;
  const option = gen.option ?? style.pickOne?.default ?? '';
  const col = (i: number) => (HEX_RE.test(gen.colors[i] ?? '') ? gen.colors[i] : '#c7c7cc');
  let stops = Array.from({ length: stopCount }, (_, i) => col(style.rows.length + i));
  // Advanced Gradient (Andrew, Aug 21 2026): custom stop positions ride on
  // the spec. The luminance table needs them ascending, so sort as pairs.
  let gradLocs = style.gradient?.locations;
  if (gen.locations && gen.locations.length === stops.length) {
    const pairs = stops.map((c, i) => [gen.locations![i], c] as const).sort((a, b) => a[0] - b[0]);
    gradLocs = pairs.map((p) => p[0]);
    stops = pairs.map((p) => p[1]);
  }
  const baseKind = gen.baseKind ?? 'opaque';
  const LABEL_RATIO = labelRatio ?? PSD_LABEL_RATIO;
  const labelSize = size * LABEL_RATIO;
  const labelBg = useLabelBg();
  return (
    <div
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%',
        overflow: 'hidden', flexShrink: 0, backgroundColor: '#ececf0',
        filter: ghost ? 'grayscale(1)' : undefined, opacity: ghost ? 0.3 : 1,
      }}
    >
      {/* Rotating body: the PSD layer stack + the label printed on it */}
      <div ref={bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: bodyRef ? 'transform' : undefined }}>
        {/* Edge bleed (Task #3448): the PSD layers carry an antialiased alpha
            fade at their outer edge; rendered exactly at the clip circle, that
            fade let the light fallback surface underneath read as a pale rim
            on dark backgrounds. Oversizing the whole layer stack ~1% pushes
            the alpha fade OUTSIDE the overflow-hidden circle so the visible
            edge is fully-covered disc color — the circle stays perfectly
            round (the container still clips), no border is added, and the
            fallback keeps acting as the light table behind translucent
            bodies. Plain positioned div: no transform/opacity/isolation, so
            layer mix-blend-modes keep compositing against the base exactly
            as before. */}
        <div aria-hidden style={{ position: 'absolute', inset: GEN_EDGE_BLEED_INSET, pointerEvents: 'none' }}>
        {style.layers.map((L, i) => {
          let file = L.file;
          let color: string | undefined;
          let opacity = L.opacity;
          if (L.baseEither && style.eitherOrBase) {
            file = baseKind === 'translucent' ? style.eitherOrBase.translucent : style.eitherOrBase.opaque;
            if (opacity === undefined && baseKind === 'translucent') opacity = 0.69;
          }
          if (L.transAdjust && baseKind === 'translucent' && opacity === undefined) opacity = 0.69;
          if (L.byOption) {
            const picked = L.byOption[option];
            if (!picked) return null;
            file = picked;
          }
          if (L.splatterSlot !== undefined) {
            if (!style.splatter || splCount <= L.splatterSlot) return null;
            file = style.splatter.files[L.splatterSlot];
            color = col(splOffset + L.splatterSlot);
          }
          if (!file) return null;
          if (L.gradient) return <GenGradientMap key={i} src={url(file)} stops={stops} locations={gradLocs} opacity={opacity} />;
          if (L.neutral) {
            return (
              <img
                key={i}
                src={url(file)}
                alt=""
                aria-hidden
                draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: opacity ?? 1, mixBlendMode: L.blend }}
              />
            );
          }
          if (color === undefined) color = L.fixedColor ?? col(L.color ?? 0);
          return <GenTint key={i} src={url(file)} color={color} opacity={opacity} blend={L.blend} />;
        })}
        </div>
        {/* Opaque G label — always on top; no source color peeks through. */}
        <div
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: labelSize, height: labelSize, borderRadius: '50%',
            backgroundColor: labelBg, boxShadow: '0 0 0 0.5px rgba(0,0,0,0.4)',
          }}
        >
          <DiscLabelArt size={labelSize} />
        </div>
      </div>
      {/* Fixed shine — composites identically over every style; not a choice. */}
      <div
        style={{
          position: 'absolute', inset: 0, backgroundColor: '#ffffff', opacity: 0.6,
          maskImage: `url(${LAYERS.highlights})`, WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat', pointerEvents: 'none',
        }}
      />
      {/* Spindle hole */}
      <div
        style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: size * (holeRatio ?? 0.018), height: size * (holeRatio ?? 0.018), borderRadius: '50%',
          backgroundColor: DISC_HOLE_FILL, boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)', pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// Measured from the PSD PNGs themselves: the A/B texture label holes are cut
// at a 0.1757 radius fraction, so the real label diameter is ~0.3514 of the
// disc. 0.3550 tucks the art a hair under the label edge — flush, no gap
// ring. (Andrew, Aug 20 2026.)
const PSD_LABEL_RATIO = 0.355;

// Four size contexts — identical disc diameter, only label ratio + hole vary.
const GEN_SIZE_CONTEXTS = [
  { id: '12', label: '12″', labelRatio: PSD_LABEL_RATIO, holeRatio: 0.018, scale: 1 },
  { id: '10', label: '10″', labelRatio: 0.42, holeRatio: 0.02, scale: 10 / 12 },
  { id: '7', label: '7″', labelRatio: 0.48, holeRatio: 0.024, scale: 7 / 12 },
] as const;

// ─── Color picker popover (Andrew's macOS Color Fill reference) ──────
// Wheel / Spectrum / Sliders / Swatches tabs, apple-canon styled. The
// eyedropper lives in the picker footer.

// Eyedropper source (run-sheet Must-work, Aug 23 2026): the eyedropper
// samples from the press's UPLOADED REFERENCE PHOTO — not the browser
// screen pick. The handoff tsx used the EyeDropper API; the Must-work list
// wins (divergence flagged in the task summary). Screen pick survives only
// as the fallback when there is no photo to sample from.
const PhotoSampleCtx = createContext<string | null>(null);

/** Click-to-sample panel: the reference photo on a canvas, one tap = one
    pixel. Opens inside the picker in place of the tabs. */
function PhotoSamplePanel({ src, onPick, onClose, t }: { src: string; onPick: (hex: string) => void; onClose: () => void; t: Theme }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      const c = canvasRef.current;
      if (!c) return;
      const scale = Math.min(1, 280 / el.naturalWidth);
      c.width = Math.max(1, Math.round(el.naturalWidth * scale));
      c.height = Math.max(1, Math.round(el.naturalHeight * scale));
      c.getContext('2d')?.drawImage(el, 0, 0, c.width, c.height);
    };
    el.onerror = () => setFailed(true);
    el.src = src;
  }, [src]);
  return (
    <div data-testid="gen-picker-photo-sample">
      <p className="text-xs" style={{ color: t.subink, margin: "2px 0 8px" }}>
        Tap their photo to sample a color.
      </p>
      {failed ? (
        <p className="text-xs" style={{ color: t.subink }}>The photo could not be loaded for sampling.</p>
      ) : (
        <canvas
          ref={canvasRef}
          data-testid="gen-photo-sample-canvas"
          style={{ width: '100%', borderRadius: 12, cursor: 'crosshair', display: 'block', border: `1px solid ${t.hairline}` }}
          onPointerDown={(e) => {
            const c = canvasRef.current;
            if (!c) return;
            const r = c.getBoundingClientRect();
            const x = Math.min(c.width - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * c.width)));
            const y = Math.min(c.height - 1, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * c.height)));
            try {
              const d = c.getContext('2d')?.getImageData(x, y, 1, 1).data;
              if (d) onPick(rgbArrToHex(d[0], d[1], d[2]));
            } catch {
              setFailed(true);
            }
          }}
        />
      )}
      <button
        type="button"
        onClick={onClose}
        data-testid="gen-photo-sample-back"
        className="rounded-full text-[12.5px] font-semibold"
        style={{ marginTop: 10, padding: '7px 12px', border: `1px solid ${t.hairline}`, background: 'transparent', color: t.subink, cursor: 'pointer' }}
      >
        Back to the picker
      </button>
    </div>
  );
}

function hexToRgbArr(hex: string): [number, number, number] {
  const h = HEX_RE.test(hex) ? hex : '#C7C7CC';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbArrToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}
// ─── Match from their photo (Andrew, Aug 21 2026) ────────────────────
// Pull the dominant colors straight out of the press's disc photo so a
// rebuild starts from THEIR colors, not a guess. Sampling is geometric:
// only pixels on the vinyl itself count — between the label's edge and the
// disc's edge — so the black studio background and the center label never
// pollute the palette. Near-black pixels are skipped too (grooves and
// shadow, not pigment). Style choice stays human: we hand back colors,
// the press picks the stencil.
type DiscAnalysis = {
  palette: string[];   // dominant colors, biggest cluster first
  shares: number[];    // each cluster's fraction of the sampled vinyl
  edge: number;        // mean neighbor-to-neighbor color distance — speckle vs. smooth
};

async function extractDiscPalette(src: string): Promise<DiscAnalysis> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('photo failed to load'));
    el.src = src;
  });
  const S = 96;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return { palette: [], shares: [], edge: 0 };
  ctx2d.drawImage(img, 0, 0, S, S);
  const { data } = ctx2d.getImageData(0, 0, S, S);
  // Quantized buckets accumulate true sums so each chip is the average of
  // its cluster, not the bucket corner.
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const C = S / 2;
  const samples: [number, number, number][] = [];
  let edgeSum = 0, edgeN = 0;
  let prev: [number, number, number] | null = null; // previous accepted pixel in this row
  for (let y = 0; y < S; y++) {
    prev = null;
    for (let x = 0; x < S; x++) {
      const dx = x - C, dy = y - C;
      const rf = Math.sqrt(dx * dx + dy * dy) / S; // radius as fraction of width
      if (rf < 0.24 || rf > 0.46) { prev = null; continue; } // vinyl only
      const i = (y * S + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 200) { prev = null; continue; }
      if (Math.max(r, g, b) < 46) { prev = null; continue; } // groove shadow, not pigment
      if (prev) {
        edgeSum += Math.sqrt((r - prev[0]) ** 2 + (g - prev[1]) ** 2 + (b - prev[2]) ** 2);
        edgeN++;
      }
      prev = [r, g, b];
      samples.push([r, g, b]);
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bk.n++; bk.r += r; bk.g += g; bk.b += b;
      buckets.set(key, bk);
    }
  }
  const ranked = Array.from(buckets.values())
    .sort((p, q) => q.n - p.n)
    .map((bk) => [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n] as [number, number, number]);
  // Greedy pick: biggest clusters first, each far enough from the ones
  // already chosen that five chips never read as one color.
  const picked: [number, number, number][] = [];
  for (const c of ranked) {
    if (picked.length >= 5) break;
    if (picked.every((p) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2 > 52 * 52)) {
      picked.push(c);
    }
  }
  // Shares: every sampled pixel votes for its nearest picked color.
  const counts = picked.map(() => 0);
  for (const s of samples) {
    let best = 0, bestD = Infinity;
    for (let k = 0; k < picked.length; k++) {
      const p = picked[k];
      const d = (p[0] - s[0]) ** 2 + (p[1] - s[1]) ** 2 + (p[2] - s[2]) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    counts[best]++;
  }
  return {
    palette: picked.map((c) => rgbArrToHex(...c)),
    shares: counts.map((n) => (samples.length ? n / samples.length : 0)),
    edge: edgeN ? edgeSum / edgeN : 0,
  };
}

// The style guess — a suggestion, never a decision (Andrew, Aug 21 2026).
// A wrong confident guess is worse than no guess, so the tree is small and
// each branch is explainable: how many colors carry real weight, and does
// the surface read speckled or smooth. The press confirms or switches —
// the human stays the judge.
function suggestDiscStyle(a: DiscAnalysis): { styleId: string; colors: string[] } | null {
  if (a.palette.length === 0) return null;
  type Cl = { rgb: [number, number, number]; share: number };
  const clusters: Cl[] = a.palette
    .map((h, i) => ({ rgb: hexToRgbArr(h), share: a.shares[i] ?? 0 }))
    .sort((p, q) => q.share - p.share);
  const dist = (p: [number, number, number], q: [number, number, number]) =>
    Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
  const satOf = (c: [number, number, number]) => {
    const mx = Math.max(...c); return mx ? (mx - Math.min(...c)) / mx : 0;
  };
  const hueOf = (c: [number, number, number]) => rgbToHsv(c[0], c[1], c[2])[0];
  const hueDiff = (p: [number, number, number], q: [number, number, number]) => {
    const d = Math.abs(hueOf(p) - hueOf(q)) % 360; return d > 180 ? 360 - d : d;
  };

  // Group clusters into PIGMENTS. A metallic gold photographs as three
  // "colors" — light sheen, mid, deep shadow — but a human calls it one
  // pigment, so same-hue clusters merge. A small, distant, saturated
  // cluster is a FLECK (splatter pass), never merged away.
  type Pig = { members: Cl[]; share: number };
  const pigments: Pig[] = [];
  const flecks: Cl[] = [];
  for (const c of clusters) {
    const s = satOf(c.rgb);
    let joined = false;
    for (const p of pigments) {
      const base = p.members[0];
      const d = dist(c.rgb, base.rgb);
      // Small + far from every pigment = a real fleck, not sheen.
      if (c.share < 0.1 && d > 80) continue;
      const hd = hueDiff(c.rgb, base.rgb);
      const bs = satOf(base.rgb);
      const sameHueSheen = hd < 20 && (d <= 80 || (s > 0.3 && bs > 0.3));
      const bothMuted = s < 0.22 && bs < 0.22 && d <= 80;
      if (sameHueSheen || bothMuted) { p.members.push(c); p.share += c.share; joined = true; break; }
    }
    if (joined) continue;
    if (c.share >= 0.12) pigments.push({ members: [c], share: c.share });
    else if (c.share >= 0.005 && s >= 0.35) flecks.push(c); // saturated speck = splatter
    // else: too faint and too gray to claim anything — ignore.
  }
  pigments.sort((p, q) => q.share - p.share);
  // A pigment's color is the share-weighted average of its members —
  // the mid-tone a press would actually mix, not the sheen or the shadow.
  const pigHex = (p: Pig) => {
    const t = p.members.reduce(
      (acc, m) => [acc[0] + m.rgb[0] * m.share, acc[1] + m.rgb[1] * m.share, acc[2] + m.rgb[2] * m.share, acc[3] + m.share],
      [0, 0, 0, 0],
    );
    return rgbArrToHex(t[0] / t[3], t[1] / t[3], t[2] / t[3]);
  };
  if (pigments.length === 0) return null;
  const base = pigHex(pigments[0]);

  // Flecks on one pigment → the true Splatter stencil: base plus up to
  // three splatter passes. Flecks on a split disc → Split + Splatter.
  if (flecks.length > 0) {
    const fx = flecks.map((f) => rgbArrToHex(...f.rgb));
    if (pigments.length === 1) return { styleId: 'splatter', colors: [base, ...fx.slice(0, 3)] };
    return { styleId: 'splitsplatter', colors: [base, pigHex(pigments[1]), ...fx.slice(0, 2)] };
  }
  if (pigments.length === 1) {
    // One pigment — but is it FLAT or METALLIC? A metallic surface photographs
    // as one hue sweeping a wide lightness range (sheen → shadow). That's
    // Andrew's Metallic Blend gradient: darks take the vinyl color,
    // highlights the metallic. (Andrew, Aug 21 2026 screenshot.)
    const meaningful = pigments[0].members.filter((m) => m.share >= 0.05);
    if (meaningful.length >= 2) {
      const byV = [...meaningful].sort(
        (p, q) => Math.max(...p.rgb) - Math.max(...q.rgb),
      );
      const span = (Math.max(...byV[byV.length - 1].rgb) - Math.max(...byV[0].rgb)) / 255;
      if (span > 0.32) {
        return {
          styleId: 'metallic',
          colors: [rgbArrToHex(...byV[0].rgb), rgbArrToHex(...byV[byV.length - 1].rgb)],
        };
      }
    }
    // Genuinely flat → solid. Near-black gets its own tile.
    const [r, g, b] = hexToRgbArr(base);
    return { styleId: Math.max(r, g, b) < 60 ? 'black' : 'standard', colors: [base] };
  }
  // Two+ pigments, no flecks: smooth swirl reads blended, visible
  // marbling reads marble.
  const second = pigHex(pigments[1]);
  return { styleId: a.edge < 8 ? 'blended' : 'marble', colors: [base, second] };
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let rn = 0, gn = 0, bn = 0;
  if (h < 60) { rn = c; gn = x; } else if (h < 120) { rn = x; gn = c; }
  else if (h < 180) { gn = c; bn = x; } else if (h < 240) { gn = x; bn = c; }
  else if (h < 300) { rn = x; bn = c; } else { rn = c; bn = x; }
  return [(rn + m) * 255, (gn + m) * 255, (bn + m) * 255];
}

const PICKER_SWATCHES: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#000000' }, { name: 'Blue', hex: '#0433FF' },
  { name: 'Brown', hex: '#AA7942' }, { name: 'Cyan', hex: '#00FDFF' },
  { name: 'Green', hex: '#00F900' }, { name: 'Magenta', hex: '#FF40FF' },
  { name: 'Orange', hex: '#FF9300' }, { name: 'Purple', hex: '#942192' },
  { name: 'Red', hex: '#FF2600' }, { name: 'Yellow', hex: '#FFFB00' },
  { name: 'White', hex: '#FFFFFF' },
];

const PICKER_TABS = [
  { id: 'wheel', label: 'Wheel' }, { id: 'spectrum', label: 'Spectrum' },
  { id: 'sliders', label: 'Sliders' }, { id: 'swatches', label: 'Swatches' },
] as const;
type PickerTab = typeof PICKER_TABS[number]['id'];

function GenColorPicker({
  value, onChange, onClose, t, anchor,
}: {
  value: string; onChange: (hex: string) => void; onClose: () => void; t: Theme;
  /** With centerX set, the popup centers on that x and prefers to sit ABOVE
      the anchor (clearing the stop's hex box) — ramp-chip behavior
      (Andrew, Aug 21 2026). */
  anchor: { top: number; bottom: number; right: number; centerX?: number };
}) {
  const [tab, setTab] = useState<PickerTab>('wheel');
  // Photo-first eyedropper (run-sheet Must-work): sample from the uploaded
  // reference photo when one exists; screen pick is only the fallback.
  const samplePhoto = useContext(PhotoSampleCtx);
  const [sampling, setSampling] = useState(false);
  const seed = HEX_RE.test(value) ? value : '#319ED8';
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(...hexToRgbArr(seed)));
  const lastEmitted = useRef(seed.toUpperCase());
  // What the row held when the picker opened — Cancel restores it.
  const openedWith = useRef(HEX_RE.test(value) ? value.toUpperCase() : '');

  // Resync when the hex field is edited outside the picker.
  useEffect(() => {
    if (HEX_RE.test(value) && value.toUpperCase() !== lastEmitted.current) {
      setHsv(rgbToHsv(...hexToRgbArr(value)));
      lastEmitted.current = value.toUpperCase();
    }
  }, [value]);

  const commit = (next: [number, number, number]) => {
    setHsv(next);
    const hex = rgbArrToHex(...hsvToRgb(...next));
    lastEmitted.current = hex;
    onChange(hex);
  };
  const rgb = hsvToRgb(...hsv).map((n) => Math.round(n)) as [number, number, number];
  const curHex = rgbArrToHex(...rgb);
  const hueHex = rgbArrToHex(...hsvToRgb(hsv[0], 1, 1));

  // Shared pointer-drag helper: call fn with pointer coords on down + move.
  const dragHandler = (fn: (e: React.PointerEvent, el: HTMLDivElement) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      fn(e, e.currentTarget);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 1) fn(e, e.currentTarget);
    },
  });

  const WHEEL = 168;
  const wheelPick = (e: React.PointerEvent, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const sat = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (r.width / 2));
    commit([hue, sat, hsv[2]]);
  };
  const wheelDot = (() => {
    const rad = hsv[0] * Math.PI / 180, dist = hsv[1] * (WHEEL / 2);
    return { left: WHEEL / 2 + Math.cos(rad) * dist, top: WHEEL / 2 + Math.sin(rad) * dist };
  })();

  const SPEC_W = 280, SPEC_H = 150;
  const spectrumPick = (e: React.PointerEvent, el: HTMLDivElement) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const hue = x * 360;
    if (y < 0.5) commit([hue, y / 0.5, 1]);
    else commit([hue, 1, 1 - (y - 0.5) / 0.5]);
  };
  const specDot = (() => {
    const x = (hsv[0] / 360) * SPEC_W;
    const y = hsv[2] >= 1 - 1e-6 || hsv[1] < 1 - 1e-6
      ? (hsv[1] * 0.5) * SPEC_H
      : (0.5 + (1 - hsv[2]) * 0.5) * SPEC_H;
    return { left: x, top: y };
  })();

  const setChannel = (i: 0 | 1 | 2, v: number) => {
    const next: [number, number, number] = [...rgb] as [number, number, number];
    next[i] = v;
    const hex = rgbArrToHex(...next);
    lastEmitted.current = hex;
    setHsv(rgbToHsv(...next));
    onChange(hex);
  };
  const channelTrack = (i: 0 | 1 | 2) => {
    const lo = [...rgb] as [number, number, number]; lo[i] = 0;
    const hi = [...rgb] as [number, number, number]; hi[i] = 255;
    return `linear-gradient(to right, ${rgbArrToHex(...lo)}, ${rgbArrToHex(...hi)})`;
  };

  const dot = (pos: { left: number; top: number }) => (
    <div
      style={{
        position: 'absolute', left: pos.left, top: pos.top, width: 16, height: 16,
        transform: 'translate(-50%, -50%)', borderRadius: '50%', pointerEvents: 'none',
        border: '2px solid #ffffff', boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.3)',
        backgroundColor: curHex,
      }}
    />
  );

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onClose} aria-hidden />
      <div
        data-testid="gen-picker"
        className="rounded-2xl overflow-y-auto"
        style={{
          // Fixed positioning so scrollable sheet bodies can't clip us; flip
          // above the button when the viewport runs out of room below.
          position: 'fixed',
          left: anchor.centerX != null
            ? Math.max(12, Math.min(anchor.centerX - 156, window.innerWidth - 12 - 312))
            : Math.max(12, Math.min(anchor.right, window.innerWidth - 12) - 312),
          ...(anchor.centerX != null
            // Centered anchors ALWAYS sit above the stop's hex box — stop,
            // hex input, and modal share one center line; pinned to the top
            // edge rather than ever dropping below (Andrew, Aug 21 2026).
            ? { top: Math.max(12, anchor.top - 56 - Math.min(430, window.innerHeight - 24)) }
            : (anchor.bottom + 8 + 430 <= window.innerHeight || anchor.top - 8 - 430 < 12
              ? { top: Math.min(anchor.bottom + 8, window.innerHeight - 12 - Math.min(430, window.innerHeight - 24)) }
              : { top: anchor.top - 8 - 430 })),
          maxHeight: Math.min(430, window.innerHeight - 24),
          zIndex: 61, width: 312, padding: 16,
          backgroundColor: t.card, border: `1px solid ${t.hairline}`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {sampling && samplePhoto ? (
          <PhotoSamplePanel
            src={samplePhoto}
            onPick={(hex) => {
              lastEmitted.current = hex;
              setHsv(rgbToHsv(...hexToRgbArr(hex)));
              onChange(hex);
              setSampling(false);
            }}
            onClose={() => setSampling(false)}
            t={t}
          />
        ) : (
        <>
        <GenSegmented
          options={PICKER_TABS.map((p) => ({ id: p.id, label: p.label }))}
          value={tab}
          onChange={(id) => setTab(id as PickerTab)}
          t={t}
          testPrefix="gen-picker-tab"
          compact
        />

        {tab === 'wheel' && (
          <div className="flex flex-col items-center" style={{ marginTop: 14, gap: 14 }}>
            <div
              {...dragHandler(wheelPick)}
              style={{
                position: 'relative', width: WHEEL, height: WHEEL, borderRadius: '50%', cursor: 'crosshair',
                background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0) 72%), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                filter: `brightness(${0.35 + hsv[2] * 0.65})`,
              }}
            >
              {dot(wheelDot)}
            </div>
            <div
              {...dragHandler((e, el) => {
                const r = el.getBoundingClientRect();
                commit([hsv[0], hsv[1], Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))]);
              })}
              style={{
                position: 'relative', width: '100%', height: 18, borderRadius: 9, cursor: 'pointer',
                background: `linear-gradient(to right, #000000, ${rgbArrToHex(...hsvToRgb(hsv[0], hsv[1], 1))})`,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.10)',
              }}
            >
              <div
                style={{
                  position: 'absolute', left: `${hsv[2] * 100}%`, top: '50%', width: 14, height: 14,
                  transform: 'translate(-50%, -50%)', borderRadius: '50%', pointerEvents: 'none',
                  backgroundColor: '#ffffff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          </div>
        )}

        {tab === 'spectrum' && (
          <div
            {...dragHandler(spectrumPick)}
            className="rounded-xl overflow-hidden"
            style={{
              position: 'relative', width: SPEC_W, height: SPEC_H, marginTop: 14, cursor: 'crosshair',
              background: 'linear-gradient(to bottom, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,1) 100%), linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
            }}
          >
            {dot(specDot)}
          </div>
        )}

        {tab === 'sliders' && (
          <div className="flex flex-col" style={{ marginTop: 14, gap: 12 }}>
            {(['Red', 'Green', 'Blue'] as const).map((label, i) => (
              <div key={label}>
                <div className="flex items-center justify-between" style={{ marginBottom: 5 }}>
                  <span className="text-[12px] font-medium" style={{ color: t.subink }}>{label}</span>
                  <span className="text-[12px] tabular-nums" style={{ color: t.ink }}>{rgb[i]}</span>
                </div>
                <div
                  {...dragHandler((e, el) => {
                    const r = el.getBoundingClientRect();
                    setChannel(i as 0 | 1 | 2, Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 255));
                  })}
                  data-testid={`gen-picker-slider-${label.toLowerCase()}`}
                  style={{
                    position: 'relative', height: 16, borderRadius: 8, cursor: 'pointer',
                    background: channelTrack(i as 0 | 1 | 2),
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.10)',
                  }}
                >
                  <div
                    style={{
                      // Thumb travel insets by its own radius — at 0 and 255
                      // it kisses the track's ends instead of hanging off.
                      position: 'absolute', left: `calc(7px + ${(rgb[i] / 255)} * (100% - 14px))`, top: '50%', width: 14, height: 14,
                      transform: 'translate(-50%, -50%)', borderRadius: '50%', pointerEvents: 'none',
                      backgroundColor: '#ffffff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'swatches' && (
          <div className="flex flex-col overflow-y-auto" style={{ marginTop: 14, maxHeight: 196, gap: 2 }}>
            {PICKER_SWATCHES.map((s) => {
              const active = curHex === s.hex;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => {
                    // See it, click it, done — the pick closes the picker.
                    // (Bill, Aug 20 2026.)
                    lastEmitted.current = s.hex;
                    onChange(s.hex);
                    onClose();
                  }}
                  data-testid={`gen-picker-swatch-${s.name.toLowerCase()}`}
                  className="flex items-center gap-3 rounded-lg text-left"
                  style={{
                    padding: '6px 8px', border: 'none', cursor: 'pointer',
                    backgroundColor: active ? t.soft : 'transparent',
                  }}
                >
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, backgroundColor: s.hex,
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                    }}
                  />
                  <span className="text-[13px] font-medium flex-1" style={{ color: t.ink }}>{s.name}</span>
                  {active && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: t.subink }} />}
                </button>
              );
            })}
          </div>
        )}
        </>
        )}

        {/* The hex already reads out beside the row name, so the footer is
            just the two honest actions. (Bill, Aug 20 2026.) */}
        <div
          className="flex items-center gap-2"
          style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.hairline}` }}
        >
          <div
            style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0, backgroundColor: curHex,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
            }}
          />
          {/* Eyedropper (run-sheet Must-work, Aug 23 2026): samples from the
              press's uploaded reference photo. Screen pick (EyeDropper API)
              is only the fallback when no photo exists to sample from. */}
          <button
            type="button"
            onClick={async () => {
              if (samplePhoto) {
                setSampling(true);
                return;
              }
              const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
              if (!ED) {
                alert('Screen color picking needs Chrome or Edge — this browser does not support it.');
                return;
              }
              try {
                const { sRGBHex } = await new ED().open();
                const hex = sRGBHex.toUpperCase();
                lastEmitted.current = hex;
                setHsv(rgbToHsv(...hexToRgbArr(hex)));
                onChange(hex);
              } catch {
                // Esc — the press changed their mind; nothing happens.
              }
            }}
            aria-label={samplePhoto ? 'Pick a color from their photo' : 'Pick a color from the screen'}
            title={samplePhoto ? 'Pick a color from their photo' : 'Pick a color from the screen'}
            data-testid="gen-picker-eyedropper"
            className="rounded-full"
            style={{
              width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${t.hairline}`, background: 'transparent', color: t.subink, cursor: 'pointer',
            }}
          >
            <Pipette className="w-3.5 h-3.5" />
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              // Put things back the way they were, then leave.
              if (openedWith.current !== curHex) onChange(openedWith.current);
              onClose();
            }}
            data-testid="gen-picker-cancel"
            className="rounded-full text-[12.5px] font-semibold"
            style={{ padding: '7px 12px', border: 'none', background: 'transparent', color: t.subink, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            data-testid="gen-picker-select"
            className="rounded-full text-[12.5px] font-semibold"
            style={{ padding: '7px 16px', border: 'none', background: t.blue, color: '#ffffff', cursor: 'pointer' }}
          >
            Select
          </button>
        </div>
      </div>
    </>
  );
}

// One color-assignment row: chip + hex field + eyedropper. Invalid hex is an
// inline error — never a silent fallback. Hover/focus reveals the exact hex.
// When a style's base finish is fixed by the PSD (no chooser), say so — a
// quiet caption under the row name, derived from the layer file itself so it
// can never drift from the render. (Andrew, Aug 20 2026.)
function genRowFinishNote(style: GenStyleDef, rowIdx: number): string | undefined {
  if (style.eitherOrBase && rowIdx === 0) return undefined; // press picks — segmented already says it
  const L = style.layers.find((l) => l.color === rowIdx && l.file);
  if (!L?.file) return undefined; // byOption rows have a chooser of their own
  if (L.file.includes('translucent-vinyl')) return 'Translucent';
  if (L.file.includes('ultra-clear-vinyl')) return 'Ultra clear';
  if (L.file.includes('opaque-vinyl')) return 'Opaque';
  return undefined;
}

// The row rests quiet (Bill, Aug 20 2026): the circle, the name, and — once a
// color is accepted — its hex in gray. One fixed slot right of the name does
// all the work: hover swaps the gray readout for the hex box in the SAME spot
// (paste and go, nothing jumps); accepting swaps it back. No eyedropper — the
// ball IS the color. Clicking the circle still opens the full picker.
function GenColorRow({
  name, note, value, onChange, t,
}: { name: string; note?: string; value: string; onChange: (v: string) => void; t: Theme }) {
  const valid = HEX_RE.test(value);
  const empty = value === '';
  const [editing, setEditing] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; bottom: number; right: number } | null>(null);
  const hexRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) hexRef.current?.focus(); }, [editing]);
  const testSlug = name.toLowerCase().replace(/\s+/g, '-');

  const openFrom = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setEditing(true);
    setPickerAnchor({ top: r.top, bottom: r.bottom, right: r.right });
  };
  // "The choice is made and I accept it" — picker dismiss ends the edit.
  const accept = () => {
    setPickerAnchor(null);
    setEditing(false);
  };

  return (
    <div>
      <div className="group/hexrow flex items-center gap-3" style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={(e) => (editing ? accept() : openFrom(e.currentTarget))}
          aria-label={valid ? `Change the ${name} color` : `Choose the ${name} color`}
          title={valid ? value.toUpperCase() : 'Choose a color'}
          data-testid={`gen-color-open-${testSlug}`}
          className="focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 rounded-full"
          style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0, padding: 0, cursor: 'pointer',
            backgroundColor: valid ? value : 'transparent',
            border: valid ? '1px solid rgba(0,0,0,0.12)' : `1.5px dashed ${t.dashedBorder}`,
            boxShadow: valid ? 'inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -2px 3px rgba(0,0,0,0.18)' : undefined,
          }}
        />
        <button
          type="button"
          onClick={(e) => (editing ? accept() : openFrom(e.currentTarget))}
          className="focus:outline-none text-left"
          style={{ minWidth: 92, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span className="text-[13px] font-medium" style={{ color: t.ink }}>{name}</span>
          {note && (
            <span className="text-[10.5px]" style={{ color: t.faint, marginTop: 1 }}>{note}</span>
          )}
        </button>
        {/* ONE slot, two faces: gray readout at rest, hex box on hover /
            while choosing — same spot, nothing jumps. */}
        <div style={{ position: 'relative', width: 118, height: 32, flexShrink: 0 }}>
          <input
            ref={hexRef}
            type="text"
            value={value}
            onChange={(e) => {
              // The "#" is our job, not the user's — prefix it from the first
              // hex character. Non-hex input passes through and errors honestly.
              const raw = e.target.value.trim();
              const bare = raw.replace(/^#/, '');
              onChange(bare === '' ? '' : /^[0-9a-fA-F]{1,6}$/.test(bare) ? `#${bare}` : raw);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && valid) accept(); }}
            placeholder="#1B3A6B"
            spellCheck={false}
            data-testid={`gen-hex-${testSlug}`}
            className={`rounded-full focus:outline-none tabular-nums ${editing ? '' : 'opacity-0 group-hover/hexrow:opacity-100 focus:opacity-100 transition-opacity'}`}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              padding: '0 14px', fontSize: 13, letterSpacing: 0.3,
              border: `1px solid ${!empty && !valid ? t.critical : t.hairline}`,
              backgroundColor: t.searchBg, color: t.ink,
            }}
          />
          {valid && !editing && (
            <span
              className="tabular-nums text-[12.5px] font-normal group-hover/hexrow:opacity-0 transition-opacity"
              data-testid={`gen-hex-readout-${testSlug}`}
              style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: t.faint, letterSpacing: 0.3, pointerEvents: 'none',
              }}
            >
              {value.toUpperCase()}
            </span>
          )}
        </div>
        {editing && pickerAnchor && (
          <GenColorPicker value={value} onChange={onChange} onClose={accept} t={t} anchor={pickerAnchor} />
        )}
      </div>
      {!empty && !valid && (
        <p className="text-[11.5px]" style={{ color: t.critical, marginTop: 5, marginLeft: 42 }}>
          Use a 6-digit hex like #1B3A6B.
        </p>
      )}
    </div>
  );
}

// Shaded-track segmented control (canon): raised thumb, no outline, worded.
function GenSegmented({
  options, value, onChange, t, testPrefix, compact,
}: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void; t: Theme; testPrefix: string; compact?: boolean }) {
  return (
    <div className="inline-flex items-center rounded-full" style={{ padding: 3, backgroundColor: t.soft, gap: 2 }}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            data-testid={`${testPrefix}-${o.id}`}
            className="rounded-full transition-all focus:outline-none"
            style={{
              padding: compact ? '5px 9px' : '6px 14px', fontSize: compact ? 12 : 12.5, fontWeight: active ? 600 : 500,
              color: active ? (t.canvas === '#f5f5f7' ? '#1d1d1f' : t.ink) : t.subink,
              backgroundColor: active ? (t.canvas === '#f5f5f7' ? '#ffffff' : '#3a3a3e') : 'transparent',
              border: 'none', cursor: 'pointer',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Advanced Gradient ramp editor (Andrew, Aug 21 2026) ─────────────
// Illustrator's gradient bar, in the house style: a rounded ramp preview,
// draggable stop chips beneath it, and the selected stop's normal color row
// under that. Click an empty spot on the ramp to add a stop (up to the
// PSD's five). Positions live per color, so the disc re-ramps live.
// Bare hex box for the advanced-gradient ramp: no circle, no name — the
// chip itself is the swatch, so only the number rides above it
// (Andrew, Aug 21 2026).
function GenStopHex({ value, onChange, t }: { value: string; onChange: (v: string) => void; t: Theme }) {
  const valid = HEX_RE.test(value);
  const empty = value === '';
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => {
        const raw = e.target.value.trim();
        const bare = raw.replace(/^#/, '');
        onChange(bare === '' ? '' : /^[0-9a-fA-F]{1,6}$/.test(bare) ? `#${bare}` : raw);
      }}
      placeholder="#1B3A6B"
      spellCheck={false}
      data-testid="gen-stop-hex"
      className="rounded-full focus:outline-none tabular-nums"
      style={{
        width: 118, height: 32, padding: '0 14px', fontSize: 13, letterSpacing: 0.3,
        border: `1px solid ${!empty && !valid ? t.critical : t.hairline}`,
        backgroundColor: t.searchBg, color: t.ink, textAlign: 'center',
      }}
    />
  );
}

function GenGradientRamp({
  colors, locs, selected, onSelect, onMove, onAddAt, onRemove, canRemove, onTap, t, canAdd,
}: {
  colors: string[];
  locs: number[];
  selected: number;
  onSelect: (i: number) => void;
  onMove: (i: number, loc: number) => void;
  onAddAt: (loc: number) => void;
  /** Drag a stop off the ramp to delete it (Andrew, Aug 21 2026). */
  onRemove: (i: number) => void;
  canRemove: (i: number) => boolean;
  /** A tap (no drag) opens the stop's color picker, anchored to the chip
      (Andrew, Aug 21 2026). */
  onTap: (i: number, anchor: { top: number; bottom: number; right: number; centerX?: number }) => void;
  t: Theme;
  canAdd: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragIdx = useRef<number | null>(null);
  const movedRef = useRef(false);
  const downX = useRef(0);
  // Pulled far enough off the ramp that letting go deletes the stop.
  const [dragOff, setDragOff] = useState(false);
  const OFF_PX = 44;
  const swatch = (c: string) => (HEX_RE.test(c) ? c : '#c7c7cc');
  const css = colors
    .map((c, i) => [locs[i] ?? 0, swatch(c)] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([l, c]) => `${c} ${Math.round(l * 100)}%`)
    .join(', ');
  const locFrom = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  return (
    <div>
      <div
        ref={barRef}
        onPointerDown={(e) => {
          if (!canAdd) return;
          onAddAt(locFrom(e.clientX));
        }}
        title={canAdd ? 'Click to add a stop' : undefined}
        style={{
          height: 28, borderRadius: 999, cursor: canAdd ? 'copy' : 'default',
          background: `linear-gradient(90deg, ${css})`,
          border: '1px solid rgba(0,0,0,0.12)',
          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -2px 3px rgba(0,0,0,0.14)',
        }}
      />
      {/* Stop chips — Illustrator's little houses, apple-canon dress.
          Edge chips clamp inward so the first/last never clip (Andrew,
          Aug 21 2026). */}
      <div style={{ position: 'relative', height: 34 }}>
        {colors.map((c, i) => {
          const active = i === selected;
          const valid = HEX_RE.test(c);
          return (
            <button
              key={i}
              type="button"
              aria-label={`Gradient stop ${i + 1}${valid ? ` — ${c.toUpperCase()}` : ''}`}
              data-testid={`gen-ramp-stop-${i}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(i);
                dragIdx.current = i;
                movedRef.current = false;
                downX.current = e.clientX;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (dragIdx.current !== i) return;
                if (Math.abs(e.clientX - downX.current) > 3) movedRef.current = true;
                if (!movedRef.current) return;
                onMove(i, locFrom(e.clientX));
                // Pull it off the ramp to delete (Andrew, Aug 21 2026) —
                // only stops that are allowed to go.
                const r = barRef.current?.getBoundingClientRect();
                if (r && canRemove(i)) {
                  setDragOff(e.clientY < r.top - OFF_PX || e.clientY > r.bottom + OFF_PX);
                }
              }}
              onPointerUp={(e) => {
                const wasOff = dragOff && dragIdx.current === i && canRemove(i);
                const wasTap = !movedRef.current && !wasOff && dragIdx.current === i;
                dragIdx.current = null;
                setDragOff(false);
                if (wasOff) onRemove(i);
                else if (wasTap) {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onTap(i, { top: r.top, bottom: r.bottom, right: r.right, centerX: (r.left + r.right) / 2 });
                }
              }}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              style={{
                position: 'absolute', top: 2, left: `clamp(11px, ${(locs[i] ?? 0) * 100}%, calc(100% - 11px))`,
                transform: 'translateX(-50%)', padding: 0, border: 'none',
                background: 'transparent', cursor: 'grab', touchAction: 'none',
                zIndex: active ? 2 : 1,
                opacity: active && dragOff ? 0.35 : 1,
              }}
            >
              {/* Pointer nose */}
              <span
                aria-hidden
                style={{
                  display: 'block', margin: '0 auto', width: 0, height: 0,
                  borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                  borderBottom: `6px solid ${active ? t.ink : '#ffffff'}`,
                  filter: 'drop-shadow(0 -1px 1px rgba(0,0,0,0.12))',
                }}
              />
              <span
                aria-hidden
                style={{
                  display: 'block', width: 18, height: 18, borderRadius: 4,
                  backgroundColor: valid ? c : 'transparent',
                  border: valid ? `2px solid ${active ? t.ink : '#ffffff'}` : `2px dashed ${t.dashedBorder}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
                }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── The generator sheet — pick a style, assign colors, name & save ──
function GeneratorSheet({
  initial, onClose, onSave, onAddExtra, replaceOf, t, titleLead, titleRest, variant = 'color', lockedStyleId, usedByStyle, styleName, styleCount, styleSwatches, onSwitchStyle, presetStyleId, startSaved, homeCatId, initialFinishes, onFinishesChange, onStyleNameChange,
  styleLevel, initialSizes, onSizesChange,
}: {
  initial: Swatch | null;
  onClose: () => void;
  /** Type flow returns the new style's id so the sheet can keep adding
      colors to it (Bill's one-sitting flow, Aug 20 2026). */
  onSave: (s: Swatch, typeName?: string, offeredFinishes?: string[]) => string | void;
  /** Auto-saves each additional color into the just-created style. */
  onAddExtra?: (catId: string, s: Swatch) => void;
  /** Rebuilding an uploaded-photo color (Bill, Aug 20 2026): the photo slides
      out beside the preview to compare against, and the earned confirm reads
      "Replace" — it swaps the photo swatch for the rebuilt one in place. */
  replaceOf?: Swatch;
  t: Theme;
  titleLead?: string;
  titleRest?: string;
  /** 'type' = the Create-type flow: gallery collapses on pick, name = the
      type's name (prefilled from the style, renamable), save creates the type. */
  variant?: 'type' | 'color';
  /** Set when adding a color inside a generator-made type: no gallery at
      all — only that style's colors (and finish, when it applies). */
  lockedStyleId?: string;
  /** Editing the style's default color = editing the style itself: sizes
      ··· and the style chip show up here too. (Bill, Aug 20 2026.) */
  styleLevel?: boolean;
  initialSizes?: SizeId[];
  onSizesChange?: (sizes: SizeId[]) => void;
  /** The home style's name + live color count for the saved-state header
      when editing/adding inside an existing style. */
  styleName?: string;
  styleCount?: number;
  /** Live colors of the home style — the saved state shows them as chips
      beside "Add color", like the main page. (Bill, Aug 20 2026.) */
  styleSwatches?: Swatch[];
  /** Picking a DIFFERENT style from an edit sheet isn't changing this type —
      it's starting another one. The parent closes this sheet and reopens the
      create flow seeded with the pick. (Bill, Aug 20 2026.) */
  onSwitchStyle?: (styleId: string) => void;
  /** Create flow opened from "Change type": start collapsed on this type. */
  presetStyleId?: string;
  /** Open straight onto the style's saved colors (main-page Add color). */
  startSaved?: boolean;
  homeCatId?: string;
  /** Style-level offered finishes, shared with the main page's Finish bar. */
  initialFinishes?: string[];
  onFinishesChange?: (ids: string[]) => void;
  /** Default-level only: the style's name is editable again here. */
  onStyleNameChange?: (name: string) => void;
  /** styleId → the press's own saved colors for it. Gallery tiles render
      grayscale until the press creates from a style; then they show the
      press's record + an "In catalog" marker (word + icon, never color alone). */
  usedByStyle?: Record<string, NonNullable<Swatch['gen']>>;
}) {
  const initStyle = genStyleById(presetStyleId ?? lockedStyleId ?? initial?.gen?.styleId ?? 'standard');
  const [styleId, setStyleId] = useState(initStyle.id);
  // Type flow starts as a pure style chooser; picking collapses the gallery.
  // Gallery starts open only when there's nothing picked yet (create /
  // rebuild); picking a style collapses it to the summary card, and the
  // "Change type" chip is the way back. (Bill, Aug 20 2026.)
  const [galleryOpen, setGalleryOpen] = useState(!initial && !lockedStyleId && !presetStyleId);
  const [nameTouched, setNameTouched] = useState(!!initial?.name);
  const style = genStyleById(styleId);
  const [option, setOption] = useState<string>(initial?.gen?.option ?? initStyle.pickOne?.default ?? '');
  const [baseKind, setBaseKind] = useState<'opaque' | 'translucent'>(
    initial?.gen?.baseKind ?? (initial?.kind === 'translucent' ? 'translucent' : 'opaque'),
  );
  const [splatterCount, setSplatterCount] = useState<number>(
    initial?.gen?.splatterCount ?? initStyle.splatter?.default ?? 0,
  );
  // Extra gradient-map stops beyond the style's base ramp — the PSD's
  // Gradient Map takes any number; saved colors reopen with theirs intact.
  const [extraStops, setExtraStops] = useState<number>(() => {
    if (!initial?.gen || !initStyle.gradient) return 0;
    const spl = initial.gen.splatterCount ?? initStyle.splatter?.default ?? 0;
    return Math.max(0, initial.gen.colors.length - genRowNames(initStyle, spl).length);
  });
  const rowNames = genRowNames(style, splatterCount, extraStops);
  const [colors, setColors] = useState<string[]>(() => {
    const spl = initial?.gen?.splatterCount ?? initStyle.splatter?.default ?? 0;
    const extra = initial?.gen && initStyle.gradient
      ? Math.max(0, initial.gen.colors.length - genRowNames(initStyle, spl).length)
      : 0;
    const seedNames = genRowNames(initStyle, spl, extra);
    const seed = initial?.gen?.colors ?? [];
    return Array.from({ length: seedNames.length }, (_, i) => seed[i] ?? '');
  });
  const [name, setName] = useState(initial?.name ?? replaceOf?.name ?? (presetStyleId ? initStyle.name : ''));
  // Photo comparison starts tucked away — click to slide it out.
  const [compareOpen, setCompareOpen] = useState(false);
  // Form rule (handoff README): outside clicks never dismiss the sheet;
  // Esc/Cancel/Save close it. Esc handled here, window-level.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Dominant colors pulled from their photo — feeds the "From their photo"
  // strip in the compare drawer. (Andrew, Aug 21 2026.)
  const [photoPalette, setPhotoPalette] = useState<string[]>([]);
  // The suggested style, if the guess was applied — drives the "first
  // guess" caption until the press switches away. (Andrew, Aug 21 2026.)
  const [suggestedStyleId, setSuggestedStyleId] = useState<string | null>(null);
  const suggestionDone = useRef(false);
  // ANY interaction with the sheet (pointer or key) marks it touched — the
  // async photo decode must never replace work the press already started,
  // including a style click or a half-typed hex. (Review, Aug 21 2026.)
  const sheetTouched = useRef(false);
  useEffect(() => {
    let alive = true;
    if (replaceOf?.customImg) {
      extractDiscPalette(replaceOf.customImg)
        .then((a) => {
          if (!alive) return;
          setPhotoPalette(a.palette);
          // Auto-apply the guess ONCE, and only into an untouched sheet —
          // never over work the press already started.
          setColors((prev) => {
            if (!canApplyPhotoSuggestion({ touched: sheetTouched.current, alreadyApplied: suggestionDone.current, lockedStyleId, colors: prev })) return prev;
            suggestionDone.current = true;
            const sug = suggestDiscStyle(a);
            if (!sug) return prev;
            const s = genStyleById(sug.styleId);
            const spl = s.splatter?.default ?? 0;
            setStyleId(s.id);
            setOption(s.pickOne?.default ?? '');
            setSplatterCount(spl);
            setExtraStops(0);
            setGalleryOpen(false);
            setSuggestedStyleId(s.id);
            return Array.from({ length: genRowNames(s, spl).length }, (_, i) => sug.colors[i] ?? '');
          });
        })
        .catch(() => { if (alive) setPhotoPalette([]); });
    } else {
      setPhotoPalette([]);
    }
    return () => { alive = false; };
  }, [replaceOf?.customImg, lockedStyleId]);
  // Drawer photo can expand to the live disc's exact size for a true
  // side-by-side — click the photo to toggle. (Bill, Aug 20 2026.)
  const [compareLarge, setCompareLarge] = useState(false);
  // Type flow only: the first color gets its own name, separate from the type's.
  const [colorName, setColorName] = useState('');
  const [sizeCtx, setSizeCtx] = useState<(typeof GEN_SIZE_CONTEXTS)[number]['id']>('12');
  // "Assign colors to preview" hint shows briefly, then fades. Re-shows when
  // the style changes (fresh context, fresh nudge).
  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    setHintVisible(true);
    const id = window.setTimeout(() => setHintVisible(false), 3500);
    return () => window.clearTimeout(id);
  }, [styleId]);
  // One-sitting create flow (Bill, Aug 20 2026): the first save creates the
  // style and keeps the sheet open; each further color auto-saves into it.
  const [savedCatId, setSavedCatId] = useState<string | null>(startSaved && homeCatId ? homeCatId : null);
  // Which existing color Update writes back to — starts as the one the
  // sheet opened on, retargets when a chip is pulled into the editor.
  const [editId, setEditId] = useState<string | undefined>(initial?.id);
  // Default-level: the style's own name, editable again. (Bill, Aug 20 2026.)
  const [styleNameEdit, setStyleNameEdit] = useState(styleName ?? '');
  const [savedColors, setSavedColors] = useState<Swatch[]>([]);
  const [addingMore, setAddingMore] = useState(false);
  // Add color from the main page drops straight into a fresh color's
  // editor — not the lineup view. (Bill, Aug 20 2026.)
  const startedAdding = useRef(false);
  useEffect(() => {
    if (startSaved && !startedAdding.current) {
      startedAdding.current = true;
      resetColorFields();
      setAddingMore(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSaved]);
  // Availability lives on the STYLE (Bill, Aug 20 2026): the 12/10/7 chip
  // does double duty — hover ··· expands it into offer-toggles.
  const [availMode, setAvailMode] = useState(false);
  // Category sizes carry the ″ mark; the sheet's lens ids don't.
  const [offeredSizeIds, setOfferedSizeIds] = useState<Record<string, boolean>>(() => ({
    '12': !initialSizes || initialSizes.some((s) => s.startsWith('12')),
    '10': !initialSizes || initialSizes.some((s) => s.startsWith('10')),
    '7': !initialSizes || initialSizes.some((s) => s.startsWith('7')),
  }));
  // Offered finishes — style-level, same grammar as sizes. (Bill, Aug 20 2026.)
  const [finishAvailMode, setFinishAvailMode] = useState(false);
  const [offeredFinishIds, setOfferedFinishIds] = useState<Record<string, boolean>>(() => {
    if (!initialFinishes || !initStyle.pickOne) return {};
    const m: Record<string, boolean> = {};
    for (const o of initStyle.pickOne.options) m[o.id] = initialFinishes.includes(o.id);
    return m;
  });

  const pickStyle = (id: string) => {
    if (styleLevel && onSwitchStyle && id !== styleId) {
      // Not an edit of THIS style — the press is selecting another one.
      onSwitchStyle(id);
      return;
    }
    const s = genStyleById(id);
    setStyleId(id);
    setOption(s.pickOne?.default ?? '');
    const spl = s.splatter?.default ?? 0;
    setSplatterCount(spl);
    setExtraStops(0);
    setGradAdvanced(false);
    setStopLocs([]);
    setSelStop(0);
    setColors(Array.from({ length: genRowNames(s, spl).length }, () => ''));
    setGalleryOpen(false);
    if (variant === 'type') {
      // The style's generic name seeds the type name — renamable, never a
      // press-specific example.
      if (!nameTouched) setName(s.name);
      // Fixed styles (Black) have exactly one color and it names itself.
      if (genRowNames(s, spl).length === 0 && !s.gradient) setColorName(s.name);
    }
  };

  const pickSplatterCount = (n: number) => {
    setSplatterCount(n);
    setColors((prev) => Array.from({ length: genRowNames(style, n, extraStops).length }, (_, i) => prev[i] ?? ''));
  };

  // Advanced Gradient (Andrew, Aug 21 2026): a second face for ramp styles.
  // "Gradient" keeps today's two-plus-colors rows; "Advanced Gradient" opens
  // the Illustrator-style bar with draggable stop positions. Positions ride
  // the saved spec, so a color built here reopens the same way.
  const [gradAdvanced, setGradAdvanced] = useState(!!initial?.gen?.locations);
  const [stopLocs, setStopLocs] = useState<number[]>(() => initial?.gen?.locations ?? []);
  const [selStop, setSelStop] = useState(0);

  // "+ Add color" — gradient styles grow the ramp; splatter styles add a pass.
  // Fixed-layer styles can't take more (the PSD has no layer for it).
  const baseStopCount = style.gradient?.stops.length ?? 0;
  const stopEnd = style.rows.length + baseStopCount + extraStops; // colors index after the last stop
  const canAddStop = !!style.gradient && baseStopCount + extraStops < 8; // up to 8 (Andrew, Aug 21 2026)
  const canAddSplatter = !style.gradient && !!style.splatter && splatterCount < style.splatter.files.length;
  const addColor = () => {
    if (canAddStop) {
      setExtraStops((e) => e + 1);
      setColors((prev) => { const next = [...prev]; next.splice(stopEnd, 0, ''); return next; });
    } else if (canAddSplatter) {
      pickSplatterCount(splatterCount + 1);
    }
  };
  const removeStop = (idx: number) => {
    setExtraStops((e) => Math.max(0, e - 1));
    setColors((prev) => { const next = [...prev]; next.splice(idx, 1); return next; });
  };
  // Only added ramp stops are removable — base rows and splatters have their
  // own grammar (the Splatter segmented).
  const isRemovableRow = (idx: number) => !!style.gradient && extraStops > 0 && idx >= style.rows.length + baseStopCount && idx < stopEnd;

  // Advanced Gradient derived state: one position per ramp stop. Falls back
  // to the style's own PSD locations, then an even spread.
  const stopCount = baseStopCount + extraStops;
  const effLocs: number[] = stopLocs.length === stopCount
    ? stopLocs
    : style.gradient?.locations && style.gradient.locations.length === stopCount
      ? style.gradient.locations
      : Array.from({ length: stopCount }, (_, i) => stopCount <= 1 ? 0.5 : i / (stopCount - 1));
  const selStopSafe = Math.min(selStop, Math.max(0, stopCount - 1));
  const addStopAt = (loc: number) => {
    if (!canAddStop) return;
    setExtraStops((e) => e + 1);
    setColors((prev) => { const next = [...prev]; next.splice(stopEnd, 0, ''); return next; });
    setStopLocs([...effLocs, loc]);
    setSelStop(stopCount); // the new stop is the last one
  };
  // Remove a ramp stop by index — the X button uses the selected one;
  // drag-off-the-ramp passes its own (Andrew, Aug 21 2026). Only added
  // stops can go; the style's own base stops stay.
  const canRemoveStop = (i: number) => extraStops > 0 && i >= baseStopCount;
  const removeStopAt = (i: number) => {
    if (!canRemoveStop(i)) return;
    removeStop(style.rows.length + i);
    setStopLocs(effLocs.filter((_, j) => j !== i));
    setSelStop((s) => Math.max(0, Math.min(s > i ? s - 1 : s, stopCount - 2)));
  };
  // Tapping a chip opens its picker right at the chip — the row below the
  // ramp is gone (Andrew, Aug 21 2026).
  const [stopPickerAnchor, setStopPickerAnchor] = useState<{ top: number; bottom: number; right: number; centerX?: number } | null>(null);

  // Fixed styles (Black) have no color rows — the record IS the color.
  const fixedStyle = rowNames.length === 0 && !style.gradient;
  const allValid = fixedStyle || (rowNames.length > 0 && rowNames.every((_, i) => HEX_RE.test(colors[i] ?? '')));
  const canSave = allValid && name.trim().length > 0 && (variant !== 'type' || colorName.trim().length > 0);
  // Editing something that already exists? The confirm stays quiet until a
  // change earns it — no check mark, no filled blue, on a pristine sheet.
  // (Bill, Aug 20 2026.) Baseline re-snapshots when Update retargets.
  const editSnapshot = JSON.stringify([name, colors, option, baseKind, splatterCount, styleId, styleNameEdit, offeredSizeIds, offeredFinishIds, gradAdvanced, stopLocs]);
  const editBaseline = useRef<string | null>(null);
  const baselineFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    editBaseline.current = editSnapshot;
    baselineFor.current = editId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);
  const pristineEdit = !!editId && !replaceOf
    && baselineFor.current === editId
    && editBaseline.current === editSnapshot;
  const ctx = GEN_SIZE_CONTEXTS.find((s) => s.id === sizeCtx) ?? GEN_SIZE_CONTEXTS[0];

  // Live preview from the first valid color: assigned layers show their real
  // hex immediately; unassigned layers stay neutral gray until filled in.
  // Ghost (style example) only before ANY color is assigned.
  const anyValid = fixedStyle || colors.some((c) => HEX_RE.test(c ?? ''));
  // Between colors in the one-sitting flow, the preview holds the last saved
  // color instead of dropping back to the ghost.
  const lastSaved = savedColors[savedColors.length - 1];
  const savedPreview = savedCatId && !addingMore && lastSaved?.gen ? lastSaved.gen : null;
  const previewGen: GenColorSpec = savedPreview
    ? { styleId: savedPreview.styleId, colors: savedPreview.colors, option: savedPreview.option, splatterCount: savedPreview.splatterCount, baseKind: savedPreview.baseKind }
    : anyValid
      ? { styleId, colors, option, splatterCount, baseKind, locations: style.gradient && gradAdvanced ? effLocs : undefined }
      : { styleId, colors: style.example, option: style.pickOne?.default, splatterCount: style.splatter?.default, baseKind: 'opaque' };
  const previewGhost = !anyValid && !savedPreview;

  // Style-level availability → the swatch (and the style it creates).
  const offeredSizes = SIZES.filter((s) => offeredSizeIds[s.replace('"', '')]);
  const makeSwatch = (nm: string, id?: string): Swatch => ({
    id: id ?? `gen-${Date.now()}`,
    name: nm,
    // Standard's Finish picker decides the body: Translucent / Ultra clear
    // save as translucent-kind so the finish survives a save round-trip
    // (Task #3451 — MRP's Translucent colors must stay translucent).
    kind: style.eitherOrBase
      ? baseKind
      : style.pickOne?.label === 'Finish' && option !== 'opaque'
        ? 'translucent'
        : 'opaque',
    base: colors.find((c) => HEX_RE.test(c)) ?? style.layers.find((l) => l.fixedColor)?.fixedColor ?? '#1B3A6B',
    sizes: offeredSizes.length > 0 ? offeredSizes : [...SIZES],
    gen: {
      styleId,
      colors: colors.slice(0, rowNames.length),
      option: style.pickOne ? option : undefined,
      splatterCount: style.splatter ? splatterCount : undefined,
      baseKind: style.eitherOrBase ? baseKind : undefined,
      locations: style.gradient && gradAdvanced ? effLocs : undefined,
    },
  });

  const resetColorFields = () => {
    setColors(Array.from({ length: rowNames.length }, () => ''));
    setColorName(fixedStyle ? style.name : '');
  };

  const save = () => {
    if (!canSave) return;
    if (variant === 'type') {
      const sw = makeSwatch(colorName.trim(), initial?.id);
      const offeredFin = style.pickOne?.label === 'Finish'
        ? style.pickOne.options.filter((o) => offeredFinishIds[o.id] !== false).map((o) => o.id)
        : undefined;
      const id = onSave(sw, name.trim(), offeredFin);
      if (typeof id === 'string') {
        // Style created — stay open, offer the "+" for more colors.
        setSavedCatId(id);
        setSavedColors([sw]);
        setAddingMore(false);
        resetColorFields();
      }
      return;
    }
    if (styleLevel && onStyleNameChange && styleNameEdit.trim()) onStyleNameChange(styleNameEdit.trim());
    const sw = makeSwatch(name.trim(), editId);
    const res = onSave(sw);
    if (typeof res === 'string') {
      // Saved into a style — stay in the room and offer the next color.
      // (Bill, Aug 20 2026: Black takes more blacks like any other style.)
      setSavedCatId(res);
      setSavedColors([sw]);
      setAddingMore(false);
      resetColorFields();
    }
  };

  // Each additional color auto-saves the moment it's confirmed — no batch
  // save to lose to an internet outage. (Bill, Aug 20 2026.)
  const canSaveExtra = allValid && colorName.trim().length > 0;
  const saveExtra = () => {
    if (!savedCatId || !canSaveExtra) return;
    const sw = makeSwatch(colorName.trim());
    onAddExtra?.(savedCatId, sw);
    setSavedColors((prev) => [...prev, sw]);
    setAddingMore(false);
    resetColorFields();
  };

  // While the style is saved and no color is being added, the editor rests —
  // only the saved chips, the "+", and Done remain.
  const showEditor = !savedCatId || addingMore;

  // Click a chip to pull that color into the editor — view it, tweak it,
  // Update writes back to the same color. (Bill, Aug 20 2026.)
  const loadChip = (sc: Swatch) => {
    if (!sc.gen) return;
    const spl = sc.gen.splatterCount ?? style.splatter?.default ?? 0;
    setSplatterCount(spl);
    const extra = style.gradient ? Math.max(0, sc.gen.colors.length - genRowNames(style, spl).length) : 0;
    setExtraStops(extra);
    const seedNames = genRowNames(style, spl, extra);
    setColors(Array.from({ length: seedNames.length }, (_, i) => sc.gen!.colors[i] ?? ''));
    if (sc.gen.option) setOption(sc.gen.option);
    if (sc.gen.baseKind) setBaseKind(sc.gen.baseKind);
    setName(sc.name);
    setEditId(sc.id);
    setAddingMore(false);
    setSavedCatId(null);
  };

  return (
    <PhotoSampleCtx.Provider value={replaceOf?.customImg ?? null}>
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: 24 }}
      data-testid="gen-sheet-overlay"
    >
      <div
        style={{ position: 'relative' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDownCapture={() => { sheetTouched.current = true; }}
        onKeyDownCapture={() => { sheetTouched.current = true; }}
      >
      {/* The photo drawer slides out PAST the sheet's left edge — its own
          panel, never squeezing the sheet's insides. (Bill, Aug 20 2026.) */}
      {replaceOf?.customImg && (
        <div
          className="flex flex-col items-center"
          data-testid="gen-compare-drawer"
          style={{
            position: 'absolute', top: '50%', right: 'calc(100% + 18px)',
            transform: compareOpen ? 'translate(0, -50%)' : 'translate(48px, -50%)',
            opacity: compareOpen ? 1 : 0,
            pointerEvents: compareOpen ? 'auto' : 'none',
            transition: 'transform 380ms cubic-bezier(0.32,0.72,0,1), opacity 300ms ease',
            background: t.card, borderRadius: 24, boxShadow: t.popShadowLg,
            padding: '26px 30px 22px',
          }}
        >
          {/* Click the photo to match the live disc's size — true 1:1
              side-by-side. (Bill, Aug 20 2026.) */}
          <button
            type="button"
            onClick={() => setCompareLarge((v) => !v)}
            data-testid="gen-compare-resize"
            aria-label={compareLarge ? 'Shrink their photo' : 'Match the record size'}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: compareLarge ? 'zoom-out' : 'zoom-in', display: 'block' }}
          >
            <div style={{ width: compareLarge ? 340 : 188, height: compareLarge ? 340 : 188, transition: 'width 320ms cubic-bezier(0.32,0.72,0,1), height 320ms cubic-bezier(0.32,0.72,0,1)' }}>
              <VinylDisc size={compareLarge ? 340 : 188} swatch={replaceOf} />
            </div>
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginTop: 12, whiteSpace: 'nowrap' }}>
            Their photo
          </span>
          <span className="text-[11.5px] font-semibold" style={{ color: t.subink, marginTop: 2, whiteSpace: 'nowrap' }}>
            {displayPressColorName(replaceOf.name) ?? 'Current color'}
          </span>
          <span className="text-[11px]" style={{ color: t.faint, marginTop: 6, whiteSpace: 'nowrap' }}>
            {compareLarge ? 'Click to shrink' : 'Click to match the record size'}
          </span>
          {/* From their photo (Andrew, Aug 21 2026): the dominant colors,
              pulled off the vinyl itself — background and label excluded.
              One click drops a color into the next empty row. The style
              stays the press's call; we only hand back the colors. */}
          {photoPalette.length > 0 && (
            <div
              className="flex flex-col items-center"
              data-testid="gen-photo-palette"
              style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.hairline}`, alignSelf: 'stretch' }}
            >
              <span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: t.faint, whiteSpace: 'nowrap' }}>
                From their photo
              </span>
              <div className="flex items-center" style={{ gap: 8, marginTop: 9 }}>
                {photoPalette.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => {
                      setColors((prev) => {
                        const empty = prev.findIndex((c) => !HEX_RE.test(c));
                        const next = [...prev];
                        next[empty === -1 ? next.length - 1 : empty] = hex;
                        return next;
                      });
                    }}
                    title={hex}
                    aria-label={`Use ${hex} from their photo`}
                    data-testid={`gen-photo-color-${hex.slice(1).toLowerCase()}`}
                    className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                    style={{
                      width: 26, height: 26, border: 'none', padding: 0, cursor: 'pointer',
                      backgroundColor: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                    }}
                  />
                ))}
              </div>
              <span className="text-[11px]" style={{ color: t.faint, marginTop: 8, whiteSpace: 'nowrap' }}>
                Click to fill the next empty row
              </span>
            </div>
          )}
        </div>
      )}
      <div
        className="rounded-3xl overflow-hidden flex flex-col"
        style={{ width: 'min(1040px, 96vw)', maxHeight: '90vh', background: t.card, boxShadow: t.popShadowLg }}
      >
        {/* Header */}
        <div className="flex items-start justify-between" style={{ padding: '26px 30px 0' }}>
          <div>
            <div className="tracking-tight" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>
              <span style={{ color: t.ink }}>{titleLead ?? (initial ? 'Edit the color.' : 'Create a vinyl type color.')} </span>
              <span style={{ color: t.faint, fontWeight: 600 }}>{titleRest ?? 'The stencil does the design.'}</span>
            </div>
          </div>
          {/* One dismissal grammar — frosted circled × */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="gen-sheet-close"
            className="inline-flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 32, height: 32, border: `1px solid ${t.hairline}`, background: t.frostedBtnBg,
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: t.subink, cursor: 'pointer',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: preview · controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0, 1fr)', gap: 40, padding: '24px 30px 30px', minHeight: 0 }}>
          {/* LEFT — the live disc */}
          <div className="flex flex-col items-center" style={{ paddingTop: 8 }}>
            {/* The uploaded photo slides out to the left for comparison while
                rebuilding — dial the colors in, then Replace. */}
            {/* Compare lives in the slide-out drawer past the sheet's left
                edge — Otis needs a has-photo flag on the swatch for this.
                (Bill, Aug 20 2026.) */}
            <div className="flex items-center" style={{ gap: 6 }}>
            <div style={{ position: 'relative', width: 340, height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GenDisc
                size={Math.round(340 * ctx.scale)}
                gen={previewGen}
                labelRatio={ctx.labelRatio}
                holeRatio={ctx.holeRatio}
                ghost={previewGhost}
              />
              {previewGhost && (
                // Fades away after a few seconds (Andrew, Aug 20 2026) — the
                // hint earns a glance, then gets out of the record's way.
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ opacity: hintVisible ? 1 : 0, transition: 'opacity 900ms ease' }}
                >
                  <span
                    className="rounded-full text-[12px] font-medium"
                    style={{ padding: '7px 16px', background: t.frostedBtnBg, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', color: t.subink, boxShadow: t.pillShadow }}
                  >
                    Assign colors to preview
                  </span>
                </div>
              )}
            </div>
            </div>
            {/* The guess announces itself as a guess — and disappears the
                moment the press switches styles. (Andrew, Aug 21 2026.) */}
            {suggestedStyleId && styleId === suggestedStyleId && (
              <span
                className="text-[11.5px]"
                data-testid="gen-photo-suggestion"
                style={{ color: t.faint, marginTop: 12, textAlign: 'center' }}
              >
                Suggested from their photo — a first guess. Change anything.
              </span>
            )}
            {replaceOf?.customImg && (
              <button
                type="button"
                onClick={() => setCompareOpen((v) => !v)}
                data-testid="gen-compare-photo"
                className="inline-flex items-center gap-2 rounded-full text-[12.5px] font-semibold transition-colors"
                style={{
                  marginTop: 16, padding: '7px 16px', background: 'transparent',
                  border: `1px solid ${compareOpen ? t.subink : t.dashedBorder}`, color: t.ink, cursor: 'pointer',
                }}
              >
                {compareOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {compareOpen ? 'Hide their photo' : 'Compare their photo'}
              </button>
            )}
            {/* 12/10/7 does double duty (Bill, Aug 20 2026): a viewing lens
                as-is; hover ··· expands it into style-level offer toggles. */}
            {/* Pinned right under the record — never rides the sheet's height.
                (Bill, Aug 20 2026.) */}
            <div className="group/sizes flex items-center justify-center" style={{ marginTop: 22 }}>
              {!availMode ? (
                // The chip stays dead-center under the record; the ··· hangs
                // off to the right in its own absolute lane so it never
                // nudges the chip off axis. (Bill, Aug 20 2026.)
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <GenSegmented
                    options={GEN_SIZE_CONTEXTS.filter((s) => offeredSizeIds[s.id]).map((s) => ({ id: s.id, label: s.label }))}
                    value={sizeCtx}
                    onChange={(id) => setSizeCtx(id as typeof sizeCtx)}
                    t={t}
                    testPrefix="gen-size"
                  />
                  {(variant === 'type' || styleLevel) && (
                    <button
                      type="button"
                      onClick={() => setAvailMode(true)}
                      aria-label="Choose which sizes this type is pressed in"
                      title="Pressed in these sizes"
                      data-testid="gen-size-avail-open"
                      className="inline-flex items-center justify-center rounded-full opacity-0 group-hover/sizes:opacity-100 focus:opacity-100 transition-opacity"
                      style={{
                        position: 'absolute', left: '100%', marginLeft: 10, top: '50%', transform: 'translateY(-50%)',
                        width: 26, height: 26, backgroundColor: t.frostedBtnStrongBg,
                        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                        border: `1px solid ${t.hairline}`, color: t.subink, cursor: 'pointer',
                      }}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                // Same trick in toggle mode: the three chips center under the
                // record, Done hangs off to the right without shifting them.
                <div className="flex items-center gap-2" style={{ position: 'relative' }}>
                  {GEN_SIZE_CONTEXTS.map((s) => {
                    const on = !!offeredSizeIds[s.id];
                    const onlyOne = on && Object.values(offeredSizeIds).filter(Boolean).length === 1;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={onlyOne}
                        onClick={() => {
                          setOfferedSizeIds((prev) => {
                            const next = { ...prev, [s.id]: !on };
                            if (sizeCtx === s.id && on) {
                              const first = GEN_SIZE_CONTEXTS.find((c) => next[c.id]);
                              if (first) setSizeCtx(first.id);
                            }
                            return next;
                          });
                        }}
                        aria-pressed={on}
                        data-testid={`gen-size-avail-${s.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
                        style={{
                          padding: '6px 13px',
                          border: `1px solid ${on ? t.subink : t.hairline}`,
                          background: t.card, color: on ? t.ink : t.faint,
                          cursor: onlyOne ? 'not-allowed' : 'pointer',
                          textDecoration: on ? 'none' : 'line-through',
                        }}
                      >
                        {/* Word + icon, never color alone — eyeballs say
                            shown/hidden. (Bill, Aug 20 2026.) */}
                        {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {s.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setAvailMode(false);
                      onSizesChange?.(SIZES.filter((s) => offeredSizeIds[s.replace('″', '')]));
                    }}
                    data-testid="gen-size-avail-done"
                    className="text-[12.5px] font-semibold rounded-full"
                    style={{
                      position: 'absolute', left: '100%', marginLeft: 4, top: '50%', transform: 'translateY(-50%)',
                      padding: '6px 12px', border: 'none', background: 'transparent', color: t.blue, cursor: 'pointer',
                    }}
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
            {availMode && (
              <p className="text-[11.5px]" style={{ color: t.faint, marginTop: 8, textAlign: 'center' }}>
                Pressed in these sizes — applies to the whole style.
              </p>
            )}
          </div>

          {/* RIGHT — style gallery → constraints → colors → name & save.
              Done lives in a pinned footer on the 12/10/7 baseline; a long
              color list scrolls under it instead of growing the window.
              (Bill, Aug 20 2026.) */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 6, flex: 1 }}>
            {galleryOpen && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
                  {GEN_STYLES.map((s) => {
                    const active = !galleryOpen && s.id === styleId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickStyle(s.id)}
                        aria-pressed={active}
                        data-testid={`gen-style-${s.id}`}
                        className="flex flex-col items-center rounded-2xl transition-all focus:outline-none"
                        style={{
                          padding: '12px 6px 10px', cursor: 'pointer', background: active ? t.selectWash : 'transparent',
                          border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`,
                          margin: active ? 0 : 1, // layout-stable selection ring
                        }}
                      >
                        {(() => {
                          const mine = usedByStyle?.[s.id];
                          return (
                            <>
                              {/* Untouched styles read black & white; once the press
                                  creates from one, the tile shows THEIR record. */}
                              <div style={{ filter: mine ? undefined : 'grayscale(1)', opacity: mine ? 1 : 0.8, transition: 'filter 0.3s, opacity 0.3s' }}>
                                <GenDisc size={56} gen={mine ?? { styleId: s.id, colors: s.example }} />
                              </div>
                              <span className="text-[10.5px] font-medium text-center" style={{ color: active ? t.ink : t.subink, marginTop: 8, lineHeight: 1.25 }}>
                                {s.name}
                              </span>
                              {mine && (
                                <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold" style={{ color: t.blue, marginTop: 3 }}>
                                  <Check style={{ width: 10, height: 10 }} />
                                  In catalog
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Collapsed / locked style — one compact row instead of the grid */}
            {!galleryOpen && (
              <div className="flex items-center gap-3" style={{ padding: '10px 12px', border: `1px solid ${t.hairline}`, borderRadius: 16 }}>
                {/* Mirrors the big preview — ghost until a color is assigned,
                    then your colors. Never the style's stock example. */}
                <GenDisc size={44} gen={previewGen} ghost={previewGhost} />
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>Type</div>
                  <div className="text-[13.5px] font-semibold" style={{ color: t.ink }}>
                    {styleLevel && onStyleNameChange && styleNameEdit.trim() ? styleNameEdit : style.name}
                  </div>
                </div>
                {(!lockedStyleId || styleLevel) && (
                  <button
                    type="button"
                    onClick={() => setGalleryOpen(true)}
                    data-testid="gen-change-style"
                    className="rounded-full text-[12px] font-semibold"
                    style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${t.dashedBorder}`, color: t.ink, cursor: 'pointer' }}
                  >
                    Change type
                  </button>
                )}
              </div>
            )}

            {galleryOpen ? null : (
            <>
            {showEditor && (
            <>
            {/* Constraints — driven from the style data, never hardcoded */}
            {(style.eitherOrBase || style.pickOne || style.splatter) && (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3" style={{ marginTop: 22 }}>
                {style.eitherOrBase && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginBottom: 7 }}>Base</div>
                    <GenSegmented
                      options={[{ id: 'opaque', label: 'Opaque' }, { id: 'translucent', label: 'Translucent' }]}
                      value={baseKind}
                      onChange={(id) => setBaseKind(id as 'opaque' | 'translucent')}
                      t={t}
                      testPrefix="gen-base"
                    />
                  </div>
                )}
                {/* Finish lives on the STYLE — picked once at creation, it
                    carries to every color added after. (Bill, Aug 20 2026.)
                    Like 12/10/7, hover ··· flips the chip into offer-toggles:
                    the press picks which finishes artists get to choose, and
                    clicking a finish renders every color that way. */}
                {/* Finish is a STYLE decision — it only shows (and edits)
                    on the default color's sheet or at creation. Other
                    colors just inherit it. (Bill, Aug 20 2026.) */}
                {style.pickOne && !addingMore && (style.pickOne.label !== 'Finish' || variant === 'type' || styleLevel) && (
                  <div className="group/finish">
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginBottom: 7 }}>{style.pickOne.label}</div>
                    {style.pickOne.label !== 'Finish' || !finishAvailMode ? (
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <GenSegmented
                          options={style.pickOne.options.filter((o) => style.pickOne!.label !== 'Finish' || offeredFinishIds[o.id] !== false)}
                          value={option}
                          onChange={setOption}
                          t={t}
                          testPrefix="gen-pickone"
                        />
                        {style.pickOne.label === 'Finish' && (
                          <button
                            type="button"
                            onClick={() => setFinishAvailMode(true)}
                            aria-label="Choose which finishes artists can pick"
                            title="Offered finishes"
                            data-testid="gen-finish-avail-open"
                            className="inline-flex items-center justify-center rounded-full opacity-0 group-hover/finish:opacity-100 focus:opacity-100 transition-opacity"
                            style={{
                              position: 'absolute', left: '100%', marginLeft: 10, top: '50%', transform: 'translateY(-50%)',
                              width: 26, height: 26, backgroundColor: t.frostedBtnStrongBg,
                              backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                              border: `1px solid ${t.hairline}`, color: t.subink, cursor: 'pointer',
                            }}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2" style={{ position: 'relative', display: 'inline-flex' }}>
                          {style.pickOne.options.map((o) => {
                            const on = offeredFinishIds[o.id] !== false;
                            const isDefault = option === o.id;
                            return (
                              // Same grammar as the main page's ···: name =
                              // set default (star), eye = show/hide, default
                              // always shown. (Bill, Aug 20 2026.)
                              <span
                                key={o.id}
                                className="inline-flex items-center rounded-full text-[12.5px] font-semibold transition-colors"
                                style={{
                                  border: `1px solid ${isDefault ? t.subink : t.hairline}`,
                                  background: t.card, color: on ? t.ink : t.faint,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOption(o.id);
                                    if (!on) setOfferedFinishIds((prev) => ({ ...prev, [o.id]: true }));
                                  }}
                                  aria-pressed={isDefault}
                                  data-testid={`gen-finish-default-${o.id}`}
                                  className="inline-flex items-center gap-1.5"
                                  style={{
                                    padding: '6px 4px 6px 13px', border: 'none', background: 'transparent',
                                    color: 'inherit', cursor: 'pointer', font: 'inherit',
                                    textDecoration: on ? 'none' : 'line-through',
                                  }}
                                >
                                  {/* Word + icon, never color alone */}
                                  {isDefault && <Star className="w-3 h-3" fill="currentColor" />}
                                  {o.label}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDefault}
                                  onClick={() => setOfferedFinishIds((prev) => ({ ...prev, [o.id]: !on }))}
                                  aria-pressed={on}
                                  aria-label={on ? `Hide ${o.label} from artists` : `Show ${o.label} to artists`}
                                  title={isDefault ? 'The default is always shown' : on ? 'Hide from artists' : 'Show to artists'}
                                  data-testid={`gen-finish-avail-${o.id}`}
                                  className={cn('inline-flex items-center justify-center rounded-full transition-colors', isDefault ? '' : t.hoverWashSoft)}
                                  style={{
                                    width: 26, height: 26, padding: 0, marginRight: 5, border: 'none', background: 'transparent',
                                    color: on ? t.subink : t.faint,
                                    cursor: isDefault ? 'not-allowed' : 'pointer',
                                    opacity: isDefault ? 0.35 : 1,
                                  }}
                                >
                                  {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>
                              </span>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setFinishAvailMode(false);
                              onFinishesChange?.(style.pickOne!.options.filter((o) => offeredFinishIds[o.id] !== false).map((o) => o.id));
                            }}
                            data-testid="gen-finish-avail-done"
                            className="text-[12.5px] font-semibold rounded-full"
                            style={{
                              position: 'absolute', left: '100%', marginLeft: 4, top: '50%', transform: 'translateY(-50%)',
                              padding: '6px 12px', border: 'none', background: 'transparent', color: t.blue, cursor: 'pointer',
                            }}
                          >
                            Done
                          </button>
                        </div>
                        <p className="text-[11.5px]" style={{ color: t.faint, marginTop: 8 }}>
                          Click a finish to make it the default — the eye hides it from artists. The default always shows.
                        </p>
                      </>
                    )}
                  </div>
                )}
                {style.splatter && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginBottom: 7 }}>Splatter</div>
                    <GenSegmented
                      options={[{ id: '0', label: 'None' }, ...style.splatter.files.map((_, i) => ({ id: String(i + 1), label: String(i + 1) }))]}
                      value={String(splatterCount)}
                      onChange={(id) => pickSplatterCount(Number(id))}
                      t={t}
                      testPrefix="gen-splatter"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Assign colors — fixed styles (Black) have none to assign */}
            {fixedStyle ? (
              <p className="text-[12.5px]" style={{ color: t.subink, marginTop: 24, lineHeight: 1.5 }}>
                Nothing to assign — Black is the record. Name it and save.
              </p>
            ) : (
            <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
              {/* No "Pick N colors…" heading for gradient styles AT ALL —
                  simple or advanced. The colors speak for themselves
                  (Andrew, Aug 21 2026, asked three times — it stays gone). */}
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>
                {style.gradient ? '' : 'Assign colors'}
              </div>
              {/* Gradient / Advanced Gradient (Andrew, Aug 21 2026): same
                  colors, two grammars — rows, or the Illustrator-style bar
                  with draggable stop positions. */}
              {style.gradient && (
                <GenSegmented
                  compact
                  options={[{ id: 'simple', label: 'Gradient' }, { id: 'advanced', label: 'Advanced Gradient' }]}
                  value={gradAdvanced ? 'advanced' : 'simple'}
                  onChange={(id) => { setGradAdvanced(id === 'advanced'); setSelStop(0); }}
                  t={t}
                  testPrefix="gen-grad-mode"
                />
              )}
            </div>
            )}
            {style.gradient && gradAdvanced && !fixedStyle && (
              <div style={{ marginTop: 14 }}>
                {/* Base rows (e.g. Double Double's Base) keep their normal rows */}
                {rowNames.slice(0, style.rows.length).map((rowName, i) => (
                  <div key={`${style.id}-adv-${rowName}`} style={{ marginBottom: 12 }}>
                    <GenColorRow
                      name={rowName}
                      note={genRowFinishNote(style, i)}
                      value={colors[i] ?? ''}
                      onChange={(v) => setColors((prev) => { const next = [...prev]; next[i] = v; return next; })}
                      t={t}
                    />
                  </div>
                ))}
                {/* Just the hex box above the ramp — no circle, no name —
                    centered over the selected stop; the ramp is inset from
                    the margins so edge stops get room (Andrew, Aug 21 2026). */}
                <div style={{ margin: '0 24px' }}>
                  <div style={{ position: 'relative', height: 32, marginBottom: 12 }}>
                    <div
                      style={{
                        position: 'absolute', top: 0,
                        left: `clamp(35px, ${Math.round((effLocs[selStopSafe] ?? 0) * 100)}%, calc(100% - 35px))`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <GenStopHex
                        value={colors[style.rows.length + selStopSafe] ?? ''}
                        onChange={(v) => setColors((prev) => { const next = [...prev]; next[style.rows.length + selStopSafe] = v; return next; })}
                        t={t}
                      />
                    </div>
                  </div>
                  <GenGradientRamp
                    colors={colors.slice(style.rows.length, stopEnd)}
                    locs={effLocs}
                    selected={selStopSafe}
                    onSelect={setSelStop}
                    onMove={(i, loc) => setStopLocs(effLocs.map((l, j) => (j === i ? loc : l)))}
                    onAddAt={addStopAt}
                    onRemove={removeStopAt}
                    canRemove={canRemoveStop}
                    onTap={(_, anchor) => {
                      // Align the popup to the hex box's real on-screen
                      // center — popup, hex, and stop tag share one axis
                      // (Andrew, Aug 21 2026). Measure after the selection
                      // renders so the hex box has moved to the tapped stop.
                      requestAnimationFrame(() => {
                        const el = document.querySelector('[data-testid="gen-stop-hex"]');
                        if (el) {
                          const r = el.getBoundingClientRect();
                          setStopPickerAnchor({ ...anchor, centerX: (r.left + r.right) / 2 });
                        } else {
                          setStopPickerAnchor(anchor);
                        }
                      });
                    }}
                    t={t}
                    canAdd={canAddStop}
                  />
                </div>
                {/* Tap a chip → the picker opens right there; drag it off the
                    ramp to delete. No row below the ramp (Andrew, Aug 21 2026). */}
                {stopPickerAnchor && (
                  <GenColorPicker
                    value={colors[style.rows.length + selStopSafe] ?? ''}
                    onChange={(v) => setColors((prev) => { const next = [...prev]; next[style.rows.length + selStopSafe] = v; return next; })}
                    onClose={() => setStopPickerAnchor(null)}
                    t={t}
                    anchor={stopPickerAnchor}
                  />
                )}
                {/* Splatter rows stay as rows below the ramp */}
                {rowNames.slice(stopEnd).map((rowName, k) => {
                  const i = stopEnd + k;
                  return (
                    <div key={`${style.id}-adv-${rowName}`} style={{ marginTop: 12 }}>
                      <GenColorRow
                        name={rowName}
                        value={colors[i] ?? ''}
                        onChange={(v) => setColors((prev) => { const next = [...prev]; next[i] = v; return next; })}
                        t={t}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col" style={{ marginTop: 12, gap: 12, display: style.gradient && gradAdvanced ? 'none' : undefined }}>
              {rowNames.map((rowName, i) => (
                <div key={`${style.id}-${rowName}`} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <GenColorRow
                      name={rowName}
                      note={i < style.rows.length ? genRowFinishNote(style, i) : undefined}
                      value={colors[i] ?? ''}
                      onChange={(v) => setColors((prev) => { const next = [...prev]; next[i] = v; return next; })}
                      t={t}
                    />
                  </div>
                  {isRemovableRow(i) && (
                    <button
                      type="button"
                      onClick={() => removeStop(i)}
                      aria-label={`Remove ${rowName}`}
                      data-testid={`gen-remove-color-${i}`}
                      className="inline-flex items-center justify-center rounded-full flex-shrink-0"
                      style={{
                        width: 24, height: 24, border: `1px solid ${t.hairline}`, background: t.frostedBtnBg,
                        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', color: t.subink, cursor: 'pointer',
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {((canAddStop && !(style.gradient && gradAdvanced)) || canAddSplatter) && (
              <button
                type="button"
                onClick={addColor}
                data-testid="gen-add-color"
                className="group flex items-center gap-2 focus:outline-none"
                style={{ marginTop: 12, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full border flex-shrink-0"
                  style={{ width: 20, height: 20, borderColor: t.blue, color: t.blue }}
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                </span>
                <span className="text-[13px] font-semibold" style={{ color: t.blue }}>
                  Add color
                </span>
              </button>
            )}
            {style.hints?.map((h) => (
              <p key={h} className="text-[11.5px]" style={{ color: t.faint, marginTop: 10, lineHeight: 1.5 }}>{h}</p>
            ))}
            </>
            )}

            {/* Name & save */}
            {savedCatId ? (
              // Style saved — tiles that look exactly like the main page's
              // color cards, a dashed card for the next color, and Done at
              // the bottom. Every color is saved the moment it appears.
              // No rule up top. (Bill, Aug 20 2026.)
              <div style={{ marginTop: 26 }}>
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint }}>
                  {styleName ?? name} · {styleCount ?? savedColors.length} {(styleCount ?? savedColors.length) === 1 ? 'color' : 'colors'} saved
                </div>
                {/* Saved colors show as chips like the main page's cards,
                    with the dashed card as the door to the next one.
                    (Bill, Aug 20 2026.) */}
                <div className="flex flex-wrap items-stretch" style={{ gap: 12, marginTop: 12 }}>
                  {/* While a new color is being written, the lineup steps
                      back — just the one being made. (Bill, Aug 20 2026.) */}
                  {!addingMore && (styleSwatches ?? savedColors).map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => loadChip(sc)}
                      data-testid={`gen-saved-color-${sc.id}`}
                      className={cn('rounded-2xl flex flex-col items-center transition-colors focus:outline-none', t.hoverWashSoft)}
                      style={{
                        width: 104, padding: 12, minHeight: 104, justifyContent: 'center', gap: 8,
                        border: `1px solid ${t.hairline}`, background: t.card, cursor: 'pointer',
                      }}
                    >
                      <VinylDisc size={52} swatch={sc} />
                      <span className="text-[11.5px] font-semibold truncate" style={{ color: t.ink, maxWidth: 84 }}>{displayPressColorName(sc.name) ?? '\u00A0'}</span>
                    </button>
                  ))}
                  {!fixedStyle && !addingMore && (
                    <button
                      type="button"
                      onClick={() => { resetColorFields(); setAddingMore(true); }}
                      aria-label="Add another color"
                      data-testid="gen-add-saved-color"
                      className="rounded-2xl flex flex-col items-center gap-2 focus:outline-none transition-all hover:-translate-y-px"
                      style={{
                        width: 104, padding: 12, minHeight: 104, justifyContent: 'center',
                        border: `1.5px dashed ${t.dashedBorder}`, background: 'transparent', cursor: 'pointer',
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center rounded-full"
                        style={{ width: 34, height: 34, border: `1.5px solid ${t.blue}`, color: t.blue }}
                      >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                      <span className="text-[11.5px] font-semibold" style={{ color: t.ink }}>Add color</span>
                    </button>
                  )}
                </div>
                {addingMore ? (
                  <div className="flex items-center gap-3" style={{ marginTop: 18 }}>
                    <input
                      type="text"
                      value={colorName}
                      onChange={(e) => setColorName(e.target.value)}
                      placeholder="Name it — “Sunset Smoke”"
                      data-testid="gen-color-name"
                      className="flex-1 rounded-full focus:outline-none"
                      style={{ padding: '10px 18px', fontSize: 13.5, border: `1px solid ${t.hairline}`, backgroundColor: t.searchBg, color: t.ink }}
                    />
                    <button
                      type="button"
                      onClick={() => { setAddingMore(false); resetColorFields(); }}
                      data-testid="gen-cancel-extra"
                      className="rounded-full text-[13px] font-semibold"
                      style={{ padding: '10px 16px', border: `1px solid ${t.dashedBorder}`, background: 'transparent', color: t.ink, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    {/* The sheet's one filled blue — each color's earned confirm */}
                    <button
                      type="button"
                      onClick={saveExtra}
                      disabled={!canSaveExtra}
                      data-testid="gen-save-extra"
                      className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold transition-opacity"
                      style={{
                        padding: '10px 22px', border: 'none', background: t.blue, color: '#ffffff',
                        cursor: canSaveExtra ? 'pointer' : 'not-allowed', opacity: canSaveExtra ? 1 : 0.45,
                      }}
                    >
                      <Check className="w-4 h-4" />
                      Save color
                    </button>
                  </div>
                ) : null}
              </div>
            ) : variant === 'type' ? (
              <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${t.hairline}` }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginBottom: 7 }}>Type name</div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
                      placeholder="“Cloudy”"
                      data-testid="gen-name"
                      className="w-full rounded-full focus:outline-none"
                      style={{ padding: '10px 18px', fontSize: 13.5, border: `1px solid ${t.hairline}`, backgroundColor: t.searchBg, color: t.ink }}
                    />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginBottom: 7 }}>First color name</div>
                    <input
                      type="text"
                      value={colorName}
                      onChange={(e) => setColorName(e.target.value)}
                      placeholder="“Sunset Smoke”"
                      data-testid="gen-color-name"
                      className="w-full rounded-full focus:outline-none"
                      style={{ padding: '10px 18px', fontSize: 13.5, border: `1px solid ${t.hairline}`, backgroundColor: t.searchBg, color: t.ink }}
                    />
                  </div>
                </div>
                <div className="flex justify-end" style={{ marginTop: 16 }}>
                  {/* The sheet's one filled blue — the earned confirm */}
                  <button
                    type="button"
                    onClick={save}
                    disabled={!canSave}
                    data-testid="gen-save"
                    className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold transition-opacity"
                    style={{
                      padding: '10px 22px', border: 'none', background: t.blue, color: '#ffffff',
                      cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.45,
                    }}
                  >
                    <Check className="w-4 h-4" />
                    Save type
                  </button>
                </div>
              </div>
            ) : (
              <>
              {styleLevel && onStyleNameChange && (
                <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${t.hairline}` }}>
                  <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: t.faint }}>
                      Type name
                    </p>
                    {/* Renamed away from the picker's name? Quiet road back.
                        (Bill, Aug 20 2026.) */}
                    {styleNameEdit.trim() !== style.name && (
                      <button
                        type="button"
                        onClick={() => setStyleNameEdit(style.name)}
                        data-testid="gen-style-name-restore"
                        className="text-[12px] font-medium"
                        style={{ background: 'transparent', border: 'none', color: t.subink, cursor: 'pointer', padding: 0 }}
                      >
                        Restore “{style.name}”
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={styleNameEdit}
                    onChange={(e) => setStyleNameEdit(e.target.value)}
                    placeholder="Type name"
                    aria-label="Type name"
                    data-testid="gen-style-name"
                    className="w-full rounded-full focus:outline-none"
                    style={{ padding: '10px 18px', fontSize: 13.5, border: `1px solid ${t.hairline}`, backgroundColor: t.searchBg, color: t.ink }}
                  />
                </div>
              )}
              <div className="flex items-center gap-3" style={{ marginTop: styleLevel && onStyleNameChange ? 14 : 26, paddingTop: styleLevel && onStyleNameChange ? 0 : 20, borderTop: styleLevel && onStyleNameChange ? 'none' : `1px solid ${t.hairline}` }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameTouched(true); }}
                  placeholder="Name it — “Sunset Smoke”"
                  data-testid="gen-name"
                  className="flex-1 rounded-full focus:outline-none"
                  style={{ padding: '10px 18px', fontSize: 13.5, border: `1px solid ${t.hairline}`, backgroundColor: t.searchBg, color: t.ink }}
                />
                {/* Good with this color? Quiet door to the style's lineup —
                    same chips view Update lands on. (Bill, Aug 20 2026.) */}
                {homeCatId && editId && !replaceOf && (
                  <button
                    type="button"
                    onClick={() => setSavedCatId(homeCatId)}
                    data-testid="gen-view-colors"
                    className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold"
                    style={{
                      padding: '10px 20px', border: `1px solid ${t.hairline}`,
                      background: t.card, color: t.subink, cursor: 'pointer',
                    }}
                  >
                    All colors
                  </button>
                )}
                {/* The sheet's one filled blue — the earned confirm. On a
                    pristine edit it stays a quiet outline pill: no check,
                    no fill, until a change earns it. (Bill, Aug 20 2026.) */}
                <button
                  type="button"
                  onClick={save}
                  disabled={!canSave || pristineEdit}
                  data-testid="gen-save"
                  className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold transition-all"
                  style={pristineEdit ? {
                    padding: '10px 22px', border: `1px solid ${t.hairline}`, background: t.card,
                    color: t.subink, cursor: 'default',
                  } : {
                    padding: '10px 22px', border: 'none', background: t.blue, color: '#ffffff',
                    cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.45,
                  }}
                >
                  {!pristineEdit && <Check className="w-4 h-4" />}
                  {replaceOf ? 'Replace' : editId ? 'Update' : 'Save color'}
                </button>
              </div>
              </>
            )}
            </>
            )}
          </div>
          {savedCatId && !addingMore && (
            <div className="flex justify-end items-end" style={{ paddingTop: 14, paddingRight: 6 }}>
              {/* The sheet's one filled blue — the earned confirm */}
              <button
                type="button"
                onClick={onClose}
                data-testid="gen-done"
                className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold"
                style={{ padding: '10px 22px', border: 'none', background: t.blue, color: '#ffffff', cursor: 'pointer' }}
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
      </div>
    </div>
    </PhotoSampleCtx.Provider>
  );
}

export function PressVinylStylesComponent({
  payload,
  canEdit,
  save,
  saving,
}: {
  payload: PressComponentsPayload;
  canEdit: boolean;
  save: (config: VinylComponentConfig) => void;
  saving: boolean;
}) {
  // Theme rides the admin appearance toggle (light default, charcoal dark).
  const mode: 'light' | 'dark' = useAdminDark() ? 'dark' : 'light';
  const t = THEMES[mode];
  void saving;

  const press = payload.press;
  const PARTNER_NAME = press.name; // shadows the module mock default
  const labelBrand = useMemo(
    () => ({ logoUrl: resolvePressMarkLogo(press), bgColor: press.labelBgColor ?? null }),
    [press],
  );

  // ── Config-backed state, seeded from the payload's vinyl slice ─────
  // Whole blob saved atomically on every mutation (press_components PUT).
  const cfgRef = useRef<VinylComponentConfig>(payload.vinyl);
  const [config, setConfig] = useState<VinylComponentConfig>(payload.vinyl);
  const dirtyRef = useRef(false);
  const pressIdRef = useRef(press.id);
  // Re-seed ONLY when the press identity changes AND there are no unsaved
  // edits (standing rule: local edit vs shared-query re-seed).
  useEffect(() => {
    if (pressIdRef.current !== press.id) {
      pressIdRef.current = press.id;
      dirtyRef.current = false;
      cfgRef.current = payload.vinyl;
      setConfig(payload.vinyl);
    } else if (!dirtyRef.current) {
      cfgRef.current = payload.vinyl;
      setConfig(payload.vinyl);
    }
  }, [press.id, payload.vinyl]);
  const commit = useCallback(
    (mutate: (prev: VinylComponentConfig) => VinylComponentConfig) => {
      // Read-only viewers (scoped press staff without edit rights) never
      // persist — the server's pressUserCanEdit gate is the backstop, this
      // keeps the UI honest instead of silently failing saves.
      if (!canEdit) return;
      const next = mutate(cfgRef.current);
      cfgRef.current = next;
      dirtyRef.current = true;
      setConfig(next);
      save(next);
    },
    [save],
  );

  // The mock's `categories` state, backed by config. Functional updaters
  // apply against the latest committed config (cfgRef), never stale state.
  const categories = config.categories as unknown as Category[];
  const setCategories: React.Dispatch<React.SetStateAction<Category[]>> = useCallback(
    (updater) => {
      commit((prev) => ({
        ...prev,
        categories: (typeof updater === 'function'
          ? (updater as (c: Category[]) => Category[])(prev.categories as unknown as Category[])
          : updater) as unknown as VinylComponentConfig['categories'],
      }));
    },
    [commit],
  );

  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');
  // Which sizes this press offers. A size marked "not offered" never
  // disappears — it stays on the card, muted, labeled "Not offered"
  // (icon + word, never color alone), so the ladder stays consistent.
  const [selectedQuantityId, setSelectedQuantityId] = useState<string>('1');
  const [selectedWeightId, setSelectedWeightId] = useState<string>('140');
  // Offered maps derive from the config's offered subsets (OfferOption[]).
  const offeredOf = (master: { id: string }[], offered: OfferOption[]) =>
    Object.fromEntries(master.map((o) => [o.id, offered.some((x) => x.id === o.id)]));
  const offeredSizes = useMemo(() => offeredOf(VINYL_SIZE_OPTIONS, config.sizeOptions), [config.sizeOptions]);
  // Quantities and weights are offered PER SIZE (gogoods' Aug 24 2026 bug:
  // one shared list made a 7" toggle change 10" and 12" too). Legacy blobs
  // have only the flat arrays — those apply to every size until the press
  // edits a specific size, which seeds the per-size maps.
  const offeredQuantities = useMemo(
    () => offeredOf(VINYL_QUANTITIES, config.quantitiesBySize?.[selectedSizeId] ?? config.quantities),
    [config.quantitiesBySize, config.quantities, selectedSizeId],
  );
  // Weight ladder = master rungs ∪ press-added customs (from the flat list
  // AND every size's offered subset), sorted by grams.
  const weights = useMemo(() => {
    const all = [...config.weights, ...Object.values(config.weightsBySize ?? {}).flat()];
    const extra = all.filter(
      (w, i) => !VINYL_WEIGHTS.some((m) => m.id === w.id) && all.findIndex((x) => x.id === w.id) === i,
    );
    return [...VINYL_WEIGHTS, ...extra].sort((a, b) => Number(a.id) - Number(b.id));
  }, [config.weights, config.weightsBySize]);
  const offeredWeights = useMemo(
    () => offeredOf(weights, config.weightsBySize?.[selectedSizeId] ?? config.weights),
    [weights, config.weightsBySize, config.weights, selectedSizeId],
  );
  // Seed a full per-size map from whatever each size currently resolves to,
  // so the first per-size edit freezes the other sizes' current state.
  const seedBySize = (
    prev: VinylComponentConfig,
    field: 'quantities' | 'weights',
  ): Record<string, OfferOption[]> => {
    const key = field === 'quantities' ? 'quantitiesBySize' : 'weightsBySize';
    const existing = prev[key];
    return Object.fromEntries(
      VINYL_SIZE_OPTIONS.map((s) => [s.id, existing?.[s.id] ?? prev[field]]),
    );
  };
  const [offerMenuOpenId, setOfferMenuOpenId] = useState<string | null>(null);
  // Shared toggle: flip an option's offered state in the config and, if the
  // current selection just went dark, hop to the first still-offered sibling.
  const makeToggle = (
    field: 'sizeOptions' | 'quantities' | 'weights',
    options: OfferOption[],
    selected: string,
    setSelected: (id: string) => void,
  ) => (id: string) => {
    commit((prev) => {
      const offeredNow = prev[field].some((o) => o.id === id);
      let nextArr: OfferOption[];
      if (offeredNow) {
        nextArr = prev[field].filter((o) => o.id !== id);
        if (selected === id) {
          const fallback = options.find((o) => o.id !== id && nextArr.some((x) => x.id === o.id));
          if (fallback) setSelected(fallback.id);
        }
      } else {
        const opt = options.find((o) => o.id === id);
        if (!opt) return prev;
        nextArr = [...prev[field], { id: opt.id, label: opt.label, note: opt.note ?? '' }];
      }
      return { ...prev, [field]: nextArr };
    });
    setOfferMenuOpenId(null);
  };
  const toggleSizeOffered = makeToggle('sizeOptions', VINYL_SIZE_OPTIONS, selectedSizeId, setSelectedSizeId);
  // Per-size toggle: flips the option ONLY for the currently selected size.
  const makePerSizeToggle = (
    field: 'quantities' | 'weights',
    options: OfferOption[],
    selected: string,
    setSelected: (id: string) => void,
  ) => (id: string) => {
    commit((prev) => {
      const key = field === 'quantities' ? 'quantitiesBySize' : 'weightsBySize';
      const map = seedBySize(prev, field);
      const arr = map[selectedSizeId] ?? prev[field];
      const offeredNow = arr.some((o) => o.id === id);
      let nextArr: OfferOption[];
      if (offeredNow) {
        nextArr = arr.filter((o) => o.id !== id);
        if (selected === id) {
          const fallback = options.find((o) => o.id !== id && nextArr.some((x) => x.id === o.id));
          if (fallback) setSelected(fallback.id);
        }
      } else {
        const opt = options.find((o) => o.id === id);
        if (!opt) return prev;
        nextArr = [...arr, { id: opt.id, label: opt.label, note: opt.note ?? '' }];
      }
      return { ...prev, [key]: { ...map, [selectedSizeId]: nextArr } };
    });
    setOfferMenuOpenId(null);
  };
  const toggleQuantityOffered = makePerSizeToggle('quantities', VINYL_QUANTITIES, selectedQuantityId, setSelectedQuantityId);
  const toggleWeightOffered = makePerSizeToggle('weights', weights, selectedWeightId, setSelectedWeightId);
  // Switching size re-checks the selected quantity/weight against THAT
  // size's offered subsets and hops to the first offered sibling if the
  // current pick is dark there (offers vary per size now). If a size has
  // no offered rungs at all, the selection stays put — the cards read
  // "Not offered" and nothing pretends to be pickable.
  const selectSize = (sizeId: string) => {
    setSelectedSizeId(sizeId);
    const offeredQ = config.quantitiesBySize?.[sizeId] ?? config.quantities;
    if (!offeredQ.some((o) => o.id === selectedQuantityId)) {
      const hop = VINYL_QUANTITIES.find((o) => offeredQ.some((x) => x.id === o.id));
      if (hop) setSelectedQuantityId(hop.id);
    }
    const offeredW = config.weightsBySize?.[sizeId] ?? config.weights;
    if (!offeredW.some((o) => o.id === selectedWeightId)) {
      const hop = weights.find((o) => offeredW.some((x) => x.id === o.id));
      if (hop) setSelectedWeightId(hop.id);
    }
  };
  const addWeight = (grams: string, note: string) => {
    const id = grams;
    if (weights.some((w) => w.id === id)) return; // already in the ladder
    // New custom rung joins the ladder for everyone but is OFFERED only on
    // the size it was added under — other sizes keep their current state.
    const rung = { id, label: `${grams}g`, note: note || 'Custom' };
    const byGrams = (a: OfferOption, b: OfferOption) => Number(a.id) - Number(b.id);
    commit((prev) => {
      const map = seedBySize(prev, 'weights');
      return {
        ...prev,
        weights: [...prev.weights, rung].sort(byGrams),
        weightsBySize: {
          ...map,
          [selectedSizeId]: [...(map[selectedSizeId] ?? prev.weights), rung].sort(byGrams),
        },
      };
    });
  };
  const [categoryId, setCategoryId] = useState<CategoryId>(() => categories[0]?.id ?? 'black');
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>(() => categories[0]?.swatches[0]?.id ?? 'BK1');

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? categories[0],
    [categories, categoryId],
  );

  const selectedSwatch = useMemo(
    () => category.swatches.find((s) => s.id === selectedSwatchId) ?? category.swatches[0],
    [category, selectedSwatchId],
  );

  // The page's Finish lens — moved up here so the hero disc mirrors it too.
  const [finishLens, setFinishLens] = useState<Record<string, string>>({});

  // Preview swatch on the left — falls back to the first in the category,
  // and renders in the lens finish so it matches the tiles. (Bill, Aug 20 2026.)
  const previewSwatch = useMemo(() => {
    const base = selectedSwatch ?? categoryPreview(category);
    if (!base?.gen) return base;
    const catStyle = category.genStyleId ? genStyleById(category.genStyleId) : undefined;
    const finishSet = catStyle && catStyle.pickOne?.label === 'Finish' ? catStyle.pickOne : undefined;
    if (!finishSet) return base;
    const rawLens = finishLens[category.id] ?? category.swatches[0]?.gen?.option ?? finishSet.default;
    if (!rawLens || rawLens === base.gen.option) return base;
    return { ...base, gen: { ...base.gen, option: rawLens } };
  }, [selectedSwatch, category, finishLens]);

  const chooseCategory = (id: CategoryId) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat && cat.swatches[0]) setSelectedSwatchId(cat.swatches[0].id);
  };

  const addCategory = (name: string, _desc: string) => {
    const id = `custom-${Date.now()}`;
    const seed = mk(`${id}-1`, `${name} 1`, 'opaque', '#7A7F88', { sizes: ['12"'] });
    const next: Category = { id, name, kind: 'opaque', sizes: ['12"'], swatches: [seed] };
    setCategories((prev) => [...prev, next]);
    setCategoryId(id);
    setSelectedSwatchId(seed.id);
  };

  // Rename a type / set its type-level sizes from the ⋯ menu on its card.
  const updateCategory = (catId: CategoryId, name: string, sizes: SizeId[], customImg?: string) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, name, sizes, customImg } : c)));
  };

  // Hide/show a type for artists — it stays here for the press either way.
  const toggleCategoryHidden = (catId: CategoryId) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, hidden: !c.hidden } : c)));
  };

  // Remove a whole type; reselect a sibling if it was active.
  const removeCategory = (catId: CategoryId) => {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (catId === categoryId) {
      const remaining = categories.filter((c) => c.id !== catId);
      const next = remaining[0];
      if (next) {
        setCategoryId(next.id);
        setSelectedSwatchId(next.swatches[0]?.id ?? '');
      }
    }
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

  // ── Vinyl Disc Generator wiring ────────────────────────────────────
  // null = closed; { swatch, catId } = editing an existing generator color;
  // { } = creating fresh.
  const [genSheet, setGenSheet] = useState<null | { swatch?: Swatch; catId?: string; replace?: boolean; view?: boolean }>(null);
  // "Create type" sheet — for now an exact duplicate of the color generator;
  // Andrew will spec its type-only divergence from inside it.
  // true = plain create; a string = create preseeded on that style (arrived
  // via "Change type" from an edit sheet — selecting, not changing).
  const [typeSheet, setTypeSheet] = useState<boolean | string>(false);
  // Finish bar under "Pick a color" (Bill, Aug 20 2026): a viewing lens over
  // the style's colors, plus the same hover-··· offer-toggles as 12/10/7.
  // One truth with the sheet — both edit category.offeredFinishes.
  // (finishLens itself now lives up beside the hero preview.)
  const [finishEditCat, setFinishEditCat] = useState<string | null>(null);
  // styleId → this press's own saved colors — gallery tiles stay black &
  // white until a style has been created from, then show the press's record.
  const genByStyle = useMemo(() => {
    const m: Record<string, NonNullable<Swatch['gen']>> = {};
    for (const c of categories) {
      if (!c.genStyleId) continue;
      const g = c.swatches.find((sw) => sw.gen)?.gen;
      if (g && !m[c.genStyleId]) m[c.genStyleId] = g;
    }
    return m;
  }, [categories]);

  // Returns the color's home category id so the sheet can stay open and
  // offer "Add color" — saving an edit shouldn't drop the press out of the
  // room. Black takes charcoal, off-black… like any other style. (Bill,
  // Aug 20 2026.)
  const saveGenColor = (s: Swatch): string => {
    let catId: string;
    if (genSheet?.replace && genSheet.swatch && genSheet.catId) {
      // "Replace" — the rebuilt color takes the photo swatch's spot; the
      // upload is gone. (Bill, Aug 20 2026: presses move off images.)
      const oldId = genSheet.swatch.id;
      catId = genSheet.catId;
      const cid = catId;
      setCategories((prev) => prev.map((c) => (c.id === cid
        ? { ...c, swatches: c.swatches.map((x) => (x.id === oldId ? s : x)) }
        : c)));
    } else if (genSheet?.swatch && genSheet.catId) {
      // Edit-in-place keeps the swatch's reference photo (Task #3451 — MRP's
      // imported photos stay available for compare/rebuild); only the
      // explicit Replace flow above drops the upload.
      updateSwatchIn(
        genSheet.catId,
        genSheet.swatch.customImg ? { ...s, customImg: genSheet.swatch.customImg } : s,
      );
      catId = genSheet.catId;
    } else if (category.genStyleId) {
      // Adding inside a generator-made type — the color stays in that type.
      catId = category.id;
      const cid = catId;
      setCategories((prev) => prev.map((c) => (c.id === cid ? { ...c, swatches: [...c.swatches, s] } : c)));
    } else {
      // File it under the category matching its base — beside photo swatches.
      const home = categories.find((c) => c.kind === s.kind) ?? categories[0];
      catId = home.id;
      setCategories((prev) => prev.map((c) => (c.id === home.id ? { ...c, swatches: [...c.swatches, s] } : c)));
    }
    setCategoryId(catId);
    setSelectedSwatchId(s.id);
    return catId;
  };

  // "Save type" — the saved swatch becomes the type's tile AND its first
  // color. Returns the new style's id so the sheet stays open for more
  // colors (Bill's one-sitting flow); Done closes it.
  const saveGenType = (s: Swatch, typeName?: string, offeredFinishes?: string[]): string => {
    const id = `type-${Date.now()}`;
    const next: Category = { id, name: typeName?.trim() || s.name, kind: s.kind, sizes: s.sizes.length > 0 ? s.sizes : ['12"', '10"', '7"'], swatches: [s], genStyleId: s.gen?.styleId, offeredFinishes };
    setCategories((prev) => [...prev, next]);
    setCategoryId(id);
    setSelectedSwatchId(s.id);
    return id;
  };

  // Each extra color in the create sheet auto-saves straight into the style.
  const addColorToCategory = (catId: string, s: Swatch) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, swatches: [...c.swatches, s] } : c)));
    setSelectedSwatchId(s.id);
  };

  // First color = the default artists get. "Make default" moves it to front.
  // Duplicate keeps every color — the copy is for tweaking (make it the
  // translucent-only twin, etc.) without rebuilding. (Bill, Aug 20 2026.)
  const duplicateCategory = (catId: string) => {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === catId);
      if (idx < 0) return prev;
      const src = prev[idx];
      const stamp = Date.now();
      const copy: Category = {
        ...src,
        id: `type-${stamp}`,
        name: `${src.name} copy`,
        swatches: src.swatches.map((sw, i) => ({ ...sw, id: `gen-${stamp}-${i}` })),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const makeDefaultSwatch = (catId: string, swatchId: string) => {
    setCategories((prev) => prev.map((c) => {
      if (c.id !== catId) return c;
      const sw = c.swatches.find((x) => x.id === swatchId);
      if (!sw) return c;
      return { ...c, swatches: [sw, ...c.swatches.filter((x) => x.id !== swatchId)] };
    }));
  };

  // Hidden colors stay in the catalog (pressed records keep their history) —
  // they're just not offered to artists.
  const toggleSwatchHidden = (catId: string, swatchId: string) => {
    setCategories((prev) => prev.map((c) => (c.id === catId
      ? { ...c, swatches: c.swatches.map((x) => (x.id === swatchId ? { ...x, hidden: !x.hidden } : x)) }
      : c)));
  };

  // Adding/editing a color inside a generator-made type locks the style —
  // the press only sees that style's colors (and finish, when it applies).
  const genLockStyleId = genSheet
    ? (genSheet.catId
        ? categories.find((c) => c.id === genSheet.catId)?.genStyleId
        : category.genStyleId)
    : undefined;

  return (
    <LabelBrandCtx.Provider value={labelBrand}>
      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.faint }}>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Catalog
            </a>
            <span style={{ color: t.crumbDivider }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Vinyl
            </a>
            <span style={{ color: t.crumbDivider }}>›</span>
            <a href="#" onClick={(e) => e.preventDefault()} className="hover:text-slate-600 transition-colors">
              Components
            </a>
            <span style={{ color: t.crumbDivider }}>›</span>
            <span style={{ color: t.subink }}>Vinyl</span>
          </div>
          <PageHeading lead="Add your vinyl." rest="The colors you can press." t={t} />
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
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
              <DiscStage swatch={previewSwatch} sizeId={`${selectedSizeId}"` as SizeId} t={t} />
              <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: t.subink }}>
                <ColorBall color={previewSwatch.base} size={16} />
                <span>{selectedSizeId}"</span>
                <span style={{ color: t.crumbDivider }}>·</span>
                <span>{weights.find((w) => w.id === selectedWeightId)?.label}</span>
                <span style={{ color: t.crumbDivider }}>·</span>
                <span>{category.name}</span>
                <span style={{ color: t.crumbDivider }}>·</span>
                <span className="font-semibold" style={{ color: t.ink }}>
                  {displayPressColorName(previewSwatch.name) ?? `${category.name} color`}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT — pick a size → pick a weight → pick a type → pick or add a color */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            {/* Size */}
            <section>
              <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {VINYL_SIZE_OPTIONS.filter((o) => offeredSizes[o.id]).length} of {VINYL_SIZE_OPTIONS.length} sizes offered by {PARTNER_NAME}.
              </p>
              <OfferableOptionCards
                options={VINYL_SIZE_OPTIONS}
                selectedId={selectedSizeId}
                onSelect={selectSize}
                offered={offeredSizes}
                onToggleOffered={toggleSizeOffered}
                menuOpenId={offerMenuOpenId}
                onMenuOpenChange={setOfferMenuOpenId}
                testPrefix="vinyl-size"
                t={t}
              />
            </section>

            {/* Quantity — records per release */}
            <section>
              <StepHeading lead="Pick a quantity." rest="Records in the release." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                Single LP or a multi-record set — {VINYL_QUANTITIES.filter((o) => offeredQuantities[o.id]).length} of {VINYL_QUANTITIES.length} offered by {PARTNER_NAME}.
              </p>
              <OfferableOptionCards
                options={VINYL_QUANTITIES}
                selectedId={selectedQuantityId}
                onSelect={setSelectedQuantityId}
                offered={offeredQuantities}
                onToggleOffered={toggleQuantityOffered}
                menuOpenId={offerMenuOpenId}
                onMenuOpenChange={setOfferMenuOpenId}
                testPrefix="vinyl-quantity"
                t={t}
              />
            </section>

            {/* Weight */}
            <section>
              <StepHeading lead="Pick a weight." rest="How heavy it presses." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {weights.filter((o) => offeredWeights[o.id]).length} of {weights.length} weights offered by {PARTNER_NAME}.
              </p>
              <OfferableOptionCards
                options={weights}
                selectedId={selectedWeightId}
                onSelect={setSelectedWeightId}
                offered={offeredWeights}
                onToggleOffered={toggleWeightOffered}
                menuOpenId={offerMenuOpenId}
                onMenuOpenChange={setOfferMenuOpenId}
                testPrefix="weight"
                t={t}
              />
              <div style={{ marginTop: 14 }}>
                <AddWeightPopover onAdd={addWeight} t={t} />
              </div>
            </section>

            {/* Category */}
            <section>
              <div className="flex items-start justify-between gap-3">
                <StepHeading lead="Pick a type." rest="What kind of vinyl?" t={t} />
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-[12px] tabular-nums" style={{ color: t.faint }}>
                    {catalogList.length} colors
                  </span>
                  <CatalogSearchPopover
                    entries={catalogList}
                    selectedId={selectedSwatch?.id ?? ''}
                    onPick={selectFromCatalog}
                    t={t}
                  />
                </div>
              </div>
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {categories.map((c) => (
                  <CategoryCard
                    key={c.id}
                    category={c}
                    active={c.id === categoryId}
                    pageSize={`${selectedSizeId}"` as SizeId}
                    onSelect={() => chooseCategory(c.id)}
                    onSaveType={(name, sizes, customImg) => updateCategory(c.id, name, sizes, customImg)}
                    onRemoveType={categories.length > 1 ? () => removeCategory(c.id) : undefined}
                    onDuplicateType={c.genStyleId ? () => duplicateCategory(c.id) : undefined}
                    onEditColor={c.swatches[0]?.gen
                      ? () => setGenSheet({ swatch: c.swatches[0], catId: c.id })
                      // Photo styles (migrated presses like MRP): Edit goes
                      // straight to the rebuild sheet — never the old box.
                      : c.swatches[0]?.customImg
                        ? () => setGenSheet({ swatch: c.swatches[0], catId: c.id, replace: true })
                        : undefined}
                    onToggleHidden={() => toggleCategoryHidden(c.id)}
                    t={t}
                  />
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="group flex items-center gap-2 focus:outline-none"
                  data-testid="button-more-types"
                  onClick={() => setTypeSheet(true)}
                >
                  <span
                    className="inline-flex items-center justify-center rounded-full border flex-shrink-0"
                    style={{ width: 20, height: 20, borderColor: t.blue, color: t.blue }}
                  >
                    <Plus className="w-3 h-3" strokeWidth={2.5} />
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: t.blue }}>
                    Add style
                  </span>
                </button>
              </div>
            </section>

            {/* Swatches */}
            <section>
              <StepHeading lead="Pick a color." rest="Or add a new one." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                <span className="font-semibold" style={{ color: t.ink }}>{category.name}</span> · {category.swatches.length}{' '}
                {category.swatches.length === 1 ? 'color' : 'colors'}
              </p>
              {(() => {
                // Finish bar — only for generator styles that HAVE a finish,
                // and only when there's a real choice. One finish offered =
                // no picker; the sheet remains the way back in.
                const catStyle = category.genStyleId ? genStyleById(category.genStyleId) : undefined;
                const finishSet = catStyle && catStyle.pickOne?.label === 'Finish' ? catStyle.pickOne : undefined;
                if (!finishSet) return null;
                const offered = finishSet.options.filter((o) => !category.offeredFinishes || category.offeredFinishes.includes(o.id));
                const editing = finishEditCat === category.id;
                if (offered.length <= 1 && !editing) return null;
                const rawLens = finishLens[category.id] ?? category.swatches[0]?.gen?.option ?? finishSet.default;
                const lens = offered.some((o) => o.id === rawLens) ? rawLens : offered[0]?.id ?? finishSet.default;
                return (
                  <div className="group/pagefinish" style={{ marginTop: 16 }}>
                    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.faint, marginBottom: 7 }}>Finish</div>
                    {!editing ? (
                      <div style={{ position: 'relative', display: 'inline-flex' }}>
                        <GenSegmented
                          options={offered}
                          value={lens}
                          onChange={(id) => setFinishLens((prev) => ({ ...prev, [category.id]: id }))}
                          t={t}
                          testPrefix="page-finish"
                        />
                        <button
                          type="button"
                          onClick={() => setFinishEditCat(category.id)}
                          aria-label="Choose which finishes artists can pick"
                          title="Offered finishes"
                          data-testid="page-finish-avail-open"
                          className="inline-flex items-center justify-center rounded-full opacity-0 group-hover/pagefinish:opacity-100 focus:opacity-100 transition-opacity"
                          style={{
                            position: 'absolute', left: '100%', marginLeft: 10, top: '50%', transform: 'translateY(-50%)',
                            width: 26, height: 26, backgroundColor: t.frostedBtnStrongBg,
                            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                            border: `1px solid ${t.hairline}`, color: t.subink, cursor: 'pointer',
                          }}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2" style={{ position: 'relative', display: 'inline-flex' }}>
                          {finishSet.options.map((o) => {
                            const on = !category.offeredFinishes || category.offeredFinishes.includes(o.id);
                            const defaultFin = category.swatches[0]?.gen?.option ?? finishSet.default;
                            const isDefault = defaultFin === o.id;
                            return (
                              // Two moves per pill (Bill, Aug 20 2026): click
                              // the name = set default (star marks it); click
                              // the eye = show/hide it for artists. The
                              // default can't hide — one always stays.
                              <span
                                key={o.id}
                                className="inline-flex items-center rounded-full text-[12.5px] font-semibold transition-colors"
                                style={{
                                  border: `1px solid ${isDefault ? t.subink : t.hairline}`,
                                  background: t.card, color: on ? t.ink : t.faint,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCategories((prev) => prev.map((c) => {
                                      if (c.id !== category.id) return c;
                                      const offeredNow = finishSet.options.filter((x) => !c.offeredFinishes || c.offeredFinishes.includes(x.id)).map((x) => x.id);
                                      const nextOffered = offeredNow.includes(o.id) ? c.offeredFinishes : [...offeredNow, o.id];
                                      return {
                                        ...c,
                                        offeredFinishes: nextOffered,
                                        swatches: c.swatches.map((sw, i) => (i === 0 && sw.gen ? { ...sw, gen: { ...sw.gen, option: o.id } } : sw)),
                                      };
                                    }));
                                    setFinishLens((prev) => ({ ...prev, [category.id]: o.id }));
                                  }}
                                  aria-pressed={isDefault}
                                  data-testid={`page-finish-default-${o.id}`}
                                  className="inline-flex items-center gap-1.5"
                                  style={{
                                    padding: '6px 4px 6px 13px', border: 'none', background: 'transparent',
                                    color: 'inherit', cursor: 'pointer', font: 'inherit',
                                    textDecoration: on ? 'none' : 'line-through',
                                  }}
                                >
                                  {/* Word + icon, never color alone */}
                                  {isDefault && <Star className="w-3 h-3" fill="currentColor" />}
                                  {o.label}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDefault}
                                  onClick={() => {
                                    const next = finishSet.options.filter((x) => {
                                      const xOn = !category.offeredFinishes || category.offeredFinishes.includes(x.id);
                                      return x.id === o.id ? !on : xOn;
                                    }).map((x) => x.id);
                                    setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, offeredFinishes: next } : c)));
                                  }}
                                  aria-pressed={on}
                                  aria-label={on ? `Hide ${o.label} from artists` : `Show ${o.label} to artists`}
                                  title={isDefault ? 'The default is always shown' : on ? 'Hide from artists' : 'Show to artists'}
                                  data-testid={`page-finish-avail-${o.id}`}
                                  className={cn('inline-flex items-center justify-center rounded-full transition-colors', isDefault ? '' : t.hoverWashSoft)}
                                  style={{
                                    width: 26, height: 26, padding: 0, marginRight: 5, border: 'none', background: 'transparent',
                                    color: on ? t.subink : t.faint,
                                    cursor: isDefault ? 'not-allowed' : 'pointer',
                                    opacity: isDefault ? 0.35 : 1,
                                  }}
                                >
                                  {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                </button>
                              </span>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => setFinishEditCat(null)}
                            data-testid="page-finish-avail-done"
                            className="text-[12.5px] font-semibold rounded-full"
                            style={{
                              position: 'absolute', left: '100%', marginLeft: 4, top: '50%', transform: 'translateY(-50%)',
                              padding: '6px 12px', border: 'none', background: 'transparent', color: t.blue, cursor: 'pointer',
                            }}
                          >
                            Done
                          </button>
                        </div>
                        <p className="text-[11.5px]" style={{ color: t.faint, marginTop: 8 }}>
                          Click a finish to make it the default — the eye hides it from artists. The default always shows.
                        </p>
                      </>
                    )}
                  </div>
                );
              })()}
              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {category.swatches.map((s, i) => (
                  <SwatchTile
                    key={s.id}
                    swatch={(() => {
                      // The Finish bar is a lens — every color re-renders in
                      // the picked finish, exactly what artists will get.
                      const catStyle = category.genStyleId ? genStyleById(category.genStyleId) : undefined;
                      const finishSet = catStyle && catStyle.pickOne?.label === 'Finish' ? catStyle.pickOne : undefined;
                      if (!finishSet || !s.gen) return s;
                      const offered = finishSet.options.filter((o) => !category.offeredFinishes || category.offeredFinishes.includes(o.id));
                      if (offered.length <= 1) return s;
                      const rawLens = finishLens[category.id] ?? category.swatches[0]?.gen?.option ?? finishSet.default;
                      const lens = offered.some((o) => o.id === rawLens) ? rawLens : offered[0]?.id ?? finishSet.default;
                      return { ...s, gen: { ...s.gen, option: lens } };
                    })()}
                    kind={category.kind}
                    active={s.id === selectedSwatch?.id}
                    isDefault={i === 0 && !s.hidden}
                    onSelect={() => setSelectedSwatchId(s.id)}
                    onSave={(next) => updateSwatchIn(category.id, next)}
                    onRemove={() => removeSwatchFrom(category.id, s.id)}
                    onEditGen={s.gen ? () => setGenSheet({ swatch: s, catId: category.id }) : undefined}
                    onRebuild={!s.gen ? () => setGenSheet({ swatch: s, catId: category.id, replace: true }) : undefined}
                    onMakeDefault={() => makeDefaultSwatch(category.id, s.id)}
                    onToggleHidden={() => toggleSwatchHidden(category.id, s.id)}
                    t={t}
                  />
                ))}
                <AddSwatchTile
                  kind={category.kind}
                  onSave={addSwatch}
                  onOpen={category.genStyleId ? () => setGenSheet({ swatch: category.swatches[0], catId: category.id, view: true }) : undefined}
                  t={t}
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* "Create type" sheet — exact duplicate of the generator for now */}
      {typeSheet && (
        <GeneratorSheet
          initial={null}
          onClose={() => setTypeSheet(false)}
          onSave={saveGenType}
          onAddExtra={addColorToCategory}
          t={t}
          variant="type"
          presetStyleId={typeof typeSheet === 'string' ? typeSheet : undefined}
          titleLead="Create a vinyl type."
          titleRest="Add variations in the next step."
          usedByStyle={genByStyle}
        />
      )}

      {/* The generator sheet */}
      {genSheet !== null && (
        <GeneratorSheet
          initial={genSheet.replace ? null : genSheet.swatch ?? null}
          startSaved={genSheet.view}
          homeCatId={genSheet.catId}
          // Editing a generated color that still carries its imported photo
          // (MRP's Translucent group, Task #3451) keeps the compare drawer:
          // replaceOf feeds the photo, but the sheet stays an edit-in-place
          // (initial set, genSheet.replace false), and the auto-suggestion
          // can't fire into a sheet whose colors are already seeded.
          replaceOf={genSheet.replace || (genSheet.swatch?.customImg && !genSheet.view) ? genSheet.swatch : undefined}
          onClose={() => setGenSheet(null)}
          onSave={saveGenColor}
          onAddExtra={addColorToCategory}
          styleName={(categories.find((c) => c.id === genSheet.catId) ?? (category.genStyleId ? category : undefined))?.name}
          styleCount={(categories.find((c) => c.id === genSheet.catId) ?? (category.genStyleId ? category : undefined))?.swatches.length}
          styleSwatches={(categories.find((c) => c.id === genSheet.catId) ?? (category.genStyleId ? category : undefined))?.swatches}
          lockedStyleId={genLockStyleId}
          usedByStyle={genByStyle}
          // Picking another style here = starting another style, not
          // changing this one — hop to the create flow. (Bill, Aug 20 2026.)
          onSwitchStyle={(sid) => { setGenSheet(null); setTypeSheet(sid); }}
          titleLead={genSheet.view ? 'Add a color.' : genSheet.replace ? (genSheet.swatch?.customImg ? 'Rebuild this color.' : 'Edit the color.') : undefined}
          titleRest={genSheet.view ? 'It joins this type.' : genSheet.replace ? (genSheet.swatch?.customImg ? 'Match their photo, then replace it.' : 'Rebuild it with the picker.') : undefined}
          t={t}
          // Editing the default color = editing the style itself: the sizes
          // ··· and the style chip come along. (Bill, Aug 20 2026.)
          {...(() => {
            const cat = categories.find((c) => c.id === genSheet.catId);
            const isDefaultEdit = !genSheet.replace && !!cat && !!genSheet.swatch && cat.swatches[0]?.id === genSheet.swatch.id;
            return isDefaultEdit && cat
              ? {
                  styleLevel: true,
                  // The default IS the style — title says so. (Bill, Aug 20 2026.)
                  titleLead: 'Edit the type.',
                  titleRest: 'This will be your default.',
                  initialSizes: cat.sizes,
                  onSizesChange: (sizes: SizeId[]) =>
                    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, sizes } : c))),
                  initialFinishes: cat.offeredFinishes,
                  onFinishesChange: (ids: string[]) =>
                    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, offeredFinishes: ids } : c))),
                  onStyleNameChange: (nm: string) =>
                    setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, name: nm } : c))),
                }
              : {};
          })()}
        />
      )}

    </LabelBrandCtx.Provider>
  );
}
