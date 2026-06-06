import { useEffect, useRef, useState } from "react";
  import Hls from "hls.js";
  import { Lock } from "lucide-react";
  import { track } from "@/lib/analytics";
  import { BonusPlayBadge } from "@/components/ui/BonusPlayBadge";

  /**
   * Shared fan-facing bonus-video player.
   *
   * One real tap-to-play HLS player consumed by BOTH fan surfaces — the
   * mobile `AlbumDetail` bonus stack and the desktop `DesktopAlbumView`
   * Music-Videos lightbox — so playback, watch analytics, and the
   * still-encoding retry behavior can't drift between them.
   */
  
export interface BonusVideo {
  id: string;
  albumId: string;
  title: string;
  // Fans never receive the raw source URL — GET /api/albums/:id/videos
  // strips it for non-admins so the master never leaves as a file. Stays
  // optional here because only the admin payload carries it.
  videoUrl?: string;
  posterUrl: string | null;
  position: number;
  // Mux pipeline — bonus videos stream as signed adaptive HLS, never the
  // raw object-storage MP4. `muxStatus`: null | "preparing" | "ready" |
  // "errored". The fan payload exposes only muxPlaybackId/muxStatus.
  muxPlaybackId?: string | null;
  muxStatus?: string | null;
}

// Bonus-video tile. Fans stream Mux signed adaptive HLS (hls.js drives
// MSE on Chrome/Firefox, native HLS on Safari/iOS) — we never fall back
// to the raw object-storage MP4, so the original upload never leaves as a
// downloadable file. Until Mux finishes encoding (the legacy cohort that
// pre-dates this pipeline ingests lazily on first view) the tile shows a
// "Preparing this video…" state instead of going blank. Tap-to-play so
// we only mint a signed URL (and only start watch analytics) on intent.
// Backoff schedule (ms) for auto-retrying a still-encoding bonus video.
// Capped + bounded: a freshly-uploaded clip usually finishes encoding a few
// seconds after upload, so we poll the playback-url endpoint a handful of
// times before falling back to the manual "tap to retry" affordance. Tests
// inject a zero-delay schedule via the `retryDelaysMs` prop.
const BONUS_VIDEO_RETRY_DELAYS_MS = [2000, 4000, 8000];

