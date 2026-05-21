import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Compass,
  Music2,
  Users,
  LifeBuoy,
  Bell,
  LogOut,
  Shuffle,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Repeat,
  Repeat1,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Mic2,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";

import albumCover from "../../../assets/albums/love-life-tragedy.png";
import nickCarter from "../../../assets/people/nick-carter.jpg";

/* ─────────────────────────────────────────────────────────────────────
   Design tokens for the Preview & Purchase desktop surface.
   ───────────────────────────────────────────────────────────────── */

export const BRAND_BG = "#00062B";
export const BRAND_BLUE = "#319ED8";
export const HEART_PINK = "#FF5470";

export const ALBUM_COVER = albumCover;
export const ARTIST_AVATAR = nickCarter;

export type Track = { n: number; title: string; duration: string };

export const TRACKS: Track[] = [
  { n: 1, title: "Made for Us", duration: "3:28" },
  { n: 2, title: "Nothing Without Your Love", duration: "3:31" },
  { n: 3, title: "Good Love", duration: "2:57" },
  { n: 4, title: "Hey Kid", duration: "3:36" },
  { n: 5, title: "Searchlight", duration: "3:46" },
  { n: 6, title: "Never Break My Heart (Not Again)", duration: "3:54" },
  { n: 7, title: "Easy (Home Version)", duration: "2:55" },
  { n: 8, title: "Storms", duration: "4:12" },
  { n: 9, title: "Cold Night", duration: "2:58" },
  { n: 10, title: "Hurts To Love You", duration: "3:47" },
  { n: 11, title: "Lighthouse", duration: "4:05" },
  { n: 12, title: "Slow Drive", duration: "3:21" },
  { n: 13, title: "Long Way Home", duration: "4:33" },
  { n: 14, title: "Signature (Outro)", duration: "2:14" },
];

export const ALBUM = {
  title: "Love Life Tragedy — Signature Edition",
  artist: "Nick Carter",
  meta: "POP · GOODTUNES RELEASE 2025",
  description:
    "Love. Life. Tragedy. And everything in between. Nick Carter's most personal album to date is finally here. 'Love Life Tragedy' is a raw, reflective collection of pop-rock anthems and heartfelt ballads, capturing the highs and heartbreaks of a life lived in the spotlight. With tracks like 'Storms', 'Made for Us', and 'Nothing Without Your Love', the Signature Edition rounds out the record with bonus material, full lyrics, and credits for every musician on every track.",
};

/* ── Sidebar ───────────────────────────────────────────────────────── */

type NavKey = "discover" | "songs" | "artists";

function NavRow({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`nav-${label.toLowerCase()}`}
      className="relative w-full h-11 pl-5 pr-3 flex items-center gap-3 rounded-lg transition-colors"
      style={{
        background: active ? "rgba(49,158,216,0.16)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.72)",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
          style={{ background: BRAND_BLUE }}
        />
      )}
      <span className="[&>svg]:w-[18px] [&>svg]:h-[18px]">{icon}</span>
      <span className="text-[14px] font-semibold tracking-[-0.005em]">{label}</span>
    </button>
  );
}

