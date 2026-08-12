// PressVinylComponent — the Vinyl component surface for the press portal,
// ported from handoff/press-components/PressVinylColorSetup.tsx. Renders ONLY
// the main-content body (OperatorShell provides portal chrome). Mode comes
// from useAdminDark(); the mock's THEMES map (light + charcoal-dark) is copied
// verbatim. Press identity is data (payload.press). Config is the whole
// VinylComponentConfig blob, saved atomically via save(next).
//
// Wiring notes:
// - MOCK_INITIAL_CATEGORIES → payload.vinyl.categories.
// - MOCK_VINYL_WEIGHTS/SIZE_OPTIONS/QUANTITIES → the fixed master ladder; the
//   config arrays (weights/sizeOptions/quantities) store the OFFERED subset.
//   Toggling "not offered" removes from config; the option stays visible/muted.
// - Preview-image upload uses the app's real object-upload flow (postAdminImage
//   with mask:"disc"); the resulting /objects/... URL is stored in swatch.customImg.
// - canEdit=false → view-only: every edit affordance is hidden/disabled.

import { useMemo, useState, useEffect, useRef, useCallback, forwardRef, type ReactNode, type MutableRefObject } from 'react';
import {
  Search,
  Check,
  UploadCloud,
  Plus,
  MoreHorizontal,
  Trash2,
  X,
  RotateCcw,
  Layers,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { resolvePressMarkLogo, type PressComponentsPayload } from './usePressComponents';
import { WhiteMarkGlyph } from './PressMarkGlyph';
import type {
  VinylComponentConfig,
  VinylCategory,
  VinylSwatch,
  OfferOption,
  VinylSizeId,
} from '@shared/pressComponents';
import { postAdminImage } from '@/lib/adminUpload';
import { useToast } from '@/hooks/use-toast';
import { useAdminDark } from '@/lib/adminAppearance';
// Vinyl layer PNG masks — module imports (kit copied verbatim from the mock).
import layerOpaque from './assets/vinyl-layers/opaque-vinyl.png';
import layerTranslucent from './assets/vinyl-layers/translucent-vinyl.png';
import layerSplatterOne from './assets/vinyl-layers/splatter-one.png';
import layerSplatterTwo from './assets/vinyl-layers/splatter-two.png';
import layerSplatterThree from './assets/vinyl-layers/splatter-three.png';
import layerHighlights from './assets/vinyl-layers/vinyl-highlights.png';
import layerInner from './assets/vinyl-layers/inner-circle.png';

// ─── Inline chrome primitives (verbatim replacements) ────────────────
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

// ─── Theme tokens — light (default) + dark (charcoal admin canon) ────
type Theme = {
  blue: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  canvas: string;
  rail: string;
  card: string;
  soft: string;
  searchBg: string;
  critical: string;
  pillShadow: string;
  headerBg: string;
  frostedBg: string;
  frostedStrongBg: string;
  popShadow: string;
  popShadowLg: string;
  selectWash: string;
  critWash: string;
  crumbDivider: string;
  dashedBorder: string;
  notOffered: string;
  frostedBtnBg: string;
  frostedBtnStrongBg: string;
  hoverWash: string;
  hoverWashSoft: string;
  hoverWashRail: string;
  avatarRing: string;
  searchPlaceholder: string;
  focusFieldBorder: string;
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
    hoverWash: 'hover:bg-black/5',
    hoverWashSoft: 'hover:bg-black/[0.03]',
    hoverWashRail: 'hover:bg-black/5',
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

// Spindle-hole fill for the vinyl disc (part of the unthemed disc render).
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

// ─── Local types (mirror the mock; shared config uses the same shapes) ──
type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter';
type Swatch = VinylSwatch;
type Category = VinylCategory;

// Splatter composer presets — copied verbatim from SplatterVinylPreview.tsx.
const SPLATTER_PRESETS: Array<{ label: string; vinylType: 'opaque' | 'translucent'; base: string; s1: string; s2: string; s3: string }> = [
  { label: 'Classic splatter', vinylType: 'opaque', base: '#C81E38', s1: '#F5F5DC', s2: '#1A1A2E', s3: '#E8C84A' },
  { label: 'Blue flame', vinylType: 'opaque', base: '#1B3A6B', s1: '#FF6B35', s2: '#FFD700', s3: '#E0E0E0' },
  { label: 'Forest mist', vinylType: 'opaque', base: '#2D4A3E', s1: '#A8C5A0', s2: '#F5E6D3', s3: '#7BA3A1' },
  { label: 'Candy stripe', vinylType: 'translucent', base: '#FF69B4', s1: '#00BFFF', s2: '#FFFFFF', s3: '#FF69B4' },
  { label: 'Midnight gold', vinylType: 'opaque', base: '#0A0A0A', s1: '#C89A3C', s2: '#8A6B1F', s3: '#F5F0E0' },
  { label: 'Smoke & amber', vinylType: 'translucent', base: '#C17A3A', s1: '#E8D5A3', s2: '#4A4A4A', s3: '#8B4513' },
];

// ─── Size vocabulary ─────────────────────────────────────────────────
const SIZES = ['7"', '10"', '12"'] as const;
type SizeId = VinylSizeId;

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

// ─── Per-press label branding (data) ─────────────────────────────────
// Each press supplies a center-label mark (labelLogoUrl, assumed white-reading)
// against a black label. When missing, render nothing (never Memphis's).
type LabelBrand = { logoUrl: string | null };
const PRESS_LABEL_BG = '#0a0a0a';

// Center-label artwork — the press's ACTUAL logo mark, sized generously.
function DiscLabelArt({ size, brand }: { size: number; brand: LabelBrand }) {
  const showArcText = size >= 70;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      {brand.logoUrl && (
        // Black label face — mark renders WHITE via mask regardless of the
        // uploaded logo's color.
        <WhiteMarkGlyph
          logoUrl={brand.logoUrl}
          size={size * 0.9}
          opacity={1}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
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
              33 ⅓ RPM
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
  brand,
  bodyRef,
  labelRatio,
  holeRatio = 0.018,
}: {
  size: number;
  swatch: Swatch;
  brand: LabelBrand;
  bodyRef?: MutableRefObject<HTMLDivElement | null>;
  labelRatio?: number;
  holeRatio?: number;
}) {
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const isSplatter = swatch.kind === 'splatter';
  const translucent = swatch.kind === 'translucent' || (isSplatter && !!swatch.splatterTranslucent);
  const spin = !!bodyRef;

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
        {/* The source photo carries its OWN label (whatever the press's
            site photo happened to show). Cover it with the same rendered
            press label the drawn discs use so every disc — photo or drawn —
            wears this press's mark. */}
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
          {size >= 70 && <DiscLabelArt size={size * LABEL_RATIO} brand={brand} />}
        </div>
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
          {size >= 70 && <DiscLabelArt size={size * LABEL_RATIO} brand={brand} />}
        </div>

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

// ─── JS-driven hover-spin physics ────────────────────────────────────
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

const SPIN_DPS = 360 / 8000;
const REWIND_MS = 700;
const REWIND_EASE = (t: number) => 1 - Math.pow(1 - t, 3);

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
    const target = start - (((start % 360) + 360) % 360);
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

// Real record proportions — 340px stage disc = 12".
const STAGE_PX_PER_INCH = 340 / 12;
const SIZE_SPECS: Record<SizeId, { inches: number; labelInches: number }> = {
  '7"': { inches: 7, labelInches: 3.3 },
  '10"': { inches: 10, labelInches: 3.94 },
  '12"': { inches: 12, labelInches: 3.94 },
};

function DiscStage({ swatch, brand, sizeId = '12"', t }: { swatch: Swatch; brand: LabelBrand; sizeId?: SizeId; t: Theme }) {
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  const spec = SIZE_SPECS[sizeId] ?? SIZE_SPECS['12"'];
  const discPx = Math.round(spec.inches * STAGE_PX_PER_INCH);
  const labelRatio = spec.labelInches / spec.inches;
  const holeRatio = 0.3 / spec.inches;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', height: 340, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', display: 'inline-block', transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
            <VinylDisc size={discPx} swatch={swatch} brand={brand} bodyRef={bodyRef} labelRatio={labelRatio} holeRatio={holeRatio} />
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
          <div style={{ position: 'absolute', bottom: 6, right: -6, zIndex: 5 }}>
            <RewindButton show={showRewind} onClick={rewind} size={28} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Glossy round color ball — radial-gradient highlight.
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

// Representative preview swatch for each category card's mini disc.
function categoryPreview(cat: Category): Swatch {
  return cat.swatches[0];
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

// ─── Preview-image row — shared by the type editor and the color editor ─
// A round disc thumbnail + a blue "Change image…" that opens a real file
// picker (upload via postAdminImage, mask:"disc") and a quiet "Remove".
function PreviewImageRow({
  disc,
  img,
  uploading,
  onPick,
  onRemove,
  testId,
  t,
}: {
  disc: ReactNode;
  img: string | undefined;
  uploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  testId: string;
  t: Theme;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
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
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPick(file);
              e.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="text-[13px] font-semibold rounded transition-colors focus:outline-none inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ color: t.blue }}
            data-testid={`${testId}-change`}
          >
            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
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

// ─── Type editor popover — rename a type, set which sizes it presses ─
function TypeEditorPopover({
  category,
  brand,
  open,
  onOpenChange,
  trigger,
  onSave,
  onRemove,
  t,
}: {
  category: Category;
  brand: LabelBrand;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  onSave: (name: string, sizes: SizeId[]) => void;
  onRemove?: () => void;
  t: Theme;
}) {
  const [name, setName] = useState(category.name);
  const [sizes, setSizes] = useState<SizeId[]>(category.sizes);

  const canSave = name.trim().length > 0 && sizes.length > 0;

  const toggleSize = (s: SizeId) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const seed = () => {
    setName(category.name);
    setSizes(category.sizes);
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

// ─── Category card — mini disc + name + count ────────────────────────
function CategoryCard({
  category,
  brand,
  active,
  pageSize,
  canEdit,
  onSelect,
  onSaveType,
  onRemoveType,
  t,
}: {
  category: Category;
  brand: LabelBrand;
  active: boolean;
  pageSize: SizeId;
  canEdit: boolean;
  onSelect: () => void;
  onSaveType: (name: string, sizes: SizeId[]) => void;
  onRemoveType?: () => void;
  t: Theme;
}) {
  const preview = categoryPreview(category);
  const [menuOpen, setMenuOpen] = useState(false);
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
      {canEdit && (
        <TypeEditorPopover
          category={category}
          brand={brand}
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
      )}
      <div className="flex justify-center" style={{ marginBottom: 10, opacity: hiddenForSize ? 0.35 : 1, filter: hiddenForSize ? 'saturate(0.4)' : undefined, transition: 'opacity 0.3s, filter 0.3s' }}>
        {preview ? <VinylDisc size={90} swatch={preview} brand={brand} /> : <div style={{ width: 90, height: 90 }} />}
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

// ─── Add/Edit color frosted popover ──────────────────────────────────
function SwatchEditorPopover({
  kind,
  brand,
  open,
  onOpenChange,
  trigger,
  edit,
  onSave,
  onRemove,
  onUpload,
  t,
}: {
  kind: SwatchKind;
  brand: LabelBrand;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  edit?: Swatch;
  onSave: (s: Swatch) => void;
  onRemove?: () => void;
  onUpload: (file: File) => Promise<string | null>;
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
  const [customImg, setCustomImg] = useState<string | undefined>(edit?.customImg);
  const [uploading, setUploading] = useState(false);
  const [vinylType, setVinylType] = useState<'opaque' | 'translucent'>(
    edit?.splatterTranslucent ? 'translucent' : 'opaque',
  );

  const canSave = name.trim().length > 0 && sizes.length > 0 && !uploading;

  const toggleSize = (s: SizeId) =>
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const seed = () => {
    setName(edit?.name ?? '');
    setBase(edit?.base ?? defaultBase);
    setS1(edit?.s1 ?? '#F5F5DC');
    setS2(edit?.s2 ?? '#E8C84A');
    setS3(edit?.s3 ?? '#E0E0E0');
    setSizes(edit?.sizes ?? ['12"']);
    setCustomImg(edit?.customImg);
    setUploading(false);
    setVinylType(edit?.splatterTranslucent ? 'translucent' : 'opaque');
  };

  const pickImage = async (file: File) => {
    setUploading(true);
    const url = await onUpload(file);
    setUploading(false);
    if (url) setCustomImg(url);
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
          maxHeight: 'min(640px, calc(100vh - 32px))',
        }}
        data-testid={edit ? 'popover-edit-color' : 'popover-add-color'}
      >
        <div className="flex items-center gap-3 flex-shrink-0" style={{ padding: '18px 18px 14px 18px' }}>
          <VinylDisc size={44} swatch={previewSwatch} brand={brand} />
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

        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '0 18px 18px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PreviewImageRow
              disc={<VinylDisc size={44} swatch={previewSwatch} brand={brand} />}
              img={customImg}
              uploading={uploading}
              onPick={pickImage}
              onRemove={() => setCustomImg(undefined)}
              testId="color-preview-img"
              t={t}
            />

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

            {isSplatter && (
              <>
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
                          brand={brand}
                          swatch={{ id: 'p', name: p.label, kind: 'splatter', base: p.base, s1: p.s1, s2: p.s2, s3: p.s3, sizes: ['12"'], splatterTranslucent: p.vinylType === 'translucent' }}
                        />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

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
function AddSwatchTile({ kind, brand, onSave, onUpload, t }: { kind: SwatchKind; brand: LabelBrand; onSave: (s: Swatch) => void; onUpload: (file: File) => Promise<string | null>; t: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <SwatchEditorPopover
      kind={kind}
      brand={brand}
      open={open}
      onOpenChange={setOpen}
      onSave={onSave}
      onUpload={onUpload}
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
  brand,
  selectedId,
  onPick,
  t,
}: {
  entries: CatalogEntry[];
  brand: LabelBrand;
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
          maxHeight: 'min(560px, calc(100vh - 32px), var(--radix-popover-content-available-height))',
        }}
        data-testid="popover-catalog-search"
      >
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
                      <VinylDisc size={40} swatch={swatch} brand={brand} />
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
function SwatchTile({
  swatch,
  kind,
  brand,
  active,
  canEdit,
  onSelect,
  onSave,
  onRemove,
  onUpload,
  t,
}: {
  swatch: Swatch;
  kind: SwatchKind;
  brand: LabelBrand;
  active: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onSave: (s: Swatch) => void;
  onRemove: () => void;
  onUpload: (file: File) => Promise<string | null>;
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
          <VinylDisc size={40} swatch={swatch} brand={brand} />
          {active && <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" strokeWidth={3} />}
        </span>
        <span className="text-[11.5px] font-semibold text-center leading-tight" style={{ color: active ? t.blue : t.ink }}>
          {swatch.name}
        </span>
      </button>

      {canEdit && (
        <div
          className="absolute opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
          style={{ top: 8, right: 8 }}
        >
          <SwatchEditorPopover
            kind={kind}
            brand={brand}
            edit={swatch}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSave={onSave}
            onRemove={onRemove}
            onUpload={onUpload}
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
      )}
    </div>
  );
}

// ─── Master ladders — the fixed catalog of offerable options ─────────
// The config arrays store the OFFERED subset; these are the full ladders the
// press can toggle on/off (an unoffered option stays visible, muted).
const MASTER_SIZE_OPTIONS: OfferOption[] = [
  { id: '7', label: '7"', note: 'Single' },
  { id: '10', label: '10"', note: 'EP' },
  { id: '12', label: '12"', note: 'LP · Standard' },
];
const MASTER_QUANTITIES: OfferOption[] = [
  { id: '1', label: '1 LP', note: 'Single' },
  { id: '2', label: '2 LP', note: 'Double' },
  { id: '3', label: '3 LP', note: 'Triple' },
  { id: '4', label: '4 LP', note: 'Quad' },
];
const MASTER_WEIGHTS: OfferOption[] = [
  { id: '140', label: '140g', note: 'Standard' },
  { id: '180', label: '180g', note: 'Heavyweight' },
];

// Merge a config ladder with its master, preserving master order and appending
// any press-added options; return the full ladder + a membership (offered) map.
function mergeLadder(master: OfferOption[], configured: OfferOption[]): { options: OfferOption[]; offered: Record<string, boolean> } {
  const byId = new Map<string, OfferOption>();
  master.forEach((o) => byId.set(o.id, o));
  const offered: Record<string, boolean> = {};
  configured.forEach((o) => {
    byId.set(o.id, o); // config wins (label/note may have been edited)
    offered[o.id] = true;
  });
  const masterIds = new Set(master.map((o) => o.id));
  const extras = configured.filter((o) => !masterIds.has(o.id));
  const options = [...master.map((o) => byId.get(o.id)!), ...extras].sort((a, b) => {
    const na = Number(a.id), nb = Number(b.id);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return 0;
  });
  return { options, offered };
}

// ─── Offerable option cards — shared by size / quantity / weight ─────
type OfferableOption = { id: string; label: string; note: string };

function OfferableOptionCards({
  options,
  selectedId,
  onSelect,
  offered,
  onToggleOffered,
  menuOpenId,
  onMenuOpenChange,
  canEdit,
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
  canEdit: boolean;
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
            {canEdit && (
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add a weight — same "More types" canon popover pattern ──────────
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

// ─── Saving indicator — subtle pill in the header row ────────────────
function SavingIndicator({ saving, t }: { saving: boolean; t: Theme }) {
  if (!saving) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px]"
      style={{ color: t.subink }}
      data-testid="vinyl-saving"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      Saving…
    </span>
  );
}

// ─── Component ───────────────────────────────────────────────────────
export function PressVinylComponent({
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
  const t = THEMES[useAdminDark() ? 'dark' : 'light'];
  const { toast } = useToast();

  const press = payload.press;
  const brand: LabelBrand = { logoUrl: resolvePressMarkLogo(press) };
  const partnerName = press.name;

  // ── Local editing state, seeded from the config slice ──────────────
  const [config, setConfig] = useState<VinylComponentConfig>(payload.vinyl);
  const dirtyRef = useRef(false);
  const pressIdRef = useRef(press.id);

  // Re-seed ONLY when the press identity changes AND there are no unsaved
  // edits (standing memory rule: local edit vs shared-query re-seed).
  useEffect(() => {
    if (pressIdRef.current !== press.id) {
      pressIdRef.current = press.id;
      dirtyRef.current = false;
      setConfig(payload.vinyl);
    } else if (!dirtyRef.current) {
      setConfig(payload.vinyl);
    }
  }, [press.id, payload.vinyl]);

  // Every mutation writes local config then persists the WHOLE config.
  const commit = useCallback(
    (next: VinylComponentConfig) => {
      dirtyRef.current = true;
      setConfig(next);
      save(next);
    },
    [save],
  );

  const categories = config.categories;

  // Ladders — merge master with the offered config subset.
  const sizeLadder = useMemo(() => mergeLadder(MASTER_SIZE_OPTIONS, config.sizeOptions), [config.sizeOptions]);
  const qtyLadder = useMemo(() => mergeLadder(MASTER_QUANTITIES, config.quantities), [config.quantities]);
  const weightLadder = useMemo(() => mergeLadder(MASTER_WEIGHTS, config.weights), [config.weights]);

  // ── Ephemeral selection state (view concern, not persisted) ────────
  const firstOffered = (l: { options: OfferOption[]; offered: Record<string, boolean> }, fallback: string) =>
    l.options.find((o) => l.offered[o.id])?.id ?? fallback;
  const [selectedSizeId, setSelectedSizeId] = useState<string>(() => firstOffered(sizeLadder, '12'));
  const [selectedQuantityId, setSelectedQuantityId] = useState<string>(() => firstOffered(qtyLadder, '1'));
  const [selectedWeightId, setSelectedWeightId] = useState<string>(() => firstOffered(weightLadder, '140'));
  const [offerMenuOpenId, setOfferMenuOpenId] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState<CategoryId>(categories[0]?.id ?? '');
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>(categories[0]?.swatches[0]?.id ?? '');

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? categories[0],
    [categories, categoryId],
  );

  const selectedSwatch = useMemo(
    () => category?.swatches.find((s) => s.id === selectedSwatchId) ?? category?.swatches[0],
    [category, selectedSwatchId],
  );

  const previewSwatch = selectedSwatch ?? (category ? categoryPreview(category) : undefined);

  // ── Upload (real object-upload flow, mask:"disc" for a round crop) ──
  const uploadPreviewImage = useCallback(
    async (file: File): Promise<string | null> => {
      try {
        const { url } = await postAdminImage(file, { mask: 'disc', noun: 'swatch' });
        return url;
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Could not upload the image.',
          variant: 'destructive',
        });
        return null;
      }
    },
    [toast],
  );

  // ── Ladder mutations (offered toggle + add weight) ─────────────────
  const toggleOffered = (
    ladder: { options: OfferOption[]; offered: Record<string, boolean> },
    field: 'sizeOptions' | 'quantities' | 'weights',
    id: string,
    selected: string,
    setSelected: (id: string) => void,
  ) => {
    const currentlyOffered = !!ladder.offered[id];
    let nextOffered: OfferOption[];
    if (currentlyOffered) {
      nextOffered = config[field].filter((o) => o.id !== id);
      if (selected === id) {
        const fallback = ladder.options.find((o) => o.id !== id && ladder.offered[o.id]);
        if (fallback) setSelected(fallback.id);
      }
    } else {
      const opt = ladder.options.find((o) => o.id === id);
      if (!opt) return;
      // Preserve master order in the persisted array.
      const withNew = [...config[field], opt];
      const order = ladder.options.map((o) => o.id);
      nextOffered = withNew.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    commit({ ...config, [field]: nextOffered });
    setOfferMenuOpenId(null);
  };

  const addWeight = (grams: string, note: string) => {
    const id = grams;
    if (weightLadder.options.some((w) => w.id === id) && weightLadder.offered[id]) return;
    const opt: OfferOption = { id, label: `${grams}g`, note: note || 'Custom' };
    const withNew = config.weights.filter((w) => w.id !== id).concat(opt);
    const next = withNew.sort((a, b) => Number(a.id) - Number(b.id));
    commit({ ...config, weights: next });
    setSelectedWeightId(id);
  };

  // ── Category / swatch mutations ────────────────────────────────────
  const chooseCategory = (id: CategoryId) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat && cat.swatches[0]) setSelectedSwatchId(cat.swatches[0].id);
  };

  const addCategory = (name: string) => {
    const id = `custom-${Date.now()}`;
    const seed: Swatch = { id: `${id}-1`, name: `${name} 1`, kind: 'opaque', base: '#7A7F88', sizes: ['12"'] };
    const next: Category = { id, name, kind: 'opaque', sizes: ['12"'], swatches: [seed] };
    commit({ ...config, categories: [...categories, next] });
    setCategoryId(id);
    setSelectedSwatchId(seed.id);
  };

  const updateCategory = (catId: CategoryId, name: string, sizes: SizeId[]) => {
    commit({
      ...config,
      categories: categories.map((c) => (c.id === catId ? { ...c, name, sizes } : c)),
    });
  };

  const removeCategory = (catId: CategoryId) => {
    const remaining = categories.filter((c) => c.id !== catId);
    commit({ ...config, categories: remaining });
    if (catId === categoryId) {
      const next = remaining[0];
      if (next) {
        setCategoryId(next.id);
        setSelectedSwatchId(next.swatches[0]?.id ?? '');
      }
    }
  };

  const addSwatch = (s: Swatch) => {
    commit({
      ...config,
      categories: categories.map((c) => (c.id === categoryId ? { ...c, swatches: [...c.swatches, s] } : c)),
    });
    setSelectedSwatchId(s.id);
  };

  const updateSwatchIn = (catId: CategoryId, next: Swatch) => {
    commit({
      ...config,
      categories: categories.map((c) =>
        c.id === catId ? { ...c, swatches: c.swatches.map((s) => (s.id === next.id ? next : s)) } : c,
      ),
    });
  };

  const removeSwatchFrom = (catId: CategoryId, swatchId: string) => {
    const cat = categories.find((c) => c.id === catId);
    const remaining = cat?.swatches.filter((s) => s.id !== swatchId) ?? [];
    commit({
      ...config,
      categories: categories.map((c) => (c.id === catId ? { ...c, swatches: c.swatches.filter((s) => s.id !== swatchId) } : c)),
    });
    if (catId === categoryId && swatchId === selectedSwatchId) {
      setSelectedSwatchId(remaining[0]?.id ?? '');
    }
  };

  const selectFromCatalog = (catId: CategoryId, swatchId: string) => {
    setCategoryId(catId);
    setSelectedSwatchId(swatchId);
  };

  const catalogList = useMemo(
    () => categories.flatMap((c) => c.swatches.map((s) => ({ swatch: s, categoryId: c.id, categoryName: c.name }))),
    [categories],
  );

  const selectedWeightLabel = weightLadder.options.find((w) => w.id === selectedWeightId)?.label;

  return (
    <div style={{ backgroundColor: t.canvas, color: t.ink }}>
      <div className="mx-auto w-full font-sans" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 96 }}>
        {/* Quiet opening header */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <PageHeading lead="Add your vinyl." rest="The colors you can press." t={t} />
            <SavingIndicator saving={saving} t={t} />
          </div>
          <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: t.subink }}>
            Pick a type, then pick or add a color. Artists choose from these when they design a record with {partnerName}.
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
              {previewSwatch && (
                <DiscStage swatch={previewSwatch} brand={brand} sizeId={`${selectedSizeId}"` as SizeId} t={t} />
              )}
              {previewSwatch && (
                <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: t.subink }}>
                  <ColorBall color={previewSwatch.base} size={16} />
                  <span>{selectedSizeId}"</span>
                  <span style={{ color: t.crumbDivider }}>·</span>
                  <span>{selectedWeightLabel}</span>
                  <span style={{ color: t.crumbDivider }}>·</span>
                  <span>{category?.name}</span>
                  <span style={{ color: t.crumbDivider }}>·</span>
                  <span className="font-semibold" style={{ color: t.ink }}>
                    {previewSwatch.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — pick a size → quantity → weight → type → color */}
          <div className="min-w-0 flex flex-col" style={{ gap: 48 }}>
            {/* Size */}
            <section>
              <StepHeading lead="Pick a size." rest="The record sets the fit." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {sizeLadder.options.filter((o) => sizeLadder.offered[o.id]).length} of {sizeLadder.options.length} sizes offered by {partnerName}.
              </p>
              <OfferableOptionCards
                options={sizeLadder.options}
                selectedId={selectedSizeId}
                onSelect={setSelectedSizeId}
                offered={sizeLadder.offered}
                onToggleOffered={(id) => toggleOffered(sizeLadder, 'sizeOptions', id, selectedSizeId, setSelectedSizeId)}
                menuOpenId={offerMenuOpenId}
                onMenuOpenChange={setOfferMenuOpenId}
                canEdit={canEdit}
                testPrefix="vinyl-size"
                t={t}
              />
            </section>

            {/* Quantity */}
            <section>
              <StepHeading lead="Pick a quantity." rest="Records in the release." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                Single LP or a multi-record set — {qtyLadder.options.filter((o) => qtyLadder.offered[o.id]).length} of {qtyLadder.options.length} offered by {partnerName}.
              </p>
              <OfferableOptionCards
                options={qtyLadder.options}
                selectedId={selectedQuantityId}
                onSelect={setSelectedQuantityId}
                offered={qtyLadder.offered}
                onToggleOffered={(id) => toggleOffered(qtyLadder, 'quantities', id, selectedQuantityId, setSelectedQuantityId)}
                menuOpenId={offerMenuOpenId}
                onMenuOpenChange={setOfferMenuOpenId}
                canEdit={canEdit}
                testPrefix="vinyl-quantity"
                t={t}
              />
            </section>

            {/* Weight */}
            <section>
              <StepHeading lead="Pick a weight." rest="How heavy it presses." t={t} />
              <p className="text-[12.5px]" style={{ marginTop: 10, color: t.subink }}>
                {weightLadder.options.filter((o) => weightLadder.offered[o.id]).length} of {weightLadder.options.length} weights offered by {partnerName}.
              </p>
              <OfferableOptionCards
                options={weightLadder.options}
                selectedId={selectedWeightId}
                onSelect={setSelectedWeightId}
                offered={weightLadder.offered}
                onToggleOffered={(id) => toggleOffered(weightLadder, 'weights', id, selectedWeightId, setSelectedWeightId)}
                menuOpenId={offerMenuOpenId}
                onMenuOpenChange={setOfferMenuOpenId}
                canEdit={canEdit}
                testPrefix="weight"
                t={t}
              />
              {canEdit && (
                <div style={{ marginTop: 14 }}>
                  <AddWeightPopover onAdd={addWeight} t={t} />
                </div>
              )}
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
                    brand={brand}
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
                    brand={brand}
                    active={c.id === categoryId}
                    pageSize={`${selectedSizeId}"` as SizeId}
                    canEdit={canEdit}
                    onSelect={() => chooseCategory(c.id)}
                    onSaveType={(name, sizes) => updateCategory(c.id, name, sizes)}
                    onRemoveType={canEdit && categories.length > 1 ? () => removeCategory(c.id) : undefined}
                    t={t}
                  />
                ))}
              </div>
              {canEdit && (
                <div style={{ marginTop: 14 }}>
                  <MoreTypesPopover onAdd={(name) => addCategory(name)} t={t} />
                </div>
              )}
            </section>

            {/* Swatches */}
            {category && (
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
                      brand={brand}
                      active={s.id === selectedSwatch?.id}
                      canEdit={canEdit}
                      onSelect={() => setSelectedSwatchId(s.id)}
                      onSave={(next) => updateSwatchIn(category.id, next)}
                      onRemove={() => removeSwatchFrom(category.id, s.id)}
                      onUpload={uploadPreviewImage}
                      t={t}
                    />
                  ))}
                  {canEdit && (
                    <AddSwatchTile kind={category.kind} brand={brand} onSave={addSwatch} onUpload={uploadPreviewImage} t={t} />
                  )}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PressVinylComponent;
