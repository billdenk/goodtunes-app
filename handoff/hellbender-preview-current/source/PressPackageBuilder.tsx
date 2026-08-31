// PressPackageBuilder — ONE continuous, Apple-buy-flow-style page (like
// apple.com/shop/buy-ipad) where a press builds a quote for a client.
//
// Every section is the EXACT screen already built for the catalog, stacked
// into a single scroll and wired to shared state:
//   1. Add your vinyl        — PressVinylColorSetup (disc kit, spin, swatches)
//   2. Choose your jacket    — ArtistChooseJacket (JacketStage + JacketTile)
//   3. Choose your inner sleeve — ArtistChooseInnerSleeve (SleeveStage + tiles)
//   4. Center labels         — PressCatalogVinylLabels (LabelDisc + LabelTile)
//   5. Choose your inserts   — ArtistChooseInserts (InsertStage + tiles, + None)
//   6. Stickers              — PressCatalogStickers (Sticker + ShapeTile, + None)
//   7. Save to Catalog › Vinyl › Quotes
//
// The record size is chosen ONCE in section 1 and flows through everything.
// A frosted running-total bar stays pinned at the top.
// Components below are copied verbatim from their donor files.

import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, useCallback, type ReactNode } from 'react';
import {
  UserPlus,
  Search,
  LayoutDashboard,
  Disc3,
  Users,
  Megaphone,
  ShoppingBag,
  UserCheck,
  Store,
  BarChart3,
  Library,
  Gift,
  Settings as Cog,
  Bell,
  MessageSquarePlus,
  UserPen,
  ShieldCheck,
  LogOut,
  RotateCcw,
  Eye,
  EyeOff,
  Check,
  ChevronDown,
  CheckCircle2,
  Pencil,
  ImagePlus,
  Sparkles,
  Upload,
  UploadCloud,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react';
import { ChevronDown as NavChevron, Package as NavPackage, Layers as NavLayers, Award as NavAward, AudioLines as NavWave, LayoutTemplate as NavTemplate, Boxes, Disc as NavVinyl, Square as NavJacket, CircleDot as NavLabel, FileText as NavInsert, Sticker as NavSticker, ReceiptText as NavPricing, ClipboardList as NavEstimates } from 'lucide-react';
import { Button } from '@workspace/goodtunes-design-system/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@workspace/goodtunes-design-system/components/ui/popover';
import goodtunesLogo from '../assets/goodtunes-logo.png';
import mrpLogo from '../assets/mrp-logo.png';
import brandonPhoto from '../assets/brandon-seavers.png';
import californialandCover from '../assets/californialand-cover.jpg';
import californialandInnerSleeve from '../assets/californialand-inner-sleeve.png';
import rubyVinylPhoto from '../assets/mrp-ruby-translucent.png';
import niinaLabelArt from '../assets/niina-label-1.png';
import hellbenderLogo from '../assets/hellbender-full.svg';
import hellbenderIcon from '../assets/hellbender-icon.svg';
import hellbenderOperator from '../assets/travis-whitlock.webp';
import alexPhoto from '../assets/alex-tebeleff.jpg';
import paramountOperator from '../assets/paramount/brooke-harris-portrait.jpeg';
import paramountSymbol from '../assets/paramount/paramount-symbol.png';
import paramountFrostedWhite from '../assets/paramount/frosted-white-vinyl.png';

export type PressPackageBuilderVariant = 'memphis' | 'hellbender' | 'paramount';
export type PressPackageBuilderAudience = 'press' | 'artist';

export type PressPackageBuilderConfig = {
  variant: PressPackageBuilderVariant;
  displayName: string;
  legalName: string;
  logo: string;
  operatorName: string;
  operatorEmail: string;
  operatorInitials: string;
  operatorPhoto: string;
  defaultColorId: string;
  defaultColorKind: SwatchKind;
  defaultMode: QMode;
  labelColor: string;
  labelLogoFilter: string;
  labelMark?: string;
  markOnly?: boolean;
  activeNav: 'builder' | 'catalog';
};

const PARAMOUNT_LOGO = 'https://paramountpressing.com/hs-fs/hubfs/2a2c766a-803f-4745-b3af-047057e98b3a_720.png?width=400&height=455&name=2a2c766a-803f-4745-b3af-047057e98b3a_720.png';

const PRESS_BUILDER_CONFIGS: Record<PressPackageBuilderVariant, PressPackageBuilderConfig> = {
  memphis: {
    variant: 'memphis', displayName: 'MRP', legalName: 'Memphis Record Pressing', logo: mrpLogo,
    operatorName: 'Brandon', operatorEmail: 'brandon@memphisrecordpressing.com', operatorInitials: 'BS',
    operatorPhoto: brandonPhoto, defaultColorId: 'BK1', defaultColorKind: 'black', defaultMode: 'dark',
    labelColor: '#0a0a0a', labelLogoFilter: 'invert(1) brightness(1.7)', activeNav: 'builder',
  },
  hellbender: {
    variant: 'hellbender', displayName: 'Hellbender', legalName: 'Hellbender Vinyl', logo: hellbenderLogo,
    operatorName: 'Travis', operatorEmail: 'travis@hellbendervinyl.com', operatorInitials: 'TW',
    operatorPhoto: hellbenderOperator, defaultColorId: 'BK1', defaultColorKind: 'black', defaultMode: 'light',
    labelColor: '#0a0a0a', labelLogoFilter: 'brightness(0) invert(1)', labelMark: hellbenderIcon, markOnly: true, activeNav: 'builder',
  },
  paramount: {
    variant: 'paramount', displayName: 'Paramount', legalName: 'Paramount Pressing & Plating', logo: PARAMOUNT_LOGO,
    operatorName: 'Brooke', operatorEmail: 'brooke@paramountpressing.com', operatorInitials: 'BH',
    operatorPhoto: paramountOperator, defaultColorId: 'BK1', defaultColorKind: 'black', defaultMode: 'light',
    labelColor: 'transparent', labelLogoFilter: 'none', labelMark: paramountSymbol, markOnly: true, activeNav: 'builder',
  },
};

export const PressBuilderBrandContext = createContext<PressPackageBuilderConfig>(PRESS_BUILDER_CONFIGS.memphis);
const usePressBuilderBrand = () => useContext(PressBuilderBrandContext);
const PressBuilderAudienceContext = createContext<PressPackageBuilderAudience>('press');
const usePressBuilderAudience = () => useContext(PressBuilderAudienceContext);

function PressMark({ style, darkSurface = true }: { style: React.CSSProperties; darkSurface?: boolean }) {
  const brand = usePressBuilderBrand();
  return <img src={brand.labelMark ?? brand.logo} alt="" aria-hidden style={{ objectFit: 'contain', filter: darkSurface && brand.markOnly ? 'invert(1)' : darkSurface ? brand.labelLogoFilter : undefined, ...style }} />;
}

export function PressPackageBuilderProvider({ variant, audience = 'press', activeNav = 'builder', children }: {
  variant: PressPackageBuilderVariant;
  audience?: PressPackageBuilderAudience;
  activeNav?: 'builder' | 'catalog';
  children: ReactNode;
}) {
  const config = { ...PRESS_BUILDER_CONFIGS[variant], activeNav };
  return (
    <PressBuilderBrandContext.Provider value={config}>
      <PressBuilderAudienceContext.Provider value={audience}>{children}</PressBuilderAudienceContext.Provider>
    </PressBuilderBrandContext.Provider>
  );
}

// ── Per-press label branding ─────────────────────────────────────────
// ─── Brand tokens (Apple calm visual language) ──────────────────────
const BLUE = '#319ED8';
// Per-press white-label accent (founder, Aug 16 2026): each press's spec strip
// carries its own brand complement — MRP's is the gold of their site's CTA.
const PRESS_ACCENT = '#D6A63F';
// Theme-aware via CSS variables (Bill, Aug 16 2026: canon press shell, dark
// default). Values are set in Q_THEME_CSS below; product visuals (jackets,
// sleeves, discs) keep their real hex colors — vinyl is vinyl in any theme.
const INK = 'var(--q-ink)';
const SUBINK = 'var(--q-subink)';
const HAIRLINE = 'var(--q-hairline)';
const CANVAS = 'var(--q-canvas)';
const RAIL = 'var(--q-rail)';
const PILL_SHADOW = 'var(--q-pill-shadow)';

type QMode = 'light' | 'dark' | 'system';

// Vars live on :root so portalled popovers resolve them too. The <style> tag
// mounts only while this mock is mounted; tailwind-class remaps stay scoped.
const Q_THEME_CSS = String.raw`
:root { --q-ink:#1d1d1f; --q-subink:#6e6e73; --q-hairline:#e6e6ea; --q-canvas:#f5f5f7; --q-rail:#f5f5f7; --q-card:#ffffff; --q-track:#f2f2f5; --q-frost:rgba(255,255,255,0.78); --q-pill-shadow:0 1px 2px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04); --q-accent-ink:#9a7422; }
html[data-gt-dark] { --q-ink:#f5f5f7; --q-subink:#98989d; --q-hairline:rgba(255,255,255,0.12); --q-canvas:#161617; --q-rail:#1c1c1e; --q-card:#2a2a2d; --q-track:rgba(255,255,255,0.08); --q-frost:rgba(22,22,23,0.72); --q-pill-shadow:0 1px 3px rgba(0,0,0,0.5); --q-accent-ink:#e2bf6a; }
html[data-gt-dark] .q-root .bg-white { background-color: var(--q-card) !important; }
html[data-gt-dark] .q-root .hover\:bg-slate-50:hover, html[data-gt-dark] .q-root .hover\:bg-slate-100:hover, html[data-gt-dark] .q-root .hover\:bg-slate-200:hover, html[data-gt-dark] .q-root .hover\:bg-black\/5:hover { background-color: rgba(255,255,255,0.07) !important; }
html[data-gt-dark] .q-root .ring-slate-200 { --tw-ring-color: rgba(255,255,255,0.15); }
html[data-gt-dark] .q-root .placeholder\:text-slate-400::placeholder { color: rgba(255,255,255,0.30); }
html[data-gt-dark] .q-root .hover\:text-slate-600:hover { color: #d0d0d5 !important; }
html[data-gt-dark] [data-radix-popper-content-wrapper] > div { background-color: #2a2a2d !important; border-color: rgba(255,255,255,0.12) !important; }
html[data-gt-dark] [data-radix-popper-content-wrapper] .hover\:bg-slate-50:hover { background-color: rgba(255,255,255,0.07) !important; }
`;

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

// ─── A single CSS-masked color layer ─────────────────────────────────
function MaskLayer({
  color,
  mask,
  opacity = 1,
  maskSize = '102% 102%',
}: {
  color: string;
  mask: string;
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

// ─── JS-driven hover-spin physics (from PressCatalogVinylLabels) ─────
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

function RewindButton({ show, onClick, size = 28 }: { show: boolean; onClick: () => void; size?: number }) {
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
        background: 'var(--q-card)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${HAIRLINE}`,
        boxShadow: PILL_SHADOW,
        color: SUBINK,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = SUBINK; }}
    >
      <RotateCcw style={{ width: size * 0.5, height: size * 0.5 }} />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 1 — VINYL (from PressVinylColorSetup)
// ═══════════════════════════════════════════════════════════════════
type SwatchKind = 'black' | 'opaque' | 'translucent' | 'splatter';
type SizeId = '7' | '10' | '12';

type Swatch = {
  id: string;
  name: string;
  kind: SwatchKind;
  base: string;
  s1?: string;
  s2?: string;
  s3?: string;
  sizes: SizeId[];
  /** Real press photo of this color — used instead of the layered render. */
  photo?: string;
  /** Inner-vinyl tone sampled from the photo, used only to cover a baked third-party label. */
  photoCenter?: string;
};

// Active-press center art; mark-only brands omit the label field and arc text.
function DiscLabelArt({ size, swatch }: { size: number; swatch?: Swatch }) {
  const brand = usePressBuilderBrand();
  const hex = swatch?.base?.replace('#', '') ?? '111114';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const darkDisc = ((red * 299 + green * 587 + blue * 114) / 1000) < 150;
  const showArcText = size >= 70;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <img
        src={brand.labelMark ?? brand.logo}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * (brand.markOnly ? 0.82 : 0.9),
          height: size * (brand.markOnly ? 0.82 : 0.9),
          objectFit: 'contain',
          filter: brand.markOnly ? 'brightness(0) invert(1)' : brand.labelLogoFilter,
        }}
      />
      {showArcText && !brand.markOnly && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="quote-disc-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill="rgba(245,245,247,0.5)" style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#quote-disc-arc-bottom" startOffset="50%" textAnchor="middle">
              {brand.displayName.toUpperCase()}-001 · 33 ⅓ RPM
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
  labelRatio,
  bodyRef,
  labelOverlay,
}: {
  size: number;
  swatch: Swatch;
  labelRatio?: number;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  /** Custom center-label content rendered inside the spinning body. */
  labelOverlay?: React.ReactNode;
}) {
  const brand = usePressBuilderBrand();
  const LABEL_RATIO = labelRatio ?? 368 / 1104;
  const INNER_RATIO = 129 / 1104;
  const holeRatio = 0.018;
  const translucent = swatch.kind === 'translucent';
  const isSplatter = swatch.kind === 'splatter';
  const spin = !!bodyRef;

  // Real press photo (Bill, Aug 16 2026): show it verbatim — the label and
  // sheen are baked into the shot. Circle-crop with a slight zoom to trim
  // the black frame around the record.
  const photoSource = swatch.photo;
  // The non-Memphis photo treatment masks the photographed MRP center completely
  // before rendering the active press label. The vinyl photo itself stays intact:
  // no synthetic grooves or substitute disc render are introduced.
  const photoLabelRatio = LABEL_RATIO * (brand.variant === 'memphis' ? 1 : 1.15);
  if (photoSource) {
    return (
      <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
        <div ref={bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', willChange: bodyRef ? 'transform' : undefined }}>
          <img
            src={photoSource}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: size * photoLabelRatio, height: size * photoLabelRatio, borderRadius: '50%',
              backgroundColor: brand.variant === 'memphis' ? brand.labelColor : brand.variant === 'hellbender' ? '#0a0a0a' : (swatch.photoCenter ?? swatch.base),
              boxShadow: brand.variant === 'memphis' || brand.variant === 'hellbender' ? undefined : `0 0 ${size * 0.018}px ${size * 0.006}px ${swatch.photoCenter ?? swatch.base}`,
              overflow: 'hidden',
            }}
          >
            <DiscLabelArt size={size * photoLabelRatio} swatch={swatch} />
          </div>
          {labelOverlay}
        </div>
        {/* Fixed sheen — same non-rotating highlight pass as the layered render */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#ffffff',
            opacity: 0.6,
            maskImage: `url(${LAYERS.highlights})`,
            WebkitMaskImage: `url(${LAYERS.highlights})`,
            maskSize: '100% 100%',
            WebkitMaskSize: '100% 100%',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
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
      {/* Rotating record body */}
      <div ref={bodyRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', willChange: bodyRef ? 'transform' : undefined }}>
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

        {/* Active-press center treatment. */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: size * LABEL_RATIO,
            height: size * LABEL_RATIO,
            borderRadius: '50%',
            backgroundColor: brand.labelColor,
            overflow: 'hidden',
          }}
        >
          {size >= 40 && <DiscLabelArt size={size * LABEL_RATIO} swatch={swatch} />}
        </div>
        {labelOverlay}

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

      {/* Fixed sheen — never rotates */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#ffffff',
          opacity: 0.6,
          maskImage: `url(${LAYERS.highlights})`,
          WebkitMaskImage: `url(${LAYERS.highlights})`,
          maskSize: '100% 100%',
          WebkitMaskSize: '100% 100%',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />

      {/* Spindle hole */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: size * holeRatio,
          height: size * holeRatio,
          borderRadius: '50%',
          backgroundColor: CANVAS,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// Small solid color dot (caption affordance from PressVinylColorSetup).
function ColorBall({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative block rounded-full"
      style={{ width: size, height: size, flexShrink: 0, boxShadow: '0 0 0 1px rgba(15,23,42,0.10)' }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color} 70%)`, opacity: 0.94 }}
      />
    </span>
  );
}

// Left preview stage — spinning disc, proportional to the record size.
const DISC_PX_PER_INCH = 300 / 12;

function DiscStage({ swatch, sizeId }: { swatch: Swatch; sizeId: SizeId }) {
  const inches = sizeId === '7' ? 7 : sizeId === '10' ? 10 : 12;
  const discSize = Math.round(inches * DISC_PX_PER_INCH);
  const labelRatio = sizeId === '7' ? 3.3 / 7 : 3.94 / inches;
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <VinylDisc size={discSize} swatch={swatch} labelRatio={labelRatio} bodyRef={bodyRef} />
        </div>
        <div
          style={{
            position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
            width: Math.round(discSize * 0.52), height: 14, borderRadius: '50%',
            background: 'rgba(0,0,0,0.24)', filter: 'blur(8px)', pointerEvents: 'none', zIndex: 0,
          }}
        />
        <div style={{ position: 'absolute', bottom: 4, right: -8, zIndex: 5 }}>
          <RewindButton show={showRewind} onClick={rewind} size={28} />
        </div>
      </div>
    </div>
  );
}

// ─── Record sizes (shared across every section) ──────────────────────
const VINYL_SIZES = [
  { id: '12' as SizeId, label: '12"', note: '' },
  { id: '10' as SizeId, label: '10"', note: '' },
  { id: '7' as SizeId,  label: '7"',  note: '' },
];

// Press-run quantities + discount curve (from PressCatalogPricing).
const DISC_COUNTS = [
  { n: 1, label: '1 LP', note: 'Single disc' },
  { n: 2, label: '2 LP', note: 'Double' },
  { n: 3, label: '3 LP', note: 'Triple' },
  { n: 4, label: '4 LP', note: 'Box set' },
];

const QUANTITIES = [100, 300, 500, 1000, 2000, 3000];

function qtyScale(qty: number): number {
  return qty <= 100 ? 1.0 : qty <= 300 ? 0.88 : qty <= 500 ? 0.80 : qty <= 1000 ? 0.70 : qty <= 2000 ? 0.62 : 0.55;
}

const VINYL_WEIGHTS = [
  { id: '140', label: '140g', note: 'Standard' },
  { id: '180', label: '180g', note: 'Heavyweight' },
];

// ─── Catalog colors (from PressVinylColorSetup INITIAL_CATEGORIES) ───
type QuoteSwatch = Swatch & { price: number; kindNote: string };

const qsw = (id: string, name: string, kind: SwatchKind, kindNote: string, base: string, price: number, extra?: Partial<Swatch>): QuoteSwatch => ({
  id, name, kind, kindNote, base, price, sizes: ['12', '10', '7'], ...extra,
});

const CATALOG_COLORS: QuoteSwatch[] = [
  qsw('BK1', 'Classic Black', 'black', 'Black', '#111114', 1.80),
  qsw('OP4', 'Emerald', 'opaque', 'Opaque', '#12664F', 2.40),
  qsw('F01', 'Frosted White', 'translucent', 'Translucent', '#E8ECEF', 2.40, { photo: paramountFrostedWhite, photoCenter: '#D9DDE0' }),
  qsw('T01', 'Ruby',   'translucent', 'Translucent', '#C81E38', 2.30, { photo: rubyVinylPhoto, photoCenter: '#A20A04' }),
  qsw('T02', 'Clear',  'translucent', 'Translucent', '#E8ECEF', 2.40),
  qsw('T03', 'Cobalt', 'translucent', 'Translucent', '#2563EB', 2.60),
  qsw('OP1', 'Bone White', 'opaque', 'Opaque', '#EDE9DF', 2.40),
  qsw('OP3', 'Sea Blue',   'opaque', 'Opaque', '#2B6DA8', 2.40),
  qsw('SP1', 'Cosmic',  'splatter', 'Splatter', '#1B3A6B', 3.20, { s1: '#F5F5DC', s2: '#E8C84A', s3: '#E0E0E0', sizes: ['10', '12'] }),
  qsw('SP2', 'Classic', 'splatter', 'Splatter', '#C81E38', 3.20, { s1: '#F5F5DC', s2: '#1A1A2E', s3: '#E8C84A', sizes: ['10', '12'] }),
  qsw('SP3', 'Forest Mist',   'splatter', 'Splatter', '#3E5E4A', 3.20, { s1: '#DDE5DC', s2: '#8FA98F', s3: '#F0F0EA', sizes: ['10', '12'] }),
  qsw('SP4', 'Blue Flame',    'splatter', 'Splatter', '#1E4FA3', 3.20, { s1: '#E8ECEF', s2: '#8FB4E8', s3: '#F5F5DC', sizes: ['10', '12'] }),
  qsw('SP5', 'Midnight Gold', 'splatter', 'Splatter', '#141418', 3.20, { s1: '#E8C84A', s2: '#B7942E', s3: '#F0E6C8', sizes: ['10', '12'] }),
];

// Vinyl types — donor "Pick a type. What kind of vinyl?" cards.
const COLOR_TYPES: { id: SwatchKind; name: string }[] = [
  { id: 'black', name: 'Black' },
  { id: 'splatter', name: 'Splatter' },
  { id: 'translucent', name: 'Translucent' },
  { id: 'opaque', name: 'Opaque' },
];

// Type card — mini disc + name + color count (mirrors the color-setup type row).
function TypeCard({ name, count, swatch, active, onSelect }: {
  name: string; count: number; swatch: QuoteSwatch; active: boolean; onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-type-${swatch.kind}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={64} swatch={swatch} />
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6' }}>
        {count} {count === 1 ? 'color' : 'colors'}
      </div>
    </div>
  );
}

// Color card — miniature record + name.
function ColorRecordCard({ swatch, active, onSelect }: { swatch: QuoteSwatch; active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-color-${swatch.id}`}
      className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center' }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={46} swatch={swatch} />
      </div>
      <div className="text-[12.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {swatch.name}
      </div>
    </div>
  );
}

// Swatch card — mini disc + name (mirrors the color-setup swatch grid).
function SwatchCard({ swatch, active, onSelect }: { swatch: QuoteSwatch; active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`quote-color-${swatch.id}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 14, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 10 }}>
        <VinylDisc size={64} swatch={swatch} />
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {swatch.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6' }}>
        {swatch.kindNote}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 2 — JACKET (from ArtistChooseJacket, verbatim)
// ═══════════════════════════════════════════════════════════════════
type JacketVariant = { id: string; label: string; note: string };

type JacketOption = {
  id: string;
  name: string;
  note: string;
  gatefoldPanels: 0 | 1 | 2;
  printed: boolean;
  variants: JacketVariant[];
};

const V_STANDARD: JacketVariant = { id: 'standard', label: 'Standard', note: '' };
const V_WIDESPINE: JacketVariant = { id: 'widespine', label: 'Widespine', note: 'Wider spine — fits 2LP sets and heavyweight pressings.' };
const V_TIPON: JacketVariant = { id: 'tipon', label: 'Old-Style Tip-On', note: 'Artwork printed on textured paper, wrapped and glued over the board — the vintage look.' };

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
const JS_BASE = 321;
const THUMB = 64;
const THUMB_LOGO = 0.52;

function JacketThumbnail({ jacket, size = THUMB }: { jacket: JacketOption; size?: number }) {
  if (jacket.id === 'discobag') {
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
          background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f2f2f2 60%, #e8e8e8 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 3px rgba(0,0,0,0.30)',
        }}>
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
        <PressMark style={{ width: size * THUMB_LOGO, height: size * THUMB_LOGO, opacity: 0.90 }} />
      </div>
    </div>
  );
}

function JacketTile({
  jacket,
  active,
  variantId,
  onSelect,
  onVariantSelect,
}: {
  jacket: JacketOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flexShrink: 0, display: 'flex', perspective: '300px', perspectiveOrigin: '50% 50%' }}>
        {jacket.gatefoldPanels === 0 ? (
          <JacketThumbnail jacket={jacket} size={THUMB} />
        ) : jacket.gatefoldPanels === 1 ? (
          <div style={{ position: 'relative', width: THUMB, height: THUMB, perspective: '300px' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', zIndex: 1 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 7, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Interior</span>
              </div>
            </div>
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
                <PressMark style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, opacity: 0.90 }} />
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'rgba(0,0,0,0.45)', zIndex: 4 }} />
          </div>
        ) : (
          <div style={{ position: 'relative', width: THUMB, height: THUMB, perspective: '300px' }}>
            <div style={{ position: 'absolute', inset: 0, background: '#E8DBCA', overflow: 'hidden', zIndex: 1 }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 6, fontWeight: 600, color: 'rgba(80,60,30,0.32)', letterSpacing: 1.2, textTransform: 'uppercase' }}>Interior</span>
              </div>
            </div>
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
                <PressMark style={{ width: THUMB * THUMB_LOGO, height: THUMB * THUMB_LOGO, opacity: 0.90 }} />
              </div>
            </div>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 1, background: 'rgba(0,0,0,0.40)', zIndex: 4 }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 1, background: 'rgba(0,0,0,0.40)', zIndex: 4 }} />
          </div>
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {jacket.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>
          {jacket.note}
        </div>
        {active && hasVariants && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'var(--q-track)' }}>
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
                      color: vActive ? INK : '#8e8e93',
                      background: vActive ? 'var(--q-card)' : 'transparent',
                      boxShadow: vActive ? PILL_SHADOW : 'none',
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
              <div className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6', lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JacketStage({ jacketType, widespine = false, tipOn = false }: { jacketType: JacketOption | null; widespine?: boolean; tipOn?: boolean }) {
  const JS = JS_BASE;
  const SPINE_W = widespine ? 20 : 10;
  const panels = jacketType?.gatefoldPanels ?? 0;
  const isGatefold = panels > 0;
  const [open, setOpen] = useState(false);
  const [showVinyl, setShowVinyl] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDiscobag = jacketType?.id === 'discobag';

  const HOLE_D = JS * (368 / 1104);
  const HOLE_R = HOLE_D / 2;

  // Closed by default — the closed state shows the EXTERIOR front face;
  // the interior only appears when the gatefold opens on hover (Bill).
  useEffect(() => {
    setOpen(false);
  }, [jacketType?.id, isGatefold, tipOn]);

  useEffect(() => {
    if (!isDiscobag) setShowVinyl(false);
  }, [isDiscobag]);

  function PrintedFace() {
    const P = JS * 0.16;
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <PressMark style={{ width: JS * 0.52, height: JS * 0.52, opacity: 0.92 }} />
        </div>
        {tipOn && (
          <div style={{ position: 'absolute', top: 0, right: 0, width: P, height: P, pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
              background: 'linear-gradient(135deg, #c4b294 0%, #a8946f 100%)',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              clipPath: 'polygon(0 0, 100% 100%, 0 100%)',
              background: 'linear-gradient(315deg, #ffffff 0%, #f3ecdf 45%, #ddd2bd 100%)',
              filter: 'drop-shadow(-2px 2px 3px rgba(0,0,0,0.35))',
              borderRadius: '0 0 0 4px',
            }} />
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
    const holeMask = `radial-gradient(circle ${HOLE_R}px at 50% 50%, transparent ${HOLE_R}px, black ${HOLE_R + 0.5}px)`;
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        {showVinyl && (
          <div style={{ position: 'absolute', inset: 0, background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: JS * 0.86, height: JS * 0.86, borderRadius: '50%',
              background: 'radial-gradient(circle at 34% 30%, #1a1a1a 0%, #050505 60%)',
              flexShrink: 0, position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {[0.82, 0.68, 0.54, 0.40].map((r) => (
                <div key={r} style={{
                  position: 'absolute',
                  width: `${r * 100}%`, height: `${r * 100}%`,
                  borderRadius: '50%',
                  border: '0.5px solid rgba(255,255,255,0.04)',
                  pointerEvents: 'none',
                }} />
              ))}
              <div style={{
                width: HOLE_D * 0.96, height: HOLE_D * 0.96, borderRadius: '50%',
                background: '#ffffff',
                flexShrink: 0, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <PressMark darkSurface={false} style={{ width: HOLE_D * 0.56, height: HOLE_D * 0.56, opacity: 0.78 }} />
                <div style={{
                  position: 'absolute', width: HOLE_D * 0.075, height: HOLE_D * 0.075,
                  borderRadius: '50%', background: '#f5f5f7',
                }} />
              </div>
            </div>
          </div>
        )}

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

  if (jacketType === null) {
    return (
      <div style={{
        width: JS, height: JS, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: '#a1a1a6',
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <line x1={16} y1={4} x2={16} y2={32} />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Select a jacket style</span>
      </div>
    );
  }

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
        <div style={{ position: 'absolute', inset: 0, perspective: '1200px', perspectiveOrigin: '50% 50%', overflow: 'visible' }}>
          {panels === 0 && (
            <div style={{ position: 'absolute', inset: 0 }}>
              <FrontFace />
            </div>
          )}

          {panels === 1 && (
            <>
              {/* interior panel sits exactly behind the cover — edges line up;
                  it is fully hidden until the front cover swings open */}
              <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: JS, height: JS,
                overflow: 'hidden', zIndex: 1,
              }}>
                <KraftFace />
              </div>
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

          {panels === 2 && (
            <>
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
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1 }}>
                <KraftFace />
              </div>
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
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 2, background: 'rgba(0,0,0,0.40)', zIndex: 4, pointerEvents: 'none', opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms` }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 2, background: 'rgba(0,0,0,0.40)', zIndex: 4, pointerEvents: 'none', opacity: open ? 1 : 0, transition: `opacity 300ms ease 150ms` }} />
            </>
          )}
        </div>

        {!open && (
          <div style={{
            position: 'absolute', top: 0, right: -SPINE_W, bottom: 0, width: SPINE_W,
            background: 'linear-gradient(90deg, #0a0a10 0%, #1a1a22 100%)',
            transform: 'rotateY(90deg)', transformOrigin: 'left center',
            pointerEvents: 'none',
          }} />
        )}
      </div>

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
            background: 'var(--q-card)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: `1px solid ${HAIRLINE}`,
            boxShadow: PILL_SHADOW,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: SUBINK,
            transition: 'color 120ms ease, background 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = INK; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = SUBINK; }}
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