export function DesktopSidebar() {
  const [active, setActive] = useState<NavKey>("discover");
  return (
    <aside
      className="flex flex-col flex-shrink-0 h-full text-white"
      style={{ width: 220, background: BRAND_BG }}
      data-testid="desktop-sidebar"
    >
      <div className="px-5 pt-6 pb-8">
        <div className="text-white font-black leading-[0.95] tracking-tight" style={{ fontSize: 22 }}>
          Good
          <br />
          Tunes
        </div>
        <div className="text-[9px] uppercase tracking-[0.18em] text-white/45 mt-1">
          Powered by GoDeeds
        </div>
      </div>

      <nav className="px-2 flex flex-col gap-0.5">
        <NavRow
          icon={<Compass strokeWidth={1.9} />}
          label="Discover"
          active={active === "discover"}
          onClick={() => setActive("discover")}
        />
        <NavRow
          icon={<Music2 strokeWidth={1.9} />}
          label="Songs"
          active={active === "songs"}
          onClick={() => setActive("songs")}
        />
        <NavRow
          icon={<Users strokeWidth={1.9} />}
          label="Artists"
          active={active === "artists"}
          onClick={() => setActive("artists")}
        />
      </nav>

      <div className="mx-5 my-6 h-px bg-white/8" />

      <nav className="px-2 flex flex-col gap-0.5">
        <NavRow icon={<LifeBuoy strokeWidth={1.9} />} label="Support" />
        <NavRow icon={<Bell strokeWidth={1.9} />} label="Notifications" />
      </nav>

      <div className="flex-1" />

      <div className="px-4 pb-6 pt-4">
        <div className="flex items-center gap-3 px-1">
          <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-white/10" aria-hidden>
            <img
              src={ARTIST_AVATAR}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: "center 18%" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white text-[13px] font-semibold truncate">Lori Graf</div>
            <div className="text-white/45 text-[11.5px] truncate">lorigraf@mail.com</div>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            data-testid="button-signout"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/8 transition-colors"
            onClick={() => console.log("[mockup] sign out")}
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ── TopNowPlayingStrip ─────────────────────────────────────────────
   Sandbox copy of the graduated primitive at
   `client/src/components/ui/AlbumTopNowPlayingStrip.tsx`. The sandbox
   alias can't reach `client/src`, so any polish needs to land in both
   places until the alias gains real cross-app reach. */

export function TopNowPlayingStrip() {
  return (
    <div
      className="flex items-center gap-3 px-6 h-14 border-b border-white/8 flex-shrink-0"
      data-testid="top-now-playing-strip"
    >
      <div className="flex items-center gap-3 min-w-0 max-w-[420px]">
        <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0 bg-white/10">
          <img src={ALBUM_COVER} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <div className="text-white text-[13px] font-semibold truncate">
            {TRACKS[0]?.title ?? "—"}
          </div>
          <div className="text-white/55 text-[11.5px] truncate">{ALBUM.artist}</div>
        </div>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        aria-label="Search"
        className="w-10 h-10 rounded-full inline-flex items-center justify-center text-white/65 hover:text-white hover:bg-white/8 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
    </div>
  );
}

/* ── Breadcrumb ─────────────────────────────────────────────────────── */

export function Breadcrumb() {
  return (
    <nav
      className="flex items-center gap-2 text-[13px]"
      aria-label="Breadcrumb"
      data-testid="breadcrumb"
    >
      <button
        type="button"
        className="text-white/55 hover:text-white transition-colors"
        onClick={() => console.log("[mockup] back to Discover")}
      >
        Discover
      </button>
      <ChevronRight className="w-3.5 h-3.5 text-white/35" strokeWidth={2.2} />
      <span className="text-white font-semibold truncate">{ALBUM.title}</span>
    </nav>
  );
}

/* ── Hero ───────────────────────────────────────────────────────────── */

export function AlbumHero() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="flex gap-8" data-testid="album-hero">
      <div
        className="rounded-2xl overflow-hidden flex-shrink-0"
        style={{
          width: 280,
          height: 280,
          boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
        }}
      >
        <img src={ALBUM_COVER} alt="" className="w-full h-full object-cover" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col pt-2">
        <button
          type="button"
          onClick={() => console.log("[mockup] open artist")}
          data-testid="link-artist"
          className="group inline-flex items-center gap-2 self-start mb-3"
        >
          <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
            <img
              src={ARTIST_AVATAR}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: "center 18%" }}
            />
          </div>
          <span
            className="text-white text-[13.5px] font-semibold tracking-[-0.005em] transition-colors group-hover:underline underline-offset-4"
            style={{ textDecorationColor: BRAND_BLUE }}
          >
            <span className="group-hover:text-[#319ED8] transition-colors">{ALBUM.artist}</span>
          </span>
        </button>

        <h1
          className="text-white font-bold tracking-[-0.015em] leading-[1.05]"
          style={{ fontSize: 40 }}
          data-testid="album-title"
        >
          {ALBUM.title}
        </h1>

        <div
          className="mt-3 text-white/55 text-[11.5px] font-semibold uppercase tracking-[0.14em]"
          data-testid="album-meta"
        >
          {ALBUM.meta}
        </div>

        <p
          className={
            "mt-4 text-white/72 text-[14px] leading-[1.55] max-w-[640px] " +
            (expanded ? "" : "line-clamp-3")
          }
          data-testid="album-description"
        >
          {ALBUM.description}
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ml-1 text-white/85 font-semibold hover:underline"
            >
              …more
            </button>
          )}
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => console.log("[mockup] play album")}
            data-testid="button-play-album"
            className="h-11 pl-5 pr-7 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14px] transition-colors active:scale-[0.97]"
            style={{ background: BRAND_BLUE }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background = "#3FA8DD")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.background = BRAND_BLUE)
            }
          >
            <Play className="w-4 h-4 fill-current" strokeWidth={0} />
            Play
          </button>
          <button
            type="button"
            onClick={() => console.log("[mockup] buy bundle")}
            data-testid="button-buy-bundle"
            className="h-11 pl-5 pr-4 rounded-full inline-flex items-center gap-2 text-white font-semibold text-[14px] border border-white/85 hover:bg-white hover:text-[#00062B] transition-colors active:scale-[0.97]"
          >
            Buy Bundle
            <ChevronRight className="w-4 h-4" strokeWidth={2.2} />
          </button>

          <div className="flex-1" />

          <button
            type="button"
            aria-label="More options"
            data-testid="button-album-more"
            onClick={() => console.log("[mockup] album overflow")}
            className="w-11 h-11 rounded-full inline-flex items-center justify-center text-white/70 hover:text-white hover:bg-white/8 transition-colors active:scale-[0.94]"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ── Tabs + track list ─────────────────────────────────────────────── */

