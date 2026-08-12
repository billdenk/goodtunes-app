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
//
// NOTE — vinyl types/colors here are SEEDED from the press's existing GoodTunes
// Packages (their real catalog carries over). The Black-only default in
// MOCK_INITIAL_CATEGORIES applies ONLY to a brand-new press with no packages yet.

import { useMemo, useState, useEffect, useRef, useCallback, forwardRef, type ReactNode } from 'react';
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
} from 'lucide-react';
import { Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate, Moon, Sun } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import goodtunesLogo from './assets/goodtunes-logo.png';
import mrpLogo from './assets/mrp-logo.png';
// MRP's real logo mark (black, single-color vector) for the record label.
import mrpLabelLogo from './assets/mrp-logo.svg';

// ─── PRESS IDENTITY IS DATA ──────────────────────────────────────────
// Per-press: every press sees their own name/logo here (e.g. Hellbender),
// never Memphis's. The header, intro copy, and disc-center labels all read
// from this one const.
const MOCK_PRESS = { name: 'Memphis Record Pressing', logo: mrpLogo };

// ─── Inline chrome primitives (verbatim replacements) ────────────────
// Self-contained stand-ins so this handoff compiles alone: a minimal Button
// and thin Popover wrappers over @radix-ui/react-popover. In the real app,
// swap these for the shared design-system <Button>/<Popover> — the props and
// rendered classes match the two variants this screen uses.
function cnLocal(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost';
  size?: 'default' | 'sm';
};
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2';
  const variantCls =
    variant === 'ghost'
      ? 'border border-transparent'
      : 'bg-primary text-primary-foreground border border-primary-border';
  const sizeCls = size === 'sm' ? 'min-h-8 rounded-md px-3 text-xs' : 'min-h-9 px-4 py-2';
  return <button ref={ref} className={cnLocal(base, variantCls, sizeCls, className)} {...props} />;
});

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverContent = forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = 'center', sideOffset = 4, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cnLocal(
          'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-popover-content-transform-origin]',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});

// ── Per-press label branding ─────────────────────────────────────────
// Each press supplies a center-label logo (SVG preferred) + a label
// background color. The mockup hardcodes Memphis Record Pressing's brand:
// a BLACK label with their WHITE logo, always — regardless of vinyl color
// (matches their real pressings). Future presses would swap these two inputs.
const PRESS_LABEL_LOGO = mrpLabelLogo;
const PRESS_LABEL_BG = '#0a0a0a';
// The supplied asset is black, so invert it to white for the black label.
const PRESS_LABEL_LOGO_FILTER = 'invert(1) brightness(1.7)';
import brandonPhoto from './assets/brandon-seavers.png';
// Mock-only reference image for the "PREVIEW IMAGE" upload rows — a round
// artwork disc stands in for a press-supplied swatch photo. No real upload.
import mockPreviewImg from './assets/gt-preview-artwork-circle.png';
// Vinyl layer PNG masks — module imports (were runtime /__mockup URLs).
import layerOpaque from './assets/vinyl-layers/opaque-vinyl.png';
import layerTranslucent from './assets/vinyl-layers/translucent-vinyl.png';
import layerSplatterOne from './assets/vinyl-layers/splatter-one.png';
import layerSplatterTwo from './assets/vinyl-layers/splatter-two.png';
import layerSplatterThree from './assets/vinyl-layers/splatter-three.png';
import layerHighlights from './assets/vinyl-layers/vinyl-highlights.png';
import layerInner from './assets/vinyl-layers/inner-circle.png';

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
  opaque: layerOpaque,
  translucent: layerTranslucent,
  splatter1: layerSplatterOne,
  splatter2: layerSplatterTwo,
  splatter3: layerSplatterThree,
  highlights: layerHighlights,
  inner: layerInner,
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
};

