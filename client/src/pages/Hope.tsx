import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  ChevronLeft,
  Minus,
  Plus,
  ShoppingBag,
  Info,
  Gift,
  Sparkles,
  Expand,
  Apple,
  Lock,
  Play,
  Pause,
  X,
  Share2,
  MoreHorizontal,
} from "lucide-react";
import { usePlayer } from "@/context/PlayerContext";
import type { PlayerSong } from "@/context/PlayerContext";
import type { Album } from "@/data/musicData";

/**
 * "Get Hope. Give Hope." — the redesigned Preview & Purchase campaign flow,
 * promoted from the canvas mockup to real routes. It runs in two modes:
 *
 *   - `comingSoon`  (/hope) — a public teaser. The whole flow is visible but the
 *                   primary CTA is grayed and reads the launch label; nothing
 *                   advances. Share this link before launch.
 *   - `preview`     (/staging/<artist>/<release>) — the full clickable flow for
 *                   the artist's family to review. Every step works, but the pay
 *                   step's order buttons are disabled (no real ordering yet).
 *
 * All artist-specific copy / pricing / imagery lives in the RELEASES registry
 * below, so a future campaign is a new entry — not a new page. Pricing here is
 * PLACEHOLDER until the real checkout is wired.
 */

/* ── brand tokens ─────────────────────────────────────────────────── */
const BG = "#00062B";
const CARD = "#0E1A4E";
const PANEL = "#19295D";
const BLUE = "#319ED8";
const ORANGE = "#F09837";

const CARD_IMG = 150;