export type TabKey = "music" | "video" | "photos";

export function HeroTabs({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (next: TabKey) => void;
}) {
  const items: { key: TabKey; label: string }[] = [
    { key: "music", label: "Music" },
    { key: "video", label: "Video" },
    { key: "photos", label: "Photos" },
  ];
  return (
    <div
      className="w-full flex items-center justify-center gap-10"
      role="tablist"
      data-testid="hero-tabs"
    >
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={`tab-${it.key}`}
            onClick={() => onChange(it.key)}
            className="relative h-11 px-2 inline-flex items-center text-[15px] font-semibold transition-colors"
            style={{ color: on ? "#fff" : "rgba(255,255,255,0.5)" }}
          >
            {it.label}
            <span
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 bottom-1 w-7 h-[2.5px] rounded-full transition-opacity"
              style={{ background: BRAND_BLUE, opacity: on ? 1 : 0 }}
            />
          </button>
        );
      })}
    </div>
  );
}

export function TrackRow({ track }: { track: Track }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="group flex items-center gap-4 h-12 px-4 rounded-xl transition-colors"
      style={{ background: hover ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`row-track-${track.n}`}
    >
      <div className="w-6 text-white/50 text-[13px] text-right tabular-nums">
        {track.n}.
      </div>
      <div className="flex-1 min-w-0 text-white text-[14px] font-medium truncate">
        {track.title}
      </div>
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55 transition-opacity"
        style={{ opacity: hover ? 1 : 0 }}
        aria-hidden
      >
        Preview · 30s
      </div>
      <div className="text-white/55 text-[13px] tabular-nums w-12 text-right">
        {track.duration}
      </div>
      <button
        type="button"
        aria-label={`More options for ${track.title}`}
        data-testid={`button-track-more-${track.n}`}
        onClick={() => console.log(`[mockup] track menu: ${track.title}`)}
        className="w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/8 transition-colors active:scale-[0.94]"
      >
        <MoreHorizontal className="w-[18px] h-[18px]" strokeWidth={2} />
      </button>
    </div>
  );
}

export function TabPlaceholder({ kind }: { kind: "video" | "photos" }) {
  return (
    <div
      className="w-full rounded-2xl flex items-center justify-center text-white/45 text-[14px]"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px dashed rgba(255,255,255,0.12)",
        minHeight: 220,
      }}
      data-testid={`placeholder-${kind}`}
    >
      Coming soon — {kind} will appear here
    </div>
  );
}

