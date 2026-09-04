import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal, RotateCcw, Upload, X } from 'lucide-react';
import mrpLogo from '../assets/mrp-logo.png';

const DISC_TUCKED_POS = 'translateX(0)';
const DISC_GREET_POS = 'translateX(44px)';
const DISC_TUCKED_ANGLE = -14;
const SLEEVE_TUCKED_POS = 'translateX(0)';
const SLEEVE_GREET_POS = 'translateX(24px)';
const JACKET_REST = 'translateX(0)';
const JACKET_PULLED = 'translateX(-8px)';
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DRAW_MS = 520;
const VINYL_SHEEN = '/__mockup/vinyl-layers/vinyl-highlights.png';
const SPIN_DEGREES_PER_MS = 360 / 8000;
const REWIND_MS = 700;

export type PackageArtworkSlot = 'cover' | 'sleeve' | 'label';
export type PackageArtworkSlots = Record<PackageArtworkSlot, string | null>;
export type PackageArtworkDialogTheme = {
  card: string;
  raised: string;
  ink: string;
  subink: string;
  faint: string;
  hairline: string;
  blue: string;
};

export function VinylPackageArtwork({
  artworkUrl,
  sleeveArtworkUrl,
  labelArtworkUrl,
  art,
  vinylColor = '#171717',
  vinylPhotoUrl,
  vinylPhotoCropScale = 1,
  compactCover = false,
  pressLogoUrl = mrpLogo,
  pressName = 'Memphis Record Pressing',
  onChangeArtwork,
  testId = 'vinyl-package-artwork',
}: {
  artworkUrl?: string;
  sleeveArtworkUrl?: string;
  labelArtworkUrl?: string;
  art?: PackageArtworkSlots;
  vinylColor?: string;
  vinylPhotoUrl?: string;
  vinylPhotoCropScale?: number;
  compactCover?: boolean;
  pressLogoUrl?: string;
  pressName?: string;
  onChangeArtwork?: () => void;
  testId?: string;
}) {
  const animationId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [active, setActive] = useState(false);
  const [showRewind, setShowRewind] = useState(false);
  const discBodyRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(DISC_TUCKED_ANGLE);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const coverArt = art?.cover ?? artworkUrl;
  const sleeveArt = art?.sleeve ?? sleeveArtworkUrl;
  const labelArt = art?.label ?? labelArtworkUrl;
  const discPosition = active ? DISC_GREET_POS : DISC_TUCKED_POS;
  const sleevePosition = active ? SLEEVE_GREET_POS : SLEEVE_TUCKED_POS;

  const applyDiscAngle = useCallback(() => {
    if (discBodyRef.current) discBodyRef.current.style.transform = `rotate(${angleRef.current}deg)`;
  }, []);
  const stopDisc = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastFrameRef.current = null;
  }, []);
  const spinDisc = useCallback((time: number) => {
    if (lastFrameRef.current !== null) {
      angleRef.current += (time - lastFrameRef.current) * SPIN_DEGREES_PER_MS;
      applyDiscAngle();
    }
    lastFrameRef.current = time;
    rafRef.current = requestAnimationFrame(spinDisc);
  }, [applyDiscAngle]);
  const startSpin = useCallback(() => {
    if (reducedMotion) return;
    stopDisc();
    rafRef.current = requestAnimationFrame(spinDisc);
  }, [reducedMotion, spinDisc, stopDisc]);
  const rewindDisc = useCallback(() => {
    stopDisc();
    setActive(false);
    setShowRewind(false);
    if (reducedMotion) {
      angleRef.current = DISC_TUCKED_ANGLE;
      applyDiscAngle();
      return;
    }
    const start = angleRef.current;
    const offset = ((start - DISC_TUCKED_ANGLE) % 360 + 360) % 360;
    const target = start - offset;
    const beganAt = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - beganAt) / REWIND_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      angleRef.current = start + (target - start) * eased;
      applyDiscAngle();
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [applyDiscAngle, reducedMotion, stopDisc]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => () => stopDisc(), [stopDisc]);

  return (
    <div
      className="relative w-full select-none"
      style={{ maxWidth: 461, aspectRatio: '461 / 333', overflow: 'visible' }}
      data-testid={testId}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [data-package-motion="${animationId}"] {
            animation: none !important;
            transition: none !important;
          }
           [data-package-layer="disc-position-${animationId}"] { transform: translateX(22px) translateZ(0) !important; }
          [data-package-layer="disc-rotation-${animationId}"] { transform: rotate(-5deg) !important; }
           [data-package-layer="sleeve-position-${animationId}"] { transform: translateX(12px) translateZ(0) !important; }
           [data-package-layer="jacket-position-${animationId}"] { transform: translateX(-4px) !important; }
        }
      `}</style>

      <div
        className="absolute inset-0"
        onPointerEnter={() => {
          setActive(true);
          setShowRewind(false);
          startSpin();
        }}
        onPointerLeave={() => {
          stopDisc();
          setActive(false);
          if (!reducedMotion) {
            const offset = ((angleRef.current - DISC_TUCKED_ANGLE) % 360 + 360) % 360;
            setShowRewind(offset > 0.5);
          }
        }}
      >
      <div
        className="absolute rounded-full"
        data-package-motion={animationId}
        data-package-layer={`disc-position-${animationId}`}
        style={{
          left: '30.37%',
          top: '4.2%',
          width: '66.16%',
          aspectRatio: '1 / 1',
          transform: `${discPosition} translateZ(0)`,
          transition: `transform ${DRAW_MS}ms ${EASE}`,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          zIndex: 0,
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          ref={discBodyRef}
          data-package-motion={animationId}
          data-package-layer={`disc-rotation-${animationId}`}
          style={{
            background: vinylPhotoUrl
              ? 'transparent'
              : `radial-gradient(circle at 50% 42%, ${vinylColor} 0%, ${vinylColor} 34%, rgba(0,0,0,0.34) 100%)`,
            boxShadow: '0 16px 44px rgba(0,0,0,0.30)',
            transform: `rotate(${DISC_TUCKED_ANGLE}deg)`,
            willChange: 'transform',
            backfaceVisibility: 'hidden',
          }}
        >
          {vinylPhotoUrl && (
            <img
              src={vinylPhotoUrl}
              alt=""
              aria-hidden
              className="absolute max-w-none rounded-full object-cover"
              style={{
                left: `${(1 - vinylPhotoCropScale) * 50}%`,
                top: `${(1 - vinylPhotoCropScale) * 50}%`,
                width: `${vinylPhotoCropScale * 100}%`,
                height: `${vinylPhotoCropScale * 100}%`,
              }}
            />
          )}
          {!vinylPhotoUrl && (
            <>
              <div className="absolute inset-0 rounded-full" style={{ background: 'repeating-radial-gradient(circle at 50% 42%, rgba(255,255,255,0.10) 0px, transparent 2px, rgba(0,0,0,0.07) 4px)' }} />
              <div className="absolute inset-0 rounded-full" style={{ opacity: 0.08, mixBlendMode: 'screen', background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,.9) 24deg, transparent 70deg, transparent 150deg, rgba(255,255,255,.7) 176deg, transparent 220deg, transparent 300deg, rgba(255,255,255,.6) 324deg, transparent 360deg)' }} />
              <div className="absolute inset-0 rounded-full" style={{ opacity: 0.1, mixBlendMode: 'multiply', background: 'radial-gradient(38% 44% at 38% 30%, rgba(0,0,0,.7), transparent 62%), radial-gradient(30% 34% at 66% 58%, rgba(0,0,0,.55), transparent 60%)' }} />
              <div className="absolute left-1/2 top-1/2 flex h-[34%] w-[34%] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full" style={{ background: labelArt ? '#fff' : 'conic-gradient(from 210deg, #e91e8c, #8e2de2, #2a52d8, #0fa596, #2e9e3f, #d99a00, #e05a1a, #e91e8c)', boxShadow: '0 0 0 1.5px rgba(255,255,255,.28)' }}>
                <img src={labelArt ?? pressLogoUrl} alt={labelArt ? 'Release center label artwork' : `${pressName} center mark`} className={labelArt ? 'h-full w-full object-cover' : 'h-[76%] w-[76%] object-contain'} />
                <span className="absolute left-1/2 top-1/2 h-[9%] w-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#eceff3]" style={{ boxShadow: 'inset 0 .5px 1px rgba(0,0,0,.55)' }} />
              </div>
            </>
          )}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundColor: '#fff',
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

      <div
        className="absolute left-[8.24%] top-[3%] h-[92.8%] w-[67.03%] overflow-hidden"
        data-package-motion={animationId}
        data-package-layer={`sleeve-position-${animationId}`}
        style={{
          transform: `${sleevePosition} translateZ(0)`,
          transition: `transform ${DRAW_MS}ms ${EASE}`,
          willChange: 'transform',
          background: sleeveArt ? '#111' : 'linear-gradient(145deg, #f0c956 0%, #e05527 24%, #d92b81 48%, #713dc4 72%, #246fc9 100%)',
          boxShadow: '0 8px 28px rgba(0,0,0,.24)',
          zIndex: 1,
        }}
      >
        {sleeveArt ? <img src={sleeveArt} alt="" aria-hidden className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><img src={pressLogoUrl} alt="" aria-hidden className="h-[42%] w-[42%] object-contain opacity-80" /></div>}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(115deg, transparent 32%, rgba(255,255,255,.24) 48%, transparent 64%)' }} />
      </div>

      <div
        className={`absolute left-0 overflow-hidden ${compactCover ? 'top-[2.1%] h-[90%] w-[65.08%]' : 'top-0 h-[96.4%] w-[69.63%]'}`}
        data-package-motion={animationId}
        data-package-layer={`jacket-position-${animationId}`}
        style={{
          transform: active ? JACKET_PULLED : JACKET_REST,
          transition: `transform ${DRAW_MS}ms ${EASE}`,
          willChange: 'transform',
          background: '#111112',
          boxShadow: '0 20px 52px rgba(0,0,0,.28)',
          zIndex: 2,
        }}
      >
        {coverArt ? <img src={coverArt} alt="Release jacket artwork" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><img src={pressLogoUrl} alt={`${pressName} house artwork`} className="h-[50%] w-[50%] object-contain" style={{ filter: 'brightness(0) invert(1)' }} /></div>}
        <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(112deg, transparent 24%, rgba(255,255,255,.18) 44%, transparent 62%)', mixBlendMode: 'screen' }} />
        {onChangeArtwork && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onChangeArtwork(); }}
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-700"
            style={{
              opacity: active ? 1 : 0,
              pointerEvents: active ? 'auto' : 'none',
              transform: active ? 'scale(1)' : 'scale(.9)',
              transition: `opacity 220ms ${EASE}, transform 220ms ${EASE}`,
              background: 'rgba(255,255,255,.88)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 1px 3px rgba(0,0,0,.14)',
            }}
            aria-label="Change package artwork"
            data-testid="button-change-package-artwork"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>
      </div>
      <button
        type="button"
        aria-label="Reset package preview"
        data-testid="button-package-rewind"
        data-package-rewind-control
        onClick={(event) => {
          event.stopPropagation();
          rewindDisc();
        }}
        className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full"
        style={{
          opacity: showRewind ? 1 : 0,
          pointerEvents: showRewind ? 'auto' : 'none',
          transform: showRewind ? 'scale(1)' : 'scale(.9)',
          transition: `opacity 220ms ${EASE}, transform 220ms ${EASE}`,
          color: 'var(--q-subink, var(--apple-subink, #6e6e73))',
          background: 'var(--q-card, var(--apple-card, rgba(255,255,255,.92)))',
          border: '1px solid var(--q-hairline, var(--apple-hairline, #e6e6ea))',
          boxShadow: 'var(--q-pill-shadow, 0 1px 3px rgba(0,0,0,.12))',
          zIndex: 5,
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const ARTWORK_SLOT_META: Array<{ id: PackageArtworkSlot; label: string; size: string }> = [
  { id: 'cover', label: 'Cover', size: '1080 × 1080 px' },
  { id: 'sleeve', label: 'Inner sleeve', size: '1080 × 1080 px' },
  { id: 'label', label: 'Center label', size: '1200 × 1200 px' },
];

export function PackageArtworkDialog({
  open,
  art,
  onChange,
  onClose,
  pressLogoUrl = mrpLogo,
  pressName = 'Memphis Record Pressing',
  theme,
}: {
  open: boolean;
  art: PackageArtworkSlots;
  onChange: (slot: PackageArtworkSlot, value: string) => void;
  onClose: () => void;
  pressLogoUrl?: string;
  pressName?: string;
  theme?: PackageArtworkDialogTheme;
}) {
  const [slot, setSlot] = useState<PackageArtworkSlot>('cover');
  const [source, setSource] = useState<'upload' | 'url'>('upload');
  const [url, setUrl] = useState('');
  const [pending, setPending] = useState<Partial<PackageArtworkSlots>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    setPending({});
    setUrl('');
    setSource('upload');
  }, [open]);
  if (!open) return null;
  const meta = ARTWORK_SLOT_META.find((item) => item.id === slot)!;
  const current = pending[slot] ?? art[slot];
  const dirty = Object.keys(pending).length > 0;
  const useFile = (file?: File) => {
    if (!file) return;
    setPending((previous) => ({ ...previous, [slot]: URL.createObjectURL(file) }));
  };
  const save = () => {
    if (!dirty) return;
    for (const [changedSlot, value] of Object.entries(pending)) {
      if (value) onChange(changedSlot as PackageArtworkSlot, value);
    }
    onClose();
  };
  const card = theme?.card ?? 'var(--q-card, #ffffff)';
  const raised = theme?.raised ?? 'var(--q-track, #f2f2f4)';
  const ink = theme?.ink ?? 'var(--q-ink, #171719)';
  const subink = theme?.subink ?? 'var(--q-subink, #66666b)';
  const faint = theme?.faint ?? 'var(--q-faint, #92929a)';
  const hairline = theme?.hairline ?? 'var(--q-hairline, rgba(0,0,0,.12))';
  const blue = theme?.blue ?? 'var(--brand-blue, #2583e8)';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-5" style={{ backgroundColor: 'rgba(0,0,0,.62)', backdropFilter: 'blur(7px)' }} data-testid="modal-package-artwork">
      <div className="w-full max-w-[720px] overflow-hidden rounded-2xl" style={{ backgroundColor: card, border: `1px solid ${hairline}`, boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}>
        <div className="flex items-start justify-between gap-4 px-7 pt-6">
          <div>
            <h2 className="text-[19px] font-semibold" style={{ color: ink }}>Sample artwork · {meta.label}</h2>
            <p className="mt-1 text-[12.5px]" style={{ color: subink }}>Temporary preview art for this estimate. Replace it when final files arrive.</p>
            <div className="mt-3 inline-flex rounded-full p-[3px]" style={{ backgroundColor: raised }} role="tablist" aria-label="Artwork slot">
              {ARTWORK_SLOT_META.map((item) => <button key={item.id} type="button" role="tab" aria-selected={slot === item.id} onClick={() => setSlot(item.id)} className="rounded-full px-3.5 py-1 text-[12px] font-medium" style={{ color: slot === item.id ? ink : faint, backgroundColor: slot === item.id ? card : 'transparent', border: `1px solid ${slot === item.id ? hairline : 'transparent'}` }} data-testid={`chip-package-art-${item.id}`}>{item.label}</button>)}
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: subink }} aria-label="Close artwork"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-6 px-7 pb-5 pt-5 md:grid-cols-[230px_1fr]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: faint }}>Currently on the build</p>
            <div className="mt-2.5 aspect-square overflow-hidden rounded-xl" style={{ backgroundColor: raised, border: `1px solid ${hairline}` }}>
              {current ? <img src={current} alt={`Current ${meta.label.toLowerCase()} artwork`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-[#111112]"><img src={pressLogoUrl} alt={`${pressName} house artwork`} className="h-[52%] w-[52%] object-contain" style={{ filter: 'brightness(0) invert(1)' }} /></div>}
            </div>
            <p className="mt-3 text-center text-[12.5px] font-medium" style={{ color: ink }}>{current ? 'Your sample art' : `${pressName} house artwork`}</p>
            <p className="mt-0.5 text-center text-[11.5px]" style={{ color: faint }}>Suggested · {meta.size}</p>
          </div>
          <div className="flex min-h-[260px] flex-col">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: faint }}>New file</p>
              <div className="inline-flex rounded-full p-[3px]" style={{ backgroundColor: raised }} role="tablist" aria-label="File source">
                <button type="button" role="tab" aria-selected={source === 'upload'} onClick={() => setSource('upload')} className="rounded-full px-3 py-1 text-[12px]" style={{ color: source === 'upload' ? ink : faint, backgroundColor: source === 'upload' ? card : 'transparent' }}>Upload file</button>
                <button type="button" role="tab" aria-selected={source === 'url'} onClick={() => setSource('url')} className="rounded-full px-3 py-1 text-[12px]" style={{ color: source === 'url' ? ink : faint, backgroundColor: source === 'url' ? card : 'transparent' }}>Paste a URL</button>
              </div>
            </div>
            {source === 'upload' ? <button type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); useFile(event.dataTransfer.files?.[0]); }} className="mt-2.5 flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl" style={{ border: `1.5px dashed ${hairline}` }} data-testid="button-package-art-upload"><Upload className="h-5 w-5" style={{ color: subink }} /><span className="text-[13.5px] font-medium" style={{ color: ink }}>Drag a file here, or click to pick</span><span className="text-[12px]" style={{ color: faint }}>JPG or PNG · {meta.size} suggested</span></button> : <div className="mt-2.5 flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl px-6" style={{ border: `1.5px dashed ${hairline}` }}><div className="flex w-full gap-2"><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="h-9 min-w-0 flex-1 rounded-full px-3 text-[12.5px] outline-none" style={{ backgroundColor: raised, border: `1px solid ${hairline}`, color: ink }} /><button type="button" disabled={!url.trim()} onClick={() => { const value = url.trim(); if (value) setPending((previous) => ({ ...previous, [slot]: value })); }} className="h-9 rounded-full px-4 text-[12.5px] font-semibold disabled:opacity-40" style={{ backgroundColor: raised, color: ink }}>Use URL</button></div><span className="text-[12px]" style={{ color: faint }}>Dropbox, Drive, or another direct image link</span></div>}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png" hidden onChange={(event) => { useFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-7 pb-6">
          <button type="button" onClick={onClose} className="h-9 rounded-full px-3 text-[13px] font-medium" style={{ color: subink }}>Cancel</button>
          <button type="button" disabled={!dirty} onClick={save} className="h-9 rounded-full px-5 text-[13px] font-semibold disabled:cursor-default" style={{ backgroundColor: dirty ? blue : 'transparent', border: `1px solid ${dirty ? blue : hairline}`, color: dirty ? '#ffffff' : faint }}>Save artwork</button>
        </div>
      </div>
    </div>
  );
}