// ═══════════════════════════════════════════════════════════════════
// SECTION 3 — INNER SLEEVE (from ArtistChooseInnerSleeve, verbatim)
// ═══════════════════════════════════════════════════════════════════
type SleeveVariant = { id: string; label: string; note: string };

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
      { id: 'board', label: 'Board Weight', note: 'Heavier board stock. More rigid — protects the record better.' },
      { id: 'paper', label: 'Paper',        note: 'Single-sided print on standard paper stock.' },
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

// Full-color print face — conic rainbow + logo (shared by sleeve & inserts).
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
        <PressMark style={{ width: logoSize, height: logoSize, opacity: 0.92 }} />
      </div>
    </>
  );
}

const SS = 321;
const HOLE_RATIO = 0.33;

function SleeveThumbnail({ sleeve, size = 48 }: { sleeve: SleeveLook; size: number }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? '1.5px solid #333' : `1.5px solid ${HAIRLINE}`;
  const hole    = size * HOLE_RATIO;

  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        background: sleeve.printed
          ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
          : bg,
        border,
        overflow: 'hidden',
        ...(holeMask ? { maskImage: holeMask, WebkitMaskImage: holeMask } : {}),
      }}>
        {sleeve.printed && <RainbowPrintFace logoSize={size * 0.52} />}
        {sleeve.boardWeight && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 3, background: 'rgba(255,255,255,0.25)' }} />
        )}
      </div>
      {sleeve.polylined && (
        <div style={{
          position: 'absolute', zIndex: 1,
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: hole, height: hole, borderRadius: '50%',
          background: 'linear-gradient(115deg, rgba(176,196,214,0.10) 0%, rgba(255,255,255,0.55) 34%, rgba(176,196,214,0.12) 52%, rgba(255,255,255,0.40) 72%, rgba(176,196,214,0.10) 100%)',
        }} />
      )}
    </div>
  );
}