export function BonusVideoPlayer({
  video,
  locked = false,
  retryDelaysMs = BONUS_VIDEO_RETRY_DELAYS_MS,
  autoStart = false,
}: {
  video: BonusVideo;
  locked?: boolean;
  // Test seam: override the auto-retry backoff schedule so jsdom tests can
  // exercise recovery + give-up without waiting real seconds.
  retryDelaysMs?: number[];
  // Desktop reuses this player inside a click-to-open modal: the fan already
  // tapped the card to express play intent, so the modal asks the player to
  // start immediately rather than making them tap the badge a second time.
  // Off by default so the mobile inline tile (and its tests) keep their
  // tap-to-play contract.
  autoStart?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  // "unavailable" is terminal: the server told us this row has no playable
  // source and no in-flight ingest, so there's nothing to retry. We stop the
  // auto-retry backoff and show an honest "Video unavailable" treatment
  // instead of looping on "Preparing… tap to retry" forever.
  const [phase, setPhase] = useState<
    "idle" | "loading" | "active" | "preparing" | "error" | "unavailable"
  >("idle");

  // Watch-through analytics — fire once per quartile, mirroring the audio
  // play funnel. Refs (not state) so the high-frequency timeupdate handler
  // never triggers re-renders.
  const startedRef = useRef(false);
  const milestonesRef = useRef<Set<number>>(new Set());
  const lastTimeRef = useRef(0);

  // Auto-retry bookkeeping. `retryCountRef` is the number of auto-retries
  // already scheduled this attempt (reset on a manual tap); `retryTimerRef`
  // holds the pending backoff timer so we can cancel it on a manual tap or
  // unmount.
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const teardown = () => {
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch { /* noop */ }
      hlsRef.current = null;
    }
  };
  useEffect(() => () => { teardown(); clearRetryTimer(); }, []);

  // Desktop click-to-open modal: kick off playback as soon as the player
  // mounts (the card click was the play intent). Mobile leaves autoStart off
  // so its inline tile keeps tap-to-play. Runs once on mount.
  useEffect(() => {
    if (autoStart && !locked) void startPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attach = (url: string) => {
    const el = videoRef.current;
    if (!el) return;
    const isHls = /\.m3u8(\?|$)/i.test(url);
    if (isHls && !el.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
      teardown();
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data?.fatal) {
          console.error("[bonus-video] hls fatal", data.type, data.details);
          setPhase("error");
        }
      });
      hls.loadSource(url);
      hls.attachMedia(el);
    } else {
      el.src = url;
      el.load();
    }
  };

  const startPlayback = async (opts?: { auto?: boolean }) => {
    if (locked || phase === "loading" || phase === "active") return;
    // A manual tap (anything that isn't a scheduled auto-retry) cancels any
    // pending backoff and refreshes the retry budget, so the fan always gets
    // a fresh round of attempts on intent.
    if (!opts?.auto) {
      clearRetryTimer();
      retryCountRef.current = 0;
    }
    setPhase("loading");
    try {
      const r = await fetch(`/api/album-videos/${video.id}/playback-url`, {
        method: "POST",
        credentials: "include",
      });
      if (r.status === 409 || r.status === 503) {
        // The server distinguishes a still-encoding row (retryable) from a
        // sourceless/unrecoverable one (terminal) via the body `status`.
        let body: { status?: string } | null = null;
        try { body = await r.json(); } catch { /* no JSON body */ }
        if (body?.status === "unavailable") {
          // Nothing to play and nothing in flight — stop retrying and show
          // the honest terminal state.
          clearRetryTimer();
          retryCountRef.current = 0;
          setPhase("unavailable");
          return;
        }
        // Not ready yet (still encoding / lazy-ingest just kicked off). Show
        // the preparing caption and quietly auto-retry with backoff a bounded
        // number of times before leaving the fan with the manual retry tap.
        setPhase("preparing");
        if (retryCountRef.current < retryDelaysMs.length) {
          const delay = retryDelaysMs[retryCountRef.current];
          retryCountRef.current += 1;
          clearRetryTimer();
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            void startPlayback({ auto: true });
          }, delay);
        }
        return;
      }
      if (!r.ok) {
        clearRetryTimer();
        setPhase("error");
        return;
      }
      const json = (await r.json()) as { url?: string };
      if (!json?.url) {
        clearRetryTimer();
        setPhase("error");
        return;
      }
      clearRetryTimer();
      attach(json.url);
      setPhase("active");
      requestAnimationFrame(() => {
        videoRef.current?.play().catch(() => { /* user can hit the native control */ });
      });
    } catch (err) {
      console.error("[bonus-video] playback request failed", err);
      clearRetryTimer();
      setPhase("error");
    }
  };

  const refs = () => ({ albumId: video.albumId, videoId: video.id });

  const handlePlay = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const el = videoRef.current;
    track("video_play_start", {
      ...refs(),
      videoTitle: video.title,
      duration: el && Number.isFinite(el.duration) ? el.duration : undefined,
    });
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const pct = (el.currentTime / el.duration) * 100;
    for (const m of [25, 50, 75] as const) {
      if (pct >= m && !milestonesRef.current.has(m)) {
        milestonesRef.current.add(m);
        track("video_progress", { ...refs(), percent: m, at: el.currentTime, duration: el.duration });
      }
    }
    // Steady playhead position for seek-delta reporting.
    if (!el.seeking) lastTimeRef.current = el.currentTime;
  };

  const handleEnded = () => {
    const el = videoRef.current;
    track("video_complete", {
      ...refs(),
      at: el?.currentTime ?? 0,
      duration: el && Number.isFinite(el.duration) ? el.duration : 0,
    });
  };

  const handlePause = () => {
    const el = videoRef.current;
    if (!el || el.ended) return;
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    track("video_pause", {
      ...refs(),
      at: el.currentTime,
      duration,
      percent: duration > 0 ? Math.round((el.currentTime / duration) * 100) : 0,
    });
  };

  const handleSeeked = () => {
    const el = videoRef.current;
    if (!el) return;
    const from = lastTimeRef.current;
    const to = el.currentTime;
    lastTimeRef.current = to;
    if (Math.abs(to - from) < 0.5) return;
    track("video_seek", {
      ...refs(),
      from,
      to,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
    });
  };

  if (locked) {
    return (
      <div
        className="relative rounded-lg overflow-hidden bg-black/40"
        style={{ aspectRatio: "16 / 9" }}
        data-locked="true"
        data-testid={`video-album-bonus-locked-${video.id}`}
      >
        {video.posterUrl ? (
          <img
            src={video.posterUrl}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
            style={{
              filter: "brightness(0.55) saturate(0.85) blur(16px)",
              transform: "scale(1.2)",
            }}
          />
        ) : (
          <div className="w-full h-full bg-black/60" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
            <Lock className="w-4 h-4 text-fan-primary" strokeWidth={2.2} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-black/40"
      style={{ aspectRatio: "16 / 9" }}
    >
      {/* The <video> is always mounted (hls.js needs the element to attach
          to) but stays empty + hidden until the fan taps play and we have
          a signed URL. */}
      <video
        ref={videoRef}
        poster={video.posterUrl ?? undefined}
        controls={phase === "active"}
        playsInline
        preload="none"
        className="w-full h-full object-cover"
        style={{ display: phase === "active" ? "block" : "none" }}
        onPlay={handlePlay}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPause={handlePause}
        onSeeked={handleSeeked}
        onError={() => setPhase("error")}
        data-testid={`video-album-bonus-${video.id}`}
      />

      {phase !== "active" && (
        <>
          {video.posterUrl ? (
            <img src={video.posterUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-black/60" />
          )}
          {/* Central control is always live while not playing — in the
              "preparing"/"error" states it doubles as a retry so a fan
              whose lazy-ingest just kicked off can tap again instead of
              being stuck until reload. The terminal "unavailable" state has
              nothing to retry, so we drop the badge entirely and show only
              the honest caption below. */}
          {phase !== "unavailable" && (
            <button
              type="button"
              onClick={() => startPlayback()}
              disabled={phase === "loading"}
              className="absolute inset-0 flex items-center justify-center"
              aria-label={phase === "preparing" || phase === "error" ? `Retry ${video.title}` : `Play ${video.title}`}
              data-testid={`button-play-album-bonus-${video.id}`}
            >
              <BonusPlayBadge loading={phase === "loading"} />
            </button>
          )}
          {phase === "unavailable" && (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-center px-3 py-2 text-xs font-medium text-fan-primary bg-black/55 backdrop-blur-sm pointer-events-none"
              data-testid={`text-album-bonus-video-unavailable-${video.id}`}
            >
              Video unavailable
            </div>
          )}
          {phase === "preparing" && (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-center px-3 py-2 text-xs font-medium text-fan-primary bg-black/55 backdrop-blur-sm pointer-events-none"
              data-testid={`text-album-bonus-video-preparing-${video.id}`}
            >
              Preparing this video — tap to retry
            </div>
          )}
          {phase === "error" && (
            <div
              className="absolute inset-x-0 bottom-0 flex items-center justify-center px-3 py-2 text-xs font-medium text-fan-primary bg-black/55 backdrop-blur-sm pointer-events-none"
              data-testid={`text-album-bonus-video-unplayable-${video.id}`}
            >
              Couldn't play this video — tap to retry
            </div>
          )}
        </>
      )}
    </div>
  );
}

