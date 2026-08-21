import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { apiRequest, apiErrorBody } from "@/lib/queryClient";

export type AdminAudioReason =
  | { code: "no-master"; message: string }
  | { code: "encoding"; message: string }
  | { code: "mux-sign-failed"; message: string }
  | { code: "mux-errored"; message: string }
  | { code: "stream-failed"; message: string }
  | { code: "unplayable"; message: string };

// One copy table so every consumer (Preview window banner, GoodSync
// banner, play toasts) renders the SAME honest text per failure mode.
// "Still encoding" is reserved for genuine `ingesting`/`preparing`
// states — stream/decode/signing failures get their own accurate copy
// so operators aren't told to wait on an encode that already finished.
export const ADMIN_AUDIO_COPY = {
  noMaster: "Upload a master first.",
  encoding:
    "This master is still encoding — try again in a moment.",
  signFailed:
    "Mux didn't return a stream URL. Try again in a moment — refresh if it keeps happening.",
  muxErrored:
    "Mux couldn't process this master (encoding failed). Re-upload the master or retry the ingest from the track menu.",
  streamFailed:
    "The stream couldn't be loaded — Mux rejected the request. This isn't an encoding delay; check the asset and signing setup.",
  unplayable:
    "This master file can't be played directly in the browser, and no streaming copy is ready yet. It will be re-processed automatically — check the track's Mux status.",
} as const;

// Banner text shared by the Preview window + GoodSync banners: genuine
// encoding gets the "wait for Mux" phrasing; everything else renders the
// reason's own accurate message.
export function adminAudioBannerText(
  reason: AdminAudioReason,
  opts?: { encodingText?: string },
): string {
  if (reason.code === "encoding") {
    return opts?.encodingText ?? reason.message;
  }
  return reason.message;
}

export interface AdminAudioSongLike {
  id: string;
  audioUrl?: string | null;
  muxPlaybackId?: string | null;
  muxStatus?: string | null;
}

export interface AttachOptions {
  hlsRef: { current: Hls | null };
  isStale?: () => boolean;
  // Fired when hls.js hits a FATAL error after a successful attach —
  // i.e. Mux rejected/failed to serve the stream. Lets the hook surface
  // an accurate "stream failed" reason instead of silence.
  onStreamError?: (details: string) => void;
}

export type AttachResult =
  | { url: string; source: "mux" | "raw" }
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
  onStreamError?: (details: string) => void,
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
        onStreamError?.(String(data.details ?? data.type ?? "fatal"));
      }
    });
    hls.loadSource(url);
    hls.attachMedia(audio);
  } else {
    audio.src = url;
    audio.load();
  }
}

function detach(audio: HTMLAudioElement, hlsRef: { current: Hls | null }) {
  audio.pause();
  teardownHls(hlsRef);
  audio.removeAttribute("src");
  audio.load();
}