const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}`;

/* ── campaign preview access (server-token-gated) ─────────────────────
 * The unguessable share link carries `?k=<token>`. The server resolves the
 * token to a tier and (when valid) the album's previewable tracks. The
 * embargoed title track never appears here — the server filters it out. */
type PreviewTrack = {
  id: string;
  title: string;
  trackNumber: number;
  duration: number;
  muxPlaybackId: string;
  muxStatus: string;
};
type LockedTrack = {
  title: string;
  trackNumber: number;
};
type PreviewVideo = {
  title: string;
};
type CampaignAccess = {
  tier: "none" | "preview" | "family";
  albumId: string;
  tracks: PreviewTrack[];
  lockedTracks?: LockedTrack[];
  videos?: PreviewVideo[];
  // Authoritative campaign pricing (whole dollars) from the server config — the
  // client overrides its local registry with this so the Buy price the fan sees
  // is never hardcoded in the bundle.
  prices?: { bundle: number; signed: number };
};

const fmtDur = (sec: number) => {
  const total = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/* ── per-release content registry ─────────────────────────────────── */

type Edition = { label: string; items: { head: string; body: string }[] };

type ReleaseContent = {
  artistName: string;
  releaseName: string;
  launchLabel: string;
  previewNote: string;
  imageBase: string;
  images: { hero: string; cert: string; box: string; logo: string; cover: string };
  org: string;
  prices: { bundle: number; signed: number };
  gift: { min: number; presets: number[] };
  tracklist: { title: string; len: string }[];
  overview: {
    heading: string;
    paragraphs: ReactNode[];
    panelTitle: string;
    panelBody: string;
    editions: Edition[];
  };
  buy: {
    heading: string;
    intro: string;
    bundleName: string;
    bundleBody: string;
    signedName: string;
    signedBody: string;
    whyMore: string;
  };
  give: {
    heading: string;
    intro: string;
    boxName: string;
    boxBody: ReactNode;
    notes: ReactNode[];
  };
};

const RELEASES: Record<string, ReleaseContent> = {
  "nightbirde/hope": {
    artistName: "Nightbirde",
    releaseName: "Hope",
    launchLabel: "Coming today",
    previewNote: "Preview — ordering opens June 8, 2026.",
    imageBase: "/campaigns/nightbirde",
    images: {
      hero: "hope-get-hope.png",
      cert: "hope-cert-framed.jpg",
      box: "hope-gift-box.png",
      logo: "goodtunes-logo-white.png",
      cover: "hope-cover.png",
    },
    org: "Nightbirde Foundation",
    prices: { bundle: 25, signed: 25 },
    gift: { min: 75, presets: [75, 100, 250] },
    tracklist: [
      { title: "Gold", len: "3:20" },
      { title: "Better Days", len: "3:21" },
      { title: "It's OK", len: "3:22" },
      { title: "Girl in a Bubble", len: "3:23" },
      { title: "Brave", len: "3:24" },
    ],
    overview: {
      heading: "Get Hope. Give Hope.",
      paragraphs: [
        <>
          It's been five years since <strong className="text-white">Nightbirde</strong> (Jane
          Marczewski) appeared on <strong className="text-white">America's Got Talent</strong> (AGT)
          and received the <strong className="text-white">Golden Buzzer</strong> from{" "}
          <strong className="text-white">Simon Cowell.</strong>
        </>,
        <>
          Before she passed, Jane provided her family with all of her journals, photos, artwork, and
          music and gave them a mission — use whatever you can to help women with breast cancer.
        </>,
        <>
          The "Get Hope. Give Hope." campaign was built to do just that — proceeds from every
          purchase go to Nightbirde Foundation. You can also donate a "Gift of Hope" box to someone
          you know with cancer, or let us choose someone in need on your behalf.
        </>,
      ],
      panelTitle: "Here's what you'll get",
      panelBody:
        "This package has been hand curated by Jane's family for you. Digital arrives instantly. Physical ships 8–10 weeks after ordering.",
      editions: [
        {
          label: "Digital Collector Edition",
          items: [
            { head: "Music", body: "Instant access to the music with the free GoodTunes® Player." },
            { head: "GoodDeed®", body: "A numbered, personalized printable PDF GoodDeed® Certificate suitable for framing." },
            { head: "Bonus", body: "Photos and videos curated by Jane's family." },
          ],
        },
        {
          label: "Physical Collector Edition",
          items: [
            { head: "Music", body: "7\" vinyl tracks \"Gold\" & \"Better Days\"." },
            { head: "Booklet", body: "Special-edition companion booklet featuring lyrics, Jane's poems, exclusive photos and more." },
          ],
        },
      ],
    },
    buy: {
      heading: "Get Hope",
      intro:
        "The first in a limited-edition series — a 7\" Physical Collector Edition plus the full Digital Collector Edition. Proceeds benefit the Nightbirde Foundation.",
      bundleName: "Hope Bundle",
      bundleBody:
        "Physical 7\" vinyl + companion booklet, plus the Digital Collector Edition with GoodDeed® certificate and bonus content from Jane's family.",
      signedName: "Signed GoodDeed® Certificate",
      signedBody:
        "Hand-signed by Jane's family, personalized with your name and unique number, finished with a holographic seal + QR provenance. Ships with your vinyl.",
      whyMore:
        "Some people buy more than one as a gift for friends — sharing the music, and the chance to help women facing cancer.",
    },
    give: {
      heading: "Give Hope",
      intro:
        "Send a Gift of Hope box to someone facing cancer — or let us choose someone in need on your behalf. Every box is a donation to the Nightbirde Foundation.",
      boxName: "Gift of Hope Box",
      boxBody: (
        <>
          A stainless-steel Nightbirde cup, a copy of her debut album "It's OK," and Jane's book of
          poetry, <em>Poems for the Dark</em>.
        </>
      ),
      notes: [
        "Giving more than one? Tell us who each gift is for after checkout — we'll make it easy.",
        "Personalize after purchase: keep a gift anonymous or add a message, and choose who receives each box.",
      ],
    },
  },
};

type Step = "overview" | "buy" | "give" | "pay";
const ORDER: Step[] = ["overview", "buy", "give", "pay"];

/* ── small primitives ─────────────────────────────────────────────── */

function QtyStepper({
  value,
  onChange,
  testid,
  min = 0,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  testid: string;
  min?: number;
  max?: number;
}) {
  const atMin = value <= min;
  const atMax = max != null && value >= max;
  return (
    <div
      className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1"
      data-testid={testid}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={atMin}
      >
        <Minus className="w-4 h-4" strokeWidth={2.4} />
      </button>
      <span className="w-7 text-center text-white text-[15px] font-semibold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        disabled={atMax}
      >
        <Plus className="w-4 h-4" strokeWidth={2.4} />
      </button>
    </div>
  );
}

function LineMath({ unit, qty, testid }: { unit: number; qty: number; testid: string }) {
  return (
    <span className="text-white/55 text-[14px] tabular-nums" data-testid={testid}>
      {usd(unit)} <span className="text-white/35">×</span> {qty}{" "}
      <span className="text-white/35">=</span>{" "}
      <span className="text-white font-bold">{usd(unit * qty)}</span>
    </span>
  );
}

function WhyMore({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="link-why-more"
        className="inline-flex items-center gap-1 text-white/45 hover:text-white/75 text-[12px] transition-colors"
      >
        <Info className="w-3.5 h-3.5" strokeWidth={2} />
        Why more than one?
      </button>
      {open && (
        <div
          data-testid="popover-why-more"
          className="absolute z-30 left-0 top-full mt-2 w-[268px] rounded-xl p-3.5 text-[12.5px] leading-[1.55] text-white/85"
          style={{
            background: PANEL,
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function EditionCol({ edition }: { edition: Edition }) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="text-[13px] font-bold uppercase tracking-[0.04em] mb-3"
        style={{ color: ORANGE }}
      >
        {edition.label}
      </div>
      <div className="flex flex-col gap-3.5">
        {edition.items.map((it) => (
          <div key={it.head}>
            <div className="text-white text-[13.5px] font-semibold">{it.head}</div>
            <div className="text-white/60 text-[12.5px] leading-[1.45] mt-0.5">{it.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Note({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start text-white/55 text-[12.5px] leading-[1.55]">
      <Icon className="w-4 h-4 mt-px flex-shrink-0" strokeWidth={2} style={{ color: ORANGE }} />
      <span>{children}</span>
    </div>
  );
}

function Zoomable({
  src,
  alt,
  size,
  onZoom,
  testid,
}: {
  src: string;
  alt: string;
  size: number;
  onZoom: (src: string) => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onZoom(src)}
      data-testid={testid}
      className="group relative flex-shrink-0 rounded-2xl overflow-hidden bg-white cursor-zoom-in"
      style={{ width: size, height: size, boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
    >
      <img src={src} alt={alt} className="w-full h-full object-cover" draggable={false} />
      <span
        className="absolute bottom-2 right-2 w-7 h-7 rounded-full inline-flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "rgba(0,0,0,0.5)" }}
      >
        <Expand className="w-3.5 h-3.5" strokeWidth={2.4} />
      </span>
    </button>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Enlarged image"
      className="absolute inset-0 z-50 flex items-center justify-center p-12"
      style={{ background: "rgba(0,2,12,0.82)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
      data-testid="lightbox"
    >
      <img
        src={src}
        alt=""
        className="max-w-[86%] max-h-[86%] rounded-2xl object-contain bg-white"
        style={{ boxShadow: "0 30px 90px rgba(0,0,0,0.7)" }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        data-testid="button-lightbox-close"
        className="absolute top-5 right-5 w-10 h-10 rounded-full inline-flex items-center justify-center text-white/85 hover:text-white transition-colors"
        style={{ background: "rgba(0,0,0,0.45)" }}
      >
        <X className="w-5 h-5" strokeWidth={2.2} />
      </button>
    </div>
  );
}

/* ── faint album page behind the modal ────────────────────────────── */

function AlbumBackdrop({
  c,
  dimmed = true,
  tracks,
  lockedTracks,
  videos,
  albumId,
  canBuy = false,
  priceLabel,
  onBuy,
  onLearnMore,
}: {
  c: ReleaseContent;
  dimmed?: boolean;
  tracks?: PreviewTrack[];
  lockedTracks?: LockedTrack[];
  videos?: PreviewVideo[];
  albumId?: string;
  // Buy is OFF for fans (bare link) and ON for family (/staging). The price
  // label always comes from the backend, never hardcoded here.
  canBuy?: boolean;
  priceLabel?: string;
  onBuy?: () => void;
  onLearnMore?: () => void;
}) {
  const img = (name: string) => `${c.imageBase}/${name}`;
  const { playSong, setPreviewMode, togglePlay, currentSong, isPlaying } = usePlayer();
  const [shared, setShared] = useState(false);

  // Real, playable tracks supersede the static placeholder tracklist. Each row
  // streams a 30s preview (setPreviewMode caps it; the server signs a Mux URL).
  const hasReal = !!tracks && tracks.length > 0;
  // The locked album view (shown once the offer card is dismissed) mirrors the
  // real release page: previewable tracks interleaved with the embargoed title
  // track shown grayed, in track-number order. Locked rows carry no id/Mux
  // handle, so they can never play before launch.
  const rows: (
    | { kind: "preview"; trackNumber: number; t: PreviewTrack }
    | { kind: "locked"; trackNumber: number; title: string }
  )[] = [
    ...(tracks ?? []).map(
      (t) => ({ kind: "preview" as const, trackNumber: t.trackNumber, t }),
    ),
    ...(lockedTracks ?? []).map(
      (l) => ({ kind: "locked" as const, trackNumber: l.trackNumber, title: l.title }),
    ),
  ].sort((a, b) => a.trackNumber - b.trackNumber);
  const lockedVideos = videos ?? [];
  const album: Album = {
    id: albumId ?? "",
    title: c.releaseName,
    artist: c.artistName,
    artwork: img(c.images.cover),
    year: 2026,
    type: "LP",
    description: "",
  };
  const queue: PlayerSong[] = (tracks ?? []).map((t) => ({
    id: t.id,
    albumId: album.id,
    title: t.title,
    trackNumber: t.trackNumber,
    duration: t.duration,
    muxPlaybackId: t.muxPlaybackId,
    muxStatus: t.muxStatus,
    album,
  })) as PlayerSong[];

  const onRow = (id: string) => {
    if (currentSong?.id === id) {
      togglePlay();
      return;
    }
    setPreviewMode(true);
    const song = queue.find((q) => q.id === id);
    if (song) playSong(song, queue);
  };

  // Play-all starts the first previewable track and runs the queue. The
  // embargoed title track carries no id (it lives in lockedTracks, not the
  // queue) so it is skipped automatically — exactly the "skip the dimmed Hope
  // track" behaviour Bill asked for. Previews stay capped at 30s.
  const queuePlaying = !!currentSong && queue.some((q) => q.id === currentSong.id) && isPlaying;
  const onPlayAll = () => {
    if (queuePlaying) {
      togglePlay();
      return;
    }
    if (currentSong && queue.some((q) => q.id === currentSong.id)) {
      togglePlay();
      return;
    }
    if (queue[0]) onRow(queue[0].id);
  };

  const onShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({
          title: `${c.artistName} — ${c.releaseName}`,
          url,
        });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user dismissed the share sheet — no-op */
    }
    setShared(true);
    setTimeout(() => setShared(false), 1800);
  };

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden={dimmed} style={{ background: BG }}>
      <img
        src={img(c.images.logo)}
        alt=""
        className="absolute top-7 left-8 w-[120px] h-auto opacity-90 z-10"
        draggable={false}
      />
      {!dimmed && (
        <div className="absolute top-7 right-8 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            data-testid="button-share-campaign"
            aria-label="Share this link"
            className="h-11 px-4 rounded-full inline-flex items-center gap-1.5 text-white/80 hover:text-white text-[13px] font-semibold bg-white/[0.08] hover:bg-white/[0.14] transition-colors"
          >
            <Share2 className="w-4 h-4" strokeWidth={2.2} />
            {shared ? "Link copied" : "Share"}
          </button>
          {/* GoodDeed / album menu is intentionally locked before launch — shown
              but grayed + unselectable so fans can't open it (sharing is fine). */}
          <span
            data-testid="button-menu-locked"
            aria-disabled="true"
            title="Available after launch"
            className="h-11 w-11 rounded-full inline-flex items-center justify-center text-white/25 bg-white/[0.04] cursor-not-allowed"
          >
            <MoreHorizontal className="w-4 h-4" strokeWidth={2.2} />
          </span>
        </div>
      )}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${
          dimmed ? "opacity-35 blur-[3px] scale-[1.02]" : "opacity-100 blur-0 scale-100"
        }`}
      >
        <div className="flex items-center gap-10 px-8 w-[min(880px,calc(100vw-64px))]">
          <div
            className="flex-shrink-0 rounded-2xl overflow-hidden"
            style={{ width: 300, height: 300, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}
          >
            <img
              src={img(c.images.cover)}
              alt={`${c.releaseName} album cover`}
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white/55 text-[13px] font-semibold uppercase tracking-[0.12em] mb-1">
              {c.artistName}
            </div>
            <div className="text-white text-[34px] font-bold tracking-[-0.02em] mb-5">
              {c.releaseName}
            </div>
            {!dimmed && (
              <div className="flex items-center gap-3 mb-6">
                <button
                  type="button"
                  onClick={onPlayAll}
                  disabled={queue.length === 0}
                  data-testid="button-play-all"
                  className="h-11 pl-5 pr-6 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14.5px] transition-all active:scale-[0.97] disabled:opacity-40"
                  style={{ background: BLUE }}
                >
                  {queuePlaying ? (
                    <Pause className="w-4 h-4" strokeWidth={2.6} />
                  ) : (
                    <Play className="w-4 h-4" strokeWidth={2.6} />
                  )}
                  {queuePlaying ? "Pause" : "Play"}
                </button>
                {canBuy ? (
                  <button
                    type="button"
                    onClick={onBuy}
                    data-testid="button-buy"
                    className="h-11 px-5 rounded-full inline-flex items-center gap-2 font-semibold text-[14.5px] text-white bg-white/[0.1] hover:bg-white/[0.16] transition-colors active:scale-[0.97]"
                  >
                    <ShoppingBag className="w-4 h-4" strokeWidth={2.4} />
                    Buy{priceLabel ? ` ${priceLabel}` : ""}
                  </button>
                ) : (
                  <span
                    data-testid="button-buy-locked"
                    aria-disabled="true"
                    title="Ordering opens soon"
                    className="h-11 px-5 rounded-full inline-flex items-center gap-2 font-semibold text-[14.5px] text-white/40 bg-white/[0.05] cursor-not-allowed"
                  >
                    <Lock className="w-4 h-4" strokeWidth={2.4} />
                    Buy{priceLabel ? ` ${priceLabel}` : ""}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onLearnMore}
                  data-testid="button-learn-more"
                  className="h-11 px-4 rounded-full inline-flex items-center text-white/70 hover:text-white text-[14px] font-semibold transition-colors"
                >
                  Learn More
                </button>
              </div>
            )}
            {rows.length > 0 ? (
              <div className="flex flex-col gap-1">
                {rows.map((row) => {
                  if (row.kind === "locked") {
                    return (
                      <div
                        key={`locked-${row.trackNumber}-${row.title}`}
                        data-testid={`track-locked-${row.trackNumber}`}
                        className="flex items-center gap-4 -mx-2 px-2 py-1.5 rounded-lg"
                      >
                        <span className="w-4 flex items-center justify-center text-[14px] tabular-nums text-white/30">
                          {row.trackNumber}
                        </span>
                        <span className="text-[15px] flex-1 truncate text-white/35">
                          {row.title}
                        </span>
                        <Lock className="w-3.5 h-3.5 text-white/30" strokeWidth={2.2} />
                      </div>
                    );
                  }
                  const t = row.t;
                  const isCurrent = currentSong?.id === t.id;
                  const playing = isCurrent && isPlaying;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => !dimmed && onRow(t.id)}
                      disabled={dimmed}
                      data-testid={`track-preview-${t.id}`}
                      className="group flex items-center gap-4 text-left rounded-lg -mx-2 px-2 py-1.5 transition-colors hover:bg-white/5 disabled:cursor-default"
                    >
                      <span className="w-4 flex items-center justify-center text-[14px] tabular-nums">
                        {playing ? (
                          <Pause className="w-3.5 h-3.5" style={{ color: BLUE }} strokeWidth={2.4} />
                        ) : isCurrent ? (
                          <Play className="w-3.5 h-3.5" style={{ color: BLUE }} strokeWidth={2.4} />
                        ) : (
                          <>
                            <span className="text-white/40 group-hover:hidden">{row.trackNumber}</span>
                            <Play
                              className="w-3.5 h-3.5 hidden group-hover:block text-white"
                              strokeWidth={2.4}
                            />
                          </>
                        )}
                      </span>
                      <span
                        className="text-[15px] flex-1 truncate"
                        style={{ color: isCurrent ? BLUE : "#fff" }}
                      >
                        {t.title}
                      </span>
                      <span className="text-white/40 text-[13px] tabular-nums">
                        {fmtDur(t.duration)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {c.tracklist.map((t, i) => (
                  <div key={t.title} className="flex items-center gap-4">
                    <span className="text-white/40 text-[14px] tabular-nums w-4">{i + 1}</span>
                    <span className="text-white text-[15px] flex-1">{t.title}</span>
                    <span className="text-white/40 text-[13px] tabular-nums">{t.len}</span>
                  </div>
                ))}
              </div>
            )}

            {lockedVideos.length > 0 && (
              <div className="mt-7">
                <div className="flex items-center gap-2 text-white/45 text-[12px] font-semibold uppercase tracking-[0.12em] mb-3">
                  Videos
                  <Lock className="w-3 h-3" strokeWidth={2.4} />
                </div>
                <div className="flex gap-3">
                  {lockedVideos.map((v) => (
                    <div
                      key={v.title}
                      data-testid={`video-locked-${v.title}`}
                      className="relative flex-shrink-0 w-[124px] rounded-xl overflow-hidden border border-white/10"
                      style={{ background: PANEL }}
                    >
                      <div className="relative aspect-video flex items-center justify-center">
                        <img
                          src={img(c.images.cover)}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover opacity-25"
                          draggable={false}
                        />
                        <Lock className="relative w-4 h-4 text-white/80" strokeWidth={2.4} />
                      </div>
                      <div className="px-2 py-1.5 text-white/55 text-[11px] font-medium truncate">
                        {v.title}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {dimmed && (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,3,18,0.5)", pointerEvents: "none" }}
        />
      )}
    </div>
  );
}

/* ── steps ────────────────────────────────────────────────────────── */

function OverviewStep({ c }: { c: ReleaseContent }) {
  const img = (name: string) => `${c.imageBase}/${name}`;
  return (
    <div data-testid="step-overview">
      <h1 className="text-white text-[30px] font-bold tracking-[-0.02em] mb-5">
        {c.overview.heading}
      </h1>
      <div className="flex gap-6">
        <div
          className="flex-shrink-0 rounded-2xl overflow-hidden bg-white"
          style={{ width: 210, height: 210, boxShadow: "0 12px 36px rgba(0,0,0,0.4)" }}
        >
          <img
            src={img(c.images.hero)}
            alt={`${c.artistName} — ${c.releaseName}`}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 text-white/70 text-[13px] leading-[1.55] flex flex-col gap-3">
          {c.overview.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl p-6" style={{ background: PANEL }}>
        <h2 className="text-white text-[20px] font-bold tracking-[-0.01em]">
          {c.overview.panelTitle}
        </h2>
        <p className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[560px]">
          {c.overview.panelBody}
        </p>
        <div className="flex gap-8 mt-5">
          <EditionCol edition={c.overview.editions[0]} />
          <div className="w-px self-stretch bg-white/10" />
          <EditionCol edition={c.overview.editions[1]} />
        </div>
      </div>
    </div>
  );
}

function BuyStep({
  c,
  bundleQty,
  onBundle,
  signedQty,
  onSigned,
  onZoom,
}: {
  c: ReleaseContent;
  bundleQty: number;
  onBundle: (n: number) => void;
  signedQty: number;
  onSigned: (n: number) => void;
  onZoom: (src: string) => void;
}) {
  const img = (name: string) => `${c.imageBase}/${name}`;
  return (
    <div data-testid="step-buy">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-1.5">{c.buy.heading}</h1>
      <p className="text-white/60 text-[13.5px] leading-[1.5] mb-6 max-w-[520px]">{c.buy.intro}</p>

      <div className="flex gap-5">
        <Zoomable
          src={img(c.images.hero)}
          alt={c.buy.bundleName}
          size={CARD_IMG}
          onZoom={onZoom}
          testid="zoom-bundle"
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-white text-[19px] font-bold tracking-[-0.01em]">{c.buy.bundleName}</h3>
            <div
              className="flex-shrink-0 text-white text-[18px] font-bold tabular-nums"
              data-testid="price-bundle"
            >
              {usd(c.prices.bundle)}
            </div>
          </div>
          <p className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[340px]">{c.buy.bundleBody}</p>
          <div className="mt-auto pt-4 flex items-center gap-4">
            <QtyStepper value={bundleQty} onChange={onBundle} min={1} testid="stepper-bundle" />
            <LineMath unit={c.prices.bundle} qty={bundleQty} testid="linetotal-bundle" />
          </div>
          <div className="mt-2.5">
            <WhyMore text={c.buy.whyMore} />
          </div>
        </div>
      </div>

      <div className="h-px bg-white/10 my-6" />
      <div>
        <div className="flex gap-5">
          <Zoomable
            src={img(c.images.cert)}
            alt={c.buy.signedName}
            size={CARD_IMG}
            onZoom={onZoom}
            testid="zoom-signed"
          />
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-white text-[16px] font-bold tracking-[-0.01em]">{c.buy.signedName}</h3>
              <div
                className="flex-shrink-0 text-white text-[15px] font-bold tabular-nums"
                data-testid="price-signed"
              >
                +{usd(c.prices.signed)} each
              </div>
            </div>
            <p className="text-white/65 text-[12.5px] leading-[1.5] mt-1.5 max-w-[360px]">{c.buy.signedBody}</p>
            <div className="mt-auto pt-3.5 flex items-center gap-4">
              <QtyStepper
                value={signedQty}
                onChange={onSigned}
                min={0}
                max={bundleQty}
                testid="stepper-signed"
              />
              <span className="text-[13px] tabular-nums" data-testid="hint-signed">
                {signedQty === 0 ? (
                  <span className="text-white/45">
                    Optional — up to your {bundleQty} cop{bundleQty > 1 ? "ies" : "y"}
                  </span>
                ) : (
                  <span className="text-white/55">
                    {signedQty} of {bundleQty} signed{" "}
                    <span className="text-white/35">=</span>{" "}
                    <span className="text-white font-bold">{usd(c.prices.signed * signedQty)}</span>
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GiftAmount({
  c,
  amount,
  onAmount,
}: {
  c: ReleaseContent;
  amount: number;
  onAmount: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {c.gift.presets.map((p) => {
        const active = amount === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onAmount(p)}
            data-testid={`pill-gift-${p}`}
            className="h-10 px-4 rounded-full text-[14px] font-semibold tabular-nums transition-colors"
            style={
              active
                ? { background: "#fff", color: BG }
                : {
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.8)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }
            }
          >
            {usd(p)}
          </button>
        );
      })}
      <div className="inline-flex items-center rounded-full border border-white/20 bg-white/[0.04] h-10 px-1">
        <button
          type="button"
          aria-label="Give less"
          onClick={() => onAmount(Math.max(c.gift.min, amount - 25))}
          disabled={amount <= c.gift.min}
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Minus className="w-4 h-4" strokeWidth={2.4} />
        </button>
        <span
          className="px-2 text-center text-white text-[14px] font-semibold tabular-nums"
          data-testid="text-gift-amount"
        >
          {usd(amount)}
        </span>
        <button
          type="button"
          aria-label="Give more"
          onClick={() => onAmount(amount + 25)}
          className="w-8 h-8 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

function GiveStep({
  c,
  boxQty,
  onBox,
  giftAmount,
  onAmount,
  onZoom,
}: {
  c: ReleaseContent;
  boxQty: number;
  onBox: (n: number) => void;
  giftAmount: number;
  onAmount: (n: number) => void;
  onZoom: (src: string) => void;
}) {
  const img = (name: string) => `${c.imageBase}/${name}`;
  const active = boxQty > 0;
  return (
    <div data-testid="step-give">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-1.5">{c.give.heading}</h1>
      <p className="text-white/60 text-[13.5px] leading-[1.5] mb-6 max-w-[540px]">{c.give.intro}</p>

      <div className="flex gap-5">
        <Zoomable
          src={img(c.images.box)}
          alt={c.give.boxName}
          size={CARD_IMG}
          onZoom={onZoom}
          testid="zoom-box"
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <h3 className="text-white text-[19px] font-bold tracking-[-0.01em]">{c.give.boxName}</h3>
          <p className="text-white/65 text-[13px] leading-[1.5] mt-1.5 max-w-[360px]">{c.give.boxBody}</p>
          <div className="mt-auto pt-4 flex items-center gap-4">
            <QtyStepper value={boxQty} onChange={onBox} min={0} testid="stepper-box" />
            <span className="text-[13px]" data-testid="hint-box">
              {active ? (
                <span className="text-white/55">
                  {boxQty} box{boxQty > 1 ? "es" : ""}
                </span>
              ) : (
                <span className="text-white/45">Optional</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-6 rounded-2xl p-5" style={{ background: PANEL }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-white text-[14px] font-semibold">
              Your gift{boxQty > 1 ? " (each box)" : ""}
            </span>
            <span className="text-white/45 text-[12.5px]">Minimum {usd(c.gift.min)}</span>
          </div>
          <GiftAmount c={c} amount={giftAmount} onAmount={onAmount} />
          {boxQty > 1 && (
            <div className="mt-3 text-white/55 text-[13px] tabular-nums" data-testid="text-gift-total">
              {usd(giftAmount)} <span className="text-white/35">×</span> {boxQty}{" "}
              <span className="text-white/35">=</span>{" "}
              <span className="text-white font-bold">{usd(giftAmount * boxQty)}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <Note icon={Gift}>{c.give.notes[0]}</Note>
        <Note icon={Sparkles}>{c.give.notes[1]}</Note>
      </div>
    </div>
  );
}

function PayStep({
  c,
  bundleQty,
  signedQty,
  boxQty,
  giftAmount,
}: {
  c: ReleaseContent;
  bundleQty: number;
  signedQty: number;
  boxQty: number;
  giftAmount: number;
}) {
  const lines = [
    { label: c.buy.bundleName, sub: "7\" + Digital Collector Edition", qty: bundleQty, unit: c.prices.bundle },
    { label: c.buy.signedName, sub: undefined as string | undefined, qty: signedQty, unit: c.prices.signed },
    { label: "Gift of Hope (donation)", sub: undefined as string | undefined, qty: boxQty, unit: giftAmount },
  ].filter((l) => l.qty > 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unit, 0);

  return (
    <div data-testid="step-pay">
      <h1 className="text-white text-[28px] font-bold tracking-[-0.02em] mb-1">Almost there</h1>
      <p className="text-white/60 text-[13.5px] mb-6">
        Sign in to lock in your GoodDeed® number and complete your order.
      </p>

      <div className="rounded-2xl p-5" style={{ background: PANEL }}>
        <div className="text-white/55 text-[11px] font-bold uppercase tracking-[0.12em] mb-3">
          Your order
        </div>
        <div className="flex flex-col gap-3">
          {lines.map((l) => (
            <div key={l.label} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-white text-[14px]">{l.label}</span>
                {l.sub && <div className="text-white/45 text-[12px] mt-0.5">{l.sub}</div>}
                {l.qty > 1 && (
                  <div className="text-white/45 text-[12px] tabular-nums mt-0.5">
                    {usd(l.unit)} × {l.qty}
                  </div>
                )}
              </div>
              <span className="flex-shrink-0 text-white text-[14px] font-semibold tabular-nums">
                {usd(l.unit * l.qty)}
              </span>
            </div>
          ))}
        </div>
        <div className="h-px bg-white/10 my-4" />
        <div className="flex items-center justify-between">
          <span className="text-white/75 text-[14px] font-semibold">Subtotal</span>
          <span className="text-white text-[17px] font-bold tabular-nums" data-testid="text-subtotal">
            {usd(subtotal)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-white/55 text-[12.5px] mt-3">
          <Lock className="w-3.5 h-3.5" strokeWidth={2} />
          Shipping &amp; sales tax calculated at checkout.
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          disabled
          className="h-12 rounded-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold bg-white text-black opacity-40 cursor-not-allowed"
          data-testid="button-applepay"
        >
          <Apple className="w-5 h-5 fill-current" strokeWidth={0} />
          Pay
        </button>
        <button
          type="button"
          disabled
          className="h-12 rounded-full inline-flex items-center justify-center gap-2 text-[15px] font-semibold text-white opacity-40 cursor-not-allowed"
          style={{ background: BLUE }}
          data-testid="button-signin-pay"
        >
          Sign in &amp; pay with card
        </button>
        <p className="text-white/55 text-[12px] text-center mt-1" data-testid="text-preview-note">
          {c.previewNote}
        </p>
      </div>
    </div>
  );
}

/* ── flow shell ───────────────────────────────────────────────────── */

function CampaignFlow({
  c,
  mode,
  tracks,
  lockedTracks,
  videos,
  albumId,
}: {
  c: ReleaseContent;
  mode: "comingSoon" | "preview";
  tracks?: PreviewTrack[];
  lockedTracks?: LockedTrack[];
  videos?: PreviewVideo[];
  albumId?: string;
}) {
  const comingSoon = mode === "comingSoon";
  const canPreviewMusic = !!tracks && tracks.length > 0;
  const [step, setStep] = useState<Step>("overview");
  const [bundleQty, setBundleQty] = useState(1);
  const [signedQty, setSignedQty] = useState(0);
  const [boxQty, setBoxQty] = useState(0);
  const [giftAmount, setGiftAmount] = useState(c.gift.min);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (signedQty > bundleQty) setSignedQty(bundleQty);
  }, [bundleQty, signedQty]);

  const idx = ORDER.indexOf(step);
  const go = (s: Step) => setStep(s);

  const primary = (() => {
    if (comingSoon) return null;
    switch (step) {
      case "overview":
        return { label: "Get Hope", onClick: () => go("buy"), Icon: ChevronRight };
      case "buy":
        return { label: `Add ${bundleQty} to Bag`, onClick: () => go("give"), Icon: ShoppingBag };
      case "give":
        return { label: "Review order", onClick: () => go("pay"), Icon: ChevronRight };
      case "pay":
        return null;
    }
  })();

  return (
    <div
      className="relative w-full h-screen overflow-hidden flex items-center justify-center"
      style={{ fontFamily: "system-ui, -apple-system, 'SF Pro Text', sans-serif" }}
      data-testid="hope-offer-flow"
    >
      <AlbumBackdrop
        c={c}
        dimmed={!previewing}
        tracks={tracks}
        lockedTracks={lockedTracks}
        videos={videos}
        albumId={albumId}
        canBuy={!comingSoon}
        priceLabel={usd(c.prices.bundle)}
        onBuy={() => {
          setStep("buy");
          setPreviewing(false);
        }}
        onLearnMore={() => {
          setStep("overview");
          setPreviewing(false);
        }}
      />

      {!previewing && (
      <div
        className="relative z-10 w-[min(720px,calc(100vw-48px))] max-h-[calc(100vh-56px)] rounded-[28px] flex flex-col overflow-hidden"
        style={{
          background: CARD,
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
        data-testid="offer-modal"
      >
        {/* header: progress + identity */}
        <div className="flex items-center gap-3 px-7 pt-5">
          {!comingSoon && (
            <div className="flex items-center gap-1.5">
              {ORDER.map((s, i) => (
                <span
                  key={s}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === idx ? 22 : 7,
                    background: i <= idx ? BLUE : "rgba(255,255,255,0.18)",
                  }}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 text-white/55 text-[12px] font-medium">
            <img
              src={`${c.imageBase}/${c.images.hero}`}
              alt=""
              className="w-5 h-5 rounded-[5px] object-cover"
              draggable={false}
            />
            {c.artistName} · {c.releaseName}
          </div>
          <div className="flex-1" />
        </div>

        {/* body */}
        <div className="px-7 py-6 overflow-y-auto">
          {step === "overview" && <OverviewStep c={c} />}
          {step === "buy" && (
            <BuyStep
              c={c}
              bundleQty={bundleQty}
              onBundle={setBundleQty}
              signedQty={signedQty}
              onSigned={setSignedQty}
              onZoom={setZoomSrc}
            />
          )}
          {step === "give" && (
            <GiveStep
              c={c}
              boxQty={boxQty}
              onBox={setBoxQty}
              giftAmount={giftAmount}
              onAmount={setGiftAmount}
              onZoom={setZoomSrc}
            />
          )}
          {step === "pay" && (
            <PayStep
              c={c}
              bundleQty={bundleQty}
              signedQty={signedQty}
              boxQty={boxQty}
              giftAmount={giftAmount}
            />
          )}
        </div>

        {/* footer nav */}
        <div
          className="flex items-center gap-3 px-7 py-4"
          style={{ background: "rgba(0,0,0,0.18)" }}
        >
          {!comingSoon && idx > 0 ? (
            <button
              type="button"
              onClick={() => go(ORDER[idx - 1])}
              data-testid="button-back"
              className="h-11 pl-3 pr-5 rounded-full inline-flex items-center gap-1.5 text-white/75 hover:text-white text-[14px] font-semibold transition-colors"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
              Back
            </button>
          ) : canPreviewMusic ? (
            <button
              type="button"
              onClick={() => setPreviewing(true)}
              data-testid="button-preview-music"
              className="h-11 px-2 text-white/55 hover:text-white text-[14px] font-medium transition-colors"
            >
              Let me hear the previews
            </button>
          ) : null}

          <div className="flex-1" />

          {comingSoon ? (
            <button
              type="button"
              disabled
              data-testid="button-coming-soon"
              className="h-11 pl-6 pr-6 rounded-full inline-flex items-center gap-2 font-semibold text-[14.5px] cursor-not-allowed"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.55)" }}
            >
              {c.launchLabel}
            </button>
          ) : (
            primary && (
              <button
                type="button"
                onClick={primary.onClick}
                data-testid="button-primary"
                className="h-11 pl-6 pr-5 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14.5px] transition-all active:scale-[0.97]"
                style={{ background: BLUE }}
              >
                {primary.label}
                <primary.Icon className="w-4 h-4" strokeWidth={2.4} />
              </button>
            )
          )}
        </div>
      </div>
      )}

      {previewing && (
        <button
          type="button"
          onClick={() => setPreviewing(false)}
          data-testid="button-back-to-offer"
          className="absolute z-20 bottom-7 left-1/2 -translate-x-1/2 h-11 pl-4 pr-6 rounded-full inline-flex items-center gap-1.5 text-white font-semibold text-[14px] transition-all active:scale-[0.97]"
          style={{ background: BLUE, boxShadow: "0 12px 34px rgba(0,0,0,0.55)" }}
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2.4} />
          Back to offer
        </button>
      )}

      {zoomSrc && <Lightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </div>
  );
}

function NotFound() {
  return (
    <div
      className="w-full h-screen flex items-center justify-center text-center px-6"
      style={{ background: BG }}
      data-testid="hope-not-found"
    >
      <div className="text-white/70 text-[15px]">This preview isn't available.</div>
    </div>
  );
}

/* ── route entry points ───────────────────────────────────────────── */

// Registry key from an artist/release pair (case-insensitive). null when the
// pair points at no campaign, so the 2-segment share route can fall through to
// the album-by-slug resolver instead.
function releaseKey(artist?: string, release?: string): string | null {
  const key = `${artist ?? ""}/${release ?? ""}`.toLowerCase();
  return key in RELEASES ? key : null;
}

// True when an artist/release pair is a known campaign. Lets App.tsx decide
// between the campaign teaser and the normal share-link album page on the
// shared /:artistSlug/:albumSlug route.
export function isCampaignRelease(artist?: string, release?: string): boolean {
  return releaseKey(artist, release) !== null;
}

// Shared campaign surface. The `?k=` token on the (unguessable) share link
// decides the tier server-side:
//   • none    → locked teaser, no music ("Coming …" label, no preview button)
//   • preview → fans: 30s music previews + the campaign overview
//   • family  → family: the previews PLUS the full buy/give/pay flow
// The token never lives in the client bundle — we just forward whatever is in
// the URL and let the server resolve it.
function CampaignExperience({
  artist,
  release,
  staging = false,
}: {
  artist: string;
  release: string;
  staging?: boolean;
}) {
  const search = useSearch();
  const token = new URLSearchParams(search).get("k") ?? "";
  const key = releaseKey(artist, release);
  const { data } = useQuery<CampaignAccess>({
    queryKey: ["/api/campaign", artist, release, "access", token, staging],
    queryFn: async () => {
      const r = await fetch(
        `/api/campaign/${encodeURIComponent(artist)}/${encodeURIComponent(
          release,
        )}/access?k=${encodeURIComponent(token)}${staging ? "&staging=1" : ""}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`access ${r.status}`);
      return (await r.json()) as CampaignAccess;
    },
    enabled: !!key,
    staleTime: Infinity,
    retry: false,
  });

  if (!key) return <NotFound />;
  const tier = data?.tier ?? "none";
  const mode = tier === "family" ? "preview" : "comingSoon";
  // The server config is the source of truth for price — override the local
  // registry so every downstream price (control row, Buy sheet, totals) shows
  // the backend figure, never a hardcoded one.
  const base = RELEASES[key];
  const c = data?.prices ? { ...base, prices: data.prices } : base;
  return (
    <CampaignFlow
      c={c}
      mode={mode}
      tracks={data?.tracks}
      lockedTracks={data?.lockedTracks}
      videos={data?.videos}
      albumId={data?.albumId}
    />
  );
}

// Artist-first share link at /:artist/:release (e.g. /nightbirde/hope). This is
// the PUBLIC fan link the operator hands out at launch: 30s previews + the
// dismissable offer card with a disabled "Coming today" CTA. Buy stays off.
export function CampaignPublic({
  artist,
  release,
}: {
  artist: string;
  release: string;
}) {
  return <CampaignExperience artist={artist} release={release} />;
}

// /staging/:artist/:release — family-tier link (buy/give/pay flow turned on)
// for pricing approval before launch.
export function CampaignPreview() {
  const params = useParams<{ artist: string; release: string }>();
  return (
    <CampaignExperience artist={params.artist} release={params.release} staging />
  );
}

// /:artist/:release/staging — same family-tier link with the staging segment as
// a suffix (e.g. /nightbirde/hope/staging), the link Bill shares with family.
export function CampaignStaging() {
  const params = useParams<{ artist: string; release: string }>();
  return (
    <CampaignExperience artist={params.artist} release={params.release} staging />
  );
}