// Splatter composer presets — copied verbatim from SplatterVinylPreview.tsx
// (the canon device). Offered when defining a splatter-style color.
const MOCK_SPLATTER_PRESETS: Array<{ label: string; vinylType: 'opaque' | 'translucent'; base: string; s1: string; s2: string; s3: string }> = [
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

function VinylDisc({
  size,
  swatch,
  bodyRef,
  labelRatio,
  holeRatio = 0.018,
}: {
  size: number;
  swatch: Swatch;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  /** Center label diameter as a fraction of the disc (7" uses a smaller 3.3" label). */
  labelRatio?: number;
  /** Spindle hole diameter as a fraction of the disc. */
  holeRatio?: number;
}) {
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const INNER_RATIO = 129 / 1104;
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
        </div>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#ffffff',
            opacity: 0.35,
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
};

const mk = (id: string, name: string, kind: SwatchKind, base: string, extra?: Partial<Swatch>): Swatch => ({
  id,
  name,
  kind,
  base,
  sizes: ['12"'],
  ...extra,
});

// Vinyl types/colors are SEEDED from the press's existing GoodTunes Packages
// (their real catalog carries over). This Black-only default is the state for a
// BRAND-NEW press with no packages yet: exactly ONE type, "Black", containing
// exactly ONE color, "Black" (vinyl color #0C0C0C). The press grows its
// catalog from here — adding types ("+ More types") and colors ("Add color").
const MOCK_INITIAL_CATEGORIES: Category[] = [
  {
    id: 'black',
    name: 'Black',
    kind: 'black',
    sizes: ['7"', '10"', '12"'],
    swatches: [
      mk('BK1', 'Black', 'black', '#0C0C0C', { sizes: ['7"', '10"', '12"'] }),
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

function NavRow({ label, icon: Icon, active, t }: PressNavItem & { t: Theme }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className={cn(
        'flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors',
        !active && '${t.hoverWashRail}',
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
const COMPONENTS_ACTIVE = 'Vinyl';


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
          !item.active && '${t.hoverWashRail}',
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
            className={`flex items-center gap-2.5 pl-7 pr-2.5 h-9 rounded-lg text-[13px] transition-colors ${active ? '' : '${t.hoverWashRail}'}`}
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
              <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: t.soft, color: t.subink }}>
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
        className={cn('w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors', t.hoverWashRail)}
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
                  !active && '${t.hoverWashRail}',
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

// Per-press: every press sees their own name/logo here (e.g. Hellbender),
// never Memphis's. Sourced from the top-level MOCK_PRESS const.
const PARTNER_NAME = MOCK_PRESS.name;
const USER_FIRST_NAME = 'Brandon';
const USER_EMAIL = 'brandon@memphisrecordpressing.com';
const USER_INITIALS = 'BS';

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
          <img src={brandonPhoto} alt={USER_INITIALS} className="w-full h-full object-cover" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 p-0 rounded-2xl"
        style={{ border: `1px solid ${t.hairline}`, backgroundColor: t.card, color: t.ink, boxShadow: t.popShadow }}
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
              <button
                key={m.label}
                type="button"
                className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.hoverWashSoft)}
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
            className={cn('w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] transition-colors', t.hoverWashSoft)}
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

function PressShell({ children, t }: { children: ReactNode; t: Theme }) {
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
          <span className={cn('h-9 w-9 rounded-full bg-white ring-1 flex items-center justify-center flex-shrink-0 p-1', t.avatarRing)}>
            <img src={MOCK_PRESS.logo} alt={MOCK_PRESS.name} className="w-full h-full object-contain" />
          </span>
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: t.ink }}>
            {PARTNER_NAME}
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
                className={cn('w-full h-9 pl-8 pr-10 rounded-full text-[12.5px] focus:outline-none', t.searchPlaceholder)}
                style={{ border: `1px solid ${t.hairline}`, color: t.ink, backgroundColor: t.searchBg }}
                placeholder="Search…"
                readOnly
              />
              <span
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none"
                style={{ color: t.faint }}
              >
                ⌘K
              </span>
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

// ─── Type editor popover — rename a type, set which sizes it presses ─
function TypeEditorPopover({
  category,
  open,
  onOpenChange,
  trigger,
  onSave,
  onRemove,
  t,
}: {
  category: Category;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  onSave: (name: string, sizes: SizeId[]) => void;
  onRemove?: () => void;
  t: Theme;
}) {
  const [name, setName] = useState(category.name);
  const [sizes, setSizes] = useState<SizeId[]>(category.sizes);
  // Mock-only preview image for the type card (no real upload / not persisted).
  const [customImg, setCustomImg] = useState<string | undefined>(undefined);

  const canSave = name.trim().length > 0 && sizes.length > 0;

  const toggleSize = (s: SizeId) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const seed = () => {
    setName(category.name);
    setSizes(category.sizes);
    setCustomImg(undefined);
  };

  const submit = () => {
    if (!canSave) return;
    onSave(name.trim(), sizes);
    onOpenChange(false);
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
        className="w-80 p-0 rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${t.hairline}`,
          backgroundColor: t.frostedBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: t.popShadow,
        }}
        data-testid={`popover-edit-type-${category.id}`}
      >
        <div style={{ padding: 18 }}>
          <div className="text-[15px] font-semibold tracking-tight" style={{ color: t.ink }}>
            Edit type. <span style={{ color: t.faint, fontWeight: 600 }}>{category.name}.</span>
          </div>
          <p className="text-[12.5px]" style={{ color: t.subink, marginTop: 2, lineHeight: 1.4 }}>
            Sizes here gate the whole type — every color in it.
          </p>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* preview image — round disc thumb + Change image… / Remove */}
            <PreviewImageRow
              disc={<VinylDisc size={44} swatch={{ ...categoryPreview(category), customImg }} />}
              img={customImg}
              onChange={() => setCustomImg(mockPreviewImg)}
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
  t,
}: {
  category: Category;
  active: boolean;
  /** The size currently picked in the "Pick a size" step. */
  pageSize: SizeId;
  onSelect: () => void;
  onSaveType: (name: string, sizes: SizeId[]) => void;
  onRemoveType?: () => void;
  t: Theme;
}) {
  const preview = categoryPreview(category);
  const [menuOpen, setMenuOpen] = useState(false);
  // Type not offered in the currently-picked size → artists won't see it.
  const hiddenForSize = !category.sizes.includes(pageSize);
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
        t={t}
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Edit ${category.name}`}
            data-testid={`button-edit-type-${category.id}`}
            className="absolute inline-flex items-center justify-center rounded-full transition-all focus:outline-none"
            style={{
              top: 8,
              right: 8,
              width: 26,
              height: 26,
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
      <div className="flex justify-center" style={{ marginBottom: 10, opacity: hiddenForSize ? 0.35 : 1, filter: hiddenForSize ? 'saturate(0.4)' : undefined, transition: 'opacity 0.3s, filter 0.3s' }}>
        <VinylDisc size={90} swatch={preview} />
      </div>
      <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? t.blue : t.ink }}>
        {category.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 2, color: hiddenForSize ? t.notOffered : t.faint }}>
        {hiddenForSize
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
const SIZES = ['7"', '10"', '12"'] as const;
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
  onChange,
  onRemove,
  testId,
  t,
}: {
  disc: ReactNode;
  img: string | undefined;
  onChange: () => void;
  onRemove: () => void;
  testId: string;
  t: Theme;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
        Preview image
      </label>
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0">{disc}</span>
        <div className="flex flex-col items-start gap-0.5">
          <button
            type="button"
            onClick={onChange}
            className="text-[13px] font-semibold rounded transition-colors focus:outline-none"
            style={{ color: t.blue }}
            data-testid={`${testId}-change`}
          >
            Change image…
          </button>
          {img && (
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
              onChange={() => setCustomImg(mockPreviewImg)}
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
                    {MOCK_SPLATTER_PRESETS.map((p) => (
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

            {/* sizes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.subink }}>
                Available sizes
              </label>
              <div className="flex items-center gap-2">
                {SIZES.map((s) => (
                  <SizeChip key={s} size={s} active={sizes.includes(s)} onToggle={() => toggleSize(s)} t={t} />
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
function AddSwatchTile({ kind, onSave, t }: { kind: SwatchKind; onSave: (s: Swatch) => void; t: Theme }) {
  const [open, setOpen] = useState(false);
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
                          {swatch.name}
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
  onSelect,
  onSave,
  onRemove,
  t,
}: {
  swatch: Swatch;
  kind: SwatchKind;
  active: boolean;
  onSelect: () => void;
  onSave: (s: Swatch) => void;
  onRemove: () => void;
  t: Theme;
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        data-testid={`swatch-${swatch.id}`}
        className="w-full rounded-2xl flex flex-col items-center gap-2 transition-all hover:-translate-y-px focus:outline-none"
        style={{ padding: 12, minHeight: 108, border: active ? `2px solid ${t.blue}` : `1px solid ${t.hairline}`, backgroundColor: t.card }}
      >
        <span className="relative">
          <VinylDisc size={40} swatch={swatch} />
          {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
        </span>
        <span className="text-[11.5px] font-semibold text-center leading-tight" style={{ color: active ? t.blue : t.ink }}>
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
          t={t}
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
                backgroundColor: t.frostedBtnStrongBg,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: `1px solid ${t.hairline}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
                color: t.subink,
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
// ─── Vinyl weights ────────────────────────────────────────────────────
// Data-driven so each press can offer its own ladder — MRP runs 140g/180g
// today; a Viryl-equipped plant might add its own presets later.
const MOCK_VINYL_WEIGHTS = [
  { id: '140', label: '140g', note: 'Standard' },
  { id: '180', label: '180g', note: 'Heavyweight' },
];

// ─── Vinyl sizes ──────────────────────────────────────────────────────
// Same size picker as the artist-facing screens — record diameter first.
const MOCK_VINYL_SIZE_OPTIONS = [
  { id: '7',  label: '7"',  note: 'Single' },
  { id: '10', label: '10"', note: 'EP' },
  { id: '12', label: '12"', note: 'LP · Standard' },
];

// ─── Records per release ──────────────────────────────────────────────
// How many discs the release presses — single LP up to a 4LP box.
const MOCK_VINYL_QUANTITIES = [
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

export function PressVinylColorSetup() {
  // Mock-only theme toggle. Default is light (press persona); dark = charcoal
  // admin canon. Everything except the vinyl disc render reads from `t`.
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const t = THEMES[mode];
  const [categories, setCategories] = useState<Category[]>(MOCK_INITIAL_CATEGORIES);
  const [selectedSizeId, setSelectedSizeId] = useState<string>('12');
  // Which sizes this press offers. A size marked "not offered" never
  // disappears — it stays on the card, muted, labeled "Not offered"
  // (icon + word, never color alone), so the ladder stays consistent.
  const [selectedQuantityId, setSelectedQuantityId] = useState<string>('1');
  const [selectedWeightId, setSelectedWeightId] = useState<string>('140');
  const [offeredSizes, setOfferedSizes] = useState<Record<string, boolean>>({ '7': true, '10': true, '12': true });
  const [offeredQuantities, setOfferedQuantities] = useState<Record<string, boolean>>({ '1': true, '2': true, '3': true, '4': true });
  const [offeredWeights, setOfferedWeights] = useState<Record<string, boolean>>({ '140': true, '180': true });
  const [offerMenuOpenId, setOfferMenuOpenId] = useState<string | null>(null);
  // Shared toggle: flip an option's offered state and, if the current
  // selection just went dark, hop to the first still-offered sibling.
  const makeToggle = (
    setMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    options: { id: string }[],
    selected: string,
    setSelected: (id: string) => void,
  ) => (id: string) => {
    setMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (!next[id] && selected === id) {
        const fallback = options.find((o) => o.id !== id && next[o.id]);
        if (fallback) setSelected(fallback.id);
      }
      return next;
    });
    setOfferMenuOpenId(null);
  };
  const toggleSizeOffered = makeToggle(setOfferedSizes, MOCK_VINYL_SIZE_OPTIONS, selectedSizeId, setSelectedSizeId);
  const toggleQuantityOffered = makeToggle(setOfferedQuantities, MOCK_VINYL_QUANTITIES, selectedQuantityId, setSelectedQuantityId);
  const [weights, setWeights] = useState(MOCK_VINYL_WEIGHTS);
  const toggleWeightOffered = makeToggle(setOfferedWeights, weights, selectedWeightId, setSelectedWeightId);
  const addWeight = (grams: string, note: string) => {
    const id = grams;
    if (weights.some((w) => w.id === id)) return; // already in the ladder
    setWeights((prev) => [...prev, { id, label: `${grams}g`, note: note || 'Custom' }].sort((a, b) => Number(a.id) - Number(b.id)));
    setOfferedWeights((prev) => ({ ...prev, [id]: true }));
  };
  const [categoryId, setCategoryId] = useState<CategoryId>('black');
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>('BK1');

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
    const next: Category = { id, name, kind: 'opaque', sizes: ['12"'], swatches: [seed] };
    setCategories((prev) => [...prev, next]);
    setCategoryId(id);
    setSelectedSwatchId(seed.id);
  };

  // Rename a type / set its type-level sizes from the ⋯ menu on its card.
  const updateCategory = (catId: CategoryId, name: string, sizes: SizeId[]) => {
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, name, sizes } : c)));
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

  return (
    <PressShell t={t}>
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
                  {previewSwatch.name}
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
                {MOCK_VINYL_SIZE_OPTIONS.filter((o) => offeredSizes[o.id]).length} of {MOCK_VINYL_SIZE_OPTIONS.length} sizes offered by {PARTNER_NAME}.
              </p>
              <OfferableOptionCards
                options={MOCK_VINYL_SIZE_OPTIONS}
                selectedId={selectedSizeId}
                onSelect={setSelectedSizeId}
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
                Single LP or a multi-record set — {MOCK_VINYL_QUANTITIES.filter((o) => offeredQuantities[o.id]).length} of {MOCK_VINYL_QUANTITIES.length} offered by {PARTNER_NAME}.
              </p>
              <OfferableOptionCards
                options={MOCK_VINYL_QUANTITIES}
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
                    onSaveType={(name, sizes) => updateCategory(c.id, name, sizes)}
                    onRemoveType={categories.length > 1 ? () => removeCategory(c.id) : undefined}
                    t={t}
                  />
                ))}
              </div>
              <div style={{ marginTop: 14 }}>
                <MoreTypesPopover onAdd={addCategory} t={t} />
              </div>
            </section>

            {/* Swatches */}
            <section>
              <StepHeading lead="Pick a color." rest="Or add a new one." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                <span className="font-semibold" style={{ color: t.ink }}>{category.name}</span> · {category.swatches.length}{' '}
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
                    t={t}
                  />
                ))}
                <AddSwatchTile kind={category.kind} onSave={addSwatch} t={t} />
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* MOCK-ONLY chrome — remove when wiring real theming. */}
      {/* Floating mock-only theme toggle — bottom-right. Not part of the
          product; lets a reviewer flip light ⇆ dark (charcoal admin canon). */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        aria-label={mode === 'dark' ? 'View light' : 'View dark'}
        data-testid="button-toggle-theme"
        className="fixed z-50 inline-flex items-center gap-2 rounded-full transition-colors"
        style={{
          bottom: 24,
          right: 24,
          height: 40,
          padding: '0 16px',
          fontSize: 13,
          fontWeight: 600,
          color: t.ink,
          backgroundColor: t.frostedBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${t.hairline}`,
          boxShadow: t.popShadow,
        }}
      >
        {mode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        {mode === 'dark' ? 'View light' : 'View dark'}
      </button>
    </PressShell>
  );
}

export default PressVinylColorSetup;