/* ── Floating PlayerDock ─────────────────────────────────────────────
   Lifted as-is from the admin Tracks-tab `BottomDock`
   (`artifacts/mockup-sandbox/src/components/mockups/admin-tracks-mode/Seamless.tsx`)
   so the consumer Preview & Purchase page uses the exact same primitive
   the admin surface uses. Per replit.md, this dock is intended to drive
   the consumer player; we keep behavior identical here and let the
   primitive eventually graduate into `client/src/components/ui/PlayerDock.tsx`.

   Differences vs. the admin copy:
   • Mounted with `position: fixed` so it floats above the page chrome
     regardless of scroll position (admin scopes it to a relative panel).
   • Cover thumbnail uses the real album art instead of the gradient
     placeholder, since this surface already knows what's playing.
   • Demo viewport (Wide/Compact) override removed — Bill asked for a
     copy "as-is" in feel, not the developer-only viewport toggle.
   • Dock starts EXPANDED (`dockHidden = false`) because on the fan page
     the dock IS the player; hiding it by default doesn't make sense.
   ───────────────────────────────────────────────────────────────── */

export function FloatingPlayerDock() {
  const current = TRACKS[1]; // Nothing Without Your Love
  const [playing, setPlaying] = useState(true);
  const progress = 42;

  const [volumeMuted, setVolumeMuted] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(65);

  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");

  const [scrubHover, setScrubHover] = useState(false);
  const [dockHidden, setDockHidden] = useState(false);

  const initialTrackRef = useRef<number>(current.n);
  useEffect(() => {
    if (current.n === initialTrackRef.current) return;
    initialTrackRef.current = current.n;
    setDockHidden(false);
  }, [current.n]);

  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const compact = windowWidth < 1100;

  const cycleRepeat = () =>
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  const VolumeIcon =
    volumeMuted || volumeLevel === 0
      ? VolumeX
      : volumeLevel < 15
      ? Volume
      : volumeLevel < 65
      ? Volume1
      : Volume2;

  const handleVolumeRail = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
    );
    setVolumeLevel(Math.round(pct));
    if (volumeMuted) setVolumeMuted(false);
  };

  const totalSeconds = 211; // 3:31 — Nothing Without Your Love
  const elapsedSeconds = Math.floor((progress / 100) * totalSeconds);
  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const knobLeft = (pct: number) =>
    `calc(${Math.max(0, Math.min(100, pct))}% - 5px)`;

  const onTogglePlay = () => setPlaying((p) => !p);

  if (dockHidden) {
    return (
      <div className="fixed right-4 bottom-4 z-30">
        <div className="rounded-full bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 flex items-center gap-1 pl-3 pr-2 py-2">
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0">
            <img src={ALBUM_COVER} alt="" className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-white hover:bg-white/10 transition-colors"
          >
            {playing ? (
              <Pause className="w-[18px] h-[18px] fill-current" />
            ) : (
              <Play className="w-[18px] h-[18px] ml-0.5 fill-current" />
            )}
          </button>
          <button
            type="button"
            aria-label="Show player"
            title="Show player"
            onClick={() => setDockHidden(false)}
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
          >
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "fixed bottom-4 z-30",
        compact ? "left-2 right-2" : "left-1/2 -translate-x-1/2",
      ].join(" ")}
      style={!compact ? { width: "min(760px, calc(100vw - 32px))" } : undefined}
      data-testid="floating-player-dock"
    >
      <div className="relative bg-slate-900/95 backdrop-blur-md text-white shadow-2xl ring-1 ring-white/10 overflow-hidden rounded-full">
        <div className="flex items-center gap-1.5 px-3 py-4">
          {/* LEFT · transport */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              aria-label="Shuffle"
              aria-pressed={shuffleOn}
              title={shuffleOn ? "Shuffle on" : "Shuffle off"}
              onClick={() => setShuffleOn((s) => !s)}
              className={[
                "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
                shuffleOn
                  ? "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20"
                  : "text-slate-300 hover:text-white hover:bg-white/10",
              ].join(" ")}
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => console.log("[mockup] prev")}
              aria-label="Previous track"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <SkipBack className="w-[18px] h-[18px] fill-current" />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="w-11 h-11 rounded-full inline-flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            >
              {playing ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-7 h-7 translate-x-[1.5px] fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => console.log("[mockup] next")}
              aria-label="Next track"
              className="w-9 h-9 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <SkipForward className="w-[18px] h-[18px] fill-current" />
            </button>
            <button
              type="button"
              aria-label={
                repeatMode === "off"
                  ? "Repeat off"
                  : repeatMode === "all"
                  ? "Repeat all"
                  : "Repeat one"
              }
              title={
                repeatMode === "off"
                  ? "Repeat off"
                  : repeatMode === "all"
                  ? "Repeat all"
                  : "Repeat one"
              }
              onClick={cycleRepeat}
              className={[
                "w-9 h-9 rounded-full inline-flex items-center justify-center transition-colors",
                repeatMode === "off"
                  ? "text-slate-300 hover:text-white hover:bg-white/10"
                  : "text-[#319ED8] bg-[#319ED8]/15 hover:bg-[#319ED8]/20",
              ].join(" ")}
            >
              <RepeatIcon className="w-4 h-4" />
            </button>
          </div>

          <span className="mx-2 h-6 w-px bg-white/10 flex-shrink-0" aria-hidden />

          {/* CENTER · track info */}
          <div
            className={[
              "flex items-center gap-3 min-w-0 flex-1 transition-[filter,opacity] duration-150",
              scrubHover ? "blur-[6px] opacity-50" : "",
            ].join(" ")}
            aria-hidden={scrubHover}
          >
            <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
              <img src={ALBUM_COVER} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate leading-tight">
                {current.title}
              </div>
              <div className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                Nick Carter — Love Life Tragedy
              </div>
            </div>
          </div>

          {/* RIGHT · utility cluster */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              aria-label="Show lyrics"
              title="Show lyrics"
              className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <Mic2 className="w-5 h-5" />
            </button>
            {!compact && (
              <div className="group/vol flex items-center pr-0.5">
                <div className="overflow-hidden transition-[width,margin] duration-200 ease-out w-0 group-hover/vol:w-[68px] group-hover/vol:mr-1.5">
                  <div
                    className="relative w-16 h-[3px] bg-white/15 rounded-full cursor-pointer"
                    onClick={handleVolumeRail}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-white rounded-full transition-[width] duration-150"
                      style={{ width: volumeMuted ? "0%" : `${volumeLevel}%` }}
                    />
                    {!volumeMuted && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow ring-1 ring-black/10"
                        style={{ left: knobLeft(volumeLevel) }}
                        aria-hidden
                      />
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={volumeMuted ? "Unmute" : "Mute"}
                  title={volumeMuted ? "Unmute" : "Mute"}
                  onClick={() => setVolumeMuted((v) => !v)}
                  className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
                >
                  <VolumeIcon className="w-5 h-5" />
                </button>
              </div>
            )}

            <button
              type="button"
              aria-label="Minimize player"
              title="Minimize player"
              onClick={() => setDockHidden(true)}
              className="w-10 h-10 rounded-full inline-flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inset progress bar (wide only) */}
        {!compact && (
          <>
            <div
              className={[
                "absolute left-[228px] right-[164px] inset-y-0 flex items-center justify-between pointer-events-none z-10",
                "transition-opacity duration-150",
                scrubHover ? "opacity-100" : "opacity-0",
              ].join(" ")}
            >
              <span className="text-[13px] tabular-nums text-slate-300 whitespace-nowrap">
                {fmt(elapsedSeconds)}
              </span>
              <span className="text-[13px] tabular-nums text-slate-300 whitespace-nowrap">
                −{fmt(totalSeconds - elapsedSeconds)}
              </span>
            </div>

            <div
              className="group/scrub absolute left-[228px] right-[164px] bottom-1.5 h-3 flex items-center cursor-pointer"
              onMouseEnter={() => setScrubHover(true)}
              onMouseLeave={() => setScrubHover(false)}
            >
              <div className="relative flex-1 h-[2px] rounded-full bg-white/15 transition-[height,background-color] duration-100 group-hover/scrub:h-[4px] group-hover/scrub:bg-white/25 group-active/scrub:h-[5px] group-active/scrub:bg-white/40">
                <div
                  className="absolute inset-y-0 left-0 bg-white rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
