import { useEffect, useMemo, useRef, useState } from "react";
import { getInitials } from "@/lib/initials";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { lightboxTranslatePct } from "@/lib/lightboxCarousel";

/**
 * GearDetailBody — the shared fan-facing gear surface (Task #1643).
 *
 * Renders the full Martin-D-28-mockup layout: a full-bleed vendor-tinted
 * radial-gradient hero (photo cover, anchored bottom) with floating glass
 * chrome, an eyebrow (maker) + big title + subtitle, a 96×96 brand chip,
 * an optional artist's-note card, Overview prose, a Photos grid + swipeable
 * lightbox, a Specs card, a "Played by" avatar rail, "Where to buy" rows,
 * and the affiliate footnote.
 *
 * Used by BOTH the in-credits InstrumentSheet (AlbumDetail.tsx, mobile +
 * contained desktop) and the standalone InstrumentDetail.tsx page so the two
 * surfaces never drift. Each host owns its own outer shell (SheetShell vs the
 * page <main>) and passes the chrome callbacks in.
 */

export interface GearVendor {
  name: string;
  affiliateUrl?: string;
  logoUrl?: string | null;
  tagline?: string | null;
}

export interface GearMaker {
  id?: string;
  name: string;
  domain?: string | null;
  logoUrl?: string | null;
}

export interface GearArtist {
  id: string;
  name: string;
  photoUrl?: string | null;
}

export interface GearArtistNote {
  quote: string;
  person?: { name: string; photoUrl?: string | null };
  albumNote?: string;
}

export interface GearLike {
  id: string;
  name: string;
  category: string;
  shortCategory?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[] | null;
  about?: string | null;
  artistNote?: string | null;
}