function SleeveStage({ sleeve }: { sleeve: SleeveLook }) {
  const isBlack = sleeve.color === 'black';
  const bg      = isBlack ? '#0a0a0a' : '#ffffff';
  const border  = isBlack ? `1px solid #222` : `1px solid ${HAIRLINE}`;
  const hole    = SS * HOLE_RATIO;

  const holeRadius = hole / 2;
  const holeMask = sleeve.polylined
    ? `radial-gradient(circle at 50% 50%, transparent ${holeRadius}px, black ${holeRadius + 1}px)`
    : undefined;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{
        position: 'absolute',
        bottom: -14, left: '50%',
        transform: 'translateX(-50%)',
        width: SS * 0.75, height: 20,
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.07) 55%, transparent 80%)',
        pointerEvents: 'none',
      }} />

      {sleeve.polylined && (
        <div style={{
          position: 'absolute', zIndex: 1,
          left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: hole, height: hole, borderRadius: '50%',
          background: 'linear-gradient(115deg, rgba(176,196,214,0.10) 0%, rgba(255,255,255,0.60) 30%, rgba(176,196,214,0.14) 48%, rgba(255,255,255,0.45) 68%, rgba(176,196,214,0.10) 100%)',
        }} />
      )}

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
        {sleeve.printed && <RainbowPrintFace logoSize={SS * 0.42} />}

        {!sleeve.printed && sleeve.color === 'white' && (
          <>
            {Array.from({ length: 18 }, (_, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${(i + 1) * 5.2}%`, height: 0.5, background: 'rgba(0,0,0,0.025)' }} />
            ))}
          </>
        )}

        {!sleeve.printed && sleeve.color === 'black' && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)' }} />
        )}

        {sleeve.boardWeight && !sleeve.printed && (
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 5, background: isBlack ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
        )}
      </div>
    </div>
  );
}

function SleeveTile({
  sleeve,
  active,
  variantId,
  onSelect,
  onVariantSelect,
}: {
  sleeve: SleeveOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <SleeveThumbnail sleeve={sleeveLook(sleeve, variantId)} size={64} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {sleeve.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>
          {sleeve.note}
        </div>
        {active && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'var(--q-track)' }}>
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
                      color: vActive ? INK : '#8e8e93',
                      background: vActive ? 'var(--q-card)' : 'transparent',
                      boxShadow: vActive ? PILL_SHADOW : 'none',
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
              <div className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6', lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 4 — CENTER LABELS (from PressCatalogVinylLabels, verbatim)
// ═══════════════════════════════════════════════════════════════════
type LabelKind = 'blank' | 'bw' | 'color';

type LabelStyle = {
  id: LabelKind;
  name: string;
  note: string;
};

const LABEL_STYLES: LabelStyle[] = [
  { id: 'color', name: 'Full Color',    note: 'Vibrant full-color label — artists supply the design.' },
  { id: 'bw',    name: 'Black & White', note: 'White label with a single-color black logo print.' },
  { id: 'blank', name: 'Blank',         note: 'Unprinted white label. No artwork required.' },
];

function LabelLogo({ size, whiteFilter = true, offsetRight = false }: { size: number; whiteFilter?: boolean; offsetRight?: boolean }) {
  const brand = usePressBuilderBrand();
  const showArcText = size >= 70 && !offsetRight;
  const arcTextFill = whiteFilter ? 'rgba(245,245,247,0.55)' : 'rgba(0,0,0,0.38)';
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', userSelect: 'none' }}>
      <PressMark darkSurface={whiteFilter} style={{
        position: 'absolute', top: '50%', left: offsetRight ? '13.5%' : '50%',
        transform: 'translate(-50%, -50%)', width: size * (offsetRight ? 0.18 : 0.9),
        height: size * (offsetRight ? 0.18 : 0.9),
      }} />
      {showArcText && !brand.markOnly && (
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <path id="quote-lbl-arc-bottom" d="M 24 50 A 26 26 0 0 0 76 50" fill="none" />
          </defs>
          <text fill={arcTextFill} style={{ fontSize: 4.4, fontWeight: 600, letterSpacing: 1 }}>
            <textPath href="#quote-lbl-arc-bottom" startOffset="50%" textAnchor="middle">
              {brand.displayName.toUpperCase()}-001 · 33 ⅓ RPM
            </textPath>
          </text>
        </svg>
      )}
    </div>
  );
}

function CenterLabel({ kind, size, offsetLogo = false }: { kind: LabelKind; size: number; offsetLogo?: boolean }) {
  const base: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
  };
  const showLogo = size >= 24;

  if (kind === 'blank') {
    return (
      <div
        style={{
          ...base,
          background:
            'radial-gradient(circle at 42% 36%, #ffffff 0%, #f0f0f0 55%, #e8e8e8 100%)',
          boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.08)',
        }}
      />
    );
  }

  if (kind === 'bw') {
    return (
      <div style={{ ...base, background: 'radial-gradient(circle at 42% 36%, #ffffff 0%, #f4f4f4 60%, #ebebeb 100%)', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.07)' }}>
        {showLogo && <LabelLogo size={size} whiteFilter={false} offsetRight={offsetLogo} />}
      </div>
    );
  }

  return (
    <div style={{ ...base }}>
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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(60% 60% at 70% 74%, rgba(255,210,74,0.55), rgba(255,210,74,0) 62%)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(55% 55% at 30% 26%, rgba(120,150,255,0.55), rgba(120,150,255,0) 60%)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: offsetLogo
            ? 'radial-gradient(20% 20% at 13.5% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)'
            : 'radial-gradient(46% 46% at 50% 50%, rgba(0,0,0,0.52), rgba(0,0,0,0) 74%)',
        }}
      />
      {showLogo && <LabelLogo size={size} offsetRight={offsetLogo} />}
    </div>
  );
}

function LabelDisc({
  size,
  kind,
  bodyRef,
  holeRatio = 0.025,
  labelRatio,
  offsetLogo = false,
  swatch,
}: {
  size: number;
  kind: LabelKind;
  bodyRef?: React.RefObject<HTMLDivElement | null>;
  holeRatio?: number;
  labelRatio?: number;
  offsetLogo?: boolean;
  swatch?: Swatch;
}) {
  const LABEL_RATIO = labelRatio ?? (3.94 / 12);
  const INNER_RATIO = 129 / 1104;
  // Photo discs: the shot's baked-in label (plus its dark rim) reads slightly
  // larger than our drawn ratio — size the overlay up so it covers it fully.
  const labelSize = size * (swatch?.photo ? 0.40 : LABEL_RATIO);
  const spin = !!bodyRef;
  const translucent = swatch?.kind === 'translucent';
  const isSplatter = swatch?.kind === 'splatter';

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
        {swatch?.photo ? (
          /* Real press photo (Bill, Aug 16 2026) — spins with the body; the
             chosen label style overlays the photo's baked-in label below. */
          <img
            src={swatch.photo}
            alt=""
            aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.13)' }}
          />
        ) : swatch ? (
          <>
            {translucent ? (
              <MaskLayer color={swatch.base} mask={LAYERS.translucent} opacity={1} />
            ) : (
              <MaskLayer color={swatch.base} mask={LAYERS.opaque} />
            )}
            {isSplatter && (
              <>
                <MaskLayer color={swatch.s1 ?? swatch.base} mask={LAYERS.splatter1} />
                <MaskLayer color={swatch.s2 ?? swatch.base} mask={LAYERS.splatter2} />
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
          </>
        ) : (
          <MaskLayer color="#0b0b0d" mask={LAYERS.opaque} />
        )}

        {spin && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              pointerEvents: 'none',
              mixBlendMode: 'screen',
              opacity: 0.06,
              background:
                'conic-gradient(from 0deg,' +
                'rgba(255,255,255,0) 0deg, rgba(255,255,255,0.9) 24deg, rgba(255,255,255,0) 70deg,' +
                'rgba(255,255,255,0) 150deg, rgba(255,255,255,0.7) 176deg, rgba(255,255,255,0) 220deg,' +
                'rgba(255,255,255,0) 300deg, rgba(255,255,255,0.6) 324deg, rgba(255,255,255,0) 360deg)',
            }}
          />
        )}

        <CenterLabel kind={kind} size={labelSize} offsetLogo={offsetLogo} />

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
          backgroundColor: CANVAS,
          boxShadow: 'inset 0 0.5px 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

function LabelStage({ kind, holeRatio, discSize = 300, labelRatio, offsetLogo = false, swatch }: { kind: LabelKind; holeRatio?: number; discSize?: number; labelRatio?: number; offsetLogo?: boolean; swatch?: Swatch }) {
  const DISC_SIZE = discSize;
  const { bodyRef, onPointerEnter, onPointerLeave, showRewind, rewind } = useVinylSpin();
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 300, display: 'flex', alignItems: 'flex-end' }}>
        <div onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <LabelDisc size={DISC_SIZE} kind={kind} bodyRef={bodyRef} holeRatio={holeRatio} labelRatio={labelRatio} offsetLogo={offsetLogo} swatch={swatch} />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: -14,
            left: '50%',
            transform: 'translateX(-50%)',
            width: Math.round(DISC_SIZE * 0.52),
            height: 14,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.24)',
            filter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
        <div style={{ position: 'absolute', bottom: 4, right: -8, zIndex: 5 }}>
          <RewindButton show={showRewind} onClick={rewind} size={28} />
        </div>
      </div>
    </div>
  );
}

function LabelTile({
  style,
  active,
  onSelect,
  discSize = 96,
  labelRatio,
  holeRatio,
  offsetLogo = false,
}: {
  style: LabelStyle;
  active: boolean;
  onSelect: () => void;
  discSize?: number;
  labelRatio?: number;
  holeRatio?: number;
  offsetLogo?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
      aria-pressed={active}
      data-testid={`label-${style.id}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transition: 'all 0.35s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
            <LabelDisc size={discSize} kind={style.id} labelRatio={labelRatio} holeRatio={holeRatio} offsetLogo={offsetLogo} />
          </div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {style.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.35 }}>
        {style.note}
      </div>
    </div>
  );
}

// Label geometry per record size (from PressCatalogVinylLabels).
const LABEL_SIZE_SPECS: Record<SizeId, { inches: number; labelInches: number }> = {
  '7':  { inches: 7,  labelInches: 3.3 },
  '10': { inches: 10, labelInches: 3.94 },
  '12': { inches: 12, labelInches: 3.94 },
};

const HOLE_OPTIONS = [
  { id: 'small', label: 'Small Hole', note: 'Standard 0.3" spindle — plays anywhere.', holeInches: 0.3 },
  { id: 'large', label: 'Large Hole', note: 'Classic 1.5" jukebox 45 — needs an adapter on home turntables.', holeInches: 1.5 },
];

// ═══════════════════════════════════════════════════════════════════
// SECTION 5 — INSERTS (from ArtistChooseInserts, + None)
// ═══════════════════════════════════════════════════════════════════
type InsertVariant = { id: string; label: string; note: string };

type InsertOption = {
  id: 'none' | 'sheet' | 'gatefold' | 'booklet' | 'poster';
  name: string;
  note: string;
  variants: InsertVariant[];
  sizes?: SizeId[];
};

const INSERT_OPTIONS: InsertOption[] = [
  {
    id: 'none',
    name: 'None',
    note: 'No insert — the record ships without printed extras.',
    variants: [],
  },
  {
    id: 'sheet',
    name: 'Insert Sheet',
    note: 'Full-color flat sheet — lyrics, credits, liner notes. Printed both sides.',
    variants: [],
    sizes: ['10', '12'],
  },
  {
    id: 'gatefold',
    name: 'Gatefold Insert',
    note: 'Two-panel fold-out that opens from the center. Printed both sides.',
    variants: [],
    sizes: ['10', '12'],
  },
  {
    id: 'booklet',
    name: 'Booklet',
    note: 'Stapled multi-page booklet. Room for lyrics, art, and stories.',
    variants: [
      { id: 'p4', label: '4-Page', note: '' },
      { id: 'p8', label: '8-Page', note: '' },
    ],
    sizes: ['10', '12'],
  },
  {
    id: 'poster',
    name: 'Poster',
    note: 'Large fold-out poster that ships inside the jacket.',
    variants: [
      { id: 'small', label: '18" × 24"', note: 'Folds to fit the jacket.' },
      { id: 'large', label: '24" × 36"', note: 'Full wall poster — folds to fit.' },
    ],
    sizes: ['12'],
  },
];

const POSTER_RATIO: Record<'small' | 'large', number> = { small: 18 / 24, large: 24 / 36 };

function InsertThumbnail({ insert, variantId, size = 64 }: { insert: InsertOption; variantId: string; size?: number }) {
  if (insert.id === 'none') {
    return (
      <div style={{
        width: size, height: size, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#c7c7cc', fontSize: 18, fontWeight: 300,
      }}>—</div>
    );
  }

  if (insert.id === 'gatefold' || insert.id === 'booklet') {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', border: '1.5px solid #333', background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)' }}>
          <RainbowPrintFace logoSize={size * 0.52} />
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(90deg, rgba(0,0,0,0.45), rgba(0,0,0,0))' }} />
        </div>
      </div>
    );
  }

  const isPoster = insert.id === 'poster';
  const posterW = isPoster ? Math.round(size * POSTER_RATIO[(variantId as 'small' | 'large') || 'small']) : size;

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
        {isPoster && variantId === 'small' && (
          <>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
            <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
          </>
        )}
        {isPoster && variantId === 'large' && (
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

function InsertStage({ insert, variantId }: { insert: InsertOption; variantId: string }) {
  if (insert.id === 'none') {
    return (
      <div style={{
        width: SS, height: SS, flexShrink: 0,
        border: '1.5px dashed #d0d0d5', borderRadius: 4,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 8,
        color: '#a1a1a6',
      }}>
        <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <rect x={4} y={4} width={28} height={28} rx={1} />
          <path d="M14 4 L14 32" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 500 }}>No insert</span>
      </div>
    );
  }

  const isPoster = insert.id === 'poster';
  const stageW = isPoster ? Math.round(SS * POSTER_RATIO[(variantId as 'small' | 'large') || 'small']) : SS;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
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
      <div style={{ position: 'relative', zIndex: 1, width: SS, height: SS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          position: 'relative',
          width: stageW, height: SS, flexShrink: 0,
          background: 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)',
          border: '1px solid #222',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          transition: 'width 0.45s cubic-bezier(0.32, 0.72, 0.28, 1)',
        }}>
          <RainbowPrintFace logoSize={Math.min(stageW, SS) * 0.42} />
          {isPoster && variantId === 'small' && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            </>
          )}
          {isPoster && variantId === 'large' && (
            <>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.14)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '33.33%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '66.66%', height: 1, background: 'rgba(0,0,0,0.12)' }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InsertTile({
  insert,
  active,
  variantId,
  onSelect,
  onVariantSelect,
}: {
  insert: InsertOption;
  active: boolean;
  variantId: string;
  onSelect: () => void;
  onVariantSelect: (id: string) => void;
}) {
  const selectedVariant = insert.variants.find((v) => v.id === variantId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid={`insert-${insert.id}`}
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ width: '100%', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <InsertThumbnail insert={insert} variantId={variantId} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="text-[13.5px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
          {insert.name}
        </div>
        <div className="text-[12px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>
          {insert.note}
        </div>
        {active && insert.variants.length > 0 && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 10 }}>
            <div style={{ display: 'inline-flex', gap: 6, padding: 3, borderRadius: 999, background: 'var(--q-track)' }}>
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
                      color: vActive ? INK : '#8e8e93',
                      background: vActive ? 'var(--q-card)' : 'transparent',
                      boxShadow: vActive ? PILL_SHADOW : 'none',
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
              <div className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6', lineHeight: 1.4 }}>
                {selectedVariant.note}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECTION 6 — STICKERS (from PressCatalogStickers, verbatim, + None)
// ═══════════════════════════════════════════════════════════════════
type StickerShapeId = 'rect' | 'square' | 'circle' | 'upc';

type StickerSize = {
  id: string;
  name: string;
  wIn: number;
  hIn: number;
};

type StickerShape = {
  id: StickerShapeId;
  name: string;
  note: string;
  kind: 'promo' | 'upc';
  round: boolean;
  sizes: StickerSize[];
};

const sz = (wIn: number, hIn: number, round = false): StickerSize => ({
  id: `${wIn}x${hIn}`,
  name: round ? `${wIn}"` : `${wIn}" × ${hIn}"`,
  wIn,
  hIn,
});

const STICKER_SHAPES: StickerShape[] = [
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
          <PressMark darkSurface={false} style={{ width: minDim * 0.52, height: minDim * 0.52 }} />
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

const STAGE_PX_PER_INCH = 75;

function StickerStage({ size, shape }: { size: StickerSize | null; shape: StickerShape | null }) {
  if (!shape || !size) {
    return (
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        <div style={{ position: 'relative', height: 310, display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 260, height: 260,
            border: '1.5px dashed #d0d0d5', borderRadius: 4,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            color: '#a1a1a6',
          }}>
            <svg width={36} height={36} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
              <circle cx={18} cy={18} r={13} />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 500 }}>No sticker</span>
          </div>
        </div>
      </div>
    );
  }
  const w = Math.round(size.wIn * STAGE_PX_PER_INCH);
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <div style={{ position: 'relative', height: 310, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ transition: 'all 0.4s cubic-bezier(0.32, 0.72, 0.28, 1)' }}>
          <Sticker size={size} shape={shape} pxPerInch={STAGE_PX_PER_INCH} />
        </div>
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

function ShapeTile({
  shape,
  active,
  onSelect,
}: {
  shape: StickerShape;
  active: boolean;
  onSelect: () => void;
}) {
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
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sticker size={rep} shape={shape} pxPerInch={tilePxPerInch} />
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        {shape.name}
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.35 }}>
        {shape.sizes.length === 1 ? shape.sizes[0].name : `${shape.sizes.length} sizes`}
      </div>
    </div>
  );
}

function NoneShapeTile({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      aria-pressed={active}
      data-testid="sticker-shape-none"
      className="rounded-2xl bg-white text-left transition-all hover:-translate-y-px focus:outline-none cursor-pointer"
      style={{ padding: 16, border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}` }}
    >
      <div className="flex justify-center" style={{ marginBottom: 12 }}>
        <div style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            width: 64, height: 64,
            border: '1.5px dashed #d0d0d5', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#c7c7cc', fontSize: 18, fontWeight: 300,
          }}>—</div>
        </div>
      </div>
      <div className="text-[13px] font-semibold leading-tight" style={{ color: active ? BLUE : INK }}>
        None
      </div>
      <div className="text-[11.5px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.35 }}>
        No sticker on the shrink-wrap.
      </div>
    </div>
  );
}

function SizeCard({
  size,
  round,
  active,
  onSelect,
}: {
  size: StickerSize;
  round: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      data-testid={`sticker-size-${size.id}`}
      className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
      style={{ padding: '14px 10px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
    >
      <div className="text-[15px] font-semibold" style={{ color: active ? BLUE : INK }}>{size.name}</div>
      <div className="text-[11px]" style={{ marginTop: 2, color: '#a1a1a6' }}>
        {round ? 'Circle' : size.wIn === size.hIn ? 'Square' : 'Rectangle'}
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHELL (from the donor screens, verbatim)
// ═══════════════════════════════════════════════════════════════════
// ─── THE canon press rail — copied from PressRailCanon (Bill, Aug 16 2026) ───
type PressNavChild = { label: string; icon: typeof LayoutDashboard; soon?: boolean; route?: string };
type PressNavItem = { label: string; icon: typeof LayoutDashboard; soon?: boolean; children?: PressNavChild[] };

const PRESS_NAV: PressNavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Clients', icon: Users },
  {
    // Create (founder, Aug 16 2026): an estimate or a package are two different
    // creations on two pages — one "Create" entry, live links to each.
    label: 'Create', icon: NavEstimates,
    children: [
      { label: 'Estimates', icon: NavEstimates, route: 'PressEstimatesIndex' },
      { label: 'Packages', icon: NavPackage, route: 'PressPackagesIndex' },
    ],
  },
  { label: 'Projects', icon: Disc3 },
  { label: 'Acquisition', icon: UserPlus },
  {
    label: 'Product Specs', icon: Library,
    children: [
      { label: 'GoodTunes Packages', icon: NavPackage },
      { label: 'GoodDeed Certificates', icon: NavAward },
      { label: 'Specs', icon: NavWave },
      { label: 'Templates', icon: NavTemplate },
    ],
  },
  {
    label: 'Components', icon: Boxes,
    children: [
      { label: 'Vinyl', icon: NavVinyl },
      { label: 'Jackets', icon: NavJacket },
      { label: 'Inner Sleeves', icon: NavLayers },
      { label: 'Center Labels', icon: NavLabel },
      { label: 'Inserts', icon: NavInsert },
      { label: 'Stickers', icon: NavSticker },
      { label: 'Pricing', icon: NavPricing },
    ],
  },
  { label: 'White Label', icon: NavLayers, soon: true },
  { label: 'Settings', icon: Cog },
  { label: 'Referrals', icon: Gift },
];

// The builder is a verb, not a catalog noun — it lives under its own
// top-level Estimates (between Clients and Projects), mirroring the
// artist's Drafts → Projects. One engine, two exits: Create package
// (back into the catalog) or Send estimate (to a client).
const ACTIVE_NAV = 'Packages';
const ARTIST_BUILDER_NAV: Array<{ label: string; icon: typeof LayoutDashboard; active?: boolean }> = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Releases', icon: Disc3, active: true },
  { label: 'Audience', icon: Users },
  { label: 'Acquisition', icon: Megaphone },
  { label: 'Orders', icon: ShoppingBag },
  { label: 'Buyers', icon: UserCheck },
  { label: 'Referrals', icon: UserPlus },
  { label: 'Shopify', icon: Store },
  { label: 'Reports', icon: BarChart3 },
];

function NavLeaf({ label, icon: Icon, soon, route, child }: PressNavChild & { child?: boolean }) {
  const brand = usePressBuilderBrand();
  const isActive = brand.activeNav === 'builder' ? label === ACTIVE_NAV : label === `${brand.displayName} Packages`;
  const resolvedRoute = route === 'PressPackagesIndex'
    ? (brand.variant === 'memphis' ? 'PressPackageBuilder' : `PressCatalog${brand.variant === 'paramount' ? 'Paramount' : 'Hellbender'}Dark`)
    : label === `${brand.displayName} Packages`
      ? `PressPackagesPressIndex?press=${brand.variant}`
      : route;
  return (
    <a
      href={resolvedRoute ? `#/${resolvedRoute}` : '#'}
      onClick={(e) => { if (!resolvedRoute) e.preventDefault(); }}
      className={cn(
        'flex items-center gap-2.5 pr-2.5 h-9 rounded-lg transition-colors',
        child ? 'pl-7 text-[13px]' : 'pl-2.5 text-[13.5px]',
        !isActive && 'hover:bg-black/5',
      )}
      style={{
        fontWeight: isActive ? 600 : 500,
        color: isActive ? INK : SUBINK,
        backgroundColor: isActive ? 'var(--q-card)' : undefined,
        boxShadow: isActive ? PILL_SHADOW : undefined,
      }}
      data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? INK : '#a1a1a6' }} />
      <span className="truncate flex-1">{label}</span>
      {soon && (
        <span className="text-[10px] font-semibold px-2 h-[18px] inline-flex items-center rounded-full flex-shrink-0" style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: SUBINK }}>
          Request
        </span>
      )}
    </a>
  );
}

