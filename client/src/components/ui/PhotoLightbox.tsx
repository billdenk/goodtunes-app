import { useState, useCallback, useEffect, useRef } from "react";
import { SheetClose } from "@/components/ui/SheetChrome";

export interface LightboxPhoto {
  id: string;
  photoUrl: string;
  caption?: string | null;
}

function originalUploadUrl(url: string): string | null {
  const m = /^\/objects\/uploads\/([a-zA-Z0-9._-]+)$/.exec(url);
  if (!m) return null;
  const id = m[1];
  if (id.includes(".orig.")) return url;
  const dot = id.lastIndexOf(".");
  if (dot <= 0) return null;
  return `/objects/uploads/${id.slice(0, dot)}.orig${id.slice(dot)}`;
}

function LightboxSlide({
  photo,
  active,
  zoomed,
}: {
  photo: LightboxPhoto;
  active: boolean;
  zoomed: boolean;
}) {
  const displayUrl = photo.photoUrl;
  const originalUrl = originalUploadUrl(displayUrl);
  const wantOriginal = active && zoomed && !!originalUrl;
  const [src, setSrc] = useState(displayUrl);

  useEffect(() => {
    setSrc(wantOriginal && originalUrl ? originalUrl : displayUrl);
  }, [wantOriginal, originalUrl, displayUrl]);

  return (
    <div className="w-full h-full flex-shrink-0 flex items-center justify-center px-4">
      <img
        src={src}
        alt={photo.caption ?? ""}
        draggable={false}
        className="max-w-full max-h-full object-contain select-none transition-transform duration-200"
        style={{ transform: active && zoomed ? "scale(2)" : "scale(1)" }}
        onError={() => {
          if (src !== displayUrl) setSrc(displayUrl);
        }}
        data-testid={`img-album-photo-${photo.id}`}
      />
    </div>
  );
}

export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = photos.length;
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const active = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const maxMove = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const lastTap = useRef(0);

  const go = useCallback(
    (i: number) => onIndexChange(Math.max(0, Math.min(count - 1, i))),
    [count, onIndexChange],
  );

  useEffect(() => {
    setZoomed(false);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (zoomed) return;
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, zoomed, go, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    maxMove.current = 0;
    axis.current = null;
    active.current = true;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!active.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    maxMove.current = Math.max(maxMove.current, Math.abs(dx), Math.abs(dy));
    if (zoomed) return;
    if (axis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current === "h") {
      let d = dx;
      if ((index === 0 && dx > 0) || (index === count - 1 && dx < 0)) d = dx / 3;
      setDragX(d);
    }
  };

  const onTouchEnd = () => {
    if (!active.current) return;
    active.current = false;
    setDragging(false);
    if (maxMove.current < 10) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setZoomed((z) => !z);
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
    if (axis.current === "h") {
      if (dragX < -60) go(index + 1);
      else if (dragX > 60) go(index - 1);
    }
    setDragX(0);
    axis.current = null;
  };

  const current = photos[index];

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/95 flex flex-col"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Album photo"
      data-testid="overlay-album-photo"
    >
      <div className="flex items-center justify-between p-4">
        <span
          className="text-fan-secondary text-xs font-medium tabular-nums"
          data-testid="text-album-photo-position"
        >
          {index + 1} of {count}
        </span>
        <SheetClose
          variant="dimmed"
          onClick={onClose}
          data-testid="button-close-album-photo"
        />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div
          className="flex h-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
            transition: dragging ? "none" : "transform 320ms cubic-bezier(0.22,0.61,0.36,1)",
            touchAction: "pan-y",
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={() => setZoomed((z) => !z)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {photos.map((p, i) => (
            <LightboxSlide
              key={p.id}
              photo={p}
              active={i === index}
              zoomed={zoomed}
            />
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                go(index - 1);
              }}
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              data-testid="button-prev-album-photo"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={index === count - 1}
              onClick={(e) => {
                e.stopPropagation();
                go(index + 1);
              }}
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              data-testid="button-next-album-photo"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </>
        )}
      </div>

      {current?.caption && (
        <p className="text-center text-fan-secondary text-xs px-6 pt-4">{current.caption}</p>
      )}

      {count > 1 && (
        <div
          className="flex items-center justify-center gap-1.5 pt-4 pb-8"
          onClick={(e) => e.stopPropagation()}
          data-testid="dots-album-photo"
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              aria-label={`Go to photo ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/35"
              }`}
              data-testid={`dot-album-photo-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