export function GearDetailBody({
  instrument,
  maker,
  vendors,
  artistNote,
  playedBy,
  sourceUrl,
  tuningNote,
  isBookmarked,
  onToggleBookmark,
  onShare,
  onBack,
  onOpenMaker,
  onOpenVendor,
  onOpenBuy,
  onOpenArtist,
  scrollPaddingClassName = "pb-10",
}: {
  instrument: GearLike;
  maker?: GearMaker | null;
  vendors: GearVendor[];
  artistNote?: GearArtistNote | null;
  playedBy?: GearArtist[];
  sourceUrl?: string | null;
  /** Per-track tuning (e.g. "DADGAD") shown as a pill under the subtitle. */
  tuningNote?: string | null;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onShare: () => void;
  onBack: () => void;
  onOpenMaker?: () => void;
  /** Tap the vendor row / logo → vendor profile (or fall back to buy). */
  onOpenVendor?: (v: GearVendor) => void;
  /** Tap the trailing ↗ → open the per-attachment product URL. */
  onOpenBuy?: (v: GearVendor) => void;
  onOpenArtist?: (id: string) => void;
  scrollPaddingClassName?: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const { prose, specs } = useMemo(
    () => parseGearAbout(instrument.about ?? ""),
    [instrument.about],
  );

  // Photos: hero first, then every extra gallery shot. Powers both the grid
  // and the lightbox. Hero is always index 0 so tapping it opens at the top.
  const photos = useMemo<GearPhoto[]>(() => {
    const all: GearPhoto[] = [];
    if (instrument.photoUrl) all.push({ id: "hero", url: instrument.photoUrl, label: instrument.name });
    (instrument.photoUrls ?? []).forEach((u, i) =>
      all.push({ id: `g${i}`, url: u, label: `${instrument.name} · ${i + 2}` }),
    );
    return all;
  }, [instrument.photoUrl, instrument.photoUrls, instrument.name]);

  const hero = photos[0];
  const heroTint = useMemo(() => tintFor(maker?.name || instrument.name), [maker?.name, instrument.name]);
  const eyebrow = maker?.name || instrument.category;
  const subtitle = [instrument.shortCategory, instrument.category]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .join(" · ") || instrument.category;

  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const overviewIsLong = prose.length > 280;

  return (
    <div className={"flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide " + scrollPaddingClassName}>
      {/* ============================ HERO ============================ */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1 / 1.05" }}>
        <div className="absolute inset-0" style={{ background: heroTint }} />
        {hero ? (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="absolute inset-0 z-[1] active:scale-[0.99] transition-transform"
            aria-label="Open photo"
            data-testid="button-gear-hero"
          >
            <img
              src={hero.url}
              alt={instrument.name}
              className="w-full h-full object-cover"
              style={{ objectPosition: "center bottom" }}
              draggable={false}
            />
          </button>
        ) : (
          <div className="absolute inset-0 z-[1] flex items-center justify-center text-fan-faint">
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        )}

        {/* Floating chrome over the photo */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <IconButton variant="glass" label="Back" onClick={onBack} data-testid="button-gear-back">
            <ChevronLeft className="w-[19px] h-[19px]" />
          </IconButton>
          <div className="flex items-center gap-2">
            <IconButton variant="glass" label="Share" onClick={onShare} data-testid="button-gear-share">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="M7 8l5-5 5 5" />
                <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
              </svg>
            </IconButton>
            <IconButton
              variant="glass"
              label={isBookmarked ? "Remove bookmark" : "Bookmark"}
              aria-pressed={isBookmarked}
              onClick={onToggleBookmark}
              data-testid="button-gear-bookmark"
            >
              <svg viewBox="0 0 24 24" fill={isBookmarked ? "#4AFFCA" : "none"} stroke={isBookmarked ? "#4AFFCA" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Bottom fade into page bg */}
        <div
          className="absolute inset-x-0 bottom-0 z-[2] pointer-events-none"
          style={{ height: "32%", background: "linear-gradient(to bottom, rgba(0,6,43,0) 0%, rgba(0,6,43,0.45) 55%, #00062B 100%)" }}
        />
      </div>

      {/* ============================ TITLE ============================ */}
      <div className="px-5 pt-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] block text-fan-faint" data-testid="text-gear-eyebrow">
            {eyebrow}
          </span>
          <h1 className="text-fan-primary font-bold leading-tight tracking-tight mt-1.5 text-[26px]" data-testid="text-gear-name">
            {instrument.name}
          </h1>
          <p className="text-[15px] mt-1 leading-snug text-fan-secondary" data-testid="text-gear-subtitle">
            {subtitle}
          </p>
          {tuningNote && (
            <span className="inline-flex items-center mt-2 px-2.5 py-1 rounded-full text-[12px] font-semibold text-fan-primary" style={{ background: "rgba(255,255,255,0.08)" }} data-testid="pill-gear-tuning">
              Tuning · {tuningNote}
            </span>
          )}
          {sourceUrl && <div className="mt-1"><SourceListingLink url={sourceUrl} /></div>}
        </div>
        {maker && (
          <button
            type="button"
            onClick={onOpenMaker}
            className="flex-shrink-0 rounded-2xl overflow-hidden block active:scale-[0.96] transition-transform"
            style={{ width: 96, height: 96, background: "#000", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 4px 18px rgba(0,0,0,0.45)" }}
            aria-label={maker.name}
            data-testid="chip-gear-maker"
          >
            {maker.logoUrl ? (
              <img src={maker.logoUrl} alt="" aria-hidden="true" className="w-full h-full object-contain p-2.5" draggable={false} />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-white text-[30px] font-bold">{getInitials(maker.name, "?")}</span>
            )}
          </button>
        )}
      </div>

      {/* ====================== ARTIST'S NOTE ====================== */}
      {artistNote && (
        <div className="px-5 pt-5">
          <ArtistNoteCard note={artistNote} />
        </div>
      )}

      {/* ========================= OVERVIEW ========================= */}
      {prose && (
        <div className="px-5 pt-7">
          <SectionHeader title="Overview" />
          <p className="text-[14px] leading-relaxed mt-3 whitespace-pre-line text-fan-secondary" data-testid="text-gear-overview">
            {overviewExpanded || !overviewIsLong ? prose : prose.slice(0, 280).trimEnd() + "… "}
            {overviewIsLong && !overviewExpanded && (
              <button type="button" onClick={() => setOverviewExpanded(true)} className="font-semibold text-fan-faint" data-testid="button-gear-overview-more">
                more
              </button>
            )}
          </p>
        </div>
      )}

      {/* ========================== PHOTOS ========================== */}
      {photos.length > 0 && (
        <div className="px-5 pt-7">
          <SectionHeader title="Photos" />
          <div className={"mt-3 grid gap-2 " + (photos.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="aspect-square rounded-xl overflow-hidden relative active:scale-[0.96] transition-transform ring-1 ring-white/10"
                style={{ background: heroTint }}
                data-testid={`thumb-gear-photo-${i}`}
                aria-label={`Open photo ${i + 1}`}
              >
                <img src={p.url} alt="" aria-hidden="true" className="w-full h-full object-cover" style={{ objectPosition: "center bottom" }} loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =========================== SPECS =========================== */}
      {specs.length > 0 && (
        <div className="px-5 pt-7">
          <SectionHeader title="Specs" />
          <div className="mt-3 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }} data-testid="list-gear-specs">
            {specs.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex items-start justify-between px-4 py-3"
                style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.07)" }}
                data-testid={`spec-${row.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
              >
                <span className="text-[12px] font-medium flex-shrink-0 pr-4 text-fan-faint">{row.label}</span>
                <span className="text-fan-primary text-[13px] text-right leading-snug">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================= PLAYED BY ========================= */}
      {playedBy && playedBy.length > 0 && (
        <>
          <div className="px-5 pt-7">
            <SectionHeader title="Played by" />
            <p className="text-[12px] mt-1 text-fan-faint">From the artists in your library</p>
          </div>
          <div className="pl-5 pt-3 pb-1">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 pr-5">
              {playedBy.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenArtist?.(a.id)}
                  className="flex flex-col items-center flex-shrink-0 active:scale-[0.94] transition-transform"
                  style={{ width: 78 }}
                  data-testid={`chip-gear-artist-${a.id}`}
                >
                  <GearAvatar name={a.name} photoUrl={a.photoUrl} />
                  <span className="text-fan-primary text-[11px] font-semibold mt-2 text-center leading-tight line-clamp-2" style={{ width: 78 }}>
                    {a.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ======================= WHERE TO BUY ======================= */}
      {vendors.length > 0 && (
        <>
          <div className="px-5 pt-6">
            <SectionHeader title="Where to buy" />
          </div>
          <div className="px-5 pt-3 space-y-2">
            {vendors.map((v, i) => (
              <div
                key={`${v.name}-${i}`}
                className="w-full rounded-xl px-3 h-14 flex items-center justify-between active:bg-white/5"
                style={{ background: "rgba(255,255,255,0.06)" }}
                data-testid={`row-gear-vendor-${i}`}
              >
                <button
                  type="button"
                  onClick={() => (onOpenVendor ? onOpenVendor(v) : onOpenBuy?.(v))}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left active:opacity-80"
                  data-testid={`button-gear-vendor-${i}`}
                >
                  <span className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-[#00062B] text-[14px] font-bold flex-shrink-0 overflow-hidden">
                    {v.logoUrl ? <img src={v.logoUrl} alt="" className="w-full h-full object-cover" /> : getInitials(v.name, "?")}
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-fan-primary text-[13px] font-semibold leading-tight truncate">{v.name}</span>
                    {v.tagline && <span className="text-[11px] leading-tight truncate text-fan-faint">{v.tagline}</span>}
                  </span>
                </button>
                {v.affiliateUrl ? (
                  <IconButton variant="glass" label={`Open ${instrument.name} at ${v.name}`} onClick={() => onOpenBuy?.(v)} className="flex-shrink-0 ml-2" data-testid={`button-gear-buy-${i}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 4h6v6" />
                      <path d="M20 4L10 14" />
                      <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                    </svg>
                  </IconButton>
                ) : (
                  <ChevronRight className="w-4 h-4 flex-shrink-0 text-fan-faint mr-1" />
                )}
              </div>
            ))}
          </div>
          <div className="px-5 pt-4">
            <p className="text-[11px] leading-relaxed text-fan-faint">
              Vendor links are affiliate-aware — when fans buy through GoodTunes, a portion supports the artists who chose this gear.
            </p>
          </div>
        </>
      )}

      {lightboxIndex !== null && photos.length > 0 && (
        <PhotoLightbox photos={photos} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────── */

interface GearPhoto {
  id: string;
  url: string;
  label: string;
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-fan-primary text-[22px] font-bold leading-tight tracking-tight">{title}</h2>;
}

function GearAvatar({ name, photoUrl, size = 72 }: { name: string; photoUrl?: string | null; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, background: tintFor(name, true), fontSize: size * 0.36, boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}
    >
      {photoUrl ? <img src={photoUrl} alt={name} className="w-full h-full object-cover" draggable={false} /> : getInitials(name, "?")}
    </div>
  );
}

function ArtistNoteCard({ note }: { note: GearArtistNote }) {
  return (
    <div className="rounded-2xl px-4 py-4 flex items-start gap-3.5" style={{ background: "rgba(255,255,255,0.06)" }} data-testid="card-gear-artist-note">
      {note.person && <GearAvatar name={note.person.name} photoUrl={note.person.photoUrl} size={52} />}
      <div className="min-w-0 flex-1">
        <p className="text-fan-primary text-[14px] leading-snug italic">“{note.quote}”</p>
        {note.person && (
          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-fan-primary text-[12px] font-semibold">— {note.person.name}</span>
            {note.albumNote && <span className="text-[11px] text-fan-faint">{note.albumNote}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceListingLink({ url }: { url: string }) {
  let host = "";
  try { host = new URL(url).host.replace(/^www\./, ""); } catch { return null; }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 text-xs font-medium inline-flex items-center gap-1 text-fan-faint hover:text-[var(--brand-blue)] hover:underline"
      data-testid="link-gear-source"
    >
      <span>View original listing</span>
      <span aria-hidden className="opacity-60">·</span>
      <span className="truncate max-w-[180px]" aria-hidden>{host}</span>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4h6v6" />
        <path d="M20 4L10 14" />
        <path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
      </svg>
    </a>
  );
}

// Deterministic dark radial-gradient backdrop derived from a label so the
// hero reads as "vendor-tinted" even though we don't store a per-vendor
// brand color. Kept dark + muted so transparent-PNG gear sits cleanly and
// the bottom fade into #00062B is seamless. `vivid` brightens it for the
// small avatar circles.
function tintFor(seed: string, vivid = false): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  if (vivid) return `hsl(${h} 38% 34%)`;
  return `radial-gradient(120% 90% at 50% 30%, hsl(${h} 32% 30%) 0%, hsl(${h} 38% 16%) 52%, hsl(${(h + 8) % 360} 45% 7%) 88%, #0a0820 100%)`;
}

export function parseGearAbout(about: string): { prose: string; specs: { label: string; value: string }[] } {
  const lines = about.split(/\r?\n/);
  const proseLines: string[] = [];
  const specs: { label: string; value: string }[] = [];
  const specLine = /^\s*([A-Z][A-Za-z0-9 /()&'.-]{0,40}):\s+(.{1,80})\s*$/;
  for (const raw of lines) {
    const m = raw.match(specLine);
    const looksProse = m && (/[.!?]\s+\S/.test(m[2]) || /[.!?]["')\]]?\s*$/.test(m[2]));
    if (m && !looksProse) specs.push({ label: m[1].trim(), value: m[2].trim() });
    else proseLines.push(raw);
  }
  const prose = proseLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { prose, specs };
}

/* ── Photo Lightbox ─────────────────────────────────────────────────
   Fullscreen swipeable photo viewer. Touch-drag or arrow buttons to page;
   tap X / Escape to dismiss. Mirrors the artist-photos control. */
function PhotoLightbox({ photos, startIndex, onClose }: { photos: GearPhoto[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef<number | null>(null);
  const widthRef = useRef<number>(420);
  const trackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (trackRef.current) widthRef.current = trackRef.current.clientWidth || 420;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photos.length]);

  const endDrag = () => {
    if (startXRef.current == null) return;
    const threshold = widthRef.current * 0.18;
    if (dragX < -threshold && index < photos.length - 1) setIndex(index + 1);
    else if (dragX > threshold && index > 0) setIndex(index - 1);
    startXRef.current = null;
    setDragX(0);
  };

  const translatePct = lightboxTranslatePct(index, dragX, widthRef.current, photos.length);
  const atFirst = index === 0;
  const atLast = index === photos.length - 1;
  const current = photos[index];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "#000" }} role="dialog" aria-modal="true" aria-label="Photo viewer" data-testid="lightbox-gear">
      <div className="flex items-center justify-between px-3 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
        <GlassRound onClick={onClose} label="Close" testId="button-lightbox-close"><X className="w-[19px] h-[19px] text-white" /></GlassRound>
        <span className="text-white text-[14px] font-semibold tabular-nums">{index + 1} / {photos.length}</span>
        <div className="w-11 h-11" />
      </div>
      <div
        ref={trackRef}
        className="flex-1 overflow-hidden relative"
        onTouchStart={(e) => { startXRef.current = e.touches[0].clientX; }}
        onTouchMove={(e) => { if (startXRef.current != null) setDragX(e.touches[0].clientX - startXRef.current); }}
        onTouchEnd={endDrag}
        onPointerDown={(e) => { startXRef.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (startXRef.current != null) setDragX(e.clientX - startXRef.current); }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ touchAction: "pan-y", cursor: "grab" }}
      >
        <div className="flex h-full" style={{ transform: `translateX(${translatePct}%)`, transition: startXRef.current == null ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : "none", width: `${photos.length * 100}%` }}>
          {photos.map((p) => (
            <div key={p.id} className="h-full flex items-center justify-center px-4" style={{ width: `${100 / photos.length}%` }}>
              <img src={p.url} alt={p.label} className="max-w-full max-h-full object-contain select-none" draggable={false} />
            </div>
          ))}
        </div>
        {!atFirst && (
          <button type="button" onClick={() => setIndex(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform" style={glassStyle} data-testid="button-lightbox-prev" aria-label="Previous">
            <ChevronLeft className="w-[19px] h-[19px] text-white" />
          </button>
        )}
        {!atLast && (
          <button type="button" onClick={() => setIndex(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform" style={glassStyle} data-testid="button-lightbox-next" aria-label="Next">
            <ChevronRight className="w-[19px] h-[19px] text-white" />
          </button>
        )}
      </div>
      <div className="px-5 pt-3 pb-5 flex flex-col items-center gap-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}>
        <div className="flex items-center gap-1.5">
          {photos.map((p, i) => (
            <button key={p.id} type="button" onClick={() => setIndex(i)} aria-label={`Go to photo ${i + 1}`} className="rounded-full transition-all" style={{ width: i === index ? 18 : 6, height: 6, background: i === index ? "#fff" : "rgba(255,255,255,0.4)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const glassStyle = { background: "rgba(255,255,255,0.12)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" } as const;

function GlassRound({ children, onClick, label, testId }: { children: ReactNode; onClick: () => void; label: string; testId: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="w-11 h-11 rounded-full inline-flex items-center justify-center active:scale-[0.94] transition-transform" style={glassStyle} data-testid={testId}>
      {children}
    </button>
  );
}