function PressNavTree() {
  const brand = usePressBuilderBrand();
  const navItems = PRESS_NAV.map((item) => item.label === 'Product Specs' && brand.variant !== 'memphis'
    ? { ...item, children: item.children?.map((child) => child.label === 'GoodTunes Packages'
      ? { ...child, label: `${brand.displayName} Packages`, route: `PressPackagesPressIndex?press=${brand.variant}` }
      : child) }
    : item);
  // The group holding the active page starts open; the other starts closed.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const item of navItems) {
      if (item.children) o[item.label] = item.children.some((c) => c.label === (brand.activeNav === 'builder' ? ACTIVE_NAV : `${brand.displayName} Packages`));
    }
    return o;
  });
  return (
    <>
      {navItems.map((item) => {
        if (item.children) {
          const isOpen = open[item.label];
          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [item.label]: !o[item.label] }))}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-lg text-[13.5px] transition-colors hover:bg-black/5"
                style={{ fontWeight: 500, color: SUBINK }}
                data-testid={`nav-group-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <NavChevron className="w-4 h-4 flex-shrink-0 transition-transform" style={{ color: '#a1a1a6', transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                <span className="truncate flex-1 text-left">{item.label}</span>
              </button>
              {isOpen && (
                <div className="space-y-0.5">
                  {item.children.map((c) => <NavLeaf key={c.label} {...c} child />)}
                </div>
              )}
            </div>
          );
        }
        return <NavLeaf key={item.label} {...item} />;
      })}
    </>
  );
}

function ArtistBuilderNav() {
  return (
    <>
      {ARTIST_BUILDER_NAV.map(({ label, icon: Icon, active }) => (
        <a
          key={label}
          href="#"
          onClick={(event) => event.preventDefault()}
          className="flex items-center gap-2.5 px-2.5 h-9 rounded-lg transition-colors hover:bg-black/5 text-[13.5px]"
          style={{
            fontWeight: active ? 600 : 500,
            color: active ? INK : SUBINK,
            backgroundColor: active ? 'var(--q-card)' : undefined,
            boxShadow: active ? PILL_SHADOW : undefined,
          }}
          data-testid={`artist-nav-${label.toLowerCase()}`}
        >
          <Icon className="w-4 h-4 flex-shrink-0" style={{ color: active ? INK : '#a1a1a6' }} />
          <span className="truncate">{label}</span>
        </a>
      ))}
      <div className="pt-2 mt-auto" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <a
          href="#"
          onClick={(event) => event.preventDefault()}
          className="flex items-center gap-2.5 px-2.5 h-9 rounded-lg transition-colors hover:bg-black/5 text-[13.5px]"
          style={{ fontWeight: 500, color: SUBINK }}
          data-testid="artist-nav-settings"
        >
          <Cog className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
          <span>Settings</span>
        </a>
      </div>
    </>
  );
}

const USER_MENU: Array<{ label: string; icon: typeof UserPen }> = [
  { label: 'Edit profile', icon: UserPen },
  { label: 'Invite teammate', icon: UserPlus },
  { label: 'Security', icon: ShieldCheck },
];

function UserMenu({ qMode, setQMode }: { qMode: QMode; setQMode: (m: QMode) => void }) {
  const brand = usePressBuilderBrand();
  const audience = usePressBuilderAudience();
  const accountName = audience === 'artist' ? 'Alex Tebeleff' : brand.operatorName;
  const accountEmail = audience === 'artist' ? 'alex@howband.com' : brand.operatorEmail;
  const accountPhoto = audience === 'artist' ? alexPhoto : brand.operatorPhoto;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 transition-shadow"
          aria-label="Account menu"
          data-testid="button-user-menu"
        >
          <img src={accountPhoto} alt={accountName} className="w-full h-full object-cover" />
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
          <div className="text-[13.5px] font-semibold" style={{ color: INK }}>{accountName}</div>
          <div className="text-[11.5px] truncate" style={{ color: SUBINK }}>{accountEmail}</div>
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
        {/* Appearance — canon segmented control (Light / Dark / System) */}
        <div className="px-3.5 py-2.5" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginBottom: 8 }}>Appearance</div>
          <div className="flex rounded-full p-0.5" style={{ border: `1px solid ${HAIRLINE}` }} role="radiogroup" aria-label="Appearance">
            {(['light', 'dark', 'system'] as QMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={qMode === m}
                onClick={() => setQMode(m)}
                className="flex-1 h-7 rounded-full text-[12px] transition-colors capitalize"
                style={{
                  fontWeight: qMode === m ? 600 : 500,
                  color: qMode === m ? INK : SUBINK,
                  backgroundColor: qMode === m ? 'var(--q-canvas)' : 'transparent',
                  boxShadow: qMode === m ? PILL_SHADOW : undefined,
                }}
                data-testid={`appearance-${m}`}
              >
                {m}
              </button>
            ))}
          </div>
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

export function PressShell({ children }: { children: ReactNode }) {
  const brand = usePressBuilderBrand();
  const audience = usePressBuilderAudience();
  // Artist appearance never inherits a press/operator selection. Its optional
  // Hellbender choice is deliberately scoped under a separate artist key.
  const appearanceStorageKey = audience === 'artist'
    ? `gt-artist-appearance-${brand.variant}`
    : `gt-appearance-${brand.variant}`;
  const [qMode, setQMode] = useState<QMode>(() => {
    try {
      const v = localStorage.getItem(appearanceStorageKey);
      return v === 'light' || v === 'dark' || v === 'system' ? v : (audience === 'artist' ? 'light' : brand.defaultMode);
    } catch { return audience === 'artist' ? 'light' : brand.defaultMode; }
  });
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const isDark = qMode === 'dark' || (qMode === 'system' && systemDark);
  // Layout timing prevents a mounted artist builder from ever briefly taking on
  // a prior press/operator dark document attribute before its own key resolves.
  useLayoutEffect(() => {
    try { localStorage.setItem(appearanceStorageKey, qMode); } catch { /* mock */ }
    if (isDark) document.documentElement.setAttribute('data-gt-dark', '');
    else document.documentElement.removeAttribute('data-gt-dark');
    return () => { document.documentElement.removeAttribute('data-gt-dark'); };
  }, [appearanceStorageKey, qMode, isDark]);
  return (
    <div className="q-root h-screen flex flex-col font-sans" style={{ backgroundColor: CANVAS, color: INK }}>
      <style>{Q_THEME_CSS}</style>
      <header
        className="h-14 flex-shrink-0 flex items-center justify-between gap-4 pl-3 pr-6 sticky top-0 z-20"
        style={{
          backgroundColor: 'var(--q-frost)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
            {brand.variant === 'hellbender' ? (
            <img
              src={brand.labelMark}
              alt=""
              aria-hidden
              className="h-8 w-8 flex-shrink-0 object-contain"
              style={{ filter: 'brightness(0) saturate(100%) invert(14%) sepia(99%) saturate(6155%) hue-rotate(354deg) brightness(98%) contrast(101%)' }}
            />
          ) : (
            <span className="h-9 w-9 rounded-full ring-1 ring-slate-200 flex items-center justify-center flex-shrink-0 p-1" style={{ backgroundColor: '#ffffff' }}>
              <img src={brand.logo} alt={brand.legalName} className="w-full h-full object-contain" />
            </span>
          )}
          <span className="text-[15px] font-semibold whitespace-nowrap" style={{ color: INK }}>
            {brand.legalName}
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
          <UserMenu qMode={qMode} setQMode={setQMode} />
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
                className="w-full h-9 pl-8 pr-10 rounded-full bg-white text-[12.5px] placeholder:text-slate-400 focus:outline-none"
                style={{ border: `1px solid ${HAIRLINE}`, color: INK }}
                placeholder="Search…"
                readOnly
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] pointer-events-none" style={{ color: '#a1a1a6' }}>⌘K</span>
            </div>
          </div>
          <nav className="flex-1 px-2.5 pt-1 pb-3 space-y-0.5 overflow-y-auto">
            {audience === 'artist' ? <ArtistBuilderNav /> : <PressNavTree />}
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

// Section heading — the donor screens' PageHeading scale, reused per section.
function SectionHeading({ lead, rest, sub }: { lead: string; rest: string; sub: string }) {
  return (
    <div className="min-w-0">
      <h2 className="tracking-tight" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.08 }}>
        <span style={{ color: INK }}>{lead} </span>
        <span style={{ color: '#a1a1a6', fontWeight: 600 }}>{rest}</span>
      </h2>
      <p style={{ fontSize: 15, marginTop: 8, maxWidth: 560, color: SUBINK }}>
        {sub}
      </p>
    </div>
  );
}

// Progressive-step order — Apple buy-flow style. 'hole' only applies to 7".
type StepKey = 'size' | 'discs' | 'qty' | 'weight' | 'ctype' | 'color' | 'jacket' | 'sleeve' | 'hole' | 'label' | 'insert' | 'sticker';
const STEP_ORDER: StepKey[] = ['size', 'discs', 'weight', 'ctype', 'color', 'jacket', 'sleeve', 'hole', 'label', 'insert', 'sticker', 'qty'];

// Locked steps sit at low opacity and ignore clicks until unlocked.
function Gate({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div aria-disabled={!on} style={{ opacity: on ? 1 : 0.35, pointerEvents: on ? 'auto' : 'none', transition: 'opacity 0.4s ease' }}>
      {children}
    </div>
  );
}

// Donor split-grid section: sticky preview left, pickers right.
function SplitSection({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 520px', gap: 56, alignItems: 'start' }}>
      <div className="sticky" style={{ top: 148 }}>
        <div className="flex flex-col items-center">{left}</div>
      </div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}

// ─── Clients ──────────────────────────────────────────────────────────
// Blind-quote flow (Bill, Aug 16 2026): staff builds without a client, then
  // searches the database at save time — Spotify grabs the artist if missing.

// Seeded prices (per unit, before the run-size discount on the vinyl itself).
// Prices are the at-1,000-unit anchor, calibrated to the frozen client
// estimate (MRP 071526-02): ruby vinyl 2.30 · label 0.25 · jacket 0.81 ·
// sleeve 0.81 · insert 0.67 · assembly 0.36 · shrinkwrap 0.17 = 5.37/unit.
const MOCK_WEIGHT_UP = { '140': 0, '180': 0.40 } as Record<string, number>;
const MOCK_LABEL_PRICE = { blank: 0.10, bw: 0.18, color: 0.25 } as Record<LabelKind, number>;
const MOCK_JACKET_PRICE = { single: 0.81, gatefold: 1.26, trifold: 1.62, discobag: 0.54 } as Record<string, number>;
const MOCK_SLEEVE_PRICE = { printed: 0.81, unprinted: 0.24, polylined: 0.30 } as Record<string, number>;
const MOCK_INSERT_PRICE = { none: 0, sheet: 0.67, gatefold: 0.98, booklet: 1.44, poster: 1.65 } as Record<string, number>;
// Press minimum (Bill, Aug 16 2026): the press won't run splatter under 300
// units — those quantity cards gray out as "Unavailable", no price shown.
const MOCK_KIND_MIN_QTY: Record<string, number> = { splatter: 300 };
const MOCK_ASSEMBLY_PRICE = 0.36; // insert placed on top before shrink
const MOCK_SHRINK_PRICE = 0.17;   // retail-ready seal
const MOCK_STICKER_PRICE = { none: 0, rect: 0.30, square: 0.35, circle: 0.45, upc: 0.18 } as Record<string, number>;

// ─── "How artists will see it." — the artist-rail card system ─────────
// Ratified principle (Bill, Aug 19 2026): the press supplies variables, the
// SYSTEM does the design. Cover compositions are the uniform card system
// from ArtistReleasePackageTemplates (same placement, same disc position) —
// unique gradient ids (ppb-) so the SVGs don't collide with other mocks.

function PpbCoverAmber() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Amber cover: warm sunset bands">
      <defs>
        <linearGradient id="ppb-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a1f0e" /><stop offset="0.55" stopColor="#8a4718" /><stop offset="1" stopColor="#d67a34" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-amber)" />
      <rect x="0" y="128" width="460" height="14" fill="rgba(0,0,0,0.28)" />
      <rect x="0" y="150" width="460" height="10" fill="rgba(0,0,0,0.2)" />
      <rect x="0" y="167" width="460" height="7" fill="rgba(0,0,0,0.14)" />
    </svg>
  );
}
function PpbCoverCharcoal() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Charcoal cover: quiet pinstripes">
      <defs>
        <linearGradient id="ppb-char" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#232327" /><stop offset="1" stopColor="#101012" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-char)" />
      {[0, 60, 120, 180, 240, 300, 360, 420].map((x) => (
        <line key={x} x1={x} y1="0" x2={x + 90} y2="260" stroke="rgba(255,255,255,0.045)" strokeWidth="10" />
      ))}
    </svg>
  );
}
function PpbCoverTeal() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Teal cover: splatter dabs">
      <defs>
        <linearGradient id="ppb-teal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e2b2a" /><stop offset="1" stopColor="#123c38" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-teal)" />
      <circle cx="70" cy="60" r="16" fill="#f2c94c" /><circle cx="395" cy="48" r="11" fill="#e0466b" />
      <circle cx="330" cy="120" r="8" fill="#f2c94c" /><circle cx="120" cy="140" r="7" fill="#4ec9b0" />
      <circle cx="420" cy="150" r="14" fill="#4ec9b0" /><circle cx="30" cy="180" r="9" fill="#e0466b" />
    </svg>
  );
}
function PpbCoverViolet() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Violet cover: gatefold spine motif">
      <defs>
        <linearGradient id="ppb-violet" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1436" /><stop offset="1" stopColor="#332457" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-violet)" />
      <line x1="230" y1="0" x2="230" y2="178" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />
    </svg>
  );
}
function PpbCoverCoastal() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Coastal cover: deep blue horizon">
      <defs>
        <linearGradient id="ppb-coastal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d2740" /><stop offset="1" stopColor="#2f6f9a" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-coastal)" />
      <ellipse cx="230" cy="210" rx="320" ry="70" fill="rgba(255,255,255,0.06)" />
      <ellipse cx="230" cy="236" rx="320" ry="60" fill="rgba(255,255,255,0.05)" />
    </svg>
  );
}
function PpbCoverPressroom() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Pressroom cover: warm gray with groove rings">
      <defs>
        <linearGradient id="ppb-press" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2723" /><stop offset="1" stopColor="#4a423a" />
        </linearGradient>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-press)" />
      {[40, 70, 100, 130].map((r) => (
        <circle key={r} cx="392" cy="52" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2" />
      ))}
    </svg>
  );
}

// "Match my vinyl" — a SYSTEM-generated background derived from the chosen
// vinyl's colors: darken + shift hue toward the complement so the disc pops.
// Near-black vinyl gets a warm charcoal-amber instead of a dead gray.
function ppbHexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

function matchVinylBackground(base: string): string {
  const { h, s } = ppbHexToHsl(base);
  // Black-ish vinyl: complement of "nothing" is noise — go warm amber-charcoal.
  const dead = s < 0.14;
  const ch = dead ? 32 : Math.round((h + 180) % 360);
  const cs = dead ? 34 : Math.round(Math.min(s * 100, 52));
  return `linear-gradient(165deg, hsl(${ch} ${cs}% 9%) 0%, hsl(${ch} ${Math.min(cs + 8, 60)}% 20%) 100%)`;
}

// "Logo" — MRP's mark, ghosted like a debossed watermark on near-black warm
// charcoal (Bill's color call). It sits BEHIND the disc, large and
// centered-high so it peeks around the disc's arc.
function PpbCoverLogo() {
  const brand = usePressBuilderBrand();
  return (
    <div aria-label={`Logo cover: ghosted ${brand.displayName} mark on warm charcoal`} role="img" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, #1a1817 0%, #0f0e0d 100%)' }}>
      <img
        src={brand.labelMark ?? brand.logo}
        alt=""
        aria-hidden
        style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: '85%', opacity: 0.2, filter: 'invert(1)' }}
      />
    </div>
  );
}

// "Your own" — a mock uploaded background. The press changes the BACKGROUND
// freely; the SYSTEM keeps the composition (disc arcing from the bottom,
// sell line over the automatic top scrim, name/price grammar untouched).
// Bill, Aug 20 2026: the stand-in must contain NO records, NO logos, NO album
// anything — so it's a pure CSS/SVG "studio wall": layered warm-neutral
// gradients + turbulence grain that reads as an uploaded texture photo.
function PpbCoverCustom() {
  return (
    <svg viewBox="0 0 460 260" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Uploaded background: warm studio-wall texture">
      <defs>
        <linearGradient id="ppb-upl-base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1613" /><stop offset="0.55" stopColor="#2c241d" /><stop offset="1" stopColor="#1e1a16" />
        </linearGradient>
        <radialGradient id="ppb-upl-glow" cx="0.28" cy="0.22" r="0.9">
          <stop offset="0" stopColor="#5a4632" stopOpacity="0.55" /><stop offset="0.6" stopColor="#3a2e22" stopOpacity="0.18" /><stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ppb-upl-vig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000000" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
        <filter id="ppb-upl-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0" />
        </filter>
      </defs>
      <rect width="460" height="260" fill="url(#ppb-upl-base)" />
      <rect width="460" height="260" fill="url(#ppb-upl-glow)" />
      <rect width="460" height="260" fill="url(#ppb-upl-vig)" />
      <rect width="460" height="260" filter="url(#ppb-upl-grain)" />
    </svg>
  );
}

const PPB_COVERS: Array<{ id: string; name: string; ad: () => ReactNode; chip: string }> = [
  { id: 'amber', name: 'Amber', ad: PpbCoverAmber, chip: 'linear-gradient(180deg, #3a1f0e, #d67a34)' },
  { id: 'charcoal', name: 'Pinstripe', ad: PpbCoverCharcoal, chip: 'linear-gradient(135deg, #232327, #101012)' },
  { id: 'teal', name: 'Teal', ad: PpbCoverTeal, chip: 'linear-gradient(180deg, #0e2b2a, #123c38)' },
  { id: 'violet', name: 'Violet', ad: PpbCoverViolet, chip: 'linear-gradient(135deg, #1c1436, #332457)' },
  { id: 'coastal', name: 'Coastal', ad: PpbCoverCoastal, chip: 'linear-gradient(180deg, #0d2740, #2f6f9a)' },
  { id: 'pressroom', name: 'Pressroom', ad: PpbCoverPressroom, chip: 'linear-gradient(135deg, #2b2723, #4a423a)' },
  { id: 'logo', name: 'Logo', ad: PpbCoverLogo, chip: 'linear-gradient(180deg, #1a1817, #0f0e0d)' },
  { id: 'custom', name: 'Your own', ad: PpbCoverCustom, chip: '' },
];

// ─── EDIT MODE (Bill, Aug 19 2026) — the builder can open an existing
// package COMPLETED: #/PressPackageBuilder?pkg=heavyweight. No param =
// create-from-scratch, unchanged. Seeds mirror the PressPackagesIndex cards.
function getEditPkgId(): string | null {
  const m = window.location.hash.match(/[?&]pkg=([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

type EditSeed = {
  title: string;
  weightId: string;
  colorId: string;
  colorKind: SwatchKind;
  jacketId: string;
  sleeveId: string;
  insertId: string;
  cardName: string;
  cardSell: string;
  cardCoverId: string;
  minRun: number; // the package's minimum run — the price anchor
  stats: { status: 'Live' | 'Draft'; estimates: number; projects: number; lastEdited: string };
};

const EDIT_SEEDS: Record<string, EditSeed> = {
  heavyweight: {
    title: 'The Heavyweight',
    weightId: '180', colorId: 'SP2', colorKind: 'splatter',
    jacketId: 'gatefold', sleeveId: 'printed', insertId: 'booklet',
    cardName: 'The Heavyweight', cardSell: 'The one that sounds like the master.', cardCoverId: 'amber',
    minRun: 500,
    stats: { status: 'Live', estimates: 12, projects: 4, lastEdited: 'Aug 12, 2026' },
  },
  'standard-black': {
    title: 'Standard Black',
    weightId: '140', colorId: 'BK1', colorKind: 'black',
    jacketId: 'single', sleeveId: 'printed', insertId: 'sheet',
    cardName: 'Standard Black', cardSell: 'Everything a first pressing needs.', cardCoverId: 'charcoal',
    minRun: 300,
    stats: { status: 'Live', estimates: 8, projects: 3, lastEdited: 'Jul 30, 2026' },
  },
  'splatter-special': {
    title: 'Splatter Special',
    weightId: '140', colorId: 'SP2', colorKind: 'splatter',
    jacketId: 'single', sleeveId: 'polylined', insertId: 'sheet',
    cardName: 'Splatter Special', cardSell: 'Loud on the shelf, louder on the deck.', cardCoverId: 'teal',
    minRun: 300,
    stats: { status: 'Live', estimates: 5, projects: 2, lastEdited: 'Aug 4, 2026' },
  },
  'ruby-translucent': {
    title: 'Ruby Translucent',
    weightId: '180', colorId: 'T01', colorKind: 'translucent',
    jacketId: 'gatefold', sleeveId: 'printed', insertId: 'poster',
    cardName: 'Ruby Translucent', cardSell: 'Hold it up to the light.', cardCoverId: 'violet',
    minRun: 500,
    stats: { status: 'Draft', estimates: 0, projects: 0, lastEdited: 'Aug 15, 2026' },
  },
  'disco-bag': {
    title: 'DJ Disco Bag',
    weightId: '140', colorId: 'BK1', colorKind: 'black',
    jacketId: 'discobag', sleeveId: 'unprinted', insertId: 'none',
    cardName: 'DJ Disco Bag', cardSell: 'No jacket, no fuss — just the record.', cardCoverId: 'pressroom',
    minRun: 300,
    stats: { status: 'Draft', estimates: 0, projects: 0, lastEdited: 'Aug 17, 2026' },
  },
};

// ═══════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════
function PressPackageBuilderInner() {
  const brand = usePressBuilderBrand();
  const audience = usePressBuilderAudience();
  // Edit mode resolves once per mount — hash routing remounts the mock.
  const editId = getEditPkgId();
  const seed = editId ? EDIT_SEEDS[editId] ?? null : null;
  // ── Shared state — the record size flows through every section ──
  const [sizeId, setSizeId] = useState<SizeId>('12');
  const [discs, setDiscs] = useState<number>(1);
  // Save is just save (Bill, Aug 22 2026): the name comes from the
  // "How artists will see it" section — no second naming prompt at save.
  const [pkgName] = useState(seed ? seed.title : '');
  const [pkgSaved, setPkgSaved] = useState(false);
  // The save moment is subtle, cross-page (Bill): save, brief beat so the
  // click lands, then roll back to the index — which whispers the arrival.
  const finishSave = () => {
    setPkgSaved(true);
    if (audience === 'artist') return;
    window.setTimeout(() => {
      const indexRoute = brand.variant === 'memphis' ? 'PressPackagesIndex' : `PressPackagesPressIndex?press=${brand.variant}`;
      window.location.hash = editId ? `#/${indexRoute}&saved=${editId}` : `#/${indexRoute}`;
    }, 400);
  };
  const [qty, setQty] = useState<number>(500);
  const [weightId, setWeightId] = useState<string>(seed ? seed.weightId : '140');
  const [colorId, setColorId] = useState<string>(seed ? seed.colorId : brand.defaultColorId);
  const [colorKind, setColorKind] = useState<SwatchKind>(seed ? seed.colorKind : brand.defaultColorKind);

  const [jacketId, setJacketId] = useState<string>(seed ? seed.jacketId : 'single');
  const [jacketVariantId, setJacketVariantId] = useState<string>(() =>
    seed ? ((JACKET_CATALOG['12'] ?? []).find((j) => j.id === seed.jacketId)?.variants[0]?.id ?? 'standard') : 'standard');

  const [sleeveId, setSleeveId] = useState<string>(seed ? seed.sleeveId : 'printed');
  const [sleeveVariantId, setSleeveVariantId] = useState<string>(() =>
    seed ? (SLEEVE_OPTIONS.find((s) => s.id === seed.sleeveId)?.variants[0]?.id ?? 'board') : 'board');
  // Qty-stage artwork: MRP house art by default; the button swaps in the
  // artist's temp artwork (Bill, Aug 16 2026).
  const [useArtistArt, setUseArtistArt] = useState(false);
  // Qty-stage record spins on hover, same feel as the hero discs.
  const qtySpin = useVinylSpin();

  const [labelId, setLabelId] = useState<LabelKind>('bw');
  const [holeId, setHoleId] = useState<string>('small');

  const [insertId, setInsertId] = useState<string>(seed ? seed.insertId : 'none');
  const [insertVariantId, setInsertVariantId] = useState<string>(() =>
    seed ? (INSERT_OPTIONS.find((o) => o.id === seed.insertId)?.variants[0]?.id ?? '') : '');

  const [stickerShapeId, setStickerShapeId] = useState<StickerShapeId | 'none'>('none');
  const [stickerSizeId, setStickerSizeId] = useState<string>('3x3');

  // ── Quantity-card curation (press-side, Bill) ──────────────────────
  // A press can hide the tiers it isn't offering (e.g. a special 100-run
  // price) so artists only see the intended one(s). Hidden cards stay in
  // the press's own grid — dimmed with a word+icon chip — never deleted.
  const [hiddenQtys, setHiddenQtys] = useState<Set<number>>(() => new Set());
  // Custom quantities the press adds beyond the six defaults; these get a
  // "Remove this quantity" affordance the defaults never have.
  const [customQtys, setCustomQtys] = useState<number[]>([]);
  // Which card's ··· menu is open, keyed by quantity.
  const [qtyMenuOpen, setQtyMenuOpen] = useState<number | null>(null);
  // Inline add-a-quantity mini-form.
  const [addingQty, setAddingQty] = useState(false);
  const [addQtyValue, setAddQtyValue] = useState('');

  // "How artists will see it." (Bill, Aug 19 2026) — the press supplies
  // variables, the system does the design. Vinyl color is NOT an input here;
  // it reads from the chosen vinyl in section 1.
  // Create mode: the name starts EMPTY — this section IS the naming moment.
  const [cardName, setCardName] = useState(seed ? seed.cardName : '');
  const [cardSell, setCardSell] = useState(seed ? seed.cardSell : '');
  // 'match' = system-derived from the vinyl — the default for new packages.
  const [cardCoverId, setCardCoverId] = useState(seed ? seed.cardCoverId : 'match');
  // Mock "upload" — the Upload tile opens the canon upload sheet; seating from
  // the sheet flips the tile thumb to the abstract studio-wall stand-in.
  const [customUploaded, setCustomUploaded] = useState(seed?.cardCoverId === 'custom');
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const seatUpload = () => { setCustomUploaded(true); setCardCoverId('custom'); setUploadSheetOpen(false); };

  const [qbDetailsOpen, setQbDetailsOpen] = useState(false);
  const [qbSetupOpen, setQbSetupOpen] = useState(false);

  // Collapse: the type grid folds to a summary row once a color is picked.
  const [typeOpen, setTypeOpen] = useState(!seed);

  // ── Apple-style progressive steps — each unlocks after the one before ──
  // Edit mode opens with every step already seated.
  const [done, setDone] = useState<Set<StepKey>>(() => (seed ? new Set(STEP_ORDER) : new Set()));
  const mark = (k: StepKey) => setDone((p) => (p.has(k) ? p : new Set(p).add(k)));
  const picked = (k: StepKey) => done.has(k);
  const skipStep = (k: StepKey) => k === 'hole' && sizeId !== '7';
  const canDo = (k: StepKey) =>
    STEP_ORDER.slice(0, STEP_ORDER.indexOf(k)).every((s) => skipStep(s) || done.has(s));
  const allDone = STEP_ORDER.every((s) => skipStep(s) || done.has(s));

  // Review nicety: #/PressPackageBuilder?pkg=…&goto=step-artist-card jumps
  // straight to a section on load.
  useEffect(() => {
    const m = window.location.hash.match(/[?&]goto=([\w-]+)/);
    if (m) setTimeout(() => document.getElementById(m[1])?.scrollIntoView(), 400);
  }, []);

  // First-time picks glide the page down to the step that just unlocked.
  const goTo = (id: string) => {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const advance = (k: StepKey, target: string) => {
    if (!picked(k)) goTo(target);
  };

  // ── Derived options per size ──
  const colors = CATALOG_COLORS.filter((c) => c.sizes.includes(sizeId));
  const color = colors.find((c) => c.id === colorId) ?? colors[0];

  const jacketOptions = JACKET_CATALOG[sizeId] ?? JACKET_CATALOG['12'];
  const jacketType = jacketOptions.find((j) => j.id === jacketId) ?? jacketOptions[0];
  const selectedJacketVariant = jacketType.variants.find((v) => v.id === jacketVariantId) ?? jacketType.variants[0];

  const sleeveType = SLEEVE_OPTIONS.find((s) => s.id === sleeveId) ?? SLEEVE_OPTIONS[0];
  const selectedSleeveVariant = sleeveType.variants.find((v) => v.id === sleeveVariantId);
  const look = sleeveLook(sleeveType, sleeveVariantId);

  const labelStyle = LABEL_STYLES.find((l) => l.id === labelId) ?? LABEL_STYLES[0];
  const is7 = sizeId === '7';
  const hole = is7 ? (HOLE_OPTIONS.find((h) => h.id === holeId) ?? HOLE_OPTIONS[0]) : HOLE_OPTIONS[0];
  const labelSpec = LABEL_SIZE_SPECS[sizeId];
  const labelDiscSize = Math.round(labelSpec.inches * DISC_PX_PER_INCH);
  const labelRatio = labelSpec.labelInches / labelSpec.inches;
  const labelHoleRatio = hole.holeInches / labelSpec.inches;
  const offsetLogo = is7 && hole.id === 'large';
  const tileDiscSize = Math.round(96 * (labelSpec.inches / 12));

  const visibleInserts = INSERT_OPTIONS.filter((o) => !o.sizes || o.sizes.includes(sizeId));
  const insertType = visibleInserts.find((s) => s.id === insertId) ?? visibleInserts[0];
  const selectedInsertVariant = insertType.variants.find((v) => v.id === insertVariantId) ?? null;
  const insertsAvailable = visibleInserts.length > 1;

  const stickerShape = stickerShapeId === 'none' ? null : (STICKER_SHAPES.find((s) => s.id === stickerShapeId) ?? null);
  const stickerSize = stickerShape ? (stickerShape.sizes.find((s) => s.id === stickerSizeId) ?? stickerShape.sizes[Math.floor(stickerShape.sizes.length / 2)]) : null;

  // ── Selection handlers (donor logic, wired to shared size) ──
  // Any change after a save un-earns the confirm — Save re-appears.
  const touch = () => setPkgSaved(false);

  const selectSize = (id: SizeId) => {
    setSizeId(id);
    advance('size', 'step-discs');
    mark('size');
    touch();
    // colors: fall back to Classic Black when the color doesn't press this size
    if (!CATALOG_COLORS.find((c) => c.id === colorId)?.sizes.includes(id)) {
      setColorId('BK1');
      setColorKind('black');
    }
    // jackets: keep the style if this size offers it, else the first
    const opts = JACKET_CATALOG[id] ?? JACKET_CATALOG['12'];
    const nextJacket = opts.find((j) => j.id === jacketId) ?? opts[0];
    setJacketId(nextJacket.id);
    setJacketVariantId(
      nextJacket.variants.some((v) => v.id === jacketVariantId) ? jacketVariantId : nextJacket.variants[0].id,
    );
    // inserts: fall back to None when the style isn't offered
    const currentInsert = INSERT_OPTIONS.find((s) => s.id === insertId);
    if (currentInsert?.sizes && !currentInsert.sizes.includes(id)) {
      setInsertId('none');
      setInsertVariantId('');
    }
    // labels: leaving 7" resets the jukebox hole
    if (id !== '7') setHoleId('small');
  };

  const selectJacket = (id: string) => {
    setJacketId(id);
    const opt = jacketOptions.find((j) => j.id === id);
    setJacketVariantId(opt?.variants[0]?.id ?? 'standard');
    mark('jacket');
    touch();
  };

  const selectSleeve = (id: string) => {
    setSleeveId(id);
    const opt = SLEEVE_OPTIONS.find((s) => s.id === id);
    setSleeveVariantId(opt?.variants[0]?.id ?? 'board');
    mark('sleeve');
    touch();
  };

  const selectInsert = (id: string) => {
    setInsertId(id);
    const opt = INSERT_OPTIONS.find((s) => s.id === id);
    setInsertVariantId(opt?.variants[0]?.id ?? '');
    mark('insert');
    touch();
  };

  const chooseStickerShape = (id: StickerShapeId | 'none') => {
    setStickerShapeId(id);
    if (id !== 'none') {
      const next = STICKER_SHAPES.find((s) => s.id === id);
      if (next) setStickerSizeId(next.sizes[Math.floor(next.sizes.length / 2)].id);
    }
    mark('sticker');
    touch();
  };

  // ── Pricing — only what's been picked counts toward the estimate ──
  const vinylDone = picked('size') && picked('weight') && picked('color');
  // Every line scales with the run (like the client estimate), anchored so
  // the 1,000-unit tier shows the exact MRP numbers.
  const minRun = vinylDone ? (MOCK_KIND_MIN_QTY[color.kind] ?? 0) : 0;
  const tierFactor = (q: number) => qtyScale(q) / 0.70;
  const baseUnit =
    (vinylDone ? (color.price + MOCK_WEIGHT_UP[weightId]) * discs : 0) +
    (picked('label') ? MOCK_LABEL_PRICE[labelId] * discs : 0) +
    (picked('jacket') ? MOCK_JACKET_PRICE[jacketType.id] : 0) +
    (picked('sleeve') ? MOCK_SLEEVE_PRICE[sleeveType.id] : 0) +
    (picked('insert') ? MOCK_INSERT_PRICE[insertType.id] : 0) +
    (picked('sticker') && stickerShapeId !== 'none' ? MOCK_STICKER_PRICE[stickerShapeId] : 0) +
    (vinylDone ? MOCK_ASSEMBLY_PRICE + MOCK_SHRINK_PRICE : 0);
  // Fixed setup costs (same MRP numbers as the client estimate) — one-time,
  // quantity-independent, now part of the quote math (Bill, Aug 16 2026).
  const QB_SETUP_LINES = [
    { id: 'cutting', name: 'Lacquer cutting', amount: 650 },
    { id: 'plating', name: 'Lacquer plating', amount: 375 },
    { id: 'test', name: 'Test pressing', amount: 175, note: 'Includes 2-day domestic shipping' },
    { id: 'stampers', name: 'Stampers', amount: 0 },
    { id: 'colorfee', name: 'Color setup fee', amount: 95 },
  ];
  const QB_SETUP_TOTAL = QB_SETUP_LINES.reduce((acc, l) => acc + l.amount, 0);

  const perUnitAt = (q: number) => baseUnit * tierFactor(q);
  // Honest per-unit for ANY quantity (custom qtys included). The defined
  // tiers give (units → scale) anchor points; between them we interpolate
  // linearly rather than snapping to a step — no made-up flat number. Below
  // the smallest / above the largest anchor we clamp to the end tier.
  const TIER_ANCHORS: { q: number; scale: number }[] = QUANTITIES.map((q) => ({ q, scale: qtyScale(q) }));
  const scaleAt = (q: number): number => {
    if (q <= TIER_ANCHORS[0].q) return TIER_ANCHORS[0].scale;
    const last = TIER_ANCHORS[TIER_ANCHORS.length - 1];
    if (q >= last.q) return last.scale;
    for (let i = 0; i < TIER_ANCHORS.length - 1; i++) {
      const a = TIER_ANCHORS[i];
      const b = TIER_ANCHORS[i + 1];
      if (q >= a.q && q <= b.q) {
        const t = (q - a.q) / (b.q - a.q);
        return a.scale + (b.scale - a.scale) * t;
      }
    }
    return last.scale;
  };
  // perUnitAt snaps to the step function for defined tiers; this interpolates
  // for custom quantities. They agree exactly on the six anchor tiers.
  const perUnitAtInterp = (q: number) => baseUnit * (scaleAt(q) / 0.70);

  // Merged, de-duped, sorted grid: the six defaults plus any custom qtys the
  // press has added. Custom ones are flagged so only they can be removed.
  const ALL_QTYS: { q: number; custom: boolean }[] = Array.from(
    new Map<number, boolean>([
      ...QUANTITIES.map((q) => [q, false] as [number, boolean]),
      ...customQtys.map((q) => [q, true] as [number, boolean]),
    ]).entries(),
  )
    .map(([q, custom]) => ({ q, custom }))
    .sort((a, b) => a.q - b.q);

  // At least one quantity must stay visible to artists. A card counts as
  // "offerable" only if it's a real tier for this package (not below minRun).
  const offerableQtys = ALL_QTYS.filter(({ q }) => !(minRun > 0 && q < minRun));
  const visibleOfferableCount = offerableQtys.filter(({ q }) => !hiddenQtys.has(q)).length;

  const toggleHiddenQty = (q: number) => {
    setHiddenQtys((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
    setQtyMenuOpen(null);
  };
  const removeCustomQty = (q: number) => {
    setCustomQtys((prev) => prev.filter((x) => x !== q));
    setHiddenQtys((prev) => {
      const next = new Set(prev);
      next.delete(q);
      return next;
    });
    if (qty === q) setQty(500);
    setQtyMenuOpen(null);
  };
  const addQtyNum = Number(addQtyValue);
  const addQtyValid =
    Number.isFinite(addQtyNum) &&
    Number.isInteger(addQtyNum) &&
    addQtyNum > 0 &&
    !ALL_QTYS.some(({ q }) => q === addQtyNum);
  const commitAddQty = () => {
    if (!addQtyValid) return;
    setCustomQtys((prev) => [...prev, addQtyNum]);
    setAddingQty(false);
    setAddQtyValue('');
  };
  const cancelAddQty = () => {
    setAddingQty(false);
    setAddQtyValue('');
  };

  // ── Pricing anchor — ONE source of truth (Bill, note 1 + note 4) ──
  // The min-run row is gone: the smallest VISIBLE quantity card now defines
  // the anchor — the most an artist could ever pay; bigger runs only get
  // cheaper. Strip, cards, and totals all read from this single anchor so
  // they can never disagree. Falls back to the smallest offerable tier if
  // (impossibly) nothing is visible, then to the smallest tier of all.
  const anchorQty =
    offerableQtys.find(({ q }) => !hiddenQtys.has(q))?.q ??
    offerableQtys[0]?.q ??
    ALL_QTYS[0]?.q ??
    QUANTITIES[0];
  // Honest per-unit at the anchor. Interpolate for custom anchors, snap for
  // defined tiers — perUnitAtInterp agrees with perUnitAt on the six anchors.
  const anchorIsCustom = customQtys.includes(anchorQty);
  const anchorUnitFactor = scaleAt(anchorQty) / 0.70;
  const anchorPerUnit = baseUnit * (anchorIsCustom ? anchorUnitFactor : tierFactor(anchorQty));
  const anchorTotal = anchorPerUnit * anchorQty + QB_SETUP_TOTAL;
  // Aliases kept for the estimate breakdown rows below.
  const minUnitFactor = anchorIsCustom ? anchorUnitFactor : tierFactor(anchorQty);
  const minPerUnit = anchorPerUnit;
  const minTotal = anchorTotal;

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const sizeLabel = VINYL_SIZES.find((s) => s.id === sizeId)?.label ?? '';

  return (
    <PressShell>
      {/* Frosted running summary — pinned under the top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-4"
        style={{
          height: 48, paddingLeft: 40, paddingRight: 40,
          background: 'var(--q-frost)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${PRESS_ACCENT}59`,
        }}>
        <div className="flex items-center gap-2 text-[12.5px] min-w-0" style={{ color: SUBINK }}>
          {picked('size') ? (
            <>
              <span className="font-semibold" style={{ color: INK }}>{sizeLabel}</span>
              {picked('discs') && discs > 1 && (<><span style={{ color: '#d0d0d5' }}>·</span><span>{discs} LP</span></>)}
              {/* Strip shows the ANCHOR quantity — the smallest visible card
                  below (Bill, Aug 22 2026: "units are 100 not 500") — never a
                  transient selection, so it always matches the cards. */}
              {picked('qty') && (<><span style={{ color: '#d0d0d5' }}>·</span><span>{anchorQty.toLocaleString()} units</span></>)}
              {picked('weight') && (<><span style={{ color: '#d0d0d5' }}>·</span><span>{weightId}g</span></>)}
              {picked('color') && (<><span style={{ color: '#d0d0d5' }}>·</span><span className="truncate">{color.name}</span></>)}
              {picked('jacket') && (<><span style={{ color: '#d0d0d5' }}>·</span><span className="truncate">{jacketType.name}</span></>)}
            </>
          ) : (
            <>
              {/* Attention-drawing shimmer while the strip is empty (Bill,
                  Aug 13 2026) — a soft gradient wave sweeps the invitation. */}
              <style>{`
                @keyframes gt-strip-shimmer {
                  0%   { background-position: 200% center; }
                  100% { background-position: -200% center; }
                }
              `}</style>
              <span
                className="font-medium"
                data-testid="strip-empty-note"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${SUBINK} 0%, ${SUBINK} 35%, ${BLUE} 50%, ${SUBINK} 65%, ${SUBINK} 100%)`,
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                  animation: 'gt-strip-shimmer 3.2s linear infinite',
                }}
              >
                Pick a size to begin — your price will be up here.
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* One anchor drives strip, cards, and totals (Bill, note 4): the
              per-unit and full-run total both read the smallest visible
              quantity — never the transiently selected card — so the strip
              and the bottom hero can never disagree. */}
          <span className="text-[12.5px]" style={{ color: SUBINK }}>
            Est. <span className="font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(anchorPerUnit)}</span> / unit
          </span>
          <span className="text-[13px] font-semibold rounded-full" style={{ padding: '4px 14px', background: `${PRESS_ACCENT}1f`, color: 'var(--q-accent-ink)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(anchorTotal)}
          </span>
        </div>
      </div>

      <div className="mx-auto w-full" style={{ maxWidth: 1240, paddingLeft: 40, paddingRight: 40, paddingTop: 36, paddingBottom: 96 }}>

        {/* Breadcrumb + page heading — flips to edit-mode grammar when a
            package is opened from the catalog. */}
        <div className="min-w-0">
          {audience === 'press' && <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>
            <a href={brand.variant === 'memphis' ? '#/PressPackagesIndex' : `#/PressPackagesPressIndex?press=${brand.variant}`} className="hover:text-slate-600 transition-colors">Packages</a>
            <span style={{ color: '#d0d0d5' }}>›</span>
            <span style={{ color: SUBINK }}>{seed ? seed.title : 'New package'}</span>
          </div>}
          {audience === 'artist' ? (
            <>
              <PageHeading lead="Build your package." rest="From scratch." />
              <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
                Choose every production detail for this release. Your selections become this release&rsquo;s package.
              </p>
            </>
          ) : seed ? (
            <>
              <PageHeading lead={`${seed.title}.`} rest={seed.stats.status === 'Live' ? 'Tuned and live.' : 'Still a draft.'} />
              <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
                Every choice below is saved. Change anything — the price updates honestly.
              </p>
              {/* Stats band — word + icon, never color alone (Bill). */}
              <div
                className="flex items-center flex-wrap"
                style={{ marginTop: 20, padding: '12px 0', borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}`, columnGap: 28, rowGap: 8 }}
                data-testid="package-stats-band"
              >
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: seed.stats.status === 'Live' ? BLUE : '#8e8e93' }}>
                  {seed.stats.status === 'Live'
                    ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />
                    : <Pencil className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.2} />}
                  {seed.stats.status}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: SUBINK }} data-testid="stat-estimates">
                  <NavEstimates className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                  {seed.stats.estimates} estimates sent this month
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: SUBINK }} data-testid="stat-projects">
                  <NavVinyl className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                  {seed.stats.projects} projects started from it
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: SUBINK, fontVariantNumeric: 'tabular-nums' }} data-testid="stat-unit-price">
                  <NavPricing className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                  From {fmt(anchorPerUnit)} / unit at {anchorQty.toLocaleString()}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: SUBINK }} data-testid="stat-last-edited">
                  <Pencil className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                  Last edited {seed.stats.lastEdited}
                </span>
              </div>
            </>
          ) : (
            <>
              <PageHeading lead={`Build your ${brand.displayName} packages.`} rest="From scratch." />
              <p style={{ fontSize: 16, marginTop: 10, maxWidth: 560, color: SUBINK }}>
                Pick the size once — every later choice is already sized to match.
                When you&rsquo;re done, the package saves to your catalog.
              </p>
            </>
          )}
        </div>

        {/* ═══ 1 · VINYL (Add your vinyl) ═══ */}
        <section style={{ marginTop: 48 }}>
          <SplitSection
            left={
              <Gate on={picked('size')}>
                <div className="flex flex-col items-center">
                <DiscStage swatch={color} sizeId={sizeId} />
                {picked('size') && (
                  <>
                    {(picked('ctype') || picked('weight')) && (
                      <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                        {picked('ctype') && (
                          <>
                            <ColorBall color={color.base} size={16} />
                            <span className="font-semibold" style={{ color: INK }}>{color.name}</span>
                            <span style={{ color: '#d0d0d5' }}>·</span>
                            <span>{color.kindNote}</span>
                          </>
                        )}
                        {picked('weight') && (
                          <>
                            {picked('ctype') && <span style={{ color: '#d0d0d5' }}>·</span>}
                            <span>{weightId}g</span>
                          </>
                        )}
                      </div>
                    )}
                    <p className="text-[12px] text-center" style={{ marginTop: (picked('ctype') || picked('weight')) ? 6 : 28, color: '#a1a1a6' }}>
                      {sizeLabel}{picked('qty') ? ` · ${anchorQty.toLocaleString()} units` : ''}
                    </p>
                  </>
                )}
                </div>
              </Gate>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                {/* Size */}
                <section>
                  <StepHeading lead="Pick a size." rest="The record sets the fit." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    The size you pick here carries through every step below.
                  </p>
                  <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                    {VINYL_SIZES.map((s) => {
                      const active = picked('size') && s.id === sizeId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => selectSize(s.id)}
                          aria-pressed={active}
                          data-testid={`size-${s.id}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{s.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{s.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Discs — 1LP..4LP (Bill, Aug 16 2026: "we forgot 1LP, 2LP, 3LP, 4LP") */}
                <Gate on={canDo('discs')}>
                <section id="step-discs" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="How many discs." rest="Singles to box sets." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Each disc adds a pressed record and its label. The jacket holds them all.
                  </p>
                  <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                    {DISC_COUNTS.map((d) => {
                      const active = picked('discs') && d.n === discs;
                      return (
                        <button
                          key={d.n}
                          type="button"
                          onClick={() => { setDiscs(d.n); advance('discs', 'step-weight'); mark('discs'); touch(); }}
                          aria-pressed={active}
                          data-testid={`discs-${d.n}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{d.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{d.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
                </Gate>


                {/* Weight */}
                <Gate on={canDo('weight')}>
                <section id="step-weight" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="Pick a weight." rest="How heavy it presses." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    {VINYL_WEIGHTS.length} weights available from {brand.legalName}.
                  </p>
                  <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                    {VINYL_WEIGHTS.map((w) => {
                      const active = picked('weight') && w.id === weightId;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => { setWeightId(w.id); advance('weight', 'step-ctype'); mark('weight'); touch(); }}
                          aria-pressed={active}
                          data-testid={`weight-${w.id}`}
                          className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                          style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                        >
                          <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK }}>{w.label}</div>
                          <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>{w.note}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
                </Gate>

                {/* Type — donor "What kind of vinyl?" row.
                    Collapses to a summary row once a color is picked; Change re-expands. */}
                <Gate on={canDo('ctype')}>
                <section id="step-ctype" style={{ scrollMarginTop: 120 }}>
                  {picked('ctype') && !typeOpen ? (
                    <>
                      <StepHeading lead="Pick a type." rest="What kind of vinyl?" />
                      <div
                        className="flex items-center rounded-2xl bg-white"
                        style={{ marginTop: 16, gap: 14, padding: '12px 18px', border: `1px solid ${HAIRLINE}` }}
                        data-testid="type-summary-row"
                      >
                        <VinylDisc size={44} swatch={color} />
                        <div className="flex-1" style={{ minWidth: 0 }}>
                          <div className="text-[14px] font-semibold" style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {COLOR_TYPES.find((t) => t.id === colorKind)?.name}
                          </div>
                          <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>
                            Type · {colors.filter((c) => c.kind === colorKind).length} colors
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTypeOpen(true)}
                          className="text-[13px] font-medium focus:outline-none"
                          style={{ color: BLUE, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          data-testid="button-change-type"
                        >
                          Change
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <StepHeading lead="Pick a type." rest="What kind of vinyl?" />
                      <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                        {colors.length} colors in your catalog press for {sizeLabel}.
                      </p>
                      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                        {COLOR_TYPES.map((t) => {
                          const kindColors = colors.filter((c) => c.kind === t.id);
                          if (kindColors.length === 0) return null;
                          const isActive = picked('ctype') && t.id === colorKind;
                          const shown = (isActive && color.kind === t.id) ? color : kindColors[0];
                          return (
                            <TypeCard
                              key={t.id}
                              name={t.name}
                              count={kindColors.length}
                              swatch={shown}
                              active={isActive}
                              onSelect={() => {
                                setColorKind(t.id);
                                if (color.kind !== t.id) setColorId(kindColors[0].id);
                                mark('ctype');
                                mark('color');
                                setTypeOpen(false);
                                touch();
                              }}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
                </Gate>

                {/* Color — the looks within the chosen type */}
                <Gate on={canDo('color')}>
                <section id="step-color" style={{ scrollMarginTop: 120 }}>
                  <StepHeading lead="Pick a color." rest="From your catalog." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    {picked('ctype')
                      ? `${COLOR_TYPES.find((t) => t.id === colorKind)?.name} · ${colors.filter((c) => c.kind === colorKind).length} colors`
                      : 'Pick a type first.'}
                  </p>
                  <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                    {colors.filter((c) => c.kind === colorKind).map((c) => (
                      <ColorRecordCard
                        key={c.id}
                        swatch={c}
                        active={picked('ctype') && c.id === color.id}
                        onSelect={() => { setColorId(c.id); mark('color'); setTypeOpen(false); touch(); }}
                      />
                    ))}
                  </div>
                </section>
                </Gate>
              </div>
            }
          />
        </section>

        {/* ═══ 2 · JACKET (Choose your jacket) ═══ */}
        <section id="step-jacket" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('jacket')}>
          <SplitSection
            left={
              <>
                <JacketStage jacketType={jacketType} widespine={jacketVariantId === 'widespine'} tipOn={jacketVariantId === 'tipon'} />
                <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                  {sizeLabel} {jacketType.name}
                  {selectedJacketVariant && selectedJacketVariant.id !== 'standard' && (
                    <span style={{ color: '#a1a1a6' }}> · {selectedJacketVariant.label}</span>
                  )}
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6', maxWidth: 280 }}>
                  {jacketType.note}
                  {jacketType.gatefoldPanels > 0 && <span> Hover to preview the fold.</span>}
                </p>
              </>
            }
            right={
              <>
                <StepHeading lead="Pick a jacket." rest="How it&rsquo;s built." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {jacketOptions.length} types available from {brand.legalName} for {sizeLabel} records.
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {jacketOptions.map((j) => (
                    <JacketTile
                      key={j.id}
                      jacket={j}
                      active={picked('jacket') && j.id === jacketType.id}
                      variantId={j.id === jacketType.id ? jacketVariantId : j.variants[0].id}
                      onSelect={() => selectJacket(j.id)}
                      onVariantSelect={(id) => { setJacketVariantId(id); mark('jacket'); touch(); }}
                    />
                  ))}
                </div>
              </>
            }
          />
          </Gate>
        </section>

        {/* ═══ 3 · INNER SLEEVE (Choose your inner sleeve) ═══ */}
        <section id="step-sleeve" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('sleeve')}>
          <SplitSection
            left={
              <>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  filter: picked('sleeve') ? 'none' : 'grayscale(1) opacity(0.45)',
                  transition: 'filter 0.4s ease',
                }}>
                  <SleeveStage sleeve={look} />
                  <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                    {sizeLabel} {sleeveType.name}
                    {selectedSleeveVariant && (
                      <span style={{ color: '#a1a1a6' }}> · {selectedSleeveVariant.label}</span>
                    )}
                  </div>
                  <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6', maxWidth: 280 }}>
                    {picked('sleeve') ? sleeveType.note : 'Select a finish to add it to your estimate.'}
                  </p>
                </div>
              </>
            }
            right={
              <>
                <StepHeading lead="Pick an inner sleeve." rest="Printed, unprinted, or polylined." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {SLEEVE_OPTIONS.length} inner sleeve types available from {brand.legalName}.
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SLEEVE_OPTIONS.map((s) => (
                    <SleeveTile
                      key={s.id}
                      sleeve={s}
                      active={picked('sleeve') && s.id === sleeveId}
                      variantId={s.id === sleeveId ? sleeveVariantId : s.variants[0].id}
                      onSelect={() => selectSleeve(s.id)}
                      onVariantSelect={(id) => { setSleeveVariantId(id); mark('sleeve'); touch(); }}
                    />
                  ))}
                </div>
                <p className="text-[12px]" style={{ marginTop: 12, color: '#a1a1a6' }}>
                  {sleeveType.id === 'printed'
                    ? 'The artist supplies print-ready artwork for the sleeve face.'
                    : sleeveType.id === 'polylined'
                      ? 'No artwork needed — ships with anti-static poly lining.'
                      : 'No artwork needed — packaging ships as-is.'}
                </p>
              </>
            }
          />
          </Gate>
        </section>

        {/* ═══ 4 · CENTER LABELS ═══ */}
        <section id="step-labels" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo(is7 ? 'hole' : 'label')}>
          <SplitSection
            left={
              <>
                <LabelStage kind={labelId} holeRatio={labelHoleRatio} discSize={labelDiscSize} labelRatio={labelRatio} offsetLogo={offsetLogo} swatch={picked('color') ? color : undefined} />
                <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                  <span className="font-semibold" style={{ color: INK }}>
                    {sizeLabel} {labelStyle.name}
                  </span>
                  {is7 && (
                    <>
                      <span style={{ color: '#d0d0d5' }}>·</span>
                      <span>{hole.label}</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: '#a1a1a6' }}>
                  {labelStyle.note}
                </p>
              </>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                {is7 && (
                  <section>
                    <StepHeading lead="Pick a hole." rest="Spindle or jukebox." />
                    <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                      7&quot; records press with a small spindle hole or the classic large 45 hole.
                    </p>
                    <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
                      {HOLE_OPTIONS.map((h) => {
                        const active = picked('hole') && h.id === holeId;
                        return (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => { setHoleId(h.id); mark('hole'); touch(); }}
                            aria-pressed={active}
                            data-testid={`hole-${h.id}`}
                            className="rounded-2xl bg-white transition-all hover:-translate-y-px focus:outline-none"
                            style={{ flex: 1, padding: '16px 12px', border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`, textAlign: 'center', cursor: 'pointer' }}
                          >
                            <div className="text-[15px] font-semibold" style={{ color: active ? BLUE : INK }}>{h.label}</div>
                            <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6', lineHeight: 1.4 }}>{h.note}</div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}
                <Gate on={canDo('label')}>
                <section>
                  <StepHeading lead="Pick a type." rest="Which label type?" />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Printed before pressing — the label becomes part of the record.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {LABEL_STYLES.map((s) => (
                      <LabelTile
                        key={s.id}
                        style={s}
                        active={picked('label') && s.id === labelId}
                        onSelect={() => { setLabelId(s.id); if (sizeId !== '7') advance('label', 'step-inserts'); mark('label'); touch(); }}
                        discSize={tileDiscSize}
                        labelRatio={labelRatio}
                        holeRatio={labelHoleRatio}
                        offsetLogo={offsetLogo}
                      />
                    ))}
                  </div>
                </section>
                </Gate>
              </div>
            }
          />
          </Gate>
        </section>

        {/* ═══ 5 · INSERTS (Choose your inserts) ═══ */}
        <section id="step-inserts" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('insert')}>
          <SplitSection
            left={
              <>
                <InsertStage insert={insertType} variantId={insertVariantId} />
                {insertType.id !== 'none' && (
                  <>
                    <div className="text-[13px] font-semibold" style={{ marginTop: 28, color: INK }}>
                      {sizeLabel} {insertType.name}
                      {selectedInsertVariant && (
                        <span style={{ color: '#a1a1a6' }}> · {selectedInsertVariant.label}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-center" style={{ marginTop: 6, color: '#a1a1a6', maxWidth: 280 }}>
                      {insertType.note}
                    </p>
                  </>
                )}
              </>
            }
            right={
              <>
                <StepHeading lead="Add an insert." rest="Optional — or skip it." />
                <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                  {insertsAvailable
                    ? `${visibleInserts.length - 1} insert types available from ${brand.legalName} — or skip it.`
                    : 'No insert types press for 7" — this record ships without one.'}
                </p>
                <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {visibleInserts.map((s) => (
                    <InsertTile
                      key={s.id}
                      insert={s}
                      active={picked('insert') && s.id === insertId}
                      variantId={s.id === insertId ? insertVariantId : (s.variants[0]?.id ?? '')}
                      onSelect={() => selectInsert(s.id)}
                      onVariantSelect={(id) => { setInsertVariantId(id); mark('insert'); touch(); }}
                    />
                  ))}
                </div>
              </>
            }
          />
          </Gate>
        </section>

        {/* ═══ 6 · STICKERS ═══ */}
        <section id="step-stickers" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('sticker')}>
          <SplitSection
            left={
              <>
                <StickerStage size={stickerSize} shape={stickerShape} />
                <div className="flex items-center justify-center gap-2 text-[13px]" style={{ marginTop: 28, color: SUBINK }}>
                  <span className="font-semibold" style={{ color: INK }}>
                    {stickerShape && stickerSize ? stickerSize.name : 'None'}
                  </span>
                  {stickerShape && (
                    <>
                      <span style={{ color: '#d0d0d5' }}>·</span>
                      <span>{stickerShape.name}</span>
                    </>
                  )}
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 320, color: '#a1a1a6' }}>
                  {stickerShape ? stickerShape.note : 'No sticker on the shrink-wrap.'}
                </p>
              </>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                <section>
                  <StepHeading lead="Add a sticker." rest="Die-cut to fit — or none." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Stickers apply to the shrink-wrap, not the jacket itself.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <NoneShapeTile active={picked('sticker') && stickerShapeId === 'none'} onSelect={() => chooseStickerShape('none')} />
                    {STICKER_SHAPES.map((s) => (
                      <ShapeTile
                        key={s.id}
                        shape={s}
                        active={picked('sticker') && s.id === stickerShapeId}
                        onSelect={() => chooseStickerShape(s.id)}
                      />
                    ))}
                  </div>
                </section>

                {stickerShape && (
                  <section>
                    <StepHeading lead="Pick a size." rest={`For ${stickerShape.name.toLowerCase()}s.`} />
                    <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                      {stickerShape.id === 'upc'
                        ? 'UPC stickers come in one standard retail size.'
                        : 'Every size prints on the same white die-cut stock.'}
                    </p>
                    <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                      {stickerShape.sizes.map((s) => (
                        <SizeCard
                          key={s.id}
                          size={s}
                          round={stickerShape.round}
                          active={s.id === stickerSizeId}
                          onSelect={() => { setStickerSizeId(s.id); mark('sticker'); touch(); }}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            }
          />
          </Gate>
        </section>

        {/* ═══ 7 · QUANTITY — moved to the end (Bill, Aug 16 2026): build the
            record first, then watch the run size drop the per-record price.
            Album on the left (jacket closed, inner sleeve peeking), the
            original quantity cards on the right (Bill feedback, Aug 16). */}
        <section id="step-qty" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={canDo('qty')}>
          <SplitSection
            left={
              <>
                {/* Artist-page treatment (Bill, Aug 16 2026): full-color cover
                    up front, inner sleeve a sliver + record peeking like the
                    Niina/Californialand card. Hover slides the sleeve out to a
                    full peek and the record further; off-hover they tuck back. */}
                <div className="relative group" style={{ width: JS_BASE + 140, height: JS_BASE + 12 }} data-testid="qty-album-stage">
                  {/* record — the real VinylDisc render of the chosen color
                      (splatter layers and all), peeking right of the jacket */}
                  <div
                    className="absolute transition-transform duration-500 ease-out group-hover:translate-x-11"
                    style={{ left: 140, top: 14, width: JS_BASE - 16, height: JS_BASE - 16, zIndex: 1, borderRadius: '50%', boxShadow: '0 2px 14px rgba(0,0,0,0.35)' }}
                    aria-hidden
                  >
                    <div onPointerEnter={qtySpin.onPointerEnter} onPointerLeave={qtySpin.onPointerLeave}>
                    <VinylDisc size={JS_BASE - 16} swatch={color} bodyRef={qtySpin.bodyRef} labelOverlay={
                    <div className="absolute rounded-full overflow-hidden" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: color.photo ? '40%' : '33.4%', height: color.photo ? '40%' : '33.4%', zIndex: 2 }}>
                      {labelStyle.id === 'color' && (useArtistArt ? (
                        <img src={niinaLabelArt} alt="" aria-hidden className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{
                          background:
                            'conic-gradient(from 210deg,' +
                            '#e91e8c 0deg, #8e2de2 55deg, #2a52d8 110deg,' +
                            '#0fa596 165deg, #2e9e3f 210deg, #d99a00 265deg,' +
                            '#e05a1a 305deg, #e91e8c 360deg)',
                        }}>
                          <PressMark style={{ width: '72%', height: '72%', opacity: 0.95 }} />
                        </div>
                      ))}
                      {labelStyle.id === 'bw' && (
                        <div className="w-full h-full" style={{ background: '#ffffff' }}>
                          <PressMark darkSurface={false} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '56%', height: '56%', opacity: 0.78 }} />
                        </div>
                      )}
                      {labelStyle.id === 'blank' && <div className="w-full h-full" style={{ background: '#ffffff' }} />}
                      <div className="absolute rounded-full" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 9, height: 9, background: '#161617', zIndex: 3 }} />
                    </div>
                    } />
                    </div>
                    <div className="absolute" style={{ bottom: 4, right: -8, zIndex: 5 }}>
                      <RewindButton show={qtySpin.showRewind} onClick={qtySpin.rewind} size={28} />
                    </div>
                  </div>
                  {/* inner sleeve — a sliver at rest, expands out on hover */}
                  <div
                    className="absolute rounded-sm transition-transform duration-500 ease-out group-hover:translate-x-6"
                    style={{
                      left: 38, top: 10, width: JS_BASE - 12, height: JS_BASE - 12, zIndex: 2,
                      background: look.printed
                        ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
                        : look.color === 'black' ? '#0a0a0a' : '#ffffff',
                      border: look.color === 'black' || look.printed ? '1px solid #222' : '1px solid rgba(0,0,0,0.10)',
                      boxShadow: '0 1px 8px rgba(0,0,0,0.22)',
                      overflow: 'hidden',
                    }}
                    aria-hidden
                  >
                    {look.printed && (useArtistArt ? (
                      <img src={californialandInnerSleeve} alt="" aria-hidden className="w-full h-full object-cover" />
                    ) : (
                      <RainbowPrintFace logoSize={(JS_BASE - 12) * 0.42} />
                    ))}
                    {look.polylined && (
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0.0) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.0) 60%)' }} />
                    )}
                    {look.boardWeight && (
                      <div className="absolute" style={{ right: 0, top: 0, bottom: 0, width: 3, background: 'rgba(255,255,255,0.25)' }} />
                    )}
                  </div>
                  {/* jacket — MRP house jacket by default; artist cover on swap.
                      PMP-style house jacket (Bill, Aug 16 2026): dark board, white
                      press mark, nothing else. Memphis will supply the real image;
                      white via CSS invert — only dark assets exist. */}
                  <div className="absolute overflow-hidden rounded-sm" style={{ left: 0, top: 0, width: JS_BASE, height: JS_BASE, zIndex: 3, boxShadow: '0 4px 22px rgba(0,0,0,0.35)' }}>
                    {useArtistArt ? (
                      <img src={californialandCover} alt="Artist cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: '#111112' }}>
                        <PressMark style={{ width: '52%', height: 'auto', opacity: 0.92 }} />
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[12px] text-center" style={{ marginTop: 6, maxWidth: 360, color: '#a1a1a6' }}>
                  {useArtistArt ? 'Artist temp artwork for this package' : `${brand.displayName} house artwork by default`} — hover to slide the sleeve and record out.
                </p>
                {/* Swap-in point (Bill, Aug 16 2026): a press can drop in the
                    artist's temp artwork, sleeve, and label for the estimate;
                    otherwise the press default shows. Mock-only affordance. */}
                <button
                  type="button"
                  onClick={() => setUseArtistArt((v) => !v)}
                  aria-pressed={useArtistArt}
                  className="rounded-full text-[12px] font-medium transition-colors hover:bg-black/5"
                  style={{ marginTop: 10, padding: '6px 14px', border: `1px solid ${HAIRLINE}`, color: SUBINK, background: 'transparent', cursor: 'pointer' }}
                  data-testid="qty-swap-artwork"
                >
                  {useArtistArt ? `Back to ${brand.displayName} house artwork` : 'Use the artist\u2019s artwork instead\u2026'}
                </button>
              </>
            }
            right={
              <div className="flex flex-col" style={{ gap: 48 }}>
                <section>
                  <StepHeading lead="Pick a quantity." rest="Watch the price drop." />
                  <p className="text-[12.5px]" style={{ marginTop: 10, color: SUBINK }}>
                    Bigger runs bring the per-record price down — each card prices this exact record.
                  </p>
                  <p className="text-[11.5px]" style={{ marginTop: 8, color: '#a1a1a6' }}>
                    Hide the tiers you aren&rsquo;t offering so artists only see the price you intend. Hidden cards stay here for you.
                  </p>
                  <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {ALL_QTYS.map(({ q, custom }) => {
                      const active = picked('qty') && q === qty;
                      const below = q < minRun;
                      const hidden = hiddenQtys.has(q);
                      const priceOf = custom ? perUnitAtInterp(q) : perUnitAt(q);
                      // Guard: the last visible offerable tier can't be hidden.
                      const isLastVisible = !hidden && !below && visibleOfferableCount <= 1;
                      return (
                        <div
                          key={q}
                          className="group relative rounded-2xl bg-white"
                          style={{
                            border: active ? `2px solid ${BLUE}` : `1px solid ${HAIRLINE}`,
                            opacity: below ? 0.45 : hidden ? 0.5 : 1,
                            transition: 'opacity 150ms ease',
                          }}
                        >
                          <button
                            type="button"
                            disabled={below}
                            onClick={() => { if (below) return; setQty(q); advance('qty', 'step-save'); mark('qty'); touch(); }}
                            aria-pressed={active}
                            data-testid={`qty-${q}`}
                            className={below ? 'w-full rounded-2xl focus:outline-none' : 'w-full rounded-2xl transition-transform hover:-translate-y-px focus:outline-none'}
                            style={{ padding: '16px 12px', textAlign: 'center', cursor: below ? 'default' : 'pointer', background: 'transparent', border: 'none' }}
                          >
                            <div className="text-[17px] font-semibold" style={{ color: active ? BLUE : INK, fontVariantNumeric: 'tabular-nums' }}>{q.toLocaleString()}</div>
                            <div className="text-[11px]" style={{ marginTop: 3, color: '#a1a1a6' }}>units</div>
                            {below ? (
                              <div className="text-[12px] font-medium" style={{ marginTop: 6, color: '#a1a1a6' }}>Unavailable</div>
                            ) : (
                              <div className="text-[12px] font-medium" style={{ marginTop: 6, color: active ? BLUE : SUBINK, fontVariantNumeric: 'tabular-nums' }}>{fmt(priceOf)}<span style={{ color: '#a1a1a6', fontWeight: 400 }}> /unit</span></div>
                            )}
                            {/* Hidden state — word + icon, never color alone (Bill is colorblind) */}
                            {hidden && !below && (
                              <div
                                className="inline-flex items-center gap-1 rounded-full text-[10.5px] font-medium"
                                style={{ marginTop: 8, padding: '2px 8px', border: `1px solid ${HAIRLINE}`, color: SUBINK }}
                              >
                                <EyeOff style={{ width: 11, height: 11 }} />
                                Hidden
                              </div>
                            )}
                          </button>

                          {/* Quiet ··· affordance — revealed on hover/focus, top-right */}
                          {!below && (
                            <Popover open={qtyMenuOpen === q} onOpenChange={(o) => setQtyMenuOpen(o ? q : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`More options for ${q.toLocaleString()} units`}
                                  data-testid={`qty-menu-${q}`}
                                  className="absolute right-1.5 top-1.5 inline-flex items-center justify-center rounded-full transition-opacity opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 hover:bg-black/5"
                                  style={{ width: 24, height: 24, border: 'none', background: qtyMenuOpen === q ? 'rgba(0,0,0,0.05)' : 'transparent', color: SUBINK, cursor: 'pointer', opacity: qtyMenuOpen === q ? 1 : undefined }}
                                >
                                  <MoreHorizontal style={{ width: 15, height: 15 }} />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent
                                align="end"
                                sideOffset={6}
                                className="w-56 p-0 rounded-2xl"
                                style={{ border: `1px solid ${HAIRLINE}` }}
                                data-testid={`qty-menu-content-${q}`}
                              >
                                <div className="py-1.5">
                                  <button
                                    type="button"
                                    disabled={!hidden && isLastVisible}
                                    onClick={() => toggleHiddenQty(q)}
                                    data-testid={`qty-toggle-hide-${q}`}
                                    className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] enabled:hover:bg-slate-50 transition-colors disabled:cursor-not-allowed"
                                    style={{ color: INK, opacity: !hidden && isLastVisible ? 0.4 : 1 }}
                                  >
                                    {hidden ? <Eye className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} /> : <EyeOff className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />}
                                    <span>{hidden ? 'Show to artists' : 'Hide from artists'}</span>
                                  </button>
                                  {!hidden && isLastVisible && (
                                    <div className="px-3.5 pb-2 pt-0.5 text-[11px]" style={{ color: '#a1a1a6' }}>
                                      Keep at least one price visible to artists.
                                    </div>
                                  )}
                                  {custom && (
                                    <button
                                      type="button"
                                      onClick={() => removeCustomQty(q)}
                                      data-testid={`qty-remove-${q}`}
                                      className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-slate-50 transition-colors"
                                      style={{ color: INK, borderTop: `1px solid ${HAIRLINE}` }}
                                    >
                                      <Trash2 className="w-4 h-4 flex-shrink-0" style={{ color: '#a1a1a6' }} />
                                      <span>Remove this quantity</span>
                                    </button>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      );
                    })}

                    {/* Add-a-quantity — dashed card at the end of the grid */}
                    {addingQty ? (
                      <div
                        className="rounded-2xl bg-white"
                        style={{ padding: '14px 12px', border: `1px dashed ${HAIRLINE}` }}
                        data-testid="qty-add-form"
                      >
                        <div className="text-[11px] font-medium" style={{ color: '#a1a1a6', textAlign: 'center' }}>units</div>
                        <input
                          autoFocus
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={addQtyValue}
                          onChange={(e) => setAddQtyValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitAddQty(); if (e.key === 'Escape') cancelAddQty(); }}
                          placeholder="250"
                          data-testid="qty-add-input"
                          className="w-full text-center bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                          style={{ marginTop: 6, height: 34, borderRadius: 8, fontSize: 15, fontWeight: 600, border: `1px solid ${HAIRLINE}`, color: INK, fontVariantNumeric: 'tabular-nums' }}
                        />
                        <div className="text-[12px] font-medium" style={{ marginTop: 8, textAlign: 'center', color: addQtyValid ? SUBINK : '#a1a1a6', fontVariantNumeric: 'tabular-nums', minHeight: 16 }} data-testid="qty-add-price">
                          {addQtyValid
                            ? <>{fmt(perUnitAtInterp(addQtyNum))}<span style={{ color: '#a1a1a6', fontWeight: 400 }}> /unit</span></>
                            : addQtyValue.trim() === '' ? 'Enter a run size' : ALL_QTYS.some(({ q }) => q === addQtyNum) ? 'Already a tier' : 'Enter a whole number'}
                        </div>
                        <div className="flex items-center justify-center gap-3" style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={cancelAddQty}
                            data-testid="qty-add-cancel"
                            className="text-[12.5px] font-medium hover:bg-black/5 rounded-full transition-colors"
                            style={{ padding: '4px 10px', border: 'none', background: 'transparent', color: SUBINK, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!addQtyValid}
                            onClick={commitAddQty}
                            data-testid="qty-add-confirm"
                            className="text-[12.5px] font-medium rounded-full transition-colors enabled:hover:bg-black/5 disabled:cursor-not-allowed"
                            style={{ padding: '4px 12px', border: `1px solid ${HAIRLINE}`, background: 'transparent', color: addQtyValid ? INK : '#a1a1a6', cursor: addQtyValid ? 'pointer' : 'not-allowed', opacity: addQtyValid ? 1 : 0.6 }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setAddingQty(true); setAddQtyValue(''); }}
                        data-testid="qty-add-open"
                        className="flex flex-col items-center justify-center rounded-2xl transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                        style={{ padding: '16px 12px', border: `1px dashed ${HAIRLINE}`, color: SUBINK, cursor: 'pointer', background: 'transparent', minHeight: 88 }}
                      >
                        <Plus style={{ width: 18, height: 18 }} />
                        <span className="text-[12.5px] font-medium" style={{ marginTop: 6 }}>Add a quantity</span>
                      </button>
                    )}

                    {minRun > 0 && (
                      <div className="text-[11.5px]" style={{ gridColumn: '1 / -1', color: '#a1a1a6' }} data-testid="qty-min-note">
                        {color.name} is a splatter press — the press won't run it under {minRun.toLocaleString()} units.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            }
          />
          </Gate>
        </section>

        {/* ═══ 7.5 · HOW ARTISTS WILL SEE IT (Bill, Aug 19 2026) ═══
            The press's package becomes one of the Apple-Music-style cards at
            the top of the artist builder (card system copied from
            ArtistReleasePackageTemplates — the press never designs the card,
            only fills in the variables). */}
        {audience === 'press' && <section id="step-artist-card" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={allDone}>
            <SectionHeading
              lead="How artists will see it."
              rest="Your package, their rail."
              sub={seed
                ? 'Fill in two lines, pick a cover — the card designs itself.'
                : 'Name it here — this is what artists will see on the card. Fill in two lines, pick a cover — the card designs itself.'}
            />
            <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 460px', gap: 56, alignItems: 'start' }}>
              {/* ── Inputs — the press's variables ── */}
              <div className="min-w-0" style={{ maxWidth: 420 }}>
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6' }}>Package name</div>
                <input
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Name your package"
                  className="w-full bg-white focus:outline-none"
                  style={{ marginTop: 8, height: 40, borderRadius: 10, padding: '0 12px', fontSize: 14, border: `1px solid ${HAIRLINE}`, color: INK }}
                  data-testid="input-artist-card-name"
                />
                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginTop: 24 }}>Sell line</div>
                <input
                  value={cardSell}
                  onChange={(e) => setCardSell(e.target.value.slice(0, 60))}
                  placeholder="Everything a first pressing needs."
                  className="w-full bg-white focus:outline-none"
                  style={{ marginTop: 8, height: 40, borderRadius: 10, padding: '0 12px', fontSize: 14, border: `1px solid ${HAIRLINE}`, color: INK }}
                  data-testid="input-artist-card-sell"
                />
                <div className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 6 }}>
                  One line, {60 - cardSell.length} characters left. It sits on the cover.
                </div>

                <div className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: '#a1a1a6', marginTop: 24 }}>Cover</div>
                {/* Apple buy-flow option tiles (Bill, Aug 20 2026): generous
                    tiles, art thumb + proper name label; selected = 2px accent
                    ring + subtle raised fill, unselected = hairline. */}
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {(() => {
                    // Layout-stable selection: constant 1px border; the accent
                    // ring is a box-shadow (0 0 0 2px) so nothing reflows.
                    const tileStyle = (active: boolean): React.CSSProperties => ({
                      padding: 8, cursor: 'pointer', textAlign: 'center',
                      border: `1px solid ${active ? BLUE : HAIRLINE}`,
                      background: active ? 'var(--q-card)' : 'transparent',
                      boxShadow: active ? `0 0 0 2px ${BLUE}` : undefined,
                    });
                    const thumbStyle: React.CSSProperties = {
                      position: 'relative', display: 'block', width: '100%',
                      aspectRatio: '460 / 260', borderRadius: 8, overflow: 'hidden',
                    };
                    const labelStyleFor = (active: boolean): React.CSSProperties => ({
                      display: 'block', marginTop: 8, marginBottom: 2, fontSize: 12.5, fontWeight: 600,
                      color: active ? INK : SUBINK, lineHeight: 1.2,
                    });
                    const tiles: ReactNode[] = [];
                    for (const c of PPB_COVERS.filter((x) => x.id !== 'custom')) {
                      const active = c.id === cardCoverId;
                      const Ad = c.ad;
                      tiles.push(
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setCardCoverId(c.id)}
                          aria-pressed={active}
                          className="rounded-xl transition-colors"
                          style={tileStyle(active)}
                          data-testid={`cover-swatch-${c.id}`}
                        >
                          <span aria-hidden style={thumbStyle}>
                            <span style={{ position: 'absolute', inset: 0, display: 'block' }}><Ad /></span>
                          </span>
                          <span style={labelStyleFor(active)}>{c.name}</span>
                        </button>,
                      );
                    }
                    // LAST ROW (Bill's pick): "Magic Background" bottom-left,
                    // "Upload" to its right.
                    {
                      const active = cardCoverId === 'match';
                      tiles.push(
                        <button
                          key="match"
                          type="button"
                          onClick={() => setCardCoverId('match')}
                          aria-pressed={active}
                          className="rounded-xl transition-colors"
                          style={tileStyle(active)}
                          data-testid="cover-swatch-match"
                        >
                          <span aria-hidden style={{ ...thumbStyle, background: matchVinylBackground(color.base) }} />
                          <span style={{ ...labelStyleFor(active), fontSize: 11.5, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <Sparkles style={{ width: 11, height: 11, flexShrink: 0, color: active ? INK : '#a1a1a6' }} />
                            Magic Background
                          </span>
                        </button>,
                      );
                    }
                    {
                      const active = cardCoverId === 'custom';
                      tiles.push(
                        <button
                          key="custom"
                          type="button"
                          onClick={() => (customUploaded ? setCardCoverId('custom') : setUploadSheetOpen(true))}
                          aria-pressed={active}
                          className="rounded-xl transition-colors"
                          style={tileStyle(active)}
                          data-testid="cover-swatch-custom"
                        >
                          {customUploaded ? (
                            <span aria-hidden style={thumbStyle}>
                              <span style={{ position: 'absolute', inset: 0, display: 'block' }}><PpbCoverCustom /></span>
                            </span>
                          ) : (
                            // Un-uploaded: a designed quiet well — solid soft
                            // fill + hairline, so it never reads as broken art.
                            <span aria-hidden style={{ ...thumbStyle, background: 'rgba(120,120,128,0.14)', border: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ImagePlus className="w-6 h-6" style={{ color: '#8e8e93' }} />
                            </span>
                          )}
                          {/* The label is the control's name, not its state —
                              stays "Upload" after uploading. */}
                          <span style={labelStyleFor(active)}>Upload</span>
                        </button>,
                      );
                    }
                    return tiles;
                  })()}
                </div>

                {/* ── Upload sheet — canon grammar (ArtistTemplateTest Replace
                    flow): dashed drop zone, paste-a-link, plain size rule. ── */}
                {uploadSheetOpen && (
                  <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 20px 20px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} data-testid="cover-upload-sheet">
                    <div style={{ width: 520, maxWidth: '100%', borderRadius: 20, background: '#1c1c1e', border: '1px solid rgba(255,255,255,0.10)', color: '#f5f5f7', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
                        <div style={{ fontSize: 19, fontWeight: 700 }}>Upload a background</div>
                        <button type="button" aria-label="Close" onClick={() => setUploadSheetOpen(false)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', border: 'none', color: '#f5f5f7', cursor: 'pointer', fontSize: 15 }} data-testid="upload-sheet-close">✕</button>
                      </div>
                      <div style={{ padding: '20px 24px 24px' }}>
                        <button
                          type="button"
                          onClick={seatUpload}
                          className="w-full flex flex-col items-center justify-center text-center gap-2 rounded-xl transition-colors hover:bg-white/5"
                          style={{ padding: '32px 20px', border: '2px dashed rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', color: '#f5f5f7' }}
                          data-testid="upload-dropzone"
                        >
                          <UploadCloud className="w-7 h-7" style={{ color: '#98989d', strokeWidth: 1.5 }} aria-hidden />
                          <span className="text-[14px] font-semibold">Drag your image here</span>
                          <span className="text-[12px]" style={{ color: '#98989d' }}>or click to choose a file</span>
                        </button>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#6e6e73', marginTop: 18 }}>Or paste a link</div>
                        <input
                          placeholder="https://…"
                          className="w-full focus:outline-none placeholder:text-white/30"
                          style={{ marginTop: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: '#26262a', color: '#f5f5f7', padding: '10px 14px', fontSize: 14 }}
                          data-testid="upload-link-input"
                        />
                        <div style={{ fontSize: 12.5, color: '#98989d', marginTop: 14, lineHeight: 1.6 }}>
                          At least 1840 &times; 1040 pixels (16:9-ish) &mdash; JPG or PNG. It fills the whole card, edge to edge.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                          <button
                            type="button"
                            onClick={seatUpload}
                            className="inline-flex items-center gap-2 rounded-full text-[13.5px] font-semibold transition-colors hover:bg-white/15"
                            style={{ padding: '10px 20px', border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.10)', color: '#f5f5f7', cursor: 'pointer' }}
                            data-testid="button-choose-file"
                          >
                            <Upload className="w-4 h-4 flex-shrink-0" aria-hidden />
                            Choose file
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Live card preview — assembles as they type ── */}
              <div>
                <div data-testid="artist-card-preview" style={{ width: 460, textAlign: 'left', color: INK }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#a1a1a6' }}>
                    {brand.displayName.toUpperCase()} PACKAGE
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, marginTop: 4, color: INK }}>
                    {cardName.trim() || 'Untitled package'}
                  </div>
                  <div style={{ fontSize: 13, color: SUBINK, marginTop: 2, lineHeight: 1.35 }}>
                    {sizeLabel} · {weightId}g {color.name.toLowerCase()} · {jacketType.name.toLowerCase()}
                  </div>
                  {/* the wide card face — cover edge-to-edge, disc arcing up from the bottom */}
                  <div style={{ position: 'relative', marginTop: 12, height: 260, borderRadius: 14, overflow: 'hidden', border: `1px solid ${HAIRLINE}`, boxShadow: '0 4px 14px rgba(0,0,0,0.25)' }}>
                    {cardCoverId === 'match' ? (
                      <div aria-hidden style={{ position: 'absolute', inset: 0, background: matchVinylBackground(color.base) }} />
                    ) : (
                      (() => { const Ad = (PPB_COVERS.find((c) => c.id === cardCoverId) ?? PPB_COVERS[0]).ad; return <Ad />; })()
                    )}
                    <div
                      aria-hidden
                      style={{ position: 'absolute', left: '50%', top: 78, transform: 'translateX(-50%)', filter: 'drop-shadow(0 -6px 22px rgba(0,0,0,0.45))' }}
                    >
                      <VinylDisc size={330} swatch={color} />
                    </div>
                    {/* sell line — top area, over a top scrim */}
                    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 92, background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 100%)' }} />
                    <div style={{ position: 'absolute', left: 16, right: 100, top: 14, zIndex: 2, fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3, letterSpacing: -0.1, textShadow: '0 1px 3px rgba(0,0,0,0.5)', opacity: cardSell.trim() ? 1 : 0.55 }}>
                      {cardSell.trim() || 'Everything a first pressing needs.'}
                    </div>
                  </div>
                  {/* quiet price line — the artist-rail grammar, from live page state */}
                  <div style={{ fontSize: 12, color: SUBINK, marginTop: 10 }} data-testid="artist-card-price">
                    From ${anchorPerUnit.toFixed(2)} / unit at {anchorQty.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </Gate>
        </section>}

        {/* ═══ 7 · SAVE ═══ */}
        <section id="step-save" style={{ marginTop: 72, paddingTop: 56, borderTop: `1px solid ${HAIRLINE}`, scrollMarginTop: 104 }}>
          <Gate on={allDone}>
          <div className="rounded-3xl bg-white" style={{ marginTop: 28, padding: 32, border: `1px solid ${HAIRLINE}` }}>
            {/* Header spans the full card (Bill, Aug 22 2026): heading, build
                summary and anchor note up top; the stage + math sit below. */}
            {/* Packages are catalog items — no client, no quantity picked
                here. Estimates get built FROM packages later (Bill).
                Apple-canon two-tone heading, sentence case (Bill, note 3):
                the ALL-CAPS eyebrows are gone — section identity lives in
                the heading, matching every other section in this builder. */}
            <h2 className="tracking-tight" style={{ fontSize: 24, lineHeight: 1.15, fontWeight: 600, paddingLeft: 20 }}>
              <span style={{ color: INK }}>The build. </span>
              <span style={{ color: '#a1a1a6' }}>Everything you picked.</span>
            </h2>
            <div className="text-[12.5px]" style={{ color: SUBINK, lineHeight: 1.6, paddingLeft: 20, marginTop: 10 }}>
              {sizeLabel} · {weightId}g · {color.name} · {labelStyle.name} label · {jacketType.name} · {sleeveType.name} sleeve
              {insertType.id === 'none' ? '' : ` · ${insertType.name}`}
              {stickerShape ? ` · ${stickerShape.name} sticker` : ''}
            </div>
            {/* The pricing anchor is the smallest visible quantity card
                (Bill, note 1) — no separate minimum-run row. */}
            <div className="text-[11.5px]" style={{ color: '#a1a1a6', marginTop: 8, paddingLeft: 20, maxWidth: 560, lineHeight: 1.5 }} data-testid="anchor-note">
              Priced at {anchorQty.toLocaleString()} units — the smallest quantity still shown to artists, and the most they&rsquo;d pay. Bigger runs only get cheaper.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 460px', gap: 40, alignItems: 'stretch', marginTop: 24 }}>
              {/* The package itself, full quantity-stage size (Bill, Aug 22
                  2026): same geometry as the quantity stage — jacket, inner
                  sleeve tucked properly, record — vertically centered so the
                  album runs from the top of the Per-record box to the bottom
                  of the run total. */}
              <div className="min-w-0 flex items-center justify-center">
                <div className="relative group" style={{ width: JS_BASE + 140, height: JS_BASE + 12 }} data-testid="save-package-stage">
                  <div
                    className="absolute transition-transform duration-500 ease-out group-hover:translate-x-11"
                    style={{ left: 140, top: 14, width: JS_BASE - 16, height: JS_BASE - 16, zIndex: 1, borderRadius: '50%', boxShadow: '0 2px 14px rgba(0,0,0,0.35)' }}
                    aria-hidden
                  >
                    <VinylDisc size={JS_BASE - 16} swatch={color} />
                  </div>
                  <div
                    className="absolute rounded-sm transition-transform duration-500 ease-out group-hover:translate-x-6"
                    style={{
                      left: 38, top: 10, width: JS_BASE - 12, height: JS_BASE - 12, zIndex: 2,
                      background: look.printed
                        ? 'linear-gradient(155deg, #1e1e26 0%, #0f0f14 100%)'
                        : look.color === 'black' ? '#0a0a0a' : '#ffffff',
                      border: look.color === 'black' || look.printed ? '1px solid #222' : '1px solid rgba(0,0,0,0.10)',
                      boxShadow: '0 1px 8px rgba(0,0,0,0.22)',
                      overflow: 'hidden',
                    }}
                    aria-hidden
                  >
                    {look.printed && (useArtistArt ? (
                      <img src={californialandInnerSleeve} alt="" aria-hidden className="w-full h-full object-cover" />
                    ) : (
                      <RainbowPrintFace logoSize={(JS_BASE - 12) * 0.42} />
                    ))}
                  </div>
                  <div className="absolute overflow-hidden rounded-sm" style={{ left: 0, top: 0, width: JS_BASE, height: JS_BASE, zIndex: 3, boxShadow: '0 4px 22px rgba(0,0,0,0.35)' }}>
                    {useArtistArt ? (
                      <img src={californialandCover} alt="Artist cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: '#111112' }}>
                        <PressMark style={{ width: '52%', height: 'auto', opacity: 0.92 }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* The math on the right (Bill, Aug 22 2026), a bit wider. */}
              <div className="min-w-0 flex flex-col">
                {/* Honest math, big finish — now in lockstep with the client
                    estimate (Bill, Aug 16 2026): Per record expands to the full
                    component breakdown, setup costs are in the math, hairlines
                    inset, gradient on the total band. */}
                <div className="rounded-2xl" style={{ border: `1px solid ${HAIRLINE}`, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setQbDetailsOpen((v) => !v)}
                    aria-expanded={qbDetailsOpen}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    data-testid="quote-details-toggle"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-medium" style={{ color: INK }}>Per record</span>
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: '#a1a1a6', transform: qbDetailsOpen ? 'rotate(180deg)' : 'none' }} />
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>This exact build, at {anchorQty.toLocaleString()} units</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-per-record">{fmt(minPerUnit)}</span>
                  </button>
                  {qbDetailsOpen && (
                    <div style={{ background: 'var(--q-canvas, #fafafa)' }}>
                      {[
                        vinylDone ? { id: 'vinyl', name: `${sizeLabel} · ${weightId}g ${color.name}`, note: discs > 1 ? `${discs} LP per record` : 'Vinyl', v: (color.price + MOCK_WEIGHT_UP[weightId]) * discs * minUnitFactor } : null,
                        picked('label') ? { id: 'label', name: `${labelStyle.name} label`, note: discs > 1 ? `Both discs` : undefined, v: MOCK_LABEL_PRICE[labelId] * discs * minUnitFactor } : null,
                        picked('jacket') ? { id: 'jacket', name: `${jacketType.name} jacket`, v: MOCK_JACKET_PRICE[jacketType.id] * minUnitFactor } : null,
                        picked('sleeve') ? { id: 'sleeve', name: `${sleeveType.name} sleeve`, v: MOCK_SLEEVE_PRICE[sleeveType.id] * minUnitFactor } : null,
                        picked('insert') && insertType.id !== 'none' ? { id: 'insert', name: insertType.name, v: MOCK_INSERT_PRICE[insertType.id] * minUnitFactor } : null,
                        picked('sticker') && stickerShapeId !== 'none' && stickerShape ? { id: 'sticker', name: `${stickerShape.name} sticker`, v: MOCK_STICKER_PRICE[stickerShapeId] * minUnitFactor } : null,
                        vinylDone ? { id: 'assembly', name: 'Assembly', note: 'Insert placed on top before shrink', v: MOCK_ASSEMBLY_PRICE * minUnitFactor } : null,
                        vinylDone ? { id: 'shrink', name: 'Shrinkwrap', note: 'Retail-ready seal', v: MOCK_SHRINK_PRICE * minUnitFactor } : null,
                      ].filter((x): x is { id: string; name: string; note?: string; v: number } => x !== null).map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '9px 20px 9px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                          <div>
                            <div className="text-[12.5px] font-medium" style={{ color: INK }}>{l.name}</div>
                            {l.note && <div className="text-[11px]" style={{ color: '#a1a1a6', marginTop: 1 }}>{l.note}</div>}
                          </div>
                          <span className="text-[12.5px]" style={{ color: INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(l.v)} <span style={{ color: '#a1a1a6', fontSize: 11 }}>/unit</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: qbDetailsOpen ? 0 : '0 20px' }} />
                  <div className="flex items-center justify-between" style={{ padding: '14px 20px' }}>
                    <div>
                      <div className="text-[13.5px] font-medium" style={{ color: INK }}>Run</div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>{discs > 1 ? `${discs} LP per record, pressed and packed` : 'Pressed and packed'}</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-run">{anchorQty.toLocaleString()} units · {fmt(anchorPerUnit * anchorQty)}</span>
                  </div>
                  <div aria-hidden style={{ height: 1, background: HAIRLINE, margin: '0 20px' }} />
                  <button
                    type="button"
                    onClick={() => setQbSetupOpen((v) => !v)}
                    aria-expanded={qbSetupOpen}
                    className="w-full flex items-center justify-between text-left"
                    style={{ padding: '14px 20px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    data-testid="quote-setup-toggle"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13.5px] font-medium" style={{ color: INK }}>Setup</span>
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: '#a1a1a6', transform: qbSetupOpen ? 'rotate(180deg)' : 'none' }} />
                      </div>
                      <div className="text-[11.5px]" style={{ marginTop: 1, color: '#a1a1a6' }}>One-time · same at any run size</div>
                    </div>
                    <span className="text-[14px] font-semibold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-setup">{fmt(QB_SETUP_TOTAL)}</span>
                  </button>
                  {qbSetupOpen && (
                    <div style={{ background: 'var(--q-canvas, #fafafa)' }}>
                      {QB_SETUP_LINES.map((l) => (
                        <div key={l.id} className="flex items-center justify-between gap-4" style={{ padding: '8px 20px 8px 34px', borderTop: `1px solid ${HAIRLINE}` }}>
                          <div>
                            <div className="text-[12px]" style={{ color: SUBINK }}>{l.name}</div>
                            {l.note && <div className="text-[11px]" style={{ color: '#a1a1a6', marginTop: 1, opacity: 0.8 }}>{l.note}</div>}
                          </div>
                          <span className="text-[12px]" style={{ color: l.amount === 0 ? '#a1a1a6' : SUBINK, fontVariantNumeric: 'tabular-nums' }}>{l.amount === 0 ? 'Included' : fmt(l.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-4" style={{ padding: '16px 20px 18px', borderTop: `1px solid ${HAIRLINE}`, background: 'linear-gradient(180deg, rgba(49,158,216,0.10) 0%, rgba(49,158,216,0.02) 100%)' }}>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: BLUE }}>Full run total</div>
                      <div className="text-[11.5px]" style={{ marginTop: 3, color: SUBINK }}>At {anchorQty.toLocaleString()} units — the most an artist would pay</div>
                    </div>
                    <span className="font-semibold tracking-tight" style={{ fontSize: 34, lineHeight: 1, color: INK, fontVariantNumeric: 'tabular-nums' }} data-testid="quote-total-hero">{fmt(minTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Save sits below both columns, right-aligned under the math box
                with the box's own right margin (Bill, Aug 22 2026) — the note
                ABOVE the button. Save is just save: the package was already
                named in "How artists will see it" — no second naming prompt.
                One filled action. */}
            <div className="flex flex-col items-end gap-3" style={{ marginTop: 28 }}>
              {pkgSaved ? (
                <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: '#34a853' }} data-testid="package-saved-note">
                  <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#34a85315', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                  {audience === 'artist'
                    ? 'Package added to the release draft.'
                    : `"${cardName.trim() || pkgName || 'Untitled package'}" saved to Product Specs › ${brand.displayName} Packages`}
                </div>
              ) : (
                <>
                  <p className="text-[11.5px] text-right" style={{ color: '#a1a1a6' }}>
                    {audience === 'artist'
                      ? 'This package will be attached to your release draft.'
                      : (cardName.trim() || pkgName)
                        ? 'Packages skip quantity and price — artists pick their quantity later.'
                        : 'Name your package above — the name is what artists see.'}
                  </p>
                  {/* Confirm earns its blue (Bill, Aug 26 2026): no name, no save —
                      quiet outline until the package has a real name. */}
                  <Button
                    className="rounded-full px-7"
                    disabled={audience === 'artist' ? !allDone : !(cardName.trim() || pkgName)}
                    style={(audience === 'artist' ? allDone : Boolean(cardName.trim() || pkgName))
                      ? { background: BLUE, color: '#fff', height: 44, fontSize: 14.5 }
                      : { background: 'transparent', color: '#6e6e73', border: '1px solid #6e6e73', height: 44, fontSize: 14.5, cursor: 'default' }}
                    onClick={finishSave}
                    data-testid="button-save-as-package"
                  >
                    {audience === 'artist' ? 'Use this package' : seed ? 'Save changes' : 'Save to catalog'}
                  </Button>
                </>
              )}
            </div>
          </div>
          </Gate>
        </section>
      </div>
    </PressShell>
  );
}

export function PressPackageBuilder({ variant = 'memphis', audience = 'press' }: {
  variant?: PressPackageBuilderVariant;
  audience?: PressPackageBuilderAudience;
}) {
  return (
    <PressPackageBuilderProvider variant={variant} audience={audience}>
      <PressPackageBuilderInner />
    </PressPackageBuilderProvider>
  );
}

export default PressPackageBuilder;
