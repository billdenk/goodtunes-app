import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { apiRequest } from "@/lib/queryClient";

export type AdminAudioReason =
  | { code: "no-master"; message: string }
  | { code: "encoding"; message: string }
  | { code: "mux-sign-failed"; message: string }
  | { code: "unplayable"; message: string };

export interface AdminAudioSongLike {
  id: string;
  audioUrl?: string | null;
  muxPlaybackId?: string | null;
  muxStatus?: string | null;
}

export interface AttachOptions {
  hlsRef: { current: Hls | null };
  isStale?: () => boolean;
}

export type AttachResult =
  | { url: string }
  | { reason: AdminAudioReason };

function teardownHls(hlsRef: { current: Hls | null }) {
  if (hlsRef.current) {
    try {
      hlsRef.current.destroy();
    } catch {
      /* noop */
    }
    hlsRef.current = null;
  }
}

function attachUrl(
  audio: HTMLAudioElement,
  url: string,
  hlsRef: { current: Hls | null },
) {
  teardownHls(hlsRef);
  const isHls = /\.m3u8(\?|$)/i.test(url);
  if (
    isHls &&
    Hls.isSupported() &&
    !audio.canPlayType("application/vnd.apple.mpegurl")
  ) {
    const hls = new Hls({ enableWorker: true });
    hlsRef.current = hls;
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data?.fatal) {
        console.error("[admin-audio] hls fatal", data.type, data.details);
      }
    });
    hls.loadSource(url);
    hls.attachMedia(audio);
  } else {
    audio.src = url;
    audio.load();
  }
}

/**
 * Pick + attach the right source for an admin-side audio element. Mirrors
 * the dock's source-selection chain:
 *
 *   1. Mux HLS (signed URL, two attempts with 800ms backoff) when the asset
 *      is `ready`. hls.js drives MSE on Chrome/Firefox, native HLS on
 *      Safari/iOS.
 *   2. If Mux is still encoding (`ingesting`/`preparing`), don't fall
 *      through to the raw master — Replit's edge 500s on large WAVs.
 *      Surface an "encoding" reason so the caller can show a spinner/note.
 *   3. Progressive `audioUrl` fallback otherwise.
 *
 * Returns `{ url }` on success or `{ reason }` if nothing could be attached.
 */
export async function attachAdminAudio(
  audio: HTMLAudioElement,
  song: AdminAudioSongLike,
  opts: AttachOptions,
): Promise<AttachResult> {
  const useMux =
    !!song.muxPlaybackId && song.muxStatus === "ready";
  const muxEncoding =
    song.muxStatus === "ingesting" || song.muxStatus === "preparing";

  if (!song.audioUrl && !song.muxPlaybackId) {
    teardownHls(opts.hlsRef);
    return {
      reason: {
        code: "no-master",
        message: "Upload a master first.",
      },
    };
  }

  if (useMux) {
    const trySign = async () => {
      const r = await apiRequest(
        "POST",
        `/api/songs/${song.id}/playback-url`,
      );
      const json = (await r.json()) as { url?: string; message?: string };
      if (!json?.url) throw new Error(json?.message || "no url");
      return json.url;
    };
    let url: string;
    try {
      url = await trySign();
    } catch (firstErr) {
      console.warn(
        "[admin-audio] Mux sign attempt 1 failed; retrying",
        firstErr,
      );
      if (opts.isStale?.()) {
        return {
          reason: { code: "mux-sign-failed", message: "stale" },
        };
      }
      await new Promise((res) => setTimeout(res, 800));
      if (opts.isStale?.()) {
        return {
          reason: { code: "mux-sign-failed", message: "stale" },
        };
      }
      try {
        url = await trySign();
      } catch (e) {
        console.error("[admin-audio] Mux signing failed after retry", e);
        return {
          reason: {
            code: "mux-sign-failed",
            message:
              "Mux didn't return a stream URL. Try again in a moment — refresh if it keeps happening.",
          },
        };
      }
    }
    if (opts.isStale?.()) {
      return { reason: { code: "mux-sign-failed", message: "stale" } };
    }
    attachUrl(audio, url, opts.hlsRef);
    return { url };
  }

  if (muxEncoding) {
    audio.pause();
    teardownHls(opts.hlsRef);
    audio.removeAttribute("src");
    audio.load();
    return {
      reason: {
        code: "encoding",
        message:
          "This master is still encoding — try again in a moment.",
      },
    };
  }

  if (song.audioUrl) {
    attachUrl(audio, song.audioUrl, opts.hlsRef);
    return { url: song.audioUrl };
  }

  return {
    reason: { code: "no-master", message: "Upload a master first." },
  };
}

/**
 * Editor-scoped wrapper around `attachAdminAudio`. Owns the audio
 * element via a callback ref (`setAudio`), tears down hls.js on
 * unmount, and exposes a `reason` so editors (Preview window,
 * GoodSync sheet) can render an inline "why this can't play"
 * message instead of a destructive toast.
 *
 * Why a callback ref? GoodSync mounts/unmounts its <audio> when the
 * cue panel switches modes — a plain useRef goes stale silently. The
 * callback ref drives a state value that the attach effect keys on,
 * so any remount auto-rewires. Same pattern the original GoodSync
 * code arrived at (see comment block at the original `setAudio`).
 */
export function useAdminTrackAudioSource(song: AdminAudioSongLike): {
  setAudio: (el: HTMLAudioElement | null) => void;
  audio: HTMLAudioElement | null;
  reason: AdminAudioReason | null;
  attached: boolean;
} {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const epochRef = useRef(0);
  const [reason, setReason] = useState<AdminAudioReason | null>(null);
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    if (!audio) {
      setAttached(false);
      return;
    }
    const epoch = ++epochRef.current;
    setReason(null);
    setAttached(false);

    // The raw master fallback fires this when the browser can't decode
    // the bytes (24-bit WAV, AIFF, some FLACs). That's the "operation
    // is not supported" case — surface it as an inline reason instead
    // of a generic decode error.
    const onError = () => {
      if (epoch !== epochRef.current) return;
      const err = audio.error;
      if (!err) return;
      if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setReason({
          code: "unplayable",
          message:
            "This master needs to finish encoding — try again in a moment.",
        });
        setAttached(false);
      }
    };
    audio.addEventListener("error", onError);

    let cancelled = false;
    (async () => {
      const res = await attachAdminAudio(audio, song, {
        hlsRef,
        isStale: () => epoch !== epochRef.current,
      });
      if (cancelled || epoch !== epochRef.current) return;
      if ("reason" in res) {
        // Don't overwrite an `unplayable` set by the error handler
        // with a "stale" placeholder.
        if (res.reason.message !== "stale") setReason(res.reason);
        setAttached(false);
      } else {
        setAttached(true);
      }
    })();

    return () => {
      cancelled = true;
      audio.removeEventListener("error", onError);
    };
  }, [
    audio,
    song.id,
    song.audioUrl,
    song.muxPlaybackId,
    song.muxStatus,
  ]);

  // Tear down hls.js when the host component unmounts.
  useEffect(() => {
    return () => {
      teardownHls(hlsRef);
    };
  }, []);

  return { setAudio, audio, reason, attached };
}