/**
 * Pick + attach the right source for an admin-side audio element. Mirrors
 * the dock's source-selection chain:
 *
 *   1. Mux HLS (signed URL, two attempts with 800ms backoff) when the asset
 *      is `ready`. hls.js drives MSE on Chrome/Firefox, native HLS on
 *      Safari/iOS.
 *   2. If the CLIENT's data says Mux is still encoding (`ingesting`/
 *      `preparing`), don't trust it blindly — the album payload can be
 *      stale. Probe the playback-url route: a 200 means the server already
 *      flipped to `ready`, so attach + self-heal without a refresh. Only a
 *      server-confirmed `ingesting`/`preparing` renders the "encoding"
 *      reason; a server-side `errored` gets its own accurate copy.
 *   3. Progressive `audioUrl` fallback otherwise.
 *
 * Returns `{ url, source }` on success or `{ reason }` if nothing could be
 * attached.
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
        message: ADMIN_AUDIO_COPY.noMaster,
      },
    };
  }

  const trySign = async () => {
    const r = await apiRequest(
      "POST",
      `/api/songs/${song.id}/playback-url`,
    );
    const json = (await r.json()) as { url?: string; message?: string };
    if (!json?.url) throw new Error(json?.message || "no url");
    return json.url;
  };

  if (useMux) {
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
            message: ADMIN_AUDIO_COPY.signFailed,
          },
        };
      }
    }
    if (opts.isStale?.()) {
      return { reason: { code: "mux-sign-failed", message: "stale" } };
    }
    attachUrl(audio, url, opts.hlsRef, opts.onStreamError);
    return { url, source: "mux" };
  }

  if (muxEncoding) {
    // Self-heal: the album payload can lag behind the server (webhook
    // landed after our fetch). Ask the playback-url route directly — a
    // 200 means the asset is actually ready, so attach it instead of
    // showing a stale "encoding" banner that survives until a refetch.
    try {
      const url = await trySign();
      if (opts.isStale?.()) {
        return { reason: { code: "mux-sign-failed", message: "stale" } };
      }
      attachUrl(audio, url, opts.hlsRef, opts.onStreamError);
      return { url, source: "mux" };
    } catch (err) {
      if (opts.isStale?.()) {
        return { reason: { code: "mux-sign-failed", message: "stale" } };
      }
      const body = apiErrorBody<{ status?: string | null }>(err);
      const serverStatus = body?.status ?? null;
      detach(audio, opts.hlsRef);
      if (serverStatus === "errored") {
        return {
          reason: {
            code: "mux-errored",
            message: ADMIN_AUDIO_COPY.muxErrored,
          },
        };
      }
      // "Still encoding" ONLY when the server explicitly confirms an
      // in-progress state. Any other probe failure (500 signing
      // outage, 401/403, network error, 409 not_ingested, …) gets a
      // distinct non-encoding reason — never the encoding excuse.
      if (serverStatus === "ingesting" || serverStatus === "preparing") {
        return {
          reason: {
            code: "encoding",
            message: ADMIN_AUDIO_COPY.encoding,
          },
        };
      }
      return {
        reason: {
          code: "mux-sign-failed",
          message: ADMIN_AUDIO_COPY.signFailed,
        },
      };
    }
  }

  if (song.audioUrl) {
    attachUrl(audio, song.audioUrl, opts.hlsRef, opts.onStreamError);
    return { url: song.audioUrl, source: "raw" };
  }

  return {
    reason: { code: "no-master", message: ADMIN_AUDIO_COPY.noMaster },
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
  // Which leg is currently attached — lets the media-error handler
  // label the failure accurately (Mux stream rejection vs a raw master
  // the browser can't decode) instead of a blanket "still encoding".
  const sourceRef = useRef<"mux" | "raw" | null>(null);
  const [reason, setReason] = useState<AdminAudioReason | null>(null);
  const [attached, setAttached] = useState(false);

  useEffect(() => {
    if (!audio) {
      setAttached(false);
      return;
    }
    const epoch = ++epochRef.current;
    sourceRef.current = null;
    setReason(null);
    setAttached(false);

    // The raw master fallback fires this when the browser can't decode
    // the bytes (24-bit WAV, AIFF, some FLACs) — surface it as an
    // accurate "unplayable" reason. When the MUX leg was attached, the
    // same media error means the stream itself was rejected (signing/
    // asset issue), which gets its own copy — it is NOT an encoding
    // delay.
    const onError = () => {
      if (epoch !== epochRef.current) return;
      const err = audio.error;
      if (!err) return;
      if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setReason(
          sourceRef.current === "mux"
            ? {
                code: "stream-failed",
                message: ADMIN_AUDIO_COPY.streamFailed,
              }
            : {
                code: "unplayable",
                message: ADMIN_AUDIO_COPY.unplayable,
              },
        );
        setAttached(false);
      }
    };
    audio.addEventListener("error", onError);

    let cancelled = false;
    (async () => {
      const res = await attachAdminAudio(audio, song, {
        hlsRef,
        isStale: () => epoch !== epochRef.current,
        onStreamError: () => {
          if (cancelled || epoch !== epochRef.current) return;
          setReason({
            code: "stream-failed",
            message: ADMIN_AUDIO_COPY.streamFailed,
          });
          setAttached(false);
        },
      });
      if (cancelled || epoch !== epochRef.current) return;
      if ("reason" in res) {
        // Don't overwrite an `unplayable` set by the error handler
        // with a "stale" placeholder.
        if (res.reason.message !== "stale") setReason(res.reason);
        setAttached(false);
      } else {
        sourceRef.current = res.source;
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